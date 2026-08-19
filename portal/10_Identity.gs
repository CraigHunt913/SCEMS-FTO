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

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (t.ok) {
    t.rows.forEach(function (r) {
      var em = String(r[t.col['EMAIL']] || '').trim().toLowerCase();
      var nm = String(r[t.col['FTO']] || r[t.col['NAME']] || '').trim();
      if (em && nm) { out.ftos[em] = nm; out.names[em] = nm; }
    });
  }
  var m = readTabV1_(PORTAL.TAB.MASTER);
  if (m.ok) {
    m.rows.forEach(function (r) {
      var em = String(r[m.col['TRAINEE EMAIL']] || '').trim().toLowerCase();
      var nm = String(r[m.col['TRAINEE']] || '').trim();
      if (em && nm) { out.trainees[em] = nm; out.names[em] = nm; }
    });
  }
  PEOPLE_CACHE_V1 = out;
  return out;
}

/** Header-mapped read of one tab in the target book. */
function readTabV1_(tabName) {
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
