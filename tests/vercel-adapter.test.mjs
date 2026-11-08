import assert from 'node:assert/strict';
import {fixtureRequest} from './eligible-fixture.mjs';
import { test } from 'node:test';

test('existing Vercel exports serve rewritten demo routes and reject anonymous edits', async () => {
  // This test file has its own Node test process. No database or external auth is used.
  process.env.BACKEND_DATA_MODE = 'demo';
  process.env.ALLOW_DEMO_DATA = 'true';
  const { GET, PATCH } = await import('../api/index.ts');
  const id = '11111111-1111-4111-8111-111111111111';
  const eligibleRequest=await fixtureRequest('http://local');
  const search = await GET(eligibleRequest('http://local/api/index?path=resources&lat=40.2732&lng=-76.8867&category=food'));
  assert.equal(search.status, 200);
  assert.equal((await search.json()).items[0].id, id);
  const detail = await GET(eligibleRequest('http://local/api/index?path=resources/' + id));
  const resource = await detail.json();
  assert.equal(resource.data_kind, 'fictional_demo');
  assert.equal(resource.contact.directions_url, null);
  const missing = await GET(eligibleRequest('http://local/api/index?path=unknown'));
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  const denied = await PATCH(eligibleRequest('http://local/api/index?path=services/' + id, { method: 'PATCH', body: JSON.stringify({ expected_version: 1, title: 'Must not save' }) }));
  assert.equal(denied.status, 401);
});
