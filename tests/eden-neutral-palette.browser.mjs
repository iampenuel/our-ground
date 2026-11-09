// Protected visual acceptance. Public directory requests are genuine; the two
// short Eden replies are deterministic fixtures. No Google voice/text call runs.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {profileReply} from '../shared/eden-conversation.ts';
import {protectRecoveryOrigin} from './recovery-origin.mjs';

const origin=new URL(process.env.RECOVERY_BASE).origin;
const sha=process.env.RECOVERY_SHA,phase=process.env.RECOVERY_VISUAL_PHASE??'before';
const out=process.env.RECOVERY_IMAGES;
assert(out&&/^[a-f0-9]{40}$/.test(sha));assert(['before','after'].includes(phase));
await mkdir(out,{recursive:true});
const axe=await readFile(process.env.RECOVERY_AXE??'tmp/product-audit/tools/axe.min.js','utf8');
const before=process.env.RECOVERY_BEFORE?JSON.parse(await readFile(process.env.RECOVERY_BEFORE,'utf8')):null;
const report={phase,origin,sha,scope:'real protected pages and published directory; fixture Gemini identity/capabilities',views:[],contrasts:[],accessibility:[],errors:[],forbiddenProviderRequests:[],status:'FAIL'};
const expected={'--og-paper':'#fcfcfa','--og-white':'#ffffff','--og-surface-soft':'#f5f5f3','--og-ink':'#252a28','--og-muted':'#626965','--og-line':'#e4e5e1','--og-green-deep':'#1c332c'};
const selectors={
 body:'body',header:'.og-site-header',wordmark:'.og-brand',heading:'main h1',reading:'main p',label:'main label',
 input:'#locationInput',radius:'#radiusInput',primary:'.search-button',card:'.discovery-card',resource:'[data-resource-content]',account:'.account-panel',
 eden:'#eden-panel',edenBody:'.eden-body',edenHeader:'.eden-header',composer:'.eden-input',draft:'#eden-command',
 welcome:'.eden-welcome',invitation:'.eden-introduction',reply:'.eden-message:not(.command) p',userReply:'.eden-message.command p',footer:'.og-footer',
};
const browser=await chromium.launch({channel:'chrome'});
let ctx;
try{
 ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await protectRecoveryOrigin(ctx,origin,process.env.VERCEL_OIDC_TOKEN);
 await ctx.route(origin+'/api/v1/eden/hosted/**',async route=>{
   const path=new URL(route.request().url()).pathname.split('/hosted/')[1];
   const body=route.request().postDataJSON();let json;
   if(path==='status')json={available:true,engine:'gemini',agentAvailable:true,speechAvailable:false,liveTokensAvailable:false,rawAudioAccepted:false,noticeVersion:EDEN_NOTICE_VERSION};
   else if(path==='session')json={sessionToken:'f'.repeat(43),expiresAt:new Date(Date.now()+900000).toISOString(),noticeVersion:EDEN_NOTICE_VERSION};
   else if(path==='understand'){
     const key=body.symbols.includes('capabilities')?'capabilities':'identity';
     json={engine:'gemini',choice:{kind:'message',key,focus:'search'},reply:profileReply(key,'search',false)};
   }else if(path==='end')json={ended:true};
   else throw Error('Unexpected provider operation during palette verification');
   await route.fulfill({json});
 });
 const p=await ctx.newPage();p.setDefaultTimeout(30000);
 p.on('pageerror',error=>report.errors.push(error.name));
 ctx.on('request',request=>{
   const url=new URL(request.url());
   if(url.hostname==='generativelanguage.googleapis.com'||url.origin===origin&&/\/eden\/hosted\/(?:speech|live\/token)$/.test(url.pathname))report.forbiddenProviderRequests.push({host:url.hostname,path:url.pathname});
 });
 await p.goto(origin);
 assert.equal(await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),sha);
 const adult=await p.evaluate(async()=>{const r=await fetch('/eligibility',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'age=19plus'});return r.status;});
 assert.equal(adult,200);
 async function computed(){return p.evaluate(({selectors,tokenNames})=>{
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
   const solid=e=>{for(let current=e;current;current=current.parentElement){const c=getComputedStyle(current).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return 'rgb(255, 255, 255)';};
   const roles={};
   for(const [name,selector] of Object.entries(selectors)){
     const e=[...document.querySelectorAll(selector)].find(visible);if(!e)continue;
     const s=getComputedStyle(e),r=e.getBoundingClientRect();
     roles[name]={color:s.color,background:s.backgroundColor,effectiveBackground:solid(e),border:s.borderTopColor,borderWidth:s.borderTopWidth,font:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,outline:s.outlineStyle,outlineColor:s.outlineColor,opacity:s.opacity,x:r.x,y:r.y,width:r.width,height:r.height};
     if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)roles[name].placeholder=getComputedStyle(e,'::placeholder').color;
   }
   const root=getComputedStyle(document.documentElement);
   const tokenColor=value=>/^#[0-9a-f]{3}$/.test(value)?'#'+[...value.slice(1)].map(c=>c+c).join(''):value;
   const tokens=Object.fromEntries(tokenNames.map(name=>[name,tokenColor(root.getPropertyValue(name).trim().toLowerCase())]));
   const hero=document.querySelector('.og-home-hero'),image=hero?.querySelector('img');
   return {tokens,roles,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
     hero:hero?{background:getComputedStyle(hero).background,overlay:getComputedStyle(hero.querySelector('.og-hero-photo')??hero,'::after').backgroundImage,image:image?new URL(image.currentSrc||image.src,location.href).pathname:null}:null};
 },{selectors,tokenNames:[...Object.keys(expected),'--og-border-strong']});}
 const rgb=color=>{const match=/rgba?\(([^)]+)\)/.exec(color);if(!match)return null;return match[1].split(',').slice(0,3).map(Number);};
 const luminance=color=>{const values=rgb(color);if(!values)return null;const linear=values.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];};
 function contrast(fg,bg){const a=luminance(fg),b=luminance(bg);if(a===null||b===null)return null;return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
 async function capture(name,{shot=true,audit=true}={}){
   await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const data=await computed(),view={name,...data};report.views.push(view);
   assert(data.scrollWidth<=data.width+1,'Horizontal overflow in '+name);
   if(phase==='after'){
     for(const [token,value] of Object.entries(expected))assert.equal(data.tokens[token],value,name+' '+token);
     assert.equal(data.roles.body.background,'rgb(252, 252, 250)',name+' body canvas');
     assert.equal(data.roles.body.color,'rgb(37, 42, 40)',name+' body text');
   }
   for(const [role,style] of Object.entries(data.roles)){
     const minimum=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700?3:4.5;
     // Hero reading text sits on photography with a preserved dark overlay.
     if(['body','header','wordmark','label','input','radius','card','resource','account','eden','edenBody','edenHeader','composer','draft','welcome','invitation','reply','userReply','footer'].includes(role)){
       const ratio=contrast(style.color,style.effectiveBackground);report.contrasts.push({view:name,role,kind:'text',ratio,minimum});
       if(phase==='after'&&ratio!==null)assert(ratio>=minimum,'Text contrast '+name+' '+role+' '+ratio);
     }
     if(['input','radius','draft','composer'].includes(role)){
       if(style.placeholder){const ratio=contrast(style.placeholder,style.effectiveBackground);report.contrasts.push({view:name,role,kind:'placeholder',ratio,minimum:4.5});if(phase==='after'&&ratio!==null)assert(ratio>=4.5,'Placeholder contrast '+name+' '+role);}
       // The textarea's visible composer shell owns its component boundary.
       if(role!=='draft'&&parseFloat(style.borderWidth)>0){const ratio=contrast(style.border,style.effectiveBackground);report.contrasts.push({view:name,role,kind:'boundary',ratio,minimum:3});if(phase==='after'&&ratio!==null)assert(ratio>=3,'Input boundary contrast '+name+' '+role);}
     }
   }
   if(before){const prior=before.views.find(v=>v.name===name);if(prior){
     for(const role of Object.keys(data.roles)){if(prior.roles[role]){assert.equal(data.roles[role].font,prior.roles[role].font,name+' '+role+' font');assert.equal(data.roles[role].fontSize,prior.roles[role].fontSize,name+' '+role+' size');}}
     if(data.hero&&prior.hero)assert.deepEqual(data.hero,prior.hero,'Hero imagery or overlay changed');
   }}
   if(shot)await p.screenshot({path:join(out,name+'.jpg'),type:'jpeg',quality:85,animations:'disabled'});
   if(audit){await p.evaluate(axe);const violations=await p.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']});return result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,8)}));});report.accessibility.push({view:name,violations});if(phase==='after')assert.equal(violations.length,0,'Axe violations '+name);}
 }
 await p.goto(origin);await p.locator('#home-title').waitFor();await p.locator('.eden-launch').waitFor();await capture('desktop-home-closed');
 const gutters=await p.evaluate(()=>['header .og-brand','#home-title','.og-hero-description','.og-hero-actions','.og-hero-values'].map(q=>document.querySelector(q).getBoundingClientRect().left));
 assert(Math.max(...gutters)-Math.min(...gutters)<=1);report.gutters=gutters;
 await p.locator('.eden-launch').click();await p.locator('#eden-command').waitFor();await capture('desktop-home-eden-open');
 async function ask(text){
   const prior=await p.locator('.eden-message[aria-label="Eden"]').last().elementHandle().catch(()=>null);
   await p.locator('#eden-command').fill(text);await p.locator('#eden-command').press('Enter');
   if(await p.locator('.eden-consent').isVisible()){for(const box of await p.locator('.eden-consent input:visible').all())await box.check();await p.locator('[data-continue]').click();}
   await p.waitForFunction(last=>{const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');return rows.length&&rows[rows.length-1]!==last;},prior);await prior?.dispose();
   return p.locator('.eden-message[aria-label="Eden"]').last().innerText();
 }
 report.fixtureConversation={identity:/Eden/.test(await ask('Who are you?')),capabilities:/public directory|nearby|listing/.test(await ask('What can you do?'))};
 assert(Object.values(report.fixtureConversation).every(Boolean));await capture('desktop-eden-fixture-followup');
 if(phase==='after'){
   for(let i=0;i<20&&!await p.locator('#eden-conversation').evaluate(e=>e===document.activeElement);i++)await p.keyboard.press('Shift+Tab');
   report.conversationKeyboard=await p.locator('#eden-conversation').evaluate(e=>{
     const s=getComputedStyle(e);return {focused:e===document.activeElement,visible:e.matches(':focus-visible')&&s.outlineStyle!=='none',role:e.getAttribute('role'),label:e.getAttribute('aria-label'),before:e.scrollTop,overflow:e.scrollHeight-e.clientHeight,documentScroll:scrollY};
   });
   const check=report.conversationKeyboard;assert(check.focused&&check.visible,'Conversation history needs visible keyboard focus');
   assert.equal(check.role,'region');assert.equal(check.label,'Eden conversation');assert(check.overflow>1,'Fixture must exercise overflowing history');
   await p.keyboard.press('PageUp');await p.waitForFunction(before=>document.querySelector('#eden-conversation').scrollTop<before,check.before,{timeout:3000});
   check.afterUp=await p.locator('#eden-conversation').evaluate(e=>e.scrollTop);
   assert.equal(await p.evaluate(()=>scrollY),check.documentScroll,'History paging moved the document');
   await p.keyboard.press('PageDown');await p.waitForFunction(previous=>document.querySelector('#eden-conversation').scrollTop>previous,check.afterUp,{timeout:3000});
   assert.equal(await p.evaluate(()=>scrollY),check.documentScroll);
   await p.screenshot({path:join(out,'desktop-eden-history-focus.jpg'),quality:85});
 }

 await p.goto(origin+'/give');await p.locator('h1').waitFor();await capture('desktop-give');
 await p.goto(origin+'/support');await p.locator('#supportSubmit:not([disabled])').waitFor();
 await p.locator('[data-category="healthcare"]').click();await p.locator('#radiusInput').selectOption('10');await p.locator('#locationInput').fill('Harrisburg, PA');await p.locator('#locationInput').press('Enter');
 const card=p.locator('[data-card-key^="directory:"]').first();await card.waitFor();
 await p.waitForFunction(()=>document.querySelector('#resourceResults')?.getAttribute('aria-busy')!=='true');
 const resourceId=process.env.RECOVERY_RESOURCE_ID??(await card.getAttribute('data-card-key')).split(':')[1];assert(/^[a-f0-9-]{36}$/.test(resourceId));report.resourceId=resourceId;
 await p.evaluate(()=>scrollTo(0,0));await capture('desktop-support');
 const detailCard=p.locator('[data-card-key="directory:'+resourceId+'"]');await detailCard.locator('[data-resource-open]').first().click();await p.locator('[data-resource-content]:visible').waitFor();
 await capture('desktop-resource');
 const resourcePath=new URL(p.url()).pathname+new URL(p.url()).search;report.resourcePath=resourcePath;
 await p.goto(origin+'/organizations');await p.locator('h1').waitFor();await capture('desktop-organizations');
 await p.goto(origin+'/account');await p.locator('h1').waitFor();await capture('desktop-account');
 for(const [name,width,height] of [['tablet',768,1024],['mobile',390,844],['narrow',320,740]]){
   await p.setViewportSize({width,height});await p.goto(origin);await p.locator('#home-title').waitFor();await capture(name+'-home-closed');
   await p.locator('.eden-launch').click();await p.locator('#eden-command').waitFor();await capture(name+'-home-eden-open');
   await p.goto(origin+'/account');await p.locator('h1').waitFor();await capture(name+'-account');
 }
 await p.goto(origin+'/about');
 for(let i=0;i<8&&!await p.locator('header .og-brand').evaluate(e=>e===document.activeElement);i++)await p.keyboard.press('Tab');
 report.keyboardFocus=await p.locator('header .og-brand').evaluate(e=>{const s=getComputedStyle(e);return {visible:e===document.activeElement&&e.matches(':focus-visible')&&s.outlineStyle!=='none',color:s.outlineColor,width:s.outlineWidth};});
 assert(report.keyboardFocus.visible);await p.locator('header .og-brand').press('Enter');await p.locator('#home-title').waitFor();report.keyboardHome=new URL(p.url()).pathname==='/';assert(report.keyboardHome);
 // The separate age gate has its own stylesheet and must use the same neutral canvas.
 const gateContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await protectRecoveryOrigin(gateContext,origin,process.env.VERCEL_OIDC_TOKEN);
 const gate=await gateContext.newPage();await gate.goto(origin+'/eligibility');
 report.eligibility=await gate.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,color:getComputedStyle(document.body).color}));
 if(phase==='after'){assert.equal(report.eligibility.background,'rgb(252, 252, 250)');assert.equal(report.eligibility.color,'rgb(37, 42, 40)');}
 await gate.screenshot({path:join(out,'desktop-eligibility.jpg'),quality:85});await gateContext.close();
 assert.equal(report.forbiddenProviderRequests.length,0,'Palette verification must not consume Gemini quota');
 report.status='PASS';
}catch(error){report.failure=String(error.message).split('\n')[0].slice(0,240);process.exitCode=1;}
finally{await ctx?.close();await browser.close();await writeFile(join(out,'palette.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,status:report.status,failure:report.failure,views:report.views.length,axePages:report.accessibility.length,axeViolations:report.accessibility.filter(a=>a.violations.length).map(a=>({view:a.view,ids:a.violations.map(v=>v.id)})),contrastChecks:report.contrasts.length,resourceId:report.resourceId}));}
