// Manual inventory only. Keep the privileged staging connection off scheduled workers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import postgres from 'postgres';
import {developmentTarget} from '../../backend/db-target.mjs';
import {databaseTls} from '../../backend/database-security.ts';
import {policies} from './pa-review.mjs';
assert(process.argv.length===2&&!process.env.VERCEL&&process.env.NODE_ENV!=='production');
const file='.env.eden08-owner.local',ref='hrmocmvdmshoghclxyjs',stat=fs.lstatSync(file);
assert(stat.isFile()&&!(stat.mode&0o077));
const env=parseEnv(fs.readFileSync(file,'utf8')),u=new URL(env.MIGRATION_DATABASE_URL);
assert(developmentTarget(u.href,env).ref===ref && u.username==='postgres.'+ref&&u.hostname==='aws-0-us-east-1.pooler.supabase.com'&&u.port==='5432'&&u.pathname==='/postgres'&&!u.search&&!u.hash);
const ssl=databaseTls(env,u.href);assert(ssl.ca&&ssl.rejectUnauthorized);
const db=postgres(u.href,{ssl,max:1,prepare:false,connect_timeout:8,onnotice:()=>{}});
try{
 const inventory=await db.begin('isolation level repeatable read read only',async tx=>{
  await tx`set local statement_timeout='15s'`;const [guard]=await tx`select current_user as role,current_database() as db,current_setting('transaction_read_only') as ro`;assert(guard.role==='postgres'&&guard.db==='postgres'&&guard.ro==='on');
  const rows=await tx`select r.source_id,r.source_record_id as id,r.snapshot_hash as hash,r.record_status as status,r.imported_at as "importedAt",r.last_seen_at as "lastSeen",r.source_updated_at as "sourceDate",
   (r.needs_review or s.version<>r.service_version or l.version<>r.location_version or o.version<>r.organization_version or s.updated_by is not null or s.status<>'published' or l.status<>'published' or o.status<>'published'
    or exists(select 1 from app_private.correction_reports c where c.service_id=s.id and c.status<>'resolved')
    or exists(select 1 from app_private.organization_claims c where c.service_id=s.id and c.status='pending')
    or exists(select 1 from app_private.organization_revisions v where v.service_id=s.id and v.status='pending')
    or exists(select 1 from app_private.organization_memberships m where m.organization_id=o.id)
    or exists(select 1 from app_private.organization_listing_access a where a.service_id=s.id)) as protected
   from app_private.resource_source_records r join app_private.services s on s.id=r.service_id join app_private.service_locations l on l.id=s.location_id join app_private.organizations o on o.id=r.organization_id
   where r.source_id in ('philly-food-sites','hrsa-health-centers') order by r.source_id,r.source_record_id`;
  const holds=await tx`select source_id,source_record_id as id from app_private.resource_privacy_holds where released_at is null and source_id in ('philly-food-sites','hrsa-health-centers')`;
  const references=await tx`select distinct 'Philadelphia'::text as city,g.state,g.id as reference_id,g.latitude,g.longitude from app_private.geographic_reference_names n join app_private.geographic_reference_records g on g.id=n.record_id join app_private.geographic_reference_imports i on i.id=g.import_id where n.normalized_name='philadelphia' and n.state='PA' and n.kind='place' and g.state='PA' and g.active and g.source_id='census-gazetteer-2026' and i.completed_at is not null`;
  assert(references.length===1);return {capturedAt:new Date().toISOString(),ref,references,sources:Object.fromEntries(Object.keys(policies).map(k=>[k,{rows:rows.filter(r=>r.source_id===k),holds:holds.filter(r=>r.source_id===k).map(r=>r.id)}]))};
 });
 fs.mkdirSync('tmp/pa-maintenance',{mode:0o700,recursive:true});const path='tmp/pa-maintenance/inventory-'+Date.now()+'.json';
 fs.writeFileSync(path,JSON.stringify(inventory),{flag:'wx',mode:0o600});console.log(path);
}catch(e){console.error('Staging inventory stopped:',e.code??e.name);process.exitCode=1;}finally{await db.end();}
