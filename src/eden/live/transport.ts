import { buildEdenLiveSetup } from '../../../shared/eden-live.ts';
import type { EdenLiveTokenResponse } from '../../../shared/eden-live.ts';

/** A true send result means local queue acceptance. It does not acknowledge provider receipt. */
export interface LiveConnection { send(value: unknown): boolean | void; close(): void }
export type LiveProviderCategory = 'none' | 'rate-limit-or-quota' | 'overload' | 'authentication' | 'invalid-request' | 'provider-other';
export type LiveCloseReason='no-detail'|'policy'|'authentication'|'quota'|'overload'|'protocol'|'other';
export function classifyLiveClose(reason:string):LiveCloseReason{
  if(!reason)return 'no-detail';
  if(/unauth|permission|credential|expired token/i.test(reason))return 'authentication';
  if(/quota|exhaust|rate limit/i.test(reason))return 'quota';
  if(/overload|unavailable/i.test(reason))return 'overload';
  if(/policy/i.test(reason))return 'policy';
  if(/protocol|invalid argument|unsupported/i.test(reason))return 'protocol';
  return 'other';
}
export type LiveTransportClose = {closeReason?:LiveCloseReason;kind: 'socket-close' | 'socket-error' | 'invalid-message' | 'provider-error' | 'application-handler'; code?: number; providerStatus?:number; providerCategory?:LiveProviderCategory};
function providerFailure(value:unknown):LiveTransportClose {
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const status=Number.isInteger(input.code)&&Number(input.code)>=400&&Number(input.code)<=599?Number(input.code):undefined;
  const category:LiveProviderCategory=status===429||input.status==='RESOURCE_EXHAUSTED'?'rate-limit-or-quota':status===503||input.status==='UNAVAILABLE'?'overload':status===401||status===403||input.status==='UNAUTHENTICATED'||input.status==='PERMISSION_DENIED'?'authentication':status===400||input.status==='INVALID_ARGUMENT'?'invalid-request':'provider-other';
  return{kind:'provider-error',providerCategory:category,...(status?{providerStatus:status}:{})};
}
export type LiveConnectionCallbacks = {message: (message: Record<string, unknown>) => void; closed: (detail?: LiveTransportClose) => void};
const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
/** Official native WebSocket protocol keeps setup-stage cancellation effective.
 * The URL accepts only a short-lived auth_tokens credential, never an API key.
 */
export function connectEdenLive(token: EdenLiveTokenResponse, callbacks: LiveConnectionCallbacks, signal: AbortSignal): Promise<LiveConnection> {
  signal.throwIfAborted();
  if (!/^auth_tokens\/[A-Za-z0-9._~+\/=-]{1,8192}$/.test(token.token)) throw new Error('Temporary voice credential unavailable.');
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${ENDPOINT}?access_token=${encodeURIComponent(token.token)}`);
    socket.binaryType = 'arraybuffer';
    let closed = false, ready = false, chain = Promise.resolve();
    let errorDeadline:ReturnType<typeof setTimeout>|undefined;
    const awaitingClose=()=>{errorDeadline??=setTimeout(()=>failure({kind:'socket-error'}),500);};
    const connection: LiveConnection = {
      send(value) {
        if(closed||!ready)return false;
        // Chrome can enter CLOSING while a microphone callback is in flight.
        // Preserve the subsequent close code; no unsent packet/action is replayed.
        if(socket.readyState!==WebSocket.OPEN){awaitingClose();return false;}
        if(socket.bufferedAmount>128_000){failure({kind:'socket-error'});return false;}
        try{socket.send(JSON.stringify(value));return true;}catch{awaitingClose();return false;}
      },
      close() { if (closed) return; closed = true; clearTimeout(errorDeadline); signal.removeEventListener('abort', cancel); socket.onmessage = null; socket.onerror = null; socket.onclose = null; try { socket.close(1000, 'Call ended'); } catch { /* Already closed. */ } reject(new Error('Call ended.')); },
    };
    const cancel = () => connection.close(); signal.addEventListener('abort', cancel, {once: true});
    const failure = (detail: LiveTransportClose) => { if (closed) return; connection.close(); try { callbacks.closed(detail); } catch { /* Cleanup must not recursively expose callback exceptions. */ } };
    socket.onopen = () => { if (closed || signal.aborted) { connection.close(); return; } socket.send(JSON.stringify({setup: buildEdenLiveSetup(token.config, token.model)})); };
    socket.onmessage = event => {
      chain = chain.then(async () => {
        if (closed || signal.aborted) return;
        const data: unknown = event.data;
        const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data instanceof Blob ? await data.text() : '';
        if (closed || signal.aborted) return;
        if (!text || text.length > 1_000_000) throw new Error('Invalid voice message.');
        const message: unknown = JSON.parse(text);
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid voice message.');
        const record = message as Record<string, unknown>;
        if (record.error) { failure(providerFailure(record.error)); return; }
        if (record.setupComplete && !ready) { ready = true; resolve(connection); }
        try { callbacks.message(record); } catch { failure({kind:'application-handler'}); }
      }).catch(() => failure({kind:'invalid-message'}));
    };
    // Chrome emits a detail-free error before the informative close event.
    socket.onerror = awaitingClose;
    socket.onclose = event => failure({kind:'socket-close',closeReason:classifyLiveClose(event.reason), ...(Number.isInteger(event.code) && event.code >= 1000 && event.code <= 4999 ? {code:event.code} : {})});
    if (signal.aborted) connection.close();
  });
}
