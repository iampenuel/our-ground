import assert from 'node:assert/strict';
import test from 'node:test';
import {getGeoapifyStyleURL, getGeoapifyMapConfiguration, geoapifyMapAttributions} from '../shared/map-provider.ts';

test('Geoapify map configuration accepts a public key without allowing caller-controlled hosts or styles', () => {
  for (const key of ['fixture-browser-key-123456', 'a'.repeat(32), 'a'.repeat(128)]) {
    const url = new URL(getGeoapifyStyleURL(key));
    assert.equal(url.origin, 'https://maps.geoapify.com');
    assert.equal(url.pathname, '/v1/styles/osm-bright-smooth/style.json');
    assert.deepEqual([...url.searchParams], [['apiKey', key]]);
    assert.equal(url.username + url.password + url.hash, '');
  }
});

test('map key validation rejects URL/credential/header injection and returns no supplied value in errors', () => {
  for (const key of [undefined, null, '', 123, 'short', ' a'.repeat(16), 'a'.repeat(129), 'https://user:password@attacker.invalid/style', 'safe_key_12345678?url=https://attacker.invalid', 'key_123456789012\r\nX-Evil:yes', 'key_123456789012#fragment', 'pk.wrong-provider-public-token', 'sk.wrong-provider-secret-token', 'sb_secret_'+ 'a'.repeat(32), 'sb_publishable_'+ 'a'.repeat(32), 'AI'+'za'+ 'a'.repeat(35)]) {
    let error;
    try { getGeoapifyStyleURL(key); } catch (value) { error = value; }
    assert(error instanceof Error);
    assert.equal(error.message, 'A valid restricted map browser key is required.');
    if (typeof key === 'string' && key.length > 5) assert(!error.message.includes(key));
  }
});

test('map renderer contract retains required data credits and free-plan branding', () => {
  const config = getGeoapifyMapConfiguration('fixture-browser-key-123456');
  assert.equal(config.provider, 'geoapify');
  assert.equal(config.attributionControl, true);assert.equal(config.freePlanBrandingRequired, true);
  assert.deepEqual(config.attributions.map(item => item.name), ['Geoapify', 'OpenStreetMap contributors', 'OpenMapTiles']);
  assert(config.attributions.every(item => item.required && new URL(item.url).protocol === 'https:'));
  assert(Object.isFrozen(config) && Object.isFrozen(geoapifyMapAttributions));
  assert.throws(() => { config.attributions[0].required = false; }, TypeError);
});
