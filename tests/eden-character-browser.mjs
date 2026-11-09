// Record actual rendered browser frames, not an animation driven by test state.
// RECOVERY_BASE may be loopback or the one protected immutable candidate.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {beginVoiceObservation,verifyAndSaveHostedSpeech} from './eden-phase2-audio.mjs';
import {recordBrowser} from './browser-screencast.mjs';
import {protectRecoveryOrigin} from './recovery-origin.mjs';

const base=new URL(process.env.RECOVERY_BASE??'http://127.0.0.1:4291').origin;
const local=['127.0.0.1','localhost'].includes(new URL(base).hostname);
if(!local&&!/^https:\/\/ourground-staging-[a-z0-9]+-penuels-projects-aa802b06\.vercel\.app$/.test(base))throw Error('Use loopback or the protected staging project.');
const output=process.env.EDEN_CHARACTER_VIDEO;
const launch={channel:'chrome',headless:process.env.EDEN_HEADLESS!=='false',args:['--mute-audio','--use-fake-device-for-media-stream']};
const viewport={width:960,height:640};
const components=process.env.EDEN_MAC_RECOGNIZER_COMPONENTS;
const scratch=components?await mkdtemp(join(tmpdir(),'og-portrait-')):undefined;
let persistent;
if(scratch){
  // Clone only the already-installed engine and language pack on APFS. No
  // browsing history, accounts, settings, or real microphone enter this test.
  for(const item of ['SODA','SODALanguagePacks/en-US']){
    const dest=join(scratch,item);await mkdir(dirname(dest),{recursive:true});
    execFileSync('/bin/cp',['-cR',join(components,item),dest]);
  }
  persistent=await chromium.launchPersistentContext(scratch,{...launch,viewport,reducedMotion:'no-preference'});
}
const browser=persistent?persistent.browser():await chromium.launch(launch);
const report={origin:base,assets:[],render:{},events:[],playback:'not exercised'};



try{
  const context=persistent??await browser.newContext({viewport,reducedMotion:'no-preference'});
  if(components)await context.grantPermissions(['microphone'],{origin:base});
  if(!local){assert(process.env.VERCEL_OIDC_TOKEN,'Use the staging project’s transient credential');await protectRecoveryOrigin(context,base,process.env.VERCEL_OIDC_TOKEN);}
  const page=await context.newPage();page.setDefaultTimeout(18000);
  const audioObserver=!local?await beginVoiceObservation(page):undefined;
  const errors=[];page.on('pageerror',err=>errors.push(err.name));
  page.on('response',res=>{const p=new URL(res.url()).pathname;if(p.startsWith('/api/v1/eden/hosted/')||p==='/eligibility')console.log('HTTP',p,res.status());});
  await page.goto(base+'/about');await page.bringToFront();await page.locator('.eden-launch').waitFor();await page.waitForLoadState('networkidle');
  const receipt=await page.evaluate(async()=>{
    const r=await fetch('/ourground-build-evidence.json',{cache:'no-store'});if(!r.headers.get('content-type')?.includes('json'))return null;return (await r.json()).source_commit;
  });report.commit=receipt;
  if(!local){assert(process.env.RECOVERY_SHA);assert.equal(receipt,process.env.RECOVERY_SHA);}
  for(const path of ['/assets/eden/approved-profile/eden-launcher.riv','/assets/eden/rig/eden.riv']){
    const expected=createHash('sha256').update(await readFile('public'+path)).digest('hex');
    const actual=await page.evaluate(async path=>{const r=await fetch(path,{credentials:'same-origin'}),bytes=await r.arrayBuffer();
      return {path,status:r.status,magic:new TextDecoder().decode(bytes.slice(0,4)),bytes:bytes.byteLength,
        sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')};},path);
    assert.equal(actual.status,200);assert.equal(actual.magic,'RIVE');assert.equal(actual.sha256,expected);report.assets.push(actual);
  }
  const capture=output?await recordBrowser(page):undefined;
  await page.waitForFunction(()=>Number(document.querySelector('.eden-launch-portrait svg')?.dataset.profileFrames)>3);
  const watch=await page.evaluateHandle(()=>{
    const host=document.querySelector('#eden-assistant'),surface=host.querySelector('.eden-launch-portrait'),svg=surface.querySelector('svg');
    const values={states:[host.dataset.edenState],blink:false,mouth:false},observer=new MutationObserver(records=>{
      if(records.some(r=>r.target===host&&r.attributeName==='data-eden-state')&&values.states.at(-1)!==host.dataset.edenState)values.states.push(host.dataset.edenState);
      if(svg.dataset.profileBlink==='active')values.blink=true;
      if(svg.dataset.profileMouth==='speaking')values.mouth=true;
    });
    observer.observe(host,{subtree:true,attributes:true,attributeFilter:['data-eden-state','data-profile-blink','data-profile-mouth']});
    return {values,svg,observer};
  });
  await page.waitForFunction(w=>w.values.blink,watch,{timeout:10_000});
  await page.locator('.eden-launch').click();
  assert(await watch.evaluate(w=>w.svg===document.querySelector('.eden-portrait svg')));
  report.render={active:'svg-profile',sameInstanceAfterOpen:true,blink:true};
  if(!local){
    // One user-initiated identity request and one ticketed Read reply are used.
    // No fixture HTTP responses, media/DOM events, or renderer commands.
    const draft=page.locator('#eden-command');await draft.fill('Who are you?');await draft.press('Enter');
    if(await page.locator('.eden-consent').isVisible()){for(const box of await page.locator('.eden-consent input:visible').all())await box.check();await page.locator('[data-continue]').click();}
    await page.locator('.eden-message[aria-label=Eden]').first().waitFor({timeout:35_000}).catch(async err=>{console.log('Status:',await page.locator('.eden-state').textContent());throw err;});
    const displayedReply=await page.locator('.eden-message[aria-label=Eden]').first().innerText();
    await verifyAndSaveHostedSpeech({page,origin:base,commit:report.commit,out:process.env.RECOVERY_IMAGES??(output?dirname(output):'docs/release/eden-live-action-evidence'),displayedReply,observer:audioObserver,
      onFirstPlayback:async()=>{await page.waitForFunction(w=>w.values.mouth,watch,{timeout:30000});}});
    assert.notEqual(await page.locator('#eden-assistant').getAttribute('data-eden-state'),'speaking');
    report.playback='real Aoede response, verified displayed text hash, playhead and PCM-driven mouth; stop, cached replay, minimize, completion';
  }else{
    const draft=page.locator('#eden-command');await draft.fill('Scroll down');await draft.press('Enter');
    if(await page.locator('.eden-consent').isVisible()){for(const box of await page.locator('.eden-consent input:visible').all())await box.check();await page.locator('[data-continue]').click();}
    await page.locator('.eden-message[aria-label=Eden]').first().waitFor({timeout:35_000}).catch(async err=>{console.log('Status:',await page.locator('.eden-state').textContent());throw err;});
  }
  await page.waitForTimeout(1900);
  if(components){
    const pack=await page.evaluate(()=>SpeechRecognition.available({langs:['en-US'],processLocally:true}));
    assert(['available','downloadable','downloading'].includes(pack));
    await page.locator('[data-call]').click();
    await page.waitForFunction(()=>document.querySelector('#eden-assistant').dataset.edenState==='listening',null,{timeout:38_000});
    await page.waitForTimeout(400);await page.locator('[data-call]').click();
    assert.equal(await page.locator('#eden-assistant').getAttribute('data-eden-state'),'idle');
    assert.equal(await page.evaluate(()=>SpeechRecognition.available({langs:['en-US'],processLocally:true})),'available');
    report.listening='native on-device recognition started, canceled, returned to idle; synthetic microphone';
  }
  report.events=await watch.evaluate(w=>w.values.states);assert(report.events.includes('thinking'));assert(report.events.includes('success'));
  if(!local){assert(report.events.includes('speaking'));}
  await page.locator('[data-minimize]').click();assert(await watch.evaluate(w=>w.svg===document.querySelector('.eden-launch svg')));
  await page.emulateMedia({reducedMotion:'reduce'});
  // The preference change event is asynchronous in headful Chrome. Measure
  // the resting image after the application has applied the new preference.
  await page.waitForFunction(()=>document.querySelector('#eden-assistant').dataset.edenPortrait==='static-reduced'&&!document.querySelector('.eden-launch-portrait img').hidden);
  const still=await watch.evaluate(w=>({frames:w.svg.dataset.profileFrames,img:document.querySelector('.eden-launch-portrait img').hidden}));
  await page.waitForTimeout(350);assert.equal(await watch.evaluate(w=>w.svg.dataset.profileFrames),still.frames);assert.equal(still.img,false);
  report.render.reducedMotion='approved PNG visible; frame counter stopped';
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(({svg,n})=>Number(svg.dataset.profileFrames)>n,{svg:await watch.getProperty('svg'),n:Number(still.frames)});
  report.render.motionRestored=true;
  if(capture)report.recording=await capture.save(output);
  assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
  if(output)await writeFile(output+'.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();if(scratch)await rm(scratch,{recursive:true,force:true});}
