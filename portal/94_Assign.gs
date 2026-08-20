/**
 * Who trains whom.
 *
 * The ASSIGNED FTO column on the trainee master is a dropdown, and the list
 * inside it is a fixed list of names typed in at some point in the past. It
 * does not follow the roster. So every time the roster changes, that dropdown
 * quietly becomes wrong, and the sheet starts refusing names that are now
 * perfectly correct:
 *
 *   "The data you entered in cell E10 violates the data validation rules"
 *
 * That single stale list is what stopped Harley Simms being written, and what
 * would have stopped Chyna Gray. It is also, indirectly, how a whole sentence
 * of the dropdown's own help text ended up in a trainee's cell.
 *
 * So this rebuilds the list from the roster before writing anything into it.
 * The dropdown becomes what it always should have been: the people who
 * actually work here, and nobody else.
 *
 * Every roster change in this project now rebuilds it too - a rename, a
 * retirement, somebody joining - so it cannot go stale again.
 *
 * What it will not do:
 *   Offer somebody who has left. That is the point of rebuilding it.
 *   Write an assignment to an officer who is not on the active roster.
 *   Guess between two people with the same name.
 */

var PORTAL_ASSIGN_PROPERTY = 'PORTAL_ASSIGN';
var PORTAL_ASSIGN_LOG = 'PORTAL ASSIGNMENT LOG';

/** The ASSIGNED FTO column on the trainee master, or null. */
function assignColumnV1_() {
  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) return null;
  var header = '';
  ['ASSIGNED FTO', 'TRAINING OFFICER', 'FTO'].forEach(function (h) {
    if (!header && t.col[h] !== undefined) header = h; });
  if (!header) return null;
  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.MASTER);
  if (!sh) return null;
  return { tab: t, sheet: sh, header: header, col: t.col[header] + 1 };
}

/** Puts the active roster into the ASSIGNED FTO dropdown.
 *
 *  Returns { ok, names, was, why }. It reads the old rule first so the report
 *  can say what it replaced, and so undoAssignDropdown() can put it back. */
function rebuildFtoDropdownV1_() {
  var c = assignColumnV1_();
  if (!c) return { ok: false, names: [], was: null, why: 'no ASSIGNED FTO column' };

  var names = [];
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      if (p.name && names.indexOf(p.name) < 0) names.push(p.name); });
  } catch (e) { return { ok: false, names: [], was: null, why: String(e.message || e) }; }
  if (!names.length) return { ok: false, names: [], was: null, why: 'the roster names nobody' };
  names.sort();

  var firstRow = c.tab.firstDataRow;
  var lastRow = Math.max(c.sheet.getMaxRows ? c.sheet.getMaxRows() : c.sheet.getLastRow(),
                         c.sheet.getLastRow(), firstRow);
  var nRows = Math.max(lastRow - firstRow + 1, 1);

  // what it held before, so the report can say what changed
  var was = null;
  try {
    var old = c.sheet.getRange(firstRow, c.col).getDataValidation();
    if (old) {
      var vals = old.getCriteriaValues() || [];
      was = { type: String(old.getCriteriaType()),
              list: (vals[0] && vals[0].slice) ? vals[0].slice() : [] };
    }
  } catch (e) {}

  try {
    c.sheet.getRange(firstRow, c.col, nRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList([''].concat(names), true)
        .setAllowInvalid(false)
        .setHelpText('Pick a training officer.')
        .build());
  } catch (e) {
    return { ok: false, names: names, was: was, why: String(e.message || e) };
  }
  return { ok: true, names: names, was: was, why: '', header: c.header, col: c.col };
}

/** Rebuilds it and says what happened, on its own. */
function fixFtoDropdown() {
  var r = rebuildFtoDropdownV1_();
  if (!r.ok) {
    return noteV1_('Could not rebuild the ASSIGNED FTO dropdown: ' + r.why +
      '\n\nNothing was changed.');
  }
  var L = ['THE ASSIGNED FTO DROPDOWN NOW MATCHES THE ROSTER', '',
    'In : ' + safeTargetNameV1_(), '',
    r.names.length + ' name(s) in it, everybody on the roster who still works here:'];
  r.names.forEach(function (n) { L.push('  ' + n); });
  if (r.was && r.was.list && r.was.list.length) {
    var gone = r.was.list.filter(function (n) {
      return n && r.names.indexOf(String(n)) < 0; });
    var added = r.names.filter(function (n) {
      return r.was.list.map(String).indexOf(n) < 0; });
    if (added.length) { L.push(''); L.push('Added: ' + added.join(', ')); }
    if (gone.length) {
      L.push('');
      L.push('No longer offered: ' + gone.map(String).join(', '));
      L.push('  Nobody\'s existing assignment was changed. A trainee still');
      L.push('  assigned to one of these appears on the Division screen under');
      L.push('  "On nobody\'s list".');
    }
    if (!added.length && !gone.length) { L.push(''); L.push('It was already correct.'); }
  }
  L.push('');
  L.push('This list was a fixed one, typed in at some point, that did not follow');
  L.push('the roster. That is what refused Harley Simms. Every roster change in');
  L.push('this portal rebuilds it now, so it cannot go stale again.');
  return noteV1_(L.join('\n'));
}

/* ---------------------------------------------------------------- *
 *  Assigning a trainee to an officer
 * ---------------------------------------------------------------- */

/** "Latavia Cole -> Chyna Gray", semicolons between several. */
function assignRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ASSIGN_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var m = String(piece).split(/\s*(?:->|=>|-->|:)\s*/);
    if (m.length !== 2) return;
    var who = m[0].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    var fto = m[1].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!who || !fto) return;
    out.push({ trainee: who, fto: fto });
  });
  return out;
}

function assignPlanV1_() {
  var plan = { set: [], same: [], noTrainee: [], noFto: [], twoRows: [], problem: '',
               header: '' };
  plan.requests = assignRequestsV1_();
  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_ASSIGN_PROPERTY + '.\n\n' +
      'The trainee, an arrow, and their training officer:\n' +
      '  Latavia Cole -> Chyna Gray\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var c = assignColumnV1_();
  if (!c) {
    plan.problem = PORTAL.TAB.MASTER + ' has no ASSIGNED FTO column.';
    return plan;
  }
  plan.header = c.header;

  var t = c.tab;
  var active = rosterActivePeopleV1_();

  plan.requests.forEach(function (req) {
    var tn = normNameV1_(req.trainee);
    var rows = [];
    t.rows.forEach(function (r, i) {
      if (normNameV1_(r[t.col['TRAINEE']]) === tn) {
        rows.push({ row: realRowV1_(t, i),
                    now: String(r[t.col[c.header]] == null ? '' : r[t.col[c.header]]).trim() });
      }
    });
    if (!rows.length) { plan.noTrainee.push(req); return; }
    if (rows.length > 1) {
      plan.twoRows.push({ name: req.trainee,
        rows: rows.map(function (x) { return x.row; }) });
      return;
    }

    // The officer has to be somebody who works here. Writing a name the
    // roster does not have is how a trainee ends up on nobody's list, which
    // is the exact thing this is for.
    var fn = normNameV1_(req.fto);
    var hits = active.filter(function (p) { return p.norm === fn; });
    if (!hits.length) { plan.noFto.push(req); return; }
    if (hits.length > 1) {
      plan.twoRows.push({ name: req.fto,
        rows: hits.map(function (p) { return p.row; }) });
      return;
    }

    var row = rows[0];
    if (row.row < 0) {
      plan.noTrainee.push({ trainee: req.trainee, fto: req.fto,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (normNameV1_(row.now) === fn) {
      plan.same.push({ trainee: req.trainee, fto: hits[0].name, row: row.row });
      return;
    }
    plan.set.push({ trainee: req.trainee, fto: hits[0].name, row: row.row, was: row.now });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture. Writes nothing. */
function assignBeforeAndAfter() {
  var p = assignPlanV1_();
  var L = ['ASSIGNING TRAINEES  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  assignBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: assignFto()');
  return noteV1_(L.join('\n'));
}

function assignBodyV1_(p, L, done) {
  p.set.forEach(function (s) {
    L.push((done ? 'ASSIGNED   ' : 'WOULD ASSIGN   ') + s.trainee + '   ->   ' + s.fto);
    L.push('  row ' + s.row + ', ' + p.header + ' was ' +
           (s.was ? '"' + (s.was.length > 60 ? s.was.slice(0, 60) + '...' : s.was) + '"'
                  : '(blank)'));
    L.push('');
  });
  if (p.same.length) {
    L.push('ALREADY ASSIGNED THAT WAY  (' + p.same.length + ')');
    p.same.forEach(function (s) { L.push('  ' + s.trainee + '   ->   ' + s.fto); });
    L.push('');
  }
  if (p.noTrainee.length) {
    L.push('NO SUCH TRAINEE  (' + p.noTrainee.length + ')');
    p.noTrainee.forEach(function (r) {
      L.push('  ' + r.trainee + (r.why ? '   ' + r.why : ''));
    });
    L.push('  The name has to match ' + PORTAL.TAB.MASTER + ' exactly.');
    L.push('');
  }
  if (p.noFto.length) {
    L.push('NOT ON THE ACTIVE ROSTER  (' + p.noFto.length + ')');
    p.noFto.forEach(function (r) { L.push('  ' + r.fto + '   for ' + r.trainee); });
    L.push('  Assigning somebody the roster does not have is how a trainee ends');
    L.push('  up on nobody\'s list, which is what this exists to prevent. If they');
    L.push('  are new, set ' + PORTAL_ADD_FTO_PROPERTY + ' and run addFto first.');
    L.push('');
  }
  if (p.twoRows.length) {
    L.push('MORE THAN ONE ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      L.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
    L.push('');
  }
  return L;
}

/** Rebuilds the dropdown from the roster, then writes the assignments. */
function assignFto() {
  var p = assignPlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['WHO TRAINS WHOM', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  // First, so the sheet will actually accept the names about to be written.
  var d = rebuildFtoDropdownV1_();
  if (d.ok) {
    L.push('The ASSIGNED FTO dropdown was rebuilt from the roster first: ' +
           d.names.length + ' name(s).');
    L.push('');
  } else if (p.set.length) {
    L.push('Could not rebuild the ASSIGNED FTO dropdown (' + d.why + '), so the');
    L.push('sheet may refuse a name it should accept. Anything refused is');
    L.push('reported below and nothing is left half-written.');
    L.push('');
  }

  if (!p.set.length) {
    L.push('Nothing was changed.');
    L.push('');
    assignBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var c = assignColumnV1_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = [], refused = [];

  p.set.forEach(function (s) {
    try {
      c.sheet.getRange(s.row, c.col).setValue(s.fto);
    } catch (e) {
      refused.push({ s: s, why: validationReasonV1_(c.sheet, s.row, c.col) });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.MASTER, s.row, c.header, s.trainee,
                   s.was, s.fto, whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    written.push(s);
  });

  writeAssignManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(written.length + ' assignment(s) written.');
  L.push('');
  assignBodyV1_({ set: written, same: p.same, noTrainee: p.noTrainee, noFto: p.noFto,
                  twoRows: p.twoRows, header: p.header }, L, true);

  if (refused.length) {
    L.push('THE SHEET REFUSED  (' + refused.length + ')');
    refused.forEach(function (r) {
      L.push('  ' + r.s.trainee + '   ' + r.why);
    });
    L.push('  Those trainees stay where they were, and the Division screen still');
    L.push('  shows them under "On nobody\'s list" if that is where they were.');
    L.push('');
  }

  if (written.length) {
    L.push('Those trainees now appear on their officer\'s screen. Run START to');
    L.push('check nothing is left over.');
    L.push('');
    L.push('To reverse it: undoAssign()');
  }
  return noteV1_(L.join('\n'));
}

function writeAssignManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ASSIGN_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ASSIGN_LOG);
    sh.getRange(1, 1).setValue(
      'Assignments the portal wrote. Do not edit or sort.').setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'TRAINEE', 'WAS', 'NOW', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Puts the last run's assignments back to what they were. */
function undoAssign() {
  var t = readTabV1_(PORTAL_ASSIGN_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('This portal has written no assignments.');
  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { row: Number(r[t.col['ROW']]), trainee: String(r[t.col['TRAINEE']] || ''),
               was: String(r[t.col['WAS']] || ''), now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nothing for the last run.');

  var c = assignColumnV1_();
  if (!c) return noteV1_(PORTAL.TAB.MASTER + ' has no ASSIGNED FTO column.');

  var put = [], left = [];
  entries.forEach(function (e) {
    var now = String(c.sheet.getRange(e.row, c.col).getValue() || '').trim();
    if (normNameV1_(now) !== normNameV1_(e.now)) {
      left.push({ e: e, found: now || '(empty)' });
      return;
    }
    try { c.sheet.getRange(e.row, c.col).setValue(e.was); }
    catch (err) {
      // Putting back what was there can itself be refused: the old value may
      // be a name the rebuilt dropdown no longer offers, which is often the
      // whole reason it was changed.
      left.push({ e: e, found: 'the sheet refused "' + e.was + '" - it is not in the dropdown' });
      return;
    }
    put.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['ASSIGNMENTS REVERSED', '',
    put.length + ' put back to what they were on ' + last, ''];
  put.forEach(function (e) {
    L.push('  ' + e.trainee + '   ->   ' + (e.was || '(blank)'));
  });
  if (left.length) {
    L.push('');
    L.push('LEFT ALONE  (' + left.length + ')');
    left.forEach(function (l) { L.push('  ' + l.e.trainee + '   ' + l.found); });
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function WHO_TRAINS_WHOM() { return assignFto(); }
function FIX_THE_FTO_DROPDOWN() { return fixFtoDropdown(); }
