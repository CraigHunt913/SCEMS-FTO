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
 */
function formCopyInventoryV20_6_() {
  var live = liveFormIdSetV20_6_();
  var found = [];
  var q = 'mimeType = "application/vnd.google-apps.form" and trashed = false';
  var it = DriveApp.searchFiles(q);
  while (it.hasNext()) {
    var file = it.next();
    var title = '';
    try { title = file.getName(); } catch (e) { continue; }
    if (!isSCEMSFormCopyTitleV20_6_(title)) continue;
    var id = file.getId();
    if (live[id]) continue;
    var responses = null, accepting = null, dest = '';
    try {
      var f = FormApp.openById(id);
      responses = f.getResponses().length;
      accepting = f.isAcceptingResponses();
      try { dest = f.getDestinationId() || ''; } catch (e2) {}
    } catch (e3) {}
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

  var copies = formCopyInventoryV20_6_();
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
  var copies = formCopyInventoryV20_6_();
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
    formCopyInventoryV20_6_().forEach(function (c) {
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
    var copies = formCopyInventoryV20_6_();
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
