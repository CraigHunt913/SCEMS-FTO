/**
 * Somebody left.
 *
 * A resignation is not a deletion. Everything that person did is still true:
 * the shifts they evaluated happened, the skills they signed off are signed
 * off, and the trainee whose Phase 1 they supervised was supervised by them.
 * Removing the row would not remove any of that - it would only remove the
 * one place that says who the name belongs to, and leave every record that
 * names them pointing at nobody.
 *
 * So this does not delete. It writes N in the ACTIVE column, which is what
 * that column is for, and from then on the rest of the portal reads it:
 *
 *   they cannot sign in, so a former employee is not opening personnel
 *   records
 *   they are not counted among the people who still need an address
 *   they are not offered as somebody to assign a trainee to
 *   their history stays exactly where it is, under their own name
 *
 * The one thing a resignation actually breaks is their trainees. An active
 * trainee whose ASSIGNED FTO has left appears on nobody's list, and nothing
 * looks wrong - the assignment is a perfectly valid name. This names them,
 * every time, and refuses to pretend that reassigning them is a decision it
 * can make.
 *
 * unretireFto() puts the column back to whatever it held before.
 */

var PORTAL_RETIRE_PROPERTY = 'PORTAL_RETIRE';
var PORTAL_RETIRE_LOG = 'PORTAL RETIRE LOG';

/** Who to retire. One name per entry; a semicolon between them.
 *
 *  A reason can follow a colon - "Alex White : resigned 2026-08-16" - and it
 *  is recorded, never guessed at. The property editor is a single-line field
 *  that eats pasted line breaks, so semicolons are the reliable separator and
 *  line breaks are accepted as well. */
function retireRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_RETIRE_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var text = String(piece).replace(/\s+/g, ' ').trim();
    if (!text) return;
    var reason = '';
    var at = text.indexOf(':');
    if (at > 0) { reason = text.slice(at + 1).trim(); text = text.slice(0, at).trim(); }
    var name = text.replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return;
    out.push({ name: name, reason: reason });
  });
  return out;
}

/** What is still attached to a name, so retiring is never a silent goodbye. */
function whatIsAttachedV1_(name) {
  var n = normNameV1_(name);
  var out = { activeTrainees: [], closedTrainees: [], rows: {} };

  try {
    traineesV1_().forEach(function (t) {
      if (normNameV1_(t.fto) !== n) return;
      (t.closed ? out.closedTrainees : out.activeTrainees).push(t.name);
    });
  } catch (e) {}

  // Anywhere their name stands in a column that means "who did this".
  [PORTAL.TAB.EVAL, PORTAL.TAB.EVIDENCE, PORTAL.TAB.SIGNOFF,
   PORTAL.TAB.URGENT, PORTAL.TAB.SKILLS].forEach(function (tabName) {
    var t;
    try { t = readTabAllV1_(tabName); } catch (e) { return; }
    if (!t || !t.ok) return;
    var count = 0;
    t.rows.forEach(function (r) {
      var who = pickV1_(t, r, ['FTO', 'FTO NAME', 'EVALUATOR', 'SIGNED OFF BY',
                               'SUBMITTED BY', 'YOUR NAME', 'VALIDATED BY']);
      if (who && normNameV1_(who) === n) count++;
    });
    if (count) out.rows[tabName] = count;
  });
  return out;
}

/** Every cell that would change. Reads; writes nothing. */
function retirePlanV1_() {
  var plan = { requests: retireRequestsV1_(), set: [], already: [], notFound: [],
               twoRows: [], problem: '', activeCol: '', nameCol: '' };

  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_RETIRE_PROPERTY + '.\n\n' +
      'Put the name exactly as it stands on the roster:\n' +
      '  Alex White\n\n' +
      'A reason after a colon is recorded:\n' +
      '  Alex White : resigned 2026-08-16\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  var nameCol = '', activeCol = '';
  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (!nameCol && t.col[h] !== undefined) nameCol = h; });
  ROSTER_ACTIVE_HEADERS_V1.forEach(function (h) {
    if (!activeCol && t.col[h] !== undefined) activeCol = h; });
  if (!nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }
  if (!activeCol) {
    plan.problem = PORTAL.TAB.ROSTER + ' has no ACTIVE column.\n\n' +
      'That column is the whole mechanism: it is what the rest of the portal\n' +
      'reads to know somebody has left. Add a column headed ACTIVE on row ' +
      PORTAL.HEADER_ROW + '\nand run this again. Nothing was changed.';
    return plan;
  }
  plan.nameCol = nameCol; plan.activeCol = activeCol;

  plan.requests.forEach(function (req) {
    var k = normNameV1_(req.name);

    // Whole name, never a fragment. This roster has an Alex White and a
    // Julieann White on it, and "White" matching both is exactly the kind of
    // convenience that ends a career by accident.
    var matches = [];
    t.rows.forEach(function (r, i) {
      var rn = String(r[t.col[nameCol]] || '').trim();
      if (rn && normNameV1_(rn) === k) {
        matches.push({ row: realRowV1_(t, i), name: rn,
                       was: String(r[t.col[activeCol]] == null ? '' : r[t.col[activeCol]]).trim() });
      }
    });

    if (!matches.length) { plan.notFound.push(req); return; }
    if (matches.length > 1) {
      plan.twoRows.push({ name: req.name, rows: matches.map(function (m) { return m.row; }) });
      return;
    }
    var m = matches[0];
    if (m.row < 0) {
      plan.notFound.push({ name: req.name, reason: req.reason,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (!rosterActiveV1_(m.was)) {
      plan.already.push({ name: m.name, row: m.row, was: m.was || '(blank)' });
      return;
    }
    plan.set.push({ name: m.name, row: m.row, was: m.was, reason: req.reason,
                    attached: whatIsAttachedV1_(m.name) });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture. Writes nothing. */
function retireBeforeAndAfter() {
  var p = retirePlanV1_();
  var L = ['RETIRING SOMEBODY OFF THE ROSTER  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  retireBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: retireFto()');
  return noteV1_(L.join('\n'));
}

/** The shared body of both reports. */
function retireBodyV1_(p, L, done) {
  p.set.forEach(function (s) {
    L.push((done ? 'RETIRED   ' : 'WOULD RETIRE   ') + s.name + '   row ' + s.row);
    L.push('  ' + p.activeCol + ' ' + (s.was ? '"' + s.was + '"' : '(blank)') + '  ->  N');
    if (s.reason) L.push('  Reason recorded: ' + s.reason);

    var a = s.attached;
    var kept = [];
    Object.keys(a.rows).forEach(function (tn) { kept.push(a.rows[tn] + ' in ' + tn); });
    if (a.closedTrainees.length) {
      kept.push(a.closedTrainees.length + ' closed trainee record(s): ' +
                a.closedTrainees.join(', '));
    }
    if (kept.length) {
      L.push('  Kept, untouched, under their own name:');
      kept.forEach(function (k) { L.push('    ' + k); });
    } else {
      L.push('  Nothing in this tracker is filed under their name.');
    }

    if (a.activeTrainees.length) {
      L.push('');
      L.push('  *** ' + a.activeTrainees.length + ' ACTIVE TRAINEE(S) ARE ASSIGNED TO THEM ***');
      a.activeTrainees.forEach(function (n) { L.push('      ' + n); });
      L.push('  Until the ASSIGNED FTO column on ' + PORTAL.TAB.MASTER + ' names');
      L.push('  somebody who is still here, those trainees appear on nobody\'s list');
      L.push('  and nothing looks wrong. Who takes them on is not a decision this');
      L.push('  can make. It has to be somebody\'s.');
    }
    L.push('');
  });

  if (p.already.length) {
    L.push('ALREADY MARKED AS GONE  (' + p.already.length + ')');
    p.already.forEach(function (a) {
      L.push('  ' + a.name + '   row ' + a.row + '   ' + p.activeCol + ' holds ' + a.was);
    });
    L.push('');
  }
  if (p.notFound.length) {
    L.push('NOT ON THE ROSTER  (' + p.notFound.length + ')');
    p.notFound.forEach(function (n) {
      L.push('  ' + n.name + (n.why ? '   ' + n.why : ''));
    });
    L.push('  The name has to match a roster row exactly. Check the spelling');
    L.push('  against ' + PORTAL.TAB.ROSTER + '.');
    L.push('');
  }
  if (p.twoRows.length) {
    L.push('MORE THAN ONE ROSTER ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      L.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
    L.push('  Which one left is not something to guess at.');
    L.push('');
  }
  return L;
}

/** Marks them as no longer here. One step. Undoable. */
function retireFto() {
  var p = retirePlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['SOMEBODY HAS LEFT THE ROSTER', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  if (!p.set.length) {
    L.push('Nothing was changed.');
    L.push('');
    retireBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var nameIdx = t.col[p.nameCol], activeIdx = t.col[p.activeCol];
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = [], refused = [];

  p.set.forEach(function (s) {
    // Read both cells again. The plan came from a cached read, and the row
    // this is about to change is identified by a name that had better still
    // be in it.
    var nameNow = String(sh.getRange(s.row, nameIdx + 1).getValue() || '').trim();
    if (normNameV1_(nameNow) !== normNameV1_(s.name)) {
      refused.push({ s: s, why: 'that row now holds "' + (nameNow || '(empty)') + '"' });
      return;
    }
    var activeNow = String(sh.getRange(s.row, activeIdx + 1).getValue() || '').trim();
    if (!rosterActiveV1_(activeNow)) {
      refused.push({ s: s, why: p.activeCol + ' already holds "' + activeNow + '"' });
      return;
    }
    // The ACTIVE column is very often a Y/N dropdown. If it refuses, that is
    // this person not being retired - it is not a reason to abandon the rest
    // and leave the ones already done recorded nowhere.
    try {
      sh.getRange(s.row, activeIdx + 1).setValue('N');
    } catch (e) {
      refused.push({ s: s, why: 'the sheet refused it - ' +
        (p.activeCol + ' is probably a dropdown that does not offer N. ' +
         'Add N to it, or type it in yourself') });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.ROSTER, s.row, p.activeCol, s.name,
                   activeNow, 'N', s.reason || '',
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    written.push(s);
  });

  writeRetireManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(written.length + ' marked as no longer here.');
  L.push('');
  retireBodyV1_({ set: written, already: p.already, notFound: p.notFound,
                  twoRows: p.twoRows, activeCol: p.activeCol }, L, true);

  if (refused.length) {
    L.push('NOT CHANGED  (' + refused.length + ')');
    refused.forEach(function (r) { L.push('  row ' + r.s.row + '   ' + r.why); });
    L.push('  Somebody edited those, and that outranks this.');
    L.push('');
  }

  if (written.length) {
    refreshDropdownsNoteV1_(L);
    L.push('');
    L.push('Nothing was deleted. Every row, every evaluation and every sign-off');
    L.push('is exactly where it was, under the name that earned it.');
    L.push('');
    L.push('Run START to see what is left over.');
    L.push('To put it back: unretireFto()');
  }
  return noteV1_(L.join('\n'));
}

function writeRetireManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_RETIRE_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RETIRE_LOG);
    sh.getRange(1, 1).setValue(
      'Who the portal marked as no longer here, and when. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 10)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'NAME', 'WAS', 'NOW', 'REASON',
                   'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
}

/** Puts the ACTIVE column back to what it held, where nobody has touched it. */
function unretireFto() {
  var t = readTabV1_(PORTAL_RETIRE_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('Nobody has been retired off the roster by this portal.');
  }

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: String(r[t.col['COLUMN']] || ''), name: String(r[t.col['NAME']] || ''),
               was: String(r[t.col['WAS']] || ''), now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nobody for the last run.');

  var book = targetBookV1_();
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var put = [], left = [];
  entries.forEach(function (e) {
    var ci = ros.col[e.col.toUpperCase()];
    var sh = book.getSheetByName(e.tab);
    if (ci === undefined || !sh) { left.push({ e: e, found: '(no such column)' }); return; }
    var now = String(sh.getRange(e.row, ci + 1).getValue() || '').trim();
    if (now.toUpperCase() !== String(e.now).toUpperCase()) {
      left.push({ e: e, found: now || '(empty)' });
      return;
    }
    sh.getRange(e.row, ci + 1).setValue(e.was);
    put.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['BACK ON THE ROSTER', '',
    put.length + ' put back to what they were on ' + last, ''];
  put.forEach(function (e) {
    L.push('  row ' + e.row + '   ' + e.name + '   ' + e.col + ' -> ' +
           (e.was || '(blank)'));
  });
  if (left.length) {
    L.push('');
    L.push('LEFT ALONE, changed since  (' + left.length + ')');
    left.forEach(function (l) {
      L.push('  row ' + l.e.row + '   ' + l.e.name + '   now holds ' + l.found);
    });
    L.push('  Somebody edited those by hand, and that outranks this.');
  }
  if (put.length) {
    L.push('');
    L.push('They can sign in again, and they are counted again.');
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function SOMEBODY_LEFT() { return retireFto(); }
function UNDO_SOMEBODY_LEFT() { return unretireFto(); }
