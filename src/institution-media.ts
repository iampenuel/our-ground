import type {ResourceCard, ResourceDetail} from '../shared/contracts.ts';
import type {GeoPlace} from '../shared/geoapify.ts';
import {sourceWebsite} from '../shared/place-evidence.ts';
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type MediaIdentity={source:'directory'|'geoapify';id:string;name:string;address:string;city:string;state:string;website:string|null};
export type ReviewedMedia={kind:'approved_image'|'official_logo'|'official_image';src:string;width:number;height:number;sourceUrl:string;checkedOn:string;rightsNote:string};
export type MediaReview={binding:MediaIdentity;assets:readonly ReviewedMedia[]};
// No third-party image is approved yet. Public availability alone is not reuse permission.
// Add a reviewed, locally stored asset and an exact recorded identity together.
export const institutionMediaReviews:readonly MediaReview[]=Object.freeze([]);
export function mediaIdentity(record:ResourceCard|ResourceDetail|GeoPlace):MediaIdentity {
  if('place_id' in record)return {source:'geoapify',id:record.place_id,name:record.name,address:record.address,city:'',state:record.state,website:record.website_url??null};
  return {source:'directory',id:record.id,name:record.organization.name,address:record.location.address_label,city:record.location.city,state:record.location.state,website:record.contact?.website_url??null};
}
function domain(value:string|null){const url=sourceWebsite(value);return url?new URL(url).hostname.toLowerCase().replace(/^www\./,''):null;}
export function selectReviewedMedia(identity:MediaIdentity,reviews:readonly MediaReview[]=institutionMediaReviews):ReviewedMedia|null {
  const matches=reviews.filter(({binding:b})=>b.source===identity.source&&b.id===identity.id);
  if(matches.length!==1)return null;
  const {binding:b,assets}=matches[0];
  if(!identity.website||!domain(identity.website)||domain(identity.website)!==domain(b.website)||['name','address','city','state'].some(key=>identity[key as 'name']!==b[key as 'name']))return null;
  return [...assets].filter(a=>['approved_image','official_logo','official_image'].includes(a.kind)&&/^\/images\/institutions\/[a-z0-9-]+\.(webp|png|jpg)$/.test(a.src)&&a.width>0&&a.height>0&&a.width<=4096&&a.height<=4096&&Number.isInteger(a.width)&&Number.isInteger(a.height)&&a.rightsNote.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(a.checkedOn)&&sourceWebsite(a.sourceUrl)?.startsWith('https://')&&domain(a.sourceUrl)===domain(identity.website)).sort((a,b)=>['approved_image','official_logo','official_image'].indexOf(a.kind)-['approved_image','official_logo','official_image'].indexOf(b.kind))[0]??null;
}
export function institutionMedia(record:ResourceCard|ResourceDetail|GeoPlace,compact=false,reviews:readonly MediaReview[]=institutionMediaReviews) {
  const fictional=record.data_kind==='fictional_demo',healthcare='category' in record?record.category==='healthcare':record.category_slugs.includes('healthcare');
  const media=fictional?null:selectReviewedMedia(mediaIdentity(record),reviews);
  const fallback='/images/our-ground/'+(healthcare?'healthcare-support':'community-giving')+'.webp';
  const identity=mediaIdentity(record),monogram=(identity.name.trim().match(/[\p{L}\p{N}]/u)?.[0]??'').toLocaleUpperCase()||'·';
  const label=media?.kind==='official_logo'?'Official organization logo':media?'Organization image':compact?'Illustration':'Category illustration · not this provider';
  return `<figure class="institution-media${compact?' institution-media--compact':''}" data-institution-media data-kind="${media?.kind??'category'}" data-fallback="${fallback}"><div class="institution-media-frame"><span class="institution-monogram" aria-hidden="true">${esc(monogram)}</span><img src="${esc(media?.src??fallback)}" width="${media?.width??1200}" height="${media?.height??800}" alt="${media?esc(identity.name+(media.kind==='official_logo'?' logo':'')):''}" loading="${compact?'lazy':'eager'}" decoding="async" referrerpolicy="no-referrer"></div><figcaption>${esc(label)}${!compact&&!media?' · <a href="/about#ai-and-imagery">About our imagery</a>':''}${!compact&&media?` · <a href="${esc(media.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a> · Checked ${esc(media.checkedOn)}`:''}</figcaption></figure>`;
}
/** At most one same-origin fallback attempt. Never fetch a source website at runtime. */
export function initializeInstitutionMedia(root:ParentNode){
 root.querySelectorAll<HTMLElement>('[data-institution-media]').forEach(frame=>{
  if(frame.dataset.initialized)return;frame.dataset.initialized='true';
  const image=frame.querySelector('img')!,caption=frame.querySelector('figcaption')!;
  const failed=()=>{
   if(frame.dataset.kind!=='category'&&frame.dataset.kind!=='neutral'){
    frame.dataset.kind='category';caption.textContent='Category illustration · not this provider';image.alt='';image.src=frame.dataset.fallback!;
   }else{frame.dataset.kind='neutral';image.hidden=true;caption.textContent='Organization image unavailable';}
  };
  image.addEventListener('error',failed);
  if(image.complete&&!image.naturalWidth)failed();
 });
}
