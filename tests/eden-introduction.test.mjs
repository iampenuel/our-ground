import test from 'node:test';
import assert from 'node:assert/strict';
import { claimEdenIntroduction, mountEdenIntroduction, EDEN_INTRO_VISIT_KEY } from '../src/eden/runtime/introduction.ts';

function storageFixture(initial = []) {
  const records = new Map(initial), writes = [];
  return { records, writes, storage: {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); records.set(key, value); },
    removeItem: key => records.delete(key),
  } };
}
function fixture(storage) {
  const card = Object.assign(new EventTarget(), { hidden: true });
  const dismissButton = new EventTarget();
  return { card, dismissButton, controller: mountEdenIntroduction(card, dismissButton, storage) };
}

test('initial welcome is read-only and ignores ambiguous automatic/open flags from previous versions', () => {
  const { storage, records, writes } = storageFixture([
    ['our-ground-eden-introduction-v1', 'seen'], ['our-ground-eden-introduction-v2', 'dismissed'],
  ]);
  assert.equal(EDEN_INTRO_VISIT_KEY, 'our-ground-eden-introduction-v3');
  assert.equal(claimEdenIntroduction(storage), true); assert.equal(claimEdenIntroduction(storage), true);
  const current = fixture(storage); assert.equal(current.card.hidden, false);
  assert.equal(records.has(EDEN_INTRO_VISIT_KEY), false); assert.deepEqual(writes, []);
  current.controller.dispose();
});

test('the untouched bubble persists beyond thirty seconds, scrolling, typing and focus changes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = { window: globalThis.window, document: globalThis.document };
  t.after(() => { for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } });
  globalThis.window = new EventTarget(); const active = {};
  globalThis.document = { hidden: false, activeElement: active };
  const { storage, writes } = storageFixture(), current = fixture(storage);
  t.mock.timers.tick(30_000);
  for (const event of ['scroll', 'keydown', 'input', 'pagehide']) window.dispatchEvent(new Event(event));
  current.card.dispatchEvent(new Event('focusout'));
  assert.equal(current.card.hidden, false); assert.equal(document.activeElement, active); assert.deepEqual(writes, []);
  current.controller.dispose();
});

test('opening chat hides only this interaction and a refresh welcomes again without an X click', () => {
  for (const method of ['temporarilyHide', 'hide', 'dismiss', 'collapse']) {
    const { storage, records, writes } = storageFixture(), current = fixture(storage);
    current.controller[method](); assert.equal(current.card.hidden, true);
    assert.equal(records.has(EDEN_INTRO_VISIT_KEY), false); assert.deepEqual(writes, []);
    current.controller.dispose();
    const refreshed = fixture(storage); assert.equal(refreshed.card.hidden, false); refreshed.controller.dispose();
  }
});

test('only the actual X records session dismissal across routes and refresh; a new session welcomes again', () => {
  const { storage, records, writes } = storageFixture(), current = fixture(storage);
  const click = new Event('click', { bubbles: true }); current.dismissButton.dispatchEvent(click);
  assert.equal(current.card.hidden, true); assert.equal(click.cancelBubble, true, 'X must not also trigger a surrounding bubble-open handler');
  assert.deepEqual(writes, [[EDEN_INTRO_VISIT_KEY, 'dismissed-by-x']]);
  assert.equal(records.get(EDEN_INTRO_VISIT_KEY), 'dismissed-by-x');
  current.dismissButton.dispatchEvent(new Event('click')); current.controller.temporarilyHide();
  assert.equal(writes.length, 1); current.controller.dispose();
  const nextRoute = fixture(storage); assert.equal(nextRoute.card.hidden, true); nextRoute.controller.dispose();
  const refreshed = fixture(storage); assert.equal(refreshed.card.hidden, true); refreshed.controller.dispose();
  const newSession = fixture(storageFixture().storage); assert.equal(newSession.card.hidden, false); newSession.controller.dispose();
});

test('corrupted or unrecognized flags never suppress the welcome', () => {
  for (const value of ['', 'seen', 'dismissed', 'false', 'true', '{broken', '{"dismissed":true}', 'synthetic-private-canary']) {
    const { storage, writes } = storageFixture([[EDEN_INTRO_VISIT_KEY, value]]), current = fixture(storage);
    assert.equal(current.card.hidden, false, value); assert.deepEqual(writes, []); current.controller.dispose();
  }
});

test('blocked storage still shows welcome and explicit X hides it in memory without throwing', () => {
  for (const storage of [
    { getItem() { throw new Error('Storage is blocked'); }, setItem() { throw new Error('Storage is blocked'); } },
    { getItem() { return null; }, setItem() { throw new Error('Writes are blocked'); } },
    { getItem() { return null; }, setItem() {} },
  ]) {
    assert.equal(claimEdenIntroduction(storage), true);
    const current = fixture(storage); assert.equal(current.card.hidden, false);
    assert.doesNotThrow(() => current.dismissButton.dispatchEvent(new Event('click')));
    assert.equal(current.card.hidden, true); current.controller.hide(); assert.equal(current.card.hidden, true);
    current.controller.dispose();
    const refreshed = fixture(storage); assert.equal(refreshed.card.hidden, false, 'without writable storage, refresh starts a new in-memory interaction'); refreshed.controller.dispose();
  }
});

test('disposal removes the X listener and never records a dismissal', () => {
  const { storage, writes } = storageFixture(), current = fixture(storage);
  current.controller.dispose(); assert.equal(current.card.hidden, true);
  current.dismissButton.dispatchEvent(new Event('click')); current.controller.dismiss(); current.controller.temporarilyHide();
  assert.deepEqual(writes, []);
  const remounted = fixture(storage); assert.equal(remounted.card.hidden, false); remounted.controller.dispose();
});
