// Chrome browser zoom through an isolated profile. The live pointer is measured
// from the arrow's SVG screen matrix; CSS variables alone are insufficient.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {protectRecoveryOrigin} from './recovery-origin.mjs';

const scratch=await mkdtemp(join(tmpdir(),'og-zoom-evidence-')),out=process.env.RECOVERY_IMAGES??'docs/release/eden-live-action-evidence';
const base=new URL(process.env.RECOVERY_BASE??'http://127.0.0.1:4297').origin,hosted=base.startsWith('https://'),sha=process.env.RECOVERY_SHA;
if(hosted)assert.match(sha??'',/^[a-f0-9]{40}$/);
const server=process.env.RECOVERY_BASE?null:await createServer({server:{host:'127.0.0.1',port:4297,strictPort:true,hmr:false,watch:null},logLevel:'error'});
let ctx;const evidence=[];
const place={label:'Harrisburg, PA',publicQuery:'Harrisburg, PA',state:'PA',country:'US',latitude:40.27,longitude:-76.88,source:'reference',precision:'locality',quality:{kind:'canonical_exact',source:'reference',precision:'city',coordinateSource:'reference',sourceName:'Local test fixture',explanation:'Representative city point.'}};
const row={id:'828e4d8a-d5d7-5527-a75c-2a6f10027a56',title:'Synthetic listing for zoom verification',summary:'Local fixture',category_slugs:['healthcare'],organization:{id:'11111111-1111-4111-8111-111111111111',name:'Synthetic organization'},location:{city:'Harrisburg',state:'PA',address_label:'Synthetic test location',latitude:40.27,longitude:-76.88},contact:{phone:null,website_url:null},detail_level:'substantive',distance_miles:1,data_kind:'imported_unverified'};
try{
  await server?.listen();
  ctx=await chromium.launchPersistentContext(scratch,{channel:'chrome',headless:false,viewport:null,args:['--window-size=1440,992','--mute-audio','--disk-cache-size=2097152','--media-cache-size=1048576']});
  if(hosted)await protectRecoveryOrigin(ctx,base,process.env.VERCEL_OIDC_TOKEN);
  const p=await ctx.newPage(),searches=[];let modelCalls=0;
  await p.route('**/eligibility',r=>r.fulfill({json:{eligible:false,denied:false}}));
  await p.route('**/api/v1/**',async r=>{
    const path=new URL(r.request().url()).pathname;let json={};
    if(path.startsWith('/api/v1/eden/hosted/'))modelCalls++;
    if(path.endsWith('/locations/status'))json={configured:false,referenceConfigured:true};
    if(path.endsWith('/geoapify/status'))json={enabled:false};
    if(path.endsWith('/directory-city'))json={location:place};
    if(path.endsWith('/resources/search')){searches.push(r.request().postDataJSON());json={items:[row],total:1,page:1,page_size:20,has_next:false};}
    if(path.endsWith('/resources/'+row.id))json={...row,description:row.summary,hours:[],eligibility:null,application_process:null,accessibility:null};
    return r.fulfill({json});
  });
  await p.goto(base);await p.bringToFront();await p.locator('.eden-launch').waitFor();
  let actionModule='/src/eden/live-actions.ts',actionExport='applyEdenPublicAction',actionHash;
  if(hosted){
    const manifest=await p.evaluate(async()=>await(await fetch('/ourground-build-evidence.json',{cache:'no-store'})).json());
    assert.equal(manifest.source_commit,sha);
    const asset=Object.keys(manifest.assets).find(path=>/^assets\/hosted-conversation-[A-Za-z0-9_-]+\.js$/.test(path));assert(asset);
    actionModule='/'+asset;actionHash=manifest.assets[asset];
    actionExport=await p.evaluate(async({path,hash})=>{
      const bytes=await(await fetch(path)).arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(actual!==hash)throw Error('Compiled action bundle hash mismatch');
      const module=await import(path),exports=Object.entries(module).filter(([,value])=>typeof value==='function'&&Function.prototype.toString.call(value).includes('This action is unavailable.'));
      if(exports.length!==1)throw Error('Compiled validated action export unavailable');
      return exports[0][0];
    },{path:actionModule,hash:actionHash});
  }
  await p.waitForFunction(()=>Number(document.querySelector('.eden-launch-portrait svg')?.dataset.profileFrames)>1);
  const before=await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
  const settings=await ctx.newPage();await settings.goto('chrome://settings/appearance');
  await settings.waitForFunction(()=>typeof chrome.settingsPrivate?.getDefaultZoom==='function');
  const actual=await settings.evaluate(async()=>{await new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,resolve));return await new Promise(resolve=>chrome.settingsPrivate.getDefaultZoom(resolve));});
  assert.equal(actual,2);await p.bringToFront();await p.waitForFunction(dpr=>devicePixelRatio>=dpr*1.99,before.dpr);
  const zoomed=await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth}));
  const gutter=await p.evaluate(()=>['header .og-brand','#home-title','#community-title'].map(q=>document.querySelector(q).getBoundingClientRect().left));
  assert(Math.max(...gutter)-Math.min(...gutter)<=1,'200% homepage gutter mismatch: '+gutter);
  await p.goto(base+'/about');await p.locator('header .og-brand').waitFor();
  for(let i=0;i<8&&!await p.locator('header .og-brand').evaluate(e=>e===document.activeElement);i++)await p.keyboard.press('Tab');
  const brand=p.locator('header .og-brand');assert(await brand.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none'));
  await brand.press('Enter');await p.locator('#home-title').waitFor();
  await p.locator('.eden-introduction').waitFor();
  const launcherInvitation=await p.locator('.eden-introduction').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
  assert(launcherInvitation.left>=0&&launcherInvitation.right<=zoomed.width&&launcherInvitation.top>=0&&launcherInvitation.bottom<=zoomed.height,'Launcher invitation clips at 200%');
  evidence.push(['local-wordmark-actual-200.jpg',await p.screenshot({type:'jpeg',quality:82})]);
  await p.locator('.eden-launch').click();
  const shell=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {panel:rect('#eden-panel'),composer:rect('.eden-composer'),send:rect('[data-send]'),caution:rect('#eden-input-help'),portrait:document.querySelector('#eden-assistant').dataset.edenPortrait,frames:Number(document.querySelector('.eden-portrait svg').dataset.profileFrames)};
  });assert.equal(shell.portrait,'svg-profile');assert(shell.frames>0);assert(shell.caution.height>0);assert(shell.send.width>=44);assert(shell.composer.y+shell.composer.height<=shell.panel.y+shell.panel.height+1);
  await p.locator('[data-minimize]').click();await mkdir(out,{recursive:true});
  await p.evaluate(()=>{window.edenZoomHits=[];document.addEventListener('eden:visible-action',event=>{
    const e=event.detail;if(e.phase!=='execute'||!e.rect)return;
    const arrow=document.querySelector('.showcase-pointer-cursor-arrow');
    if(!arrow)return;
    // ReactDrops' arrow path begins at (4.2,3.3) in its own SVG viewBox.
    const tip=new DOMPoint(4.2,3.3).matrixTransform(arrow.getScreenCTM());
    const cursor=document.querySelector('.showcase-pointer-cursor'),origin=cursor.getBoundingClientRect();
    const hit=document.elementFromPoint(tip.x,tip.y),label=document.querySelector('.showcase-pointer-cursor-label')?.getBoundingClientRect();
    window.edenZoomHits.push({target:e.target,rect:e.rect,cssTip:{x:tip.x,y:tip.y},cursorLayoutOrigin:{x:origin.x,y:origin.y},label:label?{left:label.left,top:label.top,right:label.right,bottom:label.bottom}:null,frontElement:hit?.id||hit?.tagName||null,uid:e.operationId});
  });});
  const capture=await ctx.newCDPSession(p);
  const screens=[];
  await capture.send('Page.startScreencast',{format:'jpeg',quality:77,maxWidth:1440,maxHeight:850,everyNthFrame:2});
  capture.on('Page.screencastFrame',f=>{if(screens.length<180)screens.push({t:f.metadata.timestamp,data:f.data});void capture.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
  // A tool chain may claim the listing before the next animation frame. Keep
  // both operations in the same browser task with no driver or rendering wait.
  const {search,details,actions}=await p.evaluate(async({actionModule,actionExport})=>{
    const actions=[];
    const observe=e=>actions.push({phase:e.detail.phase,target:e.detail.target,rect:e.detail.rect});
    document.addEventListener('eden:visible-action',observe);
    const applyEdenPublicAction=(await import(actionModule))[actionExport];
    const options={publicDirectory:true,signal:new AbortController().signal};
    const search=await applyEdenPublicAction({type:'search',category:'healthcare',city:'harrisburg-pa',radius:10},options);
    const details=search.status==='done'?await applyEdenPublicAction({type:'details',index:1},options):null;
    document.removeEventListener('eden:visible-action',observe);
    return {search,details,actions};
  },{actionModule,actionExport});
  assert.equal(search.status,'done',JSON.stringify({search,actions}));assert.equal(searches.length,1);
  assert.equal(details.status,'done');await p.getByText('Selected resource',{exact:true}).waitFor();
  await capture.send('Page.stopScreencast');
  const hits=await p.evaluate(()=>window.edenZoomHits);assert(hits.length>=6);
  for(const {rect:r,cssTip:t} of hits){assert(t.x>=r.x-2&&t.x<=r.x+r.width+2&&t.y>=r.y-2&&t.y<=r.y+r.height+2,'Rendered tip missed target: '+JSON.stringify({r,t}));}
  for(const {label} of hits)assert(label&&label.left>=-1&&label.top>=-1&&label.right<=zoomed.width+1&&label.bottom<=zoomed.height+1,'EDEN label is clipped: '+JSON.stringify(label));
  assert.equal(modelCalls,0);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  // Last captured on-screen press (stable frame before details opens).
  if(screens.length>3)evidence.push(['local-cursor-actual-200-action.jpg',Buffer.from(screens.at(-3).data,'base64')]);
  await p.locator('.eden-launch').click();await p.waitForFunction(n=>Number(document.querySelector('.eden-portrait svg')?.dataset.profileFrames)>n,shell.frames);
  const screen=await capture.send('Page.captureScreenshot',{format:'jpeg',quality:78,fromSurface:true});
  evidence.push(['local-cursor-actual-200-panel.jpg',Buffer.from(screen.data,'base64')]);
  const report={scope:hosted?'protected compiled UI with synthetic directory fixtures; no Gemini requests':'local directory and age-status transport fixtures, actual page controls and approved portrait; no Gemini requests',...(hosted?{base,sha,actionModule,actionExport,actionHash}:{}),zoom:actual,before,zoomed,gutter,keyboardHome:true,launcherInvitation,shell,searchCount:searches.length,modelCalls,confirmedDetails:details.status,hits,status:'PASS'};
  evidence.push(['local-cursor-actual-200.json',JSON.stringify(report,null,2)+'\n']);console.log(JSON.stringify(report));
}finally{await ctx?.close();await server?.close();await rm(scratch,{recursive:true,force:true});}
for(const [name,data] of evidence)await writeFile(join(out,name),data);
