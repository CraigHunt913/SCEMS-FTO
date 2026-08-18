// SCEMS v20.2 — identity tiers and deployability.
//
// v20.2 removed the fallback that let anyone who typed "Medical Director"
// into a cell sign off a clinical competency. Correct — but it left the gate
// depending on Session.getActiveUser(), which returns '' on a consumer
// Google account, so the system locked out its only operator and could not
// be deployed at all.
//
// The distinction that makes this fixable: asking the PLATFORM a second,
// weaker question, or reading a declaration the SCRIPT OWNER made once in
// script properties, is not the same as reading a name a user typed into a
// spreadsheet cell at decision time. The first two are credentials. The
// third is not, and it stays gone.
//
//   node test/identity-tiers.test.js

const fs = require('fs');

let PASS = 0, FAIL = 0;
function ok(c, w) { if (c) { PASS++; console.log('  PASS  ' + w); } else { FAIL++; console.log('  FAIL  ' + w); } }
function section(t) { console.log('\n' + t); }

let ACTIVE = '', EFFECTIVE = '', PROPS = {};
let SYSLOG = [], ACCESS = [];

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => null, getId: () => 'SS' }),
  getUi: () => ({ alert: () => 'ok', ButtonSet: {}, Button: {} }),
  ProtectionType: { SHEET: 'SHEET' }, flush: () => {}
};
global.Session = {
  getActiveUser: () => ({ getEmail: () => ACTIVE }),
  getEffectiveUser: () => ({ getEmail: () => EFFECTIVE }),
  getScriptTimeZone: () => 'America/New_York'
};
global.Utilities = { getUuid: () => 'stub', formatDate: () => '2026-08-18' };
global.Logger = { log: () => {} };
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
    setProperty: (k, v) => { PROPS[k] = v; },
    deleteProperty: k => { delete PROPS[k]; }
  })
};
global.MailApp = { sendEmail: () => {}, getRemainingDailyQuota: () => 100 };
global.ScriptApp = { getProjectTriggers: () => [] };

eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));
systemLog_ = function (l, k, d) { SYSLOG.push({ l, k, d }); };
const realAppend = appendRowsHeaderMappedV20_1_;
appendRowsHeaderMappedV20_1_ = function (tab, hr, objs) {
  if (tab === TAB.ACCESS) { ACCESS.push(objs[0]); return { firstRow: 1, count: 1 }; }
  return realAppend.apply(null, arguments);
};
function reset(active, effective, props) {
  ACTIVE = active || ''; EFFECTIVE = effective || ''; PROPS = props || {};
  SYSLOG = []; ACCESS = [];
}

// ---------------------------------------------------------------- //
section('The tiers, strongest first');
// ---------------------------------------------------------------- //
reset('boss@county.gov', 'script@county.gov', { SCEMS_OPERATOR_EMAIL: 'other@x.com' });
let id = identityV20_2_();
ok(id.tier === 'ACTIVE' && id.email === 'boss@county.gov',
   'getActiveUser wins outright when the platform answers');
ok(id.verified === true, 'and it is the only tier that counts as verified');
ok(identityStampV20_2_(id) === '', 'a verified record carries no stamp — clean records stay clean');

reset('', 'owner@gmail.com', { SCEMS_OPERATOR_EMAIL: 'other@x.com' });
id = identityV20_2_();
ok(id.tier === 'EFFECTIVE' && id.email === 'owner@gmail.com',
   'getEffectiveUser is next: the account the script actually runs as');
ok(id.verified === false, 'attested, not verified — inside a trigger it is the owner, not the editor');
ok(identityStampV20_2_(id) === ' [IDENTITY EFFECTIVE, ATTESTED]', 'and the record says exactly that');

reset('', '', { SCEMS_OPERATOR_EMAIL: 'operator@gmail.com' });
id = identityV20_2_();
ok(id.tier === 'OPERATOR' && id.email === 'operator@gmail.com',
   'the configured operator account is the last resort');
ok(id.verified === false, 'also attested');
ok(identityStampV20_2_(id) === ' [IDENTITY OPERATOR, ATTESTED]', 'stamped distinctly');

reset('', '', {});
id = identityV20_2_();
ok(id.email === '' && id.tier === '', 'nothing configured and nothing named: no identity');
ok(identityStampV20_2_(id) === ' [IDENTITY UNKNOWN]', 'which is never silently blank');
ok(IDENTITY_TIERS_V20_2.length === 3, 'there are exactly three tiers, all named');

// ---------------------------------------------------------------- //
section('A typed name is still worth nothing');
// ---------------------------------------------------------------- //
reset('', '', {});
['Medical Director', 'Division Chief of Training', 'C. Hunt', 'operator@gmail.com'].forEach(t => {
  ok(deciderAuthorityV20_1_(t).allowed === false,
     'typing "' + t + '" into DECIDED BY still grants nothing');
});
ok(!/decidedByText/.test(deciderAuthorityV20_1_.toString().replace(/\/\/[^\n]*/g, '')
     .replace(/function deciderAuthorityV20_1_\(decidedByText\)/, '')),
   'the parameter is never read anywhere in the body');
ok(!/leaders/.test(deciderAuthorityV20_1_.toString()), 'the old name allowlist is still gone');

// An operator account is set — but a typed name STILL does not decide who acted.
reset('', '', { SCEMS_OPERATOR_EMAIL: 'operator@gmail.com' });
resolveAuthorizedActorV20_1_ = function (e) {
  return { ok: true, roles: e === 'operator@gmail.com' ? ['PROGRAM_DIRECTOR'] : [], person: null };
};
let a = deciderAuthorityV20_1_('Somebody Else Entirely');
ok(a.allowed === true, 'authority comes from the configured account...');
ok(a.email === 'operator@gmail.com', '...and the record gets THAT address');
ok(a.verified === false && a.tier === 'OPERATOR', 'marked attested, with the tier recorded');

// ---------------------------------------------------------------- //
section('The gate is usable on a consumer account, and says what it is doing');
// ---------------------------------------------------------------- //
reset('', '', {});
let g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === false, 'with nothing configured the gate still refuses');
ok(/setOperatorAccountV20_2/.test(g.message), 'but now the refusal names the one-line fix');
ok(/not coming back/.test(g.message), 'while saying the typed-name hole is not returning');
ok(ACCESS.length === 1 && ACCESS[0]['AUTHORIZED'] === 'NO', 'the denial is still logged');

reset('', 'owner@gmail.com', {});
resolveAuthorizedActorV20_1_ = function () { return { ok: true, roles: ['PROGRAM_DIRECTOR'], person: null }; };
g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === true, 'a consumer account CAN work the queue — the system is deployable');
ok(g.identity.tier === 'EFFECTIVE', 'via the effective-user tier');
ok(/identity EFFECTIVE \(attested/.test(ACCESS[0]['DETAIL']),
   'and the access log records which tier granted it, every time');

reset('', '', { SCEMS_OPERATOR_EMAIL: 'operator@gmail.com' });
g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === true, 'so can a configured operator account');
ok(/identity OPERATOR/.test(ACCESS[0]['DETAIL']), 'logged as such');

reset('', 'nobody@gmail.com', {});
resolveAuthorizedActorV20_1_ = function () { return { ok: true, roles: ['FTO'], person: null }; };
g = requireActorV20_2_('WORK QUEUE');
ok(g.ok === false, 'an identified account without the role is still refused');
ok(/\[EFFECTIVE, attested\]/.test(g.message), 'and the refusal shows how it was identified');

// ---------------------------------------------------------------- //
section('Setting the operator account is deliberate and narrow');
// ---------------------------------------------------------------- //
reset('', '', {});
setOperatorAccountV20_2('operator@gmail.com');
ok(PROPS.SCEMS_OPERATOR_EMAIL === 'operator@gmail.com', 'the address is stored');
ok(SYSLOG.some(e => e.k === 'OPERATOR ACCOUNT SET'), 'and setting it is logged');

reset('', '', {});
let r = setOperatorAccountV20_2('not an email');
ok(/Refused/.test(r) && PROPS.SCEMS_OPERATOR_EMAIL === undefined, 'garbage is refused, nothing stored');

reset('', '', { SCEMS_OPERATOR_EMAIL: 'operator@gmail.com' });
setOperatorAccountV20_2('CLEAR');
ok(PROPS.SCEMS_OPERATOR_EMAIL === undefined, 'it can be cleared');
ok(identityV20_2_().email === '', 'after which the gate locks down again');
ok(SYSLOG.some(e => e.k === 'OPERATOR ACCOUNT CLEARED'), 'clearing is logged too');

reset('', '', {});
r = setOperatorAccountV20_2();
ok(/currently: \(none\)/.test(r), 'calling it with no argument reports rather than changes');
ok(PROPS.SCEMS_OPERATOR_EMAIL === undefined, 'and stores nothing');
ok(OPERATOR_PROP_V20_2 === 'SCEMS_OPERATOR_EMAIL',
   'the value lives in script properties, where no sheet formula or form can reach it');
ok(!/getSheetByName|getRange/.test(identityV20_2_.toString()),
   'identity never reads a spreadsheet cell — that is the whole point');

// ---------------------------------------------------------------- //
section('Deployment is one command, in dependency order');
// ---------------------------------------------------------------- //
const cl = goLiveChecklistV20_2.toString();
['setOperatorAccountV20_2', 'rebuildFormIdsNow', 'repairAllTriggersNow',
 'applyMigrationV20_1', 'rebuildSkillMatrixV19_', 'protectRecordTabsV20_2',
 'healthCheckV20_2'].forEach((fn, i) => {
  ok(cl.indexOf(fn) > 0, 'step ' + (i + 1) + ' calls ' + fn);
});
const order = ['rebuildFormIdsNow', 'repairAllTriggersNow', 'applyMigrationV20_1',
               'rebuildSkillMatrixV19_', 'protectRecordTabsV20_2'].map(f => cl.indexOf(f));
ok(order.every((v, i) => i === 0 || v > order[i - 1]),
   'and they appear in dependency order — forms before triggers, migration before matrix');
ok(/SKIPPED \(step/.test(cl), 'a failed step stops the rest rather than compounding');
ok(/safe to repeat/.test(cl), 'and the whole thing is re-runnable');
ok(!/deleteRow|clearContent|purge/.test(cl), 'the checklist itself destroys nothing');
ok(!/deleteRow|clearContent|purge/.test(deploymentStatusV20_2.toString()),
   'and the status command is strictly read-only');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
