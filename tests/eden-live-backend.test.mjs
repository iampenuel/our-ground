import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { GoogleGenAI } from '@google/genai';
import { createEdenService } from '../backend/eden-api.ts';
import { createEdenLive, EDEN_LIVE_LIMITS } from '../backend/eden-live.ts';
import { attestLocalDevelopmentRequest, isAttestedLocalDevelopmentRequest } from '../backend/local-transport.ts';
import { DemoRepository } from '../backend/demo.ts';
import { EDEN_NOTICE_VERSION } from '../shared/eden-assistant.ts';
import { buildEdenLiveConfig, buildEdenLiveSetup } from '../shared/eden-live.ts';

// Fictional credentials, local sockets and injected mint responses only.
// This suite never reads configuration or connects to an AI provider.
const start = Date.UTC(2026, 10, 7, 12), origin = 'http://127.0.0.1:5199', reviewerCode = 'R'.repeat(43);
const env = { GEMINI_API_KEY: 'synthetic-live-nonsecret-key', EDEN_GEMINI_MODE: 'synthetic-development', EDEN_GEMINI_FREE_TIER_CONFIRMED: 'true',
  EDEN_REVIEWER_CODE_SHA256: createHash('sha256').update(reviewerCode).digest('hex'), EDEN_REVIEWER_EXPIRES_AT: new Date(start + 3600_000).toISOString(),
  EDEN_REVIEWER_ADULT_VERIFIED: 'true', EDEN_REVIEWER_COUNTRY: 'US', EDEN_LOCAL_OWNER_ENABLED: 'true',
  EDEN_GEMINI_LIVE_ENABLED: 'true', EDEN_GEMINI_LIVE_MODEL: 'gemini-3.8-live', EDEN_GEMINI_LIVE_MODEL_CONFIRMED: 'true', BACKEND_DATA_MODE: 'demo', ALLOW_DEMO_DATA: 'true' };
const home = { page: 'home', resultCount: 0, synthetic: true, resourceIds: [] };
const support = { page: 'support', category: 'food', cityId: 'harrisburg-pa', radius: 10, resultCount: 1, synthetic: true, resourceIds: ['11111111-1111-4111-8111-111111111111'] };
const notice = { noticeVersion: EDEN_NOTICE_VERSION };
const sessionBody = { ...notice, adultConfirmed: true, privacyAcknowledged: true };
const mintBody = (nonce = 'N'.repeat(43)) => ({ ...notice, nonce, liveAudioAcknowledged: true });
const binding = value => createHash('sha256').update(value).digest('hex');

async function fixture(t, options = {}) {
  let now = start;
  const calls = [], repository = options.repository ?? new DemoRepository(), config = { ...env, ...options.env };
  const live = createEdenLive(config, { now: () => now, create: async (payload, signal) => {
    calls.push({ payload, signal });
    return options.create ? options.create(payload, signal) : { name: 'auth_tokens/synthetic-token-' + calls.length, expireTime: payload.config.expireTime, newSessionExpireTime: payload.config.newSessionExpireTime, uses: 1 };
  } });
  const service = createEdenService(config, { live, agentRepository: repository, now: () => now });
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks), request = new Request('http://' + incoming.headers.host + incoming.url, { method: incoming.method, headers: incoming.headers,
      ...(body.length ? { body } : {}) });
    attestLocalDevelopmentRequest(request, server, incoming.socket);
    const response = await service.handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = (path, body, token, options = {}) => fetch(url + path, { method: options.method ?? 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: 'EdenSession ' + token } : {}), ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const session = async (body = sessionBody, options) => { const response = await request('/eden/session', body, undefined, options); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).sessionToken; };
  return { service, live, calls, repository, request, session, advance(ms) { now += ms; }, now: () => now };
}

test('owner admission requires actual loopback transport; URL, header or flag alone is insufficient', async t => {
  const f = await fixture(t), direct = new Request('http://127.0.0.1:8787/eden/session', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-eden-local-owner': 'true' }, body: JSON.stringify(sessionBody) });
  assert.equal(isAttestedLocalDevelopmentRequest(direct), false);
  assert.equal(attestLocalDevelopmentRequest(direct, { listening: true, address: () => ({ address: '127.0.0.1', port: 8787 }) }, { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1', localPort: 8787 }), false, 'plain objects cannot impersonate Node transport evidence');
  assert.equal(f.service.status(direct).reviewerCodeRequired, true);
  assert.equal((await f.service.handle(direct)).status, 403);
  const status = await (await f.request('/eden/status', undefined, undefined, { method: 'GET' })).json();
  assert.equal(status.localOwnerAvailable, true); assert.equal(status.reviewerCodeRequired, false); assert.equal(status.liveAvailable, true);
  const session = await f.request('/eden/session', sessionBody); const value = await session.json();
  assert.equal(value.reviewerAuthorized, true); assert.match(value.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  for (const name of ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host']) {
    const response = await f.request('/eden/session', sessionBody, undefined, { headers: { [name]: '127.0.0.1' } }); assert.equal(response.status, 403);
  }
  assert.equal(f.calls.length, 0);
});

test('reviewer-code path remains separate and hosted/expired/unverified owner flags fail closed', async t => {
  for (const overrides of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { EDEN_REVIEWER_ADULT_VERIFIED: 'false' }, { EDEN_REVIEWER_COUNTRY: 'GB' }, { EDEN_GEMINI_FREE_TIER_CONFIRMED: 'false' }, { EDEN_REVIEWER_EXPIRES_AT: new Date(start - 1).toISOString() }]) {
    const f = await fixture(t, { env: overrides }); assert.equal((await f.request('/eden/session', sessionBody)).status, 403); assert.equal(f.calls.length, 0);
  }
  const f = await fixture(t, { env: { EDEN_LOCAL_OWNER_ENABLED: 'false' } });
  assert.equal((await f.request('/eden/session', sessionBody)).status, 403);
  const token = await f.session({ ...sessionBody, reviewerCode });
  const response = await f.request('/eden/live/token', mintBody(), token); assert.equal(response.status, 200);
  assert.equal((await f.request('/eden/session', { ...sessionBody, reviewerCode: 'X'.repeat(43) })).status, 403);
});

test('mint locks current v1beta model/Aoede/tools, uses1 and bounded expiry without returning a permanent key', async t => {
  const f = await fixture(t), token = await f.session(), response = await f.request('/eden/live/token', { ...mintBody(), context: home }, token);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const value = await response.json(), payload = f.calls[0].payload.config;
  assert.equal(value.voiceName, 'Aoede'); assert.equal(value.model, 'gemini-3.8-live'); assert.match(value.callId, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(value.config, buildEdenLiveConfig()); assert.equal(payload.uses, 1); assert.equal(payload.lockAdditionalFields, undefined);
  assert.deepEqual(payload.liveConnectConstraints, { model: 'gemini-3.8-live', config: value.config });
  assert.equal(payload.httpOptions.apiVersion, 'v1beta'); assert.equal(payload.httpOptions.baseUrl, 'https://generativelanguage.googleapis.com'); assert.deepEqual(payload.httpOptions.retryOptions, { attempts: 1 });
  assert.equal(Date.parse(value.expiresAt) - start, 300_000); assert.equal(Date.parse(value.newSessionExpiresAt) - start, 60_000);
  assert(!JSON.stringify(value).includes(env.GEMINI_API_KEY)); assert(!JSON.stringify(f.calls).includes(reviewerCode)); assert(!JSON.stringify(f.calls).includes(token));
});

test('invalid consent, arbitrary context/config and cross-origin requests never mint', async t => {
  const f = await fixture(t), token = await f.session();
  for (const body of [{ ...mintBody(), liveAudioAcknowledged: false }, { ...mintBody(), model: 'paid-model' }, { ...mintBody(), config: {} }, { ...mintBody(), message: 'synthetic-private-canary' }, { ...mintBody(), context: { ...home, name: 'synthetic-private-canary' } }, { ...mintBody(), nonce: 'short' }, { ...mintBody(), noticeVersion: 'old' }]) {
    const response = await f.request('/eden/live/token', body, token); assert(response.status >= 400); assert(!(await response.text()).includes('synthetic-private-canary'));
  }
  assert.equal((await f.request('/eden/live/token', mintBody(), token, { headers: { origin: 'https://outside.invalid' } })).status, 403);
  assert.equal((await f.request('/eden/live/token', mintBody(), token, { headers: { 'x-forwarded-for': '127.0.0.1' } })).status, 403);
  assert.equal((await f.request('/eden/live/token', mintBody())).status, 401); assert.equal(f.calls.length, 0);
});

test('nonce reuse, early hangup and two unexpired leases cannot create unbounded calls', async t => {
  const f = await fixture(t), token = await f.session();
  const first = await (await f.request('/eden/live/token', mintBody(), token)).json();
  assert.equal((await f.request('/eden/live/token', mintBody(), token)).status, 409);
  assert.equal((await f.request('/eden/live/token', { ...notice, callId: first.callId }, token, { method: 'DELETE' })).status, 200);
  const second = await f.request('/eden/live/token', mintBody('M'.repeat(43)), token); assert.equal(second.status, 200);
  const secondValue = await second.json();
  await f.request('/eden/live/token', { ...notice, callId: secondValue.callId }, token, { method: 'DELETE' });
  f.advance(60_000); assert.equal((await f.request('/eden/live/token', mintBody('O'.repeat(43)), token)).status, 409);
  assert.equal(f.calls.length, 2);
  f.advance(240_000); assert.equal((await f.request('/eden/live/token', mintBody('P'.repeat(43)), token)).status, 200);
});

test('one authenticated recovery keeps its original deadline and consumes another mint credit', async t => {
  const f = await fixture(t), token = await f.session(), first = await (await f.request('/eden/live/token', mintBody(), token)).json();
  f.advance(30_000);
  const response = await f.request('/eden/live/token', { ...mintBody('M'.repeat(43)), callId: first.callId, resumeHandle: 'synthetic_opaque_recovery' }, token);
  assert.equal(response.status, 200); const recovered = await response.json();
  assert.equal(recovered.callId, first.callId); assert.equal(recovered.expiresAt, first.expiresAt);
  assert.deepEqual(recovered.config.sessionResumption, { handle: 'synthetic_opaque_recovery' });
  assert.equal((await f.request('/eden/live/token', { ...mintBody('O'.repeat(43)), callId: first.callId, resumeHandle: 'second' }, token)).status, 409);
  assert.equal(f.calls.length, 2);
});

test('tool proposal and actual result are one-shot and reconciled with the same public demo repository', async t => {
  const f = await fixture(t), token = await f.session(), call = await (await f.request('/eden/live/token', mintBody(), token)).json();
  const tool = { ...notice, callId: call.callId, id: 'tool:1', name: 'perform_public_resource_action', args: { type: 'search', category: 'food', city: 'harrisburg-pa', radius: 10 }, context: home };
  const response = await f.request('/eden/live/tool', tool, token); assert.equal(response.status, 200); const proposal = await response.json();
  assert.deepEqual(proposal.action, tool.args); assert.match(proposal.toolToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await f.request('/eden/live/tool', tool, token)).status, 409);
  const complete = { ...notice, callId: call.callId, id: tool.id, toolToken: proposal.toolToken, outcome: 'done', context: support };
  const done = await f.request('/eden/live/result', complete, token); assert.equal(done.status, 200); const result = await done.json();
  assert.equal(result.outcome, 'done'); assert(result.facts.some(fact => fact.text === 'Demo Community Pantry — fictional')); assert(result.facts.some(fact => fact.text === 'Your search is ready.'));
  assert.equal((await f.request('/eden/live/result', complete, token)).status, 409);
  const read = await f.request('/eden/live/tool', { ...notice, callId: call.callId, id: 'read-2', name: 'read_public_page_context', args: {}, context: { ...support, selectedIndex: 1 } }, token);
  assert.equal(read.status, 200); const readResult = await read.json(); assert.equal(readResult.toolToken, null); assert.equal(readResult.result.context.selectedIndex, 1);
  assert.equal(f.calls.length, 1, 'tool reconciliation performs no additional model calls');
});

test('invented resources, private action fields, stale IDs and session deletion cannot authorize Live actions', async t => {
  const f = await fixture(t), token = await f.session(), call = await (await f.request('/eden/live/token', mintBody(), token)).json();
  for (const [index, args] of [{ type: 'donate', amount: 5 }, { type: 'search', category: 'food', city: 'harrisburg-pa', radius: 10, description: 'synthetic-private-canary' }, { type: 'details', index: 2 }].entries()) {
    const response = await f.request('/eden/live/tool', { ...notice, callId: call.callId, id: 'bad-' + index, name: 'perform_public_resource_action', args, context: support }, token); assert(response.status >= 400); assert(!(await response.text()).includes('synthetic-private-canary'));
  }
  const mismatch = await f.request('/eden/live/tool', { ...notice, callId: call.callId, id: 'stale', name: 'read_public_page_context', args: {}, context: { ...support, category: 'healthcare' } }, token); assert.equal(mismatch.status, 409);
  await f.request('/eden/session', undefined, token, { method: 'DELETE' });
  assert.equal((await f.request('/eden/live/tool', { ...notice, callId: call.callId, id: 'after-end', name: 'read_public_page_context', args: {}, context: home }, token)).status, 401);
});

test('mint quota failures and grant expiry expose only safe codes with no credential or provider error leakage', async t => {
  const f = await fixture(t, { create: async () => { throw Object.assign(new Error('synthetic-private-canary'), { status: 429 }); } }), token = await f.session();
  const response = await f.request('/eden/live/token', mintBody(), token); assert.equal(response.status, 429); const body = await response.text(); assert(body.includes('EDEN_LIVE_PROVIDER_QUOTA')); assert(!body.includes('synthetic-private-canary')); assert(!body.includes(env.GEMINI_API_KEY)); assert.equal(f.calls.length, 1);
  f.advance(3600_000); assert.equal((await f.request('/eden/live/token', mintBody('M'.repeat(43)), token)).status, 403); assert.equal(f.calls.length, 1);
});

test('provider expiry/session/day limits and live flags remain bounded without a network transport', async () => {
  let now = start, calls = 0;
  const live = createEdenLive(env, { now: () => now, create: async () => ({ name: 'auth_tokens/synthetic-' + (++calls) }) });
  const short = await live.mint(binding('short'), 'S'.repeat(43), now + 30_000);
  assert.equal(Date.parse(short.expiresAt), start + 30_000); assert.equal(short.maxCallSeconds, 30);
  now += 30_000;
  for (let index = 0; index < EDEN_LIVE_LIMITS.mintsPerDay - 1; index++) { await live.mint(binding('session-' + index), String(index).repeat(43), now + 900_000); now += 300_000; }
  await assert.rejects(live.mint(binding('exhausted'), 'Z'.repeat(43), now + 900_000), error => error.code === 'EDEN_LIVE_USAGE_LIMIT');
  assert.equal(calls, 6);
  for (const overrides of [{ EDEN_GEMINI_LIVE_MODEL: 'gemini-paid-model' }, { EDEN_GEMINI_LIVE_MODEL_CONFIRMED: 'false' }, { EDEN_GEMINI_LIVE_ENABLED: 'false' }, { BACKEND_DATA_MODE: 'supabase' }]) assert.equal(createEdenLive({ ...env, ...overrides }).status().available, false);
});

test('an expired grant during mint suppresses the credential and malformed provider output is never repaired', async t => {
  let f;
  f = await fixture(t, { create: async () => { f.advance(3600_000); return { name: 'auth_tokens/not-released' }; } });
  const token = await f.session(), response = await f.request('/eden/live/token', mintBody(), token);
  assert.equal(response.status, 503); assert(!(await response.text()).includes('not-released'));
  for (const output of [{ name: env.GEMINI_API_KEY }, { name: 'auth_tokens/' + env.GEMINI_API_KEY }, { name: 'synthetic-private-canary' }, { name: 'auth_tokens/otherwise-valid', uses: 0 }, { name: 'auth_tokens/otherwise-valid', expireTime: new Date(start + 3600_000).toISOString() }]) {
    const live = createEdenLive(env, { now: () => start, create: async () => output });
    await assert.rejects(live.mint(binding('malformed'), 'N'.repeat(43), start + 900_000), error => error.code === 'EDEN_LIVE_INVALID_TOKEN' && !error.message.includes('synthetic-private-canary'));
  }
});

test('changed server records and mismatched application completion facts never reach a Live tool response', async t => {
  const f = await fixture(t), token = await f.session(), call = await (await f.request('/eden/live/token', mintBody(), token)).json();
  const proposal = await (await f.request('/eden/live/tool', { ...notice, callId: call.callId, id: 'search', name: 'perform_public_resource_action', args: { type: 'search', category: 'food', city: 'harrisburg-pa', radius: 10 }, context: home }, token)).json();
  const mismatch = await f.request('/eden/live/result', { ...notice, callId: call.callId, id: 'search', toolToken: proposal.toolToken, outcome: 'done', context: { ...support, radius: 5 } }, token);
  assert.equal(mismatch.status, 409);
  const repo = new DemoRepository('sample-editor'), edited = await fixture(t, { repository: repo }), editedToken = await edited.session();
  const account = await repo.account('sample-editor'); await repo.updateService(support.resourceIds[0], account, 1, { title: 'synthetic-private-canary' });
  const editedCall = await (await edited.request('/eden/live/token', mintBody(), editedToken)).json();
  const response = await edited.request('/eden/live/tool', { ...notice, callId: editedCall.callId, id: 'read', name: 'read_public_page_context', args: {}, context: support }, editedToken);
  assert.equal(response.status, 503); assert(!(await response.text()).includes('synthetic-private-canary'));
});

test('installed SDK serializes full locked v1beta setup and does not retry quota errors through a fake fetch', async () => {
  let payload;
  const live = createEdenLive(env, { now: () => start, create: async request => { payload = request; return { name: 'auth_tokens/synthetic-transport-token' }; } });
  const initial = await live.mint(binding('sdk'), 'N'.repeat(43), start + 900_000);
  const captured = []; let status = 200;
  const client = new GoogleGenAI({ apiKey: 'synthetic-sdk-nonsecret', apiVersion: 'v1beta', enterprise: false, vertexai: false, httpOptions: {
    baseUrl: 'https://generativelanguage.googleapis.com', retryOptions: { attempts: 1 },
    fetch: async (input, init) => { const request = input instanceof Request ? input : new Request(input, init); captured.push({ url: request.url, body: await request.json() });
      return new Response(JSON.stringify(status === 200 ? { name: 'auth_tokens/synthetic-sdk-token' } : { error: { code: 429, message: 'synthetic-quota' } }), { status, headers: { 'content-type': 'application/json' } }); },
  } });
  await client.authTokens.create(payload);
  assert.equal(captured.length, 1); assert.equal(captured[0].url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  const body = captured[0].body, setup = body.bidiGenerateContentSetup;
  assert.deepEqual(setup,buildEdenLiveSetup(initial.config),'captured SDK token constraints must exactly match the browser wire setup, including history mode');
  assert.deepEqual(Object.keys(body).sort(),['bidiGenerateContentSetup','expireTime','newSessionExpireTime','uses']);
  assert.equal(body.expireTime,initial.expiresAt);assert.equal(body.newSessionExpireTime,initial.newSessionExpiresAt);
  assert.equal(body.uses, 1); assert.equal(body.fieldMask, undefined); assert.equal(setup.model, 'models/gemini-3.8-live');
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
  assert.deepEqual(setup.tools[0].functionDeclarations.map(tool => tool.name), ['read_public_page_context', 'perform_public_resource_action', 'ask_clarification']);
  assert(!JSON.stringify(body).includes(env.GEMINI_API_KEY));
  const recovered=await live.mint(binding('sdk'),'Q'.repeat(43),start+900_000,undefined,{callId:initial.callId,handle:'synthetic-resumption-handle'});
  assert.equal(payload.config.httpOptions.extraBody,undefined,'resumed sessions do not re-enter initial-history mode');
  await client.authTokens.create(payload);assert.deepEqual(captured[1].body.bidiGenerateContentSetup,buildEdenLiveSetup(recovered.config));
  assert.equal(Object.hasOwn(captured[1].body.bidiGenerateContentSetup,'historyConfig'),false);
  status = 429; await assert.rejects(client.authTokens.create(payload)); assert.equal(captured.length, 3);
});
