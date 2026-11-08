import {liveAudioContextState} from './audio.ts';
import type {LiveAudioContextState} from './audio.ts';
export interface LiveMicrophone {
  start(signal: AbortSignal, onStage?: (stage: LiveMicrophonePreparation) => void): Promise<void>;
  setMuted(muted: boolean): void;
  setForwarding?(allowed: boolean): void;
  stop(): void;
  readonly active: boolean;
  readonly contextState?: LiveAudioContextState;
}
export type LiveMicrophonePreparation = 'permission-pending' | 'initializing' | 'ready';
/** Only start() requests permission; no capture occurs on import or construction. */
export class BrowserLiveMicrophone implements LiveMicrophone {
  private stream: MediaStream | undefined; private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined; private node: AudioWorkletNode | undefined; private silence: GainNode | undefined;
  private generation = 0; private muted = false; private forwarding = false; private captureEpoch = 0; private removeAbort: (() => void) | undefined;
  private onFrame: (frame: Float32Array, actualSampleRate: number) => void; private onFailure: () => void;
  private onContextState:(state:LiveAudioContextState)=>void;
  constructor(onFrame: (frame: Float32Array, actualSampleRate: number) => void, onFailure: () => void, onContextState:(state:LiveAudioContextState)=>void=()=>{}) { this.onFrame = onFrame; this.onFailure = onFailure;this.onContextState=onContextState; }
  get contextState():LiveAudioContextState { return liveAudioContextState(this.context?.state); }
  get active() { return this.contextState==='running' && Boolean(this.stream?.getAudioTracks().some(track => track.readyState === 'live')); }
  async start(signal: AbortSignal, onStage?: (stage: LiveMicrophonePreparation) => void) {
    signal.throwIfAborted();
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') throw new Error('Microphone unavailable.');
    const generation = ++this.generation, context = new AudioContext({latencyHint: 'interactive'}); this.context = context;
    context.onstatechange=()=>{if(generation===this.generation&&this.context===context)this.onContextState(this.contextState);};
    const cancel = () => this.stop(); signal.addEventListener('abort', cancel, {once: true}); this.removeAbort = () => signal.removeEventListener('abort', cancel);
    // Unlock this graph in the same user gesture, before the permission await.
    const running = context.resume(); void running.catch(() => {});
    let stream: MediaStream | undefined;
    try {
      onStage?.('permission-pending');
      stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
      if (signal.aborted || generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw new Error('Call ended.'); }
      this.stream = stream; this.setMuted(this.muted); onStage?.('initializing');
      await Promise.all([running, context.audioWorklet.addModule('/audio/eden-live-capture-worklet.js')]);
      if (signal.aborted || generation !== this.generation || context.state !== 'running') throw new Error('Microphone unavailable.');
      const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, 'eden-live-capture'), silence = context.createGain(); silence.gain.value = 0;
      this.source = source; this.node = node; this.silence = silence;
      node.port.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data as {frame?: unknown; epoch?: unknown} | null;
        if (generation === this.generation && !signal.aborted && !this.muted && this.forwarding && data?.epoch === this.captureEpoch && data.frame instanceof Float32Array) this.onFrame(data.frame, context.sampleRate);
      };
      node.port.postMessage({enabled: this.forwarding, epoch: this.captureEpoch});
      source.connect(node); node.connect(silence); silence.connect(context.destination);
      for (const track of stream.getAudioTracks()) track.onended = () => { if (generation === this.generation && !signal.aborted) this.onFailure(); };
      this.onContextState(this.contextState);
      onStage?.('ready');
    } catch (error) { stream?.getTracks().forEach(track => track.stop()); if (generation === this.generation) this.stop(); throw error; }
  }
  setMuted(muted: boolean) { this.muted = muted; for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted; }
  setForwarding(allowed: boolean) {
    if (allowed === this.forwarding) return;
    this.forwarding = allowed; this.captureEpoch++;
    this.node?.port.postMessage({enabled: allowed, epoch: this.captureEpoch});
  }
  stop() {
    this.generation++; this.forwarding = false; this.captureEpoch++; this.removeAbort?.(); this.removeAbort = undefined;
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); }
    this.source?.disconnect(); this.silence?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) { track.onended = null; track.stop(); }
    const context = this.context; this.context = undefined; if (context) {context.onstatechange=null;void context.close().catch(() => {});}
    this.stream = undefined; this.node = undefined; this.source = undefined; this.silence = undefined;
  }
}
