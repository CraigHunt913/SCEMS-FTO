// Division home must not open FormApp / scan every form-response tab /
// walk every source for every trainee on first paint.
//
//   node test/portal-fast-load.test.js

const fs = require('fs');
let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }
function threw(fn) { try { fn(); return ''; } catch (e) { return String(e.message || e); } }

let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '', LOGS = [], FORMS = {};
function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1);
};
FakeSheet.prototype.appendRow = function (r) { this.g.push(r.slice()); return this; };
FakeSheet.prototype.setFrozenRows = function () { return this; };
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
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    setValues: function (vs) {
      vs.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return api;
    },
    setFontWeight: function () { return api; },
    setBackground: function () { return api; },
    setFontColor: function () { return api; }
  };
  return api;
};
global.SpreadsheetApp = {
  openById: () => ({
    getName: () => 'BOOK',
    getSheetByName: n => SHEETS[n] || null,
    insertSheet: n => { SHEETS[n] = new FakeSheet(n, []); return SHEETS[n]; },
    getId: () => 'BOOK'
  }),
  getUi: () => ({ alert: () => {} })
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => PROPS[k] || null,
    setProperty: (k, v) => { PROPS[k] = String(v); },
    deleteProperty: k => { delete PROPS[k]; }
  })
};
global.Session = {
  getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE || ACTIVE }),
  getScriptTimeZone: () => 'America/New_York'
};
global.Utilities = { formatDate: (d) => '2026-08-18', getUuid: () => 'u' };
global.Logger = { log: () => {} };
global.HtmlService = {
  createTemplate: () => ({ evaluate: () => ({ setTitle: () => {}, addMetaTag: () => {}, setXFrameOptionsMode: () => {} }) }),
  createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => {}, addMetaTag: () => {}, setXFrameOptionsMode: () => {} }) }),
  XFrameOptionsMode: { DEFAULT: 1 }
};
global.MailApp = { sendEmail: () => {} };
global.FormApp = {
  ItemType: { LIST: 'LIST', TEXT: 'TEXT' },
  openById: () => { throw new Error('FormApp must not open during Division home load'); }
};

const ROOT = fs.existsSync('/workspace/portal/00_Config.gs') ? '/workspace' : '/home/user/SCEMS-FTO';
eval(['00_Config','01_Start','10_Identity','20_Data','30_WebApp','40_Forms','50_Production',
  '60_History','70_Backfill','80_Import','85_Merge','87_Settle','88_Report','90_Staging','91_Record',
  '92_Lifecycle','93_Acknowledge','94_Assign','95_Unprocessed','96_Roster','97_Rename','98_Retire',
  '99_AddFto','99_AddTrainee']
  .map(f => fs.readFileSync(ROOT + '/portal/' + f + '.gs', 'utf8')).join('\n'));

function pad() {
  const g = [];
  for (let i = 0; i < PORTAL.HEADER_ROW - 1; i++) g.push([]);
  return g;
}
function tab(name, headers, rows) {
  const g = pad();
  g.push(headers);
  (rows || []).forEach(r => g.push(r));
  SHEETS[name] = new FakeSheet(name, g);
}

function world() {
  PROPS = {};
  SHEETS = {};
  LOGS = [];
  FORMS = {};
  ACTIVE = 'chief@example.org';
  EFFECTIVE = ACTIVE;
  PEOPLE_CACHE_V1 = null;
  try { forgetTabsV1_(); } catch (e) {}
  PROPS[PORTAL.PROPERTY_TARGET] = 'BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','LEVEL','ASSIGNED FTO','START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [
      ['Jamie Rivers','Paramedic','Dana Whitlock', new Date('2026-06-01'),'Phase 2','Active','jamie@example.org', new Date(),'A'],
      ['Priya Okafor','Advanced EMT','Marcus Vane', new Date('2026-04-01'),'Phase 4','Active','priya@example.org', new Date(),'B']
    ]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus@example.org','Paramedic','Yes']]);
  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [[new Date(),'Jamie Rivers','SK-1','','IV access','bars ok','','','','','','OPEN','', 'QR-1']]);
  tab(PORTAL.TAB.SKILLS,
    ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
     'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS'],
    [['Jamie Rivers','IV access','I','','','Paramedic','READY FOR VALIDATION','','','SK-1',5,3,3,2],
     ['Priya Okafor','Airway','A','','','Advanced EMT','SIGNED OFF','SIGNED OFF','','SK-8',5,3,3,2]]);
  tab(PORTAL.TAB.EVAL, ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE','SHIFT DATE'], []);
  tab(PORTAL.TAB.ACKS, ['WHEN','TRAINEE','FINDING','WHO','NOTE','HOLDS UNTIL'], []);
  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);
  tab(PORTAL.TAB.EVIDENCE, ['TRAINEE','SKILL','EVENT DATE','SOURCE RESPONSE ID'], []);
}

section('Division home stays off FormApp');
{
  world();
  const d = divisionPayloadV1_();
  ok(d.people.length === 2, 'home still lists active trainees');
  ok(d.people.every(p => p.skills === null && p.forms === null && p.freshness === null),
     'no per-trainee skills/forms/freshness on home');
  ok(d.inboxLoaded === false, 'inbox not loaded yet');
  ok((d.formWaiting && d.formWaiting.pending) || (d.formWaiting && d.formWaiting.waiting === 0),
     'form waiting deferred');
  ok(Array.isArray(d.duplicateSubs) && d.duplicateSubs.length === 0,
     'duplicate settle scan deferred');
  ok(d.queue.length === 1 && d.queue[0].skill === 'IV access', 'Decide queue still present');
}

section('personDetail loads the heavy bits once');
{
  world();
  // personDetail opens forms — stub FormApp for this section only
  global.FormApp.openById = function () {
    return {
      getPublishedUrl: () => 'https://docs.google.com/forms/d/x/viewform',
      getItems: () => [],
      getTitle: () => 'f'
    };
  };
  PROPS['PORTAL_FORM_LINKS'] = 'OFF';
  const d = personDetailV1('Jamie Rivers');
  ok(d.detailLoaded && Array.isArray(d.skills), 'skills arrive on personDetail');
  ok(d.skills.some(s => /IV/i.test(s.skill)), 'Jamie skill is there');
  ok(/Training Division|FTO|not assigned/i.test(threw(() => {
    ACTIVE = 'jamie@example.org'; EFFECTIVE = ACTIVE;
    personDetailV1('Jamie Rivers');
  })), 'trainee cannot open Division personDetail');
}

section('Page wires deferred load');
{
  const page = fs.readFileSync(ROOT + '/portal/Index.html', 'utf8');
  ok(/divisionInboxV1|ensureDivisionInbox_/.test(page), 'client loads inbox after paint');
  ok(/personDetailV1|loadPersonDetail_/.test(page), 'client loads person detail on open');
  ok(/Loading record|Loading inbox|Loading forms/.test(page), 'shows loading notes while deferred');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
