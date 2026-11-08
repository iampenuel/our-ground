import { edenLocalPageContext, executeDirectoryControl } from './application-bridge.ts';
import { edenPublicPagePolicy } from './public-page-policy.ts';
import { isEdenSurface, type EdenSurface } from '../../shared/eden-conversation.ts';

const anchors:Partial<Record<EdenSurface,string>>={
  'scroll-results':'resultsCount','scroll-search':'locationForm','scroll-giving':'ways-to-give',
  'scroll-organizations':'organization-access','focus-location':'locationInput','focus-radius':'radiusInput',
  'show-map':'showSupportMap','show-list':'showSupportMap','submit-search':'supportSubmit'
};
const visible=(el:HTMLElement|null):el is HTMLElement=>Boolean(el&&el.isConnected&&!el.closest('[hidden],[inert]')&&el.getClientRects().length&&!el.matches(':disabled'));
export function currentPageControls():EdenSurface[] {
  if(!edenPublicPagePolicy(location.pathname).assistant)return [];
  const available=(Object.keys(anchors) as EdenSurface[]).filter(key=>visible(document.getElementById(anchors[key]!)));
  const page=document.scrollingElement;
  if(page && page.scrollHeight-page.clientHeight>1)available.push('scroll-down','scroll-up');
  return available;
}
// IDs are owned by Our Ground. No external string can become a selector, URL or script.
export async function applyPageControl(control:EdenSurface,signal:AbortSignal):Promise<string> {
  signal.throwIfAborted();
  if(!isEdenSurface(control)||!currentPageControls().includes(control))return 'That control is unavailable on this page.';
  if(control==='submit-search')return (await executeDirectoryControl(signal)).message;
  if(control==='scroll-up'||control==='scroll-down'){
    const page=document.scrollingElement!;
    const before=page.scrollTop;
    window.scrollBy({top:(control==='scroll-up'?-1:1)*innerHeight*0.75,behavior:'instant'});
    return Math.abs(page.scrollTop-before)>0?'The page has scrolled.':control==='scroll-up'?'You’re at the top of this page.':'You’re at the bottom of this page.';
  }
  if(control==='show-list'||control==='show-map'){
    const toggle=document.getElementById('showSupportMap')!;
    const map=control==='show-map';
    if((toggle.getAttribute('aria-expanded')==='true')!==map)toggle.click();
    if((toggle.getAttribute('aria-expanded')==='true')!==map)return 'That view is unavailable.';
    const target=document.getElementById(map?'mapTitle':'listTitle');
    if(!visible(target))return 'That view is unavailable.';
    reveal(target);
    if(!map)return 'Showing the matching results list.';
    const state=edenLocalPageContext().mapState;
    return state==='unavailable'?'The map section is open, but the map is unavailable. The list still shows your results.':state==='ready'?'The map is open.':'The map section is open. Check its status for available locations.';
  }
  const target=document.getElementById(control==='scroll-results'&&visible(document.getElementById('listTitle'))?'listTitle':anchors[control]!);
  if(!visible(target))return 'That section is unavailable on this page.';
  reveal(target);
  if(document.activeElement!==target)return 'That section could not receive focus.';
  const bounds=target.getBoundingClientRect();
  if(bounds.bottom<=0||bounds.top>=innerHeight)return 'The section could not be brought into view.';
  const names:Partial<Record<EdenSurface,string>>={'scroll-results':'Matching results','scroll-search':'Search','scroll-giving':'Ways to give','scroll-organizations':'Organization access','focus-location':'Location','focus-radius':'Search distance'};
  return names[control]+' is in focus.';
}
function reveal(target:HTMLElement){
  if(target.tabIndex<0)target.setAttribute('tabindex','-1');
  target.classList.add('eden-page-target');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start',behavior:'instant'});
}
