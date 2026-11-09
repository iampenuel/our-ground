import {test} from 'node:test';import assert from 'node:assert/strict';import {deflateRawSync,crc32} from 'node:zlib';
import {parseGazetteer,unpackGazetteerZip,normalizedGeographicName,validateGazetteerBundle,importGazetteer} from '../backend/gazetteer-import.mjs';
import {createPostgresGeographicReference} from '../backend/geographic-reference.ts';
const headers={state:['USPS','GEOID','GEOIDFQ','NAME','INTPTLAT','INTPTLONG'],place:['USPS','GEOID','GEOIDFQ','ANSICODE','NAME','LSAD','FUNCSTAT','INTPTLAT','INTPTLONG']};
const states={USPS:'MA',GEOID:'25',GEOIDFQ:'0400000US25',NAME:'Massachusetts',INTPTLAT:'42.2',INTPTLONG:'-71.8'};
const place={USPS:'MA',GEOID:'2507000',GEOIDFQ:'1600000US2507000',ANSICODE:'00619463',NAME:'Boston city',LSAD:'25',FUNCSTAT:'A',INTPTLAT:'42.3',INTPTLONG:'-71.0'};
const file=(kind,rows)=>headers[kind].join('|')+'\n'+rows.map(row=>headers[kind].map(h=>row[h]).join('|')).join('\n')+'\n';
function archive(text,kind='place'){
 const name=Buffer.from(`2026_Gaz_${kind}_national.txt`),raw=Buffer.from(text),payload=deflateRawSync(raw),crc=crc32(raw);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(payload.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
 const center=Buffer.alloc(46);center.writeUInt32LE(0x02014b50);center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);center.writeUInt16LE(8,10);center.writeUInt32LE(crc,16);center.writeUInt32LE(payload.length,20);center.writeUInt32LE(raw.length,24);center.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(center.length+name.length,12);end.writeUInt32LE(local.length+name.length+payload.length,16);
 return Buffer.concat([local,name,payload,center,name,end]);
}
test('Census import preserves official geographic IDs, canonical name and representative point',()=>{
 const d=parseGazetteer('place',file('place',[place]));assert.equal(d.records[0].id,'census:2026:place:2507000');assert.equal(d.records[0].ansi_code,'00619463');assert.equal(d.records[0].canonical_name,'Boston city');assert.equal(d.records[0].display_name,'Boston');assert.equal(d.records[0].latitude,42.3);assert.equal(d.records[0].street_address,undefined);assert.equal(d.vintage,2026);
});
test('only documented LSAD suffixes create a short name, without changing the canonical record',()=>{
 const d=parseGazetteer('place',file('place',[{...place,NAME:'City of Industry city'}]));assert.equal(d.records[0].display_name,'City of Industry');
 const noGuess=parseGazetteer('place',file('place',[{...place,NAME:'Urban Honolulu CDP',LSAD:'57'}]));assert.equal(noGuess.records[0].display_name,'Urban Honolulu');assert(!noGuess.records[0].names.some(x=>x.name==='Honolulu'));
 const state=parseGazetteer('state',file('state',[states]));assert.deepEqual(state.records[0].names,[{name:'Massachusetts',kind:'canonical'},{name:'MA',kind:'state_code'}]);
});
test('case, punctuation, whitespace, apostrophes and diacritics normalize deterministically',()=>{
 assert.equal(normalizedGeographicName('  Peñuelas  '),'penuelas');assert.equal(normalizedGeographicName('PEÑUELAS'),'penuelas');assert.equal(normalizedGeographicName("O’Fallon"),'ofallon');assert.equal(normalizedGeographicName('St.-Louis'),'st louis');
});
test('missing schema, duplicate identities, invalid coordinate/state evidence and mixed geographies fail closed',()=>{
 assert.throws(()=>parseGazetteer('place','GEOID|NAME\n2507000|Boston'),/schema/);
 assert.throws(()=>parseGazetteer('place',file('place',[place,place])),/identity/);
 for(const patch of [{INTPTLAT:'91'},{INTPTLONG:'NaN'},{INTPTLONG:'0x12'},{USPS:'XX'},{GEOIDFQ:'0400000US25'}])assert.throws(()=>parseGazetteer('place',file('place',[{...place,...patch}])),/invalid/);
 assert.throws(()=>parseGazetteer('zcta',file('place',[place])),/Unsupported/);
 const conflicting=[parseGazetteer('state',file('state',[{...states,USPS:'CA',GEOID:'06',GEOIDFQ:'0400000US06'}])),parseGazetteer('place',file('place',[{...place,USPS:'CA'}]))];assert.throws(()=>validateGazetteerBundle(conflicting,{allowPartial:true}),/FIPS/);
});
test('national imports reject partial replacement unless explicitly scoped to a synthetic test',()=>{
 const bundle=[parseGazetteer('state',file('state',[states])),parseGazetteer('place',file('place',[place]))];assert.throws(()=>validateGazetteerBundle(bundle),/Full national/);assert.equal(validateGazetteerBundle(bundle,{allowPartial:true}).length,2);const unapproved=structuredClone(bundle);unapproved[0].source_id='unapproved-source';assert.throws(()=>validateGazetteerBundle(unapproved,{allowPartial:true}),/explicitly configured/);
});
test('bounded archive validation checks the exact member, CRC and declared decompression size',()=>{
 const text=file('place',[place]),zip=archive(text);assert.equal(unpackGazetteerZip(zip,'place'),text);assert.throws(()=>unpackGazetteerZip(zip,'state'),/Unexpected/);
 const corrupted=Buffer.from(zip),end=corrupted.length-22,center=corrupted.readUInt32LE(end+16);corrupted.writeUInt32LE(0,center+16);assert.throws(()=>unpackGazetteerZip(corrupted,'place'),/checksum/);
 const oversized=Buffer.from(zip);oversized.writeUInt32LE(9*1024*1024,center+24);assert.throws(()=>unpackGazetteerZip(oversized,'place'),/oversized/);
 const extra=Buffer.from(zip);extra.writeUInt16LE(2,end+10);assert.throws(()=>unpackGazetteerZip(extra,'place'),/exactly one/);
});
test('dry-run neither opens a database nor invokes any external provider',async()=>{
 const bundle=[parseGazetteer('state',file('state',[states])),parseGazetteer('place',file('place',[place]))];const result=await importGazetteer({begin(){throw Error('No SQL in dry-run');}},bundle,{allowPartial:true});assert.equal(result.dry_run,true);assert.equal(result.files[1].records,1);
});
test('adapter bounds malformed requests and cancellation before opening a connection',async()=>{
 const ref=createPostgresGeographicReference({});for(const query of ['a','x'.repeat(81),'Boston\nMA'])assert.deepEqual(await ref.findCandidates(query),[]);assert.deepEqual(await ref.findCandidates('Boston',undefined,6),[]);
 const abort=new AbortController();abort.abort();await assert.rejects(ref.findCandidates('Boston',undefined,5,abort.signal),e=>e.name==='AbortError');await ref.close();
});
