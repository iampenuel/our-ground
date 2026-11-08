export type AuthEnvironment = Record<string,string|undefined>;
export function productionRuntime(env:AuthEnvironment) { return env.VERCEL === '1' || Boolean(env.VERCEL_ENV) || env.NODE_ENV === 'production'; }
export function loopbackUrl(value:string) { try { const u=new URL(value); return ['localhost','127.0.0.1','[::1]'].includes(u.hostname); } catch { return false; } }
export function exactAuthOrigins(value:string|undefined) {
  if(!value?.trim())return [];
  const values=value.split(',').map(x=>x.trim());
  for(const v of values){try{const u=new URL(v);if(u.origin!==v||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname.includes('*')||(u.protocol!=='https:'&&!(u.protocol==='http:'&&loopbackUrl(v))))return [];}catch{return [];}}
  return [...new Set(values)];
}
export function syntheticAuthKey(value:string) { return /(?:fixture|synthetic|local[_-]?test|local_fixture)/i.test(value); }
export function reservedIdentity(email:string) { const host=email.trim().toLowerCase().split('@').pop()??'';return !host||['invalid','example','test','localhost'].some(x=>host===x||host.endsWith('.'+x)); }
export function localFixtureRuntime(env:AuthEnvironment) {
  return !productionRuntime(env)&&env.ACCOUNT_LOCAL_FIXTURE==='true'&&loopbackUrl(env.SUPABASE_URL??'');
}
export function validAuthConfiguration(url:string,key:string,allowFixture:boolean) {
  try{
    const u=new URL(url);
    if(url!==url.trim()||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!key||key!==key.trim()||/YOUR_|REPLACE_ME|^sb_secret_/.test(key))return false;
    if(loopbackUrl(url))return allowFixture&&u.protocol==='http:'&&syntheticAuthKey(key);
    if(u.protocol!=='https:'||u.port||!/^[a-z0-9]{10,30}\.supabase\.co$/.test(u.hostname)||syntheticAuthKey(key))return false;
    if(key.startsWith('sb_publishable_'))return /^[A-Za-z0-9_-]{25,}$/.test(key.slice(15));
    if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))return false;
    const claims=JSON.parse(decodeBase64Url(key.split('.')[1]??''));
    return claims.role==='anon'&&(!claims.ref||claims.ref===u.hostname.split('.')[0]);
  }catch{return false;}
}
function decodeBase64Url(value:string) { return atob(value.replace(/-/g,'+').replace(/_/g,'/')); }
/** Only the deliberate local-fixture build is allowed to contain loopback auth configuration. */
export function authBuildProblems(env:AuthEnvironment,production:boolean,fixtureBuild=false) {
  const issues:string[]=[];
  const onVercel=env.VERCEL==='1'||Boolean(env.VERCEL_ENV);
  if(fixtureBuild&&(onVercel||!production||env.LOCAL_FIXTURE_BUILD!=='true'))issues.push('Local authentication fixture build is restricted to the explicit local-fixture build command.');
  if(production&&!fixtureBuild&&(env.ACCOUNT_LOCAL_FIXTURE==='true'||env.LOCAL_FIXTURE_BUILD==='true'||env.VITE_ACCOUNT_LOCAL_FIXTURE==='true'))issues.push('Synthetic authentication flags are forbidden in a production build.');
  const url=env.VITE_SUPABASE_URL??'',key=env.VITE_SUPABASE_PUBLISHABLE_KEY??'';
  if((url||key)&&!validAuthConfiguration(url,key,fixtureBuild&&!onVercel))issues.push('Browser authentication configuration is not approved for this build.');
  if(production&&!fixtureBuild&&env.VITE_GOOGLE_AUTH_ENABLED==='true'&&!exactAuthOrigins(env.VITE_ACCOUNT_ALLOWED_ORIGINS).length)issues.push('Google sign-in requires exact browser callback origins.');
  return issues;
}
/** Do not retain Google's API credentials in the SDK's persisted Supabase session. */
export function withoutProviderCredentials(value:string):string {
  try{const parsed:unknown=JSON.parse(value);const clean=(v:unknown):unknown=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['provider_token','provider_refresh_token'].includes(k)).map(([k,x])=>[k,clean(x)])):v;return JSON.stringify(clean(parsed));}catch{return value;}
}
export function googleOAuthOptions(origin:string,approvedOrigins:string[],enabled:boolean) {
  if(!enabled||!approvedOrigins.includes(origin)||new URL(origin).origin!==origin)throw new Error('Google sign-in is not approved for this origin.');
  return {provider:'google' as const,options:{redirectTo:origin+'/auth/callback',scopes:'openid email profile',queryParams:{access_type:'online',prompt:'select_account'},skipBrowserRedirect:true}};
}
export type PendingGoogle = {origin:string;startedAt:number;nonce:string};
export function googleCallbackCode(url:URL,pending:PendingGoogle|null,enabled:boolean,now=Date.now()) {
  const hash=new URLSearchParams(url.hash.slice(1));
  if(['access_token','refresh_token','token','token_hash'].some(k=>url.searchParams.has(k)||hash.has(k)))throw new Error('Implicit authentication callbacks are not accepted.');
  if(url.searchParams.has('error')||hash.has('error'))throw new Error('Sign-in was canceled or could not be completed.');
  if(!url.searchParams.has('code')) {if([...url.searchParams.keys()].some(k=>['next','redirect','redirect_to','return_to'].includes(k)))throw new Error('Post-login redirects are not accepted.');return null;}
  if(!enabled||url.pathname!=='/auth/callback'||url.hash||url.searchParams.size!==1||url.searchParams.getAll('code').length!==1||!pending||pending.origin!==url.origin||!Number.isFinite(pending.startedAt)||now<pending.startedAt||now-pending.startedAt>300000||!/^[a-f0-9-]{36}$/i.test(pending.nonce))throw new Error('This sign-in request could not be matched to this browser.');
  const code=url.searchParams.get('code')!;if(!/^[A-Za-z0-9_-]{10,2048}$/.test(code))throw new Error('The sign-in callback is invalid.');return code;
}
