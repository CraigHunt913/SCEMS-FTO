# Sumter EMS Command — Shift Board (Swift Playgrounds edition)

A single Swift file you paste into Swift Playgrounds on an iPad. It runs as a real
app on that iPad: offline, no account, no network.

**Status: written without a compiler.** It was written in a cloud session that had
no Xcode or Swift. The first build in Playgrounds is the first time it is
compiled. If Playgrounds shows red errors, copy the first one or two (file line
number and message) back to Claude.

## What you need

- An iPad running iPadOS 17 or later.
- **Swift Playgrounds**, free from the App Store (version 4.4 or later).

## Put it on the iPad

1. Open **Swift Playgrounds**.
2. Tap **+ App** (or **File > New App**). A new app named "My App" opens.
3. In the left sidebar, tap **ContentView**.
4. Tap in the code, press **⌘A** (or long-press > **Select All**), then delete.
5. Open `ContentView.swift` from this folder (in the Claude app or on GitHub, use
   the **Raw** view), select all of it, and copy.
6. Paste it into the empty ContentView in Playgrounds.
7. Leave **MyApp** as it is. It already shows `ContentView()`.
8. Tap the **Run** button (▶) at the top. The app opens on the right.
9. To run it full screen, tap the app preview's full-screen button, or use
   **Settings (⚙︎ app settings) > Install on Home Screen** if your Playgrounds
   version offers it.

First thing to do in the app: **Home > Settings and Built-in Checks > Run Built-in
Checks.** It runs about 40 checks of the board's rules (counts, repeated taps,
New Run, daylight saving, 1,000-character note, PDF pagination, backup
round-trip) on throwaway fictitious data. Every line should be green.

## If the build fails

- **"Main actor-isolated …" or "Sendable" errors:** the project is in Swift 6
  language mode. In the app's settings (⚙︎), set **Swift language version** to
  **5** if your version offers it, then run again.
- **Anything else:** send Claude the error text and line number.

## Adding the shield (optional)

The original Sumter shield is not in this file. To show it:

1. In Playgrounds, tap **+ > Insert From… > Photos / Files**.
2. Pick the shield PNG and name it exactly `SumterShield`.

It then appears, unaltered, in the Home header. Without it, the header shows
text only.

## What works

**Home:** Resume Active Shift, New Shift, New Training Shift (clearly labeled
fictitious data, kept separate), Archive (read-only, with Reopen recorded in
history), Import Backup, Settings.

**New Shift:** explicit carry-forward choices for roster, crew and On-Duty Notes.
Inherited items are marked "INHERITED — REVIEW" until you mark them reviewed.
Still-active runs can be transferred with their original ID, times and history.
Statuses, on-duty marks, call times, holding calls and notes never carry over.
Earlier shifts are never deleted.

**Board:**
- Header: Date, Shift, Supervisor, Sheet, time zone.
- System Status:
  - Trucks in Service, Available Now, Unknown, OOS, On Duty and Not on Duty. All
    are calculated, and "How these are counted" shows the rules.
  - Status Level, Weather and Hospital Divert are manual entries, each stamped
    with when it was updated.
  - On-Duty Notes.
- Calls Holding / Pending: starts empty. Add Call; Time In with Now or Correct;
  live holding time; Assign Unit with a busy/OOS override reason. If the unit
  already has an active run, you must close it first, and it stays in history.
  Several units can share one call. Cancel keeps the call and its history.
- Units grouped by station (seeded exactly: HQ 101–106, DALZELL 201–202,
  DABBS XRDS 401): unit, status (word + color), crew, run, priority/determinant,
  nature/destination, last update. Everything starts Unknown and not on duty.

**Unit editor (full screen):**
- Previous / Next / Done, and the identity bar stays visible while you edit.
- Large status buttons. ENR, SCN, TRN, HOS and CLR fill the matching run time
  only if it is empty, with a one-tap Undo that adds a compensating history
  entry instead of erasing. Repeat taps do nothing. AVL and OOS never record
  times. En Route never fills Dispatched.
- Run Number, Priority (P1–P3 / Not recorded) and Determinant (Omega–Echo /
  Not recorded) are independent of each other.
- Nature, Location, Destination.
- Six times. Each has **Now** (only when empty) and **Correct…**, which needs a
  reason and keeps the old value. Out-of-order and future times are flagged, not
  fixed.
- Run Notes, Close Run, and New Run (the prior run is kept, and the new run's
  times start blank).
- Crew, Unit Notes, earlier runs, and full history.

**Typing:** every text field is a normal iPad text field, so Scribble works. Long
fields have **Expand** for a full-screen editor. There are no length limits.

**Handwriting (PencilKit):**
- Available for Crew, Unit Notes, Run Notes, holding-call notes and On-Duty Notes.
- Pen, Eraser, Lasso, Undo, Redo, Add Writing Page, Finger Draw, Page Up /
  Page Down, Fit Width, and Erase All (asks first, and can be undone).
- Ink is stored as PencilKit data on a fixed 1024 × 768 page, attached by record
  ID, so rotation and reordering cannot move it.
- It is never read or turned into data.

**Saving:**
- Saved as one JSON file in the app's Documents folder, with iOS file protection.
- Typing saves about 0.4 s after you stop, and immediately when you leave a
  field, change unit, tap Done or switch apps. Every status, time and
  assignment saves immediately.
- The indicator shows Saving…, Saved hh:mm:ss, or **Save Failed** with Retry.
- If the saved file can't be read, the app stops. It neither overwrites the file
  nor opens a blank board. It offers Try Again, or moving the file aside.
- The board is hidden in the app switcher.
- The optional Keep Screen Awake setting only applies while a board is open.

**Export:** Shift Summary and Full Detail PDFs, generated from the saved data
(not a screenshot):
- US Letter landscape with navy bars and brick-red table headers.
- Table headings repeat on each page, and pages are numbered "n of N".
- Long entries continue in full on later pages, and every handwriting page is
  printed.
- Training records are labeled on every page.
- You preview first, then share or save to Files.

**Backup:** an editable, versioned JSON backup, including handwriting.
- Import checks the file. The restored copy gets new internal IDs and keeps a
  note of where it came from.
- It arrives as a separate read-only copy under Archive.
- If you import the same backup again, the app asks before making another copy.
- A damaged file changes nothing.

## Differences from the full Xcode prompt (and why)

- **One JSON file instead of SwiftData.** The app must paste into one file in
  Playgrounds, and SwiftData needs changes to MyApp.swift. The file has a schema
  version. A newer or unreadable file is never overwritten.
- **No `.xcodeproj`.** Playgrounds projects open in Xcode on a Mac if you want to
  move it there later.
- **No shield image or reference PDFs.** They weren't uploaded. The colors come
  from the prompt's values. Fonts are the system condensed face for headings
  and the system font for text.
- **The MCI Board (Prompt 02) is not included yet.** It would be a second file
  added to this same app.

## Not verified (needs your iPad)

Nothing here has been compiled or run yet. Physical-device behavior is
unverified:
- Pencil and Scribble
- palm rejection
- Finger Draw panning
- VoiceOver, larger text and keyboard behavior
- PDF appearance
- battery and glare

This is a prototype working board. It is not agency-approved, certified or
HIPAA-validated. Exports and backups contain operational information; handle
them as agency policy requires. iPad backups (iCloud or computer) may include
the app's data, depending on your iPad's settings.

## Quick drill (fictitious data)

1. Home > **New Training Shift** > Create.
2. Tap unit **101** > turn on **On duty** > tap **AVL**. On the board, Trucks in
   Service becomes 1.
3. Back in 101: **Start Run** > **ENR**. En Route fills in. Tap **Undo**, then
   tap **ENR** again.
4. Open **Unit Notes > Handwriting**, turn on **Finger Draw**, write a word,
   then tap **Done**.
5. Close Playgrounds completely, reopen it and run. The status, time and ink
   should all still be there.
6. Board > **Export** > Full Detail > Generate > check the pages > Share.
