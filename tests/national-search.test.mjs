import test from 'node:test';
import assert from 'node:assert/strict';
import {usStates, supportedState, parseLocationQuery} from '../shared/us-location.ts';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {handleApi} from '../backend/app.ts';
import {directoryPlace} from '../backend/runtime.ts';
import {mapLongitude} from '../src/maplibre-support-map.ts';
import {readSupportState} from '../src/support-model.ts';
import {searchSupport} from '../src/support-search.ts';
import {geoTestEnv, geoCity, geoFeature} from './geoapify-fixtures.mjs';

const expectedStates = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const examples = [
  ['Harrisburg','PA',40.27,-76.88], ['New York','NY',40.71,-74.01], ['Los Angeles','CA',34.05,-118.24],
  ['Chicago','IL',41.88,-87.63], ['Anchorage','AK',61.22,-149.90], ['Honolulu','HI',21.31,-157.86], ['Washington','DC',38.9,-77.03]
];
const city = (name, state, lat, lon, extra={}) => geoCity('Harrisburg', {
  city:name, state:usStates[state], state_code:state, lat, lon, place_id:'location_'+state, ...extra
});
function feature(state, lat, lon, extra={}) {
  const item = geoFeature('Harrisburg', {state:usStates[state], state_code:state, ...extra});
  item.geometry.coordinates = [lon,lat];
  return item;
}
function adapter(locations, features=[]) {
  const calls=[];
  const provider=createGeoapifyProvider({env:geoTestEnv,fetcher:async url=>{
    const u=new URL(url); calls.push(u);
    return Response.json(u.pathname.includes('geocode') ? {results:locations} : {features});
  }});
  return {calls, search:(query,locationId)=>provider.search({query,locationId,term:'food_assistance',radiusMiles:10})};
}

test('national scope admits all 50 state codes and DC with concordant evidence',()=>{
  assert.deepEqual(Object.keys(usStates).sort(), expectedStates.sort());
  for (const code of expectedStates) {
    assert.equal(supportedState('US',code,usStates[code]),code);
    assert.equal(supportedState('us',undefined,usStates[code]),code);
    assert.equal(parseLocationQuery('Sample, '+usStates[code]).state,code);
  }
  for (const code of ['PR','GU','VI','AS','MP','UM','AA','AE','AP','ZZ']) {
    assert.equal(supportedState('US',code,'Alaska'),undefined);
    assert.equal(parseLocationQuery('Sample, '+code),null);
  }
  assert.equal(supportedState('US','NY','New Jersey'),undefined);
  assert.equal(supportedState('ca','NY','New York'),undefined);
  assert.equal(supportedState('us','NY','New York','Canada'),undefined);
  assert.equal(supportedState('us',null,undefined),undefined);
});
test('nationwide cities use country-only geocoding and one local category circle',async()=>{
  for (const [name,code,lat,lon] of examples) {
    const mock=adapter([city(name,code,lat,lon)], [feature(code,lat,lon)]);
    const query=name+', '+code;
    const result=await mock.search(query);
    assert.equal(result.location.state,code);
    assert.equal(result.items[0].state,code);
    assert.equal(result.items[0].distance_miles,0);
    const [geo,places]=mock.calls;
    assert.equal(geo.searchParams.get('filter'),'countrycode:us');
    assert.equal(geo.searchParams.get('text'),query);
    assert.equal(places.searchParams.get('filter'),'circle:'+lon+','+lat+',16093.44');
    assert.equal(places.searchParams.get('bias'),'proximity:'+lon+','+lat);
    assert.equal(places.searchParams.get('limit'),'20');
  }
});
test('city-only ambiguity keeps state and county visible and performs no Places call until chosen',async()=>{
  for (const name of ['Springfield','Portland']) {
    const mock=adapter([city(name,'OR',45.52,-122.68,{county:'Multnomah County'}),city(name,'ME',43.66,-70.26,{county:'Cumberland County'})]);
    const result=await mock.search(name);
    assert.equal(result.status,'choose_location');
    assert.deepEqual(result.choices.map(c=>c.label),[name+', OR, Multnomah County',name+', ME, Cumberland County']);
    assert.equal(mock.calls.length,1);
    await assert.rejects(mock.search(name,'invented_location'));
    const selected=await mock.search(name,'location_ME');
    assert.equal(selected.location.state,'ME'); assert.equal(mock.calls.length,2);
  }
});
test('explicit state, city, ZIP, and county must match returned components',async()=>{
  const portland=city('Portland','ME',43.66,-70.26,{county:'Cumberland County'});
  assert.equal((await adapter([portland]).search('Portland, Maine')).location.state,'ME');
  for (const query of ['Portland, OR','Portland, Oregon','Portland, York County, ME','Springfield, ME']) {
    const mock=adapter([portland]); await assert.rejects(mock.search(query)); assert.equal(mock.calls.length,1);
  }
  const zip=city('Boston','MA',42.36,-71.06,{result_type:'postcode',postcode:'02108'});
  assert.match((await adapter([zip]).search('02108')).location.label,/02108/);
  const wrong=adapter([zip]); await assert.rejects(wrong.search('02109')); assert.equal(wrong.calls.length,1);
  for (const query of ['1234','APO, AE','Paris, France','San Juan, PR']) {
    const mock=adapter([portland]); await assert.rejects(mock.search(query)); assert.equal(mock.calls.length,0);
  }
});
test('border search accepts relevant nearby U.S. points across a state line and rejects invalid evidence',async()=>{
  const lat=40.22, lon=-74.78;
  const mock=adapter([city('Trenton','NJ',lat,lon)],[
    feature('PA',lat,lon-.02),feature('PA',lat,lon-2),
    feature('PA',lat,lon,{place_id:'wrong_country',country_code:'ca'}),
    feature('PA',lat,lon,{place_id:'territory',state_code:'PR'}),
    feature('PA',lat,lon,{place_id:'state_missing',state_code:null,state:null}),
    feature('PA',lat,lon,{place_id:'conflicting_state',state_code:'NJ'}),
    feature('PA',91,lon),feature('PA',lat,182)
  ]);
  const result=await mock.search('Trenton, NJ');
  assert.deepEqual(result.items.map(p=>p.place_id),['mock_food_Harrisburg']);
  assert.equal(result.items[0].state,'PA');
});
test('positive Alaska longitudes and nearby points across the date line stay local',async()=>{
  const mock=adapter([city('Attu','AK',52.9,179.98)],[feature('AK',52.9,-179.98)]);
  const result=await mock.search('Attu, AK');
  assert.ok(result.items[0].distance_miles < 2);
  assert.equal(mapLongitude(-179.98,179.98),180.02);
  assert.equal(mapLongitude(179.98,-179.98),-180.02);
  assert.equal(mapLongitude(-76.88,-76.89),-76.88);
});
test('national directory and mapped sources are queried independently outside Pennsylvania',async()=>{
  const repo={search:async x=>{assert.equal(x.lat,61.22);assert.equal(x.lng,-149.90);return{items:[],total:0};}};
  const response=await handleApi(new Request('http://local/api/v1/resources?lat=61.22&lng=-149.90'),{repo,allowDemo:false});
  assert.equal(response.status,200);assert.equal((await response.json()).total,0);
  const state=readSupportState(new URLSearchParams('location=Anchorage%2C+AK'));
  for(const empty of [false,true]){
    const mock=adapter([city('Anchorage','AK',61.22,-149.90)],empty?[]:[feature('AK',61.22,-149.90)]);let directoryCalls=0;
    const result=await searchSupport(async path=>{if(path.startsWith('geoapify/'))return mock.search(state.location);assert.match(path,/^resources/);directoryCalls++;return{items:[],total:0,has_next:false};},state,true,new AbortController().signal);
    assert.equal(result.status,'results');assert.equal(result.partial,false);assert.equal(result.geoapify.length,empty?0:1);assert.equal(directoryCalls,1);assert(!result.notices.join(' ').includes('Pennsylvania only'));
  }
});
test('a successful empty search of both sources differs from partial coverage',async()=>{
  const state=readSupportState(new URLSearchParams('location=Harrisburg%2C+PA'));
  const mock=adapter([city('Harrisburg','PA',40.27,-76.88)]);
  const result=await searchSupport(async path=>path.startsWith('geoapify/')?mock.search(state.location):{items:[],has_next:false},
    state,true,new AbortController().signal);
  assert.equal(result.status,'results'); assert.equal(result.partial,false); assert.equal(result.geoapify.length,0);
});
test('legacy directory resolver refuses a different state, city, ZIP or ambiguous place',()=>{
  const pa={geometry:{coordinates:[-76.88,40.27]},properties:{feature_type:'place',name:'Harrisburg',context:{country:{country_code:'US'},region:{region_code:'PA'}}}};
  const or={...pa,properties:{...pa.properties,context:{...pa.properties.context,region:{region_code:'OR'}}}};
  const resolve=(features,q)=>directoryPlace(features,parseLocationQuery(q));
  assert.equal(resolve([pa,or],'Harrisburg'),null); assert.equal(resolve([pa,or],'Harrisburg, PA').state,'PA');
  assert.equal(resolve([pa],'Portland, PA'),null); assert.equal(resolve([pa],'Harrisburg, OR'),null);
  assert.equal(resolve([pa],'02108'),null);
});
