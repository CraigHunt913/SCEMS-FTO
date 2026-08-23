/**
 * Put the tracker back together from tracker/*.gs into one pasteable Code.gs.
 *
 * Same shape as the portal's one-file build: the sources are what you edit,
 * the single file is what you paste. Apps Script would happily hold fifteen
 * files, but pasting fifteen times is fifteen chances to paste one of them
 * into the wrong place.
 *
 * Two things this refuses to do:
 *
 *   LOSE ANYTHING   Every declaration in the original must come out the other
 *                   side byte for byte. Not "equivalent" - identical.
 *
 *   REORDER A       Functions hoist, so moving one is free. A top-level
 *   DEPENDENCY      `var X = TAB.QUEUE` does not: it is evaluated where it
 *                   sits, and moving it above TAB makes it undefined at load
 *                   with no error anywhere. Eight constants in this file are
 *                   built from TAB or FORM_TITLES. The build checks each one
 *                   still lands after what it needs, and stops if not.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('./split-tracker.js');
const { FILES, fileFor, KEEP } = require('./tracker-plan.js');
const KEEP_SECTION = KEEP;

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tracker');

/** Lines the rebuild deliberately does not carry over.
 *
 *  Kept here, at module scope, so the split and the verification cannot
 *  disagree about what "lost" means. Everything on this list is printed by
 *  the build when it runs, so dropping it stays a decision on the record
 *  rather than something nobody noticed. */
const OBSOLETE = [
  /^={4,}/, /^[0-9]{2}_[a-z_]+\.gs$/, /^SCEMS FTPD v[\d.]+ ?: ?[0-9]{2}_/,
  /PART \d+ of \d+/, /^PART \d/, /^PARTS \d/, /^earlier 0i files/,
  /^Save after each part/, /^it must print/, /CONSOLIDATED SINGLE-FILE BUILD/,
  /^Everything from v20\.1\.0h plus/, /^to exactly one definition of everything/
];

function splitOut(codePath) {
  const src = fs.readFileSync(codePath, 'utf8');
  const units = parse(src);
  const buckets = {}, banners = {}, dropped = [];
  FILES.forEach(([f]) => { buckets[f] = []; banners[f] = []; });

  // A banner's prose belongs to whichever file its functions went to.
  //
  // This is where most of the design record lives, and all of it was about to
  // be lost. The v20.4 block is the only place that says 235 sites look a
  // column up by its header text, which is why renaming one on the sheet was
  // dangerous. The v20.3 block quotes the Chief describing what he wanted,
  // verbatim. Each ADD-ON header says why that function exists at all -
  // "through the FULL validated path, not around it" is the entire reason
  // recordSkillDirect is shaped the way it is.
  //
  // What IS dropped gets listed and printed rather than quietly discarded:
  // the ==== rules, the version-stamped filenames, and paste instructions for
  // a five-part release that has not existed since this became one file.

  const prose = u => u.lines
    .map(l => l.replace(/^[\s]*(\/\*+|\*+\/?|\/\/)?[\s]*/, '').replace(/[\s*\/=]+$/, '').trim())
    .filter(t => {
      if (!t) return false;
      if (OBSOLETE.some(re => re.test(t))) { dropped.push(t); return false; }
      return true;
    });

  // Loose text - an end-of-section note, a reviewer's aside - stays with the
  // declaration it followed. Dropping it because it is not code is exactly
  // the kind of quiet loss this rebuild exists to avoid.
  let last = null, waiting = [];
  units.forEach(u => {
    if (u.kind === 'banner') { waiting = waiting.concat(prose(u)); return; }
    if (u.kind === 'decl') {
      const f = fileFor(u);
      if (!f) throw new Error('Nothing says where ' + u.name + ' goes. Add it to tracker-plan.js.');
      if (waiting.length) { banners[f] = banners[f].concat(waiting); waiting = []; }
      buckets[f].push(u);
      last = f;
      return;
    }
    if (u.kind === 'other' && last && u.lines.some(l => l.trim())) buckets[last].push(u);
  });

  if (!fs.existsSync(SRC)) fs.mkdirSync(SRC);
  FILES.forEach(([name, blurb]) => {
    const kept = (banners[name] || []).filter((v, i, arr) => arr.indexOf(v) === i);
    const head = '/**\n * SCEMS Field Training Tracker — ' + name + '\n *\n * ' +
      blurb.replace(/(.{1,72})( |$)/g, '$1\n * ').trimEnd() + '\n' +
      (kept.length
        ? ' *\n * What the blocks these came from used to say, kept because for several\n' +
          ' * of them it is the only record of why they exist:\n *\n' +
          kept.map(l => ' *   ' + l).join('\n') + '\n'
        : '') + ' */\n\n';
    fs.writeFileSync(path.join(SRC, name + '.gs'),
      head + buckets[name].map(u => u.lines.join('\n').replace(/^\n+/, '')).join('\n\n') + '\n');
  });

  if (dropped.length) {
    const once = dropped.filter((v, i, a2) => a2.indexOf(v) === i);
    console.log('deliberately not carried over (' + once.length + ' distinct lines: banner\n' +
      '  rules, version-stamped filenames, and paste instructions for a five-part\n' +
      '  release that has not existed since this became one file):');
    once.forEach(l => console.log('    ' + l));
  }
  return buckets;
}

function build() {
  // Each file's own header comes through. It names the file and says what
  // belongs in it, which is the navigation the single file otherwise has
  // none of - stripping it to avoid "too many headers" was throwing away
  // the point of the exercise.
  const parts = FILES.map(([name]) =>
    '/* ' + '='.repeat(70) + ' */\n' +
    fs.readFileSync(path.join(SRC, name + '.gs'), 'utf8'));
  return HEAD + parts.join('\n\n') + '\n';
}

const HEAD = [
  '/**',
  ' * SCEMS FIELD TRAINING TRACKER',
  ' *',
  ' * BUILT FILE. Do not edit this. Edit the files in tracker/ and run',
  ' *   node tools/build-tracker.js',
  ' * A test fails if this file and those sources disagree.',
  ' *',
  ' * This used to be one file ordered by when each thing was written, with',
  ' * fourteen blocks marked ADD-ON appended to the bottom across six versions.',
  ' * It is now ordered by what each thing does. No behaviour changed in the',
  ' * move, and a test proves every declaration came through byte for byte.',
  ' */',
  ''
].join('\n');

/** Every line of the original, still there, the same number of times.
 *
 *  This is the check that matters, and it is deliberately parser-independent.
 *  Comparing parse(original) against parse(built) proved nothing at all: the
 *  same parser bug on both sides made two wrong answers agree, and a build
 *  that had truncated every array literal reported "all identical". A count
 *  of the actual lines cannot lie that way. */
function everyLineSurvived(original, built) {
  // Content, not indentation. A line of prose that moves from a banner into
  // a file header is the same line; a line that disappears is not.
  const bag = s => {
    const m = {};
    s.split('\n').forEach(l => {
      const k = l.replace(/^[\s]*(\/\*+|\*+\/?|\/\/)?[\s]*/, '')
                 .replace(/[\s*\/=-]+$/, '')
                 .replace(/\s+/g, ' ').trim();
      if (!k) return;
      if (/^[=\-*\/ ]+$/.test(k)) return;          // rules and blank comment lines
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  };
  const a = bag(original), b = bag(built);
  const gone = [];
  Object.keys(a).forEach(k => {
    if ((b[k] || 0) >= a[k]) return;
    if (OBSOLETE.some(re => re.test(k))) return;   // dropped on purpose, and printed
    gone.push(k);
  });
  return gone;
}

/** Nothing lost, nothing gained, nothing reordered past what it needs. */
function verify(originalPath, built) {
  const before = parse(fs.readFileSync(originalPath, 'utf8')).filter(u => u.kind === 'decl');
  const after = parse(built).filter(u => u.kind === 'decl');

  // Compare the CODE, not the comment above it. A section heading that used
  // to float between two functions now travels with one of them, so the text
  // of a unit legitimately shifts; its body must not.
  const codeOf = u => {
    const ls = u.lines.slice();
    while (ls.length && !/^(function|var|const|let)\s/.test(ls[0])) ls.shift();
    return ls.join('\n').trim();
  };
  const b = {}, a = {};
  before.forEach(u => { b[u.name] = codeOf(u); });
  after.forEach(u => { a[u.name] = codeOf(u); });

  const lost = Object.keys(b).filter(n => !(n in a));
  const gained = Object.keys(a).filter(n => !(n in b));
  const changed = Object.keys(b).filter(n => n in a && a[n] !== b[n]);

  // the eight that must stay downstream of what builds them
  const order = {};
  after.forEach((u, i) => { order[u.name] = i; });
  const needs = { DECISIONS_TAB: 'TAB', ARCHIVE_TAB: 'TAB', SKILL_CATALOG_TAB: 'TAB',
    FTO_ROSTER_TAB_V19: 'TAB', TRAINEE_SKILLS_TAB_V19: 'TAB',
    EXPECTED_FORMS_V19: 'FORM_TITLES', SKILL_FORM_TITLE_V19: 'FORM_TITLES',
    HANDOVER_FORM_TITLE_V19: 'FORM_TITLES' };
  const misordered = Object.keys(needs).filter(n =>
    order[n] !== undefined && order[needs[n]] !== undefined && order[n] < order[needs[n]]);

  const gone = everyLineSurvived(fs.readFileSync(originalPath, 'utf8'), built);

  return { lost, gained, changed, misordered, gone,
           ok: !lost.length && !gained.length && !changed.length &&
               !misordered.length && !gone.length,
           count: before.length };
}

module.exports = { splitOut, build, verify, everyLineSurvived, OBSOLETE, SRC };

if (require.main === module) {
  const CODE = path.join(ROOT, 'Code.gs');
  // The file as it was shipped, frozen. Every build is checked against it, so
  // "the refile changed nothing" is a thing the machine asserts rather than a
  // thing I claim. It can be deleted once nobody needs the reassurance.
  const ORIG = path.join(ROOT, 'test', 'fixtures', 'Code-before-refile.gs');
  if (!fs.existsSync(ORIG)) fs.copyFileSync(CODE, ORIG);

  if (process.argv[2] === '--split') {
    splitOut(ORIG);
    console.log('split ' + ORIG + ' into ' + SRC);
  }
  const built = build();

  // The lossless check belongs to the REFILE, and it is a historical fact:
  // the file before it and the file straight after it, both frozen, compared
  // in test/tracker-refile.test.js. It is not a constraint on every edit made
  // afterwards - a fix is supposed to change the code, and a build that
  // refused to let it would be a build nobody could use.
  //
  // What the build still enforces is the part that stays true forever: no
  // declaration may move above something it is built from.
  const v = verify(path.join(__dirname, '..', 'test', 'fixtures', 'Code-after-refile.gs'), built);
  if (v.misordered.length) {
    console.error('A declaration moved above something it is built from: ' +
      v.misordered.join(', ') + '\nNothing was written.');
    process.exit(1);
  }
  fs.writeFileSync(CODE, built);
  const changes = v.lost.length + v.gained.length + v.changed.length;
  console.log('wrote Code.gs  (' + Math.round(built.length / 1024) + ' KB, ' +
    built.split('\n').length + ' lines, ' + v.count + ' declarations' +
    (changes ? ', ' + changes + ' changed since the refile' : ', unchanged since the refile') + ')');
  if (v.lost.length)    console.log('  removed: ' + v.lost.join(', '));
  if (v.gained.length)  console.log('  added:   ' + v.gained.join(', '));
  if (v.changed.length) console.log('  edited:  ' + v.changed.join(', '));
}
