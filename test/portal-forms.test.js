// SCEMS Portal — the form registry and the production read-only posture.
//
// The claim this layer makes is that the nine forms already in service keep
// working exactly as they are, that a person is handed the ONE form their
// situation calls for with the names already filled in, and that pointing the
// portal at the live tracker cannot write to it.
//
// These tests attack all three. The fake FormApp behaves the way the real one
// does: createResponse().toPrefilledUrl() names the item's own entry id, and
// a choice item only accepts a value it actually offers.
//
//   node test/portal-forms.test.js

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

const HR = PORTAL.HEADER_ROW;
function tab(name, headers, rows) {
  const g = [];
  for (let i = 0; i < HR - 1; i++) g.push([]);
  g.push(headers.slice());
  rows.forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
}

function id(key) { return PORTAL_FORMS.filter(f => f.key === key)[0].id; }

function buildForms() {
  FORMS = {}; FORM_FAILS = {}; FORM_READS = 0; SUBMITS = 0;
  const names = ['Jamie Rivers', 'Alex Bramble', 'Priya Okafor', 'Sam Ledger'];
  FORMS[id('FTO_EVAL')] = new FakeForm(id('FTO_EVAL'), [
    new FakeItem('entry.1001', 'Shift date', 'DATE'),
    new FakeItem('entry.1002', 'FTO name', 'TEXT'),
    new FakeItem('entry.1003', 'Trainee', 'LIST', names),
    new FakeItem('entry.1004', 'One thing to work on', 'PARAGRAPH_TEXT')
  ], 'PROD-BOOK');
  FORMS[id('SELF_REFLECTION')] = new FakeForm(id('SELF_REFLECTION'), [
    new FakeItem('entry.2001', 'Your name', 'TEXT'),
    new FakeItem('entry.2002', 'What went well', 'PARAGRAPH_TEXT')
  ], 'PROD-BOOK');
  FORMS[id('URGENT_CONCERN')] = new FakeForm(id('URGENT_CONCERN'), [
    new FakeItem('entry.3001', 'Your name', 'TEXT'),
    new FakeItem('entry.3002', 'Trainee involved', 'TEXT'),
    new FakeItem('entry.3003', 'What happened', 'PARAGRAPH_TEXT')
  ], 'PROD-BOOK');
  FORMS[id('DECISION_RECORD')] = new FakeForm(id('DECISION_RECORD'), [
    new FakeItem('entry.4001', 'Trainee', 'TEXT')
  ], 'PROD-BOOK');
  FORMS[id('HANDOVER')] = new FakeForm(id('HANDOVER'), [
    new FakeItem('entry.5001', 'Your name', 'TEXT'),
    new FakeItem('entry.5002', 'Trainee', 'TEXT')
  ], '');
  FORMS[id('SKILLS_EMT')] = new FakeForm(id('SKILLS_EMT'), [
    new FakeItem('entry.6001', 'FTO name', 'TEXT'),
    new FakeItem('entry.6002', 'Trainee', 'LIST', names)
  ], 'PROD-BOOK');
  FORMS[id('SKILLS_AEMT')] = new FakeForm(id('SKILLS_AEMT'), [
    new FakeItem('entry.7001', 'FTO name', 'TEXT'),
    new FakeItem('entry.7002', 'Trainee', 'LIST', names)
  ], 'PROD-BOOK');
  FORMS[id('SKILLS_PMD')] = new FakeForm(id('SKILLS_PMD'), [
    new FakeItem('entry.8001', 'FTO name', 'TEXT'),
    new FakeItem('entry.8002', 'Trainee', 'LIST', names)
  ], 'PROD-BOOK');
  FORMS[id('SKILLS_COMBINED')] = new FakeForm(id('SKILLS_COMBINED'), [
    new FakeItem('entry.9001', 'FTO name', 'TEXT')
  ], '');                                    // no destination: this is the real defect
}

function world(mode) {
  PROPS = {}; SHEETS = {}; LOGS = []; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {};
  OPENABLE = { 'STG-BOOK': 'STG_Sandbox', 'PROD-BOOK': 'SCEMS FTPD Tracker' };
  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = mode || PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  PROPS['PORTAL_MEDICAL_EMAILS'] = 'md@example.org';
  PROPS['PORTAL_SUPERVISORS'] = JSON.stringify({ 'sup@example.org': 'A' });
  PROPS['PORTAL_FORM_LINKS'] = 'ON';
  buildForms();

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
     'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [['Jamie Rivers','S1','Paramedic','A','Dana Whitlock',new Date('2026-06-01'),'Phase 2','Active','jamie@example.org',new Date('2026-07-15'),'A'],
     ['Alex Bramble','S2','EMT','A','Dana Whitlock',new Date('2026-05-04'),'Phase 3','Active','alex@example.org',new Date('2026-07-01'),'A'],
     ['Priya Okafor','S3','Advanced EMT','B','Marcus Vane',new Date('2026-04-12'),'Phase 4','Active','priya@example.org',new Date('2026-08-01'),'B'],
     ['Sam Ledger','S4','EMT','A','Dana Whitlock','','','Active','sam@example.org','','A'],
     ['Rosa Quill','S5','Paramedic','C','Marcus Vane',new Date('2026-01-06'),'Phase 4','Closed / Released','rosa@example.org',new Date('2026-03-01'),'B']]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus@example.org','Paramedic','Yes']]);
  tab(PORTAL.TAB.SKILLS,
    ['TRAINEE','SKILL','READINESS','SIGN-OFF','SUCCESSFUL REPS','INDEPENDENT REPS'],
    [['Jamie Rivers','IV access','SIGNED OFF','SIGNED OFF',5,3]]);
  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [[new Date(),'Jamie Rivers','SK-2','A','Intubation','4 of 4 successful','','','','','','OPEN',new Date(),'QR-1']]);
  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE'],
    [[new Date(),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2']]);
  tab(PORTAL.TAB.REFLECT, ['TIMESTAMP','TRAINEE','WENT WELL','WAS HARD','WORK ON'], []);
  tab(PORTAL.TAB.URGENT, ['TIMESTAMP','CALLED','YOUR NAME','TRAINEE INVOLVED','WHAT HAPPENED'], []);
  tab(PORTAL.TAB.COACHING, ['DATE','TRAINEE','FROM','NOTE','ACKNOWLEDGED'], []);
  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; }
function payloadFor(email) { as(email); const v = resolveViewerV1_(whoIsAskingV1_()); return payloadForV1_(v); }
function keys(list) { return (list || []).map(f => f.key); }

// ---------------------------------------------------------------- //
section('The registry is the only place a form id appears');
// ---------------------------------------------------------------- //
world();
ok(PORTAL_FORMS.length === 9, 'all nine production forms are registered');
const ids = PORTAL_FORMS.map(f => f.id);
ok(new Set(ids).size === 9, 'no id appears twice');
ok(new Set(PORTAL_FORMS.map(f => f.key)).size === 9, 'no key appears twice');
ok(ids.every(i => /^[A-Za-z0-9_-]{20,}$/.test(i)), 'every id looks like a real Drive id');

const srcFiles = ['00_Config','10_Identity','20_Data','30_WebApp','50_Production','90_Staging']
  .map(f => fs.readFileSync('/home/user/SCEMS-FTO/portal/' + f + '.gs', 'utf8')).join('\n');
ok(!ids.some(i => srcFiles.indexOf(i) >= 0), 'no form id is hard-coded anywhere outside the registry');
const pageSrc = fs.readFileSync('/home/user/SCEMS-FTO/portal/Index.html', 'utf8');
ok(!ids.some(i => pageSrc.indexOf(i) >= 0), 'and none is baked into the page the browser receives');
ok(!/docs\.google\.com\/forms/.test(pageSrc), 'the page contains no form URL of its own');

// ---------------------------------------------------------------- //
section('The unbound combined form is offered to nobody');
// ---------------------------------------------------------------- //
world();
const combined = formByKeyV1_('SKILLS_COMBINED');
ok(combined.retired === true, 'the combined skills log is marked retired');
ok(combined.roles.length === 0, 'it belongs to no role');
['TRAINEE','FTO','TRAINING_DIVISION','SUPERVISOR','MEDICAL_DIRECTOR'].forEach(r => {
  const all = keys(allFormsForV1_(r, {}));
  ok(all.indexOf('SKILLS_COMBINED') < 0, r + ' is never offered the unbound combined form');
});
ok(keys(retiredFormsV1_()).indexOf('SKILLS_COMBINED') >= 0,
   'but the Training Division is told it is still out there');
ok(/no submit trigger/i.test(retiredFormsV1_()[0].why),
   'and told why: responses to it never reach the tracker');

// ---------------------------------------------------------------- //
section('Each role is offered only its own forms');
// ---------------------------------------------------------------- //
world();
const traineeForms = keys(generalFormsForV1_(PORTAL.ROLE.TRAINEE, { trainee: 'Jamie Rivers' }));
ok(traineeForms.indexOf('SELF_REFLECTION') >= 0, 'a trainee is offered the self-reflection');
ok(traineeForms.indexOf('URGENT_CONCERN') >= 0, 'and the urgent concern report');
ok(traineeForms.indexOf('FTO_EVAL') < 0, 'a trainee is never offered the evaluation form');
ok(traineeForms.indexOf('DECISION_RECORD') < 0, 'nor the training decision record');
ok(traineeForms.every(k => k.indexOf('SKILLS_') !== 0), 'nor any skills log');

const supForms = keys(generalFormsForV1_(PORTAL.ROLE.SUPERVISOR, {}));
ok(supForms.length === 1 && supForms[0] === 'URGENT_CONCERN',
   'a supervisor gets one form and it is the urgent concern');
ok(keys(generalFormsForV1_(PORTAL.ROLE.MEDICAL, {})).length === 0,
   'the medical director is offered no form at all');

// ---------------------------------------------------------------- //
section('An FTO gets the skills log for THAT trainee, and only that one');
// ---------------------------------------------------------------- //
world();
const dEmt  = keys(traineeFormsForV1_(PORTAL.ROLE.FTO, { levelKey: 'emt' }, {}));
const dAemt = keys(traineeFormsForV1_(PORTAL.ROLE.FTO, { levelKey: 'aemt' }, {}));
const dPmd  = keys(traineeFormsForV1_(PORTAL.ROLE.FTO, { levelKey: 'pmd' }, {}));
ok(dEmt.indexOf('SKILLS_EMT') >= 0 && dEmt.indexOf('SKILLS_AEMT') < 0 && dEmt.indexOf('SKILLS_PMD') < 0,
   'an EMT trainee yields the EMT log and neither of the others');
ok(dAemt.indexOf('SKILLS_AEMT') >= 0 && dAemt.indexOf('SKILLS_EMT') < 0 && dAemt.indexOf('SKILLS_PMD') < 0,
   'an Advanced EMT trainee yields the Advanced EMT log only');
ok(dPmd.indexOf('SKILLS_PMD') >= 0 && dPmd.indexOf('SKILLS_EMT') < 0 && dPmd.indexOf('SKILLS_AEMT') < 0,
   'a Paramedic trainee yields the Paramedic log only');
ok(dEmt.indexOf('FTO_EVAL') >= 0 && dEmt.indexOf('HANDOVER') >= 0,
   'the evaluation and the handover card come with every trainee');

// ---------------------------------------------------------------- //
section('Prefilling uses the ids the form actually reports');
// ---------------------------------------------------------------- //
world();
const evalUrl = prefilledUrlV1_(formByKeyV1_('FTO_EVAL'),
  { fto: 'Dana Whitlock', trainee: 'Jamie Rivers' });
ok(/entry\.1002=Dana(\+|%20)Whitlock/.test(evalUrl), 'the FTO name lands on the FTO name field');
ok(/entry\.1003=Jamie(\+|%20)Rivers/.test(evalUrl),
   'the trainee name lands on the trainee field');
ok(evalUrl.indexOf('usp=pp_url') >= 0, 'and the link is marked as a prefill');
ok(evalUrl.indexOf('entry.1001') < 0 && evalUrl.indexOf('entry.1004') < 0,
   'no other field on the form is touched');
ok(SUBMITS === 0, 'discovering the ids never submitted a response');

// A name is user data going into a query string and then into an href.
// encodeURIComponent leaves the apostrophe alone, which is correct for a URL;
// what must not survive is anything that would end the value early or start
// a new parameter.
const tricky = prefilledUrlV1_(formByKeyV1_('URGENT_CONCERN'),
  { fto: "Dana O'Neill & Co", trainee: 'Alex Bramble' });
ok(tricky.indexOf('&entry.3002') >= 0 && (tricky.match(/entry\.3001=/g) || []).length === 1,
   'both fields are present and the query is not split by the name');
ok(/Dana%20O'Neill%20%26%20Co|Dana(\+)O'Neill(\+)%26(\+)Co/.test(tricky),
   'an ampersand inside a name is encoded, so it cannot start a parameter');
ok(tricky.split('entry.3002=')[1].indexOf('&') < 0,
   'and nothing after the last value leaks into another field');
// The page escapes the URL when it writes the href, so an apostrophe that
// encodeURIComponent legitimately leaves alone still cannot break the tag.
ok(/href="'\+esc\(f\.url\)\+'"/.test(pageSrc),
   'the page escapes every form URL before putting it in an href');

// a choice field is only filled with a value the form offers
const unknown = prefilledUrlV1_(formByKeyV1_('SKILLS_EMT'),
  { fto: 'Dana Whitlock', trainee: 'Someone Not On The Form' });
ok(unknown.indexOf('entry.6001') >= 0, 'the text field still prefills');
ok(unknown.indexOf('entry.6002') < 0,
   'a dropdown is NOT prefilled with a name it does not offer, which would silently blank the answer');

const cased = prefilledUrlV1_(formByKeyV1_('SKILLS_EMT'),
  { trainee: 'jamie   rivers' });
ok(/entry\.6002=Jamie(\+|%20)Rivers/.test(cased),
   'a dropdown match ignores case and spacing but sends the form its own exact wording');

// ---------------------------------------------------------------- //
section('Discovery is cached, so nine forms are not re-read on every page load');
// ---------------------------------------------------------------- //
world();
FORM_READS = 0;
prefilledUrlV1_(formByKeyV1_('FTO_EVAL'), { fto: 'Dana Whitlock' });
const firstPass = FORM_READS;
FORM_READS = 0;
prefilledUrlV1_(formByKeyV1_('FTO_EVAL'), { fto: 'Marcus Vane' });
ok(firstPass > 0, 'the first call reads the form');
ok(FORM_READS === 0, 'the second call reads nothing');
clearFormCache();
FORM_READS = 0;
prefilledUrlV1_(formByKeyV1_('FTO_EVAL'), { fto: 'Dana Whitlock' });
ok(FORM_READS > 0, 'clearFormCache() makes it read again');

// ---------------------------------------------------------------- //
section('A form that cannot be reached costs the link and nothing else');
// ---------------------------------------------------------------- //
world();
FORM_FAILS[id('FTO_EVAL')] = 'You do not have permission to access the requested document.';
clearFormCache();
const degraded = prefilledUrlV1_(formByKeyV1_('FTO_EVAL'), { fto: 'Dana Whitlock' });
ok(degraded.indexOf(id('FTO_EVAL')) >= 0, 'the link still points at the right form');
ok(degraded.indexOf('entry.') < 0, 'it simply arrives without the prefill');

world();
Object.keys(FORMS).forEach(k => { FORM_FAILS[k] = 'Forms scope not granted'; });
clearFormCache();
const stillWorks = payloadFor('dana@example.org');
ok(stillWorks.trainees.length === 3, 'an FTO still sees every trainee assigned to them');
ok(stillWorks.trainees[0].forms.length > 0, 'the cards are still built from the fallback URL');

world();
global.FormApp = undefined;                          // the scope was never granted at all
clearFormCache();
const noFormApp = payloadFor('dana@example.org');
ok(noFormApp.trainees.length === 3, 'with no FormApp at all the FTO still gets their people');
ok(Array.isArray(noFormApp.trainees[0].forms), 'and an empty form list rather than an exception');
global.FormApp = { openById: id2 => { FORM_READS++;
  if (FORM_FAILS[id2]) throw new Error(FORM_FAILS[id2]);
  if (!FORMS[id2]) throw new Error('No item with the given ID could be found');
  return FORMS[id2]; } };

// ---------------------------------------------------------------- //
section('Nobody is handed a link carrying someone else’s name');
// ---------------------------------------------------------------- //
world();
const jamie = payloadFor('jamie@example.org');
const jamieLinks = (jamie.forms || []).map(f => f.url).join(' ');
['Alex', 'Priya', 'Rosa', 'Sam'].forEach(other => {
  ok(jamieLinks.indexOf(other) < 0, 'a trainee link never carries ' + other + '’s name');
});

const dana = payloadFor('dana@example.org');
const danaNames = dana.trainees.map(t => t.name);
ok(danaNames.indexOf('Priya Okafor') < 0, 'Marcus’s trainee is not in Dana’s list');
dana.trainees.forEach(t => {
  const own = (t.forms || []).map(f => f.url).join(' ');
  ok(own.indexOf(encodeURIComponent(t.name).replace(/%20/g, '')) >= 0 ||
     own.indexOf(t.name.split(' ')[0]) >= 0,
     t.name + '’s cards carry ' + t.name.split(' ')[0] + '’s name');
  danaNames.filter(n => n !== t.name).forEach(n => {
    ok(own.indexOf(n.split(' ')[0]) < 0,
       'and not ' + n.split(' ')[0] + '’s');
  });
});

// ---------------------------------------------------------------- //
section('Links are off in staging, because the forms behind them are live');
// ---------------------------------------------------------------- //
world();
delete PROPS['PORTAL_FORM_LINKS'];
PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
ok(formLinksLiveV1_() === false, 'a sandbox does not open the real forms by default');
const offCard = formCardV1_(formByKeyV1_('SELF_REFLECTION'), { trainee: 'Jamie Rivers' });
ok(offCard.url === '', 'the card carries no URL at all, so there is nothing to click');
ok(offCard.title === 'Self-reflection', 'but the card is still shown, so the layout can be judged');

PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
ok(formLinksLiveV1_() === true, 'against the live tracker the links are on, because that is the point');

PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
enableFormLinks();
ok(formLinksLiveV1_() === true, 'enableFormLinks() turns them on deliberately');
disableFormLinks();
ok(formLinksLiveV1_() === false, 'disableFormLinks() turns them off again');

// ---------------------------------------------------------------- //
section('Pointing at production reads and refuses to write');
// ---------------------------------------------------------------- //
world();
let msg = threw(() => pointAtProductionReadOnly());
ok(/PORTAL_PRODUCTION_SPREADSHEET_ID/.test(msg),
   'it will not run until you name the spreadsheet yourself');
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'STG-BOOK', 'and nothing moved while it refused');

PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'NO-SUCH-BOOK';
msg = threw(() => pointAtProductionReadOnly());
ok(/Cannot open/.test(msg), 'an id it cannot open is refused');
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'STG-BOOK', 'and the portal stays where it was');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_STAGING, 'still in staging');

PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
pointAtProductionReadOnly();
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'PROD-BOOK', 'a real id points the portal at it');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_PRODUCTION, 'in PRODUCTION mode');
ok(mayWriteV1_() === false, 'which cannot write');

as('chief@example.org');
ok(/read-only|read only/i.test(threw(() => approveSignoffV1(5, 'Evidence reviewed in person'))),
   'approving a sign-off refuses');
as('jamie@example.org');
ok(/read-only|read only/i.test(threw(() => submitReflectionV1({ wentWell: 'x' }))),
   'filing a reflection through the portal refuses');
ok(/read-only|read only/i.test(threw(() => ackCoachingV1(5))),
   'acknowledging coaching refuses');
ok(/read-only|read only/i.test(threw(() => switchRoleForTestingV1('DIVISION'))),
   'and the role switcher cannot become a production backdoor');

// ---------------------------------------------------------------- //
section('Getting back to the sandbox');
// ---------------------------------------------------------------- //
world();
delete PROPS['PORTAL_STAGING_SPREADSHEET_ID'];
ok(/Run setUpStaging/.test(threw(() => pointAtStaging())),
   'with no sandbox remembered it says how to build one');
PROPS['PORTAL_STAGING_SPREADSHEET_ID'] = 'STG-BOOK';
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
pointAtProductionReadOnly();
pointAtStaging();
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'STG-BOOK' &&
   PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_STAGING, 'and brings you straight back');
ok(mayWriteV1_() === true, 'with writes allowed again');

// setUpStaging must remember the sandbox and leave links off
world();
setUpStaging();
ok(PROPS['PORTAL_STAGING_SPREADSHEET_ID'] === 'STG-BOOK',
   'setUpStaging() remembers the sandbox it built');
ok(PROPS['PORTAL_FORM_LINKS'] === 'OFF',
   'and leaves form links off, so a sandbox user cannot submit to a live form');

// ---------------------------------------------------------------- //
section('The readiness check reports and changes nothing');
// ---------------------------------------------------------------- //
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
pointAtProductionReadOnly();
OPENABLE['PROD-BOOK'] = 'SCEMS FTPD Tracker';
const before = JSON.stringify(SHEETS[PORTAL.TAB.MASTER].g);
const report = productionReadinessCheck();
ok(/READINESS CHECK/.test(report), 'it produces a report');
ok(/read only/i.test(report), 'which says it is read only');
ok(/NO RESPONSE DESTINATION/.test(report),
   'and names the form whose responses go nowhere');
ok(JSON.stringify(SHEETS[PORTAL.TAB.MASTER].g) === before,
   'and the spreadsheet is byte-identical afterwards');
ok(SUBMITS === 0, 'no form response was ever submitted by anything in this file');

// ---------------------------------------------------------------- //
section('The page renders what the payload gives it');
// ---------------------------------------------------------------- //
const page = fs.readFileSync('/home/user/SCEMS-FTO/portal/Index.html', 'utf8');
const body = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));

world();
as('dana@example.org');
const bootObj = { version: PORTAL.VERSION, mode: 'PRODUCTION',
  viewer: { email: 'dana@example.org', role: 'FTO', name: 'Dana Whitlock', ok: true, why: '' },
  data: payloadFor('dana@example.org'), error: '' };
let compiled = null;
try { compiled = new Function('document', 'window', 'alert', 'google',
  body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(bootObj)) + '\nreturn { render: render, canWrite: canWrite, formCards: formCards, S: S, BOOT: BOOT };');
} catch (e) { compiled = null; }
ok(!!compiled, 'the page script still compiles with a real forms payload in it');

const nodes = {};
const fakeDoc = { getElementById: id3 => (nodes[id3] = nodes[id3] ||
  { textContent: '', innerHTML: '', value: '', disabled: false }) };
let api = null;
try { api = compiled(fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } }); }
catch (e) { api = null; }
ok(!!api, 'and runs to completion against that payload');
if (api) {
  const html = nodes['view'].innerHTML;
  ok(/Jamie Rivers/.test(html) && /Alex Bramble/.test(html) && /Sam Ledger/.test(html),
     'the FTO screen lists all three of their trainees');
  ok(!/Priya Okafor/.test(html), 'and nobody else’s');
  ok(api.canWrite() === false, 'canWrite() is false against the live tracker');

  api.S.screen = 'trainee'; api.S.ctx = bootObj.data.trainees[0]; api.render();
  const sheet = nodes['view'].innerHTML;
  ok(/End-of-shift evaluation/.test(sheet), 'opening a trainee offers the evaluation');
  ok(/Log a skill/.test(sheet), 'and the skills log');
  ok(/target="_blank"/.test(sheet), 'as real links that open the form');
  ok((sheet.match(/Log a skill/g) || []).length === 1,
     'exactly one skills log, never a choice of three');
}

world();
const bootTrainee = { version: PORTAL.VERSION, mode: 'PRODUCTION',
  viewer: { email: 'jamie@example.org', role: 'TRAINEE', name: 'Jamie Rivers', ok: true, why: '' },
  data: payloadFor('jamie@example.org'), error: '' };
let api2 = null;
try {
  api2 = new Function('document', 'window', 'alert', 'google',
    body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(bootTrainee)) + '\nreturn { S: S, render: render };')
    (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
} catch (e) { api2 = null; }
ok(!!api2, 'the trainee screen renders against the live tracker');
if (api2) {
  const html = nodes['view'].innerHTML;
  ok(/Self-reflection/.test(html), 'the trainee is pointed at the reflection FORM in production');
  ok(!/Weekly reflection/.test(html),
     'and not at the in-portal writer, which would be a second path into the record');
  ok(/Urgent concern/.test(html), 'the urgent concern route is on the trainee’s own screen');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
