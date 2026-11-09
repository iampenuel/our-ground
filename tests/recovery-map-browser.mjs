import {protectRecoveryOrigin} from './recovery-origin.mjs';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const origin='https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app';
const token=process.env.VERCEL_OIDC_TOKEN;
const expected=process.env.RECOVERY_SHA;
if(!token || !/^[a-f0-9]{40}$/.test(expected??''))throw Error('Expected commit SHA and trusted staging token are required.');
const out=process.env.RECOVERY_IMAGES??'docs/release/eden-recovery-images/staging';
await mkdir(out,{recursive:true});
const report={utc:new Date().toISOString(),origin,expected,commit:null,anonymous:null,style:[],vectorResponses:{},failedProviderRequests:0,search:null,markers:0,selection:false,openedDetail:false,status:'FAIL'};
const count=(store,key)=>{store[key]=(store[key]??0)+1;};
const shot=async(page,file)=>{await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await page.screenshot({path:join(out,file),quality:87});};
let phase='anonymous access',browser,page;
try {
 const anon=await fetch(origin+'/support',{redirect:'manual',signal:AbortSignal.timeout(12000)});
 const redirect=anon.headers.get('location');
 report.anonymous={status:anon.status,...(redirect?{redirectHost:new URL(redirect,origin).hostname}: {})};
 if(!([401,403].includes(anon.status)||([302,307].includes(anon.status)&&redirect&&new URL(redirect,origin).hostname.endsWith('vercel.com'))))throw Error('no protection');
 phase='deployed SHA';
 const proof=await fetch(origin+'/ourground-build-evidence.json',{redirect:'manual',headers:{'x-vercel-trusted-oidc-idp-token':token},signal:AbortSignal.timeout(15000)});
 report.proofHTTP=proof.status;
 if(proof.status!==200)throw Error('staging access unavailable');
 report.commit=(await proof.json()).source_commit;
 if(report.commit!==expected)throw Error('unexpected deployment');
 phase='directory';
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await protectRecoveryOrigin(context,origin,token);
 page=await context.newPage(); page.setDefaultTimeout(25000);
 const styleReads=[];
 page.on('response',r=>{
  const u=new URL(r.url()); if(!u.hostname.endsWith('.geoapify.com'))return;
  if(/\/style\.json$/.test(u.pathname)){
   const receipt={status:r.status()};report.style.push(receipt);
   if(r.ok())styleReads.push(r.json().then(s=>{receipt.version=s.version;receipt.layers=Array.isArray(s.layers)?s.layers.length:0;receipt.vectorSources=Object.values(s.sources??{}).filter(k=>k.type==='vector').length;}).catch(()=>{}));
  }
  if(/\/\d+\/-?\d+\/-?\d+(?:[./]|$)/.test(u.pathname)&&(/\.(pbf|mvt)$/.test(u.pathname)||r.headers()['content-type']?.includes('vector-tile')))count(report.vectorResponses,String(r.status()));
 });
 page.on('requestfailed',r=>{const h=new URL(r.url()).hostname;if(h.endsWith('.geoapify.com'))report.failedProviderRequests++;});
 await page.goto(origin+'/support?view=list');
 await page.locator('[data-category="healthcare"]').click();
 await page.locator('#locationInput').fill('Harrisburg, PA');
 await page.locator('#locationInput').press('Enter');
 await page.locator('[data-card-key^="directory:"]').first().waitFor();
 report.search=await page.locator('#resultsCount').innerText();
 phase='style, tiles and markers';
 if(await page.locator('#showSupportMap').getAttribute('aria-expanded')!=='true')await page.locator('#showSupportMap').click();
 await page.locator('#mapTitle').scrollIntoViewIfNeeded();
 await page.locator('.geo-map-pin').first().waitFor({timeout:25000});
 await Promise.all(styleReads);
 report.markers=await page.locator('.geo-map-pin').count();
 if(!report.style.some(s=>s.status===200&&s.vectorSources&&s.layers>0))throw Error('style unavailable');
 await page.waitForTimeout(900);
 if(!Object.keys(report.vectorResponses).some(status=>Number(status)>=200&&Number(status)<300))throw Error('no vector responses');
 phase='marker selection';
 const index=await page.locator('.geo-map-pin').evaluateAll(pins=>pins.findIndex(pin=>{
  if(pin.getAttribute('aria-pressed')==='true')return false;
  const r=pin.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  return pin.contains(document.elementFromPoint(x,y));
 }));
 if(index<0)throw Error('no hit-testable unselected marker');
 const marker=page.locator('.geo-map-pin').nth(index),label=await marker.getAttribute('aria-label');
 await marker.click();
 const selected=page.locator('#resourceResults [data-selected=true][data-card-key^="directory:"]');
 await selected.waitFor();
 const title=await selected.locator('.discovery-select > span:not([class])').innerText();
 report.selection=(await marker.getAttribute('aria-pressed')==='true')&&label.includes(title);
 if(!report.selection)throw Error('marker did not select matching card');
 report.selectedTitle=title;
 await shot(page,'stable-map-marker-desktop.jpg');
 phase='listing detail';
 const action=selected.locator('a[data-resource-open]');
 const id=await action.getAttribute('data-resource-open');
 await action.click();
 const facts=page.locator('[data-resource-content="'+id+'"]');
 await facts.waitFor();
 await page.waitForFunction(id=>location.search.includes('resource='+id)&&document.querySelector('[data-resource-content="'+id+'"]')?.textContent.trim().length>40,id);
 report.openedDetail=true;
 report.publicResourceId=id;
 await facts.scrollIntoViewIfNeeded();await shot(page,'stable-map-listing-desktop.jpg');
 report.status='PASS';
} catch {
 report.blockedAt=phase;
 if(page){
  report.mapNotice=await page.locator('#mapState').innerText({timeout:2000}).catch(()=>null);
  await shot(page,'stable-map-observed-desktop.jpg').catch(()=>{});
 }
 process.exitCode=1;
} finally {
 await browser?.close();
 await writeFile(join(out,'stable-map.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
