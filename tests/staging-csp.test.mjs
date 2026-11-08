import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exactBuildAuthOrigin,renderVercelSecurityConfig,vercelSecurityConfigProblems} from '../backend/staging-csp.ts';
import {resourcePolicy} from '../shared/security-headers.ts';
const auth='https://stagefixtureproject.supabase.co';
const base=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('reviewed candidate config grants exactly the build Auth host and preserves routing/private boundaries',()=>{
  const config=renderVercelSecurityConfig(base,auth);
  assert.deepEqual(vercelSecurityConfigProblems(config,auth),[]);assert.deepEqual(config.rewrites,base.rewrites);assert.equal(config.git.deploymentEnabled,false);
  const policy=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
  assert.equal(policy,resourcePolicy(auth));assert(!policy.includes('*.supabase.co'));assert(!JSON.stringify(config).includes('publishable_'));
});
test('security config validation rejects wildcard/other Auth hosts, report-only substitution and private override',()=>{
  for(const change of [c=>{c.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value=resourcePolicy('https://otherfixtureproject.supabase.co');},c=>{c.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value+='; connect-src *';},c=>{c.headers[0].headers.find(h=>h.key==='Content-Security-Policy').key='Content-Security-Policy-Report-Only';},c=>{c.headers[1].headers.find(h=>h.key==='Referrer-Policy').value='unsafe-url';},c=>{c.headers.push({source:'/support',headers:[{key:'Content-Security-Policy',value:'default-src *'}]});},c=>{c.git.deploymentEnabled=true;}]){
    const config=renderVercelSecurityConfig(base,auth);change(config);assert(vercelSecurityConfigProblems(config,auth).length>0);
  }
});
test('build Auth origin is validated and must agree between server, browser and generated policy',()=>{
  assert.equal(exactBuildAuthOrigin({}),undefined);assert.equal(exactBuildAuthOrigin({VITE_SUPABASE_URL:auth+'/',SUPABASE_URL:auth}),auth);
  for(const env of [{VITE_SUPABASE_URL:auth,SUPABASE_URL:'https://otherfixtureproject.supabase.co'},{VITE_SUPABASE_URL:'https://attacker.invalid'},{SUPABASE_URL:auth+'/path'},{VITE_SUPABASE_URL:'http://127.0.0.1:18789'},{VITE_SUPABASE_URL:auth+'\nX-Injected: yes'}])assert.throws(()=>exactBuildAuthOrigin(env));
  assert.throws(()=>renderVercelSecurityConfig(base,'https://*.supabase.co'));
});
test('local renderer writes a reviewable nonsecret separate config and refuses overwrite/mismatched build target',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ourground-csp-config-'));
  try{
    const target=path.join(dir,'target.json'),output=path.join(dir,'vercel.candidate.json');
    fs.writeFileSync(target,JSON.stringify({schema_version:1,supabase:{project_ref:'stagefixtureproject'}}));
    const script=new URL('../scripts/render-staging-csp.mjs',import.meta.url),cwd=new URL('..',import.meta.url);
    const result=execFileSync(process.execPath,[fileURLToPath(script),'--target',target,'--output',output],{cwd,env:{PATH:process.env.PATH},encoding:'utf8'});
    assert.equal(JSON.parse(result).network_requests,0);assert.equal(JSON.parse(result).deployment_authorized,false);assert.deepEqual(vercelSecurityConfigProblems(JSON.parse(fs.readFileSync(output,'utf8')),auth),[]);
    assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(script),'--target',target,'--output','vercel.json'],{cwd,env:{PATH:process.env.PATH},stdio:'pipe'}));
    assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(script),'--target',target,'--output',path.join(dir,'mismatch.json')],{cwd,env:{PATH:process.env.PATH,VITE_SUPABASE_URL:'https://otherfixtureproject.supabase.co'},stdio:'pipe'}));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
