/**
 * SCEMS Field Training Tracker — 30_ingestion
 *
 * A form response arriving, and the ledger that makes replaying one safe.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Durable response ingestion: the processing ledger, idempotency on
 *   form ID + response ID (never sheet row numbers), the form-submit
 *   routers, replay, and scheduled reconciliation.
 *   TWO EVENT SHAPES EXIST AND ARE HANDLED EXPLICITLY
 *   - Spreadsheet-destination forms (eval, reflection, urgent, decision,
 *   combined skills history) fire onHubFormSubmit with e.range/e.values.
 *   Sheets events carry no response ID, so the ledger key is a
 *   deterministic content key: formId (resolved from the destination
 *   sheet) + submission timestamp + a digest of the values. A trigger
 *   retry reproduces the identical key and is skipped.
 *   - Form-bound triggers (level skills forms, handover) fire with
 *   e.response and use the real FormApp response ID.
 *   The double-processing defect is closed here: onHubFormSubmit consults
 *   the form-ownership map and REFUSES to process a submission whose form
 *   is owned by a form-bound handler, recording SKIPPED_OWNED instead of
 *   writing junk REJECTED rows.
 */

var LEDGER_STATES_V20_1 = ['RECEIVED', 'VALIDATED', 'PROCESSED', 'FAILED', 'RETRIED',
                           'RECONCILED', 'SKIPPED_DUPLICATE', 'SKIPPED_OWNED', 'QUARANTINED',
                           'FAILED_AFTER_WRITE'];

/* v20.2 — why FAILED_AFTER_WRITE exists.
 *
 * Both ingestion handlers write durable rows and THEN send mail. When the
 * mail step threw, the catch stamped 'FAILED' over the 'VALIDATED' that
 * recorded the write having happened. Apps Script then retried, the retry
 * read 'FAILED', concluded nothing had been written, and mirrored the same
 * response a second time.
 *
 * The states are not interchangeable: FAILED means nothing durable landed
 * and a replay is safe; FAILED_AFTER_WRITE means the record IS in the sheet
 * and only the notification failed. Both are non-terminal, so both still
 * appear in the exception report — but only one of them may be replayed
 * blind.
 *
 * This is the mail-quota interaction: a consumer MailApp quota running out
 * mid-day is precisely a throw after the write, so quota exhaustion used to
 * duplicate every form response it touched. */
var LEDGER_WROTE_ALREADY_V20_2 = ['VALIDATED', 'FAILED_AFTER_WRITE'];

/* ---------------------------------------------------------------- *
 *  Ledger primitives
 * ---------------------------------------------------------------- */

/** Deterministic key for a Sheets form-submit event. Stable across
 *  trigger retries; independent of row number. */
function ledgerKeyForSheetEventV20_1_(e) {
  var sheet = e.range.getSheet();
  var ts = e.values && e.values[0] ? String(e.values[0]) : '';
  var digest = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      (e.values || []).join(''), Utilities.Charset.UTF_8)).slice(0, 16);
  return 'SHEET-' + sheet.getSheetId() + '-' + ts.replace(/[^0-9]/g, '').slice(0, 14) + '-' + digest;
}

/** Looks a ledger key up. Returns the row number or 0. Read-only. */
function ledgerFindV20_1_(key) {
  var t = readTableV20_1_(TAB.LEDGER, 4);
  if (!t.ok) return 0;
  var ci = t.col['LEDGER KEY'];
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][ci] || '') === key) return t.firstDataRow + i;
  }
  return 0;
}

/** Appends a ledger entry. The ledger is append-plus-state-update only;
 *  entries are never deleted. Returns the row written. */
function ledgerOpenV20_1_(key, formId, responseId, formTitle, kind) {
  var res = appendRowsHeaderMappedV20_1_(TAB.LEDGER, 4, [{
    'LEDGER KEY': key, 'FORM ID': formId || '', 'RESPONSE ID': responseId || '',
    'FORM TITLE': formTitle || '', 'KIND': kind || '', 'RECEIVED AT': new Date(),
    'STATE': 'RECEIVED', 'DETAIL': '', 'EVENTS WRITTEN': '', 'PROCESSED AT': '',
    'WRITER VERSION': SCEMS_WRITER_VERSION
  }], ['LEDGER KEY', 'STATE']);
  return res.firstRow;
}

/** Updates one ledger row's state and detail. */
function ledgerSetV20_1_(row, state, detail, eventsWritten) {
  if (!row) return;
  var t = readTableV20_1_(TAB.LEDGER, 4);
  if (!t.ok) return;
  var sh = t.sheet;
  if (t.col['STATE'] !== undefined) sh.getRange(row, t.col['STATE'] + 1).setValue(state);
  if (detail !== undefined && t.col['DETAIL'] !== undefined) {
    sh.getRange(row, t.col['DETAIL'] + 1).setValue(sanitizeCellV20_1_(String(detail).slice(0, 500)));
  }
  if (eventsWritten !== undefined && t.col['EVENTS WRITTEN'] !== undefined) {
    sh.getRange(row, t.col['EVENTS WRITTEN'] + 1).setValue(sanitizeCellV20_1_(String(eventsWritten)));
  }
  if (t.col['PROCESSED AT'] !== undefined) sh.getRange(row, t.col['PROCESSED AT'] + 1).setValue(new Date());
}

/** True when the ledger has this key in a terminal success state.
 *  Used for duplicate suppression on trigger retries. */
function ledgerAlreadyDoneV20_1_(key) {
  var row = ledgerFindV20_1_(key);
  if (!row) return false;
  var t = readTableV20_1_(TAB.LEDGER, 4);
  var state = String(t.sheet.getRange(row, t.col['STATE'] + 1).getValue() || '');
  return state === 'PROCESSED' || state === 'SKIPPED_DUPLICATE' ||
         state === 'SKIPPED_OWNED' || state === 'RECONCILED';
}

/* ---------------------------------------------------------------- *
 *  Form ownership map : which handler owns which form
 * ---------------------------------------------------------------- */

/** Titles of forms whose submissions are handled by FORM-BOUND triggers.
 *  onHubFormSubmit must never process these, even when their responses
 *  also land in a destination sheet. */
function formTitlesOwnedByFormTriggersV20_1_() {
  return formBoundTriggerPlanV20_2_().map(function (p) { return p.title; });
}

/** The single source of truth for form-bound triggers: which form title is
 *  handled by which handler.
 *
 *  v20.2 fix. This list and the installer had drifted apart.
 *  formTitlesOwnedByFormTriggersV20_1_ named SKILLS_COMBINED, so
 *  onHubFormSubmit refused those submissions and wrote SKIPPED_OWNED to the
 *  ledger saying "Handled by the form-bound trigger" — but
 *  repairAllTriggersNow only ever bound the three per-level skills forms.
 *  Nothing was handling the combined form, so every skill logged through it
 *  was dropped, and the ledger recorded the loss as a successful handoff.
 *
 *  Both the installer and the health check read this array now, so the two
 *  cannot drift again. */
function formBoundTriggerPlanV20_2_() {
  return [
    { title: FORM_TITLES.SKILLS_COMBINED, handler: 'onSkillsGridSubmitV20' },
    { title: FORM_TITLES.SKILLS_EMT,      handler: 'onSkillsGridSubmitV20' },
    { title: FORM_TITLES.SKILLS_AEMT,     handler: 'onSkillsGridSubmitV20' },
    { title: FORM_TITLES.SKILLS_PMD,      handler: 'onSkillsGridSubmitV20' },
    { title: FORM_TITLES.HANDOVER,        handler: 'onHandoverSubmitV19' }
  ];
}

/** Resolves the destination sheet of a Sheets form event to a stored
 *  form. Returns { formId, title } or empty strings when unknown. */
function formForDestinationSheetV20_1_(sheet) {
  var out = { formId: '', title: '' };
  try {
    var url = sheet.getFormUrl && sheet.getFormUrl();
    if (url) {
      var f = FormApp.openByUrl(url);
      out.formId = f.getId();
      out.title = String(f.getTitle() || '').trim();
      return out;
    }
  } catch (e) {}
  return out;
}

function storedFormIdsV20_1_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '[]');
  } catch (e) { return []; }
}

/* ---------------------------------------------------------------- *
 *  Router : spreadsheet-destination forms
 * ---------------------------------------------------------------- */

/** Classifies a Sheets form event by its destination sheet headers.
 *  Explicit, logged; the value-count guessing fallback is retired. */
function classifySheetEventV20_1_(sheet) {
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0]
    .map(function (h) { return String(h || '').trim(); });
  var h2 = headers[1] || '';
  if (headers.indexOf('Skill') >= 0 && headers.indexOf('Attestation') >= 0) return 'skill-combined';
  if (h2 === 'FTO name') return 'eval';
  if (h2 === 'Trainee') return 'reflect';
  if (h2.indexOf('Have you called') === 0) return 'urgent';
  if (h2 === 'Filed by') return 'decision';
  return '';
}

/** PUBLIC HANDLER — name preserved; existing installable trigger keeps
 *  firing. Routes spreadsheet-destination submissions with ledger-backed
 *  idempotency. Mirror and downstream work run inside one lock; the
 *  ledger row is marked PROCESSED only when every required step finished. */
function onHubFormSubmit(e) {
  if (!e || !e.range) throw new Error('onHubFormSubmit requires a spreadsheet form-submit event.');
  var key = ledgerKeyForSheetEventV20_1_(e);
  withScriptLockV20_1_('onHubFormSubmit', 30000, function () {
    if (ledgerAlreadyDoneV20_1_(key)) {
      systemLog_('WARN', 'DUPLICATE FORM EVENT SKIPPED', key);
      return;
    }
    var sheet = e.range.getSheet();
    var kind = classifySheetEventV20_1_(sheet);
    var formInfo = formForDestinationSheetV20_1_(sheet);
    var ledgerRow = 0;
    var haveLedger = !!getSheetOrNullV20_1_(TAB.LEDGER);
    if (haveLedger) {
      ledgerRow = ledgerFindV20_1_(key); // reuse the row a failed attempt left behind
      if (!ledgerRow) ledgerRow = ledgerOpenV20_1_(key, formInfo.formId, '', formInfo.title, kind || 'unknown');
    }

    try {
      var owned = formTitlesOwnedByFormTriggersV20_1_();
      if (formInfo.title && owned.indexOf(formInfo.title) >= 0) {
        if (haveLedger) ledgerSetV20_1_(ledgerRow, 'SKIPPED_OWNED',
          'Handled by the form-bound trigger for "' + formInfo.title + '". No hub processing.');
        systemLog_('INFO', 'FORM EVENT DEFERRED TO FORM TRIGGER', formInfo.title + ' | ' + key);
        return;
      }
      if (kind === 'skill-combined') {
        // Ownership lookup failed but headers say skills: still never
        // reprocess here — the grid handler owns skills ingestion.
        if (haveLedger) ledgerSetV20_1_(ledgerRow, 'SKIPPED_OWNED',
          'Skills submissions are owned by onSkillsGridSubmitV20.');
        systemLog_('INFO', 'FORM EVENT DEFERRED TO FORM TRIGGER', 'skills (header match) | ' + key);
        return;
      }
      if (!kind) {
        if (haveLedger) ledgerSetV20_1_(ledgerRow, 'QUARANTINED',
          'Unrecognized destination sheet "' + sheet.getName() + '". Nothing was mirrored.');
        systemLog_('ERROR', 'FORM EVENT UNCLASSIFIED',
          sheet.getName() + ' | ' + key + ' | headers changed? Review before replay.');
        return;
      }

      var home = getSheetOrNullV20_1_('HOME');
      if (home) home.getRange('H3:J3').setValue('LAST FORM RECEIVED : ' +
        Utilities.formatDate(new Date(), 'America/New_York', 'MM/dd h:mm a'));

      // Stage-aware retry: if a prior attempt already mirrored this
      // response (state VALIDATED), do not mirror again — only re-run the
      // routing/alert step. This is what makes an Apps Script retry safe.
      var alreadyMirrored = false;
      if (haveLedger && ledgerRow) {
        var lt = readTableV20_1_(TAB.LEDGER, 4);
        var st0 = String(lt.sheet.getRange(ledgerRow, lt.col['STATE'] + 1).getValue() || '');
        alreadyMirrored = LEDGER_WROTE_ALREADY_V20_2.indexOf(st0) >= 0;
      }
      var vals = e.values || [];
      var mirroredThisAttempt = false;
      if (kind === 'eval') {
        if (!alreadyMirrored) { mirror(TAB.EVAL, vals); mirroredThisAttempt = true; if (haveLedger) ledgerSetV20_1_(ledgerRow, 'VALIDATED', 'mirrored'); }
        evalAlerts(vals);
      } else if (kind === 'reflect') {
        if (!alreadyMirrored) { mirror(TAB.REFLECT, vals); mirroredThisAttempt = true; if (haveLedger) ledgerSetV20_1_(ledgerRow, 'VALIDATED', 'mirrored'); }
        reflectAlerts(vals);
      } else if (kind === 'urgent') {
        if (!alreadyMirrored) {
          mirror(TAB.URGENT, vals);
          mirroredThisAttempt = true;
          var urgentSheet = requireSheetV20_1_(TAB.URGENT);
          urgentSheet.getRange(urgentSheet.getLastRow(), 14).setValue('Division Chief of Training');
          if (haveLedger) ledgerSetV20_1_(ledgerRow, 'VALIDATED', 'mirrored');
        }
        urgentAlerts(vals);
      } else if (kind === 'decision') {
        if (!alreadyMirrored) { mirror(DECISIONS_TAB, vals); mirroredThisAttempt = true; if (haveLedger) ledgerSetV20_1_(ledgerRow, 'VALIDATED', 'mirrored'); }
        decisionAlerts(vals);
      }

      if (haveLedger) ledgerSetV20_1_(ledgerRow, 'PROCESSED', kind + ' mirrored and routed', '');
      systemLog_('INFO', 'FORM PROCESSED', kind + ' | ' + key);
    } catch (err) {
      // Do NOT erase the record that the mirror already happened; that is what
      // made a retry duplicate the row. See LEDGER_WROTE_ALREADY_V20_2.
      var wrote = alreadyMirrored || mirroredThisAttempt;
      if (haveLedger) {
        ledgerSetV20_1_(ledgerRow, wrote ? 'FAILED_AFTER_WRITE' : 'FAILED',
          (wrote ? '[' + kind + ' IS mirrored; the routing/alert step failed. Do not replay ' +
                   'blind — the row is already on the RAW tab.] ' : '') + String(err));
      }
      systemLog_('ERROR', wrote ? 'FORM ROUTING FAILED AFTER MIRROR' : 'FORM PROCESSING FAILED',
        key + ' | ' + err);
      throw err; // Apps Script retries; the ledger key makes the retry safe.
    }
  });
}

/** Mirrors a raw values row into a RAW tab. Non-transactional dual write
 *  in v19; in v20.1 it is called only inside the routed, ledgered path.
 *  Values are sanitized against formula injection. */
function mirror(tabName, vals) {
  var sh = requireSheetV20_1_(tabName);
  sh.appendRow((vals || []).map(sanitizeCellV20_1_));
}

/* ---------------------------------------------------------------- *
 *  Replay and reconciliation
 * ---------------------------------------------------------------- */

/** Scheduled + on-demand reconciliation. Compares, per linked form:
 *  FormApp's response list vs the ingestion ledger vs the operational
 *  records, and reports missing / duplicate / rejected / partial items.
 *  READ-ONLY: it writes nothing and sends nothing by itself. */
function reconcileIngestionV20_1() {
  var L = ['INGESTION RECONCILIATION — READ ONLY', ''];
  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  var ledgerByResp = {}, ledgerStates = {};
  if (ledger.ok) {
    ledger.rows.forEach(function (r) {
      var rid = String(r[ledger.col['RESPONSE ID']] || '');
      var st = String(r[ledger.col['STATE']] || '');
      if (rid) ledgerByResp[rid] = st;
      ledgerStates[st] = (ledgerStates[st] || 0) + 1;
    });
    L.push('Ledger states: ' + Object.keys(ledgerStates).map(function (k) {
      return k + '=' + ledgerStates[k]; }).join(', '));
  } else {
    L.push('Ledger sheet not present yet (pre-migration). Source counts only.');
  }
  L.push('');

  var ids = storedFormIdsV20_1_();
  var missingTotal = 0;
  ids.forEach(function (id) {
    var f, title = '', n = 0;
    try { f = FormApp.openById(id); title = String(f.getTitle() || ''); n = f.getResponses().length; }
    catch (e) { L.push('  UNREADABLE form ' + id + ' : ' + e); return; }
    var missing = [];
    if (ledger.ok && formTitlesOwnedByFormTriggersV20_1_().indexOf(title) >= 0) {
      f.getResponses().forEach(function (resp) {
        var rid = resp.getId();
        if (!ledgerByResp[rid]) missing.push(rid);
      });
    }
    missingTotal += missing.length;
    L.push('  ' + title + ' : ' + n + ' source response(s)' +
      (missing.length ? ' | ' + missing.length + ' NOT IN LEDGER' : ''));
    missing.slice(0, 5).forEach(function (rid) {
      L.push('      missing downstream: ' + rid + '  → replayResponseV20_1("' + id + '","' + rid + '")');
    });
  });

  // Compare the LIVE eval response tab (fullest eval-headed sheet, husks
  // and the mirror itself excluded) against the mirror. Relink-proof.
  var evalSrc = null, evalSrcRows = 0;
  ss().getSheets().forEach(function (sh) {
    if (sh.getName() === TAB.EVAL) return;
    var kk = '';
    try { kk = classifySheetEventV20_1_(sh); } catch (eC) {}
    if (kk !== 'eval') return;
    var nn = Math.max(sh.getLastRow() - 1, 0);
    if (nn > evalSrcRows) { evalSrc = sh; evalSrcRows = nn; }
  });
  var evalMirror = readTableV20_1_(TAB.EVAL, 4);
  if (evalSrc && evalMirror.ok) {
    var mirN = evalMirror.rows.filter(function (r) { return r[0]; }).length;
    L.push('');
    L.push('  Shift eval: live tab "' + evalSrc.getName() + '" rows ' + evalSrcRows +
      ' vs mirror rows ' + mirN +
      (mirN >= evalSrcRows ? '  (mirror may also hold pre-form legacy evals — that is history, not error)'
                           : '  ← MIRROR BEHIND — run stepH_backfillNewestEvals'));
  }
  L.push('');
  L.push(missingTotal ? missingTotal + ' response(s) need replay.' : 'No missing downstream responses detected.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** Replays one form response through its owning handler. Idempotent:
 *  the ledger key prevents double-writing if it already processed. */
function replayResponseV20_1(formId, responseId) {
  var f = FormApp.openById(formId);
  var title = String(f.getTitle() || '').trim();
  var resp = f.getResponse(responseId);
  if (!resp) throw new Error('Response not found on form "' + title + '": ' + responseId);
  var fake = { response: resp, source: f };
  if (title === FORM_TITLES.HANDOVER) {
    onHandoverSubmitV19(fake);
    return 'Replayed through the handover handler: ' + responseId;
  }
  if (title.indexOf('SCEMS Skills Quick Log') === 0) {
    onSkillsGridSubmitV20(fake);
    return 'Replayed through the skills handler: ' + responseId;
  }
  throw new Error('Replay for "' + title + '" is not form-bound; use the sheet row and reprocess manually.');
}

/** Exception report: every ledger row not in a success state, plus
 *  quarantined and failed items, grouped for the Training Division. */
function ingestionExceptionReportV20_1() {
  var t = readTableV20_1_(TAB.LEDGER, 4);
  if (!t.ok) return 'Ledger not present yet. Run applyMigrationV20_1() first.';
  var groups = {};
  t.rows.forEach(function (r, i) {
    var st = String(r[t.col['STATE']] || '');
    if (st === 'PROCESSED' || st === 'SKIPPED_OWNED' || st === 'SKIPPED_DUPLICATE' || st === 'RECONCILED') return;
    if (!groups[st]) groups[st] = [];
    groups[st].push('row ' + (t.firstDataRow + i) + ' | ' +
      String(r[t.col['FORM TITLE']] || '') + ' | ' + String(r[t.col['DETAIL']] || '').slice(0, 80));
  });
  var L = ['INGESTION EXCEPTIONS', ''];
  if (groups['FAILED_AFTER_WRITE']) {
    L.push('READ THIS FIRST — FAILED_AFTER_WRITE means the record IS in the sheet and only');
    L.push('the notification failed. Do NOT replay these; you would duplicate the row.');
    L.push('Send the missed notification by hand, then mark the row RECONCILED.');
    L.push('');
  }
  var any = false;
  Object.keys(groups).forEach(function (st) {
    any = true;
    L.push(st + ' : ' + groups[st].length);
    groups[st].slice(0, 15).forEach(function (x) { L.push('   ' + x); });
  });
  if (!any) L.push('None. Every received response reached a terminal success state.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}
