import {databaseTls,runtimeDatabaseConfiguration} from './database-security.ts';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectDatabase} from './db-checks.mjs';
import {developmentTarget} from './db-target.mjs';
import {retentionBatchOptions} from './privacy-maintenance.mjs';

const mode = process.argv[2] ?? 'status';
const args = process.argv.slice(3);
const connection = process.env.MIGRATION_DATABASE_URL;
let sql;
function assertTarget() {
  const target = developmentTarget(connection);
  console.log('Target: development project '+target.ref+' at '+target.hostname+' (no credentials displayed)');
}
async function checkDemoIds(tx) {
  const conflicts = await tx`select id from app_private.organizations where id in ('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555') and not is_demo
    union all select id from app_private.service_locations where id in ('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666') and (not is_demo or organization_id not in ('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555'))
    union all select id from app_private.services where id in ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777') and (not is_demo or organization_id not in ('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555'))`;
  if (conflicts.length) throw new Error('Reserved demo IDs overlap with existing records. Seed was not applied.');
}
try {
  assertTarget();
  sql = postgres(connection,{max:1,prepare:false,ssl:databaseTls(process.env,connection),connect_timeout:10,onnotice:()=>{}});
  const [extension] = await sql`select n.nspname as schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis'`;
  if (extension && extension.schema!=='extensions') throw new Error('PostGIS already uses a different schema. Review schema references; no extension was moved.');
  if (mode === 'migrate') {
    if (!args.includes('--apply')) throw new Error('Use --apply after reviewing backend/migrations. Demo seeds also require --include-demo.');
    const files = ['001_init.sql',...(args.includes('--include-demo')?['002_demo_seed.sql']:[]),'003_api_role.sql','004_private_schema_access.sql','005_organization_accounts.sql','006_security_boundary.sql','007_privacy_retention.sql','008_nationwide_resources.sql','009_resource_privacy_withdrawals.sql','010_location_privacy_boundary.sql','011_geographic_reference.sql','012_bounded_privacy_retention.sql','013_resolved_retention_holds.sql','014_reviewed_food_sources.sql','015_pgc_food_assistance.sql','016_food_row_lineage.sql','017_community_search.sql','018_hud_counselors.sql','019_census_city_aliases.sql'];
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext('our-ground-migrations'))`;
      await tx`create schema if not exists our_ground_meta`;
      await tx`revoke all on schema our_ground_meta from public`;
      await tx`create table if not exists our_ground_meta.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())`;
      for (const file of files) {
        const source = await readFile(new URL('./migrations/'+file,import.meta.url),'utf8');
        const hash = createHash('sha256').update(source).digest('hex');
        const [prior] = await tx`select sha256 from our_ground_meta.migrations where name=${file}`;
        if (prior) { if (prior.sha256!==hash) throw new Error('Previously applied migration changed: '+file); console.log('Already applied: '+file); continue; }
        if (file==='002_demo_seed.sql') await checkDemoIds(tx);
        await tx.unsafe(source);
        await tx`insert into our_ground_meta.migrations(name,sha256) values (${file},${hash})`;
        console.log('Applied in transaction: '+file);
      }
      const result = await inspectDatabase(tx);
      if (result.problems.length) throw new Error(result.problems.join('; '));
    });
    console.log('Migration transaction committed. Existing records were not replaced.');
  } else if (mode === 'retention' || mode === 'redact-subject') {
    const apply=args.includes('--apply'),reviewer=args.includes('--reviewer')?args[args.indexOf('--reviewer')+1]:null;
    const user=args.includes('--user')?args[args.indexOf('--user')+1]:null;
    const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if((apply && !uuid.test(reviewer??'')) || (reviewer && !uuid.test(reviewer)))throw Error('Apply requires --reviewer <active administrator UUID>.');
    if(mode==='redact-subject' && (!uuid.test(user??'') || !uuid.test(reviewer??'') || !args.includes('--verified-request')))throw Error('Verify the requester independently, then use redact-subject --user <UUID> --reviewer <different active admin UUID> --verified-request. The default is dry-run; --apply is explicit.');
    const batch=mode==='retention'?retentionBatchOptions(args,process.env):null;
    const result=await sql.begin(async tx=>{
      await tx`set local statement_timeout='15s'`;await tx`set local lock_timeout='2s'`;
      {const[ready]=await tx`select to_regprocedure('app_private.privacy_hold_set(uuid,text,text,text,text,boolean)') is not null as ready`;if(!ready.ready)throw Error('Reviewed migration013 is required. Owner privacy commands will not use obsolete retention or hold rules.');}
      const rows=mode==='retention'
        ? await tx`select app_private.privacy_retention_bounded(${apply},${reviewer}::uuid,${batch.batchSize},${batch.totalLimit}) as summary`
        : await tx`select app_private.privacy_redact_subject(${user}::uuid,${reviewer}::uuid,${apply}) as summary`;
      return rows[0].summary;
    });
    console.log(JSON.stringify(result,null,2));
    if(mode==='retention'&&result.has_remaining)console.log('Eligible work remains. Review this batch before explicitly running another; no automatic loop or schedule was started.');
    console.log(apply?'Owner privacy operation committed. Supabase Auth identities are managed separately by their verified owner.':'Dry-run only. No records were changed.');
  } else if (mode === 'bootstrap-admin') {
    const user = args[args.indexOf('--user')+1], email = args[args.indexOf('--email')+1];
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (!args.includes('--confirm-admin') || !args.includes('--user') || !args.includes('--email') || !uuid.test(user??'') || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Review the exact account, then use bootstrap-admin --user <Auth UUID> --email <verified email> --confirm-admin.');
    await sql.begin(async tx => {
      const [authUser] = await tx`select id from auth.users where id=${user} and lower(email)=lower(${email}) and email_confirmed_at is not null for share`;
      if (!authUser) throw new Error('The explicitly selected Auth user and confirmed email do not match. No administrator was granted.');
      await tx`insert into app_private.app_users(id) values (${user}) on conflict(id) do nothing`;
      await tx`update app_private.app_users set role='admin' where id=${user}`;
      await tx`insert into app_private.organization_audit(actor_id,action,target_id,details) values (${user},'admin.bootstrapped',${user},'{"method":"explicit-owner-development-command"}'::jsonb)`;
    });
    console.log('Administrator role granted to the explicitly selected verified account and recorded in the audit trail.');
  } else if (mode === 'grant-editor') {
    throw new Error('Direct editor grants are disabled. Review an organization claim and its exact listing association through the administrator workflow.');
  } else if (mode === 'status' || mode === 'verify') {
    const [exists] = await sql`select to_regclass('app_private.services') is not null as present`;
    if (!exists.present) throw new Error('Application schema is not installed. Review and run db:migrate.');
    const result = await inspectDatabase(sql); console.log(JSON.stringify(result,null,2));
    if (result.problems.length) throw new Error('Database checks failed. See the listed problems.');
    if (mode === 'verify') {
      if (!process.env.DATABASE_URL) throw new Error('BLOCKED: DATABASE_URL is required to verify the runtime role connection.');
      developmentTarget(process.env.DATABASE_URL);
      const runtimeConfig=runtimeDatabaseConfiguration(process.env);
      const runtime = postgres(runtimeConfig.connection,{max:1,prepare:false,ssl:runtimeConfig.ssl,connect_timeout:10});
      try {
        const [user] = await runtime`select current_user as name`;
        if (user.name!=='our_ground_api') throw new Error('DATABASE_URL must use the restricted our_ground_api role.');
        await runtime`select id from app_private.public_services limit 1`;
        console.log('Runtime database connection and restricted role passed.');
      } finally { await runtime.end(); }
    }
    console.log('Database schema and role checks passed. This does not test email sign-in.');
  } else throw new Error('Unknown command. Use status, migrate, verify, bootstrap-admin, retention, or redact-subject.');
} catch (error) {
  if (mode==='migrate') console.error('No migration transaction was committed by this run.');
  // Database driver messages can contain connection details: only show deliberate setup messages.
  console.error(error instanceof Error && !('severity' in error) && !('syscall' in error) ? error.message : 'Database operation failed. Check development credentials, network access and schema permissions.');
  process.exitCode=1;
} finally { await sql?.end(); }
