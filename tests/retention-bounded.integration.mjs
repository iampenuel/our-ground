import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

const connection=process.env.PRIVACY_BATCH_TEST_DATABASE_URL;
if(!connection)throw Error('Set the explicitly selected new local PRIVACY_BATCH_TEST_DATABASE_URL.');
const url=new URL(connection);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/(?:ourground_7d1[a-z0-9_]*|ourground_7e[a-z0-9_]*)$/.test(url.pathname))throw Error('Bounded retention tests require a new disposable Phase7D.1/7E loopback database; originals are forbidden.');
const db=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}}),rollback=Error('ROLLBACK_BOUNDED_RETENTION_FIXTURES');

test('bounded owner retention preserves private access, policy and immutable audit across actual PostgreSQL batches',async t=>{
 try{await db.begin(async tx=>{
  // Validate new DDL transactionally, without changing the applied journal.
  const [ready]=await tx`select to_regclass('app_private.privacy_retention_holds') is not null as ready`;
  if(!ready.ready)await tx.unsafe(await readFile(new URL('../backend/migrations/013_resolved_retention_holds.sql',import.meta.url),'utf8'));
  const admin=randomUUID(),subject=randomUUID(),inactiveSubject=randomUUID(),org=randomUUID(),loc=randomUUID(),service=randomUUID(),boundClaim=randomUUID(),pending=randomUUID();
  await tx`insert into app_private.app_users(id,role) values(${admin},'admin'),(${subject},'user'),(${inactiveSubject},'user')`;
  await tx`insert into app_private.organizations(id,name,status,is_demo) values(${org},'Synthetic bounded privacy fixture','published',true)`;
  await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo) values(${loc},${org},'Synthetic site','Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,'published',true)`;
  await tx`insert into app_private.services(id,organization_id,location_id,title,status,is_demo) values(${service},${org},${loc},'Synthetic bounded privacy fixture','published',true)`;
  await tx`insert into app_private.organization_memberships(organization_id,user_id,role,granted_by) values(${org},${subject},'editor',${admin})`;
  await tx`insert into app_private.correction_reports(service_id,reason_code,description,status,resolved_at,created_at) select ${service},'other','Synthetic private report','resolved',now()-interval '100 days',now()-interval '200 days' from generate_series(1,125)`;
  for(let i=0;i<3;i++){
   const claim=i===0?boundClaim:randomUUID();
   await tx`insert into app_private.organization_claims(id,user_id,organization_name,location,applicant_role,contact_email,contact_phone,explanation,status,service_id,reviewer_id,review_note,reviewed_at) values(${claim},${i===0?subject:inactiveSubject},'Synthetic approved fixture',${'Site '+i},'Coordinator','fixture@example.invalid','+12155550100','Synthetic private explanation','approved',${service},${admin},'Synthetic reviewed evidence',now()-interval '200 days'),(${randomUUID()},${subject},'Synthetic rejected fixture',${'Rejected site '+i},'Coordinator','fixture@example.invalid',null,'Synthetic private explanation','rejected',null,${admin},'Synthetic rejected evidence',now()-interval '200 days')`;
   await tx`insert into app_private.organization_revisions(service_id,organization_id,user_id,expected_version,expected_organization_version,expected_location_version,patch,before_snapshot,status,reviewer_id,review_note,reviewed_at) values(${service},${org},${subject},1,1,1,'{"summary":"Synthetic private proposal"}','{}','rejected',${admin},'Synthetic evidence',now()-interval '200 days')`;
   await tx`insert into app_private.organization_audit(actor_id,action,created_at) values(${admin},'fixture.old',now()-interval '400 days')`;
  }
  await tx`insert into app_private.organization_listing_access(service_id,user_id,organization_id,claim_id,granted_by) values(${service},${subject},${org},${boundClaim},${admin})`;
  await tx`insert into app_private.organization_claims(id,user_id,organization_name,location,applicant_role,contact_email,created_at) values(${pending},${subject},'Synthetic unresolved claim','Pending old site','Coordinator','pending@example.invalid',now()-interval '400 days')`;
  await tx`insert into app_private.organization_revisions(service_id,organization_id,user_id,expected_version,expected_organization_version,expected_location_version,patch,before_snapshot,created_at) values(${service},${org},${subject},1,1,1,'{"summary":"Unresolved proposal"}','{}',now()-interval '400 days')`;
  const run=async(apply,batch=100,total=500,reviewer=admin)=>(await tx`select app_private.privacy_retention_bounded(${apply},${reviewer}::uuid,${batch},${total}) as summary`)[0].summary;
  await t.test('dry-run is bounded metadata only, with no deletions/redaction/audit append',async()=>{
   const value=await run(false,2,3,null);assert.equal(value.total_planned,3);assert.equal(value.total_affected,0);assert.equal(value.corrections_deleted,2);assert.equal(value.rejected_revisions_deleted,1);assert.equal(value.audit_appended,0);assert(value.has_remaining);
   assert(!JSON.stringify(value).includes('fixture@example.invalid'));assert(!JSON.stringify(value).includes('Synthetic'));
   assert.equal((await tx`select count(*)::int as n from app_private.correction_reports where service_id=${service}`)[0].n,125);
   assert.equal((await tx`select count(*)::int as n from app_private.organization_audit where actor_id=${admin} and action='privacy.retention_applied'`)[0].n,0);
  });
  await t.test('NULL, zero, excessive and non-admin apply options cannot mutate records',async()=>{
   for(const [apply,batch,total]of [[null,1,1],[true,null,1],[true,1,null],[true,0,1],[true,1001,1],[true,1,5001]])await assert.rejects(tx.savepoint(sp=>sp`select app_private.privacy_retention_bounded(${apply},${admin}::uuid,${batch},${total})`),e=>e.message==='OG_VALIDATION_ERROR');
   await assert.rejects(tx.savepoint(sp=>sp`select app_private.privacy_retention_bounded(true,${subject}::uuid,1,1)`),e=>e.message==='OG_ACCESS_DENIED');
   assert.equal((await tx`select count(*)::int as n from app_private.correction_reports where service_id=${service}`)[0].n,125);
  });
  await t.test('runtime and browser roles have no bounded or compatibility maintenance access',async()=>{
   for(const role of ['our_ground_api','anon','authenticated'])for(const name of ['privacy_retention_bounded(true,null,1,1)','privacy_retention(true,null)'])await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp.unsafe('select app_private.'+name);}),e=>e.code==='42501');
  });
  await t.test('one apply respects total cap across categories and appends one metadata audit',async()=>{
   const value=await run(true,2,3);assert.equal(value.total_affected,3);assert.equal(value.affected_counts.corrections_deleted,2);assert.equal(value.affected_counts.rejected_revisions_deleted,1);assert.equal(value.affected_counts.rejected_claims_deleted,0);assert.equal(value.audit_appended,1);
   const [audit]=await tx`select details from app_private.organization_audit where actor_id=${admin} and action='privacy.retention_applied' order by id desc limit 1`;assert.deepEqual(audit.details,value);
  });
  await t.test('per-category cap covers all five maintenance kinds without deleting active binding or resource',async()=>{
   const value=await run(true,1,5);assert.equal(value.total_affected,5);assert(['corrections_deleted','rejected_revisions_deleted','rejected_claims_deleted','approved_claims_redacted','audit_deleted'].every(k=>value.affected_counts[k]===1));assert.equal(value.affected_counts.approved_revisions_redacted,0);assert(value.has_remaining);
   assert.equal((await tx`select service_id from app_private.organization_listing_access where claim_id=${boundClaim}`).length,1);assert.equal((await tx`select id from app_private.services where id=${service}`).length,1);
  });
  await t.test('historical function is now a bounded wrapper rather than an unbounded fallback',async()=>{
   const [row]=await tx`select app_private.privacy_retention(true,${admin}::uuid) as summary`;assert.equal(row.summary.batch_size,100);assert.equal(row.summary.total_limit,500);assert.equal(row.summary.corrections_deleted,100);assert(row.summary.total_affected<=500);assert(row.summary.has_remaining);
  });
  await t.test('explicit repeated batches converge, skip already minimized claims, retain unresolved work and preserve owner guard',async()=>{
   let value;for(let i=0;i<10;i++){value=await run(true,20,100);if(!value.has_remaining)break;}assert.equal(value.has_remaining,false);
   assert.equal((await tx`select status from app_private.organization_claims where id=${pending}`)[0].status,'pending');assert.equal((await tx`select id from app_private.organization_revisions where user_id=${subject} and status='pending'`).length,1);
   assert.equal((await tx`select organization_id from app_private.organization_memberships where user_id=${subject}`).length,1);assert.equal((await tx`select account_status from app_private.app_users where id=${subject}`)[0].account_status,'active');
   const empty=await run(false,20,100);assert.equal(empty.total_planned,0);assert.equal(empty.total_affected,0);
   const [flag]=await tx`select current_setting('ourground.owner_retention',true) as flag`;assert(!flag.flag);
   await assert.rejects(tx.savepoint(sp=>sp`delete from app_private.organization_audit where actor_id=${admin}`),e=>e.message==='OG_AUDIT_IMMUTABLE');
  });
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await db.end();}
});
