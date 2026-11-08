// Opt-in, protected Gemini acceptance. Inputs are synthetic public examples.
// Never record request bodies, auth headers, sessions, listing IDs or speech tickets.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
import {recordBrowser} from './browser-screencast.mjs';
const base=new URL(process.env.RECOVERY_BASE).origin,sha=process.env.RECOVERY_SHA;
assert(/^[a-f0-9]{40}$/.test(sha));
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-next-verification';await mkdir(out,{recursive:true});
const report={base,sha,steps:[],errors:[],status:'FAIL'};
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});p.setDefaultTimeout(45000);
 await protectRecoveryOrigin(p,base,process.env.VERCEL_OIDC_TOKEN);
 p.on('pageerror',e=>report.errors.push(e.name));
 const requests=[];
 p.on('response',r=>{
   const path=new URL(r.url()).pathname;if(!path.startsWith('/api/v1/eden/hosted/'))return;
   requests.push({endpoint:path.split('/').at(-1),status:r.status(),correlation:r.headers()['x-eden-correlation-id']??null});
 });
 await p.goto(base+'/?edenDiagnostics=1');
 const proof=await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit);
 assert.equal(proof,sha);
 await p.locator('.eden-launch').click();
 const answers=p.locator('.eden-message[aria-label="Eden"]'),draft=p.locator('#eden-command');
 let started=0;
 async function ask(name,input){
   if(started)await new Promise(done=>setTimeout(done,Math.max(0,22000-(Date.now()-started))));
   started=Date.now();
   const index=requests.length,prior=await answers.count()?await answers.last().elementHandle():null;
   await draft.fill(input);await draft.press('Enter');
   if(await p.locator('.eden-consent').isVisible()){
     for(const box of await p.locator('.eden-consent input:visible').all())await box.check();
     await p.locator('[data-continue]').click();
   }
   await p.waitForFunction(last=>{
     const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');
     return rows.length&&rows[rows.length-1]!==last||Boolean(document.querySelector('[data-retry]:not([hidden])'));
   },prior,{timeout:60000});await prior?.dispose();
   const step={name,route:new URL(p.url()).pathname,requests:requests.slice(index),trace:JSON.parse(await p.locator('#eden-assistant').getAttribute('data-turn-diagnostic')??'null')};
   report.steps.push(step);
   assert(step.trace,'No turn diagnostic');
   assert.deepEqual(Object.keys(step.trace).sort(),['correlationId','model','outcome','output','proposedAction','provider'].sort());
   assert.equal(step.trace.outcome,'confirmed',JSON.stringify({name,status:step.requests.map(r=>[r.endpoint,r.status]),trace:step.trace}));
   assert.equal(step.trace.provider,'gemini');
   assert.match(step.trace.model,/^gemini-[a-z0-9.-]+$/);
   assert(step.requests.filter(r=>r.endpoint!=='session').every(r=>r.status===200&&r.correlation===step.trace.correlationId));
   step.reply=await answers.last().innerText();
   await writeFile(join(out,'dialogue.json'),JSON.stringify(report,null,2)+'\n');
   console.log(JSON.stringify({name,provider:step.trace.provider,action:step.trace.proposedAction,outcome:step.trace.outcome}));
   return step;
 }
 for(const [name,input,topic] of [
   ['identity','Who are you?','identity'],['introduction','Give me an intro of who you are.','identity'],
   ['correction','I meant introduce yourself, not the donation page.','identity'],['capabilities','What can you actually help me do?','capabilities'],
 ]){
   const step=await ask(name,input);assert.equal(step.route,'/');assert.equal(step.trace.proposedAction,topic);
   assert.equal(step.trace.output,'model-approved-facts');assert.match(step.reply,topic==='identity'?/Eden.*Our Ground.*assistant/:/public directory|explore a listing|show results/i);
   assert(step.requests.some(r=>r.endpoint==='understand')&&!step.requests.some(r=>r.endpoint==='plan'));
 }
 const search=await ask('healthcare search','Find healthcare in Harrisburg.');assert.equal(search.route,'/support');
 assert.equal(await p.locator('#locationInput').inputValue(),'Harrisburg, PA');
 const first=p.locator('[data-card-key^="directory:"]').first(),title=(await first.locator('.discovery-select > span:not([class])').innerText()).trim();
 const detail=await ask('first visible result','Show me the first result.');assert.equal(detail.trace.proposedAction,'details');assert(detail.reply.includes(title));
 assert(await p.locator('[data-resource-content]:visible').count()>0);
 const back=await ask('return to map','Go back and show the map.');assert.equal(back.trace.proposedAction,'back-to-map');
 assert.equal(await p.locator('[data-resource-content]:visible').count(),0);
 assert.equal(await p.locator('#showSupportMap').getAttribute('aria-expanded'),'true');
 const record=process.env.RECOVERY_DIALOGUE_RECORD==='1';
 if(process.env.RECOVERY_DIALOGUE_COMPOUND==='1'||record){
   // Start at the actual home document. Consent survives this reload while chat
   // memory, selection and diagnostic are cleared. Only this one compound turn
   // runs in the recording; the test never advances a cursor or applies a tool.
   await new Promise(done=>setTimeout(done,30000));
   await p.emulateMedia({reducedMotion:'no-preference'});
   await p.goto(base+'/?edenDiagnostics=1');
   await p.locator('.eden-launch').click();assert.equal(new URL(p.url()).pathname,'/');
   await p.evaluate(()=>{
     window.__edenCursorProof=[];
     document.addEventListener('eden:visible-action',event=>{
       const {phase,operationId,correlationId,target,rect}=event.detail;
       const cursor=document.querySelector('.showcase-pointer-cursor');
       const x=cursor?parseFloat(cursor.style.getPropertyValue('--cursor-x')):NaN;
       const y=cursor?parseFloat(cursor.style.getPropertyValue('--cursor-y')):NaN;
       const cursorPoint=Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
       const first=document.querySelector('[data-card-key^="directory:"]');
       const descriptor=typeof target==='object'&&target.resultKey
         ?{operation:target.operation,isFirstVisibleListing:first?.getAttribute('data-card-key')===target.resultKey}:target;
       window.__edenCursorProof.push({phase,operationId,correlationId,target:descriptor,rect:rect??null,cursor:cursorPoint,
         route:location.pathname,atMs:Math.round(performance.now())});
     });
   });
   const capture=record?await recordBrowser(p,{width:1280,height:800}):null;
   let both,events,recording;
   try{
     both=await ask('search then open verified row','Find healthcare in Harrisburg and show me the first result.');
   }finally{
     events=await p.evaluate(()=>window.__edenCursorProof);
     if(capture)recording=await capture.save(join(out,'staging-cursor-search.webm'));
     await writeFile(join(out,'staging-cursor-search.json'),JSON.stringify({base,sha,recording,events},null,2)+'\n');
   }
   assert.equal(both.trace.proposedAction,'details');assert.equal(both.route,'/support');
   const opened=p.locator('[data-card-key^="directory:"]').first();
   const actualTitle=(await opened.locator('.discovery-select > span:not([class])').innerText()).trim();
   assert(both.reply.includes(actualTitle));assert(await opened.locator('[data-resource-content]:visible').count()>0);
   assert.deepEqual(both.requests.filter(r=>r.endpoint!=='session').map(r=>r.endpoint),['understand','plan','result','plan','result']);
   assert(events.length>0&&events.every(e=>e.correlationId===both.trace.correlationId),'Each visible operation must share the verified turn ID');
   const execute=events.filter(e=>e.phase==='execute');
   const expected=[{page:'support'},'location',{category:'healthcare'},'radius','submit',{operation:'details',isFirstVisibleListing:true}];
   assert.deepEqual(execute.map(e=>e.target),expected);
   for(const e of execute){
     assert.deepEqual(events.filter(v=>v.operationId===e.operationId).map(v=>v.phase),['target','execute','applied']);
     const {cursor:c,rect:b}=e;
     assert(c&&b&&b.width>0&&b.height>0&&c.x>=b.x-1&&c.x<=b.x+b.width+1&&c.y>=b.y-1&&c.y<=b.y+b.height+1,
       'Pointer must be inside the registered element at execution');
   }
   both.cursor={operations:execute.length,allPointsInside:true,openedFirstPublicListing:true,...(recording?{recording}:{})};
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){process.exitCode=1;report.failure=String(e?.message??e).slice(0,480);}
finally{await writeFile(join(out,'dialogue.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(report.failure??'PASS: protected conversational acceptance');}
