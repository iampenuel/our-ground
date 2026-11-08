import {localEnglishVoice,speakLocalReply} from './command-voice.ts';
import {readEdenSpeechResponse} from './runtime/speech.ts';
import {trackPortraitAudio} from './runtime/portrait-audio.ts';
import {EDEN_SPEECH_MAX_SECONDS,EDEN_SPEECH_VOICE} from '../../shared/eden-speech.ts';

export type EdenRequest=(path:string,body:unknown,signal?:AbortSignal)=>Promise<Response>;
type Reply={reply:string;speechTicket?:string};
export class HostedVoiceError extends Error {}

/** Weak keys keep only the current on-screen answer replayable. New chat and
 * replacement replies drop that reference; audio never enters browser storage. */
const clips=new WeakMap<Reply,Uint8Array>();

async function verifiedClip(answer:Reply,request:EdenRequest,signal:AbortSignal){
  const cached=clips.get(answer);
  if(cached)return cached;
  if(!answer.speechTicket)throw new HostedVoiceError('Aoede is unavailable for this reply. You can choose an installed device voice in Privacy & voice.');
  try {
    const res=await request('speech',{speechTicket:answer.speechTicket},signal);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(answer.reply));
    signal.throwIfAborted();
    const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(res.headers.get('X-Eden-Speech-Voice')!==EDEN_SPEECH_VOICE || res.headers.get('X-Eden-Speech-Text-SHA256')!==sha){
      await res.body?.cancel().catch(()=>{});
      throw new Error('Voice response does not match this reply');
    }
    const bytes=await readEdenSpeechResponse(res,signal);
    signal.throwIfAborted();clips.set(answer,bytes);return bytes;
  }catch {
    signal.throwIfAborted();
    throw new HostedVoiceError('Aoede could not generate this reply. Ask again for fresh audio, or choose an installed device voice in Privacy & voice.');
  }
}

export async function readHostedReply(answer:Reply,preferred:string,request:EdenRequest,signal:AbortSignal,
  onStart:(source:'Aoede'|'device')=>void,onLevel:(value:number)=>void,onPause:()=>void){
  signal.throwIfAborted();
  if(preferred){
    const voice=localEnglishVoice(preferred);
    if(voice?.voiceURI!==preferred)throw new HostedVoiceError('That device voice is unavailable. Choose another voice in Privacy & voice.');
    await speakLocalReply(answer.reply,signal,()=>onStart('device'),preferred);return;
  }
  const bytes=await verifiedClip(answer,request,signal);
  signal.throwIfAborted();
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));
  try {
    const element=new Audio(url);
    await new Promise<void>((resolve,reject)=>{
      let finished=false,untrack=()=>{};
      const finish=(error?:Error)=>{
        if(finished)return;
        finished=true;clearTimeout(timer);signal.removeEventListener('abort',stop);untrack();
        element.onplaying=element.onended=element.onerror=element.onwaiting=element.onpause=null;
        element.pause();element.removeAttribute('src');element.load();
        if(error)reject(error);else resolve();
      };
      const stop=()=>finish(new DOMException('Voice ended','AbortError'));
      const fail=()=>finish(new HostedVoiceError('Aoede audio could not play. You can retry playback or choose a device voice.'));
      const timer=setTimeout(fail,(EDEN_SPEECH_MAX_SECONDS+8)*1000);
      signal.addEventListener('abort',stop,{once:true});
      if(signal.aborted){stop();return;}
      untrack=trackPortraitAudio(element,bytes,signal,onLevel);
      element.onplaying=()=>{if(!finished&&!signal.aborted)onStart('Aoede');};
      element.onwaiting=element.onpause=()=>{if(!finished&&!signal.aborted)onPause();};
      element.onended=()=>finish();element.onerror=fail;
      element.play().catch(fail);
    });
  } finally { URL.revokeObjectURL(url); }
}
