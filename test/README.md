# Regression tests

Plain Node — no npm, no framework. `Code.gs` has no top-level executable
code, so each harness `eval`s the real file and exercises the real
functions. Stubs are supplied only where a Google service is genuinely
reached.

```
node test/validate-skill-event.test.js    # skill evidence validator
node test/queue-row-resolution.test.js    # queue row identity + decision writer
```

Both exit non-zero on failure.

| Harness | Covers | Guards against |
| --- | --- | --- |
| `validate-skill-event.test.js` | `validateSkillEventV20_1_`, `promptingForStageV19_` | the catalog-property and prompting-vocabulary blockers returning |
| `queue-row-resolution.test.js` | `queueRowByRequestIdV20_1_`, `writeQueueDecisionV20_1_` | batch approval writing to a row the queue sort moved |

`queue-row-resolution.test.js` asserts the *old* broken behaviour as well
as the new, so it demonstrates the defect rather than merely passing.
