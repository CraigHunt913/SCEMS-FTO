# Live system verification — updated for v20.6.0

Earlier findings (2026-08-18) still describe the live Drive state until the
operator runs `ELITE_ESTATE`. What changed in **code** is below.

---

## Which spreadsheet is live

```
1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI
SCEMS Field Training Tracker Master*****
```

**Orphan twin — do not use:**
`SCEMS_Field_Training_Tracker_Master` (`1q7OnZox2Gs5UEp8gkYh1Osyxkzmtmogv9ViIrr2Q59M`).

v20.6 encodes both IDs. Health check and `ELITE_ESTATE` refuse / warn if the
script is bound to the twin.

---

## Fixed in v20.6 (was open on 2026-08-18)

| Finding | v20.6 fix |
| --- | --- |
| Backup clones ~25 "Copy of …" forms | `fullBackupV20_1` archives clones after `makeCopy`; `archiveFormCopies` cleans historical ones |
| Combined skills form unbound (16 responses) | Still recovered by `recoverLostSubmissionsV20_2` / step 8 of `ELITE_ESTATE` (blank cutoff) |
| 15 orphan Form Responses tabs | Reported by health check + `freshStartReport`; cleaned only on a **copy** via `freshStartClean` |
| Phase engine `#REF!` | Health check blocker + `ELITE_ESTATE` applies `applyEngineRepairV20_6` |
| Tab 12 blank header column | Health check + `ELITE_ESTATE` runs `repairDecisionQueueHeaderV20_4` |
| Portal `setUpStaging` minted a new book every run | Reuses remembered sandbox; `setUpStaging("NEW")` archives the old one |

---

## Operator order (no data loss)

1. Paste `Code.gs` into the script bound to `1YL-9Er9…` (not the twin).
2. Run `START_HERE`.
3. Run **SCEMS → Admin → Make the estate elite (safe repairs)** (`ELITE_ESTATE`).
4. Read the health check it prints. Work any remaining blockers.
5. For orphan Form Responses tabs: follow `docs-tracker-handover.html` — copy
   first, then `freshStartClean` on the copy only.
6. Portal: rebuild one-file, paste, run `setUpStaging` once (reuses if present).

Nothing in this path deletes a personnel record or a live form. Archive means
move into a dated Drive folder.
