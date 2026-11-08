import test from 'node:test';
import assert from 'node:assert/strict';
import {readSupportState,supportUrl,legacyResourceSupportUrl,resourceSupportUrl,validResourceId} from '../src/support-model.ts';
import {resourceUsefulFacts,createCorrectionDrafts,correctionForm,fetchPublicResource,mountCorrectionReports} from '../src/support-resource-context.ts';
import {supportCards} from '../src/support-view.ts';

const id='11111111-1111-4111-8111-111111111111';
const resource={id,title:'Example pantry',summary:'Source-supported pantry summary.',description:'Source-supported pantry summary.',category_slugs:['food'],organization:{id:'org',name:'Example pantry'},location:{city:'Harrisburg',state:'PA',address_label:'Public test address',latitude:40.27,longitude:-76.88},contact:{phone:'(717) 555-0123',website_url:'https://example.org/',directions_url:null},source:{url:'https://example.org/source',recorded_at:null},hours:[],eligibility_text:null,cost_summary:null,distance_miles:1,data_kind:'sourced_unverified',source_recorded_at:null};
const item={key:'directory:'+id,kind:'directory',record:resource};
test('resource URL state retains exact UUID and giving intent, drops coordinates and unsafe return fields',()=>{
 const old='/support?location=Boston%2C+MA&category=healthcare&radius_miles=25&view=list&intent=give&q=clinic&lat=1&lng=2&receipt=secret';
 const url=new URL(resourceSupportUrl(old,id),'https://example.test');
 assert.equal(url.pathname,'/support');assert.equal(url.searchParams.get('resource'),id);assert.equal(url.searchParams.get('intent'),'give');assert.equal(url.searchParams.get('q'),'clinic');assert.equal(url.searchParams.get('lat'),null);assert.equal(url.searchParams.get('receipt'),null);
 assert.equal(readSupportState(url.searchParams).resource,id);
 const temporary=supportUrl({...readSupportState(url.searchParams),temporaryLocation:true,publicLocation:'',location:'PRECISE PRIVATE ADDRESS'});assert.ok(!temporary.includes('PRECISE'));assert.ok(!temporary.includes('receipt'));
});
test('legacy route compatibility accepts only the exact resource path and safe support return context',()=>{
 const url=new URL(legacyResourceSupportUrl('/resources/'+id,'?return='+encodeURIComponent('/support?location=02108&intent=give')),'https://local');
 assert.equal(url.searchParams.get('resource'),id);assert.equal(url.searchParams.get('location'),'02108');assert.equal(url.searchParams.get('intent'),'give');
 for(const path of ['/resources/not-a-uuid','/resources/junk/'+id,'/resources/'+id+'/extra']){const invalid=new URL(legacyResourceSupportUrl(path,''),'https://local');assert.equal(invalid.searchParams.get('resource'),null);assert.equal(invalid.searchParams.get('resource_error'),'invalid');}
 const untrusted=new URL(legacyResourceSupportUrl('/resources/'+id,'?return='+encodeURIComponent('//evil.example/support?location=Miami')),'https://local');assert.equal(untrusted.searchParams.get('location'),'');assert.equal(validResourceId('geoapify:123'),null);
});
test('sparse source records have no visible extra facts or missing-information paragraphs',()=>{
 assert.equal(resourceUsefulFacts(resource),'');
 const html=supportCards([item],null,'/support');assert.doesNotMatch(html,/href="\/resources\/|About this location|<img|resource-symbol/);assert.match(html,/Report incorrect information/);assert.match(html,/Copy resource link/);
 assert.match(html,/tel:7175550123/);assert.match(html,/maps\/dir/);assert.match(html,/noopener noreferrer/);
});
test('meaningful details show only source-supported facts, escaping text and retaining schedule distinctions',()=>{
 const html=resourceUsefulFacts({...resource,description:'Community meals <script>bad</script>',eligibility_text:'Adults & families',cost_summary:'No fee',hours:[{weekday:1,opens_at:'09:30:00',closes_at:'13:00:00',notes:'Call first'}]});
 assert.match(html,/Community meals &lt;script&gt;/);assert.match(html,/Adults &amp; families/);assert.match(html,/9:30 AM/);assert.match(html,/1:00 PM/);assert.doesNotMatch(html,/not listed|not supplied|<img|resource-symbol/);
 const schedule=resourceUsefulFacts({...resource,provenance:{source_id:'seattle-food-resources'},description:'Community pantry. Source-listed schedule: First Tuesday, 10am to noon. Confirm current times before visiting.',summary:'Community pantry. Listed by the source.'});assert.match(schedule,/First Tuesday, 10am to noon/);assert.match(schedule,/<h4>Hours/);assert.doesNotMatch(schedule,/What this location provides/);
 assert.doesNotMatch(resourceUsefulFacts({...resource,description:'Source-listed schedule: secret',provenance:{source_id:'another'}}),/<h4>Hours/);
});
test('memory-only report drafts survive close/reopen and changes to other resources, with explicit discard',()=>{
 const drafts=createCorrectionDrafts();drafts.update(id,{reason:'wrong_contact',description:'Public listing telephone is disconnected.',open:true});
 drafts.update(id,{open:false});drafts.update('22222222-2222-4222-8222-222222222222',{open:true});
 assert.equal(drafts.get(id).description,'Public listing telephone is disconnected.');assert.equal(drafts.get(id).reason,'wrong_contact');assert.equal(drafts.hasUnsaved(),true);assert.equal(drafts.unsavedCount(),1);
 drafts.update(id,{open:true});assert.match(correctionForm(id,drafts.get(id)),/Public listing telephone is disconnected/);assert.match(correctionForm(id,drafts.get(id)),/Leaving or reloading/);
 drafts.discard(id);assert.equal(drafts.get(id).description,'');assert.equal(drafts.hasUnsaved(),false);
 drafts.update(id,{description:'x'.repeat(2000)});assert.equal(drafts.get(id).description.length,1000);drafts.get(id).pending=true;drafts.discard(id);assert.equal(drafts.hasUnsaved(),true);
});
test('submitted reports disable editable fields; forms escape drafts and preserve API privacy restrictions',()=>{
 const drafts=createCorrectionDrafts(),draft=drafts.update(id,{description:'<script>not markup</script>'});draft.sent=true;draft.dirty=false;
 const html=correctionForm(id,draft);assert.match(html,/select name="reason_code" disabled/);assert.match(html,/textarea[^>]+ disabled/);assert.match(html,/&lt;script&gt;/);assert.match(html,/maxlength="1000"/);assert.match(html,/do not immediately change/);assert.doesNotMatch(html,/<script>|localStorage|sessionStorage/);
});
test('mapped feedback uses only exact safe source URLs and never a directory report form',()=>{
 const mapped={key:'geoapify:opaque',kind:'geoapify',record:{place_id:'opaque',name:'Mapped pantry',address:'Public source address',category:'food',categories:['service.social_facility.food'],latitude:40,longitude:-76,distance_miles:1,attributions:[],source_feedback_url:'https://www.openstreetmap.org/node/123'}};
 const html=supportCards([mapped],null);assert.match(html,/Report mapped information/);assert.match(html,/openstreetmap.org\/node\/123/);assert.match(html,/handled externally/);assert.doesNotMatch(html,/data-resource-report|data-correction-form|service_id/);
 const unsafe=supportCards([{...mapped,record:{...mapped.record,source_feedback_url:'https://evil.example/node/123'}}],null);assert.doesNotMatch(unsafe,/evil\.example/);assert.match(unsafe,/geoapify.com\/about-us/);
 assert.doesNotMatch(supportCards([{...item,record:{...resource,data_kind:'fictional_demo'}}],null),/Report incorrect|Report mapped|tel:|maps\/dir|example.org/);
});
test('public deep-link loader rejects invalid, mismatched, fictional or inaccessible records without any provider request',async()=>{
 const paths=[];const request=async(path)=>{paths.push(path);return resource;};
 assert.equal((await fetchPublicResource(request,id,new AbortController().signal)).id,id);assert.deepEqual(paths,['resources/'+id]);
 await assert.rejects(fetchPublicResource(request,'invalid',new AbortController().signal),/invalid/);assert.equal(paths.length,1);
 await assert.rejects(fetchPublicResource(async()=>({...resource,id:'22222222-2222-4222-8222-222222222222'}),id,new AbortController().signal),/verified/);
 await assert.rejects(fetchPublicResource(async()=>({...resource,data_kind:'fictional_demo'}),id,new AbortController().signal),/not a real public/);
 await assert.rejects(fetchPublicResource(async()=>({...resource,location:{...resource.location,latitude:NaN}}),id,new AbortController().signal),/valid public/);
 await assert.rejects(fetchPublicResource(async()=>{throw Error('Resource not found');},id,new AbortController().signal),/not found/);
});
test('OpenPGC disclosure includes the exact local notice only for the reviewed source binding',()=>{
 const provenance={source_id:'pgc-food-assistance',source_name:'County source',source_url:'https://data.princegeorgescountymd.gov/',source_updated_at:'2026-11-06',imported_at:'2026-11-06',license_name:'County terms',license_url:'https://data.princegeorgescountymd.gov/terms-of-use'};
 assert.match(supportCards([{...item,record:{...resource,provenance}}],null),/href="\/data-notices\/openpgc.html"/);
 assert.doesNotMatch(supportCards([{...item,record:{...resource,provenance:{...provenance,source_id:'unreviewed'}}}],null),/data-notices/);
});

test('hidden draft recovery enumerates only unsaved memory entries and retains text after an unavailable public record',async()=>{
 const drafts=createCorrectionDrafts(),other='22222222-2222-4222-8222-222222222222';
 drafts.update(id,{description:'Correction text kept locally.',reason:'wrong_location'});drafts.get(id).label='Public test listing';drafts.update(other,{description:'Another draft'});
 assert.deepEqual(drafts.unsaved().map(entry=>entry.id),[id,other]);
 await assert.rejects(fetchPublicResource(async()=>{throw Error('Resource not found');},id,new AbortController().signal),/not found/);
 assert.equal(drafts.get(id).description,'Correction text kept locally.');assert.equal(drafts.get(id).label,'Public test listing');
 drafts.discard(other);assert.deepEqual(drafts.unsaved().map(entry=>entry.id),[id]);drafts.discard(id);assert.deepEqual(drafts.unsaved(),[]);
});

test('reviewed Maryland schedules separate into Hours while food format and access stay useful and escaped',()=>{
 const value={...resource,provenance:{source_id:'pgc-food-assistance'},summary:'Food distribution. Listed by Prince George’s County Office of Food Security.',description:'Food distribution. Source-listed schedule: Tuesday: 12pm until supplies last. 3rd Tuesday of each month.. Confirm current times before visiting. Source-listed food format: Prepacked <bag/box/cart>. Source-listed access: Drive-through. Source says advance registration is required. Source-listed visit limits: Once per month.'};
 const original=value.description,html=resourceUsefulFacts(value);assert.match(html,/<h4>Hours/);assert.match(html,/3rd Tuesday of each month\./);assert.doesNotMatch(html,/month\.\.|Food distribution\.|Source-listed food format|What this location provides/);assert.match(html,/Food format: Prepacked &lt;bag\/box\/cart&gt;/);assert.match(html,/Access: Drive-through/);assert.match(html,/Advance registration is required/);assert.match(html,/Visit limits: Once per month/);assert.equal(value.description,original);
 const unbound=resourceUsefulFacts({...value,provenance:{source_id:'unreviewed'}});assert.doesNotMatch(unbound,/<h4>Hours/);assert.match(unbound,/Source-listed schedule:/);
});

test('asynchronous report completion rehydrates only its own form without taking focus from a second draft',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,listeners=new Map(),browserListeners=new Map(),sections=[],slotWrites=new Map();
 globalThis.window={addEventListener:(name,handler)=>browserListeners.set(name,handler),removeEventListener:name=>browserListeners.delete(name)};globalThis.document={activeElement:null};
 const other='22222222-2222-4222-8222-222222222222';
 const create=(recordId,label)=>{const slot={set innerHTML(value){slotWrites.set(recordId,(slotWrites.get(recordId)??0)+1);this.value=value;}};const summary={focus(){globalThis.document.activeElement=this;}};const section={dataset:{resourceReport:recordId},open:false,querySelector(selector){return selector==='summary'?summary:slot;},closest(){return{querySelector:()=>({textContent:label})};}};sections.push(section);const textarea={value:'Public correction text',selectionStart:5};const form={dataset:{correctionForm:recordId},matches:()=>true,querySelector:selector=>selector.includes('reason_code')?{value:'wrong_contact'}:textarea,closest:()=>section,contains:element=>element===textarea};return{form,textarea,summary};};
 const first=create(id,'First public listing'),second=create(other,'Second public listing'),container={querySelectorAll:()=>sections,addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)};
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const calls=[];let reports;
 try{reports=mountCorrectionReports(container,async(path,init)=>{calls.push({path,body:JSON.parse(init.body)});return pending;});reports.restore();assert.equal(slotWrites.get(id),1);assert.equal(slotWrites.get(other),1);globalThis.document.activeElement=first.textarea;listeners.get('submit')({target:first.form,preventDefault(){}});assert.equal(globalThis.document.activeElement,first.summary);assert.equal(slotWrites.get(id),2);assert.equal(slotWrites.get(other),1);
  globalThis.document.activeElement=second.textarea;second.textarea.selectionStart=7;finish({id:'report'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(globalThis.document.activeElement,second.textarea);assert.equal(second.textarea.selectionStart,7);assert.equal(slotWrites.get(id),3);assert.equal(slotWrites.get(other),1);assert.equal(calls.length,1);assert.equal(calls[0].path,'correction-reports');assert.equal(calls[0].body.service_id,id);assert.equal(reports.drafts.get(id).sent,true);assert.equal(reports.drafts.hasUnsaved(),false);
 }finally{reports?.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

test('only exact known HRSA importer boilerplate is reduced and human additions remain unchanged',()=>{
 const standard='HRSA-listed health center. Contact the site to confirm services, hours, costs, eligibility and current availability.',seasonal=standard.replace('health center.','health center (seasonal site).');
 const render=(summary,source_id='hrsa-health-centers')=>supportCards([{...item,record:{...resource,summary,provenance:{source_id,source_name:'TEST source',source_url:'https://example.org/',source_updated_at:'2026-11-06',imported_at:'2026-11-06'}}}],null);
 assert.match(render(standard),/support-card-summary">HRSA-listed health center\.<\/p>/);assert.match(render(seasonal),/support-card-summary">HRSA-listed health center \(seasonal site\)\.<\/p>/);
 const human=standard+' Walk-in dental service on Tuesdays.';assert.match(render(human),/Walk-in dental service on Tuesdays\./);assert.match(render(human),/Contact the site to confirm services/);assert.match(render(standard,'other-source'),/Contact the site to confirm services/);
});
