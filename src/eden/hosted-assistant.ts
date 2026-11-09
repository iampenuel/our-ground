import {EDEN_NOTICE_VERSION} from '../../shared/eden-assistant.ts';
import {clearEdenRememberedSearch,edenLocalPageContext,subscribeEdenApplication} from './application-bridge.ts';
import {createHostedConversation} from './hosted-conversation.ts';
import {hearOneCommand,localEnglishVoices,prepareLocalRecognition} from './command-voice.ts';
import {mountHostedPortrait} from './runtime/hosted-portrait.ts';
import {renderHostedPanel} from './hosted-panel.ts';
import {HostedVoiceError,readHostedReply} from './hosted-playback.ts';
import {mountEdenIntroduction} from './runtime/introduction.ts';

const noticeKey='og.eden.notice',voiceKey='og.eden.deviceVoice';
const pageNames={home:'Our Ground',support:'Find Support',give:'Give Support',organizations:'For Organizations',about:'About',privacy:'Privacy',discover:'Discovery',resource:'Resource details'};
function stored(key:string){try{return sessionStorage.getItem(key)??'';}catch{return '';}}
function store(key:string,value:string){try{sessionStorage.setItem(key,value);}catch{/* Tab storage is optional. */}}

export function mountHostedEden(host:HTMLElement) {
  if(host.dataset.hostedMounted==='true')return;
  host.dataset.hostedMounted='true';
  const get=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const panel=get('#eden-panel'),launch=get<HTMLButtonElement>('.eden-launch');
  const introduction=mountEdenIntroduction(get('.eden-introduction'),get<HTMLButtonElement>('[data-intro-dismiss]'),{homepage:location.pathname==='/',launcher:launch,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
  host.classList.add('eden-hosted');renderHostedPanel(panel);
  const portrait=mountHostedPortrait(host);
  const input=get<HTMLTextAreaElement>('#eden-command'),status=get('.eden-state'),log=get('.eden-log'),body=get('.eden-body');
  const mic=get<HTMLButtonElement>('[data-call]'),voiceSelect=get<HTMLSelectElement>('#eden-read-voice');
  const age=get<HTMLInputElement>('[data-adult]'),privacy=get<HTMLInputElement>('[data-hosted-consent]');
  const consent=get('.eden-consent'),settings=get('.eden-settings'),settingsButton=get('[data-settings]');
  const conversation=createHostedConversation(),mobile=matchMedia('(max-width:767px)');
  let session:string|undefined,expires=0,generation=0,eligibilityRevision=0;
  let eligible=false,denied=false,privacyAccepted=false,navigationOnly=false,expanded=false,inertApp:HTMLElement|undefined,priorInert=false;
  let live:ReturnType<typeof import('./hosted-live')['mountHostedLive']>|undefined,liveActive=false,liveLoading=false;
  let pending:'send'|'dictate'|'live'|undefined,accepting=false,showingSettings=false,retry=false;
  let turn:AbortController|undefined,dictation:AbortController|undefined,playback:AbortController|undefined;
  let lastReply:{reply:string;speechTicket?:string}|undefined;
  let forgetTimer:ReturnType<typeof setTimeout>|undefined;
  let voicePreference=stored(voiceKey);

  function notify(text=''){status.hidden=!text;status.textContent=text;}
  function controls(){
    get('.eden-welcome').hidden=Boolean(log.childElementCount||pending||liveActive||liveLoading);
    get<HTMLButtonElement>('[data-send]').disabled=!input.value.trim()||Boolean(pending||accepting||dictation);
    get('[data-send]').hidden=Boolean(turn||playback);
    mic.disabled=Boolean(turn||pending||accepting||playback||liveActive||liveLoading);
    input.disabled=liveActive||liveLoading;
    const liveStart=host.querySelector<HTMLButtonElement>('[data-live-start]');
    if(liveStart)liveStart.disabled=Boolean(turn||dictation||playback||pending||accepting||liveLoading);
    mic.setAttribute('aria-pressed',String(Boolean(dictation)));
    mic.setAttribute('aria-label',dictation?'Cancel dictation':'Dictate a message');
    mic.title=dictation?'Cancel dictation':'Dictate a message to review before sending';
    get('[data-dictation-label]').textContent=dictation?'Cancel':'Dictate';
    get('[data-preview]').textContent=playback?'Stop preview':'Preview device voice';
    get('[data-stop]').hidden=!turn&&!playback;get('[data-stop]').setAttribute('aria-label',playback?'Stop speaking':'Stop response');
    get('[data-speak]').hidden=!lastReply||Boolean(turn||playback||dictation||pending||liveActive||liveLoading);
    get('[data-retry]').hidden=!retry||Boolean(turn||playback||pending);
    consent.hidden=!pending;get('[data-age-row]').hidden=eligible;get('[data-privacy-row]').hidden=privacyAccepted;
    get<HTMLButtonElement>('[data-continue]').disabled=accepting||(!eligible&&!age.checked)||(!privacyAccepted&&!privacy.checked);
  }
  function message(text:string,user=false){
    const follow=body.scrollHeight-body.scrollTop-body.clientHeight<64;
    const row=document.createElement('div'),p=document.createElement('p');row.className='eden-message'+(user?' command':'');row.setAttribute('aria-label',user?'You':'Eden');
    p.textContent=text;row.append(p);log.append(row);while(log.childElementCount>16)log.firstElementChild?.remove();
    controls();if(user||follow)body.scrollTop=body.scrollHeight;
  }
  function context(){const route=edenLocalPageContext().route;get('[data-context]').textContent=pageNames[route];introduction.setPageAllowed(route==='home');}
  function showSettings(value:boolean){
    if(playback){stopPlayback();notify();}
    showingSettings=value;settings.hidden=!value;get('[data-history]').hidden=value;get('.eden-composer').hidden=value;
    settingsButton.setAttribute('aria-expanded',String(value));settingsButton.textContent=value?'Back to chat':'Privacy & voice';
    if(value){stopDictation();populateVoices();get('#eden-settings-title').focus({preventScroll:true});body.scrollTop=0;}
    else settingsButton.focus({preventScroll:true});
  }
  function populateVoices(){
    const voices=localEnglishVoices();
    voiceSelect.replaceChildren(new Option('Eden · Aoede (Google)',''),...voices.map(v=>new Option('Device · '+v.name,v.voiceURI)));
    if(voicePreference&&!voices.some(v=>v.voiceURI===voicePreference)){
      const missing=new Option('Selected device voice unavailable',voicePreference);
      missing.disabled=true;voiceSelect.add(missing);
    }
    voiceSelect.value=voicePreference;
    get<HTMLButtonElement>('[data-preview]').disabled=!voices.length;
  }
  async function refreshEligibility(){
    const id=++eligibilityRevision;
    try{
      const r=await fetch('/eligibility',{headers:{Accept:'application/json'},cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});
      const value=await r.json();if(id!==eligibilityRevision)return;
      eligible=r.ok&&value.eligible===true;denied=value.denied===true;
      privacyAccepted=eligible&&stored(noticeKey)===EDEN_NOTICE_VERSION;
    }catch{if(id===eligibilityRevision){eligible=false;privacyAccepted=false;}}
    controls();
  }
  function needConsent(action:'send'|'dictate'|'live'){
    if(denied){notify('Eden is for adults 19 or older. The directory is available to everyone.');return true;}
    if(eligible&&privacyAccepted)return false;
    pending=action;retry=false;notify();controls();consent.scrollIntoView({block:'nearest'});
    (eligible?privacy:age).focus({preventScroll:true});return true;
  }
  function cancelConsent(){
    if(!pending&&!accepting)return;
    generation++;pending=undefined;accepting=false;
    age.checked=false;privacy.checked=false;controls();
  }
  async function accept(){
    if(accepting||!pending||get<HTMLButtonElement>('[data-continue]').disabled)return;
    const id=generation,action=pending;accepting=true;controls();
    try{
      if(!eligible){
        const r=await fetch('/eligibility',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'},
          body:new URLSearchParams({age:'19plus'}),cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(!r.ok||(await r.json()).eligible!==true)throw Error('Eden could not confirm adult access. The directory is still available.');
        if(id!==generation)return;
        eligibilityRevision++;eligible=true;
      }
      if(id!==generation)return;
      if(!privacyAccepted&&privacy.checked){privacyAccepted=true;store(noticeKey,EDEN_NOTICE_VERSION);}
      pending=undefined;accepting=false;controls();
      if(action==='live')void openLive();else if(action==='dictate')void dictate();else void send();
    }catch(e){if(id===generation)notify(e instanceof Error&&e.constructor===Error?e.message:'Eden could not start. Please try again.');}
    finally{if(id===generation){accepting=false;controls();}}
  }
  async function request(path:string,data:unknown,signal?:AbortSignal,correlationId?:string){
    const headers:Record<string,string>={'Content-Type':'application/json'};if(session)headers.Authorization='Bearer '+session;
    if(correlationId)headers['x-eden-correlation-id']=correlationId;
    const res=await fetch('/api/v1/eden/hosted/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers,body:JSON.stringify(data),signal:AbortSignal.any([AbortSignal.timeout(26000),...(signal?[signal]:[])])});
    if(!res.ok){
      const code=(await (path==='speech'||path.startsWith('live/')?res.clone():res).json().catch(()=>null))?.error?.code;
      if(res.status===401){session=undefined;expires=0;}
      if(code==='AGE_ACKNOWLEDGMENT_REQUIRED'){eligible=false;privacyAccepted=false;store(noticeKey,'');age.checked=false;privacy.checked=false;}
      if(path.startsWith('live/'))return res;
      if(path==='speech')return res; // The voice player handles speech limits independently of text/actions.
      if(code==='EDEN_LOCATION_UNAVAILABLE')throw Error('Location resolution is temporarily unavailable. Check the place and state or ZIP code, or try again later.');
      if(code==='DIRECTORY_LOCATION_AMBIGUOUS')throw Object.assign(Error('Which U.S. state or ZIP code should I use for that place?'),{code});
      if(code==='DIRECTORY_LOCATION_UNRESOLVED')throw Object.assign(Error('I could not resolve that place. Check the locality and state or ZIP code.'),{code});
      if(code==='EDEN_REGION_UNAVAILABLE'||code==='EDEN_DISABLED'||code==='EDEN_SESSION_UNAVAILABLE')navigationOnly=true;
      throw Error(res.status===429?'Gemini is busy. Please wait a moment, then try again.':code==='AGE_ACKNOWLEDGMENT_REQUIRED'?'Adult access expired. Try again to renew it.':navigationOnly?'AI chat is unavailable. You can still use page commands.':'Eden could not complete that request. You can try again or use the page controls.');
    }
    return res;
  }
  async function startSession(signal:AbortSignal){
    if(session&&Date.now()<expires)return true;
    session=undefined;navigationOnly=false;
    try{
      const res=await (await request('session',{noticeVersion:EDEN_NOTICE_VERSION,acknowledged:true},signal)).json();
      const expiry=Date.parse(res.expiresAt);
      if(!/^[A-Za-z0-9_-]{43}$/.test(res.sessionToken)||!Number.isFinite(expiry)||Date.now()>=expiry)throw Error('Eden could not start a verified session.');
      signal.throwIfAborted();session=res.sessionToken;expires=expiry;return true;
    }catch(e){signal.throwIfAborted();if(navigationOnly)return false;throw e;}
  }
  let callRelease:Promise<number>|undefined;
  function endSession(){
    const prior=session;session=undefined;expires=0;
    if(prior)void Promise.resolve(callRelease).catch(()=>{}).then(()=>fetch('/api/v1/eden/hosted/end',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'Bearer '+prior},body:'{}',keepalive:true})).catch(()=>{});
  }
  function stopDictation(){if(dictation){dictation.abort();dictation=undefined;portrait.state('idle');}controls();}
  function stopPlayback(){playback?.abort();playback=undefined;portrait.playbackEnded();controls();}
  function stopTurn(){if(turn){turn.abort();turn=undefined;generation++;endSession();portrait.state('idle');}controls();}
  function forget(){
    clearTimeout(forgetTimer);generation++;eligibilityRevision++;cancelConsent();retry=false;
    live?.end();stopDictation();stopPlayback();stopTurn();endSession();conversation.clear();clearEdenRememberedSearch();
    log.replaceChildren();input.value='';lastReply=undefined;get('.eden-unread').hidden=true;portrait.state('idle');notify();controls();
  }
  function touch(){clearTimeout(forgetTimer);forgetTimer=setTimeout(forget,15*60_000);}
  async function send(){
    const text=input.value.trim();if(!text||turn||dictation||accepting||pending||liveActive||liveLoading)return;
    touch();stopPlayback();if(needConsent('send'))return;
    const controller=new AbortController();turn=controller;retry=false;const id=++generation;
    portrait.state('thinking');notify('Connecting…');controls();
    try{
      const aiAvailable=await startSession(controller.signal);controller.signal.throwIfAborted();
      message(text,true);input.value='';notify(aiAvailable?'Thinking…':'AI chat is unavailable. Checking page commands…');
      const result=await conversation.run({text,signal:controller.signal,request,onStatus:(label:string)=>{if(id!==generation)return;if(label==='Using the page control…'){portrait.state('searching');if(mobile.matches&&!panel.hidden)show(false);}notify(label);},aiAvailable});
      if(id!==generation)return;portrait.state(result.outcome==='confirmed'?'success':result.outcome==='clarification'?'clarifying':'unable');lastReply=result;message(result.reply);if(panel.hidden)get('.eden-unread').hidden=false;notify(aiAvailable?'':'AI chat is unavailable. Page commands still work.');
    }catch(e){
      if(id===generation&&!controller.signal.aborted){
        portrait.state('unable');if(!input.value)input.value=text;retry=true;
        notify(e instanceof Error&&e.constructor===Error?e.message:'Eden could not connect. Your draft is ready to retry.');
      }
    }finally{if(turn===controller){turn=undefined;controls();}}
  }
  async function dictate(){
    if(liveActive||liveLoading)return;
    if(dictation){stopDictation();notify('Dictation canceled.');return;}
    if(turn||pending||accepting)return;
    stopPlayback();touch();if(needConsent('dictate'))return;
    const controller=new AbortController();dictation=controller;controls();notify('Preparing the microphone…');
    try{
      const setup=AbortSignal.any([controller.signal,AbortSignal.timeout(35_000)]);
      const ctor=await Promise.race([
        prepareLocalRecognition(setup,()=>notify('Preparing the English language pack…')),
        new Promise<never>((_,reject)=>setup.addEventListener('abort',()=>reject(Error('English voice setup did not finish. You can type or try the microphone again.')),{once:true}))
      ]);
      controller.signal.throwIfAborted();notify('Starting the microphone…');
      const words=await hearOneCommand(ctor,controller.signal,interim=>{if(dictation===controller)notify(interim?'Listening: '+interim:'Listening…');},()=>{if(dictation===controller){portrait.state('listening');notify('Listening…');}});
      controller.signal.throwIfAborted();
      if(words){
        input.value=[input.value.trim(),words].filter(Boolean).join(' ').slice(0,input.maxLength);
        notify('Review your draft, then send.');input.focus({preventScroll:true});
      }else notify('No speech heard. Tap the microphone to try again or type a message.');
    }catch(e){if(!controller.signal.aborted)notify(e instanceof Error&&e.constructor===Error?e.message:'Dictation is unavailable. You can still type.');}
    finally{if(dictation===controller){dictation=undefined;portrait.state('idle');controls();}}
  }
  async function read(preview=false){
    if(liveActive||liveLoading)return;
    if(!preview&&!lastReply)return;stopDictation();stopPlayback();touch();
    const controller=new AbortController();playback=controller;controls();notify('Preparing voice…');
    try{
      const answer=preview?{reply:'This is a preview of your device voice.'}:lastReply!;
      const preference=preview?(voicePreference||localEnglishVoices()[0]?.voiceURI):voicePreference;
      if(preview&&!preference)throw new HostedVoiceError('No installed English device voice is available.');
      await readHostedReply(answer,preference??'',request,controller.signal,source=>{
        if(playback!==controller||controller.signal.aborted)return;
        portrait.playbackStarted();notify(source==='device'?'Reading with your device voice…':'Reading with Aoede…');
      },level=>{if(playback===controller&&!controller.signal.aborted)portrait.level(level);},()=>{
        if(playback===controller){portrait.playbackEnded();notify('Waiting for audio…');}
      });
      if(!controller.signal.aborted)notify();
    }catch(e){if(!controller.signal.aborted)notify(e instanceof HostedVoiceError?e.message:'Voice playback is unavailable. You can read the reply here.');}
    finally{if(playback===controller){portrait.playbackEnded();playback=undefined;controls();}}
  }
  async function openLive(){
    if(liveActive||liveLoading||turn||playback||dictation||needConsent('live'))return;
    liveLoading=true;const epoch=generation;controls();
    try{
      const {mountHostedLive}=await import('./hosted-live');
      if(generation!==epoch||panel.hidden)return;
      live??=mountHostedLive(host,{request,session:startSession,portrait,changed:active=>{liveActive=active;controls();},
        release:(callId,reference)=>{if(!session)return Promise.resolve(401);return callRelease=fetch('/api/v1/eden/hosted/live/end',{method:'POST',credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(6000),
          headers:{'Content-Type':'application/json','x-eden-correlation-id':reference,Authorization:'Bearer '+session},body:JSON.stringify({callId,noticeVersion:EDEN_NOTICE_VERSION})}).then(r=>r.status);}
      });
      live.prompt();
    }catch{notify('Voice calls are unavailable. You can still type.');}
    finally{liveLoading=false;controls();}
  }
  host.querySelector('[data-live-start]')?.addEventListener('click',()=>void openLive());
  function layout(){
    const open=!panel.hidden,modal=open&&expanded&&mobile.matches;
    document.body.classList.toggle('eden-assistant-expanded',expanded&&open);panel.setAttribute('aria-modal',String(modal));
    if(modal&&!inertApp){inertApp=document.getElementById('app')??undefined;if(inertApp){priorInert=inertApp.inert;inertApp.inert=true;}}
    if(!modal&&inertApp){inertApp.inert=priorInert;inertApp=undefined;}
    host.classList.toggle('eden-short-viewport',(window.visualViewport?.height??innerHeight)<430);
    const viewport=window.visualViewport;
    if(viewport){host.style.setProperty('--eden-viewport-height',viewport.height+'px');host.style.setProperty('--eden-viewport-top',viewport.offsetTop+'px');}
  }
  function show(open:boolean,focus=true){
    panel.hidden=!open;launch.hidden=open;portrait.show(open);if(open)get('.eden-unread').hidden=true;launch.setAttribute('aria-expanded',String(open));document.body.classList.toggle('eden-assistant-open',open);
    if(open){introduction.temporarilyHide();touch();void refreshEligibility();context();if(focus)get('[data-expand]').focus({preventScroll:true});}
    else{introduction.restore();live?.end();stopDictation();stopPlayback();cancelConsent();notify();if(showingSettings)showSettings(false);launch.focus({preventScroll:true});}
    layout();controls();
  }
  function keydown(e:KeyboardEvent){
    if(panel.hidden||e.defaultPrevented)return;
    if(e.key==='Escape'){e.preventDefault();if(showingSettings)showSettings(false);else show(false);return;}
    if(e.key==='Tab'&&panel.getAttribute('aria-modal')==='true'){
      const nodes=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),a,input,textarea,select')].filter(el=>el.getClientRects().length);
      if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
      else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
    }
  }
  function hide(){if(document.hidden){stopDictation();stopPlayback();}}
  const unsubscribe=subscribeEdenApplication(context);
  context();populateVoices();window.speechSynthesis?.addEventListener('voiceschanged',populateVoices);
  voiceSelect.addEventListener('change',()=>{stopPlayback();voicePreference=voiceSelect.value;store(voiceKey,voicePreference);});
  launch.addEventListener('click',()=>show(true));get('[data-minimize]').addEventListener('click',()=>show(false));
  get('[data-intro-open]').addEventListener('click',()=>show(true));
  get('[data-close]').addEventListener('click',()=>{forget();show(false);});
  get('[data-expand]').addEventListener('click',()=>{expanded=!expanded;host.classList.toggle('eden-expanded',expanded);get('[data-expand]').setAttribute('aria-pressed',String(expanded));get('[data-expand]').setAttribute('aria-label',expanded?'Restore compact chat':'Expand chat');layout();});
  settingsButton.addEventListener('click',()=>showSettings(!showingSettings));
  get('[data-continue]').addEventListener('click',()=>void accept());
  get('[data-consent-cancel]').addEventListener('click',()=>{cancelConsent();input.focus();});
  for(const box of [age,privacy])box.addEventListener('change',controls);
  get('[data-reset]').addEventListener('click',()=>{forget();if(showingSettings)showSettings(false);notify('New chat started.');touch();});
  mic.addEventListener('click',()=>void dictate());get('[data-speak]').addEventListener('click',()=>void read());
  get('[data-preview]').addEventListener('click',()=>{if(playback){stopPlayback();notify();}else void read(true);});
  get('[data-stop]').addEventListener('click',()=>{stopTurn();stopPlayback();notify('Stopped.');});
  get('[data-retry]').addEventListener('click',()=>void send());
  input.addEventListener('input',()=>{retry=false;touch();controls();});
  get<HTMLFormElement>('.eden-composer').addEventListener('submit',e=>{e.preventDefault();void send();});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void send();}});
  panel.addEventListener('keydown',keydown);mobile.addEventListener('change',layout);window.visualViewport?.addEventListener('resize',layout);window.visualViewport?.addEventListener('scroll',layout);
  document.addEventListener('visibilitychange',hide);
  window.addEventListener('pagehide',()=>{forget();introduction.dispose();live?.dispose();portrait.dispose();if(inertApp)inertApp.inert=priorInert;unsubscribe();window.speechSynthesis?.removeEventListener('voiceschanged',populateVoices);document.removeEventListener('visibilitychange',hide);mobile.removeEventListener('change',layout);window.visualViewport?.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('scroll',layout);},{once:true});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  controls();if(new URLSearchParams(location.search).get('eden')==='1')show(true,false);
}
