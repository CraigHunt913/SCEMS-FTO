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
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','93_Acknowledge','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto']
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
  PROPS = {}; SHEETS = {}; LOGS = []; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
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
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }
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

const srcFiles = ['00_Config','10_Identity','20_Data','30_WebApp','50_Production','90_Staging','93_Acknowledge','94_Assign']
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
section('It takes the id however you paste it');
// ---------------------------------------------------------------- //
// "The long jumble between /d/ and /edit" is a fiddly thing to select by
// hand, and getting it slightly wrong should not be an error message.
const ID = '1YLxGk458tR0jpRO680DVtvswNGSLVTlugmclsRI';
[['the id on its own', ID],
 ['the whole address bar', 'https://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=0'],
 ['the address without a scheme', 'docs.google.com/spreadsheets/d/' + ID + '/edit'],
 ['just the /d/ fragment', '/d/' + ID],
 ['the fragment with /edit on it', '/d/' + ID + '/edit'],
 ['it with spaces round it', '   ' + ID + '  '],
 ['a copied link with a gid', 'https://docs.google.com/spreadsheets/d/' + ID + '/edit?gid=1889#gid=1889']
].forEach(function (pair) {
  ok(spreadsheetIdFromV1_(pair[1]) === ID, pair[0] + ' yields the id');
});
ok(spreadsheetIdFromV1_('') === '', 'nothing yields nothing');
ok(spreadsheetIdFromV1_('   ') === '', 'whitespace yields nothing');
ok(spreadsheetIdFromV1_('paste it here') === '', 'a sentence yields nothing, not a guess');
ok(spreadsheetIdFromV1_(null) === '', 'and neither does a missing value');

world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = '/d/PROD-BOOK-000000000000000000';
OPENABLE['PROD-BOOK-000000000000000000'] = 'SCEMS FTPD Tracker';
pointAtProductionReadOnly();
ok(PROPS[PORTAL.PROPERTY_TARGET] === '/d/PROD-BOOK-000000000000000000' ||
   targetIdV1_() === 'PROD-BOOK-000000000000000000',
   'a pasted /d/ fragment points the portal at the right book');
ok(targetIdV1_() === 'PROD-BOOK-000000000000000000',
   'and the id it uses from then on is the clean one');

world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'the one in my drive';
const noId = threw(() => pointAtProductionReadOnly());
ok(/no spreadsheet id in/.test(noId), 'a value with no id in it says exactly that');
ok(/the one in my drive/.test(noId), 'quoting back what it actually found');
ok(/Nothing was changed/.test(noId), 'and nothing moved');
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'STG-BOOK', 'the portal stayed where it was');

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
ok(/read only|practice spreadsheet/i.test(threw(() => submitReflectionV1({ wentWell: 'x' }))),
   'filing a reflection through the portal refuses');
ok(/read-only|read only/i.test(threw(() => ackCoachingV1(5))),
   'acknowledging coaching refuses');
ok(/practice spreadsheet/i.test(threw(() => switchRoleForTestingV1('DIVISION'))),
   'and the role switcher cannot become a production backdoor');

// LIVE opens the three everyday actions and nothing else. The role switcher
// is the one that matters most here: it lets whoever runs it become anybody,
// which is fine against invented people and is a backdoor into every real
// personnel record. It is gated on the data being fake, not on writability.
PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(mayWriteV1_() === true, 'LIVE can write');
ok(isPracticeV1_() === false, 'and knows the data is real');
ok(/practice spreadsheet/i.test(threw(() => switchRoleForTestingV1('DIVISION'))),
   'and the role switcher still refuses, because that gate is about the data');

// LIVE opens the everyday actions - but not this one. 03 SELF-REFLECTION RAW
// belongs to the self-reflection FORM, which already has the trigger and the
// destination; a portal that also appends to it is a second version of the
// truth, and the append it used to do was positional into a tab whose column
// order belongs to Google.
as('jamie@example.org');
ok(/practice spreadsheet/i.test(threw(() => submitReflectionV1({ wentWell: 'Kept the primary survey slow.' }))),
   'filing a reflection through the portal stays shut even in LIVE, because that tab belongs to the form');
as('chief@example.org');
ok(threw(() => switchRoleForTestingV1('TRAINEE')) !== '',
   'and being the Division does not unlock it either');
PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};

// ---------------------------------------------------------------- //
section('The sandbox switch that outlived its reason');
// ---------------------------------------------------------------- //
// setUpStaging turns the form links OFF so a practice user tapping a form
// card cannot land on the REAL form and submit a live row. Good reason - and
// it dies the moment the portal is pointed at the real tracker. The property
// does not. A hard OFF beats the mode, so left alone it means every screen
// says "Form links are switched off in this mode" and nobody can reach a
// form from the portal at all. Going live into that is a portal with no
// forms in it, which is a portal with no point.

world();
setUpStaging();
ok(PROPS['PORTAL_FORM_LINKS'] === 'OFF', 'staging switches the links off');
ok(formLinksLiveV1_() === false, 'and they are off');

PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
let ptOut = pointAtProductionReadOnly();
ok(formLinksLiveV1_() === true, 'leaving staging turns them back on');
ok(PROPS['PORTAL_FORM_LINKS'] === undefined || PROPS['PORTAL_FORM_LINKS'] === null,
   'by clearing the switch, not by setting a second one over it');
ok(/back on now/.test(ptOut), 'and it says so rather than doing it quietly');

// somebody who deliberately turned them off keeps them off
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
pointAtProductionReadOnly();
disableFormLinks();
ok(formLinksLiveV1_() === false, 'a deliberate off is still off');
as('chief@example.org');
ok(/form links are switched off/i.test(START()),
   'and START raises it, because a portal with no forms in it has no point');
ok(/Run  enableFormLinks/.test(START()), 'naming the one function that fixes it');
enableFormLinks();
ok(!/form links are switched off/i.test(START()), 'and stops once they are on');

// ---------------------------------------------------------------- //
section('goLive, and what it refuses to go live into');
// ---------------------------------------------------------------- //
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
as('chief@example.org');
ok(/practice spreadsheet|pointAtProductionReadOnly/i.test(threw(() => goLive())),
   'from staging it refuses and says to look at the real one first');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_STAGING, 'and changes nothing');

// A portal nobody can be recognised in is not ready to be live, however
// tidy the rest of it is. Going live into that means a live empty screen.
pointAtProductionReadOnly();
const rosterTab = readTabV1_(PORTAL.TAB.ROSTER);
const emailCol = rosterTab.col['EMAIL'] !== undefined ? rosterTab.col['EMAIL']
                                                      : rosterTab.col['FTO EMAIL'];
SHEETS[PORTAL.TAB.ROSTER].g.slice(HR).forEach(r => { r[emailCol] = ''; });
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
ok(/nobody on the roster has an address/i.test(threw(() => goLive())),
   'it refuses to go live into a portal nobody can sign in to');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_PRODUCTION, 'leaving it read only');

// a missing tab stops it too, for the same reason: a screen that reads an
// absent tab is an empty screen, and finding that out live is the wrong time
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
as('chief@example.org');
pointAtProductionReadOnly();
ok(/tab\(s\) the portal reads are not in this spreadsheet/i.test(threw(() => goLive())),
   'a missing tab stops it, and it names which');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_PRODUCTION, 'still read only');

// with everything present it goes
tab(PORTAL.TAB.EVIDENCE, ['TRAINEE','SKILL','EVENT DATE','FTO','OUTCOME'], []);
tab(PORTAL.TAB.SIGNOFF, ['TRAINEE','SKILL','DECIDED BY','DECISION DATE','RATIONALE'], []);
delete SHEETS[PORTAL.TAB.AUDIT];          // the live tracker has no such tab
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
let liveMsg = goLive();
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_LIVE, 'from PRODUCTION it goes live');
ok(/Deploy/.test(liveMsg),
   'and says to deploy, because a deployment serves the code as it was when deployed');
ok(/goReadOnly/.test(liveMsg), 'and how to step back');
ok(/acknowledge|reflection|sign-off/i.test(liveMsg), 'naming what just became possible');

ok(/Already live/.test(goLive()), 'running it again is a no-op that says so');

// Allowing a decision and keeping no record of who made it is worse than not
// allowing it, and auditV1_ returns quietly when the tab is absent - so going
// live without one would have promised a log it was not writing.
ok(!!SHEETS[PORTAL.TAB.AUDIT], 'going live left somewhere to record what people do');
ok(/PORTAL AUDIT/.test(liveMsg), 'and said so rather than adding a tab quietly');
ok(/No existing tab was touched/.test(liveMsg), 'making clear it added and changed nothing');
const auditHdr = readTabV1_(PORTAL.TAB.AUDIT);
ok(auditHdr.ok && auditHdr.col['WHO'] !== undefined,
   'with a WHO column, which is the entire point of it');
ok(auditHdr.rows.length >= 1, 'and the switch itself is the first thing in it');

// an existing audit tab is used, never replaced
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
as('chief@example.org');
pointAtProductionReadOnly();
tab(PORTAL.TAB.EVIDENCE, ['TRAINEE','SKILL','EVENT DATE'], []);
tab(PORTAL.TAB.SIGNOFF, ['TRAINEE','SKILL','DECIDED BY'], []);
tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'],
    [[new Date(), 'OLD ENTRY', 'someone@example.org', 'from before', 'x']]);
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
goLive();
const after = readTabV1_(PORTAL.TAB.AUDIT);
ok(after.rows.some(r => String(r[after.col['WHAT']]) === 'OLD ENTRY'),
   'an audit log that already exists keeps everything in it');

goReadOnly();
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_PRODUCTION, 'goReadOnly puts it back');
ok(PROPS[PORTAL.PROPERTY_TARGET] === 'PROD-BOOK',
   'on the same spreadsheet - it steps back from the mode, not the tracker');
as('chief@example.org');
ok(/read only/i.test(threw(() => approveSignoffV1(PORTAL.HEADER_ROW + 1, 'a good reason here'))),
   'and the everyday actions refuse again');

// ---------------------------------------------------------------- //
section('FINISH does the whole portal side, or stops and says why');
// ---------------------------------------------------------------- //
// START names the next thing to run. Eight of those across two script
// editors is not easier than one long instruction, it is just better
// documented. This does the portal side end to end.

world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
as('chief@example.org');
setUpStaging();                                   // turns the form links off
pointAtProductionReadOnly();
tab(PORTAL.TAB.EVIDENCE, ['TRAINEE','SKILL','EVENT DATE'], []);
tab(PORTAL.TAB.SIGNOFF, ['TRAINEE','SKILL','DECIDED BY'], []);
disableFormLinks();                               // as if the sandbox left them off
PROPS[PORTAL_OTHER_IDS_PROPERTY] = 'PROD-BOOK-COPY';
OPENABLE['PROD-BOOK-COPY'] = 'An old copy';
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;

let fin = FINISH();
ok(!PROPS[PORTAL_OTHER_IDS_PROPERTY], 'it stops reading the stale copy');
ok(/An old copy/.test(fin), 'naming it, so the change is not silent');
ok(/put back in/.test(fin) || /PORTAL_OTHER_SPREADSHEET_IDS/.test(fin),
   'and saying how to undo that');
ok(formLinksLiveV1_() === true, 'it switches the form links back on');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_LIVE, 'and goes live');
ok(/NOW DEPLOY/.test(fin), 'then says the one step no code can do');
ok(/Execute as/.test(fin) && /not "Anyone"/.test(fin),
   'with the two settings that decide whether live is safe');
ok(/TRACKER/.test(fin) && /catchUpUnprocessed/.test(fin),
   'and what is still owed in the OTHER script editor');

// running it again is harmless
fin = FINISH();
ok(/Already live/.test(fin), 'a second run is a no-op that says so');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_LIVE, 'and nothing regresses');

// it stops at the first thing that needs a person, keeping what it did
world();
PROPS['PORTAL_PRODUCTION_SPREADSHEET_ID'] = 'PROD-BOOK';
as('chief@example.org');
pointAtProductionReadOnly();
disableFormLinks();
// no EVIDENCE / SIGNOFF tab, so goLive must refuse
TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; PEOPLE_CACHE_V1 = null;
fin = FINISH();
ok(/STOPPED BEFORE GOING LIVE/.test(fin), 'it stops rather than pressing on');
ok(/tab\(s\) the portal reads/.test(fin), 'naming exactly what stopped it');
ok(PROPS[PORTAL.PROPERTY_MODE] === PORTAL.MODE_PRODUCTION, 'and does not go live');
ok(formLinksLiveV1_() === true,
   'while the work it DID do stands - it does not roll back what already worked');
ok(/run FINISH again/.test(fin), 'and says it picks up where it left off');

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
  { textContent: '', innerHTML: '', value: '', disabled: false, style: {} }) };
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

// ---------------------------------------------------------------- //
section('The Division screen is a decision queue, not a directory');
// ---------------------------------------------------------------- //
// What went wrong on the live deployment: ten identical trainee rows, every
// one of them green, followed by a scroll of duplicate submissions printing
// SPREADSHEET ROW NUMBERS on the Training Chief's phone. Both of those are
// my internals leaking into somebody else's interface. These tests keep them
// out and keep the count honest.

function personAt(i) {
  return { name: 'Quiet Person ' + i, level: 'EMT', levelKey: 'emt', phase: 'Phase 2',
           fto: 'Dana Whitlock', shift: 'A', days: 3, status: '', needs: '',
           forms: [], freshness: [] };
}
const divPeople = [];
for (let i = 1; i <= 9; i++) divPeople.push(personAt(i));
divPeople.push({ name: 'Latavia Cole', level: 'EMT', levelKey: 'emt', phase: 'Phase 1',
  fto: '', shift: 'C', days: -1, status: '', needs: 'no training officer is named',
  forms: [], freshness: [] });

const divBoot = { version: PORTAL.VERSION, mode: 'LIVE',
  viewer: { email: 'chief@example.org', role: 'TRAINING_DIVISION',
            name: 'C. Hunt', ok: true, why: '' },
  data: { mode: 'LIVE', activeCount: 10, closedCount: 4,
          queue: [], queueCount: 0,
          people: divPeople,
          incomplete: [], stranded: [], duplicates: [],
          forms: [], retiredForms: [], formLinks: true,
          duplicateSubs: [
            { trainee: 'Elizabeth McInville', source: 'Skill logged',
              group: 'ePCR documentation', when: 'Mon Aug 17 2026', count: 9,
              tab: '19 SKILL EVIDENCE LOG', rows: [264, 263, 262, 260, 261] }
          ] },
  error: '' };

let api3 = null;
try {
  api3 = new Function('document', 'window', 'alert', 'google',
    body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(divBoot)) +
    '\nreturn { S: S, render: render, pickPerson: pickPerson, pickRecord: pickRecord };')
    (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
} catch (e) { api3 = null; }
ok(!!api3, 'the Division screen renders');

// a <select> collapses to one line however many options it holds, so the
// question is never "is the name on the page" but "is it a ROW on the page".
function cards(html) { return html.replace(/<select[\s\S]*?<\/select>/g, ''); }

if (api3) {
  let html = nodes['view'].innerHTML;
  const rows = cards(html);

  ok(/Nothing waiting on you/.test(html),
     'with no sign-offs pending it says so at the top, in one line');
  ok(/Latavia Cole/.test(rows), 'the one trainee who needs something gets a row');
  ok(/no training officer is named/i.test(rows), 'with the reason on it');
  ok(!/Quiet Person 1/.test(rows),
     'and the nine with nothing outstanding get no rows at all');
  ok(/9 of 10 have nothing outstanding/.test(html), 'they are one sentence');

  ok(/<select class="pick" id="pick-person"/.test(html),
     'and one dropdown reaches any of them');
  ok((html.match(/<option value="\d+"/g) || []).length === 10,
     'which carries every active trainee, the flagged one included');
  ok(/<option value="9">Latavia Cole \u2014 Phase 1 \u00b7 needs a look<\/option>/.test(html) ||
     /<option value="9">Latavia Cole — Phase 1 · needs a look<\/option>/.test(html),
     'each option says who, where they are, and whether they need a look');
  ok(/onchange="pickPerson\(this.value\);this.selectedIndex=0"/.test(html),
     'picking one is a destination, so the box snaps back to its placeholder');
  ok(/openPerson\(9\)/.test(rows),
     'the row that IS shown indexes into people, not into the filtered list');

  // the row numbers. this is the thing that shipped.
  ok(!/\b2[0-9][0-9]\b/.test(html), 'no spreadsheet row number appears anywhere on the screen');
  ok(!/19 SKILL EVIDENCE LOG/.test(html), 'nor the name of a raw tab');
  ok(!/Elizabeth McInville/.test(rows), 'the same-day submissions are not a stack of cards');
  ok(/<select class="pick" id="pick-sameday"/.test(html), 'they are a dropdown');
  ok(/Elizabeth McInville \u2014 Skill logged/.test(html) ||
     /Elizabeth McInville — Skill logged/.test(html),
     'whose options name the person and the kind');
  ok(/\(9\)<\/option>/.test(html), 'and how many landed that day');
  ok(/onchange="pickRecord\(this.value\)/.test(html),
     'picking one opens that record, where both are readable side by side');
}

// ---------------------------------------------------------------- //
section('A pending sign-off outranks everything else on that screen');
// ---------------------------------------------------------------- //
const divBoot2 = JSON.parse(JSON.stringify(divBoot));
divBoot2.data.queue = [{ trainee: "Sam O'Neill", skill: 'IV access',
  evidence: '4 successful, 3 independent', since: '2 days ago', row: 12,
  from: '', requestId: 'QR-77' }];
divBoot2.data.queueCount = 1;
divBoot2.data.staged = [{ trainee: 'Kaylie Vaughn', skill: 'CPR / AED operation',
  decision: 'Approve sign-off', by: 'chief@example.org', since: '1 day ago' }];
divBoot2.data.retiredForms = [{ title: 'Skills quick log', why: 'No submit trigger is bound to it.' }];

let api4 = null;
try {
  api4 = new Function('document', 'window', 'alert', 'google',
    body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(divBoot2)) +
    '\nreturn { S: S, render: render };')
    (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
} catch (e) { api4 = null; }
ok(!!api4, 'it renders with a decision waiting');

if (api4) {
  const html = nodes['view'].innerHTML;
  ok(/1 decision waiting/.test(html), 'the headline is the decision, not the roster');
  ok(html.indexOf('IV access') < html.indexOf('Latavia Cole'),
     'and the decision comes before anybody else on the page');
  ok(/openSignoff\(12,/.test(html), 'the card goes straight to the sign-off screen');
  ok(/QR-77/.test(html),
     'carrying the request id, so a queue that re-sorted cannot be approved blind');
  ok(/1 waiting on the tracker/.test(html),
     'a decision already made is counted separately, not as one still waiting on you');
  ok(/Record pending decisions/.test(html),
     'and the screen says what turns it into a permanent sign-off');
  ok(!/Kaylie Vaughn/.test(cards(html)),
     'without putting it back on the page as a row');
  ok(/O&#39;Neill/.test(html) || /O\\u0027Neill/.test(html) || /O\\'Neill/.test(html),
     "and an apostrophe in a name survives instead of being stripped out");
}

// ---------------------------------------------------------------- //
section('A trainee sees what is out of their hands, not the whole catalogue');
// ---------------------------------------------------------------- //
const manySkills = [];
for (let i = 1; i <= 18; i++) {
  manySkills.push({ skill: 'Building skill ' + i, readiness: 'IN PROGRESS',
                    signed: false, successful: i % 4, independent: 0 });
}
manySkills.push({ skill: 'Blood glucose measurement', readiness: 'SIGNED OFF',
                  signed: true, successful: 4, independent: 3 });
manySkills.push({ skill: 'IV access', readiness: 'READY FOR VALIDATION',
                  signed: false, successful: 5, independent: 3 });

const skillBoot = { version: PORTAL.VERSION, mode: 'PRODUCTION',
  viewer: { email: 'jamie@example.org', role: 'TRAINEE',
            name: 'Jamie Rivers', ok: true, why: '' },
  data: { name: 'Jamie Rivers', level: 'EMT', levelKey: 'emt', phase: 'Phase 2',
          fto: 'Dana Whitlock', phaseStart: '', lastEval: '3 days ago',
          signed: 1, applicable: 20, percent: 5, waiting: [], coaching: [],
          skills: manySkills, forms: [], freshness: [] },
  error: '' };

let api5 = null;
try {
  api5 = new Function('document', 'window', 'alert', 'google',
    body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(skillBoot)) +
    '\nreturn { S: S, render: render, pickSkill: pickSkill };')
    (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
} catch (e) { api5 = null; }
ok(!!api5, 'the trainee screen renders with twenty skills on file');

if (api5) {
  let html = nodes['view'].innerHTML;
  const rows = cards(html);

  ok(/1 signed off &middot; 1 with the Division &middot; 18 still building/.test(html) ||
     /1 signed off · 1 with the Division · 18 still building/.test(html),
     'the three counts are one line');
  ok(/IV access/.test(rows),
     'the skill sitting with the Division is on the page, because it is out of their hands');
  ok(!/Building skill 1</.test(rows),
     'the eighteen still building are not eighteen rows');
  ok(/<select class="pick" id="pick-skill"/.test(html), 'they are a dropdown');
  ok(/18 still building/.test(html), 'labelled with the count');
  ok((html.match(/<option value="\d+">Building skill/g) || []).length === 18,
     'holding every one of them');
  ok(!/selectedIndex=0/.test((html.match(/id="pick-skill"[^>]*/) || [''])[0]),
     'and this one stays where you put it, because the choice is what is being shown');

  api5.pickSkill('2');
  html = nodes['view'].innerHTML;
  ok(/Successful reps/.test(html) && /Independent reps/.test(html),
     'picking a skill shows its reps underneath');
  ok(/<option value="2"[^>]*selected/.test(html), 'with that skill still selected in the box');
}

// ---------------------------------------------------------------- //
section('The mode badge says something or is not there');
// ---------------------------------------------------------------- //
// Emptying its text left the chip's border, background and padding behind:
// a small amber lozenge with nothing written in it, sitting in the corner
// where a warning goes. An empty warning is worse than no warning.
function bootIn(mode) {
  const b = JSON.parse(JSON.stringify(divBoot));
  b.mode = mode; b.data.mode = mode;
  try {
    new Function('document', 'window', 'alert', 'google',
      body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(b)))
      (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
  } catch (e) {}
  return nodes['mode'];
}
let chip = bootIn('LIVE');
ok(chip.textContent === '', 'LIVE writes no label');
ok(chip.style.display === 'none', 'and hides the chip rather than leaving an empty one');

chip = bootIn('STAGING');
ok(chip.textContent === 'Staging', 'STAGING says so');
ok(chip.style.display !== 'none', 'and is visible');

chip = bootIn('PRODUCTION');
ok(chip.textContent === 'PRODUCTION', 'PRODUCTION says so');
ok(chip.style.display !== 'none', 'and is visible');

// ---------------------------------------------------------------- //
section('Every screen has a top, and urgency is a spine not a dot');
// ---------------------------------------------------------------- //
// A 9px dot is not readable at arm's length in a moving ambulance. The card's
// left spine is, and it is the only thing on the screen that has to be.
ok(!/class="dot/.test(pageSrc), 'the old status dot is gone from the page entirely');
ok(/--accent:var\(--stop\)/.test(pageSrc) && /--accent:var\(--warn\)/.test(pageSrc),
   'replaced by a spine colour set per card');
ok(/\.card:before\{content:"";position:absolute;left:0/.test(pageSrc.replace(/\s+/g,'')) ||
   /\.card:before/.test(pageSrc),
   'drawn by the card itself, so no card can forget it');

let heroed = 0;
['paintDivision','paintTrainee','paintFto','paintMedical','paintSupervisor',
 'paintRecord','paintSignoff'].forEach(function (fn) {
  const body2 = pageSrc.slice(pageSrc.indexOf('function ' + fn + '('));
  if (/hero\(/.test(body2.slice(0, 900))) heroed++;
});
ok(heroed === 7, 'all seven role and detail screens open with a hero, not with body text: ' + heroed);

const divHtml = (function () {
  try {
    new Function('document', 'window', 'alert', 'google',
      body.replace(/<\?!=\s*boot\s*\?>/, JSON.stringify(divBoot2)))
      (fakeDoc, { scrollTo: () => {} }, () => {}, { script: { run: {} } });
  } catch (e) {}
  return nodes['view'].innerHTML;
})();

ok(/<div class="hero">/.test(divHtml), 'the Division screen renders one');
ok(/class="eyebrow">Training Division</.test(divHtml), 'which names the role');
ok(divHtml.indexOf('class="hero"') < divHtml.indexOf('Sign-offs'),
   'above everything else on the page');
ok(divHtml.indexOf('IV access') < divHtml.indexOf('waiting on the tracker'),
   'a decision still waiting on you sits above one you have already made');
ok(divHtml.indexOf('Retired form still open') < divHtml.indexOf('Sign-offs'),
   'and a broken form is a system alert, so it sits above the queue rather than inside it');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
