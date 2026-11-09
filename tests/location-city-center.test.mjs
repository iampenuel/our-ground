import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationSearch} from '../backend/location-search.ts';
import {createDirectoryCityLookup} from '../backend/directory-city.ts';
import {validLocationQuality} from '../backend/location-quality-validation.ts';

const session='12345678-1234-4234-8234-123456789abc';
const env={GEOAPIFY_SERVER_API_KEY:'fixture-city-center-key',GEOAPIFY_LOCATION_ENABLED:'true',GEOAPIFY_LOCATION_LIVE_APPROVED:'true',GEOAPIFY_LOCATION_MAX_RETRIES:'0'};
const candidate={id:'census:2026:place:0667000',display_name:'San Francisco',canonical_name:'San Francisco city',kind:'place',state:'CA',latitude:37.727239,longitude:-123.032229,coordinate_precision:'representative',source:{provider:'census',id:'census-gazetteer-2026',vintage:2026,geographic_id:'0667000',url:'https://www.census.gov/geographies/reference-files.html'},match:{method:'exact',exact_match:true,ambiguous_matches:1,local_similarity:1,edit_distance:0}};
const provider={place_id:'fixture.san-francisco',city:'San Francisco',name:'San Francisco',state:'California',state_code:'CA',country:'United States',country_code:'us',lat:37.7749,lon:-122.4194,result_type:'city',rank:{confidence:.99,confidence_city_level:.99,match_type:'full_match'}};
function harness({rows=[provider],status=200,configured=true,fetcher,referenceRows=[candidate]}={}){
 const calls=[],admissions=[];
 const reference={findCandidates:async()=>structuredClone(referenceRows),findPostalArea:async()=>({latitude:37.77,longitude:-122.42})};
 const locations=createLocationSearch({env:configured?env:{},reference,signingKey:'fixture-city-center-signing',fetcher:async(url,init)=>{calls.push(new URL(url));return fetcher?fetcher(url,init):status===200?Response.json({results:rows}):new Response('',{status});}});
 return{locations,reference,calls,admissions,resolve:q=>locations.resolve(q,session,undefined,undefined,undefined,undefined,async()=>admissions.push(true))};
}
test('one matched city-center lookup keeps Census identity and gives manual/Eden the same cached coordinates',async()=>{
 const h=harness();const manual=await h.resolve('San Francisco, CA');assert.equal(manual.status,'resolved');
 assert.equal(manual.location.longitude,provider.lon);assert.equal(manual.location.latitude,provider.lat);
 assert.equal(manual.location.quality.source,'reference');assert.equal(manual.location.quality.coordinateSource,'geoapify');assert.equal(manual.location.quality.reference.geographicId,'0667000');assert(validLocationQuality(manual.location.quality));
 assert.match(manual.location.attribution,/Geoapify.*Census/);assert.match(manual.location.quality.explanation,/matching Geoapify city point/);
 const eden=await createDirectoryCityLookup(h.reference,Date.now,h.locations)('San Francisco, CA');assert.equal(eden.latitude,manual.location.latitude);assert.equal(eden.longitude,manual.location.longitude);
 assert.equal(h.calls.length,1);assert.equal(h.admissions.length,1);assert.equal(h.calls[0].searchParams.get('filter'),'countrycode:us');assert.equal(h.calls[0].searchParams.get('type'),'city');assert.equal(h.calls[0].searchParams.get('text'),'San Francisco, CA');
});
for(const [name,rows,status] of [
 ['foreign',[{...provider,country_code:'ca',country:'Canada'}],200],
 ['wrong city',[{...provider,city:'Los Angeles',name:'Los Angeles'}],200],
 ['wrong state',[{...provider,state:'Nevada',state_code:'NV'}],200],
 ['low confidence',[{...provider,rank:{confidence:.4,confidence_city_level:.9}}],200],
 ['missing confidence',[{...provider,rank:{}}],200],
 ['non-city',[{...provider,result_type:'suburb'}],200],
 ['no matches',[],200],['provider quota',[],429],['provider unavailable',[],503]
])test('city-center '+name+' falls back accurately without changing geographic identity',async()=>{
 const h=harness({rows,status});const result=await h.resolve('San Francisco, CA');assert.equal(result.status,'resolved');assert.equal(result.location.longitude,candidate.longitude);assert.equal(result.location.quality.coordinateSource,'reference');assert.equal(result.location.quality.provider,undefined);assert.match(result.location.quality.explanation,/may be far from service clusters/);
 await h.resolve('San Francisco, CA');assert.equal(h.calls.length,1,'the same fallback does not repeatedly spend provider requests');
});
test('unapproved provider, postal areas, states and unselected ambiguous places never trigger city enrichment',async()=>{
 const disabled=harness({configured:false});await disabled.resolve('San Francisco, CA');assert.equal(disabled.calls.length,0);
 const zip=harness();assert.equal((await zip.resolve('94102')).status,'resolved');assert.equal(zip.calls.length,0);
 const state=harness({referenceRows:[{...candidate,id:'census:2026:state:06',kind:'state',display_name:'California',canonical_name:'California'}]});assert.equal((await state.resolve('California')).status,'narrow_location');assert.equal(state.calls.length,0);
 const ambiguous=harness({referenceRows:[{...candidate,match:{...candidate.match,ambiguous_matches:2}},{...candidate,id:'census:2026:place:second',state:'MO',match:{...candidate.match,ambiguous_matches:2}}]});assert.equal((await ambiguous.resolve('San Francisco')).status,'choose_location');assert.equal(ambiguous.calls.length,0);
});
test('concurrent city selections share the bounded provider operation',async()=>{
 let release;const h=harness({fetcher:()=>new Promise(resolve=>{release=()=>resolve(Response.json({results:[provider]}));})});
 const a=h.resolve('San Francisco, CA'),b=h.resolve('San Francisco, CA');while(!release)await new Promise(r=>setTimeout(r,0));release();
 const [first,second]=await Promise.all([a,b]);assert.equal(first.location.longitude,provider.lon);assert.equal(second.location.longitude,provider.lon);assert.equal(h.calls.length,1);assert.equal(h.admissions.length,1);
});
