/**
 * Putting addresses on the roster.
 *
 * This is the second thing in this project that can write to a live
 * spreadsheet, and it is the more consequential of the two. An address in the
 * roster's EMAIL column is what lets the portal recognise someone. Put the
 * wrong one there and that person opens another person's trainees.
 *
 * So it works by NAME, not by row order. Pasting a column of addresses into a
 * sorted sheet is how they end up one row out, and one row out here means one
 * person seeing another's record with nothing to show anything went wrong.
 *
 * Three rules:
 *
 *   1. It never overwrites. A row that already has an address is skipped and
 *      reported. Changing one is a decision, and a decision is not a batch job.
 *   2. It refuses unless it can find exactly one roster row for a name. No row,
 *      or two rows, and that line is reported and left alone.
 *   3. Nothing is written until the whole plan has been shown and the code for
 *      that exact plan has been set, the same gate the form import uses.
 *
 * undoRosterEmails() blanks precisely the cells it filled, and only if each one
 * still holds what it put there.
 */

var PORTAL_ROSTER_EMAILS_PROPERTY = 'PORTAL_ROSTER_EMAILS';
var PORTAL_ROSTER_LOG = 'PORTAL ROSTER LOG';

/** The name-and-address lines pasted into the property.
 *
 *  "Dana Whitlock, dana@example.org" or "Whitlock, Dana <dana@example.org>"
 *  or a tab-separated row. Whatever is not the address is the name. */
function rosterEmailLinesV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ROSTER_EMAILS_PROPERTY) || '');
  var out = [];
  raw.split(/[\n\r]+/).forEach(function (line) {
    var found = String(line || '')
      .match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g);
    if (!found || !found.length) return;
    var email = found[0].toLowerCase();
    var name = String(line).split(found[0]).join(' ')
      .replace(/[,;<>()"'\t|]+/g, ' ').replace(/\s+/g, ' ').trim();
    name = name.split(' ').filter(function (w) { return w.length > 1; }).join(' ');
    if (!name) return;
    out.push({ name: name, email: email, extra: found.slice(1) });
  });
  return out;
}

/** What would change on the roster. Reads; writes nothing. */
function rosterEmailPlanV1_() {
  var plan = { set: [], hasOne: [], notFound: [], twoRows: [], twoLines: [],
               problem: '', emailCol: '', nameCol: '' };

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  var emailCol = '', nameCol = '';
  ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'].forEach(function (h) {
    if (!emailCol && t.col[h] !== undefined) emailCol = h; });
  ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'].forEach(function (h) {
    if (!nameCol && t.col[h] !== undefined) nameCol = h; });
  if (!nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }
  if (!emailCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no EMAIL column to write into.'; return plan; }
  plan.emailCol = emailCol; plan.nameCol = nameCol;

  var lines = rosterEmailLinesV1_();
  if (!lines.length) {
    plan.problem = 'Nothing is in ' + PORTAL_ROSTER_EMAILS_PROPERTY + '. One line ' +
      'per person, a name and an address on each:\n  Dana Whitlock, dana@example.org';
    return plan;
  }

  // two lines naming the same person is a question, not a merge
  var seenName = {};
  lines.forEach(function (l) {
    var k = normNameV1_(l.name);
    (seenName[k] = seenName[k] || []).push(l);
  });

  Object.keys(seenName).forEach(function (k) {
    var group = seenName[k];
    var name = group[0].name;

    if (group.length > 1) {
      plan.twoLines.push({ name: name,
        emails: group.map(function (g) { return g.email; }) });
      return;
    }
    var email = group[0].email;

    var matches = [];
    t.rows.forEach(function (r, i) {
      var rn = String(r[t.col[nameCol]] || '').trim();
      if (rn && normNameV1_(rn) === k) {
        matches.push({ row: realRowV1_(t, i), index: i, name: rn,
                       current: String(r[t.col[emailCol]] || '').trim() });
      }
    });

    if (!matches.length) { plan.notFound.push({ name: name, email: email }); return; }
    if (matches.length > 1) {
      plan.twoRows.push({ name: name, email: email,
        rows: matches.map(function (m) { return m.row; }) });
      return;
    }
    var m = matches[0];
    if (m.row < 0) {
      plan.notFound.push({ name: name, email: email,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (m.current) {
      plan.hasOne.push({ name: m.name, row: m.row, current: m.current, offered: email,
                         same: m.current.toLowerCase() === email });
      return;
    }
    plan.set.push({ name: m.name, row: m.row, email: email });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture, and the code that authorises it. Writes nothing. */
function rosterEmailsBeforeAndAfter() {
  var p = rosterEmailPlanV1_();
  var lines = ['ROSTER ADDRESSES, BEFORE AND AFTER  (nothing has been written)', '',
    'In : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];

  if (p.problem) { lines.push(p.problem); return noteV1_(lines.join('\n')); }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var blank = 0;
  t.rows.forEach(function (r) {
    var nm = String(r[t.col[p.nameCol]] || '').trim();
    var em = String(r[t.col[p.emailCol]] || '').trim();
    if (nm && !em) blank++;
  });

  lines.push('BEFORE');
  lines.push('  ' + t.rows.length + ' on the roster, ' + blank + ' with no address');
  lines.push('');
  lines.push('WOULD BE FILLED IN  (' + p.set.length + ')');
  p.set.forEach(function (s) {
    lines.push('  row ' + s.row + '   ' + s.name);
    lines.push('             ' + s.email);
  });

  if (p.hasOne.length) {
    lines.push('');
    lines.push('LEFT ALONE, they already have one  (' + p.hasOne.length + ')');
    p.hasOne.forEach(function (h) {
      lines.push('  ' + h.name + '   ' + h.current +
        (h.same ? '   same as offered' : '   OFFERED ' + h.offered + ' INSTEAD'));
    });
    if (p.hasOne.some(function (h) { return !h.same; })) {
      lines.push('  Nothing is overwritten. Changing an address means changing who');
      lines.push('  can open a record, so do those one at a time, by hand.');
    }
  }
  if (p.notFound.length) {
    lines.push('');
    lines.push('NOT ON THE ROSTER  (' + p.notFound.length + ')');
    p.notFound.forEach(function (n) {
      lines.push('  ' + n.name + '   ' + n.email + (n.why ? '   ' + n.why : ''));
    });
  }
  if (p.twoRows.length) {
    lines.push('');
    lines.push('MORE THAN ONE ROSTER ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      lines.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
  }
  if (p.twoLines.length) {
    lines.push('');
    lines.push('TWO LINES NAME THE SAME PERSON  (' + p.twoLines.length + ')');
    p.twoLines.forEach(function (d) {
      lines.push('  ' + d.name + '   ' + d.emails.join(', ') + '   left alone');
    });
  }

  lines.push('');
  lines.push('AFTER');
  lines.push('  ' + (blank - p.set.length) + ' would still have no address');
  lines.push('  no existing address would be changed or removed');
  lines.push('');
  lines.push('=======================================================');
  if (!p.set.length) {
    lines.push('There is nothing to fill in.');
    return noteV1_(lines.join('\n'));
  }
  lines.push('To do it, set the script property');
  lines.push('');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' + rosterConfirmCodeV1_(p));
  lines.push('');
  lines.push('and run applyRosterEmails().');
  lines.push('');
  lines.push('That code authorises exactly the ' + p.set.length + ' row(s) above.');
  lines.push('Change the list and the code changes with it.');
  return noteV1_(lines.join('\n'));
}

/** A code for this exact set of rows and addresses. */
function rosterConfirmCodeV1_(plan) {
  var parts = [safeTargetIdV1_(), PORTAL.TAB.ROSTER];
  plan.set.forEach(function (s) { parts.push(s.row + '=' + s.email); });
  return shortCodeV1_(parts.join('|'));
}

/** Fills in the blank EMAIL cells. Refuses without the code for this plan. */
function applyRosterEmails() {
  var p = rosterEmailPlanV1_();
  if (p.problem) return noteV1_(p.problem);
  if (!p.set.length) {
    return noteV1_('Nothing to fill in. Every name on the list either already ' +
      'has an address on the roster or is not on it. Run ' +
      'rosterEmailsBeforeAndAfter() to see which.');
  }

  var code = rosterConfirmCodeV1_(p);
  var id = requireImportAuthorityV1_(code);

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var col = t.col[p.emailCol] + 1;

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = 0, refused = [];

  p.set.forEach(function (s) {
    // read it again immediately before writing: the plan was built from a
    // cached read, and filling a cell that stopped being empty in between
    // would be an overwrite by accident
    var now = String(sh.getRange(s.row, col).getValue() || '').trim();
    if (now) { refused.push({ name: s.name, row: s.row, found: now }); return; }
    sh.getRange(s.row, col).setValue(s.email);
    manifest.push([stamp, PORTAL.TAB.ROSTER, s.row, p.emailCol, s.email, s.name,
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION, code]);
    written++;
  });

  writeRosterManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['ROSTER ADDRESSES ADDED', '',
    'In     : ' + safeTargetNameV1_(),
    'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), '',
    written + ' address(es) written into ' + PORTAL.TAB.ROSTER + ', column ' + p.emailCol, ''];
  manifest.forEach(function (m) { lines.push('  row ' + m[2] + '   ' + m[5] + '   ' + m[4]); });

  if (refused.length) {
    lines.push('');
    lines.push('NOT WRITTEN, the cell was no longer empty  (' + refused.length + ')');
    refused.forEach(function (r) { lines.push('  row ' + r.row + '   ' + r.name + '   holds ' + r.found); });
  }

  lines.push('');
  lines.push('No address already on the roster was changed or removed.');
  lines.push('');
  lines.push('These people can now be recognised when they open the portal.');
  lines.push('Check one: ask someone on this list to open it and say what they see.');
  lines.push('');
  lines.push('To reverse it: undoRosterEmails().');
  return noteV1_(lines.join('\n'));
}

function writeRosterManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ROSTER_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ROSTER_LOG);
    sh.getRange(1, 1).setValue(
      'What the portal wrote into the roster. Do not edit or sort this tab.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'EMAIL', 'NAME', 'BY', 'VERSION', 'CODE']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Blanks exactly the cells the last run filled, and only if each still holds
 *  what was put there. One that has been edited since is left alone and
 *  reported, because someone changing it by hand outranks this. */
function undoRosterEmails() {
  var t = readTabV1_(PORTAL_ROSTER_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('This portal has not written anything into the roster.');
  }

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];

  // The code that authorised writing these cells authorises emptying them
  // again. Anything else and you would have to go and find a code for work
  // that has already happened.
  var wroteWith = '';
  t.rows.forEach(function (r) {
    if (String(r[t.col['RUN']] || '') === last && t.col['CODE'] !== undefined) {
      wroteWith = String(r[t.col['CODE']] || '') || wroteWith;
    }
  });
  requireImportAuthorityV1_(wroteWith);

  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: String(r[t.col['COLUMN']] || ''), email: String(r[t.col['EMAIL']] || ''),
               name: String(r[t.col['NAME']] || '') };
    });
  if (!entries.length) return noteV1_('The log names no cells for the last run.');

  var book = targetBookV1_();
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var cleared = [], changed = [];
  entries.forEach(function (e) {
    var ci = ros.col[e.col.toUpperCase()];
    if (ci === undefined) { changed.push({ e: e, found: '(no such column)' }); return; }
    var sh = book.getSheetByName(e.tab);
    var now = String(sh.getRange(e.row, ci + 1).getValue() || '').trim();
    if (now.toLowerCase() !== e.email.toLowerCase()) {
      changed.push({ e: e, found: now || '(empty)' });
      return;
    }
    sh.getRange(e.row, ci + 1).setValue('');
    cleared.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['ROSTER ADDRESSES REVERSED', '',
    cleared.length + ' cell(s) emptied, the ones written on ' + last, ''];
  cleared.forEach(function (e) { lines.push('  row ' + e.row + '   ' + e.name); });
  if (changed.length) {
    lines.push('');
    lines.push('LEFT ALONE, changed since it was written  (' + changed.length + ')');
    changed.forEach(function (c) {
      lines.push('  row ' + c.e.row + '   ' + c.e.name + '   now holds ' + c.found);
    });
    lines.push('  Somebody edited these by hand, and that outranks anything here.');
  }
  return noteV1_(lines.join('\n'));
}
