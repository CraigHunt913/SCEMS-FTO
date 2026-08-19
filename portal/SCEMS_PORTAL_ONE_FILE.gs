/**
 * SCEMS FIELD TRAINING PORTAL — portal-1.3.0
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
  // XFrameOptionsMode has exactly two members: DEFAULT and ALLOWALL. DEFAULT
  // is the protective one - Google sends X-Frame-Options: SAMEORIGIN, so no
  // other site can frame this page. There is no DENY; asking for one yields
  // undefined and Apps Script rejects it as a null mode.
  return t.evaluate()
    .setTitle(PORTAL.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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
 * Index.html — the page, as a string
 * ====================================================================== */

/** The page. Built from portal/Index.html; do not edit it here.
 *  30_WebApp.gs prefers this constant over an HTML file when it exists,
 *  which is what makes the single-file paste work. */
var PORTAL_PAGE_HTML = [
  "<!DOCTYPE html>",
  "<html>",
  "<head>",
  "<base target=\"_top\">",
  "<meta charset=\"utf-8\">",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap\">",
  "<style>",
  ":root{",
  "  --navy:#12233b; --navy-2:#1b3454;",
  "  --paper:#fff; --surface:#f5f7fa; --line:#dfe5ec;",
  "  --ink:#12233b; --ink-2:#4a5a70; --ink-3:#7b8798;",
  "  --emt:#2f7d4f; --aemt:#1f5f9e; --pmd:#a8342b; --gold:#b08a2e;",
  "  --ok:#2f7d4f; --ok-bg:#eef6f0;",
  "  --warn:#8a6a14; --warn-bg:#fdf6e4;",
  "  --stop:#a8342b; --stop-bg:#fbeeec;",
  "  --shadow:0 1px 2px rgba(18,35,59,.07),0 10px 28px -18px rgba(18,35,59,.45);",
  "}",
  "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){",
  "  --navy:#0d1826; --navy-2:#16283f;",
  "  --paper:#161d27; --surface:#111821; --line:#2b3646;",
  "  --ink:#e9eef5; --ink-2:#b3bfcf; --ink-3:#7d8a9c;",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e08b82; --gold:#d6ad50;",
  "  --ok:#6bbd8a; --ok-bg:#16261d; --warn:#d6ad50; --warn-bg:#272113;",
  "  --stop:#e08b82; --stop-bg:#2a1917;",
  "  --shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px -18px rgba(0,0,0,.9);",
  "}}",
  ":root[data-theme=\"dark\"]{",
  "  --navy:#0d1826; --navy-2:#16283f;",
  "  --paper:#161d27; --surface:#111821; --line:#2b3646;",
  "  --ink:#e9eef5; --ink-2:#b3bfcf; --ink-3:#7d8a9c;",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e08b82; --gold:#d6ad50;",
  "  --ok:#6bbd8a; --ok-bg:#16261d; --warn:#d6ad50; --warn-bg:#272113;",
  "  --stop:#e08b82; --stop-bg:#2a1917;",
  "  --shadow:0 1px 2px rgba(0,0,0,.5),0 10px 28px -18px rgba(0,0,0,.9);",
  "}",
  "*{box-sizing:border-box;}",
  "html,body{margin:0;background:var(--surface);color:var(--ink);",
  "  font-family:\"Source Sans 3\",system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.55;",
  "  -webkit-font-smoothing:antialiased;}",
  ".app{max-width:520px;margin:0 auto;background:var(--paper);min-height:100vh;box-shadow:var(--shadow);}",
  "@media(min-width:560px){.app{margin:24px auto;border-radius:14px;overflow:hidden;min-height:0;}}",
  ".bar{background:var(--navy);color:#fff;padding:14px 18px;display:flex;align-items:center;gap:12px;",
  "  position:sticky;top:0;z-index:20;}",
  ".bar img{width:34px;height:37px;display:block;flex:none;}",
  ".bar .t{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.06rem;line-height:1.1;}",
  ".bar .s{font-size:.72rem;color:#9fb2c9;letter-spacing:.13em;text-transform:uppercase;font-weight:600;",
  "  font-family:\"Barlow Semi Condensed\",sans-serif;}",
  ".mode{margin-left:auto;font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.66rem;letter-spacing:.12em;",
  "  text-transform:uppercase;font-weight:700;padding:3px 9px;border-radius:3px;",
  "  background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);}",
  ".wrap{padding:20px 18px 44px;}",
  "h1{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.6rem;line-height:1.12;margin:0 0 4px;}",
  ".sub{color:var(--ink-3);font-size:.94rem;margin:0 0 20px;}",
  "h2{font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:.8rem;letter-spacing:.14em;",
  "  text-transform:uppercase;color:var(--ink-3);margin:26px 0 10px;}",
  "h2:first-of-type{margin-top:4px;}",
  ".card{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:14px 15px;margin-bottom:9px;}",
  ".card.act{display:flex;gap:13px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;text-decoration:none;}",
  ".card.act:hover,.card.act:focus-visible{border-color:var(--ink-3);}",
  ".dot{flex:none;width:9px;height:9px;border-radius:50%;margin-top:7px;background:var(--ink-3);}",
  ".dot.due{background:var(--stop);}.dot.soon{background:var(--warn);}.dot.ok{background:var(--ok);}",
  ".bd{flex:1;min-width:0;}",
  ".h{font-weight:700;font-size:1rem;line-height:1.3;}",
  ".m{font-size:.86rem;color:var(--ink-3);line-height:1.35;margin-top:2px;}",
  ".go{flex:none;color:var(--ink-3);font-size:1.3rem;line-height:1;margin-top:4px;}",
  ".panel{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:15px 16px;margin-bottom:14px;}",
  ".lab{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacing:.13em;",
  "  text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:7px;}",
  ".kv{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid var(--line);font-size:.93rem;}",
  ".kv:last-child{border-bottom:none;}",
  ".kv .k{color:var(--ink-3);}.kv .v{font-weight:600;text-align:right;}",
  ".chip{display:inline-block;font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:600;font-size:.7rem;",
  "  letter-spacing:.09em;text-transform:uppercase;padding:2px 8px;border-radius:3px;border:1px solid currentColor;}",
  ".c-emt{color:var(--emt);}.c-aemt{color:var(--aemt);}.c-pmd{color:var(--pmd);}",
  ".c-ok{color:var(--ok);background:var(--ok-bg);}.c-warn{color:var(--warn);background:var(--warn-bg);}",
  ".c-stop{color:var(--stop);background:var(--stop-bg);}.c-mute{color:var(--ink-3);}",
  ".prog{height:7px;background:var(--line);border-radius:4px;overflow:hidden;margin:9px 0 5px;}",
  ".prog i{display:block;height:100%;border-radius:4px;background:var(--emt);}",
  ".big{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:1.9rem;font-weight:700;line-height:1;}",
  ".big small{font-size:1rem;color:var(--ink-3);font-weight:600;}",
  ".btn{display:block;width:100%;text-align:center;background:var(--navy);color:#fff;border:none;border-radius:9px;",
  "  padding:15px;font-family:\"Barlow Semi Condensed\",sans-serif;font-weight:700;font-size:1.05rem;cursor:pointer;margin-top:8px;}",
  ".btn:hover{background:var(--navy-2);}",
  ".btn.ghost{background:none;color:var(--ink-2);border:1px solid var(--line);}",
  ".btn[disabled]{opacity:.5;cursor:not-allowed;}",
  "textarea{width:100%;min-height:96px;border:1px solid var(--line);border-radius:8px;padding:11px 12px;",
  "  font:inherit;color:inherit;background:var(--paper);resize:vertical;}",
  "textarea:focus{outline:2.5px solid var(--gold);outline-offset:1px;}",
  ".note{border-radius:8px;padding:13px 15px;margin:0 0 14px;font-size:.9rem;}",
  ".note b{display:block;font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.74rem;letter-spacing:.13em;",
  "  text-transform:uppercase;margin-bottom:5px;}",
  ".n-ok{background:var(--ok-bg);border:1px solid var(--ok);}.n-ok b{color:var(--ok);}",
  ".n-warn{background:var(--warn-bg);border:1px solid var(--warn);}.n-warn b{color:var(--warn);}",
  ".n-stop{background:var(--stop-bg);border:1px solid var(--stop);}.n-stop b{color:var(--stop);}",
  ".n-info{background:var(--surface);border:1px solid var(--line);}.n-info b{color:var(--ink-3);}",
  ".next{border-left:3px solid var(--gold);padding-left:12px;margin:16px 0;font-size:.9rem;color:var(--ink-2);}",
  ".next b{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacing:.13em;",
  "  text-transform:uppercase;color:var(--gold);display:block;margin-bottom:3px;}",
  ".back{background:none;border:none;color:var(--ink-3);font-family:\"Barlow Semi Condensed\",sans-serif;",
  "  font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;cursor:pointer;padding:0;margin:0 0 12px;}",
  ".back:hover{color:var(--ink);}",
  "/* record screen: current at the top, everything earlier below it */",
  ".rec{border:1px solid var(--line);border-radius:9px;padding:14px 15px;margin-bottom:9px;background:var(--paper);}",
  ".rec.cur{border-left:4px solid var(--gold);}",
  ".rec.dup{border-left:4px solid var(--stop);}",
  ".rec .when{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.74rem;letter-spacing:.12em;",
  "  text-transform:uppercase;color:var(--ink-3);display:flex;justify-content:space-between;gap:10px;}",
  ".rec .when b{color:var(--gold);font-weight:700;}",
  ".rec .fld{margin-top:9px;}",
  ".rec .fld .l{font-family:\"Barlow Semi Condensed\",sans-serif;font-size:.72rem;letter-spacing:.11em;",
  "  text-transform:uppercase;color:var(--ink-3);}",
  ".rec .fld .v{font-size:.94rem;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;}",
  ".fresh{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 14px;}",
  ".fresh span{font-size:.78rem;color:var(--ink-2);background:var(--surface);",
  "  border:1px solid var(--line);border-radius:20px;padding:3px 11px;}",
  ".fresh span b{color:var(--ink);font-weight:600;}",
  ".fresh span.never{color:var(--ink-3);}",
  ".more{background:none;border:1px solid var(--line);border-radius:7px;width:100%;padding:10px;",
  "  font:inherit;font-size:.88rem;color:var(--ink-2);cursor:pointer;margin-bottom:12px;}",
  ".more:hover{border-color:var(--ink-3);color:var(--ink);}",
  ".foot{padding:20px 18px 32px;border-top:1px solid var(--line);color:var(--ink-3);font-size:.8rem;background:var(--surface);}",
  ":focus-visible{outline:2.5px solid var(--gold);outline-offset:2px;}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;}}",
  "</style>",
  "</head>",
  "<body>",
  "<div class=\"app\">",
  "  <div class=\"bar\">",
  "    <img src=\"data:image/png;base64,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LikpodWrV3eQholEgvbff3KnajUAmrT//vSf996lQCyq59GkEQBSMB6jZo/7q8bGRqtmonDGmFLvdk8xioarA36/TIDAGGOkUKpgQz5WLFuOU0+eiz/98Y/YuGFDhjNRiye6+OJLcNVVV+lOKq22liAIcDgceO21hbjiiitw4okn4vLLr8DKlSvBOddTULX01/HjxuGUU07VnVzpKbzxeBzvvPOuHvKkndtqteLYmTO3G3ekHUOSJHz00ccdsiKrq6owadJ+WR2UrR4PGhoaM2LBRFHE4EEq62gwiPD5fHjxhRc7dbi53S7EYjH92IFAAI2NDfr9a/FXA2sG6g7CHTok8/LVFhep+sVqXJqy3UKAnWWGHnzIwbDZrLpjUnt/yZIleixY+2xJLRI4veheugMym6NXEAQoioLp0w/GrGOPzXASC4KAYDCI119/Q49cbl+7QFtfRqMRLpcL76fF6GkOUYPBgCFDBne4Bm29CoKAH5Ytw5zZx+Pav/0/xKJR2FMOzdR9iH6/P2m32Q/iFtP5qY1CvYgWT+szoURcY7uowemgFm8rbW1qpIsvu0zfEdtTvNpuU1lZSU1NzRkGmqaDL1iwgCorK7MmZL3++uv6DtzicNDrr79OZ599TtasQe28Y8aMIZ/P32E3XbZ8OVmt1i6pYpMnT6FIJNphF7377rs79bcsWrSog5F/xx136rqxZnDX19frqmUymaR4PE7JZJKeeeaZDslPzzz7bAdJ++ijj+7QOG8Lxbksq8SeOfPYLkmWdDXl3Xff7SBtw+Ew7bvvpKzn31ECWWfXr0mjt99+O6uNJ8syrV69mq6++uqMbEvte5pU0ub8qaeezsqkzZ07b4cRztrvo8eMoQ8++YRaU/kzmk+mNRhQmtzuVc1arsym5uZSh8+z2RXwKymDXhdHx84+LqsIa//eWWed3UEURqNROvXUU7Omxmo3mpubS3f+61903nnnUWVVZRf0a/U47733XocHm0gk6NBDD92u57jNQZlDv/zySwf9fPHixSS0809k89FoCU4LFy7sAIB77rkn6wL+9tvvdGNV++z06dPpxhv/TqedfjodeuihNG7cOCosLOqy6nTIIYfS008/Q6+++ip98sli+vHHH2nlyp9p3PjxXbJZtL8PGjQoa/qzLMu0atUqeuihh+m0006jIUOHZo3h254dk5V1mzEj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\" alt=\"Sumter County EMS\">",
  "    <div><div class=\"s\">Sumter County EMS</div><div class=\"t\">Field Training</div></div>",
  "    <span class=\"mode\" id=\"mode\">…</span>",
  "  </div>",
  "  <div class=\"wrap\" id=\"view\"><p class=\"sub\">Loading…</p></div>",
  "  <div class=\"foot\" id=\"foot\"></div>",
  "</div>",
  "",
  "<script>",
  "// <?!= ?> prints raw. <?= ?> HTML-escapes, which turns every quote in this",
  "// JSON into &quot; and makes the line invalid JavaScript - the page then sits",
  "// on \"Loading\" forever because the script died before render() ran.",
  "var BOOT = <?!= boot ?>;",
  "var S = { screen: 'main', ctx: null, busy: false };",
  "",
  "function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g,function(c){",
  "  return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }",
  "function lvlChip(k,l){ return '<span class=\"chip c-'+esc(k||'emt')+'\">'+esc(l||'')+'</span>'; }",
  "function el(id){ return document.getElementById(id); }",
  "/* A name ends up inside onclick=\"...\", so it has to survive two parsers: the",
  "   HTML attribute and the JavaScript string inside it. JSON.stringify handles",
  "   the quotes and backslashes; esc() handles the angle brackets and the",
  "   double quote that would end the attribute. */",
  "function jsStr(v){ return esc(JSON.stringify(String(v==null?'':v))); }",
  "",
  "function render(){",
  "  el('mode').textContent = BOOT.mode === 'STAGING' ? 'Staging' : BOOT.mode;",
  "  el('foot').innerHTML = BOOT.mode === 'STAGING'",
  "    ? 'Staging sandbox. Invented people. Nothing here is a personnel record.'",
  "    : 'Signed in as ' + esc(BOOT.viewer.email || 'unknown') + ' &middot; ' + esc(BOOT.version);",
  "",
  "  var v = BOOT.viewer, d = BOOT.data || {};",
  "  if (BOOT.error) return paint('<h1>Something went wrong</h1><div class=\"note n-stop\"><b>Error</b>'+esc(BOOT.error)+'</div>');",
  "  if (!v.ok) return paint(",
  "    '<h1>You are not set up yet</h1>'+",
  "    '<p class=\"sub\">'+esc(v.why || 'This account is not recognised.')+'</p>'+",
  "    '<div class=\"note n-info\"><b>What to do</b>Ask the Training Division to add '+",
  "    esc(v.email || 'your account')+' to the roster or the trainee master. Nothing is broken.</div>');",
  "",
  "  if (S.screen === 'reflect')  return paintReflect();",
  "  if (S.screen === 'receipt')  return paintReceipt();",
  "  if (S.screen === 'signoff')  return paintSignoff();",
  "  if (S.screen === 'trainee')  return paintTraineeSheet();",
  "  if (S.screen === 'person')   return paintPersonSheet();",
  "  if (S.screen === 'record')   return paintRecord();",
  "",
  "  switch (v.role) {",
  "    case 'TRAINEE':            return paintTrainee(d);",
  "    case 'FTO':                return paintFto(d);",
  "    case 'TRAINING_DIVISION':  return paintDivision(d);",
  "    case 'SUPERVISOR':         return paintSupervisor(d);",
  "    case 'MEDICAL_DIRECTOR':   return paintMedical(d);",
  "    default:                   return paint('<h1>No role</h1>');",
  "  }",
  "}",
  "function paint(h){ el('view').innerHTML = h; window.scrollTo(0,0); }",
  "",
  "/* ---------------- trainee ---------------- */",
  "function paintTrainee(d){",
  "  if (d.error) return paint('<h1>No record</h1><div class=\"note n-stop\"><b>Not found</b>'+esc(d.error)+'</div>');",
  "  var h = '<h1>'+esc(d.name)+'</h1><p class=\"sub\">'+lvlChip(d.levelKey,d.level)+",
  "    ' &nbsp; '+esc(d.phase)+'</p>';",
  "  h += '<div class=\"panel\"><div class=\"lab\">Skills signed off</div><div class=\"big\">'+d.signed+",
  "       ' <small>of '+d.applicable+'</small></div><div class=\"prog\"><i style=\"width:'+d.percent+",
  "       '%;background:var(--'+esc(d.levelKey)+')\"></i></div>'+",
  "       '<div style=\"font-size:.85rem;color:var(--ink-3)\">'+",
  "       (d.waiting.length ? d.waiting.length+' waiting on the Training Division' : 'Nothing waiting on anyone else')+",
  "       '</div></div>';",
  "",
  "  h += '<h2>Waiting on you</h2>';",
  "  // In staging the reflection is filed in the portal so the flow can be",
  "  // tried end to end. Against the live tracker the existing self-reflection",
  "  // form is the one that files it, because that form already has a trigger",
  "  // and a destination and this portal must not become a second writer.",
  "  if (canWrite()){",
  "    h += '<button class=\"card act\" onclick=\"S.screen=\\'reflect\\';render()\"><span class=\"dot due\"></span>'+",
  "         '<span class=\"bd\"><span class=\"h\">Weekly reflection</span>'+",
  "         '<span class=\"m\">Your own words. Takes about four minutes.</span></span><span class=\"go\">&rsaquo;</span></button>';",
  "  }",
  "  h += formCards(d.forms);",
  "  (d.coaching||[]).forEach(function(c){",
  "    if (canWrite()){",
  "      h += '<button class=\"card act\" onclick=\"ack('+c.row+')\"><span class=\"dot soon\"></span>'+",
  "           '<span class=\"bd\"><span class=\"h\">Coaching from '+esc(c.from)+'</span>'+",
  "           '<span class=\"m\">'+esc(c.text)+'</span></span><span class=\"go\">&rsaquo;</span></button>';",
  "    } else {",
  "      h += '<div class=\"card\"><div class=\"h\">Coaching from '+esc(c.from)+'</div>'+",
  "           '<div class=\"m\">'+esc(c.text)+'</div></div>';",
  "    }",
  "  });",
  "",
  "  h += '<h2>Where things stand</h2>';",
  "  h += freshRow(d.freshness);",
  "  h += '<div class=\"panel\">'+",
  "       kv('Training officer', d.fto || 'not assigned')+",
  "       kv('Phase started', d.phaseStart || 'not set')+",
  "       kv('Last evaluation', d.lastEval)+'</div>';",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(d.name)+')\">'+",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">My whole record</span>'+",
  "       '<span class=\"m\">Everything ever submitted about you, newest first.</span></span>'+",
  "       '<span class=\"go\">&rsaquo;</span></button>';",
  "",
  "  if (d.skills && d.skills.length){",
  "    h += '<h2>Your skills</h2><div class=\"panel\">';",
  "    d.skills.forEach(function(s){",
  "      var chip = s.signed ? '<span class=\"chip c-ok\">Signed off</span>'",
  "        : (s.readiness === 'READY FOR VALIDATION' ? '<span class=\"chip c-warn\">With the Division</span>'",
  "        : '<span class=\"chip c-mute\">'+esc(s.successful)+' reps</span>');",
  "      h += kv(s.skill, chip);",
  "    });",
  "    h += '</div>';",
  "  }",
  "  h += '<div class=\"next\"><b>What happens next</b>Anything you file goes to your training officer and the Training Division. Nobody else sees it.</div>';",
  "  paint(h);",
  "}",
  "function kv(k,v){ return '<div class=\"kv\"><span class=\"k\">'+esc(k)+'</span><span class=\"v\">'+v+'</span></div>'; }",
  "",
  "/* Writing is a staging-only capability. Against the live tracker this portal",
  "   reads and routes; the forms are what write, exactly as they always have.",
  "   So anything that would put a value in a live cell is not offered at all",
  "   rather than offered and then refused. */",
  "function canWrite(){ return BOOT.mode === 'STAGING'; }",
  "",
  "/* A form card. The person sees a task, not a form: the registry has already",
  "   picked which of the nine it is and filled in the names it knows. */",
  "function formCards(list){",
  "  var h = '';",
  "  (list||[]).forEach(function(f){",
  "    if (f.live && f.url){",
  "      h += '<a class=\"card act\" href=\"'+esc(f.url)+'\" target=\"_blank\" rel=\"noopener\">'+",
  "        dotFor(f)+'<span class=\"bd\"><span class=\"h\">'+esc(f.title)+'</span>'+",
  "        '<span class=\"m\">'+esc(f.blurb)+'</span></span><span class=\"go\">&rsaquo;</span></a>';",
  "    } else {",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(f.title)+'</div>'+",
  "        '<div class=\"m\">'+esc(f.blurb)+'</div>'+",
  "        '<div class=\"m\" style=\"color:var(--warn)\">Form links are switched off in this mode.</div></div>';",
  "    }",
  "  });",
  "  return h;",
  "}",
  "function dotFor(f){ return '<span class=\"dot '+(f.urgent?'due':'soon')+'\"></span>'; }",
  "",
  "function paintReflect(){",
  "  paint('<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+",
  "    '<h1>Weekly reflection</h1><p class=\"sub\">Four questions, in your own words. No length limit.</p>'+",
  "    '<div class=\"panel\"><div class=\"lab\">What went well</div><textarea id=\"q1\"></textarea></div>'+",
  "    '<div class=\"panel\"><div class=\"lab\">What was hard</div><textarea id=\"q2\"></textarea></div>'+",
  "    '<div class=\"panel\"><div class=\"lab\">What I want to work on</div><textarea id=\"q3\"></textarea></div>'+",
  "    '<button class=\"btn\" id=\"send\" onclick=\"sendReflection()\">Submit reflection</button>');",
  "}",
  "function sendReflection(){",
  "  if (S.busy) return; S.busy = true;",
  "  var b = el('send'); b.disabled = true; b.textContent = 'Sending…';",
  "  google.script.run",
  "    .withSuccessHandler(function(r){ S.busy=false; S.ctx=r; S.screen='receipt'; render(); })",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Submit reflection';",
  "      alert(e.message || e); })",
  "    .submitReflectionV1({ wentWell: el('q1').value, wasHard: el('q2').value, workOn: el('q3').value });",
  "}",
  "function paintReceipt(){",
  "  var r = S.ctx || {};",
  "  paint('<h1>Submitted</h1>'+",
  "    '<div class=\"note n-ok\"><b>Recorded</b>Saved as '+esc(r.ref||'')+'.</div>'+",
  "    '<div class=\"panel\">'+kv('Went to','Your training officer')+",
  "    kv('Visible to','You, your FTO, the Training Division')+",
  "    kv('Stored in','Your training record')+'</div>'+",
  "    '<div class=\"next\"><b>What happens next</b>Your FTO reads it before your next shift.</div>'+",
  "    '<button class=\"btn\" onclick=\"reload()\">Back to my record</button>');",
  "}",
  "function ack(row){",
  "  google.script.run.withSuccessHandler(reload)",
  "    .withFailureHandler(function(e){ alert(e.message||e); }).ackCoachingV1(row);",
  "}",
  "",
  "/* ---------------- fto ---------------- */",
  "function paintFto(d){",
  "  var h = '<h1>Your trainees</h1><p class=\"sub\">'+d.trainees.length+' assigned to you</p>';",
  "  if (!d.trainees.length) h += '<div class=\"note n-info\"><b>Nobody assigned</b>No trainees list you as their training officer.</div>';",
  "  d.trainees.forEach(function(t,i){",
  "    h += '<button class=\"card act\" onclick=\"openTrainee('+i+')\">'+",
  "      '<span class=\"dot '+(t.setupComplete?'ok':'soon')+'\"></span>'+",
  "      '<span class=\"bd\"><span class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.level)+'</span>'+",
  "      '<span class=\"m\">'+esc(t.phase||'no phase set')+' &middot; last evaluation '+esc(t.lastEval)+'</span>'+",
  "      (t.setupComplete ? '' : '<span class=\"m\" style=\"color:var(--warn)\">Setup incomplete - tell the Division</span>')+",
  "      '</span><span class=\"go\">&rsaquo;</span></button>';",
  "  });",
  "  if (d.forms && d.forms.length){",
  "    h += '<h2>Anything else</h2>'+formCards(d.forms);",
  "  }",
  "  h += '<div class=\"next\"><b>How this works</b>Pick the person, not the form. The skills log you get is already the one for their level, with both names filled in.</div>';",
  "  paint(h);",
  "}",
  "function openTrainee(i){",
  "  var t = (BOOT.data.trainees||[])[i];",
  "  if (!t) return;",
  "  S.ctx = t; S.screen = 'trainee'; render();",
  "}",
  "function paintTraineeSheet(){",
  "  var t = S.ctx || {};",
  "  var h = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+",
  "    '<h1>'+esc(t.name)+'</h1><p class=\"sub\">'+lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t.phase||'no phase set')+'</p>';",
  "  h += freshRow(t.freshness);",
  "  h += '<div class=\"panel\">'+kv('Last evaluation', esc(t.lastEval))+",
  "       kv('Setup', t.setupComplete ? '<span class=\"chip c-ok\">Complete</span>'",
  "                                   : '<span class=\"chip c-warn\">Incomplete</span>')+'</div>';",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">Their whole record</span>'+",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+",
  "       '<span class=\"go\">&rsaquo;</span></button>';",
  "  h += '<h2>File something for '+esc(firstName(t.name))+'</h2>';",
  "  h += (t.forms && t.forms.length)",
  "    ? formCards(t.forms)",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or the registry could not reach them.</div>';",
  "  h += '<div class=\"next\"><b>Where it goes</b>Straight into the tracker, the same way it always has. Nothing about your forms changed.</div>';",
  "  paint(h);",
  "}",
  "function firstName(n){ return String(n||'').split(/\\s+/)[0] || 'them'; }",
  "",
  "/* ---------------- division ---------------- */",
  "function paintDivision(d){",
  "  var h = '<h1>Waiting on you</h1><p class=\"sub\">'+d.queueCount+' sign-offs &middot; '+",
  "    d.incomplete.length+' setup gaps</p>';",
  "",
  "  if (d.mode !== 'STAGING')",
  "    h += '<div class=\"note n-warn\"><b>Read only</b>This portal is in '+esc(d.mode)+' mode. Nothing can be written from here.</div>';",
  "",
  "  h += '<h2>Sign-offs</h2>';",
  "  if (!d.queue.length) h += '<div class=\"note n-ok\"><b>Clear</b>No skills are waiting for a decision.</div>';",
  "  d.queue.forEach(function(q){",
  "    // Approving writes a decision into the queue. Against the live tracker",
  "    // this portal will not do that, so the item is shown and the decision is",
  "    // recorded where it has always been recorded.",
  "    if (canWrite()){",
  "      h += '<button class=\"card act\" onclick=\"openSignoff('+q.row+',\\''+esc(q.trainee).replace(/\\'/g,\"\")+'\\',\\''+",
  "        esc(q.skill).replace(/\\'/g,\"\")+'\\',\\''+esc(q.evidence).replace(/\\'/g,\"\")+'\\')\">'+",
  "        '<span class=\"dot due\"></span><span class=\"bd\"><span class=\"h\">'+esc(q.skill)+'</span>'+",
  "        '<span class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</span></span>'+",
  "        '<span class=\"go\">&rsaquo;</span></button>';",
  "    } else {",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(q.skill)+'</div>'+",
  "        '<div class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</div>'+",
  "        '<div class=\"m\" style=\"margin-top:7px\">'+esc(q.evidence)+'</div>'+",
  "        '<div class=\"m\" style=\"color:var(--warn);margin-top:7px\">Record the decision in the tracker. This portal is read only.</div></div>';",
  "    }",
  "  });",
  "",
  "  if (d.people && d.people.length){",
  "    h += '<h2>Trainees</h2>';",
  "    d.people.forEach(function(t,i){",
  "      h += '<button class=\"card act\" onclick=\"openPerson('+i+')\"><span class=\"dot ok\"></span>'+",
  "        '<span class=\"bd\"><span class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.level)+'</span>'+",
  "        '<span class=\"m\">'+esc(t.phase||'no phase set')+' &middot; '+esc(t.fto||'no training officer')+'</span>'+",
  "        '</span><span class=\"go\">&rsaquo;</span></button>';",
  "    });",
  "  }",
  "",
  "  if (d.forms && d.forms.length){",
  "    h += '<h2>Forms</h2>'+formCards(d.forms);",
  "  }",
  "",
  "  if (d.duplicateSubs && d.duplicateSubs.length){",
  "    h += '<h2>Two submissions, one day</h2>';",
  "    h += '<div class=\"note n-warn\"><b>Both are kept</b>Nothing has been removed. '+",
  "         'These are the places where two submissions of the same kind landed on the '+",
  "         'same day and somebody has to say which one stands.</div>';",
  "    d.duplicateSubs.forEach(function(x){",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(x.trainee)+'</div>'+",
  "        '<div class=\"m\">'+esc(x.source)+(x.group?' &middot; '+esc(x.group):'')+",
  "        ' &middot; '+esc(x.when)+'</div>'+",
  "        '<div class=\"m\">'+x.count+' submissions &middot; '+esc(x.tab)+",
  "        ' rows '+esc(x.rows.join(', '))+'</div></div>';",
  "    });",
  "  }",
  "",
  "  (d.retiredForms||[]).forEach(function(f){",
  "    h += '<div class=\"note n-stop\"><b>Retired form still open</b>'+esc(f.title)+",
  "         ' is no longer offered anywhere in this portal. '+esc(f.why)+",
  "         ' Anything already submitted to it is sitting in the form, not in the tracker.</div>';",
  "  });",
  "",
  "  if (d.incomplete.length){",
  "    h += '<h2>Setup incomplete</h2>';",
  "    d.incomplete.forEach(function(t){",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(t.name)+'</div>'+",
  "           '<div class=\"m\">Missing '+esc(t.missing)+'. Not counted as on track.</div></div>';",
  "    });",
  "  }",
  "  if (d.duplicates.length){",
  "    h += '<h2>Possible duplicates</h2><div class=\"note n-warn\"><b>Check these</b>'+",
  "         esc(d.duplicates.join(', '))+'</div>';",
  "  }",
  "  h += '<h2>System</h2><div class=\"panel\">'+",
  "    kv('Delivery mode','<span class=\"chip c-warn\">'+esc(d.mode)+'</span>')+",
  "    kv('Active trainees', d.activeCount+' <span class=\"chip c-mute\">'+d.closedCount+' closed, not counted</span>')+",
  "    kv('Form links', d.formLinks ? '<span class=\"chip c-ok\">Live</span>'",
  "                                 : '<span class=\"chip c-warn\">Off</span>')+",
  "    '</div>';",
  "  paint(h);",
  "}",
  "function openPerson(i){",
  "  var t = (BOOT.data.people||[])[i];",
  "  if (!t) return;",
  "  S.ctx = t; S.screen = 'person'; render();",
  "}",
  "function paintPersonSheet(){",
  "  var t = S.ctx || {};",
  "  var h = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+",
  "    '<h1>'+esc(t.name)+'</h1><p class=\"sub\">'+lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t.phase||'no phase set')+'</p>';",
  "  h += freshRow(t.freshness);",
  "  h += '<div class=\"panel\">'+kv('Training officer', esc(t.fto||'not assigned'))+",
  "       kv('Shift', esc(t.shift||'not set'))+'</div>';",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+",
  "       '<span class=\"dot ok\"></span><span class=\"bd\"><span class=\"h\">Their whole record</span>'+",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+",
  "       '<span class=\"go\">&rsaquo;</span></button>';",
  "  h += '<h2>File something for '+esc(firstName(t.name))+'</h2>';",
  "  h += (t.forms && t.forms.length)",
  "    ? formCards(t.forms)",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or the registry could not reach them.</div>';",
  "  paint(h);",
  "}",
  "function openSignoff(row,trainee,skill,evidence){",
  "  S.ctx = { row:row, trainee:trainee, skill:skill, evidence:evidence };",
  "  S.screen = 'signoff'; render();",
  "}",
  "function paintSignoff(){",
  "  var c = S.ctx || {};",
  "  paint('<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+",
  "    '<h1>'+esc(c.skill)+'</h1><p class=\"sub\">'+esc(c.trainee)+'</p>'+",
  "    '<div class=\"panel\"><div class=\"lab\">Evidence on file</div>'+",
  "    '<div style=\"font-size:.93rem\">'+esc(c.evidence)+'</div></div>'+",
  "    '<div class=\"panel\"><div class=\"lab\">Why are you approving this</div>'+",
  "    '<textarea id=\"why\" placeholder=\"This goes on the permanent record in your name.\"></textarea></div>'+",
  "    '<button class=\"btn\" id=\"ap\" onclick=\"approve()\">Approve sign-off</button>'+",
  "    '<div class=\"next\"><b>No pre-filled wording</b>The old system wrote \"Evidence thresholds met\" without checking anything. You type it, or it is not recorded.</div>');",
  "}",
  "function approve(){",
  "  if (S.busy) return;",
  "  var why = el('why').value.trim();",
  "  if (why.length < 8) { alert('Type why you are approving this.'); return; }",
  "  S.busy = true; var b = el('ap'); b.disabled = true; b.textContent = 'Recording…';",
  "  google.script.run.withSuccessHandler(function(){ S.busy=false; S.screen='main'; reload(); })",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Approve sign-off';",
  "      alert(e.message||e); })",
  "    .approveSignoffV1(S.ctx.row, why);",
  "}",
  "",
  "/* ---------------- supervisor / medical ---------------- */",
  "function paintSupervisor(d){",
  "  var h = '<h1>'+esc(d.shift)+'</h1><p class=\"sub\">Read only. Nothing here asks you to do anything.</p>';",
  "  if (!d.trainees.length) h += '<div class=\"note n-ok\"><b>Nobody on shift</b>No active trainees are assigned to this shift.</div>';",
  "  d.trainees.forEach(function(t){",
  "    h += '<div class=\"card\"><div class=\"h\">'+esc(t.name)+' &nbsp;'+lvlChip(t.levelKey,t.level)+'</div>'+",
  "      '<div class=\"m\">'+esc(t.phase)+' &middot; '+esc(t.fto||'no FTO')+' &middot; last evaluation '+esc(t.lastEval)+'</div></div>';",
  "  });",
  "  if (d.forms && d.forms.length){",
  "    h += '<h2>If something cannot wait</h2>'+formCards(d.forms);",
  "  }",
  "  h += '<div class=\"next\"><b>Deliberately thin</b>Supervisors get situational awareness, not personnel-development detail.</div>';",
  "  paint(h);",
  "}",
  "function paintMedical(d){",
  "  var h = '<h1>Clinical review</h1><p class=\"sub\">'+d.cases.length+",
  "    (d.cases.length===1?' case':' cases')+' for you. Nothing else.</p>';",
  "  if (!d.cases.length) h += '<div class=\"note n-ok\"><b>Nothing pending</b>No cases require your authority.</div>';",
  "  d.cases.forEach(function(c){",
  "    h += '<button class=\"card act\" style=\"border-left:4px solid var(--pmd)\" '+",
  "      'onclick=\"openRecord('+jsStr(c.trainee)+')\">'+",
  "      '<span class=\"dot due\"></span><span class=\"bd\">'+",
  "      '<span class=\"h\">'+esc(c.trainee)+'</span>'+",
  "      '<span class=\"m\">Raised by '+esc(c.from)+' &middot; '+esc(c.when)+'</span>'+",
  "      '<span class=\"m\" style=\"color:var(--ink-2);margin-top:7px\">'+esc(c.what)+'</span></span>'+",
  "      '<span class=\"go\">&rsaquo;</span></button>';",
  "  });",
  "  h += '<div class=\"next\"><b>Only your cases</b>You never see routine evaluations, reflections, or other trainees.</div>';",
  "  paint(h);",
  "}",
  "",
  "/* ---------------- the record ---------------- */",
  "/* Current first, in full. Everything earlier below it, also in full. The",
  "   raw tabs are untouched; this is a reading of them, not a replacement. */",
  "",
  "function freshRow(list){",
  "  if (!list || !list.length) return '';",
  "  var h = '<div class=\"fresh\">';",
  "  list.forEach(function(f){",
  "    var never = f.ago === 'never';",
  "    h += '<span class=\"'+(never?'never':'')+'\">'+esc(f.title)+' <b>'+esc(f.ago)+'</b>'+",
  "         (f.count>1 ? ' <span style=\"color:var(--ink-3)\">('+f.count+')</span>' : '')+'</span>';",
  "  });",
  "  return h + '</div>';",
  "}",
  "",
  "function openRecord(name){",
  "  S.ctx = { name: name, rec: null, from: S.screen, show: {} };",
  "  S.screen = 'record'; render();",
  "  google.script.run",
  "    .withSuccessHandler(function(r){ S.ctx.rec = r; render(); })",
  "    .withFailureHandler(function(e){ S.ctx.err = e.message || String(e); render(); })",
  "    .recordV1(name);",
  "}",
  "",
  "function paintRecord(){",
  "  var c = S.ctx || {};",
  "  var back = '<button class=\"back\" onclick=\"S.screen=\\''+(c.from||'main')+'\\';render()\">&larr; Back</button>';",
  "  if (c.err) return paint(back+'<h1>'+esc(c.name)+'</h1>'+",
  "    '<div class=\"note n-stop\"><b>Cannot open</b>'+esc(c.err)+'</div>');",
  "  if (!c.rec) return paint(back+'<h1>'+esc(c.name)+'</h1><p class=\"sub\">Reading the record…</p>');",
  "",
  "  var r = c.rec;",
  "  var h = back + '<h1>'+esc(r.name)+'</h1><p class=\"sub\">'+r.total+",
  "    (r.total===1?' submission on file':' submissions on file')+'. Nothing has been removed.</p>';",
  "",
  "  if (r.partial) h += '<div class=\"note n-info\"><b>Part of the record</b>'+esc(r.scopeNote)+'</div>';",
  "  if (r.duplicates) h += '<div class=\"note n-warn\"><b>'+r.duplicates+",
  "    ' possible duplicate'+(r.duplicates===1?'':'s')+'</b>Two submissions of the same kind on the '+",
  "    'same day. Both are kept and both are shown. Which one stands is your call.</div>';",
  "  if (!r.sections.length) h += '<div class=\"note n-info\"><b>Nothing on file</b>No submissions '+",
  "    'have been recorded for this person yet.</div>';",
  "",
  "  r.sections.forEach(function(sec){",
  "    h += '<h2>'+esc(sec.title)+'</h2>';",
  "    h += '<p class=\"sub\" style=\"margin-top:-6px\">Most recent '+esc(sec.newestAgo)+",
  "         ' &middot; '+sec.count+' on file</p>';",
  "    sec.current.forEach(function(s){ h += recCard(s, true); });",
  "    if (sec.earlier.length){",
  "      var open = !!(S.ctx.show||{})[sec.key];",
  "      h += '<button class=\"more\" onclick=\"toggleEarlier(\\''+esc(sec.key)+'\\')\">'+",
  "           (open ? 'Hide' : 'Show')+' '+sec.earlier.length+' earlier '+",
  "           (sec.earlier.length===1?'submission':'submissions')+'</button>';",
  "      if (open) sec.earlier.forEach(function(s){ h += recCard(s, false); });",
  "    }",
  "  });",
  "",
  "  h += '<div class=\"next\"><b>Where this comes from</b>Every row is read straight from the tab the '+",
  "       'form wrote it to. Nothing is edited, moved or deleted to build this screen.</div>';",
  "  paint(h);",
  "}",
  "",
  "function toggleEarlier(key){",
  "  S.ctx.show = S.ctx.show || {};",
  "  S.ctx.show[key] = !S.ctx.show[key];",
  "  render();",
  "}",
  "",
  "function recCard(s, isCurrent){",
  "  var cls = 'rec' + (s.possibleDuplicate ? ' dup' : (isCurrent ? ' cur' : ''));",
  "  var h = '<div class=\"'+cls+'\"><div class=\"when\"><span>'+esc(s.when)+",
  "    (s.by ? ' &middot; '+esc(s.by) : '')+'</span>'+",
  "    (isCurrent ? '<b>Current</b>' : '<span>'+esc(s.ago)+'</span>')+'</div>';",
  "  if (s.group) h += '<div class=\"h\" style=\"margin-top:5px\">'+esc(s.group)+'</div>';",
  "  if (s.possibleDuplicate) h += '<div class=\"m\" style=\"color:var(--stop);margin-top:5px\">'+",
  "    'Possible duplicate - another submission of this kind on the same day.</div>';",
  "  (s.fields||[]).forEach(function(f){",
  "    h += '<div class=\"fld\"><div class=\"l\">'+esc(f.label)+'</div>'+",
  "         '<div class=\"v\">'+esc(f.value)+'</div></div>';",
  "  });",
  "  return h + '</div>';",
  "}",
  "",
  "function reload(){",
  "  google.script.run.withSuccessHandler(function(r){",
  "    BOOT.viewer = r.viewer; BOOT.data = r.data; BOOT.mode = r.mode;",
  "    S.screen = 'main'; render();",
  "  }).withFailureHandler(function(e){ alert(e.message||e); }).refreshV1();",
  "}",
  "",
  "render();",
  "</script>",
  "</body>",
  "</html>",
  ""
].join('\n');
