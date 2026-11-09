import {createHash,randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

/** A local admission grant, not an age-verification service or Google approval.
 * The operator must establish adult/US eligibility before issuing it. No identity
 * documents, names, email addresses or provider credentials are collected here.
 */
export function issueEdenReviewGrant({adultVerified=false,country,freeTierConfirmed=false,hours=2,now=Date.now()}={}){
  if(adultVerified!==true||country!=='US'||freeTierConfirmed!==true)throw new Error('Confirm adult US eligibility and an unbilled free-tier project before issuing a local review code.');
  if(!Number.isInteger(hours)||hours<1||hours>24||!Number.isFinite(now))throw new Error('The review invitation must expire in 1 to 24 hours.');
  const code=randomBytes(32).toString('base64url'),expiresAt=new Date(now+hours*3_600_000).toISOString();
  const environment={EDEN_REVIEWER_CODE_SHA256:createHash('sha256').update(code).digest('hex'),EDEN_REVIEWER_EXPIRES_AT:expiresAt,EDEN_REVIEWER_ADULT_VERIFIED:'true',EDEN_REVIEWER_COUNTRY:'US',EDEN_GEMINI_MODE:'synthetic-development',EDEN_GEMINI_FREE_TIER_CONFIRMED:'true'};
  return{code,expiresAt,environment};
}

export async function createReviewFiles({output='.env.eden-review.local',...options}={}){
  if(basename(output)!==output||!/^\.env\.[a-z0-9-]+\.local$/.test(output))throw new Error('Use an ignored .env.<name>.local filename in the project directory.');
  const grant=issueEdenReviewGrant(options),envPath=resolve(output),codePath=envPath+'.code';
  await writeFile(codePath,grant.code+'\n',{flag:'wx',mode:0o600});
  try{await writeFile(envPath,Object.entries(grant.environment).map(([key,value])=>key+'='+value).join('\n')+'\n',{flag:'wx',mode:0o600});}
  catch{await unlink(codePath);throw new Error('The review grant file already exists or could not be created. Existing grants were preserved.');}
  return{envPath,codePath,expiresAt:grant.expiresAt};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
  try{
    const result=await createReviewFiles({adultVerified:args.includes('--adult-verified'),country:value('--country'),freeTierConfirmed:args.includes('--free-tier-confirmed'),hours:Number(value('--hours')??2),output:value('--output')??'.env.eden-review.local'});
    // Never print the code. The operator copies it from the protected code file.
    process.stdout.write(JSON.stringify({...result,notice:'Local reviewer grant created. Keep both files out of Git. This does not authorize hosted Gemini access.'})+'\n');
  }catch{process.stderr.write('Review grant not created. Use --adult-verified --country US --free-tier-confirmed and an unused ignored .env.<name>.local file.\n');process.exitCode=1;}
}
