/**
 * SCEMS Field Training Tracker — 60_reporting
 *
 * Digests, scoreboards, snapshots and cards. Everything that gets read,
 * nothing that decides.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   5. MONTHLY BACKUP SNAPSHOT
 *   Trustworthy analytics: canonical recomputation, DATA ERROR surfacing,
 *   reconciliation totals, and the read-only analytics verifier.
 *   PRINCIPLES
 *   - Metrics are computed from validated canonical data in code, not from
 *   IFERROR-wrapped mega-formulas. A failed prerequisite yields the
 *   literal string 'DATA ERROR' plus a health note — never a silent 0.
 *   - Bounds are dynamic: readers use header-mapped tables and last-row
 *   logic, never $5:$44-style fixed windows.
 *   - verifyAnalyticsV20_1() recomputes and COMPARES; it never writes.
 *   SCEMS v20.1.0i ADD-ON : FTO scoreboard
 *   SCEMS v20.1.0i ADD-ON : tab 13 redo
 */

/* ---- ported from zz (effective winner) ---- */
/** Builds the snapshot for one trainee. */
function handoverCardBodyV19_(traineeName) {
  var S = ss();
  var name = String(traineeName || '').trim();
  var rec = traineeRecordV19_(name);
  if (!rec) return null;

  var L = [];
  L.push('TRAINEE HANDOVER CARD');
  L.push('');
  L.push(name + '   ' + (rec.level || 'level not set'));
  L.push('Usual FTO : ' + (rec.fto || 'unassigned'));
  L.push('');

  // ---- where they are ----
  var eng = S.getSheetByName(TAB.ENGINE);
  var e = null;
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) { e = rows[i]; break; }
    }
  }
  L.push('WHERE THEY ARE');
  L.push('  Phase        : ' + (rec.phase || 'not set') +
         (e && e[20] ? ', day ' + e[20] : ''));
  if (e) {
    L.push('  Shifts       : ' + (e[19] || 'not recorded'));
    L.push('  Evaluations  : ' + (e[6] || 0) +
           (e[8] !== '' && e[8] !== null ? ', last one ' + e[8] + ' day(s) ago' : ', none yet'));
    if (e[9]) L.push('  Average      : ' + e[9] + (e[11] ? '   trend ' + e[11] : ''));
    L.push('  Status       : ' + (e[17] || 'not set'));
  }
  L.push('');

  // ---- what they are working on ----
  var focus = '';
  try {
    var v9 = S.getSheetByName('09 TRAINEE VIEW');
    if (v9) {
      var vr = v9.getRange(5, 1, 40, 9).getValues();
      for (var j = 0; j < vr.length; j++) {
        if (String(vr[j][0]).trim() === name) { focus = String(vr[j][8] || ''); break; }
      }
    }
  } catch (err) {}
  L.push('WHAT THEY ARE WORKING ON');
  L.push('  ' + (focus || 'Not set. Agree a focus with them at the start of the shift.'));
  L.push('');

  // ---- skills ----
  var matrix = S.getSheetByName(TAB.SKILLS);
  var signed = [], progress = [], ready = [];
  if (matrix && matrix.getLastRow() >= 5) {
    matrix.getRange(5, 1, matrix.getLastRow() - 4, 20).getValues().forEach(function (r) {
      if (String(r[0]).trim() !== name) return;
      var skill = String(r[1] || '');
      var readiness = String(r[6] || '');
      var signoff = String(r[7] || '');
      if (signoff === 'SIGNED OFF') signed.push(skill);
      else if (readiness === 'READY FOR VALIDATION') ready.push(skill);
      else if (readiness === 'IN PROGRESS') progress.push(skill);
    });
  }
  L.push('SKILLS');
  L.push('  Signed off (' + signed.length + ')');
  if (signed.length) {
    signed.slice(0, 12).forEach(function (s) { L.push('     ' + s); });
    if (signed.length > 12) L.push('     and ' + (signed.length - 12) + ' more');
  } else {
    L.push('     none yet');
  }
  L.push('');
  L.push('  In progress (' + progress.length + ')');
  if (progress.length) {
    progress.slice(0, 12).forEach(function (s) { L.push('     ' + s); });
    if (progress.length > 12) L.push('     and ' + (progress.length - 12) + ' more');
  } else {
    L.push('     none recorded');
  }
  if (ready.length) {
    L.push('');
    L.push('  Awaiting validation (' + ready.length + ')');
    ready.forEach(function (s) { L.push('     ' + s); });
    L.push('     These are with leadership. Do not sign them off yourself.');
  }
  L.push('');

  L.push('ON SHIFT');
  L.push('  Submit a Shift Evaluation before you go home, the same as their');
  L.push('  usual FTO would. Score what you actually saw. If a skill');
  L.push('  progressed, log it.');
  L.push('');
  L.push('  You are covering, so you are not expected to judge their whole');
  L.push('  progression. Record the shift you had with them.');
  L.push('');
  L.push('  Anything unsafe is a call to Division Chief Stuckey the same');
  L.push('  shift, then the Urgent Concern form.');
  L.push('');
  L.push('No patient names, dates of birth, or addresses. Call numbers only.');
  L.push('');
  L.push('This card is an operational snapshot. It does not carry concerns,');
  L.push('decisions, or another FTO\'s assessment of this trainee.');

  return L.join('\n');
}

function traineeStatusCards() {
  var S = ss();
  var master = S.getSheetByName(TAB.MASTER).getRange(5, 1, 40, 9).getValues();
  var emailByTrainee = {};
  master.forEach(function (r) { if (r[0] && r[8]) emailByTrainee[r[0]] = r[8]; });
  var skipped = [];
  master.forEach(function (r) {
    if (r[0] && !r[8] && String(r[0]).indexOf('EXAMPLE') !== 0) skipped.push(r[0]);
  });
  var view = S.getSheetByName('09 TRAINEE VIEW').getRange(5, 1, 40, 12).getValues();
  var sentN = 0, unsent = [];
  view.forEach(function (r) {
    if (!r[0] || !emailByTrainee[r[0]] || String(r[0]).indexOf('EXAMPLE') === 0) return;
    if (!mailBudgetOkV20_2_('Trainee status cards', sentN + 1)) { unsent.push(String(r[0])); return; }
    var due = r[10] instanceof Date ? Utilities.formatDate(r[10], 'America/New_York', 'yyyy-MM-dd') : 'none scheduled';
    var body =
      'Your field training status, ' + r[0] + ':\n\n' +
      'Level: ' + r[1] + '  |  Entry Profile: ' + r[2] + '  |  ' + r[3] + '\n' +
      'Training shifts logged: ' + r[4] + '  |  Trend: ' + r[5] + '\n\n' +
      'A recent strength your FTO documented: ' + (r[6] || 'none logged yet') + '\n' +
      'Current improvement focus: ' + (r[7] || 'none logged yet') + '\n' +
      'Next shift focus: ' + (r[8] || 'set with your FTO') + '\n' +
      'Skills ready for leadership validation: ' + r[9] + '\n' +
      'Next decision due: ' + due + '\n' +
      'Note: ' + (r[11] || '') + '\n\n' +
      'Questions about your status go to your FTO or the Training and Compliance Officer.';
    sendMail(emailByTrainee[r[0]], 'Your Field Training Status : Week of ' +
      Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd'), body);
    sentN++;
  });
  reportBulkTruncationV20_2_('Trainee status cards', sentN, unsent);
  if (skipped.length) {
    sendMail(CONFIG.TCO_EMAIL,
      'Trainee Cards : ' + skipped.length + ' Trainee(s) Have No Email on File',
      'These trainees received no status card because column I on 01 TRAINEE MASTER is blank:\n\n' +
      skipped.join('\n') + '\n\nAdd their email addresses so they get their Monday card.');
  }
}

/* ---- ported from master (effective winner) ---- */
/** v3: branded HTML snapshot. */
function supervisorDigest() {
  var S = ss();
  var ctl = S.getSheetByName(TAB.CONTROL);
  var threshold = ctl.getRange('B5').getValue();

  var roster = ctl.getRange(5, 6, 25, 2).getValues();
  var shiftByFto = {};
  roster.forEach(function (r) { if (r[0]) shiftByFto[String(r[0])] = String(r[1]); });

  var sup = ctl.getRange(5, 13, 4, 3).getValues();
  var supByShift = {};
  sup.forEach(function (r) { if (r[0]) supByShift[String(r[0])] = { name: r[1], email: r[2] }; });

  var view = S.getSheetByName('09 TRAINEE VIEW').getRange(5, 1, 40, 9).getValues();
  var extras = {};
  view.forEach(function (r) { if (r[0]) extras[r[0]] = { strength: r[6], focus: r[8] }; });

  var ev = S.getSheetByName(TAB.EVAL);
  var firstEval = {};
  if (ev.getLastRow() >= 5) {
    ev.getRange(5, 1, ev.getLastRow() - 4, 7).getValues().forEach(function (r) {
      var t = r[2], dt = r[6];
      if (!t || !(dt instanceof Date)) return;
      if (!firstEval[t] || dt < firstEval[t]) firstEval[t] = dt;
    });
  }

  var byShift = {};
  engineRows().forEach(function (r) {
    var name = r[0];
    if (!name || String(name).indexOf(TEST_PREFIX) === 0) return;
    var shift = shiftByFto[String(r[3] || '')] || 'UNASSIGNED';
    (byShift[shift] = byShift[shift] || []).push(r);
  });

  var now = new Date();
  var week = Utilities.formatDate(now, 'America/New_York', 'MMMM d, yyyy');

  var digestSent = 0, digestUnsent = [];
  Object.keys(byShift).forEach(function (shift) {
    if (!mailBudgetOkV20_2_('Supervisor digest', digestSent + 1)) {
      digestUnsent.push(shift + ' shift');
      return;
    }
    var cards = [], textBlocks = [];
    byShift[shift].forEach(function (r) {
      var name = r[0], level = r[1], fto = r[3] || 'unassigned', phase = String(r[4] || ''),
          evals = r[6] || 0, daysSince = r[8], avg = r[9], trend = r[11], status = r[17];
      var ex = extras[name] || {};
      var weeksIn = firstEval[name]
        ? Math.max(1, Math.round((now - firstEval[name]) / (7 * 86400000))) : 0;
      var overdue = (typeof daysSince === 'number') && daysSince > threshold;
      var ftoText;
      if (typeof daysSince !== 'number') ftoText = fto + ' : no evaluations submitted yet';
      else if (overdue) ftoText = fto + ' : PAPERWORK OVERDUE, last evaluation ' + daysSince + ' days ago';
      else ftoText = fto + ' : paperwork current';
      var trendWord = trend === 'Rising' ? 'improving' : trend === 'Falling' ? 'slipping' : trend === 'Steady' ? 'holding steady' : '';

      var o = {
        name: name, level: level, phaseNum: phase.replace('Phase ', '') || '?',
        weeksIn: weeksIn, evals: evals, avg: avg, trendWord: trendWord,
        strength: ex.strength || 'nothing documented yet',
        focus: ex.focus || 'set at the start of each shift',
        fto: fto, ftoText: ftoText, ftoOverdue: overdue,
        daysSince: daysSince, status: status
      };
      cards.push(traineeCard_(o));
      textBlocks.push(name + ' (' + level + ', ' + phase + '): ' + evals + ' shifts, avg ' +
        (avg || 'n/a') + ', ' + (trendWord || 'no trend') + '. ' + ftoText + '. ' +
        statusMeta_(status, daysSince, fto).line);
    });

    var html = '' +
    '<div style="max-width:640px;margin:0 auto;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;padding-bottom:8px;">' +
      '<div style="background:#1d1b18;padding:22px 22px 18px 22px;border-bottom:4px solid #c9a227;">' +
        '<div style="color:#c9a227;font-size:12px;font-weight:bold;letter-spacing:2px;">SUMTER COUNTY EMS</div>' +
        '<div style="color:#f7f3ea;font-size:22px;font-weight:bold;margin-top:4px;">' + shift + ' SHIFT; FIELD TRAINING SNAPSHOT</div>' +
        '<div style="color:#b4ac9c;font-size:12px;margin-top:4px;">Week of ' + week + ' &nbsp;&middot;&nbsp; ' + byShift[shift].length + ' trainee(s) on your shift</div>' +
      '</div>' +
      '<div style="height:16px;"></div>' +
      cards.join('') +
      '<div style="margin:4px 16px 16px 16px;padding:12px 16px;background:#1d1b18;border-radius:8px;color:#b4ac9c;font-size:11px;line-height:1.5;">' +
        'Questions or concerns about a trainee or an FTO go to the <b style="color:#c9a227;">Division Chief of Training</b>. ' +
        'A safety concern is a same-shift call or text, then the Urgent Concern form on the Hub.' +
      '</div>' +
    '</div>';

    var text = shift + ' SHIFT; FIELD TRAINING SNAPSHOT : Week of ' + week + '\n\n' + textBlocks.join('\n\n');
    var target = supByShift[shift];
    if (shift === 'UNASSIGNED' || !target) {
      sendHtmlMail(CONFIG.TCO_EMAIL, 'Supervisor Snapshot : trainees with no shift mapping', text, html);
    } else {
      sendHtmlMail(String(target.email), shift + ' Shift; Field Training Snapshot : ' + week, text, html);
    }
    digestSent++;
  });
  reportBulkTruncationV20_2_('Supervisor digest', digestSent, digestUnsent);
  Logger.log('HTML supervisor snapshots sent: ' + digestSent +
    (digestUnsent.length ? ' (' + digestUnsent.length + ' held back for quota)' : '') + '.');
}

/* ---- ported from master (effective winner) ---- */
function systemHeartbeat() {
  var problems = [];
  var S = ss();

  // 1. triggers armed
  var need = MANAGED_TRIGGER_HANDLERS;
  var have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; });
  need.forEach(function (n) {
    if (!have[n]) problems.push('Trigger missing: ' + n + '. FIX: run installTriggers() once.');
  });

  // 2. forms alive, accepting, and feeding this workbook
  var ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '[]');
  if (!ids.length) problems.push('No stored form IDs. FIX: forms may have been rebuilt outside the system.');
  ids.forEach(function (id) {
    try {
      var f = FormApp.openById(id);
      if (!f.isAcceptingResponses()) problems.push('Form not accepting responses: ' + f.getTitle() + '. FIX: open the form, Responses, toggle Accepting responses on.');
      var dest = '';
      try { dest = f.getDestinationId(); } catch (d) {}
      if (dest && dest !== S.getId()) problems.push('Form feeding the WRONG workbook: ' + f.getTitle() + '. FIX: relink via Form, Responses, destination.');
      if (!dest) problems.push('Form has no response destination: ' + f.getTitle() + '. FIX: relink to the tracker.');
    } catch (e) {
      problems.push('Form unreachable (deleted or permissions): id ' + id);
    }
  });

  // 3. critical tabs present
  [TAB.CONTROL, TAB.MASTER, TAB.EVAL, TAB.REFLECT, TAB.URGENT, TAB.SKILLS, TAB.ENGINE,
   TAB.QUEUE, '13 AUDIT - EXCEPTION LOG', DECISIONS_TAB, ARCHIVE_TAB, 'HOME',
   TAB.SKILL_EVIDENCE, TAB.SKILL_VALIDATION, TAB.SKILL_SIGNOFF].forEach(function (n) {
    if (!S.getSheetByName(n)) problems.push('Tab missing: ' + n + '. FIX: run repairControlAndEngine() or the matching builder.');
  });

  // 4. the engine is breathing
  try {
    var eng = S.getSheetByName(TAB.ENGINE);
    if (eng && !eng.getRange('R5').getFormula()) {
      problems.push('Status engine formulas are gone (R5 empty). FIX: run repairControlAndEngine(), then fixEngineOrder().');
    }
  } catch (e) {}

  // 5. backups current
  try {
    var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
    if (!folders.hasNext()) {
      problems.push('Backup folder missing. FIX: run monthlySnapshot() once.');
    } else {
      var files = folders.next().getFilesByType(MimeType.MICROSOFT_EXCEL);
      var newest = null;
      while (files.hasNext()) {
        var f2 = files.next();
        if (!newest || f2.getDateCreated() > newest) newest = f2.getDateCreated();
      }
      if (!newest) problems.push('No backup snapshot exists yet. FIX: SCEMS menu, Run backup snapshot now.');
      else if ((new Date() - newest) / 86400000 > 40) {
        problems.push('Newest backup is over 40 days old. FIX: run monthlySnapshot() and confirm the monthly trigger with installTriggers().');
      }
    }
  } catch (e) {}

  if (problems.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'SYSTEM HEALTH : ' + problems.length + ' Issue(s) Need Attention : Field Training Tracker',
      'The weekly self-test found problems. Alerts and automation may not be reliable until these are fixed:\n\n' +
      problems.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n') +
      '\n\nThe system stays silent when healthy; this email only exists because something is broken.');
  }
  Logger.log('Heartbeat: ' + (problems.length ? problems.length + ' problem(s), email sent.' : 'all healthy, silent.'));
}

/* ---- ported from master (effective winner) ---- */

function monthlySnapshot() {
  var S = ss();
  var url = 'https://docs.google.com/spreadsheets/d/' + S.getId() + '/export?format=xlsx';
  var blob = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob();
  var name = 'SCEMS_Tracker_Backup_' +
    Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd_HHmm') + '.xlsx';
  blob.setName(name);
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var file = folder.createFile(blob);
  sendMail(CONFIG.SUPERVISOR_EMAILS,
    'SCEMS Tracker Backup Complete : ' + name,
    'Full workbook snapshot saved:\n' + file.getUrl());
  Logger.log('Backup saved: ' + file.getUrl());
}

/* ---- ported round 2 : HOME panel, rollup, trainee-skills views, consts ---- */

function collectActionItemsV19_() {
  var S = ss();
  var items = [];

  var threshold = 5;
  try {
    var t = S.getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(t) > 0) threshold = Number(t);
  } catch (e) {}

  // ---- trainees: overdue, and never started ----
  var eng = S.getSheetByName(TAB.ENGINE);
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      if (String(r[21] || '').toUpperCase() === 'SNOOZED') return;

      var fto      = String(r[3] || '').trim() || 'no FTO assigned';
      var evals    = Number(r[6]) || 0;
      var daysSince= r[8] === '' || r[8] === null ? null : Number(r[8]);
      var dayInPhase = Number(r[20]) || 0;

      if (evals > 0 && daysSince !== null && daysSince > threshold) {
        items.push({
          sev: 'OVERDUE', sort: 10000 - daysSince, who: name,
          detail: daysSince + ' days since last evaluation',
          owner: fto, action: 'Chase the FTO for a shift evaluation'
        });
      } else if (evals === 0 && dayInPhase > START_GRACE_DAYS_V19) {
        items.push({
          sev: 'NOT STARTED', sort: 10000 - dayInPhase, who: name,
          detail: 'day ' + dayInPhase + ', no evaluation ever filed',
          owner: fto, action: 'Confirm training has actually begun'
        });
      }

      var review = String(r[17] || '');
      if (review.indexOf('Due') >= 0) {
        items.push({
          sev: 'DUE', sort: 5000, who: name, detail: review,
          owner: fto, action: 'File on the Decision Record form'
        });
      }
    });
  }

  // ---- decision queue ----
  var q = S.getSheetByName(TAB.QUEUE);
  if (q && q.getLastRow() >= 5) {
    var now = new Date();
    q.getRange(5, 1, Math.min(q.getLastRow() - 4, 296), 8).getValues().forEach(function (r) {
      var who = String(r[1] || '').trim();
      if (!who || r[5]) return;
      var due = r[4] instanceof Date ? r[4] : null;
      var breached = due && due.getTime() < now.getTime();
      var hrs = due ? Math.round((due.getTime() - now.getTime()) / 3600000) : null;
      items.push({
        sev: breached ? 'BREACHED' : 'DUE',
        sort: breached ? 100 : 4000,
        who: who,
        detail: String(r[2] || 'decision') +
                (breached ? ', PAST DEADLINE' : hrs !== null ? ', ' + hrs + 'h left' : ''),
        owner: 'Division Chief of Training',
        action: 'File on the Decision Record form'
      });
    });
  }

  // ---- audit flags ----
  var au = S.getSheetByName('13 AUDIT - EXCEPTION LOG');
  if (au) {
    var labels = ['advancement vs score', 'reflection vs score',
                  'extreme score without narrative', 'silent record',
                  'FTO scope', 'phase mismatch'];
    au.getRange(5, 1, 40, 7).getValues().forEach(function (r) {
      var who = String(r[0] || '').trim();
      if (!who) return;
      var lit = [];
      for (var c = 1; c <= 6; c++) {
        if (String(r[c]).trim().toUpperCase() === 'FLAG') lit.push(labels[c - 1]);
      }
      if (!lit.length) return;
      items.push({
        sev: 'FLAG', sort: 200 - lit.length, who: who,
        detail: lit.join(', '),
        owner: 'Division Chief of Training',
        action: 'Review on tab 13 and log the reviewer and action'
      });
    });
  }

  // ---- skills ready for validation ----
  var sq = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (sq && sq.getLastRow() >= 5) {
    sq.getRange(5, 1, Math.min(sq.getLastRow() - 4, 500), 12).getValues().forEach(function (r) {
      var who = String(r[1] || '').trim();
      if (!who || String(r[11]) !== 'OPEN') return;
      items.push({
        sev: 'SKILL', sort: 6000, who: who,
        detail: String(r[4] || 'skill ready for validation'),
        owner: 'Division Chief of Training',
        action: 'Record the decision on tab 20'
      });
    });
  }

  items.sort(function (a, b) {
    var ra = SEV_V19[a.sev].rank, rb = SEV_V19[b.sev].rank;
    if (ra !== rb) return ra - rb;
    return a.sort - b.sort;
  });
  return items;
}

function statusMeta_(status, daysSince, fto) {
  var s = String(status || '');
  if (s.indexOf('NRT') >= 0) return { color: '#8f1f12',
    line: 'Formal Not Responding to Training concern filed. Decision in progress with the Division Chief of Training.' };
  if (s.indexOf('Delayed') >= 0) return { color: '#c43a28',
    line: 'NEEDS ATTENTION: no evaluation in ' + daysSince + ' days. Check in with ' + (fto || 'the assigned FTO') + '.' };
  if (s.indexOf('Advancement') >= 0) return { color: '#c9a227',
    line: 'Up for advancement review. Decision due within 72 hours.' };
  if (s.indexOf('Needs Attention') >= 0) return { color: '#e0a11a',
    line: 'Scores running below standard. Coaching in progress; your awareness helps.' };
  if (s.indexOf('No Evals') >= 0) return { color: '#6f6a61',
    line: 'Just getting started. No evaluations on file yet.' };
  return { color: '#3f8f5a', line: 'On track. Nothing needs your attention.' };
}

function traineeCard_(o) {
  var meta = statusMeta_(o.status, o.daysSince, o.fto);
  var ftoDot = o.ftoOverdue ? '#c43a28' : (o.evals > 0 ? '#3f8f5a' : '#6f6a61');
  var avgPct = o.avg ? Math.round((o.avg / 5) * 100) : 0;
  var chip = function (txt, bg, fg) {
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font-size:11px;font-weight:bold;padding:3px 10px;border-radius:10px;margin-right:6px;">' + txt + '</span>';
  };
  return '' +
  '<div style="background:#ffffff;border-left:7px solid ' + meta.color + ';border-radius:8px;' +
       'margin:0 16px 16px 16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.12);">' +
    '<div style="font-size:19px;font-weight:bold;color:#1d1b18;letter-spacing:0.5px;">' + o.name + '</div>' +
    '<div style="margin:8px 0 10px 0;">' +
      chip(o.level, '#1d1b18', '#c9a227') +
      chip('Phase ' + o.phaseNum + ' of 4', '#c9a227', '#1d1b18') +
      (o.weeksIn ? chip('Week ' + o.weeksIn, '#efe9db', '#6f6a61') : '') +
    '</div>' +
    '<div style="font-size:13px;color:#444;margin-bottom:10px;">' +
      '<b>' + o.evals + '</b> training shift' + (o.evals === 1 ? '' : 's') + ' evaluated' +
      (o.avg ? ' &nbsp;&middot;&nbsp; averaging <b>' + o.avg + ' / 5</b>' : '') +
      (o.trendWord ? ' &nbsp;&middot;&nbsp; ' + o.trendWord : '') +
    '</div>' +
    (o.avg ?
    '<div style="background:#efe9db;border-radius:6px;height:10px;margin:0 0 12px 0;">' +
      '<div style="background:' + meta.color + ';width:' + avgPct + '%;height:10px;border-radius:6px;"></div>' +
    '</div>' : '') +
    '<table style="font-size:13px;color:#333;border-collapse:collapse;width:100%;">' +
      '<tr><td style="color:#3f8f5a;font-weight:bold;width:110px;padding:3px 0;vertical-align:top;">Doing well</td>' +
          '<td style="padding:3px 0;">' + o.strength + '</td></tr>' +
      '<tr><td style="color:#8a6a1f;font-weight:bold;padding:3px 0;vertical-align:top;">Working on</td>' +
          '<td style="padding:3px 0;">' + o.focus + '</td></tr>' +
      '<tr><td style="color:#555;font-weight:bold;padding:3px 0;vertical-align:top;">FTO</td>' +
          '<td style="padding:3px 0;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + ftoDot + ';margin-right:6px;"></span>' + o.ftoText + '</td></tr>' +
    '</table>' +
    '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eee;' +
         'font-size:13px;font-weight:bold;color:' + meta.color + ';">' + meta.line + '</div>' +
  '</div>';
}

function rollupCardV19_(f) {
  var INK = '#1d1b18', GOLD = '#c9a227', GOLDD = '#8a6a1f',
      RED = '#c43a28', GREEN = '#3f8f5a', MUTE = '#847d6d', HAIR = '#e8e4da';
  var attention = f.overdue;
  var edge = attention ? RED : (f.evals === 0 ? GOLD : GREEN);
  var pct = f.avg ? Math.round((f.avg / 5) * 100) : 0;
  var bar = attention ? RED : (f.avg && f.avg < 3 ? GOLD : GREEN);

  function badge(t, bg, fg) {
    if (!t) return '';
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font:600 10px Arial,sans-serif;padding:3px 9px;border-radius:10px;' +
      'margin:0 5px 0 0;">' + escHtmlV19_(t) + '</span>';
  }

  var h = [];
  h.push('<div style="background:#ffffff;border:1px solid ' + HAIR +
    ';border-left:5px solid ' + edge + ';border-radius:8px;padding:15px 18px;margin:0 0 12px 0;">');

  h.push('<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>');
  h.push('<td style="vertical-align:top;">');
  h.push('<div style="font:700 17px Arial,sans-serif;color:' + INK + ';">' +
    escHtmlV19_(f.name) + '</div>');
  h.push('<div style="margin:7px 0 0 0;">' +
    badge(f.level, INK, '#ffffff') +
    badge(f.phase ? f.phase + ' of 4' : '', GOLD, INK) +
    badge(f.fto, '#f1ede2', GOLDD) + '</div>');
  h.push('</td>');
  h.push('<td style="width:150px;text-align:right;vertical-align:top;">');
  if (f.evals > 0) {
    h.push('<div style="font:700 20px Arial,sans-serif;color:' + INK + ';">' +
      (f.avg ? f.avg : '-') + '<span style="font:400 12px Arial,sans-serif;color:' +
      MUTE + ';"> / 5</span></div>');
    h.push('<div style="font:11px Arial,sans-serif;color:' + MUTE + ';">' +
      f.evals + ' shift' + (f.evals === 1 ? '' : 's') +
      (f.trend ? ', ' + escHtmlV19_(f.trend.toLowerCase()) : '') + '</div>');
  } else {
    h.push('<div style="font:12px Arial,sans-serif;color:' + MUTE + ';">no shifts yet</div>');
  }
  h.push('</td></tr></table>');

  if (f.evals > 0) {
    h.push('<div style="background:#eee9dc;height:7px;border-radius:4px;overflow:hidden;margin:11px 0 0 0;">' +
      '<div style="background:' + bar + ';height:7px;width:' + pct + '%;"></div></div>');
  }

  h.push('<div style="margin:12px 0 0 0;padding:9px 12px;background:#faf8f2;' +
    'border-radius:5px;font:12px Arial,sans-serif;color:#4a453c;">' +
    '<b style="color:' + GOLDD + ';">Shift progress</b> &nbsp; ' +
    escHtmlV19_(f.progress) + '</div>');

  if (attention) {
    h.push('<div style="margin:10px 0 0 0;font:700 12px Arial,sans-serif;color:' + RED + ';">' +
      'NEEDS ATTENTION: no evaluation in ' + f.days + ' days, FTO ' +
      escHtmlV19_(f.fto) + '</div>');
  }
  h.push('</div>');
  return h.join('');
}

function snapshotFactsV19_(name) {
  var rec = traineeRecordV19_(name) || {};
  var eng = ss().getSheetByName(TAB.ENGINE);
  var e = null;
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) { e = rows[i]; break; }
    }
  }
  var days = e && e[8] !== '' && e[8] !== null ? Number(e[8]) : null;
  var dayInPhase = e ? Number(e[20]) || 0 : 0;
  var threshold = 5;
  try {
    var t = ss().getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(t) > 0) threshold = Number(t);
  } catch (err) {}

  return {
    name: name,
    level: rec.level || '',
    phase: rec.phase || '',
    week: dayInPhase > 0 ? 'Week ' + Math.ceil(dayInPhase / 7) : '',
    fto: rec.fto || 'unassigned',
    evals: e ? Number(e[6]) || 0 : 0,
    avg: e && e[9] ? Number(e[9]) : null,
    trend: e ? String(e[11] || '') : '',
    days: days,
    overdue: days !== null && days > threshold,
    strength: latestStrengthV19_(name),
    focus: latestFocusV19_(name)
  };
}

function progressLineV19_(name) {
  var p = shiftProgressV19_(name);
  if (!p.ok) return 'Progress unavailable : ' + p.why;
  if (p.evals === 0) {
    return 'No training shifts evaluated yet. ' + p.perPhase +
           ' required in ' + (p.phase || 'this phase') + '.';
  }
  var line = p.evals + ' training shift' + (p.evals === 1 ? '' : 's') +
             ' evaluated in total';
  if (p.phaseProgress) {
    line += '. ' + (p.phase || 'Current phase') + ': ' + p.phaseProgress;
  } else {
    line += '. ' + p.perPhase + ' required per phase.';
  }
  line += '.';
  if (p.metPhaseMin) {
    line += ' Minimum met, eligible to advance on competency.';
  }
  return line.replace(/\.\./g, '.');
}

function viewOverviewV19_(sh, name, rec, row) {
  var sk = traineeSkillsV19_(name);
  var events = traineeEventsV19_(name);

  var counts = [
    ['SIGNED OFF', sk.signed.length, TV.GREEN],
    ['READY', sk.ready.length, TV.GOLD],
    ['IN PROGRESS', sk.progress.length, TV.GOLDD],
    ['NOT STARTED', sk.notStarted.length, TV.MUTE]
  ];
  counts.forEach(function (c, i) {
    var col = 2 + i * 2;
    sh.getRange(row, col, 1, 2).merge().setValue(c[1])
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(22)
      .setFontColor(c[2]).setHorizontalAlignment('center')
      .setVerticalAlignment('middle').setBackground('#ffffff')
      .setBorder(true, true, false, true, false, false, TV.HAIR,
                 SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(row + 1, col, 1, 2).merge().setValue(c[0])
      .setFontFamily('Oswald').setFontSize(8).setFontColor(TV.MUTE)
      .setHorizontalAlignment('center').setVerticalAlignment('top')
      .setBackground('#ffffff')
      .setBorder(false, true, true, true, false, false, TV.HAIR,
                 SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.setRowHeight(row, 34); sh.setRowHeight(row + 1, 18);
  row += 3;

  row = tvBandV19_(sh, row, 'WHERE THEY ARE', TV.BLUE);
  var facts = [];
  try {
    var f = snapshotFactsV19_(name);
    facts.push(['Shifts evaluated', String(f.evals)]);
    if (f.avg) facts.push(['Average score', f.avg + ' / 5' + (f.trend ? ', ' + f.trend.toLowerCase() : '')]);
    facts.push(['Last evaluation', f.days === null ? 'none yet' : f.days + ' day(s) ago']);
    if (f.strength) facts.push(['Doing well', f.strength]);
    if (f.focus) facts.push(['Working on', f.focus]);
  } catch (e) {}
  try { facts.push(['Shift progress', progressLineV19_(name)]); } catch (e) {}
  facts.push(['Skill events logged', String(events.length)]);

  facts.forEach(function (f) {
    sh.getRange(row, 3).setValue(f[0])
      .setFontFamily('Inter').setFontWeight('bold').setFontSize(9)
      .setFontColor(TV.MUTE).setVerticalAlignment('middle');
    sh.getRange(row, 4, 1, 5).merge().setValue(f[1])
      .setFontFamily('Inter').setFontSize(10).setVerticalAlignment('middle')
      .setWrap(true);
    sh.setRowHeight(row, 22);
    row++;
  });
  row++;

  row = tvBandV19_(sh, row, 'WHAT HAPPENS NEXT', TV.GOLD);
  var next = [];
  if (sk.ready.length) {
    next.push(sk.ready.length + ' skill(s) are ready for validation. That is ' +
      'with leadership on tab 20, not with the trainee.');
  }
  if (sk.progress.length) {
    next.push(sk.progress.length + ' skill(s) in progress. See Skills remaining ' +
      'for how far off each one is.');
  }
  if (sk.notStarted.length) {
    next.push(sk.notStarted.length + ' skill(s) not started yet.');
  }
  if (!events.length) {
    next.push('No skill events logged at all. If they have been on shift, the ' +
      'Skills Quick Log is not being submitted.');
  }
  if (!next.length) next.push('Nothing outstanding on skills.');

  next.forEach(function (t) {
    sh.getRange(row, 3, 1, 6).merge().setValue(t)
      .setFontFamily('Inter').setFontSize(10).setWrap(true)
      .setVerticalAlignment('middle');
    sh.setRowHeight(row, 24);
    row++;
  });
}

function viewActivityV19_(sh, name, row) {
  var events = traineeEventsV19_(name);
  var shown = events.slice(0, 60);

  row = tvBandV19_(sh, row, 'SKILL EVENTS   ' + events.length +
    ' total, showing ' + shown.length + ', newest first', TV.BLUE);

  row = tvTableV19_(sh, row,
    ['DATE', 'SKILL', 'STAGE', 'OUTCOME', 'FTO', 'CALL REF'],
    shown.map(function (e) {
      return [e.date, e.skill, e.stage, e.outcome, e.fto, e.callRef];
    }), [2, 2]);

  if (shown.length) {
    sh.getRange(row - shown.length - 1, 3, shown.length, 1)
      .setNumberFormat('yyyy-mm-dd');
  }

  sh.getRange(row, 2, 1, 7).merge()
    .setValue('The full permanent record is on 19 SKILL EVIDENCE LOG. ' +
              'This page reads it and never writes to it.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE);
}

function viewSkillsByPhaseV19_(sh, name, row) {
  var events = traineeEventsV19_(name);
  if (!events.length) {
    sh.getRange(row, 3).setValue('No skill events recorded for this trainee yet.')
      .setFontFamily('Inter').setFontSize(10).setFontColor(TV.MUTE);
    return;
  }

  var byPhase = {}, order = [];
  events.forEach(function (e) {
    var p = e.phase || 'Phase not recorded';
    if (!byPhase[p]) { byPhase[p] = {}; order.push(p); }
    if (!byPhase[p][e.skill]) {
      byPhase[p][e.skill] = { skill: e.skill, count: 0, stages: {}, last: null, ftos: {} };
    }
    var s = byPhase[p][e.skill];
    s.count++;
    s.stages[e.stage] = (s.stages[e.stage] || 0) + 1;
    if (e.fto) s.ftos[e.fto] = true;
    if (!s.last || (e.date && e.date > s.last)) s.last = e.date;
  });
  order.sort();

  order.forEach(function (p) {
    var skills = Object.keys(byPhase[p]).sort().map(function (k) { return byPhase[p][k]; });
    row = tvBandV19_(sh, row, p.toUpperCase() + '   ' + skills.length +
      ' skill(s), ' + skills.reduce(function (a, s) { return a + s.count; }, 0) +
      ' event(s)', TV.BLUE);

    var rows = skills.map(function (s) {
      var stageStr = ['O', 'A', 'P', 'I'].filter(function (k) { return s.stages[k]; })
        .map(function (k) { return k + ' x' + s.stages[k]; }).join('  ');
      return [s.skill, s.count, stageStr,
              Object.keys(s.ftos).length, s.last || '', ''];
    });
    row = tvTableV19_(sh, row,
      ['SKILL', 'EVENTS', 'STAGES SEEN', 'FTOs', 'LAST SEEN', ''],
      rows, [1, 3]);
  });

  sh.getRange(row, 2, 1, 7).merge()
    .setValue('Stages: O observed, A assisted, P performed with coaching, ' +
              'I performed independently.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE);
}

function viewSkillsCompletedV19_(sh, name, row) {
  var sk = traineeSkillsV19_(name);

  row = tvBandV19_(sh, row, 'SIGNED OFF   ' + sk.signed.length + ' skill(s)', TV.GREEN);
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'SIGNED BY', 'SIGNED ON'],
    sk.signed.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.signedBy, s.signedOn];
    }), [1, 3]);

  row = tvBandV19_(sh, row,
    'EVIDENCE COMPLETE, AWAITING VALIDATION   ' + sk.ready.length + ' skill(s)', TV.GOLD);
  sh.getRange(row, 3, 1, 6).merge()
    .setValue(sk.ready.length
      ? 'The trainee has done their part on these. They are waiting on a ' +
        'validation decision on tab 20, not on further work.'
      : 'Nothing waiting on a validation decision.')
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row++;
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'FTOs', ''],
    sk.ready.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.ftos, ''];
    }), [1, 4]);

  var total = sk.signed.length + sk.ready.length;
  var all = sk.all.length;
  sh.getRange(row, 2, 1, 7).merge()
    .setValue(total + ' of ' + all + ' skill(s) complete or awaiting validation. ' +
      'Meeting the evidence thresholds makes a skill eligible for validation. ' +
      'It does not sign it off. Sign-off is a documented human decision against ' +
      'the approved standard.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE).setWrap(true);
}

function viewSkillsRemainingV19_(sh, name, rec, row) {
  var sk = traineeSkillsV19_(name);

  row = tvBandV19_(sh, row, 'SHIFTS', TV.BLUE);
  var line = '';
  try { line = progressLineV19_(name); } catch (e) { line = 'not available'; }
  sh.getRange(row, 3, 1, 6).merge().setValue(line)
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row += 2;

  row = tvBandV19_(sh, row,
    'IN PROGRESS   ' + sk.progress.length + ' skill(s)', TV.GOLDD);
  sh.getRange(row, 3, 1, 6).merge()
    .setValue(sk.progress.length
      ? 'Started, but not yet enough evidence. The counts show how far along each one is.'
      : 'Nothing part way through.')
    .setFontFamily('Inter').setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(row, 24);
  row++;
  row = tvTableV19_(sh, row,
    ['SKILL', 'SUCCESSFUL', 'INDEPENDENT', 'DATES', 'FTOs', 'STAGE REACHED'],
    sk.progress.map(function (s) {
      return [s.skill, s.successful, s.independent, s.dates, s.ftos, s.stage];
    }), [1, 4]);

  row = tvBandV19_(sh, row,
    'NOT STARTED   ' + sk.notStarted.length + ' skill(s)', TV.RED);
  row = tvTableV19_(sh, row, ['SKILL', '', '', '', '', ''],
    sk.notStarted.map(function (s) { return [s.skill, '', '', '', '', '']; }), null);

  var left = sk.progress.length + sk.notStarted.length;
  sh.getRange(row, 2, 1, 7).merge()
    .setValue(left + ' of ' + sk.all.length + ' skill(s) still to complete. ' +
      'Anything already sitting with leadership appears under Skills completed, ' +
      'not here, because the trainee has done their part on those.')
    .setFontFamily('Inter').setFontSize(8).setFontStyle('italic')
    .setFontColor(TV.MUTE).setWrap(true);
}

function signaturesOnFileV19_(trainee, itemType, sinceMs) {
  var out = {};
  var dec = ss().getSheetByName(DECISIONS_TAB);
  if (!dec || dec.getLastRow() < 5) return out;
  dec.getRange(5, 1, dec.getLastRow() - 4, 9).getValues().forEach(function (r) {
    if (String(r[3]).trim() !== String(trainee).trim()) return;
    if (String(r[4]) !== String(itemType)) return;
    var ts = r[0] instanceof Date ? r[0].getTime() : 0;
    if (sinceMs && ts < sinceMs) return;
    var role = String(r[2] || '').trim();
    if (role === DUAL_ROLE_TRAINING_V19 || role === DUAL_ROLE_MEDICAL_V19) {
      if (!out[role] || ts > out[role].ts) {
        out[role] = { ts: ts, by: String(r[1] || '').trim(), decision: String(r[5] || '').trim(),
                      rationale: String(r[6] || '').trim(), effective: r[7] };
      }
    }
  });
  return out;
}

/* [var DIGEST_COPY_TO_V19 : defined above] */


/* ---- ported round 3 : trainee-view card helpers ---- */

function latestFocusV19_(traineeName) {
  try {
    var v9 = ss().getSheetByName('09 TRAINEE VIEW');
    if (!v9) return '';
    var rows = v9.getRange(5, 1, 40, 9).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(traineeName).trim()) {
        return String(rows[i][8] || '').trim();
      }
    }
  } catch (e) {}
  return '';
}

function latestStrengthV19_(traineeName) {
  var ev = ss().getSheetByName(TAB.EVAL);
  if (!ev || ev.getLastRow() < 5) return '';
  var rows = ev.getRange(5, 1, ev.getLastRow() - 4, 24).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][2]).trim() !== String(traineeName).trim()) continue;
    var s = String(rows[i][21] || '').trim();
    if (s) return s;
  }
  return '';
}

function shiftProgressV19_(name) {
  var rec = traineeRecordV19_(name);
  if (!rec) return { ok: false, why: 'not on the Trainee Master' };

  var mins = phaseMinimumsV19_();
  var perPhase = mins[rec.level];
  if (!perPhase) {
    return { ok: false, why: 'no minimum set for ' + (rec.level || 'this level') };
  }

  var eng = ss().getSheetByName(TAB.ENGINE);
  var evals = 0, phaseProgress = '';
  if (eng) {
    var rows = eng.getRange(5, 1, 40, 22).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === name) {
        evals = Number(rows[i][6]) || 0;
        phaseProgress = String(rows[i][19] || '').trim();
        break;
      }
    }
  }

  return {
    ok: true,
    level: rec.level,
    phase: rec.phase,
    evals: evals,
    perPhase: perPhase,
    phaseProgress: phaseProgress,
    metPhaseMin: /^Met/i.test(phaseProgress)
  };
}

function traineeEventsV19_(name) {
  var out = [];
  var ev = ss().getSheetByName(TAB.SKILL_EVIDENCE);
  if (!ev || ev.getLastRow() < 5) return out;
  ev.getRange(5, 1, ev.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[3]).trim() !== String(name).trim()) return;
    out.push({
      date: r[2], phase: String(r[5] || ''), fto: String(r[6] || ''),
      domain: String(r[7] || ''), skill: String(r[9] || ''),
      context: String(r[10] || ''), stage: String(r[11] || ''),
      outcome: String(r[12] || ''), callRef: String(r[15] || '')
    });
  });
  return out.reverse();
}

function traineeSkillsV19_(name) {
  var out = { signed: [], ready: [], progress: [], notStarted: [], all: [] };
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return out;
  m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[0]).trim() !== String(name).trim()) return;
    var item = {
      skill: String(r[1] || ''),
      stage: String(r[2] || ''),
      readiness: String(r[6] || ''),
      signoff: String(r[7] || ''),
      successful: Number(r[10]) || 0,
      independent: Number(r[11]) || 0,
      dates: Number(r[12]) || 0,
      ftos: Number(r[13]) || 0,
      signedBy: String(r[16] || ''),
      signedOn: r[17] || ''
    };
    out.all.push(item);
    if (item.signoff === 'SIGNED OFF') out.signed.push(item);
    else if (item.readiness === 'READY FOR VALIDATION') out.ready.push(item);
    else if (item.readiness === 'IN PROGRESS') out.progress.push(item);
    else out.notStarted.push(item);
  });
  return out;
}

function tvBandV19_(sh, row, text, colour) {
  sh.getRange(row, 2, 1, 7).merge().setValue(text)
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(10)
    .setFontColor('#ffffff').setBackground(colour).setVerticalAlignment('middle');
  sh.setRowHeight(row, 22);
  return row + 1;
}

function tvTableV19_(sh, row, headers, rows, widthsCentre) {
  sh.getRange(row, 3, 1, headers.length).setValues([headers])
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(8)
    .setFontColor(TV.MUTE)
    .setBorder(false, false, true, false, false, false, TV.HAIR,
               SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(row, 18);
  row++;
  if (!rows.length) {
    sh.getRange(row, 3).setValue('none')
      .setFontFamily('Inter').setFontSize(9).setFontColor(TV.MUTE);
    return row + 2;
  }
  sh.getRange(row, 3, rows.length, headers.length).setValues(rows)
    .setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
  if (widthsCentre) {
    sh.getRange(row, 3 + widthsCentre[0], rows.length, widthsCentre[1])
      .setHorizontalAlignment('center');
  }
  for (var i = 0; i < rows.length; i++) sh.setRowHeight(row + i, 20);
  return row + rows.length + 1;
}

/** Canonical recomputation of the ANALYTICS chart-data block.
 *  Returns { ok, values:{domainAvgs, statusCounts, weekly, byLevel},
 *  problems:[] } without writing anything. */
function computeAnalyticsV20_1_() {
  var problems = [];
  var out = { domainAvgs: null, statusCounts: null, weekly: null, byLevel: null };

  var trendDays = controlDialV20_1_(CONTROL_DIALS.TREND_DAYS, 21);
  var ev = readTableV20_1_(TAB.EVAL, 4);
  if (!ev.ok) problems.push('eval mirror missing');
  var DOMAINS = ['Assessment', 'Treatment', 'Communication', 'Documentation',
                 'Scene Leadership', 'Professionalism'];
  if (ev.ok) {
    var cut = new Date(); cut.setDate(cut.getDate() - trendDays); cut.setHours(0, 0, 0, 0);
    var sums = {}, counts = {};
    DOMAINS.forEach(function (d) { sums[d] = 0; counts[d] = 0; });
    var dateCol = ev.col['SHIFT DATE'];
    if (dateCol === undefined) problems.push('eval mirror lacks SHIFT DATE header');
    ev.rows.forEach(function (r) {
      var d = parseDateSafeV20_1_(dateCol !== undefined ? r[dateCol] : null);
      if (!d || d < cut) return;
      DOMAINS.forEach(function (dom) {
        var ci = ev.col[dom.toUpperCase()];
        if (ci === undefined) return;
        var v = Number(r[ci]);
        if (!isNaN(v) && v >= 1 && v <= 5) { sums[dom] += v; counts[dom]++; }
      });
    });
    DOMAINS.forEach(function (dom) {
      if (ev.col[dom.toUpperCase()] === undefined) problems.push('eval mirror lacks ' + dom + ' column');
    });
    out.domainAvgs = DOMAINS.map(function (dom) {
      return { domain: dom, n: counts[dom],
               avg: counts[dom] ? Math.round(sums[dom] / counts[dom] * 100) / 100 : null };
    });

    var weekly = [];
    var monday = new Date(); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (var w = 7; w >= 0; w--) {
      var start = new Date(monday); start.setDate(start.getDate() - 7 * w);
      var end = new Date(start); end.setDate(end.getDate() + 7);
      var n = 0;
      ev.rows.forEach(function (r) {
        var d = parseDateSafeV20_1_(dateCol !== undefined ? r[dateCol] : null);
        if (d && d >= start && d < end) n++;
      });
      weekly.push({ label: Utilities.formatDate(start, 'America/New_York', 'MM/dd'), n: n });
    }
    out.weekly = weekly;
  }

  var trainees = masterTraineeRowsV20_1_();
  var active = trainees.filter(function (t) { return !t.closed; });
  var byLevel = { 'EMT': 0, 'Advanced EMT': 0, 'Paramedic': 0 };
  active.forEach(function (t) { if (byLevel[t.level] !== undefined) byLevel[t.level]++; });
  out.byLevel = byLevel;

  var eng = readTableV20_1_(TAB.ENGINE, 4);
  var statusCounts = { 'On Track': 0, 'Needs Attention': 0, 'Delayed': 0,
                       'Advancement Review Due': 0, 'NRT Filed : Decision Due': 0,
                       'Setup Incomplete': 0, 'Closed / Released': 0, 'No Evals Yet': 0 };
  if (!eng.ok) problems.push('status engine missing');
  else {
    var sCol = eng.col['COMPUTED STATUS'];
    var nCol = eng.col['TRAINEE'];
    if (sCol === undefined) problems.push('engine lacks COMPUTED STATUS header');
    else eng.rows.forEach(function (r) {
      var name = cleanNameV20_1_(nCol !== undefined ? r[nCol] : '');
      if (!name) return;
      var s = String(r[sCol] || '');
      var master = trainees.filter(function (t) { return t.norm === normalizeNameV20_1_(name); })[0];
      if (master && master.closed) { statusCounts['Closed / Released']++; return; }
      if (master && (!master.fto || !master.phaseStart)) { statusCounts['Setup Incomplete']++; return; }
      if (/Delayed/.test(s)) statusCounts['Delayed']++;
      else if (/Needs Attention/.test(s)) statusCounts['Needs Attention']++;
      else if (/Advancement Review/.test(s)) statusCounts['Advancement Review Due']++;
      else if (/NRT/.test(s)) statusCounts['NRT Filed : Decision Due']++;
      else if (/No Evals/.test(s)) statusCounts['No Evals Yet']++;
      else if (/On Track/.test(s)) statusCounts['On Track']++;
    });
  }
  out.statusCounts = statusCounts;
  return { ok: problems.length === 0, values: out, problems: problems, activeCount: active.length };
}

/** Open-work totals used by HOME reconciliation. */
function openWorkTotalsV20_1_() {
  var out = { skillDecisionsOpen: 0, generalDecisionsOpen: 0, urgentOpen: 0, total: 0 };
  var q = readTableV20_1_(TAB.SKILL_VALIDATION, 4);
  if (q.ok) {
    q.rows.forEach(function (r) {
      if (!String(r[q.col['TRAINEE']] || '').trim()) return;
      if (String(r[q.col['RECORD STATUS']] || '').trim() === 'OPEN') out.skillDecisionsOpen++;
    });
  }
  var dq = getSheetOrNullV20_1_(TAB.QUEUE);
  if (dq) {
    var rows = dq.getRange(5, 1, Math.max(dq.getLastRow() - 4, 1), 9).getValues();
    rows.forEach(function (r) {
      if (!r[1]) return;
      var status = String(r[8] || '').trim();
      if (status !== 'CLOSED' && !String(r[5] || '').trim()) out.generalDecisionsOpen++;
    });
  }
  var uc = readTableV20_1_(TAB.URGENT, 4);
  if (uc.ok && uc.col['STATUS'] !== undefined) {
    uc.rows.forEach(function (r) {
      if (!r[0]) return;
      var s = String(r[uc.col['STATUS']] || '').trim();
      if (s && !/closed|resolved/i.test(s)) out.urgentOpen++;
    });
  }
  out.total = out.skillDecisionsOpen + out.generalDecisionsOpen + out.urgentOpen;
  return out;
}

/** Writes the recomputed values into the ANALYTICS chart block (the cells
 *  the charts read). A failed prerequisite writes 'DATA ERROR' where a
 *  number would go and a health note in the block header. */
function refreshAnalyticsV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (!sh) return 'Analytics sheet missing.';
  var res = computeAnalyticsV20_1_();
  var v = res.values;
  sh.getRange('N1').setValue(res.ok
    ? 'chart data (recomputed ' + Utilities.formatDate(new Date(), 'America/New_York', 'MM/dd HH:mm') + ')'
    : 'chart data — DATA ERROR: ' + res.problems.join('; '));
  if (v.domainAvgs) {
    v.domainAvgs.forEach(function (d, i) {
      sh.getRange(2 + i, 15).setValue(d.avg === null ? (res.ok ? 0 : 'DATA ERROR') : d.avg);
    });
  } else {
    for (var i = 0; i < 6; i++) sh.getRange(2 + i, 15).setValue('DATA ERROR');
  }
  if (v.statusCounts) {
    sh.getRange(10, 15).setValue(v.statusCounts['On Track']);
    sh.getRange(11, 15).setValue(v.statusCounts['Needs Attention']);
    sh.getRange(12, 15).setValue(v.statusCounts['Delayed']);
    sh.getRange(13, 15).setValue(v.statusCounts['Advancement Review Due']);
    sh.getRange(14, 15).setValue(v.statusCounts['NRT Filed : Decision Due']);
  }
  if (v.weekly) {
    v.weekly.forEach(function (w, i) {
      sh.getRange(17 + i, 14).setValue(w.label);
      sh.getRange(17 + i, 15).setValue(w.n);
    });
  }
  if (v.byLevel) {
    sh.getRange(27, 15).setValue(v.byLevel['EMT']);
    sh.getRange(28, 15).setValue(v.byLevel['Advanced EMT']);
    sh.getRange(29, 15).setValue(v.byLevel['Paramedic']);
  }
  systemLog_(res.ok ? 'INFO' : 'WARN', 'ANALYTICS RECOMPUTED',
    res.ok ? 'clean' : res.problems.join('; '));
  return res.ok ? 'Analytics recomputed from canonical data.'
                : 'Analytics recomputed WITH DATA ERRORS: ' + res.problems.join('; ');
}

/** READ-ONLY: recomputes source totals and compares them with what the
 *  sheets display right now. Writes nothing, logs nothing, sends nothing. */
function verifyAnalyticsV20_1() {
  var L = ['ANALYTICS VERIFICATION — READ ONLY', ''];
  var res = computeAnalyticsV20_1_();
  var sh = getSheetOrNullV20_1_(TAB.ANALYTICS);
  if (!sh) return 'Analytics sheet missing.';
  var mismatches = 0;

  if (res.values.domainAvgs) {
    L.push('Domain averages (window recompute vs displayed O2:O7):');
    res.values.domainAvgs.forEach(function (d, i) {
      var shown = sh.getRange(2 + i, 15).getValue();
      var expect = d.avg === null ? 0 : d.avg;
      var agree = (d.avg === null && (shown === 0 || shown === '' || shown === 'DATA ERROR')) ||
                  (typeof shown === 'number' && Math.abs(shown - expect) < 0.005);
      if (!agree) mismatches++;
      L.push('  ' + d.domain.padEnd(16) + ' recomputed ' + (d.avg === null ? '(no data)' : d.avg) +
             ' (' + d.n + ' evals) | displayed ' + shown + (agree ? '' : '   ← MISMATCH'));
    });
  }
  var counts = res.values.statusCounts;
  if (counts) {
    var rows = [['On Track', 10], ['Needs Attention', 11], ['Delayed', 12],
                ['Advancement Review Due', 13], ['NRT Filed : Decision Due', 14]];
    L.push('');
    L.push('Status counts:');
    rows.forEach(function (pair) {
      var shown = sh.getRange(pair[1], 15).getValue();
      var expect = counts[pair[0]];
      var agree = Number(shown) === expect;
      if (!agree) mismatches++;
      L.push('  ' + pair[0].padEnd(26) + ' recomputed ' + expect + ' | displayed ' + shown +
             (agree ? '' : '   ← MISMATCH'));
    });
    L.push('  (Setup Incomplete ' + counts['Setup Incomplete'] + ' and Closed/Released ' +
           counts['Closed / Released'] + ' are tracked separately and are excluded from Active.)');
  }
  var home = getSheetOrNullV20_1_('HOME');
  var work = openWorkTotalsV20_1_();
  if (home) {
    var shownActive = Number(home.getRange('B7').getValue());
    var shownOpenDecisions = Number(home.getRange('H7').getValue());
    L.push('');
    L.push('HOME reconciliation:');
    var a1 = shownActive === res.activeCount;
    if (!a1) mismatches++;
    L.push('  Active trainees   : recomputed ' + res.activeCount + ' (closed excluded) | HOME shows ' +
           shownActive + (a1 ? '' : '   ← MISMATCH'));
    var a2 = shownOpenDecisions === work.total;
    if (!a2) mismatches++;
    L.push('  Open decisions    : recomputed ' + work.total + ' (skill ' + work.skillDecisionsOpen +
           ' + general ' + work.generalDecisionsOpen + ' + urgent ' + work.urgentOpen +
           ') | HOME shows ' + shownOpenDecisions + (a2 ? '' : '   ← MISMATCH'));
  }
  L.push('');
  if (res.problems.length) L.push('DATA ERRORS: ' + res.problems.join('; '));
  L.push(mismatches ? mismatches + ' mismatch(es). Run refreshAnalyticsV20_1() (and see homeCountersV20_1).'
                    : 'Displayed analytics agree with canonical recomputation.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/** Rewrites the HOME counter tiles from canonical totals so HOME, the
 *  analytics block, the action inbox, and the source tables agree. */
function homeCountersV20_1() {
  var home = getSheetOrNullV20_1_('HOME');
  if (!home) return 'HOME missing.';
  var res = computeAnalyticsV20_1_();
  var work = openWorkTotalsV20_1_();
  home.getRange('B7').setValue(res.activeCount);
  home.getRange('H7').setValue(work.total);
  systemLog_('INFO', 'HOME COUNTERS RECONCILED',
    'active=' + res.activeCount + ' openWork=' + work.total);
  return 'HOME counters set: active ' + res.activeCount + ', open decisions ' + work.total + '.';
}

function ftoScoreboardV20_1() {
  var denyV20_2 = denyV20_2_('READ PROGRAM REPORT');
  if (denyV20_2) return denyV20_2;
  var threshold = 5;
  try {
    var tv = ss().getSheetByName(TAB.CONTROL).getRange('B5').getValue();
    if (Number(tv) > 0) threshold = Number(tv);
  } catch (e0) {}

  // --- engine facts per trainee ---
  var eng = getSheetOrNullV20_1_(TAB.ENGINE);
  var facts = {};
  if (eng) {
    eng.getRange(5, 1, 40, 22).getValues().forEach(function (r) {
      var name = String(r[0] || '').trim();
      if (!name) return;
      facts[normalizeNameV20_1_(name)] = {
        evals: Number(r[6]) || 0,
        daysSince: (r[8] === '' || r[8] === null) ? null : Number(r[8]),
        dayInPhase: Number(r[20]) || 0
      };
    });
  }

  // --- audit flags per trainee ---
  var flags = {};
  var au = getSheetOrNullV20_1_(TAB.AUDIT);
  if (au) {
    var labels = ['advancement vs score', 'reflection vs score',
                  'extreme score without narrative', 'silent record',
                  'FTO scope', 'phase mismatch'];
    au.getRange(5, 1, 40, 7).getValues().forEach(function (r) {
      var name = normalizeNameV20_1_(String(r[0] || ''));
      if (!name) return;
      var fl = [];
      for (var c = 1; c <= 6; c++) if (String(r[c]) === 'FLAG') fl.push(labels[c - 1]);
      if (fl.length) flags[name] = fl;
    });
  }

  // --- who has actually filed, from the raw mirror ---
  var filedBy = {}, filedByDisplay = {}, lastEvalFor = {};
  var m = getSheetOrNullV20_1_(TAB.EVAL);
  if (m && m.getLastRow() >= 5) {
    m.getRange(5, 1, m.getLastRow() - 4, 3).getValues().forEach(function (r) {
      var d = parseDateSafeV20_1_(r[0]);
      var fto = String(r[1] || '').trim();
      var tr = normalizeNameV20_1_(String(r[2] || ''));
      if (!fto || !tr) return;
      var fn = normalizeNameV20_1_(fto);
      filedBy[fn] = (filedBy[fn] || 0) + 1;
      if (!filedByDisplay[fn]) filedByDisplay[fn] = fto;
      if (d && (!lastEvalFor[tr] || d.getTime() > lastEvalFor[tr].getTime())) lastEvalFor[tr] = d;
    });
  }

  // --- group active trainees by assigned FTO ---
  var byFto = {}, unassigned = [], totals = { active: 0, never: 0, overdue: 0, current: 0 };
  masterTraineeRowsV20_1_().forEach(function (t) {
    if (t.closed) return;
    if (String(t.name).indexOf('EXAMPLE') === 0 || String(t.name).indexOf(TEST_PREFIX) === 0) return;
    totals.active++;
    var f = facts[t.norm] || { evals: 0, daysSince: null, dayInPhase: 0 };
    var status, sev;
    if (f.evals === 0) {
      status = 'NEVER EVALUATED — day ' + f.dayInPhase + ' of phase'; sev = 2; totals.never++;
    } else if (f.daysSince !== null && f.daysSince > threshold) {
      status = f.daysSince + ' days since last eval (limit ' + threshold + ')'; sev = 1; totals.overdue++;
    } else {
      status = 'current' + (lastEvalFor[t.norm] ? ' — last eval ' + dateKeyV20_1_(lastEvalFor[t.norm]) : ''); sev = 0; totals.current++;
    }
    var entry = { name: t.name, phase: t.phase || '', status: status, sev: sev,
                  evals: f.evals, flags: flags[t.norm] || [] };
    var ftoName = String(t.fto || '').trim();
    if (!ftoName) { unassigned.push(entry); return; }
    var key = normalizeNameV20_1_(ftoName);
    if (!byFto[key]) byFto[key] = { display: ftoName, trainees: [] };
    byFto[key].trainees.push(entry);
  });

  // --- compose ---
  var today = dateKeyV20_1_(new Date());
  var T = [], H = [];
  function line(t) { T.push(t); }
  H.push('<div style="font-family:Arial,sans-serif;max-width:680px">');
  H.push('<h2 style="margin:0 0 4px">SCEMS FTO Scoreboard — ' + today + '</h2>');
  H.push('<p style="margin:0 0 14px;color:#555">Active trainees: <b>' + totals.active +
    '</b> · current: <b style="color:#2e7d32">' + totals.current +
    '</b> · overdue: <b style="color:#b7791f">' + totals.overdue +
    '</b> · never evaluated: <b style="color:#c62828">' + totals.never + '</b> · eval limit: ' + threshold + ' days</p>');
  line('SCEMS FTO SCOREBOARD — ' + today);
  line('Active ' + totals.active + ' | current ' + totals.current + ' | overdue ' + totals.overdue + ' | never evaluated ' + totals.never);
  line('');

  var ftoKeys = Object.keys(byFto).sort(function (a, b) {
    var wa = Math.max.apply(null, byFto[a].trainees.map(function (x) { return x.sev; }));
    var wb = Math.max.apply(null, byFto[b].trainees.map(function (x) { return x.sev; }));
    return wb - wa;
  });
  ftoKeys.forEach(function (k) {
    var g = byFto[k];
    var filed = filedBy[k] || 0;
    H.push('<h3 style="margin:14px 0 2px;border-bottom:1px solid #ddd;padding-bottom:2px">FTO ' + g.display +
      ' <span style="font-weight:normal;color:#777">(' + g.trainees.length + ' trainee(s) · ' + filed + ' eval(s) ever filed by them)</span></h3>');
    line('FTO ' + g.display + '  (' + g.trainees.length + ' trainee(s), ' + filed + ' eval(s) ever filed by them)');
    g.trainees.sort(function (a, b) { return b.sev - a.sev; }).forEach(function (tr) {
      var col = tr.sev === 2 ? '#c62828' : tr.sev === 1 ? '#b7791f' : '#2e7d32';
      H.push('<p style="margin:3px 0 3px 12px"><b>' + tr.name + '</b> (' + tr.phase + ', ' + tr.evals +
        ' eval(s)) — <span style="color:' + col + '">' + tr.status + '</span>' +
        (tr.flags.length ? '<br><span style="color:#c62828;font-size:12px">&nbsp;&nbsp;audit: ' + tr.flags.join('; ') + '</span>' : '') + '</p>');
      line('   ' + tr.name + ' (' + tr.phase + ', ' + tr.evals + ' evals) — ' + tr.status +
        (tr.flags.length ? '  [audit: ' + tr.flags.join('; ') + ']' : ''));
    });
    line('');
  });

  if (unassigned.length) {
    H.push('<h3 style="margin:14px 0 2px;color:#c62828">Trainees with NO assigned FTO</h3>');
    line('TRAINEES WITH NO ASSIGNED FTO');
    unassigned.forEach(function (tr) {
      H.push('<p style="margin:3px 0 3px 12px"><b>' + tr.name + '</b> — ' + tr.status + '</p>');
      line('   ' + tr.name + ' — ' + tr.status);
    });
    line('');
  }

  var filers = Object.keys(filedBy).sort(function (a, b) { return filedBy[b] - filedBy[a]; });
  H.push('<h3 style="margin:14px 0 2px;border-bottom:1px solid #ddd;padding-bottom:2px">Filing totals — every eval ever filed, by who filed it</h3>');
  line('FILING TOTALS (all evals on record, by filer)');
  filers.forEach(function (k) {
    H.push('<p style="margin:2px 0 2px 12px">' + filedByDisplay[k] + ' : <b>' + filedBy[k] + '</b></p>');
    line('   ' + filedByDisplay[k] + ' : ' + filedBy[k]);
  });

  H.push('<p style="margin-top:16px;color:#888;font-size:12px">Generated from live SCEMS data. Every number is traceable: evals on tab 02, decisions on tab 21, flags on tab 13.</p></div>');
  line('');
  line('Generated from live SCEMS data ' + new Date() + '. Every number traceable on tabs 02 / 21 / 13.');

  var to = sessionEmailV20_1_() || CONFIG.TCO_EMAIL;
  sendHtmlMail(to, 'SCEMS FTO Scoreboard — ' + today, T.join('\n'), H.join('\n'));
  var msg = 'Scoreboard sent to ' + to + '.\n\n' + T.join('\n');
  systemLog_('INFO', 'FTO SCOREBOARD SENT',
    totals.active + ' active, ' + totals.overdue + ' overdue, ' + totals.never + ' never evaluated');
  try { SpreadsheetApp.getUi().alert(('Scoreboard emailed to ' + to + '.\n\n' + T.join('\n')).slice(0, 1400)); } catch (e) {}
  Logger.log(msg);
  return msg;
}

function redoAuditTabV20_1() {
  var sh = getSheetOrNullV20_1_(TAB.AUDIT);
  if (!sh) return 'Tab 13 not found.';
  var R = [];

  // ---- 1. headers + notes (labels only; formulas untouched) ----
  var heads = [
    ['ADV vs SCORE',   'Advancement requested while recent scores do not support it. Goes out when scores support the request or it is withdrawn.'],
    ['REFLECT vs SCORE','Trainee self-assessment strongly disagrees with FTO scoring. Goes out as they converge.'],
    ['NO NARRATIVE',   'An extreme score (1 or 5) with no written justification. Goes out when the FTO\'s narrative is added to the eval record.'],
    ['SILENT RECORD',  'Activity stopped flowing for this trainee. Goes out as evals and reflections resume.'],
    ['FTO SCOPE',      'A sign-off or eval outside the FTO\'s level/scope. Goes out when corrected.'],
    ['PHASE MISMATCH', 'CURRENT PHASE on tab 01 disagrees with what the record shows. Goes out when the phase is corrected on tab 01.']
  ];
  for (var c = 0; c < 6; c++) {
    var cell = sh.getRange(4, 2 + c);
    cell.setValue(heads[c][0]).setNote(heads[c][1] +
      '\n\nFlags compute themselves from the data. Nothing here is dismissed by hand — fix the condition, or log your review below.');
  }
  sh.getRange(4, 1).setValue('TRAINEE')
    .setNote('Names flow from the roster. The matrix B5:G44 is the machine\'s — hands off. Your space is the FLAG REVIEW LOG below.');
  sh.getRange(4, 1, 1, 7).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#546E7A').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('middle');
  sh.setFrozenRows(4);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  for (var w = 2; w <= 7; w++) sh.setColumnWidth(w, 118);
  sh.getRange(5, 1, 40, 1).setFontWeight('bold');
  sh.getRange(5, 2, 40, 6).setHorizontalAlignment('center');
  R.push('Headers, notes, freeze, and widths applied.');

  // ---- 2. color rules for the matrix ----
  var matrix = sh.getRange(5, 2, 40, 6);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('FLAG').setBackground('#C62828').setFontColor('#FFFFFF').setBold(true)
      .setRanges([matrix]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenCellNotEmpty().setFontColor('#9E9E9E')
      .setRanges([matrix]).build()
  ]);
  R.push('Flag colors set: red = burning, grey = anything else.');

  // ---- 3. remove the trap checkbox ----
  try {
    sh.getRange(2, 10).removeCheckboxes();
    sh.getRange(2, 10).clearContent().setNote('');
    R.push('Trap "clear all" checkbox removed (it only ever refused).');
  } catch (e1) { R.push('Checkbox removal skipped: ' + e1); }

  // ---- 4. FLAG REVIEW LOG (yours) ----
  var LOG_HEADS = ['DATE', 'TRAINEE', 'FLAG TYPE', 'REVIEWER', 'ACTION TAKEN', 'STATUS'];
  var flagTypes = heads.map(function (h) { return h[0]; });
  var statuses = ['Under review', 'Action taken — awaiting data', 'Resolved'];
  var logRow = 0;
  var scanN = Math.max(sh.getLastRow(), 60);
  var scan = sh.getRange(1, 1, scanN, 2).getValues();
  for (var i = 44; i < scan.length; i++) {
    if (String(scan[i][0]).indexOf('FLAG REVIEW LOG') >= 0 ||
        String(scan[i][1]).indexOf('FLAG REVIEW LOG') >= 0) { logRow = i + 1; break; }
  }
  if (!logRow) logRow = Math.max(sh.getLastRow() + 2, 47);
  if (sh.getMaxRows() < logRow + 24) sh.insertRowsAfter(sh.getMaxRows(), logRow + 24 - sh.getMaxRows());
  sh.getRange(logRow, 1, 1, 6).merge().breakApart();
  sh.getRange(logRow, 1).setValue('FLAG REVIEW LOG — YOURS. Log what you did about each flag while the data catches up.');
  sh.getRange(logRow, 1, 1, 6).setBackground('#B7791F').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(logRow + 1, 1, 1, 6).setValues([LOG_HEADS])
    .setFontWeight('bold').setBackground('#FFF3D6');
  var entry = sh.getRange(logRow + 2, 1, 20, 6);
  entry.setBackground('#FFFDF4').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(logRow + 2, 1, 20, 1).setNumberFormat('m/d/yyyy');
  sh.getRange(logRow + 2, 3, 20, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(flagTypes, true).setAllowInvalid(true).build());
  sh.getRange(logRow + 2, 6, 20, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(true).build());
  var tl = traineeListSafeV20_1_();
  if (tl.length) {
    sh.getRange(logRow + 2, 2, 20, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(tl, true).setAllowInvalid(true).build());
  }
  R.push('FLAG REVIEW LOG ready at row ' + logRow + ' — date, trainee, flag type, reviewer, action, status (dropdowns included).');

  // ---- 5. pipeline match report (read-only) ----
  var P = [];
  var formulas = sh.getRange(5, 2, 40, 6).getFormulas();
  var refs = {}, staticCells = 0, formulaCells = 0, emptyCells = 0;
  formulas.forEach(function (row, ri) {
    row.forEach(function (f, ci) {
      if (!f) {
        var v = sh.getRange(5 + ri, 2 + ci).getValue();
        if (v === '' || v == null) emptyCells++; else staticCells++;
        return;
      }
      formulaCells++;
      (f.match(/'([^']+)'!/g) || []).forEach(function (m) {
        refs[m.slice(1, -2)] = (refs[m.slice(1, -2)] || 0) + 1;
      });
      (f.match(/(?:^|[^A-Za-z0-9_'!])([A-Za-z0-9_]{2,})!/g) || []).forEach(function (m2) {
        var nm = m2.replace(/^[^A-Za-z0-9_]*/, '').replace(/!$/, '');
        refs[nm] = (refs[nm] || 0) + 1;
      });
    });
  });
  P.push('Matrix cells: ' + formulaCells + ' formula(s), ' + staticCells + ' static value(s), ' + emptyCells + ' empty.');
  if (staticCells) P.push('  ← STATIC CELLS in a formula matrix deserve review: a typed value never clears itself.');
  var liveTabs = {};
  ss().getSheets().forEach(function (s2) { liveTabs[s2.getName()] = true; });
  Object.keys(refs).forEach(function (t) {
    P.push('  pulls from "' + t + '" ×' + refs[t] + (liveTabs[t] ? '' : '   ← TAB DOES NOT EXIST — dead reference'));
  });
  if (!Object.keys(refs).length && formulaCells) P.push('  (formulas reference only this sheet)');
  var masterNorms = {};
  masterTraineeRowsV20_1_().forEach(function (t3) { masterNorms[t3.norm] = true; });
  var nameCol = sh.getRange(5, 1, 40, 1).getValues();
  var staleNames = [];
  nameCol.forEach(function (r4, i4) {
    var nm = String(r4[0] || '').trim();
    if (!nm) return;
    if (nm.indexOf('EXAMPLE') === 0 || nm.indexOf(TEST_PREFIX) === 0) return;
    if (!masterNorms[normalizeNameV20_1_(nm)]) staleNames.push('row ' + (5 + i4) + ' [' + nm + ']');
  });
  P.push(staleNames.length
    ? 'Names not on the active master: ' + staleNames.join(', ') + '  ← stale rows (closed trainees linger until the matrix rebuilds)'
    : 'Every name in the matrix matches the active master.');

  var msg = 'TAB 13 REDO COMPLETE\n\n' + R.join('\n') +
    '\n\nPIPELINE MATCH REPORT (read-only — formulas untouched):\n' + P.join('\n');
  systemLog_('INFO', 'AUDIT TAB REDONE', 'layout/notes/review log applied; formulas untouched');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e2) {}
  return msg;
}

/** (internal) active trainee names for the review-log dropdown. */
function traineeListSafeV20_1_() {
  var out = [];
  try {
    masterTraineeRowsV20_1_().forEach(function (t) {
      if (!t.closed && String(t.name).indexOf('EXAMPLE') !== 0 &&
          String(t.name).indexOf(TEST_PREFIX) !== 0) out.push(t.name);
    });
  } catch (e) {}
  return out;
}
