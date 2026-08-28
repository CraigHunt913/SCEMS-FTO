# Deploying SCEMS v20.6

One function to install. One function to make the estate elite.

```
START_HERE()                                   // install / upgrade, in order
ELITE_ESTATE()                                 // safe repairs: forms, engine, recovery
deploymentStatusV20_2()                        // read-only, safe any time
```

`START_HERE` takes no arguments, because the Apps Script Run button cannot
pass any. It works out who you are from the session, so there is nothing to
type. See STEP-BY-STEP.md for click-by-click instructions.

Both are in the script editor. `deploymentStatusV20_2` and `ELITE_ESTATE`
are also on the menu under **SCEMS ▸ Admin**.

---

## First time

1. **Paste `Code.gs`** over the existing script project and save.

2. **Reload the spreadsheet.** The `SCEMS` menu rebuilds itself on open. If
   it does not appear, the file did not save — check for a red error marker
   in the editor.

3. **Run `START_HERE`** from the script editor. Authorize the script when
   Google asks.

   It performs, stopping at the first failure:

   | # | Step | Why it is in this position |
   | --- | --- | --- |
   | 1 | Operator account | Nothing can be attributed until this resolves |
   | 2 | Form IDs | Triggers need forms to bind to |
   | 3 | Triggers | Including the combined skills form v20.1 never bound |
   | 4 | Migration top-up | `REQUEST ID` and the 90–93 system tabs |
   | 5 | Matrix rebuild | Readiness must be current before anyone decides |
   | 6 | Tab protection | Immutability becomes a control, not a convention |
   | 7 | Health check | Your standing to-do list |

   Every step is re-runnable. If it stops, fix that step and run it again.

4. **Run `ELITE_ESTATE`** (or **SCEMS ▸ Admin ▸ Make the estate elite**).
   Archives backup form clones, repairs the phase-engine `#REF!`, fixes the
   decision-queue header, recovers lost skills submissions, protects record
   tabs. Deletes nothing. Orphan Form Responses tabs are reported only —
   clean those on a Drive copy per the handover doc.

5. **Work the health check** until it reports `CLEAR` or only `INFO` lines.
   It names the exact function to run for each finding — including Drive
   sprawl, the orphan twin spreadsheet, and engine damage.

6. **Stay in TEST mode** until step 5 is clean. `goLive()` is the switch, and
   the health check reports a `BLOCKER` for as long as you are in TEST,
   because in TEST mode every alert — including unsafe outcomes and 72-hour
   breaches — goes to the test inbox and reaches nobody else.

---

## After an upgrade

Run `START_HERE` again. It skips the operator step if identity already
resolves, and re-runs the rest. Every step is safe to repeat.

---

## Recovering what the unbound form lost

v20.1 declared `SCEMS Skills Quick Log` handled by a form-bound trigger and
never bound one, so `onHubFormSubmit` refused those submissions and recorded
the loss as `SKIPPED_OWNED` — "handled by the form-bound trigger" — for a
handler that did not exist. Submissions to that form never reached the
evidence log.

Step 3 above stops the bleeding. To find what was already lost:

```
reconcileIngestionV20_1()                      // read-only; lists what is missing
replayResponseV20_1("<formId>", "<responseId>")  // recovers one, idempotently
```

`reconcileIngestionV20_1` prints the exact `replayResponseV20_1` call for each
missing response. Replay is safe to repeat: evidence rows carry
`SOURCE RESPONSE ID`, and a response already expanded is detected and skipped.

Do this before trusting any readiness number, because a skill missing its
evidence reads as *not ready* and will be refused at sign-off.

---

## Identity, and why the health check keeps nagging

The gate refuses to write a record it cannot attribute. It resolves who is
acting in three tiers:

| Tier | Source | Verified? |
| --- | --- | --- |
| `ACTIVE` | `Session.getActiveUser()` | yes |
| `EFFECTIVE` | `Session.getEffectiveUser()` — the account the script runs as | attested |
| `OPERATOR` | the address set by `setOperatorAccountV20_2()` | attested |

On a Workspace account you get `ACTIVE` and records are clean. On a consumer
account you will usually get `EFFECTIVE`, and every record written carries
`[IDENTITY EFFECTIVE, ATTESTED]` permanently.

That is honest, and it is enough to run the system. It is **not** the same as
a verified signature, which is why the health check reports it every time and
will not stop. Workspace accounts are what make attribution real.

What none of these tiers is: reading a name somebody typed into the
`DECIDED BY` cell. v20.1 did that, which is how a permanent record ends up
credited to someone who never made the decision. It is not coming back.

```
setOperatorAccountV20_2("you@example.com")   // set
setOperatorAccountV20_2()                    // report, change nothing
setOperatorAccountV20_2("CLEAR")             // remove; the gate locks down
```

---

## What will refuse you, and why that is correct

| It says | It means |
| --- | --- |
| `REFUSED : <ACTION>` | Nothing identifies the session, or the account lacks the role. Fix on **22 FTO ROSTER** / **90 PERSON REGISTRY**, not in code. |
| `evidence gate: this skill reads "…"` | You are approving a skill the matrix does not call `READY FOR VALIDATION`. Approve anyway through the menu prompt and it is stamped `[THRESHOLD OVERRIDE]` forever. |
| `RETIRED in v20.2` | `approveAllReadyV20_1` and `simplifyFlagsV20_1` are gone. Use `workMyQueueV20_1` and `acceptFlagV20_2`. |
| `QUEUE SWEEP REFUSED` | The matrix read back empty or wanted to cancel too much at once. Your pending requests are untouched and still `OPEN`. |
| `MATRIX REBUILD PRODUCED NOTHING` | The rebuild computed zero rows, so the previous matrix was left standing. Check **01 TRAINEE MASTER** and **15 SKILL CATALOG**. |

---

## Tests

```
node test/validate-skill-event.test.js
node test/queue-row-resolution.test.js
node test/governance-gate.test.js
node test/ingestion-durability.test.js
node test/queue-sweep.test.js
node test/identity-tiers.test.js
```

Plain Node, no npm. They `eval` the real `Code.gs`. See `test/README.md`.
