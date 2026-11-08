import { GoogleGenAI } from '@google/genai';
import { isEdenHostedRuntime } from './eden-provider.ts';
import { EDEN_SPEECH_PHRASES, EDEN_SPEECH_VOICE, EDEN_SPEECH_MAX_BYTES, inspectEdenWav, isEdenSpeechPhrase } from '../shared/eden-speech.ts';
import type { EdenSpeechPhrase } from '../shared/eden-speech.ts';

export const EDEN_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;
export type EdenTtsModel = typeof EDEN_TTS_MODELS[number];
export type EdenSpeechStatus = { available: boolean; reason: 'available' | 'disabled' | 'development-only' | 'free-tier-unconfirmed' | 'key-missing' | 'model-not-approved'; voice: 'Aoede'; model: EdenTtsModel | null };
export class EdenSpeechError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super('Speech is unavailable. Continue with the text response.'); this.code = code; this.status = status; }
}
export type EdenSpeechModelRequest = {
  model: EdenTtsModel;
  input: Array<{ type: 'user_input'; content: Array<{ type: 'text'; text: string; annotations: Array<{ type: 'speech_metadata'; style: string }> }> }>;
  response_format: { type: 'audio'; mime_type: 'audio/wav'; sample_rate: 24000 };
  generation_config: { speech_config: Array<{ voice: 'Aoede' }> };
  store: false;
  automatic_continuation: false;
};
export type EdenSpeechProvider = {
  status(): EdenSpeechStatus;
  generate(phrase: EdenSpeechPhrase, signal?: AbortSignal): Promise<{ mimeType: 'audio/wav'; data: Uint8Array }>;
};
export type EdenSpeechOptions = {
  create?: (request: EdenSpeechModelRequest, signal: AbortSignal) => Promise<unknown>;
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** Server-only, free-tier-compatible TTS adapter. Route/session admission belongs to
 * eden-api. The independent mode gate here prevents use in a public/hosted runtime.
 * Official model/schema/free eligibility checked 2026-11-06; account entitlement is
 * operator-confirmed, not inferred from model availability. No billing is activated.
 */
export function createEdenSpeechProvider(env: Record<string, string | undefined>, options: EdenSpeechOptions = {}): EdenSpeechProvider {
  const model = env.EDEN_GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-lite-tts';
  const approvedModel = EDEN_TTS_MODELS.includes(model as EdenTtsModel) ? model as EdenTtsModel : null;
  const secret = env.GEMINI_API_KEY;
  const status = (): EdenSpeechStatus => {
    const base = { voice: EDEN_SPEECH_VOICE, model: approvedModel };
    if (env.EDEN_GEMINI_MODE !== 'synthetic-development' || env.EDEN_GEMINI_TTS_ENABLED !== 'true') return { ...base, available: false, reason: 'disabled' };
    if (isEdenHostedRuntime(env)) return { ...base, available: false, reason: 'development-only' };
    if (env.EDEN_GEMINI_FREE_TIER_CONFIRMED !== 'true') return { ...base, available: false, reason: 'free-tier-unconfirmed' };
    if (!approvedModel) return { ...base, available: false, reason: 'model-not-approved' };
    if (!secret || secret !== secret.trim() || /\s/.test(secret) || secret.length < 12 || secret.length > 4096) return { ...base, available: false, reason: 'key-missing' };
    return { ...base, available: true, reason: 'available' };
  };
  return {
    status,
    async generate(phrase, signal) {
      // Runtime checks remain necessary even when TypeScript callers know the enum.
      if (!isEdenSpeechPhrase(phrase)) throw new EdenSpeechError('INVALID_SPEECH_PHRASE', 422);
      if (!status().available || !approvedModel) throw new EdenSpeechError('SPEECH_DISABLED', 503);
      return synthesizePublicSpeech(EDEN_SPEECH_PHRASES[phrase], approvedModel, secret!, signal, options);
    },
  };
}


/** Caller must supply a fixed local phrase or a server-produced, verified public reply.
 * This function is never a free-text request handler. */
export async function synthesizePublicSpeech(text:string, model:EdenTtsModel, secret:string, signal?:AbortSignal, options:EdenSpeechOptions={}) {
  if (!text.trim() || text.length>1200 || !EDEN_TTS_MODELS.includes(model)) throw new EdenSpeechError('SPEECH_INVALID_REPLY',422);
  const timeout = AbortSignal.timeout(12_000), combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const payload: EdenSpeechModelRequest = {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: 'warm, patient, conversational' }] }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: EDEN_SPEECH_VOICE }] },
    store: false,
    automatic_continuation: false,
  };
  let response: unknown;
  try {
    if (options.create) response = await options.create(payload, combined);
    else {
      const client = new GoogleGenAI({ apiKey: secret, apiVersion:'v1beta', enterprise: false, vertexai: false, httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com', timeout: 12_000, retryOptions: { attempts: 1 } } });
      response = await client.interactions.create(payload, { retries: { strategy: 'none' }, signal: combined, timeout_ms: 12_000 });
    }
    combined.throwIfAborted();
  } catch (error) {
    // Never expose or log SDK exceptions, prompt content, API keys or URLs.
    const e = object(error), code = Number(e.status ?? e.code);
    throw new EdenSpeechError(code === 429 ? 'SPEECH_QUOTA_EXHAUSTED' : 'SPEECH_PROVIDER_UNAVAILABLE', code === 429 ? 429 : 503);
  }
  const body = object(response), audio = object(body.output_audio);
  if (body.status !== 'completed' || (audio.mime_type !== undefined && audio.mime_type !== 'audio/wav')
    || typeof audio.data !== 'string' || audio.data.length > Math.ceil(EDEN_SPEECH_MAX_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio.data)) throw new EdenSpeechError('SPEECH_INVALID_AUDIO', 503);
  const data = Uint8Array.from(Buffer.from(audio.data, 'base64'));
  if (!inspectEdenWav(data)) throw new EdenSpeechError('SPEECH_INVALID_AUDIO', 503);
  return { mimeType: 'audio/wav' as const, data };
}
