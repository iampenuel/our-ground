import {createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ShowcasePointer,type ShowcasePointerHandle,type CursorTarget} from './reactdrops/showcase-pointer';
import './action-pointer.css';
const identity=[{id:'eden',name:'EDEN',color:'#171717',textColor:'#ffffff',start:{x:'85%' as const,y:'75%' as const}}];
/** A transparent React island; it owns no application DOM or business handlers. */
export function createEdenPointerView(){
  const host=document.createElement('div');host.id='eden-action-pointer';host.setAttribute('aria-hidden','true');document.body.append(host);
  const ref=createRef<ShowcasePointerHandle>(),root=createRoot(host);
  flushSync(()=>root.render(<ShowcasePointer ref={ref} cursors={identity} loop={false} clickEffect={false} playing speed={0.7} idleDrift={0} trail={0} labelLag={0.15} labelAnimation="none" motion={{reachTime:160,reachScale:105,maxReach:700,curvature:0.75,overshoot:0,landingSpread:0}} className="eden-operation-pointer" height="100dvh"/>));
  return {
    async move(target:HTMLElement,kind:'press'|'focus'|'scroll',signal:AbortSignal){
      host.hidden=false;signal.throwIfAborted();
      const rect=target.getBoundingClientRect();
      const left=Math.max(8,rect.left),right=Math.min(innerWidth-8,rect.right),top=Math.max(8,rect.top),bottom=Math.min(innerHeight-8,rect.bottom);
      const to:CursorTarget={target,x:Math.max(0,Math.min(1,((left+right)/2-rect.left)/Math.max(1,rect.width))),y:Math.max(0,Math.min(1,((top+bottom)/2-rect.top)/Math.max(1,rect.height)))};
      const handle=ref.current;if(!handle)throw Error('Pointer renderer unavailable.');
      await handle.run('eden',[{action:'enter',pauseMs:0},kind==='press'?{action:'click',target:to,hoverMs:210}:{action:'hover',target:to}],signal);
    },
    hide(){ref.current?.stop();host.hidden=true;},
    destroy(){root.unmount();host.remove();}
  };
}
