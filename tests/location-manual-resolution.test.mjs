import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLocationSearch} from '../backend/location-search.ts';
import {handleApi} from '../backend/app.ts';
import {createPublicProtection,PublicProtectionError} from '../backend/anonymous-protection.ts';

const session='12345678-1234-4234-8234-123456789abc',other='12345678-1234-4234-8234-123456789abd';
const env={GEOAPIFY_SERVER_API_KEY:'REPLACE_ME_MANUAL_RESOLVE_KEY',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true',GEOAPIFY_LOCATION_MAX_RETRIES:'0'};
const records={
 ny:{id:'census:2026:place:3651000',name:'New York',canonical:'New York city',state:'NY',kind:'place',latitude:40.7,longitude:-74},
 nyState:{id:'census:2026:state:36',name:'New York',canonical:'New York',state:'NY',kind:'state',latitude:43,longitude:-75},
 nyFL:{id:'census:2026:place:1248725',name:'New York',canonical:'New York CDP',state:'FL',kind:'place',latitude:30.9,longitude:-87.2},
 sf:{id:'census:2026:place:0667000',name:'San Francisco',canonical:'San Francisco city',state:'CA',kind:'place',latitude:37.727239,longitude:-123.032229},
 philly:{id:'census:2026:place:4260000',name:'Philadelphia',canonical:'Philadelphia city',state:'PA',kind:'place',latitude:40.009297,longitude:-75.133271},
 boston:{id:'census:2026:place:2507000',name:'Boston',canonical:'Boston city',state:'MA',kind:'place',latitude:42.332735,longitude:-71.013513},
 pa:{id:'census:2026:state:42',name:'Pennsylvania',canonical:'Pennsylvania',state:'PA',kind:'state',latitude:40.9,longitude:-77.8},
 springIL:{id:'census:2026:place:1772000',name:'Springfield',canonical:'Springfield city',state:'IL',kind:'place',latitude:39.8,longitude:-89.6},
 springMA:{id:'census:2026:place:2567000',name:'Springfield',canonical:'Springfield city',state:'MA',kind:'place',latitude:42.1,longitude:-72.6}
};
function canonical(key,{exact=false,matches=1,edits=1}={}){
 const r=records[key];return{id:r.id,canonical_name:r.canonical,display_name:r.name,state:r.state,kind:r.kind,latitude:r.latitude,longitude:r.longitude,coordinate_precision:'representative',
 source:{provider:'census',id:'census-gazetteer-2026',url:'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html',vintage:2026,geographic_id:r.id.split(':').at(-1),geoid_fq:'fixture-identity',ansi_code:null,imported_at:'2026-11-06T00:00:00Z'},
 match:{method:exact?'exact':'fuzzy',query:r.name,matched_name:r.name,local_similarity:exact?1:.6,edit_distance:exact?0:edits,exact_match:exact,ambiguous_matches:matches}};
}
function provider(extra={}){return{place_id:'fixture.boston',name:'Boston',city:'Boston',state:'Massachusetts',state_code:'MA',country:'United States',country_code:'us',lat:42.36,lon:-71.06,result_type:'city',address_line1:'Boston',formatted:'Boston, MA',rank:{confidence:.99,confidence_city_level:.99,match_type:'full_match'},...extra};}
function harness({local=[],rows=[],status=200,reference=true}={}){
 const references=[],calls=[],admissions=[];let time=1800000000000;
 const api=createLocationSearch({env,now:()=>time,signingKey:'REPLACE_ME_MANUAL_RESOLVE_SIGNING',reference:reference?{findCandidates:async(q,state,limit,signal)=>{references.push({q,state,limit});return typeof local==='function'?await local(q,state,limit,signal):structuredClone(local);}}:undefined,fetcher:async(url)=>{calls.push(new URL(url));return status===200?Response.json({results:rows}):new Response('',{status});}});
 const admit=async()=>{admissions.push(true);};
 return{api,references,calls,admissions,advance:ms=>{time+=ms},resolve:(q,choices,signal)=>api.resolve(q,session,choices,signal,undefined,undefined,admit),suggest:q=>api.suggest(q,session,undefined,undefined,undefined,admit)};
}
const reusable=suggestions=>suggestions.map(({id,receipt})=>({id,receipt}));
const request=(endpoint,body)=>new Request('https://app.example/api/v1/locations/'+endpoint,{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:JSON.stringify(body)});
const deps=(locations,publicProtection)=>({locations,publicProtection,repo:{},allowDemo:false});

test('correct city submits without a provider suggestion ID and keeps representative evidence',async()=>{
 const h=harness({local:[canonical('boston',{exact:true})]}),r=await h.resolve('Boston MA');
 assert.equal(r.status,'resolved');assert.equal(r.location.label,'Boston, MA');assert.equal(r.interpretation.corrected,false);assert.equal(r.location.quality.coordinateSource,'reference');assert.equal(h.references.length,1);assert.equal(h.calls.length,1);assert.equal(h.admissions.length,1);
});
for(const[query,key]of [['New Yrok NY','ny'],['San Fransisco CA','sf'],['Philidelphia PA','philly']])test(query+' automatically resolves one credible generic correction',async()=>{
 const h=harness({local:[canonical(key,{edits:query.startsWith('New')?2:1})]}),r=await h.resolve(query);
 assert.equal(r.status,'resolved');assert.equal(r.interpretation.corrected,true);assert.equal(r.interpretation.query,query);assert.equal(r.location.latitude,records[key].latitude);assert.equal(r.location.longitude,records[key].longitude);assert.equal(r.interpretation.scope,'city');assert.equal(h.calls.length,1);assert.equal(h.admissions.length,1);
});
test('explicit city/state context rejects competing state and out-of-state canonical alternatives',async()=>{
 const h=harness({local:[canonical('ny',{matches:3,edits:2}),canonical('nyState',{matches:3,edits:2}),canonical('nyFL',{matches:3,edits:2})]});
 const r=await h.resolve('New Yrok NY');assert.equal(r.status,'resolved');assert.equal(r.location.state,'NY');assert.equal(r.location.quality.precision,'city');assert.equal(h.calls.length,1);
});
test('ambiguous city returns signed choices and never assigns a geographic center',async()=>{
 const h=harness({local:[canonical('springIL',{exact:true,matches:22}),canonical('springMA',{exact:true,matches:22})]}),r=await h.resolve('Springfield');
 assert.equal(r.status,'choose_location');assert.equal(r.reason,'ambiguous');assert.equal(r.location,undefined);assert.equal(r.choices.length,2);assert(r.choices.every(c=>c.receipt));assert.equal(h.calls.length,0);
});
test('submitting a subset of ambiguous choices cannot manufacture automatic eligibility',async()=>{
 const h=harness({local:[canonical('springIL',{exact:true,matches:22}),canonical('springMA',{exact:true,matches:22})]});
 const offered=await h.suggest('Springfield'),r=await h.resolve('Springfield',reusable(offered.suggestions.slice(0,1)));
 assert.equal(r.status,'choose_location');assert.equal(r.location,undefined);assert.equal(h.references.length,1);assert.equal(h.calls.length,0);
});
test('completed suggestion receipts avoid a second lookup while accepting only whitespace/case-equivalent query',async()=>{
 const h=harness({local:[canonical('sf')]}),offered=await h.suggest('San Fransisco CA');
 const r=await h.resolve('  SAN   FRANSISCO ca ',reusable(offered.suggestions));assert.equal(r.status,'resolved');assert.equal(h.references.length,1);assert.equal(h.calls.length,1);
 await assert.rejects(h.resolve('San Fransisco TX',reusable(offered.suggestions)),e=>e.status===422&&e.code==='LOCATION_SELECTION_INVALID');assert.equal(h.references.length,1);
});
test('receipt query binding retains meaningful unit and address punctuation',async()=>{
 const h=harness({rows:[provider({place_id:'fixture.unit',housenumber:'123',address_line1:'123 Main Street #2',formatted:'123 Main Street #2, Boston, MA',result_type:'building',rank:{confidence:1,confidence_building_level:1,confidence_street_level:1,match_type:'full_match'}})]});
 const offered=await h.suggest('123 Main Street #2, Boston, MA');
 assert.equal(offered.suggestions.length,1);
 await assert.rejects(h.resolve('123 Main Street #3, Boston, MA',reusable(offered.suggestions)),e=>e.status===422);assert.equal(h.calls.length,1);
});
test('reused receipts reject another session, forged signatures, expiry and extra fields before lookup',async()=>{
 const h=harness({local:[canonical('sf')]}),s=(await h.suggest('San Fransisco CA')).suggestions[0],choices=reusable([s]);
 await assert.rejects(h.api.resolve('San Fransisco CA',other,choices),e=>e.status===422);
 await assert.rejects(h.resolve('San Fransisco CA',[{...choices[0],receipt:s.receipt+'.extra'}]),e=>e.status===422);
 await assert.rejects(h.resolve('San Fransisco CA',[{...choices[0],latitude:1}]),e=>e.status===422);
 h.advance(120000);await assert.rejects(h.resolve('San Fransisco CA',choices),e=>e.status===422);assert.equal(h.references.length,1);assert.equal(h.calls.length,0);
});
test('state submission narrows rather than searching a state centroid radius',async()=>{
 const h=harness({local:[canonical('pa',{exact:true})]}),r=await h.resolve('Pennsylvania');
 assert.equal(r.status,'narrow_location');assert.equal(r.interpretation.scope,'state');assert.match(r.notice,/city or ZIP/);assert.equal(h.calls.length,0);
});
test('provider county result narrows and cannot masquerade as a city point',async()=>{
 const h=harness({rows:[provider({name:'Allegheny County',city:undefined,state:'Pennsylvania',state_code:'PA',result_type:'county',formatted:'Allegheny County, PA',address_line1:'Allegheny County'})]});
 const r=await h.resolve('Allegheny County PA');assert.equal(r.status,'narrow_location');assert.equal(r.interpretation.scope,'area');assert.match(r.notice,/county or region/);
});
test('leading-zero ZIP submits as a supported postal area without a selection requirement',async()=>{
 const h=harness({rows:[provider({place_id:'fixture.postcode',result_type:'postcode',postcode:'02108',address_line1:'02108',formatted:'02108, Boston, MA'})]});
 const r=await h.resolve('02108');assert.equal(r.status,'resolved');assert.equal(r.location.quality.precision,'postcode');assert.equal(r.interpretation.scope,'point');assert.equal(h.calls[0].searchParams.get('text'),'02108');assert.equal(h.admissions.length,1);
});
test('one high-confidence matching building resolves without forcing a city fallback choice',async()=>{
 const h=harness({local:[canonical('boston',{exact:true})],rows:[provider({housenumber:'123',address_line1:'123 Main Street',formatted:'123 Main Street, Boston, MA',result_type:'building',rank:{confidence:1,confidence_building_level:1,confidence_street_level:1,match_type:'full_match'}})]});
 const r=await h.resolve('123 Main Street, Boston, MA');assert.equal(r.status,'resolved');assert.equal(r.location.quality.precision,'building');assert.equal(r.location.source,'provider');assert.equal(h.calls.length,1);
});
test('wrong building and uncertain street require explicit review or Search the city instead',async()=>{
 const h=harness({local:[canonical('boston',{exact:true})],rows:[provider({housenumber:'999',address_line1:'999 Main Street',formatted:'999 Main Street, Boston, MA',result_type:'building',rank:{confidence:1,confidence_building_level:1,confidence_street_level:1,match_type:'full_match'}})]});
 const r=await h.resolve('123 Main Street, Boston, MA');assert.equal(r.status,'choose_location');assert.equal(r.reason,'precision_change');assert.equal(r.location,undefined);assert(r.choices.every(c=>c.quality.precision==='city'&&c.quality.kind==='city_fallback'));assert.match(r.notice,/exact address is not confirmed/i);assert.equal(h.calls.length,1);
});
test('no credible source result returns not_found without stale or invented coordinates',async()=>{
 const h=harness(),r=await h.resolve('Unrecognizable matching fixture');assert.equal(r.status,'not_found');assert.equal(r.location,undefined);assert.deepEqual(r.choices,[]);assert.equal(h.calls.length,1);
});
test('manual submission has a separate bounded client action without changing provider admission',async()=>{
 const commands=[],token='REPLACE_ME_RESOLVE_REDIS_TOKEN',gate=createPublicProtection({NODE_ENV:'production',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:token},async(_url,init)=>{const command=JSON.parse(init.body);commands.push(command);return Response.json({result:command.at(-4)==='location_reference'?[0,35]:[1,0]});});
 const h=harness({local:[canonical('sf')]}),d=deps(h.api,gate);
 const auto=await handleApi(request('suggest',{q:'San Fransisco CA',sessionToken:session}),d);assert.equal(auto.status,429);
 const manual=await handleApi(request('resolve',{q:'San Fransisco CA',sessionToken:session}),d);assert.equal(manual.status,200);assert.equal((await manual.json()).status,'resolved');assert.deepEqual(commands.map(c=>c.at(-4)),['location_reference','location_submit','location']);assert.deepEqual(commands[1].slice(-3),['60','6','0']);assert.equal(h.calls.length,1);
});
for(const status of [429,503])test('manual admission '+status+' is fail-closed before local lookup',async()=>{
 const h=harness({local:[canonical('sf')]}),protection={admit:async action=>{assert.equal(action,'location_submit');throw new PublicProtectionError(status,status===429?'RATE_LIMITED':'ABUSE_PROTECTION_UNAVAILABLE','Manual search protection unavailable.',37);}};
 const response=await handleApi(request('resolve',{q:'San Fransisco CA',sessionToken:session}),deps(h.api,protection));assert.equal(response.status,status);assert.equal(h.references.length,0);assert.equal(h.calls.length,0);const body=await response.json();assert.equal(body.error.code,status===429?'LOCATION_SUBMISSION_LIMIT':'ABUSE_PROTECTION_UNAVAILABLE');if(status===429)assert.equal(response.headers.get('Retry-After'),'37');
});
test('provider-only manual resolution still obeys its original provider admission',async()=>{
 const h=harness({rows:[provider()]}),actions=[],protection={admit:async action=>{actions.push(action);if(action==='location')throw new PublicProtectionError(429,'RATE_LIMITED','Application provider lookup limit reached.',73);}};
 const response=await handleApi(request('resolve',{q:'Boston MA',sessionToken:session}),deps(h.api,protection));assert.equal(response.status,429);assert.equal((await response.json()).error.code,'RATE_LIMITED');assert.equal(response.headers.get('Retry-After'),'73');assert.deepEqual(actions,['location_submit','location']);assert.equal(h.calls.length,0);
});
test('manual API rejects unexpected fields, forged candidate shape and non-JSON bodies',async()=>{
 const h=harness({local:[canonical('sf')]}),d=deps(h.api,{admit:async()=>{}});
 for(const body of [{q:'San Fransisco CA',sessionToken:session,latitude:1},{q:'San Fransisco CA',sessionToken:session,choices:[]},{q:'San Fransisco CA',sessionToken:session,choices:[{id:'test',receipt:'test',latitude:1}]}]){const r=await handleApi(request('resolve',body),d);assert.equal(r.status,422);}
 const r=await handleApi(new Request('https://app.example/api/v1/locations/resolve',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'text/plain'},body:'text'}),d);assert.equal(r.status,415);assert.equal(h.calls.length,0);
});
test('canceled local resolution never selects a late point or dispatches a provider request',async()=>{
 let release;const h=harness({local:()=>new Promise(resolve=>{release=resolve})}),controller=new AbortController(),pending=h.resolve('Boston MA',undefined,controller.signal);
 await new Promise(resolve=>setTimeout(resolve,1));controller.abort();release([canonical('boston',{exact:true})]);await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(h.calls.length,0);assert.equal(h.admissions.length,0);
});



test('explicit ambiguous choice confirmation uses only query-bound returned identity without another lookup',async()=>{
 const h=harness({local:[canonical('springIL',{exact:true,matches:22}),canonical('springMA',{exact:true,matches:22})]}),first=await h.resolve('Springfield');
 assert.equal(first.status,'choose_location');const choices=reusable(first.choices),selected=await h.api.resolve('Springfield',session,choices,undefined,undefined,undefined,async()=>h.admissions.push(true),records.springMA.id);
 assert.equal(selected.status,'resolved');assert.equal(selected.location.state,'MA');assert.equal(h.references.length,1);assert.equal(h.calls.length,1);
 await assert.rejects(h.api.resolve('Springfield',session,choices,undefined,undefined,undefined,undefined,'census:2026:place:forged'),e=>e.status===422);
 await assert.rejects(h.api.resolve('Boston MA',session,choices,undefined,undefined,undefined,undefined,records.springMA.id),e=>e.status===422);
});
test('explicit city fallback uses manual admission even when autocomplete admission is rate-limited',async()=>{
 const h=harness({local:[canonical('boston',{exact:true})],rows:[provider({housenumber:'999',address_line1:'999 Main Street',result_type:'building'})]}),q='123 Main Street, Boston, MA',first=await h.resolve(q);
 assert.equal(first.status,'choose_location');const actions=[],protection={admit:async action=>{actions.push(action);if(action==='location_reference')throw new PublicProtectionError(429,'RATE_LIMITED','Autocomplete limited.',60);}};
 const res=await handleApi(request('resolve',{q,sessionToken:session,choices:reusable(first.choices),selectedId:first.choices[0].id}),deps(h.api,protection));
 assert.equal(res.status,200);const data=await res.json();assert.equal(data.status,'resolved');assert.equal(data.location.quality.kind,'city_fallback');assert.equal(data.location.quality.precision,'city');assert.deepEqual(actions,['location_submit','location']);assert.equal(h.calls.length,2);
});
test('explicit state choice still narrows rather than initiating centroid proximity',async()=>{
 const h=harness({local:[canonical('ny',{exact:true,matches:2}),canonical('nyState',{exact:true,matches:2})]}),first=await h.resolve('New York');
 assert.equal(first.status,'choose_location');
 const res=await h.api.resolve('New York',session,reusable(first.choices),undefined,undefined,undefined,undefined,records.nyState.id);
 assert.equal(res.status,'narrow_location');assert.equal(res.interpretation.scope,'state');assert.equal(h.calls.length,0);
});

