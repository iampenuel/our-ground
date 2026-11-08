import test from 'node:test';import assert from 'node:assert/strict';
import {selectReviewedMedia,institutionMedia,mediaIdentity} from '../src/institution-media.ts';
const record={id:'fixture-resource',data_kind:'sourced_unverified',title:'Fixture',organization:{name:'Fixture organization'},category_slugs:['food'],location:{address_label:'Exact street',city:'Test city',state:'PA'},contact:{website_url:'https://example.org/'}};
const binding=mediaIdentity(record);
const logo={kind:'official_logo',src:'/images/institutions/test-logo.png',width:700,height:120,sourceUrl:'https://example.org/brand',checkedOn:'2026-11-05',rightsNote:'Synthetic test fixture only, no real institution.'};
const review=assets=>[{binding,assets}];
test('reviewed media priority: approved image, official logo, official image, category',()=>{
 const approved={...logo,kind:'approved_image',src:'/images/institutions/test-image.webp'},image={...logo,kind:'official_image'};
 assert.equal(selectReviewedMedia(binding,review([image,logo,approved])).kind,'approved_image');
 assert.equal(selectReviewedMedia(binding,review([image,logo])).kind,'official_logo');assert.equal(selectReviewedMedia(binding,review([image])).kind,'official_image');
 assert.equal(selectReviewedMedia(binding),null);assert.match(institutionMedia(record),/community-giving.webp/);assert.match(institutionMedia({...record,category_slugs:['healthcare']}),/healthcare-support.webp/);
});
test('exact identity/domain/location binding fails closed on lookalikes, duplicates and changed records',()=>{
 for(const patch of [{id:'different'},{name:'Similar name'},{city:'Other city'},{state:'NJ'},{address:'Changed address'},{website:null},{website:'https://example.org.evil.invalid/'},{source:'geoapify'}])assert.equal(selectReviewedMedia({...binding,...patch},review([logo])),null);
 assert.equal(selectReviewedMedia(binding,[...review([logo]),...review([logo])]),null);
});
test('external, executable, traversal and undocumented media never render as approved assets',()=>{
 for(const patch of [{src:'https://example.org/logo.png'},{src:'data:image/svg+xml,bad'},{src:'/images/institutions/../logo.png'},{src:'/images/institutions/logo.svg'},{sourceUrl:'javascript:bad'},{sourceUrl:'https://other.example/logo'},{width:0},{width:Infinity},{width:10000},{rightsNote:''},{checkedOn:'today'}])assert.equal(selectReviewedMedia(binding,review([{...logo,...patch}])),null);
});
test('logo markup preserves intrinsic aspect ratio, escaped text and source attribution without remote image loads',()=>{
 const html=institutionMedia(record,false,review([logo]));assert.match(html,/data-kind="official_logo"/);assert.match(html,/width="700" height="120"/);assert.match(html,/Official organization logo/);assert.match(html,/noopener noreferrer/);assert.match(html,/referrerpolicy="no-referrer"/);assert.doesNotMatch(html,/<img[^>]+src="https/);
 const attack={...record,organization:{name:'<script>bad</script>'}};assert.doesNotMatch(institutionMedia(attack),/<script>/);
});
test('fictional records never acquire official identity media and category images never imply a provider photo',()=>{
 assert.doesNotMatch(institutionMedia({...record,data_kind:'fictional_demo'},false,review([logo])),/official_logo|example.org/);
 const html=institutionMedia(record);assert.match(html,/Category illustration · not this provider/);assert.match(html,/about#ai-and-imagery/);assert.doesNotMatch(html,/Temporary photo placeholder|dashed/);
});
