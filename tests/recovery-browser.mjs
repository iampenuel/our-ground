import {protectRecoveryOrigin} from './recovery-origin.mjs';
// Browser verification on a real local server or a single protected preview.
// Attach trusted headers only to that origin; never send them to maps or outbound links.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base=new URL(process.env.RECOVERY_BASE??'http://127.0.0.1:4291').origin;
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-recovery-images';
await mkdir(out,{recursive:true});
const axe=process.env.RECOVERY_AXE?await readFile(process.env.RECOVERY_AXE,'utf8'):null;
const receipt={scope:base,views:[],accessibility:[],unexpected:[]};
const browser=await chromium.launch({channel:'chrome'});
try{
 for(const [label,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844],['narrow',320,740],['zoom',720,450]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',hasTouch:width<=768});
  if(process.env.VERCEL_OIDC_TOKEN&&base.startsWith('https://'))await protectRecoveryOrigin(ctx,base,process.env.VERCEL_OIDC_TOKEN);
  const p=await ctx.newPage();
  p.on('pageerror',e=>receipt.unexpected.push(e.name+': '+e.message.slice(0,180)));
  async function shot(name){await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0).map(i=>i.decode().catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await p.screenshot({path:out+'/'+name+'.jpg',type:'jpeg',quality:82,animations:'disabled'});}
  async function audit(route){
   if(axe){await p.evaluate(axe);const violations=await p.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target).slice(0,8)}));});
   receipt.accessibility.push({view:label,route,violations});}
  }
  await p.goto(base);await p.locator('h1').first().waitFor();
  const gutter=await p.evaluate(()=>['header .og-brand','#home-title','.og-hero-description','.og-hero-actions','.og-hero-values'].map(q=>document.querySelector(q).getBoundingClientRect().left));
  assert(Math.max(...gutter)-Math.min(...gutter)<=1,'Homepage gutter mismatch: '+gutter);
  await shot('homepage-'+label);
  await p.goto(base+'/about');await p.locator('header .og-brand').waitFor();
  for(let i=0;i<8&&!await p.locator('header .og-brand').evaluate(e=>e===document.activeElement);i++)await p.keyboard.press('Tab');
  const brand=p.getByRole('link',{name:'Our Ground home'}).first();
  assert(await brand.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none'));
  await brand.press('Enter');await p.locator('#home-title').waitFor();assert.equal(new URL(p.url()).pathname,'/');
  receipt.wordmark??=[];receipt.wordmark.push({view:label,gutter,keyboardHome:true});
  await p.locator('.eden-launch').click();await p.locator('#eden-command').waitFor();
  const geometry=await p.evaluate(()=>{const panel=document.querySelector('#eden-panel').getBoundingClientRect(),input=document.querySelector('#eden-command').getBoundingClientRect();
   return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panelInside:panel.left>=-1&&panel.right<=innerWidth+1&&panel.bottom<=innerHeight+1&&panel.top>=-1,composerInside:input.top>panel.top&&input.bottom<=panel.bottom,transcript:document.querySelector('.eden-body').clientHeight};});
  assert(geometry.panelInside&&geometry.composerInside&&geometry.scrollWidth<=geometry.width+1&&geometry.transcript>=75,JSON.stringify(geometry));
  await shot('eden-'+label);await audit('home+eden');
  await p.locator('[data-settings]').click();await p.locator('#eden-settings-title').waitFor();await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');assert(await p.locator('.eden-launch').evaluate(el=>el===document.activeElement));
  await p.locator('.eden-launch').press('Enter');await p.locator('[data-expand]').click();await p.locator('[data-minimize]').click();await p.locator('.eden-launch').click();
  assert.equal(await p.locator('#eden-command').inputValue(),'');
  await p.keyboard.press('Escape');
  for(const [path,name] of [['/give','donor'],['/organizations','organizations'],['/account','organization-sign-in'],['/support','directory']]){
   await p.goto(base+path);await p.locator('h1').first().waitFor();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Reflow: '+label+path);
   if(label==='desktop'||label==='mobile'){await shot(name+'-'+label);await audit(path);}
  }
  receipt.views.push({label,width,height,...geometry});await ctx.close();
 }
}finally{await browser.close();await writeFile(out+'/visual-checks.json',JSON.stringify(receipt,null,2)+'\n');}
const violations=receipt.accessibility.filter(c=>c.violations.length);
console.log(JSON.stringify({viewports:receipt.views.length,axePages:receipt.accessibility.length,violations:violations.map(c=>[c.view,c.route,c.violations.map(v=>v.id)]),unexpected:receipt.unexpected}));
assert(!violations.length&&!receipt.unexpected.length);
