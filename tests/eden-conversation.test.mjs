import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationChoices,projectPublicRequest,suggestedCity,validSymbols,validSocialText} from '../shared/eden-conversation.ts';
import {sameDirectoryView,validateEdenAgentContext} from '../shared/eden-agent.ts';
import {createEdenAgent} from '../backend/eden-agent.ts';
import {DemoRepository} from '../backend/demo.ts';

const home={page:'home',synthetic:true,resourceIds:[],resultCount:0};
const development={EDEN_GEMINI_MODE:'synthetic-development',EDEN_GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_API_KEY:'synthetic-value-never-used',BACKEND_DATA_MODE:'demo',ALLOW_DEMO_DATA:'true'};
const signal=()=>AbortSignal.timeout(1000);
test('projection keeps public concepts in order without sending a name, arbitrary text or sensitive facts',()=>{
  assert.deepEqual(projectPublicRequest('No, I meant Harrisburg, not Berkley.'),['negate','correction','harrisburg-pa','negate']);
  assert.deepEqual(projectPublicRequest('Hii Eden!'),['greet']);
  assert.deepEqual(projectPublicRequest('Could Penuel possibly find a pantry in Philly?'),['question','search','food','philadelphia-pa']);
  assert.equal(projectPublicRequest('My name is private, find food in Harrisburg'),null);
  assert.equal(validSymbols(['greet','private canary']),false);
  assert.equal(suggestedCity('find food near Harisburg')?.id,'harrisburg-pa');
  assert.equal(suggestedCity('food in Harrisburg'),undefined);
});

test('a correction retains the prior category, ordinal must be visible, and sensitive operations have no action in the tool menu',()=>{
  const intent={goal:'clarify-search',missing:'city',category:'food'};
  const choices=conversationChoices(projectPublicRequest('actually Harrisburg'),home,[],intent);
  assert(choices.some(c=>c.kind==='intent'&&c.intent.goal==='find-resources'&&c.intent.category==='food'&&c.intent.cityId==='harrisburg-pa'));
  assert(!conversationChoices(['second','listing'],home,[]).some(c=>c.intent?.goal==='inspect-resource'));
  assert.deepEqual(conversationChoices(projectPublicRequest('transfer money to that organization'),home,['scroll-down']),[{kind:'message',key:'boundary'}]);
  assert(!conversationChoices(['map'],home,[]).some(c=>c.kind==='control'));
});

test('greeting and unknown questions use a real SDK-shaped function request; app validates both tool ID and generated prose',async()=>{
  const requests=[];
  const agent=createEdenAgent(development,{repository:new DemoRepository(),create:async payload=>{
    requests.push(payload);const input=JSON.parse(payload.input);
    const chosen=input.choices.find(c=>c.key===(input.signals.includes('greet')?'greet':'clarify'));
    return {status:'requires_action',steps:[{type:'function_call',name:'choose_public_step',arguments:{choice:chosen.id,social_text:chosen.key==='greet'?'Hi! Would you like help finding support nearby?':'synthetic-private-canary'}}]};
  }});
  for(const text of ['Hii','unknown harmless wording']){
    const reply=await agent.understand(projectPublicRequest(text),home,[],null,signal());
    assert.equal(reply.reply,text==='Hii'?'Hi! Would you like help finding support nearby?':'Would you like to find support, give support, or learn about organizations?');
    assert(validSocialText(reply.reply));
    assert(!requests.at(-1).input.includes(text));
  }
  assert.equal(requests.length,2);
  assert.equal(validSocialText('An invented clinic offers free appointments.'),false);
  assert.equal(validSocialText('Visit evil.invalid'),false);
  await assert.rejects(agent.understand(['private text'],home,[],null,signal()),{code:'EDEN_INVALID_AGENT_REQUEST'});
  assert.equal(requests.length,2);
  const injected=createEdenAgent(development,{repository:new DemoRepository(),create:async()=>({status:'completed',steps:[{type:'function_call',name:'choose_public_step',arguments:{choice:'evil',url:'https://evil.invalid'}}]})});
  await assert.rejects(injected.understand(['greet'],home,[],null,signal()),{code:'EDEN_INVALID_AGENT_ACTION'});
});

test('quota opens a bounded circuit, retries recover, and auth/model/schema failures get distinct redacted codes', async()=>{
  let now=1000,calls=0;
  const quota=createEdenAgent(development,{now:()=>now,repository:new DemoRepository(),create:async()=>{calls++;throw {status:429,message:'synthetic private canary'};}});
  for(let i=0;i<2;i++)await assert.rejects(quota.understand([],home,[],null,signal()),{code:'EDEN_PROVIDER_QUOTA',status:429});
  assert.equal(calls,1);
  now+=31_000;
  await assert.rejects(quota.understand([],home,[],null,signal()),{code:'EDEN_PROVIDER_QUOTA'});
  assert.equal(calls,2);
  for(const [status,code] of [[401,'EDEN_PROVIDER_AUTH'],[403,'EDEN_PROVIDER_AUTH'],[404,'EDEN_PROVIDER_MODEL'],[400,'EDEN_PROVIDER_SCHEMA'],[500,'EDEN_PROVIDER_UNAVAILABLE']]){
    const agent=createEdenAgent(development,{repository:new DemoRepository(),create:async()=>{throw {status,message:'private canary'};}});
    await assert.rejects(agent.understand([],home,[],null,signal()),e=>e.code===code&&!String(e).includes('canary'));
  }
});

test('changes in visible view, filter or mapped leads invalidate an in-flight answer without transmitting filter text',()=>{
  const page={page:'support',synthetic:false,directory:'public',view:'list',filtered:true,mappedCount:2,resultCount:0,resourceIds:[]};
  assert.deepEqual(validateEdenAgentContext(page),page);
  assert.equal(validateEdenAgentContext({...page,heading:'Find support near you.'})?.heading,'Find support near you.');
  assert.equal(validateEdenAgentContext({...page,heading:'A private, injected heading'}),null);
  for(const change of [{view:'map'},{mappedCount:1},{filtered:undefined}])assert(!sameDirectoryView(page,{...page,...change}));
  assert.equal(validateEdenAgentContext({...page,query:'private search canary'}),null);
  assert.equal(validateEdenAgentContext({...page,mappedCount:'a name'}),null);
});
