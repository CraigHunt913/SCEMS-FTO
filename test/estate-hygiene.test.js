// SCEMS v20.6 — estate hygiene.
//
// The "too many Google Sheets" problem had three sources:
//   1. DriveApp.makeCopy of the workbook clones every linked form
//   2. Form relinks mint orphan "Form Responses N" tabs
//   3. setUpStaging created a new sandbox spreadsheet on every run
//
// This suite guards the detectors, the archive token gate, the backup
// neutralization hook, the health-check surface, and the portal reuse rule.
//
//   node test/estate-hygiene.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let SYSLOG = [], SHEETS = {}, SHEET_LIST = [], UI_ALERTS = [];
let DRIVE_FILES = [], DRIVE_FOLDERS = {}, FORM_BY_ID = {}, PROPS = {};
let GATE = true;

function FakeSheet(name, grid, opts) {
  this.name = name; this.g = grid || []; this._formUrl = (opts && opts.formUrl) || null;
}
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () {
  return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1);
};
FakeSheet.prototype.getFormUrl = function () { return this._formUrl; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  const api = {
    getValue: function () { return (sh.g[R - 1] || [])[C - 1]; },
    setValue: function (v) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = v; return api; },
    getValues: function () {
      const o = [];
      for (let i = 0; i < NR; i++) {
        const row = sh.g[R - 1 + i] || [], s = [];
        for (let j = 0; j < NC; j++) s.push(row[C - 1 + j] === undefined ? '' : row[C - 1 + j]);
        o.push(s);
      }
      return o;
    },
    getFormulas: function () {
      return this.getValues();
    },
    setValues: function (vs) {
      vs.forEach((row, i) => {
        sh.g[R - 1 + i] = sh.g[R - 1 + i] || [];
        row.forEach((v, j) => { sh.g[R - 1 + i][C - 1 + j] = v; });
      });
      return api;
    },
    setFormula: function (f) { (sh.g[R - 1] = sh.g[R - 1] || [])[C - 1] = f; return api; }
  };
  return api;
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getId: () => PROPS._bookId || '1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI',
    getName: () => 'SCEMS Field Training Tracker Master*****',
    getSheetByName: n => SHEETS[n] || null,
    getSheets: () => SHEET_LIST.map(n => SHEETS[n]).filter(Boolean)
  }),
  openById: (id) => ({
    getId: () => id,
    getSheets: () => (DRIVE_FILES.find(f => f.id === id) || { sheets: [] }).sheets || []
  }),
  getUi: () => ({
    alert: (a, b) => { UI_ALERTS.push(typeof a === 'string' && b ? a + '\n' + b : String(a)); return 'ok'; },
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', OK: 'OK' },
    Button: { OK: 'ok', CANCEL: 'cancel' }
  }),
  ProtectionType: { SHEET: 'SHEET' },
  flush: () => {}
};
global.Session = {
  getActiveUser: () => ({ getEmail: () => 'dalewhitlock913@example.org' }),
  getEffectiveUser: () => ({ getEmail: () => 'dalewhitlock913@example.org' }),
  getScriptTimeZone: () => 'America/New_York'
};
global.Utilities = {
  getUuid: () => 'stub',
  formatDate: () => '2026-08-28_0405'
};
global.Logger = { log: () => {} };
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => PROPS[k] || '',
    setProperty: (k, v) => { PROPS[k] = v; },
    getProperties: () => Object.assign({}, PROPS),
    deleteProperty: k => { delete PROPS[k]; }
  })
};
global.MailApp = { sendEmail: () => {}, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [], getService: () => ({ getUrl: () => '' }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
global.FormApp = {
  openById: (id) => FORM_BY_ID[id] || null,
  DestinationType: { SPREADSHEET: 'SPREADSHEET' }
};
global.DriveApp = {
  getFoldersByName: (name) => {
    const f = DRIVE_FOLDERS[name];
    let i = 0;
    const list = f ? [f] : [];
    return { hasNext: () => i < list.length, next: () => list[i++] };
  },
  createFolder: (name) => {
    const folder = {
      name, id: 'folder-' + name, files: [], folders: {},
      addFile: function (file) { this.files.push(file); file._parents.push(this); },
      createFolder: function (n) {
        const c = { name: n, id: 'folder-' + n, files: [], addFile: function (file) {
          this.files.push(file); file._parents.push(this);
        }, getId: function () { return this.id; }, getUrl: () => 'https://drive/' + this.id };
        this.folders[n] = c;
        return c;
      },
      getFoldersByName: function (n) {
        const c = this.folders[n];
        let j = 0; const list = c ? [c] : [];
        return { hasNext: () => j < list.length, next: () => list[j++] };
      },
      getId: function () { return this.id; },
      getUrl: () => 'https://drive/' + this.id,
      removeFile: function (file) {
        this.files = this.files.filter(x => x !== file);
        file._parents = file._parents.filter(p => p !== this);
      }
    };
    DRIVE_FOLDERS[name] = folder;
    return folder;
  },
  getFileById: (id) => {
    const f = DRIVE_FILES.find(x => x.id === id);
    if (!f) throw new Error('missing ' + id);
    return f;
  },
  searchFiles: (q) => {
    const forms = DRIVE_FILES.filter(f => f.mime === 'form');
    let i = 0;
    return { hasNext: () => i < forms.length, next: () => forms[i++] };
  }
};

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (lvl, kind, detail) { SYSLOG.push({ lvl, kind, detail }); };
gateV20_2_ = function () { return GATE; };
storedFormIdsV20_1_ = function () { return Object.keys(FORM_BY_ID).filter(id => FORM_BY_ID[id]._live); };
getStoredFormV19_ = function (title) {
  const id = Object.keys(FORM_BY_ID).find(k => FORM_BY_ID[k].getTitle() === title && FORM_BY_ID[k]._live);
  return id ? FORM_BY_ID[id] : null;
};

function reset() {
  SYSLOG = []; SHEETS = {}; SHEET_LIST = []; UI_ALERTS = [];
  DRIVE_FILES = []; DRIVE_FOLDERS = {}; FORM_BY_ID = {}; PROPS = {}; GATE = true;
}
function tab(name, headers, rows, opts) {
  const g = [[], [], []];
  if (headers) g.push(headers.slice());
  (rows || []).forEach(r => g.push(r.slice()));
  SHEETS[name] = new FakeSheet(name, g, opts);
  SHEET_LIST.push(name);
  return SHEETS[name];
}
function liveForm(id, title) {
  const f = {
    _live: true,
    getTitle: () => title,
    getId: () => id,
    getResponses: () => [],
    isAcceptingResponses: () => true,
    collectsEmail: () => true,
    getPublishedUrl: () => 'https://forms/' + id,
    getEditUrl: () => 'https://docs.google.com/forms/d/' + id + '/edit',
    getDestinationId: () => '1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI',
    getItems: () => [],
    setAcceptingResponses: function () {},
    removeDestination: function () { this._removed = true; }
  };
  FORM_BY_ID[id] = f;
  DRIVE_FILES.push({
    id, mime: 'form', getName: () => title, getId: () => id,
    getUrl: () => 'https://drive/' + id, _parents: [],
    getParents: function () {
      let i = 0; const p = this._parents;
      return { hasNext: () => i < p.length, next: () => p[i++] };
    }
  });
  return f;
}
function copyForm(id, title, dest) {
  const f = {
    _live: false,
    getTitle: () => title,
    getId: () => id,
    getResponses: () => [1, 2],
    isAcceptingResponses: () => true,
    setAcceptingResponses: function (v) { this._accepting = v; },
    removeDestination: function () { this._removed = true; this._dest = ''; },
    getDestinationId: () => dest || 'BACKUP_SS'
  };
  FORM_BY_ID[id] = f;
  const file = {
    id, mime: 'form', getName: () => title, getId: () => id,
    getUrl: () => 'https://drive/' + id, _parents: [{
      getId: () => 'root', removeFile: function () {}
    }],
    getParents: function () {
      let i = 0; const p = this._parents;
      return { hasNext: () => i < p.length, next: () => p[i++] };
    }
  };
  DRIVE_FILES.push(file);
  return f;
}

// ---------------------------------------------------------------- //
section('Copy-of title detection');
// ---------------------------------------------------------------- //
reset();
ok(isFormCopyTitleV20_6_('Copy of SCEMS Skills Quick Log'), 'detects a single Copy of');
ok(isFormCopyTitleV20_6_('Copy of Copy of SCEMS FTO Shift Evaluation'), 'detects nested copies');
ok(!isFormCopyTitleV20_6_('SCEMS Skills Quick Log'), 'leaves the live title alone');
ok(liveTitleUnderCopyV20_6_('Copy of Copy of SCEMS Skills Quick Log') === 'SCEMS Skills Quick Log',
   'strips every leading Copy of');
ok(isSCEMSFormCopyTitleV20_6_('Copy of SCEMS Skills Quick Log'), 'recognises a SCEMS clone');
ok(!isSCEMSFormCopyTitleV20_6_('Copy of Unrelated Survey'), 'ignores unrelated copies');
ok(formIdFromUrlV20_6_('https://docs.google.com/forms/d/abc123XYZ/edit') === 'abc123XYZ',
   'extracts a form id from an edit URL');

// ---------------------------------------------------------------- //
section('Form estate inventory never lists a live form');
// ---------------------------------------------------------------- //
reset();
liveForm('LIVE-COMBINED', FORM_TITLES.SKILLS_COMBINED);
copyForm('COPY-1', 'Copy of SCEMS Skills Quick Log');
copyForm('COPY-2', 'Copy of Copy of SCEMS FTO Shift Evaluation');
copyForm('COPY-OTHER', 'Copy of Unrelated Survey');

const inv = formCopyInventoryV20_6_();
ok(inv.length === 2, 'two SCEMS clones found, unrelated ignored: ' + inv.length);
ok(inv.every(c => c.id !== 'LIVE-COMBINED'), 'the live form is never a candidate');
ok(inv.some(c => c.title === 'Copy of SCEMS Skills Quick Log'), 'names the combined-skills clone');

const rep = formEstateReport();
ok(/Backup form clones still in Drive : 2/.test(rep), 'report counts the clones');
ok(/NOTHING WAS MOVED|Nothing was moved|READ ONLY/i.test(rep) || /ARCHIVE FORM COPIES/.test(rep) === false,
   'report itself moves nothing');

// ---------------------------------------------------------------- //
section('Archive is token-gated and never touches live forms');
// ---------------------------------------------------------------- //
reset();
liveForm('LIVE-EVAL', FORM_TITLES.EVAL);
copyForm('COPY-A', 'Copy of SCEMS FTO Shift Evaluation');
copyForm('COPY-B', 'Copy of SCEMS Skills Quick Log');

const preview = archiveFormCopiesV20_6_('');
ok(/NOTHING WAS MOVED/.test(preview), 'blank token writes nothing');
ok(/archiveFormCopies\("ARCHIVE FORM COPIES"\)/.test(preview), 'tells you the exact token');

const done = archiveFormCopiesV20_6_('ARCHIVE FORM COPIES');
ok(/DONE\. Moved : 2/.test(done), 'moves both clones with the right token');
ok(FORM_BY_ID['COPY-A']._removed && FORM_BY_ID['COPY-B']._removed,
   'unlinks clones from any spreadsheet destination');
ok(FORM_BY_ID['COPY-A']._accepting === false, 'closes accepting on archived clones');
ok(!FORM_BY_ID['LIVE-EVAL']._removed, 'live form destination untouched');
ok(SYSLOG.some(l => l.kind === 'FORM COPIES ARCHIVED'), 'writes a system log line');

reset();
GATE = false;
copyForm('COPY-C', 'Copy of SCEMS Urgent Concern Report');
const refused = archiveFormCopiesV20_6_('ARCHIVE FORM COPIES');
ok(/Refused/i.test(refused), 'gate refusal stops the archive');

// ---------------------------------------------------------------- //
section('Backup neutralization archives clones linked to the backup book');
// ---------------------------------------------------------------- //
reset();
liveForm('LIVE-H', FORM_TITLES.HANDOVER);
const backupId = 'BACKUP_SS_1';
copyForm('CLONE-1', 'Copy of SCEMS Trainee Handover Card', backupId);
DRIVE_FILES.push({
  id: backupId, mime: 'sheet', sheets: [
    new FakeSheet('Form Responses 99', [[]], {
      formUrl: 'https://docs.google.com/forms/d/CLONE-1/edit'
    })
  ]
});

const neut = neutralizeBackupFormClonesV20_6_(backupId, '2026-08-28_0405');
ok(neut.moved.length === 1, 'archives the clone linked to the backup');
ok(FORM_BY_ID['CLONE-1']._removed, 'unlinks it from the backup workbook');
ok(SYSLOG.some(l => l.kind === 'BACKUP FORM CLONES ARCHIVED'), 'logs the cleanup');

const backupSrc = fullBackupV20_1.toString();
ok(/neutralizeBackupFormClonesV20_6_/.test(backupSrc),
   'fullBackup calls neutralization after makeCopy');
ok(/formClonesArchived/.test(backupSrc), 'manifest records what was archived');

// ---------------------------------------------------------------- //
section('Health check surfaces estate damage');
// ---------------------------------------------------------------- //
reset();
PROPS._bookId = ORPHAN_TWIN_SPREADSHEET_ID;
tab(TAB.ENGINE, ['NAME'], []);
SHEETS[TAB.ENGINE].g = [[], [], [], [], ['=IF(#REF!="","",#REF!)']];
tab('Form Responses 27', null, [['a'], ['b'], ['c']]);
copyForm('COPY-H', 'Copy of SCEMS Skills Quick Log');
tab(TAB.QUEUE, ['READY DATE', 'TRAINEE', 'SKILL ID', '', 'SKILL'], []);

const items = estateHealthItemsV20_6_();
ok(items.some(i => i.sev === 'BLOCKER' && /orphan twin/i.test(i.headline)),
   'flags the orphan twin spreadsheet as a blocker');
ok(items.some(i => /#REF!/i.test(i.headline)), 'flags engine key damage');
ok(items.some(i => /orphan Form Responses/i.test(i.headline)), 'flags orphan response tabs');
ok(items.some(i => /backup form clone/i.test(i.headline)), 'flags Drive form clones');
ok(items.some(i => /Decision queue header/i.test(i.headline)), 'flags the blank header column');

const healthSrc = healthCheckV20_2.toString();
ok(/estateHealthItemsV20_6_/.test(healthSrc),
   'the standing health check now includes the estate items');

// ---------------------------------------------------------------- //
section('ELITE_ESTATE is the ordered safe repair path');
// ---------------------------------------------------------------- //
const eliteSrc = ELITE_ESTATE.toString();
ok(/archiveFormCopiesV20_6_/.test(eliteSrc), 'part 1 archives form clones');
ok(/engineRepairV20_6_/.test(eliteSrc), 'part 1 repairs the engine key');
ok(/repairDecisionQueueHeaderV20_4/.test(eliteSrc), 'part 1 fixes the decision queue header');
ok(!/replayMissingSinceV20_1_/.test(eliteSrc),
   'part 1 does NOT recover submissions — that blew the 6-minute limit');
ok(/ORPHAN_TWIN_SPREADSHEET_ID/.test(eliteSrc), 'refuses to run on the twin');

const finishSrc = ELITE_ESTATE_FINISH.toString();
ok(/replayMissingSinceV20_1_/.test(finishSrc), 'part 2 recovers lost submissions with blank cutoff');
ok(/rebuildSkillMatrixV19_/.test(finishSrc), 'part 2 rebuilds the matrix');
ok(/freshStartReport/.test(finishSrc), 'part 2 reports orphan tabs without deleting them on live');
ok(/healthCheckV20_2/.test(finishSrc), 'part 2 ends on the health check');
ok(/title contains "Copy of SCEMS"/.test(formCopyInventoryV20_6_.toString()),
   'Drive search is narrowed so it cannot scan every form in the account');
ok(/neutralizeBackupFormClonesV20_6_/.test(fs.readFileSync('/home/user/SCEMS-FTO/tracker/70_admin_health.gs', 'utf8')) ||
   /neutralizeBackupFormClonesV20_6_/.test(backupSrc),
   'backup path stays hooked');

// ---------------------------------------------------------------- //
section('Portal staging reuses one sandbox');
// ---------------------------------------------------------------- //
const stagingSrc = fs.readFileSync('/home/user/SCEMS-FTO/portal/90_Staging.gs', 'utf8');
ok(/STAGING REUSED/.test(stagingSrc), 'reuses an existing sandbox instead of minting another');
ok(/setUpStaging\("NEW"\)/.test(stagingSrc) || /forceNew/.test(stagingSrc),
   'creating another book requires an explicit NEW');
ok(/PORTAL_STAGING_ARCHIVE_FOLDER|SCEMS Portal Staging — ARCHIVE/.test(stagingSrc),
   'old sandboxes are archived, not deleted');
ok(/Sheet1/.test(stagingSrc), 'drops Google\'s default Sheet1 from a new sandbox');

const portalCfg = fs.readFileSync('/home/user/SCEMS-FTO/portal/00_Config.gs', 'utf8');
ok(/portal-1\.4\.0/.test(portalCfg), 'portal version bumped for the estate fix');

// ---------------------------------------------------------------- //
section('Version stamp');
// ---------------------------------------------------------------- //
ok(SCEMS_VERSION === 'v20.7.0', 'tracker version is v20.7.0');
ok(typeof CANONICAL_LIVE_SPREADSHEET_ID === 'string' &&
   CANONICAL_LIVE_SPREADSHEET_ID.indexOf('1YL-9Er') === 0,
   'canonical live spreadsheet id is documented in code');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
