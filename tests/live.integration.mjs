import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {handleApi} from '../backend/app.ts';
import {productionDependencies} from '../backend/runtime.ts';
import {closeDatabase} from '../backend/postgres.ts';
import {developmentTarget} from '../backend/db-target.mjs';
import {inspectDatabase} from '../backend/db-checks.mjs';

const required = ['DATABASE_URL','MIGRATION_DATABASE_URL','SUPABASE_DEV_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','INTEGRATION_STAFF_ACCESS_TOKEN','INTEGRATION_OUTSIDER_ACCESS_TOKEN','ACCOUNT_ALLOWED_ORIGINS'];
const missing = required.filter(k=>!process.env[k]);
test('real Supabase database and confirmed sessions: public records and legacy access restrictions', {skip:missing.length ? 'BLOCKED: missing '+missing.join(', ') : false}, async t => {
  developmentTarget(process.env.MIGRATION_DATABASE_URL); developmentTarget(process.env.DATABASE_URL);
  process.env.BACKEND_DATA_MODE='postgres'; process.env.ALLOW_DEMO_DATA='true';
  const owner=postgres(process.env.MIGRATION_DATABASE_URL,{max:1,prepare:false,ssl:'require',connect_timeout:10,onnotice:()=>{}});
  const deps=productionDependencies();
  const staff=process.env.INTEGRATION_STAFF_ACCESS_TOKEN, outsider=process.env.INTEGRATION_OUTSIDER_ACCESS_TOKEN;
  const org=randomUUID(), location=randomUUID(), service=randomUUID(), tag='fixture-'+randomUUID();
  let created=false;
  const send=(path,token,init={})=>handleApi(new Request('http://localhost/api/v1/'+path,{...init,headers:{...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'}}),deps);
  try {
    const schema=await inspectDatabase(owner); assert.deepEqual(schema.problems,[]);
    const me=await send('me',staff); assert.equal(me.status,200); const editor=await me.json();
    const other=await send('me',outsider); assert.equal(other.status,200); const otherAccount=await other.json();
    assert.notEqual(editor.id,otherAccount.id); assert.equal(editor.role,'user'); assert.equal(otherAccount.role,'user');
    const confirmed=await owner`select id from auth.users where id in (${editor.id},${otherAccount.id}) and email_confirmed_at is not null`;
    assert.equal(confirmed.length,2,'Use two existing confirmed Auth sessions, both ordinary user accounts.');
    await owner.begin(async tx=>{
      await tx`insert into app_private.organizations(id,name,status,is_demo) values (${org},'Integration fixture — fictional','published',true)`;
      await tx`insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo) values (${location},${org},'Fictional test point','Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.8867,40.2732),4326)::extensions.geography,'published',true)`;
      await tx`insert into app_private.services(id,organization_id,location_id,title,summary,status,is_demo) values (${service},${org},${location},'Integration service — fictional',${tag},'published',true)`;
      await tx`insert into app_private.service_categories(service_id,category_id) select ${service},id from app_private.categories where slug='food'`;
    });
    created=true;
    await t.test('Google account has no automatic rights to the new organization',async()=>{
      assert.equal((await send('services/'+service,staff)).status,404);
      const [membership]=await owner`select count(*)::int as total from app_private.organization_memberships where organization_id=${org}`;
      assert.equal(membership.total,0);
    });
    // Explicit owner assignment for this disposable organization only.
    await owner`insert into app_private.organization_memberships(organization_id,user_id,role) values (${org},${editor.id},'editor')`;
    await t.test('search and detail work while direct reporting stays closed',async()=>{
      const place=await send('places/resolve?q=17101'); assert.equal(place.status,200);
      const search=await send('resources?lat=40.2732&lng=-76.8867&radius_miles=5&category=food&q='+tag);
      assert.equal(search.status,200); const found=await search.json(); assert.equal(found.total,1); assert.equal(found.items[0].id,service);
      const detail=await send('resources/'+service); assert.equal(detail.status,200); const record=await detail.json();
      assert.equal(record.data_kind,'fictional_demo'); assert.equal(record.contact.directions_url,null);
      const response=await send('correction-reports',null,{method:'POST',body:JSON.stringify({service_id:service,reason_code:'wrong_hours',description:tag})});
      assert.equal(response.status,403);
      assert.equal((await response.json()).error.code,'CORRECTIONS_CLOSED');
      const [saved]=await owner`select count(*)::int as count from app_private.correction_reports where service_id=${service}`;
      assert.equal(saved.count,0);
    });
    await t.test('anonymous, invalid-token and unrelated-account edits are denied',async()=>{
      const patch={method:'PATCH',body:JSON.stringify({expected_version:1,summary:'Unauthorized'})};
      assert.equal((await send('services/'+service,null,patch)).status,401);
      assert.equal((await send('services/'+service,'invalid-token',patch)).status,401);
      assert.equal((await send('services/'+service,outsider,patch)).status,404);
    });
    await t.test('legacy membership alone cannot bypass a reviewed listing association',async()=>{
      assert.equal((await send('services/'+service,staff)).status,404);
      const response=await send('services/'+service,staff,{method:'PATCH',body:JSON.stringify({expected_version:1,summary:'Attempted direct publication'})});
      assert.equal(response.status,409);
      assert.equal((await(await send('resources/'+service)).json()).summary,tag);
    });
  } finally {
    // Remove only rows tied to UUIDs created by this test; never reset application data.
    try { if (created) await owner.begin(async tx=>{
      await tx`delete from app_private.correction_reports where service_id=${service}`;
      await tx`delete from app_private.service_categories where service_id=${service}`;
      await tx`delete from app_private.services where id=${service}`;
      await tx`delete from app_private.service_locations where id=${location}`;
      await tx`delete from app_private.organization_memberships where organization_id=${org}`;
      await tx`delete from app_private.organizations where id=${org}`;
    }); } finally { await closeDatabase(); await owner.end(); }
  }
});
