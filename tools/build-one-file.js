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

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'portal');
const OUT = path.join(SRC, 'SCEMS_PORTAL_ONE_FILE.gs');

const ORDER = ['00_Config', '10_Identity', '20_Data', '30_WebApp', '40_Forms',
               '50_Production', '60_History', '70_Backfill', '80_Import', '90_Staging'];

function rule(title) {
  const bar = '='.repeat(70);
  return '\n\n/* ' + bar + '\n * ' + title + '\n * ' + bar + ' */\n\n';
}

function build() {
  const version = (fs.readFileSync(path.join(SRC, '00_Config.gs'), 'utf8')
    .match(/VERSION:\s*'([^']+)'/) || [, 'unknown'])[1];

  const head = [
    '/**',
    ' * SCEMS FIELD TRAINING PORTAL — ' + version,
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

  // The page. One JS string per original line, so the file stays readable and
  // a diff still points at the line that changed.
  const html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const lines = html.split('\n').map(l => JSON.stringify(l));

  out += rule('Index.html — the page, as a string');
  out += [
    '/** The page. Built from portal/Index.html; do not edit it here.',
    ' *  30_WebApp.gs prefers this constant over an HTML file when it exists,',
    ' *  which is what makes the single-file paste work. */',
    'var PORTAL_PAGE_HTML = [',
    lines.map(l => '  ' + l).join(',\n'),
    "].join('\\n');",
    ''
  ].join('\n');

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
