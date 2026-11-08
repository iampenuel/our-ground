import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {adultGate} from '../backend/adult-access.ts';
const config={ADULT_SESSION_SECRET: randomBytes(32).toString('base64url')};
const origin='https://protected.example';
const req=(path,init={})=>new Request(origin+path,init);
test('anonymous and fabricated visitors cannot load a directory, reach a provider, or post a correction',async()=>{
 const page=await adultGate(req('/support?resource=listed'),config);
 assert.match(await page.text(),/For adults 19 and older/);
 for(const endpoint of ['status','session','speech','live/token','live/tool']){
   const res=await adultGate(req('/api/v1/eden/'+endpoint,{method:'POST',headers:{cookie:'__Host-og-adult=true'}}),config);
   assert.equal(res.status,403);
 }
 const report=req('/api/index?path=correction-reports',{method:'POST',body:'private'});
 assert.equal((await adultGate(report,config)).status,403);assert.equal(report.bodyUsed,false);
});
test('the session remembers age decisions, rejects forgeries and preserves a deep link',async()=>{
 const post=(age,from=origin,cookie='')=>req('/eligibility',{method:'POST',headers:{origin:from,cookie},body:new URLSearchParams({age,return:'/support?resource=listed'})});
 assert.equal((await adultGate(post('19plus','https://other.example'),config)).status,403);
 const declined=await adultGate(post('under19'),config);
 assert.equal(declined.status,403);const deniedCookie=declined.headers.get('set-cookie').split(';')[0];
 assert.equal((await adultGate(post('19plus',origin,deniedCookie),config)).status,403);
 assert.equal((await adultGate(req('/api/v1/eden/live/token',{headers:{cookie:deniedCookie}}),config)).status,403);
 const pass=await adultGate(post('19plus'),config);assert.equal(pass.status,303);
 assert.equal(pass.headers.get('location'),origin+'/support?resource=listed');
 const header=pass.headers.get('set-cookie');assert.match(header,/HttpOnly; Secure; SameSite=Strict/);
 assert.doesNotMatch(header,/Max-Age|Expires=/);const cookie=header.split(';')[0],path='/api/v1/eden/live/token';
 assert.equal(await adultGate(req(path,{headers:{cookie}}),config),null);
 assert.equal((await adultGate(new Request('https://other.example'+path,{headers:{cookie}}),config)).status,403);
 assert.equal((await adultGate(req(path,{headers:{cookie:cookie.replace(/19plus\.\d+/, '19plus.1')}}),config)).status,403);
});
test('protected staging serves discovery and OAuth independently of Eden; private intake and every Eden transport still require signed age',async()=>{
 const stage={STAGING_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_eU9xRSetSQYTbkAce2cYIR5zx8c2'};
 for(const path of ['/','/support','/give','/organizations','/about','/auth/callback','/account','/api/index?path=resources/search'])assert.equal(await adultGate(req(path),stage),null,path);
 for(const path of ['/api/v1/eden/hosted/session','/api/index?path=eden/hosted/result','/api/index?path=correction-reports'])assert.equal((await adultGate(req(path,{method:'POST'}),stage)).status,403,path);
 const headers={Accept:'application/json',Origin:origin};
 assert.deepEqual(await (await adultGate(req('/eligibility',{headers}),stage)).json(),{eligible:false,denied:false});
 const pass=await adultGate(req('/eligibility',{headers,method:'POST',body:new URLSearchParams({age:'19plus'})}),stage);
 assert.deepEqual(await pass.json(),{eligible:true,denied:false});
 const cookie=pass.headers.get('set-cookie').split(';')[0];
 assert.deepEqual(await (await adultGate(req('/eligibility',{headers:{...headers,cookie}}),stage)).json(),{eligible:true,denied:false});
 assert.equal(await adultGate(req('/api/index?path=eden/hosted/session',{headers:{cookie}}),stage),null);
 for(const cfg of [{...stage,VERCEL_ENV:'production'},{...stage,VERCEL_PROJECT_ID:'unknown'}])assert.match(await (await adultGate(req('/support'),cfg)).text(),/For adults 19 and older/);
});
test('a conflicting path parameter cannot disguise a private API route',async()=>{
 const {publicApiRoute}=await import('../backend/api-route.ts');
 for(const path of ['/api/v1/correction-reports?path=resources/search','/api/index?path=/correction-reports/']) {
  assert.equal(publicApiRoute(new URL(origin+path)),'correction-reports');
  assert.equal((await adultGate(req(path,{method:'POST'}),{...config,localDirectory:true})).status,403);
 }
 assert.equal(publicApiRoute(new URL(origin+'/api/v1/resources/search?path=correction-reports')),'resources/search');
});
