// CI uses the real public UI with synthetic, offline transports.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:4199';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
  const touch=width<1000;
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce'});
  const page=await context.newPage();
  let searches=0;
  const point={label:'Seattle, WA',publicQuery:'Seattle, WA',state:'WA',latitude:47.6,longitude:-122.3,source:'reference',precision:'locality'};
  await page.route('**/api/v1/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let result={};
   if(path.endsWith('/locations/status'))result={configured:false,referenceConfigured:true};
   if(path.endsWith('/geoapify/status'))result={enabled:false};
   if(path.endsWith('/locations/suggest'))result={suggestions:[],notice:'No suggestions. Press Search to continue.'};
   if(path.endsWith('/locations/resolve'))result={status:'resolved',location:point};
   if(path.endsWith('/resources/search')){searches++;assert.equal(route.request().postDataJSON().category,'community');result={items:[],total:0,page:1,page_size:20,has_next:false};}
   await route.fulfill({json:result});
  });
  await page.goto(base+'/organizations');await page.getByText(/New organization accounts and editing access are currently closed/).waitFor();
  await page.getByRole('link',{name:/Find your public listing/}).click();
  await page.locator('[data-category="community"]').click();
  const input=page.locator('#locationInput');await input.fill('Seattle, WA');
  await page.locator('#locationStatus').filter({hasText:/./}).waitFor();
  const button=page.locator('#supportSubmit');
  if(touch)await button.tap();else await input.press('Enter');
  await page.getByRole('link',{name:/Find housing counseling/}).waitFor();
  assert.equal(searches,1);assert(await page.locator('[data-category="community"]').getAttribute('aria-pressed')==='true');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goBack();assert.equal(new URL(page.url()).pathname,'/support');
  await page.goBack();await page.getByRole('heading',{name:/Local knowledge/}).waitFor();
  await context.close(); console.log(width+'px: first submission, one search, community referrals and back passed');
 }
}finally{await browser.close();}
