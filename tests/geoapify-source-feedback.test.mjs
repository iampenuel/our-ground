import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGeoapifyProvider} from '../backend/geoapify-discovery.ts';
import {geoapifyFeedbackUrl} from '../shared/geoapify.ts';
import {geoCity,geoFeature,geoTestEnv} from './geoapify-fixtures.mjs';

async function mapped(datasource,other={}){
 const calls=[];
 const provider=createGeoapifyProvider({env:geoTestEnv,now:()=>100000,fetcher:async(url)=>{
  calls.push(new URL(url).pathname);
  return Response.json(String(url).includes('/geocode/')?{results:[geoCity()]}:{features:[geoFeature('Harrisburg',{datasource,...other})]});
 }});
 const result=await provider.search({query:'Harrisburg',term:'food_assistance',radiusMiles:10});
 assert.deepEqual(calls,['/v1/geocode/search','/v2/places']);
 assert.equal(result.items.length,1);
 return result.items[0];
}

test('mapped source feedback binds only returned typed OSM identity without extra provider calls',async()=>{
 for(const [type,id,path] of [['n',123,'node/123'],['node','456','node/456'],['w',789,'way/789'],['way','12345678901','way/12345678901'],['r',1870546,'relation/1870546'],['relation','9007199254740991','relation/9007199254740991']]){
  const record=await mapped({sourcename:'openstreetmap',raw:{osm_type:type,osm_id:id}});
  assert.equal(record.source_feedback_url,'https://www.openstreetmap.org/'+path);
  assert.equal(record.data_kind,'geoapify_discovered');
  assert.equal(record.place_id,'mock_food_Harrisburg');
 }
});

test('unsafe or untyped OSM identifiers fall back to fixed official Geoapify contact',async()=>{
 for(const id of [undefined,null,0,-1,1.5,NaN,Infinity,9007199254740992,'9007199254740992','0','-1','1.5','1e3','00123',' 123 ','123/../../user','123?redirect=https://evil.invalid',{},[],true]){
  assert.equal((await mapped({sourcename:'openstreetmap',raw:{osm_type:'n',osm_id:id}})).source_feedback_url,geoapifyFeedbackUrl);
 }
 for(const type of [undefined,null,'N','unknown','constructor','__proto__','node/1',{},1]){
  assert.equal((await mapped({sourcename:'openstreetmap',raw:{osm_type:type,osm_id:123}})).source_feedback_url,geoapifyFeedbackUrl);
 }
});

test('feedback ignores attribution URLs, unrelated datasource IDs and encoded internal place identities',async()=>{
 for(const datasource of [undefined,{sourcename:'another-source',raw:{osm_type:'n',osm_id:123}}, {sourcename:'openstreetmap',raw:[{osm_type:'n',osm_id:123}]},{sourcename:'openstreetmap',url:'https://evil.invalid/correction',attribution:'https://evil.invalid/'}, {sourcename:'openstreetmap',raw:{id:123,type:'node'}}]){
  const record=await mapped(datasource,{place_id:'encoded_node_123',source_feedback_url:'https://evil.invalid/',osm_type:'n',osm_id:123});
  assert.equal(record.source_feedback_url,'https://www.geoapify.com/about-us/');
  assert(record.attributions.every(credit=>credit.url===null||['https://www.geoapify.com/','https://www.openstreetmap.org/copyright'].includes(credit.url)));
 }
});
