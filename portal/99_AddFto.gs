/**
 * Somebody joined.
 *
 * This is the half that was missing. retireFto takes a training officer off
 * the roster and nothing ever put one on, which made "assign Chyna Gray to
 * Latavia" look like a one-cell edit when it is not one:
 *
 *   the ASSIGNED FTO column is a dropdown fed by the roster, so a name the
 *   roster has never heard of is rejected by the sheet outright
 *   the portal matches a trainee to their officer by name, so an assignment
 *   to somebody not on the roster puts that trainee on nobody's list
 *   an officer with no row has no EMAIL column, so they cannot sign in
 *
 * Adding a row is the only thing that fixes all three, and it has to happen
 * before the assignment, not after.
 *
 * What it does:
 *   Appends one row to the roster. Name, and whatever else you give it.
 *
 * What it will not do:
 *   Touch a row that is already there. Not one cell of one.
 *   Add a second row for somebody already on it - if they are on it and
 *   retired, it says to run unretireFto instead, because a returning
 *   employee getting a duplicate row is how a roster starts lying.
 *   Guess at what somebody is qualified to train. Those columns are left
 *   blank and named, for a person to fill in.
 *
 * undoAddFto() removes the rows it added, and only while they are still the
 * blank-slate rows it wrote.
 */

var PORTAL_ADD_FTO_PROPERTY = 'PORTAL_ADD_FTO';
var PORTAL_ADD_FTO_LOG = 'PORTAL ROSTER ADDITIONS';

/** Who to add.
 *
 *  "Chyna Gray, cgray@example.org, C, Advanced EMT" - and the parts after the
 *  name may come in any order, because remembering an order is one more thing
 *  to get wrong. A field with an @ is the address, a lone letter is the shift,
 *  and anything that reads like a certification is the level.
 *
 *  More than one? Put a semicolon between them. */
function addFtoRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ADD_FTO_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var parts = String(piece).split(/[,|\t]+/)
      .map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
    if (!parts.length) return;

    var req = { name: '', email: '', shift: '', level: '' };
    parts.forEach(function (v) {
      if (!req.email && v.indexOf('@') > 0 &&
          /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v)) {
        req.email = v.toLowerCase(); return;
      }
      if (!req.shift && /^[A-Da-d]$/.test(v)) { req.shift = v.toUpperCase(); return; }
      if (!req.level && /^(emt|aemt|advanced\s*emt|paramedic|emt\s*-?\s*[ipb])$/i.test(v)) {
        req.level = v; return;
      }
      if (!req.name) { req.name = v; return; }
    });
    if (!req.name) return;
    out.push(req);
  });
  return out;
}

/** What would be added, and what would not. Reads; writes nothing. */
function addFtoPlanV1_() {
  var plan = { add: [], already: [], retired: [], clash: [], problem: '',
               nameCol: '', emailCol: '', activeCol: '', blankCols: [] };

  plan.requests = addFtoRequestsV1_();
  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_ADD_FTO_PROPERTY + '.\n\n' +
      'The name, then whatever else you have, in any order:\n' +
      '  Chyna Gray, cgray@example.org, C, Advanced EMT\n\n' +
      'The name on its own is enough to put them on the roster. Without an\n' +
      'address they cannot sign in, and it can be added later.\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (!plan.nameCol && t.col[h] !== undefined) plan.nameCol = h; });
  ROSTER_EMAIL_HEADERS_V1.forEach(function (h) {
    if (!plan.emailCol && t.col[h] !== undefined) plan.emailCol = h; });
  ROSTER_ACTIVE_HEADERS_V1.forEach(function (h) {
    if (!plan.activeCol && t.col[h] !== undefined) plan.activeCol = h; });
  if (!plan.nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }

  var onRoster = rosterPeopleV1_();

  plan.requests.forEach(function (req) {
    var k = normNameV1_(req.name);

    var match = null;
    onRoster.forEach(function (p) { if (p.norm === k) match = p; });
    if (match) {
      // Somebody coming back gets their own row back, not a second one. Two
      // rows with one name is how the roster starts lying: every lookup that
      // matches by name then has to choose, and nothing says which is right.
      (match.active ? plan.already : plan.retired).push(match);
      return;
    }

    // An address already belonging to somebody else is an identity collision,
    // and identity here decides whose trainees you open.
    if (req.email) {
      var owner = null;
      onRoster.forEach(function (p) { if (p.email && p.email === req.email) owner = p; });
      if (owner) { plan.clash.push({ req: req, owner: owner }); return; }
    }

    plan.add.push(req);
  });

  // Columns this cannot responsibly fill in. Whether somebody is signed off
  // to train a paramedic is a qualification, not a default.
  t.headers.forEach(function (h) {
    if (!h) return;
    var up = String(h).toUpperCase();
    if (up === plan.nameCol || up === plan.emailCol || up === plan.activeCol) return;
    if (up === 'SHIFT' || up === 'CERT LEVEL' || up === 'LEVEL') return;
    plan.blankCols.push(h);
  });

  return plan;
}

/** The before picture. Writes nothing. */
function addFtoBeforeAndAfter() {
  var p = addFtoPlanV1_();
  var L = ['ADDING SOMEBODY TO THE ROSTER  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  addFtoBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: addFto()');
  return noteV1_(L.join('\n'));
}

function addFtoBodyV1_(p, L, done) {
  p.add.forEach(function (a) {
    L.push((done ? 'ADDED   ' : 'WOULD ADD   ') + a.name);
    L.push('  ' + p.nameCol + '   ' + a.name);
    if (p.emailCol) {
      L.push('  ' + p.emailCol + '   ' + (a.email || '(blank - they cannot sign in yet)'));
    }
    if (a.shift) L.push('  SHIFT   ' + a.shift);
    if (a.level) L.push('  CERT LEVEL   ' + a.level);
    if (p.activeCol) L.push('  ' + p.activeCol + '   Y');
    if (p.blankCols.length) {
      L.push('  Left blank for a person: ' + p.blankCols.join(', '));
      L.push('    What somebody is signed off to train is a qualification, not');
      L.push('    something to default.');
    }
    L.push('');
  });

  if (p.retired.length) {
    L.push('ALREADY ON THE ROSTER, MARKED AS GONE  (' + p.retired.length + ')');
    p.retired.forEach(function (r) {
      L.push('  ' + r.name + '   row ' + r.row + '   ' + p.activeCol + ' says ' +
             (r.activeRaw || '(blank)'));
    });
    L.push('  They already have a row and all their history is under it.');
    L.push('  Set ' + PORTAL_RETIRE_PROPERTY + ' aside and run unretireFto()');
    L.push('  instead. A second row for one person is how a roster starts lying:');
    L.push('  every lookup that matches by name then has to choose, and nothing');
    L.push('  says which is right.');
    L.push('');
  }
  if (p.already.length) {
    L.push('ALREADY ON THE ROSTER  (' + p.already.length + ')');
    p.already.forEach(function (a) {
      L.push('  ' + a.name + '   row ' + a.row +
             (a.email ? '   ' + a.email : '   no address yet'));
    });
    L.push('  Nothing to do. Nothing was changed.');
    L.push('');
  }
  if (p.clash.length) {
    L.push('THAT ADDRESS BELONGS TO SOMEBODY ELSE  (' + p.clash.length + ')');
    p.clash.forEach(function (c) {
      L.push('  ' + c.req.email + '   is ' + c.owner.name + ' on row ' + c.owner.row);
    });
    L.push('  An address is what the portal recognises somebody by, so two people');
    L.push('  sharing one means one of them opens the other\'s trainees. Not added.');
    L.push('');
  }
  return L;
}

/** Puts them on the roster. Appends; touches no existing row. */
function addFto() {
  var p = addFtoPlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['SOMEBODY JOINED THE ROSTER', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  if (!p.add.length) {
    L.push('Nothing was added.');
    L.push('');
    addFtoBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var width = t.headers.length;
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], added = [], refused = [];

  p.add.forEach(function (a) {
    var row = new Array(width);
    for (var i = 0; i < width; i++) row[i] = '';
    row[t.col[p.nameCol]] = clean_(a.name);
    if (p.emailCol && a.email) row[t.col[p.emailCol]] = clean_(a.email);
    if (p.activeCol) row[t.col[p.activeCol]] = 'Y';
    if (a.shift && t.col['SHIFT'] !== undefined) row[t.col['SHIFT']] = clean_(a.shift);
    if (a.level) {
      var lc = t.col['CERT LEVEL'] !== undefined ? 'CERT LEVEL'
             : (t.col['LEVEL'] !== undefined ? 'LEVEL' : '');
      if (lc) row[t.col[lc]] = clean_(a.level);
    }

    // Appending puts the row at the bottom, below everything. Nothing already
    // on the roster is read, moved or overwritten to do it.
    var at = sh.getLastRow() + 1;
    try {
      sh.getRange(at, 1, 1, width).setValues([row]);
    } catch (e) {
      refused.push({ a: a, why: validationReasonV1_(sh, at, t.col[p.nameCol] + 1) });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.ROSTER, at, a.name, a.email || '',
                   a.shift || '', a.level || '',
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    a.row = at;
    added.push(a);
  });

  writeAddFtoManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(added.length + ' added to ' + PORTAL.TAB.ROSTER + '.');
  L.push('');
  addFtoBodyV1_({ add: added, already: p.already, retired: p.retired, clash: p.clash,
                  nameCol: p.nameCol, emailCol: p.emailCol, activeCol: p.activeCol,
                  blankCols: p.blankCols }, L, true);

  if (refused.length) {
    L.push('NOT ADDED  (' + refused.length + ')');
    refused.forEach(function (r) { L.push('  ' + r.a.name + '   ' + r.why); });
    L.push('');
  }

  if (added.length) {
    L.push('No row already on the roster was read, moved or changed.');
    L.push('');
    rebuiltNoteV1_(L);
    var sync = null;
    try { sync = syncRegisteredFormChoicesV1_(); } catch (eSync) {}
    if (sync && sync.ok) {
      L.push('EXISTING FORMS UPDATED');
      L.push('  FTO name dropdowns on ' + sync.forms + ' registered form(s) now include');
      L.push('  the new officer. Same forms already in service — nothing new created.');
      L.push('');
    } else {
      refreshDropdownsNoteV1_(L);
      L.push('');
    }
    L.push('NOW YOU CAN ASSIGN THEM');
    L.push('  The ASSIGNED FTO column on ' + PORTAL.TAB.MASTER + ' is a dropdown');
    L.push('  fed by this roster, which is why the name had to go here first.');
    L.push('  Their name is in that list now.');
    var noMail = added.filter(function (a) { return !a.email; });
    if (noMail.length) {
      L.push('');
      L.push('  ' + noMail.map(function (a) { return a.name; }).join(', ') +
             ' cannot sign in until an address is');
      L.push('  in the ' + (p.emailCol || 'EMAIL') + ' column. They can be assigned trainees ' +
             'either way.');
    }
    L.push('');
    L.push('To reverse it: undoAddFto()');
  }
  return noteV1_(L.join('\n'));
}

function writeAddFtoManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ADD_FTO_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ADD_FTO_LOG);
    sh.getRange(1, 1).setValue(
      'Rows the portal added to the roster. Do not edit or sort.').setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'NAME', 'EMAIL', 'SHIFT', 'LEVEL', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Removes the rows the last run added, and only while they are untouched.
 *
 *  Deleting a roster row is the one destructive thing in this file, so it is
 *  fenced hard: the row must still hold that name, and it must still be the
 *  blank slate that was written. The moment somebody has put anything of
 *  their own in it - a note, a qualification, an employee number - it is
 *  theirs and it stays. */
function undoAddFto() {
  var t = readTabV1_(PORTAL_ADD_FTO_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('This portal has not added anybody to the roster.');
  }
  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { row: Number(r[t.col['ROW']]), name: String(r[t.col['NAME']] || ''),
               email: String(r[t.col['EMAIL']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nobody for the last run.');

  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var nameIdx = -1;
  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (nameIdx < 0 && ros.col[h] !== undefined) nameIdx = ros.col[h]; });

  // bottom-up, so removing one does not move the next
  entries.sort(function (a, b) { return b.row - a.row; });

  var removed = [], kept = [];
  entries.forEach(function (e) {
    var vals;
    try { vals = sh.getRange(e.row, 1, 1, Math.max(ros.headers.length, 1)).getValues()[0]; }
    catch (err) { kept.push({ e: e, why: 'that row is no longer there' }); return; }

    if (normNameV1_(vals[nameIdx]) !== normNameV1_(e.name)) {
      kept.push({ e: e, why: 'it now holds "' + (vals[nameIdx] || '(empty)') + '"' });
      return;
    }
    // anything beyond what was written is somebody's work
    var extra = [];
    vals.forEach(function (v, i) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return;
      if (i === nameIdx) return;
      if (s === 'Y' || s.toLowerCase() === String(e.email).toLowerCase()) return;
      if (ros.col['SHIFT'] === i || ros.col['CERT LEVEL'] === i || ros.col['LEVEL'] === i) return;
      extra.push(ros.headers[i] || ('column ' + (i + 1)));
    });
    if (extra.length) {
      kept.push({ e: e, why: 'somebody has filled in ' + extra.join(', ') });
      return;
    }
    sh.deleteRow(e.row);
    removed.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['ROSTER ADDITIONS REVERSED', '',
    removed.length + ' row(s) removed, the ones added on ' + last, ''];
  removed.forEach(function (e) { L.push('  row ' + e.row + '   ' + e.name); });
  if (kept.length) {
    L.push('');
    L.push('KEPT  (' + kept.length + ')');
    kept.forEach(function (k) { L.push('  ' + k.e.name + '   ' + k.why); });
    L.push('  A row somebody has put their own work into is theirs, and stays.');
    L.push('  Delete it by hand if you are sure.');
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function SOMEBODY_JOINED() { return addFto(); }
function UNDO_SOMEBODY_JOINING() { return undoAddFto(); }
