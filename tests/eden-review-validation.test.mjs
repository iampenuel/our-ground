import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDEN_NOTICE_VERSION } from '../shared/eden-assistant.ts';
import {
  edenPlanExplanation, edenReviewContext, validateEdenPlanRequest,
  validateEdenReviewPlan, validateEdenPlanResponse,
} from '../shared/eden-review.ts';

const scenarioId = 'food-step-free';
const request = () => ({ scenarioId, context: edenReviewContext(scenarioId), noticeVersion: EDEN_NOTICE_VERSION });
const plan = () => ({ scenarioId, action: { type: 'select', index: 3 }, reasonCodes: ['STEP_FREE_ACCESS', 'OPEN_NOW'] });
const hidden = value => Object.defineProperty(value, 'raw', { value: 'synthetic-private-canary', enumerable: false });

test('review validators reject hidden unknown fields and catch reflection failures', () => {
  for (const [validate, value] of [
    [validateEdenPlanRequest, request()],
    [validateEdenReviewPlan, plan()],
    [validateEdenPlanResponse, { engine: 'gemini', ...plan() }],
  ]) {
    assert.equal(validate(hidden(value)), null);
    assert.equal(validate(new Proxy(value, { getPrototypeOf() { throw new Error('synthetic-private-canary'); } })), null);
    assert.equal(validate(new Proxy(value, { ownKeys() { throw new Error('synthetic-private-canary'); } })), null);
  }
});

test('review object snapshots do not invoke getters or proxy property reads', () => {
  let reads = 0;
  const getter = { ...plan() };
  Object.defineProperty(getter, 'scenarioId', { get() { reads++; return scenarioId; } });
  assert.equal(validateEdenReviewPlan(getter), null);
  const original = plan();
  const captured = validateEdenReviewPlan(new Proxy(original, { get() { reads++; throw new Error('Unexpected read.'); } }));
  assert.deepEqual(captured, original);
  assert.notEqual(captured, original);
  assert.notEqual(captured.action, original.action);
  assert.notEqual(captured.reasonCodes, original.reasonCodes);
  assert.equal(reads, 0);
});

test('reason arrays reject sparse values, accessors, hidden fields and custom iterators', () => {
  let reads = 0;
  const accessor = ['STEP_FREE_ACCESS', 'OPEN_NOW'];
  Object.defineProperty(accessor, '0', { get() { reads++; return 'STEP_FREE_ACCESS'; } });
  const iterator = ['STEP_FREE_ACCESS', 'OPEN_NOW'];
  Object.defineProperty(iterator, Symbol.iterator, { value() { reads++; throw new Error('Unexpected iterator.'); } });
  class CustomReasons extends Array {}
  const sparse = Array(2); sparse[0] = 'STEP_FREE_ACCESS';
  for (const reasonCodes of [
    accessor, iterator, sparse, hidden(['STEP_FREE_ACCESS', 'OPEN_NOW']),
    new CustomReasons('STEP_FREE_ACCESS', 'OPEN_NOW'),
    new Proxy(['STEP_FREE_ACCESS', 'OPEN_NOW'], { getOwnPropertyDescriptor() { throw new Error('synthetic-private-canary'); } }),
  ]) assert.equal(validateEdenReviewPlan({ ...plan(), reasonCodes }), null);
  const plain = ['STEP_FREE_ACCESS', 'OPEN_NOW'];
  const guarded = new Proxy(plain, { get() { reads++; throw new Error('Unexpected array read.'); } });
  assert.deepEqual(validateEdenReviewPlan({ ...plan(), reasonCodes: guarded }), plan());
  assert.equal(reads, 0);
});

test('plan explanations validate unknown values before reading any field', () => {
  let reads = 0;
  const unsafe = { get scenarioId() { reads++; throw new Error('synthetic-private-canary'); } };
  for (const value of [null, undefined, 42, [], unsafe, hidden(plan()), { engine: 'other', ...plan() }, new Proxy({}, { getPrototypeOf() { throw new Error('synthetic-private-canary'); } })]) {
    assert.equal(edenPlanExplanation(value), 'This sample comparison is unavailable.');
  }
  assert.equal(reads, 0);
  const expected = edenPlanExplanation(plan());
  assert.match(expected, /Sample Oak Pantry/);
  assert.equal(edenPlanExplanation({ engine: 'gemini', ...plan() }), expected);
  assert(!expected.includes('synthetic-private-canary'));
});
