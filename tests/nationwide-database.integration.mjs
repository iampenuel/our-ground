import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {normalizeHrsaCsv,importHrsa} from '../backend/hrsa-import.mjs';
import {resourceStateCodes} from '../shared/resource-geography.ts';
import {baseRow,csv} from './hrsa-fixtures.mjs';
import {inspectDatabase} from '../backend/db-checks.mjs';
import {PostgresRepository,closeDatabase} from '../backend/postgres.ts';

const connection=process.env.NATIONAL_TEST_DATABASE_URL;
if(!connection)throw Error('Set NATIONAL_TEST_DATABASE_URL to the explicitly disposable local ourground_7d database with the reviewed HRSA snapshot.');
const u=new URL(connection);if(!['127.0.0.1','localhost'].includes(u.hostname)||!/^\/ourground_7d[a-z0-9_]*$/.test(u.pathname))throw Error('Nationwide tests require an isolated loopback ourground_7d database.');
const db=postgres(connection,{max:1,prepare:false,ssl:false,onnotice:()=>{}});
after(async()=>{await closeDatabase();await db.end();});
const search=(sql,lat,lng,opts={})=>sql`select app_private.public_resource_search(${lat}::float8,${lng}::float8,${opts.radius??10}::float8,${opts.category===undefined?'healthcare':opts.category}::text,${opts.keyword??''}::text,${opts.page??1}::int,${opts.size??20}::int,${opts.demo??false},${opts.demoOnly??false}) as result`.then(r=>r[0].result);
const rollback=Error('ROLLBACK_SYNTHETIC_IMPORT_FIXTURE');
async function fixture(fn){try{await db.begin(async tx=>{await fn(tx,{begin:f=>f(tx)});throw rollback;});}catch(e){if(e!==rollback)throw e;}}

test('actual HRSA snapshot is imported once with public coverage in all 50 states, DC and supported territories',async()=>{
 const rows=await db`select l.state,count(*)::int as sites from app_private.resource_source_records sr join app_private.services s on s.id=sr.service_id join app_private.service_locations l on l.id=s.location_id where sr.source_id='hrsa-health-centers' group by l.state`;
 assert(rows.reduce((n,r)=>n+r.sites,0)>15000);assert.deepEqual(rows.map(r=>r.state).sort(),[...resourceStateCodes].sort());
 const [counts]=await db`select (select count(*) from app_private.resource_source_records) as records,(select count(*) from app_private.resource_source_versions) as versions,(select count(*) from app_private.resource_import_runs where completed_at is not null) as runs`;
 assert.equal(counts.records,counts.versions);assert.equal(Number(counts.runs),1);
});
test('actual restricted-role search returns real nearby HRSA sites in twelve nationwide cities',async()=>{
 const cities=[['Harrisburg',40.2732,-76.8867],['Philadelphia',39.9526,-75.1652],['San Francisco',37.7749,-122.4194],['New York',40.7128,-74.006],['Boston',42.3601,-71.0589],['Chicago',41.8781,-87.6298],['Houston',29.7604,-95.3698],['Seattle',47.6062,-122.3321],['Los Angeles',34.0522,-118.2437],['Anchorage',61.2181,-149.9003],['Honolulu',21.3099,-157.8581],['Washington DC',38.9072,-77.0369]];
 for(const [city,lat,lng]of cities)await db.begin(async tx=>{await tx`set local role our_ground_api`;const result=await search(tx,lat,lng);assert(result.total>0,city);assert(result.items.length>0,city);assert(result.items.every(r=>!r.is_demo&&r.distance_miles<=10&&r.provenance?.source_id==='hrsa-health-centers'),city);});
});
test('cross-state nearby results are relevant and ordering/pagination are deterministic',async()=>{
 const all=await search(db,39.9526,-75.1652,{radius:25,size:50});assert(all.items.some(r=>r.state==='NJ'));assert(all.items.some(r=>r.state==='PA'));
 const one=await search(db,37.7749,-122.4194,{size:5}),two=await search(db,37.7749,-122.4194,{page:2,size:5}),again=await search(db,37.7749,-122.4194,{size:5});
 assert.deepEqual(one.items.map(r=>r.id),again.items.map(r=>r.id));assert(!two.items.some(r=>one.items.some(x=>x.id===r.id)));assert.equal(one.total,two.total);
 const beyond=await search(db,37.7749,-122.4194,{page:1000,size:50});assert.equal(beyond.items.length,0);assert.equal(beyond.total,one.total);
});
test('category, keyword, distances and empty results remain separate from location resolution',async()=>{
 const all=await search(db,42.3601,-71.0589),near=await search(db,42.3601,-71.0589,{radius:1});assert(near.total<all.total);assert(near.items.every(r=>r.distance_miles<=1));
 const food=await search(db,42.3601,-71.0589,{category:'food'});assert.equal(food.total,0);
 const keyword=await search(db,42.3601,-71.0589,{keyword:'zz-no-source-match-zz'});assert.equal(keyword.total,0);
 const [distance]=await db`select extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(-71.0589,42.3601),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(-71.0589,42.3746),4326)::extensions.geography)/1609.344 as miles`;assert(Math.abs(distance.miles-1)<0.01);
});
test('geography index is selected for actual national proximity filtering',async()=>{
 const plan=await db`explain (analyze,buffers,format json) select id from app_private.service_locations where extensions.st_dwithin(point,extensions.st_setsrid(extensions.st_makepoint(-122.4194,37.7749),4326)::extensions.geography,16093.44)`;
 assert.match(JSON.stringify(plan),/service_locations_point_gix/);assert.doesNotMatch(JSON.stringify(plan),/"Node Type":"Seq Scan"/);
});
test('runtime cannot read private import tables or invoke owner-only import and maintenance operations',async()=>{
 const status=await inspectDatabase(db);assert.deepEqual(status.problems,[]);
 for(const table of ['resource_data_sources','resource_import_runs','resource_source_records','resource_source_versions'])await db.begin(async tx=>{await tx`set local role our_ground_api`;await assert.rejects(tx.savepoint(sp=>sp.unsafe('select * from app_private.'+table)));});
 await db.begin(async tx=>{await tx`set local role our_ground_api`;await assert.rejects(tx.savepoint(sp=>sp`select app_private.resource_import_batch(${randomUUID()}::uuid,'[]'::jsonb)`));const [row]=await tx`select to_jsonb(p) as safe from app_private.public_resource_provenance p limit 1`;assert.deepEqual(Object.keys(row.safe).sort(),['service_id','source_id','source_name','source_record_id','source_url','imported_at','source_updated_at','last_seen_at','verification_status'].sort());});
});
test('SQL boundary rejects unbounded queries and malformed coordinates independently of HTTP validation',async()=>{
 for(const [lat,lng,opts]of [[NaN,0,{}],[91,0,{}],[0,181,{}],[0,0,{radius:10000}],[0,0,{size:1000}],[0,0,{page:0}],[0,0,{category:'private'}]])await db.begin(async tx=>{await tx`set local role our_ground_api`;await assert.rejects(tx.savepoint(sp=>search(sp,lat,lng,opts)),/OG_VALIDATION_ERROR/);});
});
test('transactional source imports are idempotent and update changed source fields with history',async()=>fixture(async(tx,scoped)=>{
 const first=normalizeHrsaCsv(csv([baseRow]));const created=await importHrsa(scoped,first,{apply:true});assert.equal(created.created,1);assert.equal((await importHrsa(scoped,first,{apply:true})).already_imported,true);
 const changed=normalizeHrsaCsv(csv([{...baseRow,'Site Name':'Synthetic changed source title'}]));const result=await importHrsa(scoped,changed,{apply:true});assert.equal(result.updated,1);
 const [row]=await tx`select title,version,eligibility_text,cost_summary from app_private.services where id=${first.records[0].service_id}`;assert.equal(row.title,'Synthetic changed source title');assert.equal(row.version,2);assert.equal(row.eligibility_text,null);assert.equal(row.cost_summary,null);
 const [versions]=await tx`select count(*)::int as count from app_private.resource_source_versions where source_record_id=${baseRow['BPHC Assigned Number']}`;assert.equal(versions.count,2);
 const older=normalizeHrsaCsv(csv([{...baseRow,'Data Warehouse Record Create Date':'11/04/2026'}]));await assert.rejects(tx.savepoint(sp=>importHrsa({begin:f=>f(sp)},older,{apply:true})),/older than/);
 await tx`update app_private.resource_data_sources set enabled=false where id='hrsa-health-centers'`;await assert.rejects(tx.savepoint(sp=>importHrsa({begin:f=>f(sp)},changed,{apply:true})),/not explicitly enabled/);
}));
test('human-reviewed service, location and organization data are preserved during source refresh',async()=>fixture(async(tx,scoped)=>{
 const first=normalizeHrsaCsv(csv([baseRow]));await importHrsa(scoped,first,{apply:true});const id=first.records[0].service_id;
 await tx`update app_private.services set title='Human reviewed title',version=version+1 where id=${id}`;
 const next=normalizeHrsaCsv(csv([{...baseRow,'Site Name':'Conflicting later source title'}]));const result=await importHrsa(scoped,next,{apply:true});assert.equal(result.needs_review,1);
 const [row]=await tx`select title from app_private.services where id=${id}`;assert.equal(row.title,'Human reviewed title');const [p]=await tx`select verification_status from app_private.public_resource_provenance where service_id=${id}`;assert.equal(p.verification_status,'stale_or_needs_review');
}));
test('later confidential/inactive source evidence hides the public point without deleting reviewed records',async()=>fixture(async(tx,scoped)=>{
 const first=normalizeHrsaCsv(csv([baseRow]));await importHrsa(scoped,first,{apply:true});const id=first.records[0].service_id;
 const next=normalizeHrsaCsv(csv([{...baseRow,'Health Center Service Delivery Site Location Setting Description':'Domestic Violence'},{...baseRow,'BPHC Assigned Number':'BPS-H80-999991'}]));await importHrsa(scoped,next,{apply:true});
 assert.equal((await tx`select id from app_private.public_services where id=${id}`).length,0);assert.equal((await tx`select id from app_private.services where id=${id}`).length,1);
}));
test('missing full-snapshot records are marked stale rather than deleted and failed import rolls back',async()=>fixture(async(tx,scoped)=>{
 const first=normalizeHrsaCsv(csv([baseRow]));await importHrsa(scoped,first,{apply:true});const id=first.records[0].service_id;
 const next=normalizeHrsaCsv(csv([{...baseRow,'BPHC Assigned Number':'BPS-H80-999991'}]));await importHrsa(scoped,next,{apply:true,fullSnapshot:true});const [p]=await tx`select verification_status from app_private.public_resource_provenance where service_id=${id}`;assert.equal(p.verification_status,'stale_or_needs_review');
 const broken=normalizeHrsaCsv(csv([{...baseRow,'BPHC Assigned Number':'BPS-H80-999992'},{...baseRow,'BPHC Assigned Number':'BPS-H80-999993'}]));broken.records[1].service_id='11111111-1111-4111-8111-111111111111';
 await assert.rejects(tx.savepoint(sp=>importHrsa({begin:f=>f(sp)},broken,{apply:true})),/collision/);assert.equal((await tx`select id from app_private.services where id=${broken.records[0].service_id}`).length,0);
}));
test('hidden and suspended records remain inaccessible, while fictional fixtures require explicit allowance',async()=>fixture(async(tx)=>{
 const first=(await search(tx,42.3601,-71.0589)).items[0];await tx`update app_private.organizations set suspended_at=now() where id=${first.organization_id}`;
 assert(!(await search(tx,42.3601,-71.0589)).items.some(r=>r.id===first.id));assert.equal((await tx`select id from app_private.public_services where id=${first.id}`).length,0);
 const real=await search(tx,40.2732,-76.8867);assert(real.items.every(r=>!r.is_demo));const demo=await search(tx,40.2732,-76.8867,{demo:true,demoOnly:true,category:null});assert(demo.total>0);assert(demo.items.every(r=>r.is_demo));
}));
test('PostGIS keeps antimeridian neighbors together and accepts positive-longitude Alaska points',async()=>fixture(async tx=>{
 const org=randomUUID();await tx`insert into app_private.organizations(id,name,is_demo,status) values(${org},'Synthetic antimeridian regression only',true,'published')`;
 for(const lng of [179.98,-179.98]){const loc=randomUUID(),service=randomUUID();await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,is_demo,status) values(${loc},${org},'Synthetic antimeridian point','Synthetic location','AK',extensions.st_setsrid(extensions.st_makepoint(${lng},52),4326)::extensions.geography,true,'published')`;await tx`insert into app_private.services(id,organization_id,location_id,title,is_demo,status) values(${service},${org},${loc},'Synthetic antimeridian clinic',true,'published')`;await tx`insert into app_private.service_categories(service_id,category_id) select ${service},id from app_private.categories where slug='healthcare'`;}
 const result=await search(tx,52,179.99,{demo:true,demoOnly:true,radius:5});assert.equal(result.items.filter(r=>r.organization_id===org).length,2);assert(result.items.every(r=>r.distance_miles<5));
}));
test('actual restricted-role repository emits safe imported contracts and consistent detail provenance',async()=>{
 const runtime=new URL(connection);runtime.username='our_ground_api';process.env.DATABASE_URL=runtime.href;process.env.DB_SSL='disable';process.env.NODE_ENV='test';
 const repo=new PostgresRepository();const results=await repo.search({lat:37.7749,lng:-122.4194,radiusMiles:10,category:'healthcare',page:1,pageSize:20,allowDemo:false});assert(results.total>0);const card=results.items[0];assert.equal(card.data_kind,'imported_unverified');assert(card.provenance.source_record_id);assert.equal(card.version,undefined);
 const detail=await repo.detail(card.id,false);assert.equal(detail.data_kind,'imported_unverified');assert.deepEqual(detail.provenance,card.provenance);assert.equal(detail.hours.length,0);assert.equal(detail.eligibility_text,null);assert.equal(detail.cost_summary,null);
});
