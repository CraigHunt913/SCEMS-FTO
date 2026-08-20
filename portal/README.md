# SCEMS Field Training Portal — v1.3

One front door for the whole programme. A separate Apps Script project that
serves a different screen to each role, and hands each person the one form
their situation calls for.

## How this fits the system you already have

**The forms write. The portal reads.**

Your nine Google Forms do not change. Not their questions, not their
triggers, not their response destinations. They are still the only thing that
puts a row in the tracker, and they still do it exactly the way they do now.

What was missing was the front. Nine forms is nine decisions before anyone has
done any work: which form, which level, whose name, which link did the Chief
send in March. The portal takes all of that away. An FTO opens one link, taps
the person they worked with, and gets the evaluation and the skills log for
*that trainee's level*, with both names already filled in.

Nothing in the portal writes to a live record. Against the real tracker every
write path refuses, by design and under test.

---

## Setting it up

**One file.** Paste
[`SCEMS_PORTAL_ONE_FILE.gs`](SCEMS_PORTAL_ONE_FILE.gs) over `Code.gs` in a new
Apps Script project and you are done — the page is in there too, as a string
at the bottom. There is nothing else to add.

1. **script.google.com** → **New project**. Name it `SCEMS Portal`.
   This is a *new* project. Do not paste any of this into the tracker's script.

2. Select everything in `Code.gs`, delete it, and paste
   `SCEMS_PORTAL_ONE_FILE.gs` in its place. Save.

   Copy it from the **raw** view — that is plain text, and a browser copies it
   whole. Then scroll to the bottom of `Code.gs` and check you can see the
   `END OF FILE` block. If you cannot, the paste was cut short; select all,
   delete, paste again. `portalPasteCheck` says the same thing out loud.

   No line in that file is longer than about 200 characters, deliberately. The
   first version embedded the county badge as a single 49,000-character line,
   which is exactly what a code editor mangles on paste and what a file viewer
   refuses to render — and either one gives you a syntax error nowhere near
   the real cause. The badge is now sized for where it is actually shown.

3. Run **`setUpStaging`**. It builds a sandbox with invented people and points
   the portal at it. Form links are **off** in the sandbox, on purpose: the
   forms behind them are the real ones, and a test submission would be a live
   write nobody approved.

4. **Deploy → New deployment → Web app.**
   Execute as **Me**. Access: **Only myself** to begin with.

5. Open the web app URL. Try each role (below), decide whether the layout is
   right, and only then go on to the live data.

---

## Trying the other roles

`setUpStaging` makes you Training Division so you land on the busiest screen.
To see another, pick one of these from the Run dropdown and run it — no
arguments to type, because the Run button cannot pass any:

```
viewAsTrainee
viewAsFTO
viewAsDivision
viewAsSupervisor
viewAsMedical
```

Reload the portal after each. These refuse outside staging, so they can never
become a way around authorisation in a live system.

---

## Pointing it at the real tracker

This is two deliberate steps, and neither happens by default.

1. **Project Settings → Script Properties → Add script property**

   | Property | Value |
   | --- | --- |
   | `PORTAL_PRODUCTION_SPREADSHEET_ID` | the live tracker's address, or its id |

   Paste the whole address bar if that is easier — `https://docs.google.com/…`,
   or `/d/1YL…/edit`, or the bare id. The id is picked out of whichever you
   give it. The same is true of `PORTAL_BACKFILL_CONFIRM` later.

   The id is not in this code. A copy of this project cannot reach your
   production data on its own.

2. Run **`pointAtProductionReadOnly`**.

The portal is now in `PRODUCTION` mode. That mode is read-only and it is
enforced in code, not by convention:

| Action | In `PRODUCTION` |
| --- | --- |
| Approving a sign-off | refuses |
| Filing a reflection through the portal | refuses — the form does it instead |
| Acknowledging coaching | refuses |
| Switching role for testing | refuses |
| Reading any tab | allowed |
| Opening a form, prefilled | allowed |

Run **`productionReadinessCheck`** next. It reads the tracker and every form
and reports: which tabs it found, how many trainees have no email and
therefore cannot sign in, who you resolve to, and where each form's responses
actually go. It writes nothing.

**`pointAtStaging`** puts you back on the sandbox.

---

## The record: current first, nothing lost

Every screen now opens onto the same thing — **the most recent submission of
each kind, in full, with every earlier one kept underneath it.**

Nothing is deleted, moved, merged, shortened, or rewritten to produce this.
The raw tabs stay exactly as they are; they are the archive. This is a reading
of them.

- **Current** leads, marked as current, in full.
- **Earlier** submissions sit behind one tap, in order, also in full. A
  four-hundred-word account of a shift arrives whole — there is a test that
  requires the last sentence to survive and that there is no ellipsis anywhere
  in it.
- **Every populated column comes through with its own label**, including
  columns nobody thought to ask for. A question added to a form tomorrow shows
  up in the record without this code changing.
- **Skills are current per skill**, not one winner overall. A failed attempt
  from June stays on the record next to the successful one from August.
- **An undated row sorts last** rather than being dropped or accidentally
  becoming the current one.

### Two submissions on the same day

When two submissions of the same kind land on the same day, **both are kept and
both are shown**, and the pair is flagged. Which one stands is a judgement
about a personnel record, so nothing here makes it.

The Training Division screen lists every such pair with the tab and row
numbers. `duplicateSubmissionsReport()` prints the same list in the script
editor.

### Who may open whose

Decided on the server from the signed-in account, every time:

| Role | May open |
| --- | --- |
| Trainee | Their own record only |
| FTO | Trainees assigned to them |
| Training Division | Anyone, in full |
| Supervisor | Nobody — situational awareness, not a training record |
| Medical Director | Urgent concerns only, for anyone |

A trainee asking for someone else's record is refused, not handed a filtered
version.

---

## Bringing in responses that never reached a tab

A form with no submit trigger still holds every answer anyone gave it. The
combined skills log is in that state and has sixteen.

**`backfillPreview()`** shows exactly what would be imported. It writes
nothing, in any mode, so it is safe to run against the live tracker.

**`backfillIntoStaging()`** does the import — and refuses outside `STAGING`,
so the sandbox proves it first.

Three rules govern the import:

- **Nothing is dropped to make the shape fit.** An answer whose question
  matches no column goes into the notes column with its question attached. If
  there is nowhere to put it, the whole response is **refused** rather than
  written incomplete, and the report says which answers had nowhere to go.
- **Re-running is safe.** Every row carries the form response id it came from.
  A second run writes nothing.
- **No response id column, no import.** Without one there is no way to tell a
  re-run from a duplicate, so the plan stops rather than risk writing the same
  evidence twice.

Answers starting `=` `+` `-` `@` are neutralised on the way in without losing
what they said.

### Doing it against the live tracker

`80_Import.gs` is the one file in this project that can write to production,
which is why it is its own file with its own gate.

**`backfillBeforeAndAfter()`** — writes nothing, in any mode, against any book.
It prints the row count before, every value of every row it would add, every
response it would refuse and why, and the row count after. Run it first and
keep the output.

**`runBackfillForReal()`** — refuses unless the script property
`PORTAL_BACKFILL_CONFIRM` holds the **id of the spreadsheet it is about to
write to**. Not `YES`, not `true` — the id, typed by hand. A confirmation left
over from the sandbox names the wrong book and cannot fire against production.

It also refuses outright if any response has an answer with nowhere to go,
because a half-imported record is worse than one still sitting in the form.

What it does: appends. It never edits a cell that already has a value, never
deletes a row, and never touches the trainee master, the validation queue, or
any decision column.

**`undoLastBackfill()`** — reads the manifest in `PORTAL BACKFILL LOG`,
re-reads each row it recorded, checks it still carries the response id the
manifest says, and removes only those, bottom-up. **One mismatch and nothing
is deleted at all** — a shifted row means the manifest no longer describes the
sheet, and guessing is how records get destroyed.

**`lockBackfill()`** — clears the confirmation so the gate closes behind you.
Both the import and the undo then refuse.

### Two properties, pointing opposite ways

This is the one thing here that is easy to get backwards:

| Property | Names the spreadsheet that is | |
| --- | --- | --- |
| `PORTAL_OTHER_SPREADSHEET_IDS` | **read from** | never written to |
| `PORTAL_BACKFILL_CONFIRM` | **written to** | must equal the current target |

Put the source in the confirmation and it refuses, says which way round it
goes, and prints the exact id to use instead.

**`showSettings()`** lays out every setting with the name of each spreadsheet
and whether the gate is open. Read only. Run it whenever you are unsure.

---

## When some of the record went to another spreadsheet

A form pointed at the wrong book, a copy made during a rebuild, a sheet
someone started and abandoned. Add it in Project Settings:

| Property | Value |
| --- | --- |
| `PORTAL_OTHER_SPREADSHEET_IDS` | one address per line, or comma separated |

Paste whole addresses; the ids are picked out.

**`whatElseIsOutThere()`** opens each one **read only** and reports every tab,
how many rows it holds, which tabs this portal understands, and — for those —
how many rows are not here yet. It writes nothing, to either book.

**`mergeBeforeAndAfter()`** shows every row that would come across, in full,
with the count either side. Also writes nothing.

**`runMergeForReal()`** brings them across. Same gate as the form import:
`PORTAL_BACKFILL_CONFIRM` must hold the id of the book being written to. It
**appends** to this spreadsheet and never touches the other one — there is a
test that requires the other book to be byte-identical afterwards.

`undoLastBackfill()` reverses a merge the same way it reverses an import.

Three things it gets right that are easy to get wrong:

- **Column order does not have to match.** Columns are paired by name, not
  position, through the same alias table the form import uses.
- **A row already here is recognised even if it carries no matching id.** Both
  sides are fingerprinted over the columns they share, so a row that arrived by
  another path is not duplicated.
- **A column this book does not have is carried into the notes with its name
  attached.** Where there is nowhere to put it, the whole row is refused rather
  than written short, and the report names the values that had nowhere to go.

---

## Who is offered what

| | Trainee | FTO | Division | Supervisor | Medical |
| --- | --- | --- | --- | --- | --- |
| End-of-shift evaluation | | per trainee | | | |
| Skills log (their level only) | | per trainee | | | |
| Handover card | | per trainee | | | |
| Self-reflection | yes | | | | |
| Urgent concern | yes | yes | yes | yes | |
| Training decision record | | | per trainee | | |

The FTO never picks a form and never picks a level. They pick a person.

---

## The combined skills log

`Skills Quick Log (all levels)` is in the registry and is offered to **nobody**.
It has no submit trigger bound to it, so a response to it stays in the form and
never reaches the tracker. Sixteen are sitting there now.

The portal will not send anyone to it, and the Training Division screen says so
until it is resolved. The form itself is untouched — deciding what happens to
it, and to those sixteen responses, is not something this portal does on its
own.

---

## Prefilling, and why it is careful

The registry discovers each form's `entry.NNN` field ids by reading the form
and building a response object in memory. That response is **never submitted**;
there is a test that counts submissions and requires zero.

Two rules keep a prefill from doing harm:

- A **dropdown** is only prefilled with a value the form actually offers. If a
  trainee's name is on the master but not in the form's list, that field is
  left alone rather than filled with something the form will discard.
- A form that cannot be read — moved, unshared, scope not granted — costs the
  prefill and nothing else. The card still appears and still opens the form.

Discovery is cached in script properties. Run `clearFormCache()` after editing
a form; run `warmFormCache()` to see what the registry can currently reach.

---

## What is real and what is not

**Real:** role resolution, record-level filtering, the trainee view, the FTO
list and per-trainee sheet, the Division queue and roster, supervisor and
Medical Director views, the form registry with level-aware routing and
prefill, the full record with current-first ordering and duplicate flagging,
the backfill of orphaned form responses, read-only production mode, the
readiness check, the audit trail, formula-injection blocking.

**Not built:** a single end-of-shift screen that files the evaluation, the
skill evidence and the coaching note in one submission. That needs the forms
themselves to change, which is a production decision, not a portal one.

---

## The rules this is built on

**One screen answers one question.** Not everything about a trainee — what
needs you, now.

**Nobody sees another role's problem.** The filtering happens on the server
*before* the payload is built, so there is no data in the page for a
client-side mistake to expose.

**Every action says what happens next.** Who received it, who can see it,
what they will do.

**The portal is not a second writer.** There is exactly one way a record is
created, and it is the same way it was created last week.

---

## Safety properties, all tested

- No spreadsheet id anywhere in the source; refuses to start until pointed
- Every form id lives in the registry only, and none reaches the browser
- Every write checks `STAGING` first; `PRODUCTION` refuses all four write paths
- Role checked server-side on every action; the browser's claim is ignored
- A trainee cannot read, acknowledge or alter another trainee's record, and is
  never handed a link carrying someone else's name
- A dropdown is never prefilled with a value the form does not offer
- Form discovery never submits a response
- The readiness check leaves the spreadsheet byte-identical
- Sign-off requires a typed reason — there is no default wording
- Submitted text starting `=` `+` `-` `@` is neutralised
- Reading a record writes nothing — not even an audit row, against production
- A trainee is refused another trainee's record rather than shown a subset
- No submission is ever shortened, merged, or dropped to build a screen
- An import cannot run twice, and refuses a response it cannot place in full
- The production import refuses unless the confirmation names that exact book
- It appends only; no other file in the portal deletes a row at all
- The undo verifies every row against its response id, or deletes nothing
- The page cannot be framed by another site

```
node test/portal.test.js           73 assertions — role isolation and write safety
node test/portal-forms.test.js    120 assertions — the registry, prefill, production mode
node test/portal-history.test.js   92 assertions — current first, nothing lost, who may open whose
node test/portal-merge.test.js     73 assertions — the other spreadsheets, read only then across
node test/portal-backfill.test.js 101 assertions — importing responses, the production gate, the rollback
node test/portal-onefile.test.js   59 assertions — the pasted file matches its sources and runs alone
```

`SCEMS_PORTAL_ONE_FILE.gs` is **built**, not written. Edit the files in this
folder and run `node tools/build-one-file.js`. `portal-onefile.test.js` fails
if the two ever disagree, so what you paste can never quietly go stale.
