import test from 'node:test';
import assert from 'node:assert/strict';
import {edenDevelopmentDiagnosticsAllowed,classifyEdenDevelopmentIssue,edenSafeDevelopmentLiveReport,parseEdenDevelopmentCapacity} from '../src/eden/development-diagnostics.ts';

test('diagnostics require explicit development review opt-in on a public loopback page',()=>{
  const local={hostname:'127.0.0.1',pathname:'/give',search:'?eden-diagnostics=1'};
  assert.equal(edenDevelopmentDiagnosticsAllowed(true,'eden-review',local),true);
  for(const [dev,mode,location] of [[false,'eden-review',local],[true,'production',local],[true,'eden-review',{...local,hostname:'ourground.vercel.app'}],[true,'eden-review',{...local,pathname:'/account'}],[true,'eden-review',{...local,search:''}]])assert.equal(edenDevelopmentDiagnosticsAllowed(dev,mode,location),false);
});
test('capacity observations distinguish resolver, local access and provider errors without inferring a daily quota',()=>{
  assert.deepEqual(classifyEdenDevelopmentIssue('resolver',429,'RATE_LIMITED',60,1000),{service:'resolver',category:'resolver-limit',status:429,at:1000,retryAt:61000});
  assert.equal(classifyEdenDevelopmentIssue('gemini',429,'EDEN_LIVE_PROVIDER_QUOTA').category,'rate-limit-or-quota');
  assert.equal(classifyEdenDevelopmentIssue('application',429,'EDEN_LIVE_USAGE_LIMIT').category,'local-limit');
  assert.equal(classifyEdenDevelopmentIssue('application',403,'EDEN_REVIEWER_REQUIRED').category,'access');
  assert.equal(classifyEdenDevelopmentIssue('gemini',503,'EDEN_LIVE_PROVIDER_UNAVAILABLE').category,'unavailable','the backend does not prove provider overload from this code');
  const safe=JSON.stringify(classifyEdenDevelopmentIssue('gemini',429,'private transcript or credential',-1));assert(!safe.includes('private'));assert(!safe.includes('retryAt'));
});
test('development report projects only bounded operational fields and excludes extensible content and credentials',()=>{
  const report=edenSafeDevelopmentLiveReport({phase:'listening',microphoneActive:true,microphoneForwarding:true,microphoneMuted:false,speakerMuted:false,token:'private-key',reason:'private transcript',diagnostic:{model:'gemini-3.8-live',callRef:'call-1',inputChunks:44,token:'private-key',resumeHandle:'private-handle',transcript:'private text',timeline:Array.from({length:50},(_,n)=>({event:'turn-complete',elapsedMs:n,connection:1,turn:n,raw:'private body'}))}});
  assert.equal(report.timeline.length,32);assert.equal(report.timeline[0].elapsedMs,18);assert.equal(report.inputChunks,44);
  for(const value of ['private-key','private-handle','private text','private transcript','private body'])assert(!JSON.stringify(report).includes(value));
});
test('owner capacity metadata rejects extra sensitive fields and cannot claim provider scope or increased limits',()=>{
  const date='2026-11-07T21:10:16.879Z',value={grantExpiresAt:date,live:{minted:2,limit:6,resetAt:date,scope:'backend-process'},modelCredits:{dayCalls:8,dayCallLimit:40,daySpeech:0,daySpeechLimit:12,dayResetAt:date,hourSessionsCreated:1,hourSessionLimit:6,hourResetAt:date,scope:'backend-process'}};
  assert.deepEqual(parseEdenDevelopmentCapacity(value),value);
  assert.equal(parseEdenDevelopmentCapacity({...value,token:'private'}),undefined);
  assert.equal(parseEdenDevelopmentCapacity({...value,live:{...value.live,scope:'Google-project'}}),undefined);
  assert.equal(parseEdenDevelopmentCapacity({...value,live:{...value.live,limit:100}}),undefined);
  assert.equal(parseEdenDevelopmentCapacity({...value,modelCredits:{...value.modelCredits,dayCalls:41}}),undefined);
});
