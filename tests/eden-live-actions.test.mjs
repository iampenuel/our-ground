import test from 'node:test';
import assert from 'node:assert/strict';
import {createEdenLiveToolExecutor,applyEdenPublicAction} from '../src/eden/live-actions.ts';
import {registerEdenPage,publishEdenApplication} from '../src/eden/application-bridge.ts';
import {EdenLiveServiceError} from '../src/eden/live/session.ts';
const callId='a'.repeat(43),toolToken='b'.repeat(43),signal=()=>new AbortController().signal;
const base={page:'support',category:'food',cityId:'harrisburg-pa',radius:10,resultCount:1,synthetic:true,resourceIds:['11111111-1111-4111-8111-111111111111']};
const call={id:'tool-1',name:'perform_public_resource_action',args:{type:'radius',radius:5}};
function fixture(){let context=structuredClone(base),actions=0;const dispose=registerEdenPage({context:()=>{const {cityId,resourceIds,...minimal}=context;return minimal;},execute:async action=>{actions++;context={...context,radius:action.radius??context.radius};publishEdenApplication();return{status:'done',message:'local-only arbitrary record prose'};}});return{dispose,get:()=>structuredClone(context),count:()=>actions};}
const facts=[{id:'data-kind',text:'These are fictional demonstration records.'}];
test('text and voice share the existing action adapter, with one authorized idempotent action and server-only facts',async()=>{
  const f=fixture();try{let grants=0,results=0;const sent=[];
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async request=>{grants++;sent.push(request);assert.equal(f.count(),0);return{authorized:true,toolToken,action:request.args};},complete:async request=>{results++;sent.push(request);assert.equal(f.count(),1);return{context:request.context,facts,outcome:request.outcome};}});
    const [a,b]=await Promise.all([run(call,signal()),run(call,signal())]);assert.equal(a.outcome,'done');assert.deepEqual(a,b);assert.equal(a.context.radius,5);assert.equal(grants,1);assert.equal(results,1);assert.equal(f.count(),1);
    assert(!JSON.stringify(sent).includes('local-only arbitrary'));assert(!JSON.stringify(a).includes('local-only arbitrary'));
    await assert.rejects(run({...call,args:{type:'radius',radius:50}},signal()));assert.equal(f.count(),1);
    assert.equal((await applyEdenPublicAction({type:'refine',category:'food'},{signal:signal()})).status,'done');assert.equal(f.count(),2);
  }finally{f.dispose();}
});
test('no mutation occurs without a valid matching server grant or after context/revision cancellation',async()=>{
  for(const mode of ['denied','changed-action','stale','aborted']){const f=fixture(),abort=new AbortController();try{
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async()=>{if(mode==='denied')throw Error('raw private error');if(mode==='stale')publishEdenApplication();if(mode==='aborted')abort.abort();return{authorized:true,toolToken,action:mode==='changed-action'?{type:'radius',radius:50}:call.args};},complete:async()=>{throw Error('must not complete');}});
    await assert.rejects(run(call,abort.signal),error=>!error.message.includes('raw private'));assert.equal(f.count(),0);
  }finally{f.dispose();}}
});
test('clarification and context reads use validated server facts without a page action',async()=>{
  const f=fixture();try{let clarified;
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async request=>({authorized:true,toolToken:null,result:{context:request.context,facts},...(request.name==='ask_clarification'?{clarification:{goal:'clarify-search',...request.args}}:{})}),complete:async()=>{throw Error('must not complete');},onClarification:value=>{clarified=value;}});
    assert.deepEqual((await run({id:'read',name:'read_public_page_context',args:{}},signal())).facts,facts);
    await run({id:'clarify',name:'ask_clarification',args:{missing:'city',category:'food'}},signal());assert.deepEqual(clarified,{goal:'clarify-search',missing:'city',category:'food'});assert.equal(f.count(),0);
  }finally{f.dispose();}
});
test('changed page during result reconciliation suppresses stale facts and never repeats the action',async()=>{
  const f=fixture();try{
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async()=>({authorized:true,toolToken,action:call.args}),complete:async request=>{publishEdenApplication();return{context:request.context,facts,outcome:'done'};}});
    await assert.rejects(run(call,signal()));await assert.rejects(run(call,signal()));assert.equal(f.count(),1);
  }finally{f.dispose();}
});
test('a repeated completed tool never replays facts for a different current search',async()=>{
  const f=fixture();try{
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async()=>({authorized:true,toolToken,action:call.args}),complete:async request=>({context:request.context,facts,outcome:'done'})});
    await run(call,signal());await applyEdenPublicAction({type:'radius',radius:25},{signal:signal()});
    await assert.rejects(run(call,signal()));assert.equal(f.count(),2);
  }finally{f.dispose();}
});
test('only the fixed categorized service error survives the tool boundary; arbitrary error content stays suppressed',async()=>{
  const f=fixture();try{
    const expected=new EdenLiveServiceError('access',401,'EDEN_SESSION_REQUIRED');
    const run=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async()=>{throw expected;},complete:async()=>assert.fail('must not mutate or complete')});
    await assert.rejects(run(call,signal()),error=>error===expected&&error.code==='EDEN_SESSION_REQUIRED');assert.equal(f.count(),0);
    const denied=createEdenLiveToolExecutor({callId,getContext:f.get,authorize:async()=>{throw Error('private provider body');},complete:async()=>assert.fail('must not complete')});
    await assert.rejects(denied(call,signal()),error=>!(error instanceof EdenLiveServiceError)&&!error.message.includes('private'));
  }finally{f.dispose();}
});
