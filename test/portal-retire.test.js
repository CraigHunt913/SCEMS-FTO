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
      row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; }); }); return api; }
  };
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat'].forEach(m => api[m] = () => api);
  return api;
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
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','95_Unprocessed','96_Roster','97_Rename','98_Retire']
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

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
