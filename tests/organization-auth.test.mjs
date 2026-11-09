import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createOrganizationAuth, accountAllowedOrigins } from '../backend/organization-auth.ts';
import { publicEnvironmentProblems } from '../backend/env-boundary.mjs';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fixtureSecret = 'synthetic-auth-fixture-signing-key';
const env = { ACCOUNT_EMAIL_AUTH_ENABLED:'true', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789', ACCOUNT_ALLOWED_ORIGINS: 'http://127.0.0.1:18418,https://ourground.vercel.app' };
function sign(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url');
  return header + '.' + body + '.' + createHmac('sha256', fixtureSecret).update(header + '.' + body).digest('base64url');
}
function fixture(options = {}) {
  const requests = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, query: url.search, method: init.method, headers: new Headers(init.headers), body: init.body && JSON.parse(init.body) });
    assert.equal(url.origin, env.SUPABASE_URL);
    if (options.failure) return Response.json({ msg: 'Synthetic provider failure' }, { status: options.failure });
    if (url.pathname === '/auth/v1/user') {
      const token = new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '') ?? '';
      const parts = token.split('.');
      const signature = createHmac('sha256', fixtureSecret).update(parts.slice(0, 2).join('.')).digest();
      const provided = Buffer.from(parts[2] ?? '', 'base64url');
      if (signature.length !== provided.length || !timingSafeEqual(signature, provided)) return Response.json({ msg: 'Invalid JWT' }, { status: 401 });
      return Response.json({ id: options.userId ?? userId, email: 'representative@example.invalid', email_confirmed_at: options.unconfirmed ? null : '2026-11-05T00:00:00Z', is_anonymous: options.anonymous ?? false, app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' }, aud: 'authenticated', created_at: '2026-11-05T00:00:00Z' });
    }
    if (url.pathname === '/auth/v1/otp') return Response.json({});
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error('Unexpected synthetic auth route');
  };
  return { auth: createOrganizationAuth(env, fetcher), requests };
}

test('organization auth accepts only a provider-verified, confirmed email session and ignores frontend role claims', async () => {
  const { auth, requests } = fixture();
  assert.equal(auth.configured, true);
  const token = sign({ role: 'admin' });
  const principal = await auth.verify(token);
  assert.deepEqual(principal, { id: userId, email: 'representative@example.invalid', sessionId, expiresAt: JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp });
  assert.equal(Object.hasOwn(principal, 'role'), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/auth/v1/user');
});

test('signed-out, malformed and expired organization sessions are rejected before provider calls', async () => {
  const { auth, requests } = fixture();
  for (const token of ['', 'opaque-token', 'a.b.c', sign({ exp: Math.floor(Date.now() / 1000) - 1 }), sign({ session_id: 'forged-session' }), sign({ sub: 'not-a-uuid' })]) assert.equal(await auth.verify(token), null);
  assert.equal(requests.length, 0);
});

test('a forged signed payload cannot obtain organization access', async () => {
  const { auth, requests } = fixture();
  const original = sign();
  const parts = original.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: otherId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'admin' })).toString('base64url');
  assert.equal(await auth.verify(parts.join('.')), null);
  assert.equal(requests.length, 1);
});

test('unconfirmed, anonymous and mismatched provider users are not organization principals', async () => {
  for (const options of [{ unconfirmed: true }, { anonymous: true }, { userId: otherId }]) assert.equal(await fixture(options).auth.verify(sign()), null);
});

test('passwordless email starts use only exact authorized origins and a generic result', async () => {
  const { auth, requests } = fixture();
  await auth.startEmail('representative@example.invalid', 'http://127.0.0.1:18418');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/auth/v1/otp');
  assert.equal(requests[0].body.email, 'representative@example.invalid');
  assert.equal(requests[0].body.create_user, true);
  assert.equal(new URLSearchParams(requests[0].query).get('redirect_to'), 'http://127.0.0.1:18418/auth/callback');
  for (const origin of ['https://unapproved.invalid', 'http://127.0.0.1:18418/other', 'http://127.0.0.1:18419', 'https://ourground.vercel.app.evil.invalid']) await assert.rejects(() => auth.startEmail('representative@example.invalid', origin), { code: 'AUTH_ORIGIN_NOT_ALLOWED' });
  assert.equal(requests.length, 1);
  assert.equal(await fixture({ failure: 400 }).auth.startEmail('representative@example.invalid', 'https://ourground.vercel.app'), undefined);
});

test('organization auth fails closed for absent or unsafe configuration and wildcard origins', async () => {
  const secretKey = sign({ role: 'service_role' });
  for (const invalid of [{}, { ...env, ACCOUNT_ALLOWED_ORIGINS: '' }, { ...env, ACCOUNT_ALLOWED_ORIGINS: 'https://*.vercel.app' }, { ...env, ACCOUNT_ALLOWED_ORIGINS: 'https://ourground.vercel.app/path' }, { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }, { ...env, SUPABASE_PUBLISHABLE_KEY: ' sb_secret_private' }, { ...env, SUPABASE_PUBLISHABLE_KEY: secretKey }]) {
    const auth = createOrganizationAuth(invalid, async () => { throw new Error('Unexpected network'); });
    assert.equal(auth.configured, false);
    await assert.rejects(() => auth.verify(sign()), { code: 'AUTH_NOT_CONFIGURED' });
  }
  assert.deepEqual(accountAllowedOrigins('https://ourground.vercel.app,http://127.0.0.1:18418'), ['https://ourground.vercel.app', 'http://127.0.0.1:18418']);
});

test('organization provider failures and limits expose only generic application errors', async () => {
  for (const failure of [429, 500]) {
    const { auth } = fixture({ failure });
    await assert.rejects(() => auth.verify(sign()), { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is temporarily unavailable. Please try again later.' });
    await assert.rejects(() => auth.startEmail('representative@example.invalid', 'https://ourground.vercel.app'), { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is temporarily unavailable. Please try again later.' });
  }
});

test('provider sign-out revokes only the supplied session and tolerates already-expired tokens', async () => {
  const { auth, requests } = fixture();
  const token = sign();
  await auth.revokeProvider(token);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/auth/v1/logout');
  assert.equal(new URLSearchParams(requests[0].query).get('scope'), 'local');
  assert.equal(requests[0].headers.get('authorization'), 'Bearer ' + token);
  for (const failure of [401, 403, 404]) await fixture({ failure }).auth.revokeProvider(token);
  await assert.rejects(() => fixture({ failure: 500 }).auth.revokeProvider(token), { code: 'AUTH_UNAVAILABLE' });
});


test('browser environment guard rejects padded private keys, service-role JWTs and secret aliases', () => {
  const secretJwt = sign({ role: 'service_role' });
  for (const privateValue of [' sb_secret_private ', '\n' + secretJwt + '\n', ' postgres://user:REPLACE_ME_TEST_PASSWORD@example.invalid/database ']) {
    const issues = publicEnvironmentProblems({ VITE_SUPABASE_PUBLISHABLE_KEY: privateValue });
    assert.equal(issues.length, 1); assert(issues[0].includes('VITE_SUPABASE_PUBLISHABLE_KEY')); assert(!issues[0].includes(privateValue));
  }
  for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'GEOAPIFY_SERVER_API_KEY']) assert.equal(publicEnvironmentProblems({ [name]: 'synthetic-private', VITE_OTHER: ' synthetic-private ' }).length, 1);
  assert.deepEqual(publicEnvironmentProblems({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789' }), []);
});
