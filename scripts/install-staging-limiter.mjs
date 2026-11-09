// Explicit operator command only; not imported by the app, Vite or the ordinary migrator.
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {developmentTarget} from '../backend/db-target.mjs';
import {databaseTls} from '../backend/database-security.ts';
let db;
try {
 assert(process.argv.length===3&&process.argv[2]==='--confirmed-ourground-staging'&&!process.env.VERCEL&&!process.env.VERCEL_ENV&&process.env.NODE_ENV!=='production');
 const root=new URL('../',import.meta.url),env=parseEnv(await readFile(new URL('.env.eden08-runtime.local',root),'utf8')),owner=parseEnv(await readFile(new URL('.env.eden08-owner.local',root),'utf8'));
 const url=owner.MIGRATION_DATABASE_URL;assert.equal(developmentTarget(url,env).ref,'hrmocmvdmshoghclxyjs');assert.equal(developmentTarget(env.DATABASE_URL,env).ref,'hrmocmvdmshoghclxyjs');assert.notEqual(url,env.DATABASE_URL);const parsed=new URL(url);
 assert.equal(parsed.username,'postgres.hrmocmvdmshoghclxyjs');assert.equal(parsed.port||'5432','5432');assert.equal(parsed.pathname,'/postgres');
 const sql=await readFile(new URL('backend/staging/001_atomic_limits.sql',root),'utf8');
 db=postgres(url,{max:1,ssl:databaseTls(env,url),prepare:false,connect_timeout:7,onnotice:()=>{}});
 await db.begin(async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='4s'`;
  const [t]=await tx`select current_user as role,current_database() as db,to_regnamespace('eden_staging_limits') is not null as occupied,exists(select 1 from pg_roles where rolname='eden_staging_limiter_owner') as role_taken`;
  assert(t.role==='postgres'&&t.db==='postgres'&&!t.occupied&&!t.role_taken,'Target not empty or not staging owner');
  if((await tx`select to_regclass('cron.job') as cron`)[0].cron)assert.equal((await tx`select count(*)::int n from cron.job where jobname='eden10-staging-limiter-purge'`)[0].n,0);
  await tx.unsafe(sql).simple();
  const [a]=await tx`select has_function_privilege('our_ground_api','eden_staging_limits.admit(text,integer,integer,integer)','execute') as admit,has_table_privilege('our_ground_api','eden_staging_limits.bucket','select,insert,update,delete') as raw,has_schema_privilege('anon','eden_staging_limits','usage') as anon,has_function_privilege('authenticated','eden_staging_limits.admit(text,integer,integer,integer)','execute') as client`;
  assert(a.admit&&!a.raw&&!a.anon&&!a.client);
 });
 console.log(JSON.stringify({installed:true,project:'ourground-staging',sha256:createHash('sha256').update(sql).digest('hex')}));
} catch(e){console.error(JSON.stringify({installed:false,code:e.code??'GUARD_OR_SETUP_FAILED'}));process.exitCode=1;}finally{await db?.end();}
