export const LIVE_INPUT_RATE = 16_000;
export const LIVE_OUTPUT_RATE = 24_000;
export type LiveAudioContextState = 'uninitialized' | 'running' | 'suspended' | 'interrupted' | 'closed';
export function liveAudioContextState(value: unknown): LiveAudioContextState {
  return value === 'running' || value === 'suspended' || value === 'interrupted' || value === 'closed' ? value : 'uninitialized';
}
const INPUT_CHUNK_SAMPLES = 320; // 20ms, retained only until the next send.

export function pcmToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export function decodeLivePcm(data: string, mimeType: string): Float32Array<ArrayBuffer> {
  if (!/^audio\/pcm(?:;rate=24000)?$/i.test(mimeType) || data.length > 320_000 || !data.length || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Invalid voice audio.');
  const binary = atob(data);
  if (!binary.length || binary.length % 2) throw new Error('Incomplete voice audio.');
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < binary.length; i += 2) {
    let sample = binary.charCodeAt(i) | binary.charCodeAt(i + 1) << 8;
    if (sample >= 32768) sample -= 65536;
    samples[i / 2] = sample / 32768;
  }
  return samples;
}

/** Streaming linear resampling preserves fractional positions across callbacks.
 * Actual AudioContext sample rate is used, never the requested device rate.
 */
export class LiveMicrophoneEncoder {
  private rate = 0;
  private samples: number[] = [];
  private position = 0;
  private pending: number[] = [];
  encode(frame: Float32Array, sampleRate: number,onPacketRms?:(rms:number)=>void): string[] {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || frame.length > 8192) throw new Error('Unsupported microphone format.');
    if (this.rate && this.rate !== sampleRate) this.clear();
    this.rate = sampleRate;
    for (const value of frame) this.samples.push(Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
    const chunks: string[] = [], ratio = sampleRate / LIVE_INPUT_RATE;
    while (this.position + 1 < this.samples.length) {
      const index = Math.floor(this.position), mix = this.position - index;
      this.pending.push(this.samples[index] * (1 - mix) + this.samples[index + 1] * mix);
      this.position += ratio;
      if (this.pending.length === INPUT_CHUNK_SAMPLES) {
        const bytes = new Uint8Array(INPUT_CHUNK_SAMPLES * 2), view = new DataView(bytes.buffer);
        this.pending.forEach((value, i) => view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true));
        onPacketRms?.(Math.sqrt(this.pending.reduce((sum,v)=>sum+v*v,0)/this.pending.length));
        chunks.push(pcmToBase64(bytes)); this.pending = [];
      }
    }
    const consumed = Math.min(Math.floor(this.position), this.samples.length);
    this.samples.splice(0, consumed); this.position -= consumed;
    return chunks;
  }
  clear() { this.samples = []; this.pending = []; this.position = 0; this.rate = 0; }
}
