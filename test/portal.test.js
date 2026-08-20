// SCEMS Portal v1 — role isolation and write safety.
//
// The claim this portal makes is that a person receives ONLY their own
// record, decided on the server. These tests attack that claim: they build a
// sandbox holding several people and check that each viewer's payload cannot
// be made to contain anyone else's data, and that nothing can be written to
// a spreadsheet the portal is not in staging against.
//
//   node test/portal.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '';

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

const BOOK = { getSheetByName: n => SHEETS[n] || null, getId: () => 'STG-BOOK',
               getName: () => 'STG_Sandbox', getUrl: () => 'https://example/stg',
               insertSheet: n => (SHEETS[n] = new FakeSheet(n, [])) };

global.SpreadsheetApp = { openById: () => BOOK, create: () => BOOK,
  getUi: () => ({ alert: () => {} }) };
global.Session = { getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE }),
  getScriptTimeZone: () => 'America/New_York' };
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
  setProperty: (k, v) => { PROPS[k] = v; }, deleteProperty: k => { delete PROPS[k]; } }) };
global.Utilities = { formatDate: () => '2026-08-19 0200' };
global.Logger = { log: () => {} };
// The stub mirrors the REAL Apps Script enum, which has DEFAULT and ALLOWALL
// and nothing else. setXFrameOptionsMode throws on a null mode exactly as the
// platform does, so asking for a member that does not exist fails here too.
global.HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({
  setTitle: function () { return this; }, addMetaTag: function () { return this; },
  setXFrameOptionsMode: function (m) {
    if (m === null || m === undefined) throw new Error('Argument cannot be null: mode');
    return this; } }) }),
  XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' } };

// one eval at module scope: eval inside a callback would scope the
// declarations into that callback and nothing would be visible here
// The forms layer is loaded too, so these isolation tests run against the
// same code the deployed portal runs, not a version of it without links.
// FormApp is deliberately absent: this stub throws the way the platform does
// when the scope was never granted, which is the worst case the payload
// builders have to survive. What is proved here is that role isolation holds
// with the registry in the picture. portal-forms.test.js proves the registry.
global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };

eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production','60_History','70_Backfill','80_Import','85_Merge','90_Staging','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto']
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
function world() {
  PROPS = {}; SHEETS = {}; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  PROPS['PORTAL_MEDICAL_EMAILS'] = 'md@example.org';
  PROPS['PORTAL_SUPERVISORS'] = JSON.stringify({ 'sup@example.org': 'A' });

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
     'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [['Jamie Rivers','S1','Paramedic','A','Dana Whitlock',new Date('2026-06-01'),'Phase 2','Active','jamie@example.org',new Date('2026-07-15'),'A'],
     ['Alex Bramble','S2','EMT','A','Dana Whitlock',new Date('2026-05-04'),'Phase 3','Active','alex@example.org',new Date('2026-07-01'),'A'],
     ['Priya Okafor','S3','Advanced EMT','B','Marcus Vane',new Date('2026-04-12'),'Phase 4','Active','priya@example.org',new Date('2026-08-01'),'B'],
     ['Sam Ledger','S4','EMT','A','','','','Active','sam@example.org','','A'],
     ['Rosa Quill','S5','Paramedic','C','Marcus Vane',new Date('2026-01-06'),'Phase 4','Closed / Released','rosa@example.org',new Date('2026-03-01'),'B']]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus@example.org','Paramedic','Yes']]);
  tab(PORTAL.TAB.SKILLS,
    ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
     'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS'],
    [['Jamie Rivers','IV access','I',new Date(),'Dana Whitlock','Paramedic','SIGNED OFF','SIGNED OFF','V','SK-1',5,3,3,2],
     ['Jamie Rivers','Intubation','A',new Date(),'Dana Whitlock','Paramedic','READY FOR VALIDATION','','A','SK-2',4,2,2,2],
     ['Alex Bramble','Tourniquet','A',new Date(),'Dana Whitlock','EMT','READY FOR VALIDATION','','T','SK-6',3,3,3,2],
     ['Priya Okafor','Vascular access','I',new Date(),'Marcus Vane','Advanced EMT','SIGNED OFF','SIGNED OFF','V','SK-7',8,5,5,3]]);
  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [[new Date(),'Jamie Rivers','SK-2','A','Intubation','4 of 4 successful','','','','','','OPEN',new Date(),'QR-1'],
     [new Date(),'Alex Bramble','SK-6','T','Tourniquet','3 of 3 successful','','','','','','OPEN',new Date(),'QR-2']]);
  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE'],
    [[new Date(),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2']]);
  tab(PORTAL.TAB.REFLECT, ['TIMESTAMP','TRAINEE','WENT WELL','WAS HARD','WORK ON'], []);
  tab(PORTAL.TAB.URGENT, ['TIMESTAMP','CALLED','YOUR NAME','TRAINEE INVOLVED','WHAT HAPPENED'],
    [[new Date(),'Yes','Dana Whitlock','Alex Bramble','Medication concentration error caught before administration.']]);
  tab(PORTAL.TAB.COACHING, ['DATE','TRAINEE','FROM','NOTE','ACKNOWLEDGED'],
    [[new Date(),'Jamie Rivers','Dana Whitlock','Radio reports still rushed.',''],
     [new Date(),'Alex Bramble','Dana Whitlock','Slow the primary survey down.','']]);
  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);
}
function as(email) { ACTIVE = email; EFFECTIVE = email; PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }
function payloadFor(email) { as(email); const v = resolveViewerV1_(whoIsAskingV1_()); return { v, d: payloadForV1_(v) }; }

// ---------------------------------------------------------------- //
section('The roster is found however its columns are named');
// ---------------------------------------------------------------- //
// The live roster calls its column FTO NAME. The code looked only for FTO,
// read undefined, and every FTO on it resolved to nobody - silently, because
// an empty name just skips the row. Nobody would have seen an error; they
// would only have seen "you are not set up yet".
world();
tab(PORTAL.TAB.ROSTER,
  ['FTO NAME','SHIFT','CERT LEVEL','TRAINS EMT','TRAINS AEMT','TRAINS PARAMEDIC',
   'ACTIVE','NOTES','EMAIL','EMPLOYEE ID'],
  [['Dana Whitlock','A','Paramedic','Y','Y','Y','Y','','dana@example.org','EMS 5']]);
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(resolveViewerV1_('dana@example.org').role === PORTAL.ROLE.FTO,
   'a roster headed FTO NAME still resolves its people');
ok(resolveViewerV1_('dana@example.org').name === 'Dana Whitlock',
   'and gets their name, which is what their trainees are matched against');

world();
tab(PORTAL.TAB.ROSTER, ['NAME','EMAIL'], [['Dana Whitlock','dana@example.org']]);
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(resolveViewerV1_('dana@example.org').name === 'Dana Whitlock',
   'a roster headed just NAME works too');

world();
tab(PORTAL.TAB.ROSTER, ['FTO NAME','EMAIL'], [['','dana@example.org']]);
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(resolveViewerV1_('dana@example.org').role === PORTAL.ROLE.NONE,
   'a row with an address and no name is still not a person');

world();
tab(PORTAL.TAB.ROSTER, ['FTO NAME','EMAIL'], [['Dana Whitlock','']]);
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(resolveViewerV1_('dana@example.org').role === PORTAL.ROLE.NONE,
   'and an FTO with no address cannot be signed in as - which is the whole '
   + 'reason the live roster needs its EMAIL column filled');

// ---------------------------------------------------------------- //
section('Roles resolve from the data, not from what the browser claims');
// ---------------------------------------------------------------- //
world();
ok(resolveViewerV1_('jamie@example.org').role === PORTAL.ROLE.TRAINEE, 'a trainee email resolves to TRAINEE');
ok(resolveViewerV1_('dana@example.org').role === PORTAL.ROLE.FTO, 'a roster email resolves to FTO');
ok(resolveViewerV1_('chief@example.org').role === PORTAL.ROLE.DIVISION, 'the division email resolves to TRAINING_DIVISION');
ok(resolveViewerV1_('md@example.org').role === PORTAL.ROLE.MEDICAL, 'the medical email resolves to MEDICAL_DIRECTOR');
ok(resolveViewerV1_('sup@example.org').role === PORTAL.ROLE.SUPERVISOR, 'a supervisor email resolves to SUPERVISOR');
ok(resolveViewerV1_('nobody@example.org').ok === false, 'an unknown email gets no role at all');
ok(resolveViewerV1_('').ok === false, 'an empty identity gets no role');
ok(/not on the roster/.test(resolveViewerV1_('nobody@example.org').why), 'and is told why, plainly');
ok(resolveViewerV1_('JAMIE@Example.ORG').role === PORTAL.ROLE.TRAINEE, 'matching is case-insensitive');

// ---------------------------------------------------------------- //
section('A trainee receives their own record and nobody else appears in it');
// ---------------------------------------------------------------- //
world();
let r = payloadFor('jamie@example.org');
let blob = JSON.stringify(r.d);
ok(r.d.name === 'Jamie Rivers', 'Jamie gets Jamie');
ok(r.d.signed === 1 && r.d.applicable === 2, 'their own skill counts');
ok(r.d.coaching.length === 1, 'their own unacknowledged coaching');
ok(!/Alex Bramble/.test(blob), 'Alex Bramble appears NOWHERE in the payload');
ok(!/Priya Okafor/.test(blob), 'nor does Priya Okafor');
ok(!/Rosa Quill/.test(blob), 'nor does the released trainee');
ok(!/Slow the primary survey/.test(blob), "nor another trainee's coaching text");
ok(!/Medication concentration/.test(blob), 'nor the urgent concern about someone else');

r = payloadFor('alex@example.org');
blob = JSON.stringify(r.d);
ok(r.d.name === 'Alex Bramble', 'Alex gets Alex');
ok(!/Jamie Rivers/.test(blob), 'and Jamie is absent from it');
ok(!/Radio reports/.test(blob), "including Jamie's coaching");

// ---------------------------------------------------------------- //
section('An FTO sees only the people assigned to them');
// ---------------------------------------------------------------- //
world();
r = payloadFor('dana@example.org');
let names = r.d.trainees.map(t => t.name);
ok(names.indexOf('Jamie Rivers') >= 0 && names.indexOf('Alex Bramble') >= 0, "Dana's two trainees are listed");
ok(names.indexOf('Priya Okafor') < 0, "Marcus's trainee is not");
ok(names.indexOf('Rosa Quill') < 0, 'a released trainee is not listed as active');
ok(!/Radio reports|Medication concentration/.test(JSON.stringify(r.d)),
   'and an FTO list carries no coaching or concern narrative');

r = payloadFor('marcus@example.org');
ok(r.d.trainees.length === 1 && r.d.trainees[0].name === 'Priya Okafor', 'Marcus sees only Priya');

// ---------------------------------------------------------------- //
section('A supervisor is scoped to their shift and gets no detail');
// ---------------------------------------------------------------- //
world();
r = payloadFor('sup@example.org');
names = r.d.trainees.map(t => t.name);
ok(names.indexOf('Jamie Rivers') >= 0 && names.indexOf('Alex Bramble') >= 0, 'A shift trainees are shown');
ok(names.indexOf('Priya Okafor') < 0, 'a B shift trainee is not');
ok(names.indexOf('Rosa Quill') < 0, 'nor is a released one');
ok(!/coaching|Radio reports|Medication/i.test(JSON.stringify(r.d)),
   'and the supervisor payload contains no coaching or concern text');

// ---------------------------------------------------------------- //
section('The Medical Director gets clinical cases and nothing else');
// ---------------------------------------------------------------- //
world();
r = payloadFor('md@example.org');
ok(r.d.cases.length === 1, 'one referred case');
ok(/Medication concentration/.test(JSON.stringify(r.d)), 'with the clinical narrative');
ok(!/Radio reports/.test(JSON.stringify(r.d)), 'but no routine coaching');
ok(!r.d.trainees, 'and no trainee roster at all');

// ---------------------------------------------------------------- //
section('The Division sees the queue, and closed people are excluded');
// ---------------------------------------------------------------- //
world();
r = payloadFor('chief@example.org');
ok(r.d.activeCount === 4, 'four active trainees');
ok(r.d.closedCount === 1, 'the released one is counted separately, not silently dropped');
ok(r.d.queueCount === 2, 'both open sign-offs');
ok(r.d.incomplete.length === 1 && r.d.incomplete[0].name === 'Sam Ledger',
   'the incomplete enrolment is surfaced');
ok(/level|phase|training officer|start date/.test(r.d.incomplete[0].missing),
   'and it says exactly what is missing');

// ---------------------------------------------------------------- //
section('Writes: only in staging, only by the right role, only your own row');
// ---------------------------------------------------------------- //
world();
as('jamie@example.org');
let out = submitReflectionV1({ wentWell: 'good', wasHard: 'hard', workOn: 'this' });
ok(/^RF-/.test(out.ref), 'a trainee can file a reflection in staging');
ok(SHEETS[PORTAL.TAB.REFLECT].g.length === HR + 1, 'and one row is appended');
ok(SHEETS[PORTAL.TAB.AUDIT].g.length === HR + 1, 'and it is audited');
ok(SHEETS[PORTAL.TAB.AUDIT].g[HR][2] === 'jamie@example.org',
   'the audit row names the account that acted, not a typed name');

world(); as('dana@example.org');
let threw = false;
try { submitReflectionV1({}); } catch (e) { threw = /Only a trainee/.test(e.message); }
ok(threw, 'an FTO cannot file a reflection as a trainee');

world(); as('jamie@example.org');
threw = false;
try { approveSignoffV1(HR + 1, 'looks fine to me'); } catch (e) { threw = /Only the Training Division/.test(e.message); }
ok(threw, 'a trainee cannot approve a sign-off');

world(); as('chief@example.org');
threw = false;
try { approveSignoffV1(HR + 1, 'ok'); } catch (e) { threw = /Type why/.test(e.message); }
ok(threw, 'the Division cannot approve with a token reason');

world(); as('chief@example.org');
approveSignoffV1(HR + 1, 'Directly observed on two separate shifts and verified.');
let q = readTabV1_(PORTAL.TAB.QUEUE);
ok(q.rows[0][q.col['DECISION']] === 'Approve sign-off', 'a proper approval records the decision');
ok(q.rows[0][q.col['DECIDED BY']] === 'chief@example.org', 'against the real signed-in account');
ok(q.rows[0][q.col['RECORD STATUS']] === 'RECORDED', 'and closes the queue row');

world(); as('jamie@example.org');
threw = false;
try { ackCoachingV1(HR + 2); } catch (e) { threw = /belongs to someone else/.test(e.message); }
ok(threw, "a trainee cannot acknowledge another trainee's coaching note");

world(); as('jamie@example.org');
ackCoachingV1(HR + 1);
let c = readTabV1_(PORTAL.TAB.COACHING);
ok(c.rows[0][c.col['ACKNOWLEDGED']] === 'YES', 'but can acknowledge their own');

// ---------------------------------------------------------------- //
section('Production mode is read-only, absolutely');
// ---------------------------------------------------------------- //
world(); PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
ok(mayWriteV1_() === false, 'PRODUCTION mode disallows writes');
['submitReflectionV1','approveSignoffV1','ackCoachingV1'].forEach(fn => {
  as(fn === 'approveSignoffV1' ? 'chief@example.org' : 'jamie@example.org');
  let blocked = false;
  try { eval(fn)(HR + 1, 'a perfectly good reason here'); }
  catch (e) { blocked = /read-only|Refusing/.test(e.message); }
  ok(blocked, fn + ' refuses outside staging');
});

// ---------------------------------------------------------------- //
section('LIVE opens exactly three things, and role still decides each');
// ---------------------------------------------------------------- //
// PRODUCTION shows people their records and refuses every action, which is
// the right place to start and the wrong place to stop - a portal nobody can
// do anything in is a spreadsheet with a nicer font. LIVE is the real
// tracker doing its job. What matters is that it opens the three everyday
// actions and NOT the authorisation model around them.

world(); PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
ok(mayWriteV1_() === true, 'LIVE allows the everyday actions');
ok(isPracticeV1_() === false, 'and knows perfectly well the data is real');
ok(isLiveV1_() === true, 'and says so');

// the three that open
as('jamie@example.org');
ok(threwMsg(() => submitReflectionV1({ wentWell: 'Slowed the primary survey.' })) === '',
   'a trainee can file their own reflection');
ok(threwMsg(() => ackCoachingV1(HR + 1)) === '',
   'and acknowledge their own coaching note');
as('chief@example.org');
ok(threwMsg(() => approveSignoffV1(HR + 1, 'Watched the last three in person.')) === '',
   'and the Division can approve a sign-off with a typed reason');

// everything the role model refuses is STILL refused
world(); PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
as('dana@example.org');
ok(/Only a trainee/.test(threwMsg(() => submitReflectionV1({ wentWell: 'x' }))),
   'an FTO still cannot file a reflection as a trainee');
ok(/Only the Training Division/.test(threwMsg(() => approveSignoffV1(HR + 1, 'looks fine to me'))),
   'and still cannot approve a sign-off');
as('jamie@example.org');
ok(/belongs to someone else/.test(threwMsg(() => ackCoachingV1(HR + 2))),
   'a trainee still cannot acknowledge somebody else\'s coaching note');
as('chief@example.org');
ok(/Type why/.test(threwMsg(() => approveSignoffV1(HR + 1, 'ok'))),
   'and a sign-off still needs a real reason, not a word');
as('jamie@example.org');
ok(/not recognised|not on the roster/.test(
     threwMsg(() => { ACTIVE = EFFECTIVE = 'stranger@example.org';
       PEOPLE_CACHE_V1 = null; recordV1('Jamie Rivers'); })),
   'and somebody the data does not know still gets nothing');

// the audit log, which PRODUCTION was silently throwing away
world(); PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
let auditRows = () => (SHEETS[PORTAL.TAB.AUDIT] ? SHEETS[PORTAL.TAB.AUDIT].g.length : 0);
let auditBefore = auditRows();
auditV1_('TEST', 'someone@example.org', 'detail');
ok(auditRows() === auditBefore, 'PRODUCTION writes no audit entry, because it writes nothing');

world(); PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
auditBefore = auditRows();
as('chief@example.org');
approveSignoffV1(HR + 1, 'Watched the last three in person.');
ok(auditRows() > auditBefore,
   'LIVE records who approved it, which is the whole reason a decision is safe to allow');

function threwMsg(fn) { try { fn(); return ''; } catch (e) { return String(e.message || e); } }

world(); delete PROPS[PORTAL.PROPERTY_TARGET];
threw = false;
try { targetIdV1_(); } catch (e) { threw = /not pointed at a spreadsheet/.test(e.message); }
ok(threw, 'with no target configured the portal refuses to run at all');
ok(!/1YL-9Er9|1q7OnZox/.test(fs.readFileSync('/home/user/SCEMS-FTO/portal/00_Config.gs','utf8')),
   'and no production spreadsheet id is hard-coded anywhere in config');

// ---------------------------------------------------------------- //
section('Submitted text cannot become a formula');
// ---------------------------------------------------------------- //
ok(clean_('=IMPORTRANGE("x","y")').charAt(0) === "'", 'a leading = is neutralised');
['+','-','@'].forEach(ch => ok(clean_(ch + 'danger').charAt(0) === "'", 'a leading ' + ch + ' is neutralised'));
ok(clean_('Normal text') === 'Normal text', 'ordinary text is untouched');

// ---------------------------------------------------------------- //
section('The page cannot be framed, and carries no secrets');
// ---------------------------------------------------------------- //
const web = fs.readFileSync('/home/user/SCEMS-FTO/portal/30_WebApp.gs','utf8');
ok(/XFrameOptionsMode\.DEFAULT/.test(web), 'framing is set to DEFAULT, which sends SAMEORIGIN');
// match the CALL, not the word - the comment above it explains ALLOWALL
ok(!/setXFrameOptionsMode\([^)]*ALLOWALL/.test(web),
   'and never ALLOWALL, which would let any site frame it');
// prove it by running doGet against the stub, rather than trusting the text
var rendered = false;
try { as('chief@example.org'); doGet({}); rendered = true; } catch (e) { rendered = 'threw: ' + e.message; }
ok(rendered === true, 'doGet actually renders without a null-mode error');
const idx = fs.readFileSync('/home/user/SCEMS-FTO/portal/Index.html','utf8');
ok(!/AKfycb|1YL-9Er9|@gmail\.com|@sumtercountysc/.test(idx),
   'the page embeds no deployment id, spreadsheet id or real address');
ok(/google\.script\.run/.test(idx), 'and every action goes back to the server');
ok(/function esc\(/.test(idx) && (idx.match(/esc\(/g) || []).length > 30,
   'and server data is escaped before it reaches the DOM');


// ---------------------------------------------------------------- //
section('The boot payload survives templating');
// ---------------------------------------------------------------- //
// Apps Script has two scriptlets. <?= x ?> HTML-escapes; <?!= x ?> prints raw.
// Injecting JSON with the escaping one turns every " into &quot; and the page
// dies before it renders - which looks like "Loading" forever, not an error.
// This reproduces both and requires the result to be parseable JavaScript.
const tpl = fs.readFileSync('/home/user/SCEMS-FTO/portal/Index.html', 'utf8');
const bootLine = (tpl.match(/var BOOT = <\?!?=\s*boot\s*\?>;/) || [''])[0];
ok(!!bootLine, 'the page injects a boot payload');
ok(/<\?!=/.test(bootLine), 'using the NON-escaping scriptlet <?!= ?>');

function escapeLikeAppsScript(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const realBoot = JSON.stringify({
  version:'portal-1.3.0', mode:'STAGING',
  viewer:{ email:'chief@example.org', role:'TRAINING_DIVISION', name:"Dana O'Neill", ok:true, why:'' },
  data:{ queue:[{ trainee:'Jamie Rivers', skill:'IV access', evidence:'4 of 4 successful' }] },
  error:''
});

function parses(js){ try { new Function(js); return true; } catch (e) { return false; } }

// ---------------------------------------------------------------- //
// What the TEMPLATE ENGINE sees, which is not what a JavaScript reader sees.
//
// HtmlService scans the raw page for scriptlet markers. It does not know what
// a comment is. A marker inside a // comment is still a scriptlet, and an
// EMPTY one compiles to invalid JavaScript - at which point evaluate() throws
// a SyntaxError attributed to the line in Code.gs that called it, nowhere near
// the page that caused it.
//
// That is not hypothetical. It shipped. This models the engine's scan rather
// than one marker, so it cannot ship twice.
// ---------------------------------------------------------------- //
const OPEN = '<' + '?';                 // written this way so this FILE is not
const CLOSE = '?' + '>';                // itself full of scriptlet markers

const allMarks = tpl.split(OPEN).slice(1).map(function (chunk) {
  const end = chunk.indexOf(CLOSE);
  return end < 0 ? null : chunk.slice(0, end);
});
ok(allMarks.every(function (m) { return m !== null; }),
   'every scriptlet in the page is closed');
ok(allMarks.length === 1,
   'the page contains exactly one scriptlet' +
   (allMarks.length === 1 ? '' : ', but found ' + allMarks.length +
    ' - the extras are markers someone wrote in prose'));

allMarks.forEach(function (m) {
  const body = String(m).replace(/^[!=]+/, '').trim();
  ok(body.length > 0,
     'the scriptlet has something in it (an empty one is what throws ' +
     'SyntaxError from evaluate)');
  ok(body === 'boot', 'and it prints the boot payload');
});

// no marker anywhere in the page outside that one scriptlet, comment or not
const outsideMarkers = tpl.replace(OPEN + '!= boot ' + CLOSE, '');
ok(outsideMarkers.indexOf(OPEN) < 0,
   'no scriptlet opener appears anywhere else in the page, including in comments');
ok(outsideMarkers.indexOf(CLOSE) < 0,
   'and no closer either');

// the same guard on the built single file, which is what actually gets pasted
const oneFile = fs.readFileSync('/home/user/SCEMS-FTO/portal/SCEMS_PORTAL_ONE_FILE.gs', 'utf8');
const pageInOne = (oneFile.match(/var PORTAL_PAGE_HTML = \[([\s\S]*?)\]\.join\(''\);/) || [])[1];
if (pageInOne) {
  const rebuilt = JSON.parse('[' + pageInOne + ']').join('');
  const strippedOne = rebuilt.replace(OPEN + '!= boot ' + CLOSE, '');
  ok(strippedOne.indexOf(OPEN) < 0 && strippedOne.indexOf(CLOSE) < 0,
     'and none in the page embedded in the file you actually paste');
}

ok(parses('var BOOT = ' + realBoot + ';'),
   'the raw payload is valid JavaScript');
// take the whole <script> block, not a slice of it, so braces stay balanced
const scriptBody = tpl.slice(tpl.lastIndexOf('<script>') + 8, tpl.lastIndexOf('</script>'));
ok(parses(scriptBody.replace(/<\?!=\s*boot\s*\?>/, realBoot)),
   'the whole page script parses once the payload is substituted');
ok(!parses(scriptBody.replace(/<\?!=\s*boot\s*\?>/, escapeLikeAppsScript(realBoot))),
   'and fails to parse if that payload were escaped');
ok(!parses('var BOOT = ' + escapeLikeAppsScript(realBoot) + ';'),
   'and the ESCAPED payload does not parse - this is the bug that showed as "Loading" forever');

// ---------------------------------------------------------------- //
section('Deployed as the owner, a visitor is still a visitor');
// ---------------------------------------------------------------- //
// This is the one that would have happened on the very first live page load.
//
// A web app deployed "Execute as: Me" runs every request under the owner's
// account, so Session.getEffectiveUser() is the OWNER whoever is looking.
// Google also declines to name a visitor from outside the owner's Workspace
// domain and hands back '' from getActiveUser() - which is most of this
// roster, because most of them sign in with a personal address.
//
// Identity used to fall back from the first to the second. Put those three
// facts together and every trainee who opened the link was resolved as the
// Training Division and handed everybody's records. It would not have looked
// like a failure. It would have looked like the portal working.

world();
PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};

// A template stub that keeps what was assigned to it, so these tests can read
// exactly what doGet put in front of the browser.
function capturingTemplate() {
  const t = { boot: '' };
  t.evaluate = () => ({ _t: t,
    setTitle: function () { return this; }, addMetaTag: function () { return this; },
    setXFrameOptionsMode: function () { return this; } });
  return t;
}
global.HtmlService = { createTemplate: capturingTemplate,
  createTemplateFromFile: capturingTemplate,
  XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' } };

/** Exactly what the platform does for an unnamed visitor to an owner-run
 *  web app: no active user, and an effective user who is the owner. */
function deployedAsOwner(ownerEmail) {
  ACTIVE = '';
  EFFECTIVE = ownerEmail;
  PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
}

deployedAsOwner('chief@example.org');
ok(whoIsVisitingV1_() === '', 'a visitor Google will not name is nobody');
ok(whoIsAskingV1_() === 'chief@example.org',
   'while the editor still knows who is running things from the dropdown');

let vis = resolveViewerV1_(whoIsVisitingV1_());
ok(vis.role === PORTAL.ROLE.NONE, 'and resolves to no role at all');
ok(!vis.ok, 'so nothing is authorised');
ok(vis.role !== PORTAL.ROLE.DIVISION,
   'NOT the Training Division, which is what the owner fallback made them');

// the page itself
let page = doGet({});
let bootJson = JSON.parse(page._t.boot);
ok(bootJson.viewer.role === PORTAL.ROLE.NONE, 'doGet hands the browser no role');
ok(JSON.stringify(bootJson.data) === '{}', 'and an empty payload');
ok(!/Jamie Rivers|Alex Bramble|Priya Okafor/.test(page._t.boot),
   'no trainee name reaches the browser');
ok(/signed in with/.test(bootJson.viewer.why) || /which account/.test(bootJson.viewer.why),
   'the page says why, in terms of what to change');

// and every action a browser can reach
PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
[['ackCoachingV1', () => ackCoachingV1(PORTAL.HEADER_ROW + 1)],
 ['submitReflectionV1', () => submitReflectionV1({ wentWell: 'x' })],
 ['approveSignoffV1', () => approveSignoffV1(PORTAL.HEADER_ROW + 1, 'because of reasons')],
 ['recordV1', () => recordV1('Jamie Rivers')]
].forEach(c => {
  deployedAsOwner('chief@example.org');
  let refused = false;
  try { c[1](); } catch (e) { refused = true; }
  ok(refused, c[0] + ' refuses an unnamed visitor');
});

deployedAsOwner('chief@example.org');
const refreshed = refreshV1();
ok(refreshed.viewer.role === PORTAL.ROLE.NONE, 'refreshV1 gives them nothing either');
ok(JSON.stringify(refreshed.data) === '{}', 'with no data attached');

// the same owner, actually signed in, is still the Division. The fix must not
// lock the person the portal is for out of it.
as('chief@example.org');
ok(resolveViewerV1_(whoIsVisitingV1_()).role === PORTAL.ROLE.DIVISION,
   'and when the owner really is the one looking, they are the Division');

// a named trainee visiting an owner-run deployment is unaffected: Google named
// them, so the fallback was never reached and nothing changes for them.
ACTIVE = 'jamie@example.org'; EFFECTIVE = 'chief@example.org';
PEOPLE_CACHE_V1 = null; TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {};
vis = resolveViewerV1_(whoIsVisitingV1_());
ok(vis.role === PORTAL.ROLE.TRAINEE && vis.name === 'Jamie Rivers',
   'a visitor Google DOES name is themselves, not the owner');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
