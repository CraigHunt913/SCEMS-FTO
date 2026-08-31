/**
 * The form registry.
 *
 * The nine Google Forms already in service stay exactly as they are. They are
 * the WRITE surface of this system: a submission goes where it has always
 * gone, through the triggers that already exist. This portal is the READ
 * surface and the router. It never changes a trigger, never rewrites form
 * structure, and never submits on anyone's behalf.
 *
 * One exception, on purpose: when a trainee or FTO is added here,
 * syncRegisteredFormChoicesV1_ refreshes Trainee / FTO LIST choices on those
 * same registered forms so the dropdowns already in service offer the new
 * name. That is how Field Training links a new person to the forms you already have
 * — without creating a tenth form.
 *
 * What this file adds is the part that was missing: one authoritative list of
 * which form is which, who it belongs to, and what it is for, so that a person
 * is shown the one form their situation calls for instead of a page of nine
 * links they have to choose between.
 *
 * Two things are cached in script properties because they cost an API call:
 *   PORTAL_FORM_URL_<KEY>   the published URL
 *   PORTAL_FORM_FIELDS_<KEY> the entry.NNN ids used for prefilling
 * Both are discovered by READING the form. Discovery uses createResponse(),
 * which builds a response object in memory; it is never submitted. Nothing in
 * this file writes to a form.
 */

/** Level a form belongs to, when it is level-specific. '' means any level. */
var PORTAL_FORMS = [

  { key: 'FTO_EVAL',
    id: '1VzbpZvnOqpxOFReKctU6XeJdQDZPIlcgL3a4JkomCrQ',
    title: 'End-of-shift evaluation',
    blurb: 'The shift you just worked. Ratings, one strength, one thing to work on.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '02 FTO SHIFT EVAL RAW',
    prefill: { fto: /^(fto|your name|evaluat|training officer)/i,
               trainee: /trainee/i } },

  { key: 'SELF_REFLECTION',
    id: '1L5SOaVOlpaZLn-Xn5ZJxyFUtCFZ0PLsQLpENbUqNVm0',
    title: 'Self-reflection',
    blurb: 'Your own account of how it went. Your FTO reads it before your next shift.',
    roles: ['TRAINEE'],
    perTrainee: false,
    level: '',
    landsIn: '03 SELF-REFLECTION RAW',
    prefill: { trainee: /^(trainee|your name|name)/i } },

  { key: 'URGENT_CONCERN',
    id: '1L5qB6Mqq9kGir1jdlQrjl7HznPcdyPmHXQocoMvness',
    title: 'Urgent concern',
    blurb: 'Patient safety or conduct that cannot wait for the next evaluation.',
    roles: ['TRAINEE', 'FTO', 'SUPERVISOR', 'TRAINING_DIVISION'],
    perTrainee: false,
    level: '',
    urgent: true,
    landsIn: '04 URGENT CONCERNS RAW',
    prefill: { fto: /^(your name|reported by|name)/i,
               trainee: /trainee/i } },

  { key: 'DECISION_RECORD',
    id: '1SkwoC-RxkNPu85F4OXFUVj41Jvv8vj8YBI_QqWizNgU',
    title: 'Training decision record',
    blurb: 'Advance a phase, extend, or hold. The written record of the decision.',
    roles: ['TRAINING_DIVISION'],
    perTrainee: true,
    level: '',
    landsIn: '12 DECISION QUEUE',
    prefill: { trainee: /trainee/i } },

  { key: 'HANDOVER',
    id: '1IKwMUneMjH-OL3nx_r_k-d4gnq6WlwLQxEbxOKHL_uE',
    title: 'Handover card',
    blurb: 'Covering someone else’s trainee today. What the regular FTO needs to know.',
    roles: ['FTO'],
    perTrainee: true,
    level: '',
    landsIn: '',
    prefill: { fto: /^(your name|covering|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_EMT',
    id: '1nhl49xC6v6gMzFb_CZafJaM1zlIVEvbrquDOGSg6YDQ',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'emt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_AEMT',
    id: '1H39FqiIQGIJ-CWFnhDfWs7MWjJMJyMIYfdGqVhFOdgw',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'aemt',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  { key: 'SKILLS_PMD',
    id: '1Ykg2qmx-C3Q2TzUPK287loucSPYlOhW8t6dtpYR0VTI',
    title: 'Log a skill',
    blurb: 'One skill your trainee performed. Takes under a minute.',
    roles: ['FTO'],
    perTrainee: true,
    level: 'pmd',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: { fto: /^(fto|your name|name)/i, trainee: /trainee/i } },

  /* Retired, and the reason is not cosmetic - but it is narrower than it
     first looked. This form IS linked to the tracker, so its responses do
     arrive: Google drops them into a response tab of their own. What has
     never happened is the step that turns a response into a row in the
     evidence log, because no submit trigger is bound to the form. So the
     answers are present and unused rather than absent.

     The portal must not send anyone here while that is true, and the Training
     Division view says so. unprocessedResponses() lists what is waiting.
     Nothing about the form itself is changed by this portal. */
  { key: 'SKILLS_COMBINED',
    id: '1Q1R2bQPQe3eDbiDQTGJJHtzgAOC9jhEJJUkeh2w2u4s',
    title: 'Skills quick log (all levels)',
    blurb: 'Superseded by the three level-specific logs.',
    roles: [],
    perTrainee: false,
    level: '',
    retired: true,
    retiredWhy: 'No submit trigger is bound to it. Responses do land in the ' +
      'tracker, in a response tab of their own, but nothing turns them into rows ' +
      'in the evidence log. Run unprocessedResponses() to see them.',
    landsIn: '19 SKILL EVIDENCE LOG',
    prefill: {} }
];

/** Registry lookup by key. Returns null rather than throwing, because a
 *  missing form must degrade to "no link" and never to a broken page. */
function formByKeyV1_(key) {
  for (var i = 0; i < PORTAL_FORMS.length; i++) {
    if (PORTAL_FORMS[i].key === key) return PORTAL_FORMS[i];
  }
  return null;
}

/** Are form links live? Off in staging by default: a sandbox user tapping a
 *  link would land on the REAL form, and a submission there is a production
 *  write nobody approved. Turn it on deliberately with enableFormLinks(). */
function formLinksLiveV1_() {
  var p = String(PropertiesService.getScriptProperties()
    .getProperty('PORTAL_FORM_LINKS') || '').toUpperCase();
  if (p === 'ON') return true;
  if (p === 'OFF') return false;
  return modeV1_() !== PORTAL.MODE_STAGING;
}

/* ---------------- URLs ---------------- */

/** The published URL, cached. Falls back to the document URL, which resolves
 *  for anyone in the county domain, so a forms-scope failure costs prefill
 *  but never costs the link. */
function formUrlV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_URL_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) return hit;
  var url = '';
  try { url = FormApp.openById(entry.id).getPublishedUrl(); } catch (e) { url = ''; }
  if (!url) url = 'https://docs.google.com/forms/d/' + entry.id + '/viewform';
  try { props.setProperty(cacheKey, url); } catch (e) {}
  return url;
}

/** entry.NNN ids for the fields this portal knows how to prefill, cached.
 *  Discovery reads the form and builds an unsubmitted response to see which
 *  parameter carries which item. It never calls submit(). */
function formFieldsV1_(entry) {
  var props = PropertiesService.getScriptProperties();
  var cacheKey = 'PORTAL_FORM_FIELDS_' + entry.key;
  var hit = props.getProperty(cacheKey);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var map = {};
  try {
    var form = FormApp.openById(entry.id);
    var items = form.getItems();
    var wanted = entry.prefill || {};
    Object.keys(wanted).forEach(function (field) {
      var re = wanted[field];
      for (var i = 0; i < items.length; i++) {
        var found = probeItemV1_(form, items[i], re);
        if (found) { map[field] = found; break; }
      }
    });
  } catch (e) { map = {}; }

  try { props.setProperty(cacheKey, JSON.stringify(map)); } catch (e) {}
  return map;
}

/** One item: does its title match, and if so what is its entry id?
 *  Text items prefill with anything. Choice items prefill only with a value
 *  the form already offers, so the choices come back with the id. */
function probeItemV1_(form, item, re) {
  var title = '';
  try { title = String(item.getTitle() || ''); } catch (e) { return null; }
  if (!re.test(title)) return null;

  var type = String(item.getType());
  var response = null, choices = null;
  try {
    if (type === 'TEXT') {
      response = item.asTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'PARAGRAPH_TEXT') {
      response = item.asParagraphTextItem().createResponse('SCEMSPREFILLPROBE');
    } else if (type === 'LIST') {
      choices = item.asListItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asListItem().createResponse(choices[0]);
    } else if (type === 'MULTIPLE_CHOICE') {
      choices = item.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); });
      if (!choices.length) return null;
      response = item.asMultipleChoiceItem().createResponse(choices[0]);
    } else {
      return null;
    }
  } catch (e) { return null; }

  var url = '';
  try { url = form.createResponse().withItemResponse(response).toPrefilledUrl(); } catch (e) { return null; }
  var m = url.match(/[?&](entry\.[0-9]+(?:_sentinel)?)=/);
  if (!m) return null;
  return { id: m[1], type: type, choices: choices, title: title };
}

/** A prefilled link, or the plain link when nothing can be prefilled.
 *  values is { fto: 'Dana Whitlock', trainee: 'Jamie Rivers' }. */
function prefilledUrlV1_(entry, values) {
  var base = formUrlV1_(entry);
  var vals = values || {};
  var fields;
  try { fields = formFieldsV1_(entry); } catch (e) { fields = {}; }

  var parts = [];
  Object.keys(vals).forEach(function (field) {
    var v = String(vals[field] == null ? '' : vals[field]).trim();
    var f = fields[field];
    if (!v || !f || !f.id) return;
    if (f.choices && f.choices.length) {
      var match = null;
      for (var i = 0; i < f.choices.length; i++) {
        if (normNameV1_(f.choices[i]) === normNameV1_(v)) { match = f.choices[i]; break; }
      }
      if (!match) return;              // never prefill a choice the form does not offer
      v = match;
    }
    parts.push(f.id + '=' + encodeURIComponent(v));
  });

  if (!parts.length) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'usp=pp_url&' + parts.join('&');
}

/* ---------------- what a person is offered ---------------- */

/** Turns a registry entry into the card the page renders. */
function formCardV1_(entry, values, subtitle) {
  return {
    key: entry.key,
    title: entry.title,
    blurb: subtitle || entry.blurb,
    urgent: !!entry.urgent,
    live: formLinksLiveV1_(),
    url: formLinksLiveV1_() ? prefilledUrlV1_(entry, values || {}) : ''
  };
}

/** The forms a role may open that are not tied to one trainee. */
function generalFormsForV1_(role, values) {
  var out = [];
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** The forms an FTO opens against ONE named trainee, with the right skills
 *  log for that trainee's level already chosen. This is the whole point of
 *  the registry: the FTO never picks a form, and never picks a level. */
function traineeFormsForV1_(role, trainee, values) {
  var out = [];
  var levelKey = trainee && trainee.levelKey ? trainee.levelKey : '';
  PORTAL_FORMS.forEach(function (f) {
    if (f.retired) return;
    if (!f.perTrainee) return;
    if (f.roles.indexOf(role) < 0) return;
    if (f.level && f.level !== levelKey) return;
    out.push(formCardV1_(f, values));
  });
  return out;
}

/** Every form a role can reach, general and per-trainee, deduplicated by key.
 *  Used by the Training Division view, which is allowed to see the whole set. */
function allFormsForV1_(role, values) {
  var seen = {}, out = [];
  generalFormsForV1_(role, values).concat(traineeFormsForV1_(role, null, values))
    .forEach(function (c) { if (!seen[c.key]) { seen[c.key] = true; out.push(c); } });
  return out;
}

/** Registry entries that are retired, for the Division's system view. */
function retiredFormsV1_() {
  return PORTAL_FORMS.filter(function (f) { return f.retired; })
    .map(function (f) { return { key: f.key, title: f.title, why: f.retiredWhy || '' }; });
}

/**
 * Keep the existing forms' Trainee / FTO dropdowns in step with the master
 * and roster. Called after addTrainee / addFto / undo.
 *
 * Only touches LIST items whose titles match the names the tracker already
 * syncs. Never adds questions, never changes destinations, never submits.
 */
function syncRegisteredFormChoicesV1_() {
  var out = { ok: false, forms: 0, notes: [], why: '' };
  var active;
  try {
    active = traineesV1_().filter(function (t) { return !t.closed; });
  } catch (e) {
    out.why = String(e.message || e);
    return out;
  }
  var allNames = active.map(function (t) { return t.name; }).sort();
  var byLevel = { emt: [], aemt: [], pmd: [] };
  active.forEach(function (t) {
    var k = t.levelKey || levelKeyV1_(t.level);
    if (byLevel[k]) byLevel[k].push(t.name);
  });
  Object.keys(byLevel).forEach(function (k) { byLevel[k].sort(); });

  var ftos = [];
  try {
    rosterActivePeopleV1_().forEach(function (p) {
      if (p.name && ftos.indexOf(p.name) < 0) ftos.push(p.name);
    });
  } catch (e2) {}
  ftos.sort();

  if (typeof FormApp === 'undefined' || !FormApp.openById) {
    out.why = 'FormApp is not available in this runtime';
    return out;
  }

  var touched = 0;
  PORTAL_FORMS.forEach(function (entry) {
    if (entry.retired) return;
    var form;
    try { form = FormApp.openById(entry.id); }
    catch (eOpen) {
      out.notes.push((entry.title || entry.key) + ' unreadable');
      return;
    }
    var traineeList = entry.level
      ? (byLevel[entry.level] || []).slice()
      : allNames.slice();
    var items;
    try {
      items = FormApp.ItemType && FormApp.ItemType.LIST
        ? form.getItems(FormApp.ItemType.LIST)
        : form.getItems().filter(function (it) {
            try { return it.getType && String(it.getType()) === 'LIST'; }
            catch (eT) { return false; }
          });
    } catch (eItems) {
      try { items = form.getItems(); } catch (e2) { items = []; }
    }
    var changed = false;
    (items || []).forEach(function (it) {
      var title = '';
      try { title = String(it.getTitle() || '').trim(); } catch (eTitle) { return; }
      var li;
      try { li = it.asListItem(); } catch (eLi) { return; }
      if (!li || !li.setChoiceValues) return;

      if (title === 'Trainee' || title === 'Trainee involved') {
        var list = traineeList.length ? traineeList
                 : (entry.level ? ['none at this level'] : ['none']);
        try { li.setChoiceValues(list); changed = true; } catch (eSet) {}
      } else if (title === 'Trainee you are covering') {
        try {
          li.setChoiceValues(allNames.length ? allNames : ['none']);
          changed = true;
        } catch (eSet2) {}
      } else if (title === 'FTO name') {
        try {
          li.setChoiceValues(ftos.length ? ftos : ['none in scope']);
          changed = true;
        } catch (eSet3) {}
      }
    });
    if (changed) {
      touched++;
      out.notes.push((entry.title || entry.key) + ' refreshed');
    }
  });

  out.ok = touched > 0 || allNames.length === 0;
  out.forms = touched;
  if (!touched && allNames.length) {
    out.why = 'no LIST items matched on the registered forms';
    out.ok = false;
  }
  return out;
}

/* ---------------- one-click operator functions ---------------- */

/** Turn the real form links on. Deliberate, because in staging this points
 *  sandbox users at production forms. */
function enableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'ON');
  return noteV1_('Form links are ON. In ' + safeModeV1_() + ' mode, cards now open the real forms.');
}

function disableFormLinks() {
  PropertiesService.getScriptProperties().setProperty('PORTAL_FORM_LINKS', 'OFF');
  return noteV1_('Form links are OFF. Cards render but do not open anything.');
}

/** Reads all nine forms once and caches their URLs and field ids, so the
 *  first person to open the portal does not pay for discovery. Read-only. */
function warmFormCache() {
  var lines = [];
  PORTAL_FORMS.forEach(function (f) {
    var url = '', fields = {}, err = '';
    try { url = formUrlV1_(f); fields = formFieldsV1_(f); }
    catch (e) { err = String(e.message || e); }
    lines.push(f.key + '\n  url    : ' + (url || '(could not read)') +
      '\n  prefill: ' + (Object.keys(fields).length ? Object.keys(fields).join(', ') : 'none found') +
      (err ? '\n  error  : ' + err : '') + (f.retired ? '\n  RETIRED: ' + f.retiredWhy : ''));
  });
  return noteV1_('FORM REGISTRY\n\n' + lines.join('\n\n') +
    '\n\nNothing was written to any form.');
}

/** Forgets the cached URLs and field ids. Run after a form is edited. */
function clearFormCache() {
  var props = PropertiesService.getScriptProperties();
  PORTAL_FORMS.forEach(function (f) {
    props.deleteProperty('PORTAL_FORM_URL_' + f.key);
    props.deleteProperty('PORTAL_FORM_FIELDS_' + f.key);
  });
  return noteV1_('Form cache cleared. It rebuilds on the next page load.');
}

/** Logs and, when there is a UI, shows a message. Returns it either way. */
function noteV1_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
