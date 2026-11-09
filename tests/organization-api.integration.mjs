import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { handleApi } from '../backend/app.ts';
import { DemoRepository } from '../backend/demo.ts';
import { createOrganizationAuth } from '../backend/organization-auth.ts';
import { PostgresOrganizationStore } from '../backend/organization-store.ts';
import { sessionHash } from '../backend/organization-api.ts';
import { UnavailableError } from '../backend/errors.ts';
import { startFixtureAuth } from './organization-auth-server.mjs';

// Separate explicit local integration command; no default remote DB or .env reads.
const connection = process.env.ORG_TEST_DATABASE_URL;
if (!connection) throw Error('Set ORG_TEST_DATABASE_URL to the isolated local Phase7B PostgreSQL database.');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/ourground_7b')) throw Error('Organization API tests require an isolated loopback ourground_7b database.');
const db = postgres(connection, { max: 1, prepare: false, ssl: false, onnotice: () => {} });
const ids = Object.fromEntries(['alice', 'bob', 'admin', 'orgA', 'orgB', 'locationA', 'locationB', 'serviceA', 'serviceB'].map(key => [key, randomUUID()]));
const rollback = Error('ROLLBACK_ORGANIZATION_API_FIXTURES');
let fixtureNow = Date.now();
const fixture = await startFixtureAuth({ port: 0, now: () => fixtureNow, userIds: { 'alice@organization.invalid': ids.alice, 'bob@organization.invalid': ids.bob, 'reviewer@ourground.invalid': ids.admin } });
const publicKey = 'sb_publishable_local_fixture';
const auth = createOrganizationAuth({ NODE_ENV:'test', ACCOUNT_LOCAL_FIXTURE:'true', ACCOUNT_EMAIL_AUTH_ENABLED:'true', SUPABASE_URL: fixture.url, SUPABASE_PUBLISHABLE_KEY: publicKey, ACCOUNT_ALLOWED_ORIGINS: 'http://127.0.0.1:18419' });
const codeClient = createClient(fixture.url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const claim = { organization_name: 'Synthetic API Organization', location: 'Fictional location A, Harrisburg, PA', applicant_role: 'Listing coordinator', contact_email: 'alice@organization.invalid', website_url: null, contact_phone: null, explanation: 'Synthetic local authorization integration test.' };

test('real API + SDK verification + restricted PostgreSQL enforce the organization permission workflow', async t => {
  try {
    await db.begin(async tx => {
      for (const id of [ids.alice, ids.bob, ids.admin]) await tx`insert into app_private.app_users(id) values(${id})`;
      await tx`update app_private.app_users set role='admin' where id=${ids.admin}`;
      for (const [org, location, service, suffix] of [[ids.orgA, ids.locationA, ids.serviceA, 'A'], [ids.orgB, ids.locationB, ids.serviceB, 'B']]) {
        await tx`insert into app_private.organizations(id,name,is_demo,status) values(${org},${'Synthetic API Organization '+suffix},true,'published')`;
        await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,is_demo,status) values(${location},${org},${'Fictional API site '+suffix},'Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,true,'published')`;
        await tx`insert into app_private.services(id,organization_id,location_id,title,summary,is_demo,status) values(${service},${org},${location},${'Fictional API pantry '+suffix},'Synthetic published baseline',true,'published')`;
      }
      await tx`set local role our_ground_api`;
      // A failed SQL operation rolls back its savepoint, so later negative tests
      // continue in the same outer transaction. The entire fixture is rolled back.
      const store = new PostgresOrganizationStore((text, args = []) => tx.savepoint(sp => sp.unsafe(text, args)));
      const organizations = { configured: true, emailConfigured:auth.emailConfigured, verify: auth.verify, startEmail: auth.startEmail, revokeProvider: auth.revokeProvider, allowedOrigins: new Set(['http://127.0.0.1:18419']), rateSalt: 'isolated-api-test-'+randomUUID(), store };
      const deps = { organizations, repo: new DemoRepository(ids.alice), allowDemo: false, verifyToken: async token => (await auth.verify(token))?.id ?? null, resolvePlace: async () => null };
      const send = async (path, { token, method = 'GET', value, raw, origin = 'http://127.0.0.1:18419' } = {}, expected = 200) => {
        const response = await handleApi(new Request('http://127.0.0.1:18419/api/v1/' + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(value !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(value) } : {}) }), deps);
        const body = await response.json(); if(path.startsWith('org/')){assert.match(response.headers.get('cache-control')??'',/no-store/);assert.match(response.headers.get('x-request-id')??'',/^[a-f0-9-]{36}$/i);if(expected===429)assert(Number(response.headers.get('retry-after'))>0);}
        assert.equal(response.status, expected, path + ': ' + (body.error?.code ?? 'unexpected status')); return body;
      };
      const login = async email => {
        await send('org/auth/email', { method: 'POST', value: { email } }, 202);
        const { data, error } = await codeClient.auth.verifyOtp({ email, token: '246810', type: 'email' });
        assert.equal(error, null); assert(data.session); return data.session;
      };
      let alice, bob, admin, pending, revision;
      const revisions = patch => ({ expected_version: 1, expected_organization_version: 1, expected_location_version: 1, patch });
      const decision = (id, choice, extra = {}) => send('org/admin/claims/' + id + '/decision', { token: admin.access_token, method: 'POST', value: { decision: choice, review_note: 'Synthetic affiliation evidence reviewed', ...extra } });
      await t.test('public search and status remain available without a session, with fictional records excluded', async () => {
        assert.equal((await send('org/status')).configured, true);
        assert.equal((await send('resources?lat=40.2732&lng=-76.8867')).total, 0);
        await send('org/claims', { method: 'POST', value: claim }, 401);
        await send('services/' + ids.serviceA, { method: 'PATCH', value: { title: 'Forbidden' } }, 401);
      });
      await t.test('actual SDK code verification creates ordinary accounts with no organization edit permission', async () => {
        alice = await login('alice@organization.invalid'); bob = await login('bob@organization.invalid'); admin = await login('reviewer@ourground.invalid');
        assert.equal(alice.user.id, ids.alice); assert.equal(bob.user.id, ids.bob); assert.equal(admin.user.id, ids.admin);
        const me = await send('org/account', { token: alice.access_token }); assert.equal(me.role, 'user'); assert.deepEqual(me.listings, []);
        await send('org/listings/' + ids.serviceA, { token: alice.access_token }, 404);
        await send('org/listings/' + ids.serviceA + '/revisions', { token: alice.access_token, method: 'POST', value: revisions({ summary: 'Forbidden before approval' }) }, 404);
      });
      await t.test('pending claims grant no access and duplicate claims are rejected', async () => {
        pending = await send('org/claims', { token: alice.access_token, method: 'POST', value: claim }, 202); assert.equal(pending.status, 'pending');
        await send('org/claims', { token: alice.access_token, method: 'POST', value: claim }, 409);
        assert.equal((await send('org/account', { token: alice.access_token })).claims[0].status, 'pending');
        await send('org/listings/' + ids.serviceA, { token: alice.access_token }, 404);
      });
      await t.test('non-admin actions and self-review remain forbidden even when client bodies request elevated roles', async () => {
        await send('org/admin', { token: alice.access_token }, 403);
        await send('org/admin/claims/' + pending.id + '/decision', { token: alice.access_token, method: 'POST', value: { decision: 'approved', service_id: ids.serviceA, review_note: 'Forged self approval', source_url: 'https://example.invalid/evidence' } }, 403);
        await send('org/claims', { token: bob.access_token, method: 'POST', value: { ...claim, role: 'admin', status: 'approved' } }, 422);
        const own = await send('org/claims', { token: admin.access_token, method: 'POST', value: { ...claim, organization_name: 'Synthetic reviewer organization', contact_email: 'reviewer@ourground.invalid' } }, 202);
        await send('org/admin/claims/' + own.id + '/decision', { token: admin.access_token, method: 'POST', value: { decision: 'approved', service_id: ids.serviceB, review_note: 'Self approval must fail', source_url: 'https://example.invalid/evidence' } }, 403);
      });
      await t.test('approval explicitly binds only the selected listing and records the authorized reviewer', async () => {
        const approved = await decision(pending.id, 'approved', { service_id: ids.serviceA, source_url: 'https://example.invalid/confirmed-affiliation' });
        assert.equal(approved.status, 'approved'); assert.equal(approved.reviewer_id, ids.admin); assert(approved.reviewed_at);
        const account = await send('org/account', { token: alice.access_token }); assert.deepEqual(account.listings.map(row => row.id), [ids.serviceA]);
        await send('org/listings/' + ids.serviceB, { token: alice.access_token }, 404);
        await send('org/listings/' + ids.serviceA, { token: bob.access_token }, 404);
        await send('org/listings/' + ids.serviceB + '/revisions', { token: alice.access_token, method: 'POST', value: revisions({ summary: 'Cross-organization attempt' }) }, 404);
      });
      await t.test('distinct and multiple legitimate organization memberships remain independently scoped',async()=>{
        const bClaim=await send('org/claims',{token:bob.access_token,method:'POST',value:{...claim,organization_name:'Synthetic API Organization B',location:'Fictional B site',contact_email:'bob@organization.invalid'}},202);
        await decision(bClaim.id,'approved',{service_id:ids.serviceB,source_url:'https://example.invalid/independent-b-evidence'});
        assert.deepEqual((await send('org/account',{token:bob.access_token})).listings.map(x=>x.id),[ids.serviceB]);
        await send('org/listings/'+ids.serviceA,{token:bob.access_token},404);
        const dual=await send('org/claims',{token:alice.access_token,method:'POST',value:{...claim,organization_name:'Synthetic API Organization B',location:'Fictional B site'}},202);
        await decision(dual.id,'approved',{service_id:ids.serviceB,source_url:'https://example.invalid/independent-dual-evidence'});
        assert.deepEqual((await send('org/account',{token:alice.access_token})).listings.map(x=>x.id).sort(),[ids.serviceA,ids.serviceB].sort());
        await send('org/admin/revoke',{token:admin.access_token,method:'POST',value:{user_id:ids.alice,organization_id:ids.orgB,review_note:'Withdraw only the second organization association'}});
        assert.deepEqual((await send('org/account',{token:alice.access_token})).listings.map(x=>x.id),[ids.serviceA]);
        const privateB=await send('org/listings/'+ids.serviceB+'/revisions',{token:bob.access_token,method:'POST',value:revisions({summary:'Organization B private pending text'})},202);
        const aAccount=await send('org/account',{token:alice.access_token});assert(!aAccount.revisions.some(x=>x.id===privateB.id));assert(!JSON.stringify(aAccount).includes('Organization B private pending text'));
        await send('org/listings/'+ids.serviceB,{token:alice.access_token},404);
      });
      await t.test('suspension denies a still-valid token and organization suspension removes its scoped records',async()=>{
        const suspend=(target_type,target_id,suspended)=>send('org/admin/suspend',{token:admin.access_token,method:'POST',value:{target_type,target_id,suspended,review_note:'Synthetic suspension policy verification'}});
        await suspend('user',ids.bob,true);assert(await auth.verify(bob.access_token),'Provider token still cryptographically valid');
        await send('org/account',{token:bob.access_token},401);await send('org/listings/'+ids.serviceB,{token:bob.access_token},401);
        await suspend('user',ids.bob,false);await send('org/listings/'+ids.serviceB,{token:bob.access_token});
        await suspend('organization',ids.orgB,true);assert.deepEqual((await send('org/account',{token:bob.access_token})).listings,[]);await send('org/listings/'+ids.serviceB,{token:bob.access_token},404);
        await suspend('organization',ids.orgB,false);await send('org/listings/'+ids.serviceB,{token:bob.access_token});
      });
      await t.test('donation, ownership, publication, unsafe links and malformed mutations cannot enter the review queue', async () => {
        for (const patch of [{ donation_url: 'https://example.invalid/donate' }, { reviewed_giving: {} }, { organization_id: ids.orgB }, { status: 'published' }, { website_url: 'javascript:alert(1)' }]) await send('org/listings/' + ids.serviceA + '/revisions', { token: alice.access_token, method: 'POST', value: revisions(patch) }, 422);
        await send('org/claims', { token: alice.access_token, method: 'POST', raw: '{' }, 400);
        await send('org/auth/email', { method: 'POST', value: { email: 'alice@organization.invalid' }, origin: 'https://unapproved.invalid' }, 403);
        await send('services/'+ids.serviceA, { token: alice.access_token, method: 'PATCH', value: { expected_version: 1, title: 'Legacy direct publish attempt' } }, 409);
        await send('services/'+ids.serviceB, { token: alice.access_token, method: 'PATCH', value: { expected_version: 1, title: 'Cross-scope legacy publication' } }, 404);
        await send('services/'+ids.serviceB, { token: alice.access_token }, 404);
      });
      await t.test('a submitted revision stays pending and publication changes only after another administrator approves', async () => {
        revision = await send('org/listings/' + ids.serviceA + '/revisions', { token: alice.access_token, method: 'POST', value: revisions({ title: 'Fictional reviewed API pantry', description: 'Synthetic approved description', category_slugs: ['food'], hours: [{ weekday: 1, opens_at: '09:00', closes_at: '12:00', notes: 'Synthetic test hours' }] }) }, 202);
        assert.equal(revision.status, 'pending'); assert.equal((await send('org/listings/' + ids.serviceA, { token: alice.access_token })).title, 'Fictional API pantry A');
        await send('org/admin/revisions/' + revision.id + '/decision', { token: alice.access_token, method: 'POST', value: { decision: 'approved', review_note: 'Forged revision approval' } }, 403);
        const reviewed = await send('org/admin/revisions/' + revision.id + '/decision', { token: admin.access_token, method: 'POST', value: { decision: 'approved', review_note: 'Synthetic source independently checked' } }); assert.equal(reviewed.status, 'approved');
        const published = await send('org/listings/' + ids.serviceA, { token: alice.access_token }); assert.equal(published.title, 'Fictional reviewed API pantry'); assert.equal(published.version, 2); assert.equal(published.status, 'published'); assert.equal(published.hours[0].opens_at, '09:00');
      });
      await t.test('rejected claims and revisions create no permissions and leave published data intact', async () => {
        const rejectedClaim = await send('org/claims', { token: bob.access_token, method: 'POST', value: { ...claim, contact_email: 'bob@organization.invalid' } }, 202);
        await decision(rejectedClaim.id, 'rejected'); assert.deepEqual((await send('org/account', { token: bob.access_token })).listings.map(x=>x.id), [ids.serviceB]);
        const rejectedRevision = await send('org/listings/' + ids.serviceA + '/revisions', { token: alice.access_token, method: 'POST', value: { ...revisions({ summary: 'Rejected proposed summary' }), expected_version: 2 } }, 202);
        await send('org/admin/revisions/' + rejectedRevision.id + '/decision', { token: admin.access_token, method: 'POST', value: { decision: 'rejected', review_note: 'Synthetic details not established' } });
        assert.equal((await send('org/listings/' + ids.serviceA, { token: alice.access_token })).summary, 'Synthetic published baseline');
      });
      await t.test('revoked membership removes access immediately and blocks outstanding revision approval', async () => {
        const outstanding = await send('org/listings/' + ids.serviceA + '/revisions', { token: alice.access_token, method: 'POST', value: { ...revisions({ summary: 'Pending when revoked' }), expected_version: 2 } }, 202);
        await send('org/admin/revoke', { token: admin.access_token, method: 'POST', value: { user_id: ids.alice, organization_id: ids.orgA, review_note: 'Synthetic access withdrawn' } });
        await send('org/listings/' + ids.serviceA, { token: alice.access_token }, 404);
        const revokedAccount=await send('org/account', { token: alice.access_token });assert.deepEqual(revokedAccount.listings, []);
        assert(revokedAccount.revisions.some(row=>row.id===outstanding.id&&row.status==='pending'));
        assert(revokedAccount.revisions.every(row=>!Object.hasOwn(row,'before_snapshot')&&!Object.hasOwn(row,'current')));
        await send('org/admin/revisions/' + outstanding.id + '/decision', { token: admin.access_token, method: 'POST', value: { decision: 'approved', review_note: 'Cannot publish a revoked applicant revision' } }, 409);
      });
      await t.test('API email limits use shared database admissions without revealing account existence', async () => {
        await send('org/auth/email', { method: 'POST', value: { email: 'alice@organization.invalid' } }, 202);
        await send('org/auth/email', { method: 'POST', value: { email: 'alice@organization.invalid' } }, 202);
        await send('org/auth/email', { method: 'POST', value: { email: 'alice@organization.invalid' } }, 429);
      });
      await t.test('logout bans the exact verified session, including when provider confirmation fails', async () => {
        const principal = await auth.verify(alice.access_token); assert(principal);
        await send('org/session/logout', { token: alice.access_token, method: 'POST', value: {} });
        await send('org/account', { token: alice.access_token }, 401);
        await assert.rejects(() => store.command(ids.alice, 'session.check', { session_hash: sessionHash(principal.sessionId) }), error => error.code === 'SESSION_EXPIRED');
        const original = organizations.revokeProvider;
        organizations.revokeProvider = async () => { throw new UnavailableError('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again later.'); };
        await send('org/session/logout', { token: bob.access_token, method: 'POST', value: {} }, 503);
        assert(await auth.verify(bob.access_token), 'Synthetic provider session remains valid to prove the database ban is independent');
        await send('org/account', { token: bob.access_token }, 401); organizations.revokeProvider = original;
      });
      await t.test('expired authentication cannot be used for administrator access and audit has recorded prior decisions', async () => {
        const queue = await send('org/admin', { token: admin.access_token });
        assert(queue.audit.some(row => row.action === 'claim.approved')); assert(queue.audit.some(row => row.action === 'revision.approved')); assert(queue.audit.some(row => row.action === 'access.revoked'));
        fixtureNow += 3601_000;
        await send('org/admin', { token: admin.access_token }, 401);
      });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await fixture.close(); await db.end(); }
});
