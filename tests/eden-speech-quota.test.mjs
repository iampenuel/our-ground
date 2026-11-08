import test from 'node:test';
import assert from 'node:assert/strict';
import {googleSpeechQuota,hostedSpeechQuota} from '../backend/eden-speech-quota.ts';
import {synthesizePublicSpeech} from '../backend/eden-speech.ts';

const model='gemini-3.8-flash-lite-tts';
const metric='generativelanguage.googleapis.com/generate_content_free_tier_requests';
const quota=(id,value)=>({'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[
  {quotaMetric:metric,quotaId:id,...(value===undefined?{}:{quotaValue:value}),subject:'projects/private-project',quotaDimensions:{location:'private-region'}},
]});
const retry=delay=>({'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:delay});
const upstream=(details,extra={})=>({status:429,error:{error:{code:429,status:'RESOURCE_EXHAUSTED',message:'private submitted text',details,...extra}},headers:new Headers()});

test('Google errors preserve only structured quota metadata, never quota subjects, keys or submitted content',async()=>{
  const e=upstream([quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier','3'),retry('7.3s')]);
  e.headers.set('Retry-After','12');e.headers.set('x-goog-api-key','test-key-must-stay-private');
  const info=googleSpeechQuota(e,model);
  assert.deepEqual(info,{source:'google',endpoint:'POST https://generativelanguage.googleapis.com/v1beta/interactions',model,httpStatus:429,
    category:'short-window',providerCode:429,providerStatus:'RESOURCE_EXHAUSTED',
    violations:[{quotaMetric:metric,quotaId:'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',effectiveLimit:3}],retryAfterSeconds:12});
  assert.doesNotMatch(JSON.stringify(info),/private|test-key/);
  await assert.rejects(synthesizePublicSpeech('A public test phrase.',model,'nonsecret-fixture',undefined,{create:async()=>{throw e;}}),err=>{
    assert.equal(err.code,'SPEECH_QUOTA_EXHAUSTED');assert.deepEqual(err.quota,info);return true;
  });
});
test('a daily limit, a reported zero allowance, and an unexplained 429 remain distinct',()=>{
  const daily=googleSpeechQuota(upstream([quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier','10')]),model);
  assert.equal(daily.category,'daily');assert.equal(daily.violations[0].effectiveLimit,10);assert.equal(daily.retryAfterSeconds,undefined);
  const zero=upstream([quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')],{message:'Details omitted.\n* Quota exceeded for metric: '+metric+', limit: 0, model: private-sentinel'});
  const info=googleSpeechQuota({statusCode:429,body:JSON.stringify(zero.error)},model);
  assert.equal(info.category,'zero-allowance');assert.equal(info.violations[0].effectiveLimit,0);
  assert.doesNotMatch(JSON.stringify(info),/private-sentinel/);
  const unspecified=googleSpeechQuota({status:429,message:'quota exceeded for secret-project at secret URL'},model);
  assert.equal(unspecified.category,'unspecified');assert.deepEqual(unspecified.violations,[]);assert.equal(unspecified.retryAfterSeconds,undefined);
});
test('ErrorInfo metadata and HTTP-date retry delay are bounded, and unexpected details are excluded',()=>{
  const e=upstream([{'@type':'type.googleapis.com/google.rpc.ErrorInfo',metadata:{quota_metric:metric,quota_limit:'GenerateContentRequestsPerDayPerProjectPerModel',quota_limit_value:'17',consumer:'private-identity'}}]);
  e.headers.set('retry-after','Mon, 09 Nov 2026 00:02:00 GMT');
  const info=googleSpeechQuota(e,model,Date.parse('2026-11-09T00:00:00Z'));
  assert.equal(info.retryAfterSeconds,120);assert.equal(info.category,'daily');assert.equal(info.violations[0].effectiveLimit,17);assert(!JSON.stringify(info).includes('private'));
  const bad=googleSpeechQuota(upstream([quota('AIzaNotReal/exfiltration?token=secret',null),retry('forty seconds')]),model);
  assert(!JSON.stringify(bad).includes('AIza'));assert.equal(bad.retryAfterSeconds,undefined);
  const canary=googleSpeechQuota(upstream([{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[
    {quotaId:'GenerateRequestsPerDay-ghp_FakePrivateCanary',quotaMetric:metric+'_privatecanary',subject:'private-credential'}
  ]}]),model);
  assert.deepEqual(canary.violations,[]);assert(!JSON.stringify(canary).includes('Canary'));
  assert.equal(googleSpeechQuota({status:429,error:{code:987654321012}},model).providerCode,undefined);
  assert.equal(googleSpeechQuota({status:503},model),undefined);
});
test('Interactions symbolic error codes and protobuf retry durations remain distinct from the HTTP code',()=>{
  const info=googleSpeechQuota({status:429,error:{code:'too_many_requests',details:[retry({seconds:'5',nanos:100000000})]}},model);
  assert.equal(info.httpStatus,429);assert.equal(info.providerCode,'too_many_requests');
  assert.equal(info.category,'unspecified');assert.equal(info.retryAfterSeconds,6);
  assert.equal(googleSpeechQuota({status:429,error:{code:'secret-credential'}},model).providerCode,undefined);
});
test('Our Ground window resets are computed from their own UTC bucket, not a Google estimate',()=>{
  const now=Date.parse('2026-11-08T23:59:42.500Z');
  for(const [window,limit] of [['speech-minute',2],['provider-speech-minute',3],['speech-day',10]]){
    const info=hostedSpeechQuota(model,window,limit,now);
    assert.equal(info.source,'our-ground');assert.equal(info.retryAfterSeconds,18);
    assert.deepEqual(info.violations,[{quotaId:window,effectiveLimit:limit}]);
    assert.equal(info.category,window==='speech-day'?'daily':'short-window');
  }
});
