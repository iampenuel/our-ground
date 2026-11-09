import assert from 'node:assert/strict';
import {test} from 'node:test';
import {apiRequest,BackendError} from '../src/api-client.ts';

const failure=(retry,status=429)=>new Response(JSON.stringify({error:{code:'RATE_LIMITED',message:'Too many requests. Please wait before trying again.'}}),{status,headers:{'Content-Type':'application/json',...(retry===null?{}:{'Retry-After':retry}),'X-Private-Diagnostic':'must not be retained'}});
async function withResponse(response,verify){const original=globalThis.fetch;globalThis.fetch=async()=>response;try{await verify();}finally{globalThis.fetch=original;}}

test('API failures retain bounded Retry-After delta seconds and structured status/code without arbitrary headers',async()=>{
 await withResponse(failure('23'),()=>assert.rejects(apiRequest('locations/suggest'),error=>{
 assert(error instanceof BackendError);assert.equal(error.status,429);assert.equal(error.code,'RATE_LIMITED');assert.equal(error.retryAfterSeconds,23);assert.equal(error.headers,undefined);assert(!JSON.stringify(error).includes('must not be retained'));return true;}));
});

test('API failures retain HTTP-date retry timing, including elapsed dates',async()=>{
 const original=Date.now,now=1760000000000;Date.now=()=>now;
 try{for(const [offset,seconds] of [[30000,30],[-30000,0]])await withResponse(failure(new Date(now+offset).toUTCString()),()=>assert.rejects(apiRequest('locations/suggest'),error=>error.retryAfterSeconds===seconds));}
 finally{Date.now=original;}
});

test('malformed and unbounded Retry-After values are ignored rather than creating an unsafe cooldown',async()=>{
 for(const value of [null,'-1','1.5','NaN','Infinity','999999999999','not-a-date','2026-11-05'])await withResponse(failure(value),()=>assert.rejects(apiRequest('locations/suggest'),error=>error.retryAfterSeconds===undefined));
});

test('non-JSON rate-limit responses still retain safe retry timing',async()=>{
 await withResponse(new Response('unavailable',{status:429,headers:{'Retry-After':'5'}}),()=>assert.rejects(apiRequest('locations/suggest'),error=>error.status===429&&error.code==='INVALID_RESPONSE'&&error.retryAfterSeconds===5));
});

test('legacy resolver respects Retry-After across city changes without blocking directory reads or storing queries',async()=>{
 const fetcher=globalThis.fetch,clock=Date.now;let now=clock(),calls=0;
 Date.now=()=>now;globalThis.fetch=async()=>{calls++;return calls===1?failure('30'):Response.json({ok:true});};
 try{await assert.rejects(apiRequest('places/resolve?q=Harrisburg'),{status:429});
   await assert.rejects(apiRequest('places/resolve?q=Philadelphia'),{status:429});assert.equal(calls,1);
   assert.deepEqual(await apiRequest('places/directory-city?city=harrisburg-pa'),{ok:true});now+=31000;
   assert.deepEqual(await apiRequest('places/resolve?q=Philadelphia'),{ok:true});assert.equal(calls,3);
 }finally{Date.now=clock;globalThis.fetch=fetcher;}
});
