import { EDEN_NOTICE_VERSION, validateEdenAction } from '../../shared/eden-assistant.ts';
import type { EdenAction } from '../../shared/eden-assistant.ts';
import { edenLiveValuesEqual, isEdenLiveCallId, validateEdenLiveContext, validateEdenLiveToolAuthorization, validateEdenLiveToolCall, validateEdenLiveToolCompletion } from '../../shared/eden-live.ts';
import type { EdenLiveClarification, EdenLiveContext, EdenLivePublicResult, EdenLiveToolCall, EdenLiveToolCompletion } from '../../shared/eden-live.ts';
import { edenLocalPageContext, edenPageContext, edenPageRevision, executeEdenAction } from './application-bridge.ts';
import type { EdenActionResult } from './application-bridge.ts';
import { ensureEdenSupportPage } from './support-navigation.ts';
import {EdenLiveServiceError} from './live/session.ts';

/** The one application executor used by text and Live. It never receives a
 * model's script, URL, DOM selector, visitor transcript or provider credential.
 */
export async function applyEdenPublicAction(value: EdenAction, options: { signal: AbortSignal; evaluationData?: boolean; publicDirectory?: boolean; expectedRevision?: number }): Promise<EdenActionResult> {
  const action=validateEdenAction(value),expected=options.expectedRevision??edenPageRevision();
  if(!action||options.signal.aborted)return{status:'unavailable',message:'This action is unavailable.'};
  if(expected!==edenPageRevision())return{status:'clarify',message:'The page changed. Please try the action again.'};
  if(action.type==='navigate-public'){const{navigateEdenPublicPage}=await import('./public-navigation.ts');await navigateEdenPublicPage(action.page,{signal:options.signal,evaluationData:options.evaluationData,publicDirectory:options.publicDirectory});return edenLocalPageContext().route===action.page?{status:'done',message:'The public page is open.'}:{status:'unavailable',message:'The requested page could not be opened.'};}
  if(action.type==='search'||action.type==='navigate-support'){
    const navigation=await ensureEdenSupportPage(action,{signal:options.signal,hasSupportPage:()=>['support','resource'].includes(edenPageContext().page),evaluationData:options.evaluationData===true,publicDirectory:options.publicDirectory});
    if(navigation.initialSearch){const view=edenLocalPageContext();const ready=view.loading==='ready'&&action.type==='search'&&view.cityId===action.city&&view.category===action.category&&view.radius===(action.radius??10);return{status:ready?'done':'unavailable',message:ready?'The search completed.':'The search could not finish.'};}
    return executeEdenAction(action,edenPageRevision(),options.signal);
  }
  if((action.type==='radius'||action.type==='refine')&&!['support','resource'].includes(edenPageContext().page)){
    const view=edenLocalPageContext();if(!view.cityId||!view.category||!view.radius)return{status:'clarify',message:'Choose a city and category before refining a search.'};
    return applyEdenPublicAction({type:'search',city:view.cityId,category:action.type==='refine'?action.category:view.category,radius:action.type==='radius'?action.radius:view.radius},options);
  }
  return executeEdenAction(action,expected,options.signal);
}

export type EdenLiveToolAuthorizationRequest = EdenLiveToolCall & { callId: string; context: EdenLiveContext; noticeVersion: typeof EDEN_NOTICE_VERSION };
export type EdenLiveToolResultRequest = {callId:string;id:string;toolToken:string;outcome:'done'|'failed';context:EdenLiveContext;noticeVersion:typeof EDEN_NOTICE_VERSION};
export type EdenLiveToolResult = EdenLivePublicResult & {outcome?:'done'|'failed';clarification?:EdenLiveClarification};
export type EdenLiveToolExecutorOptions = {
  callId:string;
  getContext:()=>EdenLiveContext;
  authorize:(request:EdenLiveToolAuthorizationRequest,signal:AbortSignal)=>Promise<unknown>;
  complete:(request:EdenLiveToolResultRequest,signal:AbortSignal)=>Promise<unknown>;
  evaluationData?:boolean; publicDirectory?:boolean;
  onClarification?:(intent:EdenLiveClarification)=>void;
};

/** Per-call idempotency is in addition to the server's session/call/id-bound
 * lease. Only its validated authorization may precede an application mutation;
 * only reconciled fresh server facts become a model-visible result afterward.
 */
export function createEdenLiveToolExecutor(options:EdenLiveToolExecutorOptions){
  if(!isEdenLiveCallId(options.callId))throw new Error('Invalid Live call.');
  const calls=new Map<string,{call:EdenLiveToolCall;result:Promise<EdenLiveToolResult>}>();
  function context(){const value=validateEdenLiveContext(options.getContext());if(!value)throw new Error('Public page context is unavailable.');return value;}
  async function run(call:EdenLiveToolCall,signal:AbortSignal):Promise<EdenLiveToolResult>{
    signal.throwIfAborted();
    const before=context(),revision=edenPageRevision();
    const raw=await options.authorize({...call,callId:options.callId,context:before,noticeVersion:EDEN_NOTICE_VERSION},signal);
    signal.throwIfAborted();
    const grant=validateEdenLiveToolAuthorization(raw,call);
    if(!grant||revision!==edenPageRevision()||!edenLiveValuesEqual(before,context()))throw new Error('This Live action is no longer current.');
    if(grant.toolToken===null){
      if(!edenLiveValuesEqual(grant.result.context,before))throw new Error('The public facts no longer match this page.');
      if(grant.clarification)options.onClarification?.(structuredClone(grant.clarification));
      return{...grant.result,...(grant.clarification?{clarification:grant.clarification}:{})};
    }
    let outcome:'done'|'failed'='failed';
    try{const result=await applyEdenPublicAction(grant.action,{signal,evaluationData:options.evaluationData,publicDirectory:options.publicDirectory,expectedRevision:revision});outcome=result.status==='done'?'done':'failed';}
    catch{signal.throwIfAborted();}
    signal.throwIfAborted();
    const after=context(),afterRevision=edenPageRevision();
    const result=validateEdenLiveToolCompletion(await options.complete({callId:options.callId,id:call.id,toolToken:grant.toolToken,outcome,context:after,noticeVersion:EDEN_NOTICE_VERSION},signal));
    signal.throwIfAborted();
    if(!result||result.outcome!==outcome||afterRevision!==edenPageRevision()||!edenLiveValuesEqual(after,context())||!edenLiveValuesEqual(after,result.context))throw new Error('The action result could not be verified.');
    return result satisfies EdenLiveToolCompletion;
  }
  return async function executeEdenLiveTool(value:unknown,signal:AbortSignal):Promise<EdenLiveToolResult>{
    signal.throwIfAborted();
    const call=validateEdenLiveToolCall(value);if(!call)throw new Error('This Live tool is unavailable.');
    const existing=calls.get(call.id);
    if(existing){if(!edenLiveValuesEqual(existing.call,call))throw new Error('This Live tool identifier was already used.');const result=await existing.result;if(!edenLiveValuesEqual(result.context,context()))throw new Error('This Live result is no longer current.');return structuredClone(result);}
    if(calls.size>=32)throw new Error('This call reached its action limit.');
    const result=run(call,signal).catch(error=>{signal.throwIfAborted();if(error instanceof EdenLiveServiceError)throw error;throw new Error('This Live tool could not be verified.');});
    calls.set(call.id,{call,result});return structuredClone(await result);
  };
}
