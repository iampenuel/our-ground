import {boundedJsonObject} from './request-safety.ts';
import {LocationSearchError} from './location-search.ts';
import type {LocationSearchProvider} from './location-search.ts';
import {PublicProtectionError} from './anonymous-protection.ts';
import type {PublicProtection} from './anonymous-protection.ts';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function handleLocationSearch(request:Request,path:string,provider:LocationSearchProvider,protection?:PublicProtection){
 if(request.method==='GET'&&path==='/locations/status')return json(provider.status());
 if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Use the location search controls.'}},405);
 const input=await boundedJsonObject(request);const fields=path==='/locations/suggest'?['q','sessionToken']:path==='/locations/resolve'?['q','sessionToken','choices','selectedId']:path==='/locations/retrieve'?['id','sessionToken','receipt']:path==='/locations/reverse'?['latitude','longitude','source']:[];
 if(!fields.length)return json({error:{code:'NOT_FOUND',message:'Location endpoint not found.'}},404);
 if(Object.keys(input).some(k=>!fields.includes(k)))throw new LocationSearchError(422,'INVALID_LOCATION_QUERY','Unexpected location field.');
 const origin=new URL(request.url).origin;
 const admitProvider=()=>protection?.admit('location',request)??Promise.resolve();
 if(path==='/locations/resolve'){
  if(typeof input.q!=='string'||typeof input.sessionToken!=='string')throw new LocationSearchError(422,'INVALID_LOCATION_QUERY','Enter a location query.');
  if(input.choices!==undefined&&(!Array.isArray(input.choices)||input.choices.length<1||input.choices.length>5||input.choices.some(choice=>!choice||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).some(key=>!['id','receipt'].includes(key))||typeof choice.id!=='string'||typeof choice.receipt!=='string')))throw new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose current location options or submit your text again.');
  if(input.selectedId!==undefined&&(typeof input.selectedId!=='string'||input.choices===undefined))throw new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose a current location option.');
  try{await protection?.admit('location_submit',request);}catch(error){if(error instanceof PublicProtectionError&&error.status===429)throw new PublicProtectionError(429,'LOCATION_SUBMISSION_LIMIT','Too many manual location searches. Please wait before trying again.',error.retryAfter);throw error;}
  return json(await provider.resolve(input.q,input.sessionToken,input.choices as Array<{id:string;receipt:string}>|undefined,request.signal,origin,request.headers.get('x-vercel-forwarded-for')??undefined,admitProvider,input.selectedId as string|undefined));
 }
 if(path==='/locations/suggest'){
  if(typeof input.q!=='string'||typeof input.sessionToken!=='string')throw new LocationSearchError(422,'INVALID_LOCATION_QUERY','Enter a location query.');
  await protection?.admit('location_reference',request);return json(await provider.suggest(input.q,input.sessionToken,request.signal,origin,request.headers.get('x-vercel-forwarded-for')??undefined,admitProvider));
 }
 if(path==='/locations/retrieve'){
  if(typeof input.id!=='string'||typeof input.sessionToken!=='string'||typeof input.receipt!=='string')throw new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose a current suggestion.');
  await protection?.admit(input.id.startsWith('census:')?'location_reference':'read',request);return json(await provider.retrieve(input.id,input.sessionToken,input.receipt,request.signal,origin,request.headers.get('x-vercel-forwarded-for')??undefined,admitProvider));
 }
 if(typeof input.latitude!=='number'||typeof input.longitude!=='number'||!['device','map'].includes(String(input.source)))throw new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose a valid location.');
 if(provider.status().configured)await protection?.admit('location_reference',request);else await protection?.admit('read',request);
 return json(await provider.reverse(input.latitude,input.longitude,input.source as 'device'|'map',request.signal,origin,request.headers.get('x-vercel-forwarded-for')??undefined,admitProvider));
}
