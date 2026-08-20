// SCEMS Portal — writing addresses onto the roster.
//
// This is the most consequential write in the project. An address in the
// roster's EMAIL column is what lets the portal recognise someone, so putting
// the wrong one there means a person opens somebody else's trainees.
//
// The tests are about the ways that could happen: a sorted roster and a
// pasted column falling one row out of step, a name that appears twice, an
// address arriving for someone who already has one, and a cell that stopped
// being empty between the plan and the write.
//
//   node test/portal-roster.test.js

const fs = require('fs');
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
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValues: function () { const o = [];
      for (let i = 0; i < NR; i++) { const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]); o.push(s); } return o; },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
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
eval(['00_Config','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','95_Unprocessed','96_Roster']
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

// ---------------------------------------------------------------- //
section('It reads names, not row numbers');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
let p = rosterEmailPlanV1_();
ok(p.set.length === 5, 'all five are planned');
// The list is alphabetical-ish; the roster is not. Every pairing must be right
// regardless, because "one row out" here means one person seeing another's
// trainees and nothing looking wrong.
const want = { 'Dale Whitlock':'dalewhitlock913@example.org','Glenda Vane':'vaneglenda9@example.org',
  'Rosa Quill':'quillrosa4@example.org','Marcus Bramble':'marcusbramblej@example.org',
  'Kent Harlow':'khharlow@example.org' };
p.set.forEach(s => ok(want[s.name] === s.email, s.name + ' is paired with their own address'));
ok(p.set[0].row < p.set[1].row, 'and the plan is in row order, not list order');

let before = snap();
rosterEmailsBeforeAndAfter();
ok(snap() === before, 'the preview writes nothing');

// ---------------------------------------------------------------- //
section('Nothing is written without the code for this exact plan');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
before = snap();
ok(/Refusing to write/.test(threw(() => applyRosterEmails())), 'with no code it refuses');
ok(snap() === before, 'and writes nothing');

PROPS[PORTAL_BACKFILL_CONFIRM] = 'PROD-BOOK';
ok(threw(() => applyRosterEmails()) === '',
   'the target id still works, for a confirmation set before codes existed');

world();
as('chief@example.org');
const code = rosterConfirmCodeV1_(rosterEmailPlanV1_());
ok(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{2}$/.test(code), 'the code is typeable: ' + code);
PROPS[PORTAL_ROSTER_EMAILS_PROPERTY] += '\nSomebody Else, other@example.org';
ok(rosterConfirmCodeV1_(rosterEmailPlanV1_()) === code,
   'a line that changes nothing on the roster does not change the code');
PROPS[PORTAL_ROSTER_EMAILS_PROPERTY] =
  'Dale Whitlock, someoneelse@example.org\nGlenda Vane, vaneglenda9@example.org';
ok(rosterConfirmCodeV1_(rosterEmailPlanV1_()) !== code,
   'but a different address does');

// ---------------------------------------------------------------- //
section('It fills empty cells and refuses to change a full one');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
PROPS[PORTAL_BACKFILL_CONFIRM] = rosterConfirmCodeV1_(rosterEmailPlanV1_());
let rep = applyRosterEmails();
ok(/5 address\(es\) written/.test(rep), 'all five are written');
Object.keys(want).forEach(n => ok(emailAt(n) === want[n], n + ' has their own address on the roster'));
ok(rosterRows().length === 5, 'and no row was added or removed');

// now offer a different address for someone who has one
world({ roster: ROSTER.map(r => r[0] === 'Dale Whitlock'
  ? ['Dale Whitlock','A','Paramedic','Y','','alreadyhere@example.org','EMS 1'] : r.slice()) });
as('chief@example.org');
p = rosterEmailPlanV1_();
ok(p.set.length === 4, 'the one with an address is not in the plan');
ok(p.hasOne.length === 1 && p.hasOne[0].name === 'Dale Whitlock', 'it is reported instead');
ok(p.hasOne[0].same === false, 'and noted as different from what was offered');
rep = rosterEmailsBeforeAndAfter();
ok(/OFFERED dalewhitlock913@example\.org INSTEAD/.test(rep), 'the preview shows both');
ok(/Nothing is overwritten/.test(rep), 'and says it will not choose');
PROPS[PORTAL_BACKFILL_CONFIRM] = rosterConfirmCodeV1_(p);
applyRosterEmails();
ok(emailAt('Dale Whitlock') === 'alreadyhere@example.org',
   'the address already there is untouched');
ok(emailAt('Glenda Vane') === 'vaneglenda9@example.org', 'while the empty ones are filled');

// a cell that stops being empty between the plan and the write
world();
as('chief@example.org');
p = rosterEmailPlanV1_();
PROPS[PORTAL_BACKFILL_CONFIRM] = rosterConfirmCodeV1_(p);
const sh = BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER];
sh.g[HR + 1][5] = 'typed.in.meanwhile@example.org';       // Dale Whitlock's row
rep = applyRosterEmails();
ok(/the cell was no longer empty/.test(rep), 'it notices and says so');
ok(emailAt('Dale Whitlock') === 'typed.in.meanwhile@example.org',
   'and leaves what somebody typed in the meantime alone');
ok(/4 address\(es\) written/.test(rep), 'the other four still go in');

// ---------------------------------------------------------------- //
section('An ambiguous name is a question, not a coin toss');
// ---------------------------------------------------------------- //
world({ roster: ROSTER.concat([['Dale Whitlock','D','EMT','Y','','','EMS 40']]) });
as('chief@example.org');
p = rosterEmailPlanV1_();
ok(p.twoRows.length === 1 && p.twoRows[0].name === 'Dale Whitlock',
   'two roster rows with one name is reported');
ok(!p.set.some(s => s.name === 'Dale Whitlock'), 'and neither is written to');
ok(/left alone/.test(rosterEmailsBeforeAndAfter()), 'the preview says so');

world({ list: 'Dale Whitlock, one@example.org\nDale Whitlock, two@example.org' });
as('chief@example.org');
p = rosterEmailPlanV1_();
ok(p.twoLines.length === 1, 'two lines naming one person is reported');
ok(!p.set.length, 'and nothing is written');

world({ list: 'Nobody Here, nobody@example.org' });
as('chief@example.org');
p = rosterEmailPlanV1_();
ok(p.notFound.length === 1, 'a name not on the roster is reported');
ok(!p.set.length, 'and adds nobody - this fills a roster, it does not build one');

world({ list: '' });
as('chief@example.org');
ok(/Nothing is in PORTAL_ROSTER_EMAILS/.test(rosterEmailsBeforeAndAfter()),
   'an empty list says how to give it one');

// ---------------------------------------------------------------- //
section('And it comes back out again');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
const pristine = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g);
PROPS[PORTAL_BACKFILL_CONFIRM] = rosterConfirmCodeV1_(rosterEmailPlanV1_());
applyRosterEmails();
ok(emailAt('Kent Harlow') === 'khharlow@example.org', 'written');
rep = undoRosterEmails();
ok(/5 cell\(s\) emptied/.test(rep), 'the undo empties exactly what it filled');
ok(JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g) === pristine,
   'and the roster is byte-identical to before');
ok(!!BOOKS['PROD-BOOK'][PORTAL_ROSTER_LOG], 'the log of what was done stays');

// somebody edited one by hand since
world();
as('chief@example.org');
PROPS[PORTAL_BACKFILL_CONFIRM] = rosterConfirmCodeV1_(rosterEmailPlanV1_());
applyRosterEmails();
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g[HR + 2][5] = 'corrected.by.hand@example.org';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
rep = undoRosterEmails();
ok(/changed since it was written/.test(rep), 'the one that was edited is reported');
ok(emailAt('Rosa Quill') === 'corrected.by.hand@example.org',
   'and left exactly as the person left it');
ok(/outranks anything here/.test(rep), 'because a person editing it outranks this');
ok(emailAt('Kent Harlow') === '', 'the others are still emptied');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
