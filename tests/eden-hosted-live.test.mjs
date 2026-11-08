import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedLive} from '../backend/eden-hosted-live.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';

test('shared call reservations survive instance changes and bind one-use actions to the issuing session',async()=>{
  const entries=new Map(),store=async([op,...a])=>{
    if(op==='EVAL'){const n=Number(entries.get(a[2])??0)+1;entries.set(a[2],n);return n;}
    if(op==='SET'){if(entries.has(a[0]))return null;entries.set(a[0],a[1]);return 'OK';}
    const v=entries.get(a[0]);if(op==='GETDEL'||op==='DEL')entries.delete(a[0]);return v??null;
  };
  const agent={inspectLiveContext:async context=>({context,facts:[]}),prepareLiveAction:async action=>({action}),
    reconcileLiveAction:async (_a,_b,outcome,context)=>({context,outcome,facts:[]})};
  const issue=async (_secret,callId,deadline)=>({callId,deadline});
  const api=()=>createHostedLive(store,agent,'fixture',issue);
  const context={page:'home',radius:10,resultCount:0,resourceIds:[],directory:'public',synthetic:false};
  const nonce=()=>randomBytes(32).toString('base64url');
  const body={nonce:nonce(),context,noticeVersion,liveAudioAcknowledged:true};
  const use=(path,body,session='first')=>api()(path,body,session,'visitor',Date.now()+900000,new AbortController().signal);
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
});
