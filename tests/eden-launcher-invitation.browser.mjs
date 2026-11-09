// Explicit local UI fixtures. No Google connection, personal microphone or account.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const out=process.env.RECOVERY_IMAGES??'/private/tmp/ourground-launcher-invitation';
const base=new URL(process.env.RECOVERY_BASE??'http://127.0.0.1:4298').origin;
const hosted=base.startsWith('https://'),sha=process.env.RECOVERY_SHA;
if(hosted)assert.match(sha??'',/^[a-f0-9]{40}$/);
else assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local fixtures require loopback');
await mkdir(out,{recursive:true});
const server=process.env.RECOVERY_BASE?null:await createServer({server:{host:'127.0.0.1',port:4298,strictPort:true,hmr:false,watch:null},logLevel:'error'});
await server?.listen();
const browser=await chromium.launch({channel:'chrome'}),report={status:'FAIL',scope:hosted?'protected compiled launcher UI with provider requests forbidden':'local launcher UI with provider requests forbidden',base,...(hosted?{sha}:{}),views:[]};
try{
 for(const [name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',320,740,'no-preference'],['reduced',720,450,'reduce']]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:motion,...(name==='desktop'?{recordVideo:{dir:out,size:{width:1440,height:900}}}:{})});
  if(hosted)await protectRecoveryOrigin(context,base,process.env.VERCEL_OIDC_TOKEN);
  const page=await context.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.name));
  await page.route('**/eligibility',r=>r.fulfill({json:{eligible:true,denied:false}}));
  await page.route('**/api/v1/**',r=>{if(r.request().url().includes('/eden/hosted/'))calls.push(new URL(r.request().url()).pathname);return r.fulfill({json:{}});});
  await page.addInitScript(()=>{
   window.qaAutoAudio=0;window.qaEntrance=[];
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){if(this.matches('.eden-launch,.eden-introduction'))window.qaEntrance.push({target:this.className,duration:options.duration});return animate.call(this,frames,options);};
   navigator.mediaDevices.getUserMedia=async()=>{window.qaAutoAudio++;throw Error('No microphone in UI fixture');};
   const Audio=window.AudioContext;if(Audio)window.AudioContext=class extends Audio{constructor(...args){super(...args);window.qaAutoAudio++;}};
   sessionStorage.setItem('our-ground-eden-introduction-v3','dismissed-by-x');
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});const bubble=page.locator('.eden-introduction');await bubble.waitFor();
  let navigationModule='/src/eden/public-navigation.ts';
  if(hosted){
    const manifest=await page.evaluate(async()=>await(await fetch('/ourground-build-evidence.json',{cache:'no-store'})).json());
    assert.equal(manifest.source_commit,sha);
    const asset=Object.keys(manifest.assets).find(path=>/^assets\/public-navigation-[a-zA-Z0-9_-]+\.js$/.test(path));assert(asset,'Compiled public navigation module is required for SPA verification');
    navigationModule='/'+asset;
  }
  const navigate=destination=>page.evaluate(async({module,destination})=>{const {navigateEdenPublicPage}=await import(module);await navigateEdenPublicPage(destination,{signal:new AbortController().signal});},{module:navigationModule,destination});
  assert(await page.locator('#eden-panel').isHidden());assert.match(await bubble.innerText(),/Hi, I'm Eden! Need a hand finding support\?/);assert.match(await bubble.innerText(),/Click to chat/);
  assert(await page.evaluate(()=>document.activeElement===document.body),'entrance does not take focus');
  const entrance=await page.evaluate(()=>window.qaEntrance);assert.equal(entrance.length,motion==='reduce'?0:2);
  const geometry=await bubble.evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});
  assert(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=height);
  await page.waitForTimeout(400);await page.screenshot({path:join(out,'invitation-'+name+'.jpg'),quality:82});
  await page.locator('[data-intro-open]').click();assert(await bubble.isHidden());assert(await page.locator('.eden-welcome').isVisible());
  await page.locator('[data-minimize]').click();assert(await bubble.isVisible());
  await navigate('about');
  assert(await bubble.isHidden());
  await navigate('home');
  assert(await bubble.isVisible());assert.equal(await page.evaluate(()=>window.qaEntrance.length),entrance.length,'SPA navigation does not replay the entrance');
  await page.locator('[data-intro-dismiss]').click();assert(await bubble.isHidden());
  await page.locator('.eden-launch').click();await page.locator('[data-minimize]').click();assert(await bubble.isHidden(),'X lasts through reopening this page load');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('our-ground-eden-introduction-v3')),'dismissed-by-x','old storage flags are untouched');
  await page.reload({waitUntil:'domcontentloaded'});await bubble.waitFor();assert(await page.locator('#eden-panel').isHidden());
  await page.keyboard.press('Tab');await page.locator('[data-intro-dismiss]').focus();
  assert(await page.locator('[data-intro-dismiss]').evaluate(el=>el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none'));
  assert.equal(await page.evaluate(()=>window.qaAutoAudio),0);assert.deepEqual(calls,[]);assert.deepEqual(errors,[]);
  report.views.push({name,width,height,motion,entrance,geometry,refreshRestored:true,providerCalls:0,audioStarts:0});
  const video=page.video();await context.close();if(video)await rename(await video.path(),join(out,'invitation-desktop.webm'));
 }
 report.status='PASS';
}finally{await browser.close();await server?.close();await writeFile(join(out,'launcher-invitation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
