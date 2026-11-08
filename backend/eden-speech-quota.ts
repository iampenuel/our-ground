// Only structured, bounded quota metadata crosses the diagnostic boundary.
// Never retain the SDK body/message, subjects, dimensions, request or headers.
export type SpeechQuotaCategory='zero-allowance'|'daily'|'short-window'|'unspecified';
type Violation={quotaMetric?:string;quotaId?:string;effectiveLimit?:number};
export type SpeechQuota={
  source:'google'|'our-ground';endpoint:string;model:string;httpStatus:429;
  category:SpeechQuotaCategory;providerCode?:number|string;providerStatus?:string;providerReason?:string;
  violations:Violation[];retryAfterSeconds?:number;
};
const endpoint='POST https://generativelanguage.googleapis.com/v1beta/interactions';
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const limitValue=(v:unknown)=>{
  if(typeof v!=='number' && (typeof v!=='string'||!/^\d{1,16}$/.test(v)))return;
  const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:undefined;
};
// Quota names are not arbitrary strings. Split Google's normal metric/limit
// nomenclature and reject the entire field if any word is outside that glossary.
// A credentials-shaped suffix cannot ride along with a valid public prefix.
const quotaWords=new Set(('generate generated generation generative content interact interaction interactions audio speech tts text to input output cache cached batch live stream streaming concurrent concurrency active model models project projects user users '+
  'api key region global location free paid tier billing quota quotas limit limits count counts rate request requests token tokens operations operation capacity traffic bytes characters units unit client per for all total shared default minute second hour day daily monthly month max maximum rpm rpd tpm tpd').split(' '));
function safeQuotaName(v:unknown){
  if(typeof v!=='string'||v.length>112||!/^[a-zA-Z][a-zA-Z_-]*$/.test(v))return;
  const words=v.replace(/([A-Z])([A-Z][a-z])/g,'$1_$2').replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase().split(/[_-]+/);
  return words.every(w=>quotaWords.has(w))?v:undefined;
}
function metric(v:unknown){
  const prefix='generativelanguage.googleapis.com/';
  if(typeof v==='string'&&v.startsWith(prefix)&&safeQuotaName(v.slice(prefix.length)))return v;
}
const identifier=safeQuotaName;
function retrySeconds(v:unknown):number|undefined{
  if(v!==null&&typeof v==='object'){
    const d=obj(v),seconds=limitValue(d.seconds),nanos=limitValue(d.nanos??0);
    if(seconds!==undefined&&nanos!==undefined&&nanos<1e9)return retrySeconds(seconds+nanos/1e9);
  }
  if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=31*86400)return Math.ceil(v);
  if(typeof v==='string'&&/^\d{1,7}(?:\.\d{1,9})?s?$/.test(v))return retrySeconds(Number(v.replace(/s$/,'')));
}
function headerRetry(headers:unknown,now:number){
  const value=headers instanceof Headers?headers.get('retry-after'):obj(headers)['retry-after']??obj(headers)['Retry-After'];
  if(typeof value!=='string')return;
  if(/^\d+$/.test(value.trim()))return retrySeconds(value.trim());
  if(!/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{2} [A-Za-z]{3} \d{4} \d\d:\d\d:\d\d GMT$/.test(value))return;
  return retrySeconds(Math.max(0,(Date.parse(value)-now)/1000));
}
function googlePayload(e:Record<string,unknown>){
  const data=obj(e.error);
  if(Object.keys(data).length)return data.error?obj(data.error):data;
  // Some SDK versions supply the canonical JSON envelope only as a string.
  const raw=typeof e.body==='string'?e.body:e.message;
  if(typeof raw==='string'&&raw.length<=32768&&raw.trimStart().startsWith('{')){
    try{const parsed=obj(JSON.parse(raw));return parsed.error?obj(parsed.error):parsed;}catch{/* Not a JSON error envelope. */}
  }
  return {};
}
function category(violations:Violation[]):SpeechQuotaCategory{
  if(violations.some(v=>v.effectiveLimit===0))return 'zero-allowance';
  const labels=violations.map(v=>(v.quotaId??'')+' '+(v.quotaMetric??'')).join(' ');
  if(/per[_-]?day|requests?[_-]?daily|daily[_-]?(?:request|token|limit)/i.test(labels))return 'daily';
  if(/per[_-]?(?:minute|second)|concurrent/i.test(labels))return 'short-window';
  return 'unspecified';
}

export function googleSpeechQuota(error:unknown,model:string,now=Date.now()):SpeechQuota|undefined{
  const e=obj(error),body=googlePayload(e);
  if(Number(e.status??e.statusCode??e.code??body.code)!==429)return;
  const violations:Violation[]=[];
  let providerReason:string|undefined;
  let retryAfterSeconds=headerRetry(e.headers,now);
  const add=(metricInput:unknown,idInput:unknown,limitInput:unknown)=>{
    const quotaMetric=metric(metricInput),quotaId=identifier(idInput),effectiveLimit=limitValue(limitInput);
    if(!quotaMetric&&!quotaId&&effectiveLimit===undefined)return;
    const old=violations.find(v=>quotaMetric&&v.quotaMetric===quotaMetric && (!quotaId||v.quotaId===quotaId));
    if(old){if(old.effectiveLimit===undefined&&effectiveLimit!==undefined)old.effectiveLimit=effectiveLimit;return;}
    if(violations.length<12)violations.push({...(quotaMetric?{quotaMetric}:{}),...(quotaId?{quotaId}:{}),...(effectiveLimit!==undefined?{effectiveLimit}:{})});
  };
  for(const detail of Array.isArray(body.details)?body.details.slice(0,16):[]){
    const d=obj(detail);
    if(d['@type']==='type.googleapis.com/google.rpc.QuotaFailure'){
      for(const item of Array.isArray(d.violations)?d.violations.slice(0,12):[]){
        const v=obj(item);add(v.quotaMetric??v.quota_metric,v.quotaId??v.quota_id,v.quotaValue??v.quota_value);
      }
    }else if(d['@type']==='type.googleapis.com/google.rpc.ErrorInfo'){
      const m=obj(d.metadata);add(m.quota_metric,m.quota_limit,m.quota_limit_value);
      if(typeof d.reason==='string'&&/^(RATE_LIMIT_EXCEEDED|QUOTA_EXCEEDED|RESOURCE_EXHAUSTED)$/.test(d.reason))providerReason=d.reason;
    }else if(d['@type']==='type.googleapis.com/google.rpc.RetryInfo'){
      const seconds=retrySeconds(d.retryDelay??d.retry_delay);
      if(seconds!==undefined)retryAfterSeconds=Math.max(seconds,retryAfterSeconds??0);
    }
  }
  // Some Gemini versions omit a zero proto value from QuotaFailure but give it
  // in this exact provider sentence. Extract only the named metric and integer.
  if(typeof body.message==='string'&&body.message.length<=8192)for(const match of body.message.matchAll(/(?:^|\n)\s*\*?\s*Quota exceeded for metric:\s*(generativelanguage\.googleapis\.com\/[a-z0-9_]+),\s*limit:\s*(\d{1,16})\b/gi)){
    add(match[1],undefined,match[2]);
  }
  // Interactions errors can use a lowercase symbolic code. Do not copy an
  // unknown SDK string (it may contain provider text or credentials).
  const safeSymbol=(v:unknown)=>typeof v==='string'&&/^(resource_exhausted|too_many_requests|rate_limit_exceeded|quota_exceeded|rate_limit_error)$/i.test(v)?v:undefined;
  const rawCode=body.code??e.code;
  const numericCode=limitValue(rawCode);
  const providerCode=numericCode===429||numericCode===8?numericCode:safeSymbol(rawCode);
  const providerStatus=safeSymbol(body.status);
  return {source:'google',endpoint,model,httpStatus:429,category:category(violations),violations,
    ...(providerCode!==undefined?{providerCode}:{}),...(providerStatus?{providerStatus}:{}),...(providerReason?{providerReason}:{}),...(retryAfterSeconds!==undefined?{retryAfterSeconds}:{})};
}

export function hostedSpeechQuota(model:string,bucket:string,limit:number,now:number):SpeechQuota{
  const daily=bucket==='speech-day',window=daily?86400000:60000;
  return {source:'our-ground',endpoint:'POST /api/v1/eden/hosted/speech',model,httpStatus:429,category:daily?'daily':'short-window',
    violations:[{quotaId:bucket,effectiveLimit:limit}],retryAfterSeconds:Math.ceil((window-now%window)/1000)};
}
