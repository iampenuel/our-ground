import {inspectEdenWav} from '../../../shared/eden-speech.ts';

/** Read loudness at the player's real playhead. Only verified mono PCM output
 * is admitted. No microphone, second player, Web Audio graph, or new request. */
export function edenPcmEnvelope(bytes:Uint8Array):((seconds:number)=>number)|null {
  const meta=inspectEdenWav(bytes);
  if(!meta)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let pos=12;pos+8<=bytes.length;){
    const size=view.getUint32(pos+4,true),start=pos+8;
    if(view.getUint32(pos)===0x64617461){
      const count=size/2;
      return seconds=>{
        if(!Number.isFinite(seconds)||seconds<0)return 0;
        const first=Math.floor(seconds*meta.sampleRate),end=Math.min(count,first+480);
        if(end<=first)return 0;
        let power=0;
        for(let sample=first;sample<end;sample++){
          const value=view.getInt16(start+2*sample,true)/32768;
          power+=value*value;
        }
        return Math.sqrt(power/(end-first));
      };
    }
    pos=start+size+(size%2);
  }
  return null;
}

export function trackPortraitAudio(element:HTMLAudioElement,bytes:Uint8Array,signal:AbortSignal,onLevel:(level:number)=>void) {
  const envelope=edenPcmEnvelope(bytes);
  if(!envelope||signal.aborted)return ()=>{};
  let frame:number|undefined,playing=false,disposed=false;
  const clear=()=>{if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;onLevel(0);};
  const tick=()=>{
    frame=undefined;
    if(!playing||disposed||signal.aborted||element.paused||element.ended||document.hidden)return clear();
    onLevel(element.muted?0:envelope(element.currentTime)*element.volume);
    frame=requestAnimationFrame(tick);
  };
  const start=()=>{playing=true;if(frame===undefined)tick();};
  const stop=()=>{playing=false;clear();};
  const visibility=()=>{if(document.hidden)clear();else if(playing&&frame===undefined)tick();};
  const stopEvents=['pause','ended','waiting','error','emptied','seeking'] as const;
  const dispose=()=>{
    if(disposed)return;disposed=true;stop();
    element.removeEventListener('playing',start);
    for(const name of stopEvents)element.removeEventListener(name,stop);
    document.removeEventListener('visibilitychange',visibility);signal.removeEventListener('abort',dispose);
  };
  element.addEventListener('playing',start);
  for(const name of stopEvents)element.addEventListener(name,stop);
  document.addEventListener('visibilitychange',visibility);signal.addEventListener('abort',dispose,{once:true});
  return dispose;
}
