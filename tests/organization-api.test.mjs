import { PublicProtectionError } from '../backend/anonymous-protection.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleOrganization, validateClaim, validateListingPatch, sessionHash } from '../backend/organization-api.ts';
import { OrganizationStoreError } from '../backend/organization-store.ts';

const ids = { user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', admin: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', session: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', service: '11111111-1111-4111-8111-111111111111' };
const claim = { organization_name: 'Synthetic Organization', website_url: 'https://example.invalid/', location: 'Harrisburg, PA', applicant_role: 'Listing coordinator', contact_email: 'alice@organization.invalid', contact_phone: null, explanation: 'Synthetic request for deterministic verification.' };
const jsonHeaders = { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:18419' };
function setup() {
  const calls = [], emails = [], revoked = new Set();
  let limits = true, failure;
  const deps = { configured: true, allowedOrigins: new Set(['http://127.0.0.1:18419']), rateSalt: 'synthetic-unit-test-rate-salt',
    verify: async token => token === 'synthetic-session' ? { id: ids.user, email: claim.contact_email, sessionId: ids.session, expiresAt: Math.floor(Date.now() / 1000) + 3600 } : null,
    startEmail: async (...args) => { emails.push(args); }, revokeProvider: async token => { calls.push(['provider.revoke', token]); },
    store: {
      async command(actor, action, input = {}) {
        calls.push([actor, action, input]);
        if (failure) throw failure;
        if (action === 'session.check' && revoked.has(input.session_hash)) throw new OrganizationStoreError(401, 'SESSION_EXPIRED', 'Your session has ended.');
        if (action === 'session.revoke') { revoked.add(input.session_hash); return { signed_out: true }; }
        if (action === 'account.get') return { id: actor, role: 'user', organizations: [], claims: [], listings: [], revisions: [] };
        if (action.startsWith('admin.')) throw new OrganizationStoreError(403, 'ACCESS_DENIED', 'Administrator access is required.');
        return { id: ids.service, status: 'pending', ...input };
      },
      async consumeAccountLimit(hash, action) { calls.push(['rate', action, hash]); return limits; }
    }
  };
  const send = (path, { method = 'GET', token = 'synthetic-session', value, raw, headers = {} } = {}) => handleOrganization(new Request('http://127.0.0.1:18419/api/v1' + path, { method, headers: { ...jsonHeaders, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(value !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(value) } : {}) }), path, deps);
  return { deps, send, calls, emails, setLimit: value => { limits = value; }, setFailure: value => { failure = value; } };
}
test('claim validation preserves minimal identity details and rejects privilege, unsafe and oversized fields', () => {
  assert.equal(validateClaim({ ...claim, contact_email: 'ALICE@organization.invalid' }).contact_email, claim.contact_email);
  for (const extra of [{ role: 'admin' }, { user_id: ids.admin }, { status: 'approved' }, { organization_id: ids.service }, { website_url: 'javascript:alert(1)' }, { website_url: 'https://user:password@example.invalid/' }, { contact_email: 'not-an-email' }, { organization_name: 'x' }, { explanation: 'x'.repeat(1001) }]) assert.throws(() => validateClaim({ ...claim, ...extra }), error => error.code === 'VALIDATION_ERROR');
});
test('listing validation preserves leading-zero ZIPs and enforces safe scoped fields, categories, coordinates and hours', () => {
  assert.equal(validateListingPatch({ postal_code: '02108', summary: '' }).postal_code, '02108');
  assert.equal(validateListingPatch({postal_code:'02108-1234',state:'MA',latitude:42.36,longitude:-71.06}).postal_code,'02108-1234');
  assert.equal(validateListingPatch({state:'AK',latitude:51.9,longitude:179.8}).state,'AK');
  assert.equal(validateListingPatch({state:'HI',latitude:21.3,longitude:-157.8}).state,'HI');
  assert.deepEqual(validateListingPatch({ latitude: 40.27, longitude: -76.88, state: 'PA', category_slugs: ['food', 'healthcare'], hours: [{ weekday: 1, opens_at: '09:00', closes_at: '17:00', notes: null }] }).category_slugs, ['food', 'healthcare']);
  for (const patch of [{}, { donation_url: 'https://example.invalid/donate' }, { reviewed_giving: {} }, { status: 'published' }, { organization_id: ids.service }, { contact_url: 'data:text/html,unsafe' }, { website_url: 'https://user:pass@example.invalid/' }, { state: 'XX' }, { latitude: 40.27 }, { latitude: NaN, longitude: -76 }, { latitude: 91, longitude: -76 }, { category_slugs: ['food', 'food'] }, { category_slugs: ['housing'] }, { hours: [{ weekday: 7, opens_at: '09:00', closes_at: '17:00' }] }, { hours: [{ weekday: 1, opens_at: '17:00', closes_at: '09:00' }] }, { hours: [{ weekday: 1, opens_at: '09:00:00', closes_at: '17:00:00' }] }]) assert.throws(() => validateListingPatch(patch), error => error.code === 'VALIDATION_ERROR');
});
test('account status is public and truthfully reports missing configuration', async () => {
  const response = await handleOrganization(new Request('http://localhost/api/v1/org/status'), '/org/status');
  assert.deepEqual(await response.json(), { configured: false, method: 'email_code', email_enabled:false });
  assert.equal((await handleOrganization(new Request('http://localhost/api/v1/org/account'), '/org/account')).status, 503);
});
test('signed-out and expired bearer sessions cannot submit claims or invoke account mutations', async () => {
  const { send, calls } = setup();
  for (const token of [null, 'expired-or-forged']) assert.equal((await send('/org/claims', { method: 'POST', token, value: claim })).status, 401);
  assert.equal(calls.length, 0);
});
test('email starts require exact allowed origin, use generic response and keep hashed shared gates', async () => {
  const { send, calls, emails, setLimit } = setup();
  const response = await send('/org/auth/email', { method: 'POST', token: null, value: { email: 'ALICE@organization.invalid' } });
  assert.equal(response.status, 202); assert.match((await response.json()).message, /^If email sign-in can be delivered/);
  assert.deepEqual(emails, [[claim.contact_email, 'http://127.0.0.1:18419']]);
  assert.deepEqual(calls.map(x => x[1]), ['client', 'email']);
  assert(calls.every(x => /^[a-f0-9]{64}$/.test(x[2]))); assert.notEqual(calls[0][2], calls[1][2]);
  assert.equal((await send('/org/auth/email', { method: 'POST', token: null, value: { email: claim.contact_email }, headers: { Origin: 'https://unapproved.invalid' } })).status, 403);
  assert.equal(emails.length, 1);
  setLimit(false); assert.equal((await send('/org/auth/email', { method: 'POST', token: null, value: { email: claim.contact_email } })).status, 429); assert.equal(emails.length, 1);
});
test('JSON mutations reject malformed, oversized, unknown and client-controlled approval fields', async () => {
  const { send } = setup();
  assert.equal((await send('/org/claims', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await send('/org/claims', { method: 'POST', raw: '[]' })).status, 422);
  assert.equal((await send('/org/claims', { method: 'POST', value: claim, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await send('/org/claims', { method: 'POST', raw: JSON.stringify({ ...claim, explanation: 'x'.repeat(16400) }) })).status, 413);
  assert.equal((await send('/org/claims', { method: 'POST', value: { ...claim, role: 'admin', status: 'approved' } })).status, 422);
});
test('controller forwards verified actor identity and hashed session ID, never a client-provided role', async () => {
  const { send, calls } = setup();
  const response = await send('/org/claims', { method: 'POST', value: claim }); assert.equal(response.status, 202);
  assert.deepEqual(calls[0], [ids.user, 'session.check', { session_hash: sessionHash(ids.session) }]);
  assert.equal(calls[1][0], ids.user); assert.equal(calls[1][1], 'claims.create'); assert.equal(calls[1][2].organization_name, claim.organization_name);
  assert.equal((await send('/org/admin')).status, 403);
});
test('revision controller rejects donation mutations, invalid IDs and stale/absent versions before writing', async () => {
  const { send, calls } = setup();
  const input = { expected_version: 1, expected_organization_version: 1, expected_location_version: 1, patch: { summary: 'Proposed' } };
  assert.equal((await send('/org/listings/' + ids.service + '/revisions', { method: 'POST', value: input })).status, 202);
  assert.equal(calls.at(-1)[1], 'revisions.create');
  for (const value of [{ ...input, patch: { donation_url: 'https://example.invalid/donate' } }, { ...input, expected_version: 0 }, { ...input, expected_location_version: undefined }, { ...input, user_id: ids.admin }]) assert.equal((await send('/org/listings/' + ids.service + '/revisions', { method: 'POST', value })).status, 422);
});
test('logout revokes the verified session before provider revocation and later requests fail immediately', async () => {
  const { send, calls } = setup();
  assert.equal((await send('/org/session/logout', { method: 'POST', value: {} })).status, 200);
  assert.equal(calls[1][1], 'session.revoke'); assert.equal(calls[1][2].session_hash, sessionHash(ids.session));
  assert.deepEqual(calls[2], ['provider.revoke', 'synthetic-session']);
  assert.equal((await send('/org/account')).status, 401);
});
test('unknown provider/database errors never expose credentials through account responses', async () => {
  const { send, setFailure } = setup();
  setFailure(Object.assign(new Error('https://secret.invalid/?access_token=private'), { status: 502, code: 'FETCH_FAILURE' }));
  const response = await send('/org/account'); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account information could not be loaded. Please try again.' } });
});

test('email readiness can be disabled without granting an unauthenticated sender an action',async()=>{const{deps,send,emails}=setup();deps.emailConfigured=false;const status=await send('/org/status',{token:null});assert.equal((await status.json()).email_enabled,false);const denied=await send('/org/auth/email',{method:'POST',token:null,value:{email:claim.contact_email}});assert.equal(denied.status,503);assert.equal((await denied.json()).error.code,'AUTH_EMAIL_NOT_CONFIGURED');assert.equal(emails.length,0);});

test('reserved logout budget records revocation even when ordinary authentication capacity is exhausted',async()=>{
 const {deps,send,calls}=setup();let reserved=0;deps.limitAuth=async()=>{throw new PublicProtectionError(429,'RATE_LIMITED','General budget exhausted.',60);};deps.limitLogout=async()=>{reserved++;};
 assert.equal((await send('/org/account')).status,429);const result=await send('/org/session/logout',{method:'POST',value:{}});assert.equal(result.status,200);assert.equal(reserved,1);assert(calls.some(c=>c[1]==='session.revoke'));delete deps.limitAuth;assert.equal((await send('/org/account')).status,401);
});
