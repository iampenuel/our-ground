import { createLocationController, requestCurrentPosition } from './location-controller.ts';
import type { LocationOption, LocationControllerState } from './location-controller.ts';
import { escapeHtml as esc, pinIcon } from './ui';
import { renderLocationCredit } from './location-credit';
import { locationQualityPresentation } from './location-quality';
import type { LocationQuality } from '../shared/location-search';

export function locationSearchMarkup(value:string) {
  return `<div class="location-field location-combobox" id="locationControl"><label class="search-field-label" for="locationInput">Address, city or ZIP code</label><div class="search-field-input">${pinIcon}<input id="locationInput" name="location" type="search" required minlength="2" maxlength="256" autocomplete="off" autocapitalize="words" spellcheck="false" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="locationSuggestions" aria-describedby="locationHelp locationStatus locationSelectedQuality supportPrivacy" placeholder="Address, city, ZIP or landmark" value="${esc(value)}" /><button id="clearLocation" class="location-clear" type="button" aria-label="Clear location"${value?'':' hidden'}>×</button></div><div id="locationPanel" class="location-panel" hidden><div class="location-panel-heading"><span>Suggested locations</span><button id="dismissLocations" type="button" aria-label="Dismiss location suggestions" tabindex="-1">Close</button></div><ul id="locationSuggestions" role="listbox" aria-label="Location suggestions"></ul><p id="locationPanelCredit" class="location-provider-credit">Search by Geoapify</p></div><div class="location-actions"><button type="button" id="useCurrentLocation">Use my current location</button></div><p id="locationHelp" class="location-help">Type a location and press Search, or choose a suggestion.</p><p id="locationStatus" class="location-status" role="status" aria-live="polite" aria-atomic="true"></p><button type="button" id="retryLocation" class="location-retry" hidden>Retry location search</button><div id="locationSelectedQuality" class="location-selected-quality" hidden></div><p id="locationProviderCredit" class="location-provider-credit" hidden></p></div>`;
}

type Selected = {label:string;attribution?:string;quality?:LocationQuality};
export function mountLocationCombobox<T extends LocationOption,L extends Selected>(root:HTMLElement,options:{
  transport:{suggest(query:string,session:string,signal:AbortSignal):Promise<{suggestions:T[];attribution?:string;notice?:string}>;retrieve(id:string,session:string,signal:AbortSignal,choice:T):Promise<L>};
  resolvePoint(point:{latitude:number;longitude:number;accuracy?:number},source:'device'|'map',signal:AbortSignal):Promise<L>;
  selected(location:L):void;invalidated():void;unavailable?():void;
}) {
  const get=<E extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<E>('#'+id)!;
  const input=get<HTMLInputElement>('locationInput'),panel=get('locationPanel'),list=get('locationSuggestions'),status=get('locationStatus'),clear=get<HTMLButtonElement>('clearLocation'),gps=get<HTMLButtonElement>('useCurrentLocation'),retry=get<HTMLButtonElement>('retryLocation'),selectedQuality=get('locationSelectedQuality');
  let enabled=false,referenceOnly=false,coordinatesAllowed=true,disposed=false,pointGeneration=0,pointRequest:AbortController|null=null,composing=false,failureNotified=false;
  const abortPoint=()=>{pointGeneration++;pointRequest?.abort();pointRequest=null;gps.disabled=!coordinatesAllowed;};
  function render(state:LocationControllerState<T,L>) {
    if(disposed)return;
    if(state.phase==='selected')input.value=state.query;
    clear.hidden=!input.value;panel.hidden=!state.open;input.setAttribute('aria-expanded',String(state.open));input.setAttribute('aria-busy',String(state.busy));
    if(state.open&&state.active>=0)input.setAttribute('aria-activedescendant','locationOption'+state.active);else input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-invalid',String(state.phase==='error'));
    list.innerHTML=state.suggestions.map((s,i)=>{
      const quality=locationQualityPresentation(s.quality);
      return `<li id="locationOption${i}" role="option" aria-selected="${i===state.active}" data-location-option="${esc(s.id)}"><span class="location-option-primary">${esc(s.primary)}</span><span class="location-option-secondary">${esc(s.secondary)}</span>${quality?`<span class="location-option-quality">${esc(quality.label)} · ${esc(quality.sourceName)}</span>${quality.coordinateLabel?`<span class="location-option-explanation">${esc(quality.coordinateLabel)}</span>`:''}<span class="location-option-explanation">${esc(quality.explanation)}${quality.scope?' '+esc(quality.scope):''}</span>`:''}</li>`;
    }).join('');
    retry.hidden=!enabled||!state.retryable||state.phase!=='error'||state.query.trim().length<2;retry.disabled=state.busy||state.retryAfterSeconds>0;retry.textContent=state.retryAfterSeconds?'Retry location search in '+state.retryAfterSeconds+'s':'Retry location search';
    const quality=state.selection&&locationQualityPresentation(state.selection.quality);
    selectedQuality.hidden=!quality;
    selectedQuality.innerHTML=quality?`<p><strong>${esc(quality.label)}</strong> · ${esc(quality.sourceName)}</p>${quality.coordinateLabel?`<p>${esc(quality.coordinateLabel)}</p>`:''}<p>${esc(quality.explanation)}${quality.scope?' '+esc(quality.scope):''}</p>${quality.sourceUrl?`<a href="${esc(quality.sourceUrl)}" target="_blank" rel="noopener noreferrer">Geographic reference source<span class="visually-hidden"> (opens in a new tab)</span></a>`:''}`:'';
    if(state.phase!=='error'||!state.retryable)failureNotified=false;
    if(state.phase==='error'&&state.retryable&&!failureNotified){failureNotified=true;options.unavailable?.();}
    if(status.textContent!==state.message)status.textContent=state.message;status.dataset.state=state.phase;renderLocationCredit(get('locationProviderCredit'),state.attribution||(referenceOnly?'Geographic reference search':'Search by Geoapify'));renderLocationCredit(get('locationPanelCredit'),state.attribution||(referenceOnly?'Geographic reference search':'Search by Geoapify'),-1);get('locationProviderCredit').hidden=state.open||(!state.attribution&&(!enabled||state.phase==='selected'));
    if(state.open&&state.active>=0)list.children[state.active]?.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  const controller=createLocationController<T,L>({transport:options.transport,changed:render,selected:options.selected,invalidated:options.invalidated});
  function typed(){if(composing)return;abortPoint();controller.input(input.value,enabled);}
  function keydown(event:KeyboardEvent){
    if(event.isComposing||composing)return;
    const state=controller.snapshot();
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(state.suggestions.length){event.preventDefault();controller.move(event.key==='ArrowDown'?1:-1);}return;}
    if(event.key==='Enter'&&state.open&&state.active>=0){event.preventDefault();void controller.chooseActive();return;}
    if(event.key==='Escape'){if(state.open||state.busy){event.preventDefault();controller.dismiss();}return;}
    if(event.key==='Tab')controller.dismiss();
  }
  function dismiss(){controller.dismiss();}
  const submitter = (target:EventTarget|null) => target instanceof Element && target.closest('button[type="submit"], input[type="submit"]')?.closest('form') === root.closest('form');
  let submittingPointer=false;
  function outside(event:PointerEvent){
    submittingPointer=Boolean(submitter(event.target));
    if(!submittingPointer && !root.contains(event.target as Node))dismiss();
  }
  function focusOut(event:FocusEvent){if(!root.contains(event.relatedTarget as Node|null) && !submittingPointer && !submitter(event.relatedTarget))dismiss();}
  async function selectPoint(point:{latitude:number;longitude:number;accuracy?:number},source:'device'|'map') {
    if(!coordinatesAllowed){controller.error('Choose real search before using a current or map location.');return;}
    abortPoint();controller.dismiss();options.invalidated();
    const version=pointGeneration,request=new AbortController();pointRequest=request;status.textContent=source==='device'?'Confirming your approximate location…':'Confirming the selected map area…';input.setAttribute('aria-busy','true');
    try {const location=await options.resolvePoint(point,source,request.signal);if(!disposed&&version===pointGeneration&&!request.signal.aborted)controller.confirm(location);}
    catch(error){if(!disposed&&version===pointGeneration&&!request.signal.aborted)controller.error(error instanceof Error?error.message:'This location could not be confirmed. Enter an address, city or ZIP instead.');}
    finally{if(version===pointGeneration){pointRequest=null;gps.disabled=false;input.setAttribute('aria-busy','false');}}
  }
  async function currentLocation(){
    if(!coordinatesAllowed){controller.error('Choose real search before using your current location.');return;}
    abortPoint();controller.dismiss();options.invalidated();const version=pointGeneration,request=new AbortController();pointRequest=request;gps.disabled=true;status.textContent='Waiting for your location permission…';
    try{const point=await requestCurrentPosition(navigator.geolocation,window.isSecureContext,request.signal);if(!disposed&&version===pointGeneration&&!request.signal.aborted)await selectPoint(point,'device');}
    catch(error){if(!disposed&&version===pointGeneration&&!request.signal.aborted)controller.error(error instanceof Error?error.message:'Current location is unavailable. Enter an address, city or ZIP instead.');}
    finally{if(version===pointGeneration){pointRequest=null;gps.disabled=false;}}
  }
  const retrySearch=()=>{if(!enabled)return;abortPoint();input.focus({preventScroll:true});controller.retry();};
  const clearInput=()=>{abortPoint();input.value='';controller.clear();input.focus();};
  const composeStart=()=>{composing=true;abortPoint();controller.dismiss();options.invalidated();};
  const composeEnd=()=>{composing=false;typed();};
  const keepInputFocus=(event:PointerEvent)=>{event.preventDefault();};
  const choose=(event:MouseEvent)=>{const option=(event.target as Element).closest<HTMLElement>('[data-location-option]');if(!option?.dataset.locationOption)return;event.preventDefault();input.focus({preventScroll:true});void controller.choose(option.dataset.locationOption);};
  input.addEventListener('input',typed);input.addEventListener('keydown',keydown);input.addEventListener('compositionstart',composeStart);input.addEventListener('compositionend',composeEnd);root.addEventListener('focusout',focusOut);document.addEventListener('pointerdown',outside);list.addEventListener('pointerdown',keepInputFocus);list.addEventListener('click',choose);clear.addEventListener('click',clearInput);get('dismissLocations').addEventListener('click',dismiss);gps.addEventListener('click',currentLocation);retry.addEventListener('click',retrySearch);
  return {
    selected:()=>controller.snapshot().selection,
    prepareSubmission(){submittingPointer=false;abortPoint();return{...controller.prepareSubmission(),query:input.value};},
    confirmSubmission(location:L){abortPoint();controller.confirm(location,false);},

    busy:()=>controller.snapshot().busy||pointRequest!==null,
    enabled:()=>enabled,
    setEnabled(value:boolean,allowCoordinates=true,onlyReference=false){enabled=value;referenceOnly=onlyReference;coordinatesAllowed=allowCoordinates;gps.disabled=!coordinatesAllowed;if(!value){abortPoint();controller.dismiss();}get('locationHelp').textContent=value?(referenceOnly?'Address lookup is unavailable. Choose a city, state or five-digit ZIP area from the geographic reference options. Reference points do not confirm street addresses.':'Type a location and press Search. Suggestions are optional; corrections and uncertain matches are labeled.'):'Location suggestions are unavailable. You can still try a city and state or ZIP code.';render(controller.snapshot());},
    selectPoint,
    invalidate(){abortPoint();controller.input(input.value,false);},
    showSelectionRequired(){controller.error('Choose a location suggestion to confirm where to search, or use your current location.');input.focus();},
    destroy(){disposed=true;abortPoint();controller.destroy();input.removeEventListener('input',typed);input.removeEventListener('keydown',keydown);input.removeEventListener('compositionstart',composeStart);input.removeEventListener('compositionend',composeEnd);root.removeEventListener('focusout',focusOut);document.removeEventListener('pointerdown',outside);list.removeEventListener('pointerdown',keepInputFocus);list.removeEventListener('click',choose);clear.removeEventListener('click',clearInput);get('dismissLocations').removeEventListener('click',dismiss);gps.removeEventListener('click',currentLocation);retry.removeEventListener('click',retrySearch);}
  };
}
