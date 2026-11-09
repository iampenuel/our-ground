import {EdenController} from './controller.ts';
import {mountEdenLauncherPortrait,type EdenLauncherPortrait} from './launcher.ts';
import type {EdenState} from '../types/eden.ts';

/** Reuse one approved profile when the launcher becomes a chat header. Its
 * native launcher export contains idle/blink only. The expressive layered
 * profile uses these same approved pixels without requesting WASM on public pages. */
export function mountHostedPortrait(host:HTMLElement){
  const launcher=host.querySelector<HTMLElement>('.eden-launch')!;
  const slot=host.querySelector<HTMLElement>('.eden-portrait')!;
  const surface=host.querySelector<HTMLElement>('.eden-launch-portrait')!;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer:EdenLauncherPortrait|undefined,disposed=false,loading=false;
  let rendererName='loading';
  const describe=()=>{host.dataset.edenPortrait=media.matches?'static-reduced':rendererName;};
  const controller=new EdenController({
    setState:value=>renderer?.setState(value),
    setAudioLevel:value=>renderer?.setAudioLevel(value),
    setReducedMotion:value=>renderer?.setReducedMotion(value),
    setPaused:value=>renderer?.setPaused(value),
    dispose:()=>renderer?.dispose(),
  });
  controller.subscribe(snapshot=>{if(host.dataset.edenState!==snapshot.state)host.dataset.edenState=snapshot.state;});
  async function load(){
    if(loading||renderer||media.matches||disposed)return;
    loading=true;
    try{
      const next=await mountEdenLauncherPortrait(surface,{profile:true,nativeRive:false,reducedMotion:media.matches});
      if(disposed){next.dispose();return;}
      renderer=next;renderer.setReducedMotion(media.matches);
      renderer.setState(controller.snapshot.state);renderer.setAudioLevel(controller.snapshot.audioLevel);
      const kind=await next.ready;
      if(!disposed){rendererName=kind==='static'?'static-fallback':kind;describe();}
    }catch{if(!disposed){rendererName='static-fallback';describe();}}
    finally{loading=false;}
  }
  const motion=()=>{describe();controller.setEdenReducedMotion(media.matches);if(!media.matches)void load();};
  slot.replaceChildren();motion();media.addEventListener('change',motion);
  const set=(value:Exclude<EdenState,'speaking'>)=>controller.setEdenState(value);
  return {
    show(open:boolean){if(open){if(surface.parentNode!==slot)slot.append(surface);}else if(surface.parentNode!==launcher)launcher.prepend(surface);},
    state:set,
    playbackStarted(){controller.dispatch({type:'playback-started'});},
    level(value:number){controller.setEdenAudioLevel(value);},
    playbackEnded(){if(controller.snapshot.state==='speaking')controller.dispatch({type:'playback-completed'});},
    dispose(){if(disposed)return;disposed=true;media.removeEventListener('change',motion);controller.dispose();},
  };
}
