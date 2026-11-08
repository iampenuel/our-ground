import {loadEnv} from 'vite';
import {publicEnvironmentProblems} from './env-boundary.mjs';
// Match Vite's actual mode-specific files, including .env.production(.local).
const publicOnly = process.argv.includes('--public-only');
const env = {...loadEnv(publicOnly ? 'production' : 'development',process.cwd(),''),...process.env};
const issues = publicEnvironmentProblems(env,{production:publicOnly});
if (!process.argv.includes('--public-only')) {
  for (const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','SUPABASE_DEV_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']) {
    const configured = Boolean(env[key]) && !/YOUR_|REPLACE_ME/.test(env[key]);
    console.log(key+': '+(configured ? 'configured' : 'missing'));
    if (!configured) issues.push('Required setup value missing: '+key);
  }
}
if (issues.length) { issues.forEach(i=>console.error(i)); process.exitCode=1; }
else console.log(process.argv.includes('--public-only') ? 'Public environment boundary check passed.' : 'Setup values are present. This is not a database or Google login test.');
