// Verify the actual audio returned to the widget (no mocked media, no extra TTS).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inspectEdenWav} from '../shared/eden-speech.ts';

export async function beginVoiceObservation(page){
  const observer={requests:0,errorRoutes:[]};
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/v1/eden/hosted/speech')observer.requests++;});
  page.on('response',res=>{
    const path=new URL(res.url()).pathname;
    if(path.startsWith('/api/v1/eden/hosted/')&&res.status()>=400)observer.errorRoutes.push({route:path.split('/').at(-1),http:res.status()});
  });
  // Keep native Audio and playback intact; observe actual detached players.
  await page.addInitScript(()=>{
    const NativeAudio=window.Audio;
    window.edenObservedAudio=[];
    window.Audio=class extends NativeAudio {constructor(...args){super(...args);window.edenObservedAudio.push(this);}};
  });
  return observer;
}

export async function verifyAndSaveHostedSpeech({page,origin,commit,out,displayedReply,onFirstPlayback,observer}){
  await mkdir(out,{recursive:true});
  const receipt={origin,commit,checkedAtUTC:new Date().toISOString(),displayedReply,subjectivelyReviewed:false,status:'FAIL'};
  let phase='Aoede audio';
  try {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/eden/hosted/speech');
    await page.locator('[data-speak]').click();
    const media=await response;
    receipt.audioHTTP=media.status();
    const headers=media.headers();
    assert.equal(receipt.audioHTTP,200);
    assert.equal(headers['content-type'],'audio/wav');
    receipt.requestedModel=headers['x-eden-speech-model'];receipt.providerReportedModel=headers['x-eden-speech-provider-model']??null;
    receipt.requestedVoice=headers['x-eden-speech-voice'];
    assert.equal(receipt.requestedVoice,'Aoede');assert.match(receipt.requestedModel,/^gemini-.*-tts$/);
    const bytes=await media.body();
    const geometry=inspectEdenWav(bytes);assert(geometry);
    receipt.replyHashMatches=headers['x-eden-speech-text-sha256']===createHash('sha256').update(receipt.displayedReply).digest('hex');assert(receipt.replyHashMatches);
    receipt.seconds=geometry.durationSeconds;receipt.sampleRateHz=geometry.sampleRate;receipt.bytes=bytes.length;
    let power=0;
    // A standard verified 24 kHz PCM stream can contain additional WAV chunks.
    for(let offset=12;offset+8<=bytes.length;){
      const size=bytes.readUInt32LE(offset+4),start=offset+8;
      if(bytes.toString('ascii',offset,offset+4)==='data'){
        for(let i=start;i+1<start+size;i+=2)power+=bytes.readInt16LE(i)**2/(size/2);
        break;
      }
      offset=start+size+(size%2);
    }
    receipt.pcmRms=Math.round(Math.sqrt(power));assert(receipt.pcmRms>0);
    receipt.audioSHA256=createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(out,'staging-aoede.wav'),bytes);
    phase='playing, stop and replay';
    const speaking=page.locator('.eden-state').filter({hasText:'Reading with Aoede'});
    await speaking.waitFor();
    await page.waitForFunction(()=>window.edenObservedAudio.some(a=>!a.paused&&a.currentTime>0));
    receipt.realPlayheadAdvanced=true;
    if(onFirstPlayback)await onFirstPlayback();
    await page.locator('[data-stop]:visible').click();
    assert(await page.evaluate(()=>window.edenObservedAudio.every(a=>a.paused)));receipt.stop=true;
    await page.locator('[data-speak]').click();await speaking.waitFor();
    await page.waitForFunction(()=>window.edenObservedAudio.length>=2&&window.edenObservedAudio.at(-1).currentTime>0);
    await page.locator('[data-minimize]').click();assert(await page.evaluate(()=>window.edenObservedAudio.every(a=>a.paused)));
    receipt.minimizeInterruptedReplay=true;
    await page.locator('.eden-launch').click();await page.locator('[data-speak]').click();await speaking.waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-stop]').hidden,undefined,{timeout:25000});
    assert.equal(observer.requests,1);receipt.replayCompletedWithoutNewRequest=true;receipt.status='PASS';
  } catch (e) {
    receipt.blockedAt=phase;
    throw e;
  } finally {
    receipt.speechRequests=observer.requests;receipt.errorRoutes=observer.errorRoutes;
    await writeFile(join(out,'staging-speech.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify(receipt));
  }
  return receipt;
}
