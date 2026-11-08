// Deterministic provider fixtures, never live requests. Canonical coordinates
// below are recorded Census2026 rows; import timestamps/match evidence are fixtures.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createLocationSearch} from '../backend/location-search.ts';
import {locationQueryContext,providerQuality} from '../backend/location-quality.ts';
import {validLocationQuality} from '../backend/location-quality-validation.ts';
import {validatedSelectedLocation} from '../backend/location-validation.ts';
import {handleApi} from '../backend/app.ts';
import {usStates} from '../shared/us-location.ts';

const sourceRows={"San Francisco": {"id": "census:2026:place:0667000", "canonical_name": "San Francisco city", "display_name": "San Francisco", "state": "CA", "kind": "place", "latitude": 37.727239, "longitude": -123.032229, "geoid_fq": "1600000US0667000", "ansi_code": "02411786"}, "Philadelphia": {"id": "census:2026:place:4260000", "canonical_name": "Philadelphia city", "display_name": "Philadelphia", "state": "PA", "kind": "place", "latitude": 40.009297, "longitude": -75.133271, "geoid_fq": "1600000US4260000", "ansi_code": "01215531"}, "Chicago": {"id": "census:2026:place:1714000", "canonical_name": "Chicago city", "display_name": "Chicago", "state": "IL", "kind": "place", "latitude": 41.837045, "longitude": -87.684939, "geoid_fq": "1600000US1714000", "ansi_code": "00428803"}, "Los Angeles": {"id": "census:2026:place:0644000", "canonical_name": "Los Angeles city", "display_name": "Los Angeles", "state": "CA", "kind": "place", "latitude": 34.019394, "longitude": -118.410825, "geoid_fq": "1600000US0644000", "ansi_code": "02410877"}, "Boston": {"id": "census:2026:place:2507000", "canonical_name": "Boston city", "display_name": "Boston", "state": "MA", "kind": "place", "latitude": 42.332735, "longitude": -71.013513, "geoid_fq": "1600000US2507000", "ansi_code": "00619463"}, "Peñuelas": {"id": "census:2026:place:7261074", "canonical_name": "Peñuelas zona urbana", "display_name": "Peñuelas", "state": "PR", "kind": "place", "latitude": 18.059634, "longitude": -66.72114, "geoid_fq": "1600000US7261074", "ansi_code": "02414906"}, "Pennsylvania": {"id": "census:2026:state:42", "canonical_name": "Pennsylvania", "display_name": "Pennsylvania", "state": "PA", "kind": "state", "latitude": 40.904604, "longitude": -77.827523, "geoid_fq": "0400000US42", "ansi_code": null}};
const session='12345678-1234-4234-8234-123456789abc',other='12345678-1234-4234-8234-123456789abd';
const env={GEOAPIFY_SERVER_API_KEY:'REPLACE_ME_REFINEMENT_TEST_KEY',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true'};
const signingKey='REPLACE_ME_REFINEMENT_TEST_SIGNING';
function canonical(name,{exact=false,query=name,similarity=exact?1:.7,edits=exact?0:1,url}={}){
 const row=sourceRows[name];assert(row,'Missing recorded canonical fixture: '+name);
 return {...structuredClone(row),source:{provider:'census',id:'census-gazetteer-2026',url:url??'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html',vintage:2026,geographic_id:row.id.split(':').at(-1),geoid_fq:row.geoid_fq,ansi_code:row.ansi_code,imported_at:'2026-11-05T00:00:00.000Z'},coordinate_precision:'representative',match:{method:exact?'exact':'fuzzy',query,matched_name:row.display_name,local_similarity:similarity,edit_distance:edits,exact_match:exact,ambiguous_matches:1}};
}
function providerCity(name='San Francisco',state='CA',extra={}){
 const coordinates={CA:[37.7749,-122.4194],MA:[42.3601,-71.0589],PA:[39.9526,-75.1652],NY:[40.7128,-74.006],IL:[41.8781,-87.6298],AZ:[32.2217,-110.9265],PR:[18.056,-66.726]};
 const [lat,lon]=coordinates[state]??[40,-77];return{place_id:'fixture.provider.'+state,city:name,name,state_code:state,state:usStates[state]??'Puerto Rico',country:'United States',country_code:'us',lat,lon,result_type:'city',formatted:name+', '+state,address_line1:name,address_line2:state,rank:{confidence:.99,confidence_city_level:.99,match_type:'full_match'},...extra};
}
function harness({rows=[],local=[],reference,fetcher,enabled=true,timeoutMs,now}={}){
 const calls=[],referenceCalls=[];
 const lookup={findCandidates:async(query,state,limit,signal)=>{referenceCalls.push({query,state,limit,signal});return typeof local==='function'?local(query,state,limit,signal):structuredClone(local);},...reference};
 const locations=createLocationSearch({env:enabled?env:{},signingKey,now:now??(()=>1800000000000),timeoutMs,reference:reference===false?undefined:lookup,fetcher:async(url,init)=>{calls.push({url:new URL(url),init});return fetcher?fetcher(new URL(url),init):Response.json({results:rows});}});
 return {locations,calls,referenceCalls};
}
const issuedPayload=s=>JSON.parse(Buffer.from(s.receipt.split('.')[0],'base64url').toString()).location;
const selectCanonical=s=>s.suggestions.find(x=>x.id.startsWith('census:'));

for(const [query,name,state,parsed]of [['San Fransisco','San Francisco','CA','San Fransisco'],['Philidelphia','Philadelphia','PA','Philidelphia'],['Chcago','Chicago','IL','Chcago'],['Pensylvania','Pennsylvania','PA','Pensylvania'],['Los Angles','Los Angeles','CA','Los Angles'],['Boson MA','Boston','MA','Boson']])test('source-backed correction is explicit for '+query,async()=>{
 const h=harness({local:[canonical(name,{query})],rows:query==='San Fransisco'?[providerCity('Tucson','AZ',{name:'San Francisco Mission',address_line1:'San Francisco Mission'})]:[]});
 const result=await h.locations.suggest(query,session),choice=selectCanonical(result);assert(choice);assert.match(choice.primary,new RegExp(name));assert.equal(choice.quality.kind,'canonical_correction');assert.equal(choice.quality.source,'reference');assert.equal(choice.quality.precision,name==='Pennsylvania'?'state':'city');assert.equal(choice.quality.local.method,'fuzzy');assert.equal(choice.quality.provider,undefined);
 assert.equal(h.referenceCalls[0].query,parsed);assert.equal(h.referenceCalls[0].limit,5);if(query==='Boson MA')assert.equal(h.referenceCalls[0].state,'MA');
 const selected=issuedPayload(choice);assert.equal(selected.state,state);assert.equal(selected.source,'reference');assert.equal(selected.latitude,sourceRows[name].latitude);assert.equal(selected.longitude,sourceRows[name].longitude);assert(validLocationQuality(selected.quality));assert.equal(h.calls.length,0);assert.equal(result.providerStatus,'not_needed');
 if(query==='San Fransisco')assert(result.suggestions.every(s=>s.id!=='fixture.provider.AZ'));
});
test('strong exact provider evidence remains available when local candidates are absent',async()=>{
 const h=harness({rows:[providerCity()],local:[]});const found=await h.locations.suggest('San Francisco',session);assert.equal(found.suggestions[0].id,'fixture.provider.CA');assert.equal(found.suggestions[0].quality.kind,'exact');assert.equal(found.suggestions[0].quality.source,'geoapify');
 await h.locations.retrieve(found.suggestions[0].id,session,found.suggestions[0].receipt);assert.equal(h.calls.length,1);
});
test('wrong house number cannot become an exact address and fallback uses city rather than wrong-building coordinates',async()=>{
 const wrong=providerCity('Boston','MA',{place_id:'fixture.wrong.building',housenumber:'999',address_line1:'999 Main Street',formatted:'999 Main Street, Boston, MA',result_type:'building',lat:42.9,lon:-71.9,rank:{confidence:1,confidence_building_level:1,confidence_street_level:1,match_type:'full_match'}});
 const h=harness({rows:[wrong],local:[canonical('Boston',{exact:true})]});const found=await h.locations.suggest('123 Main Street, Boston, MA',session);assert(found.suggestions.every(s=>s.id!=='fixture.wrong.building'));const choice=selectCanonical(found);assert(choice);assert.equal(choice.quality.kind,'city_fallback');assert.equal(choice.quality.precision,'city');assert.match(choice.quality.explanation,/not confirmed|does not validate/i);assert.notEqual(issuedPayload(choice).latitude,wrong.lat);assert.equal(issuedPayload(choice).latitude,sourceRows.Boston.latitude);
});
test('partial or unknown street input stays uncertain and never acquires a building guarantee',async()=>{
 const raw=providerCity('Boston','MA',{result_type:'street',place_id:'fixture.partial.street',address_line1:'Main Street',formatted:'Main Street, Boston, MA',rank:{confidence:.6,confidence_street_level:.7,match_type:'match_by_street'}});const h=harness({rows:[raw]});const found=await h.locations.suggest('Main Street',session);assert.equal(found.suggestions.length,1);assert.equal(found.suggestions[0].quality.kind,'uncertain');assert.equal(found.suggestions[0].quality.precision,'street');assert.match(found.suggestions[0].quality.explanation,/Partial street|not establish/i);assert.equal(h.referenceCalls.length,0);
 const area=harness({rows:[providerCity('Boston','MA')]});const coarse=await area.locations.suggest('123 Unrecognized Street, Boston, MA',session);assert(coarse.suggestions.length);assert(coarse.suggestions.every(s=>s.quality.kind==='city_fallback'&&s.quality.precision==='city'));
});
test('low confidence provider rows are suppressed and malformed scores are never exposed as confidence',async()=>{
 const low=harness({rows:[providerCity('Boston','MA',{rank:{confidence:.1,confidence_city_level:1,match_type:'full_match'}})]});assert.deepEqual((await low.locations.suggest('Boston, MA',session)).suggestions,[]);
 const malformed=providerQuality(locationQueryContext('123 Main Street, Boston, MA'),{...providerCity('Boston','MA'),result_type:'building',housenumber:'123',rank:{confidence:NaN,confidence_city_level:Infinity,confidence_street_level:-1,confidence_building_level:1.1,match_type:'full_match'}});assert.equal(malformed.strong,false);assert.equal(malformed.quality.kind,'uncertain');for(const value of Object.values(malformed.quality.provider))if(typeof value==='number')assert(Number.isFinite(value)&&value>=0&&value<=1);
});
test('ZIP+4 remains a postal-area suggestion rather than a verified delivery address',async()=>{
 const h=harness({rows:[providerCity('Boston','MA',{result_type:'postcode',postcode:'02108',address_line1:'02108',rank:{confidence:1,match_type:'full_match'}})]});
 const extension=await h.locations.suggest('02108-1234',session);assert.equal(extension.suggestions[0].quality.kind,'uncertain');assert.equal(extension.suggestions[0].quality.precision,'postcode');assert.match(extension.suggestions[0].quality.explanation,/ZIP\+4.*not confirmed/i);
 const base=await h.locations.suggest('02108',session);assert.equal(base.suggestions[0].quality.kind,'exact');assert.match(base.suggestions[0].quality.explanation,/not an individual delivery address/);assert.equal(h.referenceCalls.length,0);
});
test('diacritic and two-character state reference choices retain canonical identity without fuzzy short correction',async()=>{
 const accent=harness({local:[canonical('Peñuelas',{exact:true})]});const found=await accent.locations.suggest('Penuelas PR',session);assert.match(selectCanonical(found).primary,/Peñuelas/);assert.equal(selectCanonical(found).quality.local.method,'exact');assert.equal(accent.referenceCalls[0].state,'PR');
 const short=harness({local:[canonical('Pennsylvania',{exact:true})]});const state=await short.locations.suggest('PA',session);assert.equal(selectCanonical(state).quality.kind,'canonical_exact');assert.equal(selectCanonical(state).quality.precision,'state');assert.equal(short.referenceCalls[0].query,'PA');
});
test('explicit state conflicts remove both provider and reference alternatives outside that jurisdiction',async()=>{
 const h=harness({rows:[providerCity()],local:[canonical('San Francisco')]});const found=await h.locations.suggest('San Fransisco, TX',session);assert.deepEqual(found.suggestions,[]);assert.equal(h.referenceCalls[0].state,'TX');
});
test('unsafe provenance URLs never become signed reference suggestions',async()=>{
 for(const url of ['javascript:alert(1)','http://www.census.gov/','https://evil.invalid/source','https://user:password@www.census.gov/data','https://www.census.gov/data?private=value','https://www.census.gov/data#section']){
  const h=harness({local:[canonical('San Francisco',{url})]});assert.deepEqual((await h.locations.suggest('San Fransisco',session)).suggestions,[],url);
 }
});
test('forged canonical IDs, session or receipts are rejected before another provider lookup',async()=>{
 const h=harness({local:[canonical('San Francisco')]});const s=selectCanonical(await h.locations.suggest('San Fransisco',session));const changed=s.receipt.slice(0,-1)+(s.receipt.endsWith('A')?'B':'A');
 for(const [id,token,receipt]of [[s.id+':forged',session,s.receipt],[s.id,other,s.receipt],[s.id,session,changed],[s.id,session,s.receipt+'.extra']])await assert.rejects(h.locations.retrieve(id,token,receipt),e=>e.status===422&&e.code==='LOCATION_SELECTION_INVALID');assert.equal(h.calls.length,0);
});
test('explicit canonical retrieval preserves the signed Census point without implicit provider enrichment',async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})});const s=selectCanonical(await h.locations.suggest('San Fransisco',session));assert.equal(issuedPayload(s).longitude,-123.032229);
 const result=await h.locations.retrieve(s.id,session,s.receipt);assert.equal(h.calls.length,0);
 const point=result.location;assert.equal(point.latitude,sourceRows['San Francisco'].latitude);assert.equal(point.longitude,sourceRows['San Francisco'].longitude);assert.equal(point.source,'reference');assert.equal(point.provider,undefined);assert.equal(point.quality.source,'reference');assert.equal(point.quality.coordinateSource,'reference');assert.equal(point.quality.reference.geographicId,'0667000');assert.equal(point.quality.provider,undefined);assert.equal(point.quality.local.method,'fuzzy');assert(validLocationQuality(point.quality));assert.deepEqual(validatedSelectedLocation(point).quality,point.quality);assert.match(point.quality.explanation,/representative|does not validate a street address/);
});
for(const status of [429,503])test('canonical retrieval avoids the provider even when its unused fixture would return HTTP'+status,async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async()=>new Response('',{status})});const found=await h.locations.suggest('San Fransisco',session),s=selectCanonical(found),result=await h.locations.retrieve(s.id,session,s.receipt);assert.equal(found.providerStatus,'not_needed');assert.equal(h.calls.length,0);assert.equal(result.location.longitude,-123.032229);assert.equal(result.location.provider,undefined);assert.equal(result.location.quality.coordinateSource,'reference');assert.match(result.location.quality.explanation,/representative|far from service clusters/);
});
test('no-key canonical retrieval uses representative coordinates without any fetch',async()=>{
 const h=harness({enabled:false,local:[canonical('San Francisco')]});const found=await h.locations.suggest('San Fransisco',session);assert.equal(h.locations.status().configured,false);assert.equal(found.providerStatus,'not_needed');const s=selectCanonical(found),point=(await h.locations.retrieve(s.id,session,s.receipt)).location;assert.equal(point.longitude,-123.032229);assert.equal(point.quality.coordinateSource,'reference');assert.equal(h.calls.length,0);
});
test('provider timeout stays distinct from empty results while sufficient reference data never queries the provider',async()=>{
 const hanging=async(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));const timer=setTimeout(()=>{},100);
 try{
  const noFallback=harness({timeoutMs:10,fetcher:hanging});await assert.rejects(noFallback.locations.suggest('Unknown city',session),e=>e.status===504&&e.code==='LOCATION_SEARCH_TIMEOUT');assert.equal(noFallback.calls.length,1);
  const reference=harness({timeoutMs:10,fetcher:hanging,local:[canonical('San Francisco')]});const result=await reference.locations.suggest('San Fransisco',session);assert.equal(result.providerStatus,'not_needed');assert(selectCanonical(result));assert.equal(reference.calls.length,0);assert(!/unavailable|timeout/i.test(result.notice));
  const empty=harness();const resultEmpty=await empty.locations.suggest('Unknown city',session);assert.equal(resultEmpty.providerStatus,'available');assert.deepEqual(resultEmpty.suggestions,[]);assert.equal(empty.calls.length,1);
 }finally{clearTimeout(timer);}
});
test('provider quota remains an error without local matches while sufficient references spend no quota',async()=>{
 const limited=harness({fetcher:async()=>new Response('',{status:429})});await assert.rejects(limited.locations.suggest('Unknown city',session),e=>e.status===429&&e.code==='LOCATION_PROVIDER_LIMIT');assert.equal(limited.calls.length,1);
 const h=harness({local:[canonical('San Francisco')],fetcher:async()=>new Response('',{status:429})});const result=await h.locations.suggest('San Fransisco',session);assert.equal(result.providerStatus,'not_needed');assert(selectCanonical(result));assert.equal(h.calls.length,0);
});
test('cancelling reference-first work leaves no unhandled rejection',async()=>{
 const unhandled=[],listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);const abort=new AbortController();
 const pending=signal=>new Promise((_,reject)=>{if(signal?.aborted)reject(signal.reason);else signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 try{const h=harness({reference:{findCandidates:(_q,_s,_l,signal)=>pending(signal)},fetcher:(_url,init)=>pending(init.signal)});const request=h.locations.suggest('San Fransisco',session,abort.signal);await new Promise(setImmediate);abort.abort();await assert.rejects(request,e=>e.name==='AbortError');await new Promise(setImmediate);await new Promise(setImmediate);assert.deepEqual(unhandled,[]);}finally{process.off('unhandledRejection',listener);}
});
test('provider matches remain available with a separate notice when the reference database fails',async()=>{
 const h=harness({rows:[providerCity('Boston','MA')],reference:{findCandidates:async()=>{throw Error('Private SQL must never leak');}}});const result=await h.locations.suggest('Boston, MA',session);assert.equal(result.suggestions[0].quality.source,'geoapify');assert.equal(result.providerStatus,'available');assert.match(result.notice,/spelling corrections are temporarily unavailable/i);assert(!JSON.stringify(result).includes('Private SQL'));
});
test('new quality metadata is validated by resource API and retained by the signed location workflow',async()=>{
 const h=harness({enabled:false,local:[canonical('Boston',{exact:true})]}),s=selectCanonical(await h.locations.suggest('Boston, MA',session)),location=(await h.locations.retrieve(s.id,session,s.receipt)).location;let searches=0;
 const repo={search:async()=>{searches++;return{items:[],total:0};}};
 const send=value=>handleApi(new Request('https://fixture.invalid/api/v1/resources/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://fixture.invalid'},body:JSON.stringify({location:value,category:'all',radius_miles:10,page:1,page_size:20,data_kind:'real'})}),{repo,locations:h.locations});
 assert.equal((await send(location)).status,200);assert.equal(searches,1);
 for(const patch of [{reference:{...location.quality.reference,sourceUrl:'javascript:alert(1)'}},{local:{...location.quality.local,similarity:2}},{provider:{confidence:.8},coordinateSource:'reference'},{source:'reference',kind:'exact'},{precision:'building'}]){
  const malformed={...location,quality:{...location.quality,...patch}};assert.equal(validLocationQuality(malformed.quality),false);assert.equal((await send(malformed)).status,422);
 }
 assert.equal(searches,1);for(const key of ['kind','precision','source','reference','local'])assert.deepEqual(issuedPayload(s).quality[key],location.quality[key]);assert(validLocationQuality(location.quality));
});
test('canonical coarse URL restoration requires a unique exact name and never silently corrects a typo',async()=>{
 const h=harness({enabled:false,local:(q,state)=>q==='Boston'&&state==='MA'?[canonical('Boston',{exact:true})]:[canonical('Boston',{query:q})]});const found=await h.locations.forward('Boston, MA');assert.equal(found.location.source,'reference');assert.equal(found.location.state,'MA');assert.equal(found.location.publicQuery,'Boston, MA');assert.equal(h.calls.length,0);
 await assert.rejects(h.locations.forward('Boson, MA'),e=>[422,503].includes(e.status)&&['LOCATION_NOT_FOUND','LOCATION_SEARCH_UNAVAILABLE'].includes(e.code));
 const multiple=harness({enabled:false,local:[canonical('Boston',{exact:true}),{...canonical('Boston',{exact:true}),id:'census:2026:place:2599999'}]});await assert.rejects(multiple.locations.forward('Boston, MA'),e=>[422,503].includes(e.status)&&['LOCATION_NOT_FOUND','LOCATION_SEARCH_UNAVAILABLE'].includes(e.code));
});
test('weak explicit forward evidence cannot replace a later signed representative reference point',async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity('San Francisco','CA',{rank:{confidence:.05,confidence_city_level:.05,match_type:'full_match'}})]:[]})});
 await assert.rejects(h.locations.forward('San Francisco, CA'),e=>e.status===422&&e.code==='LOCATION_NOT_FOUND');assert.equal(h.calls.length,1);
 const s=selectCanonical(await h.locations.suggest('San Fransisco',session));const result=await h.locations.retrieve(s.id,session,s.receipt);assert.equal(result.location.longitude,-123.032229);assert.equal(result.location.quality.coordinateSource,'reference');assert.equal(h.calls.length,1);
});

test('reference point cache preserves each selection quality and expired receipts require a fresh local choice',async()=>{
 let clock=1800000000000;const h=harness({now:()=>clock,local:q=>[canonical('San Francisco',{exact:q==='San Francisco'})],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})});
 const first=selectCanonical(await h.locations.suggest('San Fransisco',session));const resolved=await h.locations.retrieve(first.id,session,first.receipt);await h.locations.retrieve(first.id,session,first.receipt);assert.equal(h.calls.length,0);
 clock+=30000;const otherSelection=selectCanonical(await h.locations.suggest('San Francisco',other));const cached=await h.locations.retrieve(otherSelection.id,other,otherSelection.receipt);assert.equal(cached.location.latitude,resolved.location.latitude);assert.equal(cached.location.quality.local.method,'exact');assert.equal(cached.location.quality.kind,'canonical_exact');assert.equal(h.calls.length,0);
 clock+=120001;await assert.rejects(h.locations.retrieve(first.id,session,first.receipt),e=>e.code==='LOCATION_SELECTION_INVALID');
 const fresh=selectCanonical(await h.locations.suggest('San Fransisco',session));await h.locations.retrieve(fresh.id,session,fresh.receipt);const replay=await h.locations.forward('San Francisco, CA');assert.equal(replay.location.longitude,sourceRows['San Francisco'].longitude);assert.equal(replay.location.quality.coordinateSource,'reference');assert.equal(h.calls.length,0);
});
test('reference resolution cache is factory-local and does not authorize a forged replay',async()=>{
 const options={local:[canonical('San Francisco')],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})};
 const a=harness(options),b=harness(options),sa=selectCanonical(await a.locations.suggest('San Fransisco',session)),sb=selectCanonical(await b.locations.suggest('San Fransisco',session));
 await a.locations.retrieve(sa.id,session,sa.receipt);const local=await a.locations.forward('San Francisco, CA');assert.equal(local.location.quality.coordinateSource,'reference');assert.equal(a.calls.length,0);
 const independent=await b.locations.forward('San Francisco, CA');assert.equal(independent.location.source,'provider');assert.equal(b.calls.length,1);
 const selected=await b.locations.retrieve(sb.id,session,sb.receipt);assert.equal(selected.location.quality.coordinateSource,'reference');assert.equal(selected.location.longitude,sourceRows['San Francisco'].longitude);assert.equal(b.calls.length,1);
 await assert.rejects(a.locations.retrieve(sa.id,other,sa.receipt),e=>e.code==='LOCATION_SELECTION_INVALID');assert.equal(a.calls.length,0);
});

test('coarse city URL restoration reuses a recent canonical reference point without another lookup and refreshes after expiry',async()=>{
 let clock=1800000000000;const h=harness({now:()=>clock,local:q=>[canonical('San Francisco',{exact:q==='San Francisco'})],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})});
 const choice=selectCanonical(await h.locations.suggest('San Fransisco',session));const selected=(await h.locations.retrieve(choice.id,session,choice.receipt)).location;const priorCalls=h.calls.length,priorReferenceCalls=h.referenceCalls.length;
 for(const query of ['San Francisco, CA','san francisco CA']){const restored=await h.locations.forward(query);assert.equal(restored.location.latitude,selected.latitude);assert.equal(restored.location.longitude,selected.longitude);assert.equal(restored.location.quality.precision,'city');assert.match(restored.location.quality.explanation,/Restored.*Census representative/);assert.equal(restored.location.quality.coordinateSource,'reference');assert(validLocationQuality(restored.location.quality));}
 assert.equal(h.calls.length,priorCalls);assert.equal(h.referenceCalls.length,priorReferenceCalls);
 clock+=120001;const fresh=await h.locations.forward('San Francisco, CA');assert.equal(fresh.location.longitude,sourceRows['San Francisco'].longitude);assert.equal(fresh.location.quality.coordinateSource,'reference');assert.equal(h.calls.length,priorCalls);assert.equal(h.referenceCalls.length,priorReferenceCalls+1);
});
test('street, ZIP and conflicting-state inputs cannot reuse a cached canonical city point',async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async url=>{
  if(!url.pathname.endsWith('/search'))return Response.json({results:[]});
  const point=url.searchParams.get('type')==='postcode'?providerCity('San Francisco','CA',{result_type:'postcode',postcode:'94103',lat:37.773,lon:-122.41,formatted:'94103, CA'}):providerCity();return Response.json({results:[point]});
 }});
 const choice=selectCanonical(await h.locations.suggest('San Fransisco',session));const city=(await h.locations.retrieve(choice.id,session,choice.receipt)).location;const before=h.calls.length;
 await assert.rejects(h.locations.forward('123 Main Street, San Francisco, CA'),e=>e.status===422);assert.equal(h.calls.length,before);
 const postal=(await h.locations.forward('94103')).location;assert.equal(h.calls.length,before+1);assert.equal(h.calls.at(-1).url.searchParams.get('type'),'postcode');assert.equal(postal.quality.precision,'postcode');assert.notEqual(postal.latitude,city.latitude);assert.notEqual(postal.longitude,city.longitude);
 await assert.rejects(h.locations.forward('San Francisco, TX'),e=>e.status===422&&e.code==='LOCATION_NOT_FOUND');assert.equal(h.calls.length,before+2);
});
test('an aborted coarse restoration cannot return the cached city point or make another provider request',async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})}),choice=selectCanonical(await h.locations.suggest('San Fransisco',session));await h.locations.retrieve(choice.id,session,choice.receipt);const before=h.calls.length;
 const controller=new AbortController();controller.abort();await assert.rejects(h.locations.forward('San Francisco, CA',controller.signal),e=>e.name==='AbortError');assert.equal(h.calls.length,before);
});

test('first exact coarse forward seeds public-city cache for repeated navigation and expiry refresh',async()=>{
 let clock=1800000000000;const h=harness({now:()=>clock,reference:false,fetcher:async()=>Response.json({results:[providerCity()]})});
 const first=(await h.locations.forward('San Francisco, CA')).location;assert.equal(h.calls.length,1);assert.equal(first.quality.precision,'city');
 for(const query of ['San Francisco, CA','san francisco CA']){const replay=(await h.locations.forward(query)).location;assert.equal(replay.latitude,first.latitude);assert.equal(replay.longitude,first.longitude);assert.match(replay.quality.explanation,/Restored coarse/);}
 assert.equal(h.calls.length,1);assert.equal(h.referenceCalls.length,0);
 const controller=new AbortController();controller.abort();await assert.rejects(h.locations.forward('San Francisco, CA',controller.signal),e=>e.name==='AbortError');assert.equal(h.calls.length,1);
 clock+=120001;await h.locations.forward('San Francisco, CA');assert.equal(h.calls.length,2);await h.locations.forward('San Francisco, CA');assert.equal(h.calls.length,2);
});
test('successful postal and street-looking forward results never seed public-city cache; ambiguity is never cached',async()=>{
 const h=harness({fetcher:async url=>{
  const query=url.searchParams.get('text');if(url.searchParams.get('type')==='postcode')return Response.json({results:[providerCity('San Francisco','CA',{result_type:'postcode',postcode:'94103'})]});
  if(query==='Springfield')return Response.json({results:[providerCity('Springfield','MA'),providerCity('Springfield','IL')]});
  return Response.json({results:[providerCity('Main Street','CA')]});
 }});
 await h.locations.forward('94103');await h.locations.forward('94103');assert.equal(h.calls.length,2);assert(h.calls.every(c=>c.url.searchParams.get('type')==='postcode'));
 await h.locations.forward('Main Street, CA');await h.locations.forward('Main Street, CA');assert.equal(h.calls.length,4);
 for(let i=0;i<2;i++)await assert.rejects(h.locations.forward('Springfield'),e=>e.status===422&&e.code==='LOCATION_NOT_FOUND');assert.equal(h.calls.length,6);
});
test('canonical selection preserves its signed reference point even after a prior exact provider resolution',async()=>{
 const h=harness({local:[canonical('San Francisco')],fetcher:async url=>Response.json({results:url.pathname.endsWith('/search')?[providerCity()]:[]})});
 const coarse=(await h.locations.forward('San Francisco, CA')).location;assert.equal(h.calls.length,1);
 const choice=selectCanonical(await h.locations.suggest('San Fransisco',session));assert.equal(h.calls.length,1);const selected=(await h.locations.retrieve(choice.id,session,choice.receipt)).location;
 assert.equal(h.calls.length,1);assert.equal(selected.latitude,sourceRows['San Francisco'].latitude);assert.equal(selected.longitude,sourceRows['San Francisco'].longitude);assert.notEqual(selected.longitude,coarse.longitude);assert.equal(selected.source,'reference');assert.equal(selected.quality.source,'reference');assert.equal(selected.quality.coordinateSource,'reference');assert.equal(selected.quality.reference.geographicId,'0667000');assert.equal(selected.quality.local.method,'fuzzy');assert(validLocationQuality(selected.quality));
});

test('credible canonical state correction is answered locally before unrelated provider alternatives',async()=>{
 const strong=providerCity('Pennsylvania','AL',{place_id:'fixture.pennsylvania.AL',lat:33,lon:-86});
 const uncertain=Array.from({length:4},(_,i)=>providerCity('Pennsylvania','AL',{place_id:'fixture.uncertain.street.'+i,result_type:'street',address_line1:'Pennsylvania Avenue '+i,rank:{confidence:.5,confidence_street_level:.5,match_type:'match_by_street'}}));
 const h=harness({rows:[strong,...uncertain],local:[canonical('Pennsylvania',{query:'Pensylvania'})]});const result=await h.locations.suggest('Pensylvania',session);assert.equal(result.suggestions.length,1);assert.equal(result.providerStatus,'not_needed');
 const state=selectCanonical(result);assert(state);assert.equal(result.suggestions.indexOf(state),0);assert.equal(state.quality.kind,'canonical_correction');assert.equal(state.quality.precision,'state');assert.equal(issuedPayload(state).state,'PA');assert.equal(h.calls.length,0);
});
