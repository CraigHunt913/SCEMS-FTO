/**
 * START.
 *
 * One function. Run it, read it, do the one thing it says.
 *
 * Everything else in this project is a tool. This is the only thing anyone
 * should have to remember, and it exists because a Run dropdown with thirty
 * function names in it is not a user interface - it is a list of my internals
 * handed to somebody else to sort out.
 *
 * It looks at where the portal is pointed and what state the tracker is in,
 * and answers three questions in order:
 *
 *   Where am I
 *   What is stopping this from working
 *   What do I run next
 *
 * It writes nothing. Ever. It only ever tells you what to run.
 */

function START() {
  var L = [];
  function say(s) { L.push(s === undefined ? '' : s); }
  function rule() { say('---------------------------------------------------------'); }

  say('SCEMS FIELD TRAINING PORTAL');
  say(PORTAL.VERSION + (typeof PORTAL_BUILD === 'string' ? '   build ' + PORTAL_BUILD : ''));
  rule();
  say();

  /* ---- where am I ---- */

  var id = '';
  try { id = targetIdV1_(); } catch (e) { id = ''; }

  if (!id) {
    say('THE PORTAL IS NOT POINTED AT ANYTHING YET.');
    say();
    say('DO THIS NEXT');
    say('  Run  setUpStaging');
    say();
    say('It builds a practice spreadsheet with made-up people in it and points');
    say('the portal there. Nothing of yours is opened. When you have had a look');
    say('at it, run START again and it will tell you how to go live.');
    return noteV1_(L.join('\n'));
  }

  var name = '(cannot open it)';
  try { name = targetBookV1_().getName(); } catch (e) {}
  var live = safeModeV1_() === PORTAL.MODE_PRODUCTION;

  say('READING   ' + name);
  say('MODE      ' + safeModeV1_() + (live ? '   your real records, read only' : '   practice data'));
  say('YOU       ' + (whoIsAskingV1_() || 'Google is not naming this account'));

  var others = [];
  try { others = otherBookIdsV1_(); } catch (e) {}
  if (others.length) {
    say('ALSO      ' + others.length + ' other spreadsheet' + (others.length === 1 ? '' : 's') +
        ', read as well');
  }
  say();

  /* ---- what is stopping this from working ---- */

  var todo = [];      // { what, run, why }
  var good = [];

  // tabs
  var missingTabs = [];
  Object.keys(PORTAL.TAB).forEach(function (k) {
    var tn = PORTAL.TAB[k];
    if (tn === PORTAL.TAB.COACHING || tn === PORTAL.TAB.AUDIT) return;
    if (!readTabV1_(tn).ok) missingTabs.push(tn);
  });
  if (missingTabs.length) {
    todo.push({ what: missingTabs.length + ' tab(s) the portal reads are not here',
      run: 'productionReadinessCheck',
      why: 'It names them. The screens that use them will be empty.' });
  } else {
    good.push('every tab it reads is here');
  }

  // the roster: this is what stops FTOs using it at all
  var noAddress = [], onRoster = 0;
  try {
    var ros = readTabV1_(PORTAL.TAB.ROSTER);
    if (ros.ok) {
      ros.rows.forEach(function (r) {
        var nm = String(pickV1_(ros, r, ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'])).trim();
        var em = String(pickV1_(ros, r, ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'])).trim();
        if (!nm) return;
        onRoster++;
        if (em.indexOf('@') < 1) noAddress.push(nm);
      });
    }
  } catch (e) {}

  if (noAddress.length) {
    var ready = 0;
    try { ready = rosterEmailPlanV1_().set.length; } catch (e) { ready = 0; }
    if (ready) {
      todo.push({ what: noAddress.length + ' of ' + onRoster + ' training officers cannot sign in',
        run: 'applyRosterEmails',
        why: ready + ' address(es) are ready to go in. It fills only empty cells, ' +
             'matches by name, and undoRosterEmails puts it back.' });
    } else {
      todo.push({ what: noAddress.length + ' of ' + onRoster + ' training officers cannot sign in',
        run: 'suggestFtoEmails',
        why: 'Their EMAIL column is blank, so the portal cannot recognise them. ' +
             'This shows the accounts they have been submitting forms from.' });
    }
  } else if (onRoster) {
    good.push('all ' + onRoster + ' training officers can sign in');
  }

  // trainees
  try {
    var noMail = traineesV1_().filter(function (t) { return !t.closed && !t.email; });
    if (noMail.length) {
      todo.push({ what: noMail.length + ' trainee(s) have no email address',
        run: 'productionReadinessCheck',
        why: 'They cannot open their own record until one is on the master.' });
    } else {
      good.push('every active trainee can sign in');
    }
  } catch (e) {}

  // responses sitting unread
  try {
    var stray = formResponseTabsV1_().reduce(function (n, t) { return n + t.rows.length; }, 0);
    if (stray) {
      todo.push({ what: stray + ' form response(s) are in this spreadsheet but not in the logs',
        run: 'unprocessedResponses',
        why: 'They arrived and nothing turned them into rows. Nothing is lost.' });
    }
  } catch (e) {}

  // duplicates
  try {
    var dupes = duplicateSubmissionsV1_();
    if (dupes.length) {
      todo.push({ what: dupes.length + ' place(s) where two submissions landed the same day',
        run: 'duplicateSubmissionsReport',
        why: 'Both are kept and both are shown. Somebody has to say which stands.' });
    }
  } catch (e) {}

  // going live
  if (!live) {
    var prodSet = '';
    try {
      prodSet = spreadsheetIdFromV1_(PropertiesService.getScriptProperties()
        .getProperty(PORTAL_PROD_ID_PROPERTY));
    } catch (e) {}
    todo.push({ what: 'this is still the practice spreadsheet',
      run: prodSet ? 'pointAtProductionReadOnly' : '(set PORTAL_PRODUCTION_SPREADSHEET_ID first)',
      why: prodSet ? 'It points the portal at your real tracker, read only.'
                   : 'Project Settings > Script Properties. Paste the whole address of your tracker.' });
  }

  /* ---- what do I run next ---- */

  if (good.length) {
    say('WORKING');
    good.forEach(function (g) { say('  ' + g); });
    say();
  }

  if (!todo.length) {
    rule();
    say('NOTHING IS BLOCKING IT.');
    say();
    say('Open the web app and check you see the screen your role should see.');
    say('If you changed the code, deploy first:');
    say('  Deploy > Manage deployments > pencil > Version: New version > Deploy');
    return noteV1_(L.join('\n'));
  }

  rule();
  say('DO THIS NEXT');
  say();
  say('  Run  ' + todo[0].run);
  say();
  say('  ' + todo[0].what + '.');
  say('  ' + todo[0].why);
  say();

  if (todo.length > 1) {
    rule();
    say('AFTER THAT  (' + (todo.length - 1) + ' more, in order)');
    say();
    todo.slice(1).forEach(function (t, i) {
      say('  ' + (i + 2) + '. ' + t.what);
      say('     Run  ' + t.run);
    });
  }

  return noteV1_(L.join('\n'));
}

/* ---------------------------------------------------------------- *
 *  The whole menu, in the words of the job rather than the code.
 *  Every one of these is safe to run and none of them writes.
 * ---------------------------------------------------------------- */

/** What is set, what it is pointed at, whether it can write. */
function WHERE_AM_I() { return showSettings(); }

/** Everything that is wrong, in one report. */
function CHECK_EVERYTHING() { return productionReadinessCheck(); }

/** Put the addresses on the roster so training officers can sign in. */
function FIX_THE_ROSTER() { return applyRosterEmails(); }

/** Undo the last thing FIX_THE_ROSTER did. */
function UNDO_THE_ROSTER() { return undoRosterEmails(); }

/** What has been submitted that nothing has read. */
function WHAT_IS_WAITING() { return unprocessedResponses(); }
