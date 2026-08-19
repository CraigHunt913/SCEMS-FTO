/**
 * Pointing the portal at the live tracker.
 *
 * The architecture this file makes possible, stated plainly:
 *
 *   The forms write. The portal reads.
 *
 * Nothing in the live system changes to bring this portal online. The nine
 * forms keep their triggers, keep their destinations, and keep writing to the
 * same tabs they always have. The portal opens that spreadsheet READ ONLY,
 * shows each person only their own part of it, and hands them the one form
 * their situation calls for. Every write path in this project checks
 * mayWriteV1_() first and refuses in PRODUCTION mode, so there is no code path
 * from this portal to a live record.
 *
 * Pointing at production is deliberately a two-step act. You set the id by
 * hand in Project Settings, then run the function. Neither step happens by
 * default and neither happens by accident.
 */

var PORTAL_PROD_ID_PROPERTY = 'PORTAL_PRODUCTION_SPREADSHEET_ID';

/** Read the live tracker, write nothing.
 *
 *  Before this will run you must add, in Project Settings > Script Properties:
 *    PORTAL_PRODUCTION_SPREADSHEET_ID = the live tracker's id
 *  It is not stored in this file, so a copy of this code cannot reach your
 *  production data on its own. */
function pointAtProductionReadOnly() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(PORTAL_PROD_ID_PROPERTY) || '').trim();
  if (!id) {
    throw new Error('Set the script property ' + PORTAL_PROD_ID_PROPERTY +
      ' to the live tracker id first. Project Settings > Script Properties > ' +
      'Add script property. This function will not guess which spreadsheet ' +
      'you mean.');
  }

  var name = '';
  try { name = SpreadsheetApp.openById(id).getName(); }
  catch (e) {
    throw new Error('Cannot open ' + id + ' — ' + (e.message || e) +
      '. Nothing was changed.');
  }

  var previous = props.getProperty(PORTAL.PROPERTY_TARGET) || '(none)';
  props.setProperty(PORTAL.PROPERTY_TARGET, id);
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_PRODUCTION);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();

  return noteV1_('POINTED AT PRODUCTION, READ ONLY\n\n' +
    'Spreadsheet : ' + name + '\n' +
    'Was pointed at: ' + previous + '\n\n' +
    'Mode is now PRODUCTION. Every write in this portal refuses in this mode:\n' +
    '  approving a sign-off, filing a reflection, acknowledging coaching,\n' +
    '  switching role for testing.\n' +
    'The forms are unaffected and remain the way anything gets written.\n\n' +
    'Run productionReadinessCheck() next to see what the portal can and\n' +
    'cannot find before you send anyone the link.');
}

/** Go back to the sandbox. */
function pointAtStaging() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('PORTAL_STAGING_SPREADSHEET_ID') || '').trim();
  if (!id) {
    throw new Error('No staging sandbox is remembered. Run setUpStaging() to ' +
      'build a fresh one.');
  }
  props.setProperty(PORTAL.PROPERTY_TARGET, id);
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  return noteV1_('Back on the staging sandbox. Writes are allowed again.');
}

/** A read-only report on whether the portal can serve the target it is
 *  pointed at. It opens tabs and forms and reports. It changes nothing. */
function productionReadinessCheck() {
  var lines = [];
  function say(s) { lines.push(s); }

  var id = '';
  try { id = targetIdV1_(); } catch (e) { return noteV1_('Not pointed anywhere yet. ' + (e.message || e)); }

  var book = null, bookName = '';
  try { book = SpreadsheetApp.openById(id); bookName = book.getName(); }
  catch (e) { return noteV1_('Cannot open ' + id + ' — ' + (e.message || e)); }

  say('READINESS CHECK  (read only, nothing was changed)');
  say('');
  say('Target : ' + bookName);
  say('Mode   : ' + safeModeV1_() + (mayWriteV1_() ? '  WRITES ALLOWED' : '  read only'));
  say('You    : ' + (whoIsAskingV1_() || 'Google is not naming this account'));
  say('');

  say('TABS');
  var missing = [];
  Object.keys(PORTAL.TAB).forEach(function (k) {
    var name = PORTAL.TAB[k];
    var t = readTabV1_(name);
    if (!t.ok) { missing.push(name); say('  missing  ' + name); return; }
    say('  ok       ' + name + '  (' + t.rows.length + ' rows, ' +
        t.headers.filter(String).length + ' named columns)');
  });
  say('');

  say('PEOPLE');
  try {
    PEOPLE_CACHE_V1 = null;
    forgetTabsV1_();
    var p = portalPeopleV1_();
    say('  training division : ' + (p.division.length || 'none set'));
    say('  medical director  : ' + (p.medical.length || 'none set'));
    say('  supervisors       : ' + (Object.keys(p.supervisors).length || 'none set'));
    say('  FTOs on roster    : ' + Object.keys(p.ftos).length);
    say('  trainees with email: ' + Object.keys(p.trainees).length);
    var me = resolveViewerV1_(whoIsAskingV1_());
    say('  you resolve to    : ' + me.role + (me.ok ? '' : '  (' + me.why + ')'));
  } catch (e) { say('  could not resolve people: ' + (e.message || e)); }
  say('');

  say('TRAINEES WITHOUT AN EMAIL  (they cannot sign in)');
  try {
    var noEmail = traineesV1_().filter(function (t) { return !t.closed && !t.email; });
    if (!noEmail.length) say('  none');
    noEmail.forEach(function (t) { say('  ' + t.name); });
  } catch (e) { say('  could not read the master: ' + (e.message || e)); }
  say('');

  say('FORMS');
  say('  links are ' + (formLinksLiveV1_() ? 'LIVE' : 'OFF'));
  PORTAL_FORMS.forEach(function (f) {
    var line = '  ' + (f.retired ? 'RETIRED  ' : 'ok       ') + f.key;
    var dest = '';
    try { dest = String(FormApp.openById(f.id).getDestinationId() || ''); } catch (e) { dest = '?'; }
    if (dest === '?') line += '  (could not read)';
    else if (!dest) line += '  NO RESPONSE DESTINATION';
    else if (dest !== id) line += '  writes to a DIFFERENT spreadsheet';
    else line += '  writes here';
    if (f.retired) line += '  — ' + f.retiredWhy;
    say(line);
  });
  say('');

  if (missing.length) {
    say('WHAT TO DO');
    say('  ' + missing.length + ' tab(s) the portal expects are not in this ' +
        'spreadsheet. The screens that use them will be empty. Nothing is ' +
        'broken; they simply have no source.');
  } else {
    say('WHAT TO DO');
    say('  Every tab the portal expects is present. Deploy, open the URL, and');
    say('  check that you see the view your role should see.');
  }

  return noteV1_(lines.join('\n'));
}

/** Where is this portal pointed and what can it do. Safe to run any time. */
function whereAmI() { return portalStatusV1(); }
