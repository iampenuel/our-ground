/** Finite public sentences only. These are never populated from a conversation. */
export const EDEN_SPEECH_PHRASES = {
  welcome: 'Hello, I am Eden. I can help you explore public food and community resources.',
  searching: 'I am checking the available public resource listings.',
  search_ready: 'Your search is ready. Review the listed sources and confirm details with the organization.',
  radius_ready: 'The search distance has been updated.',
  refine_ready: 'Your search filters have been updated.',
  details_ready: 'The public resource details are ready to review.',
  select_ready: 'The resource is selected. You can review its public details.',
  help_ready: 'Choose a resource category, a city, or a search distance to get started.',
  unavailable: 'This option is unavailable right now. You can continue using the text controls.',
  goodbye: 'Take care. Your public resource search is here when you need it.',
} as const;
export type EdenSpeechPhrase = keyof typeof EDEN_SPEECH_PHRASES;
export const EDEN_SPEECH_VOICE = 'Aoede' as const;
export const EDEN_SPEECH_MAX_SECONDS = 20;
export const EDEN_SPEECH_MAX_BYTES = 24_000 * 2 * EDEN_SPEECH_MAX_SECONDS + 512;
export function isEdenSpeechPhrase(value: unknown): value is EdenSpeechPhrase {
  return typeof value === 'string' && Object.hasOwn(EDEN_SPEECH_PHRASES, value);
}
export function validateEdenSpeechRequest(value: unknown): { phrase: EdenSpeechPhrase } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !isEdenSpeechPhrase(input.phrase)) return null;
  return { phrase: input.phrase };
}
/** Validate the expected unary WAV envelope before browser playback or relaying bytes.
 * No PCM wrapping, arbitrary codec parsing, remote media URL, or browser decoder trust.
 */
export function inspectEdenWav(bytes: Uint8Array): { durationSeconds: number; sampleRate: 24000 } | null {
  if (bytes.byteLength < 44 || bytes.byteLength > EDEN_SPEECH_MAX_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.byteLength) return null;
  let format = false, dataBytes = 0, offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const kind = ascii(offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8;
    if (length > bytes.byteLength - start) return null;
    if (kind === 'fmt ') {
      if (format || length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1
        || view.getUint32(start + 4, true) !== 24000 || view.getUint32(start + 8, true) !== 48000
        || view.getUint16(start + 12, true) !== 2 || view.getUint16(start + 14, true) !== 16) return null;
      format = true;
    }
    if (kind === 'data') {
      if (dataBytes || length < 4800 || length % 2) return null;
      dataBytes = length;
    }
    offset = start + length + (length % 2);
  }
  if (offset !== bytes.byteLength || !format || !dataBytes) return null;
  const durationSeconds = dataBytes / 48000;
  return durationSeconds <= EDEN_SPEECH_MAX_SECONDS ? { durationSeconds, sampleRate: 24000 } : null;
}
