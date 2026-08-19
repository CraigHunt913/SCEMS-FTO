// SCEMS v20.2 — post-upgrade sheet repair.
//
// The live system has 24 queue rows reading "CANCELLED : CRITERIA CHANGED".
// v20.1's sweep cancelled every OPEN row whose skill was absent from the
// matrix, and a rebuild that produced nothing left the matrix empty — so one
// bad rebuild cancelled the whole pending queue. v20.2 prevents a recurrence;
// repairCancelledQueueRowsV20_2 undoes what already happened.
//
//   node test/sheet-repair.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SYSLOG = [], SHEETS = {}, GATE = true;

function FakeSheet(name, grid) { this.name = name; this.g = grid; this.hidden = false; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  // scan every row: the real getLastColumn is the widest used column, and a
  // fixture whose padding rows are empty must not report a width of 1
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1);
};
FakeSheet.prototype.getMaxRows = function () { return this.g.length; };
FakeSheet.prototype.isSheetHidden = function () { return this.hidden; };
FakeSheet.prototype.hideSheet = function () { this.hidden = true; return this; };
FakeSheet.prototype.showSheet = function () { this.hidden = false; return this; };
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

let SHEET_ORDER = [];
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: n => SHEETS[n] || null,
    getSheets: () => SHEET_ORDER.map(n => SHEETS[n]).filter(Boolean),
    setActiveSheet: function (sh) { this._active = sh; return sh; },
    moveActiveSheet: function (pos) {
      const nm = this._active.getName();
      SHEET_ORDER = SHEET_ORDER.filter(x => x !== nm);
      SHEET_ORDER.splice(pos - 1, 0, nm);
    },
    getId: () => 'SS'
  }),
  getUi: () => ({ alert: () => 'ok', ButtonSet: {}, Button: {} }),
  newDataValidation: () => ({ requireValueInList: function () { return this; }, requireDate: function () { return this; },
    setAllowInvalid: function () { return this; }, setHelpText: function () { return this; }, build: function () { return {}; } }),
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }),
                   getEffectiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }),
                   getScriptTimeZone: () => 'America/New_York' };
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-19' };
global.Logger = { log: () => {} };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) };
global.MailApp = { sendEmail: () => {}, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [] };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (l, k, d) { SYSLOG.push({ l, k, d }); };
gateV20_2_ = function () { return GATE; };

const QH = ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
  'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'];
const MH = ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
  'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS',
  'LAST OUTCOME','LAST CONTEXT','SIGNED BY','SIGNED DATE','EXPIRATION','DECISION / EVIDENCE NOTE'];

function build(queueRows, matrixRows) {
  const qg = [[], [], [], QH.slice()];
  queueRows.forEach(q => {
    const r = new Array(QH.length).fill('');
    r[1] = q.trainee; r[2] = q.skillId; r[4] = q.skill || 'Some skill'; r[11] = q.status;
    qg.push(r);
  });
  const mg = [[], [], [], MH.slice()];
  matrixRows.forEach(m => {
    const r = new Array(MH.length).fill('');
    r[0] = m.trainee; r[9] = m.skillId; r[6] = m.readiness;
    mg.push(r);
  });
  SHEETS = {};
  SHEETS[TAB.SKILL_VALIDATION] = new FakeSheet(TAB.SKILL_VALIDATION, qg);
  SHEETS[TAB.SKILLS] = new FakeSheet(TAB.SKILLS, mg);
  SYSLOG = [];
}
function statusAt(i) { return SHEETS[TAB.SKILL_VALIDATION].g[i + 4][11]; }

const C = 'CANCELLED : CRITERIA CHANGED';

// ---------------------------------------------------------------- //
section('A cancelled request whose skill is ready again comes back');
// ---------------------------------------------------------------- //
build(
  [{trainee:'Alvarez', skillId:'SK-1', status:C}],
  [{trainee:'Alvarez', skillId:'SK-1', readiness:'READY FOR VALIDATION'}]
);
let out = repairCancelledQueueRowsV20_2();
ok(statusAt(0) === 'OPEN', 'the row is OPEN again');
ok(/Re-opened               : 1/.test(out), 'and the report says so');
ok(SYSLOG.some(e => e.k === 'QUEUE ROW RE-OPENED'), 'each re-open is logged individually');
ok(/matrix now reads READY FOR VALIDATION/.test(SYSLOG.find(e => e.k === 'QUEUE ROW RE-OPENED').d),
   'with the readiness that justified it');

['SIGNED OFF - REVIEW REQUIRED', 'LEGACY SIGN-OFF REVIEW REQUIRED'].forEach(rd => {
  build([{trainee:'A', skillId:'SK-1', status:C}], [{trainee:'A', skillId:'SK-1', readiness:rd}]);
  repairCancelledQueueRowsV20_2();
  ok(statusAt(0) === 'OPEN', '"' + rd + '" also qualifies for re-opening');
});

// ---------------------------------------------------------------- //
section('Anything the matrix does not support is left exactly alone');
// ---------------------------------------------------------------- //
['IN PROGRESS', 'NOT STARTED', 'SIGNED OFF', ''].forEach(rd => {
  build([{trainee:'A', skillId:'SK-1', status:C}], [{trainee:'A', skillId:'SK-1', readiness:rd}]);
  repairCancelledQueueRowsV20_2();
  ok(statusAt(0) === C, '"' + (rd || 'blank') + '" is not re-opened');
});

build([{trainee:'A', skillId:'SK-1', status:C}], []);   // not on the matrix at all
out = repairCancelledQueueRowsV20_2();
ok(statusAt(0) === C, 'a skill absent from the matrix is not re-opened');
ok(/not on the matrix/.test(out), 'and the report says why');

// ---------------------------------------------------------------- //
section('It never creates a second ask for the same skill');
// ---------------------------------------------------------------- //
build(
  [{trainee:'A', skillId:'SK-1', status:'OPEN'},
   {trainee:'A', skillId:'SK-1', status:C}],
  [{trainee:'A', skillId:'SK-1', readiness:'READY FOR VALIDATION'}]
);
out = repairCancelledQueueRowsV20_2();
ok(statusAt(1) === C, 'a duplicate is left cancelled because one is already open');
ok(/already open elsewhere/.test(out), 'and the report explains that');

build(
  [{trainee:'A', skillId:'SK-1', status:C},
   {trainee:'A', skillId:'SK-1', status:C}],
  [{trainee:'A', skillId:'SK-1', readiness:'READY FOR VALIDATION'}]
);
repairCancelledQueueRowsV20_2();
ok(statusAt(0) === 'OPEN' && statusAt(1) === C,
   'two cancelled duplicates yield exactly one re-opened row, not two');

// ---------------------------------------------------------------- //
section('Other statuses and other records are untouched');
// ---------------------------------------------------------------- //
build(
  [{trainee:'A', skillId:'SK-1', status:'RECORDED'},
   {trainee:'B', skillId:'SK-2', status:'OPEN'},
   {trainee:'C', skillId:'SK-3', status:'CANCELLED : TRAINEE CLOSED'},
   {trainee:'D', skillId:'SK-4', status:C}],
  [{trainee:'A', skillId:'SK-1', readiness:'READY FOR VALIDATION'},
   {trainee:'B', skillId:'SK-2', readiness:'READY FOR VALIDATION'},
   {trainee:'C', skillId:'SK-3', readiness:'READY FOR VALIDATION'},
   {trainee:'D', skillId:'SK-4', readiness:'READY FOR VALIDATION'}]
);
repairCancelledQueueRowsV20_2();
ok(statusAt(0) === 'RECORDED', 'a RECORDED decision is not disturbed');
ok(statusAt(1) === 'OPEN', 'an already-open row is unchanged');
ok(statusAt(2) === 'CANCELLED : TRAINEE CLOSED',
   'a row cancelled because the trainee was closed stays cancelled — different reason');
ok(statusAt(3) === 'OPEN', 'only the sweep-cancelled row is re-opened');

const src = repairCancelledQueueRowsV20_2.toString();
ok(!/deleteRow|deleteRows|clearContent/.test(src), 'the repair deletes nothing');
ok((src.match(/setValue\(/g) || []).length === 1,
   'and writes exactly one cell per row — the status, nothing else');

// ---------------------------------------------------------------- //
section('The gate still guards it');
// ---------------------------------------------------------------- //
GATE = false;
build([{trainee:'A', skillId:'SK-1', status:C}], [{trainee:'A', skillId:'SK-1', readiness:'READY FOR VALIDATION'}]);
repairCancelledQueueRowsV20_2();
ok(statusAt(0) === C, 'an unauthorized caller changes nothing');
GATE = true;

// ---------------------------------------------------------------- //
section('Tab tidy-up hides machinery and keeps the daily tabs');
// ---------------------------------------------------------------- //
const daily = dailyTabsV20_2_();
const order = tabOrderV20_2_();
ok(daily.indexOf(TAB.SKILL_VALIDATION) >= 0, 'the sign-off queue stays visible');
ok(daily.indexOf(TAB.MASTER) >= 0, 'the trainee master stays visible');
ok(daily.indexOf(TAB.SKILLS) >= 0, 'the skills matrix stays visible');
ok(daily.indexOf(TAB.AUDIT) >= 0, 'the audit tab stays visible — flags matter');
[TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.LOG, TAB.LEDGER, TAB.ACCESS, TAB.REGISTRY].forEach(t => {
  ok(daily.indexOf(t) < 0, '"' + t + '" is machinery and gets hidden');
});
ok(order.indexOf('HOME') === 0, 'HOME sorts first');
ok(order.indexOf(TAB.SKILL_VALIDATION) < order.indexOf(TAB.LOG),
   'what you use sorts before what you never open');
ok(new Set(order).size === order.length, 'the order list has no duplicates');
daily.forEach(t => ok(order.indexOf(t) >= 0, '"' + t + '" appears in the order list'));

const tsrc = organizeTabsV20_2.toString();
ok(!/deleteSheet|setName/.test(tsrc), 'organizing never deletes or renames a tab');
ok(/showSheet\(\)/.test(tsrc), 'and it can only hide what it can also show again');
ok(!/deleteSheet/.test(showAllTabsV20_2.toString()), 'showAllTabsV20_2 is purely restorative');

// ---------------------------------------------------------------- //
section('FIX_MY_SHEETS runs the repairs in dependency order');
// ---------------------------------------------------------------- //
const f = FIX_MY_SHEETS.toString();
const steps = ['rebuildSkillMatrixV19_', 'repairCancelledQueueRowsV20_2',
               'makeQueueReadableV20_1', 'organizeTabsV20_2', 'healthCheckV20_2'];
steps.forEach(n => ok(f.indexOf(n) > 0, 'it calls ' + n));
const idx = steps.map(n => f.indexOf(n));
ok(idx.every((v, i) => i === 0 || v > idx[i - 1]),
   'matrix before repair before layout before tabs — each needs the one before it');
ok(!/deleteRow|deleteSheet|clearContent/.test(f), 'and the whole run deletes nothing');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
