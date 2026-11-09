# EDEN-09 · Protected staging decision

**Follow-up:** [EDEN-10](eden-10-postgres-staging-limiter.md) resolved the Redis dependency for protected staging. The status below is the earlier EDEN-09 checkpoint.
November 7, 2026. **Directory and browser verification passed against Supabase staging. Vercel deployment is blocked.** There is no hosted Preview or hosted API health result.

## What ran

The regular Find Support route ran in Chrome at 1365×880 and at a touch-enabled 390×844 viewport. The website and API ran on loopback; the API used the staging transaction pooler, TLS and the restricted `our_ground_api` role on PostgreSQL 17.11. The browser had no database credentials. These were real search and detail requests, with no response fixtures. Production, the local Gemini review environment, and Supabase data were not changed.

| Search: Harrisburg, PA · Healthcare | Results on both viewports |
|---|---|
| 10 miles | HHC- South Allison Hill (1.3 mi); Hamilton Health Center Family Practice at Steelton (3.6 mi); Sadler Health Center Corporation Mechanicsburg (6.4 mi) |
| 5 miles | HHC- South Allison Hill; Hamilton Health Center Family Practice at Steelton |
| 10 miles, directory keyword “Sadler” | Sadler Health Center Corporation Mechanicsburg |

All three detail responses matched the IDs and coordinates in the [HRSA import receipt](verification/eden-08/healthcare-pilot-source.json). The first browser run uncovered a missing detail link: these basic imports had public source identifiers but no additional hours or eligibility fields. Find Support now offers **View source record** for those listings and displays the source, original record ID and a reminder to confirm services. All three links were opened in the regular UI on each viewport. Existing substantive detail links, fictional records, maps and EDEN were not redesigned. The two focused detail test files passed (22 tests).

The separate action check supplied finite proposals to the existing EDEN navigator and action controller. It navigated from home to Find Support, set the city/category, searched, read the results, opened details, narrowed the radius, and focused Sadler. The map ran actual MapLibre and the application's markers with a tile-free style in this check only. All three marker coordinates matched HRSA; marker→card and card→marker selection both passed. At five miles the map showed two markers (on mobile, reopen the map after refining the search). The regular page, with no staging map key, showed its honest list fallback. Geoapify streets, hosted tile access, and a physical phone were not tested.

The EDEN facts adapter returned the public title, HRSA source, update date (2026-11-06), and the statement that current operation is not independently verified. Its provider projection substituted listing numbers for titles. No Gemini or speech call was made. Raw service tables, source snapshots and privacy holds were inaccessible to the runtime role; owner import and withdrawal functions were also denied.

[Browser/API/database receipt](verification/eden-09/browser-and-database.json) · [Desktop](verification/eden-09/desktop-sadler.png) · [Mobile](verification/eden-09/mobile-sadler.png)

## Independent recovery copy

The existing [restore-tested archive](eden-08-manual-recovery.md) was encrypted with OpenPGP AES-256 into a new directory on Penuel Back. Decrypting the independently stored file gave exactly 1,957,036 bytes, SHA-256 `6180d83b1f893d9a4828368361a7d2ac393b20a87d0c92d991153cfb529b3ad1`. The new ciphertext is 1,957,147 bytes, SHA-256 `0cc6586bff7e17180c421637e57e4390300cc9624875da1421eb6195c9bbec2d`. No existing file was overwritten, no plaintext was copied to the drive, and no database restore was repeated.

External folder: `/Volumes/Penuel Back/Our Ground Backups/eden09-20261107T204816Z-471a209a/` (ciphertext and nonsecret manifest). The randomly generated recovery passphrase is stored separately in an ignored owner-only local file; the owner should preserve it in a password manager recoverable independently of this Mac. This is a restorable directory archive, not an export of Supabase Auth or a demonstrated cross-project disaster recovery.

## Hosted gates and next steps

| Gate | Current evidence |
|---|---|
| Identity and protection | Team `penuels-projects-aa802b06`, project `ourground-staging` (`prj_eU9xRSetSQYTbkAce2cYIR5zx8c2`). [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) enabled for all except custom domains. Zero deployments, zero project environment variables, zero project log drains. No anonymous/authorized HTTP checks possible yet. The main checkout is linked to production; use a separate staging-linked source tree. |
| Build, routing, logs | Set **only staging** to Node 24.x, matching the repository. Vite builds to dist; API rewrite precedes the SPA fallback. Build and request startup do not migrate or import data. Local envs, dumps and verification artifacts are excluded from Vercel upload; API errors log a request ID and event, not request content. Deployment logs, routing, access denial and runtime secret handling still need hosted checks. |
| Distributed protection | The signed-in Upstash console shows one existing free database, `ourground-rate-limit`; it refuses a second database without adding a payment method. No dedicated staging endpoint/token is available. Hosted admission fails closed without a working distributed limiter. Do not reuse the existing instance or downgrade to an in-memory limiter. [Upstash Redis pricing](https://upstash.com/pricing/redis) |
| Supabase | Real restricted role, PostGIS, and search passed locally. Preview has no runtime variables. Auth email confirmation enabled, Google disabled; Site URL is localhost:3000 with no redirect URLs. No hosted sign-in verified. Account flows may stay off for directory-only staging. |
| Geoapify | Only Our Ground Dev and two keys were visible; no dedicated staging browser key/origin restriction was verified. Map tiles need a separate key restricted to the intended protected Preview origin. Optional provider search and geocoding may stay disabled; Harrisburg search used the actual geographic reference database. |
| Gemini | No hosted credentials, reviewer grants or development overrides configured. Keep Gemini/Live off in Preview. Verify disabled status and denial of provider requests on the hosted URL when available. |

1. **Owner decision:** supply an already available, dedicated nonproduction Upstash REST endpoint and write-capable token at no added cost, or authorize separate design and testing of an atomic PostgreSQL rate limiter. Do not add billing or share the production instance. For the existing Redis path, configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` privately for **Preview only** in the staging project, never as Vite variables. Verify endpoint isolation, allowed atomic operations, error behavior and quotas.
2. Before upload, configure only staging runtime values, including the restricted `DATABASE_URL` and `DATABASE_SSL_CA`, server-side, real Postgres/reference mode, no demo or reviewer overrides. Never add `MIGRATION_DATABASE_URL` or an owner/service-role credential. Choose a protected Preview hostname and configure the corresponding exact browser key restriction. If testing account flows, configure the staging Auth origin, exact callback/allowlist, publishable key and CSP; otherwise leave sign-in disabled and identify it as untested.
3. With these gates green, deploy **Preview only** to the verified staging project. From a clean anonymous client verify the site **and API** require authentication, then test health, searches, details, map tiles/selection, no-store headers and disabled Gemini from an authorized session. Do not assign a production/custom domain. Real-data release beyond this three-record pilot still requires separate coverage, freshness, access-control and recovery decisions.
