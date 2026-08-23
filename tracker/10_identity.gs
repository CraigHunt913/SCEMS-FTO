/**
 * SCEMS Field Training Tracker — 10_identity
 *
 * Resolving a person to a role, and the roster behind it.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Stable identity: the person registry, name resolution, FTO scope,
 *   authorization by verified email, and the read-only identity migration
 *   preview.
 *   DESIGN
 *   - Display names remain human-readable everywhere users look.
 *   - Code joins on PERSON IDs once the registry exists; before migration
 *   it falls back to normalized-name resolution that REFUSES ambiguity.
 *   - Two people are never merged because their names match. An ambiguous
 *   resolution returns the ambiguity for human review; it never guesses.
 *   - Historical rows are never rewritten here. The registry is additive.
 */

/* ---------------------------------------------------------------- *
 *  Registry access
 * ---------------------------------------------------------------- */

/** Loads 90 PERSON REGISTRY into lookup maps. Safe before migration:
 *  returns ok:false and empty maps if the sheet does not exist yet. */
function loadRegistryV20_1_() {
  var t = readTableV20_1_(TAB.REGISTRY, 4);
  var out = {
    ok: t.ok, byId: {}, byNorm: {}, byEmployeeId: {}, byEmail: {}, rows: []
  };
  if (!t.ok) return out;
  t.rows.forEach(function (r) {
    var id = String(r[t.col['PERSON ID']] || '').trim();
    if (!id) return;
    var rec = {
      personId: id,
      type: String(r[t.col['TYPE']] || '').trim(),
      name: cleanNameV20_1_(r[t.col['DISPLAY NAME']]),
      norm: String(r[t.col['NORMALIZED NAME']] || '').trim() ||
            normalizeNameV20_1_(r[t.col['DISPLAY NAME']]),
      employeeId: String(r[t.col['EMPLOYEE ID']] || '').trim(),
      email: String(r[t.col['EMAIL']] || '').trim().toLowerCase(),
      certLevel: String(r[t.col['CERT LEVEL']] || '').trim(),
      shift: String(r[t.col['SHIFT']] || '').trim(),
      trainsEmt: String(r[t.col['TRAINS EMT']] || '').trim().toUpperCase() === 'Y',
      trainsAemt: String(r[t.col['TRAINS AEMT']] || '').trim().toUpperCase() === 'Y',
      trainsPmd: String(r[t.col['TRAINS PARAMEDIC']] || '').trim().toUpperCase() === 'Y',
      role: String(r[t.col['ROLE']] || '').trim(),
      active: String(r[t.col['ACTIVE']] || 'Y').trim().toUpperCase() !== 'N'
    };
    out.rows.push(rec);
    out.byId[id] = rec;
    if (rec.norm) {
      if (!out.byNorm[rec.norm]) out.byNorm[rec.norm] = [];
      out.byNorm[rec.norm].push(rec);
    }
    if (rec.employeeId) {
      if (!out.byEmployeeId[rec.employeeId]) out.byEmployeeId[rec.employeeId] = [];
      out.byEmployeeId[rec.employeeId].push(rec);
    }
    if (rec.email) out.byEmail[rec.email] = rec;
  });
  return out;
}

/* ---------------------------------------------------------------- *
 *  Trainee master and FTO roster readers (legacy sheets, read-only)
 * ---------------------------------------------------------------- */

/** All trainee rows from 01 TRAINEE MASTER, header-mapped. */
function masterTraineeRowsV20_1_() {
  var t = readTableV20_1_(TAB.MASTER, 4);
  var out = [];
  if (!t.ok) return out;
  t.rows.forEach(function (r, i) {
    var name = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!name) return;
    out.push({
      row: t.firstDataRow + i,
      name: name,
      rawName: String(r[t.col['TRAINEE']] == null ? '' : r[t.col['TRAINEE']]),
      norm: normalizeNameV20_1_(name),
      employeeId: String(r[t.col['EMPLOYEE ID']] || '').trim(),
      level: String(r[t.col['LEVEL']] || '').trim(),
      entryProfile: String(r[t.col['ENTRY PROFILE']] || '').trim(),
      fto: cleanNameV20_1_(r[t.col['ASSIGNED FTO']]),
      startDate: parseDateSafeV20_1_(r[t.col['START DATE']]),
      phase: String(r[t.col['CURRENT PHASE']] || '').trim(),
      setStatus: String(r[t.col['SET STATUS']] || '').trim(),
      email: String(r[t.col['TRAINEE EMAIL']] || '').trim().toLowerCase(),
      phaseStart: parseDateSafeV20_1_(r[t.col['PHASE START DATE']]),
      closed: /closed|released/i.test(String(r[t.col['SET STATUS']] || ''))
    });
  });
  return out;
}

/** Active (not closed/released) trainees. ZZ TEST rows appear only in
 *  test mode so drills never pollute live dropdowns. */
function activeTraineesV20_1_() {
  var testOk = isTestMode_();
  return masterTraineeRowsV20_1_().filter(function (r) {
    if (r.closed) return false;
    if (r.name.indexOf('EXAMPLE') === 0) return false;
    if (r.name.indexOf(TEST_PREFIX) === 0 && !testOk) return false;
    return true;
  });
}

/** All FTO rows from 22 FTO ROSTER, header-mapped. EMAIL and EMPLOYEE ID
 *  columns are read when present (added by migration). */
function rosterFtoRecordsV20_1_() {
  var t = readTableV20_1_(TAB.FTO_ROSTER, 4);
  var out = [];
  if (!t.ok) return out;
  t.rows.forEach(function (r, i) {
    var name = cleanNameV20_1_(r[t.col['FTO NAME']]);
    if (!name) return;
    out.push({
      row: t.firstDataRow + i,
      name: name,
      norm: normalizeNameV20_1_(name),
      shift: String(r[t.col['SHIFT']] || '').trim(),
      certLevel: String(r[t.col['CERT LEVEL']] || '').trim(),
      trainsEmt: String(r[t.col['TRAINS EMT']] || '').trim().toUpperCase() === 'Y',
      trainsAemt: String(r[t.col['TRAINS AEMT']] || '').trim().toUpperCase() === 'Y',
      trainsPmd: String(r[t.col['TRAINS PARAMEDIC']] || '').trim().toUpperCase() === 'Y',
      active: String(r[t.col['ACTIVE']] || 'Y').trim().toUpperCase() !== 'N',
      email: t.col['EMAIL'] !== undefined ? String(r[t.col['EMAIL']] || '').trim().toLowerCase() : '',
      employeeId: t.col['EMPLOYEE ID'] !== undefined ? String(r[t.col['EMPLOYEE ID']] || '').trim() : ''
    });
  });
  return out;
}

/** Active FTO display names. Name and behavior preserved from v19/v20 —
 *  this remains the single effective definition. */
function ftoList() {
  var out = [];
  rosterFtoRecordsV20_1_().forEach(function (f) {
    if (f.active && out.indexOf(f.name) < 0) out.push(f.name);
  });
  return out;
}

/** Whether an FTO's roster scope permits training the given level. */
function ftoScopeAllowsV20_1_(ftoRec, level) {
  if (!ftoRec) return false;
  if (level === 'EMT') return ftoRec.trainsEmt;
  if (level === 'Advanced EMT') return ftoRec.trainsAemt;
  if (level === 'Paramedic') return ftoRec.trainsPmd;
  return false;
}

/* ---------------------------------------------------------------- *
 *  Resolution : names to people, refusing ambiguity
 * ---------------------------------------------------------------- */

/** Resolves a trainee by display name. Registry first; master fallback.
 *  Returns { ok, record, personId, ambiguous:[], reason }. Never merges,
 *  never guesses between two candidates. */
function resolveTraineeV20_1_(name) {
  var norm = normalizeNameV20_1_(name);
  if (!norm) return { ok: false, record: null, personId: '', ambiguous: [], reason: 'empty name' };
  var reg = loadRegistryV20_1_();
  if (reg.ok) {
    var hits = (reg.byNorm[norm] || []).filter(function (p) { return p.type === 'TRAINEE'; });
    if (hits.length === 1) {
      var masterHit = masterTraineeRowsV20_1_().filter(function (m) { return m.norm === norm; });
      return { ok: true, record: masterHit[0] || null, personId: hits[0].personId, ambiguous: [], reason: '' };
    }
    if (hits.length > 1) {
      return { ok: false, record: null, personId: '', ambiguous: hits.map(function (h) { return h.personId; }),
               reason: 'ambiguous: ' + hits.length + ' registry people share this name' };
    }
  }
  var m = masterTraineeRowsV20_1_().filter(function (r) { return r.norm === norm; });
  if (m.length === 1) return { ok: true, record: m[0], personId: '', ambiguous: [], reason: '' };
  if (m.length > 1) {
    return { ok: false, record: null, personId: '', ambiguous: m.map(function (x) { return 'master row ' + x.row; }),
             reason: 'ambiguous: ' + m.length + ' master rows share this name' };
  }
  return { ok: false, record: null, personId: '', ambiguous: [], reason: 'not found' };
}

/** Resolves an FTO by display name against the roster. */
function resolveFtoV20_1_(name) {
  var norm = normalizeNameV20_1_(name);
  if (!norm) return { ok: false, record: null, reason: 'empty name' };
  var hits = rosterFtoRecordsV20_1_().filter(function (f) { return f.norm === norm; });
  if (hits.length === 1) return { ok: true, record: hits[0], reason: '' };
  if (hits.length > 1) return { ok: false, record: null, reason: 'ambiguous: ' + hits.length + ' roster rows' };
  return { ok: false, record: null, reason: 'not on the FTO roster' };
}

/* ---------------------------------------------------------------- *
 *  Authorization : verified email → roles
 * ---------------------------------------------------------------- */

/** Maps a VERIFIED email address to roles. The allowlist is the person
 *  registry's EMAIL column plus the configured leadership addresses.
 *  A typed name is never an identity; only this function grants roles. */
function resolveAuthorizedActorV20_1_(email) {
  var e = String(email || '').trim().toLowerCase();
  var out = { email: e, roles: [], person: null, ftoRecord: null, ok: false };
  if (!isValidEmailV20_1_(e)) return out;

  if (e === String(CONFIG.FTO_PROGRAM_DIRECTOR || '').toLowerCase()) out.roles.push('PROGRAM_DIRECTOR');
  if (e === String(CONFIG.TCO_EMAIL).toLowerCase()) out.roles.push('TRAINING_DIVISION');
  if (e === String(CONFIG.CHIEF_EMAIL).toLowerCase()) out.roles.push('COMMAND');
  if (e === String(CONFIG.ACHIEF_EMAIL).toLowerCase()) out.roles.push('COMMAND');
  if (e === String(CONFIG.MD_EMAIL).toLowerCase()) out.roles.push('MEDICAL_DIRECTOR');
  String(CONFIG.SUPERVISOR_EMAILS).toLowerCase().split(/[,;\s]+/).forEach(function (s) {
    if (s && s === e && out.roles.indexOf('PROGRAM') < 0) out.roles.push('PROGRAM');
  });
  Object.keys(SHIFT_SUPERVISORS_V19).forEach(function (s) {
    var v = SHIFT_SUPERVISORS_V19[s];
    if (String(v.email || '').toLowerCase() === e || String(v.assist || '').toLowerCase() === e) {
      if (out.roles.indexOf('SUPERVISOR') < 0) out.roles.push('SUPERVISOR');
    }
  });

  var reg = loadRegistryV20_1_();
  // v20.1.0e: the roster's EMAIL column is part of the allowlist directly,
  // so filling tab 22 alone authorizes an FTO — no registry mirroring step.
  if (reg.ok && !reg.byEmail[e]) {
    var rosterHit = rosterFtoRecordsV20_1_().filter(function (f) {
      return f.email === e && f.active;
    })[0];
    if (rosterHit) {
      reg.byEmail[e] = {
        personId: 'ROSTER:' + rosterHit.norm, type: 'FTO', name: rosterHit.name,
        norm: rosterHit.norm, employeeId: rosterHit.employeeId, email: e,
        certLevel: rosterHit.certLevel, role: '', active: true
      };
    }
  }
  if (reg.ok && reg.byEmail[e]) {
    out.person = reg.byEmail[e];
    if (out.person.type === 'FTO' && out.person.active) out.roles.push('FTO');
    if (out.person.type === 'TRAINEE' && out.person.active) out.roles.push('TRAINEE');
    if (out.person.role && /chief|director|leader/i.test(out.person.role)) {
      if (out.roles.indexOf('TRAINING_DIVISION') < 0) out.roles.push('TRAINING_DIVISION');
    }
  }
  if (out.roles.indexOf('FTO') >= 0 && out.person) {
    var f = rosterFtoRecordsV20_1_().filter(function (r) { return r.norm === out.person.norm; });
    out.ftoRecord = f.length === 1 ? f[0] : null;
  }
  out.ok = out.roles.length > 0;
  return out;
}

/** True when the actor may view/receive this trainee's development record:
 *  Training Division and Medical Director always; an FTO when the trainee
 *  is active and the FTO's roster scope covers the trainee's level. */
function actorMayViewTraineeV20_1_(actor, traineeRecord) {
  if (!actor || !actor.ok || !traineeRecord) return false;
  if (actor.roles.indexOf('PROGRAM_DIRECTOR') >= 0) return true;
  if (actor.roles.indexOf('TRAINING_DIVISION') >= 0) return true;
  if (actor.roles.indexOf('MEDICAL_DIRECTOR') >= 0) return true;
  if (actor.roles.indexOf('COMMAND') >= 0) return true;
  if (actor.roles.indexOf('FTO') >= 0 && actor.ftoRecord && actor.ftoRecord.active) {
    if (traineeRecord.closed) return false;
    return ftoScopeAllowsV20_1_(actor.ftoRecord, traineeRecord.level);
  }
  return false;
}

/* ---------------------------------------------------------------- *
 *  Identity issue detection (read-only)
 * ---------------------------------------------------------------- */

function levenshteinV20_1_(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  var m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  var prev = [], cur = [];
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    cur[0] = i;
    for (var k = 1; k <= n; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1,
        prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1));
    }
    var t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/** Scans master, roster, archive, and decision logs for identity defects.
 *  Read-only; returns a structured report used by the audit and by the
 *  migration preview. */
function identityIssuesV20_1_() {
  var issues = { duplicateEmployeeIds: [], whitespaceNames: [], nearDuplicates: [],
                 missingEmployeeIds: [], missingEmails: [], archiveConflicts: [],
                 deciderVariants: [], closedWithOpenWork: [] };
  var trainees = masterTraineeRowsV20_1_();

  var byEmp = {};
  trainees.forEach(function (r) {
    if (!r.employeeId) { issues.missingEmployeeIds.push(r.name + ' (row ' + r.row + ')'); return; }
    if (!byEmp[r.employeeId]) byEmp[r.employeeId] = [];
    byEmp[r.employeeId].push(r);
  });
  Object.keys(byEmp).forEach(function (id) {
    if (byEmp[id].length > 1) {
      issues.duplicateEmployeeIds.push(id + ' → ' +
        byEmp[id].map(function (r) { return r.name + ' (row ' + r.row + ')'; }).join(' AND '));
    }
  });

  trainees.forEach(function (r) {
    if (r.rawName !== r.name) {
      issues.whitespaceNames.push('master row ' + r.row + ': "' + r.rawName + '" → "' + r.name + '"');
    }
    if (!r.email) issues.missingEmails.push(r.name + ' (row ' + r.row + ')');
  });

  for (var i = 0; i < trainees.length; i++) {
    for (var j = i + 1; j < trainees.length; j++) {
      var d = levenshteinV20_1_(trainees[i].norm, trainees[j].norm);
      if (d > 0 && d <= 2 && trainees[i].employeeId !== trainees[j].employeeId) {
        issues.nearDuplicates.push('"' + trainees[i].name + '" (row ' + trainees[i].row +
          ', ' + (trainees[i].employeeId || 'no ID') + ') vs "' + trainees[j].name +
          '" (row ' + trainees[j].row + ', ' + (trainees[j].employeeId || 'no ID') +
          ') : distance ' + d + ' — HUMAN REVIEW, never auto-merged');
      }
    }
  }

  var arch = readTableV20_1_(TAB.ARCHIVE, 4);
  if (arch.ok) {
    arch.rows.forEach(function (r, k) {
      var an = normalizeNameV20_1_(r[arch.col['TRAINEE']]);
      if (!an) return;
      // A VOID annotation in NOTES marks an archive row recorded in error
      // (trainee never actually left). Honored here; the row itself stays.
      if (arch.col['NOTES'] !== undefined &&
          String(r[arch.col['NOTES']] || '').indexOf('VOID') >= 0) return;
      trainees.forEach(function (t) {
        if (t.norm === an && !t.closed) {
          issues.archiveConflicts.push(cleanNameV20_1_(r[arch.col['TRAINEE']]) +
            ': archived (archive row ' + (arch.firstDataRow + k) + ') yet active on master row ' + t.row);
        }
      });
    });
  }

  var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  var variants = {};
  if (so.ok && so.col['DECIDED BY'] !== undefined) {
    so.rows.forEach(function (r) {
      var raw = String(r[so.col['DECIDED BY']] || '').trim();
      if (!raw) return;
      var key = normalizeNameV20_1_(raw).replace(/[.\s]/g, '');
      if (!variants[key]) variants[key] = {};
      variants[key][raw] = true;
    });
    Object.keys(variants).forEach(function (k) {
      var forms = Object.keys(variants[k]);
      if (forms.length > 1) issues.deciderVariants.push(forms.join(' / '));
    });
  }

  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok) {
    var closedNorms = {};
    trainees.forEach(function (t) { if (t.closed) closedNorms[t.norm] = t.name; });
    q.rows.forEach(function (r, k) {
      var tn = normalizeNameV20_1_(r[q.col['TRAINEE']]);
      var st = String(r[q.col['RECORD STATUS']] || '').trim();
      if (closedNorms[tn] && st === 'OPEN') {
        issues.closedWithOpenWork.push(closedNorms[tn] + ': open queue row ' + (q.firstDataRow + k));
      }
    });
  }
  return issues;
}

/* ---------------------------------------------------------------- *
 *  Identity migration preview (READ-ONLY)
 * ---------------------------------------------------------------- */

/** Builds the proposed person registry without writing anything.
 *  Every proposed row, ambiguity, duplicate, and orphan is listed.
 *  Ambiguous people are marked NEEDS HUMAN REVIEW and are excluded from
 *  any later apply step until resolved. */
function previewIdentityMigrationV20_1() {
  var trainees = masterTraineeRowsV20_1_();
  var ftos = rosterFtoRecordsV20_1_();
  var issues = identityIssuesV20_1_();
  var proposed = [];
  var flagged = [];

  var empSeen = {};
  trainees.forEach(function (r) {
    var dupEmp = r.employeeId && empSeen[r.employeeId];
    empSeen[r.employeeId] = true;
    var problems = [];
    if (!r.employeeId) problems.push('missing employee ID');
    if (dupEmp) problems.push('duplicate employee ID ' + r.employeeId);
    if (r.rawName !== r.name) problems.push('whitespace repaired in display name');
    var entry = {
      personId: 'P-TRN-' + (r.employeeId ? r.employeeId.replace(/\s+/g, '') : 'ROW' + r.row),
      type: 'TRAINEE', name: r.name, norm: r.norm,
      employeeId: r.employeeId, email: r.email, certLevel: r.level,
      active: !r.closed, source: 'master row ' + r.row, problems: problems
    };
    if (dupEmp || !r.employeeId) { flagged.push(entry); } else { proposed.push(entry); }
  });

  ftos.forEach(function (f) {
    var problems = [];
    if (!f.email) problems.push('no verified email on roster (EMAIL column) — cannot be authorized until added');
    proposed.push({
      personId: 'P-FTO-' + f.norm.replace(/[^a-z0-9]+/g, '').slice(0, 16).toUpperCase(),
      type: 'FTO', name: f.name, norm: f.norm, employeeId: f.employeeId,
      email: f.email, certLevel: f.certLevel, active: f.active,
      source: 'roster row ' + f.row, problems: problems
    });
  });

  var L = [];
  L.push('IDENTITY MIGRATION PREVIEW — READ ONLY. Nothing was written.');
  L.push('');
  L.push('Proposed registry rows : ' + proposed.length);
  L.push('Held for human review  : ' + flagged.length);
  L.push('');
  L.push('HELD ROWS (excluded from any apply until a human resolves them):');
  if (!flagged.length) L.push('   none');
  flagged.forEach(function (p) {
    L.push('   ' + p.name + ' [' + (p.employeeId || 'NO ID') + '] : ' + p.problems.join('; '));
  });
  L.push('');
  L.push('DUPLICATE EMPLOYEE IDS : ' + issues.duplicateEmployeeIds.length);
  issues.duplicateEmployeeIds.forEach(function (x) { L.push('   ' + x); });
  L.push('NEAR-DUPLICATE NAMES (never auto-merged) : ' + issues.nearDuplicates.length);
  issues.nearDuplicates.forEach(function (x) { L.push('   ' + x); });
  L.push('WHITESPACE-DAMAGED NAMES : ' + issues.whitespaceNames.length);
  issues.whitespaceNames.forEach(function (x) { L.push('   ' + x); });
  L.push('ARCHIVE / MASTER CONFLICTS : ' + issues.archiveConflicts.length);
  issues.archiveConflicts.forEach(function (x) { L.push('   ' + x); });
  L.push('DECIDED-BY SPELLING VARIANTS : ' + issues.deciderVariants.length);
  issues.deciderVariants.forEach(function (x) { L.push('   ' + x); });
  L.push('FTOs WITHOUT VERIFIED EMAIL : ' +
    proposed.filter(function (p) { return p.type === 'FTO' && p.problems.length; }).length);
  L.push('');
  L.push('Historical records are NOT rewritten by this migration. New writes');
  L.push('carry person IDs; old rows keep their original text and are joined');
  L.push('through the registry at read time.');

  var msg = L.join('\n');
  Logger.log(msg);
  return { text: msg, proposed: proposed, flagged: flagged, issues: issues };
}

/* ---- ported from zz (effective winner) ---- */
/** Who is using the sheet, as a name rather than an address. */
function currentDeciderV19_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  if (!email) {
    try { email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  }
  var map = {
    'kstuckey@sumtercountysc.gov':  'K. Stuckey',
    'craighunt913@gmail.com':       'C. Hunt',
    'leeturnermd@gmail.com':        'Dr. J. Turner',
    'kehall@sumtercountysc.gov':    'Chief K. Hall',
    'jparnell@sumtercountysc.gov':  'A/C J. Parnell'
  };
  if (map[email]) return map[email];
  if (!email) return 'unidentified user';
  return email;
}

/* ---- ported from master (effective winner) ---- */
function masterTraineeMapV19_() {
  var map = {};
  var sh = ss().getSheetByName(TAB.MASTER);
  if (!sh) return map;
  sh.getRange(5, 1, 40, 10).getValues().forEach(function (r) {
    var name = String(r[0] || '').trim();
    if (!name || name.indexOf('EXAMPLE') === 0) return;
    map[name] = {
      level: String(r[2] || '').trim(),
      phase: String(r[6] || '').trim(),
      status: String(r[7] || '').trim()
    };
  });
  return map;
}

/* ---- ported from zz (effective winner) ---- */
function traineeRecordV19_(name) {
  var sh = ss().getSheetByName(TAB.MASTER);
  if (!sh) return null;
  var rows = sh.getRange(5, 1, 40, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(name).trim()) {
      return {
        row: i + 5,
        name: String(rows[i][0]).trim(),
        level: String(rows[i][2] || '').trim(),
        entry: String(rows[i][3] || '').trim(),
        fto: String(rows[i][4] || '').trim(),
        phase: String(rows[i][6] || '').trim(),
        status: String(rows[i][7] || '').trim(),
        email: String(rows[i][8] || '').trim()
      };
    }
  }
  return null;
}

/* ---- ported from zz (effective winner) ---- */
/** Maps a grid column back to the single-letter stage the system stores. */
function stageLetterV19_(columnLabel) {
  var map = {
    'Observed': 'O',
    'Assisted': 'A',
    'Performed with coaching': 'P',
    'Performed independently': 'I'
  };
  return map[String(columnLabel).trim()] || '';
}

/* ---- ported from zz (effective winner) ---- */
/** Prompting, derived from the stage rather than asked. */
function promptingForStageV19_(letter) {
  if (letter === 'I') return 'None';
  if (letter === 'P') return 'Moderate coaching';
  if (letter === 'A') return 'Full takeover';
  return 'Minimal verbal cue';
}

function stageRankV19_(stage) {
  return { '': 0, O: 1, A: 2, P: 3, I: 4 }[String(stage || '').toUpperCase()] || 0;
}
