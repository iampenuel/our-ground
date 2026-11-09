import type {LocationQuality} from '../shared/location-search.ts';
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const fields=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const string=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function validLocationQuality(v:unknown):v is LocationQuality{
 if(!object(v)||!fields(v,['kind','precision','source','coordinateSource','sourceName','explanation','reference','provider','local']))return false;
 if(!['exact','uncertain','city_fallback','canonical_correction','canonical_exact'].includes(String(v.kind))||!['building','street','city','state','postcode','point','unknown'].includes(String(v.precision))||!['geoapify','reference'].includes(String(v.source))||!string(v.sourceName,120)||!string(v.explanation,600))return false;
 if(v.coordinateSource!==undefined&&!['geoapify','reference'].includes(String(v.coordinateSource)))return false;
 if(v.reference!==undefined){
  const r=v.reference;if(!object(r)||!fields(r,['sourceId','sourceUrl','vintage','geographicId','coordinatePrecision'])||!string(r.sourceId,100)||!string(r.sourceUrl,500)||!string(r.vintage,20)||!string(r.geographicId,100)||r.coordinatePrecision!=='representative')return false;
  try{const u=new URL(r.sourceUrl as string);if(u.protocol!=='https:'||!['www.census.gov','www2.census.gov','www.usgs.gov'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash)return false;}catch{return false;}
 }
 if(v.provider!==undefined){const p=v.provider;if(!object(p)||!fields(p,['confidence','confidenceCityLevel','confidenceStreetLevel','confidenceBuildingLevel','matchType','resultType']))return false;for(const key of ['confidence','confidenceCityLevel','confidenceStreetLevel','confidenceBuildingLevel'])if(p[key]!==undefined&&(typeof p[key]!=='number'||!Number.isFinite(p[key])||Number(p[key])<0||Number(p[key])>1))return false;for(const key of ['matchType','resultType'])if(p[key]!==undefined&&!string(p[key],80))return false;}
 if(v.local!==undefined){const l=v.local;if(!object(l)||!fields(l,['method','similarity','editDistance'])||!['exact','normalized','fuzzy'].includes(String(l.method))||typeof l.similarity!=='number'||!Number.isFinite(l.similarity)||l.similarity<0||l.similarity>1||!Number.isSafeInteger(l.editDistance)||Number(l.editDistance)<0||Number(l.editDistance)>80)return false;}
 if(v.source==='reference'&&(!v.reference||(v.provider&&v.coordinateSource!=='geoapify')||!['city','state','postcode'].includes(String(v.precision))||!['canonical_correction','canonical_exact','city_fallback'].includes(String(v.kind))))return false;
 if(v.source==='geoapify'&&(v.reference||v.local||['canonical_correction','canonical_exact'].includes(String(v.kind))))return false;
 return true;
}
