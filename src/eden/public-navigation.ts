import {EDEN_PUBLIC_PAGE_PATHS,isEdenPublicDestination} from '../../shared/eden-public-pages.ts';
import type {EdenPublicDestination} from '../../shared/eden-public-pages.ts';
import {edenLocalPageContext,edenPageContext,publishEdenApplication} from './application-bridge.ts';
import {edenPublicPagePolicy} from './public-page-policy.ts';
import {ensureEdenSupportPage} from './support-navigation.ts';
import {trackPublicPageNavigation} from '../public-page-lifecycle.ts';
type Mount=(root:HTMLElement)=>void;
async function loadPublicPage(page:Exclude<EdenPublicDestination,'support'>):Promise<Mount>{
  if(page==='home'){const module=await import('../landing.ts');return module.mountLandingPage;}
  if(page==='give'||page==='organizations'){const module=await import('../participate.ts');return module.mountParticipationPage;}
  if(page==='about'){const module=await import('../info.ts');return module.mountInfoPage;}
  const module=await import('../privacy.ts');return module.mountPrivacyPage;
}
/** Finite public route mounts reuse the original templates. No URL/script,
 * account route, remote page or alternate resource transport can be supplied.
 */
export function createEdenPublicNavigator(loadPage=loadPublicPage){
  let pending=false;
  // Only an in-memory return to the same public city search may restore a keyword.
  // Do not put visitor text in EDEN session storage, tool arguments or a navigation URL.
  let lastFilter:{city:string;category:string;radius:number;keyword:string;until:number}|undefined;
  return async function navigate(page:EdenPublicDestination,options:{signal:AbortSignal;evaluationData?:boolean;publicDirectory?:boolean}){
    options.signal.throwIfAborted();
    if(!isEdenPublicDestination(page)||!edenPublicPagePolicy(window.location.pathname).assistant||pending)throw new Error('This public navigation is unavailable.');
    if(page==='support'){
      const view=edenLocalPageContext();
      const action=view.cityId&&view.category&&view.radius?{type:'search' as const,city:view.cityId,category:view.category,radius:view.radius}:{type:'navigate-support' as const};
      const resumedKeyword=lastFilter&&lastFilter.until>Date.now()&&view.cityId===lastFilter.city&&view.category===lastFilter.category&&view.radius===lastFilter.radius?lastFilter.keyword:undefined;
      await ensureEdenSupportPage(action,{...(resumedKeyword?{resumedKeyword}:{}),signal:options.signal,evaluationData:options.evaluationData,publicDirectory:options.publicDirectory,hasSupportPage:()=>['support','resource'].includes(edenPageContext().page)});return;
    }
    const start=window.location.pathname,target=EDEN_PUBLIC_PAGE_PATHS[page];
    if((start.replace(/\/+$/,'')||'/')===target)return;
    pending=true;
    try{
      const mount=await loadPage(page);options.signal.throwIfAborted();
      if(window.location.pathname!==start)throw new Error('The page changed before navigation completed.');
      const root=document.getElementById('app'),assistant=document.getElementById('eden-assistant');
      if(!root||assistant&&root.contains(assistant))throw new Error('The public page is unavailable.');
      if(start==='/support'){
        const v=edenLocalPageContext(),kw=new URLSearchParams(window.location.search).get('q');
        lastFilter=v.loading==='ready'&&v.hasFilter&&kw&&v.cityId&&v.category&&v.radius?{city:v.cityId,category:v.category,radius:v.radius,keyword:kw.slice(0,100),until:Date.now()+15*60_000}:undefined;
      }
      window.history.pushState(null,'',target);trackPublicPageNavigation(target);mount(root);publishEdenApplication();
      window.scrollTo?.({top:0,behavior:'instant'});
    }finally{pending=false;}
  };
}
export const navigateEdenPublicPage=createEdenPublicNavigator();
