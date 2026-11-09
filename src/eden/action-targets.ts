import {EDEN_PUBLIC_PAGE_PATHS,type EdenPublicDestination} from '../../shared/eden-public-pages.ts';
import {edenPublicPagePolicy} from './public-page-policy.ts';
import type {EdenCategory} from '../../shared/eden-assistant.ts';
/** These are application capabilities, never selectors supplied by a model. */
export type EdenUiTarget = 'location'|'keyword'|'radius'|'submit'|'map-toggle'|'results'|'search'|'map'|'giving'|'organizations'|'close-details'|'page'|'menu'
  | {category:EdenCategory}|{resultKey:string;operation:'details'|'select'}|{page:EdenPublicDestination};
const ids={location:'locationInput',keyword:'keywordInput',radius:'radiusInput',submit:'supportSubmit','map-toggle':'showSupportMap',results:'listTitle',search:'locationForm',map:'mapTitle',giving:'ways-to-give',organizations:'organization-access','close-details':'closeLinkedResource',page:'main'} as const;
export function edenTargetUsable(el:Element|null,discover=false):el is HTMLElement {
  return el instanceof HTMLElement && el.isConnected && !el.closest('[hidden]') && (!el.closest('[inert]')||(discover&&el.closest('[inert]')?.id==='app'&&document.body.classList.contains('eden-assistant-expanded'))) && !el.matches(':disabled,[aria-disabled="true"]') && el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden' && !el.closest('details:not([open]) nav');
}
export function resolveEdenUiTarget(target:EdenUiTarget,discover=false):HTMLElement|null {
  if(!edenPublicPagePolicy(location.pathname).assistant)return null;
  let node:Element|null=null;
  if(typeof target==='string')node=target==='close-details'?document.querySelector('[data-resource-content]:not([hidden]) [data-resource-close]')??document.getElementById(ids[target]):target==='menu'?document.querySelector('.og-mobile-menu > summary'):document.getElementById(ids[target])??(target==='page'?document.querySelector('main'):null);
  else if('category'in target)node=[...document.querySelectorAll('[data-category]')].find(el=>el.getAttribute('data-category')===target.category)??null;
  else if('page'in target){const path=EDEN_PUBLIC_PAGE_PATHS[target.page];node=[...document.querySelectorAll('.og-site-header a[href],main a[href]')].find(el=>el.getAttribute('href')===path&&edenTargetUsable(el,discover))??null;if(!node&&target.page==='privacy')node=[...document.querySelectorAll('.og-footer a[href]')].find(el=>el.getAttribute('href')===path&&edenTargetUsable(el,discover))??null;}
  else if(target.resultKey.length<=250&&/^(directory|geoapify):/.test(target.resultKey)){
    const card=[...document.querySelectorAll('[data-card-key]')].find(el=>el.getAttribute('data-card-key')===target.resultKey);
    const marker=target.operation==='select'?[...document.querySelectorAll('[data-eden-map-key]')].find(el=>el.getAttribute('data-eden-map-key')===target.resultKey&&edenTargetUsable(el,discover)):null;
    node=marker??card?.querySelector(target.operation==='details'?'[data-resource-open]':'.discovery-select')??null;
  }
  return edenTargetUsable(node,discover)?node:null;
}
