import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createEdenLimits, EDEN_DEVELOPMENT_LIMITS } from '../backend/eden-limits.ts';
import { createEdenLive, EDEN_LIVE_LIMITS } from '../backend/eden-live.ts';
import { createEdenService } from '../backend/eden-api.ts';
import { attestLocalDevelopmentRequest } from '../backend/local-transport.ts';
import { DemoRepository } from '../backend/demo.ts';
import { EDEN_NOTICE_VERSION } from '../shared/eden-assistant.ts';

// All credentials, grants and provider responses here are synthetic. No env
// files, external requests or provider capacity APIs are used.
const start = Date.UTC(2026, 10, 7, 12, 30), origin = 'http://127.0.0.1:5199';
const code = 'R'.repeat(43), nonce = 'N'.repeat(43);
const env = { GEMINI_API_KEY: 'synthetic-capacity-nonsecret-key', EDEN_GEMINI_MODE: 'synthetic-development',
  EDEN_GEMINI_FREE_TIER_CONFIRMED: 'true', EDEN_LOCAL_OWNER_ENABLED: 'true',
  EDEN_REVIEWER_CODE_SHA256: createHash('sha256').update(code).digest('hex'),
  EDEN_REVIEWER_EXPIRES_AT: new Date(start + 3600_000).toISOString(), EDEN_REVIEWER_ADULT_VERIFIED: 'true', EDEN_REVIEWER_COUNTRY: 'US',
  EDEN_GEMINI_LIVE_ENABLED: 'true', EDEN_GEMINI_LIVE_MODEL: 'gemini-3.8-live', EDEN_GEMINI_LIVE_MODEL_CONFIRMED: 'true',
  BACKEND_DATA_MODE: 'demo', ALLOW_DEMO_DATA: 'true' };

async function fixture(t, overrides = {}) {
  let now = start, mints = 0;
  const configuration = { ...env, ...overrides };
  const live = createEdenLive(configuration, { now: () => now, create: async () => ({ name: 'auth_tokens/synthetic-' + ++mints }) });
  const service = createEdenService(configuration, { live, agentRepository: new DemoRepository(), now: () => now });
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks), request = new Request('http://' + incoming.headers.host + incoming.url,
      { method: incoming.method, headers: incoming.headers, ...(body.length ? { body } : {}) });
    attestLocalDevelopmentRequest(request, server, incoming.socket);
    const response = await service.handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = (path, body, token, headers = {}) => fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: 'EdenSession ' + token } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { service, request, mints: () => mints, advance(ms) { now += ms; } };
}

test('model-credit snapshot reports admitted/reserved credits without consuming work or session capacity', () => {
  let now = start;
  const limits = createEdenLimits({ now: () => now }), initial = limits.usage();
  assert.deepEqual(initial, { dayCalls: 0, dayCallLimit: 40, daySpeech: 0, daySpeechLimit: 12,
    dayResetAt: '2026-11-08T00:00:00.000Z', hourSessionsCreated: 0, hourSessionLimit: 6,
    hourResetAt: '2026-11-07T13:00:00.000Z', scope: 'backend-process' });
  for (let index = 0; index < 20; index++) assert.deepEqual(limits.usage(), initial);
  const token = limits.createSession(origin).sessionToken;
  limits.admit(token, origin, 'speech')(); limits.admitAgent(token, origin)();
  const used = limits.usage();
  assert.equal(used.dayCalls, 3, 'a two-phase agent reserves both credits at admission');
  assert.equal(used.daySpeech, 1); assert.equal(used.hourSessionsCreated, 1);
  for (let index = 1; index < EDEN_DEVELOPMENT_LIMITS.sessionsPerHour; index++) limits.createSession(origin);
  assert.throws(() => limits.createSession(origin), error => error.code === 'EDEN_SESSION_LIMIT');
  limits.endSession(token, origin); assert.equal(limits.usage().dayCalls, 3, 'ending a session does not refund credits');
  now = Date.UTC(2026, 10, 7, 13);
  assert.equal(limits.usage().hourSessionsCreated, 0); assert.equal(limits.usage().dayCalls, 3);
  now = Date.UTC(2026, 10, 8);
  assert.equal(limits.usage().dayCalls, 0); assert.equal(limits.usage().daySpeech, 0);
  assert.equal(limits.usage().dayResetAt, '2026-11-09T00:00:00.000Z');
});

test('Live capacity snapshot preserves charged attempts and rolls over only local UTC counters', async () => {
  let now = start, mints = 0;
  const live = createEdenLive(env, { now: () => now, create: async () => { mints++; throw Object.assign(new Error('synthetic-quota'), { status: 429 }); } });
  const before = { minted: 0, limit: EDEN_LIVE_LIMITS.mintsPerDay, resetAt: '2026-11-08T00:00:00.000Z', scope: 'backend-process' };
  for (let index = 0; index < 10; index++) assert.deepEqual(live.usage(), before);
  assert.equal(mints, 0);
  await assert.rejects(live.mint('a'.repeat(64), nonce, now + 900_000), error => error.code === 'EDEN_LIVE_PROVIDER_QUOTA');
  assert.equal(live.usage().minted, 1, 'failed provider attempts remain charged');
  for (let index = 0; index < 10; index++) assert.equal(live.usage().minted, 1);
  assert.equal(mints, 1);
  now = Date.UTC(2026, 10, 8);
  assert.deepEqual(live.usage(), { ...before, resetAt: '2026-11-09T00:00:00.000Z' }); assert.equal(mints, 1);
});

test('attested local owner status exposes bounded process usage but never admits, mints or leaks credentials', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 5; index++) {
    const response = await f.request('/eden/status'); assert.equal(response.headers.get('cache-control'), 'no-store');
    const status = await response.json(), local = status.localDevelopment;
    assert.equal(local.grantExpiresAt, env.EDEN_REVIEWER_EXPIRES_AT); assert.equal(local.live.minted, 0);
    assert.equal(local.modelCredits.dayCalls, 0); assert.equal(local.modelCredits.hourSessionsCreated, 0);
    assert.equal(local.live.scope, 'backend-process'); assert.equal(local.modelCredits.scope, 'backend-process');
  }
  const session = await (await f.request('/eden/session', { noticeVersion: EDEN_NOTICE_VERSION, adultConfirmed: true, privacyAcknowledged: true })).json();
  assert.match(session.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  const mintResponse = await f.request('/eden/live/token', { noticeVersion: EDEN_NOTICE_VERSION, liveAudioAcknowledged: true, nonce }, session.sessionToken);
  assert.equal(mintResponse.status, 200);
  const mint = await mintResponse.json(), status = await (await f.request('/eden/status')).json();
  assert.equal(status.localDevelopment.live.minted, 1); assert.equal(status.localDevelopment.modelCredits.dayCalls, 1);
  assert.equal(status.localDevelopment.modelCredits.hourSessionsCreated, 1); assert.equal(f.mints(), 1);
  const serialized = JSON.stringify(status);
  for (const secret of [env.GEMINI_API_KEY, env.EDEN_REVIEWER_CODE_SHA256, code, session.sessionToken, nonce, mint.token, mint.callId]) assert.equal(serialized.includes(secret), false);
  f.advance(3600_000);
  assert.equal(Object.hasOwn(await (await f.request('/eden/status')).json(), 'localDevelopment'), false, 'grant expiry removes the snapshot');
});

test('public, unattested, proxy-spoofed, owner-disabled and hosted status omit all local capacity metadata', async t => {
  const local = await fixture(t);
  for (const url of ['http://127.0.0.1:8787/eden/status', 'https://public.example.invalid/eden/status']) {
    const request = new Request(url, { headers: { origin, 'x-eden-local-owner': 'true', 'x-forwarded-for': '127.0.0.1' } });
    assert.equal(Object.hasOwn(local.service.status(request), 'localDevelopment'), false);
  }
  const spoofed = await (await local.request('/eden/status', undefined, undefined, { 'x-forwarded-for': '127.0.0.1' })).json();
  assert.equal(Object.hasOwn(spoofed, 'localDevelopment'), false);
  for (const override of [{ EDEN_LOCAL_OWNER_ENABLED: 'false' }, { VERCEL: '1' }, { NODE_ENV: 'production' }]) {
    const f = await fixture(t, override), status = await (await f.request('/eden/status')).json();
    assert.equal(Object.hasOwn(status, 'localDevelopment'), false); assert.equal(f.mints(), 0);
  }
  assert.equal(local.mints(), 0);
});
