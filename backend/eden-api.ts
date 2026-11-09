import type {DirectoryCityLookup} from './directory-city.ts';
import { EDEN_NOTICE_VERSION, validateEdenPageContext, validateEdenProviderAction } from '../shared/eden-assistant.ts';
import type { EdenProviderAction } from '../shared/eden-assistant.ts';
import { inspectEdenWav, validateEdenSpeechRequest } from '../shared/eden-speech.ts';
import type { EdenSpeechPhrase } from '../shared/eden-speech.ts';
import { boundedJsonObject, RequestInputError } from './request-safety.ts';
import { createEdenProvider, EdenProviderError, isEdenHostedRuntime } from './eden-provider.ts';
import type { EdenProvider } from './eden-provider.ts';
import { createEdenLimits, EdenLimitError } from './eden-limits.ts';
import { createEdenSpeechProvider, EdenSpeechError } from './eden-speech.ts';
import type { EdenSpeechProvider } from './eden-speech.ts';
import { validateEdenPlanRequest, validateEdenReviewPlan, edenReviewChoiceMatchesPriorities } from '../shared/eden-review.ts';
import { createEdenPlanner } from './eden-planner.ts';
import type { EdenPlanner } from './eden-planner.ts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createEdenAgent } from './eden-agent.ts';
import type { EdenAgent, EdenAgentRepository } from './eden-agent.ts';
import { validateEdenAgentRequest, validateEdenAgentResultRequest } from '../shared/eden-agent.ts';
import type { EdenAgentContext } from '../shared/eden-agent.ts';
import type { EdenAction } from '../shared/eden-assistant.ts';
import { createEdenLive, EdenLiveError } from './eden-live.ts';
import type { EdenLive } from './eden-live.ts';
import { isAttestedLocalDevelopmentRequest } from './local-transport.ts';
import { validateEdenLiveToolCall, validateEdenLiveContext, validateEdenLiveTokenRequest } from '../shared/eden-live.ts';

export type EdenServiceOptions = { provider?: EdenProvider; speechProvider?: EdenSpeechProvider; planner?: EdenPlanner; agent?: EdenAgent; agentRepository?: EdenAgentRepository; directoryCity?: DirectoryCityLookup; live?: EdenLive; now?: () => number };
const defaultOrigins = ['http://127.0.0.1:5198', 'http://localhost:5198', 'http://127.0.0.1:5199', 'http://localhost:5199'];
const responseHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...responseHeaders, 'content-type': 'application/json; charset=utf-8' } });
const failure = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const only = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every(key => keys.includes(key));
function loopbackUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password ? url : null;
  } catch { return null; }
}
function originsFrom(env: Record<string, string | undefined>): Set<string> {
  const configured = env.EDEN_DEVELOPMENT_ORIGINS === undefined ? defaultOrigins : env.EDEN_DEVELOPMENT_ORIGINS.split(',').map(value => value.trim());
  if (configured.length < 1 || configured.length > 8 || configured.some(value => {
    const url = loopbackUrl(value);
    return !url || url.origin !== value;
  })) return new Set();
  return new Set(configured);
}
function tokenFrom(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^EdenSession ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) throw new EdenLimitError('EDEN_SESSION_REQUIRED', 401);
  return match[1];
}
function phraseFor(action: EdenProviderAction): EdenSpeechPhrase {
  switch (action.type) {
    case 'search': return 'search_ready';
    case 'radius': return 'radius_ready';
    case 'refine': return 'refine_ready';
    case 'details': return 'details_ready';
    case 'select': return 'select_ready';
    case 'help': return 'help_ready';
  }
}

/** The Gemini release gate is deliberately unconditional for public or hosted
 * requests. An age checkbox, secret, paid account or PUBLIC_ENABLED flag cannot
 * override it. This service only admits a synthetic, loopback development demo.
 */
export function createEdenService(environment: Record<string, string | undefined>, options: EdenServiceOptions = {}) {
  const env = { ...environment }, origins = originsFrom(env);
  const provider = options.provider ?? createEdenProvider(env);
  const speechProvider = options.speechProvider ?? createEdenSpeechProvider(env);
  const planner = options.planner ?? createEdenPlanner(env);
  const agent = options.agent ?? createEdenAgent(env, { repository: options.agentRepository, directoryCity: options.directoryCity, now: options.now });
  const live = options.live ?? createEdenLive(env, { now: options.now, publicDirectory:agent.status().available && agent.status().dataKind==='public_directory' });
  const limits = createEdenLimits({ now: options.now });
  const now = options.now ?? Date.now;
  // Any nonempty grant field selects reviewer mode, including malformed input.
  // Empty placeholders in .env.example preserve the isolated legacy demo.
  const reviewerMode = Boolean(env.EDEN_REVIEWER_CODE_SHA256) || Boolean(env.EDEN_REVIEWER_EXPIRES_AT);
  const reviewerExpiry = Date.parse(env.EDEN_REVIEWER_EXPIRES_AT ?? '');
  const reviewerGrantConfigured = /^[a-f\d]{64}$/i.test(env.EDEN_REVIEWER_CODE_SHA256 ?? '')
    && env.EDEN_REVIEWER_ADULT_VERIFIED === 'true' && env.EDEN_REVIEWER_COUNTRY === 'US'
    && Number.isFinite(reviewerExpiry) && new Date(reviewerExpiry).toISOString() === env.EDEN_REVIEWER_EXPIRES_AT
    && reviewerExpiry > now() && reviewerExpiry - now() <= 24 * 3_600_000;
  const reviewerGrantReady = () => reviewerGrantConfigured && reviewerExpiry > now();
  const pendingLiveTools = new Map<string, { binding: string; callId: string; id: string; action: EdenAction; context: EdenAgentContext; expires: number }>();
  const bindingFor = (token: string, origin: string) => createHash('sha256').update(token + '\0' + origin).digest('hex');
  const endLive = (binding: string, callId?: string) => {
    live.end(binding, callId);
    for (const [key, item] of pendingLiveTools) if (item.binding === binding && (callId === undefined || item.callId === callId)) pendingLiveTools.delete(key);
  };
  const reviewerCodeValid = (value: unknown) => {
    if (!reviewerGrantReady() || typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
    const supplied = createHash('sha256').update(value).digest(), expected = Buffer.from(env.EDEN_REVIEWER_CODE_SHA256!, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const configured = () => env.EDEN_GEMINI_MODE === 'synthetic-development' && !isEdenHostedRuntime(env)
    && env.EDEN_GEMINI_FREE_TIER_CONFIRMED === 'true' && origins.size > 0 && provider.status().available
    && (!reviewerMode || reviewerGrantReady());
  const requireReviewerSession = (token: string, origin: string) => {
    if (!reviewerGrantReady()) throw new EdenLimitError('EDEN_REVIEWER_REQUIRED', 403);
    limits.authorizeReviewer(token, origin);
  };
  const originFor = (request: Request): string | null => {
    if (!loopbackUrl(request.url)) return null;
    const origin = request.headers.get('origin');
    return origin && origins.has(origin) && loopbackUrl(origin) ? origin : null;
  };
  const eligible = (request: Request, requireOrigin = true) => configured() && Boolean(loopbackUrl(request.url))
    && (requireOrigin ? Boolean(originFor(request)) : (!request.headers.has('origin') || Boolean(originFor(request))));
  const localOwner = (request: Request) => env.EDEN_LOCAL_OWNER_ENABLED === 'true' && reviewerGrantReady()
    && eligible(request, false) && isAttestedLocalDevelopmentRequest(request);
  const liveEligible = (request: Request) => eligible(request, false) && reviewerGrantReady() && live.status().available
    && agent.status().available && isAttestedLocalDevelopmentRequest(request);
  const status = (request: Request) => {
    const allowed = eligible(request, false) && (agent.status().dataKind!=='public_directory' || isAttestedLocalDevelopmentRequest(request));
    return {
      mode: allowed ? 'synthetic-development' : 'disabled',
      engine: allowed ? 'gemini' : 'local',
      publicGeminiEnabled: false,
      configured: configured(), eligible: allowed,
      speechAvailable: allowed && speechProvider.status().available,
      reviewAvailable: allowed && reviewerGrantReady() && planner.status().available,
      agentAvailable: allowed && reviewerGrantReady() && agent.status().available,
      evaluationData: allowed && reviewerGrantReady() && agent.status().available ? agent.status().dataKind : null,
      reviewerCodeRequired: !localOwner(request),
      localOwnerAvailable: localOwner(request),
      liveAvailable: liveEligible(request),
      liveModel: liveEligible(request) ? live.status().model : null,
      noticeVersion: EDEN_NOTICE_VERSION,
      reason: allowed ? 'synthetic-development-only' : 'local-fallback',
      ...(localOwner(request) ? { localDevelopment: {
        grantExpiresAt: new Date(reviewerExpiry).toISOString(), live: live.usage(), modelCredits: limits.usage(),
      } } : {}),
    };
  };
  const requireNotice = (body: Record<string, unknown>) => {
    if (body.noticeVersion !== EDEN_NOTICE_VERSION) throw new RequestInputError(428, 'EDEN_NOTICE_REQUIRED', 'Review the current EDEN privacy notice to continue.');
  };
  return {
    status,
    async handle(request: Request, path = new URL(request.url).pathname): Promise<Response> {
      if (path === '/eden/status' && request.method === 'GET') return json(status(request));
      if (!['/eden/session', '/eden/turn', '/eden/speech', '/eden/plan', '/eden/agent', '/eden/agent/result', '/eden/live/token', '/eden/live/tool', '/eden/live/result'].includes(path)) return failure(404, 'EDEN_NOT_FOUND', 'This EDEN action is unavailable.');
      if (!eligible(request) || agent.status().dataKind==='public_directory' && !isAttestedLocalDevelopmentRequest(request)) return failure(403, 'EDEN_DISABLED', 'Gemini is disabled for this request. Continue with the local text controls.');
      const origin = originFor(request)!;
      if (path === '/eden/session' && request.method === 'DELETE') {
        try { const token = tokenFrom(request), binding = bindingFor(token, origin); agent.cancel(binding); endLive(binding); limits.endSession(token, origin); return json({ eligible: false, engine: 'local' }); }
        catch { return failure(401, 'EDEN_SESSION_REQUIRED', 'Start a new EDEN session to continue.'); }
      }
      if (path === '/eden/agent' && request.method === 'DELETE') {
        try {
          const token = tokenFrom(request); requireReviewerSession(token, origin);
          await agent.cancel(createHash('sha256').update(token + '\0' + origin).digest('hex'));
          limits.cancelAgentReservation(token, origin);
          return json({ cancelled: true });
        } catch (error) {
          if (error instanceof EdenLimitError) return failure(error.status, error.code, error.message);
          return failure(503, 'EDEN_UNAVAILABLE', 'The request could not be stopped.');
        }
      }
      if (request.method !== 'POST' && !(path === '/eden/live/token' && request.method === 'DELETE')) return failure(405, 'EDEN_METHOD_NOT_ALLOWED', 'Use the supported EDEN action.');
      try {
        let token: string | undefined;
        const needsReviewer = reviewerMode || path === '/eden/plan' || path.startsWith('/eden/agent') || path.startsWith('/eden/live/');
        if (path !== '/eden/session') { token = tokenFrom(request); limits.authorize(token, origin); }
        if (path !== '/eden/session' && needsReviewer) requireReviewerSession(token!, origin);
        if (path.startsWith('/eden/live/') && !liveEligible(request)) throw new EdenLiveError('EDEN_LIVE_DISABLED', 403);
        const body = await boundedJsonObject(request);
        // The shared reader bounds allocation; this smaller envelope bounds the
        // finite command interface. No free-form message field is supported.
        if (JSON.stringify(body).length > (path === '/eden/live/token' ? 8192 : 2048)) throw new RequestInputError(413, 'EDEN_BODY_TOO_LARGE', 'The EDEN request is too large.');
        requireNotice(body);
        if (path === '/eden/session') {
          if (!only(body, ['adultConfirmed', 'privacyAcknowledged', 'noticeVersion', 'reviewerCode']) || body.adultConfirmed !== true || body.privacyAcknowledged !== true) {
            throw new RequestInputError(422, 'EDEN_ACKNOWLEDGMENT_REQUIRED', 'The local adult demonstration requires the privacy notice and adult acknowledgment.');
          }
          const suppliedCode = Object.hasOwn(body, 'reviewerCode'), reviewerAuthorized = localOwner(request) || suppliedCode;
          if ((reviewerMode && !reviewerAuthorized) || (suppliedCode && !reviewerCodeValid(body.reviewerCode))) throw new EdenLimitError('EDEN_REVIEWER_REQUIRED', 403);
          return json({ eligible: true, engine: 'gemini', reviewerAuthorized,
            ...limits.createSession(origin, reviewerAuthorized ? { expiresAt: reviewerExpiry } : undefined), noticeVersion: EDEN_NOTICE_VERSION });
        }
        if (path === '/eden/live/token') {
          const binding = bindingFor(token!, origin);
          if (request.method === 'DELETE') {
            if (!only(body, ['callId', 'noticeVersion']) || typeof body.callId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.callId)) throw new RequestInputError(422, 'EDEN_LIVE_INVALID_REQUEST', 'Use the current voice call.');
            endLive(binding, body.callId);
            return json({ ended: true });
          }
          const safe = validateEdenLiveTokenRequest(body);
          if (!safe) throw new RequestInputError(422, 'EDEN_LIVE_INVALID_REQUEST', 'Review and acknowledge the voice privacy notice to call Eden.');
          if (safe.context) {
            const { selectedIndex: _selected, ...context } = safe.context;
            await agent.inspectLiveContext(context);
          }
          const release = limits.admit(token!, origin, 'turn');
          try {
            const minted = await live.mint(binding, safe.nonce, Math.min(reviewerExpiry, limits.sessionExpiresAt(token!, origin)), request.signal,
              safe.callId && safe.resumeHandle ? { callId: safe.callId, handle: safe.resumeHandle } : undefined);
            requireReviewerSession(token!, origin);
            return json(minted);
          } finally { release(); }
        }
        if (path === '/eden/live/tool' || path === '/eden/live/result') {
          const binding = bindingFor(token!, origin), context = validateEdenLiveContext(body.context);
          if (!context || typeof body.callId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.callId) || typeof body.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.id)) throw new RequestInputError(422, 'EDEN_LIVE_INVALID_TOOL', 'This voice action is unavailable.');
          live.authorizeCall(binding, body.callId);
          const { selectedIndex } = context;
          const baseContext = context;
          for (const [key, item] of pendingLiveTools) if (item.expires <= now()) pendingLiveTools.delete(key);
          if (path === '/eden/live/tool') {
            const call = validateEdenLiveToolCall({ id: body.id, name: body.name, args: body.args });
            if (!only(body, ['callId', 'id', 'name', 'args', 'context', 'noticeVersion']) || !call) throw new RequestInputError(422, 'EDEN_LIVE_INVALID_TOOL', 'This voice action is unavailable.');
            live.claimTool(binding, body.callId, call.id);
            if (call.name === 'read_public_page_context' || call.name === 'ask_clarification') {
              const result = await agent.inspectLiveContext(baseContext);
              requireReviewerSession(token!, origin); live.authorizeCall(binding, body.callId);
              return json({ authorized: true, toolToken: null, result: { ...result, context: { ...result.context, ...(selectedIndex ? { selectedIndex } : {}) } }, ...(call.name === 'ask_clarification' ? { clarification: { goal: 'clarify-search', ...call.args } } : {}) });
            }
            if ([...pendingLiveTools.values()].some(item => item.binding === binding && item.callId === body.callId) || pendingLiveTools.size >= 100) throw new EdenLiveError('EDEN_LIVE_TOOL_PENDING', 409);
            // Reserve the slot before inspecting repository state, so parallel
            // model tool calls cannot authorize two application mutations.
            const toolToken = randomBytes(32).toString('base64url'), key = createHash('sha256').update(toolToken).digest('hex');
            const action = call.args as EdenAction;
            pendingLiveTools.set(key, { binding, callId: body.callId, id: call.id, action, context: baseContext, expires: now() + 60_000 });
            try {
              const prepared = await agent.prepareLiveAction(action, baseContext);
              requireReviewerSession(token!, origin); live.authorizeCall(binding, body.callId);
              if (!pendingLiveTools.has(key)) throw new EdenLiveError('EDEN_LIVE_TOOL_EXPIRED', 409);
              return json({ authorized: true, toolToken, action: prepared.action });
            } catch (error) { pendingLiveTools.delete(key); throw error; }
          }
          if (!only(body, ['callId', 'id', 'toolToken', 'outcome', 'context', 'noticeVersion']) || typeof body.toolToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.toolToken) || !['done', 'failed'].includes(String(body.outcome))) throw new RequestInputError(422, 'EDEN_LIVE_INVALID_RESULT', 'The voice action result is unavailable.');
          const key = createHash('sha256').update(body.toolToken).digest('hex'), pending = pendingLiveTools.get(key);
          if (!pending || pending.binding !== binding || pending.callId !== body.callId || pending.id !== body.id) throw new EdenLiveError('EDEN_LIVE_TOOL_EXPIRED', 409);
          pendingLiveTools.delete(key);
          const result = await agent.reconcileLiveAction(pending.action, pending.context, body.outcome as 'done' | 'failed', baseContext);
          requireReviewerSession(token!, origin); live.authorizeCall(binding, body.callId);
          return json({ ...result, context: { ...result.context, ...(selectedIndex ? { selectedIndex } : {}) } });
        }
        if (path === '/eden/turn') {
          const action = validateEdenProviderAction(body.action), context = validateEdenPageContext(body.context);
          if (!only(body, ['action', 'context', 'noticeVersion']) || !action || !context || !context.synthetic
            || ((action.type === 'details' || action.type === 'select') && action.index > context.resultCount)) {
            throw new RequestInputError(422, 'EDEN_INVALID_ACTION', 'Use a supported synthetic public navigation action.');
          }
          const release = limits.admit(token!, origin, 'turn');
          try {
            const proposed = validateEdenProviderAction(await provider.propose(action, context, request.signal));
            if (needsReviewer) requireReviewerSession(token!, origin);
            if (!proposed || JSON.stringify(proposed) !== JSON.stringify(action)) throw new EdenProviderError('EDEN_INVALID_PROVIDER_ACTION', 502);
            return json({ engine: 'gemini', action: proposed, phrase: phraseFor(proposed) });
          } finally { release(); }
        }
        if (path === '/eden/plan') {
          const planRequest = validateEdenPlanRequest(body);
          if (!planRequest) throw new RequestInputError(422, 'EDEN_INVALID_PLAN_REQUEST', 'Choose a supported sample comparison scenario.');
          if (!planner.status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
          const release = limits.admit(token!, origin, 'turn');
          try {
            const proposed = validateEdenReviewPlan(await planner.plan(planRequest, request.signal), planRequest.scenarioId);
            // A grant can expire while the provider is responding. Do not
            // release a proposal after its reviewer authorization has ended.
            requireReviewerSession(token!, origin);
            if (!proposed) throw new EdenProviderError('EDEN_INVALID_PROVIDER_PLAN', 502);
            if (!edenReviewChoiceMatchesPriorities(proposed)) throw new EdenProviderError('EDEN_PLAN_PRIORITY_MISMATCH', 503);
            return json({ engine: 'gemini', ...proposed });
          } finally { release(); }
        }
        if (path === '/eden/agent' || path === '/eden/agent/result') {
          if (!agent.status().available) throw new EdenProviderError('EDEN_AGENT_UNAVAILABLE', 403);
          const binding = createHash('sha256').update(token! + '\0' + origin).digest('hex');
          if (path === '/eden/agent') {
            const safe = validateEdenAgentRequest(body);
            if (!safe) throw new RequestInputError(422, 'EDEN_INVALID_AGENT_REQUEST', 'This request cannot be processed safely.');
            const release = limits.admitAgent(token!, origin);
            try {
              const planned = await agent.begin(safe, binding, request.signal);
              requireReviewerSession(token!, origin);
              // Clarification used one genuine inference and performs no app
              // mutation/result phase. Keep both reserved credits consumed,
              // but permit the user's next clarified request immediately.
              if ('clarification' in planned) limits.cancelAgentReservation(token!, origin);
              return json(planned);
            } catch (error) {
              agent.cancel(binding);
              try { limits.cancelAgentReservation(token!, origin); } catch { /* Expired sessions cannot reuse credits. */ }
              throw error;
            } finally { release(); }
          }
          const safe = validateEdenAgentResultRequest(body);
          if (!safe) throw new RequestInputError(422, 'EDEN_INVALID_AGENT_RESULT', 'The application result could not be confirmed.');
          if (!agent.hasPendingTurn(safe.turnToken, binding)) throw new EdenProviderError('EDEN_AGENT_TURN_EXPIRED', 409);
          const release = limits.admitAgentResult(token!, origin);
          try {
            const reply = await agent.complete(safe, binding, request.signal);
            requireReviewerSession(token!, origin);
            return json(reply);
          } finally { release(); }
        }
        const speech = validateEdenSpeechRequest({ phrase: body.phrase });
        if (!only(body, ['phrase', 'noticeVersion']) || !speech) throw new RequestInputError(422, 'EDEN_INVALID_SPEECH', 'Choose an approved EDEN speech phrase.');
        if (!speechProvider.status().available) throw new EdenSpeechError('SPEECH_DISABLED', 503);
        const release = limits.admit(token!, origin, 'speech');
        try {
          const audio = await speechProvider.generate(speech.phrase, request.signal);
          if (needsReviewer) requireReviewerSession(token!, origin);
          if (audio.mimeType !== 'audio/wav' || !inspectEdenWav(audio.data)) throw new EdenSpeechError('SPEECH_INVALID_AUDIO', 503);
          return new Response(new Uint8Array(audio.data), { headers: { ...responseHeaders, 'content-type': 'audio/wav' } });
        } finally { release(); }
      } catch (error) {
        if (error instanceof RequestInputError || error instanceof EdenLimitError || error instanceof EdenProviderError || error instanceof EdenSpeechError || error instanceof EdenLiveError) {
          return failure(error.status, error.code, error.message);
        }
        // Deliberately no logging or raw SDK/body/error reflection.
        return failure(503, 'EDEN_UNAVAILABLE', 'EDEN is unavailable. Continue with the local text controls.');
      }
    },
  };
}
export type EdenService = ReturnType<typeof createEdenService>;
