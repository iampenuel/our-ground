import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {browserSecurityHeaders,documentBoundaryPolicy,isPrivateDocumentPath,privateCacheHeaders,privateDocumentHeaders,resourcePolicy} from '../shared/security-headers.ts';
import {applySecurityHeaders} from '../backend/security-headers.ts';
import {forbiddenSecretPath,secretFindings,scanRepository} from '../scripts/secret-scan.mjs';

test('API security headers apply to denial/error responses and preserve rate-limit recovery',async()=>{
  const req=new Request('https://ourground.vercel.app/api/v1/org/admin');
  const response=applySecurityHeaders(Response.json({error:{code:'RATE_LIMITED',message:'Wait.'}},{status:429,headers:{'Retry-After':'60','Vary':'Accept'}}),req);
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(response.headers.get('Vercel-CDN-Cache-Control'),'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');assert.match(response.headers.get('Vary'),/Authorization/);assert.match(response.headers.get('Vary'),/Origin/);assert.match(response.headers.get('Vary'),/Accept/);
  assert.deepEqual(await response.json(),{error:{code:'RATE_LIMITED',message:'Wait.'}});
  const existing=applySecurityHeaders(Response.json({private:true},{headers:{'Cache-Control':'no-store'}}),req);
  assert.equal(existing.headers.get('Cache-Control'),'no-store');assert.equal(existing.headers.get('CDN-Cache-Control'),'no-store');
});
test('private HTML routes are uncachable while public assets retain their independent policy',()=>{
  for(const p of ['/account','/account/administration','/auth/callback','/staff/services/a'])assert(isPrivateDocumentPath(p));
  for(const p of ['/','/support','/privacy','/assets/account-abc.js','/accounting'])assert(!isPrivateDocumentPath(p));
  assert.match(privateCacheHeaders['Cache-Control'],/no-store/);
  assert(!browserSecurityHeaders().hasOwnProperty('Cache-Control'));
  assert(!browserSecurityHeaders().hasOwnProperty('Strict-Transport-Security'));
});
test('resource CSP is enforced and excludes remote scripts, wildcard hosts, eval and inline markup',()=>{
  const h=browserSecurityHeaders(),policy=h['Content-Security-Policy'];
  assert.equal(policy,resourcePolicy());assert.equal(h['Content-Security-Policy-Report-Only'],undefined);
  assert(policy.includes(documentBoundaryPolicy));assert.match(policy,/worker-src 'self' blob:/);
  assert.match(policy,/connect-src 'self' https:\/\/api\.geoapify\.com https:\/\/maps\.geoapify\.com/);
  for(const unused of ['mapbox.com','googleapis.com','gstatic.com','supabase.co',"'unsafe-eval'","'wasm-unsafe-eval'","'unsafe-inline'",'https:;','*'])assert(!policy.includes(unused),unused);
  assert.match(policy,/script-src-attr 'none'/);assert.match(policy,/style-src-elem 'self';/);assert.match(policy,/style-src-attr 'none'/);assert.match(policy,/frame-src 'none'/);
  assert.equal(h['Referrer-Policy'],'strict-origin-when-cross-origin');
  assert.match(h['Permissions-Policy'],/geolocation=\(self\)/);assert(!h['Permissions-Policy'].includes('geolocation=*'));assert.match(h['Permissions-Policy'],/camera=\(\)/);
});
test('CSP rejects injected origins and grants only one exact configured Auth fetch origin',()=>{
  for(const origin of ['https://attacker.invalid','https://project.supabase.co/path',"https://project.supabase.co; script-src *",'http://127.0.0.1:18789','https://exampleproject.supabase.co\nX-Evil: yes','https://*.supabase.co','https://user:pass@exampleproject.supabase.co','https://exampleproject.supabase.co:444'])assert.equal(resourcePolicy(origin),resourcePolicy());
  const selected=resourcePolicy('https://exampleproject.supabase.co');assert(selected.includes('https://exampleproject.supabase.co'));assert(!selected.includes('https://*.supabase.co'));assert(!selected.includes('wss:'));
  const dev=resourcePolicy('http://127.0.0.1:18789',true);assert(dev.includes('http://127.0.0.1:18789'));assert(dev.includes('ws://127.0.0.1:*'));assert(dev.includes("style-src-elem 'self' 'unsafe-inline'"));
  assert(!resourcePolicy().includes('ws:'));assert(!resourcePolicy().includes("'unsafe-inline'"));
  const isolatedFixture=browserSecurityHeaders({authOrigin:'http://127.0.0.1:18789',fixtureAuth:true})['Content-Security-Policy'];assert(isolatedFixture.includes('http://127.0.0.1:18789'));assert(!isolatedFixture.includes('ws:'));assert(!isolatedFixture.includes("'unsafe-inline'"));
});
test('Vercel configuration has equivalent future security controls and no-store private paths',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const global=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
  assert.deepEqual(global,browserSecurityHeaders({https:true}));
  for(const route of ['/account','/account/:path*','/staff/:path*','/auth/:path*','/api/:path*']){const h=config.headers.find(x=>x.source===route);assert(h);assert.deepEqual(Object.fromEntries(h.headers.map(x=>[x.key,x.value])),privateDocumentHeaders);}
  assert.equal(config.git.deploymentEnabled,false);
});
test('secret detection reports positions without returning credential text',()=>{
  const fake='test-only-'+Array(35).fill('q').join(''),privateKey='-----BEGIN '+'PRIVATE KEY-----';
  const result=secretFindings('first line\n'+fake+'\n'+privateKey,[fake]);
  assert(result.some(x=>x.rule==='configured-server-secret'&&x.line===2));assert(result.some(x=>x.rule==='private-key'&&x.line===3));
  assert(!JSON.stringify(result).includes(fake));assert(!JSON.stringify(result).includes(privateKey));
  const jwt=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'signedfixture'].join('.');
  assert(secretFindings(jwt).some(x=>x.rule==='supabase-service-role-jwt'));
  const publicGoogle='AI'+'za'+Array(35).fill('Q').join('');
  assert.equal(secretFindings(publicGoogle,[],[publicGoogle]).length,0);
  assert(secretFindings(publicGoogle,[publicGoogle],[publicGoogle]).some(x=>x.rule==='configured-server-secret'));
  const localDb='postgres://staff:'+['real-local','password-3847'].join('-')+'@localhost:5432/application';
  assert(secretFindings(localDb).some(x=>x.rule==='database-password-url'));
  const shortLocal='postgres://staff:'+String.fromCharCode(120)+'@localhost:5432/application';
  assert(secretFindings(shortLocal).some(x=>x.rule==='database-password-url'));
  assert(!JSON.stringify(secretFindings(shortLocal)).includes(shortLocal));
  const tokenWithHostWord='secret-localhost-token-3847';assert(secretFindings(tokenWithHostWord,[tokenWithHostWord]).some(x=>x.rule==='configured-server-secret'));
  assert(!JSON.stringify(secretFindings(localDb)).includes('real-local-password-3847'));
  assert(forbiddenSecretPath('.env.production'));assert(forbiddenSecretPath('nested/.env.local'));assert(!forbiddenSecretPath('.env.example'));
});
test('staged secret scan inspects staged blobs even when the working file has been cleaned',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ourground-secret-scan-'));
  try{
    execFileSync('git',['init','--quiet',dir]);
    const p=path.join(dir,'config.txt'),marker='-----BEGIN '+'PRIVATE KEY-----';
    fs.writeFileSync(p,marker);execFileSync('git',['add','config.txt'],{cwd:dir});fs.writeFileSync(p,'clean working copy');
    const staged=scanRepository(dir,{staged:true});assert(staged.findings.some(x=>x.rule==='private-key'));
    assert.equal(scanRepository(dir).findings.length,0);
    fs.writeFileSync(path.join(dir,'.env.production'),'');execFileSync('git',['add','.env.production'],{cwd:dir});assert(scanRepository(dir,{staged:true}).findings.some(x=>x.rule==='private-configuration-file'));
    const oid=execFileSync('git',['rev-parse',':config.txt'],{cwd:dir,encoding:'utf8'}).trim();fs.unlinkSync(path.join(dir,'.git/objects',oid.slice(0,2),oid.slice(2)));
    assert.throws(()=>scanRepository(dir,{staged:true}),/selected scan input could not be read/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
