// SCEMS Portal — adding a trainee to Field Training and linking existing forms.
//
// Claim: Training Division can put a new person on 01 TRAINEE MASTER from
// Field Training, and the registered Google Forms' Trainee dropdowns pick them up
// without creating a new form.
//
//   node test/portal-add-trainee.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }
function threw(fn) { try { fn(); return ''; } catch (e) { return String(e.message || e); } }

let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '', LOGS = [];

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1);
};
FakeSheet.prototype.appendRow = function (r) { this.g.push(r.slice()); return this; };
FakeSheet.prototype.setFrozenRows = function () { return this; };
FakeSheet.prototype.deleteRow = function (n) { this.g.splice(n - 1, 1); return this; };
FakeSheet.prototype.clear = function () { this.g = []; return this; };
FakeSheet.prototype.setValidation = function (col, allowed, type, a1) {
  this.validate = this.validate || {};
  this.validate[col] = { allowed: allowed, type: type || 'VALUE_IN_LIST', a1: a1 || '' };
  return this;
};
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
    getDataValidation: function () {
      const v = sh.validate && sh.validate[C];
      if (!v) return null;
      return {
        getCriteriaType: () => v.type,
        getCriteriaValues: () => [v.allowed()]
      };
    },
    setValue: function (v) {
      const rule = sh.validate && sh.validate[C];
      if (rule && String(v) !== '' && rule.allowed().indexOf(String(v)) < 0) {
        throw new Error('The data you entered in cell ' +
          String.fromCharCode(64 + C) + R +
          ' violates the data validation rules set on this cell.');
      }
      (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v;
      return api;
    },
    setValues: function (vs) {
      vs.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return api;
    },
    setDataValidation: function (rule) {
      sh.validate = sh.validate || {};
      if (!rule) { delete sh.validate[C]; return api; }
      sh.validate[C] = {
        allowed: () => rule.list.filter(x => x !== ''),
        type: rule.type, a1: ''
      };
      return api;
    }
  };
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat']
    .forEach(m => api[m] = () => api);
  return api;
};

const NEW_DV = function () {
  const rule = { type: '', list: [], allowInvalid: true, help: '' };
  const api = {
    requireValueInList: function (list) { rule.type = 'VALUE_IN_LIST'; rule.list = list.slice(); return api; },
    setAllowInvalid: function (v) { rule.allowInvalid = v; return api; },
    setHelpText: function (t) { rule.help = t; return api; },
    build: function () { return rule; }
  };
  return api;
};

let OPENABLE = {};
const BOOK = {
  getSheetByName: n => SHEETS[n] || null,
  getId: () => 'STG-BOOK',
  getName: () => 'STG_Sandbox',
  getUrl: () => 'https://example/stg',
  insertSheet: n => (SHEETS[n] = new FakeSheet(n, [[]])),
  getSheets: () => Object.keys(SHEETS).map(n => SHEETS[n])
};

global.SpreadsheetApp = {
  openById: id => {
    if (OPENABLE[id] === undefined) throw new Error('No item with the given ID could be found');
    return Object.assign(Object.create(BOOK), { getName: () => OPENABLE[id], getId: () => id });
  },
  create: () => BOOK,
  getUi: () => { throw new Error('no ui'); },
  newDataValidation: NEW_DV
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
global.Utilities = { formatDate: () => '2026-08-28 1200' };
global.Logger = { log: m => LOGS.push(String(m)) };
global.HtmlService = {
  createTemplateFromFile: () => ({
    evaluate: () => ({
      setTitle: function () { return this; },
      addMetaTag: function () { return this; },
      setXFrameOptionsMode: function () { return this; }
    })
  }),
  XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
};

let FORM_READS = 0, FORMS = {};

function FakeItem(entryId, title, type, choices) {
  this.entryId = entryId;
  this.title = title;
  this.type = type;
  this.choices = choices || [];
}
FakeItem.prototype.getTitle = function () { return this.title; };
FakeItem.prototype.getType = function () { return this.type; };
FakeItem.prototype.asListItem = function () {
  const it = this;
  return {
    getChoices: () => (it.choices || []).map(c => ({ getValue: () => c })),
    setChoiceValues: function (vals) { it.choices = (vals || []).slice(); return this; },
    createResponse: v => {
      if ((it.choices || []).indexOf(String(v)) < 0) throw new Error('Invalid choice: ' + v);
      return { item: it, value: String(v) };
    }
  };
};
FakeItem.prototype.asTextItem = function () {
  const it = this;
  return { createResponse: v => ({ item: it, value: String(v) }) };
};

function FakeForm(id, items) {
  this.id = id;
  this.items = items;
}
FakeForm.prototype.getPublishedUrl = function () {
  return 'https://forms.example/e/' + this.id + '/viewform';
};
FakeForm.prototype.getItems = function (type) {
  if (type === 'LIST' || (global.FormApp.ItemType && type === global.FormApp.ItemType.LIST)) {
    return this.items.filter(i => i.type === 'LIST');
  }
  return this.items.slice();
};
FakeForm.prototype.createResponse = function () {
  const form = this, parts = [];
  const resp = {
    withItemResponse: function (r) { parts.push(r); return resp; },
    toPrefilledUrl: function () {
      return form.getPublishedUrl() + '?' +
        parts.map(p => p.item.entryId + '=' + encodeURIComponent(p.value)).join('&');
    }
  };
  return resp;
};

global.FormApp = {
  ItemType: { LIST: 'LIST' },
  openById: id => {
    FORM_READS++;
    if (!FORMS[id]) throw new Error('No item with the given ID could be found');
    return FORMS[id];
  }
};

const ROOT = fs.existsSync('/workspace/portal/00_Config.gs')
  ? '/workspace'
  : '/home/user/SCEMS-FTO';

eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production',
  '60_History','70_Backfill','80_Import','85_Merge','90_Staging','92_Lifecycle','93_Acknowledge','94_Assign',
  '95_Unprocessed','96_Roster','97_Rename','98_Retire','99_AddFto','99_AddTrainee']
  .map(f => fs.readFileSync(ROOT + '/portal/' + f + '.gs', 'utf8'))
  .join('\n'));

function seed() {
  PROPS = {};
  SHEETS = {};
  LOGS = [];
  FORMS = {};
  FORM_READS = 0;
  ACTIVE = 'chief@example.org';
  EFFECTIVE = 'chief@example.org';
  PEOPLE_CACHE_V1 = null;
  try { forgetTabsV1_(); } catch (e) {}

  const masterHeaders = ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO',
    'START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'];
  // PORTAL.HEADER_ROW is 4 — rows 1–3 are banner/legend, row 4 headers, 5+ data.
  const pad = () => { const g = []; for (let i = 0; i < PORTAL.HEADER_ROW - 1; i++) g.push([]); return g; };

  const masterG = pad();
  masterG.push(masterHeaders);
  masterG.push(['Jamie Rivers','STG-01','Paramedic','A','Dana Whitlock','','Phase 2','Active',
    'jamie.rivers@example.org','','A']);
  SHEETS['01 TRAINEE MASTER'] = new FakeSheet('01 TRAINEE MASTER', masterG);

  const rosterG = pad();
  rosterG.push(['FTO','EMAIL','LEVEL','ACTIVE']);
  rosterG.push(['Dana Whitlock','dana.whitlock@example.org','Paramedic','Yes']);
  rosterG.push(['Marcus Vane','marcus.vane@example.org','Paramedic','Yes']);
  SHEETS['22 FTO ROSTER'] = new FakeSheet('22 FTO ROSTER', rosterG);

  SHEETS['PORTAL AUDIT'] = new FakeSheet('PORTAL AUDIT', [
    ['WHEN','WHAT','WHO','DETAIL','VERSION']
  ]);

  SHEETS['01 TRAINEE MASTER'].setValidation(5, () => ['Dana Whitlock', 'Marcus Vane']);

  PORTAL_FORMS.filter(f => !f.retired).forEach(f => {
    const items = [
      new FakeItem('e1', 'Trainee', 'LIST', ['Jamie Rivers']),
      new FakeItem('e2', 'FTO name', 'LIST', ['Dana Whitlock'])
    ];
    if (f.key === 'HANDOVER') {
      items.push(new FakeItem('e3', 'Trainee you are covering', 'LIST', ['Jamie Rivers']));
    }
    FORMS[f.id] = new FakeForm(f.id, items);
  });

  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  PROPS['PORTAL_FORM_LINKS'] = 'OFF';
  OPENABLE = { 'STG-BOOK': 'STG_Sandbox' };
}

section('Parsing a new trainee');
{
  const a = parseAddTraineeRequestV1_(
    'Casey Holt, casey.holt@example.org, EMT, Phase 1, Dana Whitlock, A');
  ok(a && a.name === 'Casey Holt', 'reads the name');
  ok(a.email === 'casey.holt@example.org', 'reads the email');
  ok(a.level === 'EMT', 'canonicalizes EMT');
  ok(a.phase === 'Phase 1', 'reads the phase');
  ok(a.fto === 'Dana Whitlock', 'reads the FTO');
  ok(a.entry === 'A', 'reads the entry letter');

  const b = parseAddTraineeRequestV1_({
    name: 'Casey Holt', email: 'casey@example.org', level: 'aemt', phase: '2'
  });
  ok(b.level === 'Advanced EMT', 'web payload aemt → Advanced EMT');
  ok(b.phase === 'Phase 2', 'web payload phase 2 → Phase 2');
}

section('Plan refuses bad inputs');
{
  seed();
  PROPS[PORTAL_ADD_TRAINEE_PROPERTY] = 'Jamie Rivers, jamie2@example.org, EMT';
  const p = addTraineePlanV1_();
  ok(p.already.length === 1, 'refuses a name already on the master');
  ok(!p.add.length, 'adds nobody when they already exist');

  PROPS[PORTAL_ADD_TRAINEE_PROPERTY] =
    'Casey Holt, jamie.rivers@example.org, EMT';
  const p2 = addTraineePlanV1_();
  ok(p2.clash.length === 1, 'refuses an email that already belongs to someone');

  PROPS[PORTAL_ADD_TRAINEE_PROPERTY] =
    'Casey Holt, casey@example.org, EMT, Phase 1, Nobody Here';
  const p3 = addTraineePlanV1_();
  ok(p3.badFto.length === 1, 'refuses an FTO not on the active roster');

  PROPS[PORTAL_ADD_TRAINEE_PROPERTY] = 'Casey Holt, EMT';
  const p4 = addTraineePlanV1_();
  ok(p4.incomplete.length === 1, 'refuses a row with no email');
}

section('Add writes the master and refreshes existing forms');
{
  seed();
  PROPS[PORTAL_ADD_TRAINEE_PROPERTY] =
    'Casey Holt, casey.holt@example.org, EMT, Phase 1, Dana Whitlock, A';
  const before = SHEETS['01 TRAINEE MASTER'].g.length;
  const msg = String(addTrainee());
  ok(/Casey Holt/.test(msg), 'report names the person added');
  ok(/EXISTING FORMS UPDATED|registered form/i.test(msg),
     'report says existing forms were updated');
  ok(SHEETS['01 TRAINEE MASTER'].g.length === before + 1, 'one new master row');

  const last = SHEETS['01 TRAINEE MASTER'].g[SHEETS['01 TRAINEE MASTER'].g.length - 1];
  ok(last[0] === 'Casey Holt', 'name is in TRAINEE');
  ok(String(last[2]) === 'EMT', 'level is EMT');
  ok(String(last[4]) === 'Dana Whitlock', 'FTO assigned');
  ok(String(last[6]) === 'Phase 1', 'phase is Phase 1');
  ok(String(last[7]) === 'Active', 'status Active');
  ok(String(last[8]) === 'casey.holt@example.org', 'email on the master');

  const evalForm = FORMS[formByKeyV1_('FTO_EVAL').id];
  const traineeItem = evalForm.items.find(i => i.title === 'Trainee');
  ok(traineeItem.choices.indexOf('Casey Holt') >= 0,
     'End-of-shift evaluation Trainee list includes Casey');
  ok(traineeItem.choices.indexOf('Jamie Rivers') >= 0,
     'and still includes people who were already there');

  const skills = FORMS[formByKeyV1_('SKILLS_EMT').id];
  const skTrainee = skills.items.find(i => i.title === 'Trainee');
  ok(skTrainee.choices.indexOf('Casey Holt') >= 0,
     'EMT skills log Trainee list includes Casey (level-scoped)');
  const pmd = FORMS[formByKeyV1_('SKILLS_PMD').id];
  const pmdTrainee = pmd.items.find(i => i.title === 'Trainee');
  ok(pmdTrainee.choices.indexOf('Casey Holt') < 0,
     'Paramedic skills log does not list an EMT trainee');
  ok(pmdTrainee.choices.indexOf('Jamie Rivers') >= 0,
     'Paramedic skills log still lists the paramedic');
}

section('Web addTraineeV1 is Division-only and writable-mode only');
{
  seed();
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  let err = threw(() => addTraineeV1({
    name: 'Casey Holt', email: 'casey@example.org', level: 'EMT'
  }));
  ok(/read only|PRODUCTION|cannot|refus/i.test(err),
     'PRODUCTION refuses the web add');

  seed();
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
  ACTIVE = 'dana.whitlock@example.org';
  EFFECTIVE = ACTIVE;
  err = threw(() => addTraineeV1({
    name: 'Casey Holt', email: 'casey@example.org', level: 'EMT'
  }));
  ok(/Training Division|Division/i.test(err),
     'an FTO cannot add a trainee from Field Training');

  seed();
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
  ACTIVE = 'chief@example.org';
  EFFECTIVE = ACTIVE;
  const r = addTraineeV1({
    name: 'Casey Holt',
    email: 'casey.holt@example.org',
    level: 'EMT',
    phase: 'Phase 1',
    fto: 'Dana Whitlock',
    entry: 'A'
  });
  ok(r && r.ok && r.name === 'Casey Holt', 'Division in LIVE can add');
  ok(/Field Training|forms/i.test(r.message), 'success message mentions Field Training / forms');
  const names = traineesV1_().map(t => t.name);
  ok(names.indexOf('Casey Holt') >= 0, 'Casey is on the master after web add');
}

section('Field Training page has Bring someone on');
{
  const page = fs.readFileSync(ROOT + '/portal/Index.html', 'utf8');
  ok(/Bring someone on|openAddTrainee/.test(page), 'Division desk offers Bring someone on');
  ok(/addTraineeV1/.test(page), 'page calls addTraineeV1');
  ok(/openAddTrainee|paintAddTrainee/.test(page), 'add-trainee screen exists');
  ok(/syncRegisteredFormChoicesV1_/.test(
    fs.readFileSync(ROOT + '/portal/40_Forms.gs', 'utf8')),
    'form choice sync lives with the form registry');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
