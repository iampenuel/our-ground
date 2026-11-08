import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdenSpeechProvider, EdenSpeechError } from '../backend/eden-speech.ts';
import { EDEN_SPEECH_PHRASES, EDEN_SPEECH_MAX_BYTES, inspectEdenWav, validateEdenSpeechRequest } from '../shared/eden-speech.ts';
import { EdenSpeechController, readEdenSpeechResponse } from '../src/eden/runtime/speech.ts';

const enabled = () => ({
  EDEN_GEMINI_MODE: 'synthetic-development',
  EDEN_GEMINI_TTS_ENABLED: 'true',
  EDEN_GEMINI_FREE_TIER_CONFIRMED: 'true',
  GEMINI_API_KEY: 'synthetic-test-key-never-network',
  NODE_ENV: 'test',
});
function wav(seconds = 0.2, rate = 24000, channels = 1) {
  const samples = Math.round(seconds * rate), dataLength = samples * 2 * channels;
  const data = new Uint8Array(44 + dataLength), view = new DataView(data.buffer);
  const text = (at, value) => [...value].forEach((c, i) => { data[at + i] = c.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, dataLength, true);
  return data;
}
const audioResult = (data = wav()) => ({ status: 'completed', output_audio: { mime_type: 'audio/wav', data: Buffer.from(data).toString('base64') } });
const response = (bytes = wav(), headers = {}) => new Response(bytes, { headers: { 'content-type': 'audio/wav', ...headers } });
const signal = () => new AbortController().signal;

test('speech boundary accepts finite IDs and rejects text, additional fields and inherited IDs', () => {
  assert.deepEqual(validateEdenSpeechRequest({ phrase: 'welcome' }), { phrase: 'welcome' });
  for (const value of [
    'welcome', null, [], { phrase: '__proto__' }, { phrase: 'constructor' }, { phrase: 'toString' },
    { phrase: 'My name is Taylor. I have diabetes.' }, { text: 'welcome' },
    { phrase: 'welcome', text: 'a private conversation' }, { phrase: 'welcome', audio: 'recording' },
    { phrase: 'welcome', voice: 'Aoede' }, { phrase: 'welcome', location: 'home address' },
  ]) assert.equal(validateEdenSpeechRequest(value), null);
});

test('speech is disabled by default and fails closed for hosted, unconfirmed or unsupported configurations', async () => {
  let calls = 0;
  const create = async () => { calls++; return audioResult(); };
  const cases = [
    [{}, 'disabled'],
    [{ ...enabled(), EDEN_GEMINI_TTS_ENABLED: 'false' }, 'disabled'],
    [{ ...enabled(), EDEN_GEMINI_MODE: 'public' }, 'disabled'],
    [{ ...enabled(), NODE_ENV: 'production' }, 'development-only'],
    [{ ...enabled(), VERCEL: '1' }, 'development-only'],
    ...['NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'FUNCTIONS_WORKER_RUNTIME', 'RENDER', 'FLY_APP_NAME'].map(key => [{ ...enabled(), [key]: 'present' }, 'development-only']),
    [{ ...enabled(), VERCEL_ENV: 'preview' }, 'development-only'],
    [{ ...enabled(), GOOGLE_GENAI_USE_VERTEXAI: 'true' }, 'development-only'],
    [{ ...enabled(), EDEN_GEMINI_FREE_TIER_CONFIRMED: undefined }, 'free-tier-unconfirmed'],
    [{ ...enabled(), GEMINI_API_KEY: undefined }, 'key-missing'],
    [{ ...enabled(), GEMINI_API_KEY: ' key with spaces ' }, 'key-missing'],
    [{ ...enabled(), EDEN_GEMINI_TTS_MODEL: 'a-paid-or-live-model' }, 'model-not-approved'],
  ];
  for (const [env, reason] of cases) {
    const provider = createEdenSpeechProvider(env, { create });
    assert.equal(provider.status().available, false);
    assert.equal(provider.status().reason, reason);
    await assert.rejects(provider.generate('welcome'), error => error instanceof EdenSpeechError && error.status === 503);
  }
  assert.equal(calls, 0);
});

test('provider sends only the literal phrase to one standard Aoede audio request with storage and continuation disabled', async () => {
  const sent = [];
  const provider = createEdenSpeechProvider(enabled(), { create: async (request, requestSignal) => {
    assert.equal(requestSignal.aborted, false);
    sent.push(request);
    return audioResult();
  } });
  assert.equal(provider.status().model, 'gemini-3.8-flash-lite-tts');
  const result = await provider.generate('search_ready');
  assert.equal(result.mimeType, 'audio/wav');
  assert.deepEqual(inspectEdenWav(result.data), { durationSeconds: 0.2, sampleRate: 24000 });
  assert.deepEqual(sent, [{
    model: 'gemini-3.8-flash-lite-tts',
    input: [{ type: 'user_input', content: [{ type: 'text', text: EDEN_SPEECH_PHRASES.search_ready, annotations: [{ type: 'speech_metadata', style: 'warm, welcoming, lightly cheerful and professional; speak clearly at a natural conversational pace' }] }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: 'Aoede' }] }, store: false, automatic_continuation: false,
  }]);
  for (const unsafe of ['Taylor has diabetes at 10 Main Street', { phrase: 'welcome' }, undefined]) {
    await assert.rejects(provider.generate(unsafe), error => error.code === 'INVALID_SPEECH_PHRASE' && error.status === 422);
  }
  assert.equal(sent.length, 1);
});

test('provider errors never expose SDK messages, URLs, prompts or credentials', async () => {
  for (const [providerStatus, expectedStatus] of [[429, 429], [500, 503]]) {
    const provider = createEdenSpeechProvider(enabled(), { create: async () => {
      throw Object.assign(new Error('https://example.test/?key=secret Taylor has diabetes'), { status: providerStatus });
    } });
    await assert.rejects(provider.generate('welcome'), error => {
      assert.equal(error.status, expectedStatus);
      assert.equal(error.message, 'Speech is unavailable. Continue with the text response.');
      assert.doesNotMatch(JSON.stringify(error), /secret|Taylor|diabetes|example/);
      return true;
    });
  }
});

test('provider rejects incomplete results, unsupported encodings, malformed data and unexpected WAV formats', async () => {
  const invalid = [
    {}, { ...audioResult(), status: 'in_progress' },
    { status: 'completed', output_audio: { mime_type: 'audio/mpeg', data: audioResult().output_audio.data } },
    { status: 'completed', output_audio: { data: '%%private content%%' } },
    { status: 'completed', output_audio: { data: 'AAAA'.repeat(Math.ceil(EDEN_SPEECH_MAX_BYTES / 3) + 1) } },
    audioResult(new Uint8Array(44)), audioResult(wav(0.2, 48000)), audioResult(wav(0.2, 24000, 2)),
    audioResult(wav(20.002)),
  ];
  for (const result of invalid) {
    const provider = createEdenSpeechProvider(enabled(), { create: async () => result });
    await assert.rejects(provider.generate('welcome'), error => error.code === 'SPEECH_INVALID_AUDIO');
  }
});

test('pre-aborted output request does not reach the SDK', async () => {
  let calls = 0;
  const abort = new AbortController(); abort.abort();
  const provider = createEdenSpeechProvider(enabled(), { create: async () => { calls++; return audioResult(); } });
  await assert.rejects(provider.generate('welcome', abort.signal), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});

test('WAV inspection rejects corrupt lengths, truncated chunks, duplicate formats and non-PCM', () => {
  const valid = wav();
  assert.ok(inspectEdenWav(valid));
  const wrongRiffLength = valid.slice(); new DataView(wrongRiffLength.buffer).setUint32(4, 1, true);
  const oversizedChunk = valid.slice(); new DataView(oversizedChunk.buffer).setUint32(40, valid.length, true);
  const nonPcm = valid.slice(); new DataView(nonPcm.buffer).setUint16(20, 3, true);
  const duplicateFormat = new Uint8Array(valid.length + 24);
  duplicateFormat.set(valid); duplicateFormat.set(valid.subarray(12, 36), valid.length);
  new DataView(duplicateFormat.buffer).setUint32(4, duplicateFormat.length - 8, true);
  for (const invalid of [wrongRiffLength, oversizedChunk, nonPcm, duplicateFormat, valid.subarray(0, 43)]) assert.equal(inspectEdenWav(invalid), null);
});

test('browser rejects media MIME, advertised lengths and oversized streams before playback', async () => {
  assert.deepEqual(await readEdenSpeechResponse(response(), signal()), wav());
  await assert.rejects(readEdenSpeechResponse(response(wav(), { 'content-type': 'audio/mpeg' }), signal()));
  await assert.rejects(readEdenSpeechResponse(response(wav(), { 'content-length': String(EDEN_SPEECH_MAX_BYTES + 1) }), signal()));
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(EDEN_SPEECH_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readEdenSpeechResponse(new Response(stream, { headers: { 'content-type': 'audio/wav' } }), signal()));
  assert.equal(cancelled, true);
  await assert.rejects(readEdenSpeechResponse(response(wav(20.002)), signal()));
});

test('browser cancels an interrupted stream rather than retaining it', async () => {
  const abort = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readEdenSpeechResponse(new Response(stream, { headers: { 'content-type': 'audio/wav' } }), abort.signal);
  abort.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(cancelled, true);
});

test('mute, stop, disposal and invalid phrase prevent delayed requests from playing', async () => {
  let calls = 0, resolve;
  const events = [], levels = [];
  const controller = new EdenSpeechController({
    request: (phrase) => { assert.equal(phrase, 'welcome'); calls++; return new Promise(r => { resolve = r; }); },
    onPlayback: value => events.push(value), onAudioLevel: value => levels.push(value),
  });
  assert.equal(await controller.speak('a private health narrative'), false);
  controller.setMuted(true);
  assert.equal(await controller.speak('welcome'), false);
  assert.equal(calls, 0);
  controller.setMuted(false);
  const speaking = controller.speak('welcome');
  assert.equal(calls, 1);
  controller.stop();
  resolve(response());
  assert.equal(await speaking, false);
  assert.deepEqual(events, ['interrupted']);
  assert.equal(levels.every(level => level === 0), true);
  controller.dispose(); controller.dispose();
  assert.equal(await controller.speak('welcome'), false);
  assert.equal(calls, 1);
});
