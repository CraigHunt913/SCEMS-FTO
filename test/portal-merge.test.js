// SCEMS Portal — the other spreadsheets.
//
// Some of the record went somewhere else. The claim this layer makes is that
// it can be found and brought across without losing a value, without writing
// the same row twice, without touching the other book at all, and with a way
// back out.
//
// These tests attack all of that, and the awkward parts specifically: a row
// with no id of its own, a column order that does not match, a column the
// target does not have, and a second run.
//
//   node test/portal-merge.test.js

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
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','87_Settle','90_Staging','91_Record','92_Lifecycle','93_Acknowledge','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto','99_AddTrainee']
  .map(f => fs.readFileSync('/home/user/SCEMS-FTO/portal/' + f + '.gs', 'utf8'))
  .join('\n'));



const HR = PORTAL.HEADER_ROW;
const D = s => new Date(s + 'T12:00:00');

// Two books. BOOKS[id] is that book's own set of sheets.
let BOOKS = {};
function bookFor(id) {
  if (!BOOKS[id]) BOOKS[id] = {};
  const sheets = BOOKS[id];
  return {
    getId: () => id,
    getName: () => OPENABLE[id],
    getUrl: () => 'https://example/' + id,
    getSheetByName: n => sheets[n] || null,
    getSheets: () => Object.keys(sheets).map(n => sheets[n]),
    insertSheet: n => (sheets[n] = new FakeSheet(n, []))
  };
}
global.SpreadsheetApp = {
  openById: id => {
    if (OPENABLE[id] === undefined) throw new Error('No item with the given ID could be found');
    return bookFor(id);
  },
  create: () => bookFor('STG-BOOK'),
  getUi: () => { throw new Error('no ui'); }
};
// SHEETS is what the harness's helpers use; keep it pointed at the target
Object.defineProperty(global, 'SHEETS', {
  get() { return BOOKS['PROD-BOOK'] || (BOOKS['PROD-BOOK'] = {}); },
  set(v) { BOOKS['PROD-BOOK'] = v; },
  configurable: true
});

function tabIn(bookId, name, headers, rows) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  if (!BOOKS[bookId]) BOOKS[bookId] = {};
  BOOKS[bookId][name] = new FakeSheet(name, g);
  return BOOKS[bookId][name];
}

const EVIDENCE = ['EVENT DATE','TRAINEE','FTO','SKILL','STAGE','OUTCOME','NOTE','SOURCE RESPONSE ID'];
// Deliberately a different column ORDER, and one column this book does not have.
const STRAY    = ['TRAINEE','EVENT DATE','SKILL','FTO','OUTCOME','STAGE','NOTE'];

function world(mode, opts) {
  opts = opts || {};
  PROPS = {}; LOGS = []; BOOKS = {}; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  OPENABLE = { 'PROD-BOOK': 'SCEMS FTPD Tracker', 'STRAY-BOOK': 'SCEMS FTPD Tracker (copy)',
               'STG-BOOK': 'STG_Sandbox' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'PROD-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = mode || PORTAL.MODE_PRODUCTION;
  PROPS[PORTAL_OTHER_IDS_PROPERTY] = opts.others === undefined ? 'STRAY-BOOK' : opts.others;
  FORMS = {}; FORM_FAILS = {};
  global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };

  tabIn('PROD-BOOK', PORTAL.TAB.MASTER,
    ['TRAINEE','LEVEL','ASSIGNED FTO','START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL'],
    [['Jamie Rivers','Paramedic','Dana Whitlock',D('2026-06-01'),'Phase 2','Active','jamie@example.org']]);

  tabIn('PROD-BOOK', PORTAL.TAB.EVIDENCE, opts.destHeaders || EVIDENCE,
    [[D('2026-08-18'),'Jamie Rivers','Dana Whitlock','IV access','Independent','Successful','','R-106']]);

  tabIn('PROD-BOOK', PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);

  // the stray book: one row already here, three that never made it
  tabIn('STRAY-BOOK', PORTAL.TAB.EVIDENCE, STRAY, opts.strayRows || [
    ['Jamie Rivers', D('2026-08-18'),'IV access','Dana Whitlock','Successful','Independent',''],
    ['Jamie Rivers', D('2026-07-04'),'Intubation','Marcus Vane','Successful','Assisted',
     'First pass on a difficult airway after a failed attempt by the medic.'],
    ['Jamie Rivers', D('2026-07-11'),'Intubation','Dana Whitlock','Unsuccessful','Assisted',
     'Oesophageal placement, recognised immediately and corrected.'],
    ['Alex Bramble', D('2026-06-30'),'Tourniquet','Dana Whitlock','Successful','Independent',
     'High and tight, under a minute, no prompting.']
  ]);
  tabIn('STRAY-BOOK', 'Sheet1', ['SOMETHING','ELSE'], [['a','b']]);
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }
function evid(bookId) { return BOOKS[bookId][PORTAL.TAB.EVIDENCE].g.slice(HR); }
function snapOf(bookId) {
  return JSON.stringify(BOOKS[bookId], (k, v) => (v instanceof Date ? v.toISOString() : v));
}

// ---------------------------------------------------------------- //
section('Which other spreadsheets, from whatever was pasted');
// ---------------------------------------------------------------- //
world();
PROPS[PORTAL_OTHER_IDS_PROPERTY] =
  'https://docs.google.com/spreadsheets/d/STRAY-BOOK/edit#gid=0\n/d/OTHER-ONE/edit, THIRD-ONE';
const ids = otherBookIdsV1_();
ok(ids.length === 3, 'three books from a mix of addresses, fragments and bare ids');
ok(ids.indexOf('STRAY-BOOK') >= 0 && ids.indexOf('OTHER-ONE') >= 0 && ids.indexOf('THIRD-ONE') >= 0,
   'and each one is the id, not the address it came in');

PROPS[PORTAL_OTHER_IDS_PROPERTY] = 'STRAY-BOOK, STRAY-BOOK, PROD-BOOK';
const deduped = otherBookIdsV1_();
ok(deduped.length === 1 && deduped[0] === 'STRAY-BOOK', 'listed twice counts once');
ok(deduped.indexOf('PROD-BOOK') < 0,
   'and the book it is already pointed at is never one of the others');

PROPS[PORTAL_OTHER_IDS_PROPERTY] = 'the other one in my drive';
ok(otherBookIdsV1_().length === 0, 'a sentence names no spreadsheet, and is not guessed at');

// ---------------------------------------------------------------- //
section('Looking writes nothing, to either book');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
let here = snapOf('PROD-BOOK'), there = snapOf('STRAY-BOOK');
let rep = whatElseIsOutThere();
ok(/SCEMS FTPD Tracker \(copy\)/.test(rep), 'it names the other spreadsheet');
ok(/\[known\]/.test(rep), 'and marks the tabs this portal understands');
ok(/Sheet1/.test(rep), 'while still listing the ones it does not');
ok(/1 already here, 3 not/.test(rep), 'and says how many rows are not here yet');
ok(snapOf('PROD-BOOK') === here && snapOf('STRAY-BOOK') === there,
   'both spreadsheets are byte-identical afterwards');

rep = mergeBeforeAndAfter();
ok(/BEFORE AND AFTER/.test(rep) && /nothing has been written/.test(rep), 'the plan reports');
ok(/holds 1 rows/.test(rep), 'the before count is real');
ok(/would hold 4 rows/.test(rep), 'and so is the after count');
ok(/Oesophageal placement/.test(rep),
   'every value of every row it would add is shown, including the unflattering ones');
ok(snapOf('PROD-BOOK') === here && snapOf('STRAY-BOOK') === there, 'and still nothing written');

// ---------------------------------------------------------------- //
section('Column order does not have to match');
// ---------------------------------------------------------------- //
world();
const plan = mergePlanV1_('STRAY-BOOK', PORTAL.TAB.EVIDENCE);
ok(plan.total === 4 && plan.present === 1 && plan.missing.length === 3,
   'the row already here is recognised despite a different column order');
const first = plan.missing[0];
const dest = readTabV1_(PORTAL.TAB.EVIDENCE);
function cell(row, header) { return row[dest.headers.indexOf(header)]; }
ok(cell(first.row, 'TRAINEE') === 'Jamie Rivers', 'the trainee lands under TRAINEE');
ok(cell(first.row, 'SKILL') === 'Intubation', 'the skill under SKILL');
ok(cell(first.row, 'FTO') === 'Marcus Vane', 'the FTO under FTO');
ok(cell(first.row, 'STAGE') === 'Assisted', 'the stage under STAGE, not where it sat over there');
ok(cell(first.row, 'EVENT DATE') instanceof Date, 'and the date arrives as a date, not text');
ok(String(cell(first.row, 'SOURCE RESPONSE ID')).indexOf('MERGED:') === 0,
   'a row with no id of its own is given a stable key');

// ---------------------------------------------------------------- //
section('A column the target does not have is carried, not dropped');
// ---------------------------------------------------------------- //
world(null, { strayRows: [
  ['Jamie Rivers', D('2026-07-04'),'Intubation','Marcus Vane','Successful','Assisted','A note.']
] });
BOOKS['STRAY-BOOK'][PORTAL.TAB.EVIDENCE].g[HR - 1].push('SUPERVISOR PRESENT');
BOOKS['STRAY-BOOK'][PORTAL.TAB.EVIDENCE].g[HR].push('Yes, Captain Reyes');
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
const carried = mergePlanV1_('STRAY-BOOK', PORTAL.TAB.EVIDENCE);
ok(carried.missing.length === 1, 'the row still comes across');
const note = String(cell(carried.missing[0].row, 'NOTE'));
ok(note.indexOf('A note.') >= 0, 'its own note survives');
ok(note.indexOf('Supervisor present: Yes, Captain Reyes') >= 0 ||
   note.indexOf('SUPERVISOR PRESENT: Yes, Captain Reyes') >= 0,
   'and the extra column is carried into the note with its name attached');
ok(carried.missing[0].carried === 1, 'and counted, so it is not a silent change');

// nowhere to put it: refuse the row rather than write it short
world(null, { destHeaders: ['EVENT DATE','TRAINEE','SKILL','SOURCE RESPONSE ID'] });
const refused = mergePlanV1_('STRAY-BOOK', PORTAL.TAB.EVIDENCE);
ok(refused.missing.length === 0, 'nothing is queued');
ok(refused.blocked.length > 0, 'the rows are refused');
ok(/no notes column/.test(refused.blocked[0].why), 'and it says why');
ok(JSON.stringify(refused.blocked[0].spare).indexOf('Dana Whitlock') >= 0,
   'listing the values that had nowhere to go, so they are visible rather than gone');

// no id column at all: refuse the whole tab
world(null, { destHeaders: ['EVENT DATE','TRAINEE','SKILL','NOTE'] });
const noKey = mergePlanV1_('STRAY-BOOK', PORTAL.TAB.EVIDENCE);
ok(/no response id column/i.test(noKey.problem),
   'without a key column there is no way to tell a second run from a duplicate');
ok(noKey.missing.length === 0, 'so nothing is planned');

// ---------------------------------------------------------------- //
section('Bringing it across is behind the same gate');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
here = snapOf('PROD-BOOK'); there = snapOf('STRAY-BOOK');
ok(/Set the script property/.test(threw(() => runMergeForReal())),
   'with no confirmation it refuses');
PROPS[PORTAL_BACKFILL_CONFIRM] = 'STRAY-BOOK';
const backwards = threw(() => runMergeForReal());
ok(/Refusing to write/.test(backwards),
   'a confirmation naming the OTHER book does not authorise writing to this one');
// Naming the source instead of the destination is the obvious way to get this
// backwards. The refusal has to say which way round it goes, not just report
// a mismatch and leave you to work it out.
ok(/READ FROM/.test(backwards) && /WRITTEN TO/.test(backwards),
   'and says which direction the confirmation points');
ok(/PORTAL_OTHER_SPREADSHEET_IDS/.test(backwards),
   'naming the property that holds the one being read from');
ok(/^[\s\S]*Set PORTAL_BACKFILL_CONFIRM to\n  [23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{2}/
     .test(backwards),
   'and printing the exact code to use instead');
ok(/the code for exactly the changes you were just shown/.test(backwards),
   'saying what that code is good for, so it is clearly not a spreadsheet address');
ok(snapOf('PROD-BOOK') === here && snapOf('STRAY-BOOK') === there, 'nothing written either time');

// a confirmation naming some unrelated book gets the mismatch without the
// read-from wording, because that is not what happened
PROPS[PORTAL_BACKFILL_CONFIRM] = 'SOMETHING-ELSE-ENTIRELY';
const unrelated = threw(() => runMergeForReal());
ok(/Refusing to write/.test(unrelated), 'an unrelated id is refused too');
ok(!/READ FROM/.test(unrelated), 'without claiming it is one of the sources');

// ---------------------------------------------------------------- //
section('The settings screen shows both directions at once');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
PROPS[PORTAL_BACKFILL_CONFIRM] = 'STRAY-BOOK';
const before2 = snapOf('PROD-BOOK'), beforeStray = snapOf('STRAY-BOOK');
let settings = showSettings();
ok(/PORTAL SETTINGS/.test(settings), 'it reports');
ok(/Reads and writes : PROD-BOOK/.test(settings), 'naming what it is pointed at');
ok(/THE OTHER SPREADSHEETS, READ FROM/.test(settings), 'and the ones read from');
ok(/STRAY-BOOK   SCEMS FTPD Tracker \(copy\)/.test(settings),
   'with the name of each, so a wrong one is obvious');
ok(/DOES NOT MATCH/.test(settings), 'it flags a confirmation pointing the wrong way');
ok(/a spreadsheet being read from/.test(settings), 'and says what it is pointing at instead');
ok(snapOf('PROD-BOOK') === before2 && snapOf('STRAY-BOOK') === beforeStray,
   'and writes nothing to either book');

PROPS[PORTAL_BACKFILL_CONFIRM] = 'PROD-BOOK';
settings = showSettings();
ok(/MATCHES the spreadsheet above. Writing is unlocked./.test(settings),
   'set the right way round, it says writing is unlocked');
delete PROPS[PORTAL_BACKFILL_CONFIRM];
ok(/nothing can be written/.test(showSettings()), 'unset, it says nothing can be written');
PROPS[PORTAL_BACKFILL_CONFIRM] = 'PROD-BOOK';

const hereRecord = JSON.stringify(Object.keys(BOOKS['PROD-BOOK'])
  .filter(n => n !== PORTAL_BACKFILL_LOG && n !== PORTAL.TAB.AUDIT)
  .sort().map(n => [n, BOOKS['PROD-BOOK'][n].g]),
  (k, v) => (v instanceof Date ? v.toISOString() : v));

PROPS[PORTAL_BACKFILL_CONFIRM] = 'https://docs.google.com/spreadsheets/d/PROD-BOOK/edit';
rep = runMergeForReal();
ok(/MERGE COMPLETE/.test(rep), 'the right confirmation, pasted as an address, runs it');
ok(evid('PROD-BOOK').length === 4, 'the evidence log now holds all four');
ok(/rows before   : 5/.test(rep) && /rows after    : 8/.test(rep),
   'and the report gives the count either side');
ok(snapOf('STRAY-BOOK') === there,
   'the other spreadsheet is byte-identical - it was only ever read');

// ---------------------------------------------------------------- //
section('A second run adds nothing, and it comes back out exactly');
// ---------------------------------------------------------------- //
const afterMerge = snapOf('PROD-BOOK');
rep = runMergeForReal();
ok(/Nothing to bring across/.test(rep), 'running it again brings nothing');
ok(evid('PROD-BOOK').length === 4, 'and the sheet is unchanged');
ok(snapOf('PROD-BOOK') === afterMerge, 'byte-identical after the second run');

rep = undoLastBackfill();
ok(/REVERSED/.test(rep), 'the same undo reverses a merge');
ok(/3 row\(s\) removed/.test(rep), 'removing exactly what it added');
ok(evid('PROD-BOOK').length === 1, 'the evidence log is back to one row');
// The manifest tab survives on purpose: it is the record of what was done and
// undone. Everything that holds actual training data is compared instead.
function recordTabsOf(bookId) {
  return JSON.stringify(Object.keys(BOOKS[bookId])
    .filter(n => n !== PORTAL_BACKFILL_LOG && n !== PORTAL.TAB.AUDIT)
    .sort().map(n => [n, BOOKS[bookId][n].g]),
    (k, v) => (v instanceof Date ? v.toISOString() : v));
}
ok(recordTabsOf('PROD-BOOK') === hereRecord,
   'and every tab holding training data is byte-identical to before the merge');
ok(!!BOOKS['PROD-BOOK'][PORTAL_BACKFILL_LOG],
   'the manifest stays, because it is the record of what was done and undone');

// a re-merge after an undo works, because the keys are deterministic
PROPS[PORTAL_BACKFILL_CONFIRM] = 'PROD-BOOK';
runMergeForReal();
ok(evid('PROD-BOOK').length === 4, 'and it can be brought across again afterwards');
const keys = evid('PROD-BOOK').map(r => r[7]);
ok(new Set(keys).size === 4, 'with the same keys, all distinct');

// ---------------------------------------------------------------- //
section('The key is stable, and specific');
// ---------------------------------------------------------------- //
const H = ['TRAINEE','SKILL','OUTCOME'];
const a = ['Jamie Rivers', 'Intubation', 'Successful'];
ok(rowFingerprintV1_(H, a) === rowFingerprintV1_(H, a.slice()),
   'the same row yields the same key twice');
ok(rowFingerprintV1_(H, a) === rowFingerprintV1_(H, ['jamie  rivers', 'Intubation', 'SUCCESSFUL']),
   'case and spacing do not make it a different row');
ok(rowFingerprintV1_(H, a) !== rowFingerprintV1_(H, ['Jamie Rivers', 'Intubation', 'Unsuccessful']),
   'but a different outcome does');
ok(rowFingerprintV1_(H, a) !== rowFingerprintV1_(H, ['Alex Bramble', 'Intubation', 'Successful']),
   'and so does a different person');
ok(rowFingerprintV1_(['DATE'], [D('2026-07-04')]) ===
   rowFingerprintV1_(['DATE'], [D('2026-07-04')]),
   'two equal dates are the same row');
ok(rowFingerprintV1_(['DATE'], [D('2026-07-04')]) !==
   rowFingerprintV1_(['DATE'], [D('2026-07-05')]),
   'two different dates are not');

// ---------------------------------------------------------------- //
section('An unreachable book costs that book and nothing else');
// ---------------------------------------------------------------- //
world(null, { others: 'STRAY-BOOK, GONE-BOOK' });
as('chief@example.org');
rep = whatElseIsOutThere();
ok(/cannot open/.test(rep), 'a book it cannot open says so');
ok(/1 already here, 3 not/.test(rep), 'and the one it can read is still surveyed');
PROPS[PORTAL_BACKFILL_CONFIRM] = 'PROD-BOOK';
rep = runMergeForReal();
ok(evid('PROD-BOOK').length === 4, 'and the reachable book still comes across');

// ---------------------------------------------------------------- //
section('The portal reads BOTH spreadsheets without moving anything');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
const untouched = snapOf('STRAY-BOOK'), untouchedHere = snapOf('PROD-BOOK');

const combined = readTabAllV1_(PORTAL.TAB.EVIDENCE);
ok(combined.combined === true, 'the combined read is in use');
ok(combined.rows.length === 4,
   'one row from the tracker plus the three only the other book has');
ok(readTabV1_(PORTAL.TAB.EVIDENCE).rows.length === 1,
   'while the plain read still sees only this spreadsheet, which is what writes use');
ok(snapOf('STRAY-BOOK') === untouched && snapOf('PROD-BOOK') === untouchedHere,
   'and neither spreadsheet was written to');

// the row present in both is not shown twice
const skills = combined.rows.map(r => r[combined.headers.indexOf('SKILL')]);
ok(skills.filter(x => x === 'IV access').length === 1,
   'a row that exists in both books appears once, not twice');
ok(skills.filter(x => x === 'Intubation').length === 2, 'and both intubation events arrive');

// values land under the right heading despite the different column order
const trainees = combined.rows.map(r => r[combined.headers.indexOf('TRAINEE')]);
ok(trainees.filter(x => x === 'Alex Bramble').length === 1,
   'a trainee only in the other book is there');
const ftos = combined.rows.map(r => r[combined.headers.indexOf('FTO')]);
ok(ftos.indexOf('Marcus Vane') >= 0, 'and the FTO column holds FTOs, not something else');

// every foreign row is labelled and has no row number here
combined.rows.forEach((r, i) => {
  const from = rowSourceV1_(combined, i);
  const row = realRowV1_(combined, i);
  if (i === 0) {
    ok(from === '' && row === combined.firstDataRow,
       'the row from this spreadsheet keeps its real row number');
  } else {
    ok(from === 'SCEMS FTPD Tracker (copy)', 'a row from elsewhere names its book');
    ok(row === -1, 'and carries no row number here, so nothing can write to it');
  }
});

// ---------------------------------------------------------------- //
section('Nothing writes to a row it only borrowed');
// ---------------------------------------------------------------- //
world(PORTAL.MODE_STAGING);
tabIn('PROD-BOOK', PORTAL.TAB.QUEUE,
  ['READY DATE','TRAINEE','SKILL','EVIDENCE SUMMARY','DECISION','DECIDED BY',
   'DECISION DATE','RATIONALE','RECORD STATUS'],
  [[D('2026-08-17'),'Jamie Rivers','Intubation','4 of 4','','','','','OPEN']]);
tabIn('STRAY-BOOK', PORTAL.TAB.QUEUE,
  ['READY DATE','TRAINEE','SKILL','EVIDENCE SUMMARY','DECISION','DECIDED BY',
   'DECISION DATE','RATIONALE','RECORD STATUS'],
  [[D('2026-08-16'),'Alex Bramble','Tourniquet','3 of 3','','','','','OPEN']]);
tabIn('PROD-BOOK', PORTAL.TAB.ROSTER, ['FTO','EMAIL'], [['Dana Whitlock','dana@example.org']]);
PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
as('chief@example.org');

const queue = openQueueV1_();
ok(queue.length === 2, 'the Division sees the open items from both books');
const mine = queue.filter(q => !q.from)[0];
const borrowed = queue.filter(q => q.from)[0];
ok(!!mine && !!borrowed, 'one of each');
ok(borrowed.row === -1, 'the borrowed one carries no row number');
ok(borrowed.trainee === 'Alex Bramble', 'and it is the one only the other book has');

const strayBefore = snapOf('STRAY-BOOK');
const refusedWrite = threw(() => approveSignoffV1(borrowed.row, 'Evidence reviewed in person.'));
ok(/not in this spreadsheet/.test(refusedWrite),
   'approving it is refused, because the row is not here');
ok(/where the row actually lives/.test(refusedWrite), 'and it says what to do instead');
ok(snapOf('STRAY-BOOK') === strayBefore, 'the other spreadsheet is untouched');

ok(threw(() => approveSignoffV1(mine.row, 'Evidence reviewed in person.')) === '',
   'while the row that IS here approves normally');
const qHere = readTabV1_(PORTAL.TAB.QUEUE);
ok(String(qHere.rows[mine.row - qHere.firstDataRow][qHere.col['DECISION']]) === 'Approve sign-off',
   'and lands on the right row');

// ---------------------------------------------------------------- //
section('The confirmation is a code for one set of changes');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
const plans = mergePlanAllV1_();
const code = confirmCodeForV1_('PROD-BOOK', plans);
ok(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{2}$/.test(code),
   'the code is short, typeable, and has no O against 0 or I against 1: ' + code);
ok(confirmCodeForV1_('PROD-BOOK', plans) === code, 'the same plan gives the same code');
ok(confirmCodeForV1_('OTHER-BOOK', plans) !== code, 'a different target gives a different code');
ok(confirmCodeForV1_('PROD-BOOK', []) !== code, 'and so does a different set of changes');

const preview = mergeBeforeAndAfter();
ok(preview.indexOf(code) >= 0, 'the preview prints the code for what it just showed you');
ok(/You do not have to do this/.test(preview),
   'and says outright that the portal already reads the other book');

PROPS[PORTAL_BACKFILL_CONFIRM] = code;
ok(/MERGE COMPLETE/.test(runMergeForReal()), 'the code authorises exactly that merge');

// a code from one plan does not authorise a different one
world();
as('chief@example.org');
PROPS[PORTAL_BACKFILL_CONFIRM] = confirmCodeForV1_('PROD-BOOK', []);
const wrongCode = threw(() => runMergeForReal());
ok(/Refusing to write/.test(wrongCode), 'a code for a different plan is refused');
ok(/not a code this portal issued/.test(wrongCode), 'and is not mistaken for a spreadsheet');

// with nothing listed, it says that rather than complaining about the gate
world(null, { others: '' });
as('chief@example.org');
delete PROPS[PORTAL_BACKFILL_CONFIRM];
const none = runMergeForReal();
ok(/No other spreadsheets are listed/.test(none),
   'no sources listed reads as no sources listed, not as an authorisation problem');
ok(/PORTAL_OTHER_SPREADSHEET_IDS/.test(none), 'and names the property to set');

// ---------------------------------------------------------------- //
section('A stale copy must not contradict this book about a person');
// ---------------------------------------------------------------- //
// Reading a second spreadsheet exists so a row this book has never seen can
// still be found. It must never let an OLD copy overrule this one about
// somebody who is in both - because then every screen shows whichever copy
// it reached first, and a closed trainee comes back to life.
//
// That happened. A four-month-old copy of the tracker was being read
// alongside it. In that copy Amanda Carr was still open, Elizabeth McInville
// still named an officer who has since resigned, and Harley had her old
// name. All three came back from START as live problems needing a person,
// and not one of them was real.

world();
tabIn('PROD-BOOK', PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'], [
  ['Amanda Carr','Advanced EMT','Alex White','Closed / Released','ac@example.org'],
  ['Elizabeth McInville','EMT','Harley Simms','Active','em@example.org']
]);
// the old copy: same people, out of date, plus one this book never had
tabIn('OLD-BOOK', PORTAL.TAB.MASTER, ['TRAINEE','LEVEL','ASSIGNED FTO','SET STATUS','TRAINEE EMAIL'], [
  ['Amanda Carr','Advanced EMT','Alex White','Cleared to Independent Practice','ac@example.org'],
  ['Elizabeth McInville','EMT','Harley Pack','Formal Remediation','em@example.org'],
  ['Laken Atkinson','EMT','Craig Hunt','Active','la@example.org']
]);
OPENABLE['OLD-BOOK'] = 'SCEMS_Field_Training_Tracker_Master';
PROPS[PORTAL_OTHER_IDS_PROPERTY] = 'OLD-BOOK';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;

const all = traineesV1_();
const carr = all.filter(t => t.name === 'Amanda Carr');
ok(carr.length === 1, 'a person in both books appears once, not twice');
ok(carr[0].closed === true,
   'and closed, because THIS book says closed - the old copy does not get a vote');
ok(carr[0].from === '', 'the surviving row is the one from this book');

const liz = all.filter(t => t.name === 'Elizabeth McInville');
ok(liz.length === 1, 'so does the one whose officer was renamed');
ok(liz[0].fto === 'Harley Simms',
   'naming the officer THIS book names, not the name the old copy still has');
ok(liz[0].status === 'Active', 'with this book\'s status');

const laken = all.filter(t => t.name === 'Laken Atkinson');
ok(laken.length === 1,
   'somebody only the other book has is still found - that is what it is for');
ok(laken[0].from === 'SCEMS_Field_Training_Tracker_Master',
   'and is marked as coming from there');
ok(laken[0].row === -1, 'with no row here, so nothing can write to them by accident');

// and none of it reaches START as a problem
as('chief@example.org');
const stOut = START();
ok(!/Amanda Carr/.test(stOut),
   'START stops reporting a closed trainee as stranded on somebody who left');
ok(!/Harley Pack/.test(stOut), 'and stops resurrecting the old name');
ok(/SCEMS_Field_Training_Tracker_Master/.test(stOut),
   'while naming the other book it is reading, so this is never invisible');
ok(/Rows here always win/.test(stOut), 'and saying which one wins');
ok(new RegExp(PORTAL_OTHER_IDS_PROPERTY).test(stOut),
   'and how to stop reading it if it is an old copy');

// the roster obeys the same rule
tabIn('PROD-BOOK', PORTAL.TAB.ROSTER, ['FTO NAME','EMAIL','ACTIVE'],
    [['Harley Simms','hs@example.org','Y']]);
tabIn('OLD-BOOK', PORTAL.TAB.ROSTER, ['FTO NAME','EMAIL','ACTIVE'],
    [['Harley Simms','hs@example.org','Y'], ['Old Timer','ot@example.org','Y']]);
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
const ros = rosterPeopleV1_(true);
ok(ros.filter(p => p.name === 'Harley Simms').length === 1,
   'an officer in both books appears once');
ok(ros.filter(p => p.name === 'Old Timer').length === 1,
   'and one only the other book has is still there');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
