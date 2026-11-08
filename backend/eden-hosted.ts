import {createHash,randomBytes} from 'node:crypto';
import type {Dependencies} from './app.ts';
import {adultSessionNonce} from './adult-access.ts';
import {redis} from './hosted-store.ts';
import {createEdenAgent, type EdenHostedTurnStore, type EdenAgentOptions} from './eden-agent.ts';
import {EDEN_TEXT_MODELS,EdenProviderError} from './eden-provider.ts';
import {EDEN_TTS_MODELS,EdenSpeechError,synthesizePublicSpeech} from './eden-speech.ts';
import {boundedJsonObject,RequestInputError} from './request-safety.ts';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {validateEdenAgentRequest,validateEdenAgentContext} from '../shared/eden-agent.ts';

const seconds=900;
const hash=(input:string)=>createHash('sha256').update(input).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const validToken=(value:unknown):value is string=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
type Environment=Record<string,string|undefined>;
type Store=(command:string[])=>Promise<unknown>;
type Options={store?:Store;create?:EdenAgentOptions['create'];speech?:typeof synthesizePublicSpeech};
const cacheHeaders={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function response(data:unknown,status=200){return Response.json(data,{status,headers:cacheHeaders});}
const reject=(status:number,code:string,message:string):never=>{throw new RequestInputError(status,code,message);};
function fields(body:Record<string,unknown>,allowed:string[]){
  if(Object.keys(body).length!==allowed.length || !allowed.every(field=>Object.hasOwn(body,field))) reject(422,'EDEN_INVALID_REQUEST','Use a supported directory command.');
}
/** Keep Aoede answers brief by selecting exact, server-verified source extracts.
 * Raw page content and arbitrary browser text never enter a speech request. */
function spokenReply(sources: {id:string;text:string}[]) {
  const hours=sources.find(f=>/^resource-\d+-hours$/.test(f.id));
  const title=sources.find(f=>/^resource-\d+-title$/.test(f.id));
  const outcome=sources.find(f=>f.id==='outcome');
  const page=sources.find(f=>f.id.startsWith('page-'));
  const count=sources.find(f=>f.id==='result-count');
  const selected=hours ? [title,hours] : title ? [count??outcome,title] : [outcome,page??count];
  return selected.filter((f):f is {id:string;text:string}=>Boolean(f))
    .map(f=>/[.!?]$/.test(f.text)?f.text:f.text+'.').join(' ');
}

/** Apply shared counters across serverless instances. The service has no paid failover. */
async function admit(store:Store,id:string,bucket:string,limit:number,ttl:number){
  const count=await store(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",'1','og:adult:eden:v1:rate:'+bucket+':'+id,String(ttl)]);
  if(typeof count!=='number'||count<1)reject(503,'EDEN_LIMITER_UNAVAILABLE','The assistant is temporarily unavailable.');
  if((count as number)>limit)reject(429,'EDEN_USAGE_LIMIT','The assistant has reached its free usage limit.');
}

export function createHostedEden(deps:Dependencies,env:Environment,options:Options={}){
  const store=options.store??(command=>redis(env,command));
  const textModel=EDEN_TEXT_MODELS.find(m=>m===(env.EDEN_GEMINI_TEXT_MODEL??EDEN_TEXT_MODELS[0]));
  const speechModel=EDEN_TTS_MODELS.find(m=>m===(env.EDEN_GEMINI_TTS_MODEL??EDEN_TTS_MODELS[0]));
  const ready=()=>env.VERCEL==='1'&&env.VERCEL_ENV==='production'&&env.EDEN_HOSTED_COMMANDS==='enabled' &&
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
  return async function handle(request:Request,path:string){
    try{
      // Vercel overwrites x-vercel-ip-country. Only the verified deployment runtime may serve these routes.
      const nonce=await adultSessionNonce(request,env);
      if(!nonce)reject(403,'AGE_ACKNOWLEDGMENT_REQUIRED','Acknowledge the age requirement to continue.');
      if(request.headers.get('x-vercel-ip-country')!=='US')reject(403,'EDEN_REGION_UNAVAILABLE','EDEN is available to adults using this demo in the United States.');
      if(!ready())reject(403,'EDEN_DISABLED','Hosted EDEN is unavailable.');
      if(path==='status'&&request.method==='GET')return response({available:true,engine:'gemini',agentAvailable:true,speechAvailable:Boolean(speechModel),voice:'Aoede',rawAudioAccepted:false,liveTokensAvailable:false,noticeVersion:EDEN_NOTICE_VERSION});
      const origin=new URL(request.url).origin;
      if(request.method!=='POST'||request.headers.get('origin')!==origin)reject(403,'EDEN_ORIGIN_REQUIRED','Use the assistant on this site.');
      const binding=hash(origin+'|'+nonce);
      const body=await boundedJsonObject(request);
      if(path==='session'){
        fields(body,['noticeVersion','acknowledged']);
        if(body.noticeVersion!==EDEN_NOTICE_VERSION||body.acknowledged!==true)reject(403,'EDEN_NOTICE_REQUIRED','Review the privacy notice first.');
        await admit(store,binding,'session',5,3600);
        const sessionToken=token(),expiresAt=new Date(Date.now()+seconds*1000).toISOString();
        if(await store(['SET',key('session',hash(sessionToken)),binding,'EX',String(seconds),'NX'])!=='OK')reject(503,'EDEN_SESSION_UNAVAILABLE','Please try again.');
        return response({sessionToken,expiresAt,noticeVersion:EDEN_NOTICE_VERSION});
      }
      const credential=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'')?.[1];
      if(!validToken(credential))reject(401,'EDEN_SESSION_REQUIRED','Start an EDEN session.');
      const session=hash(credential!),sessionKey=key('session',session);
      if(await store(['GET',sessionKey])!==binding)reject(401,'EDEN_SESSION_EXPIRED','Start an EDEN session.');
      if(path==='end'){fields(body,[]);await store(['DEL',sessionKey]);return response({ended:true});}
      const now=new Date(), day=now.toISOString().slice(0,10), minute=Math.floor(now.getTime()/60000);
      async function capacity(tts:boolean){
        await admit(store,session+':'+minute,tts?'speech-minute':'text-minute',tts?2:8,65);
        await admit(store,String(minute),tts?'provider-speech-minute':'provider-text-minute',tts?3:12,65);
        await admit(store,day,tts?'speech-day':'text-day',tts?10:150,86460);
      }
      if(path==='plan'){
        const input=validateEdenAgentRequest(body);
        if(!input||input.context.directory!=='public'||input.context.synthetic) return response({error:{code:'EDEN_INVALID_REQUEST',message:'Use a supported public directory command.'}},422);
        if(input.intent.goal==='check-open-now'&&input.context.selectedIndex!==input.intent.ordinal)reject(409,'EDEN_SELECTION_CHANGED','Select the clinic again before asking about its hours.');
        await capacity(false);
        const result=await agent.begin(input,session,request.signal);
        if(await store(['GET',sessionKey])!==binding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return response(result);
      }
      if(path==='result'){
        fields(body,['turnToken','context','noticeVersion','outcome']);
        const context=validateEdenAgentContext(body.context);
        if(!context||context.directory!=='public'||context.synthetic||!validToken(body.turnToken)||body.noticeVersion!==EDEN_NOTICE_VERSION||!['done','failed'].includes(String(body.outcome)))return response({error:{code:'EDEN_INVALID_RESULT',message:'Use the current listing selection.'}},422);
        await capacity(false);
        const result=await agent.complete({turnToken:body.turnToken,outcome:body.outcome as 'done'|'failed',noticeVersion:EDEN_NOTICE_VERSION,resourceIds:context.resourceIds,context},session,request.signal);
        if(await store(['GET',sessionKey])!==binding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        const speechTicket=token();
        if(await store(['SET',key('speech',session+':'+hash(speechTicket)),spokenReply(result.sources),'EX','60','NX'])!=='OK')reject(503,'EDEN_SPEECH_UNAVAILABLE','Speech is temporarily unavailable.');
        return response({...result,speechTicket});
      }
      if(path==='speech'){
        fields(body,['speechTicket']);
        if(!speechModel||!validToken(body.speechTicket))reject(422,'EDEN_INVALID_SPEECH','Choose a current verified answer.');
        const reply=await store(['GETDEL',key('speech',session+':'+hash(body.speechTicket as string))]);
        if(typeof reply!=='string')reject(409,'EDEN_SPEECH_EXPIRED','Choose a current verified answer.');
        await capacity(true);
        const audio=await (options.speech??synthesizePublicSpeech)(reply as string,speechModel!,env.GEMINI_API_KEY!,request.signal);
        if(await store(['GET',sessionKey])!==binding)reject(401,'EDEN_SESSION_EXPIRED','The session ended.');
        return new Response(new Uint8Array(audio.data),{headers:{...cacheHeaders,'Content-Type':'audio/wav'}});
      }
      return response({error:{code:'EDEN_ROUTE_UNAVAILABLE',message:'Use the directory assistant.'}},404);
    }catch(error){
      if(error instanceof EdenProviderError || error instanceof EdenSpeechError || error instanceof RequestInputError) return response({error:{code:error.code,message:error.message}},error.status);
      return response({error:{code:'EDEN_UNAVAILABLE',message:'The assistant is temporarily unavailable.'}},503);
    }
  };
}
