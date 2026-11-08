// Operator-run, bounded national release import. No URL comes from the browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import postgres from 'postgres';
import {databaseTls} from '../backend/database-security.ts';
import {developmentTarget} from '../backend/db-target.mjs';
import {importHrsa,normalizeHrsaCsv,sha256} from '../backend/hrsa-import.mjs';
import {importFood,normalizeFoodSnapshot,validateFoodGeography} from '../backend/food-import.mjs';

import {normalizeHud,importHud} from '../backend/hud-import.mjs';

const [folder, target='plan', approval]=process.argv.slice(2);
assert(folder && ['plan','rehearse','protected-staging'].includes(target));
const file=name=>readFile(resolve(folder,name),'utf8');
const hrsa=normalizeHrsaCsv(await file('latest.csv'));
const food=await Promise.all(['seattle-food-resources','pgc-food-assistance'].map(async id=>normalizeFoodSnapshot(id,await file(id+'.json'))));
const hud=normalizeHud(await file('hud-response'),(await file('hud-captured.txt')).trim());
const inputs=[hrsa,...food,hud];
const fingerprint=sha256(inputs.map(x=>x.checksum).join('\n'));
console.log(JSON.stringify({fingerprint,sources:inputs.map(x=>({source:x.source.id,date:x.source_updated_at,checksum:x.checksum,...x.summary}))}));
if(target==='plan')process.exit(0);
assert(approval===fingerprint && !process.env.VERCEL && process.env.NODE_ENV!=='production','Review the exact snapshot fingerprint before applying.');
let url='postgresql://postgres@127.0.0.1:19473/ourground_rc_drill',ssl=false;
if(target==='protected-staging'){
  const env=parseEnv(await readFile('.env.eden08-owner.local','utf8'));
  url=env.MIGRATION_DATABASE_URL;
  const db=new URL(url);
  assert(developmentTarget(url,env).ref==='hrmocmvdmshoghclxyjs' && db.hostname==='aws-0-us-east-1.pooler.supabase.com' && db.username==='postgres.hrmocmvdmshoghclxyjs' && db.port==='5432' && db.pathname==='/postgres');
  ssl=databaseTls(env,url);
  assert(ssl.ca && ssl.rejectUnauthorized);
}
const sql=postgres(url,{max:1,ssl,prepare:false,connect_timeout:8,onnotice:()=>{}});
try{
  const [before]=await sql`select current_database() db,current_user as owner,pg_database_size(current_database())::int as bytes`;
  assert(before.owner==='postgres' && before.db===(target==='protected-staging'?'postgres':'ourground_rc_drill') && before.bytes<350_000_000);
  for(const migration of ['017_community_search.sql','018_hud_counselors.sql','019_census_city_aliases.sql']){
  const ddl=await readFile(new URL('../backend/migrations/'+migration,import.meta.url),'utf8');
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('our-ground-schema-migration'))`;
    const existing=await tx`select sha256 from our_ground_meta.migrations where name=${migration}`;
    if(existing.length){assert.equal(existing[0].sha256,sha256(ddl));return;}
    assert((await tx`select name from our_ground_meta.migrations where name='016_food_row_lineage.sql'`).length);
    await tx.unsafe(ddl);
    await tx`insert into our_ground_meta.migrations(name,sha256) values(${migration},${sha256(ddl)})`;
  });
  }
  const result=[await importHrsa(sql,hrsa,{apply:true,fullSnapshot:true})];
  for(const source of food){
    const dataset=await validateFoodGeography(sql,source);
    result.push(await importFood(sql,dataset,{apply:true,fullSnapshot:true}));
  }
  result.push(await importHud(sql,hud));
  const [after]=await sql`select pg_database_size(current_database())::int bytes`;
  console.log(JSON.stringify({target,before,after,result}));
}catch(e){console.error(e?.code??'IMPORT_CHECK_FAILED',e?.routine??'', e?.severity ? String(e.message).slice(0,160) : e?.message?.slice(0,160));process.exitCode=1;}
finally{await sql.end();}
