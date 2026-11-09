import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import postgres from 'postgres';
import {PostgresOrganizationStore,OrganizationStoreError} from '../backend/organization-store.ts';
import {PostgresRepository,closeDatabase} from '../backend/postgres.ts';
import {requiredTables,inspectDatabase} from '../backend/db-checks.mjs';
const connection=process.env.ORG_SECURITY_TEST_DATABASE_URL;
if(!connection)throw Error('Set ORG_SECURITY_TEST_DATABASE_URL to an isolated loopback ourground_7b_security database.');
const u=new URL(connection);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.startsWith('/ourground_7b_security'))throw Error('Security tests require a disposable loopback security database.');
const apiURL=new URL(connection);apiURL.username='our_ground_api';apiURL.password='';
const owner=postgres(connection,{max:2,prepare:false,ssl:false,onnotice:()=>{}}),api=postgres(apiURL.href,{max:1,prepare:false,ssl:false,onnotice:()=>{}}),other=postgres(apiURL.href,{max:1,prepare:false,ssl:false,onnotice:()=>{}});
const store=new PostgresOrganizationStore((s,a=[])=>api.unsafe(s,a)),second=new PostgresOrganizationStore((s,a=[])=>other.unsafe(s,a));
const ids=Object.fromEntries(['admin','a','b','dual','ordinary','revoked','orgA','orgB','locA','locB','locOtherA','serviceA','serviceB','serviceOtherA','hidden','draft','concurrent','duplicate'].map(k=>[k,randomUUID()]));
const hash=id=>createHash('sha256').update(id).digest('hex'),ctx=actor=>({requestId:randomUUID(),sessionHash:hash(actor)}),call=(actor,action,input={},s=store)=>s.command(actor,action,input,ctx(actor));
const claim=(who,location='Synthetic location')=>({organization_name:'Synthetic security fixture',website_url:null,location,applicant_role:'Test coordinator',contact_email:who+'@example.invalid',contact_phone:null,explanation:'Synthetic database verification only.'});
const denied=(fn,code)=>assert.rejects(fn,e=>{assert(e instanceof OrganizationStoreError);assert.equal(e.code,code);return true;});
test('security boundary: actual runtime roles, tenant scope, revocation, suspension and concurrent decisions',async t=>{
 try{
  for(const name of ['admin','a','b','dual','ordinary','revoked','concurrent','duplicate'])await owner`insert into app_private.app_users(id) values(${ids[name]})`;
  await owner`update app_private.app_users set role='admin' where id=${ids.admin}`;
  for(const[org,loc,service,name,status]of [[ids.orgA,ids.locA,ids.serviceA,'A','published'],[ids.orgB,ids.locB,ids.serviceB,'B','published'],[ids.orgA,ids.locOtherA,ids.serviceOtherA,'A other site','published'],[ids.orgA,ids.locA,ids.hidden,'Hidden','hidden'],[ids.orgB,ids.locB,ids.draft,'Draft','draft']]){
   await owner`insert into app_private.organizations(id,name,status,is_demo) values(${org},${'Synthetic security organization '+name},'published',true) on conflict(id) do nothing`;
   await owner`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo) values(${loc},${org},${'Synthetic site '+name},'Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,'published',true) on conflict(id) do nothing`;
   await owner`insert into app_private.services(id,organization_id,location_id,title,summary,status,is_demo) values(${service},${org},${loc},${'Synthetic service '+name},'No real organization data',${status},true)`;
  }
  const approve=async(who,service,location=who+' site')=>{const c=await call(ids[who],'claims.create',claim(who,location));await call(ids.admin,'admin.claim.decide',{claim_id:c.id,decision:'approved',service_id:service,review_note:'Synthetic independent affiliation checked',source_url:'https://example.invalid/fixture'});return c;};
  await approve('a',ids.serviceA);await approve('b',ids.serviceB);await approve('dual',ids.serviceA,'Dual A');await approve('dual',ids.serviceB,'Dual B');await approve('revoked',ids.serviceA);
  await t.test('runtime role is restricted and owns no protected table or view',async()=>{
   const[r]=await api`select current_user as name`;assert.equal(r.name,'our_ground_api');const[role]=await owner`select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname='our_ground_api'`;assert.deepEqual({...role},{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false});assert.equal((await owner`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relowner=(select oid from pg_roles where rolname='our_ground_api')`).length,0);
  });
  await t.test('raw private reads and writes fail despite guessed actor IDs or GUC values',async()=>{
   for(const table of requiredTables)await assert.rejects(api.unsafe('select * from app_private.'+table),e=>e.code==='42501');
   await assert.rejects(api`update app_private.app_users set role='admin' where id=${ids.a}`,e=>e.code==='42501');
   await assert.rejects(api`update app_private.services set title='Bypass' where id=${ids.serviceA}`,e=>e.code==='42501');
  });
  await t.test('new source tables and owner import operations preserve private ACLs',async()=>{
   assert.deepEqual((await inspectDatabase(owner)).problems,[]);
   await assert.rejects(api`select app_private.resource_import_batch(${randomUUID()}::uuid,'[]'::jsonb)`,e=>e.code==='42501');
   for(const role of ['anon','authenticated'])await owner.begin(async tx=>{await tx.unsafe('set local role '+role);await assert.rejects(tx.savepoint(sp=>sp`select app_private.public_resource_search(40.27,-76.88,10,null,'',1,20,false,false)`),e=>e.code==='42501');await assert.rejects(tx.savepoint(sp=>sp`select * from app_private.public_resource_provenance`),e=>e.code==='42501');});
  });
  await t.test('missing context cannot execute private core operations',async()=>{
   await denied(()=>store.command(ids.a,'account.get'),'REQUEST_CONTEXT_REQUIRED');
   await assert.rejects(api`select app_private.organization_request(${ids.a}::uuid,'account.get','{}'::jsonb,${randomUUID()}::uuid,null)`,e=>e.message==='OG_REQUEST_CONTEXT_REQUIRED');
   await assert.rejects(api`select app_private.organization_command(${ids.a}::uuid,'account.get','{}'::jsonb)`,e=>e.code==='42501');
  });
  await t.test('ordinary users and cross-organization identifiers cannot enumerate scoped collections',async()=>{
   assert.deepEqual((await call(ids.ordinary,'account.get')).listings,[]);
   assert.deepEqual((await call(ids.a,'listings.list')).items.map(x=>x.id),[ids.serviceA]);
   await denied(()=>call(ids.a,'listings.get',{service_id:ids.serviceB}),'NOT_FOUND');await denied(()=>call(ids.a,'listings.get',{service_id:ids.serviceOtherA}),'NOT_FOUND');
   assert((await call(ids.a,'claims.list')).items.every(x=>x.user_id===ids.a));assert.deepEqual((await call(ids.a,'revisions.list')).items,[]);
  });
  await t.test('two legitimate memberships grant exactly both approved listings',async()=>{
   assert.deepEqual(new Set((await call(ids.dual,'listings.list')).items.map(x=>x.id)),new Set([ids.serviceA,ids.serviceB]));await denied(()=>call(ids.dual,'listings.get',{service_id:ids.serviceOtherA}),'NOT_FOUND');
  });
  await t.test('ownership, role, review, publication and donation fields cannot be mass assigned',async()=>{
   for(const patch of [{organization_id:ids.orgB},{user_id:ids.admin},{role:'admin'},{approved_by:ids.admin},{status:'published'},{donation_url:'https://example.invalid/pay'}])await denied(()=>call(ids.a,'revisions.create',{service_id:ids.serviceA,expected_version:1,expected_organization_version:1,expected_location_version:1,patch}),'VALIDATION_ERROR');
   await denied(()=>call(ids.a,'admin.queue',{role:'admin'}),'ACCESS_DENIED');
  });
  await t.test('public projections omit hidden/draft rows and private columns',async()=>{
   const rows=await api`select * from app_private.public_services`;assert(!rows.some(x=>x.id===ids.hidden||x.id===ids.draft));assert(rows.some(x=>x.id===ids.serviceA));assert(!Object.hasOwn(rows[0],'updated_by'));assert(!Object.hasOwn(rows[0],'version'));
   await assert.rejects(api`select email from app_private.public_organizations`,e=>e.code==='42703');
  });
  await t.test('public repository excludes fictional ordinary search and hidden detail',async()=>{
   process.env.DATABASE_URL=apiURL.href;process.env.DB_SSL='disable';const repo=new PostgresRepository();assert.equal((await repo.search({lat:40.27,lng:-76.88,radiusMiles:10,category:null,page:1,pageSize:20,allowDemo:false})).total,0);assert.equal(await repo.detail(ids.hidden,true),null);assert.equal(await repo.detail(ids.draft,true),null);assert.equal((await repo.detail(ids.serviceA,true)).data_kind,'fictional_demo');
  });
  await t.test('identity is restored between pooled requests and within outer transactions',async()=>{
   await call(ids.a,'account.get');let[r]=await api`select current_setting('ourground.actor_id',true) as actor,current_setting('ourground.session_hash',true) as session`;assert(!r.actor);assert(!r.session);
   await call(ids.b,'account.get');[r]=await api`select current_setting('ourground.actor_id',true) as actor`;assert(!r.actor);
   await api.begin(async tx=>{const scoped=new PostgresOrganizationStore((s,a=[])=>tx.savepoint(sp=>sp.unsafe(s,a)));await call(ids.a,'account.get',{},scoped);const[x]=await tx`select current_setting('ourground.actor_id',true) as actor,current_setting('ourground.request_id',true) as request`;assert(!x.actor);assert(!x.request);await denied(()=>call(ids.a,'listings.get',{service_id:ids.serviceB},scoped),'NOT_FOUND');});
  });
  await t.test('concurrent approval makes one decision and one membership binding',async()=>{
   const c=await call(ids.concurrent,'claims.create',claim('concurrent'));const input={claim_id:c.id,decision:'approved',service_id:ids.serviceA,review_note:'Concurrent synthetic review',source_url:'https://example.invalid/fixture'};
   const decisions=await Promise.allSettled([call(ids.admin,'admin.claim.decide',input),call(ids.admin,'admin.claim.decide',input,second)]);assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);assert.equal(decisions.filter(x=>x.status==='rejected'&&x.reason.code==='CONFLICT').length,1);const[n]=await owner`select count(*)::int as count from app_private.organization_listing_access where user_id=${ids.concurrent} and service_id=${ids.serviceA}`;assert.equal(n.count,1);
  });
  await t.test('concurrent repeated claims do not create duplicate pending rows',async()=>{
   const c=claim('duplicate');const submissions=await Promise.allSettled([call(ids.duplicate,'claims.create',c),call(ids.duplicate,'claims.create',c,second)]);assert.equal(submissions.filter(x=>x.status==='fulfilled').length,1);assert.equal(submissions.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
  });
  await t.test('distinct concurrent claims cannot both create an active binding for one user/object',async()=>{
   const first=(await call(ids.duplicate,'claims.list')).items[0],next=await call(ids.duplicate,'claims.create',claim('duplicate','A second submitted description'));
   const decision=claim_id=>({claim_id,decision:'approved',service_id:ids.serviceA,review_note:'Synthetic duplicate association review',source_url:'https://example.invalid/fixture'});
   const outcomes=await Promise.allSettled([call(ids.admin,'admin.claim.decide',decision(first.id)),call(ids.admin,'admin.claim.decide',decision(next.id),second)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.code==='CONFLICT').length,1);
  });
  await t.test('a blocked mutation rechecks suspension after the row-lock holder commits',async()=>{
   let pending,settled=false;
   await owner.begin(async tx=>{await tx`select id from app_private.app_users where id=${ids.a} for update`;pending=call(ids.a,'revisions.create',{service_id:ids.serviceA,expected_version:1,expected_organization_version:1,expected_location_version:1,patch:{summary:'Must not publish'}}).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});await new Promise(r=>setTimeout(r,50));assert.equal(settled,false);await tx`update app_private.app_users set account_status='suspended' where id=${ids.a}`;});
   const result=await pending;assert.equal(result.error?.code,'ACCOUNT_SUSPENDED');await call(ids.admin,'admin.suspend',{target_type:'user',target_id:ids.a,suspended:false,review_note:'Synthetic restoration after race test'});
  });
  await t.test('revocation denies a still-usable session on subsequent reads and writes',async()=>{
   await approve('revoked',ids.hidden,'Hidden listing assignment');
   const pending=await call(ids.revoked,'revisions.create',{service_id:ids.hidden,expected_version:1,expected_organization_version:1,expected_location_version:1,patch:{summary:'Author-owned proposal retained after revocation'}});
   const queue=await call(ids.admin,'admin.queue');assert.equal(queue.revisions.find(x=>x.id===pending.id).before_snapshot.status,'hidden');
   assert((await call(ids.revoked,'revisions.list')).items.every(x=>!Object.hasOwn(x,'before_snapshot')&&!Object.hasOwn(x,'current')));
   assert.equal((await call(ids.revoked,'session.check',{session_hash:hash(ids.revoked)})).active,true);await call(ids.admin,'admin.access.revoke',{organization_id:ids.orgA,user_id:ids.revoked,review_note:'Synthetic access withdrawal'});await denied(()=>call(ids.revoked,'listings.get',{service_id:ids.serviceA}),'NOT_FOUND');
   const history=(await call(ids.revoked,'revisions.list')).items;assert.equal(history.find(x=>x.id===pending.id).patch.summary,'Author-owned proposal retained after revocation');assert(history.every(x=>!Object.hasOwn(x,'before_snapshot')&&!Object.hasOwn(x,'current')));assert((await call(ids.revoked,'account.get')).revisions.every(x=>!Object.hasOwn(x,'before_snapshot')&&!Object.hasOwn(x,'current')));
   await denied(()=>call(ids.revoked,'revisions.create',{service_id:ids.serviceA,expected_version:1,expected_organization_version:1,expected_location_version:1,patch:{summary:'Denied'}}),'NOT_FOUND');
  });
  await t.test('suspension is current database state rather than stale JWT authority',async()=>{
   await call(ids.admin,'admin.suspend',{target_type:'user',target_id:ids.a,suspended:true,review_note:'Synthetic suspension'});await denied(()=>call(ids.a,'session.check',{session_hash:hash(ids.a)}),'SESSION_EXPIRED');await denied(()=>call(ids.a,'listings.get',{service_id:ids.serviceA}),'ACCOUNT_SUSPENDED');await call(ids.admin,'admin.suspend',{target_type:'user',target_id:ids.a,suspended:false,review_note:'Synthetic restoration'});assert.equal((await call(ids.a,'listings.get',{service_id:ids.serviceA})).id,ids.serviceA);
  });
  await t.test('organization suspension removes public visibility and assigned access',async()=>{
   await call(ids.admin,'admin.suspend',{target_type:'organization',target_id:ids.orgA,suspended:true,review_note:'Synthetic organization hold'});assert.equal((await api`select id from app_private.public_services where organization_id=${ids.orgA}`).length,0);assert.deepEqual((await call(ids.a,'listings.list')).items,[]);assert((await call(ids.a,'claims.list')).items.every(x=>!x.access_active));await denied(()=>call(ids.a,'listings.get',{service_id:ids.serviceA}),'NOT_FOUND');await call(ids.admin,'admin.suspend',{target_type:'organization',target_id:ids.orgA,suspended:false,review_note:'Synthetic restoration'});
  });
  await t.test('permission failure audit persists separately from denied transaction',async()=>{
   const context=ctx(ids.a);await denied(()=>store.command(ids.a,'listings.get',{service_id:ids.serviceB},context),'NOT_FOUND');assert(await store.auditSecurityFailure(ids.a,'listings.get',ids.serviceB,context));const queue=await call(ids.admin,'admin.queue');assert(queue.audit.some(x=>x.request_id===context.requestId&&x.result==='denied'&&x.action==='security.permission_denied'));assert(queue.audit.some(x=>x.action==='membership.granted'));assert(queue.audit.every(x=>x.request_id&&x.result));
   await assert.rejects(owner`update app_private.organization_audit set action='erased' where actor_id=${ids.a}`,e=>e.message==='OG_AUDIT_IMMUTABLE');
  });
  await t.test('database owner credentials cannot be substituted for runtime credentials',async()=>{
   await closeDatabase();process.env.DATABASE_URL=connection;const bad=new PostgresOrganizationStore();await assert.rejects(bad.command(ids.a,'account.get',{},ctx(ids.a)),e=>e.code==='RUNTIME_ROLE_INVALID');await bad.close();await assert.rejects(new PostgresRepository().search({lat:40.27,lng:-76.88,radiusMiles:10,category:null,page:1,pageSize:20,allowDemo:false}),e=>e.code==='RUNTIME_ROLE_INVALID');await closeDatabase();process.env.DATABASE_URL=apiURL.href;
  });
 }finally{await closeDatabase();await store.close();await second.close();await api.end();await other.end();await owner.end();}
});
