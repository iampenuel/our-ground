# Phase 7D.1 authoritative geographic reference

Implemented and locally verified on November 5, 2026. This layer supplements Geoapify; it does not replace the provider, PostGIS resource discovery, or existing organization authorization. No production or hosted changes were made.

## Official source and actual import

Source: U.S. Census Bureau, **2026 Gazetteer Files**, national Places and States files, accessed November 5, 2026. The [official 2026 catalog](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html) describes geographic identifiers, names and representative latitude/longitude. Its scope is the 50 states, DC and Puerto Rico; American Samoa, Guam, the Northern Mariana Islands and the U.S. Virgin Islands are excluded. This is neither a street-address directory nor a USPS delivery-ZIP reference. No ZCTA data was imported.

Public download and reuse authority: Census's [Open Data policy](https://www.census.gov/topics/research/research-transparency-public-access/open-data.html) supports public-data reuse, including commercial applications. Its [citation guidance](https://www.census.gov/about/policies/citation.html) requires clear source attribution and separates original Census data from the user's conclusions. Our Ground retains the source, vintage, identifiers and import date and does not imply Census endorsement. No restricted-use microdata, Census media assets, API key or paid service was used.

| Official archive | Bytes downloaded | Records | SHA-256 |
| --- | ---: | ---: | --- |
| [National Places 2026](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip) |1,214,650|32,363|`af678e2d990827c89ee39b98c82de6e90b693c7361ff0e559ae3076670dd2863`|
| [National States 2026](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_state_national.zip) |2,865|52|`54352ca34f869b4deca03a65da72cccb8e9f0c2702340061949b63c76c63f852`|

Exactly two bounded official file-download requests were made; no Geoapify calls were needed by this work. Downloaded archives remain outside the repository at `/private/tmp/our-ground-7d1-geography/`.

The [official record layout](https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts.html) defines the fields retained: USPS jurisdiction, GEOID, fully qualified GEOID, place ANSI code, canonical NAME, LSAD, functional status and internal-point coordinates. All identifiers remain strings with leading zeros. Each canonical ID includes publisher, vintage, geography kind and GEOID, e.g.`census:2026:place:0667000`; state and city identifiers cannot collide.

The actual import contains **32,363 places**, **52 state-level records**, **64,817 indexed names**, and **two completed versioned imports**. Incorporated places and Census-designated unincorporated communities are both retained. Functional-status source flags are preserved; dataset membership does not imply a local government or service is currently operating.

The [Census LSAD definitions](https://www.census.gov/library/reference/code-lists/legal-status-codes.html) support deterministic display-name derivation by removing the matching published legal/statistical suffix, such as city, town, village, CDP, municipality, comunidad or zona urbana. Canonical NAME is preserved intact. State postal abbreviations become exact state aliases. Unknown/complex designations retain their published name. No manually maintained misspelling dictionary, nickname mapping or unsupported historical alias was added. For example, the source says **Urban Honolulu CDP**; the short display name is **Urban Honolulu**, not an invented Honolulu alias.

GNIS was considered through the [official USGS entry point](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data); automated access returned a JavaScript verification page. No protection was bypassed and no GNIS data was imported. Census provides the required generalized baseline without importing unrelated geographic features. Additional official aliases and island-area reference coverage remain unimplemented; the primary provider may still return supported locations there.

## Important representative-point limitation

The official San Francisco city row has GEOID`0667000`, fully qualified ID`1600000US0667000`, and internal point **37.727239,-123.032229**. That point is offshore and is not a suitable assumed downtown service center. The source values are preserved exactly. A representative geographic point is neither a rooftop location nor evidence of a street address or nearby service.

The integration must distinguish reference identity from provider coordinates. An explicitly selected corrected canonical city can be resolved through a bounded exact Geoapify city/state match when available. That provider point must retain provider provenance and precision. If a reference point is used directly, label it as representative and preserve legitimate empty nearby-resource results as a coverage/radius outcome. Never silently replace it with an invented downtown point. Strong exact Honolulu provider results also remain preferable to unrelated or weaker local fuzzy alternatives.

## Versioned import and preservation

Migration `011_geographic_reference.sql` follows the inspected 001–010 journal and introduces three private reference tables, normalization, an owner-only import operation and a fixed public candidate operation. It installs standard PostgreSQL `pg_trgm`, `unaccent` and `fuzzystrmatch` in the existing extension schema; an incompatible preexisting extension schema fails for owner review. Its frozen source/journal hash is `a96f8a9ea03a4f18460d9fc749cf4c4d467b5c16e52dd39f34a7b872a04d9b6a`.

The new database `ourground_7d1` was created through a consistent read-only dump of `ourground_7d`; no source database connections were terminated. Migration 011 and the initial full import were committed only after atomic acceptance validation succeeded. The existing owner-preview database was not migrated. Separate new security fixture clones hold 011/012 without changing earlier fixtures.

Imports default to dry-run with no database connection. The archive reader accepts one exact expected member, checks ZIP directory bounds, compression method, CRC and declared/actual decompressed size, and limits both archive and output to 8 MiB. Parsing checks required columns, bounded rows, unique geographic IDs, supported source identity/vintage, jurisdiction/FIPS consistency, strings and finite coordinates. Full imports require both national datasets and complete 52-jurisdiction coverage; partial replacement cannot silently occur. A partial option exists only in the internal test helper and is not exposed by the owner CLI.

Each import is one transaction with a shared advisory lock and 250-record batches. A failed batch rolls back all earlier records and run metadata. Repeated checksums preserve identities and do not create duplicate records/runs. Same-vintage refreshes replace superseded names for the exact geographic ID and mark missing reference records inactive; they do not modify resident searches or HRSA resources. Cross-vintage refresh requires an explicit source/version review rather than assuming geographic IDs are unchanged between releases.

A read-only preservation comparison computed stable SHA-256 row fingerprints for all HRSA-bound services, locations, organizations, source records, source versions, import runs, privacy holds and privacy events. Original and clone fingerprints matched: **17,418 sites, 1,584 organizations, 17,418 versions, one HRSA run, 17 holds and 17 events**. All historical 001–010 source/journal hashes matched. Original`ourground_7d` still has no geographic-reference tables. Evidence:`/private/tmp/our-ground-7d1-geography/final-reference-inspection.json`.

## Candidate contract and policy

`backend/geographic-reference.ts` exports`GeographicReference`, `GeographicCandidate` and `createPostgresGeographicReference(env)`. The method is:

```ts
findCandidates(query: string, state?: USResourceStateCode, limit?: number, signal?: AbortSignal)
```

The integration supplies the parsed locality and optional explicit state, e.g.`findCandidates('Boson','MA')`. It does not send an unresolved whole street address into the place-name matcher. Each result contains canonical/display names, kind, jurisdiction, exact geographic ID/provenance, representative coordinates and separate local match metadata. `local_similarity` is a computed trigram score, never Geoapify confidence. `edit_distance`, normalized exact-match evidence and the number of bounded credible alternatives are explicit.

Normalization folds case, whitespace, punctuation, apostrophes and accents while preserving the displayed official Unicode name. Exact matching uses an indexed equality path first. Two-character inputs only permit exact official postal-state aliases; three-character names may match exactly but are not fuzzily corrected. Fuzzy matching starts at four characters. Numeric inputs return no local place correction, so ZIP and street-address handling remain with the primary provider.

When no exact local name exists, a GiST nearest-name query inspects at most 128 names, then bounded Levenshtein filtering accepts edit distance at most 1 for lengths 4–7, 2 for 8–12, or 3 for longer input, with trigram similarity at least0.35. Candidates are deduplicated by canonical ID and ordered deterministically by edit distance, similarity and ID. No population or popularity data determines identity. At most five choices are returned. `ambiguous_matches` describes credible records inside this bounded search; it is not a guarantee that every same-name location is displayed.

An explicit state restricts candidates to places in that jurisdiction. Unqualified **New York** retains separate state and city alternatives. **Springfield** remains multiple choices; IL, MO and MA each resolve only within the specified state. A local fuzzy suggestion always requires selection, and the parent provider-quality policy must preserve strong exact Geoapify evidence rather than overriding it with a weak local score.

## Access and execution limits

All three reference tables have RLS enabled and raw access revoked from API/browser roles. The runtime role has only the fixed bounded candidate function; import/normalization helpers remain owner-only. Browser Supabase roles cannot execute it even if schema exposure changes. No arbitrary URL-fetch endpoint, crawler, dynamic SQL or durable resident-query history was added.

The adapter verifies actual`current_user=our_ground_api`, uses the established verified-TLS configuration remotely, and permits disabled TLS only for nonproduction loopback. A dedicated serialized single-connection pool avoids transaction/session identity bleed. Each call has a 750 ms transaction-local statement deadline and supports cancellation; a queued aborted request does not open a connection. Errors expose no credentials or raw database details. Existing API abuse controls remain the integration's responsibility.

## Owner commands

Use Node 24.22.1 and the established memory limit. No paid service or external account is needed for these public files.

```sh
# Exactly two fixed official downloads, no retries; dry-run only.
NODE_OPTIONS=--max-old-space-size=192 node scripts/import-gazetteer.mjs --download

# Review the already downloaded files with no database connection.
node scripts/import-gazetteer.mjs \
  --states /path/2026_Gaz_state_national.zip \
  --places /path/2026_Gaz_place_national.zip

# Apply only to the explicitly approved NEW disposable local target.
GEOGRAPHIC_IMPORT_DATABASE_URL=postgres://<owner>@127.0.0.1:<port>/ourground_7d1 \
NODE_OPTIONS=--max-old-space-size=192 node scripts/import-gazetteer.mjs \
  --states /path/2026_Gaz_state_national.zip \
  --places /path/2026_Gaz_place_national.zip --local-test-target --apply
```

The local guard rejects older`ourground_7d`targets and the runtime role. Hosted development application requires the existing explicit Supabase development-project guard and verified TLS, plus the owner's separate target authorization. The CLI rejects production/Vercel runtimes. No remote import or migration was performed.

## Actual validation and performance

Eight new deterministic tests and fourteen physical PostgreSQL tests passed. They cover real-source generalized misspellings, exact nationwide names, state/city distinction, ambiguous Springfield, jurisdiction constraints, Unicode, short/ZIP/street boundaries, source/ZIP validation, private-table and browser denial, owner credential rejection, cancellation, index plans, versioned refresh/idempotence and failed-batch rollback. Synthetic import fixtures are explicitly labeled and rolled back; they are not published or counted as real Census records.

All 57 prior PostgreSQL/API/security/retention checks also passed at 011/012 in new fixture databases. The reference layer made zero Geoapify requests. Its matching tests are local source-backed behavior, not evidence that Geoapify itself corrected the typos or that staging authentication passed.

[Machine-readable timing/index evidence](phase-7d1-geographic-reference-performance.json) records five warm adapter calls per query on the local PostgreSQL 18 machine, including role check and deadline setup. These measurements are neither typing-to-suggestion browser timing nor hosted/Geoapify network latency. Both global and state-filtered nearest-name plans used `geographic_reference_names_trgm_idx`; indexed equality queries used a planner-selected legitimate equality-capable index.

| Query | Explicit state | Median local adapter(ms) | Maximum(ms) |
| --- | --- | ---: | ---: |
| San Fransisco | CA | 17.98 | 20.57 |
| Philidelphia | PA | 29.47 | 36.06 |
| Chcago | IL | 28.73 | 60.06 |
| Pensylvania | None | 15.02 | 22.02 |
| Los Angles | CA | 28.49 | 33.11 |
| Boson | MA | 16.56 | 20.46 |
| Boston | MA | 2.00 | 4.85 |
| Springfield | None | 4.10 | 6.05 |
| Springfield | IL | 1.45 | 2.17 |
| New York | None | 1.50 | 4.04 |
| Penuelas | PR | 3.63 | 8.07 |
| PA | None | 6.60 | 7.46 |

This establishes **IMPLEMENTED AND LOCALLY VERIFIED** authoritative-reference matching and **LIVE OFFICIAL SOURCE DOWNLOAD VERIFIED**. It does not establish a hosted migration, real Google/Supabase login, deployed headers, complete geographic coverage, a provider service-level guarantee, or pilot readiness. The parent phase reports track complete browser behavior and owner-controlled staging gates separately.
