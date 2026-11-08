/** Real widget, isolated local HTTP/provider fixtures, simulated speech events.
 * Run with a local Vite server and a Chrome executable. No real speech is captured. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.EDEN_BROWSER_BASE??'http://127.0.0.1:4284';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Run speech fixtures only against loopback.');
const nativeOutput=process.env.EDEN_NATIVE_OUTPUT==='1';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:!nativeOutput,args:['--mute-audio']});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];let eligibility=false,providerCalls=0,sessions=0,delayConsent;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/eligibility',async r=>{
  if(r.request().method()==='POST'){assert.match(r.request().postData(),/age=19plus/);if(delayConsent)await delayConsent;eligibility=true;}
  return r.fulfill({json:{eligible:eligibility,denied:false}});
});
await page.route('**/api/v1/eden/hosted/**',r=>{
  const path=new URL(r.request().url()).pathname.split('/').at(-1);
  if(path==='session'){sessions++;return r.fulfill({status:403,json:{error:{code:'EDEN_DISABLED'}}});}
  providerCalls++;return r.fulfill({status:500,json:{error:{code:'UNEXPECTED_FIXTURE_REQUEST'}}});
});
async function waitText(selector,pattern){await page.waitForFunction(({selector,pattern})=>new RegExp(pattern,'i').test(document.querySelector(selector)?.textContent??''),{selector,pattern});}
try{
  await page.goto(base+'/about?eden=1');
  await page.locator('#eden-command').waitFor();
  assert.equal(await page.locator('.eden-consent').isVisible(),false);
  assert.equal(await page.locator('#eden-command').evaluate(e=>document.activeElement===e),false);
  const client=await context.newCDPSession(page);
  const {targetInfo:{browserContextId}}=await client.send('Target.getTargetInfo');
  await client.send('Browser.setPermission',{browserContextId,origin:base,permission:{name:'microphone'},setting:'denied'});
  // A delayed age decision must never start dictation or send after Not now.
  let release;delayConsent=new Promise(done=>release=done);
  await page.locator('#eden-command').fill('scroll down');await page.locator('#eden-command').press('Enter');
  await page.locator('[data-adult]').check();await page.locator('[data-hosted-consent]').check();
  const sending=page.waitForRequest(r=>new URL(r.url()).pathname==='/eligibility'&&r.method()==='POST');
  await page.locator('[data-continue]').click();await sending;
  await page.locator('[data-consent-cancel]').click();const settled=page.waitForResponse(r=>new URL(r.url()).pathname==='/eligibility');
  release();await settled;delayConsent=undefined;
  assert.equal(sessions,0);assert.equal(await page.locator('.eden-log').evaluate(e=>e.childElementCount),0);
  await page.locator('#eden-command').fill('');
  await page.locator('[data-call]').click();assert(!await page.locator('[data-adult]').isChecked());
  await page.locator('[data-adult]').check();assert(await page.locator('[data-continue]').isDisabled());
  await page.locator('[data-hosted-consent]').check();await page.locator('[data-continue]').click();
  await waitText('.eden-state','denied');
  assert.equal(providerCalls+sessions,0);
  await client.send('Browser.setPermission',{browserContextId,origin:base,permission:{name:'microphone'},setting:'granted'});
  const native=await page.evaluate(async()=>{
    const ctor=window.SpeechRecognition??window.webkitSpeechRecognition;
    const permission=await navigator.permissions.query({name:'microphone'});
    const local=!!ctor?.available&&'processLocally' in new ctor();
    const pack=local?await ctor.available({langs:['en-US'],processLocally:true}).catch(()=> 'unavailable'):'unavailable';
    return {permission:permission.state,onDeviceSupport:local,pack,voices:speechSynthesis.getVoices().length};
  });
  console.log('Real Chromium capability',JSON.stringify(native));
  if(nativeOutput){
    await page.locator('[data-settings]').click();
    await page.waitForFunction(()=>document.querySelector('#eden-read-voice').options.length>1);
    await page.locator('#eden-read-voice').selectOption({index:1});
    await page.locator('[data-preview]').click();await waitText('.eden-state','Reading with your device');
    await page.locator('[data-preview]').click();assert.equal(await page.locator('.eden-state').isVisible(),false);
    await page.locator('[data-preview]').click();await waitText('.eden-state','Reading with your device');
    await page.waitForFunction(()=>document.querySelector('.eden-state').hidden);
    console.log('PASS: actual selected OS speech synthesis started, stopped, restarted and completed.');
    await page.keyboard.press('Escape');
  }
  // Isolate speech events from physical hardware. The rest of the widget, its
  // public action handlers, draft editing and focus behavior run unchanged.
  await page.evaluate(()=>{
    window.testSpeech={starts:0,aborts:0};
    window.SpeechRecognition=class{processLocally=false;static async available(){return 'available';}
      start(){if(!this.processLocally)throw Error('Nonlocal recognition');window.testSpeech.starts++;window.testSpeech.last=this;}
      abort(){window.testSpeech.aborts++;}};
    const synth=window.speechSynthesis;window.voiceList=[];
    synth.getVoices=()=>window.voiceList;
    synth.speak=u=>{window.spoken=u;u.onstart?.();};
    synth.cancel=()=>{window.canceled=(window.canceled??0)+1;};
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{constructor(text){this.text=text;}},configurable:true});
  });
  const mic=page.locator('[data-call]'),draft=page.locator('#eden-command');
  await mic.click();await page.waitForFunction(()=>window.testSpeech.starts===1);
  await page.evaluate(()=>window.testSpeech.last.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'scroll'}}]}));
  assert.equal(await draft.inputValue(),'');assert.equal(sessions,0);
  await page.evaluate(()=>window.testSpeech.last.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'scroll up'}}]}));
  await page.waitForFunction(()=>document.querySelector('#eden-command').value==='scroll up');assert.equal(sessions,0);
  await draft.fill('scroll down');await draft.press('Enter');await page.waitForFunction(()=>document.querySelector('.eden-log')?.childElementCount===2);assert.equal(sessions,1);
  assert(await page.locator('.eden-launch').isVisible());await page.locator('.eden-launch').click();
  await mic.click();await page.waitForFunction(()=>window.testSpeech.starts===2);
  await mic.click();assert.equal(await mic.getAttribute('aria-pressed'),'false');
  await mic.click();await page.waitForFunction(()=>window.testSpeech.starts===3);
  await page.evaluate(()=>window.testSpeech.last.onerror({error:'no-speech'}));
  await waitText('.eden-state','No speech');assert.equal(providerCalls,0);
  await page.locator('[data-settings]').click();await page.locator('.eden-settings').waitFor();
  await page.evaluate(()=>{
    window.voiceList=[{name:'Device Voice',localService:true,lang:'en-US',voiceURI:'device'}];
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  // The installed voice appeared after the picker opened.
  await page.locator('#eden-read-voice').selectOption('device');
  await page.locator('[data-preview]').click();await waitText('.eden-state','Reading');
  await page.locator('[data-preview]').click();assert.equal(await page.evaluate(()=>window.canceled),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.eden-settings').isVisible(),false);
  await page.locator('[data-speak]').click();await waitText('.eden-state','Reading');
  assert.match(await page.evaluate(()=>window.spoken.voice.voiceURI),/^device$/);
  await page.locator('[data-stop]').click();assert.equal(await page.evaluate(()=>window.canceled),2);
  await page.locator('[data-expand]').click();assert.equal(await page.locator('#eden-panel').getAttribute('aria-modal'),'true');
  await page.keyboard.press('Escape');assert(await page.locator('.eden-launch').isVisible());assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
  await page.locator('.eden-launch').click();assert.equal(await page.locator('.eden-log').evaluate(e=>e.childElementCount),2);
  await page.locator('[data-reset]').click();assert.equal(await page.locator('.eden-log').evaluate(e=>e.childElementCount),0);
  const checked=page.waitForResponse(r=>new URL(r.url()).pathname==='/eligibility');await page.reload();await page.locator('#eden-command').waitFor();await checked;
  // Same tab, still-valid age cookie fixture and acknowledged notice version.

  await page.locator('#eden-command').fill('scroll down');await page.locator('#eden-command').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.eden-log')?.childElementCount===2);
  assert.equal(await page.locator('.eden-consent').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: native permission denial, fixture dictation/interim/final/edit/cancel/restart, read/stop/selected voice, consent reuse and keyboard expand/minimize/restore');
}finally{await browser.close();}
