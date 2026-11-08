import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {adultGate} from '../backend/adult-access.ts';
export async function fixtureRequest(origin) {
  process.env.ADULT_SESSION_SECRET=randomBytes(32).toString('base64url');
  const result=await adultGate(new Request(origin+'/eligibility',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({code:randomBytes(24).toString('base64url')})}),process.env,async()=> '19+');
  assert.equal(result.status,303);
  const cookie=result.headers.get('Set-Cookie').split(';')[0];
  return (url,init={})=>{const headers=new Headers(init.headers);headers.set('Cookie',cookie);return new Request(url,{...init,headers});};
}
