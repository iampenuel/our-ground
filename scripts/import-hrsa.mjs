import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {normalizeHrsaCsv,importHrsa,HRSA_SOURCE} from '../backend/hrsa-import.mjs';
import {developmentTarget} from '../backend/db-target.mjs';
import {databaseTls} from '../backend/database-security.ts';

const args=process.argv.slice(2);let sql;
function option(name){const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+name);return args[i+1];}
async function download(){
  const response=await fetch(HRSA_SOURCE.download,{signal:AbortSignal.timeout(60000),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length'))>32*1024*1024)throw Error('Official HRSA download is unavailable or exceeds the configured limit.');
  const reader=response.body?.getReader();if(!reader)throw Error('Official HRSA response was empty.');const chunks=[];let bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32*1024*1024)throw Error('Official HRSA download exceeds the configured limit.');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  return Buffer.concat(chunks).toString('utf8');
}
try{
  const file=option('--file');if(Boolean(file)===args.includes('--download'))throw Error('Choose --file <reviewed CSV> or --download (one official HRSA request, no retries).');
  const dataset=normalizeHrsaCsv(file?await readFile(file,'utf8'):await download());
  const apply=args.includes('--apply');
  if(apply){
    if(process.env.NODE_ENV==='production'||process.env.VERCEL)throw Error('This importer does not apply changes in a production runtime. Review an owner-run nonproduction import first.');
    const connection=process.env.HRSA_IMPORT_DATABASE_URL;if(!connection)throw Error('Set HRSA_IMPORT_DATABASE_URL for an explicitly selected nonproduction owner connection.');
    const u=new URL(connection);let ssl;
    if(args.includes('--local-test-target')){
      if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/ourground_7d[a-z0-9_]*$/.test(u.pathname)||decodeURIComponent(u.username)==='our_ground_api')throw Error('Local import requires a disposable loopback ourground_7d* database and its owner role.');
      ssl=false;
    }else{
      if(!args.includes('--development-target'))throw Error('Apply requires --local-test-target or --development-target. Production import is a separate owner-controlled operation.');
      developmentTarget(connection);ssl=databaseTls(process.env,connection);
    }
    sql=postgres(connection,{max:1,prepare:false,ssl,connect_timeout:10,onnotice:()=>{}});
    const [role]=await sql`select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    if(role.name==='our_ground_api')throw Error('Use the reviewed migration owner; never grant import privileges to the runtime role.');
  }
  const summary=await importHrsa(sql,dataset,{apply,fullSnapshot:args.includes('--full-snapshot')});
  console.log(JSON.stringify(summary,null,2));
  console.log(apply?'Controlled nonproduction import completed. Imported records remain explicitly unverified.':'Dry-run only: no database connection or writes. Review counts, exclusions and the source date before --apply.');
}catch(error){console.error(error instanceof Error&&!('severity' in error)&&!('syscall' in error)&&!('cause' in error)?error.message:'HRSA import failed safely. No partial import transaction was committed; inspect local configuration and the reviewed source file.');process.exitCode=1;}
finally{await sql?.end();}
