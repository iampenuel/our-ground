import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {hearOneCommand,prepareLocalRecognition,localEnglishVoices,speakLocalReply} from '../src/eden/command-voice.ts';

const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const originalUtterance=Object.getOwnPropertyDescriptor(globalThis,'SpeechSynthesisUtterance');
function restore(key,descriptor){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
afterEach(()=>{restore('window',originalWindow);restore('navigator',originalNavigator);restore('SpeechSynthesisUtterance',originalUtterance);});
function platform(browser,permission='granted'){
  Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{permissions:{query:async()=>({state:permission})}}});
}
function recognizer(){
  let latest,started=0,aborted=0;
  class Local {
    processLocally=false; static available(){return 'available';}
    constructor(){latest=this;}
    start(){started++;assert(this.processLocally);}
    abort(){aborted++;}
  }
  return {Local,get latest(){return latest;},get started(){return started;},get aborted(){return aborted;}};
}
test('dictation requires permission, an installed English pack and processLocally support',async()=>{
  const r=recognizer();platform({SpeechRecognition:r.Local},'denied');
  await assert.rejects(prepareLocalRecognition(),/denied/);assert.equal(r.started,0);
  platform({webkitSpeechRecognition:class{}});await assert.rejects(prepareLocalRecognition(),/cannot recognize speech on this device/);
  platform({SpeechRecognition:r.Local});r.Local.available=()=>Promise.resolve('unavailable');
  await assert.rejects(prepareLocalRecognition(),/recognition is unavailable/);assert.equal(r.started,0);
});
test('cancel during language setup never starts recognition',async()=>{
  const r=recognizer(),controller=new AbortController();let resolve,installs=0;
  platform({SpeechRecognition:r.Local});const waiting=new Promise(done=>resolve=done);
  r.Local.available=()=>waiting;r.Local.install=()=>{installs++;return true;};
  const setup=prepareLocalRecognition(controller.signal);controller.abort();resolve('downloadable');
  await assert.rejects(setup,{name:'AbortError'});assert.equal(installs,0);assert.equal(r.started,0);
});
test('one utterance emits interim feedback and returns only final words; cancellation and restart ignore stale callbacks',async()=>{
  const r=recognizer(),interims=[],controller=new AbortController();
  platform({SpeechRecognition:r.Local});const ctor=await prepareLocalRecognition(controller.signal);
  const heard=hearOneCommand(ctor,controller.signal,s=>interims.push(s));
  r.latest.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'near hari'}}]});
  assert.deepEqual(interims,['near hari']);assert.equal(r.aborted,0);
  r.latest.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:' near Harrisburg '}}]});
  assert.equal(await heard,'near Harrisburg');assert.equal(r.aborted,1);assert.equal(r.latest.onresult,null);
  const canceled=hearOneCommand(ctor,controller.signal);const old=r.latest.onresult;
  controller.abort();await assert.rejects(canceled,{name:'AbortError'});
  const again=hearOneCommand(ctor,new AbortController().signal);
  old({resultIndex:0,results:[{isFinal:true,0:{transcript:'stale'}}]});
  r.latest.onerror({error:'no-speech'});assert.equal(await again,'');assert.equal(r.started,3);assert.equal(r.aborted,3);
});
test('browser recognition errors preserve a typed path and release the mic',async()=>{
  const r=recognizer(),hear=hearOneCommand(r.Local,new AbortController().signal);
  r.latest.onerror({error:'not-allowed'});
  await assert.rejects(hear,/can still type/);assert.equal(r.aborted,1);
});
test('device output honors only installed English voices and cancels a stale start',async()=>{
  const basic={voiceURI:'basic',name:'Basic',lang:'en-US',localService:true,default:true};
  const natural={...basic,name:'Alex Enhanced',voiceURI:'natural',default:false};
  let utterance,cancels=0,starts=0;
  platform({speechSynthesis:{getVoices:()=>[basic,{...natural,localService:false},{...natural,lang:'de-DE'},natural],
    speak:value=>{utterance=value;},cancel:()=>{cancels++;}}});
  Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});
  assert.deepEqual(localEnglishVoices(),[natural,basic]);
  const controller=new AbortController();
  const promise=speakLocalReply('Public reply',controller.signal,()=>{starts++;},'basic');
  assert.equal(utterance.voice,basic);const delayed=utterance.onstart;
  controller.abort();delayed();await assert.rejects(promise,{name:'AbortError'});
  assert.equal(starts,0);assert.equal(cancels,1);
  const replay=speakLocalReply('Another reply',new AbortController().signal,()=>{starts++;});
  assert.equal(utterance.voice,natural);utterance.onstart();utterance.onend();await replay;assert.equal(starts,1);
});
