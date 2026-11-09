import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
import {GAZETTEER,unpackGazetteerZip,parseGazetteer,importGazetteer} from '../backend/gazetteer-import.mjs';
import {developmentTarget} from '../backend/db-target.mjs';
import {databaseTls} from '../backend/database-security.ts';
const args=process.argv.slice(2);let sql;
function option(name){const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+name);return args[i+1];}
async function download(kind){
 const response=await fetch(GAZETTEER.files[kind],{redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!response.ok||Number(response.headers.get('content-length'))>8*1024*1024)throw Error('Official Census source is unavailable or exceeds the archive limit.');
 const reader=response.body?.getReader();if(!reader)throw Error('Official Census source was empty.');const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw Error('Official Census source exceeds the archive limit.');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
try{
 const places=option('--places'),states=option('--states'),live=args.includes('--download');
 if(live&&(places||states)||!live&&(!places||!states))throw Error('Use --places <official ZIP> --states <official ZIP>, or --download for exactly two bounded official downloads.');
 const datasets=[];for(const kind of ['state','place']){const bytes=live?await download(kind):await readFile(kind==='state'?states:places);const checksum=createHash('sha256').update(bytes).digest('hex');datasets.push(parseGazetteer(kind,unpackGazetteerZip(bytes,kind),{archiveChecksum:checksum}));}
 const apply=args.includes('--apply');
 if(apply){
  if(process.env.NODE_ENV==='production'||process.env.VERCEL)throw Error('Geographic reference import cannot run in a production runtime.');
  const connection=process.env.GEOGRAPHIC_IMPORT_DATABASE_URL;if(!connection)throw Error('Set the explicitly approved nonproduction GEOGRAPHIC_IMPORT_DATABASE_URL owner connection.');
  const u=new URL(connection);let ssl;
  if(args.includes('--local-test-target')){
   if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/ourground_7d1[a-z0-9_]*$/.test(u.pathname)||decodeURIComponent(u.username)==='our_ground_api')throw Error('Local geographic imports require a new disposable loopback ourground_7d1* database and its owner.');ssl=false;
  }else{if(!args.includes('--development-target'))throw Error('Apply requires --local-test-target or an owner-approved --development-target.');developmentTarget(connection);ssl=databaseTls(process.env,connection);}
  sql=postgres(connection,{ssl,max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});const [role]=await sql`select current_user as name`;if(role.name==='our_ground_api')throw Error('Never grant geographic import privileges to the runtime role.');
 }
 console.log(JSON.stringify(await importGazetteer(sql,datasets,{apply}),null,2));
 console.log(apply?'Controlled geographic import completed. Representative points are not street addresses.':'Dry-run: no database connection or changes. No geography or HRSA records were published or overwritten.');
}catch(e){console.error(e instanceof Error&&!('severity' in e)&&!('syscall' in e)&&!('cause' in e)?e.message:'Geographic import failed safely; no partial import transaction was committed. Inspect source/configuration privately.');process.exitCode=1;}
finally{await sql?.end();}
