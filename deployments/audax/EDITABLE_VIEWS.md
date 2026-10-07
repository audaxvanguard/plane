# Editable project views release acceptance

Extend native project work items, states and IssueView records. Do not enable paid features, create automatic CRM fields, or change existing permissions. Currency values and totals remain decimal strings. Custom-property activity is stored in the native IssueActivity table in the same transaction as values, with immutable name/type/option snapshots. This records future changes; missing historical events are not fabricated or backfilled.

## Protected acceptance

Build the clean committed candidate using the existing protected deployment workflow. Then run the actual compiled web/API images against a disposable production database copy:

```sh
# Same per-process launcher used by protected builds; never alter host/runtime THP policy.
cc -O2 deployments/audax/no-thp.c -o /docker/plane-ql3x/audax-deploy/audax-no-thp-check
systemd-run --wait --pipe --collect --unit=audax-editable-view-acceptance \
  --slice=audax-build.slice -p MemoryMax=1536M -p MemorySwapMax=0 \
  -p Nice=19 -p IOSchedulingClass=idle \
  --setenv=CF_NODE=/root/.nvm/versions/node/v22.19.0/bin/node \
  --setenv=CF_CHROME=/docker/plane-ql3x/audax-deploy/test-chrome/chrome-test \
  /docker/plane-ql3x/audax-deploy/audax-no-thp-check \
  python3 /opt/plane-custom-fields/deployments/audax/run_editable_views_acceptance.py CANDIDATE_12_CHARACTER_REVISION
```

The browser job's 1536 MiB partition is inside the unchanged shared 6 GiB/no-swap/1.5-CPU slice, not additional host capacity. A 512 MiB browser-job cap produced thousands of local memory.max reclaim events and host PSI spikes while the whole stack stayed under 1 GiB; the bounded partition avoids that artificial bottleneck.

The runner checks disk and slice limits, serializes against other jobs, reclaims only the isolated slice's regenerable file cache, and uses unchanged host PSI guards. Its HTTP listener is localhost-only. Candidate backend code comes from the image, never a source mount. Test sessions and the copied database dump live in a private temporary directory; finally cleanup removes disposable containers, volumes, and credentials. Production receives only a read-only pg_dump operation. Do not target existing production records with fixtures.

The compiled test exercises exact totals, stage hiding/restoration, real spreadsheet cells and headers, failed cell/view saves and retries, native activity persistence, two actors, explicit saved configuration, reload/copy, both stage sources, and permission/count-guarded replacement. Component/store/contract suites additionally cover types, project isolation, aliases, retired values, generations and concurrency. Neither class of tests substitutes for the other.

The isolated static application reproduced React hydration warnings #418/#423 with the unchanged production web image. Compiled acceptance explicitly reports these two baseline classes and fails on any other runtime error. This is not an error-free-runtime claim.

## Migration and rollback

0128 adds PostgreSQL active same-project state-assignment triggers for Issue and DraftIssue, including bulk writes. Review and rehearse on the private production copy before --allow-migrations. No field definitions, values or view configurations are backfilled or deleted. Activity storage uses the existing native table and requires no additional migration.

Take the existing workflow's fresh database/config/upload backup and preserve current production images. Database downgrade and automatic view-config reset are prohibited. Older images do not understand v2 presentation and may reject v2 saved-view queries; keep the stored configuration and roll forward to the verified candidate instead of erasing filters or custom values. Ordinary legacy project views remain available. An image rollback must not be described as full v2 UI compatibility.

No independent reviewer is available in this harness; the final branch review must be labeled self-review. Deploy only after exact-candidate regression, types, compiled acceptance, disk/backup checks and self-review gates pass.
