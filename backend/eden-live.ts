import { GoogleGenAI } from '@google/genai';
import type { CreateAuthTokenParameters } from '@google/genai';
import { createHash, randomBytes } from 'node:crypto';
import { isEdenHostedRuntime } from './eden-provider.ts';
import { googleRetryAfterSeconds } from './eden-speech-quota.ts';
import { canonicalLiveTimestamp } from '../shared/eden-live-timing.ts';
import { buildEdenLiveConfig } from '../shared/eden-live.ts';

// Official free-tier pricing and v1beta token constraints retrieved 2026-11-07.
// Account availability/unbilled status still requires explicit operator proof.
export const EDEN_LIVE_MODEL = 'gemini-3.8-live' as const;
export const EDEN_LIVE_LIMITS = Object.freeze({ maxCallSeconds: 300, connectSeconds: 60, minCallSeconds: 15, mintsPerSession: 3, mintsPerDay: 6, timeoutMs: 12_000, maxRememberedNonces: 100 });
export class EdenLiveError extends Error {
  code: string; status: number; retryAfterSeconds?:number;resetAt?:string;
  constructor(code: string, status = 503, retryAfterSeconds?:number,resetAt?:string) { super('The voice call is unavailable. Please try again after the current call limit or continue with text.'); this.code = code; this.status = status; this.retryAfterSeconds=Number.isSafeInteger(retryAfterSeconds)&&retryAfterSeconds!>=0&&retryAfterSeconds!<=31*86400?retryAfterSeconds:undefined;this.resetAt=canonicalLiveTimestamp(resetAt); }
}
export type EdenLiveToken = {
  token: string; callId: string; expiresAt: string; newSessionExpiresAt: string;
  model: typeof EDEN_LIVE_MODEL; voiceName: 'Aoede'; maxCallSeconds: number;
  config: ReturnType<typeof buildEdenLiveConfig>;
};
export type EdenLiveOptions = {
  publicDirectory?: boolean;
  now?: () => number;
  create?: (request: CreateAuthTokenParameters, signal: AbortSignal) => Promise<unknown>;
};
type Lease = { binding: string; callId: string; expires: number; ended: boolean; tools: Set<string>; resumed: boolean };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Server-only credential mint. No audio/transcript enters this service. Tokens
 * are returned once, never persisted/logged. Nonce hashes, counters and a lease
 * are retained only in this local process. Token expiration, not DELETE, ends
 * its provider authority; a hung-up call cannot mint an overlapping token.
 */
export function createEdenLive(environment: Record<string, string | undefined>, options: EdenLiveOptions = {}) {
  const env = { ...environment }, now = options.now ?? Date.now, secret = env.GEMINI_API_KEY;
  let day = -1, minted = 0;
  const leases = new Map<string, Lease>();
  const nonces = new Map<string, number>(), sessionMints = new Map<string, { count: number; expires: number }>();
  const status = () => ({
    available: env.EDEN_GEMINI_MODE === 'synthetic-development' && !isEdenHostedRuntime(env)
      && env.EDEN_GEMINI_FREE_TIER_CONFIRMED === 'true' && env.EDEN_GEMINI_LIVE_ENABLED === 'true'
      && env.EDEN_GEMINI_LIVE_MODEL === EDEN_LIVE_MODEL && env.EDEN_GEMINI_LIVE_MODEL_CONFIRMED === 'true'
      && (env.BACKEND_DATA_MODE === 'demo' && env.ALLOW_DEMO_DATA === 'true' || options.publicDirectory === true && env.BACKEND_DATA_MODE === 'postgres' && env.ALLOW_DEMO_DATA === 'false' && env.EDEN_LOCAL_DIRECTORY_ENABLED === 'true')
      && typeof secret === 'string' && secret.length >= 12 && secret.length <= 4096 && !/\s/.test(secret),
    model: EDEN_LIVE_MODEL,
  });
  const purge = () => {
    const current = now(), currentDay = Math.floor(current / 86_400_000);
    if (currentDay !== day) { day = currentDay; minted = 0; }
    for (const [id, lease] of leases) if (lease.expires <= current) leases.delete(id);
    for (const [key, expires] of nonces) if (expires <= current) nonces.delete(key);
    for (const [key, entry] of sessionMints) if (entry.expires <= current) sessionMints.delete(key);
  };
  return {
    status,
    usage() {
      purge();
      return { minted, limit: EDEN_LIVE_LIMITS.mintsPerDay,
        resetAt: new Date((Math.floor(now() / 86_400_000) + 1) * 86_400_000).toISOString(), scope: 'backend-process' as const };
    },
    authorizeCall(binding: string, callId: string): void {
      purge();
      const lease = leases.get(callId);
      if (!lease || lease.binding !== binding || lease.ended) throw new EdenLiveError('EDEN_LIVE_CALL_EXPIRED', 409);
    },
    claimTool(binding: string, callId: string, id: string): void {
      purge();
      const lease = leases.get(callId);
      if (!lease || lease.binding !== binding || lease.ended) throw new EdenLiveError('EDEN_LIVE_CALL_EXPIRED', 409);
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new EdenLiveError('EDEN_LIVE_INVALID_TOOL', 422);
      if (lease.tools.has(id)) throw new EdenLiveError('EDEN_LIVE_TOOL_REPLAY', 409);
      if (lease.tools.size >= 20) throw new EdenLiveError('EDEN_LIVE_TOOL_LIMIT', 429);
      lease.tools.add(id);
    },
    end(binding: string, callId?: string): void {
      for (const lease of leases.values()) if (lease.binding === binding && (callId === undefined || lease.callId === callId)) lease.ended = true;
      // Ephemeral tokens have no revocation API. Keep the lease until expiry.
    },
    async mint(binding: string, nonce: string, sessionExpires: number, signal?: AbortSignal, resume?: { callId: string; handle: string }): Promise<EdenLiveToken> {
      if (!status().available) throw new EdenLiveError('EDEN_LIVE_DISABLED', 403);
      if (!/^[a-f\d]{64}$/.test(binding) || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !Number.isFinite(sessionExpires)) throw new EdenLiveError('EDEN_LIVE_INVALID_REQUEST', 422);
      purge();
      const nonceKey = hash(binding + '\0' + nonce);
      if (nonces.has(nonceKey)) throw new EdenLiveError('EDEN_LIVE_NONCE_REUSED', 409);
      const previous = resume ? leases.get(resume.callId) : undefined;
      if (resume && (!previous || previous.binding !== binding || previous.ended || previous.resumed || !/^[\x21-\x7e]{1,4096}$/.test(resume.handle))) throw new EdenLiveError('EDEN_LIVE_RESUME_DENIED', 409);
      if (!resume && ([...leases.values()].some(item => item.binding === binding && !item.ended) || leases.size >= 2)) throw new EdenLiveError('EDEN_LIVE_CALL_ACTIVE', 409);
      const count = sessionMints.get(binding)?.count ?? 0;
      if (minted >= EDEN_LIVE_LIMITS.mintsPerDay || count >= EDEN_LIVE_LIMITS.mintsPerSession || nonces.size >= EDEN_LIVE_LIMITS.maxRememberedNonces || sessionMints.size >= 100) throw new EdenLiveError('EDEN_LIVE_USAGE_LIMIT', 429);
      const expires = Math.min(previous?.expires ?? now() + EDEN_LIVE_LIMITS.maxCallSeconds * 1000, sessionExpires);
      if (expires - now() < EDEN_LIVE_LIMITS.minCallSeconds * 1000) throw new EdenLiveError('EDEN_LIVE_SESSION_EXPIRING', 401);
      const callId = previous?.callId ?? randomBytes(32).toString('base64url');
      // Reserve before awaiting the provider. Failure, abort, replay or early
      // hangup never refunds mint credits or permits an overlapping live token.
      minted += 1; sessionMints.set(binding, { count: count + 1, expires: sessionExpires });
      nonces.set(nonceKey, sessionExpires);
      const lease: Lease = previous ?? { binding, callId, expires, ended: false, tools: new Set(), resumed: false };
      if (previous) previous.resumed = true;
      leases.set(callId, lease);
      try {
        const result = await issueEdenLiveToken(secret!,callId,expires,options.publicDirectory===true,signal,resume,options.create,now);
        if (leases.get(callId)!==lease || lease.ended) throw new EdenLiveError('EDEN_LIVE_INVALID_TOKEN');
        return result;
      } catch(error) { lease.ended=true; throw error; }
    },
  };
}
export type EdenLive = ReturnType<typeof createEdenLive>;
/** Both environments mint the same constrained one-use credential after their own admission. */
export async function issueEdenLiveToken(secret:string, callId:string, expires:number, publicDirectory:boolean, signal?:AbortSignal, resume?:{handle:string}, create?:EdenLiveOptions['create'], now:()=>number=Date.now):Promise<EdenLiveToken> {
  const expiresAt=new Date(expires).toISOString();
  const newSessionExpiresAt=new Date(Math.min(now()+EDEN_LIVE_LIMITS.connectSeconds*1000,expires)).toISOString();
  const config = buildEdenLiveConfig({directory:publicDirectory,...(resume?{resumeHandle:resume.handle}:{})});
  const combined = AbortSignal.any([AbortSignal.timeout(EDEN_LIVE_LIMITS.timeoutMs), ...(signal ? [signal] : [])]);
  const payload: CreateAuthTokenParameters = { config: {
    uses: 1, expireTime: expiresAt, newSessionExpireTime: newSessionExpiresAt,
    liveConnectConstraints: { model: EDEN_LIVE_MODEL, config },
    // Omit lockAdditionalFields: SDK3's documented lock-all behavior also
    // prevents enabling omitted setup fields, extra tools or resumption.
    abortSignal: combined,
    httpOptions: { apiVersion: 'v1beta', baseUrl: 'https://generativelanguage.googleapis.com', timeout: EDEN_LIVE_LIMITS.timeoutMs, retryOptions: { attempts: 1 },
      // SDK3 omits historyConfig from its LiveConnectConfig serializer.
      // Merge only this server-owned setup field before lock-all minting;
      // no caller-supplied request/config/extraBody reaches this patch.
      ...(config.historyConfig ? { extraBody: { bidiGenerateContentSetup: { historyConfig: config.historyConfig } } } : {}),
    },
  } };
  let result: unknown;
  try {
    combined.throwIfAborted();
    if (create) result = await create(payload, combined);
    else {
      const client = new GoogleGenAI({ apiKey: secret, apiVersion: 'v1beta', enterprise: false, vertexai: false,
        httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com', timeout: EDEN_LIVE_LIMITS.timeoutMs, retryOptions: { attempts: 1 } } });
      result = await client.authTokens.create(payload);
    }
    combined.throwIfAborted();
  } catch (error) {
    const status = Number(object(error)?.status ?? object(error)?.code);
    throw new EdenLiveError(status === 429 ? 'EDEN_LIVE_PROVIDER_QUOTA' : combined.aborted ? 'EDEN_LIVE_CANCELLED' : 'EDEN_LIVE_PROVIDER_UNAVAILABLE', status === 429 ? 429 : 503,status===429?googleRetryAfterSeconds(error,now()):undefined);
  }
  const returned = object(result), token = returned?.name;
  if (typeof token !== 'string' || !/^auth_tokens\/[A-Za-z0-9._~+\/=-]{1,8192}$/.test(token) || (secret && token.includes(secret))
    || (returned?.expireTime !== undefined && (typeof returned.expireTime !== 'string' || Date.parse(returned.expireTime) !== expires))
    || (returned?.newSessionExpireTime !== undefined && (typeof returned.newSessionExpireTime !== 'string' || Date.parse(returned.newSessionExpireTime) !== Date.parse(newSessionExpiresAt)))
    || (returned?.uses !== undefined && returned.uses !== 1)
    || now() >= expires) throw new EdenLiveError('EDEN_LIVE_INVALID_TOKEN');
  return { token, callId, expiresAt, newSessionExpiresAt, model: EDEN_LIVE_MODEL, voiceName: 'Aoede', maxCallSeconds: Math.floor((expires - now()) / 1000), config };
}
