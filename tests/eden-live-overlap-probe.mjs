// Optional, bounded protected-preview acceptance. No microphone, audio payload,
// account data, bearer credential or provider URL is copied into the receipt.
import {randomBytes} from 'node:crypto';
import {request} from 'playwright-core';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';
import {validateHostedLiveClock} from '../shared/eden-live.ts';
import {connectEdenLive} from '../src/eden/live/transport.ts';

export async function probeOverlap(origin,protectionToken,primaryOpen){
 const result={status:'FAIL',stage:'origin'};
 if(!/^https:\/\/ourground-staging-(?:[a-z0-9]+|git-eden10)-penuels-projects-aa802b06\.vercel\.app$/.test(origin)||!protectionToken)return result;
 const api=await request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin,'x-vercel-trusted-oidc-idp-token':protectionToken}});
 let bearer,call,wire;
 async function post(path,data){
   result.stage=path;
   const r=await api.post('/api/v1/eden/hosted/'+path,{data,maxRedirects:0,timeout:12000,headers:bearer?{Authorization:'Bearer '+bearer}:{}});
   result.http=r.status();
   const body=await r.json();
   if(!r.ok()){if(/^EDEN_[A-Z_]+$/.test(body.error?.code))result.service=body.error.code;throw Error();}
   return {body,date:r.headers().date};
 }
 try{
   result.stage='eligibility';
   const consent=await api.post('/eligibility',{form:{age:'19plus'},headers:{Accept:'application/json'},maxRedirects:0,timeout:12000});if(!consent.ok())throw Error();
   result.stage='status';
   const status=await api.get('/api/v1/eden/hosted/status',{maxRedirects:0,timeout:12000});
   const policy=(await status.json()).liveTestLimits;
   if(!status.ok()||policy?.seats!==2)throw Error();result.policy=policy;
   bearer=(await post('session',{noticeVersion,acknowledged:true})).body.sessionToken;if(!bearer)throw Error();
   const context={page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false};
   const {body,date}=await post('live/token',{context,noticeVersion,liveAudioAcknowledged:true,nonce:randomBytes(32).toString('base64url')});
   const t=validateHostedLiveClock(body,date,0);if(!t)throw Error();call=t.callId;
   result.stage='google-setup';result.model=t.model;result.voice=t.voiceName;
   wire=await connectEdenLive(t,{message(){},closed(info){result.close=info;}},AbortSignal.timeout(16000));
   result.providerSetup=true;
   if(!(await post('live/connected',{callId:call,noticeVersion})).body.connected)throw Error();
   result.primarySocketOpen=await primaryOpen();if(!result.primarySocketOpen||result.close)throw Error();
   result.status='PASS';result.stage='overlap-confirmed';
 }catch{/* Stages and fixed service classifications suffice; errors may contain sensitive headers. */}
 finally{
   wire?.close();
   if(call){const stage=result.stage;try{result.ended=(await post('live/end',{callId:call,noticeVersion})).body.ended===true;}catch{result.ended=false;}
     result.stage=stage;if(!result.ended)result.status='FAIL';}
   await api.dispose();
 }
 return result;
}
