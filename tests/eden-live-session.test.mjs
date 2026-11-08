import test from 'node:test';
import assert from 'node:assert/strict';
import {createEdenLiveSession,EdenLiveServiceError} from '../src/eden/live/session.ts';
import {connectEdenLive} from '../src/eden/live/transport.ts';
import {buildEdenLiveConfig,EDEN_LIVE_MODEL,EDEN_LIVE_INTRODUCTION_PROMPT} from '../shared/eden-live.ts';

const NOW=Date.now(),context={page:'home',synthetic:true,resultCount:0,resourceIds:[]};
function token(resumeHandle){return{token:'auth_tokens/synthetic-test-only',model:EDEN_LIVE_MODEL,voiceName:'Aoede',callId:'a'.repeat(43),expiresAt:new Date(NOW+300000).toISOString(),newSessionExpiresAt:new Date(NOW+60000).toISOString(),maxCallSeconds:300,config:buildEdenLiveConfig(resumeHandle?{resumeHandle}:{})};}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));};
function harness(overrides={}){
  const saved=new Map(['document','window'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners=new Map(),doc={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'window',{configurable:true,value:doc});
  const states=[],transcripts=[],levels=[],inputLevels=[],requests=[],releases=[],connections=[],actions=[];
  let onFrame,activity,outputLevel,onOutputState,onInputState,started=0,micStarts=0,micStopped=0,outputClosed=0,queued=0,drains=[];
  const output={async init(){started++;},enqueue(){queued++;},drain(signal){if(!queued)return Promise.resolve();return new Promise((resolve,reject)=>{const abort=()=>reject(new Error('aborted'));signal.addEventListener('abort',abort,{once:true});drains.push(()=>{signal.removeEventListener('abort',abort);resolve();});});},setMuted(){},stop(){queued=0;for(const resolve of drains.splice(0))resolve();activity(false);outputLevel(0);},close(){outputClosed++;this.stop();}};
  const mic={active:false,async start(){micStarts++;this.active=true;},setMuted(value){this.muted=value;},stop(){micStopped++;this.active=false;}};
  const controller=createEdenLiveSession({getToken:async request=>{requests.push(request);return token(request.resumeHandle);},releaseToken:id=>releases.push(id),getContext:()=>context,onToolCall:async(call,signal)=>{actions.push({call,signal});return{context,facts:[]};},onState:value=>states.push(value),onTranscript:value=>transcripts.push(value),onAudioLevel:value=>levels.push(value),onInputLevel:value=>inputLevels.push(value),...overrides.options},{document:doc,now:()=>NOW,cooldownMs:0,output:(level,active,state)=>{outputLevel=level;activity=active;onOutputState=state;return output;},microphone:(frame,_failure,state)=>{onFrame=frame;onInputState=state;return mic;},connect:async(_token,callbacks,signal)=>{const sent=[],connection={send:value=>sent.push(value),close(){this.closed=true;},sent,callbacks};connections.push(connection);signal.addEventListener('abort',()=>connection.close(),{once:true});return connection;},...overrides.dependencies});
  const result={controller,doc,listeners,states,transcripts,levels,inputLevels,requests,releases,connections,actions,output,mic,
    get started(){return started;},get micStarts(){return micStarts;},get micStopped(){return micStopped;},get outputClosed(){return outputClosed;},get queued(){return queued;},
    message(value,index=connections.length-1){connections[index].callbacks.message(value);},frame(value=.2){onFrame(new Float32Array(1024).fill(value),48000);},
    frames(value,count){for(let i=0;i<count;i++)this.frame(value);},speech(){this.frames(.2,8);},
    playback(value){activity(value);},inputState(value){onInputState(value);},outputState(value){onOutputState(value);},
    flush(){queued=0;for(const resolve of drains.splice(0))resolve();},
    audio(){this.message({serverContent:{modelTurn:{parts:[{inlineData:{data:'AAAA',mimeType:'audio/pcm;rate=24000'}}]}}});},
    async finish(){this.message({serverContent:{turnComplete:true}});this.flush();await settle();},
    async intro(){await controller.start({microphoneConsent:true});this.audio();await this.finish();},
    cleanup(){controller.dispose();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}};return result;
}

test('call requires explicit consent, initializes audio/mic once, and waits for genuine intro completion plus drain',async()=>{
  const h=harness();try{
    await h.controller.start({microphoneConsent:false});assert.equal(h.started,0);assert.equal(h.micStarts,0);assert.equal(h.requests.length,0);assert.equal(h.controller.snapshot.phase,'permission-required');
    await h.controller.start({microphoneConsent:true});assert.equal(h.started,1);assert.equal(h.micStarts,1);assert.equal(h.requests.length,1);
    assert.match(h.requests[0].nonce,/^[A-Za-z0-9_-]{43}$/);assert.deepEqual(h.requests[0].context,context);
    assert.equal(h.controller.snapshot.phase,'introducing');h.frame();assert.equal(h.connections[0].sent.some(item=>item.realtimeInput?.audio),false);
    const seed=h.connections[0].sent[0].clientContent;
    assert.equal(seed.turnComplete,true,'history mode terminates the canonical seed before realtime input');assert.equal(seed.turns[0].role,'user');
    assert.deepEqual(JSON.parse(seed.turns[0].parts[0].text.split('\n')[1]),context);
    assert.deepEqual(h.connections[0].sent[1],{realtimeInput:{text:EDEN_LIVE_INTRODUCTION_PROMPT}});
    assert.equal(h.controller.snapshot.diagnostic.turnComplete,0,'the client history terminator is not a generated model turn');
    assert.equal(h.connections[0].sent.filter(item=>item.realtimeInput?.text===EDEN_LIVE_INTRODUCTION_PROMPT).length,1);
    h.audio();h.message({serverContent:{generationComplete:true}});await settle();assert.equal(h.controller.snapshot.forwarding,false);
    h.message({serverContent:{turnComplete:true}});await settle();assert.equal(h.controller.snapshot.forwarding,false,'server completion is not browser drain');
    h.flush();await settle();assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.forwarding,true);
    await h.controller.start({microphoneConsent:true});assert.equal(h.requests.length,1,'a second click cannot start a parallel call');
    h.frame();assert.ok(h.connections[0].sent.some(item=>item.realtimeInput?.audio?.mimeType==='audio/pcm;rate=16000'));
  }finally{h.cleanup();}
});

test('microphone denial leaves text fallback and does not mint a provider credential',async()=>{
  const h=harness({dependencies:{microphone:()=>({active:false,async start(){throw new DOMException('denied','NotAllowedError');},setMuted(){},stop(){}})}});try{
    await h.controller.start({microphoneConsent:true});assert.equal(h.controller.snapshot.phase,'permission-required');assert.match(h.controller.snapshot.reason,/permission/);assert.equal(h.controller.snapshot.diagnostic.failure,'microphone-denied');assert.equal(h.requests.length,0);assert.equal(h.outputClosed,1);assert.equal(h.controller.snapshot.microphoneActive,false);
  }finally{h.cleanup();}
});

test('preparation is bounded, distinguishes pending permission from paused output, and never mints before readiness',async()=>{
  let grant;const micGate=new Promise(resolve=>{grant=resolve;}),pendingMic={active:false,start:()=>micGate,setMuted(){},stop(){this.stopped=true;}};
  const pending=harness({dependencies:{microphone:()=>pendingMic,preparationTimeoutMs:10}});try{
    await pending.controller.start({microphoneConsent:true});assert.equal(pending.controller.snapshot.phase,'permission-required');assert.equal(pending.controller.snapshot.diagnostic.failure,'permission-pending');assert.match(pending.controller.snapshot.reason,/still pending/);assert.equal(pending.requests.length,0);assert.equal(pendingMic.stopped,true);
    const before=pending.controller.snapshot;grant();await settle();assert.deepEqual(pending.controller.snapshot,before,'late preparation cannot resurrect a timed-out call');
  }finally{pending.cleanup();}
  let resume;const outputGate=new Promise(resolve=>{resume=resolve;}),paused=harness({dependencies:{output:()=>({init:()=>outputGate,enqueue(){},drain:async()=>{},setMuted(){},stop(){},close(){}}),preparationTimeoutMs:10}});try{
    const start=paused.controller.start({microphoneConsent:true});await settle();assert.equal(paused.controller.snapshot.diagnostic.preparation,'audio-output-pending');assert.equal(paused.controller.snapshot.microphoneActive,true);assert.match(paused.controller.snapshot.reason,/browser audio playback/);
    await start;assert.equal(paused.controller.snapshot.phase,'error');assert.equal(paused.controller.snapshot.diagnostic.failure,'audio-output-timeout');assert.equal(paused.controller.snapshot.microphoneActive,false);assert.equal(paused.requests.length,0);resume();await settle();assert.equal(paused.controller.snapshot.phase,'error');
  }finally{paused.cleanup();}
});

test('ending during unresolved preparation settles start and clears resources without awaiting a native prompt',async()=>{
  const h=harness({dependencies:{microphone:()=>({active:false,start:()=>new Promise(()=>{}),setMuted(){},stop(){}})}});try{
    const start=h.controller.start({microphoneConsent:true});await settle();h.controller.end();await start;assert.equal(h.controller.snapshot.phase,'ended');assert.equal(h.requests.length,0);assert.equal(h.outputClosed,1);
  }finally{h.cleanup();}
});

test('actual provider transcripts share turn IDs and fresh page state is obtained through tools without interleaved context turns',async()=>{
  let page=context;
  const h=harness({options:{getContext:()=>page,onToolCall:async()=>({context:page,facts:[]})}});try{
    await h.controller.start({microphoneConsent:true});
    h.message({serverContent:{outputTranscription:{text:'Hi, ',finished:false}}});
    h.message({serverContent:{outputTranscription:{text:"I am Eden.",finished:true}}});h.audio();await h.finish();
    const intro=h.transcripts.filter(item=>item.role==='assistant');assert.equal(intro.at(-1).text,'Hi, I am Eden.');assert.equal(new Set(intro.map(item=>item.turnId)).size,1);
    h.speech();h.message({serverContent:{inputTranscription:{text:'Find food in Harrisburg.',finished:true}}});
    h.message({serverContent:{outputTranscription:{text:'I can search that city.',finished:true}}});h.audio();await h.finish();
    const user=h.transcripts.find(item=>item.role==='user'),answer=h.transcripts.find(item=>item.role==='assistant'&&item.text==='I can search that city.');assert.equal(user.turnId,answer.turnId);assert.notEqual(user.turnId,intro[0].turnId);
    page={page:'support',category:'food',cityId:'harrisburg-pa',radius:5,resultCount:0,synthetic:true,resourceIds:[]};
    assert.equal(h.controller.sendText('Show the current results.'),true);
    const sent=h.connections[0].sent,history=sent.filter(item=>item.clientContent?.turns[0].parts[0].text.startsWith('[Verified public page state]'));
    assert.equal(history.length,1);assert.deepEqual(JSON.parse(history[0].clientContent.turns[0].parts[0].text.split('\n')[1]),context);
    assert.equal(sent.some(item=>item.clientContent?.turnComplete===false),false,'no unfinished context turns are mixed with realtime audio');
    assert.equal(history.some(item=>JSON.stringify(item).includes('Find food in Harrisburg.')),false,'raw transcripts are not copied into history');
    assert.equal(sent.at(-1).clientContent.turnComplete,true);assert.equal(h.controller.snapshot.forwarding,false);
    h.message({toolCall:{functionCalls:[{id:'fresh-context',name:'read_public_page_context',args:{}}]}});await settle();
    assert.deepEqual(sent.find(item=>item.toolResponse)?.toolResponse.functionResponses[0].response,{context:page,facts:[]});
  }finally{h.cleanup();}
});

test('voice continuity seeds validated pending public slots once without replaying chat or later history',async()=>{
  let pending={goal:'clarify-search',missing:'city',category:'healthcare'};
  const h=harness({options:{getPendingTask:()=>pending}});try{
    await h.controller.start({microphoneConsent:true});
    const updates=()=>h.connections[0].sent.filter(item=>item.clientContent?.turns[0].parts[0].text.startsWith('[Verified public page state]'));
    const parts=updates()[0].clientContent.turns[0].parts;
    assert.deepEqual(JSON.parse(parts[0].text.split('\n')[1]),context,'ordinary page context remains the first part');
    assert.equal(parts[1].text,'[Pending public resource task]\n'+JSON.stringify(pending));
    assert.doesNotMatch(JSON.stringify(updates()),/Find healthcare|raw transcript|conversation history/);
    h.audio();await h.finish();assert.equal(updates().length,1,'same canonical task and page are sent only once');
    pending={goal:'clarify-search',missing:'city',category:'food'};assert.equal(h.controller.sendText('Harrisburg.'),true);
    assert.equal(updates().length,1,'ongoing realtime sessions are not reseeded from changing application slots');
  }finally{h.cleanup();}
  for(const pending of[{goal:'help'},{goal:'clarify-search',missing:'city',category:'healthcare',raw:'Never forward this raw chat.'},null]){
    const rejected=harness({options:{getPendingTask:()=>pending}});try{
      await rejected.controller.start({microphoneConsent:true});assert.equal(rejected.controller.snapshot.phase,'error');assert.equal(rejected.controller.snapshot.diagnostic.failure,'public-context');assert.equal(rejected.requests.length,0);assert.equal(rejected.connections.length,0);
    }finally{rejected.cleanup();}
  }
});

test('late final input captions do not create a phantom turn, while the next real microphone request still works',async()=>{
  const h=harness();try{
    await h.intro();h.speech();h.message({serverContent:{inputTranscription:{text:'Hello',finished:false}}});
    h.message({serverContent:{outputTranscription:{text:'Hello back.',finished:true}}});h.audio();await h.finish();
    const previous=h.transcripts.find(item=>item.role==='user').turnId;
    const sends=h.connections[0].sent.length;
    h.message({serverContent:{inputTranscription:{text:' there.',finished:true}}});await settle();
    assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.forwarding,true);assert.equal(h.connections[0].sent.length,sends,'late final cannot send audioStreamEnd or create a response wait');
    assert.equal(h.transcripts.at(-1).turnId,previous);assert.equal(h.transcripts.at(-1).text,'Hello there.');
    h.speech();h.message({serverContent:{inputTranscription:{text:'Find food in Harrisburg.',finished:true}}});
    const next=h.transcripts.at(-1);assert.notEqual(next.turnId,previous);assert.equal(next.text,'Find food in Harrisburg.');
    assert.equal(h.controller.snapshot.phase,'listening','caption finality does not substitute for VAD/model turn completion');
    h.message({serverContent:{outputTranscription:{text:'I can search that city.',finished:true}}});h.audio();await h.finish();assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.diagnostic.failure,'none');
  }finally{h.cleanup();}
});

test('skipping introduction discards future old-turn PCM and waits for provider completion before listening',async()=>{
  const h=harness();try{
    await h.controller.start({microphoneConsent:true});h.controller.skipIntroduction();h.audio();assert.equal(h.queued,0);h.frame();assert.equal(h.controller.snapshot.forwarding,false);
    await h.finish();assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.connections[0].sent.filter(item=>item.realtimeInput?.text).length,1);
  }finally{h.cleanup();}
});

test('mute, real tool actions, duplicate callbacks and end respect the same half-duplex gate',async()=>{
  let finishAction;const actionGate=new Promise(resolve=>{finishAction=resolve;});let executed=0;
  const h=harness({options:{onToolCall:async()=>{executed++;await actionGate;return{context,facts:[]};}}});try{
    await h.intro();h.controller.setMicrophoneMuted(true);assert.equal(h.controller.snapshot.phase,'muted');assert.equal(h.mic.muted,true);const sent=h.connections[0].sent.length;h.frame();assert.equal(h.connections[0].sent.length,sent);
    h.controller.setMicrophoneMuted(false);h.frame();
    const event={toolCall:{functionCalls:[{id:'tool.1',name:'perform_public_resource_action',args:{type:'navigate-support'}}]}};
    h.message(event);h.message(event);h.message(structuredClone(event));await settle();assert.equal(executed,1);assert.equal(h.controller.snapshot.phase,'acting');
    const before=h.connections[0].sent.length;h.frame();assert.equal(h.connections[0].sent.length,before);
    finishAction();await settle();assert.equal(h.connections[0].sent.filter(item=>item.toolResponse).length,1);assert.equal(h.controller.snapshot.phase,'processing');
    h.audio();await h.finish();assert.equal(h.controller.snapshot.phase,'listening');
    h.controller.end();assert.equal(h.controller.snapshot.phase,'ended');assert.equal(h.controller.snapshot.microphoneActive,false);assert.equal(h.connections[0].closed,true);assert.equal(h.releases.length,1);
    const count=h.connections[0].sent.length;h.message(event);h.audio();h.frame();assert.equal(h.connections[0].sent.length,count);assert.equal(executed,1);
  }finally{h.cleanup();}
});

test('a post-tool generation completion cannot reopen the microphone without provider turn completion and player drain',async()=>{
  const h=harness();try{
    await h.intro();h.frame();
    h.message({toolCall:{functionCalls:[{id:'post-tool-boundary',name:'perform_public_resource_action',args:{type:'search',category:'food',city:'harrisburg-pa',radius:10}}]}});await settle();
    h.audio();h.message({serverContent:{generationComplete:true}});h.flush();await settle();
    assert.equal(h.actions.length,1);assert.equal(h.controller.snapshot.diagnostic.turnComplete,1,'only the introduction has completed');
    assert.equal(h.controller.snapshot.phase,'processing');assert.equal(h.controller.snapshot.forwarding,false,'even a drained player cannot substitute for provider completion');
    await h.finish();assert.equal(h.controller.snapshot.diagnostic.turnComplete,2);assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.forwarding,true);
  }finally{h.cleanup();}
});

test('isolated noise frames keep PCM forwarding without creating a local request or response watchdog',async()=>{
  const h=harness(),original=globalThis.setTimeout,timers=[];try{
    await h.intro();globalThis.setTimeout=(fn,ms,...args)=>{timers.push({fn,ms});return original(fn,ms,...args);};
    const sent=h.connections[0].sent,pcm=()=>sent.filter(item=>item.realtimeInput?.audio).length;
    for(let i=0;i<10;i++){h.frame(.2);h.frames(0,5);}h.frames(0,50);
    assert(pcm()>100,'onset, clicks and silence remain available to provider VAD');
    assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.forwarding,true);
    assert.equal(sent.some(item=>item.realtimeInput?.audioStreamEnd),false,'unconfirmed noise cannot close a user turn');
    assert.equal(timers.some(item=>item.ms===25000),false,'silence after clicks cannot arm a response timeout');
  }finally{globalThis.setTimeout=original;h.cleanup();}
});

test('sustained onset tolerates a brief gap and retains the real-request response timeout',async()=>{
  const h=harness(),original=globalThis.setTimeout,timers=[];try{
    await h.intro();globalThis.setTimeout=(fn,ms,...args)=>{const id=original(fn,ms,...args);timers.push({fn:()=>{clearTimeout(id);fn(...args);},ms});return id;};
    h.frames(.2,4);h.frames(0,2);h.frames(.2,4);h.frames(0,43);
    assert.equal(h.controller.snapshot.phase,'processing');assert.equal(h.controller.snapshot.forwarding,false);
    assert.equal(h.connections[0].sent.filter(item=>item.realtimeInput?.audioStreamEnd).length,1);
    const response=timers.filter(item=>item.ms===25000);assert.equal(response.length,1);response[0].fn();
    assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.diagnostic.failure,'response-timeout');assert.equal(h.controller.snapshot.microphoneActive,false);
  }finally{globalThis.setTimeout=original;h.cleanup();}
  const reset=harness();try{
    await reset.intro();reset.frames(.2,4);reset.frames(0,4);reset.frames(.2,4);reset.frames(0,43);
    assert.equal(reset.controller.snapshot.phase,'listening','a longer quiet gap resets an unconfirmed onset');
    assert.equal(reset.connections[0].sent.some(item=>item.realtimeInput?.audioStreamEnd),false);
  }finally{reset.cleanup();}
});

test('an actual provider response can establish a short quiet request below local onset thresholds',async()=>{
  const h=harness();try{
    await h.intro();h.frames(.001,4);assert.equal(h.controller.snapshot.phase,'listening');
    assert(h.connections[0].sent.some(item=>item.realtimeInput?.audio),'quiet onset PCM is not clipped');
    h.audio();assert.equal(h.controller.snapshot.forwarding,false);assert.equal(h.controller.snapshot.diagnostic.turnComplete,1);
    h.message({serverContent:{generationComplete:true}});h.flush();await settle();assert.equal(h.controller.snapshot.forwarding,false);
    await h.finish();assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.diagnostic.failure,'none');assert.equal(h.controller.snapshot.diagnostic.turnComplete,2);
  }finally{h.cleanup();}
});

test('provider waiting-for-input after ignored local activity restores listening only after the prior output was settled',async()=>{
  const h=harness();try{
    await h.intro();
    for(let i=0;i<3;i++){h.speech();h.audio();h.message({serverContent:{generationComplete:true}});await h.finish();}
    h.speech();h.frames(0,43);assert.equal(h.controller.snapshot.phase,'processing');
    const replies=h.transcripts.filter(item=>item.role==='assistant').length;
    h.message({serverContent:{waitingForInput:true}});await settle();
    assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.forwarding,true);assert.equal(h.controller.snapshot.diagnostic.failure,'none');
    assert.equal(h.transcripts.filter(item=>item.role==='assistant').length,replies,'no synthetic assistant reply is inserted');
    h.speech();h.audio();h.message({serverContent:{waitingForInput:true,generationComplete:true}});h.flush();await settle();
    assert.equal(h.controller.snapshot.forwarding,false,'waiting-for-input never replaces completion for generated audio');
    await h.finish();assert.equal(h.controller.snapshot.phase,'listening');
  }finally{h.cleanup();}
});

test('ten sequential turns survive delayed queued tools, resolver failure, mute, noise and one safe recovery',async()=>{
  let page=context,elapsed=0;const pending=[],executed=[];
  const h=harness({options:{getContext:()=>page,onToolCall:(call,signal)=>new Promise((resolve,reject)=>{executed.push(call.id);pending.push({call,signal,resolve,reject});})},dependencies:{now:()=>NOW+elapsed}});try{
    await h.controller.start({microphoneConsent:true});h.audio();h.message({serverContent:{generationComplete:true}});await h.finish();
    for(let number=1;number<=10;number++){
      elapsed+=1000;h.speech();h.frames(0,43);assert.equal(h.controller.snapshot.phase,'processing');
      const calls=[{id:'read-'+number,name:'read_public_page_context',args:{}},{id:'navigate-'+number,name:'perform_public_resource_action',args:{type:'navigate-public',page:number%2?'give':'home'}}];
      h.message({toolCall:{functionCalls:calls}});await settle();assert.equal(pending.length,1,'tool actions execute serially');assert.equal(h.controller.snapshot.phase,'acting');assert.equal(h.controller.snapshot.forwarding,false);
      h.message({toolCall:{functionCalls:[structuredClone(calls[0])]}});assert.equal(executed.filter(id=>id===calls[0].id).length,1,'duplicate proposal is not executed');
      elapsed+=400;pending.shift().resolve({context:page,facts:[]});await settle();assert.equal(pending.length,1);assert.equal(h.controller.snapshot.phase,'acting');
      elapsed+=600;const action=pending.shift();
      if(number===8)action.reject(new EdenLiveServiceError('resolver-limit',429,'RATE_LIMITED'));
      else{page={...context,page:calls[1].args.page};action.resolve({context:page,facts:[],outcome:'done'});}
      await settle();assert.equal(h.controller.snapshot.phase,'processing');assert.equal(h.controller.snapshot.forwarding,false);
      if(number===5)h.controller.setMicrophoneMuted(true);
      h.audio();h.audio();h.message({serverContent:{generationComplete:true}});await settle();assert.equal(h.controller.snapshot.forwarding,false);
      h.message({serverContent:{turnComplete:true}});await settle();assert.equal(h.controller.snapshot.forwarding,false,'actual browser drain is still required');
      h.flush();await settle();assert.equal(h.controller.snapshot.phase,number===5?'muted':'listening');
      if(number===5){h.controller.setMicrophoneMuted(false);assert.equal(h.controller.snapshot.forwarding,true);}
      if(number===3){h.frame(.2);h.frames(0,50);assert.equal(h.controller.snapshot.phase,'listening');}
      if(number===6){
        const old=h.connections.length-1;h.message({goAway:{timeLeft:'2.5s'},sessionResumptionUpdate:{resumable:true,newHandle:'synthetic-ten-turn-resume'}});
        h.connections[old].callbacks.closed({kind:'socket-close',code:1012});await settle();assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.requests.length,2);
        h.message({serverContent:{turnComplete:true,modelTurn:{parts:[{inlineData:{data:'AAAA',mimeType:'audio/pcm'}}]}}},old);assert.equal(h.queued,0,'old socket output is suppressed after recovery');
      }
      assert.equal(h.controller.snapshot.diagnostic.failure,'none');
    }
    const diagnostic=h.controller.snapshot.diagnostic,replies=h.connections.flatMap(connection=>connection.sent).flatMap(item=>item.toolResponse?.functionResponses??[]);
    assert.equal(diagnostic.generationComplete,11);assert.equal(diagnostic.turnComplete,11);assert.equal(diagnostic.toolsStarted,20);assert.equal(diagnostic.toolsCompleted,19);assert.equal(diagnostic.toolsFailed,1);
    assert.equal(diagnostic.serviceCategory,'resolver-limit');assert.equal(diagnostic.serviceStatus,429);assert.equal(diagnostic.pendingTools,0);assert.equal(diagnostic.recoveries,1);assert.equal(replies.length,20);
    assert.equal(h.connections.flatMap(connection=>connection.sent).filter(item=>item.realtimeInput?.text===EDEN_LIVE_INTRODUCTION_PROMPT).length,1);
    assert.equal(diagnostic.timeline.length,32);assert.equal(diagnostic.appDeadline,NOW+300000);assert.equal(diagnostic.goAwaySeconds,2.5);
    h.controller.end();assert.equal(h.controller.snapshot.microphoneActive,false);assert.equal(h.controller.snapshot.forwarding,false);assert(h.connections.every(connection=>connection.closed));assert.equal(h.releases.length,1);
  }finally{h.cleanup();}
});

test('a bounded tool deadline returns one failure response before starting the separate provider-response wait',async()=>{
  let late;const h=harness({options:{onToolCall:()=>new Promise(resolve=>{late=resolve;})}}),original=globalThis.setTimeout,timers=[];try{
    await h.intro();globalThis.setTimeout=(fn,ms,...args)=>{const id=original(fn,ms,...args);timers.push({ms,fire:()=>{clearTimeout(id);fn(...args);}});return id;};
    h.speech();const call={id:'bounded-tool',name:'read_public_page_context',args:{}};h.message({toolCall:{functionCalls:[call]}});await settle();
    assert.equal(h.controller.snapshot.phase,'acting');assert.equal(timers.some(item=>item.ms===25000),false,'provider is waiting on the tool, not a missing audio response');
    const deadline=timers.find(item=>item.ms===20000);assert(deadline);deadline.fire();await settle();
    const replies=()=>h.connections[0].sent.flatMap(item=>item.toolResponse?.functionResponses??[]);
    assert.equal(replies().length,1);assert.equal(replies()[0].response.error.code,'EDEN_LIVE_TOOL_TIMEOUT');assert.equal(h.controller.snapshot.diagnostic.toolsFailed,1);assert.equal(h.controller.snapshot.phase,'processing');assert.equal(timers.filter(item=>item.ms===25000).length,1);
    late({context,facts:[{id:'late',text:'Never forward a stale late tool response.'}]});await settle();assert.equal(replies().length,1);
    h.audio();await h.finish();assert.equal(h.controller.snapshot.phase,'listening');
  }finally{globalThis.setTimeout=original;h.cleanup();}
});

test('audio-context suspension is a specific first failure and immediately stops the call',async()=>{
  for(const which of['input','output']){const h=harness();try{
    await h.intro();h.inputState('running');h.outputState('running');h[which+'State']('suspended');
    assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.diagnostic.failure,which==='input'?'microphone-state':'audio-output-state');assert.equal(h.controller.snapshot.diagnostic[which+'Context'],'suspended');assert.equal(h.controller.snapshot.microphoneActive,false);assert.equal(h.controller.snapshot.forwarding,false);
  }finally{h.cleanup();}}
});

test('expired credentials and categorized admission failures stop before connecting, and provider quota never auto-recovers',async()=>{
  for(const spec of[{reply:{...token(),expiresAt:new Date(NOW-1).toISOString()},failure:'token-invalid'},{error:new EdenLiveServiceError('local-limit',429,'EDEN_LIVE_USAGE_LIMIT'),failure:'token-request',category:'local-limit'},{error:new EdenLiveServiceError('overload',503,'EDEN_LIVE_PROVIDER_UNAVAILABLE'),failure:'token-request',category:'overload'},{error:new EdenLiveServiceError('access',401,'EDEN_SESSION_REQUIRED'),failure:'token-request',category:'access'}]){
    const h=harness({options:{getToken:async()=>{if(spec.error)throw spec.error;return spec.reply;}}});try{await h.controller.start({microphoneConsent:true});assert.equal(h.controller.snapshot.diagnostic.failure,spec.failure);if(spec.category)assert.equal(h.controller.snapshot.diagnostic.serviceCategory,spec.category);if(spec.category==='local-limit')assert.match(h.controller.snapshot.reason,/Voice calls have reached their current usage limit/);if(spec.category==='overload')assert.match(h.controller.snapshot.reason,/temporarily busy/);if(spec.category==='access')assert.match(h.controller.snapshot.reason,/access expired/);assert.equal(h.connections.length,0);assert.equal(h.controller.snapshot.microphoneActive,false);}finally{h.cleanup();}
  }
  const h=harness();try{await h.intro();h.message({sessionResumptionUpdate:{resumable:true,newHandle:'synthetic-safe-handle'}});h.connections[0].callbacks.closed({kind:'provider-error',providerCategory:'rate-limit-or-quota',providerStatus:429});await settle();assert.equal(h.requests.length,1);assert.equal(h.controller.snapshot.diagnostic.providerCategory,'rate-limit-or-quota');assert.equal(h.controller.snapshot.diagnostic.providerStatus,429);assert.match(h.controller.snapshot.reason,/rate or usage limit/);assert.doesNotMatch(h.controller.snapshot.reason,/daily quota/);assert.equal(h.controller.snapshot.microphoneActive,false);}finally{h.cleanup();}
});

test('application expiry is distinguished from provider quota and diagnostic snapshots remain bounded and content-free',async()=>{
  const h=harness(),original=globalThis.setTimeout,timers=[];try{
    globalThis.setTimeout=(fn,ms,...args)=>{const id=original(fn,ms,...args);timers.push({ms,fire:()=>{clearTimeout(id);fn(...args);}});return id;};
    await h.intro();h.message({goAway:{timeLeft:'not a duration with private content'}});assert.equal(h.controller.snapshot.diagnostic.goAwaySeconds,undefined);
    const snapshot=h.controller.snapshot;assert.match(snapshot.diagnostic.callRef,/^eden-local-\d+$/);assert.equal(snapshot.diagnostic.model,EDEN_LIVE_MODEL);assert.equal(snapshot.diagnostic.startedAt,NOW);assert.equal(snapshot.diagnostic.tokenExpiresAt,NOW+300000);
    snapshot.diagnostic.timeline[0].event='private mutation';assert(!JSON.stringify(h.controller.snapshot.diagnostic).includes('private mutation'));
    timers.find(item=>item.ms===300000).fire();assert.equal(h.controller.snapshot.phase,'ended');assert.equal(h.controller.snapshot.diagnostic.endReason,'app-expiry');assert.equal(h.controller.snapshot.diagnostic.providerCategory,'none');assert.equal(h.controller.snapshot.microphoneActive,false);
    assert.doesNotMatch(JSON.stringify(h.controller.snapshot.diagnostic),/auth_tokens|a{43}|private content/);
  }finally{globalThis.setTimeout=original;h.cleanup();}
});

test('one bounded provider-handle recovery preserves call ID, never repeats intro, and then fails closed',async()=>{
  const h=harness();try{
    await h.intro();h.message({sessionResumptionUpdate:{resumable:true,newHandle:'provider-resume-handle'}});h.connections[0].callbacks.closed();await settle();
    assert.equal(h.requests.length,2);assert.equal(h.requests[1].resumeHandle,'provider-resume-handle');assert.equal(h.requests[1].callId,'a'.repeat(43));assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.micStarts,1);
    assert.equal(h.connections.flatMap(item=>item.sent).filter(item=>item.realtimeInput?.text===EDEN_LIVE_INTRODUCTION_PROMPT).length,1);
    assert.equal(h.connections[1].sent.length,0,'provider-handle recovery preserves history and does not reseed or repeat introduction');
    h.message({serverContent:{modelTurn:{parts:[{inlineData:{data:'AAAA',mimeType:'audio/pcm;rate=24000'}}]}}},0);assert.equal(h.queued,0,'old socket cannot enqueue PCM after recovery');
    h.message({sessionResumptionUpdate:{resumable:true,newHandle:'another-handle'}});h.connections[1].callbacks.closed();await settle();assert.equal(h.requests.length,2);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.microphoneActive,false);
  }finally{h.cleanup();}
});

test('an early provider handle becomes resumable after actual completion and is invalidated by new microphone activity',async()=>{
  const h=harness();try{
    await h.controller.start({microphoneConsent:true});h.message({sessionResumptionUpdate:{resumable:true,newHandle:'early-current-handle'}});h.audio();await h.finish();
    h.connections[0].callbacks.closed();await settle();assert.equal(h.requests.length,2);assert.equal(h.requests[1].resumeHandle,'early-current-handle');assert.equal(h.controller.snapshot.phase,'listening');
  }finally{h.cleanup();}
  const next=harness();try{
    await next.controller.start({microphoneConsent:true});next.message({sessionResumptionUpdate:{resumable:true,newHandle:'early-current-handle'}});next.audio();await next.finish();next.frame();
    next.connections[0].callbacks.closed();await settle();assert.equal(next.requests.length,1,'a completed old handle cannot resume a partially captured next turn');assert.equal(next.controller.snapshot.phase,'error');
  }finally{next.cleanup();}
});

test('diagnostics keep only fixed enums, event counts and the numeric transport close code',async()=>{
  const h=harness();try{
    await h.intro();h.message({serverContent:{inputTranscription:{text:'Synthetic private test words.',finished:true}}});
    h.connections[0].callbacks.closed({kind:'socket-close',code:1008,reason:'Never expose this provider reason or URL https://example.invalid'});
    const value=h.controller.snapshot,serialized=JSON.stringify(value);assert.equal(value.phase,'error');assert.equal(value.diagnostic.failure,'socket-close');assert.equal(value.diagnostic.closeCode,1008);assert.equal(value.diagnostic.connections,1);assert.equal(value.diagnostic.audioChunks,1);assert.equal(value.diagnostic.turnComplete,1);assert.ok(value.diagnostic.messages>=3);
    assert.doesNotMatch(serialized,/auth_tokens|Synthetic private|example\.invalid|a{43}|Never expose/);
  }finally{h.cleanup();}
});

test('rejected tool-shape diagnostics expose only fixed field enums and bounded shape counts',async()=>{
  const cases=[
    [{name:'read_public_page_context',args:{}},'missing-id'],
    [{id:'private identifier!',name:'read_public_page_context',args:{}},'invalid-id'],
    [{id:'private-id',name:'private_unrecognized_tool_name',args:{}},'unrecognized-name'],
    [{id:'private-id',name:'read_public_page_context',args:{},willContinue:false},'extra-fields'],
    [{id:'private-id',name:'ask_clarification',args:'private arguments'},'args-not-object'],
    [{id:'private-id',name:'perform_public_resource_action',args:{type:'private-invalid-action',privateUnknownKey:'private value'}},'args-invalid'],
  ];
  for(const[call,expected]of cases){const h=harness();try{
    await h.intro();h.message({toolCall:{functionCalls:[call]}});
    const diagnostic=h.controller.snapshot.diagnostic;assert.equal(diagnostic.failure,expected==='args-invalid'?'none':'tool-invalid');assert.equal(diagnostic.toolShape.status,expected);assert.equal(diagnostic.toolCallsReceived,1);assert.equal(diagnostic.toolCalls,0);
    const serialized=JSON.stringify(diagnostic);assert.doesNotMatch(serialized,/private|identifier|arguments|UnknownKey/);
    assert.ok(diagnostic.toolShape.knownFields.every(key=>['id','name','args','partialArgs','willContinue'].includes(key)));
  }finally{h.cleanup();}}
});

test('known malformed arguments get bounded fixed feedback and can be repaired with a new provider ID without mutation',async()=>{
  const h=harness();try{
    await h.intro();h.frame();
    const bad={id:'bad-args-1',name:'ask_clarification',args:{missing:'city'}};
    h.message({toolCall:{functionCalls:[bad]}});await settle();
    assert.equal(h.actions.length,0);assert.equal(h.controller.snapshot.phase,'processing');assert.equal(h.controller.snapshot.forwarding,false);assert.equal(h.controller.snapshot.diagnostic.rejectedArguments,1);
    const responses=()=>h.connections[0].sent.filter(item=>item.toolResponse).flatMap(item=>item.toolResponse.functionResponses);
    assert.equal(responses()[0].id,bad.id);assert.equal(responses()[0].response.error.code,'EDEN_LIVE_ARGUMENTS_INVALID');assert.match(responses()[0].response.error.instruction,/requires|with category/);assert.equal(responses()[0].response.ok,false);
    h.message({toolCall:{functionCalls:[structuredClone(bad)]}});assert.equal(responses().length,1);assert.equal(h.controller.snapshot.diagnostic.rejectedArguments,1,'replayed proposal does not consume another repair');
    h.message({toolCall:{functionCalls:[{id:'repaired-1',name:'ask_clarification',args:{missing:'city',category:'food'}}]}});await settle();assert.equal(h.actions.length,1);assert.equal(h.actions[0].call.id,'repaired-1');
    h.audio();await h.finish();assert.equal(h.controller.snapshot.phase,'listening');
    h.message({toolCall:{functionCalls:[{id:'bad-args-2',name:'read_public_page_context',args:{unknown:'private content must not be echoed'}}]}});assert.equal(h.actions.length,1);assert.equal(h.controller.snapshot.diagnostic.rejectedArguments,2);
    assert.doesNotMatch(JSON.stringify(responses()),/private content|unknown/);
    const count=responses().length;h.message({toolCall:{functionCalls:[{id:'bad-args-3',name:'ask_clarification',args:{missing:'city'}}]}});assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.diagnostic.rejectedArguments,2);assert.equal(h.controller.snapshot.microphoneActive,false);assert.equal(responses().length,count,'third invalid proposal gets no continuation');assert.equal(h.actions.length,1);
  }finally{h.cleanup();}
});

test('repair feedback never permits changing arguments under an existing call ID',async()=>{
  const h=harness();try{
    await h.intro();h.message({toolCall:{functionCalls:[{id:'same-id',name:'ask_clarification',args:{missing:'city'}}]}});
    h.message({toolCall:{functionCalls:[{id:'same-id',name:'ask_clarification',args:{missing:'city',category:'food'}}]}});await settle();
    assert.equal(h.actions.length,0);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.diagnostic.failure,'tool-conflict');
  }finally{h.cleanup();}
});

test('public page navigation and hours actions retain shared validation and bounded enum-only repair guidance',async()=>{
  const h=harness();try{
    await h.intro();
    const actions=[{type:'read-page'},{type:'navigate-public',page:'give'},{type:'read-hours',index:1}];
    h.message({toolCall:{functionCalls:actions.map((args,index)=>({id:'public-action-'+index,name:'perform_public_resource_action',args}))}});await settle();
    assert.deepEqual(h.actions.map(item=>item.call.args),actions);assert.equal(h.controller.snapshot.diagnostic.rejectedArguments,0);
    h.message({toolCall:{functionCalls:[{id:'bad-page',name:'perform_public_resource_action',args:{type:'navigate-public',page:'private-unapproved-route'}}]}});
    let diagnostic=h.controller.snapshot.diagnostic;assert.ok(diagnostic.toolShape.argFields.includes('page'));assert.equal(diagnostic.toolShape.unknownArgKeyCount,0);assert.equal(diagnostic.rejectedArguments,1);assert.equal(h.actions.length,3,'invalid destination is not authorized');
    h.message({toolCall:{functionCalls:[{id:'bad-hours',name:'perform_public_resource_action',args:{type:'read-hours'}}]}});
    diagnostic=h.controller.snapshot.diagnostic;assert.equal(diagnostic.rejectedArguments,2);assert.equal(h.actions.length,3);
    const replies=h.connections[0].sent.filter(item=>item.toolResponse).flatMap(item=>item.toolResponse.functionResponses).filter(item=>item.response.error);
    assert.ok(replies.every(item=>item.response.error.instruction.includes('details/select/read-hours need index')&&item.response.error.instruction.includes('read-page need only type')&&item.response.error.instruction.includes('home, support, give, organizations, about, privacy')));
    assert.doesNotMatch(JSON.stringify(replies),/private-unapproved-route/);assert.equal(h.controller.snapshot.diagnostic.failure,'none');
  }finally{h.cleanup();}
});

test('wire-level omitted arguments normalize only the known zero-argument read with its original provider ID',async()=>{
  const h=harness();try{
    await h.intro();h.message({toolCall:{functionCalls:[{id:'provider-read-1',name:'read_public_page_context'}]}});await settle();
    assert.equal(h.actions.length,1);assert.deepEqual(h.actions[0].call,{id:'provider-read-1',name:'read_public_page_context',args:{}});assert.equal(h.controller.snapshot.diagnostic.failure,'none');
    assert.equal(h.connections[0].sent.filter(item=>item.toolResponse).length,1);
  }finally{h.cleanup();}
});

test('provider text-only greeting, hidden tab and late credentials cannot leave a microphone running',async()=>{
  const h=harness();try{
    await h.controller.start({microphoneConsent:true});h.message({serverContent:{outputTranscription:{text:'Actual provider text only.'},turnComplete:true}});await settle();assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.microphoneActive,false);
    await h.intro();h.doc.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.controller.snapshot.phase,'ended');assert.equal(h.controller.snapshot.microphoneActive,false);
  }finally{h.cleanup();}
  let deliver;const gate=new Promise(resolve=>{deliver=resolve;}),late=harness({options:{getToken:()=>gate}});try{
    const pending=late.controller.start({microphoneConsent:true});await settle();late.controller.end();deliver(token());await pending;assert.equal(late.connections.length,0);assert.equal(late.releases.length,1);assert.equal(late.controller.snapshot.phase,'ended');
  }finally{late.cleanup();}
});

test('native transport pins v1beta constrained endpoint, waits setup and closes immediately on setup cancellation',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'WebSocket'),sockets=[];
  class Socket{static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(url){this.url=url;sockets.push(this);}send(value){this.sent.push(JSON.parse(value));}close(){this.closed=true;} }
  Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:Socket});try{
    const abort=new AbortController(),pending=connectEdenLive(token(),{message(){},closed(){}},abort.signal);sockets[0].onopen();
    assert.match(sockets[0].url,/generativelanguage\.googleapis\.com\/ws\/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained\?access_token=/);assert.equal(new URL(sockets[0].url).searchParams.has('key'),false);
    assert.equal(sockets[0].sent[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');
    abort.abort();await assert.rejects(pending);assert.equal(sockets[0].closed,true);
    const nextAbort=new AbortController(),messages=[],connected=connectEdenLive(token(),{message:value=>messages.push(value),closed(){}},nextAbort.signal);const socket=sockets[1];socket.onopen();socket.onmessage({data:new TextEncoder().encode('{"setupComplete":{}}').buffer});
    const connection=await connected;connection.send({realtimeInput:{text:'synthetic request'}});assert.equal(messages.length,1);nextAbort.abort();assert.equal(socket.closed,true);assert.throws(()=>connection.send({}));
  }finally{if(original)Object.defineProperty(globalThis,'WebSocket',original);else delete globalThis.WebSocket;}
});

test('transport distinguishes malformed JSON, provider error, application callback failure and numeric remote close',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'WebSocket'),sockets=[];
  class Socket{static OPEN=1;readyState=1;bufferedAmount=0;constructor(){sockets.push(this);}send(){}close(){this.closed=true;}}
  Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:Socket});try{
    for(const kind of['invalid-message','provider-error','application-handler','socket-close']){
      const closed=[],abort=new AbortController();
      const pending=connectEdenLive(token(),{message:value=>{if(kind==='application-handler'&&value.serverContent)throw new Error('Private UI exception must not escape.');},closed:value=>closed.push(value)},abort.signal);
      const socket=sockets.at(-1);socket.onopen();socket.onmessage({data:'{"setupComplete":{}}'});await pending;
      if(kind==='socket-close'){socket.onerror();socket.onclose({code:1006,reason:'Private provider close reason'});}
      else socket.onmessage({data:kind==='invalid-message'?'{invalid':kind==='provider-error'?'{"error":{"message":"Private provider error"}}':'{"serverContent":{}}'});
      await settle();assert.deepEqual(closed,[{kind,...(kind==='socket-close'?{code:1006,closeReason:'other'}:kind==='provider-error'?{providerCategory:'provider-other'}:{})}]);assert.equal(socket.closed,true);assert.doesNotMatch(JSON.stringify(closed),/Private/);abort.abort();
    }
  }finally{if(original)Object.defineProperty(globalThis,'WebSocket',original);else delete globalThis.WebSocket;}
});

test('provider error categories use only fixed RPC codes and never expose the provider body',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'WebSocket'),sockets=[];
  class Socket{static OPEN=1;readyState=1;bufferedAmount=0;constructor(){sockets.push(this);}send(){}close(){this.closed=true;}}
  Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:Socket});try{
    for(const [code,status,category]of[[429,'RESOURCE_EXHAUSTED','rate-limit-or-quota'],[503,'UNAVAILABLE','overload'],[403,'PERMISSION_DENIED','authentication'],[400,'INVALID_ARGUMENT','invalid-request'],[500,'INTERNAL','provider-other']]){
      const closed=[],abort=new AbortController(),pending=connectEdenLive(token(),{message(){},closed:value=>closed.push(value)},abort.signal),socket=sockets.at(-1);socket.onopen();socket.onmessage({data:'{"setupComplete":{}}'});await pending;
      socket.onmessage({data:JSON.stringify({error:{code,status,message:'private provider error body',details:[{url:'https://private.invalid'}]}})});await settle();
      assert.deepEqual(closed,[{kind:'provider-error',providerCategory:category,providerStatus:code}]);assert.doesNotMatch(JSON.stringify(closed),/private|https|details|RESOURCE_EXHAUSTED/);abort.abort();
    }
  }finally{if(original)Object.defineProperty(globalThis,'WebSocket',original);else delete globalThis.WebSocket;}
});

test('a provider interruption followed by a separate old turnComplete preserves the new spoken turn',async()=>{
  const h=harness({options:{allowSpokenInterruption:true}});try{
    await h.controller.start({microphoneConsent:true});h.audio();h.playback(true);
    assert(h.controller.snapshot.microphoneForwarding);h.speech();
    assert.equal(h.controller.snapshot.phase,'listening');
    h.message({serverContent:{interrupted:true}});
    h.message({serverContent:{turnComplete:true}});await settle();
    assert.equal(h.controller.snapshot.phase,'listening');assert.equal(h.controller.snapshot.diagnostic.failure,'none');
    h.frames(0,44);assert.equal(h.controller.snapshot.phase,'processing');
    assert.equal(h.connections[0].sent.filter(v=>v.realtimeInput?.audioStreamEnd).length,1);
    h.audio();await h.finish();assert.equal(h.controller.snapshot.phase,'listening');
  }finally{h.cleanup();}
});
