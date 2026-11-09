import {usStates} from '../shared/us-location.ts';
import {isResourceState} from '../shared/resource-geography.ts';
import type {USResourceStateCode} from '../shared/resource-geography.ts';
import type {LocationQuality} from '../shared/location-search.ts';
export const normalizedName=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const compact=(value:string)=>normalizedName(value).replaceAll(' ','');
const territoryNames:Record<string,string>={PR:'Puerto Rico',VI:'United States Virgin Islands',GU:'Guam',AS:'American Samoa',MP:'Northern Mariana Islands'};
const stateNames={...usStates,...territoryNames};
export function editDistance(a:string,b:string){
 a=compact(a).slice(0,80);b=compact(b).slice(0,80);let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+Number(a[i-1]!==b[j-1]));prev=next;}return prev[b.length];
}
export function namesClose(a:string,b:string){
 const x=compact(a),y=compact(b),length=Math.max(x.length,y.length);if(!x||!y||length>80)return false;
 // A single adjacent-letter transposition is a normal spelling error; retain
 // the source's original edit-distance metadata rather than invent a score.
 if(x.length===y.length&&x.length>=4){const changed=Array.from(x).flatMap((c,i)=>c===y[i]?[]:[i]);if(changed.length===2&&changed[1]===changed[0]+1&&x[changed[0]]===y[changed[1]]&&x[changed[1]]===y[changed[0]])return true;}
 const distance=editDistance(x,y);return distance<=(length<8?1:length<17?2:3)&&1-distance/length>=.8;
}
export type LocationQueryContext={query:string;name:string;state?:USResourceStateCode;postcode?:string;zip4:boolean;address:boolean;house?:string;referenceQuery?:string};
export function locationQueryContext(query:string):LocationQueryContext{
 const clean=query.trim(),postal=/(?:^|[\s,])(\d{5})(-\d{4})?$/.exec(clean),onlyPostal=/^\d{5}(?:-\d{4})?$/.test(clean);
 const house=/^\s*(\d+[\p{L}]?(?:[-/]\d+[\p{L}]?)?)\s+(?=\p{L})/u.exec(clean)?.[1];
 const address=Boolean(house)||/\b(?:street|road|avenue|boulevard|highway|parkway|lane|drive)\b/i.test(clean)||/\S+\s+(?:st|rd|ave|blvd|ln|dr|hwy)\.?\s*(?:[ns][ew]?)?$/i.test(clean);
 let rest=clean.replace(/(?:[\s,]+)\d{5}(?:-\d{4})?$/,'').trim(),state:USResourceStateCode|undefined;
 const trailing=/(?:,|\s)\s*([A-Za-z]{2})$/.exec(rest),code=trailing?.[1].toUpperCase();
 // NE can be a street direction. A trailing direction after a street suffix is
 // not independent evidence that an incomplete address is in Nebraska.
 const direction=Boolean(address&&code==='NE'&&/\b(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|boulevard)\.?\s+NE$/i.test(rest));
 if(code&&isResourceState(code)&&!direction){state=code;rest=rest.slice(0,trailing!.index).replace(/[,\s]+$/,'').trim();}
 if(!state)for(const [key,name]of Object.entries(stateNames).sort((a,b)=>b[1].length-a[1].length)){const suffix=normalizedName(name),value=normalizedName(rest);if(value!==suffix&&value.endsWith(' '+suffix)){state=key as USResourceStateCode;rest=rest.slice(0,rest.length-name.length).replace(/[,\s]+$/,'').trim();break;}}
 const pieces=rest.split(',').map(s=>s.trim()).filter(Boolean),name=address?(pieces.length>1?pieces.at(-1)!:''):rest;
 return{query:clean,name,state,postcode:postal?.[1],zip4:Boolean(postal?.[2]),address,house,referenceQuery:!onlyPostal&&name&&!/\d/.test(name)&&name.length<=80?name:undefined};
}
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const text=(x:unknown)=>typeof x==='string'?x.trim():'';
export function providerQuality(context:LocationQueryContext,raw:Record<string,unknown>):{quality:LocationQuality;strong:boolean;relevant:boolean;allowed:boolean}{
 const rank=record(raw.rank),malformedRank=raw.rank!==undefined&&(!raw.rank||typeof raw.rank!=='object'||Array.isArray(raw.rank))||['confidence','confidence_city_level','confidence_street_level','confidence_building_level'].some(key=>rank[key]!==undefined&&(typeof rank[key]!=='number'||!Number.isFinite(rank[key])||Number(rank[key])<0||Number(rank[key])>1)),confidence=(key:string)=>typeof rank[key]==='number'&&Number.isFinite(rank[key])&&Number(rank[key])>=0&&Number(rank[key])<=1?Number(rank[key]):undefined;
 const evidence:NonNullable<LocationQuality['provider']>={};
 for(const [input,output]of [['confidence','confidence'],['confidence_city_level','confidenceCityLevel'],['confidence_street_level','confidenceStreetLevel'],['confidence_building_level','confidenceBuildingLevel']] as const){const n=confidence(input);if(n!==undefined)evidence[output]=n;}
 if(typeof rank.match_type==='string')evidence.matchType=rank.match_type.slice(0,80);if(typeof raw.result_type==='string')evidence.resultType=raw.result_type.slice(0,40);
 const type=text(raw.result_type),city=text(raw.city)||text(raw.town)||text(raw.village)||text(raw.municipality),name=text(raw.name)||city||text(raw.state),queryName=context.referenceQuery??context.name;
 const exactName=Boolean(queryName&&[name,city,text(raw.state),text(raw.address_line1)].some(n=>normalizedName(n)===normalizedName(queryName)));
 const similar=Boolean(queryName&&[name,city,text(raw.state)].some(n=>namesClose(n,queryName))),short=!context.address&&compact(context.query).length<4;
 const suppliedHouse=text(raw.housenumber)||/^\s*(\d+[\p{L}]?(?:[-/]\d+[\p{L}]?)?)\s+/u.exec(text(raw.address_line1))?.[1];
 const wrongHouse=Boolean(context.house&&suppliedHouse&&normalizedName(context.house)!==normalizedName(suppliedHouse));
 const precision:LocationQuality['precision']=type==='building'?'building':type==='street'?'street':['city','suburb','district','county'].includes(type)?'city':type==='state'?'state':type==='postcode'?'postcode':type==='amenity'?'point':'unknown';
 const low=evidence.confidence!==undefined&&evidence.confidence<.2;
 let kind:LocationQuality['kind']='uncertain',strong=false,explanation='Possible provider match. Check the displayed location before choosing; address accuracy is not independently verified.';
 if(context.address){
  if(['city','suburb','district','county','state','postcode'].includes(type)){kind='city_fallback';explanation='The entered street address was not confirmed. Search this displayed area instead; this is not a street or building location.';}
  else if(!wrongHouse&&context.house&&suppliedHouse&&(evidence.confidence??0)>=.95&&(evidence.confidenceBuildingLevel??0)>=.95&&(evidence.confidenceStreetLevel??0)>=.9&&['full_match','match_by_building'].includes(evidence.matchType??'')&&type==='building'){
   kind='exact';strong=true;explanation='Provider reports a matching building point and house number. Confirm the address and arrival details before travel; this is not an independent address survey.';
  }else explanation=context.house?'The requested building number or exact address is not confirmed. This provider point may represent only a street or approximate area.':'Partial street match. Confirm the displayed street and city; this point does not establish an individual delivery address.';
 }else if(context.postcode){
  if(!context.zip4&&type==='postcode'){kind='exact';strong=true;explanation='Postal-area representative point, not an individual delivery address.';}else explanation=context.zip4?'Postal area only. The ZIP+4 delivery extension is not confirmed.':'Provider area within the requested postal code; not an individual delivery address.';
 }else if(exactName&&['city','state','suburb','district','county'].includes(type)){
  kind='exact';strong=true;explanation=precision==='state'?'State representative location; nearby search uses this point, not every record statewide.':'Named area match. Coordinates represent the area, not a rooftop or a verified street address.';
 }else if(similar&&['city','state'].includes(type)&&(evidence.confidence??0)>=.95&&['full_match','match_by_city_or_disrict','match_by_country_or_state'].includes(evidence.matchType??'')){
  kind='exact';strong=true;explanation='Provider-supported geographic name match. Confirm the city and state; coordinates represent the area.';
 }else if(exactName&&type==='amenity'&&(evidence.confidence??0)>=.95){kind='exact';strong=true;explanation='Provider-supplied place point. It does not independently verify an address, operating status or service availability.';}
 const queryWords=normalizedName(queryName).split(' ').filter(Boolean),providerName=normalizedName(name),prefix=Boolean(queryWords.length&&queryWords.every(w=>providerName.includes(w)));
 return{quality:{kind,precision,source:'geoapify',sourceName:'Geoapify',explanation,provider:evidence},strong:strong&&!low&&!wrongHouse&&!malformedRank,relevant:context.address||Boolean(context.postcode)||short||exactName||similar||prefix,allowed:!wrongHouse&&!low&&!malformedRank};
}
export function explicitProviderCity(context:LocationQueryContext,raw:Record<string,unknown>):string|undefined{
 const city=text(raw.city)||text(raw.town)||text(raw.village)||text(raw.municipality);if(!city)return;
 if(context.name&&normalizedName(context.name)===normalizedName(city))return city;
 let suffix=context.query.replace(/(?:[\s,]+)\d{5}(?:-\d{4})?$/,'').replace(/[,\s]+[A-Za-z]{2}$/,'');
 if(normalizedName(suffix).endsWith(' '+normalizedName(city)))return city;
}
