// SCEMS Portal — phase advance and release from THE LINE.
//
//   node test/portal-lifecycle.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }
function threw(fn) { try { fn(); return ''; } catch (e) { return String(e.message || e); } }

let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '', LOGS = [], OPENABLE = {};

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1);
};
FakeSheet.prototype.appendRow = function (r) { this.g.push(r.slice()); return this; };
FakeSheet.prototype.setFrozenRows = function () { return this; };
FakeSheet.prototype.clear = function () { this.g = []; return this; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValues: function () {
      const o = [];
      for (let i = 0; i < NR; i++) {
        const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]);
        o.push(s);
      }
      return o;
    },
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) {
      (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v;
      return api;
    },
    setValues: function (vs) {
      vs.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return api;
    }
  };
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat']
    .forEach(m => api[m] = () => api);
  return api;
};

const BOOK = {
  getSheetByName: n => SHEETS[n] || null,
  getId: () => 'STG-BOOK',
  getName: () => 'STG_Sandbox',
  insertSheet: n => (SHEETS[n] = new FakeSheet(n, [[]])),
  getSheets: () => Object.keys(SHEETS).map(n => SHEETS[n])
};

global.SpreadsheetApp = {
  openById: id => {
    if (OPENABLE[id] === undefined) throw new Error('not found');
    return Object.assign(Object.create(BOOK), { getName: () => OPENABLE[id], getId: () => id });
  },
  getUi: () => { throw new Error('no ui'); },
  newDataValidation: () => ({
    requireValueInList: () => ({
      setAllowInvalid: () => ({ setHelpText: () => ({ build: () => ({ list: [] }) }) })
    })
  })
};
global.Session = {
  getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE }),
  getScriptTimeZone: () => 'America/New_York'
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
    setProperty: (k, v) => { PROPS[k] = v; },
    deleteProperty: k => { delete PROPS[k]; }
  })
};
global.Utilities = { formatDate: () => '2026-08-29 0100' };
global.Logger = { log: m => LOGS.push(String(m)) };
global.HtmlService = {
  createTemplateFromFile: () => ({
    evaluate: () => ({
      setTitle: function () { return this; },
      addMetaTag: function () { return this; },
      setXFrameOptionsMode: function () { return this; }
    })
  }),
  XFrameOptionsMode: { DEFAULT: 'DEFAULT' }
};

let FORMS = {};
function FakeItem(title, choices) {
  this.title = title; this.type = 'LIST'; this.choices = choices || [];
}
FakeItem.prototype.getTitle = function () { return this.title; };
FakeItem.prototype.getType = function () { return this.type; };
FakeItem.prototype.asListItem = function () {
  const it = this;
  return {
    getChoices: () => it.choices.map(c => ({ getValue: () => c })),
    setChoiceValues: function (vals) { it.choices = (vals || []).slice(); return this; }
  };
};
function FakeForm(id, items) { this.id = id; this.items = items; }
FakeForm.prototype.getItems = function (type) {
  if (type === 'LIST') return this.items.filter(i => i.type === 'LIST');
  return this.items.slice();
};
global.FormApp = {
  ItemType: { LIST: 'LIST' },
  openById: id => {
    if (!FORMS[id]) throw new Error('no form');
    return FORMS[id];
  }
};

const ROOT = fs.existsSync('/workspace/portal/00_Config.gs') ? '/workspace' : '/home/user/SCEMS-FTO';
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production',
  '60_History','70_Backfill','80_Import','85_Merge','90_Staging','92_Lifecycle','93_Acknowledge',
  '94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto','99_AddTrainee']
  .map(f => fs.readFileSync(ROOT + '/portal/' + f + '.gs', 'utf8')).join('\n'));

function pad() {
  const g = [];
  for (let i = 0; i < PORTAL.HEADER_ROW - 1; i++) g.push([]);
  return g;
}

function seed() {
  PROPS = {};
  SHEETS = {};
  LOGS = [];
  FORMS = {};
  ACTIVE = 'chief@example.org';
  EFFECTIVE = ACTIVE;
  PEOPLE_CACHE_V1 = null;
  try { forgetTabsV1_(); } catch (e) {}

  const masterG = pad();
  masterG.push(['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO',
    'START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT']);
  masterG.push(['Jamie Rivers','1','Paramedic','A','Dana Whitlock','',
    'Phase 2','Active','jamie.rivers@example.org','','A']);
  masterG.push(['Priya Okafor','2','Advanced EMT','B','Marcus Vane','',
    'Phase 4','Active','priya.okafor@example.org','','B']);
  SHEETS['01 TRAINEE MASTER'] = new FakeSheet('01 TRAINEE MASTER', masterG);

  const rosterG = pad();
  rosterG.push(['FTO','EMAIL','LEVEL','ACTIVE']);
  rosterG.push(['Dana Whitlock','dana.whitlock@example.org','Paramedic','Yes']);
  rosterG.push(['Marcus Vane','marcus.vane@example.org','Paramedic','Yes']);
  SHEETS['22 FTO ROSTER'] = new FakeSheet('22 FTO ROSTER', rosterG);

  const queueG = pad();
  queueG.push(['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
    'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID']);
  queueG.push(['','Jamie Rivers','SK-1','','IV','','','','','','','OPEN','','QR-1']);
  queueG.push(['','Priya Okafor','SK-2','','Vascular','','','','','','','OPEN','','QR-2']);
  SHEETS[PORTAL.TAB.QUEUE] = new FakeSheet(PORTAL.TAB.QUEUE, queueG);

  SHEETS['PORTAL AUDIT'] = new FakeSheet('PORTAL AUDIT', [['WHEN','WHAT','WHO','DETAIL','VERSION']]);

  PORTAL_FORMS.filter(f => !f.retired).forEach(f => {
    FORMS[f.id] = new FakeForm(f.id, [
      new FakeItem('Trainee', ['Jamie Rivers', 'Priya Okafor']),
      new FakeItem('FTO name', ['Dana Whitlock', 'Marcus Vane'])
    ]);
  });

  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  OPENABLE = { 'STG-BOOK': 'STG_Sandbox' };
}

section('Phase helpers');
{
  ok(nextPhaseV1_('Phase 1') === 'Phase 2', 'Phase 1 → 2');
  ok(nextPhaseV1_('Phase 3') === 'Phase 4', 'Phase 3 → 4');
  ok(nextPhaseV1_('Phase 4') === '', 'Phase 4 has no next');
  ok(phaseIndexV1_('Phase 2') === 1, 'phase index');
}

section('Advance phase');
{
  seed();
  const err = threw(() => advanceTraineePhaseV1('Jamie Rivers', 'short'));
  ok(/why|reason|Type/i.test(err), 'refuses a thin reason');

  const r = advanceTraineePhaseV1('Jamie Rivers',
    'Phase requirements met and FTO handover accepted.');
  ok(r.ok && r.to === 'Phase 3', 'advances Phase 2 → Phase 3');
  const jamie = traineesV1_().filter(t => t.name === 'Jamie Rivers')[0];
  ok(jamie.phase === 'Phase 3', 'master CURRENT PHASE is Phase 3');
  ok(jamie.phaseStart instanceof Date, 'PHASE START DATE stamped');

  const err4 = threw(() => advanceTraineePhaseV1('Priya Okafor',
    'Trying to go past Phase 4 somehow here.'));
  ok(/Phase 4|governance|Release/i.test(err4), 'refuses advancing past Phase 4');
}

section('Release captures who when why');
{
  seed();
  const before = traineesV1_().filter(t => !t.closed).length;
  const r = releaseTraineeV1('Priya Okafor',
    'Program complete. Cleared for independent Advanced EMT duty.');
  ok(r.ok, 'release succeeds');
  const priya = traineesV1_().filter(t => t.name === 'Priya Okafor')[0];
  ok(priya && priya.closed, 'marked closed on the master');
  ok(/Closed \/ Released/i.test(priya.status), 'status is Closed / Released');
  ok(traineesV1_().filter(t => !t.closed).length === before - 1,
     'active count drops by one');

  const log = SHEETS['PORTAL RELEASE LOG'] || SHEETS['17 TRAINEE ARCHIVE'];
  ok(!!log, 'archive / release log exists');
  const blob = JSON.stringify(log.g);
  ok(/Priya Okafor/.test(blob) && /Cleared for independent/.test(blob),
     'archive holds name and reason');
  ok(/chief@example\.org/.test(blob), 'archive holds who released');

  const q = readTabV1_(PORTAL.TAB.QUEUE);
  const priyaQ = q.rows.filter(row => String(row[q.col['TRAINEE']]) === 'Priya Okafor')[0];
  ok(/CANCELLED/.test(String(priyaQ[q.col['RECORD STATUS']] || '')),
     'open skill queue row cancelled');

  const evalForm = FORMS[formByKeyV1_('FTO_EVAL').id];
  const choices = evalForm.items.find(i => i.title === 'Trainee').choices;
  ok(choices.indexOf('Priya Okafor') < 0, 'form Trainee list drops released person');
  ok(choices.indexOf('Jamie Rivers') >= 0, 'still lists active trainees');
}

section('Gates');
{
  seed();
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  ok(/read only|PRODUCTION|cannot|refus/i.test(
    threw(() => advanceTraineePhaseV1('Jamie Rivers', 'Enough characters here.'))),
    'PRODUCTION cannot advance');

  seed();
  ACTIVE = 'dana.whitlock@example.org';
  EFFECTIVE = ACTIVE;
  ok(/Training Division|Division/i.test(
    threw(() => releaseTraineeV1('Priya Okafor', 'Enough characters here.'))),
    'FTO cannot release');
}

section('UI surface');
{
  const page = fs.readFileSync(ROOT + '/portal/Index.html', 'utf8');
  ok(/Advance to/.test(page) && /advanceTraineePhaseV1/.test(page),
     'person sheet can advance');
  ok(/Release/.test(page) && /releaseTraineeV1/.test(page),
     'person sheet can release');
  ok(/Ready to release/.test(page), 'Waiting on you surfaces Phase 4 finish line');
  ok(/Lifecycle/.test(page), 'lifecycle section is named');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
