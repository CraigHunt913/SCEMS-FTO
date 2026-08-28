/**
 * The web app entry point.
 *
 * doGet resolves the viewer on the server, builds only that role's payload,
 * and injects it into the page. The browser receives no data belonging to
 * anyone else, so there is nothing for a client-side mistake to expose.
 */

function doGet(e) {
  var viewer, payload, err = '';
  try {
    viewer = resolveViewerV1_(whoIsVisitingV1_());
    payload = viewer.ok ? payloadForV1_(viewer) : {};
  } catch (ex) {
    viewer = { email: '', role: PORTAL.ROLE.NONE, name: '', ok: false, why: String(ex.message || ex) };
    payload = {};
    err = String(ex.message || ex);
  }

  var boot = {
    // The build, not just the version. A deployment serves the code as it was
    // WHEN YOU DEPLOYED IT, so a freshly pasted build reaches nobody until you
    // deploy again - and until now nothing on the page said which one it was.
    // "Is the fix live?" is a question the page should answer by itself.
    version: PORTAL.VERSION +
      (typeof PORTAL_BUILD === 'string' ? '  build ' + PORTAL_BUILD : ''),
    mode: safeModeV1_(),
    viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
              ok: viewer.ok, why: viewer.why },
    data: payload,
    error: err
  };

  var t = portalTemplateV1_();
  t.boot = JSON.stringify(boot);

  var page = t.evaluate();
  page.setTitle(PORTAL.TITLE);
  page.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');

  // XFrameOptionsMode has exactly two members, DEFAULT and ALLOWALL. DEFAULT
  // is the protective one: Google sends X-Frame-Options SAMEORIGIN, so no
  // other site can frame this page. There is no DENY. Asking for one yields
  // undefined, and Apps Script rejects it as a null mode.
  page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  return page;
}

function safeModeV1_() { try { return modeV1_(); } catch (e) { return 'UNSET'; } }

/** The page, from wherever it lives.
 *
 *  Pasted as separate files, the page is an HTML file named Index. Pasted as
 *  the single combined file, it is a string constant the build put there.
 *  Same source either way; this is the one line that has to know which. */
function portalTemplateV1_() {
  if (typeof PORTAL_PAGE_HTML === 'string' && PORTAL_PAGE_HTML) {
    return HtmlService.createTemplate(PORTAL_PAGE_HTML);
  }
  return HtmlService.createTemplateFromFile('Index');
}

function payloadForV1_(viewer) {
  switch (viewer.role) {
    case PORTAL.ROLE.TRAINEE:    return traineePayloadV1_(viewer);
    case PORTAL.ROLE.FTO:        return ftoPayloadV1_(viewer);
    case PORTAL.ROLE.DIVISION:   return divisionPayloadV1_();
    case PORTAL.ROLE.SUPERVISOR: return supervisorPayloadV1_(viewer);
    case PORTAL.ROLE.MEDICAL:    return medicalPayloadV1_();
    default:                     return {};
  }
}

/* ---------------- actions ---------------- */
/* Each re-resolves the viewer server-side. A client cannot act as someone
   else by sending a different name, because the name it sends is ignored. */

/** A row this portal can actually write to.
 *
 *  Screens read across every listed spreadsheet, so a row on screen may live
 *  in another book entirely and carry no row number here. Writing to a number
 *  that came from somewhere else would put a value in an unrelated record, so
 *  every write asks for this first. */
function requireLocalRowV1_(t, row, what) {
  var r = Number(row);
  if (!r || r < t.firstDataRow || r > t.firstDataRow + t.rows.length - 1) {
    throw new Error('Cannot ' + what + '. That row is not in this spreadsheet - ' +
      'it was read from another one. Bring it across first, or make the change ' +
      'where the row actually lives.');
  }
  return r;
}

/** Trainee acknowledges a coaching note. */
function ackCoachingV1(row) {
  requireWritableV1_('acknowledge a coaching note');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only the trainee may acknowledge their own coaching.');
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) throw new Error('No coaching log.');
  var r = requireLocalRowV1_(t, row, 'acknowledge that coaching note');
  var idx = r - t.firstDataRow;
  if (normNameV1_(t.rows[idx][t.col['TRAINEE']]) !== normNameV1_(viewer.traineeName)) {
    throw new Error('That coaching note belongs to someone else.');
  }
  t.sheet.getRange(r, t.col['ACKNOWLEDGED'] + 1).setValue('YES');
  forgetTabsV1_();
  auditV1_('COACHING ACKNOWLEDGED', viewer.email, 'row ' + r);
  return 'Acknowledged.';
}

/** Trainee files a reflection — in STAGING only.
 *
 *  Two reasons it is not allowed against the real tracker, and each on its own
 *  would be enough.
 *
 *  03 SELF-REFLECTION RAW is a form-response tab. The self-reflection FORM
 *  writes it, that form has a trigger and a destination, and the tracker reads
 *  what lands there. A second writer into the same tab is a second version of
 *  the truth, and this portal was never meant to be one.
 *
 *  And this write was positional — date, name, three answers, in that order,
 *  into whatever columns happened to be there. The column order of a form
 *  response tab belongs to the form, and Google mints a fresh one on every
 *  relink. One added question and a reflection would file itself into the
 *  wrong columns of somebody's permanent record, quietly.
 *
 *  So: STAGING only, where the flow can be practised end to end, and mapped by
 *  header even there, because a practice run that exercises a different shape
 *  from the real one proves nothing. */
function submitReflectionV1(answers) {
  requireStagingV1_('file a reflection from inside the portal');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only a trainee may file a reflection.');

  var t = readTabV1_(PORTAL.TAB.REFLECT);
  if (!t.ok) throw new Error('No reflection log.');

  var a = answers || {};
  var byHeader = {};
  byHeader[headerNameV1_(t, ['TIMESTAMP', 'DATE'])] = new Date();
  byHeader[headerNameV1_(t, ['TRAINEE', 'TRAINEE NAME', 'NAME'])] = viewer.traineeName;
  byHeader[headerNameV1_(t, ['WHAT WENT WELL', 'WENT WELL'])] = clean_(a.wentWell);
  byHeader[headerNameV1_(t, ['WHAT WAS HARD', 'WAS HARD', 'WHAT WAS DIFFICULT'])] = clean_(a.wasHard);
  byHeader[headerNameV1_(t, ['WHAT I WANT TO WORK ON', 'WORK ON', 'GOALS'])] = clean_(a.workOn);
  delete byHeader[''];

  var row = t.headers.map(function (h) {
    var v = byHeader[String(h).toUpperCase()];
    return v === undefined ? '' : v;
  });
  t.sheet.appendRow(row);

  var ref = 'RF-' + String(t.sheet.getLastRow());
  forgetTabsV1_();
  auditV1_('REFLECTION FILED', viewer.email, ref);
  return { ref: ref, at: new Date().toString() };
}

/** The first of these headers the tab actually has, upper-cased, or ''. */
function headerNameV1_(t, headers) {
  for (var i = 0; i < headers.length; i++) {
    if (t.col[headers[i]] !== undefined) return headers[i];
  }
  return '';
}

/** Division STAGES a sign-off decision. A typed reason is required — there is
 *  no default wording, because a pre-filled reason is not a reason.
 *
 *  It stages. It does not record, and that is the whole point.
 *
 *  The tracker's recordDecisionForRowV20_1_ is the single writer to
 *  21 SKILL SIGN-OFF LOG, and it refuses any queue row whose RECORD STATUS is
 *  not OPEN. This function used to set RECORD STATUS to 'RECORDED' itself.
 *  The result was the worst of both: the approval never reached the sign-off
 *  log, so the skill was never actually signed off anywhere permanent — and
 *  the row was now shut against the only function that could have put it
 *  there. It also skipped that function's authority check, its evidence gate
 *  and its duplicate guard, every one of which exists because somebody
 *  decided a career decision needed them.
 *
 *  So this writes the four fields a decision is made of and leaves RECORD
 *  STATUS alone. The tracker records it — tick RECORD on the row, or run
 *  "Record pending decisions" from its menu. One writer, every gate, and the
 *  result is exactly as defensible as a decision typed into the sheet by
 *  hand, because that is now literally what it is. */
function approveSignoffV1(row, reason, requestId) {
  return stageSignoffDecisionV1_(row, reason, requestId, 'Approve sign-off');
}

/** Division stages a return — same gates as approve, different decision word.
 *  Typed reason required; the button on the page stays dead until it is filled. */
function returnSignoffV1(row, reason, requestId) {
  return stageSignoffDecisionV1_(row, reason, requestId, 'Return for more evidence');
}

function stageSignoffDecisionV1_(row, reason, requestId, decision) {
  requireWritableV1_('stage a sign-off decision');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) throw new Error('Only the Training Division may decide a sign-off.');
  var why = String(reason || '').trim();
  if (why.length < 8) throw new Error('Type why you are deciding this. It goes on the permanent record in your name.');

  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) throw new Error('No queue.');
  var r = requireLocalRowV1_(t, row, 'decide that sign-off');

  var need = ['DECISION', 'DECIDED BY', 'DECISION DATE', 'RATIONALE', 'RECORD STATUS'];
  var missing = [];
  need.forEach(function (h) { if (t.col[h] === undefined) missing.push(h); });
  if (missing.length) {
    throw new Error('The queue is missing ' + missing.join(', ') + '. Nothing was ' +
      'written. Fix the header row in the tracker first.');
  }

  var live = t.rows[r - t.firstDataRow] || [];
  var want = String(requestId == null ? '' : requestId).trim();
  var have = t.col['REQUEST ID'] === undefined ? ''
           : String(live[t.col['REQUEST ID']] || '').trim();
  if (want && have && want !== have) {
    throw new Error('That is not the row you were looking at any more — the queue moved ' +
      'underneath you. Nothing was written. Reload and try again.');
  }

  var status = String(live[t.col['RECORD STATUS']] || '').trim();
  if (status !== 'OPEN') {
    throw new Error('That row is ' + (status || 'blank') + ', not OPEN. Nothing was written.');
  }
  var already = String(live[t.col['DECISION']] || '').trim();
  if (already) {
    throw new Error('A decision is already staged on that row (' + already + '). Nothing ' +
      'was written. Record it in the tracker, or clear it there, first.');
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  t.sheet.getRange(r, t.col['DECISION'] + 1).setValue(decision);
  t.sheet.getRange(r, t.col['DECIDED BY'] + 1).setValue(viewer.email);
  t.sheet.getRange(r, t.col['DECISION DATE'] + 1).setValue(today);
  t.sheet.getRange(r, t.col['RATIONALE'] + 1).setValue(clean_(why));
  forgetTabsV1_();
  auditV1_('SIGN-OFF STAGED', viewer.email, decision + ' | row ' + r +
    (have ? ' | ' + have : '') + ' | ' + why.slice(0, 120));
  return 'Staged. The tracker records it.';
}

/** The Training Division records that it has seen a finding.
 *
 *  It does not clear it. Nothing here can, and that is the point: the
 *  doctrine's rule is that a finding is never blanked without the data
 *  changing or a named acknowledgment, so this is the named acknowledgment
 *  and it is all it is. A row is appended saying who saw what, when, in
 *  whose words, and for how long they are asking before it is raised again.
 *
 *  The finding is stored in the words it was shown in. "27 days since an
 *  evaluation" is not the same finding as "34 days since an evaluation", so
 *  acknowledging one cannot silence the other, and when the data moves the
 *  new state surfaces on its own without anybody remembering to look. */
function acknowledgeFindingV1(trainee, finding, note, days) {
  requireWritableV1_('acknowledge a finding');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may acknowledge a finding.');
  }
  var who = String(trainee || '').trim();
  var what = String(finding || '').trim();
  var why = String(note || '').trim();
  if (!who) throw new Error('No name was given.');
  if (!what) throw new Error('There is no finding on that person to acknowledge.');
  if (why.length < 8) {
    throw new Error('Say what you are doing about it. It goes on the record in your name, ' +
      'and an acknowledgment with nothing in it is how a problem gets buried.');
  }

  var made = ensureAckLogV1_();
  if (!made) {
    throw new Error('Could not open or create ' + PORTAL.TAB.ACKS + ', so nothing was ' +
      'recorded. Nothing is worth acknowledging into a log that is not there.');
  }
  var t = readTabV1_(PORTAL.TAB.ACKS);
  if (!t.ok) throw new Error('No acknowledgment log.');

  var n = ackDaysV1_(days);
  var until = new Date();
  until.setHours(0, 0, 0, 0);
  until.setDate(until.getDate() + n);

  var byHeader = { 'WHEN': new Date(), 'TRAINEE': clean_(who), 'FINDING': clean_(what),
                   'WHO': viewer.email, 'NOTE': clean_(why), 'HOLDS UNTIL': until };
  t.sheet.appendRow(t.headers.map(function (h) {
    var v = byHeader[String(h).toUpperCase()];
    return v === undefined ? '' : v;
  }));

  forgetTabsV1_();
  auditV1_('FINDING ACKNOWLEDGED', viewer.email,
    who + ' | ' + what + ' | ' + n + 'd | ' + why.slice(0, 120));
  return { until: until.toDateString(), days: n };
}

/** One person's whole record: the most recent submission of each kind, then
 *  every earlier one, in full. Read only in every mode — it opens nothing and
 *  writes nothing, so it is safe against the live tracker.
 *
 *  Authorisation is decided here, from the signed-in account. The browser
 *  sends a name; if the viewer is not entitled to that name's record, no
 *  record is built. A trainee asking for someone else gets a refusal, not a
 *  filtered version of the answer. */
function recordV1(traineeName) {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (!viewer.ok) throw new Error(viewer.why || 'This account is not recognised.');

  var name = String(traineeName || '').trim();
  if (!name) throw new Error('No name was given.');

  var scope = recordScopeV1_(viewer, name);
  if (!scope) throw new Error('You are not able to open that record.');

  var rec = recordForV1_(name, scope);
  rec.partial = scope.length < PORTAL_SOURCES.length;
  rec.scopeNote = rec.partial
    ? 'You are seeing only the parts of this record your role covers.' : '';
  auditV1_('RECORD OPENED', viewer.email, name + ' | ' + scope.join(','));
  return rec;
}

/** Refreshes the current role's payload without a page reload. */
function refreshV1() {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  return { viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
                     ok: viewer.ok, why: viewer.why },
           data: viewer.ok ? payloadForV1_(viewer) : {},
           mode: safeModeV1_() };
}

/** Blocks a leading = + - @ so submitted text cannot become a formula. */
function clean_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** The portal's own log. It is a WRITE, so it obeys the same rule everything
 *  else does: in PRODUCTION this portal puts nothing in the live book, not
 *  even a note about itself. Read paths call this too, which is exactly why
 *  the check has to be here and not only on the actions. */
function auditV1_(what, who, detail) {
  if (!mayWriteV1_()) return;
  try {
    var sh = targetBookV1_().getSheetByName(PORTAL.TAB.AUDIT);
    if (!sh) return;
    sh.appendRow([new Date(), what, who || '(unidentified)',
                  String(detail || '').slice(0, 400), PORTAL.VERSION]);
  } catch (e) {}
}
