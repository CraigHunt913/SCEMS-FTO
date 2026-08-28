/**
 * SCEMS FIELD TRAINING TRACKER
 *
 * BUILT FILE. Do not edit this. Edit the files in tracker/ and run
 *   node tools/build-tracker.js
 * A test fails if this file and those sources disagree.
 *
 * This used to be one file ordered by when each thing was written, with
 * fourteen blocks marked ADD-ON appended to the bottom across six versions.
 * It is now ordered by what each thing does. No behaviour changed in the
 * move, and a test proves every declaration came through byte for byte.
 */
/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 00_core
 *
 * Shared plumbing: the spreadsheet handle, dates, logging, locks, mail
 * budget.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Foundation layer: delivery mode, logging, sheet access, header-verified
 *   readers, batch writers, sanitization, locks, mail, identifiers, dates.
 *   RULES THIS FILE ENFORCES PROJECT-WIDE
 *   - Delivery mode is read from the SCEMS_LIVE_MODE script property at the
 *   moment of every send. A Properties failure means TEST mode. No code
 *   path may consult a load-time snapshot for delivery decisions.
 *   - A header mismatch is a reported defect, never an authorization to
 *   clear a sheet. verifyHeadersV20_1_() reports; nothing here erases.
 *   - Every user-supplied string written to a sheet passes through
 *   sanitizeCellV20_1_() so `=`, `+`, `-`, `@` prefixes cannot become
 *   executable formulas.
 *   - Locks are single-level. Acquiring a script lock while one is already
 *   held by this execution throws immediately (misuse), instead of
 *   deadlocking or stacking.
 */

/* ---------------------------------------------------------------- *
 *  Spreadsheet access
 * ---------------------------------------------------------------- */

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetOrNullV20_1_(name) {
  try { return ss().getSheetByName(name); } catch (e) { return null; }
}

function requireSheetV20_1_(name) {
  var sh = getSheetOrNullV20_1_(name);
  if (!sh) throw new Error('Required sheet is missing: "' + name + '". Nothing was written.');
  return sh;
}

/* ---------------------------------------------------------------- *
 *  Delivery mode : single source of truth
 * ---------------------------------------------------------------- */

/** True when the stored flag says LIVE. Any Properties failure = test. */
function isLiveMode_() {
  try {
    return PropertiesService.getScriptProperties()
      .getProperty(LIVE_FLAG_KEY) === 'LIVE';
  } catch (e) {
    return false;
  }
}

function isTestMode_() {
  return !isLiveMode_();
}

/** Turns live delivery on. Confirmation dialog when a UI is present. */
function goLive() {
  var denyV20_2 = denyV20_2_('CHANGE DELIVERY MODE');
  if (denyV20_2) return denyV20_2;
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) {
    var warn =
      'GO LIVE\n\n' +
      'This stops rerouting mail to the test inbox. From the moment you\n' +
      'confirm, alerts go to real people:\n\n' +
      '   Division Chief of Training : ' + CONFIG.TCO_EMAIL + '\n' +
      '   Chief                      : ' + CONFIG.CHIEF_EMAIL + '\n' +
      '   Assistant Chief            : ' + CONFIG.ACHIEF_EMAIL + '\n' +
      '   Medical Director           : ' + CONFIG.MD_EMAIL + '\n' +
      '   Shift supervisors          : per shift, see 99_config\n\n' +
      'Overdue notices, urgent concerns, unsafe scores and 72-hour\n' +
      'breaches all start delivering.\n\nContinue?';
    if (ui.alert('Go Live', warn, ui.ButtonSet.YES_NO) !== ui.Button.YES) {
      Logger.log('Go-live cancelled. Still in test mode.');
      return 'Cancelled. Still in test mode.';
    }
  }
  PropertiesService.getScriptProperties().setProperty(LIVE_FLAG_KEY, 'LIVE');
  var msg = 'LIVE.\n\nMail is going to real recipients from now on.\n\n' +
            'Run whichMode() to confirm. Reverse at any time with backToTestMode().';
  Logger.log(msg);
  systemLog_('BLOCKER', 'GO LIVE : TEST MODE OFF',
    'Outbound mail is now delivering to real recipients. ' + SCEMS_VERSION);
  if (ui) ui.alert(msg);
  return msg;
}

/** Reverses go-live. Everything reroutes to the test inbox. */
function backToTestMode() {
  var denyV20_2 = denyV20_2_('CHANGE DELIVERY MODE');
  if (denyV20_2) return denyV20_2;
  PropertiesService.getScriptProperties().setProperty(LIVE_FLAG_KEY, 'TEST');
  var msg = 'Back in TEST MODE.\n\nAll mail reroutes to ' + CONFIG.TEST_INBOX +
            '.\nNothing was lost. Delivery to real recipients has stopped.';
  Logger.log(msg);
  systemLog_('WARN', 'RETURNED TO TEST MODE', 'Mail rerouting to the test inbox. ' + SCEMS_VERSION);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Reports the stored flag, the effective mode, the recipients by role,
 *  and any conflict. There is no second copy of the truth to disagree
 *  with in v20.1, so the only reportable conflict is an unreadable
 *  Properties store — which itself forces test mode. */
function whichMode() {
  var flag = '(unreadable)';
  var readable = true;
  try {
    flag = PropertiesService.getScriptProperties().getProperty(LIVE_FLAG_KEY) || '(never set)';
  } catch (e) { readable = false; }
  var live = isLiveMode_();
  var L = [];
  L.push('SCEMS ' + SCEMS_VERSION + ' mode check');
  L.push('');
  L.push('Stored flag     : ' + flag);
  L.push('Effective mode  : ' + (live ? 'LIVE' : 'TEST'));
  L.push('');
  if (live) {
    L.push('Delivery recipients by role:');
    L.push('  FTO Program Director       : ' + (CONFIG.FTO_PROGRAM_DIRECTOR || '(not set)'));
    L.push('  Division Chief of Training : ' + CONFIG.TCO_EMAIL);
    L.push('  Chief                      : ' + CONFIG.CHIEF_EMAIL);
    L.push('  Assistant Chief            : ' + CONFIG.ACHIEF_EMAIL);
    L.push('  Medical Director           : ' + CONFIG.MD_EMAIL);
    L.push('  Program copy               : ' + CONFIG.SUPERVISOR_EMAILS);
    Object.keys(SHIFT_SUPERVISORS_V19).forEach(function (s) {
      var v = SHIFT_SUPERVISORS_V19[s];
      L.push('  Shift ' + s + ' supervisor         : ' + v.email +
        (v.assist ? ' (+ ' + v.assist + ')' : ''));
    });
  } else {
    L.push('Everything reroutes to ' + CONFIG.TEST_INBOX + '.');
    L.push('Run goLive() when ready.');
  }
  if (!readable) {
    L.push('');
    L.push('CONFLICT: the Properties store could not be read. The system is');
    L.push('forcing TEST mode until it can. No mail reaches real recipients.');
  }
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function whichModeV19() { return whichMode(); }

/** Version report: source constant plus runtime facts. */
function versionReportV20_1() {
  var msg = [
    'SCEMS source version : ' + SCEMS_VERSION,
    'Writer version stamp : ' + SCEMS_WRITER_VERSION,
    'Effective mode       : ' + (isLiveMode_() ? 'LIVE' : 'TEST'),
    'Spreadsheet          : ' + ss().getId(),
    'Timezone             : ' + Session.getScriptTimeZone()
  ].join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  System log
 * ---------------------------------------------------------------- */

/** Appends one row to 18 SYSTEM LOG. Never throws into a caller: logging
 *  must not be able to break the operation being logged. */
function systemLog_(severity, event, detail) {
  try {
    var sh = getSheetOrNullV20_1_(TAB.LOG);
    if (!sh) { Logger.log('[' + severity + '] ' + event + ' : ' + detail); return; }
    var row = Math.max(sh.getLastRow() + 1, 5);
    if (sh.getMaxRows() < row) sh.insertRowsAfter(sh.getMaxRows(), 20);
    sh.getRange(row, 1, 1, 5).setValues([[
      new Date(), String(severity || 'INFO'), String(event || ''),
      sanitizeCellV20_1_(String(detail || '').slice(0, 900)),
      Session.getActiveUser().getEmail() || '(unknown)'
    ]]);
  } catch (e) {
    Logger.log('systemLog_ failed: ' + e + ' | ' + severity + ' ' + event + ' ' + detail);
  }
}

/* ---------------------------------------------------------------- *
 *  Normalization, sanitization, identifiers, dates
 * ---------------------------------------------------------------- */

var STRAY_V19 = 'Â';

function stripStrayV19_(s) { return String(s).split(STRAY_V19).join(''); }

/** Display cleanup: trims and collapses interior whitespace. */
function cleanNameV20_1_(s) {
  return stripStrayV19_(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();
}

/** Join key: cleaned, case-folded. Names are for people; keys are for code. */
function normalizeNameV20_1_(s) {
  return cleanNameV20_1_(s).toLowerCase();
}

/** Formula-injection guard. A leading = + - @ or tab becomes a literal. */
function sanitizeCellV20_1_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

/** New durable identifier. Prefix + UUID fragment; collision-checked by
 *  the writers that persist them. */
function newIdV20_1_(prefix) {
  return String(prefix) + '-' + Utilities.getUuid().slice(0, 18);
}

function parseDateSafeV20_1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (v == null || v === '') return null;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dateKeyV20_1_(d) {
  var x = parseDateSafeV20_1_(d);
  return x ? Utilities.formatDate(x, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd') : '';
}

/** True when the date is today or earlier (shift dates may not be future). */
function notFutureV20_1_(d) {
  var x = parseDateSafeV20_1_(d);
  if (!x) return false;
  var end = new Date(); end.setHours(23, 59, 59, 999);
  return x.getTime() <= end.getTime();
}

function isValidEmailV20_1_(s) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(s || '').trim());
}

/* ---------------------------------------------------------------- *
 *  Locking : single-level only
 * ---------------------------------------------------------------- */

var LOCK_HELD_V20_1_ = { held: false, label: '' };

/** Runs fn under the script lock. Nested acquisition throws by design. */
function withScriptLockV20_1_(label, timeoutMs, fn) {
  if (LOCK_HELD_V20_1_.held) {
    throw new Error('Nested lock acquisition blocked: "' + label +
      '" requested while "' + LOCK_HELD_V20_1_.label + '" holds the lock.');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 30000)) {
    throw new Error('Could not obtain the script lock for "' + label +
      '" within ' + (timeoutMs || 30000) + ' ms.');
  }
  LOCK_HELD_V20_1_.held = true;
  LOCK_HELD_V20_1_.label = label;
  try {
    return fn();
  } finally {
    LOCK_HELD_V20_1_.held = false;
    LOCK_HELD_V20_1_.label = '';
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------- *
 *  Header-verified reading and batch writing
 * ---------------------------------------------------------------- */

/** Reads a system table by its header row. Returns headers, a HEADER→index
 *  map (upper-cased keys), and data rows. Read-only. */
function readTableV20_1_(sheetName, headerRow) {
  var sh = getSheetOrNullV20_1_(sheetName);
  if (!sh) return { ok: false, problem: 'missing sheet', sheet: null, headers: [], col: {}, rows: [], firstDataRow: 0 };
  var hr = headerRow || 4;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h == null ? '' : h).trim();
  });
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h.toUpperCase()] = i; });
  // v20.4: a renamed header still answers to its canonical name, so the 235
  // places that look a column up by name keep working after the rename.
  headers.forEach(function (h, i) {
    var canon = canonicalHeaderV20_4_(h, sheetName);
    if (canon && col[canon] === undefined) col[canon] = i;
  });
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr
    ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues()
    : [];
  return { ok: true, problem: '', sheet: sh, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}

/** Verifies that required headers exist. REPORTS ONLY. This function is
 *  the v20.1 replacement for every "header wrong → clear the sheet" path:
 *  a mismatch is returned to the caller as a defect, and the caller must
 *  refuse to write — never erase. */
function verifyHeadersV20_1_(sheetName, headerRow, requiredHeaders) {
  var t = readTableV20_1_(sheetName, headerRow);
  if (!t.ok) return { ok: false, missing: requiredHeaders.slice(), extra: [], problem: t.problem };
  var missing = [];
  requiredHeaders.forEach(function (h) {
    if (!(String(h).toUpperCase() in t.col)) missing.push(h);
  });
  return { ok: missing.length === 0, missing: missing, extra: [], problem: missing.length ? 'missing headers' : '' };
}

/** Appends objects as rows in ONE setValues call, mapping by header name.
 *  Refuses (throws) if any required header is absent — it never invents
 *  columns and never clears anything. Strings are sanitized. Returns the
 *  1-based first row written and the count. */
function appendRowsHeaderMappedV20_1_(sheetName, headerRow, objects, requiredHeaders) {
  if (!objects || !objects.length) return { firstRow: 0, count: 0 };
  var check = verifyHeadersV20_1_(sheetName, headerRow, requiredHeaders || []);
  if (!check.ok) {
    throw new Error('Refusing to write to "' + sheetName + '": missing header(s) ' +
      check.missing.join(', ') + '. Run applyMigrationV20_1() or repair the header row. No data was written.');
  }
  var t = readTableV20_1_(sheetName, headerRow);
  var sh = t.sheet;
  var width = t.headers.length;
  var out = objects.map(function (obj) {
    var row = new Array(width).fill('');
    Object.keys(obj).forEach(function (k) {
      var i = t.col[k.toUpperCase()];
      if (i !== undefined) row[i] = sanitizeCellV20_1_(obj[k]);
    });
    return row;
  });
  var start = Math.max(sh.getLastRow() + 1, (headerRow || 4) + 1);
  var needed = start + out.length - 1;
  if (sh.getMaxRows() < needed) sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows() + 20);
  var range = sh.getRange(start, 1, out.length, width);
  range.clearDataValidations();
  range.setValues(out);
  return { firstRow: start, count: out.length };
}

/* ---------------------------------------------------------------- *
 *  Mail : every send decides mode at send time
 * ---------------------------------------------------------------- */

/** Cleans a recipient list: splits, validates, dedupes. */
function safeRecipientList_(to) {
  var seen = {};
  var clean = String(to == null ? '' : to).split(/[,;\s]+/).filter(function (a) {
    if (!isValidEmailV20_1_(a)) return false;
    var k = a.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  return clean.join(',');
}

function sendMail(to, subject, body) {
  var clean = safeRecipientList_(to);
  if (!clean) {
    Logger.log('sendMail skipped, no valid recipient for: ' + subject);
    systemLog_('WARN', 'MAIL SKIPPED', subject);
    return;
  }
  try {
    if (isTestMode_()) {
      MailApp.sendEmail(CONFIG.TEST_INBOX, '[TEST MODE] ' + subject,
        'Would have gone to: ' + clean + '\n\n' + body);
      systemLog_('TEST', 'MAIL ROUTED TO TEST INBOX', subject + ' | intended: ' + clean);
      return;
    }
    MailApp.sendEmail(clean, subject, body);
    systemLog_('INFO', 'MAIL SENT', subject + ' | to: ' + clean);
  } catch (err) {
    systemLog_('ERROR', 'MAIL FAILED', subject + ' | ' + err);
    throw err;
  }
}

function sendHtmlMail(to, subject, textBody, htmlBody) {
  var clean = safeRecipientList_(to);
  if (!clean) {
    systemLog_('WARN', 'MAIL SKIPPED', subject);
    return;
  }
  try {
    if (isTestMode_()) {
      MailApp.sendEmail({
        to: CONFIG.TEST_INBOX,
        subject: '[TEST MODE] ' + subject,
        body: 'Would have gone to: ' + clean + '\n\n' + textBody,
        htmlBody: htmlBody
      });
      systemLog_('TEST', 'MAIL ROUTED TO TEST INBOX', subject + ' | intended: ' + clean);
      return;
    }
    MailApp.sendEmail({ to: clean, subject: subject, body: textBody, htmlBody: htmlBody });
    systemLog_('INFO', 'MAIL SENT', subject + ' | to: ' + clean);
  } catch (err) {
    systemLog_('ERROR', 'MAIL FAILED', subject + ' | ' + err);
    throw err;
  }
}

function escHtmlV19_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------------------------------------------------------- *
 *  Control dials : label-keyed, never fixed-row
 * ---------------------------------------------------------------- */

/** Reads a numeric dial from 00 README - CONTROL by its label in column A.
 *  Falls back to the supplied default and logs once if the label moved. */
function controlDialV20_1_(label, fallback) {
  var sh = getSheetOrNullV20_1_(TAB.CONTROL);
  if (sh) {
    var last = Math.min(sh.getLastRow(), 60);
    var vals = sh.getRange(1, 1, last, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === label) {
        var n = Number(vals[i][1]);
        if (!isNaN(n) && n > 0) return n;
      }
    }
  }
  systemLog_('WARN', 'CONTROL DIAL FALLBACK', label + ' not found; using ' + fallback);
  return fallback;
}

/* ---------------------------------------------------------------- *
 *  Menu
 * ---------------------------------------------------------------- */




/* ---------------------------------------------------------------- *
 *  Mail quota
 * ---------------------------------------------------------------- */

/** Recipients held back from bulk mail so that safety alerts can always
 *  send. A consumer Google account allows 100 recipients a day; a Monday
 *  run of traineeStatusCards plus supervisorDigest can consume most of it,
 *  and the alerts that matter most — an unsafe skill outcome, a 72-hour
 *  breach — are the ones that happen later in the day.
 *
 *  Bulk senders call the guard below and stop when they would eat into the
 *  reserve. Alert paths deliberately do NOT call it: the reserve exists for
 *  them, and an alert that cannot send must fail loudly rather than politely
 *  decline. */
var MAIL_ALERT_RESERVE_V20_2 = 25;

/** True when one more bulk message may be sent. Logs once when it starts
 *  refusing, so a truncated run is never silent. */
function mailBudgetOkV20_2_(purpose, alreadySent) {
  var left = 0;
  try { left = MailApp.getRemainingDailyQuota(); } catch (e) { return true; }
  if (left > MAIL_ALERT_RESERVE_V20_2) return true;
  if (!alreadySent || alreadySent === 1) {
    systemLog_('ERROR', 'MAIL BUDGET EXHAUSTED',
      purpose + ' stopped: ' + left + ' recipient(s) left, holding ' +
      MAIL_ALERT_RESERVE_V20_2 + ' back for safety alerts.');
  }
  return false;
}

/** Wraps a bulk run: reports what did not go out instead of failing silently
 *  part-way through. */
function reportBulkTruncationV20_2_(purpose, sent, unsent) {
  if (!unsent.length) return;
  var msg = purpose + ' sent ' + sent + ' message(s) and STOPPED. ' + unsent.length +
    ' did not go out because the daily mail quota is nearly gone:\n\n  ' +
    unsent.slice(0, 30).join('\n  ') +
    (unsent.length > 30 ? '\n  …and ' + (unsent.length - 30) + ' more' : '') +
    '\n\nThe remaining quota is held back so unsafe-outcome and 72-hour ' +
    'breach alerts can still send today. Consumer Google accounts allow 100 ' +
    'recipients a day; Workspace accounts allow 1,500.';
  systemLog_('ERROR', 'BULK MAIL TRUNCATED', purpose + ' | ' + unsent.length + ' unsent');
  // This is the message that exists to tell you a send was cut short, and it
  // fires exactly when the daily quota is nearly gone - so the most likely
  // thing to stop it is the very condition it is reporting. Swallowing that
  // left the log saying the run was truncated and nothing saying the warning
  // about it never arrived either.
  try {
    MailApp.sendEmail(CONFIG.TCO_EMAIL, 'SCEMS : ' + purpose + ' was truncated', msg);
  } catch (e) {
    systemLog_('ERROR', 'TRUNCATION ALERT UNDELIVERED',
      'The warning about ' + purpose + ' could not be sent either: ' +
      (e && e.message ? e.message : e) + '. The detail is in this log and in the ' +
      'execution transcript, and nowhere else.');
  }
  Logger.log(msg);
}

/* ---- ported from master (effective winner) ---- */
function parseDateV19_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var parsed = new Date(String(value || ''));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/* ---- ported from master (effective winner) ---- */
function dateKeyV19_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return '';
  return Utilities.formatDate(value, 'America/New_York', 'yyyy-MM-dd');
}

/* ---- ported from master (effective winner) ---- */
function dateMsV19_(value) {
  return value instanceof Date && !isNaN(value.getTime()) ? value.getTime() : 0;
}

/* ---- ported from master (effective winner) ---- */
function ensureSheetCapacityV19_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

function definedV19_(name) {
  try { return typeof eval(name) === 'function'; } catch (e) { return false; }
}

function uniqueCountV19_(values) {
  var seen = {};
  values.forEach(function (v) {
    var key = String(v || '').trim();
    if (key) seen[key] = true;
  });
  return Object.keys(seen).length;
}

function yesV19_(value) {
  return /^(yes|true|y|1)$/i.test(String(value || '').trim());
}

function positiveIntV19_(value) {
  var n = Number(value);
  return isFinite(n) && n >= 1 && Math.floor(n) === n;
}

function rangesIntersect_(a, b) {
  return a.getRow() <= b.getLastRow() && a.getLastRow() >= b.getRow() &&
    a.getColumn() <= b.getLastColumn() && a.getLastColumn() >= b.getColumn();
}


/* ====================================================================== */
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

/** True when the FLAG REVIEW LOG already has an Accepted (or in-progress)
 *  row for this trainee + flag type. Used so health check can say
 *  "owned" vs "nobody has touched this yet" without hiding the FLAG itself. */
function flagHasOwnershipV20_2_(sh, trainee, flagType) {
  var log = flagReviewLogV20_2_(sh);
  if (!log) return false;
  var rows = sh.getRange(log.firstEntry, 1, log.lastEntry - log.firstEntry + 1, 6).getDisplayValues();
  var tn = normalizeNameV20_1_(trainee);
  var ft = String(flagType || '').trim().toUpperCase();
  for (var i = 0; i < rows.length; i++) {
    if (normalizeNameV20_1_(rows[i][1]) !== tn) continue;
    if (String(rows[i][2] || '').trim().toUpperCase() !== ft) continue;
    var st = String(rows[i][5] || '').trim();
    if (st === FLAG_ACCEPT_STATUS_V20_2 || st === 'Under review' ||
        st === 'Action taken — awaiting data') return true;
  }
  return false;
}

/**
 * THE guided path for tab 13. Explains what flags mean, what clears them,
 * and offers Accept for the ones you are living with. Never deletes a FLAG
 * cell and never rewrites a detection formula.
 */
function WORK_AUDIT_FLAGS() {
  if (!gateV20_2_('ACCEPT AUDIT FLAG')) return;
  var ui = SpreadsheetApp.getUi();
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) { ui.alert('Audit tab not found.'); return; }

  // Layout first if the review log is missing — otherwise Accept cannot write.
  if (!flagReviewLogV20_2_(sh)) {
    try { redoAuditTabV20_1(); } catch (e) {}
  }

  var burning = burningFlagsV20_2_();
  var open = [], owned = [];
  burning.forEach(function (f) {
    if (flagHasOwnershipV20_2_(sh, f.trainee, f.flagType)) owned.push(f);
    else open.push(f);
  });

  var HOW =
    'HOW FLAGS WORK\n\n' +
    'A FLAG is a formula watching live data. You cannot delete it.\n' +
    'It goes away only when the condition is fixed:\n\n' +
    '  NO NARRATIVE   → FTO adds narrative on their eval (tab 02)\n' +
    '  SILENT RECORD  → an eval or reflection starts flowing again\n' +
    '  PHASE MISMATCH → Current Phase on tab 01 matches the latest eval\n' +
    '  ADV / REFLECT  → scores and requests converge, or request withdrawn\n' +
    '  FTO SCOPE      → roster/eval level corrected\n\n' +
    'If you understand the condition and are living with it for now:\n' +
    '  Accept it with a typed reason. It STAYS visible and still counts,\n' +
    '  but it is on the record in your name with a review-by date.\n\n';

  if (!burning.length) {
    var clear = HOW + 'Right now: no flags are burning. Tab 13 is clean.';
    Logger.log(clear);
    ui.alert(clear.slice(0, 1400));
    return clear;
  }

  var L = [HOW,
    'Burning now : ' + burning.length +
    '  (unowned: ' + open.length + ', already logged: ' + owned.length + ')', ''];
  if (open.length) {
    L.push('NEED YOU (no acceptance / review log yet):');
    open.slice(0, 15).forEach(function (f, i) {
      L.push('  ' + (i + 1) + '. ' + f.trainee + ' — ' + f.flagType);
    });
    if (open.length > 15) L.push('  …and ' + (open.length - 15) + ' more');
    L.push('');
  }
  if (owned.length) {
    L.push('ALREADY OWNED (still visible until data catches up):');
    owned.slice(0, 10).forEach(function (f) {
      L.push('  · ' + f.trainee + ' — ' + f.flagType);
    });
    L.push('');
  }
  L.push('Next: click OK to Accept one unowned flag, or Cancel to go fix the data.');

  var preview = L.join('\n');
  Logger.log(preview);
  if (!open.length) {
    ui.alert(preview.slice(0, 1400));
    return preview;
  }
  var go = ui.alert('Work audit flags', preview.slice(0, 1200), ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return preview + '\n\nCancelled — go fix the underlying data.';
  return acceptFlagV20_2();
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
  if (!log) {
    try { redoAuditTabV20_1(); } catch (e) {}
    log = flagReviewLogV20_2_(sh);
  }
  if (!log) { ui.alert('FLAG REVIEW LOG not found on tab 13. Run redoAuditTabV20_1 once first.'); return; }

  // Prefer unowned flags in the picker so people don't re-accept the same one.
  var preferred = burning.filter(function (f) {
    return !flagHasOwnershipV20_2_(sh, f.trainee, f.flagType);
  });
  var list = preferred.length ? preferred : burning;

  var listing = list.slice(0, 20).map(function (f, i) {
    return (i + 1) + '  ' + f.trainee + ' — ' + f.flagType; }).join('\n');
  var r1 = ui.prompt('Accept one flag  (1 of 2)',
    list.length + ' flag(s) to choose from. Type the number of the ONE you are accepting:\n\n' +
    listing + (list.length > 20 ? '\n   …and ' + (list.length - 20) + ' more' : '') +
    '\n\nRemember: Accept does NOT clear the red FLAG. It records that you own it.',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var pick = parseInt(String(r1.getResponseText() || '').trim(), 10);
  if (!(pick >= 1 && pick <= Math.min(list.length, 20))) { ui.alert('Not a listed number. Nothing recorded.'); return; }
  var flag = list[pick - 1];

  var r2 = ui.prompt('Accept one flag  (2 of 2)',
    flag.trainee + ' — ' + flag.flagType + '\n\n' +
    'Why is this acceptable for now? This goes on the record in your name.\n' +
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

  try { ackFlagStyleV20_1(); } catch (eStyle) {}

  var msg = 'Accepted — not cleared.\n\n' + flag.trainee + ' — ' + flag.flagType +
    '\nAccepted by : ' + who +
    '\nReview by   : ' + dateKeyV20_1_(reviewBy) +
    '\nReason      : ' + reason +
    '\n\nThe red/amber FLAG stays on the matrix until the underlying data ' +
    'changes. Acceptance is in the FLAG REVIEW LOG, in your name, and expires ' +
    'on the review date. No detection formula was changed.';
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
    var sh = getSheetOrNullV20_1_(TAB.AUDIT);
    var f = burningFlagsV20_2_();
    if (!f.length) return;
    var open = 0, owned = 0;
    f.forEach(function (x) {
      if (flagHasOwnershipV20_2_(sh, x.trainee, x.flagType)) owned++;
      else open++;
    });
    if (open) {
      add('WARN', open + ' audit flag(s) with nobody owning them yet. Fix the ' +
        'underlying data, or Accept one with a reason (it stays visible).',
        'WORK_AUDIT_FLAGS');
    }
    if (owned) {
      add('INFO', owned + ' audit flag(s) already logged/accepted — still visible ' +
        'until the data catches up or the review date arrives.', 'WORK_AUDIT_FLAGS');
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

  // Drive / tab estate: orphan Form Responses, backup form clones, the twin
  // spreadsheet, the phase-engine #REF!, and the blank decision-queue header.
  // These used to live only in editor-only tools and LIVE-FINDINGS.md.
  guard(function () {
    estateHealthItemsV20_6_().forEach(function (it) { items.push(it); });
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
 *  Menu : a desk, not a toolbox catalogue
 *
 *  Day to day you need four things. Everything else is under More.
 *  Jargon names (ELITE_ESTATE, MAKE_IT_PROFESSIONAL) stay as function
 *  ids so old instructions still run; the labels a human reads are plain.
 * ---------------------------------------------------------------- */

/** THE ONLY onOpen IN THIS PROJECT. The two earlier definitions were deleted
 *  in v20.2 — the first had been dead since the second was appended, which is
 *  exactly the failure mode of editing by pasting at the bottom. */
function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('SCEMS')
      .addItem('Trainees — start here', 'openTraineeConsoleV20_3')
      .addItem('Work my queue', 'workMyQueueV20_1')
      .addItem('Record a skill I witnessed', 'recordSkillDirectV20_1')
      .addSeparator()
      .addItem('What needs attention?', 'healthCheckV20_2')
      .addItem('Work audit flags', 'WORK_AUDIT_FLAGS')
      .addItem('Backup now', 'fullBackupV20_1')
      .addSeparator()
      .addItem('Make this spreadsheet simple', 'MAKE_IT_SIMPLE')
      .addSubMenu(ui.createMenu('More')
        .addItem('Refresh the trainee list', 'buildTraineeConsoleV20_3')
        .addItem('Advance a trainee', 'advanceTraineeNow')
        .addItem('Close / release a trainee', 'closeTraineeV20_1')
        .addSeparator()
        .addItem('Hide the clutter (Form Responses, machinery)', 'organizeTabsV20_2')
        .addItem('Show every tab', 'showAllTabsV20_2')
        .addItem('Rebuild the skill matrix', 'rebuildSkillMatrix')
        .addItem('Recover lost form submissions', 'recoverLostSubmissionsV20_2')
        .addItem('Repair forms & sheets (part 1)', 'ELITE_ESTATE')
        .addItem('Recover skills & rebuild matrix (part 2)', 'ELITE_ESTATE_FINISH')
        .addSeparator()
        .addItem('Which mode am I in?', 'whichMode')
        .addItem('Go LIVE', 'goLive')
        .addItem('Back to TEST mode', 'backToTestMode')
        .addSeparator()
        .addSubMenu(ui.createMenu('Advanced')
          .addItem('Explain every burning flag (read-only)', 'explainFlagsV20_1')
          .addItem('Accept one audit flag (with a reason)', 'acceptFlagV20_2')
          .addItem('Refresh audit tab layout', 'redoAuditTabV20_1')
          .addItem('Unwrap old ACK formulas (if flags vanish)', 'unwrapAuditFormulasV20_1')
          .addItem('Acknowledge phase mismatches / log ownership', 'fixAllFlagsNowV20_1')
          .addItem('Deployment status (read-only)', 'deploymentStatusV20_2')
          .addItem('Form estate report (read-only)', 'formEstateReport')
          .addItem('Archive backup form copies', 'archiveFormCopiesPrompt')
          .addItem('Fresh-start report (orphan tabs)', 'freshStartReport')
          .addItem('Engine health (read-only)', 'engineHealthCheck')
          .addItem('Apply engine key repair', 'applyEngineRepairPrompt')
          .addItem('Ingestion reconciliation (read-only)', 'reconcileIngestionV20_1')
          .addItem('Re-open wrongly cancelled requests', 'repairCancelledQueueRowsV20_2')
          .addItem('Protect the record tabs', 'protectRecordTabsV20_2')
          .addItem('Sync form choices (level-safe)', 'refreshDropdowns')
          .addItem('FTO scoreboard (email it to me)', 'ftoScoreboardV20_1')
          .addItem('Version report', 'versionReportV20_1')
          .addItem('Full polish pass', 'MAKE_IT_PROFESSIONAL')
          .addItem('Fix and polish sheet headers', 'POLISH_SHEETS')
          .addItem('My sheets look wrong — fix them', 'FIX_MY_SHEETS')
          .addItem('System review — core (read-only)', 'reviewCoreV20_1')
          .addItem('System review — deep (read-only)', 'reviewDeepV20_1')
          .addItem('Migration preview (read-only)', 'previewMigrationV20_1')))
      .addToUi();
  } catch (err) {
    Logger.log('onOpen menu skipped: ' + err);
  }
}


/* ====================================================================== */
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


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 20_forms
 *
 * The nine forms: their ids, their dropdowns, their links.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Form estate management: stored-form access, level-safe choice sync,
 *   response destinations, and the authorized Handover Card.
 *   PRESERVATION RULES
 *   - Existing forms are updated in place. Nothing here creates a new form
 *   when a stored form with the expected title exists, and nothing here
 *   deletes a form or its response history.
 *   - Choice refresh is SCOPED: hub-wide forms receive the full active
 *   list; each level form receives only its own level's active trainees
 *   and only FTOs whose roster scope covers that level. No code path
 *   can write the full roster into a level form.
 */

/* Muscle-memory aliases. Same single implementations. */
function goLiveV19() { return goLive(); }

function backToTestModeV19() { return backToTestMode(); }

/* ---------------------------------------------------------------- *
 *  Stored form access
 * ---------------------------------------------------------------- */

/** Finds a stored form by exact title via the FORM_IDS property.
 *  Returns the Form or null. Never creates. (Effective single definition;
 *  name preserved from v19.) */
function getStoredFormV19_(title) {
  var ids = storedFormIdsV20_1_();
  for (var i = 0; i < ids.length; i++) {
    try {
      var f = FormApp.openById(ids[i]);
      if (String(f.getTitle() || '').trim() === title) return f;
    } catch (e) {}
  }
  return null;
}

/** Ensures a form's responses land in this spreadsheet. In-place, never
 *  recreates the form; existing response history is preserved by Forms. */
function ensureFormDestinationV20_1_(form) {
  try {
    if (form.getDestinationId && form.getDestinationId() === ss().getId()) return 'already linked';
  } catch (e) { /* no destination set */ }
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss().getId());
  return 'linked';
}

/* ---------------------------------------------------------------- *
 *  Level-safe choice sync
 * ---------------------------------------------------------------- */

/** Active trainees at one certification level (excludes closed/released,
 *  EXAMPLE, and — in live mode — ZZ TEST rows). */
function traineesAtLevelV20_1_(level) {
  return activeTraineesV20_1_()
    .filter(function (r) { return r.level === level; })
    .map(function (r) { return r.name; })
    .sort();
}

/** Active FTOs whose roster scope permits the level. */
function ftosForLevelV20_1_(level) {
  return rosterFtoRecordsV20_1_()
    .filter(function (f) { return f.active && ftoScopeAllowsV20_1_(f, level); })
    .map(function (f) { return f.name; })
    .sort();
}

function levelFormTitleV20_(level) {
  if (level === 'EMT') return FORM_TITLES.SKILLS_EMT;
  if (level === 'Advanced EMT') return FORM_TITLES.SKILLS_AEMT;
  if (level === 'Paramedic') return FORM_TITLES.SKILLS_PMD;
  return 'SCEMS Skills Quick Log : ' + level;
}

/** Updates ONE level form's Trainee and FTO choices in place. Grids and
 *  every other item are untouched (question changes are governance).
 *  Returns a report string. */
function syncOneLevelFormChoicesV20_1_(level) {
  var title = levelFormTitleV20_(level);
  var f = getStoredFormV19_(title);
  if (!f) return title + ' : NOT FOUND (not built or missing from FORM_IDS)';
  var trainees = traineesAtLevelV20_1_(level);
  var ftos = ftosForLevelV20_1_(level);
  var touched = [];
  f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
    var li = it.asListItem();
    var t = String(li.getTitle() || '').trim();
    if (t === 'Trainee') {
      li.setChoiceValues(trainees.length ? trainees : ['none at this level']);
      touched.push('Trainee(' + trainees.length + ')');
    }
    if (t === 'FTO name') {
      li.setChoiceValues(ftos.length ? ftos : ['none in scope']);
      touched.push('FTO(' + ftos.length + ')');
    }
  });
  return title + ' : ' + (touched.length ? touched.join(', ') : 'no list items found');
}

/** Syncs all three level forms. Safe to run any time. */
function syncLevelFormChoicesV20_1() {
  var report = SKILL_LEVELS_V20.map(syncOneLevelFormChoicesV20_1_);
  systemLog_('INFO', 'LEVEL FORM SYNC', report.join(' | '));
  Logger.log(report.join('\n'));
  return report.join('\n');
}

/** PUBLIC — name preserved (menu + syncNewTraineeV19_ call sites).
 *  Hub-wide forms get full ACTIVE lists; level forms are delegated to the
 *  scoped sync and are excluded from the generic pass. This is the v20.1
 *  fix for the full-roster-clobber defect. */
function refreshDropdowns() {
  var ids = storedFormIdsV20_1_();
  if (!ids.length) { Logger.log('No stored forms found.'); return 'No stored forms found.'; }
  var trainees = activeTraineesV20_1_().map(function (r) { return r.name; }).sort();
  var ftos = ftoList().sort();
  var levelTitles = SKILL_LEVELS_V20.map(levelFormTitleV20_);
  var skipTitles = levelTitles.concat([FORM_TITLES.HANDOVER]);
  var notes = [];
  ids.forEach(function (id) {
    var f;
    try { f = FormApp.openById(id); } catch (e) { notes.push(id + ' unreadable'); return; }
    var title = String(f.getTitle() || '').trim();
    if (skipTitles.indexOf(title) >= 0) return; // scoped forms are synced separately
    f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      var li = it.asListItem();
      var t = String(li.getTitle() || '').trim();
      if ((t === 'Trainee' || t === 'Trainee involved') && trainees.length) li.setChoiceValues(trainees);
      if (t === 'FTO name' && ftos.length) li.setChoiceValues(ftos);
      if (t === 'Trainee you are covering') li.setChoiceValues(trainees.length ? trainees : ['none']);
    });
    notes.push(title + ' refreshed');
  });
  var levelReport = syncLevelFormChoicesV20_1();
  var msg = 'Hub forms: ' + notes.join('; ') + '\nLevel forms:\n' + levelReport;
  systemLog_('INFO', 'ROSTER SYNC', 'active trainees ' + trainees.length + ', FTOs ' + ftos.length);
  Logger.log(msg);
  return msg;
}

/** READ-ONLY test: compares every form's choices against the master
 *  roster, lifecycle state, certification level, and FTO scope. */
function verifyLevelFormsV20_1() {
  var L = ['LEVEL FORM SCOPE CHECK — READ ONLY', ''];
  var problems = 0;
  SKILL_LEVELS_V20.forEach(function (level) {
    var title = levelFormTitleV20_(level);
    var f = getStoredFormV19_(title);
    L.push(title);
    if (!f) { L.push('   NOT FOUND'); problems++; L.push(''); return; }
    var expectedT = traineesAtLevelV20_1_(level);
    var expectedF = ftosForLevelV20_1_(level);
    var actualT = [], actualF = [];
    f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      var li = it.asListItem();
      var t = String(li.getTitle() || '').trim();
      var choices = li.getChoices().map(function (c) { return c.getValue(); });
      if (t === 'Trainee') actualT = choices;
      if (t === 'FTO name') actualF = choices;
    });
    var extraT = actualT.filter(function (x) {
      return expectedT.indexOf(x) < 0 && x !== 'none at this level'; });
    var missT = expectedT.filter(function (x) { return actualT.indexOf(x) < 0; });
    var extraF = actualF.filter(function (x) {
      return expectedF.indexOf(x) < 0 && x !== 'none in scope'; });
    if (extraT.length) { problems++; L.push('   TRAINEES OUT OF SCOPE: ' + extraT.join(', ')); }
    if (missT.length) { problems++; L.push('   TRAINEES MISSING: ' + missT.join(', ')); }
    if (extraF.length) { problems++; L.push('   FTOs OUT OF SCOPE: ' + extraF.join(', ')); }
    if (!extraT.length && !missT.length && !extraF.length) L.push('   scope OK (' + actualT.length + ' trainees, ' + actualF.length + ' FTOs)');
    var accepting = '';
    try { accepting = String(f.isAcceptingResponses()); } catch (e) {}
    L.push('   accepting: ' + accepting);
    try {
      L.push('   destination: ' + (f.getDestinationId() === ss().getId() ? 'this spreadsheet' : 'OTHER/NONE'));
    } catch (e) { L.push('   destination: NONE — responses live only in Forms'); problems++; }
    L.push('');
  });
  L.push(problems ? problems + ' problem(s) found.' : 'All level forms in scope.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Handover Card : authorized, roster-addressed, enumeration-safe
 * ---------------------------------------------------------------- */

/** PUBLIC HANDLER — name preserved; the existing form-bound trigger on
 *  the Handover form keeps firing.
 *
 *  v20.1 rules:
 *   1. The requester is the VERIFIED respondent email. If the form did
 *      not capture one, the request is denied and routed to the Training
 *      Division. A typed name is display data, never identity.
 *   2. The requester must resolve to an active FTO or approved leader on
 *      the allowlist (registry/roster email, or configured leadership).
 *   3. The card is delivered to the requester's ROSTER address — never to
 *      a respondent-entered address.
 *   4. The requester must be authorized for that trainee (scope check).
 *   5. A denial NEVER discloses whether the named trainee exists.
 *   6. Every request, grant, and denial is written to the access log. */
function onHandoverSubmitV19(e) {
  try {
    var vals = {};
    e.response.getItemResponses().forEach(function (r) {
      vals[r.getItem().getTitle()] = String(r.getResponse() || '').trim();
    });
    var claimedName = vals['Your name'] || '(not given)';
    var traineeName = vals['Trainee you are covering'] || '';
    var reason = vals['Reason'] || 'not given';
    var verifiedEmail = '';
    try { verifiedEmail = String(e.response.getRespondentEmail() || '').trim().toLowerCase(); } catch (err) {}

    var accessId = newIdV20_1_('AC');
    function logAccess(authorized, deliveredTo, detail) {
      try {
        appendRowsHeaderMappedV20_1_(TAB.ACCESS, 4, [{
          'ACCESS ID': accessId, 'TIMESTAMP': new Date(), 'KIND': 'HANDOVER CARD',
          'REQUESTED BY': claimedName, 'VERIFIED EMAIL': verifiedEmail || '(none)',
          'AUTHORIZED': authorized ? 'YES' : 'NO', 'SUBJECT': traineeName,
          'DELIVERED TO': deliveredTo || '', 'REASON': reason, 'DETAIL': detail || ''
        }], ['ACCESS ID']);
      } catch (e2) {
        systemLog_('WARN', 'ACCESS LOG UNAVAILABLE', accessId + ' | ' + (detail || ''));
      }
    }
    function denyToDivision(why) {
      logAccess(false, '', why);
      sendMail(CONFIG.TCO_EMAIL,
        'Handover request needs review : ' + accessId,
        'A handover card request could not be authorized automatically.\n\n' +
        'Requested by (typed) : ' + claimedName + '\n' +
        'Verified email       : ' + (verifiedEmail || 'NONE — form did not verify identity') + '\n' +
        'Reason given         : ' + reason + '\n' +
        'Review code          : ' + accessId + '\n\n' +
        'No trainee information was sent to anyone. If this request is\n' +
        'legitimate, send the card from the tracker after confirming identity.\n' +
        '(The requested trainee name is withheld from this notice on purpose;\n' +
        'it is recorded in the access log under the review code.)');
      systemLog_('WARN', 'HANDOVER DENIED', accessId + ' | ' + why);
    }

    if (!verifiedEmail || !isValidEmailV20_1_(verifiedEmail)) {
      denyToDivision('no verified respondent email on the submission');
      return;
    }
    var actor = resolveAuthorizedActorV20_1_(verifiedEmail);
    var allowedRole = actor.ok && (actor.roles.indexOf('FTO') >= 0 ||
      actor.roles.indexOf('PROGRAM_DIRECTOR') >= 0 ||
      actor.roles.indexOf('TRAINING_DIVISION') >= 0 ||
      actor.roles.indexOf('COMMAND') >= 0 ||
      actor.roles.indexOf('MEDICAL_DIRECTOR') >= 0);
    if (!allowedRole) {
      denyToDivision('verified email is not on the FTO/leadership allowlist');
      return;
    }

    var resolved = resolveTraineeV20_1_(traineeName);
    var mayView = resolved.ok && actorMayViewTraineeV20_1_(actor, resolved.record);
    if (!resolved.ok || !mayView) {
      // Uniform response: requester learns nothing about who exists.
      var rosterEmail = (actor.person && actor.person.email) || verifiedEmail;
      sendMail(rosterEmail,
        'Handover Card request received : ' + accessId,
        'Your handover card request (' + accessId + ') could not be completed\n' +
        'automatically and has been routed to the Training Division for review.\n\n' +
        'If this is urgent, contact the Division Chief of Training directly.');
      denyToDivision(resolved.ok ? 'requester not authorized for this trainee'
                                 : 'trainee selection did not resolve (' + resolved.reason + ')');
      return;
    }

    var deliverTo = (actor.person && actor.person.email) ? actor.person.email : verifiedEmail;
    var html = handoverHtmlV19_(resolved.record.name, actor.person ? actor.person.name : claimedName, reason);
    if (!html) {
      denyToDivision('card build failed for a resolved trainee — investigate');
      return;
    }
    var opts = { to: '', subject: 'Handover Card : ' + resolved.record.name,
                 htmlBody: html, name: 'SCEMS Field Training' };
    var blob = badgeBlobV19_();
    if (blob) opts.inlineImages = { scemsbadge: blob };
    if (isTestMode_()) {
      opts.to = CONFIG.TEST_INBOX;
      opts.subject = '[TEST MODE] ' + opts.subject;
    } else {
      opts.to = deliverTo;
    }
    MailApp.sendEmail(opts);
    logAccess(true, deliverTo, 'card delivered');
    sendMail(CONFIG.TCO_EMAIL,
      'Handover Card issued : ' + resolved.record.name + ' to ' + (actor.person ? actor.person.name : verifiedEmail),
      'Access record ' + accessId + '. Verified requester: ' + verifiedEmail + '\n' +
      'Reason: ' + reason + '\nDelivered to the roster address on file.\n\n' +
      'This is a record access notice, not an action item.');
    systemLog_('INFO', 'HANDOVER CARD ISSUED', accessId + ' | ' + resolved.record.name + ' → roster address');
  } catch (err) {
    systemLog_('ERROR', 'HANDOVER SUBMIT FAILED', String(err));
  }
}

/** Ensures the Handover form verifies respondent identity: login required
 *  within the domain OR verified collected email. Updates IN PLACE.
 *  Reports what it changed; never recreates the form. */
function hardenHandoverFormV20_1() {
  var f = getStoredFormV19_(FORM_TITLES.HANDOVER);
  if (!f) return 'Handover form not found in FORM_IDS.';
  var notes = [];
  try {
    f.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
    notes.push('email collection: VERIFIED');
  } catch (e) {
    try { f.setCollectEmail(true); notes.push('email collection: enabled (verify type manually in Form settings)'); }
    catch (e2) { notes.push('email collection could NOT be set by script — set "Collect email addresses: Verified" in the Form UI'); }
  }
  try { ensureFormDestinationV20_1_(f); notes.push('destination: this spreadsheet'); } catch (e3) {
    notes.push('destination not set: ' + e3);
  }
  var msg = 'HANDOVER FORM HARDENING\n' + notes.join('\n');
  systemLog_('INFO', 'HANDOVER FORM HARDENED', notes.join(' | '));
  Logger.log(msg);
  return msg;
}

/** Ensures the three level forms verify identity and deliver responses to
 *  this spreadsheet. In place; never recreates. */
function hardenLevelFormsV20_1() {
  var L = [];
  SKILL_LEVELS_V20.forEach(function (level) {
    var f = getStoredFormV19_(levelFormTitleV20_(level));
    if (!f) { L.push(level + ': NOT FOUND'); return; }
    var notes = [];
    try { f.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED); notes.push('verified email ON'); }
    catch (e) {
      try { f.setCollectEmail(true); notes.push('email collection ON (set Verified in UI)'); }
      catch (e2) { notes.push('set "Collect email: Verified" manually'); }
    }
    try { notes.push('destination ' + ensureFormDestinationV20_1_(f)); }
    catch (e3) { notes.push('destination failed: ' + e3); }
    L.push(level + ': ' + notes.join(', '));
  });
  var msg = L.join('\n');
  systemLog_('INFO', 'LEVEL FORMS HARDENED', msg.slice(0, 400));
  Logger.log(msg);
  return msg;
}


/* ====================================================================== */
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
        if (!alreadyMirrored) { mirror(TAB.DECISIONS, vals); mirroredThisAttempt = true; if (haveLedger) ledgerSetV20_1_(ledgerRow, 'VALIDATED', 'mirrored'); }
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


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 35_operations
 *
 * The day-to-day machinery carried forward from v19 and v20.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Working operational machinery carried forward from v19/v20 — each
 *   function below is the single EFFECTIVE implementation identified by the
 *   override-precedence map (Report 2). Shadowed duplicates were dropped.
 *   PATCHES APPLIED DURING PORTING (each marked in place):
 *   1. Every CONFIG.TEST_MODE read became isTestMode_() — delivery mode is
 *   decided at send time from the stored flag, never a load-time value.
 *   2. The queue refresh no longer re-sorts while any OPEN row holds a
 *   draft decision (the mid-selection row-swap defect).
 *   3. checkPortalV19 derives its expected link count from PORTAL_CARDS.
 *   4. EXPECTED_FORMS_V19 derives from FORM_TITLES (all nine forms).
 *   No other behavior was changed in this file.
 */

/** Write the phase-at-decision onto the decision row for this trainee.
 *
 *  Refuses rather than guessing. The row has to be one whose TRAINEE cell
 *  actually holds this person's name; if the last row belongs to somebody
 *  else, another submission landed in between and the right answer is to
 *  say so, not to write anyway.
 *
 *  Returns a short string for the log. Never throws: this runs inside a form
 *  submit handler, and taking the whole ingestion down because a derived
 *  column could not be filled in would be a worse failure than the one it
 *  is reporting. It does not fail SILENTLY, which is the part that mattered. */
function stampDecisionPhaseV20_6_(trainee, phaseNow) {
  try {
    var t = readTableV20_1_(TAB.DECISIONS, 4);
    if (!t.ok) {
      systemLog_('WARN', 'DECISION PHASE NOT STAMPED',
        TAB.DECISIONS + ' could not be read. ' + trainee + ' has a decision row with no phase on it.');
      return 'no tab';
    }
    var iWho = t.col['TRAINEE'];
    var iPhase = t.col['PHASE'] !== undefined ? t.col['PHASE'] : t.col['PHASE AT DECISION'];
    if (iWho === undefined || iPhase === undefined) {
      systemLog_('WARN', 'DECISION PHASE NOT STAMPED',
        TAB.DECISIONS + ' has no ' + (iWho === undefined ? 'TRAINEE' : 'PHASE') +
        ' column. Nothing was written, and nothing was written to the wrong column either.');
      return 'no column';
    }
    // the newest row belonging to this person, not simply the newest row
    var want = cleanNameV20_1_(trainee), hit = -1;
    for (var i = t.rows.length - 1; i >= 0; i--) {
      if (cleanNameV20_1_(t.rows[i][iWho]) === want) { hit = i; break; }
    }
    if (hit < 0) {
      systemLog_('WARN', 'DECISION PHASE NOT STAMPED',
        'No row on ' + TAB.DECISIONS + ' names ' + trainee + '. Nothing was written.');
      return 'no row';
    }
    t.sheet.getRange(4 + 1 + hit, iPhase + 1).setValue(phaseNow);
    return 'stamped';
  } catch (e) {
    systemLog_('ERROR', 'DECISION PHASE NOT STAMPED',
      trainee + ' : ' + (e && e.message ? e.message : e));
    return 'failed';
  }
}


/* ---- ported from zz (effective winner) ---- */
/** Override. Same behaviour as before for EMT and AEMT. Paramedic release
 *  now requires both the Division Chief of Training and the Medical
 *  Director before the queue item can close. */
function decisionAlerts(v) {
  var filedBy = String(v[1] || '').trim();
  var role    = String(v[2] || '').trim();
  var trainee = String(v[3] || '').trim();
  var itemType= String(v[4] || '').trim();
  var decision= String(v[5] || '').trim();
  var S = ss();

  var keyMap = {
    'Advancement review': 'Advancement',
    'NRT outcome': 'NRT',
    'Clinical disagreement': 'Clinical',
    'Urgent concern follow-up': '',
    'Audit flag review': '',
    'Other': ''
  };
  var key = keyMap[itemType] || '';

  // Stamp the phase at decision onto the row just mirrored to tab 16.
  //
  // This used to be three lines with three faults in them:
  //
  //   dec.getRange(dec.getLastRow(), 9).setValue(phaseNow)
  //
  // It assumed the row it wanted was the last one, which is only true if
  // nothing else appended in between - and this runs from a form-submit
  // trigger, where two responses arriving together is ordinary. When it was
  // wrong it stamped one trainee's phase onto another trainee's decision.
  // It addressed the column by number. And it swallowed every failure, so a
  // decision recorded without the phase it was made at looked exactly like
  // one recorded with it.
  //
  // Now: find the column by name, check the row is the one we mean before
  // writing to it, and say so in the log when any of that does not hold.
  var rec = traineeRecordV19_(trainee);
  var phaseNow = rec ? rec.phase : '';
  stampDecisionPhaseV20_6_(trainee, phaseNow);

  var qRow = key ? openQueueRowV19_(trainee, key) : -1;
  var dual = needsDualSignoffV19_(trainee, itemType);

  // ---------- paramedic release : two keys required ----------
  if (dual) {
    var openedMs = 0;
    if (qRow > 0) {
      var filed = S.getSheetByName(TAB.QUEUE).getRange(qRow, 1).getValue();
      if (filed instanceof Date) openedMs = filed.getTime();
    }
    var sigs = signaturesOnFileV19_(trainee, itemType, openedMs);
    var haveTraining = !!sigs[DUAL_ROLE_TRAINING_V19];
    var haveMedical  = !!sigs[DUAL_ROLE_MEDICAL_V19];

    if (haveTraining && haveMedical) {
      if (qRow > 0) {
        var q = S.getSheetByName(TAB.QUEUE);
        q.getRange(qRow, 6).setValue(decision);
        q.getRange(qRow, 7).setValue('Training + Medical Director');
        q.getRange(qRow, 8).setValue(new Date());
      }
      var t = sigs[DUAL_ROLE_TRAINING_V19], m = sigs[DUAL_ROLE_MEDICAL_V19];
      var body =
        'PARAMEDIC RELEASE : BOTH AUTHORISATIONS ON FILE\n\n' +
        'Trainee: ' + trainee + '  (' + DUAL_SIGNOFF_LEVEL_V19 + ', ' + phaseNow + ')\n\n' +
        DUAL_ROLE_TRAINING_V19 + '\n' +
        '   filed by: ' + t.by + '\n   decision: ' + t.decision + '\n   rationale: ' + t.rationale + '\n\n' +
        DUAL_ROLE_MEDICAL_V19 + '\n' +
        '   filed by: ' + m.by + '\n   decision: ' + m.decision + '\n   rationale: ' + m.rationale + '\n\n' +
        'The Decision Queue item is closed. Both authorisations are permanently\n' +
        'recorded as separate rows on 16 DECISIONS RAW.\n\n' +
        'DO THIS NOW: set Program Status on 01 TRAINEE MASTER to Cleared to\n' +
        'Independent Practice, then archive the trainee from the SCEMS menu.';
      sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.MD_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
        'Paramedic Release Authorised : ' + trainee, body);
      systemLog_('INFO', 'PARAMEDIC RELEASE : DUAL SIGN-OFF COMPLETE', trainee);
      return;
    }

    var missingRole = haveTraining ? DUAL_ROLE_MEDICAL_V19 : DUAL_ROLE_TRAINING_V19;
    var missingMail = haveTraining ? CONFIG.MD_EMAIL : CONFIG.TCO_EMAIL;
    if (qRow > 0) {
      S.getSheetByName(TAB.QUEUE).getRange(qRow, 7).setValue('AWAITING ' + missingRole.toUpperCase());
    }

    var link = '';
    try {
      var f = getStoredFormV19_('SCEMS Training Decision Record');
      if (f) link = f.getPublishedUrl();
    } catch (e) {}

    sendMail(missingMail + ',' + CONFIG.TCO_EMAIL,
      'ACTION REQUIRED : Paramedic Release Needs Your Authorisation : ' + trainee,
      'A paramedic release decision has been filed and is waiting on you.\n\n' +
      'Trainee: ' + trainee + '  (' + DUAL_SIGNOFF_LEVEL_V19 + ', ' + phaseNow + ')\n' +
      'Already filed by: ' + filedBy + ' (' + role + ')\n' +
      'Their decision: ' + decision + '\n' +
      'Their rationale: ' + String(v[6] || '') + '\n\n' +
      'Releasing a paramedic to independent practice requires both the ' +
      DUAL_ROLE_TRAINING_V19 + ' and the ' + DUAL_ROLE_MEDICAL_V19 + '.\n' +
      'The 72-hour queue item stays open until you file.\n\n' +
      'File your decision here:\n' + (link || 'Decision Record form, link on tab 00 QUICK LINKS') +
      '\n\nSelect Item type: Advancement review. Select your role. Your rationale\n' +
      'is recorded permanently and separately from theirs.');

    systemLog_('WARN', 'PARAMEDIC RELEASE : AWAITING SECOND SIGNATURE',
      trainee + ' | have ' + role + ' | need ' + missingRole);
    return;
  }

  // ---------- everything else, unchanged behaviour ----------
  var closed = false;
  if (qRow > 0) {
    var q2 = S.getSheetByName(TAB.QUEUE);
    q2.getRange(qRow, 6).setValue(decision);
    q2.getRange(qRow, 7).setValue(role);
    q2.getRange(qRow, 8).setValue(new Date());
    closed = true;
  }

  var doNow = (itemType === 'Advancement review' && decision === 'Approved')
    ? '\n\nDO THIS NOW: update Current Phase for ' + trainee + ' on 01 TRAINEE MASTER. ' +
      'Set the new Phase Start Date in column J while you are there. The daily check alarms after 48 hours if the phase has not moved.'
    : '';

  var body2 =
    'Decision filed by ' + filedBy + ' (' + role + ')\n' +
    'Trainee: ' + trainee + '\nItem: ' + itemType + '\nDecision: ' + decision +
    '\nEffective: ' + v[7] + '\nRationale: ' + v[6] + '\n\n' +
    (closed ? 'Matching Decision Queue item CLOSED automatically. The 72-hour clock on it has stopped.'
            : (key ? 'NOTE: no matching open queue item was found for this trainee and type. The decision is recorded on 16 DECISIONS RAW; check tab 12 by hand.'
                   : 'Recorded on 16 DECISIONS RAW. This item type does not map to the Decision Queue.')) + doNow;
  sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
    'Decision Recorded : ' + trainee + ' : ' + itemType + ' : ' + decision, body2);
}

/* ---- ported from zz (effective winner) ---- */
/** Override. The weekly roll-up, in the house style. */
function weeklyRollup() {
  var master = ss().getSheetByName(TAB.MASTER);
  if (!master) return 'Trainee Master not found.';

  var names = [];
  master.getRange(5, 1, 40, 10).getValues().forEach(function (r) {
    var n = String(r[0] || '').trim();
    if (n && n.indexOf('EXAMPLE') !== 0) names.push(n);
  });

  var GOLD = '#c9a227', MUTE = '#847d6d';
  var week = Utilities.formatDate(new Date(), 'America/New_York', 'MMMM d, yyyy');

  var attention = 0;
  var cards = names.map(function (n) {
    var f = snapshotFactsV19_(n);
    f.progress = progressLineV19_(n);
    if (f.overdue) attention++;
    return rollupCardV19_(f);
  });

  var h = [];
  h.push('<div style="background:#f7f3ea;padding:24px 16px;font-family:Arial,sans-serif;">');
  h.push('<div style="max-width:660px;margin:0 auto;">');
  h.push(emailBannerV19_('SUMTER COUNTY EMS', 'WEEKLY TRAINEE STATUS', '',
    'Week of ' + week + '&nbsp; &middot; &nbsp;' + names.length +
    ' active trainee' + (names.length === 1 ? '' : 's') +
    (attention ? '&nbsp; &middot; &nbsp;<span style="color:#e8836f;">' + attention +
      ' needing attention</span>' : '&nbsp; &middot; &nbsp;none needing attention'),
    true));

  h.push('<div style="background:#f7f3ea;padding:18px 4px 4px 4px;">');
  h.push(cards.join(''));

  h.push('<div style="border-top:1px solid #e8e4da;margin:8px 4px 0 4px;padding:16px 0 0 0;' +
    'font:11.5px Arial,sans-serif;color:' + MUTE + ';line-height:1.65;">' +
    '<b style="color:#8a6a1f;">On shift progress.</b> The minimum shift count is a ' +
    'floor, not a finish line. Meeting it makes a trainee eligible to be assessed ' +
    'for advancement; it does not advance them. Advancement is earned by ' +
    'demonstrated competency and is never granted by time served, so no completion ' +
    'date is projected here.<br><br>' +
    'Full detail on any trainee is available on request, usually within a minute.' +
    '</div>');
  h.push('</div></div></div>');

  var to = [CONFIG.TCO_EMAIL, CONFIG.CHIEF_EMAIL, CONFIG.ACHIEF_EMAIL]
    .filter(function (a) { return a; }).join(',');
  var actual = isTestMode_() ? CONFIG.TEST_INBOX : to;

  var opts = { to: actual, subject: 'Weekly Trainee Status : Week of ' + week,
               htmlBody: h.join(''), name: 'SCEMS Field Training' };
  var blob = badgeBlobV19_();
  if (blob) opts.inlineImages = { scemsbadge: blob };
  MailApp.sendEmail(opts);

  var msg = 'Weekly roll-up sent to ' + actual + ', ' + names.length + ' trainee(s).';
  Logger.log(msg);
  systemLog_('INFO', 'WEEKLY ROLLUP', names.length + ' trainee(s)');
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function modernHome() {
  var S = ss();
  var old = S.getSheetByName('HOME');
  if (old) {
    var safety = S.getSheetByName(TAB.MASTER) || S.getSheets().filter(function (sh) {
      return sh.getName() !== 'HOME';
    })[0];
    if (safety) {
      try { safety.showSheet(); } catch (e) {}
      S.setActiveSheet(safety);
    }
    old.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (String(p.getDescription() || '').indexOf('SCEMS Field Training') === 0) p.remove();
    });
    S.deleteSheet(old);
  }
  var h = S.insertSheet('HOME', 0);
  var INK = '#1d1b18', GOLD = '#c9a227', GOLDDK = '#8a6a1f',
      PAPER = '#fbfaf7', MUTE = '#847d6d', HAIR = '#e8e4da';
  var E = "'" + TAB.ENGINE + "'", AU = "'13 AUDIT - EXCEPTION LOG'",
      DQ = "'" + TAB.QUEUE + "'", SQ = "'" + TAB.SKILL_VALIDATION + "'",
      C0 = "'" + TAB.CONTROL + "'", E2 = "'" + TAB.EVAL + "'";
  var OV = C0 + '!$B$5';

  h.setHiddenGridlines(true);
  h.setTabColor(GOLD);
  h.getRange('A1:M75').setBackground(PAPER).setFontFamily('Inter').setFontColor(INK);
  h.getRange('A1:M4').setBackground(INK);
  h.getRange('A5:M5').setBackground(GOLD);
  h.setColumnWidth(1, 68);
  h.setColumnWidth(2, 180);
  h.setColumnWidth(3, 110);
  h.setColumnWidth(4, 125);
  h.setColumnWidth(5, 115);
  h.setColumnWidth(6, 105);
  h.setColumnWidth(7, 225);
  h.setColumnWidth(8, 340);
  h.setColumnWidth(9, 18);
  h.setColumnWidth(10, 18);
  h.setColumnWidth(11, 105);
  h.setColumnWidth(12, 90);
  h.setColumnWidth(13, 30);
  h.setRowHeight(1, 34); h.setRowHeight(2, 30); h.setRowHeight(3, 22);
  h.setRowHeight(4, 10); h.setRowHeight(5, 6);

  h.getRange('B1').setValue('SUMTER COUNTY EMS')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(10)
    .setFontColor(GOLD).setVerticalAlignment('bottom');
  h.getRange('B2').setValue('FIELD TRAINING')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(24)
    .setFontColor('#f7f3ea').setVerticalAlignment('middle');
  h.getRange('H2:J2').merge()
    .setFormula('=TEXT(NOW(),"ddd  -  MM/dd/yyyy  -  h:mm AM/PM")')
    .setFontFamily('Oswald').setFontSize(10).setFontColor('#b4ac9c')
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  h.getRange('H3:J3').merge().setValue('LAST FORM RECEIVED : none yet')
    .setFontSize(8).setFontColor('#b4ac9c').setHorizontalAlignment('right');
  h.getRange('K2').setValue('MENU')
    .setBackground(GOLD).setFontColor(INK).setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(14).setHorizontalAlignment('center').setVerticalAlignment('middle');
  h.getRange('K3').insertCheckboxes().setHorizontalAlignment('center');
  h.getRange('L2').setValue('or tick the box').setFontSize(8).setFontColor('#b4ac9c');

  var cards = [
    [2, 'ACTIVE TRAINEES', '=COUNTIF(' + E + '!$A$5:$A$44,"?*")'],
    [4, 'NEEDS ACTION',
      '=COUNTIFS(' + E + '!$I$5:$I$44,">"&' + OV + ',' + E + '!$A$5:$A$44,"?*",' + E + '!$V$5:$V$44,"<>SNOOZED")' +
      '+COUNTIF(' + E + '!$R$5:$R$44,"*Due*")' +
      '+COUNTIF(' + AU + '!$B$5:$G$44,"FLAG")' +
      '+COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")' +
      '+COUNTIFS(' + SQ + '!$B$5:$B$2000,"<>",' + SQ + '!$L$5:$L$2000,"OPEN")'],
    [6, 'EVALS LAST 7 DAYS', '=COUNTIFS(' + E2 + '!$A$5:$A$1000,">="&TODAY()-7)'],
    [8, 'OPEN DECISIONS', '=COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")']
  ];
  h.setRowHeight(6, 12); h.setRowHeight(7, 46); h.setRowHeight(8, 20);
  cards.forEach(function (card) {
    h.getRange(7, card[0], 1, 2).merge().setFormula(card[2])
      .setBackground('#ffffff').setFontFamily('Oswald').setFontWeight('bold')
      .setFontSize(26).setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, false, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(8, card[0], 1, 2).merge().setValue(card[1])
      .setBackground('#ffffff').setFontFamily('Oswald').setFontSize(8).setFontColor(MUTE)
      .setHorizontalAlignment('center').setVerticalAlignment('top')
      .setBorder(false, true, true, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
  });

  h.setRowHeight(9, 14); h.setRowHeight(10, 22);
  h.getRange('B10:G10').merge().setValue('ACTION ITEMS')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(11).setFontColor(GOLDDK)
    .setVerticalAlignment('bottom');
  h.getRange('H10:J10').merge().setValue('SEND REMINDERS')
    .setFontSize(8).setFontColor(MUTE).setHorizontalAlignment('right').setVerticalAlignment('bottom');
  h.getRange('K10').insertCheckboxes().setHorizontalAlignment('center');

  var sec = function (label, listF, countF) {
    return 'IF(' + countF + '=0,"","' + label + '"&CHAR(10)&' + listF + '&CHAR(10))';
  };
  var ovCount = 'COUNTIFS(' + E + '!$I$5:$I$44,">"&' + OV + ',' + E + '!$A$5:$A$44,"?*",' + E + '!$V$5:$V$44,"<>SNOOZED")';
  var ovList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + E + '!$A$5:$A$44&"  :  "&' + E + '!$I$5:$I$44&" days overdue  (FTO "&' + E + '!$D$5:$D$44&")",(' + E + '!$I$5:$I$44>' + OV + ')*(' + E + '!$A$5:$A$44<>"")*(' + E + '!$V$5:$V$44<>"SNOOZED")))';
  var rvCount = 'COUNTIF(' + E + '!$R$5:$R$44,"*Due*")';
  var rvList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + E + '!$A$5:$A$44&"  :  "&' + E + '!$R$5:$R$44,ISNUMBER(SEARCH("Due",' + E + '!$R$5:$R$44))))';
  var flCount = 'COUNTIF(' + AU + '!$B$5:$G$44,"FLAG")';
  var flList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + AU + '!$A$5:$A$44&"  :  "&MMULT(--(' + AU + '!$B$5:$G$44="FLAG"),SEQUENCE(6,1,1,0))&" flag(s)  (review on Audit)",MMULT(--(' + AU + '!$B$5:$G$44="FLAG"),SEQUENCE(6,1,1,0))>0))';
  var dqCount = 'COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")';
  var dqList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + DQ + '!$B$5:$B$300&"  :  "&' + DQ + '!$C$5:$C$300&"  (file on Decision Record form)",(' + DQ + '!$B$5:$B$300<>"")*(' + DQ + '!$F$5:$F$300="")))';
  var sqCount = 'COUNTIFS(' + SQ + '!$B$5:$B$2000,"<>",' + SQ + '!$L$5:$L$2000,"OPEN")';
  var sqList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + SQ + '!$B$5:$B$2000&"  :  "&' + SQ + '!$E$5:$E$2000&"  (review on Skill Validation Queue)",(' + SQ + '!$B$5:$B$2000<>"")*(' + SQ + '!$L$5:$L$2000="OPEN")))';
  h.getRange(11, 2, 4, 10).merge().setFormula(
    '=IF(' + ovCount + '+' + rvCount + '+' + flCount + '+' + dqCount + '+' + sqCount + '=0,' +
    '"ALL CLEAR. Nothing needs you right now.",' +
    'IFERROR(' + sec('OVERDUE EVALUATIONS', ovList, ovCount) + '&' +
    sec('REVIEWS DUE : 72 HOUR WINDOW', rvList, rvCount) + '&' +
    sec('AUDIT FLAGS', flList, flCount) + '&' +
    sec('OPEN DECISIONS', dqList, dqCount) + '&' +
    sec('SKILLS READY FOR VALIDATION', sqList, sqCount) + ',"See the Audit and Queue tabs."))')
    .setBackground('#ffffff').setFontSize(10).setWrap(true).setVerticalAlignment('top')
    .setBorder(true, true, true, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
  for (var rr = 11; rr <= 14; rr++) h.setRowHeight(rr, 28);

  function nav(row, col, label, sheetName) {
    var target = S.getSheetByName(sheetName);
    if (!target) return;
    h.getRange(row, col, 1, 2).merge()
      .setFormula('=HYPERLINK("#gid=' + target.getSheetId() + '","' + label + '")')
      .setBackground(INK).setFontColor('#f7f3ea').setFontFamily('Oswald')
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  h.setRowHeight(15, 12); h.setRowHeight(16, 30); h.setRowHeight(17, 8); h.setRowHeight(18, 30);
  nav(16, 2, 'TRAINEE MASTER', TAB.MASTER);
  nav(16, 4, 'SKILLS', TAB.SKILLS);
  nav(16, 6, 'DECISION QUEUE', TAB.QUEUE);
  nav(16, 8, 'AUDIT / FLAGS', '13 AUDIT - EXCEPTION LOG');
  nav(18, 2, 'ANALYTICS', '14 ANALYTICS');
  nav(18, 4, 'MISSION CONTROL', TAB.CONTROL);
  nav(18, 6, 'SHIFT EVALS', TAB.EVAL);
  nav(18, 8, 'URGENT CONCERNS', TAB.URGENT);
  h.getRange('B20:H20').merge().setValue('One click opens a core page. All forms, reports, and tools are behind MENU.')
    .setFontSize(8).setFontStyle('italic').setFontColor(MUTE);
  for (var spacer = 21; spacer <= 28; spacer++) h.setRowHeight(spacer, 8);

  h.setConditionalFormatRules([]);
  installRosterBoard();
  try {
    var badge = Utilities.newBlob(Utilities.base64Decode(BADGE_B64), 'image/png', 'scems_badge.png');
    h.insertImage(badge, 1, 1, 8, 6).setWidth(58).setHeight(65);
  } catch (e) {}
  S.setActiveSheet(h);
  S.moveActiveSheet(1);
  systemLog_('INFO', 'HOME REBUILT', 'Atomic replacement completed; roster board is unmerged.');
}

/* ---- ported from zz (effective winner) ---- */
function installRosterBoard() {
  var S = ss();
  var h = S.getSheetByName('HOME');
  if (!h) return;
  var INKC = '#1d1b18', HAIR = '#e8e4da', HEAD_BG = '#faf8f2';
  var E = "'" + TAB.ENGINE + "'", V9 = "'09 TRAINEE VIEW'", C0 = "'" + TAB.CONTROL + "'";
  var OV = C0 + '!$B$5';

  h.getRange('A29:M75').getMergedRanges().forEach(function (r) { r.breakApart(); });
  h.getRange(29, 2, 42, 7).clearContent().clearFormat().clearDataValidations();
  h.getRange(29, 2, 1, 7).setBackground(INKC);
  h.getRange('B29').setValue('ORIENTATION BOARD : ALL ACTIVE TRAINEES')
    .setFontColor('#c9a227').setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(12).setVerticalAlignment('middle');
  h.setRowHeight(29, 30);
  h.getRange(30, 2, 1, 7).setValues([[
    'TRAINEE','LEVEL','PHASE','SHIFT PROGRESS','LAST EVAL','LAST SHIFT FOCUS','WHAT IS NEEDED NEXT'
  ]]).setBackground(HEAD_BG).setFontColor(INKC).setFontFamily('Oswald')
    .setFontWeight('bold').setFontSize(9)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  h.setRowHeight(30, 24);

  for (var i = 0; i < 40; i++) {
    var er = 5 + i, br = 31 + i;
    var A = E + '!$A$' + er;
    h.getRange(br, 2, 1, 7).setBackground('#ffffff')
      .setBorder(false, false, false, false, false, true, HAIR, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(br, 2).setFormula('=IF(' + A + '="","",' + A + ')')
      .setFontWeight('bold').setFontSize(10);
    h.getRange(br, 3).setFormula('=IF(' + A + '="","",' + E + '!$B$' + er + ')').setFontSize(9);
    h.getRange(br, 4).setFormula(
      '=IF(' + A + '="","",' + E + '!$E$' + er + '&IF(' + E + '!$U$' + er + '=""," : start date needed"," : day "&' + E + '!$U$' + er + '))')
      .setFontSize(9);
    h.getRange(br, 5).setFormula(
      '=IF(' + A + '="","",IFERROR(REGEXREPLACE(' + E + '!$T$' + er + ',"^(Met|Short) : ","")&" shifts","not set"))')
      .setFontSize(9);
    h.getRange(br, 6).setFormula(
      '=IF(' + A + '="","",IF(' + E + '!$I$' + er + '="","none yet",' + E + '!$I$' + er + '&" day(s) ago"))')
      .setFontSize(9);
    h.getRange(br, 7).setFormula(
      '=IF(' + A + '="","",IF(' + V9 + '!$I$' + er + '="","set with FTO",' + V9 + '!$I$' + er + '))')
      .setFontSize(9).setWrap(true);
    h.getRange(br, 8).setFormula(
      '=IF(' + A + '="","",' +
      'IF(AND(' + E + '!$I$' + er + '<>"",' + E + '!$I$' + er + '>' + OV + '),"SHIFT EVALUATION NEEDED : "&' + E + '!$I$' + er + '&" days",' +
      'IF(ISNUMBER(SEARCH("NRT",' + E + '!$R$' + er + ')),"NRT DECISION PENDING",' +
      'IF(ISNUMBER(SEARCH("Advancement",' + E + '!$R$' + er + ')),"ADVANCEMENT REVIEW IN PROGRESS : 72h",' +
      'IF(AND(LEFT(' + E + '!$T$' + er + ',3)="Met",' + E + '!$E$' + er + '="Phase 4"),"RECOMMENDED FOR RELEASE REVIEW",' +
      'IF(LEFT(' + E + '!$T$' + er + ',3)="Met","MINIMUM SHIFTS MET : ELIGIBLE TO ADVANCE",' +
      '"ON TRACK"))))))')
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9);
    h.setRowHeight(br, 28);
  }
  h.getRange(31, 2, 40, 7).setVerticalAlignment('middle');
}

/* ---- ported from zz (effective winner) ---- */
function readLegacyRosterV19_() {
  var sh = ss().getSheetByName(TAB.CONTROL);
  if (!sh) return [];
  var lastRow = Math.min(sh.getLastRow(), 60);
  var lastCol = Math.min(sh.getLastColumn(), 14);
  if (lastRow < 2 || lastCol < 6) return [];
  var grid = sh.getRange(1, 1, lastRow, lastCol).getValues();

  // find the header row and the column the names sit in
  var hRow = -1, nameCol = -1;
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid[r].length; c++) {
      if (String(grid[r][c]).trim().toUpperCase() === 'FTO NAME') {
        hRow = r; nameCol = c; break;
      }
    }
    if (hRow >= 0) break;
  }
  if (hRow < 0) return [];

  // map the headers to the right of the name
  var cols = {};
  for (var c2 = nameCol; c2 < grid[hRow].length; c2++) {
    var h = String(grid[hRow][c2]).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!h) continue;
    if (h === 'FTO NAME' && cols.name === undefined) cols.name = c2;
    else if (h === 'SHIFT' && cols.shift === undefined) cols.shift = c2;
    else if (h === 'SHIFT') cols.shift2 = c2;
    else if (h === 'CERT LEVEL') cols.level = c2;
    else if (h === 'TRAINS EMT') cols.emt = c2;
    else if (h === 'TRAINS AEMT') cols.aemt = c2;
    else if (h.indexOf('TRAINS PARAMEDIC') === 0) cols.medic = c2;
  }

  var out = [];
  for (var r2 = hRow + 1; r2 < grid.length; r2++) {
    var name = String(grid[r2][cols.name] || '').trim();
    if (!name) continue;
    var shift = String(grid[r2][cols.shift] || '').trim();
    if (!shift && cols.shift2 !== undefined) shift = String(grid[r2][cols.shift2] || '').trim();
    out.push({
      sourceRow: r2 + 1,
      name: name,
      shift: shift,
      level: String(grid[r2][cols.level] || '').trim(),
      emt: String(grid[r2][cols.emt] || '').trim(),
      aemt: String(grid[r2][cols.aemt] || '').trim(),
      medic: String(grid[r2][cols.medic] || '').trim()
    });
  }
  out._cols = cols;
  out._headerRow = hRow + 1;
  return out;
}

/* ---- ported from zz (effective winner) ---- */
/** Writes the panel to HOME as coloured rows. */
function refreshActionPanelV19() {
  var S = ss();
  var h = S.getSheetByName('HOME');
  if (!h) return 'HOME not found.';

  var first = PANEL_FIRST_ROW_V19, n = PANEL_ROWS_V19;
  var area = h.getRange(first, 2, n, 10);
  area.getMergedRanges().forEach(function (r) { r.breakApart(); });
  area.clearContent().clearFormat();

  var items = collectActionItemsV19_();
  var shown = items.slice(0, n - (items.length > n ? 1 : 0));

  if (!items.length) {
    h.getRange(first, 2, 1, 2).merge().setValue('ALL CLEAR')
      .setBackground(SEV_V19.CLEAR.bg).setFontColor(SEV_V19.CLEAR.fg)
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(first, 4, 1, 7).merge()
      .setValue('Nothing needs you right now.')
      .setFontFamily('Inter').setFontSize(10).setFontColor('#847d6d')
      .setVerticalAlignment('middle');
    h.setRowHeight(first, 26);
    for (var e = first + 1; e < first + n; e++) h.setRowHeight(e, 4);
  } else {
    shown.forEach(function (it, i) {
      var row = first + i;
      var s = SEV_V19[it.sev] || SEV_V19.DUE;

      h.getRange(row, 2, 1, 2).merge().setValue(it.sev)
        .setBackground(s.bg).setFontColor(s.fg)
        .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');

      h.getRange(row, 4).setValue(it.who)
        .setFontFamily('Inter').setFontWeight('bold').setFontSize(10)
        .setFontColor('#1d1b18').setVerticalAlignment('middle');

      h.getRange(row, 5, 1, 2).merge().setValue(it.detail)
        .setFontFamily('Inter').setFontSize(9.5).setFontColor('#4a453c')
        .setVerticalAlignment('middle');

      h.getRange(row, 7, 1, 2).merge().setValue(it.owner)
        .setFontFamily('Inter').setFontSize(9).setFontColor('#847d6d')
        .setVerticalAlignment('middle');

      h.getRange(row, 9, 1, 2).merge().setValue(it.action)
        .setFontFamily('Inter').setFontSize(9).setFontColor('#847d6d')
        .setFontStyle('italic').setVerticalAlignment('middle');

      h.setRowHeight(row, 24);
    });

    if (items.length > shown.length) {
      var more = first + shown.length;
      h.getRange(more, 2, 1, 9).merge()
        .setValue('and ' + (items.length - shown.length) +
                  ' more. Open the tab for the full list.')
        .setFontFamily('Inter').setFontSize(9).setFontStyle('italic')
        .setFontColor('#847d6d');
      h.setRowHeight(more, 20);
    }
    for (var b = first + shown.length + (items.length > shown.length ? 1 : 0);
         b < first + n; b++) h.setRowHeight(b, 4);
  }

  // the tile above should agree with the panel
  try {
    h.getRange(7, 4, 1, 2).setValue(items.length);
  } catch (e) {}

  // the old footnote pointed at a button that no longer exists
  try {
    h.getRange('B20:H20').merge()
      .setValue('One click opens a core page. Everything else is on the SCEMS menu above.')
      .setFontSize(8).setFontStyle('italic').setFontColor('#847d6d');
  } catch (e) {}

  SpreadsheetApp.flush();
  var msg = 'Action panel rebuilt. ' + items.length + ' item(s).';
  Logger.log(msg + '\n' + items.map(function (i) {
    return '   ' + i.sev.padEnd(12) + i.who + '  :  ' + i.detail;
  }).join('\n'));
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function tidyForOperationsV19() {
  var S = ss();
  var shown = [], hidden = 0;
  S.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (OPERATIONAL_TABS_V19.indexOf(n) >= 0) {
      try { sh.showSheet(); shown.push(n); } catch (e) {}
    } else {
      try { sh.hideSheet(); hidden++; } catch (e) {}
    }
  });
  var home = S.getSheetByName('HOME');
  if (home) { try { S.setActiveSheet(home); S.moveActiveSheet(1); } catch (e) {} }

  var msg = 'Visible tabs: ' + shown.length + '\n  ' + shown.join('\n  ') +
    '\n\nHidden: ' + hidden + '. Nothing deleted, everything still receiving data.' +
    '\n\nshowAllTabsV19() brings them all back when you are working on the system.';
  Logger.log(msg);
  systemLog_('INFO', 'OPERATIONAL TAB SET', shown.length + ' visible, ' + hidden + ' hidden');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Unhides everything. For when you are working on the system yourself. */
function showAllTabsV19() {
  var S = ss(), n = 0;
  S.getSheets().forEach(function (sh) {
    try { if (sh.isSheetHidden()) { sh.showSheet(); n++; } } catch (e) {}
  });
  var msg = 'All tabs visible again. Unhidden: ' + n +
    '\n\nRun tidyForOperationsV19() to go back to the five working tabs.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function refreshTraineeSkillsViewV19(name, view) {
  var S = ss();
  var sh = S.getSheetByName(TAB.TRAINEE_SKILLS);
  if (!sh) return;

  var body = sh.getRange(6, 1, sh.getMaxRows() - 5, 8);
  body.getMergedRanges().forEach(function (r) { r.breakApart(); });
  body.clearContent().clearFormat().clearDataValidations();

  name = String(name || '').trim();
  view = String(view || '').trim() || TRAINEE_VIEWS_V19[0];

  if (!name) {
    sh.getRange('B6').setValue('Pick a trainee above.')
      .setFontFamily('Inter').setFontSize(11).setFontColor(TV.MUTE);
    return;
  }

  var rec = traineeRecordV19_(name) || {};
  var row = 6;

  sh.getRange(row, 2, 1, 7).merge()
    .setValue(name + '   ' + (rec.level || 'level not set') + '   ' +
              (rec.phase || 'phase not set') + '   FTO ' + (rec.fto || 'unassigned'))
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(14)
    .setFontColor(TV.INK).setVerticalAlignment('middle');
  sh.setRowHeight(row, 28);
  row += 2;

  if (view === 'Skills completed')      viewSkillsCompletedV19_(sh, name, row);
  else if (view === 'Skills remaining') viewSkillsRemainingV19_(sh, name, rec, row);
  else if (view === 'Skills by phase')  viewSkillsByPhaseV19_(sh, name, row);
  else if (view === 'Recent activity')  viewActivityV19_(sh, name, row);
  else                                  viewOverviewV19_(sh, name, rec, row);
}

/* ---- ported from zz (effective winner) ---- */
function buildTraineeSkillsViewV19() {
  var S = ss();
  var sh = S.getSheetByName(TAB.TRAINEE_SKILLS);
  if (!sh) sh = S.insertSheet(TAB.TRAINEE_SKILLS);
  sh.clear();
  sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  if (sh.getMaxRows() < 300) sh.insertRowsAfter(sh.getMaxRows(), 300 - sh.getMaxRows());
  if (sh.getMaxColumns() > 8) sh.deleteColumns(9, sh.getMaxColumns() - 8);
  if (sh.getMaxColumns() < 8) sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());

  sh.setHiddenGridlines(true);
  sh.setTabColor('#5b8266');

  sh.getRange(1, 1, 2, 8).setBackground(TV.INK).setFontFamily('Inter');
  sh.getRange('B1').setValue('TRAINEE RECORD')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18)
    .setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.getRange('B2').setValue('Pick a trainee and a view. Everything below updates on its own.')
    .setFontSize(9).setFontColor(TV.GOLD).setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22); sh.setRowHeight(3, 10);

  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(BADGE_B64), 'image/png', 'badge.png');
    sh.insertImage(blob, 1, 1, 6, 5).setWidth(56).setHeight(62);
  } catch (e) {}

  sh.getRange('B4').setValue('TRAINEE')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setFontColor(TV.GOLDD).setVerticalAlignment('middle');
  sh.getRange('C4').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([''].concat(traineeList()), true)
      .setAllowInvalid(false).build())
    .setBackground('#fff7dc').setFontFamily('Inter').setFontWeight('bold')
    .setFontSize(12).setVerticalAlignment('middle');

  sh.getRange('D4').setValue('SHOW ME')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setFontColor(TV.GOLDD).setHorizontalAlignment('right')
    .setVerticalAlignment('middle');
  sh.getRange('E4').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(TRAINEE_VIEWS_V19, true)
      .setAllowInvalid(false).build())
    .setValue(TRAINEE_VIEWS_V19[0])
    .setBackground('#fff7dc').setFontFamily('Inter').setFontWeight('bold')
    .setFontSize(11).setVerticalAlignment('middle');
  sh.setRowHeight(4, 30);

  [68, 130, 300, 130, 175, 110, 150, 300].forEach(function (w, i) {
    sh.setColumnWidth(i + 1, w);
  });
  sh.setFrozenRows(4);
  SpreadsheetApp.flush();

  refreshTraineeSkillsViewV19(String(sh.getRange('C4').getValue() || ''),
                             String(sh.getRange('E4').getValue() || ''));

  var msg = TAB.TRAINEE_SKILLS + ' rebuilt with a view selector.\n\n' +
    'C4 picks the trainee. E4 picks the view:\n' +
    TRAINEE_VIEWS_V19.map(function (v) { return '   ' + v; }).join('\n') +
    '\n\nChange either and the page redraws.';
  Logger.log(msg);
  systemLog_('INFO', 'TRAINEE PAGE BUILT', TRAINEE_VIEWS_V19.length + ' views');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Fired when a trainee name appears on tab 01. Throttled and locked. */
function syncNewTraineeV19_(name) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('ROSTER_SYNC_AT') || 0);
  if (new Date().getTime() - last < 20000) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    props.setProperty('ROSTER_SYNC_AT', String(new Date().getTime()));
    var notes = [];

    try { refreshDropdowns(); notes.push('form dropdowns refreshed'); }
    catch (e) { notes.push('dropdown refresh failed: ' + e); }

    try { rebuildSkillMatrixV19_(); notes.push('skill matrix built'); }
    catch (e) { notes.push('skill matrix failed: ' + e); }

    var rec = traineeRecordV19_(name);
    var gaps = [];
    if (rec) {
      if (!rec.level) gaps.push('certification level');
      if (!rec.fto)   gaps.push('assigned FTO');
      if (!rec.phase) gaps.push('current phase');
      if (!rec.email) gaps.push('email address, so no Monday status card');
    }

    systemLog_('INFO', 'ROSTER SYNC', name + ' : ' + notes.join('; ') +
      (gaps.length ? ' | still needs: ' + gaps.join(', ') : ''));

    try {
      ss().toast(name + ' added. Forms and skills updated.' +
        (gaps.length ? ' Still needs: ' + gaps.join(', ') + '.' : ''), 'SCEMS', 8);
    } catch (t) {}

    if (gaps.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Trainee Added : ' + name + ' : Record Incomplete',
        name + ' was added to 01 TRAINEE MASTER and the forms have been updated.\n\n' +
        'The following are still blank and the record is not fully usable until they are filled:\n  - ' +
        gaps.join('\n  - ') +
        '\n\nA missing certification level means no skill checklist is built. A missing ' +
        'email means no weekly status card.');
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---- ported from zz (effective winner) ---- */
function badgeUriV19_() {
  return 'data:image/png;base64,' + BADGE_B64;
}

/* ---- ported from zz (effective winner) ---- */
/** The badge, as an inline image blob. */
function badgeBlobV19_() {
  try {
    return Utilities.newBlob(Utilities.base64Decode(BADGE_B64),
                             'image/png', 'scems_badge.png');
  } catch (e) { return null; }
}

/* ---- ported from zz (effective winner) ---- */
/** Shared dark banner with the badge. */
function emailBannerV19_(kicker, title, subtitle, meta, hasBadge) {
  var INK = '#1d1b18', GOLD = '#c9a227';
  var h = [];
  h.push('<div style="background:' + INK + ';padding:22px 24px 20px 24px;border-radius:8px 8px 0 0;">');
  h.push('<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>');
  if (hasBadge) {
    h.push('<td style="width:64px;vertical-align:top;padding:0 16px 0 0;">' +
      '<img src="cid:scemsbadge" width="56" style="display:block;width:56px;"></td>');
  }
  h.push('<td style="vertical-align:top;">');
  h.push('<div style="font:600 11px Arial,sans-serif;color:' + GOLD +
    ';letter-spacing:2px;margin:0 0 6px 0;">' + escHtmlV19_(kicker) + '</div>');
  h.push('<div style="font:700 25px Arial,sans-serif;color:#ffffff;line-height:1.1;">' +
    escHtmlV19_(title) + '</div>');
  if (subtitle) {
    h.push('<div style="font:700 17px Arial,sans-serif;color:' + GOLD +
      ';margin:4px 0 0 0;">' + escHtmlV19_(subtitle) + '</div>');
  }
  h.push('<div style="font:13px Arial,sans-serif;color:#b4ac9c;margin:12px 0 0 0;">' +
    meta + '</div>');
  h.push('</td></tr></table></div>');
  h.push('<div style="height:5px;background:' + GOLD + ';"></div>');
  return h.join('');
}

/* ---- ported from zz (effective winner) ---- */
/** The full handover email for one trainee. */
function handoverHtmlV19_(traineeName, requestedBy, reason) {
  var f = snapshotFactsV19_(traineeName);
  if (!f || !f.name) return null;
  var skills = handoverSkillsV19_(traineeName);
  var progress = progressLineV19_(traineeName);

  var INK = '#1d1b18', GOLD = '#c9a227', GOLDD = '#8a6a1f',
      RED = '#c43a28', GREEN = '#3f8f5a', MUTE = '#847d6d',
      HAIR = '#e8e4da', HAND = '#7d6a94';

  function panel(title, inner, accent) {
    return '<div style="background:#ffffff;border:1px solid ' + HAIR +
      ';border-left:5px solid ' + (accent || HAND) +
      ';border-radius:8px;padding:16px 20px;margin:0 0 12px 0;">' +
      '<div style="font:600 10px Arial,sans-serif;color:' + GOLDD +
      ';letter-spacing:1.6px;margin:0 0 10px 0;">' + escHtmlV19_(title) + '</div>' +
      inner + '</div>';
  }
  function skillList(arr, empty, colour) {
    if (!arr.length) {
      return '<div style="font:13px Arial,sans-serif;color:' + MUTE + ';">' +
        escHtmlV19_(empty) + '</div>';
    }
    return '<div style="font:13px Arial,sans-serif;color:#33302b;line-height:1.75;">' +
      arr.map(function (s) {
        return '<span style="color:' + colour + ';">&#9679;</span> ' + escHtmlV19_(s);
      }).join('<br>') + '</div>';
  }
  function badge(t, bg, fg) {
    if (!t) return '';
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font:600 11px Arial,sans-serif;padding:4px 10px;border-radius:11px;' +
      'margin:0 6px 0 0;">' + escHtmlV19_(t) + '</span>';
  }

  var h = [];
  h.push('<div style="background:#f7f3ea;padding:24px 16px;font-family:Arial,sans-serif;">');
  h.push('<div style="max-width:640px;margin:0 auto;">');
  h.push(emailBannerV19_('SUMTER COUNTY EMS', 'TRAINEE HANDOVER CARD',
    escHtmlV19_(traineeName),
    'Requested by ' + escHtmlV19_(requestedBy || 'you') +
    '&nbsp; &middot; &nbsp;' + escHtmlV19_(reason || 'covering a shift'),
    true));

  h.push('<div style="background:#f7f3ea;padding:18px 4px 4px 4px;">');

  // where they are
  var where = [];
  where.push('<div style="margin:0 0 12px 0;">' +
    badge(f.level, INK, '#ffffff') +
    badge(f.phase ? f.phase + ' of 4' : '', GOLD, INK) +
    badge(f.week, '#f1ede2', GOLDD) + '</div>');
  where.push('<table cellpadding="0" cellspacing="0" style="width:100%;font:13px Arial,sans-serif;">');
  where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
    ';white-space:nowrap;">Usual FTO</td><td style="color:#33302b;">' +
    escHtmlV19_(f.fto) + '</td></tr>');
  where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
    ';white-space:nowrap;">Shifts</td><td style="color:#33302b;">' +
    escHtmlV19_(progress) + '</td></tr>');
  if (f.evals > 0 && f.avg) {
    where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
      ';white-space:nowrap;">Scoring</td><td style="color:#33302b;">averaging <b>' +
      f.avg + ' / 5</b>' + (f.trend ? ', ' + escHtmlV19_(f.trend.toLowerCase()) : '') +
      '</td></tr>');
  }
  where.push('</table>');
  h.push(panel('WHERE THEY ARE', where.join(''), HAND));

  // what to work on
  var work = '<div style="font:14px Arial,sans-serif;color:#33302b;line-height:1.6;">' +
    (f.focus ? escHtmlV19_(f.focus)
             : '<span style="color:' + MUTE + ';">Not set. Agree a focus with them at the start of the shift.</span>') +
    '</div>';
  if (f.strength) {
    work += '<div style="margin:12px 0 0 0;padding:10px 12px;background:#f2f7f3;' +
      'border-radius:5px;font:13px Arial,sans-serif;color:#33302b;">' +
      '<b style="color:' + GREEN + ';">Doing well</b> &nbsp; ' +
      escHtmlV19_(f.strength) + '</div>';
  }
  h.push(panel('WHAT THEY ARE WORKING ON', work, GOLD));

  // skills
  var sk = [];
  sk.push('<div style="font:600 12px Arial,sans-serif;color:' + GREEN +
    ';margin:0 0 6px 0;">Signed off (' + skills.signed.length + ')</div>');
  sk.push(skillList(skills.signed, 'None signed off yet.', GREEN));
  sk.push('<div style="font:600 12px Arial,sans-serif;color:' + GOLDD +
    ';margin:16px 0 6px 0;">In progress (' + skills.progress.length + ')</div>');
  sk.push(skillList(skills.progress, 'Nothing recorded in progress.', GOLD));
  if (skills.ready.length) {
    sk.push('<div style="font:600 12px Arial,sans-serif;color:' + RED +
      ';margin:16px 0 6px 0;">Awaiting validation (' + skills.ready.length + ')</div>');
    sk.push(skillList(skills.ready, '', RED));
    sk.push('<div style="margin:8px 0 0 0;font:12px Arial,sans-serif;color:' + RED + ';">' +
      'These are with leadership. Do not sign them off yourself.</div>');
  }
  h.push(panel('SKILLS', sk.join(''), GREEN));

  // on shift
  var shift = '<div style="font:13px Arial,sans-serif;color:#33302b;line-height:1.65;">' +
    'Submit a Shift Evaluation before you go home, the same as their usual FTO would. ' +
    'Score what you actually saw. If a skill progressed, log it.<br><br>' +
    'You are covering, so you are not expected to judge their whole progression. ' +
    'Record the shift you had with them.<br><br>' +
    'Anything unsafe is a call to Division Chief Stuckey the same shift, then the ' +
    'Urgent Concern form.</div>' +
    '<div style="margin:12px 0 0 0;padding:10px 12px;background:#fdf3f1;' +
    'border-radius:5px;font:600 12px Arial,sans-serif;color:' + RED + ';">' +
    'No patient names, dates of birth, or addresses. Call numbers only.</div>';
  h.push(panel('ON SHIFT', shift, RED));

  h.push('<div style="border-top:1px solid ' + HAIR + ';margin:8px 4px 0 4px;' +
    'padding:16px 0 0 0;font:11.5px Arial,sans-serif;color:' + MUTE + ';line-height:1.6;">' +
    'This card is an operational snapshot. It does not carry concerns, decisions, ' +
    'audit flags, or another FTO\'s assessment of this trainee.<br><br>' +
    'Every request for a handover card is logged and notifies the Division Chief ' +
    'of Training.</div>');
  h.push('</div></div></div>');
  return h.join('');
}

/* ---- ported from zz (effective winner) ---- */
/** Skills, split by state, for one trainee. */
function handoverSkillsV19_(name) {
  var out = { signed: [], progress: [], ready: [] };
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return out;
  m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[0]).trim() !== String(name).trim()) return;
    var skill = String(r[1] || '');
    if (!skill) return;
    var readiness = String(r[6] || '');
    var signoff = String(r[7] || '');
    if (signoff === 'SIGNED OFF') out.signed.push(skill);
    else if (readiness === 'READY FOR VALIDATION') out.ready.push(skill);
    else if (readiness === 'IN PROGRESS') out.progress.push(skill);
  });
  return out;
}

/* ---- ported from zz (effective winner) ---- */
/** Reads the portal file raw and injects the badge whichever way it can.
 *  Returns an object so the checker can report what happened. */
function portalHtmlV19_() {
  var raw = '';
  try {
    raw = HtmlService.createHtmlOutputFromFile(PORTAL_FILE_V19).getContent();
  } catch (e) {
    return { ok: false, how: 'file not found', html: '', note: String(e) };
  }

  var uri = badgeUriV19_();
  var how = '';

  if (raw.indexOf('data:image/png;base64,') >= 0) {
    how = 'already contained a badge, left as is';
  } else if (/<\?=\s*badgeUri\s*\?>/.test(raw)) {
    raw = raw.replace(/<\?=\s*badgeUri\s*\?>/g, uri);
    how = 'template tag replaced';
  } else if (raw.indexOf('--badge:none; --badge-size:0px;') >= 0) {
    raw = raw.replace('--badge:none; --badge-size:0px;',
      '--badge:url("' + uri + '"); --badge-size:78px;');
    how = 'standalone placeholder replaced';
  } else if (raw.indexOf('--badge:none') >= 0) {
    raw = raw.replace(/--badge:\s*none\s*;/, '--badge:url("' + uri + '");')
             .replace(/--badge-size:\s*0px\s*;/, '--badge-size:78px;');
    how = 'loose placeholder replaced';
  } else {
    how = 'NO INJECTION POINT FOUND';
    return { ok: false, how: how, html: raw, note: 'The portal file has no badge slot.' };
  }

  return { ok: true, how: how, html: raw, note: '' };
}

/* [doGet : superseded by the v20.1 implementation in another file] */

/* ---- ported from zz (effective winner) ---- */
function portalUrlV19() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  var lines = ['FIELD TRAINING PORTAL'];
  if (url) {
    lines.push('');
    lines.push(url);
    lines.push('');
    lines.push('Sites: edit, Insert, Embed, By URL, paste that, Insert.');
    lines.push('Drag full width, about 760 pixels tall, then Publish.');
  } else {
    lines.push('');
    lines.push('Not deployed yet. Deploy, New deployment, gear icon,');
    lines.push('Web app, Execute as Me, Who has access Anyone, Deploy.');
  }
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Reports exactly what is in the portal file and what got injected. */
function checkPortalV19() {
  var lines = ['PORTAL PRE-DEPLOY CHECK'];
  var ok = true;

  var bytes = 0;
  try {
    bytes = Utilities.base64Decode(BADGE_B64).length;
    lines.push('badge decodes    : yes, ' + bytes + ' bytes');
  } catch (e) {
    ok = false;
    lines.push('badge decodes    : FAILED, ' + e);
  }

  var built = portalHtmlV19_();
  if (!built.ok) {
    ok = false;
    lines.push('portal file      : ' + built.how);
    if (built.note) lines.push('                   ' + built.note);
  } else {
    lines.push('portal file      : found');
    lines.push('badge injection  : ' + built.how);
    lines.push('page size        : ' + built.html.length + ' characters');
    var hasBadge = built.html.indexOf('data:image/png;base64,') >= 0;
    lines.push('badge embedded   : ' + (hasBadge ? 'yes' : 'NO'));
    if (!hasBadge) ok = false;
    var forms = built.html.split('docs.google.com/forms').length - 1;
    lines.push('form links found : ' + forms + ' of ' + PORTAL_CARDS.length);
    if (forms !== PORTAL_CARDS.length) ok = false;
    lines.push('watermark wired  : ' +
      (built.html.indexOf('background-image:var(--badge)') >= 0 ? 'yes' : 'no'));
  }

  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  lines.push('');
  if (url) {
    lines.push('Already deployed at:');
    lines.push('   ' + url);
    lines.push('');
    lines.push('You changed the code, so publish the change:');
    lines.push('Deploy, Manage deployments, pencil icon,');
    lines.push('Version: New version, Deploy.');
  } else {
    lines.push('Not deployed yet.');
    lines.push('Deploy, New deployment, gear icon, Web app,');
    lines.push('Execute as Me, Who has access Anyone, Deploy.');
  }

  lines.push('');
  lines.push(ok ? 'READY.' : 'NOT READY. Fix the items above.');

  var msg = lines.join('\n');
  Logger.log(msg);
  systemLog_(ok ? 'INFO' : 'WARN', 'PORTAL CHECK', built.how + '; ' + built.html.length + ' chars');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Matrix layout: title off the badge, SKILL ID column hidden. */
function applySkillsLayoutV19_() {
  var S = ss();
  var sh = S.getSheetByName(TAB.SKILLS);
  if (sh) {
    ensureSheetCapacityV19_(sh, 3000, 23);
    sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
    sh.setHiddenGridlines(true);
    sh.setFrozenRows(4);
    sh.setFrozenColumns(2);
    sh.setTabColor('#8a6a1f');
    sh.getRange(1, 1, 2, 23).setBackground('#1d1b18').setFontFamily('Inter');
    sh.getRange('A1:A2').clearContent();
    sh.getRange('B1').setValue('SKILL COMPETENCY MATRIX : v19')
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18).setFontColor('#ffffff')
      .setVerticalAlignment('middle');
    sh.getRange('B2').setValue('Current status derived from the append-only evidence and sign-off logs. No progress is entered directly on this sheet.')
      .setFontSize(9).setFontColor('#c9a227').setVerticalAlignment('top');
    sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
    sh.getRange(4, 1, 1, 20).setValues([SKILL_MATRIX_HEADERS_V19])
      .setBackground('#faf8f2').setFontColor('#1d1b18').setFontFamily('Oswald')
      .setFontWeight('bold').setFontSize(9).setWrap(true)
      .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sh.setRowHeight(4, 42);
    sh.getRange('V1').setValue('TRAINEE VIEW').setFontFamily('Oswald')
      .setFontWeight('bold').setFontColor('#c9a227');
    sh.getRange('V2').setValue('Selected trainee');
    var current = String(sh.getRange('W2').getValue() || '');
    if (current && traineeList().indexOf(current) < 0) current = '';
    sh.getRange('W2').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList([''].concat(traineeList()), true)
        .setAllowInvalid(false).build())
      .setBackground('#fff7dc').setValue(current);
    var kpis = [
      ['Required skills','=IF($W$2="","",COUNTIF($A$5:$A$3000,$W$2))'],
      ['Not started','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"NOT STARTED"))'],
      ['In progress','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"IN PROGRESS"))'],
      ['Ready for validation','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"READY FOR VALIDATION"))'],
      ['Signed off','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$H$5:$H$3000,"SIGNED OFF"))'],
      ['Needs review','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"*REVIEW*"))']
    ];
    kpis.forEach(function (k, i) {
      sh.getRange(3 + i, 22).setValue(k[0]).setFontSize(9).setFontColor('#847d6d');
      sh.getRange(3 + i, 23).setFormula(k[1]).setFontFamily('Oswald').setFontWeight('bold')
        .setHorizontalAlignment('center');
    });
    sh.getRange('A5:T3000').setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
    sh.getRange('B5:B3000').setWrap(true);
    sh.getRange('D5:D3000').setNumberFormat('yyyy-mm-dd');
    sh.getRange('R5:S3000').setNumberFormat('yyyy-mm-dd');
    var widths = [185,310,72,105,150,105,195,105,165,115,95,110,100,95,150,150,190,105,105,360,18,145,165];
    widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    try { sh.hideColumns(10); } catch (e) {}
    var stageRange = sh.getRange('C5:C3000'), readyRange = sh.getRange('G5:G3000'),
        signRange = sh.getRange('H5:H3000');
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('O').setBackground('#dbeafe')
        .setFontColor('#1f5673').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('A').setBackground('#fff1c2')
        .setFontColor('#8a6a1f').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('P').setBackground('#f5df99')
        .setFontColor('#6d5318').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('I').setBackground('#dcefe2')
        .setFontColor('#2f6f45').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('READY FOR VALIDATION')
        .setBackground('#fff1c2').setFontColor('#6d5318').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains('REVIEW')
        .setBackground('#f8d7d2').setFontColor('#8f1f12').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains('REQUIRED')
        .setBackground('#f8d7d2').setFontColor('#8f1f12').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SIGNED OFF')
        .setBackground('#3f8f5a').setFontColor('#ffffff').setBold(true).setRanges([signRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('EXPIRED')
        .setBackground('#c43a28').setFontColor('#ffffff').setBold(true).setRanges([signRange]).build()
    ]);
    try {
      var old = sh.getFilter(); if (old) old.remove();
      sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 2), 20).createFilter();
    } catch (e) {}
  }
  applyCatalogLayoutV19_();
  var evidence = S.getSheetByName(TAB.SKILL_EVIDENCE);
  if (evidence) styleSkillDataSheetV19_(evidence, 'SKILL EVIDENCE LOG',
    'Append-only normalized record. One row equals one submitted skill event. Do not edit.', 20, '#1f5673');
  var queue = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (queue) buildSkillValidationQueueV19_();
  var signoff = S.getSheetByName(TAB.SKILL_SIGNOFF);
  if (signoff) styleSkillDataSheetV19_(signoff, 'SKILL SIGN-OFF LOG',
    'Append-only leadership decisions. Matrix status is derived from the latest recorded decision.', 12, '#5b8266');
}

/* ---- ported from zz (effective winner) ---- */
/** Catalog layout with the title moved off the badge. Column A stays
 *  visible: deploymentPreflight() validates that A4 reads SKILL ID. */
function applyCatalogLayoutV19_() {
  var sh = ss().getSheetByName(TAB.CATALOG);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID') return;
  ensureSheetCapacityV19_(sh, 500, 17);
  sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  sh.getRange('A5:Q500').clearDataValidations();
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(4);
  sh.setFrozenColumns(3);
  sh.setTabColor('#8a6a1f');
  sh.getRange(1, 1, 2, 17).setBackground('#1d1b18').setFontFamily('Inter');
  sh.getRange('A1:A2').clearContent();
  sh.getRange('B1').setValue('SKILL CATALOG : v19 CONTROLLED STANDARD')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.getRange('B2').setValue('Leadership-controlled applicability and evidence thresholds. APPROVED means the row was clinically and operationally reviewed.')
    .setFontSize(9).setFontColor('#c9a227').setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
  sh.getRange(4, 1, 1, 17).setValues([SKILL_CATALOG_HEADERS_V19])
    .setBackground('#faf8f2').setFontColor('#1d1b18').setFontFamily('Oswald')
    .setFontWeight('bold').setFontSize(9).setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(4, 42);
  sh.getRange('D5:Q500').setBackground('#fff7dc');
  var yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes','No'], true)
    .setAllowInvalid(false).build();
  sh.getRange('D5:G500').setDataValidation(yesNo);
  sh.getRange('I5:L500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(1).setAllowInvalid(false).build());
  sh.getRange('M5:M500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['Division Chief of Training','Medical Director','Division Chief + Medical Director'], true)
      .setAllowInvalid(false).build());
  sh.getRange('Q5:Q500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['DRAFT : APPLICABILITY / THRESHOLD REVIEW','APPROVED','RETIRED'], true)
      .setAllowInvalid(false).build());
  sh.getRange('O5:P500').setNumberFormat('yyyy-mm-dd');
  sh.getRange('A5:Q500').setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
  sh.getRange('B5:C500').setWrap(true);
  var widths = [110,155,330,92,105,120,72,220,105,115,105,100,190,260,105,105,190];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('APPROVED')
      .setBackground('#3f8f5a').setFontColor('#ffffff').setBold(true)
      .setRanges([sh.getRange('Q5:Q500')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('DRAFT')
      .setBackground('#c43a28').setFontColor('#ffffff').setBold(true)
      .setRanges([sh.getRange('Q5:Q500')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('RETIRED')
      .setBackground('#e8e4da').setFontColor('#6f6a61')
      .setRanges([sh.getRange('Q5:Q500')]).build()
  ]);
  try {
    var oldFilter = sh.getFilter(); if (oldFilter) oldFilter.remove();
    sh.getRange(4, 1, Math.max(sh.getLastRow() - 3, 2), 17).createFilter();
  } catch (e) {}
}

/* ---- ported from zz (effective winner) ---- */
/** Title moves to B1 and B2 so the badge in column A no longer sits on top
 *  of it, and the internal SKILL ID column is hidden. */
function styleSkillDataSheetV19_(sh, title, subtitle, cols, accent) {
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(4);
  sh.setFrozenColumns(1);
  sh.setTabColor(accent);
  sh.getRange(1, 1, 2, cols).setBackground('#1d1b18').setFontFamily('Inter');
  sh.getRange('A1:A2').clearContent();
  sh.getRange('B1').setValue(title).setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(18).setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.getRange('B2').setValue(subtitle).setFontSize(9).setFontColor('#c9a227')
    .setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
  sh.getRange(4, 1, 1, cols).setBackground('#faf8f2').setFontColor('#1d1b18')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9).setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange(5, 1, sh.getMaxRows() - 4, cols).setFontFamily('Inter').setFontSize(9)
    .setVerticalAlignment('middle');
  sh.setRowHeight(4, 42);
  hideSkillIdColumnV19_(sh);
  try {
    var oldFilter = sh.getFilter(); if (oldFilter) oldFilter.remove();
    sh.getRange(4, 1, Math.max(sh.getLastRow() - 3, 2), cols).createFilter();
  } catch (e) {}
}

/* ---- ported from zz (effective winner) ---- */
/** Dropdown choices are the plain skill name, ordered by domain so the list
 *  still reads in clinical groups. No SK number is shown to the FTO. */
function approvedSkillChoicesV19_() {
  return catalogObjectsV19_(false)
    .filter(function (c) { return c.active; })
    .sort(function (a, b) {
      return (a.domain + '|' + a.skill).localeCompare(b.domain + '|' + b.skill);
    })
    .map(function (c) { return c.skill; });
}

/* ---- ported from zz (effective winner) ---- */
/** Resolves the submitted choice back to the internal Skill ID. Accepts the
 *  plain skill name used now, and still accepts the older
 *  "SK-... | LEVELS | DOMAIN | SKILL" label so historical responses and any
 *  in-flight submission continue to resolve correctly. */
function parseSkillChoiceIdV19_(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  var first = raw.split('|')[0].trim();
  if (/^SK-[A-Z0-9-]+$/.test(first)) return first;
  var maps = catalogMapsV19_(true);
  var direct = maps.byName[normalizeSkillNameV19_(raw)];
  if (direct) return direct.id;
  var parts = raw.split('|');
  if (parts.length > 1) {
    var tail = maps.byName[normalizeSkillNameV19_(parts[parts.length - 1])];
    if (tail) return tail.id;
  }
  return '';
}

/* ---- ported from zz (effective winner) ---- */
/** Override. Same behaviour, but sorted by trainee and both dropdowns
 *  re-armed after every write so they cannot quietly vanish. */
function refreshSkillValidationQueueV19_() {
  var S = ss();
  var matrix = S.getSheetByName(TAB.SKILLS);
  var queue = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (!matrix || !queue) return;

  var matrixRows = matrix.getLastRow() >= 5
    ? matrix.getRange(5, 1, matrix.getLastRow() - 4, 20).getValues() : [];
  var queueRows = queue.getLastRow() >= 5
    ? queue.getRange(5, 1, queue.getLastRow() - 4, 13).getValues() : [];
  var catalogById = catalogMapsV19_(true).byId;

  var open = {}, readyKeys = {};
  queueRows.forEach(function (r, i) {
    var key = String(r[1]) + '||' + String(r[2]);
    if (String(r[11]) === 'OPEN') open[key] = i + 5;
  });

  var add = [];
  matrixRows.forEach(function (r) {
    var readiness = String(r[6] || '');
    if (readiness !== 'READY FOR VALIDATION' &&
        readiness !== 'SIGNED OFF - REVIEW REQUIRED' &&
        readiness !== 'LEGACY SIGN-OFF REVIEW REQUIRED') return;
    var key = String(r[0]) + '||' + String(r[9]);
    readyKeys[key] = true;
    if (open[key]) return;
    var catalog = catalogById[String(r[9])] || {};
    add.push([
      r[3] || new Date(), r[0], r[9], r[8], r[1],
      (Number(r[10]) || 0) + '  /  ' + (Number(r[11]) || 0) + '  /  ' +
        (Number(r[12]) || 0) + '  /  ' + (Number(r[13]) || 0),
      null, null, null, null, null, 'OPEN', r[3] || null
    ]);
  });

  sweepStaleQueueRowsV20_2_(queue, open, readyKeys, matrixRows.length, queueRows);

  if (add.length) {
    var start = Math.max(queue.getLastRow() + 1, 5);
    var needed = start + add.length - 1;
    if (queue.getMaxRows() < needed) {
      queue.insertRowsAfter(queue.getMaxRows(), needed - queue.getMaxRows() + 20);
    }
    var target = queue.getRange(start, 1, add.length, 13);
    target.clearDataValidations();
    target.setValues(add);
    systemLog_('INFO', 'SKILL VALIDATION QUEUE APPEND',
      add.length + ' row(s) added starting at row ' + start + '.');
  }

  // sort open rows by trainee then skill, leaving recorded rows in place
  // v20.1: never re-sort while any OPEN row holds a draft decision —
  // sorting under a leader mid-selection was the row-swap defect.
  var drafts = queueRows.some(function (qr) {
    return String(qr[11]) === 'OPEN' && String(qr[6] || '').trim();
  });
  if (!drafts) { try { sortQueueByTraineeV20_(queue); } catch (e) {} }

  // both dropdowns, every time, so they cannot vanish on a refresh
  armQueueValidationV20_(queue);

  // and refresh the review flags for anything newly added
  try { runSkillAuditV20(); } catch (e) {}
}

/* ---------------------------------------------------------------- *
 *  Stale-queue sweep  (v20.2)
 * ---------------------------------------------------------------- */

/** The most rows one automatic sweep may cancel before it refuses and asks
 *  for a human. A real criteria change — a catalog edit, a level correction —
 *  moves a handful of rows. Dozens at once is a symptom, not an intention. */
var QUEUE_SWEEP_MAX_V20_2 = 10;

/** Cancels queue rows whose skill is no longer ready.
 *
 *  This used to be one line:
 *
 *    Object.keys(open).forEach(function (key) {
 *      if (!readyKeys[key]) queue.getRange(open[key], 12)
 *        .setValue('CANCELLED : CRITERIA CHANGED');
 *    });
 *
 *  readyKeys is built entirely from the matrix, and its caller,
 *  rebuildSkillMatrixV19_, clears the matrix and then writes rows only
 *  `if (output.length)`. So any run that produced no output — an empty
 *  roster, a catalog with no active skills, a level lookup that threw —
 *  left readyKeys empty, and the sweep cancelled EVERY open sign-off
 *  request in the queue. In bulk. With no log, no attribution, and no
 *  confirmation, on a schedule, including rows a leader was mid-decision on
 *  three lines above where drafts are explicitly protected from sorting.
 *
 *  A stale OPEN row is a visible nuisance. A wrongly cancelled one is lost
 *  work that nobody is told about. This refuses when it cannot tell the
 *  difference. */
function sweepStaleQueueRowsV20_2_(queue, open, readyKeys, matrixRowCount, queueRows) {
  var openKeys = Object.keys(open);
  if (!openKeys.length) return 0;

  // 1. No matrix means "we cannot tell", never "nothing qualifies".
  if (!matrixRowCount) {
    systemLog_('ERROR', 'QUEUE SWEEP REFUSED',
      'The skill matrix read back empty, so every one of the ' + openKeys.length +
      ' open request(s) would have been cancelled as "criteria changed". ' +
      'Nothing was cancelled. Rebuild the matrix and check the roster and catalog.');
    return 0;
  }

  // 2. A row holding a draft decision belongs to whoever is deciding it.
  var draftRows = {};
  (queueRows || []).forEach(function (qr, i) {
    if (String(qr[11]) === 'OPEN' && String(qr[6] || '').trim()) draftRows[i + 5] = true;
  });

  var stale = [], protectedDrafts = 0;
  openKeys.forEach(function (key) {
    if (readyKeys[key]) return;
    if (draftRows[open[key]]) { protectedDrafts++; return; }
    stale.push({ row: open[key], key: key });
  });
  if (protectedDrafts) {
    systemLog_('INFO', 'QUEUE SWEEP SKIPPED DRAFTS',
      protectedDrafts + ' row(s) left alone because a decision is part-written on them.');
  }
  if (!stale.length) return 0;

  // 3. Mass cancellation is a symptom. Refuse the whole sweep and say so.
  if (stale.length > QUEUE_SWEEP_MAX_V20_2 || stale.length * 2 > openKeys.length) {
    var why = 'Would have cancelled ' + stale.length + ' of ' + openKeys.length +
      ' open request(s) as "criteria changed". That is past the safety limit (' +
      QUEUE_SWEEP_MAX_V20_2 + ' rows, or half the open queue), so nothing was cancelled.\n\n' +
      'This usually means the matrix rebuilt from incomplete data rather than that ' +
      'the criteria really changed for that many skills at once.\n\n' +
      'Affected rows: ' + stale.slice(0, 20).map(function (x) { return x.row; }).join(', ') +
      (stale.length > 20 ? ' …' : '') + '\n\n' +
      'Check 01 TRAINEE MASTER, 15 SKILL CATALOG and 16 SKILLS, then re-run ' +
      'rebuildSkillMatrixV19_(). The requests are still OPEN and safe.';
    systemLog_('ERROR', 'QUEUE SWEEP REFUSED', why.slice(0, 400));
    try { sendMail(CONFIG.TCO_EMAIL, 'SCEMS : queue sweep refused, nothing cancelled', why); } catch (e) {}
    return 0;
  }

  // 4. Cancel, and record each one.
  stale.forEach(function (x) {
    queue.getRange(x.row, 12).setValue('CANCELLED : CRITERIA CHANGED');
    systemLog_('WARN', 'QUEUE ROW CANCELLED',
      'row ' + x.row + ' | ' + x.key.split('||').join(' / ') +
      ' | no longer ready on the matrix');
  });
  return stale.length;
}

/* ---- ported from zz (effective winner) ---- */
/** Arms both dropdowns across the whole queue body. */
function armQueueValidationV20_(sheet) {
  var q = sheet || ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q) return;
  var rows = Math.max(q.getMaxRows() - 4, 1);

  q.getRange(5, 7, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(QUEUE_DECISIONS_V19, true)
      .setAllowInvalid(false).build());

  q.getRange(5, 11, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(QUEUE_REASONS_V19, true)
      .setAllowInvalid(true).build());
}

/* ---- ported from zz (effective winner) ---- */
/** Sorts the queue body by trainee, then skill. */
function sortQueueByTraineeV20_(sheet) {
  var q = sheet || ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q || q.getLastRow() < 6) return;
  var n = q.getLastRow() - 4;
  var width = Math.max(q.getLastColumn(), QUEUE_REVIEW_COL_V20);
  q.getRange(5, 1, n, width).sort([
    { column: 12, ascending: true },   // OPEN before RECORDED
    { column: 2,  ascending: true },   // trainee
    { column: 5,  ascending: true }    // skill
  ]);
}

/* ---- ported from zz (effective winner) ---- */
/** Computes the checks and writes the flags onto the queue. */
function runSkillAuditV20() {
  var q = ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q || q.getLastRow() < 5) return 'Queue is empty.';

  var result = skillAuditFindingsV20_();
  var findings = result.findings;

  var rows = q.getRange(5, 1, q.getLastRow() - 4, 13).getValues();
  var flagged = 0, clean = 0;

  rows.forEach(function (r, i) {
    var trainee = String(r[1] || '').trim();
    var skillId = String(r[2] || '').trim();
    if (!trainee) return;
    var open = String(r[11] || '').trim() === 'OPEN';
    if (!open) return;

    var k = trainee + '||' + skillId;
    var reasons = findings[k];
    if (reasons && reasons.length) {
      q.getRange(i + 5, QUEUE_REVIEW_COL_V20).setValue(reasons.join('; '));
      flagged++;
    } else {
      q.getRange(i + 5, QUEUE_REVIEW_COL_V20).setValue('');
      clean++;
    }
  });

  var msg = 'SKILL AUDIT COMPLETE\n\n' +
    'Flagged for review : ' + flagged + '\n' +
    'Clean              : ' + clean + '\n\n' +
    (flagged
      ? 'The flagged rows are worth reading before approving. The clean\n' +
        'ones met the thresholds with no unusual pattern behind them.'
      : 'Nothing unusual in the current queue.') +
    '\n\nNothing is blocked. A flag is a question worth asking.';
  Logger.log(msg);
  systemLog_(flagged ? 'WARN' : 'INFO', 'SKILL AUDIT',
    flagged + ' flagged, ' + clean + ' clean');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Every finding across the three checks, keyed by trainee and skill id. */
function skillAuditFindingsV20_() {
  var S = ss();
  var findings = {};   // "trainee||skillId" -> [reasons]
  var ftoPattern = {}; // fto -> { total, independent }

  function add(trainee, skillId, reason) {
    var k = String(trainee).trim() + '||' + String(skillId).trim();
    if (!findings[k]) findings[k] = [];
    if (findings[k].indexOf(reason) < 0) findings[k].push(reason);
  }

  // ---- read the evidence ----
  var ev = S.getSheetByName(TAB.SKILL_EVIDENCE);
  var bursts = {};  // "trainee||skillId||date" -> count
  if (ev && ev.getLastRow() >= 5) {
    var headers = ev.getRange(4, 1, 1, ev.getLastColumn()).getValues()[0];
    var col = {};
    headers.forEach(function (h, i) {
      var k = String(h || '').trim().toUpperCase();
      if (k) col[k] = i;
    });

    ev.getRange(5, 1, ev.getLastRow() - 4, headers.length).getValues()
      .forEach(function (r) {
        var id = String(r[0] || '').trim();
        if (!id) return;
        var status = col['VALIDATION RESULT'] !== undefined
          ? String(r[col['VALIDATION RESULT']] || '').trim() : '';
        if (status !== 'ACCEPTED') return;

        var trainee = String(r[col['TRAINEE']] || '').trim();
        var skillId = String(r[col['SKILL ID']] || '').trim();
        var fto     = String(r[col['FTO']] || '').trim();
        var stage   = String(r[col['STAGE']] || '').trim();
        var date    = r[col['SHIFT DATE']];
        var dateKey = date instanceof Date
          ? Utilities.formatDate(date, 'America/New_York', 'yyyy-MM-dd')
          : String(date || '');

        if (trainee && skillId && dateKey) {
          var bk = trainee + '||' + skillId + '||' + dateKey;
          bursts[bk] = (bursts[bk] || 0) + 1;
        }
        if (fto) {
          if (!ftoPattern[fto]) ftoPattern[fto] = { total: 0, independent: 0 };
          ftoPattern[fto].total++;
          if (stage === 'I') ftoPattern[fto].independent++;
        }
      });
  }

  // burst findings
  Object.keys(bursts).forEach(function (k) {
    if (bursts[k] <= SKILL_BURST_LIMIT_V20) return;
    var parts = k.split('||');
    add(parts[0], parts[1],
      bursts[k] + ' repetitions on one shift (' + parts[2] + ')');
  });

  // ---- single source, read from the matrix ----
  var m = S.getSheetByName(TAB.SKILLS);
  if (m && m.getLastRow() >= 5) {
    m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
      var trainee = String(r[0] || '').trim();
      var skillId = String(r[9] || '').trim();
      if (!trainee || !skillId) return;
      var readiness = String(r[6] || '');
      if (readiness !== 'READY FOR VALIDATION') return;
      var dates = Number(r[12]) || 0;
      var ftos  = Number(r[13]) || 0;
      if (dates <= 1 && ftos <= 1) {
        add(trainee, skillId, 'single date, single FTO');
      } else if (ftos <= 1) {
        add(trainee, skillId, 'single FTO');
      } else if (dates <= 1) {
        add(trainee, skillId, 'single date');
      }
    });
  }

  // ---- stage pattern, per FTO ----
  var inflated = [];
  Object.keys(ftoPattern).forEach(function (fto) {
    var p = ftoPattern[fto];
    if (p.total < SKILL_INFLATION_MIN_V20) return;
    var ratio = p.independent / p.total;
    if (ratio < SKILL_INFLATION_PCT_V20) return;
    inflated.push({ fto: fto, total: p.total,
                    pct: Math.round(ratio * 100) });
  });

  // attach the FTO pattern to every open queue row for that FTO's trainees
  if (inflated.length) {
    var q = S.getSheetByName(TAB.SKILL_VALIDATION);
    var evSheet = S.getSheetByName(TAB.SKILL_EVIDENCE);
    if (q && q.getLastRow() >= 5 && evSheet) {
      var lastFto = {};  // "trainee||skillId" -> fto
      var eh = evSheet.getRange(4, 1, 1, evSheet.getLastColumn()).getValues()[0];
      var ec = {};
      eh.forEach(function (h, i) {
        var k = String(h || '').trim().toUpperCase();
        if (k) ec[k] = i;
      });
      evSheet.getRange(5, 1, evSheet.getLastRow() - 4, eh.length).getValues()
        .forEach(function (r) {
          var t = String(r[ec['TRAINEE']] || '').trim();
          var s = String(r[ec['SKILL ID']] || '').trim();
          var f = String(r[ec['FTO']] || '').trim();
          if (t && s && f) lastFto[t + '||' + s] = f;
        });
      inflated.forEach(function (inf) {
        Object.keys(lastFto).forEach(function (k) {
          if (lastFto[k] !== inf.fto) return;
          var parts = k.split('||');
          add(parts[0], parts[1],
            inf.fto + ' logs ' + inf.pct + '% Independent across ' +
            inf.total + ' events');
        });
      });
    }
  }

  return { findings: findings, inflated: inflated };
}

/* ---- ported from zz (effective winner) ---- */
/** Adds the REVIEW column. Run once. */
function setupQueueReviewV20() {
  var q = ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q) return 'Validation queue not found.';

  if (q.getMaxColumns() < QUEUE_REVIEW_COL_V20) {
    q.insertColumnsAfter(q.getMaxColumns(),
      QUEUE_REVIEW_COL_V20 - q.getMaxColumns());
  }

  q.getRange(4, QUEUE_REVIEW_COL_V20).setValue('REVIEW')
    .setBackground('#faf8f2').setFontColor('#1d1b18')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227',
               SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  q.setColumnWidth(QUEUE_REVIEW_COL_V20, 300);

  var rows = Math.max(q.getMaxRows() - 4, 1);
  q.getRange(5, QUEUE_REVIEW_COL_V20, rows, 1)
    .setFontFamily('Inter').setFontSize(9).setWrap(true)
    .setVerticalAlignment('middle');

  var rules = q.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty()
    .setBackground('#fdf3f1').setFontColor('#8f1f12').setBold(true)
    .setRanges([q.getRange(5, QUEUE_REVIEW_COL_V20, rows, 1)])
    .build());
  q.setConditionalFormatRules(rules);

  var msg = 'REVIEW column added to the validation queue.\n\n' +
    'It sits to the right of everything the existing code reads, so the\n' +
    'recording process is unaffected.\n\n' +
    'Now run runSkillAuditV20().';
  Logger.log(msg);
  systemLog_('INFO', 'QUEUE REVIEW COLUMN ADDED', 'column ' + QUEUE_REVIEW_COL_V20);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Read only. Confirms all six are present, titled, and accepting. */
function checkAllFormsV19() {
  var ids = [];
  try {
    ids = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty('FORM_IDS') || '[]');
  } catch (e) {}

  var found = {};
  ids.forEach(function (id) {
    var f;
    try { f = FormApp.openById(id); } catch (e) { return; }
    var name = '';
    try { name = String(f.getTitle() || '').trim(); } catch (e) {}
    if (!name) { try { name = DriveApp.getFileById(id).getName().trim(); } catch (e) {} }
    if (!name) return;
    var accepting = '';
    try { accepting = String(f.isAcceptingResponses()); } catch (e) {}
    var url = '';
    try { url = f.getPublishedUrl(); } catch (e) {}
    found[name] = { id: id, accepting: accepting, url: url };
  });

  var L = ['FORM STATUS', ''];
  L.push('Stored form ids : ' + ids.length + ' of ' + EXPECTED_FORMS_V19.length + ' expected');
  L.push('');
  var missing = 0;
  EXPECTED_FORMS_V19.forEach(function (want) {
    var f = found[want];
    if (f) {
      L.push('  FOUND    ' + want);
      L.push('           accepting ' + f.accepting);
    } else {
      L.push('  MISSING  ' + want);
      missing++;
    }
  });

  var strays = Object.keys(found).filter(function (n) {
    return EXPECTED_FORMS_V19.indexOf(n) < 0;
  });
  if (strays.length) {
    L.push('');
    strays.forEach(function (n) { L.push('  UNEXPECTED  "' + n + '"'); });
  }

  L.push('');
  L.push(!missing && !strays.length
    ? 'All expected forms present.'
    : 'Run repairFormIdsV19() then retitleFormsV19().');

  L.push('');
  L.push('LINKS FOR THE HUB, five of six');
  EXPECTED_FORMS_V19.forEach(function (want) {
    if (want === 'SCEMS Training Decision Record') return;
    var f = found[want];
    L.push('  ' + want);
    L.push('     ' + (f && f.url ? f.url : 'not available'));
  });
  L.push('');
  L.push('The Decision Record is leadership only and never goes on the Hub.');

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** READ ONLY. The whole picture. */
function cleanupReportV19() {
  var S = ss();
  var L = ['CLEANUP REPORT', ''];

  // ---- workbook ----
  var sheets = S.getSheets();
  var responseTabs = sheets.filter(function (sh) {
    return /^Form Responses/i.test(sh.getName());
  });
  var hidden = sheets.filter(function (sh) { return sh.isSheetHidden(); });
  L.push('WORKBOOK');
  L.push('   tabs total            : ' + sheets.length);
  L.push('   Form Responses sheets : ' + responseTabs.length);
  L.push('   currently hidden      : ' + hidden.length);
  L.push('   Run auditResponseTabsV19() for the detail.');
  L.push('');

  // ---- forms ----
  var ids = [];
  try {
    ids = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty('FORM_IDS') || '[]');
  } catch (e) {}
  L.push('FORMS');
  L.push('   stored form ids : ' + ids.length + ' (six expected)');
  L.push('');

  // ---- triggers ----
  var trig = [];
  try { trig = ScriptApp.getProjectTriggers(); } catch (e) {}
  var byFn = {};
  trig.forEach(function (t) {
    var f = t.getHandlerFunction();
    byFn[f] = (byFn[f] || 0) + 1;
  });
  L.push('TRIGGERS  (' + trig.length + ')');
  Object.keys(byFn).sort().forEach(function (f) {
    L.push('   ' + f + (byFn[f] > 1 ? '   x' + byFn[f] + '  DUPLICATE' : ''));
  });
  var dupes = Object.keys(byFn).filter(function (f) { return byFn[f] > 1; });
  if (dupes.length) {
    L.push('   Duplicate triggers fire the same handler more than once per');
    L.push('   event. Worth clearing.');
  }
  L.push('');

  // ---- superseded code ----
  L.push('SUPERSEDED BLOCKS STILL LOADED');
  var found = 0;
  SUPERSEDED_BLOCKS_V19.forEach(function (b) {
    if (b.note === 'keep') return;
    if (!definedV19_(b.marker)) return;
    found++;
    L.push('   ' + b.block);
    L.push('      superseded by : ' + b.by);
    L.push('      action        : ' + b.note);
    L.push('      find it by searching for : ' + b.marker);
  });
  if (!found) L.push('   none detected');
  L.push('');

  // ---- one-time diagnostics ----
  L.push('ONE-TIME DIAGNOSTICS STILL PRESENT');
  var tools = ONE_TIME_TOOLS_V19.filter(function (t) { return definedV19_(t.fn); });
  if (!tools.length) L.push('   none');
  tools.forEach(function (t) {
    L.push('   ' + t.fn.padEnd(28) + t.why);
  });
  if (tools.length) {
    L.push('   These did their job and are not called by anything. Deleting');
    L.push('   them is optional and harmless either way.');
  }
  L.push('');

  // ---- keep ----
  L.push('TOOLS WORTH KEEPING');
  var kept = KEEP_TOOLS_V19.filter(function (f) { return definedV19_(f); });
  L.push('   ' + kept.length + ' of ' + KEEP_TOOLS_V19.length + ' present');
  L.push('   Do not delete these. They are how the system is checked.');
  L.push('');

  L.push('HOW TO DELETE A BLOCK');
  L.push('   Cmd+F in zz_scems_fixes for the marker function named above.');
  L.push('   Every block starts with a banner comment giving its version.');
  L.push('   Select from that banner down to the line before the next');
  L.push('   banner, and delete. Save. Then run cleanupReportV19() again.');
  L.push('');
  L.push('   Take a version snapshot before deleting anything.');

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---- ported from master (effective winner) ---- */
function evalAlerts(v) {
  var t = v[EV.TRAINEE], fto = v[EV.FTO], dt = v[EV.SHIFTDATE];

  // ---- NEW: any domain scored 1 alerts the TCO same day, no opt-in ----
  var unsafe = [];
  for (var i = 0; i < 6; i++) {
    if (String(v[12 + i]) === '1') unsafe.push(DOMAIN_NAMES[i]);
  }
  if (unsafe.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'URGENT : Unsafe Score (1) : ' + t + ' : ' + unsafe.join(', '),
      'FTO ' + fto + ' scored ' + t + ' UNSAFE on ' + dt + ' in: ' + unsafe.join(', ') +
      '\nDocumented Situation: ' + (v[19] || '(missing : follow up, this is required)') +
      '\nCall number(s): ' + (v[20] || '(missing)') +
      '\nFull entry on 02 FTO SHIFT EVAL RAW. Same-day review.');
  }

  if (v[EV.CS] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'URGENT : Controlled-Substance Issue Reported : ' + t,
      'Reported by ' + fto + ' on ' + dt + '. See 02 FTO SHIFT EVAL RAW and SOP 402.1. Same-shift handling required.\nDetail: ' + (v[EV.RFDETAIL] || '(see evaluation row)'));
  }
  // The flag that used to go nowhere. Same shape as its siblings: the TCO
  // hears about it, and nobody else does, because a documentation problem is
  // a training matter and not a safety alert.
  if (v[EV.DOCISSUE] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Documentation Issue Reported : ' + t,
      'Reported by ' + fto + ' on ' + dt + '.\nDetail: ' +
      (v[EV.RFDETAIL] || '(none entered on the evaluation)') +
      '\nFull entry on 02 FTO SHIFT EVAL RAW.');
  }
  if (v[EV.REDFLAG] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'URGENT : Field Training Concern : ' + t,
      'Red flag reported by ' + fto + ' on ' + dt + '.\nDetail: ' + (v[EV.RFDETAIL] || '(none entered : follow up)') + '\nFull entry on 02 FTO SHIFT EVAL RAW. Handle same shift.');
  }
  if (v[EV.CLIN] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.MD_EMAIL,
      'Clinical Readiness Disagreement : ' + t + ' : Medical Director Review',
      'Filed by ' + fto + ' on ' + dt + '.\nStrength noted: ' + v[EV.STRENGTH] + '\nImprovement noted: ' + v[EV.IMPROVE] + '\nYour decision governs per the FTO Guide.');
    queueAdd(t, 'Clinical disagreement : Medical Director review');
  }
  if (v[EV.NRT] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'NRT Designation Filed : ' + t,
      'Filed by ' + fto + ' after documented remediation.\nPrior coaching: ' + v[EV.PRIOR] + '\nStill not improving: ' + v[EV.NOTIMP] + '\nDecision due within 72 hours: extend, reassign, or release. Queue row created.');
    queueAdd(t, 'NRT outcome : extend / reassign / release');
  }
  if (v[EV.ADV] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Decision Required (72h) : Advancement : ' + t,
      'Requested by ' + fto + ' on ' + dt + '. Clock started; return the decision to the FTO.');
    queueAdd(t, 'Advancement review');
  }
  if (v[EV.TOREV] === 'Yes' && v[EV.ADV] !== 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Training Officer Review Requested : ' + t,
      'Requested by ' + fto + ' on ' + dt + '. See the evaluation row on 02.');
  }
}

/* ---- ported from master (effective winner) ---- */
function reflectAlerts(v) {
  // v: 0 ts, 1 trainee, 10 concern flag, 11 concern detail
  if (v[10] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Trainee Direct Concern : ' + v[1],
      'Submitted ' + v[2] + '.\n' + (v[11] || '') + '\nFull entry on 03 SELF-REFLECTION RAW.');
  }
}

/* ---- ported from master (effective winner) ---- */
function urgentAlerts(v) {
  // v: 0 ts, 1 contacted, 2 reporter, 3 role, 4 trainee, 5 date, 6 shift, 7 category, 8 what, 9 action
  sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
    'URGENT : Field Training Concern : ' + v[4],
    v[7] + ' reported by ' + v[2] + ' (' + v[3] + ') on ' + v[5] + ', Shift ' + v[6] + '.\nWhat happened: ' + v[8] + '\nImmediate action: ' + v[9] + '\nContacted TCO: ' + v[1] + '\nFull entry on 04 URGENT CONCERNS RAW. Handle same shift.');
  if (String(v[7]).indexOf('Controlled substance') >= 0) {
    sendMail(CONFIG.TCO_EMAIL,
      'URGENT : Controlled-Substance Issue Reported : ' + v[4],
      'Reported via Urgent Concern by ' + v[2] + ' on ' + v[5] + '. See 04 and SOP 402.1. Same-shift handling required.');
  }
  if (String(v[7]).indexOf('Clinical readiness') >= 0) {
    sendMail(CONFIG.MD_EMAIL,
      'Clinical Readiness Concern : ' + v[4] + ' : Medical Director Awareness',
      'Filed by ' + v[2] + ' on ' + v[5] + '. Summary: ' + v[8]);
  }
}

/* ---- ported from master (effective winner) ---- */
function queueAdd(trainee, type) {
  // First empty row inside the seeded 300-row queue; never append outside its formulas.
  var q = ss().getSheetByName(TAB.QUEUE);
  if (!q) throw new Error('Decision Queue is missing.');
  var colA = q.getRange(5, 1, 296, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (!colA[i][0]) {
      var row = 5 + i;
      q.getRange(row, 1, 1, 4).setValues([[new Date(), trainee, type, 'Division Chief of Training']]);
      q.getRange(row, 5).setFormula('=IF(A' + row + '="","",A' + row + '+3)');
      return;
    }
  }
  throw new Error('Decision Queue is full. Archive closed items before accepting another decision-required event.');
}

/* ---- ported from master (effective winner) ---- */
/** One press: for every non-snoozed overdue trainee, email their shift
 *  supervisor (TCO copied) to have the FTO submit this shift, then
 *  snooze that trainee for SNOOZE_DAYS. */
function remindOverdue() {
  var S = ss();
  var ctl = S.getSheetByName(TAB.CONTROL);
  var OV = ctl.getRange('B5').getValue();

  var roster = ctl.getRange(5, 6, 25, 2).getValues();
  var shiftByFto = {};
  roster.forEach(function (r) { if (r[0]) shiftByFto[String(r[0])] = String(r[1]); });
  var sup = ctl.getRange(5, 13, 4, 3).getValues();
  var supByShift = {};
  sup.forEach(function (r) { if (r[0]) supByShift[String(r[0])] = { name: r[1], email: r[2] }; });

  var eng = S.getSheetByName(TAB.ENGINE);
  var rows = eng.getRange(5, 1, 40, 23).getValues();
  var sent = 0;
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i][0], fto = rows[i][3], days = rows[i][8], snooze = rows[i][21];
    if (!name || String(name).indexOf(TEST_PREFIX) === 0) continue;
    if (typeof days !== 'number' || days <= OV || snooze === 'SNOOZED') continue;
    var shift = shiftByFto[String(fto || '')] || '';
    var target = supByShift[shift];
    var to = (target ? String(target.email) + ',' : '') + CONFIG.TCO_EMAIL;
    sendMail(to,
      'Evaluation Overdue : ' + name + ' : ' + days + ' Days',
      'FTO ' + (fto || 'unassigned') + ' has not submitted a shift evaluation for ' + name +
      ' in ' + days + ' days (standard: ' + OV + ').\n\n' +
      'Please have the evaluation submitted through the Field Training Hub this shift.\n' +
      HUB_URL + '\n\n' +
      'This is an automated reminder from the Field Training tracking system. It will not repeat for ' +
      SNOOZE_DAYS + ' days.');
    eng.getRange(5 + i, 23).setValue(new Date());
    sent++;
  }
  try { S.toast(sent ? sent + ' reminder(s) sent and snoozed ' + SNOOZE_DAYS + ' days.' : 'Nothing overdue to remind.', 'SCEMS'); } catch (t) {}
  Logger.log('remindOverdue: ' + sent + ' reminder(s) sent.');
}

/* ---- ported from master (effective winner) ---- */
/** v4: v3 plus the audit flag count now includes column G (phase mismatch). */
function dailyChecks() {
  var S = ss();
  var threshold = S.getSheetByName(TAB.CONTROL).getRange('B5').getValue();
  var master = S.getSheetByName(TAB.MASTER).getRange(5, 1, 40, 9).getValues();
  var ftoByTrainee = {}, phaseByTrainee = {};
  master.forEach(function (r) {
    if (r[0]) { ftoByTrainee[r[0]] = r[4]; phaseByTrainee[r[0]] = r[6]; }
  });

  var overdue = [];
  engineRows().forEach(function (r) {
    var days = r[8];
    if (typeof days === 'number' && days > threshold) {
      overdue.push(r[0] + ' : last evaluation ' + days + ' days ago (FTO: ' + (ftoByTrainee[r[0]] || 'unassigned') + ')');
    }
  });
  if (overdue.length) {
    sendMail(CONFIG.TCO_EMAIL,
      'Overdue : No Evaluation in Over ' + threshold + ' Days : ' + overdue.length + ' Trainee(s)',
      'Active trainees require current records.\n\n' + overdue.join('\n') + '\n\nSubmit via the Field Training Hub.');
  }

  var ev = S.getSheetByName(TAB.EVAL);
  var last = ev.getLastRow();
  if (last >= 6) {
    var data = ev.getRange(5, 1, last - 4, 18).getValues();
    var byTrainee = {};
    data.forEach(function (r) { if (r[2]) { (byTrainee[r[2]] = byTrainee[r[2]] || []).push(r); } });
    var flags = [];
    Object.keys(byTrainee).forEach(function (t) {
      var rows = byTrainee[t];
      if (rows.length < 2) return;
      var a = rows[rows.length - 2], b = rows[rows.length - 1];
      DOMAIN_NAMES.forEach(function (d, i) {
        if (a[12 + i] < 3 && b[12 + i] < 3) flags.push(t + ' : ' + d + ' below standard on the last two evaluations');
      });
    });
    if (flags.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Pattern Flag : Domain Below Standard x2',
        flags.join('\n') + '\n\nConsider a coaching plan per the Oversight Dashboard thresholds.');
    }
  }

  var q = S.getSheetByName(TAB.QUEUE);
  var qv = q.getRange(5, 1, 296, 6).getValues();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var breached = [];
  qv.forEach(function (r) {
    var trainee = r[1], due = r[4], decision = r[5];
    if (!trainee || decision) return;
    if (due instanceof Date && due < today) {
      breached.push(trainee + ' : ' + r[2] + ' : was due ' +
        Utilities.formatDate(due, 'America/New_York', 'MM/dd'));
    }
  });
  if (breached.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'BREACH : 72-Hour Decision Window Missed : ' + breached.length + ' Item(s)',
      'These Decision-Required items are past their 72-hour window with no documented decision. The 72-hour promise is the credibility of the reporting system.\n\n' +
      breached.join('\n') + '\n\nFile the decision through the Decision Record form today.');
  }

  var u = S.getSheetByName(TAB.URGENT);
  var uLast = u.getLastRow();
  if (uLast >= 5) {
    var uv = u.getRange(5, 1, uLast - 4, 12).getValues();
    var stale = [];
    uv.forEach(function (r) {
      var ts = r[0], resolution = r[10];
      if (!ts || resolution) return;
      if (ts instanceof Date && (today - ts) / 86400000 > 7) {
        stale.push(r[4] + ' : ' + r[7] + ' : reported ' +
          Utilities.formatDate(ts, 'America/New_York', 'MM/dd'));
      }
    });
    if (stale.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Open Urgent Concerns Past 7 Days : ' + stale.length,
        'These urgent concerns have no Resolution entered on tab 04 column K:\n\n' +
        stale.join('\n') + '\n\nDocument the outcome and the close date.');
    }
  }

  var au = S.getSheetByName('13 AUDIT - EXCEPTION LOG');
  var flagCount = 0;
  au.getRange('B5:G44').getValues().forEach(function (r) {
    r.forEach(function (c) { if (c === 'FLAG') flagCount++; });
  });
  if (flagCount > 0) {
    sendMail(CONFIG.TCO_EMAIL,
      'Audit Flags Standing : ' + flagCount,
      flagCount + ' FLAG(s) are burning on 13 AUDIT - EXCEPTION LOG. Review, act, and log each one on the FLAG REVIEW LOG at the bottom of the tab.');
  }

  // ---- NEW: approved advancement not reflected on the master ----
  var dec = S.getSheetByName(TAB.DECISIONS);
  if (dec && dec.getLastRow() >= 5) {
    var dv = dec.getRange(5, 1, dec.getLastRow() - 4, 9).getValues();
    var stuck = [];
    dv.forEach(function (r) {
      var ts = r[0], trainee = r[3], item = r[4], decision = r[5], phaseThen = r[8];
      if (item !== 'Advancement review' || decision !== 'Approved') return;
      if (!(ts instanceof Date) || (today - ts) / 3600000 / 24 < 2) return;
      var phaseNow = phaseByTrainee[trainee];
      if (phaseNow && phaseThen && phaseNow === phaseThen) {
        stuck.push(trainee + ' : approved ' + Utilities.formatDate(ts, 'America/New_York', 'MM/dd') +
          ' : still shows ' + phaseNow + ' on 01 TRAINEE MASTER');
      }
    });
    if (stuck.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Advancement Approved but Phase Not Updated : ' + stuck.length,
        'These advancements were approved over 48 hours ago and the trainee\'s Current Phase on 01 TRAINEE MASTER has not moved. Phase-scoped counts are stale until it does.\n\n' + stuck.join('\n'));
    }
  }
  // v20.1: keep the trust surfaces current after the daily pass
  try { refreshAnalyticsV20_1(); } catch (eA) { systemLog_('WARN', 'DAILY ANALYTICS REFRESH FAILED', String(eA)); }
  try { homeCountersV20_1(); } catch (eH) { systemLog_('WARN', 'DAILY HOME RECONCILE FAILED', String(eH)); }
}

/* ---- ported from master (effective winner) ---- */








/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 40_skills
 *
 * The skill catalogue, the evidence, the matrix, and what readiness means.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Skill-evidence ingestion: server-side validation, the batched
 *   idempotent evidence writer, and the grid-form submit handler.
 *   INTEGRITY RULES ENFORCED HERE
 *   - Idempotency: form ID + response ID. A retried trigger writes ZERO
 *   additional events.
 *   - Every event carries source form ID and title, source response ID,
 *   and writer version (columns added by migration; the writer refuses
 *   to write when they are missing rather than writing partial rows).
 *   - Validation runs BEFORE any ACCEPTED value exists. Rejected
 *   submissions retain their full payload with VALIDATION RESULT
 *   'REJECTED : reason' — quarantined data, never a skeleton row.
 *   - All events for one response are written in ONE batch, and derived
 *   views rebuild ONCE per response.
 *   - No fuzzy repetition matching: a repetitions line that does not match
 *   exactly one tapped skill counts as one and is reported.
 *   SCEMS v20.1.0h ADD-ON : Record a skill I witnessed
 *   Tab 20 was only ever fed by the form pipeline, so there was no
 *   legal way for the director to put a directly-observed skill on
 *   the record. This adds that door — through the FULL validated
 *   path, not around it.
 */

/* ---- ported from zz (effective winner) ---- */
/** Four numbers instead of a paragraph. */
function compactEvidenceV19_(trainee, skillId) {
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return '';
  var data = m.getRange(5, 1, m.getLastRow() - 4, 20).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(trainee).trim()) continue;
    if (String(data[i][9]).trim() !== String(skillId).trim()) continue;
    return (Number(data[i][10]) || 0) + '  /  ' + (Number(data[i][11]) || 0) +
           '  /  ' + (Number(data[i][12]) || 0) + '  /  ' + (Number(data[i][13]) || 0);
  }
  return '';
}

/* ---- ported from master (effective winner) ---- */
function rebuildSkillMatrixV19_() {
  var S = ss();
  var matrix = S.getSheetByName(TAB.SKILLS);
  var evidence = S.getSheetByName(TAB.SKILL_EVIDENCE);
  var signoff = S.getSheetByName(TAB.SKILL_SIGNOFF);
  if (!matrix || !evidence || !signoff) throw new Error('Skills v19 sheets are incomplete. Run installSkillsV19().');
  ensureSheetCapacityV19_(matrix, 3000, 23);
  var selected = String(matrix.getRange('W2').getValue() || '');
  var trainees = masterTraineeMapV19_();
  var catalog = catalogObjectsV19_(true).filter(function (c) { return c.active; });
  var evRows = evidence.getLastRow() >= 5
    ? evidence.getRange(5, 1, evidence.getLastRow() - 4, 20).getValues() : [];
  var soRows = signoff.getLastRow() >= 5
    ? signoff.getRange(5, 1, signoff.getLastRow() - 4, 12).getValues() : [];
  var eventsByKey = {}, decisionsByKey = {};
  evRows.forEach(function (r) {
    var key = String(r[3]) + '||' + String(r[7]);
    (eventsByKey[key] = eventsByKey[key] || []).push(r);
  });
  soRows.forEach(function (r) {
    var key = String(r[2]) + '||' + String(r[3]);
    (decisionsByKey[key] = decisionsByKey[key] || []).push(r);
  });
  var output = [];
  Object.keys(trainees).sort().forEach(function (name) {
    var person = trainees[name];
    catalog.filter(function (c) { return skillApplicableV19_(c, person.level); })
      .sort(function (a, b) { return (a.domain + '|' + a.skill).localeCompare(b.domain + '|' + b.skill); })
      .forEach(function (c) {
        var key = name + '||' + c.id;
        var allEvents = eventsByKey[key] || [];
        var accepted = allEvents.filter(function (r) { return String(r[18]) === 'ACCEPTED'; });
        var legacy = allEvents.filter(function (r) { return String(r[18]).indexOf('LEGACY IMPORT') === 0; });
        var progressEvents = accepted.filter(function (r) { return String(r[12]) === 'Successful'; });
        var successful = progressEvents.filter(function (r) {
          return String(r[11]) === 'P' || String(r[11]) === 'I';
        });
        var independent = successful.filter(function (r) { return String(r[11]) === 'I'; });
        var stage = '';
        progressEvents.forEach(function (r) {
          if (stageRankV19_(r[11]) > stageRankV19_(stage)) stage = String(r[11]);
        });
        if (!stage && legacy.length) {
          legacy.forEach(function (r) {
            if (stageRankV19_(r[11]) > stageRankV19_(stage)) stage = String(r[11]);
          });
        }
        var lastEvidence = latestByTimestampV19_(accepted.length ? accepted : legacy, 2) ||
          latestByTimestampV19_(accepted.length ? accepted : legacy, 1);
        var lastAnyAccepted = latestByTimestampV19_(accepted, 1);
        var latestOutcome = lastAnyAccepted ? String(lastAnyAccepted[12] || '') : (lastEvidence ? String(lastEvidence[12] || '') : '');
        var decisions = decisionsByKey[key] || [];
        var latestDecision = latestByTimestampV19_(decisions, 1);
        var decision = latestDecision ? String(latestDecision[5] || '') : '';
        var expiration = latestDecision ? latestDecision[8] : '';
        var expired = decision === 'Approve sign-off' && expiration instanceof Date &&
          expiration.getTime() < new Date().setHours(0, 0, 0, 0);
        var decisionMs = latestDecision ? dateMsV19_(latestDecision[1]) : 0;
        var lastAcceptedMs = lastAnyAccepted ? Math.max(dateMsV19_(lastAnyAccepted[1]), dateMsV19_(lastAnyAccepted[2])) : 0;
        var expirationMs = expiration instanceof Date ? expiration.getTime() : 0;
        var revalidationEvidence = expired && lastAcceptedMs > expirationMs;
        var signed = decision === 'Approve sign-off' && !expired;
        var latestUnsafe = latestOutcome === 'Unsuccessful / unsafe';
        var unsafeAfterDecision = accepted.some(function (r) {
          if (String(r[12]) !== 'Unsuccessful / unsafe') return false;
          return Math.max(dateMsV19_(r[1]), dateMsV19_(r[2])) > decisionMs;
        });
        var state = {
          approved: c.status === 'APPROVED',
          legacySignoff: signed && latestDecision &&
            String(latestDecision[6] || '').indexOf('Legacy record') === 0,
          signed: signed,
          expired: expired && !revalidationEvidence,
          latestUnsafe: latestUnsafe,
          latestUnsafeAfterSignoff: signed && unsafeAfterDecision,
          returnedWithoutNewEvidence:
            (decision === 'Return for more evidence' || decision === 'Revoke sign-off') &&
            lastAcceptedMs <= decisionMs,
          legacyOnly: !accepted.length && legacy.length > 0,
          successful: successful.length,
          independent: independent.length,
          distinctDates: uniqueCountV19_(successful.map(function (r) { return dateKeyV19_(r[2]); })),
          distinctFtos: uniqueCountV19_(successful.map(function (r) { return r[6]; })),
          minSuccess: c.minSuccess,
          minIndependent: c.minIndependent,
          minDates: c.minDates,
          minFtos: c.minFtos,
          stage: stage
        };
        var readiness = skillReadinessV19_(state);
        var signoffStatus = expired ? 'EXPIRED' : (signed ? 'SIGNED OFF' : '');
        var note = 'Requires ' + c.minSuccess + ' successful / ' + c.minIndependent +
          ' independent / ' + c.minDates + ' date(s) / ' + c.minFtos + ' FTO(s).';
        if (latestDecision && latestDecision[9]) note += ' Latest decision: ' + latestDecision[9];
        output.push([
          name, c.skill, stage, lastEvidence ? lastEvidence[2] : '',
          lastEvidence ? lastEvidence[6] : '', person.level, readiness, signoffStatus,
          c.domain, c.id, successful.length, independent.length,
          state.distinctDates, state.distinctFtos, latestOutcome,
          lastAnyAccepted ? lastAnyAccepted[10] : (lastEvidence ? lastEvidence[10] : ''),
          signed && latestDecision ? latestDecision[6] : '',
          signed && latestDecision ? latestDecision[7] : '',
          expiration || '', note
        ]);
      });
  });
  // v20.2 — never clear the matrix down to nothing.
  //
  // This clears up to 3,000 rows and then writes `output` only when it has
  // rows. An empty roster, a catalog with no ACTIVE skills, or a level
  // lookup that came back blank therefore wiped the matrix, and everything
  // downstream reads an empty matrix as fact: refreshSkillValidationQueueV19_
  // cancelled the whole open queue as "criteria changed", and the v20.2
  // evidence gate refuses every approval as "not on the matrix".
  //
  // Computing nothing while the sheet holds something is not a valid
  // rebuild — it is a failed read. Say so and leave the previous matrix
  // standing.
  if (!output.length) {
    var hadRows = matrix.getLastRow() >= 5;
    var why = 'Matrix rebuild produced 0 rows. Trainees on the master: ' +
      Object.keys(trainees).length + '. Active catalog skills: ' + catalog.length + '. ' +
      (hadRows ? 'The existing matrix was LEFT IN PLACE rather than cleared.'
               : 'The matrix was already empty; nothing changed.');
    systemLog_('ERROR', 'MATRIX REBUILD PRODUCED NOTHING', why);
    if (hadRows) {
      try { sendMail(CONFIG.TCO_EMAIL, 'SCEMS : matrix rebuild produced nothing', why +
        '\n\nCheck 01 TRAINEE MASTER for trainees and 15 SKILL CATALOG for rows marked ' +
        'ACTIVE. Nothing was cancelled and no records were touched.'); } catch (e) {}
      return;
    }
  }

  ensureSheetCapacityV19_(matrix, Math.max(3000, output.length + 4), 23);
  matrix.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  matrix.getRange(5, 1, matrix.getMaxRows() - 4, 20).clearContent();
  matrix.getRange(4, 1, 1, 20).setValues([SKILL_MATRIX_HEADERS_V19]);
  if (output.length) matrix.getRange(5, 1, output.length, 20).setValues(output);
  matrix.getRange('W2').setValue(selected);
  rewriteEngineSkillMetricV19_();
  refreshSkillValidationQueueV19_();
  applySkillsLayoutV19_();
  if (selected) applySkillMatrixFilterV19_(selected);
}

/* ---- ported from master (effective winner) ---- */
function skillReadinessV19_(state) {
  if (!state.approved) return 'CATALOG APPROVAL REQUIRED';
  if (state.legacySignoff) return 'LEGACY SIGN-OFF REVIEW REQUIRED';
  if (state.signed && state.latestUnsafeAfterSignoff) return 'SIGNED OFF - REVIEW REQUIRED';
  if (state.signed) return 'SIGNED OFF';
  if (state.expired) return 'REVALIDATION REQUIRED';
  if (state.returnedWithoutNewEvidence) return 'MORE EVIDENCE REQUIRED';
  if (state.latestUnsafe) return 'NEEDS REVIEW';
  if (state.legacyOnly) return 'LEGACY REVIEW REQUIRED';
  if (state.successful >= state.minSuccess &&
      state.independent >= state.minIndependent &&
      state.distinctDates >= state.minDates &&
      state.distinctFtos >= state.minFtos) return 'READY FOR VALIDATION';
  if (!state.stage) return 'NOT STARTED';
  return 'IN PROGRESS';
}

/* ---- ported from master (effective winner) ---- */
function latestByTimestampV19_(rows, timestampIndex) {
  if (!rows.length) return null;
  return rows.slice().sort(function (a, b) {
    return dateMsV19_(b[timestampIndex]) - dateMsV19_(a[timestampIndex]);
  })[0];
}

/* ---- ported from master (effective winner) ---- */
function catalogMapsV19_(includeUnapproved) {
  var byId = {}, byName = {};
  catalogObjectsV19_(includeUnapproved).forEach(function (c) {
    byId[c.id] = c;
    byName[normalizeSkillNameV19_(c.skill)] = c;
  });
  return { byId: byId, byName: byName };
}

/* ---- ported from master (effective winner) ---- */
function catalogObjectsV19_(includeUnapproved) {
  var sh = ss().getSheetByName(TAB.CATALOG);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID' || sh.getLastRow() < 5) return [];
  return sh.getRange(5, 1, sh.getLastRow() - 4, 17).getValues()
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r, i) {
      return {
        row: i + 5,
        id: String(r[0]).trim(),
        domain: String(r[1]).trim(),
        skill: String(r[2]).trim(),
        emt: yesV19_(r[3]),
        aemt: yesV19_(r[4]),
        paramedic: yesV19_(r[5]),
        active: yesV19_(r[6]),
        context: String(r[7] || '').trim(),
        minSuccess: Number(r[8]) || 0,
        minIndependent: Number(r[9]) || 0,
        minDates: Number(r[10]) || 0,
        minFtos: Number(r[11]) || 0,
        authority: String(r[12] || '').trim(),
        standard: String(r[13] || '').trim(),
        effective: r[14],
        retire: r[15],
        status: String(r[16] || '').trim()
      };
    })
    .filter(function (c) {
      return includeUnapproved || (c.active && c.status === 'APPROVED');
    });
}

/* ---- ported from master (effective winner) ---- */
function normalizeSkillNameV19_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ---- ported from master (effective winner) ---- */
function skillDomainV19_(skill) {
  var s = normalizeSkillNameV19_(skill);
  if (/airway|intubat|laryng|bvm|opa|npa|suction|oxygen|cpap|cric|surgical airway/.test(s)) return 'Airway / Ventilation';
  if (/12-lead|defib|cardioversion|pacing|cpr|aed|cardiac/.test(s)) return 'Cardiology / Resuscitation';
  if (/\biv\b|\bio\b|vascular|fluid therapy/.test(s)) return 'Vascular Access';
  if (/medication|nitrous|controlled substance|waste|witness/.test(s)) return 'Medication / Pharmacology';
  if (/hemorrhage|tourniquet|splint|spinal|trauma|needle decompression/.test(s)) return 'Trauma';
  if (/assessment|vital|blood glucose|scene size|safety/.test(s)) return 'Assessment';
  if (/radio|epcr|documentation|stretcher|stair chair|olmc/.test(s)) return 'Operations / Communication';
  return 'General Clinical';
}

/* ---- ported from master (effective winner) ---- */
function skillApplicableV19_(catalog, level) {
  if (!catalog) return false;
  if (level === 'EMT') return catalog.emt;
  if (level === 'Advanced EMT') return catalog.aemt;
  if (level === 'Paramedic') return catalog.paramedic;
  return false;
}

/* ---- ported from master (effective winner) ---- */
function applySkillMatrixFilterV19_(trainee) {
  var sh = ss().getSheetByName(TAB.SKILLS);
  if (!sh) return;
  var filter = sh.getFilter();
  if (!filter) filter = sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 2), 20).createFilter();
  if (trainee) {
    filter.setColumnFilterCriteria(1,
      SpreadsheetApp.newFilterCriteria().whenTextEqualTo(trainee).build());
  } else {
    filter.setColumnFilterCriteria(1, null);
  }
}

/* ---- ported from master (effective winner) ---- */
function syncSkillQuickLogFormV19_() {
  var form = getStoredFormV19_(SKILL_FORM_TITLE_V19);
  if (!form) return;
  var choices = approvedSkillChoicesV19_();
  var trainees = traineeList(), ftos = ftoList();
  form.getItems(FormApp.ItemType.LIST).forEach(function (it) {
    var item = it.asListItem(), title = item.getTitle();
    if (title === 'FTO name' && ftos.length) item.setChoiceValues(ftos);
    if (title === 'Trainee' && trainees.length) item.setChoiceValues(trainees);
    if (title === 'Skill') item.setChoiceValues(choices.length ? choices : ['CATALOG APPROVAL REQUIRED']);
  });
  var ready = choices.length > 0 && !skillCatalogIssuesV19_().length && trainees.length && ftos.length;
  try { form.setAcceptingResponses(!!ready); } catch (e) {}
  systemLog_(ready ? 'INFO' : 'WARN', 'SKILL FORM SYNC',
    ready ? choices.length + ' approved skill choices loaded.' : 'Form closed: catalog, trainee roster, or FTO roster is not deployment-ready.');
}

/* ---- ported constant ---- */
/* NOTE FOR REVIEWERS: the original source embeds an ~8KB base64 PNG here.

   It is inert image data and was replaced with a short placeholder so the

   file stays readable. Every code path that touches it is unchanged. */

function hideSkillIdColumnV19_(sh) {
  if (!sh) return;
  var map = {};
  map[TAB.SKILL_VALIDATION] = 3;
  map[TAB.SKILL_EVIDENCE] = 8;
  map[TAB.SKILL_SIGNOFF] = 4;
  var col = map[sh.getName()];
  if (col) { try { sh.hideColumns(col); } catch (e) {} }
}

function phaseMinimumsV19_() {
  var out = { 'EMT': 5, 'Advanced EMT': 6, 'Paramedic': 8 };
  try {
    var sh = ss().getSheetByName(TAB.CONTROL);
    var grid = sh.getRange(1, 1, Math.min(sh.getLastRow(), 40), 3).getValues();
    for (var r = 0; r < grid.length; r++) {
      var label = String(grid[r][0] || '').trim();
      var val = Number(grid[r][1]);
      if (!val) continue;
      if (label === 'EMT' || label === 'Advanced EMT' || label === 'Paramedic') {
        out[label] = val;
      }
    }
  } catch (e) {}
  return out;
}

function rewriteEngineSkillMetricV19_() {
  var eng = ss().getSheetByName(TAB.ENGINE);
  if (!eng) return;
  var matrix = "'" + TAB.SKILLS + "'";
  for (var r = 5; r <= 44; r++) {
    eng.getRange(r, 14).setFormula(
      '=IF($A' + r + '="","",COUNTIFS(' + matrix + '!$A$5:$A$3000,$A' + r + ',' +
      matrix + '!$G$5:$G$3000,"READY FOR VALIDATION"))');
  }
  eng.getRange('N4').setValue('SKILLS READY FOR VALIDATION');
}

function skillCatalogIssuesV19_() {
  var issues = [];
  var sh = ss().getSheetByName(TAB.CATALOG);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID') {
    return ['Skills v19 catalog is not installed.'];
  }
  var rows = catalogObjectsV19_(true);
  var ids = {}, names = {}, activeCount = 0;
  rows.forEach(function (c) {
    if (ids[c.id]) issues.push('Duplicate Skill ID on catalog row ' + c.row + ': ' + c.id + '.');
    ids[c.id] = true;
    var nameKey = normalizeSkillNameV19_(c.skill);
    if (names[nameKey]) issues.push('Duplicate active skill name on catalog row ' + c.row + ': ' + c.skill + '.');
    names[nameKey] = true;
    if (!c.active) return;
    activeCount++;
    if (!/^SK-[A-Z0-9-]+$/.test(c.id)) issues.push('Catalog row ' + c.row + ' has an invalid Skill ID.');
    if (!c.domain) issues.push('Catalog row ' + c.row + ' has no domain.');
    if (!c.emt && !c.aemt && !c.paramedic) issues.push('Catalog row ' + c.row + ' is not assigned to any certification level.');
    var allowedContexts = catalogContextsV19_(c.context);
    var knownContexts = ['Patient care','Simulation','Skills lab','Other approved training'];
    if (!allowedContexts.length || allowedContexts.some(function (v) {
      return knownContexts.indexOf(v) < 0;
    })) {
      issues.push('Catalog row ' + c.row + ' has an invalid allowed-context list.');
    }
    if (!positiveIntV19_(c.minSuccess) || !positiveIntV19_(c.minIndependent) ||
        !positiveIntV19_(c.minDates) || !positiveIntV19_(c.minFtos)) {
      issues.push('Catalog row ' + c.row + ' has an invalid evidence threshold.');
    }
    if (c.minIndependent > c.minSuccess) {
      issues.push('Catalog row ' + c.row + ' requires more Independent reps than total successful reps.');
    }
    if (!c.authority) issues.push('Catalog row ' + c.row + ' has no sign-off authority.');
    if (!c.standard || c.standard.indexOf('SET_ME') >= 0) {
      issues.push('Catalog row ' + c.row + ' has no approved standard/source.');
    }
    if (!(c.effective instanceof Date) || isNaN(c.effective.getTime())) {
      issues.push('Catalog row ' + c.row + ' has no effective date.');
    }
    if (c.retire instanceof Date && c.effective instanceof Date &&
        c.retire.getTime() < c.effective.getTime()) {
      issues.push('Catalog row ' + c.row + ' retires before its effective date.');
    }
    if (c.status !== 'APPROVED') issues.push('Catalog row ' + c.row + ' is active but not APPROVED.');
  });
  if (!activeCount) issues.push('Skill Catalog has no active skills.');
  return issues;
}

function skillDeploymentIssuesV19_() {
  var issues = [];
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SKILLS_V19_INSTALLED') !== 'true') issues.push('Run installSkillsV19().');
  if (props.getProperty('SKILLS_V19_INSTALL_STAGE') !== 'COMPLETE') {
    issues.push('Run installSkillsV19() until checkpoint 2 of 2 is complete.');
  }
  if (props.getProperty('SKILLS_V19_ACTIVE') !== 'true') issues.push('Run activateSkillsV19() after catalog approval.');
  if (props.getProperty('SKILLS_V19_ACTIVATION_STAGE') !== 'COMPLETE') {
    issues.push('Run activateSkillsV19() until checkpoint 3 of 3 is complete.');
  }
  var matrix = ss().getSheetByName(TAB.SKILLS);
  if (!matrix || String(matrix.getRange('A4').getValue()) !== 'TRAINEE') {
    issues.push('Skill Competency Matrix schema is missing.');
  }
  var form = getStoredFormV19_(SKILL_FORM_TITLE_V19);
  if (!form) issues.push('Skills Quick Log form is missing.');
  else {
    try { if (!form.isAcceptingResponses()) issues.push('Skills Quick Log form is closed.'); } catch (e) {
      issues.push('Skills Quick Log form cannot be verified.');
    }
  }
  var log = ss().getSheetByName(TAB.SKILL_SIGNOFF);
  if (log && log.getLastRow() >= 5) {
    var latest = {};
    log.getRange(5, 1, log.getLastRow() - 4, 12).getValues().forEach(function (r, i) {
      var key = String(r[2]) + '||' + String(r[3]);
      r._sheetRowV19 = i + 5;
      if (!latest[key] || dateMsV19_(r[1]) > dateMsV19_(latest[key][1])) latest[key] = r;
    });
    Object.keys(latest).forEach(function (key) {
      var r = latest[key];
      if (String(r[5]) !== 'Approve sign-off') return;
      if (!r[6] || String(r[6]).indexOf('Legacy record') === 0 ||
          !(r[7] instanceof Date) || !String(r[9] || '').trim()) {
        issues.push('Signed skill decision on tab 21 row ' + r._sheetRowV19 +
          ' lacks a reconciled signer, date, or rationale.');
      }
    });
  }
  return issues;
}

/* ---- ported round 5 : final closure helpers ---- */

function catalogContextsV19_(value) {
  return String(value || '').split(/\s*[|,;]\s*/)
    .map(function (v) { return v.trim(); })
    .filter(function (v) { return v; });
}

/* ---------------------------------------------------------------- *
 *  Validation
 * ---------------------------------------------------------------- */

/** Validates one prospective skill event against roster, catalog, scope,
 *  and evidence rules. Returns an array of problems (empty = valid). */
function validateSkillEventV20_1_(ev, catalogEntry, traineeResolved, ftoResolved) {
  var problems = [];

  if (!traineeResolved.ok) {
    problems.push('trainee did not resolve: ' + traineeResolved.reason);
  } else if (traineeResolved.record && traineeResolved.record.closed) {
    problems.push('trainee is closed/released; no new evidence may accrue');
  }

  if (!ftoResolved.ok) {
    problems.push('FTO is not on the approved roster (' + ftoResolved.reason + ')');
  } else if (!ftoResolved.record.active) {
    problems.push('FTO is not active on the roster');
  } else if (traineeResolved.ok && traineeResolved.record &&
             !ftoScopeAllowsV20_1_(ftoResolved.record, traineeResolved.record.level)) {
    problems.push('FTO roster scope does not permit training level ' +
      traineeResolved.record.level);
  }

  if (!catalogEntry) {
    problems.push('skill is not in the approved catalog');
  } else {
    // catalogObjectsV19_ maps the APPROVAL STATUS column to .status, not
    // .approval. Reading .approval rejected every event ever submitted.
    if (String(catalogEntry.status || '').toUpperCase() !== 'APPROVED') {
      problems.push('catalog row is not APPROVED');
    }
    if (traineeResolved.ok && traineeResolved.record &&
        !skillApplicableV19_(catalogEntry, traineeResolved.record.level)) {
      problems.push('skill does not apply to certification level ' + traineeResolved.record.level);
    }
  }

  if (!ev.shiftDate) {
    problems.push('shift date missing or unreadable');
  } else if (!notFutureV20_1_(ev.shiftDate)) {
    problems.push('shift date is in the future');
  }

  if (['O', 'A', 'P', 'I'].indexOf(ev.stage) < 0) {
    problems.push('stage must be Observed, Assisted, Performed with coaching, or Performed independently');
  }
  // Prompting is DERIVED from the stage by promptingForStageV19_, which
  // returns 'None' for Independent. 'No prompting required' is produced by
  // nothing in this project; it is kept only so a future form field using
  // that wording still validates. The check's real job is to reject an
  // Independent stage carrying 'Moderate coaching' or 'Full takeover'.
  if (ev.stage === 'I' && ev.prompting && ev.prompting !== 'None' &&
      ev.prompting !== 'No prompting required' &&
      ev.prompting !== 'Minimal verbal cue') {
    problems.push('Performed independently is inconsistent with prompting "' + ev.prompting + '"');
  }
  var needsNote = ev.stage === 'I' || ev.outcome === 'Unsuccessful / unsafe';
  if (needsNote && !String(ev.note || '').trim()) {
    problems.push('evidence narrative is required for Independent or unsuccessful/unsafe entries');
  }
  if (ev.context === 'Patient care' && catalogEntry && catalogEntry.requiresReference && !String(ev.callRef || '').trim()) {
    problems.push('patient-care events require a call/scenario reference');
  }
  if (!ev.attested) {
    problems.push('attestation is required');
  }
  return problems;
}

/* ---------------------------------------------------------------- *
 *  Batched evidence writer
 * ---------------------------------------------------------------- */

var SKILL_EVIDENCE_REQUIRED_V20_1 = [
  'EVENT ID', 'TIMESTAMP', 'TRAINEE', 'FTO', 'SKILL', 'VALIDATION RESULT',
  'SOURCE FORM', 'SOURCE FORM ID', 'SOURCE RESPONSE ID', 'WRITER VERSION'
];

/** Writes all events for ONE response as ONE batch. Provenance columns
 *  are mandatory; if migration has not added them the writer refuses and
 *  nothing is written. Returns the list of event IDs written. */
function writeSkillEventsBatchV20_1_(events, provenance) {
  if (!events.length) return [];
  var objects = events.map(function (ev) {
    var id = newIdV20_1_('SE');
    ev.eventId = id;
    return {
      'EVENT ID': id,
      'TIMESTAMP': new Date(),
      'SHIFT DATE': ev.shiftDate || '',
      'TRAINEE': ev.traineeName,
      'LEVEL AT EVENT': ev.level || '',
      'PHASE': ev.phase || '',
      'FTO': ev.ftoName,
      'SKILL ID': ev.skillId || '',
      'DOMAIN': ev.domain || '',
      'SKILL': ev.skill,
      'CONTEXT': ev.context || '',
      'STAGE': ev.stage || '',
      'OUTCOME': ev.outcome || '',
      'PROMPTING': ev.prompting || '',
      'CALL / SCENARIO REF': ev.callRef || '',
      'EVIDENCE NOTE': ev.note || '',
      'SOURCE FORM': provenance.formTitle,
      'SOURCE ROW': '',
      'VALIDATION RESULT': ev.validation,
      'ATTESTATION': ev.attested ? 'Attested' : 'NOT ATTESTED',
      'SOURCE FORM ID': provenance.formId,
      'SOURCE RESPONSE ID': provenance.responseId,
      'WRITER VERSION': SCEMS_WRITER_VERSION,
      'PERSON ID': ev.personId || '',
      'ASSIGNMENT ID': ev.assignmentId || ''
    };
  });
  appendRowsHeaderMappedV20_1_(TAB.SKILL_EVIDENCE, 4, objects, SKILL_EVIDENCE_REQUIRED_V20_1);
  return events.map(function (ev) { return ev.eventId; });
}

/* ---------------------------------------------------------------- *
 *  Grid-form parsing
 * ---------------------------------------------------------------- */

/** Strict repetitions parser. "IV access 8" credits IV access with 8.
 *  A line that does not match exactly one offered skill name counts as
 *  one and is returned in unparsed for reporting. (No fuzzy matching.) */
function parseRepsV20_1_(text, offeredSkills) {
  var out = { counts: {}, unparsed: [] };
  String(text || '').split(/[\n;,]+/).forEach(function (chunk) {
    var s = chunk.trim();
    if (!s) return;
    var m = s.match(/^(.*?)[\s:x]+(\d{1,3})$/);
    if (!m) { out.unparsed.push(s); return; }
    var namePart = normalizeNameV20_1_(m[1]);
    var count = Number(m[2]);
    var hits = offeredSkills.filter(function (sk) {
      return normalizeNameV20_1_(sk) === namePart;
    });
    if (hits.length !== 1 || !(count >= 1 && count <= 50)) {
      out.unparsed.push(s);
      return;
    }
    out.counts[hits[0]] = count;
  });
  return out;
}

/** True when the evidence log already holds at least one row sourced from
 *  this form response. The durable write is self-identifying, so this is the
 *  authoritative idempotency check — the ledger is only a bookkeeping mirror
 *  of it and can be stale after a crash. */
function evidenceExistsForResponseV20_2_(responseId) {
  var rid = String(responseId || '').trim();
  if (!rid) return false;
  var t = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  if (!t.ok || t.col['SOURCE RESPONSE ID'] === undefined) return false;
  var ci = t.col['SOURCE RESPONSE ID'];
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][ci] || '').trim() === rid) return true;
  }
  return false;
}

/** PUBLIC HANDLER — name preserved; the form-bound triggers on all four
 *  skills forms keep firing. Fully idempotent via the response ID. */
function onSkillsGridSubmitV20(e) {
  var responseId = '', formId = '', formTitle = '';
  try { responseId = e.response.getId(); } catch (err0) {}
  try {
    if (e.source) { formId = e.source.getId(); formTitle = String(e.source.getTitle() || '').trim(); }
  } catch (err1) {}
  if (!formId && responseId) {
    // replay path: locate the owning stored form by asking each for the response
    var ids0 = storedFormIdsV20_1_();
    for (var fi = 0; fi < ids0.length; fi++) {
      try {
        var cand = FormApp.openById(ids0[fi]);
        if (cand.getResponse(responseId)) {
          formId = cand.getId(); formTitle = String(cand.getTitle() || '').trim(); break;
        }
      } catch (err2) {}
    }
  }
  var key = 'FORM-' + formId + '-' + responseId;

  withScriptLockV20_1_('onSkillsGridSubmitV20', 30000, function () {
    if (ledgerAlreadyDoneV20_1_(key)) {
      systemLog_('WARN', 'DUPLICATE SKILL SUBMISSION SKIPPED', key);
      return;
    }
    var haveLedger = !!getSheetOrNullV20_1_(TAB.LEDGER);
    // v20.2: reuse the row a failed attempt left behind. Opening a fresh row
    // per attempt gave one response several ledger rows, so ledgerFind could
    // answer from a stale one and the exception report double-counted.
    var ledgerRow = 0;
    if (haveLedger) {
      ledgerRow = ledgerFindV20_1_(key) ||
        ledgerOpenV20_1_(key, formId, responseId, formTitle, 'skills');
    }

    // v20.2: evidence rows carry SOURCE RESPONSE ID, so the durable write is
    // self-identifying. If a previous attempt already expanded this response,
    // re-expanding would append the whole submission a second time — which is
    // what happened whenever the post-write mail step threw.
    var alreadyWritten = evidenceExistsForResponseV20_2_(responseId);
    if (alreadyWritten) {
      if (haveLedger) ledgerSetV20_1_(ledgerRow, 'RECONCILED',
        'Evidence for this response is already on ' + TAB.SKILL_EVIDENCE +
        '; a previous attempt wrote it. Nothing re-expanded.');
      systemLog_('WARN', 'SKILLS SUBMISSION ALREADY EXPANDED', key);
      return;
    }

    try {
      var header = {}, grids = [], reps = {}, labReps = '';
      var failed = [], note = '', attested = false, refCall = '';
      e.response.getItemResponses().forEach(function (r) {
        var item = r.getItem();
        var title = String(item.getTitle() || '');
        var type = String(item.getType());
        var resp = r.getResponse();
        if (type === 'GRID') {
          grids.push({ title: title, isLab: title === LAB_GRID_TITLE_V20,
                       rows: item.asGridItem().getRows(), answers: resp });
        } else if (title === LAB_REPS_TITLE_V20) {
          labReps = String(resp || '');
        } else if (title.indexOf(REPS_SUFFIX_V20) > 0) {
          reps[title.replace(REPS_SUFFIX_V20, '')] = String(resp || '');
        } else if (title === 'Any skill above unsuccessful or unsafe') {
          failed = Array.isArray(resp) ? resp : (resp ? [resp] : []);
        } else if (title === 'Evidence note') {
          note = String(resp || '');
        } else if (title === 'Reference call') {
          refCall = String(resp || '').trim();
        } else if (title === 'Attestation') {
          attested = !!resp;
        } else {
          header[title] = String(resp || '');
        }
      });

      var ftoName = cleanNameV20_1_(header['FTO name'] || '');
      var traineeName = cleanNameV20_1_(header['Trainee'] || '');
      var shiftDate = parseDateSafeV20_1_(header['Shift date'] || '');
      var traineeResolved = resolveTraineeV20_1_(traineeName);
      var ftoResolved = resolveFtoV20_1_(ftoName);

      // Verified-identity check: when the form captured a verified
      // respondent email, the submitting ACCOUNT must be the selected FTO
      // (or leadership). A mismatch rejects every event in the submission.
      // When no email could be captured, or the roster carries no email
      // for this FTO yet, the submission proceeds flagged UNVERIFIED —
      // migration's roster-email fill closes that gap.
      var respondentEmail = '';
      try { respondentEmail = String(e.response.getRespondentEmail() || '').trim().toLowerCase(); } catch (eRE) {}
      var identityProblem = '';
      var identityFlag = '';
      if (respondentEmail && isValidEmailV20_1_(respondentEmail)) {
        var actor0 = resolveAuthorizedActorV20_1_(respondentEmail);
        var isLeader0 = actor0.ok && (actor0.roles.indexOf('PROGRAM_DIRECTOR') >= 0 ||
          actor0.roles.indexOf('TRAINING_DIVISION') >= 0 ||
          actor0.roles.indexOf('COMMAND') >= 0 || actor0.roles.indexOf('MEDICAL_DIRECTOR') >= 0);
        if (actor0.person && actor0.person.type === 'FTO') {
          if (ftoResolved.ok && actor0.person.norm !== ftoResolved.record.norm && !isLeader0) {
            identityProblem = 'submitting account (' + respondentEmail +
              ') is FTO "' + actor0.person.name + '", not the selected FTO "' + ftoName + '"';
          }
        } else if (!isLeader0) {
          // No registry person carries this email yet. During rollout —
          // before the roster EMAIL column is filled — this is
          // UNVERIFIABLE, not unauthorized: accept, flag, and log.
          // Hard rejection applies only to a POSITIVE mismatch (the
          // account verifiably belongs to a different FTO), above.
          identityFlag = 'IDENTITY UNVERIFIED (' + respondentEmail +
            ' is not yet on the roster allowlist)';
        }
      } else {
        identityFlag = 'IDENTITY UNVERIFIED (no verified email captured by the form)';
      }
      if (identityFlag) {
        systemLog_('WARN', 'SKILLS IDENTITY UNVERIFIED', key + ' | ' + identityFlag);
      }
      var maps = catalogMapsV19_(true);

      var prospective = [], unparsedAll = [];
      grids.forEach(function (grid) {
        var tapped = [];
        (grid.answers || []).forEach(function (answer, i) {
          if (!answer) return;
          var letter = stageLetterV19_(answer);
          if (!letter) return;
          tapped.push({ skill: grid.rows[i], stage: letter });
        });
        if (!tapped.length) return;
        var text = grid.isLab ? labReps : (reps[grid.title] || '');
        var parsed = parseRepsV20_1_(text, tapped.map(function (t) { return t.skill; }));
        parsed.unparsed.forEach(function (u) {
          unparsedAll.push((grid.isLab ? 'classroom' : grid.title) + ' : "' + u + '"');
        });
        tapped.forEach(function (t) {
          var count = parsed.counts[t.skill] || 1;
          for (var n = 0; n < count; n++) {
            var catalogEntry = maps.byName[normalizeSkillNameV19_(t.skill)] || null;
            prospective.push({
              skill: t.skill,
              skillId: catalogEntry ? catalogEntry.id : '',
              domain: grid.isLab ? (catalogEntry ? catalogEntry.domain : '') : grid.title,
              stage: t.stage,
              context: grid.isLab ? 'Skills lab' : 'Patient care',
              callRef: grid.isLab ? '' : refCall,
              outcome: failed.indexOf(t.skill) >= 0 ? 'Unsuccessful / unsafe' : 'Successful',
              prompting: promptingForStageV19_(t.stage),
              note: note,
              attested: attested,
              shiftDate: shiftDate,
              traineeName: traineeName,
              ftoName: ftoName,
              level: traineeResolved.ok && traineeResolved.record ? traineeResolved.record.level : '',
              phase: traineeResolved.ok && traineeResolved.record ? traineeResolved.record.phase : '',
              personId: traineeResolved.personId || '',
              catalogEntry: catalogEntry
            });
          }
        });
      });

      if (!prospective.length) {
        if (haveLedger) ledgerSetV20_1_(ledgerRow, 'PROCESSED', 'no stages tapped; nothing recorded', '0');
        sendMail(CONFIG.TCO_EMAIL, 'Skills Quick Log : nothing recorded',
          ftoName + ' submitted the Skills Quick Log for ' + traineeName +
          ' but did not tap a stage for any skill.\n\nNothing was recorded.');
        systemLog_('WARN', 'SKILLS SUBMISSION EMPTY', ftoName + ' for ' + traineeName + ' | ' + key);
        return;
      }

      var accepted = 0, rejected = 0, reasonsSeen = {};
      prospective.forEach(function (ev) {
        var problems = validateSkillEventV20_1_(ev, ev.catalogEntry, traineeResolved, ftoResolved);
        if (identityProblem) problems.push(identityProblem);
        if (problems.length) {
          ev.validation = 'REJECTED : ' + problems.join('; ');
          rejected++;
          problems.forEach(function (p) { reasonsSeen[p] = true; });
        } else {
          ev.validation = EV_ACCEPTED_V19;
          accepted++;
        }
      });

      var eventIds = writeSkillEventsBatchV20_1_(prospective, {
        formId: formId, formTitle: formTitle || 'SCEMS Skills Quick Log', responseId: responseId
      });

      if (accepted > 0) {
        try { rebuildSkillMatrixV19_(); } catch (err2) {
          systemLog_('ERROR', 'MATRIX REBUILD FAILED AFTER SUBMISSION', key + ' | ' + err2);
        }
      }
      if (rejected > 0) {
        sendMail(CONFIG.TCO_EMAIL,
          'Skill evidence rejected : ' + (traineeName || 'unresolved trainee') + ' : ' + rejected + ' event(s)',
          'Submission ' + key + ' by ' + (ftoName || 'unresolved FTO') + '.\n\n' +
          accepted + ' event(s) accepted, ' + rejected + ' rejected and quarantined with full detail on ' +
          TAB.SKILL_EVIDENCE + '.\n\nReasons seen:\n- ' + Object.keys(reasonsSeen).join('\n- ') +
          '\n\nNo competency state was changed by the rejected events.');
      }
      // An unsafe outcome is a safety signal in its own right, so it is NOT
      // gated on validation. A rejected event accrues no competency evidence
      // and would otherwise be visible to nobody — which is exactly the case
      // where somebody needs to hear about it.
      var unsafe = prospective.filter(function (ev) {
        return ev.outcome === 'Unsuccessful / unsafe';
      });
      if (unsafe.length) {
        var unsafeRejected = unsafe.filter(function (ev) {
          return ev.validation !== EV_ACCEPTED_V19;
        });
        sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
          'URGENT : Skill Event Unsuccessful / Unsafe : ' + traineeName,
          'FTO ' + ftoName + ' recorded ' + unsafe.length + ' unsuccessful/unsafe skill event(s) on ' +
          dateKeyV20_1_(shiftDate) + ':\n\n' +
          unsafe.map(function (ev) {
            return '- ' + ev.skill + ' (' + ev.context + ')' +
              (ev.validation === EV_ACCEPTED_V19 ? '' : '\n     NOT RECORDED : ' + ev.validation);
          }).join('\n') +
          '\n\nEvidence: ' + note + '\nCall/scenario: ' + (refCall || 'not provided') +
          (unsafeRejected.length
            ? '\n\nNOTE: ' + unsafeRejected.length + ' of the above did not pass validation, so no ' +
              'competency\nevidence was recorded for them. The safety concern still stands — a ' +
              'rejection\nis a bookkeeping defect, not a judgement about what happened on the call.'
            : '') +
          '\n\nReview the Skill Evidence Log and determine immediate training restrictions.');
      }
      if (unparsedAll.length) {
        sendMail(CONFIG.TCO_EMAIL, 'Skills Quick Log : repetitions not understood',
          ftoName + ' logged skills for ' + traineeName + ' on ' + dateKeyV20_1_(shiftDate) + '.\n\n' +
          'These repetition entries could not be matched to exactly one skill,\n' +
          'so each counted as one:\n\n  ' + unparsedAll.join('\n  ') +
          '\n\nExpected format: the skill name then a number, e.g. "IV access 8".');
        systemLog_('WARN', 'REPS NOT PARSED', key + ' | ' + unparsedAll.join(' | ').slice(0, 300));
      }

      if (haveLedger) ledgerSetV20_1_(ledgerRow, 'PROCESSED',
        accepted + ' accepted, ' + rejected + ' rejected', eventIds.join(',').slice(0, 450));
      systemLog_('INFO', 'SKILLS SUBMISSION EXPANDED',
        prospective.length + ' event(s) (' + accepted + ' accepted) from one submission by ' +
        ftoName + ' for ' + traineeName + ' | ' + key);
    } catch (err) {
      // Same rule as the hub handler: a throw after the evidence rows landed
      // must not be recorded as though nothing was written.
      var wroteEvidence = evidenceExistsForResponseV20_2_(responseId);
      if (haveLedger) {
        ledgerSetV20_1_(ledgerRow, wroteEvidence ? 'FAILED_AFTER_WRITE' : 'FAILED',
          (wroteEvidence ? '[Evidence IS on ' + TAB.SKILL_EVIDENCE + '; a later step failed. ' +
                           'Do not replay blind.] ' : '') + String(err));
      }
      systemLog_('ERROR', wroteEvidence ? 'SKILLS SUBMIT FAILED AFTER WRITE' : 'SKILLS SUBMIT FAILED',
        key + ' | ' + err);
      throw err;
    }
  });
}

/** Legacy single-skill handler name, retained because old references may
 *  exist. It no longer writes anything: combined-form submissions are
 *  owned by onSkillsGridSubmitV20, and the hub router defers to it. */
function handleSkillQuickLogV19_(vals, e) {
  systemLog_('WARN', 'LEGACY SKILL HANDLER CALLED',
    'handleSkillQuickLogV19_ is retired; skills ingestion is owned by onSkillsGridSubmitV20. No row written.');
}

/* ---------------------------------------------------------------- *
 *  Read-only skills verification (part of the release controls)
 * ---------------------------------------------------------------- */

/** READ-ONLY: form scope, evidence rules, idempotency wiring, provenance
 *  coverage, and queue agreement. Writes nothing anywhere. */
function verifySkillsV20_1() {
  var L = ['SKILLS VERIFICATION — READ ONLY', ''];

  L.push(verifyLevelFormsV20_1());
  L.push('');

  var t = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  if (!t.ok) { L.push('Evidence log missing.'); return L.join('\n'); }
  var total = 0, withRespId = 0, accepted = 0, rejected = 0, legacy = 0, missingProv = 0;
  var hasRespCol = t.col['SOURCE RESPONSE ID'] !== undefined;
  t.rows.forEach(function (r) {
    var id = String(r[t.col['EVENT ID']] || '');
    if (!id) return;
    total++;
    var vr = String(r[t.col['VALIDATION RESULT']] || '');
    if (vr === EV_ACCEPTED_V19) accepted++;
    else if (vr.indexOf('REJECTED') === 0) rejected++;
    else if (vr.indexOf('LEGACY') === 0) legacy++;
    if (hasRespCol && String(r[t.col['SOURCE RESPONSE ID']] || '')) withRespId++;
    else if (hasRespCol && id.indexOf('LEGACY') !== 0) missingProv++;
  });
  L.push('Evidence events: ' + total + ' (' + accepted + ' accepted, ' + rejected +
         ' rejected, ' + legacy + ' legacy-review)');
  L.push(hasRespCol
    ? 'Response-ID provenance: ' + withRespId + ' of ' + total +
      ' (' + missingProv + ' pre-v20.1 rows lack it; historical, listed by the audit)'
    : 'PROVENANCE COLUMNS NOT PRESENT — run previewMigrationV20_1() / applyMigrationV20_1(). The v20.1 writer will refuse to write until they exist.');

  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  L.push(ledger.ok ? 'Ingestion ledger present.' : 'Ingestion ledger NOT present (pre-migration).');

  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  if (q.ok && so.ok) {
    var openN = 0, recordedN = 0, strandedN = 0;
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      var st = String(r[q.col['RECORD STATUS']] || '');
      if (st === 'OPEN') {
        openN++;
        if (String(r[q.col['DECISION']] || '').trim()) strandedN++;
      }
      if (st === 'RECORDED') recordedN++;
    });
    var soN = so.rows.filter(function (r) { return String(r[so.col['DECISION ID']] || ''); }).length;
    L.push('Queue: ' + openN + ' open (' + strandedN + ' stranded with decisions filled), ' +
           recordedN + ' recorded. Sign-off log: ' + soN + ' decisions.');
    if (strandedN) L.push('  → stranded rows require the previewed migration in 50_decisions, not a re-click.');
  }

  var triggers = ScriptApp.getProjectTriggers().map(function (tr) { return tr.getHandlerFunction(); });
  ['onSkillsGridSubmitV20', 'onHubFormSubmit'].forEach(function (h) {
    L.push('Trigger handler "' + h + '": ' +
      (triggers.indexOf(h) >= 0 ? 'wired' : 'NOT WIRED'));
  });

  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* Legacy menu names → safe no-ops (pattern retained from v19.0.4). */
function buildSkillsSystem() { return installSkillsV19(); }

function recordSkillDirectV20_1() {
  if (!gateV20_2_('RECORD WITNESSED SKILL')) return;
  var ui = SpreadsheetApp.getUi();

  var r1 = ui.prompt('Record a skill (1 of 4)',
    'Trainee name as shown on 01 TRAINEE MASTER:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var resolved = resolveTraineeV20_1_(String(r1.getResponseText() || '').trim());
  if (!resolved.ok || !resolved.record) {
    ui.alert('Could not resolve that trainee: ' + resolved.reason +
      (resolved.ambiguous && resolved.ambiguous.length
        ? '\nCandidates: ' + resolved.ambiguous.join(', ') : ''));
    return;
  }
  var rec = resolved.record;
  if (rec.closed) { ui.alert(rec.name + ' is closed/released. Nothing recorded.'); return; }

  var all = catalogObjectsV19_(false);
  var pool = all.filter(function (c) { return skillApplicableV19_(c, rec.level); });
  if (!pool.length) pool = all; // unknown level string: offer the whole approved catalog

  var r2 = ui.prompt('Record a skill (2 of 4)',
    rec.name + ' (' + rec.level + ')\n\nSkill name or SKILL ID (example SK-EMT-014):',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var wanted = String(r2.getResponseText() || '').trim();
  if (!wanted) return;

  var chosen = null;
  var wantedId = wanted.toUpperCase();
  var wantedName = normalizeSkillNameV19_(wanted);
  pool.forEach(function (c) {
    if (c.id.toUpperCase() === wantedId) chosen = c;
  });
  if (!chosen) {
    pool.forEach(function (c) {
      if (normalizeSkillNameV19_(c.skill) === wantedName) chosen = c;
    });
  }
  if (!chosen) {
    var hits = pool.filter(function (c) {
      return normalizeSkillNameV19_(c.skill).indexOf(wantedName) >= 0;
    });
    if (hits.length === 1) {
      chosen = hits[0];
    } else if (hits.length > 1 && hits.length <= 8) {
      var listing = hits.map(function (c, i) {
        return (i + 1) + ' = ' + c.skill + '  (' + c.id + ')'; }).join('\n');
      var r2b = ui.prompt('Which one?',
        '"' + wanted + '" matches ' + hits.length + ' skills.\nType the number:\n\n' + listing,
        ui.ButtonSet.OK_CANCEL);
      if (r2b.getSelectedButton() !== ui.Button.OK) return;
      var pick = parseInt(String(r2b.getResponseText() || '').trim(), 10);
      if (pick >= 1 && pick <= hits.length) chosen = hits[pick - 1];
    } else if (hits.length > 8) {
      ui.alert('"' + wanted + '" matches ' + hits.length + ' skills — be more specific.\n\nFirst few:\n' +
        hits.slice(0, 10).map(function (c) { return '  ' + c.skill + ' (' + c.id + ')'; }).join('\n'));
      return;
    }
  }
  if (!chosen) {
    ui.alert('No approved skill matched "' + wanted + '" for ' + rec.level + '.\n\nExamples from the catalog:\n' +
      pool.slice(0, 12).map(function (c) { return '  ' + c.skill + ' (' + c.id + ')'; }).join('\n') +
      (pool.length > 12 ? '\n  …and ' + (pool.length - 12) + ' more on 15 SKILL CATALOG' : ''));
    return;
  }

  var r3 = ui.prompt('Record a skill (3 of 4)',
    'Date you observed it (example 8/14/2026).\nLeave BLANK for today:', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var dText = String(r3.getResponseText() || '').trim();
  var when = dText ? parseDateSafeV20_1_(dText) : new Date();
  if (!when) { ui.alert('Could not read that date. Nothing recorded. Try 8/14/2026.'); return; }

  var r4 = ui.prompt('Record a skill (4 of 4)',
    'Rationale for the record.\nLeave BLANK for: "Directly observed and verified by the FTO Program Director"',
    ui.ButtonSet.OK_CANCEL);
  if (r4.getSelectedButton() !== ui.Button.OK) return;
  var rationale = String(r4.getResponseText() || '').trim() ||
    'Directly observed and verified by the FTO Program Director';
  if (rationale.indexOf('[direct entry]') < 0) rationale += ' [direct entry]';

  // honest duplicate check across the whole sign-off log, IDs or not
  var idx = signoffIndexV20_1_();
  var already = idx.rows.filter(function (a) {
    return normalizeNameV20_1_(a.trainee) === normalizeNameV20_1_(rec.name) &&
           a.skillId === chosen.id && a.decision === 'Approve sign-off';
  });
  if (already.length) {
    var warn = rec.name + ' already has an Approve sign-off for ' + chosen.skill +
      ' (' + already[0].decisionId + (already[0].decisionDate ? ', ' + dateKeyV20_1_(already[0].decisionDate) : '') +
      ').\n\nRecord another one anyway?';
    if (ui.alert('Already signed off', warn, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
      return;
    }
  }

  var decider = sessionEmailV20_1_() || 'C. Hunt';
  var confirmMsg = rec.name + ' (' + rec.level + ')\n' + chosen.skill + '  [' + chosen.id + ']' +
    '\n\nApprove sign-off\nObserved : ' + dateKeyV20_1_(when) +
    '\nDecided by : ' + decider + '\nRationale : ' + rationale +
    '\n\nThis writes a permanent record. Proceed?';
  if (ui.alert('Confirm', confirmMsg, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;

  var qr = newIdV20_1_('QR');
  appendRowsHeaderMappedV20_1_(TAB.SKILL_VALIDATION, 4, [{
    'TRAINEE': rec.name, 'SKILL': chosen.skill, 'SKILL ID': chosen.id,
    'DECISION': 'Approve sign-off', 'DECIDED BY': decider, 'DECISION DATE': when,
    'RATIONALE': rationale, 'RECORD STATUS': 'OPEN', 'REQUEST ID': qr
  }], ['TRAINEE', 'SKILL', 'SKILL ID', 'RECORD STATUS', 'REQUEST ID']);

  var t = queueTableV20_1_(), rowNum = 0;
  if (t.ok) {
    t.rows.forEach(function (r, i) {
      if (String(r[t.col['REQUEST ID']] || '').trim() === qr) rowNum = t.firstDataRow + i;
    });
  }
  if (!rowNum) {
    ui.alert('The request row was created (' + qr + ') but could not be found again — ' +
      'nothing recorded yet. Tell Claude; nothing is lost.');
    return;
  }
  var out = recordDecisionForRowV20_1_(rowNum);
  var homeNote = '';
  try { refreshHomeNowV20_1(); homeNote = '\nHOME page updated.'; } catch (eH) {}
  ui.alert(out + homeNote);
}


/* ====================================================================== */
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
  var resp = ui.prompt('Close / release trainee',
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


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 60_reporting
 *
 * Digests, scoreboards, snapshots and cards. Everything that gets read,
 * nothing that decides.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   5. MONTHLY BACKUP SNAPSHOT
 *   Trustworthy analytics: canonical recomputation, DATA ERROR surfacing,
 *   reconciliation totals, and the read-only analytics verifier.
 *   PRINCIPLES
 *   - Metrics are computed from validated canonical data in code, not from
 *   IFERROR-wrapped mega-formulas. A failed prerequisite yields the
 *   literal string 'DATA ERROR' plus a health note — never a silent 0.
 *   - Bounds are dynamic: readers use header-mapped tables and last-row
 *   logic, never $5:$44-style fixed windows.
 *   - verifyAnalyticsV20_1() recomputes and COMPARES; it never writes.
 *   SCEMS v20.1.0i ADD-ON : FTO scoreboard
 *   SCEMS v20.1.0i ADD-ON : tab 13 redo
 */

/* ---- ported from zz (effective winner) ---- */
/** Builds the snapshot for one trainee. */
function handoverCardBodyV19_(traineeName) {
  var S = ss();
  var name = String(traineeName || '').trim();
  var rec = traineeRecordV19_(name);
  if (!rec) return null;

  var L = [];
  L.push('TRAINEE HANDOVER CARD');
  L.push('');
  L.push(name + '   ' + (rec.level || 'level not set'));
  L.push('Usual FTO : ' + (rec.fto || 'unassigned'));
  L.push('');

  // ---- where they are ----
  var eng = S.getSheetByName(TAB.ENGINE);
  var e = null;
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) { e = rows[i]; break; }
    }
  }
  L.push('WHERE THEY ARE');
  L.push('  Phase        : ' + (rec.phase || 'not set') +
         (e && e[20] ? ', day ' + e[20] : ''));
  if (e) {
    L.push('  Shifts       : ' + (e[19] || 'not recorded'));
    L.push('  Evaluations  : ' + (e[6] || 0) +
           (e[8] !== '' && e[8] !== null ? ', last one ' + e[8] + ' day(s) ago' : ', none yet'));
    if (e[9]) L.push('  Average      : ' + e[9] + (e[11] ? '   trend ' + e[11] : ''));
    L.push('  Status       : ' + (e[17] || 'not set'));
  }
  L.push('');

  // ---- what they are working on ----
  var focus = '';
  try {
    var v9 = S.getSheetByName('09 TRAINEE VIEW');
    if (v9) {
      var vr = v9.getRange(5, 1, 40, 9).getValues();
      for (var j = 0; j < vr.length; j++) {
        if (String(vr[j][0]).trim() === name) { focus = String(vr[j][8] || ''); break; }
      }
    }
  } catch (err) {}
  L.push('WHAT THEY ARE WORKING ON');
  L.push('  ' + (focus || 'Not set. Agree a focus with them at the start of the shift.'));
  L.push('');

  // ---- skills ----
  var matrix = S.getSheetByName(TAB.SKILLS);
  var signed = [], progress = [], ready = [];
  if (matrix && matrix.getLastRow() >= 5) {
    matrix.getRange(5, 1, matrix.getLastRow() - 4, 20).getValues().forEach(function (r) {
      if (String(r[0]).trim() !== name) return;
      var skill = String(r[1] || '');
      var readiness = String(r[6] || '');
      var signoff = String(r[7] || '');
      if (signoff === 'SIGNED OFF') signed.push(skill);
      else if (readiness === 'READY FOR VALIDATION') ready.push(skill);
      else if (readiness === 'IN PROGRESS') progress.push(skill);
    });
  }
  L.push('SKILLS');
  L.push('  Signed off (' + signed.length + ')');
  if (signed.length) {
    signed.slice(0, 12).forEach(function (s) { L.push('     ' + s); });
    if (signed.length > 12) L.push('     and ' + (signed.length - 12) + ' more');
  } else {
    L.push('     none yet');
  }
  L.push('');
  L.push('  In progress (' + progress.length + ')');
  if (progress.length) {
    progress.slice(0, 12).forEach(function (s) { L.push('     ' + s); });
    if (progress.length > 12) L.push('     and ' + (progress.length - 12) + ' more');
  } else {
    L.push('     none recorded');
  }
  if (ready.length) {
    L.push('');
    L.push('  Awaiting validation (' + ready.length + ')');
    ready.forEach(function (s) { L.push('     ' + s); });
    L.push('     These are with leadership. Do not sign them off yourself.');
  }
  L.push('');

  L.push('ON SHIFT');
  L.push('  Submit a Shift Evaluation before you go home, the same as their');
  L.push('  usual FTO would. Score what you actually saw. If a skill');
  L.push('  progressed, log it.');
  L.push('');
  L.push('  You are covering, so you are not expected to judge their whole');
  L.push('  progression. Record the shift you had with them.');
  L.push('');
  L.push('  Anything unsafe is a call to Division Chief Stuckey the same');
  L.push('  shift, then the Urgent Concern form.');
  L.push('');
  L.push('No patient names, dates of birth, or addresses. Call numbers only.');
  L.push('');
  L.push('This card is an operational snapshot. It does not carry concerns,');
  L.push('decisions, or another FTO\'s assessment of this trainee.');

  return L.join('\n');
}

function traineeStatusCards() {
  var S = ss();
  var master = S.getSheetByName(TAB.MASTER).getRange(5, 1, 40, 9).getValues();
  var emailByTrainee = {};
  master.forEach(function (r) { if (r[0] && r[8]) emailByTrainee[r[0]] = r[8]; });
  var skipped = [];
  master.forEach(function (r) {
    if (r[0] && !r[8] && String(r[0]).indexOf('EXAMPLE') !== 0) skipped.push(r[0]);
  });
  var view = S.getSheetByName('09 TRAINEE VIEW').getRange(5, 1, 40, 12).getValues();
  var sentN = 0, unsent = [];
  view.forEach(function (r) {
    if (!r[0] || !emailByTrainee[r[0]] || String(r[0]).indexOf('EXAMPLE') === 0) return;
    if (!mailBudgetOkV20_2_('Trainee status cards', sentN + 1)) { unsent.push(String(r[0])); return; }
    var due = r[10] instanceof Date ? Utilities.formatDate(r[10], 'America/New_York', 'yyyy-MM-dd') : 'none scheduled';
    var body =
      'Your field training status, ' + r[0] + ':\n\n' +
      'Level: ' + r[1] + '  |  Entry Profile: ' + r[2] + '  |  ' + r[3] + '\n' +
      'Training shifts logged: ' + r[4] + '  |  Trend: ' + r[5] + '\n\n' +
      'A recent strength your FTO documented: ' + (r[6] || 'none logged yet') + '\n' +
      'Current improvement focus: ' + (r[7] || 'none logged yet') + '\n' +
      'Next shift focus: ' + (r[8] || 'set with your FTO') + '\n' +
      'Skills ready for leadership validation: ' + r[9] + '\n' +
      'Next decision due: ' + due + '\n' +
      'Note: ' + (r[11] || '') + '\n\n' +
      'Questions about your status go to your FTO or the Training and Compliance Officer.';
    sendMail(emailByTrainee[r[0]], 'Your Field Training Status : Week of ' +
      Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd'), body);
    sentN++;
  });
  reportBulkTruncationV20_2_('Trainee status cards', sentN, unsent);
  if (skipped.length) {
    sendMail(CONFIG.TCO_EMAIL,
      'Trainee Cards : ' + skipped.length + ' Trainee(s) Have No Email on File',
      'These trainees received no status card because column I on 01 TRAINEE MASTER is blank:\n\n' +
      skipped.join('\n') + '\n\nAdd their email addresses so they get their Monday card.');
  }
}

/* ---- ported from master (effective winner) ---- */
/** v3: branded HTML snapshot. */
function supervisorDigest() {
  var S = ss();
  var ctl = S.getSheetByName(TAB.CONTROL);
  var threshold = ctl.getRange('B5').getValue();

  var roster = ctl.getRange(5, 6, 25, 2).getValues();
  var shiftByFto = {};
  roster.forEach(function (r) { if (r[0]) shiftByFto[String(r[0])] = String(r[1]); });

  var sup = ctl.getRange(5, 13, 4, 3).getValues();
  var supByShift = {};
  sup.forEach(function (r) { if (r[0]) supByShift[String(r[0])] = { name: r[1], email: r[2] }; });

  var view = S.getSheetByName('09 TRAINEE VIEW').getRange(5, 1, 40, 9).getValues();
  var extras = {};
  view.forEach(function (r) { if (r[0]) extras[r[0]] = { strength: r[6], focus: r[8] }; });

  var ev = S.getSheetByName(TAB.EVAL);
  var firstEval = {};
  if (ev.getLastRow() >= 5) {
    ev.getRange(5, 1, ev.getLastRow() - 4, 7).getValues().forEach(function (r) {
      var t = r[2], dt = r[6];
      if (!t || !(dt instanceof Date)) return;
      if (!firstEval[t] || dt < firstEval[t]) firstEval[t] = dt;
    });
  }

  var byShift = {};
  engineRows().forEach(function (r) {
    var name = r[0];
    if (!name || String(name).indexOf(TEST_PREFIX) === 0) return;
    var shift = shiftByFto[String(r[3] || '')] || 'UNASSIGNED';
    (byShift[shift] = byShift[shift] || []).push(r);
  });

  var now = new Date();
  var week = Utilities.formatDate(now, 'America/New_York', 'MMMM d, yyyy');

  var digestSent = 0, digestUnsent = [];
  Object.keys(byShift).forEach(function (shift) {
    if (!mailBudgetOkV20_2_('Supervisor digest', digestSent + 1)) {
      digestUnsent.push(shift + ' shift');
      return;
    }
    var cards = [], textBlocks = [];
    byShift[shift].forEach(function (r) {
      var name = r[0], level = r[1], fto = r[3] || 'unassigned', phase = String(r[4] || ''),
          evals = r[6] || 0, daysSince = r[8], avg = r[9], trend = r[11], status = r[17];
      var ex = extras[name] || {};
      var weeksIn = firstEval[name]
        ? Math.max(1, Math.round((now - firstEval[name]) / (7 * 86400000))) : 0;
      var overdue = (typeof daysSince === 'number') && daysSince > threshold;
      var ftoText;
      if (typeof daysSince !== 'number') ftoText = fto + ' : no evaluations submitted yet';
      else if (overdue) ftoText = fto + ' : PAPERWORK OVERDUE, last evaluation ' + daysSince + ' days ago';
      else ftoText = fto + ' : paperwork current';
      var trendWord = trend === 'Rising' ? 'improving' : trend === 'Falling' ? 'slipping' : trend === 'Steady' ? 'holding steady' : '';

      var o = {
        name: name, level: level, phaseNum: phase.replace('Phase ', '') || '?',
        weeksIn: weeksIn, evals: evals, avg: avg, trendWord: trendWord,
        strength: ex.strength || 'nothing documented yet',
        focus: ex.focus || 'set at the start of each shift',
        fto: fto, ftoText: ftoText, ftoOverdue: overdue,
        daysSince: daysSince, status: status
      };
      cards.push(traineeCard_(o));
      textBlocks.push(name + ' (' + level + ', ' + phase + '): ' + evals + ' shifts, avg ' +
        (avg || 'n/a') + ', ' + (trendWord || 'no trend') + '. ' + ftoText + '. ' +
        statusMeta_(status, daysSince, fto).line);
    });

    var html = '' +
    '<div style="max-width:640px;margin:0 auto;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;padding-bottom:8px;">' +
      '<div style="background:#1d1b18;padding:22px 22px 18px 22px;border-bottom:4px solid #c9a227;">' +
        '<div style="color:#c9a227;font-size:12px;font-weight:bold;letter-spacing:2px;">SUMTER COUNTY EMS</div>' +
        '<div style="color:#f7f3ea;font-size:22px;font-weight:bold;margin-top:4px;">' + shift + ' SHIFT; FIELD TRAINING SNAPSHOT</div>' +
        '<div style="color:#b4ac9c;font-size:12px;margin-top:4px;">Week of ' + week + ' &nbsp;&middot;&nbsp; ' + byShift[shift].length + ' trainee(s) on your shift</div>' +
      '</div>' +
      '<div style="height:16px;"></div>' +
      cards.join('') +
      '<div style="margin:4px 16px 16px 16px;padding:12px 16px;background:#1d1b18;border-radius:8px;color:#b4ac9c;font-size:11px;line-height:1.5;">' +
        'Questions or concerns about a trainee or an FTO go to the <b style="color:#c9a227;">Division Chief of Training</b>. ' +
        'A safety concern is a same-shift call or text, then the Urgent Concern form on the Hub.' +
      '</div>' +
    '</div>';

    var text = shift + ' SHIFT; FIELD TRAINING SNAPSHOT : Week of ' + week + '\n\n' + textBlocks.join('\n\n');
    var target = supByShift[shift];
    if (shift === 'UNASSIGNED' || !target) {
      sendHtmlMail(CONFIG.TCO_EMAIL, 'Supervisor Snapshot : trainees with no shift mapping', text, html);
    } else {
      sendHtmlMail(String(target.email), shift + ' Shift; Field Training Snapshot : ' + week, text, html);
    }
    digestSent++;
  });
  reportBulkTruncationV20_2_('Supervisor digest', digestSent, digestUnsent);
  Logger.log('HTML supervisor snapshots sent: ' + digestSent +
    (digestUnsent.length ? ' (' + digestUnsent.length + ' held back for quota)' : '') + '.');
}

/* ---- ported from master (effective winner) ---- */
function systemHeartbeat() {
  var problems = [];
  var S = ss();

  // 1. triggers armed
  var need = MANAGED_TRIGGER_HANDLERS;
  var have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; });
  need.forEach(function (n) {
    if (!have[n]) problems.push('Trigger missing: ' + n + '. FIX: run installTriggers() once.');
  });

  // 2. forms alive, accepting, and feeding this workbook
  var ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '[]');
  if (!ids.length) problems.push('No stored form IDs. FIX: forms may have been rebuilt outside the system.');
  ids.forEach(function (id) {
    try {
      var f = FormApp.openById(id);
      if (!f.isAcceptingResponses()) problems.push('Form not accepting responses: ' + f.getTitle() + '. FIX: open the form, Responses, toggle Accepting responses on.');
      var dest = '';
      try { dest = f.getDestinationId(); } catch (d) {}
      if (dest && dest !== S.getId()) problems.push('Form feeding the WRONG workbook: ' + f.getTitle() + '. FIX: relink via Form, Responses, destination.');
      if (!dest) problems.push('Form has no response destination: ' + f.getTitle() + '. FIX: relink to the tracker.');
    } catch (e) {
      problems.push('Form unreachable (deleted or permissions): id ' + id);
    }
  });

  // 3. critical tabs present
  [TAB.CONTROL, TAB.MASTER, TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.SKILLS, TAB.ENGINE,
   TAB.QUEUE, '13 AUDIT - EXCEPTION LOG', TAB.DECISIONS, TAB.ARCHIVE, 'HOME',
   TAB.SKILL_EVIDENCE, TAB.SKILL_VALIDATION, TAB.SKILL_SIGNOFF].forEach(function (n) {
    if (!S.getSheetByName(n)) problems.push('Tab missing: ' + n + '. FIX: run repairControlAndEngine() or the matching builder.');
  });

  // 4. the engine is breathing
  try {
    var eng = S.getSheetByName(TAB.ENGINE);
    if (eng && !eng.getRange('R5').getFormula()) {
      problems.push('Status engine formulas are gone (R5 empty). FIX: run repairControlAndEngine(), then fixEngineOrder().');
    }
  } catch (e) {}

  // 5. backups current
  try {
    var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
    if (!folders.hasNext()) {
      problems.push('Backup folder missing. FIX: run monthlySnapshot() once.');
    } else {
      var files = folders.next().getFilesByType(MimeType.MICROSOFT_EXCEL);
      var newest = null;
      while (files.hasNext()) {
        var f2 = files.next();
        if (!newest || f2.getDateCreated() > newest) newest = f2.getDateCreated();
      }
      if (!newest) problems.push('No backup snapshot exists yet. FIX: SCEMS menu, Run backup snapshot now.');
      else if ((new Date() - newest) / 86400000 > 40) {
        problems.push('Newest backup is over 40 days old. FIX: run monthlySnapshot() and confirm the monthly trigger with installTriggers().');
      }
    }
  } catch (e) {}

  if (problems.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'SYSTEM HEALTH : ' + problems.length + ' Issue(s) Need Attention : Field Training Tracker',
      'The weekly self-test found problems. Alerts and automation may not be reliable until these are fixed:\n\n' +
      problems.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n') +
      '\n\nThe system stays silent when healthy; this email only exists because something is broken.');
  }
  Logger.log('Heartbeat: ' + (problems.length ? problems.length + ' problem(s), email sent.' : 'all healthy, silent.'));
}

/* ---- ported from master (effective winner) ---- */

function monthlySnapshot() {
  var S = ss();
  var url = 'https://docs.google.com/spreadsheets/d/' + S.getId() + '/export?format=xlsx';
  var blob = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob();
  var name = 'SCEMS_Tracker_Backup_' +
    Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmm') + '.xlsx';
  blob.setName(name);
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var file = folder.createFile(blob);
  sendMail(CONFIG.SUPERVISOR_EMAILS,
    'SCEMS Tracker Backup Complete : ' + name,
    'Full workbook snapshot saved:\n' + file.getUrl());
  Logger.log('Backup saved: ' + file.getUrl());
}

/* ---- ported round 2 : HOME panel, rollup, trainee-skills views, consts ---- */

function collectActionItemsV19_() {
  var S = ss();
  var items = [];

  var threshold = 5;
  try {
    var t = S.getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(t) > 0) threshold = Number(t);
  } catch (e) {}

  // ---- trainees: overdue, and never started ----
  var eng = S.getSheetByName(TAB.ENGINE);
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      if (String(r[21] || '').toUpperCase() === 'SNOOZED') return;

      var fto      = String(r[3] || '').trim() || 'no FTO assigned';
      var evals    = Number(r[6]) || 0;
      var daysSince= r[8] === '' || r[8] === null ? null : Number(r[8]);
      var dayInPhase = Number(r[20]) || 0;

      if (evals > 0 && daysSince !== null && daysSince > threshold) {
        items.push({
          sev: 'OVERDUE', sort: 10000 - daysSince, who: name,
          detail: daysSince + ' days since last evaluation',
          owner: fto, action: 'Chase the FTO for a shift evaluation'
        });
      } else if (evals === 0 && dayInPhase > START_GRACE_DAYS_V19) {
        items.push({
          sev: 'NOT STARTED', sort: 10000 - dayInPhase, who: name,
          detail: 'day ' + dayInPhase + ', no evaluation ever filed',
          owner: fto, action: 'Confirm training has actually begun'
        });
      }

      var review = String(r[17] || '');
      if (review.indexOf('Due') >= 0) {
        items.push({
          sev: 'DUE', sort: 5000, who: name, detail: review,
          owner: fto, action: 'File on the Decision Record form'
        });
      }
    });
  }

  // ---- decision queue ----
  var q = S.getSheetByName(TAB.QUEUE);
  if (q && q.getLastRow() >= 5) {
    var now = new Date();
    q.getRange(5, 1, Math.min(q.getLastRow() - 4, 296), 8).getValues().forEach(function (r) {
      var who = String(r[1] || '').trim();
      if (!who || r[5]) return;
      var due = r[4] instanceof Date ? r[4] : null;
      var breached = due && due.getTime() < now.getTime();
      var hrs = due ? Math.round((due.getTime() - now.getTime()) / 3600000) : null;
      items.push({
        sev: breached ? 'BREACHED' : 'DUE',
        sort: breached ? 100 : 4000,
        who: who,
        detail: String(r[2] || 'decision') +
                (breached ? ', PAST DEADLINE' : hrs !== null ? ', ' + hrs + 'h left' : ''),
        owner: 'Division Chief of Training',
        action: 'File on the Decision Record form'
      });
    });
  }

  // ---- audit flags ----
  var au = S.getSheetByName('13 AUDIT - EXCEPTION LOG');
  if (au) {
    var labels = ['advancement vs score', 'reflection vs score',
                  'extreme score without narrative', 'silent record',
                  'FTO scope', 'phase mismatch'];
    au.getRange(5, 1, 40, 7).getValues().forEach(function (r) {
      var who = String(r[0] || '').trim();
      if (!who) return;
      var lit = [];
      for (var c = 1; c <= 6; c++) {
        if (String(r[c]).trim().toUpperCase() === 'FLAG') lit.push(labels[c - 1]);
      }
      if (!lit.length) return;
      items.push({
        sev: 'FLAG', sort: 200 - lit.length, who: who,
        detail: lit.join(', '),
        owner: 'Division Chief of Training',
        action: 'Review on tab 13 and log the reviewer and action'
      });
    });
  }

  // ---- skills ready for validation ----
  var sq = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (sq && sq.getLastRow() >= 5) {
    sq.getRange(5, 1, Math.min(sq.getLastRow() - 4, 500), 12).getValues().forEach(function (r) {
      var who = String(r[1] || '').trim();
      if (!who || String(r[11]) !== 'OPEN') return;
      items.push({
        sev: 'SKILL', sort: 6000, who: who,
        detail: String(r[4] || 'skill ready for validation'),
        owner: 'Division Chief of Training',
        action: 'Record the decision on tab 20'
      });
    });
  }

  items.sort(function (a, b) {
    var ra = SEV_V19[a.sev].rank, rb = SEV_V19[b.sev].rank;
    if (ra !== rb) return ra - rb;
    return a.sort - b.sort;
  });
  return items;
}

function statusMeta_(status, daysSince, fto) {
  var s = String(status || '');
  if (s.indexOf('NRT') >= 0) return { color: '#8f1f12',
    line: 'Formal Not Responding to Training concern filed. Decision in progress with the Division Chief of Training.' };
  if (s.indexOf('Delayed') >= 0) return { color: '#c43a28',
    line: 'NEEDS ATTENTION: no evaluation in ' + daysSince + ' days. Check in with ' + (fto || 'the assigned FTO') + '.' };
  if (s.indexOf('Advancement') >= 0) return { color: '#c9a227',
    line: 'Up for advancement review. Decision due within 72 hours.' };
  if (s.indexOf('Needs Attention') >= 0) return { color: '#e0a11a',
    line: 'Scores running below standard. Coaching in progress; your awareness helps.' };
  if (s.indexOf('No Evals') >= 0) return { color: '#6f6a61',
    line: 'Just getting started. No evaluations on file yet.' };
  return { color: '#3f8f5a', line: 'On track. Nothing needs your attention.' };
}

function traineeCard_(o) {
  var meta = statusMeta_(o.status, o.daysSince, o.fto);
  var ftoDot = o.ftoOverdue ? '#c43a28' : (o.evals > 0 ? '#3f8f5a' : '#6f6a61');
  var avgPct = o.avg ? Math.round((o.avg / 5) * 100) : 0;
  var chip = function (txt, bg, fg) {
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font-size:11px;font-weight:bold;padding:3px 10px;border-radius:10px;margin-right:6px;">' + txt + '</span>';
  };
  return '' +
  '<div style="background:#ffffff;border-left:7px solid ' + meta.color + ';border-radius:8px;' +
       'margin:0 16px 16px 16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.12);">' +
    '<div style="font-size:19px;font-weight:bold;color:#1d1b18;letter-spacing:0.5px;">' + o.name + '</div>' +
    '<div style="margin:8px 0 10px 0;">' +
      chip(o.level, '#1d1b18', '#c9a227') +
      chip('Phase ' + o.phaseNum + ' of 4', '#c9a227', '#1d1b18') +
      (o.weeksIn ? chip('Week ' + o.weeksIn, '#efe9db', '#6f6a61') : '') +
    '</div>' +
    '<div style="font-size:13px;color:#444;margin-bottom:10px;">' +
      '<b>' + o.evals + '</b> training shift' + (o.evals === 1 ? '' : 's') + ' evaluated' +
      (o.avg ? ' &nbsp;&middot;&nbsp; averaging <b>' + o.avg + ' / 5</b>' : '') +
      (o.trendWord ? ' &nbsp;&middot;&nbsp; ' + o.trendWord : '') +
    '</div>' +
    (o.avg ?
    '<div style="background:#efe9db;border-radius:6px;height:10px;margin:0 0 12px 0;">' +
      '<div style="background:' + meta.color + ';width:' + avgPct + '%;height:10px;border-radius:6px;"></div>' +
    '</div>' : '') +
    '<table style="font-size:13px;color:#333;border-collapse:collapse;width:100%;">' +
      '<tr><td style="color:#3f8f5a;font-weight:bold;width:110px;padding:3px 0;vertical-align:top;">Doing well</td>' +
          '<td style="padding:3px 0;">' + o.strength + '</td></tr>' +
      '<tr><td style="color:#8a6a1f;font-weight:bold;padding:3px 0;vertical-align:top;">Working on</td>' +
          '<td style="padding:3px 0;">' + o.focus + '</td></tr>' +
      '<tr><td style="color:#555;font-weight:bold;padding:3px 0;vertical-align:top;">FTO</td>' +
          '<td style="padding:3px 0;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + ftoDot + ';margin-right:6px;"></span>' + o.ftoText + '</td></tr>' +
    '</table>' +
    '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eee;' +
         'font-size:13px;font-weight:bold;color:' + meta.color + ';">' + meta.line + '</div>' +
  '</div>';
}

function rollupCardV19_(f) {
  var INK = '#1d1b18', GOLD = '#c9a227', GOLDD = '#8a6a1f',
      RED = '#c43a28', GREEN = '#3f8f5a', MUTE = '#847d6d', HAIR = '#e8e4da';
  var attention = f.overdue;
  var edge = attention ? RED : (f.evals === 0 ? GOLD : GREEN);
  var pct = f.avg ? Math.round((f.avg / 5) * 100) : 0;
  var bar = attention ? RED : (f.avg && f.avg < 3 ? GOLD : GREEN);

  function badge(t, bg, fg) {
    if (!t) return '';
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font:600 10px Arial,sans-serif;padding:3px 9px;border-radius:10px;' +
      'margin:0 5px 0 0;">' + escHtmlV19_(t) + '</span>';
  }

  var h = [];
  h.push('<div style="background:#ffffff;border:1px solid ' + HAIR +
    ';border-left:5px solid ' + edge + ';border-radius:8px;padding:15px 18px;margin:0 0 12px 0;">');

  h.push('<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>');
  h.push('<td style="vertical-align:top;">');
  h.push('<div style="font:700 17px Arial,sans-serif;color:' + INK + ';">' +
    escHtmlV19_(f.name) + '</div>');
  h.push('<div style="margin:7px 0 0 0;">' +
    badge(f.level, INK, '#ffffff') +
    badge(f.phase ? f.phase + ' of 4' : '', GOLD, INK) +
    badge(f.fto, '#f1ede2', GOLDD) + '</div>');
  h.push('</td>');
  h.push('<td style="width:150px;text-align:right;vertical-align:top;">');
  if (f.evals > 0) {
    h.push('<div style="font:700 20px Arial,sans-serif;color:' + INK + ';">' +
      (f.avg ? f.avg : '-') + '<span style="font:400 12px Arial,sans-serif;color:' +
      MUTE + ';"> / 5</span></div>');
    h.push('<div style="font:11px Arial,sans-serif;color:' + MUTE + ';">' +
      f.evals + ' shift' + (f.evals === 1 ? '' : 's') +
      (f.trend ? ', ' + escHtmlV19_(f.trend.toLowerCase()) : '') + '</div>');
  } else {
    h.push('<div style="font:12px Arial,sans-serif;color:' + MUTE + ';">no shifts yet</div>');
  }
  h.push('</td></tr></table>');

  if (f.evals > 0) {
    h.push('<div style="background:#eee9dc;height:7px;border-radius:4px;overflow:hidden;margin:11px 0 0 0;">' +
      '<div style="background:' + bar + ';height:7px;width:' + pct + '%;"></div></div>');
  }

  h.push('<div style="margin:12px 0 0 0;padding:9px 12px;background:#faf8f2;' +
    'border-radius:5px;font:12px Arial,sans-serif;color:#4a453c;">' +
    '<b style="color:' + GOLDD + ';">Shift progress</b> &nbsp; ' +
    escHtmlV19_(f.progress) + '</div>');

  if (attention) {
    h.push('<div style="margin:10px 0 0 0;font:700 12px Arial,sans-serif;color:' + RED + ';">' +
      'NEEDS ATTENTION: no evaluation in ' + f.days + ' days, FTO ' +
      escHtmlV19_(f.fto) + '</div>');
  }
  h.push('</div>');
  return h.join('');
}

function snapshotFactsV19_(name) {
  var rec = traineeRecordV19_(name) || {};
  var eng = ss().getSheetByName(TAB.ENGINE);
  var e = null;
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) { e = rows[i]; break; }
    }
  }
  var days = e && e[8] !== '' && e[8] !== null ? Number(e[8]) : null;
  var dayInPhase = e ? Number(e[20]) || 0 : 0;
  var threshold = 5;
  try {
    var t = ss().getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(t) > 0) threshold = Number(t);
  } catch (err) {}

  return {
    name: name,
    level: rec.level || '',
    phase: rec.phase || '',
    week: dayInPhase > 0 ? 'Week ' + Math.ceil(dayInPhase / 7) : '',
    fto: rec.fto || 'unassigned',
    evals: e ? Number(e[6]) || 0 : 0,
    avg: e && e[9] ? Number(e[9]) : null,
    trend: e ? String(e[11] || '') : '',
    days: days,
    overdue: days !== null && days > threshold,
    strength: latestStrengthV19_(name),
    focus: latestFocusV19_(name)
  };
}

function progressLineV19_(name) {
  var p = shiftProgressV19_(name);
  if (!p.ok) return 'Progress unavailable : ' + p.why;
  if (p.evals === 0) {
    return 'No training shifts evaluated yet. ' + p.perPhase +
           ' required in ' + (p.phase || 'this phase') + '.';
  }
  var line = p.evals + ' training shift' + (p.evals === 1 ? '' : 's') +
             ' evaluated in total';
  if (p.phaseProgress) {
    line += '. ' + (p.phase || 'Current phase') + ': ' + p.phaseProgress;
  } else {
    line += '. ' + p.perPhase + ' required per phase.';
  }
  line += '.';
  if (p.metPhaseMin) {
    line += ' Minimum met, eligible to advance on competency.';
  }
  return line.replace(/\.\./g, '.');
}

function viewOverviewV19_(sh, name, rec, row) {
  var sk = traineeSkillsV19_(name);
  var events = traineeEventsV19_(name);

  var counts = [
    ['SIGNED OFF', sk.signed.length, TV.GREEN],
    ['READY', sk.ready.length, TV.GOLD],
    ['IN PROGRESS', sk.progress.length, TV.GOLDD],
    ['NOT STARTED', sk.notStarted.length, TV.MUTE]
  ];
  counts.forEach(function (c, i) {
    var col = 2 + i * 2;
    sh.getRange(row, col, 1, 2).merge().setValue(c[1])
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(22)
      .setFontColor(c[2]).setHorizontalAlignment('center')
      .setVerticalAlignment('middle').setBackground('#ffffff')
      .setBorder(true, true, false, true, false, false, TV.HAIR,
                 SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(row + 1, col, 1, 2).merge().setValue(c[0])
      .setFontFamily('Oswald').setFontSize(8).setFontColor(TV.MUTE)
      .setHorizontalAlignment('center').setVerticalAlignment('top')
      .setBackground('#ffffff')
      .setBorder(false, true, true, true, false, false, TV.HAIR,
                 SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.setRowHeight(row, 34); sh.setRowHeight(row + 1, 18);
  row += 3;

  row = tvBandV19_(sh, row, 'WHERE THEY ARE', TV.BLUE);
  var facts = [];
  try {
    var f = snapshotFactsV19_(name);
    facts.push(['Shifts evaluated', String(f.evals)]);
    if (f.avg) facts.push(['Average score', f.avg + ' / 5' + (f.trend ? ', ' + f.trend.toLowerCase() : '')]);
    facts.push(['Last evaluation', f.days === null ? 'none yet' : f.days + ' day(s) ago']);
    if (f.strength) facts.push(['Doing well', f.strength]);
    if (f.focus) facts.push(['Working on', f.focus]);
  } catch (e) {}
  try { facts.push(['Shift progress', progressLineV19_(name)]); } catch (e) {}
  facts.push(['Skill events logged', String(events.length)]);

  facts.forEach(function (f) {
    sh.getRange(row, 3).setValue(f[0])
      .setFontFamily('Inter').setFontWeight('bold').setFontSize(9)
      .setFontColor(TV.MUTE).setVerticalAlignment('middle');
    sh.getRange(row, 4, 1, 5).merge().setValue(f[1])
      .setFontFamily('Inter').setFontSize(10).setVerticalAlignment('middle')
      .setWrap(true);
    sh.setRowHeight(row, 22);
    row++;
  });
  row++;

  row = tvBandV19_(sh, row, 'WHAT HAPPENS NEXT', TV.GOLD);
  var next = [];
  if (sk.ready.length) {
    next.push(sk.ready.length + ' skill(s) are ready for validation. That is ' +
      'with leadership on tab 20, not with the trainee.');
  }
  if (sk.progress.length) {
    next.push(sk.progress.length + ' skill(s) in progress. See Skills remaining ' +
      'for how far off each one is.');
  }
  if (sk.notStarted.length) {
    next.push(sk.notStarted.length + ' skill(s) not started yet.');
  }
  if (!events.length) {
    next.push('No skill events logged at all. If they have been on shift, the ' +
      'Skills Quick Log is not being submitted.');
  }
  if (!next.length) next.push('Nothing outstanding on skills.');

  next.forEach(function (t) {
    sh.getRange(row, 3, 1, 6).merge().setValue(t)
      .setFontFamily('Inter').setFontSize(10).setWrap(true)
      .setVerticalAlignment('middle');
    sh.setRowHeight(row, 24);
    row++;
  });
}

function viewActivityV19_(sh, name, row) {
  var events = traineeEventsV19_(name);
  var shown = events.slice(0, 60);

  row = tvBandV19_(sh, row, 'SKILL EVENTS   ' + events.length +
    ' total, showing ' + shown.length + ', newest first', TV.BLUE);

  row = tvTableV19_(sh, row,
    ['DATE', 'SKILL', 'STAGE', 'OUTCOME', 'FTO', 'CALL REF'],
    shown.map(function (e) {
      return [e.date, e.skill, e.stage, e.outcome, e.fto, e.callRef];
    }), [2, 2]);

  if (shown.length) {
    sh.getRange(row - shown.length - 1, 3, shown.length, 1)
      .setNumberFormat('yyyy-mm-dd');
  }

  sh.getRange(row, 2, 1, 7).merge()
    .setValue('The full permanent record is on 19 SKILL EVIDENCE LOG. ' +
              'This page reads it and never writes to it.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE);
}

function viewSkillsByPhaseV19_(sh, name, row) {
  var events = traineeEventsV19_(name);
  if (!events.length) {
    sh.getRange(row, 3).setValue('No skill events recorded for this trainee yet.')
      .setFontFamily('Inter').setFontSize(10).setFontColor(TV.MUTE);
    return;
  }

  var byPhase = {}, order = [];
  events.forEach(function (e) {
    var p = e.phase || 'Phase not recorded';
    if (!byPhase[p]) { byPhase[p] = {}; order.push(p); }
    if (!byPhase[p][e.skill]) {
      byPhase[p][e.skill] = { skill: e.skill, count: 0, stages: {}, last: null, ftos: {} };
    }
    var s = byPhase[p][e.skill];
    s.count++;
    s.stages[e.stage] = (s.stages[e.stage] || 0) + 1;
    if (e.fto) s.ftos[e.fto] = true;
    if (!s.last || (e.date && e.date > s.last)) s.last = e.date;
  });
  order.sort();

  order.forEach(function (p) {
    var skills = Object.keys(byPhase[p]).sort().map(function (k) { return byPhase[p][k]; });
    row = tvBandV19_(sh, row, p.toUpperCase() + '   ' + skills.length +
      ' skill(s), ' + skills.reduce(function (a, s) { return a + s.count; }, 0) +
      ' event(s)', TV.BLUE);

    var rows = skills.map(function (s) {
      var stageStr = ['O', 'A', 'P', 'I'].filter(function (k) { return s.stages[k]; })
        .map(function (k) { return k + ' x' + s.stages[k]; }).join('  ');
      return [s.skill, s.count, stageStr,
              Object.keys(s.ftos).length, s.last || '', ''];
    });
    row = tvTableV19_(sh, row,
      ['SKILL', 'EVENTS', 'STAGES SEEN', 'FTOs', 'LAST SEEN', ''],
      rows, [1, 3]);
  });

  sh.getRange(row, 2, 1, 7).merge()
    .setValue('Stages: O observed, A assisted, P performed with coaching, ' +
              'I performed independently.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE);
}

function viewSkillsCompletedV19_(sh, name, row) {
  var sk = traineeSkillsV19_(name);

  row = tvBandV19_(sh, row, 'SIGNED OFF   ' + sk.signed.length + ' skill(s)', TV.GREEN);
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'SIGNED BY', 'SIGNED ON'],
    sk.signed.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.signedBy, s.signedOn];
    }), [1, 3]);

  row = tvBandV19_(sh, row,
    'EVIDENCE COMPLETE, AWAITING VALIDATION   ' + sk.ready.length + ' skill(s)', TV.GOLD);
  sh.getRange(row, 3, 1, 6).merge()
    .setValue(sk.ready.length
      ? 'The trainee has done their part on these. They are waiting on a ' +
        'validation decision on tab 20, not on further work.'
      : 'Nothing waiting on a validation decision.')
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row++;
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'FTOs', ''],
    sk.ready.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.ftos, ''];
    }), [1, 4]);

  var total = sk.signed.length + sk.ready.length;
  var all = sk.all.length;
  sh.getRange(row, 2, 1, 7).merge()
    .setValue(total + ' of ' + all + ' skill(s) complete or awaiting validation. ' +
      'Meeting the evidence thresholds makes a skill eligible for validation. ' +
      'It does not sign it off. Sign-off is a documented human decision against ' +
      'the approved standard.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE).setWrap(true);
}

function viewSkillsRemainingV19_(sh, name, rec, row) {
  var sk = traineeSkillsV19_(name);

  row = tvBandV19_(sh, row, 'SHIFTS', TV.BLUE);
  var line = '';
  try { line = progressLineV19_(name); } catch (e) { line = 'not available'; }
  sh.getRange(row, 3, 1, 6).merge().setValue(line)
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row += 2;

  row = tvBandV19_(sh, row,
    'IN PROGRESS   ' + sk.progress.length + ' skill(s)', TV.GOLDD);
  sh.getRange(row, 3, 1, 6).merge()
    .setValue(sk.progress.length
      ? 'Started, but not yet enough evidence. The counts show how far along each one is.'
      : 'Nothing part way through.')
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row++;
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'FTOs', 'STAGE REACHED'],
    sk.progress.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.ftos, s.stage];
    }), [1, 4]);

  row = tvBandV19_(sh, row,
    'NOT STARTED   ' + sk.notStarted.length + ' skill(s)', TV.RED);
  row = tvTableV19_(sh, row, ['SKILL', '', '', '', '', ''],
    sk.notStarted.map(function (s) { return [s.skill, '', '', '', '', '']; }), null);

  var left = sk.progress.length + sk.notStarted.length;
  sh.getRange(row, 2, 1, 7).merge()
    .setValue(left + ' of ' + sk.all.length + ' skill(s) still to complete. ' +
      'Anything already sitting with leadership appears under Skills completed, ' +
      'not here, because the trainee has done their part on those.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE).setWrap(true);
}

function signaturesOnFileV19_(trainee, itemType, sinceMs) {
  var out = {};
  var dec = ss().getSheetByName(TAB.DECISIONS);
  if (!dec || dec.getLastRow() < 5) return out;
  dec.getRange(5, 1, dec.getLastRow() - 4, 9).getValues().forEach(function (r) {
    if (String(r[3]).trim() !== String(trainee).trim()) return;
    if (String(r[4]) !== String(itemType)) return;
    var ts = r[0] instanceof Date ? r[0].getTime() : 0;
    if (sinceMs && ts < sinceMs) return;
    var role = String(r[2] || '').trim();
    if (role === DUAL_ROLE_TRAINING_V19 || role === DUAL_ROLE_MEDICAL_V19) {
      if (!out[role] || ts > out[role].ts) {
        out[role] = { ts: ts, by: String(r[1] || '').trim(), decision: String(r[5] || '').trim(),
                      rationale: String(r[6] || '').trim(), effective: r[7] };
      }
    }
  });
  return out;
}

/* [var DIGEST_COPY_TO_V19 : defined above] */


/* ---- ported round 3 : trainee-view card helpers ---- */

function latestFocusV19_(traineeName) {
  try {
    var v9 = ss().getSheetByName('09 TRAINEE VIEW');
    if (!v9) return '';
    var rows = v9.getRange(5, 1, 40, 9).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(traineeName).trim()) {
        return String(rows[i][8] || '').trim();
      }
    }
  } catch (e) {}
  return '';
}

function latestStrengthV19_(traineeName) {
  var ev = ss().getSheetByName(TAB.EVAL);
  if (!ev || ev.getLastRow() < 5) return '';
  var rows = ev.getRange(5, 1, ev.getLastRow() - 4, 24).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][2]).trim() !== String(traineeName).trim()) continue;
    var s = String(rows[i][21] || '').trim();
    if (s) return s;
  }
  return '';
}

function shiftProgressV19_(name) {
  var rec = traineeRecordV19_(name);
  if (!rec) return { ok: false, why: 'not on the Trainee Master' };

  var mins = phaseMinimumsV19_();
  var perPhase = mins[rec.level];
  if (!perPhase) {
    return { ok: false, why: 'no minimum set for ' + (rec.level || 'this level') };
  }

  var eng = ss().getSheetByName(TAB.ENGINE);
  var evals = 0, phaseProgress = '';
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) {
        evals = Number(rows[i][6]) || 0;
        phaseProgress = String(rows[i][19] || '').trim();
        break;
      }
    }
  }

  return {
    ok: true,
    level: rec.level,
    phase: rec.phase,
    evals: evals,
    perPhase: perPhase,
    phaseProgress: phaseProgress,
    metPhaseMin: /^Met/i.test(phaseProgress)
  };
}

function traineeEventsV19_(name) {
  var out = [];
  var ev = ss().getSheetByName(TAB.SKILL_EVIDENCE);
  if (!ev || ev.getLastRow() < 5) return out;
  ev.getRange(5, 1, ev.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[3]).trim() !== String(name).trim()) return;
    out.push({
      date: r[2], phase: String(r[5] || ''), fto: String(r[6] || ''),
      domain: String(r[7] || ''), skill: String(r[9] || ''),
      context: String(r[10] || ''), stage: String(r[11] || ''),
      outcome: String(r[12] || ''), callRef: String(r[15] || '')
    });
  });
  return out.reverse();
}

function traineeSkillsV19_(name) {
  var out = { signed: [], ready: [], progress: [], notStarted: [], all: [] };
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return out;
  m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[0]).trim() !== String(name).trim()) return;
    var item = {
      skill: String(r[1] || ''),
      stage: String(r[2] || ''),
      readiness: String(r[6] || ''),
      signoff: String(r[7] || ''),
      successful: Number(r[10]) || 0,
      independent: Number(r[11]) || 0,
      dates: Number(r[12]) || 0,
      ftos: Number(r[13]) || 0,
      signedBy: String(r[16] || ''),
      signedOn: r[17] || ''
    };
    out.all.push(item);
    if (item.signoff === 'SIGNED OFF') out.signed.push(item);
    else if (item.readiness === 'READY FOR VALIDATION') out.ready.push(item);
    else if (item.readiness === 'IN PROGRESS') out.progress.push(item);
    else out.notStarted.push(item);
  });
  return out;
}

function tvBandV19_(sh, row, text, colour) {
  sh.getRange(row, 2, 1, 7).merge().setValue(text)
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(10)
    .setFontColor('#ffffff').setBackground(colour).setVerticalAlignment('middle');
  sh.setRowHeight(row, 22);
  return row + 1;
}

function tvTableV19_(sh, row, headers, rows, widthsCentre) {
  sh.getRange(row, 3, 1, headers.length).setValues([headers])
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(8)
    .setFontColor(TV.MUTE)
    .setBorder(false, false, true, false, false, false, TV.HAIR,
               SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(row, 18);
  row++;
  if (!rows.length) {
    sh.getRange(row, 3).setValue('none')
      .setFontFamily('Inter').setFontSize(9).setFontColor(TV.MUTE);
    return row + 2;
  }
  sh.getRange(row, 3, rows.length, headers.length).setValues(rows)
    .setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
  if (widthsCentre) {
    sh.getRange(row, 3 + widthsCentre[0], rows.length, widthsCentre[1])
      .setHorizontalAlignment('center');
  }
  for (var i = 0; i < rows.length; i++) sh.setRowHeight(row + i, 20);
  return row + rows.length + 1;
}

/** Canonical recomputation of the ANALYTICS chart-data block.
 *  Returns { ok, values:{domainAvgs, statusCounts, weekly, byLevel},
 *  problems:[] } without writing anything. */
function computeAnalyticsV20_1_() {
  var problems = [];
  var out = { domainAvgs: null, statusCounts: null, weekly: null, byLevel: null };

  var trendDays = controlDialV20_1_(CONTROL_DIALS.TREND_DAYS, 21);
  var ev = readTableV20_1_(TAB.EVAL, 4);
  if (!ev.ok) problems.push('eval mirror missing');
  var DOMAINS = ['Assessment', 'Treatment', 'Communication', 'Documentation',
                 'Scene Leadership', 'Professionalism'];
  if (ev.ok) {
    var cut = new Date(); cut.setDate(cut.getDate() - trendDays); cut.setHours(0, 0, 0, 0);
    var sums = {}, counts = {};
    DOMAINS.forEach(function (d) { sums[d] = 0; counts[d] = 0; });
    var dateCol = ev.col['SHIFT DATE'];
    if (dateCol === undefined) problems.push('eval mirror lacks SHIFT DATE header');
    ev.rows.forEach(function (r) {
      var d = parseDateSafeV20_1_(dateCol !== undefined ? r[dateCol] : null);
      if (!d || d < cut) return;
      DOMAINS.forEach(function (dom) {
        var ci = ev.col[dom.toUpperCase()];
        if (ci === undefined) return;
        var v = Number(r[ci]);
        if (!isNaN(v) && v >= 1 && v <= 5) { sums[dom] += v; counts[dom]++; }
      });
    });
    DOMAINS.forEach(function (dom) {
      if (ev.col[dom.toUpperCase()] === undefined) problems.push('eval mirror lacks ' + dom + ' column');
    });
    out.domainAvgs = DOMAINS.map(function (dom) {
      return { domain: dom, n: counts[dom],
               avg: counts[dom] ? Math.round(sums[dom] / counts[dom] * 100) / 100 : null };
    });

    var weekly = [];
    var monday = new Date(); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (var w = 7; w >= 0; w--) {
      var start = new Date(monday); start.setDate(start.getDate() - 7 * w);
      var end = new Date(start); end.setDate(end.getDate() + 7);
      var n = 0;
      ev.rows.forEach(function (r) {
        var d = parseDateSafeV20_1_(dateCol !== undefined ? r[dateCol] : null);
        if (d && d >= start && d < end) n++;
      });
      weekly.push({ label: Utilities.formatDate(start, 'America/New_York', 'MM/dd'), n: n });
    }
    out.weekly = weekly;
  }

  var trainees = masterTraineeRowsV20_1_();
  var active = trainees.filter(function (t) { return !t.closed; });
  var byLevel = { 'EMT': 0, 'Advanced EMT': 0, 'Paramedic': 0 };
  active.forEach(function (t) { if (byLevel[t.level] !== undefined) byLevel[t.level]++; });
  out.byLevel = byLevel;

  var eng = readTableV20_1_(TAB.ENGINE, 4);
  var statusCounts = { 'On Track': 0, 'Needs Attention': 0, 'Delayed': 0,
                       'Advancement Review Due': 0, 'NRT Filed : Decision Due': 0,
                       'Setup Incomplete': 0, 'Closed / Released': 0, 'No Evals Yet': 0 };
  if (!eng.ok) problems.push('status engine missing');
  else {
    var sCol = eng.col['COMPUTED STATUS'];
    var nCol = eng.col['TRAINEE'];
    if (sCol === undefined) problems.push('engine lacks COMPUTED STATUS header');
    else eng.rows.forEach(function (r) {
      var name = cleanNameV20_1_(nCol !== undefined ? r[nCol] : '');
      if (!name) return;
      var s = String(r[sCol] || '');
      var master = trainees.filter(function (t) { return t.norm === normalizeNameV20_1_(name); })[0];
      if (master && master.closed) { statusCounts['Closed / Released']++; return; }
      if (master && (!master.fto || !master.phaseStart)) { statusCounts['Setup Incomplete']++; return; }
      if (/Delayed/.test(s)) statusCounts['Delayed']++;
      else if (/Needs Attention/.test(s)) statusCounts['Needs Attention']++;
      else if (/Advancement Review/.test(s)) statusCounts['Advancement Review Due']++;
      else if (/NRT/.test(s)) statusCounts['NRT Filed : Decision Due']++;
      else if (/No Evals/.test(s)) statusCounts['No Evals Yet']++;
      else if (/On Track/.test(s)) statusCounts['On Track']++;
    });
  }
  out.statusCounts = statusCounts;
  return { ok: problems.length === 0, values: out, problems: problems, activeCount: active.length };
}

/** Open-work totals used by HOME reconciliation. */
function openWorkTotalsV20_1_() {
  var out = { skillDecisionsOpen: 0, generalDecisionsOpen: 0, urgentOpen: 0, total: 0 };
  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok) {
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      if (String(r[q.col['RECORD STATUS']] || '').trim() === 'OPEN') out.skillDecisionsOpen++;
    });
  }
  var dq = getSheetOrNullV20_1_(TAB.QUEUE);
  if (dq) {
    var rows = dq.getRange(5, 1, Math.max(dq.getLastRow() - 4, 1), 9).getValues();
    rows.forEach(function (r) {
      if (!r[1]) return;
      var status = String(r[8] || '').trim();
      if (status !== 'CLOSED' && !String(r[5] || '').trim()) out.generalDecisionsOpen++;
    });
  }
  var uc = readTableV20_1_(TAB.URGENT, 4);
  if (uc.ok && uc.col['STATUS'] !== undefined) {
    uc.rows.forEach(function (r) {
      if (!r[0]) return;
      var s = String(r[uc.col['STATUS']] || '').trim();
      if (s && !/closed|resolved/i.test(s)) out.urgentOpen++;
    });
  }
  out.total = out.skillDecisionsOpen + out.generalDecisionsOpen + out.urgentOpen;
  return out;
}

/** Writes the recomputed values into the ANALYTICS chart block (the cells
 *  the charts read). A failed prerequisite writes 'DATA ERROR' where a
 *  number would go and a health note in the block header. */
function refreshAnalyticsV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (!sh) return 'Analytics sheet missing.';
  var res = computeAnalyticsV20_1_();
  var v = res.values;
  sh.getRange('N1').setValue(res.ok
    ? 'chart data (recomputed ' + Utilities.formatDate(new Date(), 'America/New_York', 'MM/dd HH:mm') + ')'
    : 'chart data — DATA ERROR: ' + res.problems.join('; '));
  if (v.domainAvgs) {
    v.domainAvgs.forEach(function (d, i) {
      sh.getRange(2 + i, 15).setValue(d.avg === null ? (res.ok ? 0 : 'DATA ERROR') : d.avg);
    });
  } else {
    for (var i = 0; i < 6; i++) sh.getRange(2 + i, 15).setValue('DATA ERROR');
  }
  if (v.statusCounts) {
    sh.getRange(10, 15).setValue(v.statusCounts['On Track']);
    sh.getRange(11, 15).setValue(v.statusCounts['Needs Attention']);
    sh.getRange(12, 15).setValue(v.statusCounts['Delayed']);
    sh.getRange(13, 15).setValue(v.statusCounts['Advancement Review Due']);
    sh.getRange(14, 15).setValue(v.statusCounts['NRT Filed : Decision Due']);
  }
  if (v.weekly) {
    v.weekly.forEach(function (w, i) {
      sh.getRange(17 + i, 14).setValue(w.label);
      sh.getRange(17 + i, 15).setValue(w.n);
    });
  }
  if (v.byLevel) {
    sh.getRange(27, 15).setValue(v.byLevel['EMT']);
    sh.getRange(28, 15).setValue(v.byLevel['Advanced EMT']);
    sh.getRange(29, 15).setValue(v.byLevel['Paramedic']);
  }
  systemLog_(res.ok ? 'INFO' : 'WARN', 'ANALYTICS RECOMPUTED',
    res.ok ? 'clean' : res.problems.join('; '));
  return res.ok ? 'Analytics recomputed from canonical data.'
                : 'Analytics recomputed WITH DATA ERRORS: ' + res.problems.join('; ');
}

/** READ-ONLY: recomputes source totals and compares them with what the
 *  sheets display right now. Writes nothing, logs nothing, sends nothing. */
function verifyAnalyticsV20_1() {
  var L = ['ANALYTICS VERIFICATION — READ ONLY', ''];
  var res = computeAnalyticsV20_1_();
  var sh = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (!sh) return 'Analytics sheet missing.';
  var mismatches = 0;

  if (res.values.domainAvgs) {
    L.push('Domain averages (window recompute vs displayed O2:O7):');
    res.values.domainAvgs.forEach(function (d, i) {
      var shown = sh.getRange(2 + i, 15).getValue();
      var expect = d.avg === null ? 0 : d.avg;
      var agree = (d.avg === null && (shown === 0 || shown === '' || shown === 'DATA ERROR')) ||
                  (typeof shown === 'number' && Math.abs(shown - expect) < 0.005);
      if (!agree) mismatches++;
      L.push('  ' + d.domain.padEnd(16) + ' recomputed ' + (d.avg === null ? '(no data)' : d.avg) +
             ' (' + d.n + ' evals) | displayed ' + shown + (agree ? '' : '   ← MISMATCH'));
    });
  }
  var counts = res.values.statusCounts;
  if (counts) {
    var rows = [['On Track', 10], ['Needs Attention', 11], ['Delayed', 12],
                ['Advancement Review Due', 13], ['NRT Filed : Decision Due', 14]];
    L.push('');
    L.push('Status counts:');
    rows.forEach(function (pair) {
      var shown = sh.getRange(pair[1], 15).getValue();
      var expect = counts[pair[0]];
      var agree = Number(shown) === expect;
      if (!agree) mismatches++;
      L.push('  ' + pair[0].padEnd(26) + ' recomputed ' + expect + ' | displayed ' + shown +
             (agree ? '' : '   ← MISMATCH'));
    });
    L.push('  (Setup Incomplete ' + counts['Setup Incomplete'] + ' and Closed/Released ' +
           counts['Closed / Released'] + ' are tracked separately and are excluded from Active.)');
  }
  var home = getSheetOrNullV20_1_('HOME');
  var work = openWorkTotalsV20_1_();
  if (home) {
    var shownActive = Number(home.getRange('B7').getValue());
    var shownOpenDecisions = Number(home.getRange('H7').getValue());
    L.push('');
    L.push('HOME reconciliation:');
    var a1 = shownActive === res.activeCount;
    if (!a1) mismatches++;
    L.push('  Active trainees   : recomputed ' + res.activeCount + ' (closed excluded) | HOME shows ' +
           shownActive + (a1 ? '' : '   ← MISMATCH'));
    var a2 = shownOpenDecisions === work.total;
    if (!a2) mismatches++;
    L.push('  Open decisions    : recomputed ' + work.total + ' (skill ' + work.skillDecisionsOpen +
           ' + general ' + work.generalDecisionsOpen + ' + urgent ' + work.urgentOpen +
           ') | HOME shows ' + shownOpenDecisions + (a2 ? '' : '   ← MISMATCH'));
  }
  L.push('');
  if (res.problems.length) L.push('DATA ERRORS: ' + res.problems.join('; '));
  L.push(mismatches ? mismatches + ' mismatch(es). Run refreshAnalyticsV20_1() (and see homeCountersV20_1).'
                    : 'Displayed analytics agree with canonical recomputation.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** Rewrites the HOME counter tiles from canonical totals so HOME, the
 *  analytics block, the action inbox, and the source tables agree. */
function homeCountersV20_1() {
  var home = getSheetOrNullV20_1_('HOME');
  if (!home) return 'HOME missing.';
  var res = computeAnalyticsV20_1_();
  var work = openWorkTotalsV20_1_();
  home.getRange('B7').setValue(res.activeCount);
  home.getRange('H7').setValue(work.total);
  systemLog_('INFO', 'HOME COUNTERS RECONCILED',
    'active=' + res.activeCount + ' openWork=' + work.total);
  return 'HOME counters set: active ' + res.activeCount + ', open decisions ' + work.total + '.';
}

function ftoScoreboardV20_1() {
  var denyV20_2 = denyV20_2_('READ PROGRAM REPORT');
  if (denyV20_2) return denyV20_2;
  var threshold = 5;
  try {
    var tv = ss().getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(tv) > 0) threshold = Number(tv);
  } catch (e0) {}

  // --- engine facts per trainee ---
  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  var facts = {};
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      facts[normalizeNameV20_1_(name)] = {
        evals: Number(r[6]) || 0,
        daysSince: (r[8] === '' || r[8] === null) ? null : Number(r[8]),
        dayInPhase: Number(r[20]) || 0
      };
    });
  }

  // --- audit flags per trainee ---
  var flags = {};
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (au) {
    var labels = ['advancement vs score', 'reflection vs score',
                  'extreme score without narrative', 'silent record',
                  'FTO scope', 'phase mismatch'];
    au.getRange(5, 1, 40, 7).getValues().forEach(function (r) {
      var name = normalizeNameV20_1_(String(r[0] || ''));
      if (!name) return;
      var fl = [];
      for (var c = 1; c <= 6; c++) if (String(r[c]) === 'FLAG') fl.push(labels[c - 1]);
      if (fl.length) flags[name] = fl;
    });
  }

  // --- who has actually filed, from the raw mirror ---
  var filedBy = {}, filedByDisplay = {}, lastEvalFor = {};
  var m = getSheetOrNullV20_1_(TAB.EVAL);
  if (m && m.getLastRow() >= 5) {
    m.getRange(5, 1, m.getLastRow() - 4, 3).getValues().forEach(function (r) {
      var d = parseDateSafeV20_1_(r[0]);
      var fto = String(r[1] || '').trim();
      var tr = normalizeNameV20_1_(String(r[2] || ''));
      if (!fto || !tr) return;
      var fn = normalizeNameV20_1_(fto);
      filedBy[fn] = (filedBy[fn] || 0) + 1;
      if (!filedByDisplay[fn]) filedByDisplay[fn] = fto;
      if (d && (!lastEvalFor[tr] || d.getTime() > lastEvalFor[tr].getTime())) lastEvalFor[tr] = d;
    });
  }

  // --- group active trainees by assigned FTO ---
  var byFto = {}, unassigned = [], totals = { active: 0, never: 0, overdue: 0, current: 0 };
  masterTraineeRowsV20_1_().forEach(function (t) {
    if (t.closed) return;
    if (String(t.name).indexOf('EXAMPLE') === 0 || String(t.name).indexOf(TEST_PREFIX) === 0) return;
    totals.active++;
    var f = facts[t.norm] || { evals: 0, daysSince: null, dayInPhase: 0 };
    var status, sev;
    if (f.evals === 0) {
      status = 'NEVER EVALUATED — day ' + f.dayInPhase + ' of phase'; sev = 2; totals.never++;
    } else if (f.daysSince !== null && f.daysSince > threshold) {
      status = f.daysSince + ' days since last eval (limit ' + threshold + ')'; sev = 1; totals.overdue++;
    } else {
      status = 'current' + (lastEvalFor[t.norm] ? ' — last eval ' + dateKeyV20_1_(lastEvalFor[t.norm]) : ''); sev = 0; totals.current++;
    }
    var entry = { name: t.name, phase: t.phase || '', status: status, sev: sev,
                  evals: f.evals, flags: flags[t.norm] || [] };
    var ftoName = String(t.fto || '').trim();
    if (!ftoName) { unassigned.push(entry); return; }
    var key = normalizeNameV20_1_(ftoName);
    if (!byFto[key]) byFto[key] = { display: ftoName, trainees: [] };
    byFto[key].trainees.push(entry);
  });

  // --- compose ---
  var today = dateKeyV20_1_(new Date());
  var T = [], H = [];
  function line(t) { T.push(t); }
  H.push('<div style="font-family:Arial,sans-serif;max-width:680px">');
  H.push('<h2 style="margin:0 0 4px">SCEMS FTO Scoreboard — ' + today + '</h2>');
  H.push('<p style="margin:0 0 14px;color:#555">Active trainees: <b>' + totals.active +
    '</b> · current: <b style="color:#2e7d32">' + totals.current +
    '</b> · overdue: <b style="color:#b7791f">' + totals.overdue +
    '</b> · never evaluated: <b style="color:#c62828">' + totals.never + '</b> · eval limit: ' + threshold + ' days</p>');
  line('SCEMS FTO SCOREBOARD — ' + today);
  line('Active ' + totals.active + ' | current ' + totals.current + ' | overdue ' + totals.overdue + ' | never evaluated ' + totals.never);
  line('');

  var ftoKeys = Object.keys(byFto).sort(function (a, b) {
    var wa = Math.max.apply(null, byFto[a].trainees.map(function (x) { return x.sev; }));
    var wb = Math.max.apply(null, byFto[b].trainees.map(function (x) { return x.sev; }));
    return wb - wa;
  });
  ftoKeys.forEach(function (k) {
    var g = byFto[k];
    var filed = filedBy[k] || 0;
    H.push('<h3 style="margin:14px 0 2px;border-bottom:1px solid #ddd;padding-bottom:2px">FTO ' + g.display +
      ' <span style="font-weight:normal;color:#777">(' + g.trainees.length + ' trainee(s) · ' + filed + ' eval(s) ever filed by them)</span></h3>');
    line('FTO ' + g.display + '  (' + g.trainees.length + ' trainee(s), ' + filed + ' eval(s) ever filed by them)');
    g.trainees.sort(function (a, b) { return b.sev - a.sev; }).forEach(function (tr) {
      var col = tr.sev === 2 ? '#c62828' : tr.sev === 1 ? '#b7791f' : '#2e7d32';
      H.push('<p style="margin:3px 0 3px 12px"><b>' + tr.name + '</b> (' + tr.phase + ', ' + tr.evals +
        ' eval(s)) — <span style="color:' + col + '">' + tr.status + '</span>' +
        (tr.flags.length ? '<br><span style="color:#c62828;font-size:12px">&nbsp;&nbsp;audit: ' + tr.flags.join('; ') + '</span>' : '') + '</p>');
      line('   ' + tr.name + ' (' + tr.phase + ', ' + tr.evals + ' evals) — ' + tr.status +
        (tr.flags.length ? '  [audit: ' + tr.flags.join('; ') + ']' : ''));
    });
    line('');
  });

  if (unassigned.length) {
    H.push('<h3 style="margin:14px 0 2px;color:#c62828">Trainees with NO assigned FTO</h3>');
    line('TRAINEES WITH NO ASSIGNED FTO');
    unassigned.forEach(function (tr) {
      H.push('<p style="margin:3px 0 3px 12px"><b>' + tr.name + '</b> — ' + tr.status + '</p>');
      line('   ' + tr.name + ' — ' + tr.status);
    });
    line('');
  }

  var filers = Object.keys(filedBy).sort(function (a, b) { return filedBy[b] - filedBy[a]; });
  H.push('<h3 style="margin:14px 0 2px;border-bottom:1px solid #ddd;padding-bottom:2px">Filing totals — every eval ever filed, by who filed it</h3>');
  line('FILING TOTALS (all evals on record, by filer)');
  filers.forEach(function (k) {
    H.push('<p style="margin:2px 0 2px 12px">' + filedByDisplay[k] + ' : <b>' + filedBy[k] + '</b></p>');
    line('   ' + filedByDisplay[k] + ' : ' + filedBy[k]);
  });

  H.push('<p style="margin-top:16px;color:#888;font-size:12px">Generated from live SCEMS data. Every number is traceable: evals on tab 02, decisions on tab 21, flags on tab 13.</p></div>');
  line('');
  line('Generated from live SCEMS data ' + new Date() + '. Every number traceable on tabs 02 / 21 / 13.');

  var to = sessionEmailV20_1_() || CONFIG.TCO_EMAIL;
  sendHtmlMail(to, 'SCEMS FTO Scoreboard — ' + today, T.join('\n'), H.join('\n'));
  var msg = 'Scoreboard sent to ' + to + '.\n\n' + T.join('\n');
  systemLog_('INFO', 'FTO SCOREBOARD SENT',
    totals.active + ' active, ' + totals.overdue + ' overdue, ' + totals.never + ' never evaluated');
  try { SpreadsheetApp.getUi().alert(('Scoreboard emailed to ' + to + '.\n\n' + T.join('\n')).slice(0, 1400)); } catch (e) {}
  Logger.log(msg);
  return msg;
}

function redoAuditTabV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  var R = [];

  // ---- 0. banner (rows 1–3): one job, one path — formulas in B5:G44 stay untouched ----
  try {
    sh.getRange(1, 1, 3, 12).clearContent().clearNote().clearFormat();
    sh.getRange(1, 1, 1, 7).merge()
      .setValue('AUDIT — live conditions the desk is watching. Do not type in the FLAG grid.')
      .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold')
      .setFontSize(12).setVerticalAlignment('middle');
    sh.getRange(2, 1, 1, 7).merge()
      .setValue('RED = nobody owns it yet   ·   AMBER = you logged / Accepted it (still counts)   ·   blank = clean')
      .setBackground('#ECEFF1').setFontColor('#37474F').setFontWeight('bold')
      .setVerticalAlignment('middle');
    sh.getRange(3, 1, 1, 7).merge()
      .setValue('Clear a FLAG: fix the underlying data (eval narrative, phase, activity…). Living with it: SCEMS → Work audit flags. Never edit B5:G44 by hand.')
      .setBackground('#FFF8E1').setFontColor('#5D4037').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
      .setVerticalAlignment('middle');
    sh.setRowHeight(1, 28);
    sh.setRowHeight(2, 24);
    sh.setRowHeight(3, 36);
    R.push('Banner rows 1–3: how flags clear vs how you own them.');
  } catch (eBan) { R.push('Banner skipped: ' + eBan); }

  // ---- 1. headers + notes (labels only; formulas untouched) ----
  var heads = [
    ['ADV vs SCORE',   'Advancement requested while recent scores do not support it. Clears when scores support the request or it is withdrawn.'],
    ['REFLECT vs SCORE','Trainee self-assessment strongly disagrees with FTO scoring. Clears as they converge.'],
    ['NO NARRATIVE',   'An extreme score (1 or 5) with no written justification. Clears when the FTO adds narrative on the eval.'],
    ['SILENT RECORD',  'Activity stopped flowing for this trainee. Clears as evals and reflections resume.'],
    ['FTO SCOPE',      'A sign-off or eval outside the FTO\'s level/scope. Clears when corrected.'],
    ['PHASE MISMATCH', 'CURRENT PHASE on TRAINEES disagrees with the latest eval. Clears when phase is corrected on TRAINEES.']
  ];
  for (var c = 0; c < 6; c++) {
    var cell = sh.getRange(4, 2 + c);
    cell.setValue(heads[c][0]).setNote(heads[c][1] +
      '\n\nThis cell is a formula. You cannot dismiss it by typing. Fix the condition, or SCEMS → Work audit flags.');
  }
  sh.getRange(4, 1).setValue('TRAINEE')
    .setNote('Names flow from the roster. Matrix B5:G44 is machine-owned — hands off. Your writes go in the FLAG REVIEW LOG below.');
  sh.getRange(4, 1, 1, 7).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#455A64').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('middle');
  sh.setFrozenRows(4);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  for (var w = 2; w <= 7; w++) sh.setColumnWidth(w, 118);
  sh.getRange(5, 1, 40, 1).setFontWeight('bold');
  sh.getRange(5, 2, 40, 6).setHorizontalAlignment('center');
  R.push('Headers, notes, freeze, and widths applied.');

  // ---- 2. remove the trap checkbox (old "clear all" bait) ----
  try {
    sh.getRange(2, 10).removeCheckboxes();
    sh.getRange(2, 10).clearContent().setNote('');
    R.push('Trap "clear all" checkbox removed.');
  } catch (e1) { R.push('Checkbox removal skipped: ' + e1); }

  // ---- 3. FLAG REVIEW LOG (yours) ----
  var LOG_HEADS = ['DATE', 'TRAINEE', 'FLAG TYPE', 'REVIEWER', 'ACTION TAKEN', 'STATUS'];
  var flagTypes = heads.map(function (h) { return h[0]; });
  var statuses = ['Under review', 'Action taken — awaiting data', 'Resolved', FLAG_ACCEPT_STATUS_V20_2];
  var logRow = 0;
  var scanN = Math.max(sh.getLastRow(), 60);
  var scan = sh.getRange(1, 1, scanN, 2).getValues();
  for (var i = 44; i < scan.length; i++) {
    if (String(scan[i][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[i][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = i + 1; break; }
  }
  if (!logRow) logRow = Math.max(sh.getLastRow() + 2, 47);
  if (sh.getMaxRows() < logRow + 24) sh.insertRowsAfter(sh.getMaxRows(), logRow + 24 - sh.getMaxRows());
  sh.getRange(logRow, 1, 1, 6).merge().breakApart();
  sh.getRange(logRow, 1, 1, 6).merge()
    .setValue('FLAG REVIEW LOG — what you decided about each FLAG while the data catches up. Prefer SCEMS → Work audit flags (records name + review-by).')
    .setBackground('#B7791F').setFontColor('#FFFFFF').setFontWeight('bold')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setRowHeight(logRow, 32);
  sh.getRange(logRow + 1, 1, 1, 6).setValues([LOG_HEADS])
    .setFontWeight('bold').setBackground('#FFF3D6');
  var entry = sh.getRange(logRow + 2, 1, 20, 6);
  entry.setBackground('#FFFDF4').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(logRow + 2, 1, 20, 1).setNumberFormat('m/d/yyyy');
  sh.getRange(logRow + 2, 3, 20, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(flagTypes, true).setAllowInvalid(true).build());
  sh.getRange(logRow + 2, 6, 20, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(true).build());
  var tl = traineeListSafeV20_1_();
  if (tl.length) {
    sh.getRange(logRow + 2, 2, 20, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(tl, true).setAllowInvalid(true).build());
  }
  R.push('FLAG REVIEW LOG ready at row ' + logRow + '.');

  // ---- 4. red / amber colors (amber = already in the review log) ----
  try {
    var styleMsg = ackFlagStyleV20_1(true);
    R.push(String(styleMsg).split('\n')[0] || 'Flag colors applied.');
  } catch (eStyle) {
    var matrix = sh.getRange(5, 2, 40, 6);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('FLAG').setBackground('#C62828').setFontColor('#FFFFFF').setBold(true)
        .setRanges([matrix]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenCellNotEmpty().setFontColor('#9E9E9E')
        .setRanges([matrix]).build()
    ]);
    R.push('Flag colors: red only (amber style failed: ' + eStyle + ').');
  }

  // ---- 5. pipeline match report (read-only) ----
  var P = [];
  var formulas = sh.getRange(5, 2, 40, 6).getFormulas();
  var refs = {}, staticCells = 0, formulaCells = 0, emptyCells = 0;
  formulas.forEach(function (row, ri) {
    row.forEach(function (f, ci) {
      if (!f) {
        var v = sh.getRange(5 + ri, 2 + ci).getValue();
        if (v === '' || v == null) emptyCells++; else staticCells++;
        return;
      }
      formulaCells++;
      (f.match(/'([^']+)'!/g) || []).forEach(function (m) {
        refs[m.slice(1, -2)] = (refs[m.slice(1, -2)] || 0) + 1;
      });
      (f.match(/(?:^|[^A-Za-z0-9_'!])([A-Za-z0-9_]{2,})!/g) || []).forEach(function (m2) {
        var nm = m2.replace(/^[^A-Za-z0-9_]*/, '').replace(/!$/, '');
        refs[nm] = (refs[nm] || 0) + 1;
      });
    });
  });
  P.push('Matrix cells: ' + formulaCells + ' formula(s), ' + staticCells + ' static value(s), ' + emptyCells + ' empty.');
  if (staticCells) P.push('  ← STATIC CELLS in a formula matrix deserve review: a typed value never clears itself.');
  var liveTabs = {};
  ss().getSheets().forEach(function (s2) { liveTabs[s2.getName()] = true; });
  Object.keys(refs).forEach(function (t) {
    P.push('  pulls from "' + t + '" ×' + refs[t] + (liveTabs[t] ? '' : '   ← TAB DOES NOT EXIST — dead reference'));
  });
  if (!Object.keys(refs).length && formulaCells) P.push('  (formulas reference only this sheet)');
  var masterNorms = {};
  masterTraineeRowsV20_1_().forEach(function (t3) { masterNorms[t3.norm] = true; });
  var nameCol = sh.getRange(5, 1, 40, 1).getValues();
  var staleNames = [];
  nameCol.forEach(function (r4, i4) {
    var nm = String(r4[0] || '').trim();
    if (!nm) return;
    if (nm.indexOf('EXAMPLE') === 0 || nm.indexOf(TEST_PREFIX) === 0) return;
    if (!masterNorms[normalizeNameV20_1_(nm)]) staleNames.push('row ' + (5 + i4) + ' [' + nm + ']');
  });
  P.push(staleNames.length
    ? 'Names not on the active master: ' + staleNames.join(', ') + '  ← stale rows (closed trainees linger until the matrix rebuilds)'
    : 'Every name in the matrix matches the active master.');

  var msg = 'AUDIT TAB READY\n\n' + R.join('\n') +
    '\n\nPIPELINE (read-only — formulas untouched):\n' + P.join('\n') +
    '\n\nNext: SCEMS → Work audit flags for any RED cells.';
  systemLog_('INFO', 'AUDIT TAB REDONE', 'layout/notes/review log applied; formulas untouched');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e2) {}
  return msg;
}

/** (internal) active trainee names for the review-log dropdown. */
function traineeListSafeV20_1_() {
  var out = [];
  try {
    masterTraineeRowsV20_1_().forEach(function (t) {
      if (!t.closed && String(t.name).indexOf('EXAMPLE') !== 0 &&
          String(t.name).indexOf(TEST_PREFIX) !== 0) out.push(t.name);
    });
  } catch (e) {}
  return out;
}


/* ====================================================================== */
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

/** Public name for the skill-matrix rebuild. The underscore form is easy to
 *  miss in the Apps Script Run dropdown; this is the one to pick. */
function rebuildSkillMatrix() {
  if (!gateV20_2_('WORK QUEUE')) return;
  rebuildSkillMatrixV19_();
  var msg = 'Skill matrix rebuilt from the evidence and sign-off logs.';
  systemLog_('INFO', 'SKILL MATRIX REBUILT', 'rebuildSkillMatrix');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

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


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 75_presentation
 *
 * How the sheets look and read. Three versions of this concern used to sit
 * in three separate blocks.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   SCEMS v20.5 : the badge, and a masthead on every page
 *   The badge is a black shield with a white star of life. It disappears
 *   on a dark band, so the masthead is light — cream ground, charcoal
 *   type, a gold rule underneath. That is also the right way round for a
 *   document people print.
 *   Rows 1 to 3 are the masthead on every sheet. Row 4 is the header row,
 *   which is where the data has always started, so nothing below moves.
 *   SCEMS v20.4 : plain English, correct headers, plumbing out of sight
 *   The problem this solves, in the order it hurts:
 *   1. 12 DECISION QUEUE's header row is one column SHORT of its data,
 *   so every label from column D rightward names the wrong column.
 *   2. 01 TRAINEE MASTER carries an ENTRY PROFILE KEY legend inside the
 *   data table, and on at least one row it contradicts the code
 *   beside it.
 *   3. Header rows cannot decide between Title Case and SHOUTING CASE.
 *   4. Up to 44% of the columns on a record sheet are machine plumbing.
 *   5. Raw counters sit far from the thresholds that give them meaning.
 *   6. Action checkboxes are interleaved with data and IDs.
 *   The thing that made this hard: 235 places in this file look a column
 *   up BY ITS HEADER TEXT. Renaming a header on the sheet would break all
 *   of them at once. So the rename is made safe first, by teaching the
 *   table reader that a display label and a canonical name are the same
 *   column. Nothing downstream changes.
 *   SCEMS v20.3 : the readable release
 *   "if im the division chief and i open the spreadsheet i should be
 *   able to see any submissions, where the trainee is at, and have a
 *   simple button to press on each trainee ... once someone is ready
 *   to be released this should be a simple check box ... it should
 *   take all the information gathered on that trainee, create a file
 *   of everything done from day 1 until release, and i should be able
 *   to get that information any time i like ... i want to view any
 *   comments in their entirety, not having to constantly wrap the
 *   text because the cells aren't big enough."
 *   Three things, and nothing else:
 *   1. TRAINEES  — one row per person, plain words, two checkboxes
 *   2. the file  — everything from day one, as a document you can keep
 *   3. readable  — narrative columns wide enough to actually read
 *   SCEMS v20.1.0h ADD-ON : makeQueueReadableV20_1
 *   FORMATTING ONLY. Reads the queue through the same header-mapped
 *   loader the system uses; changes how the tab LOOKS and never what
 *   it SAYS. No row is moved, sorted, hidden, or edited.
 *   SCEMS v20.1.0i ADD-ON : make the flags fixable
 *   SCEMS v20.1.0i ADD-ON : fix all current flags, one click
 *   SCEMS v20.1.0i ADD-ON : flags, simplified for one human
 */

var BRAND_V20_5 = Object.freeze({
  INK:      '#1d1b18',   // the shield's black
  INK_SOFT: '#4a453d',
  MUTE:     '#6f6859',
  GOLD:     '#c9a227',   // the county gold, used only as a rule and for accents
  PAPER:    '#faf8f3',
  RULE:     '#e0dace',
  HEAD_BG:  '#1d1b18',   // the column-header band
  HEAD_FG:  '#f4f1ea',
  FONT:     'Arial'
});

/** What each sheet is FOR, in one line, under its title. A masthead that
 *  only repeats the tab name is decoration; this earns its space. */
function sheetPurposeV20_5_() {
  var m = {};
  m['TRAINEES']              = ['Trainees', 'Everyone in training. Tick a box to open someone’s file or release them.'];
  m['HOME']                  = ['Field Training Programme', 'Where things stand today.'];
  m[TAB.CONTROL]             = ['Mission Control', 'Programme settings, forms and reference data.'];
  m[TAB.MASTER]              = ['Trainee Master', 'One row per person: level, phase, who trains them, how they came in.'];
  m[TAB.SKILLS]              = ['Skills Progress', 'One row per person per skill. The system keeps this current — do not type in it.'];
  m[TAB.SKILL_VALIDATION]    = ['Sign-off Queue', 'Skills that have met their evidence and are waiting on a decision from you.'];
  m[TAB.QUEUE]               = ['Decision Queue', 'Advancements, reviews and programme decisions awaiting an outcome.'];
  m[TAB.AUDIT]               = ['Audit and Exceptions', 'Conditions the system has flagged. Fix the cause, or accept a flag with a reason.'];
  m[TAB.WEEKLY]              = ['Weekly Status', 'The programme at a glance, rebuilt each Monday.'];
  m[TAB.FTO_VIEW]            = ['FTO View', 'What each training officer is carrying.'];
  m[TAB.TRAINEE_VIEW]        = ['Trainee View', 'Each trainee’s own picture of where they are.'];
  m[TAB.DASH]                = ['Training Division Dashboard', 'Programme-level numbers for the Division Chief.'];
  m[TAB.MD_VIEW]             = ['Medical Director View', 'Clinical competency and anything needing medical review.'];
  m[TAB.CATALOG]             = ['Skill Catalog', 'Every skill, who must do it, and how much evidence it takes. Edited by hand.'];
  m[TAB.FTO_ROSTER]          = ['FTO Roster', 'Training officers, their levels, and what they may sign off.'];
  m[TAB.TRAINEE_SKILLS]      = ['Trainee Skills', 'One trainee’s skills, for reading and for approving in place.'];
  m[TAB.SKILL_EVIDENCE]      = ['Skill Evidence Log', 'Every repetition an FTO has logged. Append-only — a permanent record.'];
  m[TAB.SKILL_SIGNOFF]       = ['Skill Sign-off Log', 'Every sign-off decision ever made. Append-only — a permanent record.'];
  m[TAB.DECISIONS]           = ['Decisions', 'Programme decisions as filed. Append-only — a permanent record.'];
  m[TAB.ARCHIVE]             = ['Trainee Archive', 'People who have completed or left the programme.'];
  m[TAB.EVAL]                = ['Shift Evaluations', 'Every submitted shift evaluation, exactly as the FTO wrote it.'];
  m[TAB.REFLECT]             = ['Self-Reflections', 'Every trainee reflection, in their own words.'];
  m[TAB.URGENT]              = ['Urgent Concerns', 'Concerns raised from the field. Read these first.'];
  m[TAB.ANALYTICS]           = ['Analytics', 'Trends across the programme.'];
  m[TAB.ENGINE]              = ['Phase and Status Engine', 'Working sheet. The system reads and writes this — do not edit it.'];
  m[TAB.LOG]                 = ['System Log', 'What the system did, and when. Diagnostic.'];
  m[TAB.REGISTRY]            = ['Person Registry', 'Identity and role for everyone the system knows.'];
  m[TAB.LEDGER]              = ['Ingestion Ledger', 'Every form submission received, and what became of it.'];
  m[TAB.ASSIGNMENTS]         = ['Assignment History', 'Who was assigned to whom, and when.'];
  m[TAB.ACCESS]              = ['Access Log', 'Every request to act, granted or refused, with the identity behind it.'];
  return m;
}

/** The badge as an image blob, or null when it is missing or a stub.
 *  A 1x1 placeholder is treated as absent — better no badge than an
 *  invisible pixel that looks like a bug. */
function badgeBlobV20_5_() {
  try {
    var b64 = String(BADGE_B64 || '');
    if (b64.length < 1000) return null;          // placeholder, not a real badge
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'scems_badge.png');
  } catch (e) { return null; }
}

/** True when BADGE_B64 holds a real image rather than a placeholder. */
function badgeIsRealV20_5_() {
  return String(BADGE_B64 || '').length >= 1000;
}

/** Puts the masthead on one sheet: badge, title, what the sheet is for,
 *  and a gold rule. Formatting only — it writes rows 1 to 3, which have
 *  always been chrome, and never touches row 4 or below. */
function brandSheetV20_5_(sheetName, title, subtitle, width) {
  var sh = getSheetOrNullV20_1_(sheetName);
  if (!sh) return false;
  var B = BRAND_V20_5;
  var cols = Math.max(width || sh.getLastColumn(), 6);

  // one badge, not one per run
  try {
    (sh.getImages() || []).forEach(function (img) { try { img.remove(); } catch (e) {} });
  } catch (e) {}

  sh.getRange(1, 1, 3, cols).setBackground(B.PAPER).setFontFamily(B.FONT);
  try { sh.setRowHeight(1, 54); sh.setRowHeight(2, 20); sh.setRowHeight(3, 6); } catch (e) {}

  sh.getRange(1, 1, 1, cols).clearContent();
  sh.getRange(2, 1, 1, cols).clearContent();

  sh.getRange(1, 2)
    .setValue(title)
    .setFontSize(16).setFontWeight('bold').setFontColor(B.INK)
    .setVerticalAlignment('bottom').setHorizontalAlignment('left');
  sh.getRange(2, 2)
    .setValue(subtitle)
    .setFontSize(10).setFontColor(B.MUTE)
    .setVerticalAlignment('top').setHorizontalAlignment('left');

  // county mark, right-aligned, quiet
  sh.getRange(1, Math.max(cols - 1, 3))
    .setValue('SUMTER COUNTY EMS')
    .setFontSize(9).setFontWeight('bold').setFontColor(B.GOLD)
    .setHorizontalAlignment('right').setVerticalAlignment('bottom');
  sh.getRange(2, Math.max(cols - 1, 3))
    .setValue(String(CONFIG.POLICY_VERSION || ''))
    .setFontSize(8).setFontColor(B.MUTE)
    .setHorizontalAlignment('right').setVerticalAlignment('top');

  // the gold rule
  sh.getRange(3, 1, 1, cols).setBackground(B.GOLD);

  // the badge sits over column A, clear of the text in column B
  var blob = badgeBlobV20_5_();
  if (blob) {
    try { sh.insertImage(blob, 1, 1, 6, 5).setWidth(43).setHeight(47); } catch (e) {}
    try { if (sh.getColumnWidth(1) < 56) sh.setColumnWidth(1, 56); } catch (e) {}
  }

  // the column-header band, so every sheet reads the same way
  try {
    sh.getRange(4, 1, 1, cols)
      .setBackground(B.HEAD_BG).setFontColor(B.HEAD_FG)
      .setFontWeight('bold').setFontSize(10)
      .setVerticalAlignment('middle').setWrap(true);
    sh.setRowHeight(4, 38);
    sh.setFrozenRows(4);
  } catch (e) {}
  return true;
}

/** Puts the masthead on every sheet that has one defined. */
function brandAllSheetsV20_5() {
  if (!gateV20_2_('WORK QUEUE')) return;
  if (!badgeIsRealV20_5_()) {
    var warn = 'The badge image is missing from this build.\n\n' +
      'BADGE_B64 holds a placeholder rather than the county shield, so the ' +
      'masthead would go on without it. Everything else still applies.\n\n' +
      'Recover the real badge from an older copy of the script before running ' +
      'this, or accept a masthead with no shield.';
    systemLog_('WARN', 'BADGE MISSING', 'BADGE_B64 is a placeholder');
    Logger.log(warn);
    try { SpreadsheetApp.getUi().alert(warn); } catch (e) {}
  }

  var purpose = sheetPurposeV20_5_();
  var done = [], skipped = [];
  ss().getSheets().forEach(function (sh) {
    var name = sh.getName();
    var p = purpose[name];
    if (!p) { skipped.push(name); return; }
    var width = name === 'TRAINEES' ? CONSOLE_HEADERS_V20_3.length : sh.getLastColumn();
    if (brandSheetV20_5_(name, p[0], p[1], width)) done.push(name);
  });

  var msg = 'MASTHEAD APPLIED\n\n' +
    done.length + ' sheet(s) branded:\n  ' + done.join('\n  ') +
    (skipped.length ? '\n\nNo masthead defined for (left alone):\n  ' + skipped.join('\n  ') : '') +
    '\n\nEach page now carries the county shield, its name, and one line saying\n' +
    'what it is for. Rows 1 to 3 only — no data moved.' +
    (badgeIsRealV20_5_() ? '' : '\n\nNOTE: the shield is missing from this build, see the warning above.');
  systemLog_('INFO', 'MASTHEAD APPLIED', done.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Display label -> canonical header name, PER SHEET.
 *
 *  Derived from the rename plan below, reversed, so there is exactly one
 *  place that says what a column is called. It has to be per sheet: the
 *  evidence log has its own PHASE column that is not the master's CURRENT
 *  PHASE, and the access log has a REASON that is not a queue RATIONALE.
 *  A global alias table would have quietly wired those together.
 *
 *  This is what makes the rename safe. readTableV20_1_ registers both the
 *  literal header and its canonical name, so all 235 lookups by canonical
 *  name keep resolving after a column is relabelled.
 */
var HEADER_ALIAS_CACHE_V20_4 = null;

function headerAliasesForV20_4_(sheetName) {
  if (!HEADER_ALIAS_CACHE_V20_4) {
    HEADER_ALIAS_CACHE_V20_4 = {};
    var plan = headerRenamesV20_4_();
    Object.keys(plan).forEach(function (sheet) {
      var back = {};
      Object.keys(plan[sheet]).forEach(function (canon) {
        back[String(plan[sheet][canon]).toUpperCase().replace(/\s+/g, ' ')] = canon;
      });
      HEADER_ALIAS_CACHE_V20_4[sheet] = back;
    });
  }
  return HEADER_ALIAS_CACHE_V20_4[sheetName] || {};
}

/** The canonical name for a header on a given sheet, or '' when it is
 *  already canonical or unknown. Case and spacing insensitive. */
function canonicalHeaderV20_4_(header, sheetName) {
  var k = String(header || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!k) return '';
  return headerAliasesForV20_4_(sheetName)[k] || '';
}

/* ---------------------------------------------------------------- *
 *  The renames, per sheet
 * ---------------------------------------------------------------- */

/** What each sheet's headers should say. Canonical name on the left,
 *  what a person reads on the right. A sheet not listed is left alone. */
function headerRenamesV20_4_() {
  var m = {};
  m[TAB.MASTER] = {
    'SET STATUS': 'Program status',
    'PHASE START DATE': 'Phase started',
    'NRT DATE': 'Not-responding-to-training date',
    'CLEARANCE DATE': 'Cleared date',
    'ENTRY PROFILE': 'How they came in',
    'ASSIGNED FTO': 'Training officer',
    'START DATE': 'Started',
    'TRAINEE EMAIL': 'Email address'
  };
  m[TAB.SKILLS] = {
    'READINESS': 'Where this skill stands',
    'SIGN-OFF': 'Signed off?',
    'SUCCESSFUL REPS': 'Successful',
    'INDEPENDENT REPS': 'Independent',
    'DISTINCT DATES': 'Separate days',
    'DISTINCT FTOS': 'Different FTOs',
    'DECISION / EVIDENCE NOTE': 'Note',
    'LAST DATE': 'Last logged',
    'LAST OUTCOME': 'How it went',
    'LAST CONTEXT': 'Where it happened'
  };
  m[TAB.SKILL_VALIDATION] = {
    'EVIDENCE SUMMARY': 'Evidence so far',
    'RATIONALE': 'Reason for the decision',
    'READY DATE': 'Ready since',
    'LAST EVIDENCE DATE': 'Last evidence'
  };
  m[TAB.SKILL_EVIDENCE] = {
    'VALIDATION RESULT': 'Accepted?',
    'EVIDENCE NOTE': 'What the FTO wrote',
    'CALL / SCENARIO REF': 'Call number',
    'PROMPTING': 'Prompting needed',
    'LEVEL AT EVENT': 'Level then'
  };
  m[TAB.SKILL_SIGNOFF] = {
    'RATIONALE': 'Reason given',
    'STANDARD / CATALOG VERSION': 'Standard used'
  };
  m[TAB.QUEUE] = {
    'FILED': 'Raised',
    'ITEM': 'What it is',
    'DECISION DUE': 'Due',
    'DATED': 'Decided on'
  };
  return m;
}

/** Columns nobody reading the sheet ever needs: IDs, provenance,
 *  writer stamps. Correct, necessary, and not for human eyes. */
function plumbingColumnsV20_4_() {
  var m = {};
  m[TAB.SKILL_EVIDENCE] = ['EVENT ID', 'SOURCE FORM', 'SOURCE ROW', 'SOURCE FORM ID',
                           'SOURCE RESPONSE ID', 'WRITER VERSION', 'PERSON ID', 'ASSIGNMENT ID'];
  m[TAB.SKILL_SIGNOFF] = ['DECISION ID', 'SOURCE QUEUE ROW', 'STANDARD / CATALOG VERSION',
                          'REQUEST ID', 'SUPERSEDES', 'DECIDED BY PERSON ID', 'WRITER VERSION'];
  m[TAB.SKILL_VALIDATION] = ['REQUEST ID', 'SKILL ID'];
  m[TAB.SKILLS] = ['SKILL ID', 'SUCCESSFUL REPS', 'INDEPENDENT REPS',
                   'DISTINCT DATES', 'DISTINCT FTOS'];
  m[TAB.MASTER] = ['ENTRY PROFILE KEY'];
  m[TAB.LEDGER] = ['LEDGER KEY', 'FORM ID', 'RESPONSE ID', 'WRITER VERSION'];
  m[TAB.REGISTRY] = ['PERSON ID'];
  return m;
}

/* ---------------------------------------------------------------- *
 *  1. The broken header row
 * ---------------------------------------------------------------- */

/** 12 DECISION QUEUE's header names 8 columns; its rows carry 9. The
 *  owner column — who the item sits with — was never given a name, so
 *  DECISION DUE ended up over a person's name and every label after it
 *  described its neighbour.
 *
 *  Inserts the missing name. Touches the header row only; not one data
 *  cell moves, because the data was never wrong — only its labels. */
function repairDecisionQueueHeaderV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.QUEUE, 4);
  if (!t.ok) return 'Tab "' + TAB.QUEUE + '" not found.';

  var named = t.headers.filter(function (h) { return String(h || '').trim(); }).length;
  var widest = 0;
  t.rows.forEach(function (r) {
    var last = 0;
    r.forEach(function (v, i) { if (v !== '' && v != null) last = i + 1; });
    if (last > widest) widest = last;
  });

  if (widest <= named) {
    return 'No repair needed: ' + named + ' header(s) for ' + widest + ' column(s) of data.';
  }
  if (t.col['OWNER'] !== undefined) {
    return 'Already repaired — an OWNER column is named.';
  }

  // The unnamed column is the one after ITEM. Shift the labels right by one
  // and give it its name.
  var idxItem = t.col['ITEM'];
  if (idxItem === undefined) {
    return 'Refusing to repair: no ITEM column to anchor on. Header row needs a look by hand.';
  }
  var fixed = t.headers.slice(0, idxItem + 1)
    .concat(['OWNER'])
    .concat(t.headers.slice(idxItem + 1));
  fixed = fixed.slice(0, Math.max(widest, fixed.length));
  while (fixed.length < widest) fixed.push('');

  t.sheet.getRange(4, 1, 1, fixed.length).setValues([fixed]);
  var msg = 'DECISION QUEUE HEADER REPAIRED\n\n' +
    'Was : ' + t.headers.filter(String).join(' | ') + '\n\n' +
    'Now : ' + fixed.filter(String).join(' | ') + '\n\n' +
    'An unnamed column sat after ITEM — the person the item is with. Every\n' +
    'label to its right was describing its neighbour. Only the header row\n' +
    'changed; no data moved, because the data was never wrong.';
  systemLog_('WARN', 'DECISION QUEUE HEADER REPAIRED',
    named + ' header(s) -> ' + fixed.filter(String).length + ' for ' + widest + ' data column(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  2. The entry-profile contradiction
 * ---------------------------------------------------------------- */

/** ENTRY PROFILE holds a bare letter; ENTRY PROFILE KEY holds a legend
 *  like "C : Experienced transfer" — filled in on some rows, blank on
 *  others, and on at least one row naming a different letter than the
 *  code beside it.
 *
 *  This REPORTS rather than resolves. Which of the two is right is a
 *  fact about a person's training history, and v20.2's rule holds: the
 *  system does not guess at a record. It names every disagreement, and
 *  writes the legend once, properly, above the table. */
function auditEntryProfilesV20_4() {
  var t = readTableV20_1_(TAB.MASTER, 4);
  if (!t.ok) return 'Trainee master not found.';
  var cCode = t.col['ENTRY PROFILE'], cKey = t.col['ENTRY PROFILE KEY'], cName = t.col['TRAINEE'];
  if (cCode === undefined || cName === undefined) return 'No ENTRY PROFILE column to audit.';

  var clash = [], missing = [], legend = {};
  t.rows.forEach(function (r, i) {
    var name = cleanNameV20_1_(r[cName]);
    if (!name) return;
    var code = String(r[cCode] || '').trim().toUpperCase();
    var key = cKey === undefined ? '' : String(r[cKey] || '').trim();
    if (key) {
      var m = key.match(/^([A-Z])\s*:\s*(.+)$/i);
      if (m) legend[m[1].toUpperCase()] = m[2].trim();
    }
    if (!code) { missing.push(name + ' (row ' + (t.firstDataRow + i) + ') — no entry profile'); return; }
    if (key) {
      var keyLetter = (key.match(/^([A-Z])/i) || [])[1];
      if (keyLetter && keyLetter.toUpperCase() !== code) {
        clash.push(name + ' (row ' + (t.firstDataRow + i) + ') — profile says "' + code +
                   '" but the key beside it says "' + key + '"');
      }
    }
  });

  var L = ['ENTRY PROFILE AUDIT — read only', ''];
  if (clash.length) {
    L.push('DISAGREEMENTS — these need your decision, not mine:');
    clash.forEach(function (x) { L.push('  ' + x); });
    L.push('');
    L.push('Which is correct is a fact about that person\'s history. Fix the one');
    L.push('that is wrong on 01 TRAINEE MASTER, then run this again.');
    L.push('');
  } else {
    L.push('No profile/key disagreements.');
    L.push('');
  }
  if (missing.length) {
    L.push('NO ENTRY PROFILE SET:');
    missing.forEach(function (x) { L.push('  ' + x); });
    L.push('');
  }
  var letters = Object.keys(legend).sort();
  if (letters.length) {
    L.push('The legend, as found in the data:');
    letters.forEach(function (k) { L.push('  ' + k + '  =  ' + legend[k]); });
    L.push('');
    L.push('Run tidyEntryProfileLegendV20_4() to move this out of the data table');
    L.push('and into a note on the column heading, where a legend belongs.');
  }
  var msg = L.join('\n');
  systemLog_(clash.length ? 'WARN' : 'INFO', 'ENTRY PROFILE AUDIT',
    clash.length + ' disagreement(s), ' + missing.length + ' unset');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Lifts the entry-profile legend out of the data table and attaches it
 *  to the column heading as a note, then hides the now-redundant column.
 *  The column keeps its contents — nothing is deleted. */
function tidyEntryProfileLegendV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.MASTER, 4);
  if (!t.ok) return 'Trainee master not found.';
  var cCode = t.col['ENTRY PROFILE'], cKey = t.col['ENTRY PROFILE KEY'];
  if (cCode === undefined) return 'No ENTRY PROFILE column.';

  var legend = {};
  if (cKey !== undefined) {
    t.rows.forEach(function (r) {
      var key = String(r[cKey] || '').trim();
      var m = key.match(/^([A-Z])\s*:\s*(.+)$/i);
      if (m) legend[m[1].toUpperCase()] = m[2].trim();
    });
  }
  var letters = Object.keys(legend).sort();
  if (!letters.length) return 'No legend entries found to lift.';

  var note = 'How they came in\n\n' +
    letters.map(function (k) { return '  ' + k + '  =  ' + legend[k]; }).join('\n') +
    '\n\nThis legend used to live in a column of its own inside the data.';
  t.sheet.getRange(4, cCode + 1).setNote(note);
  systemLog_('INFO', 'ENTRY PROFILE LEGEND LIFTED', letters.join(', '));
  var msg = 'The entry-profile legend is now a note on the column heading:\n\n' +
    letters.map(function (k) { return '  ' + k + '  =  ' + legend[k]; }).join('\n') +
    '\n\nHover the heading to read it. The old ENTRY PROFILE KEY column keeps\n' +
    'its contents and is grouped away with the other machinery — nothing was\n' +
    'deleted.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  3. Plain English headers
 * ---------------------------------------------------------------- */

/** Rewrites header text into words, consistently cased. Safe because
 *  headerAliasesForV20_4_ teaches the table reader that the new label and
 *  the canonical name are the same column. */
function renameHeadersV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var plan = headerRenamesV20_4_();
  var out = [], total = 0;
  Object.keys(plan).forEach(function (sheetName) {
    var t = readTableV20_1_(sheetName, 4);
    if (!t.ok) { out.push('  ' + sheetName + ' : not present'); return; }
    var renames = plan[sheetName];
    var headers = t.headers.slice();
    var n = 0;
    headers.forEach(function (h, i) {
      var canon = String(h || '').trim().toUpperCase();
      var already = canonicalHeaderV20_4_(h, sheetName);
      var key = already || canon;
      if (renames[key] && headers[i] !== renames[key]) { headers[i] = renames[key]; n++; }
    });
    if (n) {
      t.sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
      total += n;
    }
    out.push('  ' + sheetName + ' : ' + n + ' header(s) renamed');
  });

  // the stray value that leaked into the matrix header row
  var m = readTableV20_1_(TAB.SKILLS, 4);
  if (m.ok) {
    var strayAt = -1;
    m.headers.forEach(function (h, i) {
      if (i >= 20 && String(h || '').trim()) strayAt = i;
    });
    if (strayAt >= 0) {
      m.sheet.getRange(4, strayAt + 1).clearContent();
      out.push('  ' + TAB.SKILLS + ' : cleared a stray value out of the header row (column ' +
               (strayAt + 1) + ', "' + m.headers[strayAt] + '")');
    }
  }

  var msg = 'HEADERS REWRITTEN IN PLAIN ENGLISH\n\n' + out.join('\n') +
    '\n\n' + total + ' header(s) changed in total.\n\n' +
    'Nothing behind the scenes changed: every one of the 235 places this\n' +
    'system looks a column up by name still finds it, because the old name\n' +
    'and the new label are registered as the same column.';
  systemLog_('WARN', 'HEADERS RENAMED', total + ' header(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  4. Plumbing out of sight
 * ---------------------------------------------------------------- */

/** Groups the machine columns and collapses the group, so they are one
 *  click away instead of in your eyeline. Nothing is deleted, nothing
 *  moves, and every one of them still receives data. */
function groupPlumbingColumnsV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var plan = plumbingColumnsV20_4_();
  var out = [];
  Object.keys(plan).forEach(function (sheetName) {
    var t = readTableV20_1_(sheetName, 4);
    if (!t.ok) { out.push('  ' + sheetName + ' : not present'); return; }
    var hidden = 0;
    plan[sheetName].forEach(function (canon) {
      var i = t.col[canon];
      if (i === undefined) return;
      try { t.sheet.hideColumns(i + 1); hidden++; } catch (e) {}
    });
    out.push('  ' + sheetName + ' : ' + hidden + ' machine column(s) tucked away');
  });
  var msg = 'MACHINE COLUMNS HIDDEN\n\n' + out.join('\n') +
    '\n\nIDs, provenance and writer stamps are still there and still being\n' +
    'written — they are just not in front of you any more. Select the\n' +
    'columns either side and choose Unhide to see them again.';
  systemLog_('INFO', 'PLUMBING COLUMNS HIDDEN', out.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Puts every hidden column back. */
function showAllColumnsV20_4() {
  var plan = plumbingColumnsV20_4_();
  var n = 0;
  Object.keys(plan).forEach(function (sheetName) {
    var sh = getSheetOrNullV20_1_(sheetName);
    if (!sh) return;
    try { sh.showColumns(1, sh.getMaxColumns()); n++; } catch (e) {}
  });
  var msg = 'Every column is visible again on ' + n + ' sheet(s).';
  systemLog_('INFO', 'ALL COLUMNS SHOWN', n + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  5. Counters that mean something where they sit
 * ---------------------------------------------------------------- */

/** "5 / 3 / 3 / 2" against thresholds on a different sheet is not
 *  information. This turns the queue's evidence summary into a sentence
 *  that carries its own thresholds. */
function evidenceSentenceV20_4_(counts, catalogEntry) {
  var c = catalogEntry || {};
  function part(have, need, word) {
    have = Number(have) || 0;
    need = Number(need) || 0;
    if (!need) return have + ' ' + word;
    return have + ' of ' + need + ' ' + word + (have >= need ? '' : '  (short)');
  }
  return [
    part(counts.successful, c.minSuccessful, 'successful'),
    part(counts.independent, c.minIndependent, 'independent'),
    part(counts.dates, c.minDates, 'separate days'),
    part(counts.ftos, c.minFtos, 'different FTOs')
  ].join('   ·   ');
}

/** Rewrites the evidence summary on every OPEN queue row into that
 *  sentence. Reads the catalog for the thresholds. Writes one column. */
function rewriteEvidenceSummariesV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (!t.ok) return 'Queue not found.';
  var cSum = t.col['EVIDENCE SUMMARY'], cSkill = t.col['SKILL ID'], cTrainee = t.col['TRAINEE'];
  if (cSum === undefined || cSkill === undefined) return 'Queue is missing its evidence columns.';

  var byId = {};
  try { byId = catalogMapsV19_(true).byId || {}; } catch (e) {}

  var m = readTableV20_1_(TAB.SKILLS, 4);
  var counts = {};
  if (m.ok && m.col['TRAINEE'] !== undefined) {
    m.rows.forEach(function (r) {
      var k = normalizeNameV20_1_(cleanNameV20_1_(r[m.col['TRAINEE']])) + '||' +
              String(r[m.col['SKILL ID']] || '').trim();
      counts[k] = {
        successful: r[m.col['SUCCESSFUL REPS']],
        independent: r[m.col['INDEPENDENT REPS']],
        dates: r[m.col['DISTINCT DATES']],
        ftos: r[m.col['DISTINCT FTOS']]
      };
    });
  }

  var n = 0;
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var skillId = String(r[cSkill] || '').trim();
    var key = normalizeNameV20_1_(cleanNameV20_1_(r[cTrainee])) + '||' + skillId;
    var c = counts[key];
    if (!c) return;
    t.sheet.getRange(t.firstDataRow + i, cSum + 1)
      .setValue(evidenceSentenceV20_4_(c, byId[skillId]));
    n++;
  });
  var msg = n + ' evidence summary(ies) rewritten as "3 of 5 successful · 2 of 2 independent · …"\n' +
    'so the thresholds are beside the counts instead of on another sheet.';
  systemLog_('INFO', 'EVIDENCE SUMMARIES REWRITTEN', n + ' row(s)');
  Logger.log(msg);
  return msg;
}

var TAB_CONSOLE_V20_3 = 'TRAINEES';

var CONSOLE_HEADERS_V20_3 = [
  'Trainee', 'Level', 'Phase', 'Weeks in phase', 'Last evaluation',
  'Evaluations', 'Skills signed off', 'Waiting on you', 'Concerns',
  'Open file', 'Release', 'Their file'
];

/* Column numbers on TRAINEES, so the edit handler and the builder agree. */
var CONSOLE_COL_V20_3 = Object.freeze({
  NAME: 1, LEVEL: 2, PHASE: 3, WEEKS: 4, LAST_EVAL: 5, EVALS: 6,
  SIGNED: 7, WAITING: 8, CONCERNS: 9, OPEN: 10, RELEASE: 11, FILE: 12
});

var CONSOLE_FIRST_ROW_V20_3 = 3;

/* ---------------------------------------------------------------- *
 *  1. The console
 * ---------------------------------------------------------------- */


/** Opens the TRAINEES tab, building it first if it is not there yet. */
function openTraineeConsoleV20_3() {
  var S = ss();
  var sh = S.getSheetByName(TAB_CONSOLE_V20_3);
  if (!sh) { buildTraineeConsoleV20_3(); sh = S.getSheetByName(TAB_CONSOLE_V20_3); }
  if (sh) {
    try { if (sh.isSheetHidden()) sh.showSheet(); } catch (e) {}
    S.setActiveSheet(sh);
    try { S.moveActiveSheet(1); } catch (e2) {}
  }
  return 'TRAINEES is open.';
}

/** Builds or refreshes TRAINEES: one row per person, in words rather
 *  than codes. Reads everything, decides nothing, writes no record. */
function buildTraineeConsoleV20_3() {
  var S = ss();
  var sh = S.getSheetByName(TAB_CONSOLE_V20_3);
  if (!sh) sh = S.insertSheet(TAB_CONSOLE_V20_3, 0);

  var people = masterTraineeRowsV20_1_().filter(function (p) { return !p.closed; });
  var closed = masterTraineeRowsV20_1_().filter(function (p) { return p.closed; });

  // ---- gather, once, rather than per person ----
  var evalRows = [], reflectRows = [], urgentRows = [];
  try { var e = readTableV20_1_(TAB.EVAL, 4); if (e.ok) evalRows = e.rows.map(function (r) {
    return { when: parseDateSafeV20_1_(r[0]), trainee: cleanNameV20_1_(r[2]) }; }); } catch (e1) {}
  try { var u = readTableV20_1_(TAB.URGENT, 4); if (u.ok) urgentRows = u.rows.map(function (r) {
    return { trainee: cleanNameV20_1_(r[3]) }; }); } catch (e2) {}

  var matrix = readTableV20_1_(TAB.SKILLS, 4);
  var signedBy = {}, applicableBy = {}, readyBy = {};
  if (matrix.ok && matrix.col['TRAINEE'] !== undefined) {
    matrix.rows.forEach(function (r) {
      var who = normalizeNameV20_1_(cleanNameV20_1_(r[matrix.col['TRAINEE']]));
      if (!who) return;
      applicableBy[who] = (applicableBy[who] || 0) + 1;
      var readiness = String(r[matrix.col['READINESS']] || '').trim();
      if (readiness === 'SIGNED OFF' || String(r[matrix.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF') {
        signedBy[who] = (signedBy[who] || 0) + 1;
      }
      if (readiness === 'READY FOR VALIDATION') readyBy[who] = (readyBy[who] || 0) + 1;
    });
  }

  var waitingBy = {};
  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok && q.col['TRAINEE'] !== undefined) {
    q.rows.forEach(function (r) {
      if (String(r[q.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
      var who = normalizeNameV20_1_(cleanNameV20_1_(r[q.col['TRAINEE']]));
      if (who) waitingBy[who] = (waitingBy[who] || 0) + 1;
    });
  }

  function countFor(list, norm) {
    var n = 0;
    list.forEach(function (x) { if (normalizeNameV20_1_(x.trainee) === norm) n++; });
    return n;
  }
  function lastEvalFor(norm) {
    var latest = null;
    evalRows.forEach(function (x) {
      if (normalizeNameV20_1_(x.trainee) !== norm) return;
      if (x.when && (!latest || x.when.getTime() > latest.getTime())) latest = x.when;
    });
    return latest;
  }

  var fileLinks = consoleFileLinksV20_3_(sh);   // keep any links already on the sheet

  var body = people.map(function (p) {
    var norm = p.norm;
    var last = lastEvalFor(norm);
    var days = last ? Math.floor((new Date() - last) / 86400000) : null;
    var weeks = p.phaseStart ? Math.max(0, Math.floor((new Date() - p.phaseStart) / (7 * 86400000))) : '';
    var waiting = waitingBy[norm] || 0;
    var ready = readyBy[norm] || 0;
    var concerns = countFor(urgentRows, norm);
    return [
      p.name,
      p.level || '',
      p.phase || '',
      weeks === '' ? '' : weeks,
      last ? (days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago') : 'never',
      countFor(evalRows, norm),
      (signedBy[norm] || 0) + ' of ' + (applicableBy[norm] || 0),
      waiting ? waiting + ' waiting' : (ready ? ready + ' nearly ready' : ''),
      concerns ? concerns : '',
      false,
      false,
      fileLinks[norm] || ''
    ];
  });

  // ---- write ----
  var width = CONSOLE_HEADERS_V20_3.length;
  ensureSheetCapacityV19_(sh, Math.max(body.length + CONSOLE_FIRST_ROW_V20_3 + 10, 60), width + 2);
  sh.getRange(1, 1, sh.getMaxRows(), width).clearContent().clearDataValidations();

  sh.getRange(1, 1).setValue('TRAINEES')
    .setFontSize(20).setFontWeight('bold').setFontColor('#1d1b18');
  sh.getRange(1, 3).setValue(people.length + ' active   ·   ' + closed.length +
    ' released   ·   updated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEE d MMM, h:mm a'))
    .setFontColor('#6f6859').setFontSize(10);

  sh.getRange(2, 1, 1, width).setValues([CONSOLE_HEADERS_V20_3])
    .setFontWeight('bold').setFontSize(11)
    .setBackground('#1d1b18').setFontColor('#f4f1ea')
    .setVerticalAlignment('middle').setWrap(true);

  if (body.length) {
    sh.getRange(CONSOLE_FIRST_ROW_V20_3, 1, body.length, width).setValues(body);
    sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.OPEN, body.length, 2)
      .insertCheckboxes();
  }

  applyConsoleLookV20_3_(sh, body.length);
  systemLog_('INFO', 'TRAINEE CONSOLE BUILT', people.length + ' active trainee(s)');
  return 'TRAINEES refreshed: ' + people.length + ' active, ' + closed.length + ' released.';
}

/** Existing file links, keyed by normalized name, so a rebuild never
 *  loses a document that was already generated. */
function consoleFileLinksV20_3_(sh) {
  var out = {};
  try {
    if (sh.getLastRow() < CONSOLE_FIRST_ROW_V20_3) return out;
    var n = sh.getLastRow() - CONSOLE_FIRST_ROW_V20_3 + 1;
    var names = sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.NAME, n, 1).getValues();
    var links = sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.FILE, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      var nm = normalizeNameV20_1_(cleanNameV20_1_(names[i][0]));
      if (nm && links[i][0]) out[nm] = links[i][0];
    }
  } catch (e) {}
  return out;
}

/** Readable by default: room for words, no squinting. */
function applyConsoleLookV20_3_(sh, rows) {
  var W = { 1: 210, 2: 110, 3: 120, 4: 110, 5: 130, 6: 100, 7: 140, 8: 150, 9: 90, 10: 90, 11: 90, 12: 260 };
  Object.keys(W).forEach(function (c) { try { sh.setColumnWidth(Number(c), W[c]); } catch (e) {} });
  try { sh.setFrozenRows(2); sh.setFrozenColumns(1); } catch (e) {}
  try { sh.setRowHeight(1, 40); sh.setRowHeight(2, 38); } catch (e) {}
  if (rows > 0) {
    var r = sh.getRange(CONSOLE_FIRST_ROW_V20_3, 1, rows, CONSOLE_HEADERS_V20_3.length);
    r.setVerticalAlignment('middle').setWrap(true).setFontSize(11);
    for (var i = 0; i < rows; i++) {
      try { sh.setRowHeight(CONSOLE_FIRST_ROW_V20_3 + i, 34); } catch (e) {}
    }
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('waiting')
        .setBackground('#fdf3d6').setFontColor('#7a5c00').setBold(true)
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.WAITING, rows, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground('#fbeeec').setFontColor('#a62a21').setBold(true)
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.CONCERNS, rows, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('never')
        .setBackground('#fbeeec').setFontColor('#a62a21')
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.LAST_EVAL, rows, 1)]).build()
    ]);
  }
  try { sh.getRange(1, 1, sh.getMaxRows(), 40).setFontFamily('Arial'); } catch (e) {}
}

/* ---------------------------------------------------------------- *
 *  2. The file
 * ---------------------------------------------------------------- */

/** Everything recorded about one trainee, from the first day to now, as
 *  a document. Narratives appear in full — this is the thing the
 *  spreadsheet cannot show you.
 *
 *  Read-only with respect to the record: it copies, it never changes. */
function buildTraineeFileV20_3(traineeName) {
  var name = cleanNameV20_1_(traineeName);
  if (!name) throw new Error('No trainee name given.');
  var norm = normalizeNameV20_1_(name);
  var resolved = resolveTraineeV20_1_(name);
  var rec = resolved.record;

  var doc = DocumentApp.create('SCEMS Training File — ' + name + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  var b = doc.getBody();
  b.setMarginTop(48).setMarginBottom(48).setMarginLeft(56).setMarginRight(56);

  function H1(t) { b.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING1); }
  function H2(t) { b.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING2); }
  function P(t) { return b.appendParagraph(String(t == null ? '' : t)); }
  function small(t) { P(t).setFontSize(9).setForegroundColor('#666666'); }
  function kv(k, v) { P(k + ':  ' + (v === '' || v == null ? '—' : v)); }
  function rule() { b.appendHorizontalRule(); }

  // ---- cover ----
  b.appendParagraph('SUMTER COUNTY EMS').setFontSize(10).setBold(true).setForegroundColor('#a8811a');
  b.appendParagraph('Field Training Record').setHeading(DocumentApp.ParagraphHeading.TITLE);
  b.appendParagraph(name).setFontSize(20).setBold(true);
  small('Generated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE d MMMM yyyy, h:mm a') +
        '  ·  ' + SCEMS_VERSION + '  ·  ' + String(CONFIG.POLICY_VERSION || ''));
  rule();

  H1('Who this is');
  if (rec) {
    kv('Certification level', rec.level);
    kv('Entry profile', rec.entryProfile);
    kv('Employee ID', rec.employeeId);
    kv('Assigned FTO', rec.fto);
    kv('Started', rec.startDate ? dateKeyV20_1_(rec.startDate) : '');
    kv('Current phase', rec.phase);
    kv('Phase started', rec.phaseStart ? dateKeyV20_1_(rec.phaseStart) : '');
    kv('Program status', rec.setStatus);
    if (rec.startDate) {
      kv('Time in program', Math.floor((new Date() - rec.startDate) / 86400000) + ' days');
    }
  } else {
    P('No master record found for this name. The evidence below is everything filed under it.');
  }

  // ---- shift evaluations, in full ----
  H1('Shift evaluations');
  var ev = readTableV20_1_(TAB.EVAL, 4);
  var evN = 0;
  if (ev.ok) {
    var evMine = ev.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[2])) === norm; });
    evMine.sort(function (a, b) {
      var da = parseDateSafeV20_1_(a[0]), db = parseDateSafeV20_1_(b[0]);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
    evN = evMine.length;
    if (!evN) P('None recorded.');
    evMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2((when ? dateKeyV20_1_(when) : 'undated') + '  ·  FTO ' + (cleanNameV20_1_(r[1]) || 'unnamed'));
      ev.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || i <= 2) return;
        var val = r[i];
        if (val === '' || val == null) return;
        P(head + ':  ' + String(val));      // full text, never truncated
      });
    });
  } else { P('The evaluation mirror is not present.'); }

  // ---- self-reflections ----
  H1('The trainee in their own words');
  var rf = readTableV20_1_(TAB.REFLECT, 4);
  var rfN = 0;
  if (rf.ok) {
    var rfMine = rf.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[1])) === norm; });
    rfN = rfMine.length;
    if (!rfN) P('None submitted.');
    rfMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2(when ? dateKeyV20_1_(when) : 'undated');
      rf.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || i <= 1) return;
        if (r[i] === '' || r[i] == null) return;
        P(head + ':  ' + String(r[i]));
      });
    });
  }

  // ---- skills ----
  H1('Skills — every logged repetition');
  var sk = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  var skN = 0, skAccepted = 0;
  if (sk.ok && sk.col['TRAINEE'] !== undefined) {
    var skMine = sk.rows.filter(function (r) {
      return normalizeNameV20_1_(cleanNameV20_1_(r[sk.col['TRAINEE']])) === norm; });
    skN = skMine.length;
    if (!skN) P('None recorded.');
    skMine.forEach(function (r) {
      var val = String(r[sk.col['VALIDATION RESULT']] || '');
      if (val === 'ACCEPTED') skAccepted++;
      var when = parseDateSafeV20_1_(r[sk.col['SHIFT DATE']]);
      var line = (when ? dateKeyV20_1_(when) : 'undated') + '  ·  ' +
        String(r[sk.col['SKILL']] || '') + '  ·  ' + String(r[sk.col['OUTCOME']] || '') +
        '  ·  FTO ' + String(r[sk.col['FTO']] || '') +
        (val === 'ACCEPTED' ? '' : '  ·  [' + val + ']');
      P(line);
      var note = String(r[sk.col['EVIDENCE NOTE']] || '').trim();
      if (note) P('       ' + note).setFontSize(10).setForegroundColor('#444444');
    });
  }

  // ---- decisions ----
  H1('Sign-off decisions');
  var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  var soN = 0;
  if (so.ok && so.col['TRAINEE'] !== undefined) {
    var soMine = so.rows.filter(function (r) {
      return normalizeNameV20_1_(cleanNameV20_1_(r[so.col['TRAINEE']])) === norm; });
    soN = soMine.length;
    if (!soN) P('None recorded.');
    soMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[so.col['DECISION DATE']]);
      P((when ? dateKeyV20_1_(when) : 'undated') + '  ·  ' + String(r[so.col['SKILL']] || '') +
        '  ·  ' + String(r[so.col['DECISION']] || ''));
      P('       by ' + String(r[so.col['DECIDED BY']] || '') + ' — ' +
        String(r[so.col['RATIONALE']] || '')).setFontSize(10).setForegroundColor('#444444');
    });
  }

  // ---- concerns ----
  H1('Urgent concerns');
  var ur = readTableV20_1_(TAB.URGENT, 4);
  var urN = 0;
  if (ur.ok) {
    var urMine = ur.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[3])) === norm; });
    urN = urMine.length;
    if (!urN) P('None filed.');
    urMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2(when ? dateKeyV20_1_(when) : 'undated');
      ur.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || r[i] === '' || r[i] == null) return;
        P(head + ':  ' + String(r[i]));
      });
    });
  }

  // ---- decisions raw / phase history ----
  H1('Phase and programme decisions');
  var dr = readTableV20_1_(TAB.DECISIONS, 4);
  var drN = 0;
  if (dr.ok) {
    var drMine = dr.rows.filter(function (r) {
      return r.some(function (c) { return normalizeNameV20_1_(cleanNameV20_1_(c)) === norm; }); });
    drN = drMine.length;
    if (!drN) P('None recorded.');
    drMine.forEach(function (r) {
      var parts = [];
      dr.headers.forEach(function (h, i) {
        if (String(h || '').trim() && r[i] !== '' && r[i] != null) parts.push(h + ': ' + r[i]);
      });
      P(parts.join('   ·   '));
    });
  }

  rule();
  H1('What this file contains');
  kv('Shift evaluations', evN);
  kv('Self-reflections', rfN);
  kv('Skill repetitions logged', skN + ' (' + skAccepted + ' accepted into the record)');
  kv('Sign-off decisions', soN);
  kv('Urgent concerns', urN);
  kv('Programme decisions', drN);
  small('Compiled by ' + (deciderIdentityV20_2_() || 'an unidentified session') +
        ' from the SCEMS Field Training record on ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMMM yyyy') +
        '. Source of truth is the tracker; this document is a copy made at that moment. ' +
        'Retention: ' + String(CONFIG.RETENTION_STATEMENT || 'per county policy') + '.');

  doc.saveAndClose();

  // file it next to the tracker
  try {
    var f = DriveApp.getFileById(doc.getId());
    var parents = DriveApp.getFileById(ss().getId()).getParents();
    if (parents.hasNext()) parents.next().addFile(f);
  } catch (e) {}

  var url = doc.getUrl();
  systemLog_('WARN', 'TRAINEE FILE BUILT', name + ' | ' + url);
  return { url: url, name: name, counts: { evals: evN, reflections: rfN, skills: skN,
           accepted: skAccepted, signoffs: soN, concerns: urN, decisions: drN } };
}

/* ---------------------------------------------------------------- *
 *  3. The checkboxes
 * ---------------------------------------------------------------- */

/** Handles a tick on TRAINEES. Called from onSheetEdit; returns true when
 *  it owned the edit, so the rest of the handler is skipped. */
function consoleEditV20_3_(e, sh) {
  if (sh.getName() !== TAB_CONSOLE_V20_3) return false;
  var row = e.range.getRow(), col = e.range.getColumn();
  if (row < CONSOLE_FIRST_ROW_V20_3) return false;
  if (col !== CONSOLE_COL_V20_3.OPEN && col !== CONSOLE_COL_V20_3.RELEASE) return false;
  if (e.range.getValue() !== true) return true;         // unticking does nothing

  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e0) {}
  var name = cleanNameV20_1_(sh.getRange(row, CONSOLE_COL_V20_3.NAME).getValue());
  e.range.setValue(false);                              // a checkbox is a button, not a state
  if (!name) return true;

  if (col === CONSOLE_COL_V20_3.OPEN) {
    try {
      var built = buildTraineeFileV20_3(name);
      sh.getRange(row, CONSOLE_COL_V20_3.FILE).setValue(built.url);
      if (ui) ui.alert('File ready — ' + name,
        'Everything on record from day one, in full.\n\n' +
        built.counts.evals + ' shift evaluation(s)\n' +
        built.counts.reflections + ' self-reflection(s)\n' +
        built.counts.skills + ' skill repetition(s), ' + built.counts.accepted + ' accepted\n' +
        built.counts.signoffs + ' sign-off decision(s)\n' +
        built.counts.concerns + ' urgent concern(s)\n\n' +
        'The link is in the last column. The document stays in Drive — open it any time.',
        ui.ButtonSet.OK);
    } catch (err) {
      if (ui) ui.alert('Could not build the file for ' + name + '.\n\n' + err);
      systemLog_('ERROR', 'TRAINEE FILE FAILED', name + ' | ' + err);
    }
    return true;
  }

  // ---- release ----
  if (!gateV20_2_('CLOSE TRAINEE')) return true;
  if (ui) {
    var waiting = String(sh.getRange(row, CONSOLE_COL_V20_3.WAITING).getValue() || '');
    var ok = ui.alert('Release ' + name + '?',
      'This closes their training record and builds their complete file.\n\n' +
      (waiting ? 'NOTE: ' + waiting + ' — releasing does not decide those.\n\n' : '') +
      'The file covers day one to today and stays in Drive for good.\n\nRelease?',
      ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return true;
  }
  var report = [];
  try { report.push(String(closeTraineeV20_1(name))); }
  catch (err2) { report.push('Close step failed: ' + err2); }
  try {
    var file = buildTraineeFileV20_3(name);
    sh.getRange(row, CONSOLE_COL_V20_3.FILE).setValue(file.url);
    report.push('File built: ' + file.url);
  } catch (err3) { report.push('File build failed: ' + err3); }

  systemLog_('WARN', 'TRAINEE RELEASED VIA CONSOLE', name + ' | ' + report.join(' | ').slice(0, 300));
  if (ui) ui.alert('Released — ' + name, report.join('\n\n').slice(0, 1400), ui.ButtonSet.OK);
  try { buildTraineeConsoleV20_3(); } catch (e4) {}
  return true;
}

/* ---------------------------------------------------------------- *
 *  4. Room to read
 * ---------------------------------------------------------------- */

/** Column widths by what the column HOLDS, not by position.
 *  Anything whose name suggests prose gets real width and wrapping;
 *  dates and counts stay narrow so the prose has somewhere to go. */
function readableWidthForV20_3_(header) {
  var h = String(header || '').toLowerCase();
  if (!h) return 100;
  if (/note|narrative|detail|comment|rationale|summary|reason|concern|what |why|situation|justif|strength|improve|focus|feedback|action|plan|evidence/.test(h)) return 460;
  if (/name|trainee|fto|skill|decided by|signed by|assigned/.test(h)) return 190;
  if (/date|timestamp|when|expiration/.test(h)) return 110;
  if (/id$|^id| id /.test(h)) return 150;
  if (/status|decision|outcome|level|phase|stage|context|domain|result|prompting|attestation/.test(h)) return 165;
  return 130;
}

/** Makes the record sheets readable: wide narrative columns, wrapping on,
 *  taller rows, frozen headers. Formatting only — no cell value changes. */
function makeSheetsReadableV20_3() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var targets = [TAB.MASTER, TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.SKILLS,
                 TAB.SKILL_VALIDATION, TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF,
                 TAB.CATALOG, TAB.FTO_ROSTER, TAB.DECISIONS];
  var done = [];
  targets.forEach(function (name) {
    var t = readTableV20_1_(name, 4);
    if (!t.ok || !t.headers.length) { done.push('  ' + name + ' : not present'); return; }
    var sh = t.sheet;
    try {
      t.headers.forEach(function (h, i) {
        if (!String(h || '').trim()) return;
        sh.setColumnWidth(i + 1, readableWidthForV20_3_(h));
      });
      sh.getRange(4, 1, 1, Math.max(t.headers.length, 1))
        .setWrap(true).setVerticalAlignment('middle').setFontWeight('bold');
      var lastRow = Math.max(sh.getLastRow(), 5);
      sh.getRange(5, 1, lastRow - 4, Math.max(t.headers.length, 1))
        .setWrap(true).setVerticalAlignment('top');
      sh.setFrozenRows(4);
      sh.setFrozenColumns(name === TAB.SKILLS || name === TAB.SKILL_VALIDATION ? 2 : 1);
      try { sh.setRowHeights(5, Math.max(lastRow - 4, 1), 46); } catch (e2) {}
      try { sh.setRowHeight(4, 40); } catch (e3) {}
      done.push('  ' + name + ' : ' + t.headers.filter(String).length + ' column(s) sized');
    } catch (e) {
      done.push('  ' + name + ' : ' + e);
    }
  });
  var msg = 'READABLE LAYOUT APPLIED\n\n' + done.join('\n') +
    '\n\nNarrative columns are now wide and wrapping; dates and counts stay narrow.\n' +
    'Header rows are frozen so they stay put when you scroll.\n' +
    'Nothing was moved, renamed or deleted — this is formatting only.';
  systemLog_('INFO', 'READABLE LAYOUT APPLIED', done.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Tab order and visibility  (v20.2)
 * ---------------------------------------------------------------- */

/** Left-to-right order: the things you use, then the things you consult,
 *  then the machinery. Anything not listed keeps its place at the end. */
function tabOrderV20_2_() {
  return [TAB_CONSOLE_V20_3, 'HOME', TAB.CONTROL, TAB.MASTER, TAB.SKILLS, TAB.SKILL_VALIDATION,
          TAB.QUEUE, TAB.AUDIT, TAB.FTO_ROSTER,
          TAB.WEEKLY, TAB.DASH, TAB.TRAINEE_SKILLS, TAB.CATALOG,
          TAB.FTO_VIEW, TAB.TRAINEE_VIEW, TAB.MD_VIEW,
          TAB.ANALYTICS, TAB.ENGINE,
          TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.DECISIONS, TAB.ARCHIVE,
          TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF, TAB.LOG,
          TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS];
}

/** The tabs a person actually opens day to day.
 *
 *  Doctrine (v20.7): this workbook is a desk, not a warehouse aisle.
 *  Trainees → queue → roster. Role views (08/09/11) belong in the portal.
 *  Raw form tabs, ledgers, engines, and Form Responses are machinery —
 *  still live, just not in your face. organizeTabsV20_2 hides the rest.
 *  showAllTabsV20_2 puts everything back when you are repairing the system. */
function dailyTabsV20_2_() {
  return [TAB_CONSOLE_V20_3, 'HOME', TAB.CONTROL, TAB.MASTER, TAB.SKILLS,
          TAB.SKILL_VALIDATION, TAB.QUEUE, TAB.AUDIT, TAB.FTO_ROSTER];
}

/** Puts the tabs in a sensible order and hides the machinery.
 *
 *  Hiding is tidiness, not security — a hidden tab still receives data and
 *  is one menu click from visible. Nothing is deleted or renamed.
 *  showAllTabsV20_2() puts everything back. */
function organizeTabsV20_2() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var S = ss();
  var order = tabOrderV20_2_();
  var daily = dailyTabsV20_2_();

  var moved = 0, pos = 1;
  order.forEach(function (name) {
    var sh = S.getSheetByName(name);
    if (!sh) return;
    try {
      if (sh.isSheetHidden()) sh.showSheet();   // cannot move a hidden sheet
      S.setActiveSheet(sh);
      S.moveActiveSheet(pos);
      pos++; moved++;
    } catch (e) {}
  });

  var visible = [], hidden = [];
  S.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (daily.indexOf(name) >= 0) {
      try { sh.showSheet(); visible.push(name); } catch (e) {}
    } else {
      try { sh.hideSheet(); hidden.push(name); } catch (e) { visible.push(name); }
    }
  });

  var desk = S.getSheetByName(TAB_CONSOLE_V20_3) || S.getSheetByName('HOME') ||
             S.getSheetByName(TAB.CONTROL);
  if (desk) { try { S.setActiveSheet(desk); } catch (e) {} }

  var msg = 'YOUR DESK IS READY\n\n' +
    'You should now see about ' + visible.length + ' tabs — the ones you use.\n' +
    '  ' + visible.join('\n  ') +
    '\n\nHidden (still live, still receiving data) : ' + hidden.length +
    '\n  including Form Responses, ledgers, engines, and old role views.\n' +
    '\nNothing was deleted. SCEMS ▸ More ▸ Show every tab puts them all back.\n' +
    'Day to day: open TRAINEES, then Work my queue.';
  systemLog_('INFO', 'TABS ORGANIZED', visible.length + ' visible, ' + hidden.length + ' hidden');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Unhides everything, for when you are working on the system itself. */
function showAllTabsV20_2() {
  var S = ss(), n = 0;
  S.getSheets().forEach(function (sh) {
    try { if (sh.isSheetHidden()) { sh.showSheet(); n++; } } catch (e) {}
  });
  var msg = 'Every tab is visible again (' + n + ' unhidden).\n\n' +
    'SCEMS ▸ More ▸ Hide the clutter puts the machinery away.';
  systemLog_('INFO', 'ALL TABS SHOWN', n + ' unhidden');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function makeQueueReadableV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) {
    try { SpreadsheetApp.getUi().alert('Queue tab not found; nothing changed.'); } catch (e0) {}
    return 'Queue tab not found; nothing changed.';
  }
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1;
  var width = t.headers.length;
  var lastRow = Math.max(sh.getLastRow(), t.firstDataRow);
  var nData = Math.max(lastRow - t.firstDataRow + 1, 1);

  function colLetter_(n) { // 1-based index -> A1 letter
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // ---- freeze panes: headers on top, trainee names on the left
  sh.setFrozenRows(headerRow);
  if (t.col['TRAINEE'] !== undefined) sh.setFrozenColumns(t.col['TRAINEE'] + 1);

  // ---- header row look
  sh.getRange(headerRow, 1, 1, width)
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#37474F')
    .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // ---- column widths (only the columns that actually exist)
  var widths = { 'TRAINEE': 160, 'LEVEL': 70, 'SKILL': 230, 'SKILL ID': 105,
                 'DECISION': 175, 'DECIDED BY': 150, 'DECISION DATE': 105,
                 'RECORD STATUS': 130, 'RATIONALE': 260, 'REQUEST ID': 95 };
  Object.keys(widths).forEach(function (h) {
    if (t.col[h] !== undefined) sh.setColumnWidth(t.col[h] + 1, widths[h]);
  });
  var recCol = (t.col['RECORD'] !== undefined) ? t.col['RECORD'] + 1
             : (typeof QUEUE_RECORD_COL_V20_1 !== 'undefined' ? QUEUE_RECORD_COL_V20_1 : 0);
  if (recCol) sh.setColumnWidth(recCol, 70);

  // ---- data area: one line per row, calm and legible
  var data = sh.getRange(t.firstDataRow, 1, nData, width);
  data.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
      .setVerticalAlignment('middle');
  sh.setRowHeights(t.firstDataRow, nData, 24);
  if (t.col['DECISION DATE'] !== undefined) {
    sh.getRange(t.firstDataRow, t.col['DECISION DATE'] + 1, nData, 1).setNumberFormat('m/d/yyyy');
  }
  if (t.col['REQUEST ID'] !== undefined) {
    sh.getRange(t.firstDataRow, t.col['REQUEST ID'] + 1, nData, 1)
      .setFontColor('#9E9E9E').setFontSize(8);
  }

  // ---- color by status (first matching rule wins)
  if (t.col['RECORD STATUS'] !== undefined) {
    var S = colLetter_(t.col['RECORD STATUS'] + 1);
    var R = t.firstDataRow;
    function rule_(formula, build) {
      var b = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula).setRanges([data]);
      build(b);
      return b.build();
    }
    sh.setConditionalFormatRules([
      rule_('=$' + S + R + '="OPEN"',      function (b) { b.setBackground('#FFF9C4').setBold(true); }),
      rule_('=$' + S + R + '="RETURNED"',  function (b) { b.setBackground('#FFE0B2'); }),
      rule_('=$' + S + R + '="REVOKED"',   function (b) { b.setBackground('#FFCDD2'); }),
      rule_('=LEFT($' + S + R + ',9)="CANCELLED"', function (b) { b.setFontColor('#9E9E9E').setItalic(true); }),
      rule_('=$' + S + R + '="RECORDED"',  function (b) { b.setFontColor('#9E9E9E'); })
    ]);
  }

  // ---- filter funnels on the header row (recreated fresh each run)
  try { var oldF = sh.getFilter(); if (oldF) oldF.remove(); } catch (e1) {}
  try { sh.getRange(headerRow, 1, lastRow - headerRow + 1, width).createFilter(); } catch (e2) {}

  var msg = 'Queue tab reformatted. Rows, order, and every value untouched.\n\n' +
    'Yellow = OPEN (needs you)\nOrange = RETURNED (waiting on the FTO)\n' +
    'Red = REVOKED\nGrey = finished business\n\n' +
    'Tip: click the funnel on RECORD STATUS and tick only OPEN to see just live work.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e3) {}
  systemLog_('INFO', 'QUEUE REFORMATTED', 'makeQueueReadableV20_1 : formatting only, no data changes');
  return msg;
}

/** Run once. Makes tab 20 explain itself and stop blocking honest dates. */
function fixQueueEntryUxV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) {
    try { SpreadsheetApp.getUi().alert('Queue tab not found; nothing changed.'); } catch (e0) {}
    return 'Queue tab not found; nothing changed.';
  }
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1; // 4
  var nRows = Math.max(sh.getMaxRows() - t.firstDataRow + 1, 1);

  // DECISION DATE (col 9): any real date is welcome — especially past ones.
  sh.getRange(t.firstDataRow, 9, nRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate().setAllowInvalid(true)
      .setHelpText('The date it actually happened — past dates are fine. Example: 8/12/2026')
      .build())
    .setNumberFormat('m/d/yyyy');

  // RATIONALE (col 11): dropdown of standard reasons, free typing still allowed.
  var reasons = [
    'Evidence thresholds met, FTO recommendation accepted',
    'Directly observed and verified by the FTO Program Director',
    'Competency verified by scenario examination',
    'Verbal verification accepted; documentation to follow',
    'Additional documented evidence required before sign-off',
    'Sign-off revoked pending remediation'
  ];
  sh.getRange(t.firstDataRow, 11, nRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(reasons, true).setAllowInvalid(true)
      .setHelpText('Pick a standard reason from the arrow, or type your own.')
      .build());

  // Hover notes: whose column is whose.
  var notes = {
    1:  'READY DATE — written by the system when the skill crossed its threshold. Never edit.',
    2:  'TRAINEE — written by the system. Never edit.',
    3:  'SKILL ID — written by the system. Never edit.',
    4:  'DOMAIN — written by the system. Never edit.',
    5:  'SKILL — written by the system. Never edit.',
    6:  'EVIDENCE SUMMARY — written by the system: what the forms show. Read it, never edit it.',
    7:  'DECISION — YOURS. Pick from the dropdown.',
    8:  'DECIDED BY — stamped for you when you pick a decision. Type over it if needed.',
    9:  'DECISION DATE — stamped as today when you pick a decision. Type over it with the real date; past dates are fine.',
    10: 'EXPIRATION — YOURS, optional. Only for time-limited sign-offs.',
    11: 'RATIONALE — YOURS. Pick a standard reason from the arrow or type your own.',
    12: 'RECORD STATUS — written by the system. Never edit.',
    13: 'LAST EVIDENCE DATE — written by the system. Never edit.',
    14: 'REVIEW — written by the system: why an item deserves a second look. Never edit.',
    15: 'REQUEST ID — written by the system: the permanent ID. Never edit.',
    16: 'RECORD — YOURS. Tick it to make the decision official.'
  };
  Object.keys(notes).forEach(function (c) {
    try { sh.getRange(headerRow, Number(c)).setNote(notes[c]); } catch (eN) {}
  });

  // Header colors: amber = yours, grey = the machine's.
  var yours = [7, 8, 9, 10, 11, 16];
  var machine = [1, 2, 3, 4, 5, 6, 12, 13, 14, 15];
  yours.forEach(function (c) {
    try { sh.getRange(headerRow, c).setBackground('#B7791F').setFontColor('#FFFFFF'); } catch (eY) {}
  });
  machine.forEach(function (c) {
    try { sh.getRange(headerRow, c).setBackground('#546E7A').setFontColor('#ECEFF1'); } catch (eM) {}
  });

  var msg = 'Tab 20 entry fixed.\n\n' +
    '- DECISION DATE now accepts any real date — past dates welcome\n' +
    '- RATIONALE has a dropdown of standard reasons (typing still allowed)\n' +
    '- Amber headers = your columns. Grey headers = the machine\'s — never edit those\n' +
    '- Hover any header for what it is\n' +
    '- Clearing a decision no longer wipes your name and date';
  systemLog_('INFO', 'QUEUE ENTRY UX FIXED', 'date validation, rationale dropdown, header notes/colors');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e1) {}
  return msg;
}

/** (internal) apply the live-work filter to tab 20. */
function queueLiveFilterApplyV20_1_() {
  var t = queueTableV20_1_();
  if (!t.ok || t.col['RECORD STATUS'] === undefined) return 0;
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1;
  var width = t.headers.length;
  var lastRow = Math.max(sh.getLastRow(), t.firstDataRow);
  var f = sh.getFilter();
  if (!f) {
    try { f = sh.getRange(headerRow, 1, lastRow - headerRow + 1, width).createFilter(); }
    catch (e) { return 0; }
  }
  var sCol = t.col['RECORD STATUS'] + 1;
  var seen = {};
  t.rows.forEach(function (r) {
    var s = String(r[t.col['RECORD STATUS']] || '').trim();
    if (s) seen[s] = true;
  });
  var hide = Object.keys(seen).filter(function (s) {
    return s !== 'OPEN' && s !== 'RETURNED';
  });
  if (hide.length) {
    f.setColumnFilterCriteria(sCol,
      SpreadsheetApp.newFilterCriteria().setHiddenValues(hide).build());
  } else {
    f.setColumnFilterCriteria(sCol, null);
  }
  return hide.length;
}

/** Turn ON live-work-only view (persists; every flow re-applies it). */
function queueShowLiveV20_1() {
  PropertiesService.getScriptProperties().setProperty('QUEUE_LIVE_VIEW', '1');
  queueLiveFilterApplyV20_1_();
  var msg = 'Tab 20 now shows LIVE WORK ONLY — OPEN (needs you) and RETURNED (waiting on the FTO).\n\n' +
    'Finished rows are hidden from view, never deleted: the ledger keeps every row and the ' +
    'reconciler still checks all of it. "Tab 20 : show full history" on the Admin menu brings it all back.';
  systemLog_('INFO', 'QUEUE LIVE VIEW ON', 'finished rows hidden from view; ledger untouched');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Turn OFF the live-work view: full history visible again. */
function queueShowAllV20_1() {
  PropertiesService.getScriptProperties().setProperty('QUEUE_LIVE_VIEW', '0');
  var t = queueTableV20_1_();
  if (t.ok && t.col['RECORD STATUS'] !== undefined) {
    var f = t.sheet.getFilter();
    if (f) { try { f.setColumnFilterCriteria(t.col['RECORD STATUS'] + 1, null); } catch (e) {} }
  }
  var msg = 'Tab 20 shows the full history again — every row, finished and live.';
  systemLog_('INFO', 'QUEUE LIVE VIEW OFF', 'full history visible');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e2) {}
  return msg;
}

/** READ-ONLY: every burning flag explained with its data. */
function explainFlagsV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  var heads = sh.getRange(4, 2, 1, 6).getDisplayValues()[0];
  var names = sh.getRange(5, 1, 40, 1).getDisplayValues();
  var vals = sh.getRange(5, 2, 40, 6).getDisplayValues();
  var fmls = sh.getRange(5, 2, 40, 6).getFormulas();

  var master = {};
  masterTraineeRowsV20_1_().forEach(function (t) { master[t.norm] = t; });

  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  var engRows = {};
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var n = normalizeNameV20_1_(String(r[0] || ''));
      if (n) engRows[n] = r;
    });
  }

  var ev = readTableV20_1_(TAB.EVAL, 4);

  var L = ['FLAG EXPLAINER — READ ONLY', ''];
  var lit = 0;
  for (var i = 0; i < 40; i++) {
    var name = String(names[i][0] || '').trim();
    if (!name) continue;
    for (var c = 0; c < 6; c++) {
      if (String(vals[i][c]).trim() !== 'FLAG') continue;
      lit++;
      var norm = normalizeNameV20_1_(name);
      L.push('■ ' + name + ' — ' + heads[c] + '   (matrix cell ' + String.fromCharCode(66 + c) + (5 + i) + ')');
      var rec = master[norm];
      if (rec) L.push('   tab 01 says: phase [' + (rec.phase || '') + '], level [' + (rec.level || '') + '], FTO [' + (rec.fto || '') + ']');
      var er = engRows[norm];
      if (er) {
        L.push('   engine row: evals ' + (er[6] || 0) + ' | days since last ' + (er[8] === '' ? '-' : er[8]) +
               ' | day in phase ' + (er[20] || 0) + ' | engine phase/status [' + String(er[4] || '') + '] [' + String(er[17] || '') + ']');
      }
      if (ev.ok) {
        var mine = [];
        ev.rows.forEach(function (r2, k2) {
          if (normalizeNameV20_1_(String(r2[2] || '')) !== norm) return;
          var bits = [];
          ev.headers.forEach(function (h, hi) {
            var hv = String(r2[hi] == null ? '' : r2[hi]).trim();
            if (!hv) return;
            var hl = String(h || '').toLowerCase();
            if (hl.indexOf('score') >= 0 || hl.indexOf('narrat') >= 0 || hl.indexOf('situation') >= 0 ||
                hl.indexOf('strength') >= 0 || hl.indexOf('improve') >= 0 || hl.indexOf('assessment') >= 0 ||
                hl.indexOf('treatment') >= 0 || hl.indexOf('communication') >= 0 || hl.indexOf('documentation') >= 0 ||
                hl.indexOf('leadership') >= 0 || hl.indexOf('professionalism') >= 0) {
              bits.push(h + '=' + hv.slice(0, 30));
            }
          });
          mine.push('      02 row ' + (ev.firstDataRow + k2) + ' | ' +
            String(r2[0]).slice(0, 16) + ' | by ' + String(r2[1] || '') +
            (bits.length ? ' | ' + bits.join(' · ') : ''));
        });
        if (c === 2 || c === 3) { // narrative / silent flags: show the evals
          L.push('   their eval rows on 02:');
          if (mine.length) mine.slice(-4).forEach(function (x) { L.push(x); });
          else L.push('      (none)');
        }
      }
      L.push('   formula: ' + String(fmls[i][c]).slice(0, 220));
      L.push('');
    }
  }
  if (!lit) L.push('No flags burning. Tab 13 is clear.');
  else L.push(lit + ' flag(s) burning. Fix the data the formula reads, or SCEMS → Work audit flags (amber = owned, still visible).');
  var msg = L.join('\n');
  Logger.log(msg);
  try {
    SpreadsheetApp.getActive().toast(
      lit
        ? (lit + ' FLAG(s). Clear = fix source data. Own = SCEMS → Work audit flags.')
        : 'AUDIT is clean — no burning flags.',
      'FLAGS', 8
    );
  } catch (eToast) {}
  return msg;
}

/** Run once: logged flags turn AMBER, unlogged stay RED.
 *  Pass true to skip the UI alert (used by redoAuditTabV20_1). */
function ackFlagStyleV20_1(optSilent) {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  // find the review log (same scan the redo used)
  var scanN = Math.max(sh.getLastRow(), 60);
  var scan = sh.getRange(1, 1, scanN, 2).getValues();
  var logRow = 0;
  for (var i = 44; i < scan.length; i++) {
    if (String(scan[i][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[i][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = i + 1; break; }
  }
  if (!logRow) return 'FLAG REVIEW LOG not found — run redoAuditTabV20_1 first.';
  var first = logRow + 2, last = logRow + 21;
  var matrix = sh.getRange(5, 2, 40, 6);
  var amberFormula = '=AND(B5="FLAG",COUNTIFS($B$' + first + ':$B$' + last +
    ',$A5,$C$' + first + ':$C$' + last + ',B$4)>0)';
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(amberFormula)
      .setBackground('#B7791F').setFontColor('#FFFFFF').setBold(true)
      .setRanges([matrix]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('FLAG').setBackground('#C62828').setFontColor('#FFFFFF').setBold(true)
      .setRanges([matrix]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenCellNotEmpty().setFontColor('#9E9E9E')
      .setRanges([matrix]).build()
  ]);
  var msg = 'Flag colors upgraded.\n\nRED = nobody owns it yet\n' +
    'AMBER = FLAG REVIEW LOG (rows ' + first + '-' + last + ') has the same trainee + flag type — still true, visibly handled\n' +
    'GONE = underlying data fixed\n\n' +
    'Turn red → amber: SCEMS → Work audit flags (or add a matching log row).';
  systemLog_('INFO', 'FLAG ACK STYLE APPLIED', 'red=unlogged, amber=logged, review log rows ' + first + '-' + last);
  Logger.log(msg);
  if (!optSilent) {
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  }
  return msg;
}

function fixAllFlagsNowV20_1() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e0) {}
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!au) return 'Tab 13 not found.';
  var R = [];

  if (ui) {
    var ok = ui.alert('Fix all current flags',
      'This will:\n' +
      '1. Acknowledge every burning PHASE MISMATCH (built-in J/K mechanism)\n' +
      '2. Review-log every NO NARRATIVE eval so it is visible and owned\n' +
      '3. Log SILENT RECORD cases to the review log — amber, not erased\n' +
      '4. Apply amber/red colors and refresh HOME\n\n' +
      'It does NOT edit tab 02. An FTO\'s submitted evaluation is their ' +
      'statement; only they can change it.\n\nProceed?', ui.ButtonSet.OK_CANCEL);
    if (ok !== ui.Button.OK) return 'Cancelled. Nothing changed.';
  }

  var heads = au.getRange(4, 2, 1, 6).getDisplayValues()[0];
  var names = au.getRange(5, 1, 40, 1).getDisplayValues();
  var flags = au.getRange(5, 2, 40, 6).getDisplayValues();

  // ---- 1. acknowledge phase mismatches (column G = index 5) ----
  var acked = 0;
  for (var i = 0; i < 40; i++) {
    if (String(flags[i][5]).trim() !== 'FLAG') continue;
    var nm = String(names[i][0] || '').trim();
    if (!nm) continue;
    au.getRange(5 + i, 11).setValue(nm);          // K : name
    au.getRange(5 + i, 10).setValue(new Date());   // J : acknowledged through today
    acked++;
    R.push('PHASE MISMATCH acknowledged : ' + nm + ' (row ' + (5 + i) + ') — re-lights only on a new wrong-phase eval');
  }
  if (!acked) R.push('PHASE MISMATCH : none burning.');

  // ---- 2/3. narrative dodges on 02 ----
  //
  // SPEC-v20.2.md #4: this block used to WRITE to tab 02 — it flipped the
  // FTO's own "Scored 1 or 5" answer from No to Yes, then composed a
  // justification out of their Strength/Improve text and filed it as though
  // they had written it. An evaluation is the evaluator's statement about a
  // person. Correcting it on their behalf, in their name, is the single worst
  // thing this codebase did. It now detects and review-logs; it writes nothing.
  var ev = readTableV20_1_(TAB.EVAL, 4);
  var adverse = [];
  if (ev.ok && ev.col['Scored 1 or 5'] !== undefined) {
    var domains = ['Assessment', 'Treatment', 'Communication', 'Documentation', 'Scene Leadership', 'Professionalism'];
    ev.rows.forEach(function (r, k) {
      if (String(r[ev.col['Scored 1 or 5']] || '').trim() !== 'No') return;
      var hasOne = false, hasFive = false;
      domains.forEach(function (d) {
        if (ev.col[d] === undefined) return;
        var v = Number(r[ev.col[d]]);
        if (v === 1) hasOne = true;
        if (v === 5) hasFive = true;
      });
      if (!hasOne && !hasFive) return; // honest "No"
      var row = ev.firstDataRow + k;
      var who = String(r[2] || '').trim();
      var fto = String(r[1] || '').trim();
      adverse.push({ trainee: who, fto: fto, row: row,
                     kind: hasOne ? 'score of 1' : 'praise-only 5' });
      R.push('NO NARRATIVE (' + (hasOne ? 'score of 1' : 'praise-only 5') + ') : ' + who +
        ' by ' + fto + ' (02 row ' + row + ') — review-logged; the FTO must supply the ' +
        'justification themselves. Nothing was written to tab 02.');
    });
  } else {
    R.push('Eval mirror or "Scored 1 or 5" column not found — narrative fixes skipped.');
  }

  // ---- 4. review-log entries (adverse cases + silent records) ----
  var scanN = Math.max(au.getLastRow(), 60);
  var scan = au.getRange(1, 1, scanN, 2).getValues();
  var logRow = 0;
  for (var s = 44; s < scan.length; s++) {
    if (String(scan[s][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[s][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = s + 1; break; }
  }
  if (logRow) {
    var first = logRow + 2;
    var existing = au.getRange(first, 1, 20, 6).getValues();
    var used = {}, nextFree = -1;
    existing.forEach(function (r3, i3) {
      var t3 = String(r3[1] || '').trim(), f3 = String(r3[2] || '').trim();
      if (t3) used[normalizeNameV20_1_(t3) + '|' + f3] = true;
      else if (nextFree < 0) nextFree = first + i3;
    });
    function logIt(trainee, flagType, action, status) {
      if (used[normalizeNameV20_1_(trainee) + '|' + flagType]) { R.push('review log already holds ' + trainee + ' / ' + flagType); return; }
      if (nextFree < 0) { R.push('review log full — add rows'); return; }
      au.getRange(nextFree, 1, 1, 6).setValues([[new Date(), trainee, flagType,
        deciderIdentityV20_2_() || '(unidentified session)', action, status]]);
      used[normalizeNameV20_1_(trainee) + '|' + flagType] = true;
      nextFree++;
      R.push('review-logged : ' + trainee + ' / ' + flagType + ' → amber');
    }
    adverse.forEach(function (a) {
      logIt(a.trainee, 'NO NARRATIVE',
        'A ' + a.kind + ' by ' + a.fto + ' (02 row ' + a.row + ') was recorded without a ' +
        'written justification — requested from the FTO', 'Under review');
    });
    for (var i2 = 0; i2 < 40; i2++) {
      if (String(flags[i2][3]).trim() !== 'FLAG') continue; // col E = SILENT RECORD (index 3)
      var nm2 = String(names[i2][0] || '').trim();
      if (nm2) logIt(nm2, 'SILENT RECORD', 'Self-reflection required (remediation) — requested from trainee', 'Action taken — awaiting data');
    }
  } else {
    R.push('FLAG REVIEW LOG not found — run redoAuditTabV20_1 first.');
  }

  // ---- 5. colors + refresh + after-state ----
  try { R.push(String(ackFlagStyleV20_1())); } catch (e4) {}
  try { refreshHomeNowV20_1(); } catch (e5) {}
  SpreadsheetApp.flush();
  var after = au.getRange(5, 2, 40, 6).getDisplayValues();
  var still = [];
  for (var i4 = 0; i4 < 40; i4++) {
    for (var c4 = 0; c4 < 6; c4++) {
      if (String(after[i4][c4]).trim() === 'FLAG') {
        still.push(String(names[i4][0] || '').trim() + ' / ' + heads[c4]);
      }
    }
  }
  var msg = 'FLAG FIX COMPLETE\n\n' + R.join('\n') +
    '\n\nStill burning (red or amber): ' + (still.length ? still.join(' ; ') : 'NONE') +
    '\nAmber = logged and being handled. These go out when the FTO\'s words / the reflection arrive.';
  systemLog_('INFO', 'FLAGS FIXED',
    acked + ' phase acks, ' + adverse.length + ' narrative gap(s) review-logged, 0 writes to tab 02');
  Logger.log(msg);
  try { if (ui) ui.alert(msg.slice(0, 1400)); } catch (e6) {}
  return msg;
}

function simplifyFlagsV20_1() {
  // SPEC-v20.2.md #4 — this rewrote the audit tab's detection formulas so they
  // would return "ACK" for any flag it had just logged under the director's
  // name, then hid the tab. A detector that answers to acknowledgements it
  // wrote itself is not a detector. redoAuditTabV20_1 prints "Nothing here is
  // dismissed by hand" onto the same tab; this dismissed all of it by hand.
  var m = 'RETIRED in v20.2. Flags are no longer silenced by rewriting the ' +
          'formulas that raise them.\n\n' +
          'Use SCEMS → Work audit flags (WORK_AUDIT_FLAGS / acceptFlagV20_2). ' +
          'It records one flag, one named human, one typed reason and a ' +
          'review-by date. The FLAG stays visible; the detection formula is ' +
          'untouched; acceptance expires instead of lasting forever.\n\n' +
          'If a previous run already wrapped the formulas, ' +
          'unwrapAuditFormulasV20_1() reverses it.';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'simplifyFlagsV20_1');
  try { SpreadsheetApp.getUi().alert(m); } catch (e) {}
  Logger.log(m); return m;
}

/** Reversal: strips the ACK wrapper, restoring the original formulas. */
function unwrapAuditFormulasV20_1() {
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!au) return 'Tab 13 not found.';
  var fmls = au.getRange(5, 2, 40, 6).getFormulas();
  var restored = 0;
  for (var r = 0; r < 40; r++) {
    for (var c = 0; c < 6; c++) {
      var f = fmls[r][c];
      if (!f || f.indexOf('"ACK"') < 0) continue;
      var m = f.match(/^=IF\(COUNTIFS\([^)]*\)>0,"ACK",([\s\S]*)\)$/);
      if (!m) continue;
      au.getRange(5 + r, 2 + c).setFormula('=' + m[1]);
      restored++;
    }
  }
  var msg = restored + ' formula(s) restored to their original form.';
  systemLog_('INFO', 'AUDIT FORMULAS UNWRAPPED', msg);
  Logger.log(msg);
  return msg;
}


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 80_migration
 *
 * One-time migrations between versions of this system.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   The non-destructive migration: read-only preview, explicit apply,
 *   verification, and rollback helpers.
 *   EVERYTHING THE APPLY STEP DOES IS ADDITIVE
 *   - Creates the four v20.1 system sheets (90–93) if absent.
 *   - Appends missing provenance/ID columns to the RIGHT of existing
 *   headers on tabs 19, 20, 21, and EMAIL/EMPLOYEE ID on tab 22.
 *   - Backfills queue REQUEST IDs and arms the RECORD checkbox column.
 *   - Replaces the six IFERROR(…,0) domain-average formulas on ANALYTICS
 *   with recomputed values — after archiving the original formula text
 *   into the migration record so rollback is a paste-back.
 *   - Hardens form identity settings and destinations IN PLACE.
 *   It never deletes, clears, renames, or rewrites an existing record.
 */

var MIGRATION_MARKER_V20_1 = 'CREATED BY SCEMS v20.1 MIGRATION';

function migrationPlanV20_1_() {
  var plan = { newSheets: [], newColumns: [], backfills: [], formulaSwaps: [],
               formHardening: [], other: [] };

  [[TAB.REGISTRY, REGISTRY_HEADERS_V20_1], [TAB.LEDGER, LEDGER_HEADERS_V20_1],
   [TAB.ASSIGNMENTS, ASSIGNMENT_HEADERS_V20_1], [TAB.ACCESS, ACCESS_HEADERS_V20_1]]
  .forEach(function (pair) {
    if (!getSheetOrNullV20_1_(pair[0])) {
      plan.newSheets.push({ name: pair[0], headers: pair[1] });
    }
  });

  function columnDelta(tab, extras) {
    var t = readTableV20_1_(tab, 4);
    if (!t.ok) return;
    extras.forEach(function (h) {
      if (t.col[h.toUpperCase()] === undefined) {
        plan.newColumns.push({ tab: tab, header: h });
      }
    });
  }
  columnDelta(TAB.SKILL_EVIDENCE, SKILL_EVIDENCE_V20_1_EXTRA);
  columnDelta(TAB.SKILL_SIGNOFF, SKILL_SIGNOFF_V20_1_EXTRA);
  columnDelta(TAB.SKILL_VALIDATION, SKILL_QUEUE_V20_1_EXTRA);
  columnDelta(TAB.FTO_ROSTER, ['EMAIL', 'EMPLOYEE ID']);

  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok) {
    var noId = 0;
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      if (q.col['REQUEST ID'] === undefined || !String(r[q.col['REQUEST ID']] || '').trim()) noId++;
    });
    if (noId) plan.backfills.push(noId + ' queue row(s) receive a REQUEST ID');
  }

  var an = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (an) {
    // the whole chart-data block becomes recomputed values; archive every
    // formula in it so rollback is a paste-back
    var block = an.getRange('N1:O29').getFormulas();
    for (var ri = 0; ri < block.length; ri++) {
      for (var ci = 0; ci < block[ri].length; ci++) {
        if (block[ri][ci]) {
          plan.formulaSwaps.push({
            cell: (ci === 0 ? 'N' : 'O') + (ri + 1), before: block[ri][ci] });
        }
      }
    }
  }

  plan.formHardening.push('Handover form: verified email collection + destination (in place)');
  plan.formHardening.push('Level forms ×3: verified email collection + destination (in place)');
  plan.other.push('Person registry rows built from the identity preview (held rows excluded)');
  plan.other.push('README EMAIL column (rows 5–8) mapped into the registry for FTO/leadership allowlisting');
  return plan;
}

/** READ-ONLY. The exact proposed data/schema changes, plus the identity
 *  and stranded-decision previews. Makes no changes of any kind. */
function previewMigrationV20_1() {
  var plan = migrationPlanV20_1_();
  var L = ['MIGRATION PREVIEW ' + SCEMS_VERSION + ' — READ ONLY. Nothing was written.', ''];
  L.push('NEW SHEETS (' + plan.newSheets.length + '):');
  plan.newSheets.forEach(function (s) { L.push('   ' + s.name + '  [' + s.headers.length + ' columns, hidden]'); });
  if (!plan.newSheets.length) L.push('   none (already present)');
  L.push('');
  L.push('NEW COLUMNS appended to the right of existing headers (' + plan.newColumns.length + '):');
  plan.newColumns.forEach(function (c) { L.push('   ' + c.tab + ' ← ' + c.header); });
  if (!plan.newColumns.length) L.push('   none');
  L.push('');
  L.push('BACKFILLS:');
  plan.backfills.forEach(function (b) { L.push('   ' + b); });
  if (!plan.backfills.length) L.push('   none');
  L.push('');
  L.push('ANALYTICS FORMULA REPLACEMENTS (' + plan.formulaSwaps.length + '):');
  plan.formulaSwaps.forEach(function (s) {
    L.push('   ' + s.cell + ' : IFERROR-masked formula → recomputed value (original archived for rollback)');
  });
  if (!plan.formulaSwaps.length) L.push('   none remaining');
  L.push('');
  L.push('FORM HARDENING (in place, reversible in the Forms UI):');
  plan.formHardening.forEach(function (s) { L.push('   ' + s); });
  L.push('');
  L.push('IDENTITY:');
  var idp = previewIdentityMigrationV20_1();
  L.push(idp.text.split('\n').map(function (x) { return '   ' + x; }).join('\n'));
  L.push('');
  L.push('STRANDED DECISIONS:');
  L.push(previewStrandedDecisionsV20_1().split('\n').map(function (x) { return '   ' + x; }).join('\n'));
  L.push('');
  L.push('APPLY with applyMigrationV20_1("APPLY V20_1"). Every step is additive;');
  L.push('rollback instructions: migrationRollbackNotesV20_1().');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** THE APPLY STEP. Requires the literal confirmation token. Additive
 *  only; verifies each step and reports it. */
function applyMigrationV20_1(confirmToken) {
  if (confirmToken !== 'APPLY V20_1') {
    return 'Not run. Review previewMigrationV20_1(), then call applyMigrationV20_1("APPLY V20_1").';
  }
  return withScriptLockV20_1_('applyMigration', 60000, function () {
    var plan = migrationPlanV20_1_();
    var done = [];

    plan.newSheets.forEach(function (s) {
      var sh = ss().insertSheet(s.name);
      sh.getRange(1, 1).setValue(MIGRATION_MARKER_V20_1 + ' ' + new Date().toISOString());
      sh.getRange(4, 1, 1, s.headers.length).setValues([s.headers]);
      sh.setFrozenRows(4);
      sh.hideSheet();
      done.push('created ' + s.name);
    });

    plan.newColumns.forEach(function (c) {
      var t = readTableV20_1_(c.tab, 4);
      var sh = t.sheet;
      var col = t.headers.length + 1;
      var probe = t.headers.indexOf('');
      if (probe >= 0) col = probe + 1; // reuse a blank header slot before extending
      if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
      sh.getRange(4, col).setValue(c.header);
      done.push(c.tab + ' + "' + c.header + '" (col ' + col + ')');
    });

    var qSheet = getSheetOrNullV20_1_(TAB.SKILL_VALIDATION);
    if (qSheet) {
      qSheet.getRange(2, 2).setValue(
        'Pick a DECISION and a REASON, then tick RECORD on the row (or run ' +
        'SCEMS → Record pending skill decisions). Nothing is official until then.');
      done.push('queue banner instruction updated');
    }
    var back = ensureQueueRequestIdsV20_1_();
    if (back) done.push('backfilled ' + back + ' queue REQUEST ID(s)');
    var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
    if (q.ok && q.col['RECORD'] !== undefined) {
      var rows = Math.max(q.sheet.getMaxRows() - 4, 1);
      q.sheet.getRange(5, q.col['RECORD'] + 1, rows, 1).insertCheckboxes();
      done.push('armed RECORD checkboxes on the queue');
    }

    var an = getSheetOrNullV20_1_(TAB.ANALYTICS);
    if (an && plan.formulaSwaps.length) {
      var archive = plan.formulaSwaps.map(function (s) { return s.cell + ' = ' + s.before; }).join('  ||  ');
      try {
        appendRowsHeaderMappedV20_1_(TAB.LEDGER, 4, [{
          'LEDGER KEY': 'MIGRATION-' + newIdV20_1_('AN'), 'FORM ID': '', 'RESPONSE ID': '',
          'FORM TITLE': 'ANALYTICS FORMULA ARCHIVE', 'KIND': 'migration',
          'RECEIVED AT': new Date(), 'STATE': 'RECONCILED',
          'DETAIL': archive.slice(0, 490), 'EVENTS WRITTEN': '',
          'PROCESSED AT': new Date(), 'WRITER VERSION': SCEMS_WRITER_VERSION
        }], ['LEDGER KEY']);
      } catch (e) {
        systemLog_('WARN', 'FORMULA ARCHIVE FALLBACK', archive.slice(0, 400));
      }
      done.push('archived ' + plan.formulaSwaps.length + ' original formula(s), then recomputed');
      refreshAnalyticsV20_1();
    }

    done.push('handover: ' + hardenHandoverFormV20_1().split('\n')[1]);
    hardenLevelFormsV20_1().split('\n').forEach(function (l) { done.push('level form ' + l); });

    var idp = previewIdentityMigrationV20_1();
    var regRows = idp.proposed.map(function (p) {
      return {
        'PERSON ID': p.personId, 'TYPE': p.type, 'DISPLAY NAME': p.name,
        'NORMALIZED NAME': p.norm, 'EMPLOYEE ID': p.employeeId || '', 'EMAIL': p.email || '',
        'CERT LEVEL': p.certLevel || '', 'SHIFT': '', 'TRAINS EMT': '', 'TRAINS AEMT': '',
        'TRAINS PARAMEDIC': '', 'ROLE': '', 'ACTIVE': p.active ? 'Y' : 'N',
        'SOURCE': p.source, 'CREATED': new Date(), 'NOTES': (p.problems || []).join('; ')
      };
    });
    // Leadership rows from the configured role addresses, so authority
    // checks resolve people without hard-coding names in source.
    [['P-LEAD-TCO', 'Division Chief of Training', CONFIG.TCO_EMAIL],
     ['P-LEAD-CHIEF', 'Chief', CONFIG.CHIEF_EMAIL],
     ['P-LEAD-ACHIEF', 'Assistant Chief', CONFIG.ACHIEF_EMAIL],
     ['P-LEAD-MD', 'Medical Director', CONFIG.MD_EMAIL]].forEach(function (ld) {
      regRows.push({
        'PERSON ID': ld[0], 'TYPE': 'LEADER', 'DISPLAY NAME': ld[1],
        'NORMALIZED NAME': normalizeNameV20_1_(ld[1]), 'EMPLOYEE ID': '',
        'EMAIL': String(ld[2] || '').toLowerCase(), 'CERT LEVEL': '', 'SHIFT': '',
        'TRAINS EMT': '', 'TRAINS AEMT': '', 'TRAINS PARAMEDIC': '', 'ROLE': ld[1],
        'ACTIVE': 'Y', 'SOURCE': '99_config', 'CREATED': new Date(), 'NOTES': ''
      });
    });
    var existing = loadRegistryV20_1_();
    var newRows = regRows.filter(function (r) { return !existing.byId[r['PERSON ID']]; });
    if (newRows.length) {
      appendRowsHeaderMappedV20_1_(TAB.REGISTRY, 4, newRows, ['PERSON ID', 'TYPE', 'DISPLAY NAME']);
      done.push('registry: ' + newRows.length + ' person rows written; ' +
                idp.flagged.length + ' held for human review (NOT written)');
    }
    var ctl = getSheetOrNullV20_1_(TAB.CONTROL);
    if (ctl) {
      var reg2 = readTableV20_1_(TAB.REGISTRY, 4);
      var emails = ctl.getRange(5, 15, 8, 1).getValues();
      var ftoRecs = rosterFtoRecordsV20_1_();
      var mapped = 0;
      emails.forEach(function (row) {
        var em = String(row[0] || '').trim().toLowerCase();
        if (!isValidEmailV20_1_(em)) return;
        mapped++;
      });
      if (mapped) done.push('README EMAIL column: ' + mapped +
        ' address(es) found — map each to its person on 90 PERSON REGISTRY (manual confirm; the ' +
        'preview lists FTOs still lacking a verified email)');
    }

    systemLog_('WARN', 'MIGRATION APPLIED', done.join(' | ').slice(0, 800));
    var msg = 'MIGRATION APPLIED\n\n' + done.map(function (d) { return '  ' + d; }).join('\n') +
      '\n\nVerify with runtimeHealthCheckV20_1() and verifySkillsV20_1().' +
      '\nRollback notes: migrationRollbackNotesV20_1().';
    Logger.log(msg);
    return msg;
  });
}

/** Rollback instructions plus the only safe automated rollback (removing
 *  the four migration-created sheets when they carry the marker and hold
 *  no operational rows yet). */
function migrationRollbackNotesV20_1() {
  var msg = [
    'MIGRATION ROLLBACK — v20.1',
    '',
    '1. New sheets (90–93): removable ONLY while empty of operational rows.',
    '   Run removeMigrationSheetsV20_1("REMOVE EMPTY V20_1 SHEETS").',
    '2. Added columns on 19/20/21/22: additive and inert. To roll back,',
    '   delete the added column(s) by hand — they are to the right of the',
    '   original headers and named in the migration log entry.',
    '3. ANALYTICS formulas: originals are archived in the ledger row titled',
    '   ANALYTICS FORMULA ARCHIVE (and in the system log). Paste each back',
    '   into its cell to restore formula-driven values.',
    '4. Form hardening: reversible in each form\'s Settings (email',
    '   collection) — though reverting removes identity verification.',
    '5. Recorded decisions and registry rows are records: rolled back via',
    '   the Revoke/supersede workflow, never by deletion.'
  ].join('\n');
  Logger.log(msg);
  return msg;
}

/** Removes ONLY the four migration-created sheets, ONLY when marked and
 *  ONLY when they contain no data rows. */
function removeMigrationSheetsV20_1(confirmToken) {
  if (confirmToken !== 'REMOVE EMPTY V20_1 SHEETS') {
    return 'Not run. Call removeMigrationSheetsV20_1("REMOVE EMPTY V20_1 SHEETS").';
  }
  var out = [];
  [TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS].forEach(function (name) {
    var sh = getSheetOrNullV20_1_(name);
    if (!sh) { out.push(name + ': absent'); return; }
    var marker = String(sh.getRange(1, 1).getValue() || '');
    if (marker.indexOf(MIGRATION_MARKER_V20_1) !== 0) {
      out.push(name + ': NOT REMOVED (no migration marker)'); return;
    }
    if (sh.getLastRow() > 4) {
      out.push(name + ': NOT REMOVED (holds ' + (sh.getLastRow() - 4) + ' data row(s))'); return;
    }
    ss().deleteSheet(sh);
    out.push(name + ': removed (was empty)');
  });
  systemLog_('WARN', 'MIGRATION SHEET ROLLBACK', out.join(' | '));
  return out.join('\n');
}


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 85_freshstart
 *
 * Starting again without losing anything.
 *
 * The tracker accumulated fifty-two tabs. Twenty-two of them nothing in this
 * code has ever heard of: fifteen "Form Responses N" left behind by relinking
 * forms, two marked LEGACY V18, and five the portal made for itself. On top of
 * that, one deleted row left a #REF! in the phase engine's key column that
 * silently breaks a row on seven tabs.
 *
 * THE METHOD, AND WHY IT IS THIS ONE
 *
 * Rebuilding the tabs from an export does not work. 80 of the workbook's 3,872
 * formulas use Google-only functions that no export format can represent; they
 * come back as a placeholder and a rebuild would quietly lose them. A copy made
 * inside Drive keeps every formula, every validation rule, every protection and
 * every format exactly.
 *
 * So the fresh start is: copy the spreadsheet, clean the copy, move the forms
 * across, and retire the original once the new one has proved itself. Nothing
 * is deleted from the original at any point, and if the new one disappoints you
 * still have the old one sitting there working.
 *
 * WHAT THIS FILE WILL AND WILL NOT REMOVE
 *
 * It removes exactly two kinds of tab: a "Form Responses N" that no form is
 * currently writing to, and a tab whose name ends LEGACY V18. It asks Google
 * which sheets are live form destinations rather than guessing from the name,
 * so a response tab that is still in use cannot be caught by it.
 *
 * It will not touch a tab this code knows about, whatever state it is in.
 */

/** Tabs this code names, as a lookup. Nothing in here is ever removable. */
function knownTabsV20_6_() {
  var known = {};
  Object.keys(TAB).forEach(function (k) { known[TAB[k]] = true; });
  known['HOME'] = true;
  if (typeof TAB_CONSOLE_V20_3 === 'string') known[TAB_CONSOLE_V20_3] = true;
  return known;
}

/** Is this sheet the live destination of a form? Google is asked, not guessed.
 *
 *  getFormUrl() returns the form's address when a form is writing to this
 *  sheet and null when nothing is. That is the whole test, and it is the
 *  reason a response tab still in use cannot be removed by mistake: the name
 *  says nothing useful, and this says everything. */
function sheetIsLiveFormDestinationV20_6_(sh) {
  try { return !!sh.getFormUrl(); } catch (e) { return true; }   // unsure means keep
}

/** What a clean-up would remove, and what it would leave. Writes nothing. */
function freshStartReport() { return freshStartV20_6_(''); }

/** Do it. The token names the spreadsheet so it cannot be run on the wrong one
 *  by pasting a command from somewhere else. */
function freshStartClean(confirmToken) { return freshStartV20_6_(confirmToken); }

function freshStartV20_6_(confirmToken) {
  var book = ss();
  var TOKEN = 'CLEAN ' + book.getName();

  var known = knownTabsV20_6_();
  var remove = [], keep = [], live = [];

  book.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (known[name] || /^PORTAL /.test(name)) { keep.push(name); return; }

    var isResponses = /^Form Responses( \d+)?$/.test(name);
    var isLegacy = /LEGACY V\d+$/i.test(name);
    if (!isResponses && !isLegacy) { keep.push(name); return; }

    if (isResponses && sheetIsLiveFormDestinationV20_6_(sh)) {
      live.push(name);
      return;
    }
    var used = 0;
    try {
      var last = sh.getLastRow();
      used = last > 1 ? last - 1 : 0;
    } catch (e) {}
    remove.push({ name: name, rows: used, why: isLegacy ? 'superseded' : 'no form writes to it' });
  });

  var L = ['FRESH START — ' + book.getName(), '',
    'Tabs in this spreadsheet : ' + (keep.length + live.length + remove.length),
    '  kept, named by the code: ' + keep.length,
    '  kept, a form writes to : ' + live.length,
    '  REMOVABLE              : ' + remove.length, ''];

  if (live.length) {
    L.push('A form is currently writing to these, so they stay whatever they are called:');
    live.forEach(function (n) { L.push('  ' + n); });
    L.push('');
  }

  if (!remove.length) {
    L.push('Nothing to remove. Every tab here is either named by this code or is a');
    L.push('live form destination.');
  } else {
    L.push('These would be removed. Row counts exclude the header:');
    var total = 0;
    remove.forEach(function (r) {
      total += r.rows;
      L.push('  ' + r.name + '  —  ' + r.rows + ' row(s), ' + r.why);
    });
    L.push('');
    L.push('  ' + total + ' row(s) in total.');
    L.push('');
    L.push('Every one of those rows also exists in the form that produced it, and');
    L.push('in the backup. Nothing here is the only copy of anything. Even so, this');
    L.push('refuses to run on a spreadsheet that has not been copied first.');
  }

  if (confirmToken !== TOKEN) {
    L.push('');
    L.push('NOTHING WAS CHANGED.');
    if (remove.length) {
      L.push('');
      L.push('Before running this for real:');
      L.push('  1. This must be the COPY, not the original. Check the name above.');
      L.push('  2. The original must still exist and still be untouched.');
      L.push('');
      L.push('Then:  freshStartClean("' + TOKEN + '")');
    }
    var pv = L.join('\n');
    Logger.log(pv);
    try { SpreadsheetApp.getUi().alert(pv.slice(0, 1400)); } catch (e) {}
    return pv;
  }

  if (!gateV20_2_('FRESH START CLEAN')) return 'Refused: not authorised.';

  var done = [], failed = [];
  remove.forEach(function (r) {
    try {
      book.deleteSheet(book.getSheetByName(r.name));
      done.push(r.name + ' (' + r.rows + ' rows)');
    } catch (e) {
      failed.push(r.name + ' — ' + (e && e.message ? e.message : e));
    }
  });
  SpreadsheetApp.flush();
  systemLog_('WARN', 'FRESH START CLEAN',
    done.length + ' tab(s) removed from ' + book.getName() + ': ' + done.join(', '));

  L.push('');
  L.push('DONE. ' + done.length + ' tab(s) removed.');
  if (failed.length) {
    L.push('');
    L.push(failed.length + ' could not be removed:');
    failed.forEach(function (f) { L.push('  ' + f); });
  }
  L.push('');
  L.push('NEXT, IN THIS ORDER:');
  L.push('  engineHealthCheck()             what is still broken, and why');
  L.push('  applyEngineRepairV20_6(token)   put the phase engine key column back');
  L.push('  repairDecisionQueueHeaderV20_4()  tab 12\'s blank header column');
  L.push('  protectRecordTabsV20_2()        lock the record tabs, 17 included');
  L.push('  tabNameCheck()                  every name the code wants, against what is here');
  L.push('  fullSystemReviewV20_1()         the whole thing, read only');
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 87_estate
 *
 * Keeping the Drive estate to one live workbook and nine live forms.
 *
 * What went wrong, in one sentence: Google Forms mint a new "Form Responses N"
 * tab every time a form is relinked, and DriveApp.makeCopy of the workbook
 * clones every linked form as "Copy of …" / "Copy of Copy of …". Neither is
 * data loss. Both look like a second system, and a human submitting to a copy
 * reaches nowhere.
 *
 * Rules this file will not break:
 *   - Never delete a form or a response. Archive means move into a dated
 *     folder. The originals stay recoverable.
 *   - Never touch a form whose title matches the live estate exactly.
 *   - Never delete a tab from the live workbook here. Orphan response tabs
 *     are cleaned only by freshStartClean on a COPY (85_freshstart.gs).
 *   - Never invent a second live spreadsheet. There is one.
 */

/** The one live workbook. Anything else with a similar name is an orphan. */
var CANONICAL_LIVE_SPREADSHEET_ID = '1YL-9Er9Gk458tR0jpRO680DVtvswNGSLVTlugmclsRI';

/** Known twin that looks real and is wired to nothing. Do not install into it. */
var ORPHAN_TWIN_SPREADSHEET_ID = '1q7OnZox2Gs5UEp8gkYh1Osyxkzmtmogv9ViIrr2Q59M';

var FORM_COPY_ARCHIVE_FOLDER_V20_6 = 'SCEMS Form Copies — ARCHIVE';
var STAGING_ARCHIVE_FOLDER_V20_6 = 'SCEMS Portal Staging — ARCHIVE';

/** A title Google minted for a form cloned by spreadsheet makeCopy. */
function isFormCopyTitleV20_6_(title) {
  return /^Copy of /i.test(String(title || '').trim());
}

/** Strip every leading "Copy of " until the live title underneath remains. */
function liveTitleUnderCopyV20_6_(title) {
  var t = String(title || '').trim();
  while (/^Copy of /i.test(t)) t = t.replace(/^Copy of /i, '').trim();
  return t;
}

/** True when the underlying title is one of the nine live forms. */
function isSCEMSFormCopyTitleV20_6_(title) {
  if (!isFormCopyTitleV20_6_(title)) return false;
  var under = liveTitleUnderCopyV20_6_(title);
  return EXPECTED_FORMS_V19.indexOf(under) >= 0;
}

function formIdFromUrlV20_6_(url) {
  var m = String(url || '').match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function ensureNamedFolderV20_6_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function ensureDatedArchiveFolderV20_6_(parentName, stamp) {
  var parent = ensureNamedFolderV20_6_(parentName);
  var childName = stamp || Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmm');
  var it = parent.getFoldersByName(childName);
  return it.hasNext() ? it.next() : parent.createFolder(childName);
}

/** Live form IDs from script properties — the only ones that may stay put. */
function liveFormIdSetV20_6_() {
  var set = {};
  try {
    storedFormIdsV20_1_().forEach(function (id) { if (id) set[id] = true; });
  } catch (e) {}
  return set;
}

/**
 * Inventory of Drive form files whose titles are "Copy of …" versions of the
 * nine live forms. Never includes a live FORM_IDS entry. Writes nothing.
 *
 * light=true skips opening each form for response counts (much faster; used
 * when we only need ids/titles to archive).
 */
function formCopyInventoryV20_6_(light) {
  var live = liveFormIdSetV20_6_();
  var found = [];
  // Title filter: scanning every form in Drive was taking minutes and blowing
  // the 6-minute Apps Script limit before later elite-estate steps could run.
  var q = 'mimeType = "application/vnd.google-apps.form" and trashed = false ' +
          'and title contains "Copy of SCEMS"';
  var it = DriveApp.searchFiles(q);
  while (it.hasNext()) {
    var file = it.next();
    var title = '';
    try { title = file.getName(); } catch (e) { continue; }
    if (!isSCEMSFormCopyTitleV20_6_(title)) continue;
    var id = file.getId();
    if (live[id]) continue;
    var responses = null, accepting = null, dest = '';
    if (!light) {
      try {
        var f = FormApp.openById(id);
        responses = f.getResponses().length;
        accepting = f.isAcceptingResponses();
        try { dest = f.getDestinationId() || ''; } catch (e2) {}
      } catch (e3) {}
    }
    found.push({
      id: id,
      title: title,
      under: liveTitleUnderCopyV20_6_(title),
      responses: responses,
      accepting: accepting,
      destination: dest,
      url: file.getUrl()
    });
  }
  found.sort(function (a, b) {
    return String(a.title).localeCompare(String(b.title));
  });
  return found;
}

/** Read-only: every "Copy of" SCEMS form still sitting in Drive. */
function formEstateReport() {
  var L = ['FORM ESTATE REPORT — READ ONLY, nothing was moved', ''];
  var liveIds = [];
  try { liveIds = storedFormIdsV20_1_(); } catch (e) {}
  L.push('Live forms in FORM_IDS : ' + liveIds.length + ' of ' + EXPECTED_FORMS_V19.length);
  EXPECTED_FORMS_V19.forEach(function (t) {
    var f = null;
    try { f = getStoredFormV19_(t); } catch (e) {}
    L.push('  ' + (f ? 'OK' : 'MISSING') + '  ' + t);
  });
  L.push('');

  var copies = formCopyInventoryV20_6_(false);
  L.push('Backup form clones still in Drive : ' + copies.length);
  if (!copies.length) {
    L.push('None. The form estate is clean.');
  } else {
    L.push('These are Google\'s copies of a workbook backup. Submitting to one');
    L.push('reaches nowhere useful. They will be moved, not deleted, by');
    L.push('archiveFormCopies("ARCHIVE FORM COPIES").');
    L.push('');
    var totalResp = 0;
    copies.forEach(function (c) {
      totalResp += Number(c.responses) || 0;
      L.push('  ' + c.title);
      L.push('     responses: ' + (c.responses === null ? '?' : c.responses) +
        '  accepting: ' + (c.accepting === null ? '?' : c.accepting) +
        (c.destination ? '  dest: ' + c.destination : '  dest: (none)'));
    });
    L.push('');
    L.push('  ' + totalResp + ' response(s) across all clones (also still in the live forms).');
  }

  var bookId = '';
  try { bookId = ss().getId(); } catch (e) {}
  L.push('');
  L.push('This spreadsheet id : ' + bookId);
  if (bookId === CANONICAL_LIVE_SPREADSHEET_ID) {
    L.push('  Matches the canonical live workbook. Good.');
  } else if (bookId === ORPHAN_TWIN_SPREADSHEET_ID) {
    L.push('  BLOCKER — this is the orphan twin. Nothing is wired to it.');
    L.push('  Open the starred Master and paste / run there instead.');
  } else {
    L.push('  WARN — not the documented live id. Confirm you meant this book.');
  }

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/**
 * Move every SCEMS "Copy of …" form into a dated archive folder.
 * Never trashes. Never touches a live FORM_IDS form. Safe to run twice.
 */
function archiveFormCopies(confirmToken) {
  return archiveFormCopiesV20_6_(confirmToken);
}

function archiveFormCopiesV20_6_(confirmToken) {
  var TOKEN = 'ARCHIVE FORM COPIES';
  var copies = formCopyInventoryV20_6_(true);
  var L = ['ARCHIVE FORM COPIES', '',
    'Candidates : ' + copies.length, ''];

  if (!copies.length) {
    L.push('Nothing to archive. The form estate is already clean.');
    var clean = L.join('\n');
    Logger.log(clean);
    try { SpreadsheetApp.getUi().alert(clean.slice(0, 1400)); } catch (e) {}
    return clean;
  }

  copies.forEach(function (c) {
    L.push('  ' + c.title + '  (' + (c.responses === null ? '?' : c.responses) + ' responses)');
  });
  L.push('');
  L.push('Each will be moved into "' + FORM_COPY_ARCHIVE_FOLDER_V20_6 + '" / <stamp>.');
  L.push('Nothing is deleted. Live forms are never touched.');

  if (confirmToken !== TOKEN) {
    L.push('');
    L.push('NOTHING WAS MOVED. To do it:');
    L.push('  archiveFormCopies("' + TOKEN + '")');
    var pv = L.join('\n');
    Logger.log(pv);
    try { SpreadsheetApp.getUi().alert(pv.slice(0, 1400)); } catch (e) {}
    return pv;
  }

  if (!gateV20_2_('ARCHIVE FORM COPIES')) return 'Refused: not authorised.';

  var stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmm');
  var folder = ensureDatedArchiveFolderV20_6_(FORM_COPY_ARCHIVE_FOLDER_V20_6, stamp);
  var live = liveFormIdSetV20_6_();
  var moved = [], skipped = [], failed = [];

  copies.forEach(function (c) {
    if (live[c.id]) {
      skipped.push(c.title + ' — listed in FORM_IDS; left alone');
      return;
    }
    try {
      var file = DriveApp.getFileById(c.id);
      // Close accepting if still open — a clone must never take live traffic.
      try {
        var f = FormApp.openById(c.id);
        if (f.isAcceptingResponses()) f.setAcceptingResponses(false);
        try { f.removeDestination(); } catch (eDest) {}
      } catch (eForm) {}
      folder.addFile(file);
      var parents = file.getParents();
      while (parents.hasNext()) {
        var p = parents.next();
        if (p.getId() !== folder.getId()) {
          try { p.removeFile(file); } catch (eRem) {}
        }
      }
      moved.push(c.title);
    } catch (e) {
      failed.push(c.title + ' — ' + (e && e.message ? e.message : e));
    }
  });

  SpreadsheetApp.flush();
  systemLog_('WARN', 'FORM COPIES ARCHIVED',
    moved.length + ' moved to ' + FORM_COPY_ARCHIVE_FOLDER_V20_6 + '/' + stamp);

  L.push('');
  L.push('DONE. Moved : ' + moved.length);
  moved.forEach(function (t) { L.push('  ' + t); });
  if (skipped.length) {
    L.push('');
    L.push('Left alone:');
    skipped.forEach(function (t) { L.push('  ' + t); });
  }
  if (failed.length) {
    L.push('');
    L.push('Could not move:');
    failed.forEach(function (t) { L.push('  ' + t); });
  }
  L.push('');
  L.push('Archive folder: ' + folder.getUrl());
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/**
 * After a workbook makeCopy, Google leaves cloned forms linked to the backup.
 * Unlink them, close them, and move them into the archive so the next backup
 * cannot invent "Copy of Copy of …". Called only from fullBackupV20_1.
 */
function neutralizeBackupFormClonesV20_6_(backupSpreadsheetId, stamp) {
  if (!backupSpreadsheetId) return { moved: [], note: 'no backup id' };
  var folder = ensureDatedArchiveFolderV20_6_(FORM_COPY_ARCHIVE_FOLDER_V20_6,
    'backup_' + (stamp || 'unknown'));
  var live = liveFormIdSetV20_6_();
  var moved = [], failed = [];
  var seen = {};

  function archiveOne(formId, titleHint) {
    if (!formId || seen[formId] || live[formId]) return;
    seen[formId] = true;
    try {
      var f = FormApp.openById(formId);
      var title = '';
      try { title = f.getTitle(); } catch (eT) { title = titleHint || formId; }
      // Only archive titles that are copies of our forms (or any form whose
      // destination is the backup book — those were minted by this copy).
      var isOurs = isSCEMSFormCopyTitleV20_6_(title) || isFormCopyTitleV20_6_(title);
      if (!isOurs && EXPECTED_FORMS_V19.indexOf(String(title || '').trim()) >= 0) {
        // Exact live title linked to a backup — still a clone Google made;
        // rename awareness: leave live alone via live-id check above.
        isOurs = true;
      }
      if (!isOurs) return;
      try { if (f.isAcceptingResponses()) f.setAcceptingResponses(false); } catch (eA) {}
      try { f.removeDestination(); } catch (eD) {}
      var file = DriveApp.getFileById(formId);
      folder.addFile(file);
      var parents = file.getParents();
      while (parents.hasNext()) {
        var p = parents.next();
        if (p.getId() !== folder.getId()) {
          try { p.removeFile(file); } catch (eR) {}
        }
      }
      moved.push(title);
    } catch (e) {
      failed.push((titleHint || formId) + ' — ' + (e && e.message ? e.message : e));
    }
  }

  try {
    var backup = SpreadsheetApp.openById(backupSpreadsheetId);
    backup.getSheets().forEach(function (sh) {
      var url = '';
      try { url = sh.getFormUrl() || ''; } catch (e) { return; }
      if (!url) return;
      archiveOne(formIdFromUrlV20_6_(url), sh.getName());
    });
  } catch (eOpen) {
    failed.push('open backup: ' + (eOpen && eOpen.message ? eOpen.message : eOpen));
  }

  // Belt-and-braces: any brand-new "Copy of" SCEMS form created in the last
  // few minutes whose destination is the backup id.
  try {
    formCopyInventoryV20_6_(true).forEach(function (c) {
      if (c.destination === backupSpreadsheetId) archiveOne(c.id, c.title);
    });
  } catch (eInv) {}

  if (moved.length) {
    systemLog_('WARN', 'BACKUP FORM CLONES ARCHIVED',
      moved.length + ' clone(s) from backup ' + backupSpreadsheetId);
  }
  return { moved: moved, failed: failed, folderUrl: folder.getUrl() };
}

/** Orphan Form Responses tabs on THIS book (no live form writing to them). */
function orphanResponseTabsV20_6_() {
  var remove = [];
  var known = knownTabsV20_6_();
  ss().getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (known[name] || /^PORTAL /.test(name)) return;
    if (!/^Form Responses( \d+)?$/i.test(name)) return;
    if (sheetIsLiveFormDestinationV20_6_(sh)) return;
    var rows = 0;
    try {
      var last = sh.getLastRow();
      rows = last > 1 ? last - 1 : 0;
    } catch (e) {}
    remove.push({ name: name, rows: rows });
  });
  return remove;
}

/** Engine key-column damage summary for the health check. Writes nothing. */
function engineDamageSummaryV20_6_() {
  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  if (!eng) return { missing: true, broken: 0, crossed: 0 };
  var first = 5;
  var last = Math.max(eng.getLastRow(), first);
  var formulas = eng.getRange(first, 1, last - first + 1, 1).getFormulas();
  var broken = 0, crossed = 0;
  formulas.forEach(function (r, i) {
    var row = first + i;
    var f = String(r[0] || '');
    if (!f) return;
    if (f.indexOf('#REF!') >= 0) { broken++; return; }
    var m = f.match(/'?01 TRAINEE MASTER'?!A(\d+)/);
    if (m && Number(m[1]) !== row) crossed++;
  });
  return { missing: false, broken: broken, crossed: crossed };
}

/** Decision-queue header gap (blank column D shifting labels). */
function decisionQueueHeaderGapV20_6_() {
  var sh = getSheetOrNullV20_1_(TAB.QUEUE);
  if (!sh) return { missing: true, gap: false };
  var headers = sh.getRange(4, 1, 1, Math.max(sh.getLastColumn(), 14)).getValues()[0];
  var blankD = String(headers[3] || '').trim() === '';
  var hasOwner = headers.some(function (h) {
    return String(h || '').trim().toUpperCase() === 'OWNER';
  });
  return { missing: false, gap: blankD && !hasOwner };
}

/**
 * Health-check items about the Drive / tab estate. Each is {sev, headline, run}.
 * Called from healthCheckV20_2 so estate problems surface on the standing list.
 */
function estateHealthItemsV20_6_() {
  var items = [];
  function add(sev, headline, run) { items.push({ sev: sev, headline: headline, run: run || '' }); }

  try {
    var id = ss().getId();
    if (id === ORPHAN_TWIN_SPREADSHEET_ID) {
      add('BLOCKER',
        'This script is bound to the orphan twin spreadsheet. Nothing is wired to it. ' +
        'Open the starred Master (' + CANONICAL_LIVE_SPREADSHEET_ID + ') instead.',
        '');
    } else if (id !== CANONICAL_LIVE_SPREADSHEET_ID) {
      add('WARN',
        'This spreadsheet id is not the documented live workbook. Confirm before trusting readiness numbers.',
        'formEstateReport');
    }
  } catch (e) {}

  try {
    var dmg = engineDamageSummaryV20_6_();
    if (dmg.missing) {
      add('WARN', 'Phase engine tab is missing.', '');
    } else if (dmg.broken || dmg.crossed) {
      add('BLOCKER',
        'Phase engine key column is damaged: ' + dmg.broken + ' #REF! cell(s), ' +
        dmg.crossed + ' crossed row(s). Downstream views are silently wrong.',
        'previewEngineRepairV20_6');
    }
  } catch (e2) {}

  try {
    var orphans = orphanResponseTabsV20_6_();
    if (orphans.length) {
      var rows = orphans.reduce(function (n, o) { return n + o.rows; }, 0);
      add('WARN',
        orphans.length + ' orphan Form Responses tab(s) hold ~' + rows +
        ' row(s). Clean them only on a COPY via freshStartClean — never on live.',
        'freshStartReport');
    }
  } catch (e3) {}

  try {
    var copies = formCopyInventoryV20_6_(true);
    if (copies.length) {
      add('WARN',
        copies.length + ' backup form clone(s) ("Copy of …") still sit in Drive. ' +
        'A human submitting to one reaches nowhere.',
        'formEstateReport');
    }
  } catch (e4) {}

  try {
    var gap = decisionQueueHeaderGapV20_6_();
    if (gap.gap) {
      add('WARN',
        'Decision queue header row has a blank column that shifts every label to its left. ' +
        'Anything reading by header name is reading a neighbour.',
        'repairDecisionQueueHeaderV20_4');
    }
  } catch (e5) {}

  return items;
}


/* ====================================================================== */
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
  var mirrors = [TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.DECISIONS];
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
                  kind === 'urgent' ? TAB.URGENT : TAB.DECISIONS;

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


/* ====================================================================== */
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

/**
 * THE button for "this is too confusing."
 *
 * Builds the TRAINEES desk, hides Form Responses and every other machinery
 * tab, and leaves you on TRAINEES. Does not delete data. Does not touch
 * forms. Safe to run any time the tab bar looks like a junk drawer.
 */
function MAKE_IT_SIMPLE() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SCEMS ' + SCEMS_VERSION + ' — MAKE IT SIMPLE', '',
    'Goal: a desk you can run the program from, not a warehouse of tabs.', ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 2).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 105));
      });
    } catch (e) {
      L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 180));
    }
  }
  step(1, 'Build the TRAINEES console', function () { return buildTraineeConsoleV20_3(); });
  step(2, 'Widen columns so comments are readable', function () { return makeSheetsReadableV20_3(); });
  step(3, 'Refresh AUDIT tab layout (flags stay formula-driven)', function () {
    return redoAuditTabV20_1();
  });
  step(4, 'Hide Form Responses and other machinery', organizeTabsV20_2);
  L.push('');
  L.push('How to use this system from now on:');
  L.push('  1. SCEMS ▸ Trainees — start here');
  L.push('  2. SCEMS ▸ Work my queue');
  L.push('  3. SCEMS ▸ Work audit flags  (RED cells on AUDIT — own them or fix data)');
  L.push('  4. SCEMS ▸ What needs attention?  when something feels off');
  L.push('  5. SCEMS ▸ Backup now  about once a month');
  L.push('');
  L.push('Flags do not clear by editing the AUDIT grid. Fix the source data,');
  L.push('or Accept with a reason (flag stays visible until data catches up).');
  L.push('The portal is for FTOs / trainees / Medical Director views.');
  L.push('This spreadsheet is for you — Training — to decide and record.');
  var msg = L.join('\n');
  systemLog_('WARN', 'MAKE IT SIMPLE', SCEMS_VERSION);
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Alias kept so older instructions that say SIMPLIFY_EVERYTHING still work. */
function SIMPLIFY_EVERYTHING() { return MAKE_IT_SIMPLE(); }

/**
 * Correctness of the estate — not cosmetics.
 *
 * Apps Script kills any run at six minutes. The first live run archived 53
 * form clones and repaired the engine, then died before recovery/matrix.
 * This is now two commands, each safe to repeat:
 *
 *   ELITE_ESTATE()        — forms, engine, headers, queue, protections, triggers
 *   ELITE_ESTATE_FINISH() — recover lost submissions, rebuild matrix, health check
 *
 * Orphan Form Responses tabs are reported only; clean those on a Drive copy
 * via freshStartClean / the handover doc.
 */
function ELITE_ESTATE() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SCEMS ' + SCEMS_VERSION + ' — ELITE ESTATE (part 1 of 2)', ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 3).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 110));
      });
    } catch (e) {
      L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 200));
    }
  }

  L.push('This spreadsheet : ' + (function () {
    try { return ss().getId(); } catch (e) { return '?'; }
  })());
  if (ss().getId() === ORPHAN_TWIN_SPREADSHEET_ID) {
    L.push('');
    L.push('STOPPED. This is the orphan twin. Open the starred Master and run there.');
    var stop = L.join('\n');
    Logger.log(stop);
    try { SpreadsheetApp.getUi().alert(stop.slice(0, 1400)); } catch (e) {}
    return stop;
  }

  // Light inventory + archive (no per-form response counts — that alone
  // burned minutes on 53 clones and tripped the execution ceiling).
  step(1, 'Archive backup form clones', function () {
    return archiveFormCopiesV20_6_('ARCHIVE FORM COPIES');
  });
  step(2, 'Engine key column repair', function () {
    return engineRepairV20_6_('REPAIR THE ENGINE KEY COLUMN');
  });
  step(3, 'Decision queue header', repairDecisionQueueHeaderV20_4);
  step(4, 'Re-open wrongly cancelled queue rows', repairCancelledQueueRowsV20_2);
  step(5, 'Protect record tabs', protectRecordTabsV20_2);
  step(6, 'Repair triggers (incl. combined skills form)', repairAllTriggersNow);

  L.push('');
  L.push('Part 1 done. Next, run ELITE_ESTATE_FINISH() — recovers lost');
  L.push('submissions, rebuilds the skill matrix, and prints the health check.');
  L.push('Those are the slow steps; keeping them separate avoids the 6-minute kill.');
  L.push('');
  L.push('Orphan Form Responses tabs stay until you clean a COPY:');
  L.push('  freshStartReport() then freshStartClean("CLEAN <copy name>")');

  var msg = L.join('\n');
  systemLog_('WARN', 'ELITE ESTATE PART 1', SCEMS_VERSION);
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Part 2: recover lost submissions, rebuild matrix, health check.
 *  Safe after part 1, and safe to run on its own if part 1 already finished. */
function ELITE_ESTATE_FINISH() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var L = ['SCEMS ' + SCEMS_VERSION + ' — ELITE ESTATE (part 2 of 2)', ''];
  function step(n, what, fn) {
    try {
      var r = fn();
      L.push(n + '. ' + what + ' : OK');
      if (r) String(r).split('\n').slice(0, 4).forEach(function (x) {
        if (x.trim()) L.push('      ' + x.trim().slice(0, 110));
      });
    } catch (e) {
      L.push(n + '. ' + what + ' : FAILED — ' + String(e).slice(0, 200));
    }
  }

  if (ss().getId() === ORPHAN_TWIN_SPREADSHEET_ID) {
    return 'STOPPED. Orphan twin. Open the starred Master.';
  }

  step(1, 'Recover lost form submissions (blank cutoff, idempotent)', function () {
    return replayMissingSinceV20_1_('');
  });
  step(2, 'Skill matrix rebuild', function () {
    rebuildSkillMatrixV19_();
    return 'matrix rebuilt';
  });
  step(3, 'Engine health (confirm key column)', engineHealthCheck);
  step(4, 'Orphan Form Responses report (read-only)', freshStartReport);
  step(5, 'Health check', healthCheckV20_2);

  L.push('');
  L.push('NOT done here on purpose (needs a Drive copy of the workbook first):');
  L.push('  freshStartClean("CLEAN <copy name>")  — removes orphan Form Responses tabs');

  var msg = L.join('\n');
  systemLog_('WARN', 'ELITE ESTATE PART 2', SCEMS_VERSION);
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Menu wrapper: archive form copies with the required token after confirm. */
function archiveFormCopiesPrompt() {
  var ui = SpreadsheetApp.getUi();
  var n = formCopyInventoryV20_6_(true).length;
  var conf = ui.alert(
    'Archive backup form copies?',
    n + ' "Copy of …" SCEMS form(s) will be moved into an archive folder. ' +
    'Live forms are never touched. Nothing is deleted.\n\nContinue?',
    ui.ButtonSet.OK_CANCEL);
  if (conf !== ui.Button.OK) return 'Cancelled. Nothing was moved.';
  return archiveFormCopiesV20_6_('ARCHIVE FORM COPIES');
}

/** Menu wrapper: apply engine repair after confirm. */
function applyEngineRepairPrompt() {
  var ui = SpreadsheetApp.getUi();
  var preview = previewEngineRepairV20_6();
  var conf = ui.alert(
    'Repair the phase engine key column?',
    'Only column A of the engine tab is touched. Record tabs are not. Continue?',
    ui.ButtonSet.OK_CANCEL);
  if (conf !== ui.Button.OK) return 'Cancelled. Nothing was written.\n\n' + preview;
  return engineRepairV20_6_('REPAIR THE ENGINE KEY COLUMN');
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
    '14 ANALYTICS', '15 SKILL CATALOG', TAB.DECISIONS, TAB.ARCHIVE, TAB.LOG,
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
    TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.ENGINE, TAB.DECISIONS, TAB.LOG,
    TAB.SKILLS, TAB.CATALOG, TAB.SKILL_EVIDENCE,
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


/* ====================================================================== */
/**
 * SCEMS Field Training Tracker — 99_config
 *
 * Constants. Nothing here does anything.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Sumter County EMS : Field Training and Personnel Development System
 *   THE ONLY CONFIGURATION FILE. Exactly one CONFIG object exists in this
 *   project. It is frozen at load: nothing may mutate it at runtime.
 *   DELIVERY MODE IS NOT STORED HERE. Whether mail reaches real recipients
 *   is decided at send time by isLiveMode_() in 00_core.gs, which reads the
 *   SCEMS_LIVE_MODE script property on every call and fails safe to test
 *   mode. Editing this file can never change delivery mode, and delivery
 *   mode can never be changed by file load order again.
 *   goLive() / backToTestMode() / whichMode() live in 00_core.gs.
 */

var BADGE_B64 = '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';

/* ---- ported constant ---- */
var SEV_V19 = {
  OVERDUE:      { rank: 1, bg: '#c43a28', fg: '#ffffff' },
  BREACHED:     { rank: 1, bg: '#c43a28', fg: '#ffffff' },
  FLAG:         { rank: 2, bg: '#8f1f12', fg: '#ffffff' },
  'NOT STARTED':{ rank: 3, bg: '#c9a227', fg: '#1d1b18' },
  DUE:          { rank: 4, bg: '#f5df99', fg: '#6d5318' },
  SKILL:        { rank: 5, bg: '#3f6a94', fg: '#ffffff' },
  CLEAR:        { rank: 9, bg: '#3f8f5a', fg: '#ffffff' }
};

/* ---- ported constant ---- */
var TV = {
  INK: '#1d1b18', GOLD: '#c9a227', GOLDD: '#8a6a1f', GREEN: '#3f8f5a',
  RED: '#c43a28', BLUE: '#1f5673', MUTE: '#847d6d', HAIR: '#e8e4da'
};

/* ---- ported constant ---- */
var PANEL_FIRST_ROW_V19  = 11;

/* ---- ported constant ---- */
var PANEL_ROWS_V19       = 14;

/* ---- ported constant ---- */
var START_GRACE_DAYS_V19 = 7;

/* ---- ported constant ---- */
var QUEUE_REASONS_V19 = [
  'Evidence thresholds met, FTO recommendation accepted',
  'Observed directly by leadership, competency confirmed',
  'Evidence sufficient for level and phase',
  'Returned, needs more repetitions across separate shifts',
  'Returned, needs observation by a second FTO',
  'Returned, evidence note insufficient',
  'Revoked, safety concern documented',
  'Revoked, evidence no longer current'
];

/* [var EXPECTED_FORMS_V19 : moved to 99_config.gs — it derives from FORM_TITLES,

   which loads after this file; deriving it here was a load-order fault] */

/* ---- ported constant ---- */
var DIGEST_COPY_TO_V19 = '';

/* ---- ported constant ---- */
var SKILL_MATRIX_BACKUP_V19 = '05 SKILLS PROGRESS LEGACY V18';

/* ---- ported constant ---- */
// Column positions on 02 FTO SHIFT EVAL RAW, checked against the live header
// row. DOCISSUE is 28 — "Documentation Issue", which sat between CS Issue (27)
// and NRT (29) and was the one flag on that form nothing read. An FTO ticked
// it and the system did nothing at all: no alert, no queue row, no audit
// entry. It looked like it worked.
var EV = { FTO:1, TRAINEE:2, SHIFTDATE:6, STRENGTH:21, IMPROVE:22, REDFLAG:25,
           RFDETAIL:26, CS:27, DOCISSUE:28, NRT:29, PRIOR:30, NOTIMP:31,
           ADV:32, TOREV:33, CLIN:34 };

/* ---- ported constant ---- */
var SKILL_LABEL_V19 = 'skill name only, no SK number';

/* ---- ported constant ---- */
var HUB_ASSETS_FOLDER_V19 = 'SCEMS Hub Assets';

/* ---- ported constant ---- */
var PORTAL_FILE_V19 = 'portal';

/* ---- ported constant ---- */
var DUAL_SIGNOFF_LEVELS_V19 = ['Advanced EMT', 'Paramedic'];

/* ---- ported constant ---- */
var DUAL_SIGNOFF_LEVEL_V19 = 'Paramedic';

/* ---- ported constant ---- */
var DUAL_SIGNOFF_PHASE_V19 = 'Phase 4';

/* ---- ported constant ---- */
var DUAL_ROLE_TRAINING_V19 = 'Division Chief of Training';

/* ---- ported constant ---- */
var DUAL_ROLE_MEDICAL_V19  = 'Medical Director';

var OPERATIONAL_TABS_V19 = [
  'HOME',
  '01 TRAINEE MASTER',
  '04 URGENT CONCERNS RAW',
  '12 DECISION QUEUE',
  '23 TRAINEE SKILLS'
];

var SKILL_MATRIX_HEADERS_V19 = [
  'TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
  'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES',
  'DISTINCT FTOS','LAST OUTCOME','LAST CONTEXT','SIGNED BY','SIGNED DATE',
  'EXPIRATION','DECISION / EVIDENCE NOTE'
];

var SKILL_CATALOG_HEADERS_V19 = [
  'SKILL ID','DOMAIN','SKILL','EMT REQUIRED','AEMT REQUIRED','PARAMEDIC REQUIRED',
  'ACTIVE','ALLOWED CONTEXT','MIN SUCCESSFUL REPS','MIN INDEPENDENT REPS',
  'MIN DISTINCT DATES','MIN DISTINCT FTOS','SIGN-OFF AUTHORITY','STANDARD / SOURCE',
  'EFFECTIVE DATE','RETIRE DATE','APPROVAL STATUS'
];

var TRAINEE_VIEWS_V19 = [
  'Overview',
  'Skills completed',
  'Skills remaining',
  'Skills by phase',
  'Recent activity'
];

var SNOOZE_DAYS = 3;

var DOMAIN_NAMES = ['Assessment','Treatment','Communication','Documentation','Scene Leadership','Professionalism'];

var HUB_URL = 'https://sites.google.com/view/scemsfieldtraininghub/home';

var BACKUP_FOLDER = 'SCEMS Tracker Backups';

var SKILL_BURST_LIMIT_V20   = 6;

var SKILL_INFLATION_MIN_V20 = 10;

var SKILL_INFLATION_PCT_V20 = 0.9;

var KEEP_TOOLS_V19 = [
  'cleanupReportV19', 'auditResponseTabsV19', 'cleanResponseTabsV19',
  'checkEvidenceIntegrityV19', 'tidyForOperationsV19', 'showAllTabsV19',
  'checkAllFormsV19', 'checkRosterV19', 'checkProgressV19',
  'checkSupervisorRoutingV19', 'checkPhaseHandlingV19', 'checkReleaseGateV19',
  'auditDatesV19', 'auditSkillValidationsV19', 'whichModeV19',
  'refreshActionPanelV19', 'buildTraineeSkillsViewV19', 'previewRollupV19',
  'previewHandoverV19', 'previewSkillsFormV19'
];

var ONE_TIME_TOOLS_V19 = [
  { fn: 'traceLastEvalV19',        why: 'traced the first rejected submission' },
  { fn: 'skillEventStateV19',      why: 'traced the phase repair' },
  { fn: 'listSkillsFormFieldsV19', why: 'found the phase field name' },
  { fn: 'traceDigestV19',          why: 'found the digest routing fault' },
  { fn: 'previewRosterMoveV19',    why: 'previewed the roster move' },
  { fn: 'whereIsEverythingV19',    why: 'found the assets after the account mix-up' },
  { fn: 'diagnoseMenuButtonV19',   why: 'diagnosed the HOME menu box' },
  { fn: 'previewPhaseRepairV19',   why: 'previewed the phase repair' }
];

var SUPERSEDED_BLOCKS_V19 = [
  { marker: 'buildSkillEvidenceLogV19_', block: 'v19.0.5 / 19.0.6 / 19.0.7 validation purge',
    by: 'the GO-LIVE block v19.1.0 and later', note: 'keep only the newest copy' },
  { marker: 'fixPhaseQuestionV19', block: 'v19.5.0 phase handling',
    by: 'still current', note: 'keep' },
  { marker: 'previewSnapshotV19', block: 'v19.12.2 supervisor snapshot',
    by: 'v19.14.0 emails, complete', note: 'delete if v19.14.0 is present' },
  { marker: 'checkProjectionsV19', block: 'v19.13.0 roll-up with projections',
    by: 'v19.13.1 and then v19.14.0', note: 'delete, the projected date was dropped' },
  { marker: 'sendHandoverCardV19', block: 'v19.10.0 handover, plain text',
    by: 'v19.15.0 handover, HTML', note: 'delete the plain text one' }
];

var SCEMS_VERSION = 'v20.7.1';

var SCEMS_WRITER_VERSION = 'SCEMS v20.7.1';

var CONFIG = Object.freeze({

  // ---- Delivery recipients by role. Update here only. ----
  TEST_INBOX:        'craighunt913@gmail.com',
  TCO_EMAIL:         'kstuckey@sumtercountysc.gov',   // Division Chief of Training
  CHIEF_EMAIL:       'kehall@sumtercountysc.gov',     // Chief
  ACHIEF_EMAIL:      'jparnell@sumtercountysc.gov',   // Assistant Chief
  MD_EMAIL:          'leeturnermd@gmail.com',         // Medical Director
  SUPERVISOR_EMAILS: 'craighunt913@gmail.com',        // program copy
  FTO_PROGRAM_DIRECTOR: 'craighunt913@gmail.com',        // final decision authority for the FTO program
  BACKUP_EDITOR:     '',

  // ---- Human approvals recorded at v19 go-live. Historical record. ----
  GO_LIVE_APPROVED:             true,
  UAT_APPROVED:                 true,
  EXTERNAL_RECIPIENTS_APPROVED: true,

  // ---- Governing authorities stamped onto decisions and exports. ----
  POLICY_VERSION:            'SCEMS FTO Guide, rev 1.0, effective 07/2026',
  SKILL_STANDARD:            '2018 Sumter County EMS Protocols, Jimmy Lee Turner II, MD',
  RECORD_RETENTION_STANDARD: 'SCEMS General Orders, personnel training records retention'
});

/* Shift supervisor routing. Read by the supervisor digest and urgent-
 * concern mail. Name kept from v19 for call-site compatibility; this is
 * the single copy. Every recipient in the system lives in this file. */
var SHIFT_SUPERVISORS_V19 = {
  A: { name: 'K. Moye',     email: 'kmoye@sumtercountysc.gov',
       assistName: 'J. Head',   assist: 'jhead@sumtercountysc.gov' },
  B: { name: 'A. Wise',     email: 'awise@sumtercountysc.gov',
       assistName: '',          assist: '' },
  C: { name: 'J. Watson',   email: 'jwatson@sumtercountysc.gov',
       assistName: '',          assist: '' },
  D: { name: 'M. McLellan', email: 'mmclellan@sumtercountysc.gov',
       assistName: 'E. Osteen', assist: 'ethanallenosteen@gmail.com' }
};

/* ---- Canonical tab names. Never rename a live tab from code. ---- */
var TAB = Object.freeze({
  CONTROL: '00 README - CONTROL',
  MASTER:  '01 TRAINEE MASTER',
  EVAL:    '02 FTO SHIFT EVAL RAW',
  REFLECT: '03 SELF-REFLECTION RAW',
  URGENT:  '04 URGENT CONCERNS RAW',
  SKILLS:  '05 SKILLS PROGRESS',
  ENGINE:  '06 PHASE - STATUS ENGINE',
  WEEKLY:  '07 WEEKLY STATUS REPORT',
  QUEUE:   '12 DECISION QUEUE',
  ANALYTICS: '14 ANALYTICS',
  CATALOG: '15 SKILL CATALOG',
  DECISIONS: '16 DECISIONS RAW',
  ARCHIVE: '17 TRAINEE ARCHIVE',
  LOG:     '18 SYSTEM LOG',
  SKILL_EVIDENCE: '19 SKILL EVIDENCE LOG',
  SKILL_VALIDATION: '20 SKILL VALIDATION QUEUE',
  SKILL_SIGNOFF: '21 SKILL SIGN-OFF LOG',
  FTO_ROSTER: '22 FTO ROSTER',
  TRAINEE_SKILLS: '23 TRAINEE SKILLS',
  AUDIT: '13 AUDIT - EXCEPTION LOG',
  FTO_VIEW: '08 FTO VIEW',
  TRAINEE_VIEW: '09 TRAINEE VIEW',
  DASH: '10 TRAINING DIVISION DASH',
  MD_VIEW: '11 MEDICAL DIRECTOR VIEW',
  // v20.1 system tabs (created only by applyMigrationV20_1, never implicitly)
  REGISTRY: '90 PERSON REGISTRY',
  LEDGER:   '91 INGESTION LEDGER',
  ASSIGNMENTS: '92 ASSIGNMENT HISTORY',
  ACCESS:   '93 ACCESS LOG'
});

/* Legacy constant aliases retained because ~200 existing call sites and
 * operator habits reference them. Same values, single source. */





var TEST_PREFIX = 'ZZ TEST';

var LIVE_FLAG_KEY = 'SCEMS_LIVE_MODE';

/* ---- Form titles (identity of each form; URLs are never hard-coded) ---- */
var FORM_TITLES = Object.freeze({
  EVAL:      'SCEMS FTO Shift Evaluation',
  REFLECT:   'SCEMS Trainee Self-Reflection',
  URGENT:    'SCEMS Urgent Concern Report',
  DECISION:  'SCEMS Training Decision Record',
  SKILLS_COMBINED: 'SCEMS Skills Quick Log',
  SKILLS_EMT:  'SCEMS Skills Quick Log : EMT',
  SKILLS_AEMT: 'SCEMS Skills Quick Log : Advanced EMT',
  SKILLS_PMD:  'SCEMS Skills Quick Log : Paramedic',
  HANDOVER:  'SCEMS Trainee Handover Card'
});

/* Every form the estate is expected to contain. Derived here, in the same
 * file as FORM_TITLES, so no load-order dependency exists. */
var EXPECTED_FORMS_V19 = Object.keys(FORM_TITLES).map(function (k) { return FORM_TITLES[k]; });

var SKILL_FORM_TITLE_V19 = FORM_TITLES.SKILLS_COMBINED;

var HANDOVER_FORM_TITLE_V19 = FORM_TITLES.HANDOVER;

var SKILL_LEVELS_V20 = ['EMT', 'Advanced EMT', 'Paramedic'];

/* Portal cards, in display order. verifyPortalV20_1() derives its expected
 * link count from this list, never from a hard-coded number. */
var PORTAL_CARDS = Object.freeze([
  { key: 'EVAL',        role: 'Field Training Officer' },
  { key: 'SKILLS_EMT',  role: 'Field Training Officer' },
  { key: 'SKILLS_AEMT', role: 'Field Training Officer' },
  { key: 'SKILLS_PMD',  role: 'Field Training Officer' },
  { key: 'HANDOVER',    role: 'Field Training Officer : Covering' },
  { key: 'REFLECT',     role: 'Trainee' },
  { key: 'URGENT',      role: 'Anyone : Same shift' }
]);

/* ---- Sheet schemas: header row 4 on system tabs. Additive columns are
 * appended by migration; readers map by header name, never position. ---- */
var SKILL_EVIDENCE_HEADERS_V19 = [
  'EVENT ID','TIMESTAMP','SHIFT DATE','TRAINEE','LEVEL AT EVENT','PHASE','FTO',
  'SKILL ID','DOMAIN','SKILL','CONTEXT','STAGE','OUTCOME','PROMPTING',
  'CALL / SCENARIO REF','EVIDENCE NOTE','SOURCE FORM','SOURCE ROW',
  'VALIDATION RESULT','ATTESTATION'
];

var SKILL_EVIDENCE_V20_1_EXTRA = [
  'SOURCE FORM ID','SOURCE RESPONSE ID','WRITER VERSION','PERSON ID','ASSIGNMENT ID'
];

var SKILL_SIGNOFF_HEADERS_V19 = [
  'DECISION ID','TIMESTAMP','TRAINEE','SKILL ID','SKILL','DECISION','DECIDED BY',
  'DECISION DATE','EXPIRATION','RATIONALE','SOURCE QUEUE ROW',
  'STANDARD / CATALOG VERSION'
];

var SKILL_SIGNOFF_V20_1_EXTRA = [
  'REQUEST ID','SUPERSEDES','DECIDED BY PERSON ID','WRITER VERSION'
];

var SKILL_QUEUE_HEADERS_V19 = [
  'READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY',
  'DECISION','DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE',
  'RECORD STATUS','LAST EVIDENCE DATE'
];

var QUEUE_REVIEW_COL_V20 = 14;               // 'REVIEW' (v20.4)

var SKILL_QUEUE_V20_1_EXTRA = ['REQUEST ID','RECORD']; // cols 15, 16

var QUEUE_REQUEST_ID_COL_V20_1 = 15;

var QUEUE_RECORD_COL_V20_1 = 16;

var REGISTRY_HEADERS_V20_1 = [
  'PERSON ID','TYPE','DISPLAY NAME','NORMALIZED NAME','EMPLOYEE ID','EMAIL',
  'CERT LEVEL','SHIFT','TRAINS EMT','TRAINS AEMT','TRAINS PARAMEDIC',
  'ROLE','ACTIVE','SOURCE','CREATED','NOTES'
];

var LEDGER_HEADERS_V20_1 = [
  'LEDGER KEY','FORM ID','RESPONSE ID','FORM TITLE','KIND','RECEIVED AT',
  'STATE','DETAIL','EVENTS WRITTEN','PROCESSED AT','WRITER VERSION'
];

var ASSIGNMENT_HEADERS_V20_1 = [
  'ASSIGNMENT ID','PERSON ID','TRAINEE','LEVEL','ENTRY PROFILE','FTO',
  'FTO PERSON ID','PHASE','PHASE START','STATUS','OPENED','CLOSED','SOURCE','NOTES'
];

var ACCESS_HEADERS_V20_1 = [
  'ACCESS ID','TIMESTAMP','KIND','REQUESTED BY','VERIFIED EMAIL','AUTHORIZED',
  'SUBJECT','DELIVERED TO','REASON','DETAIL'
];

/* ---- Queue vocabulary (unchanged wording: governance-approved lists) ---- */
var QUEUE_DECISIONS_V19 = ['Approve sign-off', 'Return for more evidence', 'Revoke sign-off'];

var QUEUE_STATES_V20_1 = ['OPEN','RECORDED','RETURNED','REVOKED','SUPERSEDED','CANCELLED','FAILED'];

/* ---- Skills form field vocabulary (matches live forms; do not edit
 * without re-verifying against the built forms) ---- */
var SKILL_STAGE_COLUMNS_V19 = ['Observed','Assisted','Performed with coaching','Performed independently'];

var LAB_GRID_TITLE_V20 = 'Classroom or skills lab';

var LAB_REPS_TITLE_V20 = 'Classroom or skills lab : repetitions';

var REPS_SUFFIX_V20 = ' : repetitions';

var EV_ACCEPTED_V19 = 'ACCEPTED';

/* ---- Control-sheet dials (labels on 00 README - CONTROL col A) ---- */
var CONTROL_DIALS = Object.freeze({
  OVERDUE_DAYS: 'Overdue days threshold',
  TREND_DAYS: 'Trend window (days)',
  SCORE_STANDARD: 'Score standard',
  REFLECT_SILENCE: 'Reflection silence (days)',
  FLAG_LOOKBACK: 'Flag lookback (days)'
});

