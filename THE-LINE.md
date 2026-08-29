# THE LINE

Sumter County EMS Field Training — the product humans open.

## What it is

**One living chart per trainee.** Everyone opens the same truth with different buttons.

| Role | Screen | Job |
| --- | --- | --- |
| Trainee | **My Line** | Where I am, what’s waiting on me, four bars per skill |
| FTO | **Tonight** | Who I rode with → file for that person |
| Training Division | **Waiting on you** | Decisions · **Bring someone on** · **Advance phase** · **Release** (captured) |
| Supervisor | **My shift** | Hot strip — who’s silent tonight |
| Medical Director | Clinical review | Urgent concerns only |

The Google Sheet remains the **vault** (records, forms destinations, retention). People do not run the program from forty tabs.

## Deploy

1. New or existing Apps Script project for the portal (never paste into the tracker).
2. Paste [`SCEMS_PORTAL_ONE_FILE.gs`](SCEMS_PORTAL_ONE_FILE.gs) (rebuild with `node tools/build-one-file.js`).
3. `setUpStaging` → practice · `pointAtProductionReadOnly` → look · `goLive` → real writes for gated actions.
4. Deploy → Web app → execute as you · access: anyone in the organization (or your Workspace policy).

Live data is whatever spreadsheet `PORTAL_TARGET` points at — staging sandbox or the starred Master.

## Self-checks (does this work for humans?)

- Can an FTO finish Tonight in under a minute after a shift?
- Does Waiting on you show **one** dominant decision, not a spreadsheet list?
- Do flags read as **next moves** (“Schedule an evaluation”) not jargon?
- Does Return stay dead until a reason is typed?
- Would someone at 02:00 need a HOW-TO doc? If yes, the screen failed.

## Bring someone on

Training Division (STAGING or LIVE) can add a trainee from Waiting on you:

1. **Bring someone on → New trainee**
2. Name, work email, level (required). Phase, FTO, entry letter optional.
3. THE LINE writes one row on `01 TRAINEE MASTER` and refreshes **Trainee** dropdowns on the Google Forms already registered — no new form is created.

Afterward: open the tracker once (or run `rebuildSkillMatrix`) if their skill-progress rows need to appear. Evaluations and skills logs work as soon as the form lists refresh.

## Phase and release

Open any trainee from Waiting on you:

- **Advance to Phase N+1** — typed reason required. Writes `CURRENT PHASE` + `PHASE START DATE` and stamps the audit trail.
- **Release** — typed reason + confirm. Sets `Closed / Released`, archives who/when/why, cancels open skill requests, drops them from form Trainee lists.
- Phase 4 people also show under **Ready to release** on the desk.

## Version

`portal-2.0.5` — Phase advance + release (one click, captured).
`portal-2.0.4` — Bring someone on (add trainee + sync existing form lists).
`portal-2.0.3` — Quiet desk (no machinery banners).
`portal-2.0.0` — THE LINE.
