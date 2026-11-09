import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
const connection=process.env.PRIVACY_BATCH_TEST_DATABASE_URL;
if(!connection)throw Error('Choose an explicit disposable local PRIVACY_BATCH_TEST_DATABASE_URL.');
const target=new URL(connection);
if(!['127.0.0.1','localhost'].includes(target.hostname)||!/^\/(?:ourground_7d1[a-z0-9_]*|ourground_7e[a-z0-9_]*)$/.test(target.pathname))throw Error('Resolution/hold tests require a new Phase7D.1/7E loopback clone.');
const db=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}}),rollback=Error('ROLLBACK_RESOLUTION_HOLD_FIXTURES');
test('owner-confirmed resolution retention and legal/investigation holds on actual PostgreSQL',async t=>{
 try{await db.begin(async tx=>{
  const [ready]=await tx`select to_regclass('app_private.privacy_retention_holds') is not null as ready`;
  if(!ready.ready)await tx.unsafe(await readFile(new URL('../backend/migrations/013_resolved_retention_holds.sql',import.meta.url),'utf8'));
  const admin=randomUUID(),subject=randomUUID(),inactive=randomUUID(),org=randomUUID(),loc=randomUUID(),service=randomUUID(),activeClaim=randomUUID();
  await tx`insert into app_private.app_users(id,role) values(${admin},'admin'),(${subject},'user'),(${inactive},'user')`;
  await tx`insert into app_private.organizations(id,name,status,is_demo) values(${org},'Synthetic resolution hold fixture','published',true)`;
  await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo) values(${loc},${org},'Synthetic site','Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,'published',true)`;
  await tx`insert into app_private.services(id,organization_id,location_id,title,status,is_demo,version) values(${service},${org},${loc},'Synthetic resolution hold fixture','published',true,3)`;
  await tx`insert into app_private.organization_memberships(organization_id,user_id,role,granted_by) values(${org},${subject},'editor',${admin})`;
  const report=async(status,resolvedDays)=>{const id=randomUUID();await tx`insert into app_private.correction_reports(id,service_id,reason_code,description,status,created_at,resolved_at) values(${id},${service},'other','Synthetic confidential correction',${status},now()-interval '500 days',case when ${resolvedDays}::integer is null then null else now()-${resolvedDays}::integer*interval '1 day' end)`;return id;};
  const claim=async(status,days,user=inactive,id=randomUUID())=>{await tx`insert into app_private.organization_claims(id,user_id,organization_name,location,applicant_role,contact_email,explanation,status,service_id,reviewer_id,reviewed_at,created_at) values(${id},${user},'Synthetic organization',${id},'Coordinator','fixture@example.invalid','Synthetic confidential verification',${status},${service},case when ${status}='pending' then null else ${admin}::uuid end,case when ${status}='pending' then null else now()-${days}::integer*interval '1 day' end,now()-interval '500 days')`;return id;};
  const revision=async(status,days,version=1)=>{const id=randomUUID();await tx`insert into app_private.organization_revisions(id,service_id,organization_id,user_id,expected_version,expected_organization_version,expected_location_version,patch,before_snapshot,status,reviewer_id,reviewed_at,created_at) values(${id},${service},${org},${inactive},${version},1,1,'{"summary":"Synthetic confidential proposal"}','{}',${status},case when ${status}='pending' then null else ${admin}::uuid end,case when ${status}='pending' then null else now()-${days}::integer*interval '1 day' end,now()-interval '500 days')`;return id;};
  const audit=async(actor=inactive,targetId=null)=>{const[row]=await tx`insert into app_private.organization_audit(actor_id,action,target_id,organization_id,created_at) values(${actor},'fixture.old',${targetId},${org},now()-interval '400 days') returning id::text`;return row.id;};
  const run=async(apply=false,batch=100,total=500)=>(await tx`select app_private.privacy_retention_bounded(${apply},${admin}::uuid,${batch},${total}) as summary`)[0].summary;
  const hold=async(scope,id,release=false,reason='investigation')=>(await tx`select app_private.privacy_hold_set(${admin}::uuid,${scope},${String(id)},${reason},'SYNTHETIC-CASE-013',${release}) as summary`)[0].summary;
  const oldResolved=await report('resolved',100),oldOpen=await report('open',null),missingResolution=await report('resolved',null),recentResolution=await report('resolved',10),openWithTimestamp=await report('open',100);
  const oldRejected=await claim('rejected',200),freshRejected=await claim('rejected',10),pendingClaim=await claim('pending',null),inactiveApproved=await claim('approved',200);
  await claim('approved',200,subject,activeClaim);
  await tx`insert into app_private.organization_listing_access(service_id,user_id,organization_id,claim_id,granted_by) values(${service},${subject},${org},${activeClaim},${admin})`;
  const memberApproved=await claim('approved',200,subject),oldRevision=await revision('rejected',200),freshRevision=await revision('rejected',10),pendingRevision=await revision('pending',null),approvedRevision=await revision('approved',200),currentApprovedRevision=await revision('approved',200,2),oldAudit=await audit();
  const claimAudit=await audit(admin,oldRejected),revisionAudit=await audit(admin,oldRevision);
  await t.test('corrections age from resolution and retain open, absent and recent resolution timestamps',async()=>{
   const value=await run();assert.equal(value.corrections_deleted,1);assert.equal(value.total_affected,0);
   assert.equal((await tx`select id from app_private.correction_reports where id in (${oldOpen},${missingResolution},${recentResolution},${openWithTimestamp})`).length,4);
  });
  await t.test('claims and revisions age from review resolution; active access/membership verification and current approved history remain',async()=>{
   const value=await run();assert.equal(value.rejected_claims_deleted,1);assert.equal(value.rejected_revisions_deleted,1);assert.equal(value.approved_claims_redacted,1);assert.equal(value.approved_revisions_redacted,1);
   assert.equal((await tx`select contact_email from app_private.organization_claims where id=${activeClaim}`)[0].contact_email,'fixture@example.invalid');
   assert.equal((await tx`select id from app_private.organization_revisions where id=${approvedRevision}`).length,1);
  });
  await t.test('explicit record legal/investigation holds exclude every destructive category and metadata stays minimal',async()=>{
   for(const[scope,id,reason]of [['correction',oldResolved,'legal'],['claim',oldRejected,'investigation'],['claim',inactiveApproved,'legal'],['revision',oldRevision,'investigation'],['revision',approvedRevision,'legal'],['audit',oldAudit,'legal']])await hold(scope,id,false,reason);
   const value=await run();assert.equal(value.total_planned,0);assert.equal(value.has_remaining,false);assert(!JSON.stringify(value).includes('Synthetic'));assert(!JSON.stringify(value).includes('@'));
   assert.equal((await tx`select count(*)::int as n from app_private.privacy_retention_holds where released_at is null`)[0].n,6);
  });
  await t.test('runtime and browser roles cannot inspect or mutate holds or invoke owner helpers',async()=>{
   for(const role of ['our_ground_api','anon','authenticated'])for(const statement of ['select * from app_private.privacy_retention_holds',`select app_private.privacy_hold_set('${admin}','global','all','legal','SYNTHETIC',false)`,`select app_private.privacy_record_held('subject','${subject}','${subject}',null,null)`])await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp.unsafe(statement);}),e=>e.code==='42501');
  });
  await t.test('only owner/current admin can set holds; invalid/unknown/duplicate targets fail closed',async()=>{
   await assert.rejects(tx.savepoint(sp=>sp`select app_private.privacy_hold_set(${subject}::uuid,'global','all','legal','SYNTHETIC',false)`),e=>e.message==='OG_ACCESS_DENIED');
   for(const[scope,id,reason,reference,release]of [[null,'all','legal','SYNTHETIC',false],['global','all','legal','SYNTHETIC',null],['global','all','other','SYNTHETIC',false],['global','all','legal','private@example.invalid',false],['audit','-1','legal','SYNTHETIC',false]])await assert.rejects(tx.savepoint(sp=>sp`select app_private.privacy_hold_set(${admin}::uuid,${scope},${id},${reason},${reference},${release})`),e=>e.message==='OG_VALIDATION_ERROR');
   await assert.rejects(tx.savepoint(()=>hold('subject',randomUUID())),e=>e.message==='OG_NOT_FOUND');
   await assert.rejects(tx.savepoint(()=>hold('claim',oldRejected)),e=>e.message==='OG_CONFLICT');
   await assert.rejects(tx.savepoint(()=>hold('audit',oldAudit,true,'investigation')),e=>e.message==='OG_NOT_FOUND');
  });
  await t.test('subject redaction refuses a held related claim in dry-run and apply, preserving memberships and evidence',async()=>{
   for(const apply of [false,true])await assert.rejects(tx.savepoint(sp=>sp`select app_private.privacy_redact_subject(${inactive}::uuid,${admin}::uuid,${apply})`),e=>e.message==='OG_RETENTION_HOLD');
   assert.equal((await tx`select explanation from app_private.organization_claims where id=${oldRejected}`)[0].explanation,'Synthetic confidential verification');
  });
  await t.test('held audit cannot be deleted even with owner maintenance flag; ordinary append-only protection remains',async()=>{
   await assert.rejects(tx.savepoint(async sp=>{await sp`select set_config('ourground.owner_retention','on',true)`;await sp`delete from app_private.organization_audit where id=${oldAudit}::bigint`;}),e=>e.message==='OG_RETENTION_HOLD');
   await assert.rejects(tx.savepoint(sp=>sp`delete from app_private.organization_audit where id=${oldAudit}::bigint`),e=>e.message==='OG_AUDIT_IMMUTABLE');
  });
  await t.test('the shared immutable trigger safely denies deletion of source privacy events without organization-audit fields',async()=>{
   // Migration014 admits exact reviewed source/identifier pairs. Keep this
   // rolled-back synthetic event under the registered HRSA identity contract.
   const source='hrsa-health-centers',runId=randomUUID(),checksum=runId.replaceAll('-','').repeat(2);
   const recordId='BPS-H80-'+String(parseInt(runId.slice(0,8),16)%1000000).padStart(6,'0');
   await tx`insert into app_private.resource_import_runs(id,source_id,checksum,source_updated_at) values(${runId},${source},${checksum},now())`;
   await tx`insert into app_private.resource_privacy_holds(source_id,source_record_id,reason,import_run_id,source_updated_at) values(${source},${recordId},'suppressed',${runId},now())`;
   const[row]=await tx`insert into app_private.resource_privacy_events(source_id,source_record_id,action,import_run_id) values(${source},${recordId},'withdrawn',${runId}) returning id`;
   await assert.rejects(tx.savepoint(async sp=>{await sp`select set_config('ourground.owner_retention','on',true)`;await sp`delete from app_private.resource_privacy_events where id=${row.id}`;}),e=>e.message==='OG_AUDIT_IMMUTABLE');
  });
  await t.test('global, organization, service and subject holds also protect related records and audits',async()=>{
   for(const[scope,id,reason]of [['correction',oldResolved,'legal'],['claim',oldRejected,'investigation'],['claim',inactiveApproved,'legal'],['revision',oldRevision,'investigation'],['revision',approvedRevision,'legal'],['audit',oldAudit,'legal']])await hold(scope,id,true,reason);
   const baseline=await run();assert.equal(baseline.total_planned,8);
   for(const[scope,id]of [['global','all'],['organization',org],['service',service],['subject',inactive]]){
    await hold(scope,id);const value=await run();
    if(scope==='subject'){assert.equal(value.corrections_deleted,1);assert.equal(value.rejected_claims_deleted,0);assert.equal(value.audit_deleted,0);}else if(scope==='service'){assert.equal(value.corrections_deleted,0);assert.equal(value.rejected_revisions_deleted,0);assert.equal(value.approved_claims_redacted,0);}else assert.equal(value.total_planned,0);
    await hold(scope,id,true);
   }
  });
  await t.test('hold setters serialize with bounded maintenance through the shared advisory lock',async()=>{
   const other=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}});
   try{await assert.rejects(other`select app_private.privacy_retention_bounded(false,null,1,1)`,e=>e.message==='OG_MAINTENANCE_BUSY');}finally{await other.end();}
  });
  await t.test('released eligible rows obey existing caps; unresolved/current records and audit evidence survive',async()=>{
   const value=await run(true,1,3);assert.equal(value.total_affected,3);assert.equal(value.audit_appended,1);assert(value.has_remaining);
   const [compat]=await tx`select app_private.privacy_retention(false,null) as summary`;assert.equal(compat.summary.batch_size,100);assert.equal(compat.summary.total_limit,500);assert.equal(compat.summary.hold_policy,'active_legal_and_investigation_holds_preserved');
   const ids=[oldOpen,missingResolution,recentResolution,openWithTimestamp];assert.equal((await tx`select id from app_private.correction_reports where id in (${ids[0]},${ids[1]},${ids[2]},${ids[3]})`).length,4);
   assert.equal((await tx`select id from app_private.organization_claims where id in (${freshRejected},${pendingClaim},${activeClaim},${memberApproved})`).length,4);assert.equal((await tx`select id from app_private.organization_revisions where id in (${freshRevision},${pendingRevision},${approvedRevision})`).length,3);
   assert.equal((await tx`select id from app_private.services where id=${service}`).length,1);assert.equal((await tx`select user_id from app_private.organization_listing_access where claim_id=${activeClaim}`).length,1);
   assert.equal((await tx`select count(*)::int as n from app_private.organization_audit where actor_id=${admin} and action='privacy.retention_applied'`)[0].n,1);
  });
  await t.test('inactive approved private evidence is minimized after180 days while active verification and published resources remain intact',async()=>{
   const value=await run(true,20,100);assert(value.affected_counts.approved_claims_redacted>=1);assert(value.affected_counts.approved_revisions_redacted>=1);
   const[c]=await tx`select contact_email,contact_phone,explanation,website_url,evidence_url,review_note,organization_name,location,applicant_role,status,service_id from app_private.organization_claims where id=${inactiveApproved}`;
   assert.equal(c.contact_email,'withheld@redacted.invalid');for(const key of ['contact_phone','explanation','website_url','evidence_url'])assert.equal(c[key],null);assert.equal(c.organization_name,'Withheld private claim');assert.equal(c.status,'approved');assert.equal(c.service_id,service);
   const[r]=await tx`select patch,before_snapshot,review_note,status,expected_version,service_id from app_private.organization_revisions where id=${approvedRevision}`;
   assert.deepEqual(r.patch,{retained_metadata_only:true});assert.deepEqual(r.before_snapshot,{});assert.equal(r.review_note,'Private proposal content minimized after retention period.');assert.equal(r.status,'approved');assert.equal(r.expected_version,1);assert.equal(r.service_id,service);
   const[active]=await tx`select contact_email,explanation from app_private.organization_claims where id=${activeClaim}`;assert.equal(active.contact_email,'fixture@example.invalid');assert.equal(active.explanation,'Synthetic confidential verification');
   const[current]=await tx`select patch,before_snapshot,review_note from app_private.organization_revisions where id=${currentApprovedRevision}`;assert.deepEqual(current.patch,{summary:'Synthetic confidential proposal'});assert.equal(current.review_note,null);
   assert.equal((await tx`select title from app_private.services where id=${service}`)[0].title,'Synthetic resolution hold fixture');assert.equal((await run()).total_planned,0);
  });
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await db.end();}
});
