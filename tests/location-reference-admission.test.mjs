import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handleApi} from '../backend/app.ts';
import {createPublicProtection,PublicProtectionError} from '../backend/anonymous-protection.ts';

const session='11111111-1111-4111-8111-111111111111';
const token='REPLACE_ME_TEST_REDIS_TOKEN';
const env={NODE_ENV:'production',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:token,GEOAPIFY_LOCATION_DAILY_BUDGET:'33'};
const request=(path,body)=>new Request('https://example.invalid/api/v1/locations/'+path,{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify(body)});
const point={label:'New York, NY',latitude:40.714,longitude:-74.006,source:'reference',state:'NY',publicQuery:'New York, NY'};
function provider(overrides={}){
 return{status:()=>({configured:true,provider:'geoapify',maxSuggestions:5,referenceConfigured:true}),
  suggest:async()=>({suggestions:[],attribution:'U.S. Census Bureau'}),
  retrieve:async()=>({location:point,attribution:'U.S. Census Bureau'}),
  reverse:async()=>({location:point,attribution:''}),
  forward:async()=>({location:point,attribution:''}),...overrides};
}
const dependencies=(locations,publicProtection)=>({locations,publicProtection,repo:{},allowDemo:false});

test('reference admission retains thirty-per-minute abuse protection without charging a provider daily bucket',async()=>{
 const commands=[];
 const gate=createPublicProtection(env,async(_url,init)=>{commands.push(JSON.parse(init.body));return Response.json({result:[1,0]});});
 await gate.admit('location_reference',request('suggest',{q:'new yor',sessionToken:session}));
 await gate.admit('location',request('suggest',{q:'123 Main Street',sessionToken:session}));
 assert.equal(commands.length,2);
 assert.match(commands[0][3],/public-protection\}:location_reference:client:/);
 assert.deepEqual(commands[0].slice(-3),['60','30','0']);
 assert.match(commands[1][3],/public-protection\}:location:client:/);
 assert.deepEqual(commands[1].slice(-3),['60','30','33']);
});

test('local city suggestions and signed Census selection do not consume provider admission',async()=>{
 const actions=[];let lookups=0,selections=0;
 const locations=provider({
  suggest:async()=>{lookups++;return{suggestions:[{id:'census:ny',primary:'New York, NY',secondary:'Census representative city',receipt:'fixture-receipt'}],attribution:'U.S. Census Bureau'};},
  retrieve:async()=>{selections++;return{location:point,attribution:'U.S. Census Bureau'};}
 });
 const protection={admit:async action=>{actions.push(action);if(action==='location')throw new PublicProtectionError(429,'RATE_LIMITED','Provider daily allowance is unavailable.',60);}};
 let res=await handleApi(request('suggest',{q:'new yor',sessionToken:session}),dependencies(locations,protection));
 assert.equal(res.status,200);assert.equal((await res.json()).suggestions[0].primary,'New York, NY');
 res=await handleApi(request('retrieve',{id:'census:ny',sessionToken:session,receipt:'fixture-receipt'}),dependencies(locations,protection));
 assert.equal(res.status,200);assert.equal((await res.json()).location.source,'reference');
 assert.equal(lookups,1);assert.equal(selections,1);assert.deepEqual(actions,['location_reference','location_reference']);
});

for(const failure of ['limited','redis'])test('reference '+failure+' stops lookup and provider work before dispatch',async()=>{
 let referenceCalls=0,redisCalls=0;
 const gate=createPublicProtection(env,async()=>{redisCalls++;return failure==='limited'?Response.json({result:[0,37]}):new Response('',{status:503});});
 const locations=provider({suggest:async()=>{referenceCalls++;assert.fail('Reference lookup must remain protected');}});
 const res=await handleApi(request('suggest',{q:'new yor',sessionToken:session}),dependencies(locations,gate));
 assert.equal(res.status,failure==='limited'?429:503);assert.equal(redisCalls,1);assert.equal(referenceCalls,0);
 const body=await res.json();assert.equal(body.error.code,failure==='limited'?'RATE_LIMITED':'ABUSE_PROTECTION_UNAVAILABLE');
 if(failure==='limited')assert.equal(res.headers.get('Retry-After'),'37');
 assert.match(res.headers.get('Cache-Control'),/no-store/);assert.match(res.headers.get('X-Request-Id'),/^[0-9a-f-]{36}$/);
 assert(!JSON.stringify(body).includes(token));
});

for(const status of [429,503])test('provider admission HTTP'+status+' cannot dispatch Geoapify after protected reference lookup',async()=>{
 const actions=[];let references=0,outbound=0;
 const locations=provider({suggest:async(_q,_session,_signal,_origin,_client,admitProvider)=>{
  references++;await admitProvider();outbound++;return{suggestions:[],attribution:''};
 }});
 const protection={admit:async action=>{
  actions.push(action);
  if(action==='location')throw new PublicProtectionError(status,status===429?'RATE_LIMITED':'ABUSE_PROTECTION_UNAVAILABLE','Protected provider request unavailable.',41);
 }};
 const res=await handleApi(request('suggest',{q:'123 Main Street',sessionToken:session}),dependencies(locations,protection));
 assert.equal(res.status,status);assert.deepEqual(actions,['location_reference','location']);assert.equal(references,1);assert.equal(outbound,0);
 if(status===429)assert.equal(res.headers.get('Retry-After'),'41');
});

test('configured reverse uses reference admission before its actual provider admission; provider receipt retrieval stays read-only',async()=>{
 const actions=[];
 const protection={admit:async action=>{actions.push(action);}};
 const locations=provider({reverse:async(_lat,_lng,_source,_signal,_origin,_client,admitProvider)=>{await admitProvider();return{location:point,attribution:''};}});
 let res=await handleApi(request('reverse',{latitude:40.714,longitude:-74.006,source:'device'}),dependencies(locations,protection));
 assert.equal(res.status,200);assert.deepEqual(actions,['location_reference','location']);
 actions.length=0;
 res=await handleApi(request('retrieve',{id:'provider:ny',sessionToken:session,receipt:'fixture-receipt'}),dependencies(locations,protection));
 assert.equal(res.status,200);assert.deepEqual(actions,['read']);
});

test('unconfigured reverse keeps existing read admission without provider admission',async()=>{
 const actions=[];
 const locations=provider({status:()=>({configured:false,provider:'geoapify',maxSuggestions:5})});
 const res=await handleApi(request('reverse',{latitude:40.714,longitude:-74.006,source:'device'}),dependencies(locations,{admit:async action=>{actions.push(action);}}));
 assert.equal(res.status,200);assert.deepEqual(actions,['read']);
});

