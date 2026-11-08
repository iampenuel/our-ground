import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readHostedReply} from '../src/eden/hosted-playback.ts';

function wav(text) {
  // Valid 0.1-second PCM test audio. No Gemini request is made by this fixture.
  const data=Buffer.alloc(4844);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
  data.writeUInt32LE(24000,24);data.writeUInt32LE(48000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
  data.write('data',36);data.writeUInt32LE(data.length-44,40);
  return new Response(data,{headers:{'Content-Type':'audio/wav','X-Eden-Speech-Voice':'Aoede',
    'X-Eden-Speech-Text-SHA256':createHash('sha256').update(text).digest('hex')}});
}
const noop=()=>{};

test('Read reply never substitutes a native voice when its Aoede grant is missing, mismatched or fails',async()=>{
  const signal=new AbortController().signal;
  // No browser synthesis global is present. The named error must be returned
  // without consulting/invoking the native engine.
  for(const [answer,request,reason] of [
    [{reply:'Public page text.'},()=>assert.fail('no ticket'),/Aoede is unavailable/],
    [{reply:'Public page text.',speechTicket:'x'},()=>wav('A different message'),/Aoede could not generate/],
    [{reply:'Public page text.',speechTicket:'x'},async()=>{throw Error('quota');},/Aoede could not generate/],
  ])await assert.rejects(readHostedReply(answer,'',request,signal,noop,noop,noop),reason);
});

test('Read reply replays the exact clip, stops immediately, and ignores late playing events',async()=>{
  const originalAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio'),originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  let player,players=0,requests=0,starts=0,pauses=0;
  class TestAudio extends EventTarget {
    constructor(){super();player=this;players++;}
    paused=true;
    play(){return Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(){} load(){}
  }
  try{
    Object.defineProperty(globalThis,'Audio',{configurable:true,value:TestAudio});
    Object.defineProperty(globalThis,'document',{configurable:true,value:new EventTarget()});
    const answer={reply:'I am Eden, the Our Ground guide.',speechTicket:'test-grant'};
    const request=async (path,body)=>{requests++;assert.equal(path,'speech');assert.deepEqual(body,{speechTicket:'test-grant'});return wav(answer.reply);};
    const play=async controller=>readHostedReply(answer,'',request,controller.signal,()=>{starts++;},noop,()=>{pauses++;});
    const controller=new AbortController(),reading=play(controller);
    while(!player)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(starts,0,'a completed fetch is not playback');
    const staleStart=player.onplaying;
    player.onplaying();assert.equal(starts,1);
    player.onwaiting();assert.equal(pauses,1);
    controller.abort();await assert.rejects(reading,{name:'AbortError'});
    staleStart();assert.equal(starts,1);
    player=null;
    const replay=play(new AbortController());
    while(!player)await new Promise(resolve=>setTimeout(resolve,1));
    player.onplaying();player.onended();await replay;
    assert.equal(starts,2);assert.equal(players,2);assert.equal(requests,1);
  }finally {
    if(originalAudio)Object.defineProperty(globalThis,'Audio',originalAudio);else delete globalThis.Audio;
    if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete globalThis.document;
  }
});

test('an interrupted acquisition cannot start audio after the request returns',async()=>{
  let release;
  const answer={reply:'Public page.',speechTicket:'test-grant'},controller=new AbortController();
  const reading=readHostedReply(answer,'',()=>new Promise(resolve=>{release=resolve;}),controller.signal,
    ()=>assert.fail('stale playback began'),noop,noop);
  controller.abort();release(wav(answer.reply));
  await assert.rejects(reading,{name:'AbortError'});
});
