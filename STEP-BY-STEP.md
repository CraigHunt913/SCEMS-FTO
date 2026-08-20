# Installing SCEMS v20.2 — every click

About 15 minutes. Do it on a computer, not a phone.
Nothing here can break your records, and step 3 makes a copy of the old code
first, so you can always go back.

---

## 1. Open your tracker

https://docs.google.com/spreadsheets/d/1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI/edit

It should open **SCEMS Field Training Tracker Master\*\*\*\*\***.

**Do not use the other one.** There is a second file called
`SCEMS_Field_Training_Tracker_Master` (no stars, underscores instead of
spaces). Nothing is connected to it. Installing into it means nothing works
and you will not know why.

## 2. Open the code editor

1. Click **Extensions** at the top of the spreadsheet.
2. Click **Apps Script**.

A new tab opens with a dark screen full of code. Keep both tabs open.

## 3. Save the old code, just in case

The most important step. Right now that editor holds the only copy of your
current system.

1. Click once in the code.
2. `Ctrl` + `A` (Mac: `⌘` + `A`) — everything turns blue.
3. `Ctrl` + `C` to copy.
4. Open Notepad (Windows) or TextEdit (Mac).
5. `Ctrl` + `V` to paste, save to your Desktop as `OLD-code-backup.txt`.

Open the file and check it is full of code before moving on.

## 4. Get the new code

https://github.com/CraigHunt913/SCEMS-FTO/blob/claude/multi-agent-code-review-1zeb1j/Code.gs

In the grey bar above the code, on the right, find the **copy icon** (two
overlapping squares — hovering says *Copy raw file*). Click it once.

If you cannot find it: click in the code, `Ctrl` + `A`, `Ctrl` + `C`.

## 5. Paste it in

1. Back to the code editor tab.
2. Click once in the code.
3. `Ctrl` + `A` to select all.
4. `Delete`. The screen goes empty — that is fine, you saved a copy.
5. `Ctrl` + `V` to paste.
6. `Ctrl` + `S` to save.

If you see red X marks, the paste did not finish. Select all, delete, paste
again, wait, then save.

## 6. Pick the function to run

At the top there is a **▶ Run** button and a dropdown next to it. Click the
dropdown, scroll to **S**, click `START_HERE`.

It works out who you are and does all the setup in the right order. There is
nothing to type.

## 7. Click Run

Click **▶ Run** once. Google will stop you and ask permission. That is
expected — step 8 handles it.

## 8. Give it permission

Google shows this warning for any script that has not been through their paid
commercial review. This is your own script, in your own account, that you
have been running for months.

1. **Authorization required** → click **Review permissions**.
2. Choose `dalewhitlock913@example.org`.
3. **Google hasn't verified this app** → click **Advanced** (bottom left).
4. Click **Go to SCEMS… (unsafe)**.
5. Scroll down, click **Allow**.

It rebuilds your whole skills matrix, so allow up to two minutes. Do not
click Run again while it is working.

## 9. Read what it tells you

A black panel at the bottom fills with text:

```
SCEMS v20.2.0 — DEPLOYMENT CHECKLIST

1. Operator account : OK
2. Form IDs : OK
3. Triggers : OK
4. Migration top-up : OK
5. Skill matrix rebuild : OK
6. Record tab protection : OK

All steps completed.
```

If one says **FAILED**, nothing is broken — it stopped on purpose rather than
carrying on and making a mess. Copy the whole panel and send it to me.
Everything after it says SKIPPED; that is the design working.

Underneath, a health check lists anything still needing attention and names
the exact function to run for each. That is a to-do list, not an error.

## 10. Get your menu back

1. Switch to the spreadsheet tab.
2. Press `F5` (Mac: `⌘` + `R`).
3. Wait for it to load. A **SCEMS** menu appears next to Help.

```
Work my queue
Record a skill I witnessed
Advance a trainee
Close / release a trainee
Health check
Backup now
  Admin ▸
```

If the menu is missing, reload once more and wait ten seconds. If it is still
missing, the file did not save — go back to step 5.

## 11. Recover the 16 lost skill logs

Your **SCEMS Skills Quick Log** form has 16 submissions that never reached
your records. It had no trigger connected, so the system discarded them while
writing "handled" in its own log. Step 7 reconnected it. Now find what was
missed.

1. **SCEMS → Admin → Ingestion reconciliation (read-only)**. Changes nothing.
   It should list responses as `NOT IN LEDGER`.
2. **SCEMS → Admin → Recover lost form submissions**.
3. It asks if you are sure → **OK**.
4. It asks for an earliest date → **leave the box completely empty** → **OK**.

**Leave the date blank.** That form was created 29 July. Typing a later date
skips the oldest submissions as "too old" — which is the bug that hid them in
the first place.

Safe to run twice: every recovered record carries the ID of the form response
it came from, so a second run finds and skips them. You cannot create
duplicates.

Then run **SCEMS → Health check** once more and work down the list.

---

## If something looks wrong

Stop and send me what is on screen. Do not click around trying to fix it.
Nothing in this version deletes records, and the worst outcome is that a step
refuses and tells you why.

**To undo everything:** open the code editor, select all, delete, paste back
`OLD-code-backup.txt` from step 3, save.
