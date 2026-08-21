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
    var name = String(r[t.col['TRAINEE']] || '').trim();
    if (!name) return null;
    var status = String(r[t.col['SET STATUS']] || r[t.col['PROGRAM STATUS']] || '').trim();
    return {
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      name: name,
      norm: normNameV1_(name),
      level: String(r[t.col['LEVEL']] || '').trim(),
      levelKey: levelKeyV1_(r[t.col['LEVEL']]),
      phase: String(r[t.col['CURRENT PHASE']] || r[t.col['PHASE']] || '').trim(),
      fto: String(r[t.col['ASSIGNED FTO']] || r[t.col['TRAINING OFFICER']] || '').trim(),
      shift: String(r[t.col['SHIFT']] || '').trim(),
      email: String(r[t.col['TRAINEE EMAIL']] || '').trim().toLowerCase(),
      started: asDateV1_(r[t.col['START DATE']]),
      phaseStart: asDateV1_(r[t.col['PHASE START DATE']]),
      status: status,
      closed: /closed|released|withdraw|archiv/i.test(status),
      setupComplete: !!(String(r[t.col['LEVEL']] || '').trim() &&
                        String(r[t.col['CURRENT PHASE']] || '').trim() &&
                        String(r[t.col['ASSIGNED FTO']] || '').trim() &&
                        asDateV1_(r[t.col['START DATE']]))
    };
  }).filter(Boolean);
}

function skillsForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    out.push({
      skill: String(r[t.col['SKILL']] || '').trim(),
      readiness: String(r[t.col['READINESS']] || '').trim(),
      signed: String(r[t.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF' ||
              String(r[t.col['READINESS']] || '').trim() === 'SIGNED OFF',
      successful: Number(r[t.col['SUCCESSFUL REPS']]) || 0,
      independent: Number(r[t.col['INDEPENDENT REPS']]) || 0
    });
  });
  return out;
}

function openQueueV1_() {
  var t = readTabAllV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    out.push({
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      trainee: String(r[t.col['TRAINEE']] || '').trim(),
      norm: normNameV1_(r[t.col['TRAINEE']]),
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: String(r[t.col['SKILL ID']] || '').trim(),
      evidence: String(r[t.col['EVIDENCE SUMMARY']] || '').trim(),
      since: asDateV1_(r[t.col['READY DATE']]),
      requestId: String(r[t.col['REQUEST ID']] || '').trim()
    });
  });
  return out;
}

function lastEvalForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return null;
  var latest = null;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[2]) !== norm) return;
    var d = asDateV1_(r[0]);
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
  return {
    name: me.name, level: me.level, levelKey: me.levelKey, phase: me.phase,
    fto: me.fto, phaseStart: me.phaseStart ? me.phaseStart.toDateString() : '',
    lastEval: daysAgoTextV1_(lastEvalForV1_(me.norm)),
    signed: signed, applicable: skills.length,
    percent: skills.length ? Math.round(signed / skills.length * 100) : 0,
    waiting: waiting.map(function (q) { return { skill: q.skill, since: daysAgoTextV1_(q.since) }; }),
    coaching: coaching.filter(function (c) { return !c.acknowledged; })
      .map(function (c) { return { row: c.row, from: c.from, text: c.text,
                                   book: c.book || '',
                                   when: c.when ? c.when.toDateString() : '' }; }),
    skills: skills.slice(0, 40),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.TRAINEE, { trainee: me.name });
    }),
    // How current each kind of submission is. The record itself is fetched on
    // demand, so a person with two years of history does not pay for it on
    // every page load.
    freshness: safeFormsV1_(function () { return freshnessForV1_(me.name); })
  };
}

function ftoPayloadV1_(viewer) {
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && normNameV1_(t.fto) === normNameV1_(viewer.name); });
  return {
    name: viewer.name,
    // Each trainee carries the forms for THAT trainee, with the FTO's name,
    // the trainee's name, and the skills log for their level already chosen.
    // The FTO picks a person, not a form and not a level.
    trainees: mine.map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               lastEval: daysAgoTextV1_(lastEvalForV1_(t.norm)),
               setupComplete: t.setupComplete,
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.FTO, t,
                   { fto: viewer.name, trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
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
  var queue = openQueueV1_();

  // A trainee whose officer does not resolve is not "set up", whatever else
  // is filled in. Counting them as complete is how they went missing.
  var stranded = safeFormsV1_(function () { return strandedTraineesV1_(); }) || [];
  var strandedBy = {};
  stranded.forEach(function (s) { strandedBy[normNameV1_(s.name)] = true; });
  var incomplete = active.filter(function (t) {
    return !t.setupComplete || strandedBy[t.norm]; });

  var seen = {}, dupes = [];
  active.forEach(function (t) {
    if (seen[t.norm]) dupes.push(t.name); else seen[t.norm] = true;
  });

  return {
    activeCount: active.length,
    closedCount: all.length - active.length,
    queue: queue.slice(0, 25).map(function (q) {
      return { trainee: q.trainee, skill: q.skill, evidence: q.evidence,
               since: daysAgoTextV1_(q.since), requestId: q.requestId,
               row: q.row, from: q.from };
    }),
    queueCount: queue.length,
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
    releaseReady: active.filter(function (t) { return /phase\s*4/i.test(t.phase); })
      .map(function (t) { return { name: t.name, level: t.level }; }),
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
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               fto: t.fto || '', shift: t.shift || '',
               days: days, status: t.status || '', needs: why,
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.DIVISION, t, { trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.DIVISION, {});
    }),
    retiredForms: safeFormsV1_(function () { return retiredFormsV1_(); }),
    // Where two submissions of the same kind landed on the same day. Both are
    // kept; this is the list of calls to make, not a list of rows to remove.
    duplicateSubs: safeFormsV1_(function () { return duplicateSubmissionsV1_(); }),
    formLinks: safeBoolV1_(function () { return formLinksLiveV1_(); }),
    mode: modeV1_()
  };
}

function supervisorPayloadV1_(viewer) {
  var shift = normNameV1_(viewer.shift);
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && (!shift || normNameV1_(t.shift) === shift); });
  return {
    shift: viewer.shift || 'All shifts',
    trainees: mine.map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey,
               phase: t.phase, fto: t.fto,
               lastEval: daysAgoTextV1_(lastEvalForV1_(t.norm)) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.SUPERVISOR, { fto: viewer.name });
    })
  };
}

function medicalPayloadV1_() {
  var t = readTabAllV1_(PORTAL.TAB.URGENT);
  var cases = [];
  if (t.ok) {
    t.rows.forEach(function (r, i) {
      var who = String(r[3] || '').trim();
      if (!who) return;
      cases.push({
        row: realRowV1_(t, i),
        from: rowSourceV1_(t, i),
        trainee: who,
        when: asDateV1_(r[0]) ? asDateV1_(r[0]).toDateString() : '',
        from: String(r[2] || '').trim(),
        what: String(r[4] || '').trim()
      });
    });
  }
  return { cases: cases.slice(0, 20) };
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
