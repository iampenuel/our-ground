import { geoapifyTerms as discoveryTerms } from '../shared/geoapify.ts';
import type { GeoStatus as DiscoveryStatus, GeoPlace as DiscoveredPlace } from '../shared/geoapify.ts';
import type { ResourceCard, ResourceDetail } from '../shared/contracts.ts';
import {locationSearchScope} from '../shared/location-search.ts';
import type { LocationSuggestion, LocationSuggestResponse, LocationRetrieveResponse, LocationSearchStatus, SelectedLocation, LocationResolveResponse, LocationInterpretation } from '../shared/location-search.ts';
import { nationalFoodReferrals, foodCoverageMessage, nationalHealthcareReferrals, healthcareCoverageMessage, nationalCommunityReferrals, communityCoverageMessage } from '../shared/national-referrals.ts';
import { parseLocationQuery } from '../shared/us-location.ts';
import { locationSearchMarkup, mountLocationCombobox } from './location-combobox';
import { resolveTransientPoint } from './location-controller';
import { locationQualityPresentation } from './location-quality';
import { header, footer } from './navigation';
import { photograph, initializePhotographs } from './photography';
import { apiRequest } from './api-client';
import { escapeHtml as esc, arrow } from './ui';
import { createKeyedSelection } from './discovery-selection';
import { geoAttribution, geoSources } from './geoapify-view';
import { supportCards } from './support-view';
import { combineSupportResults, filterSupportResults, supportMapPoints, readSupportState, supportUrl, defaultTerm, latestRequest } from './support-model';
import type { SupportResult, SupportState } from './support-model';
import {completed,describeResults,forControls,projectedState,searchFailure,searchFilters,type Outcome} from './support-search-outcome.ts';
import { searchSupport, directorySearch } from './support-search';
import type { SearchCenter, SupportRequest } from './support-search';
import type { SupportMap } from './maplibre-support-map';
import { createSearchReveal, revealResultInPanel } from './support-scroll';
import {fetchPublicResource,mountCorrectionReports,resourceUsefulFacts} from './support-resource-context';
import {supportSummary, sourceAvailability} from './support-summary';
import type {MappedStatus} from './support-summary';
import {performEdenVisibleAction} from './eden/visible-action.ts';
import {registerEdenPage,publishEdenApplication} from './eden/application-bridge';
import {EDEN_CITIES} from '../shared/eden-assistant.ts';
import type {EdenAction,EdenCityId} from '../shared/eden-assistant.ts';
import {disposePublicPage,setPublicPageDisposer} from './public-page-lifecycle.ts';

export type SupportPageOptions = {
  request?: SupportRequest; mapKey?: string;
  syntheticDemo?: boolean;
  initialDirectoryCity?: EdenCityId;
  resumedKeyword?:string;
  mountMap?: (container:HTMLElement,select:(id:string)=>void,failure:(message?:string)=>void,center:SearchCenter)=>Promise<SupportMap>;
};
export async function mountSupportPage(root:HTMLElement, options:SupportPageOptions={}) {
  disposePublicPage();
  const request=options.request??apiRequest;
  const mobile=window.matchMedia('(max-width: 900px)');
  let state=readSupportState(new URLSearchParams(location.search),mobile.matches);
  if(options.syntheticDemo)state.mode='demo';
  if(options.resumedKeyword)state.keyword=options.resumedKeyword;
  let submitted:SupportState={...state};
  let available=false, ready=false, disposed=false, locationAvailable=false, referenceOnly=false, mapPicking=false;
  let outcome:Outcome={phase:'idle'};
  let selectedLocation:SelectedLocation|null=null;
  // Only reuse a center obtained from the finite directory-city lookup; a
  // manually chosen suggestion can share the label but have another point.
  let confirmedDirectoryPoint:SelectedLocation|undefined;
  let initialDirectoryCity=options.initialDirectoryCity;
  let restoredArea=state.mode==='real'&&Boolean(state.location);
  let directory:ResourceCard[]=[], geoapify:DiscoveredPlace[]=[], visible:SupportResult[]=[];
  let activeResource:ResourceDetail|null=null,resourceMessage='',resourceLoading=false;
  const resourceLoads=latestRequest();
  let resourceFocusKey:string|null=null,resourceScrollTop=0;
  type ContextSnapshot={outcome:Outcome;submitted:SupportState;directory:ResourceCard[];geoapify:DiscoveredPlace[];center:SearchCenter;selectedLocation:SelectedLocation|null;page:number;hasNext:boolean;partial:boolean;directoryUnavailable:boolean;mappedStatus:MappedStatus;scrollTop:number;selectedKey:string|null};
  const contextSnapshots=new Map<string,ContextSnapshot>();
  const historyContext=()=>typeof history.state?.ogDiscoveryContext==='string'&&/^[a-f0-9-]{36}$/.test(history.state.ogDiscoveryContext)?history.state.ogDiscoveryContext:crypto.randomUUID();
  let contextId=historyContext();
  let partial=false,directoryUnavailable=false,mappedStatus:MappedStatus='disabled';
  const searchReveal=createSearchReveal(),resourceReveal=createSearchReveal();
  let center:SearchCenter|null=null, page=1, hasNext=false;
  let map:SupportMap|null=null, mapLoading=false, mapFailed=false, mapDirty=true;
  const searches=latestRequest(), pages=latestRequest(), resolutions=latestRequest();
  let resolutionChoices:{query:string;sessionToken:string;choices:LocationSuggestion[];reason:string;directoryOnly:boolean;explicit:boolean}|null=null;
  let interpretation:LocationInterpretation|null=null,resolving=false,submitCooldownUntil=0,submitCooldownQuery:string|null=null,submitTimer:number|undefined;
  document.title=state.intent === 'give' ? 'Find ways to give — Our Ground' : 'Find support — Our Ground';
  root.innerHTML=`<div class="page-shell">${header('support')}<main id="main" tabindex="-1">
    <section class="support-hero" aria-labelledby="supportTitle">${photograph('flowers-search','support-hero-photo',true)}<div class="og-container support-hero-inner"><div class="page-intro"><span class="page-eyebrow">Food, care & community</span><h1 id="supportTitle">${state.intent === 'give' ? 'Find ways to give<br>near you.' : 'Find support<br>near you.'}</h1><p>Search for food, healthcare and community support across the United States. Available listings and service information vary by area.</p></div></div></section>
    <div class="og-container support-main unified-support">
      <form id="locationForm" class="search-panel" role="search" aria-label="Find community resources">
        ${locationSearchMarkup(state.location)}
        <button type="submit" class="search-button" id="supportSubmit" disabled>Search</button>
        <div class="unified-filters"><div class="category-filters" role="group" aria-label="Support category"><button type="button" data-category="food">Food</button><button type="button" data-category="healthcare">Healthcare</button><button type="button" data-category="community">Community Support</button></div><label class="distance-field">Distance <select id="radiusInput" aria-label="Search distance">${[5,10,25,50].map(r=>`<option value="${r}"${state.radius===r?' selected':''}>Within ${r} miles</option>`).join('')}</select></label><details class="support-type-options"><summary>Mapped place type</summary><label class="location-field"><span class="search-field-label">Mapped place type</span><select id="supportTerm" name="term" disabled aria-describedby="supportTermHelp"></select><span id="supportTermHelp" class="location-help">Applies only to mapped supplements. Directory records use the selected category.</span></label></details></div>
      </form>
      <p class="support-search-privacy">Area matches are approximate. Confirm services with the provider.</p><details class="support-source-details" id="searchInformation"><summary>Sources, accuracy &amp; search options</summary><p id="supportPrivacy" class="discovery-note">Location searches use city and state reference data and, when configured, send your query to Geoapify through Our Ground. Corrections and area suggestions do not confirm a street address. Current location is requested only when you choose it. Selected coordinates are used temporarily to find nearby records; exact coordinates and retrieved addresses are not saved in the search link. Geoapify discovery receives the chosen search area and support term when available. Showing the map connects your browser to Geoapify. <a href="https://www.geoapify.com/privacy-policy/" target="_blank" rel="noopener noreferrer">Geoapify privacy<span class="visually-hidden"> (opens in a new tab)</span></a> · <a href="https://www.geoapify.com/terms-and-conditions/" target="_blank" rel="noopener noreferrer">Geoapify terms<span class="visually-hidden"> (opens in a new tab)</span></a><span id="supportPolicies"></span></p>
      <details class="support-demo-options"><summary>Demonstration options</summary><label><input type="checkbox" id="demoMode"${state.mode==='demo'?' checked':''} /> Use fictional demonstration records</label><p>Examples only, with no real providers, contacts or directions. This mode does not call Geoapify or display a location map. The server must also permit demo data.</p></details>
      <div id="supportAvailability" class="discovery-note" role="status">Checking search availability…</div>
      </details><p id="demoNotice" class="status-message" hidden>Fictional demonstration mode. These records are not real providers and are not visitable locations.</p>
      <p id="resultsCount" class="discovery-status" role="status" aria-live="polite" tabindex="-1">Enter a U.S. address, city, ZIP code or landmark to begin.</p>
      <div id="locationInterpretation" class="support-interpretation" hidden><p id="interpretationText"></p><button type="button" id="changeInterpretedLocation">Change location</button></div><div id="expandSearch" class="support-expand" hidden><button type="button" class="secondary-button" id="expandSearchRadius"></button></div><p id="sourceState" class="support-source-state" hidden></p><details id="resultSourceDetails" class="support-source-details" hidden><summary>Source &amp; location limitations</summary><p id="locationScope" class="discovery-note" hidden></p><div id="searchNotices" class="support-notices"></div><p class="discovery-note" id="resultEvidence">Mapped categories are leads, not verified services. Directory imports are not independently verified. Confirm availability, costs, eligibility and hours directly. Missing contact links do not mean a service is unavailable. Source records with similar names remain separate.</p><div id="locationAttribution" hidden>${geoAttribution}</div></details><div class="support-retries"><button id="retrySearch" type="button" class="secondary-button" hidden>Retry search</button><button id="directoryOnly" type="button" class="secondary-button" hidden>Try sourced directory records only</button></div>
      <div id="locationChoices" class="discovery-choice" role="group" aria-label="Choose a location"></div>
      <p id="resourceStatus" class="support-resource-message" role="status" aria-live="polite"></p><button type="button" id="closeLinkedResource" class="support-resource-close" hidden>Close shared resource</button><div id="reportDraftNotice" class="support-draft-notice" hidden></div>
      <section id="supportResults" aria-label="Matching resources" hidden>
        <div class="results-toolbar"><label class="support-local-filter">Filter these results<input type="search" id="keywordInput" maxlength="100" value="${esc(state.keyword)}" placeholder="Name, address, or keyword" aria-describedby="filterNote" /></label><button id="searchDirectoryKeyword" type="button" class="secondary-button">Search nearby directory</button><button id="showSupportMap" type="button" class="secondary-button" aria-expanded="${state.view==='map'}" aria-controls="supportMapFrame">${state.view==='map'?'Hide map':'Show map'}</button></div>
        <p id="filterNote" class="discovery-note">Filter loaded results as you type, or press Enter to search the nearby directory.</p>
        <p id="selectionStatus" class="visually-hidden" role="status"></p>
        <div class="unified-content" id="supportContent" tabindex="-1">
          <section class="support-list-region" aria-labelledby="listTitle"><div class="support-region-heading"><h2 id="listTitle">Matching results</h2><span id="loadedCount"></span></div><p id="resultsScrollHelp" class="visually-hidden">Focus this results region to scroll with arrow keys or Page Up and Page Down. Tab moves to result actions.</p><div id="supportListScroll" class="support-list-scroll" tabindex="0" role="region" aria-label="Matching resource results" aria-describedby="resultsScrollHelp"><div id="supportLinkedResource" class="support-linked-resource"></div><div id="resourceResults" class="discovery-results"></div><div id="directoryPagination" class="support-pagination" hidden><button id="moreDirectory" class="secondary-button" type="button" hidden>Load more directory records</button><p id="directoryPageStatus" class="discovery-note" role="status"></p></div></div></section>
          <section id="supportMapFrame" class="discovery-map-frame unified-map" aria-labelledby="mapTitle" hidden><div class="support-region-heading"><h2 id="mapTitle" tabindex="-1">Matching locations</h2><button type="button" id="backToList">Back to list</button></div><div id="supportMap" class="discovery-map"></div><p id="mapState" class="discovery-map-state" role="status" hidden></p><div id="locationMapTools" class="location-map-tools" hidden><button type="button" class="secondary-button" id="adjustSearchLocation" aria-pressed="false">Adjust search location</button><button type="button" class="secondary-button" id="searchMapCenter" hidden>Search this map center</button><button type="button" class="secondary-button" id="cancelMapLocation" hidden>Cancel</button><p id="mapLocationHelp" hidden>Choose an empty area of the map, or pan with the arrow keys and choose Search this map center. Resource markers still select their own listings. A search point does not identify a service.</p></div></section>
        </div>
      </section>
      <aside id="foodReferrals" class="support-referrals" aria-labelledby="foodReferralsTitle" hidden></aside>
      <p class="support-note">Confirm hours, eligibility and availability before visiting. Distances are straight-line estimates; listings do not establish a partnership or donation acceptance.</p>
      <aside class="support-help"><div><span class="page-eyebrow">A useful starting point</span><h2>Support begins with clear information.</h2><p>Learn how to read a listing, check its source, and take your next step.</p></div><a class="secondary-button" href="/about">About the directory ${arrow}</a></aside>
    </div></main>${footer()}</div>`;
  initializePhotographs();
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  const results=el('resourceResults'), listScroll=el('supportListScroll'), count=el('resultsCount'), mapButton=el<HTMLButtonElement>('showSupportMap');
  const reports=mountCorrectionReports(listScroll,request,showDraftNotice);
  function showDraftNotice(){
    const drafts=reports.drafts.unsaved(),notice=el('reportDraftNotice'),expanded=notice.querySelector<HTMLDetailsElement>('[data-draft-recovery]')?.open??false;
    const reading=new Set(Array.from(notice.querySelectorAll<HTMLDetailsElement>('[data-read-draft]')).filter(section=>section.open).map(section=>section.dataset.readDraft));notice.hidden=!drafts.length;
    if(!drafts.length){notice.replaceChildren();return;}
    notice.innerHTML='<p class="discovery-note" role="status">'+drafts.length+' unsaved correction '+(drafts.length===1?'draft remains':'drafts remain')+' on this page. Leaving or reloading can discard drafts.</p><details data-draft-recovery'+(expanded?' open':'')+'><summary>Review drafts</summary>'+drafts.map(({id,draft},index)=>'<section class="support-draft-item"><h3>'+esc(draft.label??'Correction draft '+(index+1))+'</h3><div class="support-card-actions"><button type="button" data-resume-report="'+id+'">Resume draft</button><button type="button" data-discard-saved-report="'+id+'"'+(draft.pending?' disabled':'')+'>Discard draft</button></div><details data-read-draft="'+id+'"'+(reading.has(id)?' open':'')+'><summary>Read or copy draft</summary><p class="discovery-note">Issue: '+esc(draft.reason.replace(/_/g,' '))+'</p><label>Saved report text<textarea rows="3" readonly data-saved-draft-text="'+id+'">'+esc(draft.description)+'</textarea></label><button type="button" data-copy-draft="'+id+'">Copy draft text</button><p data-draft-copy-status="'+id+'" class="discovery-note" role="status"></p><p class="discovery-note">Your text stays in this page’s memory. Resume checks whether the listing is still public before showing its report form.</p></details></section>').join('')+'</details>';
  }
  const currentFilters=()=>searchFilters({...state,location:el<HTMLInputElement>('locationInput').value,radius:Number(el<HTMLSelectElement>('radiusInput').value),term:el<HTMLSelectElement>('supportTerm').value as SupportState['term'],keyword:el<HTMLInputElement>('keywordInput').value});
  const currentOutcome=()=>forControls(outcome,currentFilters());
  const readResults=()=>describeResults(currentOutcome(),visible.map(item=>item.kind==='directory'?item.record.title:item.record.name),visible.filter(item=>item.kind==='directory').length,visible.filter(item=>item.kind!=='directory').length);
  function failSearch(error:unknown){outcome={...searchFailure(error),filters:currentFilters()};}
  const locationControl=mountLocationCombobox<LocationSuggestion,SelectedLocation>(el('locationControl'),{
    transport:{
      suggest:(q,sessionToken,signal)=>request<LocationSuggestResponse>('locations/suggest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q,sessionToken}),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])}),
      retrieve:async(id,sessionToken,signal,choice)=>(await request<LocationRetrieveResponse>('locations/retrieve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,sessionToken,receipt:choice.receipt}),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])})).location
    },
    resolvePoint:(point,source,signal)=>resolveTransientPoint(point,source,signal,async()=>(await request<LocationRetrieveResponse>('locations/reverse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:point.latitude,longitude:point.longitude,source}),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])})).location),
    selected(location){resolutions.cancel();resolving=false;submissionControls();resolutionChoices=null;interpretation=null;restoredArea=false;if(requiresNarrowing(location)){showNarrowing(location);return;}selectedLocation=location;readForm();state={...state,location:location.label,temporaryLocation:true,publicLocation:location.publicQuery??''};if(ready)void search(undefined,false,true);},
    unavailable(){directoryUnavailable=true;partial=true;renderReferrals();},
    invalidated(){outcome=outcome.phase==='idle'?outcome:{phase:'edited',filters:currentFilters()};resourceReveal.cancel();resourceLoads.cancel();activeResource=null;resourceLoading=false;resourceMessage='';state={...state,resource:undefined,invalidResource:false};renderResource();resolutions.cancel();resolutionChoices=null;interpretation=null;resolving=false;submissionControls();el('locationInterpretation').hidden=true;el('locationChoices').replaceChildren();el<HTMLSelectElement>('radiusInput').disabled=false;restoredArea=false;el('locationScope').hidden=true;const hadResults=Boolean(center||visible.length);searchReveal.cancel();el('expandSearch').hidden=true;el('sourceState').hidden=true;el('resultSourceDetails').hidden=true;selectedLocation=null;searches.cancel();pages.cancel();center=null;directory=[];geoapify=[];visible=[];partial=false;directoryUnavailable=false;mapDirty=true;selection.replace([]);stopMapPicking();results.replaceChildren();el('supportResults').hidden=true;el('foodReferrals').hidden=true;state={...state,temporaryLocation:false,publicLocation:undefined};if(hadResults)announce('Enter a location to search again. Previous search results are hidden.');}
  });
  locationControl.setEnabled(false,state.mode==='real');
  const errorText=(error:unknown)=>error instanceof Error&&!['AbortError','TimeoutError'].includes(error.name)?error.message:'The request took too long. Please try again.';
  function announce(message:string) { count.textContent=message; }
  function requiresNarrowing(point:SelectedLocation){return ['state','area'].includes(locationSearchScope(point));}
  function showNarrowing(point:SelectedLocation,notice?:string){
    reset();outcome={phase:'choose-location',filters:currentFilters()};selectedLocation=null;interpretation=null;el('locationInterpretation').hidden=true;el<HTMLSelectElement>('radiusInput').disabled=true;
    announce(notice??point.label+' is a geographic area. Enter a city or ZIP code to find nearby support; the radius is not applied to its center.');
  }
  function showInterpretation(){
    const target=el('locationInterpretation');target.hidden=!interpretation?.corrected;
    el('interpretationText').textContent=interpretation?.corrected?'Showing results for '+interpretation.label+'. You searched for “'+interpretation.query+'”.':'';
  }
  const submissionQuery=(query:string)=>query.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
  function submissionCooldownActive(query:string){return Date.now()<submitCooldownUntil&&(submitCooldownQuery===null||submissionQuery(query)===submitCooldownQuery);}
  function submissionControls(){
    const active=submissionCooldownActive(el<HTMLInputElement>('locationInput').value);
    const remaining=active?Math.max(0,Math.ceil((submitCooldownUntil-Date.now())/1000)):0;
    el<HTMLButtonElement>('supportSubmit').disabled=!ready||resolving||remaining>0;
    el<HTMLButtonElement>('retrySearch').disabled=resolving||remaining>0;
    el('retrySearch').textContent=remaining?'Retry search in '+remaining+'s':'Retry search';
    if(submitTimer!==undefined)window.clearTimeout(submitTimer);submitTimer=undefined;
    if(remaining)submitTimer=window.setTimeout(submissionControls,1000);
  }

  const resultUrl=()=>supportUrl({...submitted,view:state.view,keyword:state.keyword,resource:state.resource,invalidResource:state.invalidResource});
  const contextKey=(value:SupportState)=>supportUrl({...value,resource:undefined,invalidResource:false});
  function rememberContext(){if(!center||outcome.phase!=='complete'||currentOutcome().phase!=='complete')return;const key=contextId+'|'+contextKey({...submitted,view:state.view});contextSnapshots.delete(key);contextSnapshots.set(key,{outcome,submitted:{...submitted,view:state.view},directory:[...directory],geoapify:[...geoapify],center,selectedLocation,page,hasNext,partial,directoryUnavailable,mappedStatus,scrollTop:listScroll.scrollTop,selectedKey:selection.current()});while(contextSnapshots.size>6)contextSnapshots.delete(contextSnapshots.keys().next().value!);}
  function displayItems():SupportResult[]{if(!activeResource||visible.some(item=>item.kind==='directory'&&item.record.id===activeResource!.id))return visible;return [...visible,{kind:'directory',key:'directory:'+activeResource.id,record:{...activeResource,distance_miles:0}}];}
  function renderResource(){
    const status=el('resourceStatus');status.textContent=resourceMessage;el('closeLinkedResource').hidden=!state.resource&&!state.invalidResource;
    const linked=el('supportLinkedResource');linked.replaceChildren();
    // The isolated demo can show synthetic facts without adding public links,
    // reports, directions or contact actions to fictional directory cards.
    listScroll.querySelectorAll('[data-eden-synthetic-facts]').forEach(slot=>slot.remove());
    if(options.syntheticDemo&&activeResource?.data_kind==='fictional_demo'&&state.resource===activeResource.id){
      const card=Array.from(listScroll.querySelectorAll<HTMLElement>('[data-card-key]')).find(item=>item.dataset.cardKey==='directory:'+activeResource!.id);
      if(card){const slot=document.createElement('div');slot.dataset.edenSyntheticFacts='';slot.dataset.resourceContent=activeResource.id;slot.className='support-resource-facts';card.append(slot);}
    }
    if(activeResource&&state.resource===activeResource.id&&!visible.some(item=>item.kind==='directory'&&item.record.id===activeResource!.id)){
      linked.innerHTML='<p>Shared resource · shown separately from the matching results and their count.</p>'+supportCards([{kind:'directory',key:'directory:'+activeResource.id,record:{...activeResource,distance_miles:0}}],selection.current(),resultUrl(),submitted.intent,{activeResource:state.resource,linked:true});
    }
    listScroll.querySelectorAll<HTMLElement>('[data-resource-content]').forEach(slot=>{const active=slot.dataset.resourceContent===state.resource;slot.hidden=!active;if(!active){slot.replaceChildren();return;}const facts=activeResource?resourceUsefulFacts(activeResource):'';slot.innerHTML=resourceLoading?'<p role="status">Loading additional information…</p>':activeResource?'<div class="support-resource-notice"><p>Selected resource</p><button type="button" class="support-resource-close" data-resource-close>Close</button></div>'+facts:resourceMessage?'<p>'+esc(resourceMessage)+'</p><button type="button" class="support-resource-close" data-resource-close>Close</button>':'';});
    listScroll.querySelectorAll<HTMLAnchorElement>('[data-resource-open]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.resourceOpen===state.resource)));
    reports.restore();showDraftNotice();
    if(activeResource)el('supportResults').hidden=false;
  }
  function focusResource(id:string|null){const candidates=listScroll.querySelectorAll<HTMLElement>('[data-resource-open],[data-result-key]');const button=Array.from(candidates).find(button=>button.dataset.resourceOpen===id||button.dataset.resultKey==='directory:'+id);if(button)button.focus({preventScroll:true});else if(!el('supportResults').hidden)listScroll.focus({preventScroll:true});else el<HTMLInputElement>('locationInput').focus({preventScroll:true});}
  function closeResource(push=true){const previous=state.resource;resourceReveal.cancel();resourceLoads.cancel();resourceLoading=false;state={...state,resource:undefined,invalidResource:false};activeResource=null;resourceMessage='';updateUrl(push);render();listScroll.scrollTop=resourceScrollTop;focusResource(resourceFocusKey??previous??null);rememberContext();}
  async function openResource(id:string,push=false,deriveContext=false){
    if(disposed)return;rememberContext();resourceFocusKey=id;resourceScrollTop=listScroll.scrollTop;state={...state,resource:id,invalidResource:false};updateUrl(push);const run=resourceLoads.start();resourceLoading=true;resourceMessage='Loading shared resource…';activeResource=null;renderResource();
    try{const resource=await fetchPublicResource(request,id,run.signal,options.syntheticDemo&&state.mode==='demo'?'synthetic-demo':'public');if(!run.current()||disposed)return;activeResource=resource;resourceLoading=false;resourceMessage='';
      if(deriveContext){
        reset();const category=resource.category_slugs[0]??'food',label=resource.location.city+', '+resource.location.state;
        state={...state,category,term:defaultTerm(category),location:label,temporaryLocation:true,publicLocation:'',mode:'real'};submitted={...state};selectedLocation=null;center={label:'Listed resource location · '+label,latitude:resource.location.latitude,longitude:resource.location.longitude,state:resource.location.state};categories();el<HTMLInputElement>('locationInput').value=label;el<HTMLSelectElement>('radiusInput').value=String(state.radius);
        el('locationScope').hidden=false;el('locationScope').textContent='Nearby directory records use this shared resource’s public location. No address lookup or mapped-place request was made.';mappedStatus='disabled';updateUrl();
        outcome={phase:'loading',filters:searchFilters(submitted)};try{const data=await directorySearch(request,submitted,center,1,run.signal);if(!run.current()||disposed)return;outcome=completed(submitted,data.total);directory=data.items;hasNext=data.has_next;directoryUnavailable=false;partial=false;}catch(error){if(!run.current()||disposed)return;outcome={...searchFailure(error),filters:searchFilters(submitted)};directoryUnavailable=true;partial=true;resourceMessage='Shared resource loaded. Nearby directory records are temporarily unavailable. '+errorText(error);}
      }
      render();selection.select('directory:'+resource.id);map?.select(selection.current(),true);announce(deriveContext?visible.length+' matching directory records loaded near the shared resource. The shared resource is shown separately if it is outside these results.':'Resource opened within the current search. Matching results and filters are preserved.');
      const card=Array.from(listScroll.querySelectorAll<HTMLElement>('[data-card-key]')).find(card=>card.dataset.cardKey==='directory:'+id);if(card&&!mobile.matches)revealResultInPanel(listScroll,card);
      if(push)listScroll.querySelector<HTMLElement>('[data-resource-content="'+id+'"] [data-resource-close]')?.focus({preventScroll:true});
    }catch(error){if(run.current()&&!disposed){resourceLoading=false;activeResource=null;resourceMessage='This resource is unavailable or is not published. '+errorText(error);renderResource();}}
  }
  function updateUrl(push=false) { if(location.pathname==='/support'){const url=resultUrl();if(push&&(location.pathname+location.search!==url||history.state?.ogDiscoveryContext!==contextId))history.pushState({ogDiscoveryContext:contextId},'',url);else history.replaceState({ogDiscoveryContext:contextId},'',url);} }
  function categories() {
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===state.category)));
    el<HTMLElement>('supportTerm').closest('details')!.hidden=state.category==='community';
    el<HTMLSelectElement>('supportTerm').innerHTML=state.category==='community'?'<option value="community_support">Community Support</option>':Object.entries(discoveryTerms).filter(([,v])=>v.category===state.category).map(([key,v])=>`<option value="${key}"${key===state.term?' selected':''}>${v.label}</option>`).join('');
    publishEdenApplication();
  }
  function stopMapPicking(){mapPicking=false;map?.setLocationPicking?.(null);el('adjustSearchLocation').setAttribute('aria-pressed','false');el('searchMapCenter').hidden=true;el('cancelMapLocation').hidden=true;el('mapLocationHelp').hidden=true;}
  function mapFailure(message?:string) { if(disposed)return;stopMapPicking();el('locationMapTools').hidden=true; mapFailed=true; map?.destroy(); map=null; el('supportMap').hidden=true; el('mapState').hidden=false; el('mapState').textContent=message??'Map unavailable. The matching results and details remain usable in the list. Reload to retry the map.';publishEdenApplication(); }
  function showMap() {
    const open=state.view==='map' && (submitted.mode!=='demo'||options.syntheticDemo===true);
    el('supportMapFrame').hidden=!open;if(!open)stopMapPicking();
    mapButton.hidden=submitted.mode==='demo'&&!options.syntheticDemo;
    mapButton.setAttribute('aria-expanded',String(open)); mapButton.textContent=open?'Hide map':'Show map';
    el('supportContent').dataset.map=String(open);
    if(!displayItems().length) { el('mapState').hidden=false; el('mapState').textContent='No matching locations to display. Try another search or results filter.'; }
    else if(map && !mapFailed) el('mapState').hidden=true;
    if(open && map) {if(mapDirty&&center){map.update(edenMapPoints(),center);mapDirty=false;}map.resize();map.select(selection.current(),true);}
    if(!open || map || mapLoading || mapFailed || !center || !displayItems().length) return;
    // Tiles use their own public key; optional Places and address lookup are independent.
    if(!options.mountMap && !options.mapKey) { mapFailure(); return; }
    mapLoading=true; el('mapState').hidden=false; el('mapState').textContent='Loading Map…';
    const mount=options.mountMap??(async(container,onSelect,onFailure,initialCenter)=>{
      const {loadSupportMap}=await import('./maplibre-support-map');
      return loadSupportMap(container,options.mapKey!,onSelect,onFailure,initialCenter);
    });
    void mount(el('supportMap'),key=>selectResult(key,'map'),mapFailure,center).then(instance=>{
      if(disposed || mapFailed || !center || (submitted.mode==='demo'&&!options.syntheticDemo)) { instance.destroy(); return; }
      map=instance;mapDirty=true;if(state.view==='map'){map.update(edenMapPoints(),center);mapDirty=false;map.select(selection.current(),true);}el('mapState').hidden=true;el('locationMapTools').hidden=!map.setLocationPicking||!map.getCenter;
    }).catch(error=>mapFailure(error instanceof Error&&error.message.startsWith('Geoapify’s free')?error.message:undefined)).finally(()=>{mapLoading=false;if(!disposed)publishEdenApplication();});
  }
  function edenMapPoints() {
    if(!options.syntheticDemo)return supportMapPoints(displayItems());
    return displayItems().flatMap(item=>item.kind==='directory'?[{place_id:item.key,name:item.record.title,latitude:item.record.location.latitude,longitude:item.record.location.longitude}]:[]);
  }
  function selectedButton() { return Array.from(listScroll.querySelectorAll<HTMLButtonElement>('[data-result-key]')).find(b=>b.dataset.resultKey===selection.current()); }
  function revealSelected(focus=false) {
    const button=selectedButton(), card=button?.closest<HTMLElement>('[data-card-key]');
    if(!button||!card)return;
    if(!mobile.matches)revealResultInPanel(listScroll,card);
    if(focus) button.focus({preventScroll:!mobile.matches});
  }
  const selection=createKeyedSelection((item:SupportResult)=>item.key,item=>{
    listScroll.querySelectorAll<HTMLButtonElement>('[data-result-key]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.resultKey===item?.key)));
    listScroll.querySelectorAll<HTMLElement>('[data-card-key]').forEach(card=>card.dataset.selected=String(card.dataset.cardKey===item?.key));
    map?.select(item?.key??null);
    el('selectionStatus').textContent=item?`${item.kind==='geoapify'?item.record.name:item.record.title} selected.`:'';
  });
  function selectResult(key:string,origin:'card'|'map'='card') {
    selection.select(key);
    if(selection.current()!==key)return;
    if(origin==='card'){if(state.view==='map')map?.select(key,true);}
    else {
      if(mobile.matches) {state.view='list';showMap();updateUrl();}
      revealSelected(mobile.matches);
    }
    publishEdenApplication();
  }
  function returnToList() {state.view='list';showMap();updateUrl();if(selectedButton())revealSelected(true);else listScroll.focus();}
  function renderReferrals(){
    const food=(center?submitted.category:state.category)==='food',hasDirectory=visible.some(item=>item.kind==='directory'),show=submitted.mode==='real'&&(food?(!hasDirectory||partial):(!visible.length||directoryUnavailable));
    const target=el('foodReferrals');target.hidden=!show;
    if(!show){target.replaceChildren();return;}
    const community=(center?submitted.category:state.category)==='community';
    const references=food?nationalFoodReferrals:community?nationalCommunityReferrals:nationalHealthcareReferrals;
    const message=directoryUnavailable?'Directory records are temporarily unavailable. These referral services can help.':visible.length?'Mapped leads are not a complete directory. These services can help you find more options.':state.keyword.trim()?'No loaded listings match this filter. Clear it or use these referral services.':center?(food?foodCoverageMessage:community?communityCoverageMessage:healthcareCoverageMessage):'These services can help you look for support while search is unavailable.';
    target.innerHTML=`<h2 id="foodReferralsTitle">Other ways to find ${food?'food support':community?'community support':'healthcare'}</h2><p class="discovery-note">${esc(message)}</p><div class="support-referrals-list">${references.map(referral=>`<section class="support-referral"><p class="support-referral-label">External referral · not an Our Ground listing</p><h3>${esc(referral.name)}</h3><p>${esc(referral.description)}</p><a href="${esc(referral.url)}" target="_blank" rel="noopener noreferrer">${esc(referral.action_label)}<span class="visually-hidden"> (opens in a new tab)</span></a>${referral.phone_actions.map(action=>`<a href="${esc(action.url)}">${esc(action.label)}</a>`).join('')}<details><summary>Source &amp; limitations</summary><p>${esc(referral.coverage_note)}</p><p>Official link checked ${esc(referral.checked_at)}. Our Ground does not send your location to this service.</p></details></section>`).join('')}</div>`;
  }
  function render() {
    visible=filterSupportResults(combineSupportResults(directory,geoapify,submitted.mode),state.keyword);
    selection.replace(displayItems(),true); results.innerHTML=supportCards(visible,selection.current(),resultUrl(),submitted.intent,{activeResource:state.resource});
    if(!visible.length && partial) results.innerHTML='<div class="empty-state"><h2>Some sources are unavailable.</h2><p>Try again later or use the referral services below.</p></div>';
    else if(!visible.length) results.innerHTML='<div class="empty-state"><h2>No matching records for this search.</h2><p>Our Ground does not have matching records for these filters and this area. This does not mean support is unavailable. Try a wider distance or remove a filter.</p></div>';
    el('supportResults').hidden=!visible.length&&!activeResource&&submitted.category==='food'&&!state.keyword.trim()&&!directory.length&&!geoapify.length;
    el('resultSourceDetails').hidden=false;
    el('sourceState').hidden=submitted.mode==='demo';
    el('sourceState').textContent=sourceAvailability({food:submitted.category==='food',directoryUnavailable,mappedStatus});
    el('loadedCount').textContent=outcome.phase==='complete' ? directory.length+' of '+outcome.total+' directory listings loaded'+(geoapify.length?' · '+geoapify.length+' mapped leads':'') : visible.length+' loaded';
    el('directoryPagination').hidden=!hasNext;
    el<HTMLButtonElement>('moreDirectory').hidden=!hasNext || page>=5;
    el('directoryPageStatus').textContent=page>=5&&hasNext?'100 directory records loaded. Narrow your search to find more specific matches.':'';
    renderResource();mapDirty=true;map?.select(selection.current());showMap();renderReferrals();showInterpretation();rememberContext();
    const expand=el('expandSearch');expand.hidden=visible.length>0||!center||submitted.mode==='demo'||state.radius>=50;
    if(!expand.hidden){const next=[5,10,25,50].find(r=>r>state.radius)!;el('expandSearchRadius').textContent='Expand search to '+next+' miles';}
    publishEdenApplication();

  }
  function reset() {
    outcome={phase:'idle'};
    searchReveal.cancel();el('sourceState').hidden=true;el('resultSourceDetails').hidden=true;
    stopMapPicking();searches.cancel(); pages.cancel();  directory=[];geoapify=[];visible=[];partial=false;directoryUnavailable=false;center=null;page=1;hasNext=false;
    selection.replace([]);mapDirty=true;el('locationScope').hidden=true;el('supportResults').hidden=true;el('locationAttribution').hidden=true;el('locationChoices').replaceChildren();el('searchNotices').replaceChildren();el('retrySearch').hidden=true;el('directoryOnly').hidden=true;
    el('foodReferrals').hidden=true;listScroll.scrollTop=0; results.removeAttribute('aria-busy'); el<HTMLButtonElement>('moreDirectory').disabled=false;el<HTMLButtonElement>('searchDirectoryKeyword').disabled=false; el('demoNotice').hidden=state.mode!=='demo';
    publishEdenApplication();
  }
  let lastSubmit={key:'',at:0};
  async function search(locationId?:string, directoryOnly=false, explicit=false) {
    if(!ready) return;
    if(explicit&&(state.resource||state.invalidResource)){resourceLoads.cancel();activeResource=null;resourceLoading=false;resourceMessage='';state={...state,resource:undefined,invalidResource:false};renderResource();}
    if(selectedLocation&&requiresNarrowing(selectedLocation)){showNarrowing(selectedLocation);return;}
    const key=JSON.stringify([state,locationId,directoryOnly,selectedLocation]);
    if(key===lastSubmit.key && Date.now()-lastSubmit.at<750)return;
    lastSubmit={key,at:Date.now()};
    rememberContext();if(explicit)contextId=crypto.randomUUID();reset(); submitted={...state}; updateUrl(explicit);
    const run=searches.start(); results.setAttribute('aria-busy','true'); announce(state.mode==='demo'?'Searching fictional examples…':'Finding nearby support…');
    const edenRequestId=crypto.randomUUID();outcome={phase:'loading',filters:currentFilters()};publishEdenApplication({type:'search-started',requestId:edenRequestId});

    const finishReveal=explicit?searchReveal.start(count,()=>!disposed&&run.current()):()=>{};
    try {
      const data=await searchSupport(request,submitted,available&&!directoryOnly,run.signal,locationId,selectedLocation??undefined);
      if(!run.current()) return;
      if(data.status==='choose_location') {
        outcome={phase:'choose-location',filters:searchFilters(submitted)};
        el('locationAttribution').innerHTML=geoAttribution+geoSources(data.choices.flatMap(c=>c.attributions));el('locationAttribution').hidden=false; announce('Several locations matched. Choose the one you mean, or add a state to your search.');
        el('locationChoices').innerHTML=data.choices.map(c=>`<button type="button" class="secondary-button" data-location-id="${esc(c.place_id)}">${esc(c.label)}</button>`).join('');
        finishReveal();return;
      }
      if(data.status==='error') {
        outcome={...data.failure??{phase:'failed'},filters:searchFilters(submitted)};
        el('searchNotices').innerHTML=data.notices.map(n=>`<p class="discovery-note">${esc(n)}</p>`).join('');
        el('retrySearch').hidden=false;
        el('directoryOnly').hidden=!data.canTryDirectory;
        partial=true;directoryUnavailable=true;renderReferrals();el('resultSourceDetails').hidden=false;announce('Search is unavailable. Try again or use a referral service.');finishReveal(el('foodReferrals')); 
        return;
      }
      partial=data.partial;mappedStatus=data.mappedStatus;directoryUnavailable=data.directory===null; center=data.center; geoapify=data.geoapify; directory=data.directory?.items??[]; hasNext=data.directory?.has_next??false;
      const quality=locationQualityPresentation(center?.selection?.quality??center?.quality),scope=el('locationScope');
      scope.hidden=submitted.mode==='demo'||(!quality&&!restoredArea);
      scope.textContent=[restoredArea?'Restored area search. Exact addresses and current-location selections are not stored in this link.':'',quality?[quality.label+' · '+quality.sourceName+'.',quality.coordinateLabel?quality.coordinateLabel+'.':'',quality.explanation,quality.scope].filter(Boolean).join(' '):restoredArea?'Distances use a representative area point, not every location in the city, state or ZIP.':''].filter(Boolean).join(' ');
      el('locationAttribution').innerHTML=geoAttribution+geoSources(data.locationAttributions);el('locationAttribution').hidden=!data.geoapifyUsed;
      el('searchNotices').innerHTML=data.notices.map(n=>`<p class="discovery-note">${esc(n)}</p>`).join('');
      el('retrySearch').hidden=!data.partial;
      el('directoryOnly').hidden=submitted.mode==='demo'||!available||directoryOnly||Boolean(center);
      outcome=data.directory?completed(submitted,data.directory.total):{...data.failure??{phase:'failed'},filters:searchFilters(submitted)};
      render(); announce((outcome.phase==='complete' && outcome.total>directory.length ? directory.length+' of '+outcome.total+' directory listings loaded. ':'')+supportSummary(visible,{food:submitted.category==='food',location:center?.label,directoryUnavailable,mappedStatus,demo:submitted.mode==='demo',filtered:Boolean(state.keyword.trim()),radius:state.radius}));

      finishReveal(el('supportResults').hidden?el('foodReferrals'):el('supportContent'));
    } catch(error) { if(run.current()) { outcome={...searchFailure(error),filters:searchFilters(submitted)};directoryUnavailable=true;partial=true;renderReferrals();announce(errorText(error));el('retrySearch').hidden=false;finishReveal(el('foodReferrals')); } }
    finally { if(run.current()) {results.removeAttribute('aria-busy');publishEdenApplication({type:currentOutcome().phase==='complete'?'search-completed':'search-failed',requestId:edenRequestId});} }
  }
  function readForm() {
    const value=el<HTMLInputElement>('locationInput').value.trim();if(selectedLocation&&value!==selectedLocation.label)selectedLocation=null;
    state={...state,location:value,temporaryLocation:Boolean(selectedLocation)||(state.mode==='real'&&!parseLocationQuery(value)),publicLocation:selectedLocation?.publicQuery,term:el<HTMLSelectElement>('supportTerm').value as SupportState['term'],radius:Number(el<HTMLSelectElement>('radiusInput').value),mode:options.syntheticDemo||el<HTMLInputElement>('demoMode').checked?'demo':'real'};
  }
  categories();el('demoNotice').hidden=state.mode!=='demo';
  async function applyResolved(point:SelectedLocation,meaning:LocationInterpretation|undefined,directoryOnly:boolean,explicit:boolean){
    if(requiresNarrowing(point)){locationControl.confirmSubmission(point);showNarrowing(point);return;}
    selectedLocation=point;interpretation=meaning??null;locationControl.confirmSubmission(point);readForm();
    state={...state,location:point.label,temporaryLocation:true,publicLocation:point.publicQuery??''};
    await search(undefined,directoryOnly,explicit);
  }
  async function submitSearch(directoryOnly=false,explicit=true,directoryCity?:EdenCityId){
    if(!ready||resolving||currentOutcome().phase==='loading')return;
    readForm();if(submissionCooldownActive(state.location)){outcome={phase:'limited',filters:currentFilters(),retryAt:submitCooldownUntil};publishEdenApplication();return;}if(explicit){restoredArea=false;resourceReveal.cancel();resourceLoads.cancel();activeResource=null;resourceLoading=false;resourceMessage='';state={...state,resource:undefined,invalidResource:false};renderResource();}
    if(state.mode==='demo'){await search(undefined,directoryOnly,explicit);return;}
    if(directoryCity){
      const city=EDEN_CITIES.find(item=>item.id===directoryCity);
      if(!city||city.query!==state.location)return;
      if(selectedLocation && selectedLocation===confirmedDirectoryPoint && selectedLocation.publicQuery===city.query){await search(undefined,true,explicit);return;}
      const run=resolutions.start();resolving=true;submissionControls();reset();outcome={phase:'loading',filters:currentFilters()};interpretation=null;
      try{
        const {location:point}=await request<{location:SelectedLocation}>('places/directory-city?city='+city.id,{signal:AbortSignal.any([run.signal,AbortSignal.timeout(10000)])});
        if(!run.current()||disposed)return;
        if(point.publicQuery!==city.query||point.quality?.kind!=='canonical_exact'||point.quality.source!=='reference')throw new Error('The directory city could not be confirmed.');
        confirmedDirectoryPoint=point;
        await applyResolved(point,undefined,true,explicit);
      }catch(error){if(run.current()&&!disposed){directoryUnavailable=true;failSearch(error);renderReferrals();announce(errorText(error));}}
      finally{if(run.current()){resolving=false;submissionControls();publishEdenApplication();}}
      return;
    }
    if(selectedLocation){await search(undefined,directoryOnly,explicit);return;}
    const snapshot=locationControl.prepareSubmission(),query=snapshot.query.trim();
    if(query.length<2){announce('Enter an address, city, state or ZIP code.');return;}
    const run=resolutions.start();resolving=true;submissionControls();reset();outcome={phase:'loading',filters:currentFilters()};publishEdenApplication();interpretation=null;resolutionChoices=null;el('locationInterpretation').hidden=true;
    announce('Interpreting your location…');
    const choices=snapshot.suggestions.filter(s=>s.receipt).map(s=>({id:s.id,receipt:s.receipt!}));
    try{
      const resolved=await request<LocationResolveResponse>('locations/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:query,sessionToken:snapshot.sessionToken,...(choices.length?{choices}:{})}),signal:AbortSignal.any([run.signal,AbortSignal.timeout(12000)])});
      if(!run.current()||disposed)return;
      if(resolved.status==='resolved'){await applyResolved(resolved.location,resolved.interpretation,directoryOnly,explicit);return;}
      if(resolved.status==='narrow_location'){showNarrowing(resolved.location,resolved.notice);return;}
      if(resolved.status==='choose_location'){
        outcome={phase:'choose-location',filters:currentFilters()};resolutionChoices={query,sessionToken:snapshot.sessionToken,choices:resolved.choices,reason:resolved.reason,directoryOnly,explicit};
        announce(resolved.notice);
        el('locationChoices').innerHTML=resolved.choices.map(choice=>'<button type="button" class="secondary-button" data-submit-choice="'+esc(choice.id)+'">'+esc(resolved.reason==='precision_change'?(choice.quality?.kind==='city_fallback'?'Search the city instead: ':'Search this approximate area: ')+choice.primary:choice.primary)+'<span class="location-option-secondary">'+esc(choice.secondary)+'</span></button>').join('');
        return;
      }
      outcome={phase:'failed',filters:currentFilters()};announce(resolved.notice);el('retrySearch').hidden=false;
    }catch(error){if(run.current()&&!disposed){
      failSearch(error);const wait=(error as {retryAfterSeconds?:number})?.retryAfterSeconds;
      if(typeof wait==='number'&&Number.isSafeInteger(wait)&&wait>0&&wait<=2678400){submitCooldownUntil=Date.now()+wait*1000;submitCooldownQuery=(error as {code?:string})?.code==='LOCATION_SUBMISSION_LIMIT'?null:submissionQuery(query);}
      announce(errorText(error));el('retrySearch').hidden=false;
    }}finally{if(run.current()){resolving=false;submissionControls();publishEdenApplication();}}
  }
  el<HTMLFormElement>('locationForm').addEventListener('submit',event=>{event.preventDefault();void submitSearch();});
  root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category==='community'?'community':b.dataset.category==='healthcare'?'healthcare':'food';state.term=defaultTerm(state.category);categories();}));
  el('demoMode').addEventListener('change',()=>{
    locationControl.invalidate();readForm();locationControl.setEnabled(locationAvailable&&state.mode==='real',state.mode==='real',referenceOnly);reset();submitted={...state};
    if(state.mode==='demo') {map?.destroy();map=null;}
    mapFailed=false;el('supportMap').hidden=false;
    updateUrl();announce(state.mode==='demo'?'Fictional demonstration mode selected. Submit a search to view examples.':'Real search selected. Submit a search to find sourced records and available Geoapify mapped locations.');
  });
  async function searchDirectoryKeyword(){
    if(!center)return;
    readForm();state.keyword=el<HTMLInputElement>('keywordInput').value;const queryState={...submitted,category:state.category,term:state.term,radius:state.radius,mode:state.mode,keyword:state.keyword},queryCenter=center,run=pages.start();
    outcome={phase:'loading',filters:searchFilters(queryState)};publishEdenApplication();
    el<HTMLButtonElement>('searchDirectoryKeyword').disabled=true;el<HTMLButtonElement>('moreDirectory').disabled=true;el('directoryPageStatus').textContent='Searching nearby directory records…';
    try{const data=await directorySearch(request,queryState,queryCenter,1,run.signal);if(!run.current())return;const scopeChanged=queryState.category!==submitted.category||queryState.radius!==submitted.radius||queryState.term!==submitted.term||queryState.mode!==submitted.mode;if(scopeChanged){geoapify=[];el('locationAttribution').replaceChildren();el('locationAttribution').hidden=true;el('searchNotices').replaceChildren();if(available&&queryState.mode==='real'){partial=true;const note=document.createElement('p');note.className='discovery-note';note.textContent='Directory filters updated. Mapped-place supplements were not refreshed. Submit Search to request mapped places for these filters.';el('searchNotices').append(note);}}submitted=queryState;directoryUnavailable=false;mappedStatus=scopeChanged?'disabled':mappedStatus;partial=queryState.mode==='real'&&mappedStatus==='error';el('searchNotices').querySelectorAll('p').forEach(note=>{if(note.textContent?.startsWith('Our Ground directory:'))note.remove();});directory=data.items;page=1;hasNext=data.has_next;outcome=completed(queryState,data.total);render();updateUrl();if(currentOutcome().phase==='complete')publishEdenApplication({type:'search-completed',requestId:crypto.randomUUID()});announce(`${visible.length} matching records loaded. Directory search includes all nearby records for this keyword.`);}
    catch(error){if(run.current()){outcome={...searchFailure(error),filters:searchFilters(queryState)};publishEdenApplication();announce('Directory keyword search: '+errorText(error));}}
    finally{if(run.current()){el<HTMLButtonElement>('searchDirectoryKeyword').disabled=false;el<HTMLButtonElement>('moreDirectory').disabled=false;}}
  }
  el('changeInterpretedLocation').addEventListener('click',()=>{const input=el<HTMLInputElement>('locationInput');input.focus();input.select();});
  el('expandSearchRadius').addEventListener('click',()=>{const next=[5,10,25,50].find(r=>r>state.radius);if(!next)return;state.radius=next;el<HTMLSelectElement>('radiusInput').value=String(next);void search(undefined,false,true);});
  el('keywordInput').addEventListener('input',()=>{if(el<HTMLButtonElement>('searchDirectoryKeyword').disabled&&outcome.phase==='loading')outcome={phase:'edited',filters:currentFilters()};pages.cancel();el<HTMLButtonElement>('searchDirectoryKeyword').disabled=false;el<HTMLButtonElement>('moreDirectory').disabled=false;state.keyword=el<HTMLInputElement>('keywordInput').value;render();updateUrl();announce(`${visible.length} loaded results match this filter.`);});
  el('keywordInput').addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Enter'){event.preventDefault();void searchDirectoryKeyword();}});
  el('searchDirectoryKeyword').addEventListener('click',()=>{void searchDirectoryKeyword();});
  el('retrySearch').addEventListener('click',()=>submitSearch());
  el('directoryOnly').addEventListener('click',()=>submitSearch(true));
  el('locationChoices').addEventListener('click',event=>{
    const selected=(event.target as Element).closest<HTMLButtonElement>('[data-submit-choice]');
    if(selected?.dataset.submitChoice&&resolutionChoices&&!resolving){
      const pending=resolutionChoices,choice=pending.choices.find(x=>x.id===selected.dataset.submitChoice);if(!choice)return;
      const run=resolutions.start();resolving=true;outcome={phase:'loading',filters:currentFilters()};submissionControls();publishEdenApplication();
      void request<LocationResolveResponse>('locations/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:pending.query,sessionToken:pending.sessionToken,choices:pending.choices.map(item=>({id:item.id,receipt:item.receipt})),selectedId:choice.id}),signal:AbortSignal.any([run.signal,AbortSignal.timeout(12000)])})
        .then(async response=>{if(!run.current())return;resolutionChoices=null;if(response.status==='resolved')await applyResolved(response.location,response.interpretation,pending.directoryOnly,pending.explicit);else if(response.status==='narrow_location')showNarrowing(response.location,response.notice);else {outcome={phase:'choose-location',filters:currentFilters()};announce(response.notice);}})
        .catch(error=>{if(run.current()){failSearch(error);const wait=(error as {retryAfterSeconds?:number})?.retryAfterSeconds;if(typeof wait==='number'&&Number.isSafeInteger(wait)&&wait>0&&wait<=2678400){submitCooldownUntil=Date.now()+wait*1000;submitCooldownQuery=(error as {code?:string})?.code==='LOCATION_SUBMISSION_LIMIT'?null:submissionQuery(pending.query);}announce(errorText(error));el('retrySearch').hidden=false;}})
        .finally(()=>{if(run.current()){resolving=false;submissionControls();publishEdenApplication();}});
      return;
    }
    const legacy=(event.target as Element).closest<HTMLButtonElement>('[data-location-id]');if(legacy?.dataset.locationId)void search(legacy.dataset.locationId);
  });
  el('reportDraftNotice').addEventListener('click',event=>{
    const target=event.target as Element,resume=target.closest<HTMLElement>('[data-resume-report]'),discard=target.closest<HTMLElement>('[data-discard-saved-report]'),copy=target.closest<HTMLElement>('[data-copy-draft]');
    if(resume){const id=resume.dataset.resumeReport!;reports.drafts.update(id,{open:true});void openResource(id,true).then(()=>{if(disposed||state.resource!==id)return;if(activeResource?.id===id){const section=listScroll.querySelector<HTMLDetailsElement>('[data-resource-report="'+id+'"]');section?.querySelector<HTMLElement>('textarea:not(:disabled),summary')?.focus({preventScroll:true});}else{const notice=el('reportDraftNotice');const recovery=notice.querySelector<HTMLDetailsElement>('[data-draft-recovery]');if(!recovery)return;recovery.open=true;const read=notice.querySelector<HTMLDetailsElement>('[data-read-draft="'+id+'"]');if(read){read.open=true;read.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}}});return;}
    if(discard){reports.drafts.discard(discard.dataset.discardSavedReport!);reports.restore();showDraftNotice();if(!el('supportResults').hidden)listScroll.focus({preventScroll:true});else el<HTMLInputElement>('locationInput').focus({preventScroll:true});return;}
    if(copy){const id=copy.dataset.copyDraft!,input=el('reportDraftNotice').querySelector<HTMLTextAreaElement>('[data-saved-draft-text="'+id+'"]')!,status=el('reportDraftNotice').querySelector<HTMLElement>('[data-draft-copy-status="'+id+'"]')!;const fallback=()=>{input.focus({preventScroll:true});input.select();status.textContent='Draft text selected. Use your device’s Copy command.';};if(navigator.clipboard)void navigator.clipboard.writeText(input.value).then(()=>{status.textContent='Draft text copied.';}).catch(fallback);else fallback();}
  });
  el('closeLinkedResource').addEventListener('click',()=>closeResource());
  listScroll.addEventListener('click',event=>{
    const target=event.target as Element,open=target.closest<HTMLAnchorElement>('[data-resource-open]');
    if(open&&!(event as MouseEvent).ctrlKey&&!(event as MouseEvent).metaKey&&!(event as MouseEvent).shiftKey&&!(event as MouseEvent).altKey){event.preventDefault();if(open.dataset.resourceOpen===state.resource)closeResource();else void openResource(open.dataset.resourceOpen!,true);return;}
    if(target.closest('[data-resource-close]')){event.preventDefault();closeResource();return;}
    const copy=target.closest<HTMLElement>('[data-copy-resource]');if(copy){event.preventDefault();const id=copy.dataset.copyResource!,status=listScroll.querySelector<HTMLElement>('[data-resource-copy-status="'+id+'"]')!;const url=new URL('/support',location.origin);url.searchParams.set('resource',id);const link=url.href;void navigator.clipboard?.writeText(link).then(()=>{status.textContent='Resource link copied.';}).catch(()=>{status.innerHTML='<label>Copy this resource link<input class="support-resource-link-input" readonly value="'+esc(link)+'" /></label>';const input=status.querySelector<HTMLInputElement>('input')!;input.focus({preventScroll:true});input.select();});if(!navigator.clipboard){status.innerHTML='<label>Copy this resource link<input class="support-resource-link-input" readonly value="'+esc(link)+'" /></label>';const input=status.querySelector<HTMLInputElement>('input')!;input.focus({preventScroll:true});input.select();}return;}
  });
  listScroll.addEventListener('click',event=>{
    const target=event.target as Element, button=target.closest<HTMLButtonElement>('[data-result-key]');
    if(button?.dataset.resultKey) {selectResult(button.dataset.resultKey);return;}
    // Native links keep their own action, modifier keys and browser context menu.
    if(target.closest('a,button,input,select,textarea,summary,details') || window.getSelection()?.toString())return;
    const card=target.closest<HTMLElement>('[data-card-key]');
    if(card?.dataset.cardKey)selectResult(card.dataset.cardKey);
  });
  el('adjustSearchLocation').addEventListener('click',()=>{if(!map?.setLocationPicking)return;if(mapPicking){stopMapPicking();return;}mapPicking=true;el('adjustSearchLocation').setAttribute('aria-pressed','true');el('searchMapCenter').hidden=false;el('cancelMapLocation').hidden=false;el('mapLocationHelp').hidden=false;map.setLocationPicking(point=>{stopMapPicking();void locationControl.selectPoint(point,'map');});});
  el('searchMapCenter').addEventListener('click',()=>{if(!map?.getCenter)return;const point=map.getCenter();stopMapPicking();void locationControl.selectPoint(point,'map');});
  el('cancelMapLocation').addEventListener('click',stopMapPicking);
  el('backToList').addEventListener('click',returnToList);
  mapButton.addEventListener('click',()=>{
    state.view=state.view==='map'?'list':'map';showMap();updateUrl();publishEdenApplication();
    if(state.view==='map'&&mobile.matches) el('mapTitle').focus();
  });
  el('moreDirectory').addEventListener('click',()=>{
    if(!center||!hasNext||page>=5||currentOutcome().phase!=='complete') return;
    const run=pages.start(), next=page+1;
    el<HTMLButtonElement>('moreDirectory').disabled=true;el('directoryPageStatus').textContent='Loading more directory records…';
    void directorySearch(request,submitted,center,next,run.signal).then(data=>{
      if(!run.current()) return;
      page=next;hasNext=data.has_next;outcome=completed(submitted,data.total);directory.push(...data.items);render();announce(`${visible.length} matching records loaded.`);
    }).catch(error=>{if(run.current())el('directoryPageStatus').textContent=errorText(error);}).finally(()=>{if(!disposed)el<HTMLButtonElement>('moreDirectory').disabled=false;});
  });
  async function checkAvailability() {
    const locationStatus=request<LocationSearchStatus>('locations/status',{signal:AbortSignal.timeout(10000)}).then(data=>{if(!disposed){locationAvailable=data.configured||data.referenceConfigured===true;referenceOnly=!data.configured&&data.referenceConfigured===true;locationControl.setEnabled(locationAvailable&&state.mode==='real',state.mode==='real',referenceOnly);}}).catch(()=>{if(!disposed)locationControl.setEnabled(false,state.mode==='real');});
    try {
      const data=await request<DiscoveryStatus>('geoapify/status',{signal:AbortSignal.timeout(10000)});
      if(disposed) return;
      available=data.enabled;el<HTMLSelectElement>('supportTerm').disabled=!available;
      el('supportAvailability').textContent=available?'Search includes imported and sourced directory records plus optional Geoapify mapped-place supplements.':'Optional mapped-place supplements are off. Imported and sourced directory records remain searchable.';
    } catch { if(!disposed)el('supportAvailability').textContent='Optional mapped-place supplement availability could not be checked. Imported and sourced directory records remain searchable.'; }
    await locationStatus;
    if(disposed) return;
    ready=true;el<HTMLButtonElement>('supportSubmit').disabled=false;
    const inboundId=state.resource,inboundInvalid=state.invalidResource;
    if(inboundId||inboundInvalid){
      announce(inboundInvalid?'Checking shared resource link…':'Loading shared resource…');
      const finishReveal=resourceReveal.start(count,()=>!disposed&&state.resource===inboundId&&state.invalidResource===inboundInvalid);
      await restoreDiscoveryContext();
      const card=Array.from(listScroll.querySelectorAll<HTMLElement>('[data-card-key]')).find(item=>item.dataset.cardKey==='directory:'+inboundId),anchor=activeResource&&card?(mobile.matches?card:el('supportContent')):el('resourceStatus');
      anchor.classList.add('support-inbound-anchor');finishReveal(anchor);
    }else await restoreDiscoveryContext();
  }
  const changeLayout=()=>{
    
    showMap();

  };
  async function restoreDiscoveryContext(){
    if(state.invalidResource){resourceMessage='This resource link is invalid. Choose a location to continue searching.';renderResource();return;}
    const snapshot=contextSnapshots.get(contextId+'|'+contextKey(state));
    if(snapshot){outcome=snapshot.outcome;submitted={...snapshot.submitted,resource:state.resource};directory=[...snapshot.directory];geoapify=[...snapshot.geoapify];center=snapshot.center;selectedLocation=snapshot.selectedLocation;page=snapshot.page;hasNext=snapshot.hasNext;partial=snapshot.partial;directoryUnavailable=snapshot.directoryUnavailable;mappedStatus=snapshot.mappedStatus;state={...submitted,resource:state.resource,invalidResource:false};if(selectedLocation)locationControl.confirmSubmission(selectedLocation);else el<HTMLInputElement>('locationInput').value=state.location;render();if(snapshot.selectedKey)selection.select(snapshot.selectedKey);listScroll.scrollTop=snapshot.scrollTop;if(state.resource)await openResource(state.resource,false);return;}
    if(state.resource&&!state.location){await openResource(state.resource,false,true);return;}
    if(state.resource){const id=state.resource;await openResource(id,false);if(!activeResource)return;if(state.location)await submitSearch(false,false);render();selection.select('directory:'+id);map?.select(selection.current(),true);return;}
    if(state.location){const city=initialDirectoryCity;initialDirectoryCity=undefined;await submitSearch(false,false,city);}else announce('Choose a location to search again. Exact locations are not stored in this link.');
  }
  const restoreUrlState=()=>{rememberContext();resourceReveal.cancel();resourceLoads.cancel();activeResource=null;resourceLoading=false;resourceMessage='';const next=readSupportState(new URLSearchParams(location.search),mobile.matches);contextId=historyContext();selectedLocation=null;locationControl.invalidate();state=next;el<HTMLInputElement>('locationInput').value=state.location;restoredArea=state.mode==='real'&&Boolean(state.location);categories();el<HTMLSelectElement>('radiusInput').value=String(state.radius);el<HTMLInputElement>('keywordInput').value=state.keyword;el<HTMLInputElement>('demoMode').checked=state.mode==='demo';locationControl.setEnabled(locationAvailable&&state.mode==='real',state.mode==='real',referenceOnly);reset();renderResource();void restoreDiscoveryContext();};
  window.addEventListener('popstate',restoreUrlState);
  mobile.addEventListener('change',changeLayout);
  // An explicit capability adapter: only the existing public search and selection
  // functions are reachable. No provider receives records, DOM, URLs or location.
  const unregisterEden=registerEdenPage({
    async submit(signal){
      if(signal.aborted||disposed||resolving||!ready)return {status:'unavailable',message:'Search is unavailable right now.'};
      const interrupted=()=>{searches.cancel();resolutions.cancel();};
      signal.addEventListener('abort',interrupted,{once:true});
      try{await submitSearch();signal.throwIfAborted();return readResults();}
      finally{signal.removeEventListener('abort',interrupted);}
    },
    context:()=>({page:activeResource?'resource':'support',category:state.category,radius:[5,10,25,50].includes(state.radius)?state.radius as 5|10|25|50:25,resultCount:currentOutcome().phase==='complete'?Math.min(20,visible.length):0,synthetic:state.mode==='demo'}),
    presentation:()=>{
      const normalize=(value:string)=>value.toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim();
      const city=EDEN_CITIES.find(city=>[city.query,city.label,...city.aliases].some(value=>normalize(value)===normalize(state.location)));
      const current=currentOutcome(),items=current.phase==='complete'?visible:[];
      const selectedIndex=items.findIndex(item=>item.key===selection.current());
      return{cityId:city?.id,loading:projectedState(current),hasFilter:Boolean(state.keyword.trim()),mapVisible:state.view==='map'&&!mapFailed,mapState:state.view!=='map'?'not-shown':mapFailed?'unavailable':mapLoading?'loading':map?'ready':'not-shown',selectedIndex:selectedIndex>=0?selectedIndex+1:undefined,results:items.slice(0,20).map((item,index)=>({index:index+1,...(item.kind==='directory'?{id:item.record.id}:{}),title:item.kind==='directory'?item.record.title:item.record.name,selected:item.key===selection.current(),kind:item.kind==='directory'?'directory':'mapped'}))};
    },
    back(signal:AbortSignal){signal.throwIfAborted();if(disposed||!state.resource)return{status:'unavailable',message:'No public listing details are open.'};closeResource();return{status:state.resource?'unavailable':'done',message:state.resource?'The details could not close.':'Returned to the matching results.'};},
    async execute(action:EdenAction,signal:AbortSignal){
      if(!disposed&&!signal.aborted&&action.type==='read-results')return readResults();
      if(disposed||signal.aborted||!ready||resolving)return{status:'unavailable',message:'The search page is getting ready. Please try again.'};
      if(action.type==='help')return{status:'done',message:'Try finding food in Harrisburg, changing the distance to 25 miles, or opening details for result 1.'};
      if(action.type==='navigate-support'){await performEdenVisibleAction('location','Focus the location field','focus',signal,()=>el<HTMLInputElement>('locationInput').focus());return{status:'done',message:'You’re in Find Support. Choose a location or continue with the current search.'};}
      if(action.type==='details'||action.type==='select'){
        const item=visible[action.index-1];
        if(!item)return{status:'clarify',message:'That result number is not available. Choose a number from the current list.'};
        if(action.type==='details'){
          if(item.kind!=='directory')return{status:'clarify',message:'This mapped lead has no directory details. Review its source in the results list.'};
          await performEdenVisibleAction({resultKey:item.key,operation:'details'},'Open the verified public result','press',signal,async stepSignal=>{
            const cancel=()=>resourceLoads.cancel();stepSignal.addEventListener('abort',cancel,{once:true});
            try{await openResource(item.record.id,true);}finally{stepSignal.removeEventListener('abort',cancel);}
          });
          if(signal.aborted)return{status:'unavailable',message:'That details request was interrupted.'};
          if(activeResource?.id!==item.record.id)return{status:'unavailable',message:'Those public details could not be loaded. The search list is still available.'};
          return{status:'done',message:state.mode==='demo'?`Opened sample details for result ${action.index}. This listing is invented for the demonstration.`:`Opened public details for result ${action.index}. Check the listed source and confirm details directly.`,synthetic:state.mode==='demo'};
        }
        if(state.mode==='demo'&&!options.syntheticDemo)return{status:'clarify',message:'Fictional examples are not shown on the public map. You can open their details instead.'};
        await performEdenVisibleAction({resultKey:item.key,operation:'select'},'Select the public result','press',signal,()=>{state.view='map';showMap();selectResult(item.key);updateUrl();publishEdenApplication();});
        return{status:'done',message:`Selected result ${action.index}. ${mapFailed?'The map is unavailable; use the selected list result.':mapLoading?'The map is loading.':map?'The map shows the same selection.':'The selected result is available in the list.'}`,synthetic:state.mode==='demo'};
      }
      if(action.type==='search'&&action.city){
        const city=EDEN_CITIES.find(item=>item.id===action.city)!;
        await performEdenVisibleAction('location','Apply '+city.label+' to the location field','press',signal,()=>{el<HTMLInputElement>('locationInput').value=city.query;locationControl.invalidate();selectedLocation=null;state.location=city.query;});
      }
      if(!el<HTMLInputElement>('locationInput').value.trim())return{status:'clarify',message:'Choose a city first. Try “Find food in Harrisburg,” or use the location field.'};
      state={...state,intent:undefined};if(action.type==='search'||action.type==='clear-filters'){if(state.keyword){await performEdenVisibleAction('keyword','Clear the current results filter','press',signal,()=>{state.keyword='';el<HTMLInputElement>('keywordInput').value='';});}}
      if(action.type==='search'||action.type==='refine'){await performEdenVisibleAction({category:action.category},'Choose '+action.category+' support','press',signal,()=>{state.category=action.category;state.term=defaultTerm(action.category);categories();});}
      if(action.type==='radius'||(action.type==='search'&&action.radius))await performEdenVisibleAction('radius','Set the search distance','press',signal,()=>{el<HTMLSelectElement>('radiusInput').value=String(action.radius);});
      const cancel=()=>{searches.cancel();resolutions.cancel();outcome={phase:'idle'};results.removeAttribute('aria-busy');resolving=false;submissionControls();announce('Search interrupted. You can search again.');publishEdenApplication();};
      const directoryCity=state.mode==='real'?EDEN_CITIES.find(c=>c.query===el<HTMLInputElement>('locationInput').value)?.id:undefined;
      await performEdenVisibleAction('submit','Search the public directory','press',signal,async stepSignal=>{
        stepSignal.addEventListener('abort',cancel,{once:true});
        try{await submitSearch(false,true,directoryCity);}finally{stepSignal.removeEventListener('abort',cancel);}
      });
      if(signal.aborted||disposed)return{status:'unavailable',message:'That action was interrupted. You can continue with the search controls.'};
      if(currentOutcome().phase!=='complete')return readResults();
      if(!center||directoryUnavailable)return{status:'unavailable',message:'The search could not finish. Review the search page for available options and try again.'};
      return{...readResults(),resultCount:visible.length};
    }
  });
  el('locationForm').addEventListener('input',()=>publishEdenApplication());
  el('locationForm').addEventListener('change',()=>publishEdenApplication());
  if(options.syntheticDemo)el<HTMLInputElement>('demoMode').disabled=true;
  const dispose=()=>{if(disposed)return;disposed=true;unregisterEden();resourceReveal.cancel();resourceLoads.cancel();reports.destroy();resolutions.cancel();if(submitTimer!==undefined)window.clearTimeout(submitTimer);searchReveal.cancel();locationControl.destroy();window.removeEventListener('popstate',restoreUrlState);window.removeEventListener('pagehide',dispose);searches.cancel();pages.cancel();map?.destroy();mobile.removeEventListener('change',changeLayout);};
  window.addEventListener('pagehide',dispose,{once:true});setPublicPageDisposer(dispose);
  await checkAvailability();
}
