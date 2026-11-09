import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {exactBuildAuthOrigin} from './staging-csp.ts';

export const buildEvidenceName='ourground-build-evidence.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** Public configuration only. Keys are fingerprinted, never copied into evidence. */
export function buildPublicDescriptor(env,mode='production') {
 return {
  mode,public_environment_sha256:hash(JSON.stringify(Object.entries(env).filter(([key,value])=>key.startsWith('VITE_')&&value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0))),fixture:mode==='local-fixture'||['VITE_ACCOUNT_LOCAL_FIXTURE','VITE_LOCAL_FIXTURE_BUILD','LOCAL_FIXTURE_BUILD'].some(key=>env[key]==='true'),
  auth_origin:exactBuildAuthOrigin(env)??null,
  browser_auth_enabled:Boolean(env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_PUBLISHABLE_KEY),
  auth_key_sha256:env.VITE_SUPABASE_PUBLISHABLE_KEY?hash(env.VITE_SUPABASE_PUBLISHABLE_KEY):null,
  browser_geoapify_key_sha256:env.VITE_GEOAPIFY_BROWSER_KEY?hash(env.VITE_GEOAPIFY_BROWSER_KEY):null,
  account_origins:(env.VITE_ACCOUNT_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean).sort()
 };
}
async function assetHashes(directory) {
 const root=resolve(directory),files={};let bytes=0,count=0;
 if(!(await lstat(root)).isDirectory())throw Error('Build directory required.');
 async function walk(dir,prefix='') {
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const name=prefix+entry.name,full=join(dir,entry.name),stat=await lstat(full);
   if(stat.isSymbolicLink())throw Error('Build evidence cannot follow symlinks.');
   if(stat.isDirectory()){await walk(full,name+'/');continue;}
   if(name===buildEvidenceName)continue;
   if(!stat.isFile()||++count>1024||stat.size>16*1024*1024||(bytes+=stat.size)>64*1024*1024)throw Error('Build evidence asset bounds exceeded.');
   files[name]=hash(await readFile(full));
  }
 }
 await walk(root);if(!Object.keys(files).some(x=>x.endsWith('.html'))||!Object.keys(files).some(x=>x.endsWith('.js')))throw Error('Complete Vite build required.');
 return files;
}
/** Called after Vite writes the complete bundle, including copied public assets. */
export async function writeBuildEvidence(directory,env,mode='production') {
 // Local fixture builds may use an explicit loopback Auth endpoint. They are
 // deliberately stamped as fixtures and can never pass the staging guard.
 const config=mode==='local-fixture'?{mode,fixture:true}:buildPublicDescriptor(env,mode);
 let commit=env.VERCEL_GIT_COMMIT_SHA;
 if(!commit){
   try{commit=execFileSync('git',['rev-parse','--verify','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
 }
 const evidence={schema_version:1,source_commit:/^[a-f0-9]{40}$/.test(commit??'')?commit:null,public_config:config,assets:await assetHashes(directory)};
 await writeFile(join(directory,buildEvidenceName),JSON.stringify(evidence,null,2)+'\n');
 return evidence;
}
/** Accidental-stale-artifact protection, not a signature or deployment permission. */
export async function checkBuildEvidence(directory,env) {
 try {
  const raw=await readFile(join(directory,buildEvidenceName),'utf8');if(raw.length>256*1024)return {status:'FAIL',reason:'BUILD_EVIDENCE_INVALID'};
  const evidence=JSON.parse(raw),expected=buildPublicDescriptor(env);
  if(evidence.schema_version!==1||JSON.stringify(evidence.public_config)!==JSON.stringify(expected)||expected.fixture)return {status:'FAIL',reason:'BUILD_CONFIGURATION_MISMATCH'};
  const current=await assetHashes(directory);
  if(!Object.hasOwn(current,'index.html')||JSON.stringify(evidence.assets)!==JSON.stringify(current))return {status:'FAIL',reason:'BUILD_ASSETS_CHANGED'};
  return {status:'PASS',asset_count:Object.keys(current).length};
 }catch(error){return {status:error?.code==='ENOENT'?'BLOCKED':'FAIL',reason:'BUILD_EVIDENCE_UNAVAILABLE'};}
}
