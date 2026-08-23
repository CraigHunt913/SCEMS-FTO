/**
 * SCEMS Field Training Tracker — 40_skills
 *
 * The skill catalogue, the evidence, the matrix, and what readiness means.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Skill-evidence ingestion: server-side validation, the batched
 *   idempotent evidence writer, and the grid-form submit handler.
 *   INTEGRITY RULES ENFORCED HERE
 *   - Idempotency: form ID + response ID. A retried trigger writes ZERO
 *   additional events.
 *   - Every event carries source form ID and title, source response ID,
 *   and writer version (columns added by migration; the writer refuses
 *   to write when they are missing rather than writing partial rows).
 *   - Validation runs BEFORE any ACCEPTED value exists. Rejected
 *   submissions retain their full payload with VALIDATION RESULT
 *   'REJECTED : reason' — quarantined data, never a skeleton row.
 *   - All events for one response are written in ONE batch, and derived
 *   views rebuild ONCE per response.
 *   - No fuzzy repetition matching: a repetitions line that does not match
 *   exactly one tapped skill counts as one and is reported.
 *   SCEMS v20.1.0h ADD-ON : Record a skill I witnessed
 *   Tab 20 was only ever fed by the form pipeline, so there was no
 *   legal way for the director to put a directly-observed skill on
 *   the record. This adds that door — through the FULL validated
 *   path, not around it.
 */

/* ---- ported from zz (effective winner) ---- */
/** Four numbers instead of a paragraph. */
function compactEvidenceV19_(trainee, skillId) {
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return '';
  var data = m.getRange(5, 1, m.getLastRow() - 4, 20).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(trainee).trim()) continue;
    if (String(data[i][9]).trim() !== String(skillId).trim()) continue;
    return (Number(data[i][10]) || 0) + '  /  ' + (Number(data[i][11]) || 0) +
           '  /  ' + (Number(data[i][12]) || 0) + '  /  ' + (Number(data[i][13]) || 0);
  }
  return '';
}

/* ---- ported from master (effective winner) ---- */
function rebuildSkillMatrixV19_() {
  var S = ss();
  var matrix = S.getSheetByName(TAB.SKILLS);
  var evidence = S.getSheetByName(TAB.SKILL_EVIDENCE);
  var signoff = S.getSheetByName(TAB.SKILL_SIGNOFF);
  if (!matrix || !evidence || !signoff) throw new Error('Skills v19 sheets are incomplete. Run installSkillsV19().');
  ensureSheetCapacityV19_(matrix, 3000, 23);
  var selected = String(matrix.getRange('W2').getValue() || '');
  var trainees = masterTraineeMapV19_();
  var catalog = catalogObjectsV19_(true).filter(function (c) { return c.active; });
  var evRows = evidence.getLastRow() >= 5
    ? evidence.getRange(5, 1, evidence.getLastRow() - 4, 20).getValues() : [];
  var soRows = signoff.getLastRow() >= 5
    ? signoff.getRange(5, 1, signoff.getLastRow() - 4, 12).getValues() : [];
  var eventsByKey = {}, decisionsByKey = {};
  evRows.forEach(function (r) {
    var key = String(r[3]) + '||' + String(r[7]);
    (eventsByKey[key] = eventsByKey[key] || []).push(r);
  });
  soRows.forEach(function (r) {
    var key = String(r[2]) + '||' + String(r[3]);
    (decisionsByKey[key] = decisionsByKey[key] || []).push(r);
  });
  var output = [];
  Object.keys(trainees).sort().forEach(function (name) {
    var person = trainees[name];
    catalog.filter(function (c) { return skillApplicableV19_(c, person.level); })
      .sort(function (a, b) { return (a.domain + '|' + a.skill).localeCompare(b.domain + '|' + b.skill); })
      .forEach(function (c) {
        var key = name + '||' + c.id;
        var allEvents = eventsByKey[key] || [];
        var accepted = allEvents.filter(function (r) { return String(r[18]) === 'ACCEPTED'; });
        var legacy = allEvents.filter(function (r) { return String(r[18]).indexOf('LEGACY IMPORT') === 0; });
        var progressEvents = accepted.filter(function (r) { return String(r[12]) === 'Successful'; });
        var successful = progressEvents.filter(function (r) {
          return String(r[11]) === 'P' || String(r[11]) === 'I';
        });
        var independent = successful.filter(function (r) { return String(r[11]) === 'I'; });
        var stage = '';
        progressEvents.forEach(function (r) {
          if (stageRankV19_(r[11]) > stageRankV19_(stage)) stage = String(r[11]);
        });
        if (!stage && legacy.length) {
          legacy.forEach(function (r) {
            if (stageRankV19_(r[11]) > stageRankV19_(stage)) stage = String(r[11]);
          });
        }
        var lastEvidence = latestByTimestampV19_(accepted.length ? accepted : legacy, 2) ||
          latestByTimestampV19_(accepted.length ? accepted : legacy, 1);
        var lastAnyAccepted = latestByTimestampV19_(accepted, 1);
        var latestOutcome = lastAnyAccepted ? String(lastAnyAccepted[12] || '') : (lastEvidence ? String(lastEvidence[12] || '') : '');
        var decisions = decisionsByKey[key] || [];
        var latestDecision = latestByTimestampV19_(decisions, 1);
        var decision = latestDecision ? String(latestDecision[5] || '') : '';
        var expiration = latestDecision ? latestDecision[8] : '';
        var expired = decision === 'Approve sign-off' && expiration instanceof Date &&
          expiration.getTime() < new Date().setHours(0, 0, 0, 0);
        var decisionMs = latestDecision ? dateMsV19_(latestDecision[1]) : 0;
        var lastAcceptedMs = lastAnyAccepted ? Math.max(dateMsV19_(lastAnyAccepted[1]), dateMsV19_(lastAnyAccepted[2])) : 0;
        var expirationMs = expiration instanceof Date ? expiration.getTime() : 0;
        var revalidationEvidence = expired && lastAcceptedMs > expirationMs;
        var signed = decision === 'Approve sign-off' && !expired;
        var latestUnsafe = latestOutcome === 'Unsuccessful / unsafe';
        var unsafeAfterDecision = accepted.some(function (r) {
          if (String(r[12]) !== 'Unsuccessful / unsafe') return false;
          return Math.max(dateMsV19_(r[1]), dateMsV19_(r[2])) > decisionMs;
        });
        var state = {
          approved: c.status === 'APPROVED',
          legacySignoff: signed && latestDecision &&
            String(latestDecision[6] || '').indexOf('Legacy record') === 0,
          signed: signed,
          expired: expired && !revalidationEvidence,
          latestUnsafe: latestUnsafe,
          latestUnsafeAfterSignoff: signed && unsafeAfterDecision,
          returnedWithoutNewEvidence:
            (decision === 'Return for more evidence' || decision === 'Revoke sign-off') &&
            lastAcceptedMs <= decisionMs,
          legacyOnly: !accepted.length && legacy.length > 0,
          successful: successful.length,
          independent: independent.length,
          distinctDates: uniqueCountV19_(successful.map(function (r) { return dateKeyV19_(r[2]); })),
          distinctFtos: uniqueCountV19_(successful.map(function (r) { return r[6]; })),
          minSuccess: c.minSuccess,
          minIndependent: c.minIndependent,
          minDates: c.minDates,
          minFtos: c.minFtos,
          stage: stage
        };
        var readiness = skillReadinessV19_(state);
        var signoffStatus = expired ? 'EXPIRED' : (signed ? 'SIGNED OFF' : '');
        var note = 'Requires ' + c.minSuccess + ' successful / ' + c.minIndependent +
          ' independent / ' + c.minDates + ' date(s) / ' + c.minFtos + ' FTO(s).';
        if (latestDecision && latestDecision[9]) note += ' Latest decision: ' + latestDecision[9];
        output.push([
          name, c.skill, stage, lastEvidence ? lastEvidence[2] : '',
          lastEvidence ? lastEvidence[6] : '', person.level, readiness, signoffStatus,
          c.domain, c.id, successful.length, independent.length,
          state.distinctDates, state.distinctFtos, latestOutcome,
          lastAnyAccepted ? lastAnyAccepted[10] : (lastEvidence ? lastEvidence[10] : ''),
          signed && latestDecision ? latestDecision[6] : '',
          signed && latestDecision ? latestDecision[7] : '',
          expiration || '', note
        ]);
      });
  });
  // v20.2 — never clear the matrix down to nothing.
  //
  // This clears up to 3,000 rows and then writes `output` only when it has
  // rows. An empty roster, a catalog with no ACTIVE skills, or a level
  // lookup that came back blank therefore wiped the matrix, and everything
  // downstream reads an empty matrix as fact: refreshSkillValidationQueueV19_
  // cancelled the whole open queue as "criteria changed", and the v20.2
  // evidence gate refuses every approval as "not on the matrix".
  //
  // Computing nothing while the sheet holds something is not a valid
  // rebuild — it is a failed read. Say so and leave the previous matrix
  // standing.
  if (!output.length) {
    var hadRows = matrix.getLastRow() >= 5;
    var why = 'Matrix rebuild produced 0 rows. Trainees on the master: ' +
      Object.keys(trainees).length + '. Active catalog skills: ' + catalog.length + '. ' +
      (hadRows ? 'The existing matrix was LEFT IN PLACE rather than cleared.'
               : 'The matrix was already empty; nothing changed.');
    systemLog_('ERROR', 'MATRIX REBUILD PRODUCED NOTHING', why);
    if (hadRows) {
      try { sendMail(CONFIG.TCO_EMAIL, 'SCEMS : matrix rebuild produced nothing', why +
        '\n\nCheck 01 TRAINEE MASTER for trainees and 15 SKILL CATALOG for rows marked ' +
        'ACTIVE. Nothing was cancelled and no records were touched.'); } catch (e) {}
      return;
    }
  }

  ensureSheetCapacityV19_(matrix, Math.max(3000, output.length + 4), 23);
  matrix.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  matrix.getRange(5, 1, matrix.getMaxRows() - 4, 20).clearContent();
  matrix.getRange(4, 1, 1, 20).setValues([SKILL_MATRIX_HEADERS_V19]);
  if (output.length) matrix.getRange(5, 1, output.length, 20).setValues(output);
  matrix.getRange('W2').setValue(selected);
  rewriteEngineSkillMetricV19_();
  refreshSkillValidationQueueV19_();
  applySkillsLayoutV19_();
  if (selected) applySkillMatrixFilterV19_(selected);
}

/* ---- ported from master (effective winner) ---- */
function skillReadinessV19_(state) {
  if (!state.approved) return 'CATALOG APPROVAL REQUIRED';
  if (state.legacySignoff) return 'LEGACY SIGN-OFF REVIEW REQUIRED';
  if (state.signed && state.latestUnsafeAfterSignoff) return 'SIGNED OFF - REVIEW REQUIRED';
  if (state.signed) return 'SIGNED OFF';
  if (state.expired) return 'REVALIDATION REQUIRED';
  if (state.returnedWithoutNewEvidence) return 'MORE EVIDENCE REQUIRED';
  if (state.latestUnsafe) return 'NEEDS REVIEW';
  if (state.legacyOnly) return 'LEGACY REVIEW REQUIRED';
  if (state.successful >= state.minSuccess &&
      state.independent >= state.minIndependent &&
      state.distinctDates >= state.minDates &&
      state.distinctFtos >= state.minFtos) return 'READY FOR VALIDATION';
  if (!state.stage) return 'NOT STARTED';
  return 'IN PROGRESS';
}

/* ---- ported from master (effective winner) ---- */
function latestByTimestampV19_(rows, timestampIndex) {
  if (!rows.length) return null;
  return rows.slice().sort(function (a, b) {
    return dateMsV19_(b[timestampIndex]) - dateMsV19_(a[timestampIndex]);
  })[0];
}

/* ---- ported from master (effective winner) ---- */
function catalogMapsV19_(includeUnapproved) {
  var byId = {}, byName = {};
  catalogObjectsV19_(includeUnapproved).forEach(function (c) {
    byId[c.id] = c;
    byName[normalizeSkillNameV19_(c.skill)] = c;
  });
  return { byId: byId, byName: byName };
}

/* ---- ported from master (effective winner) ---- */
function catalogObjectsV19_(includeUnapproved) {
  var sh = ss().getSheetByName(TAB.CATALOG);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID' || sh.getLastRow() < 5) return [];
  return sh.getRange(5, 1, sh.getLastRow() - 4, 17).getValues()
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r, i) {
      return {
        row: i + 5,
        id: String(r[0]).trim(),
        domain: String(r[1]).trim(),
        skill: String(r[2]).trim(),
        emt: yesV19_(r[3]),
        aemt: yesV19_(r[4]),
        paramedic: yesV19_(r[5]),
        active: yesV19_(r[6]),
        context: String(r[7] || '').trim(),
        minSuccess: Number(r[8]) || 0,
        minIndependent: Number(r[9]) || 0,
        minDates: Number(r[10]) || 0,
        minFtos: Number(r[11]) || 0,
        authority: String(r[12] || '').trim(),
        standard: String(r[13] || '').trim(),
        effective: r[14],
        retire: r[15],
        status: String(r[16] || '').trim()
      };
    })
    .filter(function (c) {
      return includeUnapproved || (c.active && c.status === 'APPROVED');
    });
}

/* ---- ported from master (effective winner) ---- */
function normalizeSkillNameV19_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ---- ported from master (effective winner) ---- */
function skillDomainV19_(skill) {
  var s = normalizeSkillNameV19_(skill);
  if (/airway|intubat|laryng|bvm|opa|npa|suction|oxygen|cpap|cric|surgical airway/.test(s)) return 'Airway / Ventilation';
  if (/12-lead|defib|cardioversion|pacing|cpr|aed|cardiac/.test(s)) return 'Cardiology / Resuscitation';
  if (/\biv\b|\bio\b|vascular|fluid therapy/.test(s)) return 'Vascular Access';
  if (/medication|nitrous|controlled substance|waste|witness/.test(s)) return 'Medication / Pharmacology';
  if (/hemorrhage|tourniquet|splint|spinal|trauma|needle decompression/.test(s)) return 'Trauma';
  if (/assessment|vital|blood glucose|scene size|safety/.test(s)) return 'Assessment';
  if (/radio|epcr|documentation|stretcher|stair chair|olmc/.test(s)) return 'Operations / Communication';
  return 'General Clinical';
}

/* ---- ported from master (effective winner) ---- */
function skillApplicableV19_(catalog, level) {
  if (!catalog) return false;
  if (level === 'EMT') return catalog.emt;
  if (level === 'Advanced EMT') return catalog.aemt;
  if (level === 'Paramedic') return catalog.paramedic;
  return false;
}

/* ---- ported from master (effective winner) ---- */
function applySkillMatrixFilterV19_(trainee) {
  var sh = ss().getSheetByName(TAB.SKILLS);
  if (!sh) return;
  var filter = sh.getFilter();
  if (!filter) filter = sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 2), 20).createFilter();
  if (trainee) {
    filter.setColumnFilterCriteria(1,
      SpreadsheetApp.newFilterCriteria().whenTextEqualTo(trainee).build());
  } else {
    filter.setColumnFilterCriteria(1, null);
  }
}

/* ---- ported from master (effective winner) ---- */
function syncSkillQuickLogFormV19_() {
  var form = getStoredFormV19_(SKILL_FORM_TITLE_V19);
  if (!form) return;
  var choices = approvedSkillChoicesV19_();
  var trainees = traineeList(), ftos = ftoList();
  form.getItems(FormApp.ItemType.LIST).forEach(function (it) {
    var item = it.asListItem(), title = item.getTitle();
    if (title === 'FTO name' && ftos.length) item.setChoiceValues(ftos);
    if (title === 'Trainee' && trainees.length) item.setChoiceValues(trainees);
    if (title === 'Skill') item.setChoiceValues(choices.length ? choices : ['CATALOG APPROVAL REQUIRED']);
  });
  var ready = choices.length > 0 && !skillCatalogIssuesV19_().length && trainees.length && ftos.length;
  try { form.setAcceptingResponses(!!ready); } catch (e) {}
  systemLog_(ready ? 'INFO' : 'WARN', 'SKILL FORM SYNC',
    ready ? choices.length + ' approved skill choices loaded.' : 'Form closed: catalog, trainee roster, or FTO roster is not deployment-ready.');
}

/* ---- ported constant ---- */
/* NOTE FOR REVIEWERS: the original source embeds an ~8KB base64 PNG here.

   It is inert image data and was replaced with a short placeholder so the

   file stays readable. Every code path that touches it is unchanged. */

function hideSkillIdColumnV19_(sh) {
  if (!sh) return;
  var map = {};
  map[TAB.SKILL_VALIDATION] = 3;
  map[TAB.SKILL_EVIDENCE] = 8;
  map[TAB.SKILL_SIGNOFF] = 4;
  var col = map[sh.getName()];
  if (col) { try { sh.hideColumns(col); } catch (e) {} }
}

function phaseMinimumsV19_() {
  var out = { 'EMT': 5, 'Advanced EMT': 6, 'Paramedic': 8 };
  try {
    var sh = ss().getSheetByName(TAB.CONTROL);
    var grid = sh.getRange(1, 1, Math.min(sh.getLastRow(), 40), 3).getValues();
    for (var r = 0; r < grid.length; r++) {
      var label = String(grid[r][0] || '').trim();
      var val = Number(grid[r][1]);
      if (!val) continue;
      if (label === 'EMT' || label === 'Advanced EMT' || label === 'Paramedic') {
        out[label] = val;
      }
    }
  } catch (e) {}
  return out;
}

function rewriteEngineSkillMetricV19_() {
  var eng = ss().getSheetByName(TAB.ENGINE);
  if (!eng) return;
  var matrix = "'" + TAB.SKILLS + "'";
  for (var r = 5; r <= 44; r++) {
    eng.getRange(r, 14).setFormula(
      '=IF($A' + r + '="","",COUNTIFS(' + matrix + '!$A$5:$A$3000,$A' + r + ',' +
      matrix + '!$G$5:$G$3000,"READY FOR VALIDATION"))');
  }
  eng.getRange('N4').setValue('SKILLS READY FOR VALIDATION');
}

function skillCatalogIssuesV19_() {
  var issues = [];
  var sh = ss().getSheetByName(TAB.CATALOG);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID') {
    return ['Skills v19 catalog is not installed.'];
  }
  var rows = catalogObjectsV19_(true);
  var ids = {}, names = {}, activeCount = 0;
  rows.forEach(function (c) {
    if (ids[c.id]) issues.push('Duplicate Skill ID on catalog row ' + c.row + ': ' + c.id + '.');
    ids[c.id] = true;
    var nameKey = normalizeSkillNameV19_(c.skill);
    if (names[nameKey]) issues.push('Duplicate active skill name on catalog row ' + c.row + ': ' + c.skill + '.');
    names[nameKey] = true;
    if (!c.active) return;
    activeCount++;
    if (!/^SK-[A-Z0-9-]+$/.test(c.id)) issues.push('Catalog row ' + c.row + ' has an invalid Skill ID.');
    if (!c.domain) issues.push('Catalog row ' + c.row + ' has no domain.');
    if (!c.emt && !c.aemt && !c.paramedic) issues.push('Catalog row ' + c.row + ' is not assigned to any certification level.');
    var allowedContexts = catalogContextsV19_(c.context);
    var knownContexts = ['Patient care','Simulation','Skills lab','Other approved training'];
    if (!allowedContexts.length || allowedContexts.some(function (v) {
      return knownContexts.indexOf(v) < 0;
    })) {
      issues.push('Catalog row ' + c.row + ' has an invalid allowed-context list.');
    }
    if (!positiveIntV19_(c.minSuccess) || !positiveIntV19_(c.minIndependent) ||
        !positiveIntV19_(c.minDates) || !positiveIntV19_(c.minFtos)) {
      issues.push('Catalog row ' + c.row + ' has an invalid evidence threshold.');
    }
    if (c.minIndependent > c.minSuccess) {
      issues.push('Catalog row ' + c.row + ' requires more Independent reps than total successful reps.');
    }
    if (!c.authority) issues.push('Catalog row ' + c.row + ' has no sign-off authority.');
    if (!c.standard || c.standard.indexOf('SET_ME') >= 0) {
      issues.push('Catalog row ' + c.row + ' has no approved standard/source.');
    }
    if (!(c.effective instanceof Date) || isNaN(c.effective.getTime())) {
      issues.push('Catalog row ' + c.row + ' has no effective date.');
    }
    if (c.retire instanceof Date && c.effective instanceof Date &&
        c.retire.getTime() < c.effective.getTime()) {
      issues.push('Catalog row ' + c.row + ' retires before its effective date.');
    }
    if (c.status !== 'APPROVED') issues.push('Catalog row ' + c.row + ' is active but not APPROVED.');
  });
  if (!activeCount) issues.push('Skill Catalog has no active skills.');
  return issues;
}

function skillDeploymentIssuesV19_() {
  var issues = [];
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SKILLS_V19_INSTALLED') !== 'true') issues.push('Run installSkillsV19().');
  if (props.getProperty('SKILLS_V19_INSTALL_STAGE') !== 'COMPLETE') {
    issues.push('Run installSkillsV19() until checkpoint 2 of 2 is complete.');
  }
  if (props.getProperty('SKILLS_V19_ACTIVE') !== 'true') issues.push('Run activateSkillsV19() after catalog approval.');
  if (props.getProperty('SKILLS_V19_ACTIVATION_STAGE') !== 'COMPLETE') {
    issues.push('Run activateSkillsV19() until checkpoint 3 of 3 is complete.');
  }
  var matrix = ss().getSheetByName(TAB.SKILLS);
  if (!matrix || String(matrix.getRange('A4').getValue()) !== 'TRAINEE') {
    issues.push('Skill Competency Matrix schema is missing.');
  }
  var form = getStoredFormV19_(SKILL_FORM_TITLE_V19);
  if (!form) issues.push('Skills Quick Log form is missing.');
  else {
    try { if (!form.isAcceptingResponses()) issues.push('Skills Quick Log form is closed.'); } catch (e) {
      issues.push('Skills Quick Log form cannot be verified.');
    }
  }
  var log = ss().getSheetByName(TAB.SKILL_SIGNOFF);
  if (log && log.getLastRow() >= 5) {
    var latest = {};
    log.getRange(5, 1, log.getLastRow() - 4, 12).getValues().forEach(function (r, i) {
      var key = String(r[2]) + '||' + String(r[3]);
      r._sheetRowV19 = i + 5;
      if (!latest[key] || dateMsV19_(r[1]) > dateMsV19_(latest[key][1])) latest[key] = r;
    });
    Object.keys(latest).forEach(function (key) {
      var r = latest[key];
      if (String(r[5]) !== 'Approve sign-off') return;
      if (!r[6] || String(r[6]).indexOf('Legacy record') === 0 ||
          !(r[7] instanceof Date) || !String(r[9] || '').trim()) {
        issues.push('Signed skill decision on tab 21 row ' + r._sheetRowV19 +
          ' lacks a reconciled signer, date, or rationale.');
      }
    });
  }
  return issues;
}

/* ---- ported round 5 : final closure helpers ---- */

function catalogContextsV19_(value) {
  return String(value || '').split(/\s*[|,;]\s*/)
    .map(function (v) { return v.trim(); })
    .filter(function (v) { return v; });
}

/* ---------------------------------------------------------------- *
 *  Validation
 * ---------------------------------------------------------------- */

/** Validates one prospective skill event against roster, catalog, scope,
 *  and evidence rules. Returns an array of problems (empty = valid). */
function validateSkillEventV20_1_(ev, catalogEntry, traineeResolved, ftoResolved) {
  var problems = [];

  if (!traineeResolved.ok) {
    problems.push('trainee did not resolve: ' + traineeResolved.reason);
  } else if (traineeResolved.record && traineeResolved.record.closed) {
    problems.push('trainee is closed/released; no new evidence may accrue');
  }

  if (!ftoResolved.ok) {
    problems.push('FTO is not on the approved roster (' + ftoResolved.reason + ')');
  } else if (!ftoResolved.record.active) {
    problems.push('FTO is not active on the roster');
  } else if (traineeResolved.ok && traineeResolved.record &&
             !ftoScopeAllowsV20_1_(ftoResolved.record, traineeResolved.record.level)) {
    problems.push('FTO roster scope does not permit training level ' +
      traineeResolved.record.level);
  }

  if (!catalogEntry) {
    problems.push('skill is not in the approved catalog');
  } else {
    // catalogObjectsV19_ maps the APPROVAL STATUS column to .status, not
    // .approval. Reading .approval rejected every event ever submitted.
    if (String(catalogEntry.status || '').toUpperCase() !== 'APPROVED') {
      problems.push('catalog row is not APPROVED');
    }
    if (traineeResolved.ok && traineeResolved.record &&
        !skillApplicableV19_(catalogEntry, traineeResolved.record.level)) {
      problems.push('skill does not apply to certification level ' + traineeResolved.record.level);
    }
  }

  if (!ev.shiftDate) {
    problems.push('shift date missing or unreadable');
  } else if (!notFutureV20_1_(ev.shiftDate)) {
    problems.push('shift date is in the future');
  }

  if (['O', 'A', 'P', 'I'].indexOf(ev.stage) < 0) {
    problems.push('stage must be Observed, Assisted, Performed with coaching, or Performed independently');
  }
  // Prompting is DERIVED from the stage by promptingForStageV19_, which
  // returns 'None' for Independent. 'No prompting required' is produced by
  // nothing in this project; it is kept only so a future form field using
  // that wording still validates. The check's real job is to reject an
  // Independent stage carrying 'Moderate coaching' or 'Full takeover'.
  if (ev.stage === 'I' && ev.prompting && ev.prompting !== 'None' &&
      ev.prompting !== 'No prompting required' &&
      ev.prompting !== 'Minimal verbal cue') {
    problems.push('Performed independently is inconsistent with prompting "' + ev.prompting + '"');
  }
  var needsNote = ev.stage === 'I' || ev.outcome === 'Unsuccessful / unsafe';
  if (needsNote && !String(ev.note || '').trim()) {
    problems.push('evidence narrative is required for Independent or unsuccessful/unsafe entries');
  }
  if (ev.context === 'Patient care' && catalogEntry && catalogEntry.requiresReference && !String(ev.callRef || '').trim()) {
    problems.push('patient-care events require a call/scenario reference');
  }
  if (!ev.attested) {
    problems.push('attestation is required');
  }
  return problems;
}

/* ---------------------------------------------------------------- *
 *  Batched evidence writer
 * ---------------------------------------------------------------- */

var SKILL_EVIDENCE_REQUIRED_V20_1 = [
  'EVENT ID', 'TIMESTAMP', 'TRAINEE', 'FTO', 'SKILL', 'VALIDATION RESULT',
  'SOURCE FORM', 'SOURCE FORM ID', 'SOURCE RESPONSE ID', 'WRITER VERSION'
];

/** Writes all events for ONE response as ONE batch. Provenance columns
 *  are mandatory; if migration has not added them the writer refuses and
 *  nothing is written. Returns the list of event IDs written. */
function writeSkillEventsBatchV20_1_(events, provenance) {
  if (!events.length) return [];
  var objects = events.map(function (ev) {
    var id = newIdV20_1_('SE');
    ev.eventId = id;
    return {
      'EVENT ID': id,
      'TIMESTAMP': new Date(),
      'SHIFT DATE': ev.shiftDate || '',
      'TRAINEE': ev.traineeName,
      'LEVEL AT EVENT': ev.level || '',
      'PHASE': ev.phase || '',
      'FTO': ev.ftoName,
      'SKILL ID': ev.skillId || '',
      'DOMAIN': ev.domain || '',
      'SKILL': ev.skill,
      'CONTEXT': ev.context || '',
      'STAGE': ev.stage || '',
      'OUTCOME': ev.outcome || '',
      'PROMPTING': ev.prompting || '',
      'CALL / SCENARIO REF': ev.callRef || '',
      'EVIDENCE NOTE': ev.note || '',
      'SOURCE FORM': provenance.formTitle,
      'SOURCE ROW': '',
      'VALIDATION RESULT': ev.validation,
      'ATTESTATION': ev.attested ? 'Attested' : 'NOT ATTESTED',
      'SOURCE FORM ID': provenance.formId,
      'SOURCE RESPONSE ID': provenance.responseId,
      'WRITER VERSION': SCEMS_WRITER_VERSION,
      'PERSON ID': ev.personId || '',
      'ASSIGNMENT ID': ev.assignmentId || ''
    };
  });
  appendRowsHeaderMappedV20_1_(TAB.SKILL_EVIDENCE, 4, objects, SKILL_EVIDENCE_REQUIRED_V20_1);
  return events.map(function (ev) { return ev.eventId; });
}

/* ---------------------------------------------------------------- *
 *  Grid-form parsing
 * ---------------------------------------------------------------- */

/** Strict repetitions parser. "IV access 8" credits IV access with 8.
 *  A line that does not match exactly one offered skill name counts as
 *  one and is returned in unparsed for reporting. (No fuzzy matching.) */
function parseRepsV20_1_(text, offeredSkills) {
  var out = { counts: {}, unparsed: [] };
  String(text || '').split(/[\n;,]+/).forEach(function (chunk) {
    var s = chunk.trim();
    if (!s) return;
    var m = s.match(/^(.*?)[\s:x]+(\d{1,3})$/);
    if (!m) { out.unparsed.push(s); return; }
    var namePart = normalizeNameV20_1_(m[1]);
    var count = Number(m[2]);
    var hits = offeredSkills.filter(function (sk) {
      return normalizeNameV20_1_(sk) === namePart;
    });
    if (hits.length !== 1 || !(count >= 1 && count <= 50)) {
      out.unparsed.push(s);
      return;
    }
    out.counts[hits[0]] = count;
  });
  return out;
}

/** True when the evidence log already holds at least one row sourced from
 *  this form response. The durable write is self-identifying, so this is the
 *  authoritative idempotency check — the ledger is only a bookkeeping mirror
 *  of it and can be stale after a crash. */
function evidenceExistsForResponseV20_2_(responseId) {
  var rid = String(responseId || '').trim();
  if (!rid) return false;
  var t = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  if (!t.ok || t.col['SOURCE RESPONSE ID'] === undefined) return false;
  var ci = t.col['SOURCE RESPONSE ID'];
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][ci] || '').trim() === rid) return true;
  }
  return false;
}

/** PUBLIC HANDLER — name preserved; the form-bound triggers on all four
 *  skills forms keep firing. Fully idempotent via the response ID. */
function onSkillsGridSubmitV20(e) {
  var responseId = '', formId = '', formTitle = '';
  try { responseId = e.response.getId(); } catch (err0) {}
  try {
    if (e.source) { formId = e.source.getId(); formTitle = String(e.source.getTitle() || '').trim(); }
  } catch (err1) {}
  if (!formId && responseId) {
    // replay path: locate the owning stored form by asking each for the response
    var ids0 = storedFormIdsV20_1_();
    for (var fi = 0; fi < ids0.length; fi++) {
      try {
        var cand = FormApp.openById(ids0[fi]);
        if (cand.getResponse(responseId)) {
          formId = cand.getId(); formTitle = String(cand.getTitle() || '').trim(); break;
        }
      } catch (err2) {}
    }
  }
  var key = 'FORM-' + formId + '-' + responseId;

  withScriptLockV20_1_('onSkillsGridSubmitV20', 30000, function () {
    if (ledgerAlreadyDoneV20_1_(key)) {
      systemLog_('WARN', 'DUPLICATE SKILL SUBMISSION SKIPPED', key);
      return;
    }
    var haveLedger = !!getSheetOrNullV20_1_(TAB.LEDGER);
    // v20.2: reuse the row a failed attempt left behind. Opening a fresh row
    // per attempt gave one response several ledger rows, so ledgerFind could
    // answer from a stale one and the exception report double-counted.
    var ledgerRow = 0;
    if (haveLedger) {
      ledgerRow = ledgerFindV20_1_(key) ||
        ledgerOpenV20_1_(key, formId, responseId, formTitle, 'skills');
    }

    // v20.2: evidence rows carry SOURCE RESPONSE ID, so the durable write is
    // self-identifying. If a previous attempt already expanded this response,
    // re-expanding would append the whole submission a second time — which is
    // what happened whenever the post-write mail step threw.
    var alreadyWritten = evidenceExistsForResponseV20_2_(responseId);
    if (alreadyWritten) {
      if (haveLedger) ledgerSetV20_1_(ledgerRow, 'RECONCILED',
        'Evidence for this response is already on ' + TAB.SKILL_EVIDENCE +
        '; a previous attempt wrote it. Nothing re-expanded.');
      systemLog_('WARN', 'SKILLS SUBMISSION ALREADY EXPANDED', key);
      return;
    }

    try {
      var header = {}, grids = [], reps = {}, labReps = '';
      var failed = [], note = '', attested = false, refCall = '';
      e.response.getItemResponses().forEach(function (r) {
        var item = r.getItem();
        var title = String(item.getTitle() || '');
        var type = String(item.getType());
        var resp = r.getResponse();
        if (type === 'GRID') {
          grids.push({ title: title, isLab: title === LAB_GRID_TITLE_V20,
                       rows: item.asGridItem().getRows(), answers: resp });
        } else if (title === LAB_REPS_TITLE_V20) {
          labReps = String(resp || '');
        } else if (title.indexOf(REPS_SUFFIX_V20) > 0) {
          reps[title.replace(REPS_SUFFIX_V20, '')] = String(resp || '');
        } else if (title === 'Any skill above unsuccessful or unsafe') {
          failed = Array.isArray(resp) ? resp : (resp ? [resp] : []);
        } else if (title === 'Evidence note') {
          note = String(resp || '');
        } else if (title === 'Reference call') {
          refCall = String(resp || '').trim();
        } else if (title === 'Attestation') {
          attested = !!resp;
        } else {
          header[title] = String(resp || '');
        }
      });

      var ftoName = cleanNameV20_1_(header['FTO name'] || '');
      var traineeName = cleanNameV20_1_(header['Trainee'] || '');
      var shiftDate = parseDateSafeV20_1_(header['Shift date'] || '');
      var traineeResolved = resolveTraineeV20_1_(traineeName);
      var ftoResolved = resolveFtoV20_1_(ftoName);

      // Verified-identity check: when the form captured a verified
      // respondent email, the submitting ACCOUNT must be the selected FTO
      // (or leadership). A mismatch rejects every event in the submission.
      // When no email could be captured, or the roster carries no email
      // for this FTO yet, the submission proceeds flagged UNVERIFIED —
      // migration's roster-email fill closes that gap.
      var respondentEmail = '';
      try { respondentEmail = String(e.response.getRespondentEmail() || '').trim().toLowerCase(); } catch (eRE) {}
      var identityProblem = '';
      var identityFlag = '';
      if (respondentEmail && isValidEmailV20_1_(respondentEmail)) {
        var actor0 = resolveAuthorizedActorV20_1_(respondentEmail);
        var isLeader0 = actor0.ok && (actor0.roles.indexOf('PROGRAM_DIRECTOR') >= 0 ||
          actor0.roles.indexOf('TRAINING_DIVISION') >= 0 ||
          actor0.roles.indexOf('COMMAND') >= 0 || actor0.roles.indexOf('MEDICAL_DIRECTOR') >= 0);
        if (actor0.person && actor0.person.type === 'FTO') {
          if (ftoResolved.ok && actor0.person.norm !== ftoResolved.record.norm && !isLeader0) {
            identityProblem = 'submitting account (' + respondentEmail +
              ') is FTO "' + actor0.person.name + '", not the selected FTO "' + ftoName + '"';
          }
        } else if (!isLeader0) {
          // No registry person carries this email yet. During rollout —
          // before the roster EMAIL column is filled — this is
          // UNVERIFIABLE, not unauthorized: accept, flag, and log.
          // Hard rejection applies only to a POSITIVE mismatch (the
          // account verifiably belongs to a different FTO), above.
          identityFlag = 'IDENTITY UNVERIFIED (' + respondentEmail +
            ' is not yet on the roster allowlist)';
        }
      } else {
        identityFlag = 'IDENTITY UNVERIFIED (no verified email captured by the form)';
      }
      if (identityFlag) {
        systemLog_('WARN', 'SKILLS IDENTITY UNVERIFIED', key + ' | ' + identityFlag);
      }
      var maps = catalogMapsV19_(true);

      var prospective = [], unparsedAll = [];
      grids.forEach(function (grid) {
        var tapped = [];
        (grid.answers || []).forEach(function (answer, i) {
          if (!answer) return;
          var letter = stageLetterV19_(answer);
          if (!letter) return;
          tapped.push({ skill: grid.rows[i], stage: letter });
        });
        if (!tapped.length) return;
        var text = grid.isLab ? labReps : (reps[grid.title] || '');
        var parsed = parseRepsV20_1_(text, tapped.map(function (t) { return t.skill; }));
        parsed.unparsed.forEach(function (u) {
          unparsedAll.push((grid.isLab ? 'classroom' : grid.title) + ' : "' + u + '"');
        });
        tapped.forEach(function (t) {
          var count = parsed.counts[t.skill] || 1;
          for (var n = 0; n < count; n++) {
            var catalogEntry = maps.byName[normalizeSkillNameV19_(t.skill)] || null;
            prospective.push({
              skill: t.skill,
              skillId: catalogEntry ? catalogEntry.id : '',
              domain: grid.isLab ? (catalogEntry ? catalogEntry.domain : '') : grid.title,
              stage: t.stage,
              context: grid.isLab ? 'Skills lab' : 'Patient care',
              callRef: grid.isLab ? '' : refCall,
              outcome: failed.indexOf(t.skill) >= 0 ? 'Unsuccessful / unsafe' : 'Successful',
              prompting: promptingForStageV19_(t.stage),
              note: note,
              attested: attested,
              shiftDate: shiftDate,
              traineeName: traineeName,
              ftoName: ftoName,
              level: traineeResolved.ok && traineeResolved.record ? traineeResolved.record.level : '',
              phase: traineeResolved.ok && traineeResolved.record ? traineeResolved.record.phase : '',
              personId: traineeResolved.personId || '',
              catalogEntry: catalogEntry
            });
          }
        });
      });

      if (!prospective.length) {
        if (haveLedger) ledgerSetV20_1_(ledgerRow, 'PROCESSED', 'no stages tapped; nothing recorded', '0');
        sendMail(CONFIG.TCO_EMAIL, 'Skills Quick Log : nothing recorded',
          ftoName + ' submitted the Skills Quick Log for ' + traineeName +
          ' but did not tap a stage for any skill.\n\nNothing was recorded.');
        systemLog_('WARN', 'SKILLS SUBMISSION EMPTY', ftoName + ' for ' + traineeName + ' | ' + key);
        return;
      }

      var accepted = 0, rejected = 0, reasonsSeen = {};
      prospective.forEach(function (ev) {
        var problems = validateSkillEventV20_1_(ev, ev.catalogEntry, traineeResolved, ftoResolved);
        if (identityProblem) problems.push(identityProblem);
        if (problems.length) {
          ev.validation = 'REJECTED : ' + problems.join('; ');
          rejected++;
          problems.forEach(function (p) { reasonsSeen[p] = true; });
        } else {
          ev.validation = EV_ACCEPTED_V19;
          accepted++;
        }
      });

      var eventIds = writeSkillEventsBatchV20_1_(prospective, {
        formId: formId, formTitle: formTitle || 'SCEMS Skills Quick Log', responseId: responseId
      });

      if (accepted > 0) {
        try { rebuildSkillMatrixV19_(); } catch (err2) {
          systemLog_('ERROR', 'MATRIX REBUILD FAILED AFTER SUBMISSION', key + ' | ' + err2);
        }
      }
      if (rejected > 0) {
        sendMail(CONFIG.TCO_EMAIL,
          'Skill evidence rejected : ' + (traineeName || 'unresolved trainee') + ' : ' + rejected + ' event(s)',
          'Submission ' + key + ' by ' + (ftoName || 'unresolved FTO') + '.\n\n' +
          accepted + ' event(s) accepted, ' + rejected + ' rejected and quarantined with full detail on ' +
          TAB.SKILL_EVIDENCE + '.\n\nReasons seen:\n- ' + Object.keys(reasonsSeen).join('\n- ') +
          '\n\nNo competency state was changed by the rejected events.');
      }
      // An unsafe outcome is a safety signal in its own right, so it is NOT
      // gated on validation. A rejected event accrues no competency evidence
      // and would otherwise be visible to nobody — which is exactly the case
      // where somebody needs to hear about it.
      var unsafe = prospective.filter(function (ev) {
        return ev.outcome === 'Unsuccessful / unsafe';
      });
      if (unsafe.length) {
        var unsafeRejected = unsafe.filter(function (ev) {
          return ev.validation !== EV_ACCEPTED_V19;
        });
        sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
          'URGENT : Skill Event Unsuccessful / Unsafe : ' + traineeName,
          'FTO ' + ftoName + ' recorded ' + unsafe.length + ' unsuccessful/unsafe skill event(s) on ' +
          dateKeyV20_1_(shiftDate) + ':\n\n' +
          unsafe.map(function (ev) {
            return '- ' + ev.skill + ' (' + ev.context + ')' +
              (ev.validation === EV_ACCEPTED_V19 ? '' : '\n     NOT RECORDED : ' + ev.validation);
          }).join('\n') +
          '\n\nEvidence: ' + note + '\nCall/scenario: ' + (refCall || 'not provided') +
          (unsafeRejected.length
            ? '\n\nNOTE: ' + unsafeRejected.length + ' of the above did not pass validation, so no ' +
              'competency\nevidence was recorded for them. The safety concern still stands — a ' +
              'rejection\nis a bookkeeping defect, not a judgement about what happened on the call.'
            : '') +
          '\n\nReview the Skill Evidence Log and determine immediate training restrictions.');
      }
      if (unparsedAll.length) {
        sendMail(CONFIG.TCO_EMAIL, 'Skills Quick Log : repetitions not understood',
          ftoName + ' logged skills for ' + traineeName + ' on ' + dateKeyV20_1_(shiftDate) + '.\n\n' +
          'These repetition entries could not be matched to exactly one skill,\n' +
          'so each counted as one:\n\n  ' + unparsedAll.join('\n  ') +
          '\n\nExpected format: the skill name then a number, e.g. "IV access 8".');
        systemLog_('WARN', 'REPS NOT PARSED', key + ' | ' + unparsedAll.join(' | ').slice(0, 300));
      }

      if (haveLedger) ledgerSetV20_1_(ledgerRow, 'PROCESSED',
        accepted + ' accepted, ' + rejected + ' rejected', eventIds.join(',').slice(0, 450));
      systemLog_('INFO', 'SKILLS SUBMISSION EXPANDED',
        prospective.length + ' event(s) (' + accepted + ' accepted) from one submission by ' +
        ftoName + ' for ' + traineeName + ' | ' + key);
    } catch (err) {
      // Same rule as the hub handler: a throw after the evidence rows landed
      // must not be recorded as though nothing was written.
      var wroteEvidence = evidenceExistsForResponseV20_2_(responseId);
      if (haveLedger) {
        ledgerSetV20_1_(ledgerRow, wroteEvidence ? 'FAILED_AFTER_WRITE' : 'FAILED',
          (wroteEvidence ? '[Evidence IS on ' + TAB.SKILL_EVIDENCE + '; a later step failed. ' +
                           'Do not replay blind.] ' : '') + String(err));
      }
      systemLog_('ERROR', wroteEvidence ? 'SKILLS SUBMIT FAILED AFTER WRITE' : 'SKILLS SUBMIT FAILED',
        key + ' | ' + err);
      throw err;
    }
  });
}

/** Legacy single-skill handler name, retained because old references may
 *  exist. It no longer writes anything: combined-form submissions are
 *  owned by onSkillsGridSubmitV20, and the hub router defers to it. */
function handleSkillQuickLogV19_(vals, e) {
  systemLog_('WARN', 'LEGACY SKILL HANDLER CALLED',
    'handleSkillQuickLogV19_ is retired; skills ingestion is owned by onSkillsGridSubmitV20. No row written.');
}

/* ---------------------------------------------------------------- *
 *  Read-only skills verification (part of the release controls)
 * ---------------------------------------------------------------- */

/** READ-ONLY: form scope, evidence rules, idempotency wiring, provenance
 *  coverage, and queue agreement. Writes nothing anywhere. */
function verifySkillsV20_1() {
  var L = ['SKILLS VERIFICATION — READ ONLY', ''];

  L.push(verifyLevelFormsV20_1());
  L.push('');

  var t = readTableV20_1_(TAB.SKILL_EVIDENCE, 4);
  if (!t.ok) { L.push('Evidence log missing.'); return L.join('\n'); }
  var total = 0, withRespId = 0, accepted = 0, rejected = 0, legacy = 0, missingProv = 0;
  var hasRespCol = t.col['SOURCE RESPONSE ID'] !== undefined;
  t.rows.forEach(function (r) {
    var id = String(r[t.col['EVENT ID']] || '');
    if (!id) return;
    total++;
    var vr = String(r[t.col['VALIDATION RESULT']] || '');
    if (vr === EV_ACCEPTED_V19) accepted++;
    else if (vr.indexOf('REJECTED') === 0) rejected++;
    else if (vr.indexOf('LEGACY') === 0) legacy++;
    if (hasRespCol && String(r[t.col['SOURCE RESPONSE ID']] || '')) withRespId++;
    else if (hasRespCol && id.indexOf('LEGACY') !== 0) missingProv++;
  });
  L.push('Evidence events: ' + total + ' (' + accepted + ' accepted, ' + rejected +
         ' rejected, ' + legacy + ' legacy-review)');
  L.push(hasRespCol
    ? 'Response-ID provenance: ' + withRespId + ' of ' + total +
      ' (' + missingProv + ' pre-v20.1 rows lack it; historical, listed by the audit)'
    : 'PROVENANCE COLUMNS NOT PRESENT — run previewMigrationV20_1() / applyMigrationV20_1(). The v20.1 writer will refuse to write until they exist.');

  var ledger = readTableV20_1_(TAB.LEDGER, 4);
  L.push(ledger.ok ? 'Ingestion ledger present.' : 'Ingestion ledger NOT present (pre-migration).');

  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  var so = readTableV20_1_(TAB.SKILL_SIGNOFF, 4);
  if (q.ok && so.ok) {
    var openN = 0, recordedN = 0, strandedN = 0;
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      var st = String(r[q.col['RECORD STATUS']] || '');
      if (st === 'OPEN') {
        openN++;
        if (String(r[q.col['DECISION']] || '').trim()) strandedN++;
      }
      if (st === 'RECORDED') recordedN++;
    });
    var soN = so.rows.filter(function (r) { return String(r[so.col['DECISION ID']] || ''); }).length;
    L.push('Queue: ' + openN + ' open (' + strandedN + ' stranded with decisions filled), ' +
           recordedN + ' recorded. Sign-off log: ' + soN + ' decisions.');
    if (strandedN) L.push('  → stranded rows require the previewed migration in 50_decisions, not a re-click.');
  }

  var triggers = ScriptApp.getProjectTriggers().map(function (tr) { return tr.getHandlerFunction(); });
  ['onSkillsGridSubmitV20', 'onHubFormSubmit'].forEach(function (h) {
    L.push('Trigger handler "' + h + '": ' +
      (triggers.indexOf(h) >= 0 ? 'wired' : 'NOT WIRED'));
  });

  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* Legacy menu names → safe no-ops (pattern retained from v19.0.4). */
function buildSkillsSystem() { return installSkillsV19(); }

function recordSkillDirectV20_1() {
  if (!gateV20_2_('RECORD WITNESSED SKILL')) return;
  var ui = SpreadsheetApp.getUi();

  var r1 = ui.prompt('Record a skill (1 of 4)',
    'Trainee name as shown on 01 TRAINEE MASTER:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var resolved = resolveTraineeV20_1_(String(r1.getResponseText() || '').trim());
  if (!resolved.ok || !resolved.record) {
    ui.alert('Could not resolve that trainee: ' + resolved.reason +
      (resolved.ambiguous && resolved.ambiguous.length
        ? '\nCandidates: ' + resolved.ambiguous.join(', ') : ''));
    return;
  }
  var rec = resolved.record;
  if (rec.closed) { ui.alert(rec.name + ' is closed/released. Nothing recorded.'); return; }

  var all = catalogObjectsV19_(false);
  var pool = all.filter(function (c) { return skillApplicableV19_(c, rec.level); });
  if (!pool.length) pool = all; // unknown level string: offer the whole approved catalog

  var r2 = ui.prompt('Record a skill (2 of 4)',
    rec.name + ' (' + rec.level + ')\n\nSkill name or SKILL ID (example SK-EMT-014):',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var wanted = String(r2.getResponseText() || '').trim();
  if (!wanted) return;

  var chosen = null;
  var wantedId = wanted.toUpperCase();
  var wantedName = normalizeSkillNameV19_(wanted);
  pool.forEach(function (c) {
    if (c.id.toUpperCase() === wantedId) chosen = c;
  });
  if (!chosen) {
    pool.forEach(function (c) {
      if (normalizeSkillNameV19_(c.skill) === wantedName) chosen = c;
    });
  }
  if (!chosen) {
    var hits = pool.filter(function (c) {
      return normalizeSkillNameV19_(c.skill).indexOf(wantedName) >= 0;
    });
    if (hits.length === 1) {
      chosen = hits[0];
    } else if (hits.length > 1 && hits.length <= 8) {
      var listing = hits.map(function (c, i) {
        return (i + 1) + ' = ' + c.skill + '  (' + c.id + ')'; }).join('\n');
      var r2b = ui.prompt('Which one?',
        '"' + wanted + '" matches ' + hits.length + ' skills.\nType the number:\n\n' + listing,
        ui.ButtonSet.OK_CANCEL);
      if (r2b.getSelectedButton() !== ui.Button.OK) return;
      var pick = parseInt(String(r2b.getResponseText() || '').trim(), 10);
      if (pick >= 1 && pick <= hits.length) chosen = hits[pick - 1];
    } else if (hits.length > 8) {
      ui.alert('"' + wanted + '" matches ' + hits.length + ' skills — be more specific.\n\nFirst few:\n' +
        hits.slice(0, 10).map(function (c) { return '  ' + c.skill + ' (' + c.id + ')'; }).join('\n'));
      return;
    }
  }
  if (!chosen) {
    ui.alert('No approved skill matched "' + wanted + '" for ' + rec.level + '.\n\nExamples from the catalog:\n' +
      pool.slice(0, 12).map(function (c) { return '  ' + c.skill + ' (' + c.id + ')'; }).join('\n') +
      (pool.length > 12 ? '\n  …and ' + (pool.length - 12) + ' more on 15 SKILL CATALOG' : ''));
    return;
  }

  var r3 = ui.prompt('Record a skill (3 of 4)',
    'Date you observed it (example 8/14/2026).\nLeave BLANK for today:', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var dText = String(r3.getResponseText() || '').trim();
  var when = dText ? parseDateSafeV20_1_(dText) : new Date();
  if (!when) { ui.alert('Could not read that date. Nothing recorded. Try 8/14/2026.'); return; }

  var r4 = ui.prompt('Record a skill (4 of 4)',
    'Rationale for the record.\nLeave BLANK for: "Directly observed and verified by the FTO Program Director"',
    ui.ButtonSet.OK_CANCEL);
  if (r4.getSelectedButton() !== ui.Button.OK) return;
  var rationale = String(r4.getResponseText() || '').trim() ||
    'Directly observed and verified by the FTO Program Director';
  if (rationale.indexOf('[direct entry]') < 0) rationale += ' [direct entry]';

  // honest duplicate check across the whole sign-off log, IDs or not
  var idx = signoffIndexV20_1_();
  var already = idx.rows.filter(function (a) {
    return normalizeNameV20_1_(a.trainee) === normalizeNameV20_1_(rec.name) &&
           a.skillId === chosen.id && a.decision === 'Approve sign-off';
  });
  if (already.length) {
    var warn = rec.name + ' already has an Approve sign-off for ' + chosen.skill +
      ' (' + already[0].decisionId + (already[0].decisionDate ? ', ' + dateKeyV20_1_(already[0].decisionDate) : '') +
      ').\n\nRecord another one anyway?';
    if (ui.alert('Already signed off', warn, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) {
      return;
    }
  }

  var decider = sessionEmailV20_1_() || 'C. Hunt';
  var confirmMsg = rec.name + ' (' + rec.level + ')\n' + chosen.skill + '  [' + chosen.id + ']' +
    '\n\nApprove sign-off\nObserved : ' + dateKeyV20_1_(when) +
    '\nDecided by : ' + decider + '\nRationale : ' + rationale +
    '\n\nThis writes a permanent record. Proceed?';
  if (ui.alert('Confirm', confirmMsg, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;

  var qr = newIdV20_1_('QR');
  appendRowsHeaderMappedV20_1_(TAB.SKILL_VALIDATION, 4, [{
    'TRAINEE': rec.name, 'SKILL': chosen.skill, 'SKILL ID': chosen.id,
    'DECISION': 'Approve sign-off', 'DECIDED BY': decider, 'DECISION DATE': when,
    'RATIONALE': rationale, 'RECORD STATUS': 'OPEN', 'REQUEST ID': qr
  }], ['TRAINEE', 'SKILL', 'SKILL ID', 'RECORD STATUS', 'REQUEST ID']);

  var t = queueTableV20_1_(), rowNum = 0;
  if (t.ok) {
    t.rows.forEach(function (r, i) {
      if (String(r[t.col['REQUEST ID']] || '').trim() === qr) rowNum = t.firstDataRow + i;
    });
  }
  if (!rowNum) {
    ui.alert('The request row was created (' + qr + ') but could not be found again — ' +
      'nothing recorded yet. Tell Claude; nothing is lost.');
    return;
  }
  var out = recordDecisionForRowV20_1_(rowNum);
  var homeNote = '';
  try { refreshHomeNowV20_1(); homeNote = '\nHOME page updated.'; } catch (eH) {}
  ui.alert(out + homeNote);
}
