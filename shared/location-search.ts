import type { USResourceStateCode } from './resource-geography.ts';
export type LocationReference = {sourceId:string;sourceUrl:string;vintage:string;geographicId:string;coordinatePrecision:'representative'};
/** Provider confidence and local name similarity describe different evidence. */
export type LocationQuality = {
 kind:'exact'|'uncertain'|'city_fallback'|'canonical_correction'|'canonical_exact';
 precision:'building'|'street'|'city'|'state'|'postcode'|'point'|'unknown';
 source:'geoapify'|'reference';coordinateSource?:'geoapify'|'reference';sourceName:string;explanation:string;
 reference?:LocationReference;
 provider?:{confidence?:number;confidenceCityLevel?:number;confidenceStreetLevel?:number;confidenceBuildingLevel?:number;matchType?:string;resultType?:string};
 local?:{method:'exact'|'normalized'|'fuzzy';similarity:number;editDistance:number};
};
/** Temporary user-selected search context. Never persist in resource records or browser storage. */
export type SelectedLocation = {
 label:string;latitude:number;longitude:number;state?:USResourceStateCode;country?:'US';
 source:'provider'|'device'|'map'|'reference';provider?:'geoapify';publicQuery?:string;attribution?:string;receipt?:string;quality?:LocationQuality;
};
export type LocationSuggestion = {id:string;primary:string;secondary:string;receipt:string;quality?:LocationQuality};
export type LocationSuggestResponse = {suggestions:LocationSuggestion[];attribution:string;providerStatus?:'available'|'unavailable'|'quota'|'timeout'|'not_configured'|'not_needed'|'limited';notice?:string};
export type LocationRetrieveResponse = {location:SelectedLocation;attribution:string};
export type LocationSearchStatus = {configured:boolean;provider:'geoapify';maxSuggestions:5;referenceConfigured?:boolean};

export type LocationResolveChoice = Pick<LocationSuggestion,'id'|'receipt'>;
export type LocationInterpretation = {query:string;label:string;corrected:boolean;scope:'point'|'city'|'state'|'area'};
export type LocationResolveResponse =
 | {status:'resolved';location:SelectedLocation;attribution:string;interpretation:LocationInterpretation}
 | {status:'narrow_location';location:SelectedLocation;attribution:string;interpretation:LocationInterpretation;notice:string}
 | {status:'choose_location';choices:LocationSuggestion[];attribution:string;notice:string;reason:'ambiguous'|'precision_change'}
 | {status:'not_found';choices:[];attribution:string;notice:string};
/** State/county/district evidence must not silently become a point-radius query. */
export function locationSearchScope(location:SelectedLocation):LocationInterpretation['scope'] {
 const quality=location.quality,type=quality?.provider?.resultType;
 if(quality?.precision==='state'||type==='state')return 'state';
 if(type==='suburb'&&quality?.kind==='exact'&&(quality.provider?.confidence??0)>=.8)return 'city';
 if(['county','district','suburb'].includes(type??''))return 'area';
 if(quality?.precision==='city')return 'city';
 if(quality?.precision==='unknown')return 'area';
 return 'point';
}
