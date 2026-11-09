import test from 'node:test';import assert from 'node:assert/strict';
import {reviewFeed,disposition,digest} from '../scripts/maintenance/pa-review.mjs';
const date='2026-11-01T00:00:00Z',now='2026-11-07T12:00:00Z',source='philly-food-sites',h=digest('old'),v=digest('new');
const old=(id,more={})=>({id,hash:h,status:'active',protected:false,importedAt:date,lastSeen:date,sourceDate:date,...more});
const row=(record_id,hash=h)=>({record_id,hash});
const data=(records,excluded=[])=>({source:{id:source},source_updated_at:date,checksum:h,records,excluded,summary:{source_rows:records.length+excluded.length}});
const plan=(rows,feed,holds=[],time=now)=>reviewFeed({source,rows,holds,capturedAt:now},feed,time);
test('identity, corrections, coordinate conflicts, closures and genuine deltas stay distinct; no publishing',()=>{
 const r=plan(['1','2','3','4','5','6','7'].map(id=>old(id,{protected:id==='5'})),data([row('1'),row('2',v),row('5',v),row('8')],[{record_id:'3',reason:'inactive'},{record_id:'4',reason:'coordinate_conflict'},{record_id:'6',reason:'privacy_withdrawal'}]));
 assert.deepEqual(r.counts,{unchanged:1,proposed_change:1,publisher_inactive:1,quality_quarantine:1,protected_review:1,urgent_privacy_withdrawal:1,missing_requires_review:1,proposed_addition:1});assert.deepEqual(r.events.find(x=>x.id==='5').flags,['local_review_or_correction']);assert(r.warnings.includes('unexpected_loss_check_completeness'));assert.equal(r.publicationAllowed,false);
});
test('holds and existing suppressed records cannot be released by reappearance; withdrawal data is minimized',()=>{
 const r=plan([old('1'),old('2',{status:'suppressed'})],data([row('1',v),row('2',v),row('3')]),['1','3']);
 assert.equal(r.counts.privacy_hold,2);assert(!r.events.some(e=>e.id==='3'));assert(r.events.every(e=>e.previous===null&&e.candidate===null));
});
test('stale dates and stale inventories are signaled independently of row hashes; impossible timestamps rejected',()=>{
 const r=plan([old('1')],data([row('1')]),[],'2027-01-01T00:00:00Z');assert(r.warnings.includes('stale_source_date')&&r.warnings.includes('refresh_staging_inventory'));assert(r.events[0].flags.includes('import_observation_over_30_days'));
 assert.throws(()=>plan([old('1',{sourceDate:now})],data([row('1')])));assert.throws(()=>plan([old('1')],{...data([row('1')]),source_updated_at:'2030-01-01'}));
});
test('partial and ambiguous snapshots fail rather than imply removal',()=>{
 assert.throws(()=>plan([old('1')],{...data([row('1')]),summary:{source_rows:2}}));assert.throws(()=>plan([old('1')],data([row('1')],[{record_id:'1',reason:'inactive'}])));assert.throws(()=>plan([old('1'),old('1')],data([row('1')])));
});
test('national feed does not expand the HRSA pilot; one missing binding is never a delete',()=>{
 const src='hrsa-health-centers',one='BPS-H80-000001',two='BPS-H80-000002';
 const r=reviewFeed({source:src,rows:[old(one)],capturedAt:now},{...data([row(two)]),source:{id:src}},now);
 assert.equal(r.counts.missing_requires_review,1);assert.equal(r.events.length,1);assert.equal(r.events[0].id,one);
});
test('review receipts are bound to exactly the reviewed queue; cannot resolve a hold, edit or bulk approve',()=>{
 const r=plan([old('1')],data([row('1',v)]));const receipt=disposition(r,'1','investigate','steward-1',now);
 assert.equal(receipt.reviewDigest,r.reviewDigest);assert.equal(receipt.publicationAllowed,false);
 for(const args of [[{...r,events:[]},'1','investigate'],[r,'33','investigate'],[r,'1','publish'],[r,'source-review','reviewed_no_changes']])assert.throws(()=>disposition(...args,'steward-1',now));
});
test('clean source review date is distinct from last import and never marks provider verified',()=>{
 const all=Array.from({length:404},(_,i)=>row(String(i+1)));
 const r=plan(all.map(x=>old(x.record_id)),data(all));const a=disposition(r,'source-review','reviewed_no_changes','steward-1',now);
 assert.equal(r.events.length,0);assert.equal(a.reviewedAt,now);assert.equal(a.publicationAllowed,false);
});
