# Our Ground production handoff

**November 7, 2026 · GO for controlled testing of the exact production candidate. Public promotion is NO-GO pending operational coverage, recovery custody and final owner authorization.** The production database, map, restricted reviewer and monitored mailbox are working. [Gate measurements](production-gate-receipts.json)

## Release identity

| Item | Verified result |
|---|---|
| Private GitHub release | PR #1 is open, mergeable and has two successful checks. Head `04fbdeb7793710bec14a1e6f91ca38a4916488d2`. Main is `3897dea703a7175e8ec57e1d7ba0f358dafc0221`. [PR #1](https://github.com/iampenuel/our-ground/pull/1) |
| Accounts | Vercel CLI and connected GitHub identity are `iampenuel`. Vercel ownership and the repository-local author use the verified Gmail `stanleyzebulonp@gmail.com`. The old failure came from a commit inheriting the global PSU email. GitHub attributes the pinned author and committer to the owner. |
| Merge safety | GitHub allows merge commits, squash and rebase. Auto-merge is off. Both Vercel projects have no linked Git repository, the pinned Vercel config disables Git deployments, and the repo workflow only runs checks. A regular merge, if later requested, preserves the tested SHA as a parent. Continue identifying the deployment by the pinned SHA and artifact. |
| Protected staging | READY Preview `dpl_CSAC1QC3Y13VcnVhAu4oC6Xszqvp` in `ourground-staging`, project `prj_eU9xRSetSQYTbkAce2cYIR5zx8c2`. [Immutable staging](https://ourground-staging-h2z4bst1p-penuels-projects-aa802b06.vercel.app) |
| Unaliased production candidate | READY `dpl_5WFWzBcT8bsz8icTcfrhYd9xNykY`, created by `iampenuel`, target `production`, Vercel Authentication, zero aliases. Vercel Git metadata and the authenticated hosted manifest match the release SHA. Anonymous API access returned 302. [Candidate](https://ourground-4hrtl54xy-penuels-projects-aa802b06.vercel.app) · [Vercel inspection](https://vercel.com/penuels-projects-aa802b06/ourground/5WFWzBcT8bsz8icTcfrhYd9xNykY) |
| Public production | Project `ourground`, ID `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, team `team_7zBDrVIlwYth2sXkAbBPcbYw` (`penuels-projects-aa802b06`), Vite, Node 24.x. Its sole verified primary domain has no redirect or Git branch override. It still serves `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`. Anonymous homepage and health returned 200. [Live site](https://ourground.vercel.app) · [Rollback target](https://ourground-cfiaqimgw-penuels-projects-aa802b06.vercel.app) |

All 463 production-package files matched the archived bytes, including 128 hashed static assets. SHA-256 of the archive is `40c7374aac752b2ddcdb7ab100891a30afd694aec31f770920ec86a27c4d540c`. The candidate was uploaded with `--prebuilt --prod --skip-domain`. The protected production handler used the independent database, geographic reference and actual Redis admission path. Hosted ZIP 96813 returned 23 healthcare sites, one housing counselor and zero food records. ZIP 19104 returned 310 food records within ten miles. The resource detail returned 200. Malformed and nonexistent correction targets returned 422 and 404. Gemini session, speech and Live token returned 403. [Package verifier](../../ops/production/verify-package.py) · [Hosted results](production-gate-receipts.json)

## Production data and recovery

Supabase Free project **ourground-production**, ref `amcqkonluwavilekgjww`, is independent of staging `hrmocmvdmshoghclxyjs`. The Data API is disabled. The new project started with zero public relations, auth users, storage objects or application schemas. The seed streamed the approved national checkpoint’s verified local restore into the empty database in one transaction. It excluded private table data and the staging limiter. The restricted production login uses a fresh secret, the transaction pooler on 6543, certificate and hostname verification, and TLS 1.3. The owner uses the session pooler on 5432. Each runtime database client permits one connection and has prepared statements disabled. Only the restricted runtime URI and CA were bound to Vercel Production. [Seed tool](../../ops/production/restore.py)

Production runs PostgreSQL 17.11 and PostGIS 3.3.7. All 17,518 published service IDs agree by source, with seven matching import receipts, 19 migration receipts, 33,791 postal areas and 34 active publisher privacy holds. The proximity query uses `service_locations_point_gix`. The final sampled size was **111,703,731 bytes**, leaving **388,296,269 bytes**, approximately **77.7%** of a decimal 500 MB allowance. This measures database size. WAL and filesystem usage have separate accounting. [Database sizing](https://supabase.com/docs/guides/platform/database-size)

The actual production directory was stream-encrypted and restored into a new isolated database in 15.3 seconds. The restore reproduced every source’s published IDs and receipts, national inventory, Honolulu search, raw-table denials and steward ACLs. Ciphertext SHA-256 is `d3504ee9bf740cadb09e239d786aaa0f6cc973a0e975e244705e9b4ed1f1143c`. The new archive is in the private workspace at `tmp/production-gates/prod-directory-y0kv2ftu/directory.dump.gpg`. The separate key file is `.env.production-directory-recovery.local`. [Prelaunch backup procedure](../../ops/production/backup-directory.py)

The restored production directory checkpoint was copied to `/Volumes/Penuel Back/Our Ground Backups/production-directory-20261108T033638Z/directory.dump.gpg` on Penuel Back. A readback matched all 12,372,855 bytes and the SHA-256 above. Its folder contains the encrypted directory archive and its checksum. The recovery key stays in separate custody. Before public intake, the owner must put the independent key in a recoverable vault, authorize an off-device destination and access list for real private correction data, and have a second authorized person demonstrate recovery. Set an acceptable loss window, backup interval and retention period. Record the time and checks for a successful alternate restore. Credentials, private reports and checkpoint decryption material stay out of Git and chat.

On this workstation the verification cluster is deliberately stopped between drills. To repeat a directory checkpoint, start the existing isolated TLS cluster from the pinned workspace, run the backup helper, inspect its receipt, then stop the cluster. The command below uses the existing private certificate and local-only port.

```sh
cd "/Users/admin/Documents/Projects/our-ground"
lab="$PWD/tmp/production-gates"
pg_ctl -D "$lab/replay-cluster" -l "$lab/replay-postgres.log" \
  -o "-h 127.0.0.1 -p 19474 -k '$lab/replay-cluster' -c ssl=on -c ssl_cert_file='$lab/tls/server.crt' -c ssl_key_file='$lab/tls/server.key'" start
python3 ops/production/backup-directory.py
pg_ctl -D "$lab/replay-cluster" -m fast stop
```

The private operations drill used only synthetic records. It streamed encrypted `app_private`, `our_ground_meta` and `directory_ops` schemas into an empty isolated target. It recovered the report, reviewer identity, audit event, location hold and both hidden services. Owner release of the hold left the location hidden. Once real corrections exist, the prelaunch directory helper refuses the export. For an authorized full private backup, use `pg_dump --format=custom --no-owner` for those three schemas, stream into encryption at the approved destination, and restore with `pg_restore --single-transaction --exit-on-error --no-owner` on a new compatible database. Install the extensions and restricted roles first. Reestablish approved person-specific memberships and passwords separately. Verify counts, holds, append-only history, public search and access denials before considering a recovery switch. [Synthetic recovery drill](../../ops/production/recovery-drill.py)

## Correction operations

**Penuel Stanley-Zebulon is the sole primary reviewer. The backup reviewer is unassigned.** The individual production login `ourground_reviewer_penuel` can enter the restricted steward role and read the queue. Direct report access, audit edits, and owner-only hold release were denied. Valid submission returned 202 in the isolated packaged-handler test. On the hosted production database, an uncommitted synthetic transaction verified report creation, review, audit and suppression of a shared location. Rollback removed every fixture record. Ordinary users never saw it. The production queue was empty afterward. [Reviewer tooling](../../ops/production/review.py) · [Isolated transaction](../../ops/production/verify-hold.sql)

- Run `cd "/Users/admin/Documents/Projects/our-ground"` and `python3 ops/production/review.py` to read the oldest open reports. Use `--show REPORT_UUID` for a specific report. The individual session-pooler connection is in the ignored owner-only file `.env.production-primary-reviewer.local`. Put the credential in the owner’s vault.
- Check the publisher and use a non-personal case reference. Use `python3 ops/production/review.py --suppress REPORT_UUID --ticket CASE-123` when a location must be hidden. Suppression hides all colocated services and prevents source republication. Use `--confirm REPORT_UUID --ticket CASE-123` to resolve a verified report. Only the owner can release an operational hold after review. Publisher privacy holds remain independently enforced. [Steward functions](../../ops/production/steward.sql)
- The owner designated `stanleyzebulonp@gmail.com`. One test, `OG-04FBDEB`, reached the inbox and Penuel personally acknowledged it. Form submissions enter the database queue. There is no automatic email notification. Agree on queue and inbox check frequency and absence coverage. If an alternate is appointed, give them an individual NOINHERIT login and only `our_ground_steward` membership. Verify their queue access and denial of raw reads. Remove the membership and disable their login when coverage ends.
- The exact frontend artifact contains the report form and has no public email on its privacy page. The designated address can be used in owner launch communications. Displaying it on that page requires a separately reviewed contact-only build using `VITE_PRIVACY_CONTACT_EMAIL`. A server-only Vercel setting cannot update compiled text.

## Map, coverage and EDEN

The production browser key’s Origin list omitted `https://ourground.vercel.app`. Adding precisely that Origin fixed the 401. The existing Referer rule sufficed. Chrome on the real public origin fetched the style, TileJSON and a 331,224-byte vector tile with HTTP 200. The provider source supplies Geoapify, OpenMapTiles and OpenStreetMap attribution. The unrelated-origin probes returned 401, and headerless requests returned 200. The browser key can still consume quota through direct scripted requests. [Map receipts](production-gate-receipts.json) · [Provider key controls](https://myprojects.geoapify.com/help/api-keys/)

Free browser, staging and server credentials share 3,000 credits/day. The dashboard showed 305 credits across 494 calls in its displayed month. Retain attribution and review per-key and project usage daily during initial public use. At a proposed 2,400 credits/day, investigate unexpected usage. For planning, 100 sessions fetching 50 tiles each consume about 1,250 credits for tiles alone. Search APIs also consume credits. If maps fail, residents can use list results and the Census city/ZIP reference. Sustained excess or abuse requires a reviewed replacement key or list-first configuration. No billing change was made. [Pricing details](https://www.geoapify.com/pricing-details/) · [Free limits](https://www.geoapify.com/pricing/)

| Public category | Published records | Geographic scope |
|---|---:|---|
| Healthcare | 16,417 HRSA service delivery sites | All 50 states, with 16,208 records inside the states |
| Food | 593 | Philadelphia 324, Seattle/King County 209, Prince George’s County 60 |
| Community Support | 508 HUD in-person housing counseling records | 49 states, with 496 records inside the states |

All-jurisdiction totals include DC and covered territories. Nationwide referrals are external. Residents can search without an account, donors follow provider contact or giving links, and organizations can review listings while onboarding and self-service publishing remain closed. EDEN’s hosted page controller retains its qualified behavior with mocked model proposals. Genuine Gemini Live audio was verified locally. Public model and voice endpoints are disabled. [State inventory](coverage.json) · [Prior product qualification](https://github.com/iampenuel/our-ground/blob/dce1f61feea591fa3840b4c087de56e700a03d98/docs/release/qualification.md)

## Promotion and rollback

Use the production-linked checkout `/private/tmp/ourground-national-production` and Vercel CLI 65.7.0. On this workstation define the following shell function.

```sh
vc() {
  /Users/admin/.nvm/versions/node/v24.22.1/bin/node \
    /Users/admin/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js "$@"
}
cd /private/tmp/ourground-national-production
```

1. Immediately before cutover, confirm `vc whoami` is `iampenuel`. Verify the project ID, candidate SHA and authenticated manifest. Inspect `ourground.vercel.app` using `vc inspect https://ourground.vercel.app --scope penuels-projects-aa802b06`. Its target must still be `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`. Standard Protection is `all_except_custom_domains`. Confirm anonymous candidate denial and anonymous public-domain access in a signed-out browser. If the previous target has changed, re-identify the rollback point and review the new state first.
2. **Only after explicit final owner release authorization**, run `vc promote dpl_5WFWzBcT8bsz8icTcfrhYd9xNykY --scope penuels-projects-aa802b06`. Confirm the domain now resolves to that ID. In an anonymous session verify homepage and health 200, the manifest SHA, Hawaii healthcare, the food coverage gap, map tiles and the correction entry point. An unexpected Vercel login on the public primary domain fails launch. [Vercel promotion](https://vercel.com/docs/cli/promote)
3. If the approved cutover fails, run `vc rollback dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4 --scope penuels-projects-aa802b06`. Verify the returned domain mapping, anonymous access and prior behavior. Hobby rollback supports the immediately previous public production deployment. Preserve incoming reports and holds, pause imports, and use an isolated restore before any separately authorized database switch. Vercel rollback does not rewind PostgreSQL. [Instant Rollback](https://vercel.com/docs/instant-rollback)

**Decision.** The exact national directory is ready for controlled owner review. Public cutover still needs an accepted on-call and recovery arrangement and explicit release authorization. Full public Gemini and voice are NO-GO pending independent eligibility, privacy, security and operational clearance.
