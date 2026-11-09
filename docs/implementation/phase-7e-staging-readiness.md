# Phase 7E — isolated staging readiness

November 5, 2026. **Real staging: BLOCKED. Limited pilot: NO-GO.** Search/local regression results are separate gates, recorded in [Phase 7D.1](phase-7d1-search-refinement.md). Production remains the protected Phase 7A release. The only hosted mutation separately authorized and completed was free staging-project creation. No deployment, hosted migration or provider-setting change is authorized by this report.

## Actual read-only inventory

The audit read the six required Phase 7C/7D reports and current target/Auth/TLS/admission/privacy/CSP code. Initial Vercel access returned 403. The owner subsequently granted the exact team read access; metadata-only inventory succeeded. Secret values were not pulled, decrypted or printed.

| Resource | Actual evidence | Staging conclusion |
| --- | --- | --- |
| Vercel team/projects | Owned team `team_7zBDrVIlwYth2sXkAbBPcbYw` / `penuels-projects-aa802b06`, Hobby plan, initial eight projects. After separate exact approval, free `ourground-staging` was created as `prj_eU9xRSetSQYTbkAce2cYIR5zx8c2`. | **PASS for inventory/project creation; actual staging BLOCKED.** Readback has zero deployments/env variables, no Git connection, Vite and SSO protection. Default Node 26.x must be changed to approved 24.x before future deployment; that configuration/deployment is not yet authorized. Custom-environment allowance is zero; no upgrade assumed. |
| Existing production | `ourground`, `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`; latest READY production deployment remains `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`. Canonical checkout remains linked to it. | Protected production target; never use as staging or relink the canonical checkout. |
| Git/deploy triggers | Local Git has no remote or workflows; source disables Git deployment. Read-only remote Git context lists three linked projects, excluding Our Ground. | No Our Ground Git integration was found; no push or connection change occurred. A future new staging project's settings must be inspected separately. |
| Vercel env scopes/protection | Six Geoapify/Upstash variable names, all production-only; zero hidden production env entries, no Auth/DB variables, no custom environments. Existing project has Vercel SSO protection for non-custom domains; password protection is disabled. | Metadata is not credential access or staging configuration. Review protection on the future exact staged origin without disabling essential protections or broadening production. |
| Supabase/Auth/hosted DB | No connected Supabase control; project references, Auth keys and runtime/owner URLs absent from current local configuration and production env metadata. Disposable loopback databases are local fixtures. | No proved isolated Auth/DB target, actual Google login, hosted TLS/roles or tenant proof. **BLOCKED.** |
| Redis | Existing local/server values are protected production-linked inputs. Earlier temporary-prefix hosted algorithm verification was not an isolated staging stack. | Separate verified endpoint/credentials required. Namespace labels alone cannot isolate the current runtime keys. **BLOCKED.** |
| Geoapify | Separate current browser/server keys and bounded local real-provider evidence exist. | Dedicated staged keys/referrer and a reviewed shared-account allowance remain required; existing keys must not silently be reused as staging credentials. All services share the 3,000-credit daily allowance; backend limits are not an account-wide cap. |
| Privacy operations | Owner is the interim privacy/deletion/incident operator. No operational public privacy email/channel has been supplied. Owner approved resolution-based periods and initial owner-run dry-run/log verification. | Operator decision is recorded; contact, actual hosted operation and recovery remain **BLOCKED**. No destructive job or schedule is active. |

Sanitized read-only evidence: `/private/tmp/our-ground-7e/vercel-readonly-inventory.json`, timestamp `2026-11-06T00:30:59.902Z` (November 5 local), zero mutation calls. No pre-existing isolated candidate was found. The owner separately approved free Vercel-project creation only; root created/read back the exact staging project above, automatic reserved `ourground-staging.vercel.app` domain, zero deployments/env and no production-domain move. Evidence: `/private/tmp/our-ground-7e/staging-project-created.json`. Owner confirmed no isolated Supabase/Google/Redis exists yet, so this empty project is not a working isolated stack. Select exact Auth/DB/Redis identities and approve precise configuration/remote SQL/deployment separately. No purchase, deployment or remote SQL follows from creation/read access. Follow the [free staging setup guide](phase-7e-staging-setup.md).

## Implemented local guard and configuration

- [staging-readiness.mjs](../../scripts/staging-readiness.mjs) performs zero-network target/credential separation checks: protected production rejection, exact project/team/origin, matching Auth and restricted DB roles, TLS requirements, dedicated Redis/provider keys, no fixtures/private browser aliases, provider limits and generated CSP agreement. It returns `hosted_isolation: BLOCKED` and `deployment_authorized_by_check: false` even after local PASS.
- [staging-target.example.json](staging-target.example.json) records exact reviewed identities/approval without secrets; its placeholders deliberately fail closed.
- [staging-environment.example](staging-environment.example) is a local owner/preflight template, never a bulk Vercel import. Migration-owner/maintenance values stay local; only selected runtime values belong in the approved Preview environment. Existing `.env.local` values were preserved.
- [render-staging-csp.mjs](../../scripts/render-staging-csp.mjs) produces a separate nonsecret exact-host Vercel candidate and refuses root-template/existing-output overwrite. The committed `vercel.json` permits no unconfigured Auth host. A future approved staging checkout must use its reviewed candidate and matching actual build, not a stale bundle.

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

These are local preparation examples, not hosted authorization. Matching declarations are not proof of real ownership, hosted ACLs/TLS or deployed isolation. Vite now emits `ourground-build-evidence.json` after writing the bundle, fingerprinting public build configuration and actual assets. Preflight requires the selected `--build-dir` to match those fingerprints and exact Auth/CSP settings, rejecting stale/changed/fixture output. The actual current build proof passed for 70 assets. This guards accidental stale output; it is not a signature, ownership proof or permission grant. Final aggregate checks belong in the current handoff.

The full resource CSP is enforced locally: self assets/workers, two exact Geoapify hosts and only a validated configured exact Supabase host. No production inline/eval/wasm exception, wildcard Supabase or legacy Google/Mapbox host remains. Actual compiled fixtures passed under the response policy with no provider requests or JavaScript/CSP errors; actual hosted Auth/HTTPS headers remain BLOCKED.

## Retention and remaining release gates

Additive 012 bounded maintenance and additive 013 resolution-age/preservation-hold rules preserve frozen 007/011/012 and historical public resource data. Latest rollback-only physical tests pass **21/21**: eight bounded checks plus thirteen resolution/hold checks, including associated audit evidence, active/current verification, superseded approved private-history minimization and all relevant role denials. The owner CLI requires 013 for retention and subject redaction; it cannot silently fall back to obsolete rules. 013 was schema-applied only to new local `ourground_7d1`, with journal hashes and HRSA counts preserved; no maintenance/destructive job ran. Its frozen SHA-256 is `92dda438a34a8a21604f2024361b061dc690a8973ac7e2d1f52b7d433451f0bf`. See [security verification](phase-7e-security-verification.md) for exact policy/evidence and [owner actions](phase-7e-owner-actions.md) for decisions.

After exact owner authorization, separately verify real Google/Supabase ordinary/A/B/admin/revoked accounts, SMTP if enabled, hosted restricted roles/private Data API/TLS/advisors, actual isolated Redis/two-instance/outage controls, HTTPS/CSP/cache/referrer/CORS, bounded owner dry-run logs, backup/restore/recovery and operated privacy contact. Do not substitute local fixtures or historical shared-service tests for those gates. No production alias/domain/DB/environment change, Git connection/push or promotion is permitted.
