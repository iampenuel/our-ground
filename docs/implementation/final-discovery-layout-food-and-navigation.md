# Final discovery layout, food coverage and navigation

November 6, 2026. **Implemented and verified locally. No production deployment, hosted environment change, GitHub connection or AI-agent implementation.**

Review the production-built local preview: **http://127.0.0.1:18434/support**. Refresh to load the final build. Canonical checkout: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/Documents/Projects/our-ground`.

[Browser evidence gallery](../../output/final-discovery-layout-food-and-navigation/gallery.html) · [Food import operations and research](final-discovery-food-expansion.md) · [Food source/database evidence](final-discovery-food-verification.json)

## Independent completion gates

| Gate | Decision | Evidence / boundary |
| --- | --- | --- |
| A — Equal-height panels | **PASS** | Desktop grid shares one viewport-aware height. Top, bottom and header borders align within 1px in native browser measurements and inspected screenshots. |
| B — Independent scrolling | **PASS** | Native wheel and PageDown scroll the named/focusable left region; header and map remain fixed in their frames. Wheel chaining reaches the document at the list boundary. No body lock or scroll interception. |
| C — Food improvement | **PASS for actual regional expansion** | 60 newly imported Maryland programs from authorized OpenPGC data; 593 total public food programs. Actual geography/API/browser checks pass. This is not national food coverage. |
| D — Navigation simplification | **PASS** | Card actions, concise inline facts, sources, reporting and share links stay in Find Support. Legacy resource links open the exact public record in context; private/invalid/unavailable cases fail safely. |
| E — Visual quality | **PASS locally** | Approved palette, type, cards, wordmark/navigation and photographs preserved. No result imagery, decorative glow, shadow, new library or large detail hero. Desktop/mobile/zoom screenshots inspected. |
| F — Security | **PASS locally** | 440 deterministic tests, 83 local DB/API/security/retention/TLS tests, 6 local Redis checks and 2 food DB integration tests pass. Hosted Redis check remains skipped; hosted authentication/launch controls are not certified. |
| G — AI-agent foundation | **CONDITIONAL PASS for controlled local read-only development** | Typed discovery/detail contracts and source/identity/privacy boundaries support constrained prototyping with explicit uncertainty and regional coverage. No agents were implemented; public pilot readiness remains NO-GO. |

**Implementation complete? YES for the authorized local scope. Material food expansion? YES, 60 new Maryland programs. Nationwide food completeness? NO. Public pilot ready? NO.**

## 1. Root causes

The list used ordinary document flow and `overflow:visible`, while the map independently used a clamped height and sticky position. Twenty cards therefore extended far below the map. The two panels did not share a height model.

Public cards linked to a separate renderer whose useful facts were often sparse and repetitive. It duplicated identity/contact information and broad HRSA caveats. The API itself was still needed for published-resource identity, meaningful facts and correction reports.

The existing 533 food programs covered only Philadelphia and Seattle/King County. A nationwide geocoder did not supply nationwide food records. New sources needed actual permission, location/category evidence, duplicate handling and a safe owner import, not a wider radius or unrelated businesses.

Native browser verification also exposed a first-click issue: a delayed combobox credit update shifted the Close control by 22.5px during pointerdown. Synchronizing the availability snapshot before interaction removed that shift; the first native click and a mobile Search click with suggestions open now pass.

Final screenshot review also found that the referral introduction claimed no mapped leads were found while the mapped provider was unavailable. Neutral incomplete-coverage copy now avoids that false zero-result claim; the primary source-outage status is preserved. The semantic regression check and actual empty-area browser journey were rerun, followed by the full 440-test suite and production build.

Data review also found an import hazard in the new feed: weekdays repeat programs, and a program ID derived from mutable name/address/type can change. Exact upstream UUID lineage was required so moves, missing addresses and privacy changes could not leave old-address records visible.

## 2–4. Coordinated panels, scrolling and accessibility

`src/unified-support.css` now gives the shared CSS Grid a height of `clamp(20rem,calc(100dvh - 9rem),43rem)`. Both panels stretch to that height. Column proportions remain approximately 1.08:1. Both use the existing border/radius tokens and 3.5rem heading region.

The left panel has an automatic header and a `minmax(0,1fr)` content row. `#supportListScroll` has `min-height:0`, vertical auto overflow, stable scrollbar gutter and natural overscroll chaining. Load-more controls are inside it. The header remains outside the scroll area. No JavaScript wheel handler, body-scroll lock or arbitrary viewport-size calculation was added.

The region has `tabindex=0`, an accessible name and a short keyboard help description. Native arrow/PageUp/PageDown/Tab behavior is retained, following [W3C scroll-region guidance](https://www.w3.org/WAI/standards-guidelines/act/rules/0ssw9k/). [Natural overscroll chaining](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior) lets the page move when the pane reaches its boundary.

Map-selected results reveal through `revealResultInPanel`, which adjusts only the list’s scrollTop. It does not move the document or steal focus. Expanded cards taller than the pane reveal their heading. Mobile keeps the unbounded document list rather than a small nested scroller.

Ordinary map wheel zoom is disabled using [MapLibre’s scrollZoom option](https://maplibre.org/maplibre-gl-js/docs/examples/disable-scroll-zoom/). Explicit zoom controls, keyboard zoom, manual panning, cooperative touch gestures and Adjust search location remain. Existing ResizeObserver resizes the renderer when its actual canvas container changes; it is not remounted on resizing or pagination.

Attribution remains visible inside the map. Browser testing found that passing explicit AttributionControl options discards MapLibre’s default credit; a fixed protected MapLibre credit is now supplied explicitly. Geoapify/OpenStreetMap/OpenMapTiles credit still comes from source metadata in the live configuration. Repeated tests use credited offline metadata, not live tile claims. Canvas focus draws inside its clipped frame so the keyboard outline remains visible.

Desktop is two columns above 900 CSS pixels. Tablet 1024 stays two columns; mobile and small landscape use the existing stacked/map controls. Tested 1920×1080,1440×900,1280×800,1024×768,390×844,375×812 and 844×390. **Real 125% Chrome zoom**, using only the disposable verification profile, changed 1280×800 to 1024×640 with DPR 1.25; the panels still align and do not overflow. The owner’s Chrome settings were not changed.

## 5–9. New food source, reuse and coverage

Successfully integrated [Prince George’s County Food Assistance Directory](https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv), maintained by the county Office of Food Security. [Official OpenPGC terms](https://data.princegeorgescountymd.gov/terms-of-use) permit conditional reuse and require a county disclaimer. The source is **not CC0** and is not a partnership or endorsement.

The full required notice, source credit, nonendorsement and terms link are served at `/data-notices/openpgc.html`, using a local stylesheet compatible with CSP. Source disclosures link to it. County termination/removal rights remain an owner obligation.

| Food source | Public programs | Scope |
| --- | ---: | --- |
| Philadelphia Free Food and Meal Sites |324| Existing partial Philadelphia coverage |
| Seattle/King County Emergency Food and Meals |209| Existing partial regional coverage |
| **OpenPGC food assistance — NEW** |**60**| Portions of Prince George’s County, MD; 19 source city strings |
| **Total** |**593**| Portions of PA, WA and MD; not statewide or national completeness |

The new snapshot has 167 source weekday rows, grouped into 72 exact operator/host/address/type program groups. 60 groups are published. Nine market groups, two regional food-bank/hub groups without walk-in evidence, and one invalid-coordinate group were excluded. This does not treat 167 repeated schedules as 167 new programs. 149 accepted upstream UUIDs remain tied to the 60 programs.

New-source fields: 46 usable websites, 21 eligibility texts, 60 raw schedules, 0 supplied phone numbers and 0 supported cost claims. Missing phone/cost information remains missing. Raw schedule text is shown under Hours without inventing start/end times. Food format, access, registration and visit-limit facts remain source qualified. Source dataset timestamp: **2026-11-06T14:33:27Z**; it does not mean each program was contacted or independently verified.

Eight of the 60 programs do not have an exact Census city-name match. Source coordinates pass bounded geographic checks, but this is not independent street-level confirmation; these exceptions remain documented for owner review.

Actual local food search totals at the fixed test coordinates recorded in the evidence JSON:

| Center |5mi|10mi|25mi|50mi|
| --- | ---: | ---: | ---: | ---: |
| Harrisburg, PA | 0 | 0 | 0 | 0 |
| Indiana, PA | 0 | 0 | 0 | 0 |
| Philadelphia, PA | 219 | 315 | 324 | 324 |
| Brooklyn, NY | 0 | 0 | 0 | 0 |
| San Francisco, CA | 0 | 0 | 0 | 0 |
| Chicago, IL | 0 | 0 | 0 | 0 |
| Houston, TX | 0 | 0 | 0 | 0 |
| Seattle, WA | 53 | 106 | 189 | 208 |
| Hyattsville, MD | 24 | 44 | 60 | 60 |
| Laurel, MD | 7 | 16 | 58 | 60 |
| Brandywine, MD | 2 | 6 | 53 | 60 |
| Carnation, WA | 3 | 10 | 164 | 208 |
| Snoqualmie Pass, WA | 0 | 0 | 3 | 188 |

These are directory totals, not the 20-card page size. Census representative city centers can produce slightly different boundary counts from the fixed test coordinates. Actual browser journeys also use the current API and imported records; exact samples and responses are recorded in `real-coverage.json` and `actual-browser.json`. The companion [per-location quality matrix](../../output/final-discovery-layout-food-and-navigation/coverage-quality.json) records source IDs, source freshness, sample missing fields, referral status and explicitly unmeasured duplicate/mapped counts for every center and radius. Missing-field examples are samples, not complete field-rate estimates.

The two smaller/rural checks include Carnation, WA and Brandywine, MD. Harrisburg, Indiana, Brooklyn, San Francisco, Chicago and Houston still have no imported food records in these tested radii. That is an Our Ground coverage gap, not proof that no assistance exists. Clearly labeled referrals remain available. For every center, mapped-lead counts are **NOT RUN**, rather than zero. Zero-import centers are referral-supported. Exact repeated imports add no duplicates, but a cross-source duplicate rate was not independently measured and uncertain cross-source matches remain a review task. Mapped supplements were deliberately not requested live during these checks; successful empty, partial unavailable and failed-source contracts are separately fixture tested.

## Other sources researched and boundaries

- NYC’s official GetFood information/download was inspected, together with city terms. A public locator/PDF was not treated as unrestricted copy permission, and unsupported coordinates were not fabricated. No interactive-locator scraping occurred.
- California CDSS food banks identify regional organizations/service areas, not necessarily walk-in food pickup. They were not imported as ordinary pantries without suitable evidence.
- Boston, Cambridge, Montgomery County, Western Pennsylvania, DC, Missouri and Delaware catalogs/metadata were investigated. Retail permits, SNAP retailers, unsuitable program/classification or incomplete reuse/location evidence did not become pantry records. This is a bounded review, not a claim that no other authorized source exists.
- The existing bounded OSM extract parser still preserves food-bank/soup-kitchen/food-sharing distinctions in separate unpublished output. [ODbL](https://www.openstreetmap.org/copyright) combination/share-alike obligations remain unresolved for publication. No large Geofabrik PBF or nationwide Overpass request was made.
- 211, FoodFinder, Feeding America and other networks still need authorized feed/product/geography/storage/redisplay scope. No scraper, invented agreement or unapproved credential use was added.
- Seasonal child-meal programs and SNAP retailers were not relabeled as year-round free pantries to inflate counts.

The full source research and owner commands are in [food expansion operations](final-discovery-food-expansion.md). More regions and authorized partners remain necessary for broad national food coverage.

## 10. Data quality, identity and reconciliation

The existing source registry, bounded downloads, source metadata, safe URLs, deterministic IDs, geographic anomaly checks, privacy holds, dry-run owner CLI and review protections were extended. No public import endpoint or recurring job was added.

Weekday grouping requires exact normalized operator/host/address/type agreement. Programs at the same address or under the same parent remain distinct when evidence differs; coordinates alone never merge identities. Existing coordinate conflict checks still run before deduplication. Neither a Census sanity check nor a source point establishes independent street-address or operating-status verification.

Migration 015 adds the reviewed Maryland source and exact owner import/withdrawal boundaries. Migration 016 adds private **upstream row lineage**, storing UUID bindings and sticky privacy/review flags without addresses. It backfills current accepted source identities and checks every import/replay before returning. A privacy/missing-address change propagates across all old/current/rekeyed program IDs, even after source snapshots were minimized. Ordinary identity changes quarantine source-bound records for review; independent organization corrections remain preserved. Reappearance does not clear privacy holds. An owner-reviewed food release workflow is still required before any release.

Both migrations are additive and were applied only to new local `ourground_discovery_final` and disposable test databases. Historical 001–014 remain unchanged. Original `ourground_final` and `ourground_7d1` were read only. New Maryland applies reject the old clone; the runtime uses restricted `our_ground_api` against the new clone. Owner credentials remain separate and no `.env.local`/hosted configuration was edited.

All nine baseline ordered-row preservation comparisons match: existing services/locations/organizations, source records/versions/runs, privacy holds/events and structured hours. Existing 533 public food programs and 17,418 HRSA services remain intact. Repeated new imports reuse the completed run and create no duplicate programs. Runtime, browser and ordinary authenticated roles cannot read/write the lineage registry or invoke owner import/withdrawal helpers. Schema inspection reports 0 problems.

## 11–14. In-context information, legacy links and corrections

Normal result actions no longer navigate to a standalone public detail page. Call, Website and Directions remain direct card actions when supported. Source/date/license disclosure remains available. The exact repeated HRSA boilerplate is reduced to its factual classification; any unique or human-added text remains unchanged.

Only substantive records show **About this location**. It loads one exact public API record on demand and expands concise useful facts in the card. No per-card detail prefetch or persistent detail cache is used. Missing hours, eligibility and cost do not generate empty paragraphs or large placeholders. Raw county/Seattle schedules are separated from service descriptions. Closing returns focus to the initiating control and preserves search, selection and pane scroll.

`/resources/:id` remains a compatibility route. It replaces itself with an allowlisted `/support?...&resource=UUID` URL once, preserving giving intent and safe search context. It does not expose staff routes or remove `/api/v1/resources/:id`. Invalid extra path segments/IDs, deleted/private/unpublished resources and mismatched API identities fail safely, with no substituted resource or hardcoded city.

A context-free shared link fetches the exact published record, uses that record’s public point for nearby directory results, and makes no geocoding or mapped-provider request. A shared record outside current filters/page/radius is separately labeled and excluded from the matching count; no fake distance is displayed. Back/Forward uses bounded memory snapshots and opaque history tokens, not resident coordinates/addresses in URL or history state. Public detail opens recheck the server. Initial inbound links now reveal their actual resource once; ordinary card/Close/history actions preserve page position, and manual user navigation cancels the initial reveal.

All real directory cards offer **Report incorrect information** through the existing protected API and private moderation workflow. Report drafts stay in this page’s memory, never browser storage or URL. Close, selection, filtering and pagination retain them. A global Review drafts disclosure offers explicit Resume, read/copy and Discard. Resume revalidates the exact public resource. If it is unavailable, only the user’s draft recovery remains; no old address or submit form is restored.

Submission validates fields and retains the 1,000-character/privacy guidance. 429 Retry-After is honored without automatic resubmission. Pending/sent fields cannot silently accept ignored edits. Completing one submission updates only that form and does not steal another draft’s focus or selection. Leaving/reloading warns about unsaved work; confirmed reload does not persist it.

Transient mapped leads have no directory UUID. Their **Report mapped information** action clearly routes to exact validated OpenStreetMap source identity, or fixed official Geoapify contact fallback. It does not invent a service ID or promise Our Ground directory moderation. No additional provider/detail request is made for those links.

Protected `/staff/services/:id`, organization and administrator workflows remain unchanged. Approved food/healthcare PNGs remain byte-identical in the asset library; they are not placed on ordinary or expanded result cards. Existing landing/About photography, wordmark and navigation are unchanged.

## 15–17. Exact validation and screenshots

| Check | Final result |
| --- | --- |
|`npm test`|**440 PASS, 0 FAIL, 0 SKIP**; existing nationwide, geocoding, giving, cancellation, unsafe links, source/privacy and new navigation/import tests.|
|`npm run build`|**PASS**, Node 24.22.1, frontend/backend typechecks, source credential scan and public environment checks. Existing lazy MapLibre/demo chunk advisory remains.|
|Actual DB/API/security/retention/TLS|**83 PASS, 0 FAIL, 0 SKIP**, fresh guarded databases with 001–016. Includes local SDK fixture, tenant scope, revocation, review, raw-table denials, retention/legal holds, encrypted PG and wrong-host/CA rejection. Not hosted Google/Supabase authentication.|
|Physical Redis|**6 PASS, 0 FAIL, 1 SKIP**. Hosted isolated check unavailable; no hosted success claim.|
|Food DB integrations|**2 PASS** with owner fixture writes rolled back; privacy/review/lineage and runtime denials. 35 focused food/referral checks are included in the full suite, not added again.|
|Panel browser|**16 groups PASS**, native wheel/PageDown/chaining, equal frames/headers, all widths, actual 125% zoom, marker/list sync, attribution, canvas resize, controls, pagination and clearable zero filter.|
|Actual data/API|13 centers × 4 food radii plus real details/20 HRSA records; 57 local API requests, 0 provider requests.|
|Actual data browser|**6 recorded groups PASS**, actual 20 HRSA cards, independently scrolled list, new Maryland programs, mobile, exact legacy link/Hours, empty Indiana/referrals/expansion and required data notice.|
|In-context fixture browser|**17 groups PASS**, native actions/history/refresh, draft preservation/recovery, report 202/429, async focus, mapped feedback, exact legacy coordinates, invalid/private cases and stale-response races.|
|Map failure / first mobile Search|**PASS**: locally injected style 503 leaves actual healthcare records usable; mobile native Search with suggestions open makes exactly one resolve and one directory request. Zero live providers.|
|Local response headers|**PASS**: enforced CSP without unsafe-inline/eval, private account no-store, nosniff and API health; HTTP loopback only, not hosted HTTPS proof.|
|Preservation/security scan|38 existing public assets, protected configurations, 3 private-file fingerprints, 001–014 and all prior reports unchanged. Final source/build/evidence scans recorded.|

The [gallery](../../output/final-discovery-layout-food-and-navigation/gallery.html) separates actual records from clearly labeled synthetic fixtures and includes a historical before-layout comparison. Screenshots were visually inspected. Repeated maps use the actual renderer/markers and a controlled offline background/credits; they do not establish fresh live street-tile delivery.

Keyboard behavior was tested through native input and the accessibility tree/semantics. This is not a manual screen-reader or full WCAG certification. Direct phone/website/directions URLs were validated; no real calls, donations, registrations or correction reports were sent during browser verification. Fixture report submissions were intercepted; actual backend moderation/authorization behavior is separately integration tested.

Memory-aware environment: `GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192`. No new UI library, payment integration, agent model or competitor map provider was installed. Detail data is fetched only when requested. The map remains one instance across resizing/pagination. Existing lazy map/demo chunk-size advisory is unchanged.

## 18. Provider usage

- **0 new live Geoapify geocoding/Places or map requests**. Existing server/browser verification ledgers remain 12/6, unchanged. No counter reset or allowance increase.
- Food research/acquisition used **14 explicit public government catalog/metadata/terms/download HTTP requests**, one actual new source snapshot, no automatic retries. Primary documentation/license web research is separate from geocoding/map billing.
- Application admissions remain reference autocomplete 30/min/client, manual search 6/min/client, provider location 30/min plus 100/day, shared provider 200/day with existing 2/sec and 12/min/client controls. Required Redis remains fail-closed.
- Internal testing caps, application rate limits and Geoapify account quotas are distinct. No account-quota exhaustion diagnosis is made here. Unchanged live tile/geocoding paths were deliberately not repeatedly requested.
- Normal local API activity used existing admissions; hosted environment settings, keys, referrers and counters were not reset or reconfigured. Fresh provider/tile success is not claimed.

## 19. Remaining limits / blocked checks

Food coverage remains partial in three states; national referral availability is not imported national food coverage. Source facts, hours, operating status and coordinates remain unverified. Other authorized sources/partner permissions and OSM publication/license review remain external work.

Real hosted Google/Supabase OAuth/PKCE/accounts, isolated hosted PostgreSQL TLS/RLS/runtime/Data API, isolated hosted Redis, staged HTTPS/CSP/provider journeys, an operational verified public privacy inbox and hosted retention/audit/log/backup/recovery/incident procedures remain **BLOCKED**. No address was invented, no destructive schedule was activated and no missing hosted resource was silently replaced with a fixture. Prior owner-run retention safeguards remain intact.

Local read-only agent architecture/development is conditionally ready with source/provenance, geographic precision, uncertainty and coverage boundaries preserved. It does not justify autonomous claims about available services or public pilot rollout. **No AI-agent implementation occurred.**

## 20. Production protection and changed files

Fresh read-only Vercel inspection still shows `ourground` project `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, unchanged updatedAt 1793860580927, latest READY production deployment **dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4**. Separate staging still has no deployment. No deployment, promotion, hosted env/domain/key/DB configuration mutation, paid resource, GitHub connection, push or merge occurred. Local preview remains available at 18434/API 18795, using only the new isolated data clone. Original databases were not reset. Disposable security databases and test Redis were cleaned up.

The 349-file source/public/config baseline, exact hash audit, sanitized unchanged-private-file booleans, import/lineage proof, final logs and screenshot metadata are packaged under `output/final-discovery-layout-food-and-navigation/`. Raw government feeds/dumps, private-file fingerprints, browser profiles, credentials, signed receipts and confidential excluded rows are not included. The owner-approved npm download-cache cleanup recovered working space; installed dependencies, project files and databases were preserved. File comparisons use the current phase baseline, not remote main; prior uncommitted work was preserved.

Changed/added files for this phase:

- `backend/db-checks.mjs`
- `backend/food-import.d.mts`
- `backend/food-import.mjs`
- `backend/food-source-adapters.ts`
- `backend/geoapify-discovery.ts`
- `backend/manage-db.mjs`
- `backend/migrations/015_pgc_food_assistance.sql`
- `backend/migrations/016_food_row_lineage.sql`
- `docs/implementation/final-discovery-food-expansion.md`
- `docs/implementation/final-discovery-food-request-ledger.jsonl`
- `docs/implementation/final-discovery-food-verification.json`
- `docs/implementation/final-discovery-layout-food-and-navigation.md`
- `public/data-notices/notices.css`
- `public/data-notices/openpgc.html`
- `scripts/import-food.mjs`
- `shared/geoapify.ts`
- `shared/national-referrals.ts`
- `src/location-combobox.ts`
- `src/maplibre-support-map.ts`
- `src/resource-detail.ts`
- `src/support-model.ts`
- `src/support-page.ts`
- `src/support-resource-context.css`
- `src/support-resource-context.ts`
- `src/support-scroll.ts`
- `src/support-view.ts`
- `src/support.ts`
- `src/unified-support.css`
- `tests/food-database.integration.mjs`
- `tests/food-import.test.mjs`
- `tests/food-lineage.integration.mjs`
- `tests/geoapify-source-feedback.test.mjs`
- `tests/giving-links.test.mjs`
- `tests/national-referrals.test.mjs`
- `tests/resource-context.test.mjs`
- `tests/resource-detail-content.test.mjs`
- `tests/support-scroll.test.mjs`
- `tests/unified-support.test.mjs`

Previous reports are retained: [final refinement](final-pre-agent-discovery-refinement.md), [food foundation](final-food-foundation.md), [autocomplete repair](location-autocomplete-rate-limit-repair.md), [7C owner readiness](phase-7c-owner-readiness.md), [7E hosted verification](phase-7e-security-verification.md) and [staging setup](phase-7e-staging-setup.md). Their historical limitations were not rewritten.
