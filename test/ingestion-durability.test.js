// SCEMS v20.2 — ingestion durability.
//
// Three defects, all of which lost or duplicated records without saying so:
//
//   1. The combined skills form was declared "owned by a form-bound trigger"
//      but no trigger was ever bound to it, so onHubFormSubmit refused its
//      submissions and the ledger logged the loss as a successful handoff.
//   2. A throw AFTER the durable write stamped FAILED over VALIDATED, so the
//      Apps Script retry re-mirrored a response that was already in the sheet.
//   3. Bulk mail could consume a consumer account's 100-recipient daily quota
//      before an unsafe-outcome alert needed it.
//
//   node test/ingestion-durability.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let QUOTA = 100;
let SYSLOG = [];
let SENT = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 1; };
FakeSheet.prototype.getMaxRows = function () { return this.g.length; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < NR; i++) {
        const row = sh.g[R - 1 + i] || [], sl = [];
        for (let j = 0; j < NC; j++) sl.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]);
        out.push(sl);
      }
      return out;
    },
    getDisplayValues: function () { return this.getValues().map(x => x.map(v => String(v == null ? '' : v))); },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return this; },
    setValues: function (vs) { vs.forEach((row, i) => { sh.g[R - 1 + i] = sh.g[R - 1 + i] || []; row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; }); }); return this; },
    setDataValidation: function () { return this; }, setNumberFormat: function () { return this; },
    clearDataValidations: function () { return this; }
  };
};

let SHEETS = {};
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: n => SHEETS[n] || null, getId: () => 'SS' }),
  getUi: () => ({ alert: () => 'ok', ButtonSet: {}, Button: {} }),
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => 'America/New_York' };
global.Utilities = { getUuid: () => 'stub-uuid', formatDate: d => '2026-08-18' };
global.Logger = { log: () => {} };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) };
global.MailApp = {
  sendEmail: function () { SENT.push([].slice.call(arguments)); QUOTA--; },
  getRemainingDailyQuota: () => QUOTA
};
global.ScriptApp = { getProjectTriggers: () => [] };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (lvl, kind, detail) { SYSLOG.push({ lvl, kind, detail }); };

// ---------------------------------------------------------------- //
section('Every form declared trigger-owned actually gets a trigger  (defect 1)');
// ---------------------------------------------------------------- //
const owned = formTitlesOwnedByFormTriggersV20_1_();
const plan = formBoundTriggerPlanV20_2_();

ok(owned.indexOf(FORM_TITLES.SKILLS_COMBINED) >= 0,
   'the combined skills form is still declared owned by a form trigger');
ok(plan.some(p => p.title === FORM_TITLES.SKILLS_COMBINED),
   '...and the installer now has a binding for it — this is the fix');
ok(plan.find(p => p.title === FORM_TITLES.SKILLS_COMBINED).handler === 'onSkillsGridSubmitV20',
   'bound to the skills grid handler, the one that writes evidence');

owned.forEach(t => {
  ok(plan.some(p => p.title === t), 'declared-owned form "' + t + '" has a binding');
});
ok(owned.length === plan.length,
   'the two lists are the same length because one is derived from the other');
ok(/formBoundTriggerPlanV20_2_/.test(formTitlesOwnedByFormTriggersV20_1_.toString()),
   'ownership is derived from the plan, so the two cannot drift apart again');

const repairSrc = repairAllTriggersNow.toString();
ok(/formBoundTriggerPlanV20_2_/.test(repairSrc), 'the installer reads the same plan');
ok(!/SKILLS_EMT, FORM_TITLES\.SKILLS_AEMT/.test(repairSrc),
   'the old hardcoded three-form list is gone from the installer');
ok(/NOT BOUND/.test(repairSrc), 'and it reports any form it could not bind');

const healthSrc = healthCheckV20_2.toString();
ok(/formBoundTriggerPlanV20_2_/.test(healthSrc),
   'the health check checks form BINDINGS, not just handler names');
ok(/getTriggerSourceId/.test(healthSrc),
   'by source id — one handler serves four forms, so the name proves nothing');

// ---------------------------------------------------------------- //
section('A failure after the write is not a failure before it  (defect 2)');
// ---------------------------------------------------------------- //
ok(LEDGER_STATES_V20_1.indexOf('FAILED_AFTER_WRITE') >= 0, 'FAILED_AFTER_WRITE is a known state');
ok(LEDGER_WROTE_ALREADY_V20_2.indexOf('VALIDATED') >= 0 &&
   LEDGER_WROTE_ALREADY_V20_2.indexOf('FAILED_AFTER_WRITE') >= 0,
   'both states mean "the durable write already happened"');
ok(LEDGER_WROTE_ALREADY_V20_2.indexOf('FAILED') < 0,
   'plain FAILED still means nothing landed, so a replay stays safe');

const hubSrc = onHubFormSubmit.toString();
ok(/LEDGER_WROTE_ALREADY_V20_2\.indexOf\(st0\)/.test(hubSrc),
   'the retry guard consults the list, not a single hardcoded state');
ok(/mirroredThisAttempt/.test(hubSrc), 'the handler tracks whether IT mirrored');
ok(/wrote \? 'FAILED_AFTER_WRITE' : 'FAILED'/.test(hubSrc),
   'and the catch picks the state from that, instead of erasing it');
ok((hubSrc.match(/mirroredThisAttempt = true/g) || []).length === 4,
   'all four mirror branches set the flag — eval, reflect, urgent, decision');

const skillSrc = onSkillsGridSubmitV20.toString();
ok(/ledgerFindV20_1_\(key\) \|\|/.test(skillSrc),
   'the skills handler reuses an existing ledger row instead of opening a duplicate');
ok(/evidenceExistsForResponseV20_2_/.test(skillSrc),
   'and checks the evidence log itself, which is the authoritative record');
ok(/wroteEvidence \? 'FAILED_AFTER_WRITE' : 'FAILED'/.test(skillSrc),
   'its catch preserves the write the same way');

// The authoritative idempotency check, exercised for real.
const EH = ['EVENT ID','TIMESTAMP','SHIFT DATE','TRAINEE','LEVEL AT EVENT','PHASE','FTO',
  'SKILL ID','DOMAIN','SKILL','CONTEXT','STAGE','OUTCOME','PROMPTING','CALL / SCENARIO REF',
  'EVIDENCE NOTE','SOURCE FORM','SOURCE ROW','VALIDATION RESULT','ATTESTATION','SOURCE FORM ID',
  'SOURCE RESPONSE ID','WRITER VERSION','PERSON ID','ASSIGNMENT ID'];
const eg = [new Array(EH.length).fill(''), new Array(EH.length).fill(''), new Array(EH.length).fill(''), EH.slice()];
const erow = new Array(EH.length).fill('');
erow[EH.indexOf('SOURCE RESPONSE ID')] = 'RESP-ALREADY-IN';
eg.push(erow);
SHEETS[TAB.SKILL_EVIDENCE] = new FakeSheet(TAB.SKILL_EVIDENCE, eg);

ok(evidenceExistsForResponseV20_2_('RESP-ALREADY-IN') === true,
   'a response already expanded into evidence is detected');
ok(evidenceExistsForResponseV20_2_('RESP-NEVER-SEEN') === false, 'a fresh response is not');
ok(evidenceExistsForResponseV20_2_('') === false, 'a blank response id never claims to be written');
ok(evidenceExistsForResponseV20_2_(null) === false, 'nor does a null one');

// ---------------------------------------------------------------- //
section('Bulk mail leaves room for safety alerts  (defect 3)');
// ---------------------------------------------------------------- //
SYSLOG = [];
QUOTA = 100;
ok(mailBudgetOkV20_2_('test', 1) === true, 'plenty of quota: bulk mail proceeds');
QUOTA = MAIL_ALERT_RESERVE_V20_2 + 1;
ok(mailBudgetOkV20_2_('test', 1) === true, 'one above the reserve: still proceeds');
QUOTA = MAIL_ALERT_RESERVE_V20_2;
ok(mailBudgetOkV20_2_('test', 1) === false, 'at the reserve: bulk mail stops');
ok(SYSLOG.some(e => e.kind === 'MAIL BUDGET EXHAUSTED'), 'and says so, once, at ERROR');
QUOTA = 0;
ok(mailBudgetOkV20_2_('test', 5) === false, 'exhausted: still refuses');
ok(MAIL_ALERT_RESERVE_V20_2 > 0, 'the reserve is a real number of recipients');

SYSLOG = []; SENT = []; QUOTA = 100;
reportBulkTruncationV20_2_('Trainee status cards', 12, ['Alvarez', 'Boyd']);
ok(SYSLOG.some(e => e.kind === 'BULK MAIL TRUNCATED'), 'a truncated run is logged');
ok(SENT.length === 1, 'and mailed to the training officer — never silent');
ok(/Alvarez/.test(SENT[0][2]) && /Boyd/.test(SENT[0][2]), 'naming exactly who did not receive theirs');
SYSLOG = []; SENT = [];
reportBulkTruncationV20_2_('Trainee status cards', 40, []);
ok(SENT.length === 0, 'a complete run sends no truncation notice');

ok(/mailBudgetOkV20_2_/.test(traineeStatusCards.toString()), 'status cards honour the budget');
ok(/mailBudgetOkV20_2_/.test(supervisorDigest.toString()), 'so does the supervisor digest');
ok(!/mailBudgetOkV20_2_/.test(sendMail.toString()),
   'but sendMail itself does NOT — the reserve exists so alerts can always send');
ok(/getRemainingDailyQuota/.test(healthCheckV20_2.toString()),
   'and the health check surfaces the remaining quota before it bites');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
