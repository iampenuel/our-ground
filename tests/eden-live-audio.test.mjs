import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveMicrophoneEncoder,decodeLivePcm,pcmToBase64} from '../src/eden/live/audio.ts';
import {LivePcmOutput} from '../src/eden/live/output.ts';
import {BrowserLiveMicrophone} from '../src/eden/live/microphone.ts';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('streaming microphone resampling uses actual rates without callback rounding drift and clears blocked audio',()=>{
  for(const rate of[44100,48000]){
    const encoder=new LiveMicrophoneEncoder(),chunks=[];
    for(let offset=0;offset<rate;offset+=1024)chunks.push(...encoder.encode(new Float32Array(Math.min(1024,rate-offset)).fill(.25),rate));
    assert.equal(chunks.length,50);assert.ok(chunks.every(chunk=>atob(chunk).length===640));
    assert.ok(decodeLivePcm(chunks[0],'audio/pcm;rate=24000').every(value=>Math.abs(value-.25)<.0001));
  }
  const encoder=new LiveMicrophoneEncoder();encoder.encode(new Float32Array(300).fill(1),16000);encoder.clear();
  const chunks=encoder.encode(new Float32Array(321).fill(-1),16000);assert.equal(chunks.length,1);assert.ok(decodeLivePcm(chunks[0],'audio/pcm').every(value=>value===-1));
  assert.throws(()=>encoder.encode(new Float32Array(1),NaN));assert.throws(()=>encoder.encode(new Float32Array(9000),48000));
});

test('PCM decoder rejects malformed, odd, oversized and mismatched-rate frames',()=>{
  assert.deepEqual([...decodeLivePcm(pcmToBase64(new Uint8Array([0,128,255,127])),'audio/pcm;rate=24000')],[-1,32767/32768]);
  for(const value of['','AA==','bad?','AAAA\n'])assert.throws(()=>decodeLivePcm(value,'audio/pcm;rate=24000'));
  assert.throws(()=>decodeLivePcm('AAAA','audio/pcm;rate=16000'));assert.throws(()=>decodeLivePcm('A'.repeat(320004),'audio/pcm'));
});

test('PCM player schedules ordered 24k buffers and reports only actual audible activity with generation-safe drain',async()=>{
  const saved=new Map(['requestAnimationFrame','cancelAnimationFrame'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),frames=new Map();let id=0;
  globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const sources=[],levels=[],activity=[],contexts=[],states=[];
  const context={state:'running',sampleRate:48000,currentTime:0,destination:{},async resume(){},async close(){this.state='closed';},createGain(){return{gain:{value:1},connect(){},disconnect(){}};},createAnalyser(){return{fftSize:0,connect(){},disconnect(){},getFloatTimeDomainData(data){data.fill(.1);}};},createBuffer(channels,length,rate){contexts.push({channels,length,rate});return{duration:length/rate,copyToChannel(){}};},createBufferSource(){const source={connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;},onended:null};sources.push(source);return source;}};
  const player=new LivePcmOutput(value=>levels.push(value),value=>activity.push(value),()=>context,state=>states.push(state)),tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(0));};
  try{
    await player.init();const pcm=pcmToBase64(new Uint8Array(4800));player.enqueue(pcm,'audio/pcm;rate=24000');player.enqueue(pcm,'audio/pcm;rate=24000');
    assert.deepEqual(contexts.map(item=>item.rate),[24000,24000]);assert.ok(sources[1].at>=sources[0].at+.1);
    tick();assert.equal(levels.at(-1),0,'future scheduled buffer is not speaking');assert.equal(activity.includes(true),false);
    context.currentTime=.03;tick();assert.ok(levels.at(-1)>.3);assert.equal(activity.at(-1),true);
    player.setMuted(true);tick();assert.equal(levels.at(-1),0);player.setMuted(false);
    let drained=false;const drain=player.drain(new AbortController().signal).then(()=>{drained=true;});sources[0].onended();await Promise.resolve();assert.equal(drained,false);sources[1].onended();await drain;assert.equal(drained,true);
    player.enqueue(pcm,'audio/pcm');const oldEnd=sources[2].onended;player.stop();player.enqueue(pcm,'audio/pcm');oldEnd();
    let newDrained=false;const next=player.drain(new AbortController().signal).then(()=>{newDrained=true;});await Promise.resolve();assert.equal(newDrained,false,'stale ended callback cannot drain a new generation');sources[3].onended();await next;
    context.state='suspended';context.onstatechange();assert.equal(states.at(-1),'suspended');assert.equal(player.contextState,'suspended');assert.throws(()=>player.enqueue(pcm,'audio/pcm'));
    player.close();assert.equal(levels.at(-1),0);assert.equal(context.state,'closed');assert.equal(context.onstatechange,null,'cleanup removes the context observer before closing');
  }finally{player.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
});

test('native capture gates worklet epochs, uses actual sample rate, and stops late-granted permission tracks',async()=>{
  const names=['AudioContext','AudioWorkletNode','navigator'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),contexts=[],nodes=[],frames=[];
  const track=()=>({readyState:'live',enabled:true,stop(){this.readyState='ended';this.stopped=true;}}),stream=()=>{const item=track();return{item,getTracks:()=>[item],getAudioTracks:()=>[item]};};
  const first=stream();let request=async()=>first;
  class Context{state='running';sampleRate=44100;destination={};audioWorklet={addModule:async path=>assert.equal(path,'/audio/eden-live-capture-worklet.js')};constructor(){contexts.push(this);}async resume(){}async close(){this.state='closed';}createMediaStreamSource(){return{connect(){},disconnect(){}};}createGain(){return{gain:{value:1},connect(){},disconnect(){}};}}
  class Worklet{port={messages:[],onmessage:null,postMessage(value){this.messages.push(value);},close(){this.closed=true;}};constructor(){nodes.push(this);}connect(){}disconnect(){this.disconnected=true;}}
  for(const[name,value]of Object.entries({AudioContext:Context,AudioWorkletNode:Worklet,navigator:{mediaDevices:{getUserMedia:options=>{assert.equal(options.video,false);return request();}}}}))Object.defineProperty(globalThis,name,{configurable:true,value});
  try{
    const states=[],capture=new BrowserLiveMicrophone((frame,rate)=>frames.push({frame,rate}),()=>assert.fail('unexpected capture failure'),state=>states.push(state));
    assert.equal(contexts.length,0);await capture.start(new AbortController().signal);assert.equal(capture.active,true);
    const port=nodes[0].port,emit=epoch=>port.onmessage({data:{frame:new Float32Array(1024),epoch}});
    emit(0);assert.equal(frames.length,0);capture.setForwarding(true);emit(1);assert.equal(frames.length,1);assert.equal(frames[0].rate,44100);
    capture.setForwarding(false);capture.setForwarding(true);emit(1);assert.equal(frames.length,1,'queued pre-output PCM cannot escape the next gate');
    capture.setMuted(true);emit(3);assert.equal(frames.length,1);assert.equal(first.item.enabled,false);capture.setMuted(false);emit(3);assert.equal(frames.length,2);
    contexts[0].state='suspended';contexts[0].onstatechange();assert.equal(states.at(-1),'suspended');assert.equal(capture.contextState,'suspended');assert.equal(capture.active,false,'a live track is not an active capture graph while its context is suspended');
    contexts[0].state='running';contexts[0].onstatechange();assert.equal(capture.active,true);
    const late=port.onmessage;capture.stop();late({data:{frame:new Float32Array(1024),epoch:3}});assert.equal(frames.length,2);assert.equal(first.item.stopped,true);assert.equal(port.closed,true);assert.equal(contexts[0].state,'closed');
    let grant;request=()=>new Promise(resolve=>{grant=resolve;});const delayed=new BrowserLiveMicrophone(()=>assert.fail('late capture'),()=>{}),pending=delayed.start(new AbortController().signal);
    delayed.stop();const second=stream();grant(second);await assert.rejects(pending);assert.equal(second.item.stopped,true);assert.equal(delayed.active,false);assert.equal(contexts[1].state,'closed');
  }finally{for(const name of names){const value=saved.get(name);if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
});

test('worklet discards buffered microphone data at every half-duplex gate boundary',async()=>{
  let Processor;const posted=[];
  const sandbox={AudioWorkletProcessor:class{port={postMessage:value=>posted.push(value),onmessage:null};},registerProcessor:(name,value)=>{assert.equal(name,'eden-live-capture');Processor=value;},Float32Array};
  vm.runInNewContext(await readFile(new URL('../public/audio/eden-live-capture-worklet.js',import.meta.url),'utf8'),sandbox);
  const worklet=new Processor(),input=value=>[[new Float32Array(128).fill(value)]];
  worklet.process(input(1));assert.equal(posted.length,0);
  worklet.port.onmessage({data:{enabled:true,epoch:1}});for(let i=0;i<4;i++)worklet.process(input(1));
  worklet.port.onmessage({data:{enabled:false,epoch:2}});worklet.process(input(1));
  worklet.port.onmessage({data:{enabled:true,epoch:3}});for(let i=0;i<8;i++)worklet.process(input(-.5));
  assert.equal(posted.length,1);assert.equal(posted[0].epoch,3);assert.ok(posted[0].frame.every(value=>value===-.5));
});
