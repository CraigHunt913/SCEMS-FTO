/**
 * Phase and clearance — Field Training lifecycle.
 *
 * Training Division keeps CURRENT PHASE current and can clear a trainee for
 * independent partner duty when they have finished the program.
 *
 * Advance:
 *   CURRENT PHASE → next · PHASE START DATE → today · optional assignment
 *   history row · PORTAL AUDIT.
 *
 * Clear for the truck (successful completion — not termination):
 *   SET STATUS → Cleared / Independent · archive snapshot · cancel OPEN
 *   skill-queue rows · refresh form Trainee lists · PORTAL AUDIT.
 *
 * "Released from training" means they completed every phase and the required
 * skills and may ride as a partner. It is a graduation, not leaving the job.
 */

var PORTAL_PHASES_V1 = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
var PORTAL_RELEASE_LOG = 'PORTAL RELEASE LOG';
var PORTAL_ARCHIVE_TAB = '17 TRAINEE ARCHIVE';
var PORTAL_ASSIGNMENTS_TAB = '92 ASSIGNMENT HISTORY';
/** Vault status for someone cleared to ride as an independent partner. */
var PORTAL_CLEARED_STATUS = 'Cleared / Independent';

function phaseIndexV1_(phase) {
  var p = String(phase || '').trim();
  var i = PORTAL_PHASES_V1.indexOf(p);
  if (i >= 0) return i;
  var m = p.match(/(\d+)/);
  if (m) {
    var n = Number(m[1]) - 1;
    if (n >= 0 && n < PORTAL_PHASES_V1.length) return n;
  }
  return -1;
}

function nextPhaseV1_(phase) {
  var i = phaseIndexV1_(phase);
  if (i < 0 || i >= PORTAL_PHASES_V1.length - 1) return '';
  return PORTAL_PHASES_V1[i + 1];
}

/** Live master row for an active (or any) trainee by exact/normalized name. */
function findTraineeOnMasterV1_(name) {
  var want = normNameV1_(name);
  if (!want) return null;
  var list = traineesV1_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].norm === want) return list[i];
  }
  return null;
}

function requireDivisionWritableV1_(what) {
  requireWritableV1_(what);
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may ' + what + '.');
  }
  return viewer;
}

/**
 * Advance one phase. Typed reason required (≥8).
 * Returns { ok, name, from, to, message }.
 */
function advanceTraineePhaseV1(traineeName, reason) {
  var viewer = requireDivisionWritableV1_('advance a phase');
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why you are advancing them. It goes on the permanent record in your name.');
  }
  var who = String(traineeName || '').trim();
  var rec = findTraineeOnMasterV1_(who);
  if (!rec) throw new Error('No trainee named "' + who + '" on the master.');
  if (rec.from) {
    throw new Error(rec.name + ' was read from another book (' + rec.from +
      '). Bring them onto this tracker before advancing.');
  }
  if (rec.closed) throw new Error(rec.name + ' is already closed / released.');
  if (!rec.row) throw new Error('Cannot find a writable row for ' + rec.name + '.');

  var next = nextPhaseV1_(rec.phase);
  if (!next) {
    if (phaseIndexV1_(rec.phase) === PORTAL_PHASES_V1.length - 1) {
      throw new Error(rec.name + ' is already in Phase 4. Clear them for the truck when the program is complete — phase does not advance past that.');
    }
    throw new Error('Current phase "' + (rec.phase || '(blank)') +
      '" is not a known phase. Fix the master row first.');
  }

  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) throw new Error(PORTAL.TAB.MASTER + ' is missing.');
  if (t.col['CURRENT PHASE'] === undefined) {
    throw new Error('CURRENT PHASE column is missing on the master.');
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  t.sheet.getRange(rec.row, t.col['CURRENT PHASE'] + 1).setValue(next);
  if (t.col['PHASE START DATE'] !== undefined) {
    t.sheet.getRange(rec.row, t.col['PHASE START DATE'] + 1).setValue(today);
  }

  try { appendAssignmentHistoryV1_(rec, next, today, viewer.email, why); }
  catch (eHist) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('PHASE ADVANCED', viewer.email,
    rec.name + ' | ' + rec.phase + ' → ' + next + ' | ' + why.slice(0, 200));

  return {
    ok: true,
    name: rec.name,
    from: rec.phase,
    to: next,
    message: rec.name + ' is now in ' + next + '.'
  };
}

/**
 * Clear a trainee for independent partner duty (successful program completion).
 * Typed reason required. Soft-closes on the master, archives the clearance,
 * cancels open skill requests, refreshes form lists.
 */
function releaseTraineeV1(traineeName, reason) {
  var viewer = requireDivisionWritableV1_('clear a trainee for independent duty');
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why they are cleared. It goes on the permanent record in your name.');
  }
  var who = String(traineeName || '').trim();
  var rec = findTraineeOnMasterV1_(who);
  if (!rec) throw new Error('No trainee named "' + who + '" on the master.');
  if (rec.from) {
    throw new Error(rec.name + ' was read from another book. Bring them onto this tracker before clearing.');
  }
  if (rec.closed) throw new Error(rec.name + ' is already cleared / closed.');
  if (!rec.row) throw new Error('Cannot find a writable row for ' + rec.name + '.');

  var assess = clearanceAssessmentV1_(rec);
  if (!assess.canClear) {
    throw new Error(rec.name + ' is not ready for the truck yet.\n\n' +
      (assess.gaps.length ? assess.gaps.join('\n') : 'Finish Phase 4 and every skill sign-off first.'));
  }

  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) throw new Error(PORTAL.TAB.MASTER + ' is missing.');

  var statusHeader = t.col['SET STATUS'] !== undefined ? 'SET STATUS'
                   : (t.col['PROGRAM STATUS'] !== undefined ? 'PROGRAM STATUS' : '');
  if (!statusHeader) {
    throw new Error('No SET STATUS / PROGRAM STATUS column on the master. Nothing was written.');
  }

  writeReleaseArchiveV1_(rec, viewer.email, why);

  t.sheet.getRange(rec.row, t.col[statusHeader] + 1).setValue(PORTAL_CLEARED_STATUS);

  var cancelled = cancelOpenSkillQueueForV1_(rec.name);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var sync = null;
  try { sync = syncRegisteredFormChoicesV1_(); } catch (eSync) {}

  auditV1_('TRAINEE CLEARED', viewer.email,
    rec.name + ' | phase ' + (rec.phase || '?') + ' | independent partner | cancelled ' +
    cancelled + ' | ' + why.slice(0, 160));

  var msg = rec.name + ' is cleared for independent partner duty. Captured with your reason.';
  if (cancelled) msg += ' ' + cancelled + ' open skill request(s) cancelled.';
  if (sync && sync.ok) msg += ' Form Trainee lists updated.';
  return {
    ok: true,
    name: rec.name,
    phase: rec.phase,
    cancelled: cancelled,
    message: msg
  };
}

function appendAssignmentHistoryV1_(rec, newPhase, eff, by, why) {
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ASSIGNMENTS_TAB);
  if (!sh) return;
  var t = readTabUncachedV1_(PORTAL_ASSIGNMENTS_TAB);
  if (!t.ok) return;
  var row = new Array(t.headers.length);
  for (var i = 0; i < row.length; i++) row[i] = '';
  function put(h, v) {
    if (t.col[h] !== undefined) row[t.col[h]] = v;
  }
  put('TRAINEE', rec.name);
  put('LEVEL', rec.level);
  put('FTO', rec.fto);
  put('PHASE', newPhase);
  put('PHASE START', eff);
  put('STATUS', 'ACTIVE');
  put('OPENED', new Date());
  put('SOURCE', 'advancement by ' + by + ' (Field Training)');
  put('NOTES', why);
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function writeReleaseArchiveV1_(rec, by, why) {
  var book = targetBookV1_();
  var stamp = new Date();
  var payload = {
    'DATE ARCHIVED': stamp,
    'TRAINEE': rec.name,
    'LEVEL': rec.level || '',
    'FTO': rec.fto || '',
    'PHASE AT EXIT': rec.phase || '',
    'FINAL STATUS': PORTAL_CLEARED_STATUS,
    'NOTES': 'Cleared for independent partner duty by ' + by + ': ' + why,
    'RELEASED BY': by,
    'EMAIL': rec.email || ''
  };

  var sh = book.getSheetByName(PORTAL_ARCHIVE_TAB);
  if (sh) {
    var t = readTabUncachedV1_(PORTAL_ARCHIVE_TAB);
    if (t.ok && t.headers.length) {
      var row = new Array(t.headers.length);
      for (var i = 0; i < row.length; i++) row[i] = '';
      Object.keys(payload).forEach(function (h) {
        if (t.col[h] !== undefined) row[t.col[h]] = payload[h];
      });
      // If NOTES exists under another name, still try NOTES.
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }

  // Fallback log owned by the portal — always available.
  sh = book.getSheetByName(PORTAL_RELEASE_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RELEASE_LOG);
    sh.getRange(1, 1).setValue(
      'Clearances captured from Field Training. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 8)
      .setValues([['DATE ARCHIVED', 'TRAINEE', 'LEVEL', 'FTO', 'PHASE AT EXIT',
                   'FINAL STATUS', 'RELEASED BY', 'NOTES']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.appendRow([
    stamp, rec.name, rec.level || '', rec.fto || '', rec.phase || '',
    PORTAL_CLEARED_STATUS, by, why
  ]);
}

function cancelOpenSkillQueueForV1_(traineeName) {
  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok || t.col['TRAINEE'] === undefined) return 0;
  if (t.col['RECORD STATUS'] === undefined) return 0;
  var want = normNameV1_(traineeName);
  var n = 0;
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== want) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    t.sheet.getRange(t.firstDataRow + i, t.col['RECORD STATUS'] + 1)
      .setValue('CANCELLED : TRAINEE CLOSED');
    n++;
  });
  return n;
}
