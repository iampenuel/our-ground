import assert from 'node:assert/strict';import {test} from 'node:test';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {createPublicProtection,publicAdmissionScript} from '../backend/anonymous-protection.ts';
const port=process.env.SECURITY_REDIS_PORT;if(!port||!/^\d+$/.test(port)||+port<1024||+port>65535)throw Error('Set SECURITY_REDIS_PORT for the isolated loopback Redis fixture.');
const cli=process.env.SECURITY_REDIS_CLI??'/opt/homebrew/opt/redis/bin/redis-cli',run=promisify(execFile);
async function redis(args){const {stdout}=await run(cli,['-h','127.0.0.1','-p',port,'--json',...args],{timeout:5000,maxBuffer:1024*1024});return JSON.parse(stdout);}
test('physical Redis atomically enforces shared anonymous limits across concurrent server instances',async()=>{
 const secret=randomUUID(),env={VERCEL:'1',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io/',UPSTASH_REDIS_REST_TOKEN:secret};
 const transport=async(_url,init)=>Response.json({result:await redis(JSON.parse(init.body))});
 const a=createPublicProtection(env,transport),b=createPublicProtection(env,transport),req=new Request('https://ourground.vercel.app/api/v1/correction-reports',{headers:{'x-vercel-forwarded-for':'192.0.2.240'}});
 const results=await Promise.allSettled(Array.from({length:16},(_,i)=>(i%2?a:b).admit('report',req)));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,3);const blocked=results.filter(x=>x.status==='rejected');assert.equal(blocked.length,13);for(const x of blocked){assert.equal(x.reason.status,429);assert(x.reason.retryAfter>0);}
});
test('physical Redis uses server time and blocks global allowance before incrementing client counters',async()=>{
 const prefix='ourground:{security-local-test}:'+randomUUID(),dayKey=prefix+':day',keyA=prefix+':a',keyB=prefix+':b',keyC=prefix+':c';
 const call=key=>redis(['EVAL',publicAdmissionScript,'2',key,dayKey,'resolve','60','6','2']);assert.deepEqual(await call(keyA),[1,0]);assert.deepEqual(await call(keyB),[1,0]);const denied=await call(keyC);assert.equal(denied[0],0);assert(denied[1]>0&&denied[1]<=86400);
 const time=await redis(['TIME']),minute=Math.floor(Number(time[0])/60);assert.equal(await redis(['GET',keyC+':'+minute]),null);
});
