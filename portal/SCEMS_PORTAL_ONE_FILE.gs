/**
 * SCEMS FIELD TRAINING PORTAL — portal-1.3.0
 * Build 70a21349
 *
 * The whole portal in one file. Paste it into a new Apps Script project
 * and there is nothing else to add: the page is in here too, as a string
 * at the bottom.
 *
 * BUILT FILE. Do not edit this. Edit the files in portal/ and run
 *   node tools/build-one-file.js
 * A test fails if this file and those sources disagree.
 *
 * First run: setUpStaging
 * Then:      Deploy > New deployment > Web app
 */


/* ======================================================================
 * 00_Config.gs
 * ====================================================================== */

/**
 * SCEMS Field Training Portal — configuration.
 *
 * ONE source of truth. Nothing else in this project may hard-code a
 * spreadsheet id, an address, or a mode.
 *
 * SAFETY: TARGET_SPREADSHEET_ID is deliberately empty. The portal refuses to
 * run until it is set, and setUpStaging() sets it to a NEW spreadsheet it
 * creates itself. Pointing this at the live tracker is a single, deliberate,
 * logged act — never a default and never an accident.
 */

var PORTAL = Object.freeze({
  VERSION: 'portal-1.3.0',
  PROPERTY_TARGET: 'PORTAL_TARGET_SPREADSHEET_ID',
  PROPERTY_MODE: 'PORTAL_MODE',

  /** STAGING writes freely. PRODUCTION refuses every write. */
  MODE_STAGING: 'STAGING',
  MODE_PRODUCTION: 'PRODUCTION',

  TITLE: 'Sumter County EMS Field Training',

  /** Tabs this portal reads. Names match the live tracker so the same code
   *  works against either, but it only ever opens the configured target. */
  TAB: Object.freeze({
    MASTER:     '01 TRAINEE MASTER',
    EVAL:       '02 FTO SHIFT EVAL RAW',
    REFLECT:    '03 SELF-REFLECTION RAW',
    URGENT:     '04 URGENT CONCERNS RAW',
    SKILLS:     '05 SKILLS PROGRESS',
    QUEUE:      '20 SKILL VALIDATION QUEUE',
    EVIDENCE:   '19 SKILL EVIDENCE LOG',
    SIGNOFF:    '21 SKILL SIGN-OFF LOG',
    ROSTER:     '22 FTO ROSTER',
    COACHING:   'PORTAL COACHING',
    AUDIT:      'PORTAL AUDIT'
  }),

  HEADER_ROW: 4,

  ROLE: Object.freeze({
    TRAINEE:    'TRAINEE',
    FTO:        'FTO',
    DIVISION:   'TRAINING_DIVISION',
    SUPERVISOR: 'SUPERVISOR',
    MEDICAL:    'MEDICAL_DIRECTOR',
    NONE:       'NONE'
  })
});

/** The spreadsheet this portal is pointed at. Throws rather than guessing. */
function targetIdV1_() {
  var id = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_TARGET) || '').trim();
  if (!id) {
    throw new Error('This portal is not pointed at a spreadsheet yet. Run ' +
      'setUpStaging() once from the script editor; it builds a staging copy ' +
      'with invented people and points the portal at that.');
  }
  return id;
}

function targetBookV1_() { return SpreadsheetApp.openById(targetIdV1_()); }

function modeV1_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_MODE) || PORTAL.MODE_STAGING).toUpperCase();
}

/** True only in STAGING. Every write in this project checks this first. */
function mayWriteV1_() { return modeV1_() === PORTAL.MODE_STAGING; }

/** Refuses, loudly, when a write is attempted outside staging. */
function requireWritableV1_(what) {
  if (mayWriteV1_()) return;
  throw new Error('Refusing to ' + what + '. This portal is in ' + modeV1_() +
    ' mode, which is read-only. Writing to a live record from here has not ' +
    'been approved.');
}


/* ======================================================================
 * 10_Identity.gs
 * ====================================================================== */

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
function forgetTabsV1_() { TAB_CACHE_V1 = {}; }

function readTabV1_(tabName) {
  if (Object.prototype.hasOwnProperty.call(TAB_CACHE_V1, tabName)) return TAB_CACHE_V1[tabName];
  var out = readTabUncachedV1_(tabName);
  TAB_CACHE_V1[tabName] = out;
  return out;
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


/* ======================================================================
 * 20_Data.gs
 * ====================================================================== */

/**
 * The payload each role receives.
 *
 * One function per role. Each builds ONLY what that role is entitled to, so
 * a filtering mistake cannot leak another person's record into the page: the
 * data was never assembled in the first place.
 */

function daysAgoTextV1_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'never';
  var n = Math.floor((new Date() - d) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return n + ' days ago';
}
function asDateV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function levelKeyV1_(level) {
  var l = String(level || '').toLowerCase();
  if (l.indexOf('param') >= 0) return 'pmd';
  if (l.indexOf('advanc') >= 0 || l === 'aemt') return 'aemt';
  return 'emt';
}

/** Every trainee on the master, normalized. Closed people are marked, never
 *  silently dropped, so a caller must decide rather than inherit a filter. */
function traineesV1_() {
  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) return [];
  return t.rows.map(function (r, i) {
    var name = String(r[t.col['TRAINEE']] || '').trim();
    if (!name) return null;
    var status = String(r[t.col['SET STATUS']] || r[t.col['PROGRAM STATUS']] || '').trim();
    return {
      row: t.firstDataRow + i,
      name: name,
      norm: normNameV1_(name),
      level: String(r[t.col['LEVEL']] || '').trim(),
      levelKey: levelKeyV1_(r[t.col['LEVEL']]),
      phase: String(r[t.col['CURRENT PHASE']] || r[t.col['PHASE']] || '').trim(),
      fto: String(r[t.col['ASSIGNED FTO']] || r[t.col['TRAINING OFFICER']] || '').trim(),
      shift: String(r[t.col['SHIFT']] || '').trim(),
      email: String(r[t.col['TRAINEE EMAIL']] || '').trim().toLowerCase(),
      started: asDateV1_(r[t.col['START DATE']]),
      phaseStart: asDateV1_(r[t.col['PHASE START DATE']]),
      status: status,
      closed: /closed|released|withdraw|archiv/i.test(status),
      setupComplete: !!(String(r[t.col['LEVEL']] || '').trim() &&
                        String(r[t.col['CURRENT PHASE']] || '').trim() &&
                        String(r[t.col['ASSIGNED FTO']] || '').trim() &&
                        asDateV1_(r[t.col['START DATE']]))
    };
  }).filter(Boolean);
}

function skillsForV1_(norm) {
  var t = readTabV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    out.push({
      skill: String(r[t.col['SKILL']] || '').trim(),
      readiness: String(r[t.col['READINESS']] || '').trim(),
      signed: String(r[t.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF' ||
              String(r[t.col['READINESS']] || '').trim() === 'SIGNED OFF',
      successful: Number(r[t.col['SUCCESSFUL REPS']]) || 0,
      independent: Number(r[t.col['INDEPENDENT REPS']]) || 0
    });
  });
  return out;
}

function openQueueV1_() {
  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    out.push({
      row: t.firstDataRow + i,
      trainee: String(r[t.col['TRAINEE']] || '').trim(),
      norm: normNameV1_(r[t.col['TRAINEE']]),
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: String(r[t.col['SKILL ID']] || '').trim(),
      evidence: String(r[t.col['EVIDENCE SUMMARY']] || '').trim(),
      since: asDateV1_(r[t.col['READY DATE']]),
      requestId: String(r[t.col['REQUEST ID']] || '').trim()
    });
  });
  return out;
}

function lastEvalForV1_(norm) {
  var t = readTabV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return null;
  var latest = null;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[2]) !== norm) return;
    var d = asDateV1_(r[0]);
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function coachingForV1_(norm) {
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    out.push({
      row: t.firstDataRow + i,
      when: asDateV1_(r[t.col['DATE']]),
      from: String(r[t.col['FROM']] || '').trim(),
      text: String(r[t.col['NOTE']] || '').trim(),
      acknowledged: String(r[t.col['ACKNOWLEDGED']] || '').trim() === 'YES'
    });
  });
  return out;
}

/* ---------------- role payloads ---------------- */

function traineePayloadV1_(viewer) {
  var me = traineesV1_().filter(function (t) { return t.norm === normNameV1_(viewer.traineeName); })[0];
  if (!me) return { error: 'No training record found for ' + viewer.email + '.' };
  var skills = skillsForV1_(me.norm);
  var signed = skills.filter(function (s) { return s.signed; }).length;
  var waiting = openQueueV1_().filter(function (q) { return q.norm === me.norm; });
  var coaching = coachingForV1_(me.norm);
  return {
    name: me.name, level: me.level, levelKey: me.levelKey, phase: me.phase,
    fto: me.fto, phaseStart: me.phaseStart ? me.phaseStart.toDateString() : '',
    lastEval: daysAgoTextV1_(lastEvalForV1_(me.norm)),
    signed: signed, applicable: skills.length,
    percent: skills.length ? Math.round(signed / skills.length * 100) : 0,
    waiting: waiting.map(function (q) { return { skill: q.skill, since: daysAgoTextV1_(q.since) }; }),
    coaching: coaching.filter(function (c) { return !c.acknowledged; })
      .map(function (c) { return { row: c.row, from: c.from, text: c.text,
                                   when: c.when ? c.when.toDateString() : '' }; }),
    skills: skills.slice(0, 40),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.TRAINEE, { trainee: me.name });
    }),
    // How current each kind of submission is. The record itself is fetched on
    // demand, so a person with two years of history does not pay for it on
    // every page load.
    freshness: safeFormsV1_(function () { return freshnessForV1_(me.name); })
  };
}

function ftoPayloadV1_(viewer) {
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && normNameV1_(t.fto) === normNameV1_(viewer.name); });
  return {
    name: viewer.name,
    // Each trainee carries the forms for THAT trainee, with the FTO's name,
    // the trainee's name, and the skills log for their level already chosen.
    // The FTO picks a person, not a form and not a level.
    trainees: mine.map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               lastEval: daysAgoTextV1_(lastEvalForV1_(t.norm)),
               setupComplete: t.setupComplete,
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.FTO, t,
                   { fto: viewer.name, trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.FTO, { fto: viewer.name });
    })
  };
}

function divisionPayloadV1_() {
  var all = traineesV1_();
  var active = all.filter(function (t) { return !t.closed; });
  var queue = openQueueV1_();
  var incomplete = active.filter(function (t) { return !t.setupComplete; });

  var seen = {}, dupes = [];
  active.forEach(function (t) {
    if (seen[t.norm]) dupes.push(t.name); else seen[t.norm] = true;
  });

  return {
    activeCount: active.length,
    closedCount: all.length - active.length,
    queue: queue.slice(0, 25).map(function (q) {
      return { trainee: q.trainee, skill: q.skill, evidence: q.evidence,
               since: daysAgoTextV1_(q.since), requestId: q.requestId, row: q.row };
    }),
    queueCount: queue.length,
    incomplete: incomplete.map(function (t) {
      var missing = [];
      if (!t.level) missing.push('level');
      if (!t.phase) missing.push('phase');
      if (!t.fto) missing.push('training officer');
      if (!t.started) missing.push('start date');
      return { name: t.name, missing: missing.join(', ') };
    }),
    duplicates: dupes,
    releaseReady: active.filter(function (t) { return /phase\s*4/i.test(t.phase); })
      .map(function (t) { return { name: t.name, level: t.level }; }),
    people: active.map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               fto: t.fto || '', shift: t.shift || '',
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.DIVISION, t, { trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.DIVISION, {});
    }),
    retiredForms: safeFormsV1_(function () { return retiredFormsV1_(); }),
    // Where two submissions of the same kind landed on the same day. Both are
    // kept; this is the list of calls to make, not a list of rows to remove.
    duplicateSubs: safeFormsV1_(function () { return duplicateSubmissionsV1_(); }),
    formLinks: safeBoolV1_(function () { return formLinksLiveV1_(); }),
    mode: modeV1_()
  };
}

function supervisorPayloadV1_(viewer) {
  var shift = normNameV1_(viewer.shift);
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && (!shift || normNameV1_(t.shift) === shift); });
  return {
    shift: viewer.shift || 'All shifts',
    trainees: mine.map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey,
               phase: t.phase, fto: t.fto,
               lastEval: daysAgoTextV1_(lastEvalForV1_(t.norm)) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.SUPERVISOR, { fto: viewer.name });
    })
  };
}

function medicalPayloadV1_() {
  var t = readTabV1_(PORTAL.TAB.URGENT);
  var cases = [];
  if (t.ok) {
    t.rows.forEach(function (r, i) {
      var who = String(r[3] || '').trim();
      if (!who) return;
      cases.push({
        row: t.firstDataRow + i,
        trainee: who,
        when: asDateV1_(r[0]) ? asDateV1_(r[0]).toDateString() : '',
        from: String(r[2] || '').trim(),
        what: String(r[4] || '').trim()
      });
    });
  }
  return { cases: cases.slice(0, 20) };
}

/* ---------------- forms, defensively ---------------- */
/* The registry reads Google Forms to discover published URLs and prefill
   ids. That is a network call against nine documents, and any one of them
   can be moved, unshared, or simply slow. A portal that cannot show a
   person their own record because a form link failed to resolve is worse
   than a portal with no links, so every call goes through here and a
   failure costs the links and nothing else. */
function safeFormsV1_(fn) {
  try { return fn() || []; } catch (e) { return []; }
}
function safeBoolV1_(fn) {
  try { return !!fn(); } catch (e) { return false; }
}


/* ======================================================================
 * 30_WebApp.gs
 * ====================================================================== */

/**
 * The web app entry point.
 *
 * doGet resolves the viewer on the server, builds only that role's payload,
 * and injects it into the page. The browser receives no data belonging to
 * anyone else, so there is nothing for a client-side mistake to expose.
 */

function doGet(e) {
  var viewer, payload, err = '';
  try {
    viewer = resolveViewerV1_(whoIsAskingV1_());
    payload = viewer.ok ? payloadForV1_(viewer) : {};
  } catch (ex) {
    viewer = { email: '', role: PORTAL.ROLE.NONE, name: '', ok: false, why: String(ex.message || ex) };
    payload = {};
    err = String(ex.message || ex);
  }

  var boot = {
    version: PORTAL.VERSION,
    mode: safeModeV1_(),
    viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
              ok: viewer.ok, why: viewer.why },
    data: payload,
    error: err
  };

  var t = portalTemplateV1_();
  t.boot = JSON.stringify(boot);

  var page = t.evaluate();
  page.setTitle(PORTAL.TITLE);
  page.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');

  // XFrameOptionsMode has exactly two members, DEFAULT and ALLOWALL. DEFAULT
  // is the protective one: Google sends X-Frame-Options SAMEORIGIN, so no
  // other site can frame this page. There is no DENY. Asking for one yields
  // undefined, and Apps Script rejects it as a null mode.
  page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  return page;
}

function safeModeV1_() { try { return modeV1_(); } catch (e) { return 'UNSET'; } }

/** The page, from wherever it lives.
 *
 *  Pasted as separate files, the page is an HTML file named Index. Pasted as
 *  the single combined file, it is a string constant the build put there.
 *  Same source either way; this is the one line that has to know which. */
function portalTemplateV1_() {
  if (typeof PORTAL_PAGE_HTML === 'string' && PORTAL_PAGE_HTML) {
    return HtmlService.createTemplate(PORTAL_PAGE_HTML);
  }
  return HtmlService.createTemplateFromFile('Index');
}

function payloadForV1_(viewer) {
  switch (viewer.role) {
    case PORTAL.ROLE.TRAINEE:    return traineePayloadV1_(viewer);
    case PORTAL.ROLE.FTO:        return ftoPayloadV1_(viewer);
    case PORTAL.ROLE.DIVISION:   return divisionPayloadV1_();
    case PORTAL.ROLE.SUPERVISOR: return supervisorPayloadV1_(viewer);
    case PORTAL.ROLE.MEDICAL:    return medicalPayloadV1_();
    default:                     return {};
  }
}

/* ---------------- actions ---------------- */
/* Each re-resolves the viewer server-side. A client cannot act as someone
   else by sending a different name, because the name it sends is ignored. */

/** Trainee acknowledges a coaching note. */
function ackCoachingV1(row) {
  requireWritableV1_('acknowledge a coaching note');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only the trainee may acknowledge their own coaching.');
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) throw new Error('No coaching log.');
  var r = Number(row);
  var idx = r - t.firstDataRow;
  if (idx < 0 || idx >= t.rows.length) throw new Error('That coaching note does not exist.');
  if (normNameV1_(t.rows[idx][t.col['TRAINEE']]) !== normNameV1_(viewer.traineeName)) {
    throw new Error('That coaching note belongs to someone else.');
  }
  t.sheet.getRange(r, t.col['ACKNOWLEDGED'] + 1).setValue('YES');
  forgetTabsV1_();
  auditV1_('COACHING ACKNOWLEDGED', viewer.email, 'row ' + r);
  return 'Acknowledged.';
}

/** Trainee files a reflection. */
function submitReflectionV1(answers) {
  requireWritableV1_('file a reflection');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only a trainee may file a reflection.');
  var a = answers || {};
  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.REFLECT);
  if (!sh) throw new Error('No reflection log.');
  sh.appendRow([new Date(), viewer.traineeName,
                clean_(a.wentWell), clean_(a.wasHard), clean_(a.workOn)]);
  var ref = 'RF-' + String(sh.getLastRow());
  forgetTabsV1_();
  auditV1_('REFLECTION FILED', viewer.email, ref);
  return { ref: ref, at: new Date().toString() };
}

/** Division approves a sign-off. A typed reason is required — there is no
 *  default wording, because a pre-filled reason is not a reason. */
function approveSignoffV1(row, reason) {
  requireWritableV1_('approve a sign-off');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) throw new Error('Only the Training Division may approve a sign-off.');
  var why = String(reason || '').trim();
  if (why.length < 8) throw new Error('Type why you are approving this. It goes on the permanent record in your name.');
  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) throw new Error('No queue.');
  var r = Number(row);
  if (t.col['DECISION'] === undefined) throw new Error('Queue is missing its DECISION column.');
  t.sheet.getRange(r, t.col['DECISION'] + 1).setValue('Approve sign-off');
  t.sheet.getRange(r, t.col['DECIDED BY'] + 1).setValue(viewer.email);
  t.sheet.getRange(r, t.col['DECISION DATE'] + 1).setValue(new Date());
  t.sheet.getRange(r, t.col['RATIONALE'] + 1).setValue(clean_(why));
  t.sheet.getRange(r, t.col['RECORD STATUS'] + 1).setValue('RECORDED');
  forgetTabsV1_();
  auditV1_('SIGN-OFF APPROVED', viewer.email, 'row ' + r + ' | ' + why.slice(0, 120));
  return 'Recorded.';
}

/** One person's whole record: the most recent submission of each kind, then
 *  every earlier one, in full. Read only in every mode — it opens nothing and
 *  writes nothing, so it is safe against the live tracker.
 *
 *  Authorisation is decided here, from the signed-in account. The browser
 *  sends a name; if the viewer is not entitled to that name's record, no
 *  record is built. A trainee asking for someone else gets a refusal, not a
 *  filtered version of the answer. */
function recordV1(traineeName) {
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (!viewer.ok) throw new Error(viewer.why || 'This account is not recognised.');

  var name = String(traineeName || '').trim();
  if (!name) throw new Error('No name was given.');

  var scope = recordScopeV1_(viewer, name);
  if (!scope) throw new Error('You are not able to open that record.');

  var rec = recordForV1_(name, scope);
  rec.partial = scope.length < PORTAL_SOURCES.length;
  rec.scopeNote = rec.partial
    ? 'You are seeing only the parts of this record your role covers.' : '';
  auditV1_('RECORD OPENED', viewer.email, name + ' | ' + scope.join(','));
  return rec;
}

/** Refreshes the current role's payload without a page reload. */
function refreshV1() {
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  return { viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
                     ok: viewer.ok, why: viewer.why },
           data: viewer.ok ? payloadForV1_(viewer) : {},
           mode: safeModeV1_() };
}

/** Blocks a leading = + - @ so submitted text cannot become a formula. */
function clean_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** The portal's own log. It is a WRITE, so it obeys the same rule everything
 *  else does: in PRODUCTION this portal puts nothing in the live book, not
 *  even a note about itself. Read paths call this too, which is exactly why
 *  the check has to be here and not only on the actions. */
function auditV1_(what, who, detail) {
  if (!mayWriteV1_()) return;
  try {
    var sh = targetBookV1_().getSheetByName(PORTAL.TAB.AUDIT);
    if (!sh) return;
    sh.appendRow([new Date(), what, who || '(unidentified)',
                  String(detail || '').slice(0, 400), PORTAL.VERSION]);
  } catch (e) {}
}


/* ======================================================================
 * 40_Forms.gs
 * ====================================================================== */

/**
 * The form registry.
 *
 * The nine Google Forms already in service stay exactly as they are. They are
 * the WRITE surface of this system: a submission goes where it has always
 * gone, through the triggers that already exist. This portal is the READ
 * surface and the router. It never edits a form, never changes a trigger,
 * and never submits on anyone's behalf.
 *
 * What this file adds is the part that was missing: one authoritative list of
 * which form is which, who it belongs to, and what it is for, so that a person
 * is shown the one form their situation calls for instead of a page of nine
 * links they have to choose between.
 *
 * Two things are cached in script properties because they cost an API call:
 *   PORTAL_FORM_URL_<KEY>   the published URL
 *   PORTAL_FORM_FIELDS_<KEY> the entry.NNN ids used for prefilling
 * Both are discovered by READING the form. Discovery uses createResponse(),
 * which builds a response object in memory; it is never submitted. Nothing in
 * this file writes to a form.
 */

/** Level a form belongs to, when it is level-specific. '' means any level. */
var PORTAL_FORMS = [

  { key: 'FTO_EVAL',
    id: '1VzbpZvnOqpxOFReKctU6XeJdQDZPIlcgL3a4JkomCrQ',
    title: 'End-of-shift evaluation',
    blurb: 'The shift you just worked. Ratings, one strength, one thing to work on.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '02 FTO SHIFT EVAL RAW',
    prefill: { fto: /^(fto|your name|evaluat|training officer)/i,
               trainee: /trainee/i } },

  { key: 'SELF_REFLECTION',
    id: '1L5SOaVOlpaZLn-Xn5ZJxyFUtCFZ0PLsQLpENbUqNVm0',
    title: 'Self-reflection',
    blurb: 'Your own account of how it went. Your FTO reads it before your next shift.',
    roles: ['TRAINEE'],
    perTrainee: false,
    level: '',
    landsIn: '03 SELF-REFLECTION RAW',
    prefill: { trainee: /^(trainee|your name|name)/i } },

  { key: 'URGENT_CONCERN',
    id: '1L5qB6Mqq9kGir1jdlQrjl7HznPcdyPmHXQocoMvness',
    title: 'Urgent concern',
    blurb: 'Patient safety or conduct that cannot wait for the next evaluation.',
    roles: ['TRAINEE', 'FTO', 'SUPERVISOR', 'TRAINING_DIVISION'],
    perTrainee: false,
    level: '',
    urgent: true,
    landsIn: '04 URGENT CONCERNS RAW',
    prefill: { fto: /^(your name|reported by|name)/i,
               trainee: /trainee/i } },

  { key: 'DECISION_RECORD',
    id: '1SkwoC-RxkNPu85F4OXFUVj41Jvv8vj8YBI_QqWizNgU',
    title: 'Training decision record',
    blurb: 'Advance a phase, extend, or hold. The written record of the decision.',
    roles: ['TRAINING_DIVISION'],
    perTrainee: true,
    level: '',
    landsIn: '12 DECISION QUEUE',
    prefill: { trainee: /trainee/i } },

  { key: 'HANDOVER',
    id: '1IKwMUneMjH-OL3nx_r_k-d4gnq6WlwLQxEbxOKHL_uE',
    title: 'Handover card',
    blurb: 'Covering someone else’s trainee today. What the regular FTO needs to know.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '',
    prefill: { fto: /^(your name|covering|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_EMT',
    id: '1nhl49xC6v6gMzFb_CZafJaM1zlIVEvbrquDOGSg6YDQ',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'emt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_AEMT',
    id: '1H39FqiIQGIJ-CWFnhDfWs7MWjJMJyMIYfdGqVhFOdgw',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'aemt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_PMD',
    id: '1Ykg2qmx-C3Q2TzUPK287loucSPYlOhW8t6dtpYR0VTI',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'pmd',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  /* Retired, and the reason is not cosmetic. This form has no submit trigger
     bound to it, so responses land in the form and reach the tracker never.
     Sixteen of them are sitting there now. The portal must not send anyone
     here, and the Training Division view says so out loud until it is dealt
     with. Nothing about the form itself is changed by this portal. */
  { key: 'SKILLS_COMBINED',
    id: '1Q1R2bQPQe3eDbiDQTGJJHtzgAOC9jhEJJUkeh2w2u4s',
    title: 'Skills quick log (all levels)',
    blurb: 'Superseded by the three level-specific logs.',
    roles: [],
    perTrainee: false,
    level: '',
    retired: true,
    retiredWhy: 'No submit trigger is bound to it, so responses never reach the tracker.',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: {} }
];

/** Registry lookup by key. Returns null rather than throwing, because a
 *  missing form must degrade to "no link" and never to a broken page. */
function formByKeyV1_(key) {
  for (var i = 0; i < PORTAL_FORMS.length; i++) {
    if (PORTAL_FORMS[i].key === key) return PORTAL_FORMS[i];
  }
  return null;
}

/** Are form links live? Off in staging by default: a sandbox user tapping a
 *  link would land on the REAL form, and a submission there is a production
 *  write nobody approved. Turn it on deliberately with enableFormLinks(). */
function formLinksLiveV1_() {
  var p = String(PropertiesService.getScriptProperties()
    .getProperty('PORTAL_FORM_LINKS') || '').toUpperCase();
  if (p === 'ON') return true;
  if (p === 'OFF') return false;
  return modeV1_() !== PORTAL.MODE_STAGING;
}

/* ---------------- URLs ---------------- */

/** The published URL, cached. Falls back to the document URL, which resolves
 *  for anyone in the county domain, so a forms-scope failure costs prefill
 *  but never costs the link. */
function formUrlV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_URL_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) return hit;
  var url = '';
  try { url = FormApp.openById(entry.id).getPublishedUrl(); } catch (e) { url = ''; }
  if (!url) url = 'https://docs.google.com/forms/d/' + entry.id + '/viewform';
  try { props.setProperty(cacheKey, url); } catch (e) {}
  return url;
}

/** entry.NNN ids for the fields this portal knows how to prefill, cached.
 *  Discovery reads the form and builds an unsubmitted response to see which
 *  parameter carries which item. It never calls submit(). */
function formFieldsV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_FIELDS_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var map = {};
  try {
    var form = FormApp.openById(entry.id);
    var items = form.getItems();
    var wanted = entry.prefill || {};
    Object.keys(wanted).forEach(function (field) {
      var re = wanted[field];
      for (var i = 0; i < items.length; i++) {
        var found = probeItemV1_(form, items[i], re);
        if (found) { map[field] = found; break; }
      }
    });
  } catch (e) { map = {}; }

  try { props.setProperty(cacheKey, JSON.stringify(map)); } catch (e) {}
  return map;
}

/** One item: does its title match, and if so what is its entry id?
 *  Text items prefill with anything. Choice items prefill only with a value
 *  the form already offers, so the choices come back with the id. */
function probeItemV1_(form, item, re) {
  var title = '';
  try { title = String(item.getTitle() || ''); } catch (e) { return null; }
  if (!re.test(title)) return null;

  var type = String(item.getType());
  var response = null, choices = null;
  try {
    if (type === 'TEXT') {
      response = item.asTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'PARAGRAPH_TEXT') {
      response = item.asParagraphTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'LIST') {
      choices = item.asListItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asListItem().createResponse(choices[0]);
    } else if (type === 'MULTIPLE_CHOICE') {
      choices = item.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asMultipleChoiceItem().createResponse(choices[0]);
    } else {
      return null;
    }
  } catch (e) { return null; }

  var url = '';
  try { url = form.createResponse().withItemResponse(response).toPrefilledUrl(); } catch (e) { return null; }
  var m = url.match(/[?&](entry\.[0-9]+(?:_sentinel)?)=/);
  if (!m) return null;
  return { id: m[1], type: type, choices: choices, title: title };
}

/** A prefilled link, or the plain link when nothing can be prefilled.
 *  values is { fto: 'Dana Whitlock', trainee: 'Jamie Rivers' }. */
function prefilledUrlV1_(entry, values) {
  var base = formUrlV1_(entry);
  var vals = values || {};
  var fields;
  try { fields = formFieldsV1_(entry); } catch (e) { fields = {}; }

  var parts = [];
  Object.keys(vals).forEach(function (field) {
    var v = String(vals[field] == null ? '' : vals[field]).trim();
    var f = fields[field];
    if (!v || !f || !f.id) return;
    if (f.choices && f.choices.length) {
      var match = null;
      for (var i = 0; i < f.choices.length; i++) {
        if (normNameV1_(f.choices[i]) === normNameV1_(v)) { match = f.choices[i]; break; }
      }
      if (!match) return;              // never prefill a choice the form does not offer
      v = match;
    }
    parts.push(f.id + '=' + encodeURIComponent(v));
  });

  if (!parts.length) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'usp=pp_url&' + parts.join('&');
}

/* ---------------- what a person is offered ---------------- */

/** Turns a registry entry into the card the page renders. */
function formCardV1_(entry, values, subtitle) {
  return {
    key: entry.key,
    title: entry.title,
    blurb: subtitle || entry.blurb,
    urgent: !!entry.urgent,
    live: formLinksLiveV1_(),
    url: formLinksLiveV1_() ? prefilledUrlV1_(entry, values || {}) : ''
  };
}

/** The forms a role may open that are not tied to one trainee. */
function generalFormsForV1_(role, values) {
  var out = [];
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** The forms an FTO opens against ONE named trainee, with the right skills
 *  log for that trainee's level already chosen. This is the whole point of
 *  the registry: the FTO never picks a form, and never picks a level. */
function traineeFormsForV1_(role, trainee, values) {
  var out = [];
  var levelKey = trainee && trainee.levelKey ? trainee.levelKey : '';
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (!f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    if (f.level && f.level !== levelKey) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** Every form a role can reach, general and per-trainee, deduplicated by key.
 *  Used by the Training Division view, which is allowed to see the whole set. */
function allFormsForV1_(role, values) {
  var seen = {}, out = [];
  generalFormsForV1_(role, values).concat(traineeFormsForV1_(role, null, values))
    .forEach(function (c) { if (!seen[c.key]) { seen[c.key] = true; out.push(c); } });
  return out;
}

/** Registry entries that are retired, for the Division's system view. */
function retiredFormsV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.retired; })
    .map(function (f) { return { key: f.key, title: f.title, why: f.retiredWhy || '' }; });
}

/* ---------------- one-click operator functions ---------------- */

/** Turn the real form links on. Deliberate, because in staging this points
 *  sandbox users at production forms. */
function enableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'ON');
  return noteV1_('Form links are ON. In ' + safeModeV1_() + ' mode, cards now open the real forms.');
}

function disableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'OFF');
  return noteV1_('Form links are OFF. Cards render but do not open anything.');
}

/** Reads all nine forms once and caches their URLs and field ids, so the
 *  first person to open the portal does not pay for discovery. Read-only. */
function warmFormCache() {
  var lines = [];
  PORTAL_FORMS.forEach(function (f) {
    var url = '', fields = {}, err = '';
    try { url = formUrlV1_(f); fields = formFieldsV1_(f); }
    catch (e) { err = String(e.message || e); }
    lines.push(f.key + '\n  url    : ' + (url || '(could not read)') +
      '\n  prefill: ' + (Object.keys(fields).length ? Object.keys(fields).join(', ') : 'none found') +
      (err ? '\n  error  : ' + err : '') + (f.retired ? '\n  RETIRED: ' + f.retiredWhy : ''));
  });
  return noteV1_('FORM REGISTRY\n\n' + lines.join('\n\n') +
    '\n\nNothing was written to any form.');
}

/** Forgets the cached URLs and field ids. Run after a form is edited. */
function clearFormCache() {
  var props = PropertiesService.getScriptProperties();
  PORTAL_FORMS.forEach(function (f) {
    props.deleteProperty('PORTAL_FORM_URL_' + f.key);
    props.deleteProperty('PORTAL_FORM_FIELDS_' + f.key);
  });
  return noteV1_('Form cache cleared. It rebuilds on the next page load.');
}

/** Logs and, when there is a UI, shows a message. Returns it either way. */
function noteV1_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}


/* ======================================================================
 * 50_Production.gs
 * ====================================================================== */

/**
 * Pointing the portal at the live tracker.
 *
 * The architecture this file makes possible, stated plainly:
 *
 *   The forms write. The portal reads.
 *
 * Nothing in the live system changes to bring this portal online. The nine
 * forms keep their triggers, keep their destinations, and keep writing to the
 * same tabs they always have. The portal opens that spreadsheet READ ONLY,
 * shows each person only their own part of it, and hands them the one form
 * their situation calls for. Every write path in this project checks
 * mayWriteV1_() first and refuses in PRODUCTION mode, so there is no code path
 * from this portal to a live record.
 *
 * Pointing at production is deliberately a two-step act. You set the id by
 * hand in Project Settings, then run the function. Neither step happens by
 * default and neither happens by accident.
 */

var PORTAL_PROD_ID_PROPERTY = 'PORTAL_PRODUCTION_SPREADSHEET_ID';

/** Read the live tracker, write nothing.
 *
 *  Before this will run you must add, in Project Settings > Script Properties:
 *    PORTAL_PRODUCTION_SPREADSHEET_ID = the live tracker's id
 *  It is not stored in this file, so a copy of this code cannot reach your
 *  production data on its own. */
function pointAtProductionReadOnly() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(PORTAL_PROD_ID_PROPERTY) || '').trim();
  if (!id) {
    throw new Error('Set the script property ' + PORTAL_PROD_ID_PROPERTY +
      ' to the live tracker id first. Project Settings > Script Properties > ' +
      'Add script property. This function will not guess which spreadsheet ' +
      'you mean.');
  }

  var name = '';
  try { name = SpreadsheetApp.openById(id).getName(); }
  catch (e) {
    throw new Error('Cannot open ' + id + ' — ' + (e.message || e) +
      '. Nothing was changed.');
  }

  var previous = props.getProperty(PORTAL.PROPERTY_TARGET) || '(none)';
  props.setProperty(PORTAL.PROPERTY_TARGET, id);
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_PRODUCTION);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();

  return noteV1_('POINTED AT PRODUCTION, READ ONLY\n\n' +
    'Spreadsheet : ' + name + '\n' +
    'Was pointed at: ' + previous + '\n\n' +
    'Mode is now PRODUCTION. Every write in this portal refuses in this mode:\n' +
    '  approving a sign-off, filing a reflection, acknowledging coaching,\n' +
    '  switching role for testing.\n' +
    'The forms are unaffected and remain the way anything gets written.\n\n' +
    'Run productionReadinessCheck() next to see what the portal can and\n' +
    'cannot find before you send anyone the link.');
}

/** Go back to the sandbox. */
function pointAtStaging() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('PORTAL_STAGING_SPREADSHEET_ID') || '').trim();
  if (!id) {
    throw new Error('No staging sandbox is remembered. Run setUpStaging() to ' +
      'build a fresh one.');
  }
  props.setProperty(PORTAL.PROPERTY_TARGET, id);
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  return noteV1_('Back on the staging sandbox. Writes are allowed again.');
}

/** A read-only report on whether the portal can serve the target it is
 *  pointed at. It opens tabs and forms and reports. It changes nothing. */
function productionReadinessCheck() {
  var lines = [];
  function say(s) { lines.push(s); }

  var id = '';
  try { id = targetIdV1_(); } catch (e) { return noteV1_('Not pointed anywhere yet. ' + (e.message || e)); }

  var book = null, bookName = '';
  try { book = SpreadsheetApp.openById(id); bookName = book.getName(); }
  catch (e) { return noteV1_('Cannot open ' + id + ' — ' + (e.message || e)); }

  say('READINESS CHECK  (read only, nothing was changed)');
  say('');
  say('Target : ' + bookName);
  say('Mode   : ' + safeModeV1_() + (mayWriteV1_() ? '  WRITES ALLOWED' : '  read only'));
  say('You    : ' + (whoIsAskingV1_() || 'Google is not naming this account'));
  say('');

  say('TABS');
  var missing = [];
  Object.keys(PORTAL.TAB).forEach(function (k) {
    var name = PORTAL.TAB[k];
    var t = readTabV1_(name);
    if (!t.ok) { missing.push(name); say('  missing  ' + name); return; }
    say('  ok       ' + name + '  (' + t.rows.length + ' rows, ' +
        t.headers.filter(String).length + ' named columns)');
  });
  say('');

  say('PEOPLE');
  try {
    PEOPLE_CACHE_V1 = null;
    forgetTabsV1_();
    var p = portalPeopleV1_();
    say('  training division : ' + (p.division.length || 'none set'));
    say('  medical director  : ' + (p.medical.length || 'none set'));
    say('  supervisors       : ' + (Object.keys(p.supervisors).length || 'none set'));
    say('  FTOs on roster    : ' + Object.keys(p.ftos).length);
    say('  trainees with email: ' + Object.keys(p.trainees).length);
    var me = resolveViewerV1_(whoIsAskingV1_());
    say('  you resolve to    : ' + me.role + (me.ok ? '' : '  (' + me.why + ')'));
  } catch (e) { say('  could not resolve people: ' + (e.message || e)); }
  say('');

  say('TRAINEES WITHOUT AN EMAIL  (they cannot sign in)');
  try {
    var noEmail = traineesV1_().filter(function (t) { return !t.closed && !t.email; });
    if (!noEmail.length) say('  none');
    noEmail.forEach(function (t) { say('  ' + t.name); });
  } catch (e) { say('  could not read the master: ' + (e.message || e)); }
  say('');

  say('FORMS');
  say('  links are ' + (formLinksLiveV1_() ? 'LIVE' : 'OFF'));
  PORTAL_FORMS.forEach(function (f) {
    var line = '  ' + (f.retired ? 'RETIRED  ' : 'ok       ') + f.key;
    var dest = '';
    try { dest = String(FormApp.openById(f.id).getDestinationId() || ''); } catch (e) { dest = '?'; }
    if (dest === '?') line += '  (could not read)';
    else if (!dest) line += '  NO RESPONSE DESTINATION';
    else if (dest !== id) line += '  writes to a DIFFERENT spreadsheet';
    else line += '  writes here';
    if (f.retired) line += '  — ' + f.retiredWhy;
    say(line);
  });
  say('');

  if (missing.length) {
    say('WHAT TO DO');
    say('  ' + missing.length + ' tab(s) the portal expects are not in this ' +
        'spreadsheet. The screens that use them will be empty. Nothing is ' +
        'broken; they simply have no source.');
  } else {
    say('WHAT TO DO');
    say('  Every tab the portal expects is present. Deploy, open the URL, and');
    say('  check that you see the view your role should see.');
  }

  return noteV1_(lines.join('\n'));
}

/** Where is this portal pointed and what can it do. Safe to run any time. */
function whereAmI() { return portalStatusV1(); }


/* ======================================================================
 * 60_History.gs
 * ====================================================================== */

/**
 * Everything that was ever submitted, arranged newest first.
 *
 * The raw tabs are the archive and they stay exactly as they are. Nothing in
 * this file deletes a row, moves a row, overwrites a row, or decides that an
 * old submission no longer matters. It reads, groups, and orders.
 *
 * What it produces for one person:
 *
 *   CURRENT   the most recent submission of each kind, in full
 *   EARLIER   every submission before it, also in full, in order
 *
 * A submission is never summarised or trimmed on the way through. Every named
 * column that had a value in it comes out the other side with its own label,
 * because the whole point is that nothing gathered so far is lost.
 *
 * Two rows of the same kind on the same day are flagged as a possible
 * duplicate. Flagged, not removed. Which one is right is a judgement about a
 * personnel record and this code does not make it.
 */

/** The raw tabs a person's record is assembled from.
 *
 *  Columns are found by header, with a positional fallback for the tabs whose
 *  headers a form rewrote. `who` and `when` are structural; everything else
 *  is carried through as-is, so a column added to a form tomorrow appears in
 *  the record without this file changing. */
var PORTAL_SOURCES = [
  { key: 'EVAL', tab: PORTAL.TAB.EVAL, title: 'Shift evaluation',
    who:  { re: /^trainee/i,                    at: 2 },
    when: { re: /shift date|^timestamp|^date/i, at: 0 },
    by:   { re: /^(fto|evaluator|training officer)/i, at: 1 } },

  { key: 'REFLECT', tab: PORTAL.TAB.REFLECT, title: 'Self-reflection',
    who:  { re: /^trainee|^your name|^name/i,   at: 1 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   null },

  { key: 'URGENT', tab: PORTAL.TAB.URGENT, title: 'Urgent concern',
    who:  { re: /trainee/i,                     at: 3 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   { re: /^your name|reported by/i,      at: 2 },
    restricted: true },

  { key: 'EVIDENCE', tab: PORTAL.TAB.EVIDENCE, title: 'Skill logged',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /event date|^timestamp|^date/i, at: -1 },
    by:   { re: /^(fto|logged by)/i,            at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'SIGNOFF', tab: PORTAL.TAB.SIGNOFF, title: 'Sign-off',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /^(sign-?off )?date|^timestamp/i, at: -1 },
    by:   { re: /signed off by|approved by|decided by/i, at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'COACHING', tab: PORTAL.TAB.COACHING, title: 'Coaching note',
    who:  { re: /^trainee/i,                    at: 1 },
    when: { re: /^date|^timestamp/i,            at: 0 },
    by:   { re: /^from/i,                       at: 2 } }
];

/** Column index by header pattern, falling back to a fixed position.
 *  Returns -1 when neither finds one, and callers treat that as "no column"
 *  rather than guessing at column A. */
function colIndexV1_(t, spec) {
  if (!spec) return -1;
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && spec.re.test(t.headers[i])) return i;
  }
  return spec.at >= 0 ? spec.at : -1;
}

var PORTAL_ACRONYMS = ['FTO','EMT','AEMT','EMS','ALS','BLS','ID','PCR','IV','IO',
                       'CPR','ECG','EKG','QA','QI','MD','NREMT'];

/** 'WHAT WENT WELL' reads as shouting in a record someone has to sit and
 *  read for twenty minutes. Sentence case, and acronyms keep their case. */
function labelForV1_(header) {
  return String(header || '').split(/\s+/).map(function (w, i) {
    var bare = w.replace(/[^A-Za-z]/g, '');
    if (bare && PORTAL_ACRONYMS.indexOf(bare.toUpperCase()) >= 0) return w.toUpperCase();
    var lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(' ');
}

/** A cell as a person would read it. Dates become dates; nothing is cut. */
function displayValueV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toDateString();
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+$/, '');
}

function dayKeyV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime()))
    ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : '';
}

/** Every submission in one tab belonging to one person, newest first.
 *  Undated rows sort last rather than being dropped. */
function submissionsFromV1_(source, norm) {
  var t = readTabV1_(source.tab);
  if (!t.ok) return [];

  var whoIdx  = colIndexV1_(t, source.who);
  if (whoIdx < 0) return [];
  var whenIdx = colIndexV1_(t, source.when);
  var byIdx   = colIndexV1_(t, source.by);
  var grpIdx  = colIndexV1_(t, source.groupBy);

  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[whoIdx]) !== norm) return;
    var fields = [];
    t.headers.forEach(function (h, ci) {
      if (!h) return;
      if (ci === whoIdx || ci === whenIdx || ci === byIdx) return;
      var v = r[ci];
      if (v === '' || v === null || v === undefined) return;
      fields.push({ label: labelForV1_(h), value: displayValueV1_(v) });
    });
    out.push({
      key: source.key,
      source: source.title,
      tab: source.tab,
      row: t.firstDataRow + i,
      when: whenIdx >= 0 ? asDateV1_(r[whenIdx]) : null,
      by: byIdx >= 0 ? String(r[byIdx] || '').trim() : '',
      group: grpIdx >= 0 ? String(r[grpIdx] || '').trim() : '',
      fields: fields
    });
  });

  out.sort(function (a, b) {
    if (a.when && b.when) return b.when - a.when;
    if (a.when) return -1;
    if (b.when) return 1;
    return b.row - a.row;
  });
  return out;
}

/** Marks the newest of each group as current, everything else as earlier, and
 *  same-day pairs as a possible duplicate. Nothing is removed. */
function markCurrentV1_(list, grouped) {
  var seen = {}, byDay = {};
  list.forEach(function (s) {
    var g = grouped ? (s.group || '(unnamed)') : '*';
    s.current = !seen[g];
    seen[g] = true;

    var dk = g + '|' + dayKeyV1_(s.when);
    if (dayKeyV1_(s.when)) {
      byDay[dk] = (byDay[dk] || 0) + 1;
      s.sameDayIndex = byDay[dk];
    } else {
      s.sameDayIndex = 1;
    }
  });
  list.forEach(function (s) {
    var dk = (grouped ? (s.group || '(unnamed)') : '*') + '|' + dayKeyV1_(s.when);
    s.possibleDuplicate = dayKeyV1_(s.when) ? byDay[dk] > 1 : false;
  });
  return list;
}

function whenTextV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime())) ? d.toDateString() : 'no date recorded';
}

/** One person's whole record: what is current, and everything before it.
 *  `only` restricts which sources are read, which is how the Medical Director
 *  gets urgent concerns and nothing else. */
function recordForV1_(name, only) {
  var norm = normNameV1_(name);
  var sections = [], timeline = [], total = 0, duplicates = 0;

  PORTAL_SOURCES.forEach(function (src) {
    if (only && only.indexOf(src.key) < 0) return;
    var list = markCurrentV1_(submissionsFromV1_(src, norm), !!src.groupBy);
    if (!list.length) return;
    total += list.length;

    var current = list.filter(function (s) { return s.current; });
    var earlier = list.filter(function (s) { return !s.current; });
    duplicates += list.filter(function (s) { return s.possibleDuplicate; }).length;

    sections.push({
      key: src.key,
      title: src.title,
      grouped: !!src.groupBy,
      count: list.length,
      newest: list[0].when ? whenTextV1_(list[0].when) : '',
      newestAgo: daysAgoTextV1_(list[0].when),
      current: current.map(shapeV1_),
      earlier: earlier.map(shapeV1_)
    });

    list.forEach(function (s) { timeline.push(shapeV1_(s)); });
  });

  timeline.sort(function (a, b) {
    if (a.at && b.at) return b.at - a.at;
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });
  timeline.forEach(function (s) { delete s.at; });

  return {
    name: String(name || ''),
    sections: sections,
    timeline: timeline,
    total: total,
    duplicates: duplicates
  };
}

function shapeV1_(s) {
  return {
    key: s.key, source: s.source, tab: s.tab, row: s.row,
    when: whenTextV1_(s.when), ago: daysAgoTextV1_(s.when),
    at: s.when instanceof Date && !isNaN(s.when.getTime()) ? s.when.getTime() : 0,
    by: s.by, group: s.group,
    current: !!s.current, possibleDuplicate: !!s.possibleDuplicate,
    fields: s.fields
  };
}

/** How fresh is each kind of submission for one person. This is the
 *  at-a-glance form of the same question: what is the current state. */
function freshnessForV1_(name) {
  var norm = normNameV1_(name);
  return PORTAL_SOURCES.filter(function (s) { return !s.restricted; })
    .map(function (src) {
      var list = submissionsFromV1_(src, norm);
      return { key: src.key, title: src.title, count: list.length,
               ago: list.length ? daysAgoTextV1_(list[0].when) : 'never',
               when: list.length ? whenTextV1_(list[0].when) : '' };
    });
}

/** Which sources a role may read of another person's record. Returning a
 *  list rather than a yes or no is what lets the Medical Director open a
 *  record at all without seeing routine training detail. */
function recordScopeV1_(viewer, name) {
  var norm = normNameV1_(name);
  var all = PORTAL_SOURCES.map(function (s) { return s.key; });

  if (viewer.role === PORTAL.ROLE.DIVISION) return all;

  if (viewer.role === PORTAL.ROLE.TRAINEE) {
    return normNameV1_(viewer.traineeName) === norm ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.FTO) {
    var mine = traineesV1_().filter(function (t) {
      return normNameV1_(t.fto) === normNameV1_(viewer.name) && t.norm === norm; });
    return mine.length ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.MEDICAL) return ['URGENT'];

  // A supervisor gets situational awareness on their shift, not a training
  // record. That was the rule before this file existed and it does not change
  // because a new screen made it convenient.
  return null;
}

/* ---------------- where two submissions compete ---------------- */

/** Every place two submissions of the same kind landed on the same day, for
 *  everyone still active. This is the list of decisions to make, not a list
 *  of rows to delete: both halves of every pair stay exactly where they are.
 *
 *  Read only in every mode. */
function duplicateSubmissionsV1_() {
  var out = [];
  traineesV1_().filter(function (t) { return !t.closed; }).forEach(function (t) {
    PORTAL_SOURCES.forEach(function (src) {
      var list = markCurrentV1_(submissionsFromV1_(src, t.norm), !!src.groupBy);
      var byDay = {};
      list.forEach(function (s) {
        if (!s.possibleDuplicate) return;
        var k = (s.group || '') + '|' + dayKeyV1_(s.when);
        (byDay[k] = byDay[k] || []).push(s);
      });
      Object.keys(byDay).forEach(function (k) {
        var pair = byDay[k];
        out.push({
          trainee: t.name, source: src.title, tab: src.tab,
          group: pair[0].group || '', when: whenTextV1_(pair[0].when),
          count: pair.length, rows: pair.map(function (s) { return s.row; })
        });
      });
    });
  });
  return out;
}

/** The same thing as a report you can read in the script editor, for when the
 *  question is "where do I need to make a call" rather than "show me Jamie". */
function duplicateSubmissionsReport() {
  var dupes = duplicateSubmissionsV1_();
  if (!dupes.length) {
    return noteV1_('No two submissions of the same kind landed on the same day ' +
      'for anyone currently active. Nothing to decide.');
  }
  var lines = ['POSSIBLE DUPLICATE SUBMISSIONS  (read only, nothing was changed)', ''];
  dupes.forEach(function (d) {
    lines.push(d.trainee + '  —  ' + d.source + (d.group ? ' (' + d.group + ')' : ''));
    lines.push('  ' + d.when + '   ' + d.count + ' submissions');
    lines.push('  ' + d.tab + ' rows ' + d.rows.join(', '));
    lines.push('');
  });
  lines.push('Both halves of every pair are still on file and both are shown in');
  lines.push('the portal. Which one stands is a decision about a personnel');
  lines.push('record, so nothing here makes it for you.');
  return noteV1_(lines.join('\n'));
}


/* ======================================================================
 * 70_Backfill.gs
 * ====================================================================== */

/**
 * The responses that never made it into a tab.
 *
 * A Google Form keeps every response whether or not anything is listening.
 * When a form has no submit trigger bound to it, the answers are still there
 * — they are simply sitting in the form instead of in the tracker. The
 * combined skills log is in exactly that state and has sixteen of them.
 *
 * This file finds them, shows you what they say, and can put them where they
 * were always meant to go. Three rules govern it:
 *
 *   1. A preview writes nothing, in any mode. You see the whole plan first.
 *   2. Writing refuses outside STAGING, so the sandbox proves it before the
 *      live tracker is ever considered.
 *   3. Nothing is dropped to make the shape fit. An answer this code cannot
 *      map to a column is written into the notes column with its question
 *      attached, and if there is nowhere to put it the response is refused
 *      rather than written incomplete.
 *
 * Re-running is safe. Every row carries the form response id it came from and
 * a response already present is skipped, so a second run adds nothing.
 */

/** Question titles that mean the same thing as a column but do not read the
 *  same. Left side is what a form asks, right side is the column it belongs
 *  in. Matching is done on letters and digits only, so case, punctuation and
 *  spacing never matter. */
var PORTAL_ANSWER_ALIASES = {
  'FTONAME':            'FTO',
  'YOURNAME':           'FTO',
  'EVALUATORNAME':      'FTO',
  'TRAININGOFFICER':    'FTO',
  'TRAINEENAME':        'TRAINEE',
  'WHICHTRAINEE':       'TRAINEE',
  'DATEOFEVENT':        'EVENT DATE',
  'SHIFTDATE':          'EVENT DATE',
  'DATE':               'EVENT DATE',
  'SKILLPERFORMED':     'SKILL',
  'WHICHSKILL':         'SKILL',
  'LEVELOFASSISTANCE':  'STAGE',
  'PROMPTINGLEVEL':     'STAGE',
  'RESULT':             'OUTCOME',
  'WASITSUCCESSFUL':    'OUTCOME',
  'COMMENTS':           'NOTE',
  'NOTES':              'NOTE',
  'ADDITIONALCOMMENTS': 'NOTE'
};

function bareV1_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** The column a question belongs in, or '' when nothing matches. */
function columnForAnswerV1_(question, headers) {
  var q = bareV1_(question);
  if (!q) return '';
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && bareV1_(headers[i]) === q) return headers[i];
  }
  var alias = PORTAL_ANSWER_ALIASES[q];
  if (!alias) return '';
  for (var j = 0; j < headers.length; j++) {
    if (headers[j] && bareV1_(headers[j]) === bareV1_(alias)) return headers[j];
  }
  return '';
}

/** Every response on one form, oldest first, as plain data. Read only. */
function formResponsesV1_(entry) {
  var form = FormApp.openById(entry.id);
  return form.getResponses().map(function (r) {
    var answers = [];
    r.getItemResponses().forEach(function (ir) {
      var v = ir.getResponse();
      if (v === null || v === undefined || v === '') return;
      answers.push({
        question: String(ir.getItem().getTitle() || ''),
        value: (v instanceof Array) ? v.join(', ') : String(v)
      });
    });
    var who = '';
    try { who = String(r.getRespondentEmail() || ''); } catch (e) { who = ''; }
    return { id: String(r.getId()), at: r.getTimestamp(), email: who, answers: answers };
  });
}

/** Which column on the destination tab holds the id of the response a row
 *  came from. Without one there is no way to tell a re-run from a duplicate,
 *  so the plan stops rather than risk writing the same evidence twice. */
function responseIdColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /SOURCE RESPONSE ID|RESPONSE ID/i.test(t.headers[i])) return t.headers[i];
  }
  return '';
}

function notesColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /^(NOTE|NOTES|COMMENT|COMMENTS|DETAIL|WHAT HAPPENED)/i.test(t.headers[i])) {
      return t.headers[i];
    }
  }
  return '';
}

/** What backfilling one form would do. Builds every row in full and returns
 *  it. Writes nothing, in any mode. */
function backfillPlanV1_(entry) {
  var plan = { key: entry.key, title: entry.title, dest: entry.landsIn || '',
               total: 0, present: 0, missing: [], blocked: [], problem: '' };

  if (!entry.landsIn) { plan.problem = 'This form has no destination tab, so there is nowhere to put its responses.'; return plan; }

  var t = readTabV1_(entry.landsIn);
  if (!t.ok) { plan.problem = 'The tab ' + entry.landsIn + ' is not in this spreadsheet.'; return plan; }

  var idCol = responseIdColumnV1_(t);
  if (!idCol) {
    plan.problem = entry.landsIn + ' has no response id column, so a second run ' +
      'could not tell an already-imported response from a new one. Nothing will be written.';
    return plan;
  }
  var noteCol = notesColumnV1_(t);

  var seen = {};
  t.rows.forEach(function (r) {
    var v = String(r[t.col[idCol.toUpperCase()]] || '').trim();
    if (v) seen[v] = true;
  });

  var responses;
  try { responses = formResponsesV1_(entry); }
  catch (e) { plan.problem = 'Could not read the form: ' + (e.message || e); return plan; }

  plan.total = responses.length;

  responses.forEach(function (resp) {
    if (seen[resp.id]) { plan.present++; return; }

    var mapped = {}, spare = [];
    resp.answers.forEach(function (a) {
      var col = columnForAnswerV1_(a.question, t.headers);
      if (!col) { spare.push(a); return; }
      // A question that belongs in the notes column goes in as it was
      // written. Only an answer with no column of its own carries its
      // question with it, because there the question is the label.
      mapped[col] = (col === noteCol && mapped[col])
        ? (mapped[col] + '\n' + a.value) : a.value;
    });

    // Everything that did not land in a column of its own goes into the notes
    // column with its question attached. Losing an answer to make the shape
    // fit is the one thing this must not do.
    var extra = spare.map(function (a) { return a.question + ': ' + a.value; }).join('\n');
    if (extra && !noteCol) {
      plan.blocked.push({ id: resp.id, at: resp.at, why:
        entry.landsIn + ' has no notes column, and ' + spare.length +
        ' answer(s) have nowhere to go. Add a NOTE column or these stay in the form.',
        answers: resp.answers });
      return;
    }
    if (extra) {
      mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + extra) : extra;
    }
    mapped[idCol] = resp.id;

    plan.missing.push({
      id: resp.id,
      at: resp.at,
      email: resp.email,
      mapped: mapped,
      unmappedCount: spare.length,
      row: t.headers.map(function (h) {
        if (!h) return '';
        var v = mapped[h];
        return v === undefined ? '' : clean_(v);
      })
    });
  });

  return plan;
}

/** Every form's plan. Read only. */
function backfillPlanAllV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.landsIn; })
    .map(function (f) { return backfillPlanV1_(f); });
}

/** What would be imported, and what would not. Writes nothing, in any mode,
 *  so this is safe to run against the live tracker. */
function backfillPreview() {
  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL PREVIEW  (read only, nothing was written)', '',
               'Target : ' + safeTargetNameV1_(),
               'Mode   : ' + safeModeV1_() +
                 (mayWriteV1_() ? '  writes allowed' : '  READ ONLY, nothing can be written'), ''];
  var totalMissing = 0, totalBlocked = 0;

  plans.forEach(function (p) {
    lines.push(p.title + '  (' + p.key + ')');
    if (p.problem) { lines.push('  cannot import: ' + p.problem); lines.push(''); return; }
    lines.push('  responses on the form : ' + p.total);
    lines.push('  already in ' + p.dest + ' : ' + p.present);
    lines.push('  would be added        : ' + p.missing.length);
    if (p.blocked.length) lines.push('  would be REFUSED      : ' + p.blocked.length);
    totalMissing += p.missing.length;
    totalBlocked += p.blocked.length;

    p.missing.slice(0, 5).forEach(function (m) {
      lines.push('    ' + (m.at ? m.at.toDateString() : 'no date') + '  ' +
        (m.mapped['TRAINEE'] || m.mapped['Trainee'] || '(no trainee named)') +
        (m.unmappedCount ? '   ' + m.unmappedCount + ' answer(s) into notes' : ''));
    });
    if (p.missing.length > 5) lines.push('    ... and ' + (p.missing.length - 5) + ' more');
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
    lines.push('');
  });

  lines.push('---');
  lines.push(totalMissing + ' response(s) would be added, ' + totalBlocked + ' refused.');
  lines.push('');
  if (!mayWriteV1_()) {
    lines.push('This portal is in ' + safeModeV1_() + ' mode and will not write. To try the');
    lines.push('import for real, run pointAtStaging() and then backfillIntoStaging().');
  } else {
    lines.push('Run backfillIntoStaging() to write these into the sandbox.');
  }
  return noteV1_(lines.join('\n'));
}

function safeTargetNameV1_() {
  try { return targetBookV1_().getName(); } catch (e) { return '(not pointed anywhere)'; }
}

/** Writes the missing responses in. Refuses outside STAGING.
 *
 *  Idempotent: a response already carrying its id in the destination tab is
 *  skipped, so running this twice adds nothing the second time. */
function backfillIntoStaging() {
  requireWritableV1_('import historical form responses');

  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL', '', 'Target : ' + safeTargetNameV1_(), ''];
  var written = 0, refused = 0;

  plans.forEach(function (p) {
    if (p.problem) { lines.push(p.title + ' : skipped — ' + p.problem); return; }
    if (!p.missing.length && !p.blocked.length) {
      lines.push(p.title + ' : nothing to add (' + p.present + ' already in ' + p.dest + ')');
      return;
    }
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { lines.push(p.title + ' : skipped — ' + p.dest + ' disappeared'); return; }

    p.missing.forEach(function (m) { sh.appendRow(m.row); written++; });
    refused += p.blocked.length;
    lines.push(p.title + ' : ' + p.missing.length + ' added to ' + p.dest +
      (p.blocked.length ? ', ' + p.blocked.length + ' refused' : ''));
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
  });

  forgetTabsV1_();
  auditV1_('BACKFILL', whoIsAskingV1_(), written + ' rows written, ' + refused + ' refused');

  lines.push('');
  lines.push(written + ' row(s) written, ' + refused + ' refused.');
  lines.push('Every row carries the form response id it came from, so running');
  lines.push('this again adds nothing.');
  return noteV1_(lines.join('\n'));
}


/* ======================================================================
 * 80_Import.gs
 * ====================================================================== */

/**
 * The one production write in this project, and the way back out of it.
 *
 * Everything else here refuses to touch the live tracker. This does not, and
 * that is the whole reason it lives in its own file with its own gate.
 *
 * WHAT IT DOES
 *   Appends form responses that never reached a tab. Additive only. It never
 *   edits a cell that already has a value, never deletes a row, never touches
 *   the trainee master, the validation queue, or any decision column.
 *
 * WHAT STOPS IT
 *   A script property whose value must be the id of the spreadsheet it is
 *   about to write to. Not "YES", not "true" - the id itself, typed by hand.
 *   A confirmation left over from the sandbox therefore cannot fire against
 *   production, because it names the wrong book.
 *
 * HOW IT COMES BACK OUT
 *   Every run writes a manifest to PORTAL BACKFILL LOG: which response went
 *   into which row, and what the sheet's row count was before and after.
 *   undoLastBackfill() re-reads each of those rows, checks it still carries
 *   the response id the manifest says it should, and removes only those. If
 *   one row does not match, nothing is deleted at all.
 */

var PORTAL_BACKFILL_CONFIRM = 'PORTAL_BACKFILL_CONFIRM';
var PORTAL_BACKFILL_LOG = 'PORTAL BACKFILL LOG';

/** The before picture. Writes nothing, in any mode, against any book.
 *  This is the thing to run first and to keep. */
function backfillBeforeAndAfter() {
  var plans = backfillPlanAllV1_().filter(function (p) {
    return p.missing.length || p.blocked.length || p.problem; });

  var lines = ['BEFORE AND AFTER  (nothing has been written)', '',
    'Target : ' + safeTargetNameV1_(),
    'Id     : ' + safeTargetIdV1_(),
    'Mode   : ' + safeModeV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'Google is not naming this account'),
    ''];

  if (!plans.length) {
    lines.push('Every response on every registered form is already in the tracker.');
    lines.push('There is nothing to import.');
    return noteV1_(lines.join('\n'));
  }

  plans.forEach(function (p) {
    lines.push('=======================================================');
    lines.push(p.title + '  (' + p.key + ')');
    lines.push('=======================================================');
    if (p.problem) { lines.push('CANNOT IMPORT: ' + p.problem); lines.push(''); return; }

    var t = readTabV1_(p.dest);
    lines.push('');
    lines.push('BEFORE');
    lines.push('  ' + p.dest + ' holds ' + t.rows.length + ' rows');
    lines.push('  ' + p.present + ' of the form\'s ' + p.total + ' responses are already among them');
    lines.push('');
    lines.push('WOULD BE ADDED  (' + p.missing.length + ' rows, appended at the bottom)');
    p.missing.forEach(function (m, i) {
      lines.push('  ' + (i + 1) + '.  ' + (m.at ? m.at.toDateString() : 'no date') +
                 '   response ' + m.id);
      t.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = m.row[ci];
        if (v === '' || v === undefined) return;
        lines.push('        ' + labelForV1_(h) + ': ' + String(v).replace(/\n/g, ' / '));
      });
    });

    if (p.blocked.length) {
      lines.push('');
      lines.push('WOULD BE REFUSED  (' + p.blocked.length + ')');
      p.blocked.forEach(function (b) {
        lines.push('  ' + b.id + '  ' + b.why);
        b.answers.forEach(function (a) { lines.push('        ' + a.question + ': ' + a.value); });
      });
    }

    lines.push('');
    lines.push('AFTER');
    lines.push('  ' + p.dest + ' would hold ' + (t.rows.length + p.missing.length) + ' rows');
    lines.push('  nothing already in it would be changed or removed');
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push('To do it, set the script property');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' + safeTargetIdV1_());
  lines.push('and run runBackfillForReal(). Anything else and it refuses.');
  return noteV1_(lines.join('\n'));
}

function safeTargetIdV1_() { try { return targetIdV1_(); } catch (e) { return '(not set)'; } }

/** The gate. The confirmation must name the book about to be written to. */
function requireImportAuthorityV1_() {
  var id = targetIdV1_();
  var confirm = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_BACKFILL_CONFIRM) || '').trim();

  if (!confirm) {
    throw new Error('Refusing to write. Set the script property ' +
      PORTAL_BACKFILL_CONFIRM + ' to ' + id + ' first. Run ' +
      'backfillBeforeAndAfter() to see exactly what this would do.');
  }
  if (confirm !== id) {
    throw new Error('Refusing to write. ' + PORTAL_BACKFILL_CONFIRM + ' names ' +
      confirm + ' but this portal is pointed at ' + id + '. A confirmation for ' +
      'one spreadsheet will not fire against another.');
  }
  return id;
}

/** Imports the responses that never reached a tab, for real.
 *
 *  Refuses unless the confirmation names this exact spreadsheet. Refuses if
 *  any response cannot be placed in full, because a half-imported record is
 *  worse than one still sitting in the form. */
function runBackfillForReal() {
  var id = requireImportAuthorityV1_();
  var plans = backfillPlanAllV1_();

  var blocked = plans.reduce(function (n, p) { return n + p.blocked.length; }, 0);
  if (blocked) {
    throw new Error('Refusing to write. ' + blocked + ' response(s) have answers ' +
      'with nowhere to go, and importing the rest would leave the record ' +
      'half done. Run backfillBeforeAndAfter() to see which, add the column ' +
      'they need, then run this again.');
  }
  var due = plans.reduce(function (n, p) { return n + p.missing.length; }, 0);
  if (!due) return noteV1_('Nothing to import. Every response is already in the tracker.');

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], report = ['BACKFILL COMPLETE', '',
    'Target : ' + safeTargetNameV1_(), 'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  plans.forEach(function (p) {
    if (p.problem || !p.missing.length) return;
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { report.push(p.title + ' : SKIPPED, ' + p.dest + ' is not there'); return; }

    var beforeRows = sh.getLastRow();
    p.missing.forEach(function (m) {
      sh.appendRow(m.row);
      manifest.push([stamp, p.dest, sh.getLastRow(), m.id, p.key,
                     whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    });
    var afterRows = sh.getLastRow();

    report.push(p.title);
    report.push('  tab            : ' + p.dest);
    report.push('  rows before    : ' + beforeRows);
    report.push('  rows added     : ' + p.missing.length);
    report.push('  rows after     : ' + afterRows);
    report.push('  added at rows  : ' + (beforeRows + 1) + ' to ' + afterRows);
    report.push('  response ids   : ' + p.missing.map(function (m) { return m.id; }).join(', '));
    report.push('');
  });

  writeManifestV1_(manifest);
  forgetTabsV1_();

  report.push('Nothing already in the tracker was changed or removed. Every row');
  report.push('added carries the form response id it came from, so running this');
  report.push('again adds nothing.');
  report.push('');
  report.push('To reverse it: undoLastBackfill(). It checks every row still');
  report.push('carries the id the manifest says before removing anything.');
  return noteV1_(report.join('\n'));
}

/** The rollback manifest. Its own tab, created if missing, appended to only. */
function writeManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_BACKFILL_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_BACKFILL_LOG);
    sh.getRange(1, 1).setValue(
      'Rollback manifest for imported form responses. Do not edit or sort this tab.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 7)
      .setValues([['RUN', 'TAB', 'ROW', 'RESPONSE ID', 'FORM', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

/** Removes exactly the rows the last run added, and only if every one of them
 *  still carries the response id the manifest recorded. One mismatch and
 *  nothing is deleted, because a shifted row means the manifest no longer
 *  describes the sheet and guessing is how records get destroyed. */
function undoLastBackfill() {
  requireImportAuthorityV1_();
  var t = readTabV1_(PORTAL_BACKFILL_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('No import has been run against this spreadsheet.');

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];

  var entries = t.rows.filter(function (r) {
    return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               id: String(r[t.col['RESPONSE ID']] || '') };
    });
  if (!entries.length) return noteV1_('The manifest names no rows for the last run.');

  // verify every single one before touching any of them
  var book = targetBookV1_(), problems = [];
  entries.forEach(function (e) {
    var dest = readTabV1_(e.tab);
    if (!dest.ok) { problems.push(e.tab + ' is not in this spreadsheet'); return; }
    var idCol = responseIdColumnV1_(dest);
    if (!idCol) { problems.push(e.tab + ' has no response id column any more'); return; }
    var sh = book.getSheetByName(e.tab);
    var actual = String(sh.getRange(e.row, dest.col[idCol.toUpperCase()] + 1).getValue() || '').trim();
    if (actual !== e.id) {
      problems.push(e.tab + ' row ' + e.row + ' holds "' + actual + '", the manifest says "' + e.id + '"');
    }
  });

  if (problems.length) {
    return noteV1_('NOTHING WAS DELETED\n\n' +
      'The sheet no longer matches the manifest, so the rows this would remove ' +
      'are not certainly the rows it added:\n\n  ' + problems.join('\n  ') +
      '\n\nRemove them by hand using the response ids in ' + PORTAL_BACKFILL_LOG + '.');
  }

  // bottom up, so deleting one does not move the next
  entries.sort(function (a, b) { return b.row - a.row; });
  entries.forEach(function (e) { book.getSheetByName(e.tab).deleteRow(e.row); });
  forgetTabsV1_();

  return noteV1_('REVERSED\n\n' + entries.length + ' row(s) removed, the exact rows ' +
    'the run of ' + last + ' added. Every one was checked against its response id ' +
    'first.\n\nThe responses are back to being only in the form, which is where they ' +
    'were before.');
}

/** Clears the confirmation, so the gate closes behind you. */
function lockBackfill() {
  PropertiesService.getScriptProperties().deleteProperty(PORTAL_BACKFILL_CONFIRM);
  return noteV1_('Import is locked again. ' + PORTAL_BACKFILL_CONFIRM +
    ' has been cleared and nothing can be written until it is set once more.');
}


/* ======================================================================
 * 90_Staging.gs
 * ====================================================================== */

/**
 * Staging.
 *
 * setUpStaging() creates a NEW spreadsheet, fills it with invented people,
 * and points the portal at it. It never opens, reads, copies or references
 * the live tracker. Run it once; run it again for a fresh sandbox.
 */

function setUpStaging() {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var book = SpreadsheetApp.create('STG_SCEMS_Portal_Sandbox_' + stamp);

  function tab(name, headers, rows) {
    var sh = book.getSheetByName(name) || book.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1).setValue('STAGING — invented data. Not a personnel record.')
      .setFontWeight('bold').setFontColor('#a8342b');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    if (rows.length) {
      sh.getRange(PORTAL.HEADER_ROW + 1, 1, rows.length, headers.length).setValues(rows);
    }
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    return sh;
  }

  var d = function (s) { return new Date(s); };

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
     'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [
      ['Jamie Rivers','STG-01','Paramedic','A','Dana Whitlock', d('2026-06-01'),'Phase 2','Active','jamie.rivers@example.org', d('2026-07-15'),'A'],
      ['Alex Bramble','STG-02','EMT','A','Dana Whitlock', d('2026-05-04'),'Phase 3','Active','alex.bramble@example.org', d('2026-07-01'),'A'],
      ['Priya Okafor','STG-03','Advanced EMT','B','Marcus Vane', d('2026-04-12'),'Phase 4','Active','priya.okafor@example.org', d('2026-08-01'),'B'],
      ['Sam Ledger','STG-04','EMT','A','', '', '','Active','sam.ledger@example.org','','A'],
      ['Rosa Quill','STG-05','Paramedic','C','Marcus Vane', d('2026-01-06'),'Phase 4','Closed / Released','rosa.quill@example.org', d('2026-03-01'),'B']
    ]);

  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana.whitlock@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus.vane@example.org','Paramedic','Yes']]);

  tab(PORTAL.TAB.SKILLS,
    ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
     'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS'],
    [
      ['Jamie Rivers','IV access','I', d('2026-08-18'),'Dana Whitlock','Paramedic','SIGNED OFF','SIGNED OFF','Vascular','SK-1',5,3,3,2],
      ['Jamie Rivers','Intubation','A', d('2026-08-17'),'Dana Whitlock','Paramedic','READY FOR VALIDATION','','Airway','SK-2',4,2,2,2],
      ['Jamie Rivers','12-lead acquisition','A', d('2026-08-12'),'Dana Whitlock','Paramedic','IN PROGRESS','','Cardiac','SK-3',3,1,2,1],
      ['Jamie Rivers','Needle decompression','','','','Paramedic','NOT STARTED','','Trauma','SK-4',0,0,0,0],
      ['Alex Bramble','Bag-valve-mask','I', d('2026-08-15'),'Dana Whitlock','EMT','SIGNED OFF','SIGNED OFF','Airway','SK-5',6,4,4,2],
      ['Alex Bramble','Tourniquet','A', d('2026-08-16'),'Dana Whitlock','EMT','READY FOR VALIDATION','','Trauma','SK-6',3,3,3,2],
      ['Priya Okafor','Vascular access','I', d('2026-08-14'),'Marcus Vane','Advanced EMT','SIGNED OFF','SIGNED OFF','Vascular','SK-7',8,5,5,3]
    ]);

  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [
      [d('2026-08-17'),'Jamie Rivers','SK-2','Airway','Intubation','4 of 4 successful   2 of 2 independent   2 of 2 separate days   2 of 2 different FTOs','','','','','','OPEN', d('2026-08-17'),'STG-QR-1'],
      [d('2026-08-16'),'Alex Bramble','SK-6','Trauma','Tourniquet','3 of 3 successful   3 of 3 independent   3 of 3 separate days   2 of 2 different FTOs','','','','','','OPEN', d('2026-08-16'),'STG-QR-2']
    ]);

  tab(PORTAL.TAB.EVAL,
    ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE','SHIFT DATE','ASSESSMENT','TREATMENT',
     'COMMUNICATION','DOCUMENTATION','SCENE LEADERSHIP','PROFESSIONALISM','STRENGTH','IMPROVE'],
    [
      [d('2026-08-18'),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2', d('2026-08-18'),4,4,3,3,4,5,
       'Ran the airway on a long resuscitation without prompting and kept the crew calm throughout.',
       'Radio reports are still rushed. Practise the handover out loud before keying up.'],
      [d('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3', d('2026-08-16'),4,3,4,3,3,4,
       'Applied a tourniquet quickly and correctly on a chaotic scene.',
       'Slow down the primary survey. Say the findings out loud.'],
      // Deliberately the same day as the row above. The portal flags the pair
      // and keeps both, which is what it does with a real double submission.
      [d('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3', d('2026-08-16'),4,3,4,4,3,4,
       'Second submission for the same shift. Documentation rating corrected after review.',
       'Same as above. Filed again because the first had the wrong rating.']
    ]);

  tab(PORTAL.TAB.REFLECT, ['TIMESTAMP','TRAINEE','WHAT WENT WELL','WHAT WAS HARD','WHAT I WANT TO WORK ON'],
    [[d('2026-08-11'),'Jamie Rivers','The arrest finally felt like it clicked.',
      'Radio reports still rush me.','Slowing down my handover.']]);

  tab(PORTAL.TAB.URGENT, ['TIMESTAMP','CALLED?','YOUR NAME','TRAINEE INVOLVED','WHAT HAPPENED','ACTION TAKEN'],
    [[d('2026-08-17'),'Yes','Dana Whitlock','Alex Bramble',
      'Drew the correct medication at the wrong concentration. Caught on the second check before administration. No patient harm; the trainee identified it himself.',
      'Held from medication administration pending review.']]);

  tab(PORTAL.TAB.COACHING, ['DATE','TRAINEE','FROM','NOTE','ACKNOWLEDGED'],
    [[d('2026-08-18'),'Jamie Rivers','Dana Whitlock',
      'Radio reports still rushed. Practise MIST before keying up. Otherwise a strong shift.',''],
     [d('2026-08-16'),'Alex Bramble','Dana Whitlock',
      'Good tourniquet work. Slow the primary survey down.','YES']]);

  tab(PORTAL.TAB.EVIDENCE,
    ['EVENT DATE','TRAINEE','FTO','SKILL','SKILL ID','STAGE','OUTCOME','NOTE','SOURCE RESPONSE ID'],
    [
      [d('2026-08-17'),'Jamie Rivers','Dana Whitlock','Intubation','SK-2','Independent','Successful',
       'First-pass success on a difficult airway. Called for the bougie himself.','STG-R-104'],
      [d('2026-08-12'),'Jamie Rivers','Marcus Vane','Intubation','SK-2','Assisted','Successful',
       'Second attempt after a failed first pass. Recognised the problem and corrected the angle.','STG-R-098'],
      [d('2026-08-18'),'Jamie Rivers','Dana Whitlock','IV access','SK-1','Independent','Successful',
       'Two attempts, both patent, on a dehydrated patient with poor veins.','STG-R-106'],
      [d('2026-08-16'),'Alex Bramble','Dana Whitlock','Tourniquet','SK-6','Independent','Successful',
       'Applied high and tight without prompting. Time to control under a minute.','STG-R-101']
    ]);

  tab(PORTAL.TAB.SIGNOFF,
    ['SIGN-OFF DATE','TRAINEE','SKILL','SKILL ID','SIGNED OFF BY','RATIONALE'],
    [[d('2026-08-18'),'Jamie Rivers','IV access','SK-1','chief@example.org',
      'Five successful attempts across three separate shifts with two different FTOs. Watched the last one myself.']]);

  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);

  var props = PropertiesService.getScriptProperties();
  forgetTabsV1_();
  props.setProperty(PORTAL.PROPERTY_TARGET, book.getId());
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);
  // Remembered so pointAtStaging() can bring you back from production
  // without rebuilding the sandbox and losing what you were looking at.
  props.setProperty('PORTAL_STAGING_SPREADSHEET_ID', book.getId());
  // Off in staging. A sandbox user tapping a form card would otherwise land
  // on the real production form, and a submission there is a live write.
  props.setProperty('PORTAL_FORM_LINKS', 'OFF');

  var me = whoIsAskingV1_();
  if (me) {
    props.setProperty('PORTAL_DIVISION_EMAILS', me);
    props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));
  }

  var msg = 'STAGING READY\n\n' +
    'Spreadsheet : ' + book.getName() + '\n' +
    'Link        : ' + book.getUrl() + '\n\n' +
    'The portal now points at this sandbox. Five invented trainees, two\n' +
    'invented FTOs. Nothing here is a personnel record and nothing of yours\n' +
    'was opened to build it.\n\n' +
    (me ? 'You (' + me + ') are set as Training Division so you can see that view.\n' +
          'To try another role, run viewAsTrainee, viewAsFTO, viewAsDivision,\n' +
          'viewAsSupervisor or viewAsMedical.\n\n' : '') +
    'Form links are OFF here, so the cards show without opening the real\n' +
    'production forms. Run enableFormLinks() if you want them live.\n\n' +
    'Next: Deploy > New deployment > Web app, then open the URL.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Lets one account preview another role while testing in staging.
 *  Refuses outside staging, so it can never become a production backdoor. */
function switchRoleForTestingV1(role) {
  requireWritableV1_('switch role');
  var r = String(role || '').toUpperCase();
  var props = PropertiesService.getScriptProperties();
  var me = whoIsAskingV1_();
  if (!me) throw new Error('Google is not naming this account, so there is nothing to switch.');

  props.setProperty('PORTAL_DIVISION_EMAILS', '');
  props.setProperty('PORTAL_MEDICAL_EMAILS', '');
  props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));

  var book = targetBookV1_();
  function setCell(tabName, findCol, matchRow, emailCol) {
    var sh = book.getSheetByName(tabName);
    if (sh) sh.getRange(matchRow, emailCol).setValue(me);
  }

  if (r === 'DIVISION')        props.setProperty('PORTAL_DIVISION_EMAILS', me);
  else if (r === 'MEDICAL')    props.setProperty('PORTAL_MEDICAL_EMAILS', me);
  else if (r === 'SUPERVISOR') props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({ me: 'A' }).replace('"me"', '"' + me + '"'));
  else if (r === 'FTO')        setCell(PORTAL.TAB.ROSTER, 'EMAIL', PORTAL.HEADER_ROW + 1, 2);
  else if (r === 'TRAINEE')    setCell(PORTAL.TAB.MASTER, 'TRAINEE EMAIL', PORTAL.HEADER_ROW + 1, 9);
  else throw new Error('Use TRAINEE, FTO, DIVISION, SUPERVISOR or MEDICAL.');

  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  var msg = 'You are now viewing as ' + r + '. Reload the portal.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Where is this portal pointed, and can it write. Read-only. */
function portalStatusV1() {
  var id = '';
  try { id = targetIdV1_(); } catch (e) { id = '(not set)'; }
  var msg = 'PORTAL STATUS\n\n' +
    'Version   : ' + PORTAL.VERSION + '\n' +
    'Mode      : ' + safeModeV1_() + (mayWriteV1_() ? '  (writes allowed)' : '  (READ ONLY)') + '\n' +
    'Target    : ' + id + '\n' +
    'Signed in : ' + (whoIsAskingV1_() || '(Google is not saying)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Role preview, one click each
 *
 *  The Run dropdown cannot pass arguments, so each role gets its own
 *  no-argument function. Pick one, run it, reload the portal.
 *  All of them refuse outside staging.
 * ---------------------------------------------------------------- */

function viewAsTrainee()    { return switchRoleForTestingV1('TRAINEE'); }
function viewAsFTO()        { return switchRoleForTestingV1('FTO'); }
function viewAsDivision()   { return switchRoleForTestingV1('DIVISION'); }
function viewAsSupervisor() { return switchRoleForTestingV1('SUPERVISOR'); }
function viewAsMedical()    { return switchRoleForTestingV1('MEDICAL'); }


/* ======================================================================
 * Index.html — the page, in chunks
 * ====================================================================== */

/** The page. Built from portal/Index.html; do not edit it here.
 *  30_WebApp.gs prefers this constant over an HTML file when it exists,
 *  which is what makes the single-file paste work.
 *
 *  Cut into short pieces on purpose. Joined with no separator, so the
 *  newlines are inside the pieces and the page comes back exactly. */
var PORTAL_PAGE_HTML = [
  "<!DOCTYPE html>\n",
  "<html>\n",
  "<head>\n",
  "<base target=\"_top\">\n",
  "<meta charset=\"utf-8\">\n",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Barlow+Semi+Condense",
  "d:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap\">\n",
  "<style>\n",
  ":root{\n",
  "  --navy:#12233b; --navy-2:#1b3454;\n",
  "  --paper:#fff; --surface:#f5f7fa; --line:#dfe5ec;\n",
  "  --ink:#12233b; --ink-2:#4a5a70; --ink-3:#7b8798;\n",
  "  --emt:#2f7d4f; --aemt:#1f5f9e; --pmd:#a8342b; --gold:#b08a2e;\n",
  "  --ok:#2f7d4f; --ok-bg:#eef6f0;\n",
  "  --warn:#8a6a14; --warn-bg:#fdf6e4;\n",
  "  --stop:#a8342b; --stop-bg:#fbeeec;\n",
  "  --shadow:0 1px 2px rgba(18,35,59,.07),0 10px 28px -18px rgba(18,35,59,.45);\n",
  "}\n",
  "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){\n",
  "  --navy:#0d1826; --navy-2:#16283f;\n",
  "  --paper:#161d27; --surface:#111821; --line:#2b3646;\n",
  "  --ink:#e9eef5; --ink-2:#b3bfcf; --ink-3:#7d8a9c;\n",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e08b82; --gold:#d6ad50;\n",
  "  --ok:#6bbd8a; --ok-bg:#16261d; --warn:#d6ad50; --warn-bg:#272113;\n",
  "  --stop:#e08b82; --stop-bg:#2a1917;\n",
  "  --shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px -18px rgba(0,0,0,.9);\n",
  "}}\n",
  ":root[data-theme=\"dark\"]{\n",
  "  --navy:#0d1826; --navy-2:#16283f;\n",
  "  --paper:#161d27; --surface:#111821; --line:#2b3646;\n",
  "  --ink:#e9eef5; --ink-2:#b3bfcf; --ink-3:#7d8a9c;\n",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e08b82; --gold:#d6ad50;\n",
  "  --ok:#6bbd8a; --ok-bg:#16261d; --warn:#d6ad50; --warn-bg:#272113;\n",
  "  --stop:#e08b82; --stop-bg:#2a1917;\n",
  "  --shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px -18px rgba(0,0,0,.9);\n",
  "}\n",
  "*{box-sizing:border-box;}\n",
  "html,body{margin:0;background:var(--surface);color:var(--ink);\n",
  "  font-family:\"Source Sans 3\",system-ui,-apple-system,sans-serif;font-size:16px;line-heigh",
  "t:1.55;\n",
  "  -webkit-font-smoothing:antialiased;}\n",
  ".app{max-width:520px;margin:0 auto;background:var(--paper);min-height:100vh;box-shadow:var",
  "(--shadow);}\n",
  "@media(min-width:560px){.app{margin:24px auto;border-radius:14px;overflow:hidden;min-heigh",
  "t:0;}}\n",
  ".bar{background:var(--navy);color:#fff;padding:14px 18px;display:flex;align-items:center;g",
  "ap:12px;\n",
  "  position:sticky;top:0;z-index:20;}\n",
  ".bar img{width:34px;height:37px;display:block;flex:none;}\n",
  ".bar .t{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.06rem;l",
  "ine-height:1.1;}\n",
  ".bar .s{font-size:.72rem;color:#9fb2c9;letter-spacing:.13em;text-transform:uppercase;font-",
  "weight:600;\n",
  "  font-family:\"Barlow Semi Condensed\",sans-serif;}\n",
  ".mode{margin-left:auto;font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.66rem;let",
  "ter-spacing:.12em;\n",
  "  text-transform:uppercase;font-weight:700;padding:3px 9px;border-radius:3px;\n",
  "  background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);}\n",
  ".wrap{padding:20px 18px 44px;}\n",
  "h1{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.6rem;line-he",
  "ight:1.12;margin:0 0 4px;}\n",
  ".sub{color:var(--ink-3);font-size:.94rem;margin:0 0 20px;}\n",
  "h2{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:.8rem;letter-s",
  "pacing:.14em;\n",
  "  text-transform:uppercase;color:var(--ink-3);margin:26px 0 10px;}\n",
  "h2:first-of-type{margin-top:4px;}\n",
  ".card{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:14px ",
  "15px;margin-bottom:9px;}\n",
  ".card.act{display:flex;gap:13px;align-items:flex-start;width:100%;text-align:left;cursor:p",
  "ointer;font:inherit;color:inherit;text-decoration:none;}\n",
  ".card.act:hover,.card.act:focus-visible{border-color:var(--ink-3);}\n",
  ".dot{flex:none;width:9px;height:9px;border-radius:50%;margin-top:7px;background:var(--ink-",
  "3);}\n",
  ".dot.due{background:var(--stop);}.dot.soon{background:var(--warn);}.dot.ok{background:var(",
  "--ok);}\n",
  ".bd{flex:1;min-width:0;}\n",
  ".h{font-weight:700;font-size:1rem;line-height:1.3;}\n",
  ".m{font-size:.86rem;color:var(--ink-3);line-height:1.35;margin-top:2px;}\n",
  ".go{flex:none;color:var(--ink-3);font-size:1.3rem;line-height:1;margin-top:4px;}\n",
  ".panel{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:15",
  "px 16px;margin-bottom:14px;}\n",
  ".lab{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacing:.13em;",
  "\n",
  "  text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:7px;}\n",
  ".kv{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px so",
  "lid var(--line);font-size:.93rem;}\n",
  ".kv:last-child{border-bottom:none;}\n",
  ".kv .k{color:var(--ink-3);}.kv .v{font-weight:600;text-align:right;}\n",
  ".chip{display:inline-block;font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:600;",
  "font-size:.7rem;\n",
  "  letter-spacing:.09em;text-transform:uppercase;padding:2px 8px;border-radius:3px;border:1",
  "px solid currentColor;}\n",
  ".c-emt{color:var(--emt);}.c-aemt{color:var(--aemt);}.c-pmd{color:var(--pmd);}\n",
  ".c-ok{color:var(--ok);background:var(--ok-bg);}.c-warn{color:var(--warn);background:var(--",
  "warn-bg);}\n",
  ".c-stop{color:var(--stop);background:var(--stop-bg);}.c-mute{color:var(--ink-3);}\n",
  ".prog{height:7px;background:var(--line);border-radius:4px;overflow:hidden;margin:9px 0 5px",
  ";}\n",
  ".prog i{display:block;height:100%;border-radius:4px;background:var(--emt);}\n",
  ".big{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:1.9rem;font-weight:700;line-",
  "height:1;}\n",
  ".big small{font-size:1rem;color:var(--ink-3);font-weight:600;}\n",
  ".btn{display:block;width:100%;text-align:center;background:var(--navy);color:#fff;border:n",
  "one;border-radius:9px;\n",
  "  padding:15px;font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.",
  "05rem;cursor:pointer;margin-top:8px;}\n",
  ".btn:hover{background:var(--navy-2);}\n",
  ".btn.ghost{background:none;color:var(--ink-2);border:1px solid var(--line);}\n",
  ".btn[disabled]{opacity:.5;cursor:not-allowed;}\n",
  "textarea{width:100%;min-height:96px;border:1px solid var(--line);border-radius:8px;padding",
  ":11px 12px;\n",
  "  font:inherit;color:inherit;background:var(--paper);resize:vertical;}\n",
  "textarea:focus{outline:2.5px solid var(--gold);outline-offset:1px;}\n",
  ".note{border-radius:8px;padding:13px 15px;margin:0 0 14px;font-size:.9rem;}\n",
  ".note b{display:block;font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.74rem;lett",
  "er-spacing:.13em;\n",
  "  text-transform:uppercase;margin-bottom:5px;}\n",
  ".n-ok{background:var(--ok-bg);border:1px solid var(--ok);}.n-ok b{color:var(--ok);}\n",
  ".n-warn{background:var(--warn-bg);border:1px solid var(--warn);}.n-warn b{color:var(--warn",
  ");}\n",
  ".n-stop{background:var(--stop-bg);border:1px solid var(--stop);}.n-stop b{color:var(--stop",
  ");}\n",
  ".n-info{background:var(--surface);border:1px solid var(--line);}.n-info b{color:var(--ink-",
  "3);}\n",
  ".next{border-left:3px solid var(--gold);padding-left:12px;margin:16px 0;font-size:.9rem;co",
  "lor:var(--ink-2);}\n",
  ".next b{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacing:.13",
  "em;\n",
  "  text-transform:uppercase;color:var(--gold);display:block;margin-bottom:3px;}\n",
  ".back{background:none;border:none;color:var(--ink-3);font-family:\"Barlow Semi Condensed\",s",
  "ans-serif;\n",
  "  font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;cursor:poin",
  "ter;padding:0;margin:0 0 12px;}\n",
  ".back:hover{color:var(--ink);}\n",
  "/* record screen: current at the top, everything earlier below it */\n",
  ".rec{border:1px solid var(--line);border-radius:9px;padding:14px 15px;margin-bottom:9px;ba",
  "ckground:var(--paper);}\n",
  ".rec.cur{border-left:4px solid var(--gold);}\n",
  ".rec.dup{border-left:4px solid var(--stop);}\n",
  ".rec .when{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.74rem;letter-spacing:",
  ".12em;\n",
  "  text-transform:uppercase;color:var(--ink-3);display:flex;justify-content:space-between;g",
  "ap:10px;}\n",
  ".rec .when b{color:var(--gold);font-weight:700;}\n",
  ".rec .fld{margin-top:9px;}\n",
  ".rec .fld .l{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacin",
  "g:.11em;\n",
  "  text-transform:uppercase;color:var(--ink-3);}\n",
  ".rec .fld .v{font-size:.94rem;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere",
  ";}\n",
  ".fresh{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 14px;}\n",
  ".fresh span{font-size:.78rem;color:var(--ink-2);background:var(--surface);\n",
  "  border:1px solid var(--line);border-radius:20px;padding:3px 11px;}\n",
  ".fresh span b{color:var(--ink);font-weight:600;}\n",
  ".fresh span.never{color:var(--ink-3);}\n",
  ".more{background:none;border:1px solid var(--line);border-radius:7px;width:100%;padding:10",
  "px;\n",
  "  font:inherit;font-size:.88rem;color:var(--ink-2);cursor:pointer;margin-bottom:12px;}\n",
  ".more:hover{border-color:var(--ink-3);color:var(--ink);}\n",
  ".foot{padding:20px 18px 32px;border-top:1px solid var(--line);color:var(--ink-3);font-size",
  ":.8rem;background:var(--surface);}\n",
  ":focus-visible{outline:2.5px solid var(--gold);outline-offset:2px;}\n",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;}}\n",
  "</style>\n",
  "</head>\n",
  "<body>\n",
  "<div class=\"app\">\n",
  "  <div class=\"bar\">\n",
  "    <!-- The county badge at 102x111, shown at 34x37, which is three times\n",
  "         the display size and still sharp. The full-resolution copy lives in the\n",
  "         tracker; a 49,000-character line in here made the file that has to be\n",
  "         pasted into Apps Script fragile enough to break on the way in. -->\n",
  "    <img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGYAAABvCAMAAAApDkWYAAABgFBMVE",
  "UAAAAAAAC6wbr0+Pfk6um2u7fT2Nb9/v7EysYnKCgXFxc2NzdGSEiVl5ZmaGhVV1amqah1d3fd4+GGh4fr8fDs8/Hs",
  "8vHs8vHr8fG9w8Hs8/Ha4N7n6Oh+gYGeoqHl6+uqqqrc3Nzo7u3n7ezp7u3p7u7m7eycoZ1eYGC/v7+4//8/QEHMzM",
  "zX1/bZ6enV//9/f398gXydn6C5v8DZ3+AeHyAfICAA/wAA//8gIB8+QD5VVVVcX2Cqqv+2ttqq1NSq/6rAx78AAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9M5mmAAAAgHRSTlP/AP7+/v7+A/",
  "7//////v///v/+/9CwTHCP/jH+E//+LAMJ1qtMcZD//wQD/wULEAYC////////AQH//wP/AwcGA/8AAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5YO4UAAAvTSURBVHjanZ",
  "oHf9o8E8ANGpa8BxAghGa0TdP5rHfv7/+l3rvTsGzLhEb9lQA2+vumTiNZXWxp+kJ/fzkddzcfn7aPj9y2x83244fd",
  "7niy96XppX6SS4wX+mm6+7DdQMcs0gC33d8cv1vUz2PMb067/Wbon0upDgLb+qBk5y8A68Px3/ijz3/9GQwxfjl+2H",
  "LXvyjb+ovOkqBleVH157XkFrXfnfzjXYEh4b8enRhS3NU66JxespBWlcrcCqSHOCiJCnK8MQwu7oqgx6IRXGDPHORT",
  "oin7tjZXdHWWRNrsj/D7l/QyBiEPO6Mr2VRGCt2WQiDtNyTDGz34gCKB6L6iJBLf7l5mIiVTCAiCN9+eay9GgV+08E",
  "bgG+wyL+oWn6NRPd5QMtGT1EV5SyLdnCagZALZkyCiMgxNLI3fSXij8Fph2DljpXsOI4VocxCsOhgQdJZGMPfwpdFW",
  "V9qeEnji2ndTo0lAnspcqxnrE0/kyrhbQRakRyWJJpiUIGSRVjt/wq6ahJQlFRNokpa7ziujR/s0LThBqYxGQfySk0",
  "QPXnOJVxdBDp/sbb3VBlocdC+hqxyeupBM+L6tXGgy031OsreNTjID2jkTIWaA1F4LMjG2pb6QoVhZMK6FvZL03kro",
  "d+UQWqBaJgoAYY/bo9FcgriHPflm7QMEni+3PibMn6JivGQcwDxzT5B79aFZlHE25JvOcnRMvv+OnAT+gwtzJuGx86",
  "pvC6sRpzXUBxolI8ORYHSlcZrCd6Wxem2FaRu8N09qBR2D5lKUZgvvOzAn0c3ja6e1nrQGP22wN7hWW+cD5+baKQnu",
  "zYpWSJTmjhw9b0yEgctwtr9PkxNSSk1uhQ5lwkFYzefG1xREe06X8kFOq73CB1BmhXG6wxt1A93frJIdpKfC5ikIxl",
  "pS1FTut5LhM5JFBH6nlaqsNNYXwEjlkPfQMmUe9lDBUPU9ebJaKIY4gPY3bnsxztrja1G2eZCYtR5SAGQAY//MpGpV",
  "VdxpF7TNd8nW2hTMwfu2L8uysnbtDZxyZaGTpZa3wmbzgp6nzE2udgGG1kIM965jm9RkFNaQx1STbuumgces6NVJVv",
  "SK7kRhNDmQUF43oL6bZOMwSWkeyj5Hb8fNekphzZnlLSsFG13SNVioNAZRZnzwv2D75NE5Jo26udaFiZWkUlI1VTbV",
  "UcPw9Q/ox+S7UbNpp/EZwmI+gjTdRO9DfMdaybRu8gPP8mEgGFpV+VyaBMPVU8LIY8mWDWmo4C4iok1LcFCd846rol",
  "m4z2X2AMM9pkWX72NWH7cvFGYFvC4JnQ9uhp842yYuQIy2yNGWKZmurd0zASUHZEAdFaiVMpAf8lqIMVav45rQdd8o",
  "qMkOQX1AFdz6ORJTWeCFujOYLHmlZbWtxDh3SodxwTbG6ld+DekPPO0VjK6ajgim08aFNvfNZBFRL/VjMJ2+xMBMwo",
  "MmSmpCYevwG/OY4F2yLC5Is4jJZgzOb9fUv1pTxX6L8imrRSzdVZ/HMJsg2UxaUXZTBrTO9A9zAmy3gxp7ZgzFDtPu",
  "yAW2cUy9jjAIY5oaML1L99Z67RSDDv00yj8uolQc4jESpiIOY8Ls4DHT7iA8n5KPEYeEC5xfxNg3hMmdnW2bmpqSzU",
  "0ktxxYN+6cjTFiDUWKwxgP0v5WGclwH6EWYHcz/AhxCxrqQozAGaG0GOtoOZPS3C7iGD5L6FWAgWiAh28VGzACUg5M",
  "Qh3GdNsqcTA/mA0PNHoe5/yWDYzySwUd/k/JwaEVzHShWRegbotGCcQPHjHqjn1ITnw0oo4wEgbPzESIsCCQpuuEgL",
  "rKYaokL5Wiu7qYo2H1tUu+zpOaw5AL9spyhLo1GELxAfMrQIR5FO8R45GbH5PVPD7rAFNYCvmX6lAIztfi1kjTsU6t",
  "LWRtrKZmQQh2PSWreeDkDgMVUbP2GJRIQpeSK4eR6B/BDcA9x1La12T1gU3TQyZ92mhV2AmCUDXd2tpmPb4K12apBq",
  "NzCzOCHZ9VQoJZaTK1nje0v8PMrs3qOvJnwERcrbSYplTRzni3hFkf9NzR2A4w/5qPOC4+b6M9gaYg4mX0CYSqYo6G",
  "s7XtLEc7H7gdnGiqN46OEHkAkUc84ISYZR/gC89sMDxC4XdRD0gBs+wDiyCDUTNd8vmg0qIHICad11Bh8uRyLa6QBi",
  "Guypk8McxxYYobMc6gtTiIMDLIDxYyL8ZwuEsR8xmNc5fE880CCDFy+AgJhy8MNsY04ND/XUXGAgwqNxiYd3Ikjgw/",
  "q9YVh361yLc7NM0LLaZ827DZAA7TEFBD1+HIQlXfCCNH7qzaMszp86i5R8z9ah+da8BcWWe0qqnYSGmzqFF+1NOR4u",
  "nBLA2BS7O51kKemltmhHEuMB8FwJ33IIdZ6Do9RrQWTJ0njhbNARQ1ZWQyeqSloZXVWrsAKZ4jWVrGUg3kgHpe8JHO",
  "7Hrakbnp0fQ+N8xPOVzFUurz38c/7ykF+EXIH4/R2bPuVTx5UnUTuaBUmU9i8zhg0tUNi02/a7mUoRcwYLZqHHzbVT",
  "qsdeLY1kUmWwvD2iJGqOeJA7wPMItOoOfq9xh6glktkI8TzeZbugoxR8Zjc9BqIs5QkSnzdwQS6tfxuot1gGEdGtN0",
  "bD1gEjPtF1eC0seiWo88TmQjb+YsnWLes/mUIZmUgzACa2No2dn6QvcDSKh6QRi/eL8oTlDc4qbKCLNGS+TPa1dml+",
  "PQ5PyUzjC7uHWCUh193jiFshht1uGcYvWSMMNWRLp6imecWvnMeOcwQgUYqJHlQUxrJ5iLMS9MiHnHeCx2knK9lq6m",
  "HjDKYbQdXtfjZS8RChPs35A4ZQzjpoRYMXiMdJhPdkiT+aRoeRyECTEpiBPLbCKcIzuM9BhfCU9qFrYL9onC3Sicg0",
  "SGNzfvpLJF+yQpLObA+HwyCIXzU3Q3CsU5bSJTR19Mmd0DNxIIK03mNJpP7P9uAUMxOp/UDTP+c4A5OE+zs/txhaZg",
  "VguV2dJOIcZos7RKQMWcHuVR7Seqo5/BaLZ5SC9sSKZsprZPHoMXtHJLUDAVxXxsl4TGK8ITlU23VykXTOrgdrTmo+",
  "2CHTRRPmu/VhOYBr3sZpVe3MXFgUdNZlvWyNZqvf1sSj9nOTXKMts0vYwhbysn4WwXjr15TdPDxloY1yC9KZoubX1T",
  "zhmZp6iqqm3bu958mT035wab3QQS+Onc5KFhdqv01R129GpWJG9sGgyzn1Ei5wXQPPxWj5ahC9PgWek1KWr6k9VVW+",
  "vJUhzbfk6vwaQpRI/KRkv+pmW0g5+bL3RS89kOz5nxTToXJnr6YZVuxnsJuKMFrTGYijYtII92TOJ+PvtzEJeziFk+",
  "y2Hc4Bxi5PAO4l0w3ErK4EOdgYNkQfZ3hdk1R0aMG5ShNIfD76qnQwJMQqyUqDRyddGGM8lZXF48mfIZs0F4HsBu/c",
  "G7VrGeHVpUWtb/4Xb8nCvvRwnz1XM2lHXcxBdVlePUDd/VJT5ARZhMF33n5scFj7ry5eM8WL07eXLaGMN/4AL1J2b2",
  "27OaYt9uChNlu3hwaPnUEHFKpzSzgwKYf6K3Zag03HNvcCMhf5Vy4QzUwPFxg5gqwbM2pLSCtmtl7SgPf0nfcNTKcD",
  "B+ctvwna4bPKhUUBLLiyLPrI9tH1ZvOGrl/UDpyS6JP4ISVkts++MC5SLGxs+oAKvUaFvbp/79yyXKZQzmg80ka2nc",
  "GD1k4yVL9OQ3H4Mz00U8HTFEusbjCb8FR7oyYWL/IuU1DHB+wLjAXH18/l3lNcsKyVu/oUTD2GXKqxjUODqcnVQqed",
  "Y504deG0XSWPBulb7Wy6uYVXqPazqM0xj9qZVtwTJVZYUz/uYKyhUYcoStUVymGllp9qeqk1D+ZefXwuWnMNDPf9BA",
  "GO+fQHl4BqOwZrlZXUO5DoMW3uHRoiYIVTx7Asa/v4ZyJQY5JxSoc6UVKewqs/wMhlTzHgUyy+aQNSEmH66lXI9Bj/",
  "uGR/54mZljK+9XV1N+AmPOsdHhL7T99t2rMflGDPb7D3NQ8loPexOGukZX+DlRoP0f5fOq4z32+bYAAAAASUVORK5C",
  "YII=\" alt=\"Sumter County EMS\">\n",
  "    <div><div class=\"s\">Sumter County EMS</div><div class=\"t\">Field Training</div></div>\n",
  "    <span class=\"mode\" id=\"mode\">…</span>\n",
  "  </div>\n",
  "  <div class=\"wrap\" id=\"view\"><p class=\"sub\">Loading…</p></div>\n",
  "  <div class=\"foot\" id=\"foot\"></div>\n",
  "</div>\n",
  "\n",
  "<script>\n",
  "// <?!= ?> prints raw. <?= ?> HTML-escapes, which turns every quote in this\n",
  "// JSON into &quot; and makes the line invalid JavaScript - the page then sits\n",
  "// on \"Loading\" forever because the script died before render() ran.\n",
  "var BOOT = <?!= boot ?>;\n",
  "var S = { screen: 'main', ctx: null, busy: false };\n",
  "\n",
  "function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g,function(c){\n",
  "  return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }\n",
  "function lvlChip(k,l){ return '<span class=\"chip c-'+esc(k||'emt')+'\">'+esc(l||'')+'</span",
  ">'; }\n",
  "function el(id){ return document.getElementById(id); }\n",
  "/* A name ends up inside onclick=\"...\", so it has to survive two parsers: the\n",
  "   HTML attribute and the JavaScript string inside it. JSON.stringify handles\n",
  "   the quotes and backslashes; esc() handles the angle brackets and the\n",
  "   double quote that would end the attribute. */\n",
  "function jsStr(v){ return esc(JSON.stringify(String(v==null?'':v))); }\n",
  "\n",
  "function render(){\n",
  "  el('mode').textContent = BOOT.mode === 'STAGING' ? 'Staging' : BOOT.mode;\n",
  "  el('foot').innerHTML = BOOT.mode === 'STAGING'\n",
  "    ? 'Staging sandbox. Invented people. Nothing here is a personnel record.'\n",
  "    : 'Signed in as ' + esc(BOOT.viewer.email || 'unknown') + ' &middot; ' + esc(BOOT.vers",
  "ion);\n",
  "\n",
  "  var v = BOOT.viewer, d = BOOT.data || {};\n",
  "  if (BOOT.error) return paint('<h1>Something went wrong</h1><div class=\"note n-stop\"><b>E",
  "rror</b>'+esc(BOOT.error)+'</div>');\n",
  "  if (!v.ok) return paint(\n",
  "    '<h1>You are not set up yet</h1>'+\n",
  "    '<p class=\"sub\">'+esc(v.why || 'This account is not recognised.')+'</p>'+\n",
  "    '<div class=\"note n-info\"><b>What to do</b>Ask the Training Division to add '+\n",
  "    esc(v.email || 'your account')+' to the roster or the trainee master. Nothing is broke",
  "n.</div>');\n",
  "\n",
  "  if (S.screen === 'reflect')  return paintReflect();\n",
  "  if (S.screen === 'receipt')  return paintReceipt();\n",
  "  if (S.screen === 'signoff')  return paintSignoff();\n",
  "  if (S.screen === 'trainee')  return paintTraineeSheet();\n",
  "  if (S.screen === 'person')   return paintPersonSheet();\n",
  "  if (S.screen === 'record')   return paintRecord();\n",
  "\n",
  "  switch (v.role) {\n",
  "    case 'TRAINEE':            return paintTrainee(d);\n",
  "    case 'FTO':                return paintFto(d);\n",
  "    case 'TRAINING_DIVISION':  return paintDivision(d);\n",
  "    case 'SUPERVISOR':         return paintSupervisor(d);\n",
  "    case 'MEDICAL_DIRECTOR':   return paintMedical(d);\n",
  "    default:                   return paint('<h1>No role</h1>');\n",
  "  }\n",
  "}\n",
  "function paint(h){ el('view').innerHTML = h; window.scrollTo(0,0); }\n",
  "\n",
  "/* ---------------- trainee ---------------- */\n",
  "function paintTrainee(d){\n",
  "  if (d.error) return paint('<h1>No record</h1><div class=\"note n-stop\"><b>Not found</b>'+",
  "esc(d.error)+'</div>');\n",
  "  var h = '<h1>'+esc(d.name)+'</h1><p class=\"sub\">'+lvlChip(d.levelKey,d.level)+\n",
  "    ' &nbsp; '+esc(d.phase)+'</p>';\n",
  "  h += '<div class=\"panel\"><div class=\"lab\">Skills signed off</div><div class=\"big\">'+d.si",
  "gned+\n",
  "       ' <small>of '+d.applicable+'</small></div><div class=\"prog\"><i style=\"width:'+d.per",
  "cent+\n",
  "       '%;background:var(--'+esc(d.levelKey)+')\"></i></div>'+\n",
  "       '<div style=\"font-size:.85rem;color:var(--ink-3)\">'+\n",
  "       (d.waiting.length ? d.waiting.length+' waiting on the Training Division' : 'Nothing",
  " waiting on anyone else')+\n",
  "       '</div></div>';\n",
  "\n",
  "  h += '<h2>Waiting on you</h2>';\n",
  "  // In staging the reflection is filed in the portal so the flow can be\n",
  "  // tried end to end. Against the live tracker the existing self-reflection\n",
  "  // form is the one that files it, because that form already has a trigger\n",
  "  // and a destination and this portal must not become a second writer.\n",
  "  if (canWrite()){\n",
  "    h += '<button class=\"card act\" onclick=\"S.screen=\\'reflect\\';render()\"><span class=\"do",
  "t due\"></span>'+\n",
  "         '<span class=\"bd\"><span class=\"h\">Weekly reflection</span>'+\n",
  "         '<span class=\"m\">Your own words. Takes about four minutes.</span></span><span cla",
  "ss=\"go\">&rsaquo;</span></button>';\n",
  "  }\n",
  "  h += formCards(d.forms);\n",
  "  (d.coaching||[]).forEach(function(c){\n",
  "    if (canWrite()){\n",
  "      h += '<button class=\"card act\" onclick=\"ack('+c.row+')\"><span class=\"dot soon\"></spa",
  "n>'+\n",
  "           '<span class=\"bd\"><span class=\"h\">Coaching from '+esc(c.from)+'</span>'+\n",
  "           '<span class=\"m\">'+esc(c.text)+'</span></span><span class=\"go\">&rsaquo;</span><",
  "/button>';\n",
  "    } else {\n",
  "      h += '<div class=\"card\"><div class=\"h\">Coaching from '+esc(c.from)+'</div>'+\n",
  "           '<div class=\"m\">'+esc(c.text)+'</div></div>';\n",
  "    }\n",
  "  });\n",
  "\n",
  "  h += '<h2>Where things stand</h2>';\n",
  "  h += freshRow(d.freshness);\n",
  "  h += '<div class=\"panel\">'+\n",
  "       kv('Training officer', d.fto || 'not assigned')+\n",
  "       kv('Phase started', d.phaseStart || 'not set')+\n",
  "       kv('Last evaluation', d.lastEval)+'</div>';\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(d.name)+')\">'+\n",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">My whole record</span",
  ">'+\n",
  "       '<span class=\"m\">Everything ever submitted about you, newest first.</span></span>'+",
  "\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "\n",
  "  if (d.skills && d.skills.length){\n",
  "    h += '<h2>Your skills</h2><div class=\"panel\">';\n",
  "    d.skills.forEach(function(s){\n",
  "      var chip = s.signed ? '<span class=\"chip c-ok\">Signed off</span>'\n",
  "        : (s.readiness === 'READY FOR VALIDATION' ? '<span class=\"chip c-warn\">With the Di",
  "vision</span>'\n",
  "        : '<span class=\"chip c-mute\">'+esc(s.successful)+' reps</span>');\n",
  "      h += kv(s.skill, chip);\n",
  "    });\n",
  "    h += '</div>';\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>What happens next</b>Anything you file goes to your training ",
  "officer and the Training Division. Nobody else sees it.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function kv(k,v){ return '<div class=\"kv\"><span class=\"k\">'+esc(k)+'</span><span class=\"v\"",
  ">'+v+'</span></div>'; }\n",
  "\n",
  "/* Writing is a staging-only capability. Against the live tracker this portal\n",
  "   reads and routes; the forms are what write, exactly as they always have.\n",
  "   So anything that would put a value in a live cell is not offered at all\n",
  "   rather than offered and then refused. */\n",
  "function canWrite(){ return BOOT.mode === 'STAGING'; }\n",
  "\n",
  "/* A form card. The person sees a task, not a form: the registry has already\n",
  "   picked which of the nine it is and filled in the names it knows. */\n",
  "function formCards(list){\n",
  "  var h = '';\n",
  "  (list||[]).forEach(function(f){\n",
  "    if (f.live && f.url){\n",
  "      h += '<a class=\"card act\" href=\"'+esc(f.url)+'\" target=\"_blank\" rel=\"noopener\">'+\n",
  "        dotFor(f)+'<span class=\"bd\"><span class=\"h\">'+esc(f.title)+'</span>'+\n",
  "        '<span class=\"m\">'+esc(f.blurb)+'</span></span><span class=\"go\">&rsaquo;</span></a",
  ">';\n",
  "    } else {\n",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(f.title)+'</div>'+\n",
  "        '<div class=\"m\">'+esc(f.blurb)+'</div>'+\n",
  "        '<div class=\"m\" style=\"color:var(--warn)\">Form links are switched off in this mode",
  ".</div></div>';\n",
  "    }\n",
  "  });\n",
  "  return h;\n",
  "}\n",
  "function dotFor(f){ return '<span class=\"dot '+(f.urgent?'due':'soon')+'\"></span>'; }\n",
  "\n",
  "function paintReflect(){\n",
  "  paint('<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+\n",
  "    '<h1>Weekly reflection</h1><p class=\"sub\">Four questions, in your own words. No length",
  " limit.</p>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What went well</div><textarea id=\"q1\"></textarea>",
  "</div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What was hard</div><textarea id=\"q2\"></textarea><",
  "/div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What I want to work on</div><textarea id=\"q3\"></t",
  "extarea></div>'+\n",
  "    '<button class=\"btn\" id=\"send\" onclick=\"sendReflection()\">Submit reflection</button>')",
  ";\n",
  "}\n",
  "function sendReflection(){\n",
  "  if (S.busy) return; S.busy = true;\n",
  "  var b = el('send'); b.disabled = true; b.textContent = 'Sending…';\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){ S.busy=false; S.ctx=r; S.screen='receipt'; render(); ",
  "})\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Submit",
  " reflection';\n",
  "      alert(e.message || e); })\n",
  "    .submitReflectionV1({ wentWell: el('q1').value, wasHard: el('q2').value, workOn: el('q",
  "3').value });\n",
  "}\n",
  "function paintReceipt(){\n",
  "  var r = S.ctx || {};\n",
  "  paint('<h1>Submitted</h1>'+\n",
  "    '<div class=\"note n-ok\"><b>Recorded</b>Saved as '+esc(r.ref||'')+'.</div>'+\n",
  "    '<div class=\"panel\">'+kv('Went to','Your training officer')+\n",
  "    kv('Visible to','You, your FTO, the Training Division')+\n",
  "    kv('Stored in','Your training record')+'</div>'+\n",
  "    '<div class=\"next\"><b>What happens next</b>Your FTO reads it before your next shift.</",
  "div>'+\n",
  "    '<button class=\"btn\" onclick=\"reload()\">Back to my record</button>');\n",
  "}\n",
  "function ack(row){\n",
  "  google.script.run.withSuccessHandler(reload)\n",
  "    .withFailureHandler(function(e){ alert(e.message||e); }).ackCoachingV1(row);\n",
  "}\n",
  "\n",
  "/* ---------------- fto ---------------- */\n",
  "function paintFto(d){\n",
  "  var h = '<h1>Your trainees</h1><p class=\"sub\">'+d.trainees.length+' assigned to you</p>'",
  ";\n",
  "  if (!d.trainees.length) h += '<div class=\"note n-info\"><b>Nobody assigned</b>No trainees",
  " list you as their training officer.</div>';\n",
  "  d.trainees.forEach(function(t,i){\n",
  "    h += '<button class=\"card act\" onclick=\"openTrainee('+i+')\">'+\n",
  "      '<span class=\"dot '+(t.setupComplete?'ok':'soon')+'\"></span>'+\n",
  "      '<span class=\"bd\"><span class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.level",
  ")+'</span>'+\n",
  "      '<span class=\"m\">'+esc(t.phase||'no phase set')+' &middot; last evaluation '+esc(t.l",
  "astEval)+'</span>'+\n",
  "      (t.setupComplete ? '' : '<span class=\"m\" style=\"color:var(--warn)\">Setup incomplete ",
  "- tell the Division</span>')+\n",
  "      '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "  });\n",
  "  if (d.forms && d.forms.length){\n",
  "    h += '<h2>Anything else</h2>'+formCards(d.forms);\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>How this works</b>Pick the person, not the form. The skills l",
  "og you get is already the one for their level, with both names filled in.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function openTrainee(i){\n",
  "  var t = (BOOT.data.trainees||[])[i];\n",
  "  if (!t) return;\n",
  "  S.ctx = t; S.screen = 'trainee'; render();\n",
  "}\n",
  "function paintTraineeSheet(){\n",
  "  var t = S.ctx || {};\n",
  "  var h = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'",
  "+\n",
  "    '<h1>'+esc(t.name)+'</h1><p class=\"sub\">'+lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t",
  ".phase||'no phase set')+'</p>';\n",
  "  h += freshRow(t.freshness);\n",
  "  h += '<div class=\"panel\">'+kv('Last evaluation', esc(t.lastEval))+\n",
  "       kv('Setup', t.setupComplete ? '<span class=\"chip c-ok\">Complete</span>'\n",
  "                                   : '<span class=\"chip c-warn\">Incomplete</span>')+'</div",
  ">';\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+\n",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">Their whole record</s",
  "pan>'+\n",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  h += '<h2>File something for '+esc(firstName(t.name))+'</h2>';\n",
  "  h += (t.forms && t.forms.length)\n",
  "    ? formCards(t.forms)\n",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or t",
  "he registry could not reach them.</div>';\n",
  "  h += '<div class=\"next\"><b>Where it goes</b>Straight into the tracker, the same way it a",
  "lways has. Nothing about your forms changed.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function firstName(n){ return String(n||'').split(/\\s+/)[0] || 'them'; }\n",
  "\n",
  "/* ---------------- division ---------------- */\n",
  "function paintDivision(d){\n",
  "  var h = '<h1>Waiting on you</h1><p class=\"sub\">'+d.queueCount+' sign-offs &middot; '+\n",
  "    d.incomplete.length+' setup gaps</p>';\n",
  "\n",
  "  if (d.mode !== 'STAGING')\n",
  "    h += '<div class=\"note n-warn\"><b>Read only</b>This portal is in '+esc(d.mode)+' mode.",
  " Nothing can be written from here.</div>';\n",
  "\n",
  "  h += '<h2>Sign-offs</h2>';\n",
  "  if (!d.queue.length) h += '<div class=\"note n-ok\"><b>Clear</b>No skills are waiting for ",
  "a decision.</div>';\n",
  "  d.queue.forEach(function(q){\n",
  "    // Approving writes a decision into the queue. Against the live tracker\n",
  "    // this portal will not do that, so the item is shown and the decision is\n",
  "    // recorded where it has always been recorded.\n",
  "    if (canWrite()){\n",
  "      h += '<button class=\"card act\" onclick=\"openSignoff('+q.row+',\\''+esc(q.trainee).rep",
  "lace(/\\'/g,\"\")+'\\',\\''+\n",
  "        esc(q.skill).replace(/\\'/g,\"\")+'\\',\\''+esc(q.evidence).replace(/\\'/g,\"\")+'\\')\">'+\n",
  "        '<span class=\"dot due\"></span><span class=\"bd\"><span class=\"h\">'+esc(q.skill)+'</s",
  "pan>'+\n",
  "        '<span class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</span></span>'",
  "+\n",
  "        '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    } else {\n",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(q.skill)+'</div>'+\n",
  "        '<div class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</div>'+\n",
  "        '<div class=\"m\" style=\"margin-top:7px\">'+esc(q.evidence)+'</div>'+\n",
  "        '<div class=\"m\" style=\"color:var(--warn);margin-top:7px\">Record the decision in th",
  "e tracker. This portal is read only.</div></div>';\n",
  "    }\n",
  "  });\n",
  "\n",
  "  if (d.people && d.people.length){\n",
  "    h += '<h2>Trainees</h2>';\n",
  "    d.people.forEach(function(t,i){\n",
  "      h += '<button class=\"card act\" onclick=\"openPerson('+i+')\"><span class=\"dot ok\"></sp",
  "an>'+\n",
  "        '<span class=\"bd\"><span class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.lev",
  "el)+'</span>'+\n",
  "        '<span class=\"m\">'+esc(t.phase||'no phase set')+' &middot; '+esc(t.fto||'no traini",
  "ng officer')+'</span>'+\n",
  "        '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "    });\n",
  "  }\n",
  "\n",
  "  if (d.forms && d.forms.length){\n",
  "    h += '<h2>Forms</h2>'+formCards(d.forms);\n",
  "  }\n",
  "\n",
  "  if (d.duplicateSubs && d.duplicateSubs.length){\n",
  "    h += '<h2>Two submissions, one day</h2>';\n",
  "    h += '<div class=\"note n-warn\"><b>Both are kept</b>Nothing has been removed. '+\n",
  "         'These are the places where two submissions of the same kind landed on the '+\n",
  "         'same day and somebody has to say which one stands.</div>';\n",
  "    d.duplicateSubs.forEach(function(x){\n",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(x.trainee)+'</div>'+\n",
  "        '<div class=\"m\">'+esc(x.source)+(x.group?' &middot; '+esc(x.group):'')+\n",
  "        ' &middot; '+esc(x.when)+'</div>'+\n",
  "        '<div class=\"m\">'+x.count+' submissions &middot; '+esc(x.tab)+\n",
  "        ' rows '+esc(x.rows.join(', '))+'</div></div>';\n",
  "    });\n",
  "  }\n",
  "\n",
  "  (d.retiredForms||[]).forEach(function(f){\n",
  "    h += '<div class=\"note n-stop\"><b>Retired form still open</b>'+esc(f.title)+\n",
  "         ' is no longer offered anywhere in this portal. '+esc(f.why)+\n",
  "         ' Anything already submitted to it is sitting in the form, not in the tracker.</d",
  "iv>';\n",
  "  });\n",
  "\n",
  "  if (d.incomplete.length){\n",
  "    h += '<h2>Setup incomplete</h2>';\n",
  "    d.incomplete.forEach(function(t){\n",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(t.name)+'</div>'+\n",
  "           '<div class=\"m\">Missing '+esc(t.missing)+'. Not counted as on track.</div></div",
  ">';\n",
  "    });\n",
  "  }\n",
  "  if (d.duplicates.length){\n",
  "    h += '<h2>Possible duplicates</h2><div class=\"note n-warn\"><b>Check these</b>'+\n",
  "         esc(d.duplicates.join(', '))+'</div>';\n",
  "  }\n",
  "  h += '<h2>System</h2><div class=\"panel\">'+\n",
  "    kv('Delivery mode','<span class=\"chip c-warn\">'+esc(d.mode)+'</span>')+\n",
  "    kv('Active trainees', d.activeCount+' <span class=\"chip c-mute\">'+d.closedCount+' clos",
  "ed, not counted</span>')+\n",
  "    kv('Form links', d.formLinks ? '<span class=\"chip c-ok\">Live</span>'\n",
  "                                 : '<span class=\"chip c-warn\">Off</span>')+\n",
  "    '</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function openPerson(i){\n",
  "  var t = (BOOT.data.people||[])[i];\n",
  "  if (!t) return;\n",
  "  S.ctx = t; S.screen = 'person'; render();\n",
  "}\n",
  "function paintPersonSheet(){\n",
  "  var t = S.ctx || {};\n",
  "  var h = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'",
  "+\n",
  "    '<h1>'+esc(t.name)+'</h1><p class=\"sub\">'+lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t",
  ".phase||'no phase set')+'</p>';\n",
  "  h += freshRow(t.freshness);\n",
  "  h += '<div class=\"panel\">'+kv('Training officer', esc(t.fto||'not assigned'))+\n",
  "       kv('Shift', esc(t.shift||'not set'))+'</div>';\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+\n",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">Their whole record</s",
  "pan>'+\n",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  h += '<h2>File something for '+esc(firstName(t.name))+'</h2>';\n",
  "  h += (t.forms && t.forms.length)\n",
  "    ? formCards(t.forms)\n",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or t",
  "he registry could not reach them.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function openSignoff(row,trainee,skill,evidence){\n",
  "  S.ctx = { row:row, trainee:trainee, skill:skill, evidence:evidence };\n",
  "  S.screen = 'signoff'; render();\n",
  "}\n",
  "function paintSignoff(){\n",
  "  var c = S.ctx || {};\n",
  "  paint('<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+\n",
  "    '<h1>'+esc(c.skill)+'</h1><p class=\"sub\">'+esc(c.trainee)+'</p>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">Evidence on file</div>'+\n",
  "    '<div style=\"font-size:.93rem\">'+esc(c.evidence)+'</div></div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">Why are you approving this</div>'+\n",
  "    '<textarea id=\"why\" placeholder=\"This goes on the permanent record in your name.\"></te",
  "xtarea></div>'+\n",
  "    '<button class=\"btn\" id=\"ap\" onclick=\"approve()\">Approve sign-off</button>'+\n",
  "    '<div class=\"next\"><b>No pre-filled wording</b>The old system wrote \"Evidence threshol",
  "ds met\" without checking anything. You type it, or it is not recorded.</div>');\n",
  "}\n",
  "function approve(){\n",
  "  if (S.busy) return;\n",
  "  var why = el('why').value.trim();\n",
  "  if (why.length < 8) { alert('Type why you are approving this.'); return; }\n",
  "  S.busy = true; var b = el('ap'); b.disabled = true; b.textContent = 'Recording…';\n",
  "  google.script.run.withSuccessHandler(function(){ S.busy=false; S.screen='main'; reload()",
  "; })\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Approv",
  "e sign-off';\n",
  "      alert(e.message||e); })\n",
  "    .approveSignoffV1(S.ctx.row, why);\n",
  "}\n",
  "\n",
  "/* ---------------- supervisor / medical ---------------- */\n",
  "function paintSupervisor(d){\n",
  "  var h = '<h1>'+esc(d.shift)+'</h1><p class=\"sub\">Read only. Nothing here asks you to do ",
  "anything.</p>';\n",
  "  if (!d.trainees.length) h += '<div class=\"note n-ok\"><b>Nobody on shift</b>No active tra",
  "inees are assigned to this shift.</div>';\n",
  "  d.trainees.forEach(function(t){\n",
  "    h += '<div class=\"card\"><div class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.le",
  "vel)+'</div>'+\n",
  "      '<div class=\"m\">'+esc(t.phase)+' &middot; '+esc(t.fto||'no FTO')+' &middot; last eva",
  "luation '+esc(t.lastEval)+'</div></div>';\n",
  "  });\n",
  "  if (d.forms && d.forms.length){\n",
  "    h += '<h2>If something cannot wait</h2>'+formCards(d.forms);\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>Deliberately thin</b>Supervisors get situational awareness, n",
  "ot personnel-development detail.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function paintMedical(d){\n",
  "  var h = '<h1>Clinical review</h1><p class=\"sub\">'+d.cases.length+\n",
  "    (d.cases.length===1?' case':' cases')+' for you. Nothing else.</p>';\n",
  "  if (!d.cases.length) h += '<div class=\"note n-ok\"><b>Nothing pending</b>No cases require",
  " your authority.</div>';\n",
  "  d.cases.forEach(function(c){\n",
  "    h += '<button class=\"card act\" style=\"border-left:4px solid var(--pmd)\" '+\n",
  "      'onclick=\"openRecord('+jsStr(c.trainee)+')\">'+\n",
  "      '<span class=\"dot due\"></span><span class=\"bd\">'+\n",
  "      '<span class=\"h\">'+esc(c.trainee)+'</span>'+\n",
  "      '<span class=\"m\">Raised by '+esc(c.from)+' &middot; '+esc(c.when)+'</span>'+\n",
  "      '<span class=\"m\" style=\"color:var(--ink-2);margin-top:7px\">'+esc(c.what)+'</span></s",
  "pan>'+\n",
  "      '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  });\n",
  "  h += '<div class=\"next\"><b>Only your cases</b>You never see routine evaluations, reflect",
  "ions, or other trainees.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "/* ---------------- the record ---------------- */\n",
  "/* Current first, in full. Everything earlier below it, also in full. The\n",
  "   raw tabs are untouched; this is a reading of them, not a replacement. */\n",
  "\n",
  "function freshRow(list){\n",
  "  if (!list || !list.length) return '';\n",
  "  var h = '<div class=\"fresh\">';\n",
  "  list.forEach(function(f){\n",
  "    var never = f.ago === 'never';\n",
  "    h += '<span class=\"'+(never?'never':'')+'\">'+esc(f.title)+' <b>'+esc(f.ago)+'</b>'+\n",
  "         (f.count>1 ? ' <span style=\"color:var(--ink-3)\">('+f.count+')</span>' : '')+'</sp",
  "an>';\n",
  "  });\n",
  "  return h + '</div>';\n",
  "}\n",
  "\n",
  "function openRecord(name){\n",
  "  S.ctx = { name: name, rec: null, from: S.screen, show: {} };\n",
  "  S.screen = 'record'; render();\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){ S.ctx.rec = r; render(); })\n",
  "    .withFailureHandler(function(e){ S.ctx.err = e.message || String(e); render(); })\n",
  "    .recordV1(name);\n",
  "}\n",
  "\n",
  "function paintRecord(){\n",
  "  var c = S.ctx || {};\n",
  "  var back = '<button class=\"back\" onclick=\"S.screen=\\''+(c.from||'main')+'\\';render()\">&l",
  "arr; Back</button>';\n",
  "  if (c.err) return paint(back+'<h1>'+esc(c.name)+'</h1>'+\n",
  "    '<div class=\"note n-stop\"><b>Cannot open</b>'+esc(c.err)+'</div>');\n",
  "  if (!c.rec) return paint(back+'<h1>'+esc(c.name)+'</h1><p class=\"sub\">Reading the record",
  "…</p>');\n",
  "\n",
  "  var r = c.rec;\n",
  "  var h = back + '<h1>'+esc(r.name)+'</h1><p class=\"sub\">'+r.total+\n",
  "    (r.total===1?' submission on file':' submissions on file')+'. Nothing has been removed",
  ".</p>';\n",
  "\n",
  "  if (r.partial) h += '<div class=\"note n-info\"><b>Part of the record</b>'+esc(r.scopeNote",
  ")+'</div>';\n",
  "  if (r.duplicates) h += '<div class=\"note n-warn\"><b>'+r.duplicates+\n",
  "    ' possible duplicate'+(r.duplicates===1?'':'s')+'</b>Two submissions of the same kind ",
  "on the '+\n",
  "    'same day. Both are kept and both are shown. Which one stands is your call.</div>';\n",
  "  if (!r.sections.length) h += '<div class=\"note n-info\"><b>Nothing on file</b>No submissi",
  "ons '+\n",
  "    'have been recorded for this person yet.</div>';\n",
  "\n",
  "  r.sections.forEach(function(sec){\n",
  "    h += '<h2>'+esc(sec.title)+'</h2>';\n",
  "    h += '<p class=\"sub\" style=\"margin-top:-6px\">Most recent '+esc(sec.newestAgo)+\n",
  "         ' &middot; '+sec.count+' on file</p>';\n",
  "    sec.current.forEach(function(s){ h += recCard(s, true); });\n",
  "    if (sec.earlier.length){\n",
  "      var open = !!(S.ctx.show||{})[sec.key];\n",
  "      h += '<button class=\"more\" onclick=\"toggleEarlier(\\''+esc(sec.key)+'\\')\">'+\n",
  "           (open ? 'Hide' : 'Show')+' '+sec.earlier.length+' earlier '+\n",
  "           (sec.earlier.length===1?'submission':'submissions')+'</button>';\n",
  "      if (open) sec.earlier.forEach(function(s){ h += recCard(s, false); });\n",
  "    }\n",
  "  });\n",
  "\n",
  "  h += '<div class=\"next\"><b>Where this comes from</b>Every row is read straight from the ",
  "tab the '+\n",
  "       'form wrote it to. Nothing is edited, moved or deleted to build this screen.</div>'",
  ";\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "function toggleEarlier(key){\n",
  "  S.ctx.show = S.ctx.show || {};\n",
  "  S.ctx.show[key] = !S.ctx.show[key];\n",
  "  render();\n",
  "}\n",
  "\n",
  "function recCard(s, isCurrent){\n",
  "  var cls = 'rec' + (s.possibleDuplicate ? ' dup' : (isCurrent ? ' cur' : ''));\n",
  "  var h = '<div class=\"'+cls+'\"><div class=\"when\"><span>'+esc(s.when)+\n",
  "    (s.by ? ' &middot; '+esc(s.by) : '')+'</span>'+\n",
  "    (isCurrent ? '<b>Current</b>' : '<span>'+esc(s.ago)+'</span>')+'</div>';\n",
  "  if (s.group) h += '<div class=\"h\" style=\"margin-top:5px\">'+esc(s.group)+'</div>';\n",
  "  if (s.possibleDuplicate) h += '<div class=\"m\" style=\"color:var(--stop);margin-top:5px\">'",
  "+\n",
  "    'Possible duplicate - another submission of this kind on the same day.</div>';\n",
  "  (s.fields||[]).forEach(function(f){\n",
  "    h += '<div class=\"fld\"><div class=\"l\">'+esc(f.label)+'</div>'+\n",
  "         '<div class=\"v\">'+esc(f.value)+'</div></div>';\n",
  "  });\n",
  "  return h + '</div>';\n",
  "}\n",
  "\n",
  "function reload(){\n",
  "  google.script.run.withSuccessHandler(function(r){\n",
  "    BOOT.viewer = r.viewer; BOOT.data = r.data; BOOT.mode = r.mode;\n",
  "    S.screen = 'main'; render();\n",
  "  }).withFailureHandler(function(e){ alert(e.message||e); }).refreshV1();\n",
  "}\n",
  "\n",
  "render();\n",
  "</script>\n",
  "</body>\n",
  "</html>\n"
].join('');


/* ======================================================================
 * END OF FILE
 *
 * If you cannot see this block at the bottom of Code.gs, the paste was
 * cut short. Select everything, delete it, and paste again.
 *
 * Or run portalPasteCheck from the Run dropdown; it says so either way.
 * ====================================================================== */

var PORTAL_BUILD = '70a21349';

function portalPasteCheck() {
  var msg = (typeof PORTAL_PAGE_HTML === 'string' && PORTAL_PAGE_HTML.length > 1000)
    ? 'The paste is complete. ' + PORTAL.VERSION + ', build ' + PORTAL_BUILD +
      ', page is ' + PORTAL_PAGE_HTML.length + ' characters.'
    : 'The paste is INCOMPLETE. Select everything in this file, delete it, ' +
      'and paste the whole file again.';
  Logger.log(msg);
  return msg;
}
