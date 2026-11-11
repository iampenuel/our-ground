// Exercise native form navigation: fabricating an Origin in an HTTP client
// would miss a referrer policy that breaks Chrome's POST or leaks a code.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {adultGate} from '../backend/adult-access.ts';
import {isPrivateDocumentPath, privateDocumentHeaders} from '../shared/security-headers.ts';
import {previewPhotos} from '../backend/age-page.ts';
const config={ADULT_SESSION_SECRET:randomBytes(32).toString('base64url'),VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_4li6QnqulPgPbJpxMW2L9hczDNrS',ACCOUNT_RELEASE_MODE:'signin_only'};
const photos=Object.values(previewPhotos),requests=[];
let origin;
const server=createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 requests.push({path:req.url,origin:req.headers.origin,referer:req.headers.referer,method:req.method});
 const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
 let response=await adultGate(request,config);
 if(!response)response=photos.includes(req.url)
   ? new Response(await readFile(new URL('../public'+req.url,import.meta.url)),{headers:{'Content-Type':'image/webp'}})
   : new Response('Eligible application route',{headers:isPrivateDocumentPath(new URL(request.url).pathname)?privateDocumentHeaders:{}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
const axe=process.env.AGE_AXE?await readFile(process.env.AGE_AXE,'utf8'):null;
const ageTitle='Age confirmation',denialTitle='Our Ground is for adults 19 and older';
async function checkEntrance(page,title,actions){
 await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();
 await page.locator('.preview img').evaluate(img=>img.decode());
 assert.equal(await page.locator('.entrance > .panel').count(),1);
 assert(await page.locator('.preview').evaluate(node=>node.inert&&node.getAttribute('aria-hidden')==='true'));
 assert.doesNotMatch(await page.locator('body').ariaSnapshot(),/Stronger|Find support near you|Possibilities/i);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const name of actions){
  await page.keyboard.press('Tab');
  const active=page.locator(':focus');
  assert.equal(await active.innerText(),name);
  assert(await active.evaluate(node=>{
   const rect=node.getBoundingClientRect();
   return rect.width>=44&&rect.height>=44&&getComputedStyle(node).outlineStyle!=='none';
  }));
 }
 if(axe){
  await page.evaluate(axe);
  const violations=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']})).violations.map(item=>item.id));
  assert.deepEqual(violations,[],title);
 }
}
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [width,height] of [[320,568],[375,667],[390,844],[768,1024],[1024,768],[1440,900],[390,300]]) {
  const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const p=await ctx.newPage();const outbound=[];p.on('request',r=>outbound.push(r.url()));
  await p.goto(origin+'/');await p.locator('.preview img').evaluate(i=>i.decode());
  const ax=await p.locator('body').ariaSnapshot();
  assert.match(ax,/heading "Age confirmation"/);assert.doesNotMatch(ax,/Stronger|Find support near you|Possibilities/i);
  assert(await p.locator('.preview').evaluate(n=>n.inert&&n.getAttribute('aria-hidden')==='true'));
  const photo=width<=800?previewPhotos.mobile:previewPhotos.desktop;
  assert.equal(await p.locator('img').evaluate(i=>new URL(i.currentSrc).pathname),photo);
  assert(outbound.every(url=>[origin+'/',origin+'/eligibility.css?v=4',origin+photo].includes(url)));
  const image=await ctx.request.get(origin+photo),bytes=await image.body();
  assert.equal(image.headers()['content-type'],'image/webp');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  await p.mouse.click(2,2);await p.keyboard.press('Escape');
  await checkEntrance(p,ageTitle,["I'm 19 or older","I'm under 19",'Terms','Privacy']);
  const confirmationWidth=(await p.locator('.panel').boundingBox()).width;
  for(const title of ['Terms','Privacy']){
   await p.getByRole('link',{name:title,exact:true}).click();
   await checkEntrance(p,title,['Return to Our Ground','Terms','Privacy']);
   assert((await p.locator('.panel--policy').boundingBox()).width>=confirmationWidth);
   await p.getByRole('link',{name:'Return to Our Ground'}).click();
   await p.getByRole('heading',{name:ageTitle,exact:true}).waitFor();
  }
  const refusal=p.waitForResponse(response=>response.request().method()==='POST');
  await p.getByRole('button',{name:"I'm under 19"}).click();
  assert.equal((await refusal).status(),403);
  await checkEntrance(p,denialTitle,['Terms','Privacy']);
  assert.equal((await p.locator('.panel').boundingBox()).width,confirmationWidth);
  await ctx.close();
 }
 for(const path of ['/','/support','/give','/organizations','/account','/resources/synthetic','/auth/callback?code=synthetic-browser-test']){
  const ctx=await browser.newContext({javaScriptEnabled:false});const p=await ctx.newPage();
  const external=[];p.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.resourceType())});
  const start=requests.length;await p.goto(origin+path);await p.getByRole('button',{name:"I'm 19 or older"}).click();
  await p.getByText('Eligible application route').waitFor();assert.equal(p.url(),origin+path);
  const traffic=requests.slice(start),post=traffic.find(r=>r.method==='POST');
  assert.equal(post.origin,origin);assert.equal(post.referer,origin+'/');
  assert(traffic.slice(0,traffic.indexOf(post)+1).every(r=>!r.referer||r.referer===origin+'/'));
  assert(traffic.every(r=>!r.referer||!r.referer.includes('?')));assert.deepEqual(external,[]);
  await p.reload();await p.getByText('Eligible application route').waitFor();await ctx.close();
 }
 const denied=await browser.newContext({javaScriptEnabled:false});const p=await denied.newPage();await p.goto(origin);
 const refusal=p.waitForResponse(response=>response.request().method()==='POST');
 await p.getByRole('button',{name:"I'm under 19"}).click();
 assert.equal((await refusal).status(),403);
 assert.equal((await p.reload()).status(),403);
 for(const path of ['/','/support','/give','/organizations','/account','/auth/callback','/resources/synthetic']){
  assert.equal((await p.goto(origin+path)).status(),403);
  await p.getByRole('heading',{name:denialTitle,exact:true}).waitFor();
 }
 for(const title of ['Terms','Privacy']){
  await p.getByRole('link',{name:title,exact:true}).click();
  await p.getByRole('heading',{name:title,exact:true}).waitFor();
  await p.getByRole('link',{name:'Return to Our Ground'}).click();
  await p.getByRole('heading',{name:denialTitle,exact:true}).waitFor();
  await p.goBack();
  await p.getByRole('heading',{name:title,exact:true}).waitFor();
  await p.getByRole('link',{name:'Return to Our Ground'}).click();
  await p.getByRole('heading',{name:denialTitle,exact:true}).waitFor();
  assert.equal(await p.locator('form').count(),0);
 }
 await denied.close();
 const policyVisit=await browser.newContext({javaScriptEnabled:false});
 const callback=await policyVisit.newPage(),start=requests.length;
 await callback.goto(origin+'/auth/callback?code=synthetic-policy-canary');
 await callback.getByRole('link',{name:'Privacy',exact:true}).click();
 await callback.getByRole('link',{name:'Terms',exact:true}).click();
 await callback.getByRole('link',{name:'Return to Our Ground'}).click();
 assert.equal(callback.url(),origin+'/');
 assert.equal(await callback.locator('input[name=return]').getAttribute('value'),'/');
 assert(requests.slice(start).every(request=>!request.referer?.includes('synthetic-policy-canary')));
 await policyVisit.close();
 console.log('PASS: four entrance states, seven viewport sizes, native no-JS flows, policy navigation, denial persistence, callback privacy, WebP and keyboard checks.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
