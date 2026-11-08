import {supportSummary} from '../src/support-summary.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {searchSupport} from '../src/support-search.ts';
import {readSupportState} from '../src/support-model.ts';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {geoTestEnv,geoFeature} from './geoapify-fixtures.mjs';

test('state and county evidence never reach the point-radius resource or mapped API',async()=>{
 const state=readSupportState(new URLSearchParams('category=food'));
 for(const quality of [{precision:'state'},{precision:'city',provider:{resultType:'county'}}]){
  let calls=0;const result=await searchSupport(async()=>{calls++;assert.fail('No point search for a state/area');},state,true,new AbortController().signal,undefined,{label:'Large area',latitude:40,longitude:-77,source:'reference',quality});
  assert.equal(result.status,'error');assert.equal(result.canTryDirectory,false);assert.equal(calls,0);
 }
});
test('50-mile distance is preserved by URL state and mapped circle while result cap stays20',async()=>{
 const state=readSupportState(new URLSearchParams('category=food&radius_miles=50'));assert.equal(state.radius,50);
 const calls=[];const provider=createGeoapifyProvider({env:geoTestEnv,fetcher:async raw=>{const url=new URL(raw);calls.push(url);return Response.json({type:'FeatureCollection',features:[geoFeature()]});}});
 await provider.search({query:'',center:{label:'Harrisburg, PA',latitude:40.2732,longitude:-76.8867,state:'PA'},term:'food_assistance',radiusMiles:50});
 assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('filter'),'circle:-76.8867,40.2732,80467.2');assert.equal(calls[0].searchParams.get('limit'),'20');
});

test('partial food results name only the completed directory scope and retain provider-outage warning',()=>{
 const text=supportSummary([],{food:true,location:'Snoqualmie Pass, WA',directoryUnavailable:false,mappedStatus:'error',demo:false,filtered:false,radius:5});
 assert.match(text,/No directory food-support listings found within 5 miles/);assert.match(text,/partly unavailable/);
 const failed=supportSummary([],{food:true,directoryUnavailable:true,mappedStatus:'error',demo:false,filtered:false,radius:5});
 assert.doesNotMatch(failed,/No directory|No food-support listings/);
});
