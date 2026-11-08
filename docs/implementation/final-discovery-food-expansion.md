# Final discovery — authorized Maryland food expansion

Local verification completed November 6, 2026. Final public food coverage is **593 programs**: Philadelphia 324, Seattle/King County 209 and **60 new Prince George’s County, Maryland programs**. The existing 533 and 17418 HRSA services were preserved. This is a real regional expansion, not comprehensive nationwide food coverage.

## Source research and permissions

The implemented source is [Prince George’s County Food Assistance Directory](https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv), supplied by the county Community Services Division, Office of Food Security. Its official [metadata](https://data.princegeorgescountymd.gov/api/views/d7ae-zbbv.json) describes current pantry, recurring distribution and other food-assistance programs; source data-last-update is **2026-11-06T14:33:27Z**. The documented Socrata export is retrieved as one bounded snapshot. It contains point coordinates, explicit city/state/ZIP, source types, weekday/schedule fields, access/registration conditions, eligibility and website links.

[OpenPGC terms](https://data.princegeorgescountymd.gov/terms-of-use) permit use/download/display/distribution subject to a required disclaimer on applications' sites, no county endorsement and the county's right to terminate reuse. These are **custom terms, not CC0**. The required verbatim notice, attribution, modifications and official terms/source links are served locally at `/data-notices/openpgc.html`; source disclosures link to that fixed path. The terms do not specify a per-card notice or particular prominence. No affiliation/endorsement is claimed.

If the county requires termination, the owner must stop further ingestion **and withdraw already public source records** using a reviewed, exact-source owner transaction. Setting `resource_data_sources.enabled=false` alone only blocks ingestion; it does not remove published listings. Review the exact source set, preserve human-owned data and privacy history, set the affected source records inactive, hide still-source-bound locations, verify public search/detail absence, and record the action. No automatic destructive job was added.

Other official candidates were investigated:

| Candidate | Actual finding and disposition |
| --- | --- |
| [NYC GetFood](https://www.nyc.gov/GetFood) | Official page exposes a downloadable active-program PDF, but no supplied coordinates were established from that download path. General NYC terms reserve rights and refer permission questions to the owning agency. No interactive locator scraping, bulk geocoding or unverified PDF import occurred. |
| [California CDSS food banks](https://www.cdss.ca.gov/food-banks) | Organization/service-area directory supports a regional hub referral use case. A warehouse/admin address is not evidence of walk-in pantry service. Not imported as direct food pickup. |
| Boston/Cambridge official open-data catalogs | Reviewed food results were restaurant/food-establishment permits, not charitable food-program locations; excluded from assistance coverage. |
| Missouri Food Pantry List | Official location metadata exists, but last source update was2020 and explicit reuse metadata was absent. Not used to inflate current coverage. |
| Delaware agency partners | Official source exists but contains program/annual distribution fields with insufficient current public-access/freshness evidence for this phase. Not imported. |
| WPRDC/Allegheny | Results included restaurant facilities, gardens and aggregated service requests; not a qualified current pantry feed. |
| 211, FoodFinder, Feeding America, Findhelp | Existing explicit permission-dependent adapters/manifests remain blocked; owner needs written product/geography/retrieval/storage/redisplay scope, update/withdrawal terms and approved access. No partnership was invented and no protected directory was scraped. |
| OpenStreetMap | Existing bounded exact-tag parser and separate unpublished `osm_odbl` partition remain implemented. No Overpass/bulk extract request or uncertain combined-database publication occurred. ODbL attribution/share-alike review remains necessary before publication. |

## Actual imported data

167 source rows represent weekday schedules, not 167 unique programs. Exact operator/host/address/city/state/ZIP/source-type groups produced 72 programs. 95 repeated schedule rows were coalesced without inventing weekly opening-time pairs. The import retained original source UUIDs and every source-supported schedule/eligibility/access note.

- **60 public programs**, retaining149 original source schedule UUIDs.
- 9 market/farmers-market groups excluded: benefits-shopping support is not a free pantry.
- 2 food-bank/food-hub administrative groups excluded: no walk-in service claim.
- 1 group excluded for invalid supplied coordinates.
- No new accepted program failed the existing coordinate-conflict checks.
- 8 programs lack an exact Census city-name match; their source coordinates stay unverified. No neighboring city or representative centroid was substituted.

Pantry and meal programs at the same address remain distinct. Food distributions, produce distributions and senior distributions retain their supported classifications and eligibility. Fees/free status are not invented: the dataset's cost field is absent, so `cost_summary` is null. Source notes about suggested donations or registration remain source text.

| New public fields | Count |
| --- | ---: |
| Programs | 60 |
| Source city strings | 19 |
| Website supplied and safely usable | 46 |
| Structured public phone field | 0 |
| Explicit eligibility text | 21 |
| Preserved raw source schedule | 60 |
| Confirmed cost/free claim | 0 |

Missing phone fields remain null; supported contact details present only in source notes are not fabricated into structured contacts. Every imported record remains `imported_unverified`. Source refresh time does not mean the institution was contacted.

## Reusable ingestion, lineage and privacy

The existing pipeline was extended rather than replaced. Source acquisition stays allowlisted and bounded: 20-second deadlines, no redirects, 8 MiB response bounds, 16 MiB snapshots, 5000-row limits, 500-record SQL batch maximum and no automatic retries. CLI apply requires the existing explicit local-test gate and owner-role identity. The new Maryland source is authorized only for `ourground_discovery_final`; an attempted apply to preserved `ourground_final` was rejected before a database connection. Existing previous safe targets remain explicitly bounded for their earlier sources; no remote/hosted target was added.

Migration 015 registers the new source and extends existing owner-only food import/withdrawal functions with its exact ID format and MD state evidence. Migration 016 adds the private `food_source_row_lineage` registry, RLS, denied browser/runtime access and a sticky privacy/review guard. Existing migrations 001–014 were not changed; 015 was preserved after application when 016 was added.

Grouped program IDs derive from exact program identity, while **original Socrata row UUIDs remain the durable lineage** across address, name or type changes.149 UUID bindings point to the 60 real programs. The lineage registry contains IDs, run references, timestamps and privacy/review flags; no street addresses, points or raw private notes.

Before both a new batch and identical-checksum replay, exact upstream UUID reconciliation:

1. Detects an ordinary identity rekey/move and sends old/new groups for review instead of leaving stale-visible duplicates. Still-source-bound old locations are inactive/hidden. Independently corrected human locations remain visible with source review status; imported data does not overwrite their fields.
2. Withdraws every prior/current derived ID when an upstream UUID becomes confidential/address-missing or has a persistent privacy hold. All retained source history is minimized. Renamed, moved or type-changed reappearances stay unpublished until explicitly reviewed; replaying an earlier public checksum cannot bypass the hold.
3. Preserves UUID lineage for benign duplicate exclusions without publishing duplicates. A private duplicate alias therefore suppresses the previously public canonical program.
4. Propagates a privacy decision across split weekday groups for the same previously published program, so a remaining public-looking weekday cannot expose the old site. Registry privacy flags do not automatically clear.

The existing geographic policy remains: exact unique Census city/state sanity checks with a generous 20-mile regional anomaly threshold; all members of exact-point/conflicting-address groups and same-address points over one mile apart are quarantined. Census representatives are not street geocodes. Pre-dedup evidence, corrected human geometry and whole-location privacy controls are retained.

## Local target, preservation and idempotence

`ourground_discovery_final` was cloned from `ourground_final` with `pg_dump`/`pg_restore` on existing loopback PostgreSQL 18790. Neither source database was mutated. Runtime remains restricted role `our_ground_api`; migration/import role is owner `ourground_test`. No hosted resource, environment variable file, credential, production/staging data or deployment changed.

Nine ordered-row SHA256 comparisons match the original clone exactly: 17996 existing services, 17996 locations, 2162 organizations, 17996 source records, 17996 versions, 5 prior import runs, 34 privacy holds, 34 privacy events and 525 retained opening-time rows. This includes all 17418 HRSA records and the previous 533 public food programs, including their existing quarantines.

Maryland import run `7686b4c6-cbf8-4aef-b5fe-d0dabb3325c0` was applied and replayed repeatedly, including after lineage hardening. Replays reuse the same completed run, add no services/versions/runs/quarantines and reconcile privacy/rekey exclusions. A replay's historical `created:60` describes the original run; `already_imported:true` means 60 new rows were not created again.

## Actual geography checks

Restricted runtime-role PostGIS searches used 5/10/25/50-mile radii. No mapped leads were requested; those checks are **NOT RUN**, not zero-provider-result claims. Existing mapped supplements/referrals remain available through their independent application paths.

| Center | 5mi | 10mi | 25mi | 50mi |
| --- | ---: | ---: | ---: | ---: |
| Hyattsville MD |24 |44 | 60 | 60 |
| Laurel MD |7 |16 |58 | 60 |
| Brandywine MD |2 |6 |53 | 60 |
| Accokeek MD | 0 |3 |50 | 60 |
| Carnation WA |3 |9 |164 |208 |

The JSON evidence also includes Harrisburg, Indiana PA, Philadelphia, Brooklyn, San Francisco, Chicago, Houston and Seattle at all four radii. At 5 miles, Philadelphia returns 219 and Seattle 53; Harrisburg, Indiana PA, Brooklyn, San Francisco, Chicago and Houston return 0 imported food programs. Those uncovered regions retain labeled national referrals; no absence-of-assistance claim is made.

Useful new public examples for browser verification:

- LARS, Laurel: `ae1585ec-7d2f-59ee-b049-3fabc2c1c745`; four supported weekday schedule rows.
- City of Greenbelt Food Pantry: `5025c018-0915-5d86-85aa-16b14ca01aa7`.
- Community Support Systems BADEN, Brandywine: `7d9cb091-6cd2-5c70-bb8f-6f4e52fa4a38`.

## Validation and evidence

- 35 focused deterministic food/referral tests passed.
- 2 real local database integration tests passed, entirely rolled back. Coverage includes runtime import/raw-table denial, reviewed fields, geography quarantine, corrected locations, confidential/missing-address changes, rekeyed reappearance, original-checksum replay, duplicate UUID aliases and split weekday privacy propagation. No synthetic fixture was committed.
- Backend typecheck passed. Schema/role inspection reports 0 problems. All migration journal checksums match their final source files.
- The parent report records the full unit/build/security/Redis/browser checks. Hosted launch requirements are separate.

Machine evidence: [final-discovery-food-verification.json](./final-discovery-food-verification.json). Acquisition ledger: [final-discovery-food-request-ledger.jsonl](./final-discovery-food-request-ledger.jsonl). Raw reviewed snapshots and the preservation dump remain in `/private/tmp/our-ground-food-expansion/`; they were not committed.

This work made **14 explicit public catalog/metadata/terms/download acquisitions**, including one actual Maryland snapshot download, with no automatic retries. Separate primary-source web search was used for research. There were **0 Geoapify/geocoding requests and 0 map requests** from this work. The acquisition ledger counts explicit fetch calls; redirects on initial catalog pages were not separately instrumented. It is not an account-credit or application rate-limit count.

Food coverage is still limited to portions of three regions in PA, WA and MD. Source schedules can change. These checks flag inconsistencies rather than establish authoritative street accuracy or comprehensive coverage. Public pilot readiness still depends on independently verified hosted authentication, privacy contact, retention operations and other launch gates; none were bypassed to expand data.
