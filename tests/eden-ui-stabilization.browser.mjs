// Real UI with local-only transport fixtures. No provider, speech or account use.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
const base='http://127.0.0.1:4294';
const server=await createServer({server:{host:'127.0.0.1',port:4294,strictPort:true,hmr:false,watch:null},logLevel:'error'});
await server.listen();
const browser=await chromium.launch({channel:'chrome'});
const report={scope:'local UI and explicit fixture conversation row',status:'FAIL',views:[]};
try{
 for(const [width,height,motion]of[[1280,800,'no-preference'],[390,844,'no-preference'],[720,450,'reduce']]){
   console.error('UI fixture',width,motion);
   const context=await browser.newContext({viewport:{width,height},reducedMotion:motion}),page=await context.newPage();
   let hostedCalls=0;
   await page.route('**/eligibility',r=>r.fulfill({json:{eligible:true,denied:false}}));
   await page.route('**/api/v1/**',r=>{if(r.request().url().includes('/eden/hosted/'))hostedCalls++;return r.fulfill({json:{}});});
   await page.addInitScript(()=>{window.qaAudioStarts=0;navigator.mediaDevices.getUserMedia=async()=>{window.qaAudioStarts++;throw Error('Unexpected microphone use');};});
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.eden-launch').waitFor();
   assert(await page.locator('#eden-panel').isHidden(),'homepage does not open chat automatically');
   await page.locator('.eden-launch').click();
   const welcome=page.locator('.eden-welcome');
   assert.equal(await welcome.count(),1);assert(await welcome.isVisible());assert.match(await welcome.innerText(),/Hi!.*Eden.*food.*healthcare.*community.*page/s);
   const welcomeHeight=await welcome.evaluate(el=>el.getBoundingClientRect().height);assert(welcomeHeight<170,'welcome remains compact');
   await page.evaluate(()=>{
     const row=document.createElement('div');row.className='eden-message';row.textContent='Explicit local conversation fixture.';
     document.querySelector('.eden-log').append(row);document.querySelector('#eden-command').dispatchEvent(new Event('input',{bubbles:true}));
   });
   assert(await welcome.isHidden());
   await page.locator('[data-minimize]').click();await page.locator('.eden-launch').click();
   assert.equal(await page.locator('.eden-log .eden-message').count(),1);assert(await welcome.isHidden());
   await page.evaluate(async()=>{const {mountHostedEden}=await import('/src/eden/hosted-assistant.ts');mountHostedEden(document.querySelector('#eden-assistant'));});
   assert.equal(await page.locator('.eden-log .eden-message').count(),1,'remount preserves current conversation');
   console.error('UI fixture navigating',width);
   await page.evaluate(async()=>{const {navigateEdenPublicPage}=await import('/src/eden/public-navigation.ts');await navigateEdenPublicPage('about',{signal:new AbortController().signal});});
   assert.equal(await page.locator('.eden-log .eden-message').count(),1);assert(await welcome.isHidden());
   await page.locator('[data-reset]').click();assert(await welcome.isVisible());assert.equal(await page.locator('.eden-log .eden-message').count(),0);
   await page.keyboard.press('Tab');await page.locator('[data-reset]').focus();
   const focus=await page.locator('[data-reset]').evaluate(el=>({visible:el.matches(':focus-visible'),style:getComputedStyle(el).outlineStyle,width:parseFloat(getComputedStyle(el).outlineWidth)}));
   assert(focus.visible&&focus.style!=='none'&&focus.width>0,'keyboard focus remains visible');
   console.error('UI fixture pointer',width);
   const pointer=await page.evaluate(async()=>{
     const button=document.createElement('button');button.textContent='Local pointer target';button.style.cssText='position:fixed;left:40px;top:80px';document.body.append(button);
     let clicks=0,rings=0;button.addEventListener('click',()=>clicks++);
     const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&node.matches('.showcase-pointer-cursor-ripple'))rings++;});
     observer.observe(document.body,{subtree:true,childList:true});
     const {createEdenPointerView}=await import('/src/eden/action-pointer-view.tsx'),view=createEdenPointerView();
     if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await view.move(button,'press',AbortSignal.timeout(8000));
     const cursor=document.querySelector('#eden-action-pointer'),label=cursor.querySelector('.showcase-pointer-cursor-label');
     const result={clicks,rings,outline:getComputedStyle(button).outlineStyle,pointerEvents:getComputedStyle(cursor).pointerEvents,label:getComputedStyle(label).backgroundColor};
     observer.disconnect();view.destroy();button.remove();return result;
   });
   assert.equal(pointer.clicks,0);assert.equal(pointer.rings,0);assert.equal(pointer.outline,'none');assert.equal(pointer.pointerEvents,'none');assert.equal(pointer.label,'rgb(23, 23, 23)');
   const replacement=await page.evaluate(async()=>{
     const {performEdenVisibleAction}=await import('/src/eden/visible-action.ts');
     let firstExecuted=0,secondExecuted=0;
     const first=performEdenVisibleAction('page','Superseded local operation','focus',new AbortController().signal,()=>firstExecuted++);
     const second=performEdenVisibleAction('page','Current local operation','scroll',new AbortController().signal,()=>secondExecuted++);
     const settled=await Promise.allSettled([first,second]);
     return {firstExecuted,secondExecuted,states:settled.map(item=>item.status)};
   });
   assert.equal(replacement.secondExecuted,1);
   if(motion==='reduce'){assert.equal(replacement.firstExecuted,1);assert.deepEqual(replacement.states,['rejected','fulfilled']);}
   else{assert.equal(replacement.firstExecuted,0);assert.deepEqual(replacement.states,['rejected','fulfilled']);}
   assert.equal(hostedCalls,0);assert.equal(await page.evaluate(()=>window.qaAudioStarts),0);
   report.views.push({width,height,motion,welcomeHeight,focus,pointer,replacement,hostedCalls});
   await context.close();
 }
 report.status='PASS';console.log(JSON.stringify(report));
}finally{await browser.close();await server.close();}
