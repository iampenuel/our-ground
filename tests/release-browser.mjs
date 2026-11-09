// CI uses the real public UI with synthetic, offline transports.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.RELEASE_BROWSER_BASE ?? 'http://127.0.0.1:4199';
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
  await page.goto(base+'/');
  const hero=page.locator('.og-home-hero'),actions=hero.locator('.og-hero-actions');
  await hero.waitFor();
  assert.equal(await hero.getByRole('heading',{level:1}).innerText(),'Stronger\ncommunities\ngrow here.');
  assert.deepEqual(await actions.getByRole('link').evaluateAll(links=>links.map(link=>new URL(link.href).pathname)),['/support','/give']);
  assert.deepEqual(await hero.locator('.og-hero-values span').allTextContents(),['People','Places','Possibilities']);
  assert.equal(await page.locator('.og-community,.og-pathways,#community-title').count(),0);
  assert(await page.evaluate(()=>{
    const hero=document.querySelector('.og-home-hero'),main=hero.parentElement,footer=document.querySelector('.og-home > .og-footer');
    return main.children.length===1&&main.nextElementSibling===footer&&Math.abs(footer.getBoundingClientRect().top-hero.getBoundingClientRect().bottom)<=1;
  }),'The existing footer must follow the hero without a replacement section or gap');
  assert.deepEqual(await page.locator('.og-footer nav').getByRole('link').evaluateAll(links=>links.slice(0,3).map(link=>new URL(link.href).pathname)),['/support','/give','/organizations']);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await actions.getByRole('link',{name:'Find support near you'}).focus();
  await page.keyboard.press('Tab');
  assert(await actions.getByRole('link',{name:'Give support',exact:true}).evaluate(link=>link===document.activeElement));
  await page.keyboard.press('Tab');
  assert(await page.locator('.og-footer .og-brand').evaluate(link=>link===document.activeElement),'Hero keyboard flow must continue into the footer');
  for(const href of ['/support','/give','/organizations']){
    const menu=page.locator('.og-mobile-menu');
    if(await menu.isVisible())await menu.locator('summary').click();
    const navigation=page.locator('header nav:visible');
    assert.deepEqual(await navigation.getByRole('link').evaluateAll(links=>links.slice(0,3).map(link=>new URL(link.href).pathname)),['/support','/give','/organizations']);
    await navigation.locator('a[href="'+href+'"]').click();
    await page.waitForURL(url=>url.pathname===href);await hero.waitFor({state:'detached'});
    await page.locator('main h1').waitFor();assert.equal(new URL(page.url()).pathname,href);
    await page.locator('header .og-brand').click();await hero.waitFor();
  }
  await actions.getByRole('link',{name:'Find support near you'}).click();
  await page.locator('#locationInput').waitFor();assert.equal(new URL(page.url()).pathname,'/support');
  await page.locator('header .og-brand').click();await hero.waitFor();
  await actions.getByRole('link',{name:'Give support',exact:true}).click();
  await page.getByRole('link',{name:'Explore ways to give'}).click();
  assert.equal(new URL(page.url()).hash,'#ways-to-give');
  assert.deepEqual(await page.locator('#main a[rel~="external"]').evaluateAll(links=>links.map(link=>link.href)),[
    'https://www.feedingamerica.org/take-action/volunteer',
    'https://www.feedingamerica.org/ways-to-give/food-donations',
    'https://www.feedingamerica.org/ways-to-give',
  ]);
  await page.goto(base+'/organizations');
  await page.getByRole('link',{name:'Organization sign in',exact:true}).click();
  await page.locator('#accountStatus').filter({hasText:/unavailable/}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/account');
  assert(await page.locator('#accountWorkspace').isHidden());
  await page.goBack();
  await page.getByRole('link',{name:'Request access',exact:true}).click();
  await page.getByRole('link',{name:'Start an access request'}).click();
  await page.locator('#accountStatus').filter({hasText:/unavailable/}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('intent'),'request');
  await page.goBack();
  await page.getByRole('heading',{name:'Request listing access.'}).waitFor();
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
  await page.goBack();await page.getByRole('heading',{name:/Care for your.*public listing/i}).waitFor();
  await context.close(); console.log(width+'px: preserved hero, direct footer, audience navigation, donor links, organization sign-in/request, resident search, referrals and back passed');
 }
}finally{await browser.close();}
