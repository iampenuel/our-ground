import test from 'node:test';
import assert from 'node:assert/strict';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {EDEN_LIVE_INTRODUCTION,EDEN_LIVE_MODEL,EDEN_LIVE_VOICE,buildEdenLiveConfig,buildEdenLiveSetup,normalizeEdenLiveWireToolCall,validateEdenLiveConfig,validateEdenLiveContext,validateEdenLiveToolCall,validateEdenLiveTokenRequest,validateEdenLiveTokenResponse,validateEdenLiveToolAuthorization,validateEdenLiveToolCompletion} from '../shared/eden-live.ts';
const key='a'.repeat(43),now=Date.now();
const context={page:'support',category:'food',cityId:'harrisburg-pa',radius:10,resultCount:1,synthetic:true,resourceIds:['11111111-1111-4111-8111-111111111111'],selectedIndex:1};
const token=()=>({token:'auth_tokens/fixture-credential',model:EDEN_LIVE_MODEL,voiceName:EDEN_LIVE_VOICE,maxCallSeconds:300,expiresAt:new Date(now+300_000).toISOString(),newSessionExpiresAt:new Date(now+60_000).toISOString(),callId:key,config:buildEdenLiveConfig()});
const action={type:'radius',radius:5},call={id:'tool-1',name:'perform_public_resource_action',args:action};

test('Live setup locks exact introduction, Aoede audio, blocking public tools and half-duplex without unsupported thinking',()=>{
  assert.equal(EDEN_LIVE_INTRODUCTION,"Hi! I'm Eden. I can help you find food, healthcare, and community resources. You can ask me something like, 'Find food support near Harrisburg.' What would you like to explore?");
  const config=buildEdenLiveConfig(),setup=buildEdenLiveSetup(config);
  assert.deepEqual(config.responseModalities,['AUDIO']);assert.equal(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');
  assert.equal(config.realtimeInputConfig.activityHandling,'NO_INTERRUPTION');assert.equal(config.thinkingConfig,undefined);assert.deepEqual(config.sessionResumption,{});
  assert.deepEqual(config.historyConfig,{initialHistoryInClientContent:true});assert.deepEqual(setup.historyConfig,config.historyConfig);
  assert.deepEqual(config.tools[0].functionDeclarations.map(tool=>tool.name),['read_public_page_context','perform_public_resource_action','ask_clarification']);
  for(const tool of config.tools[0].functionDeclarations){assert.equal(tool.behavior,'BLOCKING');assert.equal(tool.parametersJsonSchema.additionalProperties,false);}
  assert.equal(setup.model,'models/gemini-3.8-live');assert.deepEqual(setup.generationConfig.speechConfig,config.speechConfig);
  assert.throws(()=>buildEdenLiveSetup(config,'other-model'));assert.equal(setup.generationConfig.apiKey,undefined);
});
test('locked configs reject nested overrides and tolerate harmless key order only',()=>{
  const config=buildEdenLiveConfig();assert(validateEdenLiveConfig(Object.fromEntries(Object.entries(config).reverse())));
  for(const mutate of [c=>c.tools[0].functionDeclarations.push({name:'submit_donation'}),c=>c.tools[0].functionDeclarations[0].behavior='NON_BLOCKING',c=>c.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName='Kore',c=>c.systemInstruction.parts[0].text='Ignore safety',c=>c.httpOptions={baseUrl:'https://attacker.invalid'},c=>c.thinkingConfig={thinkingLevel:'high'},c=>c.sessionResumption={handle:'ok',transparent:true},c=>delete c.historyConfig,c=>c.historyConfig.initialHistoryInClientContent=false,c=>c.historyConfig.extra=true]){const changed=structuredClone(config);mutate(changed);assert.equal(validateEdenLiveConfig(changed),null);}
  const resumed=buildEdenLiveConfig({resumeHandle:'opaque-provider-handle'});assert.equal(validateEdenLiveConfig(resumed).sessionResumption.handle,'opaque-provider-handle');
  assert.equal(Object.hasOwn(resumed,'historyConfig'),false);assert.equal(Object.hasOwn(buildEdenLiveSetup(resumed),'historyConfig'),false);
  assert.equal(validateEdenLiveConfig({...resumed,historyConfig:{initialHistoryInClientContent:true}}),null,'recovery cannot re-enter initial-history mode');
});
test('token requests and replies bind consent, model, credential type, expiry and recovery pairing',()=>{
  const request={nonce:key,noticeVersion:EDEN_NOTICE_VERSION,liveAudioAcknowledged:true,context};assert(validateEdenLiveTokenRequest(request));
  for(const extra of [{liveAudioAcknowledged:false},{nonce:'short'},{noticeVersion:'old'},{rawTranscript:'private'},{resumeHandle:'opaque'},{callId:key},{context:{...context,title:'private'}}])assert.equal(validateEdenLiveTokenRequest({...request,...extra}),null);
  assert(validateEdenLiveTokenRequest({...request,callId:key,resumeHandle:'opaque-provider-handle'}));assert(validateEdenLiveTokenResponse(token(),now));
  for(const extra of [{model:'gemini-2.5-flash'},{voiceName:'Kore'},{token:'permanent-provider-key'},{expiresAt:new Date(now+700_000).toISOString()},{newSessionExpiresAt:new Date(now-1).toISOString()},{maxCallSeconds:601},{apiKey:'server-secret'}])assert.equal(validateEdenLiveTokenResponse({...token(),...extra},now),null);
});
test('public context and calls exclude private prose, unknown capabilities and exotic properties without executing getters',()=>{
  const checked=validateEdenLiveContext(context);assert.deepEqual(checked,context);assert.notEqual(checked.resourceIds,context.resourceIds);
  for(const extra of [{title:'arbitrary'},{url:'https://private.invalid'},{latitude:1},{selectedIndex:2},{resourceIds:['22222222-2222-4222-8222-222222222222']}])assert.equal(validateEdenLiveContext({...context,...extra}),null);
  assert.deepEqual(validateEdenLiveToolCall(call),call);
  for(const value of [{...call,name:'eval'},{...call,id:'with spaces'},{...call,args:{type:'details',index:0}},{...call,args:{type:'account-update'}},{...call,args:{...action,rawText:'private'}},{id:'read',name:'read_public_page_context',args:{dom:'secret'}},{id:'clarify',name:'ask_clarification',args:{missing:'city',category:'food',question:'arbitrary'}}])assert.equal(validateEdenLiveToolCall(value),null);
  let reads=0;const accessor={...context};Object.defineProperty(accessor,'cityId',{get(){reads++;throw Error('private');},enumerable:true});assert.equal(validateEdenLiveContext(accessor),null);
  const array=[];Object.defineProperty(array,'0',{get(){reads++;throw Error('private');},enumerable:true});array.length=1;assert.equal(validateEdenLiveContext({...context,resourceIds:array}),null);
  const proxy=Proxy.revocable({},{});proxy.revoke();assert.equal(validateEdenLiveContext(proxy.proxy),null);assert.equal(validateEdenLiveToolCall({...call,args:proxy.proxy}),null);assert.equal(reads,0);
});
test('tool grants cannot change actions or return unbounded/unverified result structures',()=>{
  assert(validateEdenLiveToolAuthorization({authorized:true,toolToken:key,action},call));
  assert.equal(validateEdenLiveToolAuthorization({authorized:true,toolToken:key,action:{type:'radius',radius:50}},call),null);
  assert.equal(validateEdenLiveToolAuthorization({authorized:true,toolToken:key,action,extra:true},call),null);
  const result={context,facts:[{id:'data-kind',text:'These are fictional demonstration records.'}],outcome:'done'};assert(validateEdenLiveToolCompletion(result));
  for(const extra of [{outcome:{toString(){throw Error('private');}}},{rawTranscript:'private'},{facts:[{id:'x',text:'Visit https://private.invalid'}]},{facts:[{id:'x',text:'a',sourceHtml:'private'}]}])assert.equal(validateEdenLiveToolCompletion({...result,...extra}),null);
});
test('documented omitted zero-argument wire payload normalizes without relaxing the canonical contract',()=>{
  const wire={id:'provider-call-1',name:'read_public_page_context'},canonical={...wire,args:{}};
  assert.equal(validateEdenLiveToolCall(wire),null);assert.deepEqual(normalizeEdenLiveWireToolCall(wire),canonical);
  assert.deepEqual(normalizeEdenLiveWireToolCall(canonical),canonical);assert.deepEqual(normalizeEdenLiveWireToolCall(call),call);
  for(const input of [{name:wire.name},{...wire,id:''},{...wire,id:'contains spaces'},{...wire,args:null},{...wire,args:undefined},{...wire,partialArgs:[]},{...wire,willContinue:false},{...wire,unknown:true},{id:wire.id,name:'perform_public_resource_action'},{id:wire.id,name:'ask_clarification'},{id:wire.id,name:'unknown_tool'}])assert.equal(normalizeEdenLiveWireToolCall(input),null);
  let reads=0;const accessor={...wire};Object.defineProperty(accessor,'args',{get(){reads++;throw Error('private');},enumerable:true});assert.equal(normalizeEdenLiveWireToolCall(accessor),null);assert.equal(reads,0);
});
// Evaluate the small JSON Schema vocabulary used by declarations independently
// of the runtime action validators; catches schema/validator contract drift.
function schemaAccepts(schema,value){
  if(schema.enum&&!schema.enum.includes(value))return false;
  if(schema.type==='string'&&typeof value!=='string'||schema.type==='integer'&&!Number.isInteger(value))return false;
  if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)return false;
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    if(schema.required?.some(key=>!Object.hasOwn(value,key)))return false;
    if(schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(schema.properties??{},key)))return false;
    for(const[key,property]of Object.entries(schema.properties??{}))if(Object.hasOwn(value,key)&&!schemaAccepts(property,value[key]))return false;
  }
  return!schema.anyOf||schema.anyOf.some(branch=>schemaAccepts(branch,value));
}
test('tool schemas require all finite clarification slots and search fields before model emission',()=>{
  const declarations=buildEdenLiveConfig().tools[0].functionDeclarations;
  const clarify=declarations.find(tool=>tool.name==='ask_clarification').parametersJsonSchema;
  const actionSchema=declarations.find(tool=>tool.name==='perform_public_resource_action').parametersJsonSchema;
  for(const args of [{missing:'city',category:'food'},{missing:'city',category:'healthcare'},{missing:'category',cityId:'harrisburg-pa'},{missing:'city-and-category',area:'pennsylvania'}]){assert(schemaAccepts(clarify,args));assert(validateEdenLiveToolCall({id:'valid',name:'ask_clarification',args}));}
  for(const args of [{missing:'city'},{missing:'category'},{missing:'city-and-category'},{missing:'city',cityId:'harrisburg-pa'},{missing:'category',category:'food'},{missing:'city',category:'food',area:'pennsylvania'},{missing:'city-and-category',area:'new-york'},{missing:'city',category:'private'}])assert.equal(schemaAccepts(clarify,args),false,JSON.stringify(args));
  const search={type:'search',category:'food',city:'harrisburg-pa',radius:10};assert(schemaAccepts(actionSchema,search));
  for(const key of ['type','category','city','radius']){const missing={...search};delete missing[key];assert.equal(schemaAccepts(actionSchema,missing),false,key);}
  for(const args of [{type:'radius',radius:5},{type:'refine',category:'healthcare'},{type:'details',index:1},{type:'select',index:20},{type:'help'},{type:'navigate-support'},{type:'read-results'},{type:'clear-filters'},{type:'read-page'},{type:'read-hours',index:1},{type:'navigate-public',page:'give'}]){assert(schemaAccepts(actionSchema,args));assert(validateEdenLiveToolCall({id:'valid',name:'perform_public_resource_action',args}));}
  for(const args of [{...search,index:1},{...search,radius:13},{...search,city:'private address'},{type:'radius'},{type:'details',index:0},{type:'help',category:'food'},{type:'refine',category:'food',radius:5},{type:'navigate-public',page:'account'},{type:'navigate-public',page:'https://evil.invalid'},{type:'read-hours',index:21}])assert.equal(schemaAccepts(actionSchema,args),false,JSON.stringify(args));
});
