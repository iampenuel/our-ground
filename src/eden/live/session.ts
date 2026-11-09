import { EDEN_LIVE_MAX_CALL_SECONDS, EDEN_LIVE_INTRODUCTION_PROMPT, edenLiveModelContext, validateEdenLiveTokenResponse, validateEdenLiveContext, normalizeEdenLiveWireToolCall, isEdenLiveResumeHandle } from '../../../shared/eden-live.ts';
import type { EdenLiveTokenResponse, EdenLiveContext, EdenLiveToolCall as SharedLiveToolCall } from '../../../shared/eden-live.ts';
import { validateEdenAgentIntent } from '../../../shared/eden-agent.ts';
import { EDEN_PUBLIC_DESTINATIONS } from '../../../shared/eden-public-pages.ts';
import {newReply,inspectChunk,usableReply,summarizeReply} from './signals.ts';
import type {CaptureInfo} from './microphone.ts';
import { LiveMicrophoneEncoder } from './audio.ts';
import type {LiveAudioContextState} from './audio.ts';
import { BrowserLiveMicrophone } from './microphone.ts';
import type { LiveMicrophone, LiveMicrophonePreparation } from './microphone.ts';
import { LivePcmOutput } from './output.ts';
import type { LiveOutput } from './output.ts';
import { connectEdenLive } from './transport.ts';
import type { LiveConnection, LiveConnectionCallbacks, LiveTransportClose, LiveProviderCategory } from './transport.ts';

export type EdenLivePhase = 'idle' | 'permission-required' | 'connecting' | 'introducing' | 'listening' | 'processing' | 'acting' | 'speaking' | 'muted' | 'reconnecting' | 'error' | 'ended';
export type EdenLiveFailure = 'none' | 'unexpected' | 'permission-pending' | 'microphone-denied' | 'microphone-init' | 'microphone-timeout' | 'microphone-stream' | 'microphone-state' | 'audio-output-init' | 'audio-output-timeout' | 'audio-output-state' | 'token-request' | 'token-invalid' | 'socket-setup' | 'socket-close' | 'socket-error' | 'invalid-message' | 'provider-error' | 'application-handler' | 'recovery-unavailable' | 'public-context' | 'tool-invalid' | 'tool-conflict' | 'tool-limit' | 'tool-response' | 'response-timeout' | 'turn-timeout' | 'audio-format' | 'audio-missing' | 'player-drain';
export type EdenLiveServiceCategory = LiveProviderCategory | 'local-limit' | 'access' | 'resolver-limit' | 'application';
const SERVICE_CATEGORIES:EdenLiveServiceCategory[]=['none','rate-limit-or-quota','overload','authentication','invalid-request','provider-other','local-limit','access','resolver-limit','application'];
const SERVICE_CODES=['EDEN_USAGE_LIMIT','EDEN_SESSION_LIMIT','EDEN_BUSY','EDEN_PROVIDER_QUOTA','EDEN_PROVIDER_UNAVAILABLE','EDEN_LIVE_USAGE_LIMIT','EDEN_LIVE_CALL_ACTIVE','EDEN_LIVE_CAPACITY','EDEN_LIVE_SETUP_EXPIRED','EDEN_LIVE_START_THROTTLED','EDEN_LIVE_TEAM_START_LIMIT','EDEN_LIVE_TESTER_START_LIMIT','EDEN_LIVE_PROVIDER_BUDGET','EDEN_LIVE_TESTER_MINT_LIMIT','EDEN_LIVE_POLICY_UNAVAILABLE','EDEN_LIVE_CALL_EXPIRED','EDEN_LIVE_SESSION_EXPIRING','EDEN_LIVE_PROVIDER_QUOTA','EDEN_LIVE_PROVIDER_UNAVAILABLE','EDEN_LIVE_DISABLED','EDEN_LIVE_CANCELLED','EDEN_LIVE_INVALID_TOKEN','EDEN_LIVE_RESUME_DENIED','EDEN_LIVE_TOOL_EXPIRED','EDEN_LIVE_TOOL_LIMIT','EDEN_SESSION_REQUIRED','EDEN_REVIEWER_REQUIRED','EDEN_NOTICE_REQUIRED','EDEN_DISABLED','EDEN_UNAVAILABLE','EDEN_AGENT_UNAVAILABLE','RATE_LIMITED'];
/** Only validated fixed API categories/codes cross the UI/service boundary. */
export class EdenLiveServiceError extends Error {
  category:EdenLiveServiceCategory;status?:number;code:string;retryAfterSeconds?:number;
  constructor(category:EdenLiveServiceCategory,status?:number,code?:string,retryAfter?:number){super('The call service is unavailable.');if(Number.isSafeInteger(retryAfter)&&Number(retryAfter)>0&&Number(retryAfter)<=86460)this.retryAfterSeconds=retryAfter;this.category=SERVICE_CATEGORIES.includes(category)?category:'application';if(Number.isInteger(status)&&Number(status)>=400&&Number(status)<=599)this.status=status;this.code=typeof code==='string'&&SERVICE_CODES.includes(code)?code:'unknown';}
}
const captureCounters=()=>({workletFrames:0,signalFrames:0,peakRms:0,encoded:0,dropped:0,sentWithSignal:0,firstFrameMs:-1,lastFrameMs:-1,firstSentMs:-1,lastSentMs:-1,serverStarts:0,serverEnds:0,inputCaptions:0,interimCaptions:0,outputCaptions:0,serverInterruptions:0,suppressedAudio:0});
type LiveEvent='phase'|'token'|'setup'|'generation-complete'|'turn-complete'|'waiting-for-input'|'playback-start'|'playback-end'|'tool-start'|'tool-complete'|'tool-failed'|'tool-timeout'|'input-state'|'output-state'|'go-away'|'resume-handle'|'recovering'|'closed'|'ended'|'audio';
type LiveTimelineEvent={elapsedMs:number;connection:number;turn:number;phase:EdenLivePhase;event:LiveEvent};
type ToolHandoff = {ordinal:number;name:SharedLiveToolCall['name'];receivedAt:number;actionCompletedAt?:number;queueAcceptedAt?:number;sendRejectedAt?:number;providerEventAt?:number;captionAt?:number;audioAt?:number;turnCompletedAt?:number;cancelledAt?:number};
type ToolEntry = {signature:string;response?:Record<string,unknown>;sentEpoch?:number;cancelled:boolean;abort:AbortController;handoff:ToolHandoff};
type ToolField = 'id' | 'name' | 'args' | 'partialArgs' | 'willContinue';
type ToolArgField = 'type' | 'category' | 'city' | 'radius' | 'index' | 'page' | 'missing' | 'cityId' | 'area';
type ShapeType = 'absent' | 'null' | 'object' | 'array' | 'string' | 'number' | 'boolean' | 'other';
export type EdenLiveToolShape = {status: 'invalid-call' | 'missing-id' | 'invalid-id' | 'unrecognized-name' | 'extra-fields' | 'args-not-object' | 'args-invalid'; knownFields: ToolField[]; unknownKeyCount: number; name: EdenLiveToolCall['name'] | 'unrecognized'; idType: ShapeType; idLength: number; idRegexValid: boolean; argsType: ShapeType; argFields: ToolArgField[]; unknownArgKeyCount: number; partialArgsPresent: boolean; partialArgsCount: number; willContinue: 'absent' | 'true' | 'false' | 'invalid'};
export type EdenLiveDiagnostic = {capture:ReturnType<typeof captureCounters>;device?:CaptureInfo;replies:ReturnType<typeof summarizeReply>[];failure: EdenLiveFailure; preparation: 'not-started' | LiveMicrophonePreparation | 'audio-output-pending'; lastEvent: 'none' | 'preparing' | 'token' | 'setup' | 'message' | 'audio' | 'generation-complete' | 'turn-complete' | 'waiting-for-input' | 'tool' | 'closed' | 'recovering'; connections: number; messages: number; audioChunks: number; generationComplete: number; turnComplete: number; toolCalls: number; toolCallsReceived: number; rejectedArguments: number; inputChunks: number; recoveries: number; closeCode?: number; closeReason?:LiveTransportClose['closeReason']; setupComplete?:boolean; spokenInterruptions?:number; unansweredTurns?:number; inputStreamEnds?:number; failurePhase?:EdenLivePhase; retryAfterSeconds?:number; toolShape?: EdenLiveToolShape;callRef:string;model:typeof import('../../../shared/eden-live.ts').EDEN_LIVE_MODEL;connectionGeneration:number;startedAt:number;appDeadline:number;tokenExpiresAt:number;inputContext:LiveAudioContextState;outputContext:LiveAudioContextState;toolsStarted:number;toolsCompleted:number;toolsFailed:number;pendingTools:number;waitingForInput:number;playbackStarts:number;playbackEnds:number;decodedChunks:number;resumable:boolean;goAwaySeconds?:number;providerCategory:LiveProviderCategory;providerStatus?:number;serviceCategory?:EdenLiveServiceCategory;serviceStatus?:number;serviceCode?:string;endReason?:'user'|'hidden'|'app-expiry'|'turn-limit';timeline:LiveTimelineEvent[];toolHandoffs:ToolHandoff[]};
export type EdenLiveSnapshot = {phase: EdenLivePhase; microphoneActive: boolean; forwarding: boolean; microphoneForwarding: boolean; microphoneMuted: boolean; speakerMuted: boolean; reason?: string; diagnostic?: EdenLiveDiagnostic};
export type EdenLiveTranscript = {role: 'user' | 'assistant'; text: string; final: boolean; turnId: string};
export type EdenLiveToolCall = SharedLiveToolCall;
export type EdenLiveTokenRequest = {nonce: string; context: EdenLiveContext; callId?: string; resumeHandle?: string};
export type EdenLiveOptions = {
  allowSpokenInterruption?:boolean;
  getToken(request: EdenLiveTokenRequest, signal: AbortSignal): Promise<EdenLiveTokenResponse>;
  confirmSetup?(callId:string,signal:AbortSignal):Promise<void>;
  releaseToken?(callId: string): void | Promise<void>;
  getContext(): EdenLiveContext;
  getPendingTask?(): unknown;
  onToolCall(call: EdenLiveToolCall, signal: AbortSignal): Promise<Record<string, unknown>>;
  onState(snapshot: EdenLiveSnapshot): void;
  onUnplayedCaption?(text:string):void;
  onTranscript(transcript: EdenLiveTranscript): void;
  onAudioLevel(level: number): void;
  onInputSent?():void;
  onInputLevel?(level: number): void;
};
export type EdenLiveDependencies = {
  output(onLevel: (level: number) => void, onActivity: (active: boolean) => void,onContextState?:(state:LiveAudioContextState)=>void): LiveOutput;
  microphone(onFrame: (frame: Float32Array, sampleRate: number) => void, onFailure: () => void,onContextState?:(state:LiveAudioContextState)=>void): LiveMicrophone;
  connect(token: EdenLiveTokenResponse, callbacks: LiveConnectionCallbacks, signal: AbortSignal): Promise<LiveConnection>;
  document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  now(): number;
  cooldownMs: number;
  preparationTimeoutMs: number;
};
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function nonce() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
const SAFE_FAILURE = 'Voice could not continue. You can use text if available, or continue with the page controls.';
class LivePreparationFailure extends Error {
  failure: EdenLiveFailure;
  constructor(failure: EdenLiveFailure) { super('Call preparation unavailable.'); this.failure = failure; }
}
let callSequence=0;
const freshDiagnostic = (): EdenLiveDiagnostic => ({capture:captureCounters(),replies:[],failure:'none',preparation:'not-started',lastEvent:'none',connections:0,messages:0,audioChunks:0,generationComplete:0,turnComplete:0,toolCalls:0,toolCallsReceived:0,rejectedArguments:0,inputChunks:0,recoveries:0,callRef:'',model:'gemini-3.8-live',connectionGeneration:0,startedAt:0,appDeadline:0,tokenExpiresAt:0,inputContext:'uninitialized',outputContext:'uninitialized',toolsStarted:0,toolsCompleted:0,toolsFailed:0,pendingTools:0,waitingForInput:0,playbackStarts:0,playbackEnds:0,decodedChunks:0,resumable:false,providerCategory:'none',timeline:[],toolHandoffs:[]});
const LOCAL_SPEECH_ONSET_MS = 160, LOCAL_SPEECH_GAP_MS = 80;
const ARGUMENT_GUIDANCE: Record<EdenLiveToolCall['name'],string> = {
  read_public_page_context: 'Use an empty args object. No fields are accepted.',
  perform_public_resource_action: 'Use a declared type and its required fields: search needs category, city, radius; radius needs radius; refine needs category; details/select/read-hours need index; help/navigate-support/read-results/clear-filters/read-page need only type; navigate-public needs page, which must be one of '+EDEN_PUBLIC_DESTINATIONS.join(', ')+'. Use only declared enums and fields.',
  ask_clarification: "Use missing='city' with category, missing='category' with cityId, or missing='city-and-category' with area='pennsylvania'. Use only declared enums and matching fields. Do not include goal.",
};
/** Diagnostics expose only fixed field-name/shape enums, never provider values. */
function rejectedToolShape(value: unknown): EdenLiveToolShape {
  const fields: ToolField[] = ['id','name','args','partialArgs','willContinue'], argsFields: ToolArgField[] = ['type','category','city','radius','index','page','missing','cityId','area'];
  const type = (item: unknown): ShapeType => item === undefined ? 'absent' : item === null ? 'null' : Array.isArray(item) ? 'array' : ['string','number','boolean','object'].includes(typeof item) ? typeof item as ShapeType : 'other';
  const fallback: EdenLiveToolShape = {status:'invalid-call',knownFields:[],unknownKeyCount:0,name:'unrecognized',idType:'absent',idLength:0,idRegexValid:false,argsType:'absent',argFields:[],unknownArgKeyCount:0,partialArgsPresent:false,partialArgsCount:0,willContinue:'absent'};
  try {
    const raw = record(value); if (!raw) return fallback;
    const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Object.keys(descriptors), own = (key: string): unknown => descriptors[key] && 'value' in descriptors[key] ? descriptors[key].value : undefined;
    const id = own('id'), name = own('name'), args = own('args'), partial = own('partialArgs'), willContinue = own('willContinue');
    const argKeys = args && type(args) === 'object' ? Object.keys(Object.getOwnPropertyDescriptors(args)) : [];
    const knownName = ['read_public_page_context','perform_public_resource_action','ask_clarification'].includes(name as string) ? name as EdenLiveToolCall['name'] : 'unrecognized';
    const idRegexValid = typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id), extra = keys.some(key => !['id','name','args'].includes(key));
    return {status: !keys.includes('id') ? 'missing-id' : !idRegexValid ? 'invalid-id' : knownName === 'unrecognized' ? 'unrecognized-name' : extra ? 'extra-fields' : type(args) !== 'object' ? 'args-not-object' : 'args-invalid',knownFields:fields.filter(key=>keys.includes(key)),unknownKeyCount:Math.min(1000,keys.filter(key=>!fields.includes(key as ToolField)).length),name:knownName,idType:type(id),idLength:typeof id==='string'?Math.min(8193,id.length):0,idRegexValid,argsType:type(args),argFields:argsFields.filter(key=>argKeys.includes(key)),unknownArgKeyCount:Math.min(1000,argKeys.filter(key=>!argsFields.includes(key as ToolArgField)).length),partialArgsPresent:keys.includes('partialArgs'),partialArgsCount:Array.isArray(partial)?Math.min(1000,partial.length):0,willContinue:!keys.includes('willContinue')?'absent':willContinue===true?'true':willContinue===false?'false':'invalid'};
  } catch { return fallback; }
}

/** Explicit-consent, bounded half-duplex call; no recording or persistent history. */
export function createEdenLiveSession(options: EdenLiveOptions, injected: Partial<EdenLiveDependencies> = {}) {
  const deps: EdenLiveDependencies = {output: (level, activity, state) => new LivePcmOutput(level, activity,undefined,state), microphone: (frame, failure, state) => new BrowserLiveMicrophone(frame, failure,state), connect: connectEdenLive, document, now: Date.now, cooldownMs: 280, preparationTimeoutMs:45_000, ...injected};
  let phase: EdenLivePhase = 'idle', micMuted = false, speakerMuted = false, reason: string | undefined, disposed = false;
  let abort: AbortController | undefined, connectionAbort: AbortController | undefined, connection: LiveConnection | undefined;
  let output: LiveOutput | undefined, microphone: LiveMicrophone | undefined, token: EdenLiveTokenResponse | undefined;
  let generation = 0, connectionEpoch = 0, turn = 0, turns = 0, deadline = 0, recoveries = 0;
  let introPlayed = false, introducing = false, complete = false, discardOutput = false, receivedAudio = false, drainGeneration = 0, pendingTools = 0;
  let consecutiveMisses=0,toolsAtTurnStart=0;
  let resumeHandle: string | undefined, pendingResumeHandle: string | undefined, voiceMs = 0, silenceMs = 0, userActive = false;
  let onsetVoicedMs = 0, onsetGapMs = 0;
  let previousOutputSettled=false,responseBegun=false,interruptedTurnEnding=false,playbackActive=false;
  let inputText = '', outputText = '';
  let reply=newReply(0), replyHistory=[reply], silentTimer:ReturnType<typeof setTimeout>|undefined;
  function nextReply(){cancelTimer(silentTimer);silentTimer=undefined;reply=newReply(turn);replyHistory.push(reply);if(replyHistory.length>6)replyHistory.shift();}
  function missingVoice(){
    if(outputText.trim())options.onUnplayedCaption?.(outputText);
    fail(outputText.trim()?'Google returned a caption but too little audio to play this reply. You can start a new call or continue by text.':'Google did not return audible speech for this reply. You can start a new call or continue by text.','audio-missing');
  }
  function checkSilent(ms:number){
    if(!options.allowSpokenInterruption||!reply.caption||usableReply(reply)||pendingTools||interruptedTurnEnding||discardOutput||complete)return;
    const target=reply;
    if(silentTimer!==undefined&&ms!==3500)return;
    cancelTimer(silentTimer);silentTimer=timer(()=>{silentTimer=undefined;if(active()&&target===reply&&!usableReply(target)&&!pendingTools&&!complete&&!discardOutput&&!interruptedTurnEnding)missingVoice();},ms);
  }
  let timers = new Set<ReturnType<typeof setTimeout>>(), responseTimer: ReturnType<typeof setTimeout> | undefined;
  let seenMessages = new WeakSet<object>();
  let diagnostic = freshDiagnostic();
  const encoder = new LiveMicrophoneEncoder();
  const ledger = new Map<string, ToolEntry>();
  let actionQueue = Promise.resolve();
  const active = () => Boolean(abort && !abort.signal.aborted && !disposed);
  // A network gap between adjacent PCM packets must not discard the middle of
  // a visitor's word. Keep capture open throughout an audible response.
  const duringPlayback=()=>options.allowSpokenInterruption===true&&(phase==='speaking'||phase==='introducing')&&diagnostic.playbackStarts>0;
  // Once setup succeeds, continuous mode supplies the input clock even before
  // the first speaker animation. Mute, visibility and tool admission still apply.
  const forwarding = () => active() && (phase === 'listening'||duringPlayback()||(options.allowSpokenInterruption===true&&((phase==='introducing'&&diagnostic.setupComplete)||(phase==='processing'&&introPlayed)))) && !micMuted && Boolean(microphone?.active) && !deps.document.hidden && pendingTools === 0;
  const snapshot = (): EdenLiveSnapshot => ({phase, microphoneActive: Boolean(microphone?.active), forwarding: forwarding(), microphoneForwarding: forwarding(), microphoneMuted: micMuted, speakerMuted, ...(reason ? {reason} : {}), diagnostic:{...diagnostic,device:microphone?.info??diagnostic.device,capture:{...diagnostic.capture},replies:replyHistory.map(summarizeReply),pendingTools,resumable:Boolean(resumeHandle),timeline:diagnostic.timeline.map(item=>({...item})),toolHandoffs:diagnostic.toolHandoffs.map(item=>({...item}))}});
  const publish = () => { microphone?.setForwarding?.(forwarding()); if (!disposed) options.onState(snapshot()); };
  function trace(event:LiveEvent){diagnostic.timeline.push({elapsedMs:Math.max(0,Math.round(deps.now()-diagnostic.startedAt)),connection:connectionEpoch,turn,phase,event});if(diagnostic.timeline.length>32)diagnostic.timeline.shift();}
  const setPhase = (value: EdenLivePhase, message?: string) => { phase = value; reason = message;trace('phase'); if (value !== 'listening') { onsetVoicedMs = 0; onsetGapMs = 0; encoder.clear(); options.onInputLevel?.(0); } publish(); };
  function serviceFailure(error:unknown){if(error instanceof EdenLiveServiceError){diagnostic.serviceCategory=SERVICE_CATEGORIES.includes(error.category)?error.category:'application';diagnostic.serviceCode=SERVICE_CODES.includes(error.code)?error.code:'unknown';if(Number.isInteger(error.status)&&Number(error.status)>=400&&Number(error.status)<=599)diagnostic.serviceStatus=error.status;diagnostic.retryAfterSeconds=error.retryAfterSeconds;}}
  function contextState(which:'input'|'output',state:LiveAudioContextState){if(!active())return;if(which==='input')diagnostic.inputContext=state;else diagnostic.outputContext=state;trace(which==='input'?'input-state':'output-state');if(state!=='running'&&diagnostic.preparation==='ready'){fail('Your browser paused call audio. You can start a new call or continue by text.',which==='input'?'microphone-state':'audio-output-state');}else publish();}
  function timer(fn: () => void, ms: number) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function cancelTimer(id?: ReturnType<typeof setTimeout>) { if (id !== undefined) { clearTimeout(id); timers.delete(id); } }
  function clearResponseTimer() { cancelTimer(responseTimer); responseTimer = undefined; }
  function expectResponse(epoch = generation) {
    clearResponseTimer();
    responseTimer=timer(()=>{
      if(!active()||epoch!==generation)return;
      // One unanswered utterance is not a dead socket. Never replay its
      // microphone input or repeat a tool. The visitor can speak again.
      if(options.allowSpokenInterruption&&introPlayed&&!pendingTools&&!receivedAudio&&toolsAtTurnStart===diagnostic.toolsStarted&&consecutiveMisses===0){
        consecutiveMisses++;diagnostic.unansweredTurns=(diagnostic.unansweredTurns??0)+1;
        listening();setPhase(micMuted?'muted':'listening','No answer came back for that turn. You can continue speaking or use text.');return;
      }
      fail('Eden did not receive playable voice in time. You can continue by text.','response-timeout');
    },25_000);
  }
  function endInputStream(){if(send({realtimeInput:{audioStreamEnd:true}}))diagnostic.inputStreamEnds=(diagnostic.inputStreamEnds??0)+1;}

  function cleanup() {
    if(microphone?.info)diagnostic.device=microphone.info;silentTimer=undefined;interruptedTurnEnding=false;playbackActive=false;generation++; connectionEpoch++; drainGeneration++; abort?.abort(); abort = undefined; connectionAbort?.abort(); connectionAbort = undefined;
    for (const id of timers) clearTimeout(id); timers.clear(); responseTimer = undefined;
    microphone?.stop(); microphone = undefined; connection?.close(); connection = undefined; output?.close(); output = undefined;
    encoder.clear(); onsetVoicedMs = 0; onsetGapMs = 0; ledger.clear(); pendingTools = 0; actionQueue = Promise.resolve(); resumeHandle = undefined; pendingResumeHandle = undefined;
    deps.document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide);
    const callId = token?.callId; token = undefined; inputText = ''; outputText = ''; options.onAudioLevel(0); options.onInputLevel?.(0);
    if (callId) { try { void Promise.resolve(options.releaseToken?.(callId)).catch(() => {}); } catch { /* Local lease also expires independently. */ } }
  }
  function fail(message = SAFE_FAILURE, failure: EdenLiveFailure = 'unexpected', next: 'error' | 'permission-required' = 'error') {
    if (!active()) return;
    if(message===SAFE_FAILURE){
      const category=diagnostic.serviceCategory??diagnostic.providerCategory;
      if(diagnostic.serviceCode==='EDEN_LIVE_CALL_ACTIVE')message='Another call is active for this visitor. End that call before starting a new one.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_CAPACITY')message='The protected call slots are reserved. Try again in '+Math.ceil((diagnostic.retryAfterSeconds??600)/60)+' min, or continue by text.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_TESTER_START_LIMIT')message='Your tester browser has used or reserved its daily call starts. Pending starts expire shortly; completed starts reset at 00:00 UTC. Text is still available.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_TEAM_START_LIMIT')message='The staging team has used or reserved its daily call starts. Pending starts expire shortly; completed starts reset at 00:00 UTC. Text is still available.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_PROVIDER_BUDGET'||diagnostic.serviceCode==='EDEN_LIVE_TESTER_MINT_LIMIT')message='Our Ground’s daily voice testing budget has been reached. It resets at 00:00 UTC. You can continue by text.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_START_THROTTLED')message='Too many call starts in a short time. Wait a minute before trying again.';
      else if(diagnostic.serviceCode==='EDEN_LIVE_SETUP_EXPIRED')message='Call setup expired before it could be confirmed. Start a new call here or use text.';
      else if(category==='rate-limit-or-quota')message='Google’s voice service reached a rate or usage limit. Wait before trying again, or use text if available.';
      else if(category==='overload')message='Google’s voice service is temporarily busy. Try again later, or use text if available.';
      else if(category==='local-limit')message='Voice calls have reached their current usage limit. Continue with the page controls or text if available.';
      else if(category==='access'||category==='authentication')message='Voice access expired or could not be confirmed. Review the current session notice to continue.';
    }
    if(message===SAFE_FAILURE&&['socket-close','socket-error','socket-setup'].includes(failure))message=diagnostic.setupComplete?'The voice connection closed. You can start a new call here or continue by text.':'The voice connection did not finish setup. You can start a new call here or continue by text.';
    diagnostic.failurePhase=phase;diagnostic.failure = failure; cleanup(); setPhase(next, message);
  }
  function end(message?: string,endReason:NonNullable<EdenLiveDiagnostic['endReason']>='user') {diagnostic.endReason=endReason;trace('ended'); cleanup(); setPhase('ended', message); }
  function visibility() { if (deps.document.hidden && active()) end('Call ended when this tab became inactive.','hidden'); }
  function pagehide() { end(); }
  function send(value: unknown) { if (!active() || !connection) throw new Error('Call ended.'); return connection.send(value)!==false; }
  function pendingTask() {
    const value = options.getPendingTask?.();
    if (value === undefined) return undefined;
    const pending = validateEdenAgentIntent(value);
    if (pending?.goal !== 'clarify-search') throw new LivePreparationFailure('public-context');
    return pending;
  }
  function publicHistoryParts() {
    const context = validateEdenLiveContext(options.getContext()); if (!context) throw new Error('Public page context unavailable.');
    const pending = pendingTask();
    return [{text:'[Verified public page state]\n' + JSON.stringify(edenLiveModelContext(context))},...(pending ? [{text:'[Pending public resource task]\n' + JSON.stringify(pending)}] : [])];
  }
  function seedInitialHistory() {
    // Gemini 3.8 history mode consumes this terminal message without model
    // generation. setupComplete is the only setup acknowledgement; the next
    // ordered frame starts the introduction through realtimeInput.
    send({clientContent:{turns:[{role:'user',parts:publicHistoryParts()}],turnComplete:true}});
  }
  function transcript(role: 'user' | 'assistant', text: unknown, final: boolean) {
    if (typeof text !== 'string' || !text || !active()) return;
    if (role === 'user') inputText = (inputText + text).slice(0, 4000); else outputText = (outputText + text).slice(0, 4000);
    options.onTranscript({role, text: role === 'user' ? inputText : outputText, final, turnId: `${token?.callId ?? 'live'}:${turn}`});
  }
  function closeUserTurn() {
    if (!forwarding()) return;
    userActive = false; encoder.clear(); setPhase('processing');
    // In a continuous call server VAD owns the turn boundary. A speaker
    // pausing is not a microphone stream ending.
    try { if(!options.allowSpokenInterruption)endInputStream(); expectResponse(); } catch { fail(SAFE_FAILURE,'microphone-stream'); }
  }
  function startUserTurn() {
    if (userActive) return true;
    if (++turns > 24 || deps.now() >= deadline) { end('This call reached its time or turn limit. Text is still available.','turn-limit'); return false; }
    toolsAtTurnStart=diagnostic.toolsStarted;turn++;nextReply(); inputText = ''; outputText = ''; receivedAudio = false; complete = false; discardOutput = false; resumeHandle = undefined; pendingResumeHandle = undefined; onsetVoicedMs = 0; onsetGapMs = 0; userActive = true;responseBegun=false;
    return true;
  }
  function microphoneFrame(frame: Float32Array, rate: number) {
    if (!forwarding()) { onsetVoicedMs = 0; onsetGapMs = 0; encoder.clear(); options.onInputLevel?.(0); return; }
    try {
      const duration = frame.length / rate * 1000, rms = Math.sqrt(frame.reduce((sum, value) => sum + value * value, 0) / Math.max(1, frame.length));
      const cap=diagnostic.capture,ms=Math.max(0,deps.now()-diagnostic.startedAt);cap.workletFrames++;cap.lastFrameMs=ms;if(cap.firstFrameMs<0)cap.firstFrameMs=ms;
      if(Number.isFinite(rms)){cap.peakRms=Math.max(cap.peakRms,rms);if(rms>.015)cap.signalFrames++;}
      options.onInputLevel?.(Number.isFinite(rms) ? Math.min(1,rms * 4) : 0);
      if (rms > .015 && (userActive||phase==='listening')) {
        if (userActive) { voiceMs += duration; silenceMs = 0; }
        else {
          // A click/noise frame is not a confirmed request. Keep forwarding
          // every PCM frame for Google's VAD, but do not arm a local response
          // watchdog until voicing persists across a short onset window.
          resumeHandle = undefined; pendingResumeHandle = undefined;
          onsetVoicedMs += duration; onsetGapMs = 0;
          if (onsetVoicedMs >= LOCAL_SPEECH_ONSET_MS) {
            const voiced = onsetVoicedMs;
            // Never stop or discard a reply on local RMS alone. A loudspeaker,
            // room noise or echo can cross this threshold on a physical Mac.
            if (!startUserTurn()) return;
            voiceMs = voiced; silenceMs = 0;
          }
        }
      } else if (userActive) silenceMs += duration;
      else if (onsetVoicedMs > 0 && (onsetGapMs += duration) >= LOCAL_SPEECH_GAP_MS) { onsetVoicedMs = 0; onsetGapMs = 0; }
      const packetRms:number[]=[];
      for (const data of encoder.encode(frame, rate,(chunkRms)=>{packetRms.push(chunkRms);})) {
        cap.encoded++;const signal=(packetRms.shift()??0)>.015;
        if(send({realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}})){diagnostic.inputChunks++;options.onInputSent?.();if(signal)cap.sentWithSignal++;cap.lastSentMs=ms;if(cap.firstSentMs<0){cap.firstSentMs=ms;publish();}}
        else cap.dropped++;
      }
      if (userActive && (silenceMs >= 900 || voiceMs >= 30_000)) closeUserTurn();
    } catch { fail('The microphone stream could not continue. You can continue by text.','microphone-stream'); }
  }
  function listening() {
    if (!active()) return;
    if (deps.now() >= deadline) { end('This call reached its time limit. Text is still available.'); return; }
    discardOutput = false; voiceMs = 0; silenceMs = 0; onsetVoicedMs = 0; onsetGapMs = 0; userActive = false; encoder.clear();
    // Current page state comes from fresh, server-reconciled tool responses.
    // Do not interleave unfinished clientContent with the realtime audio stream.
    try { publicHistoryParts(); setPhase(micMuted ? 'muted' : 'listening'); } catch { fail(SAFE_FAILURE,'public-context'); }
  }
  async function finishOutput() {
    if (!active() || !complete || pendingTools) return;
    if(options.allowSpokenInterruption&&!discardOutput&&(reply.caption||reply.chunks>0)&&!usableReply(reply)){missingVoice();return;}
    if (!receivedAudio && !discardOutput) { fail('Eden did not receive playable voice audio. You can continue by text.','audio-missing'); return; }
    const epoch = generation, revision = ++drainGeneration, currentOutput = output, signal = abort!.signal;
    try {
      await currentOutput?.drain(signal);
      if (!active() || epoch !== generation || revision !== drainGeneration || !complete || pendingTools) return;
      if(options.allowSpokenInterruption&&usableReply(reply)&&reply.scheduled>0&&!speakerMuted&&!discardOutput&&reply.graphPeakRms<=.001){
        if(outputText.trim())options.onUnplayedCaption?.(outputText);
        fail('Google sent voice audio, but the browser output did not register playback. Check your audio output, then start a new call or use text.','player-drain');return;
      }
      if (introducing) { introducing = false; introPlayed = true; }
      previousOutputSettled=true;
      // Retain an early provider-issued handle, but it becomes eligible only
      // after this output turn and the real player have both completed.
      resumeHandle = pendingResumeHandle;
      clearResponseTimer();
      timer(() => { if (active() && epoch === generation && revision === drainGeneration && complete && !pendingTools) listening(); }, deps.cooldownMs);
    } catch { if (active() && epoch === generation && revision === drainGeneration) fail('Voice playback could not finish. Text is still available.','player-drain'); }
  }
  function beginResponse() {
    // A real provider response can identify quiet speech below local VAD's
    // threshold. A late caption alone must never create a new interaction.
    if (phase === 'listening' && !userActive && !startUserTurn()) return;
    consecutiveMisses=0;responseBegun=true;previousOutputSettled=false;
    if (phase === 'listening' || phase === 'muted') { encoder.clear(); try { if(!options.allowSpokenInterruption)endInputStream(); } catch { fail(SAFE_FAILURE,'microphone-stream'); return; } setPhase('processing'); }
    resumeHandle = undefined; userActive = false;
  }
  function argumentFeedback(value: unknown, shape: EdenLiveToolShape): boolean {
    if (shape.status !== 'args-invalid' || shape.name === 'unrecognized' || shape.unknownKeyCount || shape.knownFields.length !== 3 || !['id','name','args'].every(key=>shape.knownFields.includes(key as ToolField))) return false;
    const raw = record(value), descriptors = raw && Object.getOwnPropertyDescriptors(raw);
    if (!raw || !descriptors || ![Object.prototype,null].includes(Object.getPrototypeOf(raw)) || Reflect.ownKeys(raw).length !== 3 || !Object.values(descriptors).every(item=>'value' in item)) return false;
    const id = descriptors.id.value as string, name = descriptors.name.value as EdenLiveToolCall['name'], args = record(descriptors.args.value);
    if (!args || ![Object.prototype,null].includes(Object.getPrototypeOf(args))) return false;
    const fields = Object.getOwnPropertyDescriptors(args);
    // Tool schemas are flat. Do not retain or traverse unknown nested payloads.
    if (Reflect.ownKeys(args).length > 12 || Reflect.ownKeys(args).some(key=>typeof key!=='string'||key.length>64) || !Object.values(fields).every(item=>'value'in item&&(item.value===null||typeof item.value==='boolean'||typeof item.value==='number'&&Number.isFinite(item.value)||typeof item.value==='string'&&item.value.length<=256))) return false;
    const signature = JSON.stringify({name,args:Object.fromEntries(Object.entries(args).sort())}), old = ledger.get(id);
    if (old) {
      if (old.signature !== signature) { fail(SAFE_FAILURE,'tool-conflict'); return true; }
      if (old.response && !old.cancelled && old.sentEpoch !== connectionEpoch) sendToolResponse(id,name,old);
      return true;
    }
    if (diagnostic.rejectedArguments >= 2 || ledger.size >= 64 || introducing || discardOutput) return false;
    const response = {ok:false,error:{code:'EDEN_LIVE_ARGUMENTS_INVALID',instruction:ARGUMENT_GUIDANCE[name]},message:'Nothing changed. Correct the arguments using the declared schema and retry with a new function-call ID.'};
    const entry=toolEntry(signature,name);entry.response=response;ledger.set(id,entry);
    diagnostic.rejectedArguments++; diagnostic.lastEvent='tool'; resumeHandle=undefined; pendingResumeHandle=undefined;
    beginResponse(); if (!active()) return true;
    complete=false;receivedAudio=false;drainGeneration++;
    if(sendToolResponse(id,name,entry)){setPhase(pendingTools?'acting':'processing');expectResponse();}
    return true;
  }
  function toolEntry(signature:string, name:EdenLiveToolCall['name']):ToolEntry {
    const handoff:ToolHandoff={ordinal:diagnostic.toolCallsReceived,name,receivedAt:elapsed()};
    diagnostic.toolHandoffs.push(handoff);
    if(diagnostic.toolHandoffs.length>8)diagnostic.toolHandoffs.shift();
    return {signature,cancelled:false,abort:new AbortController(),handoff};
  }
  function elapsed(){return Math.max(0,Math.round(deps.now()-diagnostic.startedAt));}
  function sendToolResponse(id:string,name:EdenLiveToolCall['name'],entry:ToolEntry){
    if(entry.cancelled||!entry.response)return false;
    // The wrapper acknowledges local queue acceptance. Provider progress is
    // measured separately when subsequent inbound events arrive.
    if(!send({toolResponse:{functionResponses:[{id,name,response:entry.response}]}})){
      entry.handoff.sendRejectedAt=elapsed();
      fail('The page action finished, but its result could not be sent to the voice connection. You can continue by text.','tool-response');
      return false;
    }
    entry.sentEpoch=connectionEpoch;
    entry.handoff.queueAcceptedAt=elapsed();
    return true;
  }
  async function runTool(call:EdenLiveToolCall,entry:{abort:AbortController}):Promise<Record<string,unknown>>{
    const signal=AbortSignal.any([abort!.signal,entry.abort.signal]);let actionTimer:ReturnType<typeof setTimeout>|undefined,done=false;
    let removeAbort=()=>{};
    const failed={ok:false,message:'The public page action could not be completed.'};
    try{
      return await Promise.race([
        Promise.resolve().then(()=>{signal.throwIfAborted();return options.onToolCall(call,signal);}).catch(error=>{if(!done)serviceFailure(error);return failed;}),
        new Promise<Record<string,unknown>>(resolve=>{actionTimer=timer(()=>{trace('tool-timeout');resolve({ok:false,error:{code:'EDEN_LIVE_TOOL_TIMEOUT'}});entry.abort.abort();},20_000);}),
        new Promise<Record<string,unknown>>(resolve=>{const cancel=()=>resolve(failed);signal.addEventListener('abort',cancel,{once:true});removeAbort=()=>signal.removeEventListener('abort',cancel);if(signal.aborted)cancel();}),
      ]);
    }finally{done=true;cancelTimer(actionTimer);removeAbort();}
  }
  function cancelledToolSettled(){
    if(pendingTools)return;
    setPhase(playbackActive?'speaking':'processing');
    expectResponse();
    if(receivedAudio||outputText||reply.caption||reply.chunks>0){
      if(complete)void finishOutput();
      return;
    }
    // Cancellation can leave no replacement output. Await the provider's idle
    // signal with a watchdog, without sending the abandoned tool's late result.
    complete=false;previousOutputSettled=true;responseBegun=false;
  }
  function toolCall(value: unknown, epoch: number) {
    if (!active() || epoch !== generation) return;
    diagnostic.toolCallsReceived++;
    const call = normalizeEdenLiveWireToolCall(value);
    if (!call) {
      diagnostic.toolShape = rejectedToolShape(value);
      if (argumentFeedback(value,diagnostic.toolShape)) return;
      fail('The call received an unsupported action. Text is still available.','tool-invalid'); return;
    }
    const signature = JSON.stringify({name: call.name, args: Object.fromEntries(Object.entries(call.args).sort())});
    const old = ledger.get(call.id);
    if (old) {
      if (old.signature !== signature) { fail(SAFE_FAILURE,'tool-conflict'); return; }
      if (old.response && !old.cancelled && old.sentEpoch !== connectionEpoch) sendToolResponse(call.id,call.name,old);
      return;
    }
    if (ledger.size >= 64 || introducing || discardOutput) { fail('The call received an unsupported action. Text is still available.','tool-limit'); return; }
    diagnostic.toolCalls++; diagnostic.lastEvent = 'tool';
    const entry=toolEntry(signature,call.name);ledger.set(call.id,entry);
    resumeHandle = undefined; pendingResumeHandle = undefined;
    // A blocking call already owns the provider's turn. Pause capture without
    // injecting another realtime turn boundary while the tool is outstanding.
    pendingTools++; complete = false; drainGeneration++; beginResponse(); setPhase('acting'); clearResponseTimer();
    actionQueue = actionQueue.then(async () => {
      if (!active() || epoch !== generation) return;
      if (entry.cancelled) { pendingTools--;cancelledToolSettled();return; }
      diagnostic.toolsStarted++;trace('tool-start');
      const response=await runTool(call,entry);
      if (!active() || epoch !== generation) return;
      pendingTools--;
      if (entry.cancelled) { cancelledToolSettled();return; }
      if(response.ok===false||response.outcome==='failed'){diagnostic.toolsFailed++;trace('tool-failed');}else{diagnostic.toolsCompleted++;trace('tool-complete');}
      if (JSON.stringify(response).length > 16_000) { fail(SAFE_FAILURE,'tool-response'); return; }
      entry.response = response; entry.handoff.actionCompletedAt=elapsed(); complete = false; receivedAudio = false;outputText='';nextReply(); drainGeneration++;
      if(sendToolResponse(call.id,call.name,entry)){setPhase(pendingTools ? 'acting' : 'processing');if(!pendingTools)expectResponse();}
    }).catch(() => fail(SAFE_FAILURE,'tool-response'));
  }
  function message(value: Record<string, unknown>, epoch: number, socketEpoch: number) {
    if (!active() || epoch !== generation || socketEpoch !== connectionEpoch || seenMessages.has(value)) return;
    seenMessages.add(value);
    diagnostic.messages++; diagnostic.lastEvent = 'message';
    for(const entry of ledger.values()){
      if(entry.sentEpoch!==socketEpoch||entry.cancelled||entry.handoff.turnCompletedAt!==undefined)continue;
      const h=entry.handoff,c=record(value.serverContent),at=elapsed();
      h.providerEventAt??=at;
      if(record(c?.outputTranscription)?.text)h.captionAt??=at;
      if(Array.isArray(record(c?.modelTurn)?.parts)&&
        (record(c?.modelTurn)!.parts as unknown[]).some(p=>record(record(p)?.inlineData)))h.audioAt??=at;
      if(c?.turnComplete===true)h.turnCompletedAt??=at;
    }
    const content = record(value.serverContent), resume = record(value.sessionResumptionUpdate);
    const cap=diagnostic.capture,activity=record(value.voiceActivity)?.voiceActivityType??record(value.voiceActivityDetectionSignal)?.vadSignalType;
    if(activity==='ACTIVITY_START'||activity==='VAD_SIGNAL_TYPE_SOS')cap.serverStarts++;
    if(activity==='ACTIVITY_END'||activity==='VAD_SIGNAL_TYPE_EOS')cap.serverEnds++;
    if (content?.interrupted === true) {
      cap.serverInterruptions++;reply.interrupted=true;
      const oldComplete=complete;
      if(playbackActive)diagnostic.spokenInterruptions=(diagnostic.spokenInterruptions??0)+1;
      discardOutput=true;drainGeneration++;output?.stop();options.onAudioLevel(0);
      if(options.allowSpokenInterruption&&!pendingTools){
        // Gemini may finish the interrupted response in a separate frame.
        // Preserve the new utterance and its silence timer across both events.
        introducing=false;introPlayed=true;clearResponseTimer();
        if(!userActive&&!startUserTurn())return;
        interruptedTurnEnding=!oldComplete&&!content.turnComplete;discardOutput=interruptedTurnEnding;
        if(interruptedTurnEnding){const cut=reply;timer(()=>{if(active()&&cut===reply&&interruptedTurnEnding)fail('The interrupted voice turn did not close. You can start a new call or continue by text.','turn-timeout');},12000);}
        userActive=true;silenceMs=0;complete=false;setPhase(micMuted?'muted':'listening');
        // No synthetic turn boundary. Keep input flowing if Google's old
        // interrupted turn ends in a later frame.

      }
    }
    const cancelled = record(value.toolCallCancellation)?.ids;
    if (Array.isArray(cancelled)) for (const id of cancelled) if (typeof id === 'string') { const entry = ledger.get(id); if (entry) { entry.cancelled = true; entry.handoff.cancelledAt=elapsed(); entry.abort.abort(); } }
    const calls = record(value.toolCall)?.functionCalls;
    if (Array.isArray(calls)) { if (calls.length > 4) { fail(SAFE_FAILURE,'tool-limit'); return; } for (const call of calls) toolCall(call, epoch); }
    const input = record(content?.inputTranscription), interim = record(content?.interimInputTranscription), spoken = record(content?.outputTranscription);
    // Input transcription is independent of model-turn ordering. In particular,
    // a late final must remain a caption, not restart processing or its timer.
    if(typeof input?.text==='string'&&input.text)cap.inputCaptions++;
    if(typeof interim?.text==='string'&&interim.text)cap.interimCaptions++;
    if(typeof spoken?.text==='string'&&spoken.text)cap.outputCaptions++;
    if (input?.text && turn > 0) transcript('user', input.text, input.finished === true);
    else if (interim?.text && typeof interim.text === 'string') options.onTranscript({role: 'user', text: (inputText + interim.text).slice(0,4000), final: false, turnId: `${token?.callId ?? 'live'}:${turn}`});
    if (!interruptedTurnEnding&&spoken?.text) { if (!complete) beginResponse(); transcript('assistant', spoken.text, spoken.finished === true);reply.caption=true;checkSilent(9000); }
    const parts = record(content?.modelTurn)?.parts;
    if (Array.isArray(parts)) for (const part of parts) {
      const inline = record(record(part)?.inlineData);
      if (inline) {
        diagnostic.audioChunks++; diagnostic.lastEvent = 'audio';
        if(interruptedTurnEnding||discardOutput){cap.suppressedAudio++;continue;}
        beginResponse();
        if (!discardOutput) {
          if (typeof inline.data !== 'string' || typeof inline.mimeType !== 'string') { fail(SAFE_FAILURE,'audio-format'); return; }
          let samples:Float32Array<ArrayBuffer>;
          try{samples=inspectChunk(reply,inline.data,inline.mimeType);diagnostic.decodedChunks++;}
          catch{fail('Google returned an invalid voice audio format. You can continue by text.','audio-format');return;}
          if(samples.length<=1)continue;
          try{output?.enqueue(inline.data,inline.mimeType,samples,reply);}
          catch{if(outputText.trim())options.onUnplayedCaption?.(outputText);fail('Google sent audio, but the browser could not schedule playback. You can start a new call or continue by text.','player-drain');return;}
          if (!receivedAudio) { receivedAudio = true;trace('audio'); clearResponseTimer(); responseTimer = timer(() => fail('The voice turn took too long. You can continue by text.','turn-timeout'),60_000); }
        }
      }
    }
    if (content?.generationComplete === true) {
      diagnostic.generationComplete++; diagnostic.lastEvent = 'generation-complete';trace('generation-complete');
      if(!interruptedTurnEnding){reply.generated=true;if(!content.turnComplete)checkSilent(3500);}
    }
    if(content?.turnComplete===true&&(interruptedTurnEnding||content.interrupted===true)){
      interruptedTurnEnding=false;discardOutput=false;receivedAudio=false;complete=false;
    }else if (content?.turnComplete === true) {
      reply.completed=true;diagnostic.turnComplete++; diagnostic.lastEvent = 'turn-complete';
      trace('turn-complete');
      complete = true;
      if (inputText) options.onTranscript({role: 'user', text: inputText, final: true, turnId: `${token?.callId ?? 'live'}:${turn}`});
      if (outputText) options.onTranscript({role: 'assistant', text: outputText, final: true, turnId: `${token?.callId ?? 'live'}:${turn}`});
      void finishOutput();
    }
    if(content?.waitingForInput===true){diagnostic.waitingForInput++;diagnostic.lastEvent='waiting-for-input';trace('waiting-for-input');if(phase==='processing'&&!introducing&&!pendingTools&&previousOutputSettled&&!responseBegun&&!receivedAudio&&!outputText){clearResponseTimer();listening();}}
    if (resume?.resumable === true && isEdenLiveResumeHandle(resume.newHandle)) {
      pendingResumeHandle = resume.newHandle;
      trace('resume-handle');
      if ((phase === 'listening' || phase === 'muted') && !pendingTools && !userActive) resumeHandle = pendingResumeHandle;
    }
    if (resume?.resumable === false) { resumeHandle = undefined; pendingResumeHandle = undefined; }
    if(value.goAway){const left=record(value.goAway)?.timeLeft;if(typeof left==='string'&&/^\d+(?:\.\d{1,9})?s$/.test(left)){const seconds=Number(left.slice(0,-1));if(Number.isFinite(seconds)&&seconds>=0&&seconds<=3600)diagnostic.goAwaySeconds=seconds;}trace('go-away');/* Wait for actual close; recovery still requires a safe completed handle. */}
  }
  async function connect(resuming: boolean, epoch: number) {
    const context = validateEdenLiveContext(options.getContext()); if (!context) throw new Error('Public context unavailable.');
    pendingTask(); // Reject invalid/noncanonical task metadata before minting.
    const request = {nonce: nonce(), context, ...(resuming && token && resumeHandle ? {callId: token.callId, resumeHandle} : {})};
    diagnostic.lastEvent = 'token';trace('token');
    let raw: unknown;
    try { raw = await options.getToken(request, AbortSignal.any([abort!.signal, AbortSignal.timeout(20_000)])); } catch(error) {serviceFailure(error); throw new LivePreparationFailure('token-request'); }
    const next = validateEdenLiveTokenResponse(raw, deps.now()); if (!next) throw new LivePreparationFailure('token-invalid');
    if (!active() || epoch !== generation) { if (next.callId) void options.releaseToken?.(next.callId); return; }
    if (resuming && (next.callId !== token?.callId || !next.config.sessionResumption?.handle)) throw new Error('Voice resumption unavailable.');
    token = next;diagnostic.tokenExpiresAt=Date.parse(next.expiresAt);
    if (!resuming) { deadline = Math.min(deps.now() + Math.min(EDEN_LIVE_MAX_CALL_SECONDS,next.maxCallSeconds) * 1000, Date.parse(next.expiresAt));diagnostic.appDeadline=deadline; timer(() => end('This call reached its time limit. Text is still available.','app-expiry'), Math.max(0,deadline-deps.now())); }
    const socketEpoch = ++connectionEpoch; diagnostic.connections++; diagnostic.lastEvent = 'setup'; seenMessages = new WeakSet(); connectionAbort?.abort(); connectionAbort = new AbortController();
    diagnostic.connectionGeneration=socketEpoch;trace('setup');
    // Setup timeout is separate from call lifetime: do not leave it attached to
    // the open socket after successful setup.
    const setupAbort = new AbortController(), setupTimer = timer(() => setupAbort.abort(),20_000);
    let candidate: LiveConnection;
    try { candidate = await deps.connect(next, {message: value => message(value,epoch,socketEpoch), closed: detail => { if (active() && epoch === generation && socketEpoch === connectionEpoch) void reconnect(epoch, detail); }}, AbortSignal.any([abort!.signal,connectionAbort.signal,setupAbort.signal])); }
    catch { throw new LivePreparationFailure('socket-setup'); }
    finally { cancelTimer(setupTimer); }
    if (!active() || epoch !== generation || socketEpoch !== connectionEpoch) { candidate.close(); return; }
    connection = candidate;diagnostic.setupComplete=true;
    if(!resuming&&options.confirmSetup){
      try{await options.confirmSetup(next.callId,AbortSignal.any([abort!.signal,AbortSignal.timeout(8000)]));}
      catch(error){serviceFailure(error);throw new LivePreparationFailure('socket-setup');}
      if(!active()||epoch!==generation||socketEpoch!==connectionEpoch)return;
    }
    if (resuming) { resumeHandle = undefined; pendingResumeHandle = undefined; introducing = false; introPlayed = true; listening(); }
    else { seedInitialHistory(); introducing = true; complete = false; discardOutput = false; setPhase('introducing'); send({realtimeInput: {text: EDEN_LIVE_INTRODUCTION_PROMPT}}); expectResponse(); }
  }
  async function reconnect(epoch: number, detail?: LiveTransportClose) {
    if (!active() || epoch !== generation || phase === 'reconnecting') return;
    diagnostic.lastEvent = 'closed';
    trace('closed');diagnostic.closeReason=detail?.closeReason;
    if (detail?.code !== undefined && Number.isInteger(detail.code) && detail.code >= 1000 && detail.code <= 4999) diagnostic.closeCode = detail.code;
    if(detail?.providerCategory&&['none','rate-limit-or-quota','overload','authentication','invalid-request','provider-other'].includes(detail.providerCategory))diagnostic.providerCategory=detail.providerCategory;if(Number.isInteger(detail?.providerStatus)&&Number(detail?.providerStatus)>=400&&Number(detail?.providerStatus)<=599)diagnostic.providerStatus=detail!.providerStatus;
    if(detail?.closeReason==='quota')diagnostic.providerCategory='rate-limit-or-quota';
    if(diagnostic.providerCategory==='rate-limit-or-quota'||diagnostic.providerCategory==='authentication'||diagnostic.providerCategory==='invalid-request'){fail(SAFE_FAILURE,detail!.kind);return;}
    if (!resumeHandle || !introPlayed || pendingTools || userActive || recoveries >= 1 || deps.now() >= deadline) { fail(SAFE_FAILURE,detail?.kind ?? 'recovery-unavailable'); return; }
    recoveries++; drainGeneration++; output?.stop(); encoder.clear(); connection = undefined; setPhase('reconnecting');
    diagnostic.recoveries = recoveries; diagnostic.lastEvent = 'recovering';
    trace('recovering');
    try { await connect(true, epoch); } catch { if (active() && epoch === generation) fail('Voice reconnection was unavailable. You can continue by text.','recovery-unavailable'); }
  }
  async function start(input: {microphoneConsent: true}) {
    if (disposed || active()) return;
    if (input?.microphoneConsent !== true) { setPhase('permission-required', 'Microphone consent is required to start a call.'); return; }
    if (deps.document.hidden) { setPhase('error', 'Open this tab before starting a call.'); return; }
    cleanup(); abort = new AbortController(); const epoch = generation;
    reply=newReply(0);replyHistory=[reply];diagnostic = freshDiagnostic();diagnostic.callRef='eden-local-'+(++callSequence);diagnostic.startedAt=deps.now();previousOutputSettled=false;responseBegun=false; diagnostic.preparation = 'permission-pending'; diagnostic.lastEvent = 'preparing';
    consecutiveMisses=0;toolsAtTurnStart=0;phase = 'connecting'; reason = 'Waiting for microphone permission. Check the browser microphone prompt.'; micMuted = false; speakerMuted = false; turns = 0; turn = 0; recoveries = 0; introPlayed = false; introducing = false; complete = false; discardOutput = false; receivedAudio = false; voiceMs = 0; silenceMs = 0; userActive = false;
    deps.document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
    output = deps.output(level => { if (active()) options.onAudioLevel(speakerMuted ? 0 : level); }, playing => { if(!active()||playing===playbackActive)return;playbackActive=playing;if(playing){diagnostic.playbackStarts++;trace('playback-start');}else{diagnostic.playbackEnds++;trace('playback-end');}if(pendingTools)return;if (playing) setPhase(introducing ? 'introducing' : 'speaking'); else if (phase === 'speaking' && !complete) setPhase('processing');else publish(); },state=>contextState('output',state));
    microphone = deps.microphone(microphoneFrame, () => fail('The microphone stopped. Text is still available.','microphone-stream'),state=>contextState('input',state)); publish();
    try {
      let outputReady = false, microphoneStage: LiveMicrophonePreparation = 'permission-pending';
      const preparationStatus = () => {
        if (!active() || epoch !== generation) return;
        diagnostic.preparation = microphoneStage === 'ready' && !outputReady ? 'audio-output-pending' : microphoneStage;
        reason = microphoneStage === 'permission-pending' ? 'Waiting for microphone permission. Check the browser microphone prompt.'
          : microphoneStage !== 'ready' ? 'Starting microphone audio.' : !outputReady ? 'Waiting for browser audio playback. Keep this tab open.' : undefined;
        publish();
      };
      // Both init calls execute synchronously through their first await, so
      // Safari/Chrome receive the original explicit user activation.
      const preparation = Promise.all([
        output.init().then(() => { outputReady = true; preparationStatus(); }, () => { throw new LivePreparationFailure('audio-output-init'); }),
        microphone.start(abort.signal, stage => { microphoneStage = stage; preparationStatus(); }).then(() => { microphoneStage = 'ready'; preparationStatus(); }, error => {
          const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
          throw new LivePreparationFailure(denied ? 'microphone-denied' : 'microphone-init');
        }),
      ]);
      let preparationTimer: ReturnType<typeof setTimeout> | undefined, removePreparationAbort: (() => void) | undefined;
      try {
        await Promise.race([preparation, new Promise<never>((_resolve,reject) => {
          preparationTimer = timer(() => reject(new LivePreparationFailure(microphoneStage === 'permission-pending' ? 'permission-pending' : microphoneStage !== 'ready' ? 'microphone-timeout' : 'audio-output-timeout')), deps.preparationTimeoutMs);
        }), new Promise<never>((_resolve,reject) => {
          const signal = abort!.signal, cancel = () => reject(new DOMException('Call ended.','AbortError'));
          signal.addEventListener('abort',cancel,{once:true}); removePreparationAbort = () => signal.removeEventListener('abort',cancel);
          if (signal.aborted) cancel();
        })]);
      } finally { cancelTimer(preparationTimer); removePreparationAbort?.(); }
      if (!active() || epoch !== generation) return;
      publish(); await connect(false, epoch);
    } catch (error) {
      if (!active() || epoch !== generation) return;
      const failure = error instanceof LivePreparationFailure ? error.failure : 'unexpected';
      if (failure === 'microphone-denied') fail('Microphone permission was not granted. Your text conversation is still available.',failure,'permission-required');
      else if (failure === 'permission-pending') fail('Microphone permission is still pending. Allow it in the browser, then choose Call Eden again. Text is still available.',failure,'permission-required');
      else if (failure === 'audio-output-init' || failure === 'audio-output-timeout') fail('Browser audio playback did not start. Try Call Eden again from a visible tab, or continue by text.',failure);
      else if (failure === 'microphone-init' || failure === 'microphone-timeout') fail('Microphone audio did not become ready. You can try Call Eden again or continue by text.',failure);
      else fail(SAFE_FAILURE,failure);
    }
  }
  function stopSpeaking() {
    if (!active() || !['introducing','speaking','processing'].includes(phase)) return;
    discardOutput = true; drainGeneration++; output?.stop(); options.onAudioLevel(0); setPhase('processing');
    if (complete) void finishOutput(); else expectResponse();
  }
  return {
    start, end, stopSpeaking, skipIntroduction() { if (introducing) stopSpeaking(); },
    get snapshot() { return snapshot(); },
    setMicrophoneMuted(value: boolean) {
      const flush=options.allowSpokenInterruption&&value&&!micMuted&&forwarding();
      micMuted = value; microphone?.setMuted(value); encoder.clear();
      if(flush){try{endInputStream();}catch{fail(SAFE_FAILURE,'microphone-stream');return;}}
      if (value && phase === 'listening') { try { if (userActive&&!options.allowSpokenInterruption)endInputStream(); } catch { fail(); return; } if (userActive) { setPhase('processing'); expectResponse(); } else setPhase('muted'); }
      else if (!value && phase === 'muted') setPhase('listening'); else publish();
    },
    setSpeakerMuted(value: boolean) { speakerMuted = value; output?.setMuted(value); if (value) options.onAudioLevel(0); publish(); },
    sendText(text: string) {
      if (!active() || !['listening','muted'].includes(phase) || !text.trim() || text.length > 600 || /[\u0000-\u001f]/.test(text)) return false;
      if (!startUserTurn()) return false;
      resumeHandle = undefined; complete = false; discardOutput = false; encoder.clear();
      try { publicHistoryParts(); setPhase('processing'); send({clientContent: {turns: [{role: 'user', parts: [{text}]}], turnComplete: true}}); expectResponse(); return true; } catch { fail(); return false; }
    },
    dispose() { if (disposed) return; cleanup(); disposed = true; phase = 'ended'; },
  };
}
