# EDEN-06 voice reference review

Reviewed and retrieved **2026-11-07**. This review used public documentation, the actual reference source files listed below, and EDEN's local source and synthetic test harness. Reference code was read, not executed. No provider requests, credentials, quota changes, billing changes, or deployments were made for this review.

## Conclusion and evidence boundary

The evidence does **not** establish that Gemini quota caused the reported stop after two or three exchanges. Nor does it establish one universal frontend cause. There are reproducible local failure paths and model-specific contract differences worth correcting; a real failing call still needs its sanitized event sequence to attribute its cause.

Keep EDEN's existing half-duplex boundary, source-based playback drain, fractional input resampler, current-model locked setup, call-scoped action ledger, explicit microphone consent, and bounded recovery. The references reinforce these controls; none is a complete drop-in replacement for EDEN's privacy and authorization requirements.

This is a review snapshot. Root and the contracts agent are implementing reliability changes concurrently. Findings below describe the reviewed behavior and the required verification, not a claim that every issue remains unfixed in the final working tree.

## Inspected reference implementations

These are pinned revisions retrieved through the GitHub connector, rather than assumptions about repository descriptions:

| Reference | Revision and files inspected | Useful evidence and limits |
| --- | --- | --- |
| Alethia Live | [`64fbed37`](https://github.com/iampenuel/alethia-live/tree/64fbed37c6a9a5bfbc99e3baa32f0e6fc2ca576d): `src/lib/live/client.ts`, `src/lib/live/config.ts`, `src/lib/audio/{mic,player}.ts`, `src/app/api/live-token/route.ts`, `src/app/page.tsx` | Explicit microphone/output lifecycle and scheduled-source cleanup. Uses an older 2.5 model and `v1alpha`; requests a 16 kHz context but labels the actual input rate rather than implementing EDEN's explicit streaming conversion. Its token handler and logging are not an authorization/privacy template for Our Ground. |
| Sema | [`7175581d`](https://github.com/iampenuel/sema/tree/7175581dee3193303316e3dc51a767606734eebf): `hooks/useSemaLiveSession.ts`, `lib/live/live{PcmOutputPlayer,MicrophoneCapture,Audio,OutputTurnGate,SessionConfig,Errors}.ts` | Strong separate server-completion/player-drain gate, connection/turn guards, playback progress and context-clock diagnostics. Not every detail should be copied: its per-buffer resampling rounds independently, its configuration reflects different model capabilities, and its hook only records GoAway/resumption events in the inspected path. |
| Google Live examples | [`3bcae116`](https://github.com/google-gemini/gemini-live-api-examples/tree/3bcae1162d1bc6955672153310e4f84eba6621ff): `gemini-live-ephemeral-tokens-websocket/{server.py,frontend/geminilive.js,frontend/mediaUtils.js,frontend/script.js,frontend/audio-processors/playback.worklet.js}` | Current constrained `v1beta` browser socket and server-minted ephemeral credentials; input/output context handling and FIFO PCM playback. The sample prints data that EDEN must keep private, including the service URL containing the ephemeral token and full messages. Its concurrent tool execution is not a website-action authorization or deduplication system. |
| Google web console | [`0a4542fe`](https://github.com/google-gemini/live-api-web-console/tree/0a4542fe0e39d07956ea7af5de45d7c81fde8960): `src/lib/{audio-streamer,audio-recorder,genai-live-client}.ts`, `src/hooks/use-live-api.ts` | Ordered audio scheduling, interruption cleanup, recorder start/stop race handling and SDK callbacks. The inspected hook defaults to an older 2.0 model. `AudioStreamer.complete()` invokes its completion callback directly; that API alone must not be interpreted as proof that all scheduled audio was audible and drained. |

## Current official contract

All URLs in this section were retrieved **2026-11-07**. Where generic examples and model-specific guidance differ, the selected **base `gemini-3.8-live`** contract takes precedence.

- Base 3.8 omits configurable thinking settings, supports audio responses, defaults tool execution to `NON_BLOCKING`, and permits explicit `BLOCKING`. Proactive audio is permanently enabled, so the model may legitimately decline irrelevant input. EDEN's explicit blocking declarations are appropriate for the existing action gate. Copying old thinking or proactivity flags would be wrong. [Model-specific migration guide](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live#migrating).
- Process every field in a bundled server event. The base-model comparison differs from Extended Thinking: the latter's background reasoning/`IN_PROGRESS` caveat must not be imposed blindly on base 3.8 or inferred from missing fields. [Live capability comparison](https://ai.google.dev/gemini-api/docs/live-api/capabilities#model-comparison).
- `waitingForInput` explicitly indicates that the provider is waiting for further input. Initial-history mode consumes terminal `clientContent` history without generating a reply, after which realtime input begins. Generation completion, model-turn completion, and actual browser playback completion are distinct boundaries. [Live wire schema](https://ai.google.dev/api/live#BidiGenerateContentServerContent), [history configuration](https://ai.google.dev/api/live#HistoryConfig).
- Input should be resampled from its actual capture rate to 16 kHz; small chunks of roughly 20–40 ms reduce latency. Output PCM is 24 kHz. EDEN's streaming interpolation and 20 ms packets fit this guidance better than assuming the browser honored a requested context rate. [Live best practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices#resampling), [audio capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities#audio-formats).
- Without compression, documented audio-only sessions last up to 15 minutes; individual connections last around 10 minutes. GoAway supplies remaining time. Resumption uses the latest eligible handle; documented handles remain valid for two hours after termination. EDEN's five-minute application cap is substantially shorter, so lack of compression alone does not explain a few short exchanges. [Session management](https://ai.google.dev/gemini-api/docs/live-api/session-management).
- The temporary token's new-session deadline controls when a connection may start; its overall expiration controls its permitted lifetime. The defaults are one minute and 30 minutes respectively. A `uses:1` credential can support documented resumption within expiration; EDEN deliberately uses a fresh constrained credential for its one bounded same-call recovery. Treat token-start expiry, call expiry, grant expiry and provider closure separately. [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).
- Limits apply per project, rather than per API key. Active account limits must be read in AI Studio; daily request quotas reset at midnight Pacific. A 429/resource-exhausted category does not by itself prove that the daily allowance was exhausted. No account-specific capacity was inspected in this subtask. [Official rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## EDEN comparison and concrete findings

Reviewed files: `src/eden/live/{session,transport,microphone,output,audio}.ts`, the capture worklet, `shared/eden-live.ts`, and the corresponding tests. Findings were sent to root/contracts before this document was completed.

### 1. Pending tools can consume the model-response watchdog — reproduced locally

In the reviewed `toolCall()`, EDEN calls `expectResponse()` **before** awaiting `onToolCall()` through its action queue. This arms a 25-second model-response deadline while a blocking provider is correctly waiting for a website action's result. The callback has no independent deadline in that snapshot.

An offline probe reused the actual session-test harness with one valid `read_public_page_context` call and an unresolved action promise. Firing the real armed 25-second callback produced:

```json
{"before":"acting","after":"error","failure":"response-timeout","toolResponses":0,"microphoneActive":false}
```

This proves a local failure path, **not** that it caused the owner's observed call failure. Correct it with a separately bounded tool deadline, a fixed failure function-response for an accepted action that times out, and the provider-response watchdog starting after the response is sent. Late completions and cancelled/old-connection callbacks must stay inert. Never turn a timed-out action into claimed success.

### 2. Valid provider waiting/silence conflicts with a mandatory reply assumption

The reviewed local onset detector waits for sustained energy before closing a microphone turn, an improvement over reacting to one click. Nevertheless, noise/background speech can still satisfy it. `closeUserTurn()` then enters Processing and unconditionally starts a fatal response deadline. `message()` did not handle documented `waitingForInput` in the inspected behavior.

Because 3.8's proactive audio is always enabled, local energy is not proof that the provider owes an audible reply. A controlled synthetic `waitingForInput` test is needed. A safe return to Listening must require no pending tools, no unfinished output and no scheduled audible audio; genuine missing completion after an actual response must still time out. This is a **source/protocol mismatch**, not a confirmed diagnosis of a real silent turn.

### 3. AudioContext suspension needs an observable boundary

At the initial inspection, microphone `active` checked live tracks without checking its AudioContext; neither graph propagated runtime state changes. A suspended capture graph could therefore leave the UI appearing to forward audio while its worklet emitted none. Output checked context state when enqueueing, but suspension after scheduling could surface only as a generic drain timeout.

During this review, root/contracts added context-state getters/listeners and diagnostic fields. Verify that these are actually wired into session construction, that a non-running microphone cannot claim forwarding, and that unexpected output suspension has a bounded, truthful outcome. Suspension testing remains necessary; source changes alone do not prove behavior on the owner's browser. Sema's source-end/clock progress diagnostics are useful here, but automatic `resume()` is not guaranteed to succeed without browser user activation.

### 4. Keep the existing stronger boundaries

| Area | EDEN behavior to preserve / verification needed |
| --- | --- |
| Audio completion | Require provider turn completion **and** actual source drain, then cooldown; `generationComplete` alone cannot release the microphone. Delayed/duplicate completion must not replay transitions. |
| Input conversion | Keep fractional resampler state across worklet frames; discard buffered partial audio at gate changes. Test long 44.1/48 kHz inputs and stale worklet epochs. |
| Half-duplex | Forward only while Listening, visible, unmuted, context-running and not acting/playing. Keep explicit Stop/Skip discard semantics; do not add claimed barge-in. |
| Recovery | Keep one eligible same-call recovery, original deadline, connection-generation guards, pending handle promoted after safe completion, and no repeated introduction. Failed recovery must fall back without a fresh-session retry loop. |
| GoAway | The reviewed handler waited for actual closure and did not expose `timeLeft`. Add bounded numeric diagnostics; only recover at an authorized safe boundary. Do not resume partial actions because a handle exists. |
| Tools | Keep exact schemas, actual provider IDs, signature collision checks, same-call ledger and action serialization. Return results for accepted calls; reject unknown or private actions. Sample `Promise.all` tool execution is unsuitable here. |
| Cleanup | Keep synchronous gate closure, track stops, worklet port closure, source cancellation, context closure, lease release, late-promise guards and hidden-tab termination. |
| Error attribution | Preserve numeric close code and finite provider/service categories, not full messages or URLs. A local response timer, grant expiry, resolver cap, provider429, overload and abnormal1006 close are separate evidence. |

## Verification priorities and unresolved questions

1. Run deterministic regressions for pending/failed/cancelled actions, late tool results, duplicate IDs and a response arriving exactly at the timeout boundary.
2. Exercise `waitingForInput`, silent completion, bundled audio/transcription/completion, late captions, and a long response whose generation ends before playback. Retain strict completion/drain gates.
3. Suspend each browser AudioContext independently, end the call during pending permission/setup/recovery, and confirm no false microphone-forwarding state or retained track.
4. Inject GoAway, numeric provider error categories and normal/abnormal closures. Verify eligible recovery once, no introduction replay and no duplicate action; validate token scope and original call deadline.
5. For the next authorized genuine call, correlate only bounded event counters/times, finite error categories, context states and turn/tool generations. Determine the observed failure from that trace. Neither a unit test nor reference similarity establishes quota capacity or real-browser reliability.

Unresolved in this independent review: the actual failing call's terminal event; current project-specific free capacity; whether a particular provider waiting event occurs in that call; actual browser suspension behavior; and real multiexchange recovery success. These require the owning agent's authorized evidence. This review does not certify deployment readiness, legal eligibility or a quota diagnosis.
