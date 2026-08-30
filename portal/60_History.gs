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
  // One evaluation per shift is the model, so two for one shift is worth
  // raising even when they differ - the second is usually a correction and
  // somebody has to say which stands.
  { key: 'EVAL', tab: PORTAL.TAB.EVAL, title: 'Shift evaluation', oncePerDay: true,
    who:  { re: /^trainee/i,                    at: 2 },
    when: { re: /shift date|^timestamp|^date/i, at: 0 },
    by:   { re: /^(fto|evaluator|training officer)/i, at: 1 } },

  { key: 'REFLECT', tab: PORTAL.TAB.REFLECT, title: 'Self-reflection', oncePerDay: true,
    who:  { re: /^trainee|^your name|^name/i,   at: 1 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   null },

  // The positional fallback for `who` used to be column 3. On the live tab
  // column 3 is Role, not the trainee - the header is at column 4. Falling
  // back to a fixed position on a form-response tab is how a record ends up
  // attributed to "FTO" instead of to a person, so this one resolves by
  // header or not at all. `Reporter` is the live header and matched none of
  // the old patterns; it does now.
  { key: 'URGENT', tab: PORTAL.TAB.URGENT, title: 'Urgent concern',
    who:  { re: /^trainee/i,                          at: -1 },
    when: { re: /^timestamp|^date$|^date /i,          at: 0 },
    by:   { re: /^reporter|^your name|reported by/i,  at: 2 },
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

/** What makes two rows the SAME submission rather than two of them.
 *
 *  This used to be "same person, same day", and it was wrong enough to matter:
 *  it called 119 things duplicates on a real tracker. An FTO logging three
 *  reps of a skill across one shift produces three rows on one day, and that
 *  is the system working. A number that large is not a warning, it is noise,
 *  and noise is how a real duplicate gets ignored.
 *
 *  So: if the rows carry the id of the form response they came from, they are
 *  the same submission only when that id matches. Two different submissions
 *  are two different events however alike they look.
 *
 *  Only where there is no id to go on does it fall back to content: same
 *  author, same day, every field identical. */
function dupKeyV1_(s, oncePerDay) {
  // Some things happen once. An evaluation covers a shift, so two of them for
  // one shift is a correction and worth raising whatever they say. Skill
  // evidence is the opposite: three reps across one shift is three events.
  if (oncePerDay) {
    return 'DAY:' + (s.group || '') + '|' + dayKeyV1_(s.when);
  }
  var id = '';
  (s.fields || []).forEach(function (f) {
    if (!id && /^(source\s+)?response\s+id$/i.test(String(f.label))) {
      id = String(f.value == null ? '' : f.value).trim();
    }
  });
  if (id) return 'ID:' + id;

  var parts = (s.fields || []).map(function (f) {
    return String(f.label).toLowerCase() + '=' +
           String(f.value == null ? '' : f.value).trim().toLowerCase();
  });
  parts.sort();
  return 'C:' + String(s.by || '').toLowerCase() + '|' + dayKeyV1_(s.when) + '|' + parts.join('|');
}

/** Marks the newest of each group as current, everything else as earlier, and
 *  true duplicates as duplicates. Nothing is removed. */
function markCurrentV1_(list, grouped, oncePerDay) {
  var seen = {}, byKey = {};
  list.forEach(function (s) {
    var g = grouped ? (s.group || '(unnamed)') : '*';
    s.current = !seen[g];
    seen[g] = true;
    s.dupKey = dupKeyV1_(s, oncePerDay);
    byKey[s.dupKey] = (byKey[s.dupKey] || 0) + 1;
  });
  list.forEach(function (s) { s.possibleDuplicate = byKey[s.dupKey] > 1; });
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
    var list = markCurrentV1_(submissionsFromV1_(src, norm), !!src.groupBy, !!src.oncePerDay);
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
  var settled = settledDuplicateKeysV1_();
  var out = [];
  traineesV1_().filter(function (t) { return !t.closed; }).forEach(function (t) {
    PORTAL_SOURCES.forEach(function (src) {
      var list = markCurrentV1_(submissionsFromV1_(src, t.norm), !!src.groupBy, !!src.oncePerDay);
      var byDay = {};
      list.forEach(function (s) {
        if (!s.possibleDuplicate) return;
        var k = s.dupKey;
        (byDay[k] = byDay[k] || []).push(s);
      });
      Object.keys(byDay).forEach(function (k) {
        if (settled[settlementIdV1_(t.name, src.tab, k)]) return;
        var pair = byDay[k];
        out.push({
          trainee: t.name, source: src.title, tab: src.tab, dupKey: k,
          group: pair[0].group || '', when: whenTextV1_(pair[0].when),
          why: String(k).indexOf('ID:') === 0
            ? 'the SAME form response, written twice'
            : (String(k).indexOf('DAY:') === 0
                ? 'two of these for one day, and there should be one'
                : 'identical in every field, same author, same day'),
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
    lines.push('  ' + d.when + '   ' + d.count + ' rows   ' +
      d.why);
    lines.push('  ' + d.tab + ' rows ' + d.rows.join(', '));
    lines.push('');
  });
  lines.push('An evaluation covers a shift, so two for one shift is raised whatever');
  lines.push('they say. Skill evidence is the opposite: three reps across one shift');
  lines.push('are three events, and only a response written twice is a duplicate.');
  lines.push('');
  lines.push('Both halves of every pair are still on file and both are shown in');
  lines.push('the portal. Which one stands is a decision about a personnel');
  lines.push('record, so nothing here makes it for you.');
  return noteV1_(lines.join('\n'));
}
