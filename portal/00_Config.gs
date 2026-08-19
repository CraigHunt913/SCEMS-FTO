/**
 * SCEMS Field Training Portal — configuration.
 *
 * ONE source of truth. Nothing else in this project may hard-code a
 * spreadsheet id, an address, or a mode.
 *
 * SAFETY: TARGET_SPREADSHEET_ID is deliberately empty. The portal refuses to
 * run until it is set, and setUpStaging() sets it to a NEW spreadsheet it
 * creates itself. Pointing this at the live tracker is a single, deliberate,
 * logged act — never a default and never an accident.
 */

var PORTAL = Object.freeze({
  VERSION: 'portal-1.1.0',
  PROPERTY_TARGET: 'PORTAL_TARGET_SPREADSHEET_ID',
  PROPERTY_MODE: 'PORTAL_MODE',

  /** STAGING writes freely. PRODUCTION refuses every write. */
  MODE_STAGING: 'STAGING',
  MODE_PRODUCTION: 'PRODUCTION',

  TITLE: 'Sumter County EMS Field Training',

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
    AUDIT:      'PORTAL AUDIT'
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

/** The spreadsheet this portal is pointed at. Throws rather than guessing. */
function targetIdV1_() {
  var id = String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_TARGET) || '').trim();
  if (!id) {
    throw new Error('This portal is not pointed at a spreadsheet yet. Run ' +
      'setUpStaging() once from the script editor; it builds a staging copy ' +
      'with invented people and points the portal at that.');
  }
  return id;
}

function targetBookV1_() { return SpreadsheetApp.openById(targetIdV1_()); }

function modeV1_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty(PORTAL.PROPERTY_MODE) || PORTAL.MODE_STAGING).toUpperCase();
}

/** True only in STAGING. Every write in this project checks this first. */
function mayWriteV1_() { return modeV1_() === PORTAL.MODE_STAGING; }

/** Refuses, loudly, when a write is attempted outside staging. */
function requireWritableV1_(what) {
  if (mayWriteV1_()) return;
  throw new Error('Refusing to ' + what + '. This portal is in ' + modeV1_() +
    ' mode, which is read-only. Writing to a live record from here has not ' +
    'been approved.');
}
