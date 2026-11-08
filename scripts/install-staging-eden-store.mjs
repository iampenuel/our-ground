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
 const ddl=await readFile('backend/staging/002_ephemeral_eden.sql','utf8');
 sql=postgres(conn,{max:1,ssl:databaseTls(env,conn),prepare:false,connect_timeout:8,onnotice:()=>{}});
 await sql.begin(async tx=>{
  const [t]=await tx`select current_user as role,current_database() as db,to_regnamespace('eden_staging_limits') is not null as installed,to_regclass('eden_staging_limits.eden_ticket') is not null as occupied`;
  assert(t.role==='postgres'&&t.db==='postgres'&&t.installed&&!t.occupied);
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='4s'`;await tx.unsafe(ddl).simple();
  const [grant]=await tx`select has_function_privilege('our_ground_api','eden_staging_limits.eden_op(text,text,text,int)','execute') as run,has_table_privilege('our_ground_api','eden_staging_limits.eden_ticket','select,insert,update,delete') as raw, has_function_privilege('anon','eden_staging_limits.eden_op(text,text,text,int)','execute') as anon,has_function_privilege('authenticated','eden_staging_limits.eden_op(text,text,text,int)','execute') as auth`;
  assert(grant.run&&!grant.raw&&!grant.anon&&!grant.auth);
 });
 console.log('Installed protected staging Eden store; raw table and browser roles denied.');
} catch(e){console.error('Staging store not installed:',e.code??'GUARD_OR_SETUP_FAILED');process.exitCode=1;}
finally{await sql?.end();}
