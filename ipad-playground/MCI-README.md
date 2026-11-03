# Sumter EMS Command — MCI Board (Swift Playgrounds edition)

`MCIBoard.swift` is a complete, standalone Swift Playgrounds app for the MCI
Board. Install it as its own app, separate from the Shift Board.

**Status: written without a compiler.** It was written in a cloud session that
had no Swift. The first build in Playgrounds is the first time it is compiled.
If you see red errors, send Claude the first one or two (line number and
message).

## Put it on the iPad

1. Open **Swift Playgrounds** and tap **+ App**. A new app opens.
2. Tap **ContentView** in the sidebar, select all the code, and delete it.
3. Paste all of `MCIBoard.swift`. It defines `ContentView` at the bottom.
4. Leave **MyApp** as it is. Tap **▶ Run**.
5. In the app, go to **Home → Settings, Directories and Built-in Checks → Run
   Built-in Checks**. About 45 checks run on made-up data. All should be green.

If you see "Main actor-isolated" or "Sendable" errors, set the app's Swift
language version to 5 in the app settings, if your version of Playgrounds offers
it.

### Optional: the original PDFs

None of the source PDFs were uploaded, so none are built in. You can add them
from inside the app:

- **Sketch backgrounds:** Settings → **Add Scene Sketch Cards PDF**. Pick
  `Sumter_EMS_Scene_Sketch_Cards.pdf`. Pages 1–3 then appear, unaltered and
  locked, behind sketches.
- **Triage reference:** Settings → **Approved references**. Add the START /
  JumpSTART / SALT page, or an agency PDF, with its revision and approval
  details. It opens offline from the Triage section, labeled "Reference only".
- **Shield:** add an image named `SumterShield` and it shows in the header.

## What's in it

**Home**
- New Incident starts immediately with a local ID such as `MCI-20261103-1432`.
  No details are required to start.
- New Training Incident is labeled throughout as fictitious data.
- Also: Resume, Closed Incidents (read-only, with Reopen), Import Backup, and
  Settings.

**Each incident** has an identity bar (name, ID, time zone, MCI level, current
section) and eight sections: Overview, Command, Triage, Hospitals and Aid,
Transport, Staging, Sketch and Activity.

**Overview**
- Large buttons: Add Patient, Update Reported Count, Add Resource, Record
  Departure.
- Both count sources side by side, each labeled with its own scope and time.
- Items that need completion or reconciliation.
- Hospital poll ages, and how many pending checklist items are left.

**Command** (source page 1)
- Name, occurrence time (never filled in for you), location, and incident type
  (pick several, plus Other).
- MCI level: Unknown or 1–5, as labels only.
- Command Established time.
- The five channel and location fields.
- Access/egress, hazards, and command notes with handwriting.
- The 12-item checklist with Pending / Completed / Not Applicable, the time and
  initials, and history.
- All 11 roles, with assign, reassign and relieve. History is kept, and you can
  add your own roles.
- **Handover** summary that you can share as text.

**Triage** (source page 2)
- **A · Reported Scene Count** snapshots:
  - Five categories, each either Unknown or a number. Large separated −/+
    buttons.
  - Shows "Known subtotal … Incomplete" when any category is Unknown.
  - Corrections are new snapshots linked to the old one, and there is a Running
    Count list.
- **B · Patient Register:** counts derived from the individual patient records.
  The two sources are never added together.
- Expectant (GRAY) and Deceased (BLACK) are separate everywhere. A new patient
  is **Not classified**, never Minor.

**Hospitals and Aid** (source page 3)
- The six seeded facilities, marked as not verified. Each incident keeps its own
  bed polls.
  - A blank count means Unknown and 0 means 0. Divert is Yes, No or Unknown.
  - The age of each poll is shown, and an optional local "Needs update" reminder
    can flag old ones.
- **Patients Sent** is shown separately from the polls and grouped by category
  *at departure*. Departures never reduce a poll.
- Mutual aid uses the 8 seeded agencies. Every request is its own record, with
  eight statuses and an ETA you enter as an estimate.
  - "Mark Arrived and Add to Staging" creates **one** linked resource, never a
    copy.
- Air: Meducare 2, AirReach and LifeNet 2, with flights linked to patients.

**Transport** (source page 4)
- Add On-scene Patient, and **Add Another** while in the editor.
- Add Already-Departed Patient, for entering a departure after the fact.
- Search, plus filters for location and category.
- **Patient editor:**
  - The patient's ID stays at the top.
  - Category is picked manually.
  - Optional tag, with a warning on duplicates; they are never merged.
  - Optional age in years or months, approximate if needed, and sex.
  - Chief complaint, and notes with handwriting.
- **Record Departure:**
  - Each departure has a stable ID, so a double tap or a retry can't record it
    twice.
  - Any piece you leave out is recorded as Unknown and flagged.
  - The unknown-destination tally is kept separately.
- After departure:
  - You can correct the destination, unit, category at departure or time.
    Each correction needs a reason and is kept in the history.
  - You can also confirm arrival, or void the departure.
- **Entered in Error:** needs a reason, is blocked while a valid departure
  exists, and can be undone. Records are never deleted.
  - "Remove as Duplicate" is separate from "Change Category".

**Staging** (source page 4)
- Resources with identifier, type, agency, contact, capacity notes, time in,
  assignment and status/released.
- A warning appears when an identifier matches an existing resource.
- The Available count comes from each resource's recorded status.
- A resource used for a departure switches to Transporting, so it's no longer
  counted as available.

**Sketch**
- Roadway / MVC, Structure A/B/C/D, Large Facility / Nursing Home, and Add
  Sketch Page.
- A full-screen PencilKit canvas over the locked card background, with zoom
  in/out and reset, page navigation, eraser, lasso, undo/redo and Finger Draw.
- **Card Details** is a large editor for every small box on the card.
- The triage snapshot is a dated copy from a source you choose. It is never a
  live tally.

**Activity:** every change, with the time it took effect and the time it was
recorded.

**Export**
- **Incident Packet PDF** in the source order: Command; Triage and Count
  History; Hospitals and Aid; Transport and Staging. Then sketches (background
  and ink lined up), activity, continued long text, and handwriting pages.
  - Table headings repeat, and pages are numbered "n of N".
  - Each page is marked Training or Operational.
- **Editable JSON backup** with all records, links, history and ink.
  - Import checks the file, gives the copy new IDs, and adds it as a separate
    read-only copy.
  - It asks before importing the same backup twice.

**Close Incident:** the incident becomes read-only and nothing is reset. Reopen
is recorded. There is no midnight reset; incidents can run over several days.

## Not verified

The code has not been compiled or run. Pencil, Scribble, palm rejection, how
sketches line up after rotation and zoom, VoiceOver, larger text and how the
PDFs look all need your iPad.

This is a manually maintained coordination board. It is not an ePCR, triage
decision tool, dispatch interface or hospital-capacity feed. It is not certified
or agency-approved, and it makes no NIMS/ICS compliance claim. The iPad is the
working copy; exports and backups are copies, not live sharing.

## Quick drill (fictitious)

1. Tap **New Training Incident**.
2. In Command, name it "Drill" and tap **Now** on Command Established.
3. Tap **Update Reported Count**: R 2, Y 3, G 5, EXP blank, DEC 0 → Record
   Snapshot. It should show "Known subtotal 10 — Incomplete".
4. **Add Patient** three times, giving each a category.
5. Open one patient → **Record Departure** to Prisma Health Tuomey. Overview
   now shows 2 on scene, 1 departed, and Sent 1. The reported snapshot is
   unchanged.
6. In Sketch, add a Roadway card, then draw on it with Finger Draw.
7. Quit Playgrounds, reopen it and run. Everything should still be there.
8. Use **Export → Generate Incident Packet** and check the pages.
