// SCEMS v20.2 — the governance gate.
//
// These run the REAL Code.gs. The only stubs are the Google platform objects
// the code calls into; every function under test is the shipped one.
//
//   node test/governance-gate.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(cond, what) {
  if (cond) { PASS++; console.log('  PASS  ' + what); }
  else { FAIL++; console.log('  FAIL  ' + what); }
}
function section(t) { console.log('\n' + t); }

// ---------------------------------------------------------------- //
//  Platform stubs
// ---------------------------------------------------------------- //
let SESSION_EMAIL = '';
let SYSLOG = [];
let ACCESS_ROWS = [];
let ALERTS = [];
let SHEETS = {};

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
        const row = sh.g[R - 1 + i] || [];
        const slice = [];
        for (let j = 0; j < NC; j++) slice.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]);
        out.push(slice);
      }
      return out;
    },
    getDisplayValues: function () {
      return this.getValues().map(r2 => r2.map(v => String(v === undefined || v === null ? '' : v)));
    },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return this; },
    setValues: function (vals) {
      vals.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return this;
    },
    setDataValidation: function () { return this; },
    setNumberFormat: function () { return this; },
    clearDataValidations: function () { return this; }
  };
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: n => SHEETS[n] || null }),
  getUi: () => ({ alert: m => { ALERTS.push(String(m)); return 'ok'; },
                  ButtonSet: { OK_CANCEL: 1, YES_NO: 2 }, Button: { OK: 1, YES: 2 } }),
  newDataValidation: () => ({ requireValueInList: function () { return this; },
                              requireDate: function () { return this; },
                              setAllowInvalid: function () { return this; },
                              setHelpText: function () { return this; },
                              build: function () { return {}; } }),
  ProtectionType: { SHEET: 'SHEET' },
  flush: () => {}
};
global.Session = {
  getActiveUser: () => ({ getEmail: () => SESSION_EMAIL }),
  getEffectiveUser: () => ({ getEmail: () => SESSION_EMAIL }),
  getScriptTimeZone: () => 'America/New_York'
};
global.Utilities = {
  getUuid: () => 'stub-uuid-0000000000000000',
  formatDate: (d, tz, f) => {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
};
global.Logger = { log: () => {} };
global.PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} })
};
global.MailApp = { sendEmail: () => {}, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [] };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));

// Capture the log and the access-log writes without changing the code paths.
const realSystemLog = systemLog_;
systemLog_ = function (lvl, kind, detail) { SYSLOG.push({ lvl, kind, detail }); };
const realAppend = appendRowsHeaderMappedV20_1_;
appendRowsHeaderMappedV20_1_ = function (tab, hr, objs) {
  if (tab === TAB.ACCESS) { ACCESS_ROWS.push(objs[0]); return { firstRow: 1, count: 1 }; }
  return realAppend.apply(null, arguments);
};

function reset() { SYSLOG = []; ACCESS_ROWS = []; ALERTS = []; SHEETS = {}; SESSION_EMAIL = ''; }

// ---------------------------------------------------------------- //
section('THE GATE refuses an unidentified session  (spec #1, check 1)');
// ---------------------------------------------------------------- //
reset();
let g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === false, 'a session with no identity is refused');
ok(/REFUSED/.test(g.message), 'the refusal is labelled REFUSED');
ok(/Nothing was written/.test(g.message), 'it states plainly that nothing was written');
ok(/Workspace/.test(g.message), 'it names the actual cause (consumer vs Workspace accounts)');
ok(SYSLOG.some(e => e.kind === 'ACCESS REFUSED'), 'the denial reaches the system log');
ok(ACCESS_ROWS.length === 1 && ACCESS_ROWS[0]['AUTHORIZED'] === 'NO',
   'the denial is written to the access log as AUTHORIZED=NO');

reset();
ok(gateV20_2_('WORK QUEUE') === false, 'gateV20_2_ returns false so void callers stop');
reset();
ok(denyV20_2_('RUN BACKUP') !== '', 'denyV20_2_ returns a message so string callers return it');

// ---------------------------------------------------------------- //
section('Unknown actions fail CLOSED, not open  (spec #1)');
// ---------------------------------------------------------------- //
reset();
SESSION_EMAIL = 'someone@example.org';
resolveAuthorizedActorV20_1_ = function () { return { ok: true, roles: ['FTO'], person: null }; };
g = requireActorV20_2_('AN ACTION NOBODY LISTED');
ok(g.ok === false, 'an action missing from ACTION_ROLES_V20_2 defaults to director-only');
ok(/Roles needed: PROGRAM_DIRECTOR/.test(g.message), 'the refusal names the role that was needed');
ok(/Roles held  : FTO/.test(g.message), 'and the role actually held');

reset();
SESSION_EMAIL = 'director@example.org';
resolveAuthorizedActorV20_1_ = function () { return { ok: true, roles: ['PROGRAM_DIRECTOR'], person: null }; };
g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === true, 'a director holding the role is granted');
ok(ACCESS_ROWS.length === 1 && ACCESS_ROWS[0]['AUTHORIZED'] === 'YES',
   'the GRANT is logged too, not only denials');

// ---------------------------------------------------------------- //
section('deciderAuthorityV20_1_ no longer trusts a typed name  (check 2)');
// ---------------------------------------------------------------- //
reset();
SESSION_EMAIL = '';
['Medical Director', 'medical director', 'Division Chief of Training', 'C. Hunt', ''].forEach(name => {
  const a = deciderAuthorityV20_1_(name);
  ok(a.allowed === false, 'typing "' + (name || '(blank)') + '" into DECIDED BY grants nothing');
});
ok(deciderAuthorityV20_1_('Medical Director').verified === false,
   'and it is never reported as a verified identity');
ok(!/leaders/.test(deciderAuthorityV20_1_.toString()),
   'the name-matching allowlist is gone from the source, not merely bypassed');

reset();
SESSION_EMAIL = 'md@example.org';
resolveAuthorizedActorV20_1_ = function () { return { ok: true, roles: ['MEDICAL_DIRECTOR'], person: null }; };
let a = deciderAuthorityV20_1_('anything at all');
ok(a.allowed === true && a.verified === true, 'a verified session still carries authority');
ok(a.email === 'md@example.org', 'and the record gets the real account, not the typed text');

// ---------------------------------------------------------------- //
section('The evidence gate on sign-off  (spec #2, check 3)');
// ---------------------------------------------------------------- //
const MHEAD = ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
  'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS',
  'LAST OUTCOME','LAST CONTEXT','SIGNED BY','SIGNED DATE','EXPIRATION','DECISION / EVIDENCE NOTE'];

function matrix(readinessByKey) {
  const g2 = [new Array(20).fill(''), new Array(20).fill(''), new Array(20).fill(''), MHEAD.slice()];
  Object.keys(readinessByKey).forEach(k => {
    const [who, sid] = k.split('|');
    const row = new Array(20).fill('');
    row[0] = who; row[9] = sid; row[6] = readinessByKey[k];
    g2.push(row);
  });
  SHEETS[TAB.SKILLS] = new FakeSheet(TAB.SKILLS, g2);
}

reset();
matrix({ 'Alvarez|IV-01': 'READY FOR VALIDATION', 'Boyd|IV-01': 'IN PROGRESS' });
ok(skillReadinessNowV20_2_('Alvarez', 'IV-01') === 'READY FOR VALIDATION',
   'readiness is read straight off the matrix by header, not by column number');
ok(skillReadinessNowV20_2_('Nobody', 'IV-01') === '', 'an absent trainee reads as empty, not as ready');

ok(evidenceGateProblemV20_2_('Approve sign-off', 'Alvarez', 'IV-01', 'looks good') === '',
   'a READY skill approves with no obstacle');
let p = evidenceGateProblemV20_2_('Approve sign-off', 'Boyd', 'IV-01', 'looks good');
ok(p !== '', 'a skill that is only IN PROGRESS is refused');
ok(/IN PROGRESS/.test(p), 'and the refusal quotes what the matrix actually says');
ok(evidenceGateProblemV20_2_('Approve sign-off', 'Ghost', 'IV-01', 'x') !== '',
   'a skill that is not on the matrix at all is refused');
ok(evidenceGateProblemV20_2_('Approve sign-off', 'Boyd', 'IV-01',
     OVERRIDE_MARKER_V20_2 + ' witnessed on a real call') === '',
   'an explicit typed override is honoured — judgement is still allowed');
['Return for more evidence', 'Revoke sign-off'].forEach(d => {
  ok(evidenceGateProblemV20_2_(d, 'Boyd', 'IV-01', 'x') === '',
     '"' + d + '" is unaffected: the gate only guards approvals');
});

// ---------------------------------------------------------------- //
section('No canned assertions  (spec #3, check 4)');
// ---------------------------------------------------------------- //
const SRC = fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8');
const canned = 'Evidence thresholds met, FTO recommendation accepted';
const assigned = SRC.split('\n').filter(l =>
  l.includes(canned) && /rationale\s*=/.test(l));
ok(assigned.length === 0, 'the canned rationale is assigned to a rationale variable nowhere');
ok(SRC.includes('approvalRationalePromptV20_2_'), 'an approval now asks for a reason instead');

// ---------------------------------------------------------------- //
section('Retired tools write nothing  (spec #4, checks 5 and 6)');
// ---------------------------------------------------------------- //
reset();
let out = approveAllReadyV20_1();
ok(/RETIRED/.test(out), 'approveAllReadyV20_1 refuses');
ok(/Work my queue/.test(out), 'and names the supported path');
ok(SYSLOG.some(e => e.kind === 'RETIRED FUNCTION CALLED'), 'the call is logged');
ok(!/appendRows|setValue|recordDecisionForRow/.test(approveAllReadyV20_1.toString()),
   'its body contains no write of any kind');

reset();
out = simplifyFlagsV20_1();
ok(/RETIRED/.test(out), 'simplifyFlagsV20_1 refuses');
ok(/acceptFlagV20_2/.test(out) || /WORK_AUDIT_FLAGS/.test(out),
   'and points at the honest replacement');
ok(typeof WORK_AUDIT_FLAGS === 'function', 'WORK_AUDIT_FLAGS is the guided path');
ok(/fix the condition|cannot delete/i.test(WORK_AUDIT_FLAGS.toString()),
   'WORK_AUDIT_FLAGS explains that flags are formulas');
ok(/flagHasOwnershipV20_2_/.test(healthCheckV20_2.toString()),
   'health check distinguishes owned vs unowned flags');
ok(!/setFormula|hideSheet/.test(simplifyFlagsV20_1.toString()),
   'it can no longer rewrite a detection formula or hide the tab');

ok(!/ev\.sheet\.getRange/.test(fixAllFlagsNowV20_1.toString()),
   'fixAllFlagsNowV20_1 no longer writes to tab 02 (check 6)');
ok(/au\.getRange\(5 \+ i, 11\)/.test(fixAllFlagsNowV20_1.toString()),
   'but the phase-mismatch acknowledgement is kept');

// ---------------------------------------------------------------- //
section('An accepted flag stays outstanding  (spec #5, check 7)');
// ---------------------------------------------------------------- //
reset();
const ag = [];
for (let i = 0; i < 60; i++) ag.push(new Array(11).fill(''));
ag[3] = ['', 'NO NARRATIVE', 'STALE EVAL', 'OVERDUE', 'SILENT RECORD', 'NO SKILLS', 'PHASE MISMATCH'];
ag[4][0] = 'Alvarez'; ag[4][1] = 'FLAG';
ag[5][0] = 'Boyd';    ag[5][4] = 'FLAG';
SHEETS[TAB.AUDIT] = new FakeSheet(TAB.AUDIT, ag);

let burning = burningFlagsV20_2_();
ok(burning.length === 2, 'both burning flags are found');
ok(burning[0].trainee === 'Alvarez' && burning[0].flagType === 'NO NARRATIVE',
   'each carries the trainee and the flag type it belongs to');
ok(FLAG_ACCEPT_STATUS_V20_2 === 'Accepted', 'acceptance has its own status value');
ok(FLAG_ACCEPT_DAYS_V20_2 > 0, 'and acceptance expires rather than lasting forever');
// Acceptance writes to the review log only; it must not touch the FLAG cell.
ok(!/getRange\(5 \+ [a-z]+, 2/.test(acceptFlagV20_2.toString()) &&
   !/setFormula/.test(acceptFlagV20_2.toString()),
   'acceptFlagV20_2 never writes to the flag matrix or a detection formula');
burning = burningFlagsV20_2_();
ok(burning.length === 2, 'so the flag is still counted as outstanding afterwards');

// ---------------------------------------------------------------- //
section('Nothing in this release deletes a row  (check 9)');
// ---------------------------------------------------------------- //
const NEW_FNS = ['requireActorV20_2_', 'denyV20_2_', 'gateV20_2_', 'logAccessV20_2_',
  'skillReadinessNowV20_2_', 'evidenceGateProblemV20_2_', 'approvalRationalePromptV20_2_',
  'acceptFlagV20_2', 'protectRecordTabsV20_2', 'healthCheckV20_2',
  'approveAllReadyV20_1', 'simplifyFlagsV20_1'];
NEW_FNS.forEach(n => {
  ok(!/deleteRow|deleteRows|deleteSheet|clearContents/.test(eval(n).toString()),
     n + ' deletes nothing');
});

// ---------------------------------------------------------------- //
console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
