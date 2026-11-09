# Restored Our Ground product — verification record


## Final startup and welcome fixes — 2026-11-06

This is the current acceptance record. It supersedes the earlier launcher-only SVG correction's header renderer and welcome persistence below. Compact chat, Expand/Restore, the approved illustration and the existing AI/security boundary remain.

**Exact causes and changed components:** `assistant.ts` still mounted `loadEdenRive` in its conversation-header `loadCharacter()` branch when `main.ts` passed `nativeRive` for local review. The header now mounts the same approved profile SVG implementation as the launcher, once per assistant instance, with its exact PNG visible until decoding/painting completes. The normal application no longer passes or accepts that native-Rive option. The Rive authoring studio, original files, exports and required branding remain unchanged; no active player's splash was concealed or altered. No Rive player remains in the normal launcher/chat experience.

The old introduction called `dismiss()` on chat opening and wrote the same v2 flag as X. It also omitted welcome when storage was blocked. The deterministic v3 model has visible, hidden-for-page, explicitly-dismissed and disposed states: opening only hides for that interaction; only the actual X writes `dismissed-by-x`. Reload creates a new interaction and welcomes again unless X was recorded in that tab session. Ambiguous v1/v2 flags are ignored because they cannot establish an X click. Blocked/corrupt storage welcomes; if storage cannot save X, dismissal remains in memory for that page. Nothing is stored permanently in localStorage.

| Required browser check | Actual result |
| --- | --- |
| A — fresh visit | Homepage and approved circular launcher appeared with welcome. PNG was visible during an uncached delayed layer load; independent SVG motion followed. EDEN had zero canvas elements. |
| B — open/close then refresh | Clicking welcome opened compact chat. Closing hid welcome for that interaction. Reload showed welcome again without an X click, including the original application tab's final state. |
| C — explicit X | X hid welcome; it stayed hidden on Support, after returning Home, and after refreshing the same tab. |
| D — new session | A newly created top-level tab at the same origin, with independent sessionStorage, welcomed again while the explicitly dismissed tab remained dismissed. This verifies a fresh **page/tab session**, not an operating-system/browser-process restart or restoration of old tabs. |
| E — header opening | Exact approved PNG was decoded and visible during the delayed cold start. It transitioned into `svg-profile`; no Rive canvas, black circle or branding appeared. Repeated opening retained its SVG identity and feature time. |
| F — Expand/Restore and actual AI | A genuine adult-authorized local Gemini Harrisburg food turn was expanded/restored while Thinking. It completed the actual Home→Support action and HTTP fictional listing reply, preserving the next draft and the exact header SVG namespace. No duplicate conversation row or scripted reply was used. |
| G — mobile/accessibility | At 390 × 844, welcome sat above the unchanged 68px launcher. Compact measured 374 × 520; expansion alone made the app inert/modal and used 844px height. Enter opened; Escape returned focus to launcher. Tab wrapped inside expanded mode. Reduced motion exposed exact PNG; resuming/minimize/reopen retained the same SVG (feature frame 5→61). Mobile conversation scroll **203px→203px**, draft unchanged, outer page scroll **0→0** across Expand/Restore. At 390 × 300, composer/footer remained within the 374 × 284 sheet. These are browser/viewport checks, not full assistive-technology or physical-device certification. |

**Cold and throttled loading:** a temporary localhost server delayed each layer request by six seconds. The test exposed duplicate downloads from launcher/header and the prior 12-second deadline. The final loader shares one bounded cache of ten immutable layer Blobs per page, with independent per-portrait decoding, clip IDs, state and cancellation. Shared and consumer loading bounds are 30 seconds; one cancelled consumer cannot cancel the other or resurrect itself. Download failure clears the cache for retry. Under the delayed uncached origin the approved PNG stayed visible, and actual SVG eventually painted successfully. This is an intentionally delayed asset test, not a claim of a six-second total load or a measured bandwidth benchmark. No user/provider content is in this cache.

**Actual motion recording:** [33-second header APNG](header-desktop-motion.png) and [capture measurements](header-motion-evidence.json). The recording contains **489 real browser screenshots**, feature-render count **3017→4939**, the same SVG instance throughout, **zero EDEN canvases**, and a nonempty application throughout. Eyes-open and blink frames are preserved as [open](header-eyes-open.png) / [blink](header-blink.png). No pose was forced or generated. The existing controller now supplies tiny spring-smoothed state and audio reactions to gaze, eyelids, head and hoops. The source smile stays baked in; this is audio-reactive motion, **not lip-sync**. No fresh Aoede playback is claimed; its API/controller protections and focused tests remain preserved.

**Related cream-page flash:** delaying trusted local-review Support status reproduced an empty `#app` before its five-second wait completed. `support.ts` now renders the existing navigation/footer and accessible loading status before the same wait; full Support still mounts once with the original status-derived data gate. Separately, review-server logs showed ordinary builds writing `dist/index.html` caused Vite full reloads because that output differed from the review entry's output directory. The base watch configuration now ignores `dist`, `dist-eden` and `dist-eden-assistant`. A real production build ran with the header mounted: its SVG identity/time and application content survived, without source HMR being disabled. Ordinary interaction was not found to clear the application; no router rewrite was made.

**Final checks:** **147 focused EDEN tests passed**, including explicit-X/refresh state, cached loading/concurrent cancellation/retry, controller events, real-action contracts and privacy/security checks. Production build passed, including frontend/backend typechecks; the existing large-chunk advisory remains. Final built-artifact secret scan passed: **657 files, zero findings**. Whitespace check passed. Original PNG hashes and layer byte identity remain covered.

Evidence screens: [cold header PNG](startup-header-slow-png.png), [live SVG header](startup-header-svg-ready.png), [welcome after refresh](startup-welcome-after-refresh.png), [mobile welcome](startup-welcome-mobile.png), [mobile header/reduced motion](startup-header-mobile.png), [mobile independent scroll](startup-mobile-scroll.png), [genuine pending Gemini turn](startup-gemini-pending.png), [genuine returned result](startup-gemini-result.png), [reproduced blank Support](startup-support-before.png), [corrected pending Support](startup-support-loading-fixed.png), [final Home and welcome](startup-final-home.png).

Temporary delayed servers/configuration and reviewer grant/code files were removed. The default API's actual final status was `mode: disabled`, `publicGeminiEnabled: false`, `agentAvailable: false`, `speechAvailable: false`, `evaluationData: null`; the UI withheld its composer. The original application tab was returned to Home with welcome and the animated SVG launcher, and test viewport overrides/tabs were cleared. The owner key, privacy/age/geography gates, resource/agent code and Aoede integration were not changed. Map authorization remains a separate known limitation. **No deployment, billing change or public Gemini activation occurred.**



## Earlier compact chat and launcher correction — 2026-11-06

This section supersedes the earlier default panel/launcher presentation below. The earlier agent, map, voice, and provider observations remain dated evidence, not new claims for this UI correction.

**Result:** desktop chat opens at **390 × 480px**, floating over an unchanged-width page. Expand alone uses the spacious layout; Restore returns to compact. Mobile at **390 × 844px** opens a **374 × 520px** nonmodal sheet and expands to the full viewport only on request. At a **390 × 300px** short viewport, the sheet measured 374 × 284px; the composer and footer remained inside it with a separately scrollable message area. This is viewport emulation, not a physical-device keyboard certification.

| Fresh check | Observed evidence |
| --- | --- |
| Persistent welcome | Visible automatically without moving focus; remained visible for the full 33-second desktop recording and after page scrolling. In a fresh mobile Support tab, typing `Pittsburgh, PA` left the welcome visible and focus in `locationInput`. Explicit close survived reload; opening the conversation remembered dismissal across navigation. No timeout exists. |
| Compact and expanded state | Typed draft, context and conversation survived Expand/Restore. A settled compact reading offset of **293px restored to 293px**. The redundant body ResizeObserver was removed so resizing cannot force a reading position to the bottom. Minimize captures visible scroll before hiding; reopening does not overwrite it from a hidden panel. |
| Genuine Gemini and page actions | In the already authorized adult US local environment, a real Harrisburg food request navigated from Home to the existing Support page and returned the actual HTTP fictional record. Expand/Restore occurred while `Thinking…` was visible and the next draft survived completion. A second real turn updated the actual radius control/URL to **5 miles** while resizing; one user row and one grounded Gemini reply appeared for that turn. No scripted reply was used. |
| View results | Desktop kept compact chat open and focused the actual results region. Mobile expanded chat restored to its compact sheet, kept draft/messages, and switched the real resource view from map to list. |
| Keyboard and accessibility state | Enter opened chat; Escape minimized and returned focus to the launcher. Full-screen mobile expansion alone set `aria-modal=true` and made the app inert; Tab from the last expanded control wrapped to Restore. Compact mode remained nonmodal. Conversation retains its polite live log and named controls. No full screen-reader audit is claimed. |
| Reduced motion and reuse | The motion control exposed the exact PNG and hid/stopped the animated SVG. Turning it off resumed the same feature renderer rather than creating a new instance. Feature counts continued across chat open/close. |
| Slow/cold/repeated loading | A temporary local server delayed **only the ten layer files by 6 seconds**. During loading the approved PNG was decoded, visible, and unobstructed (`renderer=static`, no SVG yet). After every layer decoded, `svg-profile` became visible and the fallback hid. Repeated reload/open/close was checked; no black launcher, layout shift or vendor splash appeared. Temporary delay configuration/server were removed. |
| Current checks | **139 focused EDEN tests passed**. Production build passed with the existing large-chunk advisory; frontend/backend typechecks passed as part of the build. Final built-artifact secret scan: **642 files, zero findings**. No unrelated development work or deployment was performed. |

### Actual motion evidence

These are screenshots sampled continuously from the real browser renderer, not generated pose previews or forced animation states. Each current capture runs over **33 seconds** with the exact PNG hidden throughout and `edenLauncherRenderer=svg-profile` / `edenLauncherMotion=idle`. The desktop capture contains **481 frames**, with actual feature-render callbacks increasing **1325 → 3297**; mobile contains **587 frames**, **1108 → 3085**. The normal root circular framing remains fixed; the head, eye apertures/gaze, body, fringe and hoops move independently.

- [Desktop animation, 33 seconds (APNG)](profile-svg-desktop-motion.png), [measured capture record](profile-svg-desktop-evidence.json).
- [Mobile animation, 33 seconds (APNG)](profile-svg-mobile-motion.png), [measured capture record](profile-svg-mobile-evidence.json).
- Each strip below shows eyes open, blink closed, changed gaze and head position, selected from actual captured frames and enlarged for inspection. Motion remains deliberately small at the approved 80px/68px launcher size.

![Actual desktop feature poses](profile-svg-desktop-poses.png)

![Actual mobile feature poses](profile-svg-mobile-poses.png)

### Startup diagnosis and implementation choice

The observed Rive opening branding and the official CLI's explicit **watermarked free/local export** report establish **cause B: the required free-export splash**. The editable RML does not contain a matching custom black loading sequence. No Rive export or branding was patched, concealed, cropped or skipped, and no plan was purchased. The preserved native Rive export is an editable reference; older native-Rive captures below are historical.

The current launcher instead uses a separate implementation of Our Ground's own source illustration. Ten PNG layers (**82,829 bytes total**) are exact byte copies of the editable source layers, decoded before reveal. The layer decomposition recomposes the approved PNG with **zero RGBA differences at rest**; the original portrait/crop hashes remain unchanged. Original eyes are removed underneath the animated eye regions, with restrained local reconstruction only where moving features expose covered pixels. The friendly source smile is unchanged. A small renderer handles independent feature motion, varied blinks, pause/offscreen/visibility and reduced motion without Rive/WASM. This avoids a launcher-specific runtime/CSP exception while preserving the existing conversation character and Rive authoring sources.

### Screens and final state

![Persistent welcome on the approved homepage](compact-welcome-desktop.png)

![Compact chat beside actual returned fictional resources](compact-agent-results-desktop.png)

Additional captures: [mobile welcome while typing](compact-welcome-mobile.png), [mobile sheet](compact-chat-mobile.png), [mobile expansion](expanded-chat-mobile.png), [short viewport](compact-short-viewport.png), [desktop expansion](expanded-agent-desktop.png), [delayed loading](compact-slow-loading.png), [decoded animation](compact-slow-ready.png), [final unavailable state](compact-final-disabled.png).

The existing Geoapify origin authorization blocker still prevented live map rendering; the accessible list remained usable. This UI correction did not change map credentials, restrictions, provider selection, or billing. Aoede code and protections are preserved and covered by focused tests; **no new speech playback was attempted in this correction**. No unrestricted microphone input was added.

After verification, the temporary reviewer grant/code were removed and the evaluation API was stopped. The default local API was restored and its actual status confirmed **`mode: disabled`, `publicGeminiEnabled: false`, `agentAvailable: false`, `speechAvailable: false`, `evaluationData: null`**. The UI showed its concise unavailable state with composer hidden, then returned to the animated launcher. Temporary browser tabs were closed and viewport overrides reset. The original application tab remains on Home. The owner's `.env.local`, approved artwork, website, and provider gates are preserved. Nothing was deployed and billing was unchanged.

## Earlier product and agent verification

Date: **2026-11-06**. Scope: the restored Our Ground product and the latest requirement for **genuine Gemini-only Eden**, with no scripted website-guide substitute. This record distinguishes fresh correction/agent checks from earlier engineering evidence. No deployment, billing activation, paid service, or company-registration step is part of this correction.

## Source and reference evidence

- Inspected `git log` and `git show HEAD:src/landing.ts`. The Git tip `3897dea` contains the older “Help, mapped beautifully” orbit/glow landing page. It is not the restoration target.
- Inspected the current `src/landing.ts`: courtyard hero, “Stronger communities grow here,” shared Our Ground header/footer, and Support/Give/Organizations pathways. The current implementation selects `hero-courtyard-realistic-desktop` through the existing photograph helper.
- Read the approved design hierarchy, approved courtyard source/integration manifest, and courtyard refresh notes. Their composition/asset evidence is distinct from data/service availability. No blind Git reset or replacement of recent functional work is authorized.
- The removed Meet Eden presentation and its captures remain superseded history. They must not be used to demonstrate the corrected homepage or current navigation.

## Correction checks

The final full run passed **547 tests**, including the clarification additions. The production build passed, retaining its existing large-chunk warning. The final bundle scan reported **542 files, zero findings**; browser model-SDK/secret checks passed. The first sandboxed test attempt could not bind its loopback fixture; the permitted loopback rerun passed. Earlier 518/544-test results are superseded as current full-suite evidence. No accessibility certification is claimed.

| Check | Evidence status |
| --- | --- |
| Approved homepage | Restored courtyard homepage observed and captured on desktop and 390px mobile. Original Support/Give/Organizations destinations retained; no academic/competition hero or standalone Eden branding |
| Navigation and private-route boundary | `/eden` actually redirected to `/support`. Give Support and organization entry pages rendered through navigation. Account page had zero assistant instances; no standalone Eden navigation entry |
| Floating assistant and keyboard/mobile | Desktop embedded panel and 390px layout observed, with no horizontal overflow. Enter opens Eden and focuses input; Escape returns focus to launcher. Mobile navigation Enter/Escape worked. Eligible local runtime used native Rive canvas, hidden static image, and no SVG |
| Original support UI and resource API | Live flow used actual HTTP DemoRepository records with approved IDs, not browser-local sample transport |
| Genuine three-turn Gemini acceptance | **Passed in the browser with six real model calls**: homepage Harrisburg food → five-mile refinement retaining context → selected/expanded first record with grounded reply |
| Gemini unavailable and manual independence | **Verified after disabling Gemini server-side:** reloaded Support showed concise unavailable state with composer hidden. Manual 25-mile search updated the URL and returned one fictional HTTP record without Gemini |
| Privacy acknowledgement | Draft preservation through the first-use acknowledgement confirmed in browser. Source shows system-only validation errors and detailed `/privacy#edenPrivacyTitle` dated November 6 |
| Build and security checks | Final 547-test run/build passed; final 542-file bundle scan found zero issues. No Gemini key or server model SDK exposure reported. Restricted browser-map configuration is separate |
| Genuine clarification | **Passed live:** “Find food” invoked real `ask_clarification` and returned “Which city should I search in?” without changing the homepage. Bare “Harrisburg” retained Food and triggered a genuine two-phase 10-mile search returning HTTP record 111 |
| Map | Map-unavailable/list fallback observed. Browser map key is configured; root cause was **not established**. Do not attribute it to a missing key or claim the live map rendered |
| Fresh Aoede check | Real fixed-phrase playback completed via `audio.onended`; another play visibly entered Speaking in the accessibility state and returned to idle. One earlier attempt timed out/unavailable cleanly after about 15 seconds. The latest Stop click landed after the short clip ended, so fresh speaking interruption is **not claimed**; earlier live Stop and controller tests remain evidence |

Focused boundary checks also passed **15/15** across `tests/eden-public-context.test.mjs` and `tests/eden-application.test.mjs`. Six new context groups cover strict provider projection, finite 15-minute tab persistence, cross-page broad context, unsupported-city non-reuse, malformed/expired values, bounds, and storage failures. Globals/clock are restored between cases; these tests make no provider calls.

## Observed genuine agent acceptance

The owner-authorized eligible local session ran the exact requests below against Gemini and the actual resource API:

1. **“Eden, find food resources near Harrisburg.”** Gemini chose a 10-mile search. The assistant preserved its in-memory session through the narrow homepage-to-Support transition, performed the HTTP search, and displayed DemoRepository record `11111111-1111-4111-8111-111111111111`.
2. **“Can you narrow that to five miles?”** A new Gemini tool plan retained Harrisburg and Food, changed the actual distance select and URL to five miles, and confirmed the returned API record.
3. **“Tell me more about the first one.”** A new Gemini plan fetched and selected that record, opened the actual detail view, and produced a validated reply using its approved source facts.

Each turn made a real planning call and a real grounded-reply call, with visible **EDEN · GEMINI** output only after validation. No scripted guide reply or fake animation substituted for inference. These records are explicitly fictional evaluation data returned by the HTTP API, not verified real-world services. A subsequent live turn verified the concise outcome “Your search is ready.”

The clarification branch performs one real model call and no application action/result phase. Its known Food slot is retained as typed semantic context for the bare-city answer; original unrestricted text is not used as provider history. Budget admission conservatively charges two reserved model credits and one logical agent turn even when clarification uses only one inference; it clears the pending reservation so the answer can follow immediately.

![Restored Our Ground homepage](restored-home-desktop.jpg)

![Current Gemini agent with concise outcome](gemini-agent-current-desktop.jpg)

![Actual returned listing and genuine Gemini conversation](gemini-agent-results-desktop.jpg)

![Genuine Gemini clarification](gemini-agent-clarification-desktop.jpg)

![Restored homepage on mobile](restored-home-mobile.jpg)

![Integrated Eden on mobile](eden-chat-mobile.jpg)

![Gemini unavailable while manual resource search still works](eden-unavailable-manual-search.jpg)

![Restored homepage with concise unavailable Eden state](restored-home-unavailable.jpg)

Earlier captures in this same correction preserve [the initial search](gemini-agent-search-desktop.jpg) and [actual first-resource details](gemini-agent-details-desktop.jpg), before the final concise outcome copy. They prove those observed actions, not a separate product or current copy recommendation.

## Functional limits observed

A subsequent read-only diagnostic requested the configured Geoapify map style with the local `http://127.0.0.1:5199/` referrer and received **HTTP 401**. The key and credential-bearing URL were not printed or captured. This establishes a map-provider authorization/configuration problem in that local request context; the browser's precise failure was not captured, so it does not exclude a separate WebGL/worker issue. No provider settings, key restrictions, billing, or service configuration were changed.

- The local privacy reducer accepts a finite grammar and canonical public parameters. It is not unrestricted chat. Incomplete supported city/category searches can now receive a genuine Gemini clarification; sensitive/unknown input still receives system validation rather than a fabricated model answer.
- Current eligible inference is scoped to approved fictional HTTP API records. Public resident data and general real-directory AI access are not enabled by these tests.
- Grounded replies select/order verified literal extracts with approved whole connective phrases. Open-ended factual paraphrase, advice, invented availability, and uncited assistance claims are rejected.
- A local keyword filter can change visible IDs relative to the server's city/category/radius query. Context reconciliation can therefore reject some filtered `read-results`/`clear-filters` requests. This is a safe failure; use the ordinary filter control and resend. That edge is not claimed fixed.
- The live map was unavailable although a browser map key is configured. Provider/WebGL/configuration diagnosis remains; list and details fallback worked. No map rendering claim is made.
- Voice is optional and can time out. Fresh Speaking/completion is confirmed; the new Stop click occurred after playback ended. Prior live Stop and automated interruption tests remain distinct evidence. Full screen-reader/device coverage and hosted operations are not established by the limited keyboard/mobile checks above.

## Preserved live engineering evidence

Before the latest critical correction, an authorized supervised local Gemini comparison genuinely selected **result 3** for the step-free/open-now scenario and **result 1** for the shorter-trip scenario. Both were model choices over application-owned fictional facts; the application checked admissibility/reasons and required Apply. Those tests were not used as proof of the new three-turn acceptance, which was exercised separately above. They are not a claim that a new public endpoint or comparison was run during this correction.

The [dated EDEN-03 record](eden-03.md) preserves the earlier live text proposals and **three fixed-phrase Aoede playbacks**, including speaking-state transitions and a live Stop interruption. It also records one generic speech fallback whose precise upstream cause was not established. No microphone/raw resident input was used. Earlier screenshots document that earlier interface only.

The exact public Gemini blockers remain audience/access eligibility, professional-purpose applicability, region/free-service terms, account entitlement, and hosted data/operational evidence. They do not block the rest of the website. See [current architecture and gates](../current-architecture.md#publication-and-live-ai-gates).

## Publication status and limits

No production deployment or public URL was created or verified in this correction. Public website readiness, successful local functionality, genuine local inference evidence, and permission to activate hosted Gemini are separate decisions. Review host routing/headers, backend/auth/maps, source rights, logs, accessibility, and operational controls for the exact deployment target. No legal compliance, HIPAA/BAA, independent age verification, complete screen-reader coverage, or provider endorsement is certified.

After verification, temporary grant/code files were removed and the evaluation API was stopped. The default API was restored with data/Gemini/TTS disabled; the owner's `.env.local` was preserved. The earlier successful manual demo search establishes independence when an explicit fictional data API is running, not a claim that the final disabled data service serves resources. No provider key or private code appears in these screenshots or documentation.

Final read-only status confirmed `mode: disabled`, `publicGeminiEnabled: false`, `agentAvailable: false`, `speechAvailable: false`, and `evaluationData: null`. The homepage's final unavailable-state capture had no composer; afterward the panel was closed and the viewport reset. Gemini eligibility restrictions apply to AI access, not access to the public resource website.

## Map authorization addendum — 2026-11-06

Bounded direct Geoapify style probes narrowed the earlier unknown authorization failure. The configured browser key is present, has the expected shape, and is distinct from the server key. The application uses the documented `osm-bright-smooth` style. No key or credential-bearing URL was printed.

| Controlled request | Observed result |
| --- | --- |
| Configured key with only `Origin: http://127.0.0.1:5199` | HTTP 401; sanitized provider reason `REQUEST_NOT_ALLOWED` |
| Same key with only the matching local Referer | HTTP 200; fully parsed valid version-8 style |
| Deliberately invalid test key without browser headers | HTTP 401; provider reason `INVALID_KEY` |

The configured credential is accepted for the style request without Origin; adding the actual local Origin causes rejection. This isolates an **Origin-based authorization blocker**, rather than a missing key or an unsupported style. The exact Geoapify dashboard restriction remains uninspected, and a successful style response is not proof of browser/tile/WebGL rendering. Geoapify documents separate Allowed origins and HTTP-referrer controls; CORS response settings are not an access restriction. [Official key guidance](https://myprojects.geoapify.com/help/api-keys/), [map-style documentation](https://apidocs.geoapify.com/docs/maps/map-tiles/) (retrieved 2026-11-06).

Remaining step: the owner reviews the existing browser key's Allowed origins against the intended local application origin, then authorizes the exact required origin or uses an already approved one and retests the browser. No code change, header-stripping proxy, server-key substitution, credential restriction, provider, billing, or account setting was introduced. The accessible results-list fallback remains intact.

## Eden Live — local verification, 2026-11-07

The owner separately authorized adult US development using the existing unbilled project, synthetic speech and browser microphone. Local API status confirmed owner admission without a reviewer-code field, `liveAvailable: true`, model `gemini-3.8-live`, fictional evaluation data and `publicGeminiEnabled: false`. The listener remains bound to 127.0.0.1. These observations do not verify public eligibility or billing configuration independently of the owner's attestation.

Two bounded provider preflights established v1beta constrained credentials, Aoede PCM and the current realtime-input introduction protocol. The successful introduction produced 60 PCM frames, 544,372 decoded bytes at 24 kHz, 11.341 seconds of audio and an exact normalized introductory transcript. Generation completed at 4.434 seconds; model-turn completion arrived at 14.302 seconds. No audio was saved. This establishes why the client waits for model-turn completion and actual playback drain separately.

The browser then played the exact generated introduction; the owner confirmed **“Yes, I can hear her clearly.”** After its single greeting, the client automatically reached Listening with microphone forwarding on. A fresh snapshot showed one connection, 36 output chunks, one generation completion and one turn completion, no tools, and all three portraits at resting mouth after playback. Microphone forwarding was off during the greeting. A subsequent actual user utterance reached the input transcript; an unsupported tool envelope failed validation before any page mutation and stopped the call. Spoken resource-action acceptance remains pending while that protocol boundary is corrected.

Earlier attempts exposed a late-input-transcript race, corrected with a regression: captions alone cannot start a new input turn or response watchdog. Early resumption handles are now retained and become eligible only after model completion plus playback drain; new input or tools invalidate them. Recovery has deterministic test coverage, not a claimed real network-recovery acceptance. Permission/output preparation is bounded, and late permission after cancellation cannot resurrect a call.

The focused Live group passed **42 tests** with actual local test-socket permission. The first sandboxed run could not bind loopback (`EPERM`); the authorized rerun passed. Production build, frontend/backend typechecks, environment boundary and final build secret scan passed. Existing large-chunk warnings remain. Earlier focused EDEN coverage passed 185 tests before the diagnostic/turn-race additions; counts overlap and are not additive.

### Successful real microphone acceptance

After narrowing the zero-argument wire adapter and aligning the declared schemas with the unchanged validators, a fresh call completed the genuine spoken flow:

| Actual spoken request | Observed application and spoken outcome |
| --- | --- |
| Find food support near Harrisburg | Navigated from the homepage to `/support`, set Food/Harrisburg/10 miles, loaded the actual fictional pantry through the application API, then generated Aoede speech identifying it as fictional. |
| Narrow that to five miles | Changed the actual distance/URL to 5 while retaining Food/Harrisburg and one result. One malformed proposal received bounded fixed error feedback; the model corrected it with a new ID. There was one confirmed radius action, not a scripted substitute or duplicated mutation. |
| Tell me more about the first one | Opened the actual first resource's details and selected ID in the URL, retaining search filters. The spoken answer stated that the pantry is fictional and offers no real service. |

The same connection handled the introduction, these actions and further short user turns. Final call counters: **one connection, three accepted tools, four received proposals, one rejected argument proposal, seven completed model turns, 221 PCM chunks, zero reconnects**. Reopening the minimized panel preserved this call and its same bounded caption log; it did not replay the greeting. Unrelated arithmetic prompts received resource-scope responses rather than invented website actions. No microphone recording was saved.

Actual speech-driven mouth state was captured during the generated introduction: visible header/call portraits were `speaking`, the hidden launcher remained at rest, and microphone forwarding was false. After playback they returned to rest and Listening enabled forwarding. [Speaking screenshot](live-desktop-speaking.png), [Listening screenshot](live-desktop-listening.png), [actual search](live-search-harrisburg.png), [minimized details](live-minimized-details.png).

At **390 × 690**, the active mobile panel measured 374 × 520 within the viewport. The main controls measured at least 62 × 56 pixels. The microphone was muted with forwarding false and input count remaining at 2,150; unmuting showed Listening/forwarding true, then it was muted again. Explicit End Call produced `ended`, forwarding false, restored composer and preserved the page/log. Cleanup of microphone tracks, socket, PCM player and late callbacks also passes the lifecycle tests. [Mobile muted call](live-mobile-call-muted.png). This is a desktop browser viewport test, not a claim of physical iOS/Android device coverage.

The first typed continuation reached the backend's accepted current context but its model proposal failed the strict action validator twice, before mutation. The typed planner now shares Live's closed action variants inside its existing `{action: ...}` wrapper and has explicit wrapper instructions. Validators and two-phase execution remain intact. After the necessary development reload/restart and local reauthorization, **“Search within ten miles” passed with genuine planning and grounded reply inference**: the actual URL/distance changed from 5 to 10, Food/Harrisburg remained, and one API record was confirmed before the reply. Ordinary End Call had already preserved the original voice log and composer before this code reload. No raw voice history is replayed to the typed model. [Final text continuation](live-final-text-continuation.png).

Canonical pending clarification slots also pass from text to Live as a separate validated context part; malformed tasks and other goals fail before minting. A regression checks Healthcare/known-city slot changes and confirms raw log/transcripts are not seeded. This final pending-slot addition has focused tests, rather than a claimed additional physical-microphone test.

Final affected **72 tests passed**, including text planning, Live contracts, socket-attested backend, action authorization/reconciliation, audio and lifecycle tests. Final production build, both typechecks, environment boundary and build secret scan passed (**692 inspected files, no findings**). These counts overlap previous checks and are not additive. Existing bundle-size warnings remain.

Real network recovery and a fresh Stop Speaking interruption are not claimed; those controls have deterministic tests. Permission denial/slow initialization and cancellation have deterministic coverage, while browser microphone permission was granted by the owner in this live run. Physical Safari/iOS/Android testing and assistive-technology certification remain open. Background-tab transition intentionally ends the call; this is half duplex, not barge-in. The pre-existing map-origin authorization failure remains; list and details are verified.

The API and review frontend remain available on loopback for the owner's continued testing. The existing grant expires **2026-11-07T13:06:18.811Z (8:06 AM Eastern)**; individual calls/credentials remain capped at five minutes. No billing, deployment, tunnel or public Gemini activation occurred. Later service restarts loaded actual schema corrections, not quota workarounds; no extra real call was used after the successful fifth browser call.
