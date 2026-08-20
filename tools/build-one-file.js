#!/usr/bin/env node
/**
 * Builds the single file you paste into Apps Script.
 *
 * Eight script files and one HTML page become one .gs. Nothing is rewritten
 * on the way through except the page, which becomes a string constant;
 * 30_WebApp.gs already knows to prefer that constant when it exists, so the
 * same source works either way.
 *
 *   node tools/build-one-file.js            writes the file
 *   node tools/build-one-file.js --check    exits non-zero if it is stale
 *
 * The check runs in the test suite, so the pasted file can never quietly
 * drift from the sources it was built from.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'portal');
const OUT = path.join(SRC, 'SCEMS_PORTAL_ONE_FILE.gs');

const MAX_CHUNK = 90;

const ORDER = ['00_Config', '10_Identity', '20_Data', '30_WebApp', '40_Forms',
               '50_Production', '60_History', '70_Backfill', '80_Import', '90_Staging'];

function rule(title) {
  const bar = '='.repeat(70);
  return '\n\n/* ' + bar + '\n * ' + title + '\n * ' + bar + ' */\n\n';
}

function build() {
  const version = (fs.readFileSync(path.join(SRC, '00_Config.gs'), 'utf8')
    .match(/VERSION:\s*'([^']+)'/) || [, 'unknown'])[1];

  // A fingerprint of every source that goes into this file. Deterministic, so
  // rebuilding an unchanged tree produces an identical file, and specific, so
  // "which build is in my editor" is a question with an answer.
  const stampSource = ORDER.map(n => fs.readFileSync(path.join(SRC, n + '.gs'), 'utf8'))
    .concat([fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8')]).join('\n');
  const build = crypto.createHash('sha256').update(stampSource).digest('hex').slice(0, 8);

  const head = [
    '/**',
    ' * SCEMS FIELD TRAINING PORTAL — ' + version,
    ' * Build ' + build,
    ' *',
    ' * The whole portal in one file. Paste it into a new Apps Script project',
    ' * and there is nothing else to add: the page is in here too, as a string',
    ' * at the bottom.',
    ' *',
    ' * BUILT FILE. Do not edit this. Edit the files in portal/ and run',
    ' *   node tools/build-one-file.js',
    ' * A test fails if this file and those sources disagree.',
    ' *',
    ' * First run: setUpStaging',
    ' * Then:      Deploy > New deployment > Web app',
    ' */',
    ''
  ].join('\n');

  let out = head;
  ORDER.forEach(name => {
    out += rule(name + '.gs');
    out += fs.readFileSync(path.join(SRC, name + '.gs'), 'utf8').replace(/\s+$/, '') + '\n';
  });

  // The page, in chunks. One chunk per line where a line is short enough,
  // and long lines cut into pieces, so NOTHING in the built file is a long
  // line. That matters more than it sounds: a 49,000-character line is what
  // a code editor mangles on paste and what a file viewer refuses to render,
  // and either one hands you a syntax error miles from the real cause.
  const html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const chunks = chunkText(html, MAX_CHUNK);

  out += rule('Index.html — the page, in chunks');
  out += [
    '/** The page. Built from portal/Index.html; do not edit it here.',
    ' *  30_WebApp.gs prefers this constant over an HTML file when it exists,',
    ' *  which is what makes the single-file paste work.',
    ' *',
    ' *  Cut into short pieces on purpose. Joined with no separator, so the',
    ' *  newlines are inside the pieces and the page comes back exactly. */',
    'var PORTAL_PAGE_HTML = [',
    chunks.map(c => '  ' + JSON.stringify(c)).join(',\n'),
    "].join('');",
    ''
  ].join('\n');

  out += [
    '',
    '',
    '/* ' + '='.repeat(70),
    ' * END OF FILE',
    ' *',
    ' * If you cannot see this block at the bottom of Code.gs, the paste was',
    ' * cut short. Select everything, delete it, and paste again.',
    ' *',
    ' * Or run portalPasteCheck from the Run dropdown; it says so either way.',
    ' * ' + '='.repeat(70) + ' */',
    '',
    'var PORTAL_BUILD = \'' + build + '\';',
    '',
    'function portalPasteCheck() {',
    '  var msg = (typeof PORTAL_PAGE_HTML === \'string\' && PORTAL_PAGE_HTML.length > 1000)',
    '    ? \'The paste is complete. \' + PORTAL.VERSION + \', build \' + PORTAL_BUILD +',
    '      \', page is \' + PORTAL_PAGE_HTML.length + \' characters.\'',
    '    : \'The paste is INCOMPLETE. Select everything in this file, delete it, \' +',
    '      \'and paste the whole file again.\';',
    '  Logger.log(msg);',
    '  return msg;',
    '}',
    ''
  ].join('\n');

  return out;
}

/** Splits text into pieces no longer than max, never between a surrogate
 *  pair, so an astral character cannot be cut in half. */
function chunkText(text, max) {
  const out = [];
  text.split('\n').forEach((line, i, all) => {
    const piece = line + (i < all.length - 1 ? '\n' : '');
    if (piece.length <= max) { if (piece.length) out.push(piece); return; }
    let p = 0;
    while (p < piece.length) {
      let end = Math.min(p + max, piece.length);
      const c = piece.charCodeAt(end - 1);
      if (c >= 0xD800 && c <= 0xDBFF && end < piece.length) end--;   // high surrogate
      out.push(piece.slice(p, end));
      p = end;
    }
  });
  return out;
}

const built = build();

if (process.argv.indexOf('--check') >= 0) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current === built) { console.log('SCEMS_PORTAL_ONE_FILE.gs is up to date'); process.exit(0); }
  console.error('SCEMS_PORTAL_ONE_FILE.gs is STALE. Run: node tools/build-one-file.js');
  process.exit(1);
}

fs.writeFileSync(OUT, built);
console.log('wrote ' + path.relative(ROOT, OUT) + '  (' +
  Math.round(built.length / 1024) + ' KB, ' + built.split('\n').length + ' lines)');
