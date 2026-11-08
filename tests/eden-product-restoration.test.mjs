import test from 'node:test';
import assert from 'node:assert/strict';
import { edenPublicPagePolicy } from '../src/eden/public-page-policy.ts';

test('legacy Eden links redirect into the existing product while the floating assistant stays on public information pages', () => {
  for (const path of ['/eden', '/eden/']) {
    const policy = edenPublicPagePolicy(path);
    assert.equal(policy.redirect, '/support');
    assert.equal(policy.assistant, false);
  }
  for (const path of ['/', '/support', '/support/', '/discover', '/give', '/organizations', '/about', '/privacy', '/resources/12345678-1234-4234-8234-123456789abc']) {
    const policy = edenPublicPagePolicy(path);
    assert.equal(policy.redirect, null);
    assert.equal(policy.assistant, true, path);
  }
  for (const path of ['/account', '/account/', '/account/administration', '/auth/callback', '/staff/services/12345678-1234-4234-8234-123456789abc', '/eden-assistant.html', '/eden/account', '/resources/not-a-public-resource', '/support/private', '/unrecognized']) {
    const policy = edenPublicPagePolicy(path);
    assert.equal(policy.assistant, false, path);
    assert.equal(policy.redirect, null);
  }
});
