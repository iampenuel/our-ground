import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedLive} from '../backend/eden-hosted-live.ts';
import {RELEASE_LIVE_RESERVATION} from '../backend/eden-live-reservation.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';

test('shared call reservations survive instance changes and bind one-use actions to the issuing session',async()=>{
  const entries=new Map(),store=async([op,...a])=>{
    if(op==='EVAL'&&a[0]===RELEASE_LIVE_RESERVATION){if(entries.get(a[2])!==a[3])return 0;entries.delete(a[2]);return 1;}
    if(op==='EVAL'){const n=Number(entries.get(a[2])??0)+1;entries.set(a[2],n);return n;}
    if(op==='SET'){if(entries.has(a[0]))return null;entries.set(a[0],a[1]);return 'OK';}
    const v=entries.get(a[0]);if(op==='GETDEL'||op==='DEL')entries.delete(a[0]);return v??null;
  };
  const agent={inspectLiveContext:async context=>({context,facts:[]}),prepareLiveAction:async action=>({action}),
    reconcileLiveAction:async (_a,_b,outcome,context)=>({context,outcome,facts:[]})};
  let failMint=false;
  const issue=async (_secret,callId,deadline)=>{if(failMint)throw Error('Temporary provider failure');return {callId,deadline};};
  const api=()=>createHostedLive(store,agent,'fixture',issue);
  const context={page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false};
  const nonce=()=>randomBytes(32).toString('base64url');
  const body={nonce:nonce(),context,noticeVersion,liveAudioAcknowledged:true};
  const use=(path,body,session='first',visitor='visitor')=>api()(path,body,session,visitor,Date.now()+900000,new AbortController().signal);
  await assert.rejects(use('live/token',{...body,liveAudioAcknowledged:false}),{code:'EDEN_LIVE_INVALID_REQUEST'});
  const issued=await use('live/token',body);
  assert(issued.deadline>Date.now()+599000);await assert.rejects(use('live/token',{...body,nonce:nonce()},'second'),{code:'EDEN_LIVE_CALL_ACTIVE'});
  const tool={callId:issued.callId,id:'one',noticeVersion,context,name:'perform_public_resource_action',args:{type:'read-page'}};
  await assert.rejects(use('live/tool',tool,'other'),{code:'EDEN_LIVE_CALL_EXPIRED'});
  const grant=await use('live/tool',tool);
  await assert.rejects(use('live/tool',tool),{code:'EDEN_LIVE_TOOL_REPLAY'});
  const done={callId:issued.callId,id:'one',noticeVersion,context,toolToken:grant.toolToken,outcome:'done'};
  assert.equal((await use('live/result',done)).outcome,'done');await assert.rejects(use('live/result',done),{code:'EDEN_LIVE_TOOL_EXPIRED'});
  await use('live/end',{callId:issued.callId,noticeVersion});
  await assert.rejects(use('live/tool',{...tool,id:'two'}),{code:'EDEN_LIVE_CALL_EXPIRED'});
  // A provider-side failure before issuing a token returns the provisional slot.
  failMint=true;await assert.rejects(use('live/token',{...body,nonce:nonce()}),/Temporary provider failure/);failMint=false;
  const next=await use('live/token',{...body,nonce:nonce()});
  assert.notEqual(next.callId,issued.callId);
  await use('live/end',{callId:issued.callId,noticeVersion});
  await use('live/end',{callId:next.callId,noticeVersion},'other-session');
  await assert.rejects(use('live/token',{...body,nonce:nonce()},'other-session','other-visitor'),e=>e.code==='EDEN_LIVE_CAPACITY'&&e.status===429&&e.retryAfterSeconds>0);
  await use('live/tool',{...tool,callId:next.callId,id:'next'});
  await use('live/end',{callId:next.callId,noticeVersion});
  await assert.rejects(use('live/tool',{...tool,callId:next.callId,id:'after-end'}),{code:'EDEN_LIVE_CALL_EXPIRED'});
  // A finished credential is still usable at Google until its absolute expiry.
  await assert.rejects(use('live/token',{...body,nonce:nonce()},'third','third-visitor'),{code:'EDEN_LIVE_CAPACITY'});

});
