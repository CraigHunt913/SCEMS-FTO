/**
 * Somebody started training.
 *
 * Until now a new trainee meant typing a name into 01 TRAINEE MASTER by hand
 * and hoping the nine Google Forms picked them up. That is how people end up
 * on THE LINE but missing from the eval / skills dropdowns — and how an FTO
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
 *   THE LINE: Training Division → Bring someone on → addTraineeV1 (web).
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
      'On THE LINE: Training Division → Bring someone on.\n\n' +
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
    L.push('  An address is how THE LINE recognizes a trainee. Not added.');
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

  var L = ['TRAINEE ADDED TO THE LINE', '',
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
      L.push('  the new name(s). Prefill and open-form cards on THE LINE use those');
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
    L.push('  Open the tracker once (or run rebuildSkillMatrix) so their skill');
    L.push('  rows appear on 05 SKILLS PROGRESS. Forms and THE LINE already know them.');
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
