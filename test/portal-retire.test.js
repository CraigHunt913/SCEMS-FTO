const fs = require('fs');
// SCEMS Portal - somebody left.
//
// A resignation is the one event in this system that quietly breaks records
// without changing any of them. The assignment on a trainee's row is still a
// perfectly valid name; it just points at somebody who is not coming back, so
// that trainee appears on nobody's list and nothing looks wrong.
//
// The tests are about the ways retiring somebody could go wrong: matching a
// name by fragment when the roster holds an Alex White AND a Julieann White,
// deleting history instead of marking a column, leaving a former employee
// able to open personnel records, and letting their trainees fall silently
// off the board.
//
//   node test/portal-retire.test.js

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }
function threw(fn) { try { fn(); return ''; } catch (e) { return String(e.message || e); } }

/* ---------------- platform stubs ---------------- */

let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '', LOGS = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.appendRow = function (r) { this.g.push(r.slice()); return this; };
FakeSheet.prototype.setFrozenRows = function () { return this; };
FakeSheet.prototype.deleteRow = function (n) { this.g.splice(n - 1, 1); return this; };
FakeSheet.prototype.clear = function () { this.g = []; return this; };
/* A cell can carry a data validation rule, and the platform enforces it on
   write exactly like this: setValue throws, with that wording, and the cell
   keeps its old value. sh.validate is { "col": () => [allowed values] }. */
FakeSheet.prototype.setValidation = function (col, allowed, type, a1) {
  this.validate = this.validate || {};
  this.validate[col] = { allowed: allowed, type: type || 'VALUE_IN_RANGE', a1: a1 || 'X1:X9' };
  return this;
};

FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValues: function () { const o = [];
      for (let i = 0; i < NR; i++) { const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]); o.push(s); } return o; },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    getDataValidation: function () {
      const v = sh.validate && sh.validate[C];
      if (!v) return null;
      return { getCriteriaType: () => v.type,
               getCriteriaValues: () => (v.type === 'VALUE_IN_RANGE'
                 ? [{ getA1Notation: () => v.a1 }] : [v.allowed()]) };
    },
    setValue: function (v) {
      const rule = sh.validate && sh.validate[C];
      if (rule && String(v) !== '' && rule.allowed().indexOf(String(v)) < 0) {
        throw new Error('The data you entered in cell ' +
          String.fromCharCode(64 + C) + R +
          ' violates the data validation rules set on this cell.');
      }
      (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    setValues: function (vs) { vs.forEach((row, i) => { sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
      row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; }); }); return api; },
    setDataValidation: function (rule) {
      sh.validate = sh.validate || {};
      if (!rule) { delete sh.validate[C]; return api; }
      sh.validate[C] = { allowed: () => rule.list.filter(x => x !== ''),
                         type: rule.type, a1: 'X1:X9' };
      return api; }
  };
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat'].forEach(m => api[m] = () => api);
  return api;
};


/* Data validation, set the way the platform sets it: a rule applied to a
   range, which every later write into that range is then checked against. */
const NEW_DV = function () {
  const rule = { type: '', list: [], allowInvalid: true, help: '' };
  const b = {
    requireValueInList: function (vals, drop) { rule.type = 'VALUE_IN_LIST';
      rule.list = vals.slice(); return b; },
    requireValueInRange: function (rg) { rule.type = 'VALUE_IN_RANGE'; rule.range = rg; return b; },
    setAllowInvalid: function (v) { rule.allowInvalid = !!v; return b; },
    setHelpText: function (h) { rule.help = String(h); return b; },
    build: function () { return rule; }
  };
  return b;
};

let OPENABLE = {};                       // spreadsheet id -> name
const BOOK = { getSheetByName: n => SHEETS[n] || null, getId: () => 'STG-BOOK',
               getName: () => 'STG_Sandbox', getUrl: () => 'https://example/stg',
               insertSheet: n => (SHEETS[n] = new FakeSheet(n, [])) };

global.SpreadsheetApp = {
  openById: id => {
    if (OPENABLE[id] === undefined) throw new Error('No item with the given ID could be found');
    return Object.assign(Object.create(BOOK), { getName: () => OPENABLE[id], getId: () => id });
  },
  create: () => BOOK,
  getUi: () => { throw new Error('no ui'); }
};
global.SpreadsheetApp.newDataValidation = NEW_DV;
global.Session = { getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE }),
  getScriptTimeZone: () => 'America/New_York' };
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
  setProperty: (k, v) => { PROPS[k] = v; }, deleteProperty: k => { delete PROPS[k]; } }) };
global.Utilities = { formatDate: () => '2026-08-19 0200' };
global.Logger = { log: m => LOGS.push(String(m)) };
global.HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({
  setTitle: function () { return this; }, addMetaTag: function () { return this; },
  setXFrameOptionsMode: function (m) {
    if (m === null || m === undefined) throw new Error('Argument cannot be null: mode');
    return this; } }) }),
  XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' } };

/* A FormApp that behaves like the real one where it matters:
   - toPrefilledUrl() names the entry id belonging to the item responded to
   - a choice item refuses a value it does not offer
   - createResponse() builds an object; nothing is ever submitted           */

let FORM_READS = 0, SUBMITS = 0, FORM_FAILS = {};

function FakeItem(entryId, title, type, choices) {
  this.entryId = entryId; this.title = title; this.type = type; this.choices = choices || null;
}
FakeItem.prototype.getTitle = function () { return this.title; };
FakeItem.prototype.getType = function () { return this.type; };
FakeItem.prototype._text = function () { const it = this;
  return { createResponse: v => ({ item: it, value: String(v) }) }; };
FakeItem.prototype._choice = function () { const it = this;
  return { getChoices: () => (it.choices || []).map(c => ({ getValue: () => c })),
           createResponse: v => {
             if ((it.choices || []).indexOf(String(v)) < 0) throw new Error('Invalid choice: ' + v);
             return { item: it, value: String(v) }; } }; };
FakeItem.prototype.asTextItem = FakeItem.prototype._text;
FakeItem.prototype.asParagraphTextItem = FakeItem.prototype._text;
FakeItem.prototype.asListItem = FakeItem.prototype._choice;
FakeItem.prototype.asMultipleChoiceItem = FakeItem.prototype._choice;

function FakeForm(id, items, destination) {
  this.id = id; this.items = items; this.destination = destination;
}
FakeForm.prototype.getPublishedUrl = function () { return 'https://forms.example/e/' + this.id + '/viewform'; };
FakeForm.prototype.getItems = function () { return this.items.slice(); };
FakeForm.prototype.getDestinationId = function () { return this.destination; };
FakeForm.prototype.createResponse = function () {
  const form = this, parts = [];
  const resp = {
    withItemResponse: function (r) { parts.push(r); return resp; },
    toPrefilledUrl: function () {
      return form.getPublishedUrl() + '?' +
        parts.map(p => p.item.entryId + '=' + encodeURIComponent(p.value)).join('&');
    },
    submit: function () { SUBMITS++; return resp; }
  };
  return resp;
};

let FORMS = {};
global.FormApp = { openById: id => {
  FORM_READS++;
  if (FORM_FAILS[id]) throw new Error(FORM_FAILS[id]);
  if (!FORMS[id]) throw new Error('No item with the given ID could be found');
  return FORMS[id];
} };

// one eval at module scope; eval inside a callback scopes the declarations away
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','91_Record','92_Lifecycle','93_Acknowledge','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto','99_AddTrainee']
  .map(f => fs.readFileSync('/home/user/SCEMS-FTO/portal/' + f + '.gs', 'utf8'))
  .join('\n'));





const HR = PORTAL.HEADER_ROW;
const D = s => new Date(s + 'T12:00:00');

let BOOKS = {};
function bookFor(id) {
  if (!BOOKS[id]) BOOKS[id] = {};
  const sheets = BOOKS[id];
  return { getId: () => id, getName: () => OPENABLE[id],
    getSheetByName: n => sheets[n] || null,
    getSheets: () => Object.keys(sheets).map(n => sheets[n]),
    insertSheet: n => (sheets[n] = new FakeSheet(n, [])) };
}
global.SpreadsheetApp = {
  openById: id => { if (OPENABLE[id] === undefined) throw new Error('not found'); return bookFor(id); },
  create: () => bookFor('PROD-BOOK'), getUi: () => { throw new Error('no ui'); } };
global.SpreadsheetApp.newDataValidation = NEW_DV;
Object.defineProperty(global, 'SHEETS', {
  get() { return BOOKS['PROD-BOOK'] || (BOOKS['PROD-BOOK'] = {}); },
  set(v) { BOOKS['PROD-BOOK'] = v; }, configurable: true });

function tab(name, headers, rows, book) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  const b = book || 'PROD-BOOK';
  if (!BOOKS[b]) BOOKS[b] = {};
  BOOKS[b][name] = new FakeSheet(name, g);
}
function snap() { return JSON.stringify(BOOKS, (k, v) => (v instanceof Date ? v.toISOString() : v)); }
function rosterRows() { return BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.slice(HR); }
function emailAt(name) {
  const t = readTabV1_(PORTAL.TAB.ROSTER);
  const r = t.rows.filter(x => String(x[t.col['FTO NAME']]).trim() === name)[0];
  return r ? String(r[t.col['EMAIL']] || '') : '(no such row)';
}

// Deliberately NOT in the order the list will arrive in. A roster people sort
// by shift is the normal case, and it is the case a pasted column ruins.
const ROSTER = [
  ['Marcus Bramble','C','EMT','Y','','','EMS 15'],
  ['Dale Whitlock','A','Paramedic','Y','','','EMS 1'],
  ['Rosa Quill','B','EMT','Y','','','EMS 11'],
  ['Glenda Vane','A','EMT','Y','','','EMS 3'],
  ['Kent Harlow','A','Paramedic','Y','','','EMS 22']
];

function world(opts) {
  opts = opts || {};
  PROPS = {}; LOGS = []; BOOKS = {}; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  OPENABLE = { 'PROD-BOOK': 'SCEMS Field Training Tracker Master' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'PROD-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  FORMS = {}; FORM_FAILS = {};
  global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };
  tab(PORTAL.TAB.ROSTER, ['FTO NAME','SHIFT','CERT LEVEL','ACTIVE','NOTES','EMAIL','EMPLOYEE ID'],
      (opts.roster || ROSTER).map(r => r.slice()));
  tab(PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'], []);
  PROPS[PORTAL_ROSTER_EMAILS_PROPERTY] = opts.list === undefined ? [
    'Dale Whitlock, dalewhitlock913@example.org',
    'Glenda Vane, vaneglenda9@example.org',
    'Rosa Quill, quillrosa4@example.org',
    'Marcus Bramble, marcusbramblej@example.org',
    'Kent Harlow, khharlow@example.org'
  ].join('\n') : opts.list;
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }



/* ---------------------------------------------------------------- *
 *  A roster shaped like the real one: two people share a surname.
 * ---------------------------------------------------------------- */

// Alex White resigned. Julieann White did not. On the live roster these two
// sit eight rows apart, both Advanced EMT, and one of them has a trainee
// mid-programme. Any match that is not the whole name ends the wrong career.
const RETIRE_ROSTER = [
  ['Craig Hunt',      'A', 'Paramedic',    'Y', '', 'craig@example.org',    'EMS 1'],
  ['Alex White',      'B', 'Advanced EMT', 'Y', '', '',                     'EMS 13'],
  ['Brandon Lee',     'B', 'EMT',          'Y', '', 'blee@example.org',     'EMS 14'],
  ['Julieann White',  'D', 'Advanced EMT', 'Y', '', 'jwhite@example.org',   'EMS 21'],
  ['Macie Morse',     'A', 'EMT',          'Y', '', 'mmorse@example.org',   'EMS 3']
];

const RETIRE_MASTER = [
  ['Cassidy Bacci',  'EMT',          'Julieann White', 'Active',           'cb@example.org'],
  ['Amanda Carr',    'Advanced EMT', 'Alex White',     'Closed / Released', 'ac@example.org']
];

function rWorld(opts) {
  opts = opts || {};
  PROPS = {}; LOGS = []; BOOKS = {}; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  OPENABLE = { 'PROD-BOOK': 'SCEMS Field Training Tracker Master' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'PROD-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  FORMS = {}; FORM_FAILS = {};
  global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };

  const headers = opts.headers ||
    ['FTO NAME','SHIFT','CERT LEVEL','ACTIVE','NOTES','EMAIL','EMPLOYEE ID'];
  tab(PORTAL.TAB.ROSTER, headers, (opts.roster || RETIRE_ROSTER).map(r => r.slice()));
  tab(PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'],
      (opts.master === undefined ? RETIRE_MASTER : opts.master).map(r => r.slice()));
  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','FTO','TRAINEE','SHIFT DATE','NARRATIVE'],
      (opts.evals === undefined ? [
        [D('2026-08-01'), 'Alex White',     'Amanda Carr',   D('2026-07-31'), 'First shift.'],
        [D('2026-08-11'), 'Julieann White', 'Cassidy Bacci', D('2026-08-10'), 'Good progress.']
      ] : opts.evals).map(r => r.slice()));
  PROPS[PORTAL_RETIRE_PROPERTY] = opts.retire === undefined ? 'Alex White' : opts.retire;
}

function activeAt(name) {
  const t = readTabV1_(PORTAL.TAB.ROSTER);
  const r = t.rows.filter(x => String(x[t.col['FTO NAME']]).trim() === name)[0];
  return r ? String(r[t.col['ACTIVE']] === undefined ? '' : r[t.col['ACTIVE']]) : '(no such row)';
}

// ---------------------------------------------------------------- //
section('The whole name, never a piece of it');
// ---------------------------------------------------------------- //
rWorld();
as('chief@example.org');
let p = retirePlanV1_();
ok(p.set.length === 1, 'exactly one person is planned');
ok(p.set[0].name === 'Alex White', 'and it is the one named');
ok(!p.set.some(s => s.name === 'Julieann White'),
   'the other White is not swept up in it');

// the fragment that would do it
rWorld({ retire: 'White' });
p = retirePlanV1_();
ok(p.set.length === 0, 'a surname on its own retires nobody');
ok(p.notFound.length === 1, 'it is reported as not on the roster');
ok(/spelling/i.test(retireFto()), 'and says to check it against the roster');
ok(activeAt('Alex White') === 'Y' && activeAt('Julieann White') === 'Y',
   'neither White was touched');

// two rows with the identical name is a question, not a coin toss
rWorld({ roster: RETIRE_ROSTER.concat([['Alex White','C','EMT','Y','','','EMS 60']]) });
p = retirePlanV1_();
ok(p.set.length === 0, 'two rows with that exact name retires nobody');
ok(p.twoRows.length === 1 && p.twoRows[0].rows.length === 2, 'both rows are named');
let out = retireFto();
ok(/not something to guess at/.test(out), 'and it says why it stopped');

// ---------------------------------------------------------------- //
section('It marks a column. It does not delete anybody');
// ---------------------------------------------------------------- //
rWorld();
as('chief@example.org');
const rosterBefore = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g);
const evalBefore   = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.EVAL].g);
const masterBefore = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER].g);
out = retireFto();

ok(activeAt('Alex White') === 'N', 'ACTIVE now says N');
ok(rosterRowCount() === 5, 'the roster still has all five rows');
ok(nameStillOnRoster('Alex White'), 'his name is still on it');
ok(emailOf('Julieann White') === 'jwhite@example.org', 'nobody else changed');
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.EVAL].g) === evalBefore,
   'his evaluation of Amanda Carr is exactly as it was');
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER].g) === masterBefore,
   'and no trainee row was rewritten');
ok(onlyDifference(rosterBefore, JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g)) === 'Y->N',
   'one cell changed in the whole roster, Y to N');
ok(/Kept, untouched/.test(out), 'the report says what was kept');
ok(/1 in / .test(out), 'and counts the evaluation still filed under his name');

function rosterRowCount() {
  return BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.length - HR;
}
function nameStillOnRoster(n) {
  return rosterPeopleV1_().some(x => x.name === n);
}
function emailOf(n) {
  const m = rosterPeopleV1_().filter(x => x.name === n)[0];
  return m ? m.email : '(no such row)';
}
/** Describes every cell that differs between two grid snapshots. */
function onlyDifference(a, b) {
  const A = JSON.parse(a), B = JSON.parse(b), diffs = [];
  const rows = Math.max(A.length, B.length);
  for (let i = 0; i < rows; i++) {
    const ra = A[i] || [], rb = B[i] || [];
    const cols = Math.max(ra.length, rb.length);
    for (let j = 0; j < cols; j++) {
      const x = ra[j] === undefined ? '' : ra[j], y = rb[j] === undefined ? '' : rb[j];
      if (String(x) !== String(y)) diffs.push(String(x) + '->' + String(y));
    }
  }
  return diffs.join(' AND ');
}

// ---------------------------------------------------------------- //
section('A former employee cannot open personnel records');
// ---------------------------------------------------------------- //
// This is the point of the ACTIVE column, and until now nothing read it: a
// roster row with an address on it granted the training officer screen for
// as long as the row existed.
rWorld({ roster: RETIRE_ROSTER.map(r => {
  const c = r.slice(); if (c[0] === 'Alex White') c[5] = 'awhite@example.org'; return c; }) });
as('awhite@example.org');
let v = resolveViewerV1_('awhite@example.org');
ok(v.role === PORTAL.ROLE.FTO, 'while he works here he is an FTO');

retireFto();
as('awhite@example.org');
v = resolveViewerV1_('awhite@example.org');
ok(v.role === PORTAL.ROLE.NONE, 'once retired, that address opens nothing');
ok(!v.ok, 'and is not authorised');

as('jwhite@example.org');
ok(resolveViewerV1_('jwhite@example.org').role === PORTAL.ROLE.FTO,
   'the other White still signs in perfectly well');

// ---------------------------------------------------------------- //
section('His trainees are the thing that actually breaks');
// ---------------------------------------------------------------- //
// Amanda Carr was already closed, so retiring him strands nobody. Change one
// word and it strands somebody, and that has to be impossible to miss.
rWorld({ master: [['Amanda Carr','Advanced EMT','Alex White','Active','ac@example.org']] });
as('chief@example.org');
out = retireBeforeAndAfter();
ok(/ACTIVE TRAINEE\(S\) ARE ASSIGNED TO THEM/.test(out),
   'the preview shouts about a trainee still assigned to him');
ok(/Amanda Carr/.test(out), 'and names her');
ok(/appear on nobody/.test(out), 'saying what actually goes wrong');
ok(/not a decision this/.test(out), 'and refusing to choose her next FTO');
ok(activeAt('Alex White') === 'Y', 'the preview wrote nothing');

retireFto();
as('chief@example.org');
out = START();
ok(/still assigned to somebody who has left/.test(out),
   'START keeps raising it until a person deals with it');
ok(/Amanda Carr/.test(out), 'by name');

// Nobody assigned at all is the quietest version of the same failure. An
// FTO's list is built by matching their name, so a blank ASSIGNED FTO puts a
// trainee on nobody's list and does not show up as missing from one either.
rWorld({ master: [['Latavia Cole', 'EMT', '', 'Active', 'lc@example.org'],
                  ['Cassidy Bacci', 'EMT', 'Julieann White', 'Active', 'cb@example.org']] });
as('chief@example.org');
out = START();
ok(/no training officer at all/.test(out), 'START finds a trainee with nobody assigned');
ok(/Latavia Cole/.test(out), 'and names her');
ok(!/Cassidy Bacci/.test(out), 'without dragging in the one who is properly assigned');
ok(/needs a person/.test(out), 'and does not pretend it can pick her FTO');

// the closed one does not count: she is finished, not stranded
rWorld();
as('chief@example.org');
retireFto();
as('chief@example.org');
out = START();
ok(!/still assigned to somebody who has left/.test(out),
   'a trainee who was already released is not stranded by his leaving');

// ---------------------------------------------------------------- //
section('He stops being counted as somebody who cannot sign in');
// ---------------------------------------------------------------- //
rWorld();
as('chief@example.org');
out = START();
ok(/1 cannot sign in: Alex White/.test(out),
   'before: he is the one without an address');

// And the step it puts first has to be one that can actually be taken. Alex
// White with no address is a question for a person; retiring him is a
// function. A next step of "(nothing - this one needs a person)" is the dead
// end this whole report exists to avoid.
ok(out.indexOf('Run  retireFto') < out.indexOf('needs a person'),
   'a step with a function behind it comes before one that needs a person');

rWorld();
as('chief@example.org');
retireFto();
as('chief@example.org');
out = START();
ok(!/cannot sign in/.test(out),
   'after: nobody is chased for an address that will never be used');
ok(/all 4 training officers can sign in/.test(out), 'the four who are here can');
ok(/1 retired off the roster/.test(out), 'and it says he is not being counted');
ok(/Alex White/.test(out), 'naming him, so a wrong one is visible immediately');

// the address suggester leaves him alone too
rWorld();
retireFto();
as('chief@example.org');
out = suggestFtoEmails();
ok(/Every one of them can sign in/.test(out), 'suggestFtoEmails has nothing left to find');
ok(/not looked for/.test(out) && /Alex White/.test(out), 'and says who it skipped');

// and a pasted address for him is refused rather than written
rWorld();
retireFto();
PROPS[PORTAL_ROSTER_EMAILS_PROPERTY] = 'Alex White, awhite@example.org';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
as('chief@example.org');
const rp = rosterEmailPlanV1_();
ok(rp.set.length === 0, 'no sign-in address is written for somebody who left');
ok(rp.retired.length === 1, 'it is reported instead');
ok(/NO LONGER HERE/.test(rosterEmailsBeforeAndAfter()), 'and the preview says so');

// ---------------------------------------------------------------- //
section('Undo');
// ---------------------------------------------------------------- //
rWorld();
as('chief@example.org');
const pristine = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g);
retireFto();
ok(activeAt('Alex White') === 'N', 'retired');
out = unretireFto();
ok(activeAt('Alex White') === 'Y', 'and put back to exactly what it held');
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g) === pristine,
   'the roster is byte-identical to before');
ok(/BACK ON THE ROSTER/.test(out), 'the undo says what it did');
ok(!!BOOKS['PROD-BOOK'][PORTAL_RETIRE_LOG], 'and the record of it stays');

as('chief@example.org');
ok(resolveViewerV1_('jwhite@example.org').role === PORTAL.ROLE.FTO,
   'everybody signs in again');

// somebody edited the column by hand since
rWorld();
as('chief@example.org');
retireFto();
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g[HR + 1][3] = 'Resigned 8/16';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
out = unretireFto();
ok(/changed since/.test(out), 'a hand edit is reported, not overwritten');
ok(activeAt('Alex White') === 'Resigned 8/16', 'and left exactly as the person left it');
ok(!rosterActiveV1_('Resigned 8/16'), 'which still reads as somebody who has left');

// nothing has ever been retired
rWorld();
as('chief@example.org');
ok(/Nobody has been retired/.test(unretireFto()), 'with no log it says so plainly');

// A Y/N dropdown on ACTIVE that does not offer N. One refusal is one person
// not retired; it must not abandon the run and leave the ones already done
// recorded nowhere, because then unretireFto cannot reverse them.
rWorld({ retire: 'Alex White; Brandon Lee' });
as('chief@example.org');
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].setValidation(4, function () {
  // refuses N only on Alex White's row is not expressible, so refuse N wholly
  return ['Y'];
}, 'VALUE_IN_LIST');
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
out = retireFto();
ok(/NOT CHANGED/.test(out), 'a dropdown that will not take N is reported');
ok(/dropdown/.test(out), 'and named as the cause');
ok(activeAt('Alex White') === 'Y' && activeAt('Brandon Lee') === 'Y',
   'and nobody is half-retired');
ok(threw(function () { retireFto(); }) === '',
   'running it again still returns a report rather than throwing');

// ---------------------------------------------------------------- //
section('The refusals');
// ---------------------------------------------------------------- //
rWorld({ retire: '' });
ok(/Nothing is in PORTAL_RETIRE/.test(retireFto()), 'an empty property says how to set it');
ok(/Alex White : resigned/.test(retireFto()), 'and shows the form a reason takes');

rWorld({ retire: 'Nobody Here' });
p = retirePlanV1_();
ok(p.notFound.length === 1 && !p.set.length, 'a name the roster does not have retires nobody');

rWorld({ retire: 'Alex White' });
retireFto();
as('chief@example.org');
out = retireFto();
ok(/ALREADY MARKED AS GONE/.test(out), 'running it twice is not an error, it is a no-op');
ok(activeAt('Alex White') === 'N', 'and changes nothing the second time');

// no ACTIVE column at all
rWorld({ headers: ['FTO NAME','SHIFT','CERT LEVEL','NOTES','EMAIL','EMPLOYEE ID'],
         roster: RETIRE_ROSTER.map(r => [r[0], r[1], r[2], r[4], r[5], r[6]]) });
out = retireFto();
ok(/has no ACTIVE column/.test(out), 'without the column it refuses');
ok(/Nothing was changed/.test(out), 'and says nothing happened');
ok(/row 4/.test(out) || /row ' \+ PORTAL/.test(out) || /headed ACTIVE/.test(out),
   'telling you how to add it');

// the row stopped being his between the plan and the write
rWorld();
as('chief@example.org');
p = retirePlanV1_();
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g[HR + 1][0] = 'Alex Whitfield';
out = retireFto();
ok(/NOT CHANGED/.test(out) || /NOT ON THE ROSTER/.test(out),
   'a row that stopped holding his name is not written to');
ok(activeAt('Alex Whitfield') === 'Y', 'and the person now in it is left alone');

// ---------------------------------------------------------------- //
section('What the ACTIVE column is allowed to say');
// ---------------------------------------------------------------- //
// Reading this column wrong in the unsafe direction locks the whole service
// out of its own portal with nothing on screen to explain it. Blank means
// here, and a value nobody recognises is left alone rather than guessed at.
[['', true], ['Y', true], ['Yes', true], ['TRUE', true], ['Active', true],
 ['New', true], ['Night', true], ['Notes', true], ['Part-time', true],
 ['Y - light duty', true],
 ['N', false], ['n', false], ['No', false], ['FALSE', false], ['0', false],
 ['Not active', false], ['Non-active', false], ['Inactive', false],
 ['Retired', false], ['Resigned 2026-08-16', false], ['Terminated', false],
 ['Left the service', false], ['Former', false]
].forEach(c => ok(rosterActiveV1_(c[0]) === c[1],
  JSON.stringify(c[0]) + ' reads as ' + (c[1] ? 'still here' : 'gone')));

// a roster that never filled the column in does not go dark
rWorld({ roster: RETIRE_ROSTER.map(r => { const c = r.slice(); c[3] = ''; return c; }) });
ok(rosterActivePeopleV1_().length === 5, 'five blanks are five people who are here');

// ---------------------------------------------------------------- //
section('START offers it as the next step, once');
// ---------------------------------------------------------------- //
rWorld();
as('chief@example.org');
let beforeStart = snap();
out = START();
ok(/waiting to be marked as no longer here/.test(out), 'START sees the pending request');
ok(/Run  retireFto/.test(out), 'and names the one function');
ok(/Alex White/.test(out), 'and who it is about');
ok(/unretireFto puts it back/.test(out), 'saying it is reversible before you run it');
ok(snap() === beforeStart, 'and START still writes nothing');

retireFto();
as('chief@example.org');
out = START();
ok(!/waiting to be marked/.test(out), 'once done it stops offering it');

// the named menu wrappers exist
rWorld();
as('chief@example.org');
ok(typeof SOMEBODY_LEFT === 'function' && typeof UNDO_SOMEBODY_LEFT === 'function',
   'the job-named wrappers are there');
ok(typeof SOMEBODY_LEFT_THE_SERVICE === 'function', 'and the one on the START menu');
beforeStart = snap();
ok(threw(() => retireBeforeAndAfter()) === '', 'the preview runs');
ok(snap() === beforeStart, 'and writes nothing');

// ---------------------------------------------------------------- //
section('Somebody joined, which is not a one-cell edit');
// ---------------------------------------------------------------- //
// "Chyna Gray is Latavia's FTO" looks like typing a name into one cell. It is
// not: ASSIGNED FTO is a dropdown fed by the roster, so a name the roster has
// never heard of is rejected outright; the portal pairs a trainee to their
// officer by name, so the assignment would put that trainee on nobody's list;
// and an officer with no row has no EMAIL cell, so they cannot sign in.

rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org, C, Advanced EMT';
as('chief@example.org');

let ap = addFtoPlanV1_();
ok(ap.add.length === 1, 'one person is planned');
ok(ap.add[0].name === 'Chyna Gray', 'the name is read');
ok(ap.add[0].email === 'cgray@example.org', 'and the address');
ok(ap.add[0].shift === 'C' && ap.add[0].level === 'Advanced EMT',
   'and the shift and level, wherever they sat in the line');

// order must not matter; the property editor eats line breaks and people type
// what they remember first
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, Advanced EMT, cgray@example.org, C';
ok(JSON.stringify(addFtoPlanV1_().add[0]) ===
   JSON.stringify({ name: 'Chyna Gray', email: 'cgray@example.org',
                    shift: 'C', level: 'Advanced EMT' }),
   'the parts after the name may come in any order');

// the name alone is enough to make an assignment possible
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray';
out = addFto();
ok(rosterPeopleV1_().some(x => x.name === 'Chyna Gray'), 'a name on its own puts them on');
ok(/cannot sign in until an address/.test(out), 'and says plainly what that costs');
ok(/can be assigned trainees either way/.test(out), 'and what it does not');

// the whole point: the roster row exists before the assignment does
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org, C, Advanced EMT';
as('chief@example.org');
const rosterWas = BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.length;
out = addFto();
const chyna = rosterPeopleV1_().filter(x => x.name === 'Chyna Gray')[0];
ok(!!chyna, 'she is on the roster');
ok(chyna.active === true, 'as somebody who works here');
ok(chyna.email === 'cgray@example.org', 'with an address, so she can sign in');
ok(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.length === rosterWas + 1,
   'exactly one row was added');
ok(resolveViewerV1_('cgray@example.org').role === PORTAL.ROLE.FTO,
   'and she resolves as a training officer immediately');
ok(/Left blank for a person/.test(out), 'the columns it will not guess at are named');
ok(/qualification, not/.test(out),
   'because what somebody may train is a qualification, not a default');

// no existing row is touched
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
const untouched = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.slice(0, HR + 5));
addFto();
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g.slice(0, HR + 5)) === untouched,
   'every row that was already there is byte-identical');

// somebody coming back gets their row back, not a second one
rWorld({ retire: 'Alex White' });
as('chief@example.org');
retireFto();
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Alex White, awhite@example.org';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
as('chief@example.org');
out = addFto();
ok(rosterPeopleV1_().filter(x => x.name === 'Alex White').length === 1,
   'a returning officer does not get a duplicate row');
ok(/unretireFto/.test(out), 'it points at the function that actually brings them back');
ok(/how a roster starts lying/.test(out), 'and says why two rows would be wrong');

// already there and active
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Brandon Lee, someone@example.org';
as('chief@example.org');
out = addFto();
ok(/ALREADY ON THE ROSTER/.test(out), 'somebody already on it is a no-op');
ok(rosterPeopleV1_().filter(x => x.name === 'Brandon Lee').length === 1, 'with no second row');

// an address that belongs to somebody else decides whose trainees you open
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, blee@example.org';
as('chief@example.org');
out = addFto();
ok(/BELONGS TO SOMEBODY ELSE/.test(out), 'a shared address is refused');
ok(/Brandon Lee/.test(out), 'naming who already has it');
ok(!rosterPeopleV1_().some(x => x.name === 'Chyna Gray'), 'and she is not added');

// empty property
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = '';
ok(/Nothing is in PORTAL_ADD_FTO/.test(addFto()), 'an empty property says how to set it');

// the preview writes nothing
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
let beforeAdd = snap();
ok(/WOULD ADD/.test(addFtoBeforeAndAfter()), 'the preview says what it would do');
ok(snap() === beforeAdd, 'and writes nothing');

// undo removes the row, but only while it is still the blank slate written
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
const pristineRoster = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g);
addFto();
out = undoAddFto();
ok(!rosterPeopleV1_().some(x => x.name === 'Chyna Gray'), 'the undo removes her row');
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g) === pristineRoster,
   'and the roster is byte-identical to before');

rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
addFto();
const her = rosterPeopleV1_().filter(x => x.name === 'Chyna Gray')[0];
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g[her.row - 1][4] = 'Cleared to precept AEMT 8/21';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
out = undoAddFto();
ok(rosterPeopleV1_().some(x => x.name === 'Chyna Gray'),
   'a row somebody has put their own work into is not deleted');
ok(/KEPT/.test(out) && /NOTES/.test(out), 'and the undo says which column stopped it');

// Every roster change has to be followed by the tracker's own refreshDropdowns,
// or the nine forms keep offering the old roster and nothing says why.
rWorld({ retire: '' });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
ok(/refreshDropdowns/.test(addFto()), 'addFto says to refresh the form dropdowns');
rWorld({ retire: 'Alex White' });
as('chief@example.org');
const retiredOut = retireFto();
ok(/refreshDropdowns/.test(retiredOut), 'retireFto says so too');
ok(/separate script and cannot run it/.test(retiredOut),
   'and says why this portal cannot do it for you');

// Something that is not a name at all. Latavia Cole's ASSIGNED FTO ended up
// holding the dropdown's own help text, pasted in - a whole sentence. To every
// name-matching lookup that is just an officer nobody has heard of, and the
// cell reads as filled in, so nothing anywhere flagged it.
ok(looksLikeANameV1_('Chyna Gray') === true, 'a name is a name');
ok(looksLikeANameV1_('Tameisha Boone Williams') === true, 'a long one still is');
ok(looksLikeANameV1_('') === false, 'empty is not');
ok(looksLikeANameV1_('Now on the tab called 22 FTO ROSTER. Add or retire an FTO there, ' +
   'then run Refresh form dropdowns.') === false, 'a sentence of help text is not');

rWorld({ retire: '',
         master: [['Latavia Cole', 'EMT',
                   'Now on the tab called 22 FTO ROSTER. Add or retire an FTO there, ' +
                   'then run Refresh form dropdowns.', 'Active', 'lc@example.org']] });
as('chief@example.org');
out = START();
ok(/something other than a name/.test(out), 'START catches a cell holding a sentence');
ok(/Latavia Cole/.test(out), 'and names whose it is');
ok(/reads as filled in/.test(out), 'and says why nothing else caught it');
ok(!/no training officer at all/.test(out),
   'and does not also report it as blank, which it is not');

// START points at addFto when a trainee names somebody not on the roster
rWorld({ retire: '',
         master: [['Latavia Cole', 'EMT', 'Chyna Gray', 'Active', 'lc@example.org']] });
as('chief@example.org');
out = START();
ok(/not on the roster/.test(out), 'START sees the assignment pointing nowhere');
ok(/Latavia Cole -> Chyna Gray/.test(out), 'and says which trainee, to whom');
ok(/Run  addFto/.test(out), 'and offers the function that fixes it');
ok(/PORTAL_ADD_FTO/.test(out), 'naming the property to set');

// ---------------------------------------------------------------- //
section('The dropdown that refused a perfectly correct name');
// ---------------------------------------------------------------- //
// The ASSIGNED FTO column is a dropdown holding a fixed list of names typed
// in at some point in the past. It does not follow the roster. So every
// roster change quietly makes it wrong, and the sheet starts refusing names
// that are now correct - which is what stopped Harley Simms being written.

function dropWorld(opts) {
  opts = opts || {};
  rWorld({ retire: '', master: opts.master || [
    ['Latavia Cole', 'EMT', '', 'Active', 'lc@example.org'],
    ['Cassidy Bacci', 'EMT', 'Julieann White', 'Active', 'cb@example.org']] });
  // the stale list: the roster as it was some time ago
  BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER].setValidation(3,
    () => (opts.allowed || ['Julieann White', 'Brandon Lee']), 'VALUE_IN_LIST');
  TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
  as('chief@example.org');
}

// before: the sheet refuses somebody who is plainly on the roster
dropWorld();
const masterNow = () => BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER];
let refusedIt = false;
try { masterNow().getRange(HR + 1, 3).setValue('Chyna Gray'); }
catch (e) { refusedIt = /violates the data validation/.test(e.message); }
ok(refusedIt, 'the stale dropdown refuses a name that is on the roster');

// rebuilding it from the roster fixes exactly that
dropWorld();
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
addFto();
as('chief@example.org');
let dr = rebuildFtoDropdownV1_();
ok(dr.ok, 'the dropdown rebuilds');
ok(dr.names.indexOf('Chyna Gray') >= 0, 'and now offers everybody on the roster');
ok(dr.names.indexOf('Alex White') < 0 || rosterPeopleV1_()
     .filter(p => p.name === 'Alex White')[0].active,
   'and nobody who has left');
ok(threw(() => masterNow().getRange(HR + 1, 3).setValue('Chyna Gray')) === '',
   'so the cell that refused her a moment ago now takes her');

// the whole job in one function
dropWorld();
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
addFto();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Chyna Gray';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
as('chief@example.org');
let aOut = assignFto();
ok(/rebuilt from the roster first/.test(aOut),
   'assignFto rebuilds the dropdown before writing, not after');
ok(/ASSIGNED   Latavia Cole   ->   Chyna Gray/.test(aOut), 'and writes the assignment');
ok(!/THE SHEET REFUSED/.test(aOut), 'with nothing refused');
let lat = traineesV1_().filter(t => t.name === 'Latavia Cole')[0];
ok(lat.fto === 'Chyna Gray', 'the cell holds her officer');
ok(ftoProblemV1_(lat) === '', 'and she is no longer on nobody\'s list');

// she now appears on Chyna's screen, which is the entire point
as('cgray@example.org');
const chynaView = resolveViewerV1_(whoIsVisitingV1_());
ok(chynaView.role === PORTAL.ROLE.FTO, 'Chyna Gray signs in as a training officer');
ok(payloadForV1_(chynaView).trainees.map(t => t.name).indexOf('Latavia Cole') >= 0,
   'and Latavia Cole is on her list');

// a sentence in the cell is replaced like anything else
dropWorld({ master: [['Latavia Cole', 'EMT',
  'Now on the tab called 22 FTO ROSTER. Add or retire an FTO there, then run ' +
  'Refresh form dropdowns.', 'Active', 'lc@example.org']] });
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
addFto();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Chyna Gray';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
as('chief@example.org');
aOut = assignFto();
ok(/was "Now on the tab called/.test(aOut), 'the report shows what was in the cell');
ok(traineesV1_().filter(t => t.name === 'Latavia Cole')[0].fto === 'Chyna Gray',
   'and the sentence is gone');

// refusals
dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Somebody Nobody';
as('chief@example.org');
aOut = assignFto();
ok(/NOT ON THE ACTIVE ROSTER/.test(aOut), 'an officer not on the roster is refused');
ok(/on nobody\'s list/.test(aOut), 'and it says why that would be wrong');
ok(/addFto first/.test(aOut), 'pointing at the function that fixes it');
ok(traineesV1_().filter(t => t.name === 'Latavia Cole')[0].fto === '',
   'nothing was written');

dropWorld();
retireFtoNamed('Brandon Lee');
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Brandon Lee';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
as('chief@example.org');
ok(/NOT ON THE ACTIVE ROSTER/.test(assignFto()),
   'and somebody who has left is refused too');
function retireFtoNamed(n) {
  PROPS[PORTAL_RETIRE_PROPERTY] = n;
  TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
  as('chief@example.org');
  retireFto();
  PROPS[PORTAL_RETIRE_PROPERTY] = '';
}

dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Nobody Here -> Julieann White';
as('chief@example.org');
ok(/NO SUCH TRAINEE/.test(assignFto()), 'a trainee the master does not have is refused');

dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Cassidy Bacci -> Julieann White';
as('chief@example.org');
ok(/ALREADY ASSIGNED THAT WAY/.test(assignFto()), 'an assignment that is already right is a no-op');

dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = '';
ok(/Nothing is in PORTAL_ASSIGN/.test(assignFto()), 'an empty property says how to set it');

// the preview writes nothing
dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Julieann White';
as('chief@example.org');
let beforeAssign = snap();
ok(/WOULD ASSIGN/.test(assignBeforeAndAfter()), 'the preview says what it would do');
ok(snap() === beforeAssign, 'and writes nothing at all');

// undo
dropWorld();
PROPS[PORTAL_ASSIGN_PROPERTY] = 'Latavia Cole -> Julieann White';
as('chief@example.org');
assignFto();
ok(traineesV1_().filter(t => t.name === 'Latavia Cole')[0].fto === 'Julieann White', 'assigned');
ok(/put back/.test(undoAssign()), 'the undo says what it did');
ok(traineesV1_().filter(t => t.name === 'Latavia Cole')[0].fto === '',
   'and the cell is back to what it held');

// every roster change keeps the dropdown in step, so it cannot go stale again
dropWorld();
PROPS[PORTAL_ADD_FTO_PROPERTY] = 'Chyna Gray, cgray@example.org';
as('chief@example.org');
ok(/dropdown on 01 TRAINEE MASTER was rebuilt/.test(addFto()),
   'addFto rebuilds it');
ok(threw(() => masterNow().getRange(HR + 1, 3).setValue('Chyna Gray')) === '',
   'so the new officer is immediately assignable, with nothing else to run');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
