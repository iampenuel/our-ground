let disposeCurrent:(()=>void)|undefined;
const historyGuards=new WeakMap<Window,{path:string}>();
const bfcacheGuards=new WeakSet<Window>();
export function disposePublicPage(){const dispose=disposeCurrent;disposeCurrent=undefined;dispose?.();}
export function setPublicPageDisposer(dispose:()=>void){disposeCurrent=dispose;if(!bfcacheGuards.has(window)){bfcacheGuards.add(window);window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});}}
/** Agent transitions retain the assistant; manual route history still returns
 * to the existing document router rather than mounting duplicate page handlers.
 */
export function trackPublicPageNavigation(path:string){
  const existing=historyGuards.get(window);if(existing){existing.path=path;return;}
  const state={path};historyGuards.set(window,state);
  const pop=(event:PopStateEvent)=>{const actual=window.location.pathname.replace(/\/+$/,'')||'/';if(actual!==state.path){event.stopImmediatePropagation();window.location.reload();}};
  const cleanup=()=>{window.removeEventListener('popstate',pop,true);historyGuards.delete(window);};
  window.addEventListener('popstate',pop,true);window.addEventListener('pagehide',cleanup,{once:true});
}
