// SCEMS Portal — the record: current first, nothing lost.
//
// The claim this layer makes is that every submission ever gathered is still
// there and still readable in full, arranged so the most recent one leads.
//
// These tests attack that claim from both ends. They check that the newest
// submission is the one marked current, and they check that no earlier one is
// dropped, truncated, merged, or edited on the way through - including the
// awkward cases: an undated row, a same-day double submission, a column a
// form added later, and a person whose record another person must not open.
//
//   node test/portal-history.test.js

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
function tab(name, headers, rows) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
}
const D = s => new Date(s + 'T12:00:00');

// Long text, on purpose. The one thing this layer must never do is shorten a
// narrative someone wrote about a real shift.
const LONG = 'Ran the airway on a prolonged resuscitation without prompting and kept the ' +
  'crew calm throughout. Recognised the failed first pass himself, called for the bougie, ' +
  'and got it on the second attempt without losing the compression fraction. Handover to ' +
  'the receiving facility was complete and in order. The only thing I would change is the ' +
  'radio report, which was rushed and had to be repeated twice before it was understood.';

function world(mode) {
  PROPS = {}; SHEETS = {}; LOGS = []; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  OPENABLE = { 'STG-BOOK': 'STG_Sandbox', 'PROD-BOOK': 'SCEMS FTPD Tracker' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = mode || PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  PROPS['PORTAL_MEDICAL_EMAILS'] = 'md@example.org';
  PROPS['PORTAL_SUPERVISORS'] = JSON.stringify({ 'sup@example.org': 'A' });
  PROPS['PORTAL_FORM_LINKS'] = 'OFF';
  FORMS = {}; FORM_FAILS = {};

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
     'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [['Jamie Rivers','S1','Paramedic','A','Dana Whitlock',D('2026-06-01'),'Phase 2','Active','jamie@example.org',D('2026-07-15'),'A'],
     ['Alex Bramble','S2','EMT','A','Dana Whitlock',D('2026-05-04'),'Phase 3','Active','alex@example.org',D('2026-07-01'),'A'],
     ['Priya Okafor','S3','Advanced EMT','B','Marcus Vane',D('2026-04-12'),'Phase 4','Active','priya@example.org',D('2026-08-01'),'B']]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus@example.org','Paramedic','Yes']]);
  tab(PORTAL.TAB.SKILLS, ['TRAINEE','SKILL','READINESS','SIGN-OFF','SUCCESSFUL REPS','INDEPENDENT REPS'],
    [['Jamie Rivers','IV access','SIGNED OFF','SIGNED OFF',5,3]]);
  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [[D('2026-08-17'),'Jamie Rivers','SK-2','A','Intubation','4 of 4','','','','','','OPEN',D('2026-08-17'),'QR-1']]);

  // Deliberately out of order in the sheet. The archive is append-order; the
  // portal is the thing that puts it in order.
  tab(PORTAL.TAB.EVAL,
    ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE','SHIFT DATE','ASSESSMENT','DOCUMENTATION','STRENGTH','IMPROVE'],
    [[D('2026-06-10'),'Marcus Vane','Jamie Rivers','Paramedic','Phase 1',D('2026-06-10'),3,2,
      'Kept up on a busy shift.','Scene control.'],
     [D('2026-08-18'),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2',D('2026-08-18'),4,3,
      LONG,'Radio reports are still rushed.'],
     [D('2026-07-02'),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2',D('2026-07-02'),4,3,
      'Good IV work under pressure.','Slow the primary survey.'],
     // same day, twice: a real double submission
     [D('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3',D('2026-08-16'),4,3,
      'Tourniquet applied correctly.','Slow down.'],
     [D('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3',D('2026-08-16'),4,4,
      'Second filing. Documentation rating corrected.','Same as above.'],
     // no date at all
     ['','Dana Whitlock','Alex Bramble','EMT','Phase 3','',3,3,
      'Filed with no timestamp.','Unknown.'],
     [D('2026-08-14'),'Marcus Vane','Priya Okafor','Advanced EMT','Phase 4',D('2026-08-14'),5,5,
      'Ready for release.','Nothing.']]);

  tab(PORTAL.TAB.REFLECT, ['TIMESTAMP','TRAINEE','WHAT WENT WELL','WHAT WAS HARD','WHAT I WANT TO WORK ON'],
    [[D('2026-08-11'),'Jamie Rivers','The arrest finally clicked.','Radio reports.','Slowing my handover.'],
     [D('2026-07-04'),'Jamie Rivers','Nothing much.','Everything.','Confidence.']]);

  tab(PORTAL.TAB.URGENT, ['TIMESTAMP','CALLED?','YOUR NAME','TRAINEE INVOLVED','WHAT HAPPENED','ACTION TAKEN'],
    [[D('2026-08-17'),'Yes','Dana Whitlock','Alex Bramble',
      'Drew the correct medication at the wrong concentration. Caught on the second check before administration.',
      'Held from medication administration pending review.']]);

  tab(PORTAL.TAB.EVIDENCE,
    ['EVENT DATE','TRAINEE','FTO','SKILL','SKILL ID','STAGE','OUTCOME','NOTE','SOURCE RESPONSE ID'],
    [[D('2026-08-12'),'Jamie Rivers','Marcus Vane','Intubation','SK-2','Assisted','Successful','Second attempt.','R-098'],
     [D('2026-08-17'),'Jamie Rivers','Dana Whitlock','Intubation','SK-2','Independent','Successful','First pass.','R-104'],
     [D('2026-08-18'),'Jamie Rivers','Dana Whitlock','IV access','SK-1','Independent','Successful','Two patent.','R-106'],
     [D('2026-06-20'),'Jamie Rivers','Marcus Vane','IV access','SK-1','Assisted','Unsuccessful','Blown vein.','R-041']]);

  tab(PORTAL.TAB.SIGNOFF, ['SIGN-OFF DATE','TRAINEE','SKILL','SKILL ID','SIGNED OFF BY','RATIONALE'],
    [[D('2026-08-18'),'Jamie Rivers','IV access','SK-1','chief@example.org','Five successful across three shifts.']]);

  tab(PORTAL.TAB.COACHING, ['DATE','TRAINEE','FROM','NOTE','ACKNOWLEDGED'],
    [[D('2026-08-18'),'Jamie Rivers','Dana Whitlock','Radio reports still rushed.',''],
     [D('2026-07-01'),'Jamie Rivers','Dana Whitlock','Good progress on vascular access.','YES']]);

  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }
function snapshot() { return JSON.stringify(SHEETS, (k, v) => (v instanceof Date ? v.toISOString() : v)); }
function sect(rec, key) { return rec.sections.filter(s => s.key === key)[0]; }
function textOf(sub) { return (sub.fields || []).map(f => f.value).join(' | '); }

// ---------------------------------------------------------------- //
section('The most recent submission leads, and the sheet order does not matter');
// ---------------------------------------------------------------- //
world();
let rec = recordForV1_('Jamie Rivers');
const ev = sect(rec, 'EVAL');
ok(ev.count === 3, 'all three of Jamie’s evaluations are found');
ok(ev.current.length === 1, 'exactly one is current');
ok(ev.current[0].when === D('2026-08-18').toDateString(),
   'and it is the newest, even though it sits second in the sheet');
ok(ev.earlier.length === 2, 'the other two are kept as earlier');
ok(ev.earlier[0].when === D('2026-07-02').toDateString() &&
   ev.earlier[1].when === D('2026-06-10').toDateString(),
   'in order, newest of the earlier ones first');

const refl = sect(rec, 'REFLECT');
ok(refl.current[0].when === D('2026-08-11').toDateString(), 'the newest reflection is current');
ok(refl.earlier.length === 1, 'and the older one is still there');

// ---------------------------------------------------------------- //
section('Nothing is lost, shortened, or merged');
// ---------------------------------------------------------------- //
world();
rec = recordForV1_('Jamie Rivers');
ok(rec.total === 3 + 2 + 4 + 1 + 2,
   'every row belonging to Jamie across all six tabs is present: ' + rec.total);

const long = textOf(ev.current[0]);
ok(rec.sections.some(s => s.current.concat(s.earlier).some(x => textOf(x).indexOf(LONG) >= 0)),
   'a 400-character narrative comes through whole');
const found = rec.sections.flatMap(s => s.current.concat(s.earlier))
  .filter(x => textOf(x).indexOf(LONG) >= 0)[0];
ok(textOf(found).indexOf('repeated twice before it was understood') >= 0,
   'including its last sentence, so nothing was truncated');
ok(!/…|\.\.\./.test(textOf(found)), 'and there is no ellipsis anywhere in it');

// every populated column arrives with its own label
const oneEval = ev.current[0];
const labels = oneEval.fields.map(f => f.label);
ok(labels.indexOf('Assessment') >= 0 && labels.indexOf('Documentation') >= 0,
   'the rating columns come through');
ok(labels.indexOf('Strength') >= 0 && labels.indexOf('Improve') >= 0,
   'the narrative columns come through');
ok(labels.indexOf('Level') >= 0 && labels.indexOf('Phase') >= 0,
   'and so do the columns nobody thought to ask for');
ok(labels.indexOf('Trainee') < 0 && labels.indexOf('FTO') < 0,
   'the person and the author are lifted out rather than repeated as fields');
ok(oneEval.by === 'Dana Whitlock', 'the author is carried separately');

// a column added to a form later needs no code change
world();
SHEETS[PORTAL.TAB.EVAL].g[HR - 1].push('CREW RESOURCE MANAGEMENT');
SHEETS[PORTAL.TAB.EVAL].g[HR + 1].push('Held the scene together.');
rec = recordForV1_('Jamie Rivers');
ok(textOf(sect(rec, 'EVAL').current[0]).indexOf('Held the scene together.') >= 0,
   'a column added to a form tomorrow appears without this code changing');

// an empty cell is omitted rather than shown as a blank labelled field
world();
ok(sect(recordForV1_('Jamie Rivers'), 'EVAL').current[0].fields
   .every(f => String(f.value).trim() !== ''), 'empty cells are left out, not shown blank');

// ---------------------------------------------------------------- //
section('Reading a record changes nothing');
// ---------------------------------------------------------------- //
world();
const before = snapshot();
recordForV1_('Jamie Rivers');
recordForV1_('Alex Bramble');
freshnessForV1_('Jamie Rivers');
ok(snapshot() === before, 'six tabs are byte-identical after building two full records');

world(PORTAL.MODE_PRODUCTION);
const beforeProd = snapshot();
as('chief@example.org');
recordV1('Jamie Rivers');
ok(snapshot() === beforeProd,
   'and against the live tracker not even the audit row is written');
ok(SHEETS[PORTAL.TAB.AUDIT].g.length === HR,
   'the audit tab still has only its header');

world();
as('chief@example.org');
recordV1('Jamie Rivers');
ok(SHEETS[PORTAL.TAB.AUDIT].g.length === HR + 1,
   'in staging the read IS logged, so there is a trail of who opened what');

// ---------------------------------------------------------------- //
section('A double submission is flagged, and both are kept');
// ---------------------------------------------------------------- //
world();
rec = recordForV1_('Alex Bramble');
const aEval = sect(rec, 'EVAL');
ok(aEval.count === 3, 'all three of Alex’s evaluation rows survive');
ok(rec.duplicates === 2, 'the same-day pair is flagged, both halves of it');
const dupes = aEval.current.concat(aEval.earlier).filter(x => x.possibleDuplicate);
ok(dupes.length === 2, 'and both are still in the record');
ok(dupes.some(x => textOf(x).indexOf('Second filing') >= 0),
   'including the correction');
ok(dupes.some(x => textOf(x).indexOf('Tourniquet applied correctly') >= 0),
   'and the original it corrects');
ok(aEval.current[0].possibleDuplicate === true,
   'the newer of the pair leads, and says it may be a duplicate');

// the undated row is last, not missing
const undated = aEval.current.concat(aEval.earlier).filter(x => x.when === 'no date recorded');
ok(undated.length === 1, 'the row with no timestamp is still in the record');
ok(aEval.earlier[aEval.earlier.length - 1].when === 'no date recorded',
   'and it sorts last rather than first');
ok(!aEval.current[0].when.startsWith('no date'),
   'an undated row never becomes the current one by accident');

// ---------------------------------------------------------------- //
section('The Division is told where two submissions compete');
// ---------------------------------------------------------------- //
world();
const dups = duplicateSubmissionsV1_();
ok(dups.length === 1, 'one place needs a decision');
ok(dups[0].trainee === 'Alex Bramble' && dups[0].source === 'Shift evaluation',
   'it names the person and the kind');
ok(dups[0].count === 2 && dups[0].rows.length === 2, 'and both rows, not just the loser');
ok(dups[0].tab === PORTAL.TAB.EVAL, 'and the tab they are actually in');

const dupBefore = snapshot();
const rep = duplicateSubmissionsReport();
ok(/Alex Bramble/.test(rep) && /rows /.test(rep), 'the report names the rows to look at');
ok(/nothing here makes it for you/.test(rep), 'and does not decide for you');
ok(snapshot() === dupBefore, 'and changes nothing');

// a closed trainee is not chased for decisions
world();
SHEETS[PORTAL.TAB.MASTER].g[HR][7] = 'Closed / Released';        // Jamie
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(duplicateSubmissionsV1_().length === 1,
   'closing Jamie does not change Alex’s duplicate');
SHEETS[PORTAL.TAB.MASTER].g[HR + 1][7] = 'Closed / Released';    // Alex
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(duplicateSubmissionsV1_().length === 0,
   'and closing Alex takes the decision off the list without touching the rows');
ok(SHEETS[PORTAL.TAB.EVAL].g.length === HR + 7, 'both rows are still in the sheet');

// ---------------------------------------------------------------- //
section('Division settles a pair from Field Training — raw rows stay');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
let settleList = duplicateSubmissionsV1_();
ok(settleList.length === 1, 'Alex’s pair is waiting');
ok(!!settleList[0].dupKey, 'and carries a dupKey for the settlement log');
const pair = duplicatePairDetailV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey);
ok(pair.sides.length === 2, 'detail returns both sides');
ok(pair.sides.every(s => (s.fields || []).length > 0), 'each side still has its fields');

as('dana@example.org');
ok(/Only the Training Division/.test(threw(() =>
  settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
    'BOTH_STAND', 'Both filings are correct for that day.', '', settleList[0].source))),
  'an FTO cannot settle');

as('chief@example.org');
ok(/Type why/.test(threw(() =>
  settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
    'BOTH_STAND', 'short', '', settleList[0].source))),
  'a short reason is refused');

const evalRowsBefore = SHEETS[PORTAL.TAB.EVAL].g.length;
const settled = settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
  'BOTH_STAND', 'Both filings are correct for that day — keep both.', '', settleList[0].source);
ok(settled.ok === true, 'Division can settle both stand');
ok(SHEETS[PORTAL.TAB.EVAL].g.length === evalRowsBefore, 'source rows were not deleted');
ok(!!SHEETS['PORTAL SETTLEMENTS'], 'PORTAL SETTLEMENTS was created');
ok(duplicateSubmissionsV1_().length === 0, 'Settle no longer raises the settled pair');
const again = settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
  'BOTH_STAND', 'Both filings are correct for that day — keep both.', '', settleList[0].source);
ok(again.ok === true && /Already settled/i.test(again.message || ''),
   'settling twice is a no-op, not a second row fight');

world();
as('chief@example.org');
settleList = duplicateSubmissionsV1_();
const keep = settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
  'KEEP_ROW', 'The second filing is the correction that stands.',
  settleList[0].rows[1], settleList[0].source);
ok(keep.ok === true && /stands/i.test(keep.message || ''), 'KEEP_ROW records which row stands');
ok(duplicateSubmissionsV1_().length === 0, 'and that pair leaves Settle too');

world();
as('chief@example.org');
settleList = duplicateSubmissionsV1_();
ok(/Pick which row on this book/.test(threw(() =>
  settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
    'KEEP_ROW', 'Trying to keep a row that is not in the pair.', 99999, settleList[0].source))),
  'KEEP_ROW refuses a row that is not in the live pair');

as('dana@example.org');
ok(/Only the Training Division/.test(threw(() =>
  duplicatePairDetailV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey))),
  'an FTO cannot open Settle pair detail');

as('chief@example.org');
const notConflict = settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
  'NOT_A_CONFLICT', 'Two filings, two different shifts that share a calendar day label.',
  '', settleList[0].source);
ok(notConflict.ok === true, 'NOT_A_CONFLICT is a first-class settlement');
ok(duplicateSubmissionsV1_().length === 0, 'and it clears Settle');

world();
as('chief@example.org');
settleList = duplicateSubmissionsV1_();
settleDuplicateV1(settleList[0].trainee, settleList[0].tab, settleList[0].dupKey,
  'BOTH_STAND', 'Both filings are correct for that day — keep both.', '', settleList[0].source);
const afterRec = recordForV1_('Alex Bramble');
ok(afterRec.duplicates === 0, 'settled pairs stop shouting on the personnel record');
const stillMarked = afterRec.sections.flatMap(s => s.current.concat(s.earlier))
  .filter(x => x.possibleDuplicate);
ok(stillMarked.length === 0, 'no submission still carries possibleDuplicate after settle');

// ---------------------------------------------------------------- //
section('Queue refresh: exact READY only, no slash-bars, no double OPEN');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
tab(PORTAL.TAB.SKILLS,
  ['TRAINEE','SKILL','SKILL ID','READINESS','SIGN-OFF','SUCCESSFUL REPS','INDEPENDENT REPS',
   'DISTINCT DATES','DISTINCT FTOS','DOMAIN','LAST DATE'],
  [['Jamie Rivers','Intubation','SK-2','READY FOR VALIDATION','',4,2,2,2,'Airway',D('2026-08-17')],
   ['Jamie Rivers','IV access','SK-1','NOT READY FOR VALIDATION','',1,0,1,1,'Vascular',D('2026-08-10')],
   ['Alex Bramble','Tourniquet','SK-6','READY FOR VALIDATION','',3,3,2,2,'Trauma',D('2026-08-16')]]);
// Existing OPEN has skill name but no id — must block a matrix row that has SK-2.
tab(PORTAL.TAB.QUEUE,
  ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
   'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
  [[D('2026-08-17'),'Jamie Rivers','','A','Intubation','already open','','','','','','OPEN',D('2026-08-17'),'QR-1']]);
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
const refreshed = refreshValidationQueueV1();
ok(refreshed.added === 1, 'adds Alex’s READY skill, not Jamie’s already-open Intubation: ' + refreshed.added);
const qData = SHEETS[PORTAL.TAB.QUEUE].g.slice(HR);
ok(qData.length === 2, 'queue has original + one new: ' + qData.length);
const added = qData.filter(r => String(r[1]) === 'Alex Bramble')[0];
ok(!!added, 'Alex’s row was appended');
ok(!/\d+\s*\/\s*\d+\s*\/\s*\d+/.test(String(added[5] || '')),
   'evidence is not a bare slash list that breaks bars: ' + added[5]);
ok(/successful/i.test(String(added[5] || '')), 'evidence reads as human counts');
ok(parseEvidenceBarsV1_(added[5]) === null,
   'parseEvidenceBars does not invent have/need from the refresh text');
const notReady = qData.filter(r => /NOT READY/i.test(String(r[5] || '')) ||
  String(r[4] || '') === 'IV access');
ok(notReady.length === 0, 'NOT READY FOR VALIDATION never becomes an OPEN row');

// ---------------------------------------------------------------- //
section('Six tabs are read once, not once per person');
// ---------------------------------------------------------------- //
world();
let READS = 0;
const realRead = readTabUncachedV1_;
readTabUncachedV1_ = function (n) { READS++; return realRead(n); };
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
divisionPayloadV1_();
const readsForEveryone = READS;
readTabUncachedV1_ = realRead;
ok(readsForEveryone <= Object.keys(PORTAL.TAB).length + 2,
   'the Division screen reads each tab at most once for the whole roster: ' + readsForEveryone);

world();
READS = 0;
readTabUncachedV1_ = function (n) { READS++; return realRead(n); };
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
recordForV1_('Jamie Rivers');
recordForV1_('Alex Bramble');
recordForV1_('Priya Okafor');
readTabUncachedV1_ = realRead;
ok(READS <= 7, 'three full records share one pass over the sources (+ settlements): ' + READS);

// the cache must never serve a value that has just been overwritten
world();
as('chief@example.org');
recordForV1_('Jamie Rivers');
approveSignoffV1(HR + 1, 'Watched the last attempt myself and it was clean.');
const qNow = readTabV1_(PORTAL.TAB.QUEUE);
ok(String(qNow.rows[0][qNow.col['RATIONALE']]).indexOf('Watched the last attempt') === 0,
   'a read straight after a write sees the written value');
ok(String(qNow.rows[0][qNow.col['RECORD STATUS']]) === 'RECORDED',
   'and the row is RECORDED — Field Training writes the permanent log itself');

// ---------------------------------------------------------------- //
section('Skills are current per skill, not one winner overall');
// ---------------------------------------------------------------- //
world();
rec = recordForV1_('Jamie Rivers');
const evid = sect(rec, 'EVIDENCE');
ok(evid.count === 4, 'all four skill events are found');
ok(evid.current.length === 2, 'two are current: one per skill');
const currentSkills = evid.current.map(x => x.group).sort();
ok(currentSkills.join(',') === 'IV access,Intubation', 'one for each skill logged');
ok(evid.current.filter(x => x.group === 'Intubation')[0].when === D('2026-08-17').toDateString(),
   'the newest intubation event is the current one');
ok(evid.earlier.filter(x => x.group === 'IV access')[0].when === D('2026-06-20').toDateString(),
   'and the failed attempt from June is kept, not hidden');
ok(textOf(evid.earlier.filter(x => x.group === 'IV access')[0]).indexOf('Unsuccessful') >= 0,
   'an unsuccessful attempt stays on the record in full');

// ---------------------------------------------------------------- //
section('The timeline merges every kind into one order');
// ---------------------------------------------------------------- //
world();
rec = recordForV1_('Jamie Rivers');
ok(rec.timeline.length === rec.total, 'the timeline holds every submission');
const stamps = rec.timeline.map(x => Date.parse(x.when)).filter(n => !isNaN(n));
ok(stamps.every((n, i) => i === 0 || stamps[i - 1] >= n), 'strictly newest first');
ok(new Set(rec.timeline.map(x => x.source)).size >= 4,
   'and it spans evaluations, reflections, skills and coaching');
ok(rec.timeline.every(x => x.at === undefined),
   'the sort key is not shipped to the browser');

// ---------------------------------------------------------------- //
section('Freshness answers "how current is this" without loading the record');
// ---------------------------------------------------------------- //
world();
const fresh = freshnessForV1_('Jamie Rivers');
ok(fresh.length >= 4, 'every unrestricted kind is reported');
ok(fresh.filter(f => f.key === 'EVAL')[0].count === 3, 'with a count');
ok(fresh.filter(f => f.key === 'URGENT').length === 0,
   'urgent concerns are not summarised into a badge on a routine screen');
const sam = freshnessForV1_('Nobody At All');
ok(sam.every(f => f.ago === 'never' && f.count === 0),
   'a person with nothing on file reads as never, not as an error');

// ---------------------------------------------------------------- //
section('Whose record you may open is decided on the server');
// ---------------------------------------------------------------- //
world();
as('jamie@example.org');
ok(recordV1('Jamie Rivers').total > 0, 'a trainee opens their own record');
ok(/not able to open/.test(threw(() => recordV1('Alex Bramble'))),
   'and is refused another trainee’s, rather than given a filtered version');
ok(/not able to open/.test(threw(() => recordV1('ALEX   BRAMBLE'))),
   'spacing and case do not get round it');

as('dana@example.org');
ok(recordV1('Jamie Rivers').total > 0, 'an FTO opens a trainee assigned to them');
ok(recordV1('Alex Bramble').total > 0, 'and another of their own');
ok(/not able to open/.test(threw(() => recordV1('Priya Okafor'))),
   'but not one assigned to a different FTO');

as('chief@example.org');
ok(recordV1('Priya Okafor').total > 0, 'the Training Division opens anyone');
ok(recordV1('Jamie Rivers').partial === false, 'and sees the whole record');

as('sup@example.org');
ok(/not able to open/.test(threw(() => recordV1('Jamie Rivers'))),
   'a supervisor gets situational awareness, not a training record');

as('md@example.org');
const mdRec = recordV1('Alex Bramble');
ok(mdRec.partial === true, 'the Medical Director gets a partial record');
ok(mdRec.sections.length === 1 && mdRec.sections[0].key === 'URGENT',
   'consisting of urgent concerns and nothing else');
ok(JSON.stringify(mdRec).indexOf('Tourniquet applied correctly') < 0,
   'no routine evaluation reaches them');
ok(JSON.stringify(mdRec).indexOf('wrong concentration') >= 0,
   'but the concern itself arrives in full');

as('');
ok(threw(() => recordV1('Jamie Rivers')).length > 0, 'an unidentified viewer is refused');
as('stranger@example.org');
ok(threw(() => recordV1('Jamie Rivers')).length > 0, 'so is an account not on any list');

// ---------------------------------------------------------------- //
section('Headers stop shouting, and the tabs it reads stay findable');
// ---------------------------------------------------------------- //
ok(labelForV1_('WHAT WENT WELL') === 'What went well', 'a header reads as a sentence');
ok(labelForV1_('FTO NAME') === 'FTO name', 'an acronym keeps its case');
ok(labelForV1_('SOURCE RESPONSE ID') === 'Source response ID', 'and so does ID');
ok(labelForV1_('12-LEAD ACQUISITION') === '12-lead acquisition', 'a number leads without being capitalised');
ok(labelForV1_('') === '', 'an empty header stays empty');

world();
delete SHEETS[PORTAL.TAB.EVIDENCE];
rec = recordForV1_('Jamie Rivers');
ok(!sect(rec, 'EVIDENCE'), 'a missing tab contributes nothing');
ok(sect(rec, 'EVAL').count === 3, 'and costs nothing from the tabs that are there');

// a tab whose header row a form rewrote: the positional fallback carries it
world();
SHEETS[PORTAL.TAB.EVAL].g[HR - 1] = ['', '', '', '', '', '', '', '', '', ''];
rec = recordForV1_('Jamie Rivers');
ok(sect(rec, 'EVAL') && sect(rec, 'EVAL').count === 3,
   'a blanked header row falls back to position and still finds all three');

// ---------------------------------------------------------------- //
section('The record screen renders, and shows earlier only when asked');
// ---------------------------------------------------------------- //
const page = fs.readFileSync('/home/user/SCEMS-FTO/portal/Index.html', 'utf8');
const body = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));

world();
as('chief@example.org');
const boot = { version: PORTAL.VERSION, mode: 'PRODUCTION',
  viewer: { email: 'chief@example.org', role: 'TRAINING_DIVISION', name: 'Chief', ok: true, why: '' },
  data: divisionPayloadV1_(), error: '' };
const nodes = {};
const fakeDoc = { getElementById: k => (nodes[k] = nodes[k] ||
  { textContent: '', innerHTML: '', value: '', disabled: false, style: {} }) };
let api = null;
try {
  api = new Function('document', 'window', 'alert', 'google',
    body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(boot)) +
    '\nreturn { S:S, render:render, paintRecord:paintRecord, toggleEarlier:toggleEarlier, jsStr:jsStr };')
    (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
} catch (e) { api = null; }
ok(!!api, 'the page compiles with the record screen in it');

if (api) {
  api.S.screen = 'record';
  api.S.ctx = { name: 'Jamie Rivers', rec: recordForV1_('Jamie Rivers'), from: 'main', show: {} };
  api.render();
  let html = nodes['view'].innerHTML;
  ok(/Current/.test(html), 'the current submission is labelled');
  ok(html.indexOf(LONG.slice(0, 60)) >= 0, 'and its narrative is on screen');
  ok(/Show 2 earlier submissions/.test(html), 'earlier ones are offered, with a count');
  ok(html.indexOf('Kept up on a busy shift') < 0, 'and are not rendered until asked for');

  api.toggleEarlier('EVAL');
  html = nodes['view'].innerHTML;
  ok(html.indexOf('Kept up on a busy shift') >= 0, 'asking for them shows them');
  ok(/Hide 2 earlier submissions/.test(html), 'and the button turns round');

  api.S.ctx = { name: 'Alex Bramble', rec: recordForV1_('Alex Bramble'), from: 'main', show: {} };
  api.render();
  html = nodes['view'].innerHTML;
  ok(/possible duplicate/i.test(html), 'the duplicate warning reaches the screen');
  ok(/Nothing has been removed/.test(html), 'and the screen says outright that nothing was removed');

  // a name with a quote in it goes into an onclick attribute
  ok(api.jsStr('Dana "Doc" O\'Neill').indexOf('"') < 0,
     'a quoted name is escaped before it becomes part of an onclick attribute');
  ok(JSON.parse(api.jsStr("O'Neill").replace(/&quot;/g, '"').replace(/&#39;/g, "'")) === "O'Neill",
     'and still parses back to the original name');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
