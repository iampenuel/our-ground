# Our Ground

**A student-built Nittany AI Challenge and portfolio platform for finding food, care, and community support.**

Our Ground remains the product: the approved courtyard homepage, Find Support, Give Support, organization access, maps, and public resource information. **Eden is its integrated Gemini AI agent.** Only Gemini evaluation is restricted to eligible adults; the public resource website has no Gemini eligibility gate. This is not a commercial startup launch. Competition context belongs in documentation, not the primary product interface.

Manual navigation, search, filters, and maps work independently of Gemini. When Gemini is unavailable, Eden shows a concise unavailable state; she does not become a scripted website-guide chatbot. **The public website is a publication goal; live public Gemini is separately gated.** The [reviewer Preview](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) requires Vercel sign-in. It is separate from a public release.

## Run the restored product locally

Use Node **24.x** (`nvm use`). After installing dependencies, run these in separate terminals:

```sh
npm install
npm run dev:local:api
npm run dev:local:web
```

Open **http://127.0.0.1:18417/**, then run `npm run check:local`. This reproducible local workflow uses explicitly fictional API records; it is not a production directory. Real directory/database/auth configuration is documented in [backend setup](backend/SETUP.md). Configured data mode does not silently replace a failed real database with fictional listings.

The original homepage keeps the Our Ground wordmark, courtyard composition, established typography, cream surfaces, and Support/Give/Organizations destinations. **There is no standalone Meet Eden product page or primary navigation item.** Legacy `/eden` links redirect safely to `/support`.

Eden's flow is direct: open the compact floating conversation, type, send, and receive a genuine Gemini response with validated page actions. First-use acknowledgement stays inline and preserves the draft. The earlier **Harrisburg food → five miles → first-result details** interaction passed using six real model calls and explicitly fictional HTTP evaluation records. Latest compact/SVG-launcher and ordered-reply composition acceptance are tracked separately. Manual controls remain independent. See the [verification record](docs/eden/verification/restored-product.md).

![Restored Our Ground homepage](docs/eden/verification/restored-home-desktop.jpg)

## Current capabilities

| Feature | Implemented scope and limits |
| --- | --- |
| Homepage and public navigation | Original Our Ground product; Support/Give/Organizations destinations retained and exercised. `/eden` actually redirects to Support; Account has no assistant |
| Resource discovery | Find Support and EDEN share the restricted Supabase staging directory. The protected Pennsylvania pilot has 324 Philadelphia food sites and 43 HRSA healthcare sites across 15 named places. All are imported and unverified. [Directory coverage](docs/eden/eden-12-pa-directory.md) · [EDEN search outcomes and hosted checks](docs/eden/eden-13-search-awareness.md) · [Directory maintenance](docs/eden/pa-directory-maintenance.md) |
| Embedded Eden | Genuine Gemini interaction only; concise unavailable state without chat substitute. Prior desktop/mobile and keyboard evidence is dated in the verification record |
| Profile and welcome | Launcher and chat header reuse source-owned SVG animation of the exact approved PNG-derived layers; launcher 80px desktop/68px mobile. The unchanged 282px PNG covers loading, error, and reduced motion. Opening chat hides the welcome for that page interaction; refresh shows it again unless its X was pressed. Only X records session dismissal; no automatic timeout |
| Conversation sizes | Compact by default, approximately 390 × 480px on desktop; responsive mobile bottom sheet. Expand/Restore preserves messages, draft, scroll position, context, and ongoing work. Minimize retains the turn; close ends the AI session while retaining bounded in-memory draft/history until five-minute inactivity, 15-minute expiry, or tab exit |
| Validated page capabilities | Shared typed/Live controller for search, refinement, current-result details, public navigation, page explanation and cautious hours reading. Strict finite public context; no account/payment/submission authority. Fresh EDEN-05 coverage and limits are recorded below |
| Gemini intelligence | Prior recorded three-turn and clarification/follow-up tests passed against the HTTP API. The corrected ordered-ID reply composition passed a fresh ten-mile follow-up after the Live test |
| Aoede speech and Live calls | Existing fixed-phrase playback is preserved. Separately authorized local **Call Eden** uses real Gemini Live/Aoede, constrained temporary credentials and half-duplex microphone input. Browser spoken-action acceptance is tracked separately in the dated verification record; public Live stays disabled |
| Accounts and organization/staff work | Existing scoped authentication, database policies, and authorized workflows preserved. Eden has no account, editing, donation, or submission authority |
| Giving | Existing giving information and discovery paths preserved. No payment or autonomous donation capability is introduced |
| Public release | Product and build preparation are distinct from deployment approval. Protected Preview verified; public production and hosted Gemini are not approved |

### Try the protected Pennsylvania pilot

Sign in to the [reviewer Preview](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) with an authorized Vercel account and open **Find Support**. Choose **Food**, enter **Philadelphia, PA**, select **10 miles**, and search. The directory has 323 matches; the first page displays 20. Enter **Share** and use the nearby directory keyword search to open **Share Community Fridge**. Expand **Source & dates**, then select its map marker. For a smaller-city healthcare example, search **Wellsboro, PA** at **5 miles** for two source-listed clinics.

Real search and map controls work for reviewers. EDEN’s page actions were exercised on the hosted site with mocked tool proposals. Hosted Gemini text and voice remain disabled. [EDEN-11 acceptance and limits](docs/eden/eden-11-pa-pilot.md) · [EDEN-10 infrastructure](docs/eden/eden-10-postgres-staging-limiter.md)

### EDEN-07 — directory and staging readiness, 2026-11-07

A configured local EDEN can now use the same published directory as Find Support, keep the selected city when distance changes, and reconcile the actual count and selected listing. A missing database is reported as unavailable. The public website remains independent of Gemini.

**Historical EDEN-07 checkpoint.** At that point database retrieval was blocked. Earlier import reports document 17,418 HRSA sites and 593 regional food programs. An actual browser replay at 5199 rendered Geoapify tiles with archived HRSA points and synchronized EDEN, list and marker selection; this was not a fresh SQL query or Gemini response. Protected staging was also blocked at that earlier checkpoint. See the [EDEN-07 verification, map capture and exact owner steps](docs/eden/eden-07-resource-readiness.md).

### EDEN-06 — voice reliability, 2026-11-07

Three offline-reproduced Live defects are corrected: ignored provider `waitingForInput`, a response watchdog running while a blocking tool was unfinished, and undetected browser audio-context suspension. A bounded ten-turn mock scenario passes delayed tools, resolver failure, drain/mute, one eligible recovery and cleanup. Diagnostics distinguish provider, app, browser and resolver boundaries without recording content. The original intermittent real-call cause is not inferred from those tests.

Fresh real Gemini text checks passed platform orientation, giving guidance without an unauthorized action, Privacy contextual help, and cross-page About/Organizations/Privacy/Give navigation. After the owner resolved pending microphone permission, one actual Aoede call completed **eight model turns on one connection**, four successful tools and one honestly failed resolver-limited search. It ended at the existing **five-minute application deadline**, with failure `none`, microphone and forwarding off. The call notice now states the duration. This identifies this observed ending; earlier untraced failures are not retroactively attributed. The approved animation and Aoede are unchanged.

After explicit owner approval, exact Geoapify rules were added for `127.0.0.1:5199`; the same style now returns 200 at both 5199 and 18418. Staging/production style authorization remains 401 and was not changed. The shared resolver counter is 100/100 until 7 PM Eastern today. Missing approved nonproduction DB/configuration blocks real-record and protected staging validation; the existing staging project remains undeployed. Public/hosted Gemini remains disabled.

Read the [EDEN-06 engineering verification](docs/eden/eden-06-verification.md), [actual capacity evidence and opt-in diagnostics](docs/eden/eden-06-capacity.md), [reference code review](docs/eden/eden-06-voice-reference-review.md), and [infrastructure/staging audit](docs/eden/eden-06-infrastructure-readiness.md). These findings describe the EDEN-06 checkpoint; EDEN-07 gives the current directory and staging status. No production deployment or billing change occurred.

### EDEN-05 — earlier verification, 2026-11-07

The owner accepted the corrected speaking motion during **actual Aoede replies**. The visible call portrait is 128px compact/160px expanded; independently animated source-derived brows and a smoothed, monotonic mouth-opening envelope preserve the approved resting artwork. The 15-layer SVG renderer remains browser-native. This is amplitude animation, not phoneme lip sync. Main conversation Gemini branding is removed; accurate Google/privacy notices remain.

Fresh real-model checks passed for homepage explanation, Support explanation, Give navigation during the same Live call, Give explanation, and Pennsylvania healthcare city clarification. The aligned Live conversation completed eight model turns. Resource search reached the actual API/fictional record before the existing daily location-resolver cap was exhausted; later failures were reported honestly. Fresh five-mile/details/map/open-now checks remain blocked or unverified, rather than being inferred from older results. Actual greeting interruption, exact mouth rest, microphone mute and End Call cleanup were checked. Mobile compact/expanded layout preserved the conversation.

At the EDEN-05 checkpoint, the map style was authorized at **http://127.0.0.1:18418/** and returned 401 at 5199 (subsequently fixed in EDEN-06); the exact external restriction is documented. Existing resolver protection currently returns 429 until its UTC daily reset. Real database/Auth connectivity and real resource grounding are not established. Local services remain running for the owner's bounded adult/US synthetic evaluation; public Gemini remains disabled. The temporary owner grant expires **4:10 PM Eastern on November 7**, before the resolver resets at **7 PM**. No deployment or billing change occurred.

See the [current verification and actual frames](docs/eden/eden-05-verification.md), [route/action coverage](docs/eden/page-awareness-coverage.md), [speaking-motion research](docs/eden/speaking-animation-research.md), [map and source audit](docs/eden/map-and-resource-readiness.md), and [Vercel readiness/validation plan](docs/eden/vercel-release-readiness.md). These dated findings supersede earlier map and animation status paragraphs below; earlier tests remain historical evidence.

The [current architecture](docs/eden/current-architecture.md) records the exact boundaries. [Local Live development](docs/eden/eden-live-local-development.md) explains Call Eden, Sema-derived engineering patterns, raw-audio privacy, local-owner admission, quotas and setup. The [verification record](docs/eden/verification/restored-product.md) separates fresh correction checks from earlier AI/voice evidence. Older Meet Eden screenshots and documents are retained as superseded implementation history.

## Genuine Gemini and Aoede evidence

On **2026-11-07**, a genuine microphone call connected to Gemini Live with Aoede and completed **Harrisburg food → five miles → first-result details** on the actual application. One connection handled the greeting and subsequent conversation; one malformed proposal was rejected and corrected without a duplicate action. Mute/unmute, the persistent minimized call, responsive mobile controls and End Call were exercised. See [dated Live verification and screenshots](docs/eden/verification/restored-product.md#eden-live--local-verification-2026-11-07). Real network recovery and physical mobile-browser coverage remain unverified.

The earlier recorded three-turn test used genuine tool planning and grounded replies against approved fictional API records. It confirms that recorded revision's navigation, retained context, distance changes, and details; it is not final acceptance of the latest refinement or public provider eligibility.

Earlier engineering evidence also includes a three-option Gemini comparison selecting result **3** for step-free/open-now and result **1** for the shorter-trip goal, with factual validation and Apply. That historical test is distinct from the latest conversational acceptance.

A genuine clarification test also passed: `Find food` produced Gemini's “Which city should I search in?” without a page action; `Harrisburg` retained Food and performed the actual search. Fresh Aoede Speaking/completion was observed through real playback events. An earlier attempt timed out cleanly; the new Stop click landed after playback ended, with earlier live Stop/tests preserved separately. These observations do not prove public voice is enabled.

With Gemini then disabled server-side, Eden showed an unavailable state with no composer. Manual 25-mile search still returned an actual fictional HTTP record and updated the URL. Temporary review grants were removed and the evaluation service stopped afterward; private environment configuration was preserved.

Legacy `/eden-assistant.html` redirects to `/support`; no separate sample-product harness remains. Eligible AI testing uses the original app through `npm run dev:eden:agent`. Both launcher and conversation header now use the exact approved profile's source-owned SVG feature animation. Portraits retain controller/state/audio inputs through head, gaze, eyelid, earring and amplitude-driven mouth reactions. The original smile stays unchanged at rest; the mouth moves only with actual audible output, without a phoneme lip-sync claim. No Rive player or `nativeRive` assistant option remains in the normal experience, including local AI review. The startup diagnosis is **B: mandatory Rive free-export branding**, supported by the CLI report and observed opening branding. The studio, editable RML, `.riv` references, original 1254px rig, and dormant generic loader are preserved; no active Rive splash is concealed or bypassed. Ordinary public CSP permits neither WASM evaluation nor media; existing local review voice permissions and AI gates are preserved.

A controlled six-second status delay reproduced the local-review `/support` blank page: it awaited trusted status before rendering. That route now shows the existing header/footer and an accessible “Loading resource search…” status during the same bounded wait, then mounts the full Support UI once. Data scope and actions are unchanged; no router rewrite was introduced.

For a separately authorized supervised local AI review, read the [current review workflow and limitations](docs/eden/current-architecture.md#eligible-local-agent-testing). The owner must already have checked adult/US eligibility and an unbilled free project before creating the short-lived code. No checkbox, code, successful response, or adult branding establishes Google's approval of a public API client. Do not expose the loopback service through a tunnel or relax the hosted denial.

## Privacy and provider boundary

The required concise disclosure belongs inline at first Gemini use, with accessible acknowledgement, preserved typed draft, a subtle input reminder, and supporting detail on the existing Privacy page. It is not an enable-AI product journey. Acknowledgement does not waive privacy obligations or Google's audience restriction.

The typed agent accepts finite semantic intent and approved context from server-checked fictional API records. Its second inference chooses a validated ordered composition of source-fact and connector IDs; the server renders fresh facts verbatim in Gemini's selected order. The separately authorized local **Live call streams raw, unredacted microphone audio directly to Google while Listening**. Use only synthetic, nonsensitive speech and avoid bystanders. Spoken output is model-generated from verified tool results, without the typed path's exact composition guarantee. Our Ground does not record microphone audio or persist conversations by default. Conversation and playback stay in bounded memory; Google's processing, improvement and possible human review are separate. `store:false` does not establish zero retention.

`GEMINI_API_KEY` belongs only in ignored server configuration. No Gemini API key or server model SDK belongs in the browser bundle, URL, recording, source map, or logs. Existing restricted browser-map configuration is separate. No OpenAI, Azure, paid Gemini, or billing fallback is introduced.

Public live Gemini still needs evidence for Google's restriction on API clients likely to be accessed by under-18s, the student project's professional/business-purpose fit, permitted user regions, free-project entitlement, and hosted data/abuse controls. EEA/Swiss/UK API-client access has a separate Paid Services requirement under the retrieved terms. See the dated [official-source evidence](docs/eden/eden-03-provider-evidence.md) and [current release gates](docs/eden/current-architecture.md#publication-and-live-ai-gates). These questions do not make the whole website inaccessible or require company registration.

## Validate and prepare publication

```sh
npm test
npm run build
npm run check:secrets:build
```

The earlier native-Rive revision passed **573 tests** and its production build; its 33-second desktop/mobile captures remain historical evidence. The intermediate launcher-only SVG correction still used Rive in the header and is also superseded. Neither verifies the current two SVG portraits, explicit-X welcome behavior, or Support loading fix. Fresh browser evidence and final checks belong in [verification](docs/eden/verification/restored-product.md). Latest ordered-reply composition acceptance remains separate. The privacy grammar remains finite and some filtered-result requests fail safe during reconciliation. Earlier map authorization diagnosis and hosted/accessibility limitations remain separate; no new map or speaking-interruption success is claimed.

The [EDEN-07 map check](docs/eden/eden-07-resource-readiness.md#browser-and-test-evidence) verified tiles and selected markers at 5199 after the EDEN-06 origin fix. It does not establish hosted map authorization.

Before publishing, verify the exact host's SPA routing, security headers, backend configuration, logs, licenses, and [attributions](public/attribution/README.md). Existing `vercel.json` disables automatic Git deployments. A static homepage build alone does not establish that directory APIs, maps, authentication, or hosted AI work. No deployment was performed by these commands.

Use the [product recording guide](docs/eden/recording-guide.md) for GitHub, LinkedIn, a résumé, or the competition. Record the actual homepage, resource flow, and integrated assistant. Clearly label fictional records and any separately captured local AI/voice test; never use the superseded Meet Eden page as the current product screenshot.
