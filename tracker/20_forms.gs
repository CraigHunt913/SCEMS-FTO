/**
 * SCEMS Field Training Tracker — 20_forms
 *
 * The nine forms: their ids, their dropdowns, their links.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Form estate management: stored-form access, level-safe choice sync,
 *   response destinations, and the authorized Handover Card.
 *   PRESERVATION RULES
 *   - Existing forms are updated in place. Nothing here creates a new form
 *   when a stored form with the expected title exists, and nothing here
 *   deletes a form or its response history.
 *   - Choice refresh is SCOPED: hub-wide forms receive the full active
 *   list; each level form receives only its own level's active trainees
 *   and only FTOs whose roster scope covers that level. No code path
 *   can write the full roster into a level form.
 */

/* Muscle-memory aliases. Same single implementations. */
function goLiveV19() { return goLive(); }

function backToTestModeV19() { return backToTestMode(); }

/* ---------------------------------------------------------------- *
 *  Stored form access
 * ---------------------------------------------------------------- */

/** Finds a stored form by exact title via the FORM_IDS property.
 *  Returns the Form or null. Never creates. (Effective single definition;
 *  name preserved from v19.) */
function getStoredFormV19_(title) {
  var ids = storedFormIdsV20_1_();
  for (var i = 0; i < ids.length; i++) {
    try {
      var f = FormApp.openById(ids[i]);
      if (String(f.getTitle() || '').trim() === title) return f;
    } catch (e) {}
  }
  return null;
}

/** Ensures a form's responses land in this spreadsheet. In-place, never
 *  recreates the form; existing response history is preserved by Forms. */
function ensureFormDestinationV20_1_(form) {
  try {
    if (form.getDestinationId && form.getDestinationId() === ss().getId()) return 'already linked';
  } catch (e) { /* no destination set */ }
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss().getId());
  return 'linked';
}

/* ---------------------------------------------------------------- *
 *  Level-safe choice sync
 * ---------------------------------------------------------------- */

/** Active trainees at one certification level (excludes closed/released,
 *  EXAMPLE, and — in live mode — ZZ TEST rows). */
function traineesAtLevelV20_1_(level) {
  return activeTraineesV20_1_()
    .filter(function (r) { return r.level === level; })
    .map(function (r) { return r.name; })
    .sort();
}

/** Active FTOs whose roster scope permits the level. */
function ftosForLevelV20_1_(level) {
  return rosterFtoRecordsV20_1_()
    .filter(function (f) { return f.active && ftoScopeAllowsV20_1_(f, level); })
    .map(function (f) { return f.name; })
    .sort();
}

function levelFormTitleV20_(level) {
  if (level === 'EMT') return FORM_TITLES.SKILLS_EMT;
  if (level === 'Advanced EMT') return FORM_TITLES.SKILLS_AEMT;
  if (level === 'Paramedic') return FORM_TITLES.SKILLS_PMD;
  return 'SCEMS Skills Quick Log : ' + level;
}

/** Updates ONE level form's Trainee and FTO choices in place. Grids and
 *  every other item are untouched (question changes are governance).
 *  Returns a report string. */
function syncOneLevelFormChoicesV20_1_(level) {
  var title = levelFormTitleV20_(level);
  var f = getStoredFormV19_(title);
  if (!f) return title + ' : NOT FOUND (not built or missing from FORM_IDS)';
  var trainees = traineesAtLevelV20_1_(level);
  var ftos = ftosForLevelV20_1_(level);
  var touched = [];
  f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
    var li = it.asListItem();
    var t = String(li.getTitle() || '').trim();
    if (t === 'Trainee') {
      li.setChoiceValues(trainees.length ? trainees : ['none at this level']);
      touched.push('Trainee(' + trainees.length + ')');
    }
    if (t === 'FTO name') {
      li.setChoiceValues(ftos.length ? ftos : ['none in scope']);
      touched.push('FTO(' + ftos.length + ')');
    }
  });
  return title + ' : ' + (touched.length ? touched.join(', ') : 'no list items found');
}

/** Syncs all three level forms. Safe to run any time. */
function syncLevelFormChoicesV20_1() {
  var report = SKILL_LEVELS_V20.map(syncOneLevelFormChoicesV20_1_);
  systemLog_('INFO', 'LEVEL FORM SYNC', report.join(' | '));
  Logger.log(report.join('\n'));
  return report.join('\n');
}

/** PUBLIC — name preserved (menu + syncNewTraineeV19_ call sites).
 *  Hub-wide forms get full ACTIVE lists; level forms are delegated to the
 *  scoped sync and are excluded from the generic pass. This is the v20.1
 *  fix for the full-roster-clobber defect. */
function refreshDropdowns() {
  var ids = storedFormIdsV20_1_();
  if (!ids.length) { Logger.log('No stored forms found.'); return 'No stored forms found.'; }
  var trainees = activeTraineesV20_1_().map(function (r) { return r.name; }).sort();
  var ftos = ftoList().sort();
  var levelTitles = SKILL_LEVELS_V20.map(levelFormTitleV20_);
  var skipTitles = levelTitles.concat([FORM_TITLES.HANDOVER]);
  var notes = [];
  ids.forEach(function (id) {
    var f;
    try { f = FormApp.openById(id); } catch (e) { notes.push(id + ' unreadable'); return; }
    var title = String(f.getTitle() || '').trim();
    if (skipTitles.indexOf(title) >= 0) return; // scoped forms are synced separately
    f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      var li = it.asListItem();
      var t = String(li.getTitle() || '').trim();
      if ((t === 'Trainee' || t === 'Trainee involved') && trainees.length) li.setChoiceValues(trainees);
      if (t === 'FTO name' && ftos.length) li.setChoiceValues(ftos);
      if (t === 'Trainee you are covering') li.setChoiceValues(trainees.length ? trainees : ['none']);
    });
    notes.push(title + ' refreshed');
  });
  var levelReport = syncLevelFormChoicesV20_1();
  var msg = 'Hub forms: ' + notes.join('; ') + '\nLevel forms:\n' + levelReport;
  systemLog_('INFO', 'ROSTER SYNC', 'active trainees ' + trainees.length + ', FTOs ' + ftos.length);
  Logger.log(msg);
  return msg;
}

/** READ-ONLY test: compares every form's choices against the master
 *  roster, lifecycle state, certification level, and FTO scope. */
function verifyLevelFormsV20_1() {
  var L = ['LEVEL FORM SCOPE CHECK — READ ONLY', ''];
  var problems = 0;
  SKILL_LEVELS_V20.forEach(function (level) {
    var title = levelFormTitleV20_(level);
    var f = getStoredFormV19_(title);
    L.push(title);
    if (!f) { L.push('   NOT FOUND'); problems++; L.push(''); return; }
    var expectedT = traineesAtLevelV20_1_(level);
    var expectedF = ftosForLevelV20_1_(level);
    var actualT = [], actualF = [];
    f.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      var li = it.asListItem();
      var t = String(li.getTitle() || '').trim();
      var choices = li.getChoices().map(function (c) { return c.getValue(); });
      if (t === 'Trainee') actualT = choices;
      if (t === 'FTO name') actualF = choices;
    });
    var extraT = actualT.filter(function (x) {
      return expectedT.indexOf(x) < 0 && x !== 'none at this level'; });
    var missT = expectedT.filter(function (x) { return actualT.indexOf(x) < 0; });
    var extraF = actualF.filter(function (x) {
      return expectedF.indexOf(x) < 0 && x !== 'none in scope'; });
    if (extraT.length) { problems++; L.push('   TRAINEES OUT OF SCOPE: ' + extraT.join(', ')); }
    if (missT.length) { problems++; L.push('   TRAINEES MISSING: ' + missT.join(', ')); }
    if (extraF.length) { problems++; L.push('   FTOs OUT OF SCOPE: ' + extraF.join(', ')); }
    if (!extraT.length && !missT.length && !extraF.length) L.push('   scope OK (' + actualT.length + ' trainees, ' + actualF.length + ' FTOs)');
    var accepting = '';
    try { accepting = String(f.isAcceptingResponses()); } catch (e) {}
    L.push('   accepting: ' + accepting);
    try {
      L.push('   destination: ' + (f.getDestinationId() === ss().getId() ? 'this spreadsheet' : 'OTHER/NONE'));
    } catch (e) { L.push('   destination: NONE — responses live only in Forms'); problems++; }
    L.push('');
  });
  L.push(problems ? problems + ' problem(s) found.' : 'All level forms in scope.');
  var msg = L.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Handover Card : authorized, roster-addressed, enumeration-safe
 * ---------------------------------------------------------------- */

/** PUBLIC HANDLER — name preserved; the existing form-bound trigger on
 *  the Handover form keeps firing.
 *
 *  v20.1 rules:
 *   1. The requester is the VERIFIED respondent email. If the form did
 *      not capture one, the request is denied and routed to the Training
 *      Division. A typed name is display data, never identity.
 *   2. The requester must resolve to an active FTO or approved leader on
 *      the allowlist (registry/roster email, or configured leadership).
 *   3. The card is delivered to the requester's ROSTER address — never to
 *      a respondent-entered address.
 *   4. The requester must be authorized for that trainee (scope check).
 *   5. A denial NEVER discloses whether the named trainee exists.
 *   6. Every request, grant, and denial is written to the access log. */
function onHandoverSubmitV19(e) {
  try {
    var vals = {};
    e.response.getItemResponses().forEach(function (r) {
      vals[r.getItem().getTitle()] = String(r.getResponse() || '').trim();
    });
    var claimedName = vals['Your name'] || '(not given)';
    var traineeName = vals['Trainee you are covering'] || '';
    var reason = vals['Reason'] || 'not given';
    var verifiedEmail = '';
    try { verifiedEmail = String(e.response.getRespondentEmail() || '').trim().toLowerCase(); } catch (err) {}

    var accessId = newIdV20_1_('AC');
    function logAccess(authorized, deliveredTo, detail) {
      try {
        appendRowsHeaderMappedV20_1_(TAB.ACCESS, 4, [{
          'ACCESS ID': accessId, 'TIMESTAMP': new Date(), 'KIND': 'HANDOVER CARD',
          'REQUESTED BY': claimedName, 'VERIFIED EMAIL': verifiedEmail || '(none)',
          'AUTHORIZED': authorized ? 'YES' : 'NO', 'SUBJECT': traineeName,
          'DELIVERED TO': deliveredTo || '', 'REASON': reason, 'DETAIL': detail || ''
        }], ['ACCESS ID']);
      } catch (e2) {
        systemLog_('WARN', 'ACCESS LOG UNAVAILABLE', accessId + ' | ' + (detail || ''));
      }
    }
    function denyToDivision(why) {
      logAccess(false, '', why);
      sendMail(CONFIG.TCO_EMAIL,
        'Handover request needs review : ' + accessId,
        'A handover card request could not be authorized automatically.\n\n' +
        'Requested by (typed) : ' + claimedName + '\n' +
        'Verified email       : ' + (verifiedEmail || 'NONE — form did not verify identity') + '\n' +
        'Reason given         : ' + reason + '\n' +
        'Review code          : ' + accessId + '\n\n' +
        'No trainee information was sent to anyone. If this request is\n' +
        'legitimate, send the card from the tracker after confirming identity.\n' +
        '(The requested trainee name is withheld from this notice on purpose;\n' +
        'it is recorded in the access log under the review code.)');
      systemLog_('WARN', 'HANDOVER DENIED', accessId + ' | ' + why);
    }

    if (!verifiedEmail || !isValidEmailV20_1_(verifiedEmail)) {
      denyToDivision('no verified respondent email on the submission');
      return;
    }
    var actor = resolveAuthorizedActorV20_1_(verifiedEmail);
    var allowedRole = actor.ok && (actor.roles.indexOf('FTO') >= 0 ||
      actor.roles.indexOf('PROGRAM_DIRECTOR') >= 0 ||
      actor.roles.indexOf('TRAINING_DIVISION') >= 0 ||
      actor.roles.indexOf('COMMAND') >= 0 ||
      actor.roles.indexOf('MEDICAL_DIRECTOR') >= 0);
    if (!allowedRole) {
      denyToDivision('verified email is not on the FTO/leadership allowlist');
      return;
    }

    var resolved = resolveTraineeV20_1_(traineeName);
    var mayView = resolved.ok && actorMayViewTraineeV20_1_(actor, resolved.record);
    if (!resolved.ok || !mayView) {
      // Uniform response: requester learns nothing about who exists.
      var rosterEmail = (actor.person && actor.person.email) || verifiedEmail;
      sendMail(rosterEmail,
        'Handover Card request received : ' + accessId,
        'Your handover card request (' + accessId + ') could not be completed\n' +
        'automatically and has been routed to the Training Division for review.\n\n' +
        'If this is urgent, contact the Division Chief of Training directly.');
      denyToDivision(resolved.ok ? 'requester not authorized for this trainee'
                                 : 'trainee selection did not resolve (' + resolved.reason + ')');
      return;
    }

    var deliverTo = (actor.person && actor.person.email) ? actor.person.email : verifiedEmail;
    var html = handoverHtmlV19_(resolved.record.name, actor.person ? actor.person.name : claimedName, reason);
    if (!html) {
      denyToDivision('card build failed for a resolved trainee — investigate');
      return;
    }
    var opts = { to: '', subject: 'Handover Card : ' + resolved.record.name,
                 htmlBody: html, name: 'SCEMS Field Training' };
    var blob = badgeBlobV19_();
    if (blob) opts.inlineImages = { scemsbadge: blob };
    if (isTestMode_()) {
      opts.to = CONFIG.TEST_INBOX;
      opts.subject = '[TEST MODE] ' + opts.subject;
    } else {
      opts.to = deliverTo;
    }
    MailApp.sendEmail(opts);
    logAccess(true, deliverTo, 'card delivered');
    sendMail(CONFIG.TCO_EMAIL,
      'Handover Card issued : ' + resolved.record.name + ' to ' + (actor.person ? actor.person.name : verifiedEmail),
      'Access record ' + accessId + '. Verified requester: ' + verifiedEmail + '\n' +
      'Reason: ' + reason + '\nDelivered to the roster address on file.\n\n' +
      'This is a record access notice, not an action item.');
    systemLog_('INFO', 'HANDOVER CARD ISSUED', accessId + ' | ' + resolved.record.name + ' → roster address');
  } catch (err) {
    systemLog_('ERROR', 'HANDOVER SUBMIT FAILED', String(err));
  }
}

/** Ensures the Handover form verifies respondent identity: login required
 *  within the domain OR verified collected email. Updates IN PLACE.
 *  Reports what it changed; never recreates the form. */
function hardenHandoverFormV20_1() {
  var f = getStoredFormV19_(FORM_TITLES.HANDOVER);
  if (!f) return 'Handover form not found in FORM_IDS.';
  var notes = [];
  try {
    f.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
    notes.push('email collection: VERIFIED');
  } catch (e) {
    try { f.setCollectEmail(true); notes.push('email collection: enabled (verify type manually in Form settings)'); }
    catch (e2) { notes.push('email collection could NOT be set by script — set "Collect email addresses: Verified" in the Form UI'); }
  }
  try { ensureFormDestinationV20_1_(f); notes.push('destination: this spreadsheet'); } catch (e3) {
    notes.push('destination not set: ' + e3);
  }
  var msg = 'HANDOVER FORM HARDENING\n' + notes.join('\n');
  systemLog_('INFO', 'HANDOVER FORM HARDENED', notes.join(' | '));
  Logger.log(msg);
  return msg;
}

/** Ensures the three level forms verify identity and deliver responses to
 *  this spreadsheet. In place; never recreates. */
function hardenLevelFormsV20_1() {
  var L = [];
  SKILL_LEVELS_V20.forEach(function (level) {
    var f = getStoredFormV19_(levelFormTitleV20_(level));
    if (!f) { L.push(level + ': NOT FOUND'); return; }
    var notes = [];
    try { f.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED); notes.push('verified email ON'); }
    catch (e) {
      try { f.setCollectEmail(true); notes.push('email collection ON (set Verified in UI)'); }
      catch (e2) { notes.push('set "Collect email: Verified" manually'); }
    }
    try { notes.push('destination ' + ensureFormDestinationV20_1_(f)); }
    catch (e3) { notes.push('destination failed: ' + e3); }
    L.push(level + ': ' + notes.join(', '));
  });
  var msg = L.join('\n');
  systemLog_('INFO', 'LEVEL FORMS HARDENED', msg.slice(0, 400));
  Logger.log(msg);
  return msg;
}
