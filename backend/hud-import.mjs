// Public HUD Housing Counselor API. Discard mailing addresses, emails, and all fields
// outside the documented public location before creating an application snapshot.
import {randomUUID} from 'node:crypto';
import {resourceStateCodes} from '../shared/resource-geography.ts';
import {sha256} from './hrsa-import.mjs';
export const HUD_ID='hud-housing-counselors';
function stableId(kind,id){
  const hex=sha256('our-ground:'+HUD_ID+':v1:'+kind+':'+id);
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
const clean=value=>typeof value==='string'?value.replaceAll('\u0000','').trim():'';
export function normalizeHud(text,capturedAt){
  if(Buffer.byteLength(text)>5_000_000 || !Number.isFinite(Date.parse(capturedAt)))throw Error('Invalid HUD snapshot');
  const rows=JSON.parse(text);
  if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Invalid HUD response');
  const records=[],seen=new Set(),excluded={};
  const reject=reason=>{excluded[reason]=(excluded[reason]??0)+1;};
  for(const r of rows){
    const id=clean(r.agcid);
    if(!/^\d{3,9}$/.test(id)||seen.has(id))throw Error('Ambiguous HUD agency identity');
    seen.add(id);
    if(r.agc_STATUS!=='A'){reject('inactive_or_unknown');continue;}
    if(!clean(r.counslg_METHOD).split(',').some(x=>x.trim().toLowerCase()==='face to face counseling')){reject('no_documented_in_person_counseling');continue;}
    const name=clean(r.nme),street=clean(r.adr1),city=clean(r.city),state=clean(r.statecd),zip=clean(r.zipcd);
    if(!resourceStateCodes.includes(state)||!/^\d{5}(?:-\d{4})?$/.test(zip)||!street||street.length>300||city.length<2||city.length>100||name.length<2||name.length>160||/\b(?:p\.?\s*o\.? box|confidential|suppressed|undisclosed)\b/i.test(street)){reject('unusable_public_address');continue;}
    const lat=Number(r.agc_ADDR_LATITUDE),lng=Number(r.agc_ADDR_LONGITUDE);
    if(!lat||!lng||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){reject('invalid_coordinates');continue;}
    const phone=clean(r.phone1);let website=null;
    try{const u=new URL(clean(r.weburl));if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&/^[a-z\d.-]+\.[a-z]{2,}$/i.test(u.hostname)&&!u.hostname.endsWith('.local'))website=u.href;}catch{}
    const snapshot={record_id:id,name,street,city,state,postal_code:zip,latitude:lat,longitude:lng,phone:/^\+?[0-9 ()-]{7,40}$/.test(phone)&&/[1-9]/.test(phone)?phone:null,website};
    const summary='HUD-listed housing counseling agency. Contact the agency to confirm counseling options, appointments, accessibility and fees.';
    records.push({...snapshot,snapshot,hash:sha256(JSON.stringify(snapshot)),organization_id:stableId('organization',id),organization_name:name,location_id:stableId('location',id),service_id:stableId('service',id),summary,description:summary+' This source listing has not been independently verified.'});
  }
  return {records,source:{id:HUD_ID},checksum:sha256(text),source_updated_at:capturedAt,summary:{source_rows:rows.length,accepted:records.length,exclusion_reasons:excluded}};
}

export async function importHud(sql,dataset){
  return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext(${HUD_ID}))`;
    const [source]=await tx`select enabled from app_private.resource_data_sources where id=${HUD_ID} for update`;
    if(!source?.enabled)throw Error('HUD source is disabled');
    const [latest]=await tx`select id,checksum,source_updated_at,summary from app_private.resource_import_runs where source_id=${HUD_ID} and completed_at is not null order by source_updated_at desc limit 1`;
    if(latest?.checksum===dataset.checksum)return {...latest.summary,already_imported:true};
    if(latest && new Date(latest.source_updated_at)>=new Date(dataset.source_updated_at))throw Error('Review HUD snapshot chronology');
    // Require coordinates reasonably near a known Census place in the stated state.
    const valid=await tx`select x.id from jsonb_to_recordset(${tx.json(dataset.records.map(r=>({id:r.record_id,state:r.state,lat:r.latitude,lng:r.longitude})))}::jsonb) as x(id text,state text,lat float8,lng float8)
      where exists(select 1 from app_private.geographic_reference_records g where g.active and g.kind='place' and g.state=x.state and abs(g.latitude-x.lat)<0.4 and abs(g.longitude-x.lng)<1 and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(g.longitude,g.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(x.lng,x.lat),4326)::extensions.geography,40000))`;
    const admitted=new Set(valid.map(r=>r.id));
    const prior=await tx`select source_record_id,record_status from app_private.resource_source_records where source_id=${HUD_ID} for update`;
    const held=new Set(prior.filter(r=>r.record_status==='inactive'||r.record_status==='suppressed').map(r=>r.source_record_id));
    const allowed=dataset.records.filter(r=>admitted.has(r.record_id)&&!held.has(r.record_id));
    const run=randomUUID();
    await tx`insert into app_private.resource_import_runs(id,source_id,checksum,source_updated_at) values(${run},${HUD_ID},${dataset.checksum},${dataset.source_updated_at})`;
    for(let i=0;i<allowed.length;i+=250)await tx`select app_private.resource_import_batch(${run}::uuid,${tx.json(allowed.slice(i,i+250))}::jsonb)`;
    const withdrawn=await tx`update app_private.resource_source_records set record_status='inactive',needs_review=true,import_run_id=${run},source_updated_at=${dataset.source_updated_at} where source_id=${HUD_ID} and import_run_id<>${run} and record_status not in ('suppressed','inactive') returning service_id`;
    if(withdrawn.length)await tx`update app_private.service_locations set status='hidden' where id in(select location_id from app_private.services where id = any(${withdrawn.map(r=>r.service_id)}::uuid[]))`;
    const summary={...dataset.summary,accepted:allowed.length,coordinates_outside_state_reference:dataset.records.length-admitted.size,held:admitted.size-allowed.length,withdrawn:withdrawn.length};
    await tx`update app_private.resource_import_runs set completed_at=now(),summary=${tx.json(summary)} where id=${run}`;
    return summary;
  });
}
