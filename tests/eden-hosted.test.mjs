import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {adultGate} from '../backend/adult-access.ts';
import {createHostedEden} from '../backend/eden-hosted.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';
import {reduceEdenAgentInput,sameDirectoryView} from '../shared/eden-agent.ts';

test('map readiness preserves a listing answer while a manual pin change invalidates it',()=>{
  const view={page:'resource',directory:'public',synthetic:false,cityId:'harrisburg',category:'healthcare',
    radius:25,searchState:'ready',mapState:'loading',resultCount:2,resourceIds:['clinic-a','clinic-b'],selectedIndex:1};
  assert(sameDirectoryView(view,{...view,mapState:'ready'}));
  assert(!sameDirectoryView(view,{...view,mapState:'ready'},true));
  for(const change of [{selectedIndex:2},{resourceIds:['clinic-b','clinic-a']},{cityId:'philadelphia'},
    {page:'about'},{searchState:'loading'},{resultCount:0}])assert(!sameDirectoryView(view,{...view,...change}));
  assert(!sameDirectoryView(view,null));
});

test('on-device hours transcriptions use the current clinic and exclude appended private text',()=>{
  const view={page:'resource',directory:'public',synthetic:false,cityId:'harrisburg-pa',category:'healthcare',radius:25,
    searchState:'ready',resultCount:2,resourceIds:['11111111-1111-5111-8111-111111111111','22222222-2222-5222-8222-222222222222'],selectedIndex:2};
  for(const query of ['What are this clinic’s hours?', 'What are these clinics hours', 'What are this clinics ours?',
    'What are the hours for this clinic?', 'What are its hours?', 'Clinic hours']){
    assert.deepEqual(reduceEdenAgentInput(query,view),{status:'supported',intent:{goal:'check-open-now',ordinal:2}},query);
  }
  const {selectedIndex,...noSelection}=view;
  assert.equal(reduceEdenAgentInput('What are its hours?',noSelection).status,'clarify');
  assert.notEqual(reduceEdenAgentInput('What are its hours? My home address is 123 Example Lane.',view).status,'supported');
});

const origin='https://protected.example';
const env={VERCEL:'1',VERCEL_ENV:'production',EDEN_HOSTED_COMMANDS:'enabled',EDEN_GEMINI_FREE_TIER_CONFIRMED:'true',
  GEMINI_API_KEY:'nonsecret-key-fixture',BACKEND_DATA_MODE:'postgres',ALLOW_DEMO_DATA:'false',DATABASE_URL:'unit-only',
  ADULT_SESSION_SECRET:randomBytes(32).toString('base64url')};
const rows=['Unit health clinic A','Unit health clinic B'].map((title,i)=>({
  id:'aaaaaaaa-1111-5111-8111-'+(i?'bbbbbbbbbbbb':'aaaaaaaaaaaa'),title,summary:'excluded source prose',
  data_kind:'imported_unverified',location:{latitude:40.123,longitude:-76.138},distance_miles:i+1,category_slugs:['healthcare'],
  provenance:{source_id:'hrsa-health-centers',source_record_id:'unit'+i,imported_at:'2026-11-01',source_updated_at:'2026-10-29',
    last_seen_at:'2026-11-01',verification_status:'imported_unverified'},hours:i===0?[{weekday:1,opens_at:'09:00',closes_at:'17:00'}]:[]
}));
const deps={realDirectoryConfigured:true,directoryCity:async()=>({latitude:40.27,longitude:-76.88}),repo:{
  search:async()=>({items:rows,total:2}),detail:async(id,allowDemo)=>{assert.equal(allowDemo,false);return rows.find(r=>r.id===id);}
}};
const ctx={page:'support',directory:'public',synthetic:false,resourceIds:rows.map(r=>r.id),resultCount:2,cityId:'harrisburg-pa',radius:10,category:'healthcare',selectedIndex:2,searchState:'ready'};
function memory(){
  const data=new Map();
  return async ([cmd,...args])=>{
    if(cmd==='EVAL'){const key=args[2],n=(data.get(key)??0)+1;data.set(key,n);return n;}
    if(cmd==='SET'){if(args.includes('NX')&&data.has(args[0]))return null;data.set(args[0],args[1]);return 'OK';}
    const v=data.get(args[0]);if(cmd==='GETDEL'||cmd==='DEL')data.delete(args[0]);return v??null;
  };
}
async function cookie(){
  const reply=await adultGate(new Request(origin+'/eligibility',{method:'POST',headers:{Origin:origin},
    body:new URLSearchParams({age:'19plus'})}),env);
  return reply.headers.get('set-cookie').split(';')[0];
}
function req(path,body={},options={}){
  const headers={'Content-Type':'application/json',Origin:origin,'x-vercel-ip-country':'US',...options.headers};
  return new Request(origin+'/api/v1/eden/hosted/'+path,{method:'POST',headers,body:JSON.stringify(body)});
}

test('only an eligible US session may submit a finite command; forged envelopes do not reach the model',async()=>{
  let providerCalls=0;
  const handle=createHostedEden(deps,env,{store:memory(),create:async()=>{providerCalls++;}});
  const age=await cookie(),headers={cookie:age};
  for(const more of [{cookie:''},{cookie:'__Host-og-adult=true'},{'x-vercel-ip-country':'CA'},{'x-vercel-ip-country':''},{Origin:'https://evil.invalid'}]){
    const r=await handle(req('session',{noticeVersion,acknowledged:true},{headers:{...headers,...more}}),'session');assert.equal(r.status,403);
  }
  const open=await handle(req('session',{noticeVersion,acknowledged:true},{headers}),'session');
  const {sessionToken}=await open.json();assert(sessionToken);headers.Authorization='Bearer '+sessionToken;
  for(const field of ['transcript','audio','location','image','correction']){
    const r=await handle(req('plan',{noticeVersion,context:ctx,intent:{goal:'check-open-now',ordinal:2},[field]:'never leave device'},{headers}),'plan');
    assert.equal(r.status,422);
  }
  const mismatch=await handle(req('plan',{noticeVersion,context:ctx,intent:{goal:'check-open-now',ordinal:1}},{headers}),'plan');
  assert.equal(mismatch.status,409);assert.equal(providerCalls,0);
});

test('two instances complete a command for the newly selected clinic and speak only its attested answer',async()=>{
  const captured=[],audio=[],store=memory();
  const options={store,create:async payload=>{
    captured.push(JSON.parse(payload.input));
    const name=payload.tools[0].name;
    const args=name==='perform_public_resource_action'?{action:{type:'read-hours',index:2}}:
      {segments:['outcome','data-kind','hours-unverified','resource-2-title','resource-2-hours'].map(id=>({kind:'fact',id}))};
    return {status:'requires_action',steps:[{type:'function_call',id:'fixture',name,arguments:args}]};
  },speech:async text=>{audio.push(text);return{data:new Uint8Array([1,2]),mimeType:'audio/wav'};}};
  const a=createHostedEden(deps,env,options),b=createHostedEden(deps,env,options);
  const headers={cookie:await cookie()};
  const session=await (await a(req('session',{noticeVersion,acknowledged:true},{headers}),'session')).json();
  headers.Authorization='Bearer '+session.sessionToken;
  const plan=await (await a(req('plan',{intent:{goal:'check-open-now',ordinal:2},noticeVersion,context:ctx},{headers}),'plan')).json();
  assert.equal(plan.action.index,2);
  const finish={context:ctx,noticeVersion,turnToken:plan.turnToken,outcome:'done'};
  const result=await b(req('result',finish,{headers}),'result');
  assert.equal(result.status,200);const {reply,speechTicket}=await result.json();
  assert.equal(captured.length,1,'hours need one genuine model plan and a direct read of the selected listing');
  assert.match(reply,/Unit health clinic B/);assert.match(reply,/no structured hours for listing 2/);assert.doesNotMatch(reply,/clinic A|Monday/);
  assert.equal((await b(req('result',finish,{headers}),'result')).status,409);
  const wire=JSON.stringify(captured);
  for(const excluded of ['never leave device','excluded source prose',rows[0].id,rows[1].id,'40.123','-76.138','Unit health clinic','audioData','correction_reports'])assert(!wire.includes(excluded));
  assert.equal((await a(req('speech',{speechTicket,privateText:'sensitive'},{headers}),'speech')).status,422);
  const voice=await a(req('speech',{speechTicket},{headers}),'speech');
  assert.equal(voice.status,200);assert.deepEqual(audio,[reply]);
  assert.equal(voice.headers.get('X-Eden-Speech-Voice'),'Aoede');
  assert.equal(voice.headers.get('X-Eden-Speech-Model'),'gemini-3.8-flash-lite-tts');
  assert.equal(voice.headers.get('X-Eden-Speech-Text-SHA256'),createHash('sha256').update(reply).digest('hex'));
  assert.equal((await a(req('speech',{speechTicket},{headers}),'speech')).status,409);
  assert.equal((await b(req('end',{},{headers}),'end')).status,200);
  assert.equal((await a(req('plan',{}, {headers}),'plan')).status,401);
});

test('independent signed browser sessions have independent allowances and cannot use each other’s EDEN tokens',async()=>{
  const handle=createHostedEden(deps,env,{store:memory()});
  const first=await cookie(),second=await cookie();
  const start=c=>handle(req('session',{noticeVersion,acknowledged:true},{headers:{cookie:c}}),'session');
  const token=(await (await start(first)).json()).sessionToken;
  assert.equal((await handle(req('end',{}, {headers:{cookie:second,Authorization:'Bearer '+token}}),'end')).status,401);
  for(let i=0;i<4;i++)assert.equal((await start(first)).status,200);
  assert.equal((await start(first)).status,429);
  assert.equal((await start(second)).status,200);
});

test('a verified public identity reply owns a one-use Aoede grant tied to its session',async()=>{
  const spoken=[];
  const handle=createHostedEden(deps,env,{store:memory(),create:async payload=>{
    const choices=JSON.parse(payload.input).choices;
    const profile=choices.find(c=>c.kind==='message'&&c.key==='identity'&&c.focus==='tour');
    assert(profile);
    return {status:'requires_action',steps:[{type:'function_call',id:'fixture',name:payload.tools[0].name,arguments:{choice:profile.id}}]};
  },speech:async text=>{spoken.push(text);return {data:new Uint8Array([1,2]),mimeType:'audio/wav'};}});
  async function open(){
    const headers={cookie:await cookie()};
    const {sessionToken}=await (await handle(req('session',{acknowledged:true,noticeVersion},{headers}),'session')).json();
    return {...headers,Authorization:'Bearer '+sessionToken};
  }
  const first=await open(),second=await open();
  const correlationId='1286a58a-913a-4f45-aa76-5daf09bc5671';
  const interpreted=await handle(req('understand',{
    symbols:['identity'],context:ctx,controls:[],previous:null,noticeVersion,
  },{headers:{...first,'x-eden-correlation-id':correlationId}}),'understand');
  assert.equal(interpreted.headers.get('x-eden-correlation-id'),correlationId);
  assert.equal(interpreted.headers.get('x-eden-text-model'),'gemini-3.5-flash-lite');
  const {reply,speechTicket}=await interpreted.json();
  assert.match(reply,/Eden/i);assert.match(speechTicket,/^[A-Za-z0-9_-]{43}$/);
  const say=headers=>handle(req('speech',{speechTicket},{headers}),'speech');
  assert.equal((await say(second)).status,409);
  assert.equal((await say(first)).status,200);
  assert.equal((await say(first)).status,409);
  assert.deepEqual(spoken,[reply]);
});

test('speech admission and Google 429 responses identify their own attempts and never disable text actions',async()=>{
  for(const source of ['our-ground','google']){
    const counters=[],synthesis=[],raw=memory();
    const handle=createHostedEden(deps,env,{
      store:async command=>{
        if(command[0]==='EVAL'&&command[3].includes('speech-')){
          counters.push(command[3].split(':rate:')[1].split(':')[0]);
          if(source==='our-ground'&&command[3].includes(':speech-day:'))return 11;
        }
        return raw(command);
      },
      create:async payload=>{
        const profile=JSON.parse(payload.input).choices.find(c=>c.key==='identity');
        return {status:'requires_action',steps:[{type:'function_call',id:'fixture',name:payload.tools[0].name,arguments:{choice:profile.id}}]};
      },
      speech:async(text,model,secret,signal)=>{
        synthesis.push(1);
        const {synthesizePublicSpeech}=await import('../backend/eden-speech.ts');
        // This injected SDK transport always throws locally; there is no network.
        return synthesizePublicSpeech(text,model,secret,signal,{create:async()=>{
          throw {status:429,error:{code:'too_many_requests',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'8s'}]}};
        }});
      },
    });
    const headers={cookie:await cookie()};
    const {sessionToken}=await (await handle(req('session',{noticeVersion,acknowledged:true},{headers}),'session')).json();
    headers.Authorization='Bearer '+sessionToken;
    const understand=()=>handle(req('understand',{symbols:['identity'],context:ctx,controls:[],previous:null,noticeVersion},{headers}),'understand');
    const answer=await (await understand()).json();
    const speak=()=>handle(req('speech',{speechTicket:answer.speechTicket},{headers}),'speech');
    const blocked=await speak(),failure=await blocked.json();
    assert.equal(blocked.status,429);assert.equal(failure.error.quota.source,source);
    assert.equal(failure.error.quota.model,'gemini-3.8-flash-lite-tts');
    assert.equal(blocked.headers.get('Retry-After'),String(failure.error.quota.retryAfterSeconds));
    assert.equal(failure.error.code,source==='google'?'SPEECH_QUOTA_EXHAUSTED':'EDEN_USAGE_LIMIT');
    if(source==='google')assert.equal(failure.error.quota.providerCode,'too_many_requests');
    else assert.deepEqual(failure.error.quota.violations,[{quotaId:'speech-day',effectiveLimit:10}]);
    assert.equal((await speak()).status,409,'replayed grant never consumes another admission');
    assert.deepEqual(counters,['speech-minute','provider-speech-minute','speech-day']);
    assert.equal(synthesis.length,source==='google'?1:0);
    assert.equal((await understand()).status,200,'the same session can still answer text');
  }
});

test('production Live requires explicit approval, the exact production project and enabled client flag',async()=>{
 const age=await cookie();
 for(const [project,approved,client,expected]of [
   ['prj_4li6QnqulPgPbJpxMW2L9hczDNrS',undefined,'true',false],
   ['unrelated-project','true','true',false],
   ['prj_4li6QnqulPgPbJpxMW2L9hczDNrS','true','false',false],
   ['prj_4li6QnqulPgPbJpxMW2L9hczDNrS','true','true',true],
 ]){
   const handle=createHostedEden(deps,{...env,VERCEL_PROJECT_ID:project,EDEN_LIVE_PRODUCTION_APPROVED:approved,VITE_EDEN_HOSTED_LIVE:client},{store:memory()});
   const r=await handle(new Request(origin+'/api/v1/eden/hosted/status',{headers:{cookie:age,'x-vercel-ip-country':'US'}}),'status');
   assert.equal(r.status,200);const body=await r.json();assert.equal(body.liveTokensAvailable,expected);
   if(expected){assert.equal(body.liveTestLimits.teamStarts,24);assert.equal(body.liveTestLimits.seats,2);assert.equal(body.liveTestLimits.maxCallSeconds,600);}
 }
});


test('hosted daily voice errors provide authoritative reset and retry times without calling Google',async()=>{
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10),resetAt=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString();
 const projectBudget='og:adult:eden:v1:rate:live:'+createHash('sha256').update('project:'+day).digest('hex');
 const backing=memory(),store=command=>command[0]==='GET'&&command[1]===projectBudget?Promise.resolve('32'):backing(command);
 const preview={...env,VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_eU9xRSetSQYTbkAce2cYIR5zx8c2',VITE_EDEN_HOSTED_LIVE:'true'};
 const handle=createHostedEden(deps,preview,{store}),headers={cookie:await cookie()};
 const opening=await handle(req('session',{noticeVersion,acknowledged:true},{headers}),'session');
 headers.Authorization='Bearer '+(await opening.json()).sessionToken;
 const r=await handle(req('live/token',{noticeVersion,liveAudioAcknowledged:true,nonce:'n'.repeat(43),context:ctx},{headers}),'live/token');
 assert.equal(r.status,429);const body=await r.json();
 assert.equal(body.error.code,'EDEN_LIVE_PROVIDER_BUDGET');assert.equal(body.error.resetAt,resetAt);assert.equal(body.error.retryAt,resetAt);
 const serverNow=Date.parse(r.headers.get('Date')),wait=Number(r.headers.get('Retry-After'));
 assert(Number.isFinite(serverNow));assert(wait>=0&&wait<=86400);
 assert(Math.abs(wait-(Date.parse(resetAt)-serverNow)/1000)<=2);
 assert.doesNotMatch(JSON.stringify(body),/GEMINI_API_KEY|auth_tokens/);
});
