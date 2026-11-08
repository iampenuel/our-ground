import {resourceSupportUrl} from './support-model.ts';
import type { SupportResult } from './support-model.ts';
import {geoapifyFeedbackUrl} from '../shared/geoapify.ts';
import { geoSources } from './geoapify-view.ts';
import { mappedCategoryLabel, sourceWebsite, sourcePhone, coordinateDirections } from '../shared/place-evidence.ts';
const esc = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const external = (url:string,label:string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;

// A mapped checkout is not evidence that an organization authorized the account.
function givingWebsite(website: string | null) {
  if (!website) return null;
  const url = new URL(website);
  const checkoutHost = /(^|\.)(paypal\.com|paypal\.me|stripe\.com|donorbox\.org|givebutter\.com|square\.link|squareup\.com|gofundme\.com)$/i;
  const checkoutPath = /\/(checkout|donate|donations?|payment|pay)(\/|$)/i;
  return checkoutHost.test(url.hostname) || checkoutPath.test(url.pathname) ? null : website;
}

function givingDetails(item: SupportResult, website: string | null, phone: string | null) {
  if (item.kind === 'directory' && item.record.data_kind === 'fictional_demo') return '';
  const reviewed = item.record.reviewed_giving;
  const source = sourceWebsite(reviewed?.source_url);
  const official = source && sourceWebsite(reviewed?.official_website);
  const donate = official && sourceWebsite(reviewed?.donation_url);
  let action = '', note: string;
  if (reviewed && donate && donate.startsWith('https://') && source && /^\d{4}-\d{2}-\d{2}$/.test(reviewed.checked_on)) {
    action = external(donate, 'Donate on organization website');
    note = external(source, 'Official source') + ' · Link checked ' + esc(reviewed.checked_on);
  } else if (official || website) {
    action = external((official || website)!, 'Visit organization website');
    const origin = official ? '' : item.kind === 'geoapify' ? 'Listed website from mapped data. ' : 'Listed website from the directory. ';
    note = origin + 'Online donation information not confirmed.';
  } else if (phone) {
    action = '<a href="tel:' + esc(phone) + '">Call ' + esc(phone) + '</a>';
    note = 'Contact the organization about ways to give.';
  } else {
    note = 'This listing supplies no website or contact number for giving inquiries.';
  }
  return '<div class="support-giving"><div class="support-card-actions">' + action + '</div><p>' + note + '</p></div>';
}

export function supportCards(items:SupportResult[], selected:string|null, returnUrl='/support', intent?:'give', options:{activeResource?:string;linked?:boolean}={}) {
  return items.map((item,index)=>{
    const mapped=item.kind==='geoapify', demo=!mapped&&item.record.data_kind==='fictional_demo';
    const name=mapped?item.record.name:item.record.title;
    const address=mapped?item.record.address:item.record.location.address_label+', '+item.record.location.city+', '+item.record.location.state;
    const category=mapped?mappedCategoryLabel(item.record.categories):item.record.category_slugs.map(c=>c==='food'?'Food support':c==='community'?'Community Support':'Healthcare').join(' · ');
    const imported=!mapped&&item.record.data_kind==='imported_unverified';
    const verification=mapped?'Geoapify mapped location · Services not verified':demo?'Fictional demonstration · Not a real provider':imported?(item.record.provenance?.verification_status==='stale_or_needs_review'?'Imported source record · Needs review':'Imported source record · Not independently verified'):'Our Ground sourced record · Not independently verified';
    const provenance=!mapped?item.record.provenance:undefined;
    const provenanceSource=sourceWebsite(provenance?.source_url),licenseUrl=sourceWebsite(provenance?.license_url);
    const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toISOString().slice(0,10):'not supplied';
    const provenanceHtml=provenance?`<p class="discovery-sources">Source: ${provenanceSource?external(provenanceSource,provenance.source_name):esc(provenance.source_name)} · Dataset snapshot ${esc(date(provenance.source_updated_at))} · Imported ${esc(date(provenance.imported_at))}</p>${provenance.license_name?`<p class="discovery-sources">License: ${licenseUrl?external(licenseUrl,provenance.license_name):esc(provenance.license_name)}</p>`:''}${provenance.attribution?`<p class="discovery-sources">${esc(provenance.attribution)}</p>`:''}${provenance.source_id==='pgc-food-assistance'?'<p class="discovery-sources"><a href="/data-notices/openpgc.html" target="_blank" rel="noopener noreferrer">County data notice<span class="visually-hidden"> (opens in a new tab)</span></a></p>':''}`:'';
    const summary=!mapped&&provenance?.source_id==='hrsa-health-centers'?item.record.summary.replace(/^(HRSA-listed health center(?: \(seasonal site\))?\.) Contact the site to confirm services, hours, costs, eligibility and current availability\.$/,'$1'):!mapped?item.record.summary:'';
    const point=mapped?item.record:item.record.location;
    const directions=demo?null:coordinateDirections(point.latitude,point.longitude);
    const website = demo ? null : sourceWebsite(mapped ? item.record.website_url : item.record.contact?.website_url);
    const listedGivingWebsite = givingWebsite(website);
    const phone = demo ? null : sourcePhone(mapped ? item.record.phone : item.record.contact?.phone);
    const giving = intent === 'give' && !demo;
    const actions=[directions?external(directions,'Directions'):'',website&&!giving?external(website,'Website'):'',phone&&(!giving || listedGivingWebsite || item.record.reviewed_giving)?`<a href="tel:${esc(phone)}">Call ${esc(phone)}</a>`:''].join('');
    const resourceId=!mapped&&!demo?item.record.id:null;
    const detailLabel=!mapped&&item.record.detail_level==='substantive'?'About this location':imported&&provenance?.source_record_id?'View source record':null;
    const active=Boolean(resourceId&&options.activeResource===resourceId);
    const share=resourceId?resourceSupportUrl(returnUrl,resourceId):null;
    const suppliedFeedback=mapped?sourceWebsite(item.record.source_feedback_url):null;
    const feedback=suppliedFeedback&&(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/[1-9]\d*$/.test(suppliedFeedback)||suppliedFeedback===geoapifyFeedbackUrl)?suppliedFeedback:geoapifyFeedbackUrl;
    const feedbackHtml=mapped?`<details class="support-report"><summary>Report mapped information</summary><p>This location is maintained by an external map source. Source feedback is handled externally; it does not enter Our Ground’s directory review process.</p>${external(feedback,feedback===geoapifyFeedbackUrl?'Contact Geoapify about this mapped listing':'View and correct the OpenStreetMap source')}<p class="discovery-note">You can also use the listed contact actions to check information directly.</p></details>`:'';
    return `<article class="result-card discovery-card" data-card-key="${esc(item.key)}" data-selected="${selected===item.key}" aria-labelledby="resultTitle${options.linked?'linked':''}${index}">
      <div class="support-card-heading"><div><span class="result-category">${esc(category)}</span>
      <h3 id="resultTitle${options.linked?'linked':''}${index}"><button type="button" class="discovery-select" data-result-key="${esc(item.key)}" aria-pressed="${selected===item.key}">${options.linked?'':`<span class="discovery-number" aria-hidden="true">${index+1}</span>`}<span>${esc(name)}</span><span class="visually-hidden">${demo?' — select record':' — select location on map'}</span></button></h3></div></div>
      <p class="support-card-address">${esc(address)}</p>${options.linked?'':`<p class="support-card-distance">${item.record.distance_miles} mi · straight-line estimate</p>`}
      ${mapped?'':`<p class="support-card-summary">${esc(summary)}</p>`}
      <p class="support-card-verification">${verification}</p>
      ${demo?'<p class="support-card-warning">Not a visitable location. Contact and directions unavailable.</p>':''}
      <details class="support-card-source"><summary>Source &amp; dates</summary>${mapped?geoSources(item.record.attributions):provenanceHtml||'<p>Source date not supplied.</p>'}</details>
      <div class="support-card-actions">${actions}</div>
      ${giving ? givingDetails(item,listedGivingWebsite,phone) : ''}
      ${resourceId?`<div class="support-card-secondary">${detailLabel?`<a href="${esc(share!)}" data-resource-open="${esc(resourceId)}" aria-expanded="${active}" aria-controls="resourceFacts-${esc(resourceId)}">${detailLabel}</a>`:''}<button type="button" data-copy-resource="${esc(resourceId)}" data-resource-url="${esc(share!)}">Copy resource link</button></div><div data-resource-content="${esc(resourceId)}" id="resourceFacts-${esc(resourceId)}" class="support-resource-facts"${active?'':' hidden'}></div><p class="support-resource-message" data-resource-copy-status="${esc(resourceId)}" role="status"></p><details class="support-report" data-resource-report="${esc(resourceId)}"><summary>Report incorrect information</summary><div data-correction-slot></div></details>`:''}
      ${feedbackHtml}
    </article>`;
  }).join('');
}
