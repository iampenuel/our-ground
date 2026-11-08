import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {adultGate} from '../backend/adult-access.ts';
import {createHostedEden} from '../backend/eden-hosted.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../shared/eden-assistant.ts';
import {sameDirectoryView} from '../shared/eden-agent.ts';

test('map readiness preserves a listing answer while a manual pin change invalidates it',()=>{
  const view={page:'resource',directory:'public',synthetic:false,cityId:'harrisburg',category:'healthcare',
    radius:25,searchState:'ready',mapState:'loading',resultCount:2,resourceIds:['clinic-a','clinic-b'],selectedIndex:1};
  assert(sameDirectoryView(view,{...view,mapState:'ready'}));
  assert(!sameDirectoryView(view,{...view,mapState:'ready'},true));
  for(const change of [{selectedIndex:2},{resourceIds:['clinic-b','clinic-a']},{cityId:'philadelphia'},
    {page:'about'},{searchState:'loading'},{resultCount:0}])assert(!sameDirectoryView(view,{...view,...change}));
  assert(!sameDirectoryView(view,null));
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
  assert.match(reply,/Unit health clinic B/);assert.match(reply,/no structured hours for listing 2/);assert.doesNotMatch(reply,/clinic A|Monday/);
  assert.equal((await b(req('result',finish,{headers}),'result')).status,409);
  const wire=JSON.stringify(captured);
  for(const excluded of ['never leave device','excluded source prose',rows[0].id,rows[1].id,'40.123','-76.138','Unit health clinic','audioData','correction_reports'])assert(!wire.includes(excluded));
  assert.equal((await a(req('speech',{speechTicket,privateText:'sensitive'},{headers}),'speech')).status,422);
  assert.equal((await a(req('speech',{speechTicket},{headers}),'speech')).status,200);assert.equal(audio.length,1);assert.match(audio[0],/Unit health clinic B.*no structured hours/);assert.doesNotMatch(audio[0],/clinic A|Monday/);
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
