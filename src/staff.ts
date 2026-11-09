import './styles.css';
import './account.css';
import { arrow, element, header, escapeHtml as esc } from './ui';
import { footer } from './navigation';
import { apiRequest, BackendError } from './api-client';
import { isSignInConfigured, onAccountIdentityChange } from './backend-client';
import { dateLabel, safeLink, revisionCards } from './organization-ui';
import type { OrganizationAccount, OrganizationListing, ListingPatch, ListingHours } from '../shared/organization-accounts';

const id = window.location.pathname.replace(/\/$/,'').split('/').pop() ?? '';
document.title = 'Organization listing — Our Ground';
element<HTMLDivElement>('#app').innerHTML = `<div class="page-shell">${header('account')}
  <main class="staff-main og-container" id="main" tabindex="-1">
    <a class="staff-back" href="/account">${arrow}Back to your account</a>
    <div class="staff-intro"><span class="page-eyebrow">ORGANIZATION WORKSPACE</span><h1>Keep the next step clear.</h1><p>Propose updates to your assigned listing. An administrator reviews each update before it changes published information.</p></div>
    <p id="editStatus" class="account-status staff-status" role="status" aria-live="polite" data-state="loading">Loading your listing…</p>
    <div class="staff-recovery"><a id="staffSignIn" class="search-button" href="/account" hidden>Go to account ${arrow}</a><button id="retryLoad" class="secondary-button" type="button" hidden>Try loading again</button></div>
    <div id="listingWorkspace" hidden>
      <section class="account-published" aria-labelledby="publishedTitle"><div><span class="page-eyebrow">CURRENT LISTING</span><h2 id="publishedTitle"></h2><div id="publishedDetails"></div></div><aside id="listingSource" class="account-source"></aside></section>
      <div class="staff-layout"><section class="staff-editor" aria-labelledby="proposalTitle"><h2 id="proposalTitle">Propose an update.</h2>
        <form id="serviceForm" class="record-form staff-form">
          <fieldset id="listingFields"><legend class="visually-hidden">Proposed listing information</legend>
            <label>Service title<input name="title" required minlength="2" maxlength="160" /></label>
            <label>Summary<textarea name="summary" rows="3" maxlength="500"></textarea></label>
            <label>Service description<textarea name="description" rows="5" maxlength="4000"></textarea></label>
            <label>Organization description<textarea name="organization_description" rows="4" maxlength="4000"></textarea></label>
            <div class="account-form-grid"><label>Service phone<input name="contact_phone" type="tel" maxlength="80" /></label><label>Service website<input name="contact_url" type="url" maxlength="500" placeholder="https://" /></label></div>
            <div class="account-form-grid"><label>Organization phone<input name="public_phone" type="tel" maxlength="80" /></label><label>Organization website<input name="website_url" type="url" maxlength="500" placeholder="https://" /></label></div>
            <fieldset class="account-category-fields"><legend>Services provided</legend><label><input name="category_food" type="checkbox" /> Food assistance</label><label><input name="category_healthcare" type="checkbox" /> Healthcare</label></fieldset>
            <label>Eligibility<textarea name="eligibility_text" rows="3" maxlength="1000"></textarea></label>
            <label>Cost information<input name="cost_summary" maxlength="500" /></label>
            <label>Appointments<textarea name="appointment_note" rows="3" maxlength="1000"></textarea></label>
            <details class="account-editor-details"><summary>Location details</summary><div class="account-editor-group">
              <label>Location name<input name="site_name" required minlength="2" maxlength="160" /></label>
              <label>Street address<input name="street_address" maxlength="300" /></label>
              <div class="account-form-grid"><label>City<input name="city" required minlength="2" maxlength="100" /></label><label>State<input name="state" maxlength="2" pattern="[A-Z]{2}" aria-describedby="stateHelp" /></label></div><p class="field-hint" id="stateHelp">Use a two-letter U.S. state or supported territory code. Location changes require administrator review.</p>
              <label>ZIP code<input name="postal_code" inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxlength="10" /></label>
              <div class="account-form-grid"><label>Latitude<input name="latitude" type="number" min="-90" max="90" step="any" required /></label><label>Longitude<input name="longitude" type="number" min="-180" max="180" step="any" required /></label></div>
              <p class="field-hint">Address and map-point changes are reviewed together. Confirm the coordinates for this specific location.</p>
            </div></details>
            <details class="account-editor-details"><summary>Opening hours</summary><div class="account-editor-group"><p class="field-hint">Leave hours empty if they are not confirmed. Add a separate opening period for split hours.</p><div id="hoursRows"></div><button id="addHours" type="button" class="secondary-button">Add opening period</button></div></details>
          </fieldset>
          <div class="staff-save-row"><button type="submit" class="search-button" id="saveService" disabled>Submit for review</button><p id="dirtyStatus" class="account-status" role="status" aria-live="polite">No unsaved changes.</p></div>
          <div id="conflictRecovery" class="staff-conflict" hidden><p>This listing changed while you were editing. Your proposal remains in the form. Copy any changes you want to keep before loading the latest information.</p><button type="button" class="secondary-button" id="reloadService">Load latest listing</button></div>
        </form>
      </section><aside class="staff-guidance"><span class="page-eyebrow">A REVIEWABLE UPDATE</span><h2>Share what you can confirm.</h2><p>Include practical details that help someone decide their next step. Leave unknown information blank.</p><p>Submitting an update saves a pending revision. An administrator may approve or reject it and leave a note.</p><p>Your access applies to the reviewed organization and location. Donation destinations and independent source records are managed separately.</p><h3>Your proposed updates</h3><div id="listingRevisions" class="account-card-list"></div></aside></div>
    </div>
  </main>${footer()}</div>`;
const form = element<HTMLFormElement>('#serviceForm'), message = element<HTMLElement>('#editStatus'), save = element<HTMLButtonElement>('#saveService');
let listing: OrganizationListing | null = null, savedValues = '', busy = false, dirty = false, generation = 0, controller: AbortController | null = null, disposed = false, conflicted = false;
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
const textFields = ['title','summary','description','organization_description','contact_phone','contact_url','public_phone','website_url','eligibility_text','cost_summary','appointment_note','site_name','street_address','city','state','postal_code'] as const;
const nullable = new Set<string>(['contact_phone','contact_url','public_phone','website_url','eligibility_text','cost_summary','appointment_note','street_address','postal_code']);
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function setMessage(text: string, state = 'info') { message.textContent = text; message.dataset.state = state; }
function hoursRow(value?: ListingHours) {
  const row = document.createElement('div'); row.className = 'account-hours-row';
  row.innerHTML = `<label>Day<select data-hour="weekday">${days.map((day, index) => `<option value="${index}"${(value?.weekday ?? 1) === index ? ' selected' : ''}>${day}</option>`).join('')}</select></label><label>Opens<input data-hour="opens_at" type="time" required value="${esc(value?.opens_at.slice(0,5) ?? '')}" /></label><label>Closes<input data-hour="closes_at" type="time" required value="${esc(value?.closes_at.slice(0,5) ?? '')}" /></label><label class="account-hours-note">Notes<input data-hour="notes" maxlength="300" value="${esc(value?.notes ?? '')}" /></label><button type="button" class="account-remove-hours secondary-button">Remove period</button>`;
  row.querySelector('button')!.addEventListener('click', () => { row.remove(); updateDirty(); }); element('#hoursRows').append(row);
}
function currentValues(): ListingPatch {
  const values: Record<string, unknown> = {};
  for (const key of textFields) { const value = field(key).value.trim(); values[key] = !value && nullable.has(key) ? null : value; }
  values.latitude = Number(field('latitude').value); values.longitude = Number(field('longitude').value);
  values.category_slugs = (['food','healthcare'] as const).filter(category => (field('category_' + category) as HTMLInputElement).checked);
  values.hours = [...document.querySelectorAll<HTMLElement>('.account-hours-row')].map(row => ({
    weekday: Number(row.querySelector<HTMLSelectElement>('[data-hour="weekday"]')!.value),
    opens_at: row.querySelector<HTMLInputElement>('[data-hour="opens_at"]')!.value,
    closes_at: row.querySelector<HTMLInputElement>('[data-hour="closes_at"]')!.value,
    notes: row.querySelector<HTMLInputElement>('[data-hour="notes"]')!.value.trim() || null
  })).sort((a,b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at));
  return values as ListingPatch;
}
function updateDirty() {
  dirty = Boolean(listing) && JSON.stringify(currentValues()) !== savedValues;
  element('#dirtyStatus').textContent = dirty ? 'You have an unsaved proposal.' : 'No unsaved changes.';
  save.disabled = busy || conflicted || !dirty;
}
function clearPrivate() { listing = null; dirty = false; savedValues = ''; form.reset(); element('#hoursRows').replaceChildren(); element('#listingWorkspace').hidden = true; element('#publishedTitle').replaceChildren(); element('#publishedDetails').replaceChildren(); element('#listingSource').replaceChildren(); element('#listingRevisions').replaceChildren(); }
function showError(error: unknown) {
  const denied = error instanceof BackendError && [401,403,404].includes(error.status);
  if (denied) { clearPrivate(); element('#staffSignIn').hidden = false; }
  setMessage(error instanceof Error ? error.message : 'Your listing could not be loaded.', 'error');
  if (!denied) element('#retryLoad').hidden = false;
}
async function load() {
  if (busy) return;
  const current = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  busy = true; conflicted = false; save.disabled = true; element('#retryLoad').hidden = true; element('#staffSignIn').hidden = true; element('#conflictRecovery').hidden = true;
  element<HTMLFieldSetElement>('#listingFields').disabled = true; setMessage('Loading your assigned listing…', 'loading');
  try {
    if (!isSignInConfigured()) throw new BackendError(401,'UNAUTHENTICATED','Organization sign-in is not configured yet. Listing management requires approved access.');
    const [record, account] = await Promise.all([apiRequest<OrganizationListing>('org/listings/' + encodeURIComponent(id), { signal }, true), apiRequest<OrganizationAccount>('org/account', { signal }, true)]);
    if (disposed || current !== generation) return;
    listing = record; for (const key of textFields) field(key).value = String(record[key] ?? '');
    field('latitude').value = String(record.latitude); field('longitude').value = String(record.longitude);
    for (const category of ['food','healthcare']) (field('category_' + category) as HTMLInputElement).checked = record.category_slugs.includes(category as 'food'|'healthcare');
    element('#hoursRows').replaceChildren(); for (const hour of record.hours) hoursRow(hour);
    savedValues = JSON.stringify(currentValues()); dirty = false;
    element('#publishedTitle').textContent = record.organization_name;
    element('#publishedDetails').innerHTML = `<h3>${esc(record.title)}</h3><p>${esc(record.site_name)} · ${esc([record.street_address,record.city,record.state,record.postal_code].filter(Boolean).join(', '))}</p><p>${esc(record.summary)}</p><p>${esc(record.category_slugs.map(category => category === 'food' ? 'Food assistance' : 'Healthcare').join(' · '))}</p>${record.description ? `<p>${esc(record.description)}</p>` : ''}<p>${record.contact_phone ? esc(record.contact_phone) : 'Phone not provided'}${record.contact_url ? ' · ' + safeLink(record.contact_url, 'Service website') : ''}</p>`;
    element('#listingSource').innerHTML = `<span class="page-eyebrow">SOURCE & STATUS</span><p>${esc(record.status[0].toUpperCase() + record.status.slice(1))} · Version ${record.version}</p><p>${safeLink(record.source_url,'Source record') || 'Source link not provided'}<br>Source recorded ${dateLabel(record.source_recorded_at)}</p>${record.updated_at ? `<p>Last updated ${dateLabel(record.updated_at)}</p>` : ''}${record.is_demo ? '<p class="account-status" data-state="warning">Fictional verification record. This is not a real provider.</p>' : ''}`;
    element('#listingRevisions').innerHTML = revisionCards(account.revisions.filter(revision => revision.service_id === id), [record]);
    element('#listingWorkspace').hidden = false; setMessage('You can propose changes to this assigned listing. Published information stays in place while your update is reviewed.');
  } catch (error) { if (!disposed && current === generation && !signal.aborted) showError(error); }
  finally { if (current === generation) { busy = false; element<HTMLFieldSetElement>('#listingFields').disabled = false; updateDirty(); } }
}
form.addEventListener('input', updateDirty); form.addEventListener('change', updateDirty);
element('#addHours').addEventListener('click', () => { if (document.querySelectorAll('.account-hours-row').length >= 28) { setMessage('Use at most 28 opening periods.', 'error'); return; } hoursRow(); updateDirty(); });
form.addEventListener('submit', event => {
  event.preventDefault(); if (!listing || busy || conflicted) return;
  const values = currentValues(), previous = JSON.parse(savedValues) as ListingPatch, patch: ListingPatch = {};
  for (const key of Object.keys(values) as Array<keyof ListingPatch>) if (JSON.stringify(values[key]) !== JSON.stringify(previous[key])) Object.assign(patch,{[key]:values[key]});
  if (Object.hasOwn(patch,'latitude') || Object.hasOwn(patch,'longitude')) { patch.latitude = values.latitude; patch.longitude = values.longitude; }
  if (!Object.keys(patch).length) { setMessage('Make a change before submitting a proposal.'); return; }
  if (values.category_slugs?.length === 0) { setMessage('Choose at least one service category.', 'error'); return; }
  const current = generation;
  busy = true; save.disabled = true; element<HTMLFieldSetElement>('#listingFields').disabled = true; setMessage('Submitting your update for review…', 'loading');
  void apiRequest('org/listings/' + encodeURIComponent(id) + '/revisions', { method:'POST', body:JSON.stringify({expected_version:listing.version,expected_organization_version:listing.organization_version,expected_location_version:listing.location_version,patch}) }, true).then(async () => {
    if (disposed || current !== generation) return;
    busy = false; await load(); if (listing && !element('#listingWorkspace').hidden) setMessage('Your update is pending review. Published information has not changed.', 'success');
  }).catch(error => {
    if (disposed || current !== generation) return;
    if (error instanceof BackendError && error.status === 409) { conflicted = true; element('#conflictRecovery').hidden = false; }
    showError(error);
  }).finally(() => { if (current === generation) { busy = false; element<HTMLFieldSetElement>('#listingFields').disabled = false; updateDirty(); } });
});
element('#retryLoad').addEventListener('click', () => void load());
element('#reloadService').addEventListener('click', () => void load());
const unsubscribe = onAccountIdentityChange(signedIn => {
  if (disposed) return;
  generation++; controller?.abort(); busy = false; clearPrivate();
  if (signedIn) void load();
  else {
    setMessage('Your session ended. Sign in again to manage your listing.', 'warning');
    element('#staffSignIn').hidden = false;
  }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { disposed = true; generation++; controller?.abort(); clearPrivate(); unsubscribe(); });
void load();

window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
