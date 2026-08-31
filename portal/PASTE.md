# Paste this into Apps Script

**File:** [`portal/SCEMS_PORTAL_ONE_FILE.gs`](./SCEMS_PORTAL_ONE_FILE.gs)

**Current version:** look for `VERSION: 'portal-2.11.0'` near the top (or run `portalPasteCheck` after paste).

## GitHub (easiest)

1. Open: https://github.com/CraigHunt913/SCEMS-FTO/blob/cursor/the-line-product-adde/portal/SCEMS_PORTAL_ONE_FILE.gs  
2. Click **Raw** → select all → copy  
3. Portal Apps Script `Code.gs` → paste → Save → Deploy → **New version**

Raw: https://raw.githubusercontent.com/CraigHunt913/SCEMS-FTO/cursor/the-line-product-adde/portal/SCEMS_PORTAL_ONE_FILE.gs

## After paste

`portalPasteCheck` → **portal-2.11.0**

## PDF reports (2.11.0)

Trainee **Print / save PDF** uses county letterhead, a status strip, and Field Training type. Same print dialog → Save as PDF.

## Short portal address (2.11.0)

Hand the crew a short link, not the long `/macros/s/…` URL:

1. Deploy the web app; copy the deployment URL.
2. Embed that URL on the Sites Hub (or a county redirect):  
   `https://sites.google.com/view/scemsfieldtraininghub/home`
3. In the portal editor, run:

```
setPortalShortAddress("https://sites.google.com/view/scemsfieldtraininghub/home")
```

4. `portalAddress()` shows what to give people. Division **Menu** can copy the same link.

## Faster load (2.10.0)

Division **Decide / Moves / People** open from master + queue only. Inbox (forms waiting, Settle) and a trainee’s skills/forms load **after** the desk is up — that is intentional so first paint is not stuck on FormApp.

## Monday emails (tracker — not portal)

Portal `goLive()` only opens the desk for writing. Weekly trainee cards, roll-up, and supervisor digests are sent by the **tracker** Apps Script project:

1. Tracker editor → `whichMode()`  
2. Tracker → `goLive()` (mail leaves the test inbox)  
3. Tracker → `installTriggers()` (Monday schedule; safe to re-run)

Only **Active** trainees get status cards. Use **End training / close** on a trainee record (or Clear for the truck) so Cleared / Closed people leave the Monday list.

## Division Home (tabs)

- **Decide** — sign-off queue + ready for the truck  
- **Moves** — need a look / holding  
- **People** — open any trainee  
- **Inbox** — forms waiting + Settle + file something (loads after first paint)  
- **Menu** — portal link, add trainee, add FTO, sync matrix, refresh queue, released reports  
