type IntroductionOptions={homepage?:boolean;launcher?:HTMLElement;reducedMotion?:boolean};

/** The invitation belongs to this page load. Dismissal never uses storage. */
export function mountEdenIntroduction(card:HTMLElement,dismissButton:HTMLButtonElement,options:IntroductionOptions={}){
  let dismissed=false,open=false,disposed=false,allowed=options.homepage??true;
  const render=()=>{card.hidden=disposed||dismissed||open||!allowed;};
  const onDismiss=(event:Event)=>{event.stopPropagation();dismissed=true;render();};
  dismissButton.addEventListener('click',onDismiss);
  render();
  const animations:Animation[]=[];
  if(allowed&&!options.reducedMotion&&options.launcher&&typeof options.launcher.animate==='function'){
    const frames=[{transform:'translateX(14px)',opacity:0},{transform:'translateX(0)',opacity:1}];
    animations.push(options.launcher.animate(frames,{duration:300,easing:'cubic-bezier(.2,.7,.3,1)'}));
    animations.push(card.animate(frames,{duration:180,delay:160,easing:'cubic-bezier(.2,.7,.3,1)',fill:'backwards'}));
  }
  const temporarilyHide=()=>{open=true;render();};
  return {
    temporarilyHide,hide:temporarilyHide,dismiss:temporarilyHide,collapse:temporarilyHide,
    restore(){open=false;render();},
    setPageAllowed(value:boolean){allowed=value;render();},
    dispose(){if(disposed)return;disposed=true;render();dismissButton.removeEventListener('click',onDismiss);for(const animation of animations)animation.cancel();},
  };
}
