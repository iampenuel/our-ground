import assert from 'node:assert/strict';
import {test} from 'node:test';
import {safeReturnPath,safeWebUrl,contactActions,searchUrl} from '../src/directory.ts';
import {developmentTarget} from '../backend/db-target.mjs';
import {spawnSync} from 'node:child_process';

test('resource links retain search filters without allowing external return destinations',()=>{
  const path=searchUrl('food','Harrisburg',10,'grocery & meals',2,'map');
  const query=new URL(path,'https://our-ground.invalid').searchParams;
  assert.equal(query.get('radius_miles'),'10'); assert.equal(query.get('q'),'grocery & meals'); assert.equal(query.get('page'),'2');
  assert.equal(safeReturnPath(path),path);
  for(const candidate of ['https://attacker.invalid/support','//attacker.invalid/support','javascript:alert(1)','/account']) assert.equal(safeReturnPath(candidate),'/support');
});
test('fictional records cannot expose contact actions and unsafe sourced URLs are rejected',()=>{
  const record={data_kind:'fictional_demo',contact:{phone:'+1 555 010 0000',website_url:'https://example.org',directions_url:'https://maps.google.com'}};
  assert.deepEqual(contactActions(record),{phone:null,website:null,directions:null});
  assert.equal(safeWebUrl('javascript:alert(1)'),null); assert.equal(safeWebUrl('https://user:password@example.org'),null);
  assert.equal(safeWebUrl('https://example.org/'),'https://example.org/');
});
test('database tools refuse mismatched targets and never infer a project from a password',()=>{
  const ref='abcdefghijklmnopqrst';
  const env={SUPABASE_DEV_PROJECT_REF:ref,SUPABASE_URL:'https://'+ref+'.supabase.co'};
  assert.equal(developmentTarget('postgresql://postgres.'+ref+':REPLACE_ME_TEST_PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres',env).ref,ref);
  assert.throws(()=>developmentTarget('postgresql://postgres.differentproject:REPLACE_ME_TEST_PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres',env));
  assert.throws(()=>developmentTarget('postgresql://postgres.'+ref+':REPLACE_ME_TEST_PASSWORD@attacker.invalid/postgres',env));
  assert.throws(()=>developmentTarget('postgresql://postgres:REPLACE_ME_TEST_PASSWORD@db.'+ref+'.supabase.co/postgres',{...env,SUPABASE_URL:'https://another.supabase.co'}));
});
test('browser environment guard rejects private credentials without printing their value',()=>{
  const value='postgresql://fixture:private-placeholder@invalid/test';
  const result=spawnSync(process.execPath,['backend/check-env.mjs','--public-only'],{encoding:'utf8',env:{...process.env,VITE_DATABASE_URL:value}});
  assert.equal(result.status,1); assert.match(result.stderr,/VITE_DATABASE_URL/); assert.equal((result.stdout+result.stderr).includes(value),false);
});
