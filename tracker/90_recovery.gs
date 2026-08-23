/**
 * SCEMS Field Training Tracker — 90_recovery
 *
 * Run-once tools for when something went wrong: phantoms, lost responses,
 * backfills.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   SCEMS v20.1.0h ADD-ON : phantom repair
 *   SCEMS v20.1.0h ADD-ON : replay the restore-eaten responses
 *   SCEMS v20.1.0h ADD-ON : hub backfill (recovered shift evals)
 *   SCEMS v20.1.0h ADD-ON : backfill cleanup + matcher fix
 *   Catching up the responses that arrived while nothing was listening
 */

/** (internal) the same phantom test the reconciler uses. */
function phantomRowsV20_1_() {
  var t = queueTableV20_1_();
  var idx = signoffIndexV20_1_();
  var out = [];
  if (!t.ok || !idx.ok) return out;
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
    if ((idx.byPair[pairKey] || []).some(function (a) { return a.decision === decision; })) return;
    out.push({
      row: t.firstDataRow + i,
      trainee: trainee,
      skill: String(r[t.col['SKILL']] || '').slice(0, 35),
      decision: decision,
      status: status,
      complete: !!(decision && String(r[t.col['DECIDED BY']] || '').trim() &&
                   parseDateSafeV20_1_(r[t.col['DECISION DATE']]) &&
                   String(r[t.col['RATIONALE']] || '').trim())
    });
  });
  return out;
}

/** READ-ONLY preview: what would be repaired, trainee by trainee. */
function previewPhantomRepairV20_1() {
  var list = phantomRowsV20_1_();
  var L = ['PHANTOM REPAIR PREVIEW — READ ONLY. Nothing was written.', ''];
  if (!list.length) {
    L.push('No phantoms. The queue and the sign-off log agree.');
  } else {
    var byTrainee = {};
    list.forEach(function (p) {
      if (!byTrainee[p.trainee]) byTrainee[p.trainee] = [];
      byTrainee[p.trainee].push(p);
    });
    Object.keys(byTrainee).forEach(function (name) {
      L.push(name + ' : ' + byTrainee[name].length + ' row(s)');
      byTrainee[name].forEach(function (p) {
        L.push('   row ' + p.row + ' | ' + p.skill + ' | ' + (p.decision || '(no decision)') +
               ' | ' + (p.complete ? 'will be recorded with its original details'
                                   : 'MISSING DETAILS — will be left OPEN for you to finish'));
      });
    });
    L.push('');
    L.push(list.length + ' phantom(s). Apply with fixPhantomsNowV20_1("FIX PHANTOMS").');
    L.push('Each recorded row keeps its ORIGINAL decider, date, and rationale, tagged [migrated v20.1].');
  }
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** APPLY: reopen the phantoms, then record them through the validated
 *  stranded-decision path (closed trainees included). Token-gated. */
function fixPhantomsNowV20_1(confirmToken) {
  if (confirmToken !== 'FIX PHANTOMS') {
    return 'Not run. Review previewPhantomRepairV20_1(), then call fixPhantomsNowV20_1("FIX PHANTOMS").';
  }
  var list = phantomRowsV20_1_();
  if (!list.length) return 'No phantoms to fix. The queue and the sign-off log agree.';
  // Reopen under the lock, then RELEASE it before recording: the recorder
  // takes its own lock per row, and the lock wrapper refuses to nest.
  var reopened = withScriptLockV20_1_('fixPhantomsReopen', 60000, function () {
    var t = queueTableV20_1_();
    var n = 0;
    list.forEach(function (p) {
      t.sheet.getRange(p.row, t.col['RECORD STATUS'] + 1).setValue('OPEN');
      n++;
    });
    return n;
  });
  systemLog_('WARN', 'PHANTOM ROWS REOPENED',
    reopened + ' row(s) reopened for validated re-recording (statuses had no records behind them)');
  var recordResult = applyStrandedDecisionsV20_1('RECORD STRANDED', 'INCLUDE CLOSED');
  var after = phantomRowsV20_1_();
  var stillOpen = list.length - (list.filter(function (p) { return p.complete; }).length);
  var msg = 'PHANTOM REPAIR COMPLETE\n\nReopened : ' + reopened +
    '\nStill needing details from you (left OPEN on tab 20) : ' + stillOpen +
    '\nPhantoms remaining after repair : ' + after.length +
    '\n\n' + recordResult +
    '\n\nRun reconcileDecisionsV20() to confirm PHANTOM : 0.';
  try { refreshHomeNowV20_1(); } catch (eH) {}
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** One-click runner for the phantom repair (token baked in). */
function stepD_fixPhantoms() { Logger.log(fixPhantomsNowV20_1('FIX PHANTOMS')); }

/** One-click runner: replay everything lost since the restore point. */
function stepE_replayLostResponses() { Logger.log(replayMissingSinceV20_1_('8/5/2026')); }

/** Recovers form submissions that never reached the evidence log.
 *
 *  The case this exists for: a form declared owned by a form-bound trigger
 *  that never had one. onHubFormSubmit refused those submissions and wrote
 *  SKIPPED_OWNED to the ledger — "handled by the form-bound trigger" — for a
 *  handler that did not exist, so the loss looked like a successful handoff.
 *
 *  Safe to run, and safe to run twice: evidence rows carry SOURCE RESPONSE
 *  ID, so a response already expanded is detected and skipped rather than
 *  duplicated. Defaults to every response ever, because the point is to find
 *  what was missed, not to guess when. */
function recoverLostSubmissionsV20_2() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  var unbound = [];
  try {
    var bound = {};
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var src = ''; try { src = String(t.getTriggerSourceId() || ''); } catch (e2) {}
      if (src) bound[src] = true;
    });
    formBoundTriggerPlanV20_2_().forEach(function (p) {
      var f = getStoredFormV19_(p.title);
      if (f && !bound[f.getId()]) unbound.push(p.title);
    });
  } catch (e3) {}

  var cutoff = '';
  if (ui) {
    var warn = 'RECOVER LOST SUBMISSIONS\n\n' +
      (unbound.length
        ? 'STILL UNBOUND: ' + unbound.join(', ') + '\nRun repairAllTriggersNow() first, or ' +
          'new submissions keep going missing.\n\n'
        : 'Every live form currently has a trigger bound.\n\n') +
      'This re-runs skills and handover responses that never reached the ' +
      'evidence log. Responses already recorded are detected by their ' +
      'response ID and skipped, so nothing is duplicated.\n\n' +
      'Continue?';
    if (ui.alert('Recover lost submissions', warn, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
      return 'Cancelled. Nothing was replayed.';
    }
    var r = ui.prompt('Recover lost submissions',
      'Earliest submission date to consider.\n\n' +
      'Leave BLANK for every response ever — that is the right answer unless ' +
      'you know the loss started on a particular day.',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return 'Cancelled. Nothing was replayed.';
    cutoff = String(r.getResponseText() || '').trim();
  }

  var msg = replayMissingSinceV20_1_(cutoff);
  if (unbound.length) {
    msg += '\n\nWARNING: ' + unbound.join(', ') + ' still has no trigger bound. ' +
           'Run repairAllTriggersNow() or this will happen again.';
  }
  Logger.log(msg);
  if (ui) ui.alert(msg.slice(0, 1400));
  return msg;
}

function replayMissingSinceV20_1_(cutoffText) {
  // v20.2: a blank cutoff now means "every response, however old", instead of
  // being an error. The old caller hardcoded 8/5/2026, which silently skipped
  // anything earlier as skippedOld — including the combined skills form's
  // oldest submissions, since that form predates the cutoff. A recovery tool
  // that quietly declines to look at the very responses it exists to find is
  // worse than no tool.
  var noCutoff = !String(cutoffText || '').trim();
  var cutoff = noCutoff ? null : parseDateSafeV20_1_(cutoffText);
  if (!noCutoff && !cutoff) return 'Unreadable cutoff date: ' + cutoffText;

  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  var inLedger = {};
  if (ledger.ok) {
    ledger.rows.forEach(function (r) {
      var rid = String(r[ledger.col['RESPONSE ID']] || '').trim();
      if (rid) inLedger[rid] = true;
    });
  }

  var ev = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  var inEvidence = {};
  if (ev.ok && ev.col['SOURCE RESPONSE ID'] !== undefined) {
    ev.rows.forEach(function (r) {
      var rid = String(r[ev.col['SOURCE RESPONSE ID']] || '').trim();
      if (rid) inEvidence[rid] = true;
    });
  }

  var owned = formTitlesOwnedByFormTriggersV20_1_();
  var out = [], replayed = 0, failed = 0;
  var skippedOld = 0, skippedLedger = 0, skippedEvidence = 0;

  storedFormIdsV20_1_().forEach(function (id) {
    var f, title;
    try { f = FormApp.openById(id); title = String(f.getTitle() || '').trim(); }
    catch (e) { out.push('UNREADABLE form ' + id + ' : ' + e); return; }
    if (owned.indexOf(title) < 0) return; // hub-owned forms are lane two
    f.getResponses().forEach(function (resp) {
      var rid = resp.getId();
      var when = resp.getTimestamp();
      if (cutoff && when && when.getTime() < cutoff.getTime()) { skippedOld++; return; }
      if (inLedger[rid]) { skippedLedger++; return; }
      if (inEvidence[rid]) {
        skippedEvidence++;
        out.push('SKIP ' + title + ' ' + (when ? dateKeyV20_1_(when) : '(no date)') +
                 ' : evidence already on tab 19 (' + rid.slice(0, 18) + '…)');
        return;
      }
      try {
        out.push('REPLAY ' + title + ' ' + (when ? dateKeyV20_1_(when) : '(no date)') +
                 ' : ' + replayResponseV20_1(id, rid));
        replayed++;
      } catch (e2) {
        failed++;
        out.push('FAILED ' + title + ' ' + (when ? dateKeyV20_1_(when) : '(no date)') + ' ' +
                 rid.slice(0, 18) + '… : ' + e2);
      }
    });
  });

  try { refreshHomeNowV20_1(); } catch (eH) {}
  var msg = 'LOST-RESPONSE REPLAY — skills + handover forms, ' +
    (cutoff ? 'submitted on/after ' + dateKeyV20_1_(cutoff) : 'ALL responses, no date cutoff') + '\n\n' +
    'Replayed : ' + replayed +
    '\nFailed : ' + failed +
    '\nSkipped, submitted before the cutoff (their data survived inside the restored sheets) : ' + skippedOld +
    '\nSkipped, already in the ledger : ' + skippedLedger +
    '\nSkipped, evidence already present on tab 19 : ' + skippedEvidence +
    (out.length ? '\n\n' + out.join('\n') : '') +
    '\n\nNext: the hub-form lane (shift evals, reflections, concerns, decision records).';
  systemLog_('WARN', 'LOST RESPONSES REPLAYED',
    replayed + ' replayed, ' + failed + ' failed, cutoff ' +
    (cutoff ? dateKeyV20_1_(cutoff) : 'none'));
  Logger.log(msg);
  return msg;
}

/** One-click: backfill the recovered shift evals. Auto-finds the largest
 *  eval-classified response tab, so relink renumbering never breaks it. */
function stepF_backfillEvals() {
  var best = null, bestRows = 0;
  ss().getSheets().forEach(function (sh) {
    if (sh.getName().replace(/[_\s]/g, ' ').toLowerCase().indexOf('form responses') !== 0 &&
        sh.getName().replace(/[_\s]/g, '').toLowerCase().indexOf('formresponses') !== 0) return;
    var kind = '';
    try { kind = classifySheetEventV20_1_(sh); } catch (e) {}
    if (kind !== 'eval') return;
    var n = Math.max(sh.getLastRow() - 1, 0);
    if (n > bestRows) { best = sh; bestRows = n; }
  });
  if (!best) { Logger.log('No eval-classified Form Responses tab found.'); return; }
  Logger.log('Using "' + best.getName() + '" (' + bestRows + ' data rows).');
  Logger.log(backfillHubTabV20_1(best.getName()));
}

/** Auto-find the fullest eval response tab and backfill it. */
function stepH_backfillNewestEvals() {
  var best = null, bestRows = 0;
  ss().getSheets().forEach(function (sh) {
    var kind = '';
    try { kind = classifySheetEventV20_1_(sh); } catch (e) {}
    if (kind !== 'eval') return;
    if (sh.getName() === TAB.EVAL) return; // never treat the mirror as a source
    var n = Math.max(sh.getLastRow() - 1, 0);
    if (n > bestRows) { best = sh; bestRows = n; }
  });
  if (!best) { Logger.log('No eval-headed response tab found. Run stepG_fixEvalLink.'); return; }
  Logger.log('Using "' + best.getName() + '" — ' + bestRows + ' data row(s).' +
    (bestRows < 20 ? '  ← fewer than the 23 the form holds: run stepG_fixEvalLink, wait ONE minute, then run this again.' : ''));
  Logger.log(backfillHubTabV20_1(best.getName()));
}

/** Diagnose and force-fix the eval form's spreadsheet link. */
function stepG_fixEvalLink() {
  var out = [];
  var evalId = '';
  storedFormIdsV20_1_().forEach(function (id) {
    try {
      if (String(FormApp.openById(id).getTitle() || '').trim() === FORM_TITLES.EVAL) evalId = id;
    } catch (e) {}
  });
  if (!evalId) { Logger.log('Stored eval form not found. Run rebuildFormIdsNow, then this again.'); return; }
  var f = FormApp.openById(evalId);
  out.push('Real form : "' + f.getTitle() + '" | ' + f.getResponses().length + ' response(s) at the source');
  var dest = '';
  try { dest = f.getDestinationId(); } catch (e) {}
  out.push('Link before : ' + (dest ? (dest === ss().getId() ? 'this spreadsheet' : 'A DIFFERENT FILE (' + dest + ')') : '(not linked)'));

  var before = {};
  ss().getSheets().forEach(function (sh) { before[sh.getName()] = true; });
  try { f.removeDestination(); } catch (e) {}
  f.setDestination(FormApp.DestinationType.SPREADSHEET, ss().getId());
  SpreadsheetApp.flush();
  Utilities.sleep(8000); // give the response sync a moment to land

  var fresh = '';
  ss().getSheets().forEach(function (sh) { if (!before[sh.getName()]) fresh = sh.getName(); });
  if (fresh) {
    var n = Math.max(ss().getSheetByName(fresh).getLastRow() - 1, 0);
    out.push('Relinked. New tab : "' + fresh + '" with ' + n + ' data row(s) so far.');
    out.push(n >= 1 ? 'Now run stepH_backfillNewestEvals.'
                    : 'Rows still syncing — wait ONE minute, then run stepH_backfillNewestEvals.');
  } else {
    out.push('Relinked; the new tab has not appeared yet. Wait ONE minute, then run stepH_backfillNewestEvals.');
  }
  systemLog_('WARN', 'EVAL FORM RELINKED', out.join(' | ').slice(0, 400));
  Logger.log(out.join('\n'));
}

/** Check and fix every stored form's delivery address. */
function stepI_fixAllFormLinks() {
  var liveId = ss().getId();
  var out = [], relinked = 0;
  storedFormIdsV20_1_().forEach(function (id) {
    var f, title = '', n = 0;
    try {
      f = FormApp.openById(id);
      title = String(f.getTitle() || '').trim();
      n = f.getResponses().length;
    } catch (e) { out.push('UNREADABLE form ' + id + ' : ' + e); return; }
    var dest = '';
    try { dest = f.getDestinationId(); } catch (e2) {}
    if (dest === liveId) {
      out.push('OK        ' + title + ' (' + n + ' responses) → this file');
      return;
    }
    out.push((dest ? 'WRONG FILE' : 'UNLINKED ') + ' ' + title + ' (' + n + ' responses)' +
             (dest ? ' → was delivering to ' + dest : ''));
    try {
      try { f.removeDestination(); } catch (e3) {}
      f.setDestination(FormApp.DestinationType.SPREADSHEET, liveId);
      relinked++;
      out.push('           RELINKED to this file — full history will land in a fresh tab.');
    } catch (e4) {
      out.push('           RELINK FAILED : ' + e4);
    }
  });
  var msg = 'FORM DELIVERY SWEEP\n\n' + out.join('\n') +
    '\n\n' + relinked + ' form(s) relinked.' +
    (relinked ? ' Wait ONE minute for the response history to land, then run stepJ_backfillAllHubTabs.'
              : ' Every form already delivers here. Nothing to backfill beyond what stepH handled.');
  systemLog_('WARN', 'FORM LINK SWEEP', relinked + ' relinked');
  Logger.log(msg);
  return msg;
}

/** Backfill every hub form kind from its fullest response tab. */
function stepJ_backfillAllHubTabs() {
  var mirrors = [TAB.EVAL, TAB.REFLECT, TAB.URGENT, DECISIONS_TAB];
  var best = { eval: null, reflect: null, urgent: null, decision: null };
  ss().getSheets().forEach(function (sh) {
    if (mirrors.indexOf(sh.getName()) >= 0) return; // never read a mirror as a source
    var kind = '';
    try { kind = classifySheetEventV20_1_(sh); } catch (e) {}
    if (!best.hasOwnProperty(kind) || !kind) return;
    var n = Math.max(sh.getLastRow() - 1, 0);
    if (!best[kind] || n > best[kind].rows) best[kind] = { name: sh.getName(), rows: n };
  });
  var out = [];
  Object.keys(best).forEach(function (kind) {
    if (!best[kind] || !best[kind].rows) { out.push(kind + ' : no response tab with data — nothing to do.'); return; }
    out.push('=== ' + kind + ' : "' + best[kind].name + '" (' + best[kind].rows + ' rows) ===');
    out.push(String(backfillHubTabV20_1(best[kind].name)));
  });
  var msg = out.join('\n\n');
  Logger.log(msg);
  return msg;
}

/** Minute-tolerant key: minute bucket + up to two name columns. */
function backfillRowKeysV20_1_(ts, a, b) {
  var m = Math.floor(ts.getTime() / 60000);
  var tail = '|' + String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') +
             '|' + String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return [m + tail, (m - 1) + tail, (m + 1) + tail];
}

/** INTENTIONAL OVERRIDE : hub backfill with the minute-tolerant matcher. */
function backfillHubTabV20_1(tabName) {
  var S = ss();
  var src = S.getSheetByName(tabName);
  if (!src) {
    var wantedNorm = String(tabName || '').replace(/[_\s]/g, '').toLowerCase();
    S.getSheets().forEach(function (sh) {
      if (!src && sh.getName().replace(/[_\s]/g, '').toLowerCase() === wantedNorm) src = sh;
    });
  }
  if (!src) return 'Tab "' + tabName + '" not found. Check the exact tab name at the bottom of the spreadsheet.';
  var kind = classifySheetEventV20_1_(src);
  if (!kind || kind === 'skill-combined') {
    return 'Tab "' + src.getName() + '" is not a hub form tab (classified: ' + (kind || 'unknown') + '). Nothing done.';
  }
  var mirrorTab = kind === 'eval' ? TAB.EVAL : kind === 'reflect' ? TAB.REFLECT :
                  kind === 'urgent' ? TAB.URGENT : DECISIONS_TAB;

  var m = getSheetOrNullV20_1_(mirrorTab);
  var seen = {};
  if (m && m.getLastRow() >= 5) {
    m.getRange(5, 1, m.getLastRow() - 4, 3).getValues().forEach(function (r) {
      var d = parseDateSafeV20_1_(r[0]);
      if (!d) return;
      backfillRowKeysV20_1_(d, r[1], r[2]).forEach(function (k) { seen[k] = true; });
    });
  }

  var lastRow = src.getLastRow(), lastCol = src.getLastColumn();
  if (lastRow < 2) return 'No data rows on "' + src.getName() + '".';
  var disp = src.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  var raw = src.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var processed = 0, skipped = 0, failed = 0, out = [];
  for (var i = 0; i < disp.length; i++) {
    var ts = parseDateSafeV20_1_(raw[i][0]);
    if (!ts) continue;
    var keys = backfillRowKeysV20_1_(ts, raw[i][1], raw[i][2]);
    if (seen[keys[0]] || seen[keys[1]] || seen[keys[2]]) { skipped++; continue; }
    var fake = { range: src.getRange(2 + i, 1, 1, lastCol), values: disp[i], source: S };
    try {
      onHubFormSubmit(fake);
      processed++;
      keys.forEach(function (k) { seen[k] = true; });
      out.push('BACKFILLED ' + dateKeyV20_1_(ts) + ' | ' + String(raw[i][1] || '').slice(0, 30));
    } catch (e2) { failed++; out.push('FAILED source row ' + (2 + i) + ' : ' + e2); }
  }
  try { refreshHomeNowV20_1(); } catch (eH) {}
  var msg = 'HUB BACKFILL — "' + src.getName() + '" (' + kind + ')\n\n' +
    'Processed : ' + processed + '\nAlready mirrored (skipped) : ' + skipped +
    '\nFailed : ' + failed + (out.length ? '\n\n' + out.join('\n') : '');
  systemLog_('WARN', 'HUB TAB BACKFILLED',
    src.getName() + ' : ' + processed + ' processed, ' + skipped + ' skipped, ' + failed + ' failed');
  Logger.log(msg);
  return msg;
}

/** (internal) plan the cleanup of eval-mirror echoes and tab-12 duplicates. */
function backfillCleanupPlanV20_1_() {
  var plan = { mirrorDeletes: [], queueCloses: [], notes: [] };

  // ---- tab 02 : the later of any same-minute+FTO+trainee pair is the echo
  var m = getSheetOrNullV20_1_(TAB.EVAL);
  if (m && m.getLastRow() >= 5) {
    var rows = m.getRange(5, 1, m.getLastRow() - 4, 3).getValues();
    var firstByKey = {};
    rows.forEach(function (r, i) {
      var d = parseDateSafeV20_1_(r[0]);
      if (!d) return;
      if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return; // date-only legacy: never touched
      var key = backfillRowKeysV20_1_(d, r[1], r[2])[0];
      var alt1 = backfillRowKeysV20_1_(d, r[1], r[2])[1];
      var alt2 = backfillRowKeysV20_1_(d, r[1], r[2])[2];
      var hit = firstByKey[key] !== undefined ? firstByKey[key]
              : firstByKey[alt1] !== undefined ? firstByKey[alt1]
              : firstByKey[alt2] !== undefined ? firstByKey[alt2] : undefined;
      if (hit !== undefined) {
        plan.mirrorDeletes.push({ row: 5 + i, keepRow: 5 + hit,
          label: dateKeyV20_1_(d) + ' | ' + String(r[1] || '') + ' → ' + String(r[2] || '') });
      } else {
        firstByKey[key] = i;
      }
    });
  } else {
    plan.notes.push('Eval mirror not found — no mirror cleanup planned.');
  }

  // ---- tab 12 : duplicate open items, closed-trainee items, test items
  var q = ss().getSheetByName(TAB.QUEUE);
  if (q && q.getLastRow() >= 5) {
    var closed = {}, onMaster = {};
    masterTraineeRowsV20_1_().forEach(function (mm) {
      onMaster[mm.norm] = true;
      if (mm.closed) closed[mm.norm] = true;
    });
    var qv = q.getRange(5, 1, Math.max(q.getLastRow() - 4, 1), 6).getValues();
    var earliest = {};
    qv.forEach(function (r, i) {
      var name = cleanNameV20_1_(r[1]);
      if (!name) return;
      if (String(r[5] || '').trim()) return; // already closed/answered
      var row = 5 + i;
      var norm = normalizeNameV20_1_(name);
      var ask = String(r[2] || '').trim();
      var label = name + ' | ' + ask;
      if (name.indexOf('EXAMPLE') === 0 || name.indexOf(TEST_PREFIX) === 0) {
        plan.queueCloses.push({ row: row, note: 'Closed : test data', label: label });
        return;
      }
      if (closed[norm] || !onMaster[norm]) {
        plan.queueCloses.push({ row: row, note: 'Closed : trainee released', label: label });
        return;
      }
      var k = norm + '|' + ask.toLowerCase();
      if (earliest[k] !== undefined) {
        var keepRow = earliest[k];
        plan.queueCloses.push({ row: row, note: 'Duplicate : consolidated with row ' + keepRow, label: label });
      } else {
        earliest[k] = row;
      }
    });
  } else {
    plan.notes.push('Decision queue (12) not found — no queue cleanup planned.');
  }
  return plan;
}

/** READ-ONLY preview of the cleanup. */
function previewBackfillCleanupV20_1() {
  var p = backfillCleanupPlanV20_1_();
  var L = ['BACKFILL CLEANUP PREVIEW — READ ONLY. Nothing was written.', ''];
  L.push('Tab 02 echo rows to delete : ' + p.mirrorDeletes.length + '  (original row kept in every pair)');
  p.mirrorDeletes.forEach(function (x) {
    L.push('   delete row ' + x.row + ' (keeps row ' + x.keepRow + ') : ' + x.label);
  });
  L.push('');
  L.push('Tab 12 open items to close : ' + p.queueCloses.length);
  p.queueCloses.forEach(function (x) { L.push('   row ' + x.row + ' : ' + x.label + '  → ' + x.note); });
  p.notes.forEach(function (n) { L.push(n); });
  L.push('');
  L.push('Date-only legacy mirror rows are left untouched, always.');
  L.push('Apply with stepK_cleanBackfill.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** APPLY the cleanup. Token baked into the stepK runner. */
function applyBackfillCleanupV20_1(confirmToken) {
  if (confirmToken !== 'CLEAN BACKFILL') {
    return 'Not run. Review previewBackfillCleanupV20_1(), then use stepK_cleanBackfill.';
  }
  return withScriptLockV20_1_('cleanBackfill', 60000, function () {
    var p = backfillCleanupPlanV20_1_();
    var m = getSheetOrNullV20_1_(TAB.EVAL);
    var deleted = 0;
    if (m && p.mirrorDeletes.length) {
      p.mirrorDeletes.map(function (x) { return x.row; })
        .sort(function (a, b) { return b - a; }) // bottom-up so row numbers stay true
        .forEach(function (row) { m.deleteRow(row); deleted++; });
    }
    var q = ss().getSheetByName(TAB.QUEUE);
    var closedN = 0;
    if (q) {
      p.queueCloses.forEach(function (x) {
        q.getRange(x.row, 6).setValue(x.note);
        q.getRange(x.row, 7).setValue('System');
        q.getRange(x.row, 8).setValue(new Date());
        closedN++;
      });
    }
    try { refreshHomeNowV20_1(); } catch (eH) {}
    var msg = 'BACKFILL CLEANUP COMPLETE\n\nEcho rows deleted from tab 02 : ' + deleted +
      '\nTab 12 items closed : ' + closedN +
      '\n\nRun previewBackfillCleanupV20_1 again — it should report 0 and 0.';
    systemLog_('WARN', 'BACKFILL CLEANUP APPLIED', deleted + ' mirror echoes deleted, ' + closedN + ' queue items closed');
    Logger.log(msg);
    return msg;
  });
}

/** One-click runner, token baked in. */
function stepK_cleanBackfill() { Logger.log(applyBackfillCleanupV20_1('CLEAN BACKFILL')); }

/** One-click: acknowledge historical form responses in the ledger. */
function stepL_acknowledgeHistorical() {
  var cutoff = parseDateSafeV20_1_('8/5/2026');
  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  if (!ledger.ok) { Logger.log('Ledger not present.'); return; }
  var inLedger = {};
  ledger.rows.forEach(function (r) {
    var rid = String(r[ledger.col['RESPONSE ID']] || '').trim();
    if (rid) inLedger[rid] = true;
  });
  var out = [], added = 0;
  storedFormIdsV20_1_().forEach(function (id) {
    var f, title;
    try { f = FormApp.openById(id); title = String(f.getTitle() || '').trim(); }
    catch (e) { out.push('UNREADABLE ' + id + ' : ' + e); return; }
    f.getResponses().forEach(function (resp) {
      var rid = resp.getId();
      var when = resp.getTimestamp();
      if (inLedger[rid]) return;
      if (when && cutoff && when.getTime() >= cutoff.getTime()) return; // recent gaps stay visible
      var row = ledgerOpenV20_1_('HIST-' + id.slice(0, 8) + '-' + rid.slice(0, 24), id, rid, title, 'historical');
      ledgerSetV20_1_(row, 'RECONCILED',
        'Pre-v20.1 processing acknowledged ' + (when ? dateKeyV20_1_(when) : '') +
        '; data present via original pipeline.');
      added++;
      out.push('ACKNOWLEDGED ' + title + ' ' + (when ? dateKeyV20_1_(when) : '(no date)'));
    });
  });
  var msg = 'HISTORICAL LEDGER ACKNOWLEDGMENT\n\n' + added + ' response(s) marked RECONCILED.' +
    (out.length ? '\n\n' + out.join('\n') : '');
  systemLog_('INFO', 'HISTORICAL RESPONSES ACKNOWLEDGED', added + ' ledger row(s) added as RECONCILED');
  Logger.log(msg);
  return msg;
}

/** Replays every form response that never reached the ledger.
 *
 *  A form with no submit trigger does not lose its answers: they land in the
 *  response tab and sit there. Twelve of them did. Everything needed to turn
 *  one into evidence rows already existed - replayResponseV20_1 does exactly
 *  that, and onSkillsGridSubmitV20 refuses to expand a response twice - but
 *  nothing ever walked the list and called it.
 *
 *  Safe to run as often as you like. Three separate guards make a second run
 *  a no-op: the ledger key, the SOURCE RESPONSE ID already on the evidence
 *  rows, and the per-response try/catch below.
 *
 *  One response failing does not stop the rest. Each is reported by name.
 *
 *  catchUpUnprocessedPreview() shows what it would do and writes nothing. */
function catchUpUnprocessed() { return catchUpUnprocessedV20_2_(false); }

function catchUpUnprocessedPreview() { return catchUpUnprocessedV20_2_(true); }

function catchUpUnprocessedV20_2_(previewOnly) {
  var L = ['CATCHING UP UNPROCESSED RESPONSES' + (previewOnly ? '  — PREVIEW, nothing written' : ''), ''];

  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  var inLedger = {};
  if (ledger.ok && ledger.col['RESPONSE ID'] !== undefined) {
    ledger.rows.forEach(function (r) {
      var rid = String(r[ledger.col['RESPONSE ID']] || '').trim();
      if (rid) inLedger[rid] = true;
    });
  } else {
    L.push('The ingestion ledger is not readable, so every response looks new.');
    L.push('Replaying is still safe - the evidence rows carry their own response');
    L.push('id and will not be written twice - but stop and check first.');
    L.push('');
  }

  var owned = formTitlesOwnedByFormTriggersV20_1_();
  var todo = [];
  storedFormIdsV20_1_().forEach(function (id) {
    var f, title = '';
    try { f = FormApp.openById(id); title = String(f.getTitle() || '').trim(); }
    catch (e) { L.push('  UNREADABLE form ' + id + ' : ' + e); return; }
    if (owned.indexOf(title) < 0) return;
    var responses;
    try { responses = f.getResponses(); } catch (e2) {
      L.push('  ' + title + ' : could not list responses — ' + e2); return;
    }
    var mine = [];
    responses.forEach(function (resp) {
      var rid = resp.getId();
      if (!inLedger[rid]) mine.push(rid);
    });
    L.push('  ' + title + ' : ' + responses.length + ' response(s), ' +
           mine.length + ' never processed');
    mine.forEach(function (rid) { todo.push({ formId: id, title: title, rid: rid }); });
  });

  L.push('');
  if (!todo.length) {
    L.push('Nothing is waiting. Every response has been through the ledger.');
    var msg0 = L.join('\n');
    Logger.log(msg0);
    return msg0;
  }

  if (previewOnly) {
    L.push(todo.length + ' response(s) would be replayed through their own handler,');
    L.push('which is the same path a live submission takes. Nothing has been written.');
    L.push('');
    L.push('To do it: catchUpUnprocessed()');
    var msg1 = L.join('\n');
    Logger.log(msg1);
    return msg1;
  }

  var done = 0, failed = [];
  todo.forEach(function (item) {
    try {
      replayResponseV20_1(item.formId, item.rid);
      done++;
    } catch (e) {
      failed.push({ item: item, why: String(e.message || e) });
    }
  });

  L.push(done + ' of ' + todo.length + ' replayed.');
  if (failed.length) {
    L.push('');
    L.push('NOT REPLAYED  (' + failed.length + ')');
    failed.forEach(function (f) {
      L.push('  ' + f.item.title + '  ' + f.item.rid);
      L.push('      ' + f.why);
    });
    L.push('  Those responses are untouched and still in their response tab.');
    L.push('  Nothing is lost. Running this again retries only these.');
  }
  L.push('');
  L.push('Check it with reconcileIngestionV20_1(), which reads and writes nothing.');
  L.push('Anything accepted is now on ' + TAB.SKILL_EVIDENCE + ', and anything that');
  L.push('crossed its threshold is on ' + TAB.SKILL_VALIDATION + ' waiting for a decision.');

  systemLog_('INFO', 'CATCH-UP REPLAY',
    done + ' replayed, ' + failed.length + ' failed, of ' + todo.length + ' waiting');

  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}
