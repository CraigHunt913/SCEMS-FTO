# SCEMS v20.2 — the governance release

**This is the brief.** It is written as the instruction I would want to be
given, before any code exists, so it can be argued with cheaply.

---

## Why this release exists

Six review passes over v20.1.0i found defects clustered in one place, and
they were not carelessness. The system is trying to be two incompatible
things at once:

- a **records system** with legal weight — immutable sign-offs, a decision
  authority, a retention standard, a 72-hour promise to the people it
  documents
- a **convenience console** for one very busy person — one-click runners,
  canned rationales, bulk fixers

Convenience has been winning, one reasonable-looking shortcut at a time:

| Shortcut | What it actually does |
| --- | --- |
| `approveAllReadyV20_1` | writes "Evidence thresholds met" without checking any threshold |
| `recordSkillDirectV20_1` | signs off a clinical skill with no evidence pipeline involved |
| `stepB_recordStranded` | hardcodes the "Division Chief confirmation required" override |
| `fixAllFlagsNowV20_1` | overwrites an FTO's submitted answer, then signs generated text with their name |
| `simplifyFlagsV20_1` | rewrites the detection formulas to honour acknowledgements it wrote itself |
| `deciderAuthorityV20_1_` | grants sign-off authority to anyone who types "Medical Director" |

The code already argues with itself about this. `redoAuditTabV20_1` writes
*"Nothing here is dismissed by hand"* onto every flag header; `onSheetEdit`
hard-blocks the bulk-clear checkbox with `AUDIT CLEAR-ALL BLOCKED`. Then
another function dismisses them all by hand.

v20.2 does not add features. It draws the line the system has been missing.

---

## The rule

> **Anything that becomes part of a person's permanent record has exactly
> one way in, and that way is never bulk, never defaulted, and never
> self-attested.**
>
> Everything else — reminders, dashboards, digests, tidying, diagnostics —
> may be as convenient as we can make it.

Every decision below follows from that sentence. Where this brief and the
rule disagree, the rule wins.

---

## Build

### 1. An authorization gate, actually called

`resolveAuthorizedActorV20_1_` is a competent model with four call sites in
10,289 lines. Advancement, close/release, bulk approval, mode switching,
the scoreboard and the backup have no check at all.

Add `requireActorV20_2_(action, allowedRoles)`:

- resolves the caller through the existing model
- **refuses when the platform cannot identify the session** — no fallback to
  a typed name, ever
- writes every grant and every denial to the access log
- returns a message the caller shows and then stops

Apply to: `advanceTraineeNow`, `closeTraineeV20_1`, `workMyQueueV20_1`,
`approveTraineeOnViewV20_1`, `recordSkillDirectV20_1`, `goLive`,
`backToTestMode`, `ftoScoreboardV20_1`, `fullBackupV20_1`, `purgeTestRows`.

Delete the name-matching fallback branch in `deciderAuthorityV20_1_`.

> **This will lock you out** if the script runs under a consumer Google
> account, because `Session.getActiveUser().getEmail()` returns `''` there.
> That is the correct behaviour and the reason the Workspace move matters.
> The gate must say so plainly in its refusal message rather than failing
> mysteriously.

### 2. An evidence gate on sign-off

`recordDecisionForRowV20_1_` is the single writer to the permanent sign-off
log. It validates form completeness and decider authority and **never
consults readiness, the evidence log, or any threshold.**

Before writing an `Approve sign-off`:

- recompute readiness for `(trainee, skillId)` from the matrix
- if it is not `READY FOR VALIDATION`, refuse — unless the rationale
  carries an explicit typed override
- when overridden, stamp `[THRESHOLD OVERRIDE]` into the permanent record
  so the exception is visible forever

Returns, revokes and already-ready approvals are unaffected. The point is
not to prevent judgement; it is to stop judgement being *indistinguishable*
from the routine path.

### 3. No canned assertions

Three call sites hardcode `'Evidence thresholds met, FTO recommendation
accepted'` — a factual claim the code never checked, written under a named
decider. Remove the default everywhere. An approval requires a reason the
operator actually chose.

### 4. Retire what destroys records

Following the project's existing retired-stub pattern (name preserved, body
replaced with a refusal that names the supported path):

- **`approveAllReadyV20_1`** — bulk approval of permanent records. Cannot
  survive the rule. Points at `workMyQueueV20_1`, which asks per item.
- **`simplifyFlagsV20_1`** — rewrites detection formulas to honour its own
  acknowledgements, then hides the tab. Points at `acceptFlagV20_2`.
- **the narrative block of `fixAllFlagsNowV20_1`** — overwrites tab 02
  answers and attributes generated text to an FTO. The phase-mismatch
  acknowledgement is kept; the record rewriting is not.

`unwrapAuditFormulasV20_1` stays, because it is the reversal.

### 5. An honest flag path

Flags currently have two fates: burn forever, or be silenced. There is no
legitimate third option, which is *why* the silencing tools got written.

`acceptFlagV20_2()` — one flag, one named human, one typed reason, one date:

- the flag stays **visible** as `ACCEPTED`, never hidden and never reverted
  to clear
- carries a review-by date, so acceptance expires rather than being
  permanent
- never touches a detection formula

### 6. Protections, so immutability is a control

`protectRecordTabsV20_2()` applies real sheet protections to the record tabs
(16, 19, 21, 90–93) and reports what changed. Today immutability is a
convention, and seven code paths delete or overwrite records anyway.

### 7. Six verbs

~20 menu items, ~33 editor-only tools and 24 tabs is a second job. The daily
shape — *work my queue → approve or return* — is right. Everything else
should be diagnostic.

```
Work my queue
Record a skill I witnessed
Advance a trainee
Close / release a trainee
Health check
Backup
  └ Admin ▸ (everything else, health check first)
```

Delete the dead first `onOpen` at `Code.gs:448` and keep the survivor's
`try/catch`.

### 8. A health check that names the next action

Every gap-detector in this system is editor-only and invisible.
`healthCheckV20_2()` runs the read-only ones and returns a prioritized list
of what needs attention **with the exact function to run for each** —
ingestion exceptions, decision reconciliation, analytics agreement, the
40-trainee ceiling, effective mail mode, backup age.

---

## Out of scope, deliberately

- **Splitting `Code.gs` into files.** Correct, but it is a workflow change
  (`clasp`) and must not ride along with a behaviour change.
- **The matrix rebuild cost.** Real and worth doing; it is a performance
  refactor with a wide blast radius and deserves its own release.
- **Widening the 40-row windows.** The health check will *report* the
  ceiling; moving it touches 25 call sites and live sheet formulas.
- **Workspace migration, a second decider, `BACKUP_EDITOR`.** Org decisions,
  not code. The gate makes the first one urgent rather than optional.

---

## Acceptance checks

Ship only when every line is true.

1. Every function in the list at §1 refuses an unidentified session, and the
   refusal explains why rather than failing silently.
2. `deciderAuthorityV20_1_` no longer grants authority on a typed name.
3. An `Approve sign-off` on a skill that is not `READY FOR VALIDATION` is
   refused unless explicitly overridden, and an override is stamped
   `[THRESHOLD OVERRIDE]` in the permanent record.
4. The string `Evidence thresholds met, FTO recommendation accepted` no
   longer appears as a default anywhere.
5. `approveAllReadyV20_1` and `simplifyFlagsV20_1` write nothing.
6. `fixAllFlagsNowV20_1` no longer writes to tab 02.
7. An accepted flag is still visible on tab 13 and still counted as
   outstanding by the health check.
8. `node --check` passes and every suite in `test/` is green.
9. Nothing in this release deletes a row from any tab.

---

## Risks I am accepting

- **The gate can lock out the only operator.** Deliberate. It fails loudly
  with an explanation. A system that cannot say who signed a record is worse
  than one that is briefly hard to use.
- **Sign-off gets slower.** That is the trade. Bulk approval of clinical
  competency was the fastest path to a defensible-looking record that nobody
  had actually reviewed.
- **Protections may collide with existing manual edits.** The applier
  reports rather than forces, and is re-runnable.

---

## Amendment 1 — identity tiers

*Added after the build, because shipping revealed the brief was wrong.*

§1 said the gate must refuse "when the platform cannot identify the session —
no fallback to a typed name, ever", and I accepted the lockout under *Risks*
on the grounds that a system which cannot say who signed a record is worse
than one that is briefly hard to use.

That reasoning still holds. The implementation did not follow from it.

The gate resolved identity through `Session.getActiveUser()` alone, which
returns `''` on a consumer Google account. So v20.2 as first built refused
**every** gated action for its only operator — it could not be deployed at
all. A correctness release nobody can run fixes nothing, and the defects it
addresses stay live in production.

The error was treating "verified identity" as one bit when it is three:

| Tier | Source | What it is |
| --- | --- | --- |
| `ACTIVE` | `Session.getActiveUser()` | the platform naming the human at the keyboard |
| `EFFECTIVE` | `Session.getEffectiveUser()` | the platform naming the account the script runs as |
| `OPERATOR` | script property, set by `setOperatorAccountV20_2()` | the script owner declaring it once, out of band |

The rule this release exists to draw is *never self-attested*. A name typed
into `DECIDED BY` at decision time is self-attestation: the person asserting
the identity is the person benefiting from it, at the moment of benefit, in a
field anyone with sheet access can edit. That is still refused, and
`decidedByText` is still never read.

The other two are not that. `EFFECTIVE` is the platform answering a second,
weaker question. `OPERATOR` is a one-time declaration by whoever owns the
script, stored where no formula, form response or sheet edit can reach it.
Both are credentials about the container. Neither is the actor vouching for
themselves mid-decision.

So the gate accepts all three, and the difference is carried rather than
erased:

- every record written under an attested tier is stamped
  `[IDENTITY EFFECTIVE, ATTESTED]` or `[IDENTITY OPERATOR, ATTESTED]`,
  permanently
- the access log records the tier on every grant and every denial
- the health check reports an attested tier every single run and does not
  stop, because Workspace accounts are what make attribution real

Acceptance check 1 is amended to: *every function in the list at §1 refuses
when no tier resolves, the refusal explains why and names the one-line fix,
and any record written under an attested tier says so on its face.*

Check 2 is unchanged and still holds: `deciderAuthorityV20_1_` grants nothing
on a typed name.

**What this costs.** A consumer account cannot distinguish the owner from a
delegate — `EFFECTIVE` inside an installable trigger is the trigger's owner,
not whoever caused the event. Records will say `ATTESTED` and mean it. That is
a real limitation, stated on the record rather than hidden, and it is the
argument for the Workspace migration rather than a substitute for it.
