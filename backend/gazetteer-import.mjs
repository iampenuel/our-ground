import {createHash,randomUUID} from 'node:crypto';
import {inflateRawSync,crc32} from 'node:zlib';
import {resourceStateCodes} from '../shared/resource-geography.ts';

const placeAliases=new Map([
 ['1571550',{canonical:'Urban Honolulu CDP',name:'Honolulu'}],['1608830',{canonical:'Boise City city',name:'Boise'}],
 ['1836003',{canonical:'Indianapolis city (balance)',name:'Indianapolis'}],
 ['4752006',{canonical:'Nashville-Davidson metropolitan government (balance)',name:'Nashville'}],
]);
export const GAZETTEER={id:'census-gazetteer-2026',vintage:2026,
 source:'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html',
 layout:'https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts.html',
 lsad:'https://www.census.gov/library/reference/code-lists/legal-status-codes.html',
 files:Object.freeze({state:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_state_national.zip',place:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip'})};
const suffixes=Object.freeze({'21':'borough','25':'city','37':'municipality','43':'town','47':'village','53':'city and borough','55':'comunidad','57':'CDP','62':'zona urbana','CG':'consolidated government','CN':'corporation','MG':'metropolitan government','UC':'urban county','UG':'unified government'});
const sha=value=>createHash('sha256').update(value).digest('hex');
export function normalizedGeographicName(value){return value.normalize('NFKD').replace(/\p{M}+/gu,'').toLowerCase().replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
/** Exactly one expected member, bounded compressed/output size, CRC checked. */
export function unpackGazetteerZip(buffer,kind){
 if(!['state','place'].includes(kind)||!Buffer.isBuffer(buffer)||buffer.length>8*1024*1024||buffer.length<22)throw Error('Invalid bounded Gazetteer archive.');
 let eocd=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0||buffer.readUInt16LE(eocd+4)!==0||buffer.readUInt16LE(eocd+6)!==0||buffer.readUInt16LE(eocd+8)!==1||buffer.readUInt16LE(eocd+10)!==1)throw Error('Gazetteer archive must contain exactly one national file.');
 const center=buffer.readUInt32LE(eocd+16);if(center+46>eocd||buffer.readUInt32LE(center)!==0x02014b50)throw Error('Invalid Gazetteer archive directory.');
 const flags=buffer.readUInt16LE(center+8),method=buffer.readUInt16LE(center+10),crc=buffer.readUInt32LE(center+16),compressed=buffer.readUInt32LE(center+20),size=buffer.readUInt32LE(center+24),nameLength=buffer.readUInt16LE(center+28),offset=buffer.readUInt32LE(center+42);
 const filename=buffer.subarray(center+46,center+46+nameLength).toString('utf8');
 if(filename!==`2026_Gaz_${kind}_national.txt`||(flags&1)||![0,8].includes(method)||size>8*1024*1024||compressed>8*1024*1024||offset+30>center||buffer.readUInt32LE(offset)!==0x04034b50)throw Error('Unexpected or oversized Gazetteer archive member.');
 const dataStart=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
 if(dataStart+compressed>center)throw Error('Gazetteer compressed payload exceeds its directory boundary.');
 const payload=buffer.subarray(dataStart,dataStart+compressed),decoded=method===8?inflateRawSync(payload,{maxOutputLength:8*1024*1024}):payload;
 if(decoded.length!==size||crc32(decoded)!==crc)throw Error('Gazetteer archive checksum or length is invalid.');
 return new TextDecoder('utf8',{fatal:true}).decode(decoded);
}
export function parseGazetteer(kind,text,{archiveChecksum}={}){
 if(!['place','state'].includes(kind)||typeof text!=='string'||Buffer.byteLength(text)>8*1024*1024)throw Error('Unsupported or oversized Gazetteer input.');
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),headers=lines.shift()?.split('|').map(x=>x.trim());
 const required=['USPS','GEOID','GEOIDFQ','NAME','INTPTLAT','INTPTLONG',...(kind==='place'?['ANSICODE','LSAD','FUNCSTAT']:[])];
 if(!headers||new Set(headers).size!==headers.length||required.some(k=>!headers.includes(k))||!lines.length||lines.length>50000)throw Error('Gazetteer schema changed or contains no bounded records.');
 const ids=new Set(),records=[],states={};
 for(const line of lines){
  const values=line.split('|');if(values.length!==headers.length)throw Error('Gazetteer row width changed.');
  const row=Object.fromEntries(headers.map((h,i)=>[h,values[i].normalize('NFC').trim()]));
  const geoid=row.GEOID,state=row.USPS,lat=Number(row.INTPTLAT),lng=Number(row.INTPTLONG);
  if(!(kind==='place'?/^\d{7}$/:/^\d{2}$/).test(geoid)||ids.has(geoid)||!resourceStateCodes.includes(state)||!row.NAME||row.NAME.length>160
   ||row.GEOIDFQ!==`${kind==='place'?'160':'040'}0000US${geoid}`
   ||!/^[-+]?\d+(?:\.\d+)?$/.test(row.INTPTLAT)||!/^[-+]?\d+(?:\.\d+)?$/.test(row.INTPTLONG)
   ||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180
   ||(kind==='place'&&(!/^\d{8}$/.test(row.ANSICODE)||!/^([0-9]{2}|CG|CN|MG|UC|UG)$/.test(row.LSAD)||!['A','S','I','F','N','B'].includes(row.FUNCSTAT))))throw Error('Gazetteer identity, jurisdiction or representative coordinates are invalid.');
  ids.add(geoid);let display=row.NAME;const suffix=suffixes[row.LSAD];
  if(kind==='place'&&suffix&&row.NAME.endsWith(' '+suffix))display=row.NAME.slice(0,-suffix.length-1);
  const names=[{name:row.NAME,kind:'canonical'}];if(display!==row.NAME)names.push({name:display,kind:'lsad_short'});if(kind==='state')names.push({name:state,kind:'state_code'});
  const alias=placeAliases.get(geoid);
  if(kind==='place' && alias?.canonical===row.NAME)names.push({name:alias.name,kind:'common_name'});
  records.push({id:`census:2026:${kind}:${geoid}`,kind,geographic_id:geoid,geoid_fq:row.GEOIDFQ,ansi_code:row.ANSICODE??null,canonical_name:row.NAME,display_name:display,state,lsad:row.LSAD??null,functional_status:row.FUNCSTAT??null,latitude:lat,longitude:lng,names});states[state]=(states[state]??0)+1;
 }
 return {kind,source_id:GAZETTEER.id,vintage:2026,source_url:GAZETTEER.files[kind],checksum:archiveChecksum??sha(text),text_checksum:sha(text),records,summary:{records:records.length,states,names:records.reduce((n,r)=>n+r.names.length,0)}};
}
export function validateGazetteerBundle(datasets,{allowPartial=false}={}){
 if(datasets.length!==2||!datasets.some(d=>d.kind==='state')||!datasets.some(d=>d.kind==='place'))throw Error('Import requires exactly the official state and place datasets.');
 if(datasets.some(d=>d.source_id!==GAZETTEER.id||d.vintage!==2026||d.source_url!==GAZETTEER.files[d.kind]||!/^[a-f0-9]{64}$/.test(d.checksum)))throw Error('Only the explicitly configured authoritative Census source may be imported.');
 const stateData=datasets.find(d=>d.kind==='state'),placeData=datasets.find(d=>d.kind==='place'),stateMap=new Map(stateData.records.map(r=>[r.state,r.geographic_id]));
 if(!allowPartial&&(stateData.records.length!==52||placeData.records.length<30000||new Set(placeData.records.map(r=>r.state)).size!==52))throw Error('Full national Gazetteer coverage is required; a partial import cannot silently replace it.');
 for(const place of placeData.records)if(stateMap.get(place.state)!==place.geographic_id.slice(0,2))throw Error('Gazetteer place/state FIPS evidence conflicts.');
 return datasets;
}
export async function importGazetteer(sql,datasets,{apply=false,allowPartial=false}={}){
 validateGazetteerBundle(datasets,{allowPartial});
 if(!apply)return {dry_run:true,source:GAZETTEER.id,files:datasets.map(d=>({kind:d.kind,checksum:d.checksum,...d.summary}))};
 return sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtext('our-ground-census-gazetteer-import'))`;const summaries=[];
  for(const dataset of datasets){
   const [prior]=await tx`select id,summary from app_private.geographic_reference_imports where source_id=${GAZETTEER.id} and kind=${dataset.kind} and checksum=${dataset.checksum} and completed_at is not null`;
   if(prior){summaries.push({kind:dataset.kind,already_imported:true,import_id:prior.id,...prior.summary});continue;}
   const id=randomUUID();await tx`insert into app_private.geographic_reference_imports(id,source_id,kind,vintage,checksum,source_url) values(${id},${GAZETTEER.id},${dataset.kind},2026,${dataset.checksum},${dataset.source_url})`;
   for(let i=0;i<dataset.records.length;i+=250)await tx`select app_private.geographic_reference_import_batch(${id}::uuid,${tx.json(dataset.records.slice(i,i+250))}::jsonb)`;
   if(!allowPartial)await tx`update app_private.geographic_reference_records set active=false where source_id=${GAZETTEER.id} and kind=${dataset.kind} and import_id<>${id}`;
   await tx`update app_private.geographic_reference_imports set completed_at=now(),summary=${tx.json(dataset.summary)}::jsonb where id=${id}`;
   summaries.push({kind:dataset.kind,already_imported:false,import_id:id,...dataset.summary});
  }
  return {dry_run:false,source:GAZETTEER.id,files:summaries};
 });
}
