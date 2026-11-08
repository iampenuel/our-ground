// Deterministic location fixtures only. No live providers, Redis or database writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocationSearch} from '../backend/location-search.ts';
import {handleLocationSearch} from '../backend/location-api.ts';
import {validLocationQuality} from '../backend/location-quality-validation.ts';
import {PublicProtectionError} from '../backend/anonymous-protection.ts';

const session='12345678-1234-4234-8234-123456789abc';
const anotherSession='12345678-1234-4234-8234-123456789abd';
const env={GEOAPIFY_SERVER_API_KEY:'REPLACE_ME_REFERENCE_FIRST_TEST_KEY',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true',GEOAPIFY_LOCATION_MAX_RETRIES:'0'};
const rows={
 sf:{id:'census:2026:place:0667000',canonical_name:'San Francisco city',display_name:'San Francisco',state:'CA',kind:'place',latitude:37.727239,longitude:-123.032229},
 chicago:{id:'census:2026:place:1714000',canonical_name:'Chicago city',display_name:'Chicago',state:'IL',kind:'place',latitude:41.837045,longitude:-87.684939},
 boston:{id:'census:2026:place:2507000',canonical_name:'Boston city',display_name:'Boston',state:'MA',kind:'place',latitude:42.332735,longitude:-71.013513},
 philadelphia:{id:'census:2026:place:4260000',canonical_name:'Philadelphia city',display_name:'Philadelphia',state:'PA',kind:'place',latitude:40.009297,longitude:-75.133271},
 // Synthetic coordinates for identity/ambiguity tests; not claims of live Census coordinates.
 nyCity:{id:'census:2026:place:3651000',canonical_name:'New York city',display_name:'New York',state:'NY',kind:'place',latitude:40.7,longitude:-74},
 nyState:{id:'census:2026:state:36',canonical_name:'New York',display_name:'New York',state:'NY',kind:'state',latitude:43,longitude:-75},
 nyFlorida:{id:'census:2026:place:1248725',canonical_name:'New York',display_name:'New York',state:'FL',kind:'place',latitude:30.9,longitude:-87.2}
};
function candidate(name,{exact=false,ambiguous=1,patch={}}={}){
 const row=structuredClone(rows[name]);
 return {...row,coordinate_precision:'representative',source:{provider:'census',id:'census-gazetteer-2026',url:'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html',vintage:2026,geographic_id:row.id.split(':').at(-1),geoid_fq:'fixture-geographic-identity',ansi_code:null,imported_at:'2026-11-05T00:00:00Z'},match:{method:exact?'exact':'fuzzy',query:row.display_name,matched_name:row.display_name,local_similarity:exact?1:.7,edit_distance:exact?0:1,exact_match:exact,ambiguous_matches:ambiguous},...patch};
}
function providerCity({city='San Francisco',state='CA',stateName='California',extra={}}={}){
 return{place_id:'fixture.provider.'+state,city,name:city,state_code:state,state:stateName,country:'United States',country_code:'us',lat:37.7749,lon:-122.4194,result_type:'city',formatted:city+', '+state,address_line1:city,address_line2:state,rank:{confidence:.99,confidence_city_level:.99,match_type:'full_match'},...extra};
}
function harness({local=[],reference=true,referenceFailure,providerRows=[],providerStatus=200,admissionFailure}={}){
 const providerCalls=[],referenceCalls=[],admissions=[];
 const ref=reference?{findCandidates:async(query,state,limit,signal)=>{
  signal?.throwIfAborted();referenceCalls.push({query,state,limit});
  if(referenceFailure)throw referenceFailure;
  return typeof local==='function'?local(query,state,limit,signal):structuredClone(local);
 }}:undefined;
 const provider=createLocationSearch({env,reference:ref,signingKey:'REPLACE_ME_REFERENCE_FIRST_TEST_SIGNING',now:()=>1800000000000,fetcher:async(url,init)=>{
  providerCalls.push({url:new URL(url),signal:init?.signal});
  return providerStatus===200?Response.json({results:providerRows}):new Response('',{status:providerStatus});
 }});
 const admit=async()=>{admissions.push(true);if(admissionFailure)throw admissionFailure;};
 return{
  provider,providerCalls,referenceCalls,admissions,admit,
  suggest:(query,signal)=>provider.suggest(query,session,signal,undefined,undefined,admit),
  retrieve:(suggestion,token=session,receipt=suggestion.receipt,signal)=>provider.retrieve(suggestion.id,token,receipt,signal,undefined,undefined,admit)
 };
}
const payload=suggestion=>JSON.parse(Buffer.from(suggestion.receipt.split('.')[0],'base64url').toString()).location;

test('new yor keeps all returned Census city/state jurisdictions without a provider or provider-admission request',async()=>{
 const local=['nyFlorida','nyCity','nyState'].map(name=>candidate(name,{ambiguous:3})),h=harness({local});
 const result=await h.suggest('new yor');
 assert.deepEqual(new Set(result.suggestions.map(s=>s.id)),new Set(local.map(s=>s.id)));
 assert.equal(result.location,undefined);
 assert(result.suggestions.some(s=>s.quality.precision==='state'));
 assert(result.suggestions.some(s=>s.primary.includes('FL')));
 assert(result.suggestions.some(s=>s.primary.includes('NY')&&s.quality.precision==='city'));
 assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
 assert(!['quota','timeout','unavailable'].includes(result.providerStatus));
 const ny=result.suggestions.find(s=>s.id===rows.nyCity.id),selected=await h.retrieve(ny);
 assert.equal(selected.location.state,'NY');assert.equal(selected.location.source,'reference');
 assert.equal(selected.location.latitude,rows.nyCity.latitude);
 assert.equal(selected.location.quality.coordinateSource,'reference');
 assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
});

for(const [query,name] of [['San Fransisco','sf'],['Chcago','chicago'],['Boson, MA','boston'],['Philidelphia, PA','philadelphia']]){
 test(query+' uses signed Census correction and representative selection with no Geoapify request',async()=>{
  const h=harness({local:[candidate(name)]}),result=await h.suggest(query);
  assert.equal(result.suggestions.length,1);
  const s=result.suggestions[0],decoded=payload(s);
  assert.equal(s.quality.source,'reference');assert.equal(s.quality.kind,'canonical_correction');
  assert.equal(s.quality.precision,'city');assert.equal(s.quality.provider,undefined);
  assert.equal(decoded.latitude,rows[name].latitude);assert.equal(decoded.longitude,rows[name].longitude);
  assert(validLocationQuality(s.quality));
  const found=await h.retrieve(s);
  assert.equal(found.location.latitude,rows[name].latitude);assert.equal(found.location.longitude,rows[name].longitude);
  assert.equal(found.location.quality.coordinateSource,'reference');
  assert.match(found.location.quality.explanation,/representative|not.*address/i);
  assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
 });
}

test('local reference selection rejects forged IDs, signatures and sessions before any provider admission',async()=>{
 const h=harness({local:[candidate('sf')]}),s=(await h.suggest('San Fransisco')).suggestions[0];
 const signature=s.receipt.split('.')[1],changed=s.receipt.split('.')[0]+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1);
 for(const [id,token,receipt] of [[s.id+':forged',session,s.receipt],[s.id,anotherSession,s.receipt],[s.id,session,changed]]){
  await assert.rejects(h.provider.retrieve(id,token,receipt,undefined,undefined,undefined,h.admit),e=>e.status===422&&e.code==='LOCATION_SELECTION_INVALID');
 }
 assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
});

test('explicit-state conflict cannot acquire an out-of-state Census identity and uses the admitted provider path',async()=>{
 const h=harness({local:[candidate('sf')],providerRows:[providerCity()]});
 assert.deepEqual((await h.suggest('San Fransisco, TX')).suggestions,[]);
 assert.equal(h.referenceCalls[0].state,'TX');
 assert.equal(h.providerCalls.length,1);assert.equal(h.admissions.length,1);
});

test('missing or empty reference data retains the existing admitted provider lookup',async()=>{
 for(const options of [{reference:false},{local:[]}]){
  const h=harness({...options,providerRows:[providerCity()]});
  const result=await h.suggest('San Francisco, CA');
  assert.equal(result.suggestions[0].id,'fixture.provider.CA');
  assert.equal(result.suggestions[0].quality.source,'geoapify');
  assert.equal(h.providerCalls.length,1);assert.equal(h.admissions.length,1);
 }
});

test('street input may offer only a labeled city fallback and cannot turn reference coordinates into a building match',async()=>{
 const wrongBuilding=providerCity({city:'Boston',state:'MA',stateName:'Massachusetts',extra:{place_id:'fixture.wrong.house',housenumber:'999',address_line1:'999 Main Street',result_type:'building',rank:{confidence:1,confidence_building_level:1,confidence_street_level:1,match_type:'full_match'}}});
 const h=harness({local:[candidate('boston',{exact:true})],providerRows:[wrongBuilding]});
 const result=await h.suggest('123 Main Street, Boston, MA');
 assert.equal(h.providerCalls.length,1);assert.equal(h.admissions.length,1);
 assert(!result.suggestions.some(s=>s.id==='fixture.wrong.house'));
 assert(result.suggestions.every(s=>s.quality.precision!=='building'));
 const fallback=result.suggestions.find(s=>s.id===rows.boston.id);
 assert(fallback);assert.equal(fallback.quality.kind,'city_fallback');
 assert.match(fallback.quality.explanation,/not confirmed|does not validate/i);
});

test('leading-zero ZIP remains a provider postal-area path and never consumes a Census city as an address',async()=>{
 const postcode=providerCity({city:'Boston',state:'MA',stateName:'Massachusetts',extra:{place_id:'fixture.postcode.02108',postcode:'02108',result_type:'postcode',address_line1:'02108'}});
 const h=harness({local:[candidate('boston',{exact:true})],providerRows:[postcode]});
 const result=await h.suggest('02108');
 assert.equal(h.referenceCalls.length,0);assert.equal(h.providerCalls.length,1);assert.equal(h.admissions.length,1);
 assert.equal(h.providerCalls[0].url.searchParams.get('text'),'02108');
 assert.equal(result.suggestions[0].quality.precision,'postcode');
 assert.match(result.suggestions[0].quality.explanation,/not an individual delivery address/);
});

test('reference lookup failure can use the admitted provider while provider quota remains a specific error',async()=>{
 const h=harness({referenceFailure:Error('Mock reference unavailable'),providerRows:[providerCity()]});
 const result=await h.suggest('San Francisco, CA');
 assert.equal(result.suggestions[0].quality.source,'geoapify');
 assert.equal(h.providerCalls.length,1);assert.equal(h.admissions.length,1);
 const limited=harness({referenceFailure:Error('Mock reference unavailable'),providerStatus:429});
 await assert.rejects(limited.suggest('Unknown city'),e=>e.status===429&&e.code==='LOCATION_PROVIDER_LIMIT');
 assert.equal(limited.providerCalls.length,1);assert.equal(limited.admissions.length,1);
});

test('provider-admission Redis failure does not consume a provider call and is never presented as successful empty data',async()=>{
 const failure=Object.assign(Error('Request protection is temporarily unavailable.'),{status:503,code:'ABUSE_PROTECTION_UNAVAILABLE',retryAfter:60});
 const h=harness({admissionFailure:failure});
 await assert.rejects(h.suggest('Unknown city'),e=>e===failure);
 assert.equal(h.admissions.length,1);assert.equal(h.providerCalls.length,0);
 const local=harness({local:[candidate('sf')],admissionFailure:failure});
 assert((await local.suggest('San Fransisco')).suggestions.length);
 assert.equal(local.admissions.length,0);assert.equal(local.providerCalls.length,0);
});

test('public request admission remains fail-closed before any local reference lookup',async()=>{
 const failure=Object.assign(Error('Request protection is temporarily unavailable.'),{status:503,code:'ABUSE_PROTECTION_UNAVAILABLE',retryAfter:60});
 const h=harness({local:[candidate('sf')]});
 const request=new Request('http://localhost/api/v1/locations/suggest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:'San Fransisco',sessionToken:session})});
 let admissions=0;
 await assert.rejects(handleLocationSearch(request,'/locations/suggest',h.provider,{admit:async()=>{admissions++;throw failure;}}),e=>e===failure);
 assert.equal(admissions,1);assert.equal(h.referenceCalls.length,0);assert.equal(h.providerCalls.length,0);
});

test('cancellation during reference lookup never falls through to provider admission',async()=>{
 const abort=new AbortController();
 const h=harness({local:async(_query,_state,_limit,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 })});
 const pending=h.suggest('San Fransisco',abort.signal);abort.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
});


test('address city fallback distinguishes Our Ground admission limits from actual Geoapify quota',async()=>{
 const limited=harness({local:[candidate('boston',{exact:true})],admissionFailure:new PublicProtectionError(429,'RATE_LIMITED','Too many requests. Please wait before trying again.',60)});
 const result=await limited.suggest('123 Main Street, Boston, MA');
 assert.equal(result.providerStatus,'limited');assert.match(result.notice,/Our Ground/);assert(!/Geoapify.*quota|shared allowance/i.test(result.notice));
 assert.equal(result.suggestions[0].quality.kind,'city_fallback');assert.equal(result.suggestions[0].quality.source,'reference');
 assert.equal(limited.providerCalls.length,0);assert.equal(limited.admissions.length,1);
 const upstream=harness({local:[candidate('boston',{exact:true})],providerStatus:429});
 const quota=await upstream.suggest('123 Main Street, Boston, MA');
 assert.equal(quota.providerStatus,'quota');assert.equal(quota.suggestions[0].quality.kind,'city_fallback');
 assert(!/Our Ground address lookup is temporarily limited/.test(quota.notice));
 assert.equal(upstream.providerCalls.length,1);assert.equal(upstream.admissions.length,1);
});

test('fresh coarse New York NY restoration chooses the exact Census city and state code chooses the state without Geoapify',async()=>{
 const local=[candidate('nyFlorida',{exact:true,ambiguous:3}),candidate('nyState',{exact:true,ambiguous:3}),candidate('nyCity',{exact:true,ambiguous:3})];
 const city=harness({local});
 const selected=await city.provider.forward('New York, NY');
 assert.equal(selected.location.state,'NY');assert.equal(selected.location.source,'reference');assert.equal(selected.location.quality.precision,'city');
 assert.equal(selected.location.quality.reference.geographicId,'3651000');
 assert.equal(selected.location.latitude,rows.nyCity.latitude);assert.equal(selected.location.longitude,rows.nyCity.longitude);
 assert.equal(selected.location.quality.coordinateSource,'reference');
 assert.equal(city.providerCalls.length,0);assert.equal(city.admissions.length,0);
 const state=harness({local}),stateResult=await state.provider.forward('NY');
 assert.equal(stateResult.location.quality.precision,'state');assert.equal(stateResult.location.quality.reference.geographicId,'36');
 assert.equal(stateResult.location.latitude,rows.nyState.latitude);assert.equal(state.providerCalls.length,0);
 const ambiguous=harness({local});
 await assert.rejects(ambiguous.provider.forward('New York'),e=>e.status===422&&e.code==='LOCATION_NOT_FOUND');
 assert.equal(ambiguous.providerCalls.length,1);
});

test('a coarse forward reference response arriving after cancellation cannot return a point or dispatch Geoapify',async()=>{
 let release,started;const entered=new Promise(resolve=>{started=resolve;});
 const h=harness({local:()=>new Promise(resolve=>{release=()=>resolve([candidate('nyCity',{exact:true})]);started();})});
 const abort=new AbortController(),pending=h.provider.forward('New York, NY',abort.signal);
 await entered;abort.abort();release();
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(h.providerCalls.length,0);assert.equal(h.admissions.length,0);
});
