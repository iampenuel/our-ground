// Independently verify the collected real Chrome/Gemini evidence offline.
// Provider reception, the application's per-reply meter, the test analyser
// and an interruption boundary are separate witnesses. Never mutate the input.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const input=readFileSync(process.argv[2]),r=JSON.parse(input),d=r.diagnostics.at(-1);
assert.equal(d.failure,'none');assert.equal(d.stage,'ended');assert.equal(d.endHTTP,200);
assert.equal(r.requestedModel,'models/gemini-3.8-live');assert.equal(r.temperature,1);assert.equal(r.requestedVoice,'Aoede');
assert.equal(r.tokenCheck.validOnIssuerClock,true);assert.equal(r.tokenCheck.config,true);
assert.equal(r.wire.sockets,1);assert.deepEqual(r.wire.close,[1000]);assert.deepEqual(r.errors,[]);
assert(r.micReleased&&r.firstDetailOpen&&r.searchTranscribed&&r.muteUnmute);
assert(r.characterStates.includes('speaking'));assert(r.providerInterruptions>0);
assert(r.cursor.length>=5&&r.cursor.every(v=>v.landed));
for(const key of ['identity','search','details'])assert(r.observations[key]&&r.providerByStep[key].input>0&&r.sentSignal[key].nonSilent>0);
for(const key of ['introduction','identity','search','details']){
  const step=r.providerByStep[key];assert(step.outputSamples>=1200&&step.outputPeak>.002&&step.output>0);
  if(key!=='search')assert(r.graphPeakByStep[key]>.015&&step.completed>0);
}
assert(r.turns.some(v=>v.step==='identity'&&/who.*you/i.test(v.input)&&/Eden/i.test(v.reply)));
assert(r.turns.some(v=>v.step==='details'&&/first.*result/i.test(v.input)&&v.reply.length>10));
assert.equal(r.interruptStart,'Eden is speaking');
const interrupted=d.replies.filter(v=>v.interrupted&&v.usable);
assert.equal(interrupted.length,1);
assert(interrupted[0].scheduled>0&&interrupted[0].graphPeakRms>.015&&interrupted[0].ended>0);
assert.equal(d.capture.dropped,0);assert.equal(d.capture.encoded,d.inputChunks);assert(d.capture.inputCaptions>=3&&d.capture.sentWithSignal>0);
assert(r.endHTTP===200&&r.playerClock.state==='closed'&&r.http.filter(v=>v.path==='live/token'&&v.status===200).length===1);
console.log(JSON.stringify({status:'PASS',scope:'Real hosted Chrome with generated public speech; not physical acceptance',sha:r.sha,
 sourceSHA256:createHash('sha256').update(input).digest('hex'),originalRunner:r.status,originalFailure:r.failure,
 inputChunks:d.inputChunks,signalPackets:d.capture.sentWithSignal,recognizedUtterances:d.capture.inputCaptions,explicitVadStarts:d.capture.serverStarts,
 outputGraphPeakRms:{introduction:r.graphPeakByStep.introduction,identity:r.graphPeakByStep.identity,interruptedSearch:interrupted[0].graphPeakRms,details:r.graphPeakByStep.details},
 providerConfirmedInterruptions:r.providerInterruptions,cursorTargets:r.cursor.length,releaseHTTP:r.endHTTP,webSocketClose:r.wire.close[0],allTracksEnded:r.micReleased},null,2));
