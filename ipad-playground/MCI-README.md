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
   Built-in Checks**. 45 checks run on made-up data. All should be green.

If you see "Main actor-isolated" or "Sendable" errors, set the app's Swift
language version to 5 in the app settings, if your version of Playgrounds offers
it.

### Built from the source board

The app follows `References/Sumter_EMS_MCI_Command_Board_11x17.pdf` (4 pages):

- **Shield:** the original shield is built into the code. It was taken out of
  the PDF with its transparency restored and is only scaled, not redrawn.
- **How to Triage:** the START / JumpSTART / SALT text from page 2 is included
  word for word. In Triage, tap **Show How to Triage**. It is labeled
  "Reference only — verify against agency protocol" and is never used to pick a
  category. It is also printed in the packet.
- **Command roles** are grouped the way the page 1 chart lays them out: Command,
  Command Staff, Operations, Medical Branch, then Groups / Units.
- **Incident Packet PDF** is 11 × 17 landscape by default, like the board (Letter
  is an option). Each part has the board's header: the shield, the red "SUMTER
  COUNTY EMS" line, the navy page title and a red rule. Each part also keeps its
  footer note from the board, and page numbers read "PAGE n OF N · section".

Still optional, from inside the app:

- **Sketch backgrounds:** Settings → **Add Scene Sketch Cards PDF**. Pick
  `Sumter_EMS_Scene_Sketch_Cards.pdf` (a copy is in `References/`). Its pages
  are Roadway / MVC, Structure A/B/C/D and Large Facility, in the order the
  app expects. The pages are shown unaltered behind the ink. The PDF isn't
  built into the code because it would add about half a megabyte to the paste.
- **Agency references:** Settings → **Approved references**.

### Intentional differences from the paper board

- **No "NIMS / ICS COMPLIANT" badge.** The software makes no compliance claim.
- **Transport categories.** Page 4 circles R Y G B. The app uses R, Y, G, EXP
  (Expectant) and DEC (Deceased), plus UNK (not classified), so Expectant and
  Black are never merged into one "B".
- **Hospital board.** It shows Patients Sent for every category, not just
  R / Y / G, and unknown destinations get their own row.
- **Triage count.** The single count row becomes dated snapshots: the Running
  Count by time. The tracked Patient Register is shown beside it and never
  added in.
- **No row limits.** The paper's fixed rows (14 transports, 6 staging, 8
  agencies, 3 air) become lists you can extend.

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
- **Card Details** is a large editor for every box on the card:
  - Roadway: Incident #, Date / Time, Location, Sketched By, Main Rd / Hwy and
    Cross St.
  - Structure: Side A faces, Roof / 2nd / 1st floor divisions, and Exposure B
    and D.
  - Facility: Facility, Residents #, Staff #, Ambulatory / Non-amb /
    Bariatric, both Wing / Hall blanks, and the M1 / M2 muster points.
- In the packet, typed values are printed into the card's own header boxes.
  Everything else goes in a labeled companion block in the card's blank lower
  area.
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
