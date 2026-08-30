/**
 * The payload each role receives.
 *
 * One function per role. Each builds ONLY what that role is entitled to, so
 * a filtering mistake cannot leak another person's record into the page: the
 * data was never assembled in the first place.
 */

function daysAgoTextV1_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'never';
  var n = Math.floor((new Date() - d) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return n + ' days ago';
}
function asDateV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function levelKeyV1_(level) {
  var l = String(level || '').toLowerCase();
  if (l.indexOf('param') >= 0) return 'pmd';
  if (l.indexOf('advanc') >= 0 || l === 'aemt') return 'aemt';
  return 'emt';
}

/** Every trainee on the master, normalized. Closed people are marked, never
 *  silently dropped, so a caller must decide rather than inherit a filter. */
function traineesV1_() {
  return onePersonOneRecordV1_(traineeRowsV1_());
}

/** One person, one record, and THIS spreadsheet is the record.
 *
 *  Another spreadsheet may hold a row the target does not have - that is the
 *  whole reason for reading it. What it must never do is contradict the
 *  target about somebody who is in both, because then every screen shows
 *  whichever copy it happened to reach first.
 *
 *  That is not hypothetical. A four-month-old copy of this tracker was being
 *  read alongside it, and in that copy a trainee who has been closed and
 *  archived was still open, one who had been reassigned still named an
 *  officer who has since resigned, and the officer renamed on the roster
 *  still had her old name. Every one of those came back as a live problem
 *  needing a person, and none of them was real.
 *
 *  So: rows from this book win, by name, every time. A row only survives
 *  from elsewhere if nobody of that name is here at all. */
function onePersonOneRecordV1_(list) {
  var here = {}, out = [];
  list.forEach(function (t) { if (!t.from) here[t.norm] = true; });
  list.forEach(function (t) {
    if (t.from && here[t.norm]) return;      // this book already has them
    out.push(t);
  });
  return out;
}

function traineeRowsV1_() {
  var t = readTabAllV1_(PORTAL.TAB.MASTER);
  if (!t.ok) return [];
  return t.rows.map(function (r, i) {
    var name = String(pickV1_(t, r, ['TRAINEE', 'TRAINEE NAME', 'NAME']) || '').trim();
    if (!name) return null;
    var status = String(pickV1_(t, r, ['SET STATUS', 'PROGRAM STATUS']) || '').trim();
    var fto = String(pickV1_(t, r, ['ASSIGNED FTO', 'TRAINING OFFICER', 'FTO']) || '').trim();
    var email = String(pickV1_(t, r, [
      'TRAINEE EMAIL', 'EMAIL ADDRESS', 'EMAIL', 'PERSONAL EMAIL', 'WORK EMAIL'
    ]) || '').trim().toLowerCase();
    var started = asDateV1_(pickV1_(t, r, ['START DATE', 'STARTED']));
    var phaseStart = asDateV1_(pickV1_(t, r, ['PHASE START DATE', 'PHASE STARTED']));
    var level = String(pickV1_(t, r, ['LEVEL', 'CERT LEVEL', 'CERTIFICATION']) || '').trim();
    var phase = String(pickV1_(t, r, ['CURRENT PHASE', 'PHASE']) || '').trim();
    return {
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      name: name,
      norm: normNameV1_(name),
      level: level,
      levelKey: levelKeyV1_(level),
      phase: phase,
      fto: fto,
      shift: String(pickV1_(t, r, ['SHIFT']) || '').trim(),
      email: email,
      started: started,
      phaseStart: phaseStart,
      status: status,
      closed: /closed|released|cleared|independent|withdraw|archiv/i.test(status),
      setupComplete: !!(level && phase && fto && started)
    };
  }).filter(Boolean);
}

/** Catalog threshold helpers — four convictions that make a skill ready. */
function cellNumV1_(r, t, names, fallback) {
  for (var i = 0; i < names.length; i++) {
    if (t.col[names[i]] !== undefined) {
      var n = Number(r[t.col[names[i]]]);
      return isNaN(n) ? (fallback || 0) : n;
    }
  }
  return fallback || 0;
}

function skillsForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    var successful = cellNumV1_(r, t, ['SUCCESSFUL REPS', 'SUCCESSFUL'], 0);
    var independent = cellNumV1_(r, t, ['INDEPENDENT REPS', 'INDEPENDENT'], 0);
    var dates = cellNumV1_(r, t, ['DISTINCT DATES', 'DATES', 'DISTINCT DATE COUNT'], 0);
    var ftos = cellNumV1_(r, t, ['DISTINCT FTOS', 'DISTINCT FTO', 'FTOS', 'FTO COUNT'], 0);
    var needS = cellNumV1_(r, t, ['NEED SUCCESSFUL', 'REQUIRED SUCCESSFUL', 'SUCCESSFUL NEED'], 3) || 3;
    var needI = cellNumV1_(r, t, ['NEED INDEPENDENT', 'REQUIRED INDEPENDENT', 'INDEPENDENT NEED'], 2) || 2;
    var needD = cellNumV1_(r, t, ['NEED DATES', 'REQUIRED DATES', 'DATES NEED'], 2) || 2;
    var needF = cellNumV1_(r, t, ['NEED FTOS', 'REQUIRED FTOS', 'FTOS NEED'], 2) || 2;
    // If threshold columns are absent, keep classic defaults so bars still teach.
    if (t.col['NEED SUCCESSFUL'] === undefined && t.col['REQUIRED SUCCESSFUL'] === undefined) {
      needS = Math.max(needS, 3); needI = Math.max(needI, 2);
      needD = Math.max(needD, 2); needF = Math.max(needF, 2);
    }
    var readiness = String(r[t.col['READINESS']] || '').trim();
    var signed = String(r[t.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF' ||
                 readiness === 'SIGNED OFF';
    out.push({
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: t.col['SKILL ID'] !== undefined
        ? String(r[t.col['SKILL ID']] || '').trim() : '',
      readiness: readiness,
      signed: signed,
      successful: successful,
      independent: independent,
      distinctDates: dates,
      distinctFtos: ftos,
      bars: [
        { label: 'Successful', have: successful, need: needS },
        { label: 'Independent', have: independent, need: needI },
        { label: 'Dates', have: dates, need: needD },
        { label: 'FTOs', have: ftos, need: needF }
      ]
    });
  });
  return out;
}

/** Hours since a Date, or -1. */
function hoursSinceV1_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return -1;
  return Math.floor((new Date() - d) / 3600000);
}

/** Parse "3/2 · 2/2 · …" style evidence summaries into four counts when columns lack them. */
function parseEvidenceBarsV1_(text) {
  var s = String(text || '');
  var m = s.match(/(\d+)\s*\/\s*(\d+)/g);
  if (!m || m.length < 2) return null;
  var bars = [];
  var labels = ['Successful', 'Independent', 'Dates', 'FTOs'];
  for (var i = 0; i < Math.min(m.length, 4); i++) {
    var p = m[i].match(/(\d+)\s*\/\s*(\d+)/);
    bars.push({ label: labels[i], have: Number(p[1]), need: Number(p[2]) });
  }
  while (bars.length < 4) bars.push({ label: labels[bars.length], have: 0, need: 1 });
  return bars;
}

/** Eval heat for a trainee: count, days since last, optional domain average. */
function evalHeatForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  var out = { count: 0, days: -1, avg: null, lastEval: 'never' };
  if (!t.ok) return out;
  var iWho = headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1);
  var iWhen = headerIndexV1_(t, EVAL_DATE_HEADERS_V1);
  if (iWho < 0 || iWhen < 0) return out;
  var domains = ['Assessment', 'Treatment', 'Communication', 'Documentation',
                 'Scene Leadership', 'Professionalism'];
  var latest = null, sum = 0, nScores = 0;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[iWho]) !== norm) return;
    out.count++;
    var d = asDateV1_(r[iWhen]);
    if (d && (!latest || d > latest)) latest = d;
    domains.forEach(function (h) {
      if (t.col[h] === undefined) return;
      var v = Number(r[t.col[h]]);
      if (v >= 1 && v <= 5) { sum += v; nScores++; }
    });
  });
  if (latest) {
    out.days = Math.floor((new Date() - latest) / 86400000);
    out.lastEval = daysAgoTextV1_(latest);
  }
  if (nScores) out.avg = Math.round((sum / nScores) * 100) / 100;
  return out;
}

/** Day count in current phase (or since start). */
function dayInPhaseV1_(t) {
  var d = t.phaseStart || t.started;
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((new Date() - d) / 86400000));
}

/**
 * Can they clear for the truck? Phase 4 + every matrix skill signed off +
 * no open skill-validation items. Gaps are human-readable for the desk.
 */
function clearanceAssessmentV1_(trainee) {
  var out = {
    phase4: false,
    canClear: false,
    signed: 0,
    total: 0,
    gaps: []
  };
  if (!trainee || trainee.closed) {
    out.gaps.push('Not an active trainee.');
    return out;
  }
  out.phase4 = phaseIndexV1_(trainee.phase) === 3;
  if (!out.phase4) {
    out.gaps.push('Still in ' + (trainee.phase || 'an earlier phase') +
      ' — Phase 4 comes first.');
    return out;
  }

  var skills = [];
  try { skills = skillsForV1_(trainee.norm); } catch (e) { skills = []; }
  out.total = skills.length;
  out.signed = skills.filter(function (s) { return s.signed; }).length;

  if (!skills.length) {
    out.gaps.push('No skills on the matrix yet. Log skills and rebuild before clearing.');
  } else {
    var openSkills = skills.filter(function (s) { return !s.signed; });
    openSkills.slice(0, 6).forEach(function (s) {
      out.gaps.push(s.skill +
        (s.readiness ? ' — ' + s.readiness : ' — not signed off'));
    });
    if (openSkills.length > 6) {
      out.gaps.push('…and ' + (openSkills.length - 6) + ' more skills still open');
    }
  }

  try {
    var waiting = openQueueV1_().filter(function (q) {
      return q.norm === trainee.norm && !q.decision;
    });
    if (waiting.length) {
      out.gaps.push(waiting.length + ' skill sign-off' +
        (waiting.length === 1 ? '' : 's') + ' still waiting on Division');
    }
  } catch (e2) {}

  out.canClear = out.gaps.length === 0;
  return out;
}

/** Imperative next-move cards — replace "flags" language for humans. */
function nextMovesForTraineeV1_(t, heat, waiting, coaching, freshness) {
  var moves = [];
  (coaching || []).forEach(function (c) {
    if (c.acknowledged) return;
    moves.push({
      kind: 'coaching', urgency: 'soon', title: 'Acknowledge coaching from ' + (c.from || 'your FTO'),
      blurb: String(c.text || '').slice(0, 120), action: 'ack', row: c.row
    });
  });
  var reflectAgo = '';
  (freshness || []).forEach(function (f) {
    if (/reflect/i.test(f.title || '')) reflectAgo = f.ago;
  });
  if (reflectAgo === 'never' || /days ago/.test(reflectAgo)) {
    var n = parseInt(reflectAgo, 10);
    if (reflectAgo === 'never' || (n && n >= 7)) {
      moves.push({
        kind: 'reflect', urgency: 'soon',
        title: 'File your reflection',
        blurb: reflectAgo === 'never' ? 'None on file yet. Two minutes.' :
               'Last one was ' + reflectAgo + '.',
        action: 'reflect'
      });
    }
  }
  if (heat.days < 0) {
    moves.push({
      kind: 'eval', urgency: 'due',
      title: 'No evaluation on file yet',
      blurb: 'Your FTO files one after a shift together.',
      action: 'wait'
    });
  } else if (heat.days > 14) {
    moves.push({
      kind: 'eval', urgency: 'soon',
      title: heat.days + ' days since an evaluation',
      blurb: 'Ask your FTO to schedule one.',
      action: 'wait'
    });
  }
  (waiting || []).forEach(function (q) {
    moves.push({
      kind: 'queue', urgency: 'ok',
      title: q.skill + ' is with Training Division',
      blurb: 'Ready ' + (q.since || '') + '. Nothing for you to do.',
      action: 'wait'
    });
  });
  return moves.slice(0, 6);
}

function nextMoveFromFindingV1_(why, name) {
  var w = String(why || '');
  if (!w) return null;
  var title = w, blurb = 'Open their chart and decide the next honest move.', urgency = 'soon';
  if (/never evaluated/i.test(w)) {
    title = 'Get an evaluation on the board'; blurb = name + ' has never been evaluated.'; urgency = 'due';
  } else if (/days since/i.test(w)) {
    title = 'Schedule an evaluation'; blurb = capFindingV1_(w) + '.'; urgency = 'soon';
  } else if (/no training officer|no one on the roster|has left|sentence, not a name/i.test(w)) {
    title = 'Fix the training officer assignment'; blurb = capFindingV1_(w) + '.'; urgency = 'due';
  } else if (/not responding|remediation|concern/i.test(w)) {
    title = 'Address status: ' + w; blurb = 'This stays visible until the status changes.'; urgency = 'due';
  } else if (/missing|incomplete/i.test(w)) {
    title = 'Finish the trainee record'; blurb = capFindingV1_(w) + '.'; urgency = 'soon';
  }
  return { kind: 'finding', urgency: urgency, title: title, blurb: blurb, finding: w };
}
function capFindingV1_(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function openQueueV1_() {
  var t = readTabAllV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var since = asDateV1_(r[t.col['READY DATE']]);
    var evidence = String(r[t.col['EVIDENCE SUMMARY']] || '').trim();
    var bars = parseEvidenceBarsV1_(evidence);
    var recommend = String(r[t.col['FTO RECOMMENDATION']] || r[t.col['RECOMMENDATION']] ||
                           r[t.col['FTO NOTES']] || '').trim();
    out.push({
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      trainee: String(r[t.col['TRAINEE']] || '').trim(),
      norm: normNameV1_(r[t.col['TRAINEE']]),
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: String(r[t.col['SKILL ID']] || '').trim(),
      evidence: evidence,
      bars: bars,
      recommend: recommend,
      since: since,
      hours: hoursSinceV1_(since),
      requestId: String(r[t.col['REQUEST ID']] || '').trim(),
      decision: String(r[t.col['DECISION']] || '').trim(),
      decidedBy: String(r[t.col['DECIDED BY']] || '').trim()
    });
  });
  return out;
}

/* The evaluation tab, read by its headers.
 *
 *  This used to be r[2] for the trainee and r[0] for the date. Both happen to
 *  be right on today's live tab - and that is the whole problem with a
 *  positional read: it is right until somebody adds a question to the form,
 *  and then it is silently wrong on every screen at once, with every trainee
 *  reading "never evaluated" and nothing anywhere saying why.
 *
 *  Shift Date first, then the form's own timestamp. An officer who files three
 *  days late did not evaluate anybody today, and the Division screen counts
 *  days from this. */
var EVAL_TRAINEE_HEADERS_V1 = ['TRAINEE', 'TRAINEE NAME', 'NAME'];
var EVAL_DATE_HEADERS_V1    = ['SHIFT DATE', 'DATE', 'TIMESTAMP'];

/** What is wrong with the evaluation tab, in a sentence, or ''. */
function evalHeaderProblemV1_() {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return PORTAL.TAB.EVAL + ' is not in this spreadsheet.';
  var missing = [];
  if (headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1) < 0) missing.push('one naming the trainee');
  if (headerIndexV1_(t, EVAL_DATE_HEADERS_V1) < 0) missing.push('one holding the date');
  return missing.length
    ? PORTAL.TAB.EVAL + ' is missing ' + missing.join(' and ') + ', so nothing on ' +
      'these screens can say when anybody was last evaluated. Nothing is being guessed at.'
    : '';
}

function lastEvalForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return null;
  var iWho = headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1);
  var iWhen = headerIndexV1_(t, EVAL_DATE_HEADERS_V1);
  if (iWho < 0 || iWhen < 0) return null;
  var latest = null;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[iWho]) !== norm) return;
    var d = asDateV1_(r[iWhen]);
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function coachingForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.COACHING);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    out.push({
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      when: asDateV1_(r[t.col['DATE']]),
      from: String(r[t.col['FROM']] || '').trim(),
      text: String(r[t.col['NOTE']] || '').trim(),
      acknowledged: String(r[t.col['ACKNOWLEDGED']] || '').trim() === 'YES'
    });
  });
  return out;
}

/* ---------------- role payloads ---------------- */

function traineePayloadV1_(viewer) {
  var me = traineesV1_().filter(function (t) { return t.norm === normNameV1_(viewer.traineeName); })[0];
  if (!me) return { error: 'No training record found for ' + viewer.email + '.' };
  var skills = skillsForV1_(me.norm);
  var signed = skills.filter(function (s) { return s.signed; }).length;
  var waiting = openQueueV1_().filter(function (q) { return q.norm === me.norm; });
  var coaching = coachingForV1_(me.norm);
  var heat = evalHeatForV1_(me.norm);
  var freshness = safeFormsV1_(function () { return freshnessForV1_(me.name); });
  var day = dayInPhaseV1_(me);
  var unacked = coaching.filter(function (c) { return !c.acknowledged; });
  return {
    product: PORTAL.PRODUCT,
    name: me.name, level: me.level, levelKey: me.levelKey, phase: me.phase,
    fto: me.fto, phaseStart: me.phaseStart ? me.phaseStart.toDateString() : '',
    dayInPhase: day,
    lastEval: heat.lastEval,
    evalCount: heat.count,
    evalAvg: heat.avg,
    signed: signed, applicable: skills.length,
    percent: skills.length ? Math.round(signed / skills.length * 100) : 0,
    waiting: waiting.map(function (q) { return { skill: q.skill, since: daysAgoTextV1_(q.since) }; }),
    coaching: unacked.map(function (c) { return { row: c.row, from: c.from, text: c.text,
                                   book: c.book || '',
                                   when: c.when ? c.when.toDateString() : '' }; }),
    nextMoves: nextMovesForTraineeV1_(me, heat, waiting, coaching, freshness),
    skills: skills.slice(0, 40),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.TRAINEE, { trainee: me.name });
    }),
    freshness: freshness
  };
}

function ftoPayloadV1_(viewer) {
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && normNameV1_(t.fto) === normNameV1_(viewer.name); });
  return {
    product: PORTAL.PRODUCT,
    name: viewer.name,
    trainees: mine.map(function (t) {
      var heat = evalHeatForV1_(t.norm);
      var waiting = openQueueV1_().filter(function (q) { return q.norm === t.norm && !q.decision; });
      var urgency = '';
      if (!t.setupComplete) urgency = 'soon';
      else if (heat.days < 0 || heat.days > 7) urgency = 'due';
      else if (heat.days > 4) urgency = 'soon';
      return {
        name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
        dayInPhase: dayInPhaseV1_(t),
        lastEval: heat.lastEval,
        evalCount: heat.count,
        evalAvg: heat.avg,
        daysSinceEval: heat.days,
        waitingCount: waiting.length,
        urgency: urgency,
        setupComplete: t.setupComplete,
        forms: safeFormsV1_(function () {
          return traineeFormsForV1_(PORTAL.ROLE.FTO, t,
            { fto: viewer.name, trainee: t.name });
        }),
        freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); })
      };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.FTO, { fto: viewer.name });
    })
  };
}

/** Why a trainee's ASSIGNED FTO does not reach anybody, or '' if it does.
 *
 *  This is the difference between a system that loses people and one that
 *  does not. An officer's list is built by matching their name, so anything
 *  in that cell which is not an active officer's name means the trainee is on
 *  no list at all - and nothing looks wrong, because the cell is filled in.
 *
 *  Every one of these has actually happened here: a blank cell, a name that
 *  changed on the roster and not on the trainee, an officer who resigned, and
 *  the dropdown's own help text pasted in as a whole sentence. */
function ftoProblemV1_(t) {
  var v = String(t.fto == null ? '' : t.fto).trim();
  if (!v) return 'no training officer is named';
  if (!looksLikeANameV1_(v)) return 'that cell holds a sentence, not a name';
  var n = normNameV1_(v);
  var hit = null;
  rosterPeopleV1_(true).forEach(function (p) { if (p.norm === n) hit = p; });
  if (!hit) return 'no one on the roster is called that';
  if (!hit.active) return hit.name + ' has left';
  return '';
}

/** Every active trainee who is on nobody's list, and why. */
function strandedTraineesV1_() {
  return traineesV1_().filter(function (t) { return !t.closed; })
    .map(function (t) { return { t: t, why: ftoProblemV1_(t) }; })
    .filter(function (x) { return !!x.why; })
    .map(function (x) {
      return { name: x.t.name, level: x.t.level, phase: x.t.phase,
               fto: String(x.t.fto || ''), why: x.why,
               lastEval: daysAgoTextV1_(lastEvalForV1_(x.t.norm)) };
    });
}

function divisionPayloadV1_() {
  var all = traineesV1_();
  var active = all.filter(function (t) { return !t.closed; });
  var open = openQueueV1_();
  var queue = open.filter(function (q) { return !q.decision; });
  var staged = open.filter(function (q) { return !!q.decision; });

  // A trainee whose officer does not resolve is not "set up", whatever else
  // is filled in. Counting them as complete is how they went missing.
  var stranded = safeFormsV1_(function () { return strandedTraineesV1_(); }) || [];
  var strandedBy = {};
  stranded.forEach(function (s) { strandedBy[normNameV1_(s.name)] = true; });
  var incomplete = active.filter(function (t) {
    return !t.setupComplete || strandedBy[t.norm]; });

  // Read the acknowledgment log once, not once per person.
  var acks = safeFormsV1_(function () { return ackRowsV1_(); }) || [];

  var seen = {}, dupes = [];
  active.forEach(function (t) {
    if (seen[t.norm]) dupes.push(t.name); else seen[t.norm] = true;
  });

  return {
    activeCount: active.length,
    closedCount: all.length - active.length,
    queue: queue.slice(0, 25).map(function (q) {
      var hours = q.hours;
      var clock = 72;
      if (hours < 0) hours = 0;
      var left = Math.max(0, clock - hours);
      return {
        trainee: q.trainee, skill: q.skill, evidence: q.evidence,
        bars: q.bars, recommend: q.recommend || '',
        since: daysAgoTextV1_(q.since), hours: hours, hoursLeft: left,
        clockPct: Math.max(0, Math.min(100, Math.round((left / clock) * 100))),
        requestId: q.requestId, row: q.row, from: q.from
      };
    }),
    queueCount: queue.length,
    // Legacy half-staged rows (OPEN + decision filled) — rare after portal
    // records permanently. Still listed so Division can finish orphans.
    staged: staged.map(function (q) {
      return { trainee: q.trainee, skill: q.skill, decision: q.decision,
               by: q.decidedBy, since: daysAgoTextV1_(q.since) };
    }),
    canAssignFto: mayWriteV1_(),
    // A column this screen leans on that is not there. Doctrine: report it,
    // never read the one beside it and hope.
    warnings: [evalHeaderProblemV1_()].filter(function (w) { return !!w; }),
    incomplete: incomplete.map(function (t) {
      var missing = [];
      if (!t.level) missing.push('level');
      if (!t.phase) missing.push('phase');
      if (!t.started) missing.push('start date');
      var f = ftoProblemV1_(t);
      if (f) missing.push(f);
      return { name: t.name, missing: missing.join(', ') };
    }),
    // Whatever the tracker says, nobody active is invisible. This is the list
    // of people no officer's screen will show, with the reason for each.
    stranded: stranded,
    duplicates: dupes,
    releaseReady: active.filter(function (t) {
      return clearanceAssessmentV1_(t).canClear;
    }).map(function (t) {
      var a = clearanceAssessmentV1_(t);
      return { name: t.name, level: t.level, signed: a.signed, total: a.total };
    }),
    // Every active trainee, each carrying enough for the screen to decide
    // whether it needs to say anything about them at all. A list of ten
    // identical rows is not information; it is my internals on somebody's
    // phone. The screen shows the exceptions and counts the rest.
    people: active.map(function (t) {
      var last = lastEvalForV1_(t.norm);
      var days = last ? Math.floor((new Date() - last) / 86400000) : -1;
      var why = '';
      if (ftoProblemV1_(t)) why = ftoProblemV1_(t);
      else if (/not responding|remediation|concern/i.test(t.status)) why = t.status;
      else if (days < 0) why = 'never evaluated';
      else if (days > 14) why = days + ' days since an evaluation';
      else if (!t.setupComplete) why = 'record incomplete';
      // Seen, by a named person, in their own words, for a stated time. The
      // finding is not cleared and never can be - it moves out of the alarm
      // list until the hold runs out, and comes straight back after.
      var ack = why ? liveAckForV1_(t.norm, why, acks) : null;
      var move = why ? nextMoveFromFindingV1_(why, t.name) : null;
      var next = nextPhaseV1_(t.phase);
      var clear = clearanceAssessmentV1_(t);
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               fto: t.fto || '', shift: t.shift || '',
               dayInPhase: dayInPhaseV1_(t),
               nextPhase: next,
               canAdvance: !!next,
               releaseReady: clear.canClear,
               phase4: clear.phase4,
               clearance: clear,
               days: days, status: t.status || '', needs: why, ack: ack,
               nextMove: move,
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.DIVISION, t, { trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.DIVISION, {});
    }),
    retiredForms: safeFormsV1_(function () { return retiredFormsV1_(); }),
    // Officers the Bring-someone-on form can assign. Exact roster spellings.
    officers: (function () {
      try {
        return rosterActivePeopleV1_().map(function (p) {
          return { name: p.name, email: p.email || '' };
        }).sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name));
        });
      } catch (e) { return []; }
    })(),
    canAddTrainee: mayWriteV1_(),
    // Where two submissions of the same kind landed on the same day. Both are
    // kept; this is the list of calls to make, not a list of rows to remove.
    duplicateSubs: safeFormsV1_(function () { return duplicateSubmissionsV1_(); }),
    formLinks: safeBoolV1_(function () { return formLinksLiveV1_(); }),
    mode: modeV1_(),
    product: PORTAL.PRODUCT
  };
}

function supervisorPayloadV1_(viewer) {
  var shift = normNameV1_(viewer.shift);
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && (!shift || normNameV1_(t.shift) === shift); });
  var hot = 0;
  var trainees = mine.map(function (t) {
    var heat = evalHeatForV1_(t.norm);
    var why = '';
    var urgency = '';
    if (heat.days < 0) { why = 'never evaluated'; urgency = 'due'; hot++; }
    else if (heat.days > 14) { why = heat.days + 'd silent'; urgency = 'due'; hot++; }
    else if (heat.days > 7) { why = heat.days + 'd since eval'; urgency = 'soon'; hot++; }
    var ftoWhy = ftoProblemV1_(t);
    if (ftoWhy) { why = ftoWhy; urgency = 'due'; hot++; }
    return {
      name: t.name, level: t.level, levelKey: t.levelKey,
      phase: t.phase, fto: t.fto,
      lastEval: heat.lastEval,
      daysSinceEval: heat.days,
      evalCount: heat.count,
      why: why,
      urgency: urgency,
      nextMove: why ? nextMoveFromFindingV1_(why, t.name) : null
    };
  });
  // Hot first — the strip should put tonight's problems at the start.
  trainees.sort(function (a, b) {
    var rank = { due: 0, soon: 1, '': 2 };
    return (rank[a.urgency] || 2) - (rank[b.urgency] || 2);
  });
  return {
    product: PORTAL.PRODUCT,
    shift: viewer.shift || 'All shifts',
    hotCount: hot,
    trainees: trainees,
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.SUPERVISOR, { fto: viewer.name });
    })
  };
}

/* ---------------- the medical director ---------------- */
/* This screen was reading the urgent-concern tab by position, and the live
   tab is
     Timestamp | TRAINING OFFICER CONTACTED | Reporter | Role | Trainee |
     Date | Shift | Category | What Happened | Action Taken |
     RESOLUTION (TCO) | DATE CLOSED | STATUS | OWNER
   so column 3 is the REPORTER'S ROLE, not the trainee, and column 4 is the
   trainee's NAME, not the account of what happened. Every case on the
   physician's screen named the wrong thing as the person and printed a name
   where the narrative should be.

   Three more, found with it: the twenty shown were the twenty OLDEST, so
   nothing recent ever appeared; concerns already closed kept appearing, since
   nothing read DATE CLOSED or STATUS; and the key saying which book a row came
   from was declared twice in the same object literal, so it was overwritten
   and lost every time.

   A physician is the last person in this system who should be handed a
   mislabelled record. Every column is resolved once, by name, and a column
   that is not there is said out loud rather than answered with a neighbour. */

var URGENT_TRAINEE_HEADERS_V1  = ['TRAINEE', 'TRAINEE INVOLVED', 'TRAINEE NAME', 'NAME'];
var URGENT_REPORTER_HEADERS_V1 = ['REPORTER', 'REPORTED BY', 'YOUR NAME', 'FTO', 'TRAINING OFFICER'];
var URGENT_WHAT_HEADERS_V1     = ['WHAT HAPPENED', 'DETAIL', 'DETAILS', 'DESCRIPTION', 'NARRATIVE'];
var URGENT_WHEN_HEADERS_V1     = ['DATE', 'SHIFT DATE', 'TIMESTAMP'];
var URGENT_CATEGORY_HEADERS_V1 = ['CATEGORY', 'CONCERN TYPE', 'TYPE'];
var URGENT_STATUS_HEADERS_V1   = ['STATUS', 'RECORD STATUS'];
var URGENT_CLOSED_HEADERS_V1   = ['DATE CLOSED', 'CLOSED'];

function medicalPayloadV1_() {
  var t = readTabAllV1_(PORTAL.TAB.URGENT);
  if (!t.ok) {
    return { cases: [], total: 0, warnings: [PORTAL.TAB.URGENT +
      ' is not in this spreadsheet, so nothing can be shown here.'] };
  }

  var iWho  = headerIndexV1_(t, URGENT_TRAINEE_HEADERS_V1);
  var iFrom = headerIndexV1_(t, URGENT_REPORTER_HEADERS_V1);
  var iWhat = headerIndexV1_(t, URGENT_WHAT_HEADERS_V1);
  var iWhen = headerIndexV1_(t, URGENT_WHEN_HEADERS_V1);
  var iCat  = headerIndexV1_(t, URGENT_CATEGORY_HEADERS_V1);
  var iStat = headerIndexV1_(t, URGENT_STATUS_HEADERS_V1);
  var iShut = headerIndexV1_(t, URGENT_CLOSED_HEADERS_V1);

  var warnings = [];
  if (iWho < 0) warnings.push(PORTAL.TAB.URGENT + ' has no column naming the trainee, ' +
    'so nothing on this screen can be attributed to a person. Nothing is being guessed at.');
  if (iWhat < 0) warnings.push(PORTAL.TAB.URGENT + ' has no column holding the account ' +
    'of what happened, so these cases are shown without one.');

  var cases = [];
  t.rows.forEach(function (r, i) {
    if (!rowHasAnythingV1_(r)) return;
    var who = atV1_(r, iWho);
    if (iWho >= 0 && !who) return;

    // Already dealt with. A closed concern is history, not a question for you.
    if (atV1_(r, iShut)) return;
    if (/^(CLOSED|RESOLVED|COMPLETE|COMPLETED|NO ACTION)/.test(atV1_(r, iStat).toUpperCase())) return;

    var when = iWhen < 0 ? null : asDateV1_(r[iWhen]);
    cases.push({
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      trainee: who || '(nobody is named on this row)',
      from: atV1_(r, iFrom) || '(the reporter is not named)',
      category: atV1_(r, iCat),
      when: when ? when.toDateString() : 'no date on the row',
      at: when ? when.getTime() : 0,
      what: atV1_(r, iWhat)
    });
  });

  // Newest first. It showed the oldest twenty, which on a tab that only ever
  // grows means the physician never saw anything that had just happened.
  cases.sort(function (a, b) { return b.at - a.at; });
  return { cases: cases.slice(0, 20), total: cases.length, warnings: warnings };
}

/* ---------------- forms, defensively ---------------- */
/* The registry reads Google Forms to discover published URLs and prefill
   ids. That is a network call against nine documents, and any one of them
   can be moved, unshared, or simply slow. A portal that cannot show a
   person their own record because a form link failed to resolve is worse
   than a portal with no links, so every call goes through here and a
   failure costs the links and nothing else. */
function safeFormsV1_(fn) {
  try { return fn() || []; } catch (e) { return []; }
}
function safeBoolV1_(fn) {
  try { return !!fn(); } catch (e) { return false; }
}
