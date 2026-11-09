import {readEdenLiveRetryTiming,edenLiveCallTime} from '../../shared/eden-live-timing.ts';
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
  let timedDeadline:number|undefined,monotonicDeadline=0;
  const expiryWarning=document.createElement('p');
  expiryWarning.dataset.liveExpiryWarning='';expiryWarning.className='eden-caution';
  expiryWarning.setAttribute('role','status');expiryWarning.hidden=true;
  actions.insertAdjacentElement('afterend',expiryWarning);
  let previousStatus='',spoken=false,correlation='',tokenStatus:number|undefined;
  const indicator=el('[data-live-input]'),caption=el('[data-live-caption]');
  let sessionState:EdenLiveSnapshot|undefined,lastSentAt=-Infinity,lastSignalAt=-Infinity;
  function resetCaption(){caption.querySelector('span')!.textContent='';caption.hidden=true;}
  function renderMic(){
    const s=sessionState;if(!s)return;
    const fresh=s.microphoneForwarding&&performance.now()-lastSentAt<750;
    indicator.hidden=!s.microphoneActive;
    const detected=fresh&&performance.now()-lastSignalAt<350;
    const mic=s.microphoneMuted?'Microphone muted':!fresh?'Microphone paused':detected?'Detecting sound':'Microphone active';
    if(indicator.textContent!==mic)indicator.textContent=mic;
    indicator.dataset.signal=String(detected);
    const playing=(s.diagnostic?.playbackStarts??0)>(s.diagnostic?.playbackEnds??0);
    const label=s.reason??(s.phase==='listening'?(fresh?'Listening':'Waiting for microphone audio…'):s.phase==='speaking'&&!playing?'Thinking…':labels[s.phase]);
    if(label!==previousStatus){state.textContent=label;previousStatus=label;}
  }
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
    receiptText.textContent=Object.entries(latest).filter(([,v])=>v!==undefined).map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join(' · ');
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
    sessionState=s;renderMic();
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
      if(timedDeadline!==deadline){timedDeadline=deadline;monotonicDeadline=performance.now()+Math.max(0,deadline-Date.now());}
      const tick=()=>{
        const time=edenLiveCallTime(monotonicDeadline,performance.now());
        clock.textContent=time.label;
        if(expiryWarning.textContent!==time.warning)expiryWarning.textContent=time.warning;
        expiryWarning.hidden=!time.warning;
      };
      tick();interval=setInterval(()=>{tick();renderMic();},350);
    }
    if(!active){
      timedDeadline=undefined;expiryWarning.hidden=true;expiryWarning.textContent='';
      executor=undefined;callId=undefined;
      const d=s.diagnostic;
      if(correlation&&d){
        remember({reference:correlation,model:d.model,phase:s.phase,stage:d.failurePhase??s.phase,failure:d.failure,
          preparation:d.preparation,tokenHTTP:tokenStatus,service:d.serviceCode,serviceHTTP:d.serviceStatus,retryAt:d.retryAt,resetAt:d.resetAt,
          setup:d.setupComplete===true,closeCode:d.closeCode,closeReason:d.closeReason,provider:d.providerCategory,providerHTTP:d.providerStatus,
          capture:d.capture,deviceAtStop:d.device,replies:d.replies,generationComplete:d.generationComplete,waitingForInput:d.waitingForInput,lastEvent:d.lastEvent,completedTurns:d.turnComplete,toolsReceived:d.toolCallsReceived,toolHandoffs:d.toolHandoffs,inputChunks:d.inputChunks,audioChunks:d.audioChunks,decodedChunks:d.decodedChunks,inputContext:d.inputContext,outputContext:d.outputContext,playbacks:d.playbackStarts,spokenInterruptions:d.spokenInterruptions??0,unansweredTurns:d.unansweredTurns??0,inputStreamEnds:d.inputStreamEnds??0,microphoneActive:s.microphoneActive,ended:d.endReason});
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
    const error=(await r.json().catch(()=>null))?.error;
    const code=error?.code;
    const header=r.headers.get('retry-after');
    const retry=header&&/^\d{1,7}$/.test(header)?Number(header):undefined;
    const timing=readEdenLiveRetryTiming(error,r.headers.get('date'),retry);
    return new EdenLiveServiceError(code==='EDEN_LIVE_PROVIDER_QUOTA'?'rate-limit-or-quota':r.status===429?'local-limit':r.status===403||r.status===401?'access':'application',r.status,code,retry,timing);
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
    async confirmSetup(callId,signal){
      const confirmed=await api('live/connected',{callId,noticeVersion:EDEN_NOTICE_VERSION},signal);
      if(confirmed?.connected!==true)throw new EdenLiveServiceError('application',503,'EDEN_LIVE_SETUP_EXPIRED');
    },
    releaseToken:release,
    async onToolCall(tool,signal,turn){
      if(!executor)throw Error('Call ended.');
      const result=await executor(tool,signal,turn);
      return {...result,context:edenLiveModelContext(result.context)};
    },
    onState:update,onTranscript(){},
    onUnplayedCaption:text=>{caption.querySelector('span')!.textContent=text;caption.hidden=false;},
    onInputLevel:level=>{if(level>.06)lastSignalAt=performance.now();},
    onInputSent:()=>{const now=performance.now(),resumed=now-lastSentAt>750;lastSentAt=now;if(resumed)renderMic();},
    onAudioLevel:level=>{if(spoken)o.portrait.level(level);}
  });
  const closeConsent=()=>{consent.hidden=true;call.hidden=false;o.changed(false);};
  el('[data-live-cancel]').onclick=()=>{closeConsent();call.focus();};
  el('[data-live-confirm]').onclick=()=>{
    resetCaption();lastSentAt=lastSignalAt=-Infinity;correlation=crypto.randomUUID();tokenStatus=undefined;details.hidden=true;details.open=false;closeConsent();void live.start({microphoneConsent:true});
  };
  mute.onclick=()=>live.setMicrophoneMuted(!live.snapshot.microphoneMuted);
  el('[data-live-interrupt]').onclick=()=>live.stopSpeaking();
  el('[data-live-end]').onclick=()=>{live.end();call.focus();};
  return {
    prompt(){o.changed(true);state.textContent='';consent.hidden=false;call.hidden=true;el('[data-live-confirm]').focus();},
    end(){resetCaption();closeConsent();if(!['idle','ended','error','permission-required'].includes(live.snapshot.phase))live.end();},
    dispose(){resetCaption();clearInterval(interval);live.dispose();}
  };
}
