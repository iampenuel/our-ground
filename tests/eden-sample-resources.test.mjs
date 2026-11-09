import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdenSampleResources, edenSampleFacts } from '../src/eden/sample-resources.ts';
import { EDEN_REVIEW_SCENARIOS } from '../shared/eden-review.ts';
import { edenSampleMapData, edenSampleMapStyle } from '../src/eden/sample-map-style.ts';

test('engineering sample directory displays the exact ordered review catalog without outbound data', async () => {
  const samples = createEdenSampleResources({ latencyMs: 0 });
  const place = await samples.request('places/resolve?q=Harrisburg%2C%20PA');
  assert.equal(place.place.city, 'Harrisburg');
  for (const scenario of EDEN_REVIEW_SCENARIOS) {
    samples.setScenario(scenario.id);
    const results = await samples.request('resources?category=food&radius_miles=25');
    assert.equal(results.total, 3);
    assert.deepEqual(results.items.map(card => card.title), scenario.candidates.map(candidate => candidate.label));
    assert.deepEqual(results.items.map(card => card.distance_miles), scenario.candidates.map(candidate => candidate.distanceMiles));
    for (const [index, card] of results.items.entries()) {
      assert.equal(card.data_kind, 'fictional_demo');
      assert.equal(card.summary, edenSampleFacts(scenario.candidates[index]));
      assert.deepEqual(card.contact, { website_url: null, phone: null });
      const detail = await samples.request('resources/' + card.id);
      assert.ok(detail.description.includes(card.summary));
      assert.deepEqual(detail.contact, { website_url: null, phone: null, directions_url: null });
      assert.match(detail.description, /invented listing/);
      assert.match(detail.eligibility_text, /No real eligibility/);
    }
  }
});

test('sample radius, category and keyword controls change actual results', async () => {
  const samples = createEdenSampleResources({ latencyMs: 0 });
  const near = await samples.request('resources?category=food&radius_miles=5');
  assert.deepEqual(near.items.map(card => card.distance_miles), [2, 5]);
  const filtered = await samples.request('resources?category=food&radius_miles=25&q=River');
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].title, 'Sample River Pantry');
  const care = await samples.request('resources?category=healthcare&radius_miles=25');
  assert.equal(care.items.length, 3); assert.ok(care.items.every(card => card.category_slugs[0] === 'healthcare'));
  assert.ok(care.items.every(card => card.title.includes('Community Clinic')));
});

test('sample transport rejects unsupported locations, arbitrary endpoints and aborted work', async () => {
  const samples = createEdenSampleResources({ latencyMs: 0 });
  await assert.rejects(samples.request('places/resolve?q=private%20home%20address'), /sample city/);
  await assert.rejects(samples.request('https://provider.invalid/private'), /outside the sample/);
  assert.throws(() => samples.setScenario('unrestricted visitor text'), /available sample/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(samples.request('resources?category=food', { signal: abort.signal }), error => error.name === 'AbortError');
});


test('illustrative map has only local geometry and no remote tiles, fonts or street claims', () => {
  const center = { latitude: 40.2732, longitude: -76.8867 };
  const style = edenSampleMapStyle(center);
  assert.equal(style.glyphs, undefined); assert.equal(style.sprite, undefined);
  for (const source of Object.values(style.sources)) {
    assert.equal(source.type, 'geojson');
    assert.equal(typeof source.data, 'object');
    assert.ok(source.data.features.length > 0);
  }
  assert.doesNotMatch(JSON.stringify(style), /https?:|street_name|road_name|tiles/);
  const shifted = edenSampleMapData({ latitude: center.latitude + 1, longitude: center.longitude + 1 });
  const originalFirst = style.sources['sample-regions'].data.features[0].geometry.coordinates[0][0];
  const shiftedFirst = shifted.regions.features[0].geometry.coordinates[0][0];
  assert.equal(shiftedFirst[1] - originalFirst[1], 1);
  assert.ok(Math.abs(shiftedFirst[0] - originalFirst[0] - 1) < 0.01);
});
