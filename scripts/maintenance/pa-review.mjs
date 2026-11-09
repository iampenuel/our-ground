// Offline, review-only comparison. No database connection, provider, or publication method.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const day=86400000;
export const policies=Object.freeze({
  'philly-food-sites':{scope:'Philadelphia feed',maxSourceDays:45,lastFullRows:404,id:/^\d{1,9}$/},
  'hrsa-health-centers':{scope:'Existing pilot bindings only',maxSourceDays:7,lastFullRows:19569,id:/^BPS-(H80|LAL)-\d{6}$/},
});
export const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=/^[a-f0-9]{64}$/;
function millis(x){const n=Date.parse(x);assert(Number.isFinite(n),'Invalid date');return n;}
const privacy=new Set(['privacy_withdrawal','suppressed','suppressed_or_missing_address']);
export function reviewFeed({source,rows,holds=[],capturedAt},data,checkedAt){
  const p=policies[source];assert(p&&source===data.source.id&&rows.length&&hex.test(data.checksum),'Wrong source or empty inventory');
  const now=millis(checkedAt),date=millis(data.source_updated_at),base=millis(capturedAt);
  assert(date<=now&&base<=now,'Future-dated source or inventory');
  assert(rows.length<=5000&&holds.every(id=>p.id.test(id)),'Invalid inventory size or hold identity');
  const past=new Map(),seen=new Map(),held=new Set(holds);
  for(const r of rows){assert(p.id.test(r.id)&&!past.has(r.id)&&hex.test(r.hash)&&millis(r.sourceDate)<=date,'Duplicate baseline ID, invalid hash or regressed source date');assert(['active','inactive','suppressed','stale_or_needs_review'].includes(r.status)&&typeof r.protected==='boolean'&&millis(r.importedAt)<=millis(r.lastSeen)&&millis(r.lastSeen)<=base,'Invalid inventory timestamps or state');past.set(r.id,r);}
  for(const [group,isExcluded] of [[data.records,false],[data.excluded,true]])for(const r of group){
    assert(p.id.test(r.record_id)&&!seen.has(r.record_id)&&(isExcluded?typeof r.reason==='string':hex.test(r.hash)),'Duplicate, ambiguous or malformed source row');seen.set(r.record_id,r);
  }
  assert(seen.size===data.summary.source_rows,'Incomplete normalized feed');
  const warnings=[],events=[],counts={};let missing=0;
  const sorted=[...new Set([...past.keys(),...seen.keys()])].sort();
  for(const id of sorted){
    const old=past.get(id),fresh=seen.get(id);
    if(!old&&(source==='hrsa-health-centers'||fresh?.reason||held.has(id)))continue;
    let kind;
    if(held.has(id)||old?.status==='suppressed')kind='privacy_hold';
    else if(privacy.has(fresh?.reason))kind='urgent_privacy_withdrawal';
    else if(!fresh){kind='missing_requires_review';missing++;}
    else if(fresh.reason==='inactive')kind='publisher_inactive';
    else if(fresh.reason)kind='quality_quarantine';
    else if(old&&(old.protected||old.status!=='active'))kind='protected_review';
    else if(!old)kind='proposed_addition';
    else if(old.hash!==fresh.hash)kind='proposed_change';
    else kind='unchanged';
    const flags=[];
    if(old?.protected)flags.push('local_review_or_correction');
    if(old&&(now-millis(old.lastSeen))/day>30)flags.push('import_observation_over_30_days');
    counts[kind]=(counts[kind]||0)+1;
    if(kind!=='unchanged'||flags.length){
      const sensitive=kind==='privacy_hold'||kind==='urgent_privacy_withdrawal';
      events.push({id,kind,flags,previous:sensitive?null:old?.hash??null,candidate:sensitive?null:fresh?.hash??null,exclusion:fresh?.reason??null,importedAt:old?.importedAt??null,lastImportObservation:old?.lastSeen??null});
    }
  }
  if(data.coordinate_validation?.unmatched_city_records||data.coordinate_validation?.ambiguous_city_records)warnings.push('review_geographic_reference');
  if(data.summary.source_rows<p.lastFullRows*0.9||missing>rows.length*0.1)warnings.push('unexpected_loss_check_completeness');
  if((now-date)/day>p.maxSourceDays)warnings.push('stale_source_date');
  if((now-base)/day>7)warnings.push('refresh_staging_inventory');
  const content={source,scope:p.scope,checkedAt,capturedAt,sourceDate:data.source_updated_at,feedHash:data.coordinate_validation?.raw_checksum??data.checksum,normalizedHash:data.checksum,
    inventoryHash:digest([...rows].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>[r.id,r.hash,r.status,r.protected,r.importedAt,r.lastSeen,r.sourceDate]).concat([[...held].sort()])),sourceRows:seen.size,inventoryRows:rows.length,counts,warnings,events,
    reviewOnly:true,publicationAllowed:false};
  return {...content,reviewDigest:digest(content)};
}
// A receipt is a dated steward disposition for ONE event in ONE exact plan. It never releases a hold or edits a listing.
export function disposition(plan,id,decision,steward,at){
  const {reviewDigest,...body}=plan;assert(reviewDigest===digest(body)&&plan.reviewOnly&&plan.publicationAllowed===false,'Plan digest changed');
  assert(Object.hasOwn(policies,plan.source)&&(id==='source-review'||policies[plan.source].id.test(id)),'Invalid source or receipt ID');
  const event=id==='source-review'?{kind:'source_review'}:plan.events.find(e=>e.id===id);assert(event,'Not in this review queue');
  assert(['investigate','request_correction','request_withdrawal','reviewed_no_changes','defer','forward_for_manual_review'].includes(decision)&&/^[a-z0-9_-]{2,40}$/i.test(steward),'Invalid decision or steward alias');
  if(decision==='reviewed_no_changes')assert(id==='source-review'&&!plan.events.length&&!plan.warnings.length,'Unresolved events or warnings');
  assert(millis(at)>=millis(plan.checkedAt),'Review predates plan');
  return {source:plan.source,id,event:event.kind,decision,steward,reviewedAt:at,reviewDigest,publicationAllowed:false};
}
