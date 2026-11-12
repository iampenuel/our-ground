import {authBuildProblems} from '../shared/auth-security.ts';
function isSecret(value) {
  if (typeof value !== 'string') return false;
  value = value.trim();
  if (/^sb_secret_|^sk\.|^postgres(?:ql)?:\/\//.test(value)) return true;
  try { return JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString()).role === 'service_role'; } catch { return false; }
}
export function publicEnvironmentProblems(env, {production=false,fixtureBuild=false}={}) {
  const issues=[];
  for (const [key,value] of Object.entries(env)) {
    const serverKey = ['ADULT_SESSION_SECRET','GOOGLE_PLACES_API_KEY','GOOGLE_GEOCODING_API_KEY','GEMINI_API_KEY','GEOAPIFY_SERVER_API_KEY','UPSTASH_REDIS_REST_TOKEN','UPSTASH_REDIS_REST_URL','YOTI_AVS_API_KEY','YOTI_AVS_SDK_ID','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','DATABASE_URL','MIGRATION_DATABASE_URL','GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_CLIENT_SECRET','SUPABASE_JWT_SECRET','INTEGRATION_STAFF_ACCESS_TOKEN','INTEGRATION_OUTSIDER_ACCESS_TOKEN','INTEGRATION_ADMIN_ACCESS_TOKEN','INTERNAL_ADMIN_TOKEN','ACCOUNT_RATE_LIMIT_SECRET','STAGING_RATE_LIMIT_SECRET'].some(name => typeof env[name] === 'string' && env[name].trim() && typeof value === 'string' && value.trim() === env[name].trim());
    if (key.startsWith('VITE_') && value && (/SECRET|PASSWORD|DATABASE|SERVICE_ROLE|ACCESS_TOKEN|MIGRATION|GOOGLE_PLACES|GOOGLE_GEOCODING|GEMINI|EDEN_REVIEWER|GEOAPIFY_SERVER|UPSTASH|REDIS|YOTI_AVS/.test(key) || isSecret(value) || serverKey)) issues.push('Private value or name under browser prefix: '+key);
  }
  if (env.VITE_SUPABASE_URL && env.SUPABASE_URL && env.VITE_SUPABASE_URL.replace(/\/$/,'') !== env.SUPABASE_URL.replace(/\/$/,'')) issues.push('Browser and server Supabase URLs differ.');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_PUBLISHABLE_KEY && env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_PUBLISHABLE_KEY) issues.push('Browser and server publishable keys differ.');
  if(production||fixtureBuild)issues.push(...authBuildProblems(env,production,fixtureBuild));
  return issues;
}
