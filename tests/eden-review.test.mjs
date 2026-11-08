import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createEdenPlanner, EDEN_REVIEW_TOOL, EDEN_REVIEW_MAX_OUTPUT_TOKENS, EDEN_REVIEW_TIMEOUT_MS } from '../backend/eden-planner.ts';
import { createEdenService } from '../backend/eden-api.ts';
import { EDEN_NOTICE_VERSION } from '../shared/eden-assistant.ts';
import {
  EDEN_REVIEW_SCENARIOS, edenReviewContext, edenReviewAdmissibleCandidates,
  validateEdenPlanRequest, validateEdenReviewPlan, validateEdenPlanResponse, edenPlanExplanation, edenReviewChoiceMatchesPriorities,
} from '../shared/eden-review.ts';

// All inputs, codes, keys, model responses and clocks below are fictional.
// No configuration files, credentials, network transport or live API is used.
const nowStart = Date.UTC(2026, 10, 6, 15);
const reviewerCode = 'R'.repeat(43);
const env = {
  EDEN_GEMINI_MODE: 'synthetic-development', EDEN_GEMINI_FREE_TIER_CONFIRMED: 'true', GEMINI_API_KEY: 'synthetic-nonsecret-planner-key',
  EDEN_REVIEWER_CODE_SHA256: createHash('sha256').update(reviewerCode).digest('hex'),
  EDEN_REVIEWER_EXPIRES_AT: new Date(nowStart + 5 * 60_000).toISOString(), EDEN_REVIEWER_ADULT_VERIFIED: 'true', EDEN_REVIEWER_COUNTRY: 'US',
};
const origin = 'http://127.0.0.1:5199';
const planRequest = (scenarioId = 'food-step-free') => ({ scenarioId, context: edenReviewContext(scenarioId), noticeVersion: EDEN_NOTICE_VERSION });
const stepFreePlan = { scenarioId: 'food-step-free', action: { type: 'select', index: 3 }, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW', 'LONGER_TRAVEL'] };
const shortTripPlan = { scenarioId: 'food-short-trip', action: { type: 'select', index: 1 }, reasonCodes: ['WITHIN_FIVE_MILES', 'OPEN_NOW', 'NEAREST_ADMISSIBLE'] };
const responseFor = plan => ({ status: 'requires_action', steps: [{ type: 'function_call', name: EDEN_REVIEW_TOOL, id: 'sample-call', arguments: plan }] });
function request(path, body, token, options = {}) {
  return new Request((options.url ?? 'http://127.0.0.1:8787') + path, { method: options.method ?? 'POST',
    headers: { origin: options.origin ?? origin, 'content-type': 'application/json', ...(token ? { authorization: 'EdenSession ' + token } : {}), ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const sessionBody = (code = reviewerCode) => ({ adultConfirmed: true, privacyAcknowledged: true, noticeVersion: EDEN_NOTICE_VERSION, ...(code === null ? {} : { reviewerCode: code }) });
function fixture(options = {}) {
  const configuration = options.env ?? env, calls = [];
  const planner = createEdenPlanner(configuration, { create: async (payload, signal) => {
    calls.push({ payload, signal });
    if (options.create) return options.create(payload, signal);
    return responseFor(JSON.parse(payload.input).scenario.id === 'food-step-free' ? stepFreePlan : shortTripPlan);
  } });
  const service = createEdenService(configuration, { planner, provider: options.provider, speechProvider: options.speechProvider, now: options.now ?? (() => nowStart) });
  return { planner, service, calls };
}
async function session(service, code = reviewerCode) {
  const response = await service.handle(request('/eden/session', sessionBody(code)));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.reviewerAuthorized, code !== null);
  return result.sessionToken;
}

test('fixed sample scenarios offer real admissible tradeoffs and different priorities', () => {
  assert.equal(EDEN_REVIEW_SCENARIOS.length, 2);
  assert.deepEqual(edenReviewAdmissibleCandidates('food-step-free').map(candidate => candidate.index), [2, 3]);
  assert.deepEqual(edenReviewAdmissibleCandidates('food-short-trip').map(candidate => candidate.index), [1, 2]);
  assert.deepEqual(EDEN_REVIEW_SCENARIOS[0].priorities, ['open-now', 'shorter-distance']);
  assert.deepEqual(EDEN_REVIEW_SCENARIOS[1].priorities, ['shorter-distance', 'open-now']);
  assert(Object.isFrozen(EDEN_REVIEW_SCENARIOS[0].candidates[0]));
  assert.throws(() => { EDEN_REVIEW_SCENARIOS[0].candidates[0].hours = 'invented'; });
});

test('plan boundary permits multiple admissible choices rather than forcing an echo', () => {
  assert.deepEqual(validateEdenReviewPlan(stepFreePlan), stepFreePlan);
  const alternative = { scenarioId: 'food-step-free', action: { type: 'select', index: 2 }, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_LATER_TODAY', 'NEAREST_ADMISSIBLE'] };
  assert.deepEqual(validateEdenReviewPlan(alternative), alternative);
  const shortAlternative = { scenarioId: 'food-short-trip', action: { type: 'select', index: 2 }, reasonCodes: ['WITHIN_FIVE_MILES', 'OPEN_LATER_TODAY', 'LONGER_TRAVEL'] };
  assert.deepEqual(validateEdenReviewPlan(shortAlternative), shortAlternative);
  assert.equal(edenReviewChoiceMatchesPriorities(alternative), false);
  assert.equal(edenReviewChoiceMatchesPriorities(shortAlternative), false);
  assert.equal(edenReviewChoiceMatchesPriorities(stepFreePlan), true);
  assert.equal(edenReviewChoiceMatchesPriorities(shortTripPlan), true);
  assert.deepEqual(validateEdenPlanResponse({ engine: 'gemini', ...shortTripPlan }, 'food-short-trip'), { engine: 'gemini', ...shortTripPlan });
  assert(edenPlanExplanation(stepFreePlan).includes('Sample Oak Pantry'));
  assert(edenPlanExplanation(stepFreePlan).includes('more travel'));
});

test('validators reject fabricated facts, new actions, extra prose and scenario escalation', () => {
  const badPlans = [
    { ...stepFreePlan, action: { type: 'select', index: 1 } },
    { ...shortTripPlan, action: { type: 'select', index: 3 } },
    { ...stepFreePlan, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_LATER_TODAY'] },
    { ...stepFreePlan, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW', 'NEAREST_ADMISSIBLE'] },
    { ...stepFreePlan, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW', 'synthetic-private-canary'] },
    { ...stepFreePlan, reasonCodes: ['OPEN_NOW', 'LONGER_TRAVEL'] },
    { ...stepFreePlan, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW', 'OPEN_NOW'] },
    { ...stepFreePlan, prose: 'synthetic-private-canary' },
    { ...stepFreePlan, action: { type: 'donate', amount: 1 } },
    { ...stepFreePlan, action: { type: 'details', index: 3 } },
    { ...stepFreePlan, action: { type: 'select', index: 3, url: 'https://example.invalid' } },
    { ...stepFreePlan, actions: [stepFreePlan.action, shortTripPlan.action] },
  ];
  for (const plan of badPlans) assert.equal(validateEdenReviewPlan(plan), null);
  assert.equal(validateEdenReviewPlan(stepFreePlan, 'food-short-trip'), null);
  assert.equal(validateEdenPlanResponse({ engine: 'local', ...stepFreePlan }), null);
  const good = planRequest();
  for (const body of [
    { ...good, message: 'synthetic-private-canary' }, { ...good, goal: 'arbitrary' },
    { ...good, candidates: [] }, { ...good, reviewerCode }, { ...good, scenarioId: 'arbitrary' },
    { ...good, context: { ...good.context, synthetic: false } }, { ...good, context: { ...good.context, resultCount: 2 } },
    { ...good, context: { ...good.context, radius: 10 } }, { ...good, context: { ...good.context, category: 'healthcare' } },
    { ...good, context: { ...good.context, name: 'synthetic-private-canary' } },
  ]) assert.equal(validateEdenPlanRequest(body), null);
});

test('model compares server-owned enum facts, selects different choices and returns fixed reason labels', async () => {
  const { planner, calls } = fixture();
  assert.deepEqual(await planner.plan(planRequest('food-step-free')), stepFreePlan);
  assert.deepEqual(await planner.plan(planRequest('food-short-trip')), shortTripPlan);
  assert.equal(calls.length, 2);
  const payload = calls[0].payload, input = JSON.parse(payload.input);
  assert.deepEqual(input.scenario.admissible_indices, [2, 3]);
  assert.equal('requested_action' in input, false);
  assert.deepEqual(payload.tools[0].parameters.properties.action.properties.index.enum, [2, 3]);
  assert.equal(payload.store, false); assert.equal(payload.automatic_continuation, false);
  assert.equal(payload.generation_config.max_output_tokens, EDEN_REVIEW_MAX_OUTPUT_TOKENS);
  assert.equal(EDEN_REVIEW_MAX_OUTPUT_TOKENS, 1024); assert.equal(EDEN_REVIEW_TIMEOUT_MS, 15_000);
  assert.equal(payload.generation_config.thinking_level, 'low');
  assert.equal(input.scenario.comparison_rule, 'lexicographic_first_difference');
  assert.equal(payload.generation_config.thinking_summaries, 'none');
  for (const candidate of input.scenario.candidates) assert.deepEqual(Object.keys(candidate).sort(), ['access', 'distanceMiles', 'hours', 'index']);
  for (const forbidden of [reviewerCode, env.GEMINI_API_KEY, 'Sample Oak', 'Maple Pantry', 'https://']) assert(!JSON.stringify(payload).includes(forbidden));
  assert(!payload.input.includes('description'));
});

test('truthful but lower-ranked model choices are rejected without retries or substituted actions', async () => {
  const alternatives = [
    { scenarioId: 'food-step-free', action: { type: 'select', index: 2 }, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_LATER_TODAY', 'NEAREST_ADMISSIBLE'] },
    { scenarioId: 'food-short-trip', action: { type: 'select', index: 2 }, reasonCodes: ['WITHIN_FIVE_MILES', 'OPEN_LATER_TODAY', 'STEP_FREE_ACCESS'] },
  ];
  for (const alternative of alternatives) {
    assert(validateEdenReviewPlan(alternative), 'hard constraints and facts independently remain admissible');
    const { planner, calls } = fixture({ create: async () => responseFor(alternative) });
    await assert.rejects(planner.plan(planRequest(alternative.scenarioId)), error => error.code === 'EDEN_PLAN_PRIORITY_MISMATCH' && error.status === 503);
    assert.equal(calls.length, 1, 'quality rejection must not retry or choose a replacement');
  }
  const injected = { status: () => ({ available: true, reason: 'available', model: 'gemini-3.5-flash-lite' }), plan: async () => alternatives[0] };
  const service = createEdenService(env, { planner: injected, now: () => nowStart }), token = await session(service);
  const response = await service.handle(request('/eden/plan', planRequest(), token));
  assert.equal(response.status, 503);
  const output = await response.json();
  assert.equal(output.error.code, 'EDEN_PLAN_PRIORITY_MISMATCH'); assert.equal('action' in output, false);
});

test('invalid model plans, multiple tool calls, prose and quota errors fail safely without retry', async () => {
  const invalid = [
    responseFor({ ...stepFreePlan, action: { type: 'select', index: 1 } }),
    responseFor({ ...stepFreePlan, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW', 'synthetic-private-canary'] }),
    responseFor(shortTripPlan),
    { ...responseFor(stepFreePlan), status: 'requires_continuation' },
    { ...responseFor(stepFreePlan), steps: [responseFor(stepFreePlan).steps[0], responseFor(stepFreePlan).steps[0]] },
    { ...responseFor(stepFreePlan), steps: [{ type: 'model_output', content: [{ type: 'text', text: 'synthetic-private-canary' }] }] },
  ];
  for (const output of invalid) {
    const { planner, calls } = fixture({ create: async () => output });
    await assert.rejects(planner.plan(planRequest()), error => error.code === 'EDEN_INVALID_PROVIDER_PLAN' && !error.message.includes('synthetic-private-canary'));
    assert.equal(calls.length, 1);
  }
  const { planner, calls } = fixture({ create: async () => { throw Object.assign(new Error('synthetic-private-canary'), { status: 429 }); } });
  await assert.rejects(planner.plan(planRequest()), error => error.code === 'EDEN_PROVIDER_QUOTA' && !error.message.includes('synthetic-private-canary'));
  assert.equal(calls.length, 1);
});

test('reviewer grant readiness requires operator adult/US verification, valid hash and short expiry', async () => {
  const invalidEnvironments = [
    { ...env, EDEN_REVIEWER_ADULT_VERIFIED: undefined }, { ...env, EDEN_REVIEWER_ADULT_VERIFIED: 'false' },
    { ...env, EDEN_REVIEWER_COUNTRY: undefined }, { ...env, EDEN_REVIEWER_COUNTRY: 'GB' },
    { ...env, EDEN_REVIEWER_CODE_SHA256: undefined }, { ...env, EDEN_REVIEWER_CODE_SHA256: 'not-a-hash' },
    { ...env, EDEN_REVIEWER_EXPIRES_AT: new Date(nowStart - 1).toISOString() },
    { ...env, EDEN_REVIEWER_EXPIRES_AT: new Date(nowStart + 24 * 3_600_000 + 1).toISOString() },
    { ...env, EDEN_REVIEWER_EXPIRES_AT: 'tomorrow' },
  ];
  for (const configuration of invalidEnvironments) {
    const { service, calls } = fixture({ env: configuration });
    const status = service.status(request('/eden/status', undefined, undefined, { method: 'GET' }));
    assert.equal(status.reviewAvailable, false); assert.equal(status.reviewerCodeRequired, true);
    const response = await service.handle(request('/eden/session', sessionBody()));
    assert.equal(response.status, 403); assert.equal(calls.length, 0);
  }
});

test('plan requires reviewer-authorized session; a checkbox or legacy session cannot authorize it', async () => {
  const { service, calls } = fixture();
  assert.equal(service.status(request('/eden/status', undefined, undefined, { method: 'GET' })).reviewAvailable, true);
  for (const code of ['', 'x'.repeat(43), 123, 'x'.repeat(1000)]) {
    const response = await service.handle(request('/eden/session', sessionBody(code)));
    assert.equal(response.status, 403); const text = await response.text(); if (code !== '') assert(!text.includes(String(code)));
  }
  assert.equal((await service.handle(request('/eden/session', sessionBody(null)))).status, 403);
  assert.equal((await service.handle(request('/eden/plan', planRequest()))).status, 401);
  const token = await session(service);
  assert.equal((await service.handle(request('/eden/plan', planRequest(), token, { origin: 'http://localhost:5199' }))).status, 401);
  for (const body of [{ ...planRequest(), message: 'synthetic-private-canary' }, { ...planRequest(), candidates: [] }]) {
    const response = await service.handle(request('/eden/plan', body, token)); assert.equal(response.status, 422);
    assert(!(await response.text()).includes('synthetic-private-canary'));
  }
  assert.equal(calls.length, 0);
  const response = await service.handle(request('/eden/plan', planRequest(), token));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { engine: 'gemini', ...stepFreePlan });
  assert.equal(calls.length, 1);
  assert(!JSON.stringify(calls).includes(token)); assert(!JSON.stringify(calls).includes(reviewerCode));
});

test('review expiry disables existing reviewer sessions and reauthentication before provider work', async () => {
  let now = nowStart;
  const { service, calls } = fixture({ now: () => now }), token = await session(service);
  now += 5 * 60_000;
  assert.equal(service.status(request('/eden/status', undefined, undefined, { method: 'GET' })).reviewAvailable, false);
  assert.equal((await service.handle(request('/eden/plan', planRequest(), token))).status, 403);
  assert.equal((await service.handle(request('/eden/session', sessionBody()))).status, 403);
  assert.equal(calls.length, 0);
});

test('review expiry during a provider response suppresses the proposal', async () => {
  let now = nowStart;
  const { service, calls } = fixture({ now: () => now, create: async () => {
    now += 5 * 60_000;
    return responseFor(stepFreePlan);
  } }), token = await session(service);
  const response = await service.handle(request('/eden/plan', planRequest(), token));
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  assert.equal('action' in await response.json(), false);
});

test('reviewer mode cannot fall back through session, turn or speech routes when a grant is malformed', async () => {
  const generatingBodies = [
    ['/eden/plan', planRequest()],
    ['/eden/turn', { action: { type: 'help' }, context: edenReviewContext('food-step-free'), noticeVersion: EDEN_NOTICE_VERSION }],
    ['/eden/speech', { phrase: 'welcome', noticeVersion: EDEN_NOTICE_VERSION }],
  ];
  for (const malformed of [
    { ...env, EDEN_REVIEWER_CODE_SHA256: 'malformed' },
    { ...env, EDEN_REVIEWER_EXPIRES_AT: 'malformed' },
    { ...env, EDEN_REVIEWER_CODE_SHA256: ' ', EDEN_REVIEWER_EXPIRES_AT: '' },
    { ...env, EDEN_REVIEWER_ADULT_VERIFIED: 'false' },
    { ...env, EDEN_REVIEWER_COUNTRY: 'GB' },
  ]) {
    const { service, calls } = fixture({ env: malformed });
    assert.equal(service.status(request('/eden/status', undefined, undefined, { method: 'GET' })).eligible, false);
    assert.equal((await service.handle(request('/eden/session', sessionBody(null)))).status, 403);
    for (const [path, body] of generatingBodies) assert.equal((await service.handle(request(path, body, 'A'.repeat(43)))).status, 403);
    assert.equal(calls.length, 0);
  }
  const { service, calls } = fixture();
  assert.equal((await service.handle(request('/eden/session', sessionBody(null)))).status, 403);
  for (const [path, body] of generatingBodies) assert.equal((await service.handle(request(path, body))).status, 401);
  assert.equal(calls.length, 0);
});

test('explicitly empty grant placeholders preserve the legacy demo but never authorize planning', async () => {
  let turnCalls = 0;
  const provider = { status: () => ({ available: true, reason: 'available', model: 'gemini-3.5-flash-lite' }), propose: async action => { turnCalls += 1; return action; } };
  const { service, calls } = fixture({ env: { ...env, EDEN_REVIEWER_CODE_SHA256: '', EDEN_REVIEWER_EXPIRES_AT: '' }, provider });
  const token = await session(service, null);
  assert.equal((await service.handle(request('/eden/plan', planRequest(), token))).status, 403);
  assert.equal((await service.handle(request('/eden/turn', { action: { type: 'help' }, context: edenReviewContext('food-step-free'), noticeVersion: EDEN_NOTICE_VERSION }, token))).status, 200);
  assert.equal(turnCalls, 1); assert.equal(calls.length, 0);
});

test('reviewer grant expiry during either turn or speech suppresses all generated output', async () => {
  for (const path of ['/eden/turn', '/eden/speech']) {
    let now = nowStart, generated = 0;
    const expire = () => { now += 5 * 60_000; generated += 1; };
    const provider = { status: () => ({ available: true, reason: 'available', model: 'gemini-3.5-flash-lite' }), propose: async action => { expire(); return action; } };
    const speechProvider = { status: () => ({ available: true, reason: 'available', voice: 'Aoede', model: 'gemini-3.8-flash-lite-tts' }), generate: async () => { expire(); return { mimeType: 'audio/wav', data: new Uint8Array() }; } };
    const { service } = fixture({ now: () => now, provider, speechProvider }), token = await session(service);
    const body = path === '/eden/turn'
      ? { action: { type: 'help' }, context: edenReviewContext('food-step-free'), noticeVersion: EDEN_NOTICE_VERSION }
      : { phrase: 'welcome', noticeVersion: EDEN_NOTICE_VERSION };
    const response = await service.handle(request(path, body, token));
    assert.equal(response.status, 403); assert.equal(generated, 1);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const output = await response.json(); assert('error' in output); assert.equal('action' in output, false);
    assert.equal((await service.handle(request('/eden/session', sessionBody(null)))).status, 403);
  }
});

test('plan shares turn quotas and remains unavailable on public/hosted URLs regardless reviewer grant', async () => {
  const { service, calls } = fixture(), token = await session(service);
  for (let count = 0; count < 3; count += 1) assert.equal((await service.handle(request('/eden/plan', planRequest(), token))).status, 200);
  assert.equal((await service.handle(request('/eden/plan', planRequest(), token))).status, 429);
  // Shared limiter denies even a legacy turn before any direct-model call.
  assert.equal((await service.handle(request('/eden/turn', { action: { type: 'help' }, context: edenReviewContext('food-step-free'), noticeVersion: EDEN_NOTICE_VERSION }, token))).status, 429);
  assert.equal(calls.length, 3);
  assert.equal((await service.handle(request('/eden/plan', planRequest(), token, { url: 'https://public.example.invalid', headers: { 'x-forwarded-host': '127.0.0.1:8787' } }))).status, 403);
  const hosted = fixture({ env: { ...env, NODE_ENV: 'production', EDEN_GEMINI_PUBLIC_ENABLED: 'true' } });
  assert.equal((await hosted.service.handle(request('/eden/session', sessionBody()))).status, 403);
  assert.equal(hosted.calls.length, 0);
});
