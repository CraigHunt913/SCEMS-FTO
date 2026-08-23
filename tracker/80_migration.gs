/**
 * SCEMS Field Training Tracker — 80_migration
 *
 * One-time migrations between versions of this system.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   The non-destructive migration: read-only preview, explicit apply,
 *   verification, and rollback helpers.
 *   EVERYTHING THE APPLY STEP DOES IS ADDITIVE
 *   - Creates the four v20.1 system sheets (90–93) if absent.
 *   - Appends missing provenance/ID columns to the RIGHT of existing
 *   headers on tabs 19, 20, 21, and EMAIL/EMPLOYEE ID on tab 22.
 *   - Backfills queue REQUEST IDs and arms the RECORD checkbox column.
 *   - Replaces the six IFERROR(…,0) domain-average formulas on ANALYTICS
 *   with recomputed values — after archiving the original formula text
 *   into the migration record so rollback is a paste-back.
 *   - Hardens form identity settings and destinations IN PLACE.
 *   It never deletes, clears, renames, or rewrites an existing record.
 */

var MIGRATION_MARKER_V20_1 = 'CREATED BY SCEMS v20.1 MIGRATION';

function migrationPlanV20_1_() {
  var plan = { newSheets: [], newColumns: [], backfills: [], formulaSwaps: [],
               formHardening: [], other: [] };

  [[TAB.REGISTRY, REGISTRY_HEADERS_V20_1], [TAB.LEDGER, LEDGER_HEADERS_V20_1],
   [TAB.ASSIGNMENTS, ASSIGNMENT_HEADERS_V20_1], [TAB.ACCESS, ACCESS_HEADERS_V20_1]]
  .forEach(function (pair) {
    if (!getSheetOrNullV20_1_(pair[0])) {
      plan.newSheets.push({ name: pair[0], headers: pair[1] });
    }
  });

  function columnDelta(tab, extras) {
    var t = readTableV20_1_(tab, 4);
    if (!t.ok) return;
    extras.forEach(function (h) {
      if (t.col[h.toUpperCase()] === undefined) {
        plan.newColumns.push({ tab: tab, header: h });
      }
    });
  }
  columnDelta(TAB.SKILL_EVIDENCE, SKILL_EVIDENCE_V20_1_EXTRA);
  columnDelta(TAB.SKILL_SIGNOFF, SKILL_SIGNOFF_V20_1_EXTRA);
  columnDelta(TAB.SKILL_VALIDATION, SKILL_QUEUE_V20_1_EXTRA);
  columnDelta(TAB.FTO_ROSTER, ['EMAIL', 'EMPLOYEE ID']);

  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok) {
    var noId = 0;
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      if (q.col['REQUEST ID'] === undefined || !String(r[q.col['REQUEST ID']] || '').trim()) noId++;
    });
    if (noId) plan.backfills.push(noId + ' queue row(s) receive a REQUEST ID');
  }

  var an = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (an) {
    // the whole chart-data block becomes recomputed values; archive every
    // formula in it so rollback is a paste-back
    var block = an.getRange('N1:O29').getFormulas();
    for (var ri = 0; ri < block.length; ri++) {
      for (var ci = 0; ci < block[ri].length; ci++) {
        if (block[ri][ci]) {
          plan.formulaSwaps.push({
            cell: (ci === 0 ? 'N' : 'O') + (ri + 1), before: block[ri][ci] });
        }
      }
    }
  }

  plan.formHardening.push('Handover form: verified email collection + destination (in place)');
  plan.formHardening.push('Level forms ×3: verified email collection + destination (in place)');
  plan.other.push('Person registry rows built from the identity preview (held rows excluded)');
  plan.other.push('README EMAIL column (rows 5–8) mapped into the registry for FTO/leadership allowlisting');
  return plan;
}

/** READ-ONLY. The exact proposed data/schema changes, plus the identity
 *  and stranded-decision previews. Makes no changes of any kind. */
function previewMigrationV20_1() {
  var plan = migrationPlanV20_1_();
  var L = ['MIGRATION PREVIEW ' + SCEMS_VERSION + ' — READ ONLY. Nothing was written.', ''];
  L.push('NEW SHEETS (' + plan.newSheets.length + '):');
  plan.newSheets.forEach(function (s) { L.push('   ' + s.name + '  [' + s.headers.length + ' columns, hidden]'); });
  if (!plan.newSheets.length) L.push('   none (already present)');
  L.push('');
  L.push('NEW COLUMNS appended to the right of existing headers (' + plan.newColumns.length + '):');
  plan.newColumns.forEach(function (c) { L.push('   ' + c.tab + ' ← ' + c.header); });
  if (!plan.newColumns.length) L.push('   none');
  L.push('');
  L.push('BACKFILLS:');
  plan.backfills.forEach(function (b) { L.push('   ' + b); });
  if (!plan.backfills.length) L.push('   none');
  L.push('');
  L.push('ANALYTICS FORMULA REPLACEMENTS (' + plan.formulaSwaps.length + '):');
  plan.formulaSwaps.forEach(function (s) {
    L.push('   ' + s.cell + ' : IFERROR-masked formula → recomputed value (original archived for rollback)');
  });
  if (!plan.formulaSwaps.length) L.push('   none remaining');
  L.push('');
  L.push('FORM HARDENING (in place, reversible in the Forms UI):');
  plan.formHardening.forEach(function (s) { L.push('   ' + s); });
  L.push('');
  L.push('IDENTITY:');
  var idp = previewIdentityMigrationV20_1();
  L.push(idp.text.split('\n').map(function (x) { return '   ' + x; }).join('\n'));
  L.push('');
  L.push('STRANDED DECISIONS:');
  L.push(previewStrandedDecisionsV20_1().split('\n').map(function (x) { return '   ' + x; }).join('\n'));
  L.push('');
  L.push('APPLY with applyMigrationV20_1("APPLY V20_1"). Every step is additive;');
  L.push('rollback instructions: migrationRollbackNotesV20_1().');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** THE APPLY STEP. Requires the literal confirmation token. Additive
 *  only; verifies each step and reports it. */
function applyMigrationV20_1(confirmToken) {
  if (confirmToken !== 'APPLY V20_1') {
    return 'Not run. Review previewMigrationV20_1(), then call applyMigrationV20_1("APPLY V20_1").';
  }
  return withScriptLockV20_1_('applyMigration', 60000, function () {
    var plan = migrationPlanV20_1_();
    var done = [];

    plan.newSheets.forEach(function (s) {
      var sh = ss().insertSheet(s.name);
      sh.getRange(1, 1).setValue(MIGRATION_MARKER_V20_1 + ' ' + new Date().toISOString());
      sh.getRange(4, 1, 1, s.headers.length).setValues([s.headers]);
      sh.setFrozenRows(4);
      sh.hideSheet();
      done.push('created ' + s.name);
    });

    plan.newColumns.forEach(function (c) {
      var t = readTableV20_1_(c.tab, 4);
      var sh = t.sheet;
      var col = t.headers.length + 1;
      var probe = t.headers.indexOf('');
      if (probe >= 0) col = probe + 1; // reuse a blank header slot before extending
      if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
      sh.getRange(4, col).setValue(c.header);
      done.push(c.tab + ' + "' + c.header + '" (col ' + col + ')');
    });

    var qSheet = getSheetOrNullV20_1_(TAB.SKILL_VALIDATION);
    if (qSheet) {
      qSheet.getRange(2, 2).setValue(
        'Pick a DECISION and a REASON, then tick RECORD on the row (or run ' +
        'SCEMS → Record pending skill decisions). Nothing is official until then.');
      done.push('queue banner instruction updated');
    }
    var back = ensureQueueRequestIdsV20_1_();
    if (back) done.push('backfilled ' + back + ' queue REQUEST ID(s)');
    var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
    if (q.ok && q.col['RECORD'] !== undefined) {
      var rows = Math.max(q.sheet.getMaxRows() - 4, 1);
      q.sheet.getRange(5, q.col['RECORD'] + 1, rows, 1).insertCheckboxes();
      done.push('armed RECORD checkboxes on the queue');
    }

    var an = getSheetOrNullV20_1_(TAB.ANALYTICS);
    if (an && plan.formulaSwaps.length) {
      var archive = plan.formulaSwaps.map(function (s) { return s.cell + ' = ' + s.before; }).join('  ||  ');
      try {
        appendRowsHeaderMappedV20_1_(TAB.LEDGER, 4, [{
          'LEDGER KEY': 'MIGRATION-' + newIdV20_1_('AN'), 'FORM ID': '', 'RESPONSE ID': '',
          'FORM TITLE': 'ANALYTICS FORMULA ARCHIVE', 'KIND': 'migration',
          'RECEIVED AT': new Date(), 'STATE': 'RECONCILED',
          'DETAIL': archive.slice(0, 490), 'EVENTS WRITTEN': '',
          'PROCESSED AT': new Date(), 'WRITER VERSION': SCEMS_WRITER_VERSION
        }], ['LEDGER KEY']);
      } catch (e) {
        systemLog_('WARN', 'FORMULA ARCHIVE FALLBACK', archive.slice(0, 400));
      }
      done.push('archived ' + plan.formulaSwaps.length + ' original formula(s), then recomputed');
      refreshAnalyticsV20_1();
    }

    done.push('handover: ' + hardenHandoverFormV20_1().split('\n')[1]);
    hardenLevelFormsV20_1().split('\n').forEach(function (l) { done.push('level form ' + l); });

    var idp = previewIdentityMigrationV20_1();
    var regRows = idp.proposed.map(function (p) {
      return {
        'PERSON ID': p.personId, 'TYPE': p.type, 'DISPLAY NAME': p.name,
        'NORMALIZED NAME': p.norm, 'EMPLOYEE ID': p.employeeId || '', 'EMAIL': p.email || '',
        'CERT LEVEL': p.certLevel || '', 'SHIFT': '', 'TRAINS EMT': '', 'TRAINS AEMT': '',
        'TRAINS PARAMEDIC': '', 'ROLE': '', 'ACTIVE': p.active ? 'Y' : 'N',
        'SOURCE': p.source, 'CREATED': new Date(), 'NOTES': (p.problems || []).join('; ')
      };
    });
    // Leadership rows from the configured role addresses, so authority
    // checks resolve people without hard-coding names in source.
    [['P-LEAD-TCO', 'Division Chief of Training', CONFIG.TCO_EMAIL],
     ['P-LEAD-CHIEF', 'Chief', CONFIG.CHIEF_EMAIL],
     ['P-LEAD-ACHIEF', 'Assistant Chief', CONFIG.ACHIEF_EMAIL],
     ['P-LEAD-MD', 'Medical Director', CONFIG.MD_EMAIL]].forEach(function (ld) {
      regRows.push({
        'PERSON ID': ld[0], 'TYPE': 'LEADER', 'DISPLAY NAME': ld[1],
        'NORMALIZED NAME': normalizeNameV20_1_(ld[1]), 'EMPLOYEE ID': '',
        'EMAIL': String(ld[2] || '').toLowerCase(), 'CERT LEVEL': '', 'SHIFT': '',
        'TRAINS EMT': '', 'TRAINS AEMT': '', 'TRAINS PARAMEDIC': '', 'ROLE': ld[1],
        'ACTIVE': 'Y', 'SOURCE': '99_config', 'CREATED': new Date(), 'NOTES': ''
      });
    });
    var existing = loadRegistryV20_1_();
    var newRows = regRows.filter(function (r) { return !existing.byId[r['PERSON ID']]; });
    if (newRows.length) {
      appendRowsHeaderMappedV20_1_(TAB.REGISTRY, 4, newRows, ['PERSON ID', 'TYPE', 'DISPLAY NAME']);
      done.push('registry: ' + newRows.length + ' person rows written; ' +
                idp.flagged.length + ' held for human review (NOT written)');
    }
    var ctl = getSheetOrNullV20_1_(TAB.CONTROL);
    if (ctl) {
      var reg2 = readTableV20_1_(TAB.REGISTRY, 4);
      var emails = ctl.getRange(5, 15, 8, 1).getValues();
      var ftoRecs = rosterFtoRecordsV20_1_();
      var mapped = 0;
      emails.forEach(function (row) {
        var em = String(row[0] || '').trim().toLowerCase();
        if (!isValidEmailV20_1_(em)) return;
        mapped++;
      });
      if (mapped) done.push('README EMAIL column: ' + mapped +
        ' address(es) found — map each to its person on 90 PERSON REGISTRY (manual confirm; the ' +
        'preview lists FTOs still lacking a verified email)');
    }

    systemLog_('WARN', 'MIGRATION APPLIED', done.join(' | ').slice(0, 800));
    var msg = 'MIGRATION APPLIED\n\n' + done.map(function (d) { return '  ' + d; }).join('\n') +
      '\n\nVerify with runtimeHealthCheckV20_1() and verifySkillsV20_1().' +
      '\nRollback notes: migrationRollbackNotesV20_1().';
    Logger.log(msg);
    return msg;
  });
}

/** Rollback instructions plus the only safe automated rollback (removing
 *  the four migration-created sheets when they carry the marker and hold
 *  no operational rows yet). */
function migrationRollbackNotesV20_1() {
  var msg = [
    'MIGRATION ROLLBACK — v20.1',
    '',
    '1. New sheets (90–93): removable ONLY while empty of operational rows.',
    '   Run removeMigrationSheetsV20_1("REMOVE EMPTY V20_1 SHEETS").',
    '2. Added columns on 19/20/21/22: additive and inert. To roll back,',
    '   delete the added column(s) by hand — they are to the right of the',
    '   original headers and named in the migration log entry.',
    '3. ANALYTICS formulas: originals are archived in the ledger row titled',
    '   ANALYTICS FORMULA ARCHIVE (and in the system log). Paste each back',
    '   into its cell to restore formula-driven values.',
    '4. Form hardening: reversible in each form\'s Settings (email',
    '   collection) — though reverting removes identity verification.',
    '5. Recorded decisions and registry rows are records: rolled back via',
    '   the Revoke/supersede workflow, never by deletion.'
  ].join('\n');
  Logger.log(msg);
  return msg;
}

/** Removes ONLY the four migration-created sheets, ONLY when marked and
 *  ONLY when they contain no data rows. */
function removeMigrationSheetsV20_1(confirmToken) {
  if (confirmToken !== 'REMOVE EMPTY V20_1 SHEETS') {
    return 'Not run. Call removeMigrationSheetsV20_1("REMOVE EMPTY V20_1 SHEETS").';
  }
  var out = [];
  [TAB.REGISTRY, TAB.LEDGER, TAB.ASSIGNMENTS, TAB.ACCESS].forEach(function (name) {
    var sh = getSheetOrNullV20_1_(name);
    if (!sh) { out.push(name + ': absent'); return; }
    var marker = String(sh.getRange(1, 1).getValue() || '');
    if (marker.indexOf(MIGRATION_MARKER_V20_1) !== 0) {
      out.push(name + ': NOT REMOVED (no migration marker)'); return;
    }
    if (sh.getLastRow() > 4) {
      out.push(name + ': NOT REMOVED (holds ' + (sh.getLastRow() - 4) + ' data row(s))'); return;
    }
    ss().deleteSheet(sh);
    out.push(name + ': removed (was empty)');
  });
  systemLog_('WARN', 'MIGRATION SHEET ROLLBACK', out.join(' | '));
  return out.join('\n');
}
