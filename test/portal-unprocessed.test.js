// SCEMS Portal — what is already in the tracker and nothing is reading.
//
// A form linked to a spreadsheet drops its responses into a tab of its own
// whether or not anything is listening. So a form with no submit trigger does
// not lose answers - they arrive, they sit there, and nothing turns them into
// rows in the log the rest of the system reads.
//
// These tests cover finding those tabs without mistaking a real tab for one,
// saying which responses have nothing matching them, and reading addresses
// back out of them for a roster where nobody has one.
//
//   node test/portal-unprocessed.test.js

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
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto']
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

/** A tab with its header on PORTAL.HEADER_ROW, the way the tracker's are. */
function tab(name, headers, rows) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  if (!BOOKS['PROD-BOOK']) BOOKS['PROD-BOOK'] = {};
  BOOKS['PROD-BOOK'][name] = new FakeSheet(name, g);
}
/** A Google Forms response tab: header on ROW 1. */
function responseTab(name, headers, rows) {
  const g = [headers.slice()];
  rows.forEach(r => g.push(r));
  if (!BOOKS['PROD-BOOK']) BOOKS['PROD-BOOK'] = {};
  BOOKS['PROD-BOOK'][name] = new FakeSheet(name, g);
}
function snap() {
  return JSON.stringify(BOOKS, (k, v) => (v instanceof Date ? v.toISOString() : v));
}

const RESP_HEADERS = ['Timestamp','Email Address','FTO name','Trainee','Shift date',
                      'Airway / Ventilation [BVM ventilation]','Notes'];

function world(opts) {
  opts = opts || {};
  PROPS = {}; LOGS = []; BOOKS = {}; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  OPENABLE = { 'PROD-BOOK': 'SCEMS Field Training Tracker Master' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'PROD-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  FORMS = {}; FORM_FAILS = {};
  global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };

  // the roster: every one of them without an address, as in the live book
  tab(PORTAL.TAB.ROSTER,
    ['FTO NAME','SHIFT','CERT LEVEL','ACTIVE','NOTES','EMAIL','EMPLOYEE ID'],
    opts.roster || [
      ['Stephen Porth','A','Advanced EMT','Y','','','EMS 10'],
      ['Ada Robins','B','EMT','Y','','','EMS 18'],
      ['Makayla Harlow','C','EMT','Y','','','EMS 14'],
      ['Hanna Byrne','A','EMT','Y','','','EMS 23']
    ]);

  tab(PORTAL.TAB.EVIDENCE,
    ['EVENT DATE','TRAINEE','FTO','SKILL','NOTE','SOURCE RESPONSE ID'],
    [[D('2026-08-12'),'Annika Skye','Stephen Porth','Intubation','','R-1']]);

  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','EMAIL ADDRESS','FTO','TRAINEE','PHASE'],
    [[D('2026-08-14'),'hanna.byrne@example.org','Hanna Byrne','Kayla Voss','Phase 3']]);

  tab(PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'],
    [['Annika Skye','Advanced EMT','Stephen Porth','Active','annika.skye@example.org']]);

  // the response tabs, exactly as Google makes them
  responseTab('Form Responses 1', RESP_HEADERS, opts.responses || [
    [D('2026-08-13'),'oddhandle00064@example.org','Stephen Porth','Annika Skye',D('2026-08-12'),'Yes',''],
    [D('2026-08-06'),'','Makayla Harlow','Elena Marchetti',D('2026-08-04'),'Yes','No prompting.'],
    [D('2026-08-17'),'otherperson76@example.org','Ada Robins','Kayla Voss',D('2026-08-01'),'Yes','']
  ]);
  responseTab('Form Responses 2', RESP_HEADERS, []);
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }

// ---------------------------------------------------------------- //
section('Finding the response tabs, and only those');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
let tabs = formResponseTabsV1_();
ok(tabs.length === 2, 'both response tabs are found');
ok(tabs.map(t => t.name).sort().join(',') === 'Form Responses 1,Form Responses 2',
   'by their own names');
ok(tabs.filter(t => t.name === 'Form Responses 1')[0].rows.length === 3,
   'with their rows, read from row 2 because the header is on row 1');

ok(!tabs.some(t => knownTabV1_(t.name)),
   'a tab the portal already knows is never mistaken for one');

// a tab that merely starts with a date column is not a response tab
world();
tab('20 SOMETHING ELSE', ['Timestamp','Trainee'], [[D('2026-08-01'),'x']]);
ok(!formResponseTabsV1_().some(t => t.name === '20 SOMETHING ELSE'),
   'Timestamp alone is not the signature - it needs an Email Address column too');

world();
responseTab('Sheet9', ['Email Address','Timestamp'], [['a@b.c', D('2026-08-01')]]);
ok(!formResponseTabsV1_().some(t => t.name === 'Sheet9'),
   'and Timestamp has to be the FIRST column, as Google writes it');

// ---------------------------------------------------------------- //
section('Saying what is waiting, without claiming to be sure');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
let before = snap();
let rep = unprocessedResponses();
ok(/UNPROCESSED FORM RESPONSES/.test(rep), 'it reports');
ok(/Form Responses 1/.test(rep) && /3 responses/.test(rep), 'naming each tab and its count');
ok(/in the log .*Annika Skye/.test(rep),
   'a response with an evidence row on the same day and trainee is marked as in the log');
ok(/WAITING    .*Elena Marchetti/.test(rep), 'and one without is marked WAITING');
ok(/2 with nothing matching them/.test(rep), 'with a total that counts only the waiting ones');
ok(/These are NOT lost/.test(rep), 'it says outright that the answers are present');
ok(/strong hint, not a proof/.test(rep),
   'and does not overclaim - matching on trainee and date is a hint');
ok(snap() === before, 'and it wrote nothing');

world({ responses: [] });
ok(/nothing in it/.test(unprocessedResponses()), 'an empty response tab says so');

// ---------------------------------------------------------------- //
section('Addresses for a roster where nobody has one');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
before = snap();
rep = suggestFtoEmails();
ok(/4 on the roster, 0 with an address, 4 without/.test(rep),
   'it counts who can and cannot sign in');
ok(/Stephen Porth\n      oddhandle00064@example\.org/.test(rep),
   'and pairs a name with the account they submitted from');
ok(/Ada Robins\n      otherperson76@example\.org/.test(rep), 'for each of them');
ok(/Hanna Byrne\n      hanna\.byrne@example\.org/.test(rep),
   'including one found in the processed evaluation log rather than a response tab');
ok(/No submission on file for these/.test(rep) && /Makayla Harlow/.test(rep),
   'someone who submitted without an address recorded is listed as having none');
ok(/is not proof of identity/.test(rep),
   'and it says plainly that a typed name is not proof of who someone is');
ok(/Nothing here has been written to the roster/.test(rep), 'nothing was written');
ok(snap() === before, 'and the spreadsheet proves it');

// two accounts for one name is a decision, not a guess
world({ responses: [
  [D('2026-08-13'),'one@example.org','Stephen Porth','Annika Skye',D('2026-08-12'),'Yes',''],
  [D('2026-08-14'),'two@example.org','Stephen Porth','Annika Skye',D('2026-08-13'),'Yes',''],
  [D('2026-08-15'),'two@example.org','Stephen Porth','Annika Skye',D('2026-08-14'),'Yes','']
] });
rep = suggestFtoEmails();
ok(/MORE THAN ONE ACCOUNT, pick one/.test(rep), 'two accounts for one name is flagged');
ok(rep.indexOf('two@example.org') < rep.indexOf('one@example.org'),
   'with the most-used listed first, but neither chosen');

// somebody who already has one is left alone
world({ roster: [
  ['Stephen Porth','A','Advanced EMT','Y','','sporter@example.org','EMS 10'],
  ['Ada Robins','B','EMT','Y','','','EMS 18']
] });
rep = suggestFtoEmails();
ok(/2 on the roster, 1 with an address, 1 without/.test(rep), 'the counts are right');
ok(rep.indexOf('sporter@example.org') < 0, 'and an address already on the roster is not touched');

world({ roster: [['Stephen Porth','A','Advanced EMT','Y','','sporter@example.org','EMS 10']] });
ok(/Every one of them can sign in. Nothing to do./.test(suggestFtoEmails()),
   'a complete roster says there is nothing to do');

// ---------------------------------------------------------------- //
section('Matching a name to an address is a guess, and says so');
// ---------------------------------------------------------------- //
// These are the real shapes from the county's own directory. What matters is
// not that every one matches - it is that the confident ones and the guesses
// end up in different piles, because this decides who can open whose record.
[['Dale Whitlock', 'dalewhitlock913@example.org', 92],
 ['Glenda Vane', 'vaneglenda9@example.org', 92],
 ['Rosa Quill', 'quillrosa4@example.org', 92],
 ['Marcus Bramble', 'marcusbramblej@example.org', 92],
 ['Justin Hale', 'jhale@example.org', 86],
 ['Kent Harlow', 'khharlow@example.org', 84],
 ['Brandon Lisk', 'bglisk.contact@example.org', 84],
 ['Mallori Hobbs', 'malhobbs02@example.org', 76]
].forEach(function (t) {
  const got = nameShapeScoreV1_(t[0], t[1]);
  ok(got.score >= t[2], t[0] + ' matches ' + t[1] + '  (' + got.score + ', ' + got.why + ')');
});

[['Kinley Ashby', 'kinleymarsh@example.org'],
 ['Hanna Byrne', 'hannawilde0129@example.org'],
 ['Courtney Deane', 'courtneygumbel1@example.org'],
 ['Julieann Ward', 'julieannmoreau@example.org']
].forEach(function (t) {
  const got = nameShapeScoreV1_(t[0], t[1]);
  ok(got.score > 0 && got.score < 70,
     t[0] + ' against ' + t[1] + ' scores as a guess, not a match  (' + got.score + ')');
});

ok(nameShapeScoreV1_('Stephen Porth', 'oddhandle00064@example.org').score === 0,
   'an address with nothing of the name in it scores nothing at all');
ok(nameShapeScoreV1_('Alex Wray', 'awise@example.org').score === 0,
   'and a near miss on the surname is not a match');
ok(nameShapeScoreV1_('Hanna', 'hanna@example.org').score === 0,
   'one name is not enough to match on');

// the same address must not look equally like two people, silently
const a = nameShapeScoreV1_('Justin Hale', 'jhale@example.org');
const b = nameShapeScoreV1_('Jane Hale', 'jhale@example.org');
ok(a.score === b.score,
   'jhead scores the same for Justin Hale and Jane Hale, which is exactly why '
   + 'the report calls it probable rather than certain');

// ---------------------------------------------------------------- //
section('The directory is offered, never applied');
// ---------------------------------------------------------------- //
world({ roster: [
  ['Dale Whitlock','A','Paramedic','Y','','','EMS 1'],
  ['Justin Hale','A','Paramedic','Y','','','EMS 9'],
  ['Kinley Ashby','A','Advanced EMT','Y','','','EMS 8']
], responses: [] });
as('chief@example.org');
PROPS[PORTAL_DIRECTORY_PROPERTY] =
  'dalewhitlock913@example.org\njhale@example.org\nkinleymarsh@example.org\nsomeone@example.org';
before = snap();
rep = suggestFtoEmails();
ok(/FROM THE DIRECTORY  \(4 addresses\)/.test(rep), 'the directory is read');
ok(/MATCHED WITH CONFIDENCE[\s\S]*Dale Whitlock/.test(rep), 'a whole name is confident');
ok(/PROBABLE, check each one[\s\S]*Justin Hale/.test(rep), 'an initial and surname is probable');
ok(/GUESSWORK, ask the person[\s\S]*Kinley Ashby/.test(rep), 'a given name alone is guesswork');
ok(/a good-looking guess is still a guess/.test(rep), 'and it says so before the list');
ok(snap() === before, 'nothing was written to the roster or anywhere else');

world({ roster: [['Dale Whitlock','A','Paramedic','Y','','','EMS 1']], responses: [] });
ok(/paste it into the script property/.test(suggestFtoEmails()),
   'with no directory set it says how to give it one');

// ---------------------------------------------------------------- //
section('A directory line with a name on it settles what a shape cannot');
// ---------------------------------------------------------------- //
// The county's staff list is surname first, with a shift column between the
// name and the address. Two of these are people whose surname on the list is
// not the surname on the roster, and one is an address that looks like a
// different person entirely. A name on the line settles all three.
world({ roster: [
  ['Rosa Quill','B','EMT','Y','','','EMS 11'],
  ['Courtney Deane','A','EMT','Y','','','EMS 24'],
  ['Stephen Porth','B','Advanced EMT','Y','','','EMS 10']
], responses: [] });
as('chief@example.org');
PROPS[PORTAL_DIRECTORY_PROPERTY] = [
  'Ledger, Rosa, B, quillrosa4@example.org',
  'Deane, Courtney, A, crd91011@example.org',
  'Gumbel, Courtney, A, courtneygumbel1@example.org',
  'Porth, Stephen, B, oddhandle00064@example.org'
].join('\n');

const entries = directoryEntriesV1_();
ok(entries.length === 4, 'four lines, four entries');
ok(entries[0].name === 'Ledger Rosa', 'the name comes off the line');
ok(entries[0].email === 'quillrosa4@example.org', 'and so does the address');
ok(entries[1].name.split(' ').every(function (w) { return w.length > 1; }),
   'a single-letter shift column is not taken for part of a name');

ok(directoryNameMatchV1_('Courtney Deane', 'Deane Courtney'),
   'a surname-first list still matches the roster');
ok(!directoryNameMatchV1_('Courtney Deane', 'Gumbel Courtney'),
   'and a different Courtney does not');

before = snap();
rep = suggestFtoEmails();
ok(/NAMED IN THE DIRECTORY, not guessed at/.test(rep), 'named matches get their own section');
ok(/Courtney Deane\n         crd91011@example\.org/.test(rep),
   'Courtney Deane gets her own address, not the other Courtney\'s');
ok(rep.indexOf('courtneygumbel1') < 0,
   'and the other Courtney is not offered at all - a shape match would have offered her');
ok(/Stephen Porth\n         oddhandle00064@example\.org/.test(rep),
   'an address with nothing of the name in it is still matched, because the line names them');
// The staff list calls Rosa Quill "Ledger, Rosa", so no line NAMES her and the
// name match cannot fire. The shape match still finds her, because the address
// carries the surname the roster uses - and it lands under MATCHED WITH
// CONFIDENCE rather than NAMED, which is the honest distinction: the list and
// the roster disagree about her surname and a person has to say why.
ok(/MATCHED WITH CONFIDENCE\n  Rosa Quill\n         quillrosa4@example\.org/.test(rep),
   'a surname that changed is found by shape, and labelled as a shape match');
ok(!/NAMED IN THE DIRECTORY[\s\S]*?Rosa Quill[\s\S]*?MATCHED WITH/.test(rep),
   'and is not claimed to have been named, because no line names her');
ok(/the directory names them/.test(rep), 'the ones it did match say they were named');
ok(snap() === before, 'and nothing was written');

// Hanna Byrne has a submission in the fixture, and submission evidence outranks
// the directory - so she never reaches the directory section at all.
world({ roster: [['Hanna Byrne','D','EMT','Y','','','EMS 23']], responses: [] });
PROPS[PORTAL_DIRECTORY_PROPERTY] = 'Byrne, Hanna, D, hannawilde0129@example.org';
rep = suggestFtoEmails();
ok(/hanna\.byrne@example\.org   \(1 submission\)/.test(rep),
   'an address someone actually submitted from wins over one a list offers');
ok(rep.indexOf('hannahuff0129') < 0, 'and the directory is not consulted for her at all');

// two lines naming the same person is a question, not an answer
world({ roster: [['Kinley Ashby','A','Advanced EMT','Y','','','EMS 8']], responses: [] });
PROPS[PORTAL_DIRECTORY_PROPERTY] = [
  'Ashby, Kinley, A, kinleymarsh@example.org',
  'Ashby, Kinley, A, kashby@example.org'
].join('\n');
rep = suggestFtoEmails();
ok(/MORE THAN ONE line names them/.test(rep), 'two lines for one name are flagged, not resolved');
ok(/kinleymarsh/.test(rep) && /kashby@/.test(rep), 'and both are shown');

// a bare list of addresses still works the old way
world({ roster: [['Dale Whitlock','A','Paramedic','Y','','','EMS 1']], responses: [] });
PROPS[PORTAL_DIRECTORY_PROPERTY] = 'dalewhitlock913@example.org\nnobody@example.org';
rep = suggestFtoEmails();
ok(/MATCHED WITH CONFIDENCE[\s\S]*Dale Whitlock/.test(rep),
   'a directory with no names on it still matches by shape');
ok(!/NAMED IN THE DIRECTORY[\s\S]*Dale Whitlock/.test(rep.split('MATCHED WITH CONFIDENCE')[0]),
   'and does not claim to have been named');

// ---------------------------------------------------------------- //
section('The readiness check tells the two kinds of missing tab apart');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
before = snap();
rep = productionReadinessCheck();
ok(/not made PORTAL COACHING  \(optional\)/.test(rep),
   'a tab the portal would have made itself reads as not made, not as missing');
ok(/MISSING  05 SKILLS PROGRESS/.test(rep),
   'while a real source tab that is absent reads as MISSING');
ok(/portal's own and it will not create them in a live spreadsheet/.test(rep),
   'and it explains why it did not just make them');
ok(/4 on the roster have no address, so none of them can sign/.test(rep),
   'it counts the FTOs who cannot sign in');
ok(/suggestFtoEmails/.test(rep), 'and says what to run about it');
ok(/3 form response\(s\) are sitting in response tabs/.test(rep),
   'it notices responses nothing has processed');
ok(/unprocessedResponses/.test(rep), 'and says what to run about those too');
ok(snap() === before, 'and the whole check wrote nothing');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
