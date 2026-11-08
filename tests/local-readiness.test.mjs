import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertNode24 } from '../scripts/check-node.mjs';
import { checkLocalReadiness } from '../scripts/local-readiness.mjs';

const id = '11111111-1111-4111-8111-111111111111';
function demoResponse(url) {
  const path = new URL(url).pathname;
  if (path === '/') return new Response('<div id="app"></div><script type="module"></script>', { headers: { 'content-type': 'text/html' } });
  if (path.endsWith('/health')) return Response.json({ status: 'ok' });
  if (path.endsWith('/resolve')) return Response.json({ place: { city: 'Harrisburg', state: 'PA' } });
  if (path.endsWith('/resources')) return Response.json({ items: [{ id, data_kind: 'fictional_demo' }] });
  return Response.json({ id, data_kind: 'fictional_demo', contact: { phone: null, website_url: null, directions_url: null } });
}

test('local commands reject the observed Node 20 shell before starting services', () => {
  assert.doesNotThrow(() => assertNode24('24.19.0'));
  assert.throws(() => assertNode24('20.20.0'), /requires Node 24.*nvm use/);
});

test('readiness requires frontend, direct/proxied API, demo search and safe details', async () => {
  const results = await checkLocalReadiness(18417, { fetcher: async url => demoResponse(url) });
  assert.equal(results.length, 6);
  assert.ok(results.every(result => result.ok));
  assert.ok(results.some(result => result.url.startsWith('http://127.0.0.1:18787/')));
});

test('readiness rejects SPA-swallowed API responses, unsafe fictional contacts and timeouts', async () => {
  const results = await checkLocalReadiness(18418, { fetcher: async url => {
    if (url.includes('18418/api/v1/health')) return demoResponse('http://local/');
    if (url.includes('/places/')) throw new DOMException('Sensitive provider detail', 'TimeoutError');
    if (url.endsWith(id)) return Response.json({ id, data_kind: 'fictional_demo', contact: { phone: 'not-a-real-number', website_url: null, directions_url: null } });
    return demoResponse(url);
  } });
  assert.equal(results.filter(result => !result.ok).length, 3);
  assert.equal(results.find(result => result.name === 'demo ZIP resolution').error, 'Timed out');
  assert.ok(!JSON.stringify(results).includes('Sensitive provider detail'));
});
