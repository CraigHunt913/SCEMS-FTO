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
        ', read as well:');
    others.forEach(function (o) {
      var on = o;
      try { on = SpreadsheetApp.openById(o).getName(); } catch (e) {}
      say('          ' + on);
    });
    say('          Rows here always win. Another book can only ADD somebody');
    say('          this one has never heard of. If it is an old copy, clear');
    say('          ' + PORTAL_OTHER_IDS_PROPERTY + ' - it has nothing to give.');
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
    var assigned = {}, asWritten = {}, orphanFto = [], leftBehind = [];
    traineesV1_().forEach(function (t) {
      if (t.closed || !t.fto) return;
      var k = normNameV1_(t.fto);
      asWritten[k] = t.fto;                 // their name as somebody typed it
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
      todo.push({ what: orphanFto.length + ' trainee(s) name a training officer who is not on the roster: ' +
          orphanFto.map(function (a) {
            return assigned[a].join(' and ') + ' -> ' + (asWritten[a] || a); }).join('; '),
        run: 'addFto',
        why: 'Those trainees are on nobody\'s list. If that officer is new, set ' +
             PORTAL_ADD_FTO_PROPERTY + ' to their name and address and run addFto. ' +
             'If it is a name that changed, use PORTAL_RENAME and applyRename instead. ' +
             'To enroll a new trainee from Field Training, use Bring someone on (or addTrainee).' });
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
    // A cell holding something that is not a name at all. Every lookup in this
    // system matches by name, so a sentence in ASSIGNED FTO is simply an
    // officer nobody has heard of - indistinguishable from a typo, and it
    // reads as filled in.
    var notAName = traineesV1_().filter(function (t) {
      return !t.closed && t.fto && !looksLikeANameV1_(t.fto); });
    if (notAName.length) {
      todo.push({ what: notAName.length + ' trainee(s) have something other than a name ' +
          'in ASSIGNED FTO: ' + notAName.map(function (t) {
            return t.name + ' -> "' + String(t.fto).slice(0, 40) +
                   (String(t.fto).length > 40 ? '...' : '') + '"'; }).join('; '),
        run: '(nothing - this one needs a person)',
        why: 'That cell reads as filled in and matches nobody, so they are on ' +
             'no list and nothing else flags them. Clear it and pick a name ' +
             'from the dropdown.' });
    }

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

  // the forms, which are the only thing that writes a record
  try {
    if (!isPracticeV1_() && !formLinksLiveV1_()) {
      todo.push({ what: 'the form links are switched off, so nobody can reach a form from the portal',
        run: 'enableFormLinks',
        why: 'Every screen shows "Form links are switched off in this mode" instead ' +
             'of the form cards. setUpStaging turns them off so a practice user ' +
             'cannot submit to a real form, and that switch outlived its reason.' });
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

/** Short portal link for the crew (and how to set one). */
function PORTAL_ADDRESS() { return portalAddress(); }

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

/** Everything left, in one go.
 *
 *  START tells you the next thing to run. That was meant to make this easy
 *  and instead produced a queue of eight functions across two script editors,
 *  which is not easier, it is just better documented. This does the portal
 *  side end to end.
 *
 *  Every step is one this project already offers on its own, each is named as
 *  it happens, and each is reversible by the undo already beside it. It stops
 *  at the first thing that genuinely needs a person rather than pressing on.
 *
 *  It does NOT touch the tracker's own script, and it does NOT deploy - a
 *  deployment is a click in a menu no code can reach. */
function FINISH() {
  var L = [];
  function say(s) { L.push(s === undefined ? '' : s); }
  function rule() { say('---------------------------------------------------------'); }

  say('FINISHING THE PORTAL');
  say(PORTAL.VERSION + (typeof PORTAL_BUILD === 'string' ? '   build ' + PORTAL_BUILD : ''));
  rule();
  say();

  var props = PropertiesService.getScriptProperties();
  var did = [], stopped = '';

  /* 1. stop reading a spreadsheet that only disagrees with this one */
  try {
    var others = otherBookIdsV1_();
    if (others.length) {
      var names = others.map(function (o) {
        try { return SpreadsheetApp.openById(o).getName(); } catch (e) { return o; } });
      props.deleteProperty(PORTAL_OTHER_IDS_PROPERTY);
      forgetTabsV1_(); PEOPLE_CACHE_V1 = null;
      did.push('Stopped reading ' + names.join(', ') + '.');
      did.push('    Nothing in it was missing from here. To read it again, put');
      did.push('    ' + others.join(', ') + ' back in ' + PORTAL_OTHER_IDS_PROPERTY + '.');
    }
  } catch (e) {}

  /* 2. the form links, which the sandbox switched off days ago */
  try {
    if (!isPracticeV1_() && !formLinksLiveV1_()) {
      enableFormLinks();
      did.push('Switched the form links back on. setUpStaging turned them off so a');
      did.push('    practice user could not submit to a real form; that reason is gone.');
    }
  } catch (e) {}

  /* 3. a rename that is set and has something left to do */
  try {
    var rp = renamePlanV1_();
    if (!rp.problem && rp.cells.length) {
      var out = applyRename();
      var n = (String(out).match(/(\d+) cell\(s\) changed/) || [, '0'])[1];
      did.push(n + ' cell(s) renamed: ' +
        rp.pairs.map(function (x) { return x.from + ' -> ' + x.to; }).join(', ') + '.');
      if (/THE SHEET REFUSED/.test(String(out))) {
        did.push('    Some cells were refused by a dropdown. Run applyRename() on its');
        did.push('    own to read the detail. undoRename() reverses what did go in.');
      }
    }
  } catch (e) {}

  /* 4. assignments waiting in the property */
  try {
    var ap = assignPlanV1_();
    if (!ap.problem && ap.set.length) {
      assignFto();
      did.push(ap.set.length + ' trainee(s) assigned: ' +
        ap.set.map(function (x) { return x.trainee + ' -> ' + x.fto; }).join(', ') + '.');
    }
  } catch (e) {}

  /* 5. and switch it on */
  var wasLive = safeModeV1_() === PORTAL.MODE_LIVE;
  if (!wasLive) {
    try {
      goLive();
      did.push('LIVE. A trainee can file their own reflection and you can approve a');
      did.push('    sign-off. goReadOnly() puts that back.');
    } catch (e) {
      stopped = String(e.message || e);
    }
  } else {
    did.push('Already live.');
  }

  if (did.length) {
    say('DONE');
    did.forEach(function (d) { say('  ' + d); });
    say();
  } else {
    say('There was nothing left to do on this side.');
    say();
  }

  if (stopped) {
    rule();
    say('STOPPED BEFORE GOING LIVE');
    say();
    String(stopped).split('\n').forEach(function (x) { say('  ' + x); });
    say();
    say('Everything above this line was done and stands. Fix that one thing and');
    say('run FINISH again - it picks up where it left off.');
    return noteV1_(L.join('\n'));
  }

  rule();
  say('NOW DEPLOY. This is the only step no code can do for you.');
  say();
  say('  Deploy > Manage deployments > pencil > Version: New version > Deploy');
  say();
  say('Until you do, the link serves the code as it was when you last deployed,');
  say('so none of the above reaches anybody.');
  say();
  say('Check these two on that screen:');
  say('  Execute as      Me (' + (whoIsAskingV1_() || 'you') + ')');
  say('  Who has access  Anyone with a Google Account   -- not "Anyone"');
  say();
  say('Then open the link yourself. The footer names the build, so you can see');
  say('whether what you pasted is what is being served.');
  say();
  say('Still to do in the TRACKER\'s script editor, not this one:');
  say('  catchUpUnprocessed   the 12 responses waiting');
  say('  refreshDropdowns     so the forms list the right people');
  say('  goLive               mail out of test mode - read whichMode() first');
  return noteV1_(L.join('\n'));
}

/** The deployment settings, and how to check it actually worked. */
function GO_LIVE() { return START(); }

/** Somebody left the service. Set PORTAL_RETIRE first. Nothing is deleted. */
function SOMEBODY_LEFT_THE_SERVICE() { return retireFto(); }

/** Undo the last thing SOMEBODY_LEFT_THE_SERVICE did. */
function UNDO_SOMEBODY_LEAVING() { return unretireFto(); }
