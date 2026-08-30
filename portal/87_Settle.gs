/**
 * Settle same-day submission pairs from Field Training — without the tracker.
 *
 * Doctrine: both raw rows stay on file forever. A settlement is a named
 * judgment (both stand / this one stands / not a conflict) so Settle stops
 * nagging and the personnel record has who decided, when, and why.
 */

var PORTAL_SETTLEMENTS_TAB = 'PORTAL SETTLEMENTS';

function ensureSettlementsLogV1_() {
  try {
    var book = targetBookV1_();
    if (book.getSheetByName(PORTAL_SETTLEMENTS_TAB)) return true;
    var sh = book.insertSheet(PORTAL_SETTLEMENTS_TAB);
    sh.getRange(1, 1).setValue(
      'Duplicate-submission judgments from Field Training. Raw submissions stay on file.')
      .setFontWeight('bold');
    sh.getRange(PORTAL.HEADER_ROW, 1, 1, 10).setValues([[
      'WHEN', 'TRAINEE', 'TAB', 'DUP KEY', 'DECISION', 'KEEP ROW',
      'SOURCE', 'BY', 'REASON', 'VERSION'
    ]]).setFontWeight('bold').setBackground('#12233b').setFontColor('#ffffff');
    sh.setFrozenRows(PORTAL.HEADER_ROW);
    forgetTabsV1_();
    return true;
  } catch (e) { return false; }
}

function settlementIdV1_(trainee, tab, dupKey) {
  return normNameV1_(trainee) + '|' + String(tab || '') + '|' + String(dupKey || '');
}

/** Settled keys for filtering Settle. */
function settledDuplicateKeysV1_() {
  var out = {};
  var t = readTabV1_(PORTAL_SETTLEMENTS_TAB);
  if (!t.ok) return out;
  t.rows.forEach(function (r) {
    var trainee = String(r[t.col['TRAINEE']] || '').trim();
    var tab = String(r[t.col['TAB']] || '').trim();
    var key = String(r[t.col['DUP KEY']] || '').trim();
    if (!trainee || !key) return;
    out[settlementIdV1_(trainee, tab, key)] = true;
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
  var keep = '';
  if (dec === 'KEEP_ROW') {
    keep = String(keepRow == null ? '' : keepRow).trim();
    if (!keep || keep === '0' || keep === '-1') {
      throw new Error('Pick which row stands.');
    }
  }

  var id = settlementIdV1_(trainee, tab, key);
  if (settledDuplicateKeysV1_()[id]) {
    return { ok: true, message: 'Already settled. Reload if it still shows on Settle.' };
  }

  if (!ensureSettlementsLogV1_()) {
    throw new Error('Could not open or create ' + PORTAL_SETTLEMENTS_TAB + '. Nothing was written.');
  }
  var t = readTabV1_(PORTAL_SETTLEMENTS_TAB);
  if (!t.ok) throw new Error('No settlements log.');

  var row = t.headers.map(function (h) {
    var H = String(h || '').trim().toUpperCase();
    if (H === 'WHEN') return new Date();
    if (H === 'TRAINEE') return trainee;
    if (H === 'TAB') return tab;
    if (H === 'DUP KEY') return key;
    if (H === 'DECISION') return dec;
    if (H === 'KEEP ROW') return keep;
    if (H === 'SOURCE') return String(sourceTitle || '').trim();
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
        fields: (s.fields || []).slice(0, 12)
      };
    })
  };
}
