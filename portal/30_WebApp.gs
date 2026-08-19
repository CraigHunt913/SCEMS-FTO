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
    viewer = resolveViewerV1_(whoIsAskingV1_());
    payload = viewer.ok ? payloadForV1_(viewer) : {};
  } catch (ex) {
    viewer = { email: '', role: PORTAL.ROLE.NONE, name: '', ok: false, why: String(ex.message || ex) };
    payload = {};
    err = String(ex.message || ex);
  }

  var boot = {
    version: PORTAL.VERSION,
    mode: safeModeV1_(),
    viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
              ok: viewer.ok, why: viewer.why },
    data: payload,
    error: err
  };

  var t = portalTemplateV1_();
  t.boot = JSON.stringify(boot);
  // XFrameOptionsMode has exactly two members: DEFAULT and ALLOWALL. DEFAULT
  // is the protective one - Google sends X-Frame-Options: SAMEORIGIN, so no
  // other site can frame this page. There is no DENY; asking for one yields
  // undefined and Apps Script rejects it as a null mode.
  return t.evaluate()
    .setTitle(PORTAL.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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

/** Trainee acknowledges a coaching note. */
function ackCoachingV1(row) {
  requireWritableV1_('acknowledge a coaching note');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only the trainee may acknowledge their own coaching.');
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) throw new Error('No coaching log.');
  var r = Number(row);
  var idx = r - t.firstDataRow;
  if (idx < 0 || idx >= t.rows.length) throw new Error('That coaching note does not exist.');
  if (normNameV1_(t.rows[idx][t.col['TRAINEE']]) !== normNameV1_(viewer.traineeName)) {
    throw new Error('That coaching note belongs to someone else.');
  }
  t.sheet.getRange(r, t.col['ACKNOWLEDGED'] + 1).setValue('YES');
  forgetTabsV1_();
  auditV1_('COACHING ACKNOWLEDGED', viewer.email, 'row ' + r);
  return 'Acknowledged.';
}

/** Trainee files a reflection. */
function submitReflectionV1(answers) {
  requireWritableV1_('file a reflection');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.TRAINEE) throw new Error('Only a trainee may file a reflection.');
  var a = answers || {};
  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.REFLECT);
  if (!sh) throw new Error('No reflection log.');
  sh.appendRow([new Date(), viewer.traineeName,
                clean_(a.wentWell), clean_(a.wasHard), clean_(a.workOn)]);
  var ref = 'RF-' + String(sh.getLastRow());
  forgetTabsV1_();
  auditV1_('REFLECTION FILED', viewer.email, ref);
  return { ref: ref, at: new Date().toString() };
}

/** Division approves a sign-off. A typed reason is required — there is no
 *  default wording, because a pre-filled reason is not a reason. */
function approveSignoffV1(row, reason) {
  requireWritableV1_('approve a sign-off');
  var viewer = resolveViewerV1_(whoIsAskingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) throw new Error('Only the Training Division may approve a sign-off.');
  var why = String(reason || '').trim();
  if (why.length < 8) throw new Error('Type why you are approving this. It goes on the permanent record in your name.');
  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) throw new Error('No queue.');
  var r = Number(row);
  if (t.col['DECISION'] === undefined) throw new Error('Queue is missing its DECISION column.');
  t.sheet.getRange(r, t.col['DECISION'] + 1).setValue('Approve sign-off');
  t.sheet.getRange(r, t.col['DECIDED BY'] + 1).setValue(viewer.email);
  t.sheet.getRange(r, t.col['DECISION DATE'] + 1).setValue(new Date());
  t.sheet.getRange(r, t.col['RATIONALE'] + 1).setValue(clean_(why));
  t.sheet.getRange(r, t.col['RECORD STATUS'] + 1).setValue('RECORDED');
  forgetTabsV1_();
  auditV1_('SIGN-OFF APPROVED', viewer.email, 'row ' + r + ' | ' + why.slice(0, 120));
  return 'Recorded.';
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
  var viewer = resolveViewerV1_(whoIsAskingV1_());
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
  var viewer = resolveViewerV1_(whoIsAskingV1_());
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
