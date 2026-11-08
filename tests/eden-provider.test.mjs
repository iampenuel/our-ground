import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEdenService } from '../backend/eden-api.ts';
import { createEdenProvider, EDEN_NAVIGATION_TOOL } from '../backend/eden-provider.ts';
import { createEdenLimits, EDEN_DEVELOPMENT_LIMITS } from '../backend/eden-limits.ts';
import { EDEN_NOTICE_VERSION } from '../shared/eden-assistant.ts';
import { handleApi } from '../backend/app.ts';
import { GoogleGenAI } from '@google/genai';

// Entirely synthetic inputs and injected providers: no credentials, external
// calls, database, visitor conversation, billing or production changes.
const env = { EDEN_GEMINI_MODE: 'synthetic-development', EDEN_GEMINI_FREE_TIER_CONFIRMED: 'true', GEMINI_API_KEY: 'synthetic-nonsecret-test-value' };
const origin = 'http://127.0.0.1:5199';
const context = { page: 'support', category: 'food', radius: 10, resultCount: 3, synthetic: true };
const action = { type: 'search', category: 'food', radius: 10 };
const completed = (value = action, extra = {}) => ({ status: 'requires_action', steps: [{ type: 'function_call', name: EDEN_NAVIGATION_TOOL, arguments: value }], ...extra });
const request = (path, body, options = {}) => new Request((options.url ?? 'http://127.0.0.1:8787') + path, {
  method: options.method ?? 'POST',
  headers: { origin: options.origin ?? origin, 'content-type': 'application/json', ...(options.token ? { authorization: 'EdenSession ' + options.token } : {}), ...options.headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const notice = { noticeVersion: EDEN_NOTICE_VERSION };
const sessionBody = { adultConfirmed: true, privacyAcknowledged: true, ...notice };
async function session(service, options) {
  const response = await service.handle(request('/eden/session', sessionBody, options));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.eligible, true); assert.match(body.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  return body.sessionToken;
}
function fixture(settings = {}) {
  const calls = [];
  const provider = createEdenProvider(settings.env ?? env, { create: async (payload, signal) => {
    calls.push({ payload, signal });
    return settings.create ? settings.create(payload, signal) : completed();
  } });
  return { calls, provider, service: createEdenService(settings.env ?? env, { provider, now: settings.now, speechProvider: settings.speechProvider }) };
}
const turn = (token, body = { action, context, ...notice }, options = {}) => request('/eden/turn', body, { token, ...options });

test('public, hosted, absent attestation, missing key and unapproved model remain fail closed', async () => {
  const deniedEnvironments = [
    {}, { ...env, EDEN_GEMINI_MODE: 'public', EDEN_GEMINI_PUBLIC_ENABLED: 'true' },
    { ...env, NODE_ENV: 'production' }, { ...env, VERCEL: '1' }, { ...env, VERCEL_ENV: 'preview' },
    { ...env, AWS_LAMBDA_FUNCTION_NAME: 'synthetic' }, { ...env, NETLIFY: 'true' },
    { ...env, EDEN_GEMINI_FREE_TIER_CONFIRMED: undefined }, { ...env, GEMINI_API_KEY: undefined },
    { ...env, EDEN_GEMINI_TEXT_MODEL: 'gemini-4-argon' }, { ...env, EDEN_DEVELOPMENT_ORIGINS: 'https://public.example.invalid' },
  ];
  for (const configuration of deniedEnvironments) {
    const { service, calls } = fixture({ env: configuration });
    const response = await service.handle(request('/eden/session', sessionBody));
    assert.equal(response.status, 403, JSON.stringify({ ...configuration, GEMINI_API_KEY: undefined }));
    assert.equal(service.status(request('/eden/status', undefined, { method: 'GET' })).publicGeminiEnabled, false);
    assert.equal(calls.length, 0);
  }
  const { service, calls } = fixture();
  for (const options of [
    { url: 'https://public.example.invalid' }, { url: 'http://192.0.2.1' },
    { origin: 'https://public.example.invalid' }, { origin: 'null' }, { origin: 'http://127.0.0.1:3333' },
    { url: 'https://public.example.invalid', headers: { 'x-forwarded-host': '127.0.0.1:8787', 'x-forwarded-proto': 'http', 'x-eden-adult-confirmed': 'true' } },
  ]) assert.equal((await service.handle(request('/eden/session', sessionBody, options))).status, 403);
  assert.equal(calls.length, 0);
});

test('local status exposes safe flags and explicitly reports deterministic fallback', async () => {
  const disabled = createEdenService({});
  const response = await disabled.handle(request('/eden/status', undefined, { method: 'GET' }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.engine, 'local'); assert.equal(body.eligible, false); assert.equal(body.publicGeminiEnabled, false);
  assert.equal(JSON.stringify(body).includes('GEMINI_API_KEY'), false);
  const active = fixture().service.status(request('/eden/status', undefined, { method: 'GET' }));
  assert.equal(active.mode, 'synthetic-development'); assert.equal(active.engine, 'gemini');
});

test('sessions require current notice and both acknowledgments, bind origin and expire', async () => {
  let now = Date.UTC(2026, 10, 6);
  const { service, calls } = fixture({ now: () => now });
  for (const body of [{ ...sessionBody, adultConfirmed: false }, { ...sessionBody, privacyAcknowledged: false }, { ...sessionBody, extra: 'synthetic-private-canary' }]) {
    assert.equal((await service.handle(request('/eden/session', body))).status, 422);
  }
  assert.equal((await service.handle(request('/eden/session', { ...sessionBody, noticeVersion: 'obsolete' }))).status, 428);
  const token = await session(service);
  assert.equal((await service.handle(turn(token, undefined, { origin: 'http://localhost:5199' }))).status, 401);
  assert.equal((await service.handle(turn(undefined))).status, 401);
  const supabaseAuth = turn(undefined, undefined, { headers: { authorization: 'Bearer synthetic-supabase-token' } });
  assert.equal((await service.handle(supabaseAuth)).status, 401);
  now += EDEN_DEVELOPMENT_LIMITS.sessionLifetimeMs;
  assert.equal((await service.handle(turn(token))).status, 401);
  assert.equal(calls.length, 0);
});

test('raw visitor messages, city, resource records, extra context and real contexts never reach provider', async () => {
  const { service, calls } = fixture(), token = await session(service);
  const disallowed = [
    { action, context, ...notice, message: 'synthetic-private-canary' },
    { action: { ...action, city: 'harrisburg-pa' }, context, ...notice },
    { action: { type: 'donate', amount: 1 }, context, ...notice },
    { action, context: { ...context, title: 'synthetic-private-canary' }, ...notice },
    { action, context: { ...context, results: [{ name: 'synthetic-private-canary', url: 'https://example.invalid' }] }, ...notice },
    { action, context: { ...context, synthetic: false }, ...notice },
    { action: { type: 'details', index: 4 }, context, ...notice },
    { action: { type: 'select', index: 0 }, context, ...notice },
    { action: { type: 'help', medicalAdvice: 'synthetic-private-canary' }, context, ...notice },
    ...['navigate-support', 'read-results', 'clear-filters'].map(type => ({ action: { type }, context, ...notice })),
  ];
  for (const body of disallowed) {
    const response = await service.handle(turn(token, body));
    assert.equal(response.status, 422);
    assert.equal((await response.text()).includes('synthetic-private-canary'), false);
  }
  assert.equal(calls.length, 0);
});

test('a valid synthetic turn sends reconstructed finite data and returns only validated action with fixed phrase', async () => {
  const { service, calls } = fixture(), token = await session(service);
  const response = await service.handle(turn(token));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { engine: 'gemini', action, phrase: 'search_ready' });
  assert.equal(calls.length, 1);
  const payload = calls[0].payload;
  assert.equal(payload.model, 'gemini-3.5-flash-lite'); assert.equal(payload.store, false); assert.equal(payload.automatic_continuation, false);
  assert.equal(payload.generation_config.max_output_tokens, 256);
  assert.equal(payload.generation_config.thinking_level, 'minimal'); assert.equal(payload.generation_config.thinking_summaries, 'none');
  assert.equal(payload.tools.length, 1); assert.equal(payload.tools[0].parameters.additionalProperties, false);
  assert.deepEqual(JSON.parse(payload.input), { purpose: 'synthetic_public_navigation', requested_action: action, page_context: context });
  assert(!JSON.stringify(payload).includes(token)); assert(!JSON.stringify(payload).includes(env.GEMINI_API_KEY));
  assert.equal('previous_interaction_id' in payload, false); assert.equal('background' in payload, false);
  assert.equal(calls[0].signal.aborted, false);
});

test('changed actions, additional calls, prose and incomplete outputs fail closed', async () => {
  const responses = [
    completed({ type: 'search', category: 'healthcare', radius: 10 }),
    completed({ ...action, url: 'https://example.invalid/synthetic-private-canary' }),
    completed(action, { steps: [completed().steps[0], completed().steps[0]] }),
    completed(action, { steps: [{ ...completed().steps[0], name: 'change_account' }] }),
    completed(action, { status: 'requires_continuation' }),
    completed(action, { steps: [{ type: 'text', text: 'synthetic-private-canary' }] }),
  ];
  for (const result of responses) {
    const { service, calls } = fixture({ create: async () => result }), token = await session(service);
    const response = await service.handle(turn(token));
    assert.equal(response.status, 502); assert.equal(calls.length, 1);
    assert.equal((await response.text()).includes('synthetic-private-canary'), false);
  }
});

test('provider quota, cancellation and SDK errors are safe failures without retry or content leakage', async () => {
  for (const [error, expected] of [[Object.assign(new Error('synthetic-private-canary?key=synthetic-secret'), { status: 429 }), 429], [new Error('synthetic-private-canary'), 503]]) {
    const { service, calls } = fixture({ create: async () => { throw error; } }), token = await session(service);
    const response = await service.handle(turn(token));
    assert.equal(response.status, expected); assert.equal(calls.length, 1);
    const body = await response.text(); assert(!body.includes('synthetic-private-canary')); assert(!body.includes('synthetic-secret'));
  }
  const { provider, calls } = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.propose(action, context, controller.signal), error => error.code === 'EDEN_PROVIDER_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

test('per-session minute, concurrency and expiration controls apply before outbound work', async () => {
  let now = 0;
  let releaseProvider;
  const blocked = new Promise(resolve => { releaseProvider = resolve; });
  const { service, calls } = fixture({ now: () => now, create: async () => { await blocked; return completed(); } });
  const token = await session(service), pending = service.handle(turn(token));
  // Reading Request bodies is async; wait until the fake outbound call starts.
  while (!calls.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await service.handle(turn(token))).status, 429);
  releaseProvider(); assert.equal((await pending).status, 200);
  assert.equal((await service.handle(turn(token))).status, 200);
  assert.equal((await service.handle(turn(token))).status, 200);
  assert.equal((await service.handle(turn(token))).status, 429);
  assert.equal(calls.length, 3);
  now += 60_000;
  assert.equal((await service.handle(turn(token))).status, 200);
});

test('development budgets count failures and cannot be bypassed with a second session', () => {
  let now = 0;
  const limits = createEdenLimits({ now: () => now }), first = limits.createSession(origin).sessionToken;
  for (let count = 0; count < 20; count += 1) { now = Math.floor(count / 3) * 60_000; limits.admit(first, origin, 'turn')(); }
  assert.throws(() => limits.admit(first, origin, 'turn'), error => error.code === 'EDEN_USAGE_LIMIT');
  const second = limits.createSession(origin).sessionToken;
  for (let count = 0; count < 20; count += 1) { now = 7 * 60_000 + Math.floor(count / 3) * 60_000; limits.admit(second, origin, 'turn')(); }
  const third = limits.createSession(origin).sessionToken;
  assert.throws(() => limits.admit(third, origin, 'turn'), error => error.code === 'EDEN_USAGE_LIMIT');
  assert.throws(() => limits.authorize('a'.repeat(43), origin), error => error.status === 401);
});

test('session issuance and approved speech use the same authenticated development limits', async () => {
  const speechCalls = [];
  const speechProvider = { status: () => ({ available: true, reason: 'available', voice: 'Aoede', model: 'gemini-3.8-flash-lite-tts' }), generate: async phrase => {
    speechCalls.push(phrase); throw Object.assign(new Error('synthetic-private-canary'), { status: 503 });
  } };
  const { service } = fixture({ speechProvider }), token = await session(service);
  assert.equal((await service.handle(request('/eden/speech', { phrase: 'welcome', ...notice }))).status, 401);
  assert.equal((await service.handle(request('/eden/speech', { phrase: 'welcome', text: 'synthetic-private-canary', ...notice }, { token }))).status, 422);
  assert.equal((await service.handle(request('/eden/speech', { phrase: 'synthetic-private-canary', ...notice }, { token }))).status, 422);
  const response = await service.handle(request('/eden/speech', { phrase: 'welcome', ...notice }, { token }));
  assert.equal(response.status, 503); assert(!String(await response.text()).includes('synthetic-private-canary'));
  assert.deepEqual(speechCalls, ['welcome']);
  for (let count = 1; count < 6; count += 1) await session(service);
  assert.equal((await service.handle(request('/eden/session', sessionBody))).status, 429);
  assert.equal((await service.handle(request('/eden/session', undefined, { method: 'DELETE', token }))).status, 200);
  assert.equal((await service.handle(turn(token))).status, 401);
});

test('integrated app routing preserves EDEN denial and never falls through to account or database access', async () => {
  const { service, calls } = fixture();
  const unavailable = () => { throw new Error('EDEN must not access this synthetic account or database'); };
  const deps = { eden: service, repo: new Proxy({}, { get: unavailable }), verifyToken: unavailable, resolvePlace: unavailable, allowDemo: false };
  for (const path of ['/api/v1/eden/session', '/api/v1?path=eden/session']) {
    const response = await handleApi(request(path, sessionBody, { url: 'https://public.example.invalid', headers: { 'x-forwarded-host': '127.0.0.1:8787' } }), deps);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('x-request-id'), /^[a-f\d-]{36}$/);
  }
  const absentDependency = { ...deps }; delete absentDependency.eden;
  assert.equal((await handleApi(request('/api/v1/eden/session', sessionBody), absentDependency)).status, 403);
  const response = await handleApi(request('/api/v1/eden/session', sessionBody), deps);
  assert.equal(response.status, 200);
  const token = (await response.json()).sessionToken;
  const valid = await handleApi(request('/api/v1?path=eden/turn', { action, context, ...notice }, { token }), deps);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { engine: 'gemini', action, phrase: 'search_ready' });
  assert.equal(calls.length, 1);
});

test('installed official SDK serializes reviewed Interactions schema and makes no retry through a fake transport', async () => {
  const { provider, calls } = fixture();
  await provider.propose(action, context);
  const payload = calls[0].payload, captured = [];
  let replyStatus = 200;
  // This transport never delegates to fetch/network. The synthetic key is an
  // explicit constructor argument; no local configuration file is loaded.
  const client = new GoogleGenAI({ apiKey: 'synthetic-nonsecret-sdk-fixture', apiVersion: 'v1beta', enterprise: false, vertexai: false, httpOptions: {
    baseUrl: 'https://generativelanguage.googleapis.com', timeout: 1000, retryOptions: { attempts: 1 },
    fetch: async (input, init) => {
      const outbound = input instanceof Request ? input : new Request(input, init);
      captured.push({ url: outbound.url, method: outbound.method, body: await outbound.json() });
      return new Response(JSON.stringify(replyStatus === 200
        ? { id: 'synthetic-interaction', model: payload.model, ...completed(), steps: [{ ...completed().steps[0], id: 'synthetic-call' }] }
        : { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'synthetic-quota' } }), { status: replyStatus, headers: { 'content-type': 'application/json' } });
    },
  } });
  const result = await client.interactions.create(payload, { retries: { strategy: 'none' }, timeout_ms: 1000 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(captured[0].method, 'POST');
  assert.equal(captured[0].body.store, false);
  assert.equal('automatic_continuation' in captured[0].body, false);
  assert.deepEqual(captured[0].body.generation_config, payload.generation_config);
  assert.deepEqual(result.steps[0].arguments, action);
  assert.equal(result.steps[0].type, 'function_call');
  replyStatus = 429;
  await assert.rejects(client.interactions.create(payload, { retries: { strategy: 'none' }, timeout_ms: 1000 }));
  assert.equal(captured.length, 2, '429 must make exactly one additional attempted request');
});
