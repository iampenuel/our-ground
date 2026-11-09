// Explicit opt-in genuine Gemini text checks. Public scripted inputs only.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const origin=new URL(process.env.RECOVERY_BASE).origin,sha=process.env.RECOVERY_SHA,out=process.env.RECOVERY_IMAGES;
assert(out&&/^[a-f0-9]{40}$/.test(sha));await mkdir(out,{recursive:true});
const report={origin,sha,scope:'genuine hosted Gemini text and directory actions; no speech synthesis',steps:[],status:'FAIL'};
const browser=await chromium.launch({channel:'chrome'});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});
 await protectRecoveryOrigin(ctx,origin,process.env.VERCEL_OIDC_TOKEN);const p=await ctx.newPage();p.setDefaultTimeout(60000);
 let searches=0;const requests=[];
 p.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/resources/search')searches++;});
 p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.includes('/eden/hosted/'))requests.push({endpoint:u.pathname.split('/').at(-1),status:r.status()});});
 await p.goto(origin+'/?edenDiagnostics=1');assert.equal(await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),sha);
 await p.locator('.eden-launch').click();await p.locator('#eden-command').waitFor();
 await p.screenshot({path:join(out,'welcome.jpg'),quality:83});
 let started=0;
 for(const [name,text,expectedCity,delta]of [
   ['harrisburg','Find healthcare in Harrisburg, PA, within 10 miles.','Harrisburg',1],
   ['lanham','Actually, I meant Lanham, Maryland.','Lanham',1],
   ['details','Show me the first result.','Lanham',0],
   ['berkeley','Actually, I meant Berkeley, California.','Berkeley',1],
 ]){
   if(process.env.STABILIZATION_CASE&&name!==process.env.STABILIZATION_CASE)continue;
   const requestText=process.env.STABILIZATION_CASE==='berkeley'?'Find healthcare in Berkeley, California, within 10 miles.':text;
   if(started)await new Promise(r=>setTimeout(r,Math.max(0,32000-(Date.now()-started))));started=Date.now();
   const before=searches,index=requests.length,answers=p.locator('.eden-message[aria-label="Eden"]'),prior=await answers.count()?await answers.last().elementHandle():null;
   await p.locator('#eden-command').fill(requestText);await p.locator('#eden-command').press('Enter');
   if(await p.locator('.eden-consent').isVisible()){
     for(const box of await p.locator('.eden-consent input:visible').all())await box.check();
     await p.locator('[data-continue]').click();
   }
   await p.waitForFunction(last=>{const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');return rows.length&&rows[rows.length-1]!==last||!!document.querySelector('[data-retry]:not([hidden])');},prior);
   await prior?.dispose();
   const trace=JSON.parse(await p.locator('#eden-assistant').getAttribute('data-turn-diagnostic')??'null');
   const step={name,trace,requests:requests.slice(index),searches:searches-before,location:await p.locator('#locationInput').inputValue(),reply:await answers.last().innerText().catch(()=>'')};report.steps.push(step);
   assert.equal(trace?.outcome,'confirmed',JSON.stringify({name,trace,requests:step.requests}));assert.equal(trace.provider,'gemini');
   assert.equal(step.searches,delta,'One logical search must submit once');assert(step.location.includes(expectedCity));
   if(name==='details')assert(await p.locator('[data-resource-content]:visible').count()>0);
   await p.screenshot({path:join(out,name+'.jpg'),quality:83});
   await writeFile(join(out,'hosted-text.json'),JSON.stringify(report,null,2)+'\n');
 }
 report.status='PASS';await ctx.close();
}catch(error){report.failure=String(error?.message??'Verification failed').split('\n')[0].slice(0,350);process.exitCode=1;}
finally{await browser.close();await writeFile(join(out,'hosted-text.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
