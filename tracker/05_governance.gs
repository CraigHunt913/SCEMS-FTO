/**
 * SCEMS Field Training Tracker — 05_governance
 *
 * Who is allowed to do what, and the gates every mutating path passes
 * through.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   THE RULE THIS FILE ENFORCES
 *   Anything that becomes part of a person's permanent record has exactly
 *   one way in, and that way is never bulk, never defaulted, and never
 *   self-attested. Everything else may be as convenient as we can make it.
 *   Full reasoning, scope and acceptance checks: SPEC-v20.2.md.
 *   Nothing in this file deletes a row from any tab.
 */

var OVERRIDE_MARKER_V20_2 = '[THRESHOLD OVERRIDE]';

/* ---------------------------------------------------------------- *
 *  Identity  (v20.2)
 * ---------------------------------------------------------------- */

/** Script property holding the one account allowed to operate this system
 *  when the platform will not name the session. Set it with
 *  setOperatorAccountV20_2(); it is deliberately not editable from a sheet
 *  cell, because a value a form or a formula can reach is not a credential. */
var OPERATOR_PROP_V20_2 = 'SCEMS_OPERATOR_EMAIL';

/** How sure we are about who is running this, strongest first.
 *
 *  ACTIVE     Session.getActiveUser(). The platform names the human at the
 *             keyboard. Only reliable on Workspace accounts.
 *  EFFECTIVE  Session.getEffectiveUser(). The account the script RUNS AS.
 *             For a container-bound script invoked from its own menu, that
 *             is the person clicking, and on a consumer account it is
 *             usually the only answer available. Inside an installable
 *             trigger it is the trigger's owner rather than whoever caused
 *             the event, so it is attested, not verified.
 *  OPERATOR   The account configured in script properties. A deliberate,
 *             one-time declaration by whoever owns the script, stored where
 *             no sheet formula or form response can reach it.
 *
 *  All three are the platform or the owner answering. None of them is the
 *  thing v20.2 removed: reading a name a user typed into a spreadsheet cell
 *  at decision time and treating it as authority. */
var IDENTITY_TIERS_V20_2 = ['ACTIVE', 'EFFECTIVE', 'OPERATOR'];

/** Resolves who is acting. Returns { email, tier, verified, note }.
 *  email is '' only when nothing could identify the session at all. */
function identityV20_2_() {
  var e1 = '';
  try { e1 = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  if (e1) {
    return { email: e1, tier: 'ACTIVE', verified: true, note: '' };
  }

  var e2 = '';
  try { e2 = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  if (e2) {
    return { email: e2, tier: 'EFFECTIVE', verified: false,
      note: 'the account this script runs as, not confirmed as the person at the keyboard' };
  }

  var e3 = '';
  try {
    e3 = String(PropertiesService.getScriptProperties()
      .getProperty(OPERATOR_PROP_V20_2) || '').trim().toLowerCase();
  } catch (e) {}
  if (e3 && isValidEmailV20_1_(e3)) {
    return { email: e3, tier: 'OPERATOR', verified: false,
      note: 'the configured operator account; the platform named nobody' };
  }

  return { email: '', tier: '', verified: false,
    note: 'the platform named nobody and no operator account is configured' };
}

/** The label stamped beside a decider on a permanent record. Empty when the
 *  identity was actually verified, so clean records stay clean. */
function identityStampV20_2_(id) {
  if (!id || !id.email) return ' [IDENTITY UNKNOWN]';
  if (id.verified) return '';
  return ' [IDENTITY ' + id.tier + ', ATTESTED]';
}

/** Declares the account that may operate this system when Google will not
 *  name the session. Run once, from the script editor, by the person who
 *  owns the script.
 *
 *  This is the consumer-account accommodation, and it is narrower than it
 *  looks: it names ONE address, it is stored in script properties where no
 *  sheet or form can reach it, every use of it is logged, and every record
 *  written under it carries [IDENTITY OPERATOR, ATTESTED] permanently. It
 *  does not restore the v20.1 hole, which let anyone who typed "Medical
 *  Director" into a cell sign off a clinical competency. */
function setOperatorAccountV20_2(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) {
    var cur = PropertiesService.getScriptProperties().getProperty(OPERATOR_PROP_V20_2) || '(none)';
    var m0 = 'Operator account is currently: ' + cur +
      '\n\nTo set it:  setOperatorAccountV20_2("you@example.com")' +
      '\nTo clear it: setOperatorAccountV20_2("CLEAR")';
    Logger.log(m0); return m0;
  }
  if (e === 'clear') {
    PropertiesService.getScriptProperties().deleteProperty(OPERATOR_PROP_V20_2);
    systemLog_('WARN', 'OPERATOR ACCOUNT CLEARED', 'fallback identity removed');
    var m1 = 'Operator account cleared. If Google does not name the session, every ' +
             'gated action will now refuse.';
    Logger.log(m1); return m1;
  }
  if (!isValidEmailV20_1_(e)) {
    var m2 = 'Refused: "' + email + '" is not a valid email address. Nothing was set.';
    Logger.log(m2); return m2;
  }
  PropertiesService.getScriptProperties().setProperty(OPERATOR_PROP_V20_2, e);
  systemLog_('WARN', 'OPERATOR ACCOUNT SET', e);
  var msg = 'Operator account set to ' + e + '.\n\n' +
    'This is used ONLY when Google will not name the session. Every record ' +
    'written that way is stamped [IDENTITY OPERATOR, ATTESTED] permanently, ' +
    'and every use is logged to 93 ACCESS LOG.\n\n' +
    'It is an accommodation for consumer Google accounts, not a substitute ' +
    'for Workspace accounts. The health check will keep saying so.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e2) {}
  return msg;
}

/** Which roles may perform which action. Anything not listed is director-only
 *  by default, so a new action fails closed rather than open. */
var ACTION_ROLES_V20_2 = Object.freeze({
  'ADVANCE TRAINEE':        ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION'],
  'CLOSE TRAINEE':          ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION'],
  'WORK QUEUE':             ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION', 'MEDICAL_DIRECTOR'],
  'RECORD WITNESSED SKILL': ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION', 'MEDICAL_DIRECTOR'],
  'ACCEPT AUDIT FLAG':      ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION', 'MEDICAL_DIRECTOR'],
  'CHANGE DELIVERY MODE':   ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION'],
  'READ PROGRAM REPORT':    ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION', 'COMMAND', 'MEDICAL_DIRECTOR'],
  'RUN BACKUP':             ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION'],
  'PROTECT RECORD TABS':    ['PROGRAM_DIRECTOR', 'TRAINING_DIVISION'],
  'DELETE TEST ROWS':       ['PROGRAM_DIRECTOR']
});

/** Writes one row to the access log, and always to the system log. The access
 *  log may not exist before migration; that must never lose the entry. */
function logAccessV20_2_(action, email, authorized, detail) {
  systemLog_(authorized ? 'INFO' : 'WARN',
    'ACCESS ' + (authorized ? 'GRANTED' : 'REFUSED'),
    action + ' | ' + (email || '(unidentified)') + ' | ' + String(detail || '').slice(0, 300));
  try {
    appendRowsHeaderMappedV20_1_(TAB.ACCESS, 4, [{
      'ACCESS ID': newIdV20_1_('AC'), 'TIMESTAMP': new Date(), 'KIND': action,
      'REQUESTED BY': email || '(unidentified)', 'VERIFIED EMAIL': email || '(none)',
      'AUTHORIZED': authorized ? 'YES' : 'NO', 'SUBJECT': '', 'DELIVERED TO': '',
      'REASON': '', 'DETAIL': String(detail || '').slice(0, 400)
    }], ['ACCESS ID']);
  } catch (e) { /* system log above already holds it */ }
}

/** THE GATE. Returns { ok, actor, email, message }.
 *
 *  Refuses outright when the platform cannot identify the session. There is
 *  deliberately no fallback to a typed name: a record that cannot say who
 *  made it is worse than an operator who is briefly locked out. When this
 *  refuses on a consumer Google account, that is the Workspace move becoming
 *  urgent rather than optional — the message says so. */
function requireActorV20_2_(action, allowedRoles) {
  var act = String(action || '').toUpperCase();
  var roles = allowedRoles || ACTION_ROLES_V20_2[act] || ['PROGRAM_DIRECTOR'];
  var id = identityV20_2_();
  var email = id.email;
  var out = { ok: false, actor: null, email: email, identity: id, message: '' };

  if (!email) {
    out.message =
      'REFUSED : ' + act + '\n\n' +
      'Nothing identifies who is running this, so the action could not be\n' +
      'attributed to anyone. Nothing was written.\n\n' +
      'Google names the session on Workspace accounts. On a consumer account\n' +
      'it often will not, and this script has no operator account configured\n' +
      'either.\n\n' +
      'FIX: open the script editor and run\n' +
      '     setOperatorAccountV20_2("' + (CONFIG.TCO_EMAIL || 'you@example.com') + '")\n' +
      'once. Records written that way are permanently stamped\n' +
      '[IDENTITY OPERATOR, ATTESTED].\n\n' +
      'Earlier versions instead read whatever name was typed into the\n' +
      'DECIDED BY cell. That is what produced sign-offs credited to people\n' +
      'who never made them, and it is not coming back.';
    logAccessV20_2_(act, '', false, 'no identity at any tier');
    return out;
  }

  var actor = resolveAuthorizedActorV20_1_(email);
  var granted = actor.ok && roles.some(function (r) { return actor.roles.indexOf(r) >= 0; });
  out.actor = actor;
  if (!granted) {
    out.message =
      'REFUSED : ' + act + '\n\n' +
      'Signed in as ' + email + '  [' + id.tier + (id.verified ? '' : ', attested') + ']\n' +
      'Roles held  : ' + (actor.roles.length ? actor.roles.join(', ') : 'none') + '\n' +
      'Roles needed: ' + roles.join(', ') + '\n\n' +
      'Nothing was written. If this is wrong, the fix is on 22 FTO ROSTER or\n' +
      '90 PERSON REGISTRY, not here.';
    logAccessV20_2_(act, email, false, 'held [' + actor.roles.join(',') + '] needed [' + roles.join(',') + ']');
    return out;
  }

  out.ok = true;
  logAccessV20_2_(act, email, true,
    'roles [' + actor.roles.join(',') + '] | identity ' + id.tier +
    (id.verified ? ' (verified)' : ' (attested: ' + id.note + ')'));
  return out;
}

/** Returns '' when the action is allowed, or the refusal message (already
 *  logged and shown) when it is not. Lets a string-returning function refuse
 *  with `var deny = denyV20_2_('X'); if (deny) return deny;`. */
function denyV20_2_(action, allowedRoles) {
  var g = requireActorV20_2_(action, allowedRoles);
  if (g.ok) return '';
  Logger.log(g.message);
  try { SpreadsheetApp.getUi().alert(g.message); } catch (e) {}
  return g.message;
}

/** Gate helper for the menu flows: refuses, tells the operator why, returns
 *  false. Callers do `if (!gateV20_2_('WORK QUEUE')) return;`. */
function gateV20_2_(action, allowedRoles) {
  var g = requireActorV20_2_(action, allowedRoles);
  if (!g.ok) {
    Logger.log(g.message);
    try { SpreadsheetApp.getUi().alert(g.message); } catch (e) {}
    return false;
  }
  return true;
}

/** The identity to stamp on a record, or '' when unknown. Never invents one. */
function deciderIdentityV20_2_() {
  return sessionEmailV20_1_();
}

/* ---------------------------------------------------------------- *
 *  Evidence gate
 * ---------------------------------------------------------------- */

/** Current READINESS for one trainee/skill straight off the matrix, or ''
 *  when the pair is not on it. Read-only. */
function skillReadinessNowV20_2_(trainee, skillId) {
  var t = readTableV20_1_(TAB.SKILLS, 4);
  if (!t.ok) return '';
  var cT = t.col['TRAINEE'], cS = t.col['SKILL ID'], cR = t.col['READINESS'];
  if (cT === undefined || cS === undefined || cR === undefined) return '';
  var tn = normalizeNameV20_1_(trainee);
  var sid = String(skillId || '').trim();
  for (var i = 0; i < t.rows.length; i++) {
    if (normalizeNameV20_1_(t.rows[i][cT]) !== tn) continue;
    if (String(t.rows[i][cS] || '').trim() !== sid) continue;
    return String(t.rows[i][cR] || '').trim();
  }
  return '';
}

/** SPEC-v20.2.md #3 — an approval needs a reason a human actually chose.
 *
 *  The old code filled in "Evidence thresholds met, FTO recommendation
 *  accepted" on a keystroke. That is a factual claim about evidence, written
 *  under a named decider, that nothing had checked. This asks instead, and
 *  when the matrix disagrees with the approval it says so BEFORE the reason is
 *  typed, so the override is a decision rather than a surprise error.
 *
 *  Returns '' when the operator backs out — callers treat that as a skip.
 */
function approvalRationalePromptV20_2_(ui, title, trainee, skillId) {
  var readiness = skillReadinessNowV20_2_(trainee, skillId);
  var ready = (readiness === 'READY FOR VALIDATION');

  if (!ready) {
    var warn = ui.alert('Evidence gate : ' + title,
      'The matrix reads "' + (readiness || 'not on the matrix') + '" for this skill, ' +
      'not READY FOR VALIDATION.\n\n' +
      'You may still approve — your judgement is the point of this role — but the ' +
      'record will be permanently stamped ' + OVERRIDE_MARKER_V20_2 + ' so the ' +
      'exception is visible to anyone who reads it later.\n\n' +
      'Approve anyway?', ui.ButtonSet.YES_NO);
    if (warn !== ui.Button.YES) return '';
  }

  var r = ui.prompt('Approve : ' + title,
    'Why is this competency signed off? This becomes the official reason on a ' +
    'permanent record, in your name.\n\n' +
    (ready ? 'Examples: "Evidence thresholds met, FTO recommendation accepted", ' +
             '"Directly observed and verified".'
           : 'Say what you relied on instead of the thresholds.') +
    '\n\n(Blank cancels this one and moves on.)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return '';
  var text = String(r.getResponseText() || '').trim();
  if (!text) return '';
  if (!ready && text.indexOf(OVERRIDE_MARKER_V20_2) < 0) {
    text = OVERRIDE_MARKER_V20_2 + ' ' + text;
  }
  return text;
}

/** Evidence gate for an Approve sign-off. Returns a problem string, or ''.
 *  An approval below threshold is not forbidden — it is required to be
 *  DISTINGUISHABLE, by carrying the override marker into the permanent
 *  record. Returns and revokes are never gated. */
function evidenceGateProblemV20_2_(decision, trainee, skillId, rationale) {
  if (decision !== 'Approve sign-off') return '';
  var readiness = skillReadinessNowV20_2_(trainee, skillId);
  if (readiness === 'READY FOR VALIDATION') return '';
  if (String(rationale || '').indexOf(OVERRIDE_MARKER_V20_2) >= 0) return '';
  return 'evidence gate: this skill reads "' + (readiness || 'not on the matrix') +
    '", not READY FOR VALIDATION. Approving anyway is allowed but must be ' +
    'deliberate — add the override through the menu so the record shows it';
}

/* ---------------------------------------------------------------- *
 *  Audit flags : an honest acceptance path
 * ---------------------------------------------------------------- */

var FLAG_ACCEPT_STATUS_V20_2 = 'Accepted';

var FLAG_ACCEPT_DAYS_V20_2 = 90;

/** Locates the FLAG REVIEW LOG on tab 13. Returns { headerRow, firstEntry,
 *  lastEntry } or null. Same scan the existing tools use. */
function flagReviewLogV20_2_(sh) {
  var scanN = Math.max(sh.getLastRow(), 60);
  var scan = sh.getRange(1, 1, scanN, 2).getValues();
  for (var i = 44; i < scan.length; i++) {
    if (String(scan[i][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[i][1]).indexOf('FLAG REVIEW LOG') >= 0) {
      return { headerRow: i + 2, firstEntry: i + 3, lastEntry: i + 22 };
    }
  }
  return null;
}

/** Every currently burning flag on tab 13, read-only. */
function burningFlagsV20_2_() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  var out = [];
  if (!sh) return out;
  var heads = sh.getRange(4, 2, 1, 6).getDisplayValues()[0];
  var names = sh.getRange(5, 1, 40, 1).getDisplayValues();
  var vals = sh.getRange(5, 2, 40, 6).getDisplayValues();
  for (var i = 0; i < 40; i++) {
    var who = String(names[i][0] || '').trim();
    if (!who) continue;
    for (var c = 0; c < 6; c++) {
      if (String(vals[i][c]).trim() !== 'FLAG') continue;
      out.push({ trainee: who, flagType: heads[c] || ('column ' + (c + 2)), row: 5 + i });
    }
  }
  return out;
}

/** ACCEPT ONE FLAG. One flag, one named human, one typed reason, one date.
 *
 *  The flag STAYS VISIBLE and keeps reading FLAG — acceptance is recorded
 *  beside it, never instead of it, and no detection formula is touched. The
 *  acceptance expires, so it is a decision with a shelf life rather than a
 *  permanent silence. This is the supported replacement for the bulk
 *  silencing that v20.1 shipped and v20.2 retires. */
function acceptFlagV20_2() {
  if (!gateV20_2_('ACCEPT AUDIT FLAG')) return;
  var ui = SpreadsheetApp.getUi();
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) { ui.alert('Tab 13 not found.'); return; }

  var burning = burningFlagsV20_2_();
  if (!burning.length) { ui.alert('No flags are burning. Nothing to accept.'); return; }

  var log = flagReviewLogV20_2_(sh);
  if (!log) { ui.alert('FLAG REVIEW LOG not found on tab 13. Run redoAuditTabV20_1 once first.'); return; }

  var listing = burning.slice(0, 20).map(function (f, i) {
    return (i + 1) + '  ' + f.trainee + ' — ' + f.flagType; }).join('\n');
  var r1 = ui.prompt('Accept one flag  (1 of 2)',
    burning.length + ' flag(s) burning. Type the number of the ONE you are accepting:\n\n' +
    listing + (burning.length > 20 ? '\n   …and ' + (burning.length - 20) + ' more' : ''),
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var pick = parseInt(String(r1.getResponseText() || '').trim(), 10);
  if (!(pick >= 1 && pick <= Math.min(burning.length, 20))) { ui.alert('Not a listed number. Nothing recorded.'); return; }
  var flag = burning[pick - 1];

  var r2 = ui.prompt('Accept one flag  (2 of 2)',
    flag.trainee + ' — ' + flag.flagType + '\n\n' +
    'Why is this acceptable? This goes on the record in your name.\n' +
    'There is no default: a blank answer cancels.',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var reason = String(r2.getResponseText() || '').trim();
  if (!reason) { ui.alert('No reason given. Nothing recorded.'); return; }

  var reviewBy = new Date();
  reviewBy.setDate(reviewBy.getDate() + FLAG_ACCEPT_DAYS_V20_2);
  var who = deciderIdentityV20_2_();

  var existing = sh.getRange(log.firstEntry, 1, log.lastEntry - log.firstEntry + 1, 6).getValues();
  var free = -1;
  for (var i = 0; i < existing.length; i++) {
    if (!String(existing[i][1] || '').trim()) { free = log.firstEntry + i; break; }
  }
  if (free < 0) { ui.alert('The FLAG REVIEW LOG is full. Add rows beneath it, then try again.'); return; }

  sh.getRange(free, 1, 1, 6).setValues([[
    new Date(), flag.trainee, flag.flagType, who,
    sanitizeCellV20_1_('Accepted until ' + dateKeyV20_1_(reviewBy) + ' — ' + reason),
    FLAG_ACCEPT_STATUS_V20_2
  ]]);

  // Keep the STATUS dropdown honest about the value we just wrote.
  try {
    sh.getRange(log.firstEntry, 6, log.lastEntry - log.firstEntry + 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(
        ['Under review', 'Action taken — awaiting data', 'Resolved', FLAG_ACCEPT_STATUS_V20_2], true)
        .setAllowInvalid(true).build());
  } catch (e) {}

  var msg = 'Accepted.\n\n' + flag.trainee + ' — ' + flag.flagType +
    '\nAccepted by : ' + who +
    '\nReview by   : ' + dateKeyV20_1_(reviewBy) +
    '\nReason      : ' + reason +
    '\n\nThe flag stays visible and still counts as outstanding. Acceptance is ' +
    'recorded beside it, not instead of it, and it expires on the review date. ' +
    'No detection formula was changed.';
  systemLog_('WARN', 'AUDIT FLAG ACCEPTED',
    flag.trainee + ' | ' + flag.flagType + ' | by ' + who + ' | review by ' + dateKeyV20_1_(reviewBy));
  ui.alert(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Record-tab protections : immutability as a control
 * ---------------------------------------------------------------- */

/** Applies sheet protection to the tabs that hold permanent records, so
 *  "append-only" stops being a convention that seven code paths ignore.
 *  Reports rather than forces, and is safe to re-run. */
function protectRecordTabsV20_2() {
  if (!gateV20_2_('PROTECT RECORD TABS')) return;
  var DESC = 'SCEMS v20.2 record tab — script writes, people do not';
  // 17 TRAINEE ARCHIVE was missing from this list. It holds the record of
  // everybody who has been released, and nothing about an archive wants
  // hand-editing. 13 AUDIT - EXCEPTION LOG is still deliberately absent:
  // columns J and K on that tab exist to be ticked by a person, and full
  // sheet protection would take that away.
  var tabs = [TAB.DECISIONS, TAB.ARCHIVE, TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF,
              TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS, TAB.LOG];
  var out = [];
  tabs.forEach(function (name) {
    var sh = getSheetOrNullV20_1_(name);
    if (!sh) { out.push('  ' + name + ' : absent, skipped'); return; }
    try {
      var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
        .filter(function (p) { return String(p.getDescription() || '') === DESC; });
      var p = existing.length ? existing[0] : sh.protect().setDescription(DESC);
      var editors = p.getEditors();
      if (editors.length) p.removeEditors(editors.map(function (u) { return u.getEmail(); }));
      if (p.canDomainEdit && p.canDomainEdit()) p.setDomainEdit(false);
      p.setWarningOnly(false);
      out.push('  ' + name + ' : protected (' + (existing.length ? 'refreshed' : 'new') + ')');
    } catch (e) {
      out.push('  ' + name + ' : NOT protected — ' + e);
    }
  });
  var msg = 'RECORD TAB PROTECTION\n\n' + out.join('\n') +
    '\n\nOnly this account and the script may now write to these tabs.\n' +
    'Everything the system does still works: the script writes as you.\n' +
    'Re-run this after adding an editor to the spreadsheet.';
  systemLog_('INFO', 'RECORD TABS PROTECTED', out.join(' | ').slice(0, 400));
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Health check : the one diagnostic that names the next action
 * ---------------------------------------------------------------- */

var HEALTH_RANK_V20_2 = { BLOCKER: 0, WARN: 1, INFO: 2, CLEAR: 3 };

/** Runs the cheap read-only detectors and returns what needs attention,
 *  worst first, each naming the exact function to run. This exists because
 *  every gap-detector in this system is otherwise editor-only and invisible:
 *  the checks were already written, nobody could find them. Writes nothing. */
function healthCheckV20_2() {
  var items = [];
  function add(sev, headline, run) { items.push({ sev: sev, headline: headline, run: run || '' }); }
  function guard(fn) { try { fn(); } catch (e) { add('WARN', 'A check could not run: ' + e, ''); } }

  guard(function () {
    if (isTestMode_()) {
      add('BLOCKER', 'Delivery is in TEST MODE. Every alert — including unsafe scores and ' +
        '72-hour breaches — reroutes to ' + CONFIG.TEST_INBOX + ' and reaches nobody else.', 'goLive');
    }
  });

  guard(function () {
    var n = masterTraineeRowsV20_1_().length;
    if (n > 40) {
      add('BLOCKER', n + ' trainees on the master, but most readers only see the first 40. ' +
        'Trainee 41 onward gets no reminder, no status card, no digest line and no skill matrix.', '');
    }
  });

  guard(function () {
    var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    var missing = MANAGED_TRIGGER_HANDLERS.filter(function (h) { return have.indexOf(h) < 0; });
    if (missing.length) add('BLOCKER', 'Trigger(s) not installed: ' + missing.join(', '), 'repairAllTriggersNow');
  });

  // A form-bound trigger cannot be checked by handler name alone: one handler
  // serves four forms, so "onSkillsGridSubmitV20 exists" says nothing about
  // WHICH forms reach it. This is exactly how the combined skills form went
  // unbound while every trigger check in the system reported healthy.
  guard(function () {
    var bound = {};
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var src = '';
      try { src = String(t.getTriggerSourceId() || ''); } catch (e) {}
      if (src) bound[src] = true;
    });
    var unbound = [];
    formBoundTriggerPlanV20_2_().forEach(function (p) {
      var f = getStoredFormV19_(p.title);
      if (!f) return;                       // absent form is a different problem
      if (!bound[f.getId()]) unbound.push(p.title);
    });
    if (unbound.length) {
      add('BLOCKER', unbound.length + ' live form(s) have NO trigger bound: ' + unbound.join(', ') +
        '. Submissions to them are dropped — onHubFormSubmit refuses them as form-trigger-owned, ' +
        'and the ledger records the loss as SKIPPED_OWNED. Nothing reaches the evidence log.',
        'repairAllTriggersNow');
    }
  });

  guard(function () {
    var dq = getSheetOrNullV20_1_(TAB.QUEUE);
    if (!dq) return;
    var used = dq.getRange(5, 1, 296, 1).getValues().filter(function (r) { return r[0]; }).length;
    if (used >= 296) {
      add('BLOCKER', 'Decision queue is FULL (296/296). queueAdd now throws, which blocks ' +
        'shift-evaluation ingestion entirely.', '');
    } else if (used > 250) {
      add('WARN', 'Decision queue is ' + used + '/296 full. At 296 it throws and blocks ingestion.', '');
    }
  });

  guard(function () {
    var led = readTableV20_1_(TAB.LEDGER, 4);
    if (!led.ok) return;
    var terminal = ['PROCESSED', 'SKIPPED_OWNED', 'SKIPPED_DUPLICATE', 'RECONCILED'];
    var bad = 0;
    led.rows.forEach(function (r) {
      var st = String(r[led.col['STATE']] || '');
      if (st && terminal.indexOf(st) < 0) bad++;
    });
    if (bad) add('WARN', bad + ' form submission(s) never reached a terminal state.', 'ingestionExceptionReportV20_1');
  });

  guard(function () {
    var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
    if (!q.ok) return;
    var open = 0, stranded = 0;
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      if (String(r[q.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
      open++;
      if (String(r[q.col['DECISION']] || '').trim()) stranded++;
    });
    if (stranded) add('WARN', stranded + ' queue row(s) hold a decision that was never recorded.',
      'previewStrandedDecisionsV20_1');
    if (open) add('INFO', open + ' skill request(s) waiting on you.', 'workMyQueueV20_1');
  });

  guard(function () {
    var f = burningFlagsV20_2_();
    if (f.length) {
      add('WARN', f.length + ' audit flag(s) burning. Fix the condition, or accept one on the ' +
        'record with a reason and a review date.', 'acceptFlagV20_2');
    }
  });

  guard(function () {
    var unprotected = [];
    [TAB.DECISIONS, TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF].forEach(function (n) {
      var sh = getSheetOrNullV20_1_(n);
      if (sh && !sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) unprotected.push(n);
    });
    if (unprotected.length) {
      add('WARN', 'Any editor can still overwrite these record tabs: ' + unprotected.join(', '),
        'protectRecordTabsV20_2');
    }
  });

  guard(function () {
    var left = MailApp.getRemainingDailyQuota();
    if (left <= MAIL_ALERT_RESERVE_V20_2) {
      add('BLOCKER', 'Mail quota is down to ' + left + ' recipient(s). Bulk digests are now ' +
        'held back, but if this reaches zero an unsafe-outcome or 72-hour breach alert will ' +
        'not send either. Consumer accounts allow 100/day; Workspace allows 1,500.', '');
    } else if (left < MAIL_ALERT_RESERVE_V20_2 * 2) {
      add('WARN', 'Mail quota is at ' + left + ' recipient(s) for the rest of today.', '');
    }
  });

  guard(function () {
    var last = PropertiesService.getScriptProperties().getProperty('LAST_FULL_BACKUP') || '';
    if (!last) { add('WARN', 'No full backup package has ever been created.', 'fullBackupV20_1'); return; }
    var d = parseDateSafeV20_1_(last.slice(0, 10));
    if (d && (new Date() - d) / 86400000 > 40) {
      add('WARN', 'Newest full backup is ' + Math.round((new Date() - d) / 86400000) +
        ' days old (' + last + ').', 'fullBackupV20_1');
    }
  });

  guard(function () {
    var id = identityV20_2_();
    if (!id.email) {
      add('BLOCKER', 'Nothing identifies who is running this script, so every gated action ' +
        'will refuse and no decision can be attributed. Run setOperatorAccountV20_2() once ' +
        'from the script editor, or move the program to Workspace accounts.',
        'setOperatorAccountV20_2');
    } else if (id.tier === 'OPERATOR') {
      add('WARN', 'Running as the configured operator account (' + id.email + '). Google is ' +
        'naming nobody, so every record written is stamped [IDENTITY OPERATOR, ATTESTED]. ' +
        'That is honest, but it is not the same as a verified signature — Workspace accounts ' +
        'are what make attribution real.', '');
    } else if (!id.verified) {
      add('WARN', 'Identity is ' + id.tier + ' rather than verified (' + id.email + '): ' +
        id.note + '. Records are stamped accordingly.', '');
    }
  });

  items.sort(function (a, b) { return HEALTH_RANK_V20_2[a.sev] - HEALTH_RANK_V20_2[b.sev]; });

  var L = ['SCEMS HEALTH CHECK — ' + SCEMS_VERSION + ' — read only', ''];
  if (!items.length) {
    L.push('CLEAR. Nothing needs you.');
  } else {
    items.forEach(function (it) {
      L.push(it.sev + '  ' + it.headline);
      if (it.run) L.push('        run: ' + it.run + '()');
      L.push('');
    });
    var blockers = items.filter(function (i) { return i.sev === 'BLOCKER'; }).length;
    L.push(blockers ? blockers + ' blocker(s) first — the rest can wait.'
                    : 'No blockers. Work the list top down.');
  }
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Menu : six verbs, everything else behind Admin
 * ---------------------------------------------------------------- */

/** THE ONLY onOpen IN THIS PROJECT. The two earlier definitions were deleted
 *  in v20.2 — the first had been dead since the second was appended, which is
 *  exactly the failure mode of editing by pasting at the bottom. */
function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('SCEMS')
      .addItem('Trainees (start here)', 'openTraineeConsoleV20_3')
      .addItem('Refresh the trainee list', 'buildTraineeConsoleV20_3')
      .addSeparator()
      .addItem('Work my queue', 'workMyQueueV20_1')
      .addItem('Record a skill I witnessed', 'recordSkillDirectV20_1')
      .addItem('Advance a trainee', 'advanceTraineeNow')
      .addItem('Close / release a trainee', 'closeTraineeV20_1')
      .addSeparator()
      .addItem('Health check', 'healthCheckV20_2')
      .addItem('Backup now', 'fullBackupV20_1')
      .addSeparator()
      .addSubMenu(ui.createMenu('Admin')
        .addItem('Health check', 'healthCheckV20_2')
        .addItem('Deployment status (read-only)', 'deploymentStatusV20_2')
        .addSeparator()
        .addItem('Set the whole spreadsheet up properly', 'MAKE_IT_PROFESSIONAL')
        .addItem('Put the badge and masthead on every page', 'brandAllSheetsV20_5')
        .addItem('Make everything simpler', 'SIMPLIFY_EVERYTHING')
        .addItem('Fix and polish the sheet headers', 'POLISH_SHEETS')
        .addItem('Check entry profiles (read-only)', 'auditEntryProfilesV20_4')
        .addItem('Show every hidden column', 'showAllColumnsV20_4')
        .addItem('Widen columns so comments are readable', 'makeSheetsReadableV20_3')
        .addItem('My sheets look wrong — fix them', 'FIX_MY_SHEETS')
        .addItem('Tidy up the tabs', 'organizeTabsV20_2')
        .addItem('Show every tab', 'showAllTabsV20_2')
        .addItem('Re-open wrongly cancelled requests', 'repairCancelledQueueRowsV20_2')
        .addSeparator()
        .addItem('Accept an audit flag (with a reason)', 'acceptFlagV20_2')
        .addItem('Acknowledge phase mismatches / log flags', 'fixAllFlagsNowV20_1')
        .addItem('Undo old flag-formula wrapping', 'unwrapAuditFormulasV20_1')
        .addItem('Approve skills for trainee on tab 23', 'approveTraineeOnViewV20_1')
        .addItem('Record pending skill decisions', 'recordPendingDecisionsV20_1')
        .addItem('Recover lost form submissions', 'recoverLostSubmissionsV20_2')
        .addItem('Ingestion reconciliation (read-only)', 'reconcileIngestionV20_1')
        .addSeparator()
        .addItem('Which mode am I in?', 'whichMode')
        .addItem('Version report', 'versionReportV20_1')
        .addItem('FTO scoreboard (email it to me)', 'ftoScoreboardV20_1')
        .addSeparator()
        .addItem('Protect the record tabs', 'protectRecordTabsV20_2')
        .addItem('Sync form choices (level-safe)', 'refreshDropdowns')
        .addItem('Refresh the home page', 'refreshHomeNowV20_1')
        .addItem('Re-tidy the queue tab (formatting only)', 'makeQueueReadableV20_1')
        .addItem('Tab 20 : show only live work', 'queueShowLiveV20_1')
        .addItem('Tab 20 : show full history', 'queueShowAllV20_1')
        .addSeparator()
        .addItem('Reconcile decisions (read-only)', 'reconcileDecisionsV20')
        .addItem('System review — core (read-only)', 'reviewCoreV20_1')
        .addItem('System review — deep (read-only)', 'reviewDeepV20_1')
        .addItem('Migration preview (read-only)', 'previewMigrationV20_1'))
      .addSubMenu(ui.createMenu('Go live / test')
        .addItem('Go LIVE', 'goLive')
        .addItem('Back to TEST mode', 'backToTestMode'))
      .addToUi();
  } catch (err) {
    Logger.log('onOpen menu skipped: ' + err);
  }
}
