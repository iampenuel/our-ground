import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {PostgresOrganizationStore,OrganizationStoreError} from '../backend/organization-store.ts';

// Explicit opt-in to a disposable loopback PostgreSQL database. No default remote
// connection and no .env loading. Every fixture and mutation is rolled back.
const connection=process.env.ORG_TEST_DATABASE_URL;
if(!connection)throw Error('Set ORG_TEST_DATABASE_URL to the isolated local Phase7B PostgreSQL database.');
const url=new URL(connection);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.startsWith('/ourground_7b'))throw Error('Organization database tests require an isolated loopback ourground_7b database.');
const db=postgres(connection,{max:1,prepare:false,ssl:false,onnotice:()=>{}});
const ids={admin:'a7000000-0000-4000-8000-000000000001',alice:'a7000000-0000-4000-8000-000000000002',bob:'a7000000-0000-4000-8000-000000000003',org1:'a7000000-0000-4000-8000-000000000004',org2:'a7000000-0000-4000-8000-000000000005',loc1:'a7000000-0000-4000-8000-000000000006',loc2:'a7000000-0000-4000-8000-000000000007',service1:'a7000000-0000-4000-8000-000000000008',service2:'a7000000-0000-4000-8000-000000000009',loc3:'a7000000-0000-4000-8000-000000000010',service3:'a7000000-0000-4000-8000-000000000011'};
const claim={organization_name:'Fictional local test organization',website_url:null,location:'Synthetic site, Harrisburg, PA',applicant_role:'Listing coordinator',contact_email:'alice@example.invalid',contact_phone:null,explanation:'Synthetic authorization test only.'};
const rollback=Error('ROLLBACK_TEST_FIXTURES');
test('real PostgreSQL enforces scoped claim, review, revocation, session and role protections',async(t)=>{
 try{
  await db.begin(async tx=>{
   for(const id of [ids.admin,ids.alice,ids.bob])await tx`insert into app_private.app_users(id) values(${id})`;
   await tx`update app_private.app_users set role='admin' where id=${ids.admin}`;
   for(const [org,loc,service,suffix]of [[ids.org1,ids.loc1,ids.service1,'A'],[ids.org2,ids.loc2,ids.service2,'B'],[ids.org1,ids.loc3,ids.service3,'C']]){
    await tx`insert into app_private.organizations(id,name,is_demo,status) values(${org},'Fictional local test organization',true,'published') on conflict(id) do nothing`;
    await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,is_demo,status) values(${loc},${org},${'Fictional test site '+suffix},'Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,true,'published')`;
    await tx`insert into app_private.services(id,organization_id,location_id,title,summary,is_demo,status) values(${service},${org},${loc},${'Fictional pantry '+suffix},'Synthetic record only',true,'published')`;
   }
   await tx`set local role our_ground_api`;
   const store=new PostgresOrganizationStore((s,a=[])=>tx.unsafe(s,a));
   const call=(actor,action,input={})=>store.command(actor,action,input,{requestId:randomUUID(),sessionHash:action==='session.check'||action==='session.revoke'?(input.session_hash??'a'.repeat(64)):'a'.repeat(64)});
   const denied=async(fn,code)=>assert.rejects(tx.savepoint(()=>fn()),e=>{assert(e instanceof OrganizationStoreError);assert.equal(e.code,code);return true;});
   let c,revision;
   await t.test('new sign-in is ordinary and pending claims grant no listing access',async()=>{
    const account=await call(ids.alice,'account.get');assert.equal(account.role,'user');assert.deepEqual(account.listings,[]);
    c=await call(ids.alice,'claims.create',claim);assert.equal(c.status,'pending');assert.equal(c.reviewer_id,null);
    assert.deepEqual((await call(ids.alice,'listings.list')).items,[]);
    await denied(()=>call(ids.alice,'listings.get',{service_id:ids.service1}),'NOT_FOUND');
    await denied(()=>call(ids.alice,'claims.create',claim),'DUPLICATE_CLAIM');
   });
   await t.test('non-admin users cannot review; a stored role remains authoritative',async()=>{
    await denied(()=>call(ids.alice,'admin.queue',{role:'admin'}),'ACCESS_DENIED');
    await denied(()=>call(ids.alice,'admin.claim.decide',{claim_id:c.id,decision:'approved',service_id:ids.service1,review_note:'Forged',source_url:'https://example.invalid/'}),'ACCESS_DENIED');
    await assert.rejects(tx.savepoint(sp=>sp.unsafe("update app_private.app_users set role='admin' where id=$1",[ids.alice])));
   });
   await t.test('self-review is rejected even for an administrator',async()=>{
    const own=await call(ids.admin,'claims.create',{...claim,contact_email:'admin@example.invalid',location:'Separate synthetic site'});
    await denied(()=>call(ids.admin,'admin.claim.decide',{claim_id:own.id,decision:'approved',service_id:ids.service1,review_note:'Cannot self approve',source_url:'https://example.invalid/'}),'SELF_REVIEW');
   });
   await t.test('approval establishes exactly the selected listing association',async()=>{
    const approved=await call(ids.admin,'admin.claim.decide',{claim_id:c.id,decision:'approved',service_id:ids.service1,review_note:'Synthetic affiliation independently checked',source_url:'https://example.invalid/identity'});
    assert.equal(approved.status,'approved');assert.equal(approved.reviewer_id,ids.admin);assert(approved.reviewed_at);assert.equal(approved.evidence_url,'https://example.invalid/identity');
    const mine=await call(ids.alice,'listings.list');assert.deepEqual(mine.items.map(x=>x.id),[ids.service1]);
    await denied(()=>call(ids.alice,'listings.get',{service_id:ids.service2}),'NOT_FOUND');
    await denied(()=>call(ids.alice,'listings.get',{service_id:ids.service3}),'NOT_FOUND');
    await denied(()=>call(ids.bob,'listings.get',{service_id:ids.service1}),'NOT_FOUND');
    await denied(()=>call(ids.alice,'revisions.create',{service_id:ids.service3,expected_version:1,expected_organization_version:1,expected_location_version:1,patch:{summary:'Cross-location attempt'}}),'NOT_FOUND');
   });
   await t.test('unknown, donation, publication and ownership fields are rejected in database',async()=>{
    for(const patch of [{donation_url:'https://example.invalid/donate'},{status:'hidden'},{organization_id:ids.org2},{contact_url:'javascript:alert(1)'},{category_slugs:['housing']},{state:'XX'},{hours:[{weekday:7,opens_at:'09:00',closes_at:'17:00'}]}]){
     await denied(()=>call(ids.alice,'revisions.create',{service_id:ids.service1,expected_version:1,expected_organization_version:1,expected_location_version:1,patch}),'VALIDATION_ERROR');
    }
   });
   await t.test('proposals remain unpublished until another authorized reviewer approves',async()=>{
    revision=await call(ids.alice,'revisions.create',{service_id:ids.service1,expected_version:1,expected_organization_version:1,expected_location_version:1,patch:{title:'Fictional revised pantry',description:'Reviewed synthetic description',category_slugs:['food'],hours:[{weekday:1,opens_at:'09:00',closes_at:'13:00',notes:'Synthetic hours'}]}});
    await denied(()=>call(ids.alice,'revisions.create',{service_id:ids.service1,expected_version:99,expected_organization_version:1,expected_location_version:1,patch:{summary:'Stale version'}}),'CONFLICT');
    assert.equal(revision.status,'pending');assert.equal((await call(ids.alice,'listings.get',{service_id:ids.service1})).title,'Fictional pantry A');
    await denied(()=>call(ids.alice,'admin.revision.decide',{revision_id:revision.id,decision:'approved',review_note:'Forged approval'}),'ACCESS_DENIED');
    const decided=await call(ids.admin,'admin.revision.decide',{revision_id:revision.id,decision:'approved',review_note:'Synthetic update reviewed'});assert.equal(decided.status,'approved');
    const current=await call(ids.alice,'listings.get',{service_id:ids.service1});assert.equal(current.title,'Fictional revised pantry');assert.equal(current.version,2);assert.equal(current.status,'published');assert.deepEqual(current.category_slugs,['food']);assert.equal(current.hours[0].opens_at,'09:00');
    await denied(()=>call(ids.admin,'admin.revision.decide',{revision_id:revision.id,decision:'approved',review_note:'Second review'}),'CONFLICT');
   });
   await t.test('rejected claims and revisions do not create permissions or change published data',async()=>{
    const rejected=await call(ids.bob,'claims.create',{...claim,contact_email:'bob@example.invalid'});
    await call(ids.admin,'admin.claim.decide',{claim_id:rejected.id,decision:'rejected',review_note:'Synthetic affiliation not established'});
    assert.deepEqual((await call(ids.bob,'listings.list')).items,[]);
    const r=await call(ids.alice,'revisions.create',{service_id:ids.service1,expected_version:2,expected_organization_version:1,expected_location_version:1,patch:{summary:'Rejected replacement'}});
    await call(ids.admin,'admin.revision.decide',{revision_id:r.id,decision:'rejected',review_note:'Synthetic details unsupported'});
    assert.equal((await call(ids.alice,'listings.get',{service_id:ids.service1})).summary,'Synthetic record only');
   });
   await t.test('revocation immediately removes access and blocks approval of outstanding changes',async()=>{
    const r=await call(ids.alice,'revisions.create',{service_id:ids.service1,expected_version:2,expected_organization_version:1,expected_location_version:1,patch:{summary:'Pending at revocation'}});
    await call(ids.admin,'admin.access.revoke',{organization_id:ids.org1,user_id:ids.alice,review_note:'Synthetic permission withdrawn'});
    assert.deepEqual((await call(ids.alice,'listings.list')).items,[]);assert.equal((await call(ids.alice,'claims.list')).items[0].access_active,false);
    await denied(()=>call(ids.alice,'listings.get',{service_id:ids.service1}),'NOT_FOUND');
    const history=(await call(ids.alice,'revisions.list')).items;assert(history.length>0);assert(history.every(x=>!Object.hasOwn(x,'before_snapshot')&&!Object.hasOwn(x,'current')));assert((await call(ids.alice,'account.get')).revisions.every(x=>!Object.hasOwn(x,'before_snapshot')&&!Object.hasOwn(x,'current')));
    await denied(()=>call(ids.admin,'admin.revision.decide',{revision_id:r.id,decision:'approved',review_note:'Cannot publish revoked author'}),'ACCESS_REVOKED');
   });
   await t.test('logout ban covers the session beyond access-token expiry',async()=>{
    const hash='b'.repeat(64);assert.deepEqual(await call(ids.alice,'session.check',{session_hash:hash}),{active:true});
    await call(ids.alice,'session.revoke',{session_hash:hash,expires_at:new Date(Date.now()-1000).toISOString()});
    await denied(()=>call(ids.alice,'session.check',{session_hash:hash}),'SESSION_EXPIRED');
   });
   await t.test('email gate is shared database state and fails after its allowance',async()=>{
    const key='c'.repeat(64);assert.equal(await store.consumeAccountLimit(key,'email'),true);assert.equal(await store.consumeAccountLimit(key,'email'),true);assert.equal(await store.consumeAccountLimit(key,'email'),true);assert.equal(await store.consumeAccountLimit(key,'email'),false);
   });
   await t.test('claim submission allowance applies across distinct organization identities',async()=>{
    for(const location of ['Second distinct site','Third distinct site'])await call(ids.bob,'claims.create',{...claim,contact_email:'bob@example.invalid',location});
    await denied(()=>call(ids.bob,'claims.create',{...claim,contact_email:'bob@example.invalid',location:'Fourth distinct site'}),'RATE_LIMITED');
   });
   await t.test('audit trail records reviewer decisions and cannot be changed by API',async()=>{
    const queue=await call(ids.admin,'admin.queue');assert(queue.audit.some(x=>x.action==='revision.approved'&&x.actor_id===ids.admin));
    await assert.rejects(tx.savepoint(sp=>sp`update app_private.organization_audit set action='erased'`));
    await assert.rejects(tx.savepoint(sp=>sp`update app_private.services set title='Bypass' where id=${ids.service1}`));
   });
   await t.test('Supabase browser roles have no private tables or command functions',async()=>{
    await tx`reset role`;
    await assert.rejects(tx.savepoint(sp=>sp`update app_private.organization_audit set action='erased'`),e=>e.code==='P0001'&&e.message==='OG_AUDIT_IMMUTABLE');
    for(const role of ['anon','authenticated']){
     await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp`select * from app_private.organization_claims`;}));
     await assert.rejects(tx.savepoint(async sp=>{await sp.unsafe('set local role '+role);await sp`select app_private.organization_command(${ids.admin}::uuid,'admin.queue','{}'::jsonb)`;}));
    }
   });
   throw rollback;
  });
 }catch(e){if(e!==rollback)throw e;}finally{await db.end();}
});
