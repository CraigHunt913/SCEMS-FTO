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
  var mode = safeModeV1_();
  var live = mode === PORTAL.MODE_LIVE;
  var real = live || mode === PORTAL.MODE_PRODUCTION;
  var modeWords = live ? '   your real records, and the portal is doing its job'
    : (real ? '   your real records, read only - nobody can do anything yet'
            : '   practice data');

  say('READING   ' + name);
  say('MODE      ' + mode + modeWords);
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

  // the roster: this is what stops FTOs using it at all. Only the people who
  // still work here - chasing an address for somebody who resigned is the
  // kind of busywork that makes a report worth ignoring.
  var noAddress = [], onRoster = 0, retired = [];
  try {
    rosterPeopleV1_().forEach(function (p) {
      if (!p.active) { retired.push(p.name); return; }
      onRoster++;
      if (p.email.indexOf('@') < 1) noAddress.push(p.name);
    });
  } catch (e) {}
  if (retired.length) {
    good.push(retired.length + ' retired off the roster, and not counted: ' +
      retired.slice(0, 4).join(', ') +
      (retired.length > 4 ? ' and ' + (retired.length - 4) + ' more' : ''));
  }

  if (noAddress.length) {
    var ready = 0;
    try { ready = rosterEmailPlanV1_().set.length; } catch (e) { ready = 0; }
    if (ready) {
      todo.push({ what: noAddress.length + ' of ' + onRoster + ' training officers cannot sign in',
        run: 'applyRosterEmails',
        why: ready + ' address(es) are ready to go in. It fills only empty cells, ' +
             'matches by name, and undoRosterEmails puts it back.' });
    } else {
      // Sending someone to a report that will say "nothing to suggest" is a
      // dead end, and dead ends are what made this exhausting. If the data
      // holds nothing for the people left, say so and name them.
      var haveHint = false;
      try {
        var sub = {};
        formResponseTabsV1_().forEach(function (ft) {
          var fi = responseColV1_(ft, [/^(fto|your name)/i]);
          if (fi < 0) return;
          ft.rows.forEach(function (r) { sub[normNameV1_(r[fi])] = true; });
        });
        var dir = directoryEntriesV1_().filter(function (d) { return !!d.name; });
        haveHint = noAddress.some(function (n) {
          if (sub[normNameV1_(n)]) return true;
          return dir.some(function (d) { return directoryNameMatchV1_(n, d.name); });
        });
      } catch (e) { haveHint = true; }

      if (haveHint) {
        todo.push({ what: noAddress.length + ' of ' + onRoster + ' training officers cannot sign in',
          run: 'suggestFtoEmails',
          why: 'Their EMAIL column is blank. This shows the accounts they have ' +
               'been submitting forms from.' });
      } else {
        todo.push({ what: noAddress.length + ' cannot sign in: ' +
            noAddress.slice(0, 5).join(', ') +
            (noAddress.length > 5 ? ' and ' + (noAddress.length - 5) + ' more' : ''),
          run: '(nothing - this one needs a person)',
          why: 'Nothing in the tracker, the form responses or the directory offers ' +
               'an address for them. Either they have left, or they are on the roster ' +
               'under a different name. Ask, then put it in the EMAIL column by hand ' +
               'or use applyRename.' });
      }
    }
  } else if (onRoster) {
    good.push('all ' + onRoster + ' training officers can sign in');
  }

  // a name on the roster that no trainee is assigned to. Usually a spelling
  // that drifted, or somebody's name changed in one place and not the others.
  try {
    var roster2 = rosterPeopleV1_(true);
    var onRosterAt = {}, retiredAt = {};
    roster2.forEach(function (p) {
      onRosterAt[p.norm] = p.name;
      if (!p.active) retiredAt[p.norm] = p.name;
    });
    var assigned = {}, orphanFto = [], leftBehind = [];
    traineesV1_().forEach(function (t) {
      if (t.closed || !t.fto) return;
      var k = normNameV1_(t.fto);
      (assigned[k] = assigned[k] || []).push(t.name);
    });
    Object.keys(assigned).forEach(function (a) {
      if (retiredAt[a]) leftBehind.push({ fto: retiredAt[a], trainees: assigned[a] });
      else if (!onRosterAt[a]) orphanFto.push(a);
    });

    // Somebody resigning leaves their trainees pointing at them. Nobody sees
    // those trainees until they are reassigned, and nothing else in here will
    // say so, because on paper the assignment is perfectly valid.
    if (leftBehind.length) {
      var stranded = leftBehind.reduce(function (n, l) { return n + l.trainees.length; }, 0);
      todo.push({ what: stranded + ' active trainee(s) are still assigned to somebody who has left: ' +
          leftBehind.map(function (l) {
            return l.trainees.join(' and ') + ' -> ' + l.fto; }).join('; '),
        run: '(nothing - this one needs a person)',
        why: 'They will not appear on any training officer\'s list until the ' +
             'ASSIGNED FTO column on ' + PORTAL.TAB.MASTER + ' names somebody ' +
             'who is still here. Who takes them on is not a decision this can make.' });
    }
    if (orphanFto.length) {
      todo.push({ what: orphanFto.length + ' trainee(s) name a training officer who is not on the roster',
        run: 'applyRename',
        why: 'Their trainees will not appear on anyone\'s list. If it is a name ' +
             'that changed, set PORTAL_RENAME to "Old Name -> New Name" and run it.' });
    }
  } catch (e) {}

  // somebody waiting to be retired
  try {
    var rp = retirePlanV1_();
    if (!rp.problem && rp.set.length) {
      todo.push({ what: rp.set.length + ' person on ' + PORTAL.TAB.ROSTER +
          ' is waiting to be marked as no longer here: ' +
          rp.set.map(function (x) { return x.name; }).join(', '),
        run: 'retireFto',
        why: 'It writes N in the ' + rp.activeCol + ' column and nothing else. ' +
             'Their history stays under their own name, and unretireFto puts it back.' });
    }
  } catch (e) {}

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

    // Nobody assigned at all. This is the quietest failure in the system: an
    // FTO's list is built by matching their name, so a trainee with a blank
    // ASSIGNED FTO is not on anybody's list and does not appear as missing
    // from one either. They simply are not there, and nothing says so.
    var noFto = traineesV1_().filter(function (t) { return !t.closed && !t.fto; });
    if (noFto.length) {
      todo.push({ what: noFto.length + ' active trainee(s) have no training officer at all: ' +
          noFto.map(function (t) { return t.name; }).join(', '),
        run: '(nothing - this one needs a person)',
        why: 'Their ASSIGNED FTO on ' + PORTAL.TAB.MASTER + ' is blank, so they are ' +
             'on nobody\'s list and nobody is being asked about them. Put a name ' +
             'in that column. Who it is is not a decision this can make.' });
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

  // going live, in two steps: point at the real tracker, then switch it on
  if (!real) {
    var prodSet = '';
    try {
      prodSet = spreadsheetIdFromV1_(PropertiesService.getScriptProperties()
        .getProperty(PORTAL_PROD_ID_PROPERTY));
    } catch (e) {}
    todo.push({ what: 'this is still the practice spreadsheet',
      run: prodSet ? 'pointAtProductionReadOnly' : '(set PORTAL_PRODUCTION_SPREADSHEET_ID first)',
      why: prodSet ? 'It points the portal at your real tracker, read only.'
                   : 'Project Settings > Script Properties. Paste the whole address of your tracker.' });
  } else if (!live) {
    // PRODUCTION shows people their records and refuses every action. That is
    // the right place to start and the wrong place to stop.
    todo.push({ what: 'the portal is read only, so nobody can actually do anything in it',
      run: 'goLive',
      why: 'A trainee cannot tick off a coaching note or file a reflection, and ' +
           'you cannot approve a sign-off - all three refuse in ' + mode + ' mode. ' +
           'goLive opens those three and nothing else, and goReadOnly puts it back.' });
  }

  /* ---- what do I run next ---- */

  // Some of these have a function that fixes them and some need somebody to
  // go and ask a question. Both belong in the list, but "DO THIS NEXT" has to
  // be something that can actually be done next, so anything with no function
  // behind it drops to the end. Order within each group is left alone.
  var runnable = todo.filter(function (t) { return t.run.charAt(0) !== '('; });
  var needsAPerson = todo.filter(function (t) { return t.run.charAt(0) === '('; });
  todo = runnable.concat(needsAPerson);

  if (good.length) {
    say('WORKING');
    good.forEach(function (g) { say('  ' + g); });
    say();
  }

  if (!todo.length) {
    rule();
    say('NOTHING IS BLOCKING IT. GO LIVE.');
    say();
    say('1. Deploy > Manage deployments > pencil > Version: New version > Deploy');
    say();
    say('2. Check these two settings on that same screen. They decide whether');
    say('   this is safe, not just whether it loads:');
    say();
    say('   Execute as      Me (' + (whoIsAskingV1_() || 'you') + ')');
    say('     So a trainee does not need edit access to the tracker to read');
    say('     their own record. The portal decides what they see; the');
    say('     spreadsheet stays shut.');
    say();
    say('   Who has access  Anyone with a Google Account');
    say('     NOT "Anyone". "Anyone" lets people in without Google naming');
    say('     them, and a portal that cannot name you cannot show you');
    say('     anything - everyone would get an empty screen.');
    say();
    say('3. Copy the /exec address and open it yourself first. You should see');
    say('   the Training Division screen.');
    say();
    say('4. Send it to one training officer and one trainee before anyone');
    say('   else. Ask each of them what they see. The officer should see');
    say('   their own trainees and nobody else\'s; the trainee should see');
    say('   themselves and nothing else.');
    say();
    say('If somebody gets "Google is not telling this portal which account",');
    say('they are signed into more than one Google account in that browser.');
    say('A private window and the one address on the roster fixes it.');
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
      say('     ' + t.why);
      say();
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

/** Somebody changed their name. Set PORTAL_RENAME first. */
function FIX_A_NAME_EVERYWHERE() { return applyRename(); }

/** The deployment settings, and how to check it actually worked. */
function GO_LIVE() { return START(); }

/** Somebody left the service. Set PORTAL_RETIRE first. Nothing is deleted. */
function SOMEBODY_LEFT_THE_SERVICE() { return retireFto(); }

/** Undo the last thing SOMEBODY_LEFT_THE_SERVICE did. */
function UNDO_SOMEBODY_LEAVING() { return unretireFto(); }
