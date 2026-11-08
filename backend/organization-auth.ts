import { exactAuthOrigins, productionRuntime, reservedIdentity, localFixtureRuntime, validAuthConfiguration } from '../shared/auth-security.ts';
import { createClient } from '@supabase/supabase-js';
import { UnavailableError } from './errors.ts';

export type OrganizationPrincipal = { id: string; email: string; sessionId: string; expiresAt: number };
export type OrganizationAuth = {
  configured: boolean;
  emailConfigured: boolean;
  verify(token: string): Promise<OrganizationPrincipal | null>;
  startEmail(email: string, redirectOrigin: string): Promise<void>;
  revokeProvider(token: string): Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new UnavailableError('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again later.');
function payload(value: string): Record<string, unknown> | null {
  try {
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
export const accountAllowedOrigins = exactAuthOrigins;
export function createOrganizationAuth(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): OrganizationAuth {
  const url = env.SUPABASE_URL ?? '', key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const origins = accountAllowedOrigins(env.ACCOUNT_ALLOWED_ORIGINS);
  const production = productionRuntime(env), fixture = localFixtureRuntime(env);
  const unsafeFixtureFlag = production && (env.ACCOUNT_LOCAL_FIXTURE==='true' || env.LOCAL_FIXTURE_BUILD==='true' || env.VITE_ACCOUNT_LOCAL_FIXTURE==='true');
  const configured = Boolean(!unsafeFixtureFlag && validAuthConfiguration(url,key,fixture) && origins.length);
  const emailConfigured=configured&&env.ACCOUNT_EMAIL_AUTH_ENABLED==='true';
  let client: ReturnType<typeof createClient> | undefined;
  function auth() {
    if (!configured) throw new UnavailableError('AUTH_NOT_CONFIGURED', 'Organization sign-in is not configured. You can still search for support.');
    client ??= createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetcher(input, { ...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(10000) }) }
    });
    return client.auth;
  }
  return {
    configured, emailConfigured,
    async verify(token) {
      if (!configured) auth();
      // Decode only to reject malformed/expired input early. Acceptance still requires
      // Supabase's authenticated getUser request, never these unverified claims.
      if (!token || token.length > 8192) return null;
      const claims = payload(token);
      if (!claims || typeof claims.sub !== 'string' || !uuid.test(claims.sub)
        || typeof claims.session_id !== 'string' || !uuid.test(claims.session_id)
        || !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= Math.floor(Date.now() / 1000)) return null;
      try {
        const { data, error } = await auth().getUser(token);
        if (error) {
          if (!error.status || error.status >= 500 || error.status === 429) throw unavailable();
          return null;
        }
        const user = data.user;
        if (!user || user.id !== claims.sub || !user.email || !user.email_confirmed_at || user.is_anonymous || (production && reservedIdentity(user.email))) return null;
        if (!Number.isFinite(Date.parse(user.email_confirmed_at))) return null;
        return { id: user.id, email: user.email, sessionId: claims.session_id, expiresAt: Number(claims.exp) };
      } catch (error) {
        if (error instanceof UnavailableError) throw error;
        // SDK/fetch errors may contain URLs. Return only an application-owned message.
        throw unavailable();
      }
    },
    async startEmail(email, redirectOrigin) {
      if(!configured)auth();
      if(!emailConfigured)throw new UnavailableError('AUTH_EMAIL_NOT_CONFIGURED','Email sign-in is not enabled. Use another available sign-in method or try later.');
      if (!origins.includes(redirectOrigin)) throw new UnavailableError('AUTH_ORIGIN_NOT_ALLOWED', 'Sign-in is not enabled for this address.');
      try {
        const { error } = await auth().signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectOrigin + '/auth/callback' } });
        // Existing/new/disabled user responses share the same application response.
        // Operational errors and provider limits retain a generic recovery message.
        if (error && (!error.status || error.status >= 500 || error.status === 429)) throw unavailable();
      } catch (error) {
        if (error instanceof UnavailableError) throw error;
        throw unavailable();
      }
    },
    async revokeProvider(token) {
      try {
        // This is the same token-scoped GoTrue operation used by SDK signOut.
        // It needs the session bearer, not a Supabase service-role credential.
        const { error } = await auth().admin.signOut(token, 'local');
        if (error && ![401, 403, 404].includes(error.status ?? 0)) throw unavailable();
      } catch (error) {
        if (error instanceof UnavailableError) throw error;
        throw unavailable();
      }
    }
  };
}
