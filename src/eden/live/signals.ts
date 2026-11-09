// Numeric, page-lifetime receipts. PCM stays in the ordinary capture/playback
// buffer only. A caption, a scheduled source and an audible graph are different.
import {decodeLivePcm, LIVE_OUTPUT_RATE} from './audio.ts';
export function newReply(turn:number) {
  return {turn,caption:false,chunks:0,bytes:0,samples:0,nonzero:0,energy:0,peak:0,scheduled:0,ended:0,graphPeakRms:0,generated:false,completed:false,interrupted:false};
}
export type ReplySignal=ReturnType<typeof newReply>;
export function inspectChunk(r:ReplySignal,data:string,mime:string) {
  r.chunks++;
  // Google can return an empty placeholder or one sample plus an odd
  // padding byte. Never pass these to the playback graph as speech.
  if(/^audio\/pcm(?:;rate=24000)?$/i.test(mime)&&data.length<=4&&/^(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4}|)$/.test(data)){
    const raw=atob(data);r.bytes+=raw.length;
    if(raw.length<2)return new Float32Array(0);
    const samples=decodeLivePcm(btoa(raw.slice(0,2)),mime);observe(r,samples);return samples;
  }
  const samples=decodeLivePcm(data,mime);r.bytes+=samples.length*2;observe(r,samples);return samples;
}
function observe(r:ReplySignal,samples:Float32Array) {
  r.samples+=samples.length;
  for(const s of samples){r.peak=Math.max(r.peak,Math.abs(s));r.energy+=s*s;if(s!==0)r.nonzero++;}
}
export function usableReply(r:ReplySignal){return r.samples>=1200&&r.peak>.002&&r.energy/Math.max(1,r.samples)>1e-7;}
export function summarizeReply(r:ReplySignal){
  const {energy,nonzero,...values}=r;
  return {...values,durationMs:Math.round(r.samples*1000/LIVE_OUTPUT_RATE),rms:Math.sqrt(energy/Math.max(1,r.samples)),nonzeroRatio:nonzero/Math.max(1,r.samples),usable:usableReply(r)};
}
