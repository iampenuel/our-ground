import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hrsaRequiredHeaders,normalizeHrsaCsv,parseCsv,sourceUuid,importHrsa} from '../backend/hrsa-import.mjs';
import {resourceStateCodes} from '../shared/resource-geography.ts';

import {baseRow,csv} from './hrsa-fixtures.mjs';
test('HRSA parser validates exact required named fields and proper CSV quoting',()=>{
 const row={...baseRow,'Site Name':'Clinic, "North"\nSecond line'};assert.equal(normalizeHrsaCsv('\uFEFF'+csv([row])).records[0].name,row['Site Name']);
 assert.throws(()=>normalizeHrsaCsv(csv([baseRow],hrsaRequiredHeaders.slice(1))),/schema/);
 assert.throws(()=>parseCsv(csv([baseRow])+',"unclosed'),/Unclosed/);
 assert.throws(()=>normalizeHrsaCsv(csv([baseRow,baseRow])),/identifiers/);
});
test('official trailing blank header is tolerated without shifting fields',()=>{
 const text=csv([baseRow]);const [head,...tail]=text.split('\r\n');assert.equal(normalizeHrsaCsv(head+',\r\n'+tail.join('\r\n')).records[0].postal_code,'02108-1234');
 assert.throws(()=>parseCsv(head+'\r\n'+tail[0]+',unexpected'),/column/);
});
test('every state, DC and the five supported territories normalize without Pennsylvania assumptions',()=>{
 for(const state of resourceStateCodes){const d=normalizeHrsaCsv(csv([{...baseRow,'Site State Abbreviation':state.toLowerCase()}]));assert.equal(d.records[0].state,state);}
});
test('stable source namespaces preserve distinct parent, location and service identities',()=>{
 assert.equal(sourceUuid('service','BPS-H80-999990'),sourceUuid('service','BPS-H80-999990'));
 assert.notEqual(sourceUuid('service','BPS-H80-999990'),sourceUuid('location','BPS-H80-999990'));
 const d=normalizeHrsaCsv(csv([baseRow]));assert.equal(d.records[0].snapshot.record_id,baseRow['BPHC Assigned Number']);assert.equal(d.source_updated_at,'2026-11-05T00:00:00.000Z');
});
test('source date changes are recency updates rather than fabricated field verification',()=>{
 const a=normalizeHrsaCsv(csv([baseRow])),b=normalizeHrsaCsv(csv([{...baseRow,'Data Warehouse Record Create Date':'11/06/2026'}]));assert.equal(a.records[0].hash,b.records[0].hash);assert.notEqual(a.checksum,b.checksum);
 assert.throws(()=>normalizeHrsaCsv(csv([{...baseRow,'Data Warehouse Record Create Date':'02/31/2026'}])),/date/);
 assert.throws(()=>normalizeHrsaCsv(csv([baseRow,{...baseRow,'BPHC Assigned Number':'BPS-H80-999991','Data Warehouse Record Create Date':'11/06/2026'}])),/inconsistent/);
});
test('suppressed addresses, mobile units and unsupported locations never become public points',()=>{
 const cases=[{'Health Center Service Delivery Site Location Setting Description':'Domestic Violence'},{'Site Address':''},{'Site Postal Code':''},{'Health Center Location Type Description':'Mobile Van'},{'Health Center Type Description':'Administrative'},{'Health Center Type Description':'Unknown'},{'Site State Abbreviation':'FM'},{'Site State Abbreviation':'XX'},{'Site Status Description':'Terminated'},{'Geocoding Artifact Address Primary X Coordinate':''},{'Geocoding Artifact Address Primary Y Coordinate':'NaN'}];
 for(const [i,patch]of cases.entries()){
  const d=normalizeHrsaCsv(csv([baseRow,{...baseRow,...patch,'BPHC Assigned Number':'BPS-H80-'+String(999900+i)}]));assert.equal(d.records.length,1);assert.equal(d.excluded.length,1);
 }
});
test('valid positive-longitude Alaska and territory coordinates remain valid',()=>{
 for(const [state,lat,lng]of [['AK','52.83','173.18'],['HI','21.3','-157.8'],['GU','13.28','144.75'],['AS','-14.3','-170.7']]){const d=normalizeHrsaCsv(csv([{...baseRow,'Site State Abbreviation':state,'Geocoding Artifact Address Primary X Coordinate':lng,'Geocoding Artifact Address Primary Y Coordinate':lat}]));assert.equal(d.records[0].longitude,Number(lng));}
});
test('missing public contact and daily hours remain missing; unsafe websites cannot activate',()=>{
 for(const website of ['javascript:alert(1)','https://user:password@example.invalid','https://127.0.0.1/','https://localhost/','']){
  const r=normalizeHrsaCsv(csv([{...baseRow,'Site Web Address':website,'Site Telephone Number':''}])).records[0];assert.equal(r.website,null);assert.equal(r.phone,null);assert.equal(r.hours,undefined);assert.equal(r.cost_summary,undefined);assert.match(r.description,/not been independently verified/);
 }
});
test('dry-run never opens a SQL transaction or performs a database write',async()=>{
 const result=await importHrsa({begin(){throw Error('A dry-run must not touch SQL');}},normalizeHrsaCsv(csv([baseRow])));assert.equal(result.dry_run,true);assert.equal(result.accepted,1);
});

test('suppression-only snapshots retain only stable IDs and can withdraw previously public rows',()=>{
 const d=normalizeHrsaCsv(csv([{...baseRow,'Health Center Service Delivery Site Location Setting Description':'Domestic Violence','Site Address':'Confidential source address','Site Postal Code':'','Geocoding Artifact Address Primary X Coordinate':'','Geocoding Artifact Address Primary Y Coordinate':''}]));
 assert.equal(d.records.length,0);assert.deepEqual(d.excluded,[{record_id:baseRow['BPHC Assigned Number'],reason:'suppressed'}]);assert(!JSON.stringify(d).includes('Confidential source address'));assert.equal(d.summary.accepted,0);
});
