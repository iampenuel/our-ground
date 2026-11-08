// Call only after an explicit submission has rendered its loading announcement.
export function revealSearchStatus(status: HTMLElement, current: () => boolean) {
  requestAnimationFrame(() => {
    if (!current() || !status.isConnected) return;
    const rect = status.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(status).scrollMarginTop) || 16;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    if (rect.top >= top + margin && rect.bottom <= bottom - 24) return;
    status.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  });
}

/** One submission owns at most two reveals. User navigation cancels the continuation;
 * focus, filtering, pagination, resize and history restoration never trigger it. */
export function createSearchReveal() {
  let cancelActive:()=>void=()=>{};
  return {
    start(status:HTMLElement,current:()=>boolean) {
      cancelActive();
      let active=true;
      const cancel=()=>{active=false;for(const name of ['wheel','touchstart','pointerdown'])window.removeEventListener(name,cancel);window.removeEventListener('keydown',key);};
      const key=(event:KeyboardEvent)=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' ','Tab','Escape'].includes(event.key))cancel();};
      for(const name of ['wheel','touchstart','pointerdown'])window.addEventListener(name,cancel,{passive:true});
      window.addEventListener('keydown',key);cancelActive=cancel;
      revealSearchStatus(status,()=>active&&current());
      return (anchor?:HTMLElement)=>{
        requestAnimationFrame(()=>{
          if(active&&current()&&anchor?.isConnected){
            const top=anchor.getBoundingClientRect().top,margin=parseFloat(getComputedStyle(anchor).scrollMarginTop)||16;
            if(top<margin||top>margin+100)anchor.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
          }
          cancel();
        });
      };
    },
    cancel(){cancelActive();}
  };
}

/** Reveal a selected result inside the bounded list without scrolling the page.
 * Mobile lists have no internal overflow and keep their normal document flow. */
export function revealResultInPanel(scroller:HTMLElement,result:HTMLElement):boolean {
 const height=scroller.clientHeight,max=Math.max(0,scroller.scrollHeight-height);
 if(height<=0||max<=1)return false;
 const start=scroller.getBoundingClientRect().top+scroller.clientTop,end=start+height,box=result.getBoundingClientRect();
 let delta=0;
 if(box.height>height){if(box.top<start||box.top>=end)delta=box.top-start;}
 else if(box.top<start)delta=box.top-start;
 else if(box.bottom>end)delta=box.bottom-end;
 const next=Math.min(max,Math.max(0,scroller.scrollTop+delta));
 if(Math.abs(next-scroller.scrollTop)<1)return false;
 scroller.scrollTop=next;return true;
}
