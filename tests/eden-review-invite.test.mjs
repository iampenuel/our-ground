import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createReviewFiles, issueEdenReviewGrant } from '../scripts/eden/create-review-invite.mjs';

const helper = fileURLToPath(new URL('../scripts/eden/create-review-invite.mjs', import.meta.url));
const project = fileURLToPath(new URL('..', import.meta.url));
const approved = { adultVerified: true, country: 'US', freeTierConfirmed: true };
const flags = ['--adult-verified', '--country', 'US', '--free-tier-confirmed'];
const fixedNow = Date.parse('2026-11-06T12:00:00.000Z');
const invoke = (cwd, args = flags) => spawnSync(process.execPath, [helper, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
async function temporary(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'eden-review-invite-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('review grants require explicit operator adult, US and free-project attestations', () => {
  for (const options of [
    {}, { adultVerified: true, country: 'US' }, { country: 'US', freeTierConfirmed: true },
    { adultVerified: true, freeTierConfirmed: true }, { ...approved, adultVerified: 'true' },
    { ...approved, freeTierConfirmed: 'true' },
    ...['GB', 'DE', 'CH', 'CA', 'us', 'US '].map(country => ({ ...approved, country })),
  ]) assert.throws(() => issueEdenReviewGrant(options), /Confirm adult US eligibility/);
  for (const hours of [0, -1, 25, 1.5, NaN, Infinity, '2']) {
    assert.throws(() => issueEdenReviewGrant({ ...approved, hours }), /1 to 24 hours/);
  }
  assert.throws(() => issueEdenReviewGrant({ ...approved, now: NaN }), /1 to 24 hours/);
});

test('grant verifier matches a 32-byte code while server environment contains no raw credential', () => {
  const first = issueEdenReviewGrant({ ...approved, now: fixedNow });
  const second = issueEdenReviewGrant({ ...approved, now: fixedNow });
  assert.match(first.code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(first.code, 'base64url').byteLength, 32);
  assert.notEqual(first.code, second.code);
  assert.equal(first.environment.EDEN_REVIEWER_CODE_SHA256, createHash('sha256').update(first.code).digest('hex'));
  assert.equal(first.expiresAt, '2026-11-06T14:00:00.000Z');
  assert.equal(first.environment.EDEN_REVIEWER_EXPIRES_AT, first.expiresAt);
  assert.deepEqual(Object.keys(first.environment).sort(), [
    'EDEN_GEMINI_FREE_TIER_CONFIRMED', 'EDEN_GEMINI_MODE', 'EDEN_REVIEWER_ADULT_VERIFIED',
    'EDEN_REVIEWER_CODE_SHA256', 'EDEN_REVIEWER_COUNTRY', 'EDEN_REVIEWER_EXPIRES_AT',
  ]);
  assert(!JSON.stringify(first.environment).includes(first.code));
  assert.equal(first.environment.EDEN_GEMINI_MODE, 'synthetic-development');
  assert.equal(first.environment.EDEN_REVIEWER_COUNTRY, 'US');
  for (const hours of [1, 24]) assert.equal(Date.parse(issueEdenReviewGrant({ ...approved, now: fixedNow, hours }).expiresAt) - fixedNow, hours * 3_600_000);
});

test('file writer rejects traversal, public names and filenames outside the ignored local pattern', async () => {
  for (const output of [
    '../.env.review.local', '/tmp/.env.review.local', 'nested/.env.review.local',
    '.env.local', '.env.example', 'review.local', '.env.REVIEW.local',
    '.env.review.local.code', 'VITE_GEMINI_API_KEY', '.env.review.local\n',
  ]) await assert.rejects(createReviewFiles({ ...approved, output }), /ignored .env/);
});

test('CLI writes separate owner-only files without printing codes, verifiers or provider secrets', async t => {
  const directory = await temporary(t);
  const before = Date.now();
  const result = invoke(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output).sort(), ['codePath', 'envPath', 'expiresAt', 'notice']);
  assert.equal(output.envPath, join(directory, '.env.eden-review.local'));
  assert.equal(output.codePath, output.envPath + '.code');
  assert(Date.parse(output.expiresAt) >= before + 2 * 3_600_000);
  assert(Date.parse(output.expiresAt) <= Date.now() + 2 * 3_600_000);
  const code = (await readFile(output.codePath, 'utf8')).trim();
  const environment = await readFile(output.envPath, 'utf8');
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert(environment.includes('EDEN_REVIEWER_CODE_SHA256=' + createHash('sha256').update(code).digest('hex')));
  assert(!environment.includes(code));
  assert(!result.stdout.includes(code));
  assert(!result.stdout.includes(createHash('sha256').update(code).digest('hex')));
  assert(!environment.includes('GEMINI_API_KEY'));
  assert.equal((await stat(output.codePath)).mode & 0o777, 0o600);
  assert.equal((await stat(output.envPath)).mode & 0o777, 0o600);
});

test('existing grants, code files and symlink targets are never overwritten', async t => {
  const directory = await temporary(t);
  const envPath = join(directory, '.env.eden-review.local');
  const codePath = envPath + '.code';
  await writeFile(envPath, 'existing-environment-canary', { mode: 0o600 });
  assert.notEqual(invoke(directory).status, 0);
  assert.equal(await readFile(envPath, 'utf8'), 'existing-environment-canary');
  assert.deepEqual(await readdir(directory), ['.env.eden-review.local']);
  await rm(envPath);
  await writeFile(codePath, 'existing-code-canary', { mode: 0o600 });
  assert.notEqual(invoke(directory).status, 0);
  assert.equal(await readFile(codePath, 'utf8'), 'existing-code-canary');
  assert.deepEqual(await readdir(directory), ['.env.eden-review.local.code']);
  await rm(codePath);
  const target = join(directory, 'existing-target');
  await writeFile(target, 'symlink-target-canary', { mode: 0o600 });
  for (const protectedPath of [envPath, codePath]) {
    await symlink(target, protectedPath);
    assert.notEqual(invoke(directory).status, 0);
    assert.equal(await readFile(target, 'utf8'), 'symlink-target-canary');
    await rm(protectedPath);
  }
  assert.deepEqual(await readdir(directory), ['existing-target']);
});

test('CLI failures create no grant and report no supplied canary', async t => {
  const directory = await temporary(t);
  const canary = 'synthetic-private-input-canary';
  for (const args of [[], ['--adult-verified', '--country', canary, '--free-tier-confirmed'], [...flags, '--hours', '25'], [...flags, '--output', '../' + canary]]) {
    const result = invoke(directory, args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert(!result.stderr.includes(canary));
    assert.deepEqual(await readdir(directory), []);
  }
});

test('default and custom local grant/code filenames are excluded by project Git rules', () => {
  const names = ['.env.eden-review.local', '.env.eden-review.local.code', '.env.custom-review.local', '.env.custom-review.local.code'];
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: project, input: names.join('\n') + '\n', encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), names);
});
