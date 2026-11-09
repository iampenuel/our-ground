import type {EdenLiveSnapshot} from './live/session.ts';

type Service='gemini'|'application'|'resolver'|'resources';
type Issue={service:Service;category:'rate-limit-or-quota'|'overload'|'access'|'local-limit'|'resolver-limit'|'unavailable';status:number;at:number;retryAt?:number};
export type EdenDevelopmentCapacity={grantExpiresAt:string;live:{minted:number;limit:number;resetAt:string;scope:'backend-process'};modelCredits:{dayCalls:number;dayCallLimit:number;daySpeech:number;daySpeechLimit:number;dayResetAt:string;hourSessionsCreated:number;hourSessionLimit:number;hourResetAt:string;scope:'backend-process'}};
type Access={agentAvailable:boolean;liveAvailable:boolean;sessionExpiresAt?:number;capacity?:EdenDevelopmentCapacity};
const issues=new Map<Service,Issue>();
const listeners=new Set<()=>void>();
let enabled=false;
export function parseEdenDevelopmentCapacity(raw:unknown):EdenDevelopmentCapacity|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const value=raw as Record<string,unknown>,live=value.live as Record<string,unknown>|undefined,credits=value.modelCredits as Record<string,unknown>|undefined;
  const exact=(item:Record<string,unknown>,keys:string[])=>Object.keys(item).length===keys.length&&Object.keys(item).every(k=>keys.includes(k));
  const date=(item:unknown)=>typeof item==='string'&&Number.isFinite(Date.parse(item))&&new Date(item).toISOString()===item;
  const count=(item:unknown,max:number)=>typeof item==='number'&&Number.isInteger(item)&&item>=0&&item<=max;
  if(!exact(value,['grantExpiresAt','live','modelCredits'])||!live||Array.isArray(live)||!credits||Array.isArray(credits)||!date(value.grantExpiresAt)
    ||!exact(live,['minted','limit','resetAt','scope'])||live.scope!=='backend-process'||live.limit!==6||!count(live.minted,6)||!date(live.resetAt)
    ||!exact(credits,['dayCalls','dayCallLimit','daySpeech','daySpeechLimit','dayResetAt','hourSessionsCreated','hourSessionLimit','hourResetAt','scope'])||credits.scope!=='backend-process'||credits.dayCallLimit!==40||credits.daySpeechLimit!==12||credits.hourSessionLimit!==6
    ||!count(credits.dayCalls,40)||!count(credits.daySpeech,12)||!count(credits.hourSessionsCreated,6)||!date(credits.dayResetAt)||!date(credits.hourResetAt))return;
  return structuredClone(value) as EdenDevelopmentCapacity;
}

/** The opt-in is presentation only and grants no API authority. Never mounted
 * in a build, preview, private route, non-loopback page or ordinary review UI. */
export function edenDevelopmentDiagnosticsAllowed(dev:boolean,mode:string,location:{hostname:string;pathname:string;search:string}){
  return dev&&mode==='eden-review'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)
    &&['/','/support','/give','/organizations','/about','/privacy'].includes(location.pathname.replace(/\/$/,'')||'/')
    &&new URLSearchParams(location.search).get('eden-diagnostics')==='1';
}
export function classifyEdenDevelopmentIssue(service:Service,status:number,code:unknown,retryAfterSeconds?:number,now=Date.now()):Issue{
  const safeStatus=Number.isInteger(status)&&status>=0&&status<=599?status:0;
  const category:Issue['category']=service==='resolver'&&safeStatus===429?'resolver-limit'
    :typeof code==='string'&&['EDEN_USAGE_LIMIT','EDEN_LIVE_USAGE_LIMIT','EDEN_SESSION_LIMIT','EDEN_BUSY','EDEN_LIVE_CALL_ACTIVE','EDEN_LIVE_TOOL_LIMIT'].includes(code)?'local-limit'
    :service==='gemini'&&(safeStatus===429||code==='EDEN_LIVE_PROVIDER_QUOTA'||code==='EDEN_PROVIDER_QUOTA')?'rate-limit-or-quota'
    :safeStatus===401||safeStatus===403?'access':service==='gemini'&&safeStatus===503&&code==='EDEN_PROVIDER_OVERLOADED'?'overload':'unavailable';
  return{service,category,status:safeStatus,at:now,...(Number.isSafeInteger(retryAfterSeconds)&&retryAfterSeconds!>=0&&retryAfterSeconds!<=2678400?{retryAt:now+retryAfterSeconds!*1000}:{})};
}
/** Callers pass only an enum, number and checked error code, never URLs,
 * bodies, messages, headers, resource IDs, audio or transcripts. */
export function recordEdenDevelopmentIssue(service:Service,status:number,code:unknown,retryAfterSeconds?:number){
  if(!enabled)return;
  issues.set(service,classifyEdenDevelopmentIssue(service,status,code,retryAfterSeconds));
  for(const listener of listeners)listener();
}
export function edenSafeDevelopmentLiveReport(snapshot:EdenLiveSnapshot|undefined){
  if(!snapshot)return{phase:'not-started'};
  const d=snapshot.diagnostic as unknown as Record<string,unknown>|undefined;
  const report:Record<string,unknown>={phase:snapshot.phase,microphoneActive:snapshot.microphoneActive,microphoneForwarding:snapshot.microphoneForwarding,microphoneMuted:snapshot.microphoneMuted,speakerMuted:snapshot.speakerMuted};
  // Explicit allowlist rather than serializing an extensible runtime object.
  for(const key of ['failure','preparation','lastEvent','callRef','model','connectionGeneration','startedAt','appDeadline','tokenExpiresAt','connections','messages','audioChunks','generationComplete','turnComplete','toolCalls','toolCallsReceived','toolsStarted','toolsCompleted','toolsFailed','pendingTools','rejectedArguments','inputChunks','recoveries','closeCode','providerCategory','providerStatus','serviceCategory','serviceStatus','serviceCode','inputContext','outputContext','goAwaySeconds','resumable','waitingForInput','playbackStarts','playbackEnds','decodedChunks','endReason']){
    const value=d?.[key];
    if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||typeof value==='string'&&/^[A-Za-z0-9_.:+ -]{1,80}$/.test(value))report[key]=value;
  }
  if(Array.isArray(d?.timeline))report.timeline=d.timeline.slice(-32).map(item=>{
    const event=item as Record<string,unknown>;
    return{...(typeof event.event==='string'&&/^[a-z0-9-]{1,48}$/.test(event.event)?{event:event.event}:{}),...(typeof event.elapsedMs==='number'&&Number.isFinite(event.elapsedMs)?{elapsedMs:event.elapsedMs}:{}),...(typeof event.connection==='number'&&Number.isInteger(event.connection)?{connection:event.connection}:{}),...(typeof event.turn==='number'&&Number.isInteger(event.turn)?{turn:event.turn}:{})};
  });
  return report;
}
export function mountEdenDevelopmentDiagnostics(refresh?:()=>void){
  if(!edenDevelopmentDiagnosticsAllowed(import.meta.env?.DEV===true,import.meta.env?.MODE??'',window.location))return;
  enabled=true;
  const view=document.createElement('details'),summary=document.createElement('summary'),output=document.createElement('pre'),button=document.createElement('button');
  view.dataset.edenDevelopmentDiagnostics='';view.open=false;view.setAttribute('aria-label','Eden local development diagnostics');
  summary.textContent='Local call diagnostics';
  button.type='button';button.textContent='Refresh local capacity';button.addEventListener('click',()=>refresh?.());
  view.style.cssText='position:fixed;left:12px;top:12px;z-index:10000;max-width:min(420px,calc(100vw - 24px));max-height:75vh;overflow:auto;background:#fffdf5;color:#183a2d;border:1px solid #c9c9bd;border-radius:10px;padding:10px;font:12px/1.5 monospace;';
  output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;';view.append(summary,button,output);document.body.append(view);
  let live:EdenLiveSnapshot|undefined,access:Access={agentAvailable:false,liveAvailable:false},pending:ReturnType<typeof setTimeout>|undefined;
  const render=()=>{pending=undefined;output.textContent=JSON.stringify({
    scope:'Opt-in loopback diagnostics. No recording or persistent storage.',
    gemini:{projectCapacity:'Unknown: inspect the selected project/model in AI Studio. HTTP429 alone does not establish a daily quota.',lastObservedIssue:issues.get('gemini')??null},
    local:{...access,sessionExpiry:access.sessionExpiresAt?new Date(access.sessionExpiresAt).toISOString():null,grant:access.capacity?.grantExpiresAt??'Not returned by this server. Availability is independent of session/token expiry.',configuredCaps:'5-minute call; 15-minute app session; 3 mints/session, 6/day/backend process. Process counters are not provider usage and do not survive a backend restart.',lastObservedIssue:issues.get('application')??null},
    resolver:{configuredCap:'100/day shared globally; separate from Gemini. Reset: midnight UTC.',lastObservedIssue:issues.get('resolver')??null},
    resources:{lastObservedIssue:issues.get('resources')??null},call:edenSafeDevelopmentLiveReport(live),
  },null,2);};
  const schedule=()=>{if(pending===undefined)pending=setTimeout(render,200);};listeners.add(schedule);render();
  return{updateLive(value:EdenLiveSnapshot){live=value;schedule();},updateAccess(value:Access){access=value;schedule();},dispose(){listeners.delete(schedule);if(pending!==undefined)clearTimeout(pending);view.remove();enabled=false;issues.clear();}};
}
