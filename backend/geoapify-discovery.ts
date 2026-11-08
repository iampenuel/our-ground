import { createDiscoveryLimiter, DiscoveryLimitError } from './geoapify-limits.ts';
import { geoapifyFeedbackUrl, geoapifyTerms } from '../shared/geoapify.ts';
import type { GeoAttribution, GeoInput, GeoLocation, GeoPlace, GeoSearch, GeoStatus } from '../shared/geoapify.ts';
import { hasMappedCategory, sourceWebsite, sourcePhone } from '../shared/place-evidence.ts';

import { parseLocationQuery, placeText, supportedState, usLocationGuidance, validPoint } from '../shared/us-location.ts';
import type { LocationQuery } from '../shared/us-location.ts';
import { reviewedGivingFor } from './giving-links.ts';

export class GeoError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
export interface GeoProvider { status(): GeoStatus; search(input: GeoInput, signal?: AbortSignal, client?: string): Promise<GeoSearch> }
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const invalid = () => new GeoError(422, 'LOCATION_NOT_FOUND', usLocationGuidance);
const unavailable = () => new GeoError(503, 'GEOAPIFY_NOT_CONFIGURED', 'Real-place discovery is not configured. Available sourced directory records can still be searched.');
export const validGeoId = (id: string) => /^[a-zA-Z0-9_-]{5,2048}$/.test(id);
function geocodeChoice(p: Record<string, unknown>, query: LocationQuery): GeoLocation | null {
  const state = supportedState(p.country_code, p.state_code, p.state, p.country);
  const id = text(p.place_id, 2049);
  if (!state || !validGeoId(id) || !validPoint(p.lat, p.lon) || p.result_type !== query.kind) return null;
  const city = text(p.city) || text(p.name);
  const county = text(p.county);
  let locality: string;
  if (query.kind === 'postcode') {
    if (p.postcode !== query.zip) return null;
    locality = [city, query.zip].filter(Boolean).join(' ');
  } else {
    const confidence = object(p.rank).confidence;
    if (typeof confidence === 'number' && confidence < 0.8) return null;
    if (placeText(query.city) !== placeText(city) || (query.state && state !== query.state)) return null;
    if (query.county && placeText(query.county) !== placeText(county)) return null;
    locality = city;
  }
  const label = [locality, state, county].filter(Boolean).join(', ');
  return {place_id: id, label, latitude: Number(p.lat), longitude: Number(p.lon), state, attributions: attributions(p)};
}

function miles(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}) {
  const rad = (v:number) => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude-a.latitude)/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 3958.76 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
const baseAttribution: GeoAttribution[] = [
  {name:'Geoapify',url:'https://www.geoapify.com/'},
  {name:'OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright'}
];
function attributions(p: Record<string, unknown>) {
  const source = object(p.datasource), name = text(source.attribution ?? source.sourcename,200);
  // Keep source credit, but never echo arbitrary provider URLs or credentials.
  return name && !/openstreetmap|geoapify/i.test(name) ? [...baseAttribution,{name,url:null}] : baseAttribution;
}
/** Returned typed OSM identity only. Never decode a Geoapify place_id or follow
 * a provider-supplied URL to manufacture a source correction destination. */
function sourceFeedbackUrl(properties: Record<string, unknown>): string {
  const source=object(properties.datasource), raw=object(source.raw);
  const types={n:'node',w:'way',r:'relation',node:'node',way:'way',relation:'relation'} as const;
  if(text(source.sourcename,200).toLowerCase()!=='openstreetmap'||typeof raw.osm_type!=='string'||!Object.hasOwn(types,raw.osm_type))return geoapifyFeedbackUrl;
  const supplied=raw.osm_id;
  if(typeof supplied!=='number'&&typeof supplied!=='string')return geoapifyFeedbackUrl;
  if(typeof supplied==='string'&&!/^[1-9][0-9]{0,15}$/.test(supplied))return geoapifyFeedbackUrl;
  const id=Number(supplied);
  if(!Number.isSafeInteger(id)||id<=0)return geoapifyFeedbackUrl;
  return 'https://www.openstreetmap.org/'+types[raw.osm_type as keyof typeof types]+'/'+id;
}
function normalize(feature: unknown, input: GeoInput, center: GeoLocation): GeoPlace | null {
  const f=object(feature), p=object(f.properties), geometry=object(f.geometry), coords=list(geometry.coordinates);
  const state = supportedState(p.country_code, p.state_code, p.state, p.country);
  if (geometry.type !== 'Point' || !validPoint(coords[1],coords[0]) || !state) return null;
  const id=text(p.place_id,2049), name=text(p.name,200), categories=list(p.categories).filter((c):c is string=>typeof c==='string');
  const wanted=geoapifyTerms[input.term].key;
  // Generic social facilities and healthcare-only POIs are not food matches.
  // Explicit dual-category locations remain useful, labelled as mapped evidence.
  if (!validGeoId(id) || !name || !wanted.split(',').some(category=>hasMappedCategory(categories,category))) return null;
  if (categories.some(c=>/^(catering\.|commercial\.|healthcare\.(dentist|pharmacy)(\.|$))/.test(c))) return null;
  const location={latitude:Number(coords[1]),longitude:Number(coords[0])}, distance=miles(center,location);
  if (distance>input.radiusMiles) return null;
  const directions=new URL('https://www.google.com/maps/dir/');
  directions.search=new URLSearchParams({api:'1',destination:location.latitude+','+location.longitude}).toString();
  const contact=object(p.contact);
  const website = sourceWebsite(p.website) ?? sourceWebsite(contact.website);
  const giving = reviewedGivingFor({source: 'geoapify', id, state, name, street: [text(p.housenumber), text(p.street)].filter(Boolean).join(' '), city: text(p.city), postcode: text(p.postcode), website});
  return {state, ...(giving ? {reviewed_giving: giving} : {}), place_id:id,data_kind:'geoapify_discovered',name,address:text(p.formatted)||'Street address not provided',...location,category:geoapifyTerms[input.term].category,categories:categories.slice(0,30),distance_miles:Math.round(distance*10)/10,directions_url:directions.href,attributions:attributions(p),source_feedback_url:sourceFeedbackUrl(p),website_url:website,phone:sourcePhone(p.phone)??sourcePhone(contact.phone)};
}

export function createGeoapifyProvider(options: {env:Record<string,string|undefined>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number;redisFetch?:typeof fetch}): GeoProvider {
  const {env}=options, fetcher=options.fetcher??fetch, now=options.now??Date.now;
  const limiter=createDiscoveryLimiter(env,options.redisFetch);
  const enabled=env.GEOAPIFY_ENABLED==='true' && env.GEOAPIFY_LIVE_APPROVED==='true' && Boolean(env.GEOAPIFY_SERVER_API_KEY);
  // Bounded process-local cache, with attribution. Never persist discovered POIs.
  const geocodes=new Map<string,{expires:number;choices:GeoLocation[]}>();
  const searches=new Map<string,{expires:number;result:GeoSearch}>();
  let second=0,minute=0,day=0,secondCount=0,minuteCount=0,dayCount=0,active=0;
  function remember<T>(cache:Map<string,T>,key:string,value:T) { if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,value); }
  async function request(path:string, params:URLSearchParams, signal?:AbortSignal, client?:string) {
    if(!enabled)throw unavailable();
    signal?.throwIfAborted();
    const s=Math.floor(now()/1000),m=Math.floor(now()/60000),d=Math.floor(now()/86400000);
    if(s!==second){second=s;secondCount=0;} if(m!==minute){minute=m;minuteCount=0;} if(d!==day){day=d;dayCount=0;}
    if(dayCount>=200)throw new GeoError(429,'LOCAL_DAILY_LIMIT','The local discovery allowance for today is exhausted. Try again tomorrow; directory records remain available.');
    if(active>=2||secondCount>=2||minuteCount>=12)throw new GeoError(429,'LOCAL_RATE_LIMIT','Search requests are temporarily limited. Wait a moment and try again.');
    secondCount++;minuteCount++;dayCount++;active++;
    const timeout=AbortSignal.timeout(options.timeoutMs??8000);
    params.set('apiKey',env.GEOAPIFY_SERVER_API_KEY!);
    try {
      await limiter.provider(client,signal);
      const response=await fetcher('https://api.geoapify.com/'+path+'?'+params,{redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout});
      if(response.status===429)throw new GeoError(429,'PROVIDER_QUOTA','Geoapify’s free allowance or request limit has been reached. Try later; if today’s credits are exhausted, discovery resumes after the daily reset. Directory records remain available.');
      if(response.status===401||response.status===403)throw new GeoError(503,'PROVIDER_PERMISSION','Real-place discovery is unavailable. The project owner needs to check the Geoapify key restrictions.');
      if(!response.ok)throw new GeoError(503,'PROVIDER_UNAVAILABLE','Geoapify could not complete this search. Please try again later.');
      return object(await response.json());
    } catch(error) {
      if(error instanceof GeoError || error instanceof DiscoveryLimitError)throw error;
      if(timeout.aborted||signal?.aborted)throw new GeoError(504,'PROVIDER_TIMEOUT','Location discovery took too long. Please try again.');
      // Never return/log fetch errors: their URLs can contain the server credential.
      throw new GeoError(503,'PROVIDER_UNAVAILABLE','Geoapify could not complete this search. Please try again later.');
    } finally {active--;}
  }
  async function resolve(query:string, parsed:LocationQuery, signal?:AbortSignal,client?:string) {
    const key=query.toLocaleLowerCase(), saved=geocodes.get(key);
    if(saved&&saved.expires>now())return saved.choices;
    const params = new URLSearchParams({text:query,type:parsed.kind,format:'json',filter:'countrycode:us',bias:'countrycode:none',limit:'5',lang:'en'});
    const data = await request('v1/geocode/search',params,signal,client);
    if (!Array.isArray(data.results)) throw new GeoError(503,'PROVIDER_RESPONSE','Location search returned an unreadable response. Please try again.');
    const choices: GeoLocation[] = [];
    for (const raw of data.results.slice(0,5)) {
      const choice = geocodeChoice(object(raw), parsed);
      if (choice && !choices.some(existing => existing.place_id === choice.place_id)) choices.push(choice);
    }
    const labels = choices.map(choice => choice.label);
    for (const choice of choices) {
      if (labels.indexOf(choice.label) !== labels.lastIndexOf(choice.label)) {
        choice.label += ' (' + choice.latitude.toFixed(3) + ', ' + choice.longitude.toFixed(3) + ')';
      }
    }
    remember(geocodes,key,{expires:now()+10*60_000,choices});
    return choices;
  }
  return {
    status:()=>({enabled,provider:'geoapify'}),
    async search(input,signal,client) {
      if(!enabled)throw unavailable();
      const q=input.query.trim();
      const parsed = parseLocationQuery(q);
      if (!input.center&&!parsed) throw invalid();
      if(input.center&&(!validPoint(input.center.latitude,input.center.longitude)||typeof input.center.label!=='string'||input.center.label.length>500))throw invalid();
      if(!Object.hasOwn(geoapifyTerms,input.term)||![5,10,25,50].includes(input.radiusMiles)||(input.locationId&&!validGeoId(input.locationId)))throw new GeoError(422,'VALIDATION_ERROR','Choose a supported support type and distance.');
      await limiter.search(client,signal);
      const choices:GeoLocation[]=input.center?[{...input.center,place_id:'selected-search-center',attributions:input.center.source==='provider'?[{name:'Geoapify location search',url:'https://www.geoapify.com/'}]:[]}]:await resolve(q,parsed!,signal,client);
      if(!choices.length)throw invalid();
      const location=input.locationId?choices.find(c=>c.place_id===input.locationId):choices.length===1?choices[0]:undefined;
      if(!location){if(input.locationId)throw invalid();return{status:'choose_location',choices};}
      const key=[location.place_id,input.term,input.radiusMiles].join('|'),saved=searches.get(key);
      if(!input.center&&saved&&saved.expires>now())return saved.result;
      const params=new URLSearchParams({categories:geoapifyTerms[input.term].key,filter:`circle:${location.longitude},${location.latitude},${input.radiusMiles*1609.344}`,bias:`proximity:${location.longitude},${location.latitude}`,limit:'20',lang:'en'});
      const data=await request('v2/places',params,signal,client);
      if(!Array.isArray(data.features))throw new GeoError(503,'PROVIDER_RESPONSE','Place search returned an unreadable response. Please try again.');
      const items=[...new Map(data.features.slice(0,20).map(f=>normalize(f,input,location)).filter((p):p is GeoPlace=>Boolean(p)).map(p=>[p.place_id,p])).values()].sort((a,b)=>a.distance_miles-b.distance_miles);
      const result:GeoSearch={status:'results',location,items,term:input.term,radius_miles:input.radiusMiles};
      if(!input.center)remember(searches,key,{expires:now()+60_000,result});
      return result;
    }
  };
}
