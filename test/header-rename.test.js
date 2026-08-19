// SCEMS v20.4 — plain-English headers, without breaking 235 lookups.
//
// The renames are only safe because readTableV20_1_ resolves a display
// label back to its canonical name. These tests exist to prove that, and
// to prove the aliases are scoped per sheet — a global alias table would
// have wired the evidence log's PHASE to the master's CURRENT PHASE.
//
//   node test/header-rename.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SHEETS = {}, SYSLOG = [], ALERTS = [], GATE = true;

function FakeSheet(name, grid) { this.name = name; this.g = grid; this.notes = {}; this.hiddenCols = {}; this.widths = {}; this.frozen = {}; this.heights = {}; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.getMaxRows = function () { return Math.max(this.g.length, 60); };
FakeSheet.prototype.getMaxColumns = function () { return Math.max(this.getLastColumn(), 30); };
FakeSheet.prototype.hideColumns = function (c) { this.hiddenCols[c] = true; return this; };
FakeSheet.prototype.showColumns = function () { this.hiddenCols = {}; return this; };
FakeSheet.prototype.setColumnWidth = function (c, w) { this.widths[c] = w; return this; };
FakeSheet.prototype.setFrozenRows = function (n) { this.frozen.rows = n; return this; };
FakeSheet.prototype.setFrozenColumns = function (n) { this.frozen.cols = n; return this; };
FakeSheet.prototype.setRowHeight = function () { return this; };
FakeSheet.prototype.setRowHeights = function () { return this; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValues: function () { const o = [];
      for (let i = 0; i < NR; i++) { const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]); o.push(s); } return o; },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    setValues: function (vs) { vs.forEach((row, i) => { sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
      row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; }); }); return api; },
    clearContent: function () { for (let i = 0; i < NR; i++) if (sh.g[R - 1 + i])
      for (let j = 0; j < NC; j++) sh.g[R - 1 + i][C - 1 + j] = ''; return api; },
    setNote: function (n) { sh.notes[R + ':' + C] = n; return api; },
    getDisplayValues: function () { return api.getValues().map(x => x.map(v => String(v == null ? '' : v))); }
  };
  ['setWrap','setVerticalAlignment','setFontWeight','setFontSize','setBackground','setFontColor',
   'setFontFamily','insertCheckboxes','clearDataValidations','setDataValidation','setNumberFormat'].forEach(m => api[m] = () => api);
  return api;
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: n => SHEETS[n] || null, getSheets: () => Object.values(SHEETS),
    insertSheet: n => (SHEETS[n] = new FakeSheet(n, [[]])), setActiveSheet: () => {}, moveActiveSheet: () => {}, getId: () => 'SS' }),
  getUi: () => ({ alert: (...a) => { ALERTS.push(a.join(' ')); return 'YES'; },
    ButtonSet: { OK: 1, OK_CANCEL: 2, YES_NO: 3 }, Button: { OK: 1, YES: 'YES' } }),
  newConditionalFormatRule: () => { const o = {}; ['whenTextContains','whenNumberGreaterThan','setBackground','setFontColor','setBold','setRanges'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
  newDataValidation: () => { const o = {}; ['requireValueInList','requireDate','setAllowInvalid','setHelpText'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }),
  getEffectiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }), getScriptTimeZone: () => 'America/New_York' };
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-19' };
global.Logger = { log: () => {} };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) };
global.MailApp = { sendEmail: () => {}, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [] };
global.DriveApp = { getFileById: () => ({ getParents: () => ({ hasNext: () => false }) }) };
global.DocumentApp = { create: () => ({ getBody: () => ({ appendParagraph: () => ({ setHeading: () => ({}) }) }), saveAndClose: () => {}, getUrl: () => '', getId: () => '' }), ParagraphHeading: {} };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (l, k, d) { SYSLOG.push({ l, k, d }); };
gateV20_2_ = function () { return GATE; };

function sheet(name, headers, rows) {
  const g = [[], [], [], headers.slice()];
  rows.forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
  return SHEETS[name];
}
function headersOf(name) { return SHEETS[name].g[3].filter(x => String(x || '').trim()); }

// ---------------------------------------------------------------- //
section('The alias layer is per sheet, not global');
// ---------------------------------------------------------------- //
ok(canonicalHeaderV20_4_('Program status', TAB.MASTER) === 'SET STATUS',
   'a renamed master header resolves to its canonical name');
ok(canonicalHeaderV20_4_('program  status', TAB.MASTER) === 'SET STATUS',
   'case and extra spaces do not matter');
ok(canonicalHeaderV20_4_('Program status', TAB.SKILL_EVIDENCE) === '',
   'the same label on a different sheet does NOT resolve — aliases are scoped');
ok(canonicalHeaderV20_4_('SET STATUS', TAB.MASTER) === '',
   'a canonical name needs no alias');
ok(canonicalHeaderV20_4_('', TAB.MASTER) === '', 'a blank header resolves to nothing');
ok(canonicalHeaderV20_4_('Something nobody defined', TAB.MASTER) === '',
   'an unknown header resolves to nothing');

// the collision the scoping exists to prevent
const plan = headerRenamesV20_4_();
ok(!plan[TAB.SKILLS] || !plan[TAB.SKILLS]['CURRENT PHASE'],
   'no rename claims CURRENT PHASE on a sheet that has its own PHASE');
Object.keys(plan).forEach(sheetName => {
  const labels = Object.values(plan[sheetName]).map(x => x.toUpperCase());
  ok(new Set(labels).size === labels.length, sheetName + ': no two columns get the same new label');
});

// ---------------------------------------------------------------- //
section('Renaming a header does not break the lookups');
// ---------------------------------------------------------------- //
SHEETS = {};
sheet(TAB.MASTER, ['Trainee','Employee ID','Level','Entry Profile','Assigned FTO','Start Date',
  'Current Phase','Set Status','Trainee Email','PHASE START DATE','NRT Date','ENTRY PROFILE KEY','Clearance Date','Notes'],
  [['Cassidy Bacci','EMS 70','EMT','A','Julieann White','2026-08-02','Phase 3','Closed / Released',
    'c@x.com','8/2/2026','','C : Experienced transfer','','Accelerated'],
   ['Christian Szretter','EMS 71','EMT','A','Justin Head','2026-07-06','Phase 4','Cleared to Independent Practice',
    's@x.com','7/6/2026','','A : New to the level','','']]);

let before = readTableV20_1_(TAB.MASTER, 4);
const idxSetStatus = before.col['SET STATUS'];
const idxPhaseStart = before.col['PHASE START DATE'];
ok(idxSetStatus === 7, 'canonical lookup works before the rename');

renameHeadersV20_4();
ok(headersOf(TAB.MASTER).indexOf('Program status') >= 0, 'the header now reads "Program status"');
ok(headersOf(TAB.MASTER).indexOf('Set Status') < 0, 'the old label is gone from the sheet');
ok(headersOf(TAB.MASTER).indexOf('Phase started') >= 0, 'SHOUTING CASE headers are gone too');

let after = readTableV20_1_(TAB.MASTER, 4);
ok(after.col['SET STATUS'] === idxSetStatus, 'and t.col[\'SET STATUS\'] still finds the same column');
ok(after.col['PHASE START DATE'] === idxPhaseStart, 'so does t.col[\'PHASE START DATE\']');
ok(after.col['PROGRAM STATUS'] === idxSetStatus, 'the new label resolves as well — both names work');
ok(masterTraineeRowsV20_1_().length === 2, 'and the trainee reader still returns both people');
ok(masterTraineeRowsV20_1_()[0].closed === true, 'reading a renamed column still gives the right value');

renameHeadersV20_4();
ok(headersOf(TAB.MASTER).filter(h => h === 'Program status').length === 1,
   'running the rename twice is a no-op, not a double-rename');

// ---------------------------------------------------------------- //
section('The decision queue header is one column short — and gets named');
// ---------------------------------------------------------------- //
SHEETS = {};
sheet(TAB.QUEUE, ['FILED','TRAINEE','ITEM','DECISION DUE','DECISION','DECIDED BY','DATED','STATUS'],
  [['08/03/2026','Laken Atkinson','Advancement review','Division Chief of Training',
    '08/06/2026','Released','Division Chief of Training','08/03/2026','CLOSED']]);

let q = readTableV20_1_(TAB.QUEUE, 4);
ok(q.headers.filter(String).length === 8, 'the header names 8 columns');
ok(q.rows[0].filter(v => v !== '' && v != null).length === 9, 'the data carries 9');

const out = repairDecisionQueueHeaderV20_4();
const fixed = headersOf(TAB.QUEUE);
ok(fixed.length === 9, 'the header now names all 9');
ok(fixed[3] === 'OWNER', 'the unnamed column after ITEM is named OWNER');
ok(fixed[4] === 'DECISION DUE', 'DECISION DUE moves off the person and onto the date');
ok(fixed[0] === 'FILED' && fixed[1] === 'TRAINEE' && fixed[2] === 'ITEM',
   'the columns that were already right are untouched');
ok(SHEETS[TAB.QUEUE].g[4][3] === 'Division Chief of Training',
   'NOT ONE DATA CELL MOVED — only the labels were wrong');
ok(/Only the header row/.test(out), 'and the report says so');
ok(SYSLOG.some(e => e.k === 'DECISION QUEUE HEADER REPAIRED'), 'the repair is logged');

const secondRun = repairDecisionQueueHeaderV20_4();
ok(/Already repaired|No repair needed/.test(secondRun) &&
   headersOf(TAB.QUEUE).join('|') === fixed.join('|'),
   'running it again changes nothing — the header is left exactly as it was');

SHEETS = {};
sheet(TAB.QUEUE, ['FILED','TRAINEE','ITEM','DECISION DUE'], [['a','b','c','d']]);
ok(/No repair needed/.test(repairDecisionQueueHeaderV20_4()),
   'a sheet whose header already covers its data is left alone');

// ---------------------------------------------------------------- //
section('Entry profiles: report the contradiction, never guess it');
// ---------------------------------------------------------------- //
SHEETS = {};
sheet(TAB.MASTER, ['Trainee','Employee ID','Level','Entry Profile','Assigned FTO','Start Date',
  'Current Phase','Set Status','Trainee Email','PHASE START DATE','NRT Date','ENTRY PROFILE KEY','Clearance Date','Notes'],
  [['Cassidy Bacci','EMS 70','EMT','A','J','2026-08-02','Phase 3','Active','c@x.com','','','C : Experienced transfer','',''],
   ['Christian Szretter','EMS 71','EMT','A','J','2026-07-06','Phase 4','Active','s@x.com','','','A : New to the level','',''],
   ['Anicia Scipp','EMS 30','AEMT','B','S','2026-07-31','Phase 4','Active','a@x.com','','','','',''],
   ['No Profile','EMS 40','EMT','','S','2026-07-31','Phase 1','Active','n@x.com','','','','','']]);

const audit = auditEntryProfilesV20_4();
ok(/Cassidy Bacci/.test(audit), 'the contradicting row is named');
ok(/profile says "A"/.test(audit) && /C : Experienced transfer/.test(audit),
   'both sides of the disagreement are quoted');
ok(!/Christian Szretter/.test(audit.split('NO ENTRY PROFILE')[0]),
   'a row whose profile and key agree is not flagged');
ok(/No Profile/.test(audit), 'a row with no profile at all is listed separately');
ok(/A  =  New to the level/.test(audit) && /C  =  Experienced transfer/.test(audit),
   'the legend is collected from the data');
ok(/yours to settle|your decision/.test(audit),
   'it says the decision is the operator\'s — the system does not guess at a record');
ok(SHEETS[TAB.MASTER].g[4][3] === 'A', 'and it changed nothing');

tidyEntryProfileLegendV20_4();
const note = SHEETS[TAB.MASTER].notes['4:4'];
ok(!!note, 'the legend becomes a note on the column heading');
ok(/A  =  New to the level/.test(note), 'with the letters spelled out');
ok(SHEETS[TAB.MASTER].g[4][11] === 'C : Experienced transfer',
   'and the old key column keeps its contents — nothing deleted');

// ---------------------------------------------------------------- //
section('Counters carry their own thresholds');
// ---------------------------------------------------------------- //
ok(evidenceSentenceV20_4_({successful:3,independent:2,dates:2,ftos:2},
    {minSuccessful:5,minIndependent:2,minDates:3,minFtos:2})
   === '3 of 5 successful  (short)   ·   2 of 2 independent   ·   2 of 3 separate days  (short)   ·   2 of 2 different FTOs',
   'the summary reads as a sentence with thresholds and flags what is short');
ok(/^0 of 5 successful/.test(evidenceSentenceV20_4_({}, {minSuccessful:5})),
   'missing counts read as zero, not blank');
ok(/^4 successful/.test(evidenceSentenceV20_4_({successful:4}, {})),
   'with no threshold configured it just states the count');

// ---------------------------------------------------------------- //
section('Machine columns are hidden, never removed');
// ---------------------------------------------------------------- //
SHEETS = {};
sheet(TAB.SKILL_SIGNOFF, ['DECISION ID','TIMESTAMP','TRAINEE','SKILL ID','SKILL','DECISION','DECIDED BY',
  'DECISION DATE','EXPIRATION','RATIONALE','SOURCE QUEUE ROW','STANDARD / CATALOG VERSION','REQUEST ID',
  'SUPERSEDES','DECIDED BY PERSON ID','WRITER VERSION'], [['SD-1','t','Jamie','SK-1','IV','Approve','me','d','','why',5,'v1','QR-1','','','v20']]);
groupPlumbingColumnsV20_4();
const hid = SHEETS[TAB.SKILL_SIGNOFF].hiddenCols;
ok(hid[1] === true, 'DECISION ID is hidden');
ok(hid[16] === true, 'WRITER VERSION is hidden');
ok(!hid[3] && !hid[7] && !hid[10], 'TRAINEE, DECIDED BY and RATIONALE stay visible');
ok(SHEETS[TAB.SKILL_SIGNOFF].g[4][0] === 'SD-1', 'the hidden column keeps its data');
ok(Object.keys(hid).length === 7, 'exactly the 7 plumbing columns on this sheet are hidden');
const gsrc = groupPlumbingColumnsV20_4.toString();
ok(!/deleteColumn|clearContent|setValue/.test(gsrc), 'hiding never deletes or blanks a column');
showAllColumnsV20_4();
ok(Object.keys(SHEETS[TAB.SKILL_SIGNOFF].hiddenCols).length === 0, 'and they can all come back');

// ---------------------------------------------------------------- //
section('POLISH_SHEETS does correctness before cosmetics');
// ---------------------------------------------------------------- //
const p = POLISH_SHEETS.toString();
const order = ['repairDecisionQueueHeaderV20_4','auditEntryProfilesV20_4','tidyEntryProfileLegendV20_4',
               'renameHeadersV20_4','rewriteEvidenceSummariesV20_4','groupPlumbingColumnsV20_4',
               'makeSheetsReadableV20_3'];
order.forEach(n => ok(p.indexOf(n) > 0, 'it runs ' + n));
const at = order.map(n => p.indexOf(n));
ok(at.every((v, i) => i === 0 || v > at[i - 1]), 'in that order');
ok(p.indexOf('CORRECTNESS') < p.indexOf('READABILITY'),
   'and it labels the correctness work as coming first');
ok(!/deleteRow|deleteColumn|deleteSheet/.test(p), 'nothing in the run deletes anything');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
