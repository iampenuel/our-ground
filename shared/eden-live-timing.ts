/** Public timing metadata only. No clocks, timers, storage or provider calls. */
export type EdenLiveRetryTiming={retryAt?:string;resetAt?:string};
const dailyCodes=new Set(['EDEN_LIVE_TESTER_START_LIMIT','EDEN_LIVE_TEAM_START_LIMIT','EDEN_LIVE_PROVIDER_BUDGET','EDEN_LIVE_TESTER_MINT_LIMIT']);
export function isEdenLiveDailyLimit(code:string){return dailyCodes.has(code);}
export function canonicalLiveTimestamp(value:unknown):string|undefined {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))return;
  const time=Date.parse(value);
  return Number.isFinite(time)&&new Date(time).toISOString()===value?value:undefined;
}
export function readEdenLiveRetryTiming(error:unknown,httpDate:string|null,retryAfterSeconds?:number):EdenLiveRetryTiming {
  const fields=error&&typeof error==='object'?error as Record<string,unknown>:{};
  const resetAt=typeof fields.code==='string'&&isEdenLiveDailyLimit(fields.code)?canonicalLiveTimestamp(fields.resetAt):undefined;
  const suppliedRetry=canonicalLiveTimestamp(fields.retryAt);
  const serverTime=httpDate?Date.parse(httpDate):NaN;
  // HTTP Date is rounded down. Add a second rather than offering an early retry.
  const retryAt=suppliedRetry??(Number.isFinite(serverTime)&&Number.isSafeInteger(retryAfterSeconds)&&retryAfterSeconds!>=0&&retryAfterSeconds!<=31*86400
    ?new Date(serverTime+1000+retryAfterSeconds!*1000).toISOString():undefined);
  return {...(resetAt?{resetAt}:{}),...(retryAt?{retryAt}:{})};
}
export function formatEdenLiveRetryTime(value:string|undefined,locale?:string,timeZone?:string):string|undefined {
  const timestamp=canonicalLiveTimestamp(value);if(!timestamp)return;
  return new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(new Date(timestamp));
}
/** This deadline is measured on performance.now(), after the signed lifetime has
 * been converted once from the issuer's clock. Wall-clock changes cannot add time. */
export function edenLiveCallTime(monotonicDeadline:number,monotonicNow:number){
  const seconds=Math.max(0,Math.ceil((monotonicDeadline-monotonicNow)/1000));
  const label=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  const warning=seconds>0&&seconds<=15?'This call is ending shortly. You can continue by text.':seconds>15&&seconds<=60?'This call ends in about a minute. You can continue by text afterward.':'';
  return {seconds,label,warning};
}
