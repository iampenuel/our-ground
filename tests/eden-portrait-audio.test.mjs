import test from 'node:test';
import assert from 'node:assert/strict';
import {edenPcmEnvelope,trackPortraitAudio} from '../src/eden/runtime/portrait-audio.ts';

function output(){
  // Include a non-audio chunk so the sampler cannot assume a 44-byte header.
  const n=24000,bytes=new Uint8Array(56+n*2),view=new DataView(bytes.buffer);
  const word=(i,s)=>bytes.set(new TextEncoder().encode(s),i);
  word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  word(36,'JUNK');view.setUint32(40,4,true);word(48,'data');view.setUint32(52,n*2,true);
  for(let i=n/2;i<n;i++)view.setInt16(56+i*2,i%2?8192:-8192,true);
  return bytes;
}
test('speaking amplitude comes from the validated output playhead, including silence and bounds',()=>{
  const sample=edenPcmEnvelope(output());assert(sample);
  assert.equal(sample(.2),0);assert.equal(sample(.6),.25);assert.equal(sample(.99),.25);
  for(const t of [-1,1,NaN,Infinity])assert.equal(sample(t),0);
  assert.equal(edenPcmEnvelope(new Uint8Array(40)),null);
});
test('a pending, paused, stopped, or stale player cannot drive Eden’s mouth',()=>{
  const previous=new Map(['document','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const frames=new Map(),doc=new EventTarget();doc.hidden=false;
  Object.assign(globalThis,{document:doc,requestAnimationFrame:cb=>{frames.set(1,cb);return 1;},cancelAnimationFrame:id=>frames.delete(id)});
  try{
    const audio=Object.assign(new EventTarget(),{paused:false,ended:false,currentTime:.6,volume:.5,muted:false});
    const controller=new AbortController(),levels=[];
    const dispose=trackPortraitAudio(audio,output(),controller.signal,x=>levels.push(x));
    assert.equal(frames.size,0);assert.deepEqual(levels,[]);
    audio.dispatchEvent(new Event('playing'));assert.equal(levels.at(-1),.125);
    audio.dispatchEvent(new Event('waiting'));assert.equal(levels.at(-1),0);assert.equal(frames.size,0);
    audio.muted=true;audio.dispatchEvent(new Event('playing'));assert.equal(levels.at(-1),0);
    audio.muted=false;audio.dispatchEvent(new Event('pause'));audio.dispatchEvent(new Event('playing'));assert.equal(levels.at(-1),.125);
    controller.abort();assert.equal(levels.at(-1),0);assert.equal(frames.size,0);
    const count=levels.length;audio.dispatchEvent(new Event('playing'));dispose();assert.equal(levels.length,count);
  }finally{for(const [k,v] of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
