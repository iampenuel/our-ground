import {EDEN_NOTICE_VERSION} from '../../shared/eden-assistant.ts';
import {isEdenLiveCallId,edenLiveModelContext,validateEdenLiveContext,validateHostedLiveClock} from '../../shared/eden-live.ts';
import {currentHostedContext} from './hosted-conversation.ts';
import {createEdenLiveToolExecutor} from './live-actions.ts';
import {createEdenLiveSession,EdenLiveServiceError,type EdenLiveSnapshot} from './live/session.ts';
import type {mountHostedPortrait} from './runtime/hosted-portrait.ts';

type Options={
  request:(path:string,body:unknown,signal?:AbortSignal,correlation?:string)=>Promise<Response>;
  session:(signal:AbortSignal)=>Promise<boolean>;
  release:(callId:string,correlation:string)=>Promise<number>;
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
  let previousStatus='',spoken=false,correlation='',tokenStatus:number|undefined;
  let released:Promise<void>=Promise.resolve();
  const details=el<HTMLDetailsElement>('[data-live-details]'),receiptText=el('[data-live-receipt]');
  const recent:Record<string,unknown>[]=[];
  function remember(receipt:Record<string,unknown>){
    const existing=recent.find(item=>item.reference===receipt.reference);
    if(existing)Object.assign(existing,receipt);else recent.push(receipt);
    if(recent.length>3)recent.shift();
    // Only bounded, enumerated metadata for this page lifetime. No audio,
    // transcripts, token/call IDs, raw provider errors, persistence or uploads.
    host.dataset.liveDiagnostic=JSON.stringify(recent);
    const latest=recent.at(-1)!;
    receiptText.textContent=Object.entries(latest).filter(([,v])=>v!==undefined).map(([k,v])=>k+': '+v).join(' · ');
  }
  function release(id:string){
    const reference=correlation;
    released=o.release(id,reference).then(status=>remember({reference,endHTTP:status}),()=>remember({reference,endHTTP:'network-error'}));
    return released;
  }
  const labels:Record<EdenLiveSnapshot['phase'],string>={
    idle:'',connecting:'Connecting…',introducing:'Eden is introducing herself',listening:'Listening',processing:'Thinking…',
    acting:'Using the page…',speaking:'Eden is speaking',muted:'Microphone muted',reconnecting:'Reconnecting…',
    ended:'Call ended',error:'Call unavailable', 'permission-required':'Microphone permission required'
  };
  function update(s:EdenLiveSnapshot){
    const active=!['idle','ended','error','permission-required'].includes(s.phase);
    host.dataset.livePhase=s.phase;actions.hidden=!active;call.hidden=active||!consent.hidden;
    mute.textContent=s.microphoneMuted?'Unmute':'Mute';mute.setAttribute('aria-pressed',String(s.microphoneMuted));
    el('[data-live-interrupt]').hidden=!['introducing','speaking','processing'].includes(s.phase);
    const label=s.reason??labels[s.phase];if(label!==previousStatus){state.textContent=label;previousStatus=label;}
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
    if(!active){
      executor=undefined;callId=undefined;
      const d=s.diagnostic;
      if(correlation&&d){
        remember({reference:correlation,model:d.model,phase:s.phase,stage:d.failurePhase??s.phase,failure:d.failure,
          preparation:d.preparation,tokenHTTP:tokenStatus,service:d.serviceCode,serviceHTTP:d.serviceStatus,
          setup:d.setupComplete===true,closeCode:d.closeCode,closeReason:d.closeReason,provider:d.providerCategory,providerHTTP:d.providerStatus,
          lastEvent:d.lastEvent,completedTurns:d.turnComplete,toolsReceived:d.toolCallsReceived,inputChunks:d.inputChunks,audioChunks:d.audioChunks,playbacks:d.playbackStarts,spokenInterruptions:d.spokenInterruptions??0,unansweredTurns:d.unansweredTurns??0,inputStreamEnds:d.inputStreamEnds??0,microphoneActive:s.microphoneActive,ended:d.endReason});
        details.hidden=s.phase!=='error'&&s.phase!=='permission-required';
      }
    }
    o.changed(active);
  }
  async function api(path:string,body:unknown,signal:AbortSignal){
    const r=await o.request(path,body,signal,correlation);
    if(r.ok)return r.json();
    throw await serviceError(r);
  }
  async function serviceError(r:Response){
    const code=(await r.json().catch(()=>null))?.error?.code;
    return new EdenLiveServiceError(code==='EDEN_LIVE_PROVIDER_QUOTA'?'rate-limit-or-quota':r.status===429?'local-limit':r.status===403||r.status===401?'access':'application',r.status,code,Number(r.headers.get('retry-after')));
  }
  const live=createEdenLiveSession({
    allowSpokenInterruption:true,getContext:publicContext,
    async getToken(req,signal){
      await released;signal.throwIfAborted();
      if(!await o.session(signal))throw new EdenLiveServiceError('access',403);
      const start=performance.now();
      const response=await o.request('live/token',{...req,noticeVersion:EDEN_NOTICE_VERSION,liveAudioAcknowledged:true},signal,correlation);
      tokenStatus=response.status;
      if(!response.ok)throw await serviceError(response);
      const body=await response.json();
      const credential=validateHostedLiveClock(body,response.headers.get('Date'),performance.now()-start);
      if(!credential){if(isEdenLiveCallId(body?.callId))void release(body.callId);throw new EdenLiveServiceError('application',503,'EDEN_LIVE_INVALID_TOKEN');}
      if(callId!==credential.callId){
        callId=credential.callId;
        executor=createEdenLiveToolExecutor({callId,getContext:publicContext,publicDirectory:true,
          authorize:(body,s)=>api('live/tool',body,s),complete:(body,s)=>api('live/result',body,s)});
      }
      return credential;
    },
    releaseToken:release,
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
    correlation=crypto.randomUUID();tokenStatus=undefined;details.hidden=true;details.open=false;closeConsent();void live.start({microphoneConsent:true});
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
