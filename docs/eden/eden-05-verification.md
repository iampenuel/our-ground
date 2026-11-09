# EDEN-05 verification and handoff

**2026-11-07.** Local adult/US, unbilled-project, synthetic/non-sensitive evaluation only. This report separates implemented behavior, actual browser/model observations, automated checks and release gates. No deployment, billing activation, public Gemini access, database migration or provider dashboard change occurred. Legal compliance is not certified.

## Result

The owner accepted the corrected speaking motion during genuine Aoede replies: **“Yes, this looks natural enough.”** Main conversation branding now says Eden; the existing first-use notice and Privacy information accurately identify Google's processing. The approved artwork, original website design, compact chat, optional expansion and manual resource controls remain.

Speaking motion follows real PCM playback through the existing output analyser and controller. The visible SVG uses a clean source-derived face region and continuous compatible closed/slight/medium/wide contours, smoothed in elapsed time. It does not cycle rounding/smile shapes according to volume. Independent original-pixel brows, blinking, gaze, gentle head and restrained secondary movement remain. The call portrait is 128px compact/160px expanded; launcher sizing is unchanged. The original PNG is the loading/error/reduced-motion fallback and exact rest source. No Rive player was activated. This is **amplitude animation, not phoneme-accurate lip sync**.

The [research report](speaking-animation-research.md) gives primary sources, tuning rationale, parameters and limitations. Neutral brow/head reconstruction tests found zero RGBA differences against their approved source compositions. No raw audio recording was saved for this verification.

## Actual rendered speech evidence

The corrected Call 2 capture sampled the real visible portrait **145 times over 18.46 seconds** during Aoede playback. DOM diagnostics identified all four opening poses and rest; independent blink and brow changes were observed. Root visually inspected the actual closed, medium, wide and rest PNGs. Screenshots support pose visibility; the owner's live audiovisual review supports acceptance of the pacing.

| Closed speaking moment | Open during speech | Different opening | Approved rest |
| --- | --- | --- | --- |
| ![Closed](verification/eden-05/corrected-closed.png) | ![Wide](verification/eden-05/corrected-wide.png) | ![Medium](verification/eden-05/corrected-medium.png) | ![Rest](verification/eden-05/corrected-rest.png) |

The [slight opening](verification/eden-05/corrected-slight.png) was also captured. Earlier `aoede-*` and `after-greeting.png` files in that directory are investigation evidence from the superseded faster animation or a subsequent state; they are not the final accepted motion evidence.

## Page awareness and A–J results

The [full route/action matrix](page-awareness-coverage.md) is authoritative. Implemented public context covers home, Support/results/details/map state, Give, Organizations, About and Privacy. Explanations use fixed application-owned facts; result information comes from checked records. Both text and voice use the same bounded action controller. No arbitrary DOM, URL, script, private form/account or model-authored resource data is accepted.

| Workflow | Fresh observation and scope |
| --- | --- |
| A: homepage → Harrisburg food | Call 1 performed genuine inference, navigated to Support, searched the existing HTTP API and returned one clearly fictional fixture. Map canvas, attribution and fictional marker were present in the DOM. The later voice turn timed out, so this is action success with incomplete voice completion, not an entirely successful call. |
| B: five miles | Implemented and automated. Earlier EDEN Live acceptance exists; fresh final-revision resource verification is blocked by the current daily resolver limit. |
| C: first-result details | Implemented and automated; earlier actual acceptance is historical. Fresh final-revision check is blocked. |
| D: Pennsylvania healthcare | Fresh typed real-model response asked one city question: “Would you like to search in Harrisburg or Philadelphia?” No invented statewide search or resource action. Healthcare remains the finite pending category. |
| E: page explanation | Fresh typed homepage explanation used the genuine two-call plan/result path. Actual Live Support and Give explanations described their corresponding current capabilities and limits. Organizations/About/Privacy are implemented and tested, without a fresh model/browser acceptance claim. |
| F: Give navigation | Passed typed and actual Live. Existing Give template mounted at `/give`, preserving the assistant/conversation; the Live call continued on the same connection and then explained Give. |
| G: selected map resource | Current-index/map-state validation is automated. A final selected-resource focus/tile check is blocked; no real-provider coordinate verification is claimed. |
| H: open now | Indexed read-only hours capability and source uncertainty are tested. Fictional/static hours cannot establish real opening status. Fresh model response and real time-zone/current-hours evaluation are unverified. |
| I: unsupported actions | Fresh typed “Make a donation for me.” stayed on Give, executed no action and showed finite-input guidance. This is application validation, not a claimed Gemini refusal. Account/application/private-route denial is automated; fresh spoken refusal is not claimed. |
| J: failures/recovery | Actual Harrisburg/Philadelphia search failures were reported accurately after resolver 429s, without invented results. Observed response/turn timeouts ended safely with microphone/forwarding false and text controls available. Cancellation, stale results, replay and reconnect behavior are automated; genuine network-loss recovery remains unverified. |

The aligned Call 2 completed **eight generation-complete and eight turn-complete events**, with **one connection, 202 audio chunks, four received/executed tool calls, zero rejected arguments and zero recoveries** at conversation completion. It does not establish every tool or reliable network recovery.

## Protocol and microphone reliability

The current Gemini Live history protocol is used for the one initial minimal context seed, with explicit locked `historyConfig.initialHistoryInClientContent:true` and terminal history completion before the greeting. The installed SDK's missing config serialization is handled through a server-owned fixed `extraBody` setup patch; offline capture verifies that the constrained token and browser setup match. Resumed sessions omit this initial-history mode. No raw chat history is seeded and no arbitrary config patch is accepted. See [Live development](eden-live-local-development.md) for official references and the exact boundary.

An earlier call observed generation completion without the required provider turn completion. **The completion gate was not relaxed:** listening resumes only after provider turn completion and browser playback drain. A later idle period started a local request watchdog from a noise candidate; it timed out safely. The final narrow correction requires 160ms accumulated voicing with less than 80ms gap tolerance before starting a local request/watchdog. All Listening PCM, including short/quiet onset, still reaches provider VAD; genuine provider output can establish a short turn. Isolated-click/noise, gaps, real timeout and quiet-response cases pass focused tests. This is not a certification against sustained ambient sound; no controlled acoustic/noise-floor measurement was made.

After that final source correction:

- **Call 3:** real Aoede greeting completed (48 audio chunks, one generation/turn completion). Microphone mute showed the muted state; input chunk count remained unchanged. All visible mouths were exact rest. Explicit End Call returned phase `ended`, microphone `false`, forwarding `false` and usable text controls. A later Listening→Thinking transition occurred without a reference recording of the room; this is not proof of silent-room false-positive elimination.
- **Call 4:** Skip greeting was clicked while actual audio was arriving (58 chunks, before generation/turn completion). Every mouth immediately reported exact rest, phase remained processing and microphone forwarding remained false. Later incoming audio was discarded. Explicit End Call stopped the call and released the microphone; 83 received chunks do not mean continued audible playback. No provider completion was fabricated to resume listening.

The greeting interruption exercises the shared output-stop path. A separate fresh mid-answer **Stop Speaking** click is not claimed. Earlier tests cover that controller path.

## Product and accessibility checks

Fresh 390×690 viewport checks passed compact → expanded → restored chat, preserving the real clarification and prior voice transcript. Desktop viewport was restored. No new branding chip or extra panel was introduced; appropriate provider/raw-audio notices remain. Reduced-motion and explicit-zero restoration are automated and preserve the original static artwork. Physical mobile browsers, screen-reader speech interaction and full assistive-technology certification remain unverified.

![Current desktop panel](verification/eden-05/desktop-final.png)

[Mobile compact screenshot](verification/eden-05/mobile-compact.png) · [Mobile expanded screenshot](verification/eden-05/mobile-expanded.png)

## Map, data and operational blockers

The [map/source audit](map-and-resource-readiness.md) records exact evidence. The **same key and style** returned 200 at the existing approved `http://127.0.0.1:18418` origin and 401 at 5199/localhost5199. The 18418 review server now uses the correct explicit local review headers, permitting microphone self and the fixed Google WebSocket destination. Ordinary production/private/API policies were not loosened.

**5199 map authorization remains unresolved externally:** the owner must inspect the existing Geoapify browser key's allowed origins and, if enabled, HTTP referrer entries for the literal `http://127.0.0.1:5199` origin and matching path pattern, retaining all legitimate existing restrictions. No wildcard, proxy, header stripping, alternative key or dashboard edit was used. DOM evidence on 18418 is not a complete tile/font/selected-marker capture or real-data coordinate proof.

The existing shared Redis resolver limit is **100/day globally**. At 13:51:10Z the actual request returned `429 RATE_LIMITED`, `Retry-After: 36612`; the UTC daily reset is **7 PM Eastern on November 7**. No counter, budget, identity or provider path was reset or bypassed. Fresh resource scenarios must wait for normal availability. The current grant expires earlier, so a later test needs another explicitly authorized bounded session rather than a silent extension.

Current EDEN grounding uses two allowlisted fictional API records. Real-mode scoped search returned zero, local DB/Supabase configuration is absent, and returned remote environment metadata contains no database/Auth names. Historical HRSA/food imports and schema support do not prove a connected, complete, fresh nationwide directory. Fixtures remain explicitly separated and labelled. Real grounding needs its own approved minimal source projection, provenance/privacy review and current database/source verification. No provider details, eligibility or hours are guessed.

## Automated validation

- **122 affected tests passed** after animation/history/page integration. These include source reconstruction, smooth monotonic mouth motion, immediate rest, launcher lifecycle, agent grounding, page navigation/context, Live contracts/actions/audio, strict completion, stale/error and authority boundaries.
- The final narrow microphone-onset change passed **41 affected contract/session/audio/action tests** and both typechecks. These overlap the earlier run; do not add their totals or describe them as separate unique tests.
- Final `npm run build` after the last source edit passed, including source secret scan, browser/server environment separation and frontend/backend typechecks. Existing bundle-size warnings remain; no build failure.
- Final `npm run check:secrets:build` passed: **722 files, no findings**. No raw credential-bearing logs or URLs were copied into the evidence.

No unrelated full test suite, cloud deployment, paid capacity, live place-provider expansion, database migration or production flag change was performed.

## Local handoff and release decision

The API on 8789 and existing 5199 review session remain running. The approved-map-origin review is also available at **http://127.0.0.1:18418/**. Open Eden, choose Call Eden and use only synthetic/non-sensitive speech; the separate microphone/provider disclosure still applies. For a search-free check, ask what the current page supports or request Give navigation. Resource requests can currently fail due to the preserved resolver cap. No call is left listening after verification.

The bounded local owner grant expires **2026-11-07 21:10:16.879 UTC — 4:10 PM Eastern**. Individual sessions/calls and budgets retain their own existing limits. The service was not disabled after testing, and no expiry/usage limit was extended to manufacture a passing result.

Final read-only HTTP checks returned 200 for both preview homepages and the API status endpoint. Status reported agent, Live, speech and local-owner availability true, with `publicGeminiEnabled:false`. This check made no provider request and does not override any call/session/day budget or the resolver 429.

**Controlled staging is not yet authorized or verified; public production and hosted Gemini remain NO-GO.** The [Vercel readiness report](vercel-release-readiness.md), based on current official documentation/read-only metadata, defines the exact staged plan: authorized protected target, verified DB/TLS/role/migrations and real sources, exact map domain, distributed Redis protections, Auth where offered, correct API methods/headers, log/retention review, accessibility, rollback and operator readiness. Current Vercel WebSocket support is not an architectural blocker; this app uses direct browser→Google Live transport.

Public AI additionally needs resolved under-18 audience eligibility, student/professional-purpose interpretation, region/free-tier restrictions and processing obligations, meaningful hosted admission, durable distributed session/replay/quota controls, and an approved real-resource context boundary. An adult checkbox or paid tier alone does not resolve those issues. Non-AI public website readiness is assessed independently; publication still requires its exact infrastructure checks and separate deployment authorization.
