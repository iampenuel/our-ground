import {isEdenLiveDailyLimit} from '../shared/eden-live-timing.ts';
import {liveCapacity} from './eden-live-capacity.ts';
import {DirectoryLocationError} from './directory-city.ts';
import {LocationSearchError} from './location-search.ts';
import {EDEN_LIVE_MAX_CALL_SECONDS} from '../shared/eden-live.ts';
import {createHostedLive} from './eden-hosted-live.ts';
import {EdenLiveError} from './eden-live.ts';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import type {Dependencies} from './app.ts';
import {adultSessionNonce} from './adult-access.ts';
import {stagingProjectId} from './staging-limiter.ts';
import {redis} from './hosted-store.ts';
import {publicAdmissionScript} from './anonymous-protection.ts';
import {clientNetwork} from './geoapify-limits.ts';
import {createEdenAgent, type EdenHostedTurnStore, type EdenAgentOptions} from './eden-agent.ts';
import {EDEN_TEXT_MODELS,EdenProviderError} from './eden-provider.ts';
import {EDEN_TTS_MODELS,EdenSpeechError,synthesizePublicSpeech} from './eden-speech.ts';
import {hostedSpeechQuota} from './eden-speech-quota.ts';
import {boundedJsonObject,RequestInputError} from './request-safety.ts';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {EDEN_SPEECH_VOICE} from '../shared/eden-speech.ts';
import {validateEdenAgentRequest,validateEdenAgentContext} from '../shared/eden-agent.ts';

const seconds=900;
const hash=(input:string)=>createHash('sha256').update(input).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const validToken=(value:unknown):value is string=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
type Environment=Record<string,string|undefined>;
type Store=(command:string[])=>Promise<unknown>;
type Options={store?:Store;create?:EdenAgentOptions['create'];speech?:typeof synthesizePublicSpeech};
const cacheHeaders={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function jsonResponse(data:unknown,status=200){return Response.json(data,{status,headers:cacheHeaders});}
const reject=(status:number,code:string,message:string):never=>{throw new RequestInputError(status,code,message);};
function fields(body:Record<string,unknown>,allowed:string[]){
  if(Object.keys(body).length!==allowed.length || !allowed.every(field=>Object.hasOwn(body,field))) reject(422,'EDEN_INVALID_REQUEST','Use a supported directory command.');
}
/** Apply shared counters across serverless instances. The service has no paid failover. */
async function admit(store:Store,id:string,bucket:string,limit:number,ttl:number,speech?:{model:string;now:number}){
  const count=await store(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",'1','og:adult:eden:v1:rate:'+bucket+':'+id,String(ttl)]);
  if(typeof count!=='number'||count<1)reject(503,'EDEN_LIMITER_UNAVAILABLE','The assistant is temporarily unavailable.');
  if((count as number)>limit){
    if(speech)throw new EdenSpeechError('EDEN_USAGE_LIMIT',429,hostedSpeechQuota(speech.model,bucket,limit,speech.now));
    reject(429,'EDEN_USAGE_LIMIT','The assistant has reached its free usage limit.');
  }
}

export function createHostedEden(deps:Dependencies,env:Environment,options:Options={}){
  const store=options.store??(command=>redis(env,command));
  const textModel=EDEN_TEXT_MODELS.find(m=>m===(env.EDEN_GEMINI_TEXT_MODEL??EDEN_TEXT_MODELS[0]));
  const speechModel=EDEN_TTS_MODELS.find(m=>m===(env.EDEN_GEMINI_TTS_MODEL??EDEN_TTS_MODELS[0]));
  const ready=()=>env.VERCEL==='1'&&(env.VERCEL_ENV==='production'||env.VERCEL_ENV==='preview'&&env.VERCEL_PROJECT_ID===stagingProjectId)&&env.EDEN_HOSTED_COMMANDS==='enabled' &&
    env.EDEN_GEMINI_FREE_TIER_CONFIRMED==='true'&&env.BACKEND_DATA_MODE==='postgres'&&env.ALLOW_DEMO_DATA==='false'&&
    Boolean(env.GEMINI_API_KEY?.trim()&&deps.directoryCity&&deps.realDirectoryConfigured&&textModel);
  const key=(kind:string,id:string)=>'og:adult:eden:v1:'+kind+':'+id;
  const turns:EdenHostedTurnStore={
    model:textModel??EDEN_TEXT_MODELS[0],
    async save(digest,pending){
      if(await store(['SET',key('turn',pending.binding+':'+digest),JSON.stringify(pending),'EX','120','NX'])!=='OK')reject(503,'EDEN_TURN_UNAVAILABLE','Please try the command again.');
    },
    async take(digest,binding){
      const value=await store(['GETDEL',key('turn',binding+':'+digest)]);
      return typeof value==='string'?JSON.parse(value):null;
    }
  };
  const agent=createEdenAgent(env,{repository:deps.repo,directoryCity:deps.directoryCity,hostedTurns:turns,create:options.create});
  const policy=liveCapacity(env);
  const liveProjectApproved=env.VERCEL_ENV==='preview'&&env.VERCEL_PROJECT_ID===stagingProjectId||
    env.VERCEL_ENV==='production'&&env.VERCEL_PROJECT_ID==='prj_4li6QnqulPgPbJpxMW2L9hczDNrS'&&env.EDEN_LIVE_PRODUCTION_APPROVED==='true';
  const liveEnabled=Boolean(policy)&&env.VITE_EDEN_HOSTED_LIVE==='true'&&liveProjectApproved;
  const live=createHostedLive(store,agent,env.GEMINI_API_KEY??'',undefined,policy);
  return async function handle(request:Request,path:string){
    // This is an ephemeral turn ID, never an auth token, session ID or content hash.
    const requestedId=request.headers.get('x-eden-correlation-id');
    const correlationId=requestedId && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestedId)?requestedId:randomUUID();
    const response=(data:unknown,status=200)=>{
      const result=jsonResponse(data,status);
      result.headers.set('x-eden-correlation-id',correlationId);
      if(status===200 && textModel && ['understand','plan','result'].includes(path))result.headers.set('x-eden-text-model',textModel);
      return result;
    };
    try{
      // Vercel overwrites x-vercel-ip-country. Only the verified deployment runtime may serve these routes.
      const nonce=await adultSessionNonce(request,env);
      if(!nonce)reject(403,'AGE_ACKNOWLEDGMENT_REQUIRED','Acknowledge the age requirement to continue.');
      if(request.headers.get('x-vercel-ip-country')!=='US')reject(403,'EDEN_REGION_UNAVAILABLE','EDEN is available to adults using this demo in the United States.');
      if(!ready())reject(403,'EDEN_DISABLED','Hosted EDEN is unavailable.');
      if(path==='status'&&request.method==='GET')return response({available:true,engine:'gemini',agentAvailable:true,speechAvailable:Boolean(speechModel),voice:EDEN_SPEECH_VOICE,speechModel:speechModel??null,rawAudioAccepted:false,liveTokensAvailable:liveEnabled,...(liveEnabled?{liveTestLimits:{...policy,maxCallSeconds:EDEN_LIVE_MAX_CALL_SECONDS,scope:'signed-tester-browser'}}:{}),noticeVersion:EDEN_NOTICE_VERSION});
      const origin=new URL(request.url).origin;
      if(request.method!=='POST'||request.headers.get('origin')!==origin)reject(403,'EDEN_ORIGIN_REQUIRED','Use the assistant on this site.');
      const binding=hash(origin+'|'+nonce);
      const body=await boundedJsonObject(request);
      if(path==='session'){
        fields(body,['noticeVersion','acknowledged']);
        if(body.noticeVersion!==EDEN_NOTICE_VERSION||body.acknowledged!==true)reject(403,'EDEN_NOTICE_REQUIRED','Review the privacy notice first.');
        await admit(store,binding,'session',5,3600);
        const sessionToken=token(),expiresAt=new Date(Date.now()+seconds*1000).toISOString();
        if(await store(['SET',key('session',hash(sessionToken)),binding+'|'+Date.parse(expiresAt),'EX',String(seconds),'NX'])!=='OK')reject(503,'EDEN_SESSION_UNAVAILABLE','Please try again.');
        return response({sessionToken,expiresAt,noticeVersion:EDEN_NOTICE_VERSION});
      }
      const credential=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'')?.[1];
      if(!validToken(credential))reject(401,'EDEN_SESSION_REQUIRED','Start an EDEN session.');
      const session=hash(credential!),sessionKey=key('session',session);
      const storedBinding=await store(['GET',sessionKey]);
      if(typeof storedBinding!=='string'||storedBinding.split('|')[0]!==binding)reject(401,'EDEN_SESSION_EXPIRED','Start an EDEN session.');
      if(path.startsWith('live/')){
        if(!liveEnabled)reject(403,'EDEN_LIVE_DISABLED','Calls are unavailable here.');
        if(path==='live/token' && env.VERCEL_ENV==='production'){
          // A new signed age cookie must not reset the public mint burst limit.
          // Only a short-lived keyed digest reaches Redis.
          const network=clientNetwork(request.headers.get('x-vercel-forwarded-for')??undefined);
          const digest=createHmac('sha256',env.ADULT_SESSION_SECRET!).update('eden-public-mint|'+network).digest('hex');
          const prefix='og:adult:eden:v1:mint-network';
          const admission=await store(['EVAL',publicAdmissionScript,'2',prefix+':'+digest,prefix+':shared','live','900','4','0']);
          if(!Array.isArray(admission)||admission.length!==2||![0,1].includes(admission[0])||!Number.isSafeInteger(admission[1]))
            throw new EdenLiveError('EDEN_LIMITER_UNAVAILABLE',503);
          if(admission[0]===0)throw new EdenLiveError('EDEN_LIVE_START_THROTTLED',429,admission[1]);
        }
        const result=await live(path,body,session,binding,Number(String(storedBinding).split('|')[1]),request.signal);
        if(await store(['GET',sessionKey])!==storedBinding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return response(result);
      }
      if(path==='end'){fields(body,[]);await store(['DEL',sessionKey]);return response({ended:true});}
      const now=new Date(), day=now.toISOString().slice(0,10), minute=Math.floor(now.getTime()/60000);
      async function capacity(tts:boolean){
        const speech=tts&&speechModel?{model:speechModel,now:now.getTime()}:undefined;
        await admit(store,session+':'+minute,tts?'speech-minute':'text-minute',tts?2:8,65,speech);
        await admit(store,String(minute),tts?'provider-speech-minute':'provider-text-minute',tts?3:12,65,speech);
        await admit(store,day,tts?'speech-day':'text-day',tts?10:150,86460,speech);
      }
      // Only validated server output may acquire a one-time speech ticket. The
      // speech endpoint accepts no transcript, text, resource IDs or audio.
      async function withSpeech<T extends object>(answer:T, text?:string) {
        if (!speechModel || !text || text.length>1200 || /[<>@\x00-\x1f]|https?:|www\./i.test(text)) return answer;
        const speechTicket=token();
        try {
          if(await store(['SET',key('speech',session+':'+hash(speechTicket)),text,'EX','60','NX'])==='OK')return {...answer,speechTicket};
        } catch { /* A speech outage must preserve the verified text reply. */ }
        return answer;
      }
      if(path==='understand'){
        fields(body,['symbols','context','controls','previous','noticeVersion']);
        const context=validateEdenAgentContext(body.context);
        if(body.noticeVersion!==EDEN_NOTICE_VERSION||!context||context.directory!=='public'||context.synthetic)reject(422,'EDEN_INVALID_REQUEST','Use the current public page.');
        await capacity(false);
        const decision=await agent.understand(body.symbols,context,body.controls,body.previous,request.signal);
        if(await store(['GET',sessionKey])!==storedBinding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return response(await withSpeech(decision,'reply' in decision?decision.reply:undefined));
      }
      if(path==='plan'){
        const input=validateEdenAgentRequest(body);
        if(!input||input.context.directory!=='public'||input.context.synthetic) return response({error:{code:'EDEN_INVALID_REQUEST',message:'Use a supported public directory command.'}},422);
        if(input.intent.goal==='check-open-now'&&input.context.selectedIndex!==input.intent.ordinal)reject(409,'EDEN_SELECTION_CHANGED','Select the clinic again before asking about its hours.');
        await capacity(false);
        const result=await agent.begin(input,session,request.signal);
        if(await store(['GET',sessionKey])!==storedBinding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return response(await withSpeech(result,'clarification' in result?result.clarification.question:undefined));
      }
      if(path==='result'){
        fields(body,['turnToken','context','noticeVersion','outcome']);
        const context=validateEdenAgentContext(body.context);
        if(!context||context.directory!=='public'||context.synthetic||!validToken(body.turnToken)||body.noticeVersion!==EDEN_NOTICE_VERSION||!['done','failed'].includes(String(body.outcome)))return response({error:{code:'EDEN_INVALID_RESULT',message:'Use the current listing selection.'}},422);
        await capacity(false);
        const result=await agent.complete({turnToken:body.turnToken,outcome:body.outcome as 'done'|'failed',noticeVersion:EDEN_NOTICE_VERSION,resourceIds:context.resourceIds,context},session,request.signal);
        if(await store(['GET',sessionKey])!==storedBinding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return response(await withSpeech(result,result.reply));
      }
      if(path==='speech'){
        fields(body,['speechTicket']);
        if(!speechModel||!validToken(body.speechTicket))reject(422,'EDEN_INVALID_SPEECH','Choose a current verified answer.');
        const reply=await store(['GETDEL',key('speech',session+':'+hash(body.speechTicket as string))]);
        if(typeof reply!=='string')reject(409,'EDEN_SPEECH_EXPIRED','Choose a current verified answer.');
        await capacity(true);
        const audio=await (options.speech??synthesizePublicSpeech)(reply as string,speechModel!,env.GEMINI_API_KEY!,request.signal);
        if(await store(['GET',sessionKey])!==storedBinding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return new Response(new Uint8Array(audio.data),{headers:{...cacheHeaders,'Content-Type':'audio/wav','X-Eden-Speech-Voice':EDEN_SPEECH_VOICE,
          'X-Eden-Speech-Model':speechModel!,...(audio.reportedModel?{'X-Eden-Speech-Provider-Model':audio.reportedModel}:{}),
          'X-Eden-Speech-Text-SHA256':hash(reply as string)}});
      }
      return response({error:{code:'EDEN_ROUTE_UNAVAILABLE',message:'Use the directory assistant.'}},404);
    }catch(error){
      if(error instanceof DirectoryLocationError)return response({error:{code:error.code,message:error.message}},error.status);
      if(error instanceof LocationSearchError)return response({error:{code:'EDEN_LOCATION_UNAVAILABLE',message:'Location resolution is temporarily unavailable. Check the place and state or ZIP code, or try again later.'}},error.status);
      if(error instanceof EdenProviderError){
        // A bounded error enum and model name only. SDK errors may contain keys or input.
        console.warn('eden.provider',JSON.stringify({code:error.code,model:textModel,status:error.status,correlationId}));
        const result=response({error:{code:error.code,message:error.status===429?'Gemini is temporarily busy. Try again in a moment.':'Gemini could not complete this request. The public page controls are available.'}},error.status);
        if(error.status===429) result.headers.set('Retry-After','30');
        return result;
      }
      if(error instanceof EdenSpeechError&&error.quota){
        const quota=error.quota;
        console.warn('eden.speech.quota',JSON.stringify({code:error.code,correlationId,...quota}));
        const result=response({error:{code:error.code,message:error.message,quota}},error.status);
        if(quota.retryAfterSeconds!==undefined)result.headers.set('Retry-After',String(quota.retryAfterSeconds));
        return result;
      }
      if(error instanceof EdenLiveError || error instanceof EdenSpeechError || error instanceof RequestInputError){
        const now=Date.now();
        const resetAt=error instanceof EdenLiveError&&isEdenLiveDailyLimit(error.code)?error.resetAt:undefined;
        const delay=error instanceof EdenLiveError?error.retryAfterSeconds:undefined;
        const retryAt=resetAt??(Number.isSafeInteger(delay)&&delay!>=0&&delay!<=31*86400?new Date(now+delay!*1000).toISOString():undefined);
        const result=response({error:{code:error.code,message:error.message,...(resetAt?{resetAt}:{}),...(retryAt?{retryAt}:{})}},error.status);
        if(error instanceof EdenLiveError){
          result.headers.set('Date',new Date(now).toUTCString());
          const wait=resetAt?Math.max(0,Math.ceil((Date.parse(resetAt)-now)/1000)):delay;
          if(wait!==undefined)result.headers.set('Retry-After',String(wait));
        }
        return result;
      }
      return response({error:{code:'EDEN_UNAVAILABLE',message:'The assistant is temporarily unavailable.'}},503);
    }
  };
}
