import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {handleGeoapify} from '../backend/geoapify-api.ts';
import {publicEnvironmentProblems} from '../backend/env-boundary.mjs';
import {geoapifyTerms} from '../shared/geoapify.ts';
import {supportCards} from '../src/support-view.ts';
import {geoAttribution} from '../src/geoapify-view.ts';
import {mappedCategoryLabel} from '../shared/place-evidence.ts';
import {geoCity,geoFeature,geoTowns,geoTestEnv} from './geoapify-fixtures.mjs';
const input={query:'Harrisburg',term:'food_assistance',radiusMiles:10};
function setup({city='Harrisburg',locations=[geoCity(city)],features=[geoFeature(city)],status=200}={}){
  const calls=[];let time=100000;
  const provider=createGeoapifyProvider({env:geoTestEnv,now:()=>time,fetcher:async(url,init)=>{calls.push({url:new URL(url),init});return status===200?Response.json(String(url).includes('/geocode/')?{results:locations}:{features}):new Response('',{status});}});
  return{provider,calls,advance:ms=>{time+=ms;}};
}
test('Geoapify requires explicit activation and never makes a request with missing configuration',async()=>{
  let count=0;const provider=createGeoapifyProvider({env:{GEOAPIFY_SERVER_API_KEY:'mock'},fetcher:async()=>{count++;throw Error('unexpected');}});
  assert.equal(provider.status().enabled,false);await assert.rejects(provider.search(input),e=>e.code==='GEOAPIFY_NOT_CONFIGURED');assert.equal(count,0);
});
test('documented categories, geographic filters and 20-result cap are used for the three PA cities',async()=>{
  for(const [city,term] of [['Harrisburg','food_assistance'],['Middletown','food_assistance'],['Philadelphia','general_practice']]){
    const category=geoapifyTerms[term].key,s=setup({city,features:[geoFeature(city,{categories:category.split(',')})]});
    const result=await s.provider.search({...input,query:city,term});assert.equal(result.items.length,1);assert.equal(s.calls.length,2);
    const [lat,lon]=geoTowns[city];assert.equal(result.location.latitude,lat);assert.equal(result.items[0].longitude,lon);
    const params=s.calls[1].url.searchParams;assert.equal(params.get('categories'),category);assert.equal(params.get('filter'),`circle:${lon},${lat},16093.44`);assert.equal(params.get('limit'),'20');assert.equal(params.has('offset'),false);
    assert.ok(result.items[0].directions_url.includes(encodeURIComponent(lat+','+lon)));assert.ok(!result.items[0].directions_url.includes('destination_place_id'));
  }
});
test('geocodes are reused for filter changes and identical searches are briefly cached with source credit',async()=>{
  const s=setup();await s.provider.search(input);s.advance(1001);
  await s.provider.search({...input,radiusMiles:25});assert.equal(s.calls.length,3);assert.equal(s.calls.filter(c=>c.url.pathname.includes('geocode')).length,1);
  const same=await s.provider.search({...input,radiusMiles:25});assert.equal(s.calls.length,3);assert.ok(same.location.attributions.some(a=>a.name==='Geoapify'));
  s.advance(601000);await s.provider.search(input);assert.equal(s.calls.length,5);
});
test('ambiguous cities require a returned location ID and do not geocode again on selection',async()=>{
  const s=setup({locations:[geoCity(),geoCity('Harrisburg',{place_id:'another_Harrisburg',state:'Oregon',state_code:'OR',lat:44.27,lon:-123.17})]});const choices=await s.provider.search(input);assert.equal(choices.status,'choose_location');assert.equal(s.calls.length,1);
  const selected=await s.provider.search({...input,locationId:'mock_city_Harrisburg'});assert.equal(selected.status,'results');assert.equal(s.calls.length,2);
  await assert.rejects(s.provider.search({...input,locationId:'unreturned_location'}),e=>e.code==='LOCATION_NOT_FOUND');
});
test('invalid, mismatched and out-of-state ZIP/city results are rejected without Places calls',async()=>{
  for(const location of [geoCity('Harrisburg',{state_code:'NY'}),geoCity('Harrisburg',{country_code:'ca'}),geoCity('Harrisburg',{result_type:'street'}),geoCity('Harrisburg',{rank:{confidence:.4}})]){
    const s=setup({locations:[location]});await assert.rejects(s.provider.search(input),e=>e.code==='LOCATION_NOT_FOUND');assert.equal(s.calls.length,1);
  }
  const s=setup({locations:[geoCity('Harrisburg',{result_type:'postcode',postcode:'17102'})]});await assert.rejects(s.provider.search({...input,query:'17101'}));
  const valid=setup({locations:[geoCity('Harrisburg',{result_type:'postcode',postcode:'17101'})]});assert.equal((await valid.provider.search({...input,query:'17101'})).status,'results');
  const invalid=setup();await assert.rejects(invalid.provider.search({...input,query:'1234'}));assert.equal(invalid.calls.length,0);
});
test('places reject unrelated categories, out-of-state points, malformed coordinates and out-of-radius records',async()=>{
  const badGeometry={...geoFeature(),geometry:{type:'Point',coordinates:[40.27,-76.88]}};
  const s=setup({features:[geoFeature(),geoFeature('Harrisburg',{place_id:'mock_market',categories:['commercial.supermarket','service.social_facility.food']}),geoFeature('Harrisburg',{place_id:'mock_restaurant',categories:['catering.restaurant']}),geoFeature('Harrisburg',{place_id:'mock_ny',state_code:'NY'}),badGeometry,geoFeature('Philadelphia')]});
  const result=await s.provider.search(input);assert.equal(result.items.length,1);assert.equal(result.items[0].place_id,'mock_food_Harrisburg');
});
test('provider failures produce safe errors and explicit quota recovery without exposing credentials',async()=>{
  for(const [status,code] of [[429,'PROVIDER_QUOTA'],[403,'PROVIDER_PERMISSION'],[500,'PROVIDER_UNAVAILABLE']]){const s=setup({status});await assert.rejects(s.provider.search(input),e=>e.code===code&&!e.message.includes(geoTestEnv.GEOAPIFY_SERVER_API_KEY));}
  const p=createGeoapifyProvider({env:geoTestEnv,timeoutMs:5,fetcher:async(_url,init)=>new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('url with secret'))))});
  const keepAlive=setTimeout(()=>{},100);try{await assert.rejects(p.search(input),e=>e.code==='PROVIDER_TIMEOUT');}finally{clearTimeout(keepAlive);}
});
test('empty results remain empty; unexpected schema and unsupported terms fail safely',async()=>{
  assert.deepEqual((await setup({features:[]}).provider.search(input)).items,[]);
  const p=createGeoapifyProvider({env:geoTestEnv,fetcher:async()=>Response.json({wrong:'schema'})});await assert.rejects(p.search(input),e=>e.code==='PROVIDER_RESPONSE');
  const s=setup();await assert.rejects(s.provider.search({...input,term:'commercial.supermarket'}));await assert.rejects(s.provider.search({...input,radiusMiles:500}));assert.equal(s.calls.length,0);
});
test('process request limits bound repeated provider traffic rather than auto-retrying quota errors',async()=>{
  const s=setup();await s.provider.search(input);await assert.rejects(s.provider.search({...input,radiusMiles:25}),e=>e.code==='LOCAL_RATE_LIMIT');assert.equal(s.calls.length,2);
});
test('Geoapify supports bounded coordinate POST reads and rejects unsupported detail/edit paths',async()=>{
  const s=setup();assert.equal((await handleGeoapify(new Request('http://local/api/v1/geoapify/places',{method:'POST'}),'/geoapify/places',s.provider)).status,415);
  assert.equal((await handleGeoapify(new Request('http://local/api/v1/geoapify/places',{method:'DELETE'}),'/geoapify/places',s.provider)).status,405);
  assert.equal((await handleGeoapify(new Request('http://local/api/v1/geoapify/places/mock_id'),'/geoapify/places/mock_id',s.provider)).status,404);assert.equal(s.calls.length,0);
});
test('server keys cannot be copied under browser names; complete cards preserve provenance and do not invent missing data',async()=>{
  assert.equal(publicEnvironmentProblems({GEOAPIFY_SERVER_API_KEY:'mock-private',VITE_GEOAPIFY_BROWSER_KEY:'mock-private'}).length,1);
  assert.equal(publicEnvironmentProblems({GEOAPIFY_SERVER_API_KEY:'mock-private',VITE_GEOAPIFY_BROWSER_KEY:'mock-public'}).length,0);
  assert.equal(publicEnvironmentProblems({VITE_GEOAPIFY_SERVER_API_KEY:'mock-private'}).length,1);
  const result=await setup().provider.search(input),html=supportCards([{kind:'geoapify',key:'geoapify:test',record:{...result.items[0],name:'<script>unsafe</script>'}}],null);
  assert.ok(!html.includes('<script>'));assert.match(html,/Services not verified/);assert.match(html,/Geoapify/);assert.match(geoAttribution,/OpenStreetMap/);assert.ok(!html.includes('/resources/'));assert.ok(!html.includes('tel:'));
});

test('food matching excludes generic social services and healthcare-only evidence; dual-category matches stay unverified',async()=>{
  const s=setup({features:[
    geoFeature('Harrisburg',{place_id:'mock_generic_hospice',name:'Mock hospice',categories:['service.social_facility']}),
    geoFeature('Harrisburg',{place_id:'mock_health_only',name:'Mock healthcare center',categories:['healthcare.clinic_or_praxis']}),
    geoFeature('Harrisburg',{place_id:'mock_near_prefix',categories:['service.social_facility.foodstore']}),
    geoFeature('Harrisburg',{place_id:'mock_dual_category',categories:['service.social_facility.food','healthcare.clinic_or_praxis']}),
    geoFeature('Harrisburg',{place_id:'mock_food_subcategory',categories:['service.social_facility.food.bank']})
  ]});
  const result=await s.provider.search(input);
  assert.deepEqual(result.items.map(p=>p.place_id),['mock_dual_category','mock_food_subcategory']);
  assert.equal(s.calls.length,2);
  assert.equal(mappedCategoryLabel(result.items[0].categories),'Mapped categories: food-related support & healthcare');
  assert.equal(mappedCategoryLabel(['service.social_facility']),'Mapped location · category unconfirmed');
  const html=supportCards(result.items.map(record=>({key:'geoapify:'+record.place_id,kind:'geoapify',record})),null);
  assert.match(html,/Services not verified/);assert.ok(!html.includes('Food assistance'));
});
test('only source-supplied safe website and valid phone become actions, without details calls',async()=>{
  const s=setup({features:[geoFeature('Harrisburg',{website:'https://example.org/clinic',contact:{phone:'+1 (717) 555-0100'}})]});
  const result=await s.provider.search(input),p=result.items[0];
  assert.equal(s.calls.length,2);assert.equal(p.website_url,'https://example.org/clinic');assert.equal(p.phone,'+17175550100');
  const cards=record=>supportCards([{key:'geoapify:test',kind:'geoapify',record}],null);
  assert.match(cards(p),/href="tel:\+17175550100"/);assert.match(cards(p),/>Website</);assert.match(cards(p),/>Directions</);
  const unsafe=setup({features:[geoFeature('Harrisburg',{website:'javascript:alert(1)',phone:'123----'})]});
  const bad=(await unsafe.provider.search(input)).items[0];assert.equal(bad.website_url,null);assert.equal(bad.phone,null);
  assert.ok(!cards({...p,website_url:'https://user:pass@example.org/',phone:'+1+7175550100'}).includes('>Website<'));
  assert.ok(!cards({...p,website_url:'data:text/html,attack',phone:'-------'}).includes('tel:'));
  assert.ok(!cards(bad).includes('Hours'));assert.ok(!cards(bad).includes('Eligibility'));
});

test('selected coordinate searches bypass geocoding and never cache temporary or precise location context',async()=>{
 const s=setup();const selection={...input,query:'',center:{latitude:40.2732,longitude:-76.8867,label:'Temporary selected point',source:'mapbox'}};
 const first=await s.provider.search(selection);assert.equal(first.status,'results');assert.equal(first.items.length,1);s.advance(1001);await s.provider.search(selection);
 assert.equal(s.calls.length,2);assert(s.calls.every(c=>c.url.pathname==='/v2/places'));assert.equal(s.calls[0].url.searchParams.get('filter'),'circle:-76.8867,40.2732,16093.44');
});
