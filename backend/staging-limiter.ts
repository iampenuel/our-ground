import {createHmac} from 'node:crypto';
import postgres from 'postgres';
import {runtimeDatabaseConfiguration} from './database-security.ts';

type Env=Record<string,string|undefined>;
export const stagingProjectId='prj_eU9xRSetSQYTbkAce2cYIR5zx8c2', stagingRef='hrmocmvdmshoghclxyjs';
// The designated Preview may never fall back to Redis, even if someone accidentally
// copies credentials or omits the backend selector. Other projects keep their Redis path.
export function requiresStagingAdmission(env:Env){
 return env.VERCEL_PROJECT_ID===stagingProjectId&&env.VERCEL_ENV==='preview'||Boolean(env.RATE_LIMIT_BACKEND && env.RATE_LIMIT_BACKEND!=='redis');
}
export function stagingLimitConfig(env:Env){
 if(env.RATE_LIMIT_BACKEND!=='postgres-staging'||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!==stagingProjectId
   ||env.SUPABASE_DEV_PROJECT_REF!==stagingRef||env.SUPABASE_URL!=='https://'+stagingRef+'.supabase.co'||env.MIGRATION_DATABASE_URL
   ||env.UPSTASH_REDIS_REST_TOKEN||env.UPSTASH_REDIS_REST_URL||env.DB_SSL==='disable'||!env.DATABASE_SSL_CA
   ||!env.STAGING_RATE_LIMIT_SECRET||!/^[a-f0-9]{64}$/.test(env.STAGING_RATE_LIMIT_SECRET))throw Error('Invalid staging admission configuration');
 const config=runtimeDatabaseConfiguration(env),url=new URL(config.connection);
 if(!url.hostname.endsWith('.pooler.supabase.com')||url.port!=='6543'||url.pathname!=='/postgres'||url.username!=='our_ground_api.'+stagingRef||url.search||url.hash)throw Error('Invalid staging runtime target');
 return config;
}
export function stagingReceiptSecret(env:Env){
 try{stagingLimitConfig(env);return createHmac('sha256',env.STAGING_RATE_LIMIT_SECRET!).update('ourground:location-receipts:v1').digest('hex');}catch{return '';}
}
// Every caller has only a bounded number of anonymous slots. Collisions share a stricter
// limit; the database never receives a network address, a stable digest or request content.
export function stagingClientSlot(secret:string,network:string){return createHmac('sha256',secret).update('ourground:staging-admission:v1\0'+network).digest()[0]!;}
export function createStagingAdmission(env:Env){
 let client:ReturnType<typeof postgres>|undefined, queue:Promise<void>=Promise.resolve(), waiting=0;
 return {async take(action:string,network:string,budget:number,warning:number,signal?:AbortSignal){
   const config=stagingLimitConfig(env);signal?.throwIfAborted();
   if(waiting>=24)throw Error('Admission queue full');
   const slot=stagingClientSlot(env.STAGING_RATE_LIMIT_SECRET!,network);
   const deadline=Date.now()+2500;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
   waiting++;
   const work=queue.then(async()=>{
     if(expired||Date.now()>=deadline)throw Error('Admission expired');signal?.throwIfAborted();
     client??=postgres(config.connection,{max:1,prepare:false,ssl:config.ssl,connect_timeout:2,idle_timeout:10,onnotice:()=>{}});
     const rows=await client.begin('isolation level read committed',async tx=>{
       await tx`set local statement_timeout='1600ms'`;await tx`set local lock_timeout='1000ms'`;
       if(expired||Date.now()>=deadline)throw Error('Admission expired');signal?.throwIfAborted();
       return tx`select allowed,retry_s,warn from eden_staging_limits.admit(${action},${slot},${budget},${warning})`;
     });
     const row=rows[0];if(rows.length!==1||typeof row?.allowed!=='boolean'||typeof row.warn!=='boolean'||!Number.isInteger(row.retry_s)||row.retry_s<0||row.retry_s>86400||(row.allowed?row.retry_s!==0:row.retry_s===0))throw Error('Invalid admission reply');
     if(row.warn)console.warn(JSON.stringify({event:'staging_provider_budget_warning'}));
     return {allowed:row.allowed,retry:Number(row.retry_s)};
   }).finally(()=>{waiting--;});queue=work.then(()=>{},()=>{});
   try{const result=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Admission expired'));},2500);})]);signal?.throwIfAborted();return result;}finally{clearTimeout(timer);}
 },async close(){await queue;await client?.end({timeout:2});}};
}
const instances=new WeakMap<Env,ReturnType<typeof createStagingAdmission>>();
export function stagingAdmission(env:Env){let instance=instances.get(env);if(!instance){instance=createStagingAdmission(env);instances.set(env,instance);}return instance;}
