// Chrome browser zoom through an isolated profile. The live pointer is measured
// from the arrow's SVG screen matrix; CSS variables alone are insufficient.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const scratch=await mkdtemp(join(tmpdir(),'og-zoom-evidence-')),out=process.env.RECOVERY_IMAGES??'docs/release/eden-live-action-evidence';
const server=await createServer({server:{host:'127.0.0.1',port:4297,strictPort:true,hmr:false,watch:null},logLevel:'error'});
let ctx;const evidence=[];const base='http://127.0.0.1:4297';
const place={label:'Harrisburg, PA',publicQuery:'Harrisburg, PA',state:'PA',latitude:40.27,longitude:-76.88,source:'reference',precision:'locality',quality:{kind:'canonical_exact',source:'reference',precision:'city',coordinateSource:'reference',sourceName:'Local test fixture',explanation:'Representative city point.'}};
const row={id:'828e4d8a-d5d7-5527-a75c-2a6f10027a56',title:'Synthetic listing for zoom verification',summary:'Local fixture',category_slugs:['healthcare'],organization:{id:'11111111-1111-4111-8111-111111111111',name:'Synthetic organization'},location:{city:'Harrisburg',state:'PA',address_label:'Synthetic test location',latitude:40.27,longitude:-76.88},contact:{phone:null,website_url:null},detail_level:'substantive',distance_miles:1,data_kind:'imported_unverified'};
try{
  await server.listen();
  ctx=await chromium.launchPersistentContext(scratch,{channel:'chrome',headless:false,viewport:null,args:['--window-size=1440,992','--mute-audio','--disk-cache-size=2097152','--media-cache-size=1048576']});
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
  await p.waitForFunction(()=>Number(document.querySelector('.eden-launch-portrait svg')?.dataset.profileFrames)>1);
  const before=await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
  const settings=await ctx.newPage();await settings.goto('chrome://settings/appearance');
  await settings.waitForFunction(()=>typeof chrome.settingsPrivate?.getDefaultZoom==='function');
  const actual=await settings.evaluate(async()=>{await new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,resolve));return await new Promise(resolve=>chrome.settingsPrivate.getDefaultZoom(resolve));});
  assert.equal(actual,2);await p.bringToFront();await p.waitForFunction(dpr=>devicePixelRatio>=dpr*1.99,before.dpr);
  const zoomed=await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth}));
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
  const search=await p.evaluate(async()=>{const {applyEdenPublicAction}=await import('/src/eden/live-actions.ts');
    return applyEdenPublicAction({type:'search',category:'healthcare',city:'harrisburg-pa',radius:10},{publicDirectory:true,signal:new AbortController().signal});
  });
  assert.equal(search.status,'done');assert.equal(searches.length,1);
  const details=await p.evaluate(async()=>{const {applyEdenPublicAction}=await import('/src/eden/live-actions.ts');return applyEdenPublicAction({type:'details',index:1},{publicDirectory:true,signal:new AbortController().signal});});
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
  const report={scope:'local directory and age-status transport fixtures, actual page controls and approved portrait; no Gemini requests',zoom:actual,before,zoomed,shell,searchCount:searches.length,modelCalls,confirmedDetails:details.status,hits,status:'PASS'};
  evidence.push(['local-cursor-actual-200.json',JSON.stringify(report,null,2)+'\n']);console.log(JSON.stringify(report));
}finally{await ctx?.close();await server.close();await rm(scratch,{recursive:true,force:true});}
for(const [name,data] of evidence)await writeFile(join(out,name),data);
