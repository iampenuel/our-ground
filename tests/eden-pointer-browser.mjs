// Local real application engine + registered targets; directory HTTP is an
// explicitly labeled fixture. Separate protected recording uses the live service.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
const base=process.env.RELEASE_BROWSER_BASE??'http://127.0.0.1:4275';
const server=process.env.RELEASE_BROWSER_BASE?null:await createServer({server:{host:'127.0.0.1',port:4275,strictPort:true,hmr:false,watch:null},logLevel:'error'});await server?.listen();
const browser=await chromium.launch({channel:'chrome'});
const report=[];
const resource={id:'828e4d8a-d5d7-5527-a75c-2a6f10027a56',title:'Synthetic directory record for pointer verification',summary:'Local fixture, no real service claim.',category_slugs:['healthcare'],organization:{id:'11111111-1111-4111-8111-111111111111',name:'Synthetic verification organization'},location:{city:'Harrisburg',state:'PA',address_label:'Synthetic test location',latitude:40.27,longitude:-76.88},contact:{phone:null,website_url:null},detail_level:'substantive',distance_miles:1,data_kind:'imported_unverified',source_recorded_at:null};
try{
 for(const [name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',390,844,'no-preference'],['narrow-reduced',320,740,'reduce'],['short',720,450,'no-preference']]){
  const ctx=await browser.newContext({viewport:{width,height},reducedMotion:motion});const p=await ctx.newPage();const errors=[],searches=[];
  p.on('pageerror',e=>errors.push(e.name));
  await p.addInitScript(()=>{window.__edenVisual=[];document.addEventListener('eden:visible-action',e=>{const c=document.querySelector('.showcase-pointer-cursor');window.__edenVisual.push({...e.detail,cursor:c?{x:parseFloat(c.style.getPropertyValue('--cursor-x')),y:parseFloat(c.style.getPropertyValue('--cursor-y'))}:null});});});
  const location={label:'Harrisburg, PA',publicQuery:'Harrisburg, PA',state:'PA',latitude:40.27,longitude:-76.88,source:'reference',precision:'locality',quality:{kind:'canonical_exact',source:'reference',precision:'city',coordinateSource:'reference',sourceName:'Census fixture',explanation:'Representative city point.'}};
  await p.route('**/api/v1/**',r=>{const path=new URL(r.request().url()).pathname;let json={};if(path.endsWith('/locations/status'))json={configured:false,referenceConfigured:true};if(path.endsWith('/geoapify/status'))json={enabled:false};if(path.endsWith('/directory-city'))json={location};if(path.endsWith('/resources/search')){searches.push(r.request().postDataJSON());json={items:[resource],total:1,page:1,page_size:20,has_next:false};}if(path.endsWith('/resources/'+resource.id))json={...resource,description:resource.summary,hours:[],eligibility:null,application_process:null,accessibility:null};return r.fulfill({json});});
  await p.goto(base);await p.locator('h1').waitFor();
  const search=await p.evaluate(async()=>{const m=await import('/src/eden/live-actions.ts');return m.applyEdenPublicAction({type:'search',category:'healthcare',city:'harrisburg-pa',radius:10},{publicDirectory:true,signal:new AbortController().signal});});
  assert.equal(search.status,'done',JSON.stringify(search));assert.equal(searches.length,1,'One authorized search, no hydration duplicate');
  assert.equal(await p.locator('#locationInput').inputValue(),'Harrisburg, PA');assert.equal(await p.locator('[data-category=healthcare]').getAttribute('aria-pressed'),'true');
  const details=await p.evaluate(async()=>{const m=await import('/src/eden/live-actions.ts');return m.applyEdenPublicAction({type:'details',index:1},{publicDirectory:true,signal:new AbortController().signal});});assert.equal(details.status,'done',JSON.stringify(details));await p.getByText('Selected resource',{exact:true}).waitFor();
  const events=await p.evaluate(()=>window.__edenVisual);const executed=events.filter(e=>e.phase==='execute');assert(executed.length>=6);
  if(motion==='no-preference')for(const e of executed){assert(e.cursor&&Number.isFinite(e.cursor.x)&&Number.isFinite(e.cursor.y),JSON.stringify(e));assert(e.cursor.x>=e.rect.x-4&&e.cursor.x<=e.rect.x+e.rect.width+4&&e.cursor.y>=e.rect.y-4&&e.cursor.y<=e.rect.y+e.rect.height+4,JSON.stringify(e));}
  const back=await p.evaluate(async()=>{const m=await import('/src/eden/page-controls.ts');return m.applyPageControlResult('back-to-map',new AbortController().signal);});assert.equal(back.status,'done');assert.equal(await p.locator('#showSupportMap').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('[data-resource-content]:visible').count(),0);
  const safe=await p.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');let invoked=0,clicks=0;const button=document.getElementById('supportSubmit');button.addEventListener('click',()=>clicks++);
   await act('submit','Verify visual isolation','press',new AbortController().signal,()=>{invoked++;});
   button.disabled=true;let denied=false;try{await act('submit','Unavailable control','press',new AbortController().signal,()=>invoked++);}catch{denied=true;}button.disabled=false;
   let missing=false;try{await act({resultKey:'directory:00000000-0000-4000-8000-000000000000',operation:'details'},'Unavailable result','press',new AbortController().signal,()=>invoked++);}catch{missing=true;}
   return{invoked,clicks,denied,missing};});assert.deepEqual(safe,{invoked:1,clicks:0,denied:true,missing:true});
  if(motion==='no-preference'){
   const aborted=await p.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');const c=new AbortController();let invoked=false;const pending=act('radius','Change radius','press',c.signal,()=>{invoked=true;});setTimeout(()=>c.abort(),60);try{await pending;}catch{}return invoked;});assert.equal(aborted,false);
   await p.evaluate(()=>{window.__edenInterrupted=undefined;import('/src/eden/visible-action.ts').then(({performEdenVisibleAction:act})=>{window.__edenInterrupted=act('radius','Change radius','press',new AbortController().signal,()=>true).then(()=>false,()=>true);});});
   await p.locator('.eden-action-status').filter({hasText:'Change radius'}).waitFor();await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.__edenInterrupted),true,'Trusted user input cancels a pending operation');
   const stale=await p.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');let invoked=false;const el=document.getElementById('radiusInput'),parent=el.parentElement,next=el.nextSibling;const pending=act('radius','Change radius','press',new AbortController().signal,()=>{invoked=true;});setTimeout(()=>el.remove(),60);try{await pending;}catch{}parent.insertBefore(el,next);return invoked;});assert.equal(stale,false);
  }else{
   const reduced=await p.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');let visible=false;await act('radius','Change radius','press',new AbortController().signal,()=>{visible=!document.querySelector('.eden-action-status').hidden;});return{visible,cursors:[...document.querySelectorAll('#eden-action-pointer')].filter(e=>e.getClientRects().length).length};});assert.deepEqual(reduced,{visible:true,cursors:0});
  }
  assert.deepEqual(errors,[]);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(name==='desktop'){await p.goto(base+'/account');await p.locator('h1').waitFor();const privateDenied=await p.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');let invoked=false;try{await act('page','Forbidden action','scroll',new AbortController().signal,()=>{invoked=true;});}catch{}return !invoked;});assert(privateDenied,'The visual coordinator cannot act on private account pages');}
  report.push({view:name,executed:executed.length,singleSearch:searches.length===1,coordinateChecks:motion==='no-preference',safety:true,errors});await ctx.close();
 }
 const failureContext=await browser.newContext({reducedMotion:'no-preference'}),failurePage=await failureContext.newPage();
 await failurePage.route('**/src/eden/action-pointer-view*',r=>r.abort());await failurePage.goto(base);await failurePage.locator('h1').waitFor();
 const animationFailure=await failurePage.evaluate(async()=>{const {performEdenVisibleAction:act}=await import('/src/eden/visible-action.ts');let invoked=0;await act('page','Read the public page','scroll',new AbortController().signal,()=>{invoked++;});return invoked;});assert.equal(animationFailure,1,'Rendering failure cannot disable the authorized application action');await failureContext.close();
 console.log(JSON.stringify({status:'PASS',scope:'Local directory fixture; real action engine and installed ReactDrops',views:report}));
}finally{await browser.close();await server?.close();}
