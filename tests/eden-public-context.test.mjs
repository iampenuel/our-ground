import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearEdenRememberedSearch, edenLocalPageContext, edenPageContext, edenPageRevision,
  executeEdenAction, publishEdenApplication, registerEdenPage,
} from '../src/eden/application-bridge.ts';

const key = 'our-ground-eden-area-v1';
const clock = Date.parse('2026-11-06T12:00:00.000Z');
const base = { page: 'support', category: 'food', radius: 25, resultCount: 2, synthetic: false };
const remembered = () => ({ cityId: 'harrisburg-pa', category: 'food', radius: 25, expiresAt: clock + 900_000 });
function browser(t, pathname = '/support') {
  const originals = new Map(['window', 'sessionStorage', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalNow = Date.now;
  const values = new Map(), writes = [], navigation = [];
  let outbound = 0;
  const location = { pathname, assign: url => navigation.push(url) };
  const storage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, String(value)); writes.push({ name, value: String(value) }); },
    removeItem: name => values.delete(name),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  clearEdenRememberedSearch();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => { outbound++; throw new Error('Unexpected network request.'); } });
  Date.now = () => clock;
  t.after(() => {
    clearEdenRememberedSearch();
    Date.now = originalNow;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { values, writes, navigation, location, storage, outbound: () => outbound };
}
function adapter(t, context = () => ({ ...base }), presentation = () => ({ cityId: 'harrisburg-pa' })) {
  const dispose = registerEdenPage({ context, presentation, execute: async () => ({ status: 'done', message: 'Done.' }) });
  t.after(dispose);
  return dispose;
}

test('rich public presentation stays local and provider context remains a detached minimal projection', t => {
  const browserState = browser(t);
  const view = {
    cityId: 'harrisburg-pa', selectedIndex: 2, loading: 'ready', hasFilter: true, mapVisible: true,
    rawQuery: 'synthetic-private-query-canary', latitude: 40.123456, accountId: 'synthetic-account-canary',
    results: [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Public title canary', selected: false, kind: 'directory', description: 'synthetic-description-canary' },
      { id: '77777777-7777-4777-8777-777777777777', title: 'Second public title', selected: true, kind: 'mapped' },
    ],
  };
  adapter(t, () => ({ ...base }), () => view);
  const local = edenLocalPageContext();
  assert.equal(local.route, 'support');
  assert.equal(local.cityId, 'harrisburg-pa');
  assert.equal(local.selectedIndex, 2);
  assert.equal(local.loading, 'ready');
  assert.equal(local.hasFilter, true);
  assert.equal(local.mapVisible, true);
  assert.equal(local.results[0].title, 'Public title canary');
  assert(!JSON.stringify(local).includes('synthetic-private-query-canary'));
  assert(!JSON.stringify(local).includes('synthetic-description-canary'));
  local.results[0].title = 'changed locally';
  assert.equal(view.results[0].title, 'Public title canary');
  const provider = edenPageContext();
  assert.deepEqual(provider, base);
  for (const field of ['cityId', 'route', 'results', 'selectedIndex', 'loading', 'hasFilter', 'mapVisible', 'rawQuery', 'latitude', 'accountId']) assert(!Object.hasOwn(provider, field));
  assert(!JSON.stringify(provider).includes('canary'));
  provider.resultCount = 19;
  assert.equal(edenPageContext().resultCount, 2);
  assert.equal(browserState.outbound(), 0);
});

test('only completed non-synthetic canonical searches persist finite tab context for fifteen minutes', t => {
  const { values, writes, outbound } = browser(t);
  let synthetic = false;
  adapter(t, () => ({ ...base, synthetic }), () => ({ cityId: 'harrisburg-pa', results: [{ title: 'synthetic-title-canary', kind: 'directory', selected: false }], rawQuery: 'synthetic-query-canary', longitude: -76.123456 }));
  assert.equal(writes.length, 0);
  for (const type of ['search-started', 'search-failed', 'context']) publishEdenApplication(type === 'context' ? { type } : { type, requestId: 'synthetic-operation' });
  assert.equal(writes.length, 0);
  publishEdenApplication({ type: 'search-completed', requestId: 'synthetic-operation' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, key);
  assert.deepEqual(JSON.parse(values.get(key)), remembered());
  assert(!values.get(key).includes('canary'));
  synthetic = true;
  publishEdenApplication({ type: 'search-completed', requestId: 'synthetic-example' });
  assert.equal(writes.length, 1);
  clearEdenRememberedSearch();
  assert.equal(values.has(key), false);
  assert.equal(outbound(), 0);
});

test('cross-page navigation restores only safe broad context and keeps giving intent independent', async t => {
  const state = browser(t);
  const dispose = adapter(t);
  publishEdenApplication({ type: 'search-completed', requestId: 'completed' });
  dispose(); state.location.pathname = '/give';
  const local = edenLocalPageContext();
  assert.equal(local.route, 'give');
  assert.equal(local.cityId, 'harrisburg-pa');
  assert.equal(local.category, 'food');
  assert.equal(local.radius, 25);
  assert.equal(local.resultCount, 0);
  assert.deepEqual(local.results, []);
  assert.deepEqual(edenPageContext(), { page:'give',category:'food',radius:25,resultCount:0,synthetic:false });
  const result = await executeEdenAction({ type: 'navigate-support' }, edenPageRevision(), new AbortController().signal);
  assert.equal(result.status, 'done');
  const url = new URL(state.navigation[0], 'https://example.invalid');
  assert.equal(url.pathname, '/support');
  assert.deepEqual(Object.fromEntries(url.searchParams), { eden: '1', location: 'Harrisburg, PA', category: 'food', radius_miles: '25', intent: 'give' });
  assert.equal(state.outbound(), 0);
});

test('an active unsupported location cannot silently reuse the previously remembered city', t => {
  const { values, writes } = browser(t);
  values.set(key, JSON.stringify(remembered()));
  adapter(t, () => ({ ...base }), () => ({ cityId: 'synthetic-unsupported-city-canary' }));
  assert.equal(edenLocalPageContext().cityId, undefined);
  assert.equal(edenPageContext().category, 'food');
  publishEdenApplication({ type: 'search-completed', requestId: 'unsupported-city' });
  assert.equal(writes.length, 0);
  assert.equal(edenLocalPageContext().cityId, undefined);
});

test('expired, extended, malformed or extra-field tab context is rejected before reuse', t => {
  const { values } = browser(t, '/organizations');
  const valid = remembered();
  for (const invalid of [
    null, [], {}, { ...valid, cityId: 'Unknown City' }, { ...valid, category: 'private' },
    { ...valid, radius: '25' }, { ...valid, radius: 7 }, { ...valid, expiresAt: clock },
    { ...valid, expiresAt: clock - 1 }, { ...valid, expiresAt: clock + 900_001 },
    { ...valid, expiresAt: String(clock + 1000) }, { ...valid, rawQuery: 'synthetic-private-canary' },
    { ...valid, latitude: 40.123456 }, { ...valid, title: 'synthetic-title-canary' },
  ]) {
    values.set(key, JSON.stringify(invalid));
    const local = edenLocalPageContext();
    assert.equal(local.cityId, undefined);
    assert.equal(local.category, undefined);
    assert.equal(local.radius, undefined);
    assert(!JSON.stringify(local).includes('canary'));
    assert.equal(values.has(key), false);
  }
  values.set(key, '{ invalid JSON synthetic-private-canary');
  assert.doesNotThrow(() => edenLocalPageContext());
  assert.equal(edenLocalPageContext().cityId, undefined);
  clearEdenRememberedSearch();
  assert.equal(values.has(key), false);
});

test('storage failures and bounded malformed presentation do not break the page or leak through provider context', t => {
  const { storage, outbound } = browser(t);
  for (const method of ['getItem', 'setItem', 'removeItem']) storage[method] = () => { throw new Error('synthetic-storage-canary'); };
  const view = {
    cityId: 'harrisburg-pa', selectedIndex: 21, loading: 'private-canary', hasFilter: 'yes', mapVisible: 'yes',
    results: Array.from({ length: 25 }, (_, index) => ({ id: 'https://example.invalid/private', title: 'x'.repeat(200), selected: index === 0, kind: 'directory' })),
  };
  adapter(t, () => ({ ...base }), () => view);
  const local = edenLocalPageContext();
  assert.equal(local.results.length, 20);
  assert(local.results.every(item => item.title.length === 160 && !Object.hasOwn(item, 'id')));
  assert.equal(local.selectedIndex, undefined);
  assert.equal(local.loading, 'idle');
  assert.equal(local.hasFilter, false);
  assert.equal(local.mapVisible, false);
  assert.doesNotThrow(() => publishEdenApplication({ type: 'search-completed', requestId: 'completed' }));
  assert.doesNotThrow(clearEdenRememberedSearch);
  assert.deepEqual(edenPageContext(), base);
  assert.equal(outbound(), 0);
});
