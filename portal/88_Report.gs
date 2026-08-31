/**
 * Printable / PDF trainee reports from Field Training.
 *
 * Division can pull a full training report for anyone on the master —
 * including Cleared / Independent — and print or save as PDF from the browser.
 * No tracker menu. Raw rows are not altered.
 */

/**
 * Build a print-ready HTML report for one trainee (active or released).
 * Division only.
 */
function traineeReportHtmlV1(traineeName) {
  var viewer = resolveViewerV1_(whoIsVisitingV1_());
  if (viewer.role !== PORTAL.ROLE.DIVISION) {
    throw new Error('Only the Training Division may pull a training report.');
  }
  var name = String(traineeName || '').trim();
  if (!name) throw new Error('Pick a trainee.');

  var person = null;
  traineesV1_().forEach(function (t) {
    if (!person && normNameV1_(t.name) === normNameV1_(name)) person = t;
  });
  if (!person) throw new Error('No trainee named "' + name + '" on the master.');

  var rec = recordForV1_(person.name);
  var skills = [];
  try { skills = skillsForV1_(person.norm); } catch (e) { skills = []; }
  var clear = clearanceAssessmentV1_(person);

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var dash = function (v) {
    var s = String(v == null ? '' : v).trim();
    return s ? esc(s) : '—';
  };
  var fmtDate = function (d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
    return esc(Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMM yyyy'));
  };
  var pulled = Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
    "EEEE d MMMM yyyy 'at' h:mm a");
  var statusLabel = person.status || (person.closed ? 'Closed' : 'Active');
  var signed = Number(clear.signed || 0);
  var total = Number(clear.total || 0);
  var skillPct = total > 0 ? Math.round((signed / total) * 100) : 0;

  var bits = [];
  bits.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
  bits.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  bits.push('<title>Field Training report — ' + esc(person.name) + '</title>');
  bits.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
  bits.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  bits.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap">');
  bits.push('<style>');
  bits.push(':root{--navy:#0f1c14;--navy-2:#1a2e22;--gold:#c4a035;--ink:#142018;' +
    '--muted:#46566d;--line:#d4cfc4;--paper:#fffcf7;--ok:#2f7d4f;--stop:#a8342b}');
  bits.push('*{box-sizing:border-box}');
  bits.push('html,body{margin:0;padding:0;background:#e8ebe8;color:var(--ink);' +
    'font:11pt/1.45 "IBM Plex Sans",system-ui,sans-serif;' +
    '-webkit-font-smoothing:antialiased}');
  bits.push('.sheet{max-width:8.5in;margin:18px auto;background:var(--paper);' +
    'box-shadow:0 0 0 1px rgba(15,28,20,.12),0 18px 40px -28px rgba(0,0,0,.55);' +
    'padding:0 0 28px}');
  bits.push('.noprint{padding:14px 22px;background:#fff;border-bottom:1px solid var(--line);' +
    'display:flex;gap:12px;align-items:center;flex-wrap:wrap}');
  bits.push('.noprint button{appearance:none;border:0;background:var(--navy);color:#fff;' +
    'font:700 .85rem/1 "Oswald",sans-serif;letter-spacing:.12em;text-transform:uppercase;' +
    'padding:12px 18px;cursor:pointer}');
  bits.push('.noprint button:hover{background:var(--navy-2)}');
  bits.push('.noprint .hint{color:var(--muted);font-size:.9rem}');
  bits.push('.mast{background:var(--navy);color:#fff;padding:18px 28px 16px;' +
    'border-bottom:3px solid var(--gold)}');
  bits.push('.mast .county{font:700 .72rem/1 "Oswald",sans-serif;letter-spacing:.22em;' +
    'text-transform:uppercase;color:var(--gold);margin:0 0 6px}');
  bits.push('.mast .program{font:600 .7rem/1.2 "IBM Plex Sans",sans-serif;letter-spacing:.16em;' +
    'text-transform:uppercase;color:rgba(255,255,255,.72);margin:0}');
  bits.push('.title-block{padding:22px 28px 8px}');
  bits.push('h1{font:700 1.85rem/1.1 "Oswald",sans-serif;letter-spacing:.02em;' +
    'text-transform:uppercase;margin:0 0 6px;color:var(--navy)}');
  bits.push('.doc-type{font:600 .68rem/1 "Oswald",sans-serif;letter-spacing:.18em;' +
    'text-transform:uppercase;color:var(--gold);margin:0 0 10px}');
  bits.push('.pulled{margin:0;color:var(--muted);font-size:.86rem}');
  bits.push('.status-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:0;' +
    'margin:16px 28px 8px;border:1px solid var(--line)}');
  bits.push('.status-strip .cell{padding:10px 12px;border-right:1px solid var(--line);' +
    'background:#f7f5f0}');
  bits.push('.status-strip .cell:last-child{border-right:0}');
  bits.push('.status-strip .k{display:block;font:600 .62rem/1 "Oswald",sans-serif;' +
    'letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}');
  bits.push('.status-strip .v{display:block;font-weight:600;font-size:.95rem;color:var(--navy)}');
  bits.push('.facts{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;' +
    'margin:8px 28px 0;padding:12px 0;border-top:1px solid var(--line)}');
  bits.push('.facts .kv{display:flex;gap:10px;padding:3px 0;font-size:.92rem}');
  bits.push('.facts .k{min-width:8.5em;color:var(--muted);font-weight:500}');
  bits.push('.facts .v{color:var(--ink);font-weight:500}');
  bits.push('h2{font:700 .72rem/1 "Oswald",sans-serif;letter-spacing:.16em;' +
    'text-transform:uppercase;color:var(--navy);margin:22px 28px 10px;' +
    'padding-bottom:6px;border-bottom:2px solid var(--navy)}');
  bits.push('h2 .n{float:right;color:var(--muted);font-weight:600;letter-spacing:.08em}');
  bits.push('.table-wrap{margin:0 28px}');
  bits.push('table{border-collapse:collapse;width:100%;font-size:.86rem}');
  bits.push('th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left;' +
    'vertical-align:top}');
  bits.push('th{font:600 .62rem/1 "Oswald",sans-serif;letter-spacing:.12em;' +
    'text-transform:uppercase;color:var(--muted);background:#f3f1eb;border-bottom:1px solid #cfc9bc}');
  bits.push('tr.signed td{background:#eaf4ee}');
  bits.push('td.skill{font-weight:500}');
  bits.push('.mark{display:inline-block;font:700 .58rem/1 "Oswald",sans-serif;' +
    'letter-spacing:.1em;text-transform:uppercase;color:var(--ok);' +
    'border:1px solid #9fc9ae;padding:2px 5px}');
  bits.push('.sec{margin:0 28px 12px;padding:10px 12px;border-left:3px solid var(--gold);' +
    'background:#faf8f3}');
  bits.push('.sec .when{font:600 .68rem/1.3 "Oswald",sans-serif;letter-spacing:.1em;' +
    'text-transform:uppercase;color:var(--muted);margin:0 0 6px}');
  bits.push('.sec .fld{display:flex;gap:10px;padding:2px 0;font-size:.9rem}');
  bits.push('.sec .l{min-width:10em;color:var(--muted);flex:none}');
  bits.push('.foot{margin:28px 28px 0;padding-top:12px;border-top:1px solid var(--line);' +
    'color:var(--muted);font-size:.78rem}');
  bits.push('.foot .brand{font:600 .62rem/1 "Oswald",sans-serif;letter-spacing:.14em;' +
    'text-transform:uppercase;color:var(--navy);margin:0 0 4px}');
  bits.push('@media print{');
  bits.push('  html,body{background:#fff}');
  bits.push('  .sheet{margin:0;box-shadow:none;max-width:none}');
  bits.push('  .noprint{display:none!important}');
  bits.push('  .mast,.status-strip .cell,th,tr.signed td,.sec{');
  bits.push('    -webkit-print-color-adjust:exact;print-color-adjust:exact}');
  bits.push('  h2,.sec{break-inside:avoid}');
  bits.push('  @page{margin:.55in .6in;size:letter}');
  bits.push('}');
  bits.push('@media(max-width:700px){');
  bits.push('  .status-strip{grid-template-columns:1fr 1fr}');
  bits.push('  .status-strip .cell:nth-child(2){border-right:0}');
  bits.push('  .facts{grid-template-columns:1fr}');
  bits.push('  .title-block,.mast,.table-wrap,.sec,h2,.foot,.facts{padding-left:16px;padding-right:16px;margin-left:16px;margin-right:16px}');
  bits.push('  .mast,.title-block{margin-left:0;margin-right:0;padding-left:16px;padding-right:16px}');
  bits.push('  h2,.facts,.table-wrap,.sec,.foot{margin-left:16px;margin-right:16px}');
  bits.push('}');
  bits.push('</style></head><body><div class="sheet">');

  bits.push('<div class="noprint"><button type="button" onclick="window.print()">Print / Save as PDF</button>');
  bits.push('<span class="hint">Browser print dialog → Save as PDF. Letter size recommended.</span></div>');

  bits.push('<header class="mast">');
  bits.push('<p class="county">' + esc(PORTAL.COUNTY) + '</p>');
  bits.push('<p class="program">' + esc(PORTAL.PRODUCT) + ' · Official trainee report</p>');
  bits.push('</header>');

  bits.push('<div class="title-block">');
  bits.push('<p class="doc-type">Training record summary</p>');
  bits.push('<h1>' + esc(person.name) + '</h1>');
  bits.push('<p class="pulled">Pulled ' + esc(pulled) + ' by ' + esc(viewer.email) + '</p>');
  bits.push('</div>');

  bits.push('<div class="status-strip">');
  bits.push('<div class="cell"><span class="k">Status</span><span class="v">' + dash(statusLabel) + '</span></div>');
  bits.push('<div class="cell"><span class="k">Level</span><span class="v">' + dash(person.level) + '</span></div>');
  bits.push('<div class="cell"><span class="k">Phase</span><span class="v">' + dash(person.phase) + '</span></div>');
  bits.push('<div class="cell"><span class="k">Skills signed</span><span class="v">' +
    esc(String(signed)) + ' / ' + esc(String(total)) +
    (total ? ' <span style="color:var(--muted);font-weight:500">(' + esc(String(skillPct)) + '%)</span>' : '') +
    '</span></div>');
  bits.push('</div>');

  bits.push('<div class="facts">');
  bits.push('<div><div class="kv"><span class="k">Training officer</span><span class="v">' +
    dash(person.fto) + '</span></div>');
  bits.push('<div class="kv"><span class="k">Shift</span><span class="v">' +
    dash(person.shift) + '</span></div></div>');
  bits.push('<div><div class="kv"><span class="k">Started</span><span class="v">' +
    fmtDate(person.started) + '</span></div>');
  if (person.closed) {
    bits.push('<div class="kv"><span class="k">Outcome</span><span class="v">' +
      'Released / cleared — prior record retained</span></div>');
  } else {
    bits.push('<div class="kv"><span class="k">Program</span><span class="v">In training</span></div>');
  }
  bits.push('</div></div>');

  if (skills.length) {
    bits.push('<h2>Skills matrix <span class="n">' + esc(String(skills.length)) + '</span></h2>');
    bits.push('<div class="table-wrap"><table><thead><tr>');
    bits.push('<th>Skill</th><th>Readiness</th><th>Successful</th><th>Independent</th>');
    bits.push('<th>Dates</th><th>FTOs</th></tr></thead><tbody>');
    skills.forEach(function (s) {
      var signedOff = !!s.signed;
      bits.push('<tr' + (signedOff ? ' class="signed"' : '') + '><td class="skill">' +
        esc(s.skill) + '</td><td>' +
        (signedOff ? '<span class="mark">Signed off</span>' : dash(s.readiness)) +
        '</td><td>' + esc(String(s.successful)) + '</td><td>' +
        esc(String(s.independent)) + '</td><td>' +
        esc(String(s.distinctDates)) + '</td><td>' +
        esc(String(s.distinctFtos)) + '</td></tr>');
    });
    bits.push('</tbody></table></div>');
  }

  (rec.sections || []).forEach(function (part) {
    var rows = (part.current || []).concat(part.earlier || []);
    bits.push('<h2>' + esc(part.title) + ' <span class="n">' +
      esc(String(part.count != null ? part.count : rows.length)) + '</span></h2>');
    if (!rows.length) {
      bits.push('<p class="pulled" style="margin:0 28px 12px">None on file.</p>');
      return;
    }
    rows.forEach(function (s) {
      bits.push('<div class="sec"><div class="when">' + esc(s.when || 'Undated') +
        (s.by ? ' · ' + esc(s.by) : '') +
        (s.current ? ' · current' : '') +
        (s.group ? ' · ' + esc(s.group) : '') + '</div>');
      (s.fields || []).forEach(function (f) {
        bits.push('<div class="fld"><span class="l">' + esc(f.label) + '</span><span>' +
          esc(f.value) + '</span></div>');
      });
      bits.push('</div>');
    });
  });

  bits.push('<footer class="foot">');
  bits.push('<p class="brand">' + esc(PORTAL.COUNTY) + ' · ' + esc(PORTAL.PRODUCT) + '</p>');
  bits.push('<p>Read-only snapshot of the vault as of the pull date. Nothing in this report was edited. ' +
    esc(PORTAL.VERSION) + '</p>');
  bits.push('</footer>');
  bits.push('</div></body></html>');

  auditV1_('REPORT PULLED', viewer.email, person.name + (person.closed ? ' | closed' : ''));
  return bits.join('');
}
