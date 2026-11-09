// A comparison worker may fetch public feeds and read a private inventory. It never connects to PostgreSQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HRSA_SOURCE,normalizeHrsaCsv} from '../../backend/hrsa-import.mjs';
import {FOOD_SOURCES,downloadFoodSnapshot,normalizeFoodSnapshot,validateFoodCoordinates} from '../../backend/food-import.mjs';
import {reviewFeed,disposition,policies} from './pa-review.mjs';
const root=resolve('tmp/pa-maintenance');
function read(file){assert(resolve(file).startsWith(root+'/')&&fs.realpathSync(file)===resolve(file)&&!(fs.lstatSync(file).mode&0o077),'Expected private inventory/plan inside tmp/pa-maintenance');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function download(url,max){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000),cache:'no-store'});assert(response.ok&&response.body,'Publisher unavailable');const parts=[];let n=0;
 for await(const b of response.body){n+=b.length;assert(n<=max,'Publisher response exceeds limit');parts.push(b);}return Buffer.concat(parts).toString('utf8');}
async function feed(id,refs){
 if(id==='hrsa-health-centers')return normalizeHrsaCsv(await download(HRSA_SOURCE.download,32*1024*1024));
 const source=FOOD_SOURCES[id],countUrl=source.download.split('?')[0]+'?where=1%3D1&returnCountOnly=true&f=json';
 const [bundle,before]=await Promise.all([downloadFoodSnapshot(id),download(countUrl,16384)]);
 const [meta,after]=await Promise.all([download(source.metadata,2*1024*1024),download(countUrl,16384)]);
 const n=bundle.data.features.length;assert(n===JSON.parse(before).count&&n===JSON.parse(after).count&&JSON.parse(meta).editingInfo.dataLastEditDate===bundle.metadata.editingInfo.dataLastEditDate,'Philadelphia changed during pagination; retry');
 return validateFoodCoordinates(normalizeFoodSnapshot(id,bundle),refs);
}
async function main(){
 assert(!process.env.VERCEL&&process.env.NODE_ENV!=='production');const [mode,file,...args]=process.argv.slice(2);
 if(mode==='review'){assert(args.length===3);const plan=read(file),r=disposition(plan,...args,new Date().toISOString());
  const path=join(dirname(resolve(file)),plan.source+'-'+r.id+'-'+Date.now()+'.review.json');fs.writeFileSync(path,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});console.log(path);return;}
 assert(mode==='check'&&!args.length,'Usage: check INVENTORY or review PLAN ID DISPOSITION STEWARD');const inv=read(file);assert(inv.ref==='hrmocmvdmshoghclxyjs'&&inv.references.length===1);
 const dir=fs.mkdtempSync(join(root,'check-'));const summary={checkedAt:new Date().toISOString(),mode:'read-only',sources:[]};
 for(const source of Object.keys(policies)){
  let phase='publisher download, normalization or coordinate validation';
  try{const dataset=await feed(source,inv.references);phase='inventory comparison';const plan=reviewFeed({...inv.sources[source],source,capturedAt:inv.capturedAt},dataset,new Date().toISOString());
   phase='local receipt write';fs.writeFileSync(join(dir,source+'.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
   const {events,...aggregate}=plan;summary.sources.push({...aggregate,queued:events.length});
   if((events.length||plan.warnings.length)&&!process.exitCode)process.exitCode=2;
  }catch(e){summary.sources.push({source,error:'No publishable comparison; investigate',phase,code:e.code??e.name});process.exitCode=1;}
 }
 fs.writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});console.log(dir);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Comparison stopped:',e.code??e.name);process.exitCode=1;});
