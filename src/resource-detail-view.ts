import type {ResourceDetail} from '../shared/contracts.ts';
import {categoryName,contactActions,safeWebUrl} from './directory.ts';
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const pinIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 0 14 0Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" stroke-width="1.6"/></svg>';
import {resourceSymbol} from './resource-symbol.ts';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const phoneIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 3 4 5-2 3a13 13 0 0 0 5 5l3-2 5 4-2 3C10 22 2 14 3 5l3-2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const webIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.5"/></svg>';
const normalized=(text:string)=>text.trim().replace(/\s+/g,' ');
const external=(url:string,label:string,icon='')=>`<a class="secondary-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon}${esc(label)}<span class="visually-hidden"> (opens a new tab)</span></a>`;
function date(value:string|null|undefined) {return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}):null;}
function displayTime(value:string) {
 const match=/^(\d{2}):(\d{2})/.exec(value);if(!match)return value;
 const hour=Number(match[1]);if(hour>23||Number(match[2])>59)return value;
 return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
/** This reviewed adapter preserves free-form schedules as source text, never invented weekday times. */
function sourceSchedule(resource:ResourceDetail):{description:string,schedule:string}|null {
 if(resource.provenance?.source_id!=='seattle-food-resources')return null;
 const text=normalized(resource.description),marker='. Source-listed schedule: ',end='. Confirm current times before visiting.';
 const index=text.indexOf(marker);
 if(index<0||!text.endsWith(end))return null;
 const schedule=text.slice(index+marker.length,-end.length).trim();
 return schedule?{description:text.slice(0,index)+'.',schedule}:null;
}
/** Do not repeat importer boilerplate as if it were location-specific service detail. */
export function meaningfulResourceDescription(resource:ResourceDetail):string|null {
 const summary=normalized(resource.summary),description=sourceSchedule(resource)?.description??normalized(resource.description);
 if(resource.provenance&&['philly-food-sites','seattle-food-resources'].includes(resource.provenance.source_id)&&summary.startsWith(description+' Listed by '))return null;
 if(!description||description===summary||description===summary+' This imported listing has not been independently verified by Our Ground.')return null;
 return description;
}
/** Available facts determine page length. No missing field becomes an inferred service. */
export function resourceDetailContent(resource:ResourceDetail,options:{mapAvailable?:boolean}={}):string {
 const demo=resource.data_kind==='fictional_demo',imported=resource.data_kind==='imported_unverified';
 const provenance=resource.provenance,needsReview=provenance?.verification_status==='stale_or_needs_review',actions=contactActions(resource);
 const source=demo?null:safeWebUrl(resource.source.url),recorded=date(resource.source.recorded_at);
 const description=meaningfulResourceDescription(resource),schedule=sourceSchedule(resource)?.schedule;
 const hrsaSummary=/^HRSA-listed health center(?: \(seasonal site\))?\./.exec(resource.summary);
 const summary=hrsaSummary?hrsaSummary[0]:normalized(resource.summary);
 const sourceDate=provenance?date(provenance.source_updated_at):null,importDate=provenance?date(provenance.imported_at):null;
 const labels=resource.category_slugs.map(category=>`<span class="detail-category">${esc(categoryName(category))}</span>`).join('');
 const recordLabel=demo?'Fictional demo':imported?(needsReview?'Imported · needs review':'Imported · unverified'):'Sourced · unverified';
 const trust=demo?'Fictional example — not a real service. Do not visit this location.':needsReview?'This imported record needs review. Confirm current information directly with the location.':imported?'Imported source information; not independently verified. Confirm current availability with the location.':'Source information; not independently verified. Confirm current availability with the location.';
 const address=normalized(resource.location.address_label),city=`${resource.location.city}, ${resource.location.state}`;
 const addressLine=address?esc(address):'Street address not listed.';
 const contactButtons=[actions.phone?`<a class="search-button" href="${esc(actions.phone)}">${phoneIcon}Call location</a>`:'',actions.directions?external(actions.directions,'Directions',pinIcon):'',actions.website?external(actions.website,'Website',webIcon):''].join('');
 const licenseUrl=demo?null:safeWebUrl(provenance?.license_url??null);
 const license=provenance&&!demo?(provenance.license_name?`<p>License: ${licenseUrl?`<a href="${esc(licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(provenance.license_name)}<span class="visually-hidden"> (opens a new tab)</span></a>`:esc(provenance.license_name)}</p>`:'')+(provenance.attribution?`<p>${esc(provenance.attribution)}</p>`:''):'';
 const hours=resource.hours.length?`<dl class="detail-hours">${resource.hours.map(hour=>`<div><dt>${esc(weekdays[hour.weekday]??'Day not provided')}</dt><dd>${esc(displayTime(hour.opens_at))} – ${esc(displayTime(hour.closes_at))}${hour.notes?`<span>${esc(hour.notes)}</span>`:''}</dd></div>`).join('')}</dl><p class="detail-fine-print">Listed times as supplied. Confirm the time zone; unlisted days have no schedule provided.</p>`:schedule?`<p>${esc(schedule)}</p><p class="detail-fine-print">Schedule text supplied by the source. Confirm current times before visiting.</p>`:'<p class="detail-missing">Hours not listed. Contact this location before visiting.</p>';
 const eligibility=resource.eligibility_text?`<p>${esc(resource.eligibility_text)}</p>`:'<p class="detail-missing">Eligibility not listed.</p>';
 const cost=resource.cost_summary?`<p><strong>Cost:</strong> ${esc(resource.cost_summary)}</p>`:'<p class="detail-missing">Costs not listed.</p>';
 const provider=normalized(resource.organization.name)!==normalized(resource.title)?`<p class="detail-provider">Listed organization: ${esc(resource.organization.name)}</p>`:'';
 const map=!demo&&options.mapAvailable?`<details class="detail-map-disclosure" id="location"><summary id="locationHeading" tabindex="-1">Location map</summary><div class="detail-area-map"><div class="detail-live-map" id="detailMap" hidden></div><p class="detail-map-fallback" id="detailMapFallback">${pinIcon}<span>Location map<small>Showing the map connects to Geoapify. Directions remain available above.</small></span></p><p class="detail-map-caption" id="detailMapCaption" hidden>Listed location · confirm before visiting</p></div></details>`:'';
 return `<header class="detail-hero"><div class="detail-hero-copy"><div class="detail-labels">${labels}<span class="detail-record-label">${recordLabel}</span></div><h1>${esc(resource.title)}</h1></div>${resourceSymbol(resource.category_slugs)}<div class="detail-hero-body">${summary?`<p class="detail-description">${esc(summary)}</p>`:''}<address class="detail-address">${addressLine}${address.toLocaleLowerCase().includes(city.toLocaleLowerCase())?'':`<span>${esc(city)}</span>`}</address>${contactButtons?`<div class="detail-contact-actions" aria-label="Contact and directions">${contactButtons}</div>`:`<p class="detail-contact-unavailable">${demo?'Contact and directions are disabled for fictional records.':'Contact links are not listed. See the source information below.'}</p>`}</div></header>
 <section class="detail-source-note" data-tone="${demo||needsReview?'attention':'information'}" aria-labelledby="sourceHeading"><h2 id="sourceHeading" class="visually-hidden">Information reliability</h2><p>${trust}</p></section>
 <div class="detail-content">${description?`<section class="detail-section" id="services" aria-labelledby="servicesHeading"><h2 id="servicesHeading">What this location offers</h2><p>${esc(description)}</p>${provider}</section>`:''}
 <section class="detail-visit-facts" aria-label="Hours, eligibility and cost"><div id="hours"><h2 id="hoursHeading">${demo?'Fictional hours':'Hours'}</h2>${hours}</div><div id="eligibility"><h2 id="eligibilityHeading">Eligibility &amp; cost</h2>${eligibility}${cost}</div></section>
 <details class="detail-source-disclosure"><summary>Source &amp; verification</summary>${provider}<p>${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">View information source<span class="visually-hidden"> (opens a new tab)</span></a>`:demo?'Fictional data supplied for demonstration.':'Source link not listed.'}${recorded?` · Recorded ${esc(recorded)}`:''}</p>${provenance?`<p>${esc(provenance.source_name)}${sourceDate?` · ${provenance.source_id==='hud-housing-counselors'?'Snapshot retrieved':'Dataset updated'} ${esc(sourceDate)}`:''}${importDate?` · Imported ${esc(importDate)}`:''}</p><p>Source and import dates do not confirm current availability.</p>`:''}${license}<p class="detail-fine-print">The category artwork identifies food or healthcare support. It is not this institution’s logo and does not imply endorsement.</p></details>
 ${map}</div>`;
}

