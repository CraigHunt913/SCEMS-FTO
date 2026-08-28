/**
 * SCEMS Field Training Tracker — 70_admin_health
 *
 * Health checks and repairs: what is wrong, and the previewed tool that
 * fixes it.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Post-upgrade repair  (v20.2)
 *   Safe builders, the read-only control suite (auditV20_1,
 *   runtimeHealthCheckV20_1, verifyPortalV20_1), retired-function stubs,
 *   portal serving, tab visibility, permissions audit, and backups.
 *   READ-ONLY GUARANTEE: auditV20_1, previewMigrationV20_1 (80_migration),
 *   runtimeHealthCheckV20_1, verifyPortalV20_1, verifySkillsV20_1 (40) and
 *   verifyAnalyticsV20_1 (60) repair nothing, format nothing, hide nothing,
 *   sort nothing, write no sheet logs, send no mail, and change no
 *   Script Properties. They return text.
 *   Full system review — READ ONLY, split for the 6-minute limit.
 */

function hasStrayV19_(s) { return typeof s === 'string' && s.indexOf(STRAY_V19) >= 0; }

/** Re-opens sign-off requests that the old queue sweep cancelled by mistake.
 *
 *  v20.1's sweep cancelled every OPEN queue row whose skill was not on the
 *  matrix. Because a matrix rebuild that produced nothing left the matrix
 *  empty, one bad rebuild stamped "CANCELLED : CRITERIA CHANGED" across the
 *  whole pending queue. v20.2 stops that happening again; this undoes what
 *  already happened.
 *
 *  A row is re-opened only when the matrix NOW says the skill qualifies and
 *  nothing else is already open for the same trainee and skill. Anything
 *  else is left exactly as it is and reported. No row is deleted, and no
 *  decision, rationale or date is touched. */
function repairCancelledQueueRowsV20_2() {
  if (!gateV20_2_('WORK QUEUE')) return;

  var t = queueTableV20_1_();
  if (!t.ok) return 'Queue tab not found.';
  var need = ['TRAINEE', 'SKILL ID', 'SKILL', 'RECORD STATUS'];
  var missing = need.filter(function (h) { return t.col[h] === undefined; });
  if (missing.length) {
    return 'Refusing to touch the queue: missing header(s) ' + missing.join(', ') + '.';
  }

  var QUALIFY = ['READY FOR VALIDATION', 'SIGNED OFF - REVIEW REQUIRED',
                 'LEGACY SIGN-OFF REVIEW REQUIRED'];

  // Anything already open owns its (trainee, skill) — never create a second ask.
  var openKeys = {};
  t.rows.forEach(function (r) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    openKeys[normalizeNameV20_1_(cleanNameV20_1_(r[t.col['TRAINEE']])) + '||' +
             String(r[t.col['SKILL ID']] || '').trim()] = true;
  });

  var reopened = [], leftAlone = [], scanned = 0;
  t.rows.forEach(function (r, i) {
    var status = String(r[t.col['RECORD STATUS']] || '').trim();
    if (status.indexOf('CANCELLED : CRITERIA CHANGED') !== 0) return;
    scanned++;
    var row = t.firstDataRow + i;
    var trainee = cleanNameV20_1_(r[t.col['TRAINEE']]);
    var skillId = String(r[t.col['SKILL ID']] || '').trim();
    var skill = String(r[t.col['SKILL']] || '').trim();
    var key = normalizeNameV20_1_(trainee) + '||' + skillId;

    if (openKeys[key]) {
      leftAlone.push(trainee + ' / ' + skill + ' (row ' + row + ') — already open elsewhere');
      return;
    }
    var readiness = skillReadinessNowV20_2_(trainee, skillId);
    if (QUALIFY.indexOf(readiness) < 0) {
      leftAlone.push(trainee + ' / ' + skill + ' (row ' + row + ') — matrix reads "' +
        (readiness || 'not on the matrix') + '"');
      return;
    }
    t.sheet.getRange(row, t.col['RECORD STATUS'] + 1).setValue('OPEN');
    openKeys[key] = true;
    reopened.push(trainee + ' / ' + skill + ' (row ' + row + ')');
    systemLog_('WARN', 'QUEUE ROW RE-OPENED',
      'row ' + row + ' | ' + trainee + ' / ' + skillId +
      ' | was CANCELLED : CRITERIA CHANGED, matrix now reads ' + readiness);
  });

  var msg = 'CANCELLED QUEUE REPAIR\n\n' +
    'Cancelled rows examined : ' + scanned + '\n' +
    'Re-opened               : ' + reopened.length + '\n' +
    'Left as they were       : ' + leftAlone.length + '\n' +
    (reopened.length ? '\nBack in your queue:\n  ' + reopened.slice(0, 25).join('\n  ') +
      (reopened.length > 25 ? '\n  …and ' + (reopened.length - 25) + ' more' : '') : '') +
    (leftAlone.length ? '\n\nLeft alone (the matrix does not support re-opening these):\n  ' +
      leftAlone.slice(0, 15).join('\n  ') +
      (leftAlone.length > 15 ? '\n  …and ' + (leftAlone.length - 15) + ' more' : '') : '') +
    '\n\nNothing was deleted. No decision, rationale or date was changed.';
  systemLog_('WARN', 'CANCELLED QUEUE REPAIR',
    scanned + ' examined, ' + reopened.length + ' re-opened');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  SAFE builders — header mismatch REPORTS, never clears
 * ---------------------------------------------------------------- */

/** Shared safe-builder core: ensures the sheet exists and has capacity,
 *  verifies the anchor header, and REFUSES (loudly) on mismatch. */
function safeEnsureSystemSheetV20_1_(name, rows, cols, anchorHeader, headers) {
  var S = ss();
  var sh = S.getSheetByName(name);
  var created = false;
  if (!sh) { sh = S.insertSheet(name); created = true; }
  ensureSheetCapacityV19_(sh, rows, cols);
  var a4 = String(sh.getRange('A4').getValue() || '').trim();
  if (!created && a4 && a4 !== anchorHeader) {
    systemLog_('BLOCKER', 'HEADER MISMATCH — SHEET NOT TOUCHED',
      name + ' A4 reads "' + a4 + '", expected "' + anchorHeader +
      '". v20.1 never clears on mismatch. Repair the header row or run previewMigrationV20_1().');
    return { sheet: sh, ok: false, created: created };
  }
  if (created || !a4) sh.getRange(4, 1, 1, headers.length).setValues([headers]);
  return { sheet: sh, ok: true, created: created };
}

function buildSkillEvidenceLogV19_() {
  var r = safeEnsureSystemSheetV20_1_(TAB.SKILL_EVIDENCE, 5000, 25, 'EVENT ID',
    SKILL_EVIDENCE_HEADERS_V19);
  if (r.ok && r.created) {
    styleSkillDataSheetV19_(r.sheet, 'SKILL EVIDENCE LOG',
      'Append-only normalized record. One row equals one submitted skill event. Do not edit.', 20, '#1f5673');
  }
  return r.sheet;
}

function buildSkillSignoffLogV19_() {
  var r = safeEnsureSystemSheetV20_1_(TAB.SKILL_SIGNOFF, 5000, 16, 'DECISION ID',
    SKILL_SIGNOFF_HEADERS_V19);
  if (r.ok && r.created) {
    styleSkillDataSheetV19_(r.sheet, 'SKILL SIGN-OFF LOG',
      'Append-only leadership decisions. Matrix status derives from the latest recorded decision.', 12, '#5b8266');
  }
  return r.sheet;
}

function buildSkillValidationQueueV19_() {
  var r = safeEnsureSystemSheetV20_1_(TAB.SKILL_VALIDATION, 2000, 16, 'READY DATE',
    SKILL_QUEUE_HEADERS_V19);
  if (r.ok) armQueueValidationV20_(r.sheet);
  return r.sheet;
}

/** Safe install: ensures the three system sheets and layouts exist.
 *  Contains no purge step and no destructive path. */
function installSkillsV19() {
  return withScriptLockV20_1_('installSkillsV19', 30000, function () {
    buildSkillEvidenceLogV19_();
    buildSkillSignoffLogV19_();
    buildSkillValidationQueueV19_();
    try { applySkillsLayoutV19_(); } catch (e) {
      systemLog_('WARN', 'SKILLS LAYOUT SKIPPED', String(e));
    }
    systemLog_('INFO', 'SKILLS SYSTEM VERIFIED', 'v20.1 safe install: sheets ensured, nothing cleared.');
    return 'Skills sheets verified/ensured. Nothing was cleared.';
  });
}

/* ---------------------------------------------------------------- *
 *  Retired functions — names preserved, destructive bodies removed
 * ---------------------------------------------------------------- */

function fixAndFinishSkillsV19() {
  var m = 'RETIRED in v20.1. The v19.0.7 repair is superseded. Use installSkillsV19() ' +
          '(safe), previewMigrationV20_1(), and applyMigrationV20_1().';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'fixAndFinishSkillsV19');
  Logger.log(m); return m;
}

function purgeLegacySkillValidationsV19() {
  var m = 'RETIRED in v20.1. Dropdown rules are re-armed non-destructively by ' +
          'applySkillsLayoutV19_() and armQueueValidationV20_(); nothing needs purging.';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'purgeLegacySkillValidationsV19');
  Logger.log(m); return m;
}

function purgeExamples() {
  var m = 'RETIRED in v20.1. Remove example rows by hand if any remain.';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'purgeExamples');
  Logger.log(m); return m;
}

/** ZZ TEST cleanup: preview first; delete only rows whose trainee/name
 *  field begins with the ZZ TEST prefix. Never touches other rows. */
function purgeTestRows(confirmToken) {
  var denyV20_2 = denyV20_2_('DELETE TEST ROWS');
  if (denyV20_2) return denyV20_2;
  var targets = [
    { tab: TAB.EVAL, col: 3 }, { tab: TAB.REFLECT, col: 2 },
    { tab: TAB.URGENT, col: 5 }, { tab: TAB.DECISIONS, col: 4 },
    { tab: TAB.SKILL_EVIDENCE, col: 4 }
  ];
  var found = [];
  targets.forEach(function (t) {
    var sh = getSheetOrNullV20_1_(t.tab);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < 5) return;
    var vals = sh.getRange(5, t.col, last - 4, 1).getValues();
    vals.forEach(function (v, i) {
      if (String(v[0] || '').indexOf(TEST_PREFIX) === 0) found.push({ tab: t.tab, row: 5 + i });
    });
  });
  if (confirmToken !== 'DELETE ZZ TEST') {
    var pv = 'ZZ TEST rows found: ' + found.length + '\n' + found.map(function (f) {
      return '  ' + f.tab + ' row ' + f.row; }).join('\n') +
      '\n\nNothing deleted. Run purgeTestRows("DELETE ZZ TEST") to remove exactly these rows.';
    Logger.log(pv); return pv;
  }
  var byTab = {};
  found.forEach(function (f) { (byTab[f.tab] = byTab[f.tab] || []).push(f.row); });
  Object.keys(byTab).forEach(function (tab) {
    var sh = requireSheetV20_1_(tab);
    byTab[tab].sort(function (a, b) { return b - a; }).forEach(function (row) {
      sh.deleteRow(row);
    });
  });
  systemLog_('WARN', 'ZZ TEST ROWS REMOVED', found.length + ' row(s)');
  return 'Removed ' + found.length + ' ZZ TEST row(s).';
}

function scemsFixSelfTest() {
  var m = 'SCEMS ' + SCEMS_VERSION + ': single-definition project; the v19 fix block is retired.';
  Logger.log(m); return m;
}

function seedTraineeSkills() { try { rebuildSkillMatrixV19_(); } catch (e) {} }

function organizeSkills() { try { rebuildSkillMatrixV19_(); } catch (e) {} }

function skillsKey() { try { applySkillsLayoutV19_(); } catch (e) {} }

function parseSkills(v) {
  systemLog_('WARN', 'LEGACY FREE-TEXT SKILL FIELD IGNORED',
    'Use the structured Skills Quick Log. No competency state was changed.');
}

/* ---------------------------------------------------------------- *
 *  Portal serving : live links injected at serve time
 * ---------------------------------------------------------------- */

/** Serves the portal with the badge injected (ported portalHtmlV19_) and
 *  every card's href replaced by the CURRENT published URL of its stored
 *  form. A missing form leaves the file's static link in place, so the
 *  portal degrades gracefully instead of 404ing. */
function doGet() {
  var built = portalHtmlV19_();
  var html = built.html || '';
  PORTAL_CARDS.forEach(function (card) {
    var f = getStoredFormV19_(FORM_TITLES[card.key]);
    if (!f) return;
    var url = '';
    try { url = f.getPublishedUrl(); } catch (e) {}
    if (!url) return;
    var marker = new RegExp('href="[^"]*"([^>]*data-scems-form="' + card.key + '")');
    if (marker.test(html)) {
      html = html.replace(marker, 'href="' + url + '"$1');
    }
  });
  return HtmlService.createHtmlOutput(html)
    .setTitle('SCEMS Field Training Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** READ-ONLY: validates every portal card, link, accepting state,
 *  identity requirement, and handler wiring. */
function verifyPortalV20_1() {
  var L = ['PORTAL VERIFICATION — READ ONLY', ''];
  var problems = 0;
  var built = portalHtmlV19_();
  L.push('portal file: ' + (built.ok ? 'found, badge ' + built.how : 'PROBLEM: ' + built.how));
  if (!built.ok) problems++;
  var html = built.html || '';
  var cardCount = (html.match(/data-scems-form="/g) || []).length;
  L.push('cards tagged for live-link injection: ' + cardCount + ' of ' + PORTAL_CARDS.length +
    (cardCount === PORTAL_CARDS.length ? '' : '   ← portal file out of date'));
  if (cardCount !== PORTAL_CARDS.length) problems++;
  L.push('');
  var triggers = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    try { triggers[t.getTriggerSourceId()] = t.getHandlerFunction(); } catch (e) {}
  });
  PORTAL_CARDS.forEach(function (card) {
    var title = FORM_TITLES[card.key];
    var f = getStoredFormV19_(title);
    L.push(title);
    if (!f) { L.push('   NOT FOUND in FORM_IDS'); problems++; L.push(''); return; }
    var accepting = '';
    try { accepting = String(f.isAcceptingResponses()); } catch (e) {}
    L.push('   accepting responses : ' + accepting);
    if (accepting !== 'true') problems++;
    var url = '';
    try { url = f.getPublishedUrl(); } catch (e) {}
    L.push('   published URL       : ' + (url ? 'OK' : 'MISSING'));
    if (!url) problems++;
    var collects = '';
    try { collects = String(f.collectsEmail()); } catch (e) { collects = '(unreadable)'; }
    var needsIdentity = card.key === 'HANDOVER' || card.key.indexOf('SKILLS_') === 0;
    L.push('   collects email      : ' + collects +
      (needsIdentity && collects !== 'true' ? '   ← REQUIRED for this form' : ''));
    if (needsIdentity && collects !== 'true') problems++;
    var handler = triggers[f.getId()] || '';
    var expected = card.key === 'HANDOVER' ? 'onHandoverSubmitV19'
                 : card.key.indexOf('SKILLS_') === 0 ? 'onSkillsGridSubmitV20' : '(spreadsheet trigger)';
    L.push('   submit handler      : ' + (handler || 'destination-sheet route') +
      (expected !== '(spreadsheet trigger)' && handler !== expected ? '   ← expected ' + expected : ''));
    if (expected !== '(spreadsheet trigger)' && handler !== expected) problems++;
    L.push('');
  });
  L.push(problems ? problems + ' problem(s).' : 'Portal estate verified clean.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Tab visibility and permissions
 * ---------------------------------------------------------------- */

/** Applies the operational tab set: raw/response/system tabs hidden,
 *  leadership surfaces visible. Hiding is usability, not security —
 *  security is the editor list, reported by permissionsAuditV20_1(). */
function applyOperationalTabsV20_1() {
  var S = ss();
  var visible = ['HOME', TAB.MASTER, TAB.SKILL_VALIDATION, TAB.TRAINEE_SKILLS,
                 TAB.CATALOG, TAB.QUEUE, TAB.AUDIT];
  var shown = 0, hidden = 0;
  S.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (visible.indexOf(name) >= 0) { sh.showSheet(); shown++; }
    else { try { sh.hideSheet(); hidden++; } catch (e) { /* last visible etc. */ } }
  });
  systemLog_('INFO', 'OPERATIONAL TAB SET', shown + ' visible, ' + hidden + ' hidden');
  return shown + ' visible, ' + hidden + ' hidden. Remember: hiding is not security.';
}

/** READ-ONLY: spreadsheet sharing, protections, and form access audit. */
function permissionsAuditV20_1() {
  var L = ['PERMISSIONS AUDIT — READ ONLY', ''];
  try {
    var file = DriveApp.getFileById(ss().getId());
    var editors = file.getEditors().map(function (u) { return u.getEmail(); });
    var viewers = file.getViewers().map(function (u) { return u.getEmail(); });
    L.push('Spreadsheet editors (' + editors.length + '): every editor sees EVERY tab, hidden or not.');
    editors.forEach(function (e) { L.push('   editor: ' + e); });
    viewers.forEach(function (e) { L.push('   viewer: ' + e); });
    var access = '';
    try { access = String(file.getSharingAccess()); } catch (e) {}
    L.push('Link sharing: ' + (access || '(unreadable)'));
  } catch (err) { L.push('Drive audit unavailable: ' + err); }
  L.push('');
  var protections = [];
  ss().getSheets().forEach(function (sh) {
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      protections.push(sh.getName() + ' [sheet] editors: ' +
        p.getEditors().map(function (u) { return u.getEmail(); }).join(', '));
    });
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
      protections.push(sh.getName() + ' [' + p.getRange().getA1Notation() + '] editors: ' +
        p.getEditors().map(function (u) { return u.getEmail(); }).join(', '));
    });
  });
  L.push('Protections: ' + (protections.length ? '' : 'NONE — every editor can edit every cell.'));
  protections.forEach(function (p) { L.push('   ' + p); });
  L.push('');
  L.push('Forms:');
  storedFormIdsV20_1_().forEach(function (id) {
    try {
      var f = FormApp.openById(id);
      L.push('   ' + f.getTitle() + ' | accepting ' + f.isAcceptingResponses() +
             ' | collects email ' + f.collectsEmail());
    } catch (e) { L.push('   ' + id + ' unreadable: ' + e); }
  });
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  The audit and the runtime health check (READ-ONLY)
 * ---------------------------------------------------------------- */

/** Complete system audit. Makes no changes of any kind. */
function auditV20_1() {
  var L = ['SCEMS SYSTEM AUDIT ' + SCEMS_VERSION + ' — READ ONLY', ''];
  L.push('— MODE —');
  var flag = '(unreadable)';
  try { flag = PropertiesService.getScriptProperties().getProperty(LIVE_FLAG_KEY) || '(never set)'; } catch (e) {}
  L.push('stored flag ' + flag + ' | effective ' + (isLiveMode_() ? 'LIVE' : 'TEST'));
  L.push('');
  L.push('— HEADERS (mismatch = report, never clear) —');
  [[TAB.SKILL_EVIDENCE, 'EVENT ID'], [TAB.SKILL_SIGNOFF, 'DECISION ID'],
   [TAB.SKILL_VALIDATION, 'READY DATE'], [TAB.MASTER, 'Trainee'],
   [TAB.FTO_ROSTER, 'FTO NAME'], [TAB.CATALOG, 'SKILL ID']].forEach(function (pair) {
    var sh = getSheetOrNullV20_1_(pair[0]);
    var a4 = sh ? String(sh.getRange('A4').getValue() || '').trim() : '(missing sheet)';
    L.push('  ' + pair[0] + ' A4="' + a4 + '"' + (a4 === pair[1] ? '' : '   ← expected "' + pair[1] + '"'));
  });
  L.push('');
  L.push('— IDENTITY —');
  var iss = identityIssuesV20_1_();
  L.push('  duplicate employee IDs : ' + iss.duplicateEmployeeIds.length);
  iss.duplicateEmployeeIds.forEach(function (x) { L.push('     ' + x); });
  L.push('  near-duplicate names   : ' + iss.nearDuplicates.length);
  iss.nearDuplicates.forEach(function (x) { L.push('     ' + x); });
  L.push('  whitespace names       : ' + iss.whitespaceNames.length);
  L.push('  archive conflicts      : ' + iss.archiveConflicts.length);
  iss.archiveConflicts.forEach(function (x) { L.push('     ' + x); });
  L.push('  decider variants       : ' + iss.deciderVariants.length);
  L.push('  closed w/ open work    : ' + iss.closedWithOpenWork.length);
  iss.closedWithOpenWork.forEach(function (x) { L.push('     ' + x); });
  L.push('');
  L.push('— QUEUES AND DECISIONS —');
  L.push(reconcileDecisionsReadOnlyV20_1_());
  L.push('');
  L.push('— INGESTION —');
  L.push(reconcileIngestionV20_1());
  L.push('');
  L.push('— TRIGGERS —');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var src = '';
    try { src = t.getTriggerSourceId() || ''; } catch (e) {}
    L.push('  ' + t.getHandlerFunction() + ' [' + t.getEventType() + ']' + (src ? ' src ' + src.slice(0, 12) + '…' : ''));
  });
  L.push('');
  L.push('— ANALYTICS —');
  L.push(verifyAnalyticsV20_1());
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** Silent read-only variant of the decision reconciliation (no UI). */
function reconcileDecisionsReadOnlyV20_1_() {
  var t = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (!t.ok) return '  queue missing';
  var open = 0, stranded = 0, recorded = 0;
  t.rows.forEach(function (r) {
    if (!String(r[t.col['TRAINEE']] || '').trim()) return;
    var st = String(r[t.col['RECORD STATUS']] || '').trim();
    if (st === 'OPEN') { open++; if (String(r[t.col['DECISION']] || '').trim()) stranded++; }
    else if (st === 'RECORDED' || st === 'RETURNED' || st === 'REVOKED') recorded++;
  });
  return '  skill queue: ' + open + ' open (' + stranded + ' stranded), ' + recorded + ' decided';
}

/** Runtime health check: mode, forms, triggers, identity, access,
 *  source/mirror reconciliation, formula hygiene, queues, backup health.
 *  READ-ONLY. */
function runtimeHealthCheckV20_1() {
  var L = ['RUNTIME HEALTH CHECK ' + SCEMS_VERSION + ' — READ ONLY', ''];
  L.push('mode: ' + (isLiveMode_() ? 'LIVE' : 'TEST'));
  var expectedHandlers = MANAGED_TRIGGER_HANDLERS.slice();
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  expectedHandlers.forEach(function (h) {
    L.push('trigger ' + h + ': ' + (have.indexOf(h) >= 0 ? 'ok' : 'MISSING'));
  });
  var formBound = have.filter(function (h) {
    return h === 'onSkillsGridSubmitV20' || h === 'onHandoverSubmitV19'; }).length;
  L.push('form-bound skills/handover triggers: ' + formBound + ' (expect 4: 3 level forms + handover)');
  L.push('');
  L.push(checkAllFormsV19());
  L.push('');
  var reg = loadRegistryV20_1_();
  L.push('person registry: ' + (reg.ok ? reg.rows.length + ' people' : 'NOT PRESENT (pre-migration)'));
  var led = getSheetOrNullV20_1_(TAB.LEDGER);
  L.push('ingestion ledger: ' + (led ? 'present' : 'NOT PRESENT (pre-migration)'));
  L.push('');
  var an = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (an) {
    var masked = 0;
    an.getDataRange().getFormulas().forEach(function (row) {
      row.forEach(function (f) {
        if (f && f.indexOf('IFERROR') >= 0) masked++;
      });
    });
    L.push('IFERROR-masked analytics formulas remaining: ' + masked +
      (masked ? '   ← applyMigrationV20_1() replaces these with recomputed values' : ''));
  }
  L.push(reconcileDecisionsReadOnlyV20_1_());
  L.push('');
  var props = PropertiesService.getScriptProperties();
  var lastBackup = props.getProperty('LAST_FULL_BACKUP') || '(never)';
  L.push('last full backup package: ' + lastBackup);
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Backup : full recovery package (workbook + estate manifest)
 * ---------------------------------------------------------------- */

/** Creates the recovery package: a dated copy of the workbook plus a
 *  manifest document (script properties, trigger inventory, form
 *  schemas/IDs/URLs/destinations/access, deployment URL, config version).
 *  The Apps Script SOURCE cannot copy itself from here; the manifest
 *  states this and the runbook's export step covers it. A workbook-only
 *  export is never called a full backup anywhere in v20.1.
 *
 *  v20.6: DriveApp.makeCopy clones every linked form as "Copy of …". Three
 *  earlier backups left ~25 clones in Drive. After the copy, every clone
 *  linked to the backup is closed, unlinked, and moved into the form-copy
 *  archive. Live forms are never touched. */
function fullBackupV20_1() {
  var denyV20_2 = denyV20_2_('RUN BACKUP');
  if (denyV20_2) return denyV20_2;
  var stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmm');
  var folderName = 'SCEMS Tracker Backups';
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  var wb = DriveApp.getFileById(ss().getId()).makeCopy('SCEMS_Backup_' + stamp, folder);

  var cloneReport = { moved: [], failed: [] };
  try {
    cloneReport = neutralizeBackupFormClonesV20_6_(wb.getId(), stamp) || cloneReport;
  } catch (eClone) {
    cloneReport.failed = ['neutralize failed: ' + (eClone && eClone.message ? eClone.message : eClone)];
    systemLog_('ERROR', 'BACKUP FORM CLONE CLEANUP FAILED', String(eClone));
  }

  var props = PropertiesService.getScriptProperties().getProperties();
  var triggers = ScriptApp.getProjectTriggers().map(function (t) {
    var src = ''; try { src = t.getTriggerSourceId() || ''; } catch (e) {}
    return { handler: t.getHandlerFunction(), type: String(t.getEventType()), source: src };
  });
  var forms = storedFormIdsV20_1_().map(function (id) {
    try {
      var f = FormApp.openById(id);
      var dest = ''; try { dest = f.getDestinationId(); } catch (e) {}
      return {
        id: id, title: f.getTitle(), publishedUrl: f.getPublishedUrl(),
        editUrl: f.getEditUrl(), accepting: f.isAcceptingResponses(),
        collectsEmail: (function () { try { return f.collectsEmail(); } catch (e) { return null; } })(),
        destination: dest, responses: f.getResponses().length,
        items: f.getItems().map(function (i) { return { title: i.getTitle(), type: String(i.getType()) }; })
      };
    } catch (e2) { return { id: id, error: String(e2) }; }
  });
  var webAppUrl = '';
  try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  var manifest = {
    createdAt: new Date().toISOString(),
    sourceVersion: SCEMS_VERSION,
    spreadsheetId: ss().getId(),
    workbookCopyId: wb.getId(),
    formClonesArchived: cloneReport.moved || [],
    formCloneFailures: cloneReport.failed || [],
    scriptProperties: props,
    triggers: triggers,
    forms: forms,
    webAppUrl: webAppUrl,
    note: 'This package restores DATA, PROPERTIES, TRIGGER INVENTORY, FORM SCHEMAS, and ' +
          'DEPLOYMENT INFO. The Apps Script SOURCE must be exported from the editor per the ' +
          'recovery runbook — a workbook copy alone is NOT a full system backup. Form clones ' +
          'created by makeCopy were archived so the live form estate stays at nine forms.'
  };
  folder.createFile('SCEMS_Manifest_' + stamp + '.json', JSON.stringify(manifest, null, 2),
    'application/json');
  PropertiesService.getScriptProperties().setProperty('LAST_FULL_BACKUP', stamp);
  systemLog_('INFO', 'FULL BACKUP PACKAGE',
    'workbook copy + manifest ' + stamp + '; form clones archived: ' +
    ((cloneReport.moved && cloneReport.moved.length) || 0));
  sendMail(CONFIG.SUPERVISOR_EMAILS, 'SCEMS full backup package created : ' + stamp,
    'Workbook copy and estate manifest were written to the Drive folder "' + folderName + '".\n' +
    'Form clones created by the copy: ' + ((cloneReport.moved && cloneReport.moved.length) || 0) +
    ' archived (live forms untouched).\n' +
    'Remember: script source is exported from the editor per the recovery runbook.\n' +
    'Quarterly restore test due? Check the runbook schedule.');
  return 'Backup package ' + stamp + ' created in "' + folderName + '". ' +
    ((cloneReport.moved && cloneReport.moved.length) || 0) + ' form clone(s) archived.';
}

function reviewSectionV20_1_(R, title, fn) {
  R.push('');
  R.push('================ ' + title + ' ================');
  try { R.push(String(fn())); }
  catch (e) { R.push('SECTION FAILED: ' + e); }
}

/** Fast half: everything answerable from the sheets alone. ~1 minute. */
function reviewCoreV20_1() {
  var R = [];
  reviewSectionV20_1_(R, 'VERSION', function () { return versionReportV20_1(); });
  reviewSectionV20_1_(R, 'MASTER NAME HYGIENE (spaces shown in brackets)', function () {
    var t = readTableV20_1_(TAB.MASTER, 4);
    if (!t.ok) return 'Master not readable.';
    var L = [];
    var raw = t.sheet.getRange(t.firstDataRow, 1, Math.max(t.sheet.getLastRow() - t.firstDataRow + 1, 1), 1).getValues();
    raw.forEach(function (r, i) {
      var v = r[0];
      if (v === '' || v == null) return;
      var s = String(v);
      var flags = [];
      if (/^\s/.test(s)) flags.push('LEADING SPACE');
      if (/\s$/.test(s)) flags.push('TRAILING SPACE');
      if (/\s\s/.test(s)) flags.push('DOUBLE SPACE INSIDE');
      L.push('row ' + (t.firstDataRow + i) + ' [' + s + ']' + (flags.length ? '  <-- ' + flags.join(', ') : ''));
    });
    return L.join('\n') || '(no names found)';
  });
  reviewSectionV20_1_(R, 'EVAL COUNT CROSS-CHECK (raw rows vs engine)', function () {
    var m = getSheetOrNullV20_1_(TAB.EVAL);
    var eng = getSheetOrNullV20_1_(TAB.ENGINE);
    if (!m || !eng) return 'Mirror or engine missing.';
    var counts = {};
    if (m.getLastRow() >= 5) {
      m.getRange(5, 3, m.getLastRow() - 4, 1).getValues().forEach(function (r) {
        var n = normalizeNameV20_1_(String(r[0] || ''));
        if (n) counts[n] = (counts[n] || 0) + 1;
      });
    }
    var L = [];
    eng.getRange(5, 1, 40, 9).getValues().forEach(function (r, i) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      var engineSays = Number(r[6]) || 0;
      var rawSays = counts[normalizeNameV20_1_(name)] || 0;
      L.push('engine row ' + (5 + i) + ' ' + name + ' : raw eval rows ' + rawSays +
        ' | engine says ' + engineSays + (rawSays === engineSays ? '' : '   <-- MISMATCH'));
    });
    return L.join('\n') || '(engine empty)';
  });
  reviewSectionV20_1_(R, 'ORPHANED EVALS (trainee matches nobody)', function () {
    var m = getSheetOrNullV20_1_(TAB.EVAL);
    if (!m || m.getLastRow() < 5) return 'Mirror empty.';
    var known = {};
    masterTraineeRowsV20_1_().forEach(function (x) { known[x.norm] = true; });
    var arch = getSheetOrNullV20_1_(TAB.ARCHIVE);
    if (arch && arch.getLastRow() >= 5) {
      arch.getRange(5, 2, arch.getLastRow() - 4, 1).getValues().forEach(function (r) {
        var n = normalizeNameV20_1_(String(r[0] || ''));
        if (n) known[n] = true;
      });
    }
    var L = [], seen = {};
    m.getRange(5, 1, m.getLastRow() - 4, 3).getValues().forEach(function (r, i) {
      var who = String(r[2] || '').trim();
      if (!who) return;
      var n = normalizeNameV20_1_(who);
      if (known[n] || seen[n]) return;
      if (who.indexOf('EXAMPLE') === 0 || who.indexOf(TEST_PREFIX) === 0) return;
      seen[n] = true;
      L.push('[' + who + '] (first at mirror row ' + (5 + i) + ')');
    });
    return L.length ? L.join('\n') : 'None. Every eval belongs to a known trainee.';
  });
  reviewSectionV20_1_(R, 'DECISIONS RECONCILIATION', function () { return reconcileDecisionsV20(); });
  reviewSectionV20_1_(R, 'INGESTION EXCEPTIONS', function () { return ingestionExceptionReportV20_1(); });
  reviewSectionV20_1_(R, 'ANALYTICS VERIFICATION', function () { return verifyAnalyticsV20_1(); });
  var msg = 'SYSTEM REVIEW — CORE (fast half) — READ ONLY\n' + R.join('\n') +
    '\n\nNow run reviewDeepV20_1 for forms, portal, permissions, and the full audit.';
  Logger.log(msg);
  return msg;
}

/** Slow half: everything that talks to Forms, Drive, and the portal. */
function reviewDeepV20_1() {
  var R = [];
  reviewSectionV20_1_(R, 'RUNTIME HEALTH', function () { return runtimeHealthCheckV20_1(); });
  reviewSectionV20_1_(R, 'FORM DELIVERY ADDRESSES', function () {
    var liveId = ss().getId();
    var L = [];
    storedFormIdsV20_1_().forEach(function (id) {
      try {
        var f = FormApp.openById(id);
        var dest = '';
        try { dest = f.getDestinationId(); } catch (e2) {}
        L.push((dest === liveId ? 'OK    ' : dest ? 'WRONG ' : 'NONE  ') +
          f.getTitle() + ' | ' + f.getResponses().length + ' response(s)' +
          (dest && dest !== liveId ? ' | delivering to ' + dest : ''));
      } catch (e) { L.push('UNREADABLE ' + id + ' : ' + e); }
    });
    return L.join('\n');
  });
  reviewSectionV20_1_(R, 'INGESTION RECONCILIATION', function () { return reconcileIngestionV20_1(); });
  reviewSectionV20_1_(R, 'SKILLS VERIFICATION', function () { return verifySkillsV20_1(); });
  reviewSectionV20_1_(R, 'PORTAL VERIFICATION', function () { return verifyPortalV20_1(); });
  reviewSectionV20_1_(R, 'PERMISSIONS AUDIT', function () { return permissionsAuditV20_1(); });
  reviewSectionV20_1_(R, 'SYSTEM AUDIT', function () { return auditV20_1(); });
  var msg = 'SYSTEM REVIEW — DEEP (forms half) — READ ONLY\n' + R.join('\n');
  Logger.log(msg);
  return msg;
}

/** Kept so the old habit still works; points at the split. */
function fullSystemReviewV20_1() {
  var msg = 'The review is split to fit the 6-minute limit:\n' +
    '  1. reviewCoreV20_1  (fast, sheets-only)\n' +
    '  2. reviewDeepV20_1  (forms / portal / permissions / audit)\nRun them one after the other.';
  Logger.log(msg);
  return msg;
}

/** Every tab this code names, against every tab that is actually there.
 *
 *  READ ONLY. It changes nothing and it is safe to run at any time.
 *
 *  Why it exists: getSheetByName is exact. There is no near-match, no
 *  trimming, no case folding. A constant reading '03 SELF-REFLECTION RAW'
 *  against a tab actually called '03 TRAINEE SELF-REFLECTION RAW' does not
 *  raise anything - it returns null, and whatever asked for it either does
 *  nothing or reports "not present yet", which reads like a state rather than
 *  a fault. Four of this system's constants differ from the titles printed on
 *  the sheets themselves, and there was no way to tell from the outside
 *  whether the sheets or the titles were the odd one out.
 *
 *  So: ask the spreadsheet. Anything named here that is not there is listed
 *  with its closest actual match, because the answer is almost always a word
 *  that was added to a tab later and never carried back into the code. */
function tabNameCheck() {
  var have = ss().getSheets().map(function (sh) { return sh.getName(); });
  var want = [];
  Object.keys(TAB).forEach(function (k) { want.push({ where: 'TAB.' + k, name: TAB[k] }); });
  // Everything else that names a tab. TAB used to have five shadows -
  // DECISIONS_TAB, ARCHIVE_TAB, SKILL_CATALOG_TAB, FTO_ROSTER_TAB_V19 and
  // TRAINEE_SKILLS_TAB_V19 - each a second name for a sheet TAB already
  // named. They are gone; these are the ones that remain.
  [['TAB_CONSOLE_V20_3', typeof TAB_CONSOLE_V20_3 === 'string' ? TAB_CONSOLE_V20_3 : ''],
   ['HOME (built by modernHome)', 'HOME']
  ].forEach(function (p2) { if (p2[1]) want.push({ where: p2[0], name: p2[1] }); });

  // one entry per distinct name; several constants point at the same tab
  var byName = {};
  want.forEach(function (w) {
    (byName[w.name] = byName[w.name] || []).push(w.where);
  });

  var missing = [], present = 0;
  Object.keys(byName).sort().forEach(function (name) {
    if (have.indexOf(name) >= 0) { present++; return; }
    missing.push({ name: name, by: byName[name], near: nearestTabV20_6_(name, have) });
  });

  var used = {};
  Object.keys(byName).forEach(function (n) { used[n] = true; });
  var unclaimed = have.filter(function (n) { return !used[n]; });

  var L = ['TAB NAME CHECK — READ ONLY, nothing was changed', '',
    'Sheets in this spreadsheet : ' + have.length,
    'Names this code asks for   : ' + Object.keys(byName).length,
    'Found                      : ' + present,
    'NOT FOUND                  : ' + missing.length, ''];

  if (!missing.length) {
    L.push('Every tab this code names is there under exactly that name.');
  } else {
    L.push('These are asked for by name and are not there. getSheetByName');
    L.push('returns null for each, and the code that asked either does nothing');
    L.push('or says "not present yet", which reads like a state and is a fault.');
    L.push('');
    missing.forEach(function (m) {
      L.push('  "' + m.name + '"');
      L.push('     named by : ' + m.by.join(', '));
      L.push('     closest  : ' + (m.near || '(nothing close)'));
    });
    L.push('');
    L.push('If the sheet is the one that is right, the constant needs changing.');
    L.push('If the constant is right, the tab was renamed and should be renamed');
    L.push('back — do NOT do both, and do not rename a tab a form writes to.');
  }

  if (unclaimed.length) {
    L.push('');
    L.push('Tabs nothing in this code asks for by name (' + unclaimed.length + '):');
    unclaimed.forEach(function (n) { L.push('  ' + n); });
  }

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** The existing tab name closest to one that was not found.
 *
 *  Scored for THESE tabs rather than in general. They are numbered, and the
 *  number is the identity: "03 SELF-REFLECTION RAW" and "03 TRAINEE
 *  SELF-REFLECTION RAW" are obviously the same sheet with a word added, and
 *  no amount of character-by-character comparison says so - the two strings
 *  agree on "03 " and then diverge immediately. So: the leading number
 *  decides, and shared words break ties. */
function nearestTabV20_6_(want, have) {
  var w = String(want).trim();
  var wNum = (w.match(/^([0-9]{2})/) || [, ''])[1];
  var wWords = w.toUpperCase().split(/[^A-Z0-9]+/).filter(function (x) { return x.length > 2; });

  var best = '', score = 0;
  have.forEach(function (h) {
    var x = String(h).trim();
    var xNum = (x.match(/^([0-9]{2})/) || [, ''])[1];
    var xWords = x.toUpperCase().split(/[^A-Z0-9]+/).filter(function (y) { return y.length > 2; });

    var shared = 0;
    wWords.forEach(function (y) { if (xWords.indexOf(y) >= 0) shared++; });

    // the number is worth more than any single word, because it IS the tab
    var s = (wNum && wNum === xNum ? 10 : 0) + shared * 2;
    if (s > score) { score = s; best = x; }
  });
  return score >= 4 ? best : '';
}

/* ---------------------------------------------------------------- *
 *  The engine's key column, and what one deleted row did to it
 * ---------------------------------------------------------------- */

/** READ ONLY. What is broken on the derived tabs, and why.
 *
 *  06 PHASE - STATUS ENGINE is the tab every other view is built from. Its
 *  column A is the key: every one of the twenty-three columns beside it opens
 *  with IF($A{row}="","", ...). So if column A breaks on a row, that whole row
 *  goes with it, on that tab and on every tab downstream of it.
 *
 *  One cell did exactly that. A row was deleted from 01 TRAINEE MASTER at some
 *  point and Google rewrote the formula that pointed at it to
 *
 *      =IF(#REF!="","",#REF!)
 *
 *  which is not an error anybody sees. It is one cell. It took out one row on
 *  seven tabs, and the only symptom is a trainee who is simply not on any of
 *  the views and nothing anywhere saying a name is missing.
 *
 *  This finds it and says so. It changes nothing. */
function engineHealthCheck() {
  var L = ['ENGINE HEALTH CHECK — READ ONLY, nothing was changed', ''];

  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  var mas = getSheetOrNullV20_1_(TAB.MASTER);
  if (!eng || !mas) return 'Cannot run: ' + (!eng ? TAB.ENGINE : TAB.MASTER) + ' is not there.';

  var first = 5;
  var last = Math.max(eng.getLastRow(), first);
  var formulas = eng.getRange(first, 1, last - first + 1, 1).getFormulas();

  var broken = [], crossed = [], fine = 0;
  formulas.forEach(function (r, i) {
    var row = first + i;
    var f = String(r[0] || '');
    if (!f) return;
    if (f.indexOf('#REF!') >= 0) { broken.push(row); return; }
    // every one of these should read the SAME row of the master
    var m = f.match(/'?01 TRAINEE MASTER'?!A(\d+)/);
    if (!m) return;
    if (Number(m[1]) !== row) crossed.push({ row: row, points: Number(m[1]) });
    else fine++;
  });

  L.push('Column A of ' + TAB.ENGINE + ', which every other column keys off:');
  L.push('  reading the row they should  : ' + fine);
  L.push('  pointing at a different row  : ' + crossed.length);
  L.push('  broken beyond repair (#REF!) : ' + broken.length);
  L.push('');

  if (!broken.length && !crossed.length) {
    L.push('Nothing wrong with it. Every row reads its own row of the master.');
  } else {
    broken.forEach(function (row) {
      L.push('  BROKEN   ' + TAB.ENGINE + ' A' + row + ' reads #REF!');
      L.push('           A row was deleted from the master and this formula went with it.');
      L.push('           Everything on row ' + row + ' of this tab, and of every tab built');
      L.push('           from it, is #REF! because of this one cell.');
    });
    crossed.forEach(function (c) {
      L.push('  CROSSED  ' + TAB.ENGINE + ' A' + c.row + ' reads master row ' + c.points +
        ', not row ' + c.row + '.');
      L.push('           That row of the engine is showing a different person.');
    });
    L.push('');
    L.push('Run  previewEngineRepairV20_6()  to see the exact repair. It writes nothing.');
  }

  // and the master rows that are invisible whatever the formulas say
  var t = readTableV20_1_(TAB.MASTER, 4);
  if (t.ok) {
    var iName = t.col['TRAINEE'], iMail = t.col['TRAINEE EMAIL'], iStat = t.col['SET STATUS'];
    var nameless = [];
    t.rows.forEach(function (r, i) {
      if (iName === undefined) return;
      var nm = String(r[iName] || '').trim();
      if (nm) return;
      var anything = r.some(function (v) { return String(v == null ? '' : v).trim() !== ''; });
      if (!anything) return;
      nameless.push({ row: 5 + i,
                      mail: iMail === undefined ? '' : String(r[iMail] || '').trim(),
                      stat: iStat === undefined ? '' : String(r[iStat] || '').trim() });
    });
    if (nameless.length) {
      L.push('');
      L.push('AND ON ' + TAB.MASTER + ': ' + nameless.length + ' row(s) hold data and no name.');
      L.push('Every formula on the engine opens with IF($A{row}="","", ...), so a row');
      L.push('with no name is silently blank on every view. It is not missing — it is');
      L.push('invisible, which looks the same from outside and is not the same thing.');
      nameless.forEach(function (n) {
        L.push('  row ' + n.row + ' : ' + (n.stat || '(no status)') +
               (n.mail ? ' · ' + n.mail : ' · no address either'));
      });
      L.push('');
      L.push('Putting a name back is a change to a personnel record. Nothing here does');
      L.push('that for you, and nothing should.');
    }
  }

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** What repairing the engine's key column would do. Writes nothing. */
function previewEngineRepairV20_6() { return engineRepairV20_6_(''); }

/** Repair it. Restores each cell of column A to read its own row of the
 *  master, which is what every undamaged cell in that column already does.
 *
 *  It touches column A of one derived tab and nothing else. It does not go
 *  near a record, a name, or an address — the twenty-three columns beside it
 *  recalculate on their own once the key is right, and so do the seven tabs
 *  downstream. */
function applyEngineRepairV20_6(confirmToken) { return engineRepairV20_6_(confirmToken); }

function engineRepairV20_6_(confirmToken) {
  var TOKEN = 'REPAIR THE ENGINE KEY COLUMN';
  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  if (!eng) return TAB.ENGINE + ' is not there. Nothing was changed.';

  var first = 5;
  var last = Math.max(eng.getLastRow(), first);
  var formulas = eng.getRange(first, 1, last - first + 1, 1).getFormulas();

  var plan = [];
  formulas.forEach(function (r, i) {
    var row = first + i;
    var f = String(r[0] || '');
    if (!f) return;
    var want = "=IF('" + TAB.MASTER + "'!A" + row + '="","",\'' + TAB.MASTER + "'!A" + row + ')';
    var broken = f.indexOf('#REF!') >= 0;
    var m = f.match(/'?01 TRAINEE MASTER'?!A(\d+)/);
    var crossed = m && Number(m[1]) !== row;
    if (!broken && !crossed) return;
    plan.push({ row: row, was: f, now: want, why: broken ? 'reads #REF!' : 'reads row ' + m[1] });
  });

  if (!plan.length) {
    return 'Nothing to repair. Every cell in column A of ' + TAB.ENGINE +
      ' already reads its own row of ' + TAB.MASTER + '.';
  }

  var L = ['ENGINE KEY COLUMN REPAIR', '', plan.length + ' cell(s) to put back:', ''];
  plan.forEach(function (p) {
    L.push('  A' + p.row + '  (' + p.why + ')');
    L.push('     was : ' + p.was);
    L.push('     now : ' + p.now);
  });
  L.push('');
  L.push('Only column A of ' + TAB.ENGINE + ' is touched. The columns beside it and');
  L.push('every tab built from them recalculate on their own.');

  if (confirmToken !== TOKEN) {
    L.push('');
    L.push('NOTHING WAS WRITTEN. To do it:');
    L.push('  applyEngineRepairV20_6("' + TOKEN + '")');
    var pv = L.join('\n');
    Logger.log(pv);
    try { SpreadsheetApp.getUi().alert(pv.slice(0, 1400)); } catch (e) {}
    return pv;
  }

  if (!gateV20_2_('REPAIR ENGINE KEY COLUMN')) return 'Refused: not authorised.';

  plan.forEach(function (p) { eng.getRange(p.row, 1).setFormula(p.now); });
  SpreadsheetApp.flush();
  systemLog_('WARN', 'ENGINE KEY COLUMN REPAIRED',
    plan.length + ' cell(s): ' + plan.map(function (p) { return 'A' + p.row; }).join(', '));

  L.push('');
  L.push('DONE. ' + plan.length + ' cell(s) repaired. Give the sheet a moment to');
  L.push('recalculate, then run engineHealthCheck() again — it should come back clean.');
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}
