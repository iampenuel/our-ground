import {createHash,randomBytes,randomInt} from 'node:crypto';
import {CONFIRM_LIVE_START,liveCapacity,type LiveCapacity} from './eden-live-capacity.ts';
import {RELEASE_LIVE_RESERVATION} from './eden-live-reservation.ts';
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
export function createHostedLive(store:Store,agent:Agent,secret:string,issue=issueEdenLiveToken,policy:LiveCapacity|null=liveCapacity({})){
  const get=(name:string)=>store(['GET',key(name)]);
  const reserve=async(name:string,value:string,ttl:number)=>
    await store(['SET',key(name),value,'EX',String(ttl),'NX'])==='OK';
  const release=(name:string,expected:string)=>store(['EVAL',RELEASE_LIVE_RESERVATION,'1',key(name),expected]);
  async function permit(prefix:string,max:number,call:string){
    const offset=randomInt(max);
    for(let i=0;i<max;i++){const name=prefix+':'+((offset+i)%max);if(await reserve(name,call,90))return name;}
    return null;
  }
  async function limit(scope:string,max:number,ttl:number,code='EDEN_LIVE_USAGE_LIMIT',wait?:number){
    const count=await store(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",'1','og:adult:eden:v1:rate:live:'+hash(scope),String(ttl)]);
    if(typeof count!=='number'||count<1)invalid('EDEN_LIMITER_UNAVAILABLE',503);
    if(Number(count)>max)throw new EdenLiveError(code,429,wait);
  }
  return async function handle(path:string,body:Record<string,unknown>,session:string,binding:string,sessionExpiry:number,signal:AbortSignal){
    if(!policy)throw new EdenLiveError('EDEN_LIVE_POLICY_UNAVAILABLE',503);
    const now=Date.now(),day=new Date(now).toISOString().slice(0,10),untilReset=Math.max(1,Math.ceil((Date.parse(day+'T00:00:00Z')+86400000-now)/1000));
    const seats=Array.from({length:policy.seats},(_,i)=>'slot:'+(i+1));
    const holdsKey=(id:string)=>'holds:'+session+':'+id;
    async function holds(id:string){
      const raw=await get(holdsKey(id));if(typeof raw!=='string')return null;
      const v=JSON.parse(raw);return Array.isArray(v)&&v.length===3&&typeof v[0]==='string'&&typeof v[1]==='string'&&Number.isSafeInteger(v[2])?v as [string,string,number]:null;
    }
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
      await limit('attempt:'+binding+':'+Math.floor(now/60000),4,65,'EDEN_LIVE_START_THROTTLED',60);
      await limit('attempt:all:'+Math.floor(now/60000),8,65,'EDEN_LIVE_START_THROTTLED',60);
      await agent.inspectLiveContext(ctx);
      const call=request.callId??randomBytes(32).toString('base64url');
      const deadline=request.callId?await expiry(call):Math.min(sessionExpiry,Date.now()+EDEN_LIVE_MAX_CALL_SECONDS*1000);
      const ttl=Math.ceil((deadline-Date.now())/1000);
      if(!Number.isFinite(ttl)||ttl<15)invalid('EDEN_LIVE_SESSION_EXPIRING',401);
      if(!await reserve('nonce:'+binding+':'+request.nonce,'1',ttl))invalid('EDEN_LIVE_NONCE_REUSED',409);
      let owned=false,slot:string|undefined,testerPermit:string|null=null,teamPermit:string|null=null,issued=false;
      const providerSeat=call+':'+deadline;
      try{
        if(request.callId){
          if(!await get('started:'+session+':'+call))invalid('EDEN_LIVE_RESUME_DENIED',409);
          if(await get('resume:'+call))invalid('EDEN_LIVE_RESUME_DENIED',409);
        }else{
          if(!await reserve('owner:'+binding,call,ttl))invalid('EDEN_LIVE_CALL_ACTIVE',409);
          owned=true;
          // A signed visitor retains its fairness allowance across Eden session
          // refreshes. Only successful setup promotes a tentative start.
          testerPermit=await permit('start:'+day+':visitor:'+binding,policy.testerStarts,call);
          if(!testerPermit)throw new EdenLiveError('EDEN_LIVE_TESTER_START_LIMIT',429,untilReset);
          teamPermit=await permit('start:'+day+':team',policy.teamStarts,call);
          if(!teamPermit)throw new EdenLiveError('EDEN_LIVE_TEAM_START_LIMIT',429,untilReset);
          if(!await reserve(callKey(call),String(deadline),ttl)||!await reserve(holdsKey(call),JSON.stringify([testerPermit,teamPermit,now+untilReset*1000]),ttl))invalid('EDEN_LIVE_CALL_ACTIVE',409);
        }
        // Every credential, including a resume, has provider-side overlap risk.
        // End Call cannot revoke a Google token; only an unissued seat is freed.
        for(const name of seats)if(await reserve(name,providerSeat,ttl)){slot=name;break;}
        if(!slot){
          const values=await Promise.all(seats.map(get));
          const wait=Math.min(...values.map(v=>typeof v==='string'&&/^[-\w]{43}:\d{13}$/.test(v)?Math.max(1,Math.ceil((Number(v.slice(44))-Date.now())/1000)):EDEN_LIVE_MAX_CALL_SECONDS));
          throw new EdenLiveError('EDEN_LIVE_CAPACITY',429,Math.min(wait,EDEN_LIVE_MAX_CALL_SECONDS));
        }
        const testerScope='provider:tester:'+binding+':'+day;
        // Check both budgets before incrementing either: repeated requests to
        // an exhausted project must not drain a tester's allowance. The atomic
        // increments below still enforce both ceilings under concurrent starts.
        const counts=await Promise.all([testerScope,'project:'+day].map(scope=>store(['GET','og:adult:eden:v1:rate:live:'+hash(scope)])));
        if(Number(counts[0])>=policy.testerAttempts)throw new EdenLiveError('EDEN_LIVE_TESTER_MINT_LIMIT',429,untilReset);
        if(Number(counts[1])>=policy.teamAttempts)throw new EdenLiveError('EDEN_LIVE_PROVIDER_BUDGET',429,untilReset);
        if(request.callId&&!await reserve('resume:'+call,'1',ttl))invalid('EDEN_LIVE_RESUME_DENIED',409);
        await limit(testerScope,policy.testerAttempts,86460,'EDEN_LIVE_TESTER_MINT_LIMIT',untilReset);
        // Reuse the legacy project counter, including today's earlier mints.
        await limit('project:'+day,policy.teamAttempts,86460,'EDEN_LIVE_PROVIDER_BUDGET',untilReset);
        const token=await issue(secret,call,deadline,true,signal,request.resumeHandle?{handle:request.resumeHandle}:undefined);
        issued=true;await expiry(call);
        return token;
      }catch(error){
        if(owned)await Promise.all([release('owner:'+binding,call),store(['DEL',key(callKey(call))]),store(['DEL',key(holdsKey(call))]),...(testerPermit?[release(testerPermit,call)]:[]),...(teamPermit?[release(teamPermit,call)]:[])]);
        if(slot&&!issued)await release(slot,providerSeat);
        throw error;
      }
    }
    const id=body.callId;
    if(!isEdenLiveCallId(id)||body.noticeVersion!==EDEN_NOTICE_VERSION)throw new EdenLiveError('EDEN_LIVE_INVALID_REQUEST',422);
    if(path==='live/connected'&&only(body,['noticeVersion','callId'])){
      const deadline=await expiry(id);
      if(await get('started:'+session+':'+id))return {connected:true};
      const h=await holds(id);
      if(!h||await store(['EVAL',CONFIRM_LIVE_START,'2',key(h[0]),key(h[1]),id,String(Math.max(1,Math.ceil((h[2]-Date.now())/1000)))])!==1)invalid('EDEN_LIVE_SETUP_EXPIRED',409);
      await reserve('started:'+session+':'+id,id,Math.max(1,Math.ceil((deadline-Date.now())/1000)));
      return {connected:true};
    }
    if(path==='live/end'&&only(body,['noticeVersion','callId'])){
      // Only a session holding this call may release its visitor reservation.
      // Keep the independent provider seat until the issued credential expires.
      if(await store(['GETDEL',key(callKey(id))])!==null){
        const h=await holds(id);
        await Promise.all([release('owner:'+binding,id),...(h?[release(h[0],id),release(h[1],id)]:[])]);
      }
      return {ended:true};
    }
    const ttl=Math.ceil(((await expiry(id))-Date.now())/1000);
    if(!await get('started:'+session+':'+id))invalid('EDEN_LIVE_SETUP_EXPIRED',409);
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
