const fs = require('fs');

// ---- minimal fake Sheets, enough for readTableV20_1_ and setValue ----
function FakeSheet(name, grid) { this.name = name; this.g = grid; }
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this.g.length; };
FakeSheet.prototype.getLastColumn = function () { return this.g[0].length; };
FakeSheet.prototype.getMaxRows = function () { return this.g.length; };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this, R = r, C = c, NR = nr || 1, NC = nc || 1;
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < NR; i++) out.push(sh.g[R - 1 + i].slice(C - 1, C - 1 + NC));
      return out;
    },
    getValue: function () { return sh.g[R - 1][C - 1]; },
    setValue: function (v) { sh.g[R - 1][C - 1] = v; return this; }
  };
};
let SHEET;
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => (n === SHEET.name ? SHEET : null) }) };
global.Utilities = { getUuid: () => 'stub-uuid-0000000000000000' };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));

const HEAD = ['READY DATE','TRAINEE','SKILL ID','DOMAIN','SKILL','EVIDENCE SUMMARY',
  'DECISION','DECIDED BY','DECISION DATE','EXPIRATION','RATIONALE',
  'RECORD STATUS','LAST EVIDENCE DATE','REQUEST ID'];

function build() {
  const g = [ new Array(14).fill(''), new Array(14).fill(''), new Array(14).fill(''), HEAD.slice() ];
  [['Alvarez','QR-A'], ['Boyd','QR-B'], ['Chen','QR-C']].forEach(([who, id]) => {
    const row = new Array(14).fill('');
    row[1] = who; row[4] = 'IV access'; row[11] = 'OPEN'; row[13] = id;
    g.push(row);
  });
  SHEET = new FakeSheet(TAB.SKILL_VALIDATION, g);
}

// What recordDecisionForRowV20_1_ does downstream: flip status, then the
// rebuild re-sorts the body with OPEN before RECORDED.
function recordAndResort(row) {
  SHEET.g[row - 1][11] = 'RECORDED';
  const body = SHEET.g.slice(4);
  body.sort((a, b) => String(a[11]).localeCompare(String(b[11])));
  SHEET.g = SHEET.g.slice(0, 4).concat(body);
}

let pass = 0; const fails = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label + '\n          expected ' + e + '\n          actual   ' + a);
         console.log('  FAIL  ' + label); }
}
const decisionOf = who => {
  const r = SHEET.g.slice(4).find(x => x[1] === who);
  return r ? String(r[6] || '') : '(row gone)';
};

console.log('\nOLD BEHAVIOUR — captured row numbers, written positionally');
build();
let captured = SHEET.g.slice(4).map((r, i) => ({ row: 5 + i, who: r[1] }));
captured.forEach((c, n) => {
  SHEET.g[c.row - 1][6] = 'Approve sign-off';          // the old positional write
  if (n === 0) recordAndResort(c.row);                  // only the first is genuinely recorded
});
check('Alvarez approved', decisionOf('Alvarez'), 'Approve sign-off');
check('Boyd WRONGLY untouched  <- the bug', decisionOf('Boyd'), '');
check('Chen WRONGLY approved   <- the bug', decisionOf('Chen'), 'Approve sign-off');

console.log('\nNEW BEHAVIOUR — rows re-derived from REQUEST ID before each write');
build();
captured = SHEET.g.slice(4).map((r, i) => ({ row: 5 + i, who: r[1], requestId: r[13] }));
captured.forEach((c, n) => {
  const live = queueRowByRequestIdV20_1_(c.requestId);
  writeQueueDecisionV20_1_(live, 'Approve sign-off', 'chief@example.gov', new Date(), 'Thresholds met');
  if (n === 0) recordAndResort(live);
});
check('Alvarez approved', decisionOf('Alvarez'), 'Approve sign-off');
check('Boyd approved',   decisionOf('Boyd'),   'Approve sign-off');
check('Chen approved',   decisionOf('Chen'),   'Approve sign-off');
check('captured row for Boyd was stale', captured[1].row !== queueRowByRequestIdV20_1_('QR-B'), true);

console.log('\nwriteQueueDecisionV20_1_ guards');
build();
check('rationale starting with = is neutralised',
  (writeQueueDecisionV20_1_(5, 'Approve sign-off', 'x@y.gov', new Date(),
     '=IMPORTRANGE("evil","A1")'), SHEET.g[4][10]),
  "'=IMPORTRANGE(\"evil\",\"A1\")");
build();
SHEET.g[3][6] = 'DECISION RENAMED';   // break a header the writer needs
let threw = '';
try { writeQueueDecisionV20_1_(5, 'Approve sign-off', 'x@y.gov', new Date(), 'ok'); }
catch (e) { threw = String(e.message || e); }
check('refuses to write when DECISION header is missing',
  /missing header\(s\) DECISION/.test(threw), true);
check('...and wrote nothing', SHEET.g[4][7], '');
build();
check('unknown REQUEST ID resolves to 0', queueRowByRequestIdV20_1_('QR-NOPE'), 0);
check('empty REQUEST ID resolves to 0', queueRowByRequestIdV20_1_(''), 0);

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\n' + fails.join('\n\n')); process.exit(1); }
