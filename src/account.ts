import './styles.css';
import './account.css';
import { photograph, initializePhotographs } from './photography';
import { arrow, element, header, escapeHtml as esc } from './ui';
import { footer } from './navigation';
import { apiRequest, BackendError } from './api-client';
import { authClient, finishAuthCallback, isSignInConfigured, requestEmailCode, verifyEmailCode, signOutAccount, onSessionChange, isGoogleSignInConfigured, signInWithGoogle } from './backend-client';
import { claimCards, listingCards, revisionCards } from './organization-ui';
import type { OrganizationAccount } from '../shared/organization-accounts';

// Scrub callback credentials before rendering images or account content.
const callbackCompletion=finishAuthCallback();
document.title = 'Account — Our Ground';
element<HTMLDivElement>('#app').innerHTML = `<div class="page-shell">${header('account')}
  <main class="account-main og-container" id="main" tabindex="-1">
    <div class="account-hero"><div class="account-intro"><span class="page-eyebrow">YOUR ACCOUNT</span><h1>A place to care<br />for your community.</h1><p>Keep your organization’s information useful and current. Everyone can explore the directory without signing in.</p></div>${photograph('account-community-approved','account-photo',true)}</div>
    <div class="account-layout">
      <section class="account-panel" aria-labelledby="accessTitle"><h2 id="accessTitle">Organization access</h2><p id="accountStatus" class="account-status" role="status" aria-live="polite" data-state="loading">Loading account…</p>
        <form id="emailForm" class="record-form account-auth-form" hidden><label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email" /></label><button class="search-button" id="sendCode" type="submit">Email a sign-in code ${arrow}</button><p class="field-hint">Use an email you can access. Signing in verifies your email; organization access is reviewed separately.</p></form>
        <form id="codeForm" class="record-form account-auth-form" hidden><label>Verification code<input name="code" type="text" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" aria-describedby="codeHelp" /></label><p class="field-hint" id="codeHelp">Enter the code from your email in this browser.</p><div class="account-actions"><button class="search-button" id="verifyCode" type="submit">Verify and sign in</button><button class="secondary-button" id="changeEmail" type="button">Use another email</button></div></form>
        <div class="account-actions"><button class="search-button" id="googleSignIn" type="button" hidden>Continue with Google</button><button class="secondary-button" id="signOut" type="button" hidden>Sign out</button><button class="secondary-button" id="refreshAccount" type="button" hidden>Try again</button><a class="secondary-button" id="adminLink" href="/account/administration" hidden>Review organization requests</a></div>
        <ul class="account-memberships" id="memberships" aria-label="Your organizations"></ul>
      </section>
      <aside class="account-aside"><span class="page-eyebrow">LOOKING FOR SUPPORT?</span><h2>You can start here.</h2><p>No account is needed to find food and healthcare resources. Search by location, then read the practical details.</p><a class="og-text-link" href="/support">Find support near you ${arrow}</a><p class="account-access-note">Requests are checked by an Our Ground administrator. A matching email domain helps a review; it does not grant access on its own.</p></aside>
    </div>
    <div id="accountWorkspace" hidden>
      <section class="account-records" aria-labelledby="recordsTitle"><div class="account-record-heading"><span class="page-eyebrow">YOUR ORGANIZATIONS</span><h2 id="recordsTitle">Care for your listings.</h2><p>Open an assigned listing to propose an update. Published information changes after administrator approval.</p></div><div id="serviceList"></div></section>
      <section class="account-records" aria-labelledby="requestsTitle"><div class="account-record-heading"><h2 id="requestsTitle">Your access requests</h2><p>Each request identifies one organization and location.</p></div><div id="claimList" class="account-card-list"></div></section>
      <section class="account-records" aria-labelledby="claimTitle"><div class="account-record-heading"><h2 id="claimTitle">Request organization access.</h2><p>Tell us how you work with the organization. Please leave out identification documents, financial details, and information about people using its services.</p></div>
        <form id="claimForm" class="record-form account-claim-form">
          <div class="account-form-grid"><label>Organization name<input name="organization_name" required minlength="2" maxlength="160" autocomplete="organization" /></label><label>Official website <span class="field-hint">Optional</span><input name="website_url" type="url" maxlength="500" placeholder="https://" /></label></div>
          <label>Organization location <span class="field-hint">Include the address or site name, city and state. Submit separate requests for separate locations.</span><input name="location" required minlength="3" maxlength="300" autocomplete="street-address" /></label>
          <div class="account-form-grid"><label>Your role at the organization<input name="applicant_role" required minlength="2" maxlength="100" autocomplete="organization-title" /></label><label>Organization-related contact email<input name="contact_email" type="email" required maxlength="254" autocomplete="email" /></label></div>
          <label>Organization-related contact phone <span class="field-hint">Optional</span><input name="contact_phone" type="tel" maxlength="80" autocomplete="tel" /></label>
          <label>Supporting explanation <span class="field-hint">Optional · up to 1,000 characters</span><textarea name="explanation" rows="4" maxlength="1000"></textarea></label>
          <p id="claimStatus" class="account-status" role="status" aria-live="polite"></p><button class="search-button" id="submitClaim" type="submit">Submit access request ${arrow}</button>
        </form>
      </section>
      <section class="account-records" aria-labelledby="updatesTitle"><h2 id="updatesTitle">Your proposed updates</h2><div id="revisionList" class="account-card-list"></div></section>
    </div>
  </main>${footer()}</div>`;
initializePhotographs();
const status = element<HTMLElement>('#accountStatus'), emailForm = element<HTMLFormElement>('#emailForm'), codeForm = element<HTMLFormElement>('#codeForm');
const google = element<HTMLButtonElement>('#googleSignIn');
const logout = element<HTMLButtonElement>('#signOut'), retry = element<HTMLButtonElement>('#refreshAccount');
let generation = 0, controller: AbortController | null = null, disposed = false, email = '', signingIn = false, emailEnabled=false;
const setStatus = (text: string, state = 'info') => { status.textContent = text; status.dataset.state = state; };
function invalidate() { generation++; controller?.abort(); controller = null; return generation; }
function clearPrivate() {
  element('#accountWorkspace').hidden = true; element('#memberships').replaceChildren(); element('#serviceList').replaceChildren();
  element('#claimList').replaceChildren(); element('#revisionList').replaceChildren(); element('#adminLink').hidden = true;
}
function showSignedOut(message = emailEnabled?'Sign in with a code sent to your email.':isGoogleSignInConfigured()?'Continue with Google to sign in.':'Organization sign-in is not enabled yet. You can still find support without an account.') {
  clearPrivate(); (document.querySelector('#claimForm') as HTMLFormElement | null)?.reset(); codeForm.reset(); emailForm.reset(); email = ''; logout.hidden = true; google.hidden=!isGoogleSignInConfigured(); emailForm.hidden = !emailEnabled; codeForm.hidden = true; setStatus(message);
}
function showError(error: unknown) {
  const text = error instanceof Error ? error.message : 'Your account could not be loaded. Please try again.';
  if (error instanceof BackendError && error.status === 401) { showSignedOut('Your session expired. Sign in again to continue.'); return; }
  setStatus(text, 'error'); retry.hidden = false;
}
async function refresh() {
  const current = invalidate(); controller = new AbortController(); const signal = controller.signal;
  clearPrivate(); retry.hidden = true; google.hidden=true; logout.hidden = true; emailForm.hidden = true; codeForm.hidden = true;
  if (!isSignInConfigured()) { setStatus('Organization sign-in is not configured yet. You can still browse resources without an account.'); return; }
  setStatus('Checking your account…', 'loading');
  try {
    const availability = await apiRequest<{ configured: boolean; email_enabled:boolean }>('org/status', { signal });
    if (disposed || current !== generation) return;
    emailEnabled=availability.email_enabled===true;
    if (!availability.configured) { setStatus('Organization accounts are not configured yet. Public resource search remains available.'); return; }
    const { data, error } = await authClient().auth.getSession();
    if (disposed || current !== generation) return;
    if (error) throw new Error('Your session could not be read. Please try again.');
    if (!data.session) { showSignedOut(); return; }
    const account = await apiRequest<OrganizationAccount>('org/account', { signal }, true);
    if (disposed || current !== generation) return;
    logout.hidden = false; element('#accountWorkspace').hidden = false; element('#adminLink').hidden = account.role !== 'admin';
    setStatus(account.listings.length ? 'You are signed in. Your assigned listings are ready below.' : 'You are signed in. Request organization access below to get started.', 'success');
    element('#memberships').innerHTML = account.organizations.map(org => `<li>${esc(org.name)} — assigned organization</li>`).join('');
    element('#serviceList').innerHTML = listingCards(account.listings);
    element('#claimList').innerHTML = claimCards(account.claims);
    element('#revisionList').innerHTML = revisionCards(account.revisions, account.listings);
  } catch (error) { if (!disposed && current === generation && !signal.aborted) showError(error); }
}
google.addEventListener('click',()=>{const current=invalidate();clearPrivate();google.disabled=true;setStatus('Opening Google sign-in…','loading');void signInWithGoogle().catch(error=>{if(!disposed&&current===generation)showError(error);}).finally(()=>{google.disabled=false;});});
emailForm.addEventListener('submit', event => {
  event.preventDefault(); if (signingIn||!emailEnabled) return;
  signingIn = true; const current = generation; email = (emailForm.elements.namedItem('email') as HTMLInputElement).value.trim();
  const button = element<HTMLButtonElement>('#sendCode'); button.disabled = true; setStatus('Requesting a sign-in code…', 'loading');
  void requestEmailCode(email).then(() => {
    if (disposed || current !== generation) return;
    emailForm.hidden = true; codeForm.hidden = false; setStatus('If email sign-in is available for this address, a code will arrive shortly. Check your inbox and spam folder.');
    (codeForm.elements.namedItem('code') as HTMLInputElement).focus();
  }).catch(error => { if (!disposed && current === generation) showError(error); }).finally(() => { signingIn = false; button.disabled = false; });
});
codeForm.addEventListener('submit', event => {
  event.preventDefault(); if (signingIn) return;
  signingIn = true; const button = element<HTMLButtonElement>('#verifyCode'); button.disabled = true; setStatus('Verifying your email…', 'loading');
  const code = (codeForm.elements.namedItem('code') as HTMLInputElement).value.trim();
  void verifyEmailCode(email, code).then(() => { codeForm.reset(); return refresh(); }).catch(() => { setStatus('The code could not be verified. It may be incorrect or expired. Request a new code and try again.', 'error'); }).finally(() => { signingIn = false; button.disabled = false; });
});
element('#changeEmail').addEventListener('click', () => { codeForm.reset(); codeForm.hidden = true; emailForm.hidden = !emailEnabled; setStatus('Enter your email to request another code.'); });
logout.addEventListener('click', () => {
  invalidate(); clearPrivate(); emailForm.hidden = true; codeForm.hidden = true; logout.disabled = true; setStatus('Signing out…', 'loading');
  void signOutAccount().then(() => refresh()).catch(showError).finally(() => { logout.disabled = false; });
});
retry.addEventListener('click', () => void refresh());
const claimForm = element<HTMLFormElement>('#claimForm');
claimForm.addEventListener('submit', event => {
  event.preventDefault(); const current = generation, button = element<HTMLButtonElement>('#submitClaim'), message = element<HTMLElement>('#claimStatus');
  const values = Object.fromEntries(new FormData(claimForm).entries());
  for (const key of Object.keys(values)) values[key] = String(values[key]).trim();
  for (const key of ['website_url', 'contact_phone', 'explanation']) if (!values[key]) delete values[key];
  button.disabled = true; message.textContent = 'Submitting your access request…'; message.dataset.state = 'loading';
  void apiRequest('org/claims', { method: 'POST', body: JSON.stringify(values) }, true).then(async () => {
    if (disposed || current !== generation) return;
    claimForm.reset(); message.textContent = 'Your request was submitted for review. It does not grant editing access.'; message.dataset.state = 'success'; await refresh();
    element('#requestsTitle').scrollIntoView({ block: 'start' });
  }).catch(error => {
    if (disposed || current !== generation) return;
    message.textContent = error instanceof Error ? error.message : 'Your request could not be submitted.'; message.dataset.state = 'error';
    if (error instanceof BackendError && error.status === 401) { clearPrivate(); showSignedOut('Your session expired. Sign in again to submit your request.'); }
  }).finally(() => { button.disabled = false; });
});
const unsubscribe = isSignInConfigured() ? onSessionChange((event, session) => {
  if (disposed) return;
  if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) { invalidate(); clearPrivate(); showSignedOut('Your session ended. Sign in again to continue.'); }
  else if (event === 'SIGNED_IN' && !signingIn) void refresh();
}) : () => {};
window.addEventListener('pagehide', () => { disposed = true; invalidate(); clearPrivate(); emailForm.reset(); codeForm.reset(); claimForm.reset(); email=''; google.hidden=true; logout.hidden=true; unsubscribe(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
void callbackCompletion.then(() => refresh()).catch(error => { if (isSignInConfigured()) showSignedOut(); showError(error); });
