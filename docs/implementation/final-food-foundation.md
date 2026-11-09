# Final refinement — authorized food data foundation

Verified locally on 2026-11-06. This is a regional food-data foundation, not a claim of comprehensive nationwide food coverage. No production or staging database, environment, deployment, account, paid service or Geoapify setting was changed.

## Sources and permitted reuse

| Source | Official catalog and authority | Import and credit |
| --- | --- | --- |
| Philadelphia Free Food and Meal Sites | [Official OpenDataPhilly catalog](https://opendataphilly.org/datasets/free-food-and-meal-sites/), [City terms](https://metadata.phila.gov/#help/help-faqs/what-are-the-terms-of-use/), [official ArcGIS item license](https://www.arcgis.com/sharing/rest/content/items/5825a32bb8844bb097f7a16d4fbf4f23?f=json) | City of Philadelphia License, a custom government open-data license; **not CC0**. Credit: City of Philadelphia, Office of Children and Families. Dataset and license URLs remain in public provenance. |
| Emergency Food and Meals Seattle and King County | [Official Seattle catalog](https://data.seattle.gov/Community/Emergency-Food-and-Meals-Seattle-and-King-County/kkzf-ntnu), [official metadata with `licenseId=PUBLIC_DOMAIN`](https://data.seattle.gov/api/views/kkzf-ntnu.json) | Public Domain. Credit: City of Seattle Human Services Department. Official source metadata, license name and credit remain in public provenance. |

These are complete bounded snapshots of the two reviewed regional feeds, not hand-picked organization-name lists. Philadelphia uses official ArcGIS `objectid`; Seattle uses the official export's source row UUID `:id`. Source identity and deterministic application IDs include the source namespace. Records from unrelated sources are not joined by fuzzy name. Source row IDs are provider maintained: an upstream dataset replacement that changes IDs requires owner comparison/review rather than assuming that a new ID proves a new institution.

Philadelphia data-last-edit timestamp: **2026-11-05T16:54:29.474Z**. Seattle dataset refresh timestamp: **2026-09-26T00:53:05Z**; per-record `date_updated`, when valid, is retained separately. Import time does not mean the individual site was contacted or verified. Every imported service remains `imported_unverified`.

## Actual local import and coordinate-quality repair

The original `ourground_7d1` database was read only. A `pg_dump`/`pg_restore` clone named `ourground_final` was created on existing loopback PostgreSQL port 18790. Only this clone received new migration 014 and food imports. No original service was stopped to create it.

The first import retained 578 records. Actual browser review then exposed a source error: a YMCA record addressed to Auburn carried downtown Seattle coordinates. A source/license being official did not establish coordinate accuracy. A read-only audit of all local source records found copied points and conflicting same-address coordinates inside the Philadelphia feed too. The **final public count is 533**, superseding the first-import coverage count.

| Source | Snapshot rows | Final public services | Final exclusions |
| --- | ---: | ---: | --- |
| Philadelphia | 404 | **324** | 6 inactive, 26 benefits-only, 2 benign duplicate identities, 45 coordinate-conflict source rows, 1 unresolved postal-city scope |
| Seattle/King County | 269 | **209** | 40 closed/unknown, 13 lacking usable public address, 4 privacy-sensitive, 3 coordinate conflicts |
| Total | 673 | **533** | 140 excluded source rows |

The 49 source-quality anomalies include 4 duplicate IDs that were never published. **45 previously visible source-bound locations are now inactive and hidden**: 42 Philadelphia and 3 Seattle. Their original source snapshots remain available privately for review. This is separate from the 17 Seattle privacy holds; a bad coordinate is not falsely classified as a privacy withdrawal.

The source-specific `regional-food-coordinate-anomalies-v2` policy:

1. Requires completed active Census reference data for the source state and at least one exact source-city match before publication. Missing/empty reference evidence blocks apply; there is no skip flag.
2. Quarantines a source point more than 20 miles from its exact unique Census city/state representative. This generous threshold catches the two measured Seattle anomalies (about 21.6 and 20.2 miles), while retaining plausible postal fringes around 10.4 miles. It is an anomaly check, not a city boundary or street-address validation. No centroid replaces a source point.
3. Quarantines all members of an exact-point group with conflicting normalized street/ZIP evidence, and all members of the same normalized street/ZIP group spread over one mile. It never chooses a preferred coordinate winner or merges organization identities.
4. Preserves punctuation/street-abbreviation variants and explicit equivalent intersection addresses, including the Love Park intersection. It retains all valid pre-dedup coordinate evidence, so contradictory duplicates cannot evade the checks or be silently selected by row order. Benign duplicate IDs remain excluded after repeated validation.
5. Leaves the Philadelphia 19004 row unpublished because this feed has no city column and the parser cannot establish Philadelphia for that postal scope. It does not invent a replacement city or claim the coordinate itself is disproven.
6. Leaves four Seattle records in Tillicum (2), East Sumner (1) and Preston (1) unverified where exact Census place evidence is absent. It does not fuzzy-select a neighboring city. The remaining source-supported records are also unverified; these heuristics do not prove every address is accurate.

For source-bound anomalies, the owner transaction locks the source and location rows, marks the exact source record inactive/needs-review, and hides its whole location. If independently maintained location address/coordinates no longer match the retained source snapshot, the source is marked stale/needs-review while the corrected public location remains visible. Human title-only edits do not excuse wrong unchanged geometry. A later accepted source snapshot cannot automatically republish a quarantined location; owner review is required. Existing privacy withdrawals remain unconditional.

The policy version, raw snapshot hash and exact local Census evidence fingerprint enter the new import checksum. Both final quality runs were applied twice. Their second executions reused the exact completed run and added no records, source versions or quarantines. Exclusion handling also runs on identical-checksum replay, so neither privacy nor geography checks are bypassed by idempotence. Final run IDs: `c076c508-da71-4a48-93dc-92b54d1ba889` (Philadelphia) and `fa9b560c-9d41-47ba-b42d-787765eebb09` (Seattle).

Philadelphia records cover one source city. Seattle records cover **45 distinct source city strings**, with smaller communities including Carnation 3, Duvall 1, Enumclaw 1, Fall City 1, North Bend 2 and Vashon 3. These counts do not establish statewide or comprehensive rural coverage.

| Public fields | Philadelphia | Seattle/King County |
| --- | ---: | ---: |
| Services | 324 | 209 |
| Safe supplied phone | 227 | 198 |
| Safe supplied website | 306 | 207 |
| Source eligibility text | 26 | 209 |
| Services with valid structured opening-time pairs | 275 | 0 |
| Preserved raw schedule text | 0 | 202 |

Philadelphia has **468 public source opening-time rows**; recurrence exception notes remain attached. Seattle schedules remain source text with a confirmation reminder, without invented start/end times. Missing fields remain absent. Food-bank classification does not prove direct public pickup. SNAP retailers and benefits-only offices are not classified as free-food sites.

## Coverage and geographic checks

The actual state/category report is [final-food-coverage.json](./final-food-coverage.json). Existing public HRSA healthcare services remain 17418 across all 50 states, DC and the source's supported territories. New food records cover portions of **PA and WA only**. Food coverage is incomplete in both states. The other 49 state/DC regions have no imported food records in this local database and retain clearly labeled nationwide referral pathways; a referral is not a local resource record.

Direct PostgreSQL/PostGIS food search checks returned:

| Center | 5 miles | 10 miles | 25 miles | 50 miles |
| --- | ---: | ---: | ---: | ---: |
| Philadelphia | 219 | 315 | 324 | 324 |
| Seattle | 53 | 106 | 189 | 208 |
| Pacific WA | 16 | 33 | 143 | 208 |
| Harrisburg | 0 | 0 | 0 | 0 |
| New York | 0 | 0 | 0 | 0 |
| Rural Pennsylvania test point | 0 | 0 | 0 | 0 |

These are database totals, not the UI page size. Existing pagination and public page-size bounds remain in place. Zero imported food records does not mean no local food assistance exists.

## Import and security controls

- `scripts/import-food.mjs` defaults to dry-run. Only two fixed reviewed source IDs and fixed HTTPS download endpoints are accepted. No arbitrary URL, public ingestion endpoint, crawler, automatic schedule or paid account was added.
- Downloads reject redirects, have 20-second deadlines, 8 MiB response bounds and bounded pagination. Normalization rejects snapshots over 16 MiB or 5000 rows and rejects incomplete exports/schema/license changes. There are no automatic provider retries.
- Apply requires an explicit `FOOD_IMPORT_DATABASE_URL`, `--apply` and `--local-test-target`. The CLI is currently restricted to owner role `ourground_test` on `127.0.0.1:18790/ourground_final` and rejects production/Vercel execution. A future hosted import needs a separate exact-target approval and reviewed extension of that guard.
- Migration014 adds source-license metadata, an owner-only batch function, an owner-only food withdrawal function and public provenance fields. No browser/runtime grant permits raw source-table access, import, withdrawal, privacy release or membership mutation. New privileged functions use fixed `pg_catalog`-first search paths; queries bind values.
- Import refreshes preserve separately edited service/location/organization versions, `updated_by`, pending review, active organization membership and listing associations. Conflicting refreshes enter review rather than overwriting reviewed fields or claimed identities.
- Source snapshots and versions retain the original reviewed source fields for public, accepted records. Excluded private/address-missing rows retain **only source ID, source record ID and reason** in persistent privacy holds; no excluded raw address or coordinates are imported.
- Seattle's 17 excluded sensitive/address-missing source identities have durable holds. Existing whole-location privacy triggers prevent public search/detail/location/hours leaks. Withdrawal minimizes all retained source snapshots; reappearing records remain suppressed. A completed-checksum replay still backfills newly classified privacy withdrawals, so idempotence cannot bypass a later privacy decision.
- No automated food privacy-release operation is provided. The earlier HRSA release procedure requires HRSA-specific evidence and must not be used for food. Any future food release procedure requires separate owner review and fresh exact identity/location evidence. The current outcome stays safely hidden.
- Older dataset timestamps are rejected. A source record absent from an explicitly complete snapshot becomes stale/needs-review, not silently deleted. Nothing clears human review or privacy holds automatically.

Owner commands (these local roles/URLs contain no secret):

```sh
FOOD_IMPORT_DATABASE_URL=postgres://ourground_test@127.0.0.1:18790/ourground_final \
  node scripts/import-food.mjs --source philly-food-sites \
  --file /private/tmp/our-ground-food/philly-reviewed.json \
  --validate-geography --local-test-target

FOOD_IMPORT_DATABASE_URL=postgres://ourground_test@127.0.0.1:18790/ourground_final \
  node scripts/import-food.mjs --source philly-food-sites \
  --file /private/tmp/our-ground-food/philly-reviewed.json \
  --apply --local-test-target --full-snapshot

FOOD_TEST_DATABASE_URL=postgres://ourground_test@127.0.0.1:18790/ourground_final \
  node --experimental-strip-types --test tests/food-database.integration.mjs
```

Use Node 24.22.1 with the project's documented memory-aware environment. Reviewed raw snapshots and the preservation dump remain under `/private/tmp/our-ground-food/`; no raw feed or database dump was committed. Local preview runtime uses the restricted `our_ground_api` role against `ourground_final`, with existing local TLS exception and all application safeguards retained.

## Unavailable and isolated sources

- **FoodFinder:** public referral only. Written feed/API retrieval, storage and redisplay authorization is not established. No scraping occurred.
- **211 National Data Platform:** contributor/product/geography permissions and authorized credentials are absent. The manifest links official API and access documentation. No unapproved API use occurred.
- **Feeding America / Findhelp:** referrals remain available; no licensed export scope was supplied, and no directory was scraped or copied.
- **USDA SNAP retailers:** semantically unsuitable for free-food assistance, so not imported as pantries or meal services.
- **OpenStreetMap:** a bounded owner-supplied extract parser is implemented and tested for `amenity=social_facility` with `social_facility=food_bank` or `soup_kitchen`, and `amenity=food_sharing`. Private/disused/confidential records are excluded. Output remains in a separate `osm_odbl` partition with `publication_status=unpublished`, ODbL authority and required source credit. No Overpass query, OSM download, application-DB import or uncertain combined-database publication occurred. [Official OSM copyright](https://www.openstreetmap.org/copyright) and [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) obligations must be resolved before public integration. OSM tags alone do not confirm current public access or availability.
- Evaluated catalog results for NYC were aggregate reports rather than location data. The bounded Chicago/SF pantry catalog searches did not identify a qualified feed. An unlicensed old Detroit copy was not imported. These checks are not a claim that no other authorized government source exists.

## Validation evidence

[final-food-data-verification.json](./final-food-data-verification.json) contains ordered-row SHA256 preservation fingerprints, actual coverage/field counts, search-radius results, source-file hashes and a request ledger. All 8 HRSA preservation comparisons match the original database: 17418 services, 17418 locations, 1584 organizations, 17418 source records, 17418 source versions, 1 import run, 17 existing privacy holds and17 existing privacy events. Migrations 001–013 source files were untouched. Migration014's final local SHA256 is `d3e3b8ca9483b1912bc732e40613fa55bc8b28648e69087acd320be7157a4f7c`.

Focused checks completed:

- 22 deterministic food/parser tests and 6 referral/adapter tests passed.
- 1 real local database integration passed with owner writes inside rollback transactions and actual runtime-role permission denials. It tests human-edited fields, active membership protection, privacy withdrawal/replay, source-history minimization, coordinate-source quarantine/replay, later accepted snapshots remaining hidden, independently corrected human locations staying public in nearby/detail/hours, public hiding and old-snapshot rejection. No synthetic fixture remained committed.
- Backend typecheck passed. The parent final-refinement report records the whole application test/build/browser results.
- `inspectDatabase` reports 0 security/schema problems after the final migration and imports.

Acquisition used **13 explicit public catalog/metadata/download HTTP requests**: OpenDataPhilly 1, Socrata catalog 3, Philadelphia ArcGIS service 2, ArcGIS item 1, Philadelphia metadata 1, Seattle 4 and Philadelphia open-data-policy 1. One SODA query returned 400 for an unsupported select syntax; a single official export request supplied stable source IDs. There were no automatic retries, **0 Geoapify requests** and **0 map requests** from this food-import work. Separate primary-source web research was used to review licenses. Codex's testing allowance and Geoapify account quotas were not involved in these public government downloads.
