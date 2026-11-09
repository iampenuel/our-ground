import {createHash,randomUUID} from 'node:crypto';

export const FOOD_SOURCES=Object.freeze({
 'philly-food-sites':Object.freeze({id:'philly-food-sites',name:'City of Philadelphia — Free Food and Meal Sites',url:'https://opendataphilly.org/datasets/free-food-and-meal-sites/',authority:'https://metadata.phila.gov/#help/help-faqs/what-are-the-terms-of-use/',license:'City of Philadelphia License',attribution:'City of Philadelphia, Office of Children and Families',metadata:'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/free_meal_sites/FeatureServer/0?f=json',download:'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/free_meal_sites/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=1000&orderByFields=objectid',state:'PA'}),
 'seattle-food-resources':Object.freeze({id:'seattle-food-resources',name:'City of Seattle Human Services Department — Emergency Food and Meals Seattle and King County',url:'https://data.seattle.gov/Community/Emergency-Food-and-Meals-Seattle-and-King-County/kkzf-ntnu',authority:'https://data.seattle.gov/api/views/kkzf-ntnu.json',license:'Public Domain',attribution:'City of Seattle Human Services Department',download:'https://data.seattle.gov/api/views/kkzf-ntnu/rows.json?accessType=DOWNLOAD',state:'WA'}),
 'pgc-food-assistance':Object.freeze({id:'pgc-food-assistance',name:'Prince George’s County, Maryland — Office of Food Security Food Assistance Directory',url:'https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv',authority:'https://data.princegeorgescountymd.gov/terms-of-use',license:'OpenPGC Terms of Use',attribution:'Prince George’s County, Community Services Division, Office of Food Security',download:'https://data.princegeorgescountymd.gov/api/views/d7ae-zbbv/rows.json?accessType=DOWNLOAD',state:'MD'})
});
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function foodUuid(source,kind,id){const chars=hash('our-ground:reviewed-food:v1:'+source+':'+kind+':'+id).slice(0,32).split('');chars[12]='5';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);const s=chars.join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);}
const clean=(value,max=2000)=>typeof value==='string'?value.normalize('NFC').trim().replace(/\u0000/g,'').slice(0,max):'';
const blank=value=>!value||/^(unknown|n\/a|none|not available)$/i.test(value);
export function foodWebsite(value){if(!value)return null;try{const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.')||u.hostname==='localhost'||/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname)||u.hostname.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.href.length>2048||/[<>\s]/.test(u.href))return null;return u.href;}catch{return null;}}
export function foodPhone(value){const s=clean(value,80);return /^\+?[0-9() .-]{7,40}$/.test(s)&&s.replace(/\D/g,'').length>=10?s:null;}
const iso=value=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Food source date is invalid.');return date.toISOString();};
const sourceDate=value=>{const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(value));if(!m)return null;const year=+m[3],month=+m[1],day=+m[2],date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString():null;};
const secretLocation=/domestic violence|confidential|undisclosed|address withheld|\bshelter\b|safe haven/i;
const point=(lat,lng,state)=>Number.isFinite(lat)&&Number.isFinite(lng)&&(state==='PA'?lat>=39.5&&lat<=42.6&&lng>=-80.6&&lng<=-74.5:state==='WA'?lat>=45.5&&lat<=49.1&&lng>=-125&&lng<=-116.8:state==='MD'?lat>=37.8&&lat<=39.8&&lng>=-79.6&&lng<=-75:false);
function hoursFromPhilly(row){const days=['sun','mon','tues','wed','thurs','fri','sat'],hours=[];for(const[weekday,day]of days.entries())for(const sequence of[1,2]){const open=clean(row['hours_'+day+'_start'+sequence]),close=clean(row['hours_'+day+'_end'+sequence]);if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(open)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(close)||open>=close)continue;hours.push({weekday,opens_at:open,closes_at:close,notes:clean(row['hours_'+day+'_exceptions'],500)||null,sequence});}return hours;}
function philly(bundle){
 const metadata=bundle.metadata,data=bundle.data;
 if(!metadata?.editingInfo?.dataLastEditDate||!Array.isArray(data?.features)||data.exceededTransferLimit)throw Error('Incomplete Philadelphia source snapshot or missing date.');
 if(!metadata.fields?.some(f=>f.name==='objectid')||!metadata.fields.some(f=>f.name==='category_type'))throw Error('Philadelphia source schema changed.');
 return {updated:iso(metadata.editingInfo.dataLastEditDate),rows:data.features.map(f=>{
  const r=f.attributes??{},record_id=String(r.objectid??''),category=r.category_type,food=['Food Site','General Meal Site','Senior Meal Site'].includes(category);
  const eligibility=category==='Senior Meal Site'?'Source classifies this as a senior meal site; contact the location for age and other eligibility requirements.':null;
  return {record_id,source_updated_at:iso(metadata.editingInfo.dataLastEditDate),name:clean(r.site_name,161),organization_name:clean(r.site_name,161),street:clean(r.address,301),city:'Philadelphia',state:'PA',postal_code:clean(r.zip_code),latitude:Number(f.geometry?.y),longitude:Number(f.geometry?.x),phone:foodPhone(r.phone_number),website:foodWebsite(r.website),kind:category==='Food Site'?'Food pickup':category==='Senior Meal Site'?'Senior meals':'Community meals',eligibility_text:eligibility,hours:hoursFromPhilly(r),description:null,reason:!food?'not_food_assistance':r.status!=='Active'||r.temporary_closure||/yes/i.test(r.seasonally_closed??'')?'inactive':null,identityValid:/^\d{1,9}$/.test(record_id)};
 })};
}
function seattle(bundle){
 const data=bundle.meta?.view?bundle:bundle.data,view=data?.meta?.view;
 if(view?.id!=='kkzf-ntnu'||view.licenseId!=='PUBLIC_DOMAIN'||!Array.isArray(view.columns)||!Array.isArray(data.data)||!view.rowsUpdatedAt)throw Error('Seattle source schema/license evidence changed.');
 const fields=view.columns.map(x=>x.fieldName);
 for(const name of [':id','food_resource_type','location','operational_status','address','latitude','longitude'])if(!fields.includes(name))throw Error('Seattle source required column missing.');
 return {updated:iso(view.rowsUpdatedAt*1000),rows:data.data.map(values=>{
  const r=Object.fromEntries(fields.map((name,i)=>[name,values[i]])),address=clean(r.address,600),parts=/^(.+),\s*([^,]+),\s*WA\s+(\d{5}(?:-\d{4})?)$/.exec(address);
  const schedule=clean(r.days_hours,1000),kind=clean(r.food_resource_type),eligible=clean(r.who_they_serve,1000),record_id=String(r[':id']??''),website=Array.isArray(r.website)?r.website[0]:r.website;
  return {record_id,source_updated_at:sourceDate(r.date_updated)??iso(view.rowsUpdatedAt*1000),name:clean(r.location||r.agency,161),organization_name:clean(r.agency||r.location,161),street:parts?.[1]??'',city:parts?.[2]??'',state:'WA',postal_code:parts?.[3]??'',latitude:Number(r.latitude),longitude:Number(r.longitude),phone:foodPhone(r.phone_number),website:foodWebsite(website),kind:kind==='Meal'?'Community meals':kind==='Food Bank & Meal'?'Food bank and meals':'Food bank',eligibility_text:blank(eligible)?null:eligible,hours:[],description:blank(schedule)?null:'Source-listed schedule: '+schedule+'. Confirm current times before visiting.',reason:!['Food Bank','Food Bank & Meal','Meal'].includes(kind)?'not_food_assistance':r.operational_status!=='Open'?'inactive':null,identityValid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record_id)};
 })};
}
function pgc(bundle){
 const data=bundle.meta?.view?bundle:bundle.data,view=data?.meta?.view;
 if(view?.id!=='d7ae-zbbv'||!Array.isArray(view.columns)||!Array.isArray(data.data)||!view.rowsUpdatedAt)throw Error('Prince George County source schema changed.');
 const fields=view.columns.map(x=>x.fieldName);for(const name of[':id','type','operator','address','city','state','zip_code','geo_location','days','hours_of_operation'])if(!fields.includes(name))throw Error('Prince George County required column missing.');
 const groups=new Map(),seen=new Set();
 for(const values of data.data){const r=Object.fromEntries(fields.map((name,i)=>[name,values[i]])),id=String(r[':id']??'');if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||seen.has(id))throw Error('Prince George County source row identity invalid or duplicated.');seen.add(id);
  const key=JSON.stringify(['operator','location_host_if_different','address','city','state','zip_code','type'].map(k=>clean(r[k]).toLowerCase()));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 const unique=(rows,key)=>[...new Set(rows.map(r=>clean(r[key],2000)).filter(v=>!blank(v)))].sort();
 return {updated:iso(view.rowsUpdatedAt*1000),input_rows:data.data.length,rows:[...groups.entries()].map(([identity,rows])=>{
  rows.sort((a,b)=>String(a[':id']).localeCompare(String(b[':id'])));const r=rows[0],kind=clean(r.type),operator=clean(r.operator,161),host=clean(r.location_host_if_different,160),point=/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(clean(r.geo_location));
  const schedule=[...new Set(rows.map(x=>[clean(x.days,300),clean(x.hours_of_operation,300)].filter(Boolean).join(': ')).filter(Boolean))].sort(),notes=unique(rows,'notes'),eligibility=unique(rows,'eligibility'),registration=unique(rows,'advance_registration_required'),limits=unique(rows,'vist_limitations'),format=unique(rows,'food_format'),interaction=unique(rows,'customer_interaction_model');
  const sourcePoints=rows.map(x=>{const m=/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(clean(x.geo_location));return m?{latitude:Number(m[2]),longitude:Number(m[1])}:null;});
  const coordinateConflict=sourcePoints.some(p=>!p)||sourcePoints.some((a,i)=>a&&sourcePoints.slice(i+1).some(b=>b&&distanceMiles(a,b)>1));
  const body=[schedule.length?'Source-listed schedule: '+schedule.join('; ')+'. Confirm current times before visiting.':null,format.length?'Source-listed food format: '+format.join('; ')+'.':null,interaction.length?'Source-listed access: '+interaction.join('; ')+'.':null,registration.some(x=>/^yes$/i.test(x))?'Source says advance registration is required.':null,limits.length?'Source-listed visit limits: '+limits.join('; ')+'.':null,...notes].filter(Boolean).join(' ');
  return {record_id:'PGC-'+hash(identity).slice(0,32),source_record_ids:rows.map(x=>x[':id']).sort(),source_schedule:schedule,source_updated_at:iso(view.rowsUpdatedAt*1000),name:host&&host.toLowerCase()!==operator.toLowerCase()?operator+' — '+host:operator,organization_name:operator,street:clean(r.address,301),city:clean(r.city,101),state:clean(r.state),postal_code:clean(r.zip_code),latitude:point?Number(point[2]):NaN,longitude:point?Number(point[1]):NaN,phone:null,website:foodWebsite(Array.isArray(r.link)?r.link[0]:r.link),kind:({'Food Pantry':'Food pantry','Food Distribution':'Food distribution','Meal Site':'Community meals','Produce Distribution':'Produce distribution','Senior Brown Bag':'Senior food distribution'})[kind]??kind,eligibility_text:eligibility.length?eligibility.join('; '):null,hours:[],description:body,privacy_evidence:[host,...notes].join(' '),reason:['Food Bank','Food Hub'].includes(kind)?'regional_hub_not_walkin':!['Food Pantry','Food Distribution','Meal Site','Produce Distribution','Senior Brown Bag'].includes(kind)?'not_food_assistance':coordinateConflict?'source_coordinate_evidence_conflict':null,identityValid:true};
 })};
}
export function normalizeFoodSnapshot(sourceId,input){
 const source=FOOD_SOURCES[sourceId];if(!source)throw Error('Unknown or unreviewed food source.');
 const text=typeof input==='string'?input:JSON.stringify(input);if(Buffer.byteLength(text)>16*1024*1024)throw Error('Food input exceeds the bounded snapshot limit.');
 const parsed=typeof input==='string'?JSON.parse(input):input,dataset=sourceId==='philly-food-sites'?philly(parsed):sourceId==='seattle-food-resources'?seattle(parsed):pgc(parsed);
 if(!dataset.rows.length||dataset.rows.length>5000)throw Error('Food snapshot row count is empty or exceeds limit.');
 const seen=new Set(),identities=new Map(),records=[],duplicateCoordinateEvidence=[],excluded=[],reasons={},states={};
 for(const raw of dataset.rows){
  const id=raw.record_id;if(!raw.identityValid||seen.has(id))throw Error('Food source identifiers missing, invalid or duplicated.');seen.add(id);
  let reason=raw.reason;
  if(secretLocation.test([raw.name,raw.organization_name,raw.street,raw.eligibility_text,raw.privacy_evidence].join(' ')))reason='privacy_withdrawal';
  else if(!reason&&(!raw.street||!raw.city||!/^\d{5}(?:-\d{4})?$/.test(raw.postal_code)))reason='missing_public_address';
  else if(!reason&&!point(raw.latitude,raw.longitude,raw.state))reason='invalid_coordinates';
  else if(!reason&&(raw.name.length<2||raw.name.length>160||raw.organization_name.length<2||raw.organization_name.length>160||raw.street.length>300||raw.city.length>100))reason='invalid_identity_or_fields';
  if(reason){excluded.push({record_id:id,reason,...(raw.source_record_ids?{source_record_ids:raw.source_record_ids}:{})});reasons[reason]=(reasons[reason]??0)+1;continue;}
  const identity=[raw.name.toLowerCase().replace(/\W/g,''),raw.street.toLowerCase().replace(/\W/g,''),raw.city.toLowerCase(),raw.state,raw.kind].join('|');
  const duplicate=identities.has(identity),duplicateOf=identities.get(identity);if(!duplicate)identities.set(identity,id);
  const summary=raw.kind+'. '+(sourceId==='philly-food-sites'?'Listed by the City of Philadelphia.':sourceId==='seattle-food-resources'?'Listed by Seattle Human Services.':'Listed by Prince George’s County Office of Food Security.');
  const description=[raw.kind==='Food bank'?'Source lists a food bank. Confirm whether this location provides direct public pickup or a referral to another site.':raw.kind+'.',raw.description].filter(Boolean).join(' ');
  const snapshot={record_id:id,name:raw.name,organization_name:raw.organization_name,street:raw.street,city:raw.city,state:raw.state,postal_code:raw.postal_code,latitude:raw.latitude,longitude:raw.longitude,phone:raw.phone,website:raw.website,kind:raw.kind,eligibility_text:raw.eligibility_text,hours:raw.hours,description:raw.description,...(raw.source_record_ids?{source_record_ids:raw.source_record_ids,source_schedule:raw.source_schedule}:{})};
  const record={...snapshot,source_updated_at:raw.source_updated_at,organization_id:foodUuid(sourceId,'organization',id),location_id:foodUuid(sourceId,'location',id),service_id:foodUuid(sourceId,'service',id),hash:hash(JSON.stringify(snapshot)),snapshot,summary,description,cost_summary:sourceId==='pgc-food-assistance'?null:'Listed by the source as a free food resource.'};
  if(duplicate){duplicateCoordinateEvidence.push(record);excluded.push({record_id:id,reason:'duplicate_identity',...(raw.source_record_ids?{source_record_ids:raw.source_record_ids,duplicate_of:duplicateOf}:{})});reasons.duplicate_identity=(reasons.duplicate_identity??0)+1;continue;}records.push(record);
  states[raw.state]=(states[raw.state]??0)+1;
 }
 return {source,checksum:hash(text),source_updated_at:dataset.updated,records,duplicate_coordinate_evidence:duplicateCoordinateEvidence,excluded,summary:{source_rows:dataset.input_rows??dataset.rows.length,...(dataset.input_rows?{program_groups:dataset.rows.length,schedule_rows_coalesced:dataset.input_rows-dataset.rows.length}:{}),accepted:records.length,excluded:excluded.length,exclusion_reasons:reasons,states,category:'food'}};
}
export async function downloadFoodSnapshot(sourceId,{fetcher=fetch,signal}={}){
 const source=FOOD_SOURCES[sourceId];if(!source)throw Error('Unknown food source.');
 const read=async url=>{const r=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});if(!r.ok)throw Error('Official food-source request failed.');const reader=r.body?.getReader();if(!reader)throw Error('Empty food source response.');const chunks=[];let bytes=0;try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>8*1024*1024)throw Error('Food source response exceeds bound.');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
 if(sourceId==='seattle-food-resources'||sourceId==='pgc-food-assistance')return {source_id:sourceId,data:await read(source.download)};
 const metadata=await read(source.metadata),all=[];let page;
 for(let offset=0;offset<5000;offset+=1000){const u=new URL(source.download);u.searchParams.set('resultOffset',String(offset));page=await read(u.href);if(!Array.isArray(page.features)||page.error)throw Error('Food source response schema changed.');all.push(...page.features);if(!page.exceededTransferLimit)break;}
 if(page.exceededTransferLimit||all.length>5000)throw Error('Food source exceeded bounded pagination.');
 return{source_id:sourceId,metadata,data:{features:all,exceededTransferLimit:false}};
}
/** Conservative anomaly checks for the two reviewed regional feeds. Census
 * representative points never establish a street match and never replace a
 * source coordinate. Ambiguous/unmatched city names remain unverified. */
export const FOOD_COORDINATE_POLICY='regional-food-coordinate-anomalies-v2';
const distanceMiles=(a,b)=>{const radians=x=>x*Math.PI/180,dlat=radians(b.latitude-a.latitude),dlng=radians(b.longitude-a.longitude),v=Math.sin(dlat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dlng/2)**2;return 3958.7613*2*Math.asin(Math.min(1,Math.sqrt(v)));};
export function foodAddressKey(street,postal){
 let text=clean(street,600).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // An explicit parenthesized intersection is an address, not the POI label.
 const intersection=/^[^0-9()]+\(([^()]*(?:\band\b|&)[^()]*)\)\s*$/.exec(text);if(intersection)text=intersection[1];
 text=text.replace(/\bjohn\s+f\.?\s+kennedy\b/g,'jfk').replace(/[^a-z0-9&]+/g,' ').replace(/\b(street|avenue|road|boulevard|drive|lane|parkway|northwest|northeast|southwest|southeast|north|south|east|west)\b/g,x=>({street:'st',avenue:'ave',road:'rd',boulevard:'blvd',drive:'dr',lane:'ln',parkway:'pkwy',northwest:'nw',northeast:'ne',southwest:'sw',southeast:'se',north:'n',south:'s',east:'e',west:'w'}[x]));
 const parts=text.split(/\band\b|&/).map(p=>p.trim().replace(/\s+/g,' ')).filter(Boolean);return parts.sort().join(' & ')+'|'+String(postal).slice(0,5);
}
export function validateFoodCoordinates(dataset,references){
 if(!FOOD_SOURCES[dataset.source?.id]||!Array.isArray(references)||references.length>10000)throw Error('Reviewed food source and bounded geographic evidence required.');
 const publicationCandidates=dataset.coordinate_candidates??dataset.records,candidates=[...publicationCandidates,...(dataset.duplicate_coordinate_evidence??[])],rawChecksum=dataset.coordinate_validation?.raw_checksum??dataset.checksum,referenceRows=[];
 for(const r of references){if(!r||typeof r.city!=='string'||r.state!==dataset.source.state||typeof r.reference_id!=='string'||!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)||Math.abs(r.latitude)>90||Math.abs(r.longitude)>180)throw Error('Invalid geographic reference evidence.');referenceRows.push({city:r.city,state:r.state,reference_id:r.reference_id,latitude:r.latitude,longitude:r.longitude});}
 referenceRows.sort((a,b)=>(a.city+'|'+a.reference_id).localeCompare(b.city+'|'+b.reference_id));
 const referenceFingerprint=hash(JSON.stringify(referenceRows)),reasons=new Map(),points=new Map(),addresses=new Map(),unknown=[],ambiguous=[];
 const mark=(row,reason)=>{if(!reasons.has(row.record_id))reasons.set(row.record_id,new Set());reasons.get(row.record_id).add(reason);};
 for(const row of candidates){
  if(dataset.source.id==='philly-food-sites'&&!/^191\d{2}(?:-\d{4})?$/.test(row.postal_code))mark(row,'unresolved_city_scope');
  const key=row.latitude+','+row.longitude,addressKey=foodAddressKey(row.street,row.postal_code);if(!points.has(key))points.set(key,[]);points.get(key).push(row);if(!addresses.has(addressKey))addresses.set(addressKey,[]);addresses.get(addressKey).push(row);
  const cities=referenceRows.filter(r=>r.city===row.city&&r.state===row.state),unique=[...new Map(cities.map(r=>[r.reference_id,r])).values()];
  if(!unique.length)unknown.push(row.record_id);else if(unique.length!==1)ambiguous.push(row.record_id);else if(distanceMiles(row,unique[0])>20)mark(row,'city_representative_distance_over_20_miles');
 }
 for(const group of points.values())if(new Set(group.map(r=>foodAddressKey(r.street,r.postal_code))).size>1)for(const row of group)mark(row,'same_point_conflicting_addresses');
 for(const group of addresses.values())if(group.some((a,i)=>group.slice(i+1).some(b=>distanceMiles(a,b)>1)))for(const row of group)mark(row,'same_address_points_over_1_mile_apart');
 const records=publicationCandidates.filter(r=>!reasons.has(r.record_id)),excluded=dataset.excluded.filter(r=>!['coordinate_conflict','unresolved_city_scope'].includes(r.reason)&&!reasons.has(r.record_id));
 for(const row of candidates)if(reasons.has(row.record_id))excluded.push({record_id:row.record_id,reason:reasons.get(row.record_id).has('unresolved_city_scope')?'unresolved_city_scope':'coordinate_conflict',...(row.snapshot?.source_record_ids?{source_record_ids:row.snapshot.source_record_ids}:{})});
 const counts={},states={},qualityReasons={};for(const row of excluded)counts[row.reason]=(counts[row.reason]??0)+1;for(const row of records)states[row.state]=(states[row.state]??0)+1;for(const list of reasons.values())for(const reason of list)qualityReasons[reason]=(qualityReasons[reason]??0)+1;
 const quality={policy:FOOD_COORDINATE_POLICY,city_anomaly_threshold_miles:20,address_point_spread_threshold_miles:1,reference_source:'census-gazetteer-2026',reference_fingerprint:referenceFingerprint,checked_records:candidates.length,quarantined_records:reasons.size,quarantine_reasons:qualityReasons,unmatched_city_records:unknown.length,ambiguous_city_records:ambiguous.length,unmatched_record_ids:unknown,quarantined:[...reasons.entries()].map(([record_id,list])=>({record_id,reasons:[...list].sort()})).sort((a,b)=>a.record_id.localeCompare(b.record_id))};
 return {...dataset,records,excluded,coordinate_candidates:publicationCandidates,coordinate_validation:{raw_checksum:rawChecksum,...quality},checksum:hash(FOOD_COORDINATE_POLICY+'\n'+rawChecksum+'\n'+referenceFingerprint),summary:{...dataset.summary,accepted:records.length,excluded:excluded.length,exclusion_reasons:counts,states,coordinate_quality:quality}};
}
export async function validateFoodGeography(sql,dataset){
 const candidates=[...(dataset.coordinate_candidates??dataset.records),...(dataset.duplicate_coordinate_evidence??[])];if(!candidates.length)return validateFoodCoordinates(dataset,[]);
 const[ready]=await sql.unsafe("select exists(select 1 from app_private.geographic_reference_records g join app_private.geographic_reference_imports i on i.id=g.import_id where g.state=$1 and g.kind='place' and g.source_id='census-gazetteer-2026' and g.active and i.completed_at is not null) as ready",[dataset.source.state]);if(!ready?.ready)throw Error('Completed local Census geographic reference is required before food publication.');
 const cities=[...new Set(candidates.map(r=>r.city))].sort();
 const references=await sql.unsafe("select distinct q.city,g.state,g.id as reference_id,g.latitude,g.longitude from unnest($1::text[]) q(city) join app_private.geographic_reference_names n on n.normalized_name=app_private.geographic_reference_normalize(q.city) and n.state=$2 and n.kind='place' join app_private.geographic_reference_records g on g.id=n.record_id and g.active join app_private.geographic_reference_imports i on i.id=g.import_id and i.completed_at is not null order by q.city,g.id",[cities,dataset.source.state]);
 if(!references.length)throw Error('No exact local Census city evidence is available for this food snapshot; publication is blocked.');
 return validateFoodCoordinates(dataset,[...references]);
}
/** Exact original row UUIDs, never a fuzzy organization/address merge. Privacy
 * lineage survives source rekeys and source-snapshot minimization. */
async function reconcileFoodLineage(tx,dataset,runId){
 if(dataset.source.id!=='pgc-food-assistance')return dataset;
 const q=(text,values=[])=>tx.unsafe(text,values),[ready]=await q("select to_regclass('app_private.food_source_row_lineage') is not null as ready");if(!ready?.ready)throw Error('Reviewed migration016 source lineage is required before Maryland publication.');
 const entries=[...dataset.records.map(r=>({record_id:r.record_id,source_record_ids:r.snapshot.source_record_ids,accepted:true})),...dataset.excluded.map(r=>({...r,record_id:r.duplicate_of??r.record_id,accepted:false}))];
 const allIds=[...new Set(entries.flatMap(r=>r.source_record_ids??[]).map(id=>String(id).toLowerCase()))];
 if(allIds.length>5000||allIds.some(id=>!/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)))throw Error('Bounded exact upstream UUID lineage is required.');
 const previous=allIds.length?await q("select l.*,h.source_id is not null as held from app_private.food_source_row_lineage l left join app_private.resource_privacy_holds h on h.source_id=l.source_id and h.source_record_id=l.source_record_id and h.released_at is null where l.source_id=$1 and lower(l.source_row_id)=any($2::text[]) for update of l",[dataset.source.id,allIds]):[];
 const byRow=new Map();for(const p of previous){const id=p.source_row_id.toLowerCase();if(!byRow.has(id))byRow.set(id,[]);byRow.get(id).push(p);}
 const overrides=new Map(),privacyAliases=new Set(),reviewAliases=new Set();
 for(const entry of entries){const rowIds=[...new Set((entry.source_record_ids??[]).map(id=>String(id).toLowerCase()))];if(!rowIds.length)throw Error('Maryland publication/exclusion must retain exact original row UUIDs.');
  const past=rowIds.flatMap(id=>byRow.get(id)??[]),privacy=['privacy_withdrawal','missing_public_address'].includes(entry.reason)||past.some(p=>p.privacy_withdrawn||p.held),changed=!privacy&&past.some(p=>p.source_record_id!==entry.record_id||p.needs_review);
  if(privacy){overrides.set(entry.record_id,{record_id:entry.record_id,reason:'privacy_withdrawal',source_record_ids:entry.source_record_ids});privacyAliases.add(entry.record_id);for(const p of past)privacyAliases.add(p.source_record_id);}
  else if(changed){overrides.set(entry.record_id,{record_id:entry.record_id,reason:'source_identity_changed',source_record_ids:entry.source_record_ids});for(const p of past)reviewAliases.add(p.source_record_id);}
  if(entry.accepted||entry.reason==='duplicate_identity'||privacy||past.length){
   for(const rowId of rowIds){if(privacy||changed)await q("update app_private.food_source_row_lineage set privacy_withdrawn=privacy_withdrawn or $3,needs_review=needs_review or $4,last_seen_at=now(),import_run_id=$5 where source_id=$1 and lower(source_row_id)=$2",[dataset.source.id,rowId,privacy,changed,runId]);
    const binding=(byRow.get(rowId)??[]).find(p=>p.source_record_id===entry.record_id);
    if(binding)await q("update app_private.food_source_row_lineage set last_seen_at=now(),import_run_id=$4,privacy_withdrawn=privacy_withdrawn or $5,needs_review=needs_review or $6 where source_id=$1 and source_row_id=$2 and source_record_id=$3",[dataset.source.id,binding.source_row_id,entry.record_id,runId,privacy,changed]);
    else{await q("insert into app_private.food_source_row_lineage(source_id,source_row_id,source_record_id,import_run_id,privacy_withdrawn,needs_review) values($1,$2,$3,$4,$5,$6)",[dataset.source.id,rowId,entry.record_id,runId,privacy,changed]);if(!byRow.has(rowId))byRow.set(rowId,[]);byRow.get(rowId).push({source_row_id:rowId,source_record_id:entry.record_id,privacy_withdrawn:privacy,needs_review:changed});}
   }
  }
 }
 for(const record of dataset.records){if(privacyAliases.has(record.record_id))overrides.set(record.record_id,{record_id:record.record_id,reason:'privacy_withdrawal',source_record_ids:record.snapshot.source_record_ids});else if(reviewAliases.has(record.record_id))overrides.set(record.record_id,{record_id:record.record_id,reason:'source_identity_changed',source_record_ids:record.snapshot.source_record_ids});}
 if(privacyAliases.size)await q("update app_private.food_source_row_lineage set privacy_withdrawn=true,last_seen_at=now(),import_run_id=$3 where source_id=$1 and source_record_id=any($2::text[])",[dataset.source.id,[...privacyAliases],runId]);
 if(reviewAliases.size)await q("update app_private.food_source_row_lineage set needs_review=true,last_seen_at=now(),import_run_id=$3 where source_id=$1 and source_record_id=any($2::text[])",[dataset.source.id,[...reviewAliases],runId]);
 const records=dataset.records.filter(r=>!overrides.has(r.record_id)),excluded=dataset.excluded.filter(r=>!overrides.has(r.record_id));excluded.push(...overrides.values());const reasons={},states={};for(const r of excluded)reasons[r.reason]=(reasons[r.reason]??0)+1;for(const r of records)states[r.state]=(states[r.state]??0)+1;
 return {...dataset,records,excluded,lineage_privacy_record_ids:[...privacyAliases],lineage_quarantine_record_ids:[...reviewAliases],summary:{...dataset.summary,accepted:records.length,excluded:excluded.length,exclusion_reasons:reasons,states,lineage_review_groups:[...overrides.values()].filter(r=>r.reason==='source_identity_changed').length,lineage_privacy_groups:[...overrides.values()].filter(r=>r.reason==='privacy_withdrawal').length}};
}
export async function importFood(sql,dataset,{apply=false,fullSnapshot=false}={}){
 if(!apply)return {...dataset.summary,dry_run:true,checksum:dataset.checksum,source_updated_at:dataset.source_updated_at,geographic_validation:dataset.coordinate_validation?'completed_local_anomaly_checks':'not_run; use --validate-geography before publication'};
 const source=FOOD_SOURCES[dataset.source?.id];if(!source)throw Error('Unreviewed food source cannot be imported.');
 return sql.begin(async tx=>{
  const q=(text,values=[])=>tx.unsafe(text,values);
  await q("select pg_advisory_xact_lock(hashtext('our-ground-food-import'))");
  const [registered]=await q('select enabled from app_private.resource_data_sources where id=$1',[source.id]);if(!registered?.enabled)throw Error('Reviewed food source is not enabled.');
  dataset=await validateFoodGeography(tx,dataset);
  const processExclusions=async runId=>{
   let withdrawn=0,quarantined=0;const privateIds=[...new Map([...dataset.excluded.filter(x=>['privacy_withdrawal','missing_public_address'].includes(x.reason)).map(x=>({record_id:x.record_id,reason:x.reason})),...(dataset.lineage_privacy_record_ids??[]).map(record_id=>({record_id,reason:'privacy_withdrawal'}))].map(r=>[r.record_id,r])).values()];
   if(privateIds.length){const[r]=await q('select app_private.food_privacy_withdraw($1::uuid,$2::jsonb) as count',[runId,privateIds]);withdrawn=Number(r.count);}
   for(const row of [...dataset.excluded.filter(x=>!['privacy_withdrawal','missing_public_address'].includes(x.reason)),...(dataset.lineage_quarantine_record_ids??[]).map(record_id=>({record_id,reason:'source_identity_changed'}))]){const quality=['coordinate_conflict','unresolved_city_scope','source_coordinate_evidence_conflict','source_identity_changed'].includes(row.reason);
    let sourceBound=true;
    if(quality){
     const[current]=await q("select r.snapshot,l.street_address,l.city,l.state,l.postal_code,extensions.ST_Y(l.point::extensions.geometry)::float8 as latitude,extensions.ST_X(l.point::extensions.geometry)::float8 as longitude from app_private.resource_source_records r join app_private.services s on s.id=r.service_id join app_private.service_locations l on l.id=s.location_id where r.source_id=$1 and r.source_record_id=$2 for update of r,l",[source.id,row.record_id]);
     if(current){const previous=current.snapshot;sourceBound=typeof previous?.street==='string'&&typeof previous?.city==='string'&&Number.isFinite(previous.latitude)&&Number.isFinite(previous.longitude)&&foodAddressKey(current.street_address??'',current.postal_code??'')===foodAddressKey(previous.street,previous.postal_code??'')&&current.city.trim().toLowerCase()===previous.city.trim().toLowerCase()&&current.state===previous.state&&Math.abs(current.latitude-previous.latitude)<=0.000001&&Math.abs(current.longitude-previous.longitude)<=0.000001;}
    }
    await q("update app_private.resource_source_records set record_status=case when $4 and not $5 then 'stale_or_needs_review' else 'inactive' end,needs_review=needs_review or $4,last_seen_at=now(),import_run_id=$1 where source_id=$2 and source_record_id=$3",[runId,source.id,row.record_id,quality,sourceBound]);
    if(quality&&sourceBound){const hidden=await q("update app_private.service_locations l set status='hidden' where l.status<>'hidden' and exists(select 1 from app_private.services s join app_private.resource_source_records r on r.service_id=s.id where s.location_id=l.id and r.source_id=$1 and r.source_record_id=$2) returning l.id",[source.id,row.record_id]);quarantined+=hidden.length;}
   }return{withdrawn,quarantined};
  };
  const [last]=await q('select source_updated_at from app_private.resource_import_runs where source_id=$1 and completed_at is not null order by source_updated_at desc limit 1',[source.id]);if(last&&new Date(last.source_updated_at).getTime()>Date.parse(dataset.source_updated_at))throw Error('Older food snapshot rejected.');
  const [prior]=await q('select id,summary from app_private.resource_import_runs where source_id=$1 and checksum=$2 and completed_at is not null',[source.id,dataset.checksum]);
  if(prior){dataset=await reconcileFoodLineage(tx,dataset,prior.id);const replay=await processExclusions(prior.id);return{...prior.summary,...dataset.summary,already_imported:true,run_id:prior.id,privacy_backfilled:replay.withdrawn,coordinate_quarantines_backfilled:replay.quarantined};}
  const id=randomUUID();await q('insert into app_private.resource_import_runs(id,source_id,checksum,source_updated_at) values($1,$2,$3,$4)',[id,source.id,dataset.checksum,dataset.source_updated_at]);
  dataset=await reconcileFoodLineage(tx,dataset,id);
  const counts={created:0,updated:0,needs_review:0};
  for(let i=0;i<dataset.records.length;i+=250){const [part]=await q('select app_private.food_import_batch($1::uuid,$2::jsonb) as counts',[id,dataset.records.slice(i,i+250)]);for(const key of Object.keys(counts))counts[key]+=Number(part.counts[key]);}
  const exclusionResult=await processExclusions(id);
  let stale=0;if(fullSnapshot){const rows=await q("update app_private.resource_source_records set record_status='stale_or_needs_review',needs_review=true where source_id=$1 and import_run_id<>$2 and record_status='active' returning service_id",[source.id,id]);stale=rows.length;}
  const summary={...dataset.summary,...counts,privacy_withdrawals:exclusionResult.withdrawn,new_coordinate_quarantines:exclusionResult.quarantined,marked_stale:stale,checksum:dataset.checksum,source_updated_at:dataset.source_updated_at,full_snapshot:fullSnapshot};
  await q('update app_private.resource_import_runs set completed_at=now(),summary=$1::jsonb where id=$2',[summary,id]);return{...summary,run_id:id,dry_run:false};
 });
}
/** Owner-supplied bounded OSM JSON only. ODbL partition/publication review remains
 * required; this parser neither queries Overpass nor writes the application DB. */
export function normalizeOsmFoodExtract(input){
 const text=typeof input==='string'?input:JSON.stringify(input);if(Buffer.byteLength(text)>16*1024*1024)throw Error('OSM input exceeds the bounded snapshot limit.');
 const d=typeof input==='string'?JSON.parse(input):input;if(!Array.isArray(d.elements)||d.elements.length>5000)throw Error('Bounded OSM extract required.');
 return d.elements.flatMap(e=>{const t=e.tags??{},kind=t.amenity==='food_sharing'?'food_sharing':t.amenity==='social_facility'&&['food_bank','soup_kitchen'].includes(t.social_facility)?t.social_facility:null;
 if(!kind||['private','no'].includes(t.access)||/yes|closed/i.test(t.disused??'')||t['disused:amenity']||secretLocation.test(JSON.stringify(t)))return[];
 const latitude=e.lat??e.center?.lat,longitude=e.lon??e.center?.lon;if(!['node','way','relation'].includes(e.type)||(!Number.isSafeInteger(e.id)||e.id<=0)||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return[];
 return[{source_id:'openstreetmap-odbl',source_record_id:e.type+'/'+e.id,kind,name:clean(t.name,160)||null,latitude,longitude,source_timestamp:e.timestamp??null,website:foodWebsite(t.website??t['contact:website']),phone:foodPhone(t.phone??t['contact:phone']),access_confirmed:false,publication_status:'unpublished',partition:'osm_odbl',license_url:'https://opendatacommons.org/licenses/odbl/1-0/',attribution:'© OpenStreetMap contributors'}];});
}

