// Opt-in protected acceptance with spoken public fixtures. The browser supplies
// microphone PCM to the real worklet, provider and application. No real person's
// microphone, credentials, socket URLs, call tokens or headers are recorded.
import assert from 'node:assert/strict';
import {validateHostedLiveClock,validateEdenLiveTokenResponse,validateEdenLiveConfig} from '../shared/eden-live.ts';
import {chromium} from 'playwright-core';
import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const origin=new URL(process.env.RECOVERY_BASE).origin,out=process.env.RECOVERY_IMAGES,sha=process.env.RECOVERY_SHA;
assert(out&&/^[a-f0-9]{40}$/.test(sha));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream']});
const ctx=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}},serviceWorkers:'block'});
await protectRecoveryOrigin(ctx,origin,process.env.VERCEL_OIDC_TOKEN);
const p=await ctx.newPage();p.setDefaultTimeout(20000);
const receipt={origin,sha,input:'Locally spoken public phrases injected at browser microphone boundary',status:'FAIL',http:[],audioInputChunks:0,audioOutputChunks:0,providerTurns:0,tools:[],turns:[],errors:[]};
let interruptedResponseEnding=false,output='',input='',activeStep='loading',audioStartAt=0;
p.on('pageerror',e=>receipt.errors.push(e.name));
p.on('response',async r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.includes('/eden/hosted/'))receipt.http.push({path:u.pathname.split('/hosted/')[1],status:r.status()});if(u.origin===origin&&u.pathname.endsWith('/hosted/live/token')&&r.ok()){const t=await r.json();receipt.tokenCheck={validOnUncorrectedDeviceClock:!!validateEdenLiveTokenResponse(t),validOnIssuerClock:!!validateHostedLiveClock(t,r.headers().date,0),config:!!validateEdenLiveConfig(t.config),fields:Object.keys(t).length,model:t.model,voice:t.voiceName,maxSeconds:t.maxCallSeconds,expiresInMs:Date.parse(t.expiresAt)-Date.now(),connectInMs:Date.parse(t.newSessionExpiresAt)-Date.now()};}});
p.on('websocket',ws=>{
 if(new URL(ws.url()).hostname!=='generativelanguage.googleapis.com')return;
 ws.on('framesent',({payload})=>{const m=JSON.parse(String(payload));if(m.setup){receipt.temperature=m.setup.generationConfig?.temperature;receipt.requestedModel=m.setup.model;receipt.requestedVoice=m.setup.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;}
 if(m.realtimeInput?.audio){
   receipt.audioInputChunks++;
   // Count signal-bearing PCM packets, then discard them. This harness only
   // supplies prewritten public fixtures; no raw packet goes into diagnostics.
   const b=Buffer.from(m.realtimeInput.audio.data,'base64');let energy=0;
   for(let i=0;i+1<b.length;i+=2)energy+=(b.readInt16LE(i)/32768)**2;
   const rms=Math.sqrt(energy/Math.max(1,b.length/2));
   receipt.sentSignal??={};const step=receipt.sentSignal[activeStep]??={packets:0,nonSilent:0,maxRms:0};
   step.packets++;if(rms>.015)step.nonSilent++;step.maxRms=Math.max(step.maxRms,rms);
 }});

 ws.on('framereceived',({payload})=>{const m=JSON.parse(String(payload)),c=m.serverContent;
 receipt.providerByStep??={};const tally=receipt.providerByStep[activeStep]??={frames:0,input:0,interim:0,output:0,audio:0,tools:0,waiting:0,generated:0,completed:0,interrupted:0,tinyPCM:0};
 tally.frames++;tally.input+=Number(Boolean(c?.inputTranscription?.text));tally.interim+=Number(Boolean(c?.interimInputTranscription?.text));tally.output+=Number(Boolean(c?.outputTranscription?.text));tally.audio+=c?.modelTurn?.parts?.filter(v=>v.inlineData).length??0;
 tally.tools+=m.toolCall?.functionCalls?.length??0;tally.waiting+=Number(c?.waitingForInput===true);tally.generated+=Number(c?.generationComplete===true);tally.completed+=Number(c?.turnComplete===true);tally.interrupted+=Number(c?.interrupted===true);
 for(const part of c?.modelTurn?.parts??[]){if(!part.inlineData?.mimeType?.startsWith('audio/pcm'))continue;
   const pcm=Buffer.from(part.inlineData.data,'base64');let peak=0;for(let i=0;i+1<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)/32768));
   tally.outputSamples=(tally.outputSamples??0)+Math.floor(pcm.length/2);tally.outputPeak=Math.max(tally.outputPeak??0,peak);tally.tinyPCM+=Number(pcm.length<=4);
 }
 if(Number.isInteger(m.error?.code))receipt.providerErrorCode=m.error.code;
 if(m.setupComplete)receipt.setupComplete=true;
 if(c?.interrupted){interruptedResponseEnding=true;receipt.providerInterruptions=(receipt.providerInterruptions??0)+1;output='';}
 if(c?.inputTranscription?.text)input+=c.inputTranscription.text;
 if(c?.outputTranscription?.text)output+=c.outputTranscription.text;
 receipt.audioOutputChunks+=c?.modelTurn?.parts?.filter(k=>k.inlineData).length??0;
 if(m.toolCall)receipt.tools.push(...m.toolCall.functionCalls.map(k=>k.name));
 if(c?.turnComplete&&interruptedResponseEnding){interruptedResponseEnding=false;}else if(c?.turnComplete){console.log('Provider turn:',activeStep,'audio chunks:',receipt.audioOutputChunks);receipt.providerTurns++;receipt.turns.push({step:activeStep,input:input.slice(0,200),reply:output.slice(0,1300)});input='';output='';}
 });
});
await p.addInitScript(()=>{
 const g=window;g.qaWire={sockets:0,policy:[],close:[]};document.addEventListener('securitypolicyviolation',e=>g.qaWire.policy.push(e.effectiveDirective));const Native=WebSocket;g.WebSocket=class extends Native{constructor(...args){super(...args);g.qaWire.sockets++;this.addEventListener('close',e=>g.qaWire.close.push(e.code));}};g.qaTracks=[];g.qaHits=[];g.qaStates=[];g.qaPlayback=[];
 g.qaCharacterStates=[];new MutationObserver(events=>{for(const e of events){const s=e.target.dataset.edenState;if(s&&g.qaCharacterStates.at(-1)!==s)g.qaCharacterStates.push(s);}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-eden-state']});
 g.qaMarks=[];g.qaMaxOutput=0;g.qaStep='introduction';g.qaStepPeak={};
 new MutationObserver(events=>{for(const e of events)if(e.target instanceof HTMLElement){
    g.qaMarks.push({attribute:e.attributeName,on:e.target.hasAttribute(e.attributeName),atMs:performance.now()});
 }}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-cursor-hover','data-cursor-press']});
 const connect=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(...args){
  const result=connect.apply(this,args);
  if(this instanceof AnalyserNode&&args[0]===this.context.destination){
    const capture=this.context.createMediaStreamDestination();
    connect.call(this,capture);g.qaOutput=capture.stream;
    const analyser=this;g.qaOutputClock={initial:this.context.currentTime,last:this.context.currentTime,ticks:0,state:this.context.state};const clock=g.qaOutputClock;
    const values=new Float32Array(analyser.fftSize);g.qaLevelTimer=setInterval(()=>{
      clock.last=analyser.context.currentTime;clock.ticks++;clock.state=analyser.context.state;
      analyser.getFloatTimeDomainData(values);let sum=0;for(const v of values)sum+=v*v;
      g.qaCurrentOutput=Math.sqrt(sum/values.length);g.qaStepPeak[g.qaStep]=Math.max(g.qaStepPeak[g.qaStep]??0,g.qaCurrentOutput);g.qaMaxOutput=Math.max(g.qaMaxOutput,g.qaCurrentOutput);
    },50);
  }
  return result;
 };
 navigator.mediaDevices.getUserMedia=async()=>{
   g.qaMic=new AudioContext();await g.qaMic.resume();g.qaDest=g.qaMic.createMediaStreamDestination();g.qaTracks.push(...g.qaDest.stream.getTracks());
   return g.qaDest.stream;
 };
 g.qaSay=async raw=>{
   const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
   const buffer=await g.qaMic.decodeAudioData(bytes.buffer);
   const source=g.qaMic.createBufferSource();source.buffer=buffer;source.connect(g.qaDest);
   source.start();await new Promise(done=>source.onended=done);
 };
 g.qaRecord=async()=>{
   const mix=g.qaMix=new AudioContext();await mix.resume();const dest=mix.createMediaStreamDestination();
   for(const track of [g.qaOutput,g.qaDest.stream])mix.createMediaStreamSource(track).connect(dest);
   const rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];
   g.qaRecorder=rec;g.qaBytes=new Promise(done=>{rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{const reader=new FileReader();reader.onload=()=>done(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks));};});rec.start();
 };
 document.addEventListener('eden:visible-action',event=>{const {phase,target,rect}=event.detail;g.qaStates.push({phase,atMs:performance.now()});if(phase!=='execute')return;const arrow=document.querySelector('.showcase-pointer-cursor-arrow'),matrix=arrow?.getScreenCTM();const tip=matrix&&new DOMPoint(4.2,3.3).matrixTransform(matrix);
   g.qaHits.push({target:typeof target==='object'&&target.resultKey?target.operation:target,landed:!!tip&&tip.x>=rect.x-2&&tip.x<=rect.x+rect.width+2&&tip.y>=rect.y-2&&tip.y<=rect.y+rect.height+2,atMs:performance.now()});});
});
const video=p.video();
async function waitListening(){
 await p.waitForFunction(()=>['listening','error','ended','permission-required'].includes(document.querySelector('[data-live-phase]')?.dataset.livePhase),null,{timeout:60000});
 assert.equal(await p.locator('[data-live-state]').innerText(),'Listening');
}
const expectedInput={identity:/who.*you/i,capabilities:/help/i,search:/Harrisburg/i,details:/first.*result/i,food:/food/i,page:/page/i,map:/map/i};
async function utter(label){
 activeStep=label;await p.evaluate(v=>{window.qaStep=v;},label);
 const bytes=await readFile(join(process.env.EDEN_QA_SPEECH_DIR,label+'.wav'));
 await p.evaluate(raw=>window.qaSay(raw),bytes.toString('base64'));
}
async function speak(label){
 const before=receipt.turns.length;await utter(label);
 const deadline=Date.now()+65000;
 const matching=()=>receipt.turns.slice(before).find(v=>expectedInput[label].test(v.input)&&v.reply.trim());
 while(!matching()&&Date.now()<deadline){
   if(await p.locator('[data-live-start]').isVisible())throw Error('Call ended: '+await p.locator('[data-live-state]').innerText());
   await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert(matching(),'Missing spoken input and response for '+label);await waitListening();return matching().reply;
}
try{
 await p.goto(origin);
 // Chrome loads AudioWorklet modules outside Playwright's ordinary page routes.
 // Authenticate only this public first-party asset. Redirects cannot carry the credential.
 const asset=origin+'/audio/eden-live-capture-worklet.js',cdp=await ctx.newCDPSession(p);
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:asset,requestStage:'Request'}]});
 cdp.on('Fetch.requestPaused',async e=>{
   if(e.request.url!==asset){await cdp.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});return;}
   const upstream=await fetch(asset,{redirect:'error',headers:{'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}});
   receipt.workletHTTP=upstream.status;
   await cdp.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:upstream.status,responseHeaders:[{name:'Content-Type',value:upstream.headers.get('content-type')}],body:Buffer.from(await upstream.arrayBuffer()).toString('base64')});
 });
 assert.equal(await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),sha);
 await p.locator('.eden-launch').click();await p.locator('[data-live-start]').click();
 if(await p.locator('.eden-consent').isVisible()){
   for(const box of await p.locator('.eden-consent input:visible').all())await box.check();await p.locator('[data-continue]').click();
 }
 await p.locator('[data-live-confirm]').waitFor();assert.equal(await p.evaluate(()=>window.qaTracks.length),0);
 // One explicit admission-denied fixture proves retry in the same document.
 // It does not mint a credential, reach Google, or count as a real call.
 const denied=origin+'/api/v1/eden/hosted/live/token';
 await p.route(denied,route=>route.fulfill({status:409,json:{error:{code:'EDEN_LIVE_CALL_ACTIVE'}}}),{times:1});
 await p.locator('[data-live-confirm]').click();await p.locator('[data-live-details]:visible').waitFor();
 const attempt=await p.evaluate(()=>JSON.parse(document.querySelector('[data-live-diagnostic]').dataset.liveDiagnostic).at(-1));
 assert.equal(attempt.service,'EDEN_LIVE_CALL_ACTIVE');assert.equal(attempt.tokenHTTP,409);assert.equal(attempt.microphoneActive,false);
 assert(await p.evaluate(()=>window.qaTracks.length===1&&window.qaTracks[0].readyState==='ended'));
 receipt.deniedRetryFixture={http:409,stage:attempt.failure,stoppedTrack:true,reference:attempt.reference};
 // Do not spend a real credential if this Chrome process cannot render audio.
 receipt.preflight=await p.evaluate(async()=>{
   const ctx=new AudioContext(),meter=ctx.createAnalyser(),tone=ctx.createOscillator(),gain=ctx.createGain(),quiet=ctx.createGain();
   try{await ctx.resume();gain.gain.value=.08;quiet.gain.value=0;tone.connect(gain);gain.connect(meter);meter.connect(quiet);quiet.connect(ctx.destination);
     const start=ctx.currentTime;let peak=0;const samples=new Float32Array(meter.fftSize);tone.start();tone.stop(start+.3);
     for(let i=0;i<10;i++){await new Promise(resolve=>setTimeout(resolve,40));meter.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));}
     return {advance:ctx.currentTime-start,peak};
   }finally{await ctx.close();}
 });
 assert(receipt.preflight.advance>.2&&receipt.preflight.peak>.015,'Chrome output clock unavailable; stopped before mint');
 await p.locator('[data-live-start]').click();await p.locator('[data-live-confirm]').waitFor();
 activeStep='introduction';await p.locator('[data-live-confirm]').click();
 await p.waitForFunction(()=>window.qaOutput&&window.qaDest&&window.qaTracks.length===2&&window.qaTracks.at(-1).readyState==='live',null,{timeout:18000});audioStartAt=await p.evaluate(()=>performance.now());await p.evaluate(()=>window.qaRecord());
 const interrupt=process.env.EDEN_QA_INTERRUPT==='1';
 await waitListening();
 assert(receipt.setupComplete&&receipt.audioOutputChunks>0);
 assert.equal(receipt.temperature,1);
 await p.locator('[data-live-mute]').click();assert.equal(await p.locator('[data-live-mute]').getAttribute('aria-pressed'),'true');await p.locator('[data-live-mute]').click();receipt.muteUnmute=true;
 for(const name of (process.env.EDEN_QA_TURNS??'identity,search,details').split(',')){
   let reply='';
   if(interrupt&&name==='search'){
     await utter('search');
     // Interrupt the *spoken result*, after its authorized action, rather than
     // treating an introduction ending during an utterance as an answer.
     await p.waitForFunction(()=>document.querySelector('[data-live-state]')?.textContent==='Eden is speaking'&&window.qaCurrentOutput>.015&&document.querySelector('[data-card-key^="directory:"]'),null,{timeout:65000});
     receipt.interruptStart=await p.locator('[data-live-state]').innerText();
     receipt.searchTranscribed=expectedInput.search.test(input)||receipt.turns.some(t=>expectedInput.search.test(t.input));
     assert(receipt.searchTranscribed&&receipt.sentSignal?.search?.nonSilent>0,'Search must reach Google as non-silent PCM and be transcribed before interruption');
   }else reply=await speak(name);
   receipt.observations??={};
   if(name==='identity')receipt.observations.identity=/Eden|Our Ground/i.test(reply);
   if(name==='capabilities')receipt.observations.capabilities=/directory|resource|healthcare|support/i.test(reply);
   if(name==='search')receipt.observations.search=new URL(p.url()).pathname==='/support'&&await p.locator('#locationInput').inputValue()==='Harrisburg, PA';
   if(name==='details'&&interrupt)receipt.interruptReply=reply;
   if(name==='details')receipt.observations.details=await p.locator('[data-card-key^="directory:"]').first().locator('[data-resource-content]:visible').count()>0;
   if(name==='food')receipt.observations.food=await p.locator('[data-need="food"][aria-pressed="true"],[data-category="food"][aria-pressed="true"]').count()>0;
   if(name==='page')receipt.observations.page=/support|food|search|results|resource|map/i.test(reply)&&!receipt.tools.includes('unknown');
   if(name==='map')receipt.observations.map=await p.locator('#showSupportMap').getAttribute('aria-expanded')==='true'&&await p.locator('[data-resource-content]:visible').count()===0;
 }
 receipt.cursor=await p.evaluate(()=>window.qaHits);
 if(receipt.observations.search)assert(receipt.cursor.length>=5&&receipt.cursor.every(e=>e.landed),'Cursor did not land inside every observed public action target');
 await p.screenshot({path:join(out,'voice-action.jpg'),quality:83});
 const ended=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/hosted/live/end'));
 await p.locator('[data-live-end]').click();receipt.endHTTP=(await ended).status();assert.equal(receipt.endHTTP,200);assert.equal(await p.locator('[data-live-state]').innerText(),'Call ended');
 receipt.micReleased=await p.evaluate(()=>window.qaTracks.length>0&&window.qaTracks.every(t=>t.readyState==='ended'));assert(receipt.micReleased);
 assert.equal(receipt.requestedVoice,'Aoede');assert(receipt.audioInputChunks>0&&receipt.audioOutputChunks>0);assert.deepEqual(receipt.errors,[]);
 if(interrupt){
   const d=await p.evaluate(()=>JSON.parse(document.querySelector('[data-live-diagnostic]').dataset.liveDiagnostic).at(-1));
   assert(d.spokenInterruptions>0||receipt.providerInterruptions>0,'No audible local or acknowledged provider interruption');
   assert(receipt.turns.some(t=>expectedInput.details.test(t.input))&&receipt.observations.details&&receipt.interruptReply.trim(),'Follow-up did not open the requested result');
 }
 assert(Object.values(receipt.observations).every(Boolean),'One or more requested actions were not confirmed');
 assert.equal(await p.evaluate(()=>window.qaWire.sockets),1);assert((await p.evaluate(()=>window.qaMaxOutput))>.015);
 receipt.characterStates=await p.evaluate(()=>window.qaCharacterStates);assert(receipt.characterStates.includes('speaking'));
 receipt.graphPeakByStep=await p.evaluate(()=>window.qaStepPeak);
 for(const step of ['introduction',...Object.keys(receipt.observations)])assert(receipt.graphPeakByStep[step]>.001&&receipt.providerByStep[step].outputPeak>.002&&receipt.providerByStep[step].outputSamples>=1200,'No measured speech playback: '+step);
 receipt.status='PASS';
}catch(e){process.exitCode=1;receipt.failedAt=activeStep;receipt.failure=String(e.message).split('\n')[0].slice(0,240);receipt.ui=await p.locator('[data-live-state]').innerText().catch(()=>'');}
finally{
 receipt.partialProviderInput=input.slice(0,160); // Test-generated public phrases only.
 receipt.partialProviderReply=output.slice(0,400);
 receipt.firstDetailOpen=await p.locator('[data-card-key^="directory:"]').first().locator('[data-resource-content]:visible').count().then(n=>n>0).catch(()=>false);
 receipt.graphPeakByStep=await p.evaluate(()=>window.qaStepPeak).catch(()=>({}));
 receipt.playerPeakRms=await p.evaluate(()=>window.qaMaxOutput).catch(()=>0);
 receipt.playerClock=await p.evaluate(()=>window.qaOutputClock).catch(()=>null);
 receipt.cursor??=await p.evaluate(()=>window.qaHits).catch(()=>[]);
 receipt.paintMarks=await p.evaluate(()=>window.qaMarks).catch(()=>[]);receipt.cursorPhases=await p.evaluate(()=>window.qaStates).catch(()=>[]);
 if(await p.locator('[data-live-end]').isVisible().catch(()=>false)){
   const released=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/hosted/live/end'),{timeout:8000}).then(r=>r.status()).catch(()=>null);
   await p.locator('[data-live-end]').click().catch(()=>{});receipt.endHTTP=await released;
 }
 if(receipt.tokenCheck&&!receipt.endHTTP){
   const prior=receipt.http.findLast(r=>r.path==='live/end');
   receipt.endHTTP=prior?.status??await p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/hosted/live/end'),{timeout:8000}).then(r=>r.status()).catch(()=>null);
 }
 receipt.diagnostics=await p.evaluate(()=>JSON.parse(document.querySelector('[data-live-diagnostic]')?.dataset.liveDiagnostic??'[]')).catch(()=>[]);
 receipt.micReleased=await p.evaluate(()=>window.qaTracks.length>0&&window.qaTracks.every(t=>t.readyState==='ended')).catch(()=>false);
 receipt.wire=await p.evaluate(()=>window.qaWire).catch(()=>null);
 const data=await p.evaluate(async()=>{if(!window.qaRecorder)return null;window.qaRecorder.stop();return await window.qaBytes;}).catch(()=>null);
 if(data){await writeFile(join(out,'call-audio.webm'),Buffer.from(data,'base64'));receipt.audioCaptureStartMs=audioStartAt;}
 await ctx.close();if(video)await rename(await video.path(),join(out,'call-screen.webm'));await browser.close();
 await writeFile(join(out,'live.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
