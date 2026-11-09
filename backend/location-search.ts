import {requiresStagingAdmission,stagingReceiptSecret} from './staging-limiter.ts';
import type {GeographicReference,GeographicCandidate} from './geographic-reference.ts';
import {locationQueryContext,providerQuality,explicitProviderCity,namesClose,normalizedName} from './location-quality.ts';
import {validLocationQuality} from './location-quality-validation.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {validPoint,stateCode,supportedState,parseLocationQuery,usStates,placeText} from '../shared/us-location.ts';
import {isResourceState} from '../shared/resource-geography.ts';
import {createDiscoveryLimiter} from './geoapify-limits.ts';
import type {USResourceStateCode} from '../shared/resource-geography.ts';
import type {SelectedLocation,LocationSuggestResponse,LocationRetrieveResponse,LocationSearchStatus,LocationQuality,LocationSuggestion} from '../shared/location-search.ts';
import {productionRuntime} from '../shared/auth-security.ts';
import {locationSearchScope} from '../shared/location-search.ts';
import type {LocationResolveResponse,LocationInterpretation,LocationResolveChoice} from '../shared/location-search.ts';
export class LocationSearchError extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
export type LocationProviderAdmission=()=>Promise<void>;
export interface LocationSearchProvider{
 status():LocationSearchStatus;
 resolve(q:string,session:string,choices?:LocationResolveChoice[],signal?:AbortSignal,origin?:string,client?:string,admitProvider?:LocationProviderAdmission,selectedId?:string):Promise<LocationResolveResponse>;
 forward(query:string,signal?:AbortSignal,client?:string):Promise<LocationRetrieveResponse>;
 suggest(q:string,session:string,signal?:AbortSignal,origin?:string,client?:string,admitProvider?:LocationProviderAdmission):Promise<LocationSuggestResponse>;
 retrieve(id:string,session:string,receipt:string,signal?:AbortSignal,origin?:string,client?:string,admitProvider?:LocationProviderAdmission):Promise<LocationRetrieveResponse>;
 reverse(latitude:number,longitude:number,source:'device'|'map',signal?:AbortSignal,origin?:string,client?:string,admitProvider?:LocationProviderAdmission):Promise<LocationRetrieveResponse>;
}
const object=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const text=(x:unknown,max=500)=>typeof x==='string'?x.normalize('NFC').trim().slice(0,max):'';
const list=(x:unknown):unknown[]=>Array.isArray(x)?x:[];
const sessionPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern=/^[a-zA-Z0-9_.:=+/-]{3,2048}$/;
export function referenceLocation(candidate:GeographicCandidate,kind:'canonical_exact'|'canonical_correction'|'city_fallback'):SelectedLocation|null{
  if(!validPoint(candidate.latitude,candidate.longitude)||!isResourceState(candidate.state)||!idPattern.test(candidate.id)||!candidate.id.startsWith('census:2026:'))return null;
  const quality:LocationQuality={kind,precision:candidate.kind==='state'?'state':'city',source:'reference',coordinateSource:'reference',sourceName:'U.S. Census Bureau',explanation:kind==='city_fallback'?'The street address is not confirmed. Search this Census representative city point instead; it does not validate a building or delivery address.':kind==='canonical_correction'?'Suggested geographic name correction from the Census Gazetteer. Choose it only if this is the city or state you mean; coordinates are representative.':'Canonical Census geographic name. Coordinates represent the city or state, not a street address or rooftop.',reference:{sourceId:candidate.source.id,sourceUrl:candidate.source.url,vintage:String(candidate.source.vintage),geographicId:candidate.source.geographic_id,coordinatePrecision:'representative'},local:{method:candidate.match.method,similarity:candidate.match.local_similarity,editDistance:candidate.match.edit_distance}};
  if(!validLocationQuality(quality))return null;
  return{label:candidate.display_name+(candidate.kind==='state'?'':', '+candidate.state),latitude:candidate.latitude,longitude:candidate.longitude,state:candidate.state,country:'US',source:'reference',publicQuery:candidate.kind==='state'?candidate.state:candidate.display_name+', '+candidate.state,attribution:'U.S. Census Bureau · 2026 Gazetteer',quality};
 }

const fallbackCredit='Powered by Geoapify · © OpenStreetMap contributors';
const queryBinding=(q:string)=>q.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
type SubmissionEvidence={query:string;automatic:boolean;single:boolean};
const invalid=()=>new LocationSearchError(422,'LOCATION_SELECTION_INVALID','Choose a current suggestion from the location list.');
const unavailable=()=>new LocationSearchError(503,'LOCATION_SEARCH_UNAVAILABLE','Location suggestions are temporarily unavailable. Try again or use your current location.');
const territoryNames:Record<string,string>={PR:'Puerto Rico',VI:'United States Virgin Islands',GU:'Guam',AS:'American Samoa',MP:'Northern Mariana Islands'};
function jurisdiction(p:Record<string,unknown>):USResourceStateCode|undefined{
 const normal=supportedState(p.country_code,p.state_code,p.state,p.country);if(normal)return normal;
 const code=text(p.state_code).toUpperCase();
 if(text(p.country_code).toLowerCase()==='us'&&(!p.country||['us','usa','united states','united states of america'].includes(placeText(p.country)))&&isResourceState(code)&&territoryNames[code]&&(!p.state||placeText(p.state)===placeText(territoryNames[code])))return code;
 return undefined;
}
function explicitState(q:string){
 const parsed=parseLocationQuery(q);if(parsed?.kind==='city'&&parsed.state)return parsed.state;
 const trailing=/(?:,|\s)\s*([A-Za-z]{2})\s*(?:\d{5}(?:-\d{4})?)?$/.exec(q.trim());if(trailing&&stateCode(trailing[1]))return stateCode(trailing[1]);
 for(const[code,name]of Object.entries(usStates)){if(placeText(q).endsWith(' '+placeText(name))&&placeText(q)!==placeText(name))return code;}
 return undefined;
}
/** Provider-independent interface; only this concrete adapter understands Geoapify response fields. */
export function createLocationSearch(options:{env:Record<string,string|undefined>;fetcher?:typeof fetch;redisFetch?:typeof fetch;now?:()=>number;signingKey?:string;timeoutMs?:number;reference?:GeographicReference}):LocationSearchProvider{
 const env=options.env,fetcher=options.fetcher??fetch,now=options.now??Date.now;
 const token=env.GEOAPIFY_SERVER_API_KEY;
 const configured=env.GEOAPIFY_LOCATION_ENABLED==='true'&&env.GEOAPIFY_LOCATION_LIVE_APPROVED==='true'&&Boolean(token&&!/[\s"']/.test(token));
 const signingKey=options.signingKey??(requiresStagingAdmission(env)?stagingReceiptSecret(env):env.UPSTASH_REDIS_REST_TOKEN??(!productionRuntime(env)?randomBytes(32).toString('hex'):''));
 const limiter=createDiscoveryLimiter(env,options.redisFetch);
 // Only public city/state resolutions are cached, never addresses, GPS,
 // resident identities, requests or resource records. This is not a rate limiter.
 const publicAreaResolutions=new Map<string,{expires:number;point:SelectedLocation}>();
 const pendingCityCenters=new Map<string,Promise<SelectedLocation>>();
 const sign=(payload:string)=>createHmac('sha256',signingKey).update('ourground:geoapify-selection:v1\0'+payload).digest('base64url');
 const receipt=(id:string,session:string,location:SelectedLocation,submission?:SubmissionEvidence)=>{const data=Buffer.from(JSON.stringify({v:1,id,session,location,...(submission?{submission}:{}),expires:Math.floor(now()/1000)+120})).toString('base64url');return data+'.'+sign(data);};
 function verify(id:string,session:string,value:string,query?:string):SelectedLocation{
  if(!signingKey||!idPattern.test(id)||!sessionPattern.test(session)||value.length>8192)throw invalid();
  const match=/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(value);if(!match)throw invalid();
  const expected=Buffer.from(sign(match[1])),actual=Buffer.from(match[2]);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw invalid();
  try{const p=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));const seconds=Math.floor(now()/1000);if(p.v!==1||p.id!==id||p.session!==session||!Number.isInteger(p.expires)||p.expires<=seconds||p.expires>seconds+120||!validPoint(p.location?.latitude,p.location?.longitude))throw invalid();if(query!==undefined&&(!p.submission||p.submission.query!==queryBinding(query)||typeof p.submission.automatic!=='boolean'||typeof p.submission.single!=='boolean'))throw invalid();return p.location;}catch{throw invalid();}
 }
 async function postalLocation(query:string,signal?:AbortSignal):Promise<SelectedLocation|undefined>{
  const zip=query.trim();
  if(!/^\d{5}$/.test(zip)||!options.reference?.findPostalArea||!signingKey)return;
  let point;try{point=await options.reference.findPostalArea(zip,signal);}catch(error){if(signal?.aborted)throw error;return;}
  if(!point||!validPoint(point.latitude,point.longitude))return;
  return {...point,label:zip,publicQuery:zip,country:'US',source:'reference',attribution:'U.S. Census Bureau · 2026 Gazetteer',
   quality:{kind:'canonical_exact',precision:'postcode',source:'reference',coordinateSource:'reference',sourceName:'U.S. Census Bureau',
    explanation:'Representative point for this ZIP Code Tabulation Area. It does not confirm a delivery address.',
    reference:{sourceId:'census-zcta-2026',sourceUrl:'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html',vintage:'2026',geographicId:zip,coordinatePrecision:'representative'}}};
 }
 function canAutomaticallyUse(location:SelectedLocation,context:ReturnType<typeof locationQueryContext>) {
  const q=location.quality;if(!q||!validLocationQuality(q)||!['point','city'].includes(locationSearchScope(location)))return false;
  if(q.source==='reference' && q.precision==='postcode')return !context.address&&!context.zip4&&context.postcode===location.publicQuery;
  if(q.source==='reference')return !context.address&&!context.postcode&&['canonical_exact','canonical_correction'].includes(q.kind);
  if(q.kind!=='exact'||(q.provider?.confidence??0)<.8)return false;
  if(context.address)return q.precision==='building';
  if(context.postcode)return q.precision==='postcode'&&!context.zip4;
  return ['city','point'].includes(q.precision);
 }
 /** Each receipt binds the complete server decision, so submitting a subset of
  * ambiguous suggestions cannot turn it into an automatic interpretation. */
 function submissionSuggestions(suggestions:LocationSuggestion[],query:string,session:string,hiddenAmbiguity=false):LocationSuggestion[] {
  const context=locationQueryContext(query),points=suggestions.map(s=>verify(s.id,session,s.receipt));
  const single=suggestions.length===1&&!hiddenAmbiguity;
  const safe=points.map((point,index)=>canAutomaticallyUse(point,context)?index:-1).filter(index=>index>=0);
  const uniqueBuilding=context.address&&safe.length===1&&points[safe[0]].quality?.precision==='building'&&points.every((point,index)=>index===safe[0]||point.quality?.kind==='city_fallback');
  return suggestions.map((suggestion,index)=>({...suggestion,receipt:receipt(suggestion.id,session,points[index],{query:queryBinding(query),single,automatic:!hiddenAmbiguity&&safe.length===1&&index===safe[0]&&(single||uniqueBuilding)})}));
 }
 function submissionClaim(value:string):SubmissionEvidence{return JSON.parse(Buffer.from(value.split('.')[0],'base64url').toString('utf8')).submission;}
 function suggestionFromChoice(choice:LocationResolveChoice,session:string,query:string):LocationSuggestion {
  const location=verify(choice.id,session,choice.receipt,query);
  return{id:choice.id,receipt:choice.receipt,primary:location.label,secondary:[location.state,location.quality?.sourceName].filter(Boolean).join(' · '),quality:location.quality};
 }
 async function request(path:string,params:URLSearchParams,signal?:AbortSignal,client?:string,admitProvider?:LocationProviderAdmission){
  if(!configured||!signingKey)throw unavailable();signal?.throwIfAborted();await admitProvider?.();signal?.throwIfAborted();params.set('apiKey',token!);
  const timeout=AbortSignal.timeout(options.timeoutMs??8000);
  try{
   const retryCount=Number(env.GEOAPIFY_LOCATION_MAX_RETRIES??0);if(!Number.isInteger(retryCount)||retryCount<0||retryCount>1)throw unavailable();
   let r:Response|undefined;
   for(let attempt=0;attempt<=retryCount;attempt++){
   await limiter.provider(client,signal);
   try{r=await fetcher('https://api.geoapify.com/'+path+'?'+params,{redirect:'error',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),timeout])});}catch(error){if(attempt<retryCount&&!timeout.aborted&&!signal?.aborted){await delay(500,undefined,{signal:signal??timeout});continue;}throw error;}
   if(r.status>=500&&attempt<retryCount){void r.body?.cancel().catch(()=>{});await delay(500,undefined,{signal:signal??timeout});continue;}
   break;
   }
   if(!r)throw unavailable();
   if(r.status===429)throw new LocationSearchError(429,'LOCATION_PROVIDER_LIMIT','Geoapify’s shared allowance or request limit has been reached. Wait before trying again.');
   if(!r.ok)throw unavailable();
   const reader=r.body?.getReader();if(!reader)throw unavailable();let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144){void reader.cancel().catch(()=>{});throw unavailable();}chunks.push(part.value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch(e){if(e instanceof LocationSearchError||(e as {code?:string})?.code==='SHARED_DISCOVERY_LIMIT'||(e as {code?:string})?.code==='DISCOVERY_PROTECTION_UNAVAILABLE')throw e;if(signal?.aborted)throw signal.reason;if(timeout.aborted)throw new LocationSearchError(504,'LOCATION_SEARCH_TIMEOUT','Location search took too long. Try again.');throw unavailable();}
 }
 function selected(raw:unknown):SelectedLocation|null{
  const p=object(raw),state=jurisdiction(p);if(!state||!validPoint(p.lat,p.lon))return null;
  const label=text(p.formatted)||[text(p.address_line1)||text(p.name),text(p.city),state,text(p.postcode)].filter(Boolean).join(', ');if(!label)return null;
  const neighborhood=p.result_type==='suburb'?(text(p.suburb)||text(p.neighbourhood)||text(p.quarter)||text(p.name)):'';
  const locality=neighborhood||text(p.city)||text(p.town)||text(p.village)||text(p.municipality);return{label,latitude:p.lat as number,longitude:p.lon as number,state,country:'US',source:'provider',provider:'geoapify',publicQuery:locality?locality+', '+state:state,attribution:fallbackCredit};
 }
 async function forwardExact(query:string,signal?:AbortSignal,client?:string,admitProvider?:LocationProviderAdmission):Promise<LocationRetrieveResponse>{
   // Only an exact two-letter code restores a state-only coarse URL; city names
   // such as New York still require their existing unambiguous city evidence.
   const region=query.trim().toUpperCase(),requestedState=/^[A-Z]{2}$/.test(region)&&isResourceState(region)?region:undefined;
   const parsed=requestedState?undefined:parseLocationQuery(query);if(!requestedState&&!parsed)throw invalid();
   const params=new URLSearchParams({filter:'countrycode:us',limit:'5',lang:'en',format:'json',type:requestedState?'state':parsed?.kind==='postcode'?'postcode':'city'});
   // Geoapify may return no state for free-text abbreviations such as CA.
   // Use its documented structured state/country contract for coarse state URLs.
   if(requestedState){params.set('state',(usStates as Record<string,string>)[requestedState]??territoryNames[requestedState]);params.set('country','United States');}else params.set('text',query);
   const data=await request('v1/geocode/search',params,signal,client,admitProvider);
   if(!Array.isArray(data.results))throw unavailable();
   const matches=list(data.results).filter(raw=>{const p=object(raw),point=selected(raw);if(!point)return false;const assessed=providerQuality(locationQueryContext(query),p);if(!assessed.allowed||(assessed.quality.provider?.confidence??1)<.8||(assessed.quality.provider?.confidenceCityLevel??1)<.8)return false;if(requestedState)return p.result_type==='state'&&point.state===requestedState;if(!parsed)return false;if(parsed.kind==='postcode')return p.postcode===parsed.zip&&p.result_type==='postcode';return p.result_type==='city'&&placeText(p.city??p.name)===placeText(parsed.city)&&(!parsed.state||point.state===parsed.state)&&(!parsed.county||placeText(p.county)===placeText(parsed.county));}).map(raw=>{const point=selected(raw)!;point.quality=providerQuality(locationQueryContext(query),object(raw)).quality;return point;});
   if(matches.length!==1)throw new LocationSearchError(422,'LOCATION_NOT_FOUND','Choose one location from the live suggestions.');return{location:matches[0],attribution:fallbackCredit};
  }
 const api:LocationSearchProvider={
  status:()=>({configured:configured&&Boolean(signingKey),provider:'geoapify',maxSuggestions:5,...(options.reference?{referenceConfigured:Boolean(signingKey)}:{})}),
  async resolve(q,session,choices,signal,origin,client,admitProvider,selectedId){
   if(!sessionPattern.test(session)||typeof q!=='string'||q.trim().length<2||q.trim().length>256||/[\u0000-\u001f\u007f]/.test(q))throw new LocationSearchError(422,'INVALID_LOCATION_QUERY','Enter an address, ZIP code, city or landmark.');
   signal?.throwIfAborted();
   if(selectedId!==undefined&&(typeof selectedId!=='string'||!idPattern.test(selectedId)||choices===undefined))throw invalid();
   let found:LocationSuggestResponse;
   if(choices!==undefined){
    if(!Array.isArray(choices)||choices.length<1||choices.length>5||choices.some(choice=>!choice||typeof choice.id!=='string'||typeof choice.receipt!=='string'||Object.keys(choice).some(key=>!['id','receipt'].includes(key))))throw invalid();
    const unique=new Set(choices.map(choice=>choice.id));if(unique.size!==choices.length)throw invalid();
    const suggestions=choices.map(choice=>suggestionFromChoice(choice,session,q));
    found={suggestions,attribution:suggestions.some(s=>s.quality?.source==='geoapify')?fallbackCredit:'U.S. Census Bureau · 2026 Gazetteer'};
   }else found=await api.suggest(q,session,signal,origin,client,admitProvider);
   signal?.throwIfAborted();
   if(!found.suggestions.length)return{status:'not_found',choices:[],attribution:found.attribution,notice:'No credible location matched. Check the spelling, add a city/state or ZIP code, or try a nearby city.'};
   const automatic=found.suggestions.filter(s=>submissionClaim(s.receipt).automatic);
   const single=found.suggestions.length===1&&submissionClaim(found.suggestions[0].receipt).single;
   const explicit=selectedId!==undefined?found.suggestions.find(s=>s.id===selectedId):undefined;
   if(selectedId!==undefined&&!explicit)throw invalid();
   const choice=explicit??(automatic.length===1?automatic[0]:single?found.suggestions[0]:undefined);
   if(choice){
    const location=verify(choice.id,session,choice.receipt,q),scope=locationSearchScope(location);
    const interpretation:LocationInterpretation={query:q.trim(),label:location.label,corrected:normalizedName(q)!==normalizedName(location.label),scope};
    if(scope==='state'||scope==='area')return{status:'narrow_location',location,attribution:found.attribution,interpretation,notice:scope==='state'?'Choose a city or ZIP code within this state. Nearby search does not cover an entire state.':'Choose a city, ZIP code or address within this area. A county or region cannot be represented by a nearby radius.'};
    if(explicit||automatic.length===1){const selected=await api.retrieve(choice.id,session,choice.receipt,signal,origin,client,admitProvider);return{status:'resolved',location:selected.location,attribution:selected.attribution,interpretation};}
   }
   const precision=found.suggestions.every(s=>s.quality?.kind==='city_fallback'||s.quality?.kind==='uncertain');
   return{status:'choose_location',choices:found.suggestions,attribution:found.attribution,reason:precision?'precision_change':'ambiguous',notice:precision?'The exact address is not confirmed. Review the location or choose Search the city instead.':'Several locations are plausible. Choose the city and state you mean.'};
  },
  async forward(query,signal,client){
   signal?.throwIfAborted();
   const postal=await postalLocation(query,signal);
   if(postal)return{location:postal,attribution:postal.attribution!};
   const input=locationQueryContext(query);
   if(!input.address&&!input.postcode){for(const[key,entry]of publicAreaResolutions){if(entry.expires<=now()){publicAreaResolutions.delete(key);continue;}if(normalizedName(entry.point.publicQuery??'')===normalizedName(query))return{location:{...entry.point,quality:{...entry.point.quality!,explanation:entry.point.quality?.coordinateSource==='reference'?'Restored the selected Census representative city/state point. It does not confirm a street address and may be far from service clusters.':'Restored coarse city/state area from a recent exact provider resolution. No previous street address or GPS position is stored in this link.'}},attribution:entry.point.attribution??fallbackCredit};}}
   const context=input;
   if(options.reference&&!context.address&&!context.postcode&&context.referenceQuery){
    try{
     const candidates=await options.reference.findCandidates(context.referenceQuery,context.state,5,signal);
     signal?.throwIfAborted();
     const stateOnly=/^[A-Za-z]{2}$/.test(query.trim())&&isResourceState(query.trim().toUpperCase());
     const expectedKind=stateOnly?'state':context.state?'place':undefined;
     const exact=candidates.filter(x=>x.match.exact_match&&(!context.state||x.state===context.state)&&(!expectedKind||x.kind===expectedKind));
     if(exact.length===1){const point=referenceLocation(exact[0],'canonical_exact');if(point){const session=randomUUID();return api.retrieve(exact[0].id,session,receipt(exact[0].id,session,point),signal,undefined,client);}}
    }catch(error){if(signal?.aborted)throw error;}
   }
   let failed:unknown;try{
    const found=await forwardExact(query,signal,client),point=found.location;
    // A successful coarse URL restoration seeds the same bounded public-area
    // cache. Repeated Back/refresh must not call upstream for the same area.
    if(!input.address&&!input.postcode&&point.publicQuery&&['city','state'].includes(point.quality?.precision??'')&&point.state){
     const key='public:'+normalizedName(point.publicQuery);
     if(publicAreaResolutions.size>=64&&!publicAreaResolutions.has(key))publicAreaResolutions.delete(publicAreaResolutions.keys().next().value!);
     publicAreaResolutions.set(key,{expires:now()+120000,point});
    }
    return found;
   }catch(error){if(signal?.aborted)throw error;failed=error;}

   throw failed;
  },
  async suggest(q,session,signal,_origin,client,admitProvider){
   if(!sessionPattern.test(session)||typeof q!=='string'||q.trim().length<2||q.trim().length>256||/[\u0000-\u001f\u007f]/.test(q))throw new LocationSearchError(422,'INVALID_LOCATION_QUERY','Enter an address, ZIP code, city or landmark.');
   const postal=await postalLocation(q,signal);
   if(postal){
    const id='census:2026:zcta:'+postal.publicQuery,choice={id,primary:postal.label,secondary:'ZIP Code Tabulation Area · U.S. Census Bureau',quality:postal.quality,receipt:receipt(id,session,postal)};
    return {suggestions:submissionSuggestions([choice],q,session,false),attribution:postal.attribution!,providerStatus:'not_needed'};
   }
   const context=locationQueryContext(q),reference=options.reference;
   // City/state reference matches are sufficient for explicit representative-area
   // choices. Do not reserve a provider allowance or perform enrichment for them.
   let referenceFailed=false;
   const find=async(query:string,state=context.state)=>{if(!reference||!signingKey)return[];try{return await reference.findCandidates(query,state,5,signal);}catch{if(!signal?.aborted)referenceFailed=true;return[];}};
   const canonicalFor=(localCandidates:GeographicCandidate[])=>localCandidates.flatMap(candidate=>{
    if(context.state&&(candidate.state!==context.state||candidate.kind!=='place')||!validPoint(candidate.latitude,candidate.longitude)||!isResourceState(candidate.state))return[];
    const fuzzy=candidate.match.method==='fuzzy';
    if(context.address&&(!candidate.match.exact_match||candidate.kind!=='place'))return[];
    if(fuzzy&&!namesClose(context.referenceQuery??context.name,candidate.display_name))return[];
    const location=referenceLocation(candidate,context.address?'city_fallback':fuzzy?'canonical_correction':'canonical_exact');if(!location)return[];
    return[{id:candidate.id,primary:location.label,secondary:candidate.canonical_name+' · '+candidate.state+' · U.S. Census Bureau',quality:location.quality,receipt:receipt(candidate.id,session,location)}];
   });
   let local:GeographicCandidate[]|undefined;
   const localPending=context.referenceQuery?find(context.referenceQuery):Promise.resolve([]);
   if(!context.address&&!context.postcode){
    local=await localPending;signal?.throwIfAborted();
    const canonical=canonicalFor(local);
    if(canonical.length)return{suggestions:submissionSuggestions(canonical.slice(0,5),q,session,local.some(x=>x.match.ambiguous_matches>local!.length)),attribution:'U.S. Census Bureau · 2026 Gazetteer',providerStatus:'not_needed',notice:local.some(x=>x.match.ambiguous_matches>5)?'More places share this name. Add a state to narrow the choices.':'City/state reference choices. Coordinates are representative; choose the place you mean.'};
   }
   let data:Record<string,unknown>={results:[]},providerError:unknown;
   try{data=await request('v1/geocode/autocomplete',new URLSearchParams({text:q.trim(),filter:'countrycode:us',limit:'5',lang:'en',format:'json'}),signal,client,admitProvider);if(!Array.isArray(data.results))throw unavailable();}
   catch(error){if(signal?.aborted)throw error;providerError=error;}
   local??=await localPending;signal?.throwIfAborted();
   const offered:Array<{suggestion:LocationSuggestion;location:SelectedLocation;strong:boolean;relevant:boolean}>=[];
   const rawResults=list(data.results).slice(0,10),fallbackCities:Array<{name:string;state:USResourceStateCode}>=[];
   for(const raw of rawResults){
    const p=object(raw),location=selected(raw),id=text(p.place_id,2049);if(!location||!idPattern.test(id)||(context.state&&location.state!==context.state)||(context.postcode&&text(p.postcode).slice(0,5)!==context.postcode))continue;
    const assessed=providerQuality(context,p);
    if(context.address&&location.state){const city=explicitProviderCity(context,p);if(city&&!fallbackCities.some(x=>x.name===city&&x.state===location.state))fallbackCities.push({name:city,state:location.state});}
    if(!assessed.allowed||!validLocationQuality(assessed.quality))continue;
    location.quality=assessed.quality;
    const primary=text(p.address_line1)||text(p.name)||location.label,secondary=text(p.address_line2)||[text(p.city),location.state,text(p.postcode),text(p.county)].filter(Boolean).join(', ');
    offered.push({suggestion:{id,primary,secondary,quality:assessed.quality,receipt:receipt(id,session,location)},location,strong:assessed.strong,relevant:assessed.relevant});
   }
   let localCandidates=local;
   if(context.address&&reference&&!localCandidates.length&&fallbackCities.length){const first=fallbackCities[0];localCandidates=await find(first.name,first.state);}
   const canonical=canonicalFor(localCandidates);
   const strong=offered.filter(x=>x.strong),uncertain=offered.filter(x=>!x.strong&&x.relevant);
   // A local fuzzy score never displaces a strong exact provider match.
   const ranked=strong.length?[...strong.map(x=>x.suggestion),...canonical,...uncertain.map(x=>x.suggestion)]:canonical.length?[...canonical,...uncertain.map(x=>x.suggestion)]:offered.filter(x=>x.relevant||!reference).map(x=>x.suggestion);
   const suggestions=[...new Map(ranked.map(x=>[x.id,x])).values()].slice(0,5);
   if(providerError&&!suggestions.length)throw providerError;
   const providerStatus:NonNullable<LocationSuggestResponse['providerStatus']>=providerError?(!configured?'not_configured':(providerError as {status?:number;code?:string}).status===429?((providerError as {code?:string}).code==='LOCATION_PROVIDER_LIMIT'?'quota':'limited'):(providerError as {status?:number}).status===504?'timeout':'unavailable'):'available';
   const notice=providerError?(providerStatus==='limited'?'Our Ground address lookup is temporarily limited. Showing authoritative city/state reference choices where available.':'Address lookup is temporarily unavailable. Showing authoritative city/state reference choices where available.'):referenceFailed?'Geographic spelling corrections are temporarily unavailable. Check the displayed provider matches or refine your entry.':localCandidates.some(x=>x.match.ambiguous_matches>5)?'More places share this name. Add a state to narrow the choices.':undefined;
   const credit=suggestions.some(x=>x.quality?.source==='geoapify')?fallbackCredit+(canonical.length?' · U.S. Census Bureau · 2026 Gazetteer':''):canonical.length?'U.S. Census Bureau · 2026 Gazetteer':fallbackCredit;
   return{suggestions:submissionSuggestions(suggestions,q,session,ranked.length>5||localCandidates.some(x=>x.match.ambiguous_matches>localCandidates.length)),attribution:credit,providerStatus,...(notice?{notice}:{})};
  },
  async retrieve(id,session,value,signal,_origin,client,admitProvider){
   signal?.throwIfAborted();let location=verify(id,session,value);
   if(location.source==='reference'&&location.publicQuery&&location.quality&&location.quality.precision!=='postcode'){
    const key='public:'+normalizedName(location.publicQuery);
    const applyCoordinates=(point:SelectedLocation):SelectedLocation=>({...location,
     latitude:point.latitude,longitude:point.longitude,attribution:point.attribution,
     quality:{...location.quality!,coordinateSource:point.source==='provider'||point.quality?.source==='geoapify'?'geoapify':point.quality?.coordinateSource??'reference',
      ...(point.quality?.provider?{provider:point.quality.provider}:{}),explanation:point.quality?.explanation??location.quality!.explanation}});
    const cached=publicAreaResolutions.get(key);
    if(cached&&cached.expires>now())return{location:applyCoordinates(cached.point),attribution:cached.point.attribution??fallbackCredit};
    location={...location,quality:{...location.quality,coordinateSource:'reference',explanation:'Using the official Census representative city/state point. It may be far from service clusters and does not validate a street address.'}};
    if(configured&&location.quality!.precision==='city'){
     let pending=pendingCityCenters.get(key);
     if(!pending&&pendingCityCenters.size<16){
      const referencePoint=location;
      pending=(async()=>{
       try{
        const {location:point}=await forwardExact(referencePoint.publicQuery!,signal,client,admitProvider);
        const evidence=point.quality?.provider;
        if(point.country==='US'&&point.state===referencePoint.state&&evidence?.resultType==='city'&&
         (evidence.confidence??0)>=.8&&(evidence.confidenceCityLevel??0)>=.8){
         return{...referencePoint,latitude:point.latitude,longitude:point.longitude,
          attribution:fallbackCredit+' · U.S. Census Bureau · 2026 Gazetteer',
          quality:{...referencePoint.quality!,coordinateSource:'geoapify' as const,provider:evidence,
           explanation:'City identity follows the Census Gazetteer. Coordinates use a matching Geoapify city point for nearby search; they do not confirm a street address.'}};
        }
       }catch{/* A protected provider failure retains the disclosed reference point. */}
       return referencePoint;
      })().finally(()=>pendingCityCenters.delete(key));
      pendingCityCenters.set(key,pending);
     }
     if(pending){location=applyCoordinates(await pending);signal?.throwIfAborted();}
    }
    // Cache public locality evidence and a bounded provider/fallback decision.
    // GPS, addresses and resident identifiers never enter this cache.
    for(const[k,entry]of publicAreaResolutions)if(entry.expires<=now())publicAreaResolutions.delete(k);
    if(publicAreaResolutions.size>=64&&!publicAreaResolutions.has(key))publicAreaResolutions.delete(publicAreaResolutions.keys().next().value!);
    publicAreaResolutions.set(key,{expires:now()+120000,point:location});
   }
   return{location,attribution:location.attribution??fallbackCredit};
  },
  async reverse(latitude,longitude,source,signal,_origin,client,admitProvider){
   if(!validPoint(latitude,longitude)||!['device','map'].includes(source))throw invalid();
   const generic:SelectedLocation={latitude,longitude,source,label:source==='device'?'Your current location (approximate)':'Selected map location'};
   if(!configured)return{location:generic,attribution:''};
   const data=await request('v1/geocode/reverse',new URLSearchParams({lat:String(latitude),lon:String(longitude),type:'city',limit:'1',lang:'en',format:'json'}),signal,client,admitProvider);
   const value=list(data.results).map(selected).find(Boolean);return{location:value?{...generic,state:value.state,country:'US',publicQuery:value.publicQuery,label:(source==='device'?'Current location near ':'Selected map location near ')+value.publicQuery,provider:'geoapify',attribution:fallbackCredit}:generic,attribution:value?fallbackCredit:''};
  }
 };return api;
}
