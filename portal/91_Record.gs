/**
 * Permanent writers that used to stop at "stage it for the tracker."
 *
 * Sign-off: append 21 SKILL SIGN-OFF LOG, close the queue row, touch the matrix.
 * Coaching: FTO / Division file a note on PORTAL COACHING.
 * Assign: Division sets ASSIGNED FTO from Field Training.
 * Matrix seed: after enroll, put catalog rows on 05 SKILLS PROGRESS when possible.
 */

var PORTAL_OVERRIDE_MARKER = '[THRESHOLD OVERRIDE]';
var PORTAL_CATALOG_TAB = '15 SKILL CATALOG';

/** Approve — permanent. */
function approveSignoffV1(row, reason, requestId) {
  return recordSignoffDecisionV1_(row, reason, requestId, 'Approve sign-off');
}

/** Return — permanent (RETURNED on the queue, row on the sign-off log). */
function returnSignoffV1(row, reason, requestId) {
  return recordSignoffDecisionV1_(row, reason, requestId, 'Return for more evidence');
}

/**
 * One writer for Division sign-off decisions from Field Training.
 * Mirrors the tracker's recordDecisionForRow gates that matter here:
 * OPEN only, typed reason, no prior DECISION, request-id match, evidence gate
 * on Approve, then append the permanent log and close the queue row.
 */
function recordSignoffDecisionV1_(row, reason, requestId, decision) {
  requireWritableV1_('record a sign-off decision');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may decide a sign-off.');
  }
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why you are deciding this. It goes on the permanent record in your name.');
  }

  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) throw new Error('No queue.');
  var r = requireLocalRowV1_(t, row, 'decide that sign-off');

  var need = ['DECISION', 'DECIDED BY', 'DECISION DATE', 'RATIONALE', 'RECORD STATUS'];
  var missing = [];
  need.forEach(function (h) { if (t.col[h] === undefined) missing.push(h); });
  if (missing.length) {
    throw new Error('The queue is missing ' + missing.join(', ') +
      '. Nothing was written. Fix the header row in the tracker first.');
  }

  var live = t.rows[r - t.firstDataRow] || [];
  var want = String(requestId == null ? '' : requestId).trim();
  var have = t.col['REQUEST ID'] === undefined ? ''
           : String(live[t.col['REQUEST ID']] || '').trim();
  if (want && have && want !== have) {
    throw new Error('That is not the row you were looking at any more — the queue moved ' +
      'underneath you. Nothing was written. Reload and try again.');
  }

  var status = String(live[t.col['RECORD STATUS']] || '').trim();
  if (status !== 'OPEN') {
    throw new Error('That row is ' + (status || 'blank') + ', not OPEN. Nothing was written.');
  }
  var already = String(live[t.col['DECISION']] || '').trim();
  if (already) {
    throw new Error('A decision is already on that row (' + already +
      '). Nothing was written. Reload — if it is still open in the tracker, finish or clear it there.');
  }

  var trainee = String(live[t.col['TRAINEE']] || '').trim();
  var skill = String(live[t.col['SKILL']] || '').trim();
  var skillId = t.col['SKILL ID'] !== undefined
    ? String(live[t.col['SKILL ID']] || '').trim() : '';
  if (!trainee) throw new Error('That queue row has no trainee. Nothing was written.');

  var gate = portalEvidenceGateV1_(decision, trainee, skill, skillId, why);
  if (gate) throw new Error(gate);

  if (!ensureSignoffLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL.TAB.SIGNOFF +
      ', so nothing was written. A decision with nowhere permanent to live is worse than none.');
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var decisionId = 'SD-P-' + String(new Date().getTime());
  var recordStatus = decision === 'Return for more evidence' ? 'RETURNED' : 'RECORDED';

  appendSignoffLogV1_({
    decisionId: decisionId,
    when: new Date(),
    trainee: trainee,
    skill: skill,
    skillId: skillId,
    decision: decision,
    decidedBy: viewer.email,
    decisionDate: today,
    rationale: why,
    sourceRow: r,
    requestId: have || want || ''
  });

  t.sheet.getRange(r, t.col['DECISION'] + 1).setValue(decision);
  t.sheet.getRange(r, t.col['DECIDED BY'] + 1).setValue(viewer.email);
  t.sheet.getRange(r, t.col['DECISION DATE'] + 1).setValue(today);
  t.sheet.getRange(r, t.col['RATIONALE'] + 1).setValue(clean_(why));
  t.sheet.getRange(r, t.col['RECORD STATUS'] + 1).setValue(recordStatus);

  try {
    touchMatrixAfterSignoffV1_(trainee, skill, skillId, decision, viewer.email, today, why);
  } catch (eM) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('SIGN-OFF RECORDED', viewer.email, decision + ' | ' + decisionId +
    ' | row ' + r + (have ? ' | ' + have : '') + ' | ' + why.slice(0, 120));

  return decision === 'Return for more evidence'
    ? 'Returned on the tracker: queue ' + recordStatus + ', sign-off log, matrix updated.'
    : 'Accepted on the tracker: queue closed, permanent sign-off log, matrix SIGNED OFF.';
}

/**
 * Accept a skill from Field Training even when no OPEN queue card is on Home yet.
 * Ensures an OPEN queue row on the live tracker, then records Approve sign-off
 * (sign-off log + queue RECORDED + matrix SIGNED OFF).
 */
function acceptSkillV1(traineeName, skillId, skillName, reason) {
  requireWritableV1_('accept a skill sign-off');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may accept a skill sign-off.');
  }
  var trainee = String(traineeName || '').trim();
  var skill = String(skillName || '').trim();
  var sid = String(skillId || '').trim();
  var why = String(reason || '').trim();
  if (!trainee) throw new Error('Missing trainee.');
  if (!skill && !sid) throw new Error('Missing skill.');
  if (why.length < 8) {
    throw new Error('Type why you are accepting this. It goes on the permanent record in your name.');
  }

  var skills = [];
  try { skills = skillsForV1_(normNameV1_(trainee)); } catch (eS) { skills = []; }
  var hit = null;
  skills.forEach(function (s) {
    if (hit) return;
    if (sid && s.skillId && String(s.skillId) === sid) hit = s;
    else if (skill && normNameV1_(s.skill) === normNameV1_(skill)) hit = s;
  });
  if (hit && hit.signed) {
    throw new Error('That skill is already SIGNED OFF on the matrix. Nothing was written.');
  }
  if (!skill && hit) skill = hit.skill;
  if (!sid && hit) sid = hit.skillId || '';

  var gate = portalEvidenceGateV1_('Approve sign-off', trainee, skill, sid, why);
  if (gate) throw new Error(gate);

  var ensured = ensureOpenQueueRowForSkillV1_(trainee, skill, sid, hit);
  return recordSignoffDecisionV1_(ensured.row, why, ensured.requestId, 'Approve sign-off');
}

/** Find or append an OPEN validation-queue row for this trainee + skill. */
function ensureOpenQueueRowForSkillV1_(trainee, skill, skillId, skillHit) {
  var queue = readTabV1_(PORTAL.TAB.QUEUE);
  if (!queue.ok) throw new Error('No validation queue on the tracker.');
  var needQ = ['TRAINEE', 'SKILL', 'RECORD STATUS'];
  var missingQ = needQ.filter(function (h) { return queue.col[h] === undefined; });
  if (missingQ.length) {
    throw new Error('The queue is missing ' + missingQ.join(', ') + '. Nothing was written.');
  }

  var tn = normNameV1_(trainee);
  var sk = normNameV1_(skill);
  var sid = String(skillId || '').trim();
  var found = null;
  queue.rows.forEach(function (r, i) {
    if (found) return;
    if (String(r[queue.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    if (normNameV1_(r[queue.col['TRAINEE']]) !== tn) return;
    var idHit = sid && queue.col['SKILL ID'] !== undefined &&
      String(r[queue.col['SKILL ID']] || '').trim() === sid;
    var nameHit = sk && normNameV1_(r[queue.col['SKILL']]) === sk;
    if (!idHit && !nameHit) return;
    found = {
      row: queue.firstDataRow + i,
      requestId: queue.col['REQUEST ID'] !== undefined
        ? String(r[queue.col['REQUEST ID']] || '').trim() : ''
    };
  });
  if (found) return found;

  var succ = skillHit ? Number(skillHit.successful || 0) : 0;
  var indep = skillHit ? Number(skillHit.independent || 0) : 0;
  var dates = skillHit ? Number(skillHit.distinctDates || 0) : 0;
  var ftos = skillHit ? Number(skillHit.distinctFtos || 0) : 0;
  var evidence = succ + ' successful, ' + indep + ' independent, ' +
    dates + ' dates, ' + ftos + ' FTOs';
  var requestId = 'QR-P-' + String(new Date().getTime());
  var domain = '';
  try {
    var matrix = readTabV1_(PORTAL.TAB.SKILLS);
    if (matrix.ok && matrix.col['DOMAIN'] !== undefined) {
      matrix.rows.forEach(function (r) {
        if (domain) return;
        if (normNameV1_(r[matrix.col['TRAINEE']]) !== tn) return;
        var idHit = sid && matrix.col['SKILL ID'] !== undefined &&
          String(r[matrix.col['SKILL ID']] || '').trim() === sid;
        var nameHit = sk && normNameV1_(r[matrix.col['SKILL']]) === sk;
        if (idHit || nameHit) domain = String(r[matrix.col['DOMAIN']] || '').trim();
      });
    }
  } catch (eD) {}

  var line = queue.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'READY DATE' || H === 'LAST EVIDENCE DATE') return new Date();
    if (H === 'TRAINEE') return trainee;
    if (H === 'SKILL ID') return sid;
    if (H === 'DOMAIN') return domain;
    if (H === 'SKILL') return skill;
    if (H === 'EVIDENCE SUMMARY') return evidence;
    if (H === 'RECORD STATUS') return 'OPEN';
    if (H === 'REQUEST ID') return requestId;
    return '';
  });
  queue.sheet.appendRow(line);
  forgetTabsV1_();
  var again = readTabV1_(PORTAL.TAB.QUEUE);
  if (!again.ok) throw new Error('Queue append failed.');
  var rowNum = again.firstDataRow + again.rows.length - 1;
  return { row: rowNum, requestId: requestId };
}

/**
 * Approve without READY FOR VALIDATION needs an explicit override in the reason —
 * unless the matrix bars (or the evidence log) already meet the bar. Stale
 * readiness from a stuck tracker rebuild must not trap Division.
 */
function portalEvidenceGateV1_(decision, trainee, skill, skillId, rationale) {
  if (decision !== 'Approve sign-off') return '';
  if (String(rationale).indexOf(PORTAL_OVERRIDE_MARKER) >= 0) return '';
  var skills = [];
  try { skills = skillsForV1_(normNameV1_(trainee)); } catch (e) { return ''; }
  if (!skills.length) return '';
  var hit = null;
  skills.forEach(function (s) {
    if (hit) return;
    if (skillId && s.skillId && String(s.skillId) === String(skillId)) hit = s;
    else if (normNameV1_(s.skill) === normNameV1_(skill)) hit = s;
  });
  if (!hit) return '';
  if (hit.signed) return '';
  if (/READY FOR VALIDATION/i.test(hit.readiness || '')) return '';
  if (skillBarsMetV1_(hit)) return '';
  var fromLog = evidenceCountsForSkillV1_(trainee, skill, skillId);
  if (fromLog && skillCountsMeetBarsV1_(fromLog, hit.bars)) return '';
  return 'The matrix does not call this READY FOR VALIDATION (it reads "' +
    (hit.readiness || 'blank') + '"). Run Sync matrix from evidence first, or type ' +
    PORTAL_OVERRIDE_MARKER + ' in your reason if you are overruling it. Nothing was written.';
}

function skillBarsMetV1_(hit) {
  var bars = (hit && hit.bars) || [];
  if (!bars.length) return false;
  for (var i = 0; i < bars.length; i++) {
    if (Number(bars[i].have || 0) < Number(bars[i].need || 0)) return false;
  }
  return true;
}

function skillCountsMeetBarsV1_(counts, bars) {
  if (!counts || !bars || !bars.length) return false;
  var map = {
    Successful: counts.successful,
    Independent: counts.independent,
    Dates: counts.distinctDates,
    FTOs: counts.distinctFtos
  };
  for (var i = 0; i < bars.length; i++) {
    var have = map[bars[i].label];
    if (have == null) have = 0;
    if (Number(have) < Number(bars[i].need || 0)) return false;
  }
  return true;
}

/** Event date on the evidence log — live tabs use SHIFT DATE / TIMESTAMP. */
function evidenceEventDateV1_(ev, r) {
  var cols = ['SHIFT DATE', 'EVENT DATE', 'DATE', 'TIMESTAMP'];
  for (var i = 0; i < cols.length; i++) {
    if (ev.col[cols[i]] === undefined) continue;
    var d = asDateV1_(r[ev.col[cols[i]]]);
    if (d) return d;
  }
  return null;
}

function evidenceAcceptedV1_(r, ev) {
  if (ev.col['VALIDATION RESULT'] === undefined) return true;
  var v = String(r[ev.col['VALIDATION RESULT']] || '').trim();
  if (!v) return true;
  return v === 'ACCEPTED' || v.indexOf('LEGACY IMPORT') === 0;
}

/**
 * Aggregate successful evidence for one trainee + skill from the log.
 * Mirrors the tracker's matrix counters enough for desk sync / gates.
 */
function evidenceCountsForSkillV1_(trainee, skill, skillId) {
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (!ev.ok || ev.col['TRAINEE'] === undefined) return null;
  var tn = normNameV1_(trainee);
  var sk = normNameV1_(skill);
  var sid = String(skillId || '').trim();
  var successful = [];
  ev.rows.forEach(function (r) {
    if (normNameV1_(r[ev.col['TRAINEE']]) !== tn) return;
    if (!evidenceAcceptedV1_(r, ev)) return;
    var idHit = sid && ev.col['SKILL ID'] !== undefined &&
      String(r[ev.col['SKILL ID']] || '').trim() === sid;
    var nameHit = ev.col['SKILL'] !== undefined &&
      normNameV1_(r[ev.col['SKILL']]) === sk;
    if (!idHit && !nameHit) return;
    var outcome = ev.col['OUTCOME'] !== undefined
      ? String(r[ev.col['OUTCOME']] || '').trim() : 'Successful';
    if (outcome && outcome !== 'Successful') return;
    var stage = ev.col['STAGE'] !== undefined
      ? String(r[ev.col['STAGE']] || '').trim().toUpperCase() : 'P';
    if (stage && stage !== 'P' && stage !== 'I') return;
    successful.push({
      stage: stage || 'P',
      when: evidenceEventDateV1_(ev, r),
      fto: ev.col['FTO'] !== undefined ? String(r[ev.col['FTO']] || '').trim() : ''
    });
  });
  if (!successful.length) return { successful: 0, independent: 0, distinctDates: 0, distinctFtos: 0, lastDate: null, stage: '' };
  var dates = {}, ftos = {}, indep = 0, stage = '', last = null;
  successful.forEach(function (e) {
    if (e.stage === 'I') indep++;
    if (e.stage === 'I' || e.stage === 'P') {
      if (!stage || (e.stage === 'I' && stage !== 'I')) stage = e.stage;
    }
    if (e.when) {
      dates[e.when.toDateString()] = true;
      if (!last || e.when > last) last = e.when;
    }
    if (e.fto) ftos[normNameV1_(e.fto)] = true;
  });
  return {
    successful: successful.length,
    independent: indep,
    distinctDates: Object.keys(dates).length,
    distinctFtos: Object.keys(ftos).length,
    lastDate: last,
    stage: stage
  };
}

function ensureSignoffLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.SIGNOFF)) return true;
    var sh = book.insertSheet(PORTAL.TAB.SIGNOFF);
    sh.getRange(1, 1).setValue(
      'Permanent skill sign-off decisions. Append-only. Field Training writes here.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 12).setValues([[
      'DECISION ID', 'TIMESTAMP', 'TRAINEE', 'SKILL ID', 'SKILL', 'DECISION',
      'DECIDED BY', 'DECISION DATE', 'EXPIRATION', 'RATIONALE',
      'SOURCE QUEUE ROW', 'REQUEST ID'
    ]]).setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

/** Header-mapped append — works against live tracker headers or staging's shorter set. */
function appendSignoffLogV1_(f) {
  var t = readTabV1_(PORTAL.TAB.SIGNOFF);
  if (!t.ok) throw new Error('No sign-off log.');
  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'DECISION ID') return f.decisionId || '';
    if (H === 'TIMESTAMP' || H === 'SIGN-OFF DATE') return f.when || new Date();
    if (H === 'TRAINEE') return f.trainee || '';
    if (H === 'SKILL ID') return f.skillId || '';
    if (H === 'SKILL') return f.skill || '';
    if (H === 'DECISION') return f.decision || '';
    if (H === 'DECIDED BY' || H === 'SIGNED OFF BY') return f.decidedBy || '';
    if (H === 'DECISION DATE') return f.decisionDate || f.when || '';
    if (H === 'EXPIRATION') return '';
    if (H === 'RATIONALE') return f.rationale || '';
    if (H === 'SOURCE QUEUE ROW') return f.sourceRow || '';
    if (H === 'REQUEST ID') return f.requestId || '';
    if (H === 'SUPERSEDES') return '';
    if (H === 'STANDARD / CATALOG VERSION') return '';
    if (H === 'DECIDED BY PERSON ID') return f.decidedBy || '';
    if (H === 'WRITER VERSION') return PORTAL.VERSION;
    return '';
  });
  t.sheet.appendRow(row);
}

/**
 * Write the live tracker matrix so Home / clearance / truck gates see the
 * decision without waiting on a full tracker rebuild.
 */
function touchMatrixAfterSignoffV1_(trainee, skill, skillId, decision, decidedBy, decisionDate, rationale) {
  var t = readTabV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return;
  if (t.col['SIGN-OFF'] === undefined && t.col['READINESS'] === undefined) return;
  var norm = normNameV1_(trainee);
  var skillNorm = normNameV1_(skill);
  var by = String(decidedBy || '').trim();
  var when = decisionDate instanceof Date ? decisionDate : new Date();
  var note = String(rationale || '').trim().slice(0, 240);
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    var idHit = skillId && t.col['SKILL ID'] !== undefined &&
      String(r[t.col['SKILL ID']] || '').trim() === skillId;
    var nameHit = normNameV1_(r[t.col['SKILL']]) === skillNorm;
    if (!idHit && !nameHit) return;
    var row = t.firstDataRow + i;
    function setCol(name, value) {
      if (t.col[name] === undefined) return;
      t.sheet.getRange(row, t.col[name] + 1).setValue(value);
    }
    if (decision === 'Approve sign-off') {
      setCol('SIGN-OFF', 'SIGNED OFF');
      setCol('READINESS', 'SIGNED OFF');
      setCol('SIGNED BY', by);
      setCol('SIGNED DATE', when);
      if (note) setCol('DECISION / EVIDENCE NOTE', note);
    } else if (decision === 'Return for more evidence') {
      setCol('READINESS', 'NEEDS MORE EVIDENCE');
      setCol('SIGN-OFF', '');
      setCol('SIGNED BY', '');
      setCol('SIGNED DATE', '');
      if (note) setCol('DECISION / EVIDENCE NOTE', note);
    }
  });
}

/* ---------------- coaching create ---------------- */

function ensureCoachingLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.COACHING)) return true;
    var sh = book.insertSheet(PORTAL.TAB.COACHING);
    sh.getRange(1, 1).setValue(
      'Coaching notes filed from Field Training. Trainees acknowledge here.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 5)
      .setValues([['DATE', 'TRAINEE', 'FROM', 'NOTE', 'ACKNOWLEDGED']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

/**
 * FTO (their trainee) or Division files a coaching note.
 * Trainee ack path (ackCoachingV1) already exists.
 */
function createCoachingV1(traineeName, note) {
  requireWritableV1_('file a coaching note');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.FTO && viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only a training officer or Training Division may file coaching.');
  }
  var who = String(traineeName || '').trim();
  var text = String(note || '').trim();
  if (!who) throw new Error('Pick a trainee.');
  if (text.length < 8) {
    throw new Error('Type the note. It goes on their record in your name.');
  }

  var rec = null;
  try {
    traineesV1_().forEach(function (t) {
      if (!rec && normNameV1_(t.name) === normNameV1_(who) && !t.closed) rec = t;
    });
  } catch (e) {}
  if (!rec) throw new Error('No active trainee named "' + who + '".');

  if (viewer.role === PORTAL.ROLE.FTO) {
    if (normNameV1_(rec.fto) !== normNameV1_(viewer.name)) {
      throw new Error(rec.name + ' is not on your line. Only their assigned FTO or Division can file coaching.');
    }
  }

  if (!ensureCoachingLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL.TAB.COACHING + '. Nothing was written.');
  }
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) throw new Error('No coaching log.');

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var from = viewer.name || viewer.email;
  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'DATE') return today;
    if (H === 'TRAINEE') return rec.name;
    if (H === 'FROM') return from;
    if (H === 'NOTE') return clean_(text);
    if (H === 'ACKNOWLEDGED') return '';
    return '';
  });
  t.sheet.appendRow(row);
  forgetTabsV1_();
  auditV1_('COACHING FILED', viewer.email, rec.name + ' | ' + text.slice(0, 120));
  return { ok: true, message: 'Coaching filed for ' + rec.name + '.' };
}

/* ---------------- assign FTO from Division ---------------- */

/**
 * One assignment from Field Training. Reuses the same dropdown rebuild and
 * master write as the editor assignFto() path.
 */
function assignFtoV1(traineeName, ftoName) {
  requireWritableV1_('assign a training officer');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may assign a training officer from Field Training.');
  }
  var trainee = String(traineeName || '').trim();
  var fto = String(ftoName || '').trim();
  if (!trainee) throw new Error('Pick a trainee.');
  if (!fto) throw new Error('Pick a training officer.');

  PropertiesService.getScriptProperties()
    .setProperty(PORTAL_ASSIGN_PROPERTY, trainee + ' -> ' + fto);
  var p = assignPlanV1_();
  if (p.problem) throw new Error(p.problem);
  if (p.noTrainee.length) throw new Error('No trainee named "' + trainee + '" on the master.');
  if (p.noFto.length) {
    throw new Error(fto + ' is not on the active roster. Add them with addFto first.');
  }
  if (p.twoRows.length) {
    throw new Error('More than one master row matches "' + trainee + '". Fix the duplicate first.');
  }
  if (p.same.length && !p.set.length) {
    return { ok: true, message: trainee + ' is already assigned to ' + fto + '.' };
  }
  if (!p.set.length) throw new Error('Nothing to assign.');

  try { rebuildFtoDropdownV1_(); } catch (eD) {}
  var c = assignColumnV1_();
  if (!c) throw new Error('No ASSIGNED FTO column on the master.');
  var s = p.set[0];
  c.sheet.getRange(s.row, c.col).setValue(s.fto);

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  try {
    writeAssignManifestV1_([[stamp, PORTAL.TAB.MASTER, s.row, p.header, s.trainee,
      s.was || '', s.fto, viewer.email, PORTAL.VERSION]]);
  } catch (eM) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('FTO ASSIGNED', viewer.email, s.trainee + ' -> ' + s.fto);
  return { ok: true, message: s.trainee + ' is now assigned to ' + s.fto + '.' };
}

/* ---------------- matrix seed after enroll ---------------- */

/**
 * Put catalog skills onto 05 SKILLS PROGRESS for a new trainee when the
 * catalog tab is present. Full rebuildSkillMatrix remains the gold path;
 * this unblocks clearance tracking without opening the tracker project.
 */
function seedSkillMatrixForTraineeV1_(traineeName, level) {
  var out = { ok: false, added: 0, why: '' };
  var name = String(traineeName || '').trim();
  if (!name) { out.why = 'no name'; return out; }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  if (!matrix.ok) { out.why = 'no skills matrix'; return out; }
  if (matrix.col['TRAINEE'] === undefined || matrix.col['SKILL'] === undefined) {
    out.why = 'matrix headers incomplete';
    return out;
  }

  var catalog = readCatalogSkillsV1_();
  if (!catalog.length) { out.why = 'no skill catalog (or none applicable)'; return out; }

  var have = {};
  matrix.rows.forEach(function (r) {
    if (normNameV1_(r[matrix.col['TRAINEE']]) !== normNameV1_(name)) return;
    var sid = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    var sk = String(r[matrix.col['SKILL']] || '').trim();
    if (sid) have['id:' + sid] = true;
    if (sk) have['sk:' + normNameV1_(sk)] = true;
  });

  var lvl = String(level || '').toLowerCase();
  var added = 0;
  catalog.forEach(function (c) {
    if (!skillAppliesToLevelV1_(c, lvl)) return;
    if (c.id && have['id:' + c.id]) return;
    if (have['sk:' + normNameV1_(c.skill)]) return;
    var row = matrix.headers.map(function (h) {
      var H = String(h || '').trim().toUpperCase();
      if (H === 'TRAINEE') return name;
      if (H === 'SKILL') return c.skill;
      if (H === 'SKILL ID') return c.id || '';
      if (H === 'DOMAIN') return c.domain || '';
      if (H === 'LEVEL') return level || '';
      if (H === 'STAGE') return '';
      if (H === 'READINESS') return 'NOT STARTED';
      if (H === 'SIGN-OFF') return '';
      if (H === 'SUCCESSFUL REPS' || H === 'INDEPENDENT REPS' ||
          H === 'DISTINCT DATES' || H === 'DISTINCT FTOS') return 0;
      return '';
    });
    matrix.sheet.appendRow(row);
    added++;
    if (c.id) have['id:' + c.id] = true;
    have['sk:' + normNameV1_(c.skill)] = true;
  });

  if (added) forgetTabsV1_();
  out.ok = true;
  out.added = added;
  return out;
}

function readCatalogSkillsV1_() {
  try {
    var book = targetBookV1_();
    var sh = book.getSheetByName(PORTAL_CATALOG_TAB);
    if (!sh || sh.getLastRow() < PORTAL.HEADER_ROW + 1) return [];
    var width = Math.max(sh.getLastColumn(), 17);
    var headers = sh.getRange(PORTAL.HEADER_ROW, 1, 1, width).getValues()[0];
    var col = {};
    headers.forEach(function (h, i) {
      var k = String(h || '').trim().toUpperCase();
      if (k && col[k] === undefined) col[k] = i;
    });
    if (col['SKILL ID'] === undefined || col['SKILL'] === undefined) return [];
    var n = sh.getLastRow() - PORTAL.HEADER_ROW;
    if (n < 1) return [];
    var rows = sh.getRange(PORTAL.HEADER_ROW + 1, 1, n, width).getValues();
    var out = [];
    rows.forEach(function (r) {
      var id = String(r[col['SKILL ID']] || '').trim();
      var skill = String(r[col['SKILL']] || '').trim();
      if (!id || !skill) return;
      var active = col['ACTIVE'] !== undefined ? yesishV1_(r[col['ACTIVE']]) : true;
      var status = col['APPROVAL STATUS'] !== undefined
        ? String(r[col['APPROVAL STATUS']] || '').trim()
        : (col['STATUS'] !== undefined ? String(r[col['STATUS']] || '').trim() : 'APPROVED');
      if (!active) return;
      if (status && !/^APPROVED$/i.test(status) && status !== '') return;
      out.push({
        id: id,
        skill: skill,
        domain: col['DOMAIN'] !== undefined ? String(r[col['DOMAIN']] || '').trim() : '',
        emt: col['EMT'] !== undefined ? yesishV1_(r[col['EMT']]) : true,
        aemt: col['AEMT'] !== undefined ? yesishV1_(r[col['AEMT']]) : true,
        paramedic: col['PARAMEDIC'] !== undefined ? yesishV1_(r[col['PARAMEDIC']]) : true
      });
    });
    return out;
  } catch (e) { return []; }
}

function yesishV1_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1' || s === 'X';
}

function skillAppliesToLevelV1_(c, lvl) {
  if (/paramedic|pmd/.test(lvl)) return !!c.paramedic;
  if (/advanced|aemt/.test(lvl)) return !!c.aemt;
  if (/emt/.test(lvl)) return !!c.emt;
  // Unknown level — seed everything active so the person is not invisible.
  return true;
}

/**
 * Push matrix READY skills onto the OPEN validation queue when they are missing.
 * Append-only. Does not cancel, sort, or sweep — that stays a human / tracker job
 * until Field Training owns the full rebuild. Division can run this from the desk
 * so READY skills show up without opening the tracker.
 */
function refreshValidationQueueV1() {
  requireWritableV1_('refresh the validation queue');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may refresh the validation queue.');
  }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  var queue = readTabV1_(PORTAL.TAB.QUEUE);
  if (!matrix.ok) throw new Error('No skills matrix.');
  if (!queue.ok) throw new Error('No validation queue.');

  var needQ = ['TRAINEE', 'SKILL', 'RECORD STATUS'];
  var missingQ = needQ.filter(function (h) { return queue.col[h] === undefined; });
  if (missingQ.length) {
    throw new Error('The queue is missing ' + missingQ.join(', ') + '. Nothing was written.');
  }
  if (matrix.col['TRAINEE'] === undefined || matrix.col['READINESS'] === undefined) {
    throw new Error('The matrix is missing TRAINEE or READINESS. Nothing was written.');
  }

  // Index OPEN by skill id AND skill name so a nameless id row and an id-less
  // name row of the same skill do not both get another OPEN.
  var open = {};
  queue.rows.forEach(function (r) {
    if (String(r[queue.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var tn = normNameV1_(r[queue.col['TRAINEE']]);
    var sid = queue.col['SKILL ID'] !== undefined
      ? String(r[queue.col['SKILL ID']] || '').trim() : '';
    var sk = normNameV1_(r[queue.col['SKILL']]);
    if (sid) open[tn + '||' + sid] = true;
    if (sk) open[tn + '||' + sk] = true;
  });

  // Exact readiness only — /READY FOR VALIDATION/ would also match NOT READY.
  var QUALIFY = {
    'READY FOR VALIDATION': true,
    'SIGNED OFF - REVIEW REQUIRED': true,
    'LEGACY SIGN-OFF REVIEW REQUIRED': true
  };
  var added = 0;
  matrix.rows.forEach(function (r) {
    var readiness = String(r[matrix.col['READINESS']] || '').trim();
    if (!QUALIFY[readiness]) return;
    var trainee = String(r[matrix.col['TRAINEE']] || '').trim();
    if (!trainee) return;
    var skill = matrix.col['SKILL'] !== undefined
      ? String(r[matrix.col['SKILL']] || '').trim() : '';
    var skillId = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    if (!skill && !skillId) return;
    var tn = normNameV1_(trainee);
    var idKey = skillId ? tn + '||' + skillId : '';
    var nameKey = skill ? tn + '||' + normNameV1_(skill) : '';
    if ((idKey && open[idKey]) || (nameKey && open[nameKey])) return;

    var lastDate = matrix.col['LAST DATE'] !== undefined
      ? asDateV1_(r[matrix.col['LAST DATE']]) : null;
    var domain = matrix.col['DOMAIN'] !== undefined
      ? String(r[matrix.col['DOMAIN']] || '').trim() : '';
    var succ = matrix.col['SUCCESSFUL REPS'] !== undefined ? Number(r[matrix.col['SUCCESSFUL REPS']]) || 0 : 0;
    var indep = matrix.col['INDEPENDENT REPS'] !== undefined ? Number(r[matrix.col['INDEPENDENT REPS']]) || 0 : 0;
    var dates = matrix.col['DISTINCT DATES'] !== undefined ? Number(r[matrix.col['DISTINCT DATES']]) || 0 : 0;
    var ftos = matrix.col['DISTINCT FTOS'] !== undefined ? Number(r[matrix.col['DISTINCT FTOS']]) || 0 : 0;
    // Staging-style text — never "4 / 2 / 2 / 2", which parseEvidenceBarsV1_
    // misreads as have/need pairs.
    var evidence = succ + ' successful, ' + indep + ' independent, ' +
      dates + ' dates, ' + ftos + ' FTOs';
    var requestId = 'QR-P-' + String(new Date().getTime()) + '-' + added;

    var row = queue.headers.map(function (h) {
      var H = String(h || '').trim().toUpperCase();
      if (H === 'READY DATE' || H === 'LAST EVIDENCE DATE') return lastDate || new Date();
      if (H === 'TRAINEE') return trainee;
      if (H === 'SKILL ID') return skillId;
      if (H === 'DOMAIN') return domain;
      if (H === 'SKILL') return skill;
      if (H === 'EVIDENCE SUMMARY') return evidence;
      if (H === 'RECORD STATUS') return 'OPEN';
      if (H === 'REQUEST ID') return requestId;
      return '';
    });
    queue.sheet.appendRow(row);
    if (idKey) open[idKey] = true;
    if (nameKey) open[nameKey] = true;
    added++;
  });

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('VALIDATION QUEUE REFRESH', viewer.email, added + ' row(s) added');
  return {
    ok: true,
    added: added,
    message: added
      ? ('Added ' + added + ' OPEN row' + (added === 1 ? '' : 's') + ' from the matrix.')
      : 'Queue already has every READY skill. Nothing added.'
  };
}

/**
 * When the tracker matrix is stale but skills are on the evidence log, recount
 * each matrix row from the log and flip readiness to READY FOR VALIDATION when
 * the bars are met. Does not wipe or rebuild the matrix. Optionally refreshes
 * the OPEN queue afterward.
 */
function syncMatrixFromEvidenceV1() {
  requireWritableV1_('sync the skills matrix from the evidence log');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may sync the matrix from evidence.');
  }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (!matrix.ok) throw new Error('No skills matrix.');
  if (!ev.ok) throw new Error('No evidence log.');
  if (matrix.col['TRAINEE'] === undefined) {
    throw new Error('The matrix is missing TRAINEE. Nothing was written.');
  }

  var updated = 0, markedReady = 0;
  matrix.rows.forEach(function (r, i) {
    var trainee = String(r[matrix.col['TRAINEE']] || '').trim();
    if (!trainee) return;
    var readiness = matrix.col['READINESS'] !== undefined
      ? String(r[matrix.col['READINESS']] || '').trim() : '';
    var signoff = matrix.col['SIGN-OFF'] !== undefined
      ? String(r[matrix.col['SIGN-OFF']] || '').trim() : '';
    if (signoff === 'SIGNED OFF' || readiness === 'SIGNED OFF') return;

    var skill = matrix.col['SKILL'] !== undefined
      ? String(r[matrix.col['SKILL']] || '').trim() : '';
    var skillId = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    if (!skill && !skillId) return;

    var counts = evidenceCountsForSkillV1_(trainee, skill, skillId);
    if (!counts || !counts.successful) return;

    var row = matrix.firstDataRow + i;
    var wrote = false;
    function setCol(name, value) {
      if (matrix.col[name] === undefined) return;
      var cur = r[matrix.col[name]];
      if (String(cur) === String(value)) return;
      matrix.sheet.getRange(row, matrix.col[name] + 1).setValue(value);
      r[matrix.col[name]] = value;
      wrote = true;
    }
    setCol('SUCCESSFUL REPS', counts.successful);
    setCol('INDEPENDENT REPS', counts.independent);
    setCol('DISTINCT DATES', counts.distinctDates);
    setCol('DISTINCT FTOS', counts.distinctFtos);
    if (counts.lastDate) setCol('LAST DATE', counts.lastDate);
    if (counts.stage) setCol('STAGE', counts.stage);

    var needS = cellNumV1_(r, matrix, ['NEED SUCCESSFUL', 'REQUIRED SUCCESSFUL'], 3) || 3;
    var needI = cellNumV1_(r, matrix, ['NEED INDEPENDENT', 'REQUIRED INDEPENDENT'], 2) || 2;
    var needD = cellNumV1_(r, matrix, ['NEED DATES', 'REQUIRED DATES'], 2) || 2;
    var needF = cellNumV1_(r, matrix, ['NEED FTOS', 'REQUIRED FTOS'], 2) || 2;
    // Live matrix often lacks NEED_* columns — use the same defaults as skillsForV1_.
    if (matrix.col['NEED SUCCESSFUL'] === undefined &&
        matrix.col['REQUIRED SUCCESSFUL'] === undefined) {
      needS = 3; needI = 2; needD = 2; needF = 2;
    }

    var met = counts.successful >= needS &&
      counts.independent >= needI &&
      counts.distinctDates >= needD &&
      counts.distinctFtos >= needF;
    if (met && matrix.col['READINESS'] !== undefined &&
        readiness !== 'READY FOR VALIDATION' &&
        readiness !== 'SIGNED OFF - REVIEW REQUIRED' &&
        readiness !== 'LEGACY SIGN-OFF REVIEW REQUIRED') {
      setCol('READINESS', 'READY FOR VALIDATION');
      markedReady++;
    }
    if (wrote) updated++;
  });

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var queueMsg = '';
  var added = 0;
  try {
    var q = refreshValidationQueueV1();
    added = q && q.added ? q.added : 0;
    queueMsg = q && q.message ? q.message : '';
  } catch (eQ) {
    queueMsg = 'Queue refresh skipped: ' + String(eQ.message || eQ);
  }

  auditV1_('MATRIX SYNC FROM EVIDENCE', viewer.email,
    updated + ' row(s) updated, ' + markedReady + ' marked READY, queue +' + added);

  return {
    ok: true,
    updated: updated,
    markedReady: markedReady,
    queueAdded: added,
    message: updated
      ? ('Updated ' + updated + ' matrix row' + (updated === 1 ? '' : 's') +
         ' from the evidence log' +
         (markedReady ? ('; marked ' + markedReady + ' READY') : '') +
         '. ' + queueMsg)
      : ('No matrix rows needed a recount from the evidence log. ' + queueMsg)
  };
}
