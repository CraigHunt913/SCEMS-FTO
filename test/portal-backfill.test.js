// SCEMS Portal — bringing in responses that never reached a tab.
//
// A form with no submit trigger still holds every answer anyone gave it. The
// claim this layer makes is that those answers can be brought in without
// losing one of them, without writing the same one twice, and without ever
// touching the live tracker.
//
// These tests attack all three, plus the case that matters most: an answer
// whose question does not match any column. It must end up in the notes with
// its question attached, and where there is nowhere to put it the whole
// response must be refused rather than written incomplete.
//
//   node test/portal-backfill.test.js

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
eval(['00_Config','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','90_Staging']
  .map(f => fs.readFileSync('/home/user/SCEMS-FTO/portal/' + f + '.gs', 'utf8'))
  .join('\n'));


/* Responses live on the fake form. getResponses() returns them oldest first,
   the way the platform does. */
FakeForm.prototype.setResponses = function (list) { this.responses = list; return this; };
FakeForm.prototype.getResponses = function () {
  return (this.responses || []).map(function (r) {
    return {
      getId: () => r.id,
      getTimestamp: () => r.at,
      getRespondentEmail: () => { if (r.email === undefined) throw new Error('not collecting emails'); return r.email; },
      getItemResponses: () => r.answers.map(a => ({
        getItem: () => ({ getTitle: () => a.q }),
        getResponse: () => a.v
      }))
    };
  });
};

const HR = PORTAL.HEADER_ROW;
function tab(name, headers, rows) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
}
const D = s => new Date(s + 'T12:00:00');
function id(key) { return PORTAL_FORMS.filter(f => f.key === key)[0].id; }
function snapshot() { return JSON.stringify(SHEETS, (k, v) => (v instanceof Date ? v.toISOString() : v)); }

const EVIDENCE_HEADERS =
  ['EVENT DATE','TRAINEE','FTO','SKILL','SKILL ID','STAGE','OUTCOME','NOTE','SOURCE RESPONSE ID'];

// Sixteen responses on a form nothing was listening to. Two of them already
// reached the tracker by hand; the rest never did.
function combinedResponses(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ id: 'RESP-' + i, at: D('2026-0' + (i % 8 + 1) + '-1' + (i % 9)),
      email: 'dana@example.org',
      answers: [
        { q: 'FTO name', v: i % 2 ? 'Dana Whitlock' : 'Marcus Vane' },
        { q: 'Trainee', v: i % 2 ? 'Jamie Rivers' : 'Alex Bramble' },
        { q: 'Date of event', v: D('2026-0' + (i % 8 + 1) + '-1' + (i % 9)) },
        { q: 'Skill performed', v: i % 2 ? 'Intubation' : 'Tourniquet' },
        { q: 'Level of assistance', v: 'Independent' },
        { q: 'Result', v: 'Successful' },
        { q: 'Comments', v: 'Response ' + i + ' as originally written by the FTO.' }
      ] });
  }
  return out;
}

function world(mode, evidenceHeaders) {
  PROPS = {}; SHEETS = {}; LOGS = []; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {};
  OPENABLE = { 'STG-BOOK': 'STG_Sandbox', 'PROD-BOOK': 'SCEMS FTPD Tracker' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = mode || PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  FORMS = {}; FORM_FAILS = {};

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','LEVEL','ASSIGNED FTO','START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL'],
    [['Jamie Rivers','Paramedic','Dana Whitlock',D('2026-06-01'),'Phase 2','Active','jamie@example.org'],
     ['Alex Bramble','EMT','Dana Whitlock',D('2026-05-04'),'Phase 3','Active','alex@example.org']]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL'], [['Dana Whitlock','dana@example.org']]);

  // two responses already made it in by hand
  tab(PORTAL.TAB.EVIDENCE, evidenceHeaders || EVIDENCE_HEADERS,
    [[D('2026-02-11'),'Jamie Rivers','Dana Whitlock','Intubation','','Independent','Successful','','RESP-1'],
     [D('2026-03-12'),'Alex Bramble','Marcus Vane','Tourniquet','','Independent','Successful','','RESP-2']]);
  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);

  FORMS[id('SKILLS_COMBINED')] = new FakeForm(id('SKILLS_COMBINED'), [], 'STG-BOOK')
    .setResponses(combinedResponses(16));
  // the other registered forms exist but hold nothing
  PORTAL_FORMS.forEach(f => {
    if (FORMS[f.id]) return;
    FORMS[f.id] = new FakeForm(f.id, [], 'STG-BOOK').setResponses([]);
  });
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; }
function evid() { return SHEETS[PORTAL.TAB.EVIDENCE].g.slice(HR); }
function plan() { return backfillPlanV1_(formByKeyV1_('SKILLS_COMBINED')); }

// ---------------------------------------------------------------- //
section('The plan finds what never arrived, and only that');
// ---------------------------------------------------------------- //
world();
let p = plan();
ok(p.total === 16, 'all sixteen responses are on the form');
ok(p.present === 2, 'two already reached the tracker');
ok(p.missing.length === 14, 'fourteen would be added');
ok(p.blocked.length === 0, 'and none is refused');
ok(p.missing.every(m => m.id !== 'RESP-1' && m.id !== 'RESP-2'),
   'the two already present are not queued again');

// ---------------------------------------------------------------- //
section('Every answer lands somewhere, or the response is refused');
// ---------------------------------------------------------------- //
world();
p = plan();
const one = p.missing[0];
ok(one.mapped['TRAINEE'] === 'Jamie Rivers', '"Trainee" lands in TRAINEE');
ok(one.mapped['FTO'] === 'Dana Whitlock', '"FTO name" lands in FTO through the alias table');
ok(one.mapped['SKILL'] === 'Intubation', '"Skill performed" lands in SKILL');
ok(one.mapped['STAGE'] === 'Independent', '"Level of assistance" lands in STAGE');
ok(one.mapped['OUTCOME'] === 'Successful', '"Result" lands in OUTCOME');
ok(String(one.mapped['NOTE']).indexOf('as originally written by the FTO') >= 0,
   '"Comments" lands in NOTE');
ok(one.mapped['SOURCE RESPONSE ID'] === one.id, 'and the response id is stamped on the row');
ok(one.unmappedCount === 0, 'nothing was left over for this form');

// an answer with no column of its own keeps its question and goes to notes
world();
FORMS[id('SKILLS_COMBINED')].setResponses([{ id: 'RESP-99', at: D('2026-08-01'),
  email: 'dana@example.org', answers: [
    { q: 'Trainee', v: 'Jamie Rivers' },
    { q: 'Skill performed', v: 'Intubation' },
    { q: 'How many attempts did it take', v: 'Two' },
    { q: 'Was a supervisor present', v: 'No' }
  ] }]);
p = plan();
ok(p.missing.length === 1, 'the response is still importable');
const note = String(p.missing[0].mapped['NOTE']);
ok(note.indexOf('How many attempts did it take: Two') >= 0,
   'an unmatched answer keeps its question and its value');
ok(note.indexOf('Was a supervisor present: No') >= 0, 'and so does the next one');
ok(p.missing[0].unmappedCount === 2, 'and the count says how many went that way');

// nowhere to put it: refuse the whole response rather than write it short
world(null, ['EVENT DATE','TRAINEE','FTO','SKILL','SOURCE RESPONSE ID']);
FORMS[id('SKILLS_COMBINED')].setResponses([{ id: 'RESP-98', at: D('2026-08-01'),
  email: 'dana@example.org', answers: [
    { q: 'Trainee', v: 'Jamie Rivers' },
    { q: 'What actually happened', v: 'A long account nobody wants to lose.' }
  ] }]);
p = plan();
ok(p.missing.length === 0, 'nothing is queued');
ok(p.blocked.length === 1, 'the response is refused');
ok(/no notes column/.test(p.blocked[0].why), 'and says why');
ok(JSON.stringify(p.blocked[0].answers).indexOf('nobody wants to lose') >= 0,
   'with the answers it could not place, so they are visible rather than gone');

// ---------------------------------------------------------------- //
section('No response id column means no import at all');
// ---------------------------------------------------------------- //
world(null, ['EVENT DATE','TRAINEE','FTO','SKILL','NOTE']);
p = plan();
ok(p.missing.length === 0, 'nothing is planned');
ok(/no response id column/i.test(p.problem),
   'because a second run could not tell a re-import from a new one');

world();
delete SHEETS[PORTAL.TAB.EVIDENCE];
p = plan();
ok(/is not in this spreadsheet/.test(p.problem), 'a missing destination tab stops it cleanly');

world();
FORM_FAILS[id('SKILLS_COMBINED')] = 'You do not have permission to access the requested document.';
p = plan();
ok(/Could not read the form/.test(p.problem), 'an unreadable form stops it cleanly');

ok(backfillPlanV1_(formByKeyV1_('HANDOVER')).problem.indexOf('no destination tab') >= 0,
   'a form with nowhere to write is not guessed at');

// ---------------------------------------------------------------- //
section('The preview writes nothing, in either mode');
// ---------------------------------------------------------------- //
world();
let before = snapshot();
let out = backfillPreview();
ok(/BACKFILL PREVIEW/.test(out), 'it produces a preview');
ok(/would be added        : 14/.test(out), 'and says how many would be added');
ok(/read only, nothing was written/.test(out), 'and says it wrote nothing');
ok(snapshot() === before, 'and the spreadsheet is byte-identical');

world(PORTAL.MODE_PRODUCTION);
before = snapshot();
out = backfillPreview();
ok(/would be added        : 14/.test(out), 'the preview works against the live tracker too');
ok(/will not write/.test(out), 'and says outright that it will not write there');
ok(snapshot() === before, 'and it does not');

// ---------------------------------------------------------------- //
section('Importing refuses outside staging');
// ---------------------------------------------------------------- //
world(PORTAL.MODE_PRODUCTION);
before = snapshot();
ok(/read.only/i.test(threw(() => backfillIntoStaging())),
   'backfillIntoStaging refuses against the live tracker');
ok(snapshot() === before, 'and writes nothing while refusing');

// ---------------------------------------------------------------- //
section('In staging it writes them, and writing twice adds nothing');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
out = backfillIntoStaging();
ok(evid().length === 16, 'the evidence log now holds all sixteen');
ok(/14 row\(s\) written/.test(out), 'and the report says fourteen were added');

const ids = evid().map(r => r[8]);
ok(new Set(ids).size === 16, 'every row carries a distinct response id');

// The audit tab gains a line every run, which is the point of it. Everything
// the import could touch is compared instead.
function recordTabs() {
  return JSON.stringify(Object.keys(SHEETS).filter(n => n !== PORTAL.TAB.AUDIT)
    .map(n => [n, SHEETS[n].g]), (k, v) => (v instanceof Date ? v.toISOString() : v));
}
const after = recordTabs();
out = backfillIntoStaging();
ok(evid().length === 16, 'running it again adds nothing');
ok(/0 row\(s\) written/.test(out), 'and says so');
ok(recordTabs() === after, 'every record tab is byte-identical after the second run');
ok(SHEETS[PORTAL.TAB.AUDIT].g.length === HR + 2,
   'and the audit tab has a line for each run, including the one that did nothing');

// the imported content is the content, not a summary of it
world();
as('chief@example.org');
backfillIntoStaging();
const imported = evid().filter(r => r[8] === 'RESP-3')[0];
ok(!!imported, 'a specific response is findable by its id');
ok(imported[1] === 'Jamie Rivers', 'with the trainee it named');
ok(String(imported[7]).indexOf('Response 3 as originally written by the FTO') >= 0,
   'and the FTO’s own words, unedited');

// a leading = in an answer cannot become a formula
world();
FORMS[id('SKILLS_COMBINED')].setResponses([{ id: 'RESP-X', at: D('2026-08-01'),
  email: 'dana@example.org',
  answers: [{ q: 'Trainee', v: 'Jamie Rivers' },
            { q: 'Comments', v: '=HYPERLINK("http://example.invalid","click")' }] }]);
as('chief@example.org');
backfillIntoStaging();
const risky = evid().filter(r => r[8] === 'RESP-X')[0];
ok(String(risky[7]).charAt(0) === "'", 'an answer starting with = is neutralised on the way in');
ok(String(risky[7]).indexOf('HYPERLINK') >= 0, 'without losing what it said');

// ---------------------------------------------------------------- //
section('The record picks the imported history straight up');
// ---------------------------------------------------------------- //
world();
as('chief@example.org');
ok(recordForV1_('Jamie Rivers').total === 1,
   'before the import Jamie has one skill event on file');
backfillIntoStaging();
const rec = recordForV1_('Jamie Rivers');
ok(rec.total === 8, 'after it, eight: ' + rec.total);
const ev = rec.sections.filter(s => s.key === 'EVIDENCE')[0];
ok(ev.current.length === 1 && ev.current[0].group === 'Intubation',
   'the most recent intubation event leads');
ok(ev.earlier.length === 7, 'and every earlier one is kept, in order');
ok(JSON.stringify(rec).indexOf('Alex Bramble') < 0,
   'and Alex’s imported responses stay out of Jamie’s record');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
