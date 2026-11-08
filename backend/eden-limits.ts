import { createHash, randomBytes } from 'node:crypto';

export const EDEN_DEVELOPMENT_LIMITS = Object.freeze({
  sessionLifetimeMs: 15 * 60_000,
  sessionsPerHour: 6,
  maxSessions: 100,
  callsPerMinute: 3,
  agentTurnsPerMinute: 3,
  agentReservationMs: 120_000,
  callsPerSession: 20,
  speechPerSession: 6,
  callsPerDay: 40,
  speechPerDay: 12,
  concurrentCalls: 2,
});
export class EdenLimitError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 429) {
    super(status === 401 ? 'Start a new EDEN session to continue.' : status === 403
      ? 'A current adult reviewer invitation is required for this sample comparison.'
      : 'EDEN has reached a local demonstration limit. Continue with the local text controls.');
    this.code = code;
    this.status = status;
  }
}
type Session = { origin: string; expiresAt: number; reviewerExpiresAt?: number; minute: number; minuteCalls: number; calls: number; speech: number; active: boolean; agentMinute: number; agentTurns: number; agentReservationUntil?: number };
export type EdenLimitsOptions = { now?: () => number };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Process-memory counters are intentionally used only behind the unconditional
 * public/hosted denial in eden-api. They are not a production abuse safeguard.
 * Store opaque token hashes and counters only; no visitor content or IP address.
 */
export function createEdenLimits(options: EdenLimitsOptions = {}) {
  const now = options.now ?? Date.now;
  const sessions = new Map<string, Session>();
  let hour = -1, created = 0, day = -1, calls = 0, speech = 0, active = 0;
  const purge = () => { const current = now(); for (const [key, session] of sessions) if (session.expiresAt <= current && !session.active) sessions.delete(key); };
  const find = (token: string, origin: string): Session => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new EdenLimitError('EDEN_SESSION_REQUIRED', 401);
    const session = sessions.get(digest(token));
    if (!session || session.origin !== origin || session.expiresAt <= now()) throw new EdenLimitError('EDEN_SESSION_REQUIRED', 401);
    return session;
  };
  return {
    usage() {
      // A diagnostic read never admits work or consumes/reset counters. Report
      // only the current UTC windows; the next admission still owns rollover.
      const current = now(), currentDay = Math.floor(current / 86_400_000), currentHour = Math.floor(current / 3_600_000);
      return { dayCalls: day === currentDay ? calls : 0, dayCallLimit: EDEN_DEVELOPMENT_LIMITS.callsPerDay,
        daySpeech: day === currentDay ? speech : 0, daySpeechLimit: EDEN_DEVELOPMENT_LIMITS.speechPerDay,
        dayResetAt: new Date((currentDay + 1) * 86_400_000).toISOString(),
        hourSessionsCreated: hour === currentHour ? created : 0, hourSessionLimit: EDEN_DEVELOPMENT_LIMITS.sessionsPerHour,
        hourResetAt: new Date((currentHour + 1) * 3_600_000).toISOString(), scope: 'backend-process' as const };
    },
    createSession(origin: string, reviewer?: { expiresAt: number }): { sessionToken: string; expiresAt: string } {
      purge();
      const currentHour = Math.floor(now() / 3_600_000);
      if (hour !== currentHour) { hour = currentHour; created = 0; }
      if (created >= EDEN_DEVELOPMENT_LIMITS.sessionsPerHour || sessions.size >= EDEN_DEVELOPMENT_LIMITS.maxSessions) throw new EdenLimitError('EDEN_SESSION_LIMIT');
      const sessionToken = randomBytes(32).toString('base64url'), expiresAt = Math.min(now() + EDEN_DEVELOPMENT_LIMITS.sessionLifetimeMs, reviewer?.expiresAt ?? Infinity);
      sessions.set(digest(sessionToken), { origin, expiresAt, ...(reviewer ? { reviewerExpiresAt: reviewer.expiresAt } : {}), minute: -1, minuteCalls: 0, calls: 0, speech: 0, active: false, agentMinute: -1, agentTurns: 0 });
      created += 1;
      return { sessionToken, expiresAt: new Date(expiresAt).toISOString() };
    },
    authorize(token: string, origin: string): void { find(token, origin); },
    sessionExpiresAt(token: string, origin: string): number { return find(token, origin).expiresAt; },
    authorizeReviewer(token: string, origin: string): void {
      const session = find(token, origin);
      if (!session.reviewerExpiresAt || session.reviewerExpiresAt <= now()) throw new EdenLimitError('EDEN_REVIEWER_REQUIRED', 403);
    },
    endSession(token: string, origin: string): void { find(token, origin); sessions.delete(digest(token)); },
    cancelAgentReservation(token: string, origin: string): void { find(token, origin).agentReservationUntil = undefined; },
    admitAgent(token: string, origin: string): () => void {
      const session = find(token, origin), minute = Math.floor(now() / 60_000), currentDay = Math.floor(now() / 86_400_000);
      if (day !== currentDay) { day = currentDay; calls = 0; speech = 0; }
      if (session.minute !== minute) { session.minute = minute; session.minuteCalls = 0; }
      if (session.agentMinute !== minute) { session.agentMinute = minute; session.agentTurns = 0; }
      if (session.active || active >= EDEN_DEVELOPMENT_LIMITS.concurrentCalls) throw new EdenLimitError('EDEN_BUSY');
      if ((session.agentReservationUntil ?? 0) > now()) throw new EdenLimitError('EDEN_AGENT_TURN_PENDING', 409);
      if (session.agentTurns >= EDEN_DEVELOPMENT_LIMITS.agentTurnsPerMinute || calls + 2 > EDEN_DEVELOPMENT_LIMITS.callsPerDay || session.calls + 2 > EDEN_DEVELOPMENT_LIMITS.callsPerSession) throw new EdenLimitError('EDEN_USAGE_LIMIT');
      // Reserve both actual model calls atomically. An abandoned result phase
      // never refunds credits or becomes a way around the shared raw-call caps.
      calls += 2; session.calls += 2; session.minuteCalls += 2; session.agentTurns += 1;
      session.agentReservationUntil = now() + EDEN_DEVELOPMENT_LIMITS.agentReservationMs;
      session.active = true; active += 1;
      let released = false;
      return () => { if (!released) { released = true; session.active = false; active -= 1; } };
    },
    admitAgentResult(token: string, origin: string): () => void {
      const session = find(token, origin);
      if (session.active || active >= EDEN_DEVELOPMENT_LIMITS.concurrentCalls) throw new EdenLimitError('EDEN_BUSY');
      if (!session.agentReservationUntil || session.agentReservationUntil <= now()) throw new EdenLimitError('EDEN_AGENT_TURN_EXPIRED', 409);
      session.agentReservationUntil = undefined;
      session.active = true; active += 1;
      let released = false;
      return () => { if (!released) { released = true; session.active = false; active -= 1; } };
    },
    admit(token: string, origin: string, kind: 'turn' | 'speech'): () => void {
      const session = find(token, origin), currentMinute = Math.floor(now() / 60_000), currentDay = Math.floor(now() / 86_400_000);
      if (day !== currentDay) { day = currentDay; calls = 0; speech = 0; }
      if (session.minute !== currentMinute) { session.minute = currentMinute; session.minuteCalls = 0; }
      if (session.active || active >= EDEN_DEVELOPMENT_LIMITS.concurrentCalls) throw new EdenLimitError('EDEN_BUSY');
      if (calls >= EDEN_DEVELOPMENT_LIMITS.callsPerDay || session.calls >= EDEN_DEVELOPMENT_LIMITS.callsPerSession
        || session.minuteCalls >= EDEN_DEVELOPMENT_LIMITS.callsPerMinute
        || (kind === 'speech' && (speech >= EDEN_DEVELOPMENT_LIMITS.speechPerDay || session.speech >= EDEN_DEVELOPMENT_LIMITS.speechPerSession))) throw new EdenLimitError('EDEN_USAGE_LIMIT');
      // Attempts count even on provider rejection, quota failure or cancellation.
      calls += 1; session.calls += 1; session.minuteCalls += 1; active += 1; session.active = true;
      if (kind === 'speech') { speech += 1; session.speech += 1; }
      let released = false;
      return () => { if (!released) { released = true; active -= 1; session.active = false; } };
    },
  };
}
