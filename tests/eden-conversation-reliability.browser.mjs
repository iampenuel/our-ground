// Real widget with a deterministic hosted transport. No provider calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base=process.env.RELEASE_BROWSER_BASE??'http://127.0.0.1:4199';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disk-cache-size=2097152']});
const held=new Map([1,4,5].map(turn=>[turn,Promise.withResolvers()]));
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(12000);
 const requests=[],unexpected=[],errors=[];
 const ticket='s'.repeat(43),unsafe='Private provider fixture text';
 let sessions=0,ended=0;
 page.on('pageerror',error=>errors.push(error.name));
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===new URL(base).origin)return route.fallback();
  unexpected.push('external request');
  return route.abort();
 });
 await page.route('**/eligibility',route=>route.fulfill({json:{eligible:true,denied:false}}));
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/hosted/session')){
   sessions++;
   return route.fulfill({json:{sessionToken:'t'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString()}});
  }
  if(path.endsWith('/hosted/end')){ended++;return route.fulfill({json:{ended:true}});}
  if(path.endsWith('/hosted/understand')){
   const request=route.request(),correlation=request.headers()['x-eden-correlation-id'];
   requests.push({correlation,symbols:request.postDataJSON().symbols});
   const turn=requests.length;
   await held.get(turn)?.promise;
   const headers={'x-eden-correlation-id':correlation,'x-eden-text-model':'gemini-3.5-flash-lite'};
   const fault=turn===1?'EDEN_INVALID_AGENT_OUTPUT':turn===4?'EDEN_PROVIDER_UNAVAILABLE':null;
   const key=turn===6?'greet':'thanks';
   try{
    await route.fulfill(fault?{headers,status:turn===1?502:503,json:{error:{code:fault,message:unsafe}}}
     :{headers,json:{engine:'gemini',choice:{kind:'message',key},reply:key==='greet'?'Hi there!':"You're very welcome!",speechTicket:ticket}});
   }catch(error){
    // A delayed response can race the browser abort after Stop.
    if(turn!==5)throw error;
   }
   return;
  }
  if(path.includes('/hosted/'))unexpected.push(path.split('/hosted/').at(-1));
  return route.fulfill({json:{}});
 });

 await page.goto(base+'/');
 await page.locator('.eden-launch').click();
 await page.waitForFunction(()=>document.querySelector('[data-age-row]')?.hidden);
 const panel=page.locator('#eden-panel'),draft=page.getByRole('textbox',{name:'Message Eden'});
 const log=page.getByRole('log',{name:'Conversation with Eden'});
 const users=log.locator('.eden-message[aria-label="You"]'),answers=log.locator('.eden-message[aria-label="Eden"]');
 const retry=page.getByRole('button',{name:'Try again',exact:true});
 const stop=page.getByRole('button',{name:'Stop response',exact:true});
 const state=page.locator('.eden-state');
 const diagnostic=async()=>JSON.parse(await page.locator('#eden-assistant').getAttribute('data-turn-diagnostic'));
 const waitForTurn=()=>page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/hosted/understand'));

 await draft.fill('Thank you!');
 await draft.press('Enter');
 await page.locator('.eden-consent').waitFor();
 await page.locator('.eden-consent [data-hosted-consent]').check();
 const first=waitForTurn();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await first;
 await stop.waitFor();
 await draft.fill('Thank you!');
 await draft.evaluate(input=>{
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  input.form.requestSubmit();
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true}));
 });
 await draft.fill('');
 held.get(1).resolve();
 await retry.waitFor();
 assert.equal(requests.length,1,'Rapid keyboard/form events spend only one hosted request');
 assert.deepEqual(await users.allTextContents(),['Thank you!']);
 assert.equal(await answers.count(),0);
 assert.equal(await draft.inputValue(),'Thank you!');
 const failed=await diagnostic();
 assert.equal(failed.correlationId,requests[0].correlation);
 assert.equal(failed.outcome,'failed');
 assert.equal(failed.failure.stage,'model-output');
 assert.equal(failed.failure.code,'EDEN_INVALID_AGENT_OUTPUT');
 assert.equal(failed.failure.endpoint,'understand');
 assert.equal(failed.failure.httpStatus,502);
 assert.doesNotMatch(JSON.stringify(failed),/Thank you|Private provider fixture text/);
 assert(!((await state.textContent()).includes(unsafe)));

 const originalRow=await users.first().elementHandle();
 await retry.click();
 await answers.getByText("You're very welcome!",{exact:true}).waitFor();
 assert.deepEqual(await users.allTextContents(),['Thank you!'],'Retry keeps the original transcript row');
 assert(await users.first().evaluate((row,original)=>row===original,originalRow),'Retry preserves the row and avoids a second live announcement');
 await originalRow.dispose();
 assert.equal(await answers.count(),1);
 assert.equal(requests.length,2);
 assert.equal(sessions,1,'A rejected reply does not invalidate the hosted session');
 await page.getByRole('button',{name:'Read reply',exact:true}).waitFor();

 await draft.fill('Thank you!');await draft.press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('.eden-log .eden-message[aria-label="Eden"]').length===2);
 assert.deepEqual(await users.allTextContents(),['Thank you!','Thank you!'],'A separately composed identical message stays in the transcript');
 assert.equal(requests.length,3);
 assert(requests.every(request=>Array.isArray(request.symbols)&&request.symbols.includes('thanks')));

 const fourth=waitForTurn();
 await draft.fill('Thanks!');await draft.press('Enter');await fourth;
 await draft.fill('Thanks for helping!');
 held.get(4).resolve();await stop.waitFor({state:'hidden'});
 assert.equal(await draft.inputValue(),'Thanks for helping!','A failed in-flight turn must preserve the next draft');
 assert.equal(await answers.count(),2);
 assert(!((await state.textContent()).includes(unsafe)));

 const fifth=waitForTurn();
 await draft.press('Enter');await fifth;
 await draft.fill('Hi!');
 const sessionEnd=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/hosted/end'));
 await stop.click();
 await sessionEnd;held.get(5).resolve();
 assert.equal(await draft.inputValue(),'Hi!','Stop preserves the draft typed during the canceled request');
 assert.equal(await answers.count(),2,'A canceled reply never appears');
 assert.equal(await retry.isVisible(),false);

 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Expand chat',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('eden-panel').getAttribute('aria-modal')==='true');
 await draft.press('Enter');await answers.getByText('Hi there!',{exact:true}).waitFor();
 assert.equal(await answers.count(),3);assert.equal(requests.length,6);assert.equal(sessions,2);assert.equal(ended,1);
 assert.deepEqual(await users.allTextContents(),['Thank you!','Thank you!','Thanks!','Thanks for helping!','Hi!']);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('button',{name:'Read reply',exact:true}).waitFor();
 assert.equal(await log.getAttribute('aria-live'),'polite');
 assert.equal(await state.getAttribute('role'),'status');
 if(process.env.EDEN_AXE){
  await page.evaluate(await readFile(process.env.EDEN_AXE,'utf8'));
  const findings=await page.evaluate(async()=>{
   const result=await window.axe.run('#eden-panel',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
   return result.violations.map(violation=>violation.id);
  });
  assert.deepEqual(findings,[],'Expanded Eden chat WCAG A/AA audit');
  console.log('PASS: expanded Eden chat axe WCAG 2.0/2.1 A/AA audit.');
 }
 await draft.press('Escape');await panel.waitFor({state:'hidden'});
 assert(await page.locator('.eden-launch').evaluate(button=>button===document.activeElement));
 assert.deepEqual(unexpected,[],'Text-only tests must not call speech, Live, or additional action endpoints');
 assert.deepEqual(errors,[]);
 console.log('PASS: real Eden widget, hosted fixture, single submission/reply, deliberate retry, draft preservation, cancellation, bounded diagnostics, mobile keyboard and Read reply.');
}finally{
 for(const gate of held.values())gate.resolve();
 await browser.close();
}
