import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixtureAuth, fixtureUsers } from './organization-auth-server.mjs';
async function post(url, path, body, headers = {}) {
  return fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
async function signIn(url, email = fixtureUsers[0].email) {
  assert.equal((await post(url, '/auth/v1/otp', { email })).status, 200);
  const response = await post(url, '/auth/v1/verify', { email, token: '246810', type: 'email' });
  assert.equal(response.status, 200); return response.json();
}
test('synthetic Auth fixture issues only requested test-user OTPs and rejects reused codes and forged JWTs', async () => {
  const fixture = await startFixtureAuth({ port: 0 });
  try {
    assert.equal(new URL(fixture.url).hostname, '127.0.0.1');
    await post(fixture.url, '/auth/v1/otp', { email: 'someone@real-organization.example' });
    assert.deepEqual((await (await fetch(fixture.url + '/test/mailbox')).json()).messages, []);
    assert.equal((await post(fixture.url, '/auth/v1/verify', { email: fixtureUsers[0].email, token: '246810', type: 'email' })).status, 403);
    const session = await signIn(fixture.url);
    assert.equal(session.user.id, fixtureUsers[0].id);
    assert.equal((await fetch(fixture.url + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + session.access_token } })).status, 200);
    assert.equal((await post(fixture.url, '/auth/v1/verify', { email: fixtureUsers[0].email, token: '246810', type: 'email' })).status, 403);
    const forged = session.access_token.split('.');
    const payload = JSON.parse(Buffer.from(forged[1], 'base64url')); payload.sub = fixtureUsers[2].id;
    forged[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    assert.equal((await fetch(fixture.url + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + forged.join('.') } })).status, 401);
  } finally { await fixture.close(); }
});
test('synthetic Auth fixture rotates refresh tokens and logout invalidates access and refresh sessions', async () => {
  const fixture = await startFixtureAuth({ port: 0 });
  try {
    const session = await signIn(fixture.url);
    const response = await post(fixture.url, '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    assert.equal(response.status, 200); const refreshed = await response.json();
    assert.notEqual(refreshed.refresh_token, session.refresh_token);
    assert.equal(JSON.parse(Buffer.from(refreshed.access_token.split('.')[1], 'base64url')).session_id, JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url')).session_id);
    assert.equal((await post(fixture.url, '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })).status, 400);
    assert.equal((await post(fixture.url, '/auth/v1/logout?scope=local', {}, { Authorization: 'Bearer ' + refreshed.access_token })).status, 204);
    assert.equal((await fetch(fixture.url + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + refreshed.access_token } })).status, 401);
    assert.equal((await post(fixture.url, '/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshed.refresh_token })).status, 400);
  } finally { await fixture.close(); }
});
test('synthetic Auth fixture rejects expired sessions and denies unrelated browser origins', async () => {
  let now = Date.now();
  const fixture = await startFixtureAuth({ port: 0, now: () => now, ttlSeconds: 60 });
  try {
    const session = await signIn(fixture.url);
    now += 61_000;
    assert.equal((await fetch(fixture.url + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + session.access_token } })).status, 401);
    const denied = await post(fixture.url, '/auth/v1/otp', { email: fixtureUsers[0].email }, { Origin: 'https://unrelated.invalid' });
    assert.equal(denied.status, 403); assert.equal(denied.headers.has('access-control-allow-origin'), false);
    const allowed = await post(fixture.url, '/auth/v1/otp', { email: fixtureUsers[0].email }, { Origin: 'http://127.0.0.1:18419' });
    assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:18419');
  } finally { await fixture.close(); }
});
