// One public identity turn, one real TTS request and two cached replays.
// The character acceptance runner also uses this helper; run only one suite
// when validating both features together on staging.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
import {beginVoiceObservation,verifyAndSaveHostedSpeech} from './eden-phase2-audio.mjs';
const origin=new URL(process.env.RECOVERY_BASE).origin;
const expected=process.env.RECOVERY_SHA;
assert(/^[a-f0-9]{40}$/.test(expected),'Set the exact candidate commit');
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-live-action-evidence';
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(28000);
  await protectRecoveryOrigin(page,origin,process.env.VERCEL_OIDC_TOKEN);
  const observer=await beginVoiceObservation(page);
  await page.goto(origin);
  const commit=await page.evaluate(async()=>{const r=await fetch('/ourground-build-evidence.json',{cache:'no-store'});return r.ok?(await r.json()).source_commit:null;});
  assert.equal(commit,expected);
  await page.locator('.eden-launch').click();
  await page.locator('#eden-command').fill('Who are you?');await page.locator('#eden-command').press('Enter');
  if(await page.locator('.eden-consent').isVisible()){
    for(const box of await page.locator('.eden-consent input:visible').all())await box.check();
    await page.locator('[data-continue]').click();
  }
  const response=page.locator('.eden-message[aria-label="Eden"]').last();await response.waitFor();
  const displayedReply=await response.innerText();assert.match(displayedReply,/Eden/i);
  await verifyAndSaveHostedSpeech({page,origin,commit,out,displayedReply,observer});
} finally {await browser.close();}
