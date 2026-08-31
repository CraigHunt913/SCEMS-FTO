/**
 * Who is asking, and what may they see.
 *
 * Every rule here is enforced on the SERVER. The browser is never trusted to
 * say who it is, and never receives a record it is not entitled to. Filtering
 * happens before the payload is built, not after it reaches the page.
 */

/** The signed-in account, or '' when Google will not say. */
function whoIsAskingV1_() {
  var e = activeUserV1_();
  // Only for something run from the Run dropdown, where the effective user IS
  // the person running it. NEVER for a web request - see whoIsVisitingV1_.
  if (!e) {
    try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (err) {}
  }
  return e;
}

function activeUserV1_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (err) { return ''; }
}

/** Who is looking at the web page. The ONLY identity a web request may use.
 *
 *  There is no fallback here, and that is the whole point. A web app deployed
 *  "Execute as: Me" runs every visitor's request under the owner's account,
 *  so Session.getEffectiveUser() is the OWNER no matter who is looking. Google
 *  also declines to name a visitor from outside the owner's Workspace domain,
 *  and returns '' from getActiveUser() - which is most of this roster, since
 *  most of them sign in with a personal address.
 *
 *  Put those two facts together with a fallback and every trainee who opened
 *  the link would be resolved as the Training Division and handed everybody's
 *  records. It would not look like a failure. It would look like the portal
 *  working.
 *
 *  So: the active user or nobody. An empty answer grants nothing, and the
 *  page says plainly what to change. */
function whoIsVisitingV1_() {
  return activeUserV1_();
}

/** Why Google might not be naming a visitor, in the words of the fix. */
function notNamedV1_() {
  return 'Google is not telling this portal which account you are signed in ' +
    'with, so it cannot show you anything.\n\n' +
    'Two things cause this:\n' +
    '  You are signed into more than one Google account in this browser. ' +
    'Open the link in a private window and sign in with the one address the ' +
    'roster has for you.\n' +
    '  Or the web app is deployed with "Who has access: Anyone", which lets ' +
    'people in without naming them. It has to be "Anyone with a Google ' +
    'Account" or narrower.';
}

function normNameV1_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Resolves an email to a role and, for a trainee, to their own record only.
 *
 *  Returns { email, role, name, traineeName, shift, ok, why }.
 *  A person who is both an FTO and a trainee resolves to the HIGHER duty, so
 *  an FTO never loses their queue by also being enrolled. */
function resolveViewerV1_(email) {
  var e = String(email || '').trim().toLowerCase();
  var out = { email: e, role: PORTAL.ROLE.NONE, name: '', traineeName: '',
              shift: '', ok: false, why: '' };
  if (!e) { out.why = notNamedV1_(); return out; }

  var cfg = portalPeopleV1_();

  if (cfg.division.indexOf(e) >= 0) {
    out.role = PORTAL.ROLE.DIVISION; out.name = cfg.names[e] || e; out.ok = true; return out;
  }
  if (cfg.medical.indexOf(e) >= 0) {
    out.role = PORTAL.ROLE.MEDICAL; out.name = cfg.names[e] || e; out.ok = true; return out;
  }
  if (cfg.supervisors[e]) {
    out.role = PORTAL.ROLE.SUPERVISOR; out.name = cfg.names[e] || e;
    out.shift = cfg.supervisors[e]; out.ok = true; return out;
  }
  if (cfg.ftos[e]) {
    out.role = PORTAL.ROLE.FTO; out.name = cfg.ftos[e]; out.ok = true; return out;
  }
  if (cfg.trainees[e]) {
    out.role = PORTAL.ROLE.TRAINEE; out.name = cfg.trainees[e];
    out.traineeName = cfg.trainees[e]; out.ok = true; return out;
  }
  out.why = e + ' is not on the roster, the trainee master, or the leadership list.';
  return out;
}

/** People the portal knows, read from the target book. Cached per execution. */
/** The first of these headers this tab actually has, or ''.
 *
 *  The live roster names its column FTO NAME. The code looked for FTO, found
 *  no such column, read undefined, and every FTO on it resolved to nobody -
 *  silently, because an empty name simply skips the row. A header this layer
 *  depends on is worth naming several ways rather than one. */
/** The index of the first of these headers this tab actually has, or -1.
 *
 *  Deliberately different from pickV1_. This resolves the COLUMN once, from
 *  the header row, and every row is then read from that column - including
 *  the rows where it happens to be blank. pickV1_ falls through to the next
 *  alias when a CELL is empty, which is right for a name that could be in
 *  either of two columns and dangerous for a column that is legitimately
 *  blank sometimes: an empty TRAINEE would quietly be answered with whatever
 *  sits in ROLE, and nothing would look wrong.
 *
 *  -1 means the tab does not have that column at all. That is a defect to
 *  report on screen, never a reason to read a neighbouring one. */
function headerIndexV1_(t, headers) {
  for (var i = 0; i < headers.length; i++) {
    var ci = t.col[headers[i]];
    if (ci !== undefined) return ci;
  }
  return -1;
}

/** One cell from a resolved column index, trimmed. '' when there is no column. */
function atV1_(row, ci) {
  return ci < 0 ? '' : String(row[ci] == null ? '' : row[ci]).trim();
}

/** Is there anything at all in this row? */
function rowHasAnythingV1_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] == null ? '' : row[i]).trim() !== '') return true;
  }
  return false;
}

function pickV1_(t, row, headers) {
  for (var i = 0; i < headers.length; i++) {
    var ci = t.col[String(headers[i] || '').toUpperCase()];
    if (ci === undefined) ci = t.col[headers[i]];
    if (ci !== undefined && row[ci] !== undefined && row[ci] !== null && row[ci] !== '') {
      return row[ci];
    }
  }
  return '';
}

/**
 * Tracker presentation renames canonical headers to plain English on the live
 * master (TRAINEE EMAIL → "Email address", etc.). Portal code still speaks
 * canonical names — map the pretty labels back so reads and writes hit the
 * same cells.
 */
var HEADER_ALIASES_BY_TAB_V1 = {};
HEADER_ALIASES_BY_TAB_V1['01 TRAINEE MASTER'] = {
  'EMAIL ADDRESS': 'TRAINEE EMAIL',
  'PROGRAM STATUS': 'SET STATUS',
  'TRAINING OFFICER': 'ASSIGNED FTO',
  'STARTED': 'START DATE',
  'PHASE STARTED': 'PHASE START DATE',
  'HOW THEY CAME IN': 'ENTRY PROFILE',
  'CLEARED DATE': 'CLEARANCE DATE',
  'NOT-RESPONDING-TO-TRAINING DATE': 'NRT DATE'
};
/** 20 SKILL VALIDATION QUEUE — renameHeadersV20_4 plain English. */
HEADER_ALIASES_BY_TAB_V1['20 SKILL VALIDATION QUEUE'] = {
  'REASON FOR THE DECISION': 'RATIONALE',
  'EVIDENCE SO FAR': 'EVIDENCE SUMMARY',
  'READY SINCE': 'READY DATE',
  'LAST EVIDENCE': 'LAST EVIDENCE DATE'
};
/** 21 SKILL SIGN-OFF LOG. */
HEADER_ALIASES_BY_TAB_V1['21 SKILL SIGN-OFF LOG'] = {
  'REASON GIVEN': 'RATIONALE',
  'STANDARD USED': 'STANDARD / CATALOG VERSION'
};
/** 05 SKILLS PROGRESS. */
HEADER_ALIASES_BY_TAB_V1['05 SKILLS PROGRESS'] = {
  'WHERE THIS SKILL STANDS': 'READINESS',
  'SIGNED OFF?': 'SIGN-OFF',
  'SUCCESSFUL': 'SUCCESSFUL REPS',
  'INDEPENDENT': 'INDEPENDENT REPS',
  'SEPARATE DAYS': 'DISTINCT DATES',
  'DIFFERENT FTOS': 'DISTINCT FTOS',
  'NOTE': 'DECISION / EVIDENCE NOTE',
  'LAST LOGGED': 'LAST DATE',
  'HOW IT WENT': 'LAST OUTCOME',
  'WHERE IT HAPPENED': 'LAST CONTEXT'
};
/** 19 SKILL EVIDENCE LOG. */
HEADER_ALIASES_BY_TAB_V1['19 SKILL EVIDENCE LOG'] = {
  'ACCEPTED?': 'VALIDATION RESULT',
  'WHAT THE FTO WROTE': 'EVIDENCE NOTE',
  'CALL NUMBER': 'CALL / SCENARIO REF',
  'PROMPTING NEEDED': 'PROMPTING',
  'LEVEL THEN': 'LEVEL AT EVENT'
};

function applyHeaderAliasesV1_(tabName, col) {
  var plan = HEADER_ALIASES_BY_TAB_V1[tabName];
  if (!plan || !col) return col;
  Object.keys(plan).forEach(function (pretty) {
    if (col[pretty] === undefined) return;
    var canon = plan[pretty];
    if (col[canon] === undefined) col[canon] = col[pretty];
  });
  return col;
}

/* ---------------------------------------------------------------- *
 *  The roster, read one way.
 *
 *  Five different places used to reach into the roster and spell out the
 *  header aliases themselves, and every one of them ignored the ACTIVE
 *  column. That is how somebody who has left keeps a working sign-in and
 *  keeps being counted among the people who cannot sign in: not because
 *  anything decided they should, but because nothing ever read the column
 *  that says otherwise.
 * ---------------------------------------------------------------- */

var ROSTER_NAME_HEADERS_V1   = ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'];
var ROSTER_EMAIL_HEADERS_V1  = ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'];
var ROSTER_ACTIVE_HEADERS_V1 = ['ACTIVE', 'CURRENT', 'ON ROSTER'];

/** Is this roster row a person who still works here?
 *
 *  Blank means yes. It has to: the column is optional, and a roster that
 *  never filled it in must not go dark. Only a value that actually says no
 *  counts as no, and an unrecognised value is left alone rather than
 *  guessed at - the cost of reading "Part-time" as "left" is twenty-odd
 *  people locked out of their own portal with nothing on screen to say why,
 *  and that is far worse than the thing it would be protecting against. */
function rosterActiveV1_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return true;
  return !/^(n|no|non|not|nope|false|0|x|inactive|retired|resigned|resignation|terminated|term|left|former|removed|separated|quit|gone|deceased)\b/.test(s);
}

/** Everybody on the roster, with the ACTIVE column already read.
 *
 *  Pass true to include rows from the other spreadsheets as well; those come
 *  back with row -1, because a row that is not in this book cannot be
 *  written to and every write checks. */
function rosterPeopleV1_(includeOtherBooks) {
  var t = includeOtherBooks ? readTabAllV1_(PORTAL.TAB.ROSTER)
                            : readTabV1_(PORTAL.TAB.ROSTER);
  var out = [];
  if (!t.ok) return out;
  var dedup = !!includeOtherBooks;
  t.rows.forEach(function (r, i) {
    var nm = String(pickV1_(t, r, ROSTER_NAME_HEADERS_V1)).trim();
    if (!nm) return;
    var raw = String(pickV1_(t, r, ROSTER_ACTIVE_HEADERS_V1) || '').trim();
    out.push({
      name: nm,
      norm: normNameV1_(nm),
      email: String(pickV1_(t, r, ROSTER_EMAIL_HEADERS_V1)).trim().toLowerCase(),
      active: rosterActiveV1_(raw),
      activeRaw: raw,
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i)
    });
  });
  return dedup ? rosterOneEachV1_(out) : out;
}

/** Just the ones who still work here. */
function rosterActivePeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return p.active; });
}

/** Same rule as the trainee master: one person, one row, and THIS book wins.
 *  A stale copy still calling somebody by a name they no longer use must not
 *  put that name back into circulation. */
function rosterOneEachV1_(list) {
  var here = {}, out = [];
  list.forEach(function (p) { if (!p.from) here[p.norm] = true; });
  list.forEach(function (p) {
    if (p.from && here[p.norm]) return;
    out.push(p);
  });
  return out;
}

/** The ones who have been retired off it. */
function rosterRetiredPeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return !p.active; });
}

/** Does this look like a person's name, or like something that fell into the
 *  cell by accident?
 *
 *  Latavia Cole's ASSIGNED FTO ended up holding the sentence "Now on the tab
 *  called 22 FTO ROSTER. Add or retire an FTO there, then run Refresh form
 *  dropdowns." - the dropdown's own help text, pasted in. Nothing noticed,
 *  because to every name-matching lookup in this system that is simply an
 *  officer nobody has heard of, which is indistinguishable from a typo.
 *
 *  A person's name is short and has few words. Anything else is not one. */
function looksLikeANameV1_(s) {
  var v = String(s == null ? '' : s).trim();
  if (!v) return false;
  if (v.length > 48) return false;
  if (v.split(/\s+/).length > 5) return false;
  if (/[.!?]\s+[A-Z]/.test(v)) return false;      // more than one sentence
  return true;
}

/** Rebuilds the ASSIGNED FTO dropdown from the roster and says so.
 *
 *  Called after every roster change here, because that dropdown is a fixed
 *  list that does not follow the roster, and a stale one refuses names that
 *  are now perfectly correct. Keeping it in step is the difference between
 *  this working and another "violates the data validation rules". */
function rebuiltNoteV1_(L) {
  var r;
  try { r = rebuildFtoDropdownV1_(); } catch (e) { return L; }
  if (r && r.ok) {
    L.push('The ASSIGNED FTO dropdown on ' + PORTAL.TAB.MASTER + ' was rebuilt from');
    L.push('the roster to match: ' + r.names.length + ' name(s). It is a fixed list');
    L.push('that does not follow the roster on its own, and a stale one refuses');
    L.push('names that are perfectly correct.');
    L.push('');
  }
  return L;
}

/** What has to happen in the TRACKER's own script after the roster changes.
 *
 *  The tracker rebuilds the nine forms' "FTO name" dropdowns from the active
 *  roster, and it only does that when refreshDropdowns() is run. This portal
 *  is a separate Apps Script project and cannot call it. So every tool here
 *  that changes a name, or who is active, has to say so - otherwise the forms
 *  keep offering somebody who has left, or fail to offer somebody who just
 *  joined, and nothing anywhere says why. */
function refreshDropdownsNoteV1_(L) {
  L.push('NOW DO THIS IN THE TRACKER\'S OWN SCRIPT');
  L.push('  Run  refreshDropdowns');
  L.push('  It rebuilds the "FTO name" list on all nine forms from the active');
  L.push('  roster. Until it runs, the forms still offer the old roster: a name');
  L.push('  that changed, somebody who has left, and not somebody who just');
  L.push('  joined. This portal is a separate script and cannot run it for you.');
  return L;
}

/** Is this name on the roster as somebody who has left? */
function rosterHasRetiredV1_(name) {
  var n = normNameV1_(name);
  return rosterRetiredPeopleV1_(true).some(function (p) { return p.norm === n; });
}

var PEOPLE_CACHE_V1 = null;
function portalPeopleV1_() {
  if (PEOPLE_CACHE_V1) return PEOPLE_CACHE_V1;
  var out = { division: [], medical: [], supervisors: {}, ftos: {}, trainees: {}, names: {} };

  var props = PropertiesService.getScriptProperties();
  function list(key) {
    return String(props.getProperty(key) || '').toLowerCase()
      .split(/[,;\s]+/).filter(function (x) { return x.indexOf('@') > 0; });
  }
  out.division = list('PORTAL_DIVISION_EMAILS');
  out.medical  = list('PORTAL_MEDICAL_EMAILS');

  var sup = {};
  try { sup = JSON.parse(props.getProperty('PORTAL_SUPERVISORS') || '{}'); } catch (e) {}
  Object.keys(sup).forEach(function (k) { out.supervisors[String(k).toLowerCase()] = sup[k]; });

  // Somebody who has left the service does not keep the training officer
  // screen. Their name is still on the roster and their history is still
  // theirs, but the ACTIVE column saying no is the whole point of the
  // column, and personnel-development records are not something a former
  // employee should still be able to open.
  rosterPeopleV1_(true).forEach(function (p) {
    if (!p.email || !p.name) return;
    out.names[p.email] = p.name;
    if (p.active) out.ftos[p.email] = p.name;
  });
  var m = readTabAllV1_(PORTAL.TAB.MASTER);
  if (m.ok) {
    m.rows.forEach(function (r) {
      var em = String(pickV1_(m, r, [
        'TRAINEE EMAIL', 'EMAIL ADDRESS', 'EMAIL', 'PERSONAL EMAIL', 'WORK EMAIL'
      ])).trim().toLowerCase();
      var nm = String(pickV1_(m, r, ['TRAINEE', 'TRAINEE NAME', 'NAME'])).trim();
      if (em && nm) { out.trainees[em] = nm; out.names[em] = nm; }
    });
  }
  PEOPLE_CACHE_V1 = out;
  return out;
}

/** Header-mapped read of one tab in the target book.
 *
 *  Cached for the life of one execution. A record screen asks six tabs for one
 *  person and the Division screen asks the same six for everyone on the
 *  roster; without this that is six reads per person instead of six in total,
 *  and a twenty-person roster would spend the whole page load on it.
 *
 *  The cache is dropped after any write, so nothing reads a value it has just
 *  changed. */
var TAB_CACHE_V1 = {};
function forgetTabsV1_() { TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }

function readTabV1_(tabName) {
  if (Object.prototype.hasOwnProperty.call(TAB_CACHE_V1, tabName)) return TAB_CACHE_V1[tabName];
  var out = readTabUncachedV1_(tabName);
  TAB_CACHE_V1[tabName] = out;
  return out;
}

/** The same tab, across THIS spreadsheet and every other one listed.
 *
 *  This is what every screen reads. Rows from the target come first and carry
 *  their real row numbers. Rows from another book are mapped into this book's
 *  column order, deduplicated against everything already seen, and carry
 *  row -1 and the name of the book they came from.
 *
 *  Row -1 is not decoration. A row that is not in this spreadsheet has no row
 *  in this spreadsheet, and every write checks for that before it touches a
 *  cell. Writing to a row number that came from somewhere else is exactly the
 *  kind of mistake that corrupts a record silently.
 *
 *  Nothing here writes to anything. The other books are opened read only. */
var ALL_CACHE_V1 = {};

function readTabAllV1_(tabName) {
  if (Object.prototype.hasOwnProperty.call(ALL_CACHE_V1, tabName)) return ALL_CACHE_V1[tabName];

  var here = readTabV1_(tabName);
  var others = [];
  try { others = otherBookIdsV1_(); } catch (e) { others = []; }
  if (!here.ok || !others.length) { ALL_CACHE_V1[tabName] = here; return here; }

  var idCol = '', noteCol = '';
  try { idCol = responseIdColumnV1_(here); noteCol = notesColumnV1_(here); } catch (e) {}

  var seen = {}, rows = [], froms = [];
  here.rows.forEach(function (r) {
    rows.push(r);
    froms.push('');
    var byHeader = {};
    here.headers.forEach(function (h, ci) { if (h) byHeader[h] = r[ci]; });
    try { seen[sharedFingerprintV1_(here.headers, idCol, noteCol, byHeader)] = true; } catch (e) {}
    if (idCol) {
      var v = String(r[here.col[idCol.toUpperCase()]] || '').trim();
      if (v) seen[v] = true;
    }
  });

  others.forEach(function (bookId) {
    var name = bookId;
    try { name = SpreadsheetApp.openById(bookId).getName(); } catch (e) {}
    var src;
    try { src = readTabInV1_(bookId, tabName); } catch (e) { return; }
    if (!src || !src.ok) return;
    var srcIdCol = '';
    try { srcIdCol = responseIdColumnV1_(src); } catch (e) {}

    src.rows.forEach(function (r) {
      var empty = r.every(function (v) { return v === '' || v === null || v === undefined; });
      if (empty) return;

      var byHeader = {};
      src.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = r[ci];
        if (v === '' || v === null || v === undefined) return;
        var target;
        try { target = matchHeaderV1_(h, here.headers); } catch (e) { target = ''; }
        if (!target) return;
        if (target === noteCol && byHeader[noteCol]) byHeader[noteCol] += '\n' + v;
        else byHeader[target] = v;
      });

      var own = (srcIdCol && src.col[srcIdCol.toUpperCase()] !== undefined)
        ? String(r[src.col[srcIdCol.toUpperCase()]] || '').trim() : '';
      var fp = '';
      try { fp = sharedFingerprintV1_(here.headers, idCol, noteCol, byHeader); } catch (e) {}
      if ((own && seen[own]) || (fp && seen[fp])) return;
      if (own) seen[own] = true;
      if (fp) seen[fp] = true;

      rows.push(here.headers.map(function (h) {
        return (h && byHeader[h] !== undefined) ? byHeader[h] : '';
      }));
      froms.push(name);
    });
  });

  var out = { ok: true, sheet: here.sheet, headers: here.headers, col: here.col,
              rows: rows, firstDataRow: here.firstDataRow, froms: froms,
              combined: true };
  ALL_CACHE_V1[tabName] = out;
  return out;
}

/** The row number in THIS spreadsheet, or -1 for a row that came from another
 *  one. Every write asks this before it touches a cell. */
function realRowV1_(t, index) {
  if (!t || !t.ok) return -1;
  if (t.froms && t.froms[index]) return -1;
  return t.firstDataRow + index;
}

/** Which book a row came from. '' means this one. */
function rowSourceV1_(t, index) {
  return (t && t.froms && t.froms[index]) ? t.froms[index] : '';
}

function readTabUncachedV1_(tabName) {
  var sh;
  try { sh = targetBookV1_().getSheetByName(tabName); } catch (e) { sh = null; }
  if (!sh) return { ok: false, sheet: null, headers: [], col: {}, rows: [], firstDataRow: 0 };
  var hr = PORTAL.HEADER_ROW;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(hr, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h == null ? '' : h).trim(); });
  var col = {};
  headers.forEach(function (h, i) {
    if (!h) return;
    col[h.toUpperCase()] = i;
    col[h.toUpperCase().replace(/\s+/g, ' ')] = i;
  });
  applyHeaderAliasesV1_(tabName, col);
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues() : [];
  return { ok: true, sheet: sh, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}
