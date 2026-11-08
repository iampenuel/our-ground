import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { EdenController, clampLevel } from '../src/eden/runtime/controller.ts';
import { EDEN_STATES } from '../src/eden/types/eden.ts';
import { blinkClosure, mouthAt, Spring } from '../src/eden/runtime/motion.ts';
function fixture() {
  const calls=[]; const renderer=Object.fromEntries(['setState','setAudioLevel','setReducedMotion','setPaused','dispose'].map(k=>[k,(v)=>calls.push([k,v])]));
  return { controller: new EdenController(renderer), calls };
}
test('every state can immediately interrupt every other state', () => {
  const {controller,calls}=fixture();
  for(const from of EDEN_STATES) for(const to of EDEN_STATES) { controller.setEdenState(from);controller.setEdenState(to);assert.equal(controller.snapshot.state,to);assert.deepEqual(calls.at(-1),['setState',to]); }
  controller.dispose();
});
test('speech input clamps, ignores invalid samples, and clears on interruption',()=>{
 const {controller,calls}=fixture();controller.setEdenAudioLevel(1);assert.equal(controller.snapshot.audioLevel,0);
 controller.setEdenState('speaking');controller.setEdenAudioLevel(2);assert.equal(controller.snapshot.audioLevel,1);
 controller.setEdenAudioLevel(NaN);assert.equal(controller.snapshot.audioLevel,0);
 controller.setEdenAudioLevel(.6);assert.deepEqual(calls.at(-1),['setAudioLevel',.6]);
 controller.dispatch({type:'playback-interrupted'});assert.equal(controller.snapshot.state,'idle');assert.equal(controller.snapshot.audioLevel,0);controller.dispose();
 assert.equal(clampLevel(Infinity),0);assert.equal(clampLevel(-1),0);
});
test('stale search completion cannot hijack a newer search or interrupted playback',()=>{
 const {controller}=fixture();controller.dispatch({type:'search-started',requestId:'old'});controller.dispatch({type:'search-started',requestId:'new'});
 controller.dispatch({type:'search-failed',requestId:'old'});assert.equal(controller.snapshot.state,'searching');
 controller.dispatch({type:'search-completed',requestId:'new'});assert.equal(controller.snapshot.state,'success');
 controller.dispatch({type:'search-started',requestId:'later'});controller.dispatch({type:'playback-started'});controller.dispatch({type:'search-completed',requestId:'later'});assert.equal(controller.snapshot.state,'speaking');controller.dispose();
});
test('success returns to idle, and interruption cancels that return',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {controller}=fixture();controller.setEdenState('success');t.mock.timers.tick(1700);assert.equal(controller.snapshot.state,'idle');
 controller.setEdenState('success');t.mock.timers.tick(700);controller.setEdenState('listening');t.mock.timers.tick(1700);assert.equal(controller.snapshot.state,'listening');controller.dispose();
});
test('reduced motion, pause, and disposal propagate without pending callbacks',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {controller,calls}=fixture();controller.setEdenReducedMotion(true);assert.deepEqual(calls.at(-1),['setReducedMotion',true]);controller.setPaused(true);assert.equal(controller.snapshot.paused,true);
 let count=0;controller.subscribe(()=>count++);controller.setEdenState('success');controller.dispose();const total=calls.length,events=count;t.mock.timers.tick(5000);controller.setEdenState('speaking');assert.equal(calls.length,total);assert.equal(count,events);
});
test('blink closes completely, holds briefly, then reopens without scaling the pupil',()=>{
 assert.equal(blinkClosure(-1),0);assert.equal(blinkClosure(0),0);assert.equal(blinkClosure(.08),1);assert.equal(blinkClosure(.1),1);assert.ok(blinkClosure(.17)>0&&blinkClosure(.17)<1);assert.equal(blinkClosure(.25),0);
});
test('mouth amplitude changes real blend dimensions across six distinct poses',()=>{
 const poses=[0,.2,.4,.6,.8,1].map(mouthAt);assert.equal(new Set(poses.map(p=>JSON.stringify(p))).size,6);assert.ok(poses[0].open<.04);assert.ok(poses[3].open>1);assert.ok(poses[4].width<poses[2].width);
 for(let x=0;x<.999;x+=.01){const a=mouthAt(x),b=mouthAt(x+.001);assert.ok(Math.abs(a.open-b.open)<.01);}
});
test('spring retargeting preserves position and converges at 30, 60, and 120Hz',()=>{
 for(const hz of [30,60,120]) { const s=new Spring(0);for(let i=0;i<hz/5;i++)s.step(1,1/hz);const before=s.value;s.step(-1,1/hz);assert.ok(Math.abs(s.value-before)<.3);for(let i=0;i<hz*2;i++)s.step(-1,1/hz);assert.ok(Math.abs(s.value+1)<1e-6); }
});
test('approved original stays byte-identical and native export is a real Rive file',async()=>{
 const original=await readFile(new URL('../public/assets/eden/approved-original/eden.png',import.meta.url));assert.equal(createHash('sha256').update(original).digest('hex'),'3684dc5bf698214170022b433f440634f2b41c6ec0a6b737ef25448097dbd871');
 const riv=await readFile(new URL('../public/assets/eden/rig/eden.riv',import.meta.url));assert.equal(riv.subarray(0,4).toString(),'RIVE');assert.ok(riv.byteLength>10000);
});
test('exact approved profile and its transparent-margin-only square crop stay unchanged',async()=>{
 const root=new URL('../public/assets/eden/approved-profile/',import.meta.url);
 const original=await readFile(new URL('eden-profile-original.png',root));
 const launcher=await readFile(new URL('eden-launcher.png',root));
 assert.equal(createHash('sha256').update(original).digest('hex'),'36fcce1f37f977de96c856553f081a01a45c36931eadf0d43c70bc9267b7134f');
 assert.equal(createHash('sha256').update(launcher).digest('hex'),'d9638364ebe98f041a4011ee7625debac1f6fc708122018325918d7d6e409326');
 assert.deepEqual([original.readUInt32BE(16),original.readUInt32BE(20)],[326,366]);
 assert.deepEqual([launcher.readUInt32BE(16),launcher.readUInt32BE(20)],[282,282]);
 assert.equal(launcher[25],6); // RGBA: retain the source's circular alpha edge.
});
