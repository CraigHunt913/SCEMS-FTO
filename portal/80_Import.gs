/**
 * The one production write in this project, and the way back out of it.
 *
 * Everything else here refuses to touch the live tracker. This does not, and
 * that is the whole reason it lives in its own file with its own gate.
 *
 * WHAT IT DOES
 *   Appends form responses that never reached a tab. Additive only. It never
 *   edits a cell that already has a value, never deletes a row, never touches
 *   the trainee master, the validation queue, or any decision column.
 *
 * WHAT STOPS IT
 *   A script property whose value must be the id of the spreadsheet it is
 *   about to write to. Not "YES", not "true" - the id itself, typed by hand.
 *   A confirmation left over from the sandbox therefore cannot fire against
 *   production, because it names the wrong book.
 *
 * HOW IT COMES BACK OUT
 *   Every run writes a manifest to PORTAL BACKFILL LOG: which response went
 *   into which row, and what the sheet's row count was before and after.
 *   undoLastBackfill() re-reads each of those rows, checks it still carries
 *   the response id the manifest says it should, and removes only those. If
 *   one row does not match, nothing is deleted at all.
 */

var PORTAL_BACKFILL_CONFIRM = 'PORTAL_BACKFILL_CONFIRM';
var PORTAL_BACKFILL_LOG = 'PORTAL BACKFILL LOG';

/** The before picture. Writes nothing, in any mode, against any book.
 *  This is the thing to run first and to keep. */
function backfillBeforeAndAfter() {
  var plans = backfillPlanAllV1_().filter(function (p) {
    return p.missing.length || p.blocked.length || p.problem; });

  var lines = ['BEFORE AND AFTER  (nothing has been written)', '',
    'Target : ' + safeTargetNameV1_(),
    'Id     : ' + safeTargetIdV1_(),
    'Mode   : ' + safeModeV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'Google is not naming this account'),
    ''];

  if (!plans.length) {
    lines.push('Every response on every registered form is already in the tracker.');
    lines.push('There is nothing to import.');
    return noteV1_(lines.join('\n'));
  }

  plans.forEach(function (p) {
    lines.push('=======================================================');
    lines.push(p.title + '  (' + p.key + ')');
    lines.push('=======================================================');
    if (p.problem) { lines.push('CANNOT IMPORT: ' + p.problem); lines.push(''); return; }

    var t = readTabV1_(p.dest);
    lines.push('');
    lines.push('BEFORE');
    lines.push('  ' + p.dest + ' holds ' + t.rows.length + ' rows');
    lines.push('  ' + p.present + ' of the form\'s ' + p.total + ' responses are already among them');
    lines.push('');
    lines.push('WOULD BE ADDED  (' + p.missing.length + ' rows, appended at the bottom)');
    p.missing.forEach(function (m, i) {
      lines.push('  ' + (i + 1) + '.  ' + (m.at ? m.at.toDateString() : 'no date') +
                 '   response ' + m.id);
      t.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = m.row[ci];
        if (v === '' || v === undefined) return;
        lines.push('        ' + labelForV1_(h) + ': ' + String(v).replace(/\n/g, ' / '));
      });
    });

    if (p.blocked.length) {
      lines.push('');
      lines.push('WOULD BE REFUSED  (' + p.blocked.length + ')');
      p.blocked.forEach(function (b) {
        lines.push('  ' + b.id + '  ' + b.why);
        b.answers.forEach(function (a) { lines.push('        ' + a.question + ': ' + a.value); });
      });
    }

    lines.push('');
    lines.push('AFTER');
    lines.push('  ' + p.dest + ' would hold ' + (t.rows.length + p.missing.length) + ' rows');
    lines.push('  nothing already in it would be changed or removed');
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push('To do it, set the script property');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' + safeTargetIdV1_());
  lines.push('and run runBackfillForReal(). Anything else and it refuses.');
  return noteV1_(lines.join('\n'));
}

function safeTargetIdV1_() { try { return targetIdV1_(); } catch (e) { return '(not set)'; } }

/** The gate. The confirmation must name the book about to be written to. */
function requireImportAuthorityV1_() {
  var id = targetIdV1_();
  // Normalised the same way the target is, so pasting the spreadsheet's
  // address here works exactly as well as pasting its id.
  var confirm = spreadsheetIdFromV1_(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_BACKFILL_CONFIRM));

  if (!confirm) {
    throw new Error('Refusing to write. Set the script property ' +
      PORTAL_BACKFILL_CONFIRM + ' to ' + id + ' first. Run ' +
      'backfillBeforeAndAfter() to see exactly what this would do.');
  }
  if (confirm !== id) {
    throw new Error('Refusing to write. ' + PORTAL_BACKFILL_CONFIRM + ' names ' +
      confirm + ' but this portal is pointed at ' + id + '. A confirmation for ' +
      'one spreadsheet will not fire against another.');
  }
  return id;
}

/** Imports the responses that never reached a tab, for real.
 *
 *  Refuses unless the confirmation names this exact spreadsheet. Refuses if
 *  any response cannot be placed in full, because a half-imported record is
 *  worse than one still sitting in the form. */
function runBackfillForReal() {
  var id = requireImportAuthorityV1_();
  var plans = backfillPlanAllV1_();

  var blocked = plans.reduce(function (n, p) { return n + p.blocked.length; }, 0);
  if (blocked) {
    throw new Error('Refusing to write. ' + blocked + ' response(s) have answers ' +
      'with nowhere to go, and importing the rest would leave the record ' +
      'half done. Run backfillBeforeAndAfter() to see which, add the column ' +
      'they need, then run this again.');
  }
  var due = plans.reduce(function (n, p) { return n + p.missing.length; }, 0);
  if (!due) return noteV1_('Nothing to import. Every response is already in the tracker.');

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], report = ['BACKFILL COMPLETE', '',
    'Target : ' + safeTargetNameV1_(), 'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  plans.forEach(function (p) {
    if (p.problem || !p.missing.length) return;
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { report.push(p.title + ' : SKIPPED, ' + p.dest + ' is not there'); return; }

    var beforeRows = sh.getLastRow();
    p.missing.forEach(function (m) {
      sh.appendRow(m.row);
      manifest.push([stamp, p.dest, sh.getLastRow(), m.id, p.key,
                     whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    });
    var afterRows = sh.getLastRow();

    report.push(p.title);
    report.push('  tab            : ' + p.dest);
    report.push('  rows before    : ' + beforeRows);
    report.push('  rows added     : ' + p.missing.length);
    report.push('  rows after     : ' + afterRows);
    report.push('  added at rows  : ' + (beforeRows + 1) + ' to ' + afterRows);
    report.push('  response ids   : ' + p.missing.map(function (m) { return m.id; }).join(', '));
    report.push('');
  });

  writeManifestV1_(manifest);
  forgetTabsV1_();

  report.push('Nothing already in the tracker was changed or removed. Every row');
  report.push('added carries the form response id it came from, so running this');
  report.push('again adds nothing.');
  report.push('');
  report.push('To reverse it: undoLastBackfill(). It checks every row still');
  report.push('carries the id the manifest says before removing anything.');
  return noteV1_(report.join('\n'));
}

/** The rollback manifest. Its own tab, created if missing, appended to only. */
function writeManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_BACKFILL_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_BACKFILL_LOG);
    sh.getRange(1, 1).setValue(
      'Rollback manifest for imported form responses. Do not edit or sort this tab.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 7)
      .setValues([['RUN', 'TAB', 'ROW', 'RESPONSE ID', 'FORM', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

/** Removes exactly the rows the last run added, and only if every one of them
 *  still carries the response id the manifest recorded. One mismatch and
 *  nothing is deleted, because a shifted row means the manifest no longer
 *  describes the sheet and guessing is how records get destroyed. */
function undoLastBackfill() {
  requireImportAuthorityV1_();
  var t = readTabV1_(PORTAL_BACKFILL_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('No import has been run against this spreadsheet.');

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];

  var entries = t.rows.filter(function (r) {
    return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               id: String(r[t.col['RESPONSE ID']] || '') };
    });
  if (!entries.length) return noteV1_('The manifest names no rows for the last run.');

  // verify every single one before touching any of them
  var book = targetBookV1_(), problems = [];
  entries.forEach(function (e) {
    var dest = readTabV1_(e.tab);
    if (!dest.ok) { problems.push(e.tab + ' is not in this spreadsheet'); return; }
    var idCol = responseIdColumnV1_(dest);
    if (!idCol) { problems.push(e.tab + ' has no response id column any more'); return; }
    var sh = book.getSheetByName(e.tab);
    var actual = String(sh.getRange(e.row, dest.col[idCol.toUpperCase()] + 1).getValue() || '').trim();
    if (actual !== e.id) {
      problems.push(e.tab + ' row ' + e.row + ' holds "' + actual + '", the manifest says "' + e.id + '"');
    }
  });

  if (problems.length) {
    return noteV1_('NOTHING WAS DELETED\n\n' +
      'The sheet no longer matches the manifest, so the rows this would remove ' +
      'are not certainly the rows it added:\n\n  ' + problems.join('\n  ') +
      '\n\nRemove them by hand using the response ids in ' + PORTAL_BACKFILL_LOG + '.');
  }

  // bottom up, so deleting one does not move the next
  entries.sort(function (a, b) { return b.row - a.row; });
  entries.forEach(function (e) { book.getSheetByName(e.tab).deleteRow(e.row); });
  forgetTabsV1_();

  return noteV1_('REVERSED\n\n' + entries.length + ' row(s) removed, the exact rows ' +
    'the run of ' + last + ' added. Every one was checked against its response id ' +
    'first.\n\nThe responses are back to being only in the form, which is where they ' +
    'were before.');
}

/** Clears the confirmation, so the gate closes behind you. */
function lockBackfill() {
  PropertiesService.getScriptProperties().deleteProperty(PORTAL_BACKFILL_CONFIRM);
  return noteV1_('Import is locked again. ' + PORTAL_BACKFILL_CONFIRM +
    ' has been cleared and nothing can be written until it is set once more.');
}
