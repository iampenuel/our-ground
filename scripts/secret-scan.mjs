import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {loadEnv} from 'vite';

const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['database-password-url', /postgres(?:ql)?:\/\/[^\s'"`<>:]+:([^\s'"`<>@]+)@[^\s'"`<>]+/g]
];
const placeholder = value => /(?:YOUR_|REPLACE_ME|ENCODED_PASSWORD|COPIED_HOST|PROJECT_REF|private-placeholder)/i.test(value);

/** Return rule and position only; secret-bearing matched text never leaves this function. */
export function secretFindings(text, knownSecrets = [], allowedPublicValues = []) {
  const findings = [];
  for (const [rule,pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (placeholder(match[0])) continue;
      if(rule==='google-api-key' && allowedPublicValues.includes(match[0]) && !knownSecrets.includes(match[0]))continue;
      findings.push({rule,line:text.slice(0,match.index).split('\n').length});
    }
  }
  for (const secret of knownSecrets) {
    if (!secret || secret.length < 12 || placeholder(secret)) continue;
    let at=text.indexOf(secret);
    while (at>=0) {findings.push({rule:'configured-server-secret',line:text.slice(0,at).split('\n').length});at=text.indexOf(secret,at+secret.length);}
  }
  // Legacy Supabase service-role JWTs remain secrets even without a known local value.
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    try {if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role')findings.push({rule:'supabase-service-role-jwt',line:text.slice(0,match.index).split('\n').length});} catch { /* Not a JWT. */ }
  }
  return findings.filter((f,i,a)=>a.findIndex(x=>x.rule===f.rule&&x.line===f.line)===i);
}

export function forbiddenSecretPath(file) {
  const name=path.posix.basename(file);
  return (/^\.env(?:\.|$)/.test(name)&&name!=='.env.example') || /\.(?:p12|pfx)$/i.test(name);
}

function git(args,cwd) {return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});}
export function scanRepository(cwd, {staged=false,build=false,knownSecrets=[],allowedPublicValues=[]}={}) {
  const names=git(staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','--cached','--others','--exclude-standard','-z'],cwd).split('\0').filter(Boolean);
  const files=[...new Set(names)], findings=[];
  if(build){const assets=path.join(cwd,'dist');if(!fs.existsSync(assets))throw Error('Build output is missing; run npm run build first.');const visit=p=>{for(const entry of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,entry.name);if(entry.isDirectory())visit(full);else if(entry.isFile()&&/\.(?:js|css|html|json|map)$/.test(entry.name))files.push(path.relative(cwd,full));}};visit(assets);}
  for(const file of files){
    // Git returns repository-relative names; never follow an untracked symlink outside it.
    const full=path.resolve(cwd,file);if(!full.startsWith(path.resolve(cwd)+path.sep))throw Error('Invalid repository path.');
    if(forbiddenSecretPath(file))findings.push({file,rule:'private-configuration-file',line:1});
    let buffer;
    try {buffer=staged&&!file.startsWith('dist/')?Buffer.from(git(['show',':'+file],cwd)):fs.lstatSync(full).isFile()?fs.readFileSync(full):null;} catch(error) {
      if(!staged && error?.code==='ENOENT')continue; // A tracked working file was intentionally deleted.
      throw Error('A selected scan input could not be read.');
    }
    if(!buffer||buffer.includes(0)||buffer.length>16*1024*1024)continue;
    findings.push(...secretFindings(buffer.toString('utf8'),knownSecrets,allowedPublicValues).map(f=>({file,...f})));
  }
  return {files:files.length,findings};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const cwd=process.cwd(),env={...loadEnv('production',cwd,''),...process.env};
    const names=['ADULT_SESSION_SECRET','STAGING_RATE_LIMIT_SECRET','DATABASE_URL','MIGRATION_DATABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_ROLE','GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_CLIENT_SECRET','GEOAPIFY_SERVER_API_KEY','GOOGLE_PLACES_API_KEY','GOOGLE_GEOCODING_API_KEY','GEMINI_API_KEY','UPSTASH_REDIS_REST_TOKEN','INTEGRATION_STAFF_ACCESS_TOKEN','INTEGRATION_OUTSIDER_ACCESS_TOKEN'];
    const result=scanRepository(cwd,{staged:process.argv.includes('--staged'),build:process.argv.includes('--build'),knownSecrets:names.map(k=>env[k]).filter(Boolean),allowedPublicValues:[env.VITE_GOOGLE_MAPS_API_KEY].filter(Boolean)});
    console.log(JSON.stringify({status:result.findings.length?'FAIL':'PASS',files:result.files,findings:result.findings}));
    if(result.findings.length)process.exitCode=1;
  }catch{console.error('Secret scan could not complete. Verify the repository and build paths; no secret values were printed.');process.exitCode=1;}
}
