/**
 * SCEMS Field Training Tracker — 95_runners
 *
 * Triggers, the menu, and the functions a human runs by name.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   START HERE
 *   Permanent one-click utilities. These wrap the token-gated maintenance
 *   functions so they can be run straight from the editor dropdown without
 *   pasting temporary code. Each is safe to run repeatedly.
 */

/** Everything, end to end: fix what is wrong, say it in English, put the
 *  badge on it, and tidy up. This is the one to run. */
function MAKE_IT_PROFESSIONAL() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SCEMS ' + SCEMS_VERSION + ' — full pass', ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 2).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 105)); });
    } catch (e) { L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 180)); }
  }
  step(1, 'Name the unnamed column on the decision queue', repairDecisionQueueHeaderV20_4);
  step(2, 'Check entry profiles agree with their key', auditEntryProfilesV20_4);
  step(3, 'Lift the legend out of the data table', tidyEntryProfileLegendV20_4);
  step(4, 'Rewrite headers in plain English', renameHeadersV20_4);
  step(5, 'Put thresholds beside the counts', rewriteEvidenceSummariesV20_4);
  step(6, 'Build the TRAINEES console', buildTraineeConsoleV20_3);
  step(7, 'Widen what holds words', makeSheetsReadableV20_3);
  step(8, 'Tuck the machine columns away', groupPlumbingColumnsV20_4);
  step(9, 'Put the badge and a masthead on every page', brandAllSheetsV20_5);
  step(10, 'Order the tabs and hide the machinery', organizeTabsV20_2);
  L.push('');
  L.push('Open TRAINEES. That is the page you work from.');
  var msg = L.join('\n');
  systemLog_('WARN', 'FULL PASS RUN', SCEMS_VERSION);
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Everything, in the right order
 * ---------------------------------------------------------------- */

/** Fixes what is wrong, then makes the rest readable. Correctness first:
 *  a mislabelled column is a different kind of problem from an ugly one. */
function POLISH_SHEETS() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SHEET POLISH — ' + SCEMS_VERSION, ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 3).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 110)); });
    } catch (e) { L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 200)); }
  }
  L.push('CORRECTNESS');
  step(1, 'Name the unnamed column on the decision queue', repairDecisionQueueHeaderV20_4);
  step(2, 'Check entry profiles agree with their key', auditEntryProfilesV20_4);
  step(3, 'Lift the legend out of the data table', tidyEntryProfileLegendV20_4);
  L.push('');
  L.push('READABILITY');
  step(4, 'Rewrite headers in plain English', renameHeadersV20_4);
  step(5, 'Put thresholds beside the counts', rewriteEvidenceSummariesV20_4);
  step(6, 'Tuck the machine columns away', groupPlumbingColumnsV20_4);
  step(7, 'Widen what holds words, narrow what holds dates', makeSheetsReadableV20_3);
  L.push('');
  L.push('If step 2 found disagreements, they are yours to settle — which entry');
  L.push('profile is right is a fact about that person, and this will not guess.');
  var msg = L.join('\n');
  systemLog_('WARN', 'SHEET POLISH RUN', 'v20.4');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** One command: build the console, make everything readable, tidy the tabs. */
function SIMPLIFY_EVERYTHING() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SIMPLIFY — ' + SCEMS_VERSION, ''];
  function step(n, what, fn) {
    try { var r = fn(); L.push(n + '. ' + what + ' : OK'); if (r) L.push('      ' + String(r).split('\n')[0].slice(0, 110)); }
    catch (e) { L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 200)); }
  }
  step(1, 'Build the TRAINEES console', function () { return buildTraineeConsoleV20_3(); });
  step(2, 'Widen the columns so comments are readable', function () { return makeSheetsReadableV20_3(); });
  step(3, 'Order the tabs and hide the machinery', function () { return organizeTabsV20_2(); });
  L.push('');
  L.push('Open the TRAINEES tab. One row per person. Tick "Open file" for their whole');
  L.push('history as a document; tick "Release" when they are done. Nothing else is');
  L.push('needed day to day.');
  var msg = L.join('\n');
  systemLog_('WARN', 'SIMPLIFY RUN', 'console + readable layout + tabs');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  One button for "my sheets look wrong"
 * ---------------------------------------------------------------- */

/** Rebuild, repair, re-tidy — in that order, because each depends on the
 *  one before it. Reads and rewrites derived views; never touches a record.
 *
 *  Order matters:
 *    1. matrix  — readiness must be current before anything reads it
 *    2. repair  — re-open requests the old sweep cancelled by mistake
 *    3. layout  — formatting, dropdowns, home panel
 *    4. tabs    — order and hide the machinery
 *    5. health  — what still needs you
 */
function FIX_MY_SHEETS() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SHEET REPAIR — ' + SCEMS_VERSION, ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 5).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 110));
      });
    } catch (e) {
      L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 200));
    }
  }

  step(1, 'Rebuild the skills matrix', function () {
    rebuildSkillMatrixV19_(); return 'readiness recalculated from the evidence log';
  });
  step(2, 'Re-open wrongly cancelled requests', function () {
    return repairCancelledQueueRowsV20_2();
  });
  step(3, 'Re-tidy the queue and home panel', function () {
    var bits = [];
    try { bits.push(String(makeQueueReadableV20_1())); } catch (e) { bits.push('queue formatting: ' + e); }
    try { refreshHomeNowV20_1(); bits.push('home panel refreshed'); } catch (e) { bits.push('home: ' + e); }
    return bits.join(' | ');
  });
  step(4, 'Order the tabs and hide the machinery', function () {
    return organizeTabsV20_2();
  });

  L.push('');
  L.push('Nothing was deleted. Records were not modified — only derived views,');
  L.push('formatting, and the status of requests the old sweep cancelled by mistake.');
  L.push('');
  try { L.push(healthCheckV20_2()); } catch (e) { L.push('Health check failed: ' + e); }

  var msg = L.join('\n');
  systemLog_('WARN', 'SHEET REPAIR RUN', 'FIX_MY_SHEETS completed');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** The one function to run after pasting v20.2.
 *
 *  It takes NO arguments on purpose. The Apps Script editor's Run button
 *  cannot pass any, so goLiveChecklistV20_2("someone@example.com") is not
 *  actually runnable from the editor — a detail that matters more than it
 *  should, because it is the first thing anyone does.
 *
 *  It works out who you are from the session, so there is nothing to type.
 *  Falls back to the configured program director if Google says nothing.
 *
 *  Safe to run again at any time. It writes no records and deletes nothing.
 */
function START_HERE() {
  var who = '';
  try { who = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  if (!who) {
    try { who = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e2) {}
  }
  if (!who) who = String(CONFIG.FTO_PROGRAM_DIRECTOR || CONFIG.TCO_EMAIL || '').toLowerCase();
  return goLiveChecklistV20_2(who);
}

/* ---------------------------------------------------------------- *
 *  Deployment  (v20.2)
 * ---------------------------------------------------------------- */

/** ONE COMMAND. Run this from the script editor after pasting v20.2, and it
 *  takes the project from "code is present" to "system is running".
 *
 *  Every step is one that already existed and is safe to repeat. This adds
 *  no new behaviour of its own; it removes the need to remember an order.
 *  It writes no records and deletes nothing.
 *
 *  Pass the account that will operate the system:
 *      goLiveChecklistV20_2("you@example.com")
 *
 *  Steps, in dependency order:
 *    1. operator account   — so the gate can attribute anything at all
 *    2. form IDs           — so triggers have forms to bind to
 *    3. triggers           — including the combined skills form v20.1 missed
 *    4. migration top-up   — REQUEST ID and the v20.1 system tabs
 *    5. matrix rebuild     — so readiness is current before anyone decides
 *    6. tab protections    — so immutability is a control, not a convention
 *    7. health check       — the standing to-do list
 *
 *  It stops at the first step that fails and tells you which one, because a
 *  later step run against a broken earlier one is how you get a mess. */
function goLiveChecklistV20_2(operatorEmail) {
  var L = ['SCEMS ' + SCEMS_VERSION + ' — DEPLOYMENT CHECKLIST', ''];
  var failed = '';

  function step(n, what, fn) {
    if (failed) { L.push(n + '. ' + what + ' : SKIPPED (step ' + failed + ' failed)'); return; }
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 4).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 110));
      });
    } catch (e) {
      failed = String(n);
      L.push(n + '. ' + what + ' : FAILED');
      L.push('      ' + String(e).slice(0, 300));
    }
  }

  step(1, 'Operator account', function () {
    var id = identityV20_2_();
    if (id.tier === 'ACTIVE') {
      return 'Google names the session directly (' + id.email + '). No operator account needed.';
    }
    if (operatorEmail) return setOperatorAccountV20_2(operatorEmail);
    if (id.email) return 'Identity available as ' + id.tier + ' (' + id.email + ').';
    throw new Error('Nothing identifies this session and no operator email was passed. ' +
      'Call goLiveChecklistV20_2("you@example.com").');
  });

  step(2, 'Form IDs', function () { return rebuildFormIdsNow(); });
  step(3, 'Triggers', function () { return repairAllTriggersNow(); });
  step(4, 'Migration top-up', function () { return applyMigrationV20_1('APPLY V20_1'); });
  step(5, 'Skill matrix rebuild', function () { rebuildSkillMatrixV19_(); return 'matrix rebuilt'; });
  step(6, 'Record tab protection', function () { return protectRecordTabsV20_2(); });

  L.push('');
  if (failed) {
    L.push('STOPPED at step ' + failed + '. Fix that, then run this again — every step is');
    L.push('safe to repeat.');
  } else {
    L.push('All steps completed. The health check below is your standing to-do list;');
    L.push('run healthCheckV20_2() from the SCEMS menu any time.');
    L.push('');
    try { L.push(healthCheckV20_2()); } catch (e) { L.push('Health check failed: ' + e); }
  }

  var msg = L.join('\n');
  systemLog_(failed ? 'ERROR' : 'INFO', 'DEPLOYMENT CHECKLIST',
    failed ? 'stopped at step ' + failed : 'completed');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Read-only companion: what would the checklist find right now? Runs
 *  nothing, changes nothing, and is safe on a live system at any time. */
function deploymentStatusV20_2() {
  var L = ['SCEMS ' + SCEMS_VERSION + ' — DEPLOYMENT STATUS (read only)', ''];

  var id = identityV20_2_();
  L.push('Identity   : ' + (id.email || 'NOBODY') +
    (id.tier ? '  [' + id.tier + (id.verified ? ', verified' : ', attested') + ']' : ''));
  if (!id.email) L.push('             → run setOperatorAccountV20_2("you@example.com")');

  try {
    var ids = storedFormIdsV20_1_();
    L.push('Form IDs   : ' + ids.length + ' stored of ' + EXPECTED_FORMS_V19.length + ' expected');
    if (ids.length < EXPECTED_FORMS_V19.length) L.push('             → run rebuildFormIdsNow()');
  } catch (e) { L.push('Form IDs   : unreadable — ' + e); }

  try {
    var bound = {};
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var src = ''; try { src = String(t.getTriggerSourceId() || ''); } catch (e2) {}
      if (src) bound[src] = true;
    });
    var unbound = [];
    formBoundTriggerPlanV20_2_().forEach(function (p) {
      var f = getStoredFormV19_(p.title);
      if (f && !bound[f.getId()]) unbound.push(p.title);
    });
    var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    var miss = MANAGED_TRIGGER_HANDLERS.filter(function (h) { return have.indexOf(h) < 0; });
    L.push('Triggers   : ' + (miss.length ? miss.length + ' handler(s) missing' : 'all handlers present') +
      (unbound.length ? ', ' + unbound.length + ' form(s) UNBOUND' : ', all forms bound'));
    if (miss.length || unbound.length) L.push('             → run repairAllTriggersNow()');
  } catch (e) { L.push('Triggers   : unreadable — ' + e); }

  var sysTabs = [TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS];
  var absent = sysTabs.filter(function (n) { return !getSheetOrNullV20_1_(n); });
  L.push('v20.1 tabs : ' + (absent.length ? absent.length + ' missing (' + absent.join(', ') + ')'
                                          : 'all present'));
  if (absent.length) L.push('             → run applyMigrationV20_1("APPLY V20_1")');

  try {
    var m = getSheetOrNullV20_1_(TAB.SKILLS);
    var rows = m && m.getLastRow() >= 5 ? m.getLastRow() - 4 : 0;
    L.push('Matrix     : ' + rows + ' row(s)');
    if (!rows) L.push('             → run rebuildSkillMatrixV19_()');
  } catch (e) { L.push('Matrix     : unreadable — ' + e); }

  var unprot = [TAB.DECISIONS, TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF].filter(function (n) {
    var sh = getSheetOrNullV20_1_(n);
    return sh && !sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length;
  });
  L.push('Protection : ' + (unprot.length ? unprot.length + ' record tab(s) unprotected'
                                          : 'record tabs protected'));
  if (unprot.length) L.push('             → run protectRecordTabsV20_2()');

  L.push('Mode       : ' + (isLiveMode_() ? 'LIVE' : 'TEST — alerts reach nobody but the test inbox'));
  L.push('');
  L.push('To do all of the above in order: goLiveChecklistV20_2("you@example.com")');

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---- ported from master (effective winner) ---- */
/**
 * Mandatory go-live gate. Read-only except for writing the result to the log.
 * Returns true only when the core workbook, rosters, forms, recipients,
 * supervisor routing, phase minimums, and test-mode setting are deployment-safe.
 *
 * TEST_MODE=true is reported as a blocker by design. Resolve every other blocker,
 * run a complete ZZ TEST workflow, then change TEST_MODE to false with the
 * Division Chief of Training present and run this function again.
 */
function deploymentPreflight() {
  var S = ss();
  var blockers = [];
  var warnings = [];
  var requiredTabs = [
    'HOME', TAB.CONTROL, TAB.MASTER, TAB.EVAL, TAB.REFLECT, TAB.URGENT,
    TAB.SKILLS, TAB.ENGINE, TAB.WEEKLY, '08 FTO VIEW', '09 TRAINEE VIEW',
    '11 MEDICAL DIRECTOR VIEW', TAB.QUEUE, '13 AUDIT - EXCEPTION LOG',
    '14 ANALYTICS', '15 SKILL CATALOG', DECISIONS_TAB, ARCHIVE_TAB, TAB.LOG,
    TAB.SKILL_EVIDENCE, TAB.SKILL_VALIDATION, TAB.SKILL_SIGNOFF
  ];
  requiredTabs.forEach(function (name) {
    if (!S.getSheetByName(name)) blockers.push('Missing required tab: ' + name);
  });

  if (S.getSpreadsheetTimeZone() !== 'America/New_York') {
    blockers.push('Workbook timezone must be America/New_York.');
  }
  if (!ftoList().length) blockers.push('No approved FTO roster is loaded on tab 00 column F.');
  if (!traineeList().length) warnings.push('No active trainees are loaded on tab 01.');

  ['TEST_INBOX','TCO_EMAIL','CHIEF_EMAIL','ACHIEF_EMAIL','MD_EMAIL'].forEach(function (key) {
    var value = String(CONFIG[key] || '').trim();
    if (!value || value.indexOf('@') < 1 || value.indexOf('SET_ME') >= 0) {
      blockers.push('Invalid or unset CONFIG.' + key + '.');
    }
  });
  ['POLICY_VERSION','SKILL_STANDARD','RECORD_RETENTION_STANDARD'].forEach(function (key) {
    var value = String(CONFIG[key] || '').trim();
    if (!value || value.indexOf('SET_ME') >= 0) blockers.push('Human governance field CONFIG.' + key + ' is not approved.');
  });
  if (!CONFIG.UAT_APPROVED) blockers.push('CONFIG.UAT_APPROVED is false; all five forms and routing branches need a recorded ZZ TEST pass.');
  if (!CONFIG.GO_LIVE_APPROVED) blockers.push('CONFIG.GO_LIVE_APPROVED is false; the program owner has not authorized launch.');

  var routed = [
    CONFIG.TCO_EMAIL, CONFIG.CHIEF_EMAIL, CONFIG.ACHIEF_EMAIL,
    CONFIG.MD_EMAIL, CONFIG.SUPERVISOR_EMAILS
  ].join(',').split(',').map(function (v) { return String(v || '').trim(); }).filter(String);
  var external = routed.filter(function (address) {
    return !/@sumtercountysc\.gov$/i.test(address);
  });
  if (external.length && !CONFIG.EXTERNAL_RECIPIENTS_APPROVED) {
    blockers.push('External operational recipients require explicit approval: ' + external.join(', ') + '.');
  }

  var ids = [];
  try { ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '[]'); }
  catch (e) { blockers.push('FORM_IDS is not valid JSON.'); }
  if (ids.length !== 5) blockers.push('Expected five stored forms; found ' + ids.length + '.');
  if (ids.length !== ids.filter(function (id, i, a) { return a.indexOf(id) === i; }).length) {
    blockers.push('FORM_IDS contains duplicate IDs.');
  }
  var expectedForms = {
    'SCEMS FTO Shift Evaluation': false,
    'SCEMS Trainee Self-Reflection': false,
    'SCEMS Urgent Concern Report': false,
    'SCEMS Training Decision Record': false,
    'SCEMS Skills Quick Log': false
  };
  ids.forEach(function (id) {
    try {
      var form = FormApp.openById(id);
      var title = form.getTitle();
      if (Object.prototype.hasOwnProperty.call(expectedForms, title)) expectedForms[title] = true;
      else blockers.push('Unexpected stored form: ' + title + '.');
      if (!form.isAcceptingResponses()) blockers.push('Form is closed: ' + title + '.');
      if (form.getDestinationId() !== S.getId()) blockers.push('Form feeds the wrong workbook: ' + title + '.');
    } catch (e) { blockers.push('Stored form is unavailable: ' + id + '.'); }
  });
  Object.keys(expectedForms).forEach(function (title) {
    if (!expectedForms[title]) blockers.push('Required form is missing: ' + title + '.');
  });

  var ctl = S.getSheetByName(TAB.CONTROL);
  if (ctl) {
    var supervisors = ctl.getRange('M5:O8').getDisplayValues();
    supervisors.forEach(function (r, i) {
      if (!r[0] || !r[1] || !r[2] || r.join(' ').indexOf('SET_ME') >= 0 || r[2].indexOf('@') < 1) {
        blockers.push('Shift ' + String.fromCharCode(65 + i) + ' supervisor routing is incomplete on tab 00.');
      }
    });
    var mins = ctl.getRange('B14:B16').getValues();
    ['EMT','Advanced EMT','Paramedic'].forEach(function (level, i) {
      if (typeof mins[i][0] !== 'number' || mins[i][0] <= 0) {
        blockers.push(level + ' total shift floor is not approved on tab 00.');
      }
    });
  }

  var engine = S.getSheetByName(TAB.ENGINE);
  if (engine && (!engine.getRange('A5').getFormula() || !engine.getRange('R5').getFormula())) {
    blockers.push('Status-engine formulas are missing from row 5.');
  }
  var queue = S.getSheetByName(TAB.QUEUE);
  if (queue && !queue.getRange('I5').getFormula()) blockers.push('Decision Queue status formulas are missing.');
  var urgent = S.getSheetByName(TAB.URGENT);
  if (urgent && urgent.getLastRow() >= 5) {
    urgent.getRange(5, 1, urgent.getLastRow() - 4, 14).getDisplayValues().forEach(function (r, i) {
      if (!r[0]) return;
      var sheetRow = i + 5;
      if (!r[10] && !r[13]) blockers.push('Open urgent concern has no owner on tab 04 row ' + sheetRow + '.');
      if (r[10] && !r[11]) blockers.push('Closed urgent concern has no closure date on tab 04 row ' + sheetRow + '.');
    });
  }
  var catalog = S.getSheetByName('15 SKILL CATALOG');
  if (catalog && catalog.getLastRow() >= 5) {
    var statusCol = String(catalog.getRange('A4').getValue()) === 'SKILL ID' ? 17 : 3;
    var pending = catalog.getRange(5, statusCol, catalog.getLastRow() - 4, 1).getDisplayValues()
      .some(function (r) { return !r[0] || /DRAFT|PENDING/i.test(r[0]); });
    if (pending) blockers.push('Skill Catalog still contains blank, DRAFT, or PENDING approval status.');
  }
  if (catalog && String(catalog.getRange('A4').getValue()) !== 'SKILL ID') {
    blockers.push('Skill Catalog has not been upgraded to the v19 controlled schema.');
  }
  var skillEvidence = S.getSheetByName(TAB.SKILL_EVIDENCE);
  if (skillEvidence && String(skillEvidence.getRange('A4').getValue()) !== 'EVENT ID') {
    blockers.push('Skill Evidence Log schema is missing or damaged.');
  }
  var skillQueue = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (skillQueue && String(skillQueue.getRange('A4').getValue()) !== 'READY DATE') {
    blockers.push('Skill Validation Queue schema is missing or damaged.');
  }
  var skillSignoff = S.getSheetByName(TAB.SKILL_SIGNOFF);
  if (skillSignoff && String(skillSignoff.getRange('A4').getValue()) !== 'DECISION ID') {
    blockers.push('Skill Sign-Off Log schema is missing or damaged.');
  }
  try {
    skillCatalogIssuesV19_().forEach(function (issue) { blockers.push(issue); });
    skillDeploymentIssuesV19_().forEach(function (issue) { blockers.push(issue); });
  } catch (e) {
    blockers.push('Skills v19 deployment validation failed: ' + e + '.');
  }

  var triggerCounts = {};
  MANAGED_TRIGGER_HANDLERS.forEach(function (h) { triggerCounts[h] = 0; });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(triggerCounts, h)) triggerCounts[h]++;
  });
  Object.keys(triggerCounts).forEach(function (handler) {
    if (triggerCounts[handler] !== 1) {
      blockers.push('Expected exactly one managed trigger for ' + handler + '; found ' + triggerCounts[handler] + '.');
    }
  });

  var protectedNames = [
    TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.ENGINE, DECISIONS_TAB, TAB.LOG,
    TAB.SKILLS, SKILL_CATALOG_TAB, TAB.SKILL_EVIDENCE,
    TAB.SKILL_VALIDATION, TAB.SKILL_SIGNOFF
  ];
  protectedNames.forEach(function (name) {
    var sh = S.getSheetByName(name);
    if (sh && !sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      blockers.push('Required sheet protection is missing: ' + name + '.');
    }
  });
  mergedRuleConflicts_().forEach(function (conflict) {
    blockers.push('Conditional-format rule intersects a merged range: ' + conflict + '.');
  });

  try {
    var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
    if (!folders.hasNext()) blockers.push('Backup folder is missing; run monthlySnapshot().');
    else {
      var files = folders.next().getFilesByType(MimeType.MICROSOFT_EXCEL);
      var newest = null;
      while (files.hasNext()) {
        var f = files.next();
        if (!newest || f.getDateCreated() > newest) newest = f.getDateCreated();
      }
      if (!newest) blockers.push('No workbook backup snapshot exists.');
      else if ((new Date() - newest) / 86400000 > 40) blockers.push('Newest workbook backup is over 40 days old.');
    }
  } catch (e) { warnings.push('Backup age could not be verified: ' + e); }

  if (isTestMode_()) {
    blockers.push('isTestMode_() is true; outbound messages are still rerouted. Clear only after every other blocker is resolved.');
  }

  var result = blockers.length ? 'NOT READY' : 'READY FOR GO-LIVE';
  var report = result + '\nBLOCKERS:\n' + (blockers.join('\n') || 'None') +
    '\nWARNINGS:\n' + (warnings.join('\n') || 'None');
  Logger.log(report);
  systemLog_(blockers.length ? 'BLOCKER' : 'INFO', 'DEPLOYMENT PREFLIGHT',
    blockers.length + ' blocker(s); ' + warnings.length + ' warning(s).');
  try {
    SpreadsheetApp.getUi().alert(result + '\n\nBlockers:\n' +
      (blockers.join('\n') || 'None') + '\n\nWarnings:\n' + (warnings.join('\n') || 'None'));
  } catch (e) {}
  return !blockers.length;
}

/* ---- ported from master (effective winner) ---- */
function traineeList() { return getList(TAB.MASTER, 1, 5); }

/* ---- ported from master (effective winner) ---- */
function getList(sheetName, col, startRow) {
  var vals = ss().getSheetByName(sheetName).getRange(startRow, col, 60, 1).getValues();
  var out = [];
  vals.forEach(function (r) { if (r[0] && String(r[0]).trim() !== '') out.push(String(r[0])); });
  return out;
}

/* ---- ported constant ---- */
var MANAGED_TRIGGER_HANDLERS = [
  'onHubFormSubmit', 'onSheetEdit', 'dailyChecks', 'weeklyRollup',
  'traineeStatusCards', 'supervisorDigest', 'systemHeartbeat', 'monthlySnapshot'
];

function engineRows() {
  var sh = ss().getSheetByName(TAB.ENGINE);
  return sh.getRange(5, 1, 40, 19).getValues().filter(function (r) { return r[0]; });
}

/** Rebuilds every SCEMS trigger from scratch. Run after any trigger loss. */
function repairAllTriggersNow() {
  var managed = MANAGED_TRIGGER_HANDLERS.concat(['onSkillsGridSubmitV20', 'onHandoverSubmitV19']);
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (managed.indexOf(t.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger('onHubFormSubmit').forSpreadsheet(ss()).onFormSubmit().create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss()).onEdit().create();
  ScriptApp.newTrigger('dailyChecks').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('weeklyRollup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  ScriptApp.newTrigger('traineeStatusCards').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger('supervisorDigest').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  ScriptApp.newTrigger('systemHeartbeat').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  ScriptApp.newTrigger('monthlySnapshot').timeBased().onMonthDay(1).atHour(4).create();
  var plan = formBoundTriggerPlanV20_2_();
  var formBound = 0, absent = [];
  plan.forEach(function (p) {
    var f = getStoredFormV19_(p.title);
    if (f) { ScriptApp.newTrigger(p.handler).forForm(f).onFormSubmit().create(); formBound++; }
    else { absent.push(p.title); }
  });
  var msg = 'Removed ' + removed + ' stale trigger(s). Installed 8 schedule/sheet triggers + ' +
            formBound + ' of ' + plan.length + ' form-bound.' +
            (absent.length ? '\n\nNOT BOUND (form not found in the stored ID list): ' +
              absent.join(', ') + '\nSubmissions to a form with no bound trigger are DROPPED — ' +
              'onHubFormSubmit refuses them as form-trigger-owned. Run rebuildFormIdsNow() if ' +
              'the form exists.' : '');
  systemLog_('WARN', 'TRIGGERS REINSTALLED', msg);
  Logger.log(msg);
  return msg;
}

/** Rebuilds the stored form-ID list by scanning Drive for the nine SCEMS
 *  forms, preferring copies linked to this spreadsheet. */
function rebuildFormIdsNow() {
  var wanted = Object.keys(FORM_TITLES).map(function (k) { return FORM_TITLES[k]; });
  var byTitle = {};
  var it = DriveApp.searchFiles("mimeType = 'application/vnd.google-apps.form' and title contains 'SCEMS'");
  while (it.hasNext()) {
    var file = it.next();
    var name = file.getName();
    if (wanted.indexOf(name) < 0) continue;
    var linked = false;
    try { linked = FormApp.openById(file.getId()).getDestinationId() === ss().getId(); } catch (e) {}
    var prev = byTitle[name];
    if (!prev || (linked && !prev.linked) ||
        (linked === prev.linked && file.getLastUpdated() > prev.updated)) {
      byTitle[name] = { id: file.getId(), linked: linked, updated: file.getLastUpdated() };
    }
  }
  var ids = [], report = [];
  wanted.forEach(function (name) {
    if (byTitle[name]) { ids.push(byTitle[name].id); report.push('FOUND   ' + name); }
    else report.push('MISSING ' + name);
  });
  PropertiesService.getScriptProperties().setProperty('FORM_IDS', JSON.stringify(ids));
  var msg = 'Stored ' + ids.length + ' of ' + wanted.length + ' forms\n' + report.join('\n');
  systemLog_('INFO', 'FORM IDS REBUILT', ids.length + ' of ' + wanted.length);
  Logger.log(msg);
  return msg;
}

/** Links pre-v20.1 sign-off records to their queue request IDs. */
function stepA_linkLegacy() { Logger.log(applyLinkDecisionsV20_1('LINK LEGACY')); }

/** Records the stranded decisions, including closed-trainee rows. */
function stepB_recordStranded() { Logger.log(applyStrandedDecisionsV20_1('RECORD STRANDED', 'INCLUDE CLOSED')); }

/** Re-runs the additive migration (safe to repeat any time). */
function stepC_migrationTopUp() { Logger.log(applyMigrationV20_1('APPLY V20_1')); }

/** The two safe tracker jobs, in one go.
 *
 *  Neither sends mail and neither touches delivery mode, so this is safe to
 *  run while still in test mode - which is where it should be run.
 *
 *  Turning mail on stays a separate, deliberate act: run whichMode() to read
 *  who starts receiving, then goLive() when you mean it. */
function FINISH_TRACKER() {
  var L = ['FINISHING THE TRACKER', ''];

  L.push('1. The responses nothing was listening for');
  try {
    String(catchUpUnprocessed()).split('\n').forEach(function (x) {
      if (x.trim()) L.push('   ' + x);
    });
  } catch (e) {
    L.push('   FAILED: ' + String(e.message || e));
    L.push('   Nothing below was run. Fix that and run this again.');
    var early = L.join('\n');
    Logger.log(early);
    return early;
  }

  L.push('');
  L.push('2. The form dropdowns, so they list who is actually here');
  try {
    String(refreshDropdowns()).split('\n').slice(0, 12).forEach(function (x) {
      if (x.trim()) L.push('   ' + x);
    });
  } catch (e) {
    L.push('   FAILED: ' + String(e.message || e));
    L.push('   The catch-up above still stands.');
  }

  L.push('');
  L.push('---------------------------------------------------------');
  L.push('Mail is still in TEST MODE, which is deliberate. Everything above');
  L.push('reroutes to ' + CONFIG.TEST_INBOX + ' and reached nobody else.');
  L.push('');
  L.push('Look at that inbox. If what arrived is what you would want a real');
  L.push('person to get, then:');
  L.push('  whichMode()   reads out exactly who starts receiving');
  L.push('  goLive()      stops the rerouting');
  L.push('');
  L.push('backToTestMode() reverses it at any time.');

  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}
