// Read-only acceptance for the explicitly approved three-clinic staging pilot.
// Uses the real restricted repository and EDEN adapters; makes no AI/provider calls.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {developmentTarget} from '../backend/db-target.mjs';
import {runtimeDatabaseConfiguration} from '../backend/database-security.ts';
import {inspectDatabase} from '../backend/db-checks.mjs';
import {PostgresRepository,closeDatabase} from '../backend/postgres.ts';
import {createPostgresGeographicReference} from '../backend/geographic-reference.ts';
import {createDirectoryCityLookup} from '../backend/directory-city.ts';
import {createEdenDirectory} from '../backend/eden-directory.ts';
import {combineSupportResults,supportMapPoints} from '../src/support-model.ts';

let sql,reference,phase='configuration';
const deadline=setTimeout(()=>{console.error(JSON.stringify({status:'BLOCKED',phase,code:'DEADLINE'}));process.exit(2);},60000);
const progress=name=>{phase=name;console.error('Verifying '+name);};
try {
  assert(process.argv.includes('--confirmed-nonproduction')&&!process.env.VERCEL&&!process.env.VERCEL_ENV&&process.env.NODE_ENV!=='production');
  const target=developmentTarget(process.env.DATABASE_URL);
  assert.equal(target.ref,'hrmocmvdmshoghclxyjs');
  const {connection,ssl}=runtimeDatabaseConfiguration(process.env);
  const expected=JSON.parse(await readFile(new URL('../docs/eden/verification/eden-08/healthcare-pilot-source.json',import.meta.url),'utf8')).records;
  assert.equal(expected.length,3);
  sql=postgres(connection,{ssl,max:1,prepare:false,connect_timeout:8,onnotice:()=>{}});
  progress('runtime and schema');
  const catalog=await sql.begin('read only',async tx=>{
    await tx`set local statement_timeout='10s'`;
    const [identity]=await tx`select current_user as role,current_setting('server_version') as postgres`;
    assert.equal(identity.role,'our_ground_api');
    const schema=await inspectDatabase(tx);assert.deepEqual(schema.problems,[]);
    const extensions=await tx`select e.extname,e.extversion,n.nspname as schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('postgis','pg_trgm','unaccent','fuzzystrmatch') order by e.extname`;
    assert.equal(extensions.length,4);assert(extensions.every(e=>e.schema==='extensions'));
    const counts=await tx`select c.slug,count(distinct s.id)::int as total from app_private.public_services s join app_private.public_service_categories sc on sc.service_id=s.id join app_private.public_categories c on c.id=sc.category_id where not s.is_demo group by c.slug order by c.slug`;
    assert.deepEqual(counts.map(r=>({slug:r.slug,total:r.total})),[{slug:'healthcare',total:3}]);
    return {identity,schema,extensions,published:counts};
  });
  progress('negative access');
  const denied=[];
  for(const [name,query] of [
    ['raw services','select count(*) from app_private.services'],
    ['source snapshots','select count(*) from app_private.resource_source_records'],
    ['privacy holds','select count(*) from app_private.resource_privacy_holds'],
    ['owner import',"select app_private.resource_import_batch('00000000-0000-4000-8000-000000000000'::uuid,'[]'::jsonb)"],
    ['owner withdrawal',"select app_private.resource_privacy_withdraw('00000000-0000-4000-8000-000000000000'::uuid,'[]'::jsonb)"]
  ]) {
    let code;
    try{await sql.begin('read only',tx=>tx.unsafe(query));}catch(error){code=error.code;}
    assert.equal(code,'42501');denied.push({operation:name,sqlstate:code});
  }
  progress('city, search and details');
  reference=createPostgresGeographicReference();
  const lookup=createDirectoryCityLookup(reference),repo=new PostgresRepository(),directory=createEdenDirectory(repo,lookup),center=await lookup('harrisburg-pa');
  assert.equal(center.latitude,40.275891);assert.equal(center.longitude,-76.88502);
  const searches=[];
  for(const radius of [10,5]) {
    const found=await directory.search({cityId:'harrisburg-pa',category:'healthcare',radius});
    const page=await repo.search({lat:center.latitude,lng:center.longitude,radiusMiles:radius,category:'healthcare',page:1,pageSize:20,allowDemo:false});
    const list=combineSupportResults(page.items,[],'real'),markers=supportMapPoints(list);
    assert.equal(found.total,radius===10?3:2);assert.equal(page.total,found.total);
    assert.deepEqual(list.map(r=>r.record.id),found.ids);
    for(const [i,item] of list.entries()) {
      const detail=await repo.detail(item.record.id,false),marker=markers.find(m=>m.place_id==='directory:'+item.record.id),row=expected.find(r=>r.service_id===item.record.id);
      assert(row&&detail&&marker);assert.equal(detail.data_kind,'imported_unverified');
      assert.equal(detail.title,row.name);assert.equal(detail.location.address_label,row.street);
      assert.equal(detail.location.latitude,row.latitude);assert.equal(detail.location.longitude,row.longitude);
      assert.equal(marker.latitude,row.latitude);assert.equal(marker.longitude,row.longitude);
      assert.equal(detail.provenance.source_id,'hrsa-health-centers');assert.equal(detail.provenance.source_record_id,row.hrsa_id);
      assert.equal(detail.provenance.verification_status,'imported_unverified');
      assert.equal(new Date(detail.provenance.source_updated_at).toISOString(),'2026-11-06T00:00:00.000Z');
      assert((await directory.facts(detail.id,i+1)).some(f=>f.text.includes('HRSA')));
    }
    searches.push({radius_miles:radius,total:found.total,ids:found.ids,distances:page.items.map(r=>r.distance_miles),all_details_sources_and_marker_data_match:true});
  }
  const food=await directory.search({cityId:'harrisburg-pa',category:'food',radius:10});assert.equal(food.total,0);
  const keyword=await repo.search({lat:center.latitude,lng:center.longitude,radiusMiles:10,category:'healthcare',keyword:'Sadler',page:1,pageSize:20,allowDemo:false});assert.equal(keyword.total,1);assert.equal(keyword.items[0].provenance.source_record_id,'BPS-H80-033742');
  console.log(JSON.stringify({verified_at:new Date().toISOString(),project_ref:target.ref,catalog,denied,center:{latitude:center.latitude,longitude:center.longitude},searches,food_total:food.total,keyword:{query:'Sadler',total:keyword.total},gemini_called:false,browser_rendering_verified:false},null,2));
} catch(error) {
  // Driver errors may contain connection or row content; report only the stage/code.
  console.error(JSON.stringify({status:'BLOCKED',phase,code:typeof error.code==='string'?error.code:'CHECK_FAILED'}));process.exitCode=2;
} finally {await reference?.close();await closeDatabase();await sql?.end({timeout:2});clearTimeout(deadline);}
