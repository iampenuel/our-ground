import {getGeoapifyStyleURL} from '../shared/map-provider.ts';
import type * as MapLibre from 'maplibre-gl';
export type SupportMapPoint = {place_id:string;name:string;latitude:number;longitude:number};
type Center = {latitude:number; longitude:number};
/** Keep nearby points on the same copy of the world across the date line. */
export function mapLongitude(longitude:number, anchor:number) {
  const delta = longitude - anchor;
  return Math.abs(delta) <= 180 ? longitude : longitude + (delta < 0 ? 360 : -360);
}
export type SupportMap = {update(items:SupportMapPoint[],center?:Center):void;select(id:string|null,reveal?:boolean):void;resize():void;destroy():void;getCenter?():Center;setLocationPicking?(choose:((point:Center)=>void)|null):void};
type SDK = Pick<typeof MapLibre,'Map'|'Marker'|'NavigationControl'|'AttributionControl'|'LngLatBounds'>;

/** Lazy, single renderer. The list remains independent of WebGL and tile availability. */
export async function loadSupportMap(container:HTMLElement,key:string,select:(id:string)=>void,failure:(message?:string)=>void,initialCenter:Center) {
  const sdk=await import('maplibre-gl');
  // V6's worker must be bundled explicitly; a plain URL omits its shared module.
  const {default:workerUrl}=await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url');
  sdk.setWorkerUrl(workerUrl);
  await import('maplibre-gl/dist/maplibre-gl.css');
  await import('./maplibre-support-map.css');
  return mountSupportMap(sdk,container,key,select,failure,initialCenter);
}
export async function mountSupportMap(sdk:SDK,container:HTMLElement,key:string,select:(id:string)=>void,failure:(message?:string)=>void,initialCenter:Center):Promise<SupportMap> {
  const map=new sdk.Map({container,style:getGeoapifyStyleURL(key),center:[initialCenter.longitude,initialCenter.latitude],zoom:11,minZoom:7,maxZoom:16,attributionControl:false,cooperativeGestures:true,scrollZoom:false,canvasContextAttributes:{preserveDrawingBuffer:false}});
  map.addControl(new sdk.NavigationControl({showCompass:false}), 'top-right');
  map.getCanvas().setAttribute('aria-label','Resource map. Arrow keys pan; plus and minus zoom. Every location is also available in the results list.');
  let entries:Array<{id:string;button:HTMLButtonElement;marker:MapLibre.Marker;coords:[number,number];remove():void}>=[],destroyed=false;
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(!destroyed&&container.clientWidth&&container.clientHeight)map.resize();});
  observer?.observe(container);
  let choosePoint:((point:Center)=>void)|null=null;
  const crosshair=document.createElement('div');crosshair.className='search-location-crosshair';crosshair.setAttribute('aria-hidden','true');crosshair.textContent='+';
  const pick=(event:MapLibre.MapMouseEvent)=>{if(!choosePoint||(event.originalEvent.target as Element|null)?.closest?.('.geo-map-pin,.maplibregl-ctrl'))return;choosePoint({latitude:event.lngLat.lat,longitude:((event.lngLat.lng+180)%360+360)%360-180});};
  map.on('click',pick);
  const clear=()=>{for(const e of entries){e.remove();e.marker.remove();}entries=[];};
  const destroy=()=>{if(destroyed)return;destroyed=true;observer?.disconnect();choosePoint=null;crosshair.remove?.();map.off?.('click',pick);clear();map.remove();};
  await new Promise<void>((resolve,reject)=>{
    let loaded=false;
    const timer=window.setTimeout(()=>{destroy();reject(new Error('Map loading timed out.'))},15000);
    map.once('load',()=>{loaded=true;clearTimeout(timer);resolve();});
    // Do not print MapLibre/provider errors: resource URLs contain the public key.
    map.on('error',event=>{
      const limited=(event.error as Error & {status?:number})?.status===429;
      const message=limited?'Geoapify’s free allowance or request limit has been reached. The results list remains available.':'Map unavailable. The matching results and details remain usable in the list.';
      clearTimeout(timer);
      if(!loaded){destroy();reject(new Error(message));}else{failure(message);}
    });
  });
  // Geoapify supplies all required credit through its TileJSON metadata.
  // MapLibre renders it automatically; adding custom credit duplicates it.
  map.addControl(new sdk.AttributionControl({compact:false,customAttribution:'<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>'}));
  return {
    update(items, center=initialCenter) {
      if(destroyed)return;
      clear();
      const bounds=new sdk.LngLatBounds();
      bounds.extend([center.longitude,center.latitude]);
      for(const [index,p] of items.entries()) {
        const button=document.createElement('button');button.type='button';button.className='geo-map-pin';button.dataset.edenMapKey=p.place_id;button.textContent=String(index+1);
        button.setAttribute('aria-label',`${index+1}. ${p.name}. Select result`);button.setAttribute('aria-pressed','false');
        const click=()=>select(p.place_id);button.addEventListener('click',click);
        const coords: [number, number] = [mapLongitude(p.longitude, center.longitude), p.latitude];
        const marker=new sdk.Marker({element:button,anchor:'center'}).setLngLat(coords).addTo(map);
        entries.push({id:p.place_id,button,marker,coords,remove:()=>button.removeEventListener('click',click)});
        bounds.extend(coords);
      }
      map.resize();
      if(items.length)map.fitBounds(bounds,{padding:55,maxZoom:13,duration:0});else map.jumpTo?.({center:[center.longitude,center.latitude]});
    },
    select(id,reveal=false) {
      if(destroyed)return;
      for(const e of entries){e.button.dataset.selected=String(e.id===id);e.button.setAttribute('aria-pressed',String(e.id===id));if(reveal&&e.id===id)map.panTo(e.coords,{duration:0});}
    },
    getCenter(){const point=map.getCenter();return{latitude:point.lat,longitude:((point.lng+180)%360+360)%360-180};},
    setLocationPicking(choose){if(destroyed)return;choosePoint=choose;map.getCanvas().style.cursor=choose?'crosshair':'';if(choose)container.append(crosshair);else crosshair.remove();},
    resize(){if(!destroyed)map.resize();},
    destroy
  };
}
