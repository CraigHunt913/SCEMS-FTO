/**
 * Take Code.gs apart into its top-level units, losing nothing.
 *
 * A "unit" is one top-level declaration together with the comment block
 * immediately above it, because the comment IS part of the thing it explains
 * and moving one without the other is how a file becomes a lie.
 *
 * This only PARSES. It writes nothing. Everything downstream is checked
 * against it: if the units do not reassemble into the original byte for byte,
 * nothing else in this pipeline is allowed to run.
 */
const fs = require('fs');

function parse(src) {
  const lines = src.split('\n');
  const units = [];
  let section = '(preamble)';

  // Comments and blank lines are held here until we know what they belong to.
  // Attaching them AFTER the fact would emit them twice; a comment is part of
  // the thing it explains, and moving one without the other is how a file
  // becomes a lie.
  let pending = [];
  const flush = (kind) => {
    if (!pending.length) return;
    units.push({ kind: kind || 'other', section, lines: pending });
    pending = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\/\* ={4,}/.test(line) || /^\/\*{3,}/.test(line)) {
      flush('other');
      let j = i;
      while (j < lines.length && !/\*\/\s*$/.test(lines[j])) j++;
      const text = lines.slice(i, j + 1).join(' ');
      const named = text.match(/([0-9]{2}_[a-z_]+)\.gs/);
      const addon = text.match(/ADD-ON\s*:\s*([^*]+?)\s*\*/);
      if (named) section = named[1];
      else if (addon) section = 'ADDON: ' + addon[1].trim();
      else {
        const m = text.match(/\*\s+([A-Z][^*]{3,70})/);
        section = 'BLOCK: ' + (m ? m[1].trim().replace(/\s+/g, ' ') : 'unnamed');
      }
      units.push({ kind: 'banner', section, lines: lines.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    if (/^\s*$/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) {
      pending.push(line);
      i++;
      continue;
    }

    if (/^(function\s+[A-Za-z0-9_$]+|var\s+[A-Za-z0-9_$]+|const\s+[A-Za-z0-9_$]+|let\s+[A-Za-z0-9_$]+)/.test(line)) {
      // EVERY comment above a declaration travels with it, not just the doc
      // block touching it. The file marks its sub-sections with banners like
      //   /* ---- Mail : every send decides mode at send time ---- */
      // sitting a blank line above the first function they introduce. Treating
      // those as loose text drops 187 lines of the only navigation this file
      // has. They belong to what follows them, and they move with it.
      let head = pending;
      let top = 0;
      while (top < head.length && /^\s*$/.test(head[top])) top++;    // leading blanks are spacing
      const loose = head.slice(0, top);
      const comment = head.slice(top);
      pending = [];
      if (loose.length) units.push({ kind: 'other', section, lines: loose });

      // Where the declaration ends. Counting only { } truncates every array:
      //   var KEEP_TOOLS_V19 = [
      //     { fn: 'x', why: 'y' },      <- balanced braces, depth back to 0
      //   ];                            <- the real end, four lines later
      // and the first element looked like the end. Brackets and parentheses
      // count too, and the line has to actually close something.
      // Where the declaration ends.
      //
      // Not by counting brackets. Two attempts at that both failed on this
      // file - once on array literals, once on a bracket inside a comment -
      // and each failure was invisible, because the check compared the parser
      // against itself. There is a far more reliable fact available: in this
      // file every top-level declaration begins in column 0, and nothing else
      // does. So a declaration runs until the next thing that starts in
      // column 0, and the parser needs to know nothing about JavaScript.
      let j = i;
      while (j + 1 < lines.length && !topLevelStart(lines[j + 1])) j++;
      // trailing blank lines belong to the gap, not to the declaration
      while (j > i && /^\s*$/.test(lines[j])) j--;

      const name = (line.match(/^(?:function|var|const|let)\s+([A-Za-z0-9_$]+)/) || [, '?'])[1];
      units.push({ kind: 'decl', name, section,
                   lines: comment.concat(lines.slice(i, j + 1)) });
      i = j + 1;
      continue;
    }

    flush('other');
    units.push({ kind: 'other', section, lines: [line] });
    i++;
  }
  flush('other');
  return units;
}

/** One line with everything that is not code taken out of it, carrying the
 *  block-comment state across lines.
 *
 *  Counting brackets without this is how the scanner swallowed half the file:
 *  a comment reading "[var EXPECTED_FORMS_V19 : moved to 99_config.gs]" opens
 *  a bracket that never closes, the depth never returns to zero, and the
 *  declaration absorbs every one that follows it. */
/** Does this line begin a new top-level thing? Column 0 is the whole test. */
function topLevelStart(line) {
  return /^(function|var|const|let)\s+[A-Za-z0-9_$]/.test(line) ||
         /^\/\*/.test(line) || /^\/\//.test(line);
}

function codeOnly(line, inBlock) {
  let out = '', i = 0;
  while (i < line.length) {
    if (inBlock) {
      const end = line.indexOf('*/', i);
      if (end < 0) { i = line.length; break; }
      inBlock = false; i = end + 2; continue;
    }
    const two = line.substr(i, 2);
    if (two === '/*') { inBlock = true; i += 2; continue; }
    if (two === '//') break;
    const c = line[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < line.length && line[i] !== c) { if (line[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return { text: out, inBlock: inBlock };
}

function stripNoise(l) {
  return l.replace(/\\./g, '')
          .replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
          .replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}
function netDepth(s) {
  const open = (s.match(/[{\[(]/g) || []).length;
  const shut = (s.match(/[}\])]/g) || []).length;
  return open - shut;
}

module.exports = { parse };

if (require.main === module) {
  const src = fs.readFileSync(process.argv[2] || 'Code.gs', 'utf8');
  const units = parse(src);
  const back = units.map(u => u.lines.join('\n')).join('\n');
  if (back !== src) {
    const a = src.split('\n'), b = back.split('\n');
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      if (a[k] !== b[k]) { console.error('LOSSY at line ' + (k + 1) + '\n  was: ' + a[k] + '\n  got: ' + b[k]); break; }
    }
    console.error('lines: ' + a.length + ' -> ' + b.length);
    process.exit(1);
  }
  console.log('lossless: ' + units.length + ' units, reassembles byte for byte');
  const bySection = {};
  units.filter(u => u.kind === 'decl').forEach(u => {
    (bySection[u.section] = bySection[u.section] || []).push(u.name);
  });
  Object.keys(bySection).forEach(s => {
    console.log('  ' + String(bySection[s].length).padStart(3) + '  ' + s);
  });
}
