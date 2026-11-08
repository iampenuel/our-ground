import {readFile,writeFile} from 'node:fs/promises';
import postgres from 'postgres';
import {FOOD_SOURCES,downloadFoodSnapshot,normalizeFoodSnapshot,validateFoodGeography,importFood} from '../backend/food-import.mjs';

// Owner-run only. No HTTP ingestion endpoint, implicit environment target or
// automatic schedule. Apply currently supports the explicitly reviewed clone.
const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;
const allowed=new Set(['--source','--file','--download','--save','--apply','--full-snapshot','--local-test-target','--validate-geography']);
let sql;
try{
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('Unknown food import option.');if(['--source','--file','--save'].includes(args[i])){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Food import option requires a value.');i++;}}
 const id=value('--source'),file=value('--file');if(!FOOD_SOURCES[id]||Boolean(file)===args.includes('--download'))throw Error('Select a reviewed --source and exactly one of --file or --download.');
 const text=file?await readFile(file,'utf8'):JSON.stringify(await downloadFoodSnapshot(id));
 if(value('--save'))await writeFile(value('--save'),text,{mode:0o600,flag:'wx'});
 let dataset=normalizeFoodSnapshot(id,text);const apply=args.includes('--apply');
 if(apply||args.includes('--validate-geography')){
  const connection=process.env.FOOD_IMPORT_DATABASE_URL;let target;try{target=new URL(connection);}catch{throw Error('Apply requires explicit FOOD_IMPORT_DATABASE_URL.');}
  if(!args.includes('--local-test-target')||process.env.VERCEL||process.env.NODE_ENV==='production'||!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!=='127.0.0.1'||target.port!=='18790'||!['/ourground_final','/ourground_discovery_final'].includes(target.pathname)||decodeURIComponent(target.username)!=='ourground_test')throw Error('Apply is restricted to the reviewed isolated local owner targets.');
  if(id==='pgc-food-assistance'&&target.pathname!=='/ourground_discovery_final')throw Error('The new Maryland source is authorized only for ourground_discovery_final.');
  sql=postgres(connection,{ssl:false,max:1,prepare:false,connect_timeout:5,onnotice:()=>{}});
  const [actual]=await sql`select current_database() as database,current_user as role`;if(!['ourground_final','ourground_discovery_final'].includes(actual.database)||actual.role!=='ourground_test')throw Error('The database identity did not match the approved local clone.');
 }
 if(args.includes('--validate-geography'))dataset=await validateFoodGeography(sql,dataset);
 const result=await importFood(sql,dataset,{apply,fullSnapshot:args.includes('--full-snapshot')});
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error instanceof Error&&!('severity'in error)&&!('syscall'in error)?error.message:'Food import failed safely. Inspect the reviewed local source schema and owner connection; no credentials are shown.');process.exitCode=1;}finally{await sql?.end();}
