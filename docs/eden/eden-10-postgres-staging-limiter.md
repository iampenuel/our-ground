# EDEN-10 · Protected staging without paid Redis

The authenticated reviewer Preview is live. Open the branch URL and sign in with a Vercel account that has access to `ourground-staging`. [Open Our Ground staging](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) · [Hosted verification](verification/eden-10/hosted-verification.json) · [Limiter SQL](../../backend/staging/001_atomic_limits.sql)

### What is limited

The existing Redis path is unchanged for production. These are fixed windows based on the database clock. Limits in the client column are per normalized network; on staging, collisions share a stricter limit.

| Route or operation | Client limit | Additional shared limit |
|---|---:|---:|
| Resource correction reports | 3/hour | 100/day |
| Place resolution and legacy discovery place lookup | 6/min | 100/day |
| Directory search/list/detail, non-reference retrieval and read fallback | 120/min | — |
| Organization session verification / logout | 30/min / 60/min | Existing separate account and workflow quotas unchanged |
| Reference city, autocomplete, lookup and eligible reverse entry | 30/min | — |
| Explicit manual location submission | 6/min | — |
| Live location provider admission | 30/min | 100/day or lower in staging |
| Supplemental Geoapify search | 6/min | — |
| Outbound Geoapify provider calls (also used by live geocoding) | 12/min | 2/second + up to 200/day; threshold warning |

Health, status and category metadata were not previously Redis-gated. Existing per-account database quotas, provider concurrency checks, exact-origin controls and local-only Gemini gates remain in place. Server-side Geoapify calls and account sign-in are off in this Preview configuration. Browser tile requests go directly to Geoapify; their domain restrictions and provider allowance are separate controls.

### Implementation and evidence

The opt-in adapter requires the precise Vercel Preview project, Supabase project, restricted pooler identity, transaction port and verified TLS. The designated Preview cannot fall back to Redis if its selector or secret is missing. Owner credentials are rejected. The SQL is outside the ordinary migration chain; build/startup never installs it.

The API normalizes only Vercel’s [platform-provided client header](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). It uses a staging-only secret to select one of 256 slots. The database stores an action, slot, window end and count—not an IP, digest, URL, search, voice, or resource ID. Malformed addresses share a bucket; IPv6 addresses share the existing /64 rule. Keyed collisions can throttle two unrelated reviewers together; this trades precision for a hard cardinality bound. A shared address or a window boundary behaves as with fixed-window Redis, not as an identity or bot-proof system.

A [transaction-scoped advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS) serializes each action across instances. All applicable windows must admit before any is incremented. The database calculates time after acquiring the lock. There are at most 2,565 logical rows across ten actions, including global day/second slots. Expired counters are replaced on use; a [Supabase Cron](https://supabase.com/docs/guides/cron) job purges them every five minutes even when the app is idle. It also trims only its own completed job history after one day. The owner-only purge was verified and two scheduled executions succeeded without failure at the checkpoint.

A non-login role owns the private schema and functions; the table has RLS. Browser/service roles lack schema usage. The runtime role has only schema usage and execute on the admission function, not table access, purge or schema creation. Lock timeout, storage error, timeout or queue overload fails closed with 503. A capacity denial returns 429 with Retry-After. Each function instance uses at most one additional pooled client, no prepared statements and a bounded queue; it does not cache permits.

In the real database test, **6 of 18** simultaneous requests were admitted across six independent pools; **12 returned 429** in 770 ms. Untrusted forwarded-header changes did not reset the limit. Holding the actual admission lock caused HTTP 503; releasing it restored HTTP 200. Minute and second windows expired on PostgreSQL time, the shared provider budget survived the window boundary, and denied calls did not increment it. Published record IDs and titles did not change. In a separate process the actual Vercel API entry point returned all three expected 10-mile records, two at five miles, one for Sadler and three source-matched details with no-store headers. Gemini session creation returned 403 with text, agent, and speech unavailable. No provider call was made.

Storage measured **66,336,435 → 66,541,235 bytes** across installation/testing (+204,800 bytes including the cron extension); the limiter table plus its index occupied **32,768 bytes**. The project was on Free, whose published allowance is [500 MB per project](https://supabase.com/pricing). The database connection setting was 60; 8 sessions were visible before installation and 15 at the post-test snapshot (not a peak or load guarantee). This is suitable for low-traffic, protected review, not evidence of production capacity. Monitor actual pool occupancy, 503/429 rates, failed cleanup, database size and free-project availability; postpone larger loads if these grow. The previously encrypted directory backup remains valid for resource data. Restore directory data first, then recreate this isolated overlay on a separately reviewed empty staging target; there is no reason to back up or restore expired admission counters.

### Protected Preview decision (November 7)

Vercel confirms the correct team and project, Node 24.x, Vercel Authentication (all except custom domains) and **20 Preview-only variables**. Three non-readable Secrets hold the restricted database URL, CA and limiter secret. No owner credentials, production Redis, Gemini key or reviewer grant were uploaded. The new Config variable is the third key on the existing Free Geoapify project, named **Our Ground — Vercel Staging**; the other two keys were not changed. The exact origin/referrer patterns were confirmed in the provider dashboard. The project’s quota is shared across its keys. [Geoapify key restrictions](https://myprojects.geoapify.com/help/api-keys/)

| Fresh style requests | Original rules | With the authorized `^$` IP rule | After rollback |
|---|---:|---:|---:|
| Approved origin and referrer | 200 | 401 | 200 |
| Unrelated origin or unrelated referrer (tested individually and together) | 401 | 401 | 401 |
| Neither header | 200 | 401 | 200 |

The allowed style was real MapLibre JSON. The corresponding Harrisburg vector tile returned protobuf from the approved origin; the unrelated origin returned 401. Without both headers the provider returned the keyed style even on a cache miss; the same style URL without a key returned 401. The vector tile also returned 200 without a key, so the style is the unambiguous test of credential enforcement. The authorized IP experiment blocked the approved browser, so only that new IP rule was removed; the two original browser rules are intact. Site access remains a separate Vercel Authentication boundary. Someone who obtained the browser key could consume shared Geoapify quota without those headers; they would not thereby gain access to Our Ground, Supabase or Gemini.

### Verified hosted deployment

On November 7, the one-time static bootstrap (Production target inside `ourground-staging` only) was uploaded using `--prod --skip-domain`. Its content is one HTML placeholder. It remains READY and has zero aliases. Anonymous page and API requests on its generated URL redirected to Vercel Authentication. Both potential staging production aliases returned 404. The earlier application deployment that hit Vercel’s first-deployment rule had already been removed. [Earlier attempt](verification/eden-10/deployment-attempt.json)

The already-built application was uploaded using the current Vercel CLI API command, referencing the verified prebuilt files with automatic production-domain assignment disabled on that request. The deployment API represents Preview with a null target. The READY application deployment has that target, no custom environment, and the verified branch alias. The branch alias matches the original Geoapify restrictions. The project-wide automatic domain setting is enabled. The deployment-level setting is disabled for this application artifact. [Vercel deployment target semantics](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)

| Deployment | ID | Result |
|---|---|---|
| Static bootstrap | `dpl_3ik7rAezGQwGiEEjcEgpEVit621N` | Protected Production placeholder with zero aliases |
| Real application | `dpl_A4HRJGdewVv3Sae2DBWeZvL9qLhq` | Protected Preview with the single approved branch alias |

The generated application hostname is `ourground-staging-kxjq58jrg-penuels-projects-aa802b06.vercel.app`. Use the branch alias for tiles. Anonymous requests to both application URLs for the homepage and health API returned 302 to Vercel sign-in. Authenticated health returned 200. All 20 runtime settings are Preview-only. Every directory query checks the runtime user before reading the published projection. Those queries passed on the host, and a direct restricted-role probe confirmed `our_ground_api` could execute admission but had no counter-table access.

Chrome at 1365×880 and in a touch-enabled 390×844 viewport followed Home → About → Find Support and submitted Harrisburg Healthcare through the ordinary form. Each viewport also exercised mock proposals through the deployed EDEN navigator and action bridge. Search returned three listings at ten miles, two at five miles and only Sadler at ten miles with the keyword filter. The three detail views matched their HRSA source identifiers and coordinates, and the cards displayed their imported/unverified status. The map loaded Geoapify styles and protobuf tiles on both viewports. Marker clicks selected the correct card and card clicks highlighted the corresponding marker. Hosted Gemini session, text, speech and Live-token requests returned 403. [Desktop capture](verification/eden-10/hosted-desktop.png) · [Mobile capture](verification/eden-10/hosted-mobile.png)

Eight concurrent hosted manual searches produced six HTTP 200 responses and two HTTP 429 responses with a 46-second Retry-After. A short transaction-scoped lock on the staging limiter’s reference lookup produced 503. Releasing the lock restored 200. The original rate-limited search succeeded again after its window expired. Geoapify displayed Free, 3,000 daily credits, and period totals of 458 requests and 296 credits for October 7–November 7. These are dashboard totals rather than an instantaneous usage meter.

Public release requires a separate decision on directory coverage and freshness beyond three imported listings, production capacity and recovery, and any account or AI features brought into scope. The documented shared map quota limitation was accepted for this authenticated test. The separate production project and billing settings were untouched.
