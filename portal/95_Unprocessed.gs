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
  var tabs = formResponseTabsV1_();
  var lines = ['UNPROCESSED FORM RESPONSES  (read only, nothing was written)', '',
    'In : ' + safeTargetNameV1_(), ''];

  if (!tabs.length) {
    lines.push('No form-response tabs are in this spreadsheet.');
    lines.push('Every form either writes somewhere else or has no responses yet.');
    return noteV1_(lines.join('\n'));
  }

  // What the evidence log already knows about, so "waiting" means waiting.
  var known = {};
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (ev.ok) {
    ev.rows.forEach(function (r) {
      var who = String(r[ev.col['TRAINEE']] || '').trim();
      var when = asDateV1_(r[ev.col['EVENT DATE']] || r[ev.col['DATE']]);
      if (who && when) known[normNameV1_(who) + '|' + when.toDateString()] = true;
    });
  }

  var total = 0, waiting = 0;
  tabs.forEach(function (t) {
    var iWho  = responseColV1_(t, [/^trainee/i]);
    var iFto  = responseColV1_(t, [/^(fto|your name)/i]);
    var iWhen = responseColV1_(t, [/shift date|^date/i]);
    var iMail = responseColV1_(t, [/^email address/i]);

    lines.push('=======================================================');
    lines.push(t.name);
    lines.push('  ' + t.rows.length + ' response' + (t.rows.length === 1 ? '' : 's') +
               ', ' + t.headers.filter(String).length + ' questions');
    lines.push('=======================================================');
    if (!t.rows.length) { lines.push('  nothing in it'); lines.push(''); return; }

    t.rows.forEach(function (r) {
      total++;
      var who = iWho >= 0 ? String(r[iWho] || '').trim() : '';
      var when = iWhen >= 0 ? asDateV1_(r[iWhen]) : null;
      var already = who && when && known[normNameV1_(who) + '|' + when.toDateString()];
      if (!already) waiting++;
      lines.push('  ' + (already ? 'in the log ' : 'WAITING    ') +
        (when ? when.toDateString() : 'no date') + '   ' +
        (who || '(no trainee named)') +
        (iFto >= 0 && r[iFto] ? '   by ' + String(r[iFto]).trim() : '') +
        (iMail >= 0 && r[iMail] ? '   ' + String(r[iMail]).trim() : ''));
    });
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push(total + ' response(s) on file, ' + waiting + ' with nothing matching them');
  lines.push('in ' + PORTAL.TAB.EVIDENCE + '.');
  lines.push('');
  lines.push('These are NOT lost. They are in this spreadsheet, in the tabs above,');
  lines.push('exactly as they were submitted. What has not happened is the step');
  lines.push('that turns a response into a row in the evidence log, which is the');
  lines.push('tracker\'s own ingestion job and not something this portal does.');
  lines.push('');
  lines.push('"WAITING" here means no evidence row shares that trainee and date.');
  lines.push('It is a strong hint, not a proof - check before acting on it.');
  return noteV1_(lines.join('\n'));
}

var PORTAL_DIRECTORY_PROPERTY = 'PORTAL_DIRECTORY_EMAILS';

/** Every address pasted into the directory property. One per line, or
 *  separated by commas. Anything without an @ in it is ignored. */
function directoryEmailsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_DIRECTORY_PROPERTY) || '');
  var seen = {}, out = [];
  raw.split(/[\s,;]+/).forEach(function (piece) {
    var e = String(piece || '').trim().toLowerCase();
    if (e.indexOf('@') < 1 || seen[e]) return;
    seen[e] = true;
    out.push(e);
  });
  return out;
}

/** How much an address LOOKS like it belongs to a name, and why.
 *
 *  This is shape, not evidence. jhead@ looks like Justin Head and probably is,
 *  but it looks exactly as much like Jane Head. The score exists so the report
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
  var missing = [], haveAlready = 0;
  if (roster.ok) {
    roster.rows.forEach(function (r) {
      var nm = String(pickV1_(roster, r, ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'])).trim();
      var em = String(pickV1_(roster, r, ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'])).trim();
      if (!nm) return;
      if (em.indexOf('@') > 0) { haveAlready++; return; }
      missing.push(nm);
    });
  }

  var lines = ['ADDRESSES FOR THE ROSTER  (read only, nothing was written)', '',
    'In : ' + safeTargetNameV1_(), ''];

  if (!roster.ok) {
    lines.push(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
    return noteV1_(lines.join('\n'));
  }

  lines.push(roster.rows.length + ' on the roster, ' + haveAlready + ' with an address, ' +
             missing.length + ' without.');
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

    var tiers = { sure: [], likely: [], weak: [] };
    none.forEach(function (nm) {
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

    [['MATCHED WITH CONFIDENCE', tiers.sure],
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
    lines.push('If you have a list of everyone\'s address, paste it into the script');
    lines.push('property ' + PORTAL_DIRECTORY_PROPERTY + ' and run this again. It will');
    lines.push('match names against it and say how sure it is about each one.');
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
