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
