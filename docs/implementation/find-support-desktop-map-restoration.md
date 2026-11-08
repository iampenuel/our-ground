# Find Support desktop map verification and sticky layout

November 5, 2026, America/New_York. Local work only; production and staging unchanged.

## What actually regressed?

**The desktop two-column composition had not regressed.** A pre-change real Chrome/offline MapLibre measurement at 1440px found two 582px columns, results left and map right, with the map visible by default. The map was positioned relative and the list scrolled inside a bounded panel. The map-above-list rule applied at 900px and below.

The requested sticky behavior was absent from this active unified layout. The refinement preserves the two columns, returns the original slightly wider results column, lets the document scroll through results, and keeps the right map sticky at 1rem from the viewport edge. It stops at the end of the results workspace, before referrals. No unrelated page was redesigned.

## Targeted changes

- Desktop above 900px: results explicitly occupy column 1; map explicitly occupies column 2. Map height is bounded by the viewport and 42rem. The page owns list scrolling.
- At 900px and below: map stacks above the list, with a bounded mobile height. Existing Hide map / Show map / Back to list controls and focus behavior remain. An explicit list choice persists across resize and URL state.
- Map is visible by default after a successful search. Explicit user choices and saved view=list URLs are honored.
- A marker selects the same keyed listing and reveals it within the document, while the desktop map remains sticky. Mobile marker selection returns to the list and focuses the matching result.
- Pagination, filtering, source keys, directions, giving, search state, caches, geographic validation and the renderer are preserved.
- Food referrals stay beneath the complete search workspace and do not become an extra grid column.
- Selected cards now use a clean green border without an inset shadow. Marker, attribution and map-control shadows are suppressed only within Find Support.
- A real browser check caught MapLibre's vendor control halo overriding the initial local rule by stylesheet order. The more specific scoped rule fixes that. Input, marker and zoom-control keyboard focus remains a crisp visible outline.
- Existing cream, white and deep-green tokens and all public images are unchanged.

Changed implementation/fixture files, relative to the preceding handoff:

1. src/unified-support.css — columns, sticky panel, document scroll and scoped shadow removal.
2. src/support-page.ts — selected-result reveal for document scrolling; results-region label.
3. tests/location-browser.ts — deterministic 20/40-record pagination scenario with unique identities.
4. tests/location-browser.html — exposes that scenario while preserving the original default.

No map-provider/backend/limiter/security-header/authentication/schema/asset changes.

## Browser and regression evidence

| Check | Outcome |
| --- | --- |
| Before-change geometry | PASS: two columns, default visible map; relative map and internally scrolling list documented. |
| Final layout/interaction browser groups | 14 PASS, offline actual MapLibre renderer and workers, no external/provider requests. |
| Desktop geometry | 901, 1024, 1280, 1440px: results left/map right. After 1000px page scroll, map top remains 16px and stays inside the viewport. |
| Responsive geometry | 390×844, 768×900, 900×900: visible map above list, no horizontal overflow. |
| Selection and pagination | Card→marker and marker→card pass; selected card revealed; 20→40 records and markers remain synchronized. |
| Actions/state | 40 protected directions links; local filtering makes no additional requests; URL state and explicit hide survive resize. Mobile controls/focus pass. |
| Actual built preview replay | PASS: giving links, 19 directions, Back/Forward/refresh and filtering with captured genuine Philadelphia results. These were replayed results, not new live searches. |
| Referrals | Present beneath results/map on desktop and mobile without overlap. |
| Decoration/focus | No visible element inside Find Support has a box-shadow. Separate keyboard checks verify input wrapper, marker and map zoom control. |
| Preserved browser regressions | 15 groups PASS: source outcomes, default/hide map, scroll interruption, reduced motion and media fallbacks. |
| npm test | 320 PASS, zero failed/skipped. |
| npm run build | PASS with frontend/backend typechecks, Node 24.22.1 and the documented memory limits. Existing large-chunk advisory remains unchanged. |
| Source/build secret scan | PASS; no private credential findings. |
| Assets | All 36 public assets byte-identical; all other baseline source files unchanged. |

A fixture-only attempt to reload the production /support route on the static fixture server returned no fixture page. That harness limitation was separated from product behavior. Back/Forward/refresh were then verified on the actual built preview using captured genuine responses. The initial failed diagnostic is retained; final checks pass. No physical-device or VoiceOver/NVDA session is claimed.

## Historical Geoapify 401 investigation

Exactly **two new style-only browser requests** were made, with the existing configured public key, no tiles, geocoding, Places or automatic retries:

| Page origin | Actual Origin header | Actual Referer header | Result |
| --- | --- | --- | --- |
| Previously working http://127.0.0.1:18418 | http://127.0.0.1:18418 | http://127.0.0.1:18418/ | 401, JSON Unauthorized / Not allowed |
| Current http://127.0.0.1:18434 | http://127.0.0.1:18434 | http://127.0.0.1:18434/ | 401, JSON Unauthorized / Not allowed |

Both requested maps.geoapify.com/v1/styles/osm-bright-smooth/style.json. Their key fingerprints match each other, the ignored local VITE_GEOAPIFY_BROWSER_KEY and the non-fixture compiled build. The key is not printed in evidence. No CSP violation or transport failure prevented dispatch.

Prior Phase 7D.1 evidence records a genuine successful map from 18418 with 20 markers. Current rejection from that same origin establishes that the problem is **not isolated to adding 18434**. It does not identify whether the browser key is inactive/replaced, restrictions now reject both origins, or another account condition applies. The prior retained provenance summary has no key fingerprint; historical key equality is not asserted.

The owner has confirmed that both local origins are present in Allowed HTTP Origins and Allowed HTTP Referrers. A missing entry alone does not account for the observed rejection. The exact pattern syntax and dashboard-key fingerprint have not been independently compared. Key activity, Allowed IP restrictions and account usage are being checked by the owner. There is no authenticated Geoapify dashboard connector available; no rules, credentials, origin checks or hosted settings were changed. No wildcard, spoofed referrer or security bypass was used.

Geoapify distinguishes Allowed origins, HTTP referrers and IP restrictions from CORS response configuration; referrer/IP patterns support regular expressions. Browser page origins include their scheme and port, while the actual cross-origin Referer here is the origin with a trailing slash. Inspect both access restrictions rather than changing CORS alone. [Official key-restriction documentation](https://myprojects.geoapify.com/help/api-keys/).

### Request budgets are distinct from account quota

The internal **12-request server verification cap is not Geoapify's account quota** and did not cause these browser 401s. The existing server ledger is now at **12/12**. Its last autocomplete dispatch predates this layout task's baseline snapshot; the prior handoff reported 11. This task made zero new server-provider dispatches. The extra earlier request is not attributed to this task or to a particular user/process. Browser map diagnostics have a separate verification guard; its append-only ledger increased from **3 to 5** requests. All five were rejected style requests; no new tiles were dispatched.

The application's shared 200/day server admission and Geoapify's project/account plan usage are also distinct. No account quota/billing snapshot is available here, so exhaustion is not asserted. Geoapify states that keys in one project share the project's plan/quota. [Official key/quota explanation](https://myprojects.geoapify.com/help/api-keys/).


## Owner follow-up: offline review, live requests paused

No new Geoapify/provider requests were made during this review. Existing ledgers remain at 12 server dispatches and 5 browser map dispatches. The 12-request internal verification guard remains distinct from Geoapify account quota.

**Correction to the previous summary:** the two later origin probes returned a JSON body, not an empty body:

    {"statusCode":401,"error":"Unauthorized","message":"Not allowed"}

Earlier MapLibre attempts had an empty captured body. The later probe JSON is the more informative evidence; it still does not identify which key restriction or account condition rejected the requests.

### Referrer trailing slash

The actual headers are distinct:

- Origin: http://127.0.0.1:18434
- Referer: http://127.0.0.1:18434/

The same distinction applies to port 18418. If an HTTP-referrer restriction is an anchored regular expression ending immediately after the port, the trailing slash matters. For example, ^http://127\.0\.0\.1:18434$ does not match the captured Referer, while ^http://127\.0\.0\.1:18434/$ does in the offline illustrative regex checks. These examples are not assertions about the current dashboard rules or undocumented Geoapify normalization. Exact pattern text is required to confirm matching. No restrictions were edited.

### Key identity and query parameter

Offline verification establishes the complete available chain:

1. The ignored local VITE_GEOAPIFY_BROWSER_KEY is present in the compiled JavaScript.
2. Its SHA-256 fingerprint matches the build descriptor and the previously captured actual browser requests.
3. Every compiled asset matches the build's recorded hash; the descriptor is not being used to excuse stale or altered assets.
4. The style request uses exactly one case-sensitive apiKey query parameter, with the configured browser value.
5. The host/path/style and parameter name match the [official Geoapify map documentation](https://apidocs.geoapify.com/docs/maps/).

Whether that value is the particular key selected in the owner's dashboard remains **unverified** without a private fingerprint comparison. No key, partial key or credential-bearing URL is exposed.

Three existing map-provider tests passed again: fixed map configuration/query contract, rejection of unsafe key inputs, and required attribution/branding. No implementation code changed during this review, so the earlier full suite/build/browser results remain applicable. All four previously verified layout/fixture source hashes still match. Results remain left, the desktop map remains sticky on the right, default visibility is preserved, and the shadow-free keyboard treatment remains intact.

The redacted [offline review artifact](../../output/find-support-layout-verification/offline-key-review.json) records the checks, example matching results, owner-reported dashboard status, unchanged source hashes and request counts. That offline review made no fresh live request. Its blocked status is superseded by the successful single-request verification recorded below.


## Successful single-request verification after referrer correction

After the owner added exact local HTTP referrers with trailing slashes, one authorized browser style request from http://127.0.0.1:18434 returned **HTTP 200**. The actual Origin was http://127.0.0.1:18434 and Referer was http://127.0.0.1:18434/. The API-key parameter and fingerprint match the existing local/build configuration. The response was a valid MapLibre style version 8 with 112 layers and one source. No CSP violation was recorded.

A persistent one-request guard allowed only that style path; workers had zero provider budget. There were no retries, geocoding/Places requests, or live tile/glyph/sprite requests. Port 18418 was not retested. The internal server verification guard was neither changed nor confused with Geoapify account quota.

**Style authorization now passes for the tested key and origin.** This improvement followed the trailing-slash referrer change and is consistent with that correction resolving the rejection. Exact dashboard matching semantics and unrelated settings were not independently inspected.

The captured background layer was then rendered locally with actual MapLibre and all remote tile sources omitted. All 14 layout/interaction groups passed again: results left, sticky map right, default visibility, seven responsive widths, marker/list selection, 20→40 pagination, protected directions, local filtering, URL state, mobile controls and referrals beneath the workspace. No visible Find Support element had a box-shadow. Separate input/marker/zoom-control keyboard focus checks also passed.

Screenshots are explicitly offline, with fictional resource fixtures. **Full live basemap-tile rendering was not tested** under the one-request authorization. Application source and all public assets remain byte-identical to the start of this verification; no production/staging configuration changed.

[Latest live result, screenshots and counts](../../output/find-support-layout-verification/style-referrer-fix/README.md)

## Outcome and review

- Two-column desktop regression: **NO** in the inspected build.
- Requested sticky desktop experience: **IMPLEMENTED AND VERIFIED OFFLINE**.
- Default map, mobile controls, referrals and search interactions: **PASS locally**.
- Live Geoapify style: **PASS — HTTP 200 on 18434 after the referrer correction**. Full live tiles and 18418 were not retested.
- Current browser key: **accepted for the tested style request and 18434 origin**. Exact dashboard settings/account usage were not inspected.
- Production/staging: **UNCHANGED**. No deployment, secret/referrer change or AI-agent work.

[Local preview](http://127.0.0.1:18434/support). The server verification guard remains intact; new uncached server searches fail closed at its current 12/12 verification count. This is an internal preview guard, not evidence of Geoapify quota exhaustion. Review the captured [desktop/mobile screenshots and sanitized evidence](../../output/find-support-layout-verification/README.md) without additional provider traffic.
