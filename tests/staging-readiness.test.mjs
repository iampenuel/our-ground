import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {writeBuildEvidence} from '../backend/build-provenance.mjs';
import {renderVercelSecurityConfig} from '../backend/staging-csp.ts';
import {stagingConfigurationChecks,stagingPreflight,protectedProductionProject} from '../scripts/staging-readiness.mjs';

function fixture() {
  const ref='stagingfixtureproject',origin='https://ourground-isolated-fixture.vercel.app';
  const database = user => {const u=new URL('postgres://db.'+ref+'.supabase.co/postgres');u.username=user;u.password=['fixture','credential','value'].join('-');return u.href;};
  const env={VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_stagingfixture',ACCOUNT_ALLOWED_ORIGINS:origin,VITE_ACCOUNT_ALLOWED_ORIGINS:origin,SUPABASE_DEV_PROJECT_REF:ref,SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',DATABASE_URL:database('our_ground_api'),MIGRATION_DATABASE_URL:database('owner_fixture'),UPSTASH_REDIS_REST_URL:'https://staging-fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:'staging-redis-fixture-token',GEOAPIFY_SERVER_API_KEY:'staging-server-key-fixture',VITE_GEOAPIFY_BROWSER_KEY:'staging-browser-key-fixture',BACKEND_DATA_MODE:'postgres',ALLOW_DEMO_DATA:'false',GEOGRAPHIC_REFERENCE_ENABLED:'true'};
  const manifest={schema_version:1,owner_approval_reference:'Synthetic unit test only; no hosted approval',vercel:{team_id:'team_fixture',project_id:'prj_stagingfixture',deployment_target:'preview',origin},supabase:{project_ref:ref,production_project_ref:'productionfixtureproject'},redis:{isolation:'dedicated-instance',endpoint_host:'staging-fixture.upstash.io'}};
  const context={buildEvidence:{status:'PASS'},vercelConfig:renderVercelSecurityConfig({},env.SUPABASE_URL),linkedProject:{projectId:'prj_stagingfixture',orgId:'team_fixture'},protectedEnv:{UPSTASH_REDIS_REST_URL:'https://protected-fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:'protected-redis-fixture-token',GEOAPIFY_SERVER_API_KEY:'protected-server-key-fixture',VITE_GEOAPIFY_BROWSER_KEY:'protected-browser-key-fixture'}};
  return {env,manifest,context};
}
const failures = value => value.filter(item=>item.status!=='PASS').map(item=>item.id);

test('staging preflight validates declared isolated configuration without claiming hosted proof',()=>{
  const {env,manifest,context}=fixture();assert.deepEqual(failures(stagingConfigurationChecks(env,manifest,context)),[]);
});
test('production project, production environment and mismatched link are rejected despite staging labels',()=>{
  for(const variant of ['productionProject','productionEnvironment','mismatchedLink']){
    const {env,manifest,context}=fixture();
    if(variant==='productionProject'){env.VERCEL_PROJECT_ID=manifest.vercel.project_id=context.linkedProject.projectId=protectedProductionProject;}
    if(variant==='productionEnvironment')env.VERCEL_ENV='production';
    if(variant==='mismatchedLink')context.linkedProject.projectId=protectedProductionProject;
    assert(failures(stagingConfigurationChecks(env,manifest,context)).length>0);
  }
});
test('shared protected Redis/provider credentials and namespace-only declarations cannot pass',()=>{
  for(const variant of ['redisHost','redisToken','serverKey','browserKey','namespace']){
    const {env,manifest,context}=fixture();
    if(variant==='redisHost'){env.UPSTASH_REDIS_REST_URL=context.protectedEnv.UPSTASH_REDIS_REST_URL;manifest.redis.endpoint_host='protected-fixture.upstash.io';}
    if(variant==='redisToken')env.UPSTASH_REDIS_REST_TOKEN=context.protectedEnv.UPSTASH_REDIS_REST_TOKEN;
    if(variant==='serverKey')env.GEOAPIFY_SERVER_API_KEY=context.protectedEnv.GEOAPIFY_SERVER_API_KEY;
    if(variant==='browserKey')env.VITE_GEOAPIFY_BROWSER_KEY=context.protectedEnv.VITE_GEOAPIFY_BROWSER_KEY;
    if(variant==='namespace')manifest.redis.isolation='namespace';
    assert(failures(stagingConfigurationChecks(env,manifest,context)).length>0,variant);
  }
});
test('database project/role/TLS, arbitrary origin, private browser alias and fixture flags fail closed',()=>{
  for(const patch of [{DB_SSL:'disable'},{DATABASE_URL:fixture().env.MIGRATION_DATABASE_URL},{VITE_ACCOUNT_ALLOWED_ORIGINS:'https://*.vercel.app'},{ACCOUNT_ALLOWED_ORIGINS:'https://ourground.vercel.app'},{LOCAL_FIXTURE_BUILD:'true'},{BACKEND_DATA_MODE:'demo'},{GEOAPIFY_SERVER_DAILY_BUDGET:'201'},{VITE_SECRET_ALIAS:fixture().env.UPSTASH_REDIS_REST_TOKEN}]){
    const {env,manifest,context}=fixture();Object.assign(env,patch);assert(failures(stagingConfigurationChecks(env,manifest,context)).length>0);
  }
  const {env,manifest,context}=fixture();manifest.supabase.project_ref=manifest.supabase.production_project_ref;assert(failures(stagingConfigurationChecks(env,manifest,context)).includes('distinct_auth_project'));
});
test('missing owner approval and unknown production baseline stay blocked; reports contain no credential values',()=>{
  const {env,manifest,context}=fixture();manifest.owner_approval_reference='';delete manifest.supabase.production_project_ref;
  const checks=stagingConfigurationChecks(env,manifest,context);assert(checks.some(x=>x.id==='owner_target_approval_recorded'&&x.status==='BLOCKED'));assert(checks.some(x=>x.id==='production_auth_baseline_reviewed'&&x.status==='BLOCKED'));
  const report=JSON.stringify(checks);for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','UPSTASH_REDIS_REST_TOKEN','GEOAPIFY_SERVER_API_KEY'])assert(!report.includes(env[key]));
});
test('filesystem preflight does zero network calls and never turns local PASS into hosted verification',async()=>{
  const {env,manifest,context}=fixture(),dir=await mkdtemp(join(tmpdir(),'ourground-staging-test-'));let requests=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error('Network forbidden');};
  try{
    await writeFile(join(dir,'vercel-stage.json'),JSON.stringify(context.vercelConfig));await writeFile(join(dir,'target.json'),JSON.stringify(manifest));await writeFile(join(dir,'project.json'),JSON.stringify(context.linkedProject));await writeFile(join(dir,'.env.local'),Object.entries(context.protectedEnv).map(([key,value])=>key+'='+value).join('\n'));
    await mkdir(join(dir,'dist'));await writeFile(join(dir,'dist/index.html'),'<script src="/app.js"></script>');await writeFile(join(dir,'dist/app.js'),'/* explicit synthetic fixture */');await writeBuildEvidence(join(dir,'dist'),env);
    const result=await stagingPreflight({cwd:dir,targetFile:'target.json',linkFile:'project.json',configFile:'vercel-stage.json',env});assert.equal(result.local_preflight,'PASS');assert.equal(result.hosted_isolation,'BLOCKED');assert.equal(result.deployment_authorized_by_check,false);assert.equal(requests,0);
  }finally{globalThis.fetch=prior;await rm(dir,{recursive:true,force:true});}
});


test('staging guard rejects a missing or mismatched generated exact Auth CSP',()=>{
  const {env,manifest,context}=fixture();delete context.vercelConfig;assert(failures(stagingConfigurationChecks(env,manifest,context)).includes('exact_build_auth_csp'));
  context.vercelConfig=renderVercelSecurityConfig({},'https://anotherfixtureproject.supabase.co');assert(failures(stagingConfigurationChecks(env,manifest,context)).includes('exact_build_auth_csp'));
});

test('staging guard rejects invalid warning settings, obsolete budget aliases and missing actual build proof',()=>{
 for(const patch of [{GEOAPIFY_SERVER_WARNING_PERCENT:'49'},{GEOAPIFY_SERVER_WARNING_PERCENT:'96'},{GEOAPIFY_SERVER_WARNING_PERCENT:'NaN'},{GEOAPIFY_SERVER_WARNING_PERCENT:'80.5'},{GEOAPIFY_LOCATION_DAILY_BUDGET:'201'}]){
  const {env,manifest,context}=fixture();Object.assign(env,patch);assert(failures(stagingConfigurationChecks(env,manifest,context)).includes('provider_limits_not_raised'));
 }
 const {env,manifest,context}=fixture();delete context.buildEvidence;assert(failures(stagingConfigurationChecks(env,manifest,context)).includes('actual_build_configuration_and_assets'));
});

test('directory reference and hosted EDEN isolation are release gates',()=>{
  for(const patch of [{GEOGRAPHIC_REFERENCE_ENABLED:'false'},{EDEN_LOCAL_DIRECTORY_ENABLED:'true'},{EDEN_LOCAL_OWNER_ENABLED:'true'},{EDEN_GEMINI_MODE:'synthetic-development'},{GEMINI_API_KEY:'unit-test-only'}]){
    const {env,manifest,context}=fixture();Object.assign(env,patch);
    assert(failures(stagingConfigurationChecks(env,manifest,context)).length>0);
  }
});
