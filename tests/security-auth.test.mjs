import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {publicEnvironmentProblems} from '../backend/env-boundary.mjs';
import {createOrganizationAuth} from '../backend/organization-auth.ts';
import {authBuildProblems,exactAuthOrigins,googleCallbackCode,googleOAuthOptions,localFixtureRuntime,productionRuntime,validAuthConfiguration,withoutProviderCredentials} from '../shared/auth-security.ts';

const origin='https://ourground.vercel.app',url='https://abcdefghijklmnopqrst.supabase.co',key='sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';
const real={SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key,ACCOUNT_ALLOWED_ORIGINS:origin};
const fixture={SUPABASE_URL:'http://127.0.0.1:18789',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture',ACCOUNT_ALLOWED_ORIGINS:'http://127.0.0.1:18419',ACCOUNT_LOCAL_FIXTURE:'true',NODE_ENV:'development'};

test('production auth cannot activate a loopback/fixed-code fixture through environment overrides',()=>{
 for(const production of [{NODE_ENV:'production'},{VERCEL:'1',NODE_ENV:'development'},{VERCEL_ENV:'preview',NODE_ENV:'test'}]){
  const env={...fixture,...production};assert(productionRuntime(env));assert(!localFixtureRuntime(env));assert.equal(createOrganizationAuth(env).configured,false);
  assert.equal(createOrganizationAuth({...real,...production,ACCOUNT_LOCAL_FIXTURE:'true'}).configured,false);
 }
 assert.equal(createOrganizationAuth(fixture).configured,true);
 assert.equal(createOrganizationAuth({...fixture,ACCOUNT_LOCAL_FIXTURE:undefined}).configured,false);
 assert.equal(createOrganizationAuth({...real,NODE_ENV:'production'}).configured,true);
});
test('only the explicit local verification build permits synthetic auth and Vercel always rejects it',()=>{
 const env={VITE_SUPABASE_URL:fixture.SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:fixture.SUPABASE_PUBLISHABLE_KEY,LOCAL_FIXTURE_BUILD:'true'};
 assert(authBuildProblems(env,true).length);
 assert.deepEqual(authBuildProblems(env,true,true),[]);
 for(const hosted of [{VERCEL:'1'},{VERCEL_ENV:'production'},{VERCEL_ENV:'preview'}])assert(authBuildProblems({...env,...hosted},true,true).length);
 assert(authBuildProblems({...env,LOCAL_FIXTURE_BUILD:undefined},true,true).length);
 assert(authBuildProblems({...env,VITE_ACCOUNT_LOCAL_FIXTURE:'true'},true).length);
 assert.deepEqual(authBuildProblems({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key},true),[]);
});
test('normal build environment command fails closed before bundling synthetic credentials',()=>{
 const child=spawnSync(process.execPath,['backend/check-env.mjs','--public-only'],{cwd:process.cwd(),env:{...process.env,VITE_SUPABASE_URL:fixture.SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:fixture.SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL:fixture.SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:fixture.SUPABASE_PUBLISHABLE_KEY,NODE_ENV:'production'},encoding:'utf8',timeout:15000});
 assert.equal(child.status,1);assert.match(child.stderr,/authentication configuration/);assert(!child.stderr.includes(fixture.SUPABASE_PUBLISHABLE_KEY));
});
test('test-only authentication server refuses production runtime even when imported directly',()=>{
 for(const override of [{NODE_ENV:'production'},{NODE_ENV:'test',VERCEL:'1'},{NODE_ENV:'development',VERCEL_ENV:'preview'}]){
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import{startFixtureAuth}from'./tests/organization-auth-server.mjs';await startFixtureAuth({port:0});"],{env:{...process.env,...override},encoding:'utf8',timeout:10000});assert.notEqual(child.status,0);assert.match(child.stderr,/forbidden in production/);
 }
});
test('auth project endpoints and public keys reject arbitrary destinations, credentials and reserved keys',()=>{
 for(const bad of ['http://'+new URL(url).host,'https://auth.evil.invalid',url+':444',' '+url,'https://user:pass@abcdefghijklmnopqrst.supabase.co','https://abcdefghijklmnopqrst.supabase.co/auth','https://abcdefghijklmnopqrst.supabase.co?redirect=https://evil.invalid'])assert(!validAuthConfiguration(bad,key,false));
 for(const bad of ['sb_secret_private',fixture.SUPABASE_PUBLISHABLE_KEY,' '+key,key+' '])assert(!validAuthConfiguration(url,bad,false));
 assert.deepEqual(exactAuthOrigins('https://*.vercel.app'),[]);assert.deepEqual(exactAuthOrigins(origin+'/account'),[]);
});
test('Google PKCE uses the existing SDK with only identity scopes and a fixed callback',async()=>{
 const memory=new Map(),auth=createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);},removeItem:k=>{memory.delete(k);}}}}).auth;
 const options=googleOAuthOptions(origin,[origin],true),{data,error}=await auth.signInWithOAuth(options);assert.equal(error,null);const target=new URL(data.url);
 assert.equal(target.origin,url);assert.equal(target.pathname,'/auth/v1/authorize');assert.equal(target.searchParams.get('provider'),'google');assert.equal(target.searchParams.get('redirect_to'),origin+'/auth/callback');assert.deepEqual(target.searchParams.get('scopes').split(' ').sort(),['email','openid','profile']);assert.equal(target.searchParams.get('access_type'),'online');assert.equal(target.searchParams.get('code_challenge_method'),'s256');assert(target.searchParams.get('code_challenge'));assert([...memory.keys()].some(k=>k.endsWith('-code-verifier')));
 for(const bad of [origin+'.evil.invalid','https://evil.invalid',origin+'/next'])assert.throws(()=>googleOAuthOptions(bad,[origin],true));assert.throws(()=>googleOAuthOptions(origin,[origin],false));
});
test('concurrent Google sign-ins exchange the verifier for the originating tab',async()=>{
 const memory=new Map(), challenged=new Map();
 const identity=createClient(url,key,{
   auth:{flowType:'pkce',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}},
   global:{fetch:async (input,init)=>{
     const request=new Request(input,init);
     assert.equal(new URL(request.url).searchParams.get('grant_type'),'pkce');
     const {auth_code,code_verifier}=await request.json();
     const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code_verifier))).toString('base64url');
     assert.equal(digest,challenged.get(auth_code));
     challenged.delete(auth_code);
     // Stop at the synthetic provider boundary after verifying the proof itself.
     return Response.json({error:'invalid_grant'},{status:400});
   }},
 }).auth;
 const start=async(code)=>{
   const {data,error}=await identity.signInWithOAuth(googleOAuthOptions(origin,[origin],true));
   assert.equal(error,null);assert(data.flowId);
   challenged.set(code,new URL(data.url).searchParams.get('code_challenge'));
   return data.flowId;
 };
 const first=await start('tab_one'),second=await start('tab_two');
 assert.notEqual(first,second);
 await identity.exchangeCodeForSession('tab_one',{flowId:first});
 await identity.exchangeCodeForSession('tab_two',{flowId:second});
 assert.equal(challenged.size,0);
});
test('Google callbacks require initiated same-origin fresh state and reject implicit tokens/open redirects',()=>{
 const now=Date.now(),pending={origin,startedAt:now,nonce:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},valid=new URL(origin+'/auth/callback?code=synthetic_one_time_code');assert.equal(googleCallbackCode(valid,pending,true,now),'synthetic_one_time_code');
 for(const bad of [origin+'/account?code=synthetic_one_time_code',origin+'/auth/callback?code=synthetic_one_time_code&next=https://evil.invalid',origin+'/auth/callback?code=synthetic_one_time_code&code=duplicate_code',origin+'/auth/callback#access_token=not_accepted',origin+'/auth/callback?token_hash=not_accepted',origin+'/auth/callback?error=access_denied',origin+'/auth/callback?next=//evil.invalid'])assert.throws(()=>googleCallbackCode(new URL(bad),pending,true,now));
 for(const state of [null,{...pending,origin:'https://evil.invalid'},{...pending,startedAt:now-300001},{...pending,startedAt:now+1},{...pending,nonce:'not-a-browser-nonce'},{...pending,flowId:'../other-tab'}])assert.throws(()=>googleCallbackCode(valid,state,true,now));
 assert.throws(()=>googleCallbackCode(valid,pending,false,now));assert.throws(()=>googleCallbackCode(valid,null,true,now),'consumed marker cannot be replayed');
});
test('persisted Supabase sessions retain auth credentials but discard Google provider credentials',()=>{
 const session={access_token:'synthetic-auth-access',refresh_token:'synthetic-auth-refresh',provider_token:'google-access-not-retained',provider_refresh_token:'google-refresh-not-retained',user:{id:'synthetic',nested:{provider_token:'not-retained'}}};const cleaned=JSON.parse(withoutProviderCredentials(JSON.stringify(session)));assert.equal(cleaned.access_token,session.access_token);assert.equal(cleaned.refresh_token,session.refresh_token);assert(!JSON.stringify(cleaned).includes('not-retained'));assert.equal(withoutProviderCredentials('pkce-verifier-string'),'pkce-verifier-string');
});
test('production rejects a provider-confirmed reserved synthetic identity after supported JWT verification',async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',claims=Buffer.from(JSON.stringify({sub:id,session_id:sid,exp:Math.floor(Date.now()/1000)+60})).toString('base64url'),token='e30.'+claims+'.c2ln';let calls=0;
 const auth=createOrganizationAuth({...real,NODE_ENV:'production'},async()=>{calls++;return Response.json({id,email:'alice@organization.invalid',email_confirmed_at:'2026-11-05T00:00:00Z',created_at:'2026-11-05T00:00:00Z',aud:'authenticated'});});assert.equal(await auth.verify(token),null);assert.equal(calls,1);
});

test('email delivery stays disabled until explicit operator configuration, without changing session verification',async()=>{
 let calls=0;const auth=createOrganizationAuth(real,async()=>{calls++;throw Error('Unexpected provider request');});assert(auth.configured);assert.equal(auth.emailConfigured,false);await assert.rejects(()=>auth.startEmail('member@example.org',origin),{code:'AUTH_EMAIL_NOT_CONFIGURED'});assert.equal(calls,0);assert.equal(createOrganizationAuth({...real,ACCOUNT_EMAIL_AUTH_ENABLED:'true'}).emailConfigured,true);
});

test('browser aliases cannot expose OAuth, integration-session or administrative secrets',()=>{
 for(const name of ['GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_CLIENT_SECRET','SUPABASE_JWT_SECRET','INTEGRATION_STAFF_ACCESS_TOKEN','INTEGRATION_OUTSIDER_ACCESS_TOKEN','INTEGRATION_ADMIN_ACCESS_TOKEN','INTERNAL_ADMIN_TOKEN','ACCOUNT_RATE_LIMIT_SECRET']){const value='synthetic-private-'+name;const issues=publicEnvironmentProblems({[name]:value,VITE_APPEARANCE:value});assert.equal(issues.length,1);assert(!issues[0].includes(value));}
});

test('actual Vite build entry rejects fixture configuration except its isolated local mode',()=>{
 const common={...process.env,VITE_SUPABASE_URL:fixture.SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:fixture.SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL:fixture.SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:fixture.SUPABASE_PUBLISHABLE_KEY,LOCAL_FIXTURE_BUILD:'true'};
 const run=(mode,extra={})=>spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`const {default:config}=await import('./vite.config.ts');const result=config({mode:'${mode}',command:'build',isPreview:false});if('${mode}'==='local-fixture'){const hook=result.plugins[0].transformIndexHtml;const html=typeof hook==='function'?hook('<head></head><body>'):hook.handler('<head></head><body>');if(!html.includes('synthetic authentication')||!html.includes('organization-fixture-banner.css')||html.includes('style='))throw Error('Missing fixture label or CSP-safe external styling');}console.log('configuration accepted');`],{env:{...common,...extra},encoding:'utf8',timeout:15000});
 assert.notEqual(run('production').status,0);assert.equal(run('local-fixture').status,0);assert.notEqual(run('local-fixture',{VERCEL:'1'}).status,0);
});
