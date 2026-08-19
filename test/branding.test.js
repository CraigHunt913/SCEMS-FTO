// SCEMS v20.5 — the badge and the masthead.
//
// Two things these guard. First, the badge: this repo once shipped a 1x1
// transparent placeholder in BADGE_B64, which renders as an invisible
// pixel wherever the shield should be. Nothing failed, nothing logged —
// it just quietly looked broken. Second, the masthead writes rows 1-3 on
// every sheet, and row 4 has always been the header row, so a mistake
// there would land on live data.
//
//   node test/branding.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SHEETS = {}, SYSLOG = [], ALERTS = [], GATE = true;

function FakeSheet(name, grid) {
  this.name = name; this.g = grid; this.images = []; this.widths = {};
  this.heights = {}; this.frozen = {}; this.fmt = {};
}
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.getMaxRows = function () { return Math.max(this.g.length, 60); };
FakeSheet.prototype.getMaxColumns = function () { return Math.max(this.getLastColumn(), 30); };
FakeSheet.prototype.getImages = function () { return this.images.slice(); };
FakeSheet.prototype.insertImage = function (blob, c, r, dx, dy) {
  const sh = this;
  const img = { blob, c, r, dx, dy, w: 0, h: 0, removed: false,
    setWidth: function (w) { this.w = w; return this; },
    setHeight: function (h) { this.h = h; return this; },
    remove: function () { this.removed = true; sh.images = sh.images.filter(x => x !== this); } };
  this.images.push(img);
  return img;
};
FakeSheet.prototype.getColumnWidth = function (c) { return this.widths[c] || 100; };
FakeSheet.prototype.setColumnWidth = function (c, w) { this.widths[c] = w; return this; };
FakeSheet.prototype.setRowHeight = function (r, h) { this.heights[r] = h; return this; };
FakeSheet.prototype.setRowHeights = function () { return this; };
FakeSheet.prototype.setFrozenRows = function (n) { this.frozen.rows = n; return this; };
FakeSheet.prototype.setFrozenColumns = function (n) { this.frozen.cols = n; return this; };
FakeSheet.prototype.hideColumns = function () { return this; };
FakeSheet.prototype.showColumns = function () { return this; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const touch = (k, v) => { for (let i = 0; i < NR; i++) for (let j = 0; j < NC; j++)
    sh.fmt[(R + i) + ':' + (C + j) + ':' + k] = v; };
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
    setBackground: function (v) { touch('bg', v); return api; },
    setFontColor: function (v) { touch('fg', v); return api; },
    setFontSize: function (v) { touch('size', v); return api; },
    setNote: function () { return api; },
    getDisplayValues: function () { return api.getValues().map(x => x.map(v => String(v == null ? '' : v))); }
  };
  ['setFontWeight','setFontFamily','setVerticalAlignment','setHorizontalAlignment','setWrap',
   'insertCheckboxes','clearDataValidations','setDataValidation','setNumberFormat','setItalic','setBold',
   'setFontStyle','merge','setBorder'].forEach(m => api[m] = () => api);
  return api;
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: n => SHEETS[n] || null,
    getSheets: () => Object.keys(SHEETS).map(k => SHEETS[k]),
    insertSheet: n => (SHEETS[n] = new FakeSheet(n, [[]])),
    setActiveSheet: () => {}, moveActiveSheet: () => {}, getId: () => 'SS' }),
  getUi: () => ({ alert: (...a) => { ALERTS.push(a.join(' ')); return 'YES'; },
    ButtonSet: { OK: 1, OK_CANCEL: 2, YES_NO: 3 }, Button: { OK: 1, YES: 'YES' } }),
  newConditionalFormatRule: () => { const o = {}; ['whenTextContains','whenNumberGreaterThan','setBackground','setFontColor','setBold','setRanges'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
  newDataValidation: () => { const o = {}; ['requireValueInList','requireDate','setAllowInvalid','setHelpText'].forEach(m => o[m] = () => o); o.build = () => ({}); return o; },
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = { getActiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }),
  getEffectiveUser: () => ({ getEmail: () => 'craighunt913@gmail.com' }), getScriptTimeZone: () => 'America/New_York' };
let DECODED = null;
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-19',
  base64Decode: b => { DECODED = b; return new Array(Math.floor(b.length * 0.75)); },
  newBlob: (bytes, type, name) => ({ bytes, type, name }) };
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
  (rows || []).forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
  return SHEETS[name];
}

// ---------------------------------------------------------------- //
section('The badge is real, and known to be real');
// ---------------------------------------------------------------- //
ok(BADGE_B64.length > 1000, 'BADGE_B64 is not the 1x1 placeholder this repo once shipped');
ok(BADGE_B64.length === 33996, 'it is the county shield recovered from the original source');
ok(/^iVBORw0KGgo/.test(BADGE_B64), 'and it is still a PNG');
ok(badgeIsRealV20_5_() === true, 'badgeIsRealV20_5_ agrees');
ok(badgeBlobV20_5_() !== null, 'a blob can be made from it');

const realBadge = BADGE_B64;
BADGE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
ok(badgeIsRealV20_5_() === false, 'a 1x1 placeholder is correctly identified as NOT a badge');
ok(badgeBlobV20_5_() === null, 'and no blob is made from it — better no shield than an invisible pixel');
SHEETS = {}; SYSLOG = []; ALERTS = [];
sheet(TAB.MASTER, ['Trainee','Level'], [['Jamie','EMT']]);
brandAllSheetsV20_5();
ok(SYSLOG.some(e => e.k === 'BADGE MISSING'), 'running with a placeholder warns loudly rather than silently');
ok(ALERTS.some(a => /placeholder/.test(a)), 'and tells the operator what is wrong');
ok(SHEETS[TAB.MASTER].images.length === 0, 'no image is inserted');
ok(SHEETS[TAB.MASTER].g[0][1] === 'Trainee Master', 'the masthead still goes on without it');
BADGE_B64 = realBadge;

// ---------------------------------------------------------------- //
section('The masthead never touches data');
// ---------------------------------------------------------------- //
SHEETS = {}; SYSLOG = [];
const m = sheet(TAB.MASTER,
  ['Trainee','Employee ID','Level','Entry Profile','Assigned FTO','Start Date'],
  [['Jamie More','EMS 70','Paramedic','A','K. Stuckey','2026-06-01'],
   ['Alex Reed','EMS 71','EMT','B','C. Hunt','2026-05-01']]);
const headerBefore = m.g[3].slice();
const row1Before = m.g[4].slice();
const row2Before = m.g[5].slice();

brandSheetV20_5_(TAB.MASTER, 'Trainee Master', 'One row per person.', 6);

ok(m.g[3].join('|') === headerBefore.join('|'), 'row 4 — the header row — is untouched');
ok(m.g[4].join('|') === row1Before.join('|'), 'the first data row is untouched');
ok(m.g[5].join('|') === row2Before.join('|'), 'so is the second');
ok(m.g[0][1] === 'Trainee Master', 'the title lands in row 1');
ok(m.g[1][1] === 'One row per person.', 'the purpose line lands in row 2');
ok(/SUMTER COUNTY EMS/.test(String(m.g[0][4] || m.g[0][5] || '')), 'the county mark is set, right-aligned');
ok(m.heights[1] === 54 && m.heights[3] === 6, 'the banner and the rule get their heights');
ok(m.fmt['3:1:bg'] === BRAND_V20_5.GOLD, 'row 3 is the gold rule');
ok(m.fmt['4:1:bg'] === BRAND_V20_5.HEAD_BG, 'row 4 becomes the dark column-header band');
ok(m.fmt['4:1:fg'] === BRAND_V20_5.HEAD_FG, 'with light text on it');
ok(m.frozen.rows === 4, 'and the masthead plus headers stay frozen');

// ---------------------------------------------------------------- //
section('Exactly one badge, however many times you run it');
// ---------------------------------------------------------------- //
ok(m.images.length === 1, 'the badge is inserted');
ok(m.images[0].c === 1 && m.images[0].r === 1, 'anchored to cell A1');
ok(m.images[0].w === 43 && m.images[0].h === 47,
   'sized to fit the banner, keeping the shield’s proportions');
// the badge is 43px + a 6px offset; column A must leave room for it. Sheets
// defaults to 100px, so the widen only fires on an already-narrow column.
ok(m.getColumnWidth(1) >= 56, 'column A leaves room for the shield, so it never covers the title');
const narrow = sheet('NARROW COL A', ['Trainee','Level'], [['x','y']]);
narrow.setColumnWidth(1, 30);
brandSheetV20_5_('NARROW COL A', 'T', 'S', 4);
ok(narrow.getColumnWidth(1) >= 56, 'and a too-narrow column A is widened to fit it');

brandSheetV20_5_(TAB.MASTER, 'Trainee Master', 'One row per person.', 6);
brandSheetV20_5_(TAB.MASTER, 'Trainee Master', 'One row per person.', 6);
ok(m.images.length === 1, 'running it three times still leaves ONE badge, not three');

// ---------------------------------------------------------------- //
section('Every page says what it is for');
// ---------------------------------------------------------------- //
const purpose = sheetPurposeV20_5_();
ok(Object.keys(purpose).length >= 25, 'a masthead is defined for every real sheet');
Object.keys(purpose).forEach(k => {
  const [title, sub] = purpose[k];
  ok(title && !/^\d/.test(title), '"' + k + '" gets a title with no leading tab number');
});
ok(/do not type in it/i.test(purpose[TAB.SKILLS][1]), 'a system-owned sheet says so');
ok(/permanent record/i.test(purpose[TAB.SKILL_EVIDENCE][1]), 'a permanent record says so');
ok(/permanent record/i.test(purpose[TAB.SKILL_SIGNOFF][1]), 'and so does the sign-off log');
ok(/Read these first/i.test(purpose[TAB.URGENT][1]), 'urgent concerns say to read them first');
Object.keys(purpose).forEach(k => {
  ok(purpose[k][1].length > 20 && purpose[k][1].length < 120,
     '"' + k + '" subtitle is one useful line, not a word and not a paragraph');
});

// ---------------------------------------------------------------- //
section('Branding the whole book');
// ---------------------------------------------------------------- //
SHEETS = {}; SYSLOG = [];
sheet(TAB.MASTER, ['Trainee','Level'], [['Jamie','EMT']]);
sheet(TAB.SKILL_VALIDATION, ['READY DATE','TRAINEE'], [['x','Jamie']]);
sheet('SOMETHING CUSTOM', ['a'], [['b']]);
const all = brandAllSheetsV20_5();
ok(SHEETS[TAB.MASTER].images.length === 1, 'the master gets its badge');
ok(SHEETS[TAB.SKILL_VALIDATION].images.length === 1, 'so does the sign-off queue');
ok(SHEETS['SOMETHING CUSTOM'].images.length === 0, 'a sheet with no masthead defined is left alone');
ok(/left alone/.test(all) && /SOMETHING CUSTOM/.test(all), 'and the report names what it skipped');
ok(SHEETS[TAB.SKILL_VALIDATION].g[0][1] === 'Sign-off Queue', 'titles are the plain name, not the tab code');

const bsrc = brandSheetV20_5_.toString();
ok(!/deleteRow|deleteColumn|deleteSheet/.test(bsrc), 'branding deletes nothing');
ok(/getRange\(1, 1, 3,/.test(bsrc), 'and its writes are bounded to rows 1-3');

// ---------------------------------------------------------------- //
section('MAKE_IT_PROFESSIONAL runs the lot in order');
// ---------------------------------------------------------------- //
const p = MAKE_IT_PROFESSIONAL.toString();
const seq = ['repairDecisionQueueHeaderV20_4','auditEntryProfilesV20_4','renameHeadersV20_4',
             'buildTraineeConsoleV20_3','makeSheetsReadableV20_3','groupPlumbingColumnsV20_4',
             'brandAllSheetsV20_5','organizeTabsV20_2'];
seq.forEach(n => ok(p.indexOf(n) > 0, 'it runs ' + n));
const at = seq.map(n => p.indexOf(n));
ok(at.every((v, i) => i === 0 || v > at[i - 1]), 'in dependency order');
ok(p.indexOf('renameHeadersV20_4') < p.indexOf('makeSheetsReadableV20_3'),
   'headers are renamed BEFORE columns are sized by header name');
ok(p.indexOf('brandAllSheetsV20_5') > p.indexOf('groupPlumbingColumnsV20_4'),
   'and the masthead goes on after the columns settle');
ok(!/deleteRow|deleteSheet|deleteColumn/.test(p), 'the whole pass destroys nothing');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
