/**
 * Everything that was ever submitted, arranged newest first.
 *
 * The raw tabs are the archive and they stay exactly as they are. Nothing in
 * this file deletes a row, moves a row, overwrites a row, or decides that an
 * old submission no longer matters. It reads, groups, and orders.
 *
 * What it produces for one person:
 *
 *   CURRENT   the most recent submission of each kind, in full
 *   EARLIER   every submission before it, also in full, in order
 *
 * A submission is never summarised or trimmed on the way through. Every named
 * column that had a value in it comes out the other side with its own label,
 * because the whole point is that nothing gathered so far is lost.
 *
 * Two rows of the same kind on the same day are flagged as a possible
 * duplicate. Flagged, not removed. Which one is right is a judgement about a
 * personnel record and this code does not make it.
 */

/** The raw tabs a person's record is assembled from.
 *
 *  Columns are found by header, with a positional fallback for the tabs whose
 *  headers a form rewrote. `who` and `when` are structural; everything else
 *  is carried through as-is, so a column added to a form tomorrow appears in
 *  the record without this file changing. */
var PORTAL_SOURCES = [
  { key: 'EVAL', tab: PORTAL.TAB.EVAL, title: 'Shift evaluation',
    who:  { re: /^trainee/i,                    at: 2 },
    when: { re: /shift date|^timestamp|^date/i, at: 0 },
    by:   { re: /^(fto|evaluator|training officer)/i, at: 1 } },

  { key: 'REFLECT', tab: PORTAL.TAB.REFLECT, title: 'Self-reflection',
    who:  { re: /^trainee|^your name|^name/i,   at: 1 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   null },

  { key: 'URGENT', tab: PORTAL.TAB.URGENT, title: 'Urgent concern',
    who:  { re: /trainee/i,                     at: 3 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   { re: /^your name|reported by/i,      at: 2 },
    restricted: true },

  { key: 'EVIDENCE', tab: PORTAL.TAB.EVIDENCE, title: 'Skill logged',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /event date|^timestamp|^date/i, at: -1 },
    by:   { re: /^(fto|logged by)/i,            at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'SIGNOFF', tab: PORTAL.TAB.SIGNOFF, title: 'Sign-off',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /^(sign-?off )?date|^timestamp/i, at: -1 },
    by:   { re: /signed off by|approved by|decided by/i, at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'COACHING', tab: PORTAL.TAB.COACHING, title: 'Coaching note',
    who:  { re: /^trainee/i,                    at: 1 },
    when: { re: /^date|^timestamp/i,            at: 0 },
    by:   { re: /^from/i,                       at: 2 } }
];

/** Column index by header pattern, falling back to a fixed position.
 *  Returns -1 when neither finds one, and callers treat that as "no column"
 *  rather than guessing at column A. */
function colIndexV1_(t, spec) {
  if (!spec) return -1;
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && spec.re.test(t.headers[i])) return i;
  }
  return spec.at >= 0 ? spec.at : -1;
}

var PORTAL_ACRONYMS = ['FTO','EMT','AEMT','EMS','ALS','BLS','ID','PCR','IV','IO',
                       'CPR','ECG','EKG','QA','QI','MD','NREMT'];

/** 'WHAT WENT WELL' reads as shouting in a record someone has to sit and
 *  read for twenty minutes. Sentence case, and acronyms keep their case. */
function labelForV1_(header) {
  return String(header || '').split(/\s+/).map(function (w, i) {
    var bare = w.replace(/[^A-Za-z]/g, '');
    if (bare && PORTAL_ACRONYMS.indexOf(bare.toUpperCase()) >= 0) return w.toUpperCase();
    var lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(' ');
}

/** A cell as a person would read it. Dates become dates; nothing is cut. */
function displayValueV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toDateString();
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+$/, '');
}

function dayKeyV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime()))
    ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : '';
}

/** Every submission in one tab belonging to one person, newest first.
 *  Undated rows sort last rather than being dropped. */
function submissionsFromV1_(source, norm) {
  var t = readTabAllV1_(source.tab);
  if (!t.ok) return [];

  var whoIdx  = colIndexV1_(t, source.who);
  if (whoIdx < 0) return [];
  var whenIdx = colIndexV1_(t, source.when);
  var byIdx   = colIndexV1_(t, source.by);
  var grpIdx  = colIndexV1_(t, source.groupBy);

  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[whoIdx]) !== norm) return;
    var fields = [];
    t.headers.forEach(function (h, ci) {
      if (!h) return;
      if (ci === whoIdx || ci === whenIdx || ci === byIdx) return;
      var v = r[ci];
      if (v === '' || v === null || v === undefined) return;
      fields.push({ label: labelForV1_(h), value: displayValueV1_(v) });
    });
    out.push({
      key: source.key,
      source: source.title,
      tab: source.tab,
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      when: whenIdx >= 0 ? asDateV1_(r[whenIdx]) : null,
      by: byIdx >= 0 ? String(r[byIdx] || '').trim() : '',
      group: grpIdx >= 0 ? String(r[grpIdx] || '').trim() : '',
      fields: fields
    });
  });

  out.sort(function (a, b) {
    if (a.when && b.when) return b.when - a.when;
    if (a.when) return -1;
    if (b.when) return 1;
    return b.row - a.row;
  });
  return out;
}

/** Marks the newest of each group as current, everything else as earlier, and
 *  same-day pairs as a possible duplicate. Nothing is removed. */
function markCurrentV1_(list, grouped) {
  var seen = {}, byDay = {};
  list.forEach(function (s) {
    var g = grouped ? (s.group || '(unnamed)') : '*';
    s.current = !seen[g];
    seen[g] = true;

    var dk = g + '|' + dayKeyV1_(s.when);
    if (dayKeyV1_(s.when)) {
      byDay[dk] = (byDay[dk] || 0) + 1;
      s.sameDayIndex = byDay[dk];
    } else {
      s.sameDayIndex = 1;
    }
  });
  list.forEach(function (s) {
    var dk = (grouped ? (s.group || '(unnamed)') : '*') + '|' + dayKeyV1_(s.when);
    s.possibleDuplicate = dayKeyV1_(s.when) ? byDay[dk] > 1 : false;
  });
  return list;
}

function whenTextV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime())) ? d.toDateString() : 'no date recorded';
}

/** One person's whole record: what is current, and everything before it.
 *  `only` restricts which sources are read, which is how the Medical Director
 *  gets urgent concerns and nothing else. */
function recordForV1_(name, only) {
  var norm = normNameV1_(name);
  var sections = [], timeline = [], total = 0, duplicates = 0;

  PORTAL_SOURCES.forEach(function (src) {
    if (only && only.indexOf(src.key) < 0) return;
    var list = markCurrentV1_(submissionsFromV1_(src, norm), !!src.groupBy);
    if (!list.length) return;
    total += list.length;

    var current = list.filter(function (s) { return s.current; });
    var earlier = list.filter(function (s) { return !s.current; });
    duplicates += list.filter(function (s) { return s.possibleDuplicate; }).length;

    sections.push({
      key: src.key,
      title: src.title,
      grouped: !!src.groupBy,
      count: list.length,
      newest: list[0].when ? whenTextV1_(list[0].when) : '',
      newestAgo: daysAgoTextV1_(list[0].when),
      current: current.map(shapeV1_),
      earlier: earlier.map(shapeV1_)
    });

    list.forEach(function (s) { timeline.push(shapeV1_(s)); });
  });

  timeline.sort(function (a, b) {
    if (a.at && b.at) return b.at - a.at;
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });
  timeline.forEach(function (s) { delete s.at; });

  return {
    name: String(name || ''),
    sections: sections,
    timeline: timeline,
    total: total,
    duplicates: duplicates
  };
}

function shapeV1_(s) {
  return {
    key: s.key, source: s.source, tab: s.tab, row: s.row, book: s.book || '',
    when: whenTextV1_(s.when), ago: daysAgoTextV1_(s.when),
    at: s.when instanceof Date && !isNaN(s.when.getTime()) ? s.when.getTime() : 0,
    by: s.by, group: s.group,
    current: !!s.current, possibleDuplicate: !!s.possibleDuplicate,
    fields: s.fields
  };
}

/** How fresh is each kind of submission for one person. This is the
 *  at-a-glance form of the same question: what is the current state. */
function freshnessForV1_(name) {
  var norm = normNameV1_(name);
  return PORTAL_SOURCES.filter(function (s) { return !s.restricted; })
    .map(function (src) {
      var list = submissionsFromV1_(src, norm);
      return { key: src.key, title: src.title, count: list.length,
               ago: list.length ? daysAgoTextV1_(list[0].when) : 'never',
               when: list.length ? whenTextV1_(list[0].when) : '' };
    });
}

/** Which sources a role may read of another person's record. Returning a
 *  list rather than a yes or no is what lets the Medical Director open a
 *  record at all without seeing routine training detail. */
function recordScopeV1_(viewer, name) {
  var norm = normNameV1_(name);
  var all = PORTAL_SOURCES.map(function (s) { return s.key; });

  if (viewer.role === PORTAL.ROLE.DIVISION) return all;

  if (viewer.role === PORTAL.ROLE.TRAINEE) {
    return normNameV1_(viewer.traineeName) === norm ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.FTO) {
    var mine = traineesV1_().filter(function (t) {
      return normNameV1_(t.fto) === normNameV1_(viewer.name) && t.norm === norm; });
    return mine.length ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.MEDICAL) return ['URGENT'];

  // A supervisor gets situational awareness on their shift, not a training
  // record. That was the rule before this file existed and it does not change
  // because a new screen made it convenient.
  return null;
}

/* ---------------- where two submissions compete ---------------- */

/** Every place two submissions of the same kind landed on the same day, for
 *  everyone still active. This is the list of decisions to make, not a list
 *  of rows to delete: both halves of every pair stay exactly where they are.
 *
 *  Read only in every mode. */
function duplicateSubmissionsV1_() {
  var out = [];
  traineesV1_().filter(function (t) { return !t.closed; }).forEach(function (t) {
    PORTAL_SOURCES.forEach(function (src) {
      var list = markCurrentV1_(submissionsFromV1_(src, t.norm), !!src.groupBy);
      var byDay = {};
      list.forEach(function (s) {
        if (!s.possibleDuplicate) return;
        var k = (s.group || '') + '|' + dayKeyV1_(s.when);
        (byDay[k] = byDay[k] || []).push(s);
      });
      Object.keys(byDay).forEach(function (k) {
        var pair = byDay[k];
        out.push({
          trainee: t.name, source: src.title, tab: src.tab,
          group: pair[0].group || '', when: whenTextV1_(pair[0].when),
          count: pair.length, rows: pair.map(function (s) { return s.row; })
        });
      });
    });
  });
  return out;
}

/** The same thing as a report you can read in the script editor, for when the
 *  question is "where do I need to make a call" rather than "show me Jamie". */
function duplicateSubmissionsReport() {
  var dupes = duplicateSubmissionsV1_();
  if (!dupes.length) {
    return noteV1_('No two submissions of the same kind landed on the same day ' +
      'for anyone currently active. Nothing to decide.');
  }
  var lines = ['POSSIBLE DUPLICATE SUBMISSIONS  (read only, nothing was changed)', ''];
  dupes.forEach(function (d) {
    lines.push(d.trainee + '  —  ' + d.source + (d.group ? ' (' + d.group + ')' : ''));
    lines.push('  ' + d.when + '   ' + d.count + ' submissions');
    lines.push('  ' + d.tab + ' rows ' + d.rows.join(', '));
    lines.push('');
  });
  lines.push('Both halves of every pair are still on file and both are shown in');
  lines.push('the portal. Which one stands is a decision about a personnel');
  lines.push('record, so nothing here makes it for you.');
  return noteV1_(lines.join('\n'));
}
