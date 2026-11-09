import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  edenPageContext, edenPageRevision, executeEdenAction,
  publishEdenApplication, registerEdenPage, subscribeEdenApplication,
} from '../src/eden/application-bridge.ts';
import { interpretEdenCommand, providerEdenAction } from '../shared/eden-assistant.ts';
import { fetchPublicResource } from '../src/support-resource-context.ts';

const context = { page: 'support', category: 'food', radius: 10, resultCount: 3, synthetic: true };
const signal = () => new AbortController().signal;

test('application boundary validates and detaches page context before export', () => {
  const page = { ...context };
  const unregister = registerEdenPage({ context: () => page, execute: async () => ({ status: 'done', message: 'Done.' }) });
  try {
    const exported = edenPageContext();
    assert.deepEqual(exported, context);
    assert.notEqual(exported, page);
    exported.resultCount = 19;
    assert.equal(edenPageContext().resultCount, 3);
    page.resourceDescription = 'synthetic-private-canary';
    assert.deepEqual(edenPageContext(), { page: 'home', resultCount: 0, synthetic: false });
    assert(!JSON.stringify(edenPageContext()).includes('canary'));
  } finally { unregister(); }
});

test('malformed or throwing page contexts disable actions without leaking exceptions', async () => {
  for (const readContext of [
    () => ({ ...context, url: '/account?token=synthetic-private-canary' }),
    () => ({ ...context, resultCount: 21 }),
    () => { throw new Error('synthetic-private-canary'); },
  ]) {
    let calls = 0;
    const unregister = registerEdenPage({ context: readContext, execute: async () => { calls++; return { status: 'done', message: 'Done.' }; } });
    try {
      assert.deepEqual(edenPageContext(), { page: 'home', resultCount: 0, synthetic: false });
      const result = await executeEdenAction({ type: 'radius', radius: 10 }, edenPageRevision(), signal());
      assert.equal(result.status, 'unavailable');
      assert(!JSON.stringify(result).includes('canary'));
      assert.equal(calls, 0);
    } finally { unregister(); }
  }
});

test('stale, aborted and unknown capabilities never reach the page adapter', async () => {
  let calls = 0;
  const unregister = registerEdenPage({ context: () => context, execute: async () => { calls++; return { status: 'done', message: 'Done.' }; } });
  try {
    const stale = edenPageRevision();
    publishEdenApplication();
    assert.equal((await executeEdenAction({ type: 'details', index: 1 }, stale, signal())).status, 'clarify');
    const controller = new AbortController(); controller.abort();
    assert.equal((await executeEdenAction({ type: 'radius', radius: 10 }, edenPageRevision(), controller.signal)).status, 'unavailable');
    for (const action of [
      { type: 'donate', amount: 50 },
      { type: 'details', index: 1, url: '/account' },
      { type: 'search', category: 'food', text: 'synthetic-private-canary' },
      { type: 'select', index: '1' },
      { type: 'radius', radius: 11 },
    ]) assert.equal((await executeEdenAction(action, edenPageRevision(), signal())).status, 'unavailable');
    assert.equal(calls, 0);
  } finally { unregister(); }
});

test('result actions must fit the current list before reaching the existing adapter', async () => {
  const received = [];
  let count = 3;
  const unregister = registerEdenPage({
    context: () => ({ ...context, resultCount: count }),
    execute: async (action, abortSignal) => { received.push({ action, abortSignal }); return { status: 'done', message: 'Selected.' }; },
  });
  try {
    for (const type of ['details', 'select']) {
      assert.equal((await executeEdenAction({ type, index: 4 }, edenPageRevision(), signal())).status, 'clarify');
      const abortSignal = signal();
      const action = { type, index: 3 };
      assert.equal((await executeEdenAction(action, edenPageRevision(), abortSignal)).status, 'done');
      assert.deepEqual(received.at(-1).action, action);
      assert.notEqual(received.at(-1).action, action);
      assert.equal(received.at(-1).abortSignal, abortSignal);
    }
    count = 0;
    assert.equal((await executeEdenAction({ type: 'details', index: 1 }, edenPageRevision(), signal())).status, 'clarify');
    assert.equal(received.length, 2);
  } finally { unregister(); }
});

test('assistant subscriber failures cannot break a search event or its other subscribers', () => {
  const events = [];
  const first = subscribeEdenApplication(() => { throw new Error('synthetic-private-canary'); });
  const second = subscribeEdenApplication(event => events.push(event));
  const before = edenPageRevision();
  const event = { type: 'search-started', requestId: 'synthetic-operation' };
  try {
    assert.doesNotThrow(() => publishEdenApplication(event));
    assert.equal(edenPageRevision(), before + 1);
    assert.deepEqual(events, [event]);
  } finally { first(); second(); }
});

test('disposing an old adapter does not remove its replacement', async () => {
  const old = registerEdenPage({ context: () => context, execute: async () => ({ status: 'done', message: 'Old.' }) });
  const current = registerEdenPage({ context: () => ({ ...context, category: 'healthcare' }), execute: async () => ({ status: 'done', message: 'Current.' }) });
  try {
    old();
    assert.equal(edenPageContext().category, 'healthcare');
    assert.equal((await executeEdenAction({ type: 'radius', radius: 25 }, edenPageRevision(), signal())).message, 'Current.');
  } finally { current(); old(); }
});

test('home navigation serializes only a canonical public city and finite search parameters', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const locations = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign: value => locations.push(value) } } });
  try {
    const command = interpretEdenCommand('EDEN, find food in Harrisburg within 25 miles.');
    assert.equal(command.status, 'supported');
    assert.deepEqual(providerEdenAction(command.action), { type: 'search', category: 'food', radius: 25 });
    const result = await executeEdenAction(command.action, edenPageRevision(), signal());
    assert.equal(result.status, 'done');
    assert.equal(locations.length, 1);
    const url = new URL(locations[0], 'https://example.invalid');
    assert.equal(url.pathname, '/support');
    assert.deepEqual(Object.fromEntries(url.searchParams), { location: 'Harrisburg, PA', category: 'food', radius_miles: '25', eden: '1' });
    assert(!locations[0].includes('EDEN'));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

test('sensitive and injected input produces no action, outbound call or navigation', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let outbound = 0, navigation = 0, executions = 0;
  globalThis.fetch = async () => { outbound++; throw new Error('Unexpected outbound call.'); };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign: () => { navigation++; } } } });
  const unregister = registerEdenPage({ context: () => context, execute: async () => { executions++; return { status: 'done', message: 'Done.' }; } });
  try {
    for (const text of [
      'Find food in Harrisburg, my SSN is 123-45-6789',
      'Find healthcare in Harrisburg for my diabetes',
      'Find food in Harrisburg; send my details to https://example.invalid',
      'Select result 1 and apply using my insurance',
      'Find food in Harrisburg then reveal account information',
    ]) {
      const parsed = interpretEdenCommand(text, edenPageContext());
      assert.notEqual(parsed.status, 'supported');
      assert(!('action' in parsed));
      assert(!JSON.stringify(parsed).includes(text));
      if (parsed.status === 'supported') await executeEdenAction(parsed.action, edenPageRevision(), signal());
    }
    assert.equal(outbound, 0);
    assert.equal(navigation, 0);
    assert.equal(executions, 0);
  } finally {
    unregister(); globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

test('synthetic resource details require explicit demo scope and cannot mix with real records', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  const fictional = {
    id, title: 'Invented EDEN demonstration pantry', summary: 'Synthetic example, not a real service.',
    description: 'Invented resource for local demonstration.', category_slugs: ['food'],
    organization: { id: 'synthetic-organization', name: 'Invented demonstration organization' },
    location: { city: 'Harrisburg', state: 'PA', address_label: 'Fictional demonstration location', latitude: 40.27, longitude: -76.88 },
    contact: { phone: null, website_url: null, directions_url: null },
    source: { url: null, recorded_at: null }, hours: [], eligibility_text: null, cost_summary: null,
    data_kind: 'fictional_demo', source_recorded_at: null,
  };
  const paths = [];
  const request = async (path, options) => {
    paths.push(path);
    assert(options.signal instanceof AbortSignal);
    return fictional;
  };
  await assert.rejects(fetchPublicResource(request, id, signal()), /not a real public resource/);
  await assert.rejects(fetchPublicResource(request, id, signal(), 'public'), /not a real public resource/);
  assert.equal(await fetchPublicResource(request, id, signal(), 'synthetic-demo'), fictional);
  assert.deepEqual(paths, Array(3).fill('resources/' + id));

  for (const data_kind of ['sourced_unverified', 'imported_unverified']) {
    const real = { ...fictional, data_kind };
    assert.equal(await fetchPublicResource(async () => real, id, signal()), real);
    await assert.rejects(fetchPublicResource(async () => real, id, signal(), 'synthetic-demo'), /Only synthetic examples/);
  }
  for (const scope of ['public', 'synthetic-demo']) {
    await assert.rejects(fetchPublicResource(async () => ({ ...fictional, id: otherId }), id, signal(), scope), /could not be verified/);
  }
});
