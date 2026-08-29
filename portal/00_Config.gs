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
  VERSION: 'portal-2.1.1',
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
