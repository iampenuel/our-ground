import {protectRecoveryOrigin} from './recovery-origin.mjs';
// Opt-in real hosted acceptance. Requires the protected preview and a scoped Vercel trusted token.
import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdir,writeFile} from 'node:fs/promises';
const base=new URL(process.env.RECOVERY_BASE).origin;
assert(/^https:\/\/ourground-staging-[a-z0-9]+-penuels-projects-aa802b06\.vercel\.app$/.test(base));
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-recovery-images/staging';await mkdir(out,{recursive:true});const receipt={base,requests:[],checks:{},errors:[]};
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});p.setDefaultTimeout(35000);
 await protectRecoveryOrigin(p,base,process.env.VERCEL_OIDC_TOKEN);
 p.on('pageerror',e=>receipt.errors.push(e.name));
 p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/v1/eden/hosted/'))receipt.requests.push({route:path.split('/').at(-1),status:r.status()});});
 await p.goto(base);await p.locator('.eden-launch').click();
 const answers=p.locator('.eden-message[aria-label="Eden"]'),draft=p.locator('#eden-command');let count=0,previous=0;
 async function ask(input){if(previous)await new Promise(done=>setTimeout(done,Math.max(0,17000-(Date.now()-previous))));previous=Date.now();await draft.fill(input);await draft.press('Enter');
 if(await p.locator('.eden-consent').isVisible()){for(const c of await p.locator('.eden-consent input:visible').all())await c.check();await p.locator('[data-continue]').click();}
 await p.waitForFunction(n=>document.querySelectorAll('.eden-message[aria-label="Eden"]').length>n||Boolean(document.querySelector('[data-retry]:not([hidden])')),count,{timeout:35000}).catch(()=>{});
 if(await answers.count()<=count)throw Error(await p.locator('.eden-state').innerText());count++;return await answers.last().innerText();}
 receipt.checks.greeting=await ask('hii');assert(receipt.requests.some(x=>x.route==='understand'&&x.status===200),'real Gemini did not run');
 receipt.checks.donor=await ask('Take me to Give Support');assert.equal(new URL(p.url()).pathname,'/give');assert(receipt.requests.some(x=>x.route==='plan'&&x.status===200)&&receipt.requests.some(x=>x.route==='result'&&x.status===200));
 receipt.checks.food=await ask('Find food near Harrisburg, Pennsylvania');assert.equal(new URL(p.url()).pathname,'/support');assert.equal(await p.locator('[data-category="food"]').getAttribute('aria-pressed'),'true');
 receipt.checks.healthcare=await ask('Switch to healthcare');assert.equal(await p.locator('[data-category="healthcare"]').getAttribute('aria-pressed'),'true');assert(await p.locator('[data-card-key^="directory:"]').count()>0);
 await p.screenshot({path:out+'/gemini-on-staging-desktop.jpg',type:'jpeg',quality:82});
 if(process.env.RECOVERY_SPEECH==='1'){
   const state=p.locator('.eden-state');
   const speech=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/eden/hosted/speech',{timeout:18000});
   await p.locator('[data-speak]').click();
   const r=await speech;receipt.checks.speech={status:r.status(),mime:r.headers()['content-type']};
   assert.equal(r.status(),200);assert.equal(receipt.checks.speech.mime,'audio/wav');
   await state.filter({hasText:'Reading with Aoede'}).waitFor();
   receipt.checks.speech.playbackStarted=true;
   await p.locator('[data-stop]:visible').click();receipt.checks.speech.stop=!(await p.locator('[data-stop]').isVisible());
   assert(receipt.checks.speech.stop);
 }
 assert.deepEqual(receipt.errors,[]);
}catch(e){receipt.failure=String(e.message).slice(0,160);process.exitCode=1;}
finally{await browser.close();await writeFile(out+'/gemini.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
