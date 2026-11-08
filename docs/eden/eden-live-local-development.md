# Eden Live — supervised local development

Implementation/source review: **2026-11-07**. This guide describes the current local implementation, with separately recorded microphone acceptance, not a deployment, public eligibility approval or account/billing audit. The normal Our Ground website remains available independently of Live. Read alongside [current architecture](current-architecture.md), [provider evidence](eden-03-provider-evidence.md), [reviewer admission](showcase-and-reviewer-access.md#supervised-local-reviewer-admission), and the [dated verification record](verification/restored-product.md).

## Scope and implementation

The existing compact/expandable assistant contains **Call Eden**, microphone and speaker controls, Stop Speaking, End Call, optional captions, and a minimized-call surface. Launcher, chat, and call portraits use Our Ground's approved browser-native SVG artwork; no user-facing Rive player is reintroduced. Typed Gemini and the existing Aoede confirmation-phrase feature remain separate capabilities.

The call path is:

1. Explicit Call Eden interaction, adult/data acknowledgement where required, specific Live-audio acknowledgement, and browser microphone permission.
2. Initialize browser output and microphone processing from that user interaction. No provider credential is minted until both preparations succeed.
3. `POST /api/v1/eden/live/token` exchanges the existing authorized Eden session for a short-lived, single-use, configuration-constrained credential. The permanent Gemini key stays on the server.
4. The browser connects directly to Google's documented **v1beta constrained WebSocket**, sends the locked setup, and waits for `setupComplete`.
5. Finish the canonical initial-history exchange, then request the exact introduction below once. Listen only after actual model-turn completion, playback drain, and the cooldown gate.
6. Public tool proposals obtain server authorization, use the same application executor as typed actions, and return only server-reconciled results/facts.

> Hi! I'm Eden. I can help you find food, healthcare, and community resources. You can ask me something like, 'Find food support near Harrisburg.' What would you like to explore?

The configured voice is **Aoede**. The introduction must be generated and played by the actual Live system; its text/captions or a successful build are not evidence of audible playback.

| Boundary | Source |
| --- | --- |
| Locked model, voice, introduction, tools, context and validators | [shared/eden-live.ts](../../shared/eden-live.ts) |
| Server-only credential mint and call leases | [backend/eden-live.ts](../../backend/eden-live.ts) |
| Session admission and two-phase tool authorization/results | [backend/eden-api.ts](../../backend/eden-api.ts) |
| Actual local listener/socket evidence | [backend/local-transport.ts](../../backend/local-transport.ts), [backend/dev.ts](../../backend/dev.ts) |
| Shared typed/voice application executor | [src/eden/live-actions.ts](../../src/eden/live-actions.ts) |
| Call state, microphone, playback and transport | [src/eden/live/](../../src/eden/live/) |
| Existing assistant and call presentation | [assistant.ts](../../src/eden/components/assistant.ts), [live-call.ts](../../src/eden/components/live-call.ts) |

## Sema patterns reviewed

The owner's [Sema repository](https://github.com/iampenuel/sema) was inspected directly. Its [action registry](https://github.com/iampenuel/sema/blob/main/lib/agent/actionRegistry.ts) and [permission gate](https://github.com/iampenuel/sema/blob/main/lib/agent/permissionGate.ts) informed separation of model proposals, canonical capabilities, and application permission. Its [Live system instruction](https://github.com/iampenuel/sema/blob/main/lib/live/liveSystemInstruction.ts), [session configuration](https://github.com/iampenuel/sema/blob/main/lib/live/liveSessionConfig.ts), [introduction](https://github.com/iampenuel/sema/blob/main/lib/live/liveIntroduction.ts), and [README](https://github.com/iampenuel/sema/blob/main/README.md#live-voice-engineering) informed one introduction per call, half-duplex forwarding, playback-drain gates, and session-scoped idempotency.

Our Ground retains its Vite/TypeScript application and its own public-resource action policy. Sema's healthcare workflow, write/export actions, styling, providers, and Next.js/React architecture were not adopted. Its reported tests or deployment do not establish Eden's acceptance. Current Google configuration was checked independently instead of copying an older Live setup.

## Current official provider evidence

The following public Google pages were retrieved **2026-11-07**. The web reader rejected their Markdown content type, so the same official URLs were read through bounded public HTTPS GETs, without credentials or application data.

| Official source | Implemented consequence and limit |
| --- | --- |
| [Gemini 3.8 Live model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) | Pin `gemini-3.8-live`. The base model does not accept `thinking_config`/`thinkingLevel`; omit them. Function calls default to nonblocking, so all three Eden declarations explicitly use `BLOCKING`. |
| [Live pricing](https://ai.google.dev/gemini-api/docs/pricing/#gemini-3.8-live) | Published free-tier input/output are free of charge, with product-improvement use. This does not prove the owner's project entitlement, current quota, or unbilled status. There is no paid fallback or Google Search grounding tool. |
| [Live voice configuration](https://ai.google.dev/gemini-api/docs/live-guide#change-voice-and-language), [voice catalog](https://ai.google.dev/gemini-api/docs/speech-generation#prebuilt-voices) | Google links native Live voices to its prebuilt voice catalog, which includes Aoede. Controlled account preflight and the owner’s audible browser test confirmed current project/model/Aoede compatibility; this does not establish public eligibility. |
| [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) | Server mint uses v1beta, `uses: 1`, short connection/credential deadlines, and locked Live connection constraints. The installed SDK's lock-all behavior is retained by omitting `lockAdditionalFields`; client overrides are not accepted. |
| [WebSocket protocol](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) | Use `BidiGenerateContentConstrained` with the temporary `access_token`, never a permanent key. The transport can close while setup is pending. |
| [3.8 initial history](https://ai.google.dev/gemini-api/docs/live-api/capabilities#incremental-updates), [HistoryConfig API](https://ai.google.dev/api/live#HistoryConfig) | Initial context uses `historyConfig.initialHistoryInClientContent: true` and a terminal `clientContent.turnComplete: true` before realtime input. History ingestion does not generate a model turn. These sources were retrieved again on 2026-11-07 for the protocol correction below. |
| [Session management](https://ai.google.dev/gemini-api/docs/live-api/session-management#session-resumption) | Provider handles permit a bounded recovery path. Eden allows at most one recovery with a new constrained credential and the original call deadline; uninterrupted continuity is not presumed. |
| [Gemini API terms](https://ai.google.dev/gemini-api/docs/terms) | Under-18/API-client audience restrictions and unpaid-service restrictions on personal, sensitive and confidential information still apply; improvement/human review remains relevant. Local owner admission is not provider approval, age assurance, a DPA/BAA, HIPAA evidence, or verified legal compliance. Existing public-release questions remain unresolved. |

## Privacy difference from finite typed requests

**Live microphone audio goes directly to Google while the forwarding state is Listening. It is not reduced to the finite typed grammar or redacted before transmission.** It can contain an identifying voice, unintended personal details, or bystander speech. Only synthetic, nonsensitive utterances in a controlled environment are within this supervised evaluation. Automated transcription, keyword checks, and model instructions cannot guarantee removal of sensitive information already transmitted.

The ordinary typed composer still reduces complete supported input into finite semantic intent before its server-side text inference. It is withheld during an active call; after End Call, the user can continue typing against current public page context. The Live engine's bounded direct-text API, if used by a future UI, would have Live's raw-content boundary rather than automatically acquiring the typed reducer's safeguards.

Model-facing page context is separate from microphone content. It permits only page/category/canonical city/radius, result count, approved fictional record IDs and a bounded selected index. It excludes raw DOM, arbitrary titles/descriptions/URLs, account state, coordinates, and raw conversation history. Public factual extracts come from the server's checked demonstration repository. Existing chat text is not replayed as Live history. A pending clarification passes only canonical known slots as a separately validated task part; malformed tasks fail before minting. Both channels share actual page state.

Our Ground does not record raw microphone audio or persist transcripts by default. Temporary PCM, captions, handles, tokens and diagnostic counters remain bounded browser/process state. Captions use the existing in-memory log and clear with its reset/expiry/tab lifecycle. Diagnostics contain fixed failure/event names, counts and numeric close codes, not audio, transcript, credentials or provider error bodies. Google's own processing/retention is separate; a short-lived token is not a zero-retention promise. Spoken answers are model output governed by prompts and verified tool facts, not the typed path's exact fact-ID composition validator; do not claim every spoken factual assertion has been independently validated.

## Local admission and controls

Public/hosted requests remain denied independently of browser UI, notice acceptance and credentials. Owner convenience requires `EDEN_LOCAL_OWNER_ENABLED=true`, the existing current adult/US/free-project grant, allowed loopback origin, development configuration, and process-local transport attestation. `backend/dev.ts` records evidence only when the actual Node listener and accepted socket are loopback; forged Host/Origin/body fields cannot create that WeakSet entry. Proxy metadata is rejected. This proves the local listener/socket boundary, not a remote person's age or identity: do not expose the service through a tunnel or forwarder.

The owner path removes only the separate reviewer-code entry. It preserves session expiry, adult/data acknowledgement, explicit Live-audio acknowledgement, browser microphone permission, quotas and tool validation. Other reviewer admission retains its code requirement. Existing notices are not repeated per audio turn.

Only allowlisted public assistant documents on exact loopback origins in explicit `eden-review` development mode receive `microphone=(self)`, the fixed Google WebSocket origin, and the existing blob-media permission. Ordinary app/build/preview/private/API policies retain microphone denial, no Google WebSocket permission and no media playback. The isolated Rive authoring studio is separate; no Rive runtime is mounted in the normal assistant.

Tool names are `read_public_page_context`, `perform_public_resource_action`, and `ask_clarification`. A model cannot enable device capture or perform private/account/payment/submission actions. `POST /eden/live/tool` authorizes a session/call/tool-ID-bound proposal before mutation; `applyEdenPublicAction` then reuses `ensureEdenSupportPage`/`executeEdenAction`. `POST /eden/live/result` reconciles actual outcomes with the same server-owned records. Stale revisions, changed context, mismatched results and replayed IDs fail safely. Source coverage and operating hours are not invented; the current checked records remain fictional examples, not real services.

## Half-duplex behavior and bounds

Microphone capture starts only after the explicit interaction and browser permission. Actual input sample rate is inspected and resampled to 16 kHz PCM; output is validated 24 kHz PCM. Buffered input is discarded at forwarding boundaries. Forwarding is off during introduction, processing, tools, output playback, cooldown, mute and permission/setup states. Listening resumes only after model-turn completion **and** actual queued-source drain. Generation completion alone is insufficient. The implementation provides Stop Speaking/Skip Introduction and End Call, not verified full-duplex barge-in. Hiding/leaving the tab ends the call and releases tracks, sockets, timers and audio graphs.

### Initial-history protocol correction — 2026-11-07

After Google's `setupComplete`, a new call sends one validated canonical page/task seed with `clientContent.turnComplete: true` while initial-history mode is enabled. The next ordered frame requests the introduction through `realtimeInput.text`. The API defines no separate history acknowledgement; the history terminator does not request model generation and is never counted as the provider's `turnComplete`. No raw chat or transcript is seeded. The constrained token and browser setup contain the identical history configuration. SDK 3 exposes `HistoryConfig` on its wire setup but drops it from its token-constraint serializer, so the server uses the SDK's per-request `HttpOptions.extraBody` to merge only this fixed field. A captured, synthetic SDK request test compares the entire token setup with the browser setup, retaining single-use and lock-all constraints.

The ongoing audio stream no longer receives unfinished `clientContent` context updates. Fresh public state and checked facts come through `read_public_page_context` and completed action results; the instruction requires a fresh read for each new request. Recovery uses its provider handle, omits initial-history mode, and sends neither a new seed nor a repeated introduction. These choices avoid the API's documented best-effort interleaving of `clientContent` and `realtimeInput`.

The pre-correction regression completed an actual search and received `generationComplete`, but the client observed no second provider `turnComplete` before its unchanged 60-second watchdog ended the call. This does not establish the underlying provider cause. Deterministic tests preserve the closed microphone in that sequence and resume only after real completion plus drain. The subsequent browser call completed eight turns with the corrected protocol; its scope and separate idle-onset failure are recorded below.

| Control | Current bound |
| --- | --- |
| Call/provider credential deadline | At most 300 seconds; shortened by Eden-session or grant expiry |
| Initial connection window / mint timeout | 60 seconds / 12 seconds; no automatic mint retries |
| Live mint credits | 3 per Eden session; 6 per UTC day per process; failed/admitted mints and recovery consume credits |
| Active/unexpired leases | One active application call per Eden session; at most two unexpired credential leases per process, including ended leases |
| Provider tool IDs | 20 distinct IDs per call; server one-shot execution tokens expire within 60 seconds |
| Client speech turns | At most 24; local onset requires 160 ms voicing with gaps shorter than 80 ms; a confirmed utterance closes after 30 seconds of detected speech or 900 ms trailing silence |
| Recovery | At most one; provider-issued resumable handle, completed intro, no pending tool/user turn, original deadline; another mint credit |
| Output/setup handling | Bounded preparation/setup/response watchdogs; at most 60 seconds queued PCM; stale generations and tool responses suppressed |

At six five-minute mints the coarse issuance ceiling is **30 credential-minutes per day per process**; recovery does not extend a call. It is not a durable or distributed monthly spend cap. Process restart resets counters, and unrelated clients can use the same provider project. Existing text/confirmation quotas remain; raw Live audio turns do not each pass through the ordinary typed-inference request counter. Published free pricing does not replace owner verification of the unbilled project and actual entitlement.

End Call closes the browser connection and denies further application tools for that lease. Google exposes no credential-revocation operation here: the already issued credential expires at its locked deadline. Credits are not refunded, and ended leases remain counted until expiry. Do not describe End Call or session deletion as instant revocation of every provider-side capability.

## Separately authorized local workflow

These instructions are for an operator who has already checked eligible adult US scope, an unbilled project and current model entitlement; they do not authorize activation by themselves. Keep the permanent key only in ignored server configuration. Use Node 24 and the existing protected grant helper; it refuses overwrites and creates owner-only ignored files:

```sh
npm run eden:reviewer -- --adult-verified --country US --free-tier-confirmed
```

For the explicitly authorized test, set the following **server-only** flags in the ignored local review configuration, after the corresponding checks. Defaults in `.env.example` are disabled/unconfirmed:

```dotenv
EDEN_LOCAL_OWNER_ENABLED=true
EDEN_GEMINI_LIVE_ENABLED=true
EDEN_GEMINI_LIVE_MODEL=gemini-3.8-live
EDEN_GEMINI_LIVE_MODEL_CONFIRMED=true
```

Start `npm run dev:eden:review` and `npm run dev:eden:agent` separately; open `http://127.0.0.1:5199/`. The actual loopback-bound backend must report eligibility/owner/Live availability; a frontend flag is insufficient. Choose Call Eden, review the audio disclosure, allow the browser microphone, and use only fictional resource requests. Do not paste a provider key into any UI. Do not enable billing, tunnel the service or deploy it. Keep the authorized local session available while the owner is testing. When the operator finishes, stop the processes and remove temporary grant material without overwriting unrelated environment configuration; the grant and individual calls expire independently.

## Verification status — earlier supervised local acceptance

The earlier genuine microphone test passed **Harrisburg food search → five-mile refinement → first-result details**, using one real Live connection and actual API-backed page mutations. The owner confirmed audible Aoede. Generated audio drove the mouth while the microphone was paused; Listening resumed after turn completion and playback. Minimize/restore preserved the call, mute/unmute changed forwarding, and explicit End restored the same log and composer. A subsequent corrected typed follow-up changed the distance to ten miles while retaining the city/category. This is historical evidence rather than a fresh EDEN-05 retest. See the [dated record and screenshots](verification/restored-product.md#eden-live--local-verification-2026-11-07) for the exact sequence, rejected proposals, development reload and evidence limits.

That revision's affected **72 tests**, production build, both typechecks, environment check and build secret scan passed. Pending-task continuity, permission denial/slow preparation, replay handling, Stop and one bounded recovery have deterministic tests. Actual network recovery, a fresh Stop interruption, physical mobile browsers and assistive-technology coverage are not certified. Responsive call controls were exercised at 390×690 in the desktop browser. The earlier map limitation is superseded by the actual EDEN-05 map-rendering observation below; an explicit selected-resource focus retest remains separate.

**Local GO:** the authorized adult US operator, current bounded grant, unbilled-project attestation, synthetic speech, fictional data and existing controls. **Hosted/public NO-GO:** current audience/under-18 eligibility, contractual purpose/regions, real-data processing/privacy assurances and hosted access/abuse controls need evidence before activation. Notices and successful calls do not verify legal compliance. No deployment, public access or billing change was made.

## EDEN-05 protocol and idle-onset evidence — 2026-11-07

Fresh typed homepage explanation used two actual Gemini calls. Typed navigation to Give Support performed the original SPA page transition and retained the chat. Live Call 1 performed an actual homepage→Support Harrisburg Food/10-mile search: the resource API returned one approved fictional record and the Support map rendered. Its later response had two generation completions but only the introduction's one turn completion; the unchanged 60-second watchdog ended the call. The search result does not prove a complete voice-turn lifecycle, and the later resource quota does not establish the cause of that provider completion failure.

After initial-history alignment, Live Call 2 explained Support, navigated to Give on the same call, and explained Give. It recorded **eight generation completions, eight turn completions, four tool calls received, zero rejected arguments, one connection and zero recovery**. The owner accepted the speech naturalness. Actual Harrisburg and Philadelphia search attempts encountered the existing public resolver's HTTP 429 limit; Eden represented the failures without invented results. B/C/G/H fresh search-dependent checks remain blocked by that shared 100-request daily protection, whose observed reset was 7:00 PM Eastern November 7 (00:00 UTC November 8). No quota reset or bypass was performed. Older successful refinement/details checks remain historical; current statewide clarification, prohibited-action negatives, and Organizations/About/Privacy model coverage remain automated-only or unverified as detailed in the [page-awareness matrix](page-awareness-coverage.md).

Later in Call 2, while Listening without a new intended request, a local response timeout ended the call with microphone inactive and forwarding off. The observed sequence is consistent with the previous single-frame RMS detector treating incidental noise as an utterance; raw microphone content was not retained for this diagnosis. The new local detector requires **160 ms accumulated voicing**, tolerates quiet gaps shorter than **80 ms**, and resets an unconfirmed candidate after a longer gap. Candidate onset does not start a turn or response watchdog. All Listening PCM still forwards to Google's automatic VAD, including short/quiet speech and onset frames; actual provider output can establish a turn below the local threshold. Candidate voicing invalidates an old resume handle so partial input cannot resume from a stale checkpoint. Sustained noise can still resemble speech; this is a bounded reliability improvement, not an intent or privacy classifier.

The onset change passed **41 focused tests** and both typechecks: isolated/repeated clicks followed by silence do not send `audioStreamEnd` or arm a response timer; sustained onset retains the genuine-request timeout; brief gaps are tolerated; longer gaps reset onset; quiet actual provider output still requires completion and playback drain. The protocol correction separately passed **51 affected checks**, including full captured SDK token/browser setup equality and recovery without reseeding. These are overlapping focused runs, not a final aggregate count. Subsequent actual calls verified genuine greeting playback, microphone mute, immediate exact mouth rest during Skip greeting while PCM was arriving, and explicit End Call releasing the microphone with forwarding off. Mobile compact/expanded/restored chat retained the conversation. The [EDEN-05 verification record](eden-05-verification.md) gives counters, frames, source/build checks and limits; separate mid-answer Stop, controlled acoustic noise-floor and real network recovery are not claimed. The completion/drain gates, watchdogs, hosted denial, microphone authorization and daily protection remain intact.
