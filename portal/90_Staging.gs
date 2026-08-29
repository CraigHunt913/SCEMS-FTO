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
