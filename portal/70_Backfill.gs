/**
 * The responses that never made it into a tab.
 *
 * A Google Form keeps every response whether or not anything is listening.
 * When a form has no submit trigger bound to it, the answers are still there
 * — they are simply sitting in the form instead of in the tracker. The
 * combined skills log is in exactly that state and has sixteen of them.
 *
 * This file finds them, shows you what they say, and can put them where they
 * were always meant to go. Three rules govern it:
 *
 *   1. A preview writes nothing, in any mode. You see the whole plan first.
 *   2. Writing refuses outside STAGING, so the sandbox proves it before the
 *      live tracker is ever considered.
 *   3. Nothing is dropped to make the shape fit. An answer this code cannot
 *      map to a column is written into the notes column with its question
 *      attached, and if there is nowhere to put it the response is refused
 *      rather than written incomplete.
 *
 * Re-running is safe. Every row carries the form response id it came from and
 * a response already present is skipped, so a second run adds nothing.
 */

/** Question titles that mean the same thing as a column but do not read the
 *  same. Left side is what a form asks, right side is the column it belongs
 *  in. Matching is done on letters and digits only, so case, punctuation and
 *  spacing never matter. */
var PORTAL_ANSWER_ALIASES = {
  'FTONAME':            'FTO',
  'YOURNAME':           'FTO',
  'EVALUATORNAME':      'FTO',
  'TRAININGOFFICER':    'FTO',
  'TRAINEENAME':        'TRAINEE',
  'WHICHTRAINEE':       'TRAINEE',
  'DATEOFEVENT':        'EVENT DATE',
  'SHIFTDATE':          'EVENT DATE',
  'DATE':               'EVENT DATE',
  'SKILLPERFORMED':     'SKILL',
  'WHICHSKILL':         'SKILL',
  'LEVELOFASSISTANCE':  'STAGE',
  'PROMPTINGLEVEL':     'STAGE',
  'RESULT':             'OUTCOME',
  'WASITSUCCESSFUL':    'OUTCOME',
  'COMMENTS':           'NOTE',
  'NOTES':              'NOTE',
  'ADDITIONALCOMMENTS': 'NOTE'
};

function bareV1_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** The column a question belongs in, or '' when nothing matches. */
function columnForAnswerV1_(question, headers) {
  var q = bareV1_(question);
  if (!q) return '';
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && bareV1_(headers[i]) === q) return headers[i];
  }
  var alias = PORTAL_ANSWER_ALIASES[q];
  if (!alias) return '';
  for (var j = 0; j < headers.length; j++) {
    if (headers[j] && bareV1_(headers[j]) === bareV1_(alias)) return headers[j];
  }
  return '';
}

/** Every response on one form, oldest first, as plain data. Read only. */
function formResponsesV1_(entry) {
  var form = FormApp.openById(entry.id);
  return form.getResponses().map(function (r) {
    var answers = [];
    r.getItemResponses().forEach(function (ir) {
      var v = ir.getResponse();
      if (v === null || v === undefined || v === '') return;
      answers.push({
        question: String(ir.getItem().getTitle() || ''),
        value: (v instanceof Array) ? v.join(', ') : String(v)
      });
    });
    var who = '';
    try { who = String(r.getRespondentEmail() || ''); } catch (e) { who = ''; }
    return { id: String(r.getId()), at: r.getTimestamp(), email: who, answers: answers };
  });
}

/** Which column on the destination tab holds the id of the response a row
 *  came from. Without one there is no way to tell a re-run from a duplicate,
 *  so the plan stops rather than risk writing the same evidence twice. */
function responseIdColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /SOURCE RESPONSE ID|RESPONSE ID/i.test(t.headers[i])) return t.headers[i];
  }
  return '';
}

function notesColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /^(NOTE|NOTES|COMMENT|COMMENTS|DETAIL|WHAT HAPPENED)/i.test(t.headers[i])) {
      return t.headers[i];
    }
  }
  return '';
}

/** What backfilling one form would do. Builds every row in full and returns
 *  it. Writes nothing, in any mode. */
function backfillPlanV1_(entry) {
  var plan = { key: entry.key, title: entry.title, dest: entry.landsIn || '',
               total: 0, present: 0, missing: [], blocked: [], problem: '' };

  if (!entry.landsIn) { plan.problem = 'This form has no destination tab, so there is nowhere to put its responses.'; return plan; }

  var t = readTabV1_(entry.landsIn);
  if (!t.ok) { plan.problem = 'The tab ' + entry.landsIn + ' is not in this spreadsheet.'; return plan; }

  var idCol = responseIdColumnV1_(t);
  if (!idCol) {
    plan.problem = entry.landsIn + ' has no response id column, so a second run ' +
      'could not tell an already-imported response from a new one. Nothing will be written.';
    return plan;
  }
  var noteCol = notesColumnV1_(t);

  var seen = {};
  t.rows.forEach(function (r) {
    var v = String(r[t.col[idCol.toUpperCase()]] || '').trim();
    if (v) seen[v] = true;
  });

  var responses;
  try { responses = formResponsesV1_(entry); }
  catch (e) { plan.problem = 'Could not read the form: ' + (e.message || e); return plan; }

  plan.total = responses.length;

  responses.forEach(function (resp) {
    if (seen[resp.id]) { plan.present++; return; }

    var mapped = {}, spare = [];
    resp.answers.forEach(function (a) {
      var col = columnForAnswerV1_(a.question, t.headers);
      if (!col) { spare.push(a); return; }
      // A question that belongs in the notes column goes in as it was
      // written. Only an answer with no column of its own carries its
      // question with it, because there the question is the label.
      mapped[col] = (col === noteCol && mapped[col])
        ? (mapped[col] + '\n' + a.value) : a.value;
    });

    // Everything that did not land in a column of its own goes into the notes
    // column with its question attached. Losing an answer to make the shape
    // fit is the one thing this must not do.
    var extra = spare.map(function (a) { return a.question + ': ' + a.value; }).join('\n');
    if (extra && !noteCol) {
      plan.blocked.push({ id: resp.id, at: resp.at, why:
        entry.landsIn + ' has no notes column, and ' + spare.length +
        ' answer(s) have nowhere to go. Add a NOTE column or these stay in the form.',
        answers: resp.answers });
      return;
    }
    if (extra) {
      mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + extra) : extra;
    }
    mapped[idCol] = resp.id;

    plan.missing.push({
      id: resp.id,
      at: resp.at,
      email: resp.email,
      mapped: mapped,
      unmappedCount: spare.length,
      row: t.headers.map(function (h) {
        if (!h) return '';
        var v = mapped[h];
        return v === undefined ? '' : clean_(v);
      })
    });
  });

  return plan;
}

/** Every form's plan. Read only. */
function backfillPlanAllV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.landsIn; })
    .map(function (f) { return backfillPlanV1_(f); });
}

/** What would be imported, and what would not. Writes nothing, in any mode,
 *  so this is safe to run against the live tracker. */
function backfillPreview() {
  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL PREVIEW  (read only, nothing was written)', '',
               'Target : ' + safeTargetNameV1_(),
               'Mode   : ' + safeModeV1_() +
                 (mayWriteV1_() ? '  writes allowed' : '  READ ONLY, nothing can be written'), ''];
  var totalMissing = 0, totalBlocked = 0;

  plans.forEach(function (p) {
    lines.push(p.title + '  (' + p.key + ')');
    if (p.problem) { lines.push('  cannot import: ' + p.problem); lines.push(''); return; }
    lines.push('  responses on the form : ' + p.total);
    lines.push('  already in ' + p.dest + ' : ' + p.present);
    lines.push('  would be added        : ' + p.missing.length);
    if (p.blocked.length) lines.push('  would be REFUSED      : ' + p.blocked.length);
    totalMissing += p.missing.length;
    totalBlocked += p.blocked.length;

    p.missing.slice(0, 5).forEach(function (m) {
      lines.push('    ' + (m.at ? m.at.toDateString() : 'no date') + '  ' +
        (m.mapped['TRAINEE'] || m.mapped['Trainee'] || '(no trainee named)') +
        (m.unmappedCount ? '   ' + m.unmappedCount + ' answer(s) into notes' : ''));
    });
    if (p.missing.length > 5) lines.push('    ... and ' + (p.missing.length - 5) + ' more');
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
    lines.push('');
  });

  lines.push('---');
  lines.push(totalMissing + ' response(s) would be added, ' + totalBlocked + ' refused.');
  lines.push('');
  if (!mayWriteV1_()) {
    lines.push('This portal is in ' + safeModeV1_() + ' mode and will not write. To try the');
    lines.push('import for real, run pointAtStaging() and then backfillIntoStaging().');
  } else {
    lines.push('Run backfillIntoStaging() to write these into the sandbox.');
  }
  return noteV1_(lines.join('\n'));
}

function safeTargetNameV1_() {
  try { return targetBookV1_().getName(); } catch (e) { return '(not pointed anywhere)'; }
}

/** Writes the missing responses in. Refuses outside STAGING.
 *
 *  Idempotent: a response already carrying its id in the destination tab is
 *  skipped, so running this twice adds nothing the second time. */
function backfillIntoStaging() {
  requireStagingV1_('import historical form responses');

  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL', '', 'Target : ' + safeTargetNameV1_(), ''];
  var written = 0, refused = 0;

  plans.forEach(function (p) {
    if (p.problem) { lines.push(p.title + ' : skipped — ' + p.problem); return; }
    if (!p.missing.length && !p.blocked.length) {
      lines.push(p.title + ' : nothing to add (' + p.present + ' already in ' + p.dest + ')');
      return;
    }
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { lines.push(p.title + ' : skipped — ' + p.dest + ' disappeared'); return; }

    p.missing.forEach(function (m) { sh.appendRow(m.row); written++; });
    refused += p.blocked.length;
    lines.push(p.title + ' : ' + p.missing.length + ' added to ' + p.dest +
      (p.blocked.length ? ', ' + p.blocked.length + ' refused' : ''));
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
  });

  forgetTabsV1_();
  auditV1_('BACKFILL', whoIsAskingV1_(), written + ' rows written, ' + refused + ' refused');

  lines.push('');
  lines.push(written + ' row(s) written, ' + refused + ' refused.');
  lines.push('Every row carries the form response id it came from, so running');
  lines.push('this again adds nothing.');
  return noteV1_(lines.join('\n'));
}
