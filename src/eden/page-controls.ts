import { edenLocalPageContext, executeDirectoryControl, closeEdenPublicDetails,type EdenActionResult } from './application-bridge.ts';
import { edenPublicPagePolicy } from './public-page-policy.ts';
import { isEdenSurface, type EdenSurface } from '../../shared/eden-conversation.ts';
import {performEdenVisibleAction} from './visible-action.ts';
import {resolveEdenUiTarget,type EdenUiTarget} from './action-targets.ts';
const targets:Partial<Record<EdenSurface,EdenUiTarget>>={
  'scroll-results':'results','scroll-search':'search','scroll-giving':'giving','scroll-organizations':'organizations',
  'focus-location':'location','focus-radius':'radius','show-map':'map-toggle','show-list':'map-toggle','submit-search':'submit','back-to-map':'close-details',
  'scroll-up':'page','scroll-down':'page'
};
export function currentPageControls():EdenSurface[] {
  if(!edenPublicPagePolicy(location.pathname).assistant)return [];
  return (Object.keys(targets) as EdenSurface[]).filter(key=>resolveEdenUiTarget(targets[key]!,true)&&(!['scroll-up','scroll-down'].includes(key)||(document.scrollingElement?.scrollHeight??0)>innerHeight));
}
const unavailable=(message:string):EdenActionResult=>({status:'unavailable',message});
const done=(message:string):EdenActionResult=>({status:'done',message});
/** Typed outcome is based on the actual control and state, never reply-text matching. */
export async function applyPageControlResult(control:EdenSurface,signal:AbortSignal):Promise<EdenActionResult>{
  signal.throwIfAborted();
  if(!isEdenSurface(control)||!currentPageControls().includes(control))return unavailable('That control is unavailable on this page.');
  if(control==='back-to-map'){
    const closed=await performEdenVisibleAction('close-details','Return to the current search results','press',signal,s=>closeEdenPublicDetails(s));
    if(closed.status!=='done')return closed;
    return applyPageControlResult('show-map',signal);
  }
  if(control==='submit-search')return performEdenVisibleAction('submit','Search the public directory','press',signal,s=>executeDirectoryControl(s));
  if(control==='scroll-up'||control==='scroll-down')return performEdenVisibleAction('page',control==='scroll-up'?'Scroll up the page':'Scroll down the page','scroll',signal,()=>{
    const page=document.scrollingElement!,before=page.scrollTop;
    window.scrollBy({top:(control==='scroll-up'?-1:1)*innerHeight*.75,behavior:'instant'});
    return done(Math.abs(page.scrollTop-before)>0?'The page has scrolled.':control==='scroll-up'?'You’re at the top of this page.':'You’re at the bottom of this page.');
  });
  if(control==='show-list'||control==='show-map')return performEdenVisibleAction('map-toggle',control==='show-map'?'Show the matching locations map':'Show the matching results list','press',signal,()=>{
    const toggle=resolveEdenUiTarget('map-toggle')!,map=control==='show-map';
    // This is the validated application executor. The visual callback never clicks.
    if((toggle.getAttribute('aria-expanded')==='true')!==map)toggle.click();
    if((toggle.getAttribute('aria-expanded')==='true')!==map)return unavailable('That view is unavailable.');
    const target=resolveEdenUiTarget(map?'map':'results');if(!target)return unavailable('That view is unavailable.');reveal(target);
    if(!map)return done('Showing the matching results list.');
    const state=edenLocalPageContext().mapState;
    return done(state==='unavailable'?'The map section is open, but the map is unavailable. The list still shows your results.':state==='ready'?'The map is open.':'The map section is open. Check its status for available locations.');
  });
  const key=targets[control]!;
  return performEdenVisibleAction(key,control.startsWith('focus-')?'Focus the page control':'Scroll to the requested section',control.startsWith('focus-')?'focus':'scroll',signal,()=>{
    const target=resolveEdenUiTarget(key);if(!target)return unavailable('That section is unavailable on this page.');reveal(target);
    if(document.activeElement!==target)return unavailable('That section could not receive focus.');
    const bounds=target.getBoundingClientRect();if(bounds.bottom<=0||bounds.top>=innerHeight)return unavailable('The section could not be brought into view.');
    const names:Partial<Record<EdenSurface,string>>={'scroll-results':'Matching results','scroll-search':'Search','scroll-giving':'Ways to give','scroll-organizations':'Organization access','focus-location':'Location','focus-radius':'Search distance'};
    return done(names[control]+' is in focus.');
  });
}
export async function applyPageControl(control:EdenSurface,signal:AbortSignal):Promise<string>{return(await applyPageControlResult(control,signal)).message;}
function reveal(target:HTMLElement){
  if(target.tabIndex<0)target.setAttribute('tabindex','-1');target.classList.add('eden-page-target');target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});
}
