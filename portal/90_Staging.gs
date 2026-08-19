/**
 * Staging.
 *
 * setUpStaging() creates a NEW spreadsheet, fills it with invented people,
 * and points the portal at it. It never opens, reads, copies or references
 * the live tracker. Run it once; run it again for a fresh sandbox.
 */

function setUpStaging() {
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
      ['Rosa Quill','STG-05','Paramedic','C','Marcus Vane', d('2026-01-06'),'Phase 4','Closed / Released','rosa.quill@example.org', d('2026-03-01'),'B']
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
       'Slow down the primary survey. Say the findings out loud.']
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

  tab(PORTAL.TAB.AUDIT, ['WHEN','WHAT','WHO','DETAIL','VERSION'], []);

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PORTAL.PROPERTY_TARGET, book.getId());
  props.setProperty(PORTAL.PROPERTY_MODE, PORTAL.MODE_STAGING);

  var me = whoIsAskingV1_();
  if (me) {
    props.setProperty('PORTAL_DIVISION_EMAILS', me);
    props.setProperty('PORTAL_SUPERVISORS', JSON.stringify({}));
  }

  var msg = 'STAGING READY\n\n' +
    'Spreadsheet : ' + book.getName() + '\n' +
    'Link        : ' + book.getUrl() + '\n\n' +
    'The portal now points at this sandbox. Five invented trainees, two\n' +
    'invented FTOs. Nothing here is a personnel record and nothing of yours\n' +
    'was opened to build it.\n\n' +
    (me ? 'You (' + me + ') are set as Training Division so you can see that view.\n' +
          'To try another role, use switchRoleForTestingV1("TRAINEE") and back.\n\n' : '') +
    'Next: Deploy > New deployment > Web app, then open the URL.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** Lets one account preview another role while testing in staging.
 *  Refuses outside staging, so it can never become a production backdoor. */
function switchRoleForTestingV1(role) {
  requireWritableV1_('switch role');
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
