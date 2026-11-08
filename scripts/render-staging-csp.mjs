import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderVercelSecurityConfig,exactBuildAuthOrigin,vercelSecurityConfigProblems} from '../backend/staging-csp.ts';
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
try{
 const targetFile=option('--target'),output=option('--output');
 if(!targetFile||!output||resolve(output)===resolve('vercel.json'))throw Error('Select an explicit target and separate output path.');
 const target=JSON.parse(await readFile(targetFile,'utf8')),ref=target.supabase?.project_ref;
 if(target.schema_version!==1||typeof ref!=='string'||!/^[a-z0-9]{10,30}$/.test(ref)||/REPLACE_ME|PROJECT_REF/i.test(ref))throw Error('Select the reviewed staging Supabase reference.');
 const origin='https://'+ref+'.supabase.co',buildOrigin=exactBuildAuthOrigin(process.env);
 if(buildOrigin&&buildOrigin!==origin)throw Error('Build Auth origin differs from target manifest.');
 const base=JSON.parse(await readFile('vercel.json','utf8')),config=renderVercelSecurityConfig(base,origin);
 if(vercelSecurityConfigProblems(config,origin).length)throw Error('Generated config did not pass its policy check.');
 await writeFile(output,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:'PASS',auth_origin:origin,contains_secrets:false,network_requests:0,deployment_authorized:false}));
}catch{console.error('CSP rendering blocked: choose an exact reviewed target, matching public Auth origin and a new separate output file. No hosted action was performed.');process.exitCode=2;}
