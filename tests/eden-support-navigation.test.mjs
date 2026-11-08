import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdenSupportNavigator, edenSupportNavigationUrl } from '../src/eden/support-navigation.ts';
import { isEdenReviewPreviewRequest } from '../vite.eden-assistant.config.ts';

const search = { type: 'search', category: 'food', city: 'harrisburg-pa', radius: 10 };
function browser(path = '/', hostname = '127.0.0.1') {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const root = { contains: () => false }, assistant = { session: 'unchanged-in-memory' };
  const listeners = new Map(), urls = [];
  const location = { pathname: path, hostname, search: '', reloads: 0, reload() { this.reloads++; } };
  const window = {
    location,
    history: { pushState(_state, _unused, url) { urls.push(url); const target = new URL(url, 'http://127.0.0.1:5199'); location.pathname = target.pathname; location.search = target.search; } },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: id => id === 'app' ? root : id === 'eden-assistant' ? assistant : null } });
  return { root, assistant, window, urls, listeners, restore() {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
  } };
}

test('support URLs contain canonical public search fields only', () => {
  const url = new URL(edenSupportNavigationUrl(search), 'https://example.test');
  assert.equal(url.pathname, '/support');
  assert.deepEqual(Object.fromEntries(url.searchParams), { location: 'Harrisburg, PA', category: 'food', radius_miles: '10' });
  assert.equal(new URL(edenSupportNavigationUrl(search, true), 'https://example.test').searchParams.get('mode'), 'demo');
  assert.equal(edenSupportNavigationUrl({ type: 'navigate-support' }), '/support');
  for (const invalid of [
    { ...search, city: 'private street address' }, { ...search, radius: 13 },
    { ...search, text: 'a private medical narrative' }, { ...search, url: 'https://attacker.invalid' },
    { type: 'search', category: 'food' }, { type: 'details', index: 1 },
  ]) assert.throws(() => edenSupportNavigationUrl(invalid));
});

test('one canonical transition preserves the assistant and hydrates the actual support mount once', async () => {
  const env = browser();
  try {
    let active = false, mounts = 0;
    const ensure = createEdenSupportNavigator(async () => async (root, options) => {
      assert.equal(root, env.root); assert.deepEqual(options, {}); mounts++; active = true;
    });
    const signal = new AbortController().signal;
    assert.deepEqual(await ensure(search, { signal, hasSupportPage: () => active }), { mounted: true, initialSearch: true });
    assert.equal(env.urls.length, 1); assert.equal(env.window.location.pathname, '/support');
    assert.equal(env.assistant.session, 'unchanged-in-memory');
    assert.deepEqual(await ensure({ type: 'radius', radius: 5 }, { signal, hasSupportPage: () => active }), { mounted: false, initialSearch: false });
    assert.equal(mounts, 1); assert.equal(env.listeners.get('popstate').size, 1);
    env.window.location.pathname = '/';
    let stopped = false;
    [...env.listeners.get('popstate')][0]({ stopImmediatePropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.equal(env.window.location.reloads, 1);
    [...env.listeners.get('pagehide')][0]();
    assert.equal(env.listeners.get('popstate').size, 0);
  } finally { env.restore(); }
});

test('concurrent actions share mounting without claiming the second action already searched', async () => {
  const env = browser();
  try {
    let active = false, mounts = 0, finish, started;
    const began = new Promise(resolve => { started = resolve; });
    const held = new Promise(resolve => { finish = resolve; });
    const ensure = createEdenSupportNavigator(async () => async () => { mounts++; started(); await held; active = true; });
    const options = { signal: new AbortController().signal, hasSupportPage: () => active };
    const first = ensure(search, options); await began;
    const second = ensure({ ...search, radius: 5 }, options);
    finish();
    assert.deepEqual(await first, { mounted: true, initialSearch: true });
    assert.deepEqual(await second, { mounted: false, initialSearch: false });
    assert.equal(mounts, 1); assert.equal(env.urls.length, 1);
  } finally { env.restore(); }
});

test('evaluation uses the same API mount with a local trusted flag and blocks private/hosted transitions', async () => {
  let env = browser();
  try {
    let active = false;
    const ensure = createEdenSupportNavigator(async () => async (_root, options) => { assert.deepEqual(options, { syntheticDemo: true }); active = true; });
    await ensure(search, { signal: new AbortController().signal, hasSupportPage: () => active, evaluationData: true });
    assert.equal(new URL(env.urls[0], 'http://127.0.0.1').searchParams.get('mode'), 'demo');
  } finally { env.restore(); }
  for (const [path, host, evaluationData] of [['/account', '127.0.0.1', false], ['/', 'public.example.test', true]]) {
    env = browser(path, host);
    try {
      let loads = 0;
      const ensure = createEdenSupportNavigator(async () => { loads++; return async () => {}; });
      await assert.rejects(ensure(search, { signal: new AbortController().signal, hasSupportPage: () => false, evaluationData }));
      assert.equal(loads, 0); assert.equal(env.urls.length, 0);
    } finally { env.restore(); }
  }
});

test('interruption while loading causes no history or DOM mutation', async () => {
  const env = browser();
  try {
    let release, loads = 0, mounts = 0;
    const held = new Promise(resolve => { release = resolve; });
    const ensure = createEdenSupportNavigator(async () => { loads++; await held; return async () => { mounts++; }; });
    const abort = new AbortController();
    const pending = ensure(search, { signal: abort.signal, hasSupportPage: () => false });
    abort.abort(); release();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(loads, 1); assert.equal(mounts, 0); assert.equal(env.urls.length, 0);
  } finally { env.restore(); }
});

test('Rive/audio CSP exception is confined to exact loopback documents in the special development mode', () => {
  const context = { command: 'serve', mode: 'eden-review', isPreview: false };
  for (const host of ['127.0.0.1:5199', 'localhost:5199', '[::1]:5199']) {
    for (const path of ['/', '/support', '/support/', '/support?location=Harrisburg','/give','/organizations','/about','/privacy']) assert.equal(isEdenReviewPreviewRequest(context, path, host), true);
  }
  for (const [override, path, host] of [
    [{ mode: 'development' }, '/', '127.0.0.1:5199'], [{ command: 'build' }, '/', '127.0.0.1:5199'],
    [{ isPreview: true }, '/', '127.0.0.1:5199'], [{}, '/', 'public.example.test'],
    [{}, '/account', '127.0.0.1:5199'], [{}, '/support/private', '127.0.0.1:5199'],
    [{}, '/eden-assistant.html', '127.0.0.1:5199'], [{}, '/', 'localhost:5199/other'],
  ]) assert.equal(isEdenReviewPreviewRequest({ ...context, ...override }, path, host), false);
});
