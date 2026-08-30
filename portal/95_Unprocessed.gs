/**
 * Things already in the tracker that nothing is reading.
 *
 * A Google Form linked to a spreadsheet drops every response into a tab of
 * its own - "Form Responses 1" and the like - with its header on row 1. That
 * happens whether or not anything is listening. So a form with no submit
 * trigger does not lose its answers: they arrive, they sit in that tab, and
 * nothing ever turns them into rows in the log that the rest of the system
 * reads.
 *
 * Both reports here are READ ONLY, in every mode, and neither writes to
 * anything. They find what is sitting unused and say what it is.
 *
 * Turning a response into a skill-evidence row is the tracker's own ingestion
 * job and this portal does not do it. Saying exactly what is waiting is
 * something it can do, and that is what this is for.
 */

/** Every tab in the target that looks like a Google Forms response sheet.
 *
 *  The signature is specific on purpose: the header sits on ROW 1, the first
 *  column is Timestamp, and there is an Email Address column. A tab this
 *  portal already knows by name is never one of these. */
function formResponseTabsV1_() {
  var out = [];
  var book;
  try { book = targetBookV1_(); } catch (e) { return out; }

  book.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (knownTabV1_(name)) return;
    if (sh.getLastRow() < 1) return;

    var lastCol = Math.max(sh.getLastColumn(), 1);
    var headers;
    try {
      headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(function (h) { return String(h == null ? '' : h).trim(); });
    } catch (e) { return; }

    if (!headers.length) return;
    if (bareV1_(headers[0]) !== 'TIMESTAMP') return;
    var hasEmail = headers.some(function (h) { return bareV1_(h) === 'EMAILADDRESS'; });
    if (!hasEmail) return;

    var col = {};
    headers.forEach(function (h, i) { if (h) col[h.toUpperCase()] = i; });
    var rows = sh.getLastRow() > 1
      ? sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues() : [];
    rows = rows.filter(function (r) {
      return r.some(function (v) { return v !== '' && v !== null && v !== undefined; });
    });

    out.push({ name: name, headers: headers, col: col, rows: rows });
  });
  return out;
}

/** The first header on a response tab matching any of these patterns. */
function responseColV1_(tab, patterns) {
  for (var i = 0; i < tab.headers.length; i++) {
    var h = tab.headers[i];
    if (!h) continue;
    for (var j = 0; j < patterns.length; j++) {
      if (patterns[j].test(h)) return i;
    }
  }
  return -1;
}

/** What has arrived and never been turned into anything. Read only. */
function unprocessedResponses() {
  var report = waitingFormResponsesV1_();
  var lines = ['UNPROCESSED FORM RESPONSES  (read only, nothing was written)', '',
    'In : ' + safeTargetNameV1_(), ''];

  if (!report.tabs.length) {
    lines.push('No form-response tabs are in this spreadsheet.');
    lines.push('Every form either writes somewhere else or has no responses yet.');
    return noteV1_(lines.join('\n'));
  }

  report.tabs.forEach(function (t) {
    lines.push('=======================================================');
    lines.push(t.name + (t.kind === 'skills' ? '  (skills log)' : ''));
    lines.push('  ' + t.total + ' response' + (t.total === 1 ? '' : 's') +
               ', ' + t.questions + ' questions');
    lines.push('=======================================================');
    if (!t.total) { lines.push('  nothing in it'); lines.push(''); return; }
    (t.responses || []).forEach(function (r) {
      var tag = r.inLog ? 'in the log ' : (r.dayHint ? 'day hint  ' : 'WAITING    ');
      lines.push('  ' + tag +
        (r.when || 'no date') + '   ' +
        (r.trainee || '(no trainee named)') +
        (r.by ? '   by ' + r.by : '') +
        (r.email ? '   ' + r.email : ''));
    });
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push(report.total + ' response(s) on file, ' + report.waiting +
             ' with nothing matching them');
  lines.push('in ' + PORTAL.TAB.EVIDENCE + '.');
  lines.push('');
  lines.push('These are NOT lost. They are in this spreadsheet, in the tabs above,');
  lines.push('exactly as they were submitted. What has not happened is the step');
  lines.push('that turns a response into a row in the evidence log, which is the');
  lines.push('tracker\'s own ingestion job and not something this portal does.');
  lines.push('');
  lines.push('"in the log" means the same source response id is on the evidence log.');
  lines.push('"day hint" means the same trainee has evidence that day — a strong hint,');
  lines.push('not a proof that this specific response was ingested.');
  lines.push('"WAITING" means neither. Clear from Field Training Home, or Sync matrix');
  lines.push('from evidence when skills are logged but the matrix is stuck.');
  return noteV1_(lines.join('\n'));
}

/**
 * Structured waiting list for Field Training Division.
 * Read only. Same matching rules as unprocessedResponses().
 */
function waitingFormResponsesV1_() {
  var tabs = formResponseTabsV1_();
  var knownDate = {}, knownId = {};
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (ev.ok) {
    ev.rows.forEach(function (r) {
      var who = String(r[ev.col['TRAINEE']] || '').trim();
      var when = evidenceEventDateV1_(ev, r);
      if (who && when) knownDate[normNameV1_(who) + '|' + when.toDateString()] = true;
      var sid = '';
      if (ev.col['SOURCE RESPONSE ID'] !== undefined) {
        sid = String(r[ev.col['SOURCE RESPONSE ID']] || '').trim();
      }
      if (sid) knownId[sid] = true;
    });
  }

  var outTabs = [], total = 0, waiting = 0, skillsWaiting = 0;
  var reviewed = reviewedFormKeysV1_();
  tabs.forEach(function (t) {
    var iWho  = responseColV1_(t, [/^trainee/i]);
    var iFto  = responseColV1_(t, [/^(fto|your name)/i]);
    var iWhen = responseColV1_(t, [/shift date|^date/i]);
    var iMail = responseColV1_(t, [/^email address/i]);
    var iTs   = responseColV1_(t, [/^timestamp/i]);
    var kind = skillsResponseTabV1_(t) ? 'skills' : 'other';
    var responses = [];
    t.rows.forEach(function (r, i) {
      total++;
      var who = iWho >= 0 ? String(r[iWho] || '').trim() : '';
      var when = iWhen >= 0 ? asDateV1_(r[iWhen]) : null;
      if (!when && iTs >= 0) when = asDateV1_(r[iTs]);
      var by = iFto >= 0 ? String(r[iFto] || '').trim() : '';
      var email = iMail >= 0 ? String(r[iMail] || '').trim() : '';
      var sheetRow = i + 2; // header on row 1
      var responseId = formResponseIdGuessV1_(t, r);
      // Response-id match is authoritative. Same-day trainee match is only a
      // hint — one skill logged that day must not hide every other form.
      var idInLog = !!(responseId && knownId[responseId]);
      var dayHint = !!(who && when && knownDate[normNameV1_(who) + '|' + when.toDateString()]);
      var inLog = idInLog;
      var deskCleared = !!reviewed[t.name + '|' + sheetRow];
      if (!inLog && !deskCleared) {
        waiting++;
        if (kind === 'skills') skillsWaiting++;
      }
      responses.push({
        tab: t.name,
        row: sheetRow,
        trainee: who,
        by: by,
        email: email,
        when: when ? when.toDateString() : '',
        stamp: iTs >= 0 && asDateV1_(r[iTs]) ? asDateV1_(r[iTs]).toDateString() : '',
        inLog: inLog,
        dayHint: dayHint,
        deskCleared: deskCleared,
        kind: kind,
        responseId: responseId || ''
      });
    });
    outTabs.push({
      name: t.name,
      kind: kind,
      total: t.rows.length,
      questions: t.headers.filter(String).length,
      waiting: responses.filter(function (x) { return !x.inLog && !x.deskCleared; }).length,
      responses: responses
    });
  });

  var waitingList = [];
  outTabs.forEach(function (t) {
    t.responses.forEach(function (r) {
      if (!r.inLog && !r.deskCleared) waitingList.push(r);
    });
  });
  // Newest first when we have a date string we can sort loosely
  waitingList.sort(function (a, b) {
    return String(b.when || b.stamp || '').localeCompare(String(a.when || a.stamp || ''));
  });

  return {
    tabs: outTabs,
    total: total,
    waiting: waiting,
    skillsWaiting: skillsWaiting,
    waitingList: waitingList.slice(0, 40)
  };
}

/** Keys Division has already reviewed so Waiting on you stops nagging. */
function reviewedFormKeysV1_() {
  var out = {};
  var t = readTabV1_('PORTAL FORM REVIEWS');
  if (!t.ok) return out;
  t.rows.forEach(function (r) {
    var tab = String(r[t.col['TAB']] || '').trim();
    var row = String(r[t.col['ROW']] || '').trim();
    if (!tab || !row) return;
    out[tab + '|' + row] = true;
  });
  return out;
}

function ensureFormReviewsLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName('PORTAL FORM REVIEWS')) return true;
    var sh = book.insertSheet('PORTAL FORM REVIEWS');
    sh.getRange(1, 1).setValue(
      'Form responses Division reviewed from Field Training. Raw tabs stay.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 7).setValues([[
      'WHEN', 'TAB', 'ROW', 'TRAINEE', 'BY', 'REASON', 'VERSION'
    ]]).setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

/**
 * Clear a waiting form response from the Division desk without ingesting it.
 * The Form Responses tab is untouched. Tracker ingest remains separate.
 */
function reviewFormResponseV1(tabName, sheetRow, reason) {
  requireWritableV1_('review a form response');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may clear a waiting form response from the desk.');
  }
  var tab = String(tabName || '').trim();
  var row = String(sheetRow == null ? '' : sheetRow).trim();
  var why = String(reason || '').trim();
  if (!tab || !row || row === '0') throw new Error('Missing response identity.');
  if (why.length < 8) {
    throw new Error('Type why you are clearing this from the desk. It goes on the record.');
  }
  if (reviewedFormKeysV1_()[tab + '|' + row]) {
    return { ok: true, message: 'Already cleared from the desk.' };
  }
  // Confirm the row still exists
  formResponseDetailV1_(tab, Number(row));

  if (!ensureFormReviewsLogV1_()) {
    throw new Error('Could not open or create PORTAL FORM REVIEWS. Nothing was written.');
  }
  var t = readTabV1_('PORTAL FORM REVIEWS');
  if (!t.ok) throw new Error('No form-reviews log.');
  var detail = formResponseDetailV1_(tab, Number(row));
  var line = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'WHEN') return new Date();
    if (H === 'TAB') return tab;
    if (H === 'ROW') return row;
    if (H === 'TRAINEE') return detail.trainee || '';
    if (H === 'BY') return viewer.email;
    if (H === 'REASON') return clean_(why);
    if (H === 'VERSION') return PORTAL.VERSION;
    return '';
  });
  t.sheet.appendRow(line);
  forgetTabsV1_();
  auditV1_('FORM RESPONSE REVIEWED', viewer.email, tab + ' | row ' + row + ' | ' + why.slice(0, 100));
  return { ok: true, message: 'Cleared from Waiting on you. The form-response tab is unchanged.' };
}

/** Skills-grid response tabs tend to carry many skill/stage columns. */
function skillsResponseTabV1_(tab) {
  var n = 0;
  (tab.headers || []).forEach(function (h) {
    if (/skill|stage|independent|assisted|successful|unsuccessful|rep\b|grid/i.test(h)) n++;
  });
  if (n >= 3) return true;
  if (/skill/i.test(tab.name || '')) return true;
  return false;
}

function formResponseIdGuessV1_(tab, row) {
  var i = responseColV1_(tab, [/response\s*id|source\s*response/i]);
  if (i < 0) return '';
  return String(row[i] || '').trim();
}

/**
 * One raw form response for Division to read in Field Training.
 * Read only. Does not ingest.
 */
function formResponseDetailV1(tabName, sheetRow) {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may open raw form responses here.');
  }
  return formResponseDetailV1_(tabName, sheetRow);
}

function formResponseDetailV1_(tabName, sheetRow) {
  var name = String(tabName || '').trim();
  var rowNum = Number(sheetRow);
  if (!name || !(rowNum >= 2)) throw new Error('Missing response identity. Reload and try again.');

  var hit = null;
  formResponseTabsV1_().forEach(function (t) {
    if (!hit && t.name === name) hit = t;
  });
  if (!hit) throw new Error('No form-response tab named "' + name + '".');

  var idx = rowNum - 2;
  if (idx < 0 || idx >= hit.rows.length) {
    throw new Error('That response is gone from the tab. Reload.');
  }
  var r = hit.rows[idx];
  var iWho  = responseColV1_(hit, [/^trainee/i]);
  var iFto  = responseColV1_(hit, [/^(fto|your name)/i]);
  var iWhen = responseColV1_(hit, [/shift date|^date/i]);
  var iMail = responseColV1_(hit, [/^email address/i]);
  var iTs   = responseColV1_(hit, [/^timestamp/i]);
  var fields = [];
  hit.headers.forEach(function (h, ci) {
    if (!h) return;
    if (ci === iWho || ci === iFto || ci === iWhen || ci === iMail || ci === iTs) return;
    var v = r[ci];
    if (v === '' || v === null || v === undefined) return;
    fields.push({ label: labelForV1_(h), value: displayValueV1_(v) });
  });

  var when = iWhen >= 0 ? asDateV1_(r[iWhen]) : null;
  if (!when && iTs >= 0) when = asDateV1_(r[iTs]);
  var trainee = iWho >= 0 ? String(r[iWho] || '').trim() : '';
  var responseId = formResponseIdGuessV1_(hit, r);
  var inLog = false;
  var dayHint = false;
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (ev.ok) {
    if (responseId && ev.col['SOURCE RESPONSE ID'] !== undefined) {
      inLog = ev.rows.some(function (er) {
        return String(er[ev.col['SOURCE RESPONSE ID']] || '').trim() === responseId;
      });
    }
    if (trainee && when) {
      var day = when.toDateString();
      dayHint = ev.rows.some(function (er) {
        var d = evidenceEventDateV1_(ev, er);
        return normNameV1_(er[ev.col['TRAINEE']]) === normNameV1_(trainee) &&
          d && d.toDateString() === day;
      });
    }
  }

  return {
    tab: name,
    row: rowNum,
    kind: skillsResponseTabV1_(hit) ? 'skills' : 'other',
    trainee: trainee,
    by: iFto >= 0 ? String(r[iFto] || '').trim() : '',
    email: iMail >= 0 ? String(r[iMail] || '').trim() : '',
    when: when ? when.toDateString() : '',
    stamp: iTs >= 0 && asDateV1_(r[iTs]) ? asDateV1_(r[iTs]).toDateString() : '',
    inLog: inLog,
    dayHint: dayHint,
    deskCleared: !!reviewedFormKeysV1_()[name + '|' + rowNum],
    fields: fields.slice(0, 40),
    note: 'Read only. Ingest into ' + PORTAL.TAB.EVIDENCE +
      ' still runs in the tracker (catchUpUnprocessed / form trigger). ' +
      'If skills are on the log but the matrix is stuck, use Sync matrix from evidence on Home.'
  };
}

var PORTAL_DIRECTORY_PROPERTY = 'PORTAL_DIRECTORY_EMAILS';

/** The directory, however it was pasted in.
 *
 *  A bare list of addresses is one line each. A staff list is a line with a
 *  name on it as well - "Robins, Ada, C, ada.robins248@example.org" or
 *  "Ada Robins <ada.robins248@example.org>" or a tab-separated row out of a
 *  report. Anything on the line that is not the address is taken as the name.
 *
 *  A name is worth far more than an address on its own: matching Ada Robins
 *  to her row is a fact, and matching ali.robinson248@ to her by its shape is
 *  a guess that happens to be right. */
function directoryEntriesV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_DIRECTORY_PROPERTY) || '');

  // Names first, by the same word walk the roster list uses - the property
  // editor is one line and eats the line breaks out of a pasted block.
  var seen = {}, out = [];
  nameEmailPairsV1_(raw).forEach(function (e) {
    if (seen[e.email]) return;
    seen[e.email] = true;
    out.push({ email: e.email, name: e.name });
  });

  // then any address that had no name in front of it
  var all = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) || [];
  all.forEach(function (a) {
    var email = a.toLowerCase().replace(/[.,;]+$/, '');
    if (seen[email]) return;
    seen[email] = true;
    out.push({ email: email, name: '' });
  });
  return out;
}

/** Just the addresses, for the shape matching. */
function directoryEmailsV1_() {
  return directoryEntriesV1_().map(function (e) { return e.email; });
}

/** Does a directory line name this person? Tries the name as written and
 *  reversed, because a staff list is usually surname first. */
function directoryNameMatchV1_(name, entryName) {
  var a = normNameV1_(name);
  var b = normNameV1_(entryName);
  if (!a || !b) return false;
  if (a === b) return true;
  var bp = b.split(' ');
  if (bp.length >= 2) {
    if (bp.slice(1).join(' ') + ' ' + bp[0] === a) return true;   // "Robinson Ali"
    if (bp[bp.length - 1] + ' ' + bp.slice(0, -1).join(' ') === a) return true;
  }
  return false;
}

/** How much an address LOOKS like it belongs to a name, and why.
 *
 *  This is shape, not evidence. jhead@ looks like Justin Hale and probably is,
 *  but it looks exactly as much like Jane Hale. The score exists so the report
 *  can separate what it is confident about from what it is guessing at, and
 *  the "why" exists so a person can judge it rather than trust it. */
function nameShapeScoreV1_(name, address) {
  var local = String(address).split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  var p = String(name).toLowerCase().split(/\s+/)
    .map(function (x) { return x.replace(/[^a-z]/g, ''); })
    .filter(Boolean);
  if (p.length < 2 || !local) return { score: 0, why: '' };

  var first = p[0], last = p[p.length - 1];
  var fi = first.charAt(0), li = last.charAt(0);

  if (local === first + last || local === last + first) return { score: 100, why: 'the whole name' };
  if (local.indexOf(first + last) >= 0 || local.indexOf(last + first) >= 0) {
    return { score: 92, why: 'the whole name, inside' };
  }
  if (local.indexOf(fi + last) === 0) return { score: 86, why: 'initial and surname' };
  if (local.length > last.length + 1 && local.charAt(0) === fi &&
      local.slice(2, 2 + last.length) === last) {
    return { score: 84, why: 'two initials and surname' };
  }
  if (local.indexOf(first + li) === 0) return { score: 80, why: 'given name and initial' };
  for (var cut = first.length - 1; cut > 2; cut--) {
    if (local.indexOf(first.slice(0, cut) + last) === 0) {
      return { score: 76, why: 'shortened given name and surname' };
    }
  }
  for (var lc = last.length; lc >= 4; lc--) {
    if (local.indexOf(fi + last.slice(0, lc)) === 0 && lc >= 4) {
      return { score: 72, why: 'initial and part of the surname' };
    }
    if (local.indexOf(first.slice(0, 2) + last.slice(0, lc)) === 0 && lc >= 4) {
      return { score: 70, why: 'part of both names' };
    }
  }
  if (local.indexOf(last) === 0 && last.length >= 5) return { score: 62, why: 'surname only' };
  if (local.indexOf(first) === 0 && first.length >= 5) return { score: 56, why: 'given name only' };
  if (local.indexOf(last) > 0 && last.length >= 6) return { score: 54, why: 'surname somewhere inside' };
  return { score: 0, why: '' };
}

/** Addresses for the roster, taken from what people actually submitted.
 *
 *  Every FTO on the roster has no email, so no FTO can sign in. But they have
 *  been submitting forms for months, and a Google Form that collects the
 *  respondent's address has been recording it every time. This pairs the name
 *  they typed with the account they submitted from.
 *
 *  Read only. It suggests; it does not write to the roster. */
function suggestFtoEmails() {
  var pairs = {};                       // normalised name -> { name, emails{} }
  function note(name, email) {
    var n = normNameV1_(name), e = String(email || '').trim().toLowerCase();
    if (!n || e.indexOf('@') < 1) return;
    if (!pairs[n]) pairs[n] = { name: String(name).trim(), emails: {} };
    pairs[n].emails[e] = (pairs[n].emails[e] || 0) + 1;
  }

  // the form-response tabs
  formResponseTabsV1_().forEach(function (t) {
    var iFto = responseColV1_(t, [/^(fto|your name)/i]);
    var iMail = responseColV1_(t, [/^email address/i]);
    if (iFto < 0 || iMail < 0) return;
    t.rows.forEach(function (r) { note(r[iFto], r[iMail]); });
  });

  // and the processed evaluation log, which may carry both as well
  var ev = readTabV1_(PORTAL.TAB.EVAL);
  if (ev.ok) {
    var fi = -1, mi = -1;
    ev.headers.forEach(function (h, i) {
      if (fi < 0 && /^(fto|evaluator|your name)/i.test(h)) fi = i;
      if (mi < 0 && /email/i.test(h)) mi = i;
    });
    if (fi >= 0 && mi >= 0) ev.rows.forEach(function (r) { note(r[fi], r[mi]); });
  }

  // who on the roster is missing one
  var roster = readTabV1_(PORTAL.TAB.ROSTER);
  var missing = [], haveAlready = 0, retiredNames = [];
  rosterPeopleV1_().forEach(function (p) {
    if (!p.active) { retiredNames.push(p.name); return; }
    if (p.email.indexOf('@') > 0) { haveAlready++; return; }
    missing.push(p.name);
  });

  var lines = ['ADDRESSES FOR THE ROSTER  (read only, nothing was written)', '',
    'In : ' + safeTargetNameV1_(), ''];

  if (!roster.ok) {
    lines.push(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
    return noteV1_(lines.join('\n'));
  }

  lines.push((haveAlready + missing.length) + ' on the roster, ' + haveAlready +
             ' with an address, ' + missing.length + ' without.');
  if (retiredNames.length) {
    lines.push(retiredNames.length + ' more are marked as no longer here and are not ' +
               'looked for: ' + retiredNames.join(', ') + '.');
  }
  lines.push('');
  if (!missing.length) {
    lines.push('Every one of them can sign in. Nothing to do.');
    return noteV1_(lines.join('\n'));
  }

  lines.push('An FTO with no address on the roster cannot be recognised, and');
  lines.push('opening the portal tells them they are not set up. These are the');
  lines.push('accounts each of them has actually submitted forms from:');
  lines.push('');

  var found = 0, ambiguous = 0, none = [];
  missing.forEach(function (nm) {
    var hit = pairs[normNameV1_(nm)];
    if (!hit) { none.push(nm); return; }
    var addrs = Object.keys(hit.emails).sort(function (a, b) {
      return hit.emails[b] - hit.emails[a]; });
    if (addrs.length === 1) {
      found++;
      lines.push('  ' + nm + '\n      ' + addrs[0] +
                 '   (' + hit.emails[addrs[0]] + ' submission' +
                 (hit.emails[addrs[0]] === 1 ? '' : 's') + ')');
    } else {
      ambiguous++;
      lines.push('  ' + nm + '   MORE THAN ONE ACCOUNT, pick one:');
      addrs.forEach(function (a) {
        lines.push('      ' + a + '   (' + hit.emails[a] + ')');
      });
    }
  });

  if (none.length) {
    lines.push('');
    lines.push('No submission on file for these, so there is nothing to suggest:');
    none.forEach(function (n) { lines.push('  ' + n); });
  }

  // The directory, if one has been pasted in. Shape matching only, kept well
  // apart from the submissions above, because a name that merely LOOKS like an
  // address is not the same kind of fact as an address someone submitted from.
  var dir = directoryEmailsV1_();
  if (dir.length && none.length) {
    lines.push('');
    lines.push('=======================================================');
    lines.push('FROM THE DIRECTORY  (' + dir.length + ' addresses)');
    lines.push('These are matched on what the address LOOKS like. That is a guess,');
    lines.push('and a good-looking guess is still a guess.');
    lines.push('=======================================================');

    var entries = directoryEntriesV1_();
    var named = entries.filter(function (e) { return e.name; }).length;
    if (named) {
      lines.push(named + ' of them have a name on the line, which is worth more');
      lines.push('than any amount of guessing at an address.');
    }

    var tiers = { named: [], sure: [], likely: [], weak: [] };
    none.forEach(function (nm) {
      // a line that NAMES this person settles it, whatever the address looks like
      var byName = entries.filter(function (e) {
        return e.name && directoryNameMatchV1_(nm, e.name); });
      if (byName.length === 1) {
        tiers.named.push({ name: nm, hits: [{ email: byName[0].email,
          why: 'the directory names them', score: 100 }] });
        return;
      }
      if (byName.length > 1) {
        tiers.named.push({ name: nm, hits: byName.map(function (e) {
          return { email: e.email, why: 'MORE THAN ONE line names them', score: 100 }; }) });
        return;
      }
      var hits = [];
      dir.forEach(function (a) {
        var sc = nameShapeScoreV1_(nm, a);
        if (sc.score) hits.push({ score: sc.score, why: sc.why, email: a });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      if (!hits.length) { tiers.weak.push({ name: nm, hits: [] }); return; }
      var t = hits[0].score >= 92 ? 'sure' : (hits[0].score >= 70 ? 'likely' : 'weak');
      tiers[t].push({ name: nm, hits: hits.slice(0, 3) });
    });

    [['NAMED IN THE DIRECTORY, not guessed at', tiers.named],
     ['MATCHED WITH CONFIDENCE', tiers.sure],
     ['PROBABLE, check each one', tiers.likely],
     ['GUESSWORK, ask the person', tiers.weak]].forEach(function (pair) {
      lines.push('');
      lines.push(pair[0]);
      if (!pair[1].length) { lines.push('  none'); return; }
      pair[1].forEach(function (e) {
        if (!e.hits.length) { lines.push('  ' + e.name + '   nothing in the directory resembles this'); return; }
        lines.push('  ' + e.name);
        e.hits.forEach(function (h, i) {
          lines.push('      ' + (i ? 'or ' : '   ') + h.email + '   (' + h.why + ')');
        });
      });
    });
  } else if (!dir.length) {
    lines.push('');
    lines.push('If you have a staff list, paste it into the script property');
    lines.push(PORTAL_DIRECTORY_PROPERTY + ' and run this again. One line each.');
    lines.push('A line with a NAME as well as an address is worth far more than');
    lines.push('the address alone, because then nothing has to be guessed:');
    lines.push('  Robins, Ada, C, ada.robins248@example.org');
  }

  lines.push('');
  lines.push('=======================================================');
  lines.push(found + ' with one clear address, ' + ambiguous + ' with more than one, ' +
             none.length + ' with none.');
  lines.push('');
  lines.push('Nothing here has been written to the roster. Each of these is a');
  lines.push('guess from a name someone typed into a form, and a name typed twice');
  lines.push('is not proof of identity. Put them in the EMAIL column yourself,');
  lines.push('checking as you go.');
  return noteV1_(lines.join('\n'));
}
