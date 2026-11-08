import {stagingLimitConfig,stagingProjectId,stagingRef} from '../backend/staging-limiter.ts';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {checkBuildEvidence} from '../backend/build-provenance.mjs';
import {exactBuildAuthOrigin,vercelSecurityConfigProblems} from '../backend/staging-csp.ts';

export const protectedProductionProject = 'prj_4li6QnqulPgPbJpxMW2L9hczDNrS';
const missing = value => !value || /REPLACE_ME|YOUR_|PROJECT_REF|COPIED_HOST|ENCODED_PASSWORD/.test(String(value));
const projectRef = value => typeof value === 'string' && /^[a-z0-9]{10,30}$/.test(value) && !missing(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function databaseTarget(connection, ref, runtime) {
  try {
    if(missing(connection)) return false;
    const url = new URL(connection), user = decodeURIComponent(url.username);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && !url.hash && Boolean(url.password)
      && (url.hostname === `db.${ref}.supabase.co` || url.hostname.endsWith('.pooler.supabase.com') && user.endsWith('.'+ref))
      && (runtime ? user === 'our_ground_api' || user === 'our_ground_api.'+ref : !/^our_ground_api(?:\.|$)/.test(user))
      && !['disable', 'allow', 'prefer', 'no-verify'].includes(url.searchParams.get('sslmode'));
  } catch { return false; }
}
function redisHost(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.pathname === '/' && !u.search && !u.hash && u.hostname.endsWith('.upstash.io') ? u.hostname : null; } catch { return null; }
}

/** Local fail-closed preflight only. Declared IDs/evidence are NOT proof of
 * ownership, hosted ACLs, live isolation, or authorization to deploy/migrate.
 * All results are static rule names: no key/connection values are returned.
 */
export function stagingConfigurationChecks(env, manifest, {linkedProject = {}, protectedEnv = {},vercelConfig,buildEvidence} = {}) {
  const m = object(manifest), v = object(m.vercel), s = object(m.supabase), r = object(m.redis), checks = [];
  const pg=env.RATE_LIMIT_BACKEND==='postgres-staging',directoryOnly=pg&&m.scope==='protected-directory'&&v.project_id===stagingProjectId&&s.project_ref===stagingRef;
  const authOff=directoryOnly&&!env.SUPABASE_PUBLISHABLE_KEY&&!env.VITE_SUPABASE_PUBLISHABLE_KEY&&!env.VITE_SUPABASE_URL&&env.ACCOUNT_EMAIL_AUTH_ENABLED==='false'&&env.VITE_GOOGLE_AUTH_ENABLED==='false';
  const check = (id, ok, absent = false) => checks.push({id, status: ok ? 'PASS' : absent ? 'BLOCKED' : 'FAIL'});
  check('designated_preview_requires_postgres',v.project_id!==stagingProjectId||pg);
  check('reviewed_manifest_version', m.schema_version === 1, m.schema_version === undefined);
  check('owner_target_approval_recorded', typeof m.owner_approval_reference === 'string' && m.owner_approval_reference.trim().length >= 8 && !missing(m.owner_approval_reference), missing(m.owner_approval_reference));
  check('dedicated_staging_project', typeof v.project_id === 'string' && /^prj_[A-Za-z0-9]+$/.test(v.project_id) && v.project_id !== protectedProductionProject && !missing(v.project_id), missing(v.project_id));
  check('exact_linked_project', linkedProject.projectId === v.project_id && linkedProject.orgId === v.team_id && v.project_id !== protectedProductionProject, !linkedProject.projectId || missing(v.team_id));
  check('vercel_runtime_project_matches', env.VERCEL_PROJECT_ID === v.project_id && env.VERCEL_PROJECT_ID !== protectedProductionProject, !env.VERCEL_PROJECT_ID);
  check('preview_target_only', v.deployment_target === 'preview' && env.VERCEL_ENV === 'preview', !env.VERCEL_ENV);
  let origin;
  try { const u = new URL(v.origin); if(u.protocol === 'https:' && u.origin === v.origin && !u.username && !u.password && !u.port && !['ourground.vercel.app','ourground.com'].includes(u.hostname) && !u.hostname.endsWith('.invalid')) origin = u.origin; } catch { /* Static failure below. */ }
  check('exact_nonproduction_https_origin', Boolean(origin), missing(v.origin));
  const origins = env.ACCOUNT_ALLOWED_ORIGINS?.split(',').map(x => x.trim()), browserOrigins = env.VITE_ACCOUNT_ALLOWED_ORIGINS?.split(',').map(x => x.trim());
  check('exact_auth_origin_allowlists', Boolean(origin && origins?.length === 1 && browserOrigins?.length === 1 && origins[0] === origin && browserOrigins[0] === origin), !env.ACCOUNT_ALLOWED_ORIGINS || !env.VITE_ACCOUNT_ALLOWED_ORIGINS);
  check('explicit_staging_supabase_project', projectRef(s.project_ref), missing(s.project_ref));
  const productionKnown = projectRef(s.production_project_ref) || s.production_auth_confirmed_unused === true && typeof s.production_evidence_reference === 'string' && s.production_evidence_reference.trim().length >= 8 && !missing(s.production_evidence_reference);
  check('production_auth_baseline_reviewed', productionKnown, !productionKnown);
  check('distinct_auth_project', productionKnown && projectRef(s.project_ref) && s.project_ref !== s.production_project_ref && env.SUPABASE_URL !== protectedEnv.SUPABASE_URL, !productionKnown);
  if(directoryOnly)check('directory_only_auth_disabled',authOff&&env.SUPABASE_URL==='https://'+stagingRef+'.supabase.co'&&env.SUPABASE_DEV_PROJECT_REF===stagingRef);
  else check('matching_server_browser_auth', projectRef(s.project_ref) && env.SUPABASE_URL === `https://${s.project_ref}.supabase.co` && env.VITE_SUPABASE_URL === env.SUPABASE_URL && env.SUPABASE_DEV_PROJECT_REF === s.project_ref, !env.SUPABASE_URL || !env.VITE_SUPABASE_URL || !env.SUPABASE_DEV_PROJECT_REF);
  let cspMatches=false;
  try { cspMatches=Boolean(vercelConfig && vercelSecurityConfigProblems(vercelConfig,exactBuildAuthOrigin(env)).length===0); } catch { /* Static failure below. */ }
  check('exact_build_auth_csp',cspMatches,!vercelConfig);
  check('actual_build_configuration_and_assets',buildEvidence?.status==='PASS',!buildEvidence||buildEvidence.status==='BLOCKED');
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if(!directoryOnly)check('public_auth_key_only', !missing(key) && key === env.VITE_SUPABASE_PUBLISHABLE_KEY && (key.startsWith('sb_publishable_') || key.split('.').length === 3 && (() => {try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role === 'anon';}catch{return false;}})()), missing(key) || missing(env.VITE_SUPABASE_PUBLISHABLE_KEY));
  check('restricted_staging_database', projectRef(s.project_ref) && databaseTarget(env.DATABASE_URL, s.project_ref, true) && env.DATABASE_URL !== env.MIGRATION_DATABASE_URL && env.DATABASE_URL !== protectedEnv.DATABASE_URL, missing(env.DATABASE_URL));
  if(pg)check('owner_credentials_absent',!env.MIGRATION_DATABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY&&!env.SUPABASE_SECRET_KEY);
  else check('separate_matching_owner_database', projectRef(s.project_ref) && databaseTarget(env.MIGRATION_DATABASE_URL, s.project_ref, false) && env.MIGRATION_DATABASE_URL !== env.DATABASE_URL && env.MIGRATION_DATABASE_URL !== protectedEnv.MIGRATION_DATABASE_URL, missing(env.MIGRATION_DATABASE_URL));
  check('verified_tls_required', env.DB_SSL !== 'disable');
  if(pg){
    let safe=false;try{stagingLimitConfig(env);safe=true;}catch{}
    check('isolated_staging_postgres_limits',safe&&v.project_id===stagingProjectId&&s.project_ref===stagingRef&&m.rate_limiter?.schema==='eden_staging_limits'&&m.rate_limiter?.verification==='real-concurrency-passed');
  }else{
  check('recognized_rate_backend',!env.RATE_LIMIT_BACKEND||env.RATE_LIMIT_BACKEND==='redis');
  check('dedicated_redis_instance', r.isolation === 'dedicated-instance' && redisHost(env.UPSTASH_REDIS_REST_URL) === r.endpoint_host && !missing(r.endpoint_host) && redisHost(env.UPSTASH_REDIS_REST_URL) !== redisHost(protectedEnv.UPSTASH_REDIS_REST_URL), missing(env.UPSTASH_REDIS_REST_URL));
  check('distinct_redis_credentials', !missing(env.UPSTASH_REDIS_REST_TOKEN) && env.UPSTASH_REDIS_REST_TOKEN !== protectedEnv.UPSTASH_REDIS_REST_TOKEN, missing(env.UPSTASH_REDIS_REST_TOKEN));
  }
  const server = env.GEOAPIFY_SERVER_API_KEY, browser = env.VITE_GEOAPIFY_BROWSER_KEY;
  if(directoryOnly){
    // A Preview flag alone did not select Preview for this project's first deployment.
    const previewEligible=v.preview_eligibility==='confirmed' && typeof v.preview_eligibility_reference==='string' && v.preview_eligibility_reference.trim().length>=8;
    check('staging_preview_target_confirmed',previewEligible,!previewEligible);
    check('tile_key_restrictions_reviewed',Boolean(origin&&browser&&!missing(browser)&&browser!==protectedEnv.VITE_GEOAPIFY_BROWSER_KEY&&browser!==protectedEnv.GEOAPIFY_SERVER_API_KEY&&m.geoapify?.restricted_browser_origin===origin),!browser);
    if(m.geoapify?.headerless_style_requests==='allowed'){
      const accepted=m.geoapify.quota_decision==='owner-accepted'&&typeof m.geoapify.owner_decision_reference==='string'&&m.geoapify.owner_decision_reference.trim().length>=8;
      check('known_headerless_tile_quota_accepted',accepted,!accepted);
    }
    check('supplemental_provider_off',!server&&['GEOAPIFY_ENABLED','GEOAPIFY_LIVE_APPROVED','GEOAPIFY_LOCATION_ENABLED','GEOAPIFY_LOCATION_LIVE_APPROVED'].every(k=>env[k]==='false'));
  }else check('dedicated_separate_provider_keys', !missing(server) && !missing(browser) && server !== browser && ![protectedEnv.GEOAPIFY_SERVER_API_KEY,protectedEnv.VITE_GEOAPIFY_BROWSER_KEY].includes(server) && ![protectedEnv.GEOAPIFY_SERVER_API_KEY,protectedEnv.VITE_GEOAPIFY_BROWSER_KEY].includes(browser), missing(server) || missing(browser));
  check('directory_city_reference_enabled', env.GEOGRAPHIC_REFERENCE_ENABLED === 'true', !env.GEOGRAPHIC_REFERENCE_ENABLED);
  check('no_hosted_eden_grant_or_credentials', (!env.EDEN_GEMINI_MODE || env.EDEN_GEMINI_MODE==='disabled') &&
    !Object.entries(env).some(([k,v]) => v && (
      (k.startsWith('EDEN_') && v!=='false' && /(?:OWNER|REVIEWER|DEVELOPMENT_ORIGINS|LIVE_ENABLED|TTS_ENABLED|LOCAL_DIRECTORY_ENABLED)/.test(k)) ||
      k==='GEMINI_API_KEY' || /^VITE_.*(?:GEMINI|REVIEWER|EDEN_LOCAL)/.test(k))));
  check('real_data_fixture_isolation', env.BACKEND_DATA_MODE === 'postgres' && env.ALLOW_DEMO_DATA === 'false' && ['ACCOUNT_LOCAL_FIXTURE','VITE_ACCOUNT_LOCAL_FIXTURE','LOCAL_FIXTURE_BUILD','VITE_LOCAL_FIXTURE_BUILD'].every(name => !env[name] || env[name] === 'false') && !env.DEMO_EDITOR_USER_ID);
  check('provider_limits_not_raised', Number(env.GEOAPIFY_SERVER_DAILY_BUDGET ?? 200) >= 1 && Number(env.GEOAPIFY_SERVER_DAILY_BUDGET ?? 200) <= 200 && Number.isInteger(Number(env.GEOAPIFY_SERVER_DAILY_BUDGET ?? 200)) && Number(env.GEOAPIFY_LOCATION_MAX_RETRIES ?? 0) === 0 && Number.isInteger(Number(env.GEOAPIFY_SERVER_WARNING_PERCENT??80)) && Number(env.GEOAPIFY_SERVER_WARNING_PERCENT??80)>=50 && Number(env.GEOAPIFY_SERVER_WARNING_PERCENT??80)<=95 && !env.GEOAPIFY_LOCATION_DAILY_BUDGET);
  const privateValues = [env.STAGING_RATE_LIMIT_SECRET,env.DATABASE_URL,env.MIGRATION_DATABASE_URL,env.UPSTASH_REDIS_REST_TOKEN,env.GEOAPIFY_SERVER_API_KEY,env.SUPABASE_SERVICE_ROLE_KEY,env.GOOGLE_CLIENT_SECRET].filter(value => typeof value === 'string' && value.length >= 12);
  check('no_private_value_browser_alias', !Object.entries(env).some(([key,value]) => key.startsWith('VITE_') && privateValues.includes(value)));
  check('owner_database_not_in_runtime_build', !env.VITE_DATABASE_URL && !env.VITE_MIGRATION_DATABASE_URL && !env.VITE_UPSTASH_REDIS_REST_TOKEN && !env.VITE_SUPABASE_SERVICE_ROLE_KEY && !env.VITE_GOOGLE_CLIENT_SECRET);
  return checks;
}

export async function stagingPreflight({cwd = process.cwd(), targetFile, linkFile = '.vercel/project.json',configFile = 'vercel.json', buildDir = 'dist', env = process.env}) {
  if(!targetFile) throw new Error('Choose the reviewed nonsecret target manifest with --target. No hosted action was performed.');
  const manifest = JSON.parse(await readFile(new URL(targetFile, pathToFileURL(cwd+'/')), 'utf8'));
  let linkedProject = {}, protectedEnv = {},vercelConfig;
  try { vercelConfig=JSON.parse(await readFile(new URL(configFile,pathToFileURL(cwd+'/')),'utf8')); } catch { /* Missing generated config is BLOCKED. */ }
  try { linkedProject = JSON.parse(await readFile(new URL(linkFile, pathToFileURL(cwd+'/')), 'utf8')); } catch { /* Missing link is BLOCKED. */ }
  try { protectedEnv = parseEnv(await readFile(new URL('.env.local', pathToFileURL(cwd+'/')), 'utf8')); } catch { throw new Error('The protected local baseline could not be read. No hosted action was performed.'); }
  const buildEvidence=await checkBuildEvidence(fileURLToPath(new URL(buildDir+'/',pathToFileURL(cwd+'/'))),env);
  const checks = stagingConfigurationChecks(env, manifest, {linkedProject, protectedEnv,vercelConfig,buildEvidence});
  return {local_preflight: checks.every(x => x.status === 'PASS') ? 'PASS' : 'BLOCKED', hosted_isolation: 'BLOCKED', deployment_authorized_by_check: false, network_requests: 0, checks};
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i+1]; };
  try { const result = await stagingPreflight({targetFile: option('--target'), linkFile: option('--project-link'),configFile:option('--vercel-config'),buildDir:option('--build-dir')}); console.log(JSON.stringify(result,null,2)); if(result.local_preflight !== 'PASS') process.exitCode = 2; }
  catch { console.error('Staging preflight blocked: inspect the explicit target, protected baseline and configuration privately. No hosted action was performed.'); process.exitCode = 2; }
}
