# Our Ground — final staging qualification, November 9

**Historical qualification snapshot.** The owner subsequently reported successful physical Chrome multi-turn Live acceptance. The [neutral visual-release report](eden-neutral-palette.md) contains the updated acceptance and current production decision. The failed call and its original evidence below are retained unchanged.

**Decision: NO-GO for production.** The scoped UI, location and admission changes are implemented and deployed. The final real Live acceptance failed on the second spoken request, before any tool call. That failure is preserved below; continuous voice and physical pronunciation are not passed.

## Exact release identity

- Runtime source: `08b1685d42b4ec6285433f7d84a5f20aec3c194a` — [18 changed implementation/test files](https://github.com/iampenuel/our-ground/commit/08b1685d42b4ec6285433f7d84a5f20aec3c194a).
- Deployment: `dpl_7hMstZkryTKiKGXm2RjhCPDZYRHd`, [immutable protected candidate](https://ourground-staging-c87obfk6q-penuels-projects-aa802b06.vercel.app).
- [Protected owner-test alias](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) serves the same SHA. [All136 deployed asset hashes match](eden-live-action-evidence/deployment-08b1685.json); fixture mode is false. Anonymous requests remain behind Vercel protection.
- Branch `codex/eden-ux-recovery-20261108`, PR#3 remains open/draft/unmerged. Subsequent verification-only commits contain browser harness refinements and this report; they do not change deployed application code. The final delivery states that separate PR HEAD.
- Production remains deployment `dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq`, [rechecked read-only](eden-call-evidence/final-production-baseline.json). Its previously audited SHA is `33574bd80666d67a26a0765bf42a72fa5627fc7f`; the latest CLI inspection independently confirms deployment ID but does not expose a SHA. No production setting, deployment, billing or key was changed.

## Implemented and passing

The source changes restore the launcher invitation, add one-shot entrance and page-load-only dismissal, and improve admission/reset/expiry messaging. Existing nationwide parsing, city-coordinate enrichment, grounded replies, action deduplication, Aoede pronunciation instructions and interruption receipts are preserved.

| Area | Result and evidence |
|---|---|
| Geoapify configuration | **PASS.** The owner-authorized existing server key is a sensitive secret on **Preview only, exact recovery branch**. Both separate location flags are enabled. [Redacted Vercel scope metadata](eden-call-evidence/final-preview-env-scope.json). Hosted requests now use verified urban city centers. No server key is a VITE value. Provider-account plan/restrictions were not independently changed or certified by a successful request. |
| Automated checks | **PASS813/813**, none skipped; both typechecks and Preview build pass. Staged18-file, isolated984-file source and1058-file build secret scans report zero findings. [Receipt](eden-call-evidence/final-automated.json). The final full suite replaced one timing-sensitive permission fixture with a controlled clock. |
| Responsive/accessibility | **PASS**, five widths including320px,13 axe scans, zero violations/page errors. Header/hero/community gutters align and keyboard Home works. [Layout](eden-call-evidence/final-layout.json). |
| Actual Chrome200% | **PASS on exact compiled protected build**: zoom2,720CSSpx,dpr4, gutters30/30/30; invitation and EDEN labels visible; six arrow-tip landings, one fixture search and correct details, no Gemini calls. Compiled executor chunk hash verified. [Receipt](eden-call-evidence/final-actual-zoom.json). |
| Launcher invitation | **PASS** at desktop/mobile/reduced motion. Approved copy and Click to chat; X is memory-only for this page load; refresh restores it; opening hides/closing restores unless dismissed; SPA navigation preserves state without replay. Launcher300ms, bubble180ms after160ms (340ms total); reduced motion static. No automatic focus, chat, microphone or audio. [Receipt](eden-call-evidence/final-launcher.json). |
| Cursor/action lifecycle | **PASS local regressions and hosted fixtures.** Function-ID and per-user-turn semantic dedup reuse verified results while page state matches; new deliberate user turns may repeat. Superseded visual work and stale hide/scroll timers are canceled. ReactDrops clickEffect is disabled and custom agent-target green outlines removed. Near-black labeled pointer, subtle press, pointer transparency and keyboard focus remain. The animation never invokes native clicks. [200% proof](eden-call-evidence/final-actual-zoom.json), [prior focused UI proof](eden-call-evidence/stabilization-focused-ui.json). |
| Genuine Gemini text | **PASS**, one final San Francisco request: plan/result200, providerGemini/model`gemini-3.5-flash-lite`, one directory operation,142 matches within10miles/first20 displayed, source-quality disclosure. [Receipt](eden-call-evidence/final-real-text.json). Earlier genuine Harrisburg→Lanham→first-result and corrected Berkeley results remain separately recorded, not relabeled as new tests. |
| Live local/browser fixtures | **PASS**. Tests cover sequential turns, matched tool responses, cancellation/interruption, continuation receipts, dedup and cleanup. Three compiled-browser fixture cycles cover microphone/player release, silent-caption failure, advancing PCM graph and deliberate restart. **No Google call** in these cycles. [Receipt](eden-call-evidence/final-live-fixtures.json). |
| Google/auth security | **PASS limited current smoke**: visible Google button, actual Google chooser, staging Supabase authorize, canonical `/auth/callback`, PKCE, private/no-store account, anonymous data401; no foreign CORS grant. [Receipt](eden-call-evidence/08b1685-auth.json), [HTTP](eden-call-evidence/final-http.json). Earlier real Google sign-in, reload, second-tab persistence and cross-tab logout are documented in the [real identity test](eden-auth-recovery-2026-11-08.md). The later56.8-minute refresh is supported by [database timing](eden-call-evidence/staging-refresh-audit.json) and [post-refresh requests/denials](eden-call-evidence/refreshed-account-requests.json). Current chooser checks do not replace actual account testing. |

CI initially failed in the older `eden-recovery-browser` transport fixture because it omitted the now-required `country:'US'`. The fixture was corrected; all four CI browser suites then passed locally: responsive resident/donor/organization journeys, Eden commands, pointer actions and synthetic OAuth/session/logout. This correction changes no application code. The final delivery reports the separately re-run GitHub checks rather than treating the earlier CI failure as a product/provider failure.

### Nationwide manual/Eden matrix

**All11 manual cases and all11 Eden cases PASS** against the actual protected geocoder and directory. Gemini decisions in this matrix are explicit fixtures; actual model inference is verified separately above. Both entrypoints use identical coordinates, category/radius and canonical location. Each resolved Eden command issues one directory request. No fabricated coordinates or resources are used. Counts below are displayed rows at5miles, capped20.

| Input | Manual | Eden | Result |
|---|---|---|---|
| Lanham, Maryland | PASS | PASS | Geoapify city center,5rows |
| Harrisburg, Pennsylvania | PASS | PASS | Geoapify city center,4rows |
| Berkeley, California | PASS | PASS | Geoapify city center,20rows |
| Baltimore, Maryland | PASS | PASS | Geoapify city center,20rows |
| Philadelphia, Pennsylvania | PASS | PASS | Geoapify city center,20rows |
| New York City, New York | PASS | PASS | Geoapify city center,20rows |
| San Francisco, California | PASS | PASS | `37.7879363,-122.4075201`,20rows; offshore-reference defect resolved |
| San Fransisco, CA | PASS | PASS | Corrected to San Francisco, same city point/results |
| ZIP20706 | PASS | PASS | Census ZCTA point,4rows; state is optional for ZCTA |
| Berkeley without state | PASS | PASS | Clarification, zero directory queries |
| Monowi, Nebraska | PASS | PASS | Real resolved location, zero matching healthcare rows; never called unsupported |

[Full matrix](eden-call-evidence/final-geography.json) · [small-town recording receipt](eden-call-evidence/final-small-town.json). Existing source/error tests distinguish unresolved, ambiguous, unavailable-provider, reference fallback and resolved-empty states. Directory completeness remains unverified; imported records retain provenance/quality disclosures and incorrect-information reporting. Last read-only database audit found17,520 published non-demo listings and zero published demo listings in each database. HRSA, HUD and approved local food sources remain intact. [Database/source/RLS audit](eden-call-evidence/stabilization-database.json).

### Voice policy and retry behavior

The **hosted status confirms48 team /12 per signed tester browser confirmed starts per UTC day;60 team /16 per browser credential attempts; two provider-risk slots;600-second maximum**. Browser fairness is protected-preview visitor fairness, not per-Google-account identity. Source defaults remain24/6 and32/8; only the authorized recovery-branch Preview overrides were raised. The48-call local simulation verifies fairness and the ceiling without48 Google requests.

Tentative setup permits expire or release on failed initialization and do not become successful-call consumption. Issued credentials remain separately budgeted and can retain a risk slot until expiry even after End Call; the key cannot be revoked by browser cleanup. [Read-only final aggregate](eden-call-evidence/final-staging-counters.json) counted all48 slots:11 confirmed,0 provisional,17 attempts; one credential-risk slot remained temporarily reserved. No counters were reset.

Confirmed daily exhaustion carries an authoritative UTC `resetAt`, displayed with the visitor's timezone/date. Pending setup reservations instead report temporary capacity with a conservative at-most90-second retry, not a false midnight reset. Occupied provider slots use known lease deadlines; unknown lease metadata supplies no fabricated deadline. Google token429 uses only actual RetryInfo/Retry-After, and WebSocket quota without timing has no invented reset. Remaining time uses a monotonic deadline, brief60/15-second warnings and graceful expiry. Local tests cover incorrect device clocks, timezone/DST and all these classifications. Text and page controls remain available.

The previously inspected Google project was **Our Ground–EDEN**, `gen-lang-client-0351735652`, **Free tier**: Live65K inputTPM, displayed peak2.15K; displayed RPM1/Unlimited and RPD10/Unlimited. That dashboard did not grant numerical concurrency or48 successful sessions. The current application change preserves two slots and existing request/credential controls. [Provider observations and sources](eden-live-team-capacity.md). No extra quota purchase, billing change or model/voice substitution occurred. The historical TTS429 still lacks its original provider body; its exact original quota metric/origin cannot be reconstructed. [TTS diagnosis](eden-voice-quota-diagnosis-2026-11-08.md).

SEMA remains a read-only reference, not a migration: its older3.1preview/Kore setup and adjacent SDK context-compression configuration are distinct from its actual raw WebSocket hook. Eden retains constrained short-lived credentials, standard3.8Live/Aoede and authorized public tools. Existing bounded resumption cannot extend the original signed deadline. **15–30-minute/compressed rollover behavior is not enabled or qualified.** [Detailed source-based comparison](eden-sema-voice-comparison-2026-11-08.md).

## Release-blocking Live result

**FAIL on this final runtime.** [Sanitized real-call receipt](eden-call-evidence/final-live-failure.json), correlation`e2921035-961c-42b1-9f55-c48f2b9356d8`:

- One real connection used `models/gemini-3.8-live`, requested Aoede; token, connected and End Call returned200. A deliberately mocked409 before the real call proved retry and stopped capture without minting.
- Introduction produced35 audio chunks (~10.77seconds rendered), then “Who are you?” was transcribed and answered with25 more chunks (~8.03seconds rendered). Actual output analyser peaks were nonzero and clocks advanced.
- “Find healthcare in Harrisburg” sent67 non-silent browser-observed WebSocket audio frames, maxRMS~0.254. **No provider transcription, tool call, audio, or other inbound provider event followed before the65-second acceptance deadline.** Consequently this call did not search, narrate results or reach its first-result follow-up.
- There were4434 transmitted audio packets,93 with signal, zero dropped or suppressed audio, running input/output contexts, no CSP violation and no provider429/error/abnormal socket close. The UI's bounded unanswered-turn handler retained the connection and offered speaking/text. End returned200, all microphone tracks stopped, socket closed1000.
- A read-only comparison found the earlier passing run used the same fixture (68 non-silent search packets, comparableRMS) and the same single `audioStreamEnd` from the earlier explicit mute test. No application turn-boundary/forwarding block was reproduced by five focused local regressions. This evidence proves browser-observed transmission, **not Google receipt**, and does not prove a Google defect.

The first browser attempt separately hit a first-party protection transport error and exited before producing a call receipt. The verification harness now aborts failed routed requests and preserves `finally` cleanup plus bounded sanitized endpoint metadata. One bounded retry produced the real failure above. No retry storm, audio-pipeline rewrite, guessed VAD/model change or silent fallback was introduced.

**Minimum next correction:** isolate and resolve the missing second-turn provider progress with this receipt and a bounded diagnostic, then require a real same-call search narration and contextual follow-up. The earlier successful `2665050` acceptance cannot pass this runtime by inheritance. Physical EE-den pronunciation, natural “continue/where were we?”, and owner microphone acceptance remain **BLOCKED behind that gate**. Pronunciation guidance is deployed in Live and Read reply; no auditory pronunciation PASS is claimed. No new owner physical test is requested while hosted acceptance fails.

## Production gates and decision

**NO-GO.** Apart from the Live failure, the minimum independent gates are:

1. **BLOCKED assigned-organization positive authorization.** The last staging/production database audit found zero approved memberships, listing assignments and administrators. Real unassigned denial passed; no privileged access was granted. An owner-approved nonproduction membership and listing grant are required for a real positive/foreign-listing test.
2. **BLOCKED production OAuth/client configuration.** Production needs its own matching Supabase URLs/publishable keys, Google provider and callbacks, canonical site/redirect allowlist and exact origins. Presence/chooser on staging does not pass production. [Redacted difference audit](eden-call-evidence/final-production-env.json).
3. **BLOCKED production geocoding/Live authorization.** Production's separate location flags and explicit Live approval are absent. Verify its key restrictions, provider terms/quota and privacy/abuse configuration using its own credentials. Staging authorization is not transferable.
4. **BLOCKED manual Safari/VoiceOver and final physical Live/pronunciation acceptance.** Automated axe and Chrome results are not hardware/screen-reader acceptance.
5. Explicit owner release approval after those checks. PR#3 is not merged.

The [production cutover runbook](eden-production-cutover.md) gives exact project guards, build/security checks, unaliased candidate command, promotion and rollback. The production rollback command is prepared for the rechecked baseline, **not executed against production**:

```sh
vercel rollback dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq --scope penuels-projects-aa802b06 --yes
```

Re-resolve the production alias before cutover; code rollback does not reverse OAuth, environment or database changes. No database migration is proposed here.

## Visual evidence and storage

[Desktop invitation](eden-call-evidence/final-welcome.jpg) · [320px invitation](eden-call-evidence/final-mobile-welcome.jpg) · [actual200% pointer](eden-call-evidence/final-cursor-200.jpg) · [genuine Gemini search](eden-call-evidence/final-real-search.jpg) · [resolved empty town](eden-call-evidence/final-small-town.jpg).

Public screenshots/recordings are on mounted writable exFAT `/Volumes/Penuel Back/OurGround-Work/runs/2026-11-08-eden-3fbf44a-3045f215/artifacts/final-qualification/`: `08b1685-invitation/invitation-desktop.webm`, `08b1685-real-text/` (real text search recording), `08b1685-small-town/location-search.webm`, `08b1685-live-retry/call-screen.webm` and synthetic-only `call-audio.webm`. The current failed Live recording contains introduction/identity only, not a successful resource action; the historical successful resource/follow-up recording remains labeled `2665050`.

Source, Git, dependencies, credentials and sensitive build output remain on internal APFS; the external exFAT drive is used for public artifacts, not permission/symlink-dependent builds. No reformat, backup modification or unrelated deletion occurred.
