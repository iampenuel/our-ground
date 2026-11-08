// Protected real application + real Gemini public actions. ONLY the speech HTTP
// response is a labeled quota fixture; never use this as live provider evidence.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const origin=new URL(process.env.RECOVERY_BASE).origin,sha=process.env.RECOVERY_SHA;
assert(/^[a-f0-9]{40}$/.test(sha));
const out=process.env.RECOVERY_IMAGES;assert(out);await mkdir(out,{recursive:true});
const proof={origin,sha,scope:'Real protected app and Gemini; injected Google daily speech denial, no synthesis',status:'FAIL',turns:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});
 await protectRecoveryOrigin(ctx,origin,process.env.VERCEL_OIDC_TOKEN);
 const page=await ctx.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>proof.errors.push(e.name));
 let speechRequests=0;
 await page.route(url=>url.origin===origin&&url.pathname==='/api/v1/eden/hosted/speech',route=>{
   speechRequests++;
   return route.fulfill({status:429,headers:{'content-type':'application/json','retry-after':'8'},json:{error:{code:'SPEECH_QUOTA_EXHAUSTED',quota:{source:'google',category:'daily',retryAfterSeconds:8,
     violations:[{quotaMetric:'generativelanguage.googleapis.com/generate_requests_per_model_per_day',quotaId:'GenerateRequestsPerDayPerProjectPerModel',effectiveLimit:10}]}}}});
 });
 await page.addInitScript(()=>{
   window.edenVoiceFallbackCalls=0;window.edenQuotaCursor=[];
   const native=speechSynthesis.speak.bind(speechSynthesis);
   speechSynthesis.speak=(...args)=>{window.edenVoiceFallbackCalls++;return native(...args);};
   document.addEventListener('eden:visible-action',e=>{
     const {phase,operationId,correlationId,target,rect}=e.detail;
     if(phase!=='execute')return;
     const arrow=document.querySelector('.showcase-pointer-cursor-arrow'),matrix=arrow?.getScreenCTM();
     // Measure the tip of the painted ReactDrops SVG, including all transforms.
     const tip=matrix?new DOMPoint(4.2,3.3).matrixTransform(matrix):null;
     const first=document.querySelector('[data-card-key^="directory:"]');
     window.edenQuotaCursor.push({phase,operationId,correlationId,rect,tip:tip?{x:tip.x,y:tip.y}:null,
       target:target&&typeof target==='object'&&target.resultKey?{operation:target.operation,isFirstVisibleListing:target.resultKey===first?.getAttribute('data-card-key')}:target});
   });
 });
 await page.goto(origin+'/?edenDiagnostics=1');
 assert.equal(await page.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),sha);
 await page.locator('.eden-launch').click();
 const requests=[];
 page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/v1/eden/hosted/'))requests.push({endpoint:path.split('/').at(-1),status:r.status(),correlation:r.headers()['x-eden-correlation-id']??null});});
 const ask=async(name,text)=>{
   const before=requests.length,answers=page.locator('.eden-message[aria-label="Eden"]');
   const prior=await answers.count()?await answers.last().elementHandle():null;
   await page.locator('#eden-command').fill(text);await page.locator('#eden-command').press('Enter');
   if(await page.locator('.eden-consent').isVisible()){
     for(const checkbox of await page.locator('.eden-consent input:visible').all())await checkbox.check();
     await page.locator('[data-continue]').click();
   }
   await page.waitForFunction(last=>{const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');return rows.length&&rows[rows.length-1]!==last;},prior,{timeout:60000});
   await prior?.dispose();
   const trace=JSON.parse(await page.locator('#eden-assistant').getAttribute('data-turn-diagnostic'));
   const turn={name,trace,requests:requests.slice(before),reply:await answers.last().innerText()};proof.turns.push(turn);
   assert.equal(trace.provider,'gemini');assert.equal(trace.outcome,'confirmed');
   assert(turn.requests.filter(r=>r.endpoint!=='session').every(r=>r.status===200&&r.correlation===trace.correlationId));
   return turn;
 };
 const identity=await ask('identity before controlled speech denial','Who are you?');
 assert.deepEqual(identity.requests.filter(r=>r.endpoint!=='session').map(r=>r.endpoint),['understand']);
 assert.equal(await page.locator('[data-call]').innerText(),'Dictate');
 const readDenied=async()=>{
   await page.locator('[data-speak]').click();
   await page.waitForFunction(()=>document.querySelector('.eden-state')?.textContent.includes('Google has reached a daily voice limit')&&document.querySelector('[data-stop]')?.hidden);
 };
 await readDenied();
 proof.dailyMessage=await page.locator('.eden-state').innerText();
 assert.doesNotMatch(proof.dailyMessage,/busy|moment/i);
 await readDenied();assert.equal(speechRequests,1);
 assert.equal(await page.evaluate(()=>window.edenVoiceFallbackCalls),0);
 await page.screenshot({path:join(out,'quota-message.jpg'),quality:80,type:'jpeg'});
 // Preserve the existing spaced text admission policy. No speech is generated.
 await new Promise(resolve=>setTimeout(resolve,22000));
 assert.equal(speechRequests,1,'Retry-After did not initiate synthesis');
 const action=await ask('real search and first listing after speech denial','Find healthcare in Harrisburg and show me the first result.');
 assert.equal(action.trace.proposedAction,'details');assert.equal(new URL(page.url()).pathname,'/support');
 assert.deepEqual(action.requests.filter(r=>r.endpoint!=='session').map(r=>r.endpoint),['understand','plan','result','plan','result']);
 const first=page.locator('[data-card-key^="directory:"]').first();
 assert(await first.locator('[data-resource-content]:visible').count()>0,'First public listing opened');
 assert(action.reply.includes((await first.locator('.discovery-select > span:not([class])').innerText()).trim()));
 proof.cursor=await page.evaluate(()=>window.edenQuotaCursor);
 assert.deepEqual(proof.cursor.map(e=>e.target),[{page:'support'},'location',{category:'healthcare'},'radius','submit',{operation:'details',isFirstVisibleListing:true}]);
 assert(proof.cursor.every(e=>e.correlationId===action.trace.correlationId));
 for(const {rect:r,tip:t} of proof.cursor)assert(t&&r&&t.x>=r.x-2&&t.x<=r.x+r.width+2&&t.y>=r.y-2&&t.y<=r.y+r.height+2,'Painted cursor must land inside each registered target');
 proof.realListingOpened=true;proof.speechRequests=speechRequests;proof.deviceFallbackCalls=await page.evaluate(()=>window.edenVoiceFallbackCalls);
 assert.equal(proof.speechRequests,1);assert.equal(proof.deviceFallbackCalls,0);assert.deepEqual(proof.errors,[]);
 await readDenied();assert.equal(speechRequests,1,'daily cooldown spans a new displayed answer');
 assert.equal(await page.evaluate(()=>window.edenVoiceFallbackCalls),0,'A fresh answer must not silently use device speech');
 await page.screenshot({path:join(out,'actions-after-quota.jpg'),quality:80,type:'jpeg'});
 proof.status='PASS';
}catch(e){process.exitCode=1;proof.failure=String(e?.message??e).slice(0,400);}
finally{await browser.close();await writeFile(join(out,'quota-browser.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,failure:proof.failure,scope:proof.scope}));}
