# EDEN-02 — Pre-integration security checklist

> **EDEN-03 update, 2026-11-06:** The owner now specifies an adult-focused competition/portfolio prototype, Gemini free tier and Aoede only. The EDEN-02 findings below retain their original mixed-age scope. Current implementation, implemented controls, test evidence and remaining public NO-GO criteria are in [EDEN-03 assistant](eden-03-assistant.md) and [current provider evidence](eden-03-provider-evidence.md). The historical OpenAI/Azure evaluation paths are not implementation choices for EDEN-03. No public eligibility or legal compliance is certified.

**Audit baseline: 2026-11-06. No live integration or release authorized.** Use with [privacy readiness](privacy-and-provider-readiness.md), [data flow/threat model](data-flow-and-threat-model.md), and [provider decision/source register](ai-provider-decision.md).

A checked box means attached evidence for the **exact** build, target, provider/model/endpoint, audience and configuration. A design statement, passing unrelated test, sales claim or SDK installation is not evidence. “Unknown” fails a mandatory gate. Legal/provider decisions require a qualified reviewer and appropriate written records; this document does not certify compliance.

## Decision by stage

| Stage | Current decision | Boundary |
| --- | --- | --- |
| EDEN-02 audit/design | **Completed locally** | Four documents, source inspection and 43 focused offline tests. No claim of hosted readiness. |
| Local mock implementation | **GO as the next separately scoped development step** | Synthetic fixtures and no live provider/remote microphone traffic. This audit did not implement the mocks. |
| Real resident text through any model | **NO-GO** | Contract/audience, data-boundary, cost, notice and hosted operational gates below are unmet. |
| Remote voice or real volunteer recordings | **NO-GO** | Separate speech/recording/child/privacy agreement and technical gates unmet. |
| Gemini Developer / Google Cloud managed Gemini for mixed-age public EDEN | **NO-GO under retrieved standard terms** | Payment alone cannot close the audience gate. Require an applicable written contractual exception before reconsideration. |
| Production deployment / paid service activation | **Not authorized** | Even a technical GO is not permission to deploy, activate billing or modify production. |

## Evidence already established in this audit

- [x] Inspected local authentication, APIs, runtime wiring, SQL security/retention migrations, public search/maps, logging, analytics hooks, privacy notice and EDEN-01 code; E01–E14 identify exact files and limits.
- [x] Retrieved current official Google/OpenAI/Microsoft documentation and legal/government sources; successful and blocked retrievals are distinguished with 2026-11-06 dates in the source register.
- [x] Ran existing offline suites for security auth/web, database security, privacy maintenance, Geoapify limits and location quality: **43 passed, zero failed/skipped**. This proves those tested local behaviors only.
- [x] Identified actual remaining exposures: auth session localStorage; free-text `q` in share URLs; legacy GET search parameters; third-party map requests; unverified host/provider logging, recovery and deletion.
- [x] No application/runtime/security/deployment/provider configuration changed; no production query, migration, live inference, paid activation or user-data upload performed.

## A. Audience, contract and legal scope — all mandatory for real data

| Gate | Owner | Required evidence / pass condition | Current status |
| --- | --- | --- | --- |
| A1 — Audience fit | Owner + counsel | Document intended adult/teen/under-13/unknown-age users and service geography. Exact provider terms permit that audience or an applicable signed exception exists. Public resources remain equally available without AI. | **Blocked**; Google standard terms conflict, other providers conditional. |
| A2 — Minor consent and child safety | Counsel + privacy/product | For any provider requiring it, a lawful, accessible parental-consent/age-assurance method, necessary notices, age-appropriate content controls and reporting/escalation. Demonstrate no reliance on an unaudited “I am 18” toggle and no forced ID/DOB just to find support. Unknown eligibility takes provider-free path. | **Not established**. OpenAI O1/O2 conditions are not optional. |
| A3 — Data role and legal basis | Counsel/privacy | Written data map, purposes/legal bases, health/recording/child/consumer privacy analysis for actual entity/jurisdictions. Determine HIPAA role; do not treat non-PHI as non-sensitive or automatically lawful. | **Not established**. |
| A4 — Contracts | Counsel/procurement | Applicable agreement and DPA, subprocessors/transfers, exact endpoint/model/features, support access, deletion/retention and human-review exceptions documented. BAA/Healthcare Addendum and in-scope configuration if required; signed/accepted records available. | **Not established**. No legal compliance verified. |
| A5 — Retention entitlement | Security + provider | Account/project evidence of approved retention mode, model/feature exceptions, cache behavior and safety-retention notices. `store:false` alone cannot pass. For under-13/applicable-age personal data, meet the selected provider's additional requirements before any disclosure. | **Not established**; ZDR not demonstrated. |
| A6 — Geography/preview/license | Counsel + data steward | Actual visitor and processing/storage geography permitted; approved model is available in approved deployment type. Preview exclusions resolved. Source/POI license permits the proposed projection and processing. No blanket adoption of Google Cloud assurances for Developer or preview services. | **Not established**. |

Do not solve an eligibility failure by silently switching providers, mislabeling users, removing child access to the directory, or relying on data redaction. If A1–A6 cannot pass, continue the provider-free architecture.

## B. Mock development acceptance — no network inference required

These are **future tests, not test passes from this audit**.

- [ ] B1 — A context serializer accepts only public route/state enums and bounded approved fields. Seed DOM, URL, storage and private fixtures with unique fake emails, tokens, diagnoses, exact GPS and organization notes. Assert **zero canary occurrences** in outbound mock envelopes, logs, traces and error paths. Reject unknown fields and private/unknown routes before serialization.
- [ ] B2 — Sensitive/unrecognized mock requests stay local and receive structured controls. Prove the design still protects data when the mock redactor returns the original input or misses every canary. No remote classifier, STT or moderation request is used to decide pre-transfer permission.
- [ ] B3 — Consent/eligibility decisions bind provider, purpose, data classes, policy version and expiry. Forged, expired, changed-provider, wrong-session and replayed receipts never admit a request. Cancel/decline preserves the complete deterministic navigation path.
- [ ] B4 — All four allowed action types have strict schemas. Test extra keys, arbitrary SQL/URLs, private resource IDs, unaffiliated listings, cross-tenant handles, protocol-relative/encoded URLs, stale source withdrawals and expired capability handles. **Zero forbidden executions** across the versioned fixture corpus.
- [ ] B5 — Malicious public listing/model text cannot create account, donation, report, application, email, clinical or arbitrary-fetch actions. A fake confirmation button cannot broaden the allowlist. No generic browser, filesystem, computer-use or MCP tool exists in the capability registry.
- [ ] B6 — Result facts, IDs and links originate from the server's current retrieval set. Tests preserve unverified/demo flags, null facts and provenance. Medical advice, invented hours/costs, availability and benefit eligibility guarantees are rejected. A parser-valid hallucination still fails source validation.
- [ ] B7 — Navigation/search changes require the explicit Apply action. Queued actions cannot run after cancellation, route change, revision change or a newer request, even if an upstream operation ignores abort. Failure returns normal public search, not silent model retries.
- [ ] B8 — Logs use an allowlist and synthetic schema tests across success, validation, exceptions, timeouts, retries-disabled and cancellation. No content, raw URL, exact position, auth/account ID, semantic content hash or recorder bytes reach logging/error/analytics sinks.
- [ ] B9 — In-memory cleanup and timeouts work: audio per-turn discard, text clear/navigation, five-minute inactivity, 15-minute session maximum. No IndexedDB/localStorage/cache, server session transcript, remote files/history/vector store or backup contains mock conversations by default. Testing a JavaScript reference being released does not prove forensic memory erasure.
- [ ] B10 — Fake AI/STT/TTS adapters and synthetic amplitude drive the existing Rive controller. Text statuses, keyboard, screen reader, reduced motion, mute/pause and fallback remain usable with animation/voice unavailable. No real microphone permission is requested for these mocks.

Mock mode must use explicit synthetic fixtures and deny outbound AI/speech destinations, not merely omit a key and hope no fallback SDK activates. CI must use an isolated fake environment, never read production secrets or export private data into fixtures.

## C. Secrets, APIs, spend and abuse — mandatory before a live pilot

- [ ] C1 — Provider credentials are scoped to a dedicated server-side project/service; no browser bundle/`VITE_`/storage/log exposure. Scans inspect built assets and provider response/error handling. Rotation and revocation work; existing Auth/database/migration secrets cannot enter context. Validate account permissions and avoid using a master key where a narrower credential is available.
- [ ] C2 — Same-origin fixed-path POST gateway, explicit content type, bounded body/arrays/strings/token count and request timeout; reject extra fields. Do not append messages, voice, location or search receipts to URLs. CORS/origin headers alone are not authentication or bot protection.
- [ ] C3 — Atomic shared admission includes account-independent session/network limits, global concurrency, turn count, provider calls, worst-case token/audio cost, day and month money ceilings. Fail closed on counter/config/store failure. Existing Geoapify/location caps still apply. Shared-NAT/rate-limit failures preserve accessible deterministic search rather than excluding residents from support.
- [ ] C4 — Exercise at least two concurrent gateway instances racing at each limit. For the proposed text pilot, never exceed **two concurrent calls, 40 calls/day, 1,000/month, $2/day or $25/month**; session limits are 3/minute and 20/session. Reserve at least the approved worst-case charge (planning $0.025/turn) before dispatch. No cap is assumed from the provider's alert emails.
- [ ] C5 — Maximum input is 2,000 total tokens and output 400 total billable tokens, including any generated/reasoning output under the chosen model's billing rules. If the model cannot honor/price this bound, reject it or review a different reservation; do not silently exceed it. Pin rates, model, region and endpoint; stop on rate/config drift.
- [ ] C6 — No model tool fees, retries, provider failover, background jobs, durable cache or audio spend are enabled implicitly. Ambiguous/cancelled requests retain a full reservation until reconciled. Test late responses and partial billing; deduplicate replays. Synthetic invoice reconciliation and global kill switch demonstrated.
- [ ] C7 — Alerts at 50/80/95% have a named operator, but app hard stops do not depend on alert delivery. Emergency disable takes effect server-side within **60 seconds**, and no new provider dispatch occurs after cutoff. These thresholds are proposed acceptance criteria, not measured current behavior.

## D. Notices, storage, infrastructure and operations

- [ ] D1 — Public notice accurately lists AI, hosting, maps, auth and any speech processors, purpose, exact shared categories, retention/review exceptions, transfers and controls. It distinguishes Our Ground's no-storage default from provider/infrastructure storage. No “HIPAA compliant,” “fully anonymous” or “zero retention” claim without scoped evidence.
- [ ] D2 — Working monitored privacy/deletion contact, named privacy/incident/abuse owners and escalation coverage. Test an access/deletion request without asking for passwords, auth codes or identity documents. Define deletion limitations for anonymous sessions and provider-held copies.
- [ ] D3 — Observe actual browser, CDN, hosting, proxy, database, Redis, error tracking and provider debug/audit behavior using synthetic canaries. No assistant content in URLs/access logs; existing GET and share-keyword exposure is explicitly remediated or bounded with evidence for the chosen release. No session replay or request/response body recording. Verify log-drain permissions and TTL deletion.
- [ ] D4 — Evidence for applied DB migrations, restricted role, current grants/public projections, remote TLS, tenant/authority tests, Auth revocation and no-store private responses on exact hosted target. The assistant service has no access to private organization commands or user sessions.
- [ ] D5 — Backups, restore/rollback, deletion propagation, caches, legal holds, provider retention and support exports have approved periods and tested procedures. Owner-only retention stays bounded and reviewed; no destructive job or scheduler activated by this checklist.
- [ ] D6 — Threat-model tests map T01–T12 to a versioned evidence set, including an intentional policy outage, storage outage, provider timeout, hallucinated result, stale withdrawal, malicious listing and spend-limit race. Record exact build/model/policy revisions and residual risks accepted by an accountable owner.
- [ ] D7 — On physical ordinary desktop/mobile and assistive technology, confirm text-only parity, keyboard navigation, status announcements, readable uncertainty, reduced motion, no voice auto-start and clean session exit on shared devices. No forced AI, paywall, login, geography/age disclosure or microphone for public-resource access.

## E. Additional voice gates — separate approval

- [ ] E1 — Exact STT, TTS or Live service/model, voice, language, processing geography and contract reviewed independently of text. Aoede preference does not override Google audience terms. Custom/cloned voice, biometrics, saved training audio, batch jobs, camera and session resumption remain excluded unless separately approved.
- [ ] E2 — Applicable recording/child/health notices and consent are approved. Purpose/provider notice appears before an explicit push-to-talk gesture; only then may the browser permission prompt occur. Never infer consent from an older browser permission. Text remains an equivalent path.
- [ ] E3 — Capture begins only after authorization, no pre-roll or background listening; visible state, Stop, maximum 30-second utterance, interruption/navigation/tab-hide cleanup, and a bounded connection timeout are verified on devices. All media tracks stop within **one second** of Stop/navigation; zero further packets are sent after teardown completes. Threshold is a future test criterion.
- [ ] E4 — Real-time speech buffers are discarded without default storage; no batch/storage account side effect. Separate consent and retention profiles cover transcript, audio and generated speech. Bystander/child/private-content risks are tested with synthetic audio first; no promise that downstream redaction prevents the initial STT disclosure.
- [ ] E5 — Validate generated/source facts before speaking them; captions/transcripts, stop/mute, accessible playback and zero-amplitude reset work. Never automatically speak private information aloud. Do not stream unvalidated model output through TTS.
- [ ] E6 — Separate owner-approved speech budget, live duration/concurrency caps and metering for both input/output audio and backend token charges. **Current voice budget remains $0.** No real-data voice pilot until this section and A–D pass.

## Required release evidence packet

The owner must receive: signed decision naming legal/privacy/security reviewers; exact service/terms versions and audience consent mechanism; applicable DPA/BAA scope and retention approval; data/payload captures containing only synthetic canaries; secret/bundle and action-policy test reports; global spend-race/cutoff evidence; hosted grants/headers/logs/backups/restore/deletion results; accessibility/device results; operator/contact/escalation drill; build and rollback identifiers; residual-risk acceptance; and an explicit separate authorization for any live pilot/deployment/billing.

**GO is per scope, not per brand.** Text permission does not authorize voice, a new provider, account actions, PHI, new geography, stored history or a model upgrade. Any mandatory unknown, contractual conflict, canary leak, forbidden action, unbounded charge or failed fallback is a **NO-GO**. Re-review after material terms/model/configuration changes or before each new release scope.

## Safe next work and stop conditions

A next local implementation can build B1–B10 and C's simulated controls with invented records and a network-denying mock adapter. Continue EDEN's Rive animation and deterministic public navigation independently of provider selection. Do not convert mock consent into real authorization, collect real volunteer voice, use production support requests as eval data, or enable a paid resource to “see if it works.”

The audit's immediate deliverable is the architecture and recommendation. Real-user intelligence, remote voice and page-aware execution remain unimplemented and NO-GO pending the gates above.
