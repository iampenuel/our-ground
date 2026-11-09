import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {liveCapacity,CONFIRM_LIVE_START} from '../backend/eden-live-capacity.ts';
import {RELEASE_LIVE_RESERVATION} from '../backend/eden-live-reservation.ts';
import {createHostedLive} from '../backend/eden-hosted-live.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';
const nonce=()=>randomBytes(32).toString('base64url'),context={page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false};
function harness(policy=liveCapacity({})){
  let time=Date.UTC(2026,10,10,1);const real=Date.now;Date.now=()=>time;
  const rows=new Map(),get=k=>{const x=rows.get(k);return x&&x.until>time?x.v:null;};
  const put=(k,v,sec)=>{rows.set(k,{v,until:time+sec*1000});};
  let fail=false,mints=0;
  const store=async([op,...a])=>{
    if(op==='SET'){if(get(a[0])!==null)return null;put(a[0],a[1],a[3]);return 'OK';}
    if(op==='EVAL'){
      if(a[0]===CONFIRM_LIVE_START){const [l,r,owner,ttl]=a.slice(2),ready='ready:'+owner;
        if(get(l)===ready&&get(r)===ready)return 1;
        if(get(l)!==owner||get(r)!==owner)return 0;put(l,ready,ttl);put(r,ready,ttl);return 1;}
      if(a[0]===RELEASE_LIVE_RESERVATION){if(get(a[2])!==a[3])return 0;rows.delete(a[2]);return 1;}
      const n=Number(get(a[2])??0)+1;put(a[2],n,a[3]);return n;
    }
    const v=get(a[0]);if(op==='GETDEL'||op==='DEL')rows.delete(a[0]);return v;
  };
  const handle=createHostedLive(store,{inspectLiveContext:async()=>({context,facts:[]})},'test',async(_k,callId,deadline)=>{mints++;if(fail)throw Error('mint rejected');return {callId,deadline};},policy);
  const op=(path,body,user,session=user)=>handle('live/'+path,{...body,noticeVersion},session,user,time+900000,new AbortController().signal);
  return {op,start:(u,s,extra={})=>op('token',{context,liveAudioAcknowledged:true,nonce:nonce(),...extra},u,s),
    setup:(call,u,s)=>op('connected',{callId:call.callId},u,s),end:(call,u,s)=>op('end',{callId:call.callId},u,s),
    advance:ms=>{time+=ms;},get mints(){return mints;},set fail(v){fail=v;},done(){Date.now=real;}};
}
test('24 starts across four testers; fresh sessions and duplicate acknowledgements do not refill or multiply daily permits',async()=>{
 const h=harness();try{
   for(let i=0;i<24;i++){
     const user='visitor'+(i%4),session='session'+i,c=await h.start(user,session);
     await Promise.all([h.setup(c,user,session),h.setup(c,user,session)]);await h.end(c,user,session);
     h.advance(601000);
   }
   await assert.rejects(h.start('visitor0','fresh'),{code:'EDEN_LIVE_TESTER_START_LIMIT'});
   await assert.rejects(h.start('extra'),{code:'EDEN_LIVE_TEAM_START_LIMIT'});assert.equal(h.mints,24);
   h.advance(86400000);assert((await h.start('visitor0','fresh')).callId);
 }finally{h.done();}
});
test('competing starts cannot exceed two provider seats; a fresh logical call may retry a failed setup without charging its daily start',async()=>{
 const h=harness({...liveCapacity({}),testerStarts:1});try{
   h.fail=true;await assert.rejects(h.start('a'),/mint rejected/);h.fail=false;
   const a=await h.start('a');await h.end(a,'a'); // Issued, but WebSocket setup failed.
   const wins=await Promise.allSettled(['a','b','c'].map(u=>h.start(u)));
   assert.equal(wins.filter(w=>w.status==='fulfilled').length,1);assert(wins.filter(w=>w.status==='rejected').every(w=>w.reason.code==='EDEN_LIVE_CAPACITY'));
   h.advance(601000);
   const good=await h.start('a','new-session');await h.setup(good,'a','new-session');await h.end(good,'a','new-session');
   await assert.rejects(h.start('a','another-session'),{code:'EDEN_LIVE_TESTER_START_LIMIT'});
 }finally{h.done();}
});
test('abandoned setup expires without client cleanup; stale acknowledgements cannot seize a replacement permit',async()=>{
 const h=harness({...liveCapacity({}),teamStarts:1,testerStarts:1});try{
   const abandoned=await h.start('a');h.advance(91000);const b=await h.start('b');
   await assert.rejects(h.setup(abandoned,'a'),{code:'EDEN_LIVE_SETUP_EXPIRED'});await h.end(abandoned,'a');
   await h.setup(b,'b');await h.end(b,'b');await assert.rejects(h.start('c'),{code:'EDEN_LIVE_TEAM_START_LIMIT'});
 }finally{h.done();}
});
test('a resume uses the original logical start and deadline, and consumes a separate provider attempt and provider seat',async()=>{
 const h=harness({...liveCapacity({}),teamStarts:1,testerStarts:1});try{
   const c=await h.start('a');await h.setup(c,'a');h.advance(70000);
   const resumed=await h.start('a',undefined,{callId:c.callId,resumeHandle:'safe-synthetic-resume'});
   assert.equal(resumed.callId,c.callId);assert.equal(resumed.deadline,c.deadline);assert.equal(h.mints,2);
   await assert.rejects(h.start('a',undefined,{callId:c.callId,resumeHandle:'safe-synthetic-resume'}),{code:'EDEN_LIVE_RESUME_DENIED'});
 }finally{h.done();}
});
test('failed provider mints have a hard independent daily budget even when no start succeeds',async()=>{
 const h=harness({...liveCapacity({}),teamAttempts:3,testerAttempts:2});try{
   h.fail=true;for(const u of ['a','a','b'])await assert.rejects(h.start(u),/mint rejected/);
   await assert.rejects(h.start('a','fresh'),{code:'EDEN_LIVE_TESTER_MINT_LIMIT'});await assert.rejects(h.start('c'),{code:'EDEN_LIVE_PROVIDER_BUDGET'});assert.equal(h.mints,3);
 }finally{h.done();}
});
test('invalid staging overrides fail closed and no setting enables three provider seats',()=>{
 for(const v of ['0','3','-1','1.5',''])assert.equal(liveCapacity({EDEN_LIVE_PROVIDER_SEATS:v}),null);
 assert.equal(liveCapacity({EDEN_LIVE_TEAM_STARTS_PER_DAY:'33'}),null);
 assert.equal(liveCapacity({EDEN_LIVE_TEAM_STARTS_PER_DAY:'20'}).teamStarts,20);
});

test('invited Preview overrides allow 48 confirmed starts with 12 per browser while retaining two provider slots',async()=>{
 const policy=liveCapacity({EDEN_LIVE_TEAM_STARTS_PER_DAY:'48',EDEN_LIVE_TESTER_STARTS_PER_DAY:'12',EDEN_LIVE_PROVIDER_ATTEMPTS_PER_DAY:'60',EDEN_LIVE_TESTER_ATTEMPTS_PER_DAY:'16',EDEN_LIVE_PROVIDER_SEATS:'2'});
 assert.deepEqual(policy,{teamStarts:48,testerStarts:12,teamAttempts:60,testerAttempts:16,seats:2});
 const h=harness(policy);try{
   for(let i=0;i<48;i++){
     const tester='invited-'+i%4,session='session-'+i,call=await h.start(tester,session);
     await h.setup(call,tester,session);await h.end(call,tester,session);h.advance(601000);
   }
   await assert.rejects(h.start('invited-0','new-session'),{code:'EDEN_LIVE_TESTER_START_LIMIT'});
   await assert.rejects(h.start('another-invite'),{code:'EDEN_LIVE_TEAM_START_LIMIT'});
   assert.equal(h.mints,48);
 }finally{h.done();}
});
