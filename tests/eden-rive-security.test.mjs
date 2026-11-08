import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import applicationConfig from '../vite.config.ts';
import reviewConfig from '../vite.eden-assistant.config.ts';
import studioConfig from '../vite.eden.config.ts';
import {browserSecurityHeaders,edenLocalReviewHeaders,privateDocumentHeaders,resourcePolicy} from '../shared/security-headers.ts';
import {renderVercelSecurityConfig,vercelSecurityConfigProblems} from '../backend/staging-csp.ts';

const resource='/resources/12345678-1234-4234-8234-123456789abc';
const publicPaths=['/','///','/support','/support/','/support///','/discover','/give','/organizations','/about','/privacy',resource,resource+'/'];
const otherPaths=['/account','/account/','/account/administration','/auth/callback','/staff/services/a','/api/v1/eden/agent','/assets/eden/rig/eden.riv','/assets/rive.wasm','/support/private','/eden','/eden-assistant.html','/eden-preview.html','/%73upport','/unknown'];

function documentHeaders(config,preview,path,{host='127.0.0.1:5199',provided}={}){
  const handlers=[],server={middlewares:{use(handler){handlers.push(handler);}}},headers=new Map();
  for(const plugin of config.plugins.flat(Infinity))plugin?.[preview?'configurePreviewServer':'configureServer']?.(server);
  const response={setHeader(name,value){headers.set(name.toLowerCase(),value);},writeHead(...args){
    const supplied=args[typeof args[1]==='string'?2:1];
    const entries=Array.isArray(supplied)?Array.from({length:supplied.length/2},(_,index)=>[supplied[index*2],supplied[index*2+1]]):Object.entries(supplied??{});
    for(const[name,value]of entries)headers.set(name.toLowerCase(),value);
    return response;
  }};
  for(const handler of handlers)handler({url:path,headers:{host}},response,()=>{});
  // Vite supplies its static defaults after configureServer middleware.
  for(const[name,value]of Object.entries(config[preview?'preview':'server'].headers))response.setHeader(name,value);
  response.writeHead(200,'OK',provided??{});
  return headers;
}

test('ordinary browser policies permit neither WebAssembly nor JavaScript eval or audio',()=>{
  for(const [auth,development,fixtureAuth]of [[undefined,false,false],['https://exampleproject.supabase.co',false,false],[undefined,true,false],['http://127.0.0.1:18789',false,true]]){
    const policy=resourcePolicy(auth,development,fixtureAuth),headers=browserSecurityHeaders({authOrigin:auth,development,fixtureAuth});
    assert.equal(headers['Content-Security-Policy'],policy);
    assert.match(policy,/script-src 'self';/);assert(!policy.includes("'wasm-unsafe-eval'"));assert(!policy.includes("'unsafe-eval'"));
    assert.match(policy,/script-src-attr 'none'/);assert.match(policy,/media-src 'none'/);
    assert(!policy.includes('generativelanguage.googleapis.com'));
    assert.equal(headers['Permissions-Policy'],'camera=(), microphone=(), geolocation=(self), payment=()');
  }
});

test('Vite ordinary development and preview retain strict CSP on public, private, API and asset responses',()=>{
  for(const preview of [false,true]){
    const config=applicationConfig({command:'serve',mode:'development',isPreview:preview});
    const strict=config[preview?'preview':'server'].headers['Content-Security-Policy'];
    for(const path of [...publicPaths,...otherPaths]){
      const headers=documentHeaders(config,preview,path+'?public=1');
      assert.equal(headers.get('content-security-policy'),strict,path);
      assert(!strict.includes("'wasm-unsafe-eval'"));assert(!strict.includes("'unsafe-eval'"));assert.match(strict,/media-src 'none'/);
      assert.equal(headers.get('permissions-policy'),browserSecurityHeaders()['Permissions-Policy']);
      if(/^\/(?:account|auth|staff)(?:\/|$)/.test(path))for(const[name,value]of Object.entries(privateDocumentHeaders))assert.equal(headers.get(name.toLowerCase()),value,path);
    }
  }
});

test('existing native Rive and blob audio review exception remains exact, loopback and development only',()=>{
  const eligible={command:'serve',mode:'eden-review',isPreview:false};
  for(const path of ['/','/support?location=Harrisburg','/support/','/give','/organizations','/about','/privacy']){
    const headers=documentHeaders(reviewConfig(eligible),false,path);
    const expected=edenLocalReviewHeaders()['Content-Security-Policy'];
    assert.equal(headers.get('content-security-policy'),expected);assert(!expected.includes("'unsafe-eval'"));
    assert.equal(headers.get('cache-control'),'no-store');assert.equal(headers.get('permissions-policy'),'camera=(), microphone=(self), geolocation=(self), payment=()');
    assert.match(expected,/connect-src 'self' wss:\/\/generativelanguage\.googleapis\.com /);assert(!expected.includes('https://generativelanguage.googleapis.com'));
  }
  for(const [context,preview,host,path]of [[eligible,false,'review.example:5199','/'],[{...eligible,mode:'development'},false,'127.0.0.1:5199','/'],[{...eligible,isPreview:true},true,'127.0.0.1:5199','/'],[eligible,false,'127.0.0.1:5199','/support/private'],[eligible,false,'127.0.0.1:5199','/eden'],[eligible,false,'127.0.0.1:5199','/account'],[eligible,false,'127.0.0.1:5199','/api/v1/eden/agent']]){
    const denied=documentHeaders(reviewConfig(context),preview,path,{host}),policy=denied.get('content-security-policy');
    assert.match(policy,/media-src 'none'/);assert(!policy.includes("'wasm-unsafe-eval'"));assert(!policy.includes("'unsafe-eval'"));
    assert(!policy.includes('generativelanguage.googleapis.com'));assert.match(denied.get('permissions-policy'),/microphone=\(\)/);
  }
});

test('existing isolated Rive authoring studio exception does not grant public or voice permissions',()=>{
  for(const preview of [false,true]){
    const config=studioConfig({command:'serve',mode:'development',isPreview:preview});
    const studio=documentHeaders(config,preview,'/eden-preview.html?authoring=1').get('content-security-policy');
    assert(studio.includes("'wasm-unsafe-eval'"));assert(!studio.includes("'unsafe-eval'"));assert.match(studio,/media-src 'none'/);
    for(const path of ['/','/support','/account','/eden-preview.html/private'])assert(!documentHeaders(config,preview,path).get('content-security-policy').includes("'wasm-unsafe-eval'"));
  }
});

test('private no-store and no-referrer headers still resist both explicit writeHead forms',()=>{
  for(const preview of [false,true])for(const supplied of [{'CACHE-control':'public','Referrer-Policy':'unsafe-url','X-Result':'kept'},['CACHE-control','public','Referrer-Policy','unsafe-url','X-Result','kept']]){
    const config=applicationConfig({command:'serve',mode:'development',isPreview:preview});
    const headers=documentHeaders(config,preview,'/account',{provided:supplied});
    for(const[name,value]of Object.entries(privateDocumentHeaders))assert.equal(headers.get(name.toLowerCase()),value);
    assert.equal(headers.get('x-result'),'kept');assert(!headers.get('content-security-policy').includes("'wasm-unsafe-eval'"));
  }
});

test('deployed documents permit same-origin microphone input and blob playback without a Google browser connection',()=>{
  const base=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(vercelSecurityConfigProblems(base),[]);
  const sources=['/(.*)','/account','/account/:path*','/staff/:path*','/auth/:path*','/api/:path*'];
  for(const auth of [undefined,'https://exampleproject.supabase.co']){
    const config=renderVercelSecurityConfig(base,auth);
    assert.deepEqual(config.headers.map(rule=>rule.source),sources);assert.equal(config.git.deploymentEnabled,false);
    assert.deepEqual(config.rewrites,base.rewrites);assert(!JSON.stringify(config).includes('wasm-unsafe-eval'));assert(!JSON.stringify(config).includes('wss://generativelanguage.googleapis.com'));
    const headers=Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value]));
    assert.match(headers['Permissions-Policy'],/microphone=\(self\)/);assert.match(headers['Content-Security-Policy'],/media-src blob:/);assert.match(headers['Content-Security-Policy'],/frame-src 'none'/);
    for(const rule of config.headers.slice(1,6))assert.deepEqual(Object.fromEntries(rule.headers.map(({key,value})=>[key,value])),privateDocumentHeaders);
    const widened=structuredClone(config);widened.headers.push({source:'/support',headers:[{key:'Content-Security-Policy',value:resourcePolicy(auth).replace("script-src 'self';","script-src 'self' 'wasm-unsafe-eval';")}]});
    assert(vercelSecurityConfigProblems(widened,auth).length>0);
  }
});
