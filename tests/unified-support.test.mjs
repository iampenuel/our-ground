import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readSupportState,supportUrl,discoverCompatibilityUrl,combineSupportResults,filterSupportResults,supportMapPoints,latestRequest} from '../src/support-model.ts';
import {searchSupport,directorySearch} from '../src/support-search.ts';
import {supportCards} from '../src/support-view.ts';
import {createKeyedSelection} from '../src/discovery-selection.ts';
import {mountSupportMap} from '../src/maplibre-support-map.ts';
import {handleApi} from '../backend/app.ts';
import {DemoRepository} from '../backend/demo.ts';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {geoTestEnv as testEnv,geoCity as geocode,geoFeature as geoPlace} from './geoapify-fixtures.mjs';

const state=readSupportState(new URLSearchParams('location=Harrisburg&category=food&radius_miles=10'));
const source={id:'11111111-1111-4111-8111-111111111111',title:'Mock Food Pantry — test fixture',summary:'Mock directory record. Do not visit.',category_slugs:['food'],organization:{id:'mock_org',name:'Mock organization'},location:{city:'Harrisburg',state:'PA',address_label:'MOCK ADDRESS',latitude:40.2732,longitude:-76.8867},distance_miles:0,data_kind:'sourced_unverified',source_recorded_at:null};
const fictional={...source,id:'77777777-7777-4777-8777-777777777777',data_kind:'fictional_demo'};
const collection=(items=[source])=>({items,page:1,page_size:20,total:items.length,has_next:false,search_center:{latitude:40.2732,longitude:-76.8867}});
function setup({empty=false,ambiguous=false,directoryFails=false}={}) {
  const paths=[],providerCalls=[];
  const provider=createGeoapifyProvider({env:testEnv,fetcher:async(url,init)=>{
    providerCalls.push({url,init});
    if(String(url).includes('/geocode/')) return Response.json({results:ambiguous?[geocode(),{...geocode(),place_id:'mock_second_location'}]:[geocode()]});
    return Response.json({type:'FeatureCollection',features:empty?[]:[geoPlace()]});
  }});
  const request=async(path,init)=>{
    paths.push(path);
    if(path.startsWith('geoapify/places?')) {const p=new URLSearchParams(path.split('?')[1]);return provider.search({query:p.get('q'),term:p.get('term'),radiusMiles:Number(p.get('radius_miles')),locationId:p.get('location_id')??undefined},init.signal);}
    if(path.startsWith('resources?')) {if(directoryFails)throw Error('Directory unavailable');return collection();}
    if(path.startsWith('places/resolve?')) return {place:{label:'Harrisburg, PA',...source.location}};
    throw Error('Unexpected endpoint '+path);
  };
  return {request,paths,providerCalls};
}
test('legacy discover links resolve to canonical support with location, term, category, radius and view',()=>{
  const url=new URL(discoverCompatibilityUrl('?q=Middletown%2C+PA&term=free_clinic&radius_miles=25&view=list'),'http://local');
  assert.equal(url.pathname,'/support');assert.equal(url.searchParams.get('location'),'Middletown, PA');assert.equal(url.searchParams.get('category'),'healthcare');assert.equal(url.searchParams.get('term'),'medical_clinic');assert.equal(url.searchParams.get('view'),'list');assert.equal(url.searchParams.get('radius_miles'),'25');assert.equal(url.searchParams.get('q'),null);
  const old=readSupportState(new URLSearchParams('location=17101&q=food%20%26%20care&radius_miles=50&term=__proto__'),true);
  assert.equal(old.radius,50);assert.equal(old.term,'food_assistance');assert.equal(old.view,'map');assert.equal(old.mode,'real');
  assert.equal(new URL(supportUrl(old),'http://local').searchParams.get('q'),'food & care');
});
test('unified search makes one Geoapify search and reuses its exact center for sourced directory filtering',async()=>{
  const s=setup();const found=await searchSupport(s.request,state,true,new AbortController().signal);
  assert.equal(found.status,'results');assert.equal(found.geoapify.length,1);assert.equal(found.directory.items.length,1);
  assert.equal(s.providerCalls.length,2);assert.equal(s.paths.length,2);assert.ok(!s.paths.some(p=>p.startsWith('places/resolve')));
  const params=new URLSearchParams(s.paths[1].split('?')[1]);assert.equal(params.get('data_kind'),'real');assert.equal(Number(params.get('lat')),found.center.latitude);
  assert.equal(new URL(s.providerCalls[1].url).searchParams.get('categories'),'service.social_facility.food,amenity.give_box.food');
  await directorySearch(s.request,state,found.center,2,new AbortController().signal);assert.equal(s.providerCalls.length,2);assert.equal(new URLSearchParams(s.paths[2].split('?')[1]).get('page'),'2');
});
test('ambiguous live locations require a choice before directory or Places requests',async()=>{
  const s=setup({ambiguous:true});const found=await searchSupport(s.request,state,true,new AbortController().signal);
  assert.equal(found.status,'choose_location');assert.equal(s.paths.length,1);assert.equal(s.providerCalls.length,1);
});
test('failed discovery is an error, never a successful zero-results search or fallback',async()=>{
  const paths=[];
  const found=await searchSupport(async path=>{paths.push(path);throw Error('Search protection is temporarily unavailable.');},state,true,new AbortController().signal);
  assert.equal(found.status,'error');assert.equal(found.canTryDirectory,true);
  assert.match(found.notices[0],/Search protection/);assert.equal(paths.length,2);
  assert.equal(found.geoapify,undefined);
  const locationFailure=await searchSupport(async()=>{throw Error('Location unavailable');},state,false,new AbortController().signal);
  assert.equal(locationFailure.status,'error');assert.equal(locationFailure.canTryDirectory,false);
});
test('Geoapify results survive directory failures and Geoapify empty results never acquire fictional fallback',async()=>{
  const failed=setup({directoryFails:true});const result=await searchSupport(failed.request,state,true,new AbortController().signal);
  assert.equal(result.geoapify.length,1);assert.equal(result.directory,null);assert.match(result.notices[0],/directory/i);
  const empty=setup({empty:true});const result2=await searchSupport(empty.request,state,true,new AbortController().signal);
  assert.equal(result2.geoapify.length,0);assert.equal(result2.mappedStatus,'available');assert.equal(result2.partial,false);assert.deepEqual(result2.notices,[]);
  assert.deepEqual(combineSupportResults([fictional],[],state.mode),[]);
});
test('explicit demo mode performs no Geoapify calls even when discovery is enabled',async()=>{
  const s=setup();await searchSupport(s.request,{...state,mode:'demo'},true,new AbortController().signal);
  assert.equal(s.providerCalls.length,0);assert.ok(s.paths[0].startsWith('places/resolve?'));assert.equal(new URLSearchParams(s.paths[1].split('?')[1]).get('data_kind'),'fictional_demo');
  const s2=setup();await searchSupport(s2.request,state,false,new AbortController().signal);assert.equal(s2.providerCalls.length,0);assert.equal(new URLSearchParams(s2.paths[1].split('?')[1]).get('data_kind'),'real');
});
test('directory source filter applies before pagination and cannot override server demo permission',async()=>{
  const deps={repo:new DemoRepository(),allowDemo:true};
  const send=kind=>handleApi(new Request('http://local/api/v1/resources?lat=40.2732&lng=-76.8867&category=food&page_size=1&data_kind='+kind),deps);
  const real=await (await send('sourced_unverified')).json();assert.equal(real.total,0);assert.equal(real.has_next,false);assert.deepEqual(real.items,[]);
  const demo=await (await send('fictional_demo')).json();assert.equal(demo.items.length,1);assert.equal(demo.items[0].data_kind,'fictional_demo');
  deps.allowDemo=false;assert.equal((await (await send('fictional_demo')).json()).total,0);assert.equal((await send('geoapify_discovered')).status,422);
});
test('source namespaces prevent accidental merging; local filtering and map exclude fictional points',async()=>{
  const found=await searchSupport(setup().request,state,true,new AbortController().signal);
  const g={...found.geoapify[0],name:source.title,place_id:source.id};
  const mixed=combineSupportResults([source,fictional],[g],'real');assert.equal(mixed.length,2);assert.notEqual(mixed[0].key,mixed[1].key);
  assert.equal(filterSupportResults(mixed,'mock').length,2);assert.equal(filterSupportResults(mixed,'does not exist').length,0);
  assert.equal(supportMapPoints(mixed).length,2);assert.deepEqual(supportMapPoints(combineSupportResults([fictional],[g],'demo')),[]);
  const cards=supportCards(mixed,null);assert.match(cards,/Our Ground sourced record/);assert.match(cards,/Geoapify mapped location/);assert.match(cards,/Services not verified/);
  assert.match(cards,/resource=11111111/);assert.doesNotMatch(cards,/href="\/resources\//);assert.ok(!cards.includes('placeDetail'));
  assert.ok(!cards.includes('/staff/'));assert.ok(!supportCards([{...mixed[0],kind:'directory',record:{...source,title:'<script>attack</script>'}}],null).includes('<script>'));
});
test('unified source keys select matching MapLibre markers, preserve selection and clean up',async()=>{
  const records=combineSupportResults([source],[],'real'),markers=[],events=[];
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={setTimeout};
  globalThis.document={createElement:()=>({dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(_,fn){this.click=fn;},removeEventListener(){this.click=null;}})};
  const sdk={Map:class{constructor(options){events.push(options);}addControl(){}getCanvas(){return{setAttribute(){}};}once(_,fn){queueMicrotask(fn);}on(){}getStyle(){return{sources:{}};}panTo(coords,options){events.push({pan:coords,duration:options.duration});}resize(){}fitBounds(_,options){assert.equal(options.duration,0);}remove(){events.push('removed');}},Marker:class{constructor(o){this.element=o.element;markers.push(this);}setLngLat(coords){this.coords=coords;return this;}addTo(){return this;}remove(){this.removed=true;}},NavigationControl:class{},AttributionControl:class{constructor(options){events.push({attribution:options});}},LngLatBounds:class{extend(){return this;}}};
  let map;const selection=createKeyedSelection(item=>item.key,item=>map?.select(item?.key??null));
  try {
    map=await mountSupportMap(sdk,{},'mock-browser-value',id=>selection.select(id),()=>assert.fail('unexpected failure'),source.location);
    selection.replace(records);map.update(supportMapPoints(records));markers[0].element.click();assert.equal(selection.current(),'directory:'+source.id);assert.equal(markers[0].element.attrs['aria-pressed'],'true');
    assert.deepEqual(markers[0].coords,[-76.8867,40.2732]);assert.match(events[0].style,/maps.geoapify.com\/v1\/styles\/osm-bright-smooth/);assert.equal(events[0].scrollZoom,false);assert.equal(events[0].cooperativeGestures,true);assert.match(events.find(e=>e?.attribution)?.attribution.customAttribution,/https:\/\/maplibre.org\//);
    map.select(records[0].key,true);assert.deepEqual(events.at(-1),{pan:[-76.8867,40.2732],duration:0});selection.replace(records,true);assert.equal(selection.current(),records[0].key);selection.replace([],true);map.update([]);assert.equal(markers[0].removed,true);assert.equal(selection.current(),null);map.destroy();assert.ok(events.includes('removed'));
  }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
test('obsolete and canceled requests cannot replace a newer search even if transport ignores cancellation',async()=>{
  const gate=latestRequest(),first=gate.start(),commits=[];
  let release;const slow=new Promise(resolve=>{release=resolve;}).then(()=>{if(first.current())commits.push('old');});
  const second=gate.start();assert.equal(first.signal.aborted,true);if(second.current())commits.push('new');release();await slow;assert.deepEqual(commits,['new']);
  gate.cancel();assert.equal(second.current(),false);
});

test('fictional complete cards stay in context and never expose real actions or reports',()=>{
  const html=supportCards([{kind:'directory',key:'directory:'+fictional.id,record:fictional}],null,'/support?mode=demo');
  assert.match(html,/Not a visitable location/);assert.doesNotMatch(html,/href="\/resources\/|data-resource-report|data-resource-open/);
  assert.ok(!html.includes('maps/dir'));assert.ok(!html.includes('tel:'));
});
