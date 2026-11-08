import { exactAuthOrigins, googleCallbackCode, googleOAuthOptions, loopbackUrl, validAuthConfiguration, withoutProviderCredentials } from '../shared/auth-security';
import type { PendingGoogle } from '../shared/auth-security';
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { apiRequest, BackendError } from './api-client';
export { apiRequest, BackendError };
export type { CurrentAccount } from '../shared/contracts';

let client: SupabaseClient | undefined;
const pendingGoogleKey='ourground.google.pkce.pending';
function fixtureBrowser() { return import.meta.env.MODE==='local-fixture' && loopbackUrl(window.location.origin); }
export function isSignInConfigured() {
  return validAuthConfiguration(import.meta.env.VITE_SUPABASE_URL??'',import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??'',fixtureBrowser());
}
export function isGoogleSignInConfigured() {
  return isSignInConfigured() && !fixtureBrowser() && import.meta.env.VITE_GOOGLE_AUTH_ENABLED==='true'
    && exactAuthOrigins(import.meta.env.VITE_ACCOUNT_ALLOWED_ORIGINS).includes(window.location.origin);
}
const sessionStorageAdapter={
  getItem(key:string) { const value=window.localStorage.getItem(key);if(value===null)return null;const cleaned=withoutProviderCredentials(value);if(cleaned!==value)window.localStorage.setItem(key,cleaned);return cleaned; },
  setItem(key:string,value:string) { window.localStorage.setItem(key,withoutProviderCredentials(value)); },
  removeItem(key:string) { window.localStorage.removeItem(key); }
};
export function authClient() {
  if (!isSignInConfigured()) throw new Error('Organization sign-in is not configured. You can still search for support.');
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storage:sessionStorageAdapter }
  });
  return client;
}
export async function requestEmailCode(email: string): Promise<{ message: string }> {
  return apiRequest('org/auth/email', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
}
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  if (!/^[0-9]{6,8}$/.test(code.trim())) throw new Error('Enter the verification code from your email.');
  const { data, error } = await authClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error || !data.session || !data.user?.email_confirmed_at) throw new Error('That code could not be verified or has expired. Request a new code and try again.');
}
export async function signInWithGoogle():Promise<void> {
  if(!isGoogleSignInConfigured())throw new Error('Google sign-in is not configured for this address.');
  const pending:PendingGoogle={origin:window.location.origin,startedAt:Date.now(),nonce:crypto.randomUUID()};
  window.sessionStorage.setItem(pendingGoogleKey,JSON.stringify(pending));
  try {
    const {data,error}=await authClient().auth.signInWithOAuth(googleOAuthOptions(window.location.origin,exactAuthOrigins(import.meta.env.VITE_ACCOUNT_ALLOWED_ORIGINS),isGoogleSignInConfigured()));
    if(error||!data.url)throw new Error('Could not begin Google sign-in.');
    const target=new URL(data.url),authOrigin=new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    if(target.origin!==authOrigin||target.pathname!=='/auth/v1/authorize'||target.searchParams.get('provider')!=='google'||target.searchParams.get('redirect_to')!==window.location.origin+'/auth/callback'||target.searchParams.get('code_challenge_method')!=='s256'||!target.searchParams.get('code_challenge'))throw new Error('The sign-in destination could not be verified.');
    window.location.assign(target.href);
  } catch { window.sessionStorage.removeItem(pendingGoogleKey);throw new Error('Google sign-in could not be started. Please try again.'); }
}
/** Only the locally initiated PKCE callback may exchange a code; return is fixed. */
export async function finishAuthCallback(): Promise<void> {
  const url=new URL(window.location.href);
  let pending:PendingGoogle|null=null;
  try { pending=JSON.parse(window.sessionStorage.getItem(pendingGoogleKey)??'null'); }catch{ /* Missing or corrupted state fails closed. */ }
  const callback=url.pathname.replace(/\/$/,'')==='/auth/callback';
  const hasAuthFields=[...url.searchParams.keys(),...new URLSearchParams(url.hash.slice(1)).keys()].some(k=>['code','token','token_hash','access_token','refresh_token','error','error_description','next','redirect','redirect_to','return_to'].includes(k));
  if(!callback&&!hasAuthFields)return;
  // Scrub credentials/error details before any exchange, rendering, or further requests.
  window.history.replaceState(null,'','/account');
  window.sessionStorage.removeItem(pendingGoogleKey);
  let code:string|null;
  try { code=googleCallbackCode(url,pending,isGoogleSignInConfigured()); }
  catch { throw new Error('This sign-in request is invalid, expired, or was opened in another browser. Start sign-in again.'); }
  if(!code)return;
  try { const {error}=await authClient().auth.exchangeCodeForSession(code);if(error)throw error; }
  catch { throw new Error('This sign-in request is invalid or expired. Start sign-in again.'); }
}
export async function signOutAccount(): Promise<void> {
  window.sessionStorage.removeItem(pendingGoogleKey);
  let failed = false;
  try { await apiRequest('org/session/logout', { method: 'POST', body: '{}' }, true); }
  catch (error) { if (!(error instanceof BackendError && error.status === 401)) failed = true; }
  try {
    // The SDK clears its local session and notifies other tabs, including when
    // the provider cannot be reached. The server also revokes this session ID.
    const { error } = await authClient().auth.signOut({ scope: 'local' });
    if (error) failed = true;
  } catch { failed = true; }
  if (failed) throw new Error('Signed out on this device. The session could not be fully confirmed with the server. Please try again later.');
}
export function onSessionChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  if (!isSignInConfigured()) return () => {};
  let active = true;
  const { data } = authClient().auth.onAuthStateChange((event, session) => {
    // Session subscribers must not await SDK calls while its internal lock is held.
    queueMicrotask(() => { if (active) listener(event, session); });
  });
  return () => { active = false; data.subscription.unsubscribe(); };
}
