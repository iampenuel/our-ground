import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import test from 'node:test';
import {adultGate, adultSessionNonce} from '../backend/adult-access.ts';

const origin = 'https://ourground.vercel.app';
const config = {
  ADULT_SESSION_SECRET: randomBytes(32).toString('base64url'),
  VERCEL_ENV: 'production',
  VERCEL_PROJECT_ID: 'prj_4li6QnqulPgPbJpxMW2L9hczDNrS',
  ACCOUNT_RELEASE_MODE: 'signin_only',
};
const demoPath = '/adult-help-demo';
const demoNotice = 'DEMO MODE — Age verification is simulated. No identity has been checked.';
const request = (path, options) => new Request(origin + path, options);
const get = (path, cookie = '') => adultGate(request(path, {headers: {cookie}}), config);
const post = (path, fields, cookie = '', from = origin) => adultGate(request(path, {
  method: 'POST', headers: {origin: from, cookie}, body: new URLSearchParams(fields),
}), config);
const decide = (age, cookie) => post('/eligibility', {age}, cookie);
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];
const noCookie = response => assert.equal(cookieOf(response), undefined);

async function assertDenied(cookie) {
  for (const path of ['/support', '/give', '/account', '/organizations', '/staff', '/api/v1/resources',
    '/api/v1/eden/hosted/status', '/api/v1/eden/hosted/live/token', '/api/v1/eden/hosted/speech',
    '/api/index?path=organization/listings']) {
    assert.equal((await get(path, cookie)).status, 403, path);
  }
  for (const path of ['/api/v1/resources/search', '/api/v1/correction-reports', '/api/v1/eden/hosted/session',
    '/api/v1/eden/hosted/live/token', '/api/v1/eden/hosted/speech']) {
    assert.equal((await post(path, {}, cookie)).status, 403, path);
  }
  assert.equal(await adultSessionNonce(request('/', {headers: {cookie}}), config), null);
  const status = await adultGate(request('/eligibility', {headers: {cookie, Accept: 'application/json'}}), config);
  assert.deepEqual(await status.json(), {eligible: false, denied: true});
}

test('demo choices stay isolated and leave the original denial unchanged', async () => {
  const denied = await decide('under19');
  assert.equal(denied.status, 403);
  assert.match(await denied.text(), /See how an adult can help/);
  const cookie = cookieOf(denied);
  assert.match(cookie, /^__Host-og-audience=under19\./);

  const intro = await get(demoPath, cookie);
  noCookie(intro);
  assert.match(await intro.text(), /DEMO MODE — Age verification is simulated\. No identity has been checked\./);
  for (const [action, heading] of [
    ['start', /Simulated verification/], ['failure', /Simulation unsuccessful/],
    ['success', /Simulation successful — Adult assistance preview/],
    ['find', /Find Support/], ['find-food', /Food/], ['resource-food', /Fictional/],
    ['give', /Give Support/], ['opportunity-food', /Fictional/],
  ]) {
    const response = await get(demoPath + '/' + action, cookie);
    assert.equal(response.status, 200, action);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    noCookie(response);
    const html = await response.text();
    assert(html.includes(demoNotice), action);
    assert.match(html, heading);
    assert.doesNotMatch(html, /<script\b|https?:\/\//);
  }
  await assertDenied(cookie);

  const sceneWithExit = await get(demoPath + '/success', cookie);
  assert.match(await sceneWithExit.text(), /href="\/">Finish adult assistance demo/);
  const returnToDenial = await get('/', cookie);
  assert.equal(returnToDenial.status, 403);
  noCookie(returnToDenial);
  const replay = await get(demoPath, cookie);
  assert.match(await replay.text(), /Start adult handoff demo/);
  noCookie(replay);
  const second = await decide('19plus', cookie);
  assert.equal(second.status, 403);
  noCookie(second);
  await assertDenied(cookie);
});

test('direct visits and formerly configured provider flags cannot authorize real routes', async () => {
  const direct = await get(demoPath + '?action=success');
  assert.equal(direct.status, 200);
  assert.match(await direct.text(), /Start adult handoff demo/);
  noCookie(direct);
  const success = await get(demoPath + '/success');
  noCookie(success);
  assert.equal((await get('/api/v1/resources')).status, 403);
  assert.match(await (await get('/support')).text(), /Age confirmation/);
  for (const path of [demoPath + '/extra', '/adult-handoff', '/adult-handoff/return']) {
    assert.match(await (await get(path)).text(), /Age confirmation/);
  }
  const rejected = await post(demoPath + '/success', {age: '19plus'});
  assert.equal(rejected.status, 405);
  noCookie(rejected);

  const cookie = cookieOf(await decide('under19'));
  const legacy = await adultGate(request('/adult-handoff/complete', {
    method: 'POST', headers: {cookie, Origin: origin}, body: new URLSearchParams({action: 'success'}),
  }), {...config, ADULT_HANDOFF_ENABLED: 'true'});
  assert.equal(legacy.status, 403);
  noCookie(legacy);
  await assertDenied(cookie);
});

test('normal 19+ sessions still enter the application and retain their decision through the preview', async () => {
  const accepted = await decide('19plus');
  assert.equal(accepted.status, 303);
  const cookie = cookieOf(accepted);
  assert.match(cookie, /^__Host-og-audience=19plus\./);
  for (const path of ['/support', '/give', '/account', '/api/v1/resources']) {
    assert.equal(await get(path, cookie), null, path);
  }
  noCookie(await get(demoPath + '/success', cookie));
  assert(await adultSessionNonce(request('/', {headers: {cookie}}), config));
});
