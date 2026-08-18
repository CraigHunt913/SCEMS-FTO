# Live system verification — 2026-08-18

Read directly from Drive. Source of truth for the trigger and form facts is
`SCEMS_Manifest_2026-08-14_1536.json`, written by `fullBackupV20_1`.

Nothing here was changed. This is what is true of the running system.

---

## Which spreadsheet is live

```
1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI
SCEMS Field Training Tracker Master*****
```

Every form's `destination` points at it, and both spreadsheet-bound triggers
(`onHubFormSubmit`, `onSheetEdit`) are attached to it.

**There is a second spreadsheet that is not the system:**
`SCEMS_Field_Training_Tracker_Master` (`1q7OnZox2Gs5UEp8gkYh1Osyxkzmtmogv9ViIrr2Q59M`),
last modified the same day. Nothing points at it. Paste v20.2 into the script
bound to the first ID, not this one.

---

## Confirmed: the combined skills form has no trigger

The manifest lists twelve triggers. Three are `onSkillsGridSubmitV20`, bound to:

| Form | ID |
| --- | --- |
| Skills Quick Log : EMT | `1nhl49xC6v6gMzFb_CZafJaM1zlIVEvbrquDOGSg6YDQ` |
| Skills Quick Log : Advanced EMT | `1H39FqiIQGIJ-CWFnhDfWs7MWjJMJyMIYfdGqVhFOdgw` |
| Skills Quick Log : Paramedic | `1Ykg2qmx-C3Q2TzUPK287loucSPYlOhW8t6dtpYR0VTI` |

**Not bound:**

```
1Q1R2bQPQe3eDbiDQTGJJHtzgAOC9jhEJJUkeh2w2u4s
SCEMS Skills Quick Log        responses: 16     accepting: false
```

This is the defect found in source, confirmed live. That form is in
`FORM_IDS`, is declared owned by a form-bound trigger, and has none. Its
destination is the live spreadsheet, so its submissions did reach
`onHubFormSubmit` — which refused them as `SKIPPED_OWNED`, "handled by the
form-bound trigger", for a handler that does not exist.

**16 responses. Their skill evidence may never have reached tab 19.**

The one piece of good news: `accepting: false`. The form is closed, so no new
submissions are being lost. This is a recovery job, not a bleeding one.

All eight `MANAGED_TRIGGER_HANDLERS` are present and the handover trigger is
correctly bound. The combined form is the only gap.

---

## Forms, responses, and email collection

| Form | Responses | Collects email | Trigger |
| --- | --- | --- | --- |
| FTO Shift Evaluation | 23 | no | hub |
| Trainee Self-Reflection | 23 | no | hub |
| Urgent Concern Report | 1 | no | hub |
| Training Decision Record | 2 | no | hub |
| **Skills Quick Log (combined)** | **16** | no | **NONE** |
| Skills Quick Log : EMT | 4 | yes | bound |
| Skills Quick Log : Advanced EMT | 1 | yes | bound |
| Skills Quick Log : Paramedic | 0 | yes | bound |
| Trainee Handover Card | 0 | yes | bound |

The three per-level skills forms and the handover card collect verified
emails. That is what `onHandoverSubmitV19` needs to authorize a request, and
it is correctly configured.

The combined form does **not** collect email — another reason its 16
responses are worth reviewing by hand rather than trusting blind.

---

## Backups are cloning the form estate

`fullBackupV20_1` copies every form on each run. Three runs (13 Aug 19:14,
14 Aug 11:58, 14 Aug 15:36) have left roughly 25 duplicates in Drive:

```
Copy of SCEMS Skills Quick Log
Copy of Copy of SCEMS Skills Quick Log
Copy of Copy of Copy of SCEMS FTO Shift Evaluation
…
```

`rebuildFormIdsNow()` matches titles exactly, so the copies are excluded from
`FORM_IDS` and cannot hijack ingestion. The risk is human: a copy's URL looks
identical to the real one, and a submission to a copy goes nowhere. Move them
into a dated archive folder or delete them.

Not fixed in code — deleting a user's Drive files is not something a backup
routine should decide, and it is not something I should do without asking.

---

## Script properties as of the last backup

```
FORM_IDS          9 ids, including the unbound combined form
LAST_FULL_BACKUP  2026-08-14_1158
QUEUE_LIVE_VIEW   0
ROSTER_SYNC_AT    1786734098247
```

No `SCEMS_OPERATOR_EMAIL` — expected; v20.2 introduces it.

A web app is deployed (`webAppUrl` present in the manifest), so the portal is
live.

---

## Recovery order

1. Paste v20.2 into the script bound to `1YL-9Er9…` and reload the sheet.

2. `goLiveChecklistV20_2("craighunt913@gmail.com")`
   Step 3 binds the combined form, so nothing further can be lost if it is
   ever reopened.

3. `reconcileIngestionV20_1()` — read-only. It should list the combined
   form's responses as `NOT IN LEDGER`. They will show up because
   `onHubFormSubmit` opened their ledger rows with an empty `RESPONSE ID`,
   so the reconciler cannot match them and correctly reports them missing.

4. `recoverLostSubmissionsV20_2()` from **SCEMS ▸ Admin**. Leave the date
   **blank** — the combined form was created 29 July, and the old
   `stepE_replayLostResponses` hardcoded a cutoff of 8/5/2026 that would
   have skipped its oldest responses as "too old". A blank cutoff now means
   every response.

   Safe to run twice: evidence rows carry `SOURCE RESPONSE ID`, so anything
   already recorded is detected and skipped rather than duplicated.

5. Re-run `healthCheckV20_2()` and work the list.

Do this before trusting any readiness number. A skill missing its evidence
reads as *not ready*, and v20.2's evidence gate will refuse to sign it off —
correctly, but for the wrong reason.
