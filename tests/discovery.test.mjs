import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGoogleDiscoveryProvider, validLocationQuery, safePublicUrl, SEARCH_FIELDS, DETAIL_FIELDS } from '../backend/google-discovery.ts';
import { handleApi } from '../backend/app.ts';
import { discoveryTerms } from '../shared/discovery.ts';
import { publicEnvironmentProblems } from '../backend/env-boundary.mjs';
import { createDiscoverySelection } from '../src/discovery-selection.ts';
import { mountDiscoveryMap } from '../src/google-discovery-map.ts';
import { discoveryCards, discoveryDetail } from '../src/discovery-view.ts';
import { testEnv, geocode as fixtureGeocode, googlePlace, towns } from './discovery-fixtures.mjs';

function geocode(city = 'Harrisburg', state = 'PA', point = towns[city] ?? towns.Harrisburg) {
  const original = fixtureGeocode(city, state);
  return {...original, place_id:'mock_location_'+city.replaceAll(' ','_'), address_components: [...original.address_components, {short_name:city,long_name:city,types:['locality']}], geometry:{location:{lat:point[0],lng:point[1]}}};
}
const input = { query: 'Harrisburg', term: 'food_pantry', radiusMiles: 10 };
function setup({ locations = [geocode()], places = [googlePlace()], detail = googlePlace(), env = testEnv, fetcher, now, timeoutMs } = {}) {
  const calls = [];
  const provider = createGoogleDiscoveryProvider({ env, now, timeoutMs, fetcher: async (url, init) => {
    calls.push({ url, init });
    if (fetcher) return fetcher(url, init);
    if (url.includes('/geocode/')) return Response.json({ status: locations.length ? 'OK' : 'ZERO_RESULTS', results: locations });
    return Response.json(url.includes(':searchText') ? { places } : detail);
  } });
  const deps = { discovery: provider, repo: { search: async () => { throw Error('Discovery must not use the repository'); } }, allowDemo: true };
  const send = (path, init) => handleApi(new Request('http://local/api/v1/'+path, init), deps);
  return { provider, calls, send };
}
test('discovery is disabled without every explicit live-approval/configuration requirement; zero provider calls', async () => {
  for (const key of Object.keys(testEnv)) {
    const { provider, calls, send } = setup({ env: { ...testEnv, [key]: '' } });
    assert.equal(provider.status().enabled, false);
    const response = await send('discovery/places?q=Harrisburg');
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DISCOVERY_NOT_CONFIGURED'); assert.equal(calls.length, 0);
  }
  const withoutDependency = await handleApi(new Request('http://local/api/v1/discovery/status'), {});
  assert.equal((await withoutDependency.json()).enabled, false);
});
test('mocked Harrisburg, Philadelphia and Middletown resolve through Google with separate typed results', async () => {
  for (const city of Object.keys(towns)) {
    const [latitude, longitude] = towns[city];
    const { provider, calls } = setup({ locations: [geocode(city)], places: [googlePlace({ location: { latitude, longitude } })] });
    const result = await provider.search({ ...input, query: city });
    assert.equal(result.status, 'results'); assert.equal(result.location.state, 'PA'); assert.match(result.location.label, new RegExp(city));
    assert.equal(result.items[0].data_kind, 'google_discovered'); assert.equal(result.items[0].id, undefined); assert.equal(result.items[0].verified, undefined);
    assert.equal(calls.length, 2); assert.equal(new URL(calls[0].url).searchParams.get('components'), 'country:US');
    assert.equal(calls[1].init.headers['X-Goog-FieldMask'], SEARCH_FIELDS);
    const body = JSON.parse(calls[1].init.body); assert.equal(body.pageSize, 10); assert.ok(body.locationRestriction.rectangle); assert.equal(body.pageToken, undefined);
    assert.equal(calls[1].init.cache, 'no-store'); assert.ok(!SEARCH_FIELDS.includes('*')); assert.ok(!SEARCH_FIELDS.includes('Photo')); assert.ok(!SEARCH_FIELDS.includes('websiteUri'));
  }
});
test('legacy city/ZIP validation rejects addresses, wrong country, mismatched state, partial and invalid coordinates', async () => {
  assert.ok(validLocationQuery('17101')); assert.ok(validLocationQuery('Middletown, Dauphin County, PA'));
  for (const query of ['','123','123 Main St','https://evil.com','40,-76','a'.repeat(81)]) {
    const { provider, calls } = setup();
    await assert.rejects(provider.search({ ...input, query }), { code: 'LOCATION_NOT_FOUND' }); assert.equal(calls.length, 0);
  }
  for (const location of [{...geocode(),address_components:[{short_name:'PA',types:['administrative_area_level_1']},{short_name:'CA',types:['country']},{short_name:'Harrisburg',types:['locality']}]}, geocode('Harrisburg','NY'), { ...geocode(), partial_match: true }, { ...geocode(), geometry: { location: { lat: 91, lng: -76 } } }]) {
    const { provider, calls } = setup({ locations: [location] });
    await assert.rejects(provider.search({...input,query:'Harrisburg, PA'}), { code: 'LOCATION_NOT_FOUND' }); assert.equal(calls.length, 1);
  }
});
test('ambiguous returned locations require selection; forged choices cannot run Places', async () => {
  const locations = [geocode('Middletown'), { ...geocode('Middletown'), place_id: 'mock_other_Middletown', formatted_address: 'Middletown Township, PA, USA' }];
  const { provider, calls } = setup({ locations });
  const first = await provider.search({ ...input, query: 'Middletown' });
  assert.equal(first.status, 'choose_location'); assert.equal(first.choices.length, 2); assert.equal(calls.length, 1);
  const selected = await provider.search({ ...input, query: 'Middletown', locationId: locations[0].place_id });
  assert.equal(selected.status, 'results'); assert.equal(calls.length, 3);
  await assert.rejects(provider.search({ ...input, locationId: 'forged_location' }), { code: 'LOCATION_NOT_FOUND' }); assert.equal(calls.length, 4);
});
test('a ZIP search must match the returned postal component', async () => {
  const location = { ...geocode(), types: ['postal_code'], address_components: [...geocode().address_components,{short_name:'17101',types:['postal_code']}] };
  const { provider } = setup({locations:[location]});
  assert.equal((await provider.search({...input,query:'17101'})).status, 'results');
  await assert.rejects(provider.search({...input,query:'19102'}), {code:'LOCATION_NOT_FOUND'});
});
test('all six approved terms are bounded; grocery, unrelated, closed, duplicate and out-of-scope places excluded', async () => {
  for (const [term, config] of Object.entries(discoveryTerms)) {
    const good = googlePlace(config.category === 'healthcare' ? { displayName: { text: 'Mock Medical Clinic' }, types: ['medical_clinic'], primaryType: 'medical_clinic' } : {});
    const bad = [
      googlePlace({ id: 'mock_grocery', primaryType: 'grocery_store' }),
      googlePlace({ id: 'mock_unrelated', displayName: { text: 'Mock Miscellaneous Shop' } }),
      { ...good, id: 'mock_closed', businessStatus: 'CLOSED_TEMPORARILY' },
      { ...good, id: 'mock_wrong_country', addressComponents: [{ shortText:'NJ',types:['administrative_area_level_1'] }, { shortText:'CA',types:['country'] }] },
      { ...good, id: 'mock_distant', location: { latitude:42, longitude:-80 } },
      { ...good, id: '11111111-1111-4111-8111-111111111111' },
      { ...good, id: '<script>alert(1)</script>' }
    ];
    const { provider, calls } = setup({ places: [good,good,...bad] });
    const response = await provider.search({ ...input, term });
    assert.equal(response.items.length, 1, term); assert.equal(response.items[0].category, config.category);
    assert.equal(JSON.parse(calls[1].init.body).textQuery, config.label);
    assert.equal(response.items[0].cost, undefined); assert.equal(response.items[0].hours, undefined);
  }
});
test('empty Places responses stay empty with demo mode enabled; unsupported terms fail before billing', async () => {
  const { send, calls } = setup({ places: [] });
  const result = await send('discovery/places?q=Harrisburg&term=food_pantry');
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.deepEqual((await result.json()).items, []);
  for (const suffix of ['term=groceries', 'term=__proto__', 'radius_miles=500']) assert.equal((await send('discovery/places?q=Harrisburg&'+suffix)).status, 422);
  assert.equal(calls.length, 2);
});
test('provider quota, permission, timeout and malformed data produce redacted controlled errors without retries', async () => {
  for (const [status, code] of [[429,'PROVIDER_QUOTA'],[403,'PROVIDER_PERMISSION'],[500,'PROVIDER_UNAVAILABLE']]) {
    const { send, calls } = setup({ fetcher: async () => new Response('SENSITIVE_UPSTREAM_BODY', {status}) });
    const r = await send('discovery/places?q=Harrisburg'); assert.equal((await r.json()).error.code, code); assert.equal(calls.length, 1);
  }
  for (const [status, code] of [['OVER_QUERY_LIMIT','PROVIDER_QUOTA'],['REQUEST_DENIED','PROVIDER_PERMISSION'],['UNKNOWN_ERROR','PROVIDER_UNAVAILABLE']]) {
    const { send } = setup({ fetcher: async () => Response.json({status,error_message:'SENSITIVE_KEY'}) });
    const text = await (await send('discovery/places?q=Harrisburg')).text(); assert.ok(text.includes(code)); assert.ok(!text.includes('SENSITIVE'));
  }
  const { send } = setup({ timeoutMs: 5, fetcher: async (_url, init) => new Promise((_resolve,reject) => {
    const timer = setTimeout(() => reject(Error('test timeout')), 500);
    init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal.reason); }, {once:true});
  }) });
  assert.equal((await (await send('discovery/places?q=Harrisburg')).json()).error.code, 'PROVIDER_TIMEOUT');
  const malformed = setup({ fetcher: async () => new Response('<html>not JSON</html>') });
  assert.equal((await malformed.send('discovery/places?q=Harrisburg')).status, 503);
});
test('per-process minute and daily budgets bound provider calls', async () => {
  let now = 86400000;
  const { provider, calls } = setup({ now: () => now });
  for (let i=0;i<3;i++) await provider.search(input);
  await assert.rejects(provider.search(input), { code: 'DISCOVERY_LIMIT' }); assert.equal(calls.length, 6);
  for (let i=0;i<27;i++) { now += 60000; await provider.search(input); }
  now += 60000;
  await assert.rejects(provider.search(input), { code: 'DISCOVERY_LIMIT' }); assert.equal(calls.length, 60);
});
test('details revalidate identity/category/supported U.S. evidence; safe provider contacts and actual Place ID directions only', async () => {
  const { provider, calls, send } = setup({ detail: googlePlace({ websiteUri: 'https://example.com/provider', nationalPhoneNumber: '(717) 555-0100' }) });
  const detail = await provider.detail('mock_place_pantry', 'food');
  assert.equal(detail.website_url, 'https://example.com/provider'); assert.equal(detail.phone, '(717) 555-0100');
  assert.equal(new URL(detail.directions_url).searchParams.get('destination_place_id'), detail.place_id);
  assert.equal(calls[0].init.headers['X-Goog-FieldMask'], DETAIL_FIELDS); assert.ok(!DETAIL_FIELDS.includes('regularOpeningHours'));
  assert.equal((await send('discovery/places/mock_place_pantry?category=food', {method:'PATCH'})).status, 405);
  for (const invalid of [googlePlace({id:'mock_other_place'}), googlePlace({businessStatus:'CLOSED_PERMANENTLY'}),googlePlace({movedPlaceId:'mock_new_place'})]) {
    await assert.rejects(setup({detail:invalid}).provider.detail('mock_place_pantry','food'), {code:'PLACE_NOT_ELIGIBLE'});
  }
  await assert.rejects(setup().provider.detail('11111111-1111-4111-8111-111111111111','food'), {code:'PLACE_NOT_ELIGIBLE'});
  const unsafe = await setup({detail:googlePlace({websiteUri:'javascript:alert(1)',nationalPhoneNumber:'<script>alert(1)</script>'})}).provider.detail('mock_place_pantry','food');
  assert.equal(unsafe.website_url, null); assert.equal(unsafe.phone, null);
  for (const url of ['javascript:x','http://example.com','https://localhost','https://127.0.0.1','https://name:secret@example.com']) assert.equal(safePublicUrl(url), null);
});
test('server Google credentials cannot pass Vite boundary through names or aliases', () => {
  assert.ok(publicEnvironmentProblems({VITE_GOOGLE_PLACES_API_KEY:'private'}).length);
  assert.ok(publicEnvironmentProblems({GOOGLE_GEOCODING_API_KEY:'private',VITE_GOOGLE_MAPS_API_KEY:'private'}).length);
  assert.equal(publicEnvironmentProblems({GOOGLE_GEOCODING_API_KEY:'private',VITE_GOOGLE_MAPS_API_KEY:'different-public-key'}).length, 0);
});
test('mocked Google marker clicks and list actions use the same selection; replacement removes stale markers', async () => {
  const response = await setup({places:[googlePlace(),googlePlace({id:'mock_second_place'})]}).provider.search(input);
  const changes = [], markers = [], cameras = [];
  const selection = createDiscoverySelection(place => { changes.push(place?.place_id ?? null); map.select(place?.place_id ?? null); });
  const sdk = {
    Map: class { constructor(_container, options) { assert.equal(options.colorScheme,'LIGHT'); } moveCamera(value) { cameras.push(value); } },
    AdvancedMarkerElement: class { constructor(options) { Object.assign(this,options); markers.push(this); } addListener(event, listener) { assert.equal(event,'click'); this.click=listener; return {remove:()=>{this.removed=true;}}; } }
  };
  const map = mountDiscoveryMap(sdk, {replaceChildren(){}}, 'mock-map-id', id => selection.select(id), n => ({textContent:String(n),dataset:{}}));
  selection.replace(response.items); map.update(response.items);
  assert.equal(markers.length,2); assert.equal(markers[0].gmpClickable,true);
  markers[1].click(); assert.equal(selection.current(),'mock_second_place'); assert.equal(markers[1].content.dataset.selected,'true');
  selection.select('mock_place_pantry'); assert.equal(markers[0].content.dataset.selected,'true'); assert.equal(markers[1].content.dataset.selected,'false');
  assert.equal(selection.select('not_in_results'),false); assert.equal(selection.select('mock_place_pantry'),false);
  selection.replace([]); map.update([]); markers[1].click(); assert.equal(selection.current(),null);
  assert.ok(markers.every(m=>m.removed && m.map===null)); assert.equal(cameras.length,1); assert.deepEqual(changes,[null,'mock_second_place','mock_place_pantry',null]);
});
test('renderers escape provider text, preserve attribution, and explain unverified costs and services', async () => {
  const result = await setup().provider.search(input);
  const place = {...result.items[0],name:'<script>alert("x")</script> Food Pantry'};
  const cards = discoveryCards([place]), detail = discoveryDetail(place);
  assert.ok(!cards.includes('<script>')); assert.ok(cards.includes('&lt;script&gt;')); assert.ok(cards.includes('aria-pressed="false"'));
  assert.ok(detail.includes('free clinic')); assert.ok(detail.includes('does not confirm free care'));
  assert.ok(detail.includes('/attribution/google-maps.svg')); assert.ok(detail.includes('Mock attribution'));
  assert.ok(detail.includes('noopener noreferrer')); assert.ok(!detail.includes('/resources/')); assert.ok(!detail.includes('/staff/'));
});

test('mocked New York, Anchorage, Honolulu and positive-longitude Alaska resolve without Pennsylvania restrictions', async () => {
  for (const [city,state,point] of [['New York','NY',[40.7128,-74.006]],['Anchorage','AK',[61.2181,-149.9003]],['Honolulu','HI',[21.3099,-157.8581]],['Attu Station','AK',[52.83,173.2]]]) {
    const {provider,calls} = setup({locations:[geocode(city,state,point)],places:[googlePlace({location:{latitude:point[0],longitude:point[1]},addressComponents:[{shortText:state,types:['administrative_area_level_1']},{shortText:'US',types:['country']}]})]});
    const result = await provider.search({...input,query:city+', '+state});
    assert.equal(result.status,'results');assert.equal(result.location.state,state);assert.equal(result.items.length,1);
    assert.equal(new URL(calls[0].url).searchParams.get('components'),'country:US');
    const rectangle=JSON.parse(calls[1].init.body).locationRestriction.rectangle;
    assert(rectangle.low.latitude<=point[0]&&rectangle.high.latitude>=point[0]);
    assert(rectangle.low.longitude>=-180&&rectangle.high.longitude<=180);
  }
});

test('explicit city/state/county and ZIP evidence cannot be replaced by a provider mismatch or conflicting evidence', async () => {
  const stateConflict={...geocode(),address_components:[{short_name:'PA',long_name:'New York',types:['administrative_area_level_1']},{short_name:'US',types:['country']},{short_name:'Harrisburg',types:['locality']}]};
  const countryConflict={...geocode(),address_components:[...geocode().address_components,{short_name:'CA',types:['country']}]};
  const longCountryConflict={...geocode(),address_components:geocode().address_components.map(c=>c.types.includes('country')?{...c,long_name:'Canada'}:c)};
  const missingCountry={...geocode(),address_components:geocode().address_components.filter(c=>!c.types.includes('country'))};
  const duplicateState={...geocode(),address_components:[...geocode().address_components,{short_name:'NY',types:['administrative_area_level_1']}]};
  const territory=geocode('San Juan','PR',[18.46,-66.12]);
  for(const bad of [stateConflict,countryConflict,longCountryConflict,missingCountry,duplicateState,territory,geocode('Philadelphia'),geocode('Harrisburg','NY')]) {
    await assert.rejects(setup({locations:[bad]}).provider.search({...input,query:'Harrisburg, PA'}),{code:'LOCATION_NOT_FOUND'});
  }
  const county={...geocode(),address_components:[...geocode().address_components,{short_name:'Dauphin',long_name:'Dauphin County',types:['administrative_area_level_2']}]};
  assert.equal((await setup({locations:[county]}).provider.search({...input,query:'Harrisburg, Dauphin County, Pennsylvania'})).status,'results');
  await assert.rejects(setup({locations:[county]}).provider.search({...input,query:'Harrisburg, York County, PA'}),{code:'LOCATION_NOT_FOUND'});
  const zip={...geocode('Holtsville','NY',[40.81,-73.05]),types:['postal_code'],address_components:[...geocode('Holtsville','NY').address_components,{short_name:'00501',types:['postal_code']}]};
  assert.equal((await setup({locations:[zip],places:[]}).provider.search({...input,query:'00501'})).location.state,'NY');
  await assert.rejects(setup({locations:[zip]}).provider.search({...input,query:'00502'}),{code:'LOCATION_NOT_FOUND'});
  for(const query of ['APO, AE','FPO AP','San Juan, PR']) {
    const {provider,calls}=setup();await assert.rejects(provider.search({...input,query}),{code:'LOCATION_NOT_FOUND'});assert.equal(calls.length,0);
  }
});

test('Springfield choices keep state/county identity and never select popularity or an unreturned ID', async () => {
  const locations=[['IL',[39.78,-89.65],'Sangamon County'],['MA',[42.1,-72.59],'Hampden County']].map(([state,point,county])=>({...geocode('Springfield',state,point),place_id:'mock_springfield_'+state,address_components:[...geocode('Springfield',state,point).address_components,{long_name:county,types:['administrative_area_level_2']}]}));
  const {provider,calls}=setup({locations,places:[]});
  const result=await provider.search({...input,query:'Springfield'});
  assert.equal(result.status,'choose_location');assert.deepEqual(result.choices.map(item=>item.state),['IL','MA']);
  assert.match(result.choices[0].label,/Sangamon County/);assert.equal(calls.length,1);
  await assert.rejects(provider.search({...input,query:'Springfield',locationId:'mock_springfield_forged'}),{code:'LOCATION_NOT_FOUND'});assert.equal(calls.length,2);
  assert.equal((await provider.search({...input,query:'Springfield',locationId:'mock_springfield_MA'})).location.state,'MA');
});

test('nearby cross-state results remain eligible, while conflicting/missing country evidence and malformed points fail', async () => {
  const components=[{shortText:'NJ',longText:'New Jersey',types:['administrative_area_level_1']},{shortText:'US',longText:'United States',types:['country']}];
  const good=googlePlace({id:'mock_nj_pantry',location:{latitude:40.716,longitude:-74.034},addressComponents:components});
  const bad=[googlePlace({id:'mock_conflict_state',addressComponents:[{shortText:'PA',longText:'New York',types:['administrative_area_level_1']},{shortText:'US',types:['country']}]}),googlePlace({id:'mock_no_country',addressComponents:[components[0]]}),googlePlace({id:'mock_invalid_point',location:{latitude:40,longitude:181}})];
  const result=await setup({locations:[geocode('New York','NY',[40.7128,-74.006])],places:[good,...bad]}).provider.search({...input,query:'New York, NY'});
  assert.deepEqual(result.items.map(item=>item.place_id),['mock_nj_pantry']);
  await assert.rejects(setup({detail:bad[0]}).provider.detail(bad[0].id,'food'),{code:'PLACE_NOT_ELIGIBLE'});
});

test('legacy Google radius restriction wraps the antimeridian without an invalid longitude range', async () => {
  const {provider,calls}=setup({locations:[geocode('Alaska search area','AK',[52,179.99])],places:[]});
  await provider.search({...input,query:'Alaska search area, AK',radiusMiles:25});
  const rectangle=JSON.parse(calls[1].init.body).locationRestriction.rectangle;
  assert(rectangle.low.longitude>rectangle.high.longitude);
  assert(rectangle.low.longitude>=-180&&rectangle.low.longitude<=180&&rectangle.high.longitude>=-180&&rectangle.high.longitude<=180);
});
