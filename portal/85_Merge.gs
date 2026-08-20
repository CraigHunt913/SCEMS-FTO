/**
 * The other spreadsheets.
 *
 * A form pointed at the wrong book, a copy made during a rebuild, a sheet
 * someone started and abandoned - and now some of the record is over there
 * instead of here. This finds it, shows it to you, and can bring it across.
 *
 * The same three rules the form import runs under:
 *
 *   1. Looking writes nothing, in any mode, to either book. Ever.
 *   2. Bringing it across refuses unless the confirmation names the book it
 *      is about to write to, and it only ever APPENDS to the target. The
 *      other spreadsheet is opened read only and is never touched at all.
 *   3. Nothing is dropped to make the shape fit. A column the target does
 *      not have goes into the notes with its name attached, and where there
 *      is nowhere to put it the whole row is refused rather than written
 *      short.
 *
 * Every row brought across is stamped so a second run finds it and skips it,
 * and so undoLastBackfill can take it back out again by name.
 *
 * Set PORTAL_OTHER_SPREADSHEET_IDS in Project Settings. One address per line,
 * or separated by commas. Paste whole addresses; the ids are picked out.
 */

var PORTAL_OTHER_IDS_PROPERTY = 'PORTAL_OTHER_SPREADSHEET_IDS';
var PORTAL_MERGE_PREFIX = 'MERGED';

/** The other books, as ids. Anything that is not an id is ignored rather
 *  than guessed at, and the current target is never one of them. */
function otherBookIdsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_OTHER_IDS_PROPERTY) || '');
  var here = '';
  try { here = targetIdV1_(); } catch (e) { here = ''; }

  // Split on line breaks and commas only, never on spaces. A space-separated
  // split turns "the other one in my drive" into six candidates, and each
  // single word is a valid-looking bare id.
  var seen = {}, out = [];
  raw.split(/[\n\r,;]+/).forEach(function (piece) {
    var id = spreadsheetIdFromV1_(piece);
    if (!id || id === here || seen[id]) return;
    seen[id] = true;
    out.push(id);
  });
  return out;
}

/** A deterministic fingerprint of a row's values, for rows that carry no
 *  response id of their own. Same row, same key, every run - which is what
 *  makes a second pass add nothing. */
function rowFingerprintV1_(headers, row) {
  var parts = [];
  headers.forEach(function (h, i) {
    if (!h) return;
    var v = row[i];
    if (v instanceof Date && !isNaN(v.getTime())) v = v.toISOString().slice(0, 10);
    parts.push(String(h).toUpperCase().replace(/\s+/g, '') + '=' +
               String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '));
  });
  var s = parts.join('|'), h1 = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
  }
  return ('0000000' + h1.toString(16)).slice(-8);
}

/** What is in a spreadsheet. Read only, and safe against a book this portal
 *  knows nothing about. */
function surveyBookV1_(id) {
  var out = { id: id, name: '', ok: false, why: '', tabs: [] };
  var book;
  try { book = SpreadsheetApp.openById(id); out.name = book.getName(); }
  catch (e) { out.why = String(e.message || e); return out; }
  out.ok = true;

  book.getSheets().forEach(function (sh) {
    var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
    var headers = lastRow >= PORTAL.HEADER_ROW
      ? sh.getRange(PORTAL.HEADER_ROW, 1, 1, lastCol).getValues()[0]
          .map(function (h) { return String(h == null ? '' : h).trim(); })
      : [];
    out.tabs.push({
      name: sh.getName(),
      rows: Math.max(lastRow - PORTAL.HEADER_ROW, 0),
      headers: headers.filter(String),
      known: knownTabV1_(sh.getName())
    });
  });
  return out;
}

/** Is this a tab the portal understands, by name? */
function knownTabV1_(name) {
  var keys = Object.keys(PORTAL.TAB);
  for (var i = 0; i < keys.length; i++) {
    if (PORTAL.TAB[keys[i]] === name) return true;
  }
  return false;
}

/** A header-mapped read of one tab in ANY book. readTabV1_ only ever opens
 *  the target, which is deliberate; this is the one place that does not. */
function readTabInV1_(bookId, tabName) {
  var sh;
  try { sh = SpreadsheetApp.openById(bookId).getSheetByName(tabName); } catch (e) { sh = null; }
  if (!sh) return { ok: false, headers: [], col: {}, rows: [], firstDataRow: 0 };
  var hr = PORTAL.HEADER_ROW;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(hr, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h == null ? '' : h).trim(); });
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h.toUpperCase()] = i; });
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues() : [];
  return { ok: true, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}

/** What one tab of one other book would contribute. Builds every row in
 *  full and returns it. Writes nothing. */
function mergePlanV1_(sourceId, tabName) {
  var plan = { source: sourceId, tab: tabName, total: 0, present: 0,
               missing: [], blocked: [], problem: '' };

  var dest = readTabV1_(tabName);
  if (!dest.ok) { plan.problem = tabName + ' is not in this spreadsheet.'; return plan; }

  var idCol = responseIdColumnV1_(dest);
  if (!idCol) {
    plan.problem = tabName + ' has no response id column, so a second run could ' +
      'not tell a row it already brought across from a new one. Nothing will be written.';
    return plan;
  }
  var noteCol = notesColumnV1_(dest);

  var src = readTabInV1_(sourceId, tabName);
  if (!src.ok) { plan.problem = tabName + ' is not in the other spreadsheet.'; return plan; }

  // A row can already be here without carrying the same id - it may have
  // arrived by another path entirely. So the target is fingerprinted too, over
  // the columns both books share, and a match on EITHER the id or the content
  // counts as already here. Getting this wrong duplicates the record.
  var seen = {};
  dest.rows.forEach(function (r) {
    var v = String(r[dest.col[idCol.toUpperCase()]] || '').trim();
    if (v) seen[v] = true;
    var byHeader = {};
    dest.headers.forEach(function (h, ci) { if (h) byHeader[h] = r[ci]; });
    seen[sharedFingerprintV1_(dest.headers, idCol, noteCol, byHeader)] = true;
  });

  var srcIdCol = responseIdColumnV1_(src);

  src.rows.forEach(function (r, i) {
    var empty = r.every(function (v) { return v === '' || v === null || v === undefined; });
    if (empty) return;
    plan.total++;

    var mapped = {}, spare = [];
    src.headers.forEach(function (h, ci) {
      if (!h) return;
      var v = r[ci];
      if (v === '' || v === null || v === undefined) return;
      if (h.toUpperCase() === String(srcIdCol || '').toUpperCase()) return;
      var target = matchHeaderV1_(h, dest.headers);
      if (!target || target === idCol) { spare.push({ label: h, value: v }); return; }
      // A value that belongs in the notes column goes in as it was written.
      // Only a column with no home here carries its own name in with it.
      if (target === noteCol) {
        mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + v) : v;
        return;
      }
      mapped[target] = v;
    });

    // Its own response id if it has one, otherwise a fingerprint of the row as
    // it will sit HERE. Either way the same row yields the same key every run.
    var own = srcIdCol ? String(r[src.col[srcIdCol.toUpperCase()]] || '').trim() : '';
    var shared = sharedFingerprintV1_(dest.headers, idCol, noteCol, mapped);
    var key = own || (PORTAL_MERGE_PREFIX + ':' + sourceId.slice(0, 8) + ':' + shared);
    if (seen[key] || seen[shared]) { plan.present++; return; }

    var extra = spare.map(function (a) {
      var v = a.value instanceof Date ? a.value.toDateString() : a.value;
      return a.label + ': ' + v;
    }).join('\n');

    if (extra && !noteCol) {
      plan.blocked.push({ key: key, sourceRow: src.firstDataRow + i, why:
        tabName + ' here has no notes column, and ' + spare.length + ' column(s) ' +
        'from the other spreadsheet have nowhere to go. Add a NOTE column or ' +
        'these rows stay where they are.', spare: spare });
      return;
    }
    if (extra) mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + extra) : extra;
    mapped[idCol] = key;

    plan.missing.push({
      key: key,
      sourceRow: src.firstDataRow + i,
      carried: spare.length,
      row: dest.headers.map(function (h) {
        if (!h) return '';
        var v = mapped[h];
        if (v === undefined) return '';
        return (v instanceof Date) ? v : clean_(v);
      })
    });
  });

  return plan;
}

/** A fingerprint over the columns two books actually share, so the same event
 *  fingerprints the same on both sides. The id column is excluded because it
 *  is what differs; the notes column because a merged row's note carries the
 *  columns the other book had and this one does not. */
function sharedFingerprintV1_(destHeaders, idCol, noteCol, byHeader) {
  var hs = [], vs = [];
  destHeaders.forEach(function (h) {
    if (!h || h === idCol || h === noteCol) return;
    hs.push(h);
    vs.push(byHeader[h]);
  });
  return rowFingerprintV1_(hs, vs);
}

/** The target column a source column belongs in. Exact on letters and digits
 *  only, so case, spacing and punctuation never matter; then the alias table
 *  the form import already uses. */
function matchHeaderV1_(sourceHeader, destHeaders) {
  var q = bareV1_(sourceHeader);
  if (!q) return '';
  for (var i = 0; i < destHeaders.length; i++) {
    if (destHeaders[i] && bareV1_(destHeaders[i]) === q) return destHeaders[i];
  }
  var alias = PORTAL_ANSWER_ALIASES[q];
  if (!alias) return '';
  for (var j = 0; j < destHeaders.length; j++) {
    if (destHeaders[j] && bareV1_(destHeaders[j]) === bareV1_(alias)) return destHeaders[j];
  }
  return '';
}

/** Every other book, every tab this portal understands. Read only. */
function mergePlanAllV1_() {
  var out = [];
  otherBookIdsV1_().forEach(function (id) {
    Object.keys(PORTAL.TAB).forEach(function (k) {
      var name = PORTAL.TAB[k];
      if (name === PORTAL.TAB.AUDIT) return;
      var plan = mergePlanV1_(id, name);
      if (plan.total || plan.missing.length || plan.blocked.length) out.push(plan);
    });
  });
  return out;
}

/* ---------------- the things you run ---------------- */

/** What is in the other spreadsheets. Opens them read only, writes nothing,
 *  in any mode. This is the one to run first. */
function whatElseIsOutThere() {
  var ids = otherBookIdsV1_();
  if (!ids.length) {
    return noteV1_('No other spreadsheets are listed.\n\n' +
      'Project Settings > Script Properties > Add script property:\n' +
      '  ' + PORTAL_OTHER_IDS_PROPERTY + '\n' +
      'One address per line, or separated by commas. Paste whole addresses if\n' +
      'that is easier; the ids are picked out of them.');
  }

  var lines = ['WHAT IS IN THE OTHER SPREADSHEETS  (read only, nothing was written)', '',
    'This book : ' + safeTargetNameV1_(), ''];

  ids.forEach(function (id) {
    var s = surveyBookV1_(id);
    lines.push('=======================================================');
    lines.push(s.ok ? s.name : '(cannot open)');
    lines.push('  ' + id);
    lines.push('=======================================================');
    if (!s.ok) { lines.push('  ' + s.why); lines.push(''); return; }
    if (!s.tabs.length) { lines.push('  It has no tabs.'); lines.push(''); return; }

    s.tabs.forEach(function (t) {
      lines.push('  ' + (t.known ? '[known] ' : '        ') + t.name +
                 '   ' + t.rows + ' row' + (t.rows === 1 ? '' : 's'));
      if (t.known && t.rows) {
        var plan = mergePlanV1_(id, t.name);
        if (plan.problem) lines.push('            ' + plan.problem);
        else {
          lines.push('            ' + plan.present + ' already here, ' +
                     plan.missing.length + ' not' +
                     (plan.blocked.length ? ', ' + plan.blocked.length + ' would be refused' : ''));
        }
      }
    });
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push('[known] means a tab this portal understands and could bring across.');
  lines.push('Run mergeBeforeAndAfter() to see exactly what that would add.');
  return noteV1_(lines.join('\n'));
}

/** Every row that would come across, in full. Writes nothing, in any mode. */
function mergeBeforeAndAfter() {
  var plans = mergePlanAllV1_();
  var lines = ['BEFORE AND AFTER  (nothing has been written)', '',
    'Into   : ' + safeTargetNameV1_(),
    'Id     : ' + safeTargetIdV1_(),
    'Mode   : ' + safeModeV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'Google is not naming this account'), ''];

  if (!plans.length) {
    lines.push('Nothing in the other spreadsheets belongs in a tab this portal');
    lines.push('understands, or there is nothing there that is not already here.');
    return noteV1_(lines.join('\n'));
  }

  var totalMissing = 0, totalBlocked = 0;
  plans.forEach(function (p) {
    lines.push('=======================================================');
    lines.push(p.tab + '   from ' + p.source);
    lines.push('=======================================================');
    if (p.problem) { lines.push('CANNOT BRING ACROSS: ' + p.problem); lines.push(''); return; }

    var dest = readTabV1_(p.tab);
    lines.push('');
    lines.push('BEFORE');
    lines.push('  ' + p.tab + ' here holds ' + dest.rows.length + ' rows');
    lines.push('  the other spreadsheet has ' + p.total + ', of which ' + p.present + ' are already here');
    lines.push('');
    lines.push('WOULD BE ADDED  (' + p.missing.length + ' rows, appended at the bottom)');
    p.missing.forEach(function (m, i) {
      lines.push('  ' + (i + 1) + '.  from row ' + m.sourceRow + '   key ' + m.key);
      dest.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = m.row[ci];
        if (v === '' || v === undefined) return;
        if (v instanceof Date) v = v.toDateString();
        lines.push('        ' + labelForV1_(h) + ': ' + String(v).replace(/\n/g, ' / '));
      });
    });
    if (p.blocked.length) {
      lines.push('');
      lines.push('WOULD BE REFUSED  (' + p.blocked.length + ')');
      p.blocked.forEach(function (b) {
        lines.push('  row ' + b.sourceRow + '  ' + b.why);
        b.spare.forEach(function (a) { lines.push('        ' + a.label + ': ' + a.value); });
      });
    }
    lines.push('');
    lines.push('AFTER');
    lines.push('  ' + p.tab + ' would hold ' + (dest.rows.length + p.missing.length) + ' rows');
    lines.push('  nothing already in it would be changed or removed');
    lines.push('  the other spreadsheet is not touched at all');
    lines.push('');
    totalMissing += p.missing.length;
    totalBlocked += p.blocked.length;
  });

  lines.push('=======================================================');
  lines.push(totalMissing + ' row(s) would be added, ' + totalBlocked + ' refused.');
  lines.push('');
  lines.push('You do not have to do this. The portal reads the other spreadsheets');
  lines.push('already, so everything above is visible on screen without moving it.');
  lines.push('Bring it across only if you want it to live in one book.');
  lines.push('');
  lines.push('To do that, set the script property');
  lines.push('');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' +
             confirmCodeForV1_(safeTargetIdV1_(), plans));
  lines.push('');
  lines.push('and run runMergeForReal().');
  lines.push('');
  lines.push('That code authorises exactly the rows above and nothing else.');
  return noteV1_(lines.join('\n'));
}

/** Brings them across, for real. Same gate as the form import, same manifest,
 *  and undoLastBackfill reverses it the same way. */
function runMergeForReal() {
  // Worked out first, so "nothing to do" and "no spreadsheets listed" never
  // arrive dressed up as a problem with the confirmation.
  if (!otherBookIdsV1_().length) {
    return noteV1_('No other spreadsheets are listed, so there is nothing to ' +
      'bring across.\n\nProject Settings > Script Properties:\n  ' +
      PORTAL_OTHER_IDS_PROPERTY + '\nOne address per line, or separated by commas.');
  }
  var plans = mergePlanAllV1_();
  var due = plans.reduce(function (n, p) { return n + p.missing.length; }, 0);
  if (!due && !plans.some(function (p) { return p.blocked.length; })) {
    return noteV1_('Nothing to bring across. Everything in the other ' +
      'spreadsheets is already here.');
  }

  var code = confirmCodeForV1_(safeTargetIdV1_(), plans);
  var id = requireImportAuthorityV1_(code);

  var blocked = plans.reduce(function (n, p) { return n + p.blocked.length; }, 0);
  if (blocked) {
    throw new Error('Refusing to write. ' + blocked + ' row(s) have columns with ' +
      'nowhere to go, and bringing the rest across would leave the record half ' +
      'done. Run mergeBeforeAndAfter() to see which, add the column they need, ' +
      'then run this again.');
  }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], report = ['MERGE COMPLETE', '',
    'Into   : ' + safeTargetNameV1_(), 'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  plans.forEach(function (p) {
    if (p.problem || !p.missing.length) return;
    var sh = targetBookV1_().getSheetByName(p.tab);
    if (!sh) { report.push(p.tab + ' : SKIPPED, it is not there'); return; }

    var beforeRows = sh.getLastRow();
    p.missing.forEach(function (m) {
      sh.appendRow(m.row);
      manifest.push([stamp, p.tab, sh.getLastRow(), m.key,
                     PORTAL_MERGE_PREFIX + ' ' + p.source,
                     whoIsAskingV1_() || 'unidentified', PORTAL.VERSION, code]);
    });
    var afterRows = sh.getLastRow();

    report.push(p.tab + '   from ' + p.source);
    report.push('  rows before   : ' + beforeRows);
    report.push('  rows added    : ' + p.missing.length);
    report.push('  rows after    : ' + afterRows);
    report.push('  added at rows : ' + (beforeRows + 1) + ' to ' + afterRows);
    report.push('');
  });

  writeManifestV1_(manifest);
  forgetTabsV1_();

  report.push('The other spreadsheet was opened read only and was not changed.');
  report.push('Nothing already here was changed or removed. Every row added carries');
  report.push('a key of its own, so running this again adds nothing.');
  report.push('');
  report.push('To reverse it: undoLastBackfill().');
  return noteV1_(report.join('\n'));
}
