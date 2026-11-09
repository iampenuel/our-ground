// Owner-operated read-only aggregate monitor. No client keys, queries, resident
// coordinates or credentials are returned. Load server env privately with Node's
// --env-file-if-exists=.env.local; this script never reads browser VITE variables.
const env=process.env;
try{
 const url=new URL(env.UPSTASH_REDIS_REST_URL??'https://missing.invalid/'),token=env.UPSTASH_REDIS_REST_TOKEN;
 if(url.protocol!=='https:'||!url.hostname.endsWith('.upstash.io')||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!token||/\s/.test(token)||/^["']|["']$/.test(token))throw Error('Server Redis configuration is missing or invalid.');
 const budget=Number(env.GEOAPIFY_SERVER_DAILY_BUDGET??200),warning=Number(env.GEOAPIFY_SERVER_WARNING_PERCENT??80);
 if(!Number.isInteger(budget)||budget<1||budget>200||!Number.isInteger(warning)||warning<50||warning>95)throw Error('Server Geoapify budget configuration is invalid.');
 const script="local t=tonumber(redis.call('TIME')[1]); local day=math.floor(t/86400); return {day,tonumber(redis.call('GET',KEYS[1]..':day:'..day) or '0'),tonumber(redis.call('GET',KEYS[1]..':warning:'..day) or '0')}";
 const response=await fetch(url.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,'1','ourground:{geoapify}']),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2500)});
 if(!response.ok)throw Error('Aggregate Redis monitor is unavailable.');const data=await response.json();
 if(data.error||!Array.isArray(data.result)||data.result.length!==3||!data.result.every(Number.isInteger)||data.result.some(x=>x<0))throw Error('Aggregate Redis monitor returned an invalid response.');
 const [day,used,firstWarning]=data.result;
 console.log(JSON.stringify({utc_date:new Date(day*86400000).toISOString().slice(0,10),server_provider_reservations:used,configured_server_daily_budget:budget,warning_percent:warning,warning_active:firstWarning>0,warning_first_recorded_at_reservation:firstWarning||null,estimated_reserved_server_provider_credits:used,account_level_credit_usage_verified:false,browser_tile_usage_included:false,redis_read_only_commands:1},null,2));
 console.log('Aggregate server reservations only. Failed upstream requests may still reserve permits. Browser map tiles and other key consumers require Geoapify dashboard monitoring; this is not a complete account credit cap.');
}catch{console.error('Aggregate usage check failed safely. Check server-only Redis configuration and connectivity privately; no automatic retry or counter mutation occurred.');process.exitCode=1;}
