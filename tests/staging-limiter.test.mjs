import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicProtection} from '../backend/anonymous-protection.ts';import {createDiscoveryLimiter,clientNetwork} from '../backend/geoapify-limits.ts';
import {stagingProjectId,stagingClientSlot,requiresStagingAdmission} from '../backend/staging-limiter.ts';
test('designated preview cannot fall back to Redis or local admission if the selector is absent or wrong',async()=>{
 for(const selector of [undefined,'redis','invalid']){
  let sent=0;const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:stagingProjectId,RATE_LIMIT_BACKEND:selector,UPSTASH_REDIS_REST_URL:'https://not-used.upstash.io',UPSTASH_REDIS_REST_TOKEN:'unused-test-token'};
  const network=async()=>{sent++;throw Error('must never contact Redis');};
  await assert.rejects(createPublicProtection(env,network).admit('read',new Request('https://example.test')),e=>e.status===503);
  await assert.rejects(createDiscoveryLimiter(env,network).provider(),e=>e.status===503);assert.equal(sent,0);
 }
 assert(!requiresStagingAdmission({VERCEL:'1',VERCEL_ENV:'production',RATE_LIMIT_BACKEND:'redis'}));
});
test('network variation cannot evade a slot via IPv6 aliases or malformed header lists',()=>{
 const secret='synthetic-test-secret';const f=v=>stagingClientSlot(secret,clientNetwork(v));
 assert.equal(f('2001:db8::2'),f('2001:0db8::99'));assert.equal(f('192.0.2.1'),f('::ffff:c000:201'));assert.equal(f('two,addresses'),f(undefined));assert.ok(f('192.0.2.1')<256);
});
