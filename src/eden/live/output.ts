import { decodeLivePcm, LIVE_OUTPUT_RATE, liveAudioContextState } from './audio.ts';
import type {LiveAudioContextState} from './audio.ts';

export interface LiveOutput {
  init(): Promise<void>;
  enqueue(data: string, mimeType: string, samples?:Float32Array<ArrayBuffer>, observed?:PlaybackObservation): void;
  drain(signal: AbortSignal): Promise<void>;
  setMuted(muted: boolean): void;
  stop(): void;
  close(): void;
  readonly contextState?: LiveAudioContextState;
}
export type PlaybackObservation={scheduled:number;ended:number;graphPeakRms:number};
type Scheduled = {source: AudioBufferSourceNode; start: number; end: number; observed?:PlaybackObservation};
/** Ordered PCM playback; audible activity comes from the actual output graph. */
export class LivePcmOutput implements LiveOutput {
  private context: AudioContext | undefined;
  private gain: GainNode | undefined;
  private analyser: AnalyserNode | undefined;
  private sources = new Set<Scheduled>();
  private waiters = new Set<{resolve: () => void; reject: () => void; cleanup: () => void}>();
  private next = 0; private generation = 0; private muted = false; private frame: number | undefined;
  private active = false; private lastSignal=-Infinity;
  private onLevel: (level: number) => void; private onActivity: (active: boolean) => void; private contextFactory: () => AudioContext;
  private onContextState:(state:LiveAudioContextState)=>void;
  constructor(onLevel: (level: number) => void, onActivity: (active: boolean) => void,
    contextFactory = () => new AudioContext({latencyHint: 'interactive'}), onContextState: (state:LiveAudioContextState)=>void = ()=>{}) { this.onLevel = onLevel; this.onActivity = onActivity; this.contextFactory = contextFactory;this.onContextState=onContextState; }
  get contextState():LiveAudioContextState { return liveAudioContextState(this.context?.state); }
  async init() {
    // This executes before the first await, from the explicit call gesture.
    const context = this.contextFactory(); this.context = context;
    context.onstatechange = () => { if(this.context === context)this.onContextState(this.contextState); };
    const gain = context.createGain(), analyser = context.createAnalyser(); analyser.fftSize = 512;
    this.gain = gain; this.analyser = analyser; gain.gain.value = this.muted ? 0 : 1;
    gain.connect(analyser); analyser.connect(context.destination);
    await context.resume();
    if (this.context !== context || context.state !== 'running') throw new Error('Audio playback did not start.');
    this.onContextState(this.contextState);
  }
  enqueue(data: string, mimeType: string, decoded?:Float32Array<ArrayBuffer>, observed?:PlaybackObservation) {
    const context = this.context, gain = this.gain;
    if (!context || !gain || context.state !== 'running') throw new Error('Audio playback is unavailable.');
    const samples = decoded ?? decodeLivePcm(data, mimeType);
    const start = Math.max(this.next, context.currentTime + .015), end = start + samples.length / LIVE_OUTPUT_RATE;
    if (end - context.currentTime > 60 || this.sources.size >= 2048) throw new Error('Voice playback exceeded its limit.');
    const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_RATE); buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(gain);
    const scheduled = {source, start, end, observed}, generation = this.generation;
    source.onended = () => {
      source.disconnect();
      if (generation !== this.generation) return;
      if(observed)observed.ended++; this.sources.delete(scheduled); this.resolveDrain();
    };
    this.sources.add(scheduled); this.next = end;
    try { source.start(start); if(observed)observed.scheduled++; } catch (error) { this.sources.delete(scheduled); source.disconnect(); throw error; }
    this.animate();
  }
  private animate() {
    if (this.frame !== undefined) return;
    const tick = () => {
      this.frame = undefined;
      const context = this.context, analyser = this.analyser;
      if (!context || !analyser) return;
      const current=[...this.sources].filter(item=>context.currentTime>=item.start&&context.currentTime<item.end);
      let rms=0;
      if (!this.muted&&context.state==='running'&&current.length) {
        const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
        rms=Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);
        for(const item of current)if(item.observed)item.observed.graphPeakRms=Math.max(item.observed.graphPeakRms,rms);
      }
      if(rms>.001)this.lastSignal=context.currentTime;
      const playing=!!current.length&&!this.muted&&context.state==='running'&&context.currentTime-this.lastSignal<.12;
      if(playing!==this.active){this.active=playing;this.onActivity(playing);}
      this.onLevel(Math.min(1,rms*4));
      if (this.sources.size) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  drain(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.sources.size) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const abort = () => { this.waiters.delete(waiter); waiter.cleanup(); reject(new Error('Voice playback interrupted.')); };
      const timer = setTimeout(abort, Math.max(0, this.next - (this.context?.currentTime ?? 0)) * 1000 + 2500);
      const waiter = {resolve, reject: abort, cleanup: () => { clearTimeout(timer); signal.removeEventListener('abort', abort); }};
      this.waiters.add(waiter); signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort();
    });
  }
  private resolveDrain() { if (this.sources.size) return; for (const waiter of [...this.waiters]) { this.waiters.delete(waiter); waiter.cleanup(); waiter.resolve(); } }
  setMuted(muted: boolean) { this.muted = muted; if (this.gain) this.gain.gain.value = muted ? 0 : 1; if (muted) { this.active = false; this.onActivity(false); this.onLevel(0); } }
  stop() {
    this.generation++;this.lastSignal=-Infinity;
    for (const {source} of this.sources) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.sources.clear(); this.next = 0;
    for (const waiter of [...this.waiters]) waiter.reject();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined;
    this.active = false; this.onActivity(false); this.onLevel(0);
  }
  close() { this.stop(); this.gain?.disconnect(); this.analyser?.disconnect(); const context = this.context; this.context = undefined; if (context) {context.onstatechange=null;void context.close().catch(() => {});} }
}
