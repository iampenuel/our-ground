// Exercise the real widget and page mounts with an explicitly unavailable AI
// and a deterministic directory transport. Separate provider/staging checks
// cover Gemini and the actual published directory.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.RELEASE_BROWSER_BASE??'http://127.0.0.1:4199';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const searches=[],unexpected=[];
 page.on('pageerror',error=>unexpected.push(error.name));
 const location={label:'Harrisburg, PA',publicQuery:'Harrisburg, PA',state:'PA',latitude:40.27,longitude:-76.88,source:'reference',precision:'locality',quality:{kind:'canonical_exact',source:'reference',precision:'city',coordinateSource:'reference',sourceName:'Census fixture',explanation:'Representative city point.'}};
 await page.route('**/eligibility',route=>route.fulfill({json:{eligible:true,denied:false}}));
 await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname;
   let json={};
   if(path.endsWith('/hosted/session'))return route.fulfill({status:403,json:{error:{code:'EDEN_DISABLED'}}});
   if(path.endsWith('/locations/status'))json={configured:false,referenceConfigured:true};
   if(path.endsWith('/geoapify/status'))json={enabled:false};
   if(path.endsWith('/directory-city'))json={location};
   if(path.endsWith('/locations/resolve'))json={status:'resolved',location};
   if(path.endsWith('/resources/search')){searches.push(route.request().postDataJSON());json={items:[],total:0,page:1,page_size:20,has_next:false};}
   return route.fulfill({json});
 });
 await page.goto(base+'/');
 await page.locator('.eden-launch').click();
 const draft=page.locator('#eden-command'),answers=page.locator('.eden-message[aria-label="Eden"]');
 async function send(command){
   const previous=await answers.count()?await answers.last().elementHandle():null;
   await draft.fill(command);await draft.press('Enter');
   if(await page.locator('.eden-consent').isVisible()){
     for(const c of await page.locator('.eden-consent input:visible').all())await c.check();
     await page.locator('[data-continue]').click();
   }
   await page.waitForFunction(prior=>{
     const rows=document.querySelectorAll('.eden-message[aria-label="Eden"]');
     return rows.length && rows[rows.length-1]!==prior;
   },previous,{timeout:12000});
   await previous?.dispose();return answers.last().innerText();
 }
 assert.match(await send('Take me to Give Support'),/page is open/i);
 assert.equal(new URL(page.url()).pathname,'/give');
 assert.match(await send('Take me to For Organizations'),/page is open/i);
 assert.equal(new URL(page.url()).pathname,'/organizations');
 const food=await send('Find food near Harrisburg, Pennsylvania');
 assert.match(food,/search completed/i, 'Confirmed public search: '+await page.locator('#resultsCount').textContent());
 assert.equal(searches.at(-1).category,'food');
 assert.match(await send('Switch to healthcare'),/matching|listed|directory|search/i);
 assert.equal(searches.at(-1).category,'healthcare');
 assert.match(await send('Search within 25 miles'),/matching|listed|directory|search/i);
 assert.equal(Number(await page.locator('#radiusInput').inputValue()),25);
 assert.equal(searches.at(-1).radius_miles,25);
 assert.match(await send('Eden, scroll down to the results'),/in focus/i);
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'listTitle');
 assert.match(await send('Show me where the map is'),/map section is open/i);
 assert.equal(await page.locator('#showSupportMap').getAttribute('aria-expanded'),'true');
 assert.match(await send('Show the list instead of the map'),/results list/i);
 assert.equal(await page.locator('#showSupportMap').getAttribute('aria-expanded'),'false');
 const beforeCorrection=searches.length;
 assert.match(await send('No, I meant Harrisburg, not Berkley.'),/search completed|matching|directory/i);
 assert(searches.length>beforeCorrection);assert.equal(searches.at(-1).category,'healthcare');assert.equal(searches.at(-1).radius_miles,25);
 const beforeAmbiguous=searches.length;
 assert.match(await send('No, I meant Berkley, not Harrisburg.'),/which city and state/i);
 assert.equal(searches.length,beforeAmbiguous);
 assert.deepEqual(unexpected,[]);
 console.log('PASS: donor, organization, food → healthcare, radius, scroll/focus, map/list via actual widget (directory transport fixture; Gemini unavailable).');
}finally{await browser.close();}
