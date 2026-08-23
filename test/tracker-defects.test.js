// Four defects found by reading the tracker against the live spreadsheet's
// real header rows, and what each fix has to hold true.
//
// Three of the four were silent by construction: a write to the wrong row that
// swallowed its own failure, a warning whose delivery failure was swallowed,
// and a flag on a form that nothing anywhere read. Silence is the common
// thread, so every test here checks that something is now SAID.
//
//   node test/tracker-defects.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SYSLOG = [], SENT = [], MAIL_THROWS = false, SHEETS = {}, UI_ALERTS = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.getMaxRows = function () { return this.g.length; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    getValues: function () {
      const o = [];
      for (let i = 0; i < NR; i++) {
        const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]);
        o.push(s);
      }
      return o;
    },
    setValues: function (vs) {
      vs.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return api;
    }
  };
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat','setFontSize',
   'setFontFamily','setVerticalAlignment','setHorizontalAlignment','clearContent','merge',
   'setFontStyle','createFilter'].forEach(m => api[m] = () => api);
  return api;
};

let SHEET_LIST = [];
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: n => SHEETS[n] || null,
    getSheets: () => SHEET_LIST.map(n => SHEETS[n] || new FakeSheet(n, [])),
    toast: () => {}
  }),
  getUi: () => ({ alert: m => { UI_ALERTS.push(m); return 'ok'; }, ButtonSet: {}, Button: {} }),
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => 'chief@example.org' }),
                   getEffectiveUser: () => ({ getEmail: () => 'chief@example.org' }),
                   getScriptTimeZone: () => 'America/New_York' };
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-22' };
global.Logger = { log: () => {} };
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) };
global.MailApp = {
  sendEmail: function () {
    if (MAIL_THROWS) throw new Error('Service invoked too many times for one day: email.');
    SENT.push([].slice.call(arguments));
  },
  getRemainingDailyQuota: () => 100
};
global.ScriptApp = { getProjectTriggers: () => [] };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (lvl, kind, detail) { SYSLOG.push({ lvl, kind, detail }); };
sendMail = function () { SENT.push([].slice.call(arguments)); };

function reset() { SYSLOG = []; SENT = []; UI_ALERTS = []; SHEETS = {}; SHEET_LIST = []; MAIL_THROWS = false; }
function tab(name, headers, rows) {
  const g = [[], [], []];
  g.push(headers.slice());
  (rows || []).forEach(r => g.push(r.slice()));
  SHEETS[name] = new FakeSheet(name, g);
  SHEET_LIST.push(name);
  return SHEETS[name];
}

// ---------------------------------------------------------------- //
section('A decision is stamped on the right row, or on no row at all');
// ---------------------------------------------------------------- //
// It used to be dec.getRange(dec.getLastRow(), 9).setValue(phase) inside an
// empty catch. The last row is only the right row if nothing else appended in
// between, and this runs from a form-submit trigger where two responses
// arriving together is ordinary. When it was wrong it put one trainee's phase
// on another trainee's decision, and said nothing either way.
reset();
tab(TAB.DECISIONS, ['FILED', 'TRAINEE', 'ITEM', 'DECISION', 'PHASE'], [
  ['2026-08-01', 'Jamie Rivers', 'Advancement review', '', ''],
  ['2026-08-02', 'Alex Bramble', 'NRT outcome', '', '']
]);
let out = stampDecisionPhaseV20_6_('Jamie Rivers', 'Phase 3');
ok(out === 'stamped', 'it writes when it can find the person');
const dt = SHEETS[TAB.DECISIONS].g;
ok(dt[4][4] === 'Phase 3', "and writes onto JAMIE's row, not the last one");
ok(dt[5][4] === '', "leaving the row that happens to be last alone");
ok(SYSLOG.length === 0, 'and says nothing, because nothing went wrong');

reset();
tab(TAB.DECISIONS, ['FILED', 'TRAINEE', 'ITEM', 'PHASE'], [['2026-08-01', 'Alex Bramble', 'x', '']]);
out = stampDecisionPhaseV20_6_('Jamie Rivers', 'Phase 3');
ok(out === 'no row', 'a person with no decision row is refused');
ok(SHEETS[TAB.DECISIONS].g[4][3] === '', 'nothing is written to somebody else');
ok(SYSLOG.some(l => /NOT STAMPED/.test(l.kind)), 'and the refusal is logged, not swallowed');

reset();
tab(TAB.DECISIONS, ['FILED', 'TRAINEE', 'ITEM'], [['2026-08-01', 'Jamie Rivers', 'x']]);
out = stampDecisionPhaseV20_6_('Jamie Rivers', 'Phase 3');
ok(out === 'no column', 'a missing PHASE column is refused');
ok(SYSLOG.some(l => /no PHASE column/.test(l.detail)),
   'named exactly, rather than written to whatever column 9 happens to be');

reset();
out = stampDecisionPhaseV20_6_('Jamie Rivers', 'Phase 3');
ok(out === 'no tab', 'and a missing tab is refused');
ok(SYSLOG.some(l => /NOT STAMPED/.test(l.kind)), 'with a line in the log saying so');

// ---------------------------------------------------------------- //
section('The warning about a truncated send cannot itself go quiet');
// ---------------------------------------------------------------- //
// reportBulkTruncationV20_2_ exists to tell you a bulk send stopped early
// because the daily quota ran low. Its own notification was a MailApp call in
// an empty catch — so the single most likely thing to stop it was the exact
// condition it reports.
reset();
MAIL_THROWS = true;
reportBulkTruncationV20_2_('the weekly digest', 40, ['a@example.org', 'b@example.org']);
ok(SYSLOG.some(l => l.kind === 'BULK MAIL TRUNCATED'), 'the truncation itself is logged');
ok(SYSLOG.some(l => l.kind === 'TRUNCATION ALERT UNDELIVERED'),
   'and so is the fact that the warning about it never arrived');
ok(SYSLOG.some(l => /quota|too many times/i.test(l.detail)),
   'with the reason it did not arrive');

reset();
reportBulkTruncationV20_2_('the weekly digest', 40, ['a@example.org']);
ok(!SYSLOG.some(l => l.kind === 'TRUNCATION ALERT UNDELIVERED'),
   'and when it does arrive, nothing extra is said');

// ---------------------------------------------------------------- //
section('Every flag on the shift evaluation now reaches somebody');
// ---------------------------------------------------------------- //
// 02 FTO SHIFT EVAL RAW column 28 is "Documentation Issue". EV went CS:27
// straight to NRT:29. An FTO ticked the box and the system did nothing at
// all: no mail, no queue row, no audit entry. It looked like it worked.
ok(EV.DOCISSUE === 28, 'the column is mapped');
ok(EV.CS === 27 && EV.NRT === 29, 'between the two it used to be skipped between');

reset();
const ev = new Array(35).fill('');
ev[EV.FTO] = 'Dana Whitlock';
ev[EV.TRAINEE] = 'Jamie Rivers';
ev[EV.SHIFTDATE] = '2026-08-20';
ev[EV.DOCISSUE] = 'Yes';
ev[EV.RFDETAIL] = 'Three ePCRs left unsigned at end of shift.';
evalAlerts(ev);
ok(SENT.length === 1, 'ticking it now sends exactly one message');
ok(/Documentation Issue Reported/.test(SENT[0][1]), 'which says what it is about');
ok(/Jamie Rivers/.test(SENT[0][1]), 'and who');
ok(/Three ePCRs left unsigned/.test(SENT[0][2]), 'and carries the detail the FTO typed');
ok(SENT[0][0] === CONFIG.TCO_EMAIL,
   'to the training officer only — a documentation problem is a training matter, not a safety alert');

reset();
const clean = new Array(35).fill('');
clean[EV.FTO] = 'Dana Whitlock'; clean[EV.TRAINEE] = 'Jamie Rivers'; clean[EV.SHIFTDATE] = '2026-08-20';
evalAlerts(clean);
ok(SENT.length === 0, 'and an evaluation with nothing flagged still sends nothing');

// ---------------------------------------------------------------- //
section('A tab this code names but cannot find is reported, not shrugged at');
// ---------------------------------------------------------------- //
// getSheetByName is exact. A constant reading '03 SELF-REFLECTION RAW'
// against a tab called '03 TRAINEE SELF-REFLECTION RAW' returns null, and
// whatever asked either does nothing or says "not present yet" — which reads
// like a state rather than a fault.
reset();
Object.keys(TAB).forEach(k => { if (TAB[k] !== TAB.REFLECT) tab(TAB[k], ['A'], []); });
tab('03 TRAINEE SELF-REFLECTION RAW', ['Timestamp', 'Trainee'], []);
tab('ZZ SOMETHING NOBODY ASKS FOR', ['A'], []);
const report = tabNameCheck();
ok(/READ ONLY/.test(report), 'it says up front that it changed nothing');
ok(/NOT FOUND *: *[1-9]/.test(report), 'it counts what it could not find');
ok(report.indexOf(TAB.REFLECT) >= 0, 'names the constant that has no tab');
ok(/closest *: 03 TRAINEE SELF-REFLECTION RAW/.test(report),
   'and the tab that is almost certainly meant');
ok(/ZZ SOMETHING NOBODY ASKS FOR/.test(report),
   'and lists tabs nothing in the code asks for, which is the other half of the answer');

reset();
// every name the check asks for, not only the ones on TAB
Object.keys(TAB).forEach(k => tab(TAB[k], ['A'], []));
[TAB_CONSOLE_V20_3, 'HOME'].forEach(n => {
  if (n && !SHEETS[n]) tab(n, ['A'], []);
});
const clean2 = tabNameCheck();
ok(/Every tab this code names is there under exactly that name/.test(clean2),
   'and when everything lines up it says so plainly');

// ---------------------------------------------------------------- //
section('One deleted row, eighty-eight broken cells, and the cell that did it');
// ---------------------------------------------------------------- //
// 06 PHASE - STATUS ENGINE column A is the key: all twenty-three columns
// beside it open with IF($A{row}="","", ...). A row was deleted from the
// trainee master and Google rewrote one formula to =IF(#REF!="","",#REF!).
// That one cell takes out its whole row, on that tab and on the seven built
// from it. Nothing anywhere says a name is missing.
FakeSheet.prototype.getFormulas = function (r, c, nr, nc) { return this.f || []; };
FakeSheet.prototype.setFormula = function () { return this; };

function engineTab(formulas) {
  const g = [[], [], [], ['TRAINEE']];
  formulas.forEach(() => g.push(['']));
  const sh = new FakeSheet(TAB.ENGINE, g);
  sh.getRange = function (r, c, nr, nc) {
    const api = {
      getFormulas: () => formulas.slice(r - 5, (r - 5) + (nr || 1)).map(f => [f]),
      setFormula: v => { formulas[r - 5] = v; return api; },
      getValue: () => '', setValue: () => api, getValues: () => [[]], setValues: () => api
    };
    ['setFontWeight','setBackground','setFontColor'].forEach(m => api[m] = () => api);
    return api;
  };
  sh.getLastRow = () => 4 + formulas.length;
  SHEETS[TAB.ENGINE] = sh;
  SHEET_LIST.push(TAB.ENGINE);
  return formulas;
}
const good = n => "=IF('01 TRAINEE MASTER'!A" + n + '="","",\'01 TRAINEE MASTER\'!A' + n + ')';

reset();
tab(TAB.MASTER, ['TRAINEE', 'TRAINEE EMAIL', 'SET STATUS'], [
  ['Anicia Scipp', 'a@example.org', 'Cleared'],
  ['', 'nobody@example.org', 'Cleared to Independent Practice'],
  ['Jamie More', 'j@example.org', 'Cleared']
]);
let F = engineTab([good(5), good(6), '=IF(#REF!="","",#REF!)', good(8), good(10)]);

let health = engineHealthCheck();
ok(/READ ONLY/.test(health), 'the health check says it changed nothing');
ok(/broken beyond repair \(#REF!\) : 1/.test(health), 'it finds the one broken cell');
ok(/A7 reads #REF!/.test(health), 'and names it exactly');
ok(/A row was deleted from the master/.test(health), 'and says what did it');
ok(/pointing at a different row  : 1/.test(health), 'it also finds the crossed one');
ok(/A9 reads master row 10/.test(health), 'and says which row it is showing instead');
ok(/1 row\(s\) hold data and no name/.test(health),
   'and separately, the master row that has a clearance and no name');
ok(/invisible, which looks the same from outside/.test(health),
   'explaining why an unnamed row is not the same as a missing one');
ok(/Putting a name back is a change to a personnel record/.test(health),
   'and refusing to do anything about that one');

const before = F.slice();
const pv = previewEngineRepairV20_6();
ok(/NOTHING WAS WRITTEN/.test(pv), 'the repair previews first');
ok(/A7/.test(pv) && /A9/.test(pv), 'naming both cells');
ok(/was :/.test(pv) && /now :/.test(pv), 'with the before and the after of each');
ok(JSON.stringify(F) === JSON.stringify(before), 'and the sheet is untouched');

ok(/NOTHING WAS WRITTEN/.test(applyEngineRepairV20_6('nope')),
   'a wrong token writes nothing either');
ok(JSON.stringify(F) === JSON.stringify(before), 'still untouched');

// the right token is still not enough on its own
ok(/not authorised/i.test(applyEngineRepairV20_6('REPAIR THE ENGINE KEY COLUMN')),
   'the right token alone is refused — the authorisation gate is the other half');
ok(JSON.stringify(F) === JSON.stringify(before), 'and nothing was written');

const realGate = gateV20_2_;
gateV20_2_ = function () { return true; };
const done = applyEngineRepairV20_6('REPAIR THE ENGINE KEY COLUMN');
gateV20_2_ = realGate;
ok(/DONE\. 2 cell\(s\) repaired/.test(done), 'with both, it repairs both cells');
ok(F[2] === good(7), 'the broken cell now reads its own row of the master');
ok(F[4] === good(9), 'and so does the crossed one');
ok(F[0] === good(5) && F[1] === good(6) && F[3] === good(8),
   'and the cells that were already right were not touched');
ok(SYSLOG.some(l => l.kind === 'ENGINE KEY COLUMN REPAIRED'), 'the repair is logged');

ok(/Nothing to repair/.test(previewEngineRepairV20_6()),
   'and running it again finds nothing to do');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
