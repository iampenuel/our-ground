import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';
import { browserSecurityHeaders, privateDocumentHeaders, isPrivateDocumentPath } from './shared/security-headers.ts';
import { publicEnvironmentProblems } from './backend/env-boundary.mjs';
import {exactBuildAuthOrigin} from './backend/staging-csp.ts';
import {edenPublicPagePolicy} from './src/eden/public-page-policy.ts';
import {writeBuildEvidence} from './backend/build-provenance.mjs';

export function applicationConfig({mode,command,isPreview}:ConfigEnv, hostedVoice=true):UserConfig {
  const env = {...loadEnv(mode,process.cwd(),''),...process.env};
  const fixtureBuild=mode==='local-fixture';
  const issues = publicEnvironmentProblems(env,{production:command==='build'||Boolean(isPreview)||fixtureBuild,fixtureBuild});
  if (issues.length) throw new Error(issues.join('\n'));
  const port = Number(env.API_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid local port.');
  const development=command==='serve'&&!isPreview;
  // Keep the browser Host when proxying: the API signs age cookies and checks
  // the POST Origin against that exact origin, including its development port.
  const apiProxy={target:'http://127.0.0.1:'+port,changeOrigin:false};
  const authOrigin=fixtureBuild?env.VITE_SUPABASE_URL?.replace(/\/$/,''):exactBuildAuthOrigin(env);
  const headers=browserSecurityHeaders({https:false,authOrigin,development,fixtureAuth:fixtureBuild});
  const protectPrivateDocuments=(server:any)=>{server.middlewares.use((request:any,response:any,next:()=>void)=>{
    const path=(request.url??'/').split('?')[0];
    const responsePolicy=isPrivateDocumentPath(path)?privateDocumentHeaders:edenPublicPagePolicy(path).assistant&&hostedVoice&&!fixtureBuild?{
      'Permissions-Policy':'camera=(), microphone=(self), on-device-speech-recognition=(self), geolocation=(self), payment=()',
      'Content-Security-Policy':headers['Content-Security-Policy'].replace("media-src 'none'",'media-src blob:')
    }:null;
    if(responsePolicy){
      const original=response.writeHead;
      response.writeHead=function(...args:any[]){
        for(const[name,value]of Object.entries(responsePolicy))response.setHeader(name,value);
        const index=typeof args[1]==='string'?2:1,provided=args[index];
        const protectedNames=new Set(Object.keys(responsePolicy).map(x=>x.toLowerCase()));
        if(Array.isArray(provided)){
          const kept:any[]=[];for(let i=0;i<provided.length;i+=2)if(!protectedNames.has(String(provided[i]).toLowerCase()))kept.push(provided[i],provided[i+1]);
          args[index]=[...kept,...Object.entries(responsePolicy).flat()];
        }else if(provided&&typeof provided==='object'){
          args[index]=Object.fromEntries([...Object.entries(provided).filter(([name])=>!protectedNames.has(name.toLowerCase())),...Object.entries(responsePolicy)]);
        }
        return original.apply(response,args);
      };
    }
    next();
  });};
  return {
    // Other entry builds must not reload an open review conversation.
    server:{headers,proxy:{'/api/v1':apiProxy,'/eligibility':apiProxy},watch:{ignored:['**/dist/**','**/dist-eden/**','**/dist-eden-assistant/**']}},
    preview:{headers},
    plugins:[{
      name:'our-ground-private-document-cache',
      async writeBundle(output){await writeBuildEvidence(output.dir??'dist',env,mode);},
      generateBundle(){if(!fixtureBuild&&[...this.getModuleIds()].some(id=>id.replaceAll('\\','/').endsWith('/tests/organization-auth-server.mjs')))throw new Error('Synthetic authentication cannot be bundled into the application.');},
      configureServer:protectPrivateDocuments,
      configurePreviewServer:protectPrivateDocuments,
      transformIndexHtml: fixtureBuild ? {order:'pre' as const,handler:(html:string)=>html.replace('</head>','<link rel="stylesheet" href="/tests/organization-fixture-banner.css"></head>').replace('<body>','<body><aside role="note" class="local-fixture-banner">Local verification · synthetic authentication and fictional organization listings · no real email is sent</aside>')} : undefined
    }]
  };
}
export default defineConfig(context=>applicationConfig(context));
