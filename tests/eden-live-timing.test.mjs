import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readEdenLiveRetryTiming,formatEdenLiveRetryTime,edenLiveCallTime,isEdenLiveDailyLimit} from '../shared/eden-live-timing.ts';
import {EdenLiveError,issueEdenLiveToken} from '../backend/eden-live.ts';
import {createHostedLive} from '../backend/eden-hosted-live.ts';
import {googleRetryAfterSeconds,googleSpeechQuota} from '../backend/eden-speech-quota.ts';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';

const serverDate='Mon, 09 Nov 2026 23:50:00 GMT',resetAt='2026-11-10T00:00:00.000Z';
test('daily reset is the server timestamp rendered in the visitor timezone despite an incorrect device clock',()=>{
 const original=Date.now;Date.now=()=>Date.UTC(2020,0,1);
 try{
   const timing=readEdenLiveRetryTiming({code:'EDEN_LIVE_TESTER_START_LIMIT',resetAt},serverDate,600);
   assert.equal(timing.resetAt,resetAt);
   const local=formatEdenLiveRetryTime(timing.resetAt,'en-US','America/New_York');
   assert.match(local,/Nov 9, 2026/);assert.match(local,/7:00 PM EST/);
   assert.match(formatEdenLiveRetryTime(timing.resetAt,'en-US','Asia/Tokyo'),/Nov 10, 2026/);
   assert.match(formatEdenLiveRetryTime('2026-03-09T00:00:00.000Z','en-US','America/New_York'),/8:00 PM EDT/);
 }finally{Date.now=original;}
});
test('provider limits never borrow an application daily reset and retry timing uses only supplied metadata',()=>{
 assert.equal(isEdenLiveDailyLimit('EDEN_LIVE_PROVIDER_QUOTA'),false);
 assert.deepEqual(readEdenLiveRetryTiming({code:'EDEN_LIVE_PROVIDER_QUOTA',resetAt},serverDate),{});
 assert.deepEqual(readEdenLiveRetryTiming({code:'EDEN_LIVE_PROVIDER_QUOTA'},null),{});
 const supplied=readEdenLiveRetryTiming({code:'EDEN_LIVE_PROVIDER_QUOTA'},serverDate,30);
 assert.equal(supplied.retryAt,'2026-11-09T23:50:31.000Z');
 assert.deepEqual(readEdenLiveRetryTiming({resetAt:'private-canary',retryAt:'https://private.invalid'},'invalid',30),{});
});
test('concurrency Retry-After produces a conservative service-clock retry time',()=>{
 const timing=readEdenLiveRetryTiming({code:'EDEN_LIVE_CAPACITY'},serverDate,386);
 assert.equal(timing.retryAt,'2026-11-09T23:56:27.000Z');assert.equal(timing.resetAt,undefined);
 assert.equal(readEdenLiveRetryTiming({retryAt:'2026-11-09T23:56:26.500Z'},serverDate,386).retryAt,'2026-11-09T23:56:26.500Z');
});
test('remaining time and near-end warnings use a monotonic deadline and never extend after a wall-clock jump',()=>{
 const end=1000+600000;
 assert.deepEqual(edenLiveCallTime(end,1000),{seconds:600,label:'10:00',warning:''});
 assert.equal(edenLiveCallTime(end,end-61000).warning,'');
 assert.match(edenLiveCallTime(end,end-60000).warning,/about a minute/);
 assert.match(edenLiveCallTime(end,end-15000).warning,/ending shortly/);
 const original=Date.now;Date.now=()=>Date.UTC(1999,0,1);
 try{assert.equal(edenLiveCallTime(end,end-15000).label,'0:15');assert.equal(edenLiveCallTime(end,end+1000).label,'0:00');}
 finally{Date.now=original;}
});
test('hosted daily admission emits exact next UTC midnight and actual seconds until reset',async()=>{
 const now=Date.UTC(2026,10,9,23,59,30),original=Date.now;Date.now=()=>now;
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const exhausted='og:adult:eden:v1:rate:live:'+hash('provider:tester:tester:2026-11-09');
 const rows=new Map([[exhausted,'8']]);
 const store=async([op,...args])=>{
   if(op==='GET')return rows.get(args[0])??null;
   if(op==='SET'){if(rows.has(args[0]))return null;rows.set(args[0],args[1]);return 'OK';}
   if(op==='EVAL')return 1;
   if(op==='DEL')return rows.delete(args[0])?1:0;
   throw Error('unexpected operation');
 };
 try{
   const api=createHostedLive(store,{inspectLiveContext:async()=>({})},'synthetic',async()=>{throw Error('provider must not be called');});
   await assert.rejects(api('live/token',{noticeVersion:EDEN_NOTICE_VERSION,liveAudioAcknowledged:true,nonce:'n'.repeat(43),context:{page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false}},'session','tester',now+900000,new AbortController().signal),error=>{
     assert.equal(error.code,'EDEN_LIVE_TESTER_MINT_LIMIT');assert.equal(error.resetAt,resetAt);assert.equal(error.retryAfterSeconds,30);return true;
   });
 }finally{Date.now=original;}
});
test('Google token errors preserve only an actual RetryInfo or Retry-After delay',async()=>{
 const now=Date.UTC(2026,10,9,12);
 const rpc={status:429,error:{code:429,details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:{seconds:'41',nanos:500000000}}]}};
 assert.equal(googleRetryAfterSeconds(rpc,now),42);assert.equal(googleSpeechQuota(rpc,'gemini-3.8-flash-lite-tts',now).retryAfterSeconds,42);
 for(const [error,retry] of [[rpc,42],[{status:429,headers:{'Retry-After':'17'}},17],[{status:429,message:'private-provider-canary'},undefined]]){
   await assert.rejects(issueEdenLiveToken('synthetic','a'.repeat(43),now+600000,true,undefined,undefined,async()=>{throw error;},()=>now),failure=>{
     assert(failure instanceof EdenLiveError);assert.equal(failure.code,'EDEN_LIVE_PROVIDER_QUOTA');assert.equal(failure.retryAfterSeconds,retry);assert.equal(failure.resetAt,undefined);assert.doesNotMatch(JSON.stringify(failure),/private-provider-canary/);return true;
   });
 }
});


test('pending setup permits produce a short retry rather than a false next-day allowance reset',async()=>{
 const now=Date.UTC(2026,10,9,23,50),original=Date.now;Date.now=()=>now;
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const heldKey='og:adult:eden:v1:live:'+hash('start:2026-11-09:team:0');
 try{
   for(const [value,code,wait] of [['p'.repeat(43),'EDEN_LIVE_CAPACITY',90],['ready:'+'p'.repeat(43),'EDEN_LIVE_TEAM_START_LIMIT',600]]){
     const rows=new Map([[heldKey,value]]);
     const store=async([op,...args])=>{
       if(op==='GET')return rows.get(args[0])??null;
       if(op==='SET'){if(rows.has(args[0]))return null;rows.set(args[0],args[1]);return 'OK';}
       if(op==='EVAL')return 1;
       if(op==='DEL')return rows.delete(args[0])?1:0;
       throw Error('unexpected operation');
     };
     const api=createHostedLive(store,{inspectLiveContext:async()=>({})},'synthetic',async()=>{throw Error('provider must not be called');},{teamStarts:1,testerStarts:1,teamAttempts:2,testerAttempts:2,seats:2});
     await assert.rejects(api('live/token',{noticeVersion:EDEN_NOTICE_VERSION,liveAudioAcknowledged:true,nonce:'n'.repeat(43),context:{page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false}},'session','tester',now+900000,new AbortController().signal),error=>{
       assert.equal(error.code,code);assert.equal(error.retryAfterSeconds,wait);assert.equal(error.resetAt,code==='EDEN_LIVE_CAPACITY'?undefined:resetAt);return true;
     });
   }
 }finally{Date.now=original;}
});
