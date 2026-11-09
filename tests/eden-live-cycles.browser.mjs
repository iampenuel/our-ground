// Explicit provider fixtures for cycling real browser capture/playback/teardown.
// No microphone hardware, provider socket, token mint or organization data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {buildEdenLiveConfig,EDEN_LIVE_MODEL} from '../shared/eden-live.ts';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const origin=new URL(process.env.RECOVERY_BASE).origin,sha=process.env.RECOVERY_SHA,out=process.env.RECOVERY_IMAGES;
const baseline=process.env.EDEN_QA_BASELINE==='48dd901';if(baseline)assert.equal(sha,'48dd90193cd1fd9ad0f504619f55618c89323402');
const browser=await chromium.launch({channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const receipt={origin,sha,fixture:'local token and provider transport, generated test signal, real compiled browser client',cycles:[],status:'FAIL'};
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await protectRecoveryOrigin(context,origin,process.env.VERCEL_OIDC_TOKEN);
 const p=await context.newPage();p.setDefaultTimeout(10000);
 let minted=0,leases=new Set(),packets=0,streamEnds=0,sockets=0;
 const events=[];
 await p.route(origin+'/api/v1/eden/hosted/session',r=>r.fulfill({json:{sessionToken:'f'.repeat(43),expiresAt:new Date(Date.now()+900000)}}));
 await p.route(origin+'/api/v1/eden/hosted/live/token',r=>{
   if(leases.size)throw Error('Overlapping fixture lease');minted++;const callId=randomBytes(32).toString('base64url');leases.add(callId);
   return r.fulfill({headers:{date:new Date().toUTCString()},json:{token:'auth_tokens/fixture-only',model:EDEN_LIVE_MODEL,voiceName:'Aoede',callId,maxCallSeconds:595,expiresAt:new Date(Date.now()+595000).toISOString(),newSessionExpiresAt:new Date(Date.now()+55000).toISOString(),config:{...buildEdenLiveConfig({directory:true}),...(baseline?{temperature:.3}:{})}}});
 });
 await p.route(origin+'/api/v1/eden/hosted/live/end',r=>{assert(leases.delete(r.request().postDataJSON().callId));return r.fulfill({json:{ended:true}});});
 const pcm=Buffer.alloc(9600);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(3000*Math.sin(i/12)),i*2);
 await context.routeWebSocket(/wss:\/\/generativelanguage\.googleapis\.com\//,ws=>{
   sockets++;ws.onMessage(data=>{
     const m=JSON.parse(String(data));
     if(m.setup){ws.send(JSON.stringify({setupComplete:{}}));return;}
     if(m.realtimeInput?.text&&(sockets===2||baseline)){
       ws.send(JSON.stringify({serverContent:{outputTranscription:{text:'Public fixture caption.'},modelTurn:{parts:[{inlineData:{data:'AAA=',mimeType:'audio/pcm;rate=24000'}}]},generationComplete:true}}));
       return;
     }
     if(m.realtimeInput?.text){
       ws.send(JSON.stringify({serverContent:{modelTurn:{parts:[{inlineData:{data:pcm.toString('base64'),mimeType:'audio/pcm;rate=24000'}}]}}}));
       ws.send(JSON.stringify({serverContent:{generationComplete:true,turnComplete:true}}));
     }
     if(m.realtimeInput?.audio)packets++;
     if(m.realtimeInput?.audioStreamEnd)streamEnds++;
   });
   ws.onClose(code=>{if(Number.isInteger(code))events.push(code);});
 });
 await p.addInitScript(()=>{
   window.fixtureStates=[];
   new MutationObserver(recs=>{for(const r of recs){const s=r.target.dataset.edenState;if(s&&window.fixtureStates.at(-1)!==s)window.fixtureStates.push(s);}})
     .observe(document,{subtree:true,attributes:true,attributeFilter:['data-eden-state']});
   window.fixtureTracks=[];navigator.mediaDevices.getUserMedia=async()=>{
     const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();
     window.fixtureTracks.push(...dest.stream.getTracks());
     window.fixtureSay=()=>{const osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.15;osc.connect(gain);gain.connect(dest);osc.start();osc.stop(ctx.currentTime+.45);};
     return dest.stream;
   };
 });
 await p.goto(origin+'/?eden=1');assert.equal(await p.evaluate(async()=>(await(await fetch('/ourground-build-evidence.json')).json()).source_commit),sha);
 const asset=origin+'/audio/eden-live-capture-worklet.js',cdp=await context.newCDPSession(p);
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:asset,requestStage:'Request'}]});
 cdp.on('Fetch.requestPaused',async e=>{
   assert.equal(e.request.url,asset);
   const r=await fetch(asset,{redirect:'error',headers:{'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}});assert.equal(r.status,200);
   await cdp.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:r.headers.get('content-type')}],body:Buffer.from(await r.arrayBuffer()).toString('base64')});
 });
 for(let i=0;i<(baseline?1:3);i++){
   await p.locator('[data-live-start]').click();
   if(await p.locator('.eden-consent').isVisible()){
     for(const box of await p.locator('.eden-consent input:visible').all())await box.check();await p.locator('[data-continue]').click();
   }
   await p.locator('[data-live-confirm]').click();
   if(i===1||baseline){
     await p.waitForFunction(()=>document.querySelector('[data-live-phase]')?.dataset.livePhase==='error');
     if(!baseline){const cap=p.locator('[data-live-caption]');assert(await cap.isVisible());assert.match(await cap.innerText(),/voice playback unavailable/i);assert.match(await cap.innerText(),/Public fixture caption/);}
     assert.match(await p.locator('[data-live-state]').innerText(),/too little audio/);
     assert(await p.evaluate(()=>window.fixtureTracks.every(t=>t.readyState==='ended')));
     await p.waitForFunction(()=>document.querySelector('[data-live-receipt]').textContent.includes('endHTTP: 200'));
     assert.equal(leases.size,0);receipt[baseline?'reproducedOldSilentFailure':'silentCaptionRecovered']=true;await p.screenshot({path:join(out,'silent-caption.png')});continue;
   }
   await p.waitForFunction(()=>document.querySelector('[data-live-phase]')?.dataset.livePhase==='listening');
   if(i===0){
     await p.evaluate(()=>window.fixtureSay());await p.waitForFunction(()=>document.querySelector('[data-live-phase]').dataset.livePhase==='processing');
     const atPause=packets;await p.waitForFunction(()=>document.querySelector('[data-live-state]').textContent.includes('No answer came back'),null,{timeout:32000});
     assert(packets>atPause+10);assert.equal(streamEnds,0);assert.equal(minted,1);
     await p.locator('[data-live-mute]').click();await p.locator('[data-live-mute]').click();
   }
   assert(!(await p.locator('[data-live-caption]').isVisible()));
   const released=p.waitForResponse(r=>r.url().endsWith('/hosted/live/end'));await p.locator('[data-live-end]').click();assert.equal((await released).status(),200);
   assert(await p.evaluate(()=>window.fixtureTracks.every(t=>t.readyState==='ended')));assert.equal(leases.size,0);
   const diag=await p.evaluate(()=>JSON.parse(document.querySelector('[data-live-diagnostic]').dataset.liveDiagnostic).at(-1));
   assert(diag.replies.some(v=>v.graphPeakRms>.001&&v.scheduled>0&&v.ended>0),'Known tone must traverse the actual Live player and output analyser');
   receipt.cycles.push({toneGraph:diag.replies[0],cycle:i+1,allTracksEnded:true,activeLeases:leases.size,sockets,minted});
 }
 if(!baseline){assert.equal(sockets,3);assert.equal(minted,3);assert.equal(streamEnds,1);
 receipt.character=await p.evaluate(()=>({states:window.fixtureStates,renderer:document.querySelector('[data-eden-portrait]')?.dataset.edenPortrait}));
 assert(receipt.character.states.includes('speaking'));assert.equal(receipt.character.renderer,'svg-profile');
 }
 receipt.status='PASS';receipt.pcmPackets=packets;receipt.streamEnds=streamEnds;receipt.unansweredTurnKeptConnection=true;
 receipt.closeCodes=events;
}catch(e){receipt.failure=String(e.message).split('\n')[0].slice(0,150);process.exitCode=1;}
finally{await browser.close();await mkdir(out,{recursive:true});await writeFile(join(out,'fixture-cycles.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
