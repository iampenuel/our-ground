import { EDEN_STATES } from '../types/eden.ts';
import type { EdenEvent, EdenRenderer, EdenSnapshot, EdenState } from '../types/eden.ts';
export const clampLevel = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/** UI-independent event bridge. No network requests, microphone, or voice service. */
export class EdenController {
  private value: EdenSnapshot = { state: 'idle', audioLevel: 0, reducedMotion: false, paused: false };
  private listeners = new Set<(state: Readonly<EdenSnapshot>) => void>();
  private successTimer: ReturnType<typeof setTimeout> | undefined;
  private requestId: string | undefined;
  private disposed = false;
  private renderer: EdenRenderer;
  constructor(renderer: EdenRenderer) { this.renderer = renderer; }
  get snapshot(): Readonly<EdenSnapshot> { return { ...this.value }; }
  subscribe(listener: (state: Readonly<EdenSnapshot>) => void) { this.listeners.add(listener); listener(this.snapshot); return () => { this.listeners.delete(listener); }; }
  private emit() { this.listeners.forEach(listener => listener(this.snapshot)); }
  setEdenState(state: EdenState) {
    if (this.disposed || !EDEN_STATES.includes(state)) return;
    clearTimeout(this.successTimer);
    if (state !== 'searching') this.requestId = undefined;
    this.value.state = state;
    // Never carry speaking amplitude into another expression or playback session.
    this.value.audioLevel = 0;
    this.renderer.setAudioLevel(0);
    this.renderer.setState(state);
    this.emit();
    if (state === 'success') this.successTimer = setTimeout(() => this.setEdenState('idle'), 1700);
  }
  setEdenAudioLevel(level: number) {
    if (this.disposed) return;
    this.value.audioLevel = this.value.state === 'speaking' && !this.value.reducedMotion ? clampLevel(level) : 0;
    this.renderer.setAudioLevel(this.value.audioLevel);
    this.emit();
  }
  setEdenReducedMotion(reduced: boolean) {
    if (this.disposed) return;
    this.value.reducedMotion = reduced;
    if (reduced) { this.value.audioLevel = 0; this.renderer.setAudioLevel(0); }
    this.renderer.setReducedMotion(reduced); this.emit();
  }
  setPaused(paused: boolean) {
    if (this.disposed) return;
    this.value.paused = paused; this.renderer.setPaused(paused); this.emit();
  }
  dispatch(event: EdenEvent) {
    if (this.disposed) return;
    switch (event.type) {
      case 'microphone-activated': case 'listening-started': case 'speech-detected': this.setEdenState('listening'); break;
      case 'listening-stopped': case 'processing': this.setEdenState('thinking'); break;
      case 'clarification-needed': this.setEdenState('clarifying'); break;
      case 'playback-started': this.setEdenState('speaking'); break;
      case 'playback-interrupted': case 'playback-completed': this.setEdenState('idle'); break;
      case 'audio-level': this.setEdenAudioLevel(event.level); break;
      case 'search-started': this.setEdenState('searching'); this.requestId = event.requestId; break;
      case 'search-completed': case 'search-failed':
        if (this.requestId === event.requestId && this.value.state === 'searching') this.setEdenState(event.type === 'search-completed' ? 'success' : 'unable');
        break;
    }
  }
  dispose() { this.disposed = true; clearTimeout(this.successTimer); this.listeners.clear(); this.renderer.dispose(); }
}
