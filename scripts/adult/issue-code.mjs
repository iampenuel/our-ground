// Run locally only after the operator has independently established age 19+.
// Code is written once to a new private file for delivery to the verified adult.
import {randomBytes} from 'node:crypto';
import {open} from 'node:fs/promises';
import {codeKey,redis} from '../../backend/adult-access.ts';
const [host,destination,confirmed]=process.argv.slice(2);
const origin=new URL(host).origin;
if(new URL(host).protocol!=='https:' || host!==origin || !destination || confirmed!=='--verified-19-plus')
  throw Error('Use an exact HTTPS origin, a new private output file and --verified-19-plus after verification.');
const code=randomBytes(24).toString('base64url');
const output=await open(destination,'wx',0o600);
try {
  const result=await redis(process.env,['SET',await codeKey(origin,code),'19+','EX','900','NX']);
  if(result!=='OK')throw Error('Eligibility code was not issued.');
  await output.writeFile(code+'\n');
} finally {await output.close();}
console.log('One-use code issued. It expires in 15 minutes.');
