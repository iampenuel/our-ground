// Local synthetic drill. Run from the pinned release workspace with its isolated TLS database and local Redis.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const workspace = process.cwd();
const production = process.argv[2];
assert(production && path.isAbsolute(production), 'Pass the absolute path of the verified production checkout.');
const origin = 'https://ourground.vercel.app';
const scratch = path.join(workspace, 'tmp/production-gates');
const ca = fs.readFileSync(path.join(scratch, 'tls/server.crt'), 'utf8');
const database = '127.0.0.1:19474/ourground_release_rehearsal';
const connect = uri => postgres(uri, { ssl: { ca, rejectUnauthorized: true }, max: 1, prepare: false, onnotice() {} });
const owner = connect('postgresql://postgres@' + database);
const secret = () => randomBytes(32).toString('hex');
const runtimePassword = secret();
const reviewerPassword = secret();
const runtimeURI = 'postgresql://our_ground_api:' + runtimePassword + '@' + database;
const runtime = connect(runtimeURI);
const reviewer = connect('postgresql://gate_reviewer_fixture:' + reviewerPassword + '@' + database);
const compiled = path.join(production, '.vercel/output/functions/api/index.func');
const manifest = JSON.parse(fs.readFileSync(path.join(production, '.vercel/output/static/ourground-build-evidence.json')));
assert.equal(manifest.source_commit, '04fbdeb7793710bec14a1e6f91ca38a4916488d2');
const sock = '/private/tmp/ourground-production-gate-redis.sock';
let simulateOutage = false;
let admissions = 0;
let closeArtifactDatabase;

try {
  const [guard] = await owner`select current_database() as db, current_user as owner,
    (select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls,
    (select count(*) from directory_ops.review_events)::int as prior_reviews,
    (select rolcanlogin from pg_roles where rolname='our_ground_api') as runtime_login,
    exists(select 1 from pg_roles where rolname='gate_reviewer_fixture') as reviewer_exists`;
  assert.deepEqual({...guard}, { db: 'ourground_release_rehearsal', owner: 'postgres', tls: true,
    prior_reviews: 0, runtime_login: false, reviewer_exists: false }, 'Use a fresh isolated rehearsal.');
  await owner.begin(async tx => {
    await tx.unsafe("alter role our_ground_api login password '" + runtimePassword + "'");
    await tx.unsafe("create role gate_reviewer_fixture login noinherit password '" + reviewerPassword + "'");
    await tx`grant our_ground_steward to gate_reviewer_fixture`;
  });

  Object.assign(process.env, {
    NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: 'prj_4li6QnqulPgPbJpxMW2L9hczDNrS', BACKEND_DATA_MODE: 'postgres',
    DATABASE_URL: runtimeURI, DATABASE_SSL_CA: ca, ALLOW_DEMO_DATA: 'false',
    GEOGRAPHIC_REFERENCE_ENABLED: 'true', EDEN_GEMINI_MODE: 'disabled', ACCOUNT_EMAIL_AUTH_ENABLED: 'false',
    ACCOUNT_ALLOWED_ORIGINS: origin, RATE_LIMIT_BACKEND: 'redis',
    UPSTASH_REDIS_REST_URL: 'https://rehearsal.upstash.io', UPSTASH_REDIS_REST_TOKEN: secret(),
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).hostname, 'rehearsal.upstash.io');
    if (simulateOutage) return new Response('', {status: 503});
    const args = JSON.parse(init.body);
    assert.equal(args[0], 'EVAL');
    admissions++;
    const reply = execFileSync('redis-cli', ['-s', sock, '--json', ...args], {encoding: 'utf8'});
    return Response.json({result: JSON.parse(reply)});
  };
  const artifact = await import(pathToFileURL(path.join(compiled, 'api/index.js')));
  ({closeDatabase: closeArtifactDatabase} = await import(pathToFileURL(path.join(compiled, 'backend/postgres.js'))));
  const request = (route, body) => new Request(origin + '/api/v1/' + route, {
    method: body ? 'POST' : 'GET', headers: {Origin: origin, 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const oid = randomUUID(), lid = randomUUID(), sid = randomUUID(), alternate = randomUUID();
  const title = 'release fixture ' + sid.slice(0,8);
  const read = async route => artifact.GET(request(route));
  const nearby = async () => {
    const result = await read('resources?lat=40.27&lng=-76.88&category=food&q=' + encodeURIComponent(title) + '&page_size=20');
    assert.equal(result.status, 200);
    return (await result.json()).total;
  };
  await owner.begin(async tx => {
    await tx`insert into app_private.organizations(id,name,status,is_demo) values(${oid},${title},'published',false)`;
    await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo)
      values(${lid},${oid},${title},'Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,'published',false)`;
    for (const id of [sid, alternate]) {
      await tx`insert into app_private.services(id,organization_id,location_id,title,source_url,status,is_demo)
        values(${id},${oid},${lid},${title},'https://example.invalid/synthetic-fixture','published',false)`;
      await tx`insert into app_private.service_categories(service_id,category_id)
        select ${id},id from app_private.categories where slug='food'`;
    }
  });
  const denied = error => error.code === '42501';
  const [connection] = await runtime`select current_user, (select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls`;
  assert.deepEqual({...connection}, {current_user: 'our_ground_api', tls: true});
  assert.equal(await nearby(), 2);
  assert.equal((await read('resources/' + sid)).status, 200);
  const bad = await artifact.POST(request('correction-reports', {service_id: sid, reason_code: 'bad'}));
  assert.equal(bad.status, 422);
  const response = await artifact.POST(request('correction-reports', {
    service_id: sid, reason_code: 'wrong_location', description: 'Synthetic release drill. No resident information.',
  }));
  assert.equal(response.status, 202);
  const report = (await response.json()).id;
  for (const query of ['select * from app_private.correction_reports', 'select * from directory_ops.next_reports()', 'select * from directory_ops.review_events']) {
    await assert.rejects(runtime.unsafe(query), denied);
  }
  await reviewer`set role our_ground_steward`;
  await assert.rejects(reviewer`select * from app_private.correction_reports`, denied);
  assert((await reviewer`select * from directory_ops.next_reports()`).some(row => row.report_id === report));
  assert.equal((await reviewer`select status from directory_ops.read_report(${report})`)[0].status, 'open');
  await reviewer`select directory_ops.resolve_report(${report},'suppressed','RELEASE-FIXTURE-001')`;
  await assert.rejects(reviewer`select directory_ops.resolve_report(${report},'suppressed','RELEASE-FIXTURE-002')`);
  await assert.rejects(reviewer`update directory_ops.review_events set actor='other'`, denied);
  assert.equal(await nearby(), 0);
  for (const id of [sid, alternate]) assert.equal((await read('resources/' + id)).status, 404);
  await owner`update app_private.service_locations set status='published' where id=${lid}`;
  assert.equal((await owner`select status from app_private.service_locations where id=${lid}`)[0].status,'hidden');
  const events = await owner`select actor,action,ticket from directory_ops.review_events where report_id=${report}`;
  assert.deepEqual(Array.from(events), [{actor:'gate_reviewer_fixture', action:'suppressed', ticket:'RELEASE-FIXTURE-001'}]);
  await assert.rejects(reviewer`select directory_ops.release_hold(${lid},'RELEASE-FIXTURE-003')`, denied);
  simulateOutage = true;
  assert.equal((await read('resources?lat=40.27&lng=-76.88')).status, 503);
  simulateOutage = false;
  for (const route of ['eden/session','eden/live/token','eden/speech']) {
    assert.equal((await artifact.POST(request(route, {}))).status, 403);
  }
  const result = {
    exact_commit: manifest.source_commit, environment: 'packaged production handler, isolated TLS DB and local Redis via test-only REST adapter',
    submitted: response.status, invalid_report: bad.status, raw_queue_denied: true, review_group_can_read_target: true,
    resolved: true, actor: events[0].actor, shared_location_hidden: true, held_across_republication: true,
    append_only_for_steward: true, public_search_after: 0, public_detail_after: 404, redis_down_status: 503,
    redis_admissions: admissions, hosted_model_endpoints_disabled: true, fixture: {report,sid,lid},
  };
  fs.writeFileSync(path.join(scratch, 'ops-result.json'), JSON.stringify(result,null,2) + '\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  await Promise.allSettled([owner.end(), runtime.end(), reviewer.end(), closeArtifactDatabase?.()]);
}
