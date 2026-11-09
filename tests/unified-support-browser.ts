import '../src/institution-media.css';
// Explicit browser-only fixture. Not imported by the application or emitted in dist.
import '../src/design-tokens.css';
import '../src/styles.css';
import '../src/support.css';
import '../src/discovery.css';
import '../src/unified-support.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/maplibre-support-map.css';
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {mountSupportPage} from '../src/support-page';
import {initializeSiteNavigation} from '../src/navigation';
import {handleApi} from '../backend/app';
import {createGeoapifyProvider} from '../backend/geoapify-discovery';
import {mountSupportMap} from '../src/maplibre-support-map';
import {geoTestEnv,geoCity,geoFeature,geoTowns} from './geoapify-fixtures.mjs';
initializeSiteNavigation();
maplibre.setWorkerUrl(workerUrl);
const scenario=document.querySelector<HTMLSelectElement>('#scenario')!;
const counter=document.createElement('p');counter.id='mockRequestCount';document.querySelector('aside')!.append(counter);
let geocodes=0,places=0,directoryCalls=0,mapMounts=0,statusScrolls=0;
const nativeScroll=HTMLElement.prototype.scrollIntoView;
HTMLElement.prototype.scrollIntoView=function(options){if(this.id==='resultsCount'){statusScrolls++;counts();}nativeScroll.call(this,options);};
function counts(){counter.textContent=`Status scrolls: ${statusScrolls}. Mock geocodes: ${geocodes}. Mock Places calls: ${places}. Directory calls: ${directoryCalls}. Offline MapLibre mounts: ${mapMounts}. No live provider traffic.`;}
let currentTown='Harrisburg';
const makeProvider=()=>createGeoapifyProvider({env:geoTestEnv,timeoutMs:scenario.value==='slow'?5000:1000,fetcher:async(url,init)=>{
  const value=scenario.value,params=new URL(String(url)).searchParams;
  if(String(url).includes('/geocode/'))geocodes++;else places++;counts();
  if(value==='quota')return new Response('',{status:429});
  if(value==='permission')return new Response('',{status:403});
  if(value==='timeout')return new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
  if(String(url).includes('/geocode/')) {
    const q=params.get('text')??'';
    currentTown=q.includes('Philadelphia')?'Philadelphia':q.includes('Middletown')?'Middletown':'Harrisburg';
    return Response.json({results:value==='invalid'?[]:value==='ambiguous'?[geoCity('Middletown'),geoCity('Middletown',{place_id:'mock_other_location',formatted:'Mock Middletown Township, PA, USA'})]:[geoCity(currentTown)]});
  }
  const category=params.get('categories')!,healthcare=category.startsWith('healthcare');
  const place=geoFeature(currentTown,{categories:category.split(','),...(healthcare?{name:'Mock Community Clinic — do not visit'}:{})});
  if(value==='slow')await new Promise(resolve=>setTimeout(resolve,3000));
  return Response.json({type:'FeatureCollection',features:value==='empty'?[]:value==='many'?Array.from({length:20},(_,i)=>{const feature=geoFeature(currentTown,{place_id:'mock_many_'+i,categories:category.split(','),name:`Mock location ${String(i+1).padStart(2,'0')} — do not visit`,...(i===0?{website:'https://example.org/',phone:'+1 717 555 0100'}:{})});feature.geometry.coordinates=[feature.geometry.coordinates[0]+(i%5)*.007,feature.geometry.coordinates[1]+Math.floor(i/5)*.007];return feature;}):value==='one'?[place]:[place,geoFeature(currentTown,{place_id:'mock_second_place',categories:category.split(','),name:healthcare?'Mock Second Clinic — do not visit':'Mock Second Food Service — do not visit'})]});
}});
const deps={geoapify:makeProvider(),allowDemo:true,resolvePlace:async()=>({label:'Harrisburg, PA (mock)',city:'Harrisburg',state:'PA',latitude:40.2732,longitude:-76.8867}),repo:{search:async(input)=>{
  directoryCalls++;counts();
  if(scenario.value==='directory')throw Error('Mock directory failure');
  const items=['empty','one'].includes(scenario.value)?[]:[{id:input.page===1?'11111111-1111-4111-8111-111111111111':'77777777-7777-4777-8777-777777777777',title:input.demoOnly?'Fictional demonstration pantry — do not visit':`Mock Our Ground ${input.category==='healthcare'?'healthcare':'food'} record ${input.page} — do not visit`,summary:'Invented test fixture, not a real service.',category_slugs:[input.category],organization:{id:'mock-org',name:'Mock organization'},location:{city:currentTown,state:'PA',address_label:'MOCK ADDRESS — DO NOT VISIT',latitude:input.lat,longitude:input.lng},distance_miles:0,data_kind:input.demoOnly?'fictional_demo':'sourced_unverified',source_recorded_at:null}];
  return {items,total:items.length?21:0};
}}};
// Scenarios must not reuse a successful result from the preceding scenario's cache.
scenario.addEventListener('change',()=>{deps.geoapify=makeProvider();});
class OfflineMap extends maplibre.Map {
  constructor(options:maplibre.MapOptions){super({...options,style:{version:8,sources:{},layers:[{id:'mock-background',type:'background',paint:{'background-color':'#e5e8df'}}]}});this.on('error',event=>{counter.textContent+=' Offline diagnostic: '+event.error.message;});}
}
await mountSupportPage(document.querySelector('#app')!,{
  request:async(path,init)=>{
    if(scenario.value==='protection' && path.startsWith('geoapify/places'))throw Error('Search protection is temporarily unavailable. Please try again shortly.');
    const response=await handleApi(new Request('http://mock/api/v1/'+path,init),deps as any);
    const data=await response.json();if(!response.ok)throw Error(data.error.message);return data;
  },
  mountMap:async(container,select,failure,center)=>{
    mapMounts++;counts();if(scenario.value==='map')throw Error('Mock map failure');
    const map=await mountSupportMap({...maplibre,Map:OfflineMap},container,'mock-browser-value-not-a-credential',select,(message)=>{counter.textContent+=' Offline map failure: '+message;failure(message);},center).catch(error=>{counter.textContent+=' Offline map setup: '+error.message;throw error;});
    const label=document.createElement('p');label.textContent='OFFLINE MOCK MAP — real MapLibre controls, no tiles or live locations.';
    Object.assign(label.style,{position:'absolute',bottom:'36px',left:'12px',right:'50px',background:'#fffdf8',padding:'8px',fontSize:'12px',pointerEvents:'none'});container.append(label);
    return map;
  }
});
counts();
