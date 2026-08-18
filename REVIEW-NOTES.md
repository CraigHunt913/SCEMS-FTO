# SCEMS FTPD v20.1.0i — source under review

`Code.gs` is the consolidated single-file Google Apps Script build
(v20.1.0i, 2026-08-14), assembled from the five-part paste set.

## One deliberate difference from the live source

`BADGE_B64` in the live source holds an ~8 KB base64-encoded PNG (the
department badge used in email banners and sheet headers). In this copy
it is replaced with a 1×1 transparent PNG placeholder so the file stays
readable and diffable. **No code path was changed** — every function that
reads `BADGE_B64` is byte-identical to the original.

Before deploying anything from this repo, restore the real badge string.

## Layout

The file keeps its original logical sections as comment banners:

| Section | Contents |
| --- | --- |
| `00_core` | delivery mode, logging, sheet access, header-mapped read/write, locks, mail |
| `10_identity` | person registry, name resolution, FTO scope, authorization |
| `20_forms` | form estate, level-safe choice sync, handover card |
| `30_ingestion` | ingestion ledger, form-submit routers, replay, reconciliation |
| `35_operations_ported` | machinery carried forward from v19/v20 |
| `40_skills` | skill-evidence validation and the grid-form handler |
| `50_decisions` | validation queue, decision recording, lifecycle changes |
| `60_reporting` | analytics recomputation and verification |
| `70_admin_health` | safe builders, read-only control suite, portal, backups |
| `80_migration` | previewed, additive migration |
| `95_runners` | one-click maintenance runners |
| `99_config` | the single CONFIG object, tab names, form titles, schemas |

Verified: parses cleanly (`node --check`), 277 top-level functions.
