import assert from 'node:assert/strict';
import {sha256} from './hrsa-import.mjs';
const reviewedHash='e85e5d6a3df1d4f0655dae4851383b0e8f68579fb0f3f62ef0f11928b70bbda4';
// A different Census vintage requires review, including changes in geography.
export function normalizePostalReference(text){
  assert(sha256(text)===reviewedHash,'Census source changed. Review the file before importing.');
  const [header,...lines]=text.trim().split(/\r?\n/);
  assert.equal(header.trim(),'GEOID|GEOIDFQ|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG');
  const ids=new Set();
  const records=lines.map(line=>{
    const [zip,id,,,,,lat,lng]=line.trim().split('|');
    assert(/^\d{5}$/.test(zip)&&id==='860Z200US'+zip&&!ids.has(zip));ids.add(zip);
    const latitude=Number(lat),longitude=Number(lng);
    assert(lat&&lng&&Number.isFinite(latitude)&&Math.abs(latitude)<=90&&Number.isFinite(longitude)&&Math.abs(longitude)<=180);
    return {zip,latitude,longitude,vintage:2026};
  });
  return {source:{id:'census-zcta-2026'},checksum:reviewedHash,source_updated_at:null,summary:{source_rows:records.length,accepted:records.length},records};
}
export async function importPostalReference(sql,dataset){
  return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('census-zcta-2026'))`;
    for(let i=0;i<dataset.records.length;i+=500){
      await tx`insert into app_private.postal_reference ${tx(dataset.records.slice(i,i+500),'zip','latitude','longitude','vintage')}
        on conflict(zip) do update set latitude=excluded.latitude, longitude=excluded.longitude,vintage=excluded.vintage
        where (postal_reference.latitude,postal_reference.longitude,postal_reference.vintage) is distinct from (excluded.latitude,excluded.longitude,excluded.vintage)`;
    }
    const [r]=await tx`select count(*)::int n from app_private.postal_reference`;
    assert.equal(r.n,dataset.records.length);
    return {source:dataset.source.id,points:r.n,checksum:dataset.checksum};
  });
}
