// SCEMS v20.2 — the stale-queue sweep.
//
// The defect: refreshSkillValidationQueueV19_ cancelled every OPEN queue row
// whose (trainee, skill) key was absent from the matrix. Its own caller,
// rebuildSkillMatrixV19_, cleared the matrix and then wrote rows only
// `if (output.length)`. Any rebuild that produced nothing therefore cancelled
// the entire pending sign-off queue — in bulk, unlogged, unattributed, on a
// schedule, including rows a leader was part-way through deciding.
//
// These tests drive the real sweep against a fake queue and read the cells
// afterwards, so they prove behaviour rather than the shape of the source.
//
//   node test/queue-sweep.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SYSLOG = [], SENT = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 1; };
FakeSheet.prototype.getMaxRows = function () { return this.g.length; };
FakeSheet.prototype.getRange = function (r, c) {
  const sh = this, R = r, C = c;
  return {
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return this; }
  };
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => null }),
  getUi: () => ({ alert: () => 'ok', ButtonSet: {}, Button: {} }),
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => 'America/New_York' };
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-18' };
global.Logger = { log: () => {} };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) };
global.MailApp = { sendEmail: function () { SENT.push([].slice.call(arguments)); }, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [] };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (lvl, kind, detail) { SYSLOG.push({ lvl, kind, detail }); };
sendMail = function () { SENT.push([].slice.call(arguments)); };

// Build a queue of N open rows starting at sheet row 5.
// Column 7 (index 6) is DECISION; column 12 (index 11) is RECORD STATUS.
function buildQueue(n, opts) {
  opts = opts || {};
  const g = [[], [], [], []];
  const open = {};
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(13).fill('');
    row[1] = 'Trainee' + i;            // TRAINEE
    row[2] = 'SK-' + i;                // SKILL ID
    row[6] = (opts.draftRows || []).indexOf(i) >= 0 ? 'Approve sign-off' : '';
    row[11] = 'OPEN';
    rows.push(row);
    g.push(row.slice());
    open['Trainee' + i + '||SK-' + i] = i + 5;
  }
  return { sheet: new FakeSheet('20 SKILL VALIDATION QUEUE', g), open: open, rows: rows };
}
function statusAt(q, i) { return q.sheet.g[i + 4][11]; }
function cancelledCount(q, n) {
  let c = 0;
  for (let i = 0; i < n; i++) if (String(statusAt(q, i)).indexOf('CANCELLED') === 0) c++;
  return c;
}
function reset() { SYSLOG = []; SENT = []; }

// ---------------------------------------------------------------- //
section('An empty matrix means "cannot tell", never "nothing qualifies"');
// ---------------------------------------------------------------- //
reset();
let q = buildQueue(6);
let n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, {}, 0, q.rows);
ok(n === 0, 'a matrix with zero rows cancels nothing');
ok(cancelledCount(q, 6) === 0, 'all six requests are still OPEN');
ok(SYSLOG.some(e => e.kind === 'QUEUE SWEEP REFUSED' && e.lvl === 'ERROR'),
   'and the refusal is logged at ERROR, not swallowed');
ok(/would have been cancelled/.test(SYSLOG.find(e => e.kind === 'QUEUE SWEEP REFUSED').detail),
   'the log says what it declined to do');

// This is the exact production path: rebuild wipes the matrix, sweep follows.
reset();
q = buildQueue(30);
sweepStaleQueueRowsV20_2_(q.sheet, q.open, {}, 0, q.rows);
ok(cancelledCount(q, 30) === 0,
   'the original defect — 30 pending sign-offs wiped by one bad rebuild — cannot happen');

// ---------------------------------------------------------------- //
section('A row someone is deciding on is not swept out from under them');
// ---------------------------------------------------------------- //
reset();
q = buildQueue(4, { draftRows: [1] });
// Only row index 1 is stale, and it holds a draft.
let ready = {}; [0, 2, 3].forEach(i => { ready['Trainee' + i + '||SK-' + i] = true; });
n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 12, q.rows);
ok(n === 0, 'nothing was cancelled');
ok(statusAt(q, 1) === 'OPEN', 'the draft-bearing row is still OPEN');
ok(SYSLOG.some(e => e.kind === 'QUEUE SWEEP SKIPPED DRAFTS'), 'and the skip is recorded');

reset();
q = buildQueue(4, { draftRows: [1] });
ready = {}; [0, 3].forEach(i => { ready['Trainee' + i + '||SK-' + i] = true; });
n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 12, q.rows);
ok(n === 1, 'the stale row WITHOUT a draft is still cancelled');
ok(String(statusAt(q, 2)).indexOf('CANCELLED') === 0, 'row 2 cancelled');
ok(statusAt(q, 1) === 'OPEN', 'row 1 protected because a decision is part-written on it');

// ---------------------------------------------------------------- //
section('Mass cancellation is refused as a symptom');
// ---------------------------------------------------------------- //
reset();
q = buildQueue(40);
ready = {};
for (let i = 0; i < 28; i++) ready['Trainee' + i + '||SK-' + i] = true;  // 12 stale
n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 200, q.rows);
ok(n === 0, '12 stale rows is past the limit, so nothing is cancelled');
ok(cancelledCount(q, 40) === 0, 'every row survives');
ok(SENT.length === 1, 'and a human is emailed rather than left to notice');
ok(/still OPEN and safe/.test(SENT[0][2]), 'the mail says the requests are safe');

reset();
q = buildQueue(6);
ready = {};
for (let i = 0; i < 2; i++) ready['Trainee' + i + '||SK-' + i] = true;   // 4 of 6 stale
n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 200, q.rows);
ok(n === 0, 'more than half the open queue is refused even when under the row limit');

reset();
q = buildQueue(40);
ready = {};
for (let i = 0; i < 32; i++) ready['Trainee' + i + '||SK-' + i] = true;  // 8 stale
n = sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 200, q.rows);
ok(n === 8, 'a plausible criteria change — 8 of 40 — still goes through');
ok(cancelledCount(q, 40) === 8, 'exactly those eight rows are cancelled');
ok(SYSLOG.filter(e => e.kind === 'QUEUE ROW CANCELLED').length === 8,
   'and every single cancellation is logged individually');
ok(/no longer ready on the matrix/.test(SYSLOG.find(e => e.kind === 'QUEUE ROW CANCELLED').detail),
   'with the reason attached');
ok(SENT.length === 0, 'a normal sweep does not email anyone');

// ---------------------------------------------------------------- //
section('Ordinary cases still behave');
// ---------------------------------------------------------------- //
reset();
q = buildQueue(5);
ready = {};
for (let i = 0; i < 5; i++) ready['Trainee' + i + '||SK-' + i] = true;
ok(sweepStaleQueueRowsV20_2_(q.sheet, q.open, ready, 50, q.rows) === 0,
   'nothing stale means nothing cancelled');
ok(SYSLOG.length === 0, 'and nothing logged — a quiet sweep stays quiet');
ok(sweepStaleQueueRowsV20_2_(q.sheet, {}, {}, 50, []) === 0, 'an empty queue is a no-op');
ok(QUEUE_SWEEP_MAX_V20_2 > 0, 'the safety limit is a real number');

// ---------------------------------------------------------------- //
section('The rebuild will not clear a populated matrix to nothing');
// ---------------------------------------------------------------- //
const rbSrc = rebuildSkillMatrixV19_.toString();
const clearAt = rbSrc.indexOf('clearContent');
const guardAt = rbSrc.indexOf('MATRIX REBUILD PRODUCED NOTHING');
ok(guardAt > 0, 'the rebuild has an empty-output guard');
ok(guardAt < clearAt, '...and it runs BEFORE the clear, which is the whole point');
ok(/if \(!output\.length\)/.test(rbSrc), 'triggered by having computed no rows');
ok(/matrix\.getLastRow\(\) >= 5/.test(rbSrc), 'it checks whether the sheet already held data');
ok(/return;/.test(rbSrc.slice(guardAt, clearAt)), 'and returns instead of clearing');
ok(/refreshSkillValidationQueueV19_/.test(rbSrc), 'the sweep is still called on a good rebuild');
// lastIndexOf, not indexOf: the guard's comment names the sweep too, and the
// comment sits above the clear. The CALL is what has to come after it.
ok(rbSrc.lastIndexOf('refreshSkillValidationQueueV19_()') > clearAt,
   'after the matrix is written, never before');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
