const fs = require('fs');
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
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','93_Acknowledge','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto','99_AddTrainee']
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
section('The line breaks do not survive, and it does not need them');
// ---------------------------------------------------------------- //
// The Apps Script property editor is a single-line field. Paste a block into
// it and the newlines are gone. The first version of this read line by line,
// so the whole list arrived as one entry: one address, and everybody's name
// and everybody else's address jammed together as the "name".
const BLOCK = [
  'Dale Whitlock, dalewhitlock913@example.org',
  'Glenda Vane, vaneglenda9@example.org',
  'Rosa Quill, quillrosa4@example.org',
  'Marcus Bramble, marcusbramblej@example.org',
  'Kent Harlow, khharlow@example.org'
];
const COLLAPSED = BLOCK.join(' ');          // exactly what the editor stores

world({ list: COLLAPSED });
as('chief@example.org');
let pairs = rosterEmailLinesV1_();
ok(pairs.length === 5, 'five pairs come out of one long line, not one');
ok(pairs[0].name === 'Dale Whitlock' && pairs[0].email === 'dalewhitlock913@example.org',
   'the first pair is right');
ok(pairs[4].name === 'Kent Harlow' && pairs[4].email === 'khharlow@example.org',
   'and so is the last');
ok(!pairs.some(x => x.name.indexOf('@') >= 0),
   'no name has an address in it, which is what went wrong before');

p = rosterEmailPlanV1_();
ok(p.set.length === 5, 'and the plan fills in all five');
ok(!p.notFound.length, 'with nobody reported as not on the roster');

world({ list: BLOCK.join('\n') });
const withBreaks = rosterEmailPlanV1_();
world({ list: COLLAPSED });
const without = rosterEmailPlanV1_();
ok(JSON.stringify(withBreaks.set) === JSON.stringify(without.set),
   'line breaks or no line breaks, the plan is identical');

// a three-word name still holds together
world({ roster: ROSTER.concat([['Tamsin Boone Waller','D','EMT','Y','','','EMS 30']]),
        list: 'Tamsin Boone Waller, tboonewaller@example.org Kent Harlow, khharlow@example.org' });
pairs = rosterEmailLinesV1_();
ok(pairs.length === 2 && pairs[0].name === 'Tamsin Boone Waller',
   'a three-word name is not cut short by the walk');
ok(rosterEmailPlanV1_().set.length === 2, 'and both are matched');

// a shift column between the name and the address is not part of the name
world({ list: 'Kent Harlow A khharlow@example.org' });
pairs = rosterEmailLinesV1_();
ok(pairs.length === 1 && pairs[0].name === 'Kent Harlow',
   'a lone letter between name and address is dropped');

// an address with no name in front of it is not a pair
world({ list: 'orphan@example.org Kent Harlow, khharlow@example.org' });
pairs = rosterEmailLinesV1_();
ok(pairs.length === 1 && pairs[0].email === 'khharlow@example.org',
   'an address with nothing before it is skipped rather than given the next name');

// ---------------------------------------------------------------- //
section('It runs in one step, and the safety is in what it will not do');
// ---------------------------------------------------------------- //
// No confirmation code, deliberately. A handshake earns its place when a
// write is irreversible, or lands on something that already had a value, or
// could hit the wrong row. None of those is true here, and asking for one
// turned a two-minute job into an argument.
world();
as('chief@example.org');
ok(threw(() => applyRosterEmails()) === '',
   'it just runs - nothing has to be set first');
ok(emailAt('Kent Harlow') === 'khharlow@example.org', 'and the addresses are on the roster');

world();
as('chief@example.org');
applyRosterEmails();
ok(threw(() => undoRosterEmails()) === '', 'the undo needs nothing set either');
ok(emailAt('Kent Harlow') === '', 'and it undoes');

// What replaces the handshake is that the file cannot do the dangerous things.
const rosterSrc = fs.readFileSync('/home/user/SCEMS-FTO/portal/96_Roster.gs', 'utf8');
ok(rosterSrc.indexOf('requireImportAuthorityV1_') < 0,
   'the gate is gone from this file entirely, not merely bypassed');
ok(/var now = String\(sh\.getRange\(s\.row, col\)\.getValue/.test(rosterSrc),
   'it re-reads the cell immediately before writing, every time');

// The bulk row-adding writers keep theirs, because that is a different act.
const importSrc2 = fs.readFileSync('/home/user/SCEMS-FTO/portal/80_Import.gs', 'utf8');
ok(/requireImportAuthorityV1_\(code\)/.test(importSrc2),
   'adding rows to an evidence log still asks for a code');

// ---------------------------------------------------------------- //
section('It fills empty cells and refuses to change a full one');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
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
applyRosterEmails();
ok(emailAt('Dale Whitlock') === 'alreadyhere@example.org',
   'the address already there is untouched');
ok(emailAt('Glenda Vane') === 'vaneglenda9@example.org', 'while the empty ones are filled');

// a cell that stops being empty between the plan and the write
world();
as('chief@example.org');
p = rosterEmailPlanV1_();
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
const empty = rosterEmailsBeforeAndAfter();
ok(/No name-and-address pairs are in PORTAL_ROSTER_EMAILS/.test(empty),
   'an empty list says how to give it one');
ok(/the NAME first and then the address/.test(empty),
   'and says which way round each pair goes, since that is what the walk depends on');
ok(/property editor drops them/.test(empty),
   'and that the missing line breaks are expected');

// ---------------------------------------------------------------- //
section('And it comes back out again');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
const pristine = JSON.stringify(BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g);
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
applyRosterEmails();
BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g[HR + 2][5] = 'corrected.by.hand@example.org';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
rep = undoRosterEmails();
ok(/changed since it was written/.test(rep), 'the one that was edited is reported');
ok(emailAt('Rosa Quill') === 'corrected.by.hand@example.org',
   'and left exactly as the person left it');
ok(/outranks anything here/.test(rep), 'because a person editing it outranks this');
ok(emailAt('Kent Harlow') === '', 'the others are still emptied');

// ---------------------------------------------------------------- //
section('START says the one thing to do next, and only that');
// ---------------------------------------------------------------- //
// This is the only function anybody should have to remember. A Run dropdown
// with thirty names in it is not an interface, it is my internals handed to
// somebody else to sort out.
world();
as('chief@example.org');
let before2 = snap();
let out = START();
ok(/DO THIS NEXT/.test(out), 'it names a next step');
ok(/Run  applyRosterEmails/.test(out),
   'and with addresses ready and a roster that cannot sign in, that is the step');
ok(/cannot sign in/.test(out), 'saying what the problem actually is');
ok(out.indexOf('DO THIS NEXT') < out.indexOf('AFTER THAT') || !/AFTER THAT/.test(out),
   'the one thing comes before the rest');
ok(snap() === before2, 'and START writes nothing');

// With no list pasted yet, whether it is worth sending anybody to
// suggestFtoEmails depends entirely on whether that report has anything to
// say. Sending someone to a screen that answers "nothing to suggest" is a
// dead end, and dead ends are the thing that made this exhausting.
//
// Something to go on: a directory line naming one of them.
world({ list: '' });
PROPS[PORTAL_DIRECTORY_PROPERTY] = 'Harlow, Kent, khharlow@example.org';
as('chief@example.org');
out = START();
ok(/Run  suggestFtoEmails/.test(out),
   'with a directory line naming somebody, it sends you to the report');

// Nothing to go on: no list, no directory, no submissions. Naming the people
// is the useful thing left, and it says plainly that no function fixes this.
world({ list: '' });
as('chief@example.org');
out = START();
ok(!/Run  suggestFtoEmails/.test(out),
   'with nothing anywhere it does not send you to a report that has nothing');
ok(/needs a person/.test(out), 'it says so instead of naming a function');
ok(/Kent Harlow/.test(out), 'and names who is stuck, so the asking can start');

// once the roster is done it stops mentioning it
world({ roster: ROSTER.map(function (r) {
  var c = r.slice(); c[5] = 'someone@example.org'; return c; }) });
as('chief@example.org');
out = START();
ok(/all 5 training officers can sign in/.test(out), 'it says what is working');
ok(!/cannot sign in/.test(out), 'and stops raising what is already done');

// pointed nowhere at all
world();
delete PROPS[PORTAL.PROPERTY_TARGET];
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
out = START();
ok(/NOT POINTED AT ANYTHING YET/.test(out), 'with no target it says so first');
ok(/Run  setUpStaging/.test(out), 'and gives the one step that fixes it');
ok(!/AFTER THAT/.test(out), 'without burying it under everything else');

// the named menu wrappers all exist and none of them writes
world();
as('chief@example.org');
before2 = snap();
[WHERE_AM_I, CHECK_EVERYTHING, WHAT_IS_WAITING].forEach(function (fn) {
  ok(threw(function () { fn(); }) === '', fn.name + ' runs');
});
ok(snap() === before2, 'and none of the read-only menu entries wrote anything');

// ---------------------------------------------------------------- //
section('A name that changed has to change everywhere at once');
// ---------------------------------------------------------------- //
// The portal pairs a trainee to their training officer BY NAME. Fix the
// roster alone and her trainees quietly drop off her list, with nothing to
// show anything happened. So it is all of them or none.
function nameWorld() {
  world();
  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'],
    [['Kayla Voss','EMT','Rosa Quill','Active','kv@example.org'],
     ['Elena Marchetti','EMT','Rosa Quill','Active','em@example.org'],
     ['Annika Skye','Advanced EMT','Glenda Vane','Active','as@example.org']]);
  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','FTO','TRAINEE','PHASE','STRENGTH'],
    [[D('2026-08-10'),'Rosa Quill','Kayla Voss','Phase 2',
      'Rosa Quill talked her through the whole handover and it landed.']]);
  tab(PORTAL.TAB.EVIDENCE, ['EVENT DATE','TRAINEE','FTO','SKILL','NOTE','SOURCE RESPONSE ID'],
    [[D('2026-08-10'),'Kayla Voss','Rosa Quill','Intubation','','R-9']]);
  PROPS[PORTAL_RENAME_PROPERTY] = 'Rosa Quill -> Rosa Ledger';
  as('chief@example.org');
}

nameWorld();
let np = renamePlanV1_();
ok(np.pairs.length === 1 && np.pairs[0].to === 'Rosa Ledger', 'the pair is read');
const tabsHit = {};
np.cells.forEach(c => tabsHit[c.tab] = true);
ok(tabsHit[PORTAL.TAB.ROSTER], 'the roster is in the plan');
ok(tabsHit[PORTAL.TAB.MASTER], 'so is the trainee master');
ok(tabsHit[PORTAL.TAB.EVAL], 'so is the evaluation log');
ok(tabsHit[PORTAL.TAB.EVIDENCE], 'so is the evidence log');
ok(np.cells.length === 5,
   'five cells hold her name on its own: roster, two trainees, an eval, an evidence row');
ok(np.mentions.length === 1, 'and one place mentions her inside something written');
ok(/talked her through/.test(np.mentions[0].text), 'which is a narrative someone wrote');

nameWorld();
let out2 = applyRename();
ok(/5 cell\(s\) changed/.test(out2), 'all five change together');
const m = readTabV1_(PORTAL.TAB.MASTER);
ok(m.rows.filter(r => String(r[m.col['ASSIGNED FTO']]) === 'Rosa Ledger').length === 2,
   'both her trainees now name her by her new name');
const ros3 = readTabV1_(PORTAL.TAB.ROSTER);
ok(ros3.rows.some(r => String(r[ros3.col['FTO NAME']]) === 'Rosa Ledger'),
   'and so does the roster');

// the narrative is left exactly as it was written
const ev2 = readTabV1_(PORTAL.TAB.EVAL);
ok(/Rosa Quill talked her through/.test(String(ev2.rows[0][ev2.col['STRENGTH']])),
   'an evaluation that mentions her by name is NOT rewritten');
ok(/not touched/.test(out2), 'and the report says so');
ok(String(ev2.rows[0][ev2.col['FTO']]) === 'Rosa Ledger',
   'while the FTO column on that same row, which is only her name, does change');

// her trainees still find her, which is the whole point
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
const mine = traineesV1_().filter(t => normNameV1_(t.fto) === normNameV1_('Rosa Ledger'));
ok(mine.length === 2, 'and she still has both of them after the change');

// and back again
out2 = undoRename();
ok(/5 cell\(s\) put back/.test(out2), 'the undo restores every one');
const m2 = readTabV1_(PORTAL.TAB.MASTER);
ok(m2.rows.filter(r => String(r[m2.col['ASSIGNED FTO']]) === 'Rosa Quill').length === 2,
   'the trainees name her by the old name again');

// a name nothing holds
nameWorld();
PROPS[PORTAL_RENAME_PROPERTY] = 'Nobody Atall -> Somebody Else';
out2 = applyRename();
ok(/holds that name on its own, so nothing/.test(out2),
   'a name nothing holds changes nothing');
ok(/Check the spelling/.test(out2), 'and says to check the spelling');

nameWorld();
PROPS[PORTAL_RENAME_PROPERTY] = '';
ok(/Nothing is in PORTAL_RENAME/.test(applyRename()), 'an empty property says how to set it');

// ---------------------------------------------------------------- //
section('The dropdown on ASSIGNED FTO, and the order that satisfies it');
// ---------------------------------------------------------------- //
// The live tracker has a dropdown on the trainee master's ASSIGNED FTO
// column, and its list of allowed names is the roster. The tabs are numbered,
// so sorting the writes by tab name put "01 TRAINEE MASTER" first and
// "22 FTO ROSTER" last - exactly backwards. Google refused the new name on
// the master because at that instant the roster had never heard of her:
//   "The data you entered in cell E10 violates the data validation rules"

function dropdownWorld() {
  nameWorld();
  // the dropdown's allowed values ARE the roster, read live, as a range rule is
  const rosterNames = () => BOOKS['PROD-BOOK'][PORTAL.TAB.ROSTER].g
    .slice(HR).map(r => String(r[0] || '')).filter(Boolean);
  BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER]
    .setValidation(3, rosterNames, 'VALUE_IN_RANGE', "'22 FTO ROSTER'!A5:A30");
  TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
}

dropdownWorld();
const order = renamePlanV1_().cells;
ok(order[0].tab === PORTAL.TAB.ROSTER,
   'the roster is written first, because it is where a name is defined');
ok(order.filter(c => c.tab === PORTAL.TAB.MASTER)
        .every(c => order.indexOf(c) > order.lastIndexOf(order.filter(x => x.tab === PORTAL.TAB.ROSTER).pop())),
   'and everything that refers to it comes after');

dropdownWorld();
let dOut = applyRename();
ok(!/THE SHEET REFUSED/.test(dOut), 'so a live dropdown does not refuse the rename at all');
ok(emailFreeCell(PORTAL.TAB.MASTER, 0, 2) === 'Rosa Ledger',
   'the trainee master takes the new name');
ok(emailFreeCell(PORTAL.TAB.ROSTER, 2, 0) === 'Rosa Ledger', 'and so does the roster');

function emailFreeCell(tabName, dataRow, col) {
  return String(BOOKS['PROD-BOOK'][tabName].g[HR + dataRow][col] || '');
}

// A dropdown with a typed-out list cannot be satisfied by fixing the roster.
// It must not abandon the run halfway, and what DID go in must be recorded -
// a half-applied rename that cannot be reversed is worse than one that fails.
dropdownWorld();
BOOKS['PROD-BOOK'][PORTAL.TAB.MASTER]
  .setValidation(3, () => ['Rosa Quill', 'Glenda Vane'], 'VALUE_IN_LIST');
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
dOut = applyRename();

ok(/THE SHEET REFUSED/.test(dOut), 'a fixed list is reported, not swallowed');
ok(/typed-out list/.test(dOut), 'and says which kind of dropdown it is');
ok(/Data validation/.test(dOut), 'and where to change it');
ok(emailFreeCell(PORTAL.TAB.ROSTER, 2, 0) === 'Rosa Ledger',
   'the cells that COULD change still did - one refusal does not abandon the run');
ok(emailFreeCell(PORTAL.TAB.MASTER, 0, 2) === 'Rosa Quill',
   'and the refused cell keeps its old value');
ok(/name inconsistent/.test(dOut),
   'it says plainly that this is the state the function exists to prevent');

// the part that matters most: what went in is recorded, so it can be undone
const log = readTabV1_(PORTAL_RENAME_LOG);
ok(log.ok && log.rows.length >= 1,
   'the manifest is written even though something refused');
ok(log.rows.every(r => String(r[log.col['TAB']]) !== PORTAL.TAB.MASTER),
   'and records only what actually went in, never the refused cell');
const back = undoRename();
ok(emailFreeCell(PORTAL.TAB.ROSTER, 2, 0) === 'Rosa Quill',
   'so undoRename puts the half-applied rename back');
ok(/put back/.test(back), 'and says so');

// START notices the symptom: a trainee naming an FTO who is not on the roster
world();
tab(PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'],
  [['Kayla Voss','EMT','Rosa Ledger','Active','kv@example.org']]);
as('chief@example.org');
out2 = START();
ok(/training officer who is not on the roster/.test(out2),
   'START spots a trainee pointing at a name the roster does not have');
ok(/PORTAL_RENAME/.test(out2),
   'and names the property that fixes it - every item says why, not just the first');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
