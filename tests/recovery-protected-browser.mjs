// No intercepted API responses: verify an immutable preview and its real directory.
// The optional Vercel OIDC credential is attached only on requests to that deployment.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=new URL(process.env.RECOVERY_BASE).origin;
if(!/^https:\/\/ourground-staging-[a-z0-9]+-penuels-projects-aa802b06\.vercel\.app$/.test(origin))throw Error('Use the protected staging deployment');
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-recovery-images';
const token=process.env.VERCEL_OIDC_TOKEN;
assert(token,'Provide a short-lived staging credential in the environment');
const report={origin,checks:{},provider:'unverified',issues:[]};
const browser=await chromium.launch({channel:'chrome'});
try{
 await mkdir(out,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await context.route(origin+'/**',route=>route.continue({headers:{...route.request().headers(),'x-vercel-trusted-oidc-idp-token':token}}));
 const page=await context.newPage();page.setDefaultTimeout(25000);
 page.on('pageerror',e=>report.issues.push(e.name+': '+e.message.slice(0,120)));
 const anon=await fetch(origin,{redirect:'manual'});assert([401,403,302,307].includes(anon.status));report.checks.protection=anon.status;
 await page.goto(origin+'/support');await page.locator('#locationInput').waitFor();assert.equal(await page.locator('input[data-adult]:visible').count(),0);
 const receipt=await page.evaluate(async()=>{let r=await fetch('/ourground-build-evidence.json',{cache:'no-store'});return r.ok?(await r.json()).source_commit:null;});
 assert.equal(receipt,process.env.RECOVERY_SHA);report.checks.commit=receipt;
 const sessionAPI=(p,options={})=>page.evaluate(async({p,options})=>{const r=await fetch(p,options);return {status:r.status,body:await r.json().catch(()=>null)};},{p,options});
 assert.equal((await sessionAPI('/api/v1/eden/hosted/status')).status,403);
 const q=page.locator('#locationInput');await page.locator('[data-category="healthcare"]').click();await q.fill('Harrisburg, PA');await q.press('Enter');
 await page.locator('[data-card-key^="directory:"]').first().waitFor();
 report.checks.enterSearch=await page.locator('#resultsCount').innerText();
 await page.locator('#locationSelectedQuality summary').click();assert(await page.locator('#locationSelectedQuality').getAttribute('open')!==null);await page.locator('#locationSelectedQuality summary').click();
 const record=page.locator('[data-card-key^="directory:"]').first();
 await record.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/directory-results-desktop.jpg',quality:83,type:'jpeg'});
 const open=record.locator('a[href*="resource="],button[data-open-resource],button[data-resource-id],a[href*="/resources/"]').first();
 if(await open.count()){await open.click();await page.waitForFunction(()=>new URLSearchParams(location.search).has('resource')||location.pathname.startsWith('/resources/'));await page.goBack();await q.waitFor();report.checks.listingHistory=true;}
 await page.locator('.eden-launch').click();
 const draft=page.locator('#eden-command'),answers=page.locator('.eden-message[aria-label="Eden"]');
 async function send(text){
  const count=await answers.count();await draft.fill(text);await draft.press('Enter');
  if(await page.locator('.eden-consent').isVisible()){
   const boxes=page.locator('.eden-consent input:visible');
   for(const c of await boxes.all()){assert(!await c.isChecked());await c.check();}
   await page.screenshot({path:out+'/eden-consent-desktop.jpg',type:'jpeg',quality:82});await page.locator('[data-continue]').click();
  }
  await answers.nth(count).waitFor();return await answers.nth(count).innerText();
 }
 report.checks.donorReply=await send('Take me to Give Support');assert.equal(new URL(page.url()).pathname,'/give');
 report.checks.orgReply=await send('Take me to For Organizations');assert.equal(new URL(page.url()).pathname,'/organizations');
 report.checks.food=await send('Find food near Harrisburg, Pennsylvania');assert.equal(new URL(page.url()).pathname,'/support');assert.equal(await page.locator('[data-category="food"]').getAttribute('aria-pressed'),'true');
 report.checks.healthcare=await send('Switch to healthcare');assert.equal(await page.locator('[data-category="healthcare"]').getAttribute('aria-pressed'),'true');
 report.checks.radius=await send('Search within 25 miles');assert.equal(await page.locator('#radiusInput').inputValue(),'25');
 report.checks.results=await send('Eden, scroll down to the results');assert.equal(await page.evaluate(()=>document.activeElement?.id),'listTitle');
 report.checks.map=await send('Show me where the map is');assert.equal(await page.locator('#showSupportMap').getAttribute('aria-expanded'),'true');
 report.checks.list=await send('Show the list instead of the map');assert.equal(await page.locator('#showSupportMap').getAttribute('aria-expanded'),'false');
 const ai=await sessionAPI('/api/v1/eden/hosted/status');report.provider=ai.status===200?'enabled':ai.body?.error?.code??String(ai.status);report.checks.aiHTTP=ai.status;
 await page.locator('[data-reset]').click();assert.equal(await answers.count(),0);
 await page.locator('[data-minimize]').click();await page.locator('.eden-launch').click();assert(!(await page.locator('.eden-consent').isVisible()));
 assert.deepEqual(report.issues,[]);
}finally{await writeFile(out+'/staging-smoke.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));}
