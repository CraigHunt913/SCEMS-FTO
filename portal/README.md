# SCEMS Field Training Portal — v1

The prototype, built for real. A separate Apps Script project that serves a
different screen to each role.

**It cannot touch your live system.** There is no spreadsheet id in this code.
`setUpStaging()` creates a brand new spreadsheet with invented people and
points the portal at that. To aim it anywhere else you would have to change a
script property by hand, and in any mode other than `STAGING` every write
refuses.

---

## Setting it up

1. **script.google.com** → **New project**. Name it `SCEMS Portal`.
   This is a *new* project. Do not paste any of this into the tracker's script.

2. Create these files and paste each one in:

   | File | Type |
   | --- | --- |
   | `00_Config.gs` | script |
   | `10_Identity.gs` | script |
   | `20_Data.gs` | script |
   | `30_WebApp.gs` | script |
   | `90_Staging.gs` | script |
   | `Index.html` | **HTML** |

   `Index.html` must be added with **File → New → HTML**, named `Index`.

3. Run **`setUpStaging`**. It builds the sandbox and tells you where it is.

4. **Deploy → New deployment → Web app.**
   Execute as **Me**. Access: **Only myself** to begin with.

5. Open the web app URL.

---

## Trying the other roles

`setUpStaging` makes you Training Division so you land on the busiest screen.
To see another:

```
switchRoleForTestingV1("TRAINEE")
switchRoleForTestingV1("FTO")
switchRoleForTestingV1("SUPERVISOR")
switchRoleForTestingV1("MEDICAL")
switchRoleForTestingV1("DIVISION")
```

Reload the portal after each. This function refuses outside staging, so it
can never become a way around authorisation in a live system.

`portalStatusV1()` says where the portal is pointed and whether it may write.

---

## What is real and what is not

**Real:** role resolution, record-level filtering, the trainee view, the FTO
list, the Division queue, supervisor and Medical Director views, filing a
reflection, acknowledging coaching, approving a sign-off with a typed reason,
the audit trail, formula-injection blocking, frame denial.

**Not built yet:** the FTO end-of-shift workflow (evaluation plus skill
evidence plus coaching in one pass). It is the biggest piece and the one worth
getting right after you have used the rest.

---

## The rules this is built on

**One screen answers one question.** Not everything about a trainee — what
needs you, now.

**Nobody sees another role's problem.** The filtering happens on the server
*before* the payload is built, so there is no data in the page for a
client-side mistake to expose. `test/portal.test.js` asserts that one
trainee's payload cannot be made to contain another's name, coaching or
concern.

**Every action says what happens next.** Who received it, who can see it,
what they will do.

---

## Safety properties, all tested

- No spreadsheet id anywhere in the source
- Refuses to start until pointed at a target
- Every write checks `STAGING` first
- Role checked server-side on every action; the browser's claim is ignored
- A trainee cannot read, acknowledge or alter another trainee's record
- Sign-off requires a typed reason — there is no default wording
- Submitted text starting `=` `+` `-` `@` is neutralised
- The page denies framing and embeds no ids or addresses

Run `node test/portal.test.js` — 65 assertions.
