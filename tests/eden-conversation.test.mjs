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

test('identity, introductions, capabilities and their correction retain the subject; no donor navigation can be proposed',async()=>{
  const {reduceEdenAgentInput}=await import('../shared/eden-agent.ts');
  for(const [text,topic] of [
    ['Who are you?','identity'],['Give me an intro of who you are.','identity'],
    ['I meant introduce yourself, not the donation page.','identity'],['No, I meant introduce yourself.','identity'],['I meant your role, not the homepage.','identity'],
    ['Could you introduse yourself?','identity'],['What can you actually help me do?','capabilities']
  ]){
    const symbols=projectPublicRequest(text), choices=conversationChoices(symbols,home,[],{goal:'giving-guidance'});
    assert(choices.some(c=>c.key===topic),text);
    assert(choices.every(c=>c.kind==='message'),text);
    assert(!reduceEdenAgentInput(text,home).localOnly,'assistant corrections must not become city corrections');
  }
  assert(conversationChoices(projectPublicRequest('What else?'),home,[],{topic:'identity'}).some(c=>c.key==='capabilities'));
  for(const text of ['Tell me how to make a donation.','Don’t introduce yourself, take me to give support.']){
    const opts=conversationChoices(projectPublicRequest(text),home,[]);
    assert(opts.some(c=>c.intent?.goal==='giving-guidance'),text);
    assert(!opts.some(c=>c.key==='identity'),text);
  }
});

test('Gemini must choose a valid profile focus; the confirmed introduction and capabilities are grounded without raw speech or arbitrary model prose',async()=>{
  const calls=[];
  const agent=createEdenAgent(development,{repository:new DemoRepository(),create:async p=>{
    calls.push(p);const input=JSON.parse(p.input),topic=input.signals.includes('identity')?'identity':'capabilities';
    const entry=input.choices.find(c=>c.key===topic&&c.focus==='tour');
    return {status:'requires_action',steps:[{type:'function_call',name:'choose_public_step',arguments:{choice:entry.id}}]};
  }});
  const exact='Give me an intro of who you are.';
  const intro=await agent.understand(projectPublicRequest(exact),home,[],null,signal());
  assert.equal(intro.choice.key,'identity');assert.match(intro.reply,/I’m Eden, Our Ground’s AI assistant/);
  const correction=await agent.understand(projectPublicRequest('I meant introduce yourself, not the donation page.'),home,[],{topic:'identity'},signal());
  assert.match(correction.reply,/Thanks for clarifying/);
  const help=await agent.understand(projectPublicRequest('What can you actually help me do?'),home,[],{topic:'identity'},signal());
  assert.match(help.reply,/explain this page|public directory/);
  assert.equal(calls.length,3);assert(calls.every(call=>!call.input.includes(exact)));
  const invalid=createEdenAgent(development,{repository:new DemoRepository(),create:async()=>({status:'completed',steps:[{type:'function_call',name:'choose_public_step',arguments:{choice:'choice-1',profile_focus:'injected data'}}]})});
  await assert.rejects(invalid.understand(['identity'],home,[],null,signal()),{code:'EDEN_INVALID_AGENT_ACTION'});
});

test('compound requests bind the ordinal only after the directory search; back/map must use the registered detail return control',()=>{
  const sequence=conversationChoices(projectPublicRequest('Find healthcare in Harrisburg and show me the first result.'),home,[]);
  assert(sequence.some(s=>s.kind==='search-and-open'&&s.ordinal===1&&s.intent.category==='healthcare'&&s.intent.cityId==='harrisburg-pa'));
  for(const text of ['Find healthcare in Harrisburg.','Show me the first result.','Find healthcare in Harrisburg and show me the map.', "Find healthcare in Harrisburg and don't show me the first result."]){
    assert(!conversationChoices(projectPublicRequest(text),home,[]).some(s=>s.kind==='search-and-open'));
  }
  const detail={...home,page:'resource',resultCount:1,resourceIds:['11111111-1111-4111-8111-111111111111']};
  const back=projectPublicRequest('Go back and show the map.');
  assert.deepEqual(conversationChoices(back,detail,['show-map','back-to-map']).filter(c=>c.kind==='control'),[{kind:'control',control:'back-to-map'}]);
  assert(!conversationChoices(back,detail,['show-map']).some(s=>s.kind==='control'));
  assert(!conversationChoices(projectPublicRequest("Don't go back and show the map."),detail,['back-to-map','show-map']).some(c=>c.control==='back-to-map'));
  const results={...home,page:'support',category:'food',cityId:'harrisburg-pa',resultCount:0,resourceIds:[]};
  const returnMap=projectPublicRequest('Go back and show me the map.');
  assert.deepEqual(conversationChoices(returnMap,results,['show-map','back-to-map']),[{kind:'control',control:'show-map'}]);
  assert.deepEqual(conversationChoices(returnMap,results,[]),[{kind:'message',key:'clarify'}]);
  assert(!conversationChoices(projectPublicRequest("Don't go back and show the map."),results,['show-map']).some(c=>c.kind==='control'));
  const negativePlace=conversationChoices(projectPublicRequest('Find healthcare, not Harrisburg.'),{...home,cityId:'harrisburg-pa'},[]);
  assert(!negativePlace.some(c=>c.intent?.cityId==='harrisburg-pa'));
  const negativeDonation=conversationChoices(projectPublicRequest('Not the donation page, please.'),home,[]);
  assert(!negativeDonation.some(c=>c.intent?.page==='give'||c.intent?.goal==='giving-guidance'));
  const selection=conversationChoices(projectPublicRequest('No, not the first listing; I meant the second result.'),{...detail,resultCount:2},[]);
  assert(selection.some(c=>c.intent?.goal==='inspect-resource'&&c.intent.ordinal===2));
  assert(!selection.some(c=>c.intent?.goal==='inspect-resource'&&c.intent.ordinal===1));
});

test('an open selection does not authorize reopening it for a page explanation or a category correction',()=>{
  const ctx={page:'resource',synthetic:false,directory:'public',cityId:'harrisburg-pa',category:'healthcare',radius:10,resourceIds:['0005636b-49ce-579d-a98c-746b42e2e886'],resultCount:1,selectedIndex:1};
  const choices=q=>conversationChoices(projectPublicRequest(q),ctx,['back-to-map']);
  assert.deepEqual(choices("Can you explain what's on this page?"),[{kind:'intent',intent:{goal:'explain-page'}}]);
  assert.deepEqual(choices('Actually, I meant food support.'),[{kind:'intent',intent:{goal:'change-category',category:'food'}}]);
  assert(choices('Show me the first result.').some(v=>v.intent?.goal==='inspect-resource'));
  assert(!choices('Actually, I meant healthcare, not food.').some(v=>v.intent?.goal==='change-category'&&v.intent.category==='food'));
});
