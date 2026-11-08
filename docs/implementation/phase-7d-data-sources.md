# Phase 7D data sources and controlled import evidence

Reviewed November 5, 2026. Production was not changed. Source classifications describe the actual connection and permissions, separately from listing verification or pilot readiness.

## HRSA: connected and verified official download; local import verified

The authoritative source is HRSA/Bureau of Primary Health Care's **Health Center Program Service Delivery and Look-Alike Sites**. The [official download catalog](https://data.hrsa.gov/data/download) labels its usage limitations “None” and describes daily refreshes. This is the specific public service-delivery-site dataset, rather than the separately licensed Area Health Resources Files or a UDS patient dataset. The catalog displayed an August 28, 2026 update date when inspected; each downloaded row records **November 5, 2026** as its warehouse snapshot date. Neither date is an independent Our Ground verification date or a guarantee that an individual site is accepting patients.

Actual official downloads used:

- [Site CSV](https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv): one successful download, 14,157,000 bytes, 19,537 site rows.
- [Field metadata workbook](https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites_Data_Download_Metadata.xlsx): one successful download; used to validate public fields, identifiers, coordinates, date meaning and suppressed addresses.

CSV SHA-256: `b6972bb8f096efb81e0e22cba7c32762f0e39b15ce3347d1cf91bd24579f6021`.

Downloaded source files remain under `/private/tmp/our-ground-7d-db/`, outside the repository and browser bundle. No source request used credentials or paid APIs. The fixed URL importer does not crawl sites, fetch per-site URLs, or accept arbitrary URL endpoints.

The official field metadata identifies BPHC Assigned Number as the site identifier; Health Center Number identifies its parent program organization. Deterministic UUIDs use a source namespace and entity type, with exact IDs only. No fuzzy organization matching occurs. Parent changes for an existing source site fail the import for explicit owner review. A site's different name or nearby coordinate cannot inherit another site's identity or giving evidence.

## Actual local import

Migrations `008_nationwide_resources.sql`, `009_resource_privacy_withdrawals.sql` and `010_location_privacy_boundary.sql` were applied to the newly created disposable local database `ourground_7d` on PostgreSQL 18/PostGIS. Historical migrations 001–007 were preserved. The completed import contains **17,418 healthcare sites across 1,584 source organizations**, covering every state, DC, Puerto Rico, the U.S. Virgin Islands, American Samoa, Guam and the Northern Mariana Islands. The runtime uses the existing restricted `our_ground_api` role.

These records are published public-source listings with `data_kind=imported_unverified`. Publication means that the public source supplies an appropriate public site; it does not grant a verified affiliation, organization membership, verified charity label, donation route or clinical endorsement. No food sites were inferred from a health center's name or organization type.

The parser accepted fixed Permanent and Seasonal sites. Seasonal sites are labeled; the feed does not establish today's opening schedule. Exclusions are counted once per row. The parser checks confidentiality first, then inactive status, unsupported jurisdiction, nonfixed type, missing public address, coordinates and field identity. The table lists the nonzero counts, rather than that decision order:

| Reason | Rows excluded |
| --- | ---: |
| Mobile or other nonfixed site | 1,404 |
| Unsupported state evidence (XX and associated sovereign states FM/MH/PW) | 696 |
| Domestic violence setting, including suppressed addresses | 14 |
| Missing public street/city/ZIP | 3 |
| Invalid/missing coordinates | 1 |
| Identity or field length outside the existing application contract | 1 |
| Total | 2,119 |

Some mobile/other disallowed rows overlap unsupported geography; the first applicable reason determines the count. No suppressed address was rebuilt from the grantee address, city centroid, ZIP centroid or a geocoding request. No suppressed source snapshot or missing-coordinate record was persisted as a public resource. The one overlong site name was left unmatched rather than silently altered.

Territory support here is authorized **resource data** support. Each geocoding/search provider has an independent coverage contract; this import does not establish that every provider supports all five territories. The Geoapify adapter retains `filter=countrycode:us`. It conditionally accepts PR/VI/GU/AS/MP only when the provider returns consistent U.S. country evidence and the supported territory code/name. Live location-provider coverage for those territories has not been verified; the real HRSA import does not prove it.

## Import and reconciliation controls

`backend/hrsa-import.mjs` validates required named columns, quoted CSV, unique source identifiers, consistent real source dates, supported state codes, ZIP/ZIP+4 strings, bounded finite numeric coordinates and existing field lengths. Leading zeros are retained. The official CSV's extra blank header is explicitly tolerated without shifting fields. Missing contacts remain null. Provided domains may receive an explicit HTTPS scheme; unsafe URL schemes, credentials, loopback addresses and malformed contacts are dropped. This does not verify a site's operational website.

Only minimum public site fields are retained. Weekly operating-hours totals do not become invented daily opening hours. Eligibility, costs, appointment availability, languages, patient acceptance, charitable status and donation URLs are not inferred. The actual import has zero opening-hours rows, zero eligibility claims and zero cost claims.

The private source manifest explicitly enables HRSA. Import runs, normalized source records and source version history are separate private tables with RLS enabled, no browser access and no runtime raw-table grants. Only a published public-safe provenance view exposes source name/ID/URL and dates. Run internals, operator details, raw snapshots, errors and private account data are not public provenance fields. The owner-only batch function is unavailable to the API/browser roles, including explicitly revoked browser default grants.

Every import is one transaction with a shared import lock and batches of 250 sites. A failed batch rolls back the entire run. Older source snapshots are rejected before writes, and a disabled source cannot be activated by an import argument. A completed identical checksum preserves resource/run identity; the additive privacy operation can backfill missing stable-ID holds without reimporting resources: the second actual import retained one run, 17,418 source bindings and 17,418 source versions. Changes append source version history and update unreviewed imported service/location fields only. Existing organization data is not overwritten by a routine site refresh. Any human change to tracked service/location/organization versions, or a recorded reviewing user, causes the newer source snapshot to be retained with `stale_or_needs_review`, while the reviewed application fields remain intact.

A full snapshot marks absent records stale for review and retains them; it does not delete them. Newly confidential, nonfixed or inactive source evidence suppresses the public projection immediately while retaining authorization bindings and reviewed database records. This safety overlay also applies to search, detail and map projections. Reappearing active records require exact existing source identity. No automated retention policy deletes source bindings or reassigns tenant ownership.

Imports and migrations are separate operations. No production scheduler was activated. A future scheduled refresh must execute the same bounded owner import command in an approved environment; its source scope, failure alerting, retention and deployment must be reviewed before activation.

## Durable privacy withdrawal and reviewed release

An additional review confirmed that direct exclusion already removed a formerly imported domestic-violence site from public projections, but found two related gaps: a suppression-only snapshot was rejected before withdrawal, and a later active source row could automatically restore a previously suppressed site. Additive migrations 009/010 close both paths; migration 008 retains its original checksum.

The parser now permits a nonempty validated snapshot with zero accepted public records. Explicit domestic-violence and suppressed/missing-address rows retain only the stable site ID and reason. The owner importer records a durable private privacy hold, even for a site that has never been imported. Publicly visible service and tenant rows are preserved privately; retained normalized source snapshots/history for a withdrawn site are reduced to its stable ID and a privacy-withdrawn flag. No new confidential street or coordinate payload is persisted.

A source-record trigger forces every held binding to remain suppressed and need review on later inserts or updates. The whole location is hidden, so another service sharing the location cannot reveal it. A separate location trigger prevents ordinary updates or future imports from publishing that point while its hold remains active. Public detail, provenance, location, search and marker projections all exclude it. Identical-checksum imports also backfill missing privacy IDs without creating duplicate resources or runs. Reprocessing the already downloaded real snapshot after migration 010 added only 17 excluded source IDs (14 domestic-violence sites and 3 suppressed/missing-address rows); the 17,418 imported sites and existing completed import run were retained.

Privacy holds and immutable event metadata are private, RLS-enabled and unavailable to API/browser roles. The event log stores source/site ID, withdrawal/review action, import-run binding, optional reviewing administrator ID/evidence URL and timestamps; it stores no address or raw source row. Source IDs remain held indefinitely until an explicit reviewed release; ordinary source refresh or retention never clears a hold automatically.

There is no new HTTP or automated release endpoint. The reviewed migration owner may call `app_private.resource_privacy_review_release(source_id, source_record_id, active_administrator_uuid, public_evidence_url)` only after independently checking the exact identity and current public evidence. The database requires a subsequent completed public source snapshot, active administrator, safe evidence URL, and application location matching that snapshot's exact public street/city/state/ZIP and coordinates. A changed location must be reviewed and reconciled privately while the hold remains active. Releasing the privacy hold writes an immutable review event and **leaves the location hidden**; any later publication remains a separate deliberate owner operation. A subsequent explicit privacy flag reinstates the hold.

Six additional physical PostgreSQL regressions use rolled-back synthetic fixtures only: reviewed previously public site becomes confidential; all-suppressed snapshot; shared-location alias suppression; source/history minimization; no automatic republication from active or identical later imports; never-imported confidential source ID; required owner/admin/evidence/exact-location release; immutable events; API/browser denial. The real imported sites were not used as mutable test fixtures.

## Owner commands

Use Node 24.22.1 and the documented memory limit. Source review and dry-run require no database connection:

```sh
NODE_OPTIONS=--max-old-space-size=192 node --experimental-strip-types scripts/import-hrsa.mjs --download
# Or use the reviewed local download, retaining its checksum:
NODE_OPTIONS=--max-old-space-size=192 node --experimental-strip-types scripts/import-hrsa.mjs --file /path/to/reviewed-sites.csv
```

The download option makes one request to the fixed official source, has a 60-second deadline and 32 MiB limit, follows no redirects and performs no automatic retries. Review source date, accepted/excluded counts and geography before applying.

For an explicitly disposable loopback database whose name starts `ourground_7d`, after applying migrations 008–010 as its owner:

```sh
HRSA_IMPORT_DATABASE_URL=postgres://<owner>@127.0.0.1:<port>/ourground_7d \
NODE_OPTIONS=--max-old-space-size=192 node --experimental-strip-types scripts/import-hrsa.mjs \
  --file /path/to/reviewed-sites.csv --local-test-target --full-snapshot --apply
```

A hosted development import instead requires `--development-target`, `SUPABASE_DEV_PROJECT_REF`, matching `SUPABASE_URL`, and a matching owner `HRSA_IMPORT_DATABASE_URL`. The existing target guard rejects a different host/project. Remote TLS requires certificate verification, with an owner-supplied CA if necessary. The CLI rejects production/Vercel runtime application and never changes credentials. Production data import remains a separately authorized owner operation. The runtime role must never receive import privileges.

`--full-snapshot` explicitly authorizes missing-source reconciliation; omit it for a deliberately partial source test. `--apply` is required for any write. Default dry-run performs no SQL connection or mutation. Neither the CLI nor the migration creates a service scheduler.

Reproduce the controlled local evidence with:

```sh
NATIONAL_TEST_DATABASE_URL=postgres://<owner>@127.0.0.1:<port>/ourground_7d \
  node --experimental-strip-types --test tests/nationwide-database.integration.mjs
NATIONAL_TEST_DATABASE_URL=postgres://<owner>@127.0.0.1:<port>/ourground_7d \
  node scripts/hrsa-coverage.mjs /tmp/our-ground-coverage.json
```

## Coverage and measured geospatial behavior

The machine-readable [coverage evidence](phase-7d-hrsa-coverage.json) contains actual database counts, source checksum, nearest source identifiers, sample search counts and the actual PostGIS plan. Counts represent imported public-source sites, not all healthcare providers, current appointment capacity, comprehensiveness or confirmed walk-in access.

| Geography | Healthcare sites |
| --- | ---: |
| AK | 218 |
| AL | 206 |
| AR | 283 |
| AS | 7 |
| AZ | 265 |
| CA | 2,734 |
| CO | 273 |
| CT | 431 |
| DC | 72 |
| DE | 14 |
| FL | 673 |
| GA | 415 |
| GU | 3 |
| HI | 117 |
| IA | 120 |
| ID | 233 |
| IL | 509 |
| IN | 503 |
| KS | 177 |
| KY | 625 |
| LA | 508 |
| MA | 269 |
| MD | 156 |
| ME | 174 |
| MI | 441 |
| MN | 91 |
| MO | 425 |
| MP | 3 |
| MS | 302 |
| MT | 132 |
| NC | 747 |
| ND | 33 |
| NE | 91 |
| NH | 70 |
| NJ | 143 |
| NM | 229 |
| NV | 67 |
| NY | 823 |
| OH | 628 |
| OK | 210 |
| OR | 299 |
| PA | 496 |
| PR | 125 |
| RI | 65 |
| SC | 305 |
| SD | 38 |
| TN | 234 |
| TX | 772 |
| UT | 60 |
| VA | 231 |
| VI | 6 |
| VT | 91 |
| WA | 423 |
| WI | 310 |
| WV | 524 |
| WY | 19 |

Search measurements below use the actual restricted role, 10-mile radius, healthcare category, 20-result page and five warm SQL round trips per city on the local machine. They are not live geocoding, end-to-end HTTP/browser timings or hosted benchmarks. Count and result page are produced by one SQL statement, ordered by exact spheroidal geography distance then stable service ID; displayed distances are rounded separately.

| Search center | Matching real sites | Median SQL round trip (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: |
| Harrisburg | 6 | 1.97 | 2.61 |
| Philadelphia | 97 | 4.08 | 4.48 |
| San Francisco | 135 | 5.14 | 5.58 |
| New York | 365 | 12.02 | 15.07 |
| Boston | 116 | 4.82 | 4.92 |
| Chicago | 183 | 5.92 | 6.93 |
| Houston | 65 | 2.86 | 4.01 |
| Seattle | 80 | 3.06 | 3.69 |
| Los Angeles | 440 | 20.39 | 86.54 |
| Anchorage | 7 | 0.81 | 1.09 |
| Honolulu | 25 | 2.06 | 2.9 |
| Washington DC | 98 | 5.34 | 6.87 |

The actual San Francisco `EXPLAIN (ANALYZE, BUFFERS)` proximity query chose `service_locations_point_gix` through a bitmap index/heap scan on the 17,420-location test database (17,418 imported sites plus two isolated demo fixtures). Its recorded execution was 37.019 ms in that run. The fixed owner-executed public search function places the spatial predicate on the base indexed geography column before projecting public fields, preserving private table denial without relying on non-leakproof predicate pushdown through security-barrier views.

Deterministic real-PostgreSQL checks additionally cover cross-state Pennsylvania/New Jersey results, exact miles conversion, category and keyword filters, stable pages, empty pages with an accurate total, malformed/unbounded inputs, publication/suspension filtering, owner-role rejection, public-only provenance and confidential-source removal. Positive-longitude Alaska and antimeridian adjacency use clearly identified rolled-back synthetic fixtures; the actual downloaded Alaska subset contains no positive-longitude sites. These fixtures are not reported as real HRSA sites.

## Verification status and limitations

- **LIVE PROVIDER VERIFIED:** the two official HRSA public downloads, their actual schema, fields and usage evidence.
- **IMPLEMENTED AND LOCALLY VERIFIED:** schemas 008–010, the actual controlled 17,418-site import, idempotence, public projections, index-backed national search and source refresh safety. Ten deterministic HRSA tests and twenty physical PostgreSQL/PostGIS/import/privacy/repository tests passed. All prior PostgreSQL/API/security/retention suites also passed against fresh schema-010 databases: 57 checks, including a new source-table/browser ACL regression.
- **STAGING VERIFIED:** not established by this local import. No remote database, external identity provider or hosted service was validated here.
- **PILOT READY:** not established. Imported rows still need the operational freshness/review process and the separate authentication, hosted database/TLS, shared abuse infrastructure, headers/privacy/retention gates.

Imported healthcare coverage is a public HRSA baseline. This feed does not cover every hospital, specialist, pharmacy, community service or food provider, does not prove nonprofit tax status, and does not authorize Our Ground to speak for a provider. Empty nearby records mean this dataset has no match, not that support is unavailable.

## Food assistance: authoritative referrals, no unlicensed import

Reviewed November 5, 2026. Three public referral destinations are implemented in `shared/national-referrals.ts` and displayed separately from local resource records. They have no coordinates, distances, availability guarantees or Our Ground verification label. Links do not append a resident's query, ZIP or coordinates; the resident chooses what to enter after leaving Our Ground. Calls use explicit `tel:` actions.

| Source | Actual implemented use | Integration classification | Evidence and limit |
| --- | --- | --- | --- |
| Feeding America | Official ZIP-based network food-bank locator link | CONNECTED AND VERIFIED **public referral URL only**, not an API/data import | [Official locator](https://www.feedingamerica.org/find-your-local-foodbank) opened successfully. It directs people to member food banks and local contacts, rather than promising that every food bank distributes directly. No blanket directory-import permission was established. |
| 211 | Local contact finder and Call 211 | CONNECTED AND VERIFIED **public referral URL only**; bulk/Search feed REQUIRES PERMISSION | [Food guidance](https://211.org/get-help/food-programs-food-benefits), [local contact finder](https://211.org/about-us/your-local-211), [NDP developer portal](https://apiportal.211.org/) and [official NDP FAQ](https://register.211.org/Home/FAQs) opened successfully. Local contributors retain their data; external Search/Export access is product/geography/permission scoped. A public trial is not an unrestricted reuse grant. No account was registered and no API key or license was obtained. |
| USDA National Hunger Hotline | USAGov official food-assistance guide, English/Spanish telephone actions | CONNECTED AND VERIFIED **guide/phone evidence only**, not an API or call completion | [USAGov guide](https://www.usa.gov/emergency-food-assistance) opened successfully and lists 1-866-348-6479 / 1-877-842-6273. The [USDA hotline page](https://www.fns.usda.gov/national-hunger-hotline) is linked by USAGov but returned automated HTTP 403 during inspection. Current indexed USDA guidance and USAGov agree on 8am–8pm ET; 211's page has an older different schedule. UI intentionally omits hours. No hotline call was placed. |
| Findhelp | Research only; no integrated directory or scraping | REQUIRES PERMISSION | [Official integrations](https://company.findhelp.com/products/customer-integrations/) and [CBO terms](https://company.findhelp.com/cbo-terms/) describe contractual APIs and restrictions on persistent/cached data. No contract or configured API access is supplied. A durable importer cannot be enabled from a credential alone. Direct automated access to some public pages returned 403. |
| USDA SNAP retailers | No pantry import | UNSUITABLE for the free-food service category | [USDA retailer data](https://www.fna.usda.gov/snap/retailer/data) and [official USDA Economic Research Service description](https://ers.usda.gov/topics/food-nutrition-assistance/food-assistance-data-collaborative-research-programs/national-data-sets) describe authorized benefit retailers, not free pantries or meal programs. A separate benefits-shopping feature would need its own product/source review. |
| Regional Open Referral/HSDS feed | Typed adapter extension point only | PLANNED | [HSDS documentation](https://openreferral.readthedocs.io/en/latest/) describes a structure and interoperability standard, not permission to copy a particular organization's dataset. No selected licensed regional feed is supplied. |

`backend/food-source-adapters.ts` provides explicit source identity, status, documentation/terms, permitted-use notes, permission evidence, categories and reasons for unavailability. Future adapter records retain organization/service/location/contact/eligibility/source IDs and dates, missing values and suppressed-address state, and start unpublished/needs-review. No active food adapters are registered. `requireFoodSourceAdapter` fails closed for every manifest and unknown source; environment flags or supplied credentials cannot silently activate a feed. No food scraping, import, payment, paid subscription or new external account was performed.

Five deterministic tests in `tests/national-referrals.test.mjs` passed locally on Node 24.22.1: coverage wording, official immutable metadata/no invented local evidence, supported safe contacts, unavailable adapter gates, and zero network requests for unavailable adapters. This proves the local referral/adapter behavior; it does not establish that a referral will have assistance available for an individual resident.
