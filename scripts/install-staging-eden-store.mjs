// Explicit owner operation, never executed by an app, build, or ordinary migration.
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {developmentTarget} from '../backend/db-target.mjs';
import {databaseTls} from '../backend/database-security.ts';
import {stagingRef} from '../backend/staging-limiter.ts';
let sql;
try {
 assert(process.argv[2]==='--confirmed-ourground-staging'&&!process.env.VERCEL&&process.env.NODE_ENV!=='production');
 const env=parseEnv(await readFile('.env.eden08-runtime.local','utf8')),owner=parseEnv(await readFile('.env.eden08-owner.local','utf8'));
 const conn=owner.MIGRATION_DATABASE_URL,url=new URL(conn);
 assert.equal(developmentTarget(conn,env).ref,stagingRef);
 assert.equal(developmentTarget(env.DATABASE_URL,env).ref,stagingRef);
 assert.equal(url.username,'postgres.'+stagingRef);assert.equal(url.port||'5432','5432');assert.equal(url.pathname,'/postgres');
 const release=process.argv[3]==='--live-release';
 assert(release||!process.argv[3]);
 const ddl=await readFile('backend/staging/'+(release?'003_live_reservation_release.sql':'002_ephemeral_eden.sql'),'utf8');
 sql=postgres(conn,{max:1,ssl:databaseTls(env,conn),prepare:false,connect_timeout:8,onnotice:()=>{}});
 await sql.begin(async tx=>{
  const [t]=await tx`select current_user as role,current_database() as db,to_regnamespace('eden_staging_limits') is not null as installed,to_regclass('eden_staging_limits.eden_ticket') is not null as occupied`;
  assert(t.role==='postgres'&&t.db==='postgres'&&t.installed&&t.occupied===release);
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='4s'`;await tx.unsafe(ddl).simple();
  const [grant]=await tx`select has_function_privilege('our_ground_api','eden_staging_limits.eden_op(text,text,text,int)','execute') as run,has_table_privilege('our_ground_api','eden_staging_limits.eden_ticket','select,insert,update,delete') as raw, has_function_privilege('anon','eden_staging_limits.eden_op(text,text,text,int)','execute') as anon,has_function_privilege('authenticated','eden_staging_limits.eden_op(text,text,text,int)','execute') as auth`;
  assert(grant.run&&!grant.raw&&!grant.anon&&!grant.auth);
  if(release){
    const fn='eden_staging_limits.live_release(text,text)';
    const [r]=await tx`select has_function_privilege('our_ground_api',${fn},'execute') as run,has_function_privilege('anon',${fn},'execute') as anon,has_function_privilege('authenticated',${fn},'execute') as auth,has_function_privilege('service_role',${fn},'execute') as service`;
    assert(r.run&&!r.anon&&!r.auth&&!r.service);
    const digest=(await import('node:crypto')).randomBytes(32).toString('hex'),call=(await import('node:crypto')).randomBytes(32).toString('base64url');
    const [set]=await tx`select eden_staging_limits.eden_op('SET',${digest},${call},30) as set`;assert.equal(set.set,'OK');
    const [wrong]=await tx`select eden_staging_limits.live_release(${digest},${'X'.repeat(43)}) as n`;assert.equal(wrong.n,0);
    const [own]=await tx`select eden_staging_limits.live_release(${digest},${call}) as n`;assert.equal(own.n,1);
  }
 });
 console.log('Installed protected staging Eden store; raw table and browser roles denied.');
} catch(e){console.error('Staging store not installed:',e.code??'GUARD_OR_SETUP_FAILED');process.exitCode=1;}
finally{await sql?.end();}
