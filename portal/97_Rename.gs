/**
 * Someone changed their name.
 *
 * It happens, and in this system it is not a one-cell edit. A training
 * officer's name is written into the roster, into every trainee's ASSIGNED
 * FTO, into every evaluation, every skill logged, every sign-off. Change one
 * of them and the rest stop matching: her trainees quietly drop off her list,
 * because the portal pairs them to her by name.
 *
 * So this changes them together, or not at all.
 *
 * What it will do:
 *   Replace a cell whose whole value IS that person's name.
 *
 * What it will not do:
 *   Touch a cell that merely contains the name inside a longer piece of text.
 *   A narrative that mentions someone is a record of what was written, and
 *   nobody asked for their evaluations to be rewritten.
 *
 *   Touch a form-response tab. That is the archive of what a person actually
 *   typed and submitted. It is reported and left exactly as it is.
 *
 *   Touch the logs. Same reason.
 *
 * undoRename() puts every cell back, and only where it still holds what was
 * written into it.
 */

var PORTAL_RENAME_PROPERTY = 'PORTAL_RENAME';
var PORTAL_RENAME_LOG = 'PORTAL RENAME LOG';

/** The renames asked for. "Harley Pack -> Harley Simms", and if there is more
 *  than one, a semicolon between them. The arrow may be -> or to. */
function renamePairsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_RENAME_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var m = String(piece).split(/\s*(?:->|=>|-->)\s*/);
    if (m.length !== 2) return;
    var from = m[0].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    var to   = m[1].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!from || !to || normNameV1_(from) === normNameV1_(to)) return;
    out.push({ from: from, to: to });
  });
  return out;
}

/** Tabs a rename may change. Not the logs, and not a form-response tab. */
function renameableTabsV1_() {
  var skip = [PORTAL.TAB.AUDIT, PORTAL_BACKFILL_LOG, PORTAL_ROSTER_LOG, PORTAL_RENAME_LOG];
  var tabs = Object.keys(PORTAL.TAB).map(function (k) { return PORTAL.TAB[k]; })
    .filter(function (n) { return skip.indexOf(n) < 0; });
  // Settlements are judgments keyed by trainee name — they must follow a rename
  // or Settle raises settled pairs again under the new spelling.
  if (typeof PORTAL_SETTLEMENTS_TAB === 'string' && tabs.indexOf(PORTAL_SETTLEMENTS_TAB) < 0) {
    tabs.push(PORTAL_SETTLEMENTS_TAB);
  }
  return tabs;
}

/** Every cell that would change, and every mention that would not. Reads. */
function renamePlanV1_() {
  var plan = { pairs: renamePairsV1_(), cells: [], mentions: [], responses: [], problem: '' };
  if (!plan.pairs.length) {
    plan.problem = 'Nothing is in ' + PORTAL_RENAME_PROPERTY + '.\n\n' +
      'Put the old name, an arrow, and the new one:\n' +
      '  Harley Pack -> Harley Simms\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  renameableTabsV1_().forEach(function (tabName) {
    var t = readTabV1_(tabName);
    if (!t.ok) return;
    t.rows.forEach(function (r, i) {
      var row = realRowV1_(t, i);
      t.headers.forEach(function (h, ci) {
        var v = r[ci];
        if (v === '' || v === null || v === undefined) return;
        if (v instanceof Date) return;
        var s = String(v);
        plan.pairs.forEach(function (pair) {
          if (normNameV1_(s) === normNameV1_(pair.from)) {
            if (row < 0) return;                      // a row from another book
            plan.cells.push({ tab: tabName, row: row, col: ci + 1,
              header: h || ('column ' + (ci + 1)), was: s, now: pair.to });
          } else if (s.length > pair.from.length &&
                     s.toLowerCase().indexOf(pair.from.toLowerCase()) >= 0) {
            plan.mentions.push({ tab: tabName, row: row, header: h || ('column ' + (ci + 1)),
              text: s.length > 90 ? s.slice(0, 90) + '...' : s });
          }
        });
      });
    });
  });

  try {
    formResponseTabsV1_().forEach(function (t) {
      t.rows.forEach(function (r) {
        r.forEach(function (v) {
          if (v === '' || v === null || v === undefined || v instanceof Date) return;
          plan.pairs.forEach(function (pair) {
            if (normNameV1_(String(v)) === normNameV1_(pair.from)) {
              plan.responses.push({ tab: t.name, was: String(v) });
            }
          });
        });
      });
    });
  } catch (e) {}

  plan.cells.sort(renameOrderV1_);
  return plan;
}

/** The order the cells must be written in, which is not alphabetical.
 *
 *  The ASSIGNED FTO column on the trainee master is a dropdown, and its list
 *  of allowed names comes from the roster. Write the master first and Google
 *  rejects the new name outright, because at that instant the roster has
 *  never heard of her: "the data you entered violates the data validation
 *  rules set on this cell".
 *
 *  The tabs are numbered, so sorting by name put "01 TRAINEE MASTER" first
 *  and "22 FTO ROSTER" last - exactly the wrong way round. The roster is
 *  where a name is defined; everything else refers to it, so the roster goes
 *  first and the rest follow it. */
function renameOrderV1_(a, b) {
  var ra = a.tab === PORTAL.TAB.ROSTER ? 0 : 1;
  var rb = b.tab === PORTAL.TAB.ROSTER ? 0 : 1;
  if (ra !== rb) return ra - rb;
  if (a.tab !== b.tab) return a.tab < b.tab ? -1 : 1;
  return a.row - b.row;
}

/** Why a cell might have refused a perfectly good name.
 *
 *  A dropdown built from a range can be satisfied by fixing the range. A
 *  dropdown built from a typed-out list cannot, and needs a person. Saying
 *  which is the difference between a fixable problem and a mystery. */
function validationReasonV1_(sh, row, col) {
  try {
    var rule = sh.getRange(row, col).getDataValidation();
    if (!rule) return 'the sheet refused the value, and there is no dropdown on that cell';
    var type = String(rule.getCriteriaType());
    var vals = rule.getCriteriaValues() || [];
    if (type === 'VALUE_IN_RANGE' && vals[0] && vals[0].getA1Notation) {
      return 'that cell is a dropdown fed by ' + vals[0].getA1Notation() +
             ', and the new name is not in it yet';
    }
    if (type === 'VALUE_IN_LIST') {
      return 'that cell is a dropdown with a typed-out list of names. Add the ' +
             'new name to it (Data > Data validation) and run this again';
    }
    return 'a data validation rule on that cell (' + type + ') refused the value';
  } catch (e) {
    return 'the sheet refused the value';
  }
}

/** Changes the name everywhere it stands alone. One step. Undoable. */
function applyRename() {
  var p = renamePlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = [];
  function say(s) { L.push(s === undefined ? '' : s); }

  say('NAME CHANGED');
  say();
  p.pairs.forEach(function (pair) { say('  ' + pair.from + '   ->   ' + pair.to); });
  say();
  say('In : ' + safeTargetNameV1_());
  say();

  if (!p.cells.length) {
    say('Nothing in this spreadsheet holds that name on its own, so nothing');
    say('was changed. Check the spelling against the roster.');
    return noteV1_(L.join('\n'));
  }

  var book = targetBookV1_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], done = 0, skipped = [], byTab = {};

  // One cell refusing must not abandon the run halfway with the ones already
  // changed written down nowhere. That is what happened the first time this
  // met a dropdown: it threw on the third cell, the manifest is written after
  // the loop, so two cells had been changed and undoRename had no record of
  // either. A half-applied rename that cannot be reversed is worse than one
  // that fails outright. So every cell is attempted, every refusal is
  // reported, and what did go in is always recorded.
  var refused = [];

  p.cells.forEach(function (c) {
    var sh = book.getSheetByName(c.tab);
    if (!sh) { skipped.push({ c: c, why: 'that tab is not here any more' }); return; }
    // read it again: the plan came from a cached read
    var now;
    try { now = String(sh.getRange(c.row, c.col).getValue() || ''); }
    catch (e) { refused.push({ c: c, why: 'that cell could not be read' }); return; }
    if (normNameV1_(now) !== normNameV1_(c.was)) {
      skipped.push({ c: c, why: 'it now holds "' + now + '"' });
      return;
    }
    try {
      sh.getRange(c.row, c.col).setValue(c.now);
    } catch (e) {
      refused.push({ c: c, why: validationReasonV1_(sh, c.row, c.col) });
      return;
    }
    manifest.push([stamp, c.tab, c.row, c.col, c.header, c.was, c.now,
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    byTab[c.tab] = (byTab[c.tab] || 0) + 1;
    done++;
  });

  // Always, even when something refused. Especially when something refused.
  writeRenameManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  say(done + ' cell(s) changed:');
  Object.keys(byTab).forEach(function (t) { say('  ' + byTab[t] + '   ' + t); });

  if (refused.length) {
    say();
    say('THE SHEET REFUSED  (' + refused.length + ')');
    refused.forEach(function (r) {
      say('  ' + r.c.tab + ' row ' + r.c.row + ', ' + labelForV1_(r.c.header));
      say('      ' + r.why);
    });
    say();
    say('  Those cells still say "' + p.pairs[0].from + '". The rest of the change');
    say('  DID go in and is recorded, so undoRename() will reverse exactly what');
    say('  was written and nothing else.');
    say();
    say('  This leaves the name inconsistent, which is the thing this function');
    say('  exists to prevent. Either fix the dropdown and run applyRename()');
    say('  again, or run undoRename() and put it all back until you can.');
  }

  if (skipped.length) {
    say();
    say('LEFT ALONE  (' + skipped.length + ')');
    skipped.forEach(function (s) { say('  ' + s.c.tab + ' row ' + s.c.row + '   ' + s.why); });
  }

  if (p.mentions.length) {
    say();
    say('MENTIONED INSIDE SOMETHING WRITTEN, and not touched  (' + p.mentions.length + ')');
    p.mentions.slice(0, 12).forEach(function (m) {
      say('  ' + m.tab + ' row ' + m.row + ', ' + labelForV1_(m.header));
      say('      ' + m.text);
    });
    if (p.mentions.length > 12) say('  ... and ' + (p.mentions.length - 12) + ' more');
    say('  Somebody wrote those. Rewriting an evaluation is not a rename.');
  }

  if (p.responses.length) {
    say();
    say('IN THE FORM RESPONSES, and not touched  (' + p.responses.length + ')');
    say('  That is the record of what people actually typed and submitted.');
  }

  say();
  rebuiltNoteV1_(L);
  refreshDropdownsNoteV1_(L);
  say();
  say('The portal matches trainees to their training officer by name, so this');
  say('had to change everywhere at once or her trainees would have dropped off');
  say('her list. Run START to check nothing is left over.');
  say();
  say('To put it back: undoRename()');
  return noteV1_(L.join('\n'));
}

function writeRenameManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_RENAME_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RENAME_LOG);
    sh.getRange(1, 1).setValue('Every cell the portal changed in a rename. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COL', 'HEADER', 'WAS', 'NOW', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Puts every cell back, where it still holds what the rename wrote. */
function undoRename() {
  var t = readTabV1_(PORTAL_RENAME_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('No rename has been run against this spreadsheet.');

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: Number(r[t.col['COL']]), was: String(r[t.col['WAS']] || ''),
               now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names no cells for the last rename.');

  // Putting it back needs the same order that putting it in did, and for the
  // same reason: the old name has to be on the roster again before the
  // dropdown will accept it anywhere else. So the roster goes first, the
  // dropdown is rebuilt from it, and everything that refers to it follows.
  entries.sort(function (a, b) {
    var ra = a.tab === PORTAL.TAB.ROSTER ? 0 : 1;
    var rb = b.tab === PORTAL.TAB.ROSTER ? 0 : 1;
    return ra !== rb ? ra - rb : a.row - b.row;
  });

  var book = targetBookV1_(), put = 0, left = [], rebuilt = false;
  entries.forEach(function (e) {
    if (!rebuilt && e.tab !== PORTAL.TAB.ROSTER) {
      // every roster cell that was going back has gone back by now
      forgetTabsV1_(); PEOPLE_CACHE_V1 = null;
      try { rebuildFtoDropdownV1_(); } catch (err) {}
      rebuilt = true;
    }
    var sh = book.getSheetByName(e.tab);
    if (!sh) { left.push({ e: e, found: '(tab gone)' }); return; }
    var now;
    try { now = String(sh.getRange(e.row, e.col).getValue() || ''); }
    catch (err) { left.push({ e: e, found: '(could not read it)' }); return; }
    if (normNameV1_(now) !== normNameV1_(e.now)) { left.push({ e: e, found: now || '(empty)' }); return; }
    // A refusal here is the dropdown, not a person, and it must not abandon
    // the run: an undo that stops halfway is worse than the state it is undoing.
    try { sh.getRange(e.row, e.col).setValue(e.was); }
    catch (err) {
      left.push({ e: e, found: 'the sheet refused "' + e.was + '" - ' +
        validationReasonV1_(sh, e.row, e.col) });
      return;
    }
    put++;
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['RENAME REVERSED', '', put + ' cell(s) put back to what they were on ' + last, ''];
  if (left.length) {
    lines.push('LEFT ALONE  (' + left.length + ')');
    left.forEach(function (l) {
      lines.push('  ' + l.e.tab + ' row ' + l.e.row + '   ' + l.found);
    });
    lines.push('  A cell somebody edited by hand outranks this. A cell the sheet');
    lines.push('  refused is a dropdown that no longer offers the old name.');
  }
  return noteV1_(lines.join('\n'));
}

/** Named for the job. */
function FIX_A_NAME() { return applyRename(); }
function UNDO_A_NAME() { return undoRename(); }
