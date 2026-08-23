/**
 * SCEMS Field Training Tracker — 35_operations
 *
 * The day-to-day machinery carried forward from v19 and v20.
 *
 *
 * What the blocks these came from used to say, kept because for several
 * of them it is the only record of why they exist:
 *
 *   Working operational machinery carried forward from v19/v20 — each
 *   function below is the single EFFECTIVE implementation identified by the
 *   override-precedence map (Report 2). Shadowed duplicates were dropped.
 *   PATCHES APPLIED DURING PORTING (each marked in place):
 *   1. Every CONFIG.TEST_MODE read became isTestMode_() — delivery mode is
 *   decided at send time from the stored flag, never a load-time value.
 *   2. The queue refresh no longer re-sorts while any OPEN row holds a
 *   draft decision (the mid-selection row-swap defect).
 *   3. checkPortalV19 derives its expected link count from PORTAL_CARDS.
 *   4. EXPECTED_FORMS_V19 derives from FORM_TITLES (all nine forms).
 *   No other behavior was changed in this file.
 */

/* ---- ported from zz (effective winner) ---- */
/** Override. Same behaviour as before for EMT and AEMT. Paramedic release
 *  now requires both the Division Chief of Training and the Medical
 *  Director before the queue item can close. */
function decisionAlerts(v) {
  var filedBy = String(v[1] || '').trim();
  var role    = String(v[2] || '').trim();
  var trainee = String(v[3] || '').trim();
  var itemType= String(v[4] || '').trim();
  var decision= String(v[5] || '').trim();
  var S = ss();

  var keyMap = {
    'Advancement review': 'Advancement',
    'NRT outcome': 'NRT',
    'Clinical disagreement': 'Clinical',
    'Urgent concern follow-up': '',
    'Audit flag review': '',
    'Other': ''
  };
  var key = keyMap[itemType] || '';

  // stamp phase at decision onto the row just mirrored to tab 16
  var rec = traineeRecordV19_(trainee);
  var phaseNow = rec ? rec.phase : '';
  try {
    var dec = S.getSheetByName(DECISIONS_TAB);
    dec.getRange(dec.getLastRow(), 9).setValue(phaseNow);
  } catch (e) {}

  var qRow = key ? openQueueRowV19_(trainee, key) : -1;
  var dual = needsDualSignoffV19_(trainee, itemType);

  // ---------- paramedic release : two keys required ----------
  if (dual) {
    var openedMs = 0;
    if (qRow > 0) {
      var filed = S.getSheetByName(TAB.QUEUE).getRange(qRow, 1).getValue();
      if (filed instanceof Date) openedMs = filed.getTime();
    }
    var sigs = signaturesOnFileV19_(trainee, itemType, openedMs);
    var haveTraining = !!sigs[DUAL_ROLE_TRAINING_V19];
    var haveMedical  = !!sigs[DUAL_ROLE_MEDICAL_V19];

    if (haveTraining && haveMedical) {
      if (qRow > 0) {
        var q = S.getSheetByName(TAB.QUEUE);
        q.getRange(qRow, 6).setValue(decision);
        q.getRange(qRow, 7).setValue('Training + Medical Director');
        q.getRange(qRow, 8).setValue(new Date());
      }
      var t = sigs[DUAL_ROLE_TRAINING_V19], m = sigs[DUAL_ROLE_MEDICAL_V19];
      var body =
        'PARAMEDIC RELEASE : BOTH AUTHORISATIONS ON FILE\n\n' +
        'Trainee: ' + trainee + '  (' + DUAL_SIGNOFF_LEVEL_V19 + ', ' + phaseNow + ')\n\n' +
        DUAL_ROLE_TRAINING_V19 + '\n' +
        '   filed by: ' + t.by + '\n   decision: ' + t.decision + '\n   rationale: ' + t.rationale + '\n\n' +
        DUAL_ROLE_MEDICAL_V19 + '\n' +
        '   filed by: ' + m.by + '\n   decision: ' + m.decision + '\n   rationale: ' + m.rationale + '\n\n' +
        'The Decision Queue item is closed. Both authorisations are permanently\n' +
        'recorded as separate rows on 16 DECISIONS RAW.\n\n' +
        'DO THIS NOW: set Program Status on 01 TRAINEE MASTER to Cleared to\n' +
        'Independent Practice, then archive the trainee from the SCEMS menu.';
      sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.MD_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
        'Paramedic Release Authorised : ' + trainee, body);
      systemLog_('INFO', 'PARAMEDIC RELEASE : DUAL SIGN-OFF COMPLETE', trainee);
      return;
    }

    var missingRole = haveTraining ? DUAL_ROLE_MEDICAL_V19 : DUAL_ROLE_TRAINING_V19;
    var missingMail = haveTraining ? CONFIG.MD_EMAIL : CONFIG.TCO_EMAIL;
    if (qRow > 0) {
      S.getSheetByName(TAB.QUEUE).getRange(qRow, 7).setValue('AWAITING ' + missingRole.toUpperCase());
    }

    var link = '';
    try {
      var f = getStoredFormV19_('SCEMS Training Decision Record');
      if (f) link = f.getPublishedUrl();
    } catch (e) {}

    sendMail(missingMail + ',' + CONFIG.TCO_EMAIL,
      'ACTION REQUIRED : Paramedic Release Needs Your Authorisation : ' + trainee,
      'A paramedic release decision has been filed and is waiting on you.\n\n' +
      'Trainee: ' + trainee + '  (' + DUAL_SIGNOFF_LEVEL_V19 + ', ' + phaseNow + ')\n' +
      'Already filed by: ' + filedBy + ' (' + role + ')\n' +
      'Their decision: ' + decision + '\n' +
      'Their rationale: ' + String(v[6] || '') + '\n\n' +
      'Releasing a paramedic to independent practice requires both the ' +
      DUAL_ROLE_TRAINING_V19 + ' and the ' + DUAL_ROLE_MEDICAL_V19 + '.\n' +
      'The 72-hour queue item stays open until you file.\n\n' +
      'File your decision here:\n' + (link || 'Decision Record form, link on tab 00 QUICK LINKS') +
      '\n\nSelect Item type: Advancement review. Select your role. Your rationale\n' +
      'is recorded permanently and separately from theirs.');

    systemLog_('WARN', 'PARAMEDIC RELEASE : AWAITING SECOND SIGNATURE',
      trainee + ' | have ' + role + ' | need ' + missingRole);
    return;
  }

  // ---------- everything else, unchanged behaviour ----------
  var closed = false;
  if (qRow > 0) {
    var q2 = S.getSheetByName(TAB.QUEUE);
    q2.getRange(qRow, 6).setValue(decision);
    q2.getRange(qRow, 7).setValue(role);
    q2.getRange(qRow, 8).setValue(new Date());
    closed = true;
  }

  var doNow = (itemType === 'Advancement review' && decision === 'Approved')
    ? '\n\nDO THIS NOW: update Current Phase for ' + trainee + ' on 01 TRAINEE MASTER. ' +
      'Set the new Phase Start Date in column J while you are there. The daily check alarms after 48 hours if the phase has not moved.'
    : '';

  var body2 =
    'Decision filed by ' + filedBy + ' (' + role + ')\n' +
    'Trainee: ' + trainee + '\nItem: ' + itemType + '\nDecision: ' + decision +
    '\nEffective: ' + v[7] + '\nRationale: ' + v[6] + '\n\n' +
    (closed ? 'Matching Decision Queue item CLOSED automatically. The 72-hour clock on it has stopped.'
            : (key ? 'NOTE: no matching open queue item was found for this trainee and type. The decision is recorded on 16 DECISIONS RAW; check tab 12 by hand.'
                   : 'Recorded on 16 DECISIONS RAW. This item type does not map to the Decision Queue.')) + doNow;
  sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
    'Decision Recorded : ' + trainee + ' : ' + itemType + ' : ' + decision, body2);
}

/* ---- ported from zz (effective winner) ---- */
/** Override. The weekly roll-up, in the house style. */
function weeklyRollup() {
  var master = ss().getSheetByName(TAB.MASTER);
  if (!master) return 'Trainee Master not found.';

  var names = [];
  master.getRange(5, 1, 40, 10).getValues().forEach(function (r) {
    var n = String(r[0] || '').trim();
    if (n && n.indexOf('EXAMPLE') !== 0) names.push(n);
  });

  var GOLD = '#c9a227', MUTE = '#847d6d';
  var week = Utilities.formatDate(new Date(), 'America/New_York', 'MMMM d, yyyy');

  var attention = 0;
  var cards = names.map(function (n) {
    var f = snapshotFactsV19_(n);
    f.progress = progressLineV19_(n);
    if (f.overdue) attention++;
    return rollupCardV19_(f);
  });

  var h = [];
  h.push('<div style="background:#f7f3ea;padding:24px 16px;font-family:Arial,sans-serif;">');
  h.push('<div style="max-width:660px;margin:0 auto;">');
  h.push(emailBannerV19_('SUMTER COUNTY EMS', 'WEEKLY TRAINEE STATUS', '',
    'Week of ' + week + '&nbsp; &middot; &nbsp;' + names.length +
    ' active trainee' + (names.length === 1 ? '' : 's') +
    (attention ? '&nbsp; &middot; &nbsp;<span style="color:#e8836f;">' + attention +
      ' needing attention</span>' : '&nbsp; &middot; &nbsp;none needing attention'),
    true));

  h.push('<div style="background:#f7f3ea;padding:18px 4px 4px 4px;">');
  h.push(cards.join(''));

  h.push('<div style="border-top:1px solid #e8e4da;margin:8px 4px 0 4px;padding:16px 0 0 0;' +
    'font:11.5px Arial,sans-serif;color:' + MUTE + ';line-height:1.65;">' +
    '<b style="color:#8a6a1f;">On shift progress.</b> The minimum shift count is a ' +
    'floor, not a finish line. Meeting it makes a trainee eligible to be assessed ' +
    'for advancement; it does not advance them. Advancement is earned by ' +
    'demonstrated competency and is never granted by time served, so no completion ' +
    'date is projected here.<br><br>' +
    'Full detail on any trainee is available on request, usually within a minute.' +
    '</div>');
  h.push('</div></div></div>');

  var to = [CONFIG.TCO_EMAIL, CONFIG.CHIEF_EMAIL, CONFIG.ACHIEF_EMAIL]
    .filter(function (a) { return a; }).join(',');
  var actual = isTestMode_() ? CONFIG.TEST_INBOX : to;

  var opts = { to: actual, subject: 'Weekly Trainee Status : Week of ' + week,
               htmlBody: h.join(''), name: 'SCEMS Field Training' };
  var blob = badgeBlobV19_();
  if (blob) opts.inlineImages = { scemsbadge: blob };
  MailApp.sendEmail(opts);

  var msg = 'Weekly roll-up sent to ' + actual + ', ' + names.length + ' trainee(s).';
  Logger.log(msg);
  systemLog_('INFO', 'WEEKLY ROLLUP', names.length + ' trainee(s)');
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function modernHome() {
  var S = ss();
  var old = S.getSheetByName('HOME');
  if (old) {
    var safety = S.getSheetByName(TAB.MASTER) || S.getSheets().filter(function (sh) {
      return sh.getName() !== 'HOME';
    })[0];
    if (safety) {
      try { safety.showSheet(); } catch (e) {}
      S.setActiveSheet(safety);
    }
    old.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (String(p.getDescription() || '').indexOf('SCEMS Field Training') === 0) p.remove();
    });
    S.deleteSheet(old);
  }
  var h = S.insertSheet('HOME', 0);
  var INK = '#1d1b18', GOLD = '#c9a227', GOLDDK = '#8a6a1f',
      PAPER = '#fbfaf7', MUTE = '#847d6d', HAIR = '#e8e4da';
  var E = "'" + TAB.ENGINE + "'", AU = "'13 AUDIT - EXCEPTION LOG'",
      DQ = "'" + TAB.QUEUE + "'", SQ = "'" + TAB.SKILL_VALIDATION + "'",
      C0 = "'" + TAB.CONTROL + "'", E2 = "'" + TAB.EVAL + "'";
  var OV = C0 + '!$B$5';

  h.setHiddenGridlines(true);
  h.setTabColor(GOLD);
  h.getRange('A1:M75').setBackground(PAPER).setFontFamily('Inter').setFontColor(INK);
  h.getRange('A1:M4').setBackground(INK);
  h.getRange('A5:M5').setBackground(GOLD);
  h.setColumnWidth(1, 68);
  h.setColumnWidth(2, 180);
  h.setColumnWidth(3, 110);
  h.setColumnWidth(4, 125);
  h.setColumnWidth(5, 115);
  h.setColumnWidth(6, 105);
  h.setColumnWidth(7, 225);
  h.setColumnWidth(8, 340);
  h.setColumnWidth(9, 18);
  h.setColumnWidth(10, 18);
  h.setColumnWidth(11, 105);
  h.setColumnWidth(12, 90);
  h.setColumnWidth(13, 30);
  h.setRowHeight(1, 34); h.setRowHeight(2, 30); h.setRowHeight(3, 22);
  h.setRowHeight(4, 10); h.setRowHeight(5, 6);

  h.getRange('B1').setValue('SUMTER COUNTY EMS')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(10)
    .setFontColor(GOLD).setVerticalAlignment('bottom');
  h.getRange('B2').setValue('FIELD TRAINING')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(24)
    .setFontColor('#f7f3ea').setVerticalAlignment('middle');
  h.getRange('H2:J2').merge()
    .setFormula('=TEXT(NOW(),"ddd  -  MM/dd/yyyy  -  h:mm AM/PM")')
    .setFontFamily('Oswald').setFontSize(10).setFontColor('#b4ac9c')
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  h.getRange('H3:J3').merge().setValue('LAST FORM RECEIVED : none yet')
    .setFontSize(8).setFontColor('#b4ac9c').setHorizontalAlignment('right');
  h.getRange('K2').setValue('MENU')
    .setBackground(GOLD).setFontColor(INK).setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(14).setHorizontalAlignment('center').setVerticalAlignment('middle');
  h.getRange('K3').insertCheckboxes().setHorizontalAlignment('center');
  h.getRange('L2').setValue('or tick the box').setFontSize(8).setFontColor('#b4ac9c');

  var cards = [
    [2, 'ACTIVE TRAINEES', '=COUNTIF(' + E + '!$A$5:$A$44,"?*")'],
    [4, 'NEEDS ACTION',
      '=COUNTIFS(' + E + '!$I$5:$I$44,">"&' + OV + ',' + E + '!$A$5:$A$44,"?*",' + E + '!$V$5:$V$44,"<>SNOOZED")' +
      '+COUNTIF(' + E + '!$R$5:$R$44,"*Due*")' +
      '+COUNTIF(' + AU + '!$B$5:$G$44,"FLAG")' +
      '+COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")' +
      '+COUNTIFS(' + SQ + '!$B$5:$B$2000,"<>",' + SQ + '!$L$5:$L$2000,"OPEN")'],
    [6, 'EVALS LAST 7 DAYS', '=COUNTIFS(' + E2 + '!$A$5:$A$1000,">="&TODAY()-7)'],
    [8, 'OPEN DECISIONS', '=COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")']
  ];
  h.setRowHeight(6, 12); h.setRowHeight(7, 46); h.setRowHeight(8, 20);
  cards.forEach(function (card) {
    h.getRange(7, card[0], 1, 2).merge().setFormula(card[2])
      .setBackground('#ffffff').setFontFamily('Oswald').setFontWeight('bold')
      .setFontSize(26).setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, false, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(8, card[0], 1, 2).merge().setValue(card[1])
      .setBackground('#ffffff').setFontFamily('Oswald').setFontSize(8).setFontColor(MUTE)
      .setHorizontalAlignment('center').setVerticalAlignment('top')
      .setBorder(false, true, true, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
  });

  h.setRowHeight(9, 14); h.setRowHeight(10, 22);
  h.getRange('B10:G10').merge().setValue('ACTION ITEMS')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(11).setFontColor(GOLDDK)
    .setVerticalAlignment('bottom');
  h.getRange('H10:J10').merge().setValue('SEND REMINDERS')
    .setFontSize(8).setFontColor(MUTE).setHorizontalAlignment('right').setVerticalAlignment('bottom');
  h.getRange('K10').insertCheckboxes().setHorizontalAlignment('center');

  var sec = function (label, listF, countF) {
    return 'IF(' + countF + '=0,"","' + label + '"&CHAR(10)&' + listF + '&CHAR(10))';
  };
  var ovCount = 'COUNTIFS(' + E + '!$I$5:$I$44,">"&' + OV + ',' + E + '!$A$5:$A$44,"?*",' + E + '!$V$5:$V$44,"<>SNOOZED")';
  var ovList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + E + '!$A$5:$A$44&"  :  "&' + E + '!$I$5:$I$44&" days overdue  (FTO "&' + E + '!$D$5:$D$44&")",(' + E + '!$I$5:$I$44>' + OV + ')*(' + E + '!$A$5:$A$44<>"")*(' + E + '!$V$5:$V$44<>"SNOOZED")))';
  var rvCount = 'COUNTIF(' + E + '!$R$5:$R$44,"*Due*")';
  var rvList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + E + '!$A$5:$A$44&"  :  "&' + E + '!$R$5:$R$44,ISNUMBER(SEARCH("Due",' + E + '!$R$5:$R$44))))';
  var flCount = 'COUNTIF(' + AU + '!$B$5:$G$44,"FLAG")';
  var flList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + AU + '!$A$5:$A$44&"  :  "&MMULT(--(' + AU + '!$B$5:$G$44="FLAG"),SEQUENCE(6,1,1,0))&" flag(s)  (review on Audit)",MMULT(--(' + AU + '!$B$5:$G$44="FLAG"),SEQUENCE(6,1,1,0))>0))';
  var dqCount = 'COUNTIFS(' + DQ + '!$B$5:$B$300,"<>",' + DQ + '!$F$5:$F$300,"")';
  var dqList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + DQ + '!$B$5:$B$300&"  :  "&' + DQ + '!$C$5:$C$300&"  (file on Decision Record form)",(' + DQ + '!$B$5:$B$300<>"")*(' + DQ + '!$F$5:$F$300="")))';
  var sqCount = 'COUNTIFS(' + SQ + '!$B$5:$B$2000,"<>",' + SQ + '!$L$5:$L$2000,"OPEN")';
  var sqList = 'TEXTJOIN(CHAR(10),TRUE,FILTER(' + SQ + '!$B$5:$B$2000&"  :  "&' + SQ + '!$E$5:$E$2000&"  (review on Skill Validation Queue)",(' + SQ + '!$B$5:$B$2000<>"")*(' + SQ + '!$L$5:$L$2000="OPEN")))';
  h.getRange(11, 2, 4, 10).merge().setFormula(
    '=IF(' + ovCount + '+' + rvCount + '+' + flCount + '+' + dqCount + '+' + sqCount + '=0,' +
    '"ALL CLEAR. Nothing needs you right now.",' +
    'IFERROR(' + sec('OVERDUE EVALUATIONS', ovList, ovCount) + '&' +
    sec('REVIEWS DUE : 72 HOUR WINDOW', rvList, rvCount) + '&' +
    sec('AUDIT FLAGS', flList, flCount) + '&' +
    sec('OPEN DECISIONS', dqList, dqCount) + '&' +
    sec('SKILLS READY FOR VALIDATION', sqList, sqCount) + ',"See the Audit and Queue tabs."))')
    .setBackground('#ffffff').setFontSize(10).setWrap(true).setVerticalAlignment('top')
    .setBorder(true, true, true, true, false, false, HAIR, SpreadsheetApp.BorderStyle.SOLID);
  for (var rr = 11; rr <= 14; rr++) h.setRowHeight(rr, 28);

  function nav(row, col, label, sheetName) {
    var target = S.getSheetByName(sheetName);
    if (!target) return;
    h.getRange(row, col, 1, 2).merge()
      .setFormula('=HYPERLINK("#gid=' + target.getSheetId() + '","' + label + '")')
      .setBackground(INK).setFontColor('#f7f3ea').setFontFamily('Oswald')
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  h.setRowHeight(15, 12); h.setRowHeight(16, 30); h.setRowHeight(17, 8); h.setRowHeight(18, 30);
  nav(16, 2, 'TRAINEE MASTER', TAB.MASTER);
  nav(16, 4, 'SKILLS', TAB.SKILLS);
  nav(16, 6, 'DECISION QUEUE', TAB.QUEUE);
  nav(16, 8, 'AUDIT / FLAGS', '13 AUDIT - EXCEPTION LOG');
  nav(18, 2, 'ANALYTICS', '14 ANALYTICS');
  nav(18, 4, 'MISSION CONTROL', TAB.CONTROL);
  nav(18, 6, 'SHIFT EVALS', TAB.EVAL);
  nav(18, 8, 'URGENT CONCERNS', TAB.URGENT);
  h.getRange('B20:H20').merge().setValue('One click opens a core page. All forms, reports, and tools are behind MENU.')
    .setFontSize(8).setFontStyle('italic').setFontColor(MUTE);
  for (var spacer = 21; spacer <= 28; spacer++) h.setRowHeight(spacer, 8);

  h.setConditionalFormatRules([]);
  installRosterBoard();
  try {
    var badge = Utilities.newBlob(Utilities.base64Decode(BADGE_B64), 'image/png', 'scems_badge.png');
    h.insertImage(badge, 1, 1, 8, 6).setWidth(58).setHeight(65);
  } catch (e) {}
  S.setActiveSheet(h);
  S.moveActiveSheet(1);
  systemLog_('INFO', 'HOME REBUILT', 'Atomic replacement completed; roster board is unmerged.');
}

/* ---- ported from zz (effective winner) ---- */
function installRosterBoard() {
  var S = ss();
  var h = S.getSheetByName('HOME');
  if (!h) return;
  var INKC = '#1d1b18', HAIR = '#e8e4da', HEAD_BG = '#faf8f2';
  var E = "'" + TAB.ENGINE + "'", V9 = "'09 TRAINEE VIEW'", C0 = "'" + TAB.CONTROL + "'";
  var OV = C0 + '!$B$5';

  h.getRange('A29:M75').getMergedRanges().forEach(function (r) { r.breakApart(); });
  h.getRange(29, 2, 42, 7).clearContent().clearFormat().clearDataValidations();
  h.getRange(29, 2, 1, 7).setBackground(INKC);
  h.getRange('B29').setValue('ORIENTATION BOARD : ALL ACTIVE TRAINEES')
    .setFontColor('#c9a227').setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(12).setVerticalAlignment('middle');
  h.setRowHeight(29, 30);
  h.getRange(30, 2, 1, 7).setValues([[
    'TRAINEE','LEVEL','PHASE','SHIFT PROGRESS','LAST EVAL','LAST SHIFT FOCUS','WHAT IS NEEDED NEXT'
  ]]).setBackground(HEAD_BG).setFontColor(INKC).setFontFamily('Oswald')
    .setFontWeight('bold').setFontSize(9)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  h.setRowHeight(30, 24);

  for (var i = 0; i < 40; i++) {
    var er = 5 + i, br = 31 + i;
    var A = E + '!$A$' + er;
    h.getRange(br, 2, 1, 7).setBackground('#ffffff')
      .setBorder(false, false, false, false, false, true, HAIR, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(br, 2).setFormula('=IF(' + A + '="","",' + A + ')')
      .setFontWeight('bold').setFontSize(10);
    h.getRange(br, 3).setFormula('=IF(' + A + '="","",' + E + '!$B$' + er + ')').setFontSize(9);
    h.getRange(br, 4).setFormula(
      '=IF(' + A + '="","",' + E + '!$E$' + er + '&IF(' + E + '!$U$' + er + '=""," : start date needed"," : day "&' + E + '!$U$' + er + '))')
      .setFontSize(9);
    h.getRange(br, 5).setFormula(
      '=IF(' + A + '="","",IFERROR(REGEXREPLACE(' + E + '!$T$' + er + ',"^(Met|Short) : ","")&" shifts","not set"))')
      .setFontSize(9);
    h.getRange(br, 6).setFormula(
      '=IF(' + A + '="","",IF(' + E + '!$I$' + er + '="","none yet",' + E + '!$I$' + er + '&" day(s) ago"))')
      .setFontSize(9);
    h.getRange(br, 7).setFormula(
      '=IF(' + A + '="","",IF(' + V9 + '!$I$' + er + '="","set with FTO",' + V9 + '!$I$' + er + '))')
      .setFontSize(9).setWrap(true);
    h.getRange(br, 8).setFormula(
      '=IF(' + A + '="","",' +
      'IF(AND(' + E + '!$I$' + er + '<>"",' + E + '!$I$' + er + '>' + OV + '),"SHIFT EVALUATION NEEDED : "&' + E + '!$I$' + er + '&" days",' +
      'IF(ISNUMBER(SEARCH("NRT",' + E + '!$R$' + er + ')),"NRT DECISION PENDING",' +
      'IF(ISNUMBER(SEARCH("Advancement",' + E + '!$R$' + er + ')),"ADVANCEMENT REVIEW IN PROGRESS : 72h",' +
      'IF(AND(LEFT(' + E + '!$T$' + er + ',3)="Met",' + E + '!$E$' + er + '="Phase 4"),"RECOMMENDED FOR RELEASE REVIEW",' +
      'IF(LEFT(' + E + '!$T$' + er + ',3)="Met","MINIMUM SHIFTS MET : ELIGIBLE TO ADVANCE",' +
      '"ON TRACK"))))))')
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9);
    h.setRowHeight(br, 28);
  }
  h.getRange(31, 2, 40, 7).setVerticalAlignment('middle');
}

/* ---- ported from zz (effective winner) ---- */
function readLegacyRosterV19_() {
  var sh = ss().getSheetByName(TAB.CONTROL);
  if (!sh) return [];
  var lastRow = Math.min(sh.getLastRow(), 60);
  var lastCol = Math.min(sh.getLastColumn(), 14);
  if (lastRow < 2 || lastCol < 6) return [];
  var grid = sh.getRange(1, 1, lastRow, lastCol).getValues();

  // find the header row and the column the names sit in
  var hRow = -1, nameCol = -1;
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid[r].length; c++) {
      if (String(grid[r][c]).trim().toUpperCase() === 'FTO NAME') {
        hRow = r; nameCol = c; break;
      }
    }
    if (hRow >= 0) break;
  }
  if (hRow < 0) return [];

  // map the headers to the right of the name
  var cols = {};
  for (var c2 = nameCol; c2 < grid[hRow].length; c2++) {
    var h = String(grid[hRow][c2]).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!h) continue;
    if (h === 'FTO NAME' && cols.name === undefined) cols.name = c2;
    else if (h === 'SHIFT' && cols.shift === undefined) cols.shift = c2;
    else if (h === 'SHIFT') cols.shift2 = c2;
    else if (h === 'CERT LEVEL') cols.level = c2;
    else if (h === 'TRAINS EMT') cols.emt = c2;
    else if (h === 'TRAINS AEMT') cols.aemt = c2;
    else if (h.indexOf('TRAINS PARAMEDIC') === 0) cols.medic = c2;
  }

  var out = [];
  for (var r2 = hRow + 1; r2 < grid.length; r2++) {
    var name = String(grid[r2][cols.name] || '').trim();
    if (!name) continue;
    var shift = String(grid[r2][cols.shift] || '').trim();
    if (!shift && cols.shift2 !== undefined) shift = String(grid[r2][cols.shift2] || '').trim();
    out.push({
      sourceRow: r2 + 1,
      name: name,
      shift: shift,
      level: String(grid[r2][cols.level] || '').trim(),
      emt: String(grid[r2][cols.emt] || '').trim(),
      aemt: String(grid[r2][cols.aemt] || '').trim(),
      medic: String(grid[r2][cols.medic] || '').trim()
    });
  }
  out._cols = cols;
  out._headerRow = hRow + 1;
  return out;
}

/* ---- ported from zz (effective winner) ---- */
/** Writes the panel to HOME as coloured rows. */
function refreshActionPanelV19() {
  var S = ss();
  var h = S.getSheetByName('HOME');
  if (!h) return 'HOME not found.';

  var first = PANEL_FIRST_ROW_V19, n = PANEL_ROWS_V19;
  var area = h.getRange(first, 2, n, 10);
  area.getMergedRanges().forEach(function (r) { r.breakApart(); });
  area.clearContent().clearFormat();

  var items = collectActionItemsV19_();
  var shown = items.slice(0, n - (items.length > n ? 1 : 0));

  if (!items.length) {
    h.getRange(first, 2, 1, 2).merge().setValue('ALL CLEAR')
      .setBackground(SEV_V19.CLEAR.bg).setFontColor(SEV_V19.CLEAR.fg)
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(first, 4, 1, 7).merge()
      .setValue('Nothing needs you right now.')
      .setFontFamily('Inter').setFontSize(10).setFontColor('#847d6d')
      .setVerticalAlignment('middle');
    h.setRowHeight(first, 26);
    for (var e = first + 1; e < first + n; e++) h.setRowHeight(e, 4);
  } else {
    shown.forEach(function (it, i) {
      var row = first + i;
      var s = SEV_V19[it.sev] || SEV_V19.DUE;

      h.getRange(row, 2, 1, 2).merge().setValue(it.sev)
        .setBackground(s.bg).setFontColor(s.fg)
        .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');

      h.getRange(row, 4).setValue(it.who)
        .setFontFamily('Inter').setFontWeight('bold').setFontSize(10)
        .setFontColor('#1d1b18').setVerticalAlignment('middle');

      h.getRange(row, 5, 1, 2).merge().setValue(it.detail)
        .setFontFamily('Inter').setFontSize(9.5).setFontColor('#4a453c')
        .setVerticalAlignment('middle');

      h.getRange(row, 7, 1, 2).merge().setValue(it.owner)
        .setFontFamily('Inter').setFontSize(9).setFontColor('#847d6d')
        .setVerticalAlignment('middle');

      h.getRange(row, 9, 1, 2).merge().setValue(it.action)
        .setFontFamily('Inter').setFontSize(9).setFontColor('#847d6d')
        .setFontStyle('italic').setVerticalAlignment('middle');

      h.setRowHeight(row, 24);
    });

    if (items.length > shown.length) {
      var more = first + shown.length;
      h.getRange(more, 2, 1, 9).merge()
        .setValue('and ' + (items.length - shown.length) +
                  ' more. Open the tab for the full list.')
        .setFontFamily('Inter').setFontSize(9).setFontStyle('italic')
        .setFontColor('#847d6d');
      h.setRowHeight(more, 20);
    }
    for (var b = first + shown.length + (items.length > shown.length ? 1 : 0);
         b < first + n; b++) h.setRowHeight(b, 4);
  }

  // the tile above should agree with the panel
  try {
    h.getRange(7, 4, 1, 2).setValue(items.length);
  } catch (e) {}

  // the old footnote pointed at a button that no longer exists
  try {
    h.getRange('B20:H20').merge()
      .setValue('One click opens a core page. Everything else is on the SCEMS menu above.')
      .setFontSize(8).setFontStyle('italic').setFontColor('#847d6d');
  } catch (e) {}

  SpreadsheetApp.flush();
  var msg = 'Action panel rebuilt. ' + items.length + ' item(s).';
  Logger.log(msg + '\n' + items.map(function (i) {
    return '   ' + i.sev.padEnd(12) + i.who + '  :  ' + i.detail;
  }).join('\n'));
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function tidyForOperationsV19() {
  var S = ss();
  var shown = [], hidden = 0;
  S.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (OPERATIONAL_TABS_V19.indexOf(n) >= 0) {
      try { sh.showSheet(); shown.push(n); } catch (e) {}
    } else {
      try { sh.hideSheet(); hidden++; } catch (e) {}
    }
  });
  var home = S.getSheetByName('HOME');
  if (home) { try { S.setActiveSheet(home); S.moveActiveSheet(1); } catch (e) {} }

  var msg = 'Visible tabs: ' + shown.length + '\n  ' + shown.join('\n  ') +
    '\n\nHidden: ' + hidden + '. Nothing deleted, everything still receiving data.' +
    '\n\nshowAllTabsV19() brings them all back when you are working on the system.';
  Logger.log(msg);
  systemLog_('INFO', 'OPERATIONAL TAB SET', shown.length + ' visible, ' + hidden + ' hidden');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Unhides everything. For when you are working on the system yourself. */
function showAllTabsV19() {
  var S = ss(), n = 0;
  S.getSheets().forEach(function (sh) {
    try { if (sh.isSheetHidden()) { sh.showSheet(); n++; } } catch (e) {}
  });
  var msg = 'All tabs visible again. Unhidden: ' + n +
    '\n\nRun tidyForOperationsV19() to go back to the five working tabs.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
function refreshTraineeSkillsViewV19(name, view) {
  var S = ss();
  var sh = S.getSheetByName(TRAINEE_SKILLS_TAB_V19);
  if (!sh) return;

  var body = sh.getRange(6, 1, sh.getMaxRows() - 5, 8);
  body.getMergedRanges().forEach(function (r) { r.breakApart(); });
  body.clearContent().clearFormat().clearDataValidations();

  name = String(name || '').trim();
  view = String(view || '').trim() || TRAINEE_VIEWS_V19[0];

  if (!name) {
    sh.getRange('B6').setValue('Pick a trainee above.')
      .setFontFamily('Inter').setFontSize(11).setFontColor(TV.MUTE);
    return;
  }

  var rec = traineeRecordV19_(name) || {};
  var row = 6;

  sh.getRange(row, 2, 1, 7).merge()
    .setValue(name + '   ' + (rec.level || 'level not set') + '   ' +
              (rec.phase || 'phase not set') + '   FTO ' + (rec.fto || 'unassigned'))
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(14)
    .setFontColor(TV.INK).setVerticalAlignment('middle');
  sh.setRowHeight(row, 28);
  row += 2;

  if (view === 'Skills completed')      viewSkillsCompletedV19_(sh, name, row);
  else if (view === 'Skills remaining') viewSkillsRemainingV19_(sh, name, rec, row);
  else if (view === 'Skills by phase')  viewSkillsByPhaseV19_(sh, name, row);
  else if (view === 'Recent activity')  viewActivityV19_(sh, name, row);
  else                                  viewOverviewV19_(sh, name, rec, row);
}

/* ---- ported from zz (effective winner) ---- */
function buildTraineeSkillsViewV19() {
  var S = ss();
  var sh = S.getSheetByName(TRAINEE_SKILLS_TAB_V19);
  if (!sh) sh = S.insertSheet(TRAINEE_SKILLS_TAB_V19);
  sh.clear();
  sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  if (sh.getMaxRows() < 300) sh.insertRowsAfter(sh.getMaxRows(), 300 - sh.getMaxRows());
  if (sh.getMaxColumns() > 8) sh.deleteColumns(9, sh.getMaxColumns() - 8);
  if (sh.getMaxColumns() < 8) sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());

  sh.setHiddenGridlines(true);
  sh.setTabColor('#5b8266');

  sh.getRange(1, 1, 2, 8).setBackground(TV.INK).setFontFamily('Inter');
  sh.getRange('B1').setValue('TRAINEE RECORD')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18)
    .setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.getRange('B2').setValue('Pick a trainee and a view. Everything below updates on its own.')
    .setFontSize(9).setFontColor(TV.GOLD).setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22); sh.setRowHeight(3, 10);

  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(BADGE_B64), 'image/png', 'badge.png');
    sh.insertImage(blob, 1, 1, 6, 5).setWidth(56).setHeight(62);
  } catch (e) {}

  sh.getRange('B4').setValue('TRAINEE')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setFontColor(TV.GOLDD).setVerticalAlignment('middle');
  sh.getRange('C4').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([''].concat(traineeList()), true)
      .setAllowInvalid(false).build())
    .setBackground('#fff7dc').setFontFamily('Inter').setFontWeight('bold')
    .setFontSize(12).setVerticalAlignment('middle');

  sh.getRange('D4').setValue('SHOW ME')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setFontColor(TV.GOLDD).setHorizontalAlignment('right')
    .setVerticalAlignment('middle');
  sh.getRange('E4').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(TRAINEE_VIEWS_V19, true)
      .setAllowInvalid(false).build())
    .setValue(TRAINEE_VIEWS_V19[0])
    .setBackground('#fff7dc').setFontFamily('Inter').setFontWeight('bold')
    .setFontSize(11).setVerticalAlignment('middle');
  sh.setRowHeight(4, 30);

  [68, 130, 300, 130, 175, 110, 150, 300].forEach(function (w, i) {
    sh.setColumnWidth(i + 1, w);
  });
  sh.setFrozenRows(4);
  SpreadsheetApp.flush();

  refreshTraineeSkillsViewV19(String(sh.getRange('C4').getValue() || ''),
                             String(sh.getRange('E4').getValue() || ''));

  var msg = TRAINEE_SKILLS_TAB_V19 + ' rebuilt with a view selector.\n\n' +
    'C4 picks the trainee. E4 picks the view:\n' +
    TRAINEE_VIEWS_V19.map(function (v) { return '   ' + v; }).join('\n') +
    '\n\nChange either and the page redraws.';
  Logger.log(msg);
  systemLog_('INFO', 'TRAINEE PAGE BUILT', TRAINEE_VIEWS_V19.length + ' views');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Fired when a trainee name appears on tab 01. Throttled and locked. */
function syncNewTraineeV19_(name) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('ROSTER_SYNC_AT') || 0);
  if (new Date().getTime() - last < 20000) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    props.setProperty('ROSTER_SYNC_AT', String(new Date().getTime()));
    var notes = [];

    try { refreshDropdowns(); notes.push('form dropdowns refreshed'); }
    catch (e) { notes.push('dropdown refresh failed: ' + e); }

    try { rebuildSkillMatrixV19_(); notes.push('skill matrix built'); }
    catch (e) { notes.push('skill matrix failed: ' + e); }

    var rec = traineeRecordV19_(name);
    var gaps = [];
    if (rec) {
      if (!rec.level) gaps.push('certification level');
      if (!rec.fto)   gaps.push('assigned FTO');
      if (!rec.phase) gaps.push('current phase');
      if (!rec.email) gaps.push('email address, so no Monday status card');
    }

    systemLog_('INFO', 'ROSTER SYNC', name + ' : ' + notes.join('; ') +
      (gaps.length ? ' | still needs: ' + gaps.join(', ') : ''));

    try {
      ss().toast(name + ' added. Forms and skills updated.' +
        (gaps.length ? ' Still needs: ' + gaps.join(', ') + '.' : ''), 'SCEMS', 8);
    } catch (t) {}

    if (gaps.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Trainee Added : ' + name + ' : Record Incomplete',
        name + ' was added to 01 TRAINEE MASTER and the forms have been updated.\n\n' +
        'The following are still blank and the record is not fully usable until they are filled:\n  - ' +
        gaps.join('\n  - ') +
        '\n\nA missing certification level means no skill checklist is built. A missing ' +
        'email means no weekly status card.');
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---- ported from zz (effective winner) ---- */
function badgeUriV19_() {
  return 'data:image/png;base64,' + BADGE_B64;
}

/* ---- ported from zz (effective winner) ---- */
/** The badge, as an inline image blob. */
function badgeBlobV19_() {
  try {
    return Utilities.newBlob(Utilities.base64Decode(BADGE_B64),
                             'image/png', 'scems_badge.png');
  } catch (e) { return null; }
}

/* ---- ported from zz (effective winner) ---- */
/** Shared dark banner with the badge. */
function emailBannerV19_(kicker, title, subtitle, meta, hasBadge) {
  var INK = '#1d1b18', GOLD = '#c9a227';
  var h = [];
  h.push('<div style="background:' + INK + ';padding:22px 24px 20px 24px;border-radius:8px 8px 0 0;">');
  h.push('<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>');
  if (hasBadge) {
    h.push('<td style="width:64px;vertical-align:top;padding:0 16px 0 0;">' +
      '<img src="cid:scemsbadge" width="56" style="display:block;width:56px;"></td>');
  }
  h.push('<td style="vertical-align:top;">');
  h.push('<div style="font:600 11px Arial,sans-serif;color:' + GOLD +
    ';letter-spacing:2px;margin:0 0 6px 0;">' + escHtmlV19_(kicker) + '</div>');
  h.push('<div style="font:700 25px Arial,sans-serif;color:#ffffff;line-height:1.1;">' +
    escHtmlV19_(title) + '</div>');
  if (subtitle) {
    h.push('<div style="font:700 17px Arial,sans-serif;color:' + GOLD +
      ';margin:4px 0 0 0;">' + escHtmlV19_(subtitle) + '</div>');
  }
  h.push('<div style="font:13px Arial,sans-serif;color:#b4ac9c;margin:12px 0 0 0;">' +
    meta + '</div>');
  h.push('</td></tr></table></div>');
  h.push('<div style="height:5px;background:' + GOLD + ';"></div>');
  return h.join('');
}

/* ---- ported from zz (effective winner) ---- */
/** The full handover email for one trainee. */
function handoverHtmlV19_(traineeName, requestedBy, reason) {
  var f = snapshotFactsV19_(traineeName);
  if (!f || !f.name) return null;
  var skills = handoverSkillsV19_(traineeName);
  var progress = progressLineV19_(traineeName);

  var INK = '#1d1b18', GOLD = '#c9a227', GOLDD = '#8a6a1f',
      RED = '#c43a28', GREEN = '#3f8f5a', MUTE = '#847d6d',
      HAIR = '#e8e4da', HAND = '#7d6a94';

  function panel(title, inner, accent) {
    return '<div style="background:#ffffff;border:1px solid ' + HAIR +
      ';border-left:5px solid ' + (accent || HAND) +
      ';border-radius:8px;padding:16px 20px;margin:0 0 12px 0;">' +
      '<div style="font:600 10px Arial,sans-serif;color:' + GOLDD +
      ';letter-spacing:1.6px;margin:0 0 10px 0;">' + escHtmlV19_(title) + '</div>' +
      inner + '</div>';
  }
  function skillList(arr, empty, colour) {
    if (!arr.length) {
      return '<div style="font:13px Arial,sans-serif;color:' + MUTE + ';">' +
        escHtmlV19_(empty) + '</div>';
    }
    return '<div style="font:13px Arial,sans-serif;color:#33302b;line-height:1.75;">' +
      arr.map(function (s) {
        return '<span style="color:' + colour + ';">&#9679;</span> ' + escHtmlV19_(s);
      }).join('<br>') + '</div>';
  }
  function badge(t, bg, fg) {
    if (!t) return '';
    return '<span style="display:inline-block;background:' + bg + ';color:' + fg +
      ';font:600 11px Arial,sans-serif;padding:4px 10px;border-radius:11px;' +
      'margin:0 6px 0 0;">' + escHtmlV19_(t) + '</span>';
  }

  var h = [];
  h.push('<div style="background:#f7f3ea;padding:24px 16px;font-family:Arial,sans-serif;">');
  h.push('<div style="max-width:640px;margin:0 auto;">');
  h.push(emailBannerV19_('SUMTER COUNTY EMS', 'TRAINEE HANDOVER CARD',
    escHtmlV19_(traineeName),
    'Requested by ' + escHtmlV19_(requestedBy || 'you') +
    '&nbsp; &middot; &nbsp;' + escHtmlV19_(reason || 'covering a shift'),
    true));

  h.push('<div style="background:#f7f3ea;padding:18px 4px 4px 4px;">');

  // where they are
  var where = [];
  where.push('<div style="margin:0 0 12px 0;">' +
    badge(f.level, INK, '#ffffff') +
    badge(f.phase ? f.phase + ' of 4' : '', GOLD, INK) +
    badge(f.week, '#f1ede2', GOLDD) + '</div>');
  where.push('<table cellpadding="0" cellspacing="0" style="width:100%;font:13px Arial,sans-serif;">');
  where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
    ';white-space:nowrap;">Usual FTO</td><td style="color:#33302b;">' +
    escHtmlV19_(f.fto) + '</td></tr>');
  where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
    ';white-space:nowrap;">Shifts</td><td style="color:#33302b;">' +
    escHtmlV19_(progress) + '</td></tr>');
  if (f.evals > 0 && f.avg) {
    where.push('<tr><td style="padding:3px 14px 3px 0;color:' + MUTE +
      ';white-space:nowrap;">Scoring</td><td style="color:#33302b;">averaging <b>' +
      f.avg + ' / 5</b>' + (f.trend ? ', ' + escHtmlV19_(f.trend.toLowerCase()) : '') +
      '</td></tr>');
  }
  where.push('</table>');
  h.push(panel('WHERE THEY ARE', where.join(''), HAND));

  // what to work on
  var work = '<div style="font:14px Arial,sans-serif;color:#33302b;line-height:1.6;">' +
    (f.focus ? escHtmlV19_(f.focus)
             : '<span style="color:' + MUTE + ';">Not set. Agree a focus with them at the start of the shift.</span>') +
    '</div>';
  if (f.strength) {
    work += '<div style="margin:12px 0 0 0;padding:10px 12px;background:#f2f7f3;' +
      'border-radius:5px;font:13px Arial,sans-serif;color:#33302b;">' +
      '<b style="color:' + GREEN + ';">Doing well</b> &nbsp; ' +
      escHtmlV19_(f.strength) + '</div>';
  }
  h.push(panel('WHAT THEY ARE WORKING ON', work, GOLD));

  // skills
  var sk = [];
  sk.push('<div style="font:600 12px Arial,sans-serif;color:' + GREEN +
    ';margin:0 0 6px 0;">Signed off (' + skills.signed.length + ')</div>');
  sk.push(skillList(skills.signed, 'None signed off yet.', GREEN));
  sk.push('<div style="font:600 12px Arial,sans-serif;color:' + GOLDD +
    ';margin:16px 0 6px 0;">In progress (' + skills.progress.length + ')</div>');
  sk.push(skillList(skills.progress, 'Nothing recorded in progress.', GOLD));
  if (skills.ready.length) {
    sk.push('<div style="font:600 12px Arial,sans-serif;color:' + RED +
      ';margin:16px 0 6px 0;">Awaiting validation (' + skills.ready.length + ')</div>');
    sk.push(skillList(skills.ready, '', RED));
    sk.push('<div style="margin:8px 0 0 0;font:12px Arial,sans-serif;color:' + RED + ';">' +
      'These are with leadership. Do not sign them off yourself.</div>');
  }
  h.push(panel('SKILLS', sk.join(''), GREEN));

  // on shift
  var shift = '<div style="font:13px Arial,sans-serif;color:#33302b;line-height:1.65;">' +
    'Submit a Shift Evaluation before you go home, the same as their usual FTO would. ' +
    'Score what you actually saw. If a skill progressed, log it.<br><br>' +
    'You are covering, so you are not expected to judge their whole progression. ' +
    'Record the shift you had with them.<br><br>' +
    'Anything unsafe is a call to Division Chief Stuckey the same shift, then the ' +
    'Urgent Concern form.</div>' +
    '<div style="margin:12px 0 0 0;padding:10px 12px;background:#fdf3f1;' +
    'border-radius:5px;font:600 12px Arial,sans-serif;color:' + RED + ';">' +
    'No patient names, dates of birth, or addresses. Call numbers only.</div>';
  h.push(panel('ON SHIFT', shift, RED));

  h.push('<div style="border-top:1px solid ' + HAIR + ';margin:8px 4px 0 4px;' +
    'padding:16px 0 0 0;font:11.5px Arial,sans-serif;color:' + MUTE + ';line-height:1.6;">' +
    'This card is an operational snapshot. It does not carry concerns, decisions, ' +
    'audit flags, or another FTO\'s assessment of this trainee.<br><br>' +
    'Every request for a handover card is logged and notifies the Division Chief ' +
    'of Training.</div>');
  h.push('</div></div></div>');
  return h.join('');
}

/* ---- ported from zz (effective winner) ---- */
/** Skills, split by state, for one trainee. */
function handoverSkillsV19_(name) {
  var out = { signed: [], progress: [], ready: [] };
  var m = ss().getSheetByName(TAB.SKILLS);
  if (!m || m.getLastRow() < 5) return out;
  m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
    if (String(r[0]).trim() !== String(name).trim()) return;
    var skill = String(r[1] || '');
    if (!skill) return;
    var readiness = String(r[6] || '');
    var signoff = String(r[7] || '');
    if (signoff === 'SIGNED OFF') out.signed.push(skill);
    else if (readiness === 'READY FOR VALIDATION') out.ready.push(skill);
    else if (readiness === 'IN PROGRESS') out.progress.push(skill);
  });
  return out;
}

/* ---- ported from zz (effective winner) ---- */
/** Reads the portal file raw and injects the badge whichever way it can.
 *  Returns an object so the checker can report what happened. */
function portalHtmlV19_() {
  var raw = '';
  try {
    raw = HtmlService.createHtmlOutputFromFile(PORTAL_FILE_V19).getContent();
  } catch (e) {
    return { ok: false, how: 'file not found', html: '', note: String(e) };
  }

  var uri = badgeUriV19_();
  var how = '';

  if (raw.indexOf('data:image/png;base64,') >= 0) {
    how = 'already contained a badge, left as is';
  } else if (/<\?=\s*badgeUri\s*\?>/.test(raw)) {
    raw = raw.replace(/<\?=\s*badgeUri\s*\?>/g, uri);
    how = 'template tag replaced';
  } else if (raw.indexOf('--badge:none; --badge-size:0px;') >= 0) {
    raw = raw.replace('--badge:none; --badge-size:0px;',
      '--badge:url("' + uri + '"); --badge-size:78px;');
    how = 'standalone placeholder replaced';
  } else if (raw.indexOf('--badge:none') >= 0) {
    raw = raw.replace(/--badge:\s*none\s*;/, '--badge:url("' + uri + '");')
             .replace(/--badge-size:\s*0px\s*;/, '--badge-size:78px;');
    how = 'loose placeholder replaced';
  } else {
    how = 'NO INJECTION POINT FOUND';
    return { ok: false, how: how, html: raw, note: 'The portal file has no badge slot.' };
  }

  return { ok: true, how: how, html: raw, note: '' };
}

/* [doGet : superseded by the v20.1 implementation in another file] */

/* ---- ported from zz (effective winner) ---- */
function portalUrlV19() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  var lines = ['FIELD TRAINING PORTAL'];
  if (url) {
    lines.push('');
    lines.push(url);
    lines.push('');
    lines.push('Sites: edit, Insert, Embed, By URL, paste that, Insert.');
    lines.push('Drag full width, about 760 pixels tall, then Publish.');
  } else {
    lines.push('');
    lines.push('Not deployed yet. Deploy, New deployment, gear icon,');
    lines.push('Web app, Execute as Me, Who has access Anyone, Deploy.');
  }
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Reports exactly what is in the portal file and what got injected. */
function checkPortalV19() {
  var lines = ['PORTAL PRE-DEPLOY CHECK'];
  var ok = true;

  var bytes = 0;
  try {
    bytes = Utilities.base64Decode(BADGE_B64).length;
    lines.push('badge decodes    : yes, ' + bytes + ' bytes');
  } catch (e) {
    ok = false;
    lines.push('badge decodes    : FAILED, ' + e);
  }

  var built = portalHtmlV19_();
  if (!built.ok) {
    ok = false;
    lines.push('portal file      : ' + built.how);
    if (built.note) lines.push('                   ' + built.note);
  } else {
    lines.push('portal file      : found');
    lines.push('badge injection  : ' + built.how);
    lines.push('page size        : ' + built.html.length + ' characters');
    var hasBadge = built.html.indexOf('data:image/png;base64,') >= 0;
    lines.push('badge embedded   : ' + (hasBadge ? 'yes' : 'NO'));
    if (!hasBadge) ok = false;
    var forms = built.html.split('docs.google.com/forms').length - 1;
    lines.push('form links found : ' + forms + ' of ' + PORTAL_CARDS.length);
    if (forms !== PORTAL_CARDS.length) ok = false;
    lines.push('watermark wired  : ' +
      (built.html.indexOf('background-image:var(--badge)') >= 0 ? 'yes' : 'no'));
  }

  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  lines.push('');
  if (url) {
    lines.push('Already deployed at:');
    lines.push('   ' + url);
    lines.push('');
    lines.push('You changed the code, so publish the change:');
    lines.push('Deploy, Manage deployments, pencil icon,');
    lines.push('Version: New version, Deploy.');
  } else {
    lines.push('Not deployed yet.');
    lines.push('Deploy, New deployment, gear icon, Web app,');
    lines.push('Execute as Me, Who has access Anyone, Deploy.');
  }

  lines.push('');
  lines.push(ok ? 'READY.' : 'NOT READY. Fix the items above.');

  var msg = lines.join('\n');
  Logger.log(msg);
  systemLog_(ok ? 'INFO' : 'WARN', 'PORTAL CHECK', built.how + '; ' + built.html.length + ' chars');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Matrix layout: title off the badge, SKILL ID column hidden. */
function applySkillsLayoutV19_() {
  var S = ss();
  var sh = S.getSheetByName(TAB.SKILLS);
  if (sh) {
    ensureSheetCapacityV19_(sh, 3000, 23);
    sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
    sh.setHiddenGridlines(true);
    sh.setFrozenRows(4);
    sh.setFrozenColumns(2);
    sh.setTabColor('#8a6a1f');
    sh.getRange(1, 1, 2, 23).setBackground('#1d1b18').setFontFamily('Inter');
    sh.getRange('A1:A2').clearContent();
    sh.getRange('B1').setValue('SKILL COMPETENCY MATRIX : v19')
      .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18).setFontColor('#ffffff')
      .setVerticalAlignment('middle');
    sh.getRange('B2').setValue('Current status derived from the append-only evidence and sign-off logs. No progress is entered directly on this sheet.')
      .setFontSize(9).setFontColor('#c9a227').setVerticalAlignment('top');
    sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
    sh.getRange(4, 1, 1, 20).setValues([SKILL_MATRIX_HEADERS_V19])
      .setBackground('#faf8f2').setFontColor('#1d1b18').setFontFamily('Oswald')
      .setFontWeight('bold').setFontSize(9).setWrap(true)
      .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sh.setRowHeight(4, 42);
    sh.getRange('V1').setValue('TRAINEE VIEW').setFontFamily('Oswald')
      .setFontWeight('bold').setFontColor('#c9a227');
    sh.getRange('V2').setValue('Selected trainee');
    var current = String(sh.getRange('W2').getValue() || '');
    if (current && traineeList().indexOf(current) < 0) current = '';
    sh.getRange('W2').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList([''].concat(traineeList()), true)
        .setAllowInvalid(false).build())
      .setBackground('#fff7dc').setValue(current);
    var kpis = [
      ['Required skills','=IF($W$2="","",COUNTIF($A$5:$A$3000,$W$2))'],
      ['Not started','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"NOT STARTED"))'],
      ['In progress','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"IN PROGRESS"))'],
      ['Ready for validation','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"READY FOR VALIDATION"))'],
      ['Signed off','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$H$5:$H$3000,"SIGNED OFF"))'],
      ['Needs review','=IF($W$2="","",COUNTIFS($A$5:$A$3000,$W$2,$G$5:$G$3000,"*REVIEW*"))']
    ];
    kpis.forEach(function (k, i) {
      sh.getRange(3 + i, 22).setValue(k[0]).setFontSize(9).setFontColor('#847d6d');
      sh.getRange(3 + i, 23).setFormula(k[1]).setFontFamily('Oswald').setFontWeight('bold')
        .setHorizontalAlignment('center');
    });
    sh.getRange('A5:T3000').setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
    sh.getRange('B5:B3000').setWrap(true);
    sh.getRange('D5:D3000').setNumberFormat('yyyy-mm-dd');
    sh.getRange('R5:S3000').setNumberFormat('yyyy-mm-dd');
    var widths = [185,310,72,105,150,105,195,105,165,115,95,110,100,95,150,150,190,105,105,360,18,145,165];
    widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    try { sh.hideColumns(10); } catch (e) {}
    var stageRange = sh.getRange('C5:C3000'), readyRange = sh.getRange('G5:G3000'),
        signRange = sh.getRange('H5:H3000');
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('O').setBackground('#dbeafe')
        .setFontColor('#1f5673').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('A').setBackground('#fff1c2')
        .setFontColor('#8a6a1f').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('P').setBackground('#f5df99')
        .setFontColor('#6d5318').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('I').setBackground('#dcefe2')
        .setFontColor('#2f6f45').setBold(true).setRanges([stageRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('READY FOR VALIDATION')
        .setBackground('#fff1c2').setFontColor('#6d5318').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains('REVIEW')
        .setBackground('#f8d7d2').setFontColor('#8f1f12').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains('REQUIRED')
        .setBackground('#f8d7d2').setFontColor('#8f1f12').setBold(true).setRanges([readyRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SIGNED OFF')
        .setBackground('#3f8f5a').setFontColor('#ffffff').setBold(true).setRanges([signRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('EXPIRED')
        .setBackground('#c43a28').setFontColor('#ffffff').setBold(true).setRanges([signRange]).build()
    ]);
    try {
      var old = sh.getFilter(); if (old) old.remove();
      sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 2), 20).createFilter();
    } catch (e) {}
  }
  applyCatalogLayoutV19_();
  var evidence = S.getSheetByName(TAB.SKILL_EVIDENCE);
  if (evidence) styleSkillDataSheetV19_(evidence, 'SKILL EVIDENCE LOG',
    'Append-only normalized record. One row equals one submitted skill event. Do not edit.', 20, '#1f5673');
  var queue = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (queue) buildSkillValidationQueueV19_();
  var signoff = S.getSheetByName(TAB.SKILL_SIGNOFF);
  if (signoff) styleSkillDataSheetV19_(signoff, 'SKILL SIGN-OFF LOG',
    'Append-only leadership decisions. Matrix status is derived from the latest recorded decision.', 12, '#5b8266');
}

/* ---- ported from zz (effective winner) ---- */
/** Catalog layout with the title moved off the badge. Column A stays
 *  visible: deploymentPreflight() validates that A4 reads SKILL ID. */
function applyCatalogLayoutV19_() {
  var sh = ss().getSheetByName(SKILL_CATALOG_TAB);
  if (!sh || String(sh.getRange('A4').getValue()) !== 'SKILL ID') return;
  ensureSheetCapacityV19_(sh, 500, 17);
  sh.getDataRange().getMergedRanges().forEach(function (r) { r.breakApart(); });
  sh.getRange('A5:Q500').clearDataValidations();
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(4);
  sh.setFrozenColumns(3);
  sh.setTabColor('#8a6a1f');
  sh.getRange(1, 1, 2, 17).setBackground('#1d1b18').setFontFamily('Inter');
  sh.getRange('A1:A2').clearContent();
  sh.getRange('B1').setValue('SKILL CATALOG : v19 CONTROLLED STANDARD')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(18).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.getRange('B2').setValue('Leadership-controlled applicability and evidence thresholds. APPROVED means the row was clinically and operationally reviewed.')
    .setFontSize(9).setFontColor('#c9a227').setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
  sh.getRange(4, 1, 1, 17).setValues([SKILL_CATALOG_HEADERS_V19])
    .setBackground('#faf8f2').setFontColor('#1d1b18').setFontFamily('Oswald')
    .setFontWeight('bold').setFontSize(9).setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(4, 42);
  sh.getRange('D5:Q500').setBackground('#fff7dc');
  var yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes','No'], true)
    .setAllowInvalid(false).build();
  sh.getRange('D5:G500').setDataValidation(yesNo);
  sh.getRange('I5:L500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(1).setAllowInvalid(false).build());
  sh.getRange('M5:M500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['Division Chief of Training','Medical Director','Division Chief + Medical Director'], true)
      .setAllowInvalid(false).build());
  sh.getRange('Q5:Q500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['DRAFT : APPLICABILITY / THRESHOLD REVIEW','APPROVED','RETIRED'], true)
      .setAllowInvalid(false).build());
  sh.getRange('O5:P500').setNumberFormat('yyyy-mm-dd');
  sh.getRange('A5:Q500').setFontFamily('Inter').setFontSize(9).setVerticalAlignment('middle');
  sh.getRange('B5:C500').setWrap(true);
  var widths = [110,155,330,92,105,120,72,220,105,115,105,100,190,260,105,105,190];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('APPROVED')
      .setBackground('#3f8f5a').setFontColor('#ffffff').setBold(true)
      .setRanges([sh.getRange('Q5:Q500')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('DRAFT')
      .setBackground('#c43a28').setFontColor('#ffffff').setBold(true)
      .setRanges([sh.getRange('Q5:Q500')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('RETIRED')
      .setBackground('#e8e4da').setFontColor('#6f6a61')
      .setRanges([sh.getRange('Q5:Q500')]).build()
  ]);
  try {
    var oldFilter = sh.getFilter(); if (oldFilter) oldFilter.remove();
    sh.getRange(4, 1, Math.max(sh.getLastRow() - 3, 2), 17).createFilter();
  } catch (e) {}
}

/* ---- ported from zz (effective winner) ---- */
/** Title moves to B1 and B2 so the badge in column A no longer sits on top
 *  of it, and the internal SKILL ID column is hidden. */
function styleSkillDataSheetV19_(sh, title, subtitle, cols, accent) {
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(4);
  sh.setFrozenColumns(1);
  sh.setTabColor(accent);
  sh.getRange(1, 1, 2, cols).setBackground('#1d1b18').setFontFamily('Inter');
  sh.getRange('A1:A2').clearContent();
  sh.getRange('B1').setValue(title).setFontFamily('Oswald').setFontWeight('bold')
    .setFontSize(18).setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.getRange('B2').setValue(subtitle).setFontSize(9).setFontColor('#c9a227')
    .setVerticalAlignment('top');
  sh.setRowHeight(1, 34); sh.setRowHeight(2, 22);
  sh.getRange(4, 1, 1, cols).setBackground('#faf8f2').setFontColor('#1d1b18')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9).setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange(5, 1, sh.getMaxRows() - 4, cols).setFontFamily('Inter').setFontSize(9)
    .setVerticalAlignment('middle');
  sh.setRowHeight(4, 42);
  hideSkillIdColumnV19_(sh);
  try {
    var oldFilter = sh.getFilter(); if (oldFilter) oldFilter.remove();
    sh.getRange(4, 1, Math.max(sh.getLastRow() - 3, 2), cols).createFilter();
  } catch (e) {}
}

/* ---- ported from zz (effective winner) ---- */
/** Dropdown choices are the plain skill name, ordered by domain so the list
 *  still reads in clinical groups. No SK number is shown to the FTO. */
function approvedSkillChoicesV19_() {
  return catalogObjectsV19_(false)
    .filter(function (c) { return c.active; })
    .sort(function (a, b) {
      return (a.domain + '|' + a.skill).localeCompare(b.domain + '|' + b.skill);
    })
    .map(function (c) { return c.skill; });
}

/* ---- ported from zz (effective winner) ---- */
/** Resolves the submitted choice back to the internal Skill ID. Accepts the
 *  plain skill name used now, and still accepts the older
 *  "SK-... | LEVELS | DOMAIN | SKILL" label so historical responses and any
 *  in-flight submission continue to resolve correctly. */
function parseSkillChoiceIdV19_(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  var first = raw.split('|')[0].trim();
  if (/^SK-[A-Z0-9-]+$/.test(first)) return first;
  var maps = catalogMapsV19_(true);
  var direct = maps.byName[normalizeSkillNameV19_(raw)];
  if (direct) return direct.id;
  var parts = raw.split('|');
  if (parts.length > 1) {
    var tail = maps.byName[normalizeSkillNameV19_(parts[parts.length - 1])];
    if (tail) return tail.id;
  }
  return '';
}

/* ---- ported from zz (effective winner) ---- */
/** Override. Same behaviour, but sorted by trainee and both dropdowns
 *  re-armed after every write so they cannot quietly vanish. */
function refreshSkillValidationQueueV19_() {
  var S = ss();
  var matrix = S.getSheetByName(TAB.SKILLS);
  var queue = S.getSheetByName(TAB.SKILL_VALIDATION);
  if (!matrix || !queue) return;

  var matrixRows = matrix.getLastRow() >= 5
    ? matrix.getRange(5, 1, matrix.getLastRow() - 4, 20).getValues() : [];
  var queueRows = queue.getLastRow() >= 5
    ? queue.getRange(5, 1, queue.getLastRow() - 4, 13).getValues() : [];
  var catalogById = catalogMapsV19_(true).byId;

  var open = {}, readyKeys = {};
  queueRows.forEach(function (r, i) {
    var key = String(r[1]) + '||' + String(r[2]);
    if (String(r[11]) === 'OPEN') open[key] = i + 5;
  });

  var add = [];
  matrixRows.forEach(function (r) {
    var readiness = String(r[6] || '');
    if (readiness !== 'READY FOR VALIDATION' &&
        readiness !== 'SIGNED OFF - REVIEW REQUIRED' &&
        readiness !== 'LEGACY SIGN-OFF REVIEW REQUIRED') return;
    var key = String(r[0]) + '||' + String(r[9]);
    readyKeys[key] = true;
    if (open[key]) return;
    var catalog = catalogById[String(r[9])] || {};
    add.push([
      r[3] || new Date(), r[0], r[9], r[8], r[1],
      (Number(r[10]) || 0) + '  /  ' + (Number(r[11]) || 0) + '  /  ' +
        (Number(r[12]) || 0) + '  /  ' + (Number(r[13]) || 0),
      null, null, null, null, null, 'OPEN', r[3] || null
    ]);
  });

  sweepStaleQueueRowsV20_2_(queue, open, readyKeys, matrixRows.length, queueRows);

  if (add.length) {
    var start = Math.max(queue.getLastRow() + 1, 5);
    var needed = start + add.length - 1;
    if (queue.getMaxRows() < needed) {
      queue.insertRowsAfter(queue.getMaxRows(), needed - queue.getMaxRows() + 20);
    }
    var target = queue.getRange(start, 1, add.length, 13);
    target.clearDataValidations();
    target.setValues(add);
    systemLog_('INFO', 'SKILL VALIDATION QUEUE APPEND',
      add.length + ' row(s) added starting at row ' + start + '.');
  }

  // sort open rows by trainee then skill, leaving recorded rows in place
  // v20.1: never re-sort while any OPEN row holds a draft decision —
  // sorting under a leader mid-selection was the row-swap defect.
  var drafts = queueRows.some(function (qr) {
    return String(qr[11]) === 'OPEN' && String(qr[6] || '').trim();
  });
  if (!drafts) { try { sortQueueByTraineeV20_(queue); } catch (e) {} }

  // both dropdowns, every time, so they cannot vanish on a refresh
  armQueueValidationV20_(queue);

  // and refresh the review flags for anything newly added
  try { runSkillAuditV20(); } catch (e) {}
}

/* ---------------------------------------------------------------- *
 *  Stale-queue sweep  (v20.2)
 * ---------------------------------------------------------------- */

/** The most rows one automatic sweep may cancel before it refuses and asks
 *  for a human. A real criteria change — a catalog edit, a level correction —
 *  moves a handful of rows. Dozens at once is a symptom, not an intention. */
var QUEUE_SWEEP_MAX_V20_2 = 10;

/** Cancels queue rows whose skill is no longer ready.
 *
 *  This used to be one line:
 *
 *    Object.keys(open).forEach(function (key) {
 *      if (!readyKeys[key]) queue.getRange(open[key], 12)
 *        .setValue('CANCELLED : CRITERIA CHANGED');
 *    });
 *
 *  readyKeys is built entirely from the matrix, and its caller,
 *  rebuildSkillMatrixV19_, clears the matrix and then writes rows only
 *  `if (output.length)`. So any run that produced no output — an empty
 *  roster, a catalog with no active skills, a level lookup that threw —
 *  left readyKeys empty, and the sweep cancelled EVERY open sign-off
 *  request in the queue. In bulk. With no log, no attribution, and no
 *  confirmation, on a schedule, including rows a leader was mid-decision on
 *  three lines above where drafts are explicitly protected from sorting.
 *
 *  A stale OPEN row is a visible nuisance. A wrongly cancelled one is lost
 *  work that nobody is told about. This refuses when it cannot tell the
 *  difference. */
function sweepStaleQueueRowsV20_2_(queue, open, readyKeys, matrixRowCount, queueRows) {
  var openKeys = Object.keys(open);
  if (!openKeys.length) return 0;

  // 1. No matrix means "we cannot tell", never "nothing qualifies".
  if (!matrixRowCount) {
    systemLog_('ERROR', 'QUEUE SWEEP REFUSED',
      'The skill matrix read back empty, so every one of the ' + openKeys.length +
      ' open request(s) would have been cancelled as "criteria changed". ' +
      'Nothing was cancelled. Rebuild the matrix and check the roster and catalog.');
    return 0;
  }

  // 2. A row holding a draft decision belongs to whoever is deciding it.
  var draftRows = {};
  (queueRows || []).forEach(function (qr, i) {
    if (String(qr[11]) === 'OPEN' && String(qr[6] || '').trim()) draftRows[i + 5] = true;
  });

  var stale = [], protectedDrafts = 0;
  openKeys.forEach(function (key) {
    if (readyKeys[key]) return;
    if (draftRows[open[key]]) { protectedDrafts++; return; }
    stale.push({ row: open[key], key: key });
  });
  if (protectedDrafts) {
    systemLog_('INFO', 'QUEUE SWEEP SKIPPED DRAFTS',
      protectedDrafts + ' row(s) left alone because a decision is part-written on them.');
  }
  if (!stale.length) return 0;

  // 3. Mass cancellation is a symptom. Refuse the whole sweep and say so.
  if (stale.length > QUEUE_SWEEP_MAX_V20_2 || stale.length * 2 > openKeys.length) {
    var why = 'Would have cancelled ' + stale.length + ' of ' + openKeys.length +
      ' open request(s) as "criteria changed". That is past the safety limit (' +
      QUEUE_SWEEP_MAX_V20_2 + ' rows, or half the open queue), so nothing was cancelled.\n\n' +
      'This usually means the matrix rebuilt from incomplete data rather than that ' +
      'the criteria really changed for that many skills at once.\n\n' +
      'Affected rows: ' + stale.slice(0, 20).map(function (x) { return x.row; }).join(', ') +
      (stale.length > 20 ? ' …' : '') + '\n\n' +
      'Check 01 TRAINEE MASTER, 15 SKILL CATALOG and 16 SKILLS, then re-run ' +
      'rebuildSkillMatrixV19_(). The requests are still OPEN and safe.';
    systemLog_('ERROR', 'QUEUE SWEEP REFUSED', why.slice(0, 400));
    try { sendMail(CONFIG.TCO_EMAIL, 'SCEMS : queue sweep refused, nothing cancelled', why); } catch (e) {}
    return 0;
  }

  // 4. Cancel, and record each one.
  stale.forEach(function (x) {
    queue.getRange(x.row, 12).setValue('CANCELLED : CRITERIA CHANGED');
    systemLog_('WARN', 'QUEUE ROW CANCELLED',
      'row ' + x.row + ' | ' + x.key.split('||').join(' / ') +
      ' | no longer ready on the matrix');
  });
  return stale.length;
}

/* ---- ported from zz (effective winner) ---- */
/** Arms both dropdowns across the whole queue body. */
function armQueueValidationV20_(sheet) {
  var q = sheet || ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q) return;
  var rows = Math.max(q.getMaxRows() - 4, 1);

  q.getRange(5, 7, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(QUEUE_DECISIONS_V19, true)
      .setAllowInvalid(false).build());

  q.getRange(5, 11, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(QUEUE_REASONS_V19, true)
      .setAllowInvalid(true).build());
}

/* ---- ported from zz (effective winner) ---- */
/** Sorts the queue body by trainee, then skill. */
function sortQueueByTraineeV20_(sheet) {
  var q = sheet || ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q || q.getLastRow() < 6) return;
  var n = q.getLastRow() - 4;
  var width = Math.max(q.getLastColumn(), QUEUE_REVIEW_COL_V20);
  q.getRange(5, 1, n, width).sort([
    { column: 12, ascending: true },   // OPEN before RECORDED
    { column: 2,  ascending: true },   // trainee
    { column: 5,  ascending: true }    // skill
  ]);
}

/* ---- ported from zz (effective winner) ---- */
/** Computes the checks and writes the flags onto the queue. */
function runSkillAuditV20() {
  var q = ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q || q.getLastRow() < 5) return 'Queue is empty.';

  var result = skillAuditFindingsV20_();
  var findings = result.findings;

  var rows = q.getRange(5, 1, q.getLastRow() - 4, 13).getValues();
  var flagged = 0, clean = 0;

  rows.forEach(function (r, i) {
    var trainee = String(r[1] || '').trim();
    var skillId = String(r[2] || '').trim();
    if (!trainee) return;
    var open = String(r[11] || '').trim() === 'OPEN';
    if (!open) return;

    var k = trainee + '||' + skillId;
    var reasons = findings[k];
    if (reasons && reasons.length) {
      q.getRange(i + 5, QUEUE_REVIEW_COL_V20).setValue(reasons.join('; '));
      flagged++;
    } else {
      q.getRange(i + 5, QUEUE_REVIEW_COL_V20).setValue('');
      clean++;
    }
  });

  var msg = 'SKILL AUDIT COMPLETE\n\n' +
    'Flagged for review : ' + flagged + '\n' +
    'Clean              : ' + clean + '\n\n' +
    (flagged
      ? 'The flagged rows are worth reading before approving. The clean\n' +
        'ones met the thresholds with no unusual pattern behind them.'
      : 'Nothing unusual in the current queue.') +
    '\n\nNothing is blocked. A flag is a question worth asking.';
  Logger.log(msg);
  systemLog_(flagged ? 'WARN' : 'INFO', 'SKILL AUDIT',
    flagged + ' flagged, ' + clean + ' clean');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Every finding across the three checks, keyed by trainee and skill id. */
function skillAuditFindingsV20_() {
  var S = ss();
  var findings = {};   // "trainee||skillId" -> [reasons]
  var ftoPattern = {}; // fto -> { total, independent }

  function add(trainee, skillId, reason) {
    var k = String(trainee).trim() + '||' + String(skillId).trim();
    if (!findings[k]) findings[k] = [];
    if (findings[k].indexOf(reason) < 0) findings[k].push(reason);
  }

  // ---- read the evidence ----
  var ev = S.getSheetByName(TAB.SKILL_EVIDENCE);
  var bursts = {};  // "trainee||skillId||date" -> count
  if (ev && ev.getLastRow() >= 5) {
    var headers = ev.getRange(4, 1, 1, ev.getLastColumn()).getValues()[0];
    var col = {};
    headers.forEach(function (h, i) {
      var k = String(h || '').trim().toUpperCase();
      if (k) col[k] = i;
    });

    ev.getRange(5, 1, ev.getLastRow() - 4, headers.length).getValues()
      .forEach(function (r) {
        var id = String(r[0] || '').trim();
        if (!id) return;
        var status = col['VALIDATION RESULT'] !== undefined
          ? String(r[col['VALIDATION RESULT']] || '').trim() : '';
        if (status !== 'ACCEPTED') return;

        var trainee = String(r[col['TRAINEE']] || '').trim();
        var skillId = String(r[col['SKILL ID']] || '').trim();
        var fto     = String(r[col['FTO']] || '').trim();
        var stage   = String(r[col['STAGE']] || '').trim();
        var date    = r[col['SHIFT DATE']];
        var dateKey = date instanceof Date
          ? Utilities.formatDate(date, 'America/New_York', 'yyyy-MM-dd')
          : String(date || '');

        if (trainee && skillId && dateKey) {
          var bk = trainee + '||' + skillId + '||' + dateKey;
          bursts[bk] = (bursts[bk] || 0) + 1;
        }
        if (fto) {
          if (!ftoPattern[fto]) ftoPattern[fto] = { total: 0, independent: 0 };
          ftoPattern[fto].total++;
          if (stage === 'I') ftoPattern[fto].independent++;
        }
      });
  }

  // burst findings
  Object.keys(bursts).forEach(function (k) {
    if (bursts[k] <= SKILL_BURST_LIMIT_V20) return;
    var parts = k.split('||');
    add(parts[0], parts[1],
      bursts[k] + ' repetitions on one shift (' + parts[2] + ')');
  });

  // ---- single source, read from the matrix ----
  var m = S.getSheetByName(TAB.SKILLS);
  if (m && m.getLastRow() >= 5) {
    m.getRange(5, 1, m.getLastRow() - 4, 20).getValues().forEach(function (r) {
      var trainee = String(r[0] || '').trim();
      var skillId = String(r[9] || '').trim();
      if (!trainee || !skillId) return;
      var readiness = String(r[6] || '');
      if (readiness !== 'READY FOR VALIDATION') return;
      var dates = Number(r[12]) || 0;
      var ftos  = Number(r[13]) || 0;
      if (dates <= 1 && ftos <= 1) {
        add(trainee, skillId, 'single date, single FTO');
      } else if (ftos <= 1) {
        add(trainee, skillId, 'single FTO');
      } else if (dates <= 1) {
        add(trainee, skillId, 'single date');
      }
    });
  }

  // ---- stage pattern, per FTO ----
  var inflated = [];
  Object.keys(ftoPattern).forEach(function (fto) {
    var p = ftoPattern[fto];
    if (p.total < SKILL_INFLATION_MIN_V20) return;
    var ratio = p.independent / p.total;
    if (ratio < SKILL_INFLATION_PCT_V20) return;
    inflated.push({ fto: fto, total: p.total,
                    pct: Math.round(ratio * 100) });
  });

  // attach the FTO pattern to every open queue row for that FTO's trainees
  if (inflated.length) {
    var q = S.getSheetByName(TAB.SKILL_VALIDATION);
    var evSheet = S.getSheetByName(TAB.SKILL_EVIDENCE);
    if (q && q.getLastRow() >= 5 && evSheet) {
      var lastFto = {};  // "trainee||skillId" -> fto
      var eh = evSheet.getRange(4, 1, 1, evSheet.getLastColumn()).getValues()[0];
      var ec = {};
      eh.forEach(function (h, i) {
        var k = String(h || '').trim().toUpperCase();
        if (k) ec[k] = i;
      });
      evSheet.getRange(5, 1, evSheet.getLastRow() - 4, eh.length).getValues()
        .forEach(function (r) {
          var t = String(r[ec['TRAINEE']] || '').trim();
          var s = String(r[ec['SKILL ID']] || '').trim();
          var f = String(r[ec['FTO']] || '').trim();
          if (t && s && f) lastFto[t + '||' + s] = f;
        });
      inflated.forEach(function (inf) {
        Object.keys(lastFto).forEach(function (k) {
          if (lastFto[k] !== inf.fto) return;
          var parts = k.split('||');
          add(parts[0], parts[1],
            inf.fto + ' logs ' + inf.pct + '% Independent across ' +
            inf.total + ' events');
        });
      });
    }
  }

  return { findings: findings, inflated: inflated };
}

/* ---- ported from zz (effective winner) ---- */
/** Adds the REVIEW column. Run once. */
function setupQueueReviewV20() {
  var q = ss().getSheetByName(TAB.SKILL_VALIDATION);
  if (!q) return 'Validation queue not found.';

  if (q.getMaxColumns() < QUEUE_REVIEW_COL_V20) {
    q.insertColumnsAfter(q.getMaxColumns(),
      QUEUE_REVIEW_COL_V20 - q.getMaxColumns());
  }

  q.getRange(4, QUEUE_REVIEW_COL_V20).setValue('REVIEW')
    .setBackground('#faf8f2').setFontColor('#1d1b18')
    .setFontFamily('Oswald').setFontWeight('bold').setFontSize(9)
    .setWrap(true)
    .setBorder(false, false, true, false, false, false, '#c9a227',
               SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  q.setColumnWidth(QUEUE_REVIEW_COL_V20, 300);

  var rows = Math.max(q.getMaxRows() - 4, 1);
  q.getRange(5, QUEUE_REVIEW_COL_V20, rows, 1)
    .setFontFamily('Inter').setFontSize(9).setWrap(true)
    .setVerticalAlignment('middle');

  var rules = q.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty()
    .setBackground('#fdf3f1').setFontColor('#8f1f12').setBold(true)
    .setRanges([q.getRange(5, QUEUE_REVIEW_COL_V20, rows, 1)])
    .build());
  q.setConditionalFormatRules(rules);

  var msg = 'REVIEW column added to the validation queue.\n\n' +
    'It sits to the right of everything the existing code reads, so the\n' +
    'recording process is unaffected.\n\n' +
    'Now run runSkillAuditV20().';
  Logger.log(msg);
  systemLog_('INFO', 'QUEUE REVIEW COLUMN ADDED', 'column ' + QUEUE_REVIEW_COL_V20);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** Read only. Confirms all six are present, titled, and accepting. */
function checkAllFormsV19() {
  var ids = [];
  try {
    ids = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty('FORM_IDS') || '[]');
  } catch (e) {}

  var found = {};
  ids.forEach(function (id) {
    var f;
    try { f = FormApp.openById(id); } catch (e) { return; }
    var name = '';
    try { name = String(f.getTitle() || '').trim(); } catch (e) {}
    if (!name) { try { name = DriveApp.getFileById(id).getName().trim(); } catch (e) {} }
    if (!name) return;
    var accepting = '';
    try { accepting = String(f.isAcceptingResponses()); } catch (e) {}
    var url = '';
    try { url = f.getPublishedUrl(); } catch (e) {}
    found[name] = { id: id, accepting: accepting, url: url };
  });

  var L = ['FORM STATUS', ''];
  L.push('Stored form ids : ' + ids.length + ' of ' + EXPECTED_FORMS_V19.length + ' expected');
  L.push('');
  var missing = 0;
  EXPECTED_FORMS_V19.forEach(function (want) {
    var f = found[want];
    if (f) {
      L.push('  FOUND    ' + want);
      L.push('           accepting ' + f.accepting);
    } else {
      L.push('  MISSING  ' + want);
      missing++;
    }
  });

  var strays = Object.keys(found).filter(function (n) {
    return EXPECTED_FORMS_V19.indexOf(n) < 0;
  });
  if (strays.length) {
    L.push('');
    strays.forEach(function (n) { L.push('  UNEXPECTED  "' + n + '"'); });
  }

  L.push('');
  L.push(!missing && !strays.length
    ? 'All expected forms present.'
    : 'Run repairFormIdsV19() then retitleFormsV19().');

  L.push('');
  L.push('LINKS FOR THE HUB, five of six');
  EXPECTED_FORMS_V19.forEach(function (want) {
    if (want === 'SCEMS Training Decision Record') return;
    var f = found[want];
    L.push('  ' + want);
    L.push('     ' + (f && f.url ? f.url : 'not available'));
  });
  L.push('');
  L.push('The Decision Record is leadership only and never goes on the Hub.');

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---- ported from zz (effective winner) ---- */
/** READ ONLY. The whole picture. */
function cleanupReportV19() {
  var S = ss();
  var L = ['CLEANUP REPORT', ''];

  // ---- workbook ----
  var sheets = S.getSheets();
  var responseTabs = sheets.filter(function (sh) {
    return /^Form Responses/i.test(sh.getName());
  });
  var hidden = sheets.filter(function (sh) { return sh.isSheetHidden(); });
  L.push('WORKBOOK');
  L.push('   tabs total            : ' + sheets.length);
  L.push('   Form Responses sheets : ' + responseTabs.length);
  L.push('   currently hidden      : ' + hidden.length);
  L.push('   Run auditResponseTabsV19() for the detail.');
  L.push('');

  // ---- forms ----
  var ids = [];
  try {
    ids = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty('FORM_IDS') || '[]');
  } catch (e) {}
  L.push('FORMS');
  L.push('   stored form ids : ' + ids.length + ' (six expected)');
  L.push('');

  // ---- triggers ----
  var trig = [];
  try { trig = ScriptApp.getProjectTriggers(); } catch (e) {}
  var byFn = {};
  trig.forEach(function (t) {
    var f = t.getHandlerFunction();
    byFn[f] = (byFn[f] || 0) + 1;
  });
  L.push('TRIGGERS  (' + trig.length + ')');
  Object.keys(byFn).sort().forEach(function (f) {
    L.push('   ' + f + (byFn[f] > 1 ? '   x' + byFn[f] + '  DUPLICATE' : ''));
  });
  var dupes = Object.keys(byFn).filter(function (f) { return byFn[f] > 1; });
  if (dupes.length) {
    L.push('   Duplicate triggers fire the same handler more than once per');
    L.push('   event. Worth clearing.');
  }
  L.push('');

  // ---- superseded code ----
  L.push('SUPERSEDED BLOCKS STILL LOADED');
  var found = 0;
  SUPERSEDED_BLOCKS_V19.forEach(function (b) {
    if (b.note === 'keep') return;
    if (!definedV19_(b.marker)) return;
    found++;
    L.push('   ' + b.block);
    L.push('      superseded by : ' + b.by);
    L.push('      action        : ' + b.note);
    L.push('      find it by searching for : ' + b.marker);
  });
  if (!found) L.push('   none detected');
  L.push('');

  // ---- one-time diagnostics ----
  L.push('ONE-TIME DIAGNOSTICS STILL PRESENT');
  var tools = ONE_TIME_TOOLS_V19.filter(function (t) { return definedV19_(t.fn); });
  if (!tools.length) L.push('   none');
  tools.forEach(function (t) {
    L.push('   ' + t.fn.padEnd(28) + t.why);
  });
  if (tools.length) {
    L.push('   These did their job and are not called by anything. Deleting');
    L.push('   them is optional and harmless either way.');
  }
  L.push('');

  // ---- keep ----
  L.push('TOOLS WORTH KEEPING');
  var kept = KEEP_TOOLS_V19.filter(function (f) { return definedV19_(f); });
  L.push('   ' + kept.length + ' of ' + KEEP_TOOLS_V19.length + ' present');
  L.push('   Do not delete these. They are how the system is checked.');
  L.push('');

  L.push('HOW TO DELETE A BLOCK');
  L.push('   Cmd+F in zz_scems_fixes for the marker function named above.');
  L.push('   Every block starts with a banner comment giving its version.');
  L.push('   Select from that banner down to the line before the next');
  L.push('   banner, and delete. Save. Then run cleanupReportV19() again.');
  L.push('');
  L.push('   Take a version snapshot before deleting anything.');

  var msg = L.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return msg;
}

/* ---- ported from master (effective winner) ---- */
function evalAlerts(v) {
  var t = v[EV.TRAINEE], fto = v[EV.FTO], dt = v[EV.SHIFTDATE];

  // ---- NEW: any domain scored 1 alerts the TCO same day, no opt-in ----
  var unsafe = [];
  for (var i = 0; i < 6; i++) {
    if (String(v[12 + i]) === '1') unsafe.push(DOMAIN_NAMES[i]);
  }
  if (unsafe.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'URGENT : Unsafe Score (1) : ' + t + ' : ' + unsafe.join(', '),
      'FTO ' + fto + ' scored ' + t + ' UNSAFE on ' + dt + ' in: ' + unsafe.join(', ') +
      '\nDocumented Situation: ' + (v[19] || '(missing : follow up, this is required)') +
      '\nCall number(s): ' + (v[20] || '(missing)') +
      '\nFull entry on 02 FTO SHIFT EVAL RAW. Same-day review.');
  }

  if (v[EV.CS] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'URGENT : Controlled-Substance Issue Reported : ' + t,
      'Reported by ' + fto + ' on ' + dt + '. See 02 FTO SHIFT EVAL RAW and SOP 402.1. Same-shift handling required.\nDetail: ' + (v[EV.RFDETAIL] || '(see evaluation row)'));
  }
  if (v[EV.REDFLAG] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'URGENT : Field Training Concern : ' + t,
      'Red flag reported by ' + fto + ' on ' + dt + '.\nDetail: ' + (v[EV.RFDETAIL] || '(none entered : follow up)') + '\nFull entry on 02 FTO SHIFT EVAL RAW. Handle same shift.');
  }
  if (v[EV.CLIN] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.MD_EMAIL,
      'Clinical Readiness Disagreement : ' + t + ' : Medical Director Review',
      'Filed by ' + fto + ' on ' + dt + '.\nStrength noted: ' + v[EV.STRENGTH] + '\nImprovement noted: ' + v[EV.IMPROVE] + '\nYour decision governs per the FTO Guide.');
    queueAdd(t, 'Clinical disagreement : Medical Director review');
  }
  if (v[EV.NRT] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'NRT Designation Filed : ' + t,
      'Filed by ' + fto + ' after documented remediation.\nPrior coaching: ' + v[EV.PRIOR] + '\nStill not improving: ' + v[EV.NOTIMP] + '\nDecision due within 72 hours: extend, reassign, or release. Queue row created.');
    queueAdd(t, 'NRT outcome : extend / reassign / release');
  }
  if (v[EV.ADV] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Decision Required (72h) : Advancement : ' + t,
      'Requested by ' + fto + ' on ' + dt + '. Clock started; return the decision to the FTO.');
    queueAdd(t, 'Advancement review');
  }
  if (v[EV.TOREV] === 'Yes' && v[EV.ADV] !== 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Training Officer Review Requested : ' + t,
      'Requested by ' + fto + ' on ' + dt + '. See the evaluation row on 02.');
  }
}

/* ---- ported from master (effective winner) ---- */
function reflectAlerts(v) {
  // v: 0 ts, 1 trainee, 10 concern flag, 11 concern detail
  if (v[10] === 'Yes') {
    sendMail(CONFIG.TCO_EMAIL,
      'Trainee Direct Concern : ' + v[1],
      'Submitted ' + v[2] + '.\n' + (v[11] || '') + '\nFull entry on 03 SELF-REFLECTION RAW.');
  }
}

/* ---- ported from master (effective winner) ---- */
function urgentAlerts(v) {
  // v: 0 ts, 1 contacted, 2 reporter, 3 role, 4 trainee, 5 date, 6 shift, 7 category, 8 what, 9 action
  sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
    'URGENT : Field Training Concern : ' + v[4],
    v[7] + ' reported by ' + v[2] + ' (' + v[3] + ') on ' + v[5] + ', Shift ' + v[6] + '.\nWhat happened: ' + v[8] + '\nImmediate action: ' + v[9] + '\nContacted TCO: ' + v[1] + '\nFull entry on 04 URGENT CONCERNS RAW. Handle same shift.');
  if (String(v[7]).indexOf('Controlled substance') >= 0) {
    sendMail(CONFIG.TCO_EMAIL,
      'URGENT : Controlled-Substance Issue Reported : ' + v[4],
      'Reported via Urgent Concern by ' + v[2] + ' on ' + v[5] + '. See 04 and SOP 402.1. Same-shift handling required.');
  }
  if (String(v[7]).indexOf('Clinical readiness') >= 0) {
    sendMail(CONFIG.MD_EMAIL,
      'Clinical Readiness Concern : ' + v[4] + ' : Medical Director Awareness',
      'Filed by ' + v[2] + ' on ' + v[5] + '. Summary: ' + v[8]);
  }
}

/* ---- ported from master (effective winner) ---- */
function queueAdd(trainee, type) {
  // First empty row inside the seeded 300-row queue; never append outside its formulas.
  var q = ss().getSheetByName(TAB.QUEUE);
  if (!q) throw new Error('Decision Queue is missing.');
  var colA = q.getRange(5, 1, 296, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (!colA[i][0]) {
      var row = 5 + i;
      q.getRange(row, 1, 1, 4).setValues([[new Date(), trainee, type, 'Division Chief of Training']]);
      q.getRange(row, 5).setFormula('=IF(A' + row + '="","",A' + row + '+3)');
      return;
    }
  }
  throw new Error('Decision Queue is full. Archive closed items before accepting another decision-required event.');
}

/* ---- ported from master (effective winner) ---- */
/** One press: for every non-snoozed overdue trainee, email their shift
 *  supervisor (TCO copied) to have the FTO submit this shift, then
 *  snooze that trainee for SNOOZE_DAYS. */
function remindOverdue() {
  var S = ss();
  var ctl = S.getSheetByName(TAB.CONTROL);
  var OV = ctl.getRange('B5').getValue();

  var roster = ctl.getRange(5, 6, 25, 2).getValues();
  var shiftByFto = {};
  roster.forEach(function (r) { if (r[0]) shiftByFto[String(r[0])] = String(r[1]); });
  var sup = ctl.getRange(5, 13, 4, 3).getValues();
  var supByShift = {};
  sup.forEach(function (r) { if (r[0]) supByShift[String(r[0])] = { name: r[1], email: r[2] }; });

  var eng = S.getSheetByName(TAB.ENGINE);
  var rows = eng.getRange(5, 1, 40, 23).getValues();
  var sent = 0;
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i][0], fto = rows[i][3], days = rows[i][8], snooze = rows[i][21];
    if (!name || String(name).indexOf(TEST_PREFIX) === 0) continue;
    if (typeof days !== 'number' || days <= OV || snooze === 'SNOOZED') continue;
    var shift = shiftByFto[String(fto || '')] || '';
    var target = supByShift[shift];
    var to = (target ? String(target.email) + ',' : '') + CONFIG.TCO_EMAIL;
    sendMail(to,
      'Evaluation Overdue : ' + name + ' : ' + days + ' Days',
      'FTO ' + (fto || 'unassigned') + ' has not submitted a shift evaluation for ' + name +
      ' in ' + days + ' days (standard: ' + OV + ').\n\n' +
      'Please have the evaluation submitted through the Field Training Hub this shift.\n' +
      HUB_URL + '\n\n' +
      'This is an automated reminder from the Field Training tracking system. It will not repeat for ' +
      SNOOZE_DAYS + ' days.');
    eng.getRange(5 + i, 23).setValue(new Date());
    sent++;
  }
  try { S.toast(sent ? sent + ' reminder(s) sent and snoozed ' + SNOOZE_DAYS + ' days.' : 'Nothing overdue to remind.', 'SCEMS'); } catch (t) {}
  Logger.log('remindOverdue: ' + sent + ' reminder(s) sent.');
}

/* ---- ported from master (effective winner) ---- */
/** v4: v3 plus the audit flag count now includes column G (phase mismatch). */
function dailyChecks() {
  var S = ss();
  var threshold = S.getSheetByName(TAB.CONTROL).getRange('B5').getValue();
  var master = S.getSheetByName(TAB.MASTER).getRange(5, 1, 40, 9).getValues();
  var ftoByTrainee = {}, phaseByTrainee = {};
  master.forEach(function (r) {
    if (r[0]) { ftoByTrainee[r[0]] = r[4]; phaseByTrainee[r[0]] = r[6]; }
  });

  var overdue = [];
  engineRows().forEach(function (r) {
    var days = r[8];
    if (typeof days === 'number' && days > threshold) {
      overdue.push(r[0] + ' : last evaluation ' + days + ' days ago (FTO: ' + (ftoByTrainee[r[0]] || 'unassigned') + ')');
    }
  });
  if (overdue.length) {
    sendMail(CONFIG.TCO_EMAIL,
      'Overdue : No Evaluation in Over ' + threshold + ' Days : ' + overdue.length + ' Trainee(s)',
      'Active trainees require current records.\n\n' + overdue.join('\n') + '\n\nSubmit via the Field Training Hub.');
  }

  var ev = S.getSheetByName(TAB.EVAL);
  var last = ev.getLastRow();
  if (last >= 6) {
    var data = ev.getRange(5, 1, last - 4, 18).getValues();
    var byTrainee = {};
    data.forEach(function (r) { if (r[2]) { (byTrainee[r[2]] = byTrainee[r[2]] || []).push(r); } });
    var flags = [];
    Object.keys(byTrainee).forEach(function (t) {
      var rows = byTrainee[t];
      if (rows.length < 2) return;
      var a = rows[rows.length - 2], b = rows[rows.length - 1];
      DOMAIN_NAMES.forEach(function (d, i) {
        if (a[12 + i] < 3 && b[12 + i] < 3) flags.push(t + ' : ' + d + ' below standard on the last two evaluations');
      });
    });
    if (flags.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Pattern Flag : Domain Below Standard x2',
        flags.join('\n') + '\n\nConsider a coaching plan per the Oversight Dashboard thresholds.');
    }
  }

  var q = S.getSheetByName(TAB.QUEUE);
  var qv = q.getRange(5, 1, 296, 6).getValues();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var breached = [];
  qv.forEach(function (r) {
    var trainee = r[1], due = r[4], decision = r[5];
    if (!trainee || decision) return;
    if (due instanceof Date && due < today) {
      breached.push(trainee + ' : ' + r[2] + ' : was due ' +
        Utilities.formatDate(due, 'America/New_York', 'MM/dd'));
    }
  });
  if (breached.length) {
    sendMail(CONFIG.TCO_EMAIL + ',' + CONFIG.SUPERVISOR_EMAILS,
      'BREACH : 72-Hour Decision Window Missed : ' + breached.length + ' Item(s)',
      'These Decision-Required items are past their 72-hour window with no documented decision. The 72-hour promise is the credibility of the reporting system.\n\n' +
      breached.join('\n') + '\n\nFile the decision through the Decision Record form today.');
  }

  var u = S.getSheetByName(TAB.URGENT);
  var uLast = u.getLastRow();
  if (uLast >= 5) {
    var uv = u.getRange(5, 1, uLast - 4, 12).getValues();
    var stale = [];
    uv.forEach(function (r) {
      var ts = r[0], resolution = r[10];
      if (!ts || resolution) return;
      if (ts instanceof Date && (today - ts) / 86400000 > 7) {
        stale.push(r[4] + ' : ' + r[7] + ' : reported ' +
          Utilities.formatDate(ts, 'America/New_York', 'MM/dd'));
      }
    });
    if (stale.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Open Urgent Concerns Past 7 Days : ' + stale.length,
        'These urgent concerns have no Resolution entered on tab 04 column K:\n\n' +
        stale.join('\n') + '\n\nDocument the outcome and the close date.');
    }
  }

  var au = S.getSheetByName('13 AUDIT - EXCEPTION LOG');
  var flagCount = 0;
  au.getRange('B5:G44').getValues().forEach(function (r) {
    r.forEach(function (c) { if (c === 'FLAG') flagCount++; });
  });
  if (flagCount > 0) {
    sendMail(CONFIG.TCO_EMAIL,
      'Audit Flags Standing : ' + flagCount,
      flagCount + ' FLAG(s) are burning on 13 AUDIT - EXCEPTION LOG. Review, act, and log each one on the FLAG REVIEW LOG at the bottom of the tab.');
  }

  // ---- NEW: approved advancement not reflected on the master ----
  var dec = S.getSheetByName(DECISIONS_TAB);
  if (dec && dec.getLastRow() >= 5) {
    var dv = dec.getRange(5, 1, dec.getLastRow() - 4, 9).getValues();
    var stuck = [];
    dv.forEach(function (r) {
      var ts = r[0], trainee = r[3], item = r[4], decision = r[5], phaseThen = r[8];
      if (item !== 'Advancement review' || decision !== 'Approved') return;
      if (!(ts instanceof Date) || (today - ts) / 3600000 / 24 < 2) return;
      var phaseNow = phaseByTrainee[trainee];
      if (phaseNow && phaseThen && phaseNow === phaseThen) {
        stuck.push(trainee + ' : approved ' + Utilities.formatDate(ts, 'America/New_York', 'MM/dd') +
          ' : still shows ' + phaseNow + ' on 01 TRAINEE MASTER');
      }
    });
    if (stuck.length) {
      sendMail(CONFIG.TCO_EMAIL,
        'Advancement Approved but Phase Not Updated : ' + stuck.length,
        'These advancements were approved over 48 hours ago and the trainee\'s Current Phase on 01 TRAINEE MASTER has not moved. Phase-scoped counts are stale until it does.\n\n' + stuck.join('\n'));
    }
  }
  // v20.1: keep the trust surfaces current after the daily pass
  try { refreshAnalyticsV20_1(); } catch (eA) { systemLog_('WARN', 'DAILY ANALYTICS REFRESH FAILED', String(eA)); }
  try { homeCountersV20_1(); } catch (eH) { systemLog_('WARN', 'DAILY HOME RECONCILE FAILED', String(eH)); }
}

/* ---- ported from master (effective winner) ---- */






