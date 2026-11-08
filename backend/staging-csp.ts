import {browserSecurityHeaders,cspAuthOrigin,privateDocumentHeaders} from '../shared/security-headers.ts';

type Header = {key:string;value:string};
type Rule = {source:string;headers:Header[]};
export type VercelSecurityConfig = {headers?:Rule[];git?:{deploymentEnabled?:boolean};[key:string]:unknown};
const privatePaths=['/account','/account/:path*','/staff/:path*','/auth/:path*','/api/:path*'];

export function exactBuildAuthOrigin(env:Record<string,string|undefined>):string|undefined {
  const browser=env.VITE_SUPABASE_URL,server=env.SUPABASE_URL;
  const a=cspAuthOrigin(browser),b=cspAuthOrigin(server);
  if(browser&&!a || server&&!b || a&&b&&a!==b)throw Error('Auth origins must be exact matching HTTPS Supabase projects.');
  return a??b;
}

/** Nonsecret local renderer. It neither writes config nor authorizes deployment. */
export function renderVercelSecurityConfig(base:VercelSecurityConfig,authOrigin?:string):VercelSecurityConfig {
  if(authOrigin && cspAuthOrigin(authOrigin)!==authOrigin)throw Error('Select an exact HTTPS Supabase project origin.');
  const config=structuredClone(base);
  config.git={...config.git,deploymentEnabled:false};
  const documentHeaders=browserSecurityHeaders({https:true,authOrigin});
  documentHeaders['Permissions-Policy']='camera=(), microphone=(self), on-device-speech-recognition=(self), geolocation=(self), payment=()';
  documentHeaders['Content-Security-Policy']=documentHeaders['Content-Security-Policy'].replace("media-src 'none'",'media-src blob:');
  config.headers=[
    {source:'/(.*)',headers:Object.entries(documentHeaders).map(([key,value])=>({key,value}))},
    ...privatePaths.map(source=>({source,headers:Object.entries(privateDocumentHeaders).map(([key,value])=>({key,value}))}))
  ];
  return config;
}

export function vercelSecurityConfigProblems(config:VercelSecurityConfig,authOrigin?:string):string[] {
  const problems:string[]=[];
  if(authOrigin && cspAuthOrigin(authOrigin)!==authOrigin)return ['INVALID_AUTH_ORIGIN'];
  const expected=renderVercelSecurityConfig(config,authOrigin);
  if(config.git?.deploymentEnabled!==false)problems.push('GIT_AUTODEPLOY_NOT_DISABLED');
  if(!Array.isArray(config.headers)||config.headers.length!==expected.headers!.length)return [...problems,'SECURITY_HEADER_RULES_DIFFER'];
  for(const wanted of expected.headers!) {
    const matches=config.headers.filter(rule=>rule.source===wanted.source);
    if(matches.length!==1){problems.push('SECURITY_HEADER_RULES_DIFFER');continue;}
    const entries=matches[0].headers;
    if(!Array.isArray(entries)||entries.length!==wanted.headers.length||new Set(entries.map(h=>h.key.toLowerCase())).size!==entries.length){problems.push('SECURITY_HEADER_FIELDS_DIFFER');continue;}
    const got=new Map(entries.map(h=>[h.key.toLowerCase(),h.value]));
    if(wanted.headers.some(h=>got.get(h.key.toLowerCase())!==h.value))problems.push('SECURITY_HEADER_VALUES_DIFFER');
  }
  return [...new Set(problems)];
}
