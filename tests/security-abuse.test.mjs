import assert from 'node:assert/strict';import {test} from 'node:test';
import {createPublicProtection,PublicProtectionError,publicAdmissionScript} from '../backend/anonymous-protection.ts';
import {boundedJsonObject} from '../backend/request-safety.ts';
import {handleApi} from '../backend/app.ts';import {DemoRepository} from '../backend/demo.ts';
const request=(headers={})=>new Request('https://ourground.vercel.app/api/v1/resources',{headers});
test('production costly, mutation and private-auth protection fails closed without shared configuration',async()=>{
 let calls=0;const gate=createPublicProtection({NODE_ENV:'production'},async()=>{calls++;throw Error('Unexpected dispatch');});
 for(const action of ['report','resolve','read','auth','logout'])await assert.rejects(gate.admit(action,request()),e=>e.status===503&&e.code==='ABUSE_PROTECTION_UNAVAILABLE');assert.equal(calls,0);
});
test('independent server instances share admission keys and respect report allowance',async()=>{
 const counts=new Map();const fetcher=async(_url,init)=>{const p=JSON.parse(init.body),k=p[3],cap=Number(p[7]),n=counts.get(k)||0;if(n>=cap)return Response.json({result:[0,175]});counts.set(k,n+1);return Response.json({result:[1,0]});};
 const env={VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:'fixture-token'};const a=createPublicProtection(env,fetcher),b=createPublicProtection(env,fetcher),req=request({'x-vercel-forwarded-for':'192.0.2.5'});
 await a.admit('report',req);await b.admit('report',req);await a.admit('report',req);await assert.rejects(b.admit('report',req),e=>e.status===429&&e.retryAfter===175);
 assert.equal(counts.size,1);assert(![...counts.keys()].some(x=>x.includes('192.0.2')||x.includes('{geoapify}')));assert(publicAdmissionScript.includes("redis.call('TIME')"));
});
test('untrusted forwarded headers cannot create new abuse identities and IPv6 privacy addresses share a bucket',async()=>{
 const keys=[];const gate=createPublicProtection({VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:'fixture-token'},async(_u,i)=>{keys.push(JSON.parse(i.body)[3]);return Response.json({result:[1,0]});});
 await gate.admit('auth',request({'x-forwarded-for':'192.0.2.1','x-vercel-forwarded-for':'2001:db8:abcd:42::1'}));await gate.admit('auth',request({'x-forwarded-for':'192.0.2.2','x-vercel-forwarded-for':'2001:db8:abcd:42::2'}));assert.equal(keys[0],keys[1]);
});
test('Redis outages, auth rejection, redirects and malformed responses never bypass protection or leak details',async()=>{
 const env={VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:'fixture-token'};
 for(const run of [async()=>{throw Error('private-url-containing-credential');},async()=>new Response('',{status:401}),async()=>Response.json({result:[1,'bad']}),async()=>Response.json({error:'private details'})]){
  await assert.rejects(createPublicProtection(env,run).admit('resolve',request()),e=>e.status===503&&!e.message.includes('private'));
 }
 for(const raw of ['http://fixture.upstash.io','https://evil.invalid/','https://user:password@fixture.upstash.io/','https://fixture.upstash.io/?token=value'])await assert.rejects(createPublicProtection({...env,UPSTASH_REDIS_REST_URL:raw}).admit('report',request()),PublicProtectionError);
});
test('bounded JSON cancels oversized chunked bodies before consuming remaining data',async()=>{
 let reads=0,cancelled=false;const stream=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
 await assert.rejects(boundedJsonObject(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})),e=>e.status===413);assert(cancelled);assert(reads<=3);
 for(const [body,type,status]of [['{}','text/plain',415],['[1]','application/json',422],['bad','application/json',400]])await assert.rejects(boundedJsonObject(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':type},body})),e=>e.status===status);
});
test('public rate limits carry Retry-After and prevent repository work',async()=>{
 let queries=0;const repo=new DemoRepository();repo.search=async()=>{queries++;return{items:[],total:0};};const deps={repo,allowDemo:false,verifyToken:async()=>null,resolvePlace:async()=>null,publicProtection:{admit:async()=>{throw new PublicProtectionError(429,'RATE_LIMITED','Please wait.',125);}}};
 const r=await handleApi(new Request('https://ourground.vercel.app/api/v1/resources?lat=40&lng=-76'),deps);assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'125');assert.equal(queries,0);assert(r.headers.get('cache-control').includes('no-store'));
});
test('oversized pagination, blank coordinates, cross-origin mutations and unknown report fields are rejected',async()=>{
 const deps={repo:new DemoRepository(),allowDemo:false,verifyToken:async()=>null,resolvePlace:async()=>null};
 for(const path of ['resources?lat=40&lng=-76&page=101','resources?lat=&lng=-76','resources?lat=40&lng=-76&page=1.1'])assert.equal((await handleApi(new Request('http://localhost/api/v1/'+path),deps)).status,422);
 const r=await handleApi(new Request('https://ourground.vercel.app/api/v1/correction-reports',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'}),deps);assert.equal(r.status,403);
 const m=await handleApi(new Request('http://localhost/api/v1/correction-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:'11111111-1111-4111-8111-111111111111',reason_code:'other',role:'admin'})}),deps);assert.equal(m.status,422);
});

test('slow or aborted request streams are cancelled within their read deadline',async()=>{
 let cancelled=false;const keepAlive=setTimeout(()=>{},100);
 try{const stream=new ReadableStream({cancel(){cancelled=true;}});await assert.rejects(boundedJsonObject(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'}),true,5),e=>e.status===408);assert(cancelled);}finally{clearTimeout(keepAlive);}
 const controller=new AbortController();let stopped=false;const stream=new ReadableStream({cancel(){stopped=true;}});setTimeout(()=>controller.abort(),5);await assert.rejects(boundedJsonObject(new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half',signal:controller.signal})),e=>e.status===408);assert(stopped);
});

test('a location-only budget configuration error cannot disable unrelated protected reads',async()=>{
 let calls=0;const gate=createPublicProtection({NODE_ENV:'production',GEOAPIFY_LOCATION_DAILY_BUDGET:'500',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'REPLACE_ME_TEST_TOKEN'},async()=>{calls++;return Response.json({result:[1,0]});});
 const request=new Request('https://example.invalid/api/v1/resources');await gate.admit('read',request);assert.equal(calls,1);await assert.rejects(gate.admit('location',request),error=>error.status===503);assert.equal(calls,1);
});

test('public provider origin checks remain exact and independent of organization Auth configuration',async()=>{
 const allowed='http://127.0.0.1:18428',deps={allowedOrigins:new Set([allowed]),locations:{suggest:async()=>({suggestions:[],attribution:'Geoapify'}),status:()=>({configured:true,provider:'geoapify',maxSuggestions:5})}};
 const request=origin=>new Request('http://127.0.0.1:18793/api/v1/locations/suggest',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({q:'Boston',sessionToken:'12345678-1234-4234-8234-123456789abc'})});
 assert.equal((await handleApi(request(allowed),deps)).status,200);assert.equal((await handleApi(request('https://attacker.invalid'),deps)).status,403);
});
