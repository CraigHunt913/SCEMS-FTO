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

## The badge (resolved, v20.5)

When `Code.gs` was reconstructed from a chat paste, `BADGE_B64` was replaced
with a 1×1 transparent PNG placeholder — 96 characters instead of 33,996.
Nothing failed and nothing logged; the county shield simply rendered as an
invisible pixel in emails, on HOME, and in the portal.

That placeholder was then deployed, because the reconstructed file was pasted
over the original script.

Recovered from `PASTE_THIS_ONE_SCEMS_v20_1_0h.txt` in the user's Drive — the
pre-v20.2 source, which still held the real constant. Verified as a 150×163
PNG of the Sumter County EMS shield before restoring.

Guards added so this cannot pass silently again:

- `badgeIsRealV20_5_()` treats anything under 1000 base64 characters as absent
- `badgeBlobV20_5_()` returns null rather than building an invisible image
- `brandAllSheetsV20_5()` logs `BADGE MISSING` at WARN and alerts the operator
- `test/branding.test.js` asserts the constant is 33,996 characters and that a
  placeholder is correctly rejected
