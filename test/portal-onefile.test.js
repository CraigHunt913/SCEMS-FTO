// SCEMS Portal — the single file you actually paste.
//
// Eleven files was the friction. One file is the fix, and a built file that
// has quietly drifted from its sources is worse than no built file at all.
//
// These tests require: that it is in sync with portal/ right now, that it
// runs on its own with nothing else loaded, that the page inside it is byte
// for byte the page in Index.html, and that doGet renders from the embedded
// copy without ever asking for an HTML file that is not there.
//
//   node test/portal-onefile.test.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

const ROOT = '/home/user/SCEMS-FTO';
const ONE = path.join(ROOT, 'portal', 'SCEMS_PORTAL_ONE_FILE.gs');

// ---------------------------------------------------------------- //
section('It is in sync with the files it was built from');
// ---------------------------------------------------------------- //
let checkOk = true, checkErr = '';
try { execFileSync('node', [path.join(ROOT, 'tools', 'build-one-file.js'), '--check'], { cwd: ROOT }); }
catch (e) { checkOk = false; checkErr = String(e.stderr || e.message); }
ok(checkOk, 'rebuilding produces exactly the checked-in file' + (checkOk ? '' : ' — ' + checkErr));

const one = fs.readFileSync(ONE, 'utf8');
ok(/BUILT FILE\. Do not edit this/.test(one), 'and it says on its face not to edit it by hand');

// A build fingerprint, so "which version is actually in my editor" has an
// answer. Deterministic: it is a hash of the sources, not a timestamp, so an
// unchanged tree rebuilds to an identical file.
const stamp = (one.match(/^ \* Build ([0-9a-f]{8})$/m) || [])[1];
ok(!!stamp, 'the file names its build at the top');
ok(one.indexOf("var PORTAL_BUILD = '" + stamp + "';") >= 0,
   'and carries the same build as a value you can read back out');

// ---------------------------------------------------------------- //
section('Nothing was left behind');
// ---------------------------------------------------------------- //
const SOURCES = ['00_Config', '01_Start', '10_Identity', '20_Data', '30_WebApp', '40_Forms',
                 '50_Production', '60_History', '70_Backfill', '80_Import', '85_Merge', '87_Settle', '90_Staging','91_Record','92_Lifecycle','93_Acknowledge','94_Assign', '95_Unprocessed', '96_Roster', '97_Rename','98_Retire','99_AddFto','99_AddTrainee'];

let missing = [];
SOURCES.forEach(name => {
  const src = fs.readFileSync(path.join(ROOT, 'portal', name + '.gs'), 'utf8');
  (src.match(/^function ([A-Za-z0-9_]+)/gm) || []).forEach(decl => {
    const fn = decl.replace('function ', '');
    if (one.indexOf('function ' + fn) < 0) missing.push(name + ':' + fn);
  });
});
ok(missing.length === 0, 'every function from all ten script files is present' +
   (missing.length ? ' — missing ' + missing.join(', ') : ''));

// the ones a person actually types into the Run dropdown
['START', 'WHERE_AM_I', 'CHECK_EVERYTHING', 'FIX_THE_ROSTER', 'UNDO_THE_ROSTER',
 'WHAT_IS_WAITING', 'FIX_A_NAME', 'UNDO_A_NAME', 'applyRename', 'undoRename',
 'setUpStaging', 'viewAsTrainee', 'viewAsFTO', 'viewAsDivision', 'viewAsSupervisor',
 'viewAsMedical', 'portalStatusV1', 'pointAtProductionReadOnly', 'pointAtStaging',
 'productionReadinessCheck', 'warmFormCache', 'clearFormCache', 'enableFormLinks',
 'disableFormLinks', 'backfillPreview', 'backfillIntoStaging', 'backfillBeforeAndAfter',
 'runBackfillForReal', 'undoLastBackfill', 'lockBackfill', 'duplicateSubmissionsReport',
 'whatElseIsOutThere', 'mergeBeforeAndAfter', 'runMergeForReal', 'showSettings', 'unprocessedResponses', 'suggestFtoEmails',
 'rosterEmailsBeforeAndAfter', 'applyRosterEmails', 'undoRosterEmails',
 'doGet'].forEach(fn => {
  ok(one.indexOf('function ' + fn + '(') >= 0, 'the Run dropdown will show ' + fn);
});

// ---------------------------------------------------------------- //
section('The page inside it is the page');
// ---------------------------------------------------------------- //
const html = fs.readFileSync(path.join(ROOT, 'portal', 'Index.html'), 'utf8');
const m = one.match(/var PORTAL_PAGE_HTML = \[([\s\S]*?)\]\.join\(''\);/);
ok(!!m, 'the page is embedded as a joined array of chunks');
let embedded = null;
if (m) {
  try { embedded = JSON.parse('[' + m[1] + ']').join(''); } catch (e) { embedded = null; }
}
ok(embedded !== null, 'and every one of those chunks is a valid string literal');
ok(embedded === html, 'the embedded page is byte for byte portal/Index.html');
ok(/var BOOT = <\?!= boot \?>;/.test(embedded || ''),
   'including the templating scriptlet, unescaped, which is what it must stay');

// ---------------------------------------------------------------- //
section('Nothing in it is a long line');
// ---------------------------------------------------------------- //
// A 49,000-character line is what broke this the first time. A code editor
// mangles one on paste and a file viewer refuses to render it, and either way
// you get a syntax error nowhere near the real cause. So: a hard ceiling.
const longest = one.split('\n').reduce((w, l) => Math.max(w, l.length), 0);
ok(longest <= 300, 'the longest line in the whole file is ' + longest + ' characters');
ok(one.split('\n').filter(l => l.length > 200).length < 10,
   'and barely any come close to that');

const pageLines = fs.readFileSync(path.join(ROOT, 'portal', 'Index.html'), 'utf8').split('\n');
ok(pageLines.reduce((w, l) => Math.max(w, l.length), 0) <= 5000,
   'the page it is built from has no enormous line either');

// ---------------------------------------------------------------- //
section('It runs on its own, with nothing else loaded');
// ---------------------------------------------------------------- //
let PROPS = {}, SHEETS = {}, ACTIVE = '', EFFECTIVE = '';
let fromFile = 0, fromString = 0, lastTemplate = '';

function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g.reduce((w, r) => Math.max(w, (r || []).length), 1); };
FakeSheet.prototype.appendRow = function (r) { this.g.push(r.slice()); return this; };
FakeSheet.prototype.setFrozenRows = function () { return this; };
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
  ['setFontWeight','setFontColor','setBackground','setWrap','setNumberFormat'].forEach(k => api[k] = () => api);
  return api;
};
const BOOK = { getSheetByName: n => SHEETS[n] || null, getId: () => 'STG-BOOK',
               getName: () => 'STG_Sandbox', getUrl: () => 'https://example/stg',
               getSheets: () => Object.keys(SHEETS).map(n => SHEETS[n]),
               insertSheet: n => (SHEETS[n] = new FakeSheet(n, [])) };

global.SpreadsheetApp = { openById: () => BOOK, create: () => BOOK,
  getUi: () => { throw new Error('no ui'); } };
global.Session = { getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE }),
  getScriptTimeZone: () => 'America/New_York' };
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
  setProperty: (k, v) => { PROPS[k] = v; }, deleteProperty: k => { delete PROPS[k]; } }) };
global.Utilities = { formatDate: () => '2026-08-19 0200' };
global.Logger = { log: () => {} };
global.FormApp = { openById: () => { throw new Error('Forms scope not granted'); } };

function fakeTemplate(src) {
  lastTemplate = src;
  return { evaluate: () => ({
    setTitle: function () { return this; },
    addMetaTag: function () { return this; },
    setXFrameOptionsMode: function (mode) {
      if (mode === null || mode === undefined) throw new Error('Argument cannot be null: mode');
      return this; } }) };
}
global.HtmlService = {
  // The real platform throws here when there is no such file in the project.
  createTemplateFromFile: name => { fromFile++; throw new Error('No HTML file named ' + name); },
  createTemplate: src => { fromString++; return fakeTemplate(src); },
  XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
};

// ONLY the built file. If it is not self-contained this throws.
let loaded = true, loadErr = '';
try { eval(one); } catch (e) { loaded = false; loadErr = String(e.message || e); }
ok(loaded, 'the built file evaluates on its own' + (loaded ? '' : ' — ' + loadErr));

if (loaded) {
  const HR = PORTAL.HEADER_ROW;
  function tab(name, headers, rows) {
    const g = [];
    for (let i = 0; i < HR - 1; i++) g.push([]);
    g.push(headers.slice());
    rows.forEach(r => g.push(r));
    SHEETS[name] = new FakeSheet(name, g);
  }
  PROPS[PORTAL.PROPERTY_TARGET] = 'STG-BOOK';
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;
  PROPS['PORTAL_DIVISION_EMAILS'] = 'chief@example.org';
  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','LEVEL','ASSIGNED FTO','START DATE','CURRENT PHASE','SET STATUS','TRAINEE EMAIL'],
    [['Jamie Rivers','Paramedic','Dana Whitlock',new Date('2026-06-01'),'Phase 2','Active','jamie@example.org']]);
  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL'], [['Dana Whitlock','dana@example.org']]);
  tab(PORTAL.TAB.QUEUE, ['READY DATE','TRAINEE','SKILL','RECORD STATUS'], []);
  ACTIVE = EFFECTIVE = 'chief@example.org';

  fromFile = 0; fromString = 0;
  let served = true, servedErr = '';
  try { doGet({}); } catch (e) { served = false; servedErr = String(e.message || e); }
  ok(served, 'doGet serves a page' + (served ? '' : ' — ' + servedErr));
  ok(fromString === 1, 'built from the embedded page');
  ok(fromFile === 0, 'and it never asked for an HTML file that is not in the project');
  ok(lastTemplate === html, 'the template it rendered is the real page');

  // and the other way round: with no constant, it wants the HTML file
  fromFile = 0; fromString = 0;
  const keep = PORTAL_PAGE_HTML;
  PORTAL_PAGE_HTML = '';
  try { doGet({}); } catch (e) { /* the stub throws, which is the point */ }
  ok(fromFile === 1 && fromString === 0,
     'pasted as separate files instead, it asks for the Index HTML file');
  PORTAL_PAGE_HTML = keep;

  // the safety properties survive the build
  ok(mayWriteV1_() === true, 'staging still allows writes');
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  ok(mayWriteV1_() === false, 'production still refuses them');
  let refused = '';
  try { switchRoleForTestingV1('DIVISION'); } catch (e) { refused = String(e.message || e); }
  ok(/practice spreadsheet/i.test(refused), 'and the role switcher still refuses there');
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_LIVE;
  ok(mayWriteV1_() === true, 'LIVE allows the portal its everyday actions');
  ok(isPracticeV1_() === false, 'while still knowing the data is real');
  refused = '';
  try { switchRoleForTestingV1('DIVISION'); } catch (e) { refused = String(e.message || e); }
  ok(/practice spreadsheet/i.test(refused), 'and the role switcher refuses in LIVE as well');
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_PRODUCTION;
  PROPS[PORTAL.PROPERTY_MODE] = PORTAL.MODE_STAGING;

  ok(typeof PORTAL_FORMS !== 'undefined' && PORTAL_FORMS.length === 9,
     'all nine forms are registered in the built file');
  ok(PORTAL_FORMS.filter(f => f.key === 'SKILLS_COMBINED')[0].roles.length === 0,
     'and the unbound one is still offered to nobody');
}

// ---------------------------------------------------------------- //
section('Nothing private is baked into the file you paste');
// ---------------------------------------------------------------- //
ok(!/1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI/.test(one),
   'the live tracker id is not in it');
ok(/TARGET_SPREADSHEET_ID is deliberately empty|not pointed at a spreadsheet yet/.test(one),
   'it still refuses to run until it is pointed somewhere');
// Every address anywhere in portal/ or test/ must be on a reserved example
// domain. This is not tidiness. Real staff addresses got into a test fixture
// on this branch because I put the county's actual directory in it, and a
// test that only checked the built file would not have caught the fixture.
// RFC 2606 reserves these domains precisely so nobody's real address has to
// stand in for one.
const OK_DOMAINS = /@(example\.(org|com|net)|example\.invalid|test|localhost)\b/i;
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function everyFile(dir) {
  return fs.readdirSync(path.join(ROOT, dir))
    .filter(f => /\.(gs|js|html|md)$/.test(f))
    .map(f => path.join(dir, f));
}
const scanned = everyFile('portal').concat(everyFile('test'));
const offenders = [];
scanned.forEach(rel => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  (text.match(ADDRESS) || []).forEach(a => {
    // a Google Fonts or schema URL is not an address
    if (/\.(png|jpg|svg|css|js)$/i.test(a)) return;
    if (OK_DOMAINS.test(a)) return;
    offenders.push(rel + ': ' + a);
  });
});
ok(offenders.length === 0,
   'every address in portal/ and test/ is on a reserved example domain' +
   (offenders.length ? ' — found ' + offenders.slice(0, 8).join(', ') +
    (offenders.length > 8 ? ' and ' + (offenders.length - 8) + ' more' : '') : ''));
ok(scanned.length > 20, 'and that check actually looked at ' + scanned.length + ' files');

// ---------------------------------------------------------------- //
section('A short paste announces itself');
// ---------------------------------------------------------------- //
ok(/END OF FILE/.test(one), 'the file ends with a marker you can look for');
ok(one.trimEnd().endsWith('}'), 'and the marker is not the last thing, the function is');
ok(one.indexOf('function portalPasteCheck()') >= 0,
   'there is a one-click check for whether the paste arrived whole');
if (typeof portalPasteCheck === 'function') {
  ok(/complete/i.test(portalPasteCheck()), 'and on a whole file it says so');
  ok(portalPasteCheck().indexOf(stamp) >= 0, 'naming the build, so it can be compared');
  const keepPage = PORTAL_PAGE_HTML;
  PORTAL_PAGE_HTML = 'too short';
  ok(/INCOMPLETE/.test(portalPasteCheck()), 'on a truncated one it says that instead');
  ok(/paste the whole file again/.test(portalPasteCheck()), 'and says what to do about it');
  PORTAL_PAGE_HTML = keepPage;
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
