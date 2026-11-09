// A real browser supplies Origin for this form navigation. An HTTP test that
// manually sets Origin cannot detect a policy that suppresses it.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {adultGate} from '../backend/adult-access.ts';
const config={ADULT_SESSION_SECRET:randomBytes(32).toString('base64url'),VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_4li6QnqulPgPbJpxMW2L9hczDNrS',ACCOUNT_RELEASE_MODE:'signin_only'};
let origin,postOrigin,postReferrer;
const server=createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 if(req.method==='POST'){postOrigin=req.headers.origin;postReferrer=req.headers.referer;}
 const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
 const response=await adultGate(request,config)??new Response('Eligible account route');
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const path of ['/','/auth/callback?code=synthetic-browser-test']){
  const context=await browser.newContext();const page=await context.newPage();await page.goto(origin+path);
  await page.getByRole('button',{name:'Yes, I am 19 or older'}).click();
  await page.waitForLoadState();
  assert.equal(postOrigin,origin,'Chrome must send the exact same-origin Origin');
  assert.equal(postReferrer,origin+'/','The form must not send the callback query in its Referer');
  assert.equal(page.url(),origin+path);assert.equal((await page.locator('body').innerText()).trim(),'Eligible account route');
  await context.close();
 }
 console.log('PASS: actual Chrome origin, query-free Referer, age acknowledgment and callback return.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
