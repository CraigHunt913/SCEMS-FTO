/**
 * SCEMS FIELD TRAINING PORTAL — portal-2.6.0
 * Build e2694a4a
 *
 * The whole portal in one file. Paste it into a new Apps Script project
 * and there is nothing else to add: the page is in here too, as a string
 * at the bottom.
 *
 * BUILT FILE. Do not edit this. Edit the files in portal/ and run
 *   node tools/build-one-file.js
 * A test fails if this file and those sources disagree.
 *
 * Run START from the dropdown above. It tells you the one thing to do
 * next, every time. Nothing else has to be remembered.
 */


/* ======================================================================
 * 00_Config.gs
 * ====================================================================== */

/**
 * SCEMS Field Training Portal — configuration.
 *
 * ONE source of truth. Nothing else in this project may hard-code a
 * spreadsheet id, an address, or a mode.
 *
 * SAFETY: TARGET_SPREADSHEET_ID is deliberately empty. The portal refuses to
 * run until it is set, and setUpStaging() points it at a sandbox — reusing
 * the remembered one when it still exists, creating a new book only when
 * none exists or you pass setUpStaging("NEW"). Pointing this at the live
 * tracker is a single, deliberate, logged act — never a default and never
 * an accident.
 */

var PORTAL = Object.freeze({
  VERSION: 'portal-2.6.0',
  PROPERTY_TARGET: 'PORTAL_TARGET_SPREADSHEET_ID',
  PROPERTY_MODE: 'PORTAL_MODE',

  /** STAGING writes freely. PRODUCTION refuses every write. */
  MODE_STAGING: 'STAGING',
  MODE_PRODUCTION: 'PRODUCTION',
  MODE_LIVE: 'LIVE',

  /** Product chrome. County name owns the badge; this is the program. */
  TITLE: 'Field Training — Sumter County EMS',
  PRODUCT: 'Field Training',
  COUNTY: 'Sumter County EMS',

  /** Tabs this portal reads. Names match the live tracker so the same code
   *  works against either, but it only ever opens the configured target. */
  TAB: Object.freeze({
    MASTER:     '01 TRAINEE MASTER',
    EVAL:       '02 FTO SHIFT EVAL RAW',
    REFLECT:    '03 SELF-REFLECTION RAW',
    URGENT:     '04 URGENT CONCERNS RAW',
    SKILLS:     '05 SKILLS PROGRESS',
    QUEUE:      '20 SKILL VALIDATION QUEUE',
    EVIDENCE:   '19 SKILL EVIDENCE LOG',
    SIGNOFF:    '21 SKILL SIGN-OFF LOG',
    ROSTER:     '22 FTO ROSTER',
    COACHING:   'PORTAL COACHING',
    AUDIT:      'PORTAL AUDIT',
    ACKS:       'PORTAL ACKNOWLEDGEMENTS'
  }),

  HEADER_ROW: 4,

  ROLE: Object.freeze({
    TRAINEE:    'TRAINEE',
    FTO:        'FTO',
    DIVISION:   'TRAINING_DIVISION',
    SUPERVISOR: 'SUPERVISOR',
    MEDICAL:    'MEDICAL_DIRECTOR',
    NONE:       'NONE'
  })
});

/** A spreadsheet id out of whatever got pasted.
 *
 *  Accepts the bare id, the whole address bar, or any fragment of it -
 *  "/d/1YL-.../edit", "docs.google.com/spreadsheets/d/1YL-...", or the id on
 *  its own. Returns '' when there is no id in there at all.
 *
 *  This exists because "the long jumble between /d/ and /edit" is a fiddly
 *  thing to select by hand, and getting it slightly wrong should not be an
 *  error message. Every place this project takes an id goes through here. */
function spreadsheetIdFromV1_(input) {
  var s = String(input == null ? '' : input).trim();
  if (!s) return '';
  var inUrl = s.match(/\/d\/([-\w]+)/);          // .../d/<id>/edit
  if (inUrl) return inUrl[1];
  if (/^[-\w]+$/.test(s)) return s;              // already just an id
  var buried = s.match(/[-\w]{20,}/);            // dig one out of something longer
  return buried ? buried[0] : '';
}

/** The spreadsheet this portal is pointed at. Throws rather than guessing. */
function targetIdV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_TARGET) || '').trim();
  if (!raw) {
    throw new Error('This portal is not pointed at a spreadsheet yet. Run ' +
      'setUpStaging() once from the script editor; it builds a staging copy ' +
      'with invented people and points the portal at that.');
  }
  var id = spreadsheetIdFromV1_(raw);
  if (!id) {
    throw new Error('The portal is pointed at "' + raw + '", and there is no ' +
      'spreadsheet id in that. Paste the address of the spreadsheet, or its ' +
      'id, into ' + PORTAL.PROPERTY_TARGET + '.');
  }
  return id;
}

function targetBookV1_() { return SpreadsheetApp.openById(targetIdV1_()); }

function modeV1_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_MODE) || PORTAL.MODE_STAGING).toUpperCase();
}

/* ---------------------------------------------------------------- *
 *  The three modes.
 *
 *  There used to be two, and they were a false choice: practice data where
 *  everything worked, or the real tracker where nothing did. There was no
 *  mode in which the real thing did its job, so "going live" meant putting
 *  a read-only display in front of people and calling it a portal.
 *
 *    STAGING      a practice spreadsheet with made-up people in it.
 *                 Everything works. Nothing here is anybody's record.
 *
 *    PRODUCTION   the real tracker, read only. Look, do not touch. This is
 *                 the right mode for checking what the portal can see before
 *                 anybody is given the link, and it is where you start.
 *
 *    LIVE         the real tracker, doing its job. A trainee can acknowledge
 *                 their own coaching note and file their own reflection; the
 *                 Training Division can approve a sign-off with a typed
 *                 reason. Nothing else opens up: every one of those is still
 *                 checked against the person's role, still limited to a row
 *                 in this spreadsheet, and still written to the audit log
 *                 under their own name.
 *
 *  Importing, merging and switching role stay STAGING-only in every mode.
 *  Those are bulk tools and a testing tool; the first two carry their own
 *  authorisation on top, and the third lets you become anybody, which must
 *  never be pointed at real records.
 * ---------------------------------------------------------------- */

/** May the portal's everyday actions write? True in STAGING and LIVE. */
function mayWriteV1_() {
  var m = modeV1_();
  return m === PORTAL.MODE_STAGING || m === PORTAL.MODE_LIVE;
}

/** Is this made-up data? True only in STAGING. */
function isPracticeV1_() { return modeV1_() === PORTAL.MODE_STAGING; }

/** Is this the real tracker with its everyday actions switched on? */
function isLiveV1_() { return modeV1_() === PORTAL.MODE_LIVE; }

/** Refuses, loudly, when an everyday action is attempted in a read-only mode. */
function requireWritableV1_(what) {
  if (mayWriteV1_()) return;
  throw new Error('Refusing to ' + what + '. This portal is in ' + modeV1_() +
    ' mode, which is read only. Run goLive() to switch the real tracker on, ' +
    'or pointAtStaging() to practise first.');
}

/** Refuses anything that must only ever touch made-up data.
 *
 *  Separate from requireWritableV1_ on purpose. A bulk import and a trainee
 *  ticking off a coaching note are not the same kind of write and must not
 *  share a gate: one is the portal doing its job, the other rewrites history
 *  in bulk. LIVE opens the first and never the second. */
function requireStagingV1_(what) {
  if (isPracticeV1_()) return;
  throw new Error('Refusing to ' + what + '. That only ever runs against the ' +
    'practice spreadsheet, and this portal is pointed at ' + modeV1_() +
    '. Run pointAtStaging() first.');
}


/* ======================================================================
 * 01_Start.gs
 * ====================================================================== */

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


/* ======================================================================
 * 10_Identity.gs
 * ====================================================================== */

/**
 * Who is asking, and what may they see.
 *
 * Every rule here is enforced on the SERVER. The browser is never trusted to
 * say who it is, and never receives a record it is not entitled to. Filtering
 * happens before the payload is built, not after it reaches the page.
 */

/** The signed-in account, or '' when Google will not say. */
function whoIsAskingV1_() {
  var e = activeUserV1_();
  // Only for something run from the Run dropdown, where the effective user IS
  // the person running it. NEVER for a web request - see whoIsVisitingV1_.
  if (!e) {
    try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (err) {}
  }
  return e;
}

function activeUserV1_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (err) { return ''; }
}

/** Who is looking at the web page. The ONLY identity a web request may use.
 *
 *  There is no fallback here, and that is the whole point. A web app deployed
 *  "Execute as: Me" runs every visitor's request under the owner's account,
 *  so Session.getEffectiveUser() is the OWNER no matter who is looking. Google
 *  also declines to name a visitor from outside the owner's Workspace domain,
 *  and returns '' from getActiveUser() - which is most of this roster, since
 *  most of them sign in with a personal address.
 *
 *  Put those two facts together with a fallback and every trainee who opened
 *  the link would be resolved as the Training Division and handed everybody's
 *  records. It would not look like a failure. It would look like the portal
 *  working.
 *
 *  So: the active user or nobody. An empty answer grants nothing, and the
 *  page says plainly what to change. */
function whoIsVisitingV1_() {
  return activeUserV1_();
}

/** Why Google might not be naming a visitor, in the words of the fix. */
function notNamedV1_() {
  return 'Google is not telling this portal which account you are signed in ' +
    'with, so it cannot show you anything.\n\n' +
    'Two things cause this:\n' +
    '  You are signed into more than one Google account in this browser. ' +
    'Open the link in a private window and sign in with the one address the ' +
    'roster has for you.\n' +
    '  Or the web app is deployed with "Who has access: Anyone", which lets ' +
    'people in without naming them. It has to be "Anyone with a Google ' +
    'Account" or narrower.';
}

function normNameV1_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Resolves an email to a role and, for a trainee, to their own record only.
 *
 *  Returns { email, role, name, traineeName, shift, ok, why }.
 *  A person who is both an FTO and a trainee resolves to the HIGHER duty, so
 *  an FTO never loses their queue by also being enrolled. */
function resolveViewerV1_(email) {
  var e = String(email || '').trim().toLowerCase();
  var out = { email: e, role: PORTAL.ROLE.NONE, name: '', traineeName: '',
              shift: '', ok: false, why: '' };
  if (!e) { out.why = notNamedV1_(); return out; }

  var cfg = portalPeopleV1_();

  if (cfg.division.indexOf(e) >= 0) {
    out.role = PORTAL.ROLE.DIVISION; out.name = cfg.names[e] || e; out.ok = true; return out;
  }
  if (cfg.medical.indexOf(e) >= 0) {
    out.role = PORTAL.ROLE.MEDICAL; out.name = cfg.names[e] || e; out.ok = true; return out;
  }
  if (cfg.supervisors[e]) {
    out.role = PORTAL.ROLE.SUPERVISOR; out.name = cfg.names[e] || e;
    out.shift = cfg.supervisors[e]; out.ok = true; return out;
  }
  if (cfg.ftos[e]) {
    out.role = PORTAL.ROLE.FTO; out.name = cfg.ftos[e]; out.ok = true; return out;
  }
  if (cfg.trainees[e]) {
    out.role = PORTAL.ROLE.TRAINEE; out.name = cfg.trainees[e];
    out.traineeName = cfg.trainees[e]; out.ok = true; return out;
  }
  out.why = e + ' is not on the roster, the trainee master, or the leadership list.';
  return out;
}

/** People the portal knows, read from the target book. Cached per execution. */
/** The first of these headers this tab actually has, or ''.
 *
 *  The live roster names its column FTO NAME. The code looked for FTO, found
 *  no such column, read undefined, and every FTO on it resolved to nobody -
 *  silently, because an empty name simply skips the row. A header this layer
 *  depends on is worth naming several ways rather than one. */
/** The index of the first of these headers this tab actually has, or -1.
 *
 *  Deliberately different from pickV1_. This resolves the COLUMN once, from
 *  the header row, and every row is then read from that column - including
 *  the rows where it happens to be blank. pickV1_ falls through to the next
 *  alias when a CELL is empty, which is right for a name that could be in
 *  either of two columns and dangerous for a column that is legitimately
 *  blank sometimes: an empty TRAINEE would quietly be answered with whatever
 *  sits in ROLE, and nothing would look wrong.
 *
 *  -1 means the tab does not have that column at all. That is a defect to
 *  report on screen, never a reason to read a neighbouring one. */
function headerIndexV1_(t, headers) {
  for (var i = 0; i < headers.length; i++) {
    var ci = t.col[headers[i]];
    if (ci !== undefined) return ci;
  }
  return -1;
}

/** One cell from a resolved column index, trimmed. '' when there is no column. */
function atV1_(row, ci) {
  return ci < 0 ? '' : String(row[ci] == null ? '' : row[ci]).trim();
}

/** Is there anything at all in this row? */
function rowHasAnythingV1_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] == null ? '' : row[i]).trim() !== '') return true;
  }
  return false;
}

function pickV1_(t, row, headers) {
  for (var i = 0; i < headers.length; i++) {
    var ci = t.col[String(headers[i] || '').toUpperCase()];
    if (ci === undefined) ci = t.col[headers[i]];
    if (ci !== undefined && row[ci] !== undefined && row[ci] !== null && row[ci] !== '') {
      return row[ci];
    }
  }
  return '';
}

/**
 * Tracker presentation renames canonical headers to plain English on the live
 * master (TRAINEE EMAIL → "Email address", etc.). Portal code still speaks
 * canonical names — map the pretty labels back so reads and writes hit the
 * same cells.
 */
var HEADER_ALIASES_BY_TAB_V1 = {};
HEADER_ALIASES_BY_TAB_V1['01 TRAINEE MASTER'] = {
  'EMAIL ADDRESS': 'TRAINEE EMAIL',
  'PROGRAM STATUS': 'SET STATUS',
  'TRAINING OFFICER': 'ASSIGNED FTO',
  'STARTED': 'START DATE',
  'PHASE STARTED': 'PHASE START DATE',
  'HOW THEY CAME IN': 'ENTRY PROFILE',
  'CLEARED DATE': 'CLEARANCE DATE',
  'NOT-RESPONDING-TO-TRAINING DATE': 'NRT DATE'
};

function applyHeaderAliasesV1_(tabName, col) {
  var plan = HEADER_ALIASES_BY_TAB_V1[tabName];
  if (!plan || !col) return col;
  Object.keys(plan).forEach(function (pretty) {
    if (col[pretty] === undefined) return;
    var canon = plan[pretty];
    if (col[canon] === undefined) col[canon] = col[pretty];
  });
  return col;
}

/* ---------------------------------------------------------------- *
 *  The roster, read one way.
 *
 *  Five different places used to reach into the roster and spell out the
 *  header aliases themselves, and every one of them ignored the ACTIVE
 *  column. That is how somebody who has left keeps a working sign-in and
 *  keeps being counted among the people who cannot sign in: not because
 *  anything decided they should, but because nothing ever read the column
 *  that says otherwise.
 * ---------------------------------------------------------------- */

var ROSTER_NAME_HEADERS_V1   = ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'];
var ROSTER_EMAIL_HEADERS_V1  = ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'];
var ROSTER_ACTIVE_HEADERS_V1 = ['ACTIVE', 'CURRENT', 'ON ROSTER'];

/** Is this roster row a person who still works here?
 *
 *  Blank means yes. It has to: the column is optional, and a roster that
 *  never filled it in must not go dark. Only a value that actually says no
 *  counts as no, and an unrecognised value is left alone rather than
 *  guessed at - the cost of reading "Part-time" as "left" is twenty-odd
 *  people locked out of their own portal with nothing on screen to say why,
 *  and that is far worse than the thing it would be protecting against. */
function rosterActiveV1_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return true;
  return !/^(n|no|non|not|nope|false|0|x|inactive|retired|resigned|resignation|terminated|term|left|former|removed|separated|quit|gone|deceased)\b/.test(s);
}

/** Everybody on the roster, with the ACTIVE column already read.
 *
 *  Pass true to include rows from the other spreadsheets as well; those come
 *  back with row -1, because a row that is not in this book cannot be
 *  written to and every write checks. */
function rosterPeopleV1_(includeOtherBooks) {
  var t = includeOtherBooks ? readTabAllV1_(PORTAL.TAB.ROSTER)
                            : readTabV1_(PORTAL.TAB.ROSTER);
  var out = [];
  if (!t.ok) return out;
  var dedup = !!includeOtherBooks;
  t.rows.forEach(function (r, i) {
    var nm = String(pickV1_(t, r, ROSTER_NAME_HEADERS_V1)).trim();
    if (!nm) return;
    var raw = String(pickV1_(t, r, ROSTER_ACTIVE_HEADERS_V1) || '').trim();
    out.push({
      name: nm,
      norm: normNameV1_(nm),
      email: String(pickV1_(t, r, ROSTER_EMAIL_HEADERS_V1)).trim().toLowerCase(),
      active: rosterActiveV1_(raw),
      activeRaw: raw,
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i)
    });
  });
  return dedup ? rosterOneEachV1_(out) : out;
}

/** Just the ones who still work here. */
function rosterActivePeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return p.active; });
}

/** Same rule as the trainee master: one person, one row, and THIS book wins.
 *  A stale copy still calling somebody by a name they no longer use must not
 *  put that name back into circulation. */
function rosterOneEachV1_(list) {
  var here = {}, out = [];
  list.forEach(function (p) { if (!p.from) here[p.norm] = true; });
  list.forEach(function (p) {
    if (p.from && here[p.norm]) return;
    out.push(p);
  });
  return out;
}

/** The ones who have been retired off it. */
function rosterRetiredPeopleV1_(includeOtherBooks) {
  return rosterPeopleV1_(includeOtherBooks).filter(function (p) { return !p.active; });
}

/** Does this look like a person's name, or like something that fell into the
 *  cell by accident?
 *
 *  Latavia Cole's ASSIGNED FTO ended up holding the sentence "Now on the tab
 *  called 22 FTO ROSTER. Add or retire an FTO there, then run Refresh form
 *  dropdowns." - the dropdown's own help text, pasted in. Nothing noticed,
 *  because to every name-matching lookup in this system that is simply an
 *  officer nobody has heard of, which is indistinguishable from a typo.
 *
 *  A person's name is short and has few words. Anything else is not one. */
function looksLikeANameV1_(s) {
  var v = String(s == null ? '' : s).trim();
  if (!v) return false;
  if (v.length > 48) return false;
  if (v.split(/\s+/).length > 5) return false;
  if (/[.!?]\s+[A-Z]/.test(v)) return false;      // more than one sentence
  return true;
}

/** Rebuilds the ASSIGNED FTO dropdown from the roster and says so.
 *
 *  Called after every roster change here, because that dropdown is a fixed
 *  list that does not follow the roster, and a stale one refuses names that
 *  are now perfectly correct. Keeping it in step is the difference between
 *  this working and another "violates the data validation rules". */
function rebuiltNoteV1_(L) {
  var r;
  try { r = rebuildFtoDropdownV1_(); } catch (e) { return L; }
  if (r && r.ok) {
    L.push('The ASSIGNED FTO dropdown on ' + PORTAL.TAB.MASTER + ' was rebuilt from');
    L.push('the roster to match: ' + r.names.length + ' name(s). It is a fixed list');
    L.push('that does not follow the roster on its own, and a stale one refuses');
    L.push('names that are perfectly correct.');
    L.push('');
  }
  return L;
}

/** What has to happen in the TRACKER's own script after the roster changes.
 *
 *  The tracker rebuilds the nine forms' "FTO name" dropdowns from the active
 *  roster, and it only does that when refreshDropdowns() is run. This portal
 *  is a separate Apps Script project and cannot call it. So every tool here
 *  that changes a name, or who is active, has to say so - otherwise the forms
 *  keep offering somebody who has left, or fail to offer somebody who just
 *  joined, and nothing anywhere says why. */
function refreshDropdownsNoteV1_(L) {
  L.push('NOW DO THIS IN THE TRACKER\'S OWN SCRIPT');
  L.push('  Run  refreshDropdowns');
  L.push('  It rebuilds the "FTO name" list on all nine forms from the active');
  L.push('  roster. Until it runs, the forms still offer the old roster: a name');
  L.push('  that changed, somebody who has left, and not somebody who just');
  L.push('  joined. This portal is a separate script and cannot run it for you.');
  return L;
}

/** Is this name on the roster as somebody who has left? */
function rosterHasRetiredV1_(name) {
  var n = normNameV1_(name);
  return rosterRetiredPeopleV1_(true).some(function (p) { return p.norm === n; });
}

var PEOPLE_CACHE_V1 = null;
function portalPeopleV1_() {
  if (PEOPLE_CACHE_V1) return PEOPLE_CACHE_V1;
  var out = { division: [], medical: [], supervisors: {}, ftos: {}, trainees: {}, names: {} };

  var props = PropertiesService.getScriptProperties();
  function list(key) {
    return String(props.getProperty(key) || '').toLowerCase()
      .split(/[,;\s]+/).filter(function (x) { return x.indexOf('@') > 0; });
  }
  out.division = list('PORTAL_DIVISION_EMAILS');
  out.medical  = list('PORTAL_MEDICAL_EMAILS');

  var sup = {};
  try { sup = JSON.parse(props.getProperty('PORTAL_SUPERVISORS') || '{}'); } catch (e) {}
  Object.keys(sup).forEach(function (k) { out.supervisors[String(k).toLowerCase()] = sup[k]; });

  // Somebody who has left the service does not keep the training officer
  // screen. Their name is still on the roster and their history is still
  // theirs, but the ACTIVE column saying no is the whole point of the
  // column, and personnel-development records are not something a former
  // employee should still be able to open.
  rosterPeopleV1_(true).forEach(function (p) {
    if (!p.email || !p.name) return;
    out.names[p.email] = p.name;
    if (p.active) out.ftos[p.email] = p.name;
  });
  var m = readTabAllV1_(PORTAL.TAB.MASTER);
  if (m.ok) {
    m.rows.forEach(function (r) {
      var em = String(pickV1_(m, r, [
        'TRAINEE EMAIL', 'EMAIL ADDRESS', 'EMAIL', 'PERSONAL EMAIL', 'WORK EMAIL'
      ])).trim().toLowerCase();
      var nm = String(pickV1_(m, r, ['TRAINEE', 'TRAINEE NAME', 'NAME'])).trim();
      if (em && nm) { out.trainees[em] = nm; out.names[em] = nm; }
    });
  }
  PEOPLE_CACHE_V1 = out;
  return out;
}

/** Header-mapped read of one tab in the target book.
 *
 *  Cached for the life of one execution. A record screen asks six tabs for one
 *  person and the Division screen asks the same six for everyone on the
 *  roster; without this that is six reads per person instead of six in total,
 *  and a twenty-person roster would spend the whole page load on it.
 *
 *  The cache is dropped after any write, so nothing reads a value it has just
 *  changed. */
var TAB_CACHE_V1 = {};
function forgetTabsV1_() { TAB_CACHE_V1 = {}; ALL_CACHE_V1 = {}; }

function readTabV1_(tabName) {
  if (Object.prototype.hasOwnProperty.call(TAB_CACHE_V1, tabName)) return TAB_CACHE_V1[tabName];
  var out = readTabUncachedV1_(tabName);
  TAB_CACHE_V1[tabName] = out;
  return out;
}

/** The same tab, across THIS spreadsheet and every other one listed.
 *
 *  This is what every screen reads. Rows from the target come first and carry
 *  their real row numbers. Rows from another book are mapped into this book's
 *  column order, deduplicated against everything already seen, and carry
 *  row -1 and the name of the book they came from.
 *
 *  Row -1 is not decoration. A row that is not in this spreadsheet has no row
 *  in this spreadsheet, and every write checks for that before it touches a
 *  cell. Writing to a row number that came from somewhere else is exactly the
 *  kind of mistake that corrupts a record silently.
 *
 *  Nothing here writes to anything. The other books are opened read only. */
var ALL_CACHE_V1 = {};

function readTabAllV1_(tabName) {
  if (Object.prototype.hasOwnProperty.call(ALL_CACHE_V1, tabName)) return ALL_CACHE_V1[tabName];

  var here = readTabV1_(tabName);
  var others = [];
  try { others = otherBookIdsV1_(); } catch (e) { others = []; }
  if (!here.ok || !others.length) { ALL_CACHE_V1[tabName] = here; return here; }

  var idCol = '', noteCol = '';
  try { idCol = responseIdColumnV1_(here); noteCol = notesColumnV1_(here); } catch (e) {}

  var seen = {}, rows = [], froms = [];
  here.rows.forEach(function (r) {
    rows.push(r);
    froms.push('');
    var byHeader = {};
    here.headers.forEach(function (h, ci) { if (h) byHeader[h] = r[ci]; });
    try { seen[sharedFingerprintV1_(here.headers, idCol, noteCol, byHeader)] = true; } catch (e) {}
    if (idCol) {
      var v = String(r[here.col[idCol.toUpperCase()]] || '').trim();
      if (v) seen[v] = true;
    }
  });

  others.forEach(function (bookId) {
    var name = bookId;
    try { name = SpreadsheetApp.openById(bookId).getName(); } catch (e) {}
    var src;
    try { src = readTabInV1_(bookId, tabName); } catch (e) { return; }
    if (!src || !src.ok) return;
    var srcIdCol = '';
    try { srcIdCol = responseIdColumnV1_(src); } catch (e) {}

    src.rows.forEach(function (r) {
      var empty = r.every(function (v) { return v === '' || v === null || v === undefined; });
      if (empty) return;

      var byHeader = {};
      src.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = r[ci];
        if (v === '' || v === null || v === undefined) return;
        var target;
        try { target = matchHeaderV1_(h, here.headers); } catch (e) { target = ''; }
        if (!target) return;
        if (target === noteCol && byHeader[noteCol]) byHeader[noteCol] += '\n' + v;
        else byHeader[target] = v;
      });

      var own = (srcIdCol && src.col[srcIdCol.toUpperCase()] !== undefined)
        ? String(r[src.col[srcIdCol.toUpperCase()]] || '').trim() : '';
      var fp = '';
      try { fp = sharedFingerprintV1_(here.headers, idCol, noteCol, byHeader); } catch (e) {}
      if ((own && seen[own]) || (fp && seen[fp])) return;
      if (own) seen[own] = true;
      if (fp) seen[fp] = true;

      rows.push(here.headers.map(function (h) {
        return (h && byHeader[h] !== undefined) ? byHeader[h] : '';
      }));
      froms.push(name);
    });
  });

  var out = { ok: true, sheet: here.sheet, headers: here.headers, col: here.col,
              rows: rows, firstDataRow: here.firstDataRow, froms: froms,
              combined: true };
  ALL_CACHE_V1[tabName] = out;
  return out;
}

/** The row number in THIS spreadsheet, or -1 for a row that came from another
 *  one. Every write asks this before it touches a cell. */
function realRowV1_(t, index) {
  if (!t || !t.ok) return -1;
  if (t.froms && t.froms[index]) return -1;
  return t.firstDataRow + index;
}

/** Which book a row came from. '' means this one. */
function rowSourceV1_(t, index) {
  return (t && t.froms && t.froms[index]) ? t.froms[index] : '';
}

function readTabUncachedV1_(tabName) {
  var sh;
  try { sh = targetBookV1_().getSheetByName(tabName); } catch (e) { sh = null; }
  if (!sh) return { ok: false, sheet: null, headers: [], col: {}, rows: [], firstDataRow: 0 };
  var hr = PORTAL.HEADER_ROW;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(hr, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h == null ? '' : h).trim(); });
  var col = {};
  headers.forEach(function (h, i) {
    if (!h) return;
    col[h.toUpperCase()] = i;
    col[h.toUpperCase().replace(/\s+/g, ' ')] = i;
  });
  applyHeaderAliasesV1_(tabName, col);
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues() : [];
  return { ok: true, sheet: sh, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}


/* ======================================================================
 * 20_Data.gs
 * ====================================================================== */

/**
 * The payload each role receives.
 *
 * One function per role. Each builds ONLY what that role is entitled to, so
 * a filtering mistake cannot leak another person's record into the page: the
 * data was never assembled in the first place.
 */

function daysAgoTextV1_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'never';
  var n = Math.floor((new Date() - d) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return n + ' days ago';
}
function asDateV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function levelKeyV1_(level) {
  var l = String(level || '').toLowerCase();
  if (l.indexOf('param') >= 0) return 'pmd';
  if (l.indexOf('advanc') >= 0 || l === 'aemt') return 'aemt';
  return 'emt';
}

/** Every trainee on the master, normalized. Closed people are marked, never
 *  silently dropped, so a caller must decide rather than inherit a filter. */
function traineesV1_() {
  return onePersonOneRecordV1_(traineeRowsV1_());
}

/** One person, one record, and THIS spreadsheet is the record.
 *
 *  Another spreadsheet may hold a row the target does not have - that is the
 *  whole reason for reading it. What it must never do is contradict the
 *  target about somebody who is in both, because then every screen shows
 *  whichever copy it happened to reach first.
 *
 *  That is not hypothetical. A four-month-old copy of this tracker was being
 *  read alongside it, and in that copy a trainee who has been closed and
 *  archived was still open, one who had been reassigned still named an
 *  officer who has since resigned, and the officer renamed on the roster
 *  still had her old name. Every one of those came back as a live problem
 *  needing a person, and none of them was real.
 *
 *  So: rows from this book win, by name, every time. A row only survives
 *  from elsewhere if nobody of that name is here at all. */
function onePersonOneRecordV1_(list) {
  var here = {}, out = [];
  list.forEach(function (t) { if (!t.from) here[t.norm] = true; });
  list.forEach(function (t) {
    if (t.from && here[t.norm]) return;      // this book already has them
    out.push(t);
  });
  return out;
}

function traineeRowsV1_() {
  var t = readTabAllV1_(PORTAL.TAB.MASTER);
  if (!t.ok) return [];
  return t.rows.map(function (r, i) {
    var name = String(pickV1_(t, r, ['TRAINEE', 'TRAINEE NAME', 'NAME']) || '').trim();
    if (!name) return null;
    var status = String(pickV1_(t, r, ['SET STATUS', 'PROGRAM STATUS']) || '').trim();
    var fto = String(pickV1_(t, r, ['ASSIGNED FTO', 'TRAINING OFFICER', 'FTO']) || '').trim();
    var email = String(pickV1_(t, r, [
      'TRAINEE EMAIL', 'EMAIL ADDRESS', 'EMAIL', 'PERSONAL EMAIL', 'WORK EMAIL'
    ]) || '').trim().toLowerCase();
    var started = asDateV1_(pickV1_(t, r, ['START DATE', 'STARTED']));
    var phaseStart = asDateV1_(pickV1_(t, r, ['PHASE START DATE', 'PHASE STARTED']));
    var level = String(pickV1_(t, r, ['LEVEL', 'CERT LEVEL', 'CERTIFICATION']) || '').trim();
    var phase = String(pickV1_(t, r, ['CURRENT PHASE', 'PHASE']) || '').trim();
    return {
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      name: name,
      norm: normNameV1_(name),
      level: level,
      levelKey: levelKeyV1_(level),
      phase: phase,
      fto: fto,
      shift: String(pickV1_(t, r, ['SHIFT']) || '').trim(),
      email: email,
      started: started,
      phaseStart: phaseStart,
      status: status,
      closed: /closed|released|cleared|independent|withdraw|archiv/i.test(status),
      setupComplete: !!(level && phase && fto && started)
    };
  }).filter(Boolean);
}

/** Catalog threshold helpers — four convictions that make a skill ready. */
function cellNumV1_(r, t, names, fallback) {
  for (var i = 0; i < names.length; i++) {
    if (t.col[names[i]] !== undefined) {
      var n = Number(r[t.col[names[i]]]);
      return isNaN(n) ? (fallback || 0) : n;
    }
  }
  return fallback || 0;
}

function skillsForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    var successful = cellNumV1_(r, t, ['SUCCESSFUL REPS', 'SUCCESSFUL'], 0);
    var independent = cellNumV1_(r, t, ['INDEPENDENT REPS', 'INDEPENDENT'], 0);
    var dates = cellNumV1_(r, t, ['DISTINCT DATES', 'DATES', 'DISTINCT DATE COUNT'], 0);
    var ftos = cellNumV1_(r, t, ['DISTINCT FTOS', 'DISTINCT FTO', 'FTOS', 'FTO COUNT'], 0);
    var needS = cellNumV1_(r, t, ['NEED SUCCESSFUL', 'REQUIRED SUCCESSFUL', 'SUCCESSFUL NEED'], 3) || 3;
    var needI = cellNumV1_(r, t, ['NEED INDEPENDENT', 'REQUIRED INDEPENDENT', 'INDEPENDENT NEED'], 2) || 2;
    var needD = cellNumV1_(r, t, ['NEED DATES', 'REQUIRED DATES', 'DATES NEED'], 2) || 2;
    var needF = cellNumV1_(r, t, ['NEED FTOS', 'REQUIRED FTOS', 'FTOS NEED'], 2) || 2;
    // If threshold columns are absent, keep classic defaults so bars still teach.
    if (t.col['NEED SUCCESSFUL'] === undefined && t.col['REQUIRED SUCCESSFUL'] === undefined) {
      needS = Math.max(needS, 3); needI = Math.max(needI, 2);
      needD = Math.max(needD, 2); needF = Math.max(needF, 2);
    }
    var readiness = String(r[t.col['READINESS']] || '').trim();
    var signed = String(r[t.col['SIGN-OFF']] || '').trim() === 'SIGNED OFF' ||
                 readiness === 'SIGNED OFF';
    out.push({
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: t.col['SKILL ID'] !== undefined
        ? String(r[t.col['SKILL ID']] || '').trim() : '',
      readiness: readiness,
      signed: signed,
      successful: successful,
      independent: independent,
      distinctDates: dates,
      distinctFtos: ftos,
      bars: [
        { label: 'Successful', have: successful, need: needS },
        { label: 'Independent', have: independent, need: needI },
        { label: 'Dates', have: dates, need: needD },
        { label: 'FTOs', have: ftos, need: needF }
      ]
    });
  });
  return out;
}

/** Hours since a Date, or -1. */
function hoursSinceV1_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return -1;
  return Math.floor((new Date() - d) / 3600000);
}

/** Parse "3/2 · 2/2 · …" style evidence summaries into four counts when columns lack them. */
function parseEvidenceBarsV1_(text) {
  var s = String(text || '');
  var m = s.match(/(\d+)\s*\/\s*(\d+)/g);
  if (!m || m.length < 2) return null;
  var bars = [];
  var labels = ['Successful', 'Independent', 'Dates', 'FTOs'];
  for (var i = 0; i < Math.min(m.length, 4); i++) {
    var p = m[i].match(/(\d+)\s*\/\s*(\d+)/);
    bars.push({ label: labels[i], have: Number(p[1]), need: Number(p[2]) });
  }
  while (bars.length < 4) bars.push({ label: labels[bars.length], have: 0, need: 1 });
  return bars;
}

/** Eval heat for a trainee: count, days since last, optional domain average. */
function evalHeatForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  var out = { count: 0, days: -1, avg: null, lastEval: 'never' };
  if (!t.ok) return out;
  var iWho = headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1);
  var iWhen = headerIndexV1_(t, EVAL_DATE_HEADERS_V1);
  if (iWho < 0 || iWhen < 0) return out;
  var domains = ['Assessment', 'Treatment', 'Communication', 'Documentation',
                 'Scene Leadership', 'Professionalism'];
  var latest = null, sum = 0, nScores = 0;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[iWho]) !== norm) return;
    out.count++;
    var d = asDateV1_(r[iWhen]);
    if (d && (!latest || d > latest)) latest = d;
    domains.forEach(function (h) {
      if (t.col[h] === undefined) return;
      var v = Number(r[t.col[h]]);
      if (v >= 1 && v <= 5) { sum += v; nScores++; }
    });
  });
  if (latest) {
    out.days = Math.floor((new Date() - latest) / 86400000);
    out.lastEval = daysAgoTextV1_(latest);
  }
  if (nScores) out.avg = Math.round((sum / nScores) * 100) / 100;
  return out;
}

/** Day count in current phase (or since start). */
function dayInPhaseV1_(t) {
  var d = t.phaseStart || t.started;
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((new Date() - d) / 86400000));
}

/**
 * Can they clear for the truck? Phase 4 + every matrix skill signed off +
 * no open skill-validation items. Gaps are human-readable for the desk.
 */
function clearanceAssessmentV1_(trainee) {
  var out = {
    phase4: false,
    canClear: false,
    signed: 0,
    total: 0,
    gaps: []
  };
  if (!trainee || trainee.closed) {
    out.gaps.push('Not an active trainee.');
    return out;
  }
  out.phase4 = phaseIndexV1_(trainee.phase) === 3;
  if (!out.phase4) {
    out.gaps.push('Still in ' + (trainee.phase || 'an earlier phase') +
      ' — Phase 4 comes first.');
    return out;
  }

  var skills = [];
  try { skills = skillsForV1_(trainee.norm); } catch (e) { skills = []; }
  out.total = skills.length;
  out.signed = skills.filter(function (s) { return s.signed; }).length;

  if (!skills.length) {
    out.gaps.push('No skills on the matrix yet. Log skills and rebuild before clearing.');
  } else {
    var openSkills = skills.filter(function (s) { return !s.signed; });
    openSkills.slice(0, 6).forEach(function (s) {
      out.gaps.push(s.skill +
        (s.readiness ? ' — ' + s.readiness : ' — not signed off'));
    });
    if (openSkills.length > 6) {
      out.gaps.push('…and ' + (openSkills.length - 6) + ' more skills still open');
    }
  }

  try {
    var waiting = openQueueV1_().filter(function (q) {
      return q.norm === trainee.norm && !q.decision;
    });
    if (waiting.length) {
      out.gaps.push(waiting.length + ' skill sign-off' +
        (waiting.length === 1 ? '' : 's') + ' still waiting on Division');
    }
  } catch (e2) {}

  out.canClear = out.gaps.length === 0;
  return out;
}

/** Imperative next-move cards — replace "flags" language for humans. */
function nextMovesForTraineeV1_(t, heat, waiting, coaching, freshness) {
  var moves = [];
  (coaching || []).forEach(function (c) {
    if (c.acknowledged) return;
    moves.push({
      kind: 'coaching', urgency: 'soon', title: 'Acknowledge coaching from ' + (c.from || 'your FTO'),
      blurb: String(c.text || '').slice(0, 120), action: 'ack', row: c.row
    });
  });
  var reflectAgo = '';
  (freshness || []).forEach(function (f) {
    if (/reflect/i.test(f.title || '')) reflectAgo = f.ago;
  });
  if (reflectAgo === 'never' || /days ago/.test(reflectAgo)) {
    var n = parseInt(reflectAgo, 10);
    if (reflectAgo === 'never' || (n && n >= 7)) {
      moves.push({
        kind: 'reflect', urgency: 'soon',
        title: 'File your reflection',
        blurb: reflectAgo === 'never' ? 'None on file yet. Two minutes.' :
               'Last one was ' + reflectAgo + '.',
        action: 'reflect'
      });
    }
  }
  if (heat.days < 0) {
    moves.push({
      kind: 'eval', urgency: 'due',
      title: 'No evaluation on file yet',
      blurb: 'Your FTO files one after a shift together.',
      action: 'wait'
    });
  } else if (heat.days > 14) {
    moves.push({
      kind: 'eval', urgency: 'soon',
      title: heat.days + ' days since an evaluation',
      blurb: 'Ask your FTO to schedule one.',
      action: 'wait'
    });
  }
  (waiting || []).forEach(function (q) {
    moves.push({
      kind: 'queue', urgency: 'ok',
      title: q.skill + ' is with Training Division',
      blurb: 'Ready ' + (q.since || '') + '. Nothing for you to do.',
      action: 'wait'
    });
  });
  return moves.slice(0, 6);
}

function nextMoveFromFindingV1_(why, name) {
  var w = String(why || '');
  if (!w) return null;
  var title = w, blurb = 'Open their chart and decide the next honest move.', urgency = 'soon';
  if (/never evaluated/i.test(w)) {
    title = 'Get an evaluation on the board'; blurb = name + ' has never been evaluated.'; urgency = 'due';
  } else if (/days since/i.test(w)) {
    title = 'Schedule an evaluation'; blurb = capFindingV1_(w) + '.'; urgency = 'soon';
  } else if (/no training officer|no one on the roster|has left|sentence, not a name/i.test(w)) {
    title = 'Fix the training officer assignment'; blurb = capFindingV1_(w) + '.'; urgency = 'due';
  } else if (/not responding|remediation|concern/i.test(w)) {
    title = 'Address status: ' + w; blurb = 'This stays visible until the status changes.'; urgency = 'due';
  } else if (/missing|incomplete/i.test(w)) {
    title = 'Finish the trainee record'; blurb = capFindingV1_(w) + '.'; urgency = 'soon';
  }
  return { kind: 'finding', urgency: urgency, title: title, blurb: blurb, finding: w };
}
function capFindingV1_(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function openQueueV1_() {
  var t = readTabAllV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var since = asDateV1_(r[t.col['READY DATE']]);
    var evidence = String(r[t.col['EVIDENCE SUMMARY']] || '').trim();
    var bars = parseEvidenceBarsV1_(evidence);
    var recommend = String(r[t.col['FTO RECOMMENDATION']] || r[t.col['RECOMMENDATION']] ||
                           r[t.col['FTO NOTES']] || '').trim();
    out.push({
      row: realRowV1_(t, i),
      from: rowSourceV1_(t, i),
      trainee: String(r[t.col['TRAINEE']] || '').trim(),
      norm: normNameV1_(r[t.col['TRAINEE']]),
      skill: String(r[t.col['SKILL']] || '').trim(),
      skillId: String(r[t.col['SKILL ID']] || '').trim(),
      evidence: evidence,
      bars: bars,
      recommend: recommend,
      since: since,
      hours: hoursSinceV1_(since),
      requestId: String(r[t.col['REQUEST ID']] || '').trim(),
      decision: String(r[t.col['DECISION']] || '').trim(),
      decidedBy: String(r[t.col['DECIDED BY']] || '').trim()
    });
  });
  return out;
}

/* The evaluation tab, read by its headers.
 *
 *  This used to be r[2] for the trainee and r[0] for the date. Both happen to
 *  be right on today's live tab - and that is the whole problem with a
 *  positional read: it is right until somebody adds a question to the form,
 *  and then it is silently wrong on every screen at once, with every trainee
 *  reading "never evaluated" and nothing anywhere saying why.
 *
 *  Shift Date first, then the form's own timestamp. An officer who files three
 *  days late did not evaluate anybody today, and the Division screen counts
 *  days from this. */
var EVAL_TRAINEE_HEADERS_V1 = ['TRAINEE', 'TRAINEE NAME', 'NAME'];
var EVAL_DATE_HEADERS_V1    = ['SHIFT DATE', 'DATE', 'TIMESTAMP'];

/** What is wrong with the evaluation tab, in a sentence, or ''. */
function evalHeaderProblemV1_() {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return PORTAL.TAB.EVAL + ' is not in this spreadsheet.';
  var missing = [];
  if (headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1) < 0) missing.push('one naming the trainee');
  if (headerIndexV1_(t, EVAL_DATE_HEADERS_V1) < 0) missing.push('one holding the date');
  return missing.length
    ? PORTAL.TAB.EVAL + ' is missing ' + missing.join(' and ') + ', so nothing on ' +
      'these screens can say when anybody was last evaluated. Nothing is being guessed at.'
    : '';
}

function lastEvalForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.EVAL);
  if (!t.ok) return null;
  var iWho = headerIndexV1_(t, EVAL_TRAINEE_HEADERS_V1);
  var iWhen = headerIndexV1_(t, EVAL_DATE_HEADERS_V1);
  if (iWho < 0 || iWhen < 0) return null;
  var latest = null;
  t.rows.forEach(function (r) {
    if (normNameV1_(r[iWho]) !== norm) return;
    var d = asDateV1_(r[iWhen]);
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function coachingForV1_(norm) {
  var t = readTabAllV1_(PORTAL.TAB.COACHING);
  if (!t.ok) return [];
  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    out.push({
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      when: asDateV1_(r[t.col['DATE']]),
      from: String(r[t.col['FROM']] || '').trim(),
      text: String(r[t.col['NOTE']] || '').trim(),
      acknowledged: String(r[t.col['ACKNOWLEDGED']] || '').trim() === 'YES'
    });
  });
  return out;
}

/* ---------------- role payloads ---------------- */

function traineePayloadV1_(viewer) {
  var me = traineesV1_().filter(function (t) { return t.norm === normNameV1_(viewer.traineeName); })[0];
  if (!me) return { error: 'No training record found for ' + viewer.email + '.' };
  var skills = skillsForV1_(me.norm);
  var signed = skills.filter(function (s) { return s.signed; }).length;
  var waiting = openQueueV1_().filter(function (q) { return q.norm === me.norm; });
  var coaching = coachingForV1_(me.norm);
  var heat = evalHeatForV1_(me.norm);
  var freshness = safeFormsV1_(function () { return freshnessForV1_(me.name); });
  var day = dayInPhaseV1_(me);
  var unacked = coaching.filter(function (c) { return !c.acknowledged; });
  return {
    product: PORTAL.PRODUCT,
    name: me.name, level: me.level, levelKey: me.levelKey, phase: me.phase,
    fto: me.fto, phaseStart: me.phaseStart ? me.phaseStart.toDateString() : '',
    dayInPhase: day,
    lastEval: heat.lastEval,
    evalCount: heat.count,
    evalAvg: heat.avg,
    signed: signed, applicable: skills.length,
    percent: skills.length ? Math.round(signed / skills.length * 100) : 0,
    waiting: waiting.map(function (q) { return { skill: q.skill, since: daysAgoTextV1_(q.since) }; }),
    coaching: unacked.map(function (c) { return { row: c.row, from: c.from, text: c.text,
                                   book: c.book || '',
                                   when: c.when ? c.when.toDateString() : '' }; }),
    nextMoves: nextMovesForTraineeV1_(me, heat, waiting, coaching, freshness),
    skills: skills.slice(0, 40),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.TRAINEE, { trainee: me.name });
    }),
    freshness: freshness
  };
}

function ftoPayloadV1_(viewer) {
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && normNameV1_(t.fto) === normNameV1_(viewer.name); });
  return {
    product: PORTAL.PRODUCT,
    name: viewer.name,
    trainees: mine.map(function (t) {
      var heat = evalHeatForV1_(t.norm);
      var waiting = openQueueV1_().filter(function (q) { return q.norm === t.norm && !q.decision; });
      var urgency = '';
      if (!t.setupComplete) urgency = 'soon';
      else if (heat.days < 0 || heat.days > 7) urgency = 'due';
      else if (heat.days > 4) urgency = 'soon';
      return {
        name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
        dayInPhase: dayInPhaseV1_(t),
        lastEval: heat.lastEval,
        evalCount: heat.count,
        evalAvg: heat.avg,
        daysSinceEval: heat.days,
        waitingCount: waiting.length,
        urgency: urgency,
        setupComplete: t.setupComplete,
        forms: safeFormsV1_(function () {
          return traineeFormsForV1_(PORTAL.ROLE.FTO, t,
            { fto: viewer.name, trainee: t.name });
        }),
        freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); })
      };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.FTO, { fto: viewer.name });
    })
  };
}

/** Why a trainee's ASSIGNED FTO does not reach anybody, or '' if it does.
 *
 *  This is the difference between a system that loses people and one that
 *  does not. An officer's list is built by matching their name, so anything
 *  in that cell which is not an active officer's name means the trainee is on
 *  no list at all - and nothing looks wrong, because the cell is filled in.
 *
 *  Every one of these has actually happened here: a blank cell, a name that
 *  changed on the roster and not on the trainee, an officer who resigned, and
 *  the dropdown's own help text pasted in as a whole sentence. */
function ftoProblemV1_(t) {
  var v = String(t.fto == null ? '' : t.fto).trim();
  if (!v) return 'no training officer is named';
  if (!looksLikeANameV1_(v)) return 'that cell holds a sentence, not a name';
  var n = normNameV1_(v);
  var hit = null;
  rosterPeopleV1_(true).forEach(function (p) { if (p.norm === n) hit = p; });
  if (!hit) return 'no one on the roster is called that';
  if (!hit.active) return hit.name + ' has left';
  return '';
}

/** Every active trainee who is on nobody's list, and why. */
function strandedTraineesV1_() {
  return traineesV1_().filter(function (t) { return !t.closed; })
    .map(function (t) { return { t: t, why: ftoProblemV1_(t) }; })
    .filter(function (x) { return !!x.why; })
    .map(function (x) {
      return { name: x.t.name, level: x.t.level, phase: x.t.phase,
               fto: String(x.t.fto || ''), why: x.why,
               lastEval: daysAgoTextV1_(lastEvalForV1_(x.t.norm)) };
    });
}

function divisionPayloadV1_() {
  var all = traineesV1_();
  var active = all.filter(function (t) { return !t.closed; });
  var open = openQueueV1_().filter(function (q) { return !q.decision; });
  // Oldest OPEN first — the desk works the backlog, not sheet order.
  open.sort(function (a, b) {
    var ha = (a.hours < 0 ? 0 : a.hours);
    var hb = (b.hours < 0 ? 0 : b.hours);
    return hb - ha;
  });
  var staged = openQueueV1_().filter(function (q) { return !!q.decision; });

  // A trainee whose officer does not resolve is not "set up", whatever else
  // is filled in. Counting them as complete is how they went missing.
  var stranded = safeFormsV1_(function () { return strandedTraineesV1_(); }) || [];
  var strandedBy = {};
  stranded.forEach(function (s) { strandedBy[normNameV1_(s.name)] = true; });
  var incomplete = active.filter(function (t) {
    return !t.setupComplete || strandedBy[t.norm]; });

  // Read the acknowledgment log once, not once per person.
  var acks = safeFormsV1_(function () { return ackRowsV1_(); }) || [];

  var seen = {}, dupes = [];
  active.forEach(function (t) {
    if (seen[t.norm]) dupes.push(t.name); else seen[t.norm] = true;
  });

  var settleWarn = '';
  var duplicateSubs = [];
  try {
    duplicateSubs = duplicateSubmissionsV1_() || [];
  } catch (eDup) {
    settleWarn = 'Settle list could not be built — ' + String((eDup && eDup.message) || eDup) +
      '. The rest of Waiting on you is still live.';
    duplicateSubs = [];
  }

  return {
    activeCount: active.length,
    closedCount: all.length - active.length,
    queue: open.slice(0, 25).map(function (q) {
      var hours = q.hours;
      var clock = 72;
      if (hours < 0) hours = 0;
      var left = Math.max(0, clock - hours);
      return {
        trainee: q.trainee, skill: q.skill, evidence: q.evidence,
        bars: q.bars, recommend: q.recommend || '',
        since: daysAgoTextV1_(q.since), hours: hours, hoursLeft: left,
        clockPct: Math.max(0, Math.min(100, Math.round((left / clock) * 100))),
        requestId: q.requestId, row: q.row, from: q.from
      };
    }),
    queueCount: open.length,
    // Legacy half-staged rows (OPEN + decision filled) — rare after portal
    // records permanently. Still listed so Division can finish orphans.
    staged: staged.map(function (q) {
      return { trainee: q.trainee, skill: q.skill, decision: q.decision,
               by: q.decidedBy, since: daysAgoTextV1_(q.since) };
    }),
    canAssignFto: mayWriteV1_(),
    // A column this screen leans on that is not there. Doctrine: report it,
    // never read the one beside it and hope.
    warnings: [evalHeaderProblemV1_(), settleWarn].filter(function (w) { return !!w; }),
    incomplete: incomplete.map(function (t) {
      var missing = [];
      if (!t.level) missing.push('level');
      if (!t.phase) missing.push('phase');
      if (!t.started) missing.push('start date');
      var f = ftoProblemV1_(t);
      if (f) missing.push(f);
      return { name: t.name, missing: missing.join(', ') };
    }),
    // Whatever the tracker says, nobody active is invisible. This is the list
    // of people no officer's screen will show, with the reason for each.
    stranded: stranded,
    duplicates: dupes,
    releaseReady: active.filter(function (t) {
      return clearanceAssessmentV1_(t).canClear;
    }).map(function (t) {
      var a = clearanceAssessmentV1_(t);
      return { name: t.name, level: t.level, signed: a.signed, total: a.total };
    }),
    // Every active trainee, each carrying enough for the screen to decide
    // whether it needs to say anything about them at all. A list of ten
    // identical rows of names is not information; it is my internals on somebody's
    // phone. The screen shows the exceptions and counts the rest.
    people: active.map(function (t) {
      var last = lastEvalForV1_(t.norm);
      var days = last ? Math.floor((new Date() - last) / 86400000) : -1;
      var why = '';
      if (ftoProblemV1_(t)) why = ftoProblemV1_(t);
      else if (/not responding|remediation|concern/i.test(t.status)) why = t.status;
      else if (days < 0) why = 'never evaluated';
      else if (days > 14) why = days + ' days since an evaluation';
      else if (!t.setupComplete) why = 'record incomplete';
      // Seen, by a named person, in their own words, for a stated time. The
      // finding is not cleared and never can be - it moves out of the alarm
      // list until the hold runs out, and comes straight back after.
      var ack = why ? liveAckForV1_(t.norm, why, acks) : null;
      var move = why ? nextMoveFromFindingV1_(why, t.name) : null;
      var next = nextPhaseV1_(t.phase);
      var clear = clearanceAssessmentV1_(t);
      return { name: t.name, level: t.level, levelKey: t.levelKey, phase: t.phase,
               fto: t.fto || '', shift: t.shift || '',
               dayInPhase: dayInPhaseV1_(t),
               nextPhase: next,
               canAdvance: !!next,
               releaseReady: clear.canClear,
               phase4: clear.phase4,
               clearance: clear,
               days: days, status: t.status || '', needs: why, ack: ack,
               nextMove: move,
               skills: safeFormsV1_(function () { return skillsForV1_(t.norm); }) || [],
               forms: safeFormsV1_(function () {
                 return traineeFormsForV1_(PORTAL.ROLE.DIVISION, t, { trainee: t.name });
               }),
               freshness: safeFormsV1_(function () { return freshnessForV1_(t.name); }) };
    }),
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.DIVISION, {});
    }),
    retiredForms: safeFormsV1_(function () { return retiredFormsV1_(); }),
    // Officers the Bring-someone-on form can assign. Exact roster spellings.
    officers: (function () {
      try {
        return rosterActivePeopleV1_().map(function (p) {
          return { name: p.name, email: p.email || '' };
        }).sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name));
        });
      } catch (e) { return []; }
    })(),
    canAddTrainee: mayWriteV1_(),
    // Where two submissions of the same kind landed on the same day. Both are
    // kept; this is the list of calls to make, not a list of rows to remove.
    duplicateSubs: duplicateSubs,
    // Raw Form Responses tabs (esp. skills logs) waiting for tracker ingest.
    formWaiting: (function () {
      try {
        var w = waitingFormResponsesV1_();
        return {
          waiting: w.waiting,
          skillsWaiting: w.skillsWaiting,
          total: w.total,
          list: (w.waitingList || []).slice(0, 25)
        };
      } catch (eW) { return { waiting: 0, skillsWaiting: 0, total: 0, list: [] }; }
    })(),
    // Released / closed — prior reports (print / PDF) without the tracker.
    closedPeople: all.filter(function (t) { return t.closed; }).map(function (t) {
      return { name: t.name, level: t.level, levelKey: t.levelKey,
               status: t.status || 'Closed', fto: t.fto || '', phase: t.phase || '' };
    }),
    formLinks: safeBoolV1_(function () { return formLinksLiveV1_(); }),
    mode: modeV1_(),
    product: PORTAL.PRODUCT
  };
}

function supervisorPayloadV1_(viewer) {
  var shift = normNameV1_(viewer.shift);
  var mine = traineesV1_().filter(function (t) {
    return !t.closed && (!shift || normNameV1_(t.shift) === shift); });
  var hot = 0;
  var trainees = mine.map(function (t) {
    var heat = evalHeatForV1_(t.norm);
    var why = '';
    var urgency = '';
    if (heat.days < 0) { why = 'never evaluated'; urgency = 'due'; hot++; }
    else if (heat.days > 14) { why = heat.days + 'd silent'; urgency = 'due'; hot++; }
    else if (heat.days > 7) { why = heat.days + 'd since eval'; urgency = 'soon'; hot++; }
    var ftoWhy = ftoProblemV1_(t);
    if (ftoWhy) { why = ftoWhy; urgency = 'due'; hot++; }
    return {
      name: t.name, level: t.level, levelKey: t.levelKey,
      phase: t.phase, fto: t.fto,
      lastEval: heat.lastEval,
      daysSinceEval: heat.days,
      evalCount: heat.count,
      why: why,
      urgency: urgency,
      nextMove: why ? nextMoveFromFindingV1_(why, t.name) : null
    };
  });
  // Hot first — the strip should put tonight's problems at the start.
  trainees.sort(function (a, b) {
    var rank = { due: 0, soon: 1, '': 2 };
    return (rank[a.urgency] || 2) - (rank[b.urgency] || 2);
  });
  return {
    product: PORTAL.PRODUCT,
    shift: viewer.shift || 'All shifts',
    hotCount: hot,
    trainees: trainees,
    forms: safeFormsV1_(function () {
      return generalFormsForV1_(PORTAL.ROLE.SUPERVISOR, { fto: viewer.name });
    })
  };
}

/* ---------------- the medical director ---------------- */
/* This screen was reading the urgent-concern tab by position, and the live
   tab is
     Timestamp | TRAINING OFFICER CONTACTED | Reporter | Role | Trainee |
     Date | Shift | Category | What Happened | Action Taken |
     RESOLUTION (TCO) | DATE CLOSED | STATUS | OWNER
   so column 3 is the REPORTER'S ROLE, not the trainee, and column 4 is the
   trainee's NAME, not the account of what happened. Every case on the
   physician's screen named the wrong thing as the person and printed a name
   where the narrative should be.

   Three more, found with it: the twenty shown were the twenty OLDEST, so
   nothing recent ever appeared; concerns already closed kept appearing, since
   nothing read DATE CLOSED or STATUS; and the key saying which book a row came
   from was declared twice in the same object literal, so it was overwritten
   and lost every time.

   A physician is the last person in this system who should be handed a
   mislabelled record. Every column is resolved once, by name, and a column
   that is not there is said out loud rather than answered with a neighbour. */

var URGENT_TRAINEE_HEADERS_V1  = ['TRAINEE', 'TRAINEE INVOLVED', 'TRAINEE NAME', 'NAME'];
var URGENT_REPORTER_HEADERS_V1 = ['REPORTER', 'REPORTED BY', 'YOUR NAME', 'FTO', 'TRAINING OFFICER'];
var URGENT_WHAT_HEADERS_V1     = ['WHAT HAPPENED', 'DETAIL', 'DETAILS', 'DESCRIPTION', 'NARRATIVE'];
var URGENT_WHEN_HEADERS_V1     = ['DATE', 'SHIFT DATE', 'TIMESTAMP'];
var URGENT_CATEGORY_HEADERS_V1 = ['CATEGORY', 'CONCERN TYPE', 'TYPE'];
var URGENT_STATUS_HEADERS_V1   = ['STATUS', 'RECORD STATUS'];
var URGENT_CLOSED_HEADERS_V1   = ['DATE CLOSED', 'CLOSED'];

function medicalPayloadV1_() {
  var t = readTabAllV1_(PORTAL.TAB.URGENT);
  if (!t.ok) {
    return { cases: [], total: 0, warnings: [PORTAL.TAB.URGENT +
      ' is not in this spreadsheet, so nothing can be shown here.'] };
  }

  var iWho  = headerIndexV1_(t, URGENT_TRAINEE_HEADERS_V1);
  var iFrom = headerIndexV1_(t, URGENT_REPORTER_HEADERS_V1);
  var iWhat = headerIndexV1_(t, URGENT_WHAT_HEADERS_V1);
  var iWhen = headerIndexV1_(t, URGENT_WHEN_HEADERS_V1);
  var iCat  = headerIndexV1_(t, URGENT_CATEGORY_HEADERS_V1);
  var iStat = headerIndexV1_(t, URGENT_STATUS_HEADERS_V1);
  var iShut = headerIndexV1_(t, URGENT_CLOSED_HEADERS_V1);

  var warnings = [];
  if (iWho < 0) warnings.push(PORTAL.TAB.URGENT + ' has no column naming the trainee, ' +
    'so nothing on this screen can be attributed to a person. Nothing is being guessed at.');
  if (iWhat < 0) warnings.push(PORTAL.TAB.URGENT + ' has no column holding the account ' +
    'of what happened, so these cases are shown without one.');

  var cases = [];
  t.rows.forEach(function (r, i) {
    if (!rowHasAnythingV1_(r)) return;
    var who = atV1_(r, iWho);
    if (iWho >= 0 && !who) return;

    // Already dealt with. A closed concern is history, not a question for you.
    if (atV1_(r, iShut)) return;
    if (/^(CLOSED|RESOLVED|COMPLETE|COMPLETED|NO ACTION)/.test(atV1_(r, iStat).toUpperCase())) return;

    var when = iWhen < 0 ? null : asDateV1_(r[iWhen]);
    cases.push({
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      trainee: who || '(nobody is named on this row)',
      from: atV1_(r, iFrom) || '(the reporter is not named)',
      category: atV1_(r, iCat),
      when: when ? when.toDateString() : 'no date on the row',
      at: when ? when.getTime() : 0,
      what: atV1_(r, iWhat)
    });
  });

  // Newest first. It showed the oldest twenty, which on a tab that only ever
  // grows means the physician never saw anything that had just happened.
  cases.sort(function (a, b) { return b.at - a.at; });
  return { cases: cases.slice(0, 20), total: cases.length, warnings: warnings };
}

/* ---------------- forms, defensively ---------------- */
/* The registry reads Google Forms to discover published URLs and prefill
   ids. That is a network call against nine documents, and any one of them
   can be moved, unshared, or simply slow. A portal that cannot show a
   person their own record because a form link failed to resolve is worse
   than a portal with no links, so every call goes through here and a
   failure costs the links and nothing else. */
function safeFormsV1_(fn) {
  try { return fn() || []; } catch (e) { return []; }
}
function safeBoolV1_(fn) {
  try { return !!fn(); } catch (e) { return false; }
}


/* ======================================================================
 * 30_WebApp.gs
 * ====================================================================== */

/**
 * The web app entry point.
 *
 * doGet serves the HTML shell ONLY. It does not open the spreadsheet, forms,
 * or Drive. Touching those during doGet is what produces Google's grey
 * createOAuthDialog iframe that never paints Field Training.
 *
 * Identity + payload load after the page is up, via refreshV1() / google.script.run.
 */

function doGet(e) {
  var boot = {
    version: PORTAL.VERSION +
      (typeof PORTAL_BUILD === 'string' ? '  build ' + PORTAL_BUILD : ''),
    mode: safeModeV1_(),
    deferred: true,
    viewer: { email: '', role: PORTAL.ROLE.NONE, name: '', ok: false, why: '' },
    data: {},
    error: ''
  };
  // Naming the visitor does not open Spreadsheets. Safe during doGet.
  try {
    var email = whoIsVisitingV1_();
    if (email) boot.viewer.email = email;
  } catch (ex) {}

  var t = portalTemplateV1_();
  t.boot = JSON.stringify(boot);

  var page = t.evaluate();
  page.setTitle(PORTAL.TITLE);
  page.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
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

/**
 * Run ONCE from the Apps Script editor (Run ▶ authorizePortalNow).
 * Forces Google's permission screens for Sheets / Drive / Forms so the
 * web app is not stuck on a grey OAuth iframe.
 */
function authorizePortalNow() {
  var L = ['Field Training — authorizePortalNow', ''];
  try {
    var email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
    L.push('Signed in as: ' + (email || '(unnamed)'));
  } catch (e) { L.push('Session: ' + e); }

  try {
    var id = targetIdV1_();
    var name = SpreadsheetApp.openById(id).getName();
    L.push('Spreadsheet OK: ' + name);
  } catch (e) {
    L.push('Spreadsheet: ' + e + ' — run setUpStaging() or pointAtProductionReadOnly() first if needed.');
  }

  try {
    DriveApp.getRootFolder().getName();
    L.push('Drive OK');
  } catch (e) { L.push('Drive: ' + e); }

  try {
    var probed = false;
    if (typeof PORTAL_FORMS !== 'undefined' && PORTAL_FORMS && PORTAL_FORMS.length && PORTAL_FORMS[0].id) {
      FormApp.openById(PORTAL_FORMS[0].id).getTitle();
      probed = true;
    }
    L.push(probed ? 'Forms OK' : 'Forms: no id to probe (OK — Sheets/Drive still authorized)');
  } catch (e) { L.push('Forms: ' + e); }

  L.push('');
  L.push('Next: Deploy → Manage deployments → Edit → Version: New version → Deploy.');
  L.push('Settings must be: Execute as ME, Who has access: ANYONE WITH A GOOGLE ACCOUNT.');
  L.push('Then open the /exec link again (Incognito if you use multiple Google accounts).');
  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e2) {}
  return msg;
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

/* Sign-off approve / return live in 91_Record.gs — they write the permanent
 *  sign-off log and close the queue row. Staging-only is gone on purpose. */

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

/** Refreshes the current role's payload without a page reload.
 *  Also the first real load after doGet's deferred shell. */
function refreshV1() {
  var viewer, payload = {}, err = '';
  try {
    viewer = resolveViewerV1_(whoIsVisitingV1_());
    payload = viewer.ok ? payloadForV1_(viewer) : {};
  } catch (ex) {
    viewer = { email: '', role: PORTAL.ROLE.NONE, name: '', ok: false,
               why: String(ex.message || ex) };
    err = String(ex.message || ex);
  }
  return {
    viewer: { email: viewer.email, role: viewer.role, name: viewer.name,
              ok: viewer.ok, why: viewer.why },
    data: payload,
    mode: safeModeV1_(),
    error: err
  };
}

/** Blocks a leading = + - @ so submitted text cannot become a formula. */
function clean_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/**
 * Training Division brings a new trainee into Field Training from the web app.
 *
 * Writes one row to 01 TRAINEE MASTER and refreshes Trainee LIST choices on
 * the registered Google Forms so the forms already in service offer them.
 */
function addTraineeV1(payload) {
  requireWritableV1_('add a trainee');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may add a trainee from Field Training.');
  }
  var req = parseAddTraineeRequestV1_(payload || {});
  if (!req || !req.name) throw new Error('Type their full name.');
  if (!req.email) throw new Error('Type their work email — that is how they sign in.');
  if (!req.level) {
    throw new Error('Pick a level: EMT, Advanced EMT, or Paramedic.');
  }

  var plan = addTraineePlanV1_([req]);
  if (plan.problem) throw new Error(plan.problem);
  if (plan.already.length) {
    throw new Error(plan.already[0].name + ' is already on the trainee master.');
  }
  if (plan.closed.length) {
    throw new Error(plan.closed[0].name +
      ' is closed/released on the master. Re-opening them is a person decision in the tracker.');
  }
  if (plan.clash.length) {
    throw new Error(plan.clash[0].req.email + ' already belongs to ' +
      plan.clash[0].owner.name + '.');
  }
  if (plan.badFto.length) {
    throw new Error((plan.badFto[0].fto || 'That officer') +
      ' is not on the active FTO roster. Add them with addFto first, or leave FTO blank.');
  }
  if (plan.incomplete.length || !plan.add.length) {
    throw new Error('Name, email, and level are required.');
  }

  var note = applyAddTraineePlanV1_(plan);
  var msg = typeof note === 'string' ? note : String(note || '');
  auditV1_('TRAINEE ADDED', viewer.email, req.name + ' | ' + req.level + ' | ' + req.email);
  // Short message for the phone; full note is in Executions / Logger.
  return {
    ok: true,
    name: req.name,
    level: req.level,
    message: req.name + ' is in Field Training and on the existing forms.'
  };
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


/* ======================================================================
 * 40_Forms.gs
 * ====================================================================== */

/**
 * The form registry.
 *
 * The nine Google Forms already in service stay exactly as they are. They are
 * the WRITE surface of this system: a submission goes where it has always
 * gone, through the triggers that already exist. This portal is the READ
 * surface and the router. It never changes a trigger, never rewrites form
 * structure, and never submits on anyone's behalf.
 *
 * One exception, on purpose: when a trainee or FTO is added here,
 * syncRegisteredFormChoicesV1_ refreshes Trainee / FTO LIST choices on those
 * same registered forms so the dropdowns already in service offer the new
 * name. That is how Field Training links a new person to the forms you already have
 * — without creating a tenth form.
 *
 * What this file adds is the part that was missing: one authoritative list of
 * which form is which, who it belongs to, and what it is for, so that a person
 * is shown the one form their situation calls for instead of a page of nine
 * links they have to choose between.
 *
 * Two things are cached in script properties because they cost an API call:
 *   PORTAL_FORM_URL_<KEY>   the published URL
 *   PORTAL_FORM_FIELDS_<KEY> the entry.NNN ids used for prefilling
 * Both are discovered by READING the form. Discovery uses createResponse(),
 * which builds a response object in memory; it is never submitted. Nothing in
 * this file writes to a form.
 */

/** Level a form belongs to, when it is level-specific. '' means any level. */
var PORTAL_FORMS = [

  { key: 'FTO_EVAL',
    id: '1VzbpZvnOqpxOFReKctU6XeJdQDZPIlcgL3a4JkomCrQ',
    title: 'End-of-shift evaluation',
    blurb: 'The shift you just worked. Ratings, one strength, one thing to work on.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '02 FTO SHIFT EVAL RAW',
    prefill: { fto: /^(fto|your name|evaluat|training officer)/i,
               trainee: /trainee/i } },

  { key: 'SELF_REFLECTION',
    id: '1L5SOaVOlpaZLn-Xn5ZJxyFUtCFZ0PLsQLpENbUqNVm0',
    title: 'Self-reflection',
    blurb: 'Your own account of how it went. Your FTO reads it before your next shift.',
    roles: ['TRAINEE'],
    perTrainee: false,
    level: '',
    landsIn: '03 SELF-REFLECTION RAW',
    prefill: { trainee: /^(trainee|your name|name)/i } },

  { key: 'URGENT_CONCERN',
    id: '1L5qB6Mqq9kGir1jdlQrjl7HznPcdyPmHXQocoMvness',
    title: 'Urgent concern',
    blurb: 'Patient safety or conduct that cannot wait for the next evaluation.',
    roles: ['TRAINEE', 'FTO', 'SUPERVISOR', 'TRAINING_DIVISION'],
    perTrainee: false,
    level: '',
    urgent: true,
    landsIn: '04 URGENT CONCERNS RAW',
    prefill: { fto: /^(your name|reported by|name)/i,
               trainee: /trainee/i } },

  { key: 'DECISION_RECORD',
    id: '1SkwoC-RxkNPu85F4OXFUVj41Jvv8vj8YBI_QqWizNgU',
    title: 'Training decision record',
    blurb: 'Advance a phase, extend, or hold. The written record of the decision.',
    roles: ['TRAINING_DIVISION'],
    perTrainee: true,
    level: '',
    landsIn: '12 DECISION QUEUE',
    prefill: { trainee: /trainee/i } },

  { key: 'HANDOVER',
    id: '1IKwMUneMjH-OL3nx_r_k-d4gnq6WlwLQxEbxOKHL_uE',
    title: 'Handover card',
    blurb: 'Covering someone else’s trainee today. What the regular FTO needs to know.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '',
    prefill: { fto: /^(your name|covering|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_EMT',
    id: '1nhl49xC6v6gMzFb_CZafJaM1zlIVEvbrquDOGSg6YDQ',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'emt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_AEMT',
    id: '1H39FqiIQGIJ-CWFnhDfWs7MWjJMJyMIYfdGqVhFOdgw',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'aemt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_PMD',
    id: '1Ykg2qmx-C3Q2TzUPK287loucSPYlOhW8t6dtpYR0VTI',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'pmd',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  /* Retired, and the reason is not cosmetic - but it is narrower than it
     first looked. This form IS linked to the tracker, so its responses do
     arrive: Google drops them into a response tab of their own. What has
     never happened is the step that turns a response into a row in the
     evidence log, because no submit trigger is bound to the form. So the
     answers are present and unused rather than absent.

     The portal must not send anyone here while that is true, and the Training
     Division view says so. unprocessedResponses() lists what is waiting.
     Nothing about the form itself is changed by this portal. */
  { key: 'SKILLS_COMBINED',
    id: '1Q1R2bQPQe3eDbiDQTGJJHtzgAOC9jhEJJUkeh2w2u4s',
    title: 'Skills quick log (all levels)',
    blurb: 'Superseded by the three level-specific logs.',
    roles: [],
    perTrainee: false,
    level: '',
    retired: true,
    retiredWhy: 'No submit trigger is bound to it. Responses do land in the ' +
      'tracker, in a response tab of their own, but nothing turns them into rows ' +
      'in the evidence log. Run unprocessedResponses() to see them.',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: {} }
];

/** Registry lookup by key. Returns null rather than throwing, because a
 *  missing form must degrade to "no link" and never to a broken page. */
function formByKeyV1_(key) {
  for (var i = 0; i < PORTAL_FORMS.length; i++) {
    if (PORTAL_FORMS[i].key === key) return PORTAL_FORMS[i];
  }
  return null;
}

/** Are form links live? Off in staging by default: a sandbox user tapping a
 *  link would land on the REAL form, and a submission there is a production
 *  write nobody approved. Turn it on deliberately with enableFormLinks(). */
function formLinksLiveV1_() {
  var p = String(PropertiesService.getScriptProperties()
    .getProperty('PORTAL_FORM_LINKS') || '').toUpperCase();
  if (p === 'ON') return true;
  if (p === 'OFF') return false;
  return modeV1_() !== PORTAL.MODE_STAGING;
}

/* ---------------- URLs ---------------- */

/** The published URL, cached. Falls back to the document URL, which resolves
 *  for anyone in the county domain, so a forms-scope failure costs prefill
 *  but never costs the link. */
function formUrlV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_URL_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) return hit;
  var url = '';
  try { url = FormApp.openById(entry.id).getPublishedUrl(); } catch (e) { url = ''; }
  if (!url) url = 'https://docs.google.com/forms/d/' + entry.id + '/viewform';
  try { props.setProperty(cacheKey, url); } catch (e) {}
  return url;
}

/** entry.NNN ids for the fields this portal knows how to prefill, cached.
 *  Discovery reads the form and builds an unsubmitted response to see which
 *  parameter carries which item. It never calls submit(). */
function formFieldsV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_FIELDS_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var map = {};
  try {
    var form = FormApp.openById(entry.id);
    var items = form.getItems();
    var wanted = entry.prefill || {};
    Object.keys(wanted).forEach(function (field) {
      var re = wanted[field];
      for (var i = 0; i < items.length; i++) {
        var found = probeItemV1_(form, items[i], re);
        if (found) { map[field] = found; break; }
      }
    });
  } catch (e) { map = {}; }

  try { props.setProperty(cacheKey, JSON.stringify(map)); } catch (e) {}
  return map;
}

/** One item: does its title match, and if so what is its entry id?
 *  Text items prefill with anything. Choice items prefill only with a value
 *  the form already offers, so the choices come back with the id. */
function probeItemV1_(form, item, re) {
  var title = '';
  try { title = String(item.getTitle() || ''); } catch (e) { return null; }
  if (!re.test(title)) return null;

  var type = String(item.getType());
  var response = null, choices = null;
  try {
    if (type === 'TEXT') {
      response = item.asTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'PARAGRAPH_TEXT') {
      response = item.asParagraphTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'LIST') {
      choices = item.asListItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asListItem().createResponse(choices[0]);
    } else if (type === 'MULTIPLE_CHOICE') {
      choices = item.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asMultipleChoiceItem().createResponse(choices[0]);
    } else {
      return null;
    }
  } catch (e) { return null; }

  var url = '';
  try { url = form.createResponse().withItemResponse(response).toPrefilledUrl(); } catch (e) { return null; }
  var m = url.match(/[?&](entry\.[0-9]+(?:_sentinel)?)=/);
  if (!m) return null;
  return { id: m[1], type: type, choices: choices, title: title };
}

/** A prefilled link, or the plain link when nothing can be prefilled.
 *  values is { fto: 'Dana Whitlock', trainee: 'Jamie Rivers' }. */
function prefilledUrlV1_(entry, values) {
  var base = formUrlV1_(entry);
  var vals = values || {};
  var fields;
  try { fields = formFieldsV1_(entry); } catch (e) { fields = {}; }

  var parts = [];
  Object.keys(vals).forEach(function (field) {
    var v = String(vals[field] == null ? '' : vals[field]).trim();
    var f = fields[field];
    if (!v || !f || !f.id) return;
    if (f.choices && f.choices.length) {
      var match = null;
      for (var i = 0; i < f.choices.length; i++) {
        if (normNameV1_(f.choices[i]) === normNameV1_(v)) { match = f.choices[i]; break; }
      }
      if (!match) return;              // never prefill a choice the form does not offer
      v = match;
    }
    parts.push(f.id + '=' + encodeURIComponent(v));
  });

  if (!parts.length) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'usp=pp_url&' + parts.join('&');
}

/* ---------------- what a person is offered ---------------- */

/** Turns a registry entry into the card the page renders. */
function formCardV1_(entry, values, subtitle) {
  return {
    key: entry.key,
    title: entry.title,
    blurb: subtitle || entry.blurb,
    urgent: !!entry.urgent,
    live: formLinksLiveV1_(),
    url: formLinksLiveV1_() ? prefilledUrlV1_(entry, values || {}) : ''
  };
}

/** The forms a role may open that are not tied to one trainee. */
function generalFormsForV1_(role, values) {
  var out = [];
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** The forms an FTO opens against ONE named trainee, with the right skills
 *  log for that trainee's level already chosen. This is the whole point of
 *  the registry: the FTO never picks a form, and never picks a level. */
function traineeFormsForV1_(role, trainee, values) {
  var out = [];
  var levelKey = trainee && trainee.levelKey ? trainee.levelKey : '';
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (!f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    if (f.level && f.level !== levelKey) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** Every form a role can reach, general and per-trainee, deduplicated by key.
 *  Used by the Training Division view, which is allowed to see the whole set. */
function allFormsForV1_(role, values) {
  var seen = {}, out = [];
  generalFormsForV1_(role, values).concat(traineeFormsForV1_(role, null, values))
    .forEach(function (c) { if (!seen[c.key]) { seen[c.key] = true; out.push(c); } });
  return out;
}

/** Registry entries that are retired, for the Division's system view. */
function retiredFormsV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.retired; })
    .map(function (f) { return { key: f.key, title: f.title, why: f.retiredWhy || '' }; });
}

/**
 * Keep the existing forms' Trainee / FTO dropdowns in step with the master
 * and roster. Called after addTrainee / addFto / undo.
 *
 * Only touches LIST items whose titles match the names the tracker already
 * syncs. Never adds questions, never changes destinations, never submits.
 */
function syncRegisteredFormChoicesV1_() {
  var out = { ok: false, forms: 0, notes: [], why: '' };
  var active;
  try {
    active = traineesV1_().filter(function (t) { return !t.closed; });
  } catch (e) {
    out.why = String(e.message || e);
    return out;
  }
  var allNames = active.map(function (t) { return t.name; }).sort();
  var byLevel = { emt: [], aemt: [], pmd: [] };
  active.forEach(function (t) {
    var k = t.levelKey || levelKeyV1_(t.level);
    if (byLevel[k]) byLevel[k].push(t.name);
  });
  Object.keys(byLevel).forEach(function (k) { byLevel[k].sort(); });

  var ftos = [];
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      if (p.name && ftos.indexOf(p.name) < 0) ftos.push(p.name);
    });
  } catch (e2) {}
  ftos.sort();

  if (typeof FormApp === 'undefined' || !FormApp.openById) {
    out.why = 'FormApp is not available in this runtime';
    return out;
  }

  var touched = 0;
  PORTAL_FORMS.forEach(function (entry) {
    if (entry.retired) return;
    var form;
    try { form = FormApp.openById(entry.id); }
    catch (eOpen) {
      out.notes.push((entry.title || entry.key) + ' unreadable');
      return;
    }
    var traineeList = entry.level
      ? (byLevel[entry.level] || []).slice()
      : allNames.slice();
    var items;
    try {
      items = FormApp.ItemType && FormApp.ItemType.LIST
        ? form.getItems(FormApp.ItemType.LIST)
        : form.getItems().filter(function (it) {
            try { return it.getType && String(it.getType()) === 'LIST'; }
            catch (eT) { return false; }
          });
    } catch (eItems) {
      try { items = form.getItems(); } catch (e2) { items = []; }
    }
    var changed = false;
    (items || []).forEach(function (it) {
      var title = '';
      try { title = String(it.getTitle() || '').trim(); } catch (eTitle) { return; }
      var li;
      try { li = it.asListItem(); } catch (eLi) { return; }
      if (!li || !li.setChoiceValues) return;

      if (title === 'Trainee' || title === 'Trainee involved') {
        var list = traineeList.length ? traineeList
                 : (entry.level ? ['none at this level'] : ['none']);
        try { li.setChoiceValues(list); changed = true; } catch (eSet) {}
      } else if (title === 'Trainee you are covering') {
        try {
          li.setChoiceValues(allNames.length ? allNames : ['none']);
          changed = true;
        } catch (eSet2) {}
      } else if (title === 'FTO name') {
        try {
          li.setChoiceValues(ftos.length ? ftos : ['none in scope']);
          changed = true;
        } catch (eSet3) {}
      }
    });
    if (changed) {
      touched++;
      out.notes.push((entry.title || entry.key) + ' refreshed');
    }
  });

  out.ok = touched > 0 || allNames.length === 0;
  out.forms = touched;
  if (!touched && allNames.length) {
    out.why = 'no LIST items matched on the registered forms';
    out.ok = false;
  }
  return out;
}

/* ---------------- one-click operator functions ---------------- */

/** Turn the real form links on. Deliberate, because in staging this points
 *  sandbox users at production forms. */
function enableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'ON');
  return noteV1_('Form links are ON. In ' + safeModeV1_() + ' mode, cards now open the real forms.');
}

function disableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'OFF');
  return noteV1_('Form links are OFF. Cards render but do not open anything.');
}

/** Reads all nine forms once and caches their URLs and field ids, so the
 *  first person to open the portal does not pay for discovery. Read-only. */
function warmFormCache() {
  var lines = [];
  PORTAL_FORMS.forEach(function (f) {
    var url = '', fields = {}, err = '';
    try { url = formUrlV1_(f); fields = formFieldsV1_(f); }
    catch (e) { err = String(e.message || e); }
    lines.push(f.key + '\n  url    : ' + (url || '(could not read)') +
      '\n  prefill: ' + (Object.keys(fields).length ? Object.keys(fields).join(', ') : 'none found') +
      (err ? '\n  error  : ' + err : '') + (f.retired ? '\n  RETIRED: ' + f.retiredWhy : ''));
  });
  return noteV1_('FORM REGISTRY\n\n' + lines.join('\n\n') +
    '\n\nNothing was written to any form.');
}

/** Forgets the cached URLs and field ids. Run after a form is edited. */
function clearFormCache() {
  var props = PropertiesService.getScriptProperties();
  PORTAL_FORMS.forEach(function (f) {
    props.deleteProperty('PORTAL_FORM_URL_' + f.key);
    props.deleteProperty('PORTAL_FORM_FIELDS_' + f.key);
  });
  return noteV1_('Form cache cleared. It rebuilds on the next page load.');
}

/** Logs and, when there is a UI, shows a message. Returns it either way. */
function noteV1_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}


/* ======================================================================
 * 50_Production.gs
 * ====================================================================== */

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

  // setUpStaging switches the form links OFF, because a sandbox user tapping
  // a form card would land on the REAL form and submit a live row. That reason
  // dies the moment this portal is pointed at the real tracker - but the
  // property does not, and a hard OFF beats the mode. Left alone it means
  // every screen shows "Form links are switched off in this mode" and nobody
  // can reach a form from the portal at all. So leaving staging clears it.
  var linksWere = String(props.getProperty('PORTAL_FORM_LINKS') || '').toUpperCase();
  if (linksWere === 'OFF') props.deleteProperty('PORTAL_FORM_LINKS');
  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();

  return noteV1_('POINTED AT PRODUCTION, READ ONLY\n\n' +
    'Spreadsheet : ' + name + '\n' +
    'Was pointed at: ' + previous + '\n\n' +
    'Mode is now PRODUCTION. Every write in this portal refuses in this mode:\n' +
    '  approving a sign-off, filing a reflection, acknowledging coaching,\n' +
    '  switching role for testing.\n' +
    'The forms are unaffected and remain the way anything gets written.\n\n' +
    (linksWere === 'OFF'
      ? 'The form links were switched off for the sandbox and are back on now.\n' +
        'That switch exists so a practice user cannot submit to a real form,\n' +
        'and it has no reason to survive the move here.\n\n'
      : '') +
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
    // The portal's own tabs. It makes these itself; their absence is not a
    // reason to refuse the mode, it is a thing to do on the way in.
    if (tn === PORTAL.TAB.COACHING || tn === PORTAL.TAB.AUDIT ||
        tn === PORTAL.TAB.ACKS) return;
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

  // Somewhere to record what people do. This is not decoration: allowing a
  // decision and keeping no record of who made it is worse than not allowing
  // it, and auditV1_ returns quietly when the tab is absent - so without this
  // the mode would promise a log it was not writing.
  var auditState = ensureAuditLogV1_();
  if (auditState === 'failed') {
    throw new Error('Not going live. There is nowhere to record what people ' +
      'do: the tab ' + PORTAL.TAB.AUDIT + ' is not in this spreadsheet and ' +
      'could not be created. Allowing a sign-off and keeping no record of who ' +
      'approved it is worse than not allowing it. Nothing was changed.');
  }

  // Somewhere to record a finding having been seen. Same reasoning as the
  // audit log: a screen that offers to record an acknowledgment and then puts
  // it nowhere is worse than one that does not offer it.
  if (!ensureAckLogV1_()) {
    throw new Error('Not going live. The tab ' + PORTAL.TAB.ACKS + ' is not in ' +
      'this spreadsheet and could not be created, so the Training Division ' +
      'could say it had seen a finding and nothing would record that it had. ' +
      'Nothing was changed.');
  }

  // Coaching notes need a home before FTOs can file them from Tonight.
  if (!ensureCoachingLogV1_()) {
    throw new Error('Not going live. The tab ' + PORTAL.TAB.COACHING + ' is not in ' +
      'this spreadsheet and could not be created, so coaching filed from Field Training ' +
      'would have nowhere to live. Nothing was changed.');
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
    '  Training Division can record a sign-off (permanent log + queue closed).',
    '  Training Division can advance phase, clear for the truck, and enroll a trainee.',
    '  Training Division can assign who trains whom.',
    '  An FTO can file a coaching note; the trainee can acknowledge it.',
    '  Self-reflection still uses the Self-reflection form in LIVE (not the practice screen).',
    '',
    (auditState === 'created'
      ? 'A tab called ' + PORTAL.TAB.AUDIT + ' has been added to record who does\n' +
        'what. It was not there, and without it those actions would have been\n' +
        'allowed and never written down. No existing tab was touched.'
      : 'Each of those is written to ' + PORTAL.TAB.AUDIT + ' under the name of\n' +
        'whoever did it. PRODUCTION mode was discarding those entries.'),
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

/** Makes sure there is somewhere to record what people do.
 *
 *  Additive and nothing else: it adds one tab that belongs to the portal, and
 *  it never touches a tab that is already there. Returns 'present', 'created'
 *  or 'failed'. */
function ensureAuditLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.AUDIT)) return 'present';
    var sh = book.insertSheet(PORTAL.TAB.AUDIT);
    sh.getRange(1, 1).setValue(
      'Who did what in the portal. Written by the portal; do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 5)
      .setValues([['WHEN', 'WHAT', 'WHO', 'DETAIL', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return 'created';
  } catch (e) { return 'failed'; }
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


/* ======================================================================
 * 60_History.gs
 * ====================================================================== */

/**
 * Everything that was ever submitted, arranged newest first.
 *
 * The raw tabs are the archive and they stay exactly as they are. Nothing in
 * this file deletes a row, moves a row, overwrites a row, or decides that an
 * old submission no longer matters. It reads, groups, and orders.
 *
 * What it produces for one person:
 *
 *   CURRENT   the most recent submission of each kind, in full
 *   EARLIER   every submission before it, also in full, in order
 *
 * A submission is never summarised or trimmed on the way through. Every named
 * column that had a value in it comes out the other side with its own label,
 * because the whole point is that nothing gathered so far is lost.
 *
 * Two rows of the same kind on the same day are flagged as a possible
 * duplicate. Flagged, not removed. Which one is right is a judgement about a
 * personnel record and this code does not make it.
 */

/** The raw tabs a person's record is assembled from.
 *
 *  Columns are found by header, with a positional fallback for the tabs whose
 *  headers a form rewrote. `who` and `when` are structural; everything else
 *  is carried through as-is, so a column added to a form tomorrow appears in
 *  the record without this file changing. */
var PORTAL_SOURCES = [
  // One evaluation per shift is the model, so two for one shift is worth
  // raising even when they differ - the second is usually a correction and
  // somebody has to say which stands.
  { key: 'EVAL', tab: PORTAL.TAB.EVAL, title: 'Shift evaluation', oncePerDay: true,
    who:  { re: /^trainee/i,                    at: 2 },
    when: { re: /shift date|^timestamp|^date/i, at: 0 },
    by:   { re: /^(fto|evaluator|training officer)/i, at: 1 } },

  { key: 'REFLECT', tab: PORTAL.TAB.REFLECT, title: 'Self-reflection', oncePerDay: true,
    who:  { re: /^trainee|^your name|^name/i,   at: 1 },
    when: { re: /^timestamp|^date/i,            at: 0 },
    by:   null },

  // The positional fallback for `who` used to be column 3. On the live tab
  // column 3 is Role, not the trainee - the header is at column 4. Falling
  // back to a fixed position on a form-response tab is how a record ends up
  // attributed to "FTO" instead of to a person, so this one resolves by
  // header or not at all. `Reporter` is the live header and matched none of
  // the old patterns; it does now.
  { key: 'URGENT', tab: PORTAL.TAB.URGENT, title: 'Urgent concern',
    who:  { re: /^trainee/i,                          at: -1 },
    when: { re: /^timestamp|^date$|^date /i,          at: 0 },
    by:   { re: /^reporter|^your name|reported by/i,  at: 2 },
    restricted: true },

  { key: 'EVIDENCE', tab: PORTAL.TAB.EVIDENCE, title: 'Skill logged',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /event date|^timestamp|^date/i, at: -1 },
    by:   { re: /^(fto|logged by)/i,            at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'SIGNOFF', tab: PORTAL.TAB.SIGNOFF, title: 'Sign-off',
    who:  { re: /^trainee/i,                    at: -1 },
    when: { re: /^(sign-?off )?date|^timestamp/i, at: -1 },
    by:   { re: /signed off by|approved by|decided by/i, at: -1 },
    groupBy: { re: /^skill$|^skill name/i,      at: -1 } },

  { key: 'COACHING', tab: PORTAL.TAB.COACHING, title: 'Coaching note',
    who:  { re: /^trainee/i,                    at: 1 },
    when: { re: /^date|^timestamp/i,            at: 0 },
    by:   { re: /^from/i,                       at: 2 } }
];

/** Column index by header pattern, falling back to a fixed position.
 *  Returns -1 when neither finds one, and callers treat that as "no column"
 *  rather than guessing at column A. */
function colIndexV1_(t, spec) {
  if (!spec) return -1;
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && spec.re.test(t.headers[i])) return i;
  }
  return spec.at >= 0 ? spec.at : -1;
}

var PORTAL_ACRONYMS = ['FTO','EMT','AEMT','EMS','ALS','BLS','ID','PCR','IV','IO',
                       'CPR','ECG','EKG','QA','QI','MD','NREMT'];

/** 'WHAT WENT WELL' reads as shouting in a record someone has to sit and
 *  read for twenty minutes. Sentence case, and acronyms keep their case. */
function labelForV1_(header) {
  return String(header || '').split(/\s+/).map(function (w, i) {
    var bare = w.replace(/[^A-Za-z]/g, '');
    if (bare && PORTAL_ACRONYMS.indexOf(bare.toUpperCase()) >= 0) return w.toUpperCase();
    var lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(' ');
}

/** A cell as a person would read it. Dates become dates; nothing is cut. */
function displayValueV1_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toDateString();
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+$/, '');
}

function dayKeyV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime()))
    ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : '';
}

/** Every submission in one tab belonging to one person, newest first.
 *  Undated rows sort last rather than being dropped. */
function submissionsFromV1_(source, norm) {
  var t = readTabAllV1_(source.tab);
  if (!t.ok) return [];

  var whoIdx  = colIndexV1_(t, source.who);
  if (whoIdx < 0) return [];
  var whenIdx = colIndexV1_(t, source.when);
  var byIdx   = colIndexV1_(t, source.by);
  var grpIdx  = colIndexV1_(t, source.groupBy);

  var out = [];
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[whoIdx]) !== norm) return;
    var fields = [];
    t.headers.forEach(function (h, ci) {
      if (!h) return;
      if (ci === whoIdx || ci === whenIdx || ci === byIdx) return;
      var v = r[ci];
      if (v === '' || v === null || v === undefined) return;
      fields.push({ label: labelForV1_(h), value: displayValueV1_(v) });
    });
    out.push({
      key: source.key,
      source: source.title,
      tab: source.tab,
      row: realRowV1_(t, i),
      book: rowSourceV1_(t, i),
      when: whenIdx >= 0 ? asDateV1_(r[whenIdx]) : null,
      by: byIdx >= 0 ? String(r[byIdx] || '').trim() : '',
      group: grpIdx >= 0 ? String(r[grpIdx] || '').trim() : '',
      fields: fields
    });
  });

  out.sort(function (a, b) {
    if (a.when && b.when) return b.when - a.when;
    if (a.when) return -1;
    if (b.when) return 1;
    return b.row - a.row;
  });
  return out;
}

/** What makes two rows the SAME submission rather than two of them.
 *
 *  This used to be "same person, same day", and it was wrong enough to matter:
 *  it called 119 things duplicates on a real tracker. An FTO logging three
 *  reps of a skill across one shift produces three rows on one day, and that
 *  is the system working. A number that large is not a warning, it is noise,
 *  and noise is how a real duplicate gets ignored.
 *
 *  So: if the rows carry the id of the form response they came from, they are
 *  the same submission only when that id matches. Two different submissions
 *  are two different events however alike they look.
 *
 *  Only where there is no id to go on does it fall back to content: same
 *  author, same day, every field identical. */
function dupKeyV1_(s, oncePerDay) {
  // Some things happen once. An evaluation covers a shift, so two of them for
  // one shift is a correction and worth raising whatever they say. Skill
  // evidence is the opposite: three reps across one shift is three events.
  if (oncePerDay) {
    var day = dayKeyV1_(s.when);
    // Undated once-a-day rows must not all collapse onto DAY:| and flag each other.
    if (!day) return 'DAY:UNDATED:' + String(s.row);
    return 'DAY:' + (s.group || '') + '|' + day;
  }
  var id = '';
  (s.fields || []).forEach(function (f) {
    if (!id && /^(source\s+)?response\s+id$/i.test(String(f.label))) {
      id = String(f.value == null ? '' : f.value).trim();
    }
  });
  if (id) return 'ID:' + id;

  var parts = (s.fields || []).map(function (f) {
    return String(f.label).toLowerCase() + '=' +
           String(f.value == null ? '' : f.value).trim().toLowerCase();
  });
  parts.sort();
  return 'C:' + String(s.by || '').toLowerCase() + '|' + dayKeyV1_(s.when) + '|' + parts.join('|');
}

/** Marks the newest of each group as current, everything else as earlier, and
 *  true duplicates as duplicates. Nothing is removed. */
function markCurrentV1_(list, grouped, oncePerDay) {
  var seen = {}, byKey = {};
  list.forEach(function (s) {
    var g = grouped ? (s.group || '(unnamed)') : '*';
    s.current = !seen[g];
    seen[g] = true;
    s.dupKey = dupKeyV1_(s, oncePerDay);
    byKey[s.dupKey] = (byKey[s.dupKey] || 0) + 1;
  });
  list.forEach(function (s) { s.possibleDuplicate = byKey[s.dupKey] > 1; });
  return list;
}

function whenTextV1_(d) {
  return (d instanceof Date && !isNaN(d.getTime())) ? d.toDateString() : 'no date recorded';
}

/** One person's whole record: what is current, and everything before it.
 *  `only` restricts which sources are read, which is how the Medical Director
 *  gets urgent concerns and nothing else. */
function recordForV1_(name, only) {
  var norm = normNameV1_(name);
  var sections = [], timeline = [], total = 0, duplicates = 0;
  var settled = settledDuplicateKeysV1_();

  PORTAL_SOURCES.forEach(function (src) {
    if (only && only.indexOf(src.key) < 0) return;
    var list = markCurrentV1_(submissionsFromV1_(src, norm), !!src.groupBy, !!src.oncePerDay);
    if (!list.length) return;
    total += list.length;

    list.forEach(function (s) {
      if (!s.possibleDuplicate) return;
      if (settled[settlementIdV1_(name, src.tab, s.dupKey)]) {
        s.possibleDuplicate = false;
        s.settledDuplicate = true;
      }
    });

    var current = list.filter(function (s) { return s.current; });
    var earlier = list.filter(function (s) { return !s.current; });
    duplicates += list.filter(function (s) { return s.possibleDuplicate; }).length;

    sections.push({
      key: src.key,
      title: src.title,
      grouped: !!src.groupBy,
      count: list.length,
      newest: list[0].when ? whenTextV1_(list[0].when) : '',
      newestAgo: daysAgoTextV1_(list[0].when),
      current: current.map(shapeV1_),
      earlier: earlier.map(shapeV1_)
    });

    list.forEach(function (s) { timeline.push(shapeV1_(s)); });
  });

  timeline.sort(function (a, b) {
    if (a.at && b.at) return b.at - a.at;
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });
  timeline.forEach(function (s) { delete s.at; });

  return {
    name: String(name || ''),
    sections: sections,
    timeline: timeline,
    total: total,
    duplicates: duplicates
  };
}

function shapeV1_(s) {
  return {
    key: s.key, source: s.source, tab: s.tab, row: s.row, book: s.book || '',
    when: whenTextV1_(s.when), ago: daysAgoTextV1_(s.when),
    at: s.when instanceof Date && !isNaN(s.when.getTime()) ? s.when.getTime() : 0,
    by: s.by, group: s.group,
    current: !!s.current, possibleDuplicate: !!s.possibleDuplicate,
    settledDuplicate: !!s.settledDuplicate,
    fields: s.fields
  };
}

/** How fresh is each kind of submission for one person. This is the
 *  at-a-glance form of the same question: what is the current state. */
function freshnessForV1_(name) {
  var norm = normNameV1_(name);
  return PORTAL_SOURCES.filter(function (s) { return !s.restricted; })
    .map(function (src) {
      var list = submissionsFromV1_(src, norm);
      return { key: src.key, title: src.title, count: list.length,
               ago: list.length ? daysAgoTextV1_(list[0].when) : 'never',
               when: list.length ? whenTextV1_(list[0].when) : '' };
    });
}

/** Which sources a role may read of another person's record. Returning a
 *  list rather than a yes or no is what lets the Medical Director open a
 *  record at all without seeing routine training detail. */
function recordScopeV1_(viewer, name) {
  var norm = normNameV1_(name);
  var all = PORTAL_SOURCES.map(function (s) { return s.key; });

  if (viewer.role === PORTAL.ROLE.DIVISION) return all;

  if (viewer.role === PORTAL.ROLE.TRAINEE) {
    return normNameV1_(viewer.traineeName) === norm ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.FTO) {
    var mine = traineesV1_().filter(function (t) {
      return normNameV1_(t.fto) === normNameV1_(viewer.name) && t.norm === norm; });
    return mine.length ? all : null;
  }
  if (viewer.role === PORTAL.ROLE.MEDICAL) return ['URGENT'];

  // A supervisor gets situational awareness on their shift, not a training
  // record. That was the rule before this file existed and it does not change
  // because a new screen made it convenient.
  return null;
}

/* ---------------- where two submissions compete ---------------- */

/** Every place two submissions of the same kind landed on the same day, for
 *  everyone still active. This is the list of decisions to make, not a list
 *  of rows to delete: both halves of every pair stay exactly where they are.
 *
 *  Read only in every mode. */
function duplicateSubmissionsV1_() {
  var settled = settledDuplicateKeysV1_();
  var out = [];
  traineesV1_().filter(function (t) { return !t.closed; }).forEach(function (t) {
    PORTAL_SOURCES.forEach(function (src) {
      var list = markCurrentV1_(submissionsFromV1_(src, t.norm), !!src.groupBy, !!src.oncePerDay);
      var byDay = {};
      list.forEach(function (s) {
        if (!s.possibleDuplicate) return;
        var k = s.dupKey;
        (byDay[k] = byDay[k] || []).push(s);
      });
      Object.keys(byDay).forEach(function (k) {
        if (settled[settlementIdV1_(t.name, src.tab, k)]) return;
        var pair = byDay[k];
        out.push({
          trainee: t.name, source: src.title, tab: src.tab, dupKey: k,
          group: pair[0].group || '', when: whenTextV1_(pair[0].when),
          why: String(k).indexOf('ID:') === 0
            ? 'the SAME form response, written twice'
            : (String(k).indexOf('DAY:') === 0
                ? 'two of these for one day, and there should be one'
                : 'identical in every field, same author, same day'),
          count: pair.length, rows: pair.map(function (s) { return s.row; })
        });
      });
    });
  });
  return out;
}

/** The same thing as a report you can read in the script editor, for when the
 *  question is "where do I need to make a call" rather than "show me Jamie". */
function duplicateSubmissionsReport() {
  var dupes = duplicateSubmissionsV1_();
  if (!dupes.length) {
    return noteV1_('No two submissions of the same kind landed on the same day ' +
      'for anyone currently active. Nothing to decide.');
  }
  var lines = ['POSSIBLE DUPLICATE SUBMISSIONS  (read only, nothing was changed)', ''];
  dupes.forEach(function (d) {
    lines.push(d.trainee + '  —  ' + d.source + (d.group ? ' (' + d.group + ')' : ''));
    lines.push('  ' + d.when + '   ' + d.count + ' rows   ' +
      d.why);
    lines.push('  ' + d.tab + ' rows ' + d.rows.join(', '));
    lines.push('');
  });
  lines.push('An evaluation covers a shift, so two for one shift is raised whatever');
  lines.push('they say. Skill evidence is the opposite: three reps across one shift');
  lines.push('are three events, and only a response written twice is a duplicate.');
  lines.push('');
  lines.push('Both halves of every pair are still on file and both are shown in');
  lines.push('the portal. Which one stands is a decision about a personnel');
  lines.push('record, so nothing here makes it for you.');
  return noteV1_(lines.join('\n'));
}


/* ======================================================================
 * 70_Backfill.gs
 * ====================================================================== */

/**
 * The responses that never made it into a tab.
 *
 * A Google Form keeps every response whether or not anything is listening.
 * When a form has no submit trigger bound to it, the answers are still there
 * — they are simply sitting in the form instead of in the tracker. The
 * combined skills log is in exactly that state and has sixteen of them.
 *
 * This file finds them, shows you what they say, and can put them where they
 * were always meant to go. Three rules govern it:
 *
 *   1. A preview writes nothing, in any mode. You see the whole plan first.
 *   2. Writing refuses outside STAGING, so the sandbox proves it before the
 *      live tracker is ever considered.
 *   3. Nothing is dropped to make the shape fit. An answer this code cannot
 *      map to a column is written into the notes column with its question
 *      attached, and if there is nowhere to put it the response is refused
 *      rather than written incomplete.
 *
 * Re-running is safe. Every row carries the form response id it came from and
 * a response already present is skipped, so a second run adds nothing.
 */

/** Question titles that mean the same thing as a column but do not read the
 *  same. Left side is what a form asks, right side is the column it belongs
 *  in. Matching is done on letters and digits only, so case, punctuation and
 *  spacing never matter. */
var PORTAL_ANSWER_ALIASES = {
  'FTONAME':            'FTO',
  'YOURNAME':           'FTO',
  'EVALUATORNAME':      'FTO',
  'TRAININGOFFICER':    'FTO',
  'TRAINEENAME':        'TRAINEE',
  'WHICHTRAINEE':       'TRAINEE',
  'DATEOFEVENT':        'EVENT DATE',
  'SHIFTDATE':          'EVENT DATE',
  'DATE':               'EVENT DATE',
  'SKILLPERFORMED':     'SKILL',
  'WHICHSKILL':         'SKILL',
  'LEVELOFASSISTANCE':  'STAGE',
  'PROMPTINGLEVEL':     'STAGE',
  'RESULT':             'OUTCOME',
  'WASITSUCCESSFUL':    'OUTCOME',
  'COMMENTS':           'NOTE',
  'NOTES':              'NOTE',
  'ADDITIONALCOMMENTS': 'NOTE'
};

function bareV1_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** The column a question belongs in, or '' when nothing matches. */
function columnForAnswerV1_(question, headers) {
  var q = bareV1_(question);
  if (!q) return '';
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && bareV1_(headers[i]) === q) return headers[i];
  }
  var alias = PORTAL_ANSWER_ALIASES[q];
  if (!alias) return '';
  for (var j = 0; j < headers.length; j++) {
    if (headers[j] && bareV1_(headers[j]) === bareV1_(alias)) return headers[j];
  }
  return '';
}

/** Every response on one form, oldest first, as plain data. Read only. */
function formResponsesV1_(entry) {
  var form = FormApp.openById(entry.id);
  return form.getResponses().map(function (r) {
    var answers = [];
    r.getItemResponses().forEach(function (ir) {
      var v = ir.getResponse();
      if (v === null || v === undefined || v === '') return;
      answers.push({
        question: String(ir.getItem().getTitle() || ''),
        value: (v instanceof Array) ? v.join(', ') : String(v)
      });
    });
    var who = '';
    try { who = String(r.getRespondentEmail() || ''); } catch (e) { who = ''; }
    return { id: String(r.getId()), at: r.getTimestamp(), email: who, answers: answers };
  });
}

/** Which column on the destination tab holds the id of the response a row
 *  came from. Without one there is no way to tell a re-run from a duplicate,
 *  so the plan stops rather than risk writing the same evidence twice. */
function responseIdColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /SOURCE RESPONSE ID|RESPONSE ID/i.test(t.headers[i])) return t.headers[i];
  }
  return '';
}

function notesColumnV1_(t) {
  for (var i = 0; i < t.headers.length; i++) {
    if (t.headers[i] && /^(NOTE|NOTES|COMMENT|COMMENTS|DETAIL|WHAT HAPPENED)/i.test(t.headers[i])) {
      return t.headers[i];
    }
  }
  return '';
}

/** What backfilling one form would do. Builds every row in full and returns
 *  it. Writes nothing, in any mode. */
function backfillPlanV1_(entry) {
  var plan = { key: entry.key, title: entry.title, dest: entry.landsIn || '',
               total: 0, present: 0, missing: [], blocked: [], problem: '' };

  if (!entry.landsIn) { plan.problem = 'This form has no destination tab, so there is nowhere to put its responses.'; return plan; }

  var t = readTabV1_(entry.landsIn);
  if (!t.ok) { plan.problem = 'The tab ' + entry.landsIn + ' is not in this spreadsheet.'; return plan; }

  var idCol = responseIdColumnV1_(t);
  if (!idCol) {
    plan.problem = entry.landsIn + ' has no response id column, so a second run ' +
      'could not tell an already-imported response from a new one. Nothing will be written.';
    return plan;
  }
  var noteCol = notesColumnV1_(t);

  var seen = {};
  t.rows.forEach(function (r) {
    var v = String(r[t.col[idCol.toUpperCase()]] || '').trim();
    if (v) seen[v] = true;
  });

  var responses;
  try { responses = formResponsesV1_(entry); }
  catch (e) { plan.problem = 'Could not read the form: ' + (e.message || e); return plan; }

  plan.total = responses.length;

  responses.forEach(function (resp) {
    if (seen[resp.id]) { plan.present++; return; }

    var mapped = {}, spare = [];
    resp.answers.forEach(function (a) {
      var col = columnForAnswerV1_(a.question, t.headers);
      if (!col) { spare.push(a); return; }
      // A question that belongs in the notes column goes in as it was
      // written. Only an answer with no column of its own carries its
      // question with it, because there the question is the label.
      mapped[col] = (col === noteCol && mapped[col])
        ? (mapped[col] + '\n' + a.value) : a.value;
    });

    // Everything that did not land in a column of its own goes into the notes
    // column with its question attached. Losing an answer to make the shape
    // fit is the one thing this must not do.
    var extra = spare.map(function (a) { return a.question + ': ' + a.value; }).join('\n');
    if (extra && !noteCol) {
      plan.blocked.push({ id: resp.id, at: resp.at, why:
        entry.landsIn + ' has no notes column, and ' + spare.length +
        ' answer(s) have nowhere to go. Add a NOTE column or these stay in the form.',
        answers: resp.answers });
      return;
    }
    if (extra) {
      mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + extra) : extra;
    }
    mapped[idCol] = resp.id;

    plan.missing.push({
      id: resp.id,
      at: resp.at,
      email: resp.email,
      mapped: mapped,
      unmappedCount: spare.length,
      row: t.headers.map(function (h) {
        if (!h) return '';
        var v = mapped[h];
        return v === undefined ? '' : clean_(v);
      })
    });
  });

  return plan;
}

/** Every form's plan. Read only. */
function backfillPlanAllV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.landsIn; })
    .map(function (f) { return backfillPlanV1_(f); });
}

/** What would be imported, and what would not. Writes nothing, in any mode,
 *  so this is safe to run against the live tracker. */
function backfillPreview() {
  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL PREVIEW  (read only, nothing was written)', '',
               'Target : ' + safeTargetNameV1_(),
               'Mode   : ' + safeModeV1_() +
                 (mayWriteV1_() ? '  writes allowed' : '  READ ONLY, nothing can be written'), ''];
  var totalMissing = 0, totalBlocked = 0;

  plans.forEach(function (p) {
    lines.push(p.title + '  (' + p.key + ')');
    if (p.problem) { lines.push('  cannot import: ' + p.problem); lines.push(''); return; }
    lines.push('  responses on the form : ' + p.total);
    lines.push('  already in ' + p.dest + ' : ' + p.present);
    lines.push('  would be added        : ' + p.missing.length);
    if (p.blocked.length) lines.push('  would be REFUSED      : ' + p.blocked.length);
    totalMissing += p.missing.length;
    totalBlocked += p.blocked.length;

    p.missing.slice(0, 5).forEach(function (m) {
      lines.push('    ' + (m.at ? m.at.toDateString() : 'no date') + '  ' +
        (m.mapped['TRAINEE'] || m.mapped['Trainee'] || '(no trainee named)') +
        (m.unmappedCount ? '   ' + m.unmappedCount + ' answer(s) into notes' : ''));
    });
    if (p.missing.length > 5) lines.push('    ... and ' + (p.missing.length - 5) + ' more');
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
    lines.push('');
  });

  lines.push('---');
  lines.push(totalMissing + ' response(s) would be added, ' + totalBlocked + ' refused.');
  lines.push('');
  if (!mayWriteV1_()) {
    lines.push('This portal is in ' + safeModeV1_() + ' mode and will not write. To try the');
    lines.push('import for real, run pointAtStaging() and then backfillIntoStaging().');
  } else {
    lines.push('Run backfillIntoStaging() to write these into the sandbox.');
  }
  return noteV1_(lines.join('\n'));
}

function safeTargetNameV1_() {
  try { return targetBookV1_().getName(); } catch (e) { return '(not pointed anywhere)'; }
}

/** Writes the missing responses in. Refuses outside STAGING.
 *
 *  Idempotent: a response already carrying its id in the destination tab is
 *  skipped, so running this twice adds nothing the second time. */
function backfillIntoStaging() {
  requireStagingV1_('import historical form responses');

  var plans = backfillPlanAllV1_();
  var lines = ['BACKFILL', '', 'Target : ' + safeTargetNameV1_(), ''];
  var written = 0, refused = 0;

  plans.forEach(function (p) {
    if (p.problem) { lines.push(p.title + ' : skipped — ' + p.problem); return; }
    if (!p.missing.length && !p.blocked.length) {
      lines.push(p.title + ' : nothing to add (' + p.present + ' already in ' + p.dest + ')');
      return;
    }
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { lines.push(p.title + ' : skipped — ' + p.dest + ' disappeared'); return; }

    p.missing.forEach(function (m) { sh.appendRow(m.row); written++; });
    refused += p.blocked.length;
    lines.push(p.title + ' : ' + p.missing.length + ' added to ' + p.dest +
      (p.blocked.length ? ', ' + p.blocked.length + ' refused' : ''));
    p.blocked.forEach(function (b) { lines.push('    REFUSED  ' + b.why); });
  });

  forgetTabsV1_();
  auditV1_('BACKFILL', whoIsAskingV1_(), written + ' rows written, ' + refused + ' refused');

  lines.push('');
  lines.push(written + ' row(s) written, ' + refused + ' refused.');
  lines.push('Every row carries the form response id it came from, so running');
  lines.push('this again adds nothing.');
  return noteV1_(lines.join('\n'));
}


/* ======================================================================
 * 80_Import.gs
 * ====================================================================== */

/**
 * A production write, and the way back out of it.
 *
 * Almost everything else here refuses to touch the live tracker. This does
 * not, and that is the whole reason it lives in its own file with its own
 * gate. 96_Roster.gs is the only other one, and it uses this same gate.
 *
 * WHAT IT DOES
 *   Appends form responses that never reached a tab. Additive only. It never
 *   edits a cell that already has a value, never deletes a row, never touches
 *   the trainee master, the validation queue, or any decision column.
 *
 * WHAT STOPS IT
 *   A script property whose value must be the id of the spreadsheet it is
 *   about to write to. Not "YES", not "true" - the id itself, typed by hand.
 *   A confirmation left over from the sandbox therefore cannot fire against
 *   production, because it names the wrong book.
 *
 * HOW IT COMES BACK OUT
 *   Every run writes a manifest to PORTAL BACKFILL LOG: which response went
 *   into which row, and what the sheet's row count was before and after.
 *   undoLastBackfill() re-reads each of those rows, checks it still carries
 *   the response id the manifest says it should, and removes only those. If
 *   one row does not match, nothing is deleted at all.
 */

var PORTAL_BACKFILL_CONFIRM = 'PORTAL_BACKFILL_CONFIRM';
var PORTAL_BACKFILL_LOG = 'PORTAL BACKFILL LOG';

/** The before picture. Writes nothing, in any mode, against any book.
 *  This is the thing to run first and to keep. */
function backfillBeforeAndAfter() {
  var plans = backfillPlanAllV1_().filter(function (p) {
    return p.missing.length || p.blocked.length || p.problem; });

  var lines = ['BEFORE AND AFTER  (nothing has been written)', '',
    'Target : ' + safeTargetNameV1_(),
    'Id     : ' + safeTargetIdV1_(),
    'Mode   : ' + safeModeV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'Google is not naming this account'),
    ''];

  if (!plans.length) {
    lines.push('Every response on every registered form is already in the tracker.');
    lines.push('There is nothing to import.');
    return noteV1_(lines.join('\n'));
  }

  plans.forEach(function (p) {
    lines.push('=======================================================');
    lines.push(p.title + '  (' + p.key + ')');
    lines.push('=======================================================');
    if (p.problem) { lines.push('CANNOT IMPORT: ' + p.problem); lines.push(''); return; }

    var t = readTabV1_(p.dest);
    lines.push('');
    lines.push('BEFORE');
    lines.push('  ' + p.dest + ' holds ' + t.rows.length + ' rows');
    lines.push('  ' + p.present + ' of the form\'s ' + p.total + ' responses are already among them');
    lines.push('');
    lines.push('WOULD BE ADDED  (' + p.missing.length + ' rows, appended at the bottom)');
    p.missing.forEach(function (m, i) {
      lines.push('  ' + (i + 1) + '.  ' + (m.at ? m.at.toDateString() : 'no date') +
                 '   response ' + m.id);
      t.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = m.row[ci];
        if (v === '' || v === undefined) return;
        lines.push('        ' + labelForV1_(h) + ': ' + String(v).replace(/\n/g, ' / '));
      });
    });

    if (p.blocked.length) {
      lines.push('');
      lines.push('WOULD BE REFUSED  (' + p.blocked.length + ')');
      p.blocked.forEach(function (b) {
        lines.push('  ' + b.id + '  ' + b.why);
        b.answers.forEach(function (a) { lines.push('        ' + a.question + ': ' + a.value); });
      });
    }

    lines.push('');
    lines.push('AFTER');
    lines.push('  ' + p.dest + ' would hold ' + (t.rows.length + p.missing.length) + ' rows');
    lines.push('  nothing already in it would be changed or removed');
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push('To do it, set the script property');
  lines.push('');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' +
             confirmCodeForV1_(safeTargetIdV1_(), plans));
  lines.push('');
  lines.push('and run runBackfillForReal().');
  lines.push('');
  lines.push('That code authorises exactly the changes above and nothing else.');
  lines.push('If anything about them changes, so does the code.');
  return noteV1_(lines.join('\n'));
}

function safeTargetIdV1_() { try { return targetIdV1_(); } catch (e) { return '(not set)'; } }

/** Letters and digits with nothing ambiguous in them: no O against 0, no I
 *  against 1. A code someone reads off one screen and types into another. */
var PORTAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function shortCodeV1_(text) {
  var s = String(text), h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  var out = '', n = h;
  for (var j = 0; j < 6; j++) {
    out += PORTAL_CODE_ALPHABET.charAt(n % PORTAL_CODE_ALPHABET.length);
    n = Math.floor(n / PORTAL_CODE_ALPHABET.length);
    if (!n) n = h >>> (j + 1);
  }
  return out.slice(0, 4) + '-' + out.slice(4);
}

/** The code that authorises ONE set of changes to ONE spreadsheet.
 *
 *  It is derived from the target and from what is about to be written, so it
 *  cannot be confused with a spreadsheet address, cannot be left over from
 *  another book, and cannot approve a different set of changes than the one
 *  you were shown. Change the plan and the code changes with it. */
function confirmCodeForV1_(id, plans) {
  var parts = [id];
  (plans || []).forEach(function (p) {
    parts.push(String(p.tab || p.dest || ''));
    parts.push(String(p.source || p.key || ''));
    parts.push(String((p.missing || []).length));
    (p.missing || []).forEach(function (m) { parts.push(String(m.id || m.key || '')); });
  });
  return shortCodeV1_(parts.join('|'));
}

/** The gate.
 *
 *  Accepts the code from the preview, which is what the preview tells you to
 *  use. Also still accepts the id of the spreadsheet being written to, so a
 *  confirmation set before codes existed keeps working. Nothing else. */
function requireImportAuthorityV1_(expectedCode) {
  var id = targetIdV1_();
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_BACKFILL_CONFIRM) || '').trim();
  var asCode = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (expectedCode && asCode === expectedCode) return id;

  var confirm = spreadsheetIdFromV1_(raw);

  if (!raw) {
    throw new Error('Refusing to write.\n\n' +
      'Set the script property ' + PORTAL_BACKFILL_CONFIRM + ' to\n  ' +
      (expectedCode || id) + '\n\n' +
      (expectedCode
        ? 'That is the code for exactly the changes you were just shown. Run\n' +
          'the preview again if you have lost it.'
        : 'Run the preview first to see what this would do.'));
  }
  if (confirm !== id) {
    var others = [];
    try { others = otherBookIdsV1_(); } catch (e) { others = []; }
    var isASource = others.indexOf(confirm) >= 0;
    var looksLikeAnId = confirm && confirm.length > 12;

    throw new Error('Refusing to write.\n\n' +
      PORTAL_BACKFILL_CONFIRM + ' holds\n  ' + raw + '\n\n' +
      (isASource
        ? 'That is one of the spreadsheets in ' + PORTAL_OTHER_IDS_PROPERTY + ', which\n' +
          'is READ FROM. This confirmation is for what gets WRITTEN TO.\n\n'
        : looksLikeAnId
          ? 'That is not the spreadsheet this portal writes to, which is\n  ' + id +
            '\n  ' + safeTargetNameV1_() + '\n\n'
          : 'That is not a code this portal issued.\n\n') +
      'Set ' + PORTAL_BACKFILL_CONFIRM + ' to\n  ' + (expectedCode || id) + '\n\n' +
      (expectedCode
        ? 'That is the code for exactly the changes you were just shown, and it\n' +
          'authorises those and nothing else. Run the preview again if you have\n' +
          'lost it.'
        : 'Run the preview first to see what this would do.'));
  }
  return id;
}

/** Imports the responses that never reached a tab, for real.
 *
 *  Refuses unless the confirmation names this exact spreadsheet. Refuses if
 *  any response cannot be placed in full, because a half-imported record is
 *  worse than one still sitting in the form. */
function runBackfillForReal() {
  // What would happen is worked out FIRST. It writes nothing, and it means
  // "there is nothing to do" never arrives dressed up as a problem with the
  // confirmation.
  var plans = backfillPlanAllV1_();
  var due = plans.reduce(function (n, p) { return n + p.missing.length; }, 0);
  if (!due && !plans.some(function (p) { return p.blocked.length; })) {
    return noteV1_('Nothing to import. Every response is already in the tracker.');
  }

  var code = confirmCodeForV1_(safeTargetIdV1_(), plans);
  var id = requireImportAuthorityV1_(code);

  var blocked = plans.reduce(function (n, p) { return n + p.blocked.length; }, 0);
  if (blocked) {
    throw new Error('Refusing to write. ' + blocked + ' response(s) have answers ' +
      'with nowhere to go, and importing the rest would leave the record ' +
      'half done. Run backfillBeforeAndAfter() to see which, add the column ' +
      'they need, then run this again.');
  }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], report = ['BACKFILL COMPLETE', '',
    'Target : ' + safeTargetNameV1_(), 'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  plans.forEach(function (p) {
    if (p.problem || !p.missing.length) return;
    var sh = targetBookV1_().getSheetByName(p.dest);
    if (!sh) { report.push(p.title + ' : SKIPPED, ' + p.dest + ' is not there'); return; }

    var beforeRows = sh.getLastRow();
    p.missing.forEach(function (m) {
      sh.appendRow(m.row);
      manifest.push([stamp, p.dest, sh.getLastRow(), m.id, p.key,
                     whoIsAskingV1_() || 'unidentified', PORTAL.VERSION, code]);
    });
    var afterRows = sh.getLastRow();

    report.push(p.title);
    report.push('  tab            : ' + p.dest);
    report.push('  rows before    : ' + beforeRows);
    report.push('  rows added     : ' + p.missing.length);
    report.push('  rows after     : ' + afterRows);
    report.push('  added at rows  : ' + (beforeRows + 1) + ' to ' + afterRows);
    report.push('  response ids   : ' + p.missing.map(function (m) { return m.id; }).join(', '));
    report.push('');
  });

  writeManifestV1_(manifest);
  forgetTabsV1_();

  report.push('Nothing already in the tracker was changed or removed. Every row');
  report.push('added carries the form response id it came from, so running this');
  report.push('again adds nothing.');
  report.push('');
  report.push('To reverse it: undoLastBackfill(). It checks every row still');
  report.push('carries the id the manifest says before removing anything.');
  return noteV1_(report.join('\n'));
}

/** The rollback manifest. Its own tab, created if missing, appended to only. */
function writeManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_BACKFILL_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_BACKFILL_LOG);
    sh.getRange(1, 1).setValue(
      'Rollback manifest for imported form responses. Do not edit or sort this tab.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 8)
      .setValues([['RUN', 'TAB', 'ROW', 'RESPONSE ID', 'FORM', 'BY', 'VERSION', 'CODE']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
}

/** Removes exactly the rows the last run added, and only if every one of them
 *  still carries the response id the manifest recorded. One mismatch and
 *  nothing is deleted, because a shifted row means the manifest no longer
 *  describes the sheet and guessing is how records get destroyed. */
function undoLastBackfill() {
  var t = readTabV1_(PORTAL_BACKFILL_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('No import has been run against this spreadsheet.');

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];

  // The code that authorised the run authorises undoing it.
  var wroteWith = '';
  t.rows.forEach(function (r) {
    if (String(r[t.col['RUN']] || '') === last && t.col['CODE'] !== undefined) {
      wroteWith = String(r[t.col['CODE']] || '') || wroteWith;
    }
  });
  requireImportAuthorityV1_(wroteWith);

  var entries = t.rows.filter(function (r) {
    return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               id: String(r[t.col['RESPONSE ID']] || '') };
    });
  if (!entries.length) return noteV1_('The manifest names no rows for the last run.');

  // verify every single one before touching any of them
  var book = targetBookV1_(), problems = [];
  entries.forEach(function (e) {
    var dest = readTabV1_(e.tab);
    if (!dest.ok) { problems.push(e.tab + ' is not in this spreadsheet'); return; }
    var idCol = responseIdColumnV1_(dest);
    if (!idCol) { problems.push(e.tab + ' has no response id column any more'); return; }
    var sh = book.getSheetByName(e.tab);
    var actual = String(sh.getRange(e.row, dest.col[idCol.toUpperCase()] + 1).getValue() || '').trim();
    if (actual !== e.id) {
      problems.push(e.tab + ' row ' + e.row + ' holds "' + actual + '", the manifest says "' + e.id + '"');
    }
  });

  if (problems.length) {
    return noteV1_('NOTHING WAS DELETED\n\n' +
      'The sheet no longer matches the manifest, so the rows this would remove ' +
      'are not certainly the rows it added:\n\n  ' + problems.join('\n  ') +
      '\n\nRemove them by hand using the response ids in ' + PORTAL_BACKFILL_LOG + '.');
  }

  // bottom up, so deleting one does not move the next
  entries.sort(function (a, b) { return b.row - a.row; });
  entries.forEach(function (e) { book.getSheetByName(e.tab).deleteRow(e.row); });
  forgetTabsV1_();

  return noteV1_('REVERSED\n\n' + entries.length + ' row(s) removed, the exact rows ' +
    'the run of ' + last + ' added. Every one was checked against its response id ' +
    'first.\n\nThe responses are back to being only in the form, which is where they ' +
    'were before.');
}

/** Clears the confirmation, so the gate closes behind you. */
function lockBackfill() {
  PropertiesService.getScriptProperties().deleteProperty(PORTAL_BACKFILL_CONFIRM);
  return noteV1_('Import is locked again. ' + PORTAL_BACKFILL_CONFIRM +
    ' has been cleared and nothing can be written until it is set once more.');
}


/* ======================================================================
 * 85_Merge.gs
 * ====================================================================== */

/**
 * The other spreadsheets.
 *
 * A form pointed at the wrong book, a copy made during a rebuild, a sheet
 * someone started and abandoned - and now some of the record is over there
 * instead of here. This finds it, shows it to you, and can bring it across.
 *
 * The same three rules the form import runs under:
 *
 *   1. Looking writes nothing, in any mode, to either book. Ever.
 *   2. Bringing it across refuses unless the confirmation names the book it
 *      is about to write to, and it only ever APPENDS to the target. The
 *      other spreadsheet is opened read only and is never touched at all.
 *   3. Nothing is dropped to make the shape fit. A column the target does
 *      not have goes into the notes with its name attached, and where there
 *      is nowhere to put it the whole row is refused rather than written
 *      short.
 *
 * Every row brought across is stamped so a second run finds it and skips it,
 * and so undoLastBackfill can take it back out again by name.
 *
 * Set PORTAL_OTHER_SPREADSHEET_IDS in Project Settings. One address per line,
 * or separated by commas. Paste whole addresses; the ids are picked out.
 */

var PORTAL_OTHER_IDS_PROPERTY = 'PORTAL_OTHER_SPREADSHEET_IDS';
var PORTAL_MERGE_PREFIX = 'MERGED';

/** The other books, as ids. Anything that is not an id is ignored rather
 *  than guessed at, and the current target is never one of them. */
function otherBookIdsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_OTHER_IDS_PROPERTY) || '');
  var here = '';
  try { here = targetIdV1_(); } catch (e) { here = ''; }

  // Split on line breaks and commas only, never on spaces. A space-separated
  // split turns "the other one in my drive" into six candidates, and each
  // single word is a valid-looking bare id.
  var seen = {}, out = [];
  function take(id) {
    if (!id || id === here || seen[id]) return;
    seen[id] = true;
    out.push(id);
  }
  raw.split(/[\n\r,;]+/).forEach(function (piece) {
    var id = spreadsheetIdFromV1_(piece);
    if (id) { take(id); return; }
    // Nothing came out of it whole. The property editor is a single line and
    // turns a pasted block into space-separated text, so try the words.
    if (/\s/.test(piece)) {
      piece.split(/\s+/).forEach(function (w) {
        var wid = spreadsheetIdFromV1_(w);
        if (wid && (w.indexOf('/d/') >= 0 || wid.length >= 20)) take(wid);
      });
    }
  });
  return out;
}

/** A deterministic fingerprint of a row's values, for rows that carry no
 *  response id of their own. Same row, same key, every run - which is what
 *  makes a second pass add nothing. */
function rowFingerprintV1_(headers, row) {
  var parts = [];
  headers.forEach(function (h, i) {
    if (!h) return;
    var v = row[i];
    if (v instanceof Date && !isNaN(v.getTime())) v = v.toISOString().slice(0, 10);
    parts.push(String(h).toUpperCase().replace(/\s+/g, '') + '=' +
               String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '));
  });
  var s = parts.join('|'), h1 = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
  }
  return ('0000000' + h1.toString(16)).slice(-8);
}

/** What is in a spreadsheet. Read only, and safe against a book this portal
 *  knows nothing about. */
function surveyBookV1_(id) {
  var out = { id: id, name: '', ok: false, why: '', tabs: [] };
  var book;
  try { book = SpreadsheetApp.openById(id); out.name = book.getName(); }
  catch (e) { out.why = String(e.message || e); return out; }
  out.ok = true;

  book.getSheets().forEach(function (sh) {
    var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
    var headers = lastRow >= PORTAL.HEADER_ROW
      ? sh.getRange(PORTAL.HEADER_ROW, 1, 1, lastCol).getValues()[0]
          .map(function (h) { return String(h == null ? '' : h).trim(); })
      : [];
    out.tabs.push({
      name: sh.getName(),
      rows: Math.max(lastRow - PORTAL.HEADER_ROW, 0),
      headers: headers.filter(String),
      known: knownTabV1_(sh.getName())
    });
  });
  return out;
}

/** Is this a tab the portal understands, by name? */
function knownTabV1_(name) {
  var keys = Object.keys(PORTAL.TAB);
  for (var i = 0; i < keys.length; i++) {
    if (PORTAL.TAB[keys[i]] === name) return true;
  }
  return false;
}

/** A header-mapped read of one tab in ANY book. readTabV1_ only ever opens
 *  the target, which is deliberate; this is the one place that does not. */
function readTabInV1_(bookId, tabName) {
  var sh;
  try { sh = SpreadsheetApp.openById(bookId).getSheetByName(tabName); } catch (e) { sh = null; }
  if (!sh) return { ok: false, headers: [], col: {}, rows: [], firstDataRow: 0 };
  var hr = PORTAL.HEADER_ROW;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(hr, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h == null ? '' : h).trim(); });
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h.toUpperCase()] = i; });
  var lastRow = sh.getLastRow();
  var rows = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues() : [];
  return { ok: true, headers: headers, col: col, rows: rows, firstDataRow: hr + 1 };
}

/** What one tab of one other book would contribute. Builds every row in
 *  full and returns it. Writes nothing. */
function mergePlanV1_(sourceId, tabName) {
  var plan = { source: sourceId, tab: tabName, total: 0, present: 0,
               missing: [], blocked: [], problem: '' };

  var dest = readTabV1_(tabName);
  if (!dest.ok) { plan.problem = tabName + ' is not in this spreadsheet.'; return plan; }

  var idCol = responseIdColumnV1_(dest);
  if (!idCol) {
    plan.problem = tabName + ' has no response id column, so a second run could ' +
      'not tell a row it already brought across from a new one. Nothing will be written.';
    return plan;
  }
  var noteCol = notesColumnV1_(dest);

  var src = readTabInV1_(sourceId, tabName);
  if (!src.ok) { plan.problem = tabName + ' is not in the other spreadsheet.'; return plan; }

  // A row can already be here without carrying the same id - it may have
  // arrived by another path entirely. So the target is fingerprinted too, over
  // the columns both books share, and a match on EITHER the id or the content
  // counts as already here. Getting this wrong duplicates the record.
  var seen = {};
  dest.rows.forEach(function (r) {
    var v = String(r[dest.col[idCol.toUpperCase()]] || '').trim();
    if (v) seen[v] = true;
    var byHeader = {};
    dest.headers.forEach(function (h, ci) { if (h) byHeader[h] = r[ci]; });
    seen[sharedFingerprintV1_(dest.headers, idCol, noteCol, byHeader)] = true;
  });

  var srcIdCol = responseIdColumnV1_(src);

  src.rows.forEach(function (r, i) {
    var empty = r.every(function (v) { return v === '' || v === null || v === undefined; });
    if (empty) return;
    plan.total++;

    var mapped = {}, spare = [];
    src.headers.forEach(function (h, ci) {
      if (!h) return;
      var v = r[ci];
      if (v === '' || v === null || v === undefined) return;
      if (h.toUpperCase() === String(srcIdCol || '').toUpperCase()) return;
      var target = matchHeaderV1_(h, dest.headers);
      if (!target || target === idCol) { spare.push({ label: h, value: v }); return; }
      // A value that belongs in the notes column goes in as it was written.
      // Only a column with no home here carries its own name in with it.
      if (target === noteCol) {
        mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + v) : v;
        return;
      }
      mapped[target] = v;
    });

    // Its own response id if it has one, otherwise a fingerprint of the row as
    // it will sit HERE. Either way the same row yields the same key every run.
    var own = srcIdCol ? String(r[src.col[srcIdCol.toUpperCase()]] || '').trim() : '';
    var shared = sharedFingerprintV1_(dest.headers, idCol, noteCol, mapped);
    var key = own || (PORTAL_MERGE_PREFIX + ':' + sourceId.slice(0, 8) + ':' + shared);
    if (seen[key] || seen[shared]) { plan.present++; return; }

    var extra = spare.map(function (a) {
      var v = a.value instanceof Date ? a.value.toDateString() : a.value;
      return a.label + ': ' + v;
    }).join('\n');

    if (extra && !noteCol) {
      plan.blocked.push({ key: key, sourceRow: src.firstDataRow + i, why:
        tabName + ' here has no notes column, and ' + spare.length + ' column(s) ' +
        'from the other spreadsheet have nowhere to go. Add a NOTE column or ' +
        'these rows stay where they are.', spare: spare });
      return;
    }
    if (extra) mapped[noteCol] = mapped[noteCol] ? (mapped[noteCol] + '\n' + extra) : extra;
    mapped[idCol] = key;

    plan.missing.push({
      key: key,
      sourceRow: src.firstDataRow + i,
      carried: spare.length,
      row: dest.headers.map(function (h) {
        if (!h) return '';
        var v = mapped[h];
        if (v === undefined) return '';
        return (v instanceof Date) ? v : clean_(v);
      })
    });
  });

  return plan;
}

/** A fingerprint over the columns two books actually share, so the same event
 *  fingerprints the same on both sides. The id column is excluded because it
 *  is what differs; the notes column because a merged row's note carries the
 *  columns the other book had and this one does not. */
function sharedFingerprintV1_(destHeaders, idCol, noteCol, byHeader) {
  var hs = [], vs = [];
  destHeaders.forEach(function (h) {
    if (!h || h === idCol || h === noteCol) return;
    hs.push(h);
    vs.push(byHeader[h]);
  });
  return rowFingerprintV1_(hs, vs);
}

/** The target column a source column belongs in. Exact on letters and digits
 *  only, so case, spacing and punctuation never matter; then the alias table
 *  the form import already uses. */
function matchHeaderV1_(sourceHeader, destHeaders) {
  var q = bareV1_(sourceHeader);
  if (!q) return '';
  for (var i = 0; i < destHeaders.length; i++) {
    if (destHeaders[i] && bareV1_(destHeaders[i]) === q) return destHeaders[i];
  }
  var alias = PORTAL_ANSWER_ALIASES[q];
  if (!alias) return '';
  for (var j = 0; j < destHeaders.length; j++) {
    if (destHeaders[j] && bareV1_(destHeaders[j]) === bareV1_(alias)) return destHeaders[j];
  }
  return '';
}

/** Every other book, every tab this portal understands. Read only. */
function mergePlanAllV1_() {
  var out = [];
  otherBookIdsV1_().forEach(function (id) {
    Object.keys(PORTAL.TAB).forEach(function (k) {
      var name = PORTAL.TAB[k];
      if (name === PORTAL.TAB.AUDIT) return;
      var plan = mergePlanV1_(id, name);
      if (plan.total || plan.missing.length || plan.blocked.length) out.push(plan);
    });
  });
  return out;
}

/* ---------------- the things you run ---------------- */

/** What is in the other spreadsheets. Opens them read only, writes nothing,
 *  in any mode. This is the one to run first. */
function whatElseIsOutThere() {
  var ids = otherBookIdsV1_();
  if (!ids.length) {
    return noteV1_('No other spreadsheets are listed.\n\n' +
      'Project Settings > Script Properties > Add script property:\n' +
      '  ' + PORTAL_OTHER_IDS_PROPERTY + '\n' +
      'One address per line, or separated by commas. Paste whole addresses if\n' +
      'that is easier; the ids are picked out of them.');
  }

  var lines = ['WHAT IS IN THE OTHER SPREADSHEETS  (read only, nothing was written)', '',
    'This book : ' + safeTargetNameV1_(), ''];

  ids.forEach(function (id) {
    var s = surveyBookV1_(id);
    lines.push('=======================================================');
    lines.push(s.ok ? s.name : '(cannot open)');
    lines.push('  ' + id);
    lines.push('=======================================================');
    if (!s.ok) { lines.push('  ' + s.why); lines.push(''); return; }
    if (!s.tabs.length) { lines.push('  It has no tabs.'); lines.push(''); return; }

    s.tabs.forEach(function (t) {
      lines.push('  ' + (t.known ? '[known] ' : '        ') + t.name +
                 '   ' + t.rows + ' row' + (t.rows === 1 ? '' : 's'));
      if (t.known && t.rows) {
        var plan = mergePlanV1_(id, t.name);
        if (plan.problem) lines.push('            ' + plan.problem);
        else {
          lines.push('            ' + plan.present + ' already here, ' +
                     plan.missing.length + ' not' +
                     (plan.blocked.length ? ', ' + plan.blocked.length + ' would be refused' : ''));
        }
      }
    });
    lines.push('');
  });

  lines.push('=======================================================');
  lines.push('[known] means a tab this portal understands and could bring across.');
  lines.push('Run mergeBeforeAndAfter() to see exactly what that would add.');
  return noteV1_(lines.join('\n'));
}

/** Every row that would come across, in full. Writes nothing, in any mode. */
function mergeBeforeAndAfter() {
  var plans = mergePlanAllV1_();
  var lines = ['BEFORE AND AFTER  (nothing has been written)', '',
    'Into   : ' + safeTargetNameV1_(),
    'Id     : ' + safeTargetIdV1_(),
    'Mode   : ' + safeModeV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'Google is not naming this account'), ''];

  if (!plans.length) {
    lines.push('Nothing in the other spreadsheets belongs in a tab this portal');
    lines.push('understands, or there is nothing there that is not already here.');
    return noteV1_(lines.join('\n'));
  }

  var totalMissing = 0, totalBlocked = 0;
  plans.forEach(function (p) {
    lines.push('=======================================================');
    lines.push(p.tab + '   from ' + p.source);
    lines.push('=======================================================');
    if (p.problem) { lines.push('CANNOT BRING ACROSS: ' + p.problem); lines.push(''); return; }

    var dest = readTabV1_(p.tab);
    lines.push('');
    lines.push('BEFORE');
    lines.push('  ' + p.tab + ' here holds ' + dest.rows.length + ' rows');
    lines.push('  the other spreadsheet has ' + p.total + ', of which ' + p.present + ' are already here');
    lines.push('');
    lines.push('WOULD BE ADDED  (' + p.missing.length + ' rows, appended at the bottom)');
    p.missing.forEach(function (m, i) {
      lines.push('  ' + (i + 1) + '.  from row ' + m.sourceRow + '   key ' + m.key);
      dest.headers.forEach(function (h, ci) {
        if (!h) return;
        var v = m.row[ci];
        if (v === '' || v === undefined) return;
        if (v instanceof Date) v = v.toDateString();
        lines.push('        ' + labelForV1_(h) + ': ' + String(v).replace(/\n/g, ' / '));
      });
    });
    if (p.blocked.length) {
      lines.push('');
      lines.push('WOULD BE REFUSED  (' + p.blocked.length + ')');
      p.blocked.forEach(function (b) {
        lines.push('  row ' + b.sourceRow + '  ' + b.why);
        b.spare.forEach(function (a) { lines.push('        ' + a.label + ': ' + a.value); });
      });
    }
    lines.push('');
    lines.push('AFTER');
    lines.push('  ' + p.tab + ' would hold ' + (dest.rows.length + p.missing.length) + ' rows');
    lines.push('  nothing already in it would be changed or removed');
    lines.push('  the other spreadsheet is not touched at all');
    lines.push('');
    totalMissing += p.missing.length;
    totalBlocked += p.blocked.length;
  });

  lines.push('=======================================================');
  lines.push(totalMissing + ' row(s) would be added, ' + totalBlocked + ' refused.');
  lines.push('');
  lines.push('You do not have to do this. The portal reads the other spreadsheets');
  lines.push('already, so everything above is visible on screen without moving it.');
  lines.push('Bring it across only if you want it to live in one book.');
  lines.push('');
  lines.push('To do that, set the script property');
  lines.push('');
  lines.push('  ' + PORTAL_BACKFILL_CONFIRM + ' = ' +
             confirmCodeForV1_(safeTargetIdV1_(), plans));
  lines.push('');
  lines.push('and run runMergeForReal().');
  lines.push('');
  lines.push('That code authorises exactly the rows above and nothing else.');
  return noteV1_(lines.join('\n'));
}

/** Brings them across, for real. Same gate as the form import, same manifest,
 *  and undoLastBackfill reverses it the same way. */
function runMergeForReal() {
  // Worked out first, so "nothing to do" and "no spreadsheets listed" never
  // arrive dressed up as a problem with the confirmation.
  if (!otherBookIdsV1_().length) {
    return noteV1_('No other spreadsheets are listed, so there is nothing to ' +
      'bring across.\n\nProject Settings > Script Properties:\n  ' +
      PORTAL_OTHER_IDS_PROPERTY + '\nOne address per line, or separated by commas.');
  }
  var plans = mergePlanAllV1_();
  var due = plans.reduce(function (n, p) { return n + p.missing.length; }, 0);
  if (!due && !plans.some(function (p) { return p.blocked.length; })) {
    return noteV1_('Nothing to bring across. Everything in the other ' +
      'spreadsheets is already here.');
  }

  var code = confirmCodeForV1_(safeTargetIdV1_(), plans);
  var id = requireImportAuthorityV1_(code);

  var blocked = plans.reduce(function (n, p) { return n + p.blocked.length; }, 0);
  if (blocked) {
    throw new Error('Refusing to write. ' + blocked + ' row(s) have columns with ' +
      'nowhere to go, and bringing the rest across would leave the record half ' +
      'done. Run mergeBeforeAndAfter() to see which, add the column they need, ' +
      'then run this again.');
  }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], report = ['MERGE COMPLETE', '',
    'Into   : ' + safeTargetNameV1_(), 'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  plans.forEach(function (p) {
    if (p.problem || !p.missing.length) return;
    var sh = targetBookV1_().getSheetByName(p.tab);
    if (!sh) { report.push(p.tab + ' : SKIPPED, it is not there'); return; }

    var beforeRows = sh.getLastRow();
    p.missing.forEach(function (m) {
      sh.appendRow(m.row);
      manifest.push([stamp, p.tab, sh.getLastRow(), m.key,
                     PORTAL_MERGE_PREFIX + ' ' + p.source,
                     whoIsAskingV1_() || 'unidentified', PORTAL.VERSION, code]);
    });
    var afterRows = sh.getLastRow();

    report.push(p.tab + '   from ' + p.source);
    report.push('  rows before   : ' + beforeRows);
    report.push('  rows added    : ' + p.missing.length);
    report.push('  rows after    : ' + afterRows);
    report.push('  added at rows : ' + (beforeRows + 1) + ' to ' + afterRows);
    report.push('');
  });

  writeManifestV1_(manifest);
  forgetTabsV1_();

  report.push('The other spreadsheet was opened read only and was not changed.');
  report.push('Nothing already here was changed or removed. Every row added carries');
  report.push('a key of its own, so running this again adds nothing.');
  report.push('');
  report.push('To reverse it: undoLastBackfill().');
  return noteV1_(report.join('\n'));
}


/* ======================================================================
 * 87_Settle.gs
 * ====================================================================== */

/**
 * Settle same-day submission pairs from Field Training — without the tracker.
 *
 * Doctrine: both raw rows stay on file forever. A settlement is a named
 * judgment (both stand / this one stands / not a conflict) so Settle stops
 * nagging and the personnel record has who decided, when, and why.
 */

var PORTAL_SETTLEMENTS_TAB = 'PORTAL SETTLEMENTS';

var PORTAL_SETTLEMENT_HEADERS_V1 = [
  'WHEN', 'TRAINEE', 'TRAINEE NORM', 'TAB', 'DUP KEY', 'DECISION', 'KEEP ROW',
  'SOURCE', 'BY', 'REASON', 'VERSION'
];

function ensureSettlementsLogV1_() {
  try {
    var book = targetBookV1_();
    var sh = book.getSheetByName(PORTAL_SETTLEMENTS_TAB);
    if (!sh) {
      sh = book.insertSheet(PORTAL_SETTLEMENTS_TAB);
      sh.getRange(1, 1).setValue(
        'Duplicate-submission judgments from Field Training. Raw submissions stay on file.')
        .setFontWeight('bold');
      sh.getRange(PORTAL.HEADER_ROW, 1, 1, PORTAL_SETTLEMENT_HEADERS_V1.length)
        .setValues([PORTAL_SETTLEMENT_HEADERS_V1.slice()])
        .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
      sh.setFrozenRows(PORTAL.HEADER_ROW);
      forgetTabsV1_();
      return true;
    }
    // Existing sheet with a blank or wrong header row cannot hold a judgment.
    forgetTabsV1_();
    var t = readTabV1_(PORTAL_SETTLEMENTS_TAB);
    if (!t.ok || t.col['DUP KEY'] === undefined || t.col['TRAINEE'] === undefined) {
      sh.getRange(PORTAL.HEADER_ROW, 1, 1, PORTAL_SETTLEMENT_HEADERS_V1.length)
        .setValues([PORTAL_SETTLEMENT_HEADERS_V1.slice()])
        .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
      forgetTabsV1_();
    }
    return true;
  } catch (e) { return false; }
}

function settlementIdV1_(trainee, tab, dupKey) {
  return normNameV1_(trainee) + '|' + String(tab || '') + '|' + String(dupKey || '');
}

/** Settled keys for filtering Settle and quieting the personnel record. */
function settledDuplicateKeysV1_() {
  var out = {};
  var t = readTabV1_(PORTAL_SETTLEMENTS_TAB);
  if (!t.ok) return out;
  t.rows.forEach(function (r) {
    var trainee = String(r[t.col['TRAINEE']] || '').trim();
    var tab = String(r[t.col['TAB']] || '').trim();
    var key = String(r[t.col['DUP KEY']] || '').trim();
    if (!key) return;
    var norm = t.col['TRAINEE NORM'] !== undefined
      ? String(r[t.col['TRAINEE NORM']] || '').trim() : '';
    if (!norm) norm = trainee;
    if (!norm) return;
    out[settlementIdV1_(norm, tab, key)] = true;
  });
  return out;
}

/**
 * Division settles a flagged pair. Does not delete or edit source rows.
 * @param {string} decision BOTH_STAND | KEEP_ROW | NOT_A_CONFLICT
 * @param {number=} keepRow required when KEEP_ROW
 */
function settleDuplicateV1(traineeName, tabName, dupKey, decision, reason, keepRow, sourceTitle) {
  requireWritableV1_('settle a duplicate submission');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may settle duplicate submissions.');
  }
  var trainee = String(traineeName || '').trim();
  var tab = String(tabName || '').trim();
  var key = String(dupKey || '').trim();
  var dec = String(decision || '').trim().toUpperCase();
  var why = String(reason || '').trim();
  if (!trainee || !tab || !key) throw new Error('Missing settlement identity. Reload and try again.');
  if (['BOTH_STAND', 'KEEP_ROW', 'NOT_A_CONFLICT'].indexOf(dec) < 0) {
    throw new Error('Pick how this pair stands: both, one row, or not a conflict.');
  }
  if (why.length < 8) {
    throw new Error('Type why. It goes on the permanent record in your name.');
  }

  var id = settlementIdV1_(trainee, tab, key);
  if (settledDuplicateKeysV1_()[id]) {
    return { ok: true, message: 'Already settled. Reload if it still shows on Settle.' };
  }

  // Re-verify the live pair so a stale or invented key cannot hide future collisions.
  var pair = duplicatePairDetailV1_(trainee, tab, key);
  trainee = pair.trainee;

  var keep = '';
  if (dec === 'KEEP_ROW') {
    keep = String(keepRow == null ? '' : keepRow).trim();
    var local = {};
    (pair.sides || []).forEach(function (s) {
      if (Number(s.row) > 0) local[String(s.row)] = true;
    });
    if (!keep || !local[keep]) {
      throw new Error('Pick which row on this book stands.');
    }
  }

  if (!ensureSettlementsLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL_SETTLEMENTS_TAB + '. Nothing was written.');
  }
  var t = readTabV1_(PORTAL_SETTLEMENTS_TAB);
  if (!t.ok) throw new Error('No settlements log.');
  if (t.col['DUP KEY'] === undefined || t.col['TRAINEE'] === undefined) {
    throw new Error(PORTAL_SETTLEMENTS_TAB + ' is missing its header row. Nothing was written.');
  }

  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'WHEN') return new Date();
    if (H === 'TRAINEE') return trainee;
    if (H === 'TRAINEE NORM') return normNameV1_(trainee);
    if (H === 'TAB') return tab;
    if (H === 'DUP KEY') return key;
    if (H === 'DECISION') return dec;
    if (H === 'KEEP ROW') return keep;
    if (H === 'SOURCE') return String(sourceTitle || pair.source || '').trim();
    if (H === 'BY') return viewer.email;
    if (H === 'REASON') return clean_(why);
    if (H === 'VERSION') return PORTAL.VERSION;
    return '';
  });
  t.sheet.appendRow(row);
  forgetTabsV1_();
  auditV1_('DUPLICATE SETTLED', viewer.email,
    dec + ' | ' + trainee + ' | ' + tab + ' | ' + why.slice(0, 100));

  var msg = 'Settled. Both submissions stay on file.';
  if (dec === 'BOTH_STAND') msg = 'Both stand. Recorded — Settle will stop raising this pair.';
  else if (dec === 'KEEP_ROW') msg = 'Row ' + keep + ' stands. Both rows stay on file.';
  else if (dec === 'NOT_A_CONFLICT') msg = 'Marked not a conflict. Settle will stop raising this pair.';
  return { ok: true, message: msg };
}

/** One pair with both sides shaped for the settle screen (server → UI). */
function duplicatePairDetailV1(traineeName, tabName, dupKey) {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may open a Settle pair.');
  }
  return duplicatePairDetailV1_(traineeName, tabName, dupKey);
}

/** One pair with both sides shaped for the settle screen. */
function duplicatePairDetailV1_(traineeName, tabName, dupKey) {
  var trainee = String(traineeName || '').trim();
  var tab = String(tabName || '').trim();
  var key = String(dupKey || '').trim();
  var person = null;
  traineesV1_().forEach(function (t) {
    if (!person && normNameV1_(t.name) === normNameV1_(trainee)) person = t;
  });
  if (!person) throw new Error('No trainee named "' + trainee + '".');

  var src = null;
  PORTAL_SOURCES.forEach(function (s) {
    if (!src && s.tab === tab) src = s;
  });
  if (!src) throw new Error('Unknown source tab ' + tab);

  var list = markCurrentV1_(submissionsFromV1_(src, person.norm), !!src.groupBy, !!src.oncePerDay);
  var sides = list.filter(function (s) { return s.dupKey === key; });
  if (sides.length < 2) {
    throw new Error('That pair is no longer flagged. Reload Settle.');
  }

  return {
    trainee: person.name,
    tab: tab,
    source: src.title,
    dupKey: key,
    why: String(key).indexOf('ID:') === 0
      ? 'the SAME form response, written twice'
      : (String(key).indexOf('DAY:') === 0
          ? 'two of these for one day, and there should be one'
          : 'identical in every field, same author, same day'),
    sides: sides.map(function (s) {
      return {
        row: s.row,
        when: whenTextV1_(s.when),
        by: s.by || '',
        group: s.group || '',
        book: s.book || '',
        fields: (s.fields || []).slice(0, 12)
      };
    })
  };
}


/* ======================================================================
 * 88_Report.gs
 * ====================================================================== */

/**
 * Printable / PDF trainee reports from Field Training.
 *
 * Division can pull a full training report for anyone on the master —
 * including Cleared / Independent — and print or save as PDF from the browser.
 * No tracker menu. Raw rows are not altered.
 */

/**
 * Build a print-ready HTML report for one trainee (active or released).
 * Division only.
 */
function traineeReportHtmlV1(traineeName) {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may pull a training report.');
  }
  var name = String(traineeName || '').trim();
  if (!name) throw new Error('Pick a trainee.');

  var person = null;
  traineesV1_().forEach(function (t) {
    if (!person && normNameV1_(t.name) === normNameV1_(name)) person = t;
  });
  if (!person) throw new Error('No trainee named "' + name + '" on the master.');

  var rec = recordForV1_(person.name);
  var skills = [];
  try { skills = skillsForV1_(person.norm); } catch (e) { skills = []; }
  var clear = clearanceAssessmentV1_(person);

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  var bits = [];
  bits.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  bits.push('<title>Field Training report — ' + esc(person.name) + '</title>');
  bits.push('<style>');
  bits.push('body{font:12pt/1.45 Georgia,serif;color:#111;margin:24px;max-width:800px}');
  bits.push('h1{font:700 22pt/1.2 Georgia,serif;margin:0 0 4px}');
  bits.push('h2{font:700 13pt/1.2 Georgia,serif;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}');
  bits.push('.meta{color:#444;margin:0 0 18px}');
  bits.push('.kv{margin:2px 0}.k{color:#666;display:inline-block;min-width:9em}');
  bits.push('.sec{margin:10px 0 14px}.when{color:#555;font-size:10pt}');
  bits.push('.fld{margin:3px 0 3px 12px}.l{color:#666;display:inline-block;min-width:10em}');
  bits.push('table{border-collapse:collapse;width:100%;font-size:10.5pt}');
  bits.push('th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}');
  bits.push('th{background:#f3f3f3}');
  bits.push('@media print{body{margin:12mm}.noprint{display:none!important}}');
  bits.push('</style></head><body>');
  bits.push('<p class="noprint" style="margin:0 0 16px"><button onclick="window.print()">Print / Save as PDF</button> ');
  bits.push('<span style="color:#666">Use your browser print dialog → Save as PDF.</span></p>');
  bits.push('<h1>' + esc(person.name) + '</h1>');
  bits.push('<p class="meta">Field Training — Sumter County EMS<br>');
  bits.push('Report pulled ' + esc(new Date().toDateString()) + ' by ' + esc(viewer.email) + '<br>');
  bits.push(esc(PORTAL.VERSION) + '</p>');

  bits.push('<h2>Status</h2>');
  bits.push('<div class="kv"><span class="k">Level</span> ' + esc(person.level || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Phase</span> ' + esc(person.phase || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Status</span> ' + esc(person.status || (person.closed ? 'Closed' : 'Active')) + '</div>');
  bits.push('<div class="kv"><span class="k">Training officer</span> ' + esc(person.fto || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Shift</span> ' + esc(person.shift || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Start</span> ' +
    (person.started instanceof Date ? esc(person.started.toDateString()) : '—') + '</div>');
  if (person.closed) {
    bits.push('<div class="kv"><span class="k">Outcome</span> Released / cleared — prior record retained</div>');
  }
  bits.push('<div class="kv"><span class="k">Skills signed</span> ' +
    esc(String(clear.signed || 0)) + ' / ' + esc(String(clear.total || 0)) + '</div>');

  if (skills.length) {
    bits.push('<h2>Skills matrix</h2><table><tr><th>Skill</th><th>Readiness</th>');
    bits.push('<th>Successful</th><th>Independent</th><th>Dates</th><th>FTOs</th></tr>');
    skills.forEach(function (s) {
      bits.push('<tr><td>' + esc(s.skill) + '</td><td>' +
        esc(s.signed ? 'SIGNED OFF' : (s.readiness || '—')) + '</td><td>' +
        esc(String(s.successful)) + '</td><td>' + esc(String(s.independent)) + '</td><td>' +
        esc(String(s.distinctDates)) + '</td><td>' + esc(String(s.distinctFtos)) + '</td></tr>');
    });
    bits.push('</table>');
  }

  (rec.sections || []).forEach(function (part) {
    bits.push('<h2>' + esc(part.title) + ' (' + esc(String(part.count)) + ')</h2>');
    part.current.concat(part.earlier).forEach(function (s) {
      bits.push('<div class="sec"><div class="when">' + esc(s.when) +
        (s.by ? ' · ' + esc(s.by) : '') +
        (s.current ? ' · current' : '') +
        (s.group ? ' · ' + esc(s.group) : '') + '</div>');
      (s.fields || []).forEach(function (f) {
        bits.push('<div class="fld"><span class="l">' + esc(f.label) + '</span> ' +
          esc(f.value) + '</div>');
      });
      bits.push('</div>');
    });
  });

  bits.push('<p style="margin-top:28px;color:#666;font-size:9pt">Nothing in this report was edited. ');
  bits.push('It is a read of the vault as of the pull date.</p>');
  bits.push('</body></html>');

  auditV1_('REPORT PULLED', viewer.email, person.name + (person.closed ? ' | closed' : ''));
  return bits.join('');
}


/* ======================================================================
 * 90_Staging.gs
 * ====================================================================== */

/**
 * Staging.
 *
 * setUpStaging() points the portal at a sandbox of invented people. It never
 * opens, reads, copies or references the live tracker.
 *
 * v20.6 estate rule: one sandbox at a time. Re-running reuses the remembered
 * staging spreadsheet when it still exists. A brand-new sandbox is created
 * only when none is remembered, the old one is gone, or you pass
 * setUpStaging('NEW'). Old sandboxes are moved into an archive folder — never
 * deleted — so Drive does not fill with STG_SCEMS_Portal_Sandbox_* clutter.
 */

var PORTAL_STAGING_ARCHIVE_FOLDER = 'SCEMS Portal Staging — ARCHIVE';

function stagingBookStillExistsV1_(id) {
  if (!id) return false;
  try {
    DriveApp.getFileById(id);
    SpreadsheetApp.openById(id);
    return true;
  } catch (e) { return false; }
}

function archiveStagingBookV1_(id, reason) {
  if (!id) return '';
  try {
    var file = DriveApp.getFileById(id);
    var parent = DriveApp.getFoldersByName(PORTAL_STAGING_ARCHIVE_FOLDER);
    var folder = parent.hasNext() ? parent.next() : DriveApp.createFolder(PORTAL_STAGING_ARCHIVE_FOLDER);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
    var dest = folder.createFolder(stamp + (reason ? ' — ' + reason : ''));
    dest.addFile(file);
    var parents = file.getParents();
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() !== dest.getId()) {
        try { p.removeFile(file); } catch (eR) {}
      }
    }
    try { file.setName(file.getName() + ' [ARCHIVED ' + stamp + ']'); } catch (eN) {}
    return dest.getUrl();
  } catch (e) {
    return '';
  }
}

function setUpStaging(forceNew) {
  var wantNew = String(forceNew || '').trim().toUpperCase() === 'NEW';
  var props = PropertiesService.getScriptProperties();
  var existingId = spreadsheetIdFromV1_(props.getProperty('PORTAL_STAGING_SPREADSHEET_ID'));

  if (!wantNew && stagingBookStillExistsV1_(existingId)) {
    forgetTabsV1_();
    props.setProperty(PORTAL.PROPERTY_TARGET, existingId);
    props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);
    props.setProperty('PORTAL_FORM_LINKS', 'OFF');
    var meReuse = whoIsAskingV1_();
    if (meReuse) {
      props.setProperty('PORTAL_DIVISION_EMAILS', meReuse);
      props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));
    }
    var existing = SpreadsheetApp.openById(existingId);
    var msgReuse = 'STAGING REUSED\n\n' +
      'Spreadsheet : ' + existing.getName() + '\n' +
      'Link        : ' + existing.getUrl() + '\n\n' +
      'A sandbox already existed, so nothing new was created. Drive stays\n' +
      'at one staging book. To force a brand-new sandbox (the old one is\n' +
      'archived, not deleted):\n' +
      '  setUpStaging("NEW")';
    Logger.log(msgReuse);
    try { SpreadsheetApp.getUi().alert(msgReuse); } catch (e) {}
    return msgReuse;
  }

  var archivedUrl = '';
  if (existingId && stagingBookStillExistsV1_(existingId)) {
    archivedUrl = archiveStagingBookV1_(existingId, 'replaced by setUpStaging NEW');
  }

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var book = SpreadsheetApp.create('STG_SCEMS_Portal_Sandbox_' + stamp);

  function tab(name, headers, rows) {
    var sh = book.getSheetByName(name) || book.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1).setValue('STAGING — invented data. Not a personnel record.')
      .setFontWeight('bold').setFontColor('#a8342b');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    if (rows.length) {
      sh.getRange(PORTAL.HEADER_ROW + 1, 1, rows.length, headers.length).setValues(rows);
    }
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    return sh;
  }

  var d = function (s) { return new Date(s); };

  tab(PORTAL.TAB.MASTER,
    ['TRAINEE','EMPLOYEE ID','LEVEL','ENTRY PROFILE','ASSIGNED FTO','START DATE',
     'CURRENT PHASE','SET STATUS','TRAINEE EMAIL','PHASE START DATE','SHIFT'],
    [
      ['Jamie Rivers','STG-01','Paramedic','A','Dana Whitlock', d('2026-06-01'),'Phase 2','Active','jamie.rivers@example.org', d('2026-07-15'),'A'],
      ['Alex Bramble','STG-02','EMT','A','Dana Whitlock', d('2026-05-04'),'Phase 3','Active','alex.bramble@example.org', d('2026-07-01'),'A'],
      ['Priya Okafor','STG-03','Advanced EMT','B','Marcus Vane', d('2026-04-12'),'Phase 4','Active','priya.okafor@example.org', d('2026-08-01'),'B'],
      ['Sam Ledger','STG-04','EMT','A','', '', '','Active','sam.ledger@example.org','','A'],
      ['Rosa Quill','STG-05','Paramedic','C','Marcus Vane', d('2026-01-06'),'Phase 4','Cleared / Independent','rosa.quill@example.org', d('2026-03-01'),'B']
    ]);

  tab(PORTAL.TAB.ROSTER, ['FTO','EMAIL','LEVEL','ACTIVE'],
    [['Dana Whitlock','dana.whitlock@example.org','Paramedic','Yes'],
     ['Marcus Vane','marcus.vane@example.org','Paramedic','Yes']]);

  tab(PORTAL.TAB.SKILLS,
    ['TRAINEE','SKILL','STAGE','LAST DATE','LAST FTO','LEVEL','READINESS','SIGN-OFF',
     'DOMAIN','SKILL ID','SUCCESSFUL REPS','INDEPENDENT REPS','DISTINCT DATES','DISTINCT FTOS'],
    [
      ['Jamie Rivers','IV access','I', d('2026-08-18'),'Dana Whitlock','Paramedic','SIGNED OFF','SIGNED OFF','Vascular','SK-1',5,3,3,2],
      ['Jamie Rivers','Intubation','A', d('2026-08-17'),'Dana Whitlock','Paramedic','READY FOR VALIDATION','','Airway','SK-2',4,2,2,2],
      ['Jamie Rivers','12-lead acquisition','A', d('2026-08-12'),'Dana Whitlock','Paramedic','IN PROGRESS','','Cardiac','SK-3',3,1,2,1],
      ['Jamie Rivers','Needle decompression','','','','Paramedic','NOT STARTED','','Trauma','SK-4',0,0,0,0],
      ['Alex Bramble','Bag-valve-mask','I', d('2026-08-15'),'Dana Whitlock','EMT','SIGNED OFF','SIGNED OFF','Airway','SK-5',6,4,4,2],
      ['Alex Bramble','Tourniquet','A', d('2026-08-16'),'Dana Whitlock','EMT','READY FOR VALIDATION','','Trauma','SK-6',3,3,3,2],
      ['Priya Okafor','Vascular access','I', d('2026-08-14'),'Marcus Vane','Advanced EMT','SIGNED OFF','SIGNED OFF','Vascular','SK-7',8,5,5,3]
    ]);

  tab(PORTAL.TAB.QUEUE,
    ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY','DECISION',
     'DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE','RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'],
    [
      [d('2026-08-17'),'Jamie Rivers','SK-2','Airway','Intubation','4 of 4 successful   2 of 2 independent   2 of 2 separate days   2 of 2 different FTOs','','','','','','OPEN', d('2026-08-17'),'STG-QR-1'],
      [d('2026-08-16'),'Alex Bramble','SK-6','Trauma','Tourniquet','3 of 3 successful   3 of 3 independent   3 of 3 separate days   2 of 2 different FTOs','','','','','','OPEN', d('2026-08-16'),'STG-QR-2']
    ]);

  tab(PORTAL.TAB.EVAL,
    ['TIMESTAMP','FTO','TRAINEE','LEVEL','PHASE','SHIFT DATE','ASSESSMENT','TREATMENT',
     'COMMUNICATION','DOCUMENTATION','SCENE LEADERSHIP','PROFESSIONALISM','STRENGTH','IMPROVE'],
    [
      [d('2026-08-18'),'Dana Whitlock','Jamie Rivers','Paramedic','Phase 2', d('2026-08-18'),4,4,3,3,4,5,
       'Ran the airway on a long resuscitation without prompting and kept the crew calm throughout.',
       'Radio reports are still rushed. Practise the handover out loud before keying up.'],
      [d('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3', d('2026-08-16'),4,3,4,3,3,4,
       'Applied a tourniquet quickly and correctly on a chaotic scene.',
       'Slow down the primary survey. Say the findings out loud.'],
      // Deliberately the same day as the row above. The portal flags the pair
      // and keeps both, which is what it does with a real double submission.
      [d('2026-08-16'),'Dana Whitlock','Alex Bramble','EMT','Phase 3', d('2026-08-16'),4,3,4,4,3,4,
       'Second submission for the same shift. Documentation rating corrected after review.',
       'Same as above. Filed again because the first had the wrong rating.']
    ]);

  tab(PORTAL.TAB.REFLECT, ['TIMESTAMP','TRAINEE','WHAT WENT WELL','WHAT WAS HARD','WHAT I WANT TO WORK ON'],
    [[d('2026-08-11'),'Jamie Rivers','The arrest finally felt like it clicked.',
      'Radio reports still rush me.','Slowing down my handover.']]);

  tab(PORTAL.TAB.URGENT, ['TIMESTAMP','CALLED?','YOUR NAME','TRAINEE INVOLVED','WHAT HAPPENED','ACTION TAKEN'],
    [[d('2026-08-17'),'Yes','Dana Whitlock','Alex Bramble',
      'Drew the correct medication at the wrong concentration. Caught on the second check before administration. No patient harm; the trainee identified it himself.',
      'Held from medication administration pending review.']]);

  tab(PORTAL.TAB.COACHING, ['DATE','TRAINEE','FROM','NOTE','ACKNOWLEDGED'],
    [[d('2026-08-18'),'Jamie Rivers','Dana Whitlock',
      'Radio reports still rushed. Practise MIST before keying up. Otherwise a strong shift.',''],
     [d('2026-08-16'),'Alex Bramble','Dana Whitlock',
      'Good tourniquet work. Slow the primary survey down.','YES']]);

  tab(PORTAL.TAB.EVIDENCE,
    ['EVENT DATE','TRAINEE','FTO','SKILL','SKILL ID','STAGE','OUTCOME','NOTE','SOURCE RESPONSE ID'],
    [
      [d('2026-08-17'),'Jamie Rivers','Dana Whitlock','Intubation','SK-2','Independent','Successful',
       'First-pass success on a difficult airway. Called for the bougie himself.','STG-R-104'],
      [d('2026-08-12'),'Jamie Rivers','Marcus Vane','Intubation','SK-2','Assisted','Successful',
       'Second attempt after a failed first pass. Recognised the problem and corrected the angle.','STG-R-098'],
      [d('2026-08-18'),'Jamie Rivers','Dana Whitlock','IV access','SK-1','Independent','Successful',
       'Two attempts, both patent, on a dehydrated patient with poor veins.','STG-R-106'],
      [d('2026-08-16'),'Alex Bramble','Dana Whitlock','Tourniquet','SK-6','Independent','Successful',
       'Applied high and tight without prompting. Time to control under a minute.','STG-R-101']
    ]);

  tab(PORTAL.TAB.SIGNOFF,
    ['SIGN-OFF DATE','TRAINEE','SKILL','SKILL ID','SIGNED OFF BY','RATIONALE'],
    [[d('2026-08-18'),'Jamie Rivers','IV access','SK-1','chief@example.org',
      'Five successful attempts across three separate shifts with two different FTOs. Watched the last one myself.']]);

  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);

  // Drop the default "Sheet1" Google creates with every new spreadsheet.
  try {
    var sheet1 = book.getSheetByName('Sheet1');
    if (sheet1 && book.getSheets().length > 1) book.deleteSheet(sheet1);
  } catch (eSheet1) {}

  forgetTabsV1_();
  props.setProperty(PORTAL.PROPERTY_TARGET, book.getId());
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);
  // Remembered so pointAtStaging() can bring you back from production
  // without rebuilding the sandbox and losing what you were looking at.
  props.setProperty('PORTAL_STAGING_SPREADSHEET_ID', book.getId());
  // Off in staging. A sandbox user tapping a form card would otherwise land
  // on the real production form, and a submission there is a live write.
  props.setProperty('PORTAL_FORM_LINKS', 'OFF');

  var me = whoIsAskingV1_();
  if (me) {
    props.setProperty('PORTAL_DIVISION_EMAILS', me);
    props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));
  }

  var msg = 'STAGING READY\n\n' +
    'Spreadsheet : ' + book.getName() + '\n' +
    'Link        : ' + book.getUrl() + '\n\n' +
    (archivedUrl ? 'Previous sandbox archived (not deleted):\n  ' + archivedUrl + '\n\n' : '') +
    'The portal now points at this sandbox. Five invented trainees, two\n' +
    'invented FTOs. Nothing here is a personnel record and nothing of yours\n' +
    'was opened to build it.\n\n' +
    (me ? 'You (' + me + ') are set as Training Division so you can see that view.\n' +
          'To try another role, run viewAsTrainee, viewAsFTO, viewAsDivision,\n' +
          'viewAsSupervisor or viewAsMedical.\n\n' : '') +
    'Form links are OFF here, so the cards show without opening the real\n' +
    'production forms. Run enableFormLinks() if you want them live.\n\n' +
    'Re-run setUpStaging() to reuse this sandbox. Pass "NEW" only when you\n' +
    'truly want another book.\n\n' +
    'Next: Deploy > New deployment > Web app, then open the URL.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Lets one account preview another role while testing in staging.
 *  Refuses outside staging, so it can never become a production backdoor. */
function switchRoleForTestingV1(role) {
  requireStagingV1_('switch role');
  var r = String(role || '').toUpperCase();
  var props = PropertiesService.getScriptProperties();
  var me = whoIsAskingV1_();
  if (!me) throw new Error('Google is not naming this account, so there is nothing to switch.');

  props.setProperty('PORTAL_DIVISION_EMAILS', '');
  props.setProperty('PORTAL_MEDICAL_EMAILS', '');
  props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));

  var book = targetBookV1_();
  function setCell(tabName, findCol, matchRow, emailCol) {
    var sh = book.getSheetByName(tabName);
    if (sh) sh.getRange(matchRow, emailCol).setValue(me);
  }

  if (r === 'DIVISION')        props.setProperty('PORTAL_DIVISION_EMAILS', me);
  else if (r === 'MEDICAL')    props.setProperty('PORTAL_MEDICAL_EMAILS', me);
  else if (r === 'SUPERVISOR') props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({ me: 'A' }).replace('"me"', '"' + me + '"'));
  else if (r === 'FTO')        setCell(PORTAL.TAB.ROSTER, 'EMAIL', PORTAL.HEADER_ROW + 1, 2);
  else if (r === 'TRAINEE')    setCell(PORTAL.TAB.MASTER, 'TRAINEE EMAIL', PORTAL.HEADER_ROW + 1, 9);
  else throw new Error('Use TRAINEE, FTO, DIVISION, SUPERVISOR or MEDICAL.');

  PEOPLE_CACHE_V1 = null;
  forgetTabsV1_();
  var msg = 'You are now viewing as ' + r + '. Reload the portal.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Where is this portal pointed, and can it write. Read-only. */
function portalStatusV1() {
  var id = '';
  try { id = targetIdV1_(); } catch (e) { id = '(not set)'; }
  var msg = 'PORTAL STATUS\n\n' +
    'Version   : ' + PORTAL.VERSION + '\n' +
    'Mode      : ' + safeModeV1_() + (mayWriteV1_() ? '  (writes allowed)' : '  (READ ONLY)') + '\n' +
    'Target    : ' + id + '\n' +
    'Signed in : ' + (whoIsAskingV1_() || '(Google is not saying)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---------------------------------------------------------------- *
 *  Role preview, one click each
 *
 *  The Run dropdown cannot pass arguments, so each role gets its own
 *  no-argument function. Pick one, run it, reload the portal.
 *  All of them refuse outside staging.
 * ---------------------------------------------------------------- */

function viewAsTrainee()    { return switchRoleForTestingV1('TRAINEE'); }
function viewAsFTO()        { return switchRoleForTestingV1('FTO'); }
function viewAsDivision()   { return switchRoleForTestingV1('DIVISION'); }
function viewAsSupervisor() { return switchRoleForTestingV1('SUPERVISOR'); }
function viewAsMedical()    { return switchRoleForTestingV1('MEDICAL'); }


/* ======================================================================
 * 91_Record.gs
 * ====================================================================== */

/**
 * Permanent writers that used to stop at "stage it for the tracker."
 *
 * Sign-off: append 21 SKILL SIGN-OFF LOG, close the queue row, touch the matrix.
 * Coaching: FTO / Division file a note on PORTAL COACHING.
 * Assign: Division sets ASSIGNED FTO from Field Training.
 * Matrix seed: after enroll, put catalog rows on 05 SKILLS PROGRESS when possible.
 */

var PORTAL_OVERRIDE_MARKER = '[THRESHOLD OVERRIDE]';
var PORTAL_CATALOG_TAB = '15 SKILL CATALOG';

/** Approve — permanent. */
function approveSignoffV1(row, reason, requestId) {
  return recordSignoffDecisionV1_(row, reason, requestId, 'Approve sign-off');
}

/** Return — permanent (RETURNED on the queue, row on the sign-off log). */
function returnSignoffV1(row, reason, requestId) {
  return recordSignoffDecisionV1_(row, reason, requestId, 'Return for more evidence');
}

/**
 * One writer for Division sign-off decisions from Field Training.
 * Mirrors the tracker's recordDecisionForRow gates that matter here:
 * OPEN only, typed reason, no prior DECISION, request-id match, evidence gate
 * on Approve, then append the permanent log and close the queue row.
 */
function recordSignoffDecisionV1_(row, reason, requestId, decision) {
  requireWritableV1_('record a sign-off decision');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may decide a sign-off.');
  }
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why you are deciding this. It goes on the permanent record in your name.');
  }

  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok) throw new Error('No queue.');
  var r = requireLocalRowV1_(t, row, 'decide that sign-off');

  var need = ['DECISION', 'DECIDED BY', 'DECISION DATE', 'RATIONALE', 'RECORD STATUS'];
  var missing = [];
  need.forEach(function (h) { if (t.col[h] === undefined) missing.push(h); });
  if (missing.length) {
    throw new Error('The queue is missing ' + missing.join(', ') +
      '. Nothing was written. Fix the header row in the tracker first.');
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
    throw new Error('A decision is already on that row (' + already +
      '). Nothing was written. Reload — if it is still open in the tracker, finish or clear it there.');
  }

  var trainee = String(live[t.col['TRAINEE']] || '').trim();
  var skill = String(live[t.col['SKILL']] || '').trim();
  var skillId = t.col['SKILL ID'] !== undefined
    ? String(live[t.col['SKILL ID']] || '').trim() : '';
  if (!trainee) throw new Error('That queue row has no trainee. Nothing was written.');

  var gate = portalEvidenceGateV1_(decision, trainee, skill, skillId, why);
  if (gate) throw new Error(gate);

  if (!ensureSignoffLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL.TAB.SIGNOFF +
      ', so nothing was written. A decision with nowhere permanent to live is worse than none.');
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var decisionId = 'SD-P-' + String(new Date().getTime());
  var recordStatus = decision === 'Return for more evidence' ? 'RETURNED' : 'RECORDED';

  appendSignoffLogV1_({
    decisionId: decisionId,
    when: new Date(),
    trainee: trainee,
    skill: skill,
    skillId: skillId,
    decision: decision,
    decidedBy: viewer.email,
    decisionDate: today,
    rationale: why,
    sourceRow: r,
    requestId: have || want || ''
  });

  t.sheet.getRange(r, t.col['DECISION'] + 1).setValue(decision);
  t.sheet.getRange(r, t.col['DECIDED BY'] + 1).setValue(viewer.email);
  t.sheet.getRange(r, t.col['DECISION DATE'] + 1).setValue(today);
  t.sheet.getRange(r, t.col['RATIONALE'] + 1).setValue(clean_(why));
  t.sheet.getRange(r, t.col['RECORD STATUS'] + 1).setValue(recordStatus);

  try { touchMatrixAfterSignoffV1_(trainee, skill, skillId, decision); } catch (eM) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('SIGN-OFF RECORDED', viewer.email, decision + ' | ' + decisionId +
    ' | row ' + r + (have ? ' | ' + have : '') + ' | ' + why.slice(0, 120));

  return decision === 'Return for more evidence'
    ? 'Returned. Permanent record is on the sign-off log.'
    : 'Recorded. Permanent sign-off is on the log.';
}

/**
 * Approve without READY FOR VALIDATION needs an explicit override in the reason —
 * unless the matrix bars (or the evidence log) already meet the bar. Stale
 * readiness from a stuck tracker rebuild must not trap Division.
 */
function portalEvidenceGateV1_(decision, trainee, skill, skillId, rationale) {
  if (decision !== 'Approve sign-off') return '';
  if (String(rationale).indexOf(PORTAL_OVERRIDE_MARKER) >= 0) return '';
  var skills = [];
  try { skills = skillsForV1_(normNameV1_(trainee)); } catch (e) { return ''; }
  if (!skills.length) return '';
  var hit = null;
  skills.forEach(function (s) {
    if (hit) return;
    if (skillId && s.skillId && String(s.skillId) === String(skillId)) hit = s;
    else if (normNameV1_(s.skill) === normNameV1_(skill)) hit = s;
  });
  if (!hit) return '';
  if (hit.signed) return '';
  if (/READY FOR VALIDATION/i.test(hit.readiness || '')) return '';
  if (skillBarsMetV1_(hit)) return '';
  var fromLog = evidenceCountsForSkillV1_(trainee, skill, skillId);
  if (fromLog && skillCountsMeetBarsV1_(fromLog, hit.bars)) return '';
  return 'The matrix does not call this READY FOR VALIDATION (it reads "' +
    (hit.readiness || 'blank') + '"). Run Sync matrix from evidence first, or type ' +
    PORTAL_OVERRIDE_MARKER + ' in your reason if you are overruling it. Nothing was written.';
}

function skillBarsMetV1_(hit) {
  var bars = (hit && hit.bars) || [];
  if (!bars.length) return false;
  for (var i = 0; i < bars.length; i++) {
    if (Number(bars[i].have || 0) < Number(bars[i].need || 0)) return false;
  }
  return true;
}

function skillCountsMeetBarsV1_(counts, bars) {
  if (!counts || !bars || !bars.length) return false;
  var map = {
    Successful: counts.successful,
    Independent: counts.independent,
    Dates: counts.distinctDates,
    FTOs: counts.distinctFtos
  };
  for (var i = 0; i < bars.length; i++) {
    var have = map[bars[i].label];
    if (have == null) have = 0;
    if (Number(have) < Number(bars[i].need || 0)) return false;
  }
  return true;
}

/** Event date on the evidence log — live tabs use SHIFT DATE / TIMESTAMP. */
function evidenceEventDateV1_(ev, r) {
  var cols = ['SHIFT DATE', 'EVENT DATE', 'DATE', 'TIMESTAMP'];
  for (var i = 0; i < cols.length; i++) {
    if (ev.col[cols[i]] === undefined) continue;
    var d = asDateV1_(r[ev.col[cols[i]]]);
    if (d) return d;
  }
  return null;
}

function evidenceAcceptedV1_(r, ev) {
  if (ev.col['VALIDATION RESULT'] === undefined) return true;
  var v = String(r[ev.col['VALIDATION RESULT']] || '').trim();
  if (!v) return true;
  return v === 'ACCEPTED' || v.indexOf('LEGACY IMPORT') === 0;
}

/**
 * Aggregate successful evidence for one trainee + skill from the log.
 * Mirrors the tracker's matrix counters enough for desk sync / gates.
 */
function evidenceCountsForSkillV1_(trainee, skill, skillId) {
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (!ev.ok || ev.col['TRAINEE'] === undefined) return null;
  var tn = normNameV1_(trainee);
  var sk = normNameV1_(skill);
  var sid = String(skillId || '').trim();
  var successful = [];
  ev.rows.forEach(function (r) {
    if (normNameV1_(r[ev.col['TRAINEE']]) !== tn) return;
    if (!evidenceAcceptedV1_(r, ev)) return;
    var idHit = sid && ev.col['SKILL ID'] !== undefined &&
      String(r[ev.col['SKILL ID']] || '').trim() === sid;
    var nameHit = ev.col['SKILL'] !== undefined &&
      normNameV1_(r[ev.col['SKILL']]) === sk;
    if (!idHit && !nameHit) return;
    var outcome = ev.col['OUTCOME'] !== undefined
      ? String(r[ev.col['OUTCOME']] || '').trim() : 'Successful';
    if (outcome && outcome !== 'Successful') return;
    var stage = ev.col['STAGE'] !== undefined
      ? String(r[ev.col['STAGE']] || '').trim().toUpperCase() : 'P';
    if (stage && stage !== 'P' && stage !== 'I') return;
    successful.push({
      stage: stage || 'P',
      when: evidenceEventDateV1_(ev, r),
      fto: ev.col['FTO'] !== undefined ? String(r[ev.col['FTO']] || '').trim() : ''
    });
  });
  if (!successful.length) return { successful: 0, independent: 0, distinctDates: 0, distinctFtos: 0, lastDate: null, stage: '' };
  var dates = {}, ftos = {}, indep = 0, stage = '', last = null;
  successful.forEach(function (e) {
    if (e.stage === 'I') indep++;
    if (e.stage === 'I' || e.stage === 'P') {
      if (!stage || (e.stage === 'I' && stage !== 'I')) stage = e.stage;
    }
    if (e.when) {
      dates[e.when.toDateString()] = true;
      if (!last || e.when > last) last = e.when;
    }
    if (e.fto) ftos[normNameV1_(e.fto)] = true;
  });
  return {
    successful: successful.length,
    independent: indep,
    distinctDates: Object.keys(dates).length,
    distinctFtos: Object.keys(ftos).length,
    lastDate: last,
    stage: stage
  };
}

function ensureSignoffLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.SIGNOFF)) return true;
    var sh = book.insertSheet(PORTAL.TAB.SIGNOFF);
    sh.getRange(1, 1).setValue(
      'Permanent skill sign-off decisions. Append-only. Field Training writes here.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 12).setValues([[
      'DECISION ID', 'TIMESTAMP', 'TRAINEE', 'SKILL ID', 'SKILL', 'DECISION',
      'DECIDED BY', 'DECISION DATE', 'EXPIRATION', 'RATIONALE',
      'SOURCE QUEUE ROW', 'REQUEST ID'
    ]]).setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

/** Header-mapped append — works against live tracker headers or staging's shorter set. */
function appendSignoffLogV1_(f) {
  var t = readTabV1_(PORTAL.TAB.SIGNOFF);
  if (!t.ok) throw new Error('No sign-off log.');
  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'DECISION ID') return f.decisionId || '';
    if (H === 'TIMESTAMP' || H === 'SIGN-OFF DATE') return f.when || new Date();
    if (H === 'TRAINEE') return f.trainee || '';
    if (H === 'SKILL ID') return f.skillId || '';
    if (H === 'SKILL') return f.skill || '';
    if (H === 'DECISION') return f.decision || '';
    if (H === 'DECIDED BY' || H === 'SIGNED OFF BY') return f.decidedBy || '';
    if (H === 'DECISION DATE') return f.decisionDate || f.when || '';
    if (H === 'EXPIRATION') return '';
    if (H === 'RATIONALE') return f.rationale || '';
    if (H === 'SOURCE QUEUE ROW') return f.sourceRow || '';
    if (H === 'REQUEST ID') return f.requestId || '';
    if (H === 'SUPERSEDES') return '';
    if (H === 'STANDARD / CATALOG VERSION') return '';
    if (H === 'DECIDED BY PERSON ID') return f.decidedBy || '';
    if (H === 'WRITER VERSION') return PORTAL.VERSION;
    return '';
  });
  t.sheet.appendRow(row);
}

/** Best-effort matrix touch so clearance gates see the new sign-off without a full rebuild. */
function touchMatrixAfterSignoffV1_(trainee, skill, skillId, decision) {
  var t = readTabV1_(PORTAL.TAB.SKILLS);
  if (!t.ok) return;
  if (t.col['SIGN-OFF'] === undefined && t.col['READINESS'] === undefined) return;
  var norm = normNameV1_(trainee);
  var skillNorm = normNameV1_(skill);
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== norm) return;
    var idHit = skillId && t.col['SKILL ID'] !== undefined &&
      String(r[t.col['SKILL ID']] || '').trim() === skillId;
    var nameHit = normNameV1_(r[t.col['SKILL']]) === skillNorm;
    if (!idHit && !nameHit) return;
    var row = t.firstDataRow + i;
    if (decision === 'Approve sign-off') {
      if (t.col['SIGN-OFF'] !== undefined) {
        t.sheet.getRange(row, t.col['SIGN-OFF'] + 1).setValue('SIGNED OFF');
      }
      if (t.col['READINESS'] !== undefined) {
        t.sheet.getRange(row, t.col['READINESS'] + 1).setValue('SIGNED OFF');
      }
    } else if (decision === 'Return for more evidence') {
      if (t.col['READINESS'] !== undefined) {
        t.sheet.getRange(row, t.col['READINESS'] + 1).setValue('NEEDS MORE EVIDENCE');
      }
      if (t.col['SIGN-OFF'] !== undefined) {
        t.sheet.getRange(row, t.col['SIGN-OFF'] + 1).setValue('');
      }
    }
  });
}

/* ---------------- coaching create ---------------- */

function ensureCoachingLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.COACHING)) return true;
    var sh = book.insertSheet(PORTAL.TAB.COACHING);
    sh.getRange(1, 1).setValue(
      'Coaching notes filed from Field Training. Trainees acknowledge here.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 5)
      .setValues([['DATE', 'TRAINEE', 'FROM', 'NOTE', 'ACKNOWLEDGED']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

/**
 * FTO (their trainee) or Division files a coaching note.
 * Trainee ack path (ackCoachingV1) already exists.
 */
function createCoachingV1(traineeName, note) {
  requireWritableV1_('file a coaching note');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.FTO && viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only a training officer or Training Division may file coaching.');
  }
  var who = String(traineeName || '').trim();
  var text = String(note || '').trim();
  if (!who) throw new Error('Pick a trainee.');
  if (text.length < 8) {
    throw new Error('Type the note. It goes on their record in your name.');
  }

  var rec = null;
  try {
    traineesV1_().forEach(function (t) {
      if (!rec && normNameV1_(t.name) === normNameV1_(who) && !t.closed) rec = t;
    });
  } catch (e) {}
  if (!rec) throw new Error('No active trainee named "' + who + '".');

  if (viewer.role === PORTAL.ROLE.FTO) {
    if (normNameV1_(rec.fto) !== normNameV1_(viewer.name)) {
      throw new Error(rec.name + ' is not on your line. Only their assigned FTO or Division can file coaching.');
    }
  }

  if (!ensureCoachingLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL.TAB.COACHING + '. Nothing was written.');
  }
  var t = readTabV1_(PORTAL.TAB.COACHING);
  if (!t.ok) throw new Error('No coaching log.');

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var from = viewer.name || viewer.email;
  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'DATE') return today;
    if (H === 'TRAINEE') return rec.name;
    if (H === 'FROM') return from;
    if (H === 'NOTE') return clean_(text);
    if (H === 'ACKNOWLEDGED') return '';
    return '';
  });
  t.sheet.appendRow(row);
  forgetTabsV1_();
  auditV1_('COACHING FILED', viewer.email, rec.name + ' | ' + text.slice(0, 120));
  return { ok: true, message: 'Coaching filed for ' + rec.name + '.' };
}

/* ---------------- assign FTO from Division ---------------- */

/**
 * One assignment from Field Training. Reuses the same dropdown rebuild and
 * master write as the editor assignFto() path.
 */
function assignFtoV1(traineeName, ftoName) {
  requireWritableV1_('assign a training officer');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may assign a training officer from Field Training.');
  }
  var trainee = String(traineeName || '').trim();
  var fto = String(ftoName || '').trim();
  if (!trainee) throw new Error('Pick a trainee.');
  if (!fto) throw new Error('Pick a training officer.');

  PropertiesService.getScriptProperties()
    .setProperty(PORTAL_ASSIGN_PROPERTY, trainee + ' -> ' + fto);
  var p = assignPlanV1_();
  if (p.problem) throw new Error(p.problem);
  if (p.noTrainee.length) throw new Error('No trainee named "' + trainee + '" on the master.');
  if (p.noFto.length) {
    throw new Error(fto + ' is not on the active roster. Add them with addFto first.');
  }
  if (p.twoRows.length) {
    throw new Error('More than one master row matches "' + trainee + '". Fix the duplicate first.');
  }
  if (p.same.length && !p.set.length) {
    return { ok: true, message: trainee + ' is already assigned to ' + fto + '.' };
  }
  if (!p.set.length) throw new Error('Nothing to assign.');

  try { rebuildFtoDropdownV1_(); } catch (eD) {}
  var c = assignColumnV1_();
  if (!c) throw new Error('No ASSIGNED FTO column on the master.');
  var s = p.set[0];
  c.sheet.getRange(s.row, c.col).setValue(s.fto);

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  try {
    writeAssignManifestV1_([[stamp, PORTAL.TAB.MASTER, s.row, p.header, s.trainee,
      s.was || '', s.fto, viewer.email, PORTAL.VERSION]]);
  } catch (eM) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('FTO ASSIGNED', viewer.email, s.trainee + ' -> ' + s.fto);
  return { ok: true, message: s.trainee + ' is now assigned to ' + s.fto + '.' };
}

/* ---------------- matrix seed after enroll ---------------- */

/**
 * Put catalog skills onto 05 SKILLS PROGRESS for a new trainee when the
 * catalog tab is present. Full rebuildSkillMatrix remains the gold path;
 * this unblocks clearance tracking without opening the tracker project.
 */
function seedSkillMatrixForTraineeV1_(traineeName, level) {
  var out = { ok: false, added: 0, why: '' };
  var name = String(traineeName || '').trim();
  if (!name) { out.why = 'no name'; return out; }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  if (!matrix.ok) { out.why = 'no skills matrix'; return out; }
  if (matrix.col['TRAINEE'] === undefined || matrix.col['SKILL'] === undefined) {
    out.why = 'matrix headers incomplete';
    return out;
  }

  var catalog = readCatalogSkillsV1_();
  if (!catalog.length) { out.why = 'no skill catalog (or none applicable)'; return out; }

  var have = {};
  matrix.rows.forEach(function (r) {
    if (normNameV1_(r[matrix.col['TRAINEE']]) !== normNameV1_(name)) return;
    var sid = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    var sk = String(r[matrix.col['SKILL']] || '').trim();
    if (sid) have['id:' + sid] = true;
    if (sk) have['sk:' + normNameV1_(sk)] = true;
  });

  var lvl = String(level || '').toLowerCase();
  var added = 0;
  catalog.forEach(function (c) {
    if (!skillAppliesToLevelV1_(c, lvl)) return;
    if (c.id && have['id:' + c.id]) return;
    if (have['sk:' + normNameV1_(c.skill)]) return;
    var row = matrix.headers.map(function (h) {
      var H = String(h || '').trim().toUpperCase();
      if (H === 'TRAINEE') return name;
      if (H === 'SKILL') return c.skill;
      if (H === 'SKILL ID') return c.id || '';
      if (H === 'DOMAIN') return c.domain || '';
      if (H === 'LEVEL') return level || '';
      if (H === 'STAGE') return '';
      if (H === 'READINESS') return 'NOT STARTED';
      if (H === 'SIGN-OFF') return '';
      if (H === 'SUCCESSFUL REPS' || H === 'INDEPENDENT REPS' ||
          H === 'DISTINCT DATES' || H === 'DISTINCT FTOS') return 0;
      return '';
    });
    matrix.sheet.appendRow(row);
    added++;
    if (c.id) have['id:' + c.id] = true;
    have['sk:' + normNameV1_(c.skill)] = true;
  });

  if (added) forgetTabsV1_();
  out.ok = true;
  out.added = added;
  return out;
}

function readCatalogSkillsV1_() {
  try {
    var book = targetBookV1_();
    var sh = book.getSheetByName(PORTAL_CATALOG_TAB);
    if (!sh || sh.getLastRow() < PORTAL.HEADER_ROW + 1) return [];
    var width = Math.max(sh.getLastColumn(), 17);
    var headers = sh.getRange(PORTAL.HEADER_ROW, 1, 1, width).getValues()[0];
    var col = {};
    headers.forEach(function (h, i) {
      var k = String(h || '').trim().toUpperCase();
      if (k && col[k] === undefined) col[k] = i;
    });
    if (col['SKILL ID'] === undefined || col['SKILL'] === undefined) return [];
    var n = sh.getLastRow() - PORTAL.HEADER_ROW;
    if (n < 1) return [];
    var rows = sh.getRange(PORTAL.HEADER_ROW + 1, 1, n, width).getValues();
    var out = [];
    rows.forEach(function (r) {
      var id = String(r[col['SKILL ID']] || '').trim();
      var skill = String(r[col['SKILL']] || '').trim();
      if (!id || !skill) return;
      var active = col['ACTIVE'] !== undefined ? yesishV1_(r[col['ACTIVE']]) : true;
      var status = col['APPROVAL STATUS'] !== undefined
        ? String(r[col['APPROVAL STATUS']] || '').trim()
        : (col['STATUS'] !== undefined ? String(r[col['STATUS']] || '').trim() : 'APPROVED');
      if (!active) return;
      if (status && !/^APPROVED$/i.test(status) && status !== '') return;
      out.push({
        id: id,
        skill: skill,
        domain: col['DOMAIN'] !== undefined ? String(r[col['DOMAIN']] || '').trim() : '',
        emt: col['EMT'] !== undefined ? yesishV1_(r[col['EMT']]) : true,
        aemt: col['AEMT'] !== undefined ? yesishV1_(r[col['AEMT']]) : true,
        paramedic: col['PARAMEDIC'] !== undefined ? yesishV1_(r[col['PARAMEDIC']]) : true
      });
    });
    return out;
  } catch (e) { return []; }
}

function yesishV1_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1' || s === 'X';
}

function skillAppliesToLevelV1_(c, lvl) {
  if (/paramedic|pmd/.test(lvl)) return !!c.paramedic;
  if (/advanced|aemt/.test(lvl)) return !!c.aemt;
  if (/emt/.test(lvl)) return !!c.emt;
  // Unknown level — seed everything active so the person is not invisible.
  return true;
}

/**
 * Push matrix READY skills onto the OPEN validation queue when they are missing.
 * Append-only. Does not cancel, sort, or sweep — that stays a human / tracker job
 * until Field Training owns the full rebuild. Division can run this from the desk
 * so READY skills show up without opening the tracker.
 */
function refreshValidationQueueV1() {
  requireWritableV1_('refresh the validation queue');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may refresh the validation queue.');
  }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  var queue = readTabV1_(PORTAL.TAB.QUEUE);
  if (!matrix.ok) throw new Error('No skills matrix.');
  if (!queue.ok) throw new Error('No validation queue.');

  var needQ = ['TRAINEE', 'SKILL', 'RECORD STATUS'];
  var missingQ = needQ.filter(function (h) { return queue.col[h] === undefined; });
  if (missingQ.length) {
    throw new Error('The queue is missing ' + missingQ.join(', ') + '. Nothing was written.');
  }
  if (matrix.col['TRAINEE'] === undefined || matrix.col['READINESS'] === undefined) {
    throw new Error('The matrix is missing TRAINEE or READINESS. Nothing was written.');
  }

  // Index OPEN by skill id AND skill name so a nameless id row and an id-less
  // name row of the same skill do not both get another OPEN.
  var open = {};
  queue.rows.forEach(function (r) {
    if (String(r[queue.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    var tn = normNameV1_(r[queue.col['TRAINEE']]);
    var sid = queue.col['SKILL ID'] !== undefined
      ? String(r[queue.col['SKILL ID']] || '').trim() : '';
    var sk = normNameV1_(r[queue.col['SKILL']]);
    if (sid) open[tn + '||' + sid] = true;
    if (sk) open[tn + '||' + sk] = true;
  });

  // Exact readiness only — /READY FOR VALIDATION/ would also match NOT READY.
  var QUALIFY = {
    'READY FOR VALIDATION': true,
    'SIGNED OFF - REVIEW REQUIRED': true,
    'LEGACY SIGN-OFF REVIEW REQUIRED': true
  };
  var added = 0;
  matrix.rows.forEach(function (r) {
    var readiness = String(r[matrix.col['READINESS']] || '').trim();
    if (!QUALIFY[readiness]) return;
    var trainee = String(r[matrix.col['TRAINEE']] || '').trim();
    if (!trainee) return;
    var skill = matrix.col['SKILL'] !== undefined
      ? String(r[matrix.col['SKILL']] || '').trim() : '';
    var skillId = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    if (!skill && !skillId) return;
    var tn = normNameV1_(trainee);
    var idKey = skillId ? tn + '||' + skillId : '';
    var nameKey = skill ? tn + '||' + normNameV1_(skill) : '';
    if ((idKey && open[idKey]) || (nameKey && open[nameKey])) return;

    var lastDate = matrix.col['LAST DATE'] !== undefined
      ? asDateV1_(r[matrix.col['LAST DATE']]) : null;
    var domain = matrix.col['DOMAIN'] !== undefined
      ? String(r[matrix.col['DOMAIN']] || '').trim() : '';
    var succ = matrix.col['SUCCESSFUL REPS'] !== undefined ? Number(r[matrix.col['SUCCESSFUL REPS']]) || 0 : 0;
    var indep = matrix.col['INDEPENDENT REPS'] !== undefined ? Number(r[matrix.col['INDEPENDENT REPS']]) || 0 : 0;
    var dates = matrix.col['DISTINCT DATES'] !== undefined ? Number(r[matrix.col['DISTINCT DATES']]) || 0 : 0;
    var ftos = matrix.col['DISTINCT FTOS'] !== undefined ? Number(r[matrix.col['DISTINCT FTOS']]) || 0 : 0;
    // Staging-style text — never "4 / 2 / 2 / 2", which parseEvidenceBarsV1_
    // misreads as have/need pairs.
    var evidence = succ + ' successful, ' + indep + ' independent, ' +
      dates + ' dates, ' + ftos + ' FTOs';
    var requestId = 'QR-P-' + String(new Date().getTime()) + '-' + added;

    var row = queue.headers.map(function (h) {
      var H = String(h || '').trim().toUpperCase();
      if (H === 'READY DATE' || H === 'LAST EVIDENCE DATE') return lastDate || new Date();
      if (H === 'TRAINEE') return trainee;
      if (H === 'SKILL ID') return skillId;
      if (H === 'DOMAIN') return domain;
      if (H === 'SKILL') return skill;
      if (H === 'EVIDENCE SUMMARY') return evidence;
      if (H === 'RECORD STATUS') return 'OPEN';
      if (H === 'REQUEST ID') return requestId;
      return '';
    });
    queue.sheet.appendRow(row);
    if (idKey) open[idKey] = true;
    if (nameKey) open[nameKey] = true;
    added++;
  });

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('VALIDATION QUEUE REFRESH', viewer.email, added + ' row(s) added');
  return {
    ok: true,
    added: added,
    message: added
      ? ('Added ' + added + ' OPEN row' + (added === 1 ? '' : 's') + ' from the matrix.')
      : 'Queue already has every READY skill. Nothing added.'
  };
}

/**
 * When the tracker matrix is stale but skills are on the evidence log, recount
 * each matrix row from the log and flip readiness to READY FOR VALIDATION when
 * the bars are met. Does not wipe or rebuild the matrix. Optionally refreshes
 * the OPEN queue afterward.
 */
function syncMatrixFromEvidenceV1() {
  requireWritableV1_('sync the skills matrix from the evidence log');
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may sync the matrix from evidence.');
  }

  var matrix = readTabV1_(PORTAL.TAB.SKILLS);
  var ev = readTabV1_(PORTAL.TAB.EVIDENCE);
  if (!matrix.ok) throw new Error('No skills matrix.');
  if (!ev.ok) throw new Error('No evidence log.');
  if (matrix.col['TRAINEE'] === undefined) {
    throw new Error('The matrix is missing TRAINEE. Nothing was written.');
  }

  var updated = 0, markedReady = 0;
  matrix.rows.forEach(function (r, i) {
    var trainee = String(r[matrix.col['TRAINEE']] || '').trim();
    if (!trainee) return;
    var readiness = matrix.col['READINESS'] !== undefined
      ? String(r[matrix.col['READINESS']] || '').trim() : '';
    var signoff = matrix.col['SIGN-OFF'] !== undefined
      ? String(r[matrix.col['SIGN-OFF']] || '').trim() : '';
    if (signoff === 'SIGNED OFF' || readiness === 'SIGNED OFF') return;

    var skill = matrix.col['SKILL'] !== undefined
      ? String(r[matrix.col['SKILL']] || '').trim() : '';
    var skillId = matrix.col['SKILL ID'] !== undefined
      ? String(r[matrix.col['SKILL ID']] || '').trim() : '';
    if (!skill && !skillId) return;

    var counts = evidenceCountsForSkillV1_(trainee, skill, skillId);
    if (!counts || !counts.successful) return;

    var row = matrix.firstDataRow + i;
    var wrote = false;
    function setCol(name, value) {
      if (matrix.col[name] === undefined) return;
      var cur = r[matrix.col[name]];
      if (String(cur) === String(value)) return;
      matrix.sheet.getRange(row, matrix.col[name] + 1).setValue(value);
      r[matrix.col[name]] = value;
      wrote = true;
    }
    setCol('SUCCESSFUL REPS', counts.successful);
    setCol('INDEPENDENT REPS', counts.independent);
    setCol('DISTINCT DATES', counts.distinctDates);
    setCol('DISTINCT FTOS', counts.distinctFtos);
    if (counts.lastDate) setCol('LAST DATE', counts.lastDate);
    if (counts.stage) setCol('STAGE', counts.stage);

    var needS = cellNumV1_(r, matrix, ['NEED SUCCESSFUL', 'REQUIRED SUCCESSFUL'], 3) || 3;
    var needI = cellNumV1_(r, matrix, ['NEED INDEPENDENT', 'REQUIRED INDEPENDENT'], 2) || 2;
    var needD = cellNumV1_(r, matrix, ['NEED DATES', 'REQUIRED DATES'], 2) || 2;
    var needF = cellNumV1_(r, matrix, ['NEED FTOS', 'REQUIRED FTOS'], 2) || 2;
    // Live matrix often lacks NEED_* columns — use the same defaults as skillsForV1_.
    if (matrix.col['NEED SUCCESSFUL'] === undefined &&
        matrix.col['REQUIRED SUCCESSFUL'] === undefined) {
      needS = 3; needI = 2; needD = 2; needF = 2;
    }

    var met = counts.successful >= needS &&
      counts.independent >= needI &&
      counts.distinctDates >= needD &&
      counts.distinctFtos >= needF;
    if (met && matrix.col['READINESS'] !== undefined &&
        readiness !== 'READY FOR VALIDATION' &&
        readiness !== 'SIGNED OFF - REVIEW REQUIRED' &&
        readiness !== 'LEGACY SIGN-OFF REVIEW REQUIRED') {
      setCol('READINESS', 'READY FOR VALIDATION');
      markedReady++;
    }
    if (wrote) updated++;
  });

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var queueMsg = '';
  var added = 0;
  try {
    var q = refreshValidationQueueV1();
    added = q && q.added ? q.added : 0;
    queueMsg = q && q.message ? q.message : '';
  } catch (eQ) {
    queueMsg = 'Queue refresh skipped: ' + String(eQ.message || eQ);
  }

  auditV1_('MATRIX SYNC FROM EVIDENCE', viewer.email,
    updated + ' row(s) updated, ' + markedReady + ' marked READY, queue +' + added);

  return {
    ok: true,
    updated: updated,
    markedReady: markedReady,
    queueAdded: added,
    message: updated
      ? ('Updated ' + updated + ' matrix row' + (updated === 1 ? '' : 's') +
         ' from the evidence log' +
         (markedReady ? ('; marked ' + markedReady + ' READY') : '') +
         '. ' + queueMsg)
      : ('No matrix rows needed a recount from the evidence log. ' + queueMsg)
  };
}


/* ======================================================================
 * 92_Lifecycle.gs
 * ====================================================================== */

/**
 * Phase and clearance — Field Training lifecycle.
 *
 * Training Division keeps CURRENT PHASE current and can clear a trainee for
 * independent partner duty when they have finished the program.
 *
 * Advance:
 *   CURRENT PHASE → next · PHASE START DATE → today · optional assignment
 *   history row · PORTAL AUDIT.
 *
 * Clear for the truck (successful completion — not termination):
 *   SET STATUS → Cleared / Independent · archive snapshot · cancel OPEN
 *   skill-queue rows · refresh form Trainee lists · PORTAL AUDIT.
 *
 * "Released from training" means they completed every phase and the required
 * skills and may ride as a partner. It is a graduation, not leaving the job.
 */

var PORTAL_PHASES_V1 = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
var PORTAL_RELEASE_LOG = 'PORTAL RELEASE LOG';
var PORTAL_ARCHIVE_TAB = '17 TRAINEE ARCHIVE';
var PORTAL_ASSIGNMENTS_TAB = '92 ASSIGNMENT HISTORY';
/** Vault status for someone cleared to ride as an independent partner. */
var PORTAL_CLEARED_STATUS = 'Cleared / Independent';

function phaseIndexV1_(phase) {
  var p = String(phase || '').trim();
  var i = PORTAL_PHASES_V1.indexOf(p);
  if (i >= 0) return i;
  var m = p.match(/(\d+)/);
  if (m) {
    var n = Number(m[1]) - 1;
    if (n >= 0 && n < PORTAL_PHASES_V1.length) return n;
  }
  return -1;
}

function nextPhaseV1_(phase) {
  var i = phaseIndexV1_(phase);
  if (i < 0 || i >= PORTAL_PHASES_V1.length - 1) return '';
  return PORTAL_PHASES_V1[i + 1];
}

/** Live master row for an active (or any) trainee by exact/normalized name. */
function findTraineeOnMasterV1_(name) {
  var want = normNameV1_(name);
  if (!want) return null;
  var list = traineesV1_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].norm === want) return list[i];
  }
  return null;
}

function requireDivisionWritableV1_(what) {
  requireWritableV1_(what);
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may ' + what + '.');
  }
  return viewer;
}

/**
 * Advance one phase. Typed reason required (≥8).
 * Returns { ok, name, from, to, message }.
 */
function advanceTraineePhaseV1(traineeName, reason) {
  var viewer = requireDivisionWritableV1_('advance a phase');
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why you are advancing them. It goes on the permanent record in your name.');
  }
  var who = String(traineeName || '').trim();
  var rec = findTraineeOnMasterV1_(who);
  if (!rec) throw new Error('No trainee named "' + who + '" on the master.');
  if (rec.from) {
    throw new Error(rec.name + ' was read from another book (' + rec.from +
      '). Bring them onto this tracker before advancing.');
  }
  if (rec.closed) throw new Error(rec.name + ' is already closed / released.');
  if (!rec.row) throw new Error('Cannot find a writable row for ' + rec.name + '.');

  var next = nextPhaseV1_(rec.phase);
  if (!next) {
    if (phaseIndexV1_(rec.phase) === PORTAL_PHASES_V1.length - 1) {
      throw new Error(rec.name + ' is already in Phase 4. Clear them for the truck when the program is complete — phase does not advance past that.');
    }
    throw new Error('Current phase "' + (rec.phase || '(blank)') +
      '" is not a known phase. Fix the master row first.');
  }

  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) throw new Error(PORTAL.TAB.MASTER + ' is missing.');
  if (t.col['CURRENT PHASE'] === undefined) {
    throw new Error('CURRENT PHASE column is missing on the master.');
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  t.sheet.getRange(rec.row, t.col['CURRENT PHASE'] + 1).setValue(next);
  if (t.col['PHASE START DATE'] !== undefined) {
    t.sheet.getRange(rec.row, t.col['PHASE START DATE'] + 1).setValue(today);
  }

  try { appendAssignmentHistoryV1_(rec, next, today, viewer.email, why); }
  catch (eHist) {}

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  auditV1_('PHASE ADVANCED', viewer.email,
    rec.name + ' | ' + rec.phase + ' → ' + next + ' | ' + why.slice(0, 200));

  return {
    ok: true,
    name: rec.name,
    from: rec.phase,
    to: next,
    message: rec.name + ' is now in ' + next + '.'
  };
}

/**
 * Clear a trainee for independent partner duty (successful program completion).
 * Typed reason required. Soft-closes on the master, archives the clearance,
 * cancels open skill requests, refreshes form lists.
 */
function releaseTraineeV1(traineeName, reason) {
  var viewer = requireDivisionWritableV1_('clear a trainee for independent duty');
  var why = String(reason || '').trim();
  if (why.length < 8) {
    throw new Error('Type why they are cleared. It goes on the permanent record in your name.');
  }
  var who = String(traineeName || '').trim();
  var rec = findTraineeOnMasterV1_(who);
  if (!rec) throw new Error('No trainee named "' + who + '" on the master.');
  if (rec.from) {
    throw new Error(rec.name + ' was read from another book. Bring them onto this tracker before clearing.');
  }
  if (rec.closed) throw new Error(rec.name + ' is already cleared / closed.');
  if (!rec.row) throw new Error('Cannot find a writable row for ' + rec.name + '.');

  var assess = clearanceAssessmentV1_(rec);
  if (!assess.canClear) {
    throw new Error(rec.name + ' is not ready for the truck yet.\n\n' +
      (assess.gaps.length ? assess.gaps.join('\n') : 'Finish Phase 4 and every skill sign-off first.'));
  }

  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) throw new Error(PORTAL.TAB.MASTER + ' is missing.');

  var statusHeader = t.col['SET STATUS'] !== undefined ? 'SET STATUS'
                   : (t.col['PROGRAM STATUS'] !== undefined ? 'PROGRAM STATUS' : '');
  if (!statusHeader) {
    throw new Error('No SET STATUS / PROGRAM STATUS column on the master. Nothing was written.');
  }

  writeReleaseArchiveV1_(rec, viewer.email, why);

  t.sheet.getRange(rec.row, t.col[statusHeader] + 1).setValue(PORTAL_CLEARED_STATUS);

  var cancelled = cancelOpenSkillQueueForV1_(rec.name);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var sync = null;
  try { sync = syncRegisteredFormChoicesV1_(); } catch (eSync) {}

  auditV1_('TRAINEE CLEARED', viewer.email,
    rec.name + ' | phase ' + (rec.phase || '?') + ' | independent partner | cancelled ' +
    cancelled + ' | ' + why.slice(0, 160));

  var msg = rec.name + ' is cleared for independent partner duty. Captured with your reason.';
  if (cancelled) msg += ' ' + cancelled + ' open skill request(s) cancelled.';
  if (sync && sync.ok) msg += ' Form Trainee lists updated.';
  return {
    ok: true,
    name: rec.name,
    phase: rec.phase,
    cancelled: cancelled,
    message: msg
  };
}

function appendAssignmentHistoryV1_(rec, newPhase, eff, by, why) {
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ASSIGNMENTS_TAB);
  if (!sh) return;
  var t = readTabUncachedV1_(PORTAL_ASSIGNMENTS_TAB);
  if (!t.ok) return;
  var row = new Array(t.headers.length);
  for (var i = 0; i < row.length; i++) row[i] = '';
  function put(h, v) {
    if (t.col[h] !== undefined) row[t.col[h]] = v;
  }
  put('TRAINEE', rec.name);
  put('LEVEL', rec.level);
  put('FTO', rec.fto);
  put('PHASE', newPhase);
  put('PHASE START', eff);
  put('STATUS', 'ACTIVE');
  put('OPENED', new Date());
  put('SOURCE', 'advancement by ' + by + ' (Field Training)');
  put('NOTES', why);
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function writeReleaseArchiveV1_(rec, by, why) {
  var book = targetBookV1_();
  var stamp = new Date();
  var payload = {
    'DATE ARCHIVED': stamp,
    'TRAINEE': rec.name,
    'LEVEL': rec.level || '',
    'FTO': rec.fto || '',
    'PHASE AT EXIT': rec.phase || '',
    'FINAL STATUS': PORTAL_CLEARED_STATUS,
    'NOTES': 'Cleared for independent partner duty by ' + by + ': ' + why,
    'RELEASED BY': by,
    'EMAIL': rec.email || ''
  };

  var sh = book.getSheetByName(PORTAL_ARCHIVE_TAB);
  if (sh) {
    var t = readTabUncachedV1_(PORTAL_ARCHIVE_TAB);
    if (t.ok && t.headers.length) {
      var row = new Array(t.headers.length);
      for (var i = 0; i < row.length; i++) row[i] = '';
      Object.keys(payload).forEach(function (h) {
        if (t.col[h] !== undefined) row[t.col[h]] = payload[h];
      });
      // If NOTES exists under another name, still try NOTES.
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }

  // Fallback log owned by the portal — always available.
  sh = book.getSheetByName(PORTAL_RELEASE_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RELEASE_LOG);
    sh.getRange(1, 1).setValue(
      'Clearances captured from Field Training. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 8)
      .setValues([['DATE ARCHIVED', 'TRAINEE', 'LEVEL', 'FTO', 'PHASE AT EXIT',
                   'FINAL STATUS', 'RELEASED BY', 'NOTES']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.appendRow([
    stamp, rec.name, rec.level || '', rec.fto || '', rec.phase || '',
    PORTAL_CLEARED_STATUS, by, why
  ]);
}

function cancelOpenSkillQueueForV1_(traineeName) {
  var t = readTabV1_(PORTAL.TAB.QUEUE);
  if (!t.ok || t.col['TRAINEE'] === undefined) return 0;
  if (t.col['RECORD STATUS'] === undefined) return 0;
  var want = normNameV1_(traineeName);
  var n = 0;
  t.rows.forEach(function (r, i) {
    if (normNameV1_(r[t.col['TRAINEE']]) !== want) return;
    if (String(r[t.col['RECORD STATUS']] || '').trim() !== 'OPEN') return;
    t.sheet.getRange(t.firstDataRow + i, t.col['RECORD STATUS'] + 1)
      .setValue('CANCELLED : TRAINEE CLOSED');
    n++;
  });
  return n;
}


/* ======================================================================
 * 93_Acknowledge.gs
 * ====================================================================== */

/**
 * "I have seen this."
 *
 * The Division screen names three people and a reason each: 27 days since an
 * evaluation, not responding to training, never evaluated. Tapping one used to
 * open a screen that did not even repeat the reason, let alone offer anything
 * to do about it. Three problems, no way to act on any of them, and no way to
 * stop being shown them tomorrow.
 *
 * The doctrine says exactly what the answer is not:
 *
 *   "Never build anything that blanks a finding without the data changing or
 *    a named acknowledgment."
 *
 * So this is the named acknowledgment, and nothing more. It does not clear a
 * finding and it cannot. It records that a named person saw it, in their own
 * words, on a date, and how long they are asking for before it comes back.
 * The finding stays on the screen the whole time - demoted out of the alarm
 * list, never deleted from it.
 *
 * Three properties make it safe to defend:
 *
 *   APPEND ONLY   Nothing here edits or deletes a row. An acknowledgment you
 *                 disagree with is superseded by a later one, exactly the way
 *                 a decision is revoked rather than erased.
 *
 *   IT EXPIRES    A hold lasts a stated number of days and then the finding is
 *                 back, unchanged. Without that, acknowledging is just a way
 *                 to hide something permanently, which is the thing the rule
 *                 above exists to prevent.
 *
 *   IT IS KEYED   TO THE FINDING'S OWN WORDS. "27 days since an evaluation" is
 *                 not the same finding as "34 days since an evaluation", so
 *                 acknowledging one does not silence the other. When the data
 *                 changes, the new state surfaces on its own.
 */

var ACK_HEADERS_V1 = ['WHEN', 'TRAINEE', 'FINDING', 'WHO', 'NOTE', 'HOLDS UNTIL'];

/** The log, made if it is not there. Returns 'present', 'created' or ''. */
function ensureAckLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL.TAB.ACKS)) return 'present';
    var sh = book.insertSheet(PORTAL.TAB.ACKS);
    sh.getRange(1, 1).setValue(
      'Findings the Training Division has seen, in their own words. Written by ' +
      'the portal, append only. Do not edit, sort or delete rows: an entry you ' +
      'disagree with is superseded by a later one.').setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, ACK_HEADERS_V1.length)
      .setValues([ACK_HEADERS_V1])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return 'created';
  } catch (e) { return ''; }
}

/** How long a hold may last. A month is the outside of "I am dealing with it";
 *  anything longer is a decision, and a decision belongs on the record as one. */
var ACK_MAX_DAYS_V1 = 30;
var ACK_DEFAULT_DAYS_V1 = 7;

function ackDaysV1_(v) {
  var n = Math.floor(Number(v));
  if (!n || n < 1) return ACK_DEFAULT_DAYS_V1;
  return n > ACK_MAX_DAYS_V1 ? ACK_MAX_DAYS_V1 : n;
}

/** Everything ever acknowledged, read across every listed spreadsheet. */
function ackRowsV1_() {
  var t = readTabAllV1_(PORTAL.TAB.ACKS);
  if (!t.ok) return [];
  var iWhen = headerIndexV1_(t, ['WHEN']);
  var iWho  = headerIndexV1_(t, ['TRAINEE']);
  var iWhat = headerIndexV1_(t, ['FINDING']);
  var iBy   = headerIndexV1_(t, ['WHO']);
  var iNote = headerIndexV1_(t, ['NOTE']);
  var iTill = headerIndexV1_(t, ['HOLDS UNTIL']);
  if (iWho < 0 || iWhat < 0) return [];

  var out = [];
  t.rows.forEach(function (r) {
    var who = atV1_(r, iWho);
    if (!who) return;
    out.push({
      norm: normNameV1_(who),
      finding: atV1_(r, iWhat),
      by: atV1_(r, iBy),
      note: atV1_(r, iNote),
      when: iWhen < 0 ? null : asDateV1_(r[iWhen]),
      until: iTill < 0 ? null : asDateV1_(r[iTill])
    });
  });
  return out;
}

/** The acknowledgment standing over this exact finding right now, or null.
 *
 *  The LAST matching row wins, because the log is append-only and a later
 *  entry supersedes an earlier one. An expired hold returns null: the finding
 *  is back, and the record of having seen it is still there. */
function liveAckForV1_(norm, finding, rows) {
  var f = String(finding || '').trim().toLowerCase();
  if (!f) return null;
  var now = new Date();
  var hit = null;
  (rows || ackRowsV1_()).forEach(function (a) {
    if (a.norm !== norm) return;
    if (String(a.finding || '').trim().toLowerCase() !== f) return;
    hit = a;
  });
  if (!hit) return null;
  if (!hit.until || hit.until.getTime() < now.getTime()) return null;
  return { by: hit.by, note: hit.note,
           when: hit.when ? hit.when.toDateString() : '',
           until: hit.until.toDateString(),
           daysLeft: Math.max(0, Math.ceil((hit.until - now) / 86400000)) };
}

/** Everything the Division has ever said about one person, newest first.
 *  Read only, and shown on their sheet whether it is still holding or not. */
function ackHistoryForV1_(norm) {
  var now = new Date();
  return ackRowsV1_().filter(function (a) { return a.norm === norm; })
    .map(function (a) {
      return { finding: a.finding, by: a.by, note: a.note,
               when: a.when ? a.when.toDateString() : '',
               until: a.until ? a.until.toDateString() : '',
               live: !!(a.until && a.until.getTime() >= now.getTime()),
               at: a.when ? a.when.getTime() : 0 };
    })
    .sort(function (x, y) { return y.at - x.at; });
}


/* ======================================================================
 * 94_Assign.gs
 * ====================================================================== */

/**
 * Who trains whom.
 *
 * The ASSIGNED FTO column on the trainee master is a dropdown, and the list
 * inside it is a fixed list of names typed in at some point in the past. It
 * does not follow the roster. So every time the roster changes, that dropdown
 * quietly becomes wrong, and the sheet starts refusing names that are now
 * perfectly correct:
 *
 *   "The data you entered in cell E10 violates the data validation rules"
 *
 * That single stale list is what stopped Harley Simms being written, and what
 * would have stopped Chyna Gray. It is also, indirectly, how a whole sentence
 * of the dropdown's own help text ended up in a trainee's cell.
 *
 * So this rebuilds the list from the roster before writing anything into it.
 * The dropdown becomes what it always should have been: the people who
 * actually work here, and nobody else.
 *
 * Every roster change in this project now rebuilds it too - a rename, a
 * retirement, somebody joining - so it cannot go stale again.
 *
 * What it will not do:
 *   Offer somebody who has left. That is the point of rebuilding it.
 *   Write an assignment to an officer who is not on the active roster.
 *   Guess between two people with the same name.
 */

var PORTAL_ASSIGN_PROPERTY = 'PORTAL_ASSIGN';
var PORTAL_ASSIGN_LOG = 'PORTAL ASSIGNMENT LOG';

/** The ASSIGNED FTO column on the trainee master, or null. */
function assignColumnV1_() {
  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) return null;
  var header = '';
  ['ASSIGNED FTO', 'TRAINING OFFICER', 'FTO'].forEach(function (h) {
    if (!header && t.col[h] !== undefined) header = h; });
  if (!header) return null;
  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.MASTER);
  if (!sh) return null;
  return { tab: t, sheet: sh, header: header, col: t.col[header] + 1 };
}

/** Puts the active roster into the ASSIGNED FTO dropdown.
 *
 *  Returns { ok, names, was, why }. It reads the old rule first so the report
 *  can say what it replaced, and so undoAssignDropdown() can put it back. */
function rebuildFtoDropdownV1_() {
  var c = assignColumnV1_();
  if (!c) return { ok: false, names: [], was: null, why: 'no ASSIGNED FTO column' };

  var names = [];
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      if (p.name && names.indexOf(p.name) < 0) names.push(p.name); });
  } catch (e) { return { ok: false, names: [], was: null, why: String(e.message || e) }; }
  if (!names.length) return { ok: false, names: [], was: null, why: 'the roster names nobody' };
  names.sort();

  var firstRow = c.tab.firstDataRow;
  var lastRow = Math.max(c.sheet.getMaxRows ? c.sheet.getMaxRows() : c.sheet.getLastRow(),
                         c.sheet.getLastRow(), firstRow);
  var nRows = Math.max(lastRow - firstRow + 1, 1);

  // what it held before, so the report can say what changed
  var was = null;
  try {
    var old = c.sheet.getRange(firstRow, c.col).getDataValidation();
    if (old) {
      var vals = old.getCriteriaValues() || [];
      was = { type: String(old.getCriteriaType()),
              list: (vals[0] && vals[0].slice) ? vals[0].slice() : [] };
    }
  } catch (e) {}

  try {
    c.sheet.getRange(firstRow, c.col, nRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList([''].concat(names), true)
        .setAllowInvalid(false)
        .setHelpText('Pick a training officer.')
        .build());
  } catch (e) {
    return { ok: false, names: names, was: was, why: String(e.message || e) };
  }
  return { ok: true, names: names, was: was, why: '', header: c.header, col: c.col };
}

/** Rebuilds it and says what happened, on its own. */
function fixFtoDropdown() {
  var r = rebuildFtoDropdownV1_();
  if (!r.ok) {
    return noteV1_('Could not rebuild the ASSIGNED FTO dropdown: ' + r.why +
      '\n\nNothing was changed.');
  }
  var L = ['THE ASSIGNED FTO DROPDOWN NOW MATCHES THE ROSTER', '',
    'In : ' + safeTargetNameV1_(), '',
    r.names.length + ' name(s) in it, everybody on the roster who still works here:'];
  r.names.forEach(function (n) { L.push('  ' + n); });
  if (r.was && r.was.list && r.was.list.length) {
    var gone = r.was.list.filter(function (n) {
      return n && r.names.indexOf(String(n)) < 0; });
    var added = r.names.filter(function (n) {
      return r.was.list.map(String).indexOf(n) < 0; });
    if (added.length) { L.push(''); L.push('Added: ' + added.join(', ')); }
    if (gone.length) {
      L.push('');
      L.push('No longer offered: ' + gone.map(String).join(', '));
      L.push('  Nobody\'s existing assignment was changed. A trainee still');
      L.push('  assigned to one of these appears on the Division screen under');
      L.push('  "On nobody\'s list".');
    }
    if (!added.length && !gone.length) { L.push(''); L.push('It was already correct.'); }
  }
  L.push('');
  L.push('This list was a fixed one, typed in at some point, that did not follow');
  L.push('the roster. That is what refused Harley Simms. Every roster change in');
  L.push('this portal rebuilds it now, so it cannot go stale again.');
  return noteV1_(L.join('\n'));
}

/* ---------------------------------------------------------------- *
 *  Assigning a trainee to an officer
 * ---------------------------------------------------------------- */

/** "Latavia Cole -> Chyna Gray", semicolons between several. */
function assignRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ASSIGN_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var m = String(piece).split(/\s*(?:->|=>|-->|:)\s*/);
    if (m.length !== 2) return;
    var who = m[0].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    var fto = m[1].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!who || !fto) return;
    out.push({ trainee: who, fto: fto });
  });
  return out;
}

function assignPlanV1_() {
  var plan = { set: [], same: [], noTrainee: [], noFto: [], twoRows: [], problem: '',
               header: '' };
  plan.requests = assignRequestsV1_();
  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_ASSIGN_PROPERTY + '.\n\n' +
      'The trainee, an arrow, and their training officer:\n' +
      '  Latavia Cole -> Chyna Gray\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var c = assignColumnV1_();
  if (!c) {
    plan.problem = PORTAL.TAB.MASTER + ' has no ASSIGNED FTO column.';
    return plan;
  }
  plan.header = c.header;

  var t = c.tab;
  var active = rosterActivePeopleV1_();

  plan.requests.forEach(function (req) {
    var tn = normNameV1_(req.trainee);
    var rows = [];
    t.rows.forEach(function (r, i) {
      if (normNameV1_(r[t.col['TRAINEE']]) === tn) {
        rows.push({ row: realRowV1_(t, i),
                    now: String(r[t.col[c.header]] == null ? '' : r[t.col[c.header]]).trim() });
      }
    });
    if (!rows.length) { plan.noTrainee.push(req); return; }
    if (rows.length > 1) {
      plan.twoRows.push({ name: req.trainee,
        rows: rows.map(function (x) { return x.row; }) });
      return;
    }

    // The officer has to be somebody who works here. Writing a name the
    // roster does not have is how a trainee ends up on nobody's list, which
    // is the exact thing this is for.
    var fn = normNameV1_(req.fto);
    var hits = active.filter(function (p) { return p.norm === fn; });
    if (!hits.length) { plan.noFto.push(req); return; }
    if (hits.length > 1) {
      plan.twoRows.push({ name: req.fto,
        rows: hits.map(function (p) { return p.row; }) });
      return;
    }

    var row = rows[0];
    if (row.row < 0) {
      plan.noTrainee.push({ trainee: req.trainee, fto: req.fto,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (normNameV1_(row.now) === fn) {
      plan.same.push({ trainee: req.trainee, fto: hits[0].name, row: row.row });
      return;
    }
    plan.set.push({ trainee: req.trainee, fto: hits[0].name, row: row.row, was: row.now });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture. Writes nothing. */
function assignBeforeAndAfter() {
  var p = assignPlanV1_();
  var L = ['ASSIGNING TRAINEES  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  assignBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: assignFto()');
  return noteV1_(L.join('\n'));
}

function assignBodyV1_(p, L, done) {
  p.set.forEach(function (s) {
    L.push((done ? 'ASSIGNED   ' : 'WOULD ASSIGN   ') + s.trainee + '   ->   ' + s.fto);
    L.push('  row ' + s.row + ', ' + p.header + ' was ' +
           (s.was ? '"' + (s.was.length > 60 ? s.was.slice(0, 60) + '...' : s.was) + '"'
                  : '(blank)'));
    L.push('');
  });
  if (p.same.length) {
    L.push('ALREADY ASSIGNED THAT WAY  (' + p.same.length + ')');
    p.same.forEach(function (s) { L.push('  ' + s.trainee + '   ->   ' + s.fto); });
    L.push('');
  }
  if (p.noTrainee.length) {
    L.push('NO SUCH TRAINEE  (' + p.noTrainee.length + ')');
    p.noTrainee.forEach(function (r) {
      L.push('  ' + r.trainee + (r.why ? '   ' + r.why : ''));
    });
    L.push('  The name has to match ' + PORTAL.TAB.MASTER + ' exactly.');
    L.push('');
  }
  if (p.noFto.length) {
    L.push('NOT ON THE ACTIVE ROSTER  (' + p.noFto.length + ')');
    p.noFto.forEach(function (r) { L.push('  ' + r.fto + '   for ' + r.trainee); });
    L.push('  Assigning somebody the roster does not have is how a trainee ends');
    L.push('  up on nobody\'s list, which is what this exists to prevent. If they');
    L.push('  are new, set ' + PORTAL_ADD_FTO_PROPERTY + ' and run addFto first.');
    L.push('');
  }
  if (p.twoRows.length) {
    L.push('MORE THAN ONE ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      L.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
    L.push('');
  }
  return L;
}

/** Rebuilds the dropdown from the roster, then writes the assignments. */
function assignFto() {
  var p = assignPlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['WHO TRAINS WHOM', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  // First, so the sheet will actually accept the names about to be written.
  var d = rebuildFtoDropdownV1_();
  if (d.ok) {
    L.push('The ASSIGNED FTO dropdown was rebuilt from the roster first: ' +
           d.names.length + ' name(s).');
    L.push('');
  } else if (p.set.length) {
    L.push('Could not rebuild the ASSIGNED FTO dropdown (' + d.why + '), so the');
    L.push('sheet may refuse a name it should accept. Anything refused is');
    L.push('reported below and nothing is left half-written.');
    L.push('');
  }

  if (!p.set.length) {
    L.push('Nothing was changed.');
    L.push('');
    assignBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var c = assignColumnV1_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = [], refused = [];

  p.set.forEach(function (s) {
    try {
      c.sheet.getRange(s.row, c.col).setValue(s.fto);
    } catch (e) {
      refused.push({ s: s, why: validationReasonV1_(c.sheet, s.row, c.col) });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.MASTER, s.row, c.header, s.trainee,
                   s.was, s.fto, whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    written.push(s);
  });

  writeAssignManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(written.length + ' assignment(s) written.');
  L.push('');
  assignBodyV1_({ set: written, same: p.same, noTrainee: p.noTrainee, noFto: p.noFto,
                  twoRows: p.twoRows, header: p.header }, L, true);

  if (refused.length) {
    L.push('THE SHEET REFUSED  (' + refused.length + ')');
    refused.forEach(function (r) {
      L.push('  ' + r.s.trainee + '   ' + r.why);
    });
    L.push('  Those trainees stay where they were, and the Division screen still');
    L.push('  shows them under "On nobody\'s list" if that is where they were.');
    L.push('');
  }

  if (written.length) {
    L.push('Those trainees now appear on their officer\'s screen. Run START to');
    L.push('check nothing is left over.');
    L.push('');
    L.push('To reverse it: undoAssign()');
  }
  return noteV1_(L.join('\n'));
}

function writeAssignManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ASSIGN_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ASSIGN_LOG);
    sh.getRange(1, 1).setValue(
      'Assignments the portal wrote. Do not edit or sort.').setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'TRAINEE', 'WAS', 'NOW', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Puts the last run's assignments back to what they were. */
function undoAssign() {
  var t = readTabV1_(PORTAL_ASSIGN_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('This portal has written no assignments.');
  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { row: Number(r[t.col['ROW']]), trainee: String(r[t.col['TRAINEE']] || ''),
               was: String(r[t.col['WAS']] || ''), now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nothing for the last run.');

  var c = assignColumnV1_();
  if (!c) return noteV1_(PORTAL.TAB.MASTER + ' has no ASSIGNED FTO column.');

  var put = [], left = [];
  entries.forEach(function (e) {
    var now = String(c.sheet.getRange(e.row, c.col).getValue() || '').trim();
    if (normNameV1_(now) !== normNameV1_(e.now)) {
      left.push({ e: e, found: now || '(empty)' });
      return;
    }
    try { c.sheet.getRange(e.row, c.col).setValue(e.was); }
    catch (err) {
      // Putting back what was there can itself be refused: the old value may
      // be a name the rebuilt dropdown no longer offers, which is often the
      // whole reason it was changed.
      left.push({ e: e, found: 'the sheet refused "' + e.was + '" - it is not in the dropdown' });
      return;
    }
    put.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['ASSIGNMENTS REVERSED', '',
    put.length + ' put back to what they were on ' + last, ''];
  put.forEach(function (e) {
    L.push('  ' + e.trainee + '   ->   ' + (e.was || '(blank)'));
  });
  if (left.length) {
    L.push('');
    L.push('LEFT ALONE  (' + left.length + ')');
    left.forEach(function (l) { L.push('  ' + l.e.trainee + '   ' + l.found); });
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function WHO_TRAINS_WHOM() { return assignFto(); }
function FIX_THE_FTO_DROPDOWN() { return fixFtoDropdown(); }


/* ======================================================================
 * 95_Unprocessed.gs
 * ====================================================================== */

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


/* ======================================================================
 * 96_Roster.gs
 * ====================================================================== */

/**
 * Putting addresses on the roster.
 *
 * An address in the roster's EMAIL column is what lets the portal recognise
 * someone. Put the wrong one there and that person opens another person's
 * trainees. So the care here goes into being RIGHT, not into asking again.
 *
 * There is no confirmation code. This write only ever fills a cell that is
 * empty, matches people by name rather than row order, and can be undone
 * exactly. A handshake on top of that buys nothing and costs a person their
 * evening.
 *
 * So it works by NAME, not by row order. Pasting a column of addresses into a
 * sorted sheet is how they end up one row out, and one row out here means one
 * person seeing another's record with nothing to show anything went wrong.
 *
 * Three rules:
 *
 *   1. It never overwrites. A row that already has an address is skipped and
 *      reported. Changing one is a decision, and a decision is not a batch job.
 *   2. It refuses unless it can find exactly one roster row for a name. No row,
 *      or two rows, and that line is reported and left alone.
 *   3. It re-reads every cell immediately before writing it, so a cell that
 *      stopped being empty since the plan was built is left as it is.
 *
 * undoRosterEmails() blanks precisely the cells it filled, and only if each one
 * still holds what it put there.
 */

var PORTAL_ROSTER_EMAILS_PROPERTY = 'PORTAL_ROSTER_EMAILS';
var PORTAL_ROSTER_LOG = 'PORTAL ROSTER LOG';

/** The name-and-address pairs pasted into the property.
 *
 *  "Dana Whitlock, dana@example.org", one per line - EXCEPT that the Apps
 *  Script property editor is a single-line field and quietly turns a pasted
 *  block into one long line. So this does not depend on line breaks at all.
 *
 *  It walks the whole value word by word. When it reaches an address, the
 *  name is whatever words came since the last one. That reads the same
 *  whether the newlines survived or not, and it is why the name has to come
 *  BEFORE the address on each line. */
function nameEmailPairsV1_(raw) {
  var text = String(raw == null ? '' : raw);
  var isEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
  var words = text.replace(/[,;<>()"'|]+/g, ' ').split(/\s+/).filter(Boolean);

  var out = [], pending = [];
  words.forEach(function (w) {
    var bare = w.replace(/[.,;]+$/, '');
    if (isEmail.test(bare)) {
      // a lone letter between the name and the address is a shift or a
      // column marker, not a middle initial anyone would want kept
      var name = pending.filter(function (x) { return x.length > 1; }).join(' ');
      pending = [];
      if (name) out.push({ name: name, email: bare.toLowerCase() });
      return;
    }
    pending.push(w);
  });
  return out;
}

function rosterEmailLinesV1_() {
  return nameEmailPairsV1_(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ROSTER_EMAILS_PROPERTY));
}

/** What would change on the roster. Reads; writes nothing. */
function rosterEmailPlanV1_() {
  var plan = { set: [], hasOne: [], notFound: [], twoRows: [], twoLines: [],
               retired: [], problem: '', emailCol: '', nameCol: '', activeCol: '' };

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  var emailCol = '', nameCol = '';
  ['EMAIL', 'FTO EMAIL', 'WORK EMAIL'].forEach(function (h) {
    if (!emailCol && t.col[h] !== undefined) emailCol = h; });
  ['FTO NAME', 'FTO', 'NAME', 'TRAINING OFFICER'].forEach(function (h) {
    if (!nameCol && t.col[h] !== undefined) nameCol = h; });
  if (!nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }
  if (!emailCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no EMAIL column to write into.'; return plan; }
  var activeCol = '';
  ROSTER_ACTIVE_HEADERS_V1.forEach(function (h) {
    if (!activeCol && t.col[h] !== undefined) activeCol = h; });
  plan.emailCol = emailCol; plan.nameCol = nameCol; plan.activeCol = activeCol;

  var lines = rosterEmailLinesV1_();
  if (!lines.length) {
    plan.problem = 'No name-and-address pairs are in ' + PORTAL_ROSTER_EMAILS_PROPERTY +
      '.\n\nOne per person, the NAME first and then the address:\n' +
      '  Dana Whitlock, dana@example.org\n\n' +
      'Line breaks are welcome but not needed - the property editor drops them\n' +
      'and this reads it either way. The name must come before the address.';
    return plan;
  }

  // two lines naming the same person is a question, not a merge
  var seenName = {};
  lines.forEach(function (l) {
    var k = normNameV1_(l.name);
    (seenName[k] = seenName[k] || []).push(l);
  });

  Object.keys(seenName).forEach(function (k) {
    var group = seenName[k];
    var name = group[0].name;

    if (group.length > 1) {
      plan.twoLines.push({ name: name,
        emails: group.map(function (g) { return g.email; }) });
      return;
    }
    var email = group[0].email;

    var matches = [];
    t.rows.forEach(function (r, i) {
      var rn = String(r[t.col[nameCol]] || '').trim();
      if (rn && normNameV1_(rn) === k) {
        matches.push({ row: realRowV1_(t, i), index: i, name: rn,
                       current: String(r[t.col[emailCol]] || '').trim() });
      }
    });

    if (!matches.length) { plan.notFound.push({ name: name, email: email }); return; }
    if (matches.length > 1) {
      plan.twoRows.push({ name: name, email: email,
        rows: matches.map(function (m) { return m.row; }) });
      return;
    }
    var m = matches[0];
    if (!rosterActiveV1_(t.rows[m.index][t.col[activeCol]])) {
      // Writing a sign-in address for somebody who has left is the opposite
      // of what this is for.
      plan.retired.push({ name: m.name, row: m.row, email: email });
      return;
    }
    if (m.row < 0) {
      plan.notFound.push({ name: name, email: email,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (m.current) {
      plan.hasOne.push({ name: m.name, row: m.row, current: m.current, offered: email,
                         same: m.current.toLowerCase() === email });
      return;
    }
    plan.set.push({ name: m.name, row: m.row, email: email });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture, and the code that authorises it. Writes nothing. */
function rosterEmailsBeforeAndAfter() {
  var p = rosterEmailPlanV1_();
  var lines = ['ROSTER ADDRESSES, BEFORE AND AFTER  (nothing has been written)', '',
    'In : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];

  if (p.problem) { lines.push(p.problem); return noteV1_(lines.join('\n')); }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var blank = 0;
  t.rows.forEach(function (r) {
    var nm = String(r[t.col[p.nameCol]] || '').trim();
    var em = String(r[t.col[p.emailCol]] || '').trim();
    if (nm && !em) blank++;
  });

  lines.push('BEFORE');
  lines.push('  ' + t.rows.length + ' on the roster, ' + blank + ' with no address');
  lines.push('');
  lines.push('WOULD BE FILLED IN  (' + p.set.length + ')');
  p.set.forEach(function (s) {
    lines.push('  row ' + s.row + '   ' + s.name);
    lines.push('             ' + s.email);
  });

  if (p.hasOne.length) {
    lines.push('');
    lines.push('LEFT ALONE, they already have one  (' + p.hasOne.length + ')');
    p.hasOne.forEach(function (h) {
      lines.push('  ' + h.name + '   ' + h.current +
        (h.same ? '   same as offered' : '   OFFERED ' + h.offered + ' INSTEAD'));
    });
    if (p.hasOne.some(function (h) { return !h.same; })) {
      lines.push('  Nothing is overwritten. Changing an address means changing who');
      lines.push('  can open a record, so do those one at a time, by hand.');
    }
  }
  if (p.notFound.length) {
    lines.push('');
    lines.push('NOT ON THE ROSTER  (' + p.notFound.length + ')');
    p.notFound.forEach(function (n) {
      lines.push('  ' + n.name + '   ' + n.email + (n.why ? '   ' + n.why : ''));
    });
  }
  if (p.retired.length) {
    lines.push('');
    lines.push('NO LONGER HERE, so no address goes in  (' + p.retired.length + ')');
    p.retired.forEach(function (r) {
      lines.push('  ' + r.name + '   row ' + r.row + '   ' + r.email);
    });
    lines.push('  Their ' + (p.activeCol || 'ACTIVE') + ' column says they have left.');
  }
  if (p.twoRows.length) {
    lines.push('');
    lines.push('MORE THAN ONE ROSTER ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      lines.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
  }
  if (p.twoLines.length) {
    lines.push('');
    lines.push('TWO LINES NAME THE SAME PERSON  (' + p.twoLines.length + ')');
    p.twoLines.forEach(function (d) {
      lines.push('  ' + d.name + '   ' + d.emails.join(', ') + '   left alone');
    });
  }

  lines.push('');
  lines.push('AFTER');
  lines.push('  ' + (blank - p.set.length) + ' would still have no address');
  lines.push('  no existing address would be changed or removed');
  lines.push('');
  lines.push('=======================================================');
  if (!p.set.length) {
    lines.push('There is nothing to fill in.');
    return noteV1_(lines.join('\n'));
  }
  lines.push('Run applyRosterEmails() to do it. There is nothing to set first.');
  lines.push('It fills only cells that are empty, matches by name, and');
  lines.push('undoRosterEmails() puts it back.');
  return noteV1_(lines.join('\n'));
}

/** A code for this exact set of rows and addresses. */
function rosterConfirmCodeV1_(plan) {
  var parts = [safeTargetIdV1_(), PORTAL.TAB.ROSTER];
  plan.set.forEach(function (s) { parts.push(s.row + '=' + s.email); });
  return shortCodeV1_(parts.join('|'));
}

/** Fills in the blank EMAIL cells. Refuses without the code for this plan. */
function applyRosterEmails() {
  var p = rosterEmailPlanV1_();
  if (p.problem) return noteV1_(p.problem);
  if (!p.set.length) {
    return noteV1_('Nothing to fill in. Every name on the list either already ' +
      'has an address on the roster or is not on it. Run ' +
      'rosterEmailsBeforeAndAfter() to see which.');
  }

  // No confirmation code. This one does not earn a handshake, and asking for
  // one made a two-minute job into an argument.
  //
  // What makes a write dangerous is being irreversible, or hitting something
  // that already had a value, or landing on the wrong row. None of those is
  // true here: it only ever fills a cell that is EMPTY, it matches by name so
  // a sorted roster cannot shift it, it re-reads every cell immediately
  // before writing, it logs each one, and undoRosterEmails puts it back.
  //
  // The bulk row-adding writers keep their code. Adding rows to an evidence
  // log is a different kind of act from filling in a blank column.
  var id = safeTargetIdV1_();
  var code = rosterConfirmCodeV1_(p);

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var col = t.col[p.emailCol] + 1;

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = 0, refused = [];

  p.set.forEach(function (s) {
    // read it again immediately before writing: the plan was built from a
    // cached read, and filling a cell that stopped being empty in between
    // would be an overwrite by accident
    var now = String(sh.getRange(s.row, col).getValue() || '').trim();
    if (now) { refused.push({ name: s.name, row: s.row, found: now }); return; }
    // One cell refusing is one address not written, not a reason to stop with
    // the ones already written recorded nowhere and no way to undo them.
    try {
      sh.getRange(s.row, col).setValue(s.email);
    } catch (e) {
      refused.push({ name: s.name, row: s.row,
        found: '(the sheet refused it: ' + String(e.message || e).slice(0, 120) + ')' });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.ROSTER, s.row, p.emailCol, s.email, s.name,
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION, code]);
    written++;
  });

  writeRosterManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['ROSTER ADDRESSES ADDED', '',
    'In     : ' + safeTargetNameV1_(),
    'Id     : ' + id,
    'When   : ' + stamp,
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), '',
    written + ' address(es) written into ' + PORTAL.TAB.ROSTER + ', column ' + p.emailCol, ''];
  manifest.forEach(function (m) { lines.push('  row ' + m[2] + '   ' + m[5] + '   ' + m[4]); });

  if (refused.length) {
    lines.push('');
    lines.push('NOT WRITTEN, the cell was no longer empty  (' + refused.length + ')');
    refused.forEach(function (r) { lines.push('  row ' + r.row + '   ' + r.name + '   holds ' + r.found); });
  }

  lines.push('');
  lines.push('No address already on the roster was changed or removed.');
  lines.push('');
  lines.push('These people can now be recognised when they open the portal.');
  lines.push('Check one: ask someone on this list to open it and say what they see.');
  lines.push('');
  lines.push('To reverse it: undoRosterEmails().');
  return noteV1_(lines.join('\n'));
}

function writeRosterManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ROSTER_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ROSTER_LOG);
    sh.getRange(1, 1).setValue(
      'What the portal wrote into the roster. Do not edit or sort this tab.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'EMAIL', 'NAME', 'BY', 'VERSION', 'CODE']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Blanks exactly the cells the last run filled, and only if each still holds
 *  what was put there. One that has been edited since is left alone and
 *  reported, because someone changing it by hand outranks this. */
function undoRosterEmails() {
  // No code either. Undoing is the safe direction, and a person reaching for
  // it is usually in a hurry.
  var t = readTabV1_(PORTAL_ROSTER_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('This portal has not written anything into the roster.');
  }

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];

  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: String(r[t.col['COLUMN']] || ''), email: String(r[t.col['EMAIL']] || ''),
               name: String(r[t.col['NAME']] || '') };
    });
  if (!entries.length) return noteV1_('The log names no cells for the last run.');

  var book = targetBookV1_();
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var cleared = [], changed = [];
  entries.forEach(function (e) {
    var ci = ros.col[e.col.toUpperCase()];
    if (ci === undefined) { changed.push({ e: e, found: '(no such column)' }); return; }
    var sh = book.getSheetByName(e.tab);
    var now = String(sh.getRange(e.row, ci + 1).getValue() || '').trim();
    if (now.toLowerCase() !== e.email.toLowerCase()) {
      changed.push({ e: e, found: now || '(empty)' });
      return;
    }
    try { sh.getRange(e.row, ci + 1).setValue(''); }
    catch (err) { changed.push({ e: e, found: '(the sheet refused to clear it)' }); return; }
    cleared.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['ROSTER ADDRESSES REVERSED', '',
    cleared.length + ' cell(s) emptied, the ones written on ' + last, ''];
  cleared.forEach(function (e) { lines.push('  row ' + e.row + '   ' + e.name); });
  if (changed.length) {
    lines.push('');
    lines.push('LEFT ALONE, changed since it was written  (' + changed.length + ')');
    changed.forEach(function (c) {
      lines.push('  row ' + c.e.row + '   ' + c.e.name + '   now holds ' + c.found);
    });
    lines.push('  Somebody edited these by hand, and that outranks anything here.');
  }
  return noteV1_(lines.join('\n'));
}


/* ======================================================================
 * 97_Rename.gs
 * ====================================================================== */

/**
 * Someone changed their name.
 *
 * It happens, and in this system it is not a one-cell edit. A training
 * officer's name is written into the roster, into every trainee's ASSIGNED
 * FTO, into every evaluation, every skill logged, every sign-off. Change one
 * of them and the rest stop matching: her trainees quietly drop off her list,
 * because the portal pairs them to her by name.
 *
 * So this changes them together, or not at all.
 *
 * What it will do:
 *   Replace a cell whose whole value IS that person's name.
 *
 * What it will not do:
 *   Touch a cell that merely contains the name inside a longer piece of text.
 *   A narrative that mentions someone is a record of what was written, and
 *   nobody asked for their evaluations to be rewritten.
 *
 *   Touch a form-response tab. That is the archive of what a person actually
 *   typed and submitted. It is reported and left exactly as it is.
 *
 *   Touch the logs. Same reason.
 *
 * undoRename() puts every cell back, and only where it still holds what was
 * written into it.
 */

var PORTAL_RENAME_PROPERTY = 'PORTAL_RENAME';
var PORTAL_RENAME_LOG = 'PORTAL RENAME LOG';

/** The renames asked for. "Harley Pack -> Harley Simms", and if there is more
 *  than one, a semicolon between them. The arrow may be -> or to. */
function renamePairsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_RENAME_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var m = String(piece).split(/\s*(?:->|=>|-->)\s*/);
    if (m.length !== 2) return;
    var from = m[0].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    var to   = m[1].replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!from || !to || normNameV1_(from) === normNameV1_(to)) return;
    out.push({ from: from, to: to });
  });
  return out;
}

/** Tabs a rename may change. Not the logs, and not a form-response tab. */
function renameableTabsV1_() {
  var skip = [PORTAL.TAB.AUDIT, PORTAL_BACKFILL_LOG, PORTAL_ROSTER_LOG, PORTAL_RENAME_LOG];
  var tabs = Object.keys(PORTAL.TAB).map(function (k) { return PORTAL.TAB[k]; })
    .filter(function (n) { return skip.indexOf(n) < 0; });
  // Settlements are judgments keyed by trainee name — they must follow a rename
  // or Settle raises settled pairs again under the new spelling.
  if (typeof PORTAL_SETTLEMENTS_TAB === 'string' && tabs.indexOf(PORTAL_SETTLEMENTS_TAB) < 0) {
    tabs.push(PORTAL_SETTLEMENTS_TAB);
  }
  return tabs;
}

/** Every cell that would change, and every mention that would not. Reads. */
function renamePlanV1_() {
  var plan = { pairs: renamePairsV1_(), cells: [], mentions: [], responses: [], problem: '' };
  if (!plan.pairs.length) {
    plan.problem = 'Nothing is in ' + PORTAL_RENAME_PROPERTY + '.\n\n' +
      'Put the old name, an arrow, and the new one:\n' +
      '  Harley Pack -> Harley Simms\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  renameableTabsV1_().forEach(function (tabName) {
    var t = readTabV1_(tabName);
    if (!t.ok) return;
    t.rows.forEach(function (r, i) {
      var row = realRowV1_(t, i);
      t.headers.forEach(function (h, ci) {
        var v = r[ci];
        if (v === '' || v === null || v === undefined) return;
        if (v instanceof Date) return;
        var s = String(v);
        plan.pairs.forEach(function (pair) {
          if (normNameV1_(s) === normNameV1_(pair.from)) {
            if (row < 0) return;                      // a row from another book
            plan.cells.push({ tab: tabName, row: row, col: ci + 1,
              header: h || ('column ' + (ci + 1)), was: s, now: pair.to });
          } else if (s.length > pair.from.length &&
                     s.toLowerCase().indexOf(pair.from.toLowerCase()) >= 0) {
            plan.mentions.push({ tab: tabName, row: row, header: h || ('column ' + (ci + 1)),
              text: s.length > 90 ? s.slice(0, 90) + '...' : s });
          }
        });
      });
    });
  });

  try {
    formResponseTabsV1_().forEach(function (t) {
      t.rows.forEach(function (r) {
        r.forEach(function (v) {
          if (v === '' || v === null || v === undefined || v instanceof Date) return;
          plan.pairs.forEach(function (pair) {
            if (normNameV1_(String(v)) === normNameV1_(pair.from)) {
              plan.responses.push({ tab: t.name, was: String(v) });
            }
          });
        });
      });
    });
  } catch (e) {}

  plan.cells.sort(renameOrderV1_);
  return plan;
}

/** The order the cells must be written in, which is not alphabetical.
 *
 *  The ASSIGNED FTO column on the trainee master is a dropdown, and its list
 *  of allowed names comes from the roster. Write the master first and Google
 *  rejects the new name outright, because at that instant the roster has
 *  never heard of her: "the data you entered violates the data validation
 *  rules set on this cell".
 *
 *  The tabs are numbered, so sorting by name put "01 TRAINEE MASTER" first
 *  and "22 FTO ROSTER" last - exactly the wrong way round. The roster is
 *  where a name is defined; everything else refers to it, so the roster goes
 *  first and the rest follow it. */
function renameOrderV1_(a, b) {
  var ra = a.tab === PORTAL.TAB.ROSTER ? 0 : 1;
  var rb = b.tab === PORTAL.TAB.ROSTER ? 0 : 1;
  if (ra !== rb) return ra - rb;
  if (a.tab !== b.tab) return a.tab < b.tab ? -1 : 1;
  return a.row - b.row;
}

/** Why a cell might have refused a perfectly good name.
 *
 *  A dropdown built from a range can be satisfied by fixing the range. A
 *  dropdown built from a typed-out list cannot, and needs a person. Saying
 *  which is the difference between a fixable problem and a mystery. */
function validationReasonV1_(sh, row, col) {
  try {
    var rule = sh.getRange(row, col).getDataValidation();
    if (!rule) return 'the sheet refused the value, and there is no dropdown on that cell';
    var type = String(rule.getCriteriaType());
    var vals = rule.getCriteriaValues() || [];
    if (type === 'VALUE_IN_RANGE' && vals[0] && vals[0].getA1Notation) {
      return 'that cell is a dropdown fed by ' + vals[0].getA1Notation() +
             ', and the new name is not in it yet';
    }
    if (type === 'VALUE_IN_LIST') {
      return 'that cell is a dropdown with a typed-out list of names. Add the ' +
             'new name to it (Data > Data validation) and run this again';
    }
    return 'a data validation rule on that cell (' + type + ') refused the value';
  } catch (e) {
    return 'the sheet refused the value';
  }
}

/** Changes the name everywhere it stands alone. One step. Undoable. */
function applyRename() {
  var p = renamePlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = [];
  function say(s) { L.push(s === undefined ? '' : s); }

  say('NAME CHANGED');
  say();
  p.pairs.forEach(function (pair) { say('  ' + pair.from + '   ->   ' + pair.to); });
  say();
  say('In : ' + safeTargetNameV1_());
  say();

  if (!p.cells.length) {
    say('Nothing in this spreadsheet holds that name on its own, so nothing');
    say('was changed. Check the spelling against the roster.');
    return noteV1_(L.join('\n'));
  }

  var book = targetBookV1_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], done = 0, skipped = [], byTab = {};

  // One cell refusing must not abandon the run halfway with the ones already
  // changed written down nowhere. That is what happened the first time this
  // met a dropdown: it threw on the third cell, the manifest is written after
  // the loop, so two cells had been changed and undoRename had no record of
  // either. A half-applied rename that cannot be reversed is worse than one
  // that fails outright. So every cell is attempted, every refusal is
  // reported, and what did go in is always recorded.
  var refused = [];

  p.cells.forEach(function (c) {
    var sh = book.getSheetByName(c.tab);
    if (!sh) { skipped.push({ c: c, why: 'that tab is not here any more' }); return; }
    // read it again: the plan came from a cached read
    var now;
    try { now = String(sh.getRange(c.row, c.col).getValue() || ''); }
    catch (e) { refused.push({ c: c, why: 'that cell could not be read' }); return; }
    if (normNameV1_(now) !== normNameV1_(c.was)) {
      skipped.push({ c: c, why: 'it now holds "' + now + '"' });
      return;
    }
    try {
      sh.getRange(c.row, c.col).setValue(c.now);
    } catch (e) {
      refused.push({ c: c, why: validationReasonV1_(sh, c.row, c.col) });
      return;
    }
    manifest.push([stamp, c.tab, c.row, c.col, c.header, c.was, c.now,
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    byTab[c.tab] = (byTab[c.tab] || 0) + 1;
    done++;
  });

  // Always, even when something refused. Especially when something refused.
  writeRenameManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  say(done + ' cell(s) changed:');
  Object.keys(byTab).forEach(function (t) { say('  ' + byTab[t] + '   ' + t); });

  if (refused.length) {
    say();
    say('THE SHEET REFUSED  (' + refused.length + ')');
    refused.forEach(function (r) {
      say('  ' + r.c.tab + ' row ' + r.c.row + ', ' + labelForV1_(r.c.header));
      say('      ' + r.why);
    });
    say();
    say('  Those cells still say "' + p.pairs[0].from + '". The rest of the change');
    say('  DID go in and is recorded, so undoRename() will reverse exactly what');
    say('  was written and nothing else.');
    say();
    say('  This leaves the name inconsistent, which is the thing this function');
    say('  exists to prevent. Either fix the dropdown and run applyRename()');
    say('  again, or run undoRename() and put it all back until you can.');
  }

  if (skipped.length) {
    say();
    say('LEFT ALONE  (' + skipped.length + ')');
    skipped.forEach(function (s) { say('  ' + s.c.tab + ' row ' + s.c.row + '   ' + s.why); });
  }

  if (p.mentions.length) {
    say();
    say('MENTIONED INSIDE SOMETHING WRITTEN, and not touched  (' + p.mentions.length + ')');
    p.mentions.slice(0, 12).forEach(function (m) {
      say('  ' + m.tab + ' row ' + m.row + ', ' + labelForV1_(m.header));
      say('      ' + m.text);
    });
    if (p.mentions.length > 12) say('  ... and ' + (p.mentions.length - 12) + ' more');
    say('  Somebody wrote those. Rewriting an evaluation is not a rename.');
  }

  if (p.responses.length) {
    say();
    say('IN THE FORM RESPONSES, and not touched  (' + p.responses.length + ')');
    say('  That is the record of what people actually typed and submitted.');
  }

  say();
  rebuiltNoteV1_(L);
  refreshDropdownsNoteV1_(L);
  say();
  say('The portal matches trainees to their training officer by name, so this');
  say('had to change everywhere at once or her trainees would have dropped off');
  say('her list. Run START to check nothing is left over.');
  say();
  say('To put it back: undoRename()');
  return noteV1_(L.join('\n'));
}

function writeRenameManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_RENAME_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RENAME_LOG);
    sh.getRange(1, 1).setValue('Every cell the portal changed in a rename. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'COL', 'HEADER', 'WAS', 'NOW', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Puts every cell back, where it still holds what the rename wrote. */
function undoRename() {
  var t = readTabV1_(PORTAL_RENAME_LOG);
  if (!t.ok || !t.rows.length) return noteV1_('No rename has been run against this spreadsheet.');

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: Number(r[t.col['COL']]), was: String(r[t.col['WAS']] || ''),
               now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names no cells for the last rename.');

  // Putting it back needs the same order that putting it in did, and for the
  // same reason: the old name has to be on the roster again before the
  // dropdown will accept it anywhere else. So the roster goes first, the
  // dropdown is rebuilt from it, and everything that refers to it follows.
  entries.sort(function (a, b) {
    var ra = a.tab === PORTAL.TAB.ROSTER ? 0 : 1;
    var rb = b.tab === PORTAL.TAB.ROSTER ? 0 : 1;
    return ra !== rb ? ra - rb : a.row - b.row;
  });

  var book = targetBookV1_(), put = 0, left = [], rebuilt = false;
  entries.forEach(function (e) {
    if (!rebuilt && e.tab !== PORTAL.TAB.ROSTER) {
      // every roster cell that was going back has gone back by now
      forgetTabsV1_(); PEOPLE_CACHE_V1 = null;
      try { rebuildFtoDropdownV1_(); } catch (err) {}
      rebuilt = true;
    }
    var sh = book.getSheetByName(e.tab);
    if (!sh) { left.push({ e: e, found: '(tab gone)' }); return; }
    var now;
    try { now = String(sh.getRange(e.row, e.col).getValue() || ''); }
    catch (err) { left.push({ e: e, found: '(could not read it)' }); return; }
    if (normNameV1_(now) !== normNameV1_(e.now)) { left.push({ e: e, found: now || '(empty)' }); return; }
    // A refusal here is the dropdown, not a person, and it must not abandon
    // the run: an undo that stops halfway is worse than the state it is undoing.
    try { sh.getRange(e.row, e.col).setValue(e.was); }
    catch (err) {
      left.push({ e: e, found: 'the sheet refused "' + e.was + '" - ' +
        validationReasonV1_(sh, e.row, e.col) });
      return;
    }
    put++;
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var lines = ['RENAME REVERSED', '', put + ' cell(s) put back to what they were on ' + last, ''];
  if (left.length) {
    lines.push('LEFT ALONE  (' + left.length + ')');
    left.forEach(function (l) {
      lines.push('  ' + l.e.tab + ' row ' + l.e.row + '   ' + l.found);
    });
    lines.push('  A cell somebody edited by hand outranks this. A cell the sheet');
    lines.push('  refused is a dropdown that no longer offers the old name.');
  }
  return noteV1_(lines.join('\n'));
}

/** Named for the job. */
function FIX_A_NAME() { return applyRename(); }
function UNDO_A_NAME() { return undoRename(); }


/* ======================================================================
 * 98_Retire.gs
 * ====================================================================== */

/**
 * Somebody left.
 *
 * A resignation is not a deletion. Everything that person did is still true:
 * the shifts they evaluated happened, the skills they signed off are signed
 * off, and the trainee whose Phase 1 they supervised was supervised by them.
 * Removing the row would not remove any of that - it would only remove the
 * one place that says who the name belongs to, and leave every record that
 * names them pointing at nobody.
 *
 * So this does not delete. It writes N in the ACTIVE column, which is what
 * that column is for, and from then on the rest of the portal reads it:
 *
 *   they cannot sign in, so a former employee is not opening personnel
 *   records
 *   they are not counted among the people who still need an address
 *   they are not offered as somebody to assign a trainee to
 *   their history stays exactly where it is, under their own name
 *
 * The one thing a resignation actually breaks is their trainees. An active
 * trainee whose ASSIGNED FTO has left appears on nobody's list, and nothing
 * looks wrong - the assignment is a perfectly valid name. This names them,
 * every time, and refuses to pretend that reassigning them is a decision it
 * can make.
 *
 * unretireFto() puts the column back to whatever it held before.
 */

var PORTAL_RETIRE_PROPERTY = 'PORTAL_RETIRE';
var PORTAL_RETIRE_LOG = 'PORTAL RETIRE LOG';

/** Who to retire. One name per entry; a semicolon between them.
 *
 *  A reason can follow a colon - "Alex White : resigned 2026-08-16" - and it
 *  is recorded, never guessed at. The property editor is a single-line field
 *  that eats pasted line breaks, so semicolons are the reliable separator and
 *  line breaks are accepted as well. */
function retireRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_RETIRE_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var text = String(piece).replace(/\s+/g, ' ').trim();
    if (!text) return;
    var reason = '';
    var at = text.indexOf(':');
    if (at > 0) { reason = text.slice(at + 1).trim(); text = text.slice(0, at).trim(); }
    var name = text.replace(/[,|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return;
    out.push({ name: name, reason: reason });
  });
  return out;
}

/** What is still attached to a name, so retiring is never a silent goodbye. */
function whatIsAttachedV1_(name) {
  var n = normNameV1_(name);
  var out = { activeTrainees: [], closedTrainees: [], rows: {} };

  try {
    traineesV1_().forEach(function (t) {
      if (normNameV1_(t.fto) !== n) return;
      (t.closed ? out.closedTrainees : out.activeTrainees).push(t.name);
    });
  } catch (e) {}

  // Anywhere their name stands in a column that means "who did this".
  [PORTAL.TAB.EVAL, PORTAL.TAB.EVIDENCE, PORTAL.TAB.SIGNOFF,
   PORTAL.TAB.URGENT, PORTAL.TAB.SKILLS].forEach(function (tabName) {
    var t;
    try { t = readTabAllV1_(tabName); } catch (e) { return; }
    if (!t || !t.ok) return;
    var count = 0;
    t.rows.forEach(function (r) {
      var who = pickV1_(t, r, ['FTO', 'FTO NAME', 'EVALUATOR', 'SIGNED OFF BY',
                               'SUBMITTED BY', 'YOUR NAME', 'VALIDATED BY']);
      if (who && normNameV1_(who) === n) count++;
    });
    if (count) out.rows[tabName] = count;
  });
  return out;
}

/** Every cell that would change. Reads; writes nothing. */
function retirePlanV1_() {
  var plan = { requests: retireRequestsV1_(), set: [], already: [], notFound: [],
               twoRows: [], problem: '', activeCol: '', nameCol: '' };

  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_RETIRE_PROPERTY + '.\n\n' +
      'Put the name exactly as it stands on the roster:\n' +
      '  Alex White\n\n' +
      'A reason after a colon is recorded:\n' +
      '  Alex White : resigned 2026-08-16\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  var nameCol = '', activeCol = '';
  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (!nameCol && t.col[h] !== undefined) nameCol = h; });
  ROSTER_ACTIVE_HEADERS_V1.forEach(function (h) {
    if (!activeCol && t.col[h] !== undefined) activeCol = h; });
  if (!nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }
  if (!activeCol) {
    plan.problem = PORTAL.TAB.ROSTER + ' has no ACTIVE column.\n\n' +
      'That column is the whole mechanism: it is what the rest of the portal\n' +
      'reads to know somebody has left. Add a column headed ACTIVE on row ' +
      PORTAL.HEADER_ROW + '\nand run this again. Nothing was changed.';
    return plan;
  }
  plan.nameCol = nameCol; plan.activeCol = activeCol;

  plan.requests.forEach(function (req) {
    var k = normNameV1_(req.name);

    // Whole name, never a fragment. This roster has an Alex White and a
    // Julieann White on it, and "White" matching both is exactly the kind of
    // convenience that ends a career by accident.
    var matches = [];
    t.rows.forEach(function (r, i) {
      var rn = String(r[t.col[nameCol]] || '').trim();
      if (rn && normNameV1_(rn) === k) {
        matches.push({ row: realRowV1_(t, i), name: rn,
                       was: String(r[t.col[activeCol]] == null ? '' : r[t.col[activeCol]]).trim() });
      }
    });

    if (!matches.length) { plan.notFound.push(req); return; }
    if (matches.length > 1) {
      plan.twoRows.push({ name: req.name, rows: matches.map(function (m) { return m.row; }) });
      return;
    }
    var m = matches[0];
    if (m.row < 0) {
      plan.notFound.push({ name: req.name, reason: req.reason,
        why: 'that row is in another spreadsheet, not this one' });
      return;
    }
    if (!rosterActiveV1_(m.was)) {
      plan.already.push({ name: m.name, row: m.row, was: m.was || '(blank)' });
      return;
    }
    plan.set.push({ name: m.name, row: m.row, was: m.was, reason: req.reason,
                    attached: whatIsAttachedV1_(m.name) });
  });

  plan.set.sort(function (a, b) { return a.row - b.row; });
  return plan;
}

/** The before picture. Writes nothing. */
function retireBeforeAndAfter() {
  var p = retirePlanV1_();
  var L = ['RETIRING SOMEBODY OFF THE ROSTER  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  retireBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: retireFto()');
  return noteV1_(L.join('\n'));
}

/** The shared body of both reports. */
function retireBodyV1_(p, L, done) {
  p.set.forEach(function (s) {
    L.push((done ? 'RETIRED   ' : 'WOULD RETIRE   ') + s.name + '   row ' + s.row);
    L.push('  ' + p.activeCol + ' ' + (s.was ? '"' + s.was + '"' : '(blank)') + '  ->  N');
    if (s.reason) L.push('  Reason recorded: ' + s.reason);

    var a = s.attached;
    var kept = [];
    Object.keys(a.rows).forEach(function (tn) { kept.push(a.rows[tn] + ' in ' + tn); });
    if (a.closedTrainees.length) {
      kept.push(a.closedTrainees.length + ' closed trainee record(s): ' +
                a.closedTrainees.join(', '));
    }
    if (kept.length) {
      L.push('  Kept, untouched, under their own name:');
      kept.forEach(function (k) { L.push('    ' + k); });
    } else {
      L.push('  Nothing in this tracker is filed under their name.');
    }

    if (a.activeTrainees.length) {
      L.push('');
      L.push('  *** ' + a.activeTrainees.length + ' ACTIVE TRAINEE(S) ARE ASSIGNED TO THEM ***');
      a.activeTrainees.forEach(function (n) { L.push('      ' + n); });
      L.push('  Until the ASSIGNED FTO column on ' + PORTAL.TAB.MASTER + ' names');
      L.push('  somebody who is still here, those trainees appear on nobody\'s list');
      L.push('  and nothing looks wrong. Who takes them on is not a decision this');
      L.push('  can make. It has to be somebody\'s.');
    }
    L.push('');
  });

  if (p.already.length) {
    L.push('ALREADY MARKED AS GONE  (' + p.already.length + ')');
    p.already.forEach(function (a) {
      L.push('  ' + a.name + '   row ' + a.row + '   ' + p.activeCol + ' holds ' + a.was);
    });
    L.push('');
  }
  if (p.notFound.length) {
    L.push('NOT ON THE ROSTER  (' + p.notFound.length + ')');
    p.notFound.forEach(function (n) {
      L.push('  ' + n.name + (n.why ? '   ' + n.why : ''));
    });
    L.push('  The name has to match a roster row exactly. Check the spelling');
    L.push('  against ' + PORTAL.TAB.ROSTER + '.');
    L.push('');
  }
  if (p.twoRows.length) {
    L.push('MORE THAN ONE ROSTER ROW WITH THAT NAME  (' + p.twoRows.length + ')');
    p.twoRows.forEach(function (d) {
      L.push('  ' + d.name + '   rows ' + d.rows.join(', ') + '   left alone');
    });
    L.push('  Which one left is not something to guess at.');
    L.push('');
  }
  return L;
}

/** Marks them as no longer here. One step. Undoable. */
function retireFto() {
  var p = retirePlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['SOMEBODY HAS LEFT THE ROSTER', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  if (!p.set.length) {
    L.push('Nothing was changed.');
    L.push('');
    retireBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var nameIdx = t.col[p.nameCol], activeIdx = t.col[p.activeCol];
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], written = [], refused = [];

  p.set.forEach(function (s) {
    // Read both cells again. The plan came from a cached read, and the row
    // this is about to change is identified by a name that had better still
    // be in it.
    var nameNow = String(sh.getRange(s.row, nameIdx + 1).getValue() || '').trim();
    if (normNameV1_(nameNow) !== normNameV1_(s.name)) {
      refused.push({ s: s, why: 'that row now holds "' + (nameNow || '(empty)') + '"' });
      return;
    }
    var activeNow = String(sh.getRange(s.row, activeIdx + 1).getValue() || '').trim();
    if (!rosterActiveV1_(activeNow)) {
      refused.push({ s: s, why: p.activeCol + ' already holds "' + activeNow + '"' });
      return;
    }
    // The ACTIVE column is very often a Y/N dropdown. If it refuses, that is
    // this person not being retired - it is not a reason to abandon the rest
    // and leave the ones already done recorded nowhere.
    try {
      sh.getRange(s.row, activeIdx + 1).setValue('N');
    } catch (e) {
      refused.push({ s: s, why: 'the sheet refused it - ' +
        (p.activeCol + ' is probably a dropdown that does not offer N. ' +
         'Add N to it, or type it in yourself') });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.ROSTER, s.row, p.activeCol, s.name,
                   activeNow, 'N', s.reason || '',
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    written.push(s);
  });

  writeRetireManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(written.length + ' marked as no longer here.');
  L.push('');
  retireBodyV1_({ set: written, already: p.already, notFound: p.notFound,
                  twoRows: p.twoRows, activeCol: p.activeCol }, L, true);

  if (refused.length) {
    L.push('NOT CHANGED  (' + refused.length + ')');
    refused.forEach(function (r) { L.push('  row ' + r.s.row + '   ' + r.why); });
    L.push('  Somebody edited those, and that outranks this.');
    L.push('');
  }

  if (written.length) {
    rebuiltNoteV1_(L);
    var sync = null;
    try { sync = syncRegisteredFormChoicesV1_(); } catch (eSync) {}
    if (sync && sync.ok) {
      L.push('EXISTING FORMS UPDATED');
      L.push('  FTO name lists on ' + sync.forms + ' registered form(s) no longer offer');
      L.push('  the retired officer(s).');
      if (sync.notes && sync.notes.length) {
        sync.notes.forEach(function (n) { L.push('  · ' + n); });
      }
      L.push('');
    } else {
      refreshDropdownsNoteV1_(L);
    }
    L.push('');
    L.push('Nothing was deleted. Every row, every evaluation and every sign-off');
    L.push('is exactly where it was, under the name that earned it.');
    L.push('');
    L.push('Run START to see what is left over.');
    L.push('To put it back: unretireFto()');
  }
  return noteV1_(L.join('\n'));
}

function writeRetireManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_RETIRE_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_RETIRE_LOG);
    sh.getRange(1, 1).setValue(
      'Who the portal marked as no longer here, and when. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 10)
      .setValues([['RUN', 'TAB', 'ROW', 'COLUMN', 'NAME', 'WAS', 'NOW', 'REASON',
                   'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
}

/** Puts the ACTIVE column back to what it held, where nobody has touched it. */
function unretireFto() {
  var t = readTabV1_(PORTAL_RETIRE_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('Nobody has been retired off the roster by this portal.');
  }

  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { tab: String(r[t.col['TAB']] || ''), row: Number(r[t.col['ROW']]),
               col: String(r[t.col['COLUMN']] || ''), name: String(r[t.col['NAME']] || ''),
               was: String(r[t.col['WAS']] || ''), now: String(r[t.col['NOW']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nobody for the last run.');

  var book = targetBookV1_();
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var put = [], left = [];
  entries.forEach(function (e) {
    var ci = ros.col[e.col.toUpperCase()];
    var sh = book.getSheetByName(e.tab);
    if (ci === undefined || !sh) { left.push({ e: e, found: '(no such column)' }); return; }
    var now = String(sh.getRange(e.row, ci + 1).getValue() || '').trim();
    if (now.toUpperCase() !== String(e.now).toUpperCase()) {
      left.push({ e: e, found: now || '(empty)' });
      return;
    }
    try { sh.getRange(e.row, ci + 1).setValue(e.was); }
    catch (err) {
      left.push({ e: e, found: 'the sheet refused "' + (e.was || '(blank)') + '"' });
      return;
    }
    put.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['BACK ON THE ROSTER', '',
    put.length + ' put back to what they were on ' + last, ''];
  put.forEach(function (e) {
    L.push('  row ' + e.row + '   ' + e.name + '   ' + e.col + ' -> ' +
           (e.was || '(blank)'));
  });
  if (left.length) {
    L.push('');
    L.push('LEFT ALONE, changed since  (' + left.length + ')');
    left.forEach(function (l) {
      L.push('  row ' + l.e.row + '   ' + l.e.name + '   now holds ' + l.found);
    });
    L.push('  Somebody edited those by hand, and that outranks this.');
  }
  if (put.length) {
    L.push('');
    L.push('They can sign in again, and they are counted again.');
    try {
      var sync = syncRegisteredFormChoicesV1_();
      if (sync && sync.ok) {
        L.push('');
        L.push('Form FTO lists refreshed on ' + sync.forms + ' registered form(s).');
      }
    } catch (eSync) {}
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function SOMEBODY_LEFT() { return retireFto(); }
function UNDO_SOMEBODY_LEFT() { return unretireFto(); }


/* ======================================================================
 * 99_AddFto.gs
 * ====================================================================== */

/**
 * Somebody joined.
 *
 * This is the half that was missing. retireFto takes a training officer off
 * the roster and nothing ever put one on, which made "assign Chyna Gray to
 * Latavia" look like a one-cell edit when it is not one:
 *
 *   the ASSIGNED FTO column is a dropdown fed by the roster, so a name the
 *   roster has never heard of is rejected by the sheet outright
 *   the portal matches a trainee to their officer by name, so an assignment
 *   to somebody not on the roster puts that trainee on nobody's list
 *   an officer with no row has no EMAIL column, so they cannot sign in
 *
 * Adding a row is the only thing that fixes all three, and it has to happen
 * before the assignment, not after.
 *
 * What it does:
 *   Appends one row to the roster. Name, and whatever else you give it.
 *
 * What it will not do:
 *   Touch a row that is already there. Not one cell of one.
 *   Add a second row for somebody already on it - if they are on it and
 *   retired, it says to run unretireFto instead, because a returning
 *   employee getting a duplicate row is how a roster starts lying.
 *   Guess at what somebody is qualified to train. Those columns are left
 *   blank and named, for a person to fill in.
 *
 * undoAddFto() removes the rows it added, and only while they are still the
 * blank-slate rows it wrote.
 */

var PORTAL_ADD_FTO_PROPERTY = 'PORTAL_ADD_FTO';
var PORTAL_ADD_FTO_LOG = 'PORTAL ROSTER ADDITIONS';

/** Who to add.
 *
 *  "Chyna Gray, cgray@example.org, C, Advanced EMT" - and the parts after the
 *  name may come in any order, because remembering an order is one more thing
 *  to get wrong. A field with an @ is the address, a lone letter is the shift,
 *  and anything that reads like a certification is the level.
 *
 *  More than one? Put a semicolon between them. */
function addFtoRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ADD_FTO_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var parts = String(piece).split(/[,|\t]+/)
      .map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
    if (!parts.length) return;

    var req = { name: '', email: '', shift: '', level: '' };
    parts.forEach(function (v) {
      if (!req.email && v.indexOf('@') > 0 &&
          /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v)) {
        req.email = v.toLowerCase(); return;
      }
      if (!req.shift && /^[A-Da-d]$/.test(v)) { req.shift = v.toUpperCase(); return; }
      if (!req.level && /^(emt|aemt|advanced\s*emt|paramedic|emt\s*-?\s*[ipb])$/i.test(v)) {
        req.level = v; return;
      }
      if (!req.name) { req.name = v; return; }
    });
    if (!req.name) return;
    out.push(req);
  });
  return out;
}

/** What would be added, and what would not. Reads; writes nothing. */
function addFtoPlanV1_() {
  var plan = { add: [], already: [], retired: [], clash: [], problem: '',
               nameCol: '', emailCol: '', activeCol: '', blankCols: [] };

  plan.requests = addFtoRequestsV1_();
  if (!plan.requests.length) {
    plan.problem = 'Nothing is in ' + PORTAL_ADD_FTO_PROPERTY + '.\n\n' +
      'The name, then whatever else you have, in any order:\n' +
      '  Chyna Gray, cgray@example.org, C, Advanced EMT\n\n' +
      'The name on its own is enough to put them on the roster. Without an\n' +
      'address they cannot sign in, and it can be added later.\n\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var t = readTabV1_(PORTAL.TAB.ROSTER);
  if (!t.ok) { plan.problem = PORTAL.TAB.ROSTER + ' is not in this spreadsheet.'; return plan; }

  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (!plan.nameCol && t.col[h] !== undefined) plan.nameCol = h; });
  ROSTER_EMAIL_HEADERS_V1.forEach(function (h) {
    if (!plan.emailCol && t.col[h] !== undefined) plan.emailCol = h; });
  ROSTER_ACTIVE_HEADERS_V1.forEach(function (h) {
    if (!plan.activeCol && t.col[h] !== undefined) plan.activeCol = h; });
  if (!plan.nameCol) { plan.problem = PORTAL.TAB.ROSTER + ' has no name column.'; return plan; }

  var onRoster = rosterPeopleV1_();

  plan.requests.forEach(function (req) {
    var k = normNameV1_(req.name);

    var match = null;
    onRoster.forEach(function (p) { if (p.norm === k) match = p; });
    if (match) {
      // Somebody coming back gets their own row back, not a second one. Two
      // rows with one name is how the roster starts lying: every lookup that
      // matches by name then has to choose, and nothing says which is right.
      (match.active ? plan.already : plan.retired).push(match);
      return;
    }

    // An address already belonging to somebody else is an identity collision,
    // and identity here decides whose trainees you open.
    if (req.email) {
      var owner = null;
      onRoster.forEach(function (p) { if (p.email && p.email === req.email) owner = p; });
      if (owner) { plan.clash.push({ req: req, owner: owner }); return; }
    }

    plan.add.push(req);
  });

  // Columns this cannot responsibly fill in. Whether somebody is signed off
  // to train a paramedic is a qualification, not a default.
  t.headers.forEach(function (h) {
    if (!h) return;
    var up = String(h).toUpperCase();
    if (up === plan.nameCol || up === plan.emailCol || up === plan.activeCol) return;
    if (up === 'SHIFT' || up === 'CERT LEVEL' || up === 'LEVEL') return;
    plan.blankCols.push(h);
  });

  return plan;
}

/** The before picture. Writes nothing. */
function addFtoBeforeAndAfter() {
  var p = addFtoPlanV1_();
  var L = ['ADDING SOMEBODY TO THE ROSTER  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  addFtoBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: addFto()');
  return noteV1_(L.join('\n'));
}

function addFtoBodyV1_(p, L, done) {
  p.add.forEach(function (a) {
    L.push((done ? 'ADDED   ' : 'WOULD ADD   ') + a.name);
    L.push('  ' + p.nameCol + '   ' + a.name);
    if (p.emailCol) {
      L.push('  ' + p.emailCol + '   ' + (a.email || '(blank - they cannot sign in yet)'));
    }
    if (a.shift) L.push('  SHIFT   ' + a.shift);
    if (a.level) L.push('  CERT LEVEL   ' + a.level);
    if (p.activeCol) L.push('  ' + p.activeCol + '   Y');
    if (p.blankCols.length) {
      L.push('  Left blank for a person: ' + p.blankCols.join(', '));
      L.push('    What somebody is signed off to train is a qualification, not');
      L.push('    something to default.');
    }
    L.push('');
  });

  if (p.retired.length) {
    L.push('ALREADY ON THE ROSTER, MARKED AS GONE  (' + p.retired.length + ')');
    p.retired.forEach(function (r) {
      L.push('  ' + r.name + '   row ' + r.row + '   ' + p.activeCol + ' says ' +
             (r.activeRaw || '(blank)'));
    });
    L.push('  They already have a row and all their history is under it.');
    L.push('  Set ' + PORTAL_RETIRE_PROPERTY + ' aside and run unretireFto()');
    L.push('  instead. A second row for one person is how a roster starts lying:');
    L.push('  every lookup that matches by name then has to choose, and nothing');
    L.push('  says which is right.');
    L.push('');
  }
  if (p.already.length) {
    L.push('ALREADY ON THE ROSTER  (' + p.already.length + ')');
    p.already.forEach(function (a) {
      L.push('  ' + a.name + '   row ' + a.row +
             (a.email ? '   ' + a.email : '   no address yet'));
    });
    L.push('  Nothing to do. Nothing was changed.');
    L.push('');
  }
  if (p.clash.length) {
    L.push('THAT ADDRESS BELONGS TO SOMEBODY ELSE  (' + p.clash.length + ')');
    p.clash.forEach(function (c) {
      L.push('  ' + c.req.email + '   is ' + c.owner.name + ' on row ' + c.owner.row);
    });
    L.push('  An address is what the portal recognises somebody by, so two people');
    L.push('  sharing one means one of them opens the other\'s trainees. Not added.');
    L.push('');
  }
  return L;
}

/** Puts them on the roster. Appends; touches no existing row. */
function addFto() {
  var p = addFtoPlanV1_();
  if (p.problem) return noteV1_(p.problem);

  var L = ['SOMEBODY JOINED THE ROSTER', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || 'unidentified'), ''];

  if (!p.add.length) {
    L.push('Nothing was added.');
    L.push('');
    addFtoBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.ROSTER);
  var width = t.headers.length;
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var manifest = [], added = [], refused = [];

  p.add.forEach(function (a) {
    var row = new Array(width);
    for (var i = 0; i < width; i++) row[i] = '';
    row[t.col[p.nameCol]] = clean_(a.name);
    if (p.emailCol && a.email) row[t.col[p.emailCol]] = clean_(a.email);
    if (p.activeCol) row[t.col[p.activeCol]] = 'Y';
    if (a.shift && t.col['SHIFT'] !== undefined) row[t.col['SHIFT']] = clean_(a.shift);
    if (a.level) {
      var lc = t.col['CERT LEVEL'] !== undefined ? 'CERT LEVEL'
             : (t.col['LEVEL'] !== undefined ? 'LEVEL' : '');
      if (lc) row[t.col[lc]] = clean_(a.level);
    }

    // Appending puts the row at the bottom, below everything. Nothing already
    // on the roster is read, moved or overwritten to do it.
    var at = sh.getLastRow() + 1;
    try {
      sh.getRange(at, 1, 1, width).setValues([row]);
    } catch (e) {
      refused.push({ a: a, why: validationReasonV1_(sh, at, t.col[p.nameCol] + 1) });
      return;
    }
    manifest.push([stamp, PORTAL.TAB.ROSTER, at, a.name, a.email || '',
                   a.shift || '', a.level || '',
                   whoIsAskingV1_() || 'unidentified', PORTAL.VERSION]);
    a.row = at;
    added.push(a);
  });

  writeAddFtoManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(added.length + ' added to ' + PORTAL.TAB.ROSTER + '.');
  L.push('');
  addFtoBodyV1_({ add: added, already: p.already, retired: p.retired, clash: p.clash,
                  nameCol: p.nameCol, emailCol: p.emailCol, activeCol: p.activeCol,
                  blankCols: p.blankCols }, L, true);

  if (refused.length) {
    L.push('NOT ADDED  (' + refused.length + ')');
    refused.forEach(function (r) { L.push('  ' + r.a.name + '   ' + r.why); });
    L.push('');
  }

  if (added.length) {
    L.push('No row already on the roster was read, moved or changed.');
    L.push('');
    rebuiltNoteV1_(L);
    var sync = null;
    try { sync = syncRegisteredFormChoicesV1_(); } catch (eSync) {}
    if (sync && sync.ok) {
      L.push('EXISTING FORMS UPDATED');
      L.push('  FTO name dropdowns on ' + sync.forms + ' registered form(s) now include');
      L.push('  the new officer. Same forms already in service — nothing new created.');
      L.push('');
    } else {
      refreshDropdownsNoteV1_(L);
      L.push('');
    }
    L.push('NOW YOU CAN ASSIGN THEM');
    L.push('  The ASSIGNED FTO column on ' + PORTAL.TAB.MASTER + ' is a dropdown');
    L.push('  fed by this roster, which is why the name had to go here first.');
    L.push('  Their name is in that list now.');
    var noMail = added.filter(function (a) { return !a.email; });
    if (noMail.length) {
      L.push('');
      L.push('  ' + noMail.map(function (a) { return a.name; }).join(', ') +
             ' cannot sign in until an address is');
      L.push('  in the ' + (p.emailCol || 'EMAIL') + ' column. They can be assigned trainees ' +
             'either way.');
    }
    L.push('');
    L.push('To reverse it: undoAddFto()');
  }
  return noteV1_(L.join('\n'));
}

function writeAddFtoManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ADD_FTO_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ADD_FTO_LOG);
    sh.getRange(1, 1).setValue(
      'Rows the portal added to the roster. Do not edit or sort.').setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 9)
      .setValues([['RUN', 'TAB', 'ROW', 'NAME', 'EMAIL', 'SHIFT', 'LEVEL', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

/** Removes the rows the last run added, and only while they are untouched.
 *
 *  Deleting a roster row is the one destructive thing in this file, so it is
 *  fenced hard: the row must still hold that name, and it must still be the
 *  blank slate that was written. The moment somebody has put anything of
 *  their own in it - a note, a qualification, an employee number - it is
 *  theirs and it stays. */
function undoAddFto() {
  var t = readTabV1_(PORTAL_ADD_FTO_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('This portal has not added anybody to the roster.');
  }
  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return { row: Number(r[t.col['ROW']]), name: String(r[t.col['NAME']] || ''),
               email: String(r[t.col['EMAIL']] || '') };
    });
  if (!entries.length) return noteV1_('The log names nobody for the last run.');

  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL.TAB.ROSTER);
  if (!sh) return noteV1_(PORTAL.TAB.ROSTER + ' is not in this spreadsheet.');
  var ros = readTabV1_(PORTAL.TAB.ROSTER);
  var nameIdx = -1;
  ROSTER_NAME_HEADERS_V1.forEach(function (h) {
    if (nameIdx < 0 && ros.col[h] !== undefined) nameIdx = ros.col[h]; });

  // bottom-up, so removing one does not move the next
  entries.sort(function (a, b) { return b.row - a.row; });

  var removed = [], kept = [];
  entries.forEach(function (e) {
    var vals;
    try { vals = sh.getRange(e.row, 1, 1, Math.max(ros.headers.length, 1)).getValues()[0]; }
    catch (err) { kept.push({ e: e, why: 'that row is no longer there' }); return; }

    if (normNameV1_(vals[nameIdx]) !== normNameV1_(e.name)) {
      kept.push({ e: e, why: 'it now holds "' + (vals[nameIdx] || '(empty)') + '"' });
      return;
    }
    // anything beyond what was written is somebody's work
    var extra = [];
    vals.forEach(function (v, i) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return;
      if (i === nameIdx) return;
      if (s === 'Y' || s.toLowerCase() === String(e.email).toLowerCase()) return;
      if (ros.col['SHIFT'] === i || ros.col['CERT LEVEL'] === i || ros.col['LEVEL'] === i) return;
      extra.push(ros.headers[i] || ('column ' + (i + 1)));
    });
    if (extra.length) {
      kept.push({ e: e, why: 'somebody has filled in ' + extra.join(', ') });
      return;
    }
    sh.deleteRow(e.row);
    removed.push(e);
  });
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  var L = ['ROSTER ADDITIONS REVERSED', '',
    removed.length + ' row(s) removed, the ones added on ' + last, ''];
  removed.forEach(function (e) { L.push('  row ' + e.row + '   ' + e.name); });
  if (kept.length) {
    L.push('');
    L.push('KEPT  (' + kept.length + ')');
    kept.forEach(function (k) { L.push('  ' + k.e.name + '   ' + k.why); });
    L.push('  A row somebody has put their own work into is theirs, and stays.');
    L.push('  Delete it by hand if you are sure.');
  }
  return noteV1_(L.join('\n'));
}

/** Named for the job. */
function SOMEBODY_JOINED() { return addFto(); }
function UNDO_SOMEBODY_JOINING() { return undoAddFto(); }


/* ======================================================================
 * 99_AddTrainee.gs
 * ====================================================================== */

/**
 * Somebody started training.
 *
 * Until now a new trainee meant typing a name into 01 TRAINEE MASTER by hand
 * and hoping the nine Google Forms picked them up. That is how people end up
 * in Field Training but missing from the eval / skills dropdowns — and how an FTO
 * opens a form that silently refuses the name they just typed.
 *
 * What this does:
 *   Appends (or fills the first blank) one row on the trainee master.
 *   Rebuilds Trainee / FTO LIST choices on the registered forms so the
 *   forms already in service offer the new person immediately.
 *
 * What it will not do:
 *   Touch a row that already holds that name.
 *   Invent an FTO who is not on the active roster.
 *   Guess a level, phase, or email — those are required for the person to
 *   show up correctly on the right skills form and to sign in.
 *   Submit any form, change any trigger, or rewrite any form structure.
 *
 * Two ways in:
 *   Editor: set PORTAL_ADD_TRAINEE, run addTraineeBeforeAndAfter / addTrainee.
 *   Field Training: Training Division → Bring someone on → addTraineeV1 (web).
 */

var PORTAL_ADD_TRAINEE_PROPERTY = 'PORTAL_ADD_TRAINEE';
var PORTAL_ADD_TRAINEE_LOG = 'PORTAL TRAINEE ADDITIONS';

var ADD_TRAINEE_LEVELS_V1 = {
  emt: 'EMT',
  aemt: 'Advanced EMT',
  'advanced emt': 'Advanced EMT',
  paramedic: 'Paramedic',
  pmd: 'Paramedic'
};

/** Normalize a typed level to the spelling the master and forms expect. */
function canonicalTraineeLevelV1_(raw) {
  var k = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!k) return '';
  if (ADD_TRAINEE_LEVELS_V1[k]) return ADD_TRAINEE_LEVELS_V1[k];
  if (/^advanced/.test(k) || k === 'aemt') return 'Advanced EMT';
  if (/param/.test(k)) return 'Paramedic';
  if (/^emt/.test(k)) return 'EMT';
  return '';
}

/** Normalize phase text to "Phase N". */
function canonicalTraineePhaseV1_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var m = s.match(/(\d+)/);
  if (m) return 'Phase ' + m[1];
  if (/^phase\s+/i.test(s)) return s.replace(/^phase/i, 'Phase');
  return s;
}

/**
 * Parse one request object. Accepts either a structured web payload or a
 * free-text property line:
 *   "Casey Holt, casey@example.org, EMT, Phase 1, Dana Whitlock, A"
 * Parts after the name may arrive in any order.
 */
function parseAddTraineeRequestV1_(piece) {
  if (piece && typeof piece === 'object' && !Array.isArray(piece)) {
    return {
      name: String(piece.name || '').replace(/\s+/g, ' ').trim(),
      email: String(piece.email || '').trim().toLowerCase(),
      level: canonicalTraineeLevelV1_(piece.level),
      phase: canonicalTraineePhaseV1_(piece.phase || 'Phase 1'),
      fto: String(piece.fto || '').replace(/\s+/g, ' ').trim(),
      entry: String(piece.entry || piece.entryProfile || '').trim().toUpperCase(),
      employeeId: String(piece.employeeId || piece.id || '').trim(),
      shift: String(piece.shift || '').trim().toUpperCase()
    };
  }

  var parts = String(piece || '').split(/[,|\t]+/)
    .map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  if (!parts.length) return null;

  var req = { name: '', email: '', level: '', phase: '', fto: '', entry: '',
              employeeId: '', shift: '' };
  parts.forEach(function (v) {
    if (!req.email && v.indexOf('@') > 0 &&
        /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v)) {
      req.email = v.toLowerCase(); return;
    }
    var lvl = canonicalTraineeLevelV1_(v);
    if (!req.level && lvl) { req.level = lvl; return; }
    if (!req.phase && /phase\s*\d+/i.test(v)) {
      req.phase = canonicalTraineePhaseV1_(v); return;
    }
    if (!req.entry && /^[A-Za-z]$/.test(v)) { req.entry = v.toUpperCase(); return; }
    if (!req.shift && /^[A-Da-d]$/.test(v) && req.entry) {
      req.shift = v.toUpperCase(); return;
    }
    if (!req.name) { req.name = v; return; }
    if (!req.fto && looksLikeANameV1_(v)) { req.fto = v; return; }
  });
  if (!req.phase) req.phase = 'Phase 1';
  if (!req.name) return null;
  return req;
}

function addTraineeRequestsV1_() {
  var raw = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL_ADD_TRAINEE_PROPERTY) || '');
  var out = [];
  raw.split(/[;\n\r]+/).forEach(function (piece) {
    var req = parseAddTraineeRequestV1_(piece);
    if (req) out.push(req);
  });
  return out;
}

/** Plan from property requests, or from an explicit list (web). */
function addTraineePlanV1_(explicit) {
  var plan = {
    add: [], already: [], closed: [], clash: [], badFto: [], incomplete: [],
    problem: '', headers: {}
  };

  plan.requests = explicit && explicit.length
    ? explicit.map(parseAddTraineeRequestV1_).filter(Boolean)
    : addTraineeRequestsV1_();

  if (!plan.requests.length) {
    plan.problem = 'Nothing to add.\n\n' +
      'On Field Training: Training Division → Bring someone on.\n\n' +
      'In the editor, set ' + PORTAL_ADD_TRAINEE_PROPERTY + ' to:\n' +
      '  Casey Holt, casey@example.org, EMT, Phase 1, Dana Whitlock, A\n\n' +
      'Name, email, and level are required. Phase defaults to Phase 1.\n' +
      'More than one? Put a semicolon between them.';
    return plan;
  }

  var t = readTabV1_(PORTAL.TAB.MASTER);
  if (!t.ok) {
    plan.problem = PORTAL.TAB.MASTER + ' is not in this spreadsheet.';
    return plan;
  }
  if (t.col['TRAINEE'] === undefined) {
    plan.problem = PORTAL.TAB.MASTER + ' has no TRAINEE column.';
    return plan;
  }
  plan.tab = t;
  plan.headers = t.col;

  var onMaster = traineesV1_();
  var officers = {};
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      officers[p.norm] = p.name;
    });
  } catch (e) {}

  plan.requests.forEach(function (req) {
    if (!req.name) return;
    if (!req.email || !req.level) {
      plan.incomplete.push(req);
      return;
    }
    if (req.entry && !/^[A-Z]$/.test(req.entry)) {
      plan.incomplete.push(req);
      return;
    }

    var k = normNameV1_(req.name);
    var match = null;
    onMaster.forEach(function (p) { if (p.norm === k) match = p; });
    if (match) {
      (match.closed ? plan.closed : plan.already).push(match);
      return;
    }

    var emailOwner = null;
    onMaster.forEach(function (p) {
      if (p.email && p.email === req.email) emailOwner = p;
    });
    if (emailOwner) {
      plan.clash.push({ req: req, owner: emailOwner });
      return;
    }

    if (req.fto) {
      var fk = normNameV1_(req.fto);
      if (!officers[fk]) {
        plan.badFto.push(req);
        return;
      }
      req.fto = officers[fk]; // roster's exact spelling
    }

    if (!req.phase) req.phase = 'Phase 1';
    plan.add.push(req);
  });

  return plan;
}

/** Read-only preview for the editor. */
function addTraineeBeforeAndAfter() {
  var p = addTraineePlanV1_();
  var L = ['ADDING A TRAINEE  (nothing has been written)', '',
    'In   : ' + safeTargetNameV1_(),
    'Mode : ' + safeModeV1_(), ''];
  if (p.problem) { L.push(p.problem); return noteV1_(L.join('\n')); }
  addTraineeBodyV1_(p, L, false);
  L.push('');
  L.push('Nothing has been written. To do it: addTrainee()');
  return noteV1_(L.join('\n'));
}

function addTraineeBodyV1_(p, L, done) {
  p.add.forEach(function (a) {
    L.push((done ? 'ADDED   ' : 'WOULD ADD   ') + a.name);
    L.push('  TRAINEE          ' + a.name);
    L.push('  TRAINEE EMAIL    ' + a.email);
    L.push('  LEVEL            ' + a.level);
    L.push('  CURRENT PHASE    ' + a.phase);
    L.push('  ASSIGNED FTO     ' + (a.fto || '(blank — assign later)'));
    if (a.entry) L.push('  ENTRY PROFILE    ' + a.entry);
    if (a.employeeId) L.push('  EMPLOYEE ID      ' + a.employeeId);
    if (a.shift) L.push('  SHIFT            ' + a.shift);
    L.push('  SET STATUS       Active');
    L.push('');
  });
  if (p.already.length) {
    L.push('ALREADY ON THE MASTER  (' + p.already.length + ')');
    p.already.forEach(function (a) {
      L.push('  ' + a.name + (a.email ? '   ' + a.email : ''));
    });
    L.push('  Nothing to do. Nothing was changed.');
    L.push('');
  }
  if (p.closed.length) {
    L.push('CLOSED / RELEASED ON THE MASTER  (' + p.closed.length + ')');
    p.closed.forEach(function (a) {
      L.push('  ' + a.name + '   status ' + (a.status || '(blank)'));
    });
    L.push('  Re-opening a closed trainee is a person decision, not an append.');
    L.push('');
  }
  if (p.clash.length) {
    L.push('THAT ADDRESS BELONGS TO SOMEBODY ELSE  (' + p.clash.length + ')');
    p.clash.forEach(function (c) {
      L.push('  ' + c.req.email + '   is ' + c.owner.name);
    });
    L.push('  An address is how Field Training recognizes a trainee. Not added.');
    L.push('');
  }
  if (p.badFto.length) {
    L.push('TRAINING OFFICER NOT ON THE ACTIVE ROSTER  (' + p.badFto.length + ')');
    p.badFto.forEach(function (r) {
      L.push('  ' + r.name + ' → ' + r.fto);
    });
    L.push('  Run addFto for that officer first, or leave ASSIGNED FTO blank.');
    L.push('');
  }
  if (p.incomplete.length) {
    L.push('MISSING REQUIRED FIELDS  (' + p.incomplete.length + ')');
    p.incomplete.forEach(function (r) {
      L.push('  ' + (r.name || '(no name)') +
             ' — need name, email, and level (EMT / Advanced EMT / Paramedic)');
    });
    L.push('');
  }
  return L;
}

/** First blank TRAINEE cell, or one past the last row. */
function firstEmptyTraineeRowV1_(sh, t) {
  var nameCol = t.col['TRAINEE'];
  for (var i = 0; i < t.rows.length; i++) {
    if (!String(t.rows[i][nameCol] || '').trim()) {
      return t.firstDataRow + i;
    }
  }
  return Math.max(sh.getLastRow() + 1, t.firstDataRow);
}

function setMasterCellV1_(sh, row, t, header, value) {
  if (t.col[header] === undefined || value === '' || value == null) return false;
  sh.getRange(row, t.col[header] + 1).setValue(value);
  return true;
}

/** Editor entry: apply PORTAL_ADD_TRAINEE. */
function addTrainee() {
  return applyAddTraineePlanV1_(addTraineePlanV1_());
}

/**
 * Apply a plan. Shared by editor addTrainee() and web addTraineeV1().
 * Returns a note string (editor) — web wraps it.
 */
function applyAddTraineePlanV1_(p) {
  if (p.problem) return noteV1_(p.problem);

  var L = ['TRAINEE ADDED TO FIELD TRAINING', '',
    'In     : ' + safeTargetNameV1_(),
    'Run by : ' + (whoIsAskingV1_() || whoIsVisitingV1_() || 'unidentified'), ''];

  if (!p.add.length) {
    L.push('Nothing was added.');
    L.push('');
    addTraineeBodyV1_(p, L, true);
    return noteV1_(L.join('\n'));
  }

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.MASTER);
  if (!sh) return noteV1_(PORTAL.TAB.MASTER + ' is not in this spreadsheet.');
  var t = readTabV1_(PORTAL.TAB.MASTER);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss');
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // FTO dropdown must accept the name before we write ASSIGNED FTO.
  try { rebuildFtoDropdownV1_(); } catch (eDrop) {}

  var manifest = [], added = [], refused = [];

  p.add.forEach(function (a) {
    // Re-read so each append sees prior rows in this same run.
    t = readTabV1_(PORTAL.TAB.MASTER);
    var at = firstEmptyTraineeRowV1_(sh, t);
    try {
      setMasterCellV1_(sh, at, t, 'TRAINEE', clean_(a.name));
      setMasterCellV1_(sh, at, t, 'TRAINEE EMAIL', clean_(a.email));
      setMasterCellV1_(sh, at, t, 'LEVEL', clean_(a.level));
      setMasterCellV1_(sh, at, t, 'CURRENT PHASE', clean_(a.phase));
      setMasterCellV1_(sh, at, t, 'ENTRY PROFILE', clean_(a.entry));
      setMasterCellV1_(sh, at, t, 'EMPLOYEE ID', clean_(a.employeeId));
      setMasterCellV1_(sh, at, t, 'SHIFT', clean_(a.shift));
      setMasterCellV1_(sh, at, t, 'START DATE', today);
      setMasterCellV1_(sh, at, t, 'PHASE START DATE', today);
      if (t.col['SET STATUS'] !== undefined) {
        sh.getRange(at, t.col['SET STATUS'] + 1).setValue('Active');
      } else if (t.col['PROGRAM STATUS'] !== undefined) {
        sh.getRange(at, t.col['PROGRAM STATUS'] + 1).setValue('Active');
      }
      if (a.fto) {
        var ftoHeader = t.col['ASSIGNED FTO'] !== undefined ? 'ASSIGNED FTO'
                      : (t.col['TRAINING OFFICER'] !== undefined ? 'TRAINING OFFICER' : '');
        if (ftoHeader) setMasterCellV1_(sh, at, t, ftoHeader, clean_(a.fto));
      }
    } catch (e) {
      refused.push({ a: a, why: String(e.message || e) });
      return;
    }

    manifest.push([stamp, PORTAL.TAB.MASTER, at, a.name, a.email, a.level, a.phase,
                   a.fto || '', whoIsAskingV1_() || whoIsVisitingV1_() || 'unidentified',
                   PORTAL.VERSION]);
    a.row = at;
    added.push(a);
    forgetTabsV1_();
  });

  writeAddTraineeManifestV1_(manifest);
  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;

  L.push(added.length + ' added to ' + PORTAL.TAB.MASTER + '.');
  L.push('');
  addTraineeBodyV1_({
    add: added, already: p.already, closed: p.closed, clash: p.clash,
    badFto: p.badFto, incomplete: p.incomplete
  }, L, true);

  if (refused.length) {
    L.push('NOT ADDED  (' + refused.length + ')');
    refused.forEach(function (r) { L.push('  ' + r.a.name + '   ' + r.why); });
    L.push('');
  }

  if (added.length) {
    L.push('No existing trainee row was overwritten.');
    L.push('');
    var sync = syncRegisteredFormChoicesV1_();
    if (sync && sync.ok) {
      L.push('EXISTING FORMS UPDATED');
      L.push('  Trainee dropdowns on ' + sync.forms + ' registered form(s) now include');
      L.push('  the new name(s). Prefill and open-form cards in Field Training use those');
      L.push('  same forms — nothing new was created.');
      if (sync.notes && sync.notes.length) {
        sync.notes.forEach(function (n) { L.push('  · ' + n); });
      }
      L.push('');
    } else {
      L.push('Could not refresh form dropdowns from this portal' +
             (sync && sync.why ? ': ' + sync.why : '.'));
      L.push('  Run refreshDropdowns in the tracker\'s script so the forms offer');
      L.push('  the new name.');
      L.push('');
    }
    L.push('SKILL MATRIX');
    var seeded = 0;
    added.forEach(function (a) {
      try {
        var m = seedSkillMatrixForTraineeV1_(a.name, a.level);
        if (m && m.ok) seeded += Number(m.added || 0);
      } catch (eSeed) {}
    });
    if (seeded) {
      L.push('  Seeded ' + seeded + ' skill row(s) on ' + PORTAL.TAB.SKILLS +
             ' from the catalog.');
      L.push('  Run rebuildSkillMatrix in the tracker when you want full evidence math.');
    } else {
      L.push('  No catalog rows were seeded (missing 15 SKILL CATALOG, or none apply).');
      L.push('  Open the tracker and run rebuildSkillMatrix so their skill rows appear.');
    }
    L.push('');
    L.push('To reverse an untouched blank-slate add: undoAddTrainee()');
  }
  return noteV1_(L.join('\n'));
}

function writeAddTraineeManifestV1_(rows) {
  if (!rows.length) return;
  var book = targetBookV1_();
  var sh = book.getSheetByName(PORTAL_ADD_TRAINEE_LOG);
  if (!sh) {
    sh = book.insertSheet(PORTAL_ADD_TRAINEE_LOG);
    sh.getRange(1, 1).setValue(
      'Rows the portal added to the trainee master. Do not edit or sort.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 10)
      .setValues([['RUN', 'TAB', 'ROW', 'NAME', 'EMAIL', 'LEVEL', 'PHASE', 'FTO', 'BY', 'VERSION']])
      .setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
}

/** Remove blank-slate rows from the last add run only. */
function undoAddTrainee() {
  var t = readTabV1_(PORTAL_ADD_TRAINEE_LOG);
  if (!t.ok || !t.rows.length) {
    return noteV1_('This portal has not added any trainees.');
  }
  var runs = t.rows.map(function (r) { return String(r[t.col['RUN']] || ''); })
    .filter(String).sort();
  var last = runs[runs.length - 1];
  var entries = t.rows.filter(function (r) { return String(r[t.col['RUN']] || '') === last; })
    .map(function (r) {
      return {
        row: Number(r[t.col['ROW']]),
        name: String(r[t.col['NAME']] || ''),
        email: String(r[t.col['EMAIL']] || '')
      };
    });
  if (!entries.length) return noteV1_('The log names nobody for the last run.');

  var sh = targetBookV1_().getSheetByName(PORTAL.TAB.MASTER);
  if (!sh) return noteV1_(PORTAL.TAB.MASTER + ' is not in this spreadsheet.');
  var master = readTabV1_(PORTAL.TAB.MASTER);
  var nameIdx = master.col['TRAINEE'];

  entries.sort(function (a, b) { return b.row - a.row; });

  var removed = [], kept = [];
  entries.forEach(function (e) {
    var vals;
    try {
      vals = sh.getRange(e.row, 1, 1, Math.max(master.headers.length, 1)).getValues()[0];
    } catch (err) {
      kept.push({ e: e, why: 'that row is no longer there' });
      return;
    }
    if (normNameV1_(vals[nameIdx]) !== normNameV1_(e.name)) {
      kept.push({ e: e, why: 'the name at that row is no longer ' + e.name });
      return;
    }
    // Only blank-slate: no evaluations / skills / queue should reference them
    // yet. If anything non-default was typed in Notes we keep the row.
    try {
      sh.deleteRow(e.row);
      removed.push(e);
    } catch (err2) {
      kept.push({ e: e, why: String(err2.message || err2) });
    }
  });

  forgetTabsV1_();
  PEOPLE_CACHE_V1 = null;
  try { syncRegisteredFormChoicesV1_(); } catch (eSync) {}

  var L = ['UNDO ADD TRAINEE', '',
    'Removed: ' + removed.map(function (r) { return r.name; }).join(', ') || '(none)'];
  if (kept.length) {
    L.push('Kept (touched or moved):');
    kept.forEach(function (k) { L.push('  ' + k.e.name + ' — ' + k.why); });
  }
  return noteV1_(L.join('\n'));
}


/* ======================================================================
 * Index.html — the page, in chunks
 * ====================================================================== */

/** The page. Built from portal/Index.html; do not edit it here.
 *  30_WebApp.gs prefers this constant over an HTML file when it exists,
 *  which is what makes the single-file paste work.
 *
 *  Cut into short pieces on purpose. Joined with no separator, so the
 *  newlines are inside the pieces and the page comes back exactly. */
var PORTAL_PAGE_HTML = [
  "<!DOCTYPE html>\n",
  "<html>\n",
  "<head>\n",
  "<base target=\"_top\">\n",
  "<meta charset=\"utf-8\">\n",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@4",
  "00;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=sw",
  "ap\">\n",
  "<style>\n",
  "/* ------------------------------------------------------------------ *\n",
  "   Field Training — Sumter County EMS\n",
  "\n",
  "   One living chart per trainee. Tonight for FTOs. Waiting on you for\n",
  "   Training. Built for one hand, end of shift, fourteen hours awake.\n",
  " * ------------------------------------------------------------------ */\n",
  ":root{\n",
  "  --navy:#0f1c14; --navy-2:#1a2e22; --navy-3:#08110c;\n",
  "  --paper:#f7f5f0; --surface:#efece6; --raised:#fffcf7; --line:#d4cfc4; --line-2:#e6e2d8;\n",
  "  --ink:#142018; --ink-2:#46566d; --ink-3:#78859a; --ink-4:#9aa5b5;\n",
  "  --emt:#2f7d4f; --aemt:#1f5f9e; --pmd:#a8342b; --gold:#c4a035;\n",
  "  --ok:#2f7d4f; --ok-bg:#eaf4ee;\n",
  "  --warn:#8a6a14; --warn-bg:#fdf5e2;\n",
  "  --stop:#a8342b; --stop-bg:#fbeceb;\n",
  "  --r:5px; --r-sm:3px;\n",
  "  --lift:none;\n",
  "  --lift-2:0 0 0 1px rgba(18,35,59,.12);\n",
  "  --page:linear-gradient(180deg, #e8ebe8 0%, #f2f1ec 40%, #ebe8e1 100%);\n",
  "}\n",
  "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){\n",
  "  --navy:#0e1a29; --navy-2:#183050; --navy-3:#0a1420;\n",
  "  --paper:#171e29; --surface:#0f151d; --raised:#1b2331; --line:#2a3444; --line-2:#212a37;\n",
  "  --ink:#e9eef5; --ink-2:#b6c2d2; --ink-3:#8593a6; --ink-4:#6a778a;\n",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e58f86; --gold:#d6ad50;\n",
  "  --ok:#6bbd8a; --ok-bg:#15251c; --warn:#d6ad50; --warn-bg:#251f12;\n",
  "  --stop:#e58f86; --stop-bg:#2a1816;\n",
  "  --lift:0 1px 1px rgba(0,0,0,.35), 0 2px 6px -2px rgba(0,0,0,.5);\n",
  "  --lift-2:0 2px 4px rgba(0,0,0,.45), 0 14px 32px -18px rgba(0,0,0,.95);\n",
  "  --page:radial-gradient(1200px 600px at 50% -10%, #16202d 0%, #0f151d 55%, #0c1219 100%);",
  "\n",
  "}}\n",
  ":root[data-theme=\"dark\"]{\n",
  "  --navy:#0e1a29; --navy-2:#183050; --navy-3:#0a1420;\n",
  "  --paper:#171e29; --surface:#0f151d; --raised:#1b2331; --line:#2a3444; --line-2:#212a37;\n",
  "  --ink:#e9eef5; --ink-2:#b6c2d2; --ink-3:#8593a6; --ink-4:#6a778a;\n",
  "  --emt:#6bbd8a; --aemt:#6aa8dd; --pmd:#e58f86; --gold:#d6ad50;\n",
  "  --ok:#6bbd8a; --ok-bg:#15251c; --warn:#d6ad50; --warn-bg:#251f12;\n",
  "  --stop:#e58f86; --stop-bg:#2a1816;\n",
  "  --lift:0 1px 1px rgba(0,0,0,.35), 0 2px 6px -2px rgba(0,0,0,.5);\n",
  "  --lift-2:0 2px 4px rgba(0,0,0,.45), 0 14px 32px -18px rgba(0,0,0,.95);\n",
  "  --page:radial-gradient(1200px 600px at 50% -10%, #16202d 0%, #0f151d 55%, #0c1219 100%);",
  "\n",
  "}\n",
  "*{box-sizing:border-box;}\n",
  "html{-webkit-text-size-adjust:100%;}\n",
  "html,body{margin:0;min-height:100%;background:var(--navy-3);color:var(--ink);\n",
  "  font-family:\"IBM Plex Sans\",system-ui,-apple-system,sans-serif;font-size:16px;line-heigh",
  "t:1.5;\n",
  "  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}\n",
  "/* Phone stays full-bleed. Desk / laptop: a commanding column, not a postage stamp. */\n",
  ".app{width:100%;max-width:100%;margin:0 auto;background:var(--paper);min-height:100vh;\n",
  "  box-shadow:none;}\n",
  "@media(min-width:700px){\n",
  "  body{background-image:linear-gradient(165deg, #1a2e22 0%, var(--navy-3) 42%, #050a07 100",
  "%);\n",
  "    background-attachment:fixed;padding:28px 24px 48px;}\n",
  "  .app{max-width:920px;border-radius:2px;overflow:hidden;min-height:calc(100vh - 76px);\n",
  "    box-shadow:0 0 0 1px rgba(196,160,53,.35), 0 28px 60px -30px rgba(0,0,0,.85);}\n",
  "  .bar{padding:16px 28px;}\n",
  "  .bar img{width:56px;height:61px;}\n",
  "  .bar .county{font-size:1.55rem;}\n",
  "  .bar .program{font-size:.78rem;letter-spacing:.22em;}\n",
  "  .wrap{padding:0 28px 56px;}\n",
  "  .hero{margin:0 -28px 22px;padding:14px 28px 28px;border-radius:0;}\n",
  "  .hero h1{font-size:2.65rem;}\n",
  "  .hero .sub{font-size:1.05rem;}\n",
  "  .btn{padding:18px;font-size:1.2rem;min-height:60px;}\n",
  "  .decision .h{font-size:1.7rem!important;}\n",
  "  .clock{width:64px;height:64px;}\n",
  "  .clock svg{width:64px;height:64px;}\n",
  "}\n",
  "@media(min-width:1100px){\n",
  "  .app{max-width:1080px;}\n",
  "  .hero h1{font-size:3rem;}\n",
  "}\n",
  "\n",
  "/* --- the bar — county badge owns the brand; program is the subline --- */\n",
  ".bar{background:var(--navy);color:#fff;padding:14px 18px;display:flex;align-items:center;g",
  "ap:14px;\n",
  "  position:sticky;top:0;z-index:20;border-bottom:3px solid var(--gold);}\n",
  ".bar img{width:48px;height:52px;display:block;flex:none;filter:drop-shadow(0 1px 0 rgba(0,",
  "0,0,.35));}\n",
  ".bar .brand{display:flex;flex-direction:column;gap:1px;min-width:0;}\n",
  ".bar .county{font-family:\"Oswald\",sans-serif;font-weight:700;font-size:1.28rem;line-height",
  ":1.05;\n",
  "  letter-spacing:.02em;text-transform:uppercase;color:#fff;}\n",
  ".bar .program{font-family:\"IBM Plex Sans\",sans-serif;font-weight:600;font-size:.72rem;lett",
  "er-spacing:.2em;\n",
  "  text-transform:uppercase;color:var(--gold);}\n",
  ".mode{margin-left:auto;font-family:\"Oswald\",sans-serif;font-size:.68rem;letter-spacing:.14",
  "em;\n",
  "  text-transform:uppercase;font-weight:600;padding:4px 0 4px 10px;border-radius:0;\n",
  "  background:transparent;color:#9db0a8;border:0;border-left:1px solid rgba(255,255,255,.22",
  ");}\n",
  "\n",
  "/* --- the hero ---\n",
  "   Every screen gets a top. The navy block from the bar carries on down and\n",
  "   rounds off, and the one sentence that says where you are lives in it -\n",
  "   so the screen opens with a statement rather than with body text. */\n",
  ".hero{background:var(--navy);color:#fff;margin:0 -18px 18px;padding:10px 18px 22px;\n",
  "  border-radius:0;border-bottom:3px solid var(--gold);}\n",
  ".hero .eyebrow{font-family:\"Oswald\",sans-serif;font-size:.66rem;letter-spacing:.17em;\n",
  "  text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:3px;}\n",
  ".hero h1{font-family:\"Oswald\",sans-serif;font-weight:700;font-size:2.05rem;\n",
  "  line-height:1.05;margin:0;color:#fff;letter-spacing:-.005em;}\n",
  ".hero .sub{color:#b7c4b8;font-size:.93rem;margin:6px 0 0;}\n",
  ".hero .chip{border-color:rgba(255,255,255,.45);color:#dbe5f0;}\n",
  ".wrap{padding:0 18px 44px;position:relative;}\n",
  "\n",
  "/* --- sections --- */\n",
  "h2{font-family:\"Oswald\",sans-serif;font-weight:700;font-size:.76rem;letter-spacing:.16em;\n",
  "  text-transform:uppercase;color:var(--ink-3);margin:26px 0 10px;display:flex;align-items:",
  "center;gap:8px;}\n",
  "h2:first-child{margin-top:16px;}\n",
  "h2:after{content:\"\";flex:1;height:1px;background:var(--line);}\n",
  "h2 .n{flex:none;font-size:.72rem;letter-spacing:.04em;background:var(--surface);border:1px",
  " solid var(--line);\n",
  "  color:var(--ink-2);border-radius:2px;padding:1px 7px;order:9;}\n",
  ".sub{color:var(--ink-3);font-size:.92rem;margin:0 0 14px;}\n",
  "\n",
  "/* --- the card ---\n",
  "   One shape for everything a person can act on. The spine carries the\n",
  "   urgency, the chip carries the level, and the body carries the words. */\n",
  ".card{position:relative;background:var(--raised);border:1px solid var(--line);border-radiu",
  "s:var(--r);\n",
  "  padding:14px 15px 14px 17px;margin-bottom:9px;overflow:hidden;box-shadow:var(--lift);}\n",
  ".card:before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:4px;\n",
  "  background:var(--accent,transparent);}\n",
  ".card.act{display:flex;gap:12px;align-items:center;width:100%;text-align:left;cursor:point",
  "er;\n",
  "  font:inherit;color:inherit;text-decoration:none;min-height:66px;\n",
  "  transition:border-color .12s ease, box-shadow .12s ease, transform .08s ease;}\n",
  ".card.act:hover,.card.act:focus-visible{border-color:var(--ink-4);box-shadow:var(--lift-2)",
  ";}\n",
  ".card.act:active{transform:scale(.994);}\n",
  ".bd{flex:1;min-width:0;}\n",
  ".hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}\n",
  ".h{display:block;font-family:\"Oswald\",sans-serif;font-weight:700;font-size:1.16rem;\n",
  "  line-height:1.2;letter-spacing:.002em;}\n",
  ".m{display:block;font-size:.86rem;color:var(--ink-3);line-height:1.35;margin-top:3px;}\n",
  ".flag{display:block;font-size:.86rem;font-weight:600;line-height:1.35;margin-top:5px;\n",
  "  color:var(--accent,var(--ink-2));}\n",
  ".go{flex:none;color:var(--ink-4);font-size:1.5rem;line-height:1;}\n",
  ".card.act:hover .go{color:var(--ink-2);}\n",
  "\n",
  "/* --- level identity --- */\n",
  ".chip{display:inline-block;font-family:\"Oswald\",sans-serif;font-weight:700;font-size:.66re",
  "m;\n",
  "  letter-spacing:.11em;text-transform:uppercase;padding:2px 7px;border-radius:4px;\n",
  "  border:1px solid currentColor;white-space:nowrap;}\n",
  ".c-emt{color:var(--emt);}.c-aemt{color:var(--aemt);}.c-pmd{color:var(--pmd);}\n",
  ".c-ok{color:var(--ok);background:var(--ok-bg);}.c-warn{color:var(--warn);background:var(--",
  "warn-bg);}\n",
  ".c-stop{color:var(--stop);background:var(--stop-bg);}.c-mute{color:var(--ink-3);}\n",
  "\n",
  "/* --- notes: a rule, not a box. a box shouts; a rule states. --- */\n",
  ".note{border-radius:var(--r-sm);padding:12px 14px;margin:0 0 11px;font-size:.91rem;line-he",
  "ight:1.45;\n",
  "  border-left:3px solid var(--ink-3);background:var(--surface);color:var(--ink-2);}\n",
  ".note b{display:block;font-family:\"Oswald\",sans-serif;font-size:.7rem;letter-spacing:.15em",
  ";\n",
  "  text-transform:uppercase;margin-bottom:4px;color:var(--ink-3);}\n",
  ".n-ok{border-left-color:var(--ok);background:var(--ok-bg);}.n-ok b{color:var(--ok);}\n",
  ".n-warn{border-left-color:var(--warn);background:var(--warn-bg);}.n-warn b{color:var(--war",
  "n);}\n",
  ".n-stop{border-left-color:var(--stop);background:var(--stop-bg);}.n-stop b{color:var(--sto",
  "p);}\n",
  ".n-info{border-left-color:var(--ink-4);}\n",
  "\n",
  "/* --- panels and rows --- */\n",
  ".panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);\n",
  "  padding:14px 16px;margin-bottom:11px;}\n",
  ".lab{font-family:\"Oswald\",sans-serif;font-size:.7rem;letter-spacing:.15em;\n",
  "  text-transform:uppercase;color:var(--ink-3);font-weight:700;margin-bottom:7px;}\n",
  ".kv{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px so",
  "lid var(--line-2);\n",
  "  font-size:.93rem;align-items:center;}\n",
  ".kv:last-child{border-bottom:none;}\n",
  ".kv:first-child{padding-top:0;}\n",
  ".kv .k{color:var(--ink-3);}.kv .v{font-weight:600;text-align:right;}\n",
  ".prog{height:8px;background:var(--line);border-radius:5px;overflow:hidden;margin:10px 0 6p",
  "x;}\n",
  ".prog i{display:block;height:100%;border-radius:5px;background:var(--emt);}\n",
  ".big{font-family:\"Oswald\",sans-serif;font-size:2.1rem;font-weight:700;line-height:1;}\n",
  ".big small{font-size:1rem;color:var(--ink-3);font-weight:600;}\n",
  "\n",
  "/* --- controls --- */\n",
  ".btn{display:block;width:100%;text-align:center;background:var(--navy);color:#fff;border:n",
  "one;\n",
  "  border-radius:var(--r);padding:16px;font-family:\"Oswald\",sans-serif;font-weight:700;\n",
  "  font-size:1.1rem;letter-spacing:.01em;cursor:pointer;margin-top:10px;min-height:56px;\n",
  "  box-shadow:var(--lift);transition:background .12s ease, transform .08s ease;}\n",
  ".btn:hover{background:var(--navy-2);}\n",
  ".btn:active{transform:scale(.994);}\n",
  ".btn.ghost{background:none;color:var(--ink-2);border:1px solid var(--line);box-shadow:none",
  ";}\n",
  ".btn[disabled]{opacity:.5;cursor:not-allowed;}\n",
  "textarea{width:100%;min-height:104px;border:1px solid var(--line);border-radius:var(--r-sm",
  ");\n",
  "  padding:12px 13px;font:inherit;color:inherit;background:var(--paper);resize:vertical;}\n",
  "textarea:focus{outline:2.5px solid var(--gold);outline-offset:1px;}\n",
  ".field{margin-bottom:12px;}\n",
  ".field .lab{margin-bottom:6px;}\n",
  ".field input,.field select{width:100%;padding:14px 13px;font:inherit;font-size:1.05rem;\n",
  "  color:inherit;background:var(--paper);border:1px solid var(--line);border-radius:var(--r",
  "-sm);}\n",
  ".field input:focus,.field select:focus{outline:2.5px solid var(--gold);outline-offset:1px;",
  "}\n",
  ".field .hint{font-size:.82rem;color:var(--ink-3);margin-top:5px;}\n",
  ".pick{display:block;width:100%;appearance:none;-webkit-appearance:none;-moz-appearance:non",
  "e;\n",
  "  background-color:var(--raised);color:inherit;border:1px solid var(--line);border-radius:",
  "var(--r);\n",
  "  padding:15px 42px 15px 16px;font:inherit;cursor:pointer;margin-bottom:10px;min-height:56",
  "px;\n",
  "  box-shadow:var(--lift);\n",
  "  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width",
  "='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='",
  "%2378859a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  ";\n",
  "  background-repeat:no-repeat;background-position:right 16px center;background-size:12px 8",
  "px;}\n",
  ".pick:hover{border-color:var(--ink-4);}\n",
  ".more{background:none;border:1px solid var(--line);border-radius:var(--r);width:100%;paddi",
  "ng:13px;\n",
  "  font:inherit;font-size:.9rem;color:var(--ink-2);cursor:pointer;margin-bottom:12px;min-he",
  "ight:50px;}\n",
  ".more:hover{border-color:var(--ink-4);color:var(--ink);}\n",
  ".back{background:none;border:none;color:var(--ink-3);font-family:\"Oswald\",sans-serif;\n",
  "  font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;cursor:poi",
  "nter;\n",
  "  padding:8px 0;margin:4px 0 6px;}\n",
  ".back:hover{color:var(--ink);}\n",
  "\n",
  "/* --- the next-step rail --- */\n",
  ".next{border-left:3px solid var(--gold);padding:2px 0 2px 13px;margin:18px 0 6px;font-size",
  ":.89rem;\n",
  "  color:var(--ink-2);line-height:1.5;}\n",
  ".next b{font-family:\"Oswald\",sans-serif;font-size:.7rem;letter-spacing:.15em;\n",
  "  text-transform:uppercase;color:var(--gold);display:block;margin-bottom:3px;}\n",
  "\n",
  "/* --- the record --- */\n",
  ".rec{border:1px solid var(--line);border-radius:var(--r);padding:14px 15px;margin-bottom:9",
  "px;\n",
  "  background:var(--raised);box-shadow:var(--lift);}\n",
  ".rec.cur{border-left:4px solid var(--gold);}\n",
  ".rec.dup{border-left:4px solid var(--stop);}\n",
  ".rec .when{font-family:\"Oswald\",sans-serif;font-size:.72rem;letter-spacing:.13em;\n",
  "  text-transform:uppercase;color:var(--ink-3);display:flex;justify-content:space-between;g",
  "ap:10px;}\n",
  ".rec .when b{color:var(--gold);font-weight:700;}\n",
  ".rec .fld{margin-top:10px;}\n",
  ".rec .fld .l{font-family:\"Oswald\",sans-serif;font-size:.7rem;letter-spacing:.13em;\n",
  "  text-transform:uppercase;color:var(--ink-3);}\n",
  ".rec .fld .v{font-size:.94rem;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere",
  ";}\n",
  ".fresh{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px;}\n",
  ".fresh span{font-size:.78rem;color:var(--ink-2);background:var(--surface);\n",
  "  border:1px solid var(--line);border-radius:20px;padding:4px 11px;}\n",
  ".fresh span b{color:var(--ink);font-weight:700;}\n",
  ".fresh span.never{color:var(--ink-4);}\n",
  "\n",
  ".foot{padding:20px 18px 34px;border-top:1px solid var(--line);color:var(--ink-4);font-size",
  ":.79rem;\n",
  "  background:var(--surface);}\n",
  ":focus-visible{outline:2.5px solid var(--gold);outline-offset:2px;border-radius:4px;}\n",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!importan",
  "t;}\n",
  "  .card.act:active,.btn:active{transform:none;}}\n",
  "\n",
  "/* --- Field Training: phase track, evidence bars, clock, moves, strip --- */\n",
  ".mono{font-family:\"IBM Plex Mono\",ui-monospace,monospace;font-weight:500;}\n",
  ".phase-track{display:flex;gap:4px;margin:14px 0 0;}\n",
  ".phase-track .p{flex:1;}\n",
  ".phase-track .pip{height:5px;border-radius:3px;background:var(--line);}\n",
  ".phase-track .pip.on{background:var(--gold);}\n",
  ".phase-track .pip.now{background:var(--emt);}\n",
  ".phase-track .lab{font-family:\"Oswald\",sans-serif;font-size:.6rem;letter-spacing:.08em;\n",
  "  text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-top:5px;}\n",
  ".phase-track .lab.on{color:var(--ink);}\n",
  ".stats{display:flex;gap:18px;margin-top:14px;padding-top:12px;border-top:1px solid var(--l",
  "ine);}\n",
  ".stats .n{font-family:\"IBM Plex Mono\",monospace;font-size:1.15rem;line-height:1;}\n",
  ".stats .l{font-size:.74rem;color:var(--ink-3);margin-top:2px;}\n",
  ".bars4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:11px;",
  "}\n",
  ".seg{display:flex;gap:2px;margin-bottom:4px;}\n",
  ".seg i{display:block;width:8px;height:14px;border-radius:1px;background:var(--line);}\n",
  ".seg i.on{background:var(--emt);}\n",
  ".bars4 .have{font-family:\"IBM Plex Mono\",monospace;font-size:.74rem;}\n",
  ".bars4 .have span{color:var(--ink-3);}\n",
  ".bars4 .bl{font-size:.66rem;color:var(--ink-3);line-height:1.25;margin-top:1px;}\n",
  ".move{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;margin-bottom:10px;\n",
  "  border-radius:10px;border:1px solid var(--warn);background:var(--warn-bg);}\n",
  ".move.due{border-color:var(--stop);background:var(--stop-bg);}\n",
  ".move.ok{border-color:var(--ok);background:var(--ok-bg);}\n",
  ".move .bd{flex:1;min-width:0;}\n",
  ".move .h{font-weight:600;font-size:.95rem;}\n",
  ".move .m{font-size:.83rem;color:var(--ink-2);margin-top:2px;line-height:1.4;}\n",
  ".move .go-btn{flex:none;background:var(--warn);color:#1a1509;border:0;border-radius:7px;\n",
  "  padding:10px 13px;font-family:\"Oswald\",sans-serif;font-weight:700;font-size:.9rem;\n",
  "  cursor:pointer;min-height:44px;}\n",
  ".move.due .go-btn{background:var(--stop);color:#fff;}\n",
  ".clock{position:relative;width:52px;height:52px;flex:none;}\n",
  ".clock svg{display:block;}\n",
  ".clock .nums{position:absolute;inset:0;display:flex;flex-direction:column;align-items:cent",
  "er;\n",
  "  justify-content:center;line-height:1;}\n",
  ".clock .nums b{font-family:\"IBM Plex Mono\",monospace;font-size:.92rem;font-weight:500;}\n",
  ".clock .nums span{font-family:\"Oswald\",sans-serif;font-size:.52rem;letter-spacing:.1em;\n",
  "  text-transform:uppercase;color:var(--ink-3);margin-top:1px;}\n",
  ".decision{background:var(--raised);border:1px solid var(--line);border-radius:11px;box-sha",
  "dow:var(--lift-2);\n",
  "  overflow:hidden;margin-bottom:16px;}\n",
  ".decision .top{display:flex;padding:15px 16px 0;}\n",
  ".decision .body{flex:1;min-width:0;padding:0 0 14px;}\n",
  ".strip{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;-webkit-overflow-scrolling:",
  "touch;\n",
  "  scroll-snap-type:x mandatory;}\n",
  ".strip .tile{flex:0 0 148px;scroll-snap-align:start;background:var(--raised);border:1px so",
  "lid var(--line);\n",
  "  border-radius:10px;padding:12px;box-shadow:var(--lift);}\n",
  ".strip .tile.due{border-color:var(--stop);}\n",
  ".strip .tile.soon{border-color:var(--warn);}\n",
  ".strip .tile .h{font-family:\"Oswald\",sans-serif;font-weight:700;font-size:1.05rem;\n",
  "  line-height:1.15;margin:0;}\n",
  ".strip .tile .m{font-size:.78rem;color:var(--ink-3);margin-top:4px;}\n",
  ".strip .tile .flag{font-size:.78rem;font-weight:600;margin-top:8px;color:var(--stop);}\n",
  ".btn.ghost-danger{background:none;color:var(--stop);border:1px solid var(--stop);box-shado",
  "w:none;margin-top:8px;}\n",
  ".btn.ghost-danger[disabled]{opacity:.35;}\n",
  ".line-mark{font-family:\"Oswald\",sans-serif;font-weight:700;font-size:.62rem;\n",
  "  letter-spacing:.18em;text-transform:uppercase;color:var(--gold);}\n",
  "@keyframes line-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}\n",
  ".wrap .hero,.wrap .decision,.wrap .move,.wrap .card{animation:line-in .35s ease both;}\n",
  "</style>\n",
  "</head>\n",
  "<body>\n",
  "<div class=\"app\">\n",
  "  <div class=\"bar\">\n",
  "    <!-- The county badge at 102x111, shown at 34x37, which is three times\n",
  "         the display size and still sharp. The full-resolution copy lives in the\n",
  "         tracker; a 49,000-character line in here made the file that has to be\n",
  "         pasted into Apps Script fragile enough to break on the way in. -->\n",
  "    <img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGYAAABvCAMAAAApDkWYAAABgFBMVE",
  "UAAAAAAAC6wbr0+Pfk6um2u7fT2Nb9/v7EysYnKCgXFxc2NzdGSEiVl5ZmaGhVV1amqah1d3fd4+GGh4fr8fDs8/Hs",
  "8vHs8vHr8fG9w8Hs8/Ha4N7n6Oh+gYGeoqHl6+uqqqrc3Nzo7u3n7ezp7u3p7u7m7eycoZ1eYGC/v7+4//8/QEHMzM",
  "zX1/bZ6enV//9/f398gXydn6C5v8DZ3+AeHyAfICAA/wAA//8gIB8+QD5VVVVcX2Cqqv+2ttqq1NSq/6rAx78AAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9M5mmAAAAgHRSTlP/AP7+/v7+A/",
  "7//////v///v/+/9CwTHCP/jH+E//+LAMJ1qtMcZD//wQD/wULEAYC////////AQH//wP/AwcGA/8AAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5YO4UAAAvTSURBVHjanZ",
  "oHf9o8E8ANGpa8BxAghGa0TdP5rHfv7/+l3rvTsGzLhEb9lQA2+vumTiNZXWxp+kJ/fzkddzcfn7aPj9y2x83244fd",
  "7niy96XppX6SS4wX+mm6+7DdQMcs0gC33d8cv1vUz2PMb067/Wbon0upDgLb+qBk5y8A68Px3/ijz3/9GQwxfjl+2H",
  "LXvyjb+ovOkqBleVH157XkFrXfnfzjXYEh4b8enRhS3NU66JxespBWlcrcCqSHOCiJCnK8MQwu7oqgx6IRXGDPHORT",
  "oin7tjZXdHWWRNrsj/D7l/QyBiEPO6Mr2VRGCt2WQiDtNyTDGz34gCKB6L6iJBLf7l5mIiVTCAiCN9+eay9GgV+08E",
  "bgG+wyL+oWn6NRPd5QMtGT1EV5SyLdnCagZALZkyCiMgxNLI3fSXij8Fph2DljpXsOI4VocxCsOhgQdJZGMPfwpdFW",
  "V9qeEnji2ndTo0lAnspcqxnrE0/kyrhbQRakRyWJJpiUIGSRVjt/wq6ahJQlFRNokpa7ziujR/s0LThBqYxGQfySk0",
  "QPXnOJVxdBDp/sbb3VBlocdC+hqxyeupBM+L6tXGgy031OsreNTjID2jkTIWaA1F4LMjG2pb6QoVhZMK6FvZL03kro",
  "d+UQWqBaJgoAYY/bo9FcgriHPflm7QMEni+3PibMn6JivGQcwDxzT5B79aFZlHE25JvOcnRMvv+OnAT+gwtzJuGx86",
  "pvC6sRpzXUBxolI8ORYHSlcZrCd6Wxem2FaRu8N09qBR2D5lKUZgvvOzAn0c3ja6e1nrQGP22wN7hWW+cD5+baKQnu",
  "zYpWSJTmjhw9b0yEgctwtr9PkxNSSk1uhQ5lwkFYzefG1xREe06X8kFOq73CB1BmhXG6wxt1A93frJIdpKfC5ikIxl",
  "pS1FTut5LhM5JFBH6nlaqsNNYXwEjlkPfQMmUe9lDBUPU9ebJaKIY4gPY3bnsxztrja1G2eZCYtR5SAGQAY//MpGpV",
  "VdxpF7TNd8nW2hTMwfu2L8uysnbtDZxyZaGTpZa3wmbzgp6nzE2udgGG1kIM965jm9RkFNaQx1STbuumgces6NVJVv",
  "SK7kRhNDmQUF43oL6bZOMwSWkeyj5Hb8fNekphzZnlLSsFG13SNVioNAZRZnzwv2D75NE5Jo26udaFiZWkUlI1VTbV",
  "UcPw9Q/ox+S7UbNpp/EZwmI+gjTdRO9DfMdaybRu8gPP8mEgGFpV+VyaBMPVU8LIY8mWDWmo4C4iok1LcFCd846rol",
  "m4z2X2AMM9pkWX72NWH7cvFGYFvC4JnQ9uhp842yYuQIy2yNGWKZmurd0zASUHZEAdFaiVMpAf8lqIMVav45rQdd8o",
  "qMkOQX1AFdz6ORJTWeCFujOYLHmlZbWtxDh3SodxwTbG6ld+DekPPO0VjK6ajgim08aFNvfNZBFRL/VjMJ2+xMBMwo",
  "MmSmpCYevwG/OY4F2yLC5Is4jJZgzOb9fUv1pTxX6L8imrRSzdVZ/HMJsg2UxaUXZTBrTO9A9zAmy3gxp7ZgzFDtPu",
  "yAW2cUy9jjAIY5oaML1L99Z67RSDDv00yj8uolQc4jESpiIOY8Ls4DHT7iA8n5KPEYeEC5xfxNg3hMmdnW2bmpqSzU",
  "0ktxxYN+6cjTFiDUWKwxgP0v5WGclwH6EWYHcz/AhxCxrqQozAGaG0GOtoOZPS3C7iGD5L6FWAgWiAh28VGzACUg5M",
  "Qh3GdNsqcTA/mA0PNHoe5/yWDYzySwUd/k/JwaEVzHShWRegbotGCcQPHjHqjn1ITnw0oo4wEgbPzESIsCCQpuuEgL",
  "rKYaokL5Wiu7qYo2H1tUu+zpOaw5AL9spyhLo1GELxAfMrQIR5FO8R45GbH5PVPD7rAFNYCvmX6lAIztfi1kjTsU6t",
  "LWRtrKZmQQh2PSWreeDkDgMVUbP2GJRIQpeSK4eR6B/BDcA9x1La12T1gU3TQyZ92mhV2AmCUDXd2tpmPb4K12apBq",
  "NzCzOCHZ9VQoJZaTK1nje0v8PMrs3qOvJnwERcrbSYplTRzni3hFkf9NzR2A4w/5qPOC4+b6M9gaYg4mX0CYSqYo6G",
  "s7XtLEc7H7gdnGiqN46OEHkAkUc84ISYZR/gC89sMDxC4XdRD0gBs+wDiyCDUTNd8vmg0qIHICad11Bh8uRyLa6QBi",
  "Guypk8McxxYYobMc6gtTiIMDLIDxYyL8ZwuEsR8xmNc5fE880CCDFy+AgJhy8MNsY04ND/XUXGAgwqNxiYd3Ikjgw/",
  "q9YVh361yLc7NM0LLaZ827DZAA7TEFBD1+HIQlXfCCNH7qzaMszp86i5R8z9ah+da8BcWWe0qqnYSGmzqFF+1NOR4u",
  "nBLA2BS7O51kKemltmhHEuMB8FwJ33IIdZ6Do9RrQWTJ0njhbNARQ1ZWQyeqSloZXVWrsAKZ4jWVrGUg3kgHpe8JHO",
  "7Hrakbnp0fQ+N8xPOVzFUurz38c/7ykF+EXIH4/R2bPuVTx5UnUTuaBUmU9i8zhg0tUNi02/a7mUoRcwYLZqHHzbVT",
  "qsdeLY1kUmWwvD2iJGqOeJA7wPMItOoOfq9xh6glktkI8TzeZbugoxR8Zjc9BqIs5QkSnzdwQS6tfxuot1gGEdGtN0",
  "bD1gEjPtF1eC0seiWo88TmQjb+YsnWLes/mUIZmUgzACa2No2dn6QvcDSKh6QRi/eL8oTlDc4qbKCLNGS+TPa1dml+",
  "PQ5PyUzjC7uHWCUh193jiFshht1uGcYvWSMMNWRLp6imecWvnMeOcwQgUYqJHlQUxrJ5iLMS9MiHnHeCx2knK9lq6m",
  "HjDKYbQdXtfjZS8RChPs35A4ZQzjpoRYMXiMdJhPdkiT+aRoeRyECTEpiBPLbCKcIzuM9BhfCU9qFrYL9onC3Sicg0",
  "SGNzfvpLJF+yQpLObA+HwyCIXzU3Q3CsU5bSJTR19Mmd0DNxIIK03mNJpP7P9uAUMxOp/UDTP+c4A5OE+zs/txhaZg",
  "VguV2dJOIcZos7RKQMWcHuVR7Seqo5/BaLZ5SC9sSKZsprZPHoMXtHJLUDAVxXxsl4TGK8ITlU23VykXTOrgdrTmo+",
  "2CHTRRPmu/VhOYBr3sZpVe3MXFgUdNZlvWyNZqvf1sSj9nOTXKMts0vYwhbysn4WwXjr15TdPDxloY1yC9KZoubX1T",
  "zhmZp6iqqm3bu958mT035wab3QQS+Onc5KFhdqv01R129GpWJG9sGgyzn1Ei5wXQPPxWj5ahC9PgWek1KWr6k9VVW+",
  "vJUhzbfk6vwaQpRI/KRkv+pmW0g5+bL3RS89kOz5nxTToXJnr6YZVuxnsJuKMFrTGYijYtII92TOJ+PvtzEJeziFk+",
  "y2Hc4Bxi5PAO4l0w3ErK4EOdgYNkQfZ3hdk1R0aMG5ShNIfD76qnQwJMQqyUqDRyddGGM8lZXF48mfIZs0F4HsBu/c",
  "G7VrGeHVpUWtb/4Xb8nCvvRwnz1XM2lHXcxBdVlePUDd/VJT5ARZhMF33n5scFj7ry5eM8WL07eXLaGMN/4AL1J2b2",
  "27OaYt9uChNlu3hwaPnUEHFKpzSzgwKYf6K3Zag03HNvcCMhf5Vy4QzUwPFxg5gqwbM2pLSCtmtl7SgPf0nfcNTKcD",
  "B+ctvwna4bPKhUUBLLiyLPrI9tH1ZvOGrl/UDpyS6JP4ISVkts++MC5SLGxs+oAKvUaFvbp/79yyXKZQzmg80ka2nc",
  "GD1k4yVL9OQ3H4Mz00U8HTFEusbjCb8FR7oyYWL/IuU1DHB+wLjAXH18/l3lNcsKyVu/oUTD2GXKqxjUODqcnVQqed",
  "Y504deG0XSWPBulb7Wy6uYVXqPazqM0xj9qZVtwTJVZYUz/uYKyhUYcoStUVymGllp9qeqk1D+ZefXwuWnMNDPf9BA",
  "GO+fQHl4BqOwZrlZXUO5DoMW3uHRoiYIVTx7Asa/v4ZyJQY5JxSoc6UVKewqs/wMhlTzHgUyy+aQNSEmH66lXI9Bj/",
  "uGR/54mZljK+9XV1N+AmPOsdHhL7T99t2rMflGDPb7D3NQ8loPexOGukZX+DlRoP0f5fOq4z32+bYAAAAASUVORK5C",
  "YII=\" alt=\"Sumter County EMS\">\n",
  "    <div class=\"brand\">\n",
  "      <div class=\"county\">Sumter County EMS</div>\n",
  "      <div class=\"program\">Field Training</div>\n",
  "    </div>\n",
  "    <span class=\"mode\" id=\"mode\">…</span>\n",
  "  </div>\n",
  "  <div class=\"wrap\" id=\"view\"><p class=\"sub\" id=\"boot-msg\">Loading Field Training…</p></di",
  "v>\n",
  "  <div class=\"foot\" id=\"foot\"></div>\n",
  "</div>\n",
  "<noscript>\n",
  "  <div style=\"max-width:520px;margin:40px auto;padding:24px;font-family:system-ui,sans-ser",
  "if\">\n",
  "    <h1>Field Training needs JavaScript</h1>\n",
  "    <p>Turn JavaScript on for this site, then reload.</p>\n",
  "  </div>\n",
  "</noscript>\n",
  "\n",
  "<script>\n",
  "// If this script never finishes, the message below stays so a blank page is impossible.\n",
  "try {\n",
  "  document.getElementById('boot-msg').textContent = 'Starting…';\n",
  "} catch (e0) {}\n",
  "// The scriptlet below prints the payload RAW. The escaping kind would turn\n",
  "// every quote in this JSON into &quot; and make the line invalid JavaScript,\n",
  "// and the page would sit on \"Loading\" forever because the script died before\n",
  "// render() ran.\n",
  "//\n",
  "// Never write a scriptlet marker anywhere else in this file, not even inside\n",
  "// a comment like this one. The template engine scans the raw page for those\n",
  "// markers and does not care what a comment is. An empty one compiles to\n",
  "// invalid JavaScript, and evaluate() then throws a SyntaxError reported\n",
  "// against the line in Code.gs that called it - nowhere near here.\n",
  "var BOOT = <?!= boot ?>;\n",
  "var S = { screen: 'main', ctx: null, busy: false };\n",
  "\n",
  "window.onerror = function (msg, src, line) {\n",
  "  try {\n",
  "    var v = document.getElementById('view');\n",
  "    if (v) v.innerHTML = '<div class=\"hero\"><h1>Field Training could not start</h1>' +\n",
  "      '<p class=\"sub\">A script error stopped the page. Redeploy a new version after a full",
  " paste, or check Executions in the Apps Script editor.</p></div>' +\n",
  "      '<div class=\"note n-stop\"><b>Error</b>' + String(msg || 'unknown') +\n",
  "      (line ? ' (line ' + line + ')' : '') + '</div>';\n",
  "  } catch (e1) {}\n",
  "};\n",
  "\n",
  "function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g,function(c){\n",
  "  return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }\n",
  "function lvlChip(k,l){ return '<span class=\"chip c-'+esc(k||'emt')+'\">'+esc(l||'')+'</span",
  ">'; }\n",
  "\n",
  "/* The top of a screen. Eyebrow, the statement, and one quiet line under it.\n",
  "   `sub` is trusted markup so a level chip can sit in it; everything a person\n",
  "   or a spreadsheet supplied is escaped by the caller. */\n",
  "function hero(eyebrow, title, sub){\n",
  "  return '<div class=\"hero\">'+\n",
  "    (eyebrow ? '<div class=\"eyebrow\">'+esc(eyebrow)+'</div>' : '')+\n",
  "    '<h1>'+esc(title)+'</h1>'+\n",
  "    (sub ? '<p class=\"sub\">'+sub+'</p>' : '')+'</div>';\n",
  "}\n",
  "\n",
  "/* A section heading with the count on the end of the rule. */\n",
  "function sec(label, n){\n",
  "  return '<h2>'+esc(label)+(n === undefined ? '' : '<span class=\"n\">'+esc(n)+'</span>')+'<",
  "/h2>';\n",
  "}\n",
  "\n",
  "/* The one thing readable across a room: red wants you now, amber soon,\n",
  "   nothing at all means it is fine. Returns the style attribute, or ''. */\n",
  "function spine(level){\n",
  "  if (level === 'due')  return ' style=\"--accent:var(--stop)\"';\n",
  "  if (level === 'soon') return ' style=\"--accent:var(--warn)\"';\n",
  "  if (level === 'ok')   return ' style=\"--accent:var(--ok)\"';\n",
  "  if (level === 'gold') return ' style=\"--accent:var(--gold)\"';\n",
  "  if (level === 'pmd')  return ' style=\"--accent:var(--pmd)\"';\n",
  "  return '';\n",
  "}\n",
  "function el(id){ return document.getElementById(id); }\n",
  "/* A name ends up inside onclick=\"...\", so it has to survive two parsers: the\n",
  "   HTML attribute and the JavaScript string inside it. JSON.stringify handles\n",
  "   the quotes and backslashes; esc() handles the angle brackets and the\n",
  "   double quote that would end the attribute. */\n",
  "function jsStr(v){ return esc(JSON.stringify(String(v==null?'':v))); }\n",
  "\n",
  "/* A list nobody scrolls is worse than a control they can use. Anything longer\n",
  "   than a handful of rows becomes one box: open it, pick, go.\n",
  "\n",
  "   Leave `selected` undefined and the box snaps back to its placeholder after\n",
  "   it fires, because the choice was a destination, not a setting. Pass one and\n",
  "   it stays put, because the choice is what the screen is now showing. */\n",
  "function picker(id, placeholder, items, handler, selected){\n",
  "  var stay = (selected !== undefined);\n",
  "  var h = '<select class=\"pick\" id=\"'+esc(id)+'\" aria-label=\"'+esc(placeholder)+'\"'+\n",
  "          ' onchange=\"'+handler+'(this.value)'+(stay ? '' : ';this.selectedIndex=0')+'\">'+",
  "\n",
  "          '<option value=\"\">'+esc(placeholder)+'</option>';\n",
  "  items.forEach(function(it){\n",
  "    h += '<option value=\"'+esc(it.value)+'\"'+\n",
  "         (stay && String(selected) === String(it.value) ? ' selected' : '')+\n",
  "         '>'+esc(it.label)+'</option>';\n",
  "  });\n",
  "  return h + '</select>';\n",
  "}\n",
  "function pickPerson(v){ if (v === '') return; openPerson(Number(v)); }\n",
  "function pickRecord(v){ if (v === '') return; openRecord(v); }\n",
  "function pickSettle(v){ if (v === '') return; openSettle(Number(v)); }\n",
  "function pickFormWait(v){ if (v === '') return; openFormWait(Number(v)); }\n",
  "function pickClosedReport(v){\n",
  "  if (v === '') return;\n",
  "  var t = (BOOT.data.closedPeople || [])[Number(v)];\n",
  "  if (t) openTraineeReport(t.name);\n",
  "}\n",
  "function pickSkill(v){ S.skillPick = (v === '' ? null : Number(v)); render(); }\n",
  "\n",
  "function render(){\n",
  "  try { return renderInner_(); }\n",
  "  catch (e) {\n",
  "    try {\n",
  "      paint(hero('Field Training', 'Screen failed', '')+\n",
  "        '<div class=\"note n-stop\"><b>Error</b>'+esc((e && e.message) || e)+'</div>'+\n",
  "        '<button class=\"btn\" onclick=\"S.screen=\\'main\\';S.ctx=null;render()\">Back</button>",
  "');\n",
  "    } catch (e2) {}\n",
  "  }\n",
  "}\n",
  "function renderInner_(){\n",
  "  /* LIVE is the system doing its job and wants no badge at all. Emptying the\n",
  "     text was not enough: the chip keeps its border, background and padding, so\n",
  "     what shipped was a small amber lozenge with nothing written in it, sitting\n",
  "     where a warning goes. An empty warning is worse than no warning. */\n",
  "  var chip = el('mode');\n",
  "  var label = BOOT.mode === 'STAGING' ? 'Staging' : (BOOT.mode === 'LIVE' ? '' : BOOT.mode",
  ");\n",
  "  chip.textContent = label;\n",
  "  chip.style.display = label ? '' : 'none';\n",
  "  el('foot').innerHTML = BOOT.mode === 'STAGING'\n",
  "    ? 'Staging sandbox. Invented people. Nothing here is a personnel record.'\n",
  "    : 'Signed in as ' + esc(BOOT.viewer.email || 'unknown') + ' &middot; ' + esc(BOOT.vers",
  "ion);\n",
  "\n",
  "  var v = BOOT.viewer, d = BOOT.data || {};\n",
  "  if (BOOT.error) return paint(hero('', 'Something went wrong', '')+\n",
  "    '<div class=\"note n-stop\"><b>Error</b>'+esc(BOOT.error)+'</div>');\n",
  "  if (!v.ok) return paint(\n",
  "    hero('', 'You are not set up yet', esc(v.why || 'This account is not recognised.'))+\n",
  "    '<div class=\"note n-info\"><b>What to do</b>Ask the Training Division to add '+\n",
  "    esc(v.email || 'your account')+' to the roster or the trainee master. Nothing is broke",
  "n.</div>');\n",
  "\n",
  "  if (S.screen === 'reflect')  return paintReflect();\n",
  "  if (S.screen === 'receipt')  return paintReceipt();\n",
  "  if (S.screen === 'signoff')  return paintSignoff();\n",
  "  if (S.screen === 'ack')      return paintAck();\n",
  "  if (S.screen === 'trainee')  return paintTraineeSheet();\n",
  "  if (S.screen === 'person')   return paintPersonSheet();\n",
  "  if (S.screen === 'advance')  return paintAdvance();\n",
  "  if (S.screen === 'release')  return paintRelease();\n",
  "  if (S.screen === 'record')   return paintRecord();\n",
  "  if (S.screen === 'settle')   return paintSettle();\n",
  "  if (S.screen === 'formWait') return paintFormWait();\n",
  "  if (S.screen === 'addTrainee') return paintAddTrainee();\n",
  "\n",
  "  switch (v.role) {\n",
  "    case 'TRAINEE':            return paintTrainee(d);\n",
  "    case 'FTO':                return paintFto(d);\n",
  "    case 'TRAINING_DIVISION':  return paintDivision(d);\n",
  "    case 'SUPERVISOR':         return paintSupervisor(d);\n",
  "    case 'MEDICAL_DIRECTOR':   return paintMedical(d);\n",
  "    default:                   return paint(hero('', 'No role', ''));\n",
  "  }\n",
  "}\n",
  "function paint(h){ el('view').innerHTML = h; window.scrollTo(0,0); }\n",
  "\n",
  "/* ---------------- trainee — My Line ---------------- */\n",
  "function phaseTrackHtml(phase){\n",
  "  var cur = 1;\n",
  "  var m = String(phase||'').match(/(\\d)/);\n",
  "  if (m) cur = Number(m[1]);\n",
  "  var names = ['Phase 1','Phase 2','Phase 3','Phase 4'];\n",
  "  var h = '<div class=\"phase-track\">';\n",
  "  for (var i=1;i<=4;i++){\n",
  "    var cls = i < cur ? 'on' : (i === cur ? 'now' : '');\n",
  "    h += '<div class=\"p\"><div class=\"pip '+cls+'\"></div><div class=\"lab'+(i<=cur?' on':'')",
  "+'\">'+names[i-1]+'</div></div>';\n",
  "  }\n",
  "  return h + '</div>';\n",
  "}\n",
  "function barsHtml(bars, colorVar){\n",
  "  if (!bars || !bars.length) return '';\n",
  "  var fill = colorVar || 'var(--emt)';\n",
  "  var h = '<div class=\"bars4\">';\n",
  "  bars.forEach(function(b){\n",
  "    var need = Math.max(1, Number(b.need)||1);\n",
  "    var have = Math.max(0, Number(b.have)||0);\n",
  "    var cells = '';\n",
  "    for (var i=0;i<need;i++) cells += '<i class=\"'+(i<have?'on':'')+'\" style=\"'+(i<have?'b",
  "ackground:'+fill:'')+'\"></i>';\n",
  "    h += '<div><div class=\"seg\">'+cells+'</div>'+\n",
  "         '<div class=\"have\">'+have+'<span>/'+need+'</span></div>'+\n",
  "         '<div class=\"bl\">'+esc(b.label)+'</div></div>';\n",
  "  });\n",
  "  return h + '</div>';\n",
  "}\n",
  "function skillBars(s){\n",
  "  if (s.bars && s.bars.length) return s.bars;\n",
  "  return [\n",
  "    { label: 'Successful', have: Number(s.successful)||0, need: 3 },\n",
  "    { label: 'Independent', have: Number(s.independent)||0, need: 2 },\n",
  "    { label: 'Dates', have: Number(s.distinctDates)||0, need: 2 },\n",
  "    { label: 'FTOs', have: Number(s.distinctFtos)||0, need: 2 }\n",
  "  ];\n",
  "}\n",
  "function clockHtml(hoursLeft, pct){\n",
  "  var color = hoursLeft <= 12 ? 'var(--stop)' : (hoursLeft <= 36 ? 'var(--warn)' : 'var(--",
  "ok)');\n",
  "  var r = 22, c = 2*Math.PI*r;\n",
  "  var dash = Math.max(0, Math.min(c, c * ((pct||0)/100)));\n",
  "  return '<div class=\"clock\"><svg width=\"52\" height=\"52\" viewBox=\"0 0 52 52\">'+\n",
  "    '<circle cx=\"26\" cy=\"26\" r=\"22\" fill=\"none\" stroke=\"var(--line)\" stroke-width=\"4\"/>'+\n",
  "    '<circle cx=\"26\" cy=\"26\" r=\"22\" fill=\"none\" stroke=\"'+color+'\" stroke-width=\"4\" stroke",
  "-linecap=\"round\" '+\n",
  "    'stroke-dasharray=\"'+dash+' '+c+'\" transform=\"rotate(-90 26 26)\"/></svg>'+\n",
  "    '<div class=\"nums\"><b style=\"color:'+color+'\">'+esc(String(hoursLeft))+'</b><span>hrs<",
  "/span></div></div>';\n",
  "}\n",
  "\n",
  "function paintTrainee(d){\n",
  "  if (d.error) return paint(hero('', 'No record', '')+\n",
  "    '<div class=\"note n-stop\"><b>Not found</b>'+esc(d.error)+'</div>');\n",
  "  var h = hero('My Line', d.name,\n",
  "    lvlChip(d.levelKey,d.level)+' &nbsp; '+esc(d.phase||'no phase set'));\n",
  "\n",
  "  h += '<div class=\"panel\">'+\n",
  "       '<div class=\"lab\">Where you are</div>'+\n",
  "       '<div style=\"display:flex;align-items:baseline;gap:9px\">'+\n",
  "       '<div class=\"big\" style=\"font-size:1.85rem\">'+(esc(d.phase)||'Phase ?')+'</div>'+\n",
  "       (d.dayInPhase!=null ? '<div class=\"mono\" style=\"color:var(--ink-3)\">day '+d.dayInPh",
  "ase+'</div>' : '')+\n",
  "       '</div>'+\n",
  "       phaseTrackHtml(d.phase)+\n",
  "       '<div class=\"stats\">'+\n",
  "       '<div><div class=\"n\">'+esc(String(d.evalCount||0))+'</div><div class=\"l\">shifts eva",
  "luated</div></div>'+\n",
  "       '<div><div class=\"n\">'+(d.evalAvg!=null?esc(String(d.evalAvg)):'—')+'</div><div cla",
  "ss=\"l\">average</div></div>'+\n",
  "       '<div><div class=\"n\" style=\"color:var(--ok)\">'+esc(String(d.signed))+'</div><div cl",
  "ass=\"l\">skills signed off</div></div>'+\n",
  "       '</div></div>';\n",
  "\n",
  "  var moves = d.nextMoves || [];\n",
  "  if (moves.length){\n",
  "    h += sec('Waiting on you', moves.length);\n",
  "    moves.forEach(function(m){\n",
  "      var cls = m.urgency==='due'?'due':(m.urgency==='ok'?'ok':'');\n",
  "      h += '<div class=\"move '+cls+'\"><div class=\"bd\"><div class=\"h\">'+esc(m.title)+'</div",
  ">'+\n",
  "           '<div class=\"m\">'+esc(m.blurb||'')+'</div></div>';\n",
  "      if (m.action==='ack' && canWrite() && m.row){\n",
  "        h += '<button class=\"go-btn\" onclick=\"ack('+m.row+')\">Got it</button>';\n",
  "      } else if (m.action==='reflect' && isPractice()){\n",
  "        h += '<button class=\"go-btn\" onclick=\"S.screen=\\'reflect\\';render()\">File it</butt",
  "on>';\n",
  "      }\n",
  "      h += '</div>';\n",
  "    });\n",
  "  }\n",
  "  h += formCards(d.forms);\n",
  "  (d.coaching||[]).forEach(function(c){\n",
  "    if (canWrite() && !c.book){\n",
  "      h += '<button class=\"card act\"'+spine('soon')+' onclick=\"ack('+c.row+')\">'+\n",
  "           '<span class=\"bd\"><span class=\"h\">Coaching from '+esc(c.from)+'</span>'+\n",
  "           '<span class=\"m\">'+esc(c.text)+'</span></span><span class=\"go\">&rsaquo;</span><",
  "/button>';\n",
  "    }\n",
  "  });\n",
  "\n",
  "  if (d.skills && d.skills.length){\n",
  "    var withDiv = [], building = [], done = [];\n",
  "    d.skills.forEach(function(s){\n",
  "      if (s.signed) done.push(s);\n",
  "      else if (s.readiness === 'READY FOR VALIDATION') withDiv.push(s);\n",
  "      else building.push(s);\n",
  "    });\n",
  "    h += sec('What each skill still needs', d.skills.length);\n",
  "    h += '<p class=\"sub\">Four bars each. All four full and it goes to Training Division.</",
  "p>';\n",
  "    withDiv.concat(building).slice(0,8).forEach(function(s){\n",
  "      var tag = s.readiness === 'READY FOR VALIDATION' ? 'With Division' : (s.readiness ||",
  " 'Building');\n",
  "      var tagCls = s.readiness === 'READY FOR VALIDATION' ? 'c-warn' : 'c-mute';\n",
  "      h += '<div class=\"card\"><div class=\"hd\"><span class=\"h\" style=\"font-size:1rem\">'+esc",
  "(s.skill)+'</span>'+\n",
  "           '<span class=\"chip '+tagCls+'\">'+esc(tag)+'</span></div>'+\n",
  "           barsHtml(skillBars(s), 'var(--'+esc(d.levelKey||'emt')+')')+'</div>';\n",
  "    });\n",
  "    if (done.length) h += '<p class=\"sub\">'+done.length+' already signed off.</p>';\n",
  "  }\n",
  "\n",
  "  h += sec('Your chart');\n",
  "  h += freshRow(d.freshness);\n",
  "  h += '<div class=\"panel\">'+\n",
  "       kv('Training officer', d.fto || 'not assigned')+\n",
  "       kv('Phase started', d.phaseStart || 'not set')+\n",
  "       kv('Last evaluation', d.lastEval)+'</div>';\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(d.name)+')\">'+\n",
  "       '<span class=\"bd\"><span class=\"h\">My whole record</span>'+\n",
  "       '<span class=\"m\">Everything ever submitted about you, newest first.</span></span>'+",
  "\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  h += '<div class=\"next\"><b>What happens next</b>Anything you file goes to your training ",
  "officer and the Training Division. Nobody else sees it.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function kv(k,v){ return '<div class=\"kv\"><span class=\"k\">'+esc(k)+'</span><span class=\"v\"",
  ">'+v+'</span></div>'; }\n",
  "\n",
  "/* Three modes, and only one of them means \"you are looking at the real thing\n",
  "   and it does not work\". STAGING is practice; LIVE is the real tracker doing\n",
  "   its job; PRODUCTION is the real tracker, read only.\n",
  "\n",
  "   Anything that would put a value in a cell the portal cannot write is not\n",
  "   offered at all rather than offered and then refused, because a button that\n",
  "   throws when you press it is worse than no button. */\n",
  "function canWrite(){ return BOOT.mode === 'STAGING' || BOOT.mode === 'LIVE'; }\n",
  "\n",
  "/* Made-up people, in a spreadsheet nobody's career depends on. Anything that\n",
  "   would put a second writer into a tab the forms own is offered here and\n",
  "   nowhere else. */\n",
  "function isPractice(){ return BOOT.mode === 'STAGING'; }\n",
  "\n",
  "/* A form card. The person sees a task, not a form: the registry has already\n",
  "   picked which of the nine it is and filled in the names it knows. */\n",
  "function formCards(list){\n",
  "  var h = '';\n",
  "  (list||[]).forEach(function(f){\n",
  "    if (f.live && f.url){\n",
  "      h += '<a class=\"card act\"'+spine(f.urgent?'due':'')+\n",
  "        ' href=\"'+esc(f.url)+'\" target=\"_blank\" rel=\"noopener\">'+\n",
  "        '<span class=\"bd\"><span class=\"h\">'+esc(f.title)+'</span>'+\n",
  "        '<span class=\"m\">'+esc(f.blurb)+'</span></span><span class=\"go\">&rsaquo;</span></a",
  ">';\n",
  "    } else {\n",
  "      h += '<div class=\"card\"><div class=\"h\">'+esc(f.title)+'</div>'+\n",
  "        '<div class=\"m\">'+esc(f.blurb)+'</div>'+\n",
  "        '<div class=\"flag\" style=\"--accent:var(--warn)\">Form links are switched off in thi",
  "s mode.</div></div>';\n",
  "    }\n",
  "  });\n",
  "  return h;\n",
  "}\n",
  "\n",
  "function paintReflect(){\n",
  "  paint(hero('In your own words', 'Weekly reflection', 'No length limit. Nobody edits it.'",
  ")+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What went well</div><textarea id=\"q1\"></textarea>",
  "</div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What was hard</div><textarea id=\"q2\"></textarea><",
  "/div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What I want to work on</div><textarea id=\"q3\"></t",
  "extarea></div>'+\n",
  "    '<button class=\"btn\" id=\"send\" onclick=\"sendReflection()\">Submit reflection</button>')",
  ";\n",
  "}\n",
  "function sendReflection(){\n",
  "  if (S.busy) return; S.busy = true;\n",
  "  var b = el('send'); b.disabled = true; b.textContent = 'Sending…';\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){ S.busy=false; S.ctx=r; S.screen='receipt'; render(); ",
  "})\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Submit",
  " reflection';\n",
  "      alert(e.message || e); })\n",
  "    .submitReflectionV1({ wentWell: el('q1').value, wasHard: el('q2').value, workOn: el('q",
  "3').value });\n",
  "}\n",
  "function paintReceipt(){\n",
  "  var r = S.ctx || {};\n",
  "  paint(hero('Filed', 'Submitted', 'Saved as '+esc(r.ref||''))+\n",
  "    '<div class=\"note n-ok\"><b>Recorded</b>Nothing about it can be edited by anyone.</div>",
  "'+\n",
  "    '<div class=\"panel\">'+kv('Went to','Your training officer')+\n",
  "    kv('Visible to','You, your FTO, the Training Division')+\n",
  "    kv('Stored in','Your training record')+'</div>'+\n",
  "    '<div class=\"next\"><b>What happens next</b>Your FTO reads it before your next shift.</",
  "div>'+\n",
  "    '<button class=\"btn\" onclick=\"reload()\">Back to my record</button>');\n",
  "}\n",
  "function ack(row){\n",
  "  google.script.run.withSuccessHandler(reload)\n",
  "    .withFailureHandler(function(e){ alert(e.message||e); }).ackCoachingV1(row);\n",
  "}\n",
  "\n",
  "/* ---------------- fto — Tonight ---------------- */\n",
  "function paintFto(d){\n",
  "  var hot = (d.trainees||[]).filter(function(t){ return t.urgency==='due'; }).length;\n",
  "  // End-of-shift first: one job — file for whoever is overdue.\n",
  "  var h = hero('Tonight',\n",
  "    hot ? (hot === 1 ? 'One file due' : hot + ' files due') : 'Shift quiet',\n",
  "    (d.trainees||[]).length+(d.trainees.length===1?' person':' people')+' on your line'+\n",
  "    (hot ? ' &middot; <span style=\"color:var(--gold)\">start with the one below</span>' : '",
  "'));\n",
  "  if (!d.trainees.length){\n",
  "    h += '<div class=\"note n-info\"><b>Nobody on your line</b>When Training assigns someone",
  " to you, they land here after the shift.</div>';\n",
  "    paint(h);\n",
  "    return;\n",
  "  }\n",
  "\n",
  "  var list = (d.trainees||[]).slice().sort(function(a,b){\n",
  "    // due must be 1 not 0 — (0||fallback) would demote overdue to last.\n",
  "    var rank = { due:1, soon:2 };\n",
  "    var ra = rank[a.urgency] || 9, rb = rank[b.urgency] || 9;\n",
  "    return ra - rb;\n",
  "  });\n",
  "  // Lead card: only when someone is actually overdue — not a decorative first row.\n",
  "  var lead = list[0];\n",
  "  var leadIdx = d.trainees.indexOf(lead);\n",
  "  if (lead && lead.urgency === 'due'){\n",
  "    h += '<button class=\"card act\" onclick=\"openTrainee('+leadIdx+')\"'+\n",
  "         ' style=\"--accent:var(--stop);margin-bottom:14px\">'+\n",
  "         '<span class=\"bd\"><span class=\"lab\" style=\"margin:0\">File tonight</span>'+\n",
  "         '<span class=\"h\" style=\"font-size:1.35rem\">'+esc(lead.name)+'</span>'+\n",
  "         '<span class=\"m\">'+esc(lead.phase||'')+\n",
  "         (lead.daysSinceEval<0?' · never evaluated':' · '+lead.daysSinceEval+'d since last",
  " eval')+\n",
  "         '</span><span class=\"m\">Opens eval and skills with both names filled.</span></spa",
  "n>'+\n",
  "         '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    list = list.slice(1);\n",
  "    if (list.length) h += sec('Also on your line', list.length);\n",
  "  } else if (!hot){\n",
  "    h += '<div class=\"note n-ok\"><b>Nothing overdue</b>Tap a name if you rode with them to",
  "night anyway.</div>';\n",
  "  }\n",
  "  list.forEach(function(t){\n",
  "    var i = d.trainees.indexOf(t);\n",
  "    var chip = t.urgency==='due'\n",
  "      ? '<span class=\"chip c-stop\">'+(t.daysSinceEval<0?'Never evaluated':(t.daysSinceEval",
  "+'d silent'))+'</span>'\n",
  "      : (t.urgency==='soon' ? '<span class=\"chip c-warn\">Due soon</span>' : '');\n",
  "    h += '<button class=\"card act\"'+spine(t.urgency||'')+' onclick=\"openTrainee('+i+')\">'+",
  "\n",
  "      '<span class=\"bd\">'+\n",
  "      '<span class=\"hd\"><span class=\"h\">'+esc(t.name)+'</span>'+lvlChip(t.levelKey,t.level",
  ")+chip+'</span>'+\n",
  "      '<span class=\"m\">'+esc(t.phase||'no phase')+\n",
  "      (t.dayInPhase!=null?' &middot; day '+t.dayInPhase:'')+\n",
  "      ' &middot; '+esc(String(t.evalCount||0))+' evals'+\n",
  "      (t.evalAvg!=null?' &middot; avg '+t.evalAvg:'')+'</span>'+\n",
  "      (t.setupComplete?'':'<span class=\"flag\">Setup incomplete — tell Training Division</s",
  "pan>')+\n",
  "      '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "  });\n",
  "  if (d.forms && d.forms.length) h += sec('Blank forms')+formCards(d.forms);\n",
  "  paint(h);\n",
  "}\n",
  "function openTrainee(i){\n",
  "  var t = (BOOT.data.trainees||[])[i];\n",
  "  if (!t) return;\n",
  "  S.ctx = t; S.screen = 'trainee'; render();\n",
  "}\n",
  "function paintTraineeSheet(){\n",
  "  var t = S.ctx || {};\n",
  "  var h = hero('Tonight', t.name,\n",
  "    lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t.phase||'no phase set'))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back to Tonight</but",
  "ton>';\n",
  "  h += freshRow(t.freshness);\n",
  "  h += '<div class=\"panel\">'+\n",
  "       kv('Last evaluation', esc(t.lastEval))+\n",
  "       kv('Evals on file', esc(String(t.evalCount||0))+\n",
  "          (t.evalAvg!=null?' &middot; avg '+esc(String(t.evalAvg)):''))+\n",
  "       kv('Waiting on Division', esc(String(t.waitingCount||0)))+\n",
  "       kv('Setup', t.setupComplete ? '<span class=\"chip c-ok\">Complete</span>'\n",
  "                                   : '<span class=\"chip c-warn\">Incomplete</span>')+'</div",
  ">';\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+\n",
  "       '<span class=\"bd\"><span class=\"h\">Their whole record</span>'+\n",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  h += sec('File something for '+firstName(t.name));\n",
  "  h += (t.forms && t.forms.length)\n",
  "    ? formCards(t.forms)\n",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or t",
  "he registry could not reach them.</div>';\n",
  "  if (canWrite() && (BOOT.viewer.role === 'FTO' || BOOT.viewer.role === 'TRAINING_DIVISION",
  "')){\n",
  "    h += sec('Coaching note');\n",
  "    h += '<div class=\"panel\"><div class=\"lab\">Note for '+esc(firstName(t.name))+'</div>'+\n",
  "         '<textarea id=\"coach-note\" placeholder=\"What they need to hear. Goes on their rec",
  "ord in your name.\" '+\n",
  "         'oninput=\"syncCoachBtn()\"></textarea></div>'+\n",
  "         '<button class=\"btn\" id=\"coach-go\" disabled onclick=\"submitCoaching('+jsStr(t.nam",
  "e)+')\">File coaching</button>';\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>Where it goes</b>Straight into the tracker vault — same forms",
  ", same record. Field Training just opens the right door.</div>';\n",
  "  paint(h);\n",
  "  syncCoachBtn();\n",
  "}\n",
  "function syncCoachBtn(){\n",
  "  var why = (el('coach-note') && el('coach-note').value || '').trim();\n",
  "  if (el('coach-go')) el('coach-go').disabled = why.length < 8 || S.busy;\n",
  "}\n",
  "function submitCoaching(name){\n",
  "  if (S.busy) return;\n",
  "  var note = (el('coach-note') && el('coach-note').value || '').trim();\n",
  "  if (note.length < 8) { alert('Type the coaching note.'); return; }\n",
  "  S.busy = true;\n",
  "  var b = el('coach-go');\n",
  "  if (b) { b.disabled = true; b.textContent = 'Saving…'; }\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Coaching filed.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false;\n",
  "      if (b) b.textContent = 'File coaching';\n",
  "      syncCoachBtn();\n",
  "      alert(e.message||e);\n",
  "    })\n",
  "    .createCoachingV1(name, note);\n",
  "}\n",
  "function submitAssign(traineeName){\n",
  "  if (S.busy) return;\n",
  "  var sel = el('asg-fto');\n",
  "  var fto = sel && sel.value ? String(sel.value).trim() : '';\n",
  "  if (!fto) { alert('Pick a training officer.'); return; }\n",
  "  S.busy = true;\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Assigned.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false;\n",
  "      alert(e.message||e);\n",
  "    })\n",
  "    .assignFtoV1(traineeName, fto);\n",
  "}\n",
  "function firstName(n){ return String(n||'').split(/\\s+/)[0] || 'them'; }\n",
  "\n",
  "/* ---------------- division ---------------- */\n",
  "/* This screen answers one question before it does anything else: what needs a\n",
  "   decision from me. Everything after that is a count with a disclosure behind\n",
  "   it. Ten identical rows of names is not information, and a spreadsheet row\n",
  "   number is my diagnostics on somebody else's phone - neither belongs here. */\n",
  "function paintDivision(d){\n",
  "  var q = d.queue || [];\n",
  "  var missingBy = {};\n",
  "  (d.incomplete||[]).forEach(function(t){ missingBy[t.name] = t.missing; });\n",
  "\n",
  "  var flagged = [], seen = [], quiet = [];\n",
  "  (d.people||[]).forEach(function(t,i){\n",
  "    if (!(t.needs || missingBy[t.name])) { quiet.push({t:t,i:i}); return; }\n",
  "    if (t.ack) seen.push({t:t,i:i}); else flagged.push({t:t,i:i});\n",
  "  });\n",
  "\n",
  "  var ready = (d.releaseReady || []).filter(function(r){\n",
  "    return (d.people||[]).some(function(p){ return p.name === r.name && p.releaseReady; })",
  ";\n",
  "  });\n",
  "  var showReady = !!(ready.length && canWrite());\n",
  "\n",
  "  var h = hero('Waiting on you',\n",
  "    q.length ? (q.length===1 ? 'One decision' : q.length+' decisions')\n",
  "             : (showReady ? 'Clearance ready' : 'Queue clear'),\n",
  "    d.activeCount+' in training'+\n",
  "    (flagged.length ? ' &middot; '+flagged.length+' next moves' : ' &middot; no open moves",
  "')+\n",
  "    (showReady ? ' &middot; '+ready.length+' ready for the truck' : '')+\n",
  "    (seen.length ? ' &middot; '+seen.length+' holding' : ''));\n",
  "\n",
  "  if (d.mode !== 'STAGING' && d.mode !== 'LIVE')\n",
  "    h += '<div class=\"note n-warn\"><b>Read only</b>This portal is in '+esc(d.mode)+\n",
  "         ' mode, so sign-offs cannot be decided from here yet.</div>';\n",
  "\n",
  "  h += warnRow(d.warnings);\n",
  "\n",
  "  if (!q.length){\n",
  "    h += '<div class=\"note n-ok\"><b>Nothing waiting</b>When an evaluation needs your call,",
  " it shows here first.</div>';\n",
  "  } else {\n",
  "    var lead = q[0];\n",
  "    h += decisionLeadHtml(lead);\n",
  "    if (q.length > 1){\n",
  "      h += sec('Behind it', q.length - 1);\n",
  "      q.slice(1).forEach(function(x){ h += signoffCard(x); });\n",
  "    }\n",
  "    if (d.queueCount > q.length)\n",
  "      h += '<p class=\"sub\">Showing the oldest '+q.length+' of '+d.queueCount+'.</p>';\n",
  "  }\n",
  "\n",
  "  if (flagged.length){\n",
  "    h += sec('Next moves', flagged.length);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">Open each one — assign an FTO, fix the ",
  "record, or hold it with your words so it leaves this list.</p>';\n",
  "    flagged.forEach(function(p){ h += personCard(p.t, p.i, missingBy[p.t.name]); });\n",
  "  }\n",
  "\n",
  "  // Clearance sits with decisions — not after the holding parking lot.\n",
  "  if (showReady){\n",
  "    h += sec('Ready for the truck', ready.length);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">Phase 4 and every skill signed off. Cle",
  "ar them as an independent partner.</p>';\n",
  "    ready.forEach(function(r){\n",
  "      var idx = -1, person = null;\n",
  "      (d.people||[]).forEach(function(p,i){ if (p.name === r.name) { idx = i; person = p; ",
  "} });\n",
  "      if (idx < 0) return;\n",
  "      h += '<button class=\"card act\"'+spine('gold')+' onclick=\"openPerson('+idx+')\">'+\n",
  "           '<span class=\"bd\"><span class=\"hd\"><span class=\"h\">'+esc(r.name)+'</span>'+\n",
  "           lvlChip((person&&person.levelKey), r.level)+'</span>'+\n",
  "           '<span class=\"m\">'+esc(String(r.signed||0))+' / '+esc(String(r.total||0))+\n",
  "           ' skills signed · clear for the truck</span></span>'+\n",
  "           '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    });\n",
  "  }\n",
  "\n",
  "  if (seen.length){\n",
  "    h += sec('Seen, and holding', seen.length);\n",
  "    seen.forEach(function(p){ h += personCard(p.t, p.i, missingBy[p.t.name]); });\n",
  "  }\n",
  "\n",
  "  if ((d.people||[]).length){\n",
  "    h += sec('Anyone else', (d.people||[]).length);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">'+quiet.length+' of '+d.people.length+\n",
  "         ' have nothing outstanding. Pick a name to open their record.</p>';\n",
  "    h += picker('pick-person', 'Open a trainee\\u2026', (d.people||[]).map(function(t,i){\n",
  "      return { value: String(i),\n",
  "               label: t.name + ' \\u2014 ' + (t.phase || 'no phase set') +\n",
  "                      (t.needs ? ' \\u00b7 needs a look' : '') };\n",
  "    }), 'pickPerson');\n",
  "  }\n",
  "\n",
  "  if (d.forms && d.forms.length) h += sec('File something')+formCards(d.forms);\n",
  "\n",
  "  var fw = d.formWaiting || {};\n",
  "  if ((fw.waiting || 0) > 0){\n",
  "    h += sec('Skills log & forms waiting', fw.waiting);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">'+\n",
  "         (fw.skillsWaiting ? fw.skillsWaiting+' look like skills logs · ' : '')+\n",
  "         'Open → clear from this desk (with a reason) or leave for tracker ingest.</p>';\n",
  "    h += picker('pick-formwait', fw.waiting+' waiting\\u2026', (fw.list||[]).map(function(x",
  ",i){\n",
  "      return { value: String(i),\n",
  "               label: (x.kind==='skills'?'Skills · ':'') + (x.trainee || 'unnamed') +\n",
  "                      ' \\u2014 ' + (x.when || x.stamp || 'no date') +\n",
  "                      (x.by ? ' \\u00b7 ' + x.by : '') };\n",
  "    }), 'pickFormWait');\n",
  "  }\n",
  "\n",
  "  var closed = d.closedPeople || [];\n",
  "  if (closed.length){\n",
  "    h += sec('Released — prior reports', closed.length);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">Pull a printable report (Save as PDF fr",
  "om the print dialog).</p>';\n",
  "    h += picker('pick-closed', 'Report for a released trainee\\u2026', closed.map(function(",
  "t,i){\n",
  "      return { value: String(i),\n",
  "               label: t.name + ' \\u2014 ' + (t.status || 'Closed') +\n",
  "                      (t.level ? ' \\u00b7 ' + t.level : '') };\n",
  "    }), 'pickClosedReport');\n",
  "  }\n",
  "\n",
  "  if (canWrite() && BOOT.viewer.role === 'TRAINING_DIVISION'){\n",
  "    h += '<button class=\"more\" style=\"margin-top:14px\" onclick=\"syncMatrixEvidence()\">'+\n",
  "         'Sync matrix from evidence — logged skills stuck IN PROGRESS</button>';\n",
  "    h += '<button class=\"more\" style=\"margin-top:8px\" onclick=\"refreshQueue()\">'+\n",
  "         'Refresh queue from matrix — READY skills missing from OPEN</button>';\n",
  "  }\n",
  "\n",
  "  // Enroll last — not competing with decisions or clearance.\n",
  "  if (d.canAddTrainee) {\n",
  "    h += '<button class=\"more\" style=\"margin-top:18px\" onclick=\"openAddTrainee()\">Bring so",
  "meone on — new trainee</button>';\n",
  "  }\n",
  "\n",
  "  // Same-day duplicates are a human call — keep them visible but quiet, at the end.\n",
  "  var house = housekeeping(d);\n",
  "  if (house) h += sec('Settle')+house;\n",
  "\n",
  "  h += deskDetails(d);\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "/* Approving / returning writes a decision into the queue. Against a tracker\n",
  "   this portal cannot write, the item is shown and the decision is recorded\n",
  "   where it has always been recorded. */\n",
  "function decisionLeadHtml(q){\n",
  "  var left = (q.hoursLeft != null) ? q.hoursLeft : 72;\n",
  "  var pct = (q.clockPct != null) ? q.clockPct : 100;\n",
  "  var h = '<div class=\"decision\"><div class=\"top\">'+\n",
  "    '<div style=\"width:5px;background:var(--'+esc((BOOT.data.people||[]).reduce(function(k",
  ",p){\n",
  "      return normMatch(p.name,q.trainee)?p.levelKey:k;},'gold'))+');flex:none;margin:-15px",
  " 0 0 -16px;align-self:stretch;border-radius:11px 0 0 0\"></div>'+\n",
  "    '<div class=\"body\" style=\"padding-left:12px;flex:1\">'+\n",
  "    '<div style=\"display:flex;gap:12px;align-items:flex-start\">'+\n",
  "    '<div style=\"flex:1;min-width:0\">'+\n",
  "    '<div class=\"lab\" style=\"margin:0\">Evidence met the bar. The call is yours.</div>'+\n",
  "    '<div class=\"h\" style=\"font-size:1.44rem;margin-top:2px\">'+esc(q.skill)+'</div>'+\n",
  "    '<div class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</div></div>'+\n",
  "    clockHtml(left, pct)+\n",
  "    '</div>';\n",
  "  if (q.bars && q.bars.length){\n",
  "    h += '<div style=\"margin-top:14px;padding-top:12px;border-top:1px solid var(--line)\">'",
  "+\n",
  "         '<div class=\"lab\">Evidence against the catalog</div>'+barsHtml(q.bars)+'</div>';\n",
  "  } else if (q.evidence){\n",
  "    h += '<div style=\"margin-top:12px;font-size:.9rem;color:var(--ink-2)\">'+esc(q.evidence",
  ")+'</div>';\n",
  "  }\n",
  "  if (q.recommend){\n",
  "    h += '<div class=\"note n-info\" style=\"margin-top:12px\"><b>FTO recommendation</b>'+esc(",
  "q.recommend)+'</div>';\n",
  "  }\n",
  "  h += '</div></div>';\n",
  "  if (canWrite() && !q.from){\n",
  "    h += '<div style=\"padding:0 16px 16px\">'+\n",
  "         '<button class=\"btn\" onclick=\"openSignoff('+q.row+','+jsStr(q.trainee)+','+\n",
  "         jsStr(q.skill)+','+jsStr(q.evidence)+','+jsStr(q.requestId||'')+')\">Decide</butto",
  "n>'+\n",
  "         '<div class=\"next\" style=\"margin-top:10px\"><b>You see the record before you write",
  " it</b>'+\n",
  "         'Approve or return — both require your words. Field Training writes the permanent",
  " log.</div></div>';\n",
  "  } else {\n",
  "    h += '<div style=\"padding:0 16px 16px\"><div class=\"flag\" style=\"--accent:var(--warn)\">",
  "'+\n",
  "         (q.from ? 'This row lives in '+esc(q.from)+'. Decide there.'\n",
  "                 : 'Read only — switch to LIVE to decide here.')+'</div></div>';\n",
  "  }\n",
  "  return h + '</div>';\n",
  "}\n",
  "function normMatch(a,b){\n",
  "  return String(a||'').toLowerCase().replace(/\\s+/g,'')===String(b||'').toLowerCase().repl",
  "ace(/\\s+/g,'');\n",
  "}\n",
  "function signoffCard(q){\n",
  "  if (canWrite() && !q.from){\n",
  "    return '<button class=\"card act\"'+spine('gold')+' onclick=\"openSignoff('+q.row+','+jsS",
  "tr(q.trainee)+','+\n",
  "      jsStr(q.skill)+','+jsStr(q.evidence)+','+jsStr(q.requestId||'')+')\">'+\n",
  "      '<span class=\"bd\"><span class=\"h\">'+esc(q.skill)+'</span>'+\n",
  "      '<span class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+\n",
  "      (q.hoursLeft!=null?' &middot; '+q.hoursLeft+'h left':'')+'</span>'+\n",
  "      (q.evidence ? '<span class=\"m\" style=\"color:var(--ink-2)\">'+esc(short(q.evidence, 64",
  "))+'</span>' : '')+\n",
  "      '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "  }\n",
  "  return '<div class=\"card\"'+spine('soon')+'><div class=\"h\">'+esc(q.skill)+'</div>'+\n",
  "    '<div class=\"m\">'+esc(q.trainee)+' &middot; ready '+esc(q.since)+'</div>'+\n",
  "    '<div class=\"m\" style=\"margin-top:7px\">'+esc(q.evidence)+'</div>'+\n",
  "    '<div class=\"flag\" style=\"--accent:var(--warn)\">'+\n",
  "    (q.from ? 'This row is in '+esc(q.from)+', not this book. Record the decision there.'\n",
  "            : 'Read only — switch to LIVE to decide from Field Training.')+'</div></div>';",
  "\n",
  "}\n",
  "\n",
  "/* One row per person, and the row says what it wants. The index is the one\n",
  "   into BOOT.data.people, not into whichever list this card came from. */\n",
  "function personCard(t, i, missing){\n",
  "  var why = missing ? 'missing '+missing : String(t.needs || '');\n",
  "  var hard = why && urgentNeedV(why);\n",
  "  var held = !!t.ack;\n",
  "  return '<button class=\"card act\"'+spine(!why || held ? '' : (hard ? 'due' : 'soon'))+\n",
  "    ' onclick=\"openPerson('+i+')\">'+\n",
  "    '<span class=\"bd\">'+\n",
  "    '<span class=\"hd\"><span class=\"h\">'+esc(t.name)+'</span>'+lvlChip(t.levelKey,t.level)+",
  "'</span>'+\n",
  "    '<span class=\"m\">'+esc(t.phase||'no phase set')+' &middot; '+esc(short(t.fto)||'no tra",
  "ining officer')+'</span>'+\n",
  "    (why ? '<span class=\"flag\"'+(held ? ' style=\"--accent:var(--ink-3)\"' : '')+'>'+\n",
  "           esc(t.nextMove && t.nextMove.title ? t.nextMove.title : cap(why))+'</span>' : '",
  "')+\n",
  "    (held ? '<span class=\"m\">Seen '+esc(t.ack.when)+' &middot; back on the list '+\n",
  "            esc(t.ack.until)+'</span>' : '')+\n",
  "    (t.nextMove && t.nextMove.blurb && !held ? '<span class=\"m\">'+esc(t.nextMove.blurb)+'<",
  "/span>' : '')+\n",
  "    '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "}\n",
  "function urgentNeedV(w){\n",
  "  return /no one|no training officer|has left|sentence, not a name|not responding|remediat",
  "ion|concern|never evaluated/i.test(w);\n",
  "}\n",
  "function cap(s){ s = String(s==null?'':s); return s.charAt(0).toUpperCase()+s.slice(1); }\n",
  "function short(s, n){ s = String(s==null?'':s).trim(); n = n || 44;\n",
  "  return s.length > n ? s.slice(0,n)+'…' : s; }\n",
  "\n",
  "/* Data-quality and vault chores. Real, but not the job of the first screen.\n",
  "   Kept behind a quiet disclosure so Waiting on you stays human. */\n",
  "function housekeeping(d){\n",
  "  var subs = d.duplicateSubs || [], dupes = d.duplicates || [];\n",
  "  if (!subs.length && !dupes.length) return '';\n",
  "  var h = '';\n",
  "  if (subs.length){\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">'+subs.length+' same-day '+\n",
  "         (subs.length===1?'submission pair':'submission pairs')+\n",
  "         ' to settle — both stay on file; open a pair and say how it stands.</p>';\n",
  "    h += picker('pick-sameday', subs.length+' to settle\\u2026', subs.map(function(x,i){\n",
  "      return { value: String(i),\n",
  "               label: x.trainee + ' \\u2014 ' + x.source + (x.group ? ' \\u00b7 ' + x.group ",
  ": '') +\n",
  "                      ' \\u00b7 ' + x.when + ' (' + x.count + ')' };\n",
  "    }), 'pickSettle');\n",
  "  }\n",
  "  if (dupes.length){\n",
  "    h += '<div class=\"note n-warn\"><b>Possible duplicate '+(dupes.length===1?'name':'names",
  "')+\n",
  "         '</b>'+esc(dupes.join(', '))+' on the trainee master.</div>';\n",
  "  }\n",
  "  return h;\n",
  "}\n",
  "\n",
  "/** Folded machinery: staged decisions, retired forms, mode. Not in the hero. */\n",
  "function deskDetails(d){\n",
  "  var staged = d.staged || [];\n",
  "  var retired = d.retiredForms || [];\n",
  "  if (!staged.length && !retired.length && !d.mode) return '';\n",
  "\n",
  "  var open = !!S.showDesk;\n",
  "  var bits = [];\n",
  "  if (staged.length) bits.push(staged.length+' decided');\n",
  "  if (retired.length) bits.push(retired.length+' form note'+(retired.length===1?'':'s'));\n",
  "  var label = bits.length ? bits.join(' · ') : 'Desk details';\n",
  "\n",
  "  var h = '<button class=\"more\" style=\"margin-top:22px\" onclick=\"S.showDesk=!S.showDesk;re",
  "nder()\">'+\n",
  "          (open ? 'Hide' : 'Show')+' '+label+'</button>';\n",
  "  if (!open) return h;\n",
  "\n",
  "  if (staged.length){\n",
  "    h += '<p class=\"sub\">Open queue rows that already have a decision filled (legacy / hal",
  "f-finished). '+\n",
  "         'Finish or clear them from Field Training when you can write.</p>';\n",
  "    h += picker('pick-staged', staged.length+' half-finished\\u2026', staged.map(function(x",
  "){\n",
  "      return { value: x.trainee,\n",
  "               label: x.trainee + ' \\u2014 ' + x.skill + ' \\u00b7 ' + x.decision };\n",
  "    }), 'pickRecord');\n",
  "  }\n",
  "  if (retired.length){\n",
  "    h += '<p class=\"sub\">Old form links still accepting answers somewhere. Close them in D",
  "rive when you can — '+\n",
  "         'not urgent for today&rsquo;s decisions.</p>';\n",
  "    retired.forEach(function(f){\n",
  "      h += '<div class=\"note n-info\"><b>'+esc(f.title)+'</b>'+esc(f.why||'Retired; still o",
  "pen somewhere.')+'</div>';\n",
  "    });\n",
  "  }\n",
  "  h += '<div class=\"panel\" style=\"margin-top:10px\">'+\n",
  "    kv('Mode','<span class=\"chip c-mute\">'+esc(d.mode)+'</span>')+\n",
  "    kv('In training', d.activeCount+' <span class=\"chip c-mute\">'+d.closedCount+' cleared<",
  "/span>')+\n",
  "    kv('Form links', d.formLinks ? '<span class=\"chip c-ok\">On</span>'\n",
  "                                 : '<span class=\"chip c-warn\">Off</span>')+\n",
  "    '</div>';\n",
  "  return h;\n",
  "}\n",
  "\n",
  "function openPerson(i){\n",
  "  var t = (BOOT.data.people||[])[i];\n",
  "  if (!t) return;\n",
  "  S.ctx = t; S.screen = 'person'; render();\n",
  "}\n",
  "function paintPersonSheet(){\n",
  "  var t = S.ctx || {};\n",
  "  var clear = t.clearance || {};\n",
  "  var h = hero('Trainee record', t.name,\n",
  "    lvlChip(t.levelKey,t.level)+' &nbsp; '+esc(t.phase||'no phase set'))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>';\n",
  "\n",
  "  h += '<div class=\"panel\">'+\n",
  "       '<div class=\"lab\">Where they are</div>'+\n",
  "       phaseTrackHtml(t.phase)+\n",
  "       (t.dayInPhase!=null\n",
  "         ? '<div class=\"m\" style=\"margin-top:8px\">Day '+esc(t.dayInPhase)+' in this phase<",
  "/div>'\n",
  "         : '')+\n",
  "       '</div>';\n",
  "\n",
  "  if (canWrite() && BOOT.viewer.role === 'TRAINING_DIVISION'){\n",
  "    h += sec('Lifecycle');\n",
  "    if (t.canAdvance && t.nextPhase){\n",
  "      h += '<button class=\"card act\"'+spine('gold')+' onclick=\"openAdvance()\">'+\n",
  "           '<span class=\"bd\"><span class=\"h\">Advance to '+esc(t.nextPhase)+'</span>'+\n",
  "           '<span class=\"m\">Type why. Phase and phase-start date update together.</span></",
  "span>'+\n",
  "           '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    }\n",
  "\n",
  "    if (t.releaseReady){\n",
  "      h += '<div class=\"note n-ok\"><b>Ready for the truck</b>'+\n",
  "           esc(String(clear.signed||0))+' / '+esc(String(clear.total||0))+\n",
  "           ' skills signed off. Clear them as an independent partner.</div>';\n",
  "      h += '<button class=\"card act\"'+spine('due')+' onclick=\"openRelease()\">'+\n",
  "           '<span class=\"bd\"><span class=\"h\">Clear '+esc(firstName(t.name)||'trainee')+' f",
  "or the truck</span>'+\n",
  "           '<span class=\"m\">Successful completion — independent partner on a truck.</span>",
  "</span>'+\n",
  "           '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    } else if (t.phase4){\n",
  "      h += '<div class=\"note n-warn\"><b>Not ready for the truck yet</b>Phase 4, but skills",
  " or sign-offs are still open:</div>';\n",
  "      (clear.gaps||[]).slice(0,8).forEach(function(g){\n",
  "        h += '<div class=\"m\" style=\"margin:0 0 6px 2px\">· '+esc(g)+'</div>';\n",
  "      });\n",
  "      h += '<div class=\"next\" style=\"margin-top:10px\"><b>Clearance stays closed</b>Finish ",
  "those first. Field Training will not clear someone who still has open skills.</div>';\n",
  "    } else if (!t.canAdvance){\n",
  "      h += '<div class=\"note n-info\"><b>Phase</b>Fix the phase on the master before advanc",
  "ing or clearing.</div>';\n",
  "    }\n",
  "  }\n",
  "\n",
  "  /* The card you tapped said why. Losing the reason on the way in is how a\n",
  "     screen becomes a dead end: three problems named on one page and nothing\n",
  "     to do about any of them on the next. */\n",
  "  if (t.needs){\n",
  "    if (t.ack){\n",
  "      h += '<div class=\"note n-info\"><b>Seen</b>'+esc(cap(t.needs))+'.<br>'+\n",
  "           esc(t.ack.by)+' on '+esc(t.ack.when)+': &ldquo;'+esc(t.ack.note)+'&rdquo;<br>'+",
  "\n",
  "           'Back on the list '+esc(t.ack.until)+' unless something changes first.</div>';\n",
  "    } else {\n",
  "      h += '<div class=\"note '+(urgentNeedV(t.needs)?'n-stop':'n-warn')+'\">'+\n",
  "           '<b>Why this is flagged</b>'+esc(cap(t.needs))+'.</div>';\n",
  "    }\n",
  "    if (canWrite() && BOOT.viewer.role === 'TRAINING_DIVISION'){\n",
  "      h += '<button class=\"card act\"'+spine('gold')+' onclick=\"openAck('+jsStr(t.name)+','",
  "+\n",
  "           jsStr(t.needs)+')\"><span class=\"bd\">'+\n",
  "           '<span class=\"h\">'+(t.ack ? 'Say something else about it' : 'I have seen this')",
  "+'</span>'+\n",
  "           '<span class=\"m\">Record what you are doing, in your words. It does not clear th",
  "e '+\n",
  "           'finding &mdash; it moves it off the list for as long as you say.</span></span>",
  "'+\n",
  "           '<span class=\"go\">&rsaquo;</span></button>';\n",
  "    }\n",
  "  }\n",
  "  h += freshRow(t.freshness);\n",
  "  h += '<div class=\"panel\">'+kv('Training officer', esc(t.fto||'not assigned'))+\n",
  "       kv('Shift', esc(t.shift||'not set'))+'</div>';\n",
  "\n",
  "  h += '<button class=\"btn ghost\" style=\"margin-top:10px\" onclick=\"openTraineeReport('+jsS",
  "tr(t.name)+')\">'+\n",
  "       'Print / save PDF report</button>';\n",
  "\n",
  "  if (t.skills && t.skills.length){\n",
  "    var withDiv = [], building = [], signed = [];\n",
  "    t.skills.forEach(function(s){\n",
  "      if (s.signed) signed.push(s);\n",
  "      else if (s.readiness === 'READY FOR VALIDATION') withDiv.push(s);\n",
  "      else building.push(s);\n",
  "    });\n",
  "    h += sec('Skills on the matrix', t.skills.length);\n",
  "    h += '<p class=\"sub\" style=\"margin-bottom:9px\">'+\n",
  "         signed.length+' signed · '+withDiv.length+' with Division · '+\n",
  "         building.length+' building</p>';\n",
  "    function skillRow(s){\n",
  "      var tag = s.signed ? 'Signed' :\n",
  "        (s.readiness === 'READY FOR VALIDATION' ? 'With Division' : (s.readiness || 'Build",
  "ing'));\n",
  "      var tagCls = s.signed ? 'c-ok' : (s.readiness === 'READY FOR VALIDATION' ? 'c-warn' ",
  ": 'c-mute');\n",
  "      return '<div class=\"card\"><div class=\"hd\"><span class=\"h\">'+esc(s.skill)+'</span>'+\n",
  "        '<span class=\"chip '+tagCls+'\">'+esc(tag)+'</span></div>'+\n",
  "        (s.bars && s.bars.length ? barsHtml(s.bars) : '')+'</div>';\n",
  "    }\n",
  "    withDiv.forEach(function(s){ h += skillRow(s); });\n",
  "    building.slice(0, 8).forEach(function(s){ h += skillRow(s); });\n",
  "    if (building.length > 8) h += '<p class=\"sub\">+ '+(building.length-8)+' more building<",
  "/p>';\n",
  "    if (signed.length && !withDiv.length && building.length <= 8){\n",
  "      h += '<button class=\"more\" onclick=\"S.showSignedSkills=!S.showSignedSkills;render()\"",
  ">'+\n",
  "           (S.showSignedSkills?'Hide':'Show')+' '+signed.length+' signed</button>';\n",
  "      if (S.showSignedSkills) signed.forEach(function(s){ h += skillRow(s); });\n",
  "    }\n",
  "  }\n",
  "\n",
  "  if (canWrite() && BOOT.viewer.role === 'TRAINING_DIVISION' && (BOOT.data.canAssignFto !=",
  "= false)){\n",
  "    var officers = BOOT.data.officers || [];\n",
  "    if (officers.length){\n",
  "      h += sec('Who trains them');\n",
  "      h += '<div class=\"panel\"><div class=\"lab\">Assigned FTO</div>'+\n",
  "           '<select class=\"pick\" id=\"asg-fto\" aria-label=\"Assigned FTO\">'+\n",
  "           '<option value=\"\">Pick a training officer\\u2026</option>';\n",
  "      officers.forEach(function(o){\n",
  "        h += '<option value=\"'+esc(o.name)+'\"'+(normMatch(o.name,t.fto)?' selected':'')+'>",
  "'+\n",
  "             esc(o.name)+'</option>';\n",
  "      });\n",
  "      h += '</select></div>'+\n",
  "           '<button class=\"btn\" onclick=\"submitAssign('+jsStr(t.name)+')\">Save assignment<",
  "/button>';\n",
  "    }\n",
  "  }\n",
  "  h += '<button class=\"card act\" onclick=\"openRecord('+jsStr(t.name)+')\">'+\n",
  "       '<span class=\"bd\"><span class=\"h\">Their whole record</span>'+\n",
  "       '<span class=\"m\">Every submission on file, most recent first.</span></span>'+\n",
  "       '<span class=\"go\">&rsaquo;</span></button>';\n",
  "  h += sec('File something for '+firstName(t.name));\n",
  "  h += (t.forms && t.forms.length)\n",
  "    ? formCards(t.forms)\n",
  "    : '<div class=\"note n-info\"><b>No forms available</b>Form links are switched off, or t",
  "he registry could not reach them.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "function openAdvance(){\n",
  "  var t = S.ctx || {};\n",
  "  if (!t.name || !t.nextPhase) return;\n",
  "  S.screen = 'advance'; render();\n",
  "}\n",
  "function paintAdvance(){\n",
  "  var t = S.ctx || {};\n",
  "  var h = hero('Advance', t.name,\n",
  "    esc(t.phase||'?')+' → '+esc(t.nextPhase||'?'))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'person\\';render()\">&larr; Back</button>'+\n",
  "    '<div class=\"note n-info\"><b>What this writes</b>CURRENT PHASE and PHASE START DATE on",
  " the trainee master, '+\n",
  "    'plus your reason on the audit trail. One step only — Phase 4 does not auto-clear them",
  ".</div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">Why you are advancing them</div>'+\n",
  "    '<textarea id=\"adv-why\" placeholder=\"Goes on the permanent record in your name. No def",
  "ault wording.\" '+\n",
  "    'oninput=\"syncLifeBtns(\\'adv\\')\"></textarea></div>'+\n",
  "    '<button class=\"btn\" id=\"adv-go\" disabled onclick=\"submitAdvance()\">Advance to '+\n",
  "    esc(t.nextPhase||'')+'</button>';\n",
  "  paint(h);\n",
  "  syncLifeBtns('adv');\n",
  "}\n",
  "function submitAdvance(){\n",
  "  if (S.busy) return;\n",
  "  var why = (el('adv-why') && el('adv-why').value || '').trim();\n",
  "  if (why.length < 8) { alert('Type why you are advancing them.'); return; }\n",
  "  S.busy = true;\n",
  "  var b = el('adv-go');\n",
  "  if (b) { b.disabled = true; b.textContent = 'Saving…'; }\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Advanced.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false;\n",
  "      if (b) { b.textContent = 'Advance to '+(S.ctx.nextPhase||''); }\n",
  "      syncLifeBtns('adv');\n",
  "      alert(e.message||e);\n",
  "    })\n",
  "    .advanceTraineePhaseV1(S.ctx.name, why);\n",
  "}\n",
  "\n",
  "function openRelease(){\n",
  "  var t = S.ctx || {};\n",
  "  if (!t.name) return;\n",
  "  S.screen = 'release'; render();\n",
  "}\n",
  "function paintRelease(){\n",
  "  var t = S.ctx || {};\n",
  "  var h = hero('Clear for the truck', t.name, esc(t.phase||'no phase')+' · '+esc(t.level||",
  "''))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'person\\';render()\">&larr; Back</button>'+\n",
  "    '<div class=\"note n-ok\"><b>Independent partner</b>They finished training. Status becom",
  "es Cleared / Independent. '+\n",
  "    'Open skill requests cancel. Form Trainee lists drop their name. Your reason is archiv",
  "ed with who and when.</div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">Why they are cleared</div>'+\n",
  "    '<textarea id=\"rel-why\" placeholder=\"Completed all phases and required skills — cleare",
  "d to ride as an independent partner.\" '+\n",
  "    'oninput=\"syncLifeBtns(\\'rel\\')\"></textarea></div>'+\n",
  "    '<button class=\"btn\" id=\"rel-go\" disabled onclick=\"submitRelease()\">Clear for independ",
  "ent partner duty</button>';\n",
  "  paint(h);\n",
  "  syncLifeBtns('rel');\n",
  "}\n",
  "function submitRelease(){\n",
  "  if (S.busy) return;\n",
  "  var why = (el('rel-why') && el('rel-why').value || '').trim();\n",
  "  if (why.length < 8) { alert('Type why they are cleared for independent partner duty.'); ",
  "return; }\n",
  "  if (!confirm('Clear '+((S.ctx&&S.ctx.name)||'this trainee')+' for independent partner du",
  "ty? This cannot be undone from Field Training.')) return;\n",
  "  S.busy = true;\n",
  "  var b = el('rel-go');\n",
  "  if (b) { b.disabled = true; b.textContent = 'Clearing…'; }\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Cleared for independent partner duty.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false;\n",
  "      if (b) { b.textContent = 'Clear for independent partner duty'; }\n",
  "      syncLifeBtns('rel');\n",
  "      alert(e.message||e);\n",
  "    })\n",
  "    .releaseTraineeV1(S.ctx.name, why);\n",
  "}\n",
  "\n",
  "function syncLifeBtns(kind){\n",
  "  var id = kind === 'rel' ? 'rel-why' : 'adv-why';\n",
  "  var btn = kind === 'rel' ? 'rel-go' : 'adv-go';\n",
  "  var why = (el(id) && el(id).value || '').trim();\n",
  "  if (el(btn)) el(btn).disabled = why.length < 8 || S.busy;\n",
  "}\n",
  "function openAck(name, finding){\n",
  "  S.ctx = { name:name, finding:finding, from:S.screen };\n",
  "  S.screen = 'ack'; render();\n",
  "}\n",
  "function paintAck(){\n",
  "  var c = S.ctx || {};\n",
  "  paint(hero('Seen by you', c.name, esc(cap(c.finding||'')))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\''+(c.from||'main')+'\\';render()\">&larr; Back",
  "</button>'+\n",
  "    '<div class=\"note n-info\"><b>This does not clear it</b>Nothing here changes the record",
  " or '+\n",
  "    'the finding. It records that you saw it, in your words, and holds it off the list for",
  " as '+\n",
  "    'long as you ask. When that runs out it is back exactly as it is now.</div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">What are you doing about it</div>'+\n",
  "    '<textarea id=\"ackwhy\" placeholder=\"Goes on the record in your name. An acknowledgment",
  " with '+\n",
  "    'nothing in it is how a problem gets buried.\"></textarea></div>'+\n",
  "    '<div class=\"panel\"><div class=\"lab\">Hold it off the list for</div>'+\n",
  "    picker('ackdays', '', [\n",
  "      { value:'3',  label:'3 days'  },\n",
  "      { value:'7',  label:'7 days'  },\n",
  "      { value:'14', label:'14 days' },\n",
  "      { value:'30', label:'30 days — the longest a hold can be' }\n",
  "    ], 'pickDays', String(S.ackDays || 7))+'</div>'+\n",
  "    '<button class=\"btn\" id=\"ackgo\" onclick=\"sendAck()\">Record it</button>'+\n",
  "    '<div class=\"next\"><b>Why it comes back</b>A hold that never expires is a way to hide ",
  "'+\n",
  "    'something permanently. This one runs out, and the finding returns unchanged.</div>');",
  "\n",
  "}\n",
  "function pickDays(v){ S.ackDays = Number(v) || 7; }\n",
  "function sendAck(){\n",
  "  if (S.busy) return;\n",
  "  var why = el('ackwhy').value.trim();\n",
  "  if (why.length < 8) { alert('Say what you are doing about it.'); return; }\n",
  "  S.busy = true; var b = el('ackgo'); b.disabled = true; b.textContent = 'Recording…';\n",
  "  google.script.run.withSuccessHandler(function(){ S.busy=false; S.screen='main'; reload()",
  "; })\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.disabled=false; b.textContent='Record",
  " it';\n",
  "      alert(e.message||e); })\n",
  "    .acknowledgeFindingV1(S.ctx.name, S.ctx.finding, why, S.ackDays || 7);\n",
  "}\n",
  "\n",
  "function openSignoff(row,trainee,skill,evidence,requestId){\n",
  "  var q = (BOOT.data.queue||[]).filter(function(x){ return Number(x.row)===Number(row); })",
  "[0] || {};\n",
  "  S.ctx = {\n",
  "    row:row, trainee:trainee, skill:skill, evidence:evidence, requestId:requestId||'',\n",
  "    bars: q.bars || null, recommend: q.recommend || '', hoursLeft: q.hoursLeft, clockPct: ",
  "q.clockPct\n",
  "  };\n",
  "  S.screen = 'signoff'; render();\n",
  "}\n",
  "\n",
  "/* ---------------- bring someone on ---------------- */\n",
  "function openAddTrainee(){\n",
  "  S.screen = 'addTrainee'; render();\n",
  "}\n",
  "function paintAddTrainee(){\n",
  "  var d = BOOT.data || {};\n",
  "  var officers = d.officers || [];\n",
  "  var h = hero('Bring someone on', 'New trainee',\n",
  "    'They land in training and on the forms already in service.')+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>';\n",
  "\n",
  "  h += '<div class=\"panel\">'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Full name</div>'+\n",
  "    '<input id=\"at-name\" autocomplete=\"name\" placeholder=\"Casey Holt\" /></div>'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Work email</div>'+\n",
  "    '<input id=\"at-email\" type=\"email\" autocomplete=\"email\" placeholder=\"casey.holt@exampl",
  "e.org\" />'+\n",
  "    '<div class=\"hint\">How they sign into Field Training.</div></div>'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Level</div>'+\n",
  "    '<select id=\"at-level\">'+\n",
  "    '<option value=\"\">Pick one…</option>'+\n",
  "    '<option value=\"EMT\">EMT</option>'+\n",
  "    '<option value=\"Advanced EMT\">Advanced EMT</option>'+\n",
  "    '<option value=\"Paramedic\">Paramedic</option>'+\n",
  "    '</select>'+\n",
  "    '<div class=\"hint\">Chooses which skills log their FTO gets.</div></div>'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Starting phase</div>'+\n",
  "    '<select id=\"at-phase\">'+\n",
  "    '<option value=\"Phase 1\">Phase 1</option>'+\n",
  "    '<option value=\"Phase 2\">Phase 2</option>'+\n",
  "    '<option value=\"Phase 3\">Phase 3</option>'+\n",
  "    '<option value=\"Phase 4\">Phase 4</option>'+\n",
  "    '</select></div>'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Training officer</div>'+\n",
  "    '<select id=\"at-fto\"><option value=\"\">Assign later…</option>';\n",
  "  officers.forEach(function(o){\n",
  "    h += '<option value=\"'+esc(o.name)+'\">'+esc(o.name)+'</option>';\n",
  "  });\n",
  "  h += '</select>'+\n",
  "    (officers.length ? '' :\n",
  "      '<div class=\"hint\">No active FTOs on the roster yet. Add an FTO first, or leave blan",
  "k.</div>')+\n",
  "    '</div>'+\n",
  "    '<div class=\"field\"><div class=\"lab\">Entry profile (optional)</div>'+\n",
  "    '<input id=\"at-entry\" maxlength=\"1\" placeholder=\"A\" style=\"max-width:4.5rem;text-trans",
  "form:uppercase\" />'+\n",
  "    '<div class=\"hint\">Letter from the ENTRY PROFILE KEY on the master.</div></div>'+\n",
  "    '</div>';\n",
  "\n",
  "  h += '<button class=\"btn\" id=\"at-go\" onclick=\"submitAddTrainee()\">Add to Field Training<",
  "/button>'+\n",
  "    '<div class=\"next\"><b>What this does</b>Writes one row on the trainee master and refre",
  "shes '+\n",
  "    'Trainee dropdowns on the Google Forms you already use. No new form is created.</div>'",
  "+\n",
  "    '<div class=\"next\"><b>Afterward</b>Open the tracker once if their skill matrix rows ne",
  "ed a rebuild. '+\n",
  "    'Evaluations and skills logs work as soon as the form lists refresh.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function submitAddTrainee(){\n",
  "  if (S.busy) return;\n",
  "  var name = (el('at-name') && el('at-name').value || '').trim();\n",
  "  var email = (el('at-email') && el('at-email').value || '').trim();\n",
  "  var level = (el('at-level') && el('at-level').value || '').trim();\n",
  "  var phase = (el('at-phase') && el('at-phase').value || 'Phase 1').trim();\n",
  "  var fto = (el('at-fto') && el('at-fto').value || '').trim();\n",
  "  var entry = (el('at-entry') && el('at-entry').value || '').trim().toUpperCase();\n",
  "  if (!name) { alert('Type their full name.'); return; }\n",
  "  if (!email || email.indexOf('@') < 1) { alert('Type a work email.'); return; }\n",
  "  if (!level) { alert('Pick a level.'); return; }\n",
  "\n",
  "  S.busy = true;\n",
  "  var b = el('at-go');\n",
  "  if (b) { b.disabled = true; b.textContent = 'Adding…'; }\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || (name + ' is in training.'));\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false;\n",
  "      if (b) { b.disabled = false; b.textContent = 'Add to Field Training'; }\n",
  "      alert(e.message || e);\n",
  "    })\n",
  "    .addTraineeV1({ name: name, email: email, level: level, phase: phase,\n",
  "                    fto: fto, entry: entry });\n",
  "}\n",
  "\n",
  "function paintSignoff(){\n",
  "  var c = S.ctx || {};\n",
  "  var h = hero('The decision', c.skill, esc(c.trainee))+\n",
  "    '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</button>';\n",
  "  if (c.hoursLeft != null){\n",
  "    h += '<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:12px\">'+\n",
  "         clockHtml(c.hoursLeft, c.clockPct||0)+\n",
  "         '<div class=\"m\">Hours left on the 72-hour clock before this goes stale on the des",
  "k.</div></div>';\n",
  "  }\n",
  "  if (c.bars && c.bars.length){\n",
  "    h += '<div class=\"panel\"><div class=\"lab\">Evidence against the catalog</div>'+barsHtml",
  "(c.bars)+'</div>';\n",
  "  } else {\n",
  "    h += '<div class=\"panel\"><div class=\"lab\">Evidence on file</div>'+\n",
  "         '<div style=\"font-size:.93rem\">'+esc(c.evidence||'—')+'</div></div>';\n",
  "  }\n",
  "  if (c.recommend){\n",
  "    h += '<div class=\"note n-info\"><b>FTO recommendation</b>'+esc(c.recommend)+'</div>';\n",
  "  }\n",
  "  h += '<div class=\"panel\"><div class=\"lab\">Your reason (required)</div>'+\n",
  "    '<textarea id=\"why\" placeholder=\"This goes on the permanent record in your name. No de",
  "fault wording.\" '+\n",
  "    'oninput=\"syncDecideBtns()\"></textarea></div>'+\n",
  "    '<button class=\"btn\" id=\"ap\" disabled onclick=\"approve()\">Approve sign-off</button>'+\n",
  "    '<button class=\"btn ghost-danger\" id=\"ret\" disabled onclick=\"returnSkill()\">Return for",
  " more evidence</button>'+\n",
  "    '<div class=\"next\"><b>Friction belongs here</b>Approve is one clear act with your word",
  "s. Return stays dead until you type why — never invent an FTO\\'s words.</div>'+\n",
  "    '<div class=\"next\"><b>Where this goes</b>Straight onto the permanent sign-off log, and",
  " the queue row closes. Same gates the tracker uses — typed reason, your name, evidence che",
  "ck.</div>';\n",
  "  paint(h);\n",
  "  syncDecideBtns();\n",
  "}\n",
  "function syncDecideBtns(){\n",
  "  var why = (el('why') && el('why').value || '').trim();\n",
  "  var ok = why.length >= 8;\n",
  "  if (el('ap')) el('ap').disabled = !ok || S.busy;\n",
  "  if (el('ret')) el('ret').disabled = !ok || S.busy;\n",
  "}\n",
  "function approve(){\n",
  "  if (S.busy) return;\n",
  "  var why = el('why').value.trim();\n",
  "  if (why.length < 8) { alert('Type why you are approving this.'); return; }\n",
  "  S.busy = true; var b = el('ap'); b.disabled = true; b.textContent = 'Saving…';\n",
  "  if (el('ret')) el('ret').disabled = true;\n",
  "  google.script.run.withSuccessHandler(function(){ S.busy=false; S.screen='main'; reload()",
  "; })\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.textContent='Approve sign-off'; syncD",
  "ecideBtns();\n",
  "      alert(e.message||e); })\n",
  "    .approveSignoffV1(S.ctx.row, why, S.ctx.requestId||'');\n",
  "}\n",
  "function returnSkill(){\n",
  "  if (S.busy) return;\n",
  "  var why = el('why').value.trim();\n",
  "  if (why.length < 8) { alert('Type why you are returning this.'); return; }\n",
  "  S.busy = true; var b = el('ret'); b.disabled = true; b.textContent = 'Saving…';\n",
  "  if (el('ap')) el('ap').disabled = true;\n",
  "  google.script.run.withSuccessHandler(function(){ S.busy=false; S.screen='main'; reload()",
  "; })\n",
  "    .withFailureHandler(function(e){ S.busy=false; b.textContent='Return for more evidence",
  "'; syncDecideBtns();\n",
  "      alert(e.message||e); })\n",
  "    .returnSignoffV1(S.ctx.row, why, S.ctx.requestId||'');\n",
  "}\n",
  "\n",
  "/* ---------------- supervisor — shift strip ---------------- */\n",
  "function paintSupervisor(d){\n",
  "  var hot = d.hotCount || 0;\n",
  "  var h = hero('My shift', d.shift,\n",
  "    (d.trainees||[]).length+' on the line'+\n",
  "    (hot ? ' &middot; <span style=\"color:var(--gold)\">'+hot+' hot tonight</span>' : ' &mid",
  "dot; all quiet'));\n",
  "  if (!d.trainees.length){\n",
  "    h += '<div class=\"note n-ok\"><b>Nobody on shift</b>No active trainees are assigned to ",
  "this shift.</div>';\n",
  "  } else {\n",
  "    h += '<p class=\"sub\">Swipe the strip. Red wants a look tonight. Tap a name for the nex",
  "t move.</p>';\n",
  "    h += '<div class=\"strip\">';\n",
  "    d.trainees.forEach(function(t){\n",
  "      h += '<div class=\"tile '+(t.urgency||'')+'\">'+\n",
  "           '<div class=\"h\">'+esc(t.name)+'</div>'+\n",
  "           '<div class=\"m\">'+esc(t.phase||'')+' &middot; '+esc(short(t.fto,18)||'no FTO')+",
  "'</div>'+\n",
  "           (t.why ? '<div class=\"flag\">'+esc(t.nextMove && t.nextMove.title ? t.nextMove.t",
  "itle : t.why)+'</div>'\n",
  "                  : '<div class=\"m\" style=\"margin-top:8px;color:var(--ok)\">Clear</div>')+\n",
  "           '</div>';\n",
  "    });\n",
  "    h += '</div>';\n",
  "    h += sec('Everyone', d.trainees.length);\n",
  "    d.trainees.forEach(function(t){\n",
  "      h += '<div class=\"card\"'+spine(t.urgency||'')+'>'+\n",
  "        '<div class=\"hd\"><span class=\"h\">'+esc(t.name)+'</span>'+lvlChip(t.levelKey,t.leve",
  "l)+'</div>'+\n",
  "        '<div class=\"m\">'+esc(t.phase)+' &middot; '+esc(t.fto||'no FTO')+\n",
  "        ' &middot; last eval '+esc(t.lastEval)+'</div>'+\n",
  "        (t.nextMove ? '<div class=\"flag\">'+esc(t.nextMove.title)+'</div>' : '')+\n",
  "        '</div>';\n",
  "    });\n",
  "  }\n",
  "  if (d.forms && d.forms.length){\n",
  "    h += sec('If something cannot wait')+formCards(d.forms);\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>Deliberately thin</b>You get situational awareness for tonigh",
  "t — not a second Training desk.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "function paintMedical(d){\n",
  "  var cases = d.cases || [];\n",
  "  var total = (d.total === undefined) ? cases.length : d.total;\n",
  "  var h = hero('Medical Direction', 'Clinical review',\n",
  "    total+(total===1?' open case':' open cases')+' for you. Nothing else.');\n",
  "  h += warnRow(d.warnings);\n",
  "\n",
  "  if (!total) h += '<div class=\"note n-ok\"><b>Nothing pending</b>No open concern requires ",
  "your authority.</div>';\n",
  "  cases.forEach(function(c){\n",
  "    h += '<button class=\"card act\"'+spine('pmd')+' onclick=\"openRecord('+jsStr(c.trainee)+",
  "')\">'+\n",
  "      '<span class=\"bd\">'+\n",
  "      '<span class=\"hd\"><span class=\"h\">'+esc(c.trainee)+'</span>'+\n",
  "      (c.category ? '<span class=\"chip c-pmd\">'+esc(c.category)+'</span>' : '')+'</span>'+",
  "\n",
  "      '<span class=\"m\">Raised by '+esc(c.from)+' &middot; '+esc(c.when)+\n",
  "      (c.book ? ' &middot; in '+esc(c.book) : '')+'</span>'+\n",
  "      (c.what ? '<span class=\"m\" style=\"color:var(--ink-2);margin-top:7px\">'+esc(c.what)+'",
  "</span>' : '')+\n",
  "      '</span><span class=\"go\">&rsaquo;</span></button>';\n",
  "  });\n",
  "  if (total > cases.length)\n",
  "    h += '<p class=\"sub\">Showing the '+cases.length+' most recent of '+total+'.</p>';\n",
  "  h += '<div class=\"next\"><b>Only your cases</b>Concerns already closed are not shown, and",
  " you never see routine evaluations, reflections, or other trainees.</div>';\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "/* A column this screen depends on is missing. Doctrine: that is a defect to\n",
  "   report, never permission to read the one next to it and hope. */\n",
  "function warnRow(list){\n",
  "  var h = '';\n",
  "  (list||[]).forEach(function(w){\n",
  "    h += '<div class=\"note n-stop\"><b>Cannot read the record</b>'+esc(w)+'</div>';\n",
  "  });\n",
  "  return h;\n",
  "}\n",
  "\n",
  "/* ---------------- the record ---------------- */\n",
  "/* Current first, in full. Everything earlier below it, also in full. The\n",
  "   raw tabs are untouched; this is a reading of them, not a replacement. */\n",
  "\n",
  "function freshRow(list){\n",
  "  if (!list || !list.length) return '';\n",
  "  var h = '<div class=\"fresh\">';\n",
  "  list.forEach(function(f){\n",
  "    var never = f.ago === 'never';\n",
  "    h += '<span class=\"'+(never?'never':'')+'\">'+esc(f.title)+' <b>'+esc(f.ago)+'</b>'+\n",
  "         (f.count>1 ? ' <span style=\"color:var(--ink-3)\">('+f.count+')</span>' : '')+'</sp",
  "an>';\n",
  "  });\n",
  "  return h + '</div>';\n",
  "}\n",
  "\n",
  "function refreshQueue(){\n",
  "  if (S.busy) return;\n",
  "  S.busy = true;\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Done.');\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){ S.busy = false; alert(e.message || e); })\n",
  "    .refreshValidationQueueV1();\n",
  "}\n",
  "\n",
  "function syncMatrixEvidence(){\n",
  "  if (S.busy) return;\n",
  "  if (!confirm('Recount the skills matrix from the evidence log, mark skills READY when th",
  "e bars are met, then refresh the sign-off queue?')) return;\n",
  "  S.busy = true;\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Done.');\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){ S.busy = false; alert(e.message || e); })\n",
  "    .syncMatrixFromEvidenceV1();\n",
  "}\n",
  "\n",
  "function openFormWait(i){\n",
  "  var list = (BOOT.data && BOOT.data.formWaiting && BOOT.data.formWaiting.list) || [];\n",
  "  var item = list[i];\n",
  "  if (!item) return;\n",
  "  S.ctx = { formMeta: item, form: null, err: '', from: 'main' };\n",
  "  S.screen = 'formWait';\n",
  "  var req = (S.formWaitReq = (S.formWaitReq || 0) + 1);\n",
  "  render();\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      if (req !== S.formWaitReq || S.screen !== 'formWait') return;\n",
  "      S.ctx.form = r; render();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      if (req !== S.formWaitReq || S.screen !== 'formWait') return;\n",
  "      S.ctx.err = e.message || String(e); render();\n",
  "    })\n",
  "    .formResponseDetailV1(item.tab, item.row);\n",
  "}\n",
  "\n",
  "function paintFormWait(){\n",
  "  var c = S.ctx || {};\n",
  "  var meta = c.formMeta || {};\n",
  "  var back = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</butto",
  "n>';\n",
  "  if (c.err) return paint(hero('Waiting response', meta.trainee || '', '')+back+\n",
  "    '<div class=\"note n-stop\"><b>Cannot open</b>'+esc(c.err)+'</div>');\n",
  "  if (!c.form) return paint(hero('Waiting response', meta.trainee || '', 'Reading the form",
  " response&hellip;')+back);\n",
  "\n",
  "  var p = c.form;\n",
  "  var h = hero(p.kind === 'skills' ? 'Skills log response' : 'Form response',\n",
  "    p.trainee || 'Unnamed trainee',\n",
  "    (p.when || p.stamp || 'no date')+(p.by ? ' · '+esc(p.by) : ''))+back;\n",
  "  if (p.inLog){\n",
  "    h += '<div class=\"note n-ok\"><b>Matched in the evidence log</b>This response id is alr",
  "eady on file. You can still clear it from the desk.</div>';\n",
  "  } else if (p.dayHint){\n",
  "    h += '<div class=\"note n-warn\"><b>Same day has evidence</b>Something for this trainee ",
  "is on the log that day, but this response id is not linked. Clear from the desk, or Sync m",
  "atrix from evidence on Home if skills are stuck.</div>';\n",
  "  } else {\n",
  "    h += '<div class=\"note n-warn\"><b>Waiting on ingest</b>Still only on the form-response",
  " tab. '+\n",
  "         'Clear it here, or run <b>catchUpUnprocessed</b> in the tracker if ingest never f",
  "ired.</div>';\n",
  "  }\n",
  "  h += '<div class=\"panel\"><div class=\"lab\">Tab</div><div style=\"font-size:.93rem\">'+esc(p",
  ".tab)+\n",
  "       ' · row '+esc(String(p.row))+'</div></div>';\n",
  "  (p.fields||[]).forEach(function(f){\n",
  "    h += '<div class=\"fld\"><div class=\"l\">'+esc(f.label)+'</div>'+\n",
  "         '<div class=\"v\">'+esc(f.value)+'</div></div>';\n",
  "  });\n",
  "  if (p.trainee){\n",
  "    h += '<button class=\"btn\" style=\"margin-top:16px\" onclick=\"openRecord('+jsStr(p.traine",
  "e)+')\">'+\n",
  "         'Open personnel record</button>';\n",
  "  }\n",
  "  if (canWrite() && !p.deskCleared){\n",
  "    h += '<div class=\"panel\" style=\"margin-top:14px\"><div class=\"lab\">Clear from this desk",
  " (required)</div>'+\n",
  "         '<textarea id=\"formReviewWhy\" placeholder=\"Why this can leave Waiting on you. Doe",
  "s not ingest or delete the form response.\"></textarea></div>'+\n",
  "         '<button class=\"btn\" onclick=\"clearFormWait()\">Clear from Waiting on you</button>",
  "';\n",
  "  }\n",
  "  h += '<div class=\"next\"><b>What this is</b>'+esc(p.note||'')+'</div>';\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "function clearFormWait(){\n",
  "  if (S.busy) return;\n",
  "  var c = S.ctx || {};\n",
  "  var p = c.form || c.formMeta;\n",
  "  if (!p) return;\n",
  "  var why = (el('formReviewWhy') && el('formReviewWhy').value || '').trim();\n",
  "  if (why.length < 8) { alert('Type why you are clearing this from the desk.'); return; }\n",
  "  S.busy = true;\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Cleared.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){ S.busy = false; alert(e.message || e); })\n",
  "    .reviewFormResponseV1(p.tab, p.row, why);\n",
  "}\n",
  "\n",
  "function openTraineeReport(name){\n",
  "  if (!name) return;\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(html){\n",
  "      var w = window.open('', '_blank');\n",
  "      if (!w){ alert('Allow pop-ups to open the report, then Print → Save as PDF.'); retur",
  "n; }\n",
  "      w.document.open();\n",
  "      w.document.write(html);\n",
  "      w.document.close();\n",
  "    })\n",
  "    .withFailureHandler(function(e){ alert(e.message || e); })\n",
  "    .traineeReportHtmlV1(name);\n",
  "}\n",
  "\n",
  "function openSettle(i){\n",
  "  var list = (BOOT.data && BOOT.data.duplicateSubs) || [];\n",
  "  var item = list[i];\n",
  "  if (!item) return;\n",
  "  S.ctx = { settleMeta: item, settle: null, err: '', keepRow: '', from: 'main' };\n",
  "  S.screen = 'settle';\n",
  "  var req = (S.settleReq = (S.settleReq || 0) + 1);\n",
  "  render();\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      if (req !== S.settleReq || S.screen !== 'settle') return;\n",
  "      S.ctx.settle = r; render();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      if (req !== S.settleReq || S.screen !== 'settle') return;\n",
  "      S.ctx.err = e.message || String(e); render();\n",
  "    })\n",
  "    .duplicatePairDetailV1(item.trainee, item.tab, item.dupKey);\n",
  "}\n",
  "\n",
  "function paintSettle(){\n",
  "  var c = S.ctx || {};\n",
  "  var meta = c.settleMeta || {};\n",
  "  var back = '<button class=\"back\" onclick=\"S.screen=\\'main\\';render()\">&larr; Back</butto",
  "n>';\n",
  "  if (c.err) return paint(hero('Settle', meta.trainee || '', '')+back+\n",
  "    '<div class=\"note n-stop\"><b>Cannot open</b>'+esc(c.err)+'</div>');\n",
  "  if (!c.settle) return paint(hero('Settle', meta.trainee || '', 'Reading both sides&helli",
  "p;')+back);\n",
  "\n",
  "  var p = c.settle;\n",
  "  var hasLocal = (p.sides || []).some(function(s){ return Number(s.row) > 0; });\n",
  "  var h = hero('Settle', p.trainee,\n",
  "    esc(p.source)+(p.sides && p.sides[0] && p.sides[0].group ? ' · '+esc(p.sides[0].group)",
  " : ''))+back;\n",
  "  h += '<div class=\"note n-info\"><b>Both stay on file</b>'+esc(p.why)+\n",
  "       '. Your call is who stands for the record — nothing is deleted.</div>';\n",
  "\n",
  "  (p.sides || []).forEach(function(s){\n",
  "    var local = Number(s.row) > 0;\n",
  "    var picked = local && String(c.keepRow) === String(s.row);\n",
  "    h += '<div class=\"rec'+(picked?' cur':'')+'\" style=\"margin-top:10px\">'+\n",
  "         '<div class=\"when\"><span>'+(local ? 'Row '+esc(String(s.row)) : 'Other book')+\n",
  "         ' · '+esc(s.when)+\n",
  "         (s.by ? ' · '+esc(s.by) : '')+\n",
  "         (s.book ? ' · in '+esc(s.book) : '')+'</span>'+\n",
  "         (picked ? '<b>Stands</b>' : '')+'</div>';\n",
  "    if (s.group) h += '<div class=\"h\" style=\"margin-top:5px\">'+esc(s.group)+'</div>';\n",
  "    (s.fields||[]).forEach(function(f){\n",
  "      h += '<div class=\"fld\"><div class=\"l\">'+esc(f.label)+'</div>'+\n",
  "           '<div class=\"v\">'+esc(f.value)+'</div></div>';\n",
  "    });\n",
  "    if (canWrite() && local){\n",
  "      h += '<button class=\"btn '+(picked?'':'ghost')+'\" style=\"margin-top:10px\" '+\n",
  "           'onclick=\"S.ctx.keepRow='+jsStr(String(s.row))+';render()\">'+\n",
  "           (picked ? 'This row stands' : 'Mark this row as the one that stands')+'</button",
  ">';\n",
  "    }\n",
  "    h += '</div>';\n",
  "  });\n",
  "\n",
  "  if (!canWrite()){\n",
  "    h += '<div class=\"flag\" style=\"--accent:var(--warn);margin-top:14px\">Read only — switc",
  "h to LIVE to settle from Field Training.</div>';\n",
  "    return paint(h);\n",
  "  }\n",
  "\n",
  "  if (!hasLocal){\n",
  "    h += '<div class=\"note n-warn\" style=\"margin-top:14px\"><b>No row on this book</b>'+\n",
  "         'Both sides live elsewhere. You can still mark Both stand or Not a conflict.</div",
  ">';\n",
  "  }\n",
  "\n",
  "  h += '<div class=\"panel\" style=\"margin-top:14px\"><div class=\"lab\">Your reason (required)",
  "</div>'+\n",
  "       '<textarea id=\"settleWhy\" placeholder=\"Why both stand, why this row, or why this is",
  " not a conflict.\" '+\n",
  "       'oninput=\"syncSettleBtns()\">'+esc(c.whyText||'')+'</textarea></div>';\n",
  "  h += '<button class=\"btn\" id=\"sbBoth\" disabled onclick=\"doSettle(\\'BOTH_STAND\\')\">Both s",
  "tand</button>';\n",
  "  if (hasLocal){\n",
  "    h += '<button class=\"btn\" id=\"sbKeep\" disabled onclick=\"doSettle(\\'KEEP_ROW\\')\">This o",
  "ne stands</button>';\n",
  "  }\n",
  "  h += '<button class=\"btn ghost\" id=\"sbNot\" disabled onclick=\"doSettle(\\'NOT_A_CONFLICT\\'",
  ")\">Not a conflict</button>';\n",
  "  h += '<div class=\"next\"><b>What this does</b>Writes your judgment to PORTAL SETTLEMENTS.",
  " '+\n",
  "       'Raw rows stay. Settle stops raising this pair.</div>';\n",
  "  paint(h);\n",
  "  syncSettleBtns();\n",
  "}\n",
  "\n",
  "function syncSettleBtns(){\n",
  "  var why = (el('settleWhy') && el('settleWhy').value || '').trim();\n",
  "  if (S.ctx) S.ctx.whyText = why;\n",
  "  var ok = why.length >= 8 && !S.busy;\n",
  "  var keepOk = ok && S.ctx && Number(S.ctx.keepRow) > 0;\n",
  "  if (el('sbBoth')) el('sbBoth').disabled = !ok;\n",
  "  if (el('sbNot')) el('sbNot').disabled = !ok;\n",
  "  if (el('sbKeep')) el('sbKeep').disabled = !keepOk;\n",
  "}\n",
  "\n",
  "function doSettle(decision){\n",
  "  if (S.busy) return;\n",
  "  var c = S.ctx || {};\n",
  "  var p = c.settle || c.settleMeta;\n",
  "  if (!p) return;\n",
  "  var why = (el('settleWhy') && el('settleWhy').value || '').trim();\n",
  "  if (why.length < 8) { alert('Type why. It goes on the permanent record in your name.'); ",
  "return; }\n",
  "  if (decision === 'KEEP_ROW' && !(Number(c.keepRow) > 0)) {\n",
  "    alert('Pick which row stands first.'); return;\n",
  "  }\n",
  "  S.busy = true; syncSettleBtns();\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      S.busy = false;\n",
  "      alert((r && r.message) || 'Settled.');\n",
  "      S.screen = 'main';\n",
  "      reload();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      S.busy = false; syncSettleBtns();\n",
  "      alert(e.message || e);\n",
  "    })\n",
  "    .settleDuplicateV1(p.trainee, p.tab, p.dupKey, decision, why,\n",
  "                       c.keepRow || '', p.source || (c.settleMeta && c.settleMeta.source) ",
  "|| '');\n",
  "}\n",
  "\n",
  "function openRecord(name){\n",
  "  S.ctx = { name: name, rec: null, from: S.screen, show: {} };\n",
  "  S.screen = 'record'; render();\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){ S.ctx.rec = r; render(); })\n",
  "    .withFailureHandler(function(e){ S.ctx.err = e.message || String(e); render(); })\n",
  "    .recordV1(name);\n",
  "}\n",
  "\n",
  "function paintRecord(){\n",
  "  var c = S.ctx || {};\n",
  "  var back = '<button class=\"back\" onclick=\"S.screen=\\''+(c.from||'main')+'\\';render()\">&l",
  "arr; Back</button>';\n",
  "  if (c.err) return paint(hero('The whole record', c.name, '')+back+\n",
  "    '<div class=\"note n-stop\"><b>Cannot open</b>'+esc(c.err)+'</div>');\n",
  "  if (!c.rec) return paint(hero('The whole record', c.name, 'Reading the record&hellip;')+",
  "back);\n",
  "\n",
  "  var r = c.rec;\n",
  "  var h = hero('The whole record', r.name,\n",
  "    r.total+(r.total===1?' submission on file':' submissions on file')+\n",
  "    '. Nothing has been removed.') + back;\n",
  "\n",
  "  if (r.partial) h += '<div class=\"note n-info\"><b>Part of the record</b>'+esc(r.scopeNote",
  ")+'</div>';\n",
  "  if (r.duplicates) h += '<div class=\"note n-warn\"><b>'+r.duplicates+\n",
  "    ' possible duplicate'+(r.duplicates===1?'':'s')+'</b>Two submissions of the same kind ",
  "on the '+\n",
  "    'same day. Both are kept and both are shown. Which one stands is your call.</div>';\n",
  "  if (!r.sections.length) h += '<div class=\"note n-info\"><b>Nothing on file</b>No submissi",
  "ons '+\n",
  "    'have been recorded for this person yet.</div>';\n",
  "\n",
  "  r.sections.forEach(function(part){\n",
  "    h += sec(part.title, part.count);\n",
  "    h += '<p class=\"sub\" style=\"margin-top:-4px\">Most recent '+esc(part.newestAgo)+'</p>';",
  "\n",
  "    part.current.forEach(function(x){ h += recCard(x, true); });\n",
  "    if (part.earlier.length){\n",
  "      var open = !!(S.ctx.show||{})[part.key];\n",
  "      h += '<button class=\"more\" onclick=\"toggleEarlier(\\''+esc(part.key)+'\\')\">'+\n",
  "           (open ? 'Hide' : 'Show')+' '+part.earlier.length+' earlier '+\n",
  "           (part.earlier.length===1?'submission':'submissions')+'</button>';\n",
  "      if (open) part.earlier.forEach(function(x){ h += recCard(x, false); });\n",
  "    }\n",
  "  });\n",
  "\n",
  "  h += '<div class=\"next\"><b>Where this comes from</b>Every row is read straight from the ",
  "tab the '+\n",
  "       'form wrote it to. Nothing is edited, moved or deleted to build this screen.</div>'",
  ";\n",
  "  paint(h);\n",
  "}\n",
  "\n",
  "function toggleEarlier(key){\n",
  "  S.ctx.show = S.ctx.show || {};\n",
  "  S.ctx.show[key] = !S.ctx.show[key];\n",
  "  render();\n",
  "}\n",
  "\n",
  "function recCard(s, isCurrent){\n",
  "  var cls = 'rec' + (s.possibleDuplicate ? ' dup' : (isCurrent ? ' cur' : ''));\n",
  "  var h = '<div class=\"'+cls+'\"><div class=\"when\"><span>'+esc(s.when)+\n",
  "    (s.by ? ' &middot; '+esc(s.by) : '')+\n",
  "    (s.book ? ' &middot; in '+esc(s.book) : '')+'</span>'+\n",
  "    (isCurrent ? '<b>Current</b>' : '<span>'+esc(s.ago)+'</span>')+'</div>';\n",
  "  if (s.group) h += '<div class=\"h\" style=\"margin-top:5px\">'+esc(s.group)+'</div>';\n",
  "  if (s.possibleDuplicate) h += '<div class=\"m\" style=\"color:var(--stop);margin-top:5px\">'",
  "+\n",
  "    'Possible duplicate - another submission of this kind on the same day.</div>';\n",
  "  else if (s.settledDuplicate) h += '<div class=\"m\" style=\"color:var(--ink-3);margin-top:5",
  "px\">'+\n",
  "    'Settled — Division already recorded how this pair stands.</div>';\n",
  "  (s.fields||[]).forEach(function(f){\n",
  "    h += '<div class=\"fld\"><div class=\"l\">'+esc(f.label)+'</div>'+\n",
  "         '<div class=\"v\">'+esc(f.value)+'</div></div>';\n",
  "  });\n",
  "  return h + '</div>';\n",
  "}\n",
  "\n",
  "function reload(){\n",
  "  google.script.run.withSuccessHandler(function(r){\n",
  "    BOOT.viewer = r.viewer; BOOT.data = r.data; BOOT.mode = r.mode;\n",
  "    BOOT.error = r.error || ''; BOOT.deferred = false;\n",
  "    S.screen = 'main'; render();\n",
  "  }).withFailureHandler(function(e){ alert(e.message||e); }).refreshV1();\n",
  "}\n",
  "\n",
  "function startLine(){\n",
  "  paint(hero('Field Training', 'Opening…',\n",
  "    'Loading your desk. If Google asks for permission, allow it — then this page continues",
  ".'));\n",
  "  google.script.run\n",
  "    .withSuccessHandler(function(r){\n",
  "      BOOT.viewer = r.viewer || BOOT.viewer;\n",
  "      BOOT.data = r.data || {};\n",
  "      BOOT.mode = r.mode || BOOT.mode;\n",
  "      BOOT.error = r.error || '';\n",
  "      BOOT.deferred = false;\n",
  "      S.screen = 'main';\n",
  "      render();\n",
  "    })\n",
  "    .withFailureHandler(function(e){\n",
  "      var msg = String((e && e.message) || e || 'unknown');\n",
  "      paint(hero('Field Training', 'Could not open', '')+\n",
  "        '<div class=\"note n-stop\"><b>Blocked</b>'+esc(msg)+'</div>'+\n",
  "        '<div class=\"note n-info\"><b>Do this in order</b>'+\n",
  "        '1. Open the <b>SCEMS Portal</b> Apps Script editor.<br>'+\n",
  "        '2. Run <b>authorizePortalNow</b> — finish every Google permission screen '+\n",
  "        '(Advanced → Go to SCEMS Portal if shown).<br>'+\n",
  "        '3. Deploy → Manage deployments → Edit → <b>New version</b> → Deploy.<br>'+\n",
  "        '4. Settings must be: Execute as <b>Me</b>, Who has access: '+\n",
  "        '<b>Anyone with a Google account</b> (not Anyone).<br>'+\n",
  "        '5. Open the /exec link in an Incognito window signed into one account only.'+\n",
  "        '</div>'+\n",
  "        '<button class=\"btn\" onclick=\"startLine()\">Try again</button>');\n",
  "    })\n",
  "    .refreshV1();\n",
  "}\n",
  "\n",
  "try {\n",
  "  if (BOOT.deferred) startLine();\n",
  "  else render();\n",
  "} catch (bootErr) {\n",
  "  try {\n",
  "    document.getElementById('view').innerHTML =\n",
  "      '<div class=\"hero\"><h1>Field Training could not start</h1>' +\n",
  "      '<p class=\"sub\">The page loaded but the script crashed while starting. ' +\n",
  "      'In the Apps Script editor run authorizePortalNow, then Deploy → New version.</p></d",
  "iv>' +\n",
  "      '<div class=\"note n-stop\"><b>Error</b>' + String((bootErr && bootErr.message) || boo",
  "tErr) + '</div>';\n",
  "  } catch (e2) {}\n",
  "}\n",
  "</script>\n",
  "</body>\n",
  "</html>\n"
].join('');


/* ======================================================================
 * END OF FILE
 *
 * If you cannot see this block at the bottom of Code.gs, the paste was
 * cut short. Select everything, delete it, and paste again.
 *
 * Or run portalPasteCheck from the Run dropdown; it says so either way.
 * ====================================================================== */

var PORTAL_BUILD = 'e2694a4a';

function portalPasteCheck() {
  var msg = (typeof PORTAL_PAGE_HTML === 'string' && PORTAL_PAGE_HTML.length > 1000)
    ? 'The paste is complete. ' + PORTAL.VERSION + ', build ' + PORTAL_BUILD +
      ', page is ' + PORTAL_PAGE_HTML.length + ' characters.'
    : 'The paste is INCOMPLETE. Select everything in this file, delete it, ' +
      'and paste the whole file again.';
  Logger.log(msg);
  return msg;
}
