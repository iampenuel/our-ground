import type {ResourceDetail} from '../shared/contracts.ts';
import type {SupportRequest} from './support-search.ts';
import {validResourceId} from './support-model.ts';

const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const normalized=(value:string|null|undefined)=>(value??'').trim().replace(/\s+/g,' ');
const reasons=[['wrong_hours','Hours are incorrect'],['closed','Service may be closed'],['wrong_contact','Contact information is incorrect'],['wrong_eligibility','Eligibility information is incorrect'],['wrong_location','Location is incorrect'],['other','Something else']] as const;
export type CorrectionDraft={label?:string;reason:string;description:string;open:boolean;dirty:boolean;pending:boolean;sent:boolean;message:string;retryUntil:number};

/** Sensitive report text stays in this page's memory, never browser storage or URLs. */
export function createCorrectionDrafts(){
 const drafts=new Map<string,CorrectionDraft>();
 const get=(id:string)=>{let draft=drafts.get(id);if(!draft){draft={reason:'wrong_hours',description:'',open:false,dirty:false,pending:false,sent:false,message:'',retryUntil:0};drafts.set(id,draft);}return draft;};
 return {get,update(id:string,values:Partial<Pick<CorrectionDraft,'reason'|'description'|'open'>>){const draft=get(id);if(values.description!==undefined)draft.description=values.description.slice(0,1000);if(values.reason!==undefined&&reasons.some(([code])=>code===values.reason))draft.reason=values.reason;if(values.open!==undefined)draft.open=values.open;draft.dirty=!draft.sent&&(draft.description.length>0||draft.reason!=='wrong_hours');return draft;},
  discard(id:string){const draft=get(id);if(draft.pending)return;Object.assign(draft,{reason:'wrong_hours',description:'',dirty:false,sent:false,message:'Draft discarded.',retryUntil:0});},
  unsaved:()=>[...drafts.entries()].filter(([,draft])=>draft.dirty||draft.pending).map(([id,draft])=>({id,draft})),
  hasUnsaved:()=>[...drafts.values()].some(d=>d.dirty||d.pending),
  unsavedCount:()=>[...drafts.values()].filter(d=>d.dirty||d.pending).length};
}

/** Facts are omitted when absent. Importer boilerplate never becomes a service claim. */
export function resourceUsefulFacts(resource:ResourceDetail):string {
 let description=normalized(resource.description),schedule='';
 const summary=normalized(resource.summary),source=resource.provenance?.source_id;
 if(source==='seattle-food-resources'||source==='pgc-food-assistance'){
  const marker='. Source-listed schedule: ',end='. Confirm current times before visiting.',index=description.indexOf(marker),endIndex=index>=0?description.indexOf(end,index+marker.length):-1;
  if(index>=0&&endIndex>=0&&(source==='pgc-food-assistance'||endIndex+end.length===description.length)){schedule=description.slice(index+marker.length,endIndex).trim();description=description.slice(0,index)+'.'+description.slice(endIndex+end.length);}
 }
 if(source==='pgc-food-assistance'){
  const kind=summary.split('. ')[0]+'.';if(description.startsWith(kind))description=description.slice(kind.length).trim();
  const cleanDisplay=(value:string)=>value.replace(/\.{2,}(?=\s|$)/g,'.').trim();schedule=cleanDisplay(schedule);description=cleanDisplay(description).replace(/Source-listed food format: /g,'Food format: ').replace(/Source-listed access: /g,'Access: ').replace(/Source-listed visit limits: /g,'Visit limits: ').replace(/Source says advance registration is required\./g,'Advance registration is required.');
 }
 if(!description||description===summary||description===summary+' This imported listing has not been independently verified by Our Ground.'||(['philly-food-sites','seattle-food-resources'].includes(source??'')&&summary.startsWith(description+' Listed by ')))description='';
 const hours=resource.hours.filter(h=>Number.isInteger(h.weekday)&&h.weekday>=0&&h.weekday<=6&&/^\d{2}:\d{2}/.test(h.opens_at)&&/^\d{2}:\d{2}/.test(h.closes_at));
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const time=(value:string)=>{const hour=Number(value.slice(0,2));return hour<=23&&Number(value.slice(3,5))<=59?(hour%12||12)+value.slice(2,5)+(hour>=12?' PM':' AM'):value;};
 const facts=[description?'<div><h4>'+(source==='pgc-food-assistance'?'Food &amp; access details':'What this location provides')+'</h4><p>'+esc(description)+'</p></div>':'',hours.length?'<div><h4>Hours</h4><dl>'+hours.map(h=>'<div><dt>'+weekdays[h.weekday]+'</dt><dd>'+esc(time(h.opens_at)+' – '+time(h.closes_at))+(h.notes?' · '+esc(h.notes):'')+'</dd></div>').join('')+'</dl><p class="discovery-note">Source-listed times. Confirm current hours and time zone before visiting.</p></div>':schedule?'<div><h4>Hours</h4><p>'+esc(schedule)+'</p><p class="discovery-note">Source-listed schedule. Confirm current times before visiting.</p></div>':'',normalized(resource.eligibility_text)?'<div><h4>Who it serves</h4><p>'+esc(normalized(resource.eligibility_text))+'</p></div>':'',normalized(resource.cost_summary)?'<div><h4>Cost</h4><p>'+esc(normalized(resource.cost_summary))+'</p></div>':''].filter(Boolean);
 // A basic import can still identify its public source record without implying known hours or services.
 const p=resource.provenance;
 if(!facts.length&&resource.data_kind==='imported_unverified'&&p?.source_record_id){
  return '<div><h4>Source record</h4><p>'+esc(p.source_name)+' · Record '+esc(p.source_record_id)+'</p><p>Contact the organization to confirm services, hours and availability before visiting.</p></div>';
 }
 return facts.join('');
}

export function correctionForm(id:string,draft:CorrectionDraft):string {
 const privacy='correctionPrivacy-'+id,status='correctionStatus-'+id;
 return '<p>Our Ground reviews reports privately. Reports do not immediately change the listing.</p><form class="support-correction-form" data-correction-form="'+esc(id)+'"'+(draft.pending?' aria-busy="true"':'')+'><label>What needs correcting?<select name="reason_code"'+(draft.pending||draft.sent?' disabled':'')+'>'+reasons.map(([code,label])=>'<option value="'+code+'"'+(draft.reason===code?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Details (optional)<textarea name="description" maxlength="1000" rows="3" aria-describedby="'+privacy+'"'+(draft.pending||draft.sent?' disabled':'')+'>'+esc(draft.description)+'</textarea></label><p class="discovery-note" id="'+privacy+'">Describe only the listing issue. Do not include resident names, personal contact details, medical or financial information, or identification documents. Maximum 1,000 characters. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy and retention<span class="visually-hidden"> (opens in a new tab)</span></a>.</p><div class="support-card-actions"><button type="submit" class="secondary-button"'+(draft.pending||draft.sent?' disabled':'')+'>'+(draft.pending?'Sending…':draft.sent?'Report received':'Send report')+'</button><button type="button" data-discard-report="'+esc(id)+'"'+(draft.pending||!draft.dirty?' hidden':'')+'>Discard draft</button></div><p class="discovery-note" data-draft-state>'+((draft.dirty||draft.pending)?'Unsaved draft kept on this page, including when you close it or change results. Leaving or reloading this page can discard it.':'')+'</p><p id="'+status+'" data-report-status role="status" aria-live="polite">'+esc(draft.message)+'</p></form>';
}

/** Only the public endpoint can supply a shared resource; mismatched identities fail closed. */
export async function fetchPublicResource(request:SupportRequest,id:string,signal:AbortSignal,scope:'public'|'synthetic-demo'='public'):Promise<ResourceDetail>{
 const valid=validResourceId(id);if(!valid)throw new Error('This resource link is invalid.');
 const resource=await request<ResourceDetail>('resources/'+encodeURIComponent(valid),{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
 if(validResourceId(resource.id)!==valid)throw new Error('The requested resource could not be verified.');
 if(scope==='public'&&resource.data_kind==='fictional_demo')throw new Error('This shared link is not a real public resource. Use explicit demonstration mode for examples.');
 if(scope==='synthetic-demo'&&resource.data_kind!=='fictional_demo')throw new Error('Only synthetic examples are permitted in this demonstration.');
 if(!Number.isFinite(resource.location.latitude)||!Number.isFinite(resource.location.longitude)||Math.abs(resource.location.latitude)>90||Math.abs(resource.location.longitude)>180)throw new Error('This resource has no valid public map location.');
 return resource;
}

export function mountCorrectionReports(container:HTMLElement,request:SupportRequest,onDraftChange:()=>void=()=>{}){
 const drafts=createCorrectionDrafts();let disposed=false;const controllers=new Set<AbortController>();
 function restore(onlyId?:string){
  container.querySelectorAll<HTMLDetailsElement>('[data-resource-report]').forEach(section=>{const id=section.dataset.resourceReport!;if(onlyId&&id!==onlyId)return;const draft=drafts.get(id);draft.label??=section.closest<HTMLElement>('[data-card-key]')?.querySelector<HTMLElement>('.discovery-select > span:not([class])')?.textContent??undefined;section.open=draft.open;section.querySelector<HTMLElement>('[data-correction-slot]')!.innerHTML=correctionForm(id,draft);});
 }
 function sync(form:HTMLFormElement){const id=form.dataset.correctionForm!;return drafts.update(id,{reason:form.querySelector<HTMLSelectElement>('[name="reason_code"]')?.value,description:form.querySelector<HTMLTextAreaElement>('[name="description"]')?.value});}
 function update(event:Event){const form=(event.target as Element).closest<HTMLFormElement>('[data-correction-form]');if(!form)return;const draft=sync(form);form.querySelector<HTMLElement>('[data-draft-state]')!.textContent=draft.dirty?'Unsaved draft kept on this page, including when you close it or change results. Leaving or reloading this page can discard it.':'';form.querySelector<HTMLButtonElement>('[data-discard-report]')!.hidden=!draft.dirty;onDraftChange();}
 function toggle(event:Event){const section=event.target as HTMLDetailsElement;if(section.matches('[data-resource-report]'))drafts.update(section.dataset.resourceReport!,{open:section.open});}
 function click(event:Event){const discard=(event.target as Element).closest<HTMLElement>('[data-discard-report]');if(!discard)return;event.preventDefault();const id=discard.dataset.discardReport!;drafts.discard(id);restore();container.querySelector<HTMLTextAreaElement>('[data-correction-form="'+id+'"] textarea')?.focus({preventScroll:true});onDraftChange();}
 function submit(event:Event){const form=event.target as HTMLFormElement;if(!form.matches('[data-correction-form]'))return;event.preventDefault();const id=form.dataset.correctionForm!,draft=sync(form);if(draft.pending||draft.sent)return;
  if(Date.now()<draft.retryUntil){draft.message='Please wait '+Math.ceil((draft.retryUntil-Date.now())/1000)+' seconds before trying again.';restore(id);return;}
  if(!validResourceId(id))return;const focusWasInside=form.contains(document.activeElement),section=form.closest<HTMLDetailsElement>('[data-resource-report]');draft.pending=true;draft.dirty=true;draft.message='Sending report…';restore(id);if(focusWasInside)section?.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});onDraftChange();const controller=new AbortController();controllers.add(controller);
  void request<{id:string}>('correction-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:id,reason_code:draft.reason,description:draft.description.trim()||null}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}).then(()=>{draft.sent=true;draft.dirty=false;draft.description='';draft.message='Thank you. Your report was received for review.';}).catch(error=>{draft.message=error instanceof Error?error.message:'The report could not be sent. Please try again.';const retry=(error as {retryAfterSeconds?:number})?.retryAfterSeconds;if(typeof retry==='number'&&Number.isSafeInteger(retry)&&retry>0&&retry<=2678400){draft.retryUntil=Date.now()+retry*1000;draft.message+=' Try again in '+retry+' seconds.';}}).finally(()=>{controllers.delete(controller);draft.pending=false;if(!disposed){restore(id);onDraftChange();}});
 }
 const beforeUnload=(event:BeforeUnloadEvent)=>{if(drafts.hasUnsaved()){event.preventDefault();event.returnValue='';}};
 container.addEventListener('input',update);container.addEventListener('change',update);container.addEventListener('toggle',toggle,true);container.addEventListener('click',click);container.addEventListener('submit',submit);window.addEventListener('beforeunload',beforeUnload);
 return {restore,drafts,destroy(){disposed=true;controllers.forEach(controller=>controller.abort());container.removeEventListener('input',update);container.removeEventListener('change',update);container.removeEventListener('toggle',toggle,true);container.removeEventListener('click',click);container.removeEventListener('submit',submit);window.removeEventListener('beforeunload',beforeUnload);}};
}
