import './styles.css';
import './account.css';
import { arrow, element, header, escapeHtml as esc } from './ui';
import { footer } from './navigation';
import { apiRequest, BackendError } from './api-client';
import { isSignInConfigured, onAccountIdentityChange } from './backend-client';
import { dateLabel, reviewBadge, safeLink, listingLabels, proposedValue } from './organization-ui';
import type { OrganizationAccount, OrganizationAdministration, OrganizationListing, OrganizationClaim, ListingRevision } from '../shared/organization-accounts';

document.title = 'Organization review — Our Ground';
element<HTMLDivElement>('#app').innerHTML = `<div class="page-shell">${header('account')}<main class="staff-main og-container account-admin" id="main" tabindex="-1">
  <a class="staff-back" href="/account">${arrow}Back to your account</a><div class="staff-intro"><span class="page-eyebrow">ADMINISTRATION</span><h1>A careful review.<br>A clearer directory.</h1><p>Review organization access and proposed listing updates. Decisions are recorded with your account and a timestamp.</p></div>
  <p id="adminStatus" class="account-status staff-status" role="status" aria-live="polite" data-state="loading">Checking administrator access…</p><div class="staff-recovery"><a class="secondary-button" href="/account">Your account</a><button type="button" class="secondary-button" id="refreshAdmin">Refresh review queue</button></div>
  <div id="adminWorkspace" hidden><nav class="account-section-nav" aria-label="Review sections"><a href="#claimsHeading">Access requests</a><a href="#revisionsHeading">Listing updates</a><a href="#membersHeading">Assigned access</a><a href="#auditHeading">Decision history</a></nav>
    <section class="account-records" aria-labelledby="claimsHeading"><h2 id="claimsHeading">Organization access requests</h2><p class="account-status">Check the applicant’s relationship to the exact organization and location. A matching domain alone does not establish authority. Approve only after selecting the corresponding sourced service record and recording the supporting source.</p><div id="adminClaims" class="account-card-list"></div></section>
    <section class="account-records" aria-labelledby="revisionsHeading"><h2 id="revisionsHeading">Proposed listing updates</h2><p class="account-status">Compare the proposed information with the current listing and its sources. Approval publishes the reviewed fields together.</p><div id="adminRevisions" class="account-card-list"></div></section>
    <section class="account-records" aria-labelledby="membersHeading"><h2 id="membersHeading">Assigned organization access</h2><div id="adminMemberships" class="account-card-list"></div><h3>Suspended access</h3><div id="adminSuspended" class="account-card-list"></div></section>
    <section class="account-records" aria-labelledby="auditHeading"><h2 id="auditHeading">Decision history</h2><div id="adminAudit"></div></section>
  </div></main>${footer()}</div>`;
const status = element<HTMLElement>('#adminStatus'), workspace = element('#adminWorkspace');
let accountId = '', generation = 0, controller: AbortController | null = null, disposed = false, submitting = false;
function setStatus(text: string, state = 'info') { status.textContent = text; status.dataset.state = state; }
function clearPrivate() { workspace.hidden = true; for (const id of ['adminClaims','adminRevisions','adminMemberships','adminSuspended','adminAudit']) element('#' + id).replaceChildren(); }
function listingOption(listing: OrganizationListing) {
  return `<option value="${esc(listing.id)}">${esc(listing.organization_name)} · ${esc(listing.site_name || listing.title)} · ${esc([listing.street_address,listing.city,listing.state,listing.postal_code].filter(Boolean).join(', '))} · ${esc(listing.id)}${listing.is_demo ? ' · fictional' : ''}</option>`;
}
function decisionFields() {
  return '<label>Decision<select name="decision"><option value="approved">Approve</option><option value="rejected">Reject</option></select></label><label>Reviewer’s note<textarea name="review_note" required minlength="5" maxlength="1000" rows="3"></textarea></label>';
}
function claimCard(claim: OrganizationClaim, listings: OrganizationListing[]) {
  const pending = claim.status === 'pending';
  return `<article class="account-request admin-review-card" data-claim-id="${esc(claim.id)}"><div class="account-request-heading"><h3>${esc(claim.organization_name)}</h3>${reviewBadge(claim.status)}</div><dl class="account-definition-list"><dt>Requested location</dt><dd>${esc(claim.location)}</dd><dt>Official website supplied</dt><dd>${safeLink(claim.website_url,claim.website_url || '') || 'Not provided'}</dd><dt>Applicant’s role</dt><dd>${esc(claim.applicant_role)}</dd><dt>Organization contact</dt><dd>${esc(claim.contact_email)}${claim.contact_phone ? '<br>' + esc(claim.contact_phone) : ''}</dd><dt>Applicant</dt><dd class="account-id">${esc(claim.user_id)}</dd><dt>Submitted</dt><dd>${dateLabel(claim.created_at)}</dd>${claim.explanation ? `<dt>Explanation</dt><dd>${esc(claim.explanation)}</dd>` : ''}</dl>
    ${claim.review_note ? `<p class="review-note">${esc(claim.review_note)}</p>` : ''}
    ${pending && claim.user_id === accountId ? '<p class="account-status" data-state="warning">Another administrator must review your own access request.</p>' : pending ? `<form class="record-form admin-decision-form" data-action="claim" data-request-id="${esc(claim.id)}">
      <label>Assign this exact sourced listing<select name="service_id" required><option value="">Choose an organization and location</option>${listings.map(listingOption).join('')}</select></label>
      <label>Supporting source URL<input name="source_url" type="url" required maxlength="500" placeholder="https://" /></label>
      ${decisionFields()}<p class="account-status admin-form-status" role="status" aria-live="polite"></p><button class="search-button" type="submit">Record access decision</button>
    </form>` : `<p class="account-record-meta">Reviewed ${dateLabel(claim.reviewed_at)}${claim.reviewer_id ? ' · Reviewer ' + esc(claim.reviewer_id) : ''}</p>`}
  </article>`;
}
function revisionCard(revision: ListingRevision, listings: OrganizationListing[]) {
  const listing = listings.find(item => item.id === revision.service_id), before = revision.current ?? revision.before_snapshot ?? listing;
  return `<article class="account-request admin-review-card" data-revision-id="${esc(revision.id)}"><div class="account-request-heading"><h3>${esc(listing?.title || before?.title || 'Listing update')}</h3>${reviewBadge(revision.status)}</div><p>${esc(listing?.organization_name || before?.organization_name || 'Assigned organization')}</p><p class="account-record-meta">Submitted ${dateLabel(revision.created_at)} · Applicant <span class="account-id">${esc(revision.user_id)}</span></p>
    <div class="account-comparison-wrap" role="region" aria-label="Current and proposed information" tabindex="0"><table class="account-comparison"><caption class="visually-hidden">Current and proposed listing information</caption><thead><tr><th scope="col">Field</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead><tbody>${Object.entries(revision.patch).map(([key,value]) => `<tr><th scope="row">${esc(listingLabels[key] || key)}</th><td>${esc(proposedValue(key,before?.[key as keyof OrganizationListing]))}</td><td>${esc(proposedValue(key,value))}</td></tr>`).join('')}</tbody></table></div>
    ${revision.review_note ? `<p class="review-note">${esc(revision.review_note)}</p>` : ''}
    ${revision.status === 'pending' && revision.user_id === accountId ? '<p class="account-status" data-state="warning">Another administrator must review your own update.</p>' : revision.status === 'pending' ? `<form class="record-form admin-decision-form" data-action="revision" data-request-id="${esc(revision.id)}">${decisionFields()}<p class="account-status admin-form-status" role="status" aria-live="polite"></p><button class="search-button" type="submit">Record listing decision</button></form>` : `<p class="account-record-meta">Reviewed ${dateLabel(revision.reviewed_at)}${revision.reviewer_id ? ' · Reviewer ' + esc(revision.reviewer_id) : ''}</p>`}
  </article>`;
}
function suspensionForm(type:'user'|'organization',id:string,suspended:boolean) {
  if(type==='user'&&id===accountId)return '';
  return `<form class="record-form admin-decision-form" data-action="suspend" data-target-type="${type}" data-target-id="${esc(id)}" data-suspended="${suspended}"><label>${suspended?'Reason for suspension':'Reason for restoring access'}<textarea name="review_note" required minlength="5" maxlength="1000" rows="2"></textarea></label><p class="account-status admin-form-status" role="status" aria-live="polite"></p><button class="secondary-button" type="submit">${suspended?'Suspend':'Restore'} ${type==='user'?'account':'organization'}</button></form>`;
}
async function refresh() {
  if (submitting) return;
  const current = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  clearPrivate(); setStatus('Checking administrator access and loading the review queue…', 'loading');
  try {
    if (!isSignInConfigured()) throw new BackendError(401,'UNAUTHENTICATED','Organization sign-in is not configured yet.');
    const [account, data] = await Promise.all([apiRequest<OrganizationAccount>('org/account',{signal},true), apiRequest<OrganizationAdministration>('org/admin',{signal},true)]);
    if (disposed || current !== generation) return;
    accountId = account.id;
    element('#adminClaims').innerHTML = data.claims.length ? [...data.claims].sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(claim => claimCard(claim,data.listings)).join('') : '<p class="account-status">No organization access requests.</p>';
    element('#adminRevisions').innerHTML = data.revisions.length ? [...data.revisions].sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(revision => revisionCard(revision,data.listings)).join('') : '<p class="account-status">No listing updates to review.</p>';
    element('#adminMemberships').innerHTML = data.memberships.length ? data.memberships.map(member => `<article class="account-request"><h3>${esc(member.organization_name || member.name || 'Assigned organization')}</h3><p class="account-id">User ${esc(member.user_id)}</p><p class="account-record-meta">${member.service_ids?.length ?? 1} assigned listing${member.service_ids?.length === 1 ? '' : 's'}</p><form class="record-form admin-decision-form" data-action="revoke" data-user-id="${esc(member.user_id)}" data-organization-id="${esc(member.organization_id)}"><label>Reason for revoking access<textarea name="review_note" required minlength="5" maxlength="1000" rows="2"></textarea></label><p class="account-status admin-form-status" role="status" aria-live="polite"></p><button class="secondary-button" type="submit">Revoke organization access</button></form>${suspensionForm('user',member.user_id,true)}${suspensionForm('organization',member.organization_id,true)}</article>`).join('') : '<p class="account-status">No assigned organization access.</p>';
    element('#adminSuspended').innerHTML = [...(data.suspended_users??[]).map(u=>`<article class="account-request"><h4>Suspended account</h4><p class="account-id">${esc(u.id)}</p>${suspensionForm('user',u.id,false)}</article>`),...(data.suspended_organizations??[]).map(o=>`<article class="account-request"><h4>${esc(o.name)}</h4>${suspensionForm('organization',o.id,false)}</article>`)].join('') || '<p class="account-status">No suspended accounts or organizations.</p>';
    element('#adminAudit').innerHTML = data.audit.length ? `<ol class="account-audit">${data.audit.map(event => `<li><strong>${esc(event.action.replaceAll('_',' ').replaceAll('.',' '))}</strong><span>${dateLabel(event.created_at)} · Reviewer <span class="account-id">${esc(event.actor_id)}</span> · ${esc(event.result??'allowed')} · Request <span class="account-id">${esc(event.request_id??'Not recorded')}</span></span></li>`).join('')}</ol>` : '<p class="account-status">No decisions recorded yet.</p>';
    workspace.hidden = false; setStatus('Administrator access confirmed. Review the submitted evidence before recording a decision.');
  } catch (error) { if (!disposed && current === generation && !signal.aborted) { clearPrivate(); setStatus(error instanceof Error ? error.message : 'The review queue could not be loaded.','error'); } }
}
workspace.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if (target.name !== 'decision') return;
  const form = target.closest('form')!;
  for (const name of ['service_id','source_url']) { const control = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null; if (control) control.required = target.value === 'approved'; }
});
workspace.addEventListener('submit', event => {
  event.preventDefault(); if (submitting) return;
  const form = event.target as HTMLFormElement, values = Object.fromEntries(new FormData(form).entries()), action = form.dataset.action, id = form.dataset.requestId;
  const body: Record<string,unknown> = { review_note: String(values.review_note ?? '').trim() };
  let path = '';
  if (action === 'claim' || action === 'revision') { body.decision = values.decision; path = 'org/admin/' + (action === 'claim' ? 'claims/' : 'revisions/') + encodeURIComponent(id!) + '/decision'; if (action === 'claim' && values.decision === 'approved') { body.service_id = values.service_id; body.source_url = String(values.source_url ?? '').trim(); } }
  else if(action==='suspend'){path='org/admin/suspend';body.target_type=form.dataset.targetType;body.target_id=form.dataset.targetId;body.suspended=form.dataset.suspended==='true';}
  else if (action === 'revoke') { path = 'org/admin/revoke'; body.user_id = form.dataset.userId; body.organization_id = form.dataset.organizationId; }
  else return;
  const current = generation, message = form.querySelector<HTMLElement>('.admin-form-status')!, button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitting = true; button.disabled = true; message.textContent = 'Recording your decision…'; message.dataset.state = 'loading';
  void apiRequest(path,{method:'POST',body:JSON.stringify(body)},true).then(async () => { if (disposed || current !== generation) return; submitting = false; await refresh(); if (!workspace.hidden) setStatus(action === 'revoke' ? 'Organization access was revoked. The decision is recorded.' : 'Your review decision was recorded.','success'); }).catch(error => {
    if (disposed || current !== generation) return;
    message.textContent = error instanceof Error ? error.message : 'The decision could not be saved.'; message.dataset.state = 'error';
    if (error instanceof BackendError && [401,403].includes(error.status)) { clearPrivate(); setStatus('Your administrator access could not be confirmed. Return to your account and sign in again.','error'); }
  }).finally(() => { submitting = false; button.disabled = false; });
});
element('#refreshAdmin').addEventListener('click', () => void refresh());
const unsubscribe = onAccountIdentityChange(signedIn => {
  if (disposed) return;
  generation++; controller?.abort(); submitting = false; clearPrivate();
  if (signedIn) void refresh();
  else setStatus('Your session ended. Sign in again to review requests.', 'warning');
});
window.addEventListener('pagehide', () => { disposed = true; generation++; controller?.abort(); clearPrivate(); unsubscribe(); });
void refresh();

window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
