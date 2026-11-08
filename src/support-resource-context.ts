import type {ResourceDetail} from '../shared/contracts.ts';
import type {SupportRequest} from './support-search.ts';
import {validResourceId} from './support-model.ts';

const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const normalized=(value:string|null|undefined)=>(value??'').trim().replace(/\s+/g,' ');
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
