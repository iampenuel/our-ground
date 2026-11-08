import {EDEN_NOTICE_VERSION} from '../../shared/eden-assistant.ts';
import {reduceEdenAgentInput,validateEdenAgentContext,validateEdenAgentActionResponse} from '../../shared/eden-agent.ts';
import {edenLocalPageContext,edenPageContext,edenPageRevision} from './application-bridge.ts';
import {applyEdenPublicAction} from './live-actions.ts';
import {hearOneCommand,prepareLocalRecognition,speakLocalReply} from './command-voice.ts';

function currentContext(){
  const page=edenPageContext(),view=edenLocalPageContext();
  const rows=view.results.filter(r=>r.kind==='directory' && r.id);
  const selected=rows.findIndex(r=>r.selected);
  return validateEdenAgentContext({...page,synthetic:false,directory:'public',resultCount:rows.length,
    resourceIds:rows.map(r=>r.id),...(selected<0?{}:{selectedIndex:selected+1}),
    ...(view.cityId?{cityId:view.cityId}:{}),searchState:view.loading,mapState:view.mapState});
}

export function mountHostedEden(host:HTMLElement) {
  const get=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const panel=get('#eden-panel'),launch=get<HTMLButtonElement>('.eden-launch'),form=get<HTMLFormElement>('.eden-composer'),
        input=get<HTMLTextAreaElement>('#eden-command'),status=get('.eden-state'),log=get('.eden-log'),
        voice=get<HTMLButtonElement>('[data-call]'),footer=get('.eden-footer'),consent=get('.eden-consent');
  get('.eden-unavailable').hidden=true;get('.eden-welcome').hidden=false;form.hidden=false;
  consent.hidden=false;
  consent.innerHTML='<p>Eden uses Google Gemini to plan directory actions and explain published listings. Leave out personal information. Google’s unpaid service may use submitted content for improvement and human review. <a href="/privacy#edenPrivacyTitle">Privacy details</a>.</p><label><input type="checkbox" data-hosted-consent> I understand and want to use Eden.</label>';
  const ack=get<HTMLInputElement>('[data-hosted-consent]');
  const notice=document.createElement('p');notice.className='eden-command-notice';notice.id='eden-mic-privacy';
  notice.textContent='This is a demo. Use public directory information only. Please leave out names, private images, medical details, and home addresses. Voice uses on-device English recognition. Only recognized directory commands and published listing facts go to Google. Microphone audio and unrecognized speech stay on this device.';
  footer.before(notice);voice.setAttribute('aria-describedby',notice.id);voice.textContent='Talk to EDEN';voice.hidden=false;
  const dock=document.createElement('button');dock.type='button';dock.hidden=true;dock.className='eden-end-voice';dock.textContent='End Eden voice';host.append(dock);
  get('.eden-privacy').querySelector('p')!.textContent='Eden can search, open listings, and describe public directory information. The current conversation stays in this tab until you end it.';
  let session:string|undefined,expires=0,busy=false,generation=0,voiceCall:AbortController|undefined,turn:AbortController|undefined;
  let audio:HTMLAudioElement|undefined,expanded=false;
  function notify(text:string){status.hidden=!text;status.textContent=text;}
  function message(text:string,user=false){const row=document.createElement('div');row.className='eden-message'+(user?' command':'');row.textContent=text;row.setAttribute('aria-label',user?'You':'Eden');log.append(row);while(log.childElementCount>16)log.firstElementChild!.remove();row.scrollIntoView({block:'nearest'});}
  function controls(){voice.disabled=!ack.checked||busy&&!voiceCall;get<HTMLButtonElement>('[data-send]').disabled=busy||!ack.checked||!input.value.trim();voice.textContent=voiceCall?'End voice':'Talk to EDEN';dock.hidden=!(voiceCall&&panel.hidden);}
  async function request(path:string,body:unknown,signal?:AbortSignal){
    const headers:Record<string,string>={'Content-Type':'application/json'};if(session)headers.Authorization='Bearer '+session;
    const res=await fetch('/api/v1/eden/hosted/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers,body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(!res.ok){const record=await res.json().catch(()=>null);if(res.status===401){session=undefined;expires=0;}throw Error(res.status===429?'Eden’s free allowance is temporarily busy. Try again later.':record?.error?.code==='AGE_ACKNOWLEDGMENT_REQUIRED'?'Acknowledge the age requirement again to continue.':'Eden could not complete this request. You can still use the directory.');}
    return res;
  }
  async function startSession(signal:AbortSignal){
    if(!ack.checked)throw Error('Please review the Gemini notice first.');
    if(session&&Date.now()<expires)return;
    session=undefined;const res=await (await request('session',{noticeVersion:EDEN_NOTICE_VERSION,acknowledged:true},signal)).json();
    if(typeof res.sessionToken!=='string'||!Number.isFinite(Date.parse(res.expiresAt)))throw Error('Eden could not start a verified session.');
    signal.throwIfAborted();session=res.sessionToken;expires=Date.parse(res.expiresAt);
  }
  async function speak(text:string,ticket:string|undefined,signal:AbortSignal){
    if(ticket){
      try{
        const res=await request('speech',{speechTicket:ticket},signal);
        if(!res.headers.get('content-type')?.startsWith('audio/'))throw Error('Audio unavailable');
        const src=URL.createObjectURL(await res.blob());signal.throwIfAborted();
        try{
          const element=new Audio(src);audio=element;
          await new Promise<void>((resolve,reject)=>{
            const stopped=()=>{element.pause();reject(new DOMException('Voice ended','AbortError'));};
            signal.addEventListener('abort',stopped,{once:true});
            element.onended=()=>{signal.removeEventListener('abort',stopped);resolve();};element.onerror=()=>{signal.removeEventListener('abort',stopped);reject(Error('Audio unavailable'));};
            element.play().catch(e=>{signal.removeEventListener('abort',stopped);reject(e);});
          });return;
        }finally{URL.revokeObjectURL(src);audio=undefined;}
      }catch{signal.throwIfAborted();}
    }
    await speakLocalReply(text,signal);
  }
  async function command(raw:string,speakAnswer=false){
    if(busy)return;
    const before=currentContext();if(!before)throw Error('Use a current directory search or start with a city.');
    const reduced=reduceEdenAgentInput(raw,before);
    if(reduced.status!=='supported'){notify(reduced.message);return;}
    const id=++generation,controller=new AbortController();turn=controller;busy=true;controls();
    try{
      const revision=edenPageRevision();await startSession(controller.signal);
      message(raw,true);input.value='';notify('Finding the answer…');
      const rawPlan=await (await request('plan',{intent:reduced.intent,context:before,noticeVersion:EDEN_NOTICE_VERSION},controller.signal)).json();
      const plan=validateEdenAgentActionResponse(rawPlan,reduced.intent,before);
      if(!plan)throw Error('Eden could not verify the proposed page action.');
      if('clarification' in plan){message(plan.clarification.question);notify('');return;}
      if(revision!==edenPageRevision()||id!==generation)throw Error('The page changed. Please ask again using the current listing.');
      const options={publicDirectory:true,signal:controller.signal};
      const perform=(action:typeof plan.action)=>{
        if(action.type==='select'||action.type==='details'||action.type==='read-hours'){
          const id=currentContext()?.resourceIds[action.index-1],index=edenLocalPageContext().results.findIndex(r=>r.id===id);
          if(!id||index<0)throw Error('That listing is no longer in the results.');
          return applyEdenPublicAction({...action,index:index+1},options);
        }
        return applyEdenPublicAction(action,options);
      };
      let action=await perform(plan.action);
      if(action.status==='done'&&plan.action.type==='search'&&currentContext()?.resultCount)action=await perform({type:'details',index:1});
      const after=currentContext(),confirmed=edenPageRevision();if(!after)throw Error('The page selection changed. Please try again.');
      const result=await (await request('result',{turnToken:plan.turnToken,context:after,outcome:action.status==='done'?'done':'failed',noticeVersion:EDEN_NOTICE_VERSION},controller.signal)).json();
      if(id!==generation||confirmed!==edenPageRevision())throw Error('The page changed. Ask again about your current selection.');
      if(result.engine!=='gemini'||typeof result.reply!=='string'||!result.reply)throw Error('Eden could not verify the listing information.');
      message(result.reply);notify('');
      if(speakAnswer){notify('Eden is speaking.');await speak(result.reply,result.speechTicket,controller.signal);}
    }finally{if(turn===controller){turn=undefined;busy=false;controls();}}
  }
  function endSession(){const prev=session;session=undefined;expires=0;if(prev)void fetch('/api/v1/eden/hosted/end',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'Bearer '+prev},body:'{}',keepalive:true}).catch(()=>{});}
  function stopVoice(){generation++;voiceCall?.abort();voiceCall=undefined;turn?.abort();turn=undefined;audio?.pause();busy=false;endSession();notify('Voice ended. You can type a request.');controls();}
  async function startVoice(){
    if(voiceCall){stopVoice();return;}if(!ack.checked)return;
    const call=new AbortController();voiceCall=call;controls();
    try{
      const ctor=await prepareLocalRecognition();await startSession(call.signal);
      while(!call.signal.aborted){
        notify('Eden is listening on this device.');const text=await hearOneCommand(ctor,call.signal);
        if(!text)break;
        await command(text,true);
      }
    }catch(e){if(!call.signal.aborted)notify(e instanceof Error?e.message:'Voice stopped. You can type a request.');}
    finally{if(voiceCall===call){voiceCall=undefined;endSession();controls();}}
  }
  function show(open:boolean){panel.hidden=!open;launch.hidden=open;launch.setAttribute('aria-expanded',String(open));document.body.classList.toggle('eden-assistant-open',open);controls();if(open)(ack.checked?input:ack).focus();else launch.focus();}
  launch.addEventListener('click',()=>show(true));get('[data-minimize]').addEventListener('click',()=>show(false));
  get('[data-close]').addEventListener('click',()=>{stopVoice();show(false);});
  get('[data-expand]').addEventListener('click',()=>{expanded=!expanded;host.classList.toggle('eden-expanded',expanded);get('[data-expand]').setAttribute('aria-pressed',String(expanded));});
  voice.addEventListener('click',()=>void startVoice());dock.addEventListener('click',stopVoice);
  get('[data-reset]').addEventListener('click',()=>{stopVoice();log.replaceChildren();input.value='';ack.checked=false;notify('');controls();});
  ack.addEventListener('change',()=>{if(!ack.checked)stopVoice();controls();});input.addEventListener('input',controls);
  form.addEventListener('submit',event=>{event.preventDefault();void command(input.value).catch(e=>notify(e.message));});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
  host.addEventListener('keydown',event=>{if(event.key==='Escape')show(false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&voiceCall)stopVoice();});window.addEventListener('pagehide',stopVoice,{once:true});
  controls();if(new URLSearchParams(location.search).get('eden')==='1')show(true);
}
