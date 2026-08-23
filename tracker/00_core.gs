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
  try { MailApp.sendEmail(CONFIG.TCO_EMAIL, 'SCEMS : ' + purpose + ' was truncated', msg); } catch (e) {}
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
