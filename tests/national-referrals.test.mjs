import assert from 'node:assert/strict';
import test from 'node:test';
import {nationalFoodReferrals, foodCoverageMessage, nationalHealthcareReferrals, healthcareCoverageMessage} from '../shared/national-referrals.ts';
import {foodSourceManifests, foodSourceAvailability, requireFoodSourceAdapter} from '../backend/food-source-adapters.ts';

test('food coverage alternatives distinguish unavailable records from unavailable assistance', () => {
  assert.match(foodCoverageMessage, /local food listings are incomplete/);
  assert.doesNotMatch(foodCoverageMessage, /No .*mapped leads|no assistance|no food help/i);
  assert.match(foodCoverageMessage, /Food help may still be available/);
  assert.match(foodCoverageMessage, /trusted referral services/);
  assert.equal(nationalFoodReferrals.length, 3);
  assert.equal(new Set(nationalFoodReferrals.map(item => item.id)).size, 3);
});

test('official food referrals contain no invented local location, availability or verification claim', () => {
  const domains = new Set(['www.feedingamerica.org', '211.org', 'www.211.org', 'www.usa.gov', 'www.fns.usda.gov']);
  for (const referral of nationalFoodReferrals) {
    assert.equal(referral.data_kind, 'external_referral');
    assert.match(referral.checked_at, /^\d{4}-\d{2}-\d{2}$/);
    assert(referral.description && referral.coverage_note && referral.action_label);
    assert(!('latitude' in referral || 'longitude' in referral || 'distance_miles' in referral || 'verified' in referral));
    for (const link of [referral.url, ...referral.source_urls]) {
      const url = new URL(link);
      assert.equal(url.protocol, 'https:');
      assert(domains.has(url.hostname));
      assert.equal(url.username + url.password + url.search + url.hash, '');
    }
  }
});

test('food referral contacts use explicit supported telephone actions and immutable public metadata', () => {
  assert.equal(nationalFoodReferrals.find(item => item.id === '211').phone_actions[0].url, 'tel:211');
  const hotline = nationalFoodReferrals.find(item => item.id === 'national-hunger-hotline');
  assert.deepEqual(hotline.phone_actions.map(item => item.url), ['tel:+18663486479', 'tel:+18778426273']);
  for (const referral of nationalFoodReferrals) {
    for (const phone of referral.phone_actions) assert.match(phone.url, /^tel:(?:211|\+1\d{10})$/);
    assert(Object.isFrozen(referral) && Object.isFrozen(referral.source_urls) && Object.isFrozen(referral.phone_actions));
  }
  assert.throws(() => { nationalFoodReferrals[0].url = 'https://attacker.invalid/'; }, TypeError);
});

test('unlicensed, unconfigured and semantically unsuitable food sources cannot silently activate', () => {
  for (const source of foodSourceManifests) {
    if(source.status==='available'){assert(source.license_evidence);assert.equal(foodSourceAvailability(source.id).available,true);assert.equal(requireFoodSourceAdapter(source.id).manifest.id,source.id);continue;}
    if(source.status!=='license_review')assert.equal(source.license_evidence, null);
    assert(['requires_permission', 'unsuitable', 'planned', 'license_review'].includes(source.status));
    assert(source.permitted_use && source.unavailable_reason && source.documentation_url);
    assert.equal(foodSourceAvailability(source.id).available, false);
    assert.throws(() => requireFoodSourceAdapter(source.id), /Food source unavailable:/);
  }
  assert.equal(foodSourceAvailability('https://attacker.invalid/feed').available, false);
  assert.throws(() => requireFoodSourceAdapter('unknown'), /No food data adapter is registered/);
  assert.equal(foodSourceManifests.find(item => item.id === 'usda-snap-retailers').categories.length, 0);
});

test('adapter lookup performs no network request or import when a source is unavailable', () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Network must not be used'); };
  try {
    for(const source of foodSourceManifests){if(source.status==='available')assert(requireFoodSourceAdapter(source.id));else assert.throws(()=>requireFoodSourceAdapter(source.id));}
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});

test('healthcare outage alternative is the fixed official HRSA locator without location forwarding or invented local evidence',()=>{assert.equal(nationalHealthcareReferrals.length,1);assert.match(healthcareCoverageMessage,/does not mean healthcare is unavailable/);const referral=nationalHealthcareReferrals[0];assert.equal(referral.data_kind,'external_referral');assert.equal(referral.url,'https://findahealthcenter.hrsa.gov/');assert.equal(new URL(referral.url).search,'');assert.equal(referral.phone_actions.length,0);assert(!('latitude' in referral||'longitude' in referral||'verified' in referral||'distance_miles' in referral));assert(referral.source_urls.includes('https://bphc.hrsa.gov/sites/default/files/bphc/about/health-center-handout.pdf'));assert(Object.isFrozen(referral)&&Object.isFrozen(referral.source_urls));});
