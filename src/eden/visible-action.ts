import {activeEdenTurnCorrelationId} from './turn-diagnostic.ts';
import {resolveEdenUiTarget,edenTargetUsable,type EdenUiTarget} from './action-targets.ts';
import type {EdenPublicDestination} from '../../shared/eden-public-pages.ts';
type View=ReturnType<typeof import('./action-pointer-view')['createEdenPointerView']>;
let renderer:Promise<View>|undefined,status:HTMLElement|undefined,hideTimer:ReturnType<typeof setTimeout>|undefined,idleTimer:ReturnType<typeof setTimeout>|undefined;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function announce(label:string){if(!status){status=document.createElement('div');status.className='eden-action-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}status.textContent='Eden: '+label;status.hidden=false;}
function clean(){if(status)status.hidden=true;document.querySelectorAll('[data-cursor-hover="eden"],[data-cursor-press="eden"],[data-cursor-selected="eden"]').forEach(el=>{for(const key of ['data-cursor-hover','data-cursor-press','data-cursor-selected'])el.removeAttribute(key);});const pending=renderer;void pending?.then(v=>v.hide()).catch(()=>{});clearTimeout(idleTimer);if(pending)idleTimer=setTimeout(()=>{if(renderer===pending&&status?.hidden){renderer=undefined;void pending.then(v=>v.destroy()).catch(()=>{});}},1800);}
/** The cursor only previews a registered, already-authorized operation. Its
 * press callback has no executor. The caller owns mutation and verification. */
export async function performEdenVisibleAction<T>(target:EdenUiTarget,label:string,kind:'press'|'focus'|'scroll',signal:AbortSignal,operate:(signal:AbortSignal)=>T|Promise<T>):Promise<T>{
  signal.throwIfAborted();
  // Non-browser protocol tests do not mount visual UI. Production always resolves a real target.
  if(typeof document==='undefined'||!document.body)return operate(signal);
  const operationId=crypto.randomUUID();
  const emit=(phase:string,node?:HTMLElement)=>{const rect=node?.getBoundingClientRect();document.dispatchEvent(new CustomEvent('eden:visible-action',{detail:{operationId,correlationId:activeEdenTurnCorrelationId(),phase,target:structuredClone(target),...(rect?{rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}:{})}}));};
  const element=resolveEdenUiTarget(target);if(!element)throw Error('That interface control is unavailable. Please use the current page.');
  const interrupt=new AbortController(),combined=AbortSignal.any([signal,interrupt.signal]);
  const onInput=(event:Event)=>{if(event.isTrusted)interrupt.abort(Error('The page action was interrupted by your input.'));};
  const onHidden=()=>{if(document.hidden)interrupt.abort(Error('The page action was interrupted.'));};
  const onAbort=()=>{emit('cancelled');clean();};
  for(const name of ['pointerdown','keydown','wheel','touchstart'])document.addEventListener(name,onInput,{capture:true,passive:true});
  document.addEventListener('visibilitychange',onHidden);combined.addEventListener('abort',onAbort,{once:true});
  clearTimeout(hideTimer);clearTimeout(idleTimer);announce(label);emit('target',element);
  let view:View|undefined;
  try{
    if(!reduced())try{renderer??=import('./action-pointer-view').then(m=>m.createEdenPointerView());view=await renderer;}catch{renderer=undefined;/* Animation failure never disables a registered action. */}
    combined.throwIfAborted();
    if(kind!=='scroll')element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    const move=async(current:View,node:HTMLElement,mode:'press'|'focus'|'scroll')=>{
      await new Promise<void>((resolve,reject)=>{
        const abort=()=>reject(new DOMException('Page action interrupted','AbortError'));
        combined.addEventListener('abort',abort,{once:true});
        current.move(node,mode,combined).then(resolve,reject).finally(()=>combined.removeEventListener('abort',abort));
      });
    };
    if(view&&kind!=='scroll'){
      for(let attempt=0;attempt<2;attempt++){
        const before=element.getBoundingClientRect();
        try{await move(view,element,kind);}catch(error){combined.throwIfAborted();view.hide();view=undefined;break;}
        combined.throwIfAborted();
        const after=element.getBoundingClientRect();if(Math.abs(before.x-after.x)+Math.abs(before.y-after.y)<8)break;
        if(attempt===1)throw Error('The interface moved. Please try again.');
      }
    }
    if(resolveEdenUiTarget(target)!==element||!edenTargetUsable(element))throw Error('That interface control changed. Please try again.');
    combined.throwIfAborted();emit('execute',element);const result=await operate(combined);combined.throwIfAborted();
    const reported=result&&typeof result==='object'&&'status'in result?result.status:undefined;emit(reported&&reported!=='done'?'failed':'applied');
    // No success marker is shown here. The application verifies the returned state.
    if(view&&kind==='scroll'&&edenTargetUsable(element))await move(view,element,'scroll').catch(()=>{});
    return result;
  }catch(error){if(!combined.aborted)emit('failed');throw error;}finally{
    for(const name of ['pointerdown','keydown','wheel','touchstart'])document.removeEventListener(name,onInput,true);
    document.removeEventListener('visibilitychange',onHidden);combined.removeEventListener('abort',onAbort);
    hideTimer=setTimeout(clean,150);
  }
}
export async function presentEdenNavigation<T>(page:EdenPublicDestination,signal:AbortSignal,navigate:(signal:AbortSignal)=>T|Promise<T>){
  if(typeof document==='undefined'||!document.body)return navigate(signal);
  if(!resolveEdenUiTarget({page})&&resolveEdenUiTarget('menu')){
    await performEdenVisibleAction('menu','Open the public navigation','press',signal,()=>{const menu=document.querySelector<HTMLDetailsElement>('.og-mobile-menu');if(!menu)throw Error('Public navigation is unavailable.');menu.open=true;});
  }
  return performEdenVisibleAction({page},'Open '+({home:'Our Ground',support:'Find Support',give:'Give Support',organizations:'For Organizations',about:'About',privacy:'Privacy'}[page]),'press',signal,navigate);
}
