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

// ---------------------------------------------------------------- //
section('Catching up the responses that arrived while nothing listened');
// ---------------------------------------------------------------- //
// A form with no submit trigger does not lose its answers - they land in the
// response tab and sit there. Twelve did. Everything needed to turn one into
// evidence rows already existed; nothing ever walked the list and called it.

let REPLAYED = [], FAIL_ON = {};
const realReplay = replayResponseV20_1;
replayResponseV20_1 = function (formId, rid) {
  if (FAIL_ON[rid]) throw new Error(FAIL_ON[rid]);
  REPLAYED.push(rid);
  return 'ok';
};

function FakeResponse(id) { this.id = id; }
FakeResponse.prototype.getId = function () { return this.id; };
function FakeF(title, ids) { this.title = title; this.ids = ids; }
FakeF.prototype.getTitle = function () { return this.title; };
FakeF.prototype.getResponses = function () {
  return this.ids.map(i => new FakeResponse(i)); };

let FORMS_BY_ID = {};
global.FormApp = { openById: id => {
  if (!FORMS_BY_ID[id]) throw new Error('No item with the given ID could be found');
  return FORMS_BY_ID[id];
} };

const ownedTitle = formTitlesOwnedByFormTriggersV20_1_()[0];
storedFormIdsV20_1_ = function () { return ['F1']; };
FORMS_BY_ID = { F1: new FakeF(ownedTitle, ['r1', 'r2', 'r3']) };

// the ledger knows about r1 only
readTableV20_1_ = function (name) {
  if (name === TAB.LEDGER) {
    return { ok: true, col: { 'RESPONSE ID': 0 }, rows: [['r1']] };
  }
  return { ok: false, col: {}, rows: [] };
};

// preview writes nothing
REPLAYED = [];
let prev = catchUpUnprocessedPreview();
ok(REPLAYED.length === 0, 'the preview replays nothing at all');
ok(/PREVIEW, nothing written/.test(prev), 'and says so at the top');
ok(/2 response\(s\) would be replayed/.test(prev), 'while counting what is waiting');
ok(/catchUpUnprocessed\(\)/.test(prev), 'and naming the function that does it');

// the real thing replays only what the ledger has never seen
REPLAYED = [];
let out = catchUpUnprocessed();
ok(REPLAYED.length === 2, 'it replays only the responses the ledger has not seen');
ok(REPLAYED.indexOf('r1') < 0, 'never one that has already been through');
ok(REPLAYED.indexOf('r2') >= 0 && REPLAYED.indexOf('r3') >= 0, 'and both of the ones waiting');
ok(/2 of 2 replayed/.test(out), 'the report says how many of how many');

// running it again does nothing, because now they are all in the ledger
readTableV20_1_ = function (name) {
  if (name === TAB.LEDGER) {
    return { ok: true, col: { 'RESPONSE ID': 0 }, rows: [['r1'], ['r2'], ['r3']] };
  }
  return { ok: false, col: {}, rows: [] };
};
REPLAYED = [];
out = catchUpUnprocessed();
ok(REPLAYED.length === 0, 'a second run replays nothing');
ok(/Nothing is waiting/.test(out), 'and says everything has been through');

// one bad response must not stop the others
readTableV20_1_ = function (name) {
  if (name === TAB.LEDGER) return { ok: true, col: { 'RESPONSE ID': 0 }, rows: [] };
  return { ok: false, col: {}, rows: [] };
};
REPLAYED = []; FAIL_ON = { r2: 'that trainee is not on the master' };
out = catchUpUnprocessed();
ok(REPLAYED.length === 2 && REPLAYED.indexOf('r2') < 0,
   'the two good ones go through and the bad one does not stop them');
ok(/NOT REPLAYED  \(1\)/.test(out), 'the failure is reported');
ok(/not on the master/.test(out), 'with the reason the handler gave');
ok(/still in their response tab/.test(out), 'and says the response is not lost');
ok(/retries only these/.test(out), 'and that running it again picks up just those');
FAIL_ON = {};

// a form nobody owns is left alone: those are somebody else's ingestion
FORMS_BY_ID = { F1: new FakeF('Some Form Nothing Owns', ['x1']) };
REPLAYED = [];
out = catchUpUnprocessed();
ok(REPLAYED.length === 0, 'a form not owned by a trigger is not replayed through this');

// an unreadable form is named, not swallowed
storedFormIdsV20_1_ = function () { return ['GONE']; };
FORMS_BY_ID = {};
out = catchUpUnprocessed();
ok(/UNREADABLE form GONE/.test(out), 'a form it cannot open is named in the report');

replayResponseV20_1 = realReplay;

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
