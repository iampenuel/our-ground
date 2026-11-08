// Explicit, predeployment-only integration probe. No provider/network user data or resource writes.
import {parseEnv} from 'node:util';import {readFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';import postgres from 'postgres';
import {databaseTls,runtimeDatabaseConfiguration} from '../backend/database-security.ts';
import {developmentTarget} from '../backend/db-target.mjs';
import {createPublicProtection} from '../backend/anonymous-protection.ts';import {createDiscoveryLimiter} from '../backend/geoapify-limits.ts';
import {stagingAdmission,stagingLimitConfig,stagingProjectId,stagingRef} from '../backend/staging-limiter.ts';import {handleApi} from '../backend/app.ts';import {PostgresRepository,closeDatabase} from '../backend/postgres.ts';
const root=new URL('../',import.meta.url),configs=[];let admin,limited,phase='identity';const report={checks:[],hosted:false};const ok=(v,m)=>{assert(v,m);report.checks.push(m);};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 assert(process.argv.length===3&&process.argv[2]==='--confirmed-before-deployment'&&!process.env.VERCEL&&!process.env.VERCEL_ENV&&process.env.NODE_ENV!=='production'&&!process.env.MIGRATION_DATABASE_URL);
 const runtime=parseEnv(await readFile(new URL('.env.eden08-runtime.local',root),'utf8')),owner=parseEnv(await readFile(new URL('.env.eden08-owner.local',root),'utf8'));assert.equal(developmentTarget(owner.MIGRATION_DATABASE_URL,runtime).ref,stagingRef);
 const base={...runtime,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:stagingProjectId,RATE_LIMIT_BACKEND:'postgres-staging',STAGING_RATE_LIMIT_SECRET:randomBytes(32).toString('hex')};stagingLimitConfig(base);
 admin=postgres(owner.MIGRATION_DATABASE_URL,{max:1,prepare:false,ssl:databaseTls(runtime,owner.MIGRATION_DATABASE_URL),connect_timeout:6,onnotice:()=>{}});
 const cfg=runtimeDatabaseConfiguration(runtime);limited=postgres(cfg.connection,{max:1,ssl:cfg.ssl,prepare:false,connect_timeout:6,onnotice:()=>{}});
 for(let i=0;i<6;i++)configs.push({...base});const guards=configs.map(e=>createPublicProtection(e)),net='192.0.2.204';
 const snapshot=async()=>{const [r]=await admin`select md5(string_agg(id::text||':'||title,'|' order by id)) as digest,count(*)::int as count from app_private.public_services`;return r;};
 const start=await snapshot();ok(start.count===3,'Three published resources present');
 const counts=async()=>{const [x]=await admin`select pg_total_relation_size('eden_staging_limits.bucket')::int as limiter_bytes,pg_database_size(current_database())::int as database_bytes,(select count(*)::int from eden_staging_limits.bucket) as rows,current_setting('max_connections')::int as max_connections,(select count(*)::int from pg_stat_activity where datname=current_database()) as sessions`;return x;};report.before=await counts();
 const [acl]=await admin`select has_table_privilege('our_ground_api','eden_staging_limits.bucket','select,insert,update,delete,truncate') as raw,has_function_privilege('our_ground_api','eden_staging_limits.purge()','execute') as purge,has_schema_privilege('anon','eden_staging_limits','usage') as anon,has_schema_privilege('authenticated','eden_staging_limits','usage') as auth,has_schema_privilege('service_role','eden_staging_limits','usage') as service, (select relrowsecurity from pg_class where oid='eden_staging_limits.bucket'::regclass) as rls`;
 ok(!acl.raw&&!acl.purge&&!acl.anon&&!acl.auth&&!acl.service&&acl.rls,'Private schema, RLS, execute-only restricted API');
 try{await limited`select * from eden_staging_limits.bucket limit 1`;throw Error('raw read succeeded');}catch(e){ok(e.code==='42501','Actual direct runtime SELECT denied');}
 phase='handlers';const upstream=()=>({label:'Harrisburg, PA',city:'Harrisburg',state:'PA',latitude:40.275891,longitude:-76.88502});
 const call=(i,action='resolve',identity=net,guard=guards[i])=>handleApi(new Request('https://probe.invalid/api/v1/'+(action==='resolve'?'places/resolve?q=Harrisburg%2C%20PA':'resources?lat=40.275891&lng=-76.88502&category=healthcare&radius_miles=10'),{headers:{'x-vercel-forwarded-for':identity,'x-forwarded-for':'198.51.100.'+Math.floor(Math.random()*250)}}),{allowDemo:false,realDirectoryConfigured:true,publicProtection:guard,resolvePlace:async()=>upstream(),repo:new PostgresRepository()});
 Object.assign(process.env,runtime);const r=await call(0,'read');const page=await r.json();ok(r.status===200&&page.total===3,'Protected HTTP handler reaches real restricted directory');
 await Promise.all(configs.map((e,i)=>stagingAdmission(e).take('read','warmup-'+i,100,80)));
 const position=async()=>Number((await admin`select extract(epoch from clock_timestamp()) as t`)[0].t);
 let time=await position();if(time%60>52)await sleep((61-time%60)*1000);
 const begun=Date.now();const responses=await Promise.all(Array.from({length:18},(_,i)=>call(i%6)));const codes=responses.map(x=>x.status);
 report.concurrent={sessions:6,attempts:18,allowed:codes.filter(x=>x===200).length,denied:codes.filter(x=>x===429).length,elapsed_ms:Date.now()-begun};ok(report.concurrent.allowed===6&&report.concurrent.denied===12&&responses.filter(x=>x.status===429).every(x=>Number(x.headers.get('Retry-After'))>=1),'Six of eighteen simultaneous HTTP requests admitted across six independent pools; 429 includes Retry-After');
 const retry=await call(1);ok(retry.status===429,'Repeated requests with alternate untrusted forwarded headers remain denied');
 phase='storage outage';
 await admin.begin(async tx=>{await tx`select pg_advisory_xact_lock(1480730957,3)`;const blocked=await call(0,'read');ok(blocked.status===503&&(await blocked.json()).error.code==='ABUSE_PROTECTION_UNAVAILABLE','Actual database lock contention fails closed with HTTP 503');});
 ok((await call(0,'read')).status===200,'HTTP read recovers once storage is available');
 for(const overrides of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'incorrect'},{STAGING_RATE_LIMIT_SECRET:''},{SUPABASE_DEV_PROJECT_REF:'other'},{RATE_LIMIT_BACKEND:'invalid'}]){
  const wrong={...base,...overrides};ok((await call(0,'read',net,createPublicProtection(wrong))).status===503,'Wrong/missing staging configuration rejected: '+Object.keys(overrides)[0]);
 }
 phase='shared provider limits';const [prior]=await admin`select coalesce(max(used) filter(where until_s>extract(epoch from clock_timestamp())),0)::int as used from eden_staging_limits.bucket where action='geo_provider' and slot=-1`;const budget=prior.used+3;assert(budget<=200);
 const providers=configs.map(e=>{const v={...e,GEOAPIFY_SERVER_DAILY_BUDGET:String(budget)};configs.push(v);return createDiscoveryLimiter(v);});
 // Warm provider pools using the separately capped search lane, never a provider call.
 await Promise.all(providers.map((p,i)=>p.search('198.51.100.'+(i+1))));
 let clock=await position();await sleep(Math.ceil((1-clock%1)*1000)+50);
 const permits=await Promise.allSettled(providers.slice(0,3).map((p,i)=>p.provider('203.0.113.'+(i+1))));
 ok(permits.filter(p=>p.status==='fulfilled').length===2&&permits.some(p=>p.status==='rejected'&&p.reason.status===429),'Atomic global two-per-second cap across different networks');
 await sleep(1110);await providers[0].provider('203.0.113.44');await sleep(1110);
 const final=await Promise.allSettled([providers[2].provider('203.0.113.45')]);ok(final[0].status==='rejected'&&final[0].reason.status===429,'One-second window expires naturally, daily ceiling remains binding');
 const [daily]=await admin`select used from eden_staging_limits.bucket where action='geo_provider' and slot=-1`;ok(daily.used===budget,'Rejected attempts do not consume partial global budget');
 phase='expiry and cleanup';time=await position();if(time%60<59.9)await sleep((60.15-time%60)*1000);
 ok((await call(2)).status===200,'Exhausted minute window reopens on database clock');
 const [job]=await admin`select jobid,active,schedule from cron.job where jobname='eden10-staging-limiter-purge'`;ok(job.active&&job.schedule==='*/5 * * * *','Independent five-minute cleanup is scheduled');
 const [purged]=await admin`select eden_staging_limits.purge() as removed`;ok(Number.isInteger(purged.removed),'Scheduled cleanup function runs under owner (not runtime)');
 const [ret]=await admin`select count(*)::int as n from eden_staging_limits.bucket where until_s<=floor(extract(epoch from clock_timestamp()))`;ok(ret.n===0,'No expired rows left after cleanup');
 const end=await snapshot();ok(end.count===start.count&&end.digest===start.digest,'Published record IDs and titles unchanged');report.after=await counts();ok(report.after.rows<=2580&&report.after.limiter_bytes<2097152,'Fixed-cardinality limiter remains below 2 MiB during this probe');
 console.log(JSON.stringify({...report,pass:true},null,2));
}catch(e){console.error(JSON.stringify({pass:false,phase,code:e.code||'CHECK_FAILED',assertion:e.code==='ERR_ASSERTION'?e.message.slice(0,140):undefined,checks:report.checks,concurrency:report.concurrent}));process.exitCode=1;}
finally{await Promise.all(configs.map(e=>stagingAdmission(e).close()));await closeDatabase();await limited?.end({timeout:2});await admin?.end({timeout:2});}
