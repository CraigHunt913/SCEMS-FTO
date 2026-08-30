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

  var bits = [];
  bits.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  bits.push('<title>Field Training report — ' + esc(person.name) + '</title>');
  bits.push('<style>');
  bits.push('body{font:12pt/1.45 Georgia,serif;color:#111;margin:24px;max-width:800px}');
  bits.push('h1{font:700 22pt/1.2 Georgia,serif;margin:0 0 4px}');
  bits.push('h2{font:700 13pt/1.2 Georgia,serif;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}');
  bits.push('.meta{color:#444;margin:0 0 18px}');
  bits.push('.kv{margin:2px 0}.k{color:#666;display:inline-block;min-width:9em}');
  bits.push('.sec{margin:10px 0 14px}.when{color:#555;font-size:10pt}');
  bits.push('.fld{margin:3px 0 3px 12px}.l{color:#666;display:inline-block;min-width:10em}');
  bits.push('table{border-collapse:collapse;width:100%;font-size:10.5pt}');
  bits.push('th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}');
  bits.push('th{background:#f3f3f3}');
  bits.push('@media print{body{margin:12mm}.noprint{display:none!important}}');
  bits.push('</style></head><body>');
  bits.push('<p class="noprint" style="margin:0 0 16px"><button onclick="window.print()">Print / Save as PDF</button> ');
  bits.push('<span style="color:#666">Use your browser print dialog → Save as PDF.</span></p>');
  bits.push('<h1>' + esc(person.name) + '</h1>');
  bits.push('<p class="meta">Field Training — Sumter County EMS<br>');
  bits.push('Report pulled ' + esc(new Date().toDateString()) + ' by ' + esc(viewer.email) + '<br>');
  bits.push(esc(PORTAL.VERSION) + '</p>');

  bits.push('<h2>Status</h2>');
  bits.push('<div class="kv"><span class="k">Level</span> ' + esc(person.level || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Phase</span> ' + esc(person.phase || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Status</span> ' + esc(person.status || (person.closed ? 'Closed' : 'Active')) + '</div>');
  bits.push('<div class="kv"><span class="k">Training officer</span> ' + esc(person.fto || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Shift</span> ' + esc(person.shift || '—') + '</div>');
  bits.push('<div class="kv"><span class="k">Start</span> ' +
    (person.started instanceof Date ? esc(person.started.toDateString()) : '—') + '</div>');
  if (person.closed) {
    bits.push('<div class="kv"><span class="k">Outcome</span> Released / cleared — prior record retained</div>');
  }
  bits.push('<div class="kv"><span class="k">Skills signed</span> ' +
    esc(String(clear.signed || 0)) + ' / ' + esc(String(clear.total || 0)) + '</div>');

  if (skills.length) {
    bits.push('<h2>Skills matrix</h2><table><tr><th>Skill</th><th>Readiness</th>');
    bits.push('<th>Successful</th><th>Independent</th><th>Dates</th><th>FTOs</th></tr>');
    skills.forEach(function (s) {
      bits.push('<tr><td>' + esc(s.skill) + '</td><td>' +
        esc(s.signed ? 'SIGNED OFF' : (s.readiness || '—')) + '</td><td>' +
        esc(String(s.successful)) + '</td><td>' + esc(String(s.independent)) + '</td><td>' +
        esc(String(s.distinctDates)) + '</td><td>' + esc(String(s.distinctFtos)) + '</td></tr>');
    });
    bits.push('</table>');
  }

  (rec.sections || []).forEach(function (part) {
    bits.push('<h2>' + esc(part.title) + ' (' + esc(String(part.count)) + ')</h2>');
    part.current.concat(part.earlier).forEach(function (s) {
      bits.push('<div class="sec"><div class="when">' + esc(s.when) +
        (s.by ? ' · ' + esc(s.by) : '') +
        (s.current ? ' · current' : '') +
        (s.group ? ' · ' + esc(s.group) : '') + '</div>');
      (s.fields || []).forEach(function (f) {
        bits.push('<div class="fld"><span class="l">' + esc(f.label) + '</span> ' +
          esc(f.value) + '</div>');
      });
      bits.push('</div>');
    });
  });

  bits.push('<p style="margin-top:28px;color:#666;font-size:9pt">Nothing in this report was edited. ');
  bits.push('It is a read of the vault as of the pull date.</p>');
  bits.push('</body></html>');

  auditV1_('REPORT PULLED', viewer.email, person.name + (person.closed ? ' | closed' : ''));
  return bits.join('');
}
