import assert from 'node:assert/strict';
import {yotiVerification} from '../../backend/yoti-age-verification.ts';

const sdk = 'aaaaaaaa-0000-4000-8000-000000000001';
const providerId = 'aaaaaaaa-0000-4000-8000-000000000002';
const evidenceId = 'aaaaaaaa-0000-4000-8000-000000000003';

export function handoffFixture() {
  const records = new Map();
  const control = { outcome: {}, creates: 0, checks: 0, request: null, unavailable: false, now: null };
  const now = () => control.now ?? Date.now();
  function get(key) {
    const record = records.get(key);
    if (!record || record.expires <= now()) { records.delete(key); return null; }
    return record.value;
  }
  function put(key, value, ttl) {
    records.set(key, { value, expires: now() + Number(ttl) * 1000 });
  }
  const store = async ([op, ...args]) => {
    if (op === 'GET') return get(args[0]);
    if (op === 'SET') {
      const [key, value, , ttl] = args;
      if (get(key) !== null) return null;
      put(key, value, ttl);
      return 'OK';
    }
    assert.equal(op, 'EVAL');
    const [, , key, before, after, ttl] = args;
    if (key.includes(':starts:')) {
      const count = Number(get(key) ?? 0);
      if (count >= Number(before)) return 0;
      put(key, String(count + 1), 86400);
      return 1;
    }
    if (get(key) !== before) return 0;
    if (after) put(key, after, ttl);
    else records.delete(key);
    return 1;
  };
  const provider = yotiVerification(sdk, 'test-only-fixture', async (url, options) => {
    assert.equal(new URL(url).origin, 'https://age.yoti.com');
    assert.equal(options.headers['Yoti-Sdk-Id'], sdk);
    assert.equal(options.headers.Authorization, 'Bearer test-only-fixture');
    assert.equal(options.redirect, 'error');
    if (control.unavailable) return new Response(null, {status: 503});
    if (options.method === 'POST') {
      assert.equal(new URL(url).pathname, '/api/v1/sessions');
      control.creates++;
      control.request = JSON.parse(options.body);
      assert.equal(control.request.type, 'OVER');
      assert.deepEqual(control.request.doc_scan, {
        allowed: true, threshold: 19, authenticity: 'AUTO', level: 'PASSIVE',
        preset_issuing_country: 'USA', retry_enabled: false, retry_limit: 1,
      });
      assert.equal(control.request.age_estimation.allowed, false);
      return Response.json({id: providerId, status: 'PENDING'});
    }
    assert.equal(new URL(url).pathname, '/api/v1/sessions/' + providerId + '/result');
    control.checks++;
    return Response.json({
      id: providerId, sdk_id: sdk, reference_id: control.request.reference_id,
      expires_at: new Date(Date.now() + 600000).toISOString(), type: 'OVER',
      status: 'COMPLETE', method: 'DOC_SCAN', age: 19, evidence_id: evidenceId,
      doc_scan: {threshold: 19, allowed: true, level: 'PASSIVE'}, ...control.outcome,
    });
  });
  return {handoff: {store, provider, dailyLimit: 10}, control};
}
