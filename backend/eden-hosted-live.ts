import {createHash,randomBytes} from 'node:crypto';
import {issueEdenLiveToken,EdenLiveError} from './eden-live.ts';
import {createEdenAgent} from './eden-agent.ts';
import {EDEN_LIVE_MAX_CALL_SECONDS,isEdenLiveCallId,validateEdenLiveTokenRequest,validateEdenLiveToolCall,validateEdenLiveContext} from '../shared/eden-live.ts';
import {EDEN_NOTICE_VERSION,type EdenAction} from '../shared/eden-assistant.ts';

type Store=(command:string[])=>Promise<unknown>;
type Agent=ReturnType<typeof createEdenAgent>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const invalid=(code:string,status:number):never=>{throw new EdenLiveError(code,status);};
const key=(name:string)=>'og:adult:eden:v1:live:'+hash(name);
const only=(body:Record<string,unknown>,names:string[])=>names.length===Object.keys(body).length&&names.every(name=>Object.hasOwn(body,name));

// Every reservation is conditional in the shared store. A used provider token cannot
// be revoked, so the two capacity slots last until the credentials actually expire.
export function createHostedLive(store:Store,agent:Agent,secret:string,issue=issueEdenLiveToken){
  const get=(name:string)=>store(['GET',key(name)]);
  const reserve=async(name:string,value:string,ttl:number)=>
    await store(['SET',key(name),value,'EX',String(ttl),'NX'])==='OK';
  async function limit(scope:string,max:number,ttl:number){
    const count=await store(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",'1','og:adult:eden:v1:rate:live:'+hash(scope),String(ttl)]);
    if(typeof count!=='number'||count<1)invalid('EDEN_LIMITER_UNAVAILABLE',503);
    if(Number(count)>max)invalid('EDEN_LIVE_USAGE_LIMIT',429);
  }
  return async function handle(path:string,body:Record<string,unknown>,session:string,binding:string,sessionExpiry:number,signal:AbortSignal){
    const ctx=validateEdenLiveContext(body.context);
    const callKey=(id:string)=>'call:'+session+':'+id;
    async function expiry(id:string){
      const value=Number(await get(callKey(id)));
      if(!value||value<=Date.now())invalid('EDEN_LIVE_CALL_EXPIRED',409);
      return value;
    }
    if(path==='live/token'){
      const request=validateEdenLiveTokenRequest(body);
      if(!request||!ctx||ctx.directory!=='public'||ctx.synthetic)throw new EdenLiveError('EDEN_LIVE_INVALID_REQUEST',422);
      await limit('attempt:'+binding+':'+Math.floor(Date.now()/60000),4,65);
      await limit('attempt:all:'+Math.floor(Date.now()/60000),8,65);
      await agent.inspectLiveContext(ctx);
      const call=request.callId??randomBytes(32).toString('base64url');
      const deadline=request.callId?await expiry(call):Math.min(sessionExpiry,Date.now()+EDEN_LIVE_MAX_CALL_SECONDS*1000);
      const ttl=Math.ceil((deadline-Date.now())/1000);
      if(!Number.isFinite(ttl)||ttl<15)invalid('EDEN_LIVE_SESSION_EXPIRING',401);
      if(!await reserve('nonce:'+binding+':'+request.nonce,'1',ttl))invalid('EDEN_LIVE_NONCE_REUSED',409);
      if(request.callId){
        if(!await reserve('resume:'+call,'1',ttl))invalid('EDEN_LIVE_RESUME_DENIED',409);
      }else{
        if(!await reserve('owner:'+binding,call,ttl))invalid('EDEN_LIVE_CALL_ACTIVE',409);
        if(!await reserve('slot:1',call,ttl)&&!await reserve('slot:2',call,ttl))invalid('EDEN_LIVE_CALL_ACTIVE',409);
        if(!await reserve(callKey(call),String(deadline),ttl))invalid('EDEN_LIVE_CALL_ACTIVE',409);
      }
      await limit('session:'+session,3,900);
      await limit('project:'+new Date().toISOString().slice(0,10),6,86460);
      const token=await issue(secret,call,deadline,true,signal,request.resumeHandle?{handle:request.resumeHandle}:undefined);
      await expiry(call);
      return token;
    }
    const id=body.callId;
    if(!isEdenLiveCallId(id)||body.noticeVersion!==EDEN_NOTICE_VERSION)throw new EdenLiveError('EDEN_LIVE_INVALID_REQUEST',422);
    if(path==='live/end'&&only(body,['noticeVersion','callId'])){
      await store(['DEL',key(callKey(id))]);return {ended:true};
    }
    const ttl=Math.ceil(((await expiry(id))-Date.now())/1000);
    if(!ctx||ctx.directory!=='public'||ctx.synthetic||typeof body.id!=='string'||!/^[\w.:-]{1,128}$/.test(body.id))throw new EdenLiveError('EDEN_LIVE_INVALID_TOOL',422);
    if(path==='live/tool'&&only(body,['noticeVersion','callId','id','name','args','context'])){
      const tool=validateEdenLiveToolCall({id:body.id,name:body.name,args:body.args});
      if(!tool)throw new EdenLiveError('EDEN_LIVE_INVALID_TOOL',422);
      await limit('tools:'+id,20,ttl);
      if(!await reserve('tool:'+id+':'+tool.id,'1',ttl))invalid('EDEN_LIVE_TOOL_REPLAY',409);
      if(tool.name!=='perform_public_resource_action'){
        const result=await agent.inspectLiveContext(ctx);await expiry(id);
        return {authorized:true,toolToken:null,result,...(tool.name==='ask_clarification'?{clarification:{goal:'clarify-search',...tool.args}}:{})};
      }
      const prepared=await agent.prepareLiveAction(tool.args,ctx);
      const grant=randomBytes(32).toString('base64url');
      // Immutable numbered slots avoid a stale completion deleting a newer lock.
      for(let index=0;index<20;index++){
        const slot='action:'+id+':'+index;
        if(await get(slot+':done'))continue;
        if(!await reserve(slot,hash(grant),ttl))invalid('EDEN_LIVE_TOOL_PENDING',409);
        if(!await reserve('grant:'+id+':'+hash(grant),JSON.stringify({slot,toolId:tool.id,action:prepared.action,context:ctx}),Math.min(ttl,60)))invalid('EDEN_LIVE_TOOL_PENDING',409);
        await expiry(id);return {authorized:true,toolToken:grant,action:prepared.action};
      }
      invalid('EDEN_LIVE_TOOL_LIMIT',429);
    }
    if(path==='live/result'&&only(body,['noticeVersion','callId','id','toolToken','outcome','context'])&&isEdenLiveCallId(body.toolToken)&&(body.outcome==='done'||body.outcome==='failed')){
      const raw=await store(['GETDEL',key('grant:'+id+':'+hash(body.toolToken))]);
      if(typeof raw!=='string')throw new EdenLiveError('EDEN_LIVE_TOOL_EXPIRED',409);
      const grant=JSON.parse(raw);
      if(grant.toolId!==body.id)invalid('EDEN_LIVE_TOOL_EXPIRED',409);
      const result=await agent.reconcileLiveAction(grant.action as EdenAction,grant.context,body.outcome,ctx);
      await expiry(id);await reserve(grant.slot+':done','1',ttl);return result;
    }
    throw new EdenLiveError('EDEN_LIVE_INVALID_REQUEST',422);
  };
}
