// Opt-in geographic UI regression. Gemini responses are controlled fixtures in
// both modes. GEOGRAPHY_REAL=1 uses the protected deployment's real geocoder and
// directory. No Google text, TTS or Live provider request leaves this harness.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {EDEN_NOTICE_VERSION,edenCityQuery} from '../shared/eden-assistant.ts';
import {conversationChoices} from '../shared/eden-conversation.ts';
import {protectRecoveryOrigin} from './recovery-origin.mjs';

const real=process.env.GEOGRAPHY_REAL==='1';
const out=process.env.RECOVERY_IMAGES??'/private/tmp/og-national-location-fixtures';
await mkdir(out,{recursive:true});
const port=Number(process.env.GEOGRAPHY_PORT??4298);
const server=real?null:await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},logLevel:'error'});
await server?.listen();
const origin=real?new URL(process.env.RECOVERY_BASE).origin:'http://127.0.0.1:'+port;
const report={origin,sha:process.env.RECOVERY_SHA??null,scope:real?'real location and directory services; fixture Gemini decisions':'controlled local location, directory and Gemini responses',cases:[],status:'FAIL'};
const cases=[
 ['Lanham, Maryland','Lanham, MD',38.968,-76.863],
 ['Harrisburg, Pennsylvania','Harrisburg, PA',40.273,-76.886],
 ['Berkeley, California','Berkeley, CA',37.871,-122.273],
 ['Baltimore, Maryland','Baltimore, MD',39.29,-76.612],
 ['New York City, New York','New York, NY',40.713,-74.006],
 ['Philadelphia, Pennsylvania','Philadelphia, PA',39.953,-75.164],
 ['San Francisco, California','San Francisco, CA',37.775,-122.419],
 ['San Fransisco, CA','San Francisco, CA',37.775,-122.419],
 ['20706','20706',38.97,-76.85],
 ['Berkeley',null],
 ['Monowi, NE','Monowi, NE',42.83,-98.33],
];
const archived=JSON.parse(await readFile(new URL('../output/phase-7d/real-directory-harrisburg.json',import.meta.url),'utf8'));
const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
function point(query){
 const definition=cases.find(([input,label])=>label&&(normalize(input)===normalize(query)||normalize(label)===normalize(query)));
 assert(definition,'Unknown fixture locality');const [,label,latitude,longitude]=definition,state=label==='20706'?'MD':label.slice(-2);
 return {label,publicQuery:label,latitude,longitude,...(label==='20706'?{}:{state}),country:'US',source:'reference',quality:{kind:'canonical_exact',source:'reference',precision:label==='20706'?'postcode':'city',coordinateSource:'reference',sourceName:'Controlled geography fixture',explanation:'Synthetic representative point for UI regression.'}};
}
const browser=await chromium.launch({channel:'chrome'});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 if(real)await protectRecoveryOrigin(ctx,origin,process.env.VERCEL_OIDC_TOKEN);
 const p=await ctx.newPage();p.setDefaultTimeout(20000);const counts={resources:0,resolutions:0};
 let lastDirectoryBody,lastPlannedCity,lastEdenContext,lastEdenOutcome;
 // These routes are always fixtures, even with real directory verification.
 await ctx.route(origin+'/api/v1/eden/hosted/**',async route=>{
   const endpoint=new URL(route.request().url()).pathname.split('/hosted/')[1],body=route.request().postDataJSON();
   let response;
   if(endpoint==='status')response={available:true,engine:'gemini',agentAvailable:true,speechAvailable:false,rawAudioAccepted:false,liveTokensAvailable:false,noticeVersion:EDEN_NOTICE_VERSION};
   else if(endpoint==='session')response={sessionToken:'f'.repeat(43),expiresAt:new Date(Date.now()+900000).toISOString(),noticeVersion:EDEN_NOTICE_VERSION};
   else if(endpoint==='plan'){
     const intent=body.intent;assert.equal(intent.goal,'find-resources');lastPlannedCity=intent.cityId;
     response={engine:'gemini',turnToken:'t'.repeat(43),action:{type:'search',city:intent.cityId,category:intent.category,radius:intent.radius??10}};
   }else if(endpoint==='result'){lastEdenContext=body.context;lastEdenOutcome=body.outcome;response={engine:'gemini',reply:body.outcome==='done'?`The resolved location has ${body.context.resultCount} matching directory listings.`:'Choose a more specific location before I describe results.',sources:[],phrase:'search_ready'};}
   else if(endpoint==='understand'){
     const choices=conversationChoices(body.symbols,body.context,body.controls,body.previous??undefined);
     const choice=choices.find(c=>c.kind==='intent'&&c.intent.goal==='find-resources')??choices[0];
     response={engine:'gemini',choice,reply:'Which city and state should I search?'};
   }else if(endpoint==='end')response={ended:true};
   else throw Error('Unexpected Gemini endpoint '+endpoint);
   await route.fulfill({json:response});
 });
 p.on('request',request=>{
   const path=new URL(request.url()).pathname;
   if(path==='/api/v1/resources/search'){counts.resources++;lastDirectoryBody=request.postDataJSON();}
   if(path==='/api/v1/locations/resolve'||path==='/api/v1/places/directory-city')counts.resolutions++;
 });
 if(!real){
   await p.route(origin+'/eligibility',r=>r.fulfill({json:{eligible:true,denied:false}}));
   await p.route(origin+'/api/v1/locations/status',r=>r.fulfill({json:{configured:true,referenceConfigured:true}}));
   await p.route(origin+'/api/v1/geoapify/status',r=>r.fulfill({json:{enabled:false}}));
   await p.route(origin+'/api/v1/locations/suggest**',r=>r.fulfill({json:{suggestions:[],attribution:''}}));
   await p.route(origin+'/api/v1/places/directory-city**',r=>{const query=edenCityQuery(new URL(r.request().url()).searchParams.get('city'));const location=point(query);if(process.env.GEOGRAPHY_PROVIDER_FALLBACK==='1'){location.source='provider';location.provider='geoapify';location.quality={kind:'exact',precision:'city',source:'geoapify',sourceName:'Controlled Geoapify fallback',explanation:'Exact synthetic city match.',provider:{confidence:.95,resultType:'city'}};}return r.fulfill({json:{location}});});
   await p.route(origin+'/api/v1/locations/resolve',r=>{
     const query=r.request().postDataJSON().q;
     if(query==='Berkeley')return r.fulfill({json:{status:'choose_location',choices:[{id:'fixture-ca',receipt:'fixture',primary:'Berkeley, CA',secondary:'California'},{id:'fixture-mo',receipt:'fixture',primary:'Berkeley, MO',secondary:'Missouri'}],reason:'ambiguous',attribution:'',notice:'Several places match Berkeley. Choose a state.'}});
     const location=point(query);return r.fulfill({json:{status:'resolved',location,attribution:'',interpretation:{query,label:location.label,corrected:normalize(query)!==normalize(location.label),scope:'city'}}});
   });
   await p.route(origin+'/api/v1/resources/search',r=>{
     const body=r.request().postDataJSON(),location=body.location;
     const empty=location.publicQuery==='Monowi, NE';
     const row=structuredClone(archived.items[0]);row.title='Synthetic public healthcare result';row.location={...row.location,city:location.label,state:location.state,latitude:location.latitude,longitude:location.longitude};
     return r.fulfill({json:{...archived,search_center:{latitude:location.latitude,longitude:location.longitude},items:empty?[]:[row],total:empty?0:1,has_next:false}});
   });
 }
 async function prepare(){
   await p.goto(origin+'/support?edenDiagnostics=1');
   if(real){await p.evaluate(async()=>{const r=await fetch('/eligibility',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'age=19plus'});if(!r.ok)throw Error('Adult test consent unavailable');});await p.reload();}
   await p.locator('#supportSubmit:not([disabled])').waitFor();
   if(real)assert.equal(await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),report.sha);
 }
 async function waitSearch(previous){await p.waitForFunction(()=>document.querySelector('#resourceResults')?.getAttribute('aria-busy')!=='true'&&!document.querySelector('#supportSubmit')?.disabled);assert.equal(counts.resources-previous,1,'one logical search must issue one directory request');}
 async function ask(text){
   const draft=p.locator('#eden-command'),answers=p.locator('.eden-message[aria-label="Eden"]');
   const prior=await answers.last().elementHandle().catch(()=>null);
   await draft.fill(text);await draft.press('Enter');
   if(await p.locator('.eden-consent').isVisible()){for(const box of await p.locator('.eden-consent input:visible').all())await box.check();await p.locator('[data-continue]').click();}
   await p.waitForFunction(last=>{const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');return rows.length&&rows[rows.length-1]!==last;},prior,{timeout:45000});await prior?.dispose();
   await p.waitForFunction(()=>!document.querySelector('#eden-command')?.disabled);
   return answers.last().innerText();
 }
 for(const [input,label] of cases){
   if(process.env.GEOGRAPHY_CASE&&input!==process.env.GEOGRAPHY_CASE)continue;
   console.log('Checking public geography scenario',input);
   const record={input,expectedLabel:label,stage:'manual',manual:'FAIL',eden:'BLOCKED'};report.cases.push(record);
   await prepare();await p.locator('[data-category="healthcare"]').click();await p.locator('#radiusInput').selectOption('5');
   let previous=counts.resources;await p.locator('#locationInput').fill(input);await p.locator('#locationInput').press('Enter');
   if(!label){await p.locator('[data-submit-choice]').first().waitFor();assert.equal(counts.resources,previous);record.manual='PASS';record.manualOutcome='clarification';}
   else{await p.waitForFunction(()=>document.querySelector('#loadedCount')?.textContent?.includes('directory listings loaded'));await waitSearch(previous);record.manualLocation=await p.locator('#locationInput').inputValue();record.manualQuery=lastDirectoryBody.location.publicQuery;record.manualCenter=[lastDirectoryBody.location.latitude,lastDirectoryBody.location.longitude];const expectedState=/^\d{5}$/.test(label)?undefined:label.slice(-2);assert.equal(lastDirectoryBody.location.country,'US');if(expectedState)assert.equal(lastDirectoryBody.location.state,expectedState);assert.equal(lastDirectoryBody.category,'healthcare');assert.equal(lastDirectoryBody.radius_miles,5);record.manual='PASS';}
   record.stage='eden';record.eden='FAIL';
   await prepare();previous=counts.resources;lastEdenContext=undefined;lastEdenOutcome=undefined;lastPlannedCity=undefined;await p.locator('.eden-launch').click();
   let reply=await ask('Find healthcare in '+input+' within 5 miles.');
   if(/Did you mean/i.test(reply))reply=await ask('Yes');
   record.edenDiagnostic={outcome:lastEdenOutcome??'no-result',plannedCity:lastPlannedCity??null,completedCity:lastEdenContext?.cityId??null,resultCount:lastEdenContext?.resultCount??null,reply:reply.slice(0,240)};
   if(!label){assert.equal(counts.resources,previous);assert(/specific|choose|state|location|clarif/i.test(reply));record.eden='PASS';record.edenOutcome='clarification';}
   else{await waitSearch(previous);assert.equal(lastEdenOutcome,'done','the actual action must finish before narration');assert.equal(lastEdenContext.cityId,lastPlannedCity,'the completed point must retain the authorized locality identity');record.eden='PASS';record.edenCityId=lastEdenContext.cityId;record.edenLocation=await p.locator('#locationInput').inputValue();record.edenQuery=lastDirectoryBody.location.publicQuery;record.edenCenter=[lastDirectoryBody.location.latitude,lastDirectoryBody.location.longitude];assert.equal(record.edenQuery,record.manualQuery);assert.deepEqual(record.edenCenter,record.manualCenter);assert.equal(await p.locator('#radiusInput').inputValue(),'5');record.directoryRequestsForEden=counts.resources-previous;record.directoryCount=lastEdenContext.resultCount;if(input==='Monowi, NE')assert.equal(record.directoryCount,0,'the resolved small-town case must verify an honest empty directory result');}
   record.stage='complete';
   if(input==='Lanham, Maryland'||input==='Berkeley')await p.screenshot({path:join(out,input.startsWith('Lanham')?'lanham.jpg':'berkeley-clarification.jpg'),quality:80});
 }
 report.status='PASS';await ctx.close();
}catch(error){
 report.failure=String(error.message).split('\n')[0].slice(0,180);
 const primitive=value=>typeof value==='string'?value.slice(0,160):typeof value==='number'||typeof value==='boolean'||value===null?value:undefined;
 report.assertion={operator:error.operator??null,actual:primitive(error.actual),expected:primitive(error.expected)};
 process.exitCode=1;
}
finally{await browser.close();await server?.close();await writeFile(join(out,'geography.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
