# EDEN-06 engineering verification

**2026-11-07.** Approved identity, browser-native SVG motion, Aoede, original pages/navigation, compact/expanded chat, welcome behavior and public action boundary are preserved. No new provider, Rive runtime, billing, database migration, production deployment or public Gemini access was introduced.

## Diagnosis: established evidence and limits

The owner's reported intermittent stop after two or three exchanges is **not yet attributed to one proven real-provider cause**. Historical EDEN-05 evidence includes both a missing provider turn-completion event and a later local no-response watchdog after eight completed model turns. Neither trace established billing or Gemini quota exhaustion. This task reproduces specific application defects independently and adds the missing operational evidence; it does not relabel those historical failures as solved.

**Fresh actual result:** one owner-spoken Aoede call completed **eight model turns, including the introduction, on one connection**. Its observed ending was the application's existing five-minute deadline, with `endReason:app-expiry`, `failure:none` and no provider error. The call did not reproduce an unexplained stop after two or three exchanges. A clear five-minute sentence was added to the existing call notice; no duration or usage limit was increased.

| Reproduced defect | Evidence before correction | Implemented correction |
| --- | --- | --- |
| Documented provider waiting state ignored | After introduction and three complete/drained mocked turns, local speech/silence entered Processing. `serverContent.waitingForInput:true` left Processing unchanged and the response watchdog could subsequently end the call. | Honor the explicit provider signal only when the prior output is settled and this turn has no generated output or pending tool. Clear that local wait and return to Listening. Actual generated output still requires real provider turn completion **and** browser drain. |
| Blocking tool mistaken for missing model response | An accepted tool callback remained unresolved while the existing 25-second provider-response timer ran. Firing that timer produced `response-timeout`, zero function responses and stopped capture, although the blocking provider was waiting for the application. | Separate a bounded 20-second per-executing-tool deadline. Abort late work, return one fixed failed function result, then start the separate provider-response deadline after the tool result is sent. Queue, duplicate-ID and stale-generation guards remain. |
| Suspended browser audio could appear active | Capture's former `active` meant a live track even when its AudioContext stopped processing. Playback suspension could surface later as generic format/drain failure. | Observe input/output AudioContext state, require a running capture graph for forwarding, classify suspension immediately as `microphone-state` or `audio-output-state`, and release call resources. No unsupported automatic audio resume is claimed. |

Gemini 3.8 Live's proactive audio behavior is model-specific; local energy is not proof that the model owes an audible response. Its documented `waitingForInput` signal is stronger evidence than a guess based on elapsed silence. The selected model keeps explicit **BLOCKING** website tools. Current resumption, GoAway, initial history and compression semantics were compared with actual reference code and official model-specific documentation in the [reference review](eden-06-voice-reference-review.md).

## Failure categories

| Category from the brief | Current finding |
| --- | --- |
| A: Gemini quota/rate | Account-specific values were inspected with explicit owner permission. No current Live failure was observed with a quota response. A TTS warning is separate; do not assign it to Live. |
| B: provider overload | Transport now preserves only fixed 503/UNAVAILABLE classification. No fresh genuine overload was observed. |
| C: app timer | **Actual final call ended at its five-minute app deadline**, with eight generation/turn completions, `endReason:app-expiry` and no failure. The app deadline preceded credential expiration by 537 ms. Fifteen-minute session limits remain independent. |
| D: local grant | Current owner grant remains bounded until 4:10 PM Eastern November 7. It was not extended. |
| E: credential expiry | Diagnostic token expiry is separate from app deadline. Single-use scope and constrained setup remain tested. No fresh expired provider token was deliberately minted. |
| F: socket termination | Actual successful call used one connection and zero recovery. Numeric close code, generation, GoAway and resumption events are bounded diagnostics. One safe mocked recovery passes; genuine recovery is unverified. |
| G/H: playback/microphone | The suspension failures above are reproduced and classified. New real-call preparation attempts are described below; a pending permission promise is distinct from a running stream. |
| I: unresolved tool | Reproduced premature provider timer and fixed as above. Accepted tools now have a bounded success/failure response path. |
| J: resource resolver | Read-only Redis inspection during EDEN-06 confirmed **100 of 100 daily resolver admissions consumed**, with 29,836 seconds TTL at that observation. No counter was changed or denied search repeated to manufacture evidence. |
| K: other | Initial preparations stopped at a pending microphone request before any token/socket/audio. The owner resolved permission and started the subsequent successful call. This startup delay was not a Gemini quota or multiexchange failure. |

## Development diagnostics and capacity

The explicit loopback `eden-review` URL opt-in **`?eden-diagnostics=1`** adds a collapsed diagnostics panel outside the ordinary product UI. Normal pages/builds/previews/private routes/non-loopback hosts do not mount it, and it grants no authority. The panel separates Google model capacity, EDEN's local grant/session/token and process limits, and resource resolver failures. Provider capacity is not inferred from local counters.

The safe call reference, fixed model, connection generation, start/deadline/credential expiry, numeric close/provider codes, GoAway duration, resumption flags, PCM/decoding/playback counts, AudioContext states, forwarding and tool outcomes are captured with at most 32 fixed-enum timeline entries. No raw speech, transcript, key, temporary token, resume handle, action arguments, URL, body or provider error text is logged or persisted. Status refresh makes no inference call. Public, spoofed, hosted and unattested status requests omit owner capacity metadata.

The [capacity evidence](eden-06-capacity.md) records the selected project's actual free-tier dashboard values and important limits. “Unlimited” displayed RPM/RPD for Live does not establish unlimited availability. Multiple keys share project limits. Google request-day reset is midnight Pacific; Our Ground's resolver and local counters use UTC-day boundaries.

The API was restarted once to apply the changed backend code, using the same ignored key and existing grant. This was not a quota-recovery action. Local usage snapshots explicitly restart with their backend process and do not represent Google/Redis totals. Real Live verification for this task is bounded to at most two provider sessions; the earlier EDEN-05 four-mint history is not forgotten or used to justify unlimited new tests. Preparation failures before token mint consume zero Live mints.

## Actual browser/model evidence

All inputs used for model checks are synthetic and non-sensitive. The following observations are actual application/provider paths, not mocked replies:

- From the homepage, the new finite platform-orientation intent completed its two-call Gemini plan/result path and explained the platform's mission and public capabilities.
- “I want to give” completed genuine planning and grounded reply composition. It described official-channel giving, denied payment/booking capability and offered navigation. It executed **read-page only**, without navigating or authorizing a donation.
- Explicit About navigation mounted the actual original `/about` template, confirmed the page and retained both prior exchanges in the same assistant.
- Explicit For Organizations navigation mounted `/organizations`, retained the conversation and explained its public access-request process without reading or modifying an account.
- Explicit Privacy navigation mounted `/privacy`; a subsequent fresh real-model exact contextual-help request correctly explained Privacy. Explicit Give navigation then mounted the actual `/give` template with that conversation retained.

The first new 5199 call preparation waited 45 seconds for `getUserMedia` permission, then entered `permission-required`. Diagnostic evidence: **zero connections, zero input/output chunks, zero credential expiry, no provider error**, and microphone/forwarding false after cleanup. Both input/output AudioContexts had initialized, but a running graph alone did not imply an authorized microphone stream. The previously permitted 18418 tab encountered the same pending-permission boundary. No Gemini inference or temporary credential was requested by either preparation attempt. The owner was asked to initiate/allow the call directly before a genuine spoken test could proceed.

Fresh text calls continued after the voice-preparation failure, confirming independent authorized text fallback. No fake Aoede or scripted Gemini answer was substituted.

### Owner-spoken call after permission resolved

The owner then allowed the microphone and started the call in 18418. Actual Aoede responses covered About navigation/contextual help, Organizations navigation, a Harrisburg food-search attempt, platform orientation and a conversational identity question. The direct operational capture observed Organizations→Support, and the in-memory spoken/tool-confirmed About response remained visible. The search failed honestly because the resolver was capped; Eden did not invent a returned provider or successful result.

The final [content-free operational trace](verification/eden-06/live-operational-trace.json) contains nine bounded snapshots and fixed-enum timeline events. It records **8 generationComplete, 8 turnComplete, 391 received/decoded audio chunks, 3,285 forwarded input chunks, 5 executed tools (4 completed, 1 failed), no pending tool, one connection, no recovery, failure none and providerCategory none**. The trace observed completed playback→Listening gates, an approximately 21-second Listening pause, mute/unmute and a later completed response. The owner reported that Eden stayed responsive.

The application's timer fired at elapsed 300,132 ms; phase became ended at 300,149 ms, with microphone and forwarding false. `appDeadline - startedAt` was 300,129 ms, and the credential deadline was 537 ms later. **This observed ending is therefore the app timer, before credential expiration**, not a detected provider disconnect/quota, stuck tool or audio failure. The accessibility state contained “This call reached its time limit. Text is still available.” A [real call-end screenshot](verification/eden-06/live-call-expiry.png) shows the restored text/Call Eden interface; the scroll position displays an earlier synthetic About reply, so this image alone is not proof of the expiry message or timer. The trace is the operational evidence. No raw voice file was recorded.

The observed call emitted no `waitingForInput`, GoAway, provider quota or context-suspension failure. Those repaired/injected paths remain automated evidence; this successful call does not prove unlimited availability, genuine network recovery or that every historical interruption had the same cause. Fresh Give navigation is confirmed through text; no new spoken Give action is claimed from this particular trace.

Total fresh model checks were **seven typed logical turns (14 text inferences) and one actual Live session**. Two earlier preparation timeouts made zero Live mints. Final owner-only status showed one Live mint in this backend process, 15 local admission credits and publicGeminiEnabled false. These counters are not Google project usage.

## Page/action coverage

| Experience | Implemented authority | Fresh EDEN-06 evidence |
| --- | --- | --- |
| Home | Finite mission/page facts; public navigation; canonical search | Genuine platform explanation and giving guidance passed; spoken orientation also completed. |
| Find Support/results | Actual structured category/city/radius, IDs/order/count, selection and finite loading/error/map state; validated search/refinement/details | Existing controller/schema tests pass. Fresh resource work is blocked by daily resolver capacity and absent real DB. |
| Resource details | Current indexed facts reconstructed by backend; no arbitrary listing text | Automated bounds/grounding; no fresh real-record or current-hours proof. |
| Selected map | Existing select/focus for an approved current result and actual map lifecycle state | Local key authorization repaired. Fresh selected-marker/real-coordinate test remains blocked. |
| Give | Page/giving guidance and finite public navigation | Actual typed giving guidance and explicit navigation passed. No new spoken Give action is claimed from this call. |
| Organizations | Public process only; no account or form access | Actual typed navigation/source-backed explanation and owner-spoken navigation passed. |
| About | Mission/source caveats and finite navigation | Actual typed navigation and confirmed page explanation passed with conversation retained; the Live tool-confirmed spoken explanation also completed. |
| Privacy | Fixed processing/control facts and finite navigation | Actual navigation and exact contextual-help request passed through real text inference. |
| Account/auth/staff/admin/unknown | No assistant/private reading, account edits, payments, submissions or arbitrary execution | Negative parser/schema/navigation/authority tests pass. No private information was submitted to a provider. |

The exact A–L examples now reduce whole input to finite intents. Platform orientation and giving guidance are distinct from current-page explanation; giving alone does not grant navigation. Selected “one”/“it” and radius follow-ups use actual current selection/city/category. Whole-input trailing clauses and sensitive information remain rejected before model planning. The same controller executes text and Live actions.

For A–L acceptance: A orientation, B contextual help, C giving and D About navigation passed fresh text; actual Live added orientation, About/Organizations and error recovery. K continuity passed across public pages and within one Live connection. E attempted the genuine search and failed honestly; successful E–H/J resource/detail/map/hours results remain blocked or unverified. I broad-location clarification and L authority denial have automated evidence. No statewide search, open-now status, provider availability or action success is invented.

## Maps, real data and staging

The exact Geoapify cause was established in the signed-in existing project: the browser key's allowed origins included 18418 and excluded 5199. After separate action-time owner approval, only **`^http://127\.0\.0\.1:5199$`** origin and **`^http://127\.0\.0\.1:5199/`** referrer entries were added. Prior entries, server key, CORS and billing were preserved. The configured browser key matched the inspected masked key; no key value was exposed.

Controlled same-local-key/style requests with each origin/referrer now give **200 valid style at 5199 and 18418**, and **401 when probing the existing staging and production origin strings**. These are key-policy probes, not deployed-site tests: the actual production key value/runtime was not read or verified, and staging has no configured key or deployment. Hosted policies were not changed. This proves repaired local style authorization, not completed browser tile/font loading or EDEN selected-location behavior. The saved [referrer restriction image](verification/eden-06/map-local-referrers-saved.png) contains no credential area. Source attribution and accessible list/details fallback remain.

No approved nonproduction DATABASE_URL is configured. The owner elected to document that blocker. The existing installed PostgreSQL cluster remains stopped; no records were overwritten, database created or migration run. Historical HRSA/food import evidence is not a live connection or proof of current service operation. Current AI grounding remains explicitly fictional. A real imported record is distinct from an independently verified operating service; neither establishes open-now availability.

The authenticated **ourground-staging** project exists but has **zero deployments and no environment variables**. The existing production link and cloud settings were preserved. Missing approved real DB/source access, Redis/map setup and applicable Auth configuration prevent the requested real-data staging validation. Repository Node 24 engines should override the project's Node 26 setting under current Vercel documentation; that metadata difference is not itself a proven blocker. **No staging deployment or verified staging URL is claimed.** See the [infrastructure audit](eden-06-infrastructure-readiness.md) for exact targets and owner steps.

## Focused validation

- **147 affected tests** were selected. The sandboxed run passed 134; 13 loopback-listener cases were blocked by sandbox `EPERM`, then all passed in the narrowly approved loopback rerun (17 total cases in that rerun, including four already passing cases). These are not 164 unique tests.
- The bounded ten-turn mock scenario completed 20 delayed serial tool calls, one resolver failure and 19 successful tools, 11 generation/turn completions including the introduction, strict playback drain, mute/unmute, noise, GoAway, one eligible recovery, late old-connection suppression and safe End Call.
- After the final failure-message correction, **31 session/transport tests passed**. Rate/usage, overload, access and local-limit messages are distinct; 429 does not claim daily exhaustion and does not auto-reconnect.
- Final production build after the duration-notice copy passed both typechecks, source secret/environment checks and Vite bundling. Existing chunk-size warnings remain. Final built secret scan: **743 files, no findings**. Browser text inspection confirmed the new five-minute sentence without starting another call. `git diff --check` passed.

No unrelated full test suite, uncontrolled load test, new provider, billing change or hosted Gemini activation was performed. Physical mobile and genuine browser-audio suspension/network recovery remain separate from deterministic tests. The sustained actual microphone call above passed through the expected app deadline.

## Release decision and minimum owner work

**Reliable hosted EDEN demonstration: NO-GO. Public production release of this candidate: NO-GO.** Protected staging is authorized by the request only when prerequisites pass; they currently do not. Non-AI website publication remains independent of provider eligibility, but its real API/data/map/privacy and rollback checks must still pass.

Minimum next steps are: configure the existing approved restricted nonproduction database and validate actual records/source freshness; provision staging environment separation/Redis/maps and Auth only where offered; approve exact hosted map origins while preserving production restrictions; then test the protected staging candidate, headers/logs/accessibility/API behavior and rollback. Investigate any future intermittent voice failure using its first observed trace rather than quota guesses; preserve the five-minute call limit. Hosted AI additionally requires the existing under-18 audience, free-tier data-processing/region/contract eligibility and durable admission/session/replay/quota gates to be resolved with appropriate evidence. An adult checkbox or paid tier is not a substitute.

## Left available for the owner

The API and both local previews remain running; no post-verification disable was performed. Open **http://127.0.0.1:18418/** (the actual spoken-test origin) or **http://127.0.0.1:5199/**, open Eden and choose Call Eden. The [ordinary panel](verification/eden-06/final-local-panel.png) remains free of the optional developer view. The existing notice now says calls last up to five minutes. Microphone consent, current grant, per-session/call/day limits and synthetic-only scope still apply. No call is left recording or forwarding audio.

The owner grant ends **4:10 PM Eastern November 7**, before the resolver's **7 PM** normal reset. Later resource/voice testing needs a new separately bounded authorized session; the grant was not extended to make testing pass. No safe real-data staging candidate exists yet and no deployment URL is claimed.
