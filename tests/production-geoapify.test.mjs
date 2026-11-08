import test from 'node:test';
import assert from 'node:assert/strict';
import {geoCity,geoFeature} from './geoapify-fixtures.mjs';

test('Production environment reaches Redis through the real API entrypoint and returns complete JSON',async()=>{
  Object.assign(process.env,{VERCEL:'1',NODE_ENV:'production',BACKEND_DATA_MODE:'disabled',GEOAPIFY_ENABLED:'true',GEOAPIFY_LIVE_APPROVED:'true',GEOAPIFY_SERVER_API_KEY:'private-server-fixture',UPSTASH_REDIS_REST_URL:'https://runtime-fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'private-redis-fixture'});
  const oldFetch=globalThis.fetch,oldLog=console.error;
  const calls=[],logs=[];let admission=[1,0];
  console.error=value=>logs.push(JSON.parse(value));
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);calls.push(u.hostname);
    if(u.hostname==='runtime-fixture.upstash.io') {
      assert.equal(init.headers.Authorization,'Bearer private-redis-fixture');
      const command=JSON.parse(init.body);assert.equal(command[0],'EVAL');
      assert.equal(command[2],'2');assert.match(command[3],/^ourground:\{geoapify\}:client:[a-f0-9]{64}$/);
      return Response.json({result:admission});
    }
    assert.equal(u.hostname,'api.geoapify.com');assert.equal(u.searchParams.get('apiKey'),'private-server-fixture');
    return Response.json(u.pathname.includes('geocode')?{results:[geoCity()]}:{features:[geoFeature()]});
  };
  try {
    const {GET}=await import('../api/index.ts');
    const status=await GET(new Request('https://local/api/index?path=geoapify/status'));
    assert.deepEqual(await status.json(),{enabled:true,provider:'geoapify'});
    const request=()=>new Request('https://local/api/index?path=geoapify/places&q=Harrisburg&term=food_assistance&radius_miles=10',{headers:{'x-vercel-forwarded-for':'192.0.2.1'}});
    let response=await GET(request());assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);
    const body=await response.json();assert.equal(body.status,'results');assert.equal(body.items.length,1);
    assert.equal(calls.filter(h=>h==='runtime-fixture.upstash.io').length,3);assert.equal(calls.filter(h=>h==='api.geoapify.com').length,2);
    calls.length=0;admission=[0,37];response=await GET(request());
    assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'37');
    assert.equal((await response.json()).error.code,'SHARED_DISCOVERY_LIMIT');assert.deepEqual(calls,['runtime-fixture.upstash.io']);
    calls.length=0;delete process.env.UPSTASH_REDIS_REST_TOKEN;response=await GET(request());
    assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');
    assert.equal((await response.json()).error.code,'DISCOVERY_PROTECTION_UNAVAILABLE');assert.deepEqual(calls,[]);
    assert.deepEqual(logs,[{event:'discovery_protection_failure',reason:'CONFIG_MISSING',operation:'search'}]);
  }finally{globalThis.fetch=oldFetch;console.error=oldLog;}
});
