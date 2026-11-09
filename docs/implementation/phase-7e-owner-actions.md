# Phase 7E — concrete owner actions

November 5, 2026. Production Phase 7A remains protected. **Read access, local work and this guide do not authorize hosted configuration, deployment, remote migration or purchase.** Approval must name exact target and action. No Git connection/push or production promotion is part of staging.

## Completed and recorded decisions

The owner granted exact Vercel team read access. Metadata-only inspection succeeded: eight Hobby projects, no Our Ground staging project; current production latest remains `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`, six Geoapify/Redis env names all production-only, no Auth/DB env, no custom environments, Our Ground not Git-linked. No env values were decrypted/pulled. The only subsequent hosted mutation was separately approved free staging-project creation. The canonical production link remains intact. Evidence: `/private/tmp/our-ground-7e/vercel-readonly-inventory.json`.

Local target/CSP guards, templates, enforced headers and bounded 013 retention/hold rules are implemented and tested; final aggregate evidence is in [Phase 7D.1](phase-7d1-search-refinement.md). The owner is interim privacy/deletion/incident operator and approved periods 90 days after correction resolution, 180 after claim/revision resolution preserving active/current/necessary verification, and 365 for audits except active investigation/legal holds. Initial owner maintenance is manual **dry-run/log verification only**. There is no operational public privacy email, destructive job or scheduler.

## 1. Approve only a concrete isolated target

Read-only inventory found no existing Our Ground staging project. The owner then **approved creation only**; root created free `ourground-staging` (`prj_eU9xRSetSQYTbkAce2cYIR5zx8c2`) in the exact owned team. Readback proves zero deployments/env variables, Vite, no Git connection and SSO protection; the automatic reserved `ourground-staging.vercel.app` domain did not move a production domain. Canonical production linking is unchanged. Evidence: `/private/tmp/our-ground-7e/staging-project-created.json`.

This does **not** approve deployment, environment settings or remote SQL. The new project's default Node 26.x must be changed to 24.x before any future deployment under separately approved configuration scope. Custom environments have zero current allowance; do not assume a paid upgrade. Owner confirmed no isolated Supabase/Google/Redis resources exist yet. Follow the [step-by-step free staging setup guide](phase-7e-staging-setup.md) to prepare a concrete configuration proposal without paid activation.

Identify separate owned Supabase/Auth/DB and Redis resources; no Supabase control is connected here. Do not send keys/passwords/connection URLs/OAuth secrets in chat. No additional account/project may bypass provider quotas. Before settings, migration or deployment, record:

- Exact dedicated Vercel project/team, Preview environment, stable HTTPS origin and protection settings.
- Isolated Supabase reference and production Auth baseline; separate Google Web client, exact Supabase callback and app `/auth/callback`.
- Restricted `our_ground_api` runtime and separate owner DB targets, verified TLS/hostname, no owner credential in runtime.
- Dedicated staging Redis endpoint/credentials. A label/prefix alone does not isolate current runtime keys.
- Dedicated Geoapify server/browser keys and exact staging referrer; all Geoapify services share 3,000 daily credits. Preserve existing server admission/free limits and account monitoring.
- Exact permitted config fields, additive migrations/public import scope and later build/deployment identity. Creation approval alone is not deployment or remote SQL approval.

Keep canonical production linking unchanged; use a separate authorized staging checkout. Inspect the new project's Git/protection/env inheritance rather than assuming production settings are inherited correctly.

## 2. Prepare private configuration and reviewable CSP

Use [staging-target.example.json](staging-target.example.json) and [staging-environment.example](staging-environment.example). The latter is for local owner/preflight use; **never bulk-import it into Vercel**. Only selected runtime/browser values belong in approved Preview scope. Migration-owner/maintenance values stay in private owner configuration, never `VITE_` or Vercel runtime. Do not change existing `.env.local` or inherit production credentials.

```sh
node --env-file=.env.staging.local scripts/render-staging-csp.mjs \
  --target /absolute/path/to/reviewed-staging-target.json \
  --output /absolute/path/to/new-reviewed-vercel-candidate.json
node --env-file=.env.staging.local scripts/staging-readiness.mjs \
  --target /absolute/path/to/reviewed-staging-target.json \
  --project-link /absolute/path/to/staging-checkout/.vercel/project.json \
  --vercel-config /absolute/path/to/new-reviewed-vercel-candidate.json \
  --build-dir /absolute/path/to/staging-checkout/dist
```

These commands prepare/check locally, make zero hosted requests and do not authorize deployment. Review exact Supabase host and self/Geoapify policy, use the candidate only in the separate approved checkout, and pass the exact resulting `dist` using `--build-dir`. Vite writes hashed public build configuration and actual assets; preflight rejects stale/changed/fixture output or mismatched Auth/CSP. The current actual build proof covers 70 assets. This evidence is not a signature or permission grant. Never deploy a stale bundle from a different Auth project. Run source/built secret scans without printing matched values. Local PASS still reports hosted isolation BLOCKED and no deployment authorization.

## 3. Verify real Auth and hosted boundaries after authorization

In the exact staging Supabase/Google projects, use only `openid email profile`, Google Web callback `https://<staging-project>.supabase.co/auth/v1/callback`, the approved app origin and exact app `/auth/callback`. Do not broaden wildcard redirects or change production Google settings. Google email identity is not organization authority; review organization access independently. Configure SMTP/OTP only if enabled and verify real delivery, wrong/expired codes and throttling before opening email onboarding.

Review migration journal/checksums before additive SQL. Runtime owns no protected objects and has no superuser/CREATEROLE/CREATEDB/BYPASSRLS; private schemas must not be exposed through Data API. Check Supabase Security Advisor and actual pooler identity/TLS. Browser `auth.uid()` is not presumed in direct SQL. Test independently authenticated ordinary/A/B/admin/revoked users, current membership/count isolation, pending/approved/rejected edits, retained-token revocation and logout/back/cache cleanup.

The ambient-env hosted Auth test rejected by automatic approval review was **not executed**. Do not retry it against an unproved target; select and privately configure the exact approved isolated service first. Actual hosted Auth remains BLOCKED.

## 4. Publish the missing privacy channel and prepare owner maintenance

Owner responsibility is established. Supply and test a **working public privacy/contact email or equivalent operated channel**; none is operational yet. Publish it in the notice without inventing an address/legal entity. Define a private incident escalation/recovery channel and verify legitimate request ownership without asking for passwords, OTPs or identity documents. Account onboarding/pilot remains closed until this works.

Owner-confirmed rules are implemented by additive 013, preserving frozen 007/012:

- Resolved corrections:90 days after `resolved_at`; open/missing/recent resolutions retained.
- Resolved claims/revisions:180 days after review. Inactive rejected records may be removed; inactive approved private evidence is minimized. Active membership/access, current approval evidence/public records, minimal review/version metadata and explicit necessary-evidence holds remain.
- Audits:365 days except active legal/investigation holds. Hold release requires matching original reason/case reference and an active administrator over the separate owner connection. No automatic expiry.

Owner-only `app_private.privacy_hold_set(reviewer,scope,target,reason,opaque_case_reference,false)` creates a hold; the same exact scope/target/reason/reference with the final argument true releases it after review. Scopes are global (`all`), subject, organization, service, correction, claim, revision and audit. Use only an opaque case identifier; do not store sensitive case narratives in logs. Hold operations are audited and serialized with retention. A related active hold makes verified-subject redaction fail closed; resolve exceptions through the owner before acting. Source confidentiality holds are a separate permanent publication boundary.

Initial pilot authorization covers this **dry-run example only**, after exact owner-target review:

```sh
node --env-file=.env.staging.local backend/manage-db.mjs retention \
  --batch-size 100 --total-limit 500
```

It requires 013, reports bounded metadata/counts/remaining flags and stops. It does not delete/redact or start a scheduler. Retain reviewed dry-run logs and confirm unresolved/current/held exclusions. Do not add `--apply`, run destructive jobs or enable a schedule without separate approval. Hypothetical future apply requires exact target, rollback/backup evidence, active administrator, bounded counts and a minimal maintenance audit. Verified-subject redaction/provider account deletion are separate reviewed owner actions.

Decide actual hosting/provider log and backup periods, access, restore target and incident/rotation procedure. Rehearse restore and scoped revocation/rotation only on the authorized staging stack. Provider JWT validity may outlive app logout; verify retained tokens cannot use protected operations. No backup/recovery claim is PASS until actually tested.

## 5. Separate final deployment and pilot decisions

After concrete isolated configuration, source and build are reviewable, seek exact staging deployment approval. Creation/read grants do not authorize deploy. Verify actual staged HTTPS/security/error/private-cache/referrer/CORS/full CSP against Auth/maps/details, shared Redis/two-instance/429/outage controls, real resident/giving/GPS/claim/review/A-versus-B/revocation journeys and manual privacy dry-run evidence. Bound synthetic workloads; do not stress providers or production.

**Limited pilot stays NO-GO** until real Auth, hosted isolation/TLS/Redis, deployed headers/CSP, operational privacy channel and recovery/retention verification pass. Search/local regression readiness is reported separately; neither authorizes AI work, public launch or production changes.

References: [Vercel environments](https://vercel.com/docs/deployments/environments), [env scoping](https://vercel.com/docs/environment-variables), [deployment protection](https://vercel.com/docs/deployment-protection), [Supabase security checklist](https://supabase.com/docs/guides/security/production-checklist), [current provider guide](phase-7d-provider-setup.md).
