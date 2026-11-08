import {validLocationQuality} from './location-quality-validation.ts';
import {validPoint} from '../shared/us-location.ts';
import {isResourceState} from '../shared/resource-geography.ts';
import type {SelectedLocation} from '../shared/location-search.ts';
import {LocationSearchError} from './location-search.ts';
/** Coordinates guide a public query only; supplied labels confer no resource authority. */
export function validatedSelectedLocation(value:unknown):SelectedLocation{
 const fail=():never=>{throw new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose a valid search location.');};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['label','latitude','longitude','state','country','source','provider','publicQuery','attribution','receipt','quality'].includes(k))||!validPoint(v.latitude,v.longitude))return fail();
 for(const[key,max]of Object.entries({label:500,publicQuery:100,attribution:2000,receipt:8192}))if(v[key]!==undefined&&(typeof v[key]!=='string'||v[key].length>max))return fail();
 if(v.state!==undefined&&!isResourceState(v.state)||v.country!==undefined&&v.country!=='US'||v.source!==undefined&&!['provider','device','map','reference'].includes(String(v.source))||v.provider!==undefined&&v.provider!=='geoapify')return fail();
 if(v.quality!==undefined&&!validLocationQuality(v.quality))return fail();
 if(v.source==='reference'&&(!v.quality||(v.quality as {source?:unknown}).source!=='reference'||v.provider!==undefined&&(v.quality as {coordinateSource?:unknown}).coordinateSource!=='geoapify'))return fail();
 return{...v,label:typeof v.label==='string'?v.label:'Chosen search area',latitude:v.latitude as number,longitude:v.longitude as number,source:(v.source??'map') as SelectedLocation['source']} as SelectedLocation;
}
