export async function redis(config: {UPSTASH_REDIS_REST_URL?:string;UPSTASH_REDIS_REST_TOKEN?:string}, command: string[]) {
  const url = new URL(config.UPSTASH_REDIS_REST_URL ?? '');
  if (url.protocol!=='https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password || url.search || url.pathname!=='/' || !config.UPSTASH_REDIS_REST_TOKEN) throw Error('Eligibility unavailable');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+config.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(4000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('Eligibility unavailable');
  const data=await response.json();
  if(data.error)throw Error('Eligibility unavailable');
  return data.result;
}
