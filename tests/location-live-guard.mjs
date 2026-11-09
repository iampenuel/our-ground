// Explicit local verification preload; never used by the deployed application.
import fs from 'node:fs';
if(process.env.NODE_ENV==='production'||process.env.VERCEL||process.env.VERCEL_ENV)throw Error('Live verification guard is restricted to the local nonproduction process.');
const path=process.env.LOCATION_LIVE_LEDGER,max=Number(process.env.LOCATION_LIVE_MAX_REQUESTS??40);
if(!path||!/^\/private\/tmp\/our-ground-(?:7d|7d1|7e|7f)\/[A-Za-z0-9_.-]+$/.test(path)||!Number.isSafeInteger(max)||max<1||max>40)throw Error('Use the explicit bounded local verification ledger.');
let lines=fs.existsSync(path)?fs.readFileSync(path,'utf8').split('\n').filter(Boolean):[];for(const line of lines)JSON.parse(line);
const fetcher=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const raw=input instanceof Request?input.url:input instanceof URL?input.href:String(input),url=new URL(raw);
 if(url.hostname!=='api.geoapify.com')return fetcher(input,init);
 if(lines.length>=max)throw Error('Local Geoapify verification budget is exhausted.');
 const row={sequence:lines.length+1,time:new Date().toISOString(),path:url.pathname,status:'dispatched'};
 lines.push(JSON.stringify(row));fs.appendFileSync(path,JSON.stringify(row)+'\n',{mode:0o600});
 return fetcher(input,init);
};
