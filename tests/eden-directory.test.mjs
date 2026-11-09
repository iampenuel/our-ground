import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDirectoryCityLookup} from '../backend/directory-city.ts';
import {createEdenDirectory} from '../backend/eden-directory.ts';
import {createEdenAgent} from '../backend/eden-agent.ts';
import {handleApi} from '../backend/app.ts';
import {reduceEdenAgentInput,validateEdenAgentContext} from '../shared/eden-agent.ts';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {edenLiveModelContext,validateEdenLivePublicResult} from '../shared/eden-live.ts';
import {combineSupportResults,supportMapPoints} from '../src/support-model.ts';

const home={page:'home',synthetic:false,directory:'public',resultCount:0,resourceIds:[],searchState:'idle'};
const cityId='harrisburg-pa',q={cityId,category:'food',radius:10};
const candidate={kind:'place',id:'census:2026:place:unit-test',state:'PA',display_name:'Harrisburg',latitude:40.27,longitude:-76.88,coordinate_precision:'representative',match:{ambiguous_matches:1,method:'exact',exact_match:true,local_similarity:1,edit_distance:0},source:{provider:'census',id:'census-gazetteer-2026',url:'https://www.census.gov/geographies/reference-files.html',vintage:2026,geographic_id:'unit-test'}};
const locate=createDirectoryCityLookup({findCandidates:async()=>[candidate]});
const env={EDEN_GEMINI_MODE:'synthetic-development',EDEN_GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_API_KEY:'unit-test-nonsecret',EDEN_LOCAL_DIRECTORY_ENABLED:'true',BACKEND_DATA_MODE:'postgres',ALLOW_DEMO_DATA:'false',DATABASE_URL:'unit-test-presence-only'};
const record={id:'aaaaaaaa-1111-5111-8111-aaaaaaaaaaaa',data_kind:'imported_unverified',title:'Directory title canary',summary:'Untrusted source prose',location:{latitude:40.27,longitude:-76.88},distance_miles:1,category_slugs:['food'],provenance:{source_id:'philly-food-sites',source_record_id:'unit',imported_at:'2026-11-01',source_updated_at:'2026-10-29',last_seen_at:'2026-11-01',verification_status:'stale_or_needs_review'}};
const support=(ids,radius=10)=>({...home,page:'support',cityId,category:'food',radius,searchState:'ready',resourceIds:ids,resultCount:ids.length});
const source=(row=record)=>({search:async input=>{assert.equal(input.allowDemo,false);assert.equal(input.page,1);return{total:1,items:[row]};},detail:async(id,allow)=>{assert.equal(allow,false);return id===row.id?row:null;}});
test('directory city uses one exact local lookup for concurrent requests, expires successes and does not cache failures',async()=>{
  let time=0,calls=0,rows=[candidate];
  const lookup=createDirectoryCityLookup({async findCandidates(name,state){calls++;assert.equal(name,'Harrisburg');assert.equal(state,'PA');return rows;}},()=>time);
  const [first,second]=await Promise.all([lookup(cityId),lookup(cityId)]);first.latitude=0;
  assert.equal(second.latitude,candidate.latitude);assert.equal((await lookup(cityId)).latitude,candidate.latitude);assert.equal(calls,1);
  time+=120001;rows=[candidate,candidate];await assert.rejects(lookup(cityId),{code:'DIRECTORY_CITY_UNAVAILABLE'});
  rows=[];await assert.rejects(lookup(cityId));rows=[candidate];await lookup(cityId);assert.equal(calls,4);
  await assert.rejects(lookup('unlisted private query'));assert.equal(calls,4);
});
test('database-only city route uses shared reference admission; failed lookup is never a successful empty directory',async()=>{
  const admitted=[];const req=path=>new Request('http://localhost/api/v1/'+path);
  const deps={directoryCity:locate,publicProtection:{admit:async name=>admitted.push(name)},realDirectoryConfigured:false};
  const resolved=await handleApi(req('places/directory-city?city=harrisburg-pa'),deps);
  assert.equal(resolved.status,200);assert.equal((await resolved.json()).location.quality.source,'reference');assert.deepEqual(admitted,['location_reference']);
  assert.equal((await handleApi(req('places/directory-city?city=bogus'),deps)).status,422);
  assert.equal((await handleApi(req('places/directory-city?city=harrisburg-pa'),{...deps,directoryCity:undefined})).status,503);
  assert.equal((await handleApi(req('resources?lat=40&lng=-76&data_kind=real'),deps)).status,503);
});
test('restricted local source boundary rejects fixtures, missing dates, changed IDs, inconsistent totals and missing configuration',async()=>{
  for(const row of [{...record,data_kind:'fictional_demo'},{...record,provenance:undefined},{...record,provenance:{...record.provenance,source_updated_at:null}},{...record,id:'11111111-1111-4111-8111-111111111111'},{...record,location:{latitude:null,longitude:null}},{...record,distance_miles:15}]){
    await assert.rejects(createEdenDirectory(source(row),locate).search(q),{code:'EDEN_SOURCE_NOT_APPROVED'});
  }
  await assert.rejects(createEdenDirectory({search:async()=>({total:2,items:[record]})},locate).search(q));
  for(const patch of [{VERCEL_ENV:'preview'},{NODE_ENV:'production'},{ALLOW_DEMO_DATA:'true'},{DATABASE_URL:''},{EDEN_LOCAL_DIRECTORY_ENABLED:'false'}]){
    assert.equal(createEdenAgent({...env,...patch},{repository:source(),directoryCity:locate}).status().available,false);
  }
  assert.equal(validateEdenAgentContext({...home,directory:undefined}),null);
  assert.equal(validateEdenAgentContext({...support([record.id]),synthetic:true}),null);
  assert.equal(validateEdenAgentContext(support(Array(20).fill(record.id))),null);
  assert.equal(reduceEdenAgentInput('My insurance number is 12345678',home).status,'sensitive');
});
test('typed model plans and composes by ID; only server-checked public title is rendered locally, never sent to the model',async()=>{
  const payloads=[],own=source(),agent=createEdenAgent(env,{repository:own,directoryCity:locate,create:async payload=>{
    payloads.push(payload);const data=JSON.parse(payload.input),name=payload.tools[0].name;
    const args=name==='perform_public_resource_action'?{action:{type:'search',city:cityId,category:'food',radius:10}}:{segments:['outcome','data-kind','result-count','resource-1-title'].map(id=>({kind:'fact',id}))};
    return {status:'requires_action',steps:[{type:'function_call',id:'unit',name,arguments:args}]};
  }});
  const command=reduceEdenAgentInput('Find food support near Harrisburg',home);assert.equal(command.status,'supported');
  const plan=await agent.begin({intent:command.intent,context:home,noticeVersion:EDEN_NOTICE_VERSION},'test');
  const after=support([record.id]),reply=await agent.complete({turnToken:plan.turnToken,outcome:'done',resourceIds:after.resourceIds,noticeVersion:EDEN_NOTICE_VERSION,context:after},'test');
  assert.match(reply.reply,/1 matching food listing within 10 miles of Harrisburg/);assert(reply.reply.includes(record.title));assert.equal(payloads.length,2);
  const wire=JSON.stringify(payloads);for(const privateField of [record.title,record.id,record.summary,'40.27','-76.88'])assert(!wire.includes(privateField));
  const live=await agent.inspectLiveContext(after);assert(validateEdenLivePublicResult(live));const publicWire=JSON.stringify({...live,context:edenLiveModelContext(live.context)});
  for(const field of [record.title,record.id,record.summary])assert(!publicWire.includes(field));assert.match(publicWire,/needs review/);
  await assert.rejects(agent.inspectLiveContext(support(['bbbbbbbb-1111-5111-8111-aaaaaaaaaaaa'])),{code:'EDEN_AGENT_CONTEXT_CHANGED'});
  await assert.rejects(agent.reconcileLiveAction({type:'details',index:1},after,'done',{...after,page:'resource'}),{code:'EDEN_AGENT_RESULT_UNCONFIRMED'});
  const selected={...after,page:'resource',selectedIndex:1};const focused=await agent.reconcileLiveAction({type:'select',index:1},selected,'done',{...selected,mapState:'unavailable'});assert(focused.facts.some(f=>f.id==='map-state'&&f.text.includes('unavailable')));
});
test('published count is independent of the first page; a true empty search and unavailable records remain distinct',async()=>{
  const many=Array.from({length:20},(_,i)=>({...record,id:record.id.slice(0,-2)+i.toString(16).padStart(2,'0')}));
  const repo={...source(),search:async()=>({total:219,items:many}),detail:async id=>many.find(r=>r.id===id)??null};
  const agent=createEdenAgent(env,{repository:repo,directoryCity:locate});
  const ids=(await createEdenDirectory(repo,locate).search(q)).ids;
  const result=await agent.inspectLiveContext(support(ids));
  assert(validateEdenLivePublicResult(result));assert.match(result.facts.find(f=>f.id==='result-count').text,/219 matching.*first 20/);
  repo.search=async()=>({items:[],total:0});const empty=await agent.inspectLiveContext(support([]));assert.match(empty.facts.find(f=>f.id==='result-count').text,/0 matching food listings within 10 miles of Harrisburg.*does not mean/);
  repo.search=async()=>{throw Error('unavailable');};await assert.rejects(agent.inspectLiveContext(support([])));
});
test('a corrected public category must name the reconciled category even when there are no matches',async()=>{
  const repo={...source(),search:async()=>({total:0,items:[]})};
  let omitCount=true;
  const agent=createEdenAgent(env,{repository:repo,directoryCity:locate,create:async payload=>{
    const name=payload.tools[0].name,context=JSON.parse(payload.input);
    if(name==='compose_verified_reply')assert(context.required_fact_ids.includes('result-count'));
    const args=name==='perform_public_resource_action'?{action:{type:'refine',category:'food'}}:
      {segments:(omitCount?['outcome']:['outcome','result-count']).map(id=>({kind:'fact',id}))};
    return {status:'requires_action',steps:[{type:'function_call',id:'unit',name,arguments:args}]};
  }});
  const before={...support([]),category:'healthcare'},after=support([]);
  const complete=async()=>{
    const plan=await agent.begin({intent:{goal:'change-category',category:'food'},context:before,noticeVersion:EDEN_NOTICE_VERSION},'test');
    return agent.complete({turnToken:plan.turnToken,outcome:'done',resourceIds:[],noticeVersion:EDEN_NOTICE_VERSION,context:after},'test');
  };
  await assert.rejects(complete(),{code:'EDEN_AGENT_COMPOSITION_REQUIRED'});
  omitCount=false;assert.match((await complete()).reply,/0 matching food listings within 10 miles of Harrisburg/);
});
// This optional local archive is historical API evidence, never a runtime data source.
const archive=await readFile(new URL('../output/phase-7d/real-directory-harrisburg.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>null);
test('historical Harrisburg HRSA coordinates and service IDs survive refinement and marker selection (archive replay only)',{skip:!archive},async()=>{
  const repo={search:async({category,radiusMiles})=>{const items=archive.items.filter(r=>r.category_slugs.includes(category)&&r.distance_miles<=radiusMiles);return {items,total:items.length};},detail:async id=>archive.items.find(r=>r.id===id)};
  const adapter=createEdenDirectory(repo,locate),agent=createEdenAgent(env,{repository:repo,directoryCity:locate});
  for(const [radius,count] of [[10,6],[5,4]]) {
    const query={cityId,category:'healthcare',radius};const {ids,total}=await adapter.search(query);assert.equal(total,count);
    const records=combineSupportResults((await repo.search({category:'healthcare',radiusMiles:radius})).items,[],'real');
    const [marker]=supportMapPoints(records);assert.equal(marker.place_id,'directory:'+ids[0]);
    const row=await repo.detail(ids[0]);assert.deepEqual([marker.latitude,marker.longitude],[row.location.latitude,row.location.longitude]);
    const before={...support(ids,radius),category:'healthcare'},after={...before,page:'resource',selectedIndex:1};
    const detail=await agent.reconcileLiveAction({type:'details',index:1},before,'done',after);assert(detail.facts.some(f=>f.text.includes('HRSA')));
    const map=await agent.reconcileLiveAction({type:'select',index:1},after,'done',{...after,mapState:'ready'});assert.equal(map.outcome,'done');
  }
});

test('hours follow the current clinic selection and stale indices are rejected',async()=>{
  const nextId='bbbbbbbb-1111-5111-8111-bbbbbbbbbbbb';
  const rows=[{...record,hours:[{weekday:1,opens_at:'09:00',closes_at:'17:00'}]}, {...record,id:nextId,hours:[]}];
  const repository={search:async()=>({total:2,items:rows}),detail:async id=>rows.find(row=>row.id===id)};
  const agent=createEdenAgent(env,{repository,directoryCity:locate});
  const prev={...support(rows.map(row=>row.id)),selectedIndex:1}, current={...prev,selectedIndex:2};
  const action={type:'read-hours',index:2};
  const proposed=reduceEdenAgentInput('What are this clinic’s hours?',current);
  assert.deepEqual(proposed.intent,{goal:'check-open-now',ordinal:2});
  await assert.rejects(agent.prepareLiveAction({type:'read-hours',index:1},current));
  const result=await agent.reconcileLiveAction(action,current,'done',current);
  assert.match(result.facts.find(f=>f.id==='resource-2-hours').text,/no structured hours/);
  assert.match((await agent.inspectLiveContext(prev)).facts.find(f=>f.id==='resource-1-hours').text,/Monday 09:00–17:00/);
  await assert.rejects(agent.reconcileLiveAction(action,current,'done',prev));
});
