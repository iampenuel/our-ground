import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSearchReveal,revealSearchStatus,revealResultInPanel} from '../src/support-scroll.ts';

test('submission scroll waits for a frame, preserves focus and skips visible or obsolete status',()=>{
  const originals = Object.fromEntries(['window','requestAnimationFrame','getComputedStyle'].map(k=>[k,globalThis[k]]));
  const frames=[],scrolls=[];
  let rect={top:1100,bottom:1128},current=true,reduced=false;
  const status={isConnected:true,getBoundingClientRect:()=>rect,scrollIntoView:o=>scrolls.push(o),focus:()=>assert.fail('must not steal focus')};
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  globalThis.getComputedStyle=()=>({scrollMarginTop:'112px'});
  globalThis.window={innerHeight:844,matchMedia:()=>({matches:reduced})};
  try {
    revealSearchStatus(status,()=>current);
    assert.equal(scrolls.length,0);assert.equal(frames.length,1);
    frames.shift()();assert.deepEqual(scrolls,[{block:'start',behavior:'smooth'}]);
    rect={top:150,bottom:180};revealSearchStatus(status,()=>current);frames.shift()();assert.equal(scrolls.length,1);
    rect={top:10,bottom:38};reduced=true;revealSearchStatus(status,()=>current);frames.shift()();assert.equal(scrolls[1].behavior,'instant');
    current=false;revealSearchStatus(status,()=>current);frames.shift()();assert.equal(scrolls.length,2);
    current=true;status.isConnected=false;revealSearchStatus(status,()=>current);frames.shift()();assert.equal(scrolls.length,2);
    status.isConnected=true;rect={top:500,bottom:528};globalThis.window.visualViewport={offsetTop:0,height:450};
    revealSearchStatus(status,()=>current);frames.shift()();assert.equal(scrolls.length,3);
  } finally {for(const [k,v] of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

function scrollEnvironment(run) {
 const originals=Object.fromEntries(['window','requestAnimationFrame','getComputedStyle'].map(k=>[k,globalThis[k]]));
 const frames=[],scrolls=[],listeners=new Map();let current=true;
 const element=id=>({id,isConnected:true,getBoundingClientRect:()=>({top:1200,bottom:1250}),scrollIntoView:options=>scrolls.push({id,options}),focus:()=>assert.fail('focus must stay with user')});
 globalThis.requestAnimationFrame=fn=>frames.push(fn);globalThis.getComputedStyle=()=>({scrollMarginTop:'96px'});
 globalThis.window={innerHeight:800,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
 const flush=()=>{while(frames.length)frames.shift()()};
 try{run({element,scrolls,flush,signal:(name,event={})=>[...(listeners.get(name)??[])].forEach(fn=>fn(event)),current:()=>current,invalidate:()=>{current=false},listeners});}finally{for(const[k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}
test('a follow-up action can take scroll ownership after the final search reveal is queued',()=>scrollEnvironment(({element,scrolls,flush,current})=>{
  const flow=createSearchReveal(),finish=flow.start(element('status'),current);
  flush();
  finish(element('results'));
  flow.cancel();
  flush();
  assert.deepEqual(scrolls.map(s=>s.id),['status']);
}));
test('explicit reveal continues once from loading status to actual results and preserves focus',()=>scrollEnvironment(({element,scrolls,flush,current,listeners})=>{
 const flow=createSearchReveal(),finish=flow.start(element('status'),current);flush();finish(element('results'));flush();assert.deepEqual(scrolls.map(s=>s.id),['status','results']);assert([...listeners.values()].every(v=>v.size===0));
}));
test('wheel, touch, pointer, navigation keys and user focus movement cancel result scrolling',()=>{
 for(const[name,event]of [['wheel',{}],['touchstart',{}],['pointerdown',{}],['keydown',{key:'PageDown'}],['keydown',{key:'Tab'}]])scrollEnvironment(({element,scrolls,flush,current,signal})=>{const finish=createSearchReveal().start(element('status'),current);flush();signal(name,event);finish(element('results'));flush();assert.deepEqual(scrolls.map(s=>s.id),['status']);});
});
test('obsolete, disconnected and explicitly canceled searches never continue scrolling',()=>{
 for(const reason of ['obsolete','disconnected','cancel'])scrollEnvironment(({element,scrolls,flush,current,invalidate})=>{const flow=createSearchReveal(),finish=flow.start(element('status'),current);flush();const anchor=element('results');if(reason==='obsolete')invalidate();if(reason==='disconnected')anchor.isConnected=false;if(reason==='cancel')flow.cancel();finish(anchor);flush();assert.deepEqual(scrolls.map(s=>s.id),['status']);});
});

test('selected results reveal only the internal panel, preserving the document and focus',()=>{
 const panel={clientHeight:400,scrollHeight:2400,clientTop:1,scrollTop:0,getBoundingClientRect:()=>({top:100})};
 const card=(top,height=100)=>({getBoundingClientRect:()=>({top,bottom:top+height,height}),scrollIntoView:()=>assert.fail('must not move document'),focus:()=>assert.fail('must not steal focus')});
 assert.equal(revealResultInPanel(panel,card(700)),true);assert.equal(panel.scrollTop,299);
 assert.equal(revealResultInPanel(panel,card(150)),false);assert.equal(panel.scrollTop,299);
 assert.equal(revealResultInPanel(panel,card(50)),true);assert.equal(panel.scrollTop,248);
 panel.scrollTop=2300;revealResultInPanel(panel,card(800));assert.equal(panel.scrollTop,2000);
});
test('oversized expanded results reveal their heading; unbounded mobile lists do not receive a nested scroll',()=>{
 const panel={clientHeight:400,scrollHeight:2400,clientTop:0,scrollTop:400,getBoundingClientRect:()=>({top:100})};
 const big=top=>({getBoundingClientRect:()=>({top,bottom:top+900,height:900})});
 assert.equal(revealResultInPanel(panel,big(200)),false);assert.equal(panel.scrollTop,400);
 assert.equal(revealResultInPanel(panel,big(600)),true);assert.equal(panel.scrollTop,900);
 panel.clientHeight=2400;assert.equal(revealResultInPanel(panel,big(600)),false);assert.equal(panel.scrollTop,900);
});
