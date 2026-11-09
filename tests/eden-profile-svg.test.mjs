import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {profileIdlePose,profileSpeechLevel,profileSpeechGeometry,profileOpennessGeometry,ProfileSpeechEnvelope,PROFILE_SPEECH_TIMING,profileBrowTarget,ProfileSvgRenderer,createProfileSvgLoader} from '../src/eden/runtime/profile-svg.ts';

function platform() {
  const names=['document','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','Image','fetch'];
  const originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  class Element {
    children=[];attributes=new Map();dataset={};style={};isConnected=true;parent=null;hidden=false;
    constructor(tag='g'){this.tag=tag;}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
    setAttribute(name,value){this.attributes.set(name,value);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;this.isConnected=false;}
  }
  const events=new Map(),frames=new Map(),observers=[];let frame=0;
  const document={hidden:false,createElementNS:(_ns,tag)=>new Element(tag),addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}};
  const values={document,IntersectionObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.closed=true;}show(value){this.fn([{isIntersecting:value}]);}},requestAnimationFrame:fn=>{const id=++frame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  for(const [name,value]of Object.entries(values))Object.defineProperty(globalThis,name,{configurable:true,value});
  const parts=Object.fromEntries(['head','body','hair','leftHoop','rightHoop','leftGaze','rightGaze','leftAperture','rightAperture','leftLid','rightLid','headRest','headSpeaking','mouth','mouthCavity','mouthTeeth','mouthTongue','mouthOutline','mouthClip','browSkin','browLeft','browRight','browFringe'].map(name=>[name,new Element()]));
  const svg=new Element('svg');
  return{Element,document,frames,events,observers,parts,svg,tick(now){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));},restore(){for(const name of names){const value=originals.get(name);if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}};
}
const portrait = env => Object.fromEntries(Object.entries(env.parts).map(([name,node])=>[name,Object.fromEntries(node.attributes)]));
const numbers = value => [...value.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map(match=>Number(match[0]));

function speakingSample(level, {state='speaking',stop}={}) {
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0);
    renderer.setState(state);renderer.setPaused(false);renderer.setAudioLevel(level);
    for(let frame=0;frame<=30;frame++)env.tick(1000+frame*1000/60);
    const speaking=portrait(env);
    if(stop==='interrupt')renderer.setState('idle');
    if(stop==='pause'){renderer.setPaused(true);assert.equal(env.frames.size,0);renderer.setPaused(false);}
    env.tick(1000+31*1000/60);
    const stopped=portrait(env);renderer.dispose();
    return{speaking,stopped};
  }finally{env.restore();}
}

test('feature poses retain exact neutral rest and stay within the approved independent ranges',()=>{
  const rest=profileIdlePose(0);
  assert.deepEqual(rest,{headRotation:0,headX:0,headY:0,bodyScale:1,hairRotation:0,leftHoop:0,rightHoop:0,gazeX:0,gazeY:0});
  assert.deepEqual(profileIdlePose(31),rest);assert.deepEqual(profileIdlePose(12,true),rest);
  for(let time=0;time<=31;time+=.1){const p=profileIdlePose(time);assert.ok(Math.abs(p.headRotation)<=.010*180/Math.PI+1e-9);assert.ok(Math.abs(p.headX)<=.5);assert.ok(Math.abs(p.headY)<=.5);assert.ok(p.bodyScale>=1&&p.bodyScale<=1.0018);assert.ok(Math.abs(p.gazeX)<=1.4);assert.ok(p.gazeY>=-.6&&p.gazeY<=0);}
  const p=profileIdlePose(12);assert.notEqual(p.leftHoop,p.rightHoop);assert.notEqual(p.hairRotation,p.headRotation);assert.notEqual(p.gazeX,0);
});

test('renderer changes feature groups, closes the whole eye, and pauses/cleans every lifecycle path',()=>{
  const env=platform();try{
    let released=0;const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>released++,()=>0);
    assert.equal(env.parts.head.attributes.get('transform'),'translate(151 214) rotate(0)');
    renderer.setPaused(false);let firstClosed;
    for(let frame=0;frame<=100;frame++){env.tick(1000+frame*1000/60);if(env.parts.leftAperture.attributes.get('height')==='0'){firstClosed??=frame/60;assert.equal(env.parts.rightAperture.attributes.get('height'),'0');assert.equal(env.parts.leftLid.attributes.get('opacity'),'1');}}
    assert.ok(firstClosed>=1.4&&firstClosed<=2.3);
    assert.notEqual(env.parts.head.attributes.get('transform'),'translate(151 214) rotate(0)');
    assert.equal(env.svg.attributes.has('transform'),false);
    renderer.setPaused(true);assert.equal(env.frames.size,0);
    renderer.setPaused(false);env.observers[0].show(false);assert.equal(env.frames.size,0);
    env.observers[0].show(true);env.document.hidden=true;env.events.get('visibilitychange')();assert.equal(env.frames.size,0);
    env.document.hidden=false;env.events.get('visibilitychange')();assert.equal(env.frames.size,1);
    renderer.setReducedMotion(true);assert.equal(env.frames.size,0);assert.equal(env.parts.head.attributes.get('transform'),'translate(151 214) rotate(0)');assert.equal(env.parts.leftAperture.attributes.get('height'),'20');
    renderer.dispose();renderer.dispose();assert.equal(released,1);assert.equal(env.events.size,0);assert.equal(env.observers[0].closed,true);
  }finally{env.restore();}
});

test('state cues ease into independent, bounded features without changing the approved root portrait',()=>{
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0);
    renderer.setPaused(false);env.tick(1000);
    const initial=portrait(env);renderer.setState('thinking');
    assert.deepEqual(portrait(env),initial,'a state event does not jump the feature transforms');
    env.tick(1000+1000/60);
    assert.ok(Math.abs(numbers(env.parts.head.attributes.get('transform'))[2])<.02,'first-frame response is restrained');
    let frame=1;const cues={};
    for(const state of['thinking','searching','clarifying','success','unable','listening','speaking','idle']){
      renderer.setState(state);
      for(let step=0;step<60;step++){frame++;env.tick(1000+frame*1000/60);}
      const idle=profileIdlePose(frame/60),head=numbers(env.parts.head.attributes.get('transform')),gaze=numbers(env.parts.leftGaze.attributes.get('transform'));
      cues[state]={tilt:head[2]-idle.headRotation,y:head[1]-214-idle.headY,gaze:gaze[0]-idle.gazeX};
      assert.ok(Math.abs(head[2])<=1&&Math.abs(head[1]-214)<=.75);
      assert.ok(Math.abs(gaze[0])<=1.4&&gaze[1]>=-.6&&gaze[1]<=0);
      assert.ok(Number(env.parts.leftAperture.attributes.get('height'))>=0&&Number(env.parts.leftAperture.attributes.get('height'))<=20);
      assert.equal(env.svg.attributes.has('transform'),false);
    }
    assert.ok(cues.thinking.gaze>.3);assert.ok(cues.searching.gaze<-.2);
    assert.ok(cues.clarifying.tilt>.2);assert.ok(cues.unable.tilt<-.08);
    assert.ok(cues.success.y>.1);assert.ok(cues.listening.y<-.05);
    renderer.dispose();
  }finally{env.restore();}
});

test('only finite speaking amplitude animates head/hoops and pause or interruption removes its motion',()=>{
  const silent=speakingSample(0),active=speakingSample(1);
  assert.notEqual(active.speaking.head.transform,silent.speaking.head.transform);
  assert.notEqual(active.speaking.leftHoop.transform,silent.speaking.leftHoop.transform);
  assert.equal(active.speaking.hair.transform,silent.speaking.hair.transform);
  assert.equal(active.speaking.leftGaze.transform,silent.speaking.leftGaze.transform);
  assert.equal(active.speaking.body.transform,silent.speaking.body.transform);
  assert.deepEqual(speakingSample(99),active,'amplitude is bounded');
  for(const level of[NaN,Infinity,-1])assert.deepEqual(speakingSample(level),silent);
  assert.deepEqual(speakingSample(1,{state:'thinking'}),speakingSample(0,{state:'thinking'}),'non-speaking state ignores amplitude');
  for(const stop of['interrupt','pause'])assert.deepEqual(speakingSample(1,{stop}).stopped,speakingSample(0,{stop}).stopped,`${stop} cannot carry an audio tail into the next frame`);
});

test('reduced motion restores exact neutral features even during speech and state updates',()=>{
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0),rest=portrait(env);
    renderer.setPaused(false);renderer.setState('speaking');renderer.setAudioLevel(1);
    for(let frame=0;frame<=30;frame++)env.tick(1000+frame*1000/60);
    assert.notDeepEqual(portrait(env),rest);
    renderer.setReducedMotion(true);assert.deepEqual(portrait(env),rest);assert.equal(env.frames.size,0);
    renderer.setState('clarifying');renderer.setAudioLevel(1);renderer.blink();env.tick(4000);
    assert.deepEqual(portrait(env),rest);assert.equal(env.frames.size,0);
    renderer.dispose();renderer.setPaused(false);renderer.setState('speaking');renderer.setAudioLevel(1);
    assert.equal(env.frames.size,0);
  }finally{env.restore();}
});

test('loader waits for all decoded original layers and has no Rive/WASM/provider request',async()=>{
  const env=platform();try{
    const host=new env.Element(),image=new env.Element('img');host.append(image);
    let finishDecode;const decodeGate=new Promise(resolve=>{finishDecode=resolve;});const requests=[];
    Object.defineProperty(globalThis,'Image',{configurable:true,value:class{set src(value){this.value=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this.value;}decode(){return decodeGate;}}});
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url)=>{requests.push(url);return new Response(new Blob(['test image']));}});
    const pending=createProfileSvgLoader()(host,new AbortController().signal);
    for(let i=0;i<12;i++)await Promise.resolve();
    assert.equal(host.children.length,1);assert.equal(image.hidden,false);
    finishDecode();const {svg,renderer}=await pending;
    assert.equal(requests.length,15);assert.ok(requests.every(url=>url.startsWith('/assets/eden/approved-profile/layers/')&&url.endsWith('.png')));
    assert.equal(svg.style.visibility,'hidden');assert.equal(svg.attributes.get('viewBox'),'0 0 282 282');assert.equal(host.children.length,2);assert.equal(image.hidden,false);
    renderer.dispose();assert.equal(host.children.length,1);
  }finally{env.restore();}
});

test('concurrent portraits share fifteen downloads while cancellation, decoding and SVG IDs stay independent',async()=>{
  const env=platform();try{
    const loader=createProfileSvgLoader(),first=new env.Element(),second=new env.Element(),third=new env.Element();
    for(const host of[first,second,third])host.append(new env.Element('img'));
    let finishFetch;const fetchGate=new Promise(resolve=>{finishFetch=resolve;}),requests=[];let decoded=0;
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url,options)=>{requests.push({url,signal:options.signal});await fetchGate;return new Response(new Blob(['original layer']));}});
    Object.defineProperty(globalThis,'Image',{configurable:true,value:class{set src(value){this.value=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this.value;}async decode(){decoded++;}}});
    const abort=new AbortController(),cancelled=loader(first,abort.signal),remaining=loader(second,new AbortController().signal);
    assert.equal(requests.length,15);abort.abort();await assert.rejects(cancelled,/Portrait unavailable/);
    assert.equal(first.children.length,1);assert.ok(requests.every(request=>!request.signal.aborted),'one consumer does not abort the shared transfer');
    finishFetch();const a=await remaining,b=await loader(third,new AbortController().signal);
    assert.equal(requests.length,15,'a later portrait reuses only the fixed layer bytes');assert.equal(decoded,30,'every surviving portrait decodes its own images');
    assert.equal(first.children.length,1,'cancelled portrait cannot return after the transfer');
    assert.equal(first.children[0].hidden,false);assert.equal(second.children.length,2);assert.equal(third.children.length,2);
    const firstIds=new Set(a.svg.children[0].children.map(node=>node.attributes.get('id')));
    assert.ok(b.svg.children[0].children.every(node=>!firstIds.has(node.attributes.get('id'))),'independent clip IDs prevent cross-portrait references');
    a.renderer.dispose();assert.equal(second.children.length,1);assert.equal(third.children.length,2,'disposing one renderer leaves the other intact');
    b.renderer.dispose();
  }finally{env.restore();}
});

test('failed shared downloads leave both PNGs intact and a later mount retries the cache',async()=>{
  const env=platform();try{
    const loader=createProfileSvgLoader(),first=new env.Element(),second=new env.Element();
    first.append(new env.Element('img'));second.append(new env.Element('img'));
    let failing=true,requests=0;
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>{requests++;return failing?new Response(null,{status:503}):new Response(new Blob(['original layer']));}});
    Object.defineProperty(globalThis,'Image',{configurable:true,value:class{set src(value){this.value=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this.value;}async decode(){}}});
    const failed=await Promise.allSettled([loader(first,new AbortController().signal),loader(second,new AbortController().signal)]);
    assert.ok(failed.every(result=>result.status==='rejected'));assert.equal(requests,15);
    assert.equal(first.children.length,1);assert.equal(second.children.length,1);
    failing=false;const {renderer}=await loader(first,new AbortController().signal);
    assert.equal(requests,30,'rejected shared transfer is not retained');assert.equal(first.children.length,2);assert.equal(second.children.length,1);
    renderer.dispose();
  }finally{env.restore();}
});

test('abort during image decoding cannot append a late SVG or discard reusable layer bytes',async()=>{
  const env=platform();try{
    const loader=createProfileSvgLoader(),host=new env.Element(),images=[];host.append(new env.Element('img'));
    let finishDecode,startDecoding;const decodeGate=new Promise(resolve=>{finishDecode=resolve;}),decoding=new Promise(resolve=>{startDecoding=resolve;});let requests=0,decodeCount=0;
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>{requests++;return new Response(new Blob(['original layer']));}});
    Object.defineProperty(globalThis,'Image',{configurable:true,value:class{constructor(){images.push(this);}set src(value){this.value=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this.value;}decode(){if(++decodeCount===15)startDecoding();return decodeGate;}}});
    const abort=new AbortController(),pending=loader(host,abort.signal);
    await decoding;
    assert.equal(images.length,15);abort.abort();await assert.rejects(pending,/Portrait unavailable/);
    host.isConnected=false;finishDecode();for(let i=0;i<20;i++)await Promise.resolve();
    assert.equal(host.children.length,1);assert.ok(images.every(image=>image.src===''));
    const replacement=new env.Element(),{renderer}=await loader(replacement,new AbortController().signal);
    assert.equal(requests,15);assert.equal(replacement.children.length,1);renderer.dispose();
  }finally{env.restore();}
});

test('mouth changes only with actual playback amplitude and restores the exact resting source',()=>{
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0);
    renderer.setPaused(false);renderer.setState('speaking');
    for(let i=0;i<20;i++)env.tick(1000+i*17);
    assert.equal(env.parts.mouth.attributes.get('opacity'),'0');
    renderer.setAudioLevel(.2);for(let i=20;i<40;i++)env.tick(1000+i*17);
    assert.equal(env.parts.headRest.attributes.get('opacity'),'0');assert.equal(env.parts.headSpeaking.attributes.get('opacity'),'1');
    assert.equal(env.parts.mouth.attributes.get('opacity'),'1');assert.notEqual(env.parts.mouthCavity.attributes.get('d'),profileSpeechGeometry(0).outer);assert.equal(env.parts.mouth.attributes.has('transform'),false,'the speaking contour changes rather than scaling the same PNG');
    renderer.setAudioLevel(0);env.tick(1700);
    assert.equal(env.parts.headRest.attributes.get('opacity'),'1');assert.equal(env.parts.mouth.attributes.get('opacity'),'0');
    renderer.setState('listening');renderer.setAudioLevel(.9);env.tick(1717);assert.equal(env.parts.mouth.attributes.get('opacity'),'0');
    renderer.setReducedMotion(true);assert.equal(env.parts.headRest.attributes.get('opacity'),'1');renderer.dispose();
  }finally{env.restore();}
});

test('six source-derived reference contours remain available without treating them as a loudness-ordered viseme sequence',()=>{
  const poses=[0,.2,.4,.6,.8,1].map(profileSpeechGeometry);
  assert.deepEqual(poses.map(pose=>pose.name),['closed','slight','medium','wide','rounded','smile']);assert.equal(new Set(poses.map(pose=>pose.outer)).size,6);
  assert.ok(poses[3].open>poses[0].open*10,'wide opening is clearly separated from a closed moment');assert.ok(poses[4].width<poses[3].width*.65,'rounded pose changes width independently');
  assert.equal(profileSpeechGeometry(0).teethOpacity,0);assert.ok(profileSpeechGeometry(.8).teethOpacity<.3);
  for(const value of[NaN,Infinity,-1,0,.008])assert.equal(profileSpeechLevel(value),0);
});

test('speaking paths ease from the visible pose and actual silence, pause or interruption restores the untouched source immediately',()=>{
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0);renderer.setPaused(false);renderer.setState('speaking');env.tick(1000);
    renderer.setAudioLevel(.23);env.tick(1017);const first=env.parts.mouthCavity.attributes.get('d');assert.notEqual(first,profileOpennessGeometry(profileSpeechLevel(.23)).outer,'first-frame movement is smoothed');
    for(let i=2;i<35;i++)env.tick(1000+i*17);const open=env.parts.mouthCavity.attributes.get('d');assert.notEqual(open,first);assert.equal(env.parts.mouthClip.attributes.get('d'),open);assert.equal(env.parts.mouthOutline.attributes.get('d'),open,'contents and outline share one seamless boundary');
    renderer.setAudioLevel(.40);assert.equal(env.parts.mouthCavity.attributes.get('d'),open,'a changed target retains the current visible contour');
    for(let i=35;i<60;i++)env.tick(1000+i*17);assert.equal(env.svg.dataset.profileMouthPose,'wide');assert.notEqual(env.parts.mouthCavity.attributes.get('d'),open);
    renderer.setAudioLevel(0);assert.equal(env.parts.headRest.attributes.get('opacity'),'1');assert.equal(env.parts.headSpeaking.attributes.get('opacity'),'0');assert.equal(env.parts.mouth.attributes.get('opacity'),'0','no animation-frame delay on silence');
    renderer.setAudioLevel(.3);env.tick(2030);renderer.setPaused(true);assert.equal(env.parts.headRest.attributes.get('opacity'),'1');assert.equal(env.parts.mouth.attributes.get('opacity'),'0');assert.equal(env.frames.size,0);
    renderer.setPaused(false);renderer.setAudioLevel(.3);env.tick(2047);renderer.setState('idle');assert.equal(env.parts.headRest.attributes.get('opacity'),'1');assert.equal(env.parts.mouth.attributes.get('opacity'),'0');renderer.dispose();
  }finally{env.restore();}
});

test('live loudness changes openness monotonically and never infers rounded lips or a smile from volume',()=>{
  let previous={open:0,width:0};
  for(let i=0;i<=200;i++){
    const geometry=profileOpennessGeometry(profileSpeechLevel(i/200));
    assert.ok(geometry.open>=previous.open&&geometry.width>=previous.width);assert.ok(['closed','slight','medium','wide'].includes(geometry.name));previous=geometry;
  }
});

test('causal speech envelope is rate-independent, suppresses rapid RMS chatter and bounds movement speed',()=>{
  const settled=[];
  for(const rate of[30,60,120]){const envelope=new ProfileSpeechEnvelope();for(let i=0;i<rate;i++)envelope.step(.22,1/rate);settled.push(envelope.value);assert.equal(envelope.active,true);}
  assert.ok(Math.max(...settled)-Math.min(...settled)<.04);
  const envelope=new ProfileSpeechEnvelope();for(let i=0;i<120;i++)envelope.step(.21,1/60);
  const values=[];for(let i=0;i<120;i++){const previous=envelope.value;envelope.step(i%2?.18:.24,1/60);values.push(envelope.value);assert.ok(Math.abs(envelope.value-previous)<=PROFILE_SPEECH_TIMING.openingSpeed/60+1e-9);}
  const rawRange=profileSpeechLevel(.24)-profileSpeechLevel(.18);assert.ok(Math.max(...values)-Math.min(...values)<rawRange*.6,'fast level jitter does not create a different lip category each frame');
});

test('positive near-silence uses threshold hysteresis and dwell, while exact silence bypasses every hold',()=>{
  const envelope=new ProfileSpeechEnvelope();envelope.step(.2,.01);assert.equal(envelope.active,false);envelope.step(.2,.01);assert.equal(envelope.active,true);
  for(let i=0;i<8;i++)envelope.step(.004,.01);assert.equal(envelope.active,true,'a short positive dip does not flash the original smile');
  for(let i=0;i<7;i++)envelope.step(.004,.01);assert.equal(envelope.active,false);assert.equal(envelope.value,0);
  for(let i=0;i<20;i++)envelope.step(.3,.01);assert.ok(envelope.value>0);envelope.step(0,0);assert.equal(envelope.value,0);assert.equal(envelope.active,false);
  for(let i=0;i<100;i++)envelope.step(.004,.01);assert.equal(envelope.active,false,'small positive noise cannot reopen the mouth');
});

test('independent source brows lift by less than a pixel with state springs and restore exact neutral fallback',()=>{
  const env=platform();try{
    const renderer=new ProfileSvgRenderer(env.svg,env.parts,()=>{},()=>0);assert.equal(env.parts.browSkin.attributes.get('opacity'),'0');
    assert.deepEqual(profileBrowTarget('idle',1),[0,0]);assert.deepEqual(profileBrowTarget('speaking',0),[0,0]);
    renderer.setPaused(false);renderer.setState('listening');env.tick(1000);for(let i=1;i<30;i++)env.tick(1000+i*17);
    const left=numbers(env.parts.browLeft.attributes.get('transform'))[1],right=numbers(env.parts.browRight.attributes.get('transform'))[1];assert.ok(left<-.3&&left>=-.4);assert.ok(right<-.2&&right>=-.3);assert.equal(env.parts.browFringe.attributes.get('opacity'),'1');
    const current=env.parts.browLeft.attributes.get('transform');renderer.setState('thinking');assert.equal(env.parts.browLeft.attributes.get('transform'),current,'retargeting retains the current pose');
    for(let i=30;i<60;i++)env.tick(1000+i*17);assert.ok(numbers(env.parts.browLeft.attributes.get('transform'))[1]>=-.7);assert.ok(numbers(env.parts.browRight.attributes.get('transform'))[1]>=-.6);
    renderer.setState('idle');assert.equal(env.parts.browSkin.attributes.get('opacity'),'0');assert.equal(env.parts.browLeft.attributes.get('transform'),'translate(0 0)');
    renderer.setState('listening');for(let i=60;i<80;i++)env.tick(1000+i*17);renderer.setPaused(true);assert.equal(env.parts.browSkin.attributes.get('opacity'),'0');assert.equal(env.parts.browFringe.attributes.get('opacity'),'0');
    renderer.setReducedMotion(true);assert.equal(env.parts.browLeft.attributes.get('transform'),'translate(0 0)');renderer.dispose();
  }finally{env.restore();}
});

test('public SVG layer assets are exact byte copies of the approved RML source layers',async()=>{
  for(const name of['background','body','head','eye-left','eye-right','hair-front','earring-left','earring-right','lash-left','lash-right']){
    const [source,publicCopy]=await Promise.all([readFile(new URL(`../src/eden/animation/launcher-profile/assets/${name}.png`,import.meta.url)),readFile(new URL(`../public/assets/eden/approved-profile/layers/${name}.png`,import.meta.url))]);
    assert.equal(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(publicCopy).digest('hex'),name);
  }
});
