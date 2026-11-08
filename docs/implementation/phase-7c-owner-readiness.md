# Phase 7C — Owner setup and pilot readiness

November 5, 2026. **Pilot decision: NO-GO until the live-service and operational gates below pass.** Production remains on the deployed Phase 7A release. Phase 7C is local implementation and verification; no production deployment, environment change or owner migration is authorized by this guide.

Read the [security implementation and verification report](phase-7c-security-hardening.md) for final test totals, evidence, unresolved risks and the full adversarial matrix. Local PostgreSQL/Redis tests and the synthetic browser workflow do not establish live Google/Supabase verification. The Phase 7C private browser journey passed locally, including review, cross-tenant denial, stored-text escaping, suspension, revocation, keyboard/mobile behavior and logout/history clearing. Public map regression evidence is finalized in the companion report.

## 1. Select the development target and keep credentials separate

Use the existing team-owned development Supabase project. Do not infer a project from a password or point development tools at production. Use Node **24.22.1** from the canonical checkout:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/Documents/Projects/our-ground`

Merge required values into ignored `.env.local` without replacing existing Geoapify/Redis configuration. Never paste real keys, connection URLs, tokens or passwords into chat, screenshots or documentation.

| Configuration | Purpose and boundary |
|---|---|
| `SUPABASE_DEV_PROJECT_REF` | Exact owner-selected development project reference; migration tools verify the Auth URL and database target against it. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Server verification against that project's canonical HTTPS Supabase endpoint and public publishable key. No service-role key is required. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | The same public project values for the browser. A publishable key is intentionally public and grants no organization authority. |
| `MIGRATION_DATABASE_URL` | Owner-only direct/session-pooler connection, used only by reviewed local maintenance tools. |
| `DATABASE_URL` | Separate runtime connection using `our_ground_api` (or Supabase pooler username `our_ground_api.<project-ref>`). Never reuse the migration-owner connection. |
| `DATABASE_SSL_CA` | Optional owner-selected database CA certificate if required. Remote connections verify the chain and configured hostname; do not disable verification. |
| `ACCOUNT_ALLOWED_ORIGINS`, `VITE_ACCOUNT_ALLOWED_ORIGINS` | Exact app origins. Start with `http://127.0.0.1:18418`; paths, wildcard origins and arbitrary redirects are rejected. |
| `VITE_GOOGLE_AUTH_ENABLED` | Keep `false` until the owned Google/Supabase provider and exact callback are verified. |
| `ACCOUNT_EMAIL_AUTH_ENABLED` | Keep `false` until the intended email provider/templates/sender and real delivery have been verified. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Existing server-only shared abuse controls. No Redis value belongs under a `VITE_` name. |
| `VITE_PRIVACY_CONTACT_EMAIL` | An operated public privacy channel, with a responsible person and request procedure. Do not use an invented or unattended address. |

Keep `BACKEND_DATA_MODE=postgres` and `ALLOW_DEMO_DATA=false` for live verification. Local fixture flags/keys, loopback Auth URLs, `.invalid` identities and fixed-code authentication are rejected by production paths. Never copy the local synthetic preview settings into Vercel. Production authentication/custom Auth domains are not enabled merely by changing a flag.

## 2. Configure real Supabase and Google sign-in

In the selected development project, use these exact local app settings:

- App origin/Site URL: `http://127.0.0.1:18418`
- App callback allowlist: `http://127.0.0.1:18418/auth/callback`
- Google OAuth redirect URI: copy the selected Supabase provider callback, normally `https://<project-ref>.supabase.co/auth/v1/callback`. This is different from the app callback.

Configure the owned Google **Web application** client in Supabase. If the Google client is in testing, explicitly authorize all owned accounts used for verification, including the two organization accounts and the distinct reviewer. Use identity scopes only: **`openid email profile`**. Do not add Drive, Gmail, Calendar or other Google data permissions. If a console requires an app origin, use only the selected exact origin. Do not add `*.vercel.app`.

The application uses supported Supabase PKCE, a locally initiated fresh callback state, a fixed return to Account and supported server `getUser(token)` verification. It discards Google provider access/refresh credentials from persisted browser sessions. A verified email or Google login grants no organization membership. Real callback, consent and account settings remain **BLOCKED** until tested in this project.

For email sign-in, enable the Supabase Email provider and configure the sender/SMTP service appropriate to the intended pilot. Configure the templates used for both first-time and returning email sign-in to display **`{{ .Token }}`** rather than a credential-bearing link, then verify both flows. Keep resend, expiry and verification-attempt limits enabled at Supabase; code verification uses the provider directly. Default development-sender restrictions may prevent delivery to public pilot addresses, so testing only a team address is insufficient. Do not enable `ACCOUNT_EMAIL_AUTH_ENABLED` until delivery and one-time/expired/wrong-code behavior pass. No paid email service has been purchased or activated by this work.

## 3. Review migrations and verify the runtime role

Review migrations [006](../../backend/migrations/006_security_boundary.sql) and [007](../../backend/migrations/007_privacy_retention.sql) with the earlier migrations and the companion report. They remove broad private-table access, use published public projections and trusted scoped operations, add suspension/correlated audit, and provide owner-only retention/redaction. Original migrations were not replaced.

The runtime role must own no protected table/view and have no superuser, role-creation, database-creation or BYPASSRLS authority. Browser roles must have no private schema/table/function access. The server supplies the verified identity only within the scoped transaction-local operation. This boundary does **not** protect against theft of runtime database credentials; protect and rotate those credentials independently.

After separately reviewing and approving the **development** migration:

```sh
npm run check:setup
npm run db:status
npm run db:migrate -- --apply
npm run db:verify
```

The tools enforce explicit project targeting, verified TLS, a migration lock and recorded checksums. They do not relocate PostGIS, reset tables or silently import providers. Optional fictional seeds require a separate explicit flag and must not appear in ordinary public search.

In Supabase, keep `app_private` and `our_ground_meta` outside Data API exposed schemas. Since application data uses direct SQL, evaluate disabling the unused Data API while preserving Auth; verify the selected project's settings rather than assume the toggle is already correct. Review Supabase Security Advisors and resolve relevant exposed-schema/grant/function findings. `auth.uid()` is not assumed to identify the caller of an independent SQL connection.

Bootstrap only an explicitly selected, existing, confirmed Auth identity:

```sh
npm run db:bootstrap-admin -- \
  --user '<exact confirmed Auth user UUID>' \
  --email '<that confirmed account email>' \
  --confirm-admin
```

No first-user promotion or browser administrator-registration control exists. The old direct editor grant is disabled.

## 4. Verify organization authority independently

For each claim:

1. Locate the organization and exact site in trusted existing directory/source records. Do not approve based on a similar name or claim-supplied URL/contact alone.
2. Independently open the established official website or another trusted source and record its location and contact source. Confirm that the selected service UUID belongs to that exact organization/site.
3. With the applicant's participation, verify the claimed role through an independently sourced organization channel. A matching email domain is supporting evidence only. Do not request identity documents or resident information.
4. A different authorized administrator records the supporting URL and review note, then selects the exact listing. Separate locations and legitimate multiple memberships require separate reviewed associations.
5. Reject or leave unresolved claims pending when authority cannot be established. An unlisted organization needs an independently reviewed directory record before association; this phase does not ingest arbitrary providers.
6. Recheck affiliation after staff changes. Revoke the affected organization membership on offboarding. Suspend an account for account-level concerns, or the organization for an organization-level hold, using the recorded administrative action. Verify denial with the existing still-valid token.

## 5. Verify shared abuse controls and privacy operations

Current fixed-window application thresholds are separate from the existing Geoapify allowance:

| Surface | Shared threshold |
|---|---|
| Anonymous correction reports | 3 per normalized network bucket/hour; 100 globally/day |
| Legacy costly location resolution | 6 per network bucket/minute; 100 globally/day |
| Public directory reads/details | 120 per network bucket/minute |
| Private authentication verification entry points | 30 per network bucket/minute |
| Logout verification | Separate 60 per network bucket/minute, so ordinary auth throttling does not consume its allowance |
| Email starts | 3 per email/hour and 10 per client/hour in PostgreSQL |
| Claim submissions | 3 per authenticated user/day |
| Revision submissions | 20 per authenticated user/hour |
| Sensitive account/administrator mutations | Shared 60 per authenticated user/hour bound in addition to action-specific limits |
| Geoapify server requests | Existing independent **200/day** ceiling remains in force |

Production costly/state-changing paths fail closed when required shared controls are missing. Verify two independent server instances, outage behavior, 429/Retry-After and global-before-client admission against the actual selected hosted service. Vercel's trusted overwritten network header is normalized; arbitrary `X-Forwarded-For` is not authority. No bot challenge or account requirement has been added to ordinary resident discovery. Do not reset counters or raise limits to make a test pass.

Publish and test the privacy channel. Verify account ownership through trusted account information before a deletion request; do not solicit sign-in codes, passwords or identity documents. The request reviewer must be a different active administrator. For anonymous correction requests, use the report identifier where available; correction forms are not account-deletion channels.

Owner-only commands default to dry-run and remain development-target guarded. These commands verify the selected development environment; a future production maintenance process needs its own reviewed authorization, not relabelling production as a development project:

```sh
node --env-file=.env.local backend/manage-db.mjs retention
node --env-file=.env.local backend/manage-db.mjs retention \
  --reviewer '<active administrator UUID>' --apply

node --env-file=.env.local backend/manage-db.mjs redact-subject \
  --user '<independently verified subject UUID>' \
  --reviewer '<different active administrator UUID>' --verified-request
# Add --apply only after reviewing the dry-run result and authorization.
```

Policy: correction reports are deleted after 90 days; rejected claims and rejected revisions after 180 days; approved-claim contact/explanation fields are minimized after 180 days while preserving bindings; audit records are retained for 365 days. Unresolved pending claims are not automatically age-purged. Subject redaction suspends/revokes and resolves pending proposals so minimized text cannot later publish. Minimal UUID/audit identity and permanent revoked-session hashes are retained for integrity and authorization. Supabase Auth account deletion is a separate verified owner action.

No automated retention schedule is installed or verified. Assign an owner to run/review the procedure and check its audit outcomes. Ordinary runtime/browser roles cannot run maintenance or erase audits.

## 6. Required real-service acceptance and release decision

Use **at least two independently authenticated owned accounts**, one assigned to Organization A and one to Organization B, plus the distinct reviewer. Exercise:

- Ordinary login grants no listing authority; pending/self-approved/forged requests cannot grant it.
- A cannot read or change B's listing, pending proposal or private collection; B cannot read A's. Approve both organizations for one account and confirm only those two associations are accessible.
- Review changes, verify pending data stays unpublished, then approve/reject and check the audit actor, target, outcome and request correlation.
- Revoke/suspend while retaining the original token; the next protected read/write must fail. Logout/back navigation must not reveal cached private content.
- Confirm real PKCE callback rejection/tampering, expiry, unsupported redirect rejection, generic provider failures, and provider credential removal from persisted session data.
- Verify private no-store/no-referrer, HTTPS/HSTS, frame/object restrictions and CORS on an authorized staged build. Resource CSP remains report-only until actual Auth/maps traffic has been reviewed; do not claim full CSP enforcement.
- Verify resident search, donor/giving links, maps, details, photographs, favicon, mobile layout and keyboard paths against that exact build. Record provider use separately and preserve limits.

Final aggregate test/build counts and public-map status belong in the companion report. Local browser private-flow PASS is not a substitute for these real-service checks. Production/header changes require a separately approved release of the tested build. **Until all required live, privacy, abuse and hosting gates pass, keep the public account pilot closed and leave Phase 7A production untouched.**

## 7. Rotation and incident handling

Preserve a minimal access-controlled timeline and request IDs, not tokens or unnecessary report/claim contents. Suspend/revoke affected access and provider refresh sessions; verify denial rather than assume provider JWTs disappear immediately. For a leaked server credential, rotate it at the provider, update only the approved server environment, preserve runtime/owner role separation and certificate verification, and verify the old credential no longer works. Rotate Redis credentials without resetting provider counters. Public publishable keys are not administrator secrets.

Review repository history and the exposure path with the owner, then rerun `npm run check:secrets`, `npm run check:secrets:staged` and `npm run check:secrets:build`. Removing a value from the latest file does not remove it from history. Monitor safe audit-failure events and investigate missing audit persistence before onboarding resumes.

Current references: [Supabase production checklist](https://supabase.com/docs/guides/security/production-checklist), [Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Security Advisors](https://supabase.com/docs/guides/observability/advisors), [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
