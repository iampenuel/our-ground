import test from 'node:test';import assert from 'node:assert/strict';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {geoFeature,geoTestEnv} from './geoapify-fixtures.mjs';
import {searchSupport} from '../src/support-search.ts';
import {combineSupportResults,readSupportState,supportUrl} from '../src/support-model.ts';
import {supportSummary,sourceAvailability} from '../src/support-summary.ts';
const center={label:'Harrisburg, PA',latitude:40.2732,longitude:-76.8867,state:'PA',source:'map'};
const state=readSupportState(new URLSearchParams('location=Harrisburg, PA&category=food'));
const directory={id:'fixture',title:'Test pantry',category_slugs:['food'],distance_miles:8,data_kind:'sourced_unverified'};
const mapped={place_id:'test-map',category:'food',distance_miles:1};
const ctx={food:true,location:'Harrisburg, PA',directoryUnavailable:false,mappedStatus:'available',demo:false,filtered:false};
test('food OR query adds only explicit sharing boxes with one Places call and 20-result bound',async()=>{
 const calls=[],features=[
  geoFeature('Harrisburg',{place_id:'food_lead',categories:['service.social_facility.food']}),
  geoFeature('Harrisburg',{place_id:'box_lead',categories:['amenity.give_box.food']}),
  ...['service.social_facility','service.social_facility.shelter','amenity.give_box','amenity.give_box.books','amenity.give_box.foodstore','commercial.supermarket','catering.restaurant','healthcare.clinic_or_praxis'].map((c,i)=>geoFeature('Harrisburg',{place_id:'reject_'+i,categories:[c]})),
  geoFeature('Harrisburg',{place_id:'commercial_plus',categories:['service.social_facility.food','commercial.supermarket']})
 ];
 const provider=createGeoapifyProvider({env:geoTestEnv,fetcher:async url=>{calls.push(new URL(url));return Response.json({features});}});
 const result=await provider.search({query:'',center,term:'food_assistance',radiusMiles:10});
 assert.deepEqual(result.items.map(x=>x.place_id),['food_lead','box_lead']);assert.equal(calls.length,1);
 assert.equal(calls[0].searchParams.get('categories'),'service.social_facility.food,amenity.give_box.food');assert.equal(calls[0].searchParams.get('limit'),'20');assert.equal(calls[0].searchParams.get('filter'),'circle:-76.8867,40.2732,16093.44');
});
test('food directory precedes mapped leads without changing healthcare distance ordering',()=>{
 const food=combineSupportResults([directory],[mapped],'real');assert.equal(food[0].kind,'directory');
 const health=combineSupportResults([{...directory,category_slugs:['healthcare']}],[{...mapped,category:'healthcare'}],'real');assert.equal(health[0].kind,'geoapify');
 assert.deepEqual(combineSupportResults([{...directory,data_kind:'fictional_demo'}],[],'real'),[]);
});
test('food summaries separate real records, mapped-only leads, referrals, filtered empty and outage',()=>{
 const food=combineSupportResults([directory],[mapped],'real');
 assert.match(supportSummary(food,ctx),/1 food-support record.*1 mapped lead/);
 assert.match(supportSummary(food.slice(1),ctx),/1 mapped food-support lead/);
 assert.match(supportSummary([],ctx),/referral services/);assert.doesNotMatch(supportSummary([],ctx),/unavailable/);
 assert.match(supportSummary([],{...ctx,mappedStatus:'error'}),/partly unavailable/);
 assert.match(supportSummary([],{...ctx,filtered:true}),/filter/);
 assert.match(sourceAvailability({...ctx,mappedStatus:'disabled'}),/not enabled/);
 assert.match(sourceAvailability({...ctx,mappedStatus:'error'}),/couldn’t reach/);
});
test('disabled optional Places is complete directory coverage, while either source failure stays partial',async()=>{
 const collection={items:[],total:0,has_next:false};const paths=[];
 const request=async path=>{paths.push(path);return collection};
 const disabled=await searchSupport(request,state,false,new AbortController().signal,undefined,center);
 assert.equal(disabled.status,'results');assert.equal(disabled.partial,false);assert.equal(disabled.mappedStatus,'disabled');assert.deepEqual(disabled.notices,[]);assert.deepEqual(paths,['resources/search']);
 const mappedFailure=await searchSupport(async path=>{if(path==='geoapify/places')throw Error('quota');return collection},state,true,new AbortController().signal,undefined,center);
 assert.equal(mappedFailure.partial,true);assert.equal(mappedFailure.mappedStatus,'error');assert.equal(mappedFailure.directory,collection);
 const directoryFailure=await searchSupport(async path=>{if(path==='resources/search')throw Error('database unavailable');return {status:'results',location:{...center,attributions:[]},items:[mapped]}},state,true,new AbortController().signal,undefined,center);
 assert.equal(directoryFailure.partial,true);assert.equal(directoryFailure.directory,null);assert.equal(directoryFailure.geoapify.length,1);
});
test('zero successful sources never becomes a successful empty search, even with a selected center',async()=>{
 const failed=await searchSupport(async()=>{throw Error('protection unavailable')},state,true,new AbortController().signal,undefined,center);assert.equal(failed.status,'error');
});
test('maps default visible on desktop/mobile; explicit hidden history state is honored',()=>{
 for(const mobile of [false,true])assert.equal(readSupportState(new URLSearchParams(),mobile).view,'map');
 const hidden=readSupportState(new URLSearchParams('view=list&intent=give'),true);assert.equal(hidden.view,'list');assert.equal(readSupportState(new URL(supportUrl(hidden),'https://local').searchParams).view,'list');assert.equal(hidden.intent,'give');
});
