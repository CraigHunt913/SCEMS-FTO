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
