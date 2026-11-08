# Staging Google authentication follow-through · November 8, 2026

**Real Google authentication passed.** The registered Google OAuth test user completed Google's real account selection and basic identity consent in Chrome, returned via staging Supabase and `/auth/callback`, and reached the authenticated `/account` workspace. The callback query was cleared. No synthetic provider, mocked token exchange or injected session was used for these results.

Deployed source: `86cd4eece01ba8252c28c151af3e73a8f063dfca`, branch `codex/eden-ux-recovery-20261108`.

- [Protected staging](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) — the exact OAuth-allowed browser origin.
- [Immutable deployment](https://ourground-staging-nj5lvttm7-penuels-projects-aa802b06.vercel.app), deployment `dpl_CJ9seYiCGuQMfAcGL7D52vgZz58S`.
- Production remains `dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq`, source `33574bd80666d67a26a0765bf42a72fa5627fc7f`. PR #3 remains open and unmerged.

## Configuration and deployment

The owner enabled Google on the staging Supabase project, registered the test account, configured the exact staging Site URL and `/auth/callback`, and enabled `VITE_GOOGLE_AUTH_ENABLED` in Preview. The Supabase URL allowlist and registered test user were independently observed in the owner's existing dashboard session. The actual Auth service returned HTTP 200 settings with Google enabled and accepted the existing publishable key.

Vercel still lacked three necessary values. The existing staging publishable key from the project's API Keys page was configured as matching `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`; `VITE_SUPABASE_URL` was set to the matching staging project. These values target **Preview / `codex/eden-ux-recovery-20261108` only**. No secret key, service role, Google credential or production setting was copied or changed. Exact browser/server account-origin allowlists already included the protected staging alias.

A clean checkout of the intended source was rebuilt after pulling the updated branch environment. Build, both TypeScript checks, source/config checks and built-bundle secret scanning passed. All 128 asset hashes and the deployed source manifest were checked; `browser_auth_enabled:true`. Anonymous requests still redirect to Vercel authentication. [Deployment receipt](eden-recovery-images/auth-followthrough/deployment.json) · [Provider receipt](eden-recovery-images/auth-followthrough/provider-settings.json).

## Test results

| Test | Result | Actual evidence |
|---|---|---|
| Staging project and matching publishable keys | **PASS** | Matching staging URL and browser/server key; accepted by the real Auth service. No values retained in the evidence. |
| Redeploy with current Preview environment | **PASS** | Exact source manifest, auth enabled, 128 verified assets, protected staging alias assigned to the new Preview deployment. |
| Google button and OAuth redirect | **PASS** | Continue with Google appeared on `/account`; actual Google chooser used the correct staging Supabase callback. |
| Real authentication and PKCE callback | **PASS** | Registered test user's real Google identity consent returned to authenticated `/account`; callback query cleared. [Signed-in screenshot](eden-recovery-images/auth-followthrough/real-google-signed-in.jpg). |
| Reload and second-tab persistence | **PASS** | Reload and a newly opened second tab each showed the real signed-in unassigned account. |
| Unassigned organization restrictions | **PASS** | No assigned listings appeared. The known HHC source listing's `/staff/services/<id>` editor was denied, with no protected record exposed. `/account/administration` also denied access and exposed no review queue. [Listing denial](eden-recovery-images/auth-followthrough/unassigned-listing-denied.jpg) · [Administrator denial](eden-recovery-images/auth-followthrough/unassigned-admin-denied.jpg). |
| Logout and cross-tab clearing | **PASS** | Signing out in the second tab cleared both workspaces. The first tab reported its session ended; reload still required Google sign-in. [Session-ended screenshot](eden-recovery-images/auth-followthrough/cross-tab-session-ended.jpg). |
| Anonymous organization APIs | **PASS** | Real `/org/me`, `/org/listings` and `/org/administration/requests` returned HTTP 401 `UNAUTHENTICATED`; `/org/status` now returns configured true. [API receipt](eden-recovery-images/auth-followthrough/unauthenticated-authorization.json). |
| Existing assigned account permissions | **BLOCKED** | The read-only staging audit found zero active approved listing assignments, assigned representatives or application administrators. There is no assigned test account available to exercise. No account was promoted and no assignment or claim was fabricated. [Database audit](eden-recovery-images/auth-followthrough/organization-assignments.json). |
| Automatic refresh after real token expiry | **BLOCKED / not exercised** | The real session did not expire during this run. Reload persistence is verified; the earlier SDK refresh tests with a synthetic provider are not a live expiry test. |
| Eden real Gemini and public page actions | **PASS** | All three suites passed on this exact source manifest. The six context cases, greeting, donor/organization routes, actual HRSA listing follow-up, food/healthcare, 25-mile radius, result focus, map/list controls, New chat and restored state passed. Aoede returned HTTP 200 `audio/wav`; playback started and Stop ended it. No browser errors. [Runner](eden-recovery-images/auth-followthrough/run.json) · [Context](eden-recovery-images/auth-followthrough/gemini-context.json) · [Gemini/speech](eden-recovery-images/auth-followthrough/gemini.json) · [Controls](eden-recovery-images/auth-followthrough/staging-smoke.json). |

[Full real-authentication receipt](eden-recovery-images/auth-followthrough/real-authentication.json). Screenshots omit private identity, tokens and authorization codes. The test did not submit organization claims or modify listings.

The remaining assigned-permission test needs an owner-reviewed staging representative assigned to a specific listing through the audited onboarding path. Because staging has no active application administrator, an owner must first establish the intended reviewer through the explicit administrator bootstrap process, then approve that representative and listing assignment. A test account must not self-promote. No further browser participation is needed for the unassigned Google flow already verified above.

The immutable hostname displayed the expected map-unavailable fallback because it is outside the provider's permitted origins. This follow-through verifies its map/list controls; it does not claim fresh tile rendering on that hostname. The stable alias retains its map-authorized origin.
