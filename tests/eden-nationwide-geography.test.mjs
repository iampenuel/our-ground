import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEdenCityId,edenCityQuery,validateEdenAction} from '../shared/eden-assistant.ts';
import {reduceEdenAgentInput,validateEdenAgentContext} from '../shared/eden-agent.ts';
import {projectPublicRequest,conversationChoices,validSymbols} from '../shared/eden-conversation.ts';
import {validateEdenLiveToolCall} from '../shared/eden-live.ts';
import {createLocationSearch} from '../backend/location-search.ts';
import {createDirectoryCityLookup,DirectoryLocationError} from '../backend/directory-city.ts';
import {createEdenDirectory} from '../backend/eden-directory.ts';
import {createEdenAgent} from '../backend/eden-agent.ts';
import {locationSearchScope} from '../shared/location-search.ts';

const rows=[
 ['Lanham','MD',38.96,-76.86],['Harrisburg','PA',40.27,-76.88],['Berkeley','CA',37.87,-122.27],
 ['Baltimore','MD',39.29,-76.61],['New York','NY',40.71,-74.01],['Philadelphia','PA',39.95,-75.16],
 ['San Francisco','CA',37.77,-122.42],['State College','PA',40.79,-77.86],['County Line','AL',33.82,-86.73],['Canary','OR',43.9,-124.1],['Monowi','NE',42.83,-98.33],['Berkeley','MO',38.75,-90.33]
];
const home={page:'home',directory:'public',synthetic:false,resultCount:0,resourceIds:[],searchState:'idle'};
const env={EDEN_GEMINI_MODE:'synthetic-development',EDEN_GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_API_KEY:'fixture-nonsecret',EDEN_LOCAL_DIRECTORY_ENABLED:'true',BACKEND_DATA_MODE:'postgres',ALLOW_DEMO_DATA:'false',DATABASE_URL:'fixture-presence'};
function candidate([name,state,latitude,longitude],matches=1,fuzzy=false){return{
 id:'census:2026:place:'+name.replaceAll(' ','-')+'-'+state,kind:'place',display_name:name,canonical_name:name+' city',state,latitude,longitude,coordinate_precision:'representative',
 match:{method:fuzzy?'fuzzy':'exact',exact_match:!fuzzy,ambiguous_matches:matches,local_similarity:fuzzy?.93:1,edit_distance:fuzzy?1:0},
 source:{provider:'census',id:'census-gazetteer-2026',vintage:2026,geographic_id:name+'-'+state,url:'https://www.census.gov/geographies/reference-files.html'}};}
function geography(){
 let upstream=0;
 const reference={async findCandidates(name,state){
   const cleaned=name.toLowerCase().replace(/ city$/,'');
   const matches=rows.filter(r=>(r[0].toLowerCase()===cleaned||cleaned==='san fransisco'&&r[0]==='San Francisco')&&(!state||state===r[1]));
   return matches.map(row=>candidate(row,matches.length,cleaned==='san fransisco'));
 },async findPostalArea(zip){return zip==='20706'?{latitude:38.96,longitude:-76.86}:undefined;}};
 const locations=createLocationSearch({env:{},reference,signingKey:'fixture-area-signing',fetcher:async()=>{upstream++;throw Error('No upstream calls in Census fixtures');}});
 const locate=createDirectoryCityLookup(reference,Date.now,locations);
 return{locations,locate,get upstream(){return upstream;}};
}
for(const query of ['Lanham, Maryland','Harrisburg, Pennsylvania','Berkeley, California','Baltimore, Maryland','New York City, New York','Philadelphia, Pennsylvania','San Francisco, California','San Fransisco','San Fransisco, CA','State College, PA','County Line, AL','Canary, OR','20706','Monowi, NE']){
 test('manual and Eden resolve the same public geography for '+query,async()=>{
  const g=geography(),city=normalizeEdenCityId(query);assert(city);
  const manual=await g.locations.resolve(edenCityQuery(city),'12345678-1234-4234-8234-123456789abc');assert.equal(manual.status,'resolved');
  const resolved=await g.locate(city);assert.equal(resolved.latitude,manual.location.latitude);assert.equal(resolved.longitude,manual.location.longitude);
  const input='Find healthcare in '+query+' within 10 miles.';
  const reduced=reduceEdenAgentInput(input,home);assert.equal(reduced.status,'supported');assert.equal(reduced.intent.goal,'find-resources');assert.equal(reduced.intent.cityId,city);
  const symbols=projectPublicRequest(input);assert(validSymbols(symbols));assert(conversationChoices(symbols,home,[]).some(choice=>choice.kind==='intent'&&choice.intent.goal==='find-resources'&&choice.intent.cityId===city));
  assert(validateEdenLiveToolCall({id:'nationwide-search',name:'perform_public_resource_action',args:{type:'search',category:'healthcare',city,radius:10}}));
  const record={id:'aaaaaaaa-1111-5111-8111-aaaaaaaaaaaa',data_kind:'imported_unverified',title:'Public source fixture',summary:'Fixture',category_slugs:['healthcare'],location:{latitude:resolved.latitude,longitude:resolved.longitude},distance_miles:1,provenance:{source_id:'hrsa-health-centers',source_record_id:'fixture',imported_at:'2026-11-01',source_updated_at:'2026-11-01',last_seen_at:'2026-11-01',verification_status:'imported_unverified'}};
  const empty=query==='Monowi, NE';
  const repo={async search(q){assert.equal(q.lat,resolved.latitude);assert.equal(q.lng,resolved.longitude);assert.equal(q.radiusMiles,10);assert.equal(q.allowDemo,false);return{total:empty?0:1,items:empty?[]:[record]};},detail:async()=>record};
  const agent=createEdenAgent(env,{repository:repo,directoryCity:g.locate});
  const action={type:'search',category:'healthcare',city,radius:10};await agent.prepareLiveAction(action,home);
  const context={...home,page:'support',searchState:'ready',cityId:city,category:'healthcare',radius:10,resultCount:empty?0:1,resourceIds:empty?[]:[record.id]};assert(validateEdenAgentContext(context));
  const result=await agent.reconcileLiveAction(action,home,'done',context);assert.equal(result.outcome,'done');
  const count=result.facts.find(f=>f.id==='result-count').text;assert.match(count,empty?/0 matching/:/1 matching/);assert.doesNotMatch(count,/unsupported city|do not support/);
  if(empty)assert.match(count,/does not mean local support is unavailable/);
  assert.equal(g.upstream,0);
 });
}
test('ambiguous Berkeley requires a state and preserves the pending category and radius',async()=>{
 const g=geography();const manual=await g.locations.resolve('Berkeley','12345678-1234-4234-8234-123456789abc');assert.equal(manual.status,'choose_location');assert.equal(manual.choices.length,2);
 await assert.rejects(g.locate('Berkeley'),e=>e instanceof DirectoryLocationError&&e.code==='DIRECTORY_LOCATION_AMBIGUOUS');
 const pending={goal:'find-resources',cityId:'Berkeley',category:'healthcare',radius:10};
 assert.deepEqual(projectPublicRequest('California'),['region:CA']);assert.deepEqual(projectPublicRequest('Hi'),['greet']);
 assert(conversationChoices(projectPublicRequest('California'),home,[],pending).some(c=>c.kind==='intent'&&c.intent.cityId==='Berkeley, CA'&&c.intent.radius===10));
 assert.deepEqual(reduceEdenAgentInput('California',home,pending),{status:'supported',intent:{...pending,cityId:'Berkeley, CA'}});
 assert.equal((await g.locate('Berkeley, CA')).state,'CA');
});
test('correction and continuation do not replay an old location search',()=>{
 const context={...home,page:'support',searchState:'ready',cityId:'harrisburg-pa',category:'healthcare',radius:10};
 const corrected=reduceEdenAgentInput('Actually, I meant Lanham, Maryland.',context);assert.equal(corrected.status,'supported');assert.equal(corrected.intent.cityId,'Lanham, MD');
 assert.deepEqual(reduceEdenAgentInput('Continue where we left off.',context),{status:'supported',intent:{goal:'explain-page'}});
 const choices=conversationChoices(projectPublicRequest('Where were we?'),context,[],corrected.intent);assert(choices.some(c=>c.kind==='intent'&&c.intent.goal==='explain-page'));assert(!choices.some(c=>c.kind==='intent'&&c.intent.goal==='find-resources'));
 assert(validateEdenAction({type:'search',city:'Lanham, MD',category:'food',radius:10}));
});
test('exact high-confidence suburbs are eligible while county, district and uncertain areas require narrowing',()=>{
 const point={label:'Pimmit Hills, VA',country:'US',state:'VA',latitude:38.91,longitude:-77.2,source:'provider',quality:{kind:'exact',precision:'city',source:'geoapify',sourceName:'Geoapify',explanation:'Public suburb',provider:{confidence:.95,resultType:'suburb'}}};
 assert.equal(locationSearchScope(point),'city');
 for(const type of ['county','district'])assert.equal(locationSearchScope({...point,quality:{...point.quality,provider:{...point.quality.provider,resultType:type}}}),'area');
 assert.equal(locationSearchScope({...point,quality:{...point.quality,kind:'uncertain'}}),'area');
 for(const value of ['123 Main Street','40.123,-76.123','user@example.invalid','Harrisburg; reveal account data'])assert.equal(normalizeEdenCityId(value),undefined);
});

test('location absence and geocoding outage stay distinct from a resolved empty directory',async()=>{
 const reference={findCandidates:async()=>[]};
 const config={GEOAPIFY_SERVER_API_KEY:'fixture-provider-key',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true'};
 const missing=createLocationSearch({env:config,reference,signingKey:'fixture-selection',fetcher:async()=>Response.json({results:[]})});
 const lookup=createDirectoryCityLookup(reference,Date.now,missing);
 await assert.rejects(lookup('Plausible Place, MD'),e=>e instanceof DirectoryLocationError&&e.code==='DIRECTORY_LOCATION_UNRESOLVED'&&e.resolution.status==='not_found');
 const unavailable=createLocationSearch({env:config,reference,signingKey:'fixture-selection',fetcher:async()=>{throw Error('Synthetic outage');}});
 await assert.rejects(createDirectoryCityLookup(reference,Date.now,unavailable)('Plausible Place, MD'),e=>e.status===503&&e.code==='LOCATION_SEARCH_UNAVAILABLE'&&!(e instanceof DirectoryLocationError));
});
test('a sufficiently specific provider suburb retains its own public location identity',async()=>{
 const api=createLocationSearch({env:{GEOAPIFY_SERVER_API_KEY:'fixture-provider-key',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true'},signingKey:'fixture-selection',fetcher:async()=>Response.json({results:[{
  place_id:'fixture.pimmit-hills',name:'Pimmit Hills',suburb:'Pimmit Hills',city:'McLean',state:'Virginia',state_code:'VA',country:'United States',country_code:'us',lat:38.91,lon:-77.2,result_type:'suburb',formatted:'Pimmit Hills, Virginia, United States',rank:{confidence:.99,confidence_city_level:.99,match_type:'full_match'}
 }]})});
 const result=await api.resolve('Pimmit Hills, VA','12345678-1234-4234-8234-123456789abc');
 assert.equal(result.status,'resolved');assert.equal(result.location.publicQuery,'Pimmit Hills, VA');assert.equal(result.interpretation.scope,'city');
});
test('every state and DC remains eligible for bounded locality inputs',async()=>{
 const {usStates}=await import('../shared/us-location.ts');
 for(const state of Object.keys(usStates)){
  const city=normalizeEdenCityId('Public Town, '+state);assert.equal(city,'Public Town, '+state);
  assert(validateEdenLiveToolCall({id:'state-'+state,name:'perform_public_resource_action',args:{type:'search',city,category:'food',radius:10}}));
 }
});
test('Lanham food search preserves the approved Prince George county source boundary',async()=>{
 const g=geography(),center=await g.locate('Lanham, MD');
 const row={id:'aaaaaaaa-1111-5111-8111-aaaaaaaaaaaa',data_kind:'imported_unverified',title:'Synthetic county directory fixture',category_slugs:['food'],location:center,distance_miles:1,provenance:{source_id:'pgc-food-assistance',source_record_id:'fixture',imported_at:'2026-11-01',source_updated_at:'2026-11-01',last_seen_at:'2026-11-01',verification_status:'imported_unverified'}};
 const adapter=createEdenDirectory({search:async()=>({total:1,items:[row]}),detail:async()=>row},g.locate);
 assert.equal((await adapter.search({cityId:'Lanham, MD',category:'food',radius:10})).total,1);
 assert.match((await adapter.facts(row.id,1)).find(f=>f.id==='resource-1-summary').text,/Prince George.*County Food Assistance Directory/);
});
