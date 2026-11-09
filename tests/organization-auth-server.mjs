/** Explicit local test double for Supabase Auth's HTTP contract. Never imported by production. */
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const fixtureUsers = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'alice@organization.invalid' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'bob@organization.invalid' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'reviewer@ourground.invalid' }
];
const allowedOrigins = new Set(['http://127.0.0.1:18418', 'http://127.0.0.1:18419', 'http://localhost:18418', 'http://localhost:18419']);
export async function startFixtureAuth({ port = 18789, now = Date.now, ttlSeconds = 3600, userIds = {} } = {}) {
  if(process.env.NODE_ENV==='production'||process.env.VERCEL==='1'||process.env.VERCEL_ENV)throw Error('Synthetic authentication is forbidden in production runtimes.');
  // Trusted test setup may isolate DB identities; HTTP requests cannot supply IDs.
  const users = fixtureUsers.map(user => ({ ...user, id: userIds[user.email] ?? user.id }));
  if (users.some(user => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id))) throw new Error('Invalid synthetic fixture identity');
  const secret = randomBytes(32), sessions = new Map(), refreshTokens = new Map(), pending = new Map();
  const requests = [];
  let origin;
  function userRecord(user) {
    return { ...user, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-11-05T00:00:00.000Z', confirmed_at: '2026-11-05T00:00:00.000Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-11-05T00:00:00.000Z', updated_at: '2026-11-05T00:00:00.000Z', is_anonymous: false };
  }
  function signature(value) { return createHmac('sha256', secret).update(value).digest(); }
  function issue(user, sessionId = randomUUID()) {
    const issuedAt = Math.floor(now() / 1000), expiresAt = issuedAt + ttlSeconds;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ iss: origin + '/auth/v1', sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, session_id: sessionId, iat: issuedAt, exp: expiresAt, aal: 'aal1', amr: [{ method: 'otp', timestamp: issuedAt }] })).toString('base64url');
    const access = header + '.' + body + '.' + signature(header + '.' + body).toString('base64url');
    const refresh = randomBytes(32).toString('base64url');
    sessions.set(sessionId, { user, active: true }); refreshTokens.set(refresh, sessionId);
    return { access_token: access, token_type: 'bearer', expires_in: ttlSeconds, expires_at: expiresAt, refresh_token: refresh, user: userRecord(user) };
  }
  function verified(request) {
    try {
      const token = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
      const parts = token.split('.'); if (parts.length !== 3) return null;
      const expected = signature(parts.slice(0, 2).join('.')), received = Buffer.from(parts[2], 'base64url');
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      const session = sessions.get(claims.session_id);
      if (!session?.active || claims.sub !== session.user.id || claims.exp <= Math.floor(now() / 1000)) return null;
      return { ...session, sessionId: claims.session_id };
    } catch { return null; }
  }
  const server = createServer(async (request, response) => {
    const requestOrigin = request.headers.origin;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin' };
    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
      headers['Access-Control-Allow-Origin'] = requestOrigin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version';
    }
    function send(value, status = 200) { response.writeHead(status, headers); response.end(status === 204 ? undefined : JSON.stringify(value)); }
    const url = new URL(request.url, origin);
    requests.push({ method: request.method, path: url.pathname }); if (requests.length > 100) requests.shift();
    if (requestOrigin && !allowedOrigins.has(requestOrigin)) return send({ msg: 'Local fixture origin denied' }, 403);
    if (request.method === 'OPTIONS') return send(null, 204);
    if (request.method === 'GET' && url.pathname === '/health') return send({ status: 'ok', synthetic: true });
    if (request.method === 'GET' && url.pathname === '/test/mailbox') return send({ synthetic: true, messages: [...pending].map(([email, info]) => ({ email, code: '246810', expires_at: new Date(info.expires).toISOString() })) });
    let body = {};
    if (request.method === 'POST') {
      let raw = '';
      for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 8192) return send({ msg: 'Request too large' }, 413); }
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send({ msg: 'Invalid request' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send({ msg: 'Invalid request' }, 400);
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/otp') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const user = users.find(user => user.email === email);
      if (user) pending.set(email, { user, expires: now() + 10 * 60_000 });
      return send({});
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/verify') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '', info = pending.get(email);
      if (body.type !== 'email' || body.token !== '246810' || !info || info.expires <= now()) return send({ msg: 'Invalid or expired verification code', error_code: 'otp_expired' }, 403);
      pending.delete(email); return send(issue(info.user));
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const sessionId = refreshTokens.get(body.refresh_token), session = sessions.get(sessionId);
      if (!sessionId || !session?.active) return send({ msg: 'Refresh token not found', error_code: 'refresh_token_not_found' }, 400);
      refreshTokens.delete(body.refresh_token); return send(issue(session.user, sessionId));
    }
    if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
      const session = verified(request); return session ? send(userRecord(session.user)) : send({ msg: 'Invalid or expired session', error_code: 'bad_jwt' }, 401);
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/logout') {
      const session = verified(request); if (!session) return send({ msg: 'Session not found', error_code: 'session_not_found' }, 401);
      sessions.set(session.sessionId, { user: session.user, active: false });
      for (const [token, id] of refreshTokens) if (id === session.sessionId) refreshTokens.delete(token);
      return send(null, 204);
    }
    return send({ msg: 'Local fixture route not found' }, 404);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  return { server, url: origin, requests, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--fixture')) throw new Error('This synthetic Auth fixture requires --fixture and is only for local verification.');
  const fixture = await startFixtureAuth({ port: Number(process.env.FIXTURE_AUTH_PORT ?? 18789) });
  console.log('Synthetic organization authentication fixture: ' + fixture.url + ' (loopback only; no email is sent)');
  const close = () => { fixture.close().then(() => process.exit(0)); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
