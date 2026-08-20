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
  var raw = String(props.getProperty(PORTAL_PROD_ID_PROPERTY) || '').trim();
  if (!raw) {
    throw new Error('Set the script property ' + PORTAL_PROD_ID_PROPERTY +
      ' to the live tracker first. Project Settings > Script Properties > ' +
      'Add script property. Paste the whole address of the spreadsheet if you ' +
      'like; the id is picked out of it. This function will not guess which ' +
      'spreadsheet you mean.');
  }
  // Paste the address bar, paste the id, paste the bit in between - all fine.
  var id = spreadsheetIdFromV1_(raw);
  if (!id) {
    throw new Error('There is no spreadsheet id in "' + raw + '". Open the ' +
      'tracker and copy its address out of the address bar, then put that in ' +
      PORTAL_PROD_ID_PROPERTY + '. Nothing was changed.');
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

/** Switch the real tracker on.
 *
 *  PRODUCTION shows people their records and refuses every action. That is
 *  the right place to start and the wrong place to stop: a portal nobody can
 *  do anything in is a spreadsheet with a nicer font.
 *
 *  This opens exactly three things, and only for the person entitled to each:
 *  a trainee acknowledging their own coaching note, a trainee filing their
 *  own reflection, and the Training Division approving a sign-off with a
 *  typed reason. Every one still checks the role, still refuses a row that
 *  lives in another spreadsheet, and now writes to the audit log - which
 *  PRODUCTION mode was silently discarding.
 *
 *  It refuses if going live would only mean a live empty portal. */
function goLive() {
  var props = PropertiesService.getScriptProperties();
  var mode = safeModeV1_();

  var id = '';
  try { id = targetIdV1_(); } catch (e) {
    throw new Error('This portal is not pointed at anything yet. Run START. ' +
      'Nothing was changed.');
  }
  if (mode === PORTAL.MODE_STAGING) {
    throw new Error('This portal is pointed at the practice spreadsheet, not ' +
      'your tracker. Writes already work here. Run pointAtProductionReadOnly() ' +
      'first, look at what it can see, then run goLive(). Nothing was changed.');
  }
  if (mode === PORTAL.MODE_LIVE) {
    return noteV1_('Already live.\n\nSpreadsheet : ' + safeTargetNameV1_() +
      '\n\nRun goReadOnly() to put it back to look-but-do-not-touch.');
  }

  // Refuse to go live into a portal nobody can use.
  var stop = [];
  var missing = [];
  Object.keys(PORTAL.TAB).forEach(function (k) {
    var tn = PORTAL.TAB[k];
    if (tn === PORTAL.TAB.COACHING || tn === PORTAL.TAB.AUDIT) return;
    if (!readTabV1_(tn).ok) missing.push(tn);
  });
  if (missing.length) {
    stop.push(missing.length + ' tab(s) the portal reads are not in this ' +
      'spreadsheet: ' + missing.join(', '));
  }

  var canSignIn = 0;
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      if (p.email.indexOf('@') > 0) canSignIn++; });
  } catch (e) {}
  if (!canSignIn) {
    stop.push('nobody on the roster has an address, so no training officer ' +
      'could be recognised');
  }

  if (stop.length) {
    throw new Error('Not going live yet.\n\n  ' + stop.join('\n  ') +
      '\n\nRun START; it names the one thing to do about it. Nothing was changed.');
  }

  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_LIVE);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  auditV1_('MODE', whoIsAskingV1_(), 'PRODUCTION -> LIVE');

  var trainees = 0;
  try { trainees = traineesV1_().filter(function (t) { return !t.closed; }).length; } catch (e) {}

  return noteV1_([
    'LIVE.',
    '',
    'Spreadsheet : ' + safeTargetNameV1_(),
    'Signed in   : ' + (whoIsAskingV1_() || 'Google is not naming this account'),
    '',
    canSignIn + ' training officer(s) and ' + trainees + ' active trainee(s) can be recognised.',
    '',
    'WHAT JUST BECAME POSSIBLE',
    '  A trainee can acknowledge their own coaching note.',
    '  A trainee can file their own reflection.',
    '  The Training Division can approve a sign-off, with a typed reason.',
    '  Every one of those is written to ' + PORTAL.TAB.AUDIT + ' under the name',
    '  of whoever did it. PRODUCTION mode was throwing those entries away.',
    '',
    'WHAT DID NOT',
    '  Importing, merging and switching role. Those only ever run against the',
    '  practice spreadsheet, whatever mode this is in.',
    '  Nothing bulk. Nothing structural. No row in another spreadsheet.',
    '',
    'NOW DEPLOY',
    '  Deploy > Manage deployments > pencil > Version: New version > Deploy',
    '  A deployment serves the code as it was when you deployed it, so this',
    '  switch does not reach the people using the link until you do that.',
    '',
    'To step back at any time: goReadOnly()'
  ].join('\n'));
}

/** Back to look-but-do-not-touch, on the same spreadsheet. */
function goReadOnly() {
  var props = PropertiesService.getScriptProperties();
  if (safeModeV1_() === PORTAL.MODE_STAGING) {
    return noteV1_('This portal is on the practice spreadsheet. Nothing here ' +
      'is anybody\'s record, so there is nothing to protect. Run ' +
      'pointAtProductionReadOnly() to look at the real one.');
  }
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_PRODUCTION);
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  return noteV1_('READ ONLY again.\n\nSpreadsheet : ' + safeTargetNameV1_() +
    '\n\nPeople can still see their records. Acknowledging coaching, filing a ' +
    'reflection and approving a sign-off all refuse again.\n\nDeploy a new ' +
    'version for this to reach the people using the link.');
}

/** Go back to the sandbox. */
function pointAtStaging() {
  var props = PropertiesService.getScriptProperties();
  var id = spreadsheetIdFromV1_(props.getProperty('PORTAL_STAGING_SPREADSHEET_ID'));
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
  // COACHING and AUDIT are the portal's own, not part of the tracker. Against
  // a live book it cannot create them and does not try. Reporting them as
  // "missing" alongside a real source tab reads as breakage when it is not.
  var optional = [PORTAL.TAB.COACHING, PORTAL.TAB.AUDIT];
  var missing = [], absentOptional = [];
  Object.keys(PORTAL.TAB).forEach(function (k) {
    var name = PORTAL.TAB[k];
    var t = readTabV1_(name);
    if (!t.ok) {
      if (optional.indexOf(name) >= 0) { absentOptional.push(name); say('  not made ' + name + '  (optional)'); }
      else { missing.push(name); say('  MISSING  ' + name); }
      return;
    }
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

  say('WHAT TO DO');
  if (missing.length) {
    say('  ' + missing.length + ' source tab(s) are not in this spreadsheet:');
    missing.forEach(function (n) { say('    ' + n); });
    say('  The screens that use them will be empty.');
  } else {
    say('  Every source tab is present.');
  }
  if (absentOptional.length) {
    say('  ' + absentOptional.join(' and ') + ' have not been made. They are the');
    say('  portal\'s own and it will not create them in a live spreadsheet.');
    say('  Coaching notes have nowhere to live until one exists; nothing else');
    say('  depends on them.');
  }

  var noEmail = 0, retiredCount = 0;
  try {
    rosterPeopleV1_().forEach(function (p) {
      if (!p.active) { retiredCount++; return; }
      if (p.email.indexOf('@') < 1) noEmail++;
    });
  } catch (e) {}
  if (retiredCount) {
    say('  ' + retiredCount + ' on the roster are marked as no longer here. They keep ' +
        'their');
    say('  history, they are not counted below, and they cannot sign in.');
  }
  if (noEmail) {
    say('  ' + noEmail + ' on the roster have no address, so none of them can sign');
    say('  in. Run suggestFtoEmails() to see the accounts they have actually');
    say('  been submitting from.');
  }

  try {
    var stray = formResponseTabsV1_().reduce(function (n, t) { return n + t.rows.length; }, 0);
    if (stray) {
      say('  ' + stray + ' form response(s) are sitting in response tabs in this');
      say('  spreadsheet, never turned into rows in the logs. Run');
      say('  unprocessedResponses() to see them.');
    }
  } catch (e) {}

  return noteV1_(lines.join('\n'));
}

/** Where is this portal pointed and what can it do. Safe to run any time. */
function whereAmI() { return portalStatusV1(); }

/** Every setting this portal reads, what it holds, and what it means.
 *
 *  There are several properties now and two of them take a spreadsheet
 *  address, pointing in opposite directions - one is read from, one is
 *  written to. This is the screen that makes that visible instead of leaving
 *  it to be remembered. Read only. */
function showSettings() {
  var props = PropertiesService.getScriptProperties();
  function get(k) { return String(props.getProperty(k) || ''); }
  function nameOf(id) {
    if (!id) return '';
    try { return SpreadsheetApp.openById(id).getName(); } catch (e) { return '(cannot open)'; }
  }

  var target = '';
  try { target = targetIdV1_(); } catch (e) { target = ''; }

  var lines = ['PORTAL SETTINGS  (read only)', '',
    'Version : ' + PORTAL.VERSION +
      (typeof PORTAL_BUILD === 'string' ? '   build ' + PORTAL_BUILD : ''),
    'Signed in : ' + (whoIsAskingV1_() || 'Google is not naming this account'),
    '', '--- WHERE IT IS POINTED ---', ''];

  lines.push('Reads and writes : ' + (target || 'NOT SET'));
  lines.push('                   ' + (target ? nameOf(target) : ''));
  lines.push('Mode             : ' + safeModeV1_() +
    (mayWriteV1_() ? '   writes allowed' : '   READ ONLY'));
  lines.push('');

  var prod = spreadsheetIdFromV1_(get(PORTAL_PROD_ID_PROPERTY));
  lines.push(PORTAL_PROD_ID_PROPERTY);
  lines.push('  ' + (prod || '(not set)') + (prod ? '   ' + nameOf(prod) : ''));
  lines.push('  The live tracker. pointAtProductionReadOnly() points here.');
  lines.push('');

  var stg = spreadsheetIdFromV1_(get('PORTAL_STAGING_SPREADSHEET_ID'));
  lines.push('PORTAL_STAGING_SPREADSHEET_ID');
  lines.push('  ' + (stg || '(not set)') + (stg ? '   ' + nameOf(stg) : ''));
  lines.push('  The practice sandbox. pointAtStaging() goes back to it.');
  lines.push('');

  lines.push('--- THE OTHER SPREADSHEETS, READ FROM ---');
  lines.push('');
  lines.push(PORTAL_OTHER_IDS_PROPERTY);
  var others = [];
  try { others = otherBookIdsV1_(); } catch (e) { others = []; }
  if (!others.length) lines.push('  (none listed)');
  others.forEach(function (id) { lines.push('  ' + id + '   ' + nameOf(id)); });
  lines.push('  Opened read only. Never written to.');
  lines.push('');

  lines.push('--- THE WRITE GATE ---');
  lines.push('');
  var confirm = spreadsheetIdFromV1_(get(PORTAL_BACKFILL_CONFIRM));
  lines.push(PORTAL_BACKFILL_CONFIRM);
  if (!confirm) {
    lines.push('  (not set)   nothing can be written');
  } else if (confirm === target) {
    lines.push('  ' + confirm + '   ' + nameOf(confirm));
    lines.push('  MATCHES the spreadsheet above. Writing is unlocked.');
  } else {
    lines.push('  ' + confirm + '   ' + nameOf(confirm));
    lines.push('  DOES NOT MATCH. This names ' +
      (others.indexOf(confirm) >= 0 ? 'a spreadsheet being read from' : 'a different spreadsheet') +
      ',');
    lines.push('  and the gate wants the one being written to: ' + (target || 'NOT SET'));
  }
  lines.push('');

  lines.push('--- PEOPLE AND LINKS ---');
  lines.push('');
  lines.push('Training division : ' + (get('PORTAL_DIVISION_EMAILS') || '(none set)'));
  lines.push('Medical director  : ' + (get('PORTAL_MEDICAL_EMAILS') || '(none set)'));
  lines.push('Supervisors       : ' + (get('PORTAL_SUPERVISORS') || '(none set)'));
  var live = false;
  try { live = formLinksLiveV1_(); } catch (e) {}
  lines.push('Form links        : ' + (live ? 'LIVE' : 'OFF'));

  return noteV1_(lines.join('\n'));
}
