import {validatedSelectedLocation} from './location-validation.ts';
import {boundedJsonObject,RequestInputError} from './request-safety.ts';
import {validPoint,stateCode} from '../shared/us-location.ts';
import {DiscoveryLimitError} from './geoapify-limits.ts';
import {createGeoapifyProvider,GeoError} from './geoapify-discovery.ts';
import type {GeoProvider} from './geoapify-discovery.ts';
import type {GeoTerm} from '../shared/geoapify.ts';
const disabled=createGeoapifyProvider({env:{}});
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleGeoapify(request:Request,path:string,provider:GeoProvider=disabled) {
  try {
    if(request.method==='POST'&&path==='/geoapify/places'){
      const body=await boundedJsonObject(request);if(Object.keys(body).some(k=>!['location','term','radius_miles'].includes(k)))throw new GeoError(422,'VALIDATION_ERROR','Unexpected discovery field.');
      const location=validatedSelectedLocation(body.location);
      return json(await provider.search({query:'',center:{latitude:location.latitude as number,longitude:location.longitude as number,label:location.label,state:stateCode(location.state),source:['provider','device','map'].includes(String(location.source))?location.source as 'provider'|'device'|'map':undefined},term:body.term as GeoTerm,radiusMiles:body.radius_miles as number},request.signal,request.headers.get('x-vercel-forwarded-for')??undefined));
    }
    if(request.method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Discovery is read-only.'}},405);
    if(path==='/geoapify/status')return json(provider.status());
    if(path==='/geoapify/places'){
      const p=new URL(request.url).searchParams;
      return json(await provider.search({query:(p.get('q')??'').trim(),term:(p.get('term')??'food_assistance') as GeoTerm,radiusMiles:Number(p.get('radius_miles')??10),locationId:p.get('location_id')??undefined},request.signal,request.headers.get('x-vercel-forwarded-for')??undefined));
    }
    return json({error:{code:'NOT_FOUND',message:'Discovery endpoint not found.'}},404);
  }catch(error){
    if(error instanceof RequestInputError)return json({error:{code:error.code,message:error.message}},error.status);
    if(error instanceof DiscoveryLimitError)return Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Retry-After':String(error.retryAfter)}});
    if(error&&typeof error==='object'&&'code'in error&&'status'in error&&String(error.code)==='LOCATION_SELECTION_INVALID')return json({error:{code:error.code,message:'Choose a valid search location.'}},Number(error.status));
    if(error instanceof GeoError)return json({error:{code:error.code,message:error.message}},error.status);
    return json({error:{code:'DISCOVERY_UNAVAILABLE',message:'Place discovery is temporarily unavailable.'}},503);
  }
}
