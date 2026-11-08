import {EDEN_NOTICE_VERSION} from '../../shared/eden-assistant.ts';
import {edenLiveModelContext,validateEdenLiveContext,validateEdenLiveTokenResponse} from '../../shared/eden-live.ts';
import {currentHostedContext} from './hosted-conversation.ts';
import {createEdenLiveToolExecutor} from './live-actions.ts';
import {createEdenLiveSession,EdenLiveServiceError,type EdenLiveSnapshot} from './live/session.ts';
import type {mountHostedPortrait} from './runtime/hosted-portrait.ts';

type Options={
  request:(path:string,body:unknown,signal?:AbortSignal)=>Promise<Response>;
  session:(signal:AbortSignal)=>Promise<boolean>;
  release:(callId:string)=>void;
  changed:(active:boolean)=>void;
  portrait:ReturnType<typeof mountHostedPortrait>;
};
function publicContext(){
  const source=currentHostedContext();
  if(!source||!['/','/support','/give','/about','/privacy','/organizations','/discover'].includes(location.pathname))throw Error('Calls require a public page.');
  const {heading:_heading,view:_view,filtered:_filtered,mappedCount:_mapped,...fields}=source;
  const context=validateEdenLiveContext(fields);
  if(!context)throw Error('Public page context is unavailable.');
  return context;
}

export function mountHostedLive(host:HTMLElement,o:Options){
  const el=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const consent=el('[data-live-consent]'),actions=el('[data-live-actions]');
  const call=el<HTMLButtonElement>('[data-live-start]'),mute=el<HTMLButtonElement>('[data-live-mute]');
  const state=el('[data-live-state]'),clock=el('[data-live-clock]');
  let executor:ReturnType<typeof createEdenLiveToolExecutor>|undefined,callId:string|undefined;
  let interval:ReturnType<typeof setInterval>|undefined;
  let previousPhase='',spoken=false;
  const labels:Record<EdenLiveSnapshot['phase'],string>={
    idle:'',connecting:'Connecting…',introducing:'Eden is introducing herself',listening:'Listening',processing:'Thinking…',
    acting:'Using the page…',speaking:'Eden is speaking',muted:'Microphone muted',reconnecting:'Reconnecting…',
    ended:'Call ended',error:'Call unavailable', 'permission-required':'Microphone permission required'
  };
  function update(s:EdenLiveSnapshot){
    const active=!['idle','ended','error','permission-required'].includes(s.phase);
    actions.hidden=!active;call.hidden=active||!consent.hidden;
    mute.textContent=s.microphoneMuted?'Unmute':'Mute';mute.setAttribute('aria-pressed',String(s.microphoneMuted));
    el('[data-live-interrupt]').hidden=!['introducing','speaking','processing'].includes(s.phase);
    if(s.phase!==previousPhase){state.textContent=s.reason??labels[s.phase];previousPhase=s.phase;}
    // Playback events reflect the PCM player's scheduled audible interval.
    const playing=(s.diagnostic?.playbackStarts??0)>(s.diagnostic?.playbackEnds??0)&&active;
    if(playing&&!spoken)o.portrait.playbackStarted();
    if(!playing&&spoken)o.portrait.playbackEnded();
    spoken=playing;
    if(!playing)o.portrait.state(s.phase==='listening'?'listening':s.phase==='acting'?'searching':s.phase==='processing'?'thinking':'idle');
    clearInterval(interval);
    const deadline=s.diagnostic?.appDeadline;
    clock.textContent='';
    if(active&&deadline){
      const tick=()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));clock.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');};
      tick();interval=setInterval(tick,1000);
    }
    if(!active){executor=undefined;callId=undefined;}
    o.changed(active);
  }
  async function api(path:string,body:unknown,signal:AbortSignal){
    const r=await o.request(path,body,signal);
    if(r.ok)return r.json();
    const code=(await r.json().catch(()=>null))?.error?.code;
    throw new EdenLiveServiceError(code==='EDEN_LIVE_PROVIDER_QUOTA'?'rate-limit-or-quota':r.status===429?'local-limit':r.status===403||r.status===401?'access':'application',r.status,code);
  }
  const live=createEdenLiveSession({
    allowSpokenInterruption:true,getContext:publicContext,
    async getToken(req,signal){
      if(!await o.session(signal))throw new EdenLiveServiceError('access',403);
      const credential=validateEdenLiveTokenResponse(await api('live/token',{...req,noticeVersion:EDEN_NOTICE_VERSION,liveAudioAcknowledged:true},signal));
      if(!credential)throw new EdenLiveServiceError('application',503);
      if(callId!==credential.callId){
        callId=credential.callId;
        executor=createEdenLiveToolExecutor({callId,getContext:publicContext,publicDirectory:true,
          authorize:(body,s)=>api('live/tool',body,s),complete:(body,s)=>api('live/result',body,s)});
      }
      return credential;
    },
    releaseToken:o.release,
    async onToolCall(tool,signal){
      if(!executor)throw Error('Call ended.');
      const result=await executor(tool,signal);
      return {...result,context:edenLiveModelContext(result.context)};
    },
    onState:update,onTranscript(){},onAudioLevel:level=>{if(spoken)o.portrait.level(level);}
  });
  const closeConsent=()=>{consent.hidden=true;call.hidden=false;o.changed(false);};
  el('[data-live-cancel]').onclick=()=>{closeConsent();call.focus();};
  el('[data-live-confirm]').onclick=()=>{
    closeConsent();void live.start({microphoneConsent:true});
  };
  mute.onclick=()=>live.setMicrophoneMuted(!live.snapshot.microphoneMuted);
  el('[data-live-interrupt]').onclick=()=>live.stopSpeaking();
  el('[data-live-end]').onclick=()=>{live.end();call.focus();};
  return {
    prompt(){o.changed(true);state.textContent='';consent.hidden=false;call.hidden=true;el('[data-live-confirm]').focus();},
    end(){closeConsent();if(!['idle','ended','error','permission-required'].includes(live.snapshot.phase))live.end();},
    dispose(){clearInterval(interval);live.dispose();}
  };
}
