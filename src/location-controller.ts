import type { LocationQuality } from '../shared/location-search.ts';
import { locationQualityPresentation } from './location-quality.ts';

/** Transient location-entry state. No storage, history or provider calls outside the injected transport. */
export type LocationOption = { id: string; primary: string; secondary: string; receipt?:string; quality?: LocationQuality };
export type LocationControllerState<T, L> = {
  query: string; suggestions: T[]; active: number; open: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'suggestions' | 'empty' | 'retrieving' | 'selected' | 'error';
  message: string; attribution: string; selection: L | null; retryable:boolean; retryAfterSeconds:number;
};
type Transport<T, L> = {
  suggest(query: string, sessionToken: string, signal: AbortSignal): Promise<{ suggestions: T[]; attribution?: string; notice?: string }>;
  retrieve(id: string, sessionToken: string, signal: AbortSignal, choice: T): Promise<L>;
};
export function createLocationController<T extends LocationOption, L extends { label: string; attribution?:string; quality?: LocationQuality }>(options: {
  transport: Transport<T, L>; changed(state: LocationControllerState<T, L>): void;
  selected(location: L): void; invalidated?(): void; debounceMs?: number; newSession?: () => string;
}) {
  let state: LocationControllerState<T, L> = { query:'',suggestions:[],active:-1,open:false,busy:false,phase:'idle',message:'',attribution:'',selection:null,retryable:false,retryAfterSeconds:0 };
  let timer: ReturnType<typeof setTimeout> | undefined, pending: AbortController | null = null, generation=0, disposed=false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined, retryUntil=0, retryMessage='', suggestionsIssuedAt=0;
  const normalizedQuery=(query:string)=>query.trim().replace(/\s+/g,' ');
  const makeSession=options.newSession??(()=>crypto.randomUUID());
  let session=makeSession(),sessionLastUsed=Date.now(),sessionCalls=0;
  const rotate=()=>{session=makeSession();sessionLastUsed=Date.now();sessionCalls=0;};
  const emit=()=>{if(!disposed)options.changed({...state,suggestions:[...state.suggestions]});};
  const cancel=()=>{generation++;if(timer!==undefined)clearTimeout(timer);timer=undefined;pending?.abort();pending=null;};
  const selectionMessage=(location:L)=>['Selected: '+location.label,locationQualityPresentation(location.quality)?.announcement].filter(Boolean).join('. ');
  const failure=(error:unknown)=>error instanceof Error&&!['AbortError','TimeoutError'].includes(error.name)?error.message:'Location search is temporarily unavailable. Try again or enter a city and state.';
  function clearRetryTiming() {if(retryTimer!==undefined)clearTimeout(retryTimer);retryTimer=undefined;retryUntil=0;state.retryAfterSeconds=0;}
  function updateRetryTiming() {
    if(disposed||state.phase!=='error'||!state.retryable){clearRetryTiming();return;}
    state.retryAfterSeconds=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
    // Countdown is exposed on the retry button; avoid a live-region announcement each second.
    state.message=retryMessage+(state.retryAfterSeconds?' Retry when the countdown ends, or edit your location.':' You can retry now or edit your location.');
    emit();
    if(state.retryAfterSeconds)retryTimer=setTimeout(updateRetryTiming,Math.min(1000,Math.max(1,retryUntil-Date.now())));
  }
  function failed(error:unknown) {
    clearRetryTiming();state.busy=false;state.phase='error';state.retryable=true;
    const metadata=error as {status?:unknown;code?:unknown;retryAfterSeconds?:unknown}|null;
    retryMessage=metadata?.status===429&&metadata.code==='RATE_LIMITED'?'Our Ground is temporarily limiting location requests.':failure(error);
    const wait=metadata?.status===429?metadata.retryAfterSeconds:undefined;
    if(typeof wait==='number'&&Number.isSafeInteger(wait)&&wait>0&&wait<=2678400){retryUntil=Date.now()+wait*1000;updateRetryTiming();}
    else {state.message=retryMessage;emit();}
  }
  function input(query:string,enabled=true,explicitRetry=false) {
    if(disposed)return;
    if(enabled&&!explicitRetry&&normalizedQuery(query)===normalizedQuery(state.query)&&state.phase!=='idle'){state.query=query;return;}
    clearRetryTiming();cancel();suggestionsIssuedAt=0;state={...state,query,suggestions:[],active:-1,open:false,busy:false,selection:null,phase:'idle',message:'',attribution:'',retryable:false,retryAfterSeconds:0};options.invalidated?.();
    if(!enabled||query.trim().length<2){emit();return;}
    if(Date.now()-sessionLastUsed>=120000||sessionCalls>=50)rotate();
    state.busy=true;state.phase='loading';state.message='Finding locations…';emit();
    const version=generation;
    timer=setTimeout(()=>{
      timer=undefined;sessionLastUsed=Date.now();sessionCalls++;const request=new AbortController();pending=request;
      void options.transport.suggest(normalizedQuery(query),session,request.signal).then(data=>{
        if(disposed||version!==generation||request.signal.aborted)return;
        state.suggestions=data.suggestions.slice(0,5);suggestionsIssuedAt=Date.now();state.attribution=data.attribution??'';state.active=-1;state.open=state.suggestions.length>0;state.busy=false;
        state.retryable=false;state.phase=state.suggestions.length?'suggestions':'empty';state.message=[data.notice,state.suggestions.length?`${state.suggestions.length} location ${state.suggestions.length===1?'suggestion':'suggestions'}. Use the arrow keys to choose.`:'No credible locations matched. Check the spelling, add a city or state, or try another location.'].filter(Boolean).join(' ');emit();
      }).catch(error=>{if(disposed||version!==generation||request.signal.aborted)return;failed(error);});
    },options.debounceMs??300);
  }
  async function choose(id:string) {
    if(disposed||(state.busy&&state.phase==='retrieving'))return false;
    const choice=state.suggestions.find(s=>s.id===id);if(!choice)return false;
    clearRetryTiming();cancel();const version=generation,request=new AbortController();pending=request;
    state={...state,active:-1,open:false,busy:true,phase:'retrieving',retryable:false,message:'Confirming the selected location…',selection:null};emit();
    try {
      const location=await options.transport.retrieve(choice.id,session,request.signal,choice);
      if(disposed||version!==generation||request.signal.aborted)return false;
      state={...state,query:location.label,suggestions:[],selection:location,busy:false,phase:'selected',retryable:false,message:selectionMessage(location),attribution:location.attribution??state.attribution};rotate();emit();options.selected(location);return true;
    }catch(error){if(disposed||version!==generation||request.signal.aborted)return false;rotate();state.suggestions=[];state.active=-1;state.open=false;failed(error);return false;}
  }
  return {
    input,choose,
    prepareSubmission(){
      const submission={query:state.query,sessionToken:session,suggestions:state.phase==='suggestions'&&Date.now()-suggestionsIssuedAt<110000?[...state.suggestions]:[]};
      clearRetryTiming();cancel();state.suggestions=[];state.open=false;state.active=-1;state.busy=false;state.selection=null;state.phase='idle';state.message='';state.retryable=false;
      emit();return submission;
    },
    retry(){if(disposed||state.busy||!state.retryable||state.phase!=='error'||state.query.trim().length<2||Date.now()<retryUntil)return false;input(state.query,true,true);return true;},
    snapshot:()=>({...state,suggestions:[...state.suggestions]}),
    dismiss(){if(disposed)return;cancel();state.open=false;state.active=-1;state.busy=false;if(state.phase==='loading'||state.phase==='retrieving'){state.phase='idle';state.message='';}emit();},
    move(direction:1|-1){if(disposed||!state.suggestions.length||(state.busy&&state.phase==='retrieving'))return;state.open=true;state.active=state.active<0?(direction===1?0:state.suggestions.length-1):Math.min(state.suggestions.length-1,Math.max(0,state.active+direction));emit();},
    chooseActive(){return state.open&&state.active>=0?choose(state.suggestions[state.active].id):Promise.resolve(false);},
    clear(){rotate();input('');},
    confirm(location:L,notify=true){if(disposed)return;clearRetryTiming();cancel();rotate();state={...state,query:location.label,suggestions:[],active:-1,open:false,busy:false,phase:'selected',retryable:false,message:selectionMessage(location),attribution:location.attribution??'',selection:location};emit();if(notify)options.selected(location);},
    error(message:string){if(disposed)return;clearRetryTiming();cancel();state={...state,open:false,active:-1,busy:false,phase:'error',message,selection:null,retryable:false};options.invalidated?.();emit();},
    destroy(){disposed=true;clearRetryTiming();cancel();state.suggestions=[];state.selection=null;}
  };
}

/** One permission request, only when the caller explicitly invokes this function. */
export function requestCurrentPosition(geolocation: Pick<Geolocation,'getCurrentPosition'> | undefined, secure: boolean, signal: AbortSignal): Promise<{latitude:number;longitude:number;accuracy:number}> {
  if(!secure)return Promise.reject(new Error('Current location needs a secure connection. Enter an address, city or ZIP instead.'));
  if(!geolocation)return Promise.reject(new Error('This browser does not support current location. Enter an address, city or ZIP instead.'));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error:Error|null,value?:{latitude:number;longitude:number;accuracy:number})=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
    const abort=()=>finish(new DOMException('Location request canceled.','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Current location took too long. Try again or enter an address, city or ZIP.')),11000);
    if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
    try{geolocation.getCurrentPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0){finish(new Error('The browser could not provide a usable location. Enter an address, city or ZIP instead.'));return;}
      finish(null,{latitude,longitude,accuracy});
    },error=>finish(new Error(error.code===1?'Location permission was not granted. Enter an address, city or ZIP instead.':error.code===3?'Current location took too long. Try again or enter an address, city or ZIP.':'Current location is unavailable. Enter an address, city or ZIP instead.')),{enableHighAccuracy:false,maximumAge:0,timeout:10000});}catch{finish(new Error('Current location is unavailable. Enter an address, city or ZIP instead.'));}
  });
}

/** Reverse lookup only enriches a real point; its outage must not block the independent directory. */
export async function resolveTransientPoint<L extends {label:string;latitude:number;longitude:number;source:string}>(
  point:{latitude:number;longitude:number},source:'device'|'map',signal:AbortSignal,lookup:()=>Promise<L>
):Promise<L|{label:string;latitude:number;longitude:number;source:'device'|'map'}> {
  if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180)throw new Error('Choose a valid search location.');
  signal.throwIfAborted();
  try{const location=await lookup();signal.throwIfAborted();return location;}
  catch(error){if(signal.aborted||(error instanceof Error&&error.name==='AbortError'))throw error;return{latitude:point.latitude,longitude:point.longitude,source,label:(source==='device'?'Your current location (approximate)':'Selected map location')+' — address lookup unavailable'};}
}
