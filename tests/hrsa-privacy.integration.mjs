// No committed fixtures: all sensitive-address regressions roll back locally.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {normalizeHrsaCsv,importHrsa} from '../backend/hrsa-import.mjs';
import {baseRow,csv} from './hrsa-fixtures.mjs';

const connection=process.env.NATIONAL_TEST_DATABASE_URL;if(!connection)throw Error('Set NATIONAL_TEST_DATABASE_URL to the disposable local ourground_7d database.');
const url=new URL(connection);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/ourground_7d[a-z0-9_]*$/.test(url.pathname))throw Error('Privacy regressions require the explicitly disposable loopback Phase7D database.');
const db=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}});after(()=>db.end());
const rollback=Error('ROLLBACK_PRIVATE_SOURCE_REGRESSION');
async function fixture(fn){try{await db.begin(async tx=>{await fn(tx,{begin:f=>f(tx)});throw rollback;});}catch(e){if(e!==rollback)throw e;}}
const source='hrsa-health-centers',record=baseRow['BPHC Assigned Number'];
const normalized=patch=>normalizeHrsaCsv(csv([{...baseRow,...patch}]));
const confidential=()=>normalized({'Health Center Service Delivery Site Location Setting Description':'Domestic Violence','Site Address':'CONFIDENTIAL NEW ADDRESS MUST NOT PERSIST','Site Postal Code':'','Geocoding Artifact Address Primary X Coordinate':'','Geocoding Artifact Address Primary Y Coordinate':''});
async function publicAbsent(tx,id,location,alias){
 await tx.savepoint(async sp=>{
  await sp`set local role our_ground_api`;
  const details=await sp`select s.id,l.street_address from app_private.public_services s join app_private.public_service_locations l on l.id=s.location_id join app_private.public_organizations o on o.id=s.organization_id where s.id=${id}`;assert.equal(details.length,0);
  assert.equal((await sp`select id from app_private.public_service_locations where id=${location}`).length,0);
  const [search]=await sp`select app_private.public_resource_search(42.3601,-71.0589,10,'healthcare','',1,50,false,false) as results`;
  assert(!search.results.items.some(r=>r.id===id||r.id===alias));
  assert.equal((await sp`select service_id from app_private.public_resource_provenance where service_id=${id}`).length,0);
  await sp`reset role`;
 });
}

test('a suppression-only snapshot retains only source IDs and withdraws a previously reviewed public location',async()=>fixture(async(tx,scoped)=>{
 const first=normalized({});await importHrsa(scoped,first,{apply:true});const r=first.records[0],admin=randomUUID(),alias=randomUUID();
 await tx`insert into app_private.app_users(id,role) values(${admin},'admin')`;
 await tx`update app_private.services set title='Reviewed private regression title',version=version+1,updated_by=${admin} where id=${r.service_id}`;
 await tx`insert into app_private.services(id,organization_id,location_id,title,source_url,status,is_demo) values(${alias},${r.organization_id},${r.location_id},'Secondary service at the same private point','https://data.hrsa.gov/topics/healthcenters','published',false)`;
 await tx`insert into app_private.service_categories(service_id,category_id) select ${alias},id from app_private.categories where slug='healthcare'`;
 await tx`set local role our_ground_api`;
 const [report]=await tx`select app_private.public_correction_insert(${r.service_id},'wrong_location','Synthetic correction drill',false) id`;
 assert(report.id);await tx`reset role`;
 const privacy=confidential();assert.equal(privacy.records.length,0);assert.deepEqual(privacy.excluded,[{record_id:record,reason:'suppressed'}]);assert(!JSON.stringify(privacy).includes('CONFIDENTIAL NEW ADDRESS'));
 const result=await importHrsa(scoped,privacy,{apply:true,fullSnapshot:true});assert.equal(result.privacy_withdrawals,1);
 await publicAbsent(tx,r.service_id,r.location_id,alias);
 const disposition=await tx`update app_private.correction_reports set status='resolved',resolved_at=now() where id=${report.id} and status='open' returning id`;
 assert.equal(disposition.length,1);

 const [kept]=await tx`select title,updated_by from app_private.services where id=${r.service_id}`;assert.equal(kept.title,'Reviewed private regression title');assert.equal(kept.updated_by,admin);
 const [stored]=await tx`select snapshot from app_private.resource_source_records where service_id=${r.service_id}`;assert.deepEqual(stored.snapshot,{record_id:record,privacy_withdrawn:true});
 const versions=await tx`select snapshot from app_private.resource_source_versions where source_id=${source} and source_record_id=${record}`;assert(versions.every(v=>Object.keys(v.snapshot).sort().join(',')==='privacy_withdrawn,record_id'));
 const [hold]=await tx`select to_jsonb(h) as metadata from app_private.resource_privacy_holds h where source_id=${source} and source_record_id=${record}`;assert(!JSON.stringify(hold.metadata).includes('ADDRESS'));assert.equal(hold.metadata.released_at,null);
}));
test('later active and identical imports cannot republish a privacy-held site or its shared-location aliases',async()=>fixture(async(tx,scoped)=>{
 const first=normalized({});await importHrsa(scoped,first,{apply:true});const r=first.records[0];await importHrsa(scoped,confidential(),{apply:true});
 const returned=normalized({'Site Name':'Source says public again; still requires review'});await importHrsa(scoped,returned,{apply:true});assert.equal((await importHrsa(scoped,returned,{apply:true})).already_imported,true);
 await tx`update app_private.service_locations set status='published' where id=${r.location_id}`;
 await tx`update app_private.resource_source_records set record_status='active',needs_review=false where service_id=${r.service_id}`;
 await publicAbsent(tx,r.service_id,r.location_id);const [status]=await tx`select record_status,needs_review from app_private.resource_source_records where service_id=${r.service_id}`;assert.equal(status.record_status,'suppressed');assert.equal(status.needs_review,true);
}));
test('a never-imported confidential ID remains held if a later source row becomes public',async()=>fixture(async(tx,scoped)=>{
 const privacy=confidential();await importHrsa(scoped,privacy,{apply:true});assert.equal((await tx`select service_id from app_private.resource_source_records where source_id=${source} and source_record_id=${record}`).length,0);
 const later=normalized({});await importHrsa(scoped,later,{apply:true});const r=later.records[0];await publicAbsent(tx,r.service_id,r.location_id);
}));
test('privacy release requires owner privileges, active administrator, fresh evidence and matching current public location',async()=>fixture(async(tx,scoped)=>{
 const first=normalized({});await importHrsa(scoped,first,{apply:true});const r=first.records[0],admin=randomUUID(),ordinary=randomUUID();
 await tx`insert into app_private.app_users(id,role) values(${admin},'admin'),(${ordinary},'user')`;
 await importHrsa(scoped,confidential(),{apply:true});
 await assert.rejects(tx.savepoint(sp=>sp`select app_private.resource_privacy_review_release(${source},${record},${admin}::uuid,'https://data.hrsa.gov/topics/healthcenters')`),/subsequent public source/);
 const moved=normalized({'Site Address':'2 Public Regression Street'});await importHrsa(scoped,moved,{apply:true});
 await assert.rejects(tx.savepoint(sp=>sp`select app_private.resource_privacy_review_release(${source},${record},${ordinary}::uuid,'https://data.hrsa.gov/topics/healthcenters')`),/OG_ACCESS_DENIED/);
 await assert.rejects(tx.savepoint(sp=>sp`select app_private.resource_privacy_review_release(${source},${record},${admin}::uuid,'javascript:alert(1)')`),/OG_ACCESS_DENIED/);
 await assert.rejects(tx.savepoint(async sp=>{await sp`set local role our_ground_api`;await sp`select app_private.resource_privacy_review_release(${source},${record},${admin}::uuid,'https://data.hrsa.gov/topics/healthcenters')`;}),e=>e.code==='42501');
 await assert.rejects(tx.savepoint(sp=>sp`select app_private.resource_privacy_review_release(${source},${record},${admin}::uuid,'https://data.hrsa.gov/topics/healthcenters')`),/reconcile the exact public location/);
 await tx`update app_private.service_locations set street_address='2 Public Regression Street' where id=${r.location_id}`;
 await tx`select app_private.resource_privacy_review_release(${source},${record},${admin}::uuid,'https://data.hrsa.gov/topics/healthcenters')`;
 const [location]=await tx`select status from app_private.service_locations where id=${r.location_id}`;assert.equal(location.status,'hidden');
 await publicAbsent(tx,r.service_id,r.location_id);
 const events=await tx`select action,actor_id from app_private.resource_privacy_events where source_id=${source} and source_record_id=${record} order by id`;assert.deepEqual(events.map(e=>e.action),['withdrawn','reviewed_release']);assert.equal(events[1].actor_id,admin);
 await assert.rejects(tx.savepoint(sp=>sp`update app_private.resource_privacy_events set action='withdrawn' where actor_id=${admin}`),/OG_AUDIT_IMMUTABLE/);
}));
test('repeated reviewed snapshot backfills privacy IDs once without new resources or duplicate events',async()=>fixture(async(tx,scoped)=>{
 const privacy=confidential();const first=await importHrsa(scoped,privacy,{apply:true});const again=await importHrsa(scoped,privacy,{apply:true});assert.equal(again.already_imported,true);assert.equal(first.run_id,again.run_id);assert.equal(again.privacy_withdrawals,0);
 assert.equal((await tx`select id from app_private.resource_privacy_events where source_id=${source} and source_record_id=${record}`).length,1);
 assert.equal((await tx`select service_id from app_private.resource_source_records where source_id=${source} and source_record_id=${record}`).length,0);
}));
test('runtime and browser roles cannot enumerate privacy IDs or call withdrawal/release operations',async()=>fixture(async(tx)=>{
 for(const role of ['our_ground_api','anon','authenticated']){
  await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp`select * from app_private.resource_privacy_holds`;}),e=>e.code==='42501');
  await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp`select * from app_private.resource_privacy_events`;}),e=>e.code==='42501');
  await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp`select app_private.resource_privacy_withdraw(${randomUUID()}::uuid,'[]'::jsonb)`;}),e=>e.code==='42501');
 }
}));
