# Phase 7D — provider and development setup

Geoapify is the selected location and tile provider. Mapbox credentials, Mapbox GL JS and a Mapbox account are **not required**. PostgreSQL/PostGIS remains the resource search engine; HRSA is the healthcare data source. Optional older Google place-discovery code remains disabled unless its separate approval/configuration is supplied; it is not a fallback dependency of Find Support.

Production remains Phase 7A. This guide authorizes no deployment, remote migration, paid plan, billing change or new account. Staging requires the owner's explicit authorization and confirmation of the nonproduction target.

## Keys and local configuration

Obtain a free key through [Geoapify MyProjects](https://myprojects.geoapify.com/): create/select the owned project, then open **API Keys**. The [official key guide](https://myprojects.geoapify.com/help/api-keys/) describes allowed IPs, HTTP referrers, origins and CORS. No credit card or paid-plan activation is needed for the documented free plan.

Use the recovered checkout:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/Documents/Projects/our-ground`

Merge values into its ignored `.env.local`; do not overwrite existing values or paste keys into chat. `.env.example` contains names and nonsecret defaults. The current checkout already has **distinct server and browser Geoapify keys**; values were compared without printing them. No key/restriction was changed during this work.

```dotenv
# Secret to this application; never give it a VITE_ prefix.
GEOAPIFY_SERVER_API_KEY=REPLACE_ME_SERVER_KEY
# Public browser token: restrict to actual approved app origins/referrers.
VITE_GEOAPIFY_BROWSER_KEY=REPLACE_ME_BROWSER_KEY
GEOAPIFY_LOCATION_ENABLED=true
GEOAPIFY_LOCATION_LIVE_APPROVED=true
GEOAPIFY_SERVER_DAILY_BUDGET=200
GEOAPIFY_SERVER_WARNING_PERCENT=80
GEOAPIFY_LOCATION_DAILY_BUDGET=100
GEOAPIFY_LOCATION_MAX_RETRIES=0
UPSTASH_REDIS_REST_URL=REPLACE_ME_HTTPS_REDIS_URL
UPSTASH_REDIS_REST_TOKEN=REPLACE_ME_REDIS_TOKEN
BACKEND_DATA_MODE=postgres
ALLOW_DEMO_DATA=false
DATABASE_URL=REPLACE_ME_RESTRICTED_RUNTIME_CONNECTION
ACCOUNT_ALLOWED_ORIGINS=http://127.0.0.1:18418
```

These placeholders are not working credentials. Provider capability flags are explicit approval/configuration gates, not a claim that the connection has been tested. Restart the local API after configuration changes and rebuild the browser after changing `VITE_` values.

Geoapify supports multiple keys for a project rather than a separate endpoint-specific token type. One key could technically reach both APIs and tiles, but this application's Phase 7C environment guard intentionally rejects copying the configured server key under a browser variable. Preserve the existing distinct-key setup. Browser exposure is expected for the tile key; public origin/referrer restrictions and quota monitoring matter. Keep the server key out of browser bundles. Apply IP restrictions only when actual egress is known; do not invent a stable Vercel egress address. CORS response settings are not authorization restrictions.

For the local production preview, allow its exact origin/referrer `http://127.0.0.1:18418/` in the browser key's applicable settings. A suitably anchored HTTP-referrer expression is `^http://127\.0\.0\.1:18418/.*$`. Retain existing approved production entries. Do not add a wildcard Vercel origin. A future staging referrer must match the explicitly authorized deployment and be removed when that verification ends. The site sends only its origin cross-site under `strict-origin-when-cross-origin`; private pages use `no-referrer`. No restriction was edited by this implementation.

## Independent services and limits

The primary location APIs are `POST /locations/suggest`, `/locations/retrieve`, `/locations/reverse` under `/api/v1`; status is `GET /locations/status`. Autocomplete uses Geoapify `/v1/geocode/autocomplete`, forward resolution uses `/v1/geocode/search`, and reverse labels use `/v1/geocode/reverse`. Requests use the documented contracts; autocomplete/forward use `filter=countrycode:us`. Reverse does not receive an unsupported geocoding filter parameter; returned country/state evidence is checked independently.

A selected autocomplete response already contains coordinates. The signed, expiring selection receipt binds ID, session and returned point, so retrieval makes **zero additional Geoapify calls**. Session IDs only scope the application's selection workflow; there is no Mapbox billing-session mechanism. A returned suggestion must be explicitly selected. No uncertain first result is selected automatically. Explicit state and ZIP conflicts and invalid/conflicting returned country evidence are rejected. Suggestions show the provider-returned address for deliberate selection; arbitrary street text is not claimed to be independently verified. Forward city/ZIP resolution requires exactly one matching result. A standalone supported two-letter state code restores a state-only coarse URL through structured full-state-name/country parameters and `type=state`, requiring one exact returned state; ambiguous city names such as New York keep the city workflow.

Coordinates and location responses stay in transient page/request memory. Precise addresses, provider IDs, receipts and GPS coordinates are not written into share URLs, resident histories or resource tables. Public coarse city/state text can reproduce an area after navigation. A GPS/map selection without a coarse label must be selected again after a full refresh; filters remain. No automatic permission request occurs. Reverse labeling is optional; its failure retains the original point with an explicit unavailable-label message and still uses the normal protected resource endpoint.

The optional Geoapify Places supplement retains its existing `GEOAPIFY_ENABLED` and `GEOAPIFY_LIVE_APPROVED` flags. Leave them false to verify HRSA/PostGIS without POI traffic. Those flags do **not** disable primary autocomplete, tiles or the directory. Mapped POIs remain labeled separately; they are not imported as curated directory records. Maps require the restricted public tile key, public points and a selected center, not a Places availability flag.

All server-side Geoapify APIs share the existing Redis global provider counter. The application ceiling defaults to **200 requests/day**, cannot be configured above 200, and can be lowered. Existing 2/second and 12/client-provider/minute limits remain; optional Places search admission also retains 6/client/minute. Location entry adds 30/client/minute and a configurable 100/day default inside that overall provider ceiling. Missing/outage/malformed required shared admission fails closed. Signed selection retrieval and PostGIS reads do not spend Geoapify credits.

The warning defaults to 80% of the configured server budget, rounded down conservatively. Redis records one aggregate warning marker; it is not a push-notification service. Check it deliberately with:

```sh
node --env-file-if-exists=.env.local scripts/geoapify-usage.mjs
```

This one read-only aggregate operation returns reservations and warning status, never client identifiers, addresses, coordinates or credentials. Failed upstream attempts can still reserve permits. The monitor is not an account billing report.

Autocomplete is debounced 300ms, starts at two meaningful characters (including state codes), and shows at most five results. Duplicate in-flight input, cancellation and stale responses are controlled. Lookup timeout is eight seconds. Automatic retries default to zero; optionally setting `GEOAPIFY_LOCATION_MAX_RETRIES=1` permits one transient-only retry after 500ms within the deadline. Every attempt gets shared admission and is counted. Authentication errors, quota denial, invalid responses and Redis failures are not retried. Ordinary resource/API safeguards remain in force.

[Geoapify pricing](https://www.geoapify.com/pricing/) currently lists one **shared 3,000-credit daily free allowance**, up to five requests/second and no free-plan SLA. [Pricing details](https://www.geoapify.com/pricing-details/) assign one credit to a standard autocomplete/forward/reverse request and 0.25 credit to a map tile. They do not allocate a separate free allowance to each service. Example estimate: four typed lookups plus one reverse label and 20 tile requests are about 10 credits, excluding auxiliary requests and other activity. This is an estimate, not observed billing.

Direct browser tile/style/font/sprite traffic and other keys/users are outside the backend's complete control. Maps initialize when needed and retain one renderer, but a backend 200-request ceiling does not enforce the complete account credit cap or aggregate browser request rate. Monitor the Geoapify dashboard, key restrictions and remaining allowance. The main report separates observed requests, estimated credits and unverified account-wide usage. No credits were purchased and no billing information/plan was changed.

The retained `osm-bright-smooth` style supplies its TileJSON attribution. Keep the attribution control visible and preserve **Geoapify, OpenStreetMap and OpenMapTiles** credit, including free-plan branding. Do not remove it for appearance. See [map documentation](https://apidocs.geoapify.com/docs/maps/) and [terms](https://www.geoapify.com/terms-and-conditions/).

## Database and HRSA

Use Node **24.22.1** and the documented memory-aware environment:

```sh
export GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192
npm test
npm run build
```

Keep runtime `DATABASE_URL` restricted to `our_ground_api`. The owner/migration connection belongs only in ignored owner tooling configuration; never copy it to the API or a `VITE_` variable. Remote TLS verifies chain and hostname. Plaintext is only an explicit nonproduction loopback exception. Use the owner's selected development Supabase project and target guards before applying migrations; never infer a project or point development tooling at production.

Review migrations 008–010 after the unchanged 001–007 chain and follow the [data-source/import guide](phase-7d-data-sources.md) for exact current migration hashes, HRSA dry-run/apply commands, suppression holds and source dates. The completed local import already provides 17,418 real healthcare sites; no ingestion into a hosted database occurred.

Safe dry-run examples:

```sh
node --experimental-strip-types scripts/import-hrsa.mjs --download
node --experimental-strip-types scripts/import-hrsa.mjs --file /path/to/reviewed-sites.csv
```

Applying requires the appropriate owner-only target URL, explicit target confirmation and `--apply`. Full-snapshot reconciliation is a separate explicit flag. Reuse the reviewed download during repeated tests rather than repeatedly fetching the official source. Food feeds require their own permitted-use evidence/credentials; referral links work without those feeds or paid accounts.

## Running the owner-review preview

The current task-owned local production preview is `http://127.0.0.1:18418/`, proxying the API on loopback port 18793 and the separate disposable real-import PostgreSQL database on 18790. It uses the restricted runtime role and excludes demo records. Keep this local database separate from the earlier organization/security fixture databases. It is not a hosted environment or a durable backup.

For a subsequent restart, merge the approved values above into ignored local configuration, select the intended restricted local runtime connection, and run the API and production preview in separate terminals. Do not use an owner connection for the API:

```sh
API_PORT=18793 npm run dev:api
# After npm test and npm run build:
API_PORT=18793 npm run preview -- --host 127.0.0.1 --port 18418 --strictPort
```

The Vite preview reads `API_PORT` to proxy the API. Port18418 already passed the configured browser key's origin restriction; the earlier18428 candidate was rejected and is not the handoff URL. No Geoapify key/restriction change was needed. The verification preload is a separate local test guard; normal owner review still uses the application's shared admission and conservative daily budgets.

## Verification and real-user gates

During the recorded live verification, the API was protected by a local-only, fail-closed preload ledger capped at 40 outbound server Geoapify requests, with no credentials/query contents in the ledger. The completed owner-review API now runs under the normal shared product limits. Deterministic tests use mocks; browser/map traffic is counted separately. Do not deploy that test preload or synthetic authentication.

See the [main implementation report](phase-7d-nationwide-discovery.md) for actual results and [pilot-readiness guide](phase-7d-pilot-readiness.md) for real Google/Supabase, SMTP, hosted DB/TLS/pooler, Redis/Vercel boundary, exact HTTPS/private headers, CSP, privacy contact, retention and incident-operation gates. The isolated hosted Redis algorithm passed, but that does not establish deployed behavior. Staging is not authorized here. Production remains unchanged.
