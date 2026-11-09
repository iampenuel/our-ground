# Eden Live tool-result verification

The protected team alias serves **`2665050781818a169461132b5d200699a6bbb5e4`**, deployment `dpl_EKrTUghrZRaW9GFntHRSvWqQuEMU`. [Canonical staging](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) · [Immutable candidate](https://ourground-staging-f5is6vbrt-penuels-projects-aa802b06.vercel.app).

## Corrections and attribution

The previous client injected `audioStreamEnd` one second into an outstanding blocking tool. The new controlled boundary test fails against `d4e26c0` because of that frame. The correction pauses microphone forwarding during the action and preserves the outstanding tool turn until its matched result returns.

The tool handler also recorded a response as sent before checking the transport return. It now records queue acceptance only after the custom wrapper accepts the send. Native `WebSocket.send()` returns void. Our wrapper's explicit false represents local rejection, while true records local send acceptance. Browser-observed outgoing frames and subsequent provider events remain separate witnesses. Cancellation suppresses late results and keeps a bounded wait for provider idle or output.

The old receipt lacks a tool-response frame witness, so it cannot establish whether that particular call had a rejected send or precisely how Google handled its extra turn boundary. The corrected same-model call passed. This establishes working behavior after the app corrections without attributing the old silence conclusively to Google.

Standard `gemini-3.8-live` and Aoede remain selected. Tools retain explicit `BLOCKING` behavior. Google documents response scheduling and `willContinue` for nonblocking calls, so no scheduling override or generator response was added. [Google model compatibility](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) · [FunctionResponse contract](https://ai.google.dev/api/generate-content#FunctionResponse).

## Actual acceptance

One genuine hosted call used locally generated public speech through Chrome's microphone boundary, the real worklet and Google WebSocket. The [unaltered receipt](eden-call-evidence/2665050-live.json) is **PASS**.

| Step | Result |
|---|---|
| Audible introduction and identity | PASS, measured provider PCM and browser playback |
| Spoken healthcare search | PASS, six Harrisburg healthcare listings and five landed search cursor targets |
| Spoken search description | PASS, “I found 6 healthcare listings within 10 miles of Harrisburg.” At least one second of measured playback preceded the interruption |
| Interruption and first result | PASS, provider-confirmed interruption, correct first listing opened and described aloud |
| Another question in the same call | PASS, another spoken identity exchange after the follow-up |
| End and cleanup | PASS, one socket closed 1000, release HTTP 200, all captured tracks ended |

The browser recorded search function receipt at **30,753 ms**, action verification HTTP 200 at **41,435 ms**, its matched outgoing response at **41,437 ms**, and the next provider event at **42,184 ms**. Google then requested current page context. Its matched response left at **42,944 ms** and search caption plus PCM arrived at **43,413 ms**. An acknowledged interruption followed at **45,027 ms**. The verified first-result action returned at **50,354 ms**, its response left at **50,355 ms**, and caption plus PCM followed at **50,963 ms**. Raw function IDs remain in test memory. The receipt retains ordinals, enum names and times.

[First-result screenshot](eden-call-evidence/2665050-first-result.jpg) · [Synthetic search and follow-up recording](eden-call-evidence/2665050-search-followup.webm).

## Regression and release status

- **PASS** — 764 automated tests, frontend/backend typechecks, build and secret scan. All [136 deployed asset hashes](eden-live-action-evidence/deployment-2665050.json) match. Anonymous homepage and Eden status requests return Vercel authentication redirects.
- **PASS** — [three provider-fixture browser cycles](eden-call-evidence/94fa792-cycles.json) on the handoff correction before the final cancellation addition. The final cancellation logic has its own local regression test.
- **PASS** — [wordmark alignment](eden-call-evidence/2665050-header.json), focus and Home navigation at desktop, tablet, mobile and actual 200% Chrome zoom. Gutters match at 60, 32, 20 and 30 CSS pixels respectively. The initial zoom harness used an unsupported viewport reset and was corrected before this passing run. [200% screenshot](eden-call-evidence/2665050-wordmark-200.jpg).
- **PASS for smoke checks** — [Google chooser, canonical PKCE callback, anonymous organization denial and effective Live limits](eden-call-evidence/2665050-auth.json). Prior real account/session renewal evidence remains in the earlier release report.
- **PENDING** — owner physical-microphone acceptance on this runtime, real assigned-organization authorization, manual Safari/VoiceOver acceptance and production configuration verification. Text, Dictate and Read reply have automated coverage, with their earlier real evidence retained. This focused pass generated no new TTS request.

The effective limits remain **24 confirmed team starts/day, 6 per signed tester browser, 32/8 provider credential attempts, two provider slots and at most 600 seconds**. All daily application budgets reset at 00:00 UTC. A missing provider reply still reaches the bounded watchdog and offers text continuation. No automatic tool replay, voice/model substitution or repeated provider-call loop was added.

Production readiness remains **HOLD** pending the outstanding release gates and owner approval. [Production checklist](eden-production-cutover.md). Source, dependencies and credentials used internal APFS. Full synthetic recordings and screenshots are under `/Volumes/Penuel Back/OurGround-Work`. The full change set is available in [the runtime comparison](https://github.com/iampenuel/our-ground/compare/d4e26c0529698516d4de7c24a1ee755e09ebeb16...2665050781818a169461132b5d200699a6bbb5e4).
