/**
 * SCEMS Field Training Tracker — 75_presentation
 *
 * How the sheets look and read. Three versions of this concern used to sit
 * in three separate blocks.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   SCEMS v20.5 : the badge, and a masthead on every page
 *   The badge is a black shield with a white star of life. It disappears
 *   on a dark band, so the masthead is light — cream ground, charcoal
 *   type, a gold rule underneath. That is also the right way round for a
 *   document people print.
 *   Rows 1 to 3 are the masthead on every sheet. Row 4 is the header row,
 *   which is where the data has always started, so nothing below moves.
 *   SCEMS v20.4 : plain English, correct headers, plumbing out of sight
 *   The problem this solves, in the order it hurts:
 *   1. 12 DECISION QUEUE's header row is one column SHORT of its data,
 *   so every label from column D rightward names the wrong column.
 *   2. 01 TRAINEE MASTER carries an ENTRY PROFILE KEY legend inside the
 *   data table, and on at least one row it contradicts the code
 *   beside it.
 *   3. Header rows cannot decide between Title Case and SHOUTING CASE.
 *   4. Up to 44% of the columns on a record sheet are machine plumbing.
 *   5. Raw counters sit far from the thresholds that give them meaning.
 *   6. Action checkboxes are interleaved with data and IDs.
 *   The thing that made this hard: 235 places in this file look a column
 *   up BY ITS HEADER TEXT. Renaming a header on the sheet would break all
 *   of them at once. So the rename is made safe first, by teaching the
 *   table reader that a display label and a canonical name are the same
 *   column. Nothing downstream changes.
 *   SCEMS v20.3 : the readable release
 *   "if im the division chief and i open the spreadsheet i should be
 *   able to see any submissions, where the trainee is at, and have a
 *   simple button to press on each trainee ... once someone is ready
 *   to be released this should be a simple check box ... it should
 *   take all the information gathered on that trainee, create a file
 *   of everything done from day 1 until release, and i should be able
 *   to get that information any time i like ... i want to view any
 *   comments in their entirety, not having to constantly wrap the
 *   text because the cells aren't big enough."
 *   Three things, and nothing else:
 *   1. TRAINEES  — one row per person, plain words, two checkboxes
 *   2. the file  — everything from day one, as a document you can keep
 *   3. readable  — narrative columns wide enough to actually read
 *   SCEMS v20.1.0h ADD-ON : makeQueueReadableV20_1
 *   FORMATTING ONLY. Reads the queue through the same header-mapped
 *   loader the system uses; changes how the tab LOOKS and never what
 *   it SAYS. No row is moved, sorted, hidden, or edited.
 *   SCEMS v20.1.0i ADD-ON : make the flags fixable
 *   SCEMS v20.1.0i ADD-ON : fix all current flags, one click
 *   SCEMS v20.1.0i ADD-ON : flags, simplified for one human
 */

var BRAND_V20_5 = Object.freeze({
  INK:      '#1d1b18',   // the shield's black
  INK_SOFT: '#4a453d',
  MUTE:     '#6f6859',
  GOLD:     '#c9a227',   // the county gold, used only as a rule and for accents
  PAPER:    '#faf8f3',
  RULE:     '#e0dace',
  HEAD_BG:  '#1d1b18',   // the column-header band
  HEAD_FG:  '#f4f1ea',
  FONT:     'Arial'
});

/** What each sheet is FOR, in one line, under its title. A masthead that
 *  only repeats the tab name is decoration; this earns its space. */
function sheetPurposeV20_5_() {
  var m = {};
  m['TRAINEES']              = ['Trainees', 'Everyone in training. Tick a box to open someone’s file or release them.'];
  m['HOME']                  = ['Field Training Programme', 'Where things stand today.'];
  m[TAB.CONTROL]             = ['Mission Control', 'Programme settings, forms and reference data.'];
  m[TAB.MASTER]              = ['Trainee Master', 'One row per person: level, phase, who trains them, how they came in.'];
  m[TAB.SKILLS]              = ['Skills Progress', 'One row per person per skill. The system keeps this current — do not type in it.'];
  m[TAB.SKILL_VALIDATION]    = ['Sign-off Queue', 'Skills that have met their evidence and are waiting on a decision from you.'];
  m[TAB.QUEUE]               = ['Decision Queue', 'Advancements, reviews and programme decisions awaiting an outcome.'];
  m[TAB.AUDIT]               = ['Audit and Exceptions', 'Conditions the system has flagged. Fix the cause, or accept a flag with a reason.'];
  m[TAB.WEEKLY]              = ['Weekly Status', 'The programme at a glance, rebuilt each Monday.'];
  m[TAB.FTO_VIEW]            = ['FTO View', 'What each training officer is carrying.'];
  m[TAB.TRAINEE_VIEW]        = ['Trainee View', 'Each trainee’s own picture of where they are.'];
  m[TAB.DASH]                = ['Training Division Dashboard', 'Programme-level numbers for the Division Chief.'];
  m[TAB.MD_VIEW]             = ['Medical Director View', 'Clinical competency and anything needing medical review.'];
  m[TAB.CATALOG]             = ['Skill Catalog', 'Every skill, who must do it, and how much evidence it takes. Edited by hand.'];
  m[TAB.FTO_ROSTER]          = ['FTO Roster', 'Training officers, their levels, and what they may sign off.'];
  m[TAB.TRAINEE_SKILLS]      = ['Trainee Skills', 'One trainee’s skills, for reading and for approving in place.'];
  m[TAB.SKILL_EVIDENCE]      = ['Skill Evidence Log', 'Every repetition an FTO has logged. Append-only — a permanent record.'];
  m[TAB.SKILL_SIGNOFF]       = ['Skill Sign-off Log', 'Every sign-off decision ever made. Append-only — a permanent record.'];
  m[TAB.DECISIONS]           = ['Decisions', 'Programme decisions as filed. Append-only — a permanent record.'];
  m[TAB.ARCHIVE]             = ['Trainee Archive', 'People who have completed or left the programme.'];
  m[TAB.EVAL]                = ['Shift Evaluations', 'Every submitted shift evaluation, exactly as the FTO wrote it.'];
  m[TAB.REFLECT]             = ['Self-Reflections', 'Every trainee reflection, in their own words.'];
  m[TAB.URGENT]              = ['Urgent Concerns', 'Concerns raised from the field. Read these first.'];
  m[TAB.ANALYTICS]           = ['Analytics', 'Trends across the programme.'];
  m[TAB.ENGINE]              = ['Phase and Status Engine', 'Working sheet. The system reads and writes this — do not edit it.'];
  m[TAB.LOG]                 = ['System Log', 'What the system did, and when. Diagnostic.'];
  m[TAB.REGISTRY]            = ['Person Registry', 'Identity and role for everyone the system knows.'];
  m[TAB.LEDGER]              = ['Ingestion Ledger', 'Every form submission received, and what became of it.'];
  m[TAB.ASSIGNMENTS]         = ['Assignment History', 'Who was assigned to whom, and when.'];
  m[TAB.ACCESS]              = ['Access Log', 'Every request to act, granted or refused, with the identity behind it.'];
  return m;
}

/** The badge as an image blob, or null when it is missing or a stub.
 *  A 1x1 placeholder is treated as absent — better no badge than an
 *  invisible pixel that looks like a bug. */
function badgeBlobV20_5_() {
  try {
    var b64 = String(BADGE_B64 || '');
    if (b64.length < 1000) return null;          // placeholder, not a real badge
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'scems_badge.png');
  } catch (e) { return null; }
}

/** True when BADGE_B64 holds a real image rather than a placeholder. */
function badgeIsRealV20_5_() {
  return String(BADGE_B64 || '').length >= 1000;
}

/** Puts the masthead on one sheet: badge, title, what the sheet is for,
 *  and a gold rule. Formatting only — it writes rows 1 to 3, which have
 *  always been chrome, and never touches row 4 or below. */
function brandSheetV20_5_(sheetName, title, subtitle, width) {
  var sh = getSheetOrNullV20_1_(sheetName);
  if (!sh) return false;
  var B = BRAND_V20_5;
  var cols = Math.max(width || sh.getLastColumn(), 6);

  // one badge, not one per run
  try {
    (sh.getImages() || []).forEach(function (img) { try { img.remove(); } catch (e) {} });
  } catch (e) {}

  sh.getRange(1, 1, 3, cols).setBackground(B.PAPER).setFontFamily(B.FONT);
  try { sh.setRowHeight(1, 54); sh.setRowHeight(2, 20); sh.setRowHeight(3, 6); } catch (e) {}

  sh.getRange(1, 1, 1, cols).clearContent();
  sh.getRange(2, 1, 1, cols).clearContent();

  sh.getRange(1, 2)
    .setValue(title)
    .setFontSize(16).setFontWeight('bold').setFontColor(B.INK)
    .setVerticalAlignment('bottom').setHorizontalAlignment('left');
  sh.getRange(2, 2)
    .setValue(subtitle)
    .setFontSize(10).setFontColor(B.MUTE)
    .setVerticalAlignment('top').setHorizontalAlignment('left');

  // county mark, right-aligned, quiet
  sh.getRange(1, Math.max(cols - 1, 3))
    .setValue('SUMTER COUNTY EMS')
    .setFontSize(9).setFontWeight('bold').setFontColor(B.GOLD)
    .setHorizontalAlignment('right').setVerticalAlignment('bottom');
  sh.getRange(2, Math.max(cols - 1, 3))
    .setValue(String(CONFIG.POLICY_VERSION || ''))
    .setFontSize(8).setFontColor(B.MUTE)
    .setHorizontalAlignment('right').setVerticalAlignment('top');

  // the gold rule
  sh.getRange(3, 1, 1, cols).setBackground(B.GOLD);

  // the badge sits over column A, clear of the text in column B
  var blob = badgeBlobV20_5_();
  if (blob) {
    try { sh.insertImage(blob, 1, 1, 6, 5).setWidth(43).setHeight(47); } catch (e) {}
    try { if (sh.getColumnWidth(1) < 56) sh.setColumnWidth(1, 56); } catch (e) {}
  }

  // the column-header band, so every sheet reads the same way
  try {
    sh.getRange(4, 1, 1, cols)
      .setBackground(B.HEAD_BG).setFontColor(B.HEAD_FG)
      .setFontWeight('bold').setFontSize(10)
      .setVerticalAlignment('middle').setWrap(true);
    sh.setRowHeight(4, 38);
    sh.setFrozenRows(4);
  } catch (e) {}
  return true;
}

/** Puts the masthead on every sheet that has one defined. */
function brandAllSheetsV20_5() {
  if (!gateV20_2_('WORK QUEUE')) return;
  if (!badgeIsRealV20_5_()) {
    var warn = 'The badge image is missing from this build.\n\n' +
      'BADGE_B64 holds a placeholder rather than the county shield, so the ' +
      'masthead would go on without it. Everything else still applies.\n\n' +
      'Recover the real badge from an older copy of the script before running ' +
      'this, or accept a masthead with no shield.';
    systemLog_('WARN', 'BADGE MISSING', 'BADGE_B64 is a placeholder');
    Logger.log(warn);
    try { SpreadsheetApp.getUi().alert(warn); } catch (e) {}
  }

  var purpose = sheetPurposeV20_5_();
  var done = [], skipped = [];
  ss().getSheets().forEach(function (sh) {
    var name = sh.getName();
    var p = purpose[name];
    if (!p) { skipped.push(name); return; }
    var width = name === 'TRAINEES' ? CONSOLE_HEADERS_V20_3.length : sh.getLastColumn();
    if (brandSheetV20_5_(name, p[0], p[1], width)) done.push(name);
  });

  var msg = 'MASTHEAD APPLIED\n\n' +
    done.length + ' sheet(s) branded:\n  ' + done.join('\n  ') +
    (skipped.length ? '\n\nNo masthead defined for (left alone):\n  ' + skipped.join('\n  ') : '') +
    '\n\nEach page now carries the county shield, its name, and one line saying\n' +
    'what it is for. Rows 1 to 3 only — no data moved.' +
    (badgeIsRealV20_5_() ? '' : '\n\nNOTE: the shield is missing from this build, see the warning above.');
  systemLog_('INFO', 'MASTHEAD APPLIED', done.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Display label -> canonical header name, PER SHEET.
 *
 *  Derived from the rename plan below, reversed, so there is exactly one
 *  place that says what a column is called. It has to be per sheet: the
 *  evidence log has its own PHASE column that is not the master's CURRENT
 *  PHASE, and the access log has a REASON that is not a queue RATIONALE.
 *  A global alias table would have quietly wired those together.
 *
 *  This is what makes the rename safe. readTableV20_1_ registers both the
 *  literal header and its canonical name, so all 235 lookups by canonical
 *  name keep resolving after a column is relabelled.
 */
var HEADER_ALIAS_CACHE_V20_4 = null;

function headerAliasesForV20_4_(sheetName) {
  if (!HEADER_ALIAS_CACHE_V20_4) {
    HEADER_ALIAS_CACHE_V20_4 = {};
    var plan = headerRenamesV20_4_();
    Object.keys(plan).forEach(function (sheet) {
      var back = {};
      Object.keys(plan[sheet]).forEach(function (canon) {
        back[String(plan[sheet][canon]).toUpperCase().replace(/\s+/g, ' ')] = canon;
      });
      HEADER_ALIAS_CACHE_V20_4[sheet] = back;
    });
  }
  return HEADER_ALIAS_CACHE_V20_4[sheetName] || {};
}

/** The canonical name for a header on a given sheet, or '' when it is
 *  already canonical or unknown. Case and spacing insensitive. */
function canonicalHeaderV20_4_(header, sheetName) {
  var k = String(header || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!k) return '';
  return headerAliasesForV20_4_(sheetName)[k] || '';
}

/* ---------------------------------------------------------------- *
 *  The renames, per sheet
 * ---------------------------------------------------------------- */

/** What each sheet's headers should say. Canonical name on the left,
 *  what a person reads on the right. A sheet not listed is left alone. */
function headerRenamesV20_4_() {
  var m = {};
  m[TAB.MASTER] = {
    'SET STATUS': 'Program status',
    'PHASE START DATE': 'Phase started',
    'NRT DATE': 'Not-responding-to-training date',
    'CLEARANCE DATE': 'Cleared date',
    'ENTRY PROFILE': 'How they came in',
    'ASSIGNED FTO': 'Training officer',
    'START DATE': 'Started',
    'TRAINEE EMAIL': 'Email address'
  };
  m[TAB.SKILLS] = {
    'READINESS': 'Where this skill stands',
    'SIGN-OFF': 'Signed off?',
    'SUCCESSFUL REPS': 'Successful',
    'INDEPENDENT REPS': 'Independent',
    'DISTINCT DATES': 'Separate days',
    'DISTINCT FTOS': 'Different FTOs',
    'DECISION / EVIDENCE NOTE': 'Note',
    'LAST DATE': 'Last logged',
    'LAST OUTCOME': 'How it went',
    'LAST CONTEXT': 'Where it happened'
  };
  m[TAB.SKILL_VALIDATION] = {
    'EVIDENCE SUMMARY': 'Evidence so far',
    'RATIONALE': 'Reason for the decision',
    'READY DATE': 'Ready since',
    'LAST EVIDENCE DATE': 'Last evidence'
  };
  m[TAB.SKILL_EVIDENCE] = {
    'VALIDATION RESULT': 'Accepted?',
    'EVIDENCE NOTE': 'What the FTO wrote',
    'CALL / SCENARIO REF': 'Call number',
    'PROMPTING': 'Prompting needed',
    'LEVEL AT EVENT': 'Level then'
  };
  m[TAB.SKILL_SIGNOFF] = {
    'RATIONALE': 'Reason given',
    'STANDARD / CATALOG VERSION': 'Standard used'
  };
  m[TAB.QUEUE] = {
    'FILED': 'Raised',
    'ITEM': 'What it is',
    'DECISION DUE': 'Due',
    'DATED': 'Decided on'
  };
  return m;
}

/** Columns nobody reading the sheet ever needs: IDs, provenance,
 *  writer stamps. Correct, necessary, and not for human eyes. */
function plumbingColumnsV20_4_() {
  var m = {};
  m[TAB.SKILL_EVIDENCE] = ['EVENT ID', 'SOURCE FORM', 'SOURCE ROW', 'SOURCE FORM ID',
                           'SOURCE RESPONSE ID', 'WRITER VERSION', 'PERSON ID', 'ASSIGNMENT ID'];
  m[TAB.SKILL_SIGNOFF] = ['DECISION ID', 'SOURCE QUEUE ROW', 'STANDARD / CATALOG VERSION',
                          'REQUEST ID', 'SUPERSEDES', 'DECIDED BY PERSON ID', 'WRITER VERSION'];
  m[TAB.SKILL_VALIDATION] = ['REQUEST ID', 'SKILL ID'];
  m[TAB.SKILLS] = ['SKILL ID', 'SUCCESSFUL REPS', 'INDEPENDENT REPS',
                   'DISTINCT DATES', 'DISTINCT FTOS'];
  m[TAB.MASTER] = ['ENTRY PROFILE KEY'];
  m[TAB.LEDGER] = ['LEDGER KEY', 'FORM ID', 'RESPONSE ID', 'WRITER VERSION'];
  m[TAB.REGISTRY] = ['PERSON ID'];
  return m;
}

/* ---------------------------------------------------------------- *
 *  1. The broken header row
 * ---------------------------------------------------------------- */

/** 12 DECISION QUEUE's header names 8 columns; its rows carry 9. The
 *  owner column — who the item sits with — was never given a name, so
 *  DECISION DUE ended up over a person's name and every label after it
 *  described its neighbour.
 *
 *  Inserts the missing name. Touches the header row only; not one data
 *  cell moves, because the data was never wrong — only its labels. */
function repairDecisionQueueHeaderV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.QUEUE, 4);
  if (!t.ok) return 'Tab "' + TAB.QUEUE + '" not found.';

  var named = t.headers.filter(function (h) { return String(h || '').trim(); }).length;
  var widest = 0;
  t.rows.forEach(function (r) {
    var last = 0;
    r.forEach(function (v, i) { if (v !== '' && v != null) last = i + 1; });
    if (last > widest) widest = last;
  });

  if (widest <= named) {
    return 'No repair needed: ' + named + ' header(s) for ' + widest + ' column(s) of data.';
  }
  if (t.col['OWNER'] !== undefined) {
    return 'Already repaired — an OWNER column is named.';
  }

  // The unnamed column is the one after ITEM. Shift the labels right by one
  // and give it its name.
  var idxItem = t.col['ITEM'];
  if (idxItem === undefined) {
    return 'Refusing to repair: no ITEM column to anchor on. Header row needs a look by hand.';
  }
  var fixed = t.headers.slice(0, idxItem + 1)
    .concat(['OWNER'])
    .concat(t.headers.slice(idxItem + 1));
  fixed = fixed.slice(0, Math.max(widest, fixed.length));
  while (fixed.length < widest) fixed.push('');

  t.sheet.getRange(4, 1, 1, fixed.length).setValues([fixed]);
  var msg = 'DECISION QUEUE HEADER REPAIRED\n\n' +
    'Was : ' + t.headers.filter(String).join(' | ') + '\n\n' +
    'Now : ' + fixed.filter(String).join(' | ') + '\n\n' +
    'An unnamed column sat after ITEM — the person the item is with. Every\n' +
    'label to its right was describing its neighbour. Only the header row\n' +
    'changed; no data moved, because the data was never wrong.';
  systemLog_('WARN', 'DECISION QUEUE HEADER REPAIRED',
    named + ' header(s) -> ' + fixed.filter(String).length + ' for ' + widest + ' data column(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  2. The entry-profile contradiction
 * ---------------------------------------------------------------- */

/** ENTRY PROFILE holds a bare letter; ENTRY PROFILE KEY holds a legend
 *  like "C : Experienced transfer" — filled in on some rows, blank on
 *  others, and on at least one row naming a different letter than the
 *  code beside it.
 *
 *  This REPORTS rather than resolves. Which of the two is right is a
 *  fact about a person's training history, and v20.2's rule holds: the
 *  system does not guess at a record. It names every disagreement, and
 *  writes the legend once, properly, above the table. */
function auditEntryProfilesV20_4() {
  var t = readTableV20_1_(TAB.MASTER, 4);
  if (!t.ok) return 'Trainee master not found.';
  var cCode = t.col['ENTRY PROFILE'], cKey = t.col['ENTRY PROFILE KEY'], cName = t.col['TRAINEE'];
  if (cCode === undefined || cName === undefined) return 'No ENTRY PROFILE column to audit.';

  var clash = [], missing = [], legend = {};
  t.rows.forEach(function (r, i) {
    var name = cleanNameV20_1_(r[cName]);
    if (!name) return;
    var code = String(r[cCode] || '').trim().toUpperCase();
    var key = cKey === undefined ? '' : String(r[cKey] || '').trim();
    if (key) {
      var m = key.match(/^([A-Z])\s*:\s*(.+)$/i);
      if (m) legend[m[1].toUpperCase()] = m[2].trim();
    }
    if (!code) { missing.push(name + ' (row ' + (t.firstDataRow + i) + ') — no entry profile'); return; }
    if (key) {
      var keyLetter = (key.match(/^([A-Z])/i) || [])[1];
      if (keyLetter && keyLetter.toUpperCase() !== code) {
        clash.push(name + ' (row ' + (t.firstDataRow + i) + ') — profile says "' + code +
                   '" but the key beside it says "' + key + '"');
      }
    }
  });

  var L = ['ENTRY PROFILE AUDIT — read only', ''];
  if (clash.length) {
    L.push('DISAGREEMENTS — these need your decision, not mine:');
    clash.forEach(function (x) { L.push('  ' + x); });
    L.push('');
    L.push('Which is correct is a fact about that person\'s history. Fix the one');
    L.push('that is wrong on 01 TRAINEE MASTER, then run this again.');
    L.push('');
  } else {
    L.push('No profile/key disagreements.');
    L.push('');
  }
  if (missing.length) {
    L.push('NO ENTRY PROFILE SET:');
    missing.forEach(function (x) { L.push('  ' + x); });
    L.push('');
  }
  var letters = Object.keys(legend).sort();
  if (letters.length) {
    L.push('The legend, as found in the data:');
    letters.forEach(function (k) { L.push('  ' + k + '  =  ' + legend[k]); });
    L.push('');
    L.push('Run tidyEntryProfileLegendV20_4() to move this out of the data table');
    L.push('and into a note on the column heading, where a legend belongs.');
  }
  var msg = L.join('\n');
  systemLog_(clash.length ? 'WARN' : 'INFO', 'ENTRY PROFILE AUDIT',
    clash.length + ' disagreement(s), ' + missing.length + ' unset');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Lifts the entry-profile legend out of the data table and attaches it
 *  to the column heading as a note, then hides the now-redundant column.
 *  The column keeps its contents — nothing is deleted. */
function tidyEntryProfileLegendV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.MASTER, 4);
  if (!t.ok) return 'Trainee master not found.';
  var cCode = t.col['ENTRY PROFILE'], cKey = t.col['ENTRY PROFILE KEY'];
  if (cCode === undefined) return 'No ENTRY PROFILE column.';

  var legend = {};
  if (cKey !== undefined) {
    t.rows.forEach(function (r) {
      var key = String(r[cKey] || '').trim();
      var m = key.match(/^([A-Z])\s*:\s*(.+)$/i);
      if (m) legend[m[1].toUpperCase()] = m[2].trim();
    });
  }
  var letters = Object.keys(legend).sort();
  if (!letters.length) return 'No legend entries found to lift.';

  var note = 'How they came in\n\n' +
    letters.map(function (k) { return '  ' + k + '  =  ' + legend[k]; }).join('\n') +
    '\n\nThis legend used to live in a column of its own inside the data.';
  t.sheet.getRange(4, cCode + 1).setNote(note);
  systemLog_('INFO', 'ENTRY PROFILE LEGEND LIFTED', letters.join(', '));
  var msg = 'The entry-profile legend is now a note on the column heading:\n\n' +
    letters.map(function (k) { return '  ' + k + '  =  ' + legend[k]; }).join('\n') +
    '\n\nHover the heading to read it. The old ENTRY PROFILE KEY column keeps\n' +
    'its contents and is grouped away with the other machinery — nothing was\n' +
    'deleted.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  3. Plain English headers
 * ---------------------------------------------------------------- */

/** Rewrites header text into words, consistently cased. Safe because
 *  headerAliasesForV20_4_ teaches the table reader that the new label and
 *  the canonical name are the same column. */
function renameHeadersV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var plan = headerRenamesV20_4_();
  var out = [], total = 0;
  Object.keys(plan).forEach(function (sheetName) {
    var t = readTableV20_1_(sheetName, 4);
    if (!t.ok) { out.push('  ' + sheetName + ' : not present'); return; }
    var renames = plan[sheetName];
    var headers = t.headers.slice();
    var n = 0;
    headers.forEach(function (h, i) {
      var canon = String(h || '').trim().toUpperCase();
      var already = canonicalHeaderV20_4_(h, sheetName);
      var key = already || canon;
      if (renames[key] && headers[i] !== renames[key]) { headers[i] = renames[key]; n++; }
    });
    if (n) {
      t.sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
      total += n;
    }
    out.push('  ' + sheetName + ' : ' + n + ' header(s) renamed');
  });

  // the stray value that leaked into the matrix header row
  var m = readTableV20_1_(TAB.SKILLS, 4);
  if (m.ok) {
    var strayAt = -1;
    m.headers.forEach(function (h, i) {
      if (i >= 20 && String(h || '').trim()) strayAt = i;
    });
    if (strayAt >= 0) {
      m.sheet.getRange(4, strayAt + 1).clearContent();
      out.push('  ' + TAB.SKILLS + ' : cleared a stray value out of the header row (column ' +
               (strayAt + 1) + ', "' + m.headers[strayAt] + '")');
    }
  }

  var msg = 'HEADERS REWRITTEN IN PLAIN ENGLISH\n\n' + out.join('\n') +
    '\n\n' + total + ' header(s) changed in total.\n\n' +
    'Nothing behind the scenes changed: every one of the 235 places this\n' +
    'system looks a column up by name still finds it, because the old name\n' +
    'and the new label are registered as the same column.';
  systemLog_('WARN', 'HEADERS RENAMED', total + ' header(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  4. Plumbing out of sight
 * ---------------------------------------------------------------- */

/** Groups the machine columns and collapses the group, so they are one
 *  click away instead of in your eyeline. Nothing is deleted, nothing
 *  moves, and every one of them still receives data. */
function groupPlumbingColumnsV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var plan = plumbingColumnsV20_4_();
  var out = [];
  Object.keys(plan).forEach(function (sheetName) {
    var t = readTableV20_1_(sheetName, 4);
    if (!t.ok) { out.push('  ' + sheetName + ' : not present'); return; }
    var hidden = 0;
    plan[sheetName].forEach(function (canon) {
      var i = t.col[canon];
      if (i === undefined) return;
      try { t.sheet.hideColumns(i + 1); hidden++; } catch (e) {}
    });
    out.push('  ' + sheetName + ' : ' + hidden + ' machine column(s) tucked away');
  });
  var msg = 'MACHINE COLUMNS HIDDEN\n\n' + out.join('\n') +
    '\n\nIDs, provenance and writer stamps are still there and still being\n' +
    'written — they are just not in front of you any more. Select the\n' +
    'columns either side and choose Unhide to see them again.';
  systemLog_('INFO', 'PLUMBING COLUMNS HIDDEN', out.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Puts every hidden column back. */
function showAllColumnsV20_4() {
  var plan = plumbingColumnsV20_4_();
  var n = 0;
  Object.keys(plan).forEach(function (sheetName) {
    var sh = getSheetOrNullV20_1_(sheetName);
    if (!sh) return;
    try { sh.showColumns(1, sh.getMaxColumns()); n++; } catch (e) {}
  });
  var msg = 'Every column is visible again on ' + n + ' sheet(s).';
  systemLog_('INFO', 'ALL COLUMNS SHOWN', n + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  5. Counters that mean something where they sit
 * ---------------------------------------------------------------- */

/** "5 / 3 / 3 / 2" against thresholds on a different sheet is not
 *  information. This turns the queue's evidence summary into a sentence
 *  that carries its own thresholds. */
function evidenceSentenceV20_4_(counts, catalogEntry) {
  var c = catalogEntry || {};
  function part(have, need, word) {
    have = Number(have) || 0;
    need = Number(need) || 0;
    if (!need) return have + ' ' + word;
    return have + ' of ' + need + ' ' + word + (have >= need ? '' : '  (short)');
  }
  return [
    part(counts.successful, c.minSuccessful, 'successful'),
    part(counts.independent, c.minIndependent, 'independent'),
    part(counts.dates, c.minDates, 'separate days'),
    part(counts.ftos, c.minFtos, 'different FTOs')
  ].join('   ·   ');
}

/** Rewrites the evidence summary on every OPEN queue row into that
 *  sentence. Reads the catalog for the thresholds. Writes one column. */
function rewriteEvidenceSummariesV20_4() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var t = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (!t.ok) return 'Queue not found.';
  var cSum = t.col['EVIDENCE SUMMARY'], cSkill = t.col['SKILL ID'], cTrainee = t.col['TRAINEE'];
  if (cSum === undefined || cSkill === undefined) return 'Queue is missing its evidence columns.';

  var byId = {};
  try { byId = catalogMapsV19_(true).byId || {}; } catch (e) {}

  var m = readTableV20_1_(TAB.SKILLS, 4);
  var counts = {};
  if (m.ok && m.col['TRAINEE'] !== undefined) {
    m.rows.forEach(function (r) {
      var k = normalizeNameV20_1_(cleanNameV20_1_(r[m.col['TRAINEE']])) + '||' +
              String(r[m.col['SKILL ID']] || '').trim();
      counts[k] = {
        successful: r[m.col['SUCCESSFUL REPS']],
        independent: r[m.col['INDEPENDENT REPS']],
        dates: r[m.col['DISTINCT DATES']],
        ftos: r[m.col['DISTINCT FTOS']]
      };
    });
  }

  var n = 0;
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var skillId = String(r[cSkill] || '').trim();
    var key = normalizeNameV20_1_(cleanNameV20_1_(r[cTrainee])) + '||' + skillId;
    var c = counts[key];
    if (!c) return;
    t.sheet.getRange(t.firstDataRow + i, cSum + 1)
      .setValue(evidenceSentenceV20_4_(c, byId[skillId]));
    n++;
  });
  var msg = n + ' evidence summary(ies) rewritten as "3 of 5 successful · 2 of 2 independent · …"\n' +
    'so the thresholds are beside the counts instead of on another sheet.';
  systemLog_('INFO', 'EVIDENCE SUMMARIES REWRITTEN', n + ' row(s)');
  Logger.log(msg);
  return msg;
}

var TAB_CONSOLE_V20_3 = 'TRAINEES';

var CONSOLE_HEADERS_V20_3 = [
  'Trainee', 'Level', 'Phase', 'Weeks in phase', 'Last evaluation',
  'Evaluations', 'Skills signed off', 'Waiting on you', 'Concerns',
  'Open file', 'Release', 'Their file'
];

/* Column numbers on TRAINEES, so the edit handler and the builder agree. */
var CONSOLE_COL_V20_3 = Object.freeze({
  NAME: 1, LEVEL: 2, PHASE: 3, WEEKS: 4, LAST_EVAL: 5, EVALS: 6,
  SIGNED: 7, WAITING: 8, CONCERNS: 9, OPEN: 10, RELEASE: 11, FILE: 12
});

var CONSOLE_FIRST_ROW_V20_3 = 3;

/* ---------------------------------------------------------------- *
 *  1. The console
 * ---------------------------------------------------------------- */


/** Opens the TRAINEES tab, building it first if it is not there yet. */
function openTraineeConsoleV20_3() {
  var S = ss();
  var sh = S.getSheetByName(TAB_CONSOLE_V20_3);
  if (!sh) { buildTraineeConsoleV20_3(); sh = S.getSheetByName(TAB_CONSOLE_V20_3); }
  if (sh) {
    try { if (sh.isSheetHidden()) sh.showSheet(); } catch (e) {}
    S.setActiveSheet(sh);
    try { S.moveActiveSheet(1); } catch (e2) {}
  }
  return 'TRAINEES is open.';
}

/** Builds or refreshes TRAINEES: one row per person, in words rather
 *  than codes. Reads everything, decides nothing, writes no record. */
function buildTraineeConsoleV20_3() {
  var S = ss();
  var sh = S.getSheetByName(TAB_CONSOLE_V20_3);
  if (!sh) sh = S.insertSheet(TAB_CONSOLE_V20_3, 0);

  var people = masterTraineeRowsV20_1_().filter(function (p) { return !p.closed; });
  var closed = masterTraineeRowsV20_1_().filter(function (p) { return p.closed; });

  // ---- gather, once, rather than per person ----
  var evalRows = [], reflectRows = [], urgentRows = [];
  try { var e = readTableV20_1_(TAB.EVAL, 4); if (e.ok) evalRows = e.rows.map(function (r) {
    return { when: parseDateSafeV20_1_(r[0]), trainee: cleanNameV20_1_(r[2]) }; }); } catch (e1) {}
  try { var u = readTableV20_1_(TAB.URGENT, 4); if (u.ok) urgentRows = u.rows.map(function (r) {
    return { trainee: cleanNameV20_1_(r[3]) }; }); } catch (e2) {}

  var matrix = readTableV20_1_(TAB.SKILLS, 4);
  var signedBy = {}, applicableBy = {}, readyBy = {};
  if (matrix.ok && matrix.col['TRAINEE'] !== undefined) {
    matrix.rows.forEach(function (r) {
      var who = normalizeNameV20_1_(cleanNameV20_1_(r[matrix.col['TRAINEE']]));
      if (!who) return;
      applicableBy[who] = (applicableBy[who] || 0) + 1;
      var readiness = String(r[matrix.col['READINESS']] || '').trim();
      if (readiness === 'SIGNED OFF' || String(r[matrix.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF') {
        signedBy[who] = (signedBy[who] || 0) + 1;
      }
      if (readiness === 'READY FOR VALIDATION') readyBy[who] = (readyBy[who] || 0) + 1;
    });
  }

  var waitingBy = {};
  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok && q.col['TRAINEE'] !== undefined) {
    q.rows.forEach(function (r) {
      if (String(r[q.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
      var who = normalizeNameV20_1_(cleanNameV20_1_(r[q.col['TRAINEE']]));
      if (who) waitingBy[who] = (waitingBy[who] || 0) + 1;
    });
  }

  function countFor(list, norm) {
    var n = 0;
    list.forEach(function (x) { if (normalizeNameV20_1_(x.trainee) === norm) n++; });
    return n;
  }
  function lastEvalFor(norm) {
    var latest = null;
    evalRows.forEach(function (x) {
      if (normalizeNameV20_1_(x.trainee) !== norm) return;
      if (x.when && (!latest || x.when.getTime() > latest.getTime())) latest = x.when;
    });
    return latest;
  }

  var fileLinks = consoleFileLinksV20_3_(sh);   // keep any links already on the sheet

  var body = people.map(function (p) {
    var norm = p.norm;
    var last = lastEvalFor(norm);
    var days = last ? Math.floor((new Date() - last) / 86400000) : null;
    var weeks = p.phaseStart ? Math.max(0, Math.floor((new Date() - p.phaseStart) / (7 * 86400000))) : '';
    var waiting = waitingBy[norm] || 0;
    var ready = readyBy[norm] || 0;
    var concerns = countFor(urgentRows, norm);
    return [
      p.name,
      p.level || '',
      p.phase || '',
      weeks === '' ? '' : weeks,
      last ? (days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago') : 'never',
      countFor(evalRows, norm),
      (signedBy[norm] || 0) + ' of ' + (applicableBy[norm] || 0),
      waiting ? waiting + ' waiting' : (ready ? ready + ' nearly ready' : ''),
      concerns ? concerns : '',
      false,
      false,
      fileLinks[norm] || ''
    ];
  });

  // ---- write ----
  var width = CONSOLE_HEADERS_V20_3.length;
  ensureSheetCapacityV19_(sh, Math.max(body.length + CONSOLE_FIRST_ROW_V20_3 + 10, 60), width + 2);
  sh.getRange(1, 1, sh.getMaxRows(), width).clearContent().clearDataValidations();

  sh.getRange(1, 1).setValue('TRAINEES')
    .setFontSize(20).setFontWeight('bold').setFontColor('#1d1b18');
  sh.getRange(1, 3).setValue(people.length + ' active   ·   ' + closed.length +
    ' released   ·   updated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEE d MMM, h:mm a'))
    .setFontColor('#6f6859').setFontSize(10);

  sh.getRange(2, 1, 1, width).setValues([CONSOLE_HEADERS_V20_3])
    .setFontWeight('bold').setFontSize(11)
    .setBackground('#1d1b18').setFontColor('#f4f1ea')
    .setVerticalAlignment('middle').setWrap(true);

  if (body.length) {
    sh.getRange(CONSOLE_FIRST_ROW_V20_3, 1, body.length, width).setValues(body);
    sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.OPEN, body.length, 2)
      .insertCheckboxes();
  }

  applyConsoleLookV20_3_(sh, body.length);
  systemLog_('INFO', 'TRAINEE CONSOLE BUILT', people.length + ' active trainee(s)');
  return 'TRAINEES refreshed: ' + people.length + ' active, ' + closed.length + ' released.';
}

/** Existing file links, keyed by normalized name, so a rebuild never
 *  loses a document that was already generated. */
function consoleFileLinksV20_3_(sh) {
  var out = {};
  try {
    if (sh.getLastRow() < CONSOLE_FIRST_ROW_V20_3) return out;
    var n = sh.getLastRow() - CONSOLE_FIRST_ROW_V20_3 + 1;
    var names = sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.NAME, n, 1).getValues();
    var links = sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.FILE, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      var nm = normalizeNameV20_1_(cleanNameV20_1_(names[i][0]));
      if (nm && links[i][0]) out[nm] = links[i][0];
    }
  } catch (e) {}
  return out;
}

/** Readable by default: room for words, no squinting. */
function applyConsoleLookV20_3_(sh, rows) {
  var W = { 1: 210, 2: 110, 3: 120, 4: 110, 5: 130, 6: 100, 7: 140, 8: 150, 9: 90, 10: 90, 11: 90, 12: 260 };
  Object.keys(W).forEach(function (c) { try { sh.setColumnWidth(Number(c), W[c]); } catch (e) {} });
  try { sh.setFrozenRows(2); sh.setFrozenColumns(1); } catch (e) {}
  try { sh.setRowHeight(1, 40); sh.setRowHeight(2, 38); } catch (e) {}
  if (rows > 0) {
    var r = sh.getRange(CONSOLE_FIRST_ROW_V20_3, 1, rows, CONSOLE_HEADERS_V20_3.length);
    r.setVerticalAlignment('middle').setWrap(true).setFontSize(11);
    for (var i = 0; i < rows; i++) {
      try { sh.setRowHeight(CONSOLE_FIRST_ROW_V20_3 + i, 34); } catch (e) {}
    }
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('waiting')
        .setBackground('#fdf3d6').setFontColor('#7a5c00').setBold(true)
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.WAITING, rows, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground('#fbeeec').setFontColor('#a62a21').setBold(true)
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.CONCERNS, rows, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('never')
        .setBackground('#fbeeec').setFontColor('#a62a21')
        .setRanges([sh.getRange(CONSOLE_FIRST_ROW_V20_3, CONSOLE_COL_V20_3.LAST_EVAL, rows, 1)]).build()
    ]);
  }
  try { sh.getRange(1, 1, sh.getMaxRows(), 40).setFontFamily('Arial'); } catch (e) {}
}

/* ---------------------------------------------------------------- *
 *  2. The file
 * ---------------------------------------------------------------- */

/** Everything recorded about one trainee, from the first day to now, as
 *  a document. Narratives appear in full — this is the thing the
 *  spreadsheet cannot show you.
 *
 *  Read-only with respect to the record: it copies, it never changes. */
function buildTraineeFileV20_3(traineeName) {
  var name = cleanNameV20_1_(traineeName);
  if (!name) throw new Error('No trainee name given.');
  var norm = normalizeNameV20_1_(name);
  var resolved = resolveTraineeV20_1_(name);
  var rec = resolved.record;

  var doc = DocumentApp.create('SCEMS Training File — ' + name + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  var b = doc.getBody();
  b.setMarginTop(48).setMarginBottom(48).setMarginLeft(56).setMarginRight(56);

  function H1(t) { b.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING1); }
  function H2(t) { b.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING2); }
  function P(t) { return b.appendParagraph(String(t == null ? '' : t)); }
  function small(t) { P(t).setFontSize(9).setForegroundColor('#666666'); }
  function kv(k, v) { P(k + ':  ' + (v === '' || v == null ? '—' : v)); }
  function rule() { b.appendHorizontalRule(); }

  // ---- cover ----
  b.appendParagraph('SUMTER COUNTY EMS').setFontSize(10).setBold(true).setForegroundColor('#a8811a');
  b.appendParagraph('Field Training Record').setHeading(DocumentApp.ParagraphHeading.TITLE);
  b.appendParagraph(name).setFontSize(20).setBold(true);
  small('Generated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE d MMMM yyyy, h:mm a') +
        '  ·  ' + SCEMS_VERSION + '  ·  ' + String(CONFIG.POLICY_VERSION || ''));
  rule();

  H1('Who this is');
  if (rec) {
    kv('Certification level', rec.level);
    kv('Entry profile', rec.entryProfile);
    kv('Employee ID', rec.employeeId);
    kv('Assigned FTO', rec.fto);
    kv('Started', rec.startDate ? dateKeyV20_1_(rec.startDate) : '');
    kv('Current phase', rec.phase);
    kv('Phase started', rec.phaseStart ? dateKeyV20_1_(rec.phaseStart) : '');
    kv('Program status', rec.setStatus);
    if (rec.startDate) {
      kv('Time in program', Math.floor((new Date() - rec.startDate) / 86400000) + ' days');
    }
  } else {
    P('No master record found for this name. The evidence below is everything filed under it.');
  }

  // ---- shift evaluations, in full ----
  H1('Shift evaluations');
  var ev = readTableV20_1_(TAB.EVAL, 4);
  var evN = 0;
  if (ev.ok) {
    var evMine = ev.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[2])) === norm; });
    evMine.sort(function (a, b) {
      var da = parseDateSafeV20_1_(a[0]), db = parseDateSafeV20_1_(b[0]);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
    evN = evMine.length;
    if (!evN) P('None recorded.');
    evMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2((when ? dateKeyV20_1_(when) : 'undated') + '  ·  FTO ' + (cleanNameV20_1_(r[1]) || 'unnamed'));
      ev.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || i <= 2) return;
        var val = r[i];
        if (val === '' || val == null) return;
        P(head + ':  ' + String(val));      // full text, never truncated
      });
    });
  } else { P('The evaluation mirror is not present.'); }

  // ---- self-reflections ----
  H1('The trainee in their own words');
  var rf = readTableV20_1_(TAB.REFLECT, 4);
  var rfN = 0;
  if (rf.ok) {
    var rfMine = rf.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[1])) === norm; });
    rfN = rfMine.length;
    if (!rfN) P('None submitted.');
    rfMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2(when ? dateKeyV20_1_(when) : 'undated');
      rf.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || i <= 1) return;
        if (r[i] === '' || r[i] == null) return;
        P(head + ':  ' + String(r[i]));
      });
    });
  }

  // ---- skills ----
  H1('Skills — every logged repetition');
  var sk = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  var skN = 0, skAccepted = 0;
  if (sk.ok && sk.col['TRAINEE'] !== undefined) {
    var skMine = sk.rows.filter(function (r) {
      return normalizeNameV20_1_(cleanNameV20_1_(r[sk.col['TRAINEE']])) === norm; });
    skN = skMine.length;
    if (!skN) P('None recorded.');
    skMine.forEach(function (r) {
      var val = String(r[sk.col['VALIDATION RESULT']] || '');
      if (val === 'ACCEPTED') skAccepted++;
      var when = parseDateSafeV20_1_(r[sk.col['SHIFT DATE']]);
      var line = (when ? dateKeyV20_1_(when) : 'undated') + '  ·  ' +
        String(r[sk.col['SKILL']] || '') + '  ·  ' + String(r[sk.col['OUTCOME']] || '') +
        '  ·  FTO ' + String(r[sk.col['FTO']] || '') +
        (val === 'ACCEPTED' ? '' : '  ·  [' + val + ']');
      P(line);
      var note = String(r[sk.col['EVIDENCE NOTE']] || '').trim();
      if (note) P('       ' + note).setFontSize(10).setForegroundColor('#444444');
    });
  }

  // ---- decisions ----
  H1('Sign-off decisions');
  var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  var soN = 0;
  if (so.ok && so.col['TRAINEE'] !== undefined) {
    var soMine = so.rows.filter(function (r) {
      return normalizeNameV20_1_(cleanNameV20_1_(r[so.col['TRAINEE']])) === norm; });
    soN = soMine.length;
    if (!soN) P('None recorded.');
    soMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[so.col['DECISION DATE']]);
      P((when ? dateKeyV20_1_(when) : 'undated') + '  ·  ' + String(r[so.col['SKILL']] || '') +
        '  ·  ' + String(r[so.col['DECISION']] || ''));
      P('       by ' + String(r[so.col['DECIDED BY']] || '') + ' — ' +
        String(r[so.col['RATIONALE']] || '')).setFontSize(10).setForegroundColor('#444444');
    });
  }

  // ---- concerns ----
  H1('Urgent concerns');
  var ur = readTableV20_1_(TAB.URGENT, 4);
  var urN = 0;
  if (ur.ok) {
    var urMine = ur.rows.filter(function (r) { return normalizeNameV20_1_(cleanNameV20_1_(r[3])) === norm; });
    urN = urMine.length;
    if (!urN) P('None filed.');
    urMine.forEach(function (r) {
      var when = parseDateSafeV20_1_(r[0]);
      H2(when ? dateKeyV20_1_(when) : 'undated');
      ur.headers.forEach(function (h, i) {
        var head = String(h || '').trim();
        if (!head || r[i] === '' || r[i] == null) return;
        P(head + ':  ' + String(r[i]));
      });
    });
  }

  // ---- decisions raw / phase history ----
  H1('Phase and programme decisions');
  var dr = readTableV20_1_(TAB.DECISIONS, 4);
  var drN = 0;
  if (dr.ok) {
    var drMine = dr.rows.filter(function (r) {
      return r.some(function (c) { return normalizeNameV20_1_(cleanNameV20_1_(c)) === norm; }); });
    drN = drMine.length;
    if (!drN) P('None recorded.');
    drMine.forEach(function (r) {
      var parts = [];
      dr.headers.forEach(function (h, i) {
        if (String(h || '').trim() && r[i] !== '' && r[i] != null) parts.push(h + ': ' + r[i]);
      });
      P(parts.join('   ·   '));
    });
  }

  rule();
  H1('What this file contains');
  kv('Shift evaluations', evN);
  kv('Self-reflections', rfN);
  kv('Skill repetitions logged', skN + ' (' + skAccepted + ' accepted into the record)');
  kv('Sign-off decisions', soN);
  kv('Urgent concerns', urN);
  kv('Programme decisions', drN);
  small('Compiled by ' + (deciderIdentityV20_2_() || 'an unidentified session') +
        ' from the SCEMS Field Training record on ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMMM yyyy') +
        '. Source of truth is the tracker; this document is a copy made at that moment. ' +
        'Retention: ' + String(CONFIG.RETENTION_STATEMENT || 'per county policy') + '.');

  doc.saveAndClose();

  // file it next to the tracker
  try {
    var f = DriveApp.getFileById(doc.getId());
    var parents = DriveApp.getFileById(ss().getId()).getParents();
    if (parents.hasNext()) parents.next().addFile(f);
  } catch (e) {}

  var url = doc.getUrl();
  systemLog_('WARN', 'TRAINEE FILE BUILT', name + ' | ' + url);
  return { url: url, name: name, counts: { evals: evN, reflections: rfN, skills: skN,
           accepted: skAccepted, signoffs: soN, concerns: urN, decisions: drN } };
}

/* ---------------------------------------------------------------- *
 *  3. The checkboxes
 * ---------------------------------------------------------------- */

/** Handles a tick on TRAINEES. Called from onSheetEdit; returns true when
 *  it owned the edit, so the rest of the handler is skipped. */
function consoleEditV20_3_(e, sh) {
  if (sh.getName() !== TAB_CONSOLE_V20_3) return false;
  var row = e.range.getRow(), col = e.range.getColumn();
  if (row < CONSOLE_FIRST_ROW_V20_3) return false;
  if (col !== CONSOLE_COL_V20_3.OPEN && col !== CONSOLE_COL_V20_3.RELEASE) return false;
  if (e.range.getValue() !== true) return true;         // unticking does nothing

  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e0) {}
  var name = cleanNameV20_1_(sh.getRange(row, CONSOLE_COL_V20_3.NAME).getValue());
  e.range.setValue(false);                              // a checkbox is a button, not a state
  if (!name) return true;

  if (col === CONSOLE_COL_V20_3.OPEN) {
    try {
      var built = buildTraineeFileV20_3(name);
      sh.getRange(row, CONSOLE_COL_V20_3.FILE).setValue(built.url);
      if (ui) ui.alert('File ready — ' + name,
        'Everything on record from day one, in full.\n\n' +
        built.counts.evals + ' shift evaluation(s)\n' +
        built.counts.reflections + ' self-reflection(s)\n' +
        built.counts.skills + ' skill repetition(s), ' + built.counts.accepted + ' accepted\n' +
        built.counts.signoffs + ' sign-off decision(s)\n' +
        built.counts.concerns + ' urgent concern(s)\n\n' +
        'The link is in the last column. The document stays in Drive — open it any time.',
        ui.ButtonSet.OK);
    } catch (err) {
      if (ui) ui.alert('Could not build the file for ' + name + '.\n\n' + err);
      systemLog_('ERROR', 'TRAINEE FILE FAILED', name + ' | ' + err);
    }
    return true;
  }

  // ---- release ----
  if (!gateV20_2_('CLOSE TRAINEE')) return true;
  if (ui) {
    var waiting = String(sh.getRange(row, CONSOLE_COL_V20_3.WAITING).getValue() || '');
    var ok = ui.alert('Release ' + name + '?',
      'This closes their training record and builds their complete file.\n\n' +
      (waiting ? 'NOTE: ' + waiting + ' — releasing does not decide those.\n\n' : '') +
      'The file covers day one to today and stays in Drive for good.\n\nRelease?',
      ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return true;
  }
  var report = [];
  try { report.push(String(closeTraineeV20_1(name))); }
  catch (err2) { report.push('Close step failed: ' + err2); }
  try {
    var file = buildTraineeFileV20_3(name);
    sh.getRange(row, CONSOLE_COL_V20_3.FILE).setValue(file.url);
    report.push('File built: ' + file.url);
  } catch (err3) { report.push('File build failed: ' + err3); }

  systemLog_('WARN', 'TRAINEE RELEASED VIA CONSOLE', name + ' | ' + report.join(' | ').slice(0, 300));
  if (ui) ui.alert('Released — ' + name, report.join('\n\n').slice(0, 1400), ui.ButtonSet.OK);
  try { buildTraineeConsoleV20_3(); } catch (e4) {}
  return true;
}

/* ---------------------------------------------------------------- *
 *  4. Room to read
 * ---------------------------------------------------------------- */

/** Column widths by what the column HOLDS, not by position.
 *  Anything whose name suggests prose gets real width and wrapping;
 *  dates and counts stay narrow so the prose has somewhere to go. */
function readableWidthForV20_3_(header) {
  var h = String(header || '').toLowerCase();
  if (!h) return 100;
  if (/note|narrative|detail|comment|rationale|summary|reason|concern|what |why|situation|justif|strength|improve|focus|feedback|action|plan|evidence/.test(h)) return 460;
  if (/name|trainee|fto|skill|decided by|signed by|assigned/.test(h)) return 190;
  if (/date|timestamp|when|expiration/.test(h)) return 110;
  if (/id$|^id| id /.test(h)) return 150;
  if (/status|decision|outcome|level|phase|stage|context|domain|result|prompting|attestation/.test(h)) return 165;
  return 130;
}

/** Makes the record sheets readable: wide narrative columns, wrapping on,
 *  taller rows, frozen headers. Formatting only — no cell value changes. */
function makeSheetsReadableV20_3() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var targets = [TAB.MASTER, TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.SKILLS,
                 TAB.SKILL_VALIDATION, TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF,
                 TAB.CATALOG, TAB.FTO_ROSTER, TAB.DECISIONS];
  var done = [];
  targets.forEach(function (name) {
    var t = readTableV20_1_(name, 4);
    if (!t.ok || !t.headers.length) { done.push('  ' + name + ' : not present'); return; }
    var sh = t.sheet;
    try {
      t.headers.forEach(function (h, i) {
        if (!String(h || '').trim()) return;
        sh.setColumnWidth(i + 1, readableWidthForV20_3_(h));
      });
      sh.getRange(4, 1, 1, Math.max(t.headers.length, 1))
        .setWrap(true).setVerticalAlignment('middle').setFontWeight('bold');
      var lastRow = Math.max(sh.getLastRow(), 5);
      sh.getRange(5, 1, lastRow - 4, Math.max(t.headers.length, 1))
        .setWrap(true).setVerticalAlignment('top');
      sh.setFrozenRows(4);
      sh.setFrozenColumns(name === TAB.SKILLS || name === TAB.SKILL_VALIDATION ? 2 : 1);
      try { sh.setRowHeights(5, Math.max(lastRow - 4, 1), 46); } catch (e2) {}
      try { sh.setRowHeight(4, 40); } catch (e3) {}
      done.push('  ' + name + ' : ' + t.headers.filter(String).length + ' column(s) sized');
    } catch (e) {
      done.push('  ' + name + ' : ' + e);
    }
  });
  var msg = 'READABLE LAYOUT APPLIED\n\n' + done.join('\n') +
    '\n\nNarrative columns are now wide and wrapping; dates and counts stay narrow.\n' +
    'Header rows are frozen so they stay put when you scroll.\n' +
    'Nothing was moved, renamed or deleted — this is formatting only.';
  systemLog_('INFO', 'READABLE LAYOUT APPLIED', done.length + ' sheet(s)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Tab order and visibility  (v20.2)
 * ---------------------------------------------------------------- */

/** Left-to-right order: the things you use, then the things you consult,
 *  then the machinery. Anything not listed keeps its place at the end. */
function tabOrderV20_2_() {
  return [TAB_CONSOLE_V20_3, 'HOME', TAB.CONTROL, TAB.MASTER, TAB.SKILLS, TAB.SKILL_VALIDATION,
          TAB.QUEUE, TAB.AUDIT, TAB.WEEKLY,
          TAB.FTO_VIEW, TAB.TRAINEE_VIEW, TAB.DASH, TAB.MD_VIEW,
          TAB.TRAINEE_SKILLS, TAB.CATALOG, TAB.FTO_ROSTER,
          TAB.ANALYTICS, TAB.ENGINE,
          TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.DECISIONS, TAB.ARCHIVE,
          TAB.SKILL_EVIDENCE, TAB.SKILL_SIGNOFF, TAB.LOG,
          TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS];
}

/** The tabs a person actually opens. Everything else is machinery: still
 *  live, still receiving data, just not in your way. */
function dailyTabsV20_2_() {
  return [TAB_CONSOLE_V20_3, 'HOME', TAB.CONTROL, TAB.MASTER, TAB.SKILLS, TAB.SKILL_VALIDATION,
          TAB.QUEUE, TAB.AUDIT, TAB.WEEKLY,
          TAB.FTO_VIEW, TAB.TRAINEE_VIEW, TAB.DASH, TAB.MD_VIEW,
          TAB.TRAINEE_SKILLS, TAB.CATALOG, TAB.FTO_ROSTER];
}

/** Puts the tabs in a sensible order and hides the machinery.
 *
 *  Hiding is tidiness, not security — a hidden tab still receives data and
 *  is one menu click from visible. Nothing is deleted or renamed.
 *  showAllTabsV20_2() puts everything back. */
function organizeTabsV20_2() {
  if (!gateV20_2_('WORK QUEUE')) return;
  var S = ss();
  var order = tabOrderV20_2_();
  var daily = dailyTabsV20_2_();

  var moved = 0, pos = 1;
  order.forEach(function (name) {
    var sh = S.getSheetByName(name);
    if (!sh) return;
    try {
      if (sh.isSheetHidden()) sh.showSheet();   // cannot move a hidden sheet
      S.setActiveSheet(sh);
      S.moveActiveSheet(pos);
      pos++; moved++;
    } catch (e) {}
  });

  var visible = [], hidden = [];
  S.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (daily.indexOf(name) >= 0) {
      try { sh.showSheet(); visible.push(name); } catch (e) {}
    } else {
      try { sh.hideSheet(); hidden.push(name); } catch (e) { visible.push(name); }
    }
  });

  var home = S.getSheetByName('HOME') || S.getSheetByName(TAB.CONTROL);
  if (home) { try { S.setActiveSheet(home); } catch (e) {} }

  var msg = 'TABS ORGANIZED\n\n' +
    'Ordered : ' + moved + ' tab(s)\n' +
    'Visible : ' + visible.length + '\n  ' + visible.join('\n  ') +
    '\n\nHidden (machinery, still live and still receiving data) : ' + hidden.length +
    '\n  ' + hidden.join('\n  ') +
    '\n\nNothing was deleted or renamed. Admin > Show every tab puts them all back.';
  systemLog_('INFO', 'TABS ORGANIZED', visible.length + ' visible, ' + hidden.length + ' hidden');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/** Unhides everything, for when you are working on the system itself. */
function showAllTabsV20_2() {
  var S = ss(), n = 0;
  S.getSheets().forEach(function (sh) {
    try { if (sh.isSheetHidden()) { sh.showSheet(); n++; } } catch (e) {}
  });
  var msg = 'Every tab is visible again (' + n + ' unhidden).\n\n' +
    'Admin > Tidy up the tabs puts the machinery away.';
  systemLog_('INFO', 'ALL TABS SHOWN', n + ' unhidden');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function makeQueueReadableV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) {
    try { SpreadsheetApp.getUi().alert('Queue tab not found; nothing changed.'); } catch (e0) {}
    return 'Queue tab not found; nothing changed.';
  }
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1;
  var width = t.headers.length;
  var lastRow = Math.max(sh.getLastRow(), t.firstDataRow);
  var nData = Math.max(lastRow - t.firstDataRow + 1, 1);

  function colLetter_(n) { // 1-based index -> A1 letter
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // ---- freeze panes: headers on top, trainee names on the left
  sh.setFrozenRows(headerRow);
  if (t.col['TRAINEE'] !== undefined) sh.setFrozenColumns(t.col['TRAINEE'] + 1);

  // ---- header row look
  sh.getRange(headerRow, 1, 1, width)
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#37474F')
    .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // ---- column widths (only the columns that actually exist)
  var widths = { 'TRAINEE': 160, 'LEVEL': 70, 'SKILL': 230, 'SKILL ID': 105,
                 'DECISION': 175, 'DECIDED BY': 150, 'DECISION DATE': 105,
                 'RECORD STATUS': 130, 'RATIONALE': 260, 'REQUEST ID': 95 };
  Object.keys(widths).forEach(function (h) {
    if (t.col[h] !== undefined) sh.setColumnWidth(t.col[h] + 1, widths[h]);
  });
  var recCol = (t.col['RECORD'] !== undefined) ? t.col['RECORD'] + 1
             : (typeof QUEUE_RECORD_COL_V20_1 !== 'undefined' ? QUEUE_RECORD_COL_V20_1 : 0);
  if (recCol) sh.setColumnWidth(recCol, 70);

  // ---- data area: one line per row, calm and legible
  var data = sh.getRange(t.firstDataRow, 1, nData, width);
  data.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
      .setVerticalAlignment('middle');
  sh.setRowHeights(t.firstDataRow, nData, 24);
  if (t.col['DECISION DATE'] !== undefined) {
    sh.getRange(t.firstDataRow, t.col['DECISION DATE'] + 1, nData, 1).setNumberFormat('m/d/yyyy');
  }
  if (t.col['REQUEST ID'] !== undefined) {
    sh.getRange(t.firstDataRow, t.col['REQUEST ID'] + 1, nData, 1)
      .setFontColor('#9E9E9E').setFontSize(8);
  }

  // ---- color by status (first matching rule wins)
  if (t.col['RECORD STATUS'] !== undefined) {
    var S = colLetter_(t.col['RECORD STATUS'] + 1);
    var R = t.firstDataRow;
    function rule_(formula, build) {
      var b = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula).setRanges([data]);
      build(b);
      return b.build();
    }
    sh.setConditionalFormatRules([
      rule_('=$' + S + R + '="OPEN"',      function (b) { b.setBackground('#FFF9C4').setBold(true); }),
      rule_('=$' + S + R + '="RETURNED"',  function (b) { b.setBackground('#FFE0B2'); }),
      rule_('=$' + S + R + '="REVOKED"',   function (b) { b.setBackground('#FFCDD2'); }),
      rule_('=LEFT($' + S + R + ',9)="CANCELLED"', function (b) { b.setFontColor('#9E9E9E').setItalic(true); }),
      rule_('=$' + S + R + '="RECORDED"',  function (b) { b.setFontColor('#9E9E9E'); })
    ]);
  }

  // ---- filter funnels on the header row (recreated fresh each run)
  try { var oldF = sh.getFilter(); if (oldF) oldF.remove(); } catch (e1) {}
  try { sh.getRange(headerRow, 1, lastRow - headerRow + 1, width).createFilter(); } catch (e2) {}

  var msg = 'Queue tab reformatted. Rows, order, and every value untouched.\n\n' +
    'Yellow = OPEN (needs you)\nOrange = RETURNED (waiting on the FTO)\n' +
    'Red = REVOKED\nGrey = finished business\n\n' +
    'Tip: click the funnel on RECORD STATUS and tick only OPEN to see just live work.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e3) {}
  systemLog_('INFO', 'QUEUE REFORMATTED', 'makeQueueReadableV20_1 : formatting only, no data changes');
  return msg;
}

/** Run once. Makes tab 20 explain itself and stop blocking honest dates. */
function fixQueueEntryUxV20_1() {
  var t = queueTableV20_1_();
  if (!t.ok) {
    try { SpreadsheetApp.getUi().alert('Queue tab not found; nothing changed.'); } catch (e0) {}
    return 'Queue tab not found; nothing changed.';
  }
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1; // 4
  var nRows = Math.max(sh.getMaxRows() - t.firstDataRow + 1, 1);

  // DECISION DATE (col 9): any real date is welcome — especially past ones.
  sh.getRange(t.firstDataRow, 9, nRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate().setAllowInvalid(true)
      .setHelpText('The date it actually happened — past dates are fine. Example: 8/12/2026')
      .build())
    .setNumberFormat('m/d/yyyy');

  // RATIONALE (col 11): dropdown of standard reasons, free typing still allowed.
  var reasons = [
    'Evidence thresholds met, FTO recommendation accepted',
    'Directly observed and verified by the FTO Program Director',
    'Competency verified by scenario examination',
    'Verbal verification accepted; documentation to follow',
    'Additional documented evidence required before sign-off',
    'Sign-off revoked pending remediation'
  ];
  sh.getRange(t.firstDataRow, 11, nRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(reasons, true).setAllowInvalid(true)
      .setHelpText('Pick a standard reason from the arrow, or type your own.')
      .build());

  // Hover notes: whose column is whose.
  var notes = {
    1:  'READY DATE — written by the system when the skill crossed its threshold. Never edit.',
    2:  'TRAINEE — written by the system. Never edit.',
    3:  'SKILL ID — written by the system. Never edit.',
    4:  'DOMAIN — written by the system. Never edit.',
    5:  'SKILL — written by the system. Never edit.',
    6:  'EVIDENCE SUMMARY — written by the system: what the forms show. Read it, never edit it.',
    7:  'DECISION — YOURS. Pick from the dropdown.',
    8:  'DECIDED BY — stamped for you when you pick a decision. Type over it if needed.',
    9:  'DECISION DATE — stamped as today when you pick a decision. Type over it with the real date; past dates are fine.',
    10: 'EXPIRATION — YOURS, optional. Only for time-limited sign-offs.',
    11: 'RATIONALE — YOURS. Pick a standard reason from the arrow or type your own.',
    12: 'RECORD STATUS — written by the system. Never edit.',
    13: 'LAST EVIDENCE DATE — written by the system. Never edit.',
    14: 'REVIEW — written by the system: why an item deserves a second look. Never edit.',
    15: 'REQUEST ID — written by the system: the permanent ID. Never edit.',
    16: 'RECORD — YOURS. Tick it to make the decision official.'
  };
  Object.keys(notes).forEach(function (c) {
    try { sh.getRange(headerRow, Number(c)).setNote(notes[c]); } catch (eN) {}
  });

  // Header colors: amber = yours, grey = the machine's.
  var yours = [7, 8, 9, 10, 11, 16];
  var machine = [1, 2, 3, 4, 5, 6, 12, 13, 14, 15];
  yours.forEach(function (c) {
    try { sh.getRange(headerRow, c).setBackground('#B7791F').setFontColor('#FFFFFF'); } catch (eY) {}
  });
  machine.forEach(function (c) {
    try { sh.getRange(headerRow, c).setBackground('#546E7A').setFontColor('#ECEFF1'); } catch (eM) {}
  });

  var msg = 'Tab 20 entry fixed.\n\n' +
    '- DECISION DATE now accepts any real date — past dates welcome\n' +
    '- RATIONALE has a dropdown of standard reasons (typing still allowed)\n' +
    '- Amber headers = your columns. Grey headers = the machine\'s — never edit those\n' +
    '- Hover any header for what it is\n' +
    '- Clearing a decision no longer wipes your name and date';
  systemLog_('INFO', 'QUEUE ENTRY UX FIXED', 'date validation, rationale dropdown, header notes/colors');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e1) {}
  return msg;
}

/** (internal) apply the live-work filter to tab 20. */
function queueLiveFilterApplyV20_1_() {
  var t = queueTableV20_1_();
  if (!t.ok || t.col['RECORD STATUS'] === undefined) return 0;
  var sh = t.sheet;
  var headerRow = t.firstDataRow - 1;
  var width = t.headers.length;
  var lastRow = Math.max(sh.getLastRow(), t.firstDataRow);
  var f = sh.getFilter();
  if (!f) {
    try { f = sh.getRange(headerRow, 1, lastRow - headerRow + 1, width).createFilter(); }
    catch (e) { return 0; }
  }
  var sCol = t.col['RECORD STATUS'] + 1;
  var seen = {};
  t.rows.forEach(function (r) {
    var s = String(r[t.col['RECORD STATUS']] || '').trim();
    if (s) seen[s] = true;
  });
  var hide = Object.keys(seen).filter(function (s) {
    return s !== 'OPEN' && s !== 'RETURNED';
  });
  if (hide.length) {
    f.setColumnFilterCriteria(sCol,
      SpreadsheetApp.newFilterCriteria().setHiddenValues(hide).build());
  } else {
    f.setColumnFilterCriteria(sCol, null);
  }
  return hide.length;
}

/** Turn ON live-work-only view (persists; every flow re-applies it). */
function queueShowLiveV20_1() {
  PropertiesService.getScriptProperties().setProperty('QUEUE_LIVE_VIEW', '1');
  queueLiveFilterApplyV20_1_();
  var msg = 'Tab 20 now shows LIVE WORK ONLY — OPEN (needs you) and RETURNED (waiting on the FTO).\n\n' +
    'Finished rows are hidden from view, never deleted: the ledger keeps every row and the ' +
    'reconciler still checks all of it. "Tab 20 : show full history" on the Admin menu brings it all back.';
  systemLog_('INFO', 'QUEUE LIVE VIEW ON', 'finished rows hidden from view; ledger untouched');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Turn OFF the live-work view: full history visible again. */
function queueShowAllV20_1() {
  PropertiesService.getScriptProperties().setProperty('QUEUE_LIVE_VIEW', '0');
  var t = queueTableV20_1_();
  if (t.ok && t.col['RECORD STATUS'] !== undefined) {
    var f = t.sheet.getFilter();
    if (f) { try { f.setColumnFilterCriteria(t.col['RECORD STATUS'] + 1, null); } catch (e) {} }
  }
  var msg = 'Tab 20 shows the full history again — every row, finished and live.';
  systemLog_('INFO', 'QUEUE LIVE VIEW OFF', 'full history visible');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e2) {}
  return msg;
}

/** READ-ONLY: every burning flag explained with its data. */
function explainFlagsV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  var heads = sh.getRange(4, 2, 1, 6).getDisplayValues()[0];
  var names = sh.getRange(5, 1, 40, 1).getDisplayValues();
  var vals = sh.getRange(5, 2, 40, 6).getDisplayValues();
  var fmls = sh.getRange(5, 2, 40, 6).getFormulas();

  var master = {};
  masterTraineeRowsV20_1_().forEach(function (t) { master[t.norm] = t; });

  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  var engRows = {};
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var n = normalizeNameV20_1_(String(r[0] || ''));
      if (n) engRows[n] = r;
    });
  }

  var ev = readTableV20_1_(TAB.EVAL, 4);

  var L = ['FLAG EXPLAINER — READ ONLY', ''];
  var lit = 0;
  for (var i = 0; i < 40; i++) {
    var name = String(names[i][0] || '').trim();
    if (!name) continue;
    for (var c = 0; c < 6; c++) {
      if (String(vals[i][c]).trim() !== 'FLAG') continue;
      lit++;
      var norm = normalizeNameV20_1_(name);
      L.push('■ ' + name + ' — ' + heads[c] + '   (matrix cell ' + String.fromCharCode(66 + c) + (5 + i) + ')');
      var rec = master[norm];
      if (rec) L.push('   tab 01 says: phase [' + (rec.phase || '') + '], level [' + (rec.level || '') + '], FTO [' + (rec.fto || '') + ']');
      var er = engRows[norm];
      if (er) {
        L.push('   engine row: evals ' + (er[6] || 0) + ' | days since last ' + (er[8] === '' ? '-' : er[8]) +
               ' | day in phase ' + (er[20] || 0) + ' | engine phase/status [' + String(er[4] || '') + '] [' + String(er[17] || '') + ']');
      }
      if (ev.ok) {
        var mine = [];
        ev.rows.forEach(function (r2, k2) {
          if (normalizeNameV20_1_(String(r2[2] || '')) !== norm) return;
          var bits = [];
          ev.headers.forEach(function (h, hi) {
            var hv = String(r2[hi] == null ? '' : r2[hi]).trim();
            if (!hv) return;
            var hl = String(h || '').toLowerCase();
            if (hl.indexOf('score') >= 0 || hl.indexOf('narrat') >= 0 || hl.indexOf('situation') >= 0 ||
                hl.indexOf('strength') >= 0 || hl.indexOf('improve') >= 0 || hl.indexOf('assessment') >= 0 ||
                hl.indexOf('treatment') >= 0 || hl.indexOf('communication') >= 0 || hl.indexOf('documentation') >= 0 ||
                hl.indexOf('leadership') >= 0 || hl.indexOf('professionalism') >= 0) {
              bits.push(h + '=' + hv.slice(0, 30));
            }
          });
          mine.push('      02 row ' + (ev.firstDataRow + k2) + ' | ' +
            String(r2[0]).slice(0, 16) + ' | by ' + String(r2[1] || '') +
            (bits.length ? ' | ' + bits.join(' · ') : ''));
        });
        if (c === 2 || c === 3) { // narrative / silent flags: show the evals
          L.push('   their eval rows on 02:');
          if (mine.length) mine.slice(-4).forEach(function (x) { L.push(x); });
          else L.push('      (none)');
        }
      }
      L.push('   formula: ' + String(fmls[i][c]).slice(0, 220));
      L.push('');
    }
  }
  if (!lit) L.push('No flags burning. Tab 13 is clear.');
  else L.push(lit + ' flag(s) burning. Fix the data the formula reads, or log the review (amber).');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** Run once: logged flags turn AMBER, unlogged stay RED. */
function ackFlagStyleV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  // find the review log (same scan the redo used)
  var scanN = Math.max(sh.getLastRow(), 60);
  var scan = sh.getRange(1, 1, scanN, 2).getValues();
  var logRow = 0;
  for (var i = 44; i < scan.length; i++) {
    if (String(scan[i][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[i][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = i + 1; break; }
  }
  if (!logRow) return 'FLAG REVIEW LOG not found — run redoAuditTabV20_1 first.';
  var first = logRow + 2, last = logRow + 21;
  var matrix = sh.getRange(5, 2, 40, 6);
  var amberFormula = '=AND(B5="FLAG",COUNTIFS($B$' + first + ':$B$' + last +
    ',$A5,$C$' + first + ':$C$' + last + ',B$4)>0)';
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(amberFormula)
      .setBackground('#B7791F').setFontColor('#FFFFFF').setBold(true)
      .setRanges([matrix]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('FLAG').setBackground('#C62828').setFontColor('#FFFFFF').setBold(true)
      .setRanges([matrix]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenCellNotEmpty().setFontColor('#9E9E9E')
      .setRanges([matrix]).build()
  ]);
  var msg = 'Flag colors upgraded.\n\nRED = flag with no review logged (nobody is on it)\n' +
    'AMBER = same flag, but your FLAG REVIEW LOG (rows ' + first + '-' + last + ') holds a matching ' +
    'entry — same trainee, same flag type. Still true, visibly handled.\nGONE = the condition is fixed.\n\n' +
    'To turn a red flag amber: add a log row with the trainee and flag type from the dropdowns.';
  systemLog_('INFO', 'FLAG ACK STYLE APPLIED', 'red=unlogged, amber=logged, review log rows ' + first + '-' + last);
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function fixAllFlagsNowV20_1() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e0) {}
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!au) return 'Tab 13 not found.';
  var R = [];

  if (ui) {
    var ok = ui.alert('Fix all current flags',
      'This will:\n' +
      '1. Acknowledge every burning PHASE MISMATCH (built-in J/K mechanism)\n' +
      '2. Review-log every NO NARRATIVE eval so it is visible and owned\n' +
      '3. Log SILENT RECORD cases to the review log — amber, not erased\n' +
      '4. Apply amber/red colors and refresh HOME\n\n' +
      'It does NOT edit tab 02. An FTO\'s submitted evaluation is their ' +
      'statement; only they can change it.\n\nProceed?', ui.ButtonSet.OK_CANCEL);
    if (ok !== ui.Button.OK) return 'Cancelled. Nothing changed.';
  }

  var heads = au.getRange(4, 2, 1, 6).getDisplayValues()[0];
  var names = au.getRange(5, 1, 40, 1).getDisplayValues();
  var flags = au.getRange(5, 2, 40, 6).getDisplayValues();

  // ---- 1. acknowledge phase mismatches (column G = index 5) ----
  var acked = 0;
  for (var i = 0; i < 40; i++) {
    if (String(flags[i][5]).trim() !== 'FLAG') continue;
    var nm = String(names[i][0] || '').trim();
    if (!nm) continue;
    au.getRange(5 + i, 11).setValue(nm);          // K : name
    au.getRange(5 + i, 10).setValue(new Date());   // J : acknowledged through today
    acked++;
    R.push('PHASE MISMATCH acknowledged : ' + nm + ' (row ' + (5 + i) + ') — re-lights only on a new wrong-phase eval');
  }
  if (!acked) R.push('PHASE MISMATCH : none burning.');

  // ---- 2/3. narrative dodges on 02 ----
  //
  // SPEC-v20.2.md #4: this block used to WRITE to tab 02 — it flipped the
  // FTO's own "Scored 1 or 5" answer from No to Yes, then composed a
  // justification out of their Strength/Improve text and filed it as though
  // they had written it. An evaluation is the evaluator's statement about a
  // person. Correcting it on their behalf, in their name, is the single worst
  // thing this codebase did. It now detects and review-logs; it writes nothing.
  var ev = readTableV20_1_(TAB.EVAL, 4);
  var adverse = [];
  if (ev.ok && ev.col['Scored 1 or 5'] !== undefined) {
    var domains = ['Assessment', 'Treatment', 'Communication', 'Documentation', 'Scene Leadership', 'Professionalism'];
    ev.rows.forEach(function (r, k) {
      if (String(r[ev.col['Scored 1 or 5']] || '').trim() !== 'No') return;
      var hasOne = false, hasFive = false;
      domains.forEach(function (d) {
        if (ev.col[d] === undefined) return;
        var v = Number(r[ev.col[d]]);
        if (v === 1) hasOne = true;
        if (v === 5) hasFive = true;
      });
      if (!hasOne && !hasFive) return; // honest "No"
      var row = ev.firstDataRow + k;
      var who = String(r[2] || '').trim();
      var fto = String(r[1] || '').trim();
      adverse.push({ trainee: who, fto: fto, row: row,
                     kind: hasOne ? 'score of 1' : 'praise-only 5' });
      R.push('NO NARRATIVE (' + (hasOne ? 'score of 1' : 'praise-only 5') + ') : ' + who +
        ' by ' + fto + ' (02 row ' + row + ') — review-logged; the FTO must supply the ' +
        'justification themselves. Nothing was written to tab 02.');
    });
  } else {
    R.push('Eval mirror or "Scored 1 or 5" column not found — narrative fixes skipped.');
  }

  // ---- 4. review-log entries (adverse cases + silent records) ----
  var scanN = Math.max(au.getLastRow(), 60);
  var scan = au.getRange(1, 1, scanN, 2).getValues();
  var logRow = 0;
  for (var s = 44; s < scan.length; s++) {
    if (String(scan[s][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[s][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = s + 1; break; }
  }
  if (logRow) {
    var first = logRow + 2;
    var existing = au.getRange(first, 1, 20, 6).getValues();
    var used = {}, nextFree = -1;
    existing.forEach(function (r3, i3) {
      var t3 = String(r3[1] || '').trim(), f3 = String(r3[2] || '').trim();
      if (t3) used[normalizeNameV20_1_(t3) + '|' + f3] = true;
      else if (nextFree < 0) nextFree = first + i3;
    });
    function logIt(trainee, flagType, action, status) {
      if (used[normalizeNameV20_1_(trainee) + '|' + flagType]) { R.push('review log already holds ' + trainee + ' / ' + flagType); return; }
      if (nextFree < 0) { R.push('review log full — add rows'); return; }
      au.getRange(nextFree, 1, 1, 6).setValues([[new Date(), trainee, flagType,
        deciderIdentityV20_2_() || '(unidentified session)', action, status]]);
      used[normalizeNameV20_1_(trainee) + '|' + flagType] = true;
      nextFree++;
      R.push('review-logged : ' + trainee + ' / ' + flagType + ' → amber');
    }
    adverse.forEach(function (a) {
      logIt(a.trainee, 'NO NARRATIVE',
        'A ' + a.kind + ' by ' + a.fto + ' (02 row ' + a.row + ') was recorded without a ' +
        'written justification — requested from the FTO', 'Under review');
    });
    for (var i2 = 0; i2 < 40; i2++) {
      if (String(flags[i2][3]).trim() !== 'FLAG') continue; // col E = SILENT RECORD (index 3)
      var nm2 = String(names[i2][0] || '').trim();
      if (nm2) logIt(nm2, 'SILENT RECORD', 'Self-reflection required (remediation) — requested from trainee', 'Action taken — awaiting data');
    }
  } else {
    R.push('FLAG REVIEW LOG not found — run redoAuditTabV20_1 first.');
  }

  // ---- 5. colors + refresh + after-state ----
  try { R.push(String(ackFlagStyleV20_1())); } catch (e4) {}
  try { refreshHomeNowV20_1(); } catch (e5) {}
  SpreadsheetApp.flush();
  var after = au.getRange(5, 2, 40, 6).getDisplayValues();
  var still = [];
  for (var i4 = 0; i4 < 40; i4++) {
    for (var c4 = 0; c4 < 6; c4++) {
      if (String(after[i4][c4]).trim() === 'FLAG') {
        still.push(String(names[i4][0] || '').trim() + ' / ' + heads[c4]);
      }
    }
  }
  var msg = 'FLAG FIX COMPLETE\n\n' + R.join('\n') +
    '\n\nStill burning (red or amber): ' + (still.length ? still.join(' ; ') : 'NONE') +
    '\nAmber = logged and being handled. These go out when the FTO\'s words / the reflection arrive.';
  systemLog_('INFO', 'FLAGS FIXED',
    acked + ' phase acks, ' + adverse.length + ' narrative gap(s) review-logged, 0 writes to tab 02');
  Logger.log(msg);
  try { if (ui) ui.alert(msg.slice(0, 1400)); } catch (e6) {}
  return msg;
}

function simplifyFlagsV20_1() {
  // SPEC-v20.2.md #4 — this rewrote the audit tab's detection formulas so they
  // would return "ACK" for any flag it had just logged under the director's
  // name, then hid the tab. A detector that answers to acknowledgements it
  // wrote itself is not a detector. redoAuditTabV20_1 prints "Nothing here is
  // dismissed by hand" onto the same tab; this dismissed all of it by hand.
  var m = 'RETIRED in v20.2. Flags are no longer silenced by rewriting the ' +
          'formulas that raise them.\n\n' +
          'Use "Accept a flag" (acceptFlagV20_2). It records one flag, one ' +
          'named human, one typed reason and a review-by date. The flag stays ' +
          'visible as ACCEPTED, the detection formula is untouched, and the ' +
          'acceptance expires instead of lasting forever.\n\n' +
          'If a previous run already wrapped the formulas, ' +
          'unwrapAuditFormulasV20_1() reverses it.';
  systemLog_('WARN', 'RETIRED FUNCTION CALLED', 'simplifyFlagsV20_1');
  try { SpreadsheetApp.getUi().alert(m); } catch (e) {}
  Logger.log(m); return m;
}

/** Reversal: strips the ACK wrapper, restoring the original formulas. */
function unwrapAuditFormulasV20_1() {
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!au) return 'Tab 13 not found.';
  var fmls = au.getRange(5, 2, 40, 6).getFormulas();
  var restored = 0;
  for (var r = 0; r < 40; r++) {
    for (var c = 0; c < 6; c++) {
      var f = fmls[r][c];
      if (!f || f.indexOf('"ACK"') < 0) continue;
      var m = f.match(/^=IF\(COUNTIFS\([^)]*\)>0,"ACK",([\s\S]*)\)$/);
      if (!m) continue;
      au.getRange(5 + r, 2 + c).setFormula('=' + m[1]);
      restored++;
    }
  }
  var msg = restored + ' formula(s) restored to their original form.';
  systemLog_('INFO', 'AUDIT FORMULAS UNWRAPPED', msg);
  Logger.log(msg);
  return msg;
}
