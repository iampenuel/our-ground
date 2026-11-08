import {localEnglishVoice,speakLocalReply} from './command-voice.ts';
import {readEdenSpeechResponse} from './runtime/speech.ts';
import {trackPortraitAudio} from './runtime/portrait-audio.ts';
import {EDEN_SPEECH_MAX_SECONDS,EDEN_SPEECH_VOICE} from '../../shared/eden-speech.ts';

export type EdenRequest=(path:string,body:unknown,signal?:AbortSignal)=>Promise<Response>;
type Reply={reply:string;speechTicket?:string};
export class HostedVoiceError extends Error {}

/** One in-flight request or settled clip per displayed answer. A failed or
 * canceled one-use grant is never retried. New chat drops its weak reference. */
const attempts=new WeakMap<Reply,Promise<Uint8Array>>();
let cooldown:{until:number;message:string}|undefined;
const optionalVoice='You can keep using text or choose an installed device voice in Privacy & voice.';
function retrySeconds(value:unknown){
  return typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=31*86400?value:undefined;
}
async function speechFailure(res:Response){
  const info=(await res.json().catch(()=>null))?.error;
  const code=info?.code;
  if(res.status===429){
    const q=info?.quota;
    const app=code==='EDEN_USAGE_LIMIT',google=code==='SPEECH_QUOTA_EXHAUSTED';
    const source=app?'Our Ground':google?'Google':'The voice service';
    const category=(app&&q?.source==='our-ground'||google&&q?.source==='google')?q.category:undefined;
    const header=res.headers.get('Retry-After');
    const delay=retrySeconds(header!==null&&/^\d{1,7}$/.test(header)?Number(header):undefined)??retrySeconds(q?.retryAfterSeconds);
    let message:string;
    if(category==='zero-allowance')message=source+' currently has no allowance for Aoede on this project.';
    else if(category==='daily')message=source+' has reached a daily voice limit. Wait until that quota resets.';
    else if(delay!==undefined)message=source+' is limiting voice requests. Wait at least '+delay+' seconds before requesting another voice reply.';
    else message=source+' is limiting voice requests. Voice will not retry automatically.';
    message+=' '+optionalVoice;
    // Retry-After is a lower bound, never a timer that triggers synthesis.
    // Unknown/zero daily availability must not prompt a loop of immediate retries.
    const dailyOrZero=category==='daily'||category==='zero-allowance';
    const minimum=dailyOrZero?(app&&delay!==undefined?0:900):30;
    const until=Date.now()+1000*Math.max(delay??0,minimum);
    if(!cooldown || until>=cooldown.until)cooldown={until,message};
    return new HostedVoiceError(message);
  }
  if(code==='EDEN_SPEECH_EXPIRED')return new HostedVoiceError('The voice ticket for this reply has expired. '+optionalVoice);
  if(res.status===401||res.status===403)return new HostedVoiceError('Aoede is unavailable in this session. '+optionalVoice);
  if(code==='SPEECH_INVALID_AUDIO')return new HostedVoiceError('Google returned audio Eden could not play. '+optionalVoice);
  return new HostedVoiceError('Aoede could not generate this reply. '+optionalVoice);
}
async function requestClip(answer:Reply,request:EdenRequest,signal:AbortSignal){
  const res=await request('speech',{speechTicket:answer.speechTicket},signal);
  if(!res.ok)throw await speechFailure(res);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(answer.reply));
  signal.throwIfAborted();
  const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(res.headers.get('X-Eden-Speech-Voice')!==EDEN_SPEECH_VOICE || res.headers.get('X-Eden-Speech-Text-SHA256')!==sha){
    await res.body?.cancel().catch(()=>{});
    throw new Error('Voice response does not match this reply');
  }
  const bytes=await readEdenSpeechResponse(res,signal);
  signal.throwIfAborted();return bytes;
}
async function verifiedClip(answer:Reply,request:EdenRequest,signal:AbortSignal){
  let attempt=attempts.get(answer);
  if(!attempt){
    if(!answer.speechTicket)throw new HostedVoiceError('Aoede is unavailable for this reply. '+optionalVoice);
    if(cooldown&&Date.now()<cooldown.until)throw new HostedVoiceError(cooldown.message);
    attempt=requestClip(answer,request,signal);
    attempts.set(answer,attempt);
  }
  try {return await attempt;}
  catch(error){
    signal.throwIfAborted();
    if(error instanceof HostedVoiceError)throw error;
    throw new HostedVoiceError('Aoede could not generate this reply. '+optionalVoice);
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
