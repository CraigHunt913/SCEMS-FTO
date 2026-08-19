# Regression tests

Plain Node — no npm, no framework. `Code.gs` has no top-level executable
code, so each harness `eval`s the real file and exercises the real
functions. Stubs are supplied only where a Google service is genuinely
reached.

```
node test/validate-skill-event.test.js    # skill evidence validator
node test/queue-row-resolution.test.js    # queue row identity + decision writer
node test/governance-gate.test.js         # v20.2 authorization + evidence gates
node test/ingestion-durability.test.js    # form bindings, retry safety, mail budget
node test/queue-sweep.test.js             # stale-queue sweep + matrix rebuild guards
node test/identity-tiers.test.js          # identity tiers + deployment checklist
node test/sheet-repair.test.js            # cancelled-queue repair + tab tidy-up
node test/console-and-file.test.js        # trainee console, release file, readability
node test/header-rename.test.js           # plain-English headers + the broken header row
node test/branding.test.js                # the badge and the masthead
```

All ten exit non-zero on failure. 519 assertions total.

| Harness | Covers | Guards against |
| --- | --- | --- |
| `validate-skill-event.test.js` | `validateSkillEventV20_1_`, `promptingForStageV19_` | the catalog-property and prompting-vocabulary blockers returning |
| `queue-row-resolution.test.js` | `queueRowByRequestIdV20_1_`, `writeQueueDecisionV20_1_` | batch approval writing to a row the queue sort moved |
| `governance-gate.test.js` | `requireActorV20_2_`, `deciderAuthorityV20_1_`, `evidenceGateProblemV20_2_`, `burningFlagsV20_2_`, the retired stubs | the v20.2 rule being quietly walked back |
| `ingestion-durability.test.js` | `formBoundTriggerPlanV20_2_`, `evidenceExistsForResponseV20_2_`, `mailBudgetOkV20_2_` | submissions dropped by an unbound form, retries duplicating a written record, bulk mail starving safety alerts |
| `queue-sweep.test.js` | `sweepStaleQueueRowsV20_2_`, the `rebuildSkillMatrixV19_` empty-output guard | one failed matrix read cancelling the entire pending sign-off queue |

| `branding.test.js` | `badgeIsRealV20_5_`, `brandSheetV20_5_`, `brandAllSheetsV20_5`, `sheetPurposeV20_5_` | the 1x1 placeholder badge shipping again unnoticed, duplicate badges stacking on re-runs, and the masthead writing below row 3 |
| `header-rename.test.js` | `canonicalHeaderV20_4_`, `renameHeadersV20_4`, `repairDecisionQueueHeaderV20_4`, `auditEntryProfilesV20_4`, `groupPlumbingColumnsV20_4` | a rename silently breaking the 235 lookups by canonical name, a sheet-crossing alias collision, or the entry-profile audit guessing at a record |
| `console-and-file.test.js` | `buildTraineeConsoleV20_3`, `buildTraineeFileV20_3`, `consoleEditV20_3_`, `readableWidthForV20_3_` | the console showing codes instead of words, a release file that truncates narratives or leaks another trainee's data, and narrative columns reverting to unreadable widths |
| `sheet-repair.test.js` | `repairCancelledQueueRowsV20_2`, `organizeTabsV20_2`, `FIX_MY_SHEETS` | the post-upgrade repair re-opening the wrong rows, or a tidy-up that cannot be undone |
| `identity-tiers.test.js` | `identityV20_2_`, `identityStampV20_2_`, `setOperatorAccountV20_2`, `goLiveChecklistV20_2` | the gate locking out its own operator, and the typed-name hole returning under cover of the fix |

`queue-sweep.test.js` drives the real sweep against a fake queue and reads the
cells back afterwards, so it proves behaviour rather than the shape of the
source.

`queue-row-resolution.test.js` asserts the *old* broken behaviour as well
as the new, so it demonstrates the defect rather than merely passing.

`governance-gate.test.js` is written against the numbered acceptance checks
in `SPEC-v20.2.md`; each section names the check it proves. Several
assertions read a function's own source (`fn.toString()`) rather than its
return value — that is deliberate. Checks like "no longer writes to tab 02"
and "deletes nothing" are claims about what a function *cannot* do, and a
behavioural test can only ever show that one particular input did not
trigger it.
