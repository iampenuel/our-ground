import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resourceSymbol} from '../src/resource-symbol.ts';
import {resourceDetailContent,meaningfulResourceDescription} from '../src/resource-detail-view.ts';
import {supportCards} from '../src/support-view.ts';
import {resourceUsefulFacts} from '../src/support-resource-context.ts';

const summary='HRSA-listed health center. Contact the site to confirm services, hours, costs, eligibility and current availability.';
const resource={
 id:'11111111-1111-4111-8111-111111111111',title:'Fixture community clinic',summary,
 description:summary+' This imported listing has not been independently verified by Our Ground.',
 category_slugs:['healthcare'],organization:{id:'fixture-org',name:'Fixture health organization'},
 location:{city:'Boston',state:'MA',address_label:'123 Example Street',latitude:42.35,longitude:-71.06},
 contact:{phone:'(617) 555-0100',website_url:'https://example.org/clinic',directions_url:'https://www.google.com/maps/dir/?api=1&destination=42.35,-71.06'},
 hours:[],eligibility_text:null,cost_summary:null,data_kind:'imported_unverified',source_recorded_at:null,
 source:{url:'https://data.hrsa.gov/data/download',recorded_at:'2026-11-01'},
 provenance:{source_id:'hrsa-health-centers',source_name:'HRSA',source_record_id:'fixture-site',source_url:'https://data.hrsa.gov/data/download',source_updated_at:'2026-11-01',imported_at:'2026-11-05T12:00:00Z',last_seen_at:'2026-11-05T12:00:00Z',verification_status:'imported_unverified'}
};

test('detail symbols retain the exact approved bytes, intrinsic dimensions and decorative category semantics',()=>{
 for(const [category,width,height,expected]of [
  ['food',1254,1254,'6fe4619102f31ccf7f93f00ec4a44200f13e99a51a2eeb00b8468246ec088dc6'],
  ['healthcare',1536,1024,'3d16013665c9b7321057c7ce46c56c70cda33b4fb97ad44b616a76dd6e8ce3b5']
 ]){
  const path=new URL('../public/assets/resource-symbols/our-ground-'+category+'-detail-symbol.png',import.meta.url);
  const bytes=fs.readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
  assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);
  const html=resourceSymbol([category]);assert.match(html,new RegExp('data-resource-symbol="'+category+'"'));assert.match(html,new RegExp('width="'+width+'" height="'+height+'"'));assert.match(html,/alt="" aria-hidden="true"/);assert.doesNotMatch(html,/organization logo|https:|filter:|box-shadow/);
 }
 assert.equal(resourceSymbol([]),'');
});
test('sparse HRSA details omit repeated boilerplate and oversized empty sections while keeping useful facts',()=>{
 const html=resourceDetailContent(resource);
 assert.equal(meaningfulResourceDescription(resource),null);
 assert.match(html,/HRSA-listed health center\.<\/p>/);assert.doesNotMatch(html,/id="services"|detail-sidebar|Before you visit|institution-media|healthcare-support\.webp/);
 assert.equal((html.match(/Hours not listed/g)||[]).length,1);assert.match(html,/Eligibility not listed/);assert.match(html,/Costs not listed/);
 assert.match(html,/123 Example Street/);assert.match(html,/tel:6175550100/);assert.match(html,/Source &amp; verification/);assert.match(html,/id="correctionForm"/);
 assert.equal((html.match(/<img /g)||[]).length,1);assert.match(html,/healthcare-detail-symbol\.png/);
 assert.doesNotMatch(html,/Dental care|Vaccinations|Mental-health services|service is free/);
});
test('rich source-supported information is conditional, escaped, and does not duplicate the header summary',()=>{
 const rich={...resource,summary:'Community meals listed by the source.',description:'Lunch pickup for registered households. Bring the source-listed referral.',category_slugs:['food'],hours:[{weekday:1,opens_at:'09:00',closes_at:'12:30',notes:'Use the west entrance.'}],eligibility_text:'Referral required <confirm with source>.',cost_summary:'No charge listed by the source.'};
 const html=resourceDetailContent(rich);
 assert.match(html,/food-detail-symbol\.png/);assert.match(html,/What this location offers/);assert.match(html,/Lunch pickup for registered households/);assert.match(html,/Monday/);assert.match(html,/9:00 AM – 12:30 PM/);assert.match(html,/Use the west entrance/);
 assert.match(html,/Referral required &lt;confirm with source&gt;/);assert.match(html,/No charge listed by the source/);
 assert.doesNotMatch(html,/Hours not listed|Eligibility not listed|Costs not listed|<confirm/);
 assert.equal((html.match(/Community meals listed by the source/g)||[]).length,1);
});
test('untrusted text and unsafe contact/source URLs cannot create markup or active links',()=>{
 const html=resourceDetailContent({...resource,title:'<script>bad()</script>',description:'<img src=x onerror=bad()>',contact:{phone:'javascript:bad()',website_url:'javascript:bad()',directions_url:'data:text/html,bad'},source:{url:'https://user:password@example.org/',recorded_at:'bad-date'},provenance:{...resource.provenance,source_name:'<img src=x>',source_updated_at:'bad-date',imported_at:'bad-date'}});
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img src=x/);assert.doesNotMatch(html,/<script|onerror=bad\(\)>|href="(?:javascript|data):|user:password|Invalid Date/);
 assert.match(html,/Contact links are not listed/);
});
test('fictional details retain explicit safety notice and never map or expose contact actions',()=>{
 const html=resourceDetailContent({...resource,data_kind:'fictional_demo'}, {mapAvailable:true});
 assert.match(html,/Fictional example — not a real service. Do not visit/);assert.match(html,/Contact and directions are disabled/);
 assert.doesNotMatch(html,/tel:|href="https:\/\/example.org|maps\/dir|id="detailMap"|id="locationHeading"/);
 assert.match(html,/id="correctionForm"/);assert.match(html,/healthcare-detail-symbol\.png/);
});
test('review-needed status remains visible and source dates keep their actual meaning',()=>{
 const html=resourceDetailContent({...resource,provenance:{...resource.provenance,verification_status:'stale_or_needs_review'}},{mapAvailable:true});
 assert.match(html,/Imported · needs review/);assert.match(html,/data-tone="attention"/);assert.match(html,/This imported record needs review/);
 assert.match(html,/Dataset updated Nov 1, 2026/);assert.match(html,/Imported Nov 5, 2026/);assert.match(html,/Source and import dates do not confirm current availability/);
 assert.match(html,/details class="detail-map-disclosure"/);assert.match(html,/Showing the map connects to Geoapify/);assert.match(html,/id="detailMap" hidden/);
});
test('Find Support cards have no imagery, keep direct actions and expand only meaningful details in context',()=>{
 const card={...resource,distance_miles:2},html=supportCards([{kind:'directory',key:'directory:'+resource.id,record:card}],null,'/support?category=healthcare');
 assert.doesNotMatch(html,/<img|resource-symbol|institution-media|support.webp/);assert.match(html,/Directions/);assert.match(html,/tel:6175550100/);assert.match(html,/Website/);assert.doesNotMatch(html,/About this location|href="\/resources\//);assert.match(html,/Copy resource link/);assert.match(html,/Report incorrect information/);
 assert.match(html,/data-resource-open=.*?>View source record<\/a>/);
 const facts=resourceUsefulFacts({...resource,provenance:{...resource.provenance,source_record_id:'public<site>'}});
 assert.match(facts,/HRSA · Record public&lt;site&gt;/);assert.match(facts,/confirm services, hours and availability/);assert.doesNotMatch(facts,/<h4>Hours|<site>/);
 const rich=supportCards([{kind:'directory',key:'directory:'+resource.id,record:{...card,detail_level:'substantive'}}],null);
 assert.match(rich,/About this location/);
});


test('reviewed Seattle schedule remains raw source text under Hours without invented weekday times',()=>{
 const value={...resource,summary:'Community meals. Listed by Seattle Human Services.',description:'Community meals. Source-listed schedule: Friday: 1st/3rd Fri: 4-6pm. Confirm current times before visiting.',category_slugs:['food'],provenance:{...resource.provenance,source_id:'seattle-food-resources'}};
 const html=resourceDetailContent(value);
 assert.doesNotMatch(html,/Hours not listed|id="services"|detail-hours/);
 assert.match(html,/Friday: 1st\/3rd Fri: 4-6pm/);
 assert.match(html,/Schedule text supplied by the source/);
 const unbound=resourceDetailContent({...value,provenance:{...value.provenance,source_id:'another-source'}});
 assert.match(unbound,/Hours not listed/);
});
test('source licenses and attribution are disclosed with safe escaped links in cards and details',()=>{
 const value={...resource,provenance:{...resource.provenance,license_name:'Public domain <source>',license_url:'https://data.seattle.gov/license',attribution:'Seattle Human Services <Department>'}};
 for(const html of [resourceDetailContent(value),supportCards([{kind:'directory',key:'directory:'+value.id,record:{...value,distance_miles:2}}],null)]){
  assert.match(html,/Public domain &lt;source&gt;/);assert.match(html,/Seattle Human Services &lt;Department&gt;/);
  assert.match(html,/href="https:\/\/data.seattle.gov\/license"/);assert.match(html,/rel="noopener noreferrer"/);
 }
 const unsafe={...value,provenance:{...value.provenance,license_url:'javascript:alert(1)'}};
 for(const html of [resourceDetailContent(unsafe),supportCards([{kind:'directory',key:'directory:'+value.id,record:{...unsafe,distance_miles:2}}],null)])assert.doesNotMatch(html,/href="javascript:/);
});
