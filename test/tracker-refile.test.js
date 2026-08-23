// The tracker was refiled: 13,127 lines ordered by WHEN each thing was
// written, with fourteen blocks marked ADD-ON appended to the bottom across
// six versions, became fifteen files ordered by what each thing does.
//
// The whole value of that move rests on one claim: nothing changed. This file
// is where that claim is checked, and it is checked four different ways
// because the first two attempts at it were fooled by their own parser.
//
//   node test/tracker-refile.test.js

const fs = require('fs');
const path = require('path');
const { parse } = require('../tools/split-tracker.js');
const { build, verify, everyLineSurvived, OBSOLETE, SRC } = require('../tools/build-tracker.js');
const { FILES, fileFor } = require('../tools/tracker-plan.js');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

const ROOT = path.join(__dirname, '..');
// Two frozen files: what shipped before the refile, and what the refile
// produced. Comparing them is a historical fact and stays true forever.
// Comparing either against today's Code.gs would not: fixes made afterwards
// are supposed to change it.
const ORIGINAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'Code-before-refile.gs'), 'utf8');
const REFILED  = fs.readFileSync(path.join(__dirname, 'fixtures', 'Code-after-refile.gs'), 'utf8');
const SHIPPED  = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');

// ---------------------------------------------------------------- //
section('The parser reassembles what it took apart');
// ---------------------------------------------------------------- //
// Everything downstream is built on this. A parser that quietly drops a line
// makes every later check meaningless, so it is checked first and exactly.
const units = parse(ORIGINAL);
ok(units.map(u => u.lines.join('\n')).join('\n') === ORIGINAL,
   'the units put back together are the original file, byte for byte');

const declared = new Set();
ORIGINAL.split('\n').forEach(l => {
  const m = l.match(/^(?:function|var|const|let)\s+([A-Za-z0-9_$]+)/);
  if (m) declared.add(m[1]);
});
const parsed = units.filter(u => u.kind === 'decl').map(u => u.name);
ok(parsed.length === declared.size,
   'and it found every declaration, all ' + declared.size + ' of them: ' + parsed.length);
ok([...declared].every(n => parsed.indexOf(n) >= 0),
   'with none swallowed by the one above it');
ok(new Set(parsed).size === parsed.length, 'and none counted twice');

// ---------------------------------------------------------------- //
section('Every declaration has somewhere to go, named explicitly');
// ---------------------------------------------------------------- //
const unfiled = units.filter(u => u.kind === 'decl' && !fileFor(u));
ok(unfiled.length === 0,
   'nothing falls through to a default bucket: ' +
   (unfiled.length ? unfiled.map(u => u.name).join(', ') : 'none unfiled'));
ok(FILES.length === 15, 'fifteen files, each with a stated purpose');
FILES.forEach(([name]) => {
  if (!fs.existsSync(path.join(SRC, name + '.gs'))) ok(false, name + '.gs exists');
});
ok(FILES.every(([n]) => fs.existsSync(path.join(SRC, n + '.gs'))), 'and all fifteen are on disk');

// ---------------------------------------------------------------- //
section('The build is what is checked in');
// ---------------------------------------------------------------- //
const built = build();
ok(built === SHIPPED,
   'Code.gs is exactly what tracker/*.gs builds — run node tools/build-tracker.js');

// ---------------------------------------------------------------- //
section('Nothing was lost in the move');
// ---------------------------------------------------------------- //
const v = verify(path.join(__dirname, 'fixtures', 'Code-before-refile.gs'), REFILED);
ok(v.lost.length === 0, 'no declaration disappeared: ' + (v.lost.join(', ') || 'none'));
ok(v.gained.length === 0, 'and none appeared from nowhere: ' + (v.gained.join(', ') || 'none'));
ok(v.changed.length === 0,
   'every function body is identical to the one that shipped: ' + (v.changed.join(', ') || 'all ' + v.count));

// The check that actually matters, and the one the first two versions of this
// got wrong. Comparing parse(before) with parse(after) proves nothing when the
// same parser bug sits on both sides: a build that had truncated every array
// literal reported "all identical". Counting the real lines cannot lie that way.
const gone = everyLineSurvived(ORIGINAL, REFILED);
ok(gone.length === 0,
   'and every line of prose and code survives, counted: ' +
   (gone.length ? gone.length + ' missing, first is "' + gone[0].slice(0, 60) + '"' : 'all of it'));

ok(OBSOLETE.length > 0 && OBSOLETE.some(re => re.test('PART 1 of 5')),
   'the only exceptions are on a list that is printed when the build runs');
ok(!/PARTS 2-5 are pasted at the very BOTTOM/.test(REFILED),
   'so the paste instructions for a five-part release really are gone');

// ---------------------------------------------------------------- //
section('Nothing moved above something it needs');
// ---------------------------------------------------------------- //
// Functions hoist, so moving one is free. `var DECISIONS_TAB = TAB.QUEUE` does
// not: it runs where it sits, and putting it above TAB makes it undefined at
// load with no error anywhere and nothing on screen to say why.
ok(v.misordered.length === 0,
   'the eight constants built from TAB or FORM_TITLES still land after them: ' +
   (v.misordered.join(', ') || 'all eight in order'));

// and it has to stay true of what is shipping today, not only of the refile
const orderNow = verify(path.join(__dirname, 'fixtures', 'Code-after-refile.gs'), built);
ok(orderNow.misordered.length === 0,
   'and still are in the build as it stands now: ' +
   (orderNow.misordered.join(', ') || 'all eight in order'));

const order = {};
parse(built).filter(u => u.kind === 'decl').forEach((u, i) => { order[u.name] = i; });
ok(order['TAB'] < order['DECISIONS_TAB'], 'TAB is declared before DECISIONS_TAB');
ok(order['FORM_TITLES'] < order['EXPECTED_FORMS_V19'],
   'and FORM_TITLES before EXPECTED_FORMS_V19');

// ---------------------------------------------------------------- //
section('The point of the exercise actually happened');
// ---------------------------------------------------------------- //
// The words "ADD-ON" still appear, and should: each of those headers says why
// its functions exist, and that is the only place several of them say it. What
// is gone is ADD-ON as a STRUCTURE - a block of code appended to the bottom of
// the file, outside every section, because appending was easier than filing.
const addonOutsideHeaders = FILES.filter(([name]) => {
  const text = fs.readFileSync(path.join(SRC, name + '.gs'), 'utf8');
  const firstDecl = text.search(/^(function|var|const|let)\s/m);
  return firstDecl >= 0 && /ADD-ON/.test(text.slice(firstDecl));
}).map(f => f[0]);
ok(addonOutsideHeaders.length === 0,
   'no ADD-ON survives as a block of code: every mention is now inside a file header — ' +
   (addonOutsideHeaders.join(', ') || 'all fifteen clean'));
ok(/ADD-ON : Record a skill I witnessed/.test(SHIPPED),
   'while the reason each one was written is kept, word for word');
const src40 = fs.readFileSync(path.join(SRC, '50_decisions.gs'), 'utf8');
ok(/function advanceTraineeNow/.test(src40),
   'advanceTraineeNow sits with the decisions, not 10,000 lines from them');
const src60 = fs.readFileSync(path.join(SRC, '60_reporting.gs'), 'utf8');
ok(/function ftoScoreboardV20_1/.test(src60), 'the scoreboard sits with the reporting');
const src90 = fs.readFileSync(path.join(SRC, '90_recovery.gs'), 'utf8');
ok(/function stepD_fixPhantoms/.test(src90) && /function catchUpUnprocessed/.test(src90),
   'and every run-once recovery tool is in one place');
const src75 = fs.readFileSync(path.join(SRC, '75_presentation.gs'), 'utf8');
ok(/235 places in this file look a column/.test(src75),
   'the v20.4 warning about 235 header lookups survived the move, in the file it warns about');
ok(/if im the division chief and i open the spreadsheet/.test(src75),
   'and so did the Chief’s own words about what he wanted');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
