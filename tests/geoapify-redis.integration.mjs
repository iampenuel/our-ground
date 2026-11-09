// Physical Redis verification only. Every test uses a unique cluster hash tag.
// Hosted verification is explicit, capped at 12 REST commands, and never reads
// or changes the application's ordinary production namespace.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createDiscoveryLimiter} from '../backend/geoapify-limits.ts';
import {handleGeoapify} from '../backend/geoapify-api.ts';

const port=process.env.SECURITY_REDIS_PORT,hosted=process.env.GEOAPIFY_REDIS_HOSTED_VERIFY==='true';
if(!port&&!hosted)throw Error('Set SECURITY_REDIS_PORT for disposable loopback Redis, or explicitly enable GEOAPIFY_REDIS_HOSTED_VERIFY=true with existing hosted credentials.');
if(port&&(!/^\d+$/.test(port)||+port<1024||+port>65535))throw Error('Invalid isolated loopback Redis port.');
const run=promisify(execFile),cli=process.env.SECURITY_REDIS_CLI??'/opt/homebrew/opt/redis/bin/redis-cli';
async function localCommand(body){const {stdout}=await run(cli,['-h','127.0.0.1','-p',port,'--json',...body.map(String)],{timeout:5000,maxBuffer:1024*1024});return JSON.parse(stdout);}
const localEnv={VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:randomUUID()};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function isolated(command,env={}){
 const prefix='ourground:{phase7dverify-'+randomUUID()+'}',clients=new Set();let calls=0;
 const transport=async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body[0],'EVAL');assert.equal(Number(body[2]),2);
  assert.match(body[3],/^ourground:\{geoapify\}:client:[a-f0-9]{64}$/);assert.equal(body[4],'ourground:{geoapify}');
  body[3]=prefix+':client:'+body[3].split(':').at(-1);body[4]=prefix;clients.add(body[3]);calls++;
  return Response.json({result:await command(body)});
 };
 return {prefix,clients,get calls(){return calls;},a:createDiscoveryLimiter({...localEnv,...env},transport),b:createDiscoveryLimiter({...localEnv,...env},transport)};
}
async function counters(command,scope,start){
 const script=`local now=tonumber(redis.call('TIME')[1]); local start=tonumber(ARGV[1]); if now-start>120 or now<start then return redis.error_reply('verification time window exceeded') end
 local total=0; for i=2,#KEYS do for m=math.floor(start/60),math.floor(now/60) do total=total+tonumber(redis.call('GET',KEYS[i]..':provider:'..m) or '0') end end
 local day=math.floor(now/86400); return {tonumber(redis.call('GET',KEYS[1]..':day:'..day) or '0'),tonumber(redis.call('GET',KEYS[1]..':warning:'..day) or '0'),total}`;
 return command(['EVAL',script,String(scope.clients.size+1),scope.prefix,...scope.clients,String(start)]);
}
async function cleanup(command,scope,start){
 if(start===undefined)return;
 const script=`local now=tonumber(redis.call('TIME')[1]); local start=tonumber(ARGV[1]); if now-start>120 or now<start then return redis.error_reply('verification time window exceeded') end
 local n=0; for d=math.floor(start/86400),math.floor(now/86400) do n=n+redis.call('DEL',KEYS[1]..':day:'..d,KEYS[1]..':warning:'..d) end
 for sec=start,now do n=n+redis.call('DEL',KEYS[1]..':second:'..sec) end
 for i=2,#KEYS do for m=math.floor(start/60),math.floor(now/60) do n=n+redis.call('DEL',KEYS[i]..':provider:'..m,KEYS[i]..':search:'..m) end end return n`;
 return command(['EVAL',script,String(scope.clients.size+1),scope.prefix,...scope.clients,String(start)]);
}
function checkBlocked(results){const blocked=results.filter(x=>x.status==='rejected');assert(blocked.length>0);for(const r of blocked){assert.equal(r.reason.status,429);assert(Number.isInteger(r.reason.retryAfter)&&r.reason.retryAfter>=1&&r.reason.retryAfter<=86400);}return blocked;}
async function freshSecond(){let time=await localCommand(['TIME']);if(Number(time[1])>200000){await pause(1050-Number(time[1])/1000);time=await localCommand(['TIME']);}return time;}

test('physical Redis preserves the 200/day default across two instances and concurrent reservations',{skip:!port},async()=>{
 const scope=isolated(localCommand),[seconds]=await freshSecond(),day=Math.floor(Number(seconds)/86400);
 try{
  await localCommand(['SET',scope.prefix+':day:'+day,198,'EX',120]);
  const results=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?scope.a:scope.b).provider('192.0.2.'+(i+1))));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);assert.equal(checkBlocked(results).length,10);
  const counts=await counters(localCommand,scope,Number(seconds));assert.deepEqual(counts,[200,199,2]);
 }finally{await cleanup(localCommand,scope,Number(seconds));}
});
test('physical Redis preserves 2/second and 12/provider-client limits without partial increments',{skip:!port},async()=>{
 const scope=isolated(localCommand),[seconds]=await freshSecond();
 try{
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>(i%2?scope.a:scope.b).provider('192.0.2.20')));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);assert.equal(checkBlocked(results).length,4);
  let counts=await counters(localCommand,scope,Number(seconds));assert.equal(counts[0],2);assert.equal(counts[2],2);
  await pause(1100);const client=[...scope.clients][0];const [current]=await localCommand(['TIME']);
  await localCommand(['SET',client+':provider:'+Math.floor(Number(current)/60),12,'EX',120]);
  await assert.rejects(scope.b.provider('192.0.2.20'),e=>e.status===429&&e.retryAfter>0);
  counts=await counters(localCommand,scope,Number(seconds));assert.equal(counts[0],2);assert.equal(counts[2],12);
  assert.equal(await localCommand(['GET',scope.prefix+':second:'+current]),null);
 }finally{await cleanup(localCommand,scope,Number(seconds));}
});
test('physical Redis preserves shared six-search client admission without spending provider budget',{skip:!port},async()=>{
 const scope=isolated(localCommand),[seconds]=await localCommand(['TIME']);
 try{
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?scope.a:scope.b).search('192.0.2.30')));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,6);assert.equal(checkBlocked(results).length,2);
  assert.deepEqual(await counters(localCommand,scope,Number(seconds)),[0,0,0]);
 }finally{await cleanup(localCommand,scope,Number(seconds));}
});
test('physical Redis enforces a lower configured daily cap and immutable aggregate warning',{skip:!port},async()=>{
 const scope=isolated(localCommand,{GEOAPIFY_SERVER_DAILY_BUDGET:'3',GEOAPIFY_SERVER_WARNING_PERCENT:'80'}),[seconds]=await localCommand(['TIME']);
 try{
  await scope.a.provider('192.0.2.40');assert.deepEqual(await counters(localCommand,scope,Number(seconds)),[1,0,1]);
  await scope.b.provider('192.0.2.41');assert.deepEqual(await counters(localCommand,scope,Number(seconds)),[2,2,2]);
  await pause(1100);await scope.a.provider('192.0.2.40');
  const results=await Promise.allSettled([scope.b.provider('192.0.2.41'),scope.a.provider('192.0.2.40'),scope.b.provider('192.0.2.42')]);assert.equal(checkBlocked(results).length,3);
  assert.deepEqual(await counters(localCommand,scope,Number(seconds)),[3,2,3]);
  assert.equal(scope.calls,6);
 }finally{await cleanup(localCommand,scope,Number(seconds));}
});
test('hosted isolated algorithm uses the configured cap across two instances within twelve REST commands',{skip:!hosted},async()=>{
 const env={...process.env,VERCEL:'1',GEOAPIFY_SERVER_DAILY_BUDGET:'3',GEOAPIFY_SERVER_WARNING_PERCENT:'80'};
 assert(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN,'Existing hosted Redis credentials are required; do not put secrets in the command or output.');
 let requests=0,start;const command=async body=>{
  if(requests>=12)throw Error('Hosted verification REST budget exhausted');requests++;
  const response=await fetch(env.UPSTASH_REDIS_REST_URL,{method:'POST',headers:{Authorization:'Bearer '+env.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw Error('Hosted isolated Redis verification failed safely');const data=await response.json();if(data.error)throw Error('Hosted isolated Redis command rejected');return data.result;
 };
 const scope=isolated(command,env);let removed=0;
 try{
  const time=await command(['TIME']);start=Number(time[0]);assert(start%86400<86370,'Run outside the daily rollover window.');
  await scope.a.provider('192.0.2.50');await scope.b.provider('192.0.2.51');await pause(1100);await scope.a.provider('192.0.2.50');
  const blocked=await Promise.allSettled([scope.b.provider('192.0.2.51'),scope.a.provider('192.0.2.50'),scope.b.provider('192.0.2.51')]);const denied=checkBlocked(blocked);assert.equal(denied.length,3);
  assert.deepEqual(await counters(command,scope,start),[3,2,3]);
  const response=await handleGeoapify(new Request('https://fixture.invalid/api/v1/geoapify/places?q=Harrisburg'),'/geoapify/places',{search:async()=>{throw denied[0].reason;}});
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),String(denied[0].reason.retryAfter));
  console.log(JSON.stringify({event:'phase7d_hosted_isolated_redis',allowed:3,blocked:3,aggregate_reservations:3,warning_first_recorded_at:2,http_status:429,retry_after_seconds:denied[0].reason.retryAfter,geoapify_requests:0,production_keys_accessed:0}));
 }finally{
  removed=await cleanup(command,scope,start);console.log(JSON.stringify({event:'phase7d_hosted_isolated_redis_cleanup',rest_commands:requests,isolated_keys_removed:removed,geoapify_requests:0}));assert(requests<=12);
 }
});
