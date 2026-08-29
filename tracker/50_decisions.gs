/**
 * SCEMS Field Training Tracker — 50_decisions
 *
 * The validation queue, the authority to decide, and the permanent
 * sign-off log.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   The skill-validation queue, explicit decision recording, decision
 *   reconciliation by stable IDs, the stranded-decision migration, and
 *   atomic lifecycle changes (advancement, close/release).
 *   THE EXPLICIT-ACTION MODEL (replaces the per-cell race)
 *   1. Leadership picks DECISION and RATIONALE from the armed dropdowns.
 *   The edit handler stamps DECIDED BY and DECISION DATE for display
 *   and arms the RECORD checkbox. NOTHING IS RECORDED YET.
 *   2. Leadership ticks RECORD on the row (or runs "Record pending skill
 *   decisions" from the SCEMS menu to process every completed row).
 *   3. The server validates authority, queue state, completeness, dates,
 *   and duplicates against the row's REQUEST ID, then writes ONE
 *   immutable sign-off record and updates queue, matrix, audit, and
 *   notification state together.
 *   IDENTITY OF WORK
 *   - Every queue row carries a REQUEST ID (QR-…), assigned when the row
 *   is created and backfilled by migration for existing rows.
 *   - Every decision carries a DECISION ID (SD-…) and the REQUEST ID it
 *   answers. Reconciliation matches request-to-decision by ID and
 *   decision type — an older Approval can never satisfy a newer Return
 *   or Revoke.
 *   SCEMS v20.1.0h ADD-ON : advanceTraineeNow
 *   Prompt-driven wrapper for applyAdvancementV20_1 so a phase
 *   advancement can be applied without editing code. Everything it
 *   does goes through the existing atomic path: master phase +
 *   phase-start date + assignment history + audit log + notification
 *   under one lock. It refuses closed trainees, unknown phases,
 *   future dates, and anything past Phase 4 (governance, not code).
 *   SCEMS v20.1.0h ADD-ON : "Work my queue"
 */

function openQueueRowV19_(trainee, key) {
  var q = ss().getSheetByName(TAB.QUEUE);
  if (!q) return -1;
  var rows = q.getRange(5, 1, 296, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) === String(trainee) && !rows[i][5] &&
        String(rows[i][2]).indexOf(key) >= 0) return 5 + i;
  }
  return -1;
}

function needsDualSignoffV19_(trainee, itemType) {
  if (String(itemType) !== 'Advancement review') return false;
  var rec = traineeRecordV19_(trainee);
  if (!rec) return false;
  if (DUAL_SIGNOFF_LEVELS_V19.indexOf(rec.level) < 0) return false;
  return rec.phase === DUAL_SIGNOFF_PHASE_V19;
}

/* ---- ported round 4 : preflight + matrix metric helpers ---- */

function mergedRuleConflicts_() {
  var conflicts = [];
  ss().getSheets().forEach(function (sh) {
    var merged = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges();
    if (!merged.length) return;
    sh.getConditionalFormatRules().forEach(function (rule) {
      rule.getRanges().forEach(function (ruleRange) {
        merged.forEach(function (mergedRange) {
          if (rangesIntersect_(ruleRange, mergedRange)) {
            conflicts.push(sh.getName() + ' : ' + ruleRange.getA1Notation() +
              ' intersects merged ' + mergedRange.getA1Notation());
          }
        });
      });
    });
  });
  return conflicts;
}

/* ---------------------------------------------------------------- *
 *  Queue helpers
 * ---------------------------------------------------------------- */

function queueTableV20_1_() {
  return readTableV20_1_(TAB.SKILL_VALIDATION, 4);
}

/** Ensures every populated queue row has a REQUEST ID. Additive only;
 *  requires the REQUEST ID column (added by migration). */
function ensureQueueRequestIdsV20_1_() {
  var t = queueTableV20_1_();
  if (!t.ok || t.col['REQUEST ID'] === undefined) return 0;
  var sh = t.sheet, added = 0;
  t.rows.forEach(function (r, i) {
    if (!String(r[t.col['TRAINEE']] || '').trim()) return;
    if (String(r[t.col['REQUEST ID']] || '').trim()) return;
    sh.getRange(t.firstDataRow + i, t.col['REQUEST ID'] + 1).setValue(newIdV20_1_('QR'));
    added++;
  });
  return added;
}

/** Re-resolves a queue row from its REQUEST ID. Row numbers are NOT stable
 *  across a call to recordDecisionForRowV20_1_: that rebuilds the matrix,
 *  which calls refreshSkillValidationQueueV19_, which re-sorts the queue by
 *  RECORD STATUS. Any batch that captured row numbers up front must re-derive
 *  each row immediately before writing to it. Returns 0 when the request is
 *  no longer on the sheet. */
function queueRowByRequestIdV20_1_(requestId) {
  var id = String(requestId || '').trim();
  if (!id) return 0;
  var t = queueTableV20_1_();
  if (!t.ok || t.col['REQUEST ID'] === undefined) return 0;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][t.col['REQUEST ID']] || '').trim() === id) return t.firstDataRow + i;
  }
  return 0;
}

/** Writes the four operator-owned decision cells on one queue row, mapped by
 *  header name rather than by fixed column number, so a column insert refuses
 *  instead of silently writing into the wrong cells. Rationale is sanitized:
 *  it is free text that recordDecisionForRowV20_1_ later reads back into the
 *  permanent sign-off record. */
function writeQueueDecisionV20_1_(row, decision, decider, decisionDate, rationale) {
  var t = queueTableV20_1_();
  if (!t.ok) throw new Error('Queue not found; nothing written to row ' + row + '.');
  var need = ['DECISION', 'DECIDED BY', 'DECISION DATE', 'RATIONALE'];
  var idx = need.map(function (h) { return t.col[h]; });
  var missing = need.filter(function (h, i) { return idx[i] === undefined; });
  if (missing.length) {
    throw new Error('Refusing to write queue row ' + row + ': missing header(s) ' +
      missing.join(', ') + '. Repair the header row on "' + TAB.SKILL_VALIDATION + '".');
  }
  var sh = t.sheet;
  sh.getRange(row, idx[0] + 1).setValue(decision);
  sh.getRange(row, idx[1] + 1).setValue(decider);
  sh.getRange(row, idx[2] + 1).setValue(decisionDate || new Date());
  sh.getRange(row, idx[3] + 1).setValue(sanitizeCellV20_1_(String(rationale || '')));
}

/** Loads the sign-off log indexed by decision ID and by request ID. */
function signoffIndexV20_1_() {
  var t = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  var out = { ok: t.ok, byDecisionId: {}, byRequestId: {}, byPair: {}, rows: [] };
  if (!t.ok) return out;
  t.rows.forEach(function (r, i) {
    var id = String(r[t.col['DECISION ID']] || '').trim();
    if (!id) return;
    var rec = {
      row: t.firstDataRow + i,
      decisionId: id,
      trainee: cleanNameV20_1_(r[t.col['TRAINEE']]),
      skillId: String(r[t.col['SKILL ID']] || '').trim(),
      decision: String(r[t.col['DECISION']] || '').trim(),
      decidedBy: String(r[t.col['DECIDED BY']] || '').trim(),
      decisionDate: parseDateSafeV20_1_(r[t.col['DECISION DATE']]),
      requestId: t.col['REQUEST ID'] !== undefined ? String(r[t.col['REQUEST ID']] || '').trim() : ''
    };
    out.rows.push(rec);
    out.byDecisionId[id] = rec;
    if (rec.requestId) {
      if (!out.byRequestId[rec.requestId]) out.byRequestId[rec.requestId] = [];
      out.byRequestId[rec.requestId].push(rec);
    } else {
      // Pre-v20.1 decision: no request ID. Indexed by trainee+skill pair so
      // the reconciler can recognize history without calling it phantom.
      var pk = normalizeNameV20_1_(rec.trainee) + '||' + rec.skillId;
      if (!out.byPair[pk]) out.byPair[pk] = [];
      out.byPair[pk].push(rec);
    }
  });
  return out;
}

/* ---------------------------------------------------------------- *
 *  Decider authority
 * ---------------------------------------------------------------- */

/** The session user's verified email, or ''. Consumer-account editors may
 *  be invisible to Apps Script; that case is handled, not ignored. */
function sessionEmailV20_1_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (e) { return ''; }
}

/** Validates decision-recording authority. Hard-enforced when a session
 *  email is available; when the platform cannot reveal it, the decision
 *  is recorded only if DECIDED BY matches an authorized leader, and the
 *  record is flagged IDENTITY UNVERIFIED for the audit trail. */
function deciderAuthorityV20_1_(decidedByText) {
  var id = identityV20_2_();
  if (id.email) {
    var actor = resolveAuthorizedActorV20_1_(id.email);
    var authorized = actor.ok && (actor.roles.indexOf('PROGRAM_DIRECTOR') >= 0 ||
      actor.roles.indexOf('TRAINING_DIVISION') >= 0 ||
      actor.roles.indexOf('MEDICAL_DIRECTOR') >= 0 || actor.roles.indexOf('COMMAND') >= 0);
    return { allowed: authorized, verified: id.verified, email: id.email, tier: id.tier,
             note: authorized ? '' :
               'the account acting (' + id.email + ', ' + id.tier +
               ') is not an authorized decision-maker' };
  }
  // v20.2: the name-matching fallback is GONE. It granted sign-off authority
  // to anyone who typed "Medical Director" into DECIDED BY, which is how a
  // permanent record ends up credited to someone who never made the decision.
  // decidedByText is now display data only; it is deliberately not consulted.
  return { allowed: false, verified: false, email: '', tier: '',
    note: 'nothing identifies who is acting. Run setOperatorAccountV20_2() once, or ' +
          'move the program to Workspace accounts. v20.2 will not attribute a ' +
          'permanent record to a name typed into a cell. See SPEC-v20.2.md.' };
}

/* ---------------------------------------------------------------- *
 *  The edit handler (PUBLIC — name preserved)
 * ---------------------------------------------------------------- */

function onSheetEdit(e) {
  try {
    var sh = e.range.getSheet();
    var name = sh.getName();

    // v20.3: the TRAINEES console owns its own ticks.
    if (consoleEditV20_3_(e, sh)) return;

    if (name === TAB.SKILL_VALIDATION && e.range.getRow() >= 5) {
      var row = e.range.getRow();
      var col = e.range.getColumn();
      if (col === 7) { // DECISION picked or cleared
        var decision = String(e.range.getValue() || '').trim();
        if (decision) {
          if (!String(sh.getRange(row, 8).getValue() || '').trim()) {
            var em = sessionEmailV20_1_();
            sh.getRange(row, 8).setValue(em || '(enter your name)');
          }
          if (!String(sh.getRange(row, 9).getValue() || '').trim()) {
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            sh.getRange(row, 9).setValue(today);
          }
          try { ss().toast('Noted. Date is set to today — type over it if it happened another day. ' +
            'Pick a reason, then tick RECORD to make it official.', 'SCEMS', 8); } catch (t) {}
        } else {
          // Decision cleared: the operator's name and date are theirs — nothing is wiped.
          try { ss().toast('Decision cleared. Name and date kept — edit them any time.', 'SCEMS', 5); } catch (t4) {}
        }
        return; // NOTHING recorded from a decision pick.
      }
      if (col === QUEUE_RECORD_COL_V20_1 && String(e.value) === 'TRUE') {
        e.range.setValue(false);
        var result = recordDecisionForRowV20_1_(row);
        try { ss().toast(result.slice(0, 190), 'SCEMS', 8); } catch (t2) {}
        return;
      }
      return; // Edits to other queue cells never trigger recording.
    }

    if (name === TAB.TRAINEE_SKILLS && e.range.getRow() === 4 &&
        (e.range.getColumn() === 3 || e.range.getColumn() === 5)) {
      refreshTraineeSkillsViewV19(
        String(sh.getRange('C4').getValue() || ''),
        String(sh.getRange('E4').getValue() || ''));
      return;
    }

    if (name === TAB.MASTER && e.range.getColumn() === 1 && e.range.getRow() >= 5) {
      var who = String(e.range.getValue() || '').trim();
      if (who && who.indexOf(TEST_PREFIX) !== 0 && who.indexOf('EXAMPLE') !== 0) {
        syncNewTraineeV19_(who);
      }
      return;
    }

    if (name === TAB.SKILLS && e.range.getRow() === 2 && e.range.getColumn() === 23) {
      applySkillMatrixFilterV19_(String(e.range.getValue() || ''));
      return;
    }

    if (name === 'HOME') {
      var r = e.range.getRow(), c = e.range.getColumn();
      if (r === 10 && c === 11 && e.value === 'TRUE') {
        e.range.setValue(false); remindOverdue(); return;
      }
      if (r < 26 || r > 27 || e.value !== 'TRUE') return;
      var idx = (r - 26) * 3 + (c - 2) / 3;
      if (idx % 1 !== 0) return;
      var views = JSON.parse(
        PropertiesService.getScriptProperties().getProperty('HOME_NAV') || '[]');
      if (!views[idx]) return;
      e.range.setValue(false);
      var target = views[idx][1];
      if (target === '@TIDY') { tidyForOperationsV19(); return; }
      var vsh = getSheetOrNullV20_1_(target);
      if (vsh) { vsh.showSheet(); ss().setActiveSheet(vsh); }
      return;
    }

    if (name === TAB.AUDIT) {
      var r2 = e.range.getRow(), c2 = e.range.getColumn();
      if (r2 !== 2 || c2 !== 10 || e.value !== 'TRUE') return;
      sh.getRange(2, 10).setValue(false);
      systemLog_('WARN', 'AUDIT CLEAR-ALL BLOCKED', 'Use the named reviewer and action log on tab 13.');
      try { ss().toast('Bulk clearing is disabled. Enter the reviewer and action below.', 'SCEMS'); } catch (t3) {}
      return;
    }
  } catch (err) {
    systemLog_('ERROR', 'EDIT HANDLER FAILED', String(err));
  }
}

/* ---------------------------------------------------------------- *
 *  Recording (the explicit action)
 * ---------------------------------------------------------------- */

/** Records the decision on one queue row. Validates everything, writes
 *  ONE immutable sign-off record, then updates queue/matrix/audit/mail.
 *  Returns a human-readable result. */
function recordDecisionForRowV20_1_(row) {
  return withScriptLockV20_1_('recordDecision', 30000, function () {
    var t = queueTableV20_1_();
    if (!t.ok) return 'Queue not found.';
    var sh = t.sheet;
    var width = Math.max(sh.getLastColumn(), QUEUE_RECORD_COL_V20_1);
    var r = sh.getRange(row, 1, 1, width).getValues()[0];

    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    var skillId = String(r[t.col['SKILL ID']] || '').trim();
    var skill = String(r[t.col['SKILL']] || '').trim();
    var decision = String(r[t.col['DECISION']] || '').trim();
    var decidedBy = String(r[t.col['DECIDED BY']] || '').trim();
    var decisionDate = parseDateSafeV20_1_(r[t.col['DECISION DATE']]);
    var expiration = parseDateSafeV20_1_(r[t.col['EXPIRATION']]);
    var rationale = String(r[t.col['RATIONALE']] || '').trim();
    var status = String(r[t.col['RECORD STATUS']] || '').trim();
    var requestId = t.col['REQUEST ID'] !== undefined ? String(r[t.col['REQUEST ID']] || '').trim() : '';

    if (!trainee) return 'Row ' + row + ': empty row; nothing to record.';
    if (status !== 'OPEN') return 'Row ' + row + ' is ' + (status || 'blank') + ', not OPEN. Nothing recorded.';

    var problems = [];
    if (QUEUE_DECISIONS_V19.indexOf(decision) < 0) problems.push('choose an approved decision');
    if (!decidedBy) problems.push('DECIDED BY is empty');
    if (!decisionDate) problems.push('DECISION DATE is empty or unreadable');
    if (decisionDate && !notFutureV20_1_(decisionDate)) problems.push('DECISION DATE is in the future');
    if (!rationale) problems.push('RATIONALE is empty');
    if (expiration && decisionDate && expiration.getTime() < decisionDate.getTime()) {
      problems.push('EXPIRATION is before DECISION DATE');
    }
    if (!requestId) {
      ensureQueueRequestIdsV20_1_();
      var again = queueTableV20_1_();
      requestId = again.col['REQUEST ID'] !== undefined
        ? String(again.sheet.getRange(row, again.col['REQUEST ID'] + 1).getValue() || '').trim() : '';
      if (!requestId) problems.push('no REQUEST ID column — run applyMigrationV20_1() first');
    }
    var authority = deciderAuthorityV20_1_(decidedBy);
    if (!authority.allowed) problems.push('authority check failed: ' + authority.note);
    // v20.2 SPEC-v20.2.md #2: this is the single writer to the permanent
    // sign-off log, and until now it never once consulted the evidence it was
    // certifying. An approval on a skill the matrix does not call READY FOR
    // VALIDATION is still allowed - judgement is the point of a decider - but
    // it must be typed, not defaulted, and it is stamped forever.
    var evGate = evidenceGateProblemV20_2_(decision, trainee, skillId, rationale);
    if (evGate) problems.push(evGate);
    if (problems.length) {
      var msg = 'Row ' + row + ' NOT recorded: ' + problems.join('; ') + '.';
      systemLog_('WARN', 'SKILL DECISION BLOCKED', requestId + ' | ' + msg);
      return msg;
    }

    var idx = signoffIndexV20_1_();
    var prior = idx.byRequestId[requestId] || [];
    var dup = prior.filter(function (p) { return p.decision === decision; });
    if (dup.length) {
      if (t.col['RECORD STATUS'] !== undefined) {
        sh.getRange(row, t.col['RECORD STATUS'] + 1).setValue(statusForDecisionV20_1_(decision));
      }
      return 'Row ' + row + ': this exact decision is already recorded (' + dup[0].decisionId +
             '). Status corrected; no duplicate written.';
    }
    var contradiction = prior.filter(function (p) { return p.decision !== decision; });
    var supersedes = '';
    if (contradiction.length) {
      supersedes = contradiction[contradiction.length - 1].decisionId;
    }

    // v20.2: when a decider overrides the evidence gate, the permanent record
    // says WHAT was overridden, not merely that something was. The marker leads
    // the rationale so it is visible without reading to the end of a paragraph.
    var overrodeGate = (decision === 'Approve sign-off' &&
      String(rationale).indexOf(OVERRIDE_MARKER_V20_2) >= 0);
    if (overrodeGate) {
      var wasReadiness = skillReadinessNowV20_2_(trainee, skillId) || 'not on the matrix';
      if (wasReadiness !== 'READY FOR VALIDATION') {
        rationale = OVERRIDE_MARKER_V20_2 + ' (matrix read "' + wasReadiness + '") ' +
          rationale.split(OVERRIDE_MARKER_V20_2).join('').trim();
      }
    }

    var decisionId = newIdV20_1_('SD');
    var record = {
      'DECISION ID': decisionId, 'TIMESTAMP': new Date(), 'TRAINEE': trainee,
      'SKILL ID': skillId, 'SKILL': skill, 'DECISION': decision,
      'DECIDED BY': decidedBy + identityStampV20_2_(authority),
      'DECISION DATE': decisionDate, 'EXPIRATION': expiration || '',
      'RATIONALE': rationale, 'SOURCE QUEUE ROW': row,
      'STANDARD / CATALOG VERSION': String(CONFIG.SKILL_STANDARD || ''),
      'REQUEST ID': requestId, 'SUPERSEDES': supersedes,
      'DECIDED BY PERSON ID': authority.email || '',
      'WRITER VERSION': SCEMS_WRITER_VERSION
    };
    appendRowsHeaderMappedV20_1_(TAB.SKILL_SIGNOFF, 4, [record],
      ['DECISION ID', 'TRAINEE', 'DECISION', 'REQUEST ID']);

    if (t.col['RECORD STATUS'] !== undefined) {
      sh.getRange(row, t.col['RECORD STATUS'] + 1).setValue(statusForDecisionV20_1_(decision));
    }
    try { rebuildSkillMatrixV19_(); } catch (e2) {
      systemLog_('ERROR', 'MATRIX REBUILD FAILED AFTER DECISION', decisionId + ' | ' + e2);
    }
    systemLog_('INFO', 'SKILL DECISION RECORDED',
      decisionId + ' | ' + requestId + ' | ' + trainee + ' | ' + skillId + ' | ' + decision +
      (supersedes ? ' | supersedes ' + supersedes : '') +
      (authority.verified ? '' : ' | IDENTITY UNVERIFIED'));
    if (!authority.verified) {
      sendMail(CONFIG.TCO_EMAIL, 'Decision recorded without verified identity : ' + decisionId,
        trainee + ' / ' + skill + ' / ' + decision + ' recorded with DECIDED BY "' + decidedBy +
        '".\nThe platform did not reveal the editing account, so identity is attested, not verified.\n' +
        'If this was not you or your designee, run the revocation workflow.');
    }
    return 'Recorded ' + decisionId + ' : ' + trainee + ' / ' + skill + ' / ' + decision + '.';
  });
}

function statusForDecisionV20_1_(decision) {
  if (decision === 'Return for more evidence') return 'RETURNED';
  if (decision === 'Revoke sign-off') return 'REVOKED';
  return 'RECORDED';
}

/** Menu action: records every OPEN row whose four fields are complete.
 *  One lock for the batch; sequential, no per-cell storms; per-row report. */
function recordPendingDecisionsV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) return 'Queue not found.';
  var candidates = [];
  t.rows.forEach(function (r, i) {
    if (!String(r[t.col['TRAINEE']] || '').trim()) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    if (!String(r[t.col['DECISION']] || '').trim()) return;
    if (!String(r[t.col['RATIONALE']] || '').trim()) return;
    candidates.push(t.firstDataRow + i);
  });
  if (!candidates.length) {
    var none = 'No completed OPEN decisions to record.';
    try { SpreadsheetApp.getUi().alert(none); } catch (e) {}
    return none;
  }
  var out = [];
  candidates.forEach(function (row) {
    try { out.push(recordDecisionForRowV20_1_(row)); }
    catch (e2) { out.push('Row ' + row + ' FAILED: ' + e2); }
  });
  var msg = 'RECORD PENDING DECISIONS\n\n' + out.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e3) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Reconciliation (PUBLIC name preserved) — ID-matched
 * ---------------------------------------------------------------- */

/** READ-ONLY. Queue vs sign-off log, matched by REQUEST ID and decision
 *  type. Reports phantom RECORDED rows, status lag, stranded rows, and
 *  type contradictions. Never "fixes" anything itself. */
function reconcileDecisionsV20() {
  var t = queueTableV20_1_();
  var idx = signoffIndexV20_1_();
  var L = ['QUEUE ↔ SIGN-OFF RECONCILIATION (ID-matched) — READ ONLY', ''];
  if (!t.ok || !idx.ok) return 'Queue or sign-off log not found.';
  var phantom = [], lag = [], stranded = [], badDate = [], mismatch = [], open = 0;
  var legacyMatched = 0, legacyRows = 0;

  t.rows.forEach(function (r, i) {
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!trainee) return;
    var row = t.firstDataRow + i;
    var status = String(r[t.col['RECORD STATUS']] || '').trim();
    var decision = String(r[t.col['DECISION']] || '').trim();
    var skillId = String(r[t.col['SKILL ID']] || '').trim();
    var requestId = t.col['REQUEST ID'] !== undefined ? String(r[t.col['REQUEST ID']] || '').trim() : '';
    var dateOk = !!parseDateSafeV20_1_(r[t.col['DECISION DATE']]);
    var fieldsFilled = decision && String(r[t.col['DECIDED BY']] || '').trim() &&
                       String(r[t.col['RATIONALE']] || '').trim();
    if (!requestId) { legacyRows++; if (status === 'OPEN') open++; return; }
    var answers = idx.byRequestId[requestId] || [];
    var sameType = answers.filter(function (a) { return a.decision === decision; });
    var pairKey = normalizeNameV20_1_(trainee) + '||' + skillId;
    var legacySameType = (idx.byPair[pairKey] || []).filter(function (a) {
      return a.decision === decision; });

    if ((status === 'RECORDED' || status === 'RETURNED' || status === 'REVOKED') && !sameType.length) {
      if (legacySameType.length) {
        // Decided before v20.1: the record exists on the log without a
        // request ID. Recognized, not phantom. applyLinkDecisionsV20_1
        // writes the linkage so this bucket empties permanently.
        legacyMatched++;
      } else {
        phantom.push('row ' + row + ' ' + trainee + ' : status ' + status +
          ' but no ' + (decision || '(no decision)') + ' on the log for ' + requestId);
      }
    }
    if (status === 'OPEN') {
      open++;
      if (sameType.length) lag.push('row ' + row + ' ' + trainee + ' : ' + sameType[0].decisionId +
        ' exists; status never flipped');
      else if (fieldsFilled && dateOk) stranded.push('row ' + row + ' ' + trainee + ' : ' + decision);
      else if (fieldsFilled && !dateOk) badDate.push('row ' + row + ' ' + trainee +
        ' : all fields filled but DECISION DATE is unreadable — clear the date cell and re-pick it');
      else if (answers.length) {
        mismatch.push('row ' + row + ' ' + trainee + ' : log has ' + answers.map(function (a) {
          return a.decision; }).join('+') + ' but the row now asks ' + (decision || '(nothing)') +
          ' — an older decision does NOT satisfy this request');
      }
    }
  });

  L.push('Open requests            : ' + open);
  L.push('Legacy-matched (pre-v20.1, unlinked) : ' + legacyMatched +
    (legacyMatched ? '  → applyLinkDecisionsV20_1("LINK LEGACY") writes the linkage' : ''));
  L.push('');
  L.push('PHANTOM (status set, record missing) : ' + phantom.length);
  phantom.slice(0, 10).forEach(function (x) { L.push('   ' + x); });
  L.push('STATUS LAG (record exists)           : ' + lag.length);
  lag.slice(0, 10).forEach(function (x) { L.push('   ' + x); });
  L.push('STRANDED (complete, never recorded)  : ' + stranded.length);
  stranded.slice(0, 10).forEach(function (x) { L.push('   ' + x); });
  L.push('STRANDED, DATE UNREADABLE            : ' + badDate.length);
  badDate.slice(0, 10).forEach(function (x) { L.push('   ' + x); });
  L.push('TYPE CONTRADICTIONS                  : ' + mismatch.length);
  mismatch.slice(0, 10).forEach(function (x) { L.push('   ' + x); });
  L.push('');
  L.push((phantom.length || lag.length || stranded.length || badDate.length || mismatch.length)
    ? 'Run previewStrandedDecisionsV20_1() before any repair.'
    : 'The queue and the sign-off log agree.');
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Stranded-decision migration (previewed, auditable, ID-matched)
 * ---------------------------------------------------------------- */

/** READ-ONLY preview of every stranded decision with its proposed
 *  disposition and every governance flag (e.g. closed trainee). */
function previewStrandedDecisionsV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) return 'Queue not found.';
  var closed = {}, onMaster = {};
  masterTraineeRowsV20_1_().forEach(function (m) {
    onMaster[m.norm] = true;
    if (m.closed) closed[m.norm] = true;
  });
  var idx = signoffIndexV20_1_();
  var L = ['STRANDED DECISION MIGRATION PREVIEW — READ ONLY. Nothing was written.', ''];
  var n = 0;
  t.rows.forEach(function (r, i) {
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!trainee) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var decision = String(r[t.col['DECISION']] || '').trim();
    var decidedBy = String(r[t.col['DECIDED BY']] || '').trim();
    var date = parseDateSafeV20_1_(r[t.col['DECISION DATE']]);
    var rationale = String(r[t.col['RATIONALE']] || '').trim();
    if (!decision || !decidedBy || !date || !rationale) return;
    n++;
    var row = t.firstDataRow + i;
    var requestId = t.col['REQUEST ID'] !== undefined ? String(r[t.col['REQUEST ID']] || '').trim() : '(assigned on apply)';
    var flags = [];
    var tn = normalizeNameV20_1_(trainee);
    if (closed[tn]) flags.push('TRAINEE IS CLOSED/RELEASED — confirm with the Division Chief before recording');
    else if (!onMaster[tn]) flags.push('TRAINEE NOT ON THE ACTIVE MASTER — treated as closed; Division Chief confirmation required');
    var prior = requestId && idx.byRequestId[requestId] ? idx.byRequestId[requestId] : [];
    if (prior.length) flags.push('log already holds ' + prior.map(function (p) { return p.decision; }).join('+') + ' for this request');
    L.push('row ' + row + ' | ' + requestId + ' | ' + trainee + ' | ' +
      String(r[t.col['SKILL']] || '').slice(0, 30) + ' | ' + decision + ' by ' + decidedBy +
      ' @ ' + dateKeyV20_1_(date));
    L.push('   proposed: record with the ORIGINAL decider, date, and rationale, annotated "migrated v20.1"');
    flags.forEach(function (f) { L.push('   FLAG: ' + f); });
  });
  L.push('');
  L.push(n ? n + ' stranded decision(s). Apply with applyStrandedDecisionsV20_1("RECORD STRANDED")' +
             ' — rows flagged for a closed trainee are SKIPPED unless the second argument is' +
             ' "INCLUDE CLOSED" after Division Chief confirmation.'
           : 'Nothing stranded.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** APPLY step. Requires the literal token. Records each stranded row via
 *  the validated path, preserving the original decider/date/rationale.
 *  Closed-trainee rows are skipped unless explicitly included. */
function applyStrandedDecisionsV20_1(confirmToken, includeClosedToken) {
  if (confirmToken !== 'RECORD STRANDED') {
    return 'Not run. Call applyStrandedDecisionsV20_1("RECORD STRANDED") after reviewing the preview.';
  }
  var includeClosed = includeClosedToken === 'INCLUDE CLOSED';
  ensureQueueRequestIdsV20_1_();
  var t = queueTableV20_1_();
  var closed = {}, onMaster = {};
  masterTraineeRowsV20_1_().forEach(function (m) {
    onMaster[m.norm] = true;
    if (m.closed) closed[m.norm] = true;
  });
  var done = [], skipped = [];
  t.rows.forEach(function (r, i) {
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!trainee) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var decision = String(r[t.col['DECISION']] || '').trim();
    if (!decision || !String(r[t.col['DECIDED BY']] || '').trim() ||
        !r[t.col['DECISION DATE']] || !String(r[t.col['RATIONALE']] || '').trim()) return;
    var row = t.firstDataRow + i;
    var tn2 = normalizeNameV20_1_(trainee);
    if ((closed[tn2] || !onMaster[tn2]) && !includeClosed) {
      skipped.push('row ' + row + ' ' + trainee + ' (' +
        (closed[tn2] ? 'closed trainee' : 'not on the active master — treated as closed') +
        '; needs Division Chief confirmation)');
      return;
    }
    var sh = t.sheet;
    var rat = t.col['RATIONALE'] + 1;
    var current = String(sh.getRange(row, rat).getValue() || '');
    if (current.indexOf('[migrated v20.1]') < 0) {
      sh.getRange(row, rat).setValue(current + '  [migrated v20.1]');
    }
    try { done.push(recordDecisionForRowV20_1_(row)); }
    catch (e2) { done.push('row ' + row + ' FAILED: ' + e2); }
  });
  var msg = 'STRANDED DECISION MIGRATION\n\nRecorded/attempted:\n' +
    (done.length ? done.join('\n') : ' none') +
    '\n\nSkipped:\n' + (skipped.length ? skipped.join('\n') : ' none') +
    '\n\nRollback: a migrated decision is immutable; to undo one, use the Revoke ' +
    'workflow, which writes a superseding record and preserves the audit trail.';
  systemLog_('WARN', 'STRANDED DECISIONS MIGRATED', done.length + ' processed, ' + skipped.length + ' skipped');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Lifecycle : atomic advancement and close-out
 * ---------------------------------------------------------------- */

var PHASES_V20_1 = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

/** Applies an approved advancement atomically: master phase + phase-start
 *  date + assignment history + audit + notification, under one lock. */
function applyAdvancementV20_1(traineeName, decidedBy, effectiveDate, rationale) {
  return withScriptLockV20_1_('applyAdvancement', 30000, function () {
    var resolved = resolveTraineeV20_1_(traineeName);
    if (!resolved.ok || !resolved.record) {
      throw new Error('Advancement not applied: trainee did not resolve (' + resolved.reason + ').');
    }
    var rec = resolved.record;
    if (rec.closed) throw new Error('Advancement not applied: trainee is closed/released.');
    var i = PHASES_V20_1.indexOf(rec.phase);
    if (i < 0) throw new Error('Advancement not applied: current phase "' + rec.phase + '" is not a known phase.');
    if (i === PHASES_V20_1.length - 1) {
      throw new Error('Trainee is in ' + rec.phase + '; clearance beyond Phase 4 is a governance action, not an automated one.');
    }
    var newPhase = PHASES_V20_1[i + 1];
    var eff = parseDateSafeV20_1_(effectiveDate) || new Date();
    if (!notFutureV20_1_(eff)) throw new Error('Advancement not applied: effective date is in the future.');

    var t = readTableV20_1_(TAB.MASTER, 4);
    var sh = t.sheet;
    sh.getRange(rec.row, t.col['CURRENT PHASE'] + 1).setValue(newPhase);
    if (t.col['PHASE START DATE'] !== undefined) {
      sh.getRange(rec.row, t.col['PHASE START DATE'] + 1).setValue(eff);
    }
    try {
      appendRowsHeaderMappedV20_1_(TAB.ASSIGNMENTS, 4, [{
        'ASSIGNMENT ID': newIdV20_1_('AS'), 'PERSON ID': resolved.personId || '',
        'TRAINEE': rec.name, 'LEVEL': rec.level, 'ENTRY PROFILE': rec.entryProfile,
        'FTO': rec.fto, 'FTO PERSON ID': '', 'PHASE': newPhase, 'PHASE START': eff,
        'STATUS': 'ACTIVE', 'OPENED': new Date(), 'CLOSED': '',
        'SOURCE': 'advancement by ' + decidedBy, 'NOTES': rationale || ''
      }], ['ASSIGNMENT ID', 'TRAINEE']);
    } catch (e2) {
      systemLog_('WARN', 'ASSIGNMENT HISTORY UNAVAILABLE', 'advancement recorded without history row: ' + e2);
    }
    systemLog_('INFO', 'ADVANCEMENT APPLIED',
      rec.name + ' : ' + rec.phase + ' → ' + newPhase + ' effective ' + dateKeyV20_1_(eff) + ' by ' + decidedBy);
    sendMail(CONFIG.TCO_EMAIL, 'Advancement applied : ' + rec.name + ' → ' + newPhase,
      rec.name + ' advanced from ' + rec.phase + ' to ' + newPhase + ' effective ' +
      dateKeyV20_1_(eff) + '.\nDecided by: ' + decidedBy + '\nRationale: ' + (rationale || '(none)') +
      '\n\nMaster, phase-start date, and assignment history were updated together.');
    return rec.name + ' advanced to ' + newPhase + '.';
  });
}

/** Menu action: closes or releases a trainee ATOMICALLY. Archives the
 *  FULL master row, clears the FULL row (every live field including
 *  PHASE START DATE), closes open queue items, cancels open skill-queue
 *  requests, and re-scopes the forms. */
function closeTraineeV20_1() {
  if (!gateV20_2_('CLOSE TRAINEE')) return;
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Archive / remove trainee from the program',
    'This archives the full master row and clears it (program exit — not graduation).\n' +
    'For successful completion / independent partner, use Field Training → Clear for the truck.\n\n' +
    'Exact trainee name as shown on 01 TRAINEE MASTER:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var name = cleanNameV20_1_(resp.getResponseText());
  if (!name) return;
  var resolved = resolveTraineeV20_1_(name);
  if (!resolved.ok || !resolved.record) {
    ui.alert('Could not resolve "' + name + '": ' + resolved.reason +
      (resolved.ambiguous.length ? '\nCandidates: ' + resolved.ambiguous.join(', ') : ''));
    return;
  }
  var out = withScriptLockV20_1_('closeTrainee', 30000, function () {
    var rec = resolved.record;
    var t = readTableV20_1_(TAB.MASTER, 4);
    var sh = t.sheet;
    var width = t.headers.length;
    var full = sh.getRange(rec.row, 1, 1, width).getValues()[0];

    var evals = 0;
    try {
      var eng = getSheetOrNullV20_1_(TAB.ENGINE);
      if (eng) { var v = eng.getRange(rec.row, 7).getValue(); if (typeof v === 'number') evals = v; }
    } catch (e) {}
    appendRowsHeaderMappedV20_1_(TAB.ARCHIVE, 4, [{
      'DATE ARCHIVED': new Date(), 'TRAINEE': rec.name, 'LEVEL': rec.level,
      'ENTRY PROFILE': rec.entryProfile, 'FTO': rec.fto, 'PHASE AT EXIT': rec.phase,
      'FINAL STATUS': rec.setStatus || 'Closed / Released', 'EVALS LOGGED': evals,
      'NOTES': 'Full row archived by v20.1: ' + full.map(function (x) {
        return x instanceof Date ? dateKeyV20_1_(x) : String(x == null ? '' : x); }).join(' | ').slice(0, 350)
    }], ['DATE ARCHIVED', 'TRAINEE']);

    sh.getRange(rec.row, 1, 1, width).clearContent(); // ENTIRE row: no date/state survives for the next trainee

    var q = getSheetOrNullV20_1_(TAB.QUEUE);
    var closedQ = 0;
    if (q) {
      var qv = q.getRange(5, 1, Math.max(q.getMaxRows() - 4, 1), 6).getValues();
      for (var k = 0; k < qv.length; k++) {
        if (cleanNameV20_1_(qv[k][1]) === rec.name && qv[k][1] && !qv[k][5]) {
          q.getRange(5 + k, 6).setValue('Closed : trainee released');
          q.getRange(5 + k, 7).setValue('System');
          q.getRange(5 + k, 8).setValue(new Date());
          closedQ++;
        }
      }
    }
    var sq = queueTableV20_1_();
    var cancelled = 0;
    if (sq.ok) {
      sq.rows.forEach(function (r2, i2) {
        if (cleanNameV20_1_(r2[sq.col['TRAINEE']]) !== rec.name) return;
        if (String(r2[sq.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
        sq.sheet.getRange(sq.firstDataRow + i2, sq.col['RECORD STATUS'] + 1)
          .setValue('CANCELLED : TRAINEE CLOSED');
        cancelled++;
      });
    }
    try { refreshDropdowns(); } catch (e3) {
      systemLog_('WARN', 'FORM SYNC AFTER CLOSE FAILED', String(e3));
    }
    try { rebuildSkillMatrixV19_(); } catch (e4) {}
    systemLog_('INFO', 'TRAINEE CLOSED',
      rec.name + ' | full row archived and cleared | ' + closedQ + ' decision item(s) closed | ' +
      cancelled + ' skill request(s) cancelled');
    return 'Closed ' + rec.name + '. Full row archived and cleared (' + width +
      ' columns, phase-start date included). ' + closedQ + ' decision item(s) closed, ' +
      cancelled + ' open skill request(s) cancelled, forms re-scoped. History preserved.';
  });
  ui.alert(out);
  return out;
}

/** Legacy menu name preserved; same safe implementation. */
function archiveTrainee() { return closeTraineeV20_1(); }

/* ---------------------------------------------------------------- *
 *  Legacy decision linker : labels pre-v20.1 sign-off rows with the
 *  REQUEST ID of the queue row they answered. One-time, previewed,
 *  ambiguity-refusing. It writes ONLY into the empty REQUEST ID column
 *  of historical rows — never touches any other cell.
 * ---------------------------------------------------------------- */

function legacyLinkPlanV20_1_() {
  var t = queueTableV20_1_();
  var idx = signoffIndexV20_1_();
  var plan = { links: [], ambiguous: [], unmatched: [] };
  if (!t.ok || !idx.ok) return plan;
  var claimed = {};
  t.rows.forEach(function (r, i) {
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!trainee) return;
    var status = String(r[t.col['RECORD STATUS']] || '').trim();
    if (status !== 'RECORDED' && status !== 'RETURNED' && status !== 'REVOKED') return;
    var requestId = t.col['REQUEST ID'] !== undefined ? String(r[t.col['REQUEST ID']] || '').trim() : '';
    if (!requestId) return;
    var decision = String(r[t.col['DECISION']] || '').trim();
    if ((idx.byRequestId[requestId] || []).some(function (a) { return a.decision === decision; })) return;
    var pairKey = normalizeNameV20_1_(trainee) + '||' + String(r[t.col['SKILL ID']] || '').trim();
    var candidates = (idx.byPair[pairKey] || []).filter(function (a) {
      return a.decision === decision && !claimed[a.row];
    });
    var row = t.firstDataRow + i;
    if (candidates.length === 1) {
      claimed[candidates[0].row] = true;
      plan.links.push({ queueRow: row, trainee: trainee, decision: decision,
                        requestId: requestId, signoffRow: candidates[0].row,
                        decisionId: candidates[0].decisionId });
    } else if (candidates.length > 1) {
      plan.ambiguous.push('queue row ' + row + ' ' + trainee + ' : ' + candidates.length +
        ' same-type legacy decisions match — left unlinked for human review');
    } else {
      plan.unmatched.push('queue row ' + row + ' ' + trainee + ' : ' + decision +
        ' — no unclaimed legacy decision matches (genuine phantom)');
    }
  });
  return plan;
}

/** READ-ONLY preview of the legacy linkage. */
function previewLinkDecisionsV20_1() {
  var plan = legacyLinkPlanV20_1_();
  var L = ['LEGACY DECISION LINK PREVIEW — READ ONLY. Nothing was written.', ''];
  L.push('Will link : ' + plan.links.length);
  plan.links.slice(0, 45).forEach(function (x) {
    L.push('   queue row ' + x.queueRow + ' ' + x.trainee + ' → ' + x.decisionId +
           ' (sign-off row ' + x.signoffRow + ')');
  });
  L.push('Ambiguous : ' + plan.ambiguous.length);
  plan.ambiguous.forEach(function (x) { L.push('   ' + x); });
  L.push('Unmatched : ' + plan.unmatched.length);
  plan.unmatched.forEach(function (x) { L.push('   ' + x); });
  L.push('');
  L.push('Apply with applyLinkDecisionsV20_1("LINK LEGACY").');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** APPLY: writes each REQUEST ID into its matched legacy sign-off row's
 *  empty REQUEST ID cell. Nothing else changes. */
function applyLinkDecisionsV20_1(confirmToken) {
  if (confirmToken !== 'LINK LEGACY') {
    return 'Not run. Review previewLinkDecisionsV20_1(), then call applyLinkDecisionsV20_1("LINK LEGACY").';
  }
  return withScriptLockV20_1_('linkLegacyDecisions', 30000, function () {
    var plan = legacyLinkPlanV20_1_();
    var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
    if (!so.ok || so.col['REQUEST ID'] === undefined) return 'Sign-off REQUEST ID column missing.';
    var written = 0;
    plan.links.forEach(function (x) {
      var cell = so.sheet.getRange(x.signoffRow, so.col['REQUEST ID'] + 1);
      if (!String(cell.getValue() || '').trim()) { cell.setValue(x.requestId); written++; }
    });
    systemLog_('INFO', 'LEGACY DECISIONS LINKED',
      written + ' linked, ' + plan.ambiguous.length + ' ambiguous, ' + plan.unmatched.length + ' unmatched');
    return 'Linked ' + written + ' legacy decision(s). Ambiguous: ' + plan.ambiguous.length +
           '. Unmatched: ' + plan.unmatched.length + '. Run reconcileDecisionsV20() to confirm.';
  });
}

/* ---------------------------------------------------------------- *
 *  Solo-operator fast path : approve everything that is ready
 * ---------------------------------------------------------------- */

/** ONE-CLICK APPROVAL for the routine case. Takes every OPEN queue row
 *  that has NO decision picked yet, sets Approve sign-off with the
 *  standard rationale, and records each through the full validated path
 *  (request IDs, duplicate checks, immutable records, audit log — nothing
 *  is skipped). Rows needing a Return or Revoke keep the deliberate
 *  per-row flow on purpose: exceptions deserve friction; routine doesn't.
 *  Closed-trainee rows are left alone (they go through the stranded
 *  workflow). Shows a count and asks once before doing anything. */
function approveAllReadyV20_1() {
  // SPEC-v20.2.md #4 — bulk approval of permanent clinical records cannot
  // survive the rule this release exists to draw. It wrote "Evidence
  // thresholds met, FTO recommendation accepted" under a named decider,
  // in one keystroke, for every open request at once, without ever reading
  // the evidence it was asserting.
  var m = 'RETIRED in v20.2. Bulk sign-off is gone: a permanent record of ' +
          'clinical competency is not something to approve in a batch.\n\n' +
          'Use "Work my queue", which asks about one request at a time and ' +
          'requires a reason you actually chose. It is slower on purpose.';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'approveAllReadyV20_1');
  try { SpreadsheetApp.getUi().alert(m); } catch (e) {}
  Logger.log(m); return m;
}

function advanceTraineeNow() {
  if (!gateV20_2_('ADVANCE TRAINEE')) return;
  var ui = SpreadsheetApp.getUi();

  var r1 = ui.prompt('Advance a trainee (1 of 3)',
    'Exact trainee name as shown on 01 TRAINEE MASTER:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var name = String(r1.getResponseText() || '').trim();
  if (!name) return;

  var resolved = resolveTraineeV20_1_(name);
  if (!resolved.ok || !resolved.record) {
    ui.alert('Could not resolve "' + name + '": ' + resolved.reason +
      (resolved.ambiguous && resolved.ambiguous.length
        ? '\nCandidates: ' + resolved.ambiguous.join(', ') : ''));
    return;
  }
  var rec = resolved.record;
  var i = PHASES_V20_1.indexOf(rec.phase);
  if (rec.closed) { ui.alert(rec.name + ' is closed/released. No advancement.'); return; }
  if (i < 0) { ui.alert('Current phase "' + rec.phase + '" is not a known phase. Fix the master row first.'); return; }
  if (i === PHASES_V20_1.length - 1) {
    ui.alert(rec.name + ' is already in ' + rec.phase + '.\n\nClearance beyond Phase 4 is a ' +
      'governance action — use SCEMS menu > Close / release a trainee when the program is complete.');
    return;
  }
  var nextPhase = PHASES_V20_1[i + 1];

  var r2 = ui.prompt('Advance a trainee (2 of 3)',
    'Effective date (example 8/13/2026).\nLeave BLANK for today:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var effText = String(r2.getResponseText() || '').trim();
  var eff = effText ? parseDateSafeV20_1_(effText) : new Date();
  if (!eff) { ui.alert('Could not read that date. Nothing was changed. Try again like 8/13/2026.'); return; }

  var r3 = ui.prompt('Advance a trainee (3 of 3)',
    'Rationale for the record.\nLeave BLANK for: "Phase requirements met, FTO handover accepted"',
    ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var rationale = String(r3.getResponseText() || '').trim() ||
    'Phase requirements met, FTO handover accepted';

  var decider = sessionEmailV20_1_() || 'C. Hunt';
  var confirmMsg = rec.name + '\n\n' + rec.phase + '  ->  ' + nextPhase +
    '\nEffective : ' + dateKeyV20_1_(eff) +
    '\nDecided by : ' + decider +
    '\nRationale : ' + rationale +
    '\n\nMaster row, phase-start date, assignment history, audit log and ' +
    'notification all update together. Proceed?';
  if (ui.alert('Confirm advancement', confirmMsg, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
    return;
  }

  try {
    var out = applyAdvancementV20_1(rec.name, decider, eff, rationale);
    ui.alert(out);
  } catch (e) {
    ui.alert('NOT APPLIED.\n\n' + String(e && e.message ? e.message : e));
  }
}

function workMyQueueV20_1() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var ui = SpreadsheetApp.getUi();
  ensureQueueRequestIdsV20_1_(); // every item needs a stable ID to re-find its row
  var t = queueTableV20_1_();
  if (!t.ok) { ui.alert('Queue tab not found.'); return; }

  var closed = {}, onMaster = {};
  masterTraineeRowsV20_1_().forEach(function (m) {
    onMaster[m.norm] = true;
    if (m.closed) closed[m.norm] = true;
  });

  var items = [], drafts = [];
  t.rows.forEach(function (r, i) {
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    if (!trainee) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var tn = normalizeNameV20_1_(trainee);
    if (closed[tn] || !onMaster[tn]) return; // stranded workflow owns these
    var row = t.firstDataRow + i;
    var skill = String(r[t.col['SKILL']] || '').slice(0, 40);
    if (String(r[t.col['DECISION']] || '').trim()) {
      drafts.push(trainee + ' — ' + skill + ' (row ' + row + ' already has a draft decision; ' +
        'finish it on the tab with the RECORD checkbox, or clear it)');
      return;
    }
    items.push({ row: row, trainee: trainee, skill: skill,
                 skillId: String(r[t.col['SKILL ID']] || '').trim(),
                 requestId: t.col['REQUEST ID'] !== undefined
                   ? String(r[t.col['REQUEST ID']] || '').trim() : '' });
  });

  if (!items.length) {
    ui.alert('Queue is clear. Nothing needs you.' +
      (drafts.length ? '\n\nDraft(s) in progress:\n' + drafts.join('\n') : ''));
    return;
  }

  var decider = sessionEmailV20_1_() || 'C. Hunt';
  var approved = 0, returned = 0, skippedN = 0, results = [], stopped = false;

  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    var choice = '';
    for (var tries = 0; tries < 3; tries++) {
      var resp = ui.prompt(
        'Work my queue  (' + (k + 1) + ' of ' + items.length + ')',
        it.trainee + ' — ' + it.skill +
        '\n\nType one letter, then OK:' +
        '\n  A = Approve sign-off' +
        '\n  R = Return for more evidence' +
        '\n  S = Skip for now' +
        '\n\n(Cancel stops here; everything already answered stays recorded.)',
        ui.ButtonSet.OK_CANCEL);
      if (resp.getSelectedButton() !== ui.Button.OK) { stopped = true; break; }
      choice = String(resp.getResponseText() || '').trim().toUpperCase().charAt(0);
      if (choice === 'A' || choice === 'R' || choice === 'S') break;
      choice = '';
    }
    if (stopped) break;
    if (!choice || choice === 'S') { skippedN++; continue; }

    var rationale;
    if (choice === 'A') {
      rationale = approvalRationalePromptV20_2_(ui, it.trainee + ' \u2014 ' + it.skill,
        it.trainee, it.skillId);
      if (!rationale) { skippedN++; continue; }
    } else {
      var r2 = ui.prompt('Return : ' + it.trainee,
        'What should the FTO add? (this becomes the official reason on the record)\n' +
        'Leave blank for: "Additional documented evidence required before sign-off"',
        ui.ButtonSet.OK_CANCEL);
      if (r2.getSelectedButton() !== ui.Button.OK) { skippedN++; continue; }
      rationale = String(r2.getResponseText() || '').trim() ||
        'Additional documented evidence required before sign-off';
    }

    // Recording rebuilds the matrix, which re-sorts the queue, so the row
    // captured before this loop may now belong to a different request.
    var liveRow = it.requestId ? queueRowByRequestIdV20_1_(it.requestId) : 0;
    if (!liveRow) {
      skippedN++;
      results.push(it.trainee + ' — ' + it.skill + ' SKIPPED: request ' +
        (it.requestId || '(no REQUEST ID)') + ' could not be located on the queue.');
      continue;
    }
    try {
      writeQueueDecisionV20_1_(liveRow,
        choice === 'A' ? 'Approve sign-off' : 'Return for more evidence',
        decider, new Date(), rationale);
      results.push(recordDecisionForRowV20_1_(liveRow));
      if (choice === 'A') approved++; else returned++;
    } catch (e) {
      results.push(it.trainee + ' — ' + it.skill + ' FAILED: ' + e);
    }
  }

  var homeNote = '';
  if (approved + returned > 0) {
    try { refreshHomeNowV20_1(); homeNote = '\nHOME page updated.'; } catch (eH) {}
  }

  var summary = 'DONE.\n\nApproved : ' + approved + '\nReturned : ' + returned +
    '\nSkipped : ' + skippedN + homeNote +
    (drafts.length ? '\n\nDraft(s) left for the tab:\n' + drafts.join('\n') : '') +
    (results.length ? '\n\n' + results.join('\n').slice(0, 900) : '');
  systemLog_('INFO', 'GUIDED QUEUE SESSION',
    approved + ' approved, ' + returned + ' returned, ' + skippedN + ' skipped via workMyQueueV20_1');
  ui.alert(summary);
}

/** Rebuild the HOME action panel + counter tiles right now. */
function refreshHomeNowV20_1() {
  var out = [];
  try { out.push(String(refreshActionPanelV19())); }
  catch (e1) { out.push('Action panel refresh failed: ' + e1); }
  try { out.push(String(homeCountersV20_1())); }
  catch (e2) { out.push('Counter tiles refresh failed: ' + e2); }
  try {
    if (PropertiesService.getScriptProperties().getProperty('QUEUE_LIVE_VIEW') === '1') {
      queueLiveFilterApplyV20_1_();
      out.push('Queue live view re-applied.');
    }
  } catch (e3) {}
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Approve everything waiting for the trainee selected on tab 23. */
function approveTraineeOnViewV20_1() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var ui = SpreadsheetApp.getUi();
  var view = ss().getSheetByName(TAB.TRAINEE_SKILLS);
  if (!view) { ui.alert('Tab 23 not found.'); return; }
  var picked = String(view.getRange('C4').getValue() || '').trim();
  if (!picked) {
    ui.alert('Pick a trainee in the dropdown at the top of tab 23 first, then run this again.');
    return;
  }
  var resolved = resolveTraineeV20_1_(picked);
  if (!resolved.ok || !resolved.record) {
    ui.alert('Could not resolve "' + picked + '": ' + resolved.reason);
    return;
  }
  var rec = resolved.record;
  if (rec.closed) { ui.alert(rec.name + ' is closed/released. Nothing to decide.'); return; }

  ensureQueueRequestIdsV20_1_(); // every item needs a stable ID to re-find its row
  var t = queueTableV20_1_();
  if (!t.ok) { ui.alert('Queue tab not found.'); return; }
  var items = [], drafts = [];
  t.rows.forEach(function (r, i) {
    if (normalizeNameV20_1_(cleanNameV20_1_(r[t.col['TRAINEE']])) !== normalizeNameV20_1_(rec.name)) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var row = t.firstDataRow + i;
    var skill = String(r[t.col['SKILL']] || '').slice(0, 40);
    if (String(r[t.col['DECISION']] || '').trim()) {
      drafts.push(skill + ' (row ' + row + ' has a draft decision — finish it on tab 20)');
      return;
    }
    items.push({ row: row, skill: skill, trainee: rec.name,
                 skillId: String(r[t.col['SKILL ID']] || '').trim(),
                 requestId: t.col['REQUEST ID'] !== undefined
                   ? String(r[t.col['REQUEST ID']] || '').trim() : '' });
  });

  if (!items.length) {
    ui.alert('Nothing is waiting for ' + rec.name + '.\n\nEvery skill is either not at its evidence ' +
      'threshold yet, or already decided.' +
      (drafts.length ? '\n\nDraft(s) in progress:\n' + drafts.join('\n') : ''));
    return;
  }

  var decider = sessionEmailV20_1_() || 'C. Hunt';
  var approved = 0, returned = 0, skippedN = 0, results = [], stopped = false;

  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    var choice = '';
    for (var tries = 0; tries < 3; tries++) {
      var resp = ui.prompt(
        rec.name + '  (' + (k + 1) + ' of ' + items.length + ')',
        it.skill +
        '\n\nType one letter, then OK:' +
        '\n  A = Approve sign-off' +
        '\n  R = Return for more evidence' +
        '\n  S = Skip for now' +
        '\n\n(Cancel stops here; everything already answered stays recorded.)',
        ui.ButtonSet.OK_CANCEL);
      if (resp.getSelectedButton() !== ui.Button.OK) { stopped = true; break; }
      choice = String(resp.getResponseText() || '').trim().toUpperCase().charAt(0);
      if (choice === 'A' || choice === 'R' || choice === 'S') break;
      choice = '';
    }
    if (stopped) break;
    if (!choice || choice === 'S') { skippedN++; continue; }

    var rationale;
    if (choice === 'A') {
      rationale = approvalRationalePromptV20_2_(ui, it.trainee + ' \u2014 ' + it.skill,
        it.trainee, it.skillId);
      if (!rationale) { skippedN++; continue; }
    } else {
      var r2 = ui.prompt('Return : ' + it.skill,
        'What should the FTO add? (this becomes the official reason on the record)\n' +
        'Leave blank for: "Additional documented evidence required before sign-off"',
        ui.ButtonSet.OK_CANCEL);
      if (r2.getSelectedButton() !== ui.Button.OK) { skippedN++; continue; }
      rationale = String(r2.getResponseText() || '').trim() ||
        'Additional documented evidence required before sign-off';
    }

    // Recording rebuilds the matrix, which re-sorts the queue, so the row
    // captured before this loop may now belong to a different request.
    var liveRow = it.requestId ? queueRowByRequestIdV20_1_(it.requestId) : 0;
    if (!liveRow) {
      skippedN++;
      results.push(it.skill + ' SKIPPED: request ' +
        (it.requestId || '(no REQUEST ID)') + ' could not be located on the queue.');
      continue;
    }
    try {
      writeQueueDecisionV20_1_(liveRow,
        choice === 'A' ? 'Approve sign-off' : 'Return for more evidence',
        decider, new Date(), rationale);
      results.push(recordDecisionForRowV20_1_(liveRow));
      if (choice === 'A') approved++; else returned++;
    } catch (e) {
      results.push(it.skill + ' FAILED: ' + e);
    }
  }

  var homeNote = '';
  if (approved + returned > 0) {
    try { refreshHomeNowV20_1(); homeNote = '\nTab 20 live view and HOME updated.'; } catch (eH) {}
  }
  try {
    refreshTraineeSkillsViewV19(picked, String(view.getRange('E4').getValue() || ''));
    if (approved + returned > 0) homeNote += '\nTab 23 repainted.';
  } catch (eV) {}

  var summary = rec.name + ' — DONE.\n\nApproved : ' + approved + '\nReturned : ' + returned +
    '\nSkipped : ' + skippedN + homeNote +
    (drafts.length ? '\n\nDraft(s) left on tab 20:\n' + drafts.join('\n') : '') +
    (results.length ? '\n\n' + results.join('\n').slice(0, 800) : '');
  systemLog_('INFO', 'TRAINEE VIEW APPROVAL SESSION',
    rec.name + ' : ' + approved + ' approved, ' + returned + ' returned, ' + skippedN + ' skipped');
  ui.alert(summary);
}
