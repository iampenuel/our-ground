import { EDEN_CITIES, validateEdenAction, validateEdenPageContext } from '../../shared/eden-assistant.ts';
import type { EdenAction, EdenPageContext, EdenCityId, EdenCategory, EdenRadius } from '../../shared/eden-assistant.ts';
import {edenPublicPageFacts} from '../../shared/eden-public-pages.ts';
import {edenPublicPagePolicy} from './public-page-policy.ts';
export type EdenPublicRoute='home'|'support'|'discover'|'give'|'organizations'|'about'|'privacy'|'resource';
export type EdenLocalPageContext={route:EdenPublicRoute;category?:EdenCategory;cityId?:EdenCityId;radius?:EdenRadius;resultCount:number;selectedIndex?:number;loading:'idle'|'loading'|'ready'|'error';mapState:'not-shown'|'loading'|'ready'|'unavailable';hasFilter:boolean;mapVisible:boolean;synthetic:boolean;results:Array<{index:number;id?:string;title:string;selected:boolean;kind:'directory'|'mapped'}>};
export type EdenActionResult = { status: 'done' | 'clarify' | 'unavailable'; message: string; resultCount?: number; synthetic?: boolean };
export type EdenApplicationEvent = { type: 'context' } | { type: 'search-started' | 'search-completed' | 'search-failed'; requestId: string };
export interface EdenPageAdapter {
  context(): EdenPageContext;
  presentation?():Partial<EdenLocalPageContext>;
  execute(action: EdenAction, signal: AbortSignal): Promise<EdenActionResult>;
}
let active: EdenPageAdapter | undefined;
let revision = 0;
const subscribers = new Set<(event: EdenApplicationEvent) => void>();
const SEARCH_KEY='our-ground-eden-area-v1';
type RememberedSearch={cityId:EdenCityId;category:EdenCategory;radius:EdenRadius;expiresAt:number};
let recentSearch:(RememberedSearch&{synthetic:boolean})|undefined;
function rememberedSearch():(RememberedSearch&{synthetic?:boolean})|undefined{
  if(recentSearch){if(recentSearch.expiresAt>Date.now())return recentSearch;recentSearch=undefined;}
  try{const raw=JSON.parse(sessionStorage.getItem(SEARCH_KEY)??'null');if(!raw||Object.keys(raw).sort().join(',')!=='category,cityId,expiresAt,radius'||!EDEN_CITIES.some(city=>city.id===raw.cityId)||!['food','healthcare','community'].includes(raw.category)||![5,10,25,50].includes(raw.radius)||!Number.isFinite(raw.expiresAt)||raw.expiresAt<=Date.now()||raw.expiresAt>Date.now()+15*60_000){sessionStorage.removeItem(SEARCH_KEY);return;}return raw;}catch{return;}
}
export function clearEdenRememberedSearch(){recentSearch=undefined;try{sessionStorage.removeItem(SEARCH_KEY);}catch{/* Optional tab context. */}}
function publicRoute():EdenPublicRoute{
  if(typeof window==='undefined')return'home';const path=window.location.pathname?.replace(/\/$/,'')||'/';
  if(path.startsWith('/resources/'))return'resource';return ({'/':'home','/support':'support','/discover':'discover','/give':'give','/organizations':'organizations','/about':'about','/privacy':'privacy'} as Record<string,EdenPublicRoute>)[path]??'home';
}
/** Rich state stays on the device. The separate provider context below never
 * includes titles, selected records, location, filters or navigation history. */
export function edenLocalPageContext():EdenLocalPageContext{
  const base=edenPageContext(),saved=rememberedSearch();let view:Partial<EdenLocalPageContext>={};try{view=active?.presentation?.()??{};}catch{/* Use the safe projection. */}
  const cityId=EDEN_CITIES.some(city=>city.id===view.cityId)?view.cityId:active?undefined:saved?.cityId;
  const results=Array.isArray(view.results)?view.results.slice(0,20).flatMap((item,index)=>item&&typeof item.title==='string'&&['directory','mapped'].includes(item.kind)?[{index:index+1,...(typeof item.id==='string'&&/^[a-f\d-]{36}$/i.test(item.id)?{id:item.id}:{}),title:item.title.slice(0,160),selected:item.selected===true,kind:item.kind}]:[]):[];
  const path=publicRoute(),route=path==='support'&&base.page==='resource'?'resource':path;
  return{route,category:base.category??saved?.category,cityId,radius:base.radius??saved?.radius,resultCount:base.resultCount,selectedIndex:Number.isInteger(view.selectedIndex)&&view.selectedIndex!>0&&view.selectedIndex!<=base.resultCount?view.selectedIndex:undefined,loading:['idle','loading','ready','error'].includes(view.loading??'')?view.loading!:'idle',mapState:['not-shown','loading','ready','unavailable'].includes(view.mapState??'')?view.mapState!:'not-shown',hasFilter:view.hasFilter===true,mapVisible:view.mapVisible===true,synthetic:base.synthetic,results};
}
function validatedContext(adapter: EdenPageAdapter): EdenPageContext | null {
  try { return validateEdenPageContext(adapter.context()); }
  catch { return null; }
}
export function edenPageContext(): EdenPageContext {
  // A page adapter cannot accidentally export DOM, records, location or account
  // fields. Validation also returns a detached, finite projection.
  const saved=rememberedSearch();
  return (active && validatedContext(active)) || { page:publicRoute(), resultCount:0, synthetic:saved?.synthetic===true,...(saved?{category:saved.category,radius:saved.radius}:{}) };
}
export function edenPageRevision() { return revision; }
export function publishEdenApplication(event: EdenApplicationEvent = { type: 'context' }) {
  revision++;
  if(active&&event.type==='search-completed'){try{const view=edenLocalPageContext();if(view.cityId&&view.category&&view.radius){recentSearch={cityId:view.cityId,category:view.category,radius:view.radius,expiresAt:Date.now()+15*60_000,synthetic:view.synthetic};if(!view.synthetic){const{synthetic:_synthetic,...stored}=recentSearch;sessionStorage.setItem(SEARCH_KEY,JSON.stringify(stored));}}}catch{/* Storage is optional; never retain free-form fields. */}}
  for (const listener of [...subscribers]) {
    // Assistant rendering must not interrupt the application's public search.
    // Do not log errors here: an adapter/listener exception may contain content.
    try { listener(event); } catch { /* Other subscribers still receive the event. */ }
  }
}
export function subscribeEdenApplication(listener: (event: EdenApplicationEvent) => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; }
export function registerEdenPage(adapter: EdenPageAdapter) {
  active = adapter; publishEdenApplication();
  return () => { if (active === adapter) { active = undefined; publishEdenApplication(); } };
}
export function edenActionLabel(action: EdenAction) {
  if(action.type==='navigate-support')return'Open Find Support';
  if(action.type==='read-results')return'Read the current results';
  if(action.type==='clear-filters')return'Clear the results filter';
  if(action.type==='read-page')return'Explain this public page';
  if(action.type==='navigate-public')return'Open '+action.page;
  if(action.type==='read-hours')return'Check the available hours for result '+action.index;
  if (action.type === 'search') return `Find ${action.category === 'food' ? 'food assistance' : action.category === 'community' ? 'community support' : 'healthcare resources'}${action.city ? ' in ' + EDEN_CITIES.find(city => city.id === action.city)!.label : ''}${action.radius ? ' within ' + action.radius + ' miles' : ''}`;
  if (action.type === 'radius') return `Search within ${action.radius} miles`;
  if (action.type === 'refine') return `Show ${action.category === 'food' ? 'food assistance' : action.category === 'community' ? 'community support' : 'healthcare resources'}`;
  if (action.type === 'select') return `Select result ${action.index} on the map`;
  if (action.type === 'details') return `Open details for result ${action.index}`;
  return 'Show supported actions';
}
export async function executeEdenAction(value: EdenAction, expectedRevision: number, signal: AbortSignal): Promise<EdenActionResult> {
  const action = validateEdenAction(value);
  if (!action || signal.aborted) return { status: 'unavailable', message: 'That action is no longer available. Try again.' };
  if(typeof window!=='undefined'&&!edenPublicPagePolicy(window.location.pathname??'/').assistant)return{status:'unavailable',message:'Eden actions are limited to public information pages.'};
  if (expectedRevision !== revision) return { status: 'clarify', message: 'The page changed. Please choose the action again.' };
  if (action.type === 'help') return { status: 'done', message: 'I can find food, healthcare or community support in a supported city, change the search distance, and select or open a numbered result.' };
  if(action.type==='read-page')return{status:'done',message:edenPublicPageFacts(edenLocalPageContext().route).map(fact=>fact.text).join(' ')};
  if(action.type==='navigate-public'){const{navigateEdenPublicPage}=await import('./public-navigation.ts');await navigateEdenPublicPage(action.page,{signal});return{status:'done',message:'The public page is open.'};}
  if(action.type==='navigate-support'&&publicRoute()!=='support'){
    const saved=rememberedSearch(),query=new URLSearchParams({eden:'1'});
    if(saved){query.set('location',EDEN_CITIES.find(city=>city.id===saved.cityId)!.query);query.set('category',saved.category);query.set('radius_miles',String(saved.radius));}
    if(publicRoute()==='give')query.set('intent','give');window.location.assign('/support?'+query);return{status:'done',message:'Opening Find Support.'};
  }
  if (active) {
    const context = validatedContext(active);
    if (!context) return { status: 'unavailable', message: 'The page is not ready for this action. Use the search controls or try again.' };
    if ((action.type === 'details' || action.type === 'select'||action.type==='read-hours') && action.index > context.resultCount) return { status: 'clarify', message: 'That result number is not available. Choose a number from the current list.' };
    if(action.type==='read-hours')return{status:'done',message:'The current result is selected for a source-backed hours check. Opening status requires reliable current hours and time information.'};
    return active.execute(action, signal);
  }
  if (action.type === 'search' && action.city) {
    const city = EDEN_CITIES.find(item => item.id === action.city)!;
    // Only canonical public city and finite enums enter the navigation URL. No visitor text.
    const query = new URLSearchParams({ location: city.query, category: action.category, radius_miles: String(action.radius ?? 10), eden: '1' });
    window.location.assign('/support?' + query);
    return { status: 'done', message: 'Opening Find Support with your chosen city and category.' };
  }
  return { status: 'clarify', message: 'Choose a city first, or open Find Support to refine its current results.' };
}
