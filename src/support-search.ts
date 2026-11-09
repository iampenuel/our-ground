import type { Place, SearchResults } from '../shared/contracts.ts';
import type { SelectedLocation } from '../shared/location-search.ts';
import {locationSearchScope} from '../shared/location-search.ts';
import type { GeoLocation as DiscoveryLocation, GeoSearch as DiscoverySearch, GeoPlace as DiscoveredPlace, GeoAttribution } from '../shared/geoapify.ts';
import type { SupportState } from './support-model.ts';
import {searchFailure,type Failure} from './support-search-outcome.ts';
export type SupportRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export type SearchCenter = Pick<SelectedLocation,'label'|'latitude'|'longitude'|'state'|'quality'> & {selection?:SelectedLocation};
export type SupportSearch = { status:'choose_location'; choices:DiscoveryLocation[] } | {status:'error';notices:string[];canTryDirectory:boolean;failure?:Failure} | {
  status:'results'; failure?:Failure; center:SearchCenter | null; geoapify:DiscoveredPlace[]; directory:SearchResults | null; geoapifyUsed:boolean; mappedStatus:'available'|'disabled'|'error'; partial:boolean; notices:string[]; locationAttributions:GeoAttribution[];
};
const reason = (error: unknown) => error instanceof Error && !['AbortError','TimeoutError'].includes(error.name) ? error.message : 'The request took too long. Please try again.';
export function directorySearch(request: SupportRequest, state: SupportState, center: SearchCenter, page: number, signal: AbortSignal) {
  const timeout=AbortSignal.any([signal,AbortSignal.timeout(12000)]);
  if(center.selection&&state.mode==='real')return request<SearchResults>('resources/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:center.selection,category:state.category,radius_miles:state.radius,page,page_size:20,q:state.keyword.trim(),data_kind:'real'}),signal:timeout});
  const params = new URLSearchParams({ lat:String(center.latitude),lng:String(center.longitude),category:state.category,radius_miles:String(state.radius),page:String(page),page_size:'20',q:state.keyword.trim(),data_kind:state.mode==='demo'?'fictional_demo':'real' });
  return request<SearchResults>('resources?'+params,{signal:timeout});
}
/** A selected location is transient. Each source can succeed independently at the same center. */
export async function searchSupport(request: SupportRequest, state: SupportState, geoapifyEnabled: boolean, signal: AbortSignal, locationId?: string, selected?:SelectedLocation): Promise<SupportSearch> {
  if(selected&&state.mode==='real'&&['state','area'].includes(locationSearchScope(selected)))return{status:'error',canTryDirectory:false,notices:['Choose a city, ZIP code or specific location for a radius search. State and geographic-area searches are not measured from their center.']};
  const notices:string[]=[];
  let center:SearchCenter|null=selected&&state.mode==='real'?{...selected,selection:selected}:null,geoapify:DiscoveredPlace[]=[],geoapifyUsed=false,locationAttributions:GeoAttribution[]=[];
  let directory:SearchResults|null=null,failure:Failure|undefined;
  // Start the bounded directory query immediately when location identity is already resolved.
  const directoryPending=center?directorySearch(request,state,center,1,signal).then(value=>({value,error:null})).catch(error=>({value:null,error})):null;
  geoapifyEnabled = geoapifyEnabled && state.category !== 'community';
  if(state.mode==='real'&&geoapifyEnabled) {
    try {
      const init:RequestInit={signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])};
      let path:string;
      if(selected){path='geoapify/places';init.method='POST';init.headers={'Content-Type':'application/json'};init.body=JSON.stringify({location:selected,term:state.term,radius_miles:state.radius});}
      else {const params=new URLSearchParams({q:state.location,term:state.term,radius_miles:String(state.radius)});if(locationId)params.set('location_id',locationId);path='geoapify/places?'+params;}
      const found=await request<DiscoverySearch>(path,init);
      if(signal.aborted)throw signal.reason;
      if(found.status==='choose_location')return found;
      if(!center)center=found.location;
      geoapify=found.items;geoapifyUsed=true;locationAttributions=found.location.attributions;

    }catch(error){if(signal.aborted)throw error;notices.push('Mapped places unavailable: '+reason(error));}
  }
  if(!center) {
    try {center=(await request<{place:Place}>('places/resolve?q='+encodeURIComponent(state.location),{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])})).place;}
    catch(error){if(signal.aborted)throw error;notices.push('Location search: '+reason(error));return{status:'error',failure:searchFailure(error),notices,canTryDirectory:state.mode==='real'&&geoapifyEnabled};}
  }
  if(directoryPending){const outcome=await directoryPending;directory=outcome.value;if(outcome.error){if(signal.aborted)throw outcome.error;failure=searchFailure(outcome.error);notices.push('Our Ground directory: '+reason(outcome.error));}}
  else {try{directory=await directorySearch(request,state,center,1,signal);}catch(error){if(signal.aborted)throw error;failure=searchFailure(error);notices.push('Our Ground directory: '+reason(error));}}
  if(!geoapifyUsed&&!directory)return{status:'error',notices,failure,canTryDirectory:false};
  return{status:'results',failure,center,geoapify,directory,geoapifyUsed,mappedStatus:geoapifyUsed?'available':geoapifyEnabled&&state.mode==='real'?'error':'disabled',partial:state.mode==='real'&&((geoapifyEnabled&&!geoapifyUsed)||directory===null),notices,locationAttributions};
}
