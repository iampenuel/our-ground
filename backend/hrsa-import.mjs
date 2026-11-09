import {createHash,randomUUID} from 'node:crypto';
import {resourceStateCodes} from '../shared/resource-geography.ts';

export const HRSA_SOURCE={id:'hrsa-health-centers',name:'HRSA Health Center Program Service Delivery and Look-Alike Sites',
  url:'https://data.hrsa.gov/topics/healthcenters',authority:'https://data.hrsa.gov/data/download',
  download:'https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv'};
export const hrsaRequiredHeaders=['BPHC Assigned Number','Health Center Number','Health Center Name','Site Name','Site Address','Site City','Site State Abbreviation','Site Postal Code','Site Telephone Number','Site Web Address','Site Status Description','Health Center Type Description','Health Center Service Delivery Site Location Setting Description','Health Center Location Type Description','Geocoding Artifact Address Primary X Coordinate','Geocoding Artifact Address Primary Y Coordinate','Data Warehouse Record Create Date'];
export function sha256(value){return createHash('sha256').update(value).digest('hex');}
export function sourceUuid(kind,id){
  const h=sha256('our-ground:hrsa-health-centers:v1:'+kind+':'+id).slice(0,32).split('');
  h[12]='5';h[16]=((parseInt(h[16],16)&3)|8).toString(16);
  const s=h.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

// RFC4180 quoted records, including embedded newlines and the official feed's
// harmless trailing empty column. No external CSV parser or spreadsheet coercion.
export function parseCsv(text){
  if(typeof text!=='string'||text.length>32*1024*1024)throw Error('HRSA input exceeds the bounded CSV limit.');
  text=text.replace(/^\uFEFF/,'');const records=[];let row=[],field='',quoted=false,closed=false;
  const endField=()=>{row.push(field);field='';closed=false;};
  const endRow=()=>{endField();if(row.some(x=>x!==''))records.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field!==''||closed)throw Error('Malformed CSV quoting.');quoted=true;}
    else if(c===',')endField();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
    else {if(closed)throw Error('Unexpected text after CSV quote.');field+=c;}
    if(field.length>16000||records.length>50000)throw Error('HRSA CSV record limit exceeded.');
  }
  if(quoted)throw Error('Unclosed CSV quote.');if(field!==''||row.length)endRow();
  const headers=records.shift();if(!headers)throw Error('HRSA CSV is empty.');
  while(headers.at(-1)==='')headers.pop();
  const named=headers.filter(Boolean);if(new Set(named).size!==named.length||hrsaRequiredHeaders.some(x=>!headers.includes(x)))throw Error('HRSA CSV schema changed: required columns missing or duplicated.');
  return records.map((values)=>{
    while(values.length>headers.length&&values.at(-1)==='')values.pop();
    if(values.length!==headers.length)throw Error('HRSA CSV column count changed.');
    return Object.fromEntries(headers.flatMap((key,i)=>key?[[key,values[i].trim()]]:[]));
  });
}
function date(value){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);if(!m)throw Error('HRSA source date is invalid.');const iso=`${m[3]}-${m[1]}-${m[2]}T00:00:00.000Z`;if(!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString()!==iso)throw Error('HRSA source date is invalid.');return iso;}
function website(value){
  if(!value)return null;try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.')||u.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||/[<>\s]/.test(u.href))return null;
    return u.href.length<=2048?u.href:null;
  }catch{return null;}
}
function phone(value){return /^\+?[0-9() .-]{7,40}$/.test(value)?value:null;}
export function normalizeHrsaCsv(text){
  const rows=parseCsv(text),seen=new Set(),records=[],excluded=[];const reasons={},states={};let sourceDate;
  for(const raw of rows){
    const id=raw['BPHC Assigned Number'];if(!/^BPS-(H80|LAL)-[0-9]{6}$/.test(id)||seen.has(id))throw Error('HRSA source site identifiers are missing, duplicated or changed.');seen.add(id);
    const sourceUpdated=date(raw['Data Warehouse Record Create Date']);sourceDate??=sourceUpdated;if(sourceDate!==sourceUpdated)throw Error('HRSA snapshot has inconsistent source dates.');
    const state=raw['Site State Abbreviation'].toUpperCase();const latText=raw['Geocoding Artifact Address Primary Y Coordinate'],lngText=raw['Geocoding Artifact Address Primary X Coordinate'];
    const lat=Number(latText),lng=Number(lngText);const setting=raw['Health Center Service Delivery Site Location Setting Description'];const locationType=raw['Health Center Location Type Description'];
    let reason=null;
    if(/domestic violence/i.test(setting))reason='suppressed';
    else if(raw['Site Status Description']!=='Active')reason='inactive';
    else if(!resourceStateCodes.includes(state))reason='unsupported_state';
    else if(!['Service Delivery Site','Administrative/Service Delivery Site'].includes(raw['Health Center Type Description']))reason='not_service_delivery';
    else if(!['Permanent','Seasonal'].includes(locationType))reason='mobile_or_nonfixed';
    else if(!raw['Site Address']||!raw['Site City']||!/^\d{5}(-\d{4})?$/.test(raw['Site Postal Code']))reason='suppressed_or_missing_address';
    else if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(latText)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(lngText)||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)reason='invalid_coordinates';
    else if(!raw['Health Center Number']||[raw['Site Name'],raw['Health Center Name']].some(x=>x.length<2||x.length>160)||raw['Site Address'].length>300||raw['Site City'].length>100)reason='invalid_identity_or_fields';
    if(reason){reasons[reason]=(reasons[reason]??0)+1;excluded.push({record_id:id,reason});continue;}
    const snapshot={record_id:id,organization_source_id:raw['Health Center Number'],organization_name:raw['Health Center Name'],name:raw['Site Name'],street:raw['Site Address'],city:raw['Site City'],state,postal_code:raw['Site Postal Code'],latitude:lat,longitude:lng,phone:phone(raw['Site Telephone Number']),website:website(raw['Site Web Address']),location_type:locationType,setting,status:'Active'};
    // Source date is tracked separately: a daily refresh is not a field change or
    // an independent verification. Weekly hours cannot produce opening hours.
    const summary=`HRSA-listed health center${locationType==='Seasonal'?' (seasonal site)':''}. Contact the site to confirm services, hours, costs, eligibility and current availability.`;
    records.push({...snapshot,organization_id:sourceUuid('organization',snapshot.organization_source_id),location_id:sourceUuid('location',id),service_id:sourceUuid('service',id),hash:sha256(JSON.stringify(snapshot)),snapshot,summary,description:summary+' This imported listing has not been independently verified by Our Ground.'});
    states[state]=(states[state]??0)+1;
  }
  if(!rows.length||!sourceDate)throw Error('HRSA snapshot contains no source rows.');
  return {source:HRSA_SOURCE,checksum:sha256(text),source_updated_at:sourceDate,records,excluded,summary:{source_rows:rows.length,accepted:records.length,excluded:excluded.length,exclusion_reasons:reasons,states,category:'healthcare'}};
}

export async function importHrsa(sql,dataset,{apply=false,fullSnapshot=false}={}){
  if(!apply)return {...dataset.summary,dry_run:true,checksum:dataset.checksum,source_updated_at:dataset.source_updated_at};
  return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('our-ground-hrsa-import'))`;
    const [source]=await tx`select enabled from app_private.resource_data_sources where id=${HRSA_SOURCE.id}`;
    if(!source?.enabled)throw Error('HRSA source is not explicitly enabled.');
    const [latest]=await tx`select source_updated_at from app_private.resource_import_runs where source_id=${HRSA_SOURCE.id} and completed_at is not null order by source_updated_at desc limit 1`;
    if(latest&&new Date(latest.source_updated_at).getTime()>Date.parse(dataset.source_updated_at))throw Error('HRSA snapshot is older than the last successful import; review source chronology before retrying.');
    const privacy=dataset.excluded.filter(row=>['suppressed','suppressed_or_missing_address'].includes(row.reason));
    const receiptChecksum=sha256(dataset.checksum+':service-delivery-v2');
    const [prior]=await tx`select id,summary from app_private.resource_import_runs where source_id=${HRSA_SOURCE.id} and checksum=${receiptChecksum} and completed_at is not null`;
    if(prior){
      let privacyWithdrawals=0;
      if(privacy.length){const [withdrawn]=await tx`select app_private.resource_privacy_withdraw(${prior.id}::uuid,${tx.json(privacy)}::jsonb) as count`;privacyWithdrawals=Number(withdrawn.count);}
      return {...prior.summary,privacy_withdrawals:privacyWithdrawals,already_imported:true,run_id:prior.id};
    }
    const id=randomUUID();await tx`insert into app_private.resource_import_runs(id,source_id,checksum,source_updated_at) values(${id},${HRSA_SOURCE.id},${receiptChecksum},${dataset.source_updated_at})`;
    const counts={created:0,updated:0,needs_review:0};
    let privacyWithdrawals=0;
    if(privacy.length){const [withdrawn]=await tx`select app_private.resource_privacy_withdraw(${id}::uuid,${tx.json(privacy)}::jsonb) as count`;privacyWithdrawals=Number(withdrawn.count);}
    for(let i=0;i<dataset.records.length;i+=250){
      const [batch]=await tx`select app_private.resource_import_batch(${id}::uuid,${tx.json(dataset.records.slice(i,i+250))}::jsonb) as counts`;
      for(const key of Object.keys(counts))counts[key]+=Number(batch.counts[key]);
    }
    // Suppressed or nonfixed locations must never be reconstructed from a
    // grantee's address. Existing bindings become unavailable, not deleted.
    if(dataset.excluded.length)await tx`update app_private.resource_source_records sr set record_status=case when x.reason in ('inactive','not_service_delivery') then 'inactive' else 'suppressed' end,last_seen_at=now(),source_updated_at=${dataset.source_updated_at},import_run_id=${id}
      from jsonb_to_recordset(${tx.json(dataset.excluded)}::jsonb) as x(record_id text,reason text) where sr.source_id=${HRSA_SOURCE.id} and sr.source_record_id=x.record_id`;
    let stale=0;
    if(fullSnapshot){const result=await tx`update app_private.resource_source_records set record_status='stale_or_needs_review' where source_id=${HRSA_SOURCE.id} and import_run_id<>${id} and record_status='active' returning service_id`;stale=result.length;}
    const summary={...dataset.summary,...counts,privacy_withdrawals:privacyWithdrawals,marked_stale:stale,checksum:dataset.checksum,source_updated_at:dataset.source_updated_at,full_snapshot:fullSnapshot};
    await tx`update app_private.resource_import_runs set completed_at=now(),summary=${tx.json(summary)}::jsonb where id=${id}`;
    return {...summary,run_id:id,dry_run:false};
  });
}
