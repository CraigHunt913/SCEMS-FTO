// SCEMS v20.3 — the trainee console, the release file, and readability.
//
// Built to a plain-language brief: one row per trainee, a button to get
// their whole history as a document, a checkbox to release them, and
// columns wide enough to read a comment without fighting the cell.
//
//   node test/console-and-file.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SYSLOG = [], SHEETS = {}, ALERTS = [], DOCS = [], GATE = true, SHEET_ORDER = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; this.hidden = false; this.widths = {}; this.frozen = {}; this.heights = {}; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.getMaxRows = function () { return Math.max(this.g.length, 60); };
FakeSheet.prototype.getMaxColumns = function () { return Math.max(this.getLastColumn(), 30); };
FakeSheet.prototype.insertRowsAfter = function (after, n) { for (let i = 0; i < n; i++) this.g.push([]); return this; };
FakeSheet.prototype.insertColumnsAfter = function () { return this; };
FakeSheet.prototype.isSheetHidden = function () { return this.hidden; };
FakeSheet.prototype.hideSheet = function () { this.hidden = true; return this; };
FakeSheet.prototype.showSheet = function () { this.hidden = false; return this; };
FakeSheet.prototype.setColumnWidth = function (c, w) { this.widths[c] = w; return this; };
FakeSheet.prototype.setFrozenRows = function (n) { this.frozen.rows = n; return this; };
FakeSheet.prototype.setFrozenColumns = function (n) { this.frozen.cols = n; return this; };
FakeSheet.prototype.setRowHeight = function (r, h) { this.heights[r] = h; return this; };
FakeSheet.prototype.setRowHeights = function (r, n, h) { for (let i = 0; i < n; i++) this.heights[r + i] = h; return this; };
FakeSheet.prototype.setConditionalFormatRules = function () { return this; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValues: function () {
      const o = [];
      for (let i = 0; i < NR; i++) { const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]); o.push(s); }
      return o;
    },
    getDisplayValues: function () { return api.getValues().map(x => x.map(v => String(v == null ? '' : v))); },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    setValues: function (vs) { vs.forEach((row, i) => { sh.g[R - 1 + i] = sh.g[R - 1 + i] || []; row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; }); }); return api; },
    clearContent: function () { for (let i = 0; i < NR; i++) if (sh.g[R - 1 + i]) for (let j = 0; j < NC; j++) sh.g[R - 1 + i][C - 1 + j] = ''; return api; }
  };
  ['setFontSize','setFontWeight','setFontColor','setBackground','setVerticalAlignment','setWrap',
   'setFontFamily','insertCheckboxes','clearDataValidations','setDataValidation','setNumberFormat',
   'setHorizontalAlignment','setBorder','setItalic','setBold'].forEach(m => { api[m] = function () { return api; }; });
  return api;
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: n => SHEETS[n] || null,
    getSheets: () => SHEET_ORDER.map(n => SHEETS[n]).filter(Boolean),
    insertSheet: (n) => { SHEETS[n] = new FakeSheet(n, [[]]); SHEET_ORDER.unshift(n); return SHEETS[n]; },
    setActiveSheet: function (sh) { this._a = sh; return sh; },
    moveActiveSheet: function () {}, getId: () => 'SS'
  }),
  getUi: () => ({ alert: (...a) => { ALERTS.push(a.join(' | ')); return 'YES'; },
                  ButtonSet: { OK: 1, OK_CANCEL: 2, YES_NO: 3 }, Button: { OK: 1, YES: 'YES' } }),
  newConditionalFormatRule: () => { const o = {}; ['whenTextContains','whenNumberGreaterThan','setBackground',
    'setFontColor','setBold','setRanges'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
  newDataValidation: () => { const o = {}; ['requireValueInList','requireDate','setAllowInvalid','setHelpText'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
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
global.DriveApp = { getFileById: () => ({ getParents: () => ({ hasNext: () => false }) }) };

function FakeDoc(title) {
  this.title = title; this.paras = [];
  const self = this;
  const para = t => { const p = { t: String(t) };
    ['setHeading','setFontSize','setBold','setForegroundColor','setItalic'].forEach(m => p[m] = () => p);
    self.paras.push(p); return p; };
  this.body = { appendParagraph: para, appendHorizontalRule: () => para('---'),
    setMarginTop: function () { return this; }, setMarginBottom: function () { return this; },
    setMarginLeft: function () { return this; }, setMarginRight: function () { return this; } };
}
FakeDoc.prototype.getBody = function () { return this.body; };
FakeDoc.prototype.saveAndClose = function () { this.closed = true; };
FakeDoc.prototype.getUrl = function () { return 'https://docs.google.com/document/d/FAKE-' + DOCS.indexOf(this); };
FakeDoc.prototype.getId = function () { return 'FAKEID'; };
global.DocumentApp = {
  create: t => { const d = new FakeDoc(t); DOCS.push(d); return d; },
  ParagraphHeading: { TITLE: 'T', HEADING1: 'H1', HEADING2: 'H2' }
};

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (l, k, d) { SYSLOG.push({ l, k, d }); };
gateV20_2_ = function () { return GATE; };

function sheet(name, headers, rows, headerRow) {
  const hr = headerRow || 4;
  const g = [];
  for (let i = 0; i < hr - 1; i++) g.push(new Array(headers.length).fill(''));
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
  if (SHEET_ORDER.indexOf(name) < 0) SHEET_ORDER.push(name);
  return SHEETS[name];
}

function world() {
  SHEETS = {}; SHEET_ORDER = []; SYSLOG = []; ALERTS = []; DOCS = [];
  const MH = ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
              'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE'];
  sheet(TAB.MASTER, MH, [
    ['Jamie More','E-1','Paramedic','New hire','K. Stuckey', new Date('2026-06-01'),'Phase 2','Active','j@x.com', new Date('2026-07-15')],
    ['Alex Reed','E-2','EMT','Transfer','C. Hunt', new Date('2026-05-01'),'Phase 3','Active','a@x.com', new Date('2026-07-01')],
    ['Old Timer','E-9','EMT','New hire','C. Hunt', new Date('2026-01-01'),'Phase 4','Closed / released','o@x.com', new Date('2026-02-01')]
  ]);
  sheet(TAB.EVAL, ['TIMESTAMP','FTO name','Trainee','Assessment','Documented Situation narrative','One clear strength'], [
    [new Date('2026-08-10'),'K. Stuckey','Jamie More', 4, 'Ran a cardiac arrest with minimal prompting and kept the team calm throughout a long resuscitation.', 'Stayed composed'],
    [new Date('2026-08-14'),'C. Hunt','Jamie More', 3, 'Struggled with scene control on a multi-patient MVC.', 'Good assessment']
  ]);
  sheet(TAB.REFLECT, ['TIMESTAMP','Trainee','What went well','What was hard'], [
    [new Date('2026-08-11'),'Jamie More','The arrest felt like it clicked.','Radio reports still rush me.']
  ]);
  sheet(TAB.URGENT, ['TIMESTAMP','Called?','Your name','Trainee involved','What happened'], [
    [new Date('2026-08-12'),'Yes','K. Stuckey','Alex Reed','Medication draw error caught before administration.']
  ]);
  sheet(TAB.SKILLS, ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
    'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS',
    'LAST OUTCOME','LAST CONTEXT','SIGNED BY','SIGNED DATE','EXPIRATION','DECISION / EVIDENCE NOTE'], [
    ['Jamie More','IV access','I', new Date('2026-08-10'),'K. Stuckey','Paramedic','SIGNED OFF','SIGNED OFF','Vascular','SK-1',5,3,3,2,'Successful','Road','C. Hunt', new Date(),'',''],
    ['Jamie More','Intubation','A', new Date('2026-08-12'),'K. Stuckey','Paramedic','READY FOR VALIDATION','','Airway','SK-2',4,2,2,2,'Successful','Road','','','',''],
    ['Alex Reed','IV access','I', new Date('2026-08-01'),'C. Hunt','EMT','IN PROGRESS','','Vascular','SK-1',1,0,1,1,'Successful','Road','','','','']
  ]);
  sheet(TAB.SKILL_VALIDATION, ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY',
    'DECISION','DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'], [
    [new Date(),'Jamie More','SK-2','Airway','Intubation','4/2/2/2','','','','','','OPEN','', 'QR-1']
  ]);
  sheet(TAB.SKILL_EVIDENCE, ['EVENT ID','TIMESTAMP','SHIFT DATE','TRAINEE','LEVEL AT EVENT','PHASE','FTO',
    'SKILL ID','DOMAIN','SKILL','CONTEXT','STAGE','OUTCOME','PROMPTING','CALL / SCENARIO REF','EVIDENCE NOTE',
    'SOURCE FORM','SOURCE ROW','VALIDATION RESULT','ATTESTATION'], [
    ['EV-1', new Date(), new Date('2026-08-10'),'Jamie More','Paramedic','Phase 2','K. Stuckey','SK-1','Vascular','IV access','Road','I','Successful','None','C-101','First stick on a difficult patient, no prompting needed.','Form','','ACCEPTED','Attested'],
    ['EV-2', new Date(), new Date('2026-08-12'),'Jamie More','Paramedic','Phase 2','K. Stuckey','SK-2','Airway','Intubation','Road','A','Successful','Minimal verbal cue','C-102','Second attempt successful.','Form','','ACCEPTED','Attested']
  ]);
  sheet(TAB.SKILL_SIGNOFF, ['DECISION ID','TIMESTAMP','TRAINEE','SKILL ID','SKILL','DECISION','DECIDED BY',
    'DECISION DATE','EXPIRATION','RATIONALE','SOURCE QUEUE ROW','STANDARD / CATALOG VERSION'], [
    ['SD-1', new Date(),'Jamie More','SK-1','IV access','Approve sign-off','craighunt913@gmail.com', new Date('2026-08-13'),'','Directly observed and verified.', 5,'v1']
  ]);
  sheet(TAB.DECISIONS, ['TIMESTAMP','Filed by','Trainee','Item type','Decision','Rationale'], [
    [new Date('2026-07-15'),'C. Hunt','Jamie More','Advancement','Advance to Phase 2','Thresholds met.']
  ]);
}

// ---------------------------------------------------------------- //
section('The console: one row per person, in words');
// ---------------------------------------------------------------- //
world();
let out = buildTraineeConsoleV20_3();
const con = SHEETS[TAB_CONSOLE_V20_3];
ok(!!con, 'a TRAINEES tab is created');
ok(/2 active/.test(out), 'released trainees are not listed as active');

const hdr = con.g[1];
ok(hdr[0] === 'Trainee' && hdr[9] === 'Open file' && hdr[10] === 'Release',
   'the headers are plain words, not codes');
ok(CONSOLE_HEADERS_V20_3.every(h => !/_|[A-Z]{4,}/.test(h)),
   'no SHOUTING_HEADERS anywhere in the console');

const r1 = con.g[CONSOLE_FIRST_ROW_V20_3 - 1];
ok(r1[0] === 'Jamie More', 'first trainee listed');
ok(r1[CONSOLE_COL_V20_3.LEVEL - 1] === 'Paramedic', 'level shown');
ok(r1[CONSOLE_COL_V20_3.PHASE - 1] === 'Phase 2', 'phase shown');
ok(String(r1[CONSOLE_COL_V20_3.SIGNED - 1]) === '1 of 2', 'skills shown as "signed of applicable"');
ok(/1 waiting/.test(String(r1[CONSOLE_COL_V20_3.WAITING - 1])), 'what is waiting on you is spelled out');
ok(String(r1[CONSOLE_COL_V20_3.EVALS - 1]) === '2', 'evaluation count is right');
ok(/days ago|today|yesterday/.test(String(r1[CONSOLE_COL_V20_3.LAST_EVAL - 1])),
   'last evaluation is in human time, not a raw date');

const r2 = con.g[CONSOLE_FIRST_ROW_V20_3];
ok(r2[0] === 'Alex Reed', 'second trainee listed');
ok(String(r2[CONSOLE_COL_V20_3.CONCERNS - 1]) === '1', 'an urgent concern is surfaced against the right person');
ok(r1[CONSOLE_COL_V20_3.OPEN - 1] === false && r1[CONSOLE_COL_V20_3.RELEASE - 1] === false,
   'both checkboxes start unticked');
ok(con.frozen.rows === 2 && con.frozen.cols === 1, 'headers and the name column stay put when scrolling');
ok(con.widths[1] >= 200, 'the name column is wide enough for a real name');

// ---------------------------------------------------------------- //
section('The file: everything from day one, in full');
// ---------------------------------------------------------------- //
world();
const built = buildTraineeFileV20_3('Jamie More');
ok(DOCS.length === 1, 'a document is created');
const text = DOCS[0].paras.map(p => p.t).join('\n');

ok(/Jamie More/.test(text), 'it is about the right person');
ok(/Field Training Record/.test(text), 'it is titled as a record');
ok(/Paramedic/.test(text) && /Phase 2/.test(text), 'it carries their level and phase');

ok(/kept the team calm throughout a long resuscitation/.test(text),
   'a long evaluation narrative appears IN FULL — the thing the spreadsheet cannot show');
ok(/Radio reports still rush me/.test(text), 'the trainee\'s own words are included');
ok(/First stick on a difficult patient/.test(text), 'skill evidence notes are included');
ok(/Directly observed and verified/.test(text), 'the sign-off rationale is included');
ok(/Advance to Phase 2/.test(text), 'programme decisions are included');
ok(!/…|\.\.\./.test(text.replace(/·/g, '')), 'nothing is truncated with an ellipsis');

ok(built.counts.evals === 2, 'evaluation count reported');
ok(built.counts.reflections === 1, 'reflection count reported');
ok(built.counts.skills === 2 && built.counts.accepted === 2, 'skill counts reported');
ok(built.counts.signoffs === 1, 'sign-off count reported');
ok(/^https:\/\/docs\.google\.com/.test(built.url), 'a link comes back');
ok(SYSLOG.some(e => e.k === 'TRAINEE FILE BUILT'), 'building a file is logged');

// other people's data must not leak into it
ok(!/Medication draw error/.test(text), 'another trainee\'s urgent concern is NOT in this file');
ok(!/Alex Reed/.test(text), 'another trainee is not named at all');

// ---------------------------------------------------------------- //
section('The checkboxes behave like buttons');
// ---------------------------------------------------------------- //
world(); buildTraineeConsoleV20_3();
const sheetRef = SHEETS[TAB_CONSOLE_V20_3];
function tick(row, col) {
  sheetRef.getRange(row, col).setValue(true);
  const e = { range: Object.assign(sheetRef.getRange(row, col), {
    getRow: () => row, getColumn: () => col, getSheet: () => sheetRef }) };
  return consoleEditV20_3_(e, sheetRef);
}
DOCS = []; ALERTS = [];
let owned = tick(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.OPEN);
ok(owned === true, 'the console owns its own edits');
ok(DOCS.length === 1, 'ticking "Open file" builds the file');
ok(sheetRef.g[CONSOLE_FIRST_ROW_V20_3 - 1][CONSOLE_COL_V20_3.OPEN - 1] === false,
   'the box unticks itself — it is a button, not a setting');
ok(/docs.google.com/.test(String(sheetRef.g[CONSOLE_FIRST_ROW_V20_3 - 1][CONSOLE_COL_V20_3.FILE - 1])),
   'and the link lands in the last column');
ok(ALERTS.some(a => /File ready/.test(a)), 'you are told it worked, with the counts');

// unticking does nothing
DOCS = [];
sheetRef.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.OPEN).setValue(false);
const e2 = { range: Object.assign(sheetRef.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.OPEN), {
  getRow: () => CONSOLE_FIRST_ROW_V20_3, getColumn: () => CONSOLE_COL_V20_3.OPEN, getSheet: () => sheetRef }) };
consoleEditV20_3_(e2, sheetRef);
ok(DOCS.length === 0, 'unticking builds nothing');

// an edit elsewhere is not ours
const other = sheet('SOMETHING ELSE', ['a'], [['b']]);
ok(consoleEditV20_3_({ range: { getRow: () => 5, getColumn: () => 1, getValue: () => true } }, other) === false,
   'an edit on another sheet is passed through untouched');

// the gate guards release
world(); buildTraineeConsoleV20_3(); GATE = false; DOCS = []; ALERTS = [];
tick(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.RELEASE);
ok(DOCS.length === 0, 'an unauthorized session cannot release anyone');
GATE = true;

// ---------------------------------------------------------------- //
section('Readable: prose gets room, dates do not');
// ---------------------------------------------------------------- //
[['Documented Situation narrative', 400], ['Evidence note', 400], ['RATIONALE', 400],
 ['What happened', 400], ['One thing to improve', 400]].forEach(([h, min]) => {
  ok(readableWidthForV20_3_(h) >= min, '"' + h + '" gets a wide column');
});
[['SHIFT DATE', 130], ['TIMESTAMP', 130], ['EXPIRATION', 130]].forEach(([h, max]) => {
  ok(readableWidthForV20_3_(h) <= max, '"' + h + '" stays narrow');
});
ok(readableWidthForV20_3_('TRAINEE') >= 150, 'names get room');
ok(readableWidthForV20_3_('OUTCOME') >= 140, 'status words get room');
ok(readableWidthForV20_3_('') === 100, 'a blank header gets a sane default');

world();
makeSheetsReadableV20_3();
const evs = SHEETS[TAB.EVAL];
const narrCol = 5; // 'Documented Situation narrative'
ok(evs.widths[narrCol] >= 400, 'the narrative column on the eval sheet is actually widened');
ok(evs.widths[1] <= 130, 'the timestamp column beside it stays narrow');
ok(evs.frozen.rows === 4, 'the header row is frozen');
ok(Object.keys(evs.heights).length > 0, 'rows are given height so wrapped text is visible');
ok(SYSLOG.some(e => e.k === 'READABLE LAYOUT APPLIED'), 'the pass is logged');

const rsrc = makeSheetsReadableV20_3.toString();
ok(!/setValue|setValues|deleteRow|clearContent/.test(rsrc),
   'the readability pass changes formatting only — it never touches a cell value');

// ---------------------------------------------------------------- //
section('SIMPLIFY_EVERYTHING ties it together');
// ---------------------------------------------------------------- //
const ssrc = SIMPLIFY_EVERYTHING.toString();
['buildTraineeConsoleV20_3', 'makeSheetsReadableV20_3', 'organizeTabsV20_2'].forEach(n =>
  ok(ssrc.indexOf(n) > 0, 'it runs ' + n));
ok(!/deleteRow|deleteSheet|clearContent/.test(ssrc), 'and destroys nothing');
ok(tabOrderV20_2_()[0] === TAB_CONSOLE_V20_3, 'TRAINEES sorts to the far left');
ok(dailyTabsV20_2_().indexOf(TAB_CONSOLE_V20_3) >= 0, 'and is never hidden');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
