import {test,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import postgres from 'postgres';
import {createPostgresGeographicReference} from '../backend/geographic-reference.ts';
import {parseGazetteer,importGazetteer} from '../backend/gazetteer-import.mjs';
import {inspectDatabase} from '../backend/db-checks.mjs';
const connection=process.env.GEOGRAPHIC_TEST_DATABASE_URL;if(!connection)throw Error('Set GEOGRAPHIC_TEST_DATABASE_URL to the new isolated loopback ourground_7d1 clone.');
const url=new URL(connection);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/ourground_7d1[a-z0-9_]*$/.test(url.pathname))throw Error('Geographic integration tests require the explicitly new disposable local clone.');
const sql=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}}),runtime=new URL(connection);runtime.username='our_ground_api';
const reference=createPostgresGeographicReference({DATABASE_URL:runtime.href,DB_SSL:'disable',NODE_ENV:'test'});
after(async()=>{await reference.close();await sql.end();});
test('actual2026 Census imports preserve32,363 places and52 state/DC/PR records without duplicates',async()=>{
 const rows=await sql`select kind,count(*)::int as count from app_private.geographic_reference_records group by kind order by kind`;assert.deepEqual(rows.map(r=>({...r})),[{kind:'place',count:32363},{kind:'state',count:52}]);
 const [imports]=await sql`select count(*)::int as count from app_private.geographic_reference_imports where completed_at is not null`;assert.equal(imports.count,2);
 const [states]=await sql`select count(distinct state)::int as count from app_private.geographic_reference_records where kind='place'`;assert.equal(states.count,52);
});
test('generalized indexed matching corrects six acceptance misspellings using actual source records',async()=>{
 for(const [query,state,name]of [['San Fransisco','CA','San Francisco city'],['Philidelphia','PA','Philadelphia city'],['Chcago','IL','Chicago city'],['Pensylvania',undefined,'Pennsylvania'],['Los Angles','CA','Los Angeles city'],['Boson','MA','Boston city']]){
  const results=await reference.findCandidates(query,state);const wanted=results.find(r=>r.canonical_name===name);assert(wanted,query);assert.equal(wanted.match.method,'fuzzy');assert(wanted.match.edit_distance>=1&&wanted.match.edit_distance<=3);assert(wanted.match.local_similarity>=0.35&&wanted.match.local_similarity<1);assert.equal(wanted.match.exact_match,false);assert.equal(wanted.source.provider,'census');assert.equal(wanted.coordinate_precision,'representative');assert.equal(wanted.provider_confidence,undefined);
 }
});
test('exact national city names keep authoritative jurisdiction and representative coordinates',async()=>{
 for(const [query,state]of [['Boston','MA'],['Harrisburg','PA'],['New York','NY'],['Houston','TX'],['Anchorage','AK'],['Urban Honolulu','HI'],['Portland','OR'],['Philadelphia','PA'],['Chicago','IL'],['Los Angeles','CA'],['San Francisco','CA'],['Washington','DC']]){
  const results=await reference.findCandidates(query,state);assert(results.length>0,query);assert(results.every(r=>r.state===state&&r.kind==='place'),query);assert(results.some(r=>r.match.exact_match),query);assert(results.every(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)),query);
 }
});
test('ambiguous Springfield remains multiple choices and explicit states never silently switch jurisdictions',async()=>{
 const results=await reference.findCandidates('Springfield');assert(results.length>1&&results.length<=5);assert(new Set(results.map(r=>r.state)).size>1);assert(results.every(r=>r.match.ambiguous_matches>5));
 for(const state of ['IL','MO','MA']){const scoped=await reference.findCandidates('Springfield',state);assert(scoped.length>0);assert(scoped.every(r=>r.state===state&&r.match.exact_match));}
 assert.deepEqual(await reference.findCandidates('San Fransisco','TX'),[]);
});
test('state abbreviations use exact official USPS aliases; state and city identities remain distinct',async()=>{
 for(const state of ['PA','CA','DC','PR']){const rows=await reference.findCandidates(state);assert.equal(rows.length,1);assert.equal(rows[0].kind,'state');assert.equal(rows[0].state,state);assert.equal(rows[0].match.edit_distance,0);assert.equal(rows[0].match.exact_match,true);}
 const ambiguous=await reference.findCandidates('New York');assert(ambiguous.some(r=>r.kind==='state')&&ambiguous.some(r=>r.kind==='place'));assert.equal(new Set(ambiguous.map(r=>r.id)).size,ambiguous.length);
 const explicit=await reference.findCandidates('New York','NY');assert(explicit.every(r=>r.kind==='place'));
});
test('diacritics and punctuation retain the official displayed name while normalizing comparison',async()=>{
 const accented=await reference.findCandidates('Penuelas','PR');assert(accented.some(r=>r.canonical_name.includes('Peñuelas')&&r.match.exact_match));
 const folded=await reference.findCandidates('PEÑUELAS','PR');assert.deepEqual(accented.map(r=>r.id),folded.map(r=>r.id));
 const apostrophe=await reference.findCandidates('OFallon','MO');assert(apostrophe.some(r=>r.canonical_name.includes("O'Fallon")&&r.match.exact_match));
});
test('short strings, ZIPs, street numbers and weak unrelated matches do not trigger invented geography',async()=>{
 for(const query of ['a','Sa','San','10001','02108-1234','267 Water Spring St','999999 Main Street','zxqvzzqx'])assert.deepEqual(await reference.findCandidates(query),[],query);
 assert.deepEqual(await reference.findCandidates('Boston','AS'),[]);
 const honolulu=await reference.findCandidates('Honolulu','HI');assert(honolulu.every(r=>r.display_name!=='Honolulu'));
});
test('exact and nearest-name queries use actual geographic-name indexes',async()=>{
 const exact=await sql`explain (analyze,buffers,format json) select record_id from app_private.geographic_reference_names where normalized_name='springfield'`;assert.match(JSON.stringify(exact),/geographic_reference_names_(exact|trgm)_idx/);assert.doesNotMatch(JSON.stringify(exact),/"Node Type":"Seq Scan"/);
 const fuzzy=await sql`explain (analyze,buffers,format json) select record_id from app_private.geographic_reference_names order by normalized_name operator(extensions.<->) 'san fransisco' limit 128`;assert.match(JSON.stringify(fuzzy),/geographic_reference_names_trgm_idx/);assert.doesNotMatch(JSON.stringify(fuzzy),/"Node Type":"Seq Scan"/);
});
test('restricted role receives only bounded public geographic candidates and cannot access import tables',async()=>{
 assert.deepEqual((await inspectDatabase(sql)).problems,[]);
 await sql.begin(async tx=>{await tx`set local role our_ground_api`;
  for(const table of ['geographic_reference_imports','geographic_reference_records','geographic_reference_names'])await assert.rejects(tx.savepoint(sp=>sp.unsafe('select * from app_private.'+table)),e=>e.code==='42501');
  await assert.rejects(tx.savepoint(sp=>sp`select app_private.geographic_reference_import_batch(${randomUUID()}::uuid,'[]'::jsonb)`),e=>e.code==='42501');
  const [r]=await tx`select app_private.geographic_reference_find('San Fransisco','CA',5) as items`;assert.equal(r.items[0].contact_email,undefined);assert.equal(r.items[0].organization_id,undefined);assert(r.items[0].source.geographic_id);
 });
});
test('SQL independently rejects oversized/unsupported calls and browser roles cannot execute the boundary',async()=>{
 for(const role of ['anon','authenticated'])await sql.begin(async tx=>{await tx.unsafe('set local role '+role);await assert.rejects(tx.savepoint(sp=>sp`select app_private.geographic_reference_find('Boston','MA',5)`),e=>e.code==='42501');});
 await sql.begin(async tx=>{await tx`set local role our_ground_api`;for(const [query,limit]of [['x'.repeat(81),5],['Boston',1000],['Boston',0]])await assert.rejects(tx.savepoint(sp=>sp`select app_private.geographic_reference_find(${query},null,${limit})`),/OG_VALIDATION_ERROR/);});
});
test('runtime factory rejects owner credentials and preserves cancellation',async()=>{
 const bad=createPostgresGeographicReference({DATABASE_URL:connection,DB_SSL:'disable',NODE_ENV:'test'});try{await assert.rejects(bad.findCandidates('Boston'),e=>e.code==='GEOGRAPHIC_REFERENCE_UNAVAILABLE');}finally{await bad.close();}
 const controller=new AbortController();controller.abort();await assert.rejects(reference.findCandidates('Boston','MA',5,controller.signal),e=>e.name==='AbortError');
});
test('the geographic import leaves all HRSA bindings, versions, privacy holds and public data intact',async()=>{
 const [r]=await sql`select (select count(*)::int from app_private.resource_source_records) as sites,(select count(distinct organization_id)::int from app_private.resource_source_records) as organizations,(select count(*)::int from app_private.resource_source_versions) as versions,(select count(*)::int from app_private.resource_import_runs) as runs,(select count(*)::int from app_private.resource_privacy_holds) as holds,(select count(*)::int from app_private.public_services where not is_demo) as public_sites`;assert.deepEqual({...r},{sites:17418,organizations:1584,versions:17418,runs:1,holds:17,public_sites:17418});
});

const rollbackImport=Error('ROLLBACK_SYNTHETIC_GEOGRAPHIC_IMPORT');
const stateText='USPS|GEOID|GEOIDFQ|NAME|INTPTLAT|INTPTLONG\nMA|25|0400000US25|Massachusetts|42.2|-71.8\n';
function syntheticPlaces(names){return 'USPS|GEOID|GEOIDFQ|ANSICODE|NAME|LSAD|FUNCSTAT|INTPTLAT|INTPTLONG\n'+names.map((name,i)=>'MA|'+(2599990+i)+'|1600000US'+(2599990+i)+'|99999999|'+name+' city|25|A|42.3|-71.0').join('\n')+'\n';}
test('owner refresh retains source identity, removes superseded aliases and remains idempotent',async()=>{
 try{await sql.begin(async tx=>{const scoped={begin:f=>f(tx)},bundle=[parseGazetteer('state',stateText),parseGazetteer('place',syntheticPlaces(['Synthetic geographic regression']))];
 const first=await importGazetteer(scoped,bundle,{apply:true,allowPartial:true});assert(first.files.every(r=>!r.already_imported));const repeated=await importGazetteer(scoped,bundle,{apply:true,allowPartial:true});assert(repeated.files.every(r=>r.already_imported));
 const changed=[bundle[0],parseGazetteer('place',syntheticPlaces(['Synthetic renamed regression']))];await importGazetteer(scoped,changed,{apply:true,allowPartial:true});
 const [r]=await tx`select canonical_name from app_private.geographic_reference_records where id='census:2026:place:2599990'`;assert.equal(r.canonical_name,'Synthetic renamed regression city');
 const old=await tx`select 1 from app_private.geographic_reference_names where record_id='census:2026:place:2599990' and normalized_name='synthetic geographic regression'`;assert.equal(old.length,0);throw rollbackImport;
 });}catch(e){if(e!==rollbackImport)throw e;}
});
test('one invalid owner import batch rolls back all earlier records and import runs',async()=>{
 try{await sql.begin(async tx=>{const bundle=[parseGazetteer('state',stateText),parseGazetteer('place',syntheticPlaces(['Synthetic first valid','Synthetic invalid second']))];bundle[1].records[1].latitude=91;
 await assert.rejects(tx.savepoint(sp=>importGazetteer({begin:f=>f(sp)},bundle,{apply:true,allowPartial:true})),e=>e.code==='23514');
 assert.equal((await tx`select id from app_private.geographic_reference_records where id in ('census:2026:place:2599990','census:2026:place:2599991')`).length,0);throw rollbackImport;
 });}catch(e){if(e!==rollbackImport)throw e;}
});
