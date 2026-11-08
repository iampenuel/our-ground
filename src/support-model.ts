import { geoapifyTerms as discoveryTerms } from '../shared/geoapify.ts';
import type { GeoCategory as DiscoveryCategory, GeoTerm as DiscoveryTerm, GeoPlace as DiscoveredPlace } from '../shared/geoapify.ts';
import type { ResourceCard } from '../shared/contracts.ts';

export type SupportMode = 'real' | 'demo';
export type SupportState = { resource?: string; invalidResource?: boolean; location: string; temporaryLocation?: boolean; publicLocation?: string; category: DiscoveryCategory | 'community'; term: DiscoveryTerm | 'community_support'; radius: number; mode: SupportMode; keyword: string; intent?: 'give'; view: 'list' | 'map' };
export type SupportResult = { key: string; kind: 'directory'; record: ResourceCard } | { key: string; kind: 'geoapify'; record: DiscoveredPlace };
export const defaultTerm = (category: SupportState['category']): SupportState['term'] => category === 'community' ? 'community_support' : category === 'healthcare' ? 'medical_clinic' : 'food_assistance';
export function readSupportState(params: URLSearchParams, _mobile = false): SupportState {
  const old = params.get('term') ?? '';
  const candidate = ['food_pantry','food_bank'].includes(old) ? 'food_assistance' : ['free_clinic','community_health'].includes(old) ? 'medical_clinic' : old;
  const term = Object.hasOwn(discoveryTerms, candidate) ? candidate as DiscoveryTerm : null;
  const category = params.get('category') === 'community' ? 'community' : params.get('category') === 'healthcare' ? 'healthcare' : params.get('category') === 'food' ? 'food' : term ? discoveryTerms[term].category : 'food';
  const radius = Number(params.get('radius_miles') ?? 10);
  const rawResource=params.get('resource');
  return { resource:validResourceId(rawResource)??undefined,invalidResource:Boolean(rawResource&&!validResourceId(rawResource))||params.get('resource_error')==='invalid', location: (params.get('location') ?? '').trim().slice(0,80), category, term: term && discoveryTerms[term].category === category ? term : defaultTerm(category), radius: [5,10,25,50].includes(radius) ? radius : 25,
    intent: params.get('intent') === 'give' ? 'give' : undefined,
    mode: params.get('mode') === 'demo' ? 'demo' : 'real', keyword: (params.get('q') ?? '').slice(0,100), view: params.get('view') === 'list' ? 'list' : 'map' };
}
export function supportUrl(state: SupportState): string {
  const params = new URLSearchParams({ location: state.temporaryLocation ? state.publicLocation??'' : state.location, category: state.category, term: state.term, radius_miles: String(state.radius), view: state.view });
  if (state.resource && validResourceId(state.resource)) params.set('resource',state.resource);
  if (state.invalidResource) params.set('resource_error','invalid');
  if (state.intent === 'give') params.set('intent','give');
  if (state.mode === 'demo') params.set('mode','demo');
  if (state.keyword.trim()) params.set('q',state.keyword.trim());
  return '/support?' + params;
}
/** Legacy discovery q was a location; directory q remains a local results filter. */
export function discoverCompatibilityUrl(search: string): string {
  const old = new URLSearchParams(search);
  const params = new URLSearchParams(old);
  params.set('location', old.get('location') ?? old.get('q') ?? '');
  params.delete('q');
  return supportUrl(readSupportState(params));
}
export function combineSupportResults(directory: ResourceCard[], discovered: DiscoveredPlace[], mode: SupportMode): SupportResult[] {
  const records: SupportResult[] = directory.filter(r => mode==='demo' ? r.data_kind==='fictional_demo' : r.data_kind!=='fictional_demo').map(record => ({ key: 'directory:'+record.id, kind: 'directory', record }));
  if (mode === 'real') records.push(...discovered.map(record => ({key:'geoapify:'+record.place_id,kind:'geoapify' as const,record})));
  // Identity is source + identifier, never a similar name. Keep both sources visible.
  const food=records.some(item=>item.kind==='directory'?item.record.category_slugs.includes('food'):item.record.category==='food');
  return [...new Map(records.map(r => [r.key,r])).values()].sort((a,b) => {
    // Food directory records lead; keep each layer ordered by distance. Healthcare is unchanged.
    if(food && a.kind!==b.kind)return a.kind==='directory'?-1:1;
    return (a.record.distance_miles ?? Infinity)-(b.record.distance_miles ?? Infinity) || a.key.localeCompare(b.key);
  });
}
export function filterSupportResults(items: SupportResult[], keyword: string) {
  const text = keyword.trim().toLocaleLowerCase();
  return items.filter(item => !text || (item.kind === 'geoapify' ? item.record.name+' '+item.record.address : item.record.title+' '+item.record.organization.name+' '+item.record.summary+' '+item.record.location.address_label).toLocaleLowerCase().includes(text));
}
export function supportMapPoints(items: SupportResult[]) {
  return items.filter(item => item.kind === 'geoapify' || item.record.data_kind !== 'fictional_demo').map(item => ({ place_id:item.key,
    name: (item.kind === 'geoapify' ? item.record.name+' · Geoapify mapped location' : item.record.title+(item.record.data_kind==='imported_unverified'?' · Imported source record':' · Our Ground sourced record')),
    latitude: item.kind === 'geoapify' ? item.record.latitude : item.record.location.latitude,
    longitude: item.kind === 'geoapify' ? item.record.longitude : item.record.location.longitude }));
}

/** Canceled/obsolete requests cannot commit, even if a transport ignores abort. */
export function latestRequest() {
  let active: AbortController | null = null;
  return {
    start() { active?.abort(); const controller = new AbortController(); active = controller; return { signal:controller.signal, current:()=>active===controller && !controller.signal.aborted }; },
    cancel() { active?.abort(); active=null; }
  };
}

/** Public identities are UUIDs; never reinterpret provider identities as directory IDs. */
export function validResourceId(value:string|null|undefined):string|null {
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():null;
}
export function resourceSupportUrl(returnUrl:string,id:string):string {
  const base=new URL(returnUrl,'https://ourground.invalid');
  const state=readSupportState(base.pathname==='/support'?base.searchParams:new URLSearchParams());
  return supportUrl({...state,resource:validResourceId(id)??undefined,invalidResource:!validResourceId(id)});
}
/** Replace the old route once, preserving only allowlisted discovery state and giving intent. */
export function legacyResourceSupportUrl(path:string,search:string):string {
  const params=new URLSearchParams(search),rawReturn=params.get('return');
  let returnUrl='/support';
  if(rawReturn?.startsWith('/support?')||rawReturn==='/support') {
    try {const parsed=new URL(rawReturn,'https://ourground.invalid');if(parsed.origin==='https://ourground.invalid'&&parsed.pathname==='/support')returnUrl=parsed.pathname+parsed.search;}catch{/* Use an empty discovery context. */}
  }
  const id=/^\/resources\/([^/]+)\/?$/.exec(path)?.[1]??'';
  const state=readSupportState(new URL(returnUrl,'https://ourground.invalid').searchParams);
  if(params.get('intent')==='give')state.intent='give';
  return supportUrl({...state,resource:validResourceId(id)??undefined,invalidResource:!validResourceId(id)});
}
