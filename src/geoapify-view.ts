import type {GeoAttribution} from '../shared/geoapify.ts';
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link=(url:string,label:string)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
export const geoAttribution='<p class="discovery-sources geo-attribution">Powered by '+link('https://www.geoapify.com/','Geoapify')+' · '+link('https://www.openstreetmap.org/copyright','© OpenStreetMap contributors')+'</p>';
export const geoSources=(sources:GeoAttribution[])=>sources.filter(s=>!['Geoapify','OpenStreetMap contributors'].includes(s.name)).map(s=>`<p class="discovery-sources">Source: ${esc(s.name)}</p>`).join('');
