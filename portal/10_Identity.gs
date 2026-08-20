/**
 * Who is asking, and what may they see.
 *
 * Every rule here is enforced on the SERVER. The browser is never trusted to
 * say who it is, and never receives a record it is not entitled to. Filtering
 * happens before the payload is built, not after it reaches the page.
 */

/** The signed-in account, or '' when Google will not say. */
function whoIsAskingV1_() {
  var e = '';
  try { e = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (err) {}
  if (!e) {
    try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (err) {}
  }
  return e;
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
  if (!e) { out.why = 'Google did not say which account is signed in.'; return out; }

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
function pickV1_(t, row, headers) {
  for (var i = 0; i < headers.length; i++) {
    var ci = t.col[headers[i]];
    if (ci !== undefined && row[ci] !== undefined && row[ci] !== null && row[ci] !== '') {
      return row[ci];
    }
  }
  return '';
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
  return out;
}

/** Just the ones who still work here. */
function rosterActivePeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return p.active; });
}

/** The ones who have been retired off it. */
function rosterRetiredPeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return !p.active; });
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
      var em = String(pickV1_(m, r, ['TRAINEE EMAIL', 'EMAIL', 'PERSONAL EMAIL'])).trim().toLowerCase();
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
  headers.forEach(function (h, i) { if (h) col[h.toUpperCase()] = i; });
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues() : [];
  return { ok: true, sheet: sh, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}
