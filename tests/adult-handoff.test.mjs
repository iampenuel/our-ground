import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import test from 'node:test';
import {adultGate} from '../backend/adult-access.ts';
import {configuredHandoff} from '../backend/adult-handoff.ts';
import {handoffFixture} from './support/adult-handoff-fixture.mjs';

const origin = 'https://protected.example';
const config = { ADULT_SESSION_SECRET: randomBytes(32).toString('base64url') };
const value = response => response.headers.get('Set-Cookie')?.split(';')[0];

async function flow() {
  const {handoff, control} = handoffFixture();
  const get = (path, cookie = '', accept = 'text/html') => adultGate(new Request(origin + path, {
    headers: {cookie, accept},
  }), config, handoff);
  const post = (path, fields, cookie = '', from = origin) => adultGate(new Request(origin + path, {
    method: 'POST', headers: {cookie, origin: from}, body: new URLSearchParams(fields),
  }), config, handoff);
  const denied = value(await post('/eligibility', {age: 'under19'}));
  assert(denied);
  const start = async (target = '/give') => {
    const result = await post('/adult-handoff/start', {return: target}, denied);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/adult-handoff');
    const pending = await get('/adult-handoff', denied);
    assert.match(await pending.text(), /https:\/\/age\.yoti\.com\//);
    return control.request.reference_id;
  };
  return {handoff, control, get, post, start, denied};
}

test('adult handoff preserves denial, authorizes public routes only, and revokes the verified session on exit', async () => {
  const f = await flow();
  assert.match(await (await f.get('/give', f.denied)).text(), /Verify as an adult/);
  assert.equal((await f.post('/eligibility', {age: '19plus'}, f.denied)).status, 403);
  const state = await f.start();
  const callback = await f.get('/adult-handoff/return?state=' + state);
  assert.match(await callback.text(), /Check verification/);
  assert.equal(value(callback), undefined);
  assert.equal(callback.headers.get('Referrer-Policy'), 'strict-origin');
  assert.equal((await f.post('/adult-handoff/complete', {state}, '')).status, 403);
  assert.equal((await f.post('/adult-handoff/complete', {state}, f.denied, 'https://outside.example')).status, 403);
  assert.equal((await f.post('/adult-handoff/complete', {state: 'z'.repeat(43)}, f.denied)).status, 403);
  const [a,b] = await Promise.all([1,2].map(() => f.post('/adult-handoff/complete', {state}, f.denied)));
  assert.deepEqual([a.status,b.status].sort(), [303,403]);
  const pass = a.status === 303 ? a : b;
  assert.equal(pass.headers.get('location'), '/give');
  assert.match(pass.headers.get('set-cookie'), /^__Host-og-verified-adult=.*; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  const both = f.denied + '; ' + value(pass);
  for (const path of ['/give','/support','/api/v1/resources','/api/v1/eden/hosted/status'])
    assert.equal(await f.get(path, both), null, path);
  for (const path of ['/account','/staff','/api/v1/org/listings','/api/v1/correction-reports','/api/v1/eden/hosted/live/token'])
    assert.equal((await f.get(path, both)).status, 403, path);
  assert.equal((await f.get('/support', value(pass))).status, 200, 'Grant without its denied cookie sees the age form');
  assert.equal((await f.get('/support', f.denied)).status, 403);
  assert.equal((await f.post('/adult-handoff/complete', {state}, f.denied)).status, 403);
  const finish = await f.post('/adult-handoff/finish', {}, both);
  assert.equal(finish.status, 303);
  assert.match(finish.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.get('/support', both)).status, 403, 'Replaying the expired cookie stays denied');
});

test('pending verification can be canceled and provider outage never grants access', async () => {
  const f = await flow();
  const state = await f.start();
  f.control.outcome = {status: 'IN_PROGRESS'};
  assert.equal((await f.post('/adult-handoff/complete', {state}, f.denied)).status, 202);
  f.control.unavailable = true;
  assert.equal((await f.post('/adult-handoff/complete', {state}, f.denied)).status, 503);
  assert.equal((await f.get('/support', f.denied)).status, 403);
  assert.equal((await f.post('/adult-handoff/cancel', {state}, f.denied)).status, 303);
  f.control.unavailable = false;
  f.control.outcome = {};
  assert.equal((await f.post('/adult-handoff/complete', {state}, f.denied)).status, 403);
});

test('only an authenticated completed 19+ document scan for the same attempt is accepted', async () => {
  for (const outcome of [
    {status: 'FAIL'}, {status: 'CANCELLED'}, {age: 18,doc_scan:{allowed:true,level:'PASSIVE',threshold:18}},
    {reference_id:'wrong'}, {sdk_id:'other'}, {id:'other'}, {method:'AGE_ESTIMATION'},
    {doc_scan:{threshold:19,allowed:true,level:'NOT_APPLICABLE'}}, {expires_at:'2000-01-01T00:00:00Z'}, {expires_at:[new Date(Date.now() + 600000).toISOString()]},
  ]) {
    const f = await flow();
    const state = await f.start();
    f.control.outcome = outcome;
    const response = await f.post('/adult-handoff/complete', {state, verified:'true',age:'19'}, f.denied);
    assert.equal(response.status, 403);
    assert.equal(value(response), undefined);
    assert.equal((await f.get('/support', f.denied)).status, 403);
  }
});

test('attempts expire, unsafe returns use Find Support, and grants expire before the original denial', async t => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-11T12:00:00Z')});
  const f = await flow();
  const expired = await f.start();
  t.mock.timers.tick(601000);
  assert.equal((await f.post('/adult-handoff/complete', {state:expired}, f.denied)).status, 403);
  const state = await f.start('https://outside.example');
  const response = await f.post('/adult-handoff/complete', {state}, f.denied);
  assert.equal(response.headers.get('location'), '/support');
  const both = f.denied + '; ' + value(response);
  t.mock.timers.tick(901000);
  assert.equal((await f.get('/support', both)).status, 403);
});

test('one concurrent start reaches the provider and the configured budget is enforced', async () => {
  const f = await flow();
  f.handoff.dailyLimit = 1;
  const a = await Promise.all([1,2].map(() => f.post('/adult-handoff/start', {}, f.denied)));
  assert.equal(f.control.creates, 1);
  assert(a.every(response => response.status === 303));
  const state = f.control.request.reference_id;
  const pass = await f.post('/adult-handoff/complete', {state}, f.denied);
  assert.equal(pass.status, 303);
  await f.post('/adult-handoff/cancel', {state}, f.denied);
  assert.equal((await f.get('/support', f.denied + '; ' + value(pass))).status, 403);
  assert.equal((await f.post('/adult-handoff/start', {}, f.denied)).status, 429);
});

test('handoff is disabled by default and cannot use sandbox or preview as a live authorization path', async () => {
  const f = await flow();
  const request = new Request(origin + '/support', {headers:{cookie:f.denied}});
  const disabled = await adultGate(request,config);
  assert.equal(disabled.status,403);
  assert.doesNotMatch(await disabled.text(), /Verify as an adult/);
  assert.equal(configuredHandoff(new Request('https://ourground.vercel.app'), {
    ADULT_HANDOFF_ENABLED:'true', VERCEL_ENV:'preview', VERCEL_PROJECT_ID:'prj_4li6QnqulPgPbJpxMW2L9hczDNrS',
  }),undefined);
});
