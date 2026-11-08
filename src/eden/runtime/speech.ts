import { EDEN_SPEECH_MAX_BYTES, EDEN_SPEECH_MAX_SECONDS, inspectEdenWav, isEdenSpeechPhrase } from '../../../shared/eden-speech.ts';
import type { EdenSpeechPhrase } from '../../../shared/eden-speech.ts';

export type EdenSpeechState = 'idle' | 'loading' | 'speaking' | 'unavailable' | 'muted';
export type EdenPlaybackEvent = 'started' | 'completed' | 'interrupted' | 'unavailable';
export type EdenSpeechControllerOptions = {
  /** The caller supplies the adult-notice/session transport. Only a phrase ID crosses this boundary. */
  request: (phrase: EdenSpeechPhrase, signal: AbortSignal) => Promise<Response>;
  onState?: (state: EdenSpeechState) => void;
  onAudioLevel?: (level: number) => void;
  onPlayback?: (event: EdenPlaybackEvent) => void;
};

/** Bound the stream before allocation, then inspect its PCM WAV envelope. */
export async function readEdenSpeechResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) {
    if (response.body) void response.body.cancel().catch(() => undefined);
    signal.throwIfAborted();
  }
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const length = response.headers.get('content-length');
  if (!response.ok || mime !== 'audio/wav' || !response.body
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > EDEN_SPEECH_MAX_BYTES))) {
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new Error('Speech unavailable.');
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > EDEN_SPEECH_MAX_BYTES) { cancel(); throw new Error('Speech unavailable.'); }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (!inspectEdenWav(bytes)) throw new Error('Speech unavailable.');
  return bytes;
}

/** Explicit output-only speech. No microphone, recording, storage, or arbitrary text. */
export class EdenSpeechController {
  private options: EdenSpeechControllerOptions;
  private currentState: EdenSpeechState = 'idle';
  private muted = false;
  private disposed = false;
  private generation = 0;
  private pending: AbortController | undefined;
  private audio: HTMLAudioElement | undefined;
  private objectUrl: string | undefined;
  private context: AudioContext | undefined;
  private source: MediaElementAudioSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private frame: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly visibility = () => { if (document.hidden) this.stop(); };
  private readonly pageHide = () => this.dispose();

  constructor(options: EdenSpeechControllerOptions) {
    this.options = options;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibility);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.pageHide);
  }
  get state(): EdenSpeechState { return this.currentState; }
  get isMuted(): boolean { return this.muted; }
  private stateChanged(state: EdenSpeechState) { this.currentState = state; this.options.onState?.(state); }
  private release() {
    this.pending?.abort(); this.pending = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    clearTimeout(this.timer); this.timer = undefined;
    if (this.audio) {
      this.audio.onended = null; this.audio.onerror = null;
      this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = undefined;
    }
    this.source?.disconnect(); this.source = undefined;
    this.analyser?.disconnect(); this.analyser = undefined;
    if (this.context) { void this.context.close().catch(() => undefined); this.context = undefined; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = undefined; }
    this.options.onAudioLevel?.(0);
  }
  stop() {
    const active = this.currentState === 'loading' || this.currentState === 'speaking';
    this.generation++;
    this.release();
    if (!this.disposed) this.stateChanged(this.muted ? 'muted' : 'idle');
    if (active) this.options.onPlayback?.('interrupted');
  }
  setMuted(muted: boolean) {
    if (this.disposed) return;
    this.muted = muted;
    this.stop();
  }
  /** Call only from an explicit Speak button. The parent always keeps the text visible. */
  async speak(phrase: EdenSpeechPhrase): Promise<boolean> {
    if (this.disposed || this.muted || !isEdenSpeechPhrase(phrase)) return false;
    this.stop();
    const generation = this.generation;
    this.stateChanged('loading');
    // Resume the output context during the user gesture, before the fetch completes.
    // Native audio remains usable when Web Audio is unavailable.
    if (typeof AudioContext !== 'undefined') {
      try { this.context = new AudioContext(); void this.context.resume().catch(() => undefined); } catch { this.context = undefined; }
    }
    const abort = new AbortController(); this.pending = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]);
    try {
      const response = await this.options.request(phrase, signal);
      const bytes = await readEdenSpeechResponse(response, signal);
      if (this.disposed || this.muted || generation !== this.generation) return false;
      // Header + sample count have already constrained duration and decoder format.
      const audio = new Audio(); this.audio = audio;
      audio.preload = 'auto';
      this.objectUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }));
      audio.src = this.objectUrl;
      const finish = (event: 'completed' | 'unavailable') => {
        if (generation !== this.generation || this.disposed) return;
        this.generation++;
        this.release();
        this.stateChanged(event === 'completed' ? 'idle' : 'unavailable');
        this.options.onPlayback?.(event);
      };
      audio.onended = () => finish('completed');
      audio.onerror = () => finish('unavailable');
      if (this.context?.state === 'running') {
        try {
          this.source = this.context.createMediaElementSource(audio);
          this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
          this.source.connect(this.analyser); this.analyser.connect(this.context.destination);
        } catch {
          // A failed audio graph must never silently swallow the native audio path.
          finish('unavailable'); return false;
        }
      }
      this.timer = setTimeout(() => finish('unavailable'), (EDEN_SPEECH_MAX_SECONDS + 1) * 1000);
      await audio.play();
      if (generation !== this.generation || this.disposed || this.muted) return false;
      if (!Number.isNaN(audio.duration) && (!Number.isFinite(audio.duration) || audio.duration > EDEN_SPEECH_MAX_SECONDS + 0.1)) {
        finish('unavailable'); return false;
      }
      this.stateChanged('speaking'); this.options.onPlayback?.('started');
      const samples = new Uint8Array(256);
      const sample = () => {
        if (generation !== this.generation || this.currentState !== 'speaking') return;
        let level = 0;
        if (this.analyser) {
          this.analyser.getByteTimeDomainData(samples);
          let square = 0;
          for (const value of samples) square += ((value - 128) / 128) ** 2;
          level = Math.min(1, Math.sqrt(square / samples.length) * 3);
        }
        this.options.onAudioLevel?.(level);
        this.frame = requestAnimationFrame(sample);
      };
      sample();
      return true;
    } catch {
      if (generation !== this.generation || this.disposed || this.muted) return false;
      this.generation++;
      this.release();
      this.stateChanged('unavailable'); this.options.onPlayback?.('unavailable');
      return false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.stop(); this.disposed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibility);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.pageHide);
  }
}
