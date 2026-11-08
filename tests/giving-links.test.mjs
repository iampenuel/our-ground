import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedGivingFor} from '../backend/giving-links.ts';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {readSupportState,supportUrl} from '../src/support-model.ts';
import {supportCards} from '../src/support-view.ts';
import {geoCity,geoFeature,geoTestEnv} from './geoapify-fixtures.mjs';

const hospice={
  source:'geoapify', id:'518ccf64ff3cca52c0597558ff1e61fa4340f00103f9015da85da40000000092031253742e204a6f686e277320486f7370696365',
  name:"St. John's Hospice", street:'1221 Race St.', city:'Philadelphia', state:'PA', postcode:'19107', website:'https://saintjohnshospice.org/'
};
const clinic={
  source:'geoapify', id:'51a439b2f24bca52c059350c1f1153f94340f00103f9011c6e3c940200000092030e4d617a7a6f6e692043656e746572',
  name:'Mazzoni Center', street:'1201 Locust Street', city:'Philadelphia', state:'PA', postcode:'19107', website:'https://www.mazzonicenter.org/'
};
test('official donation evidence binds exact identities and supporting location and domain',()=>{
  assert.equal(reviewedGivingFor(clinic).donation_url,'https://www.mazzonicenter.org/donate-mazzoni-center');
  assert.equal(reviewedGivingFor(hospice).donation_url,'https://saintjohnshospice.org/donate/');
  for (const patch of [{source:'directory'}, {id:'different_place'}, {street:'1334 Bainbridge Street'}, {postcode:'19103'}, {postcode:''}, {city:'Pittsburgh'}, {state:'NJ'},
    {name:'Other Mazzoni Center'}, {website:'https://mazzonicenter.org.example.com/'},{website:'https://rogue@mazzonicenter.org/'},{website:null}]) {
    assert.equal(reviewedGivingFor({...clinic,...patch}),undefined);
  }
});
test('only real, matched provider records receive separate server-reviewed metadata',async()=>{
  const feature=geoFeature('Philadelphia',{place_id:hospice.id,name:hospice.name,website:hospice.website,city:hospice.city,postcode:hospice.postcode,street:'Race Street',housenumber:'1221'});
  const fake={...feature,properties:{...feature.properties,place_id:'lookalike_place',donation_url:'https://example.com/pay',reviewed_giving:{donation_url:'https://example.com/pay'}}};
  const provider=createGeoapifyProvider({env:geoTestEnv,fetcher:async url=>Response.json(String(url).includes('geocode')?{results:[geoCity('Philadelphia')]}:{features:[feature,fake]})});
  const result=await provider.search({query:'Philadelphia, PA',term:'food_assistance',radiusMiles:10});
  assert.equal(result.items[0].reviewed_giving.donation_url,'https://saintjohnshospice.org/donate/');
  assert.equal(result.items[1].reviewed_giving,undefined);
});
const record={place_id:'fixture_place',data_kind:'geoapify_discovered',category:'food',state:'PA',name:'Fixture',address:'Public address',categories:['service.social_facility.food'],distance_miles:1,latitude:40,longitude:-75,attributions:[]};
const card=(extra,intent='give')=>supportCards([{key:'geoapify:sample',kind:'geoapify',record:{...record,...extra}}],null,'/support',intent);
test('giving cards distinguish confirmed, listed website, contact-only and missing information',()=>{
  const donation=card({reviewed_giving:reviewedGivingFor(hospice)});
  assert.match(donation,/Donate on organization website/); assert.match(donation,/Official source/); assert.match(donation,/Link checked 2026-11-04/);
  assert.match(donation,/noopener noreferrer/);
  const website=card({website_url:'https://example.org/clinic'});
  assert.match(website,/Visit organization website/); assert.match(website,/Listed website/); assert.match(website,/Online donation information not confirmed/);
  const phone=card({phone:'(215) 555-0199'});
  assert.match(phone,/tel:2155550199/); assert.match(phone,/Contact the organization about ways to give/);
  for (const payment of ['https://paypal.me/unknown','https://checkout.stripe.com/pay/unknown','https://example.org/donate']) {
    assert.ok(!card({website_url:payment}).includes(payment));
  }
  const missing=card({website_url:'javascript:alert(1)',phone:'unknown'});
  assert.match(missing,/no website or contact/); assert.doesNotMatch(missing,/javascript|tel:|Donate on/);
  for (const html of [donation,website,phone,missing]) assert.doesNotMatch(html,/nonprofit|tax.deductible|501.c.3/i);
  assert.doesNotMatch(card({reviewed_giving:reviewedGivingFor(hospice)},'resident'),/Donate on/);
  assert.doesNotMatch(card({reviewed_giving:{...reviewedGivingFor(hospice),donation_url:'data:text/html,bad'}}),/Donate on|data:text/);
});
test('giving intent survives search and shareable in-context resource links; fictional cards never offer giving',()=>{
  const state=readSupportState(new URLSearchParams('intent=give&location=02108&term=medical_clinic&view=list'));
  const url=supportUrl(state);
  assert.equal(readSupportState(new URL(url,'http://local').searchParams).intent,'give');
  const directory={id:'11111111-1111-4111-8111-111111111111',organization:{id:'fixture_org',name:'Fixture organization'},title:'Fixture clinic',location:{city:'Boston',state:'MA',address_label:'Listed address',latitude:42,longitude:-71},summary:'Fixture',category_slugs:['healthcare'],
    data_kind:'sourced_unverified',distance_miles:2,contact:{website_url:'https://example.org/',phone:'2155550199'}};
  const html=r=>supportCards([{key:'directory:dir',kind:'directory',record:r}],null,url,'give');
  assert.match(html(directory),/Boston, MA/);
  assert.match(html(directory),/Visit organization website/);
  assert.match(html(directory),/resource=11111111-1111-4111-8111-111111111111/);assert.match(html(directory),/intent=give/);assert.doesNotMatch(html(directory),/href="\/resources\//);
  const demo=html({...directory,data_kind:'fictional_demo',reviewed_giving:reviewedGivingFor(hospice)});
  assert.doesNotMatch(demo,/Donate on|organization website|tel:|maps\/dir|example\.org/);
});
