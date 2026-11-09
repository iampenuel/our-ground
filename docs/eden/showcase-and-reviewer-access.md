# EDEN reviewer access and superseded showcase architecture

> **Presentation/interaction superseded, 2026-11-06:** The owner rejected both the standalone Meet Eden experience and non-AI Eden website-guide substitute. Both `/eden` and `/eden-assistant.html` now redirect to `/support`; original product pages remain primary. Eden must use genuine Gemini or show a concise unavailable state; manual controls remain independent. Eligible testing uses the original app in explicit local review mode. Follow [current architecture](current-architecture.md), [recording guide](recording-guide.md), and [current verification](verification/restored-product.md). Older showcase/guide/harness descriptions below are historical. Local admission and official evidence remain relevant, without approving hosted Gemini.

Architecture review and official-source retrieval: **2026-11-06**. This is a technical release handoff, not a legal compliance finding, deployment instruction, billing authorization, or permission to send additional data to Google. Read alongside [EDEN-03 implementation](eden-03-assistant.md), [provider evidence](eden-03-provider-evidence.md), and [verification](verification/eden-03.md). Earlier EDEN-02 documents retain their historical mixed-age scope.

## Decision

**Make the public portfolio showcase work without Gemini. Keep hosted live Gemini review disabled.** A separate, genuinely restricted adult reviewer service is a possible future evaluation, subject to evidence and a reviewed implementation. An invitation link, password, disclaimer, age checkbox, or `noindex` directive alone does not establish that service's eligibility.

| Experience | Decision | Exact boundary |
| --- | --- | --- |
| Public portfolio showcase | **GO for local development and release preparation** | Synthetic resources, deterministic local commands, existing animation, visible action review, accessible text fallback. No live Gemini, dynamic provider TTS, microphone, or real resident data. Publishing still requires the owner's separate deployment authorization and the artifact checks below. |
| Existing loopback adult synthetic demonstration | **Conditional GO within its documented scope** | The server independently requires local mode, a loopback URL and allowed Origin, free-project confirmation, current notice, and an expiring session. Comparison planning additionally requires a local reviewer grant. The existing successful local test does not authorize hosted access or prove future account entitlement. |
| Hosted invite-only Gemini reviewer experience | **NO-GO now** | Genuine reviewer authentication/admission, adult assurance, region controls, durable abuse limits, host evidence, and contractual suitability are not implemented or verified. Keep the unconditional hosted denial. |
| General public Gemini assistant | **NO-GO** | Public-resource context creates unresolved audience and regional restrictions. Do not use a reviewer route to expose the same API client publicly. |
| Real resident narratives, microphone input, clinical advice, private account actions | **Outside this implementation; NO-GO** | Neither showcase nor reviewer access authorizes these expansions. |

The accessible public directory stays independent of AI, reviewer accounts, age assurance, and region checks. Reviewers who cannot qualify for a live evaluation can use the complete provider-free showcase. No OpenAI, Azure, paid Gemini, company-registration workflow, or startup launch is introduced.

## What is implemented and what remains proposed

The existing [`shared/eden-assistant.ts`](../../shared/eden-assistant.ts) recognizes a complete finite command and produces only bounded actions. [`application-bridge.ts`](../../src/eden/application-bridge.ts) exports validated page enums/counts and checks action validity, page revision, and current result bounds before dispatch. Applying an action calls the existing public search, details, or map-selection functions. Synthetic detail scope accepts fictional records and rejects real ones; default public detail scope continues rejecting fictional records.

The public `/eden` route mounts [`showcase.ts`](../../src/eden/showcase.ts), using the browser-local [`sample-resources.ts`](../../src/eden/sample-resources.ts) transport and an offline map. It starts with the same three ordered fictional food options used by the comparison scenarios. The website guide can search, select, and display sample details without a model. The separate [`demo.ts`](../../src/eden/demo.ts) authoring entry mounts the same experience at `/eden-assistant.html`, with optional local native Rive/voice support. Run `npm run dev:eden:api` and `npm run dev:eden:assistant` using Node 24; open `http://127.0.0.1:5199/eden-assistant.html`. No key is needed for local navigation. Optional live mode is **local development**, not hosted reviewer access. The local developer's configured key, flags, browser acknowledgements, and reviewer code must never be copied into a public showcase build.

[`backend/eden-api.ts`](../../backend/eden-api.ts) currently rejects hosted/public Gemini use independently of acknowledgements. Its process-memory opaque sessions and limits support the local demonstration only. They are not named reviewer identities, invitations, age/region verification, or distributed production admission. There is no hosted reviewer activation path to approve today.

The shared assistant UI contains conditional reviewer controls, shown only when the local server reports review availability. Hiding those controls is not the security boundary: the hosted backend independently denies session, comparison, navigation-model, and speech access. The public entry uses SVG animation and text; it does not relax production CSP for native Rive WASM or media. Ordinary commands never call Gemini, including during an authorized local review session. Any future public recording must be labeled as recorded playback, have publication rights and fixed non-sensitive content, and require an explicit playback gesture; no hidden live fallback is permitted.

## Supervised local reviewer admission

The added reviewer architecture is a **local supervised control**, not provider-approved age verification and not a hosted invitation service. Before issuing a reviewer code, the operator must already have checked that the intended participant is an adult in the US and confirmed the approved synthetic/free-project scope. The tool records that operator attestation; it does not independently verify a person's age, citizenship, residence, present location, or provider eligibility. Do not collect identity documents, DOB, or resident information in this helper.

The local grant uses 32 random bytes encoded as a 43-character base64url code, with only its SHA-256 verifier configured on the server. Its expiry must be in the future and at most 24 hours away. Admission also requires `EDEN_REVIEWER_ADULT_VERIFIED=true` and the initial strict country setting `US`, plus the existing loopback, provider, and free-project gates. These environment values are operator assertions. A user checking the accessible adult/data acknowledgements cannot create or bypass them. The generated private grant material must be ignored by Git, written with mode `0600`, and kept out of browser bundles, screenshots, URLs, shell history, analytics, error reports, and model input. A credential verifier is still security-sensitive metadata; absence of a name is not a legal finding that the record is anonymous.

Status must distinguish ordinary local eligibility from `reviewAvailable`. The code input appears only when local review is available, within the single privacy disclosure. The server exchanges a valid code and current acknowledgements for a bounded reviewer-authorized session. A legacy navigation/turn session has no planning authority. Every `/eden/plan` request must check that separate capability and current grant expiry before admission; no fallback to ordinary session authority is permitted. A copied code or falsified browser value must not open hosted access.

The comparison request selects one of two application-owned fictional food scenarios. The server supplies only fixed candidate indices, distance/access/hour enums, goals, and priorities; sample display names, raw visitor input, reviewer code, and identity do not enter Google's prompt. The model can genuinely choose among admissible fictional options. Its selected index and reason codes are checked against the fixed scenario facts, and the UI renders application-owned explanations. This differs from the older navigation endpoint, which only checks the same proposed action. Neither flow may create new capabilities or invent real service facts. Applying the comparison remains an explicit action with current page/result validation.

Removing the configured grant and restarting the local API revokes this local admission; expiry must also deny a still-present code or session. A process restart is not a remotely managed revocation service. Named identity binding, one-use hosted invitations, independent assurance, multi-instance revocation, and hosted regional enforcement remain **proposed** below. Do not represent this local control as having implemented them.

### Operator workflow for a separately authorized local review

After completing the adult/US and unbilled-project checks, the operator may issue the local grant with:

```sh
npm run eden:reviewer -- --adult-verified --country US --free-tier-confirmed
```

The [offline helper](../../scripts/eden/create-review-invite.mjs) defaults to **two hours**; `--hours 1` through `--hours 24` are permitted. It creates `.env.eden-review.local` with the hash, expiry, and local server flags, plus a separate `.env.eden-review.local.code` containing the raw reviewer code. Both are owner-only files covered by the project's Git/upload exclusions. It refuses to overwrite an existing grant or code file. Standard output reports paths and expiry, not the code, hash, or provider key. File creation itself does not contact Google, start the API, or verify eligibility. The local code is reusable during its short supervised window; it is not a one-use hosted invitation.

For that approved local session, start the API and authoring UI in separate terminals:

```sh
npm run dev:eden:review
npm run dev:eden:assistant
```

The review API reads the existing server-only key configuration and the generated grant environment. Copy the **reviewer code** from its protected `.code` file into the local reviewer input, then acknowledge the notice. Never put the Gemini API key in that input or in a URL, chat, screenshot, repository, or browser variable. Review a fixed sample goal, explicitly ask for comparison, and inspect the proposal before Apply. Closing, clearing, withdrawal, inactivity, or session expiry returns local guidance. Stop the API and remove the expired private grant files when the supervised review is finished; retain no identity documents or participant narratives. These commands describe a local workflow, not permission to publish or activate hosted Gemini.

## Model quality and local cost controls

The comparison is a genuine model selection, not a predetermined action echoed by the SDK. Both hard-constraint-admissible indices remain in the tool schema; the prompt supplies goal/facts and ordered priorities, never a preselected answer. After receiving the model output, the application validates the selected fact/reason codes and rejects a choice strictly dominated under the stated ordered priorities. A rejection never substitutes a calculated answer, retries automatically, or labels a local fallback as Gemini output. The displayed rationale uses approved sentences for the model-selected reason codes, not a transcript of private model reasoning.

Planning uses low thinking with **1,024 maximum output tokens including thoughts**, no thinking summaries, no stored Interactions state/automatic continuation, one attempt and a 15-second server timeout. Legacy exact-action validation retains its 256-token cap; speech retains its existing fixed-phrase/codec limits. These controls use the documented [thinking levels and token limits](https://aistudio.google.com/docs/thinking#thinking-levels), retrieved **2026-11-06**. They do not override Google's processing or retention terms.

All routes share the existing process-memory ceilings: 3 attempts/minute/session, 20/session, 40/day/process, 6 speech/session, 12 speech/day, one active request/session and two/process. Failures consume admitted attempts. The all-planner upper bound is therefore 40,960 output tokens/day/process, before the shared speech subset reduces the number of possible planner calls. An unbilled free project remains the target; no paid fallback exists. Process restart resets local counters, so this is not a durable hosted spend guarantee or a limit on unrelated clients using the same project. Hosted admission, cost controls and quota verification remain separate release requirements.

## Current Google findings

The following official pages were retrieved directly by read-only public HTTPS GET on **2026-11-06**. No account endpoint, generation API, credential, or user content was involved in this source review. Conclusions below are paraphrases; they do not certify applicability to this operator.

| Official evidence | Finding |
| --- | --- |
| [Gemini API Additional Terms — age and use restrictions](https://aistudio.google.com/docs/terms#age-requirements), effective March 23, 2026 | Users must be adults; API clients must not target, or be likely to reach, under-18s. Developer use must serve professional/business purposes. Clinical practice and medical advice are prohibited. |
| [Unpaid data terms](https://aistudio.google.com/docs/terms#data-use-unpaid) | Input/output may support Google product improvement and human review. Personal, sensitive, and confidential submissions are prohibited. |
| [Regional use restriction](https://aistudio.google.com/docs/terms#use-restrictions) and [regional data distinction](https://aistudio.google.com/docs/terms#data-use-unpaid) | Offering API clients to EEA, Swiss, or UK users requires Paid Services. The separate application of paid-style data terms there does not remove that requirement. |
| [Available regions](https://aistudio.google.com/docs/available-regions) | The United States is listed; supported-region availability does not waive other contractual conditions. |
| [Billing](https://aistudio.google.com/docs/billing#about-billing) | Free access depends on the project's model/quota entitlement; some projects require verification. A working key is not billing evidence. |
| [Usage policies](https://aistudio.google.com/docs/usage-policies#how-we-handle-data) and [retention guide](https://aistudio.google.com/docs/zdr) | Safety enforcement retains specified input/context/output for 55 days. Disabling stored interaction state does not establish universal zero retention. |

The free project's legal status, model availability, and actual account configuration must be checked before any separately authorized live evaluation. A $0-priced model, free quota, or promotional credit does not establish the applicable service/data category. Preserve the no-paid-services decision; do not attach billing to resolve a blocker.

## Unresolved contractual and policy questions

1. **Professional purpose:** Does this individual student's competition/portfolio demonstration satisfy the professional/business developer restriction? Record the contracting individual or institution, authority, applicable agreements, and acceptance. No incorporation requirement is inferred from those words, and no exemption for student projects is assumed. Obtain qualified review or written Google clarification if interpretation remains uncertain.
2. **Actual audience:** Would the proposed distinct reviewer API client still be likely to be accessed by minors, considering its connection to a community-resource site, recruitment, authentication, shared devices, and invitation leakage? Identify what effective controls and evidence the provider requires; declaring the portfolio “18+” cannot answer this.
3. **Region:** Which operator/reviewer jurisdictions are permitted for this exact unpaid service? How will the service reliably deny unsupported locations and EEA/Swiss/UK client access while minimizing personal data? A US operator, US server, account language, or checkbox does not establish every reviewer's region. No control should conceal or misrepresent actual location.
4. **Data and roles:** What privacy notices, legal basis, controller/processor duties, transfer terms, retention/deletion limitations, and host logging controls apply to reviewer identity, assurance receipts, usage metadata, and Google's processing? The existing finite prompt excludes these data; that does not remove obligations for the service that holds them. No DPA, BAA, HIPAA compliance, or universal deletion guarantee is verified.
5. **Source and publication rights:** Are the synthetic artwork, recordings, map/runtime assets, and any displayed source material licensed for the exact public artifact? The reviewer model must still receive no resource descriptions, names, URLs, or real records.

Any unresolved mandatory answer keeps hosted live Gemini **NO-GO**. Technical access controls reduce risk; their existence alone does not establish that Google's audience condition has been satisfied.

## Proposed future restricted reviewer architecture

This section is **design only**. Do not enable it by relaxing loopback/hosted checks, adding a shared password, accepting a public flag, or using an obscure URL. Complete and review the following service before considering a narrowly scoped activation.

**Separate public and reviewer authority.** A distinct reviewer deployment/origin is a recommended isolation option, not a prerequisite for publishing the provider-free showcase. A shared UI and shared contracts are acceptable when server admission independently denies unauthorized live access; hidden controls confer no authority. For any future hosted review scope, use synthetic-only transport, reviewed server policy, and a restricted project credential. No browser artifact may contain a provider SDK/key, pre-issued reviewer token, or secret. Public CORS/Origin allowlists are supplementary checks, not authentication. Block direct provider access from the browser and expose only the fixed server gateway.

**Authenticate and admit named reviewers.** An operator creates a bounded invitation for a specific intended adult reviewer after an approved admission process; there is no public sign-up or self-approval. Store a hash of a cryptographically random one-use invitation token, intended identity, issued/expiry times, purpose, and revocation state. Use a short-lived invitation, a separate verified sign-in method, and a short review window. Invite possession alone must not authorize model calls. Keep invite tokens out of query/access/referrer logs, third-party pages, analytics, and persistent browser storage. Complete redemption at the server, consume it atomically, and remove the token from the browser URL before any additional resource loads.

**Establish adulthood and permitted region beyond a checkbox.** Select an evidence-based, proportionate method with qualified privacy/provider review. Examples for evaluation include institution-issued adult-reviewer eligibility or an independently assessed age-assurance service returning a minimal adult/not-adult assertion. Email ownership, a school address, and attested birth date alone are not proof. Do not collect or retain identity documents or a complete DOB in Our Ground simply to test the prototype. Store only the approved assurance decision, method/version, issuer, and expiry where justified; never send it to Gemini.

For region, evaluate a server-validated country decision using trusted infrastructure signals and appropriate corroboration, with explicit limitations for proxies, VPNs, travel, and uncertainty. Do not trust visitor-supplied country headers, browser locale, a chosen search city, or a precise GPS prompt. Deny admission when geography cannot be established under the reviewed policy. Keep the full directory/showcase accessible without these checks. Any assurance vendor or IP processing needs its own privacy, retention, security, and contractual assessment before adoption.

**Check live eligibility at every dispatch.** The server must confirm an authenticated, invited, unrevoked reviewer; valid adult and country decisions; approved policy/notice versions; allowed synthetic scope/model; free-project entitlement; and available quotas. A browser boolean or signed token containing an old approval cannot bypass current revocation. Bind the session to its reviewer and purpose, use secure session transport and CSRF protections appropriate to the chosen authentication, and fail closed when the policy/session/counter store is unavailable. Test direct API calls independently of the UI. Keep private review authorization separate from existing resident/staff accounts.

**Bound and revoke access.** The local service already bounds grants to 24 hours, sessions to 15 minutes or earlier grant expiry, and browser inactivity to five minutes. For hosted review, retain those ceilings and add a 24-hour unused invitation lifetime and scheduled review window no longer than one day. Hosted named invitations, current assurance decisions, and multi-instance revocation are proposed. Revoke an invite, reviewer, session, assurance receipt, or the whole service at the server; test that no new provider dispatch occurs within 60 seconds of an emergency cutoff, including across instances and after replay. Stop active playback and abort pending work on expiry/withdrawal. Use an approved short metadata retention/deletion schedule; do not keep invitations or assurance data indefinitely.

**Retain the finite data and action contract.** Browser interpretation remains local. Generic navigation sends only the city-free action and validated page enum/category/radius/count/synthetic projection, and accepts only that same validated action. Separately authorized comparison sends only fixed fictional scenario facts and accepts an admissible selection with fact-checked reason codes. No original command, reviewer credential, identity/assurance record, IP/country evidence, real resource content, account data, exact location, or audio enters either prompt. Explicit Apply, revision checks, and result bounds still control execution. Redaction cannot substitute for these allowlists. No account mutations, donations, applications, advice, arbitrary fetch/DOM/code, or unrestricted microphone path is added.

**Replace local counters before hosting.** Use durable atomic per-reviewer and global admission across instances, bounded concurrency, replay protection, and a tested kill switch. Start no higher than the existing local ceilings: 3 requests/minute, 20/session, 40/day overall, 6 speech/session, 12 speech/day, and 2 active provider calls. Fail closed on limit-store failure and count failed admitted attempts. Keep fixed phrase Aoede separate and opt-in. Confirm project quotas/model pricing, no active paid usage, key restrictions, and host/body/header logging. Limits cannot prevent spend from another client using the same project/key.

## Objective release handoff

Public showcase preparation passes only when evidence for the exact artifact shows:

- Network traces show **zero `/eden/session`, `/eden/turn`, `/eden/plan`, `/eden/speech`, Google generation, or dynamic TTS calls** from showcase interactions, including malformed input. Separately, direct forged backend requests remain denied and cause zero provider dispatches.
- No provider SDK, key, private environment value, reviewer credential, or live activation fallback exists in the browser artifact. Hosted backend tests continue rejecting Gemini regardless of acknowledgements or flags.
- All resources and map markers are consistently synthetic. The showcase never supplies real contacts/directions, reports/submissions, or verified-service/availability claims. Local action, stale revision, bounds, cancellation, and injection tests pass.
- Keyboard/mobile/reduced-motion/text-only behavior works; voice never autoplays and no microphone permission appears. Engine labels and any recorded media accurately describe what is live.
- Exact static-host security headers, asset/license review, logs, cache behavior, and rollback artifact are reviewed. This document does not certify a host that has not been inspected.

Hosted live reviewer access remains blocked until **all** contractual questions above are resolved with appropriate evidence, reviewer controls are implemented and adversarially tested, and the owner separately authorizes that exact deployment/live scope. A passing showcase build, local successful Gemini call, notice acknowledgement, or policy document cannot pass that gate.

No deployment, production modification, billing activation, new live provider call, or credential disclosure is part of this handoff. The safe next work is the provider-free public artifact, recorded/synthetic demonstrations, and mocked reviewer admission/revocation/region/limit tests.
