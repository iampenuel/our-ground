import {localEnglishVoice,speakLocalReply} from './command-voice.ts';
import {readEdenSpeechResponse} from './runtime/speech.ts';
export type EdenRequest=(path:string,body:unknown,signal?:AbortSignal)=>Promise<Response>;

/** The server synthesizes only a short verified answer identified by its ticket.
 * Choosing an installed voice avoids any additional provider request. */
export async function readHostedReply(text:string,ticket:string|undefined,preferred:string,request:EdenRequest,signal:AbortSignal,onStart:(source:'Aoede'|'device')=>void) {
  signal.throwIfAborted();
  if(ticket&&!preferred){
    try{
      const wait=localEnglishVoice()?AbortSignal.any([signal,AbortSignal.timeout(4500)]):signal;
      const res=await request('speech',{speechTicket:ticket},wait);
      const bytes=await readEdenSpeechResponse(res,wait);signal.throwIfAborted();
      const src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));
      try {
        const element=new Audio(src);
        await new Promise<void>((resolve,reject)=>{
          const finish=(error?:Error)=>{
            signal.removeEventListener('abort',stop);
            element.onplaying=element.onended=element.onerror=null;
            element.pause();element.removeAttribute('src');element.load();
            if(error)reject(error);else resolve();
          };
          const stop=()=>finish(new DOMException('Voice ended','AbortError'));
          signal.addEventListener('abort',stop,{once:true});
          element.onplaying=()=>{if(!signal.aborted)onStart('Aoede');};
          element.onended=()=>finish();element.onerror=()=>finish(Error('Audio unavailable'));
          element.play().catch(()=>finish(Error('Audio unavailable')));
        });
        return;
      }finally{URL.revokeObjectURL(src);}
    }catch{signal.throwIfAborted();}
  }
  await speakLocalReply(text,signal,()=>onStart('device'),preferred);
}
