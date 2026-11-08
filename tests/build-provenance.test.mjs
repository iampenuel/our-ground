import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm,symlink,truncate} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeBuildEvidence,checkBuildEvidence,buildEvidenceName} from '../backend/build-provenance.mjs';
const env={SUPABASE_URL:'https://stagingfixtureproject.supabase.co',VITE_SUPABASE_URL:'https://stagingfixtureproject.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_only_fixture',VITE_GEOAPIFY_BROWSER_KEY:'public-browser-only-fixture',VITE_ACCOUNT_ALLOWED_ORIGINS:'https://stage.example.invalid'};
async function fixture(run){const dir=await mkdtemp(join(tmpdir(),'ourground build proof '));try{await writeFile(join(dir,'index.html'),'<script src="/app.js"></script>');await writeFile(join(dir,'app.js'),'/* explicit synthetic artifact */');await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('actual build evidence binds matching public configuration and assets without storing key values',()=>fixture(async dir=>{
 const evidence=await writeBuildEvidence(dir,env);assert.equal((await checkBuildEvidence(dir,env)).status,'PASS');assert.equal(Object.keys(evidence.assets).length,2);assert(!JSON.stringify(evidence).includes(env.VITE_SUPABASE_PUBLISHABLE_KEY));assert(!JSON.stringify(evidence).includes(env.VITE_GEOAPIFY_BROWSER_KEY));
}));
test('stale Auth project, public key, map key and redirect configuration cannot pass actual artifact preflight',()=>fixture(async dir=>{
 await writeBuildEvidence(dir,env);
 for(const patch of [{SUPABASE_URL:'https://anotherfixtureproject.supabase.co',VITE_SUPABASE_URL:'https://anotherfixtureproject.supabase.co'},{VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_changed_fixture'},{VITE_GEOAPIFY_BROWSER_KEY:'different-public-browser-fixture'},{VITE_ACCOUNT_ALLOWED_ORIGINS:'https://different.example.invalid'},{VITE_API_BASE_URL:'https://different.example.invalid/api/v1'}])assert.equal((await checkBuildEvidence(dir,{...env,...patch})).status,'FAIL');
}));
test('changed or added bundle content and missing evidence cannot pass',()=>fixture(async dir=>{
 assert.equal((await checkBuildEvidence(dir,env)).status,'BLOCKED');await writeBuildEvidence(dir,env);await writeFile(join(dir,'app.js'),'/* changed after approval */');assert.equal((await checkBuildEvidence(dir,env)).status,'FAIL');await writeBuildEvidence(dir,env);await writeFile(join(dir,'late.js'),'/* late asset */');assert.equal((await checkBuildEvidence(dir,env)).status,'FAIL');
}));
test('fixture builds, symlink assets and oversized evidence inputs fail closed',()=>fixture(async dir=>{
 await writeBuildEvidence(dir,env,'local-fixture');assert.equal((await checkBuildEvidence(dir,env)).status,'FAIL');await rm(join(dir,buildEvidenceName));await symlink(join(dir,'app.js'),join(dir,'linked.js'));await assert.rejects(writeBuildEvidence(dir,env),/symlinks/);await rm(join(dir,'linked.js'));await writeFile(join(dir,'oversized.js'),'');await truncate(join(dir,'oversized.js'),17*1024*1024);await assert.rejects(writeBuildEvidence(dir,env),/bounds/);
}));
