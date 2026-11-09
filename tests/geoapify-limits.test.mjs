import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryLimiter,clientNetwork,DiscoveryLimitError} from '../backend/geoapify-limits.ts';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {handleGeoapify} from '../backend/geoapify-api.ts';
import {publicEnvironmentProblems} from '../backend/env-boundary.mjs';
import {geoTestEnv,geoCity,geoFeature} from './geoapify-fixtures.mjs';
const redisEnv={VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-private-token'};
const input={query:'Harrisburg',term:'food_assistance',radiusMiles:10};
test('protection failures have safe evidence-based reason codes and never call Geoapify',async()=>{
 const logs=[],oldLog=console.error;console.error=line=>logs.push(JSON.parse(line));
 try {
  const cases=[
   [{VERCEL:'1'},null,'CONFIG_MISSING'],
   [{...redisEnv,UPSTASH_REDIS_REST_URL:'https://example.upstash.io/invalid'},null,'URL_INVALID'],
   [{...redisEnv,UPSTASH_REDIS_REST_TOKEN:'bad\ntoken'},null,'TOKEN_INVALID'],
   [redisEnv,()=>new Response('',{status:401}),'REDIS_AUTH_REJECTED'],
   [redisEnv,()=>new Response('',{status:403}),'REDIS_AUTH_REJECTED'],
   [redisEnv,()=>Response.json({error:'private provider error'}),'REDIS_COMMAND_REJECTED'],
   [redisEnv,()=>Response.json(null),'REDIS_RESPONSE_INVALID'],
   [redisEnv,()=>new Response('not json'),'REDIS_RESPONSE_INVALID'],
   [redisEnv,()=>Response.json({result:[1,-1]}),'REDIS_RESPONSE_INVALID'],
   [redisEnv,()=>{throw Error('private endpoint/token')},'REDIS_NETWORK_ERROR']
  ];
  for(const [env,reply,reason] of cases){
   let outbound=0,redisCalls=0;
   const p=createGeoapifyProvider({env:{...geoTestEnv,...env},redisFetch:async()=>{redisCalls++;assert(reply);return reply();},fetcher:async()=>{outbound++;throw Error('must not call');}});
   const r=await handleGeoapify(new Request('https://local/api/v1/geoapify/places?q=Harrisburg'),'/geoapify/places',p);
   assert.equal(r.status,503);assert.equal(r.headers.get('retry-after'),'60');assert.equal((await r.json()).error.code,'DISCOVERY_PROTECTION_UNAVAILABLE');
   assert.equal(outbound,0);assert.equal(redisCalls,reply?1:0);assert.equal(logs.at(-1).reason,reason);
  }
  assert(!JSON.stringify(logs).includes('private'));assert(!JSON.stringify(logs).includes('upstash.io'));
 }finally{console.error=oldLog;}
});
test('the actual 2500ms Redis deadline and caller cancellation fail closed without retries',async()=>{
 const logs=[],oldLog=console.error;console.error=line=>logs.push(JSON.parse(line));
 let outbound=0,redisCalls=0;
 const p=createGeoapifyProvider({env:{...geoTestEnv,...redisEnv},redisFetch:async(_url,init)=>{
  redisCalls++;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
 },fetcher:async()=>{outbound++;throw Error('must not call');}});
 const keepAlive=setTimeout(()=>{},4000);
 try {
  await assert.rejects(p.search(input),{status:503});assert.equal(logs.at(-1).reason,'REDIS_TIMEOUT');assert.equal(redisCalls,1);assert.equal(outbound,0);
  const controller=new AbortController();controller.abort();
  await assert.rejects(p.search(input,controller.signal),{status:503});assert.equal(logs.at(-1).reason,'REQUEST_CANCELLED');assert.equal(redisCalls,1);assert.equal(outbound,0);
 }finally{clearTimeout(keepAlive);console.error=oldLog;}
});
test('two limiter instances share deterministic Redis admission instead of instance counters',async()=>{
 const counts=new Map();
 const redis=async(_url,init)=>{
  const c=JSON.parse(init.body),key=c[3]+':'+c[5],count=counts.get(key)??0;
  if(count>=6)return Response.json({result:[0,30]});counts.set(key,count+1);return Response.json({result:[1,0]});
 };
 const a=createDiscoveryLimiter(redisEnv,redis),b=createDiscoveryLimiter(redisEnv,redis);
 const outcomes=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?a:b).search('192.0.2.1')));
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,6);
 assert(outcomes.filter(o=>o.status==='rejected').every(o=>o.reason.status===429));
 assert.equal(counts.size,1);
});
test('Redis is mandatory in production and configured local mode; no retry or credential leakage',async()=>{
 for(const env of [{NODE_ENV:'production'},{VERCEL:'1'}, {...redisEnv,UPSTASH_REDIS_REST_TOKEN:''}])await assert.rejects(createDiscoveryLimiter(env).provider(),{status:503});
 for(const fetcher of [async()=>{throw Error('secret-url-and-token')},async()=>Response.json({error:'secret-error'}),async()=>Response.json({result:[true,0]}),async()=>new Response('',{status:503})]) {
  let calls=0;const l=createDiscoveryLimiter(redisEnv,async(...args)=>{calls++;return fetcher(...args)});
  await assert.rejects(l.provider('1.2.3.4'),e=>e.status===503&&!e.message.includes('secret'));assert.equal(calls,1);
 }
 await createDiscoveryLimiter({}).provider();
});
test('client identities normalize IPv4/IPv6, aggregate /64 and do not trust lists',()=>{
 assert.equal(clientNetwork('1.2.3.4'),'1.2.3.4');assert.equal(clientNetwork('::ffff:102:304'),'1.2.3.4');
 assert.equal(clientNetwork('2001:db8:1234:5678::1'),clientNetwork('2001:db8:1234:5678:abcd::2'));
 for(const value of ['',undefined,'garbage','1.2.3.4, 5.6.7.8','999.1.2.3'])assert.equal(clientNetwork(value),'unknown');
});
test('every geocode and Places call reserves a shared permit, including cache-hit search admission',async()=>{
 const kinds=[];let providerCalls=0;
 const p=createGeoapifyProvider({env:{...geoTestEnv,...redisEnv},redisFetch:async(url,init)=>{assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');const c=JSON.parse(init.body);assert.equal(c[0],'EVAL');assert(!c[4].includes('1.2.3.4'));kinds.push(c[5]);return Response.json({result:[1,0]});},fetcher:async url=>{providerCalls++;return Response.json(String(url).includes('geocode')?{results:[geoCity()]}:{features:[geoFeature()]})}});
 await p.search(input,undefined,'1.2.3.4');await p.search(input,undefined,'1.2.3.4');
 assert.deepEqual(kinds,['search','provider','provider','search']);assert.equal(providerCalls,2);
});
test('Redis rejection/failure blocks outbound Geoapify, and HTTP 429 includes Retry-After',async()=>{
 for(const status of [429,503]){
  let outbound=0;const p=createGeoapifyProvider({env:{...geoTestEnv,...redisEnv},redisFetch:async()=>status===429?Response.json({result:[0,37]}):new Response('',{status:503}),fetcher:async()=>{outbound++;throw Error('must not call')}});
  const r=await handleGeoapify(new Request('https://local/api/v1/geoapify/places?q=Harrisburg',{headers:{'x-vercel-forwarded-for':'1.2.3.4'}}),'/geoapify/places',p);
  assert.equal(r.status,status);assert.equal(outbound,0);assert.equal(r.headers.get('cache-control'),'no-store');
  if(status===429)assert.equal(r.headers.get('retry-after'),'37');
 }
});
test('Redis failure between geocode and Places cannot bypass protection',async()=>{
 let redis=0,outbound=0;const p=createGeoapifyProvider({env:{...geoTestEnv,...redisEnv},redisFetch:async()=>++redis===3?new Response('',{status:503}):Response.json({result:[1,0]}),fetcher:async()=>{outbound++;return Response.json({results:[geoCity()]})}});
 await assert.rejects(p.search(input),{status:503});assert.equal(outbound,1);
});
test('Redis URL/token are rejected under browser names or copied into unrelated VITE values',()=>{
 for(const name of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) {
  assert(publicEnvironmentProblems({['VITE_'+name]:'private-value'}).length);
  assert(publicEnvironmentProblems({[name]:'private-value',VITE_OTHER:'private-value'}).length);
 }
});
test('explicit disabled data mode rejects directory/auth actions and cannot return demo records',async()=>{
 const {productionDependencies}=await import('../backend/runtime.ts');const {handleApi}=await import('../backend/app.ts');
 const old=process.env.BACKEND_DATA_MODE;process.env.BACKEND_DATA_MODE='disabled';
 try {
  const deps=productionDependencies();assert.equal(deps.allowDemo,false);
  for(const path of ['/resources?lat=40.27&lng=-76.88','/resources/11111111-1111-4111-8111-111111111111']) {
   const response=await handleApi(new Request('https://local/api/v1'+path),deps);assert.equal(response.status,503);
  }
  await assert.rejects(deps.verifyToken('arbitrary'),{code:'AUTH_NOT_CONFIGURED'});
  await assert.rejects(deps.repo.createReport({}),{code:'DIRECTORY_NOT_CONFIGURED'});
 }finally{if(old===undefined)delete process.env.BACKEND_DATA_MODE;else process.env.BACKEND_DATA_MODE=old;}
});
