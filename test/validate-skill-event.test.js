const fs = require('fs');
// Code.gs has no top-level executable code, so it evaluates cleanly with no
// Google service stubs. Load it and exercise the real functions.
eval(fs.readFileSync('/home/user/SCEMS-FTO/Code.gs', 'utf8'));

let pass = 0; const fails = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label + '\n          expected ' + e + '\n          actual   ' + a);
         console.log('  FAIL  ' + label); }
}

// A catalog entry shaped exactly as catalogObjectsV19_ builds one.
const approved = { id:'SK-EMT-014', domain:'Vascular Access', skill:'IV access',
  emt:true, aemt:true, paramedic:true, active:true, context:'Patient care',
  minSuccess:3, minIndependent:2, minDates:2, minFtos:2,
  authority:'Division Chief of Training', standard:'2018 Protocols',
  effective:new Date(2026,0,1), retire:'', status:'APPROVED' };
const draft = Object.assign({}, approved, { status:'DRAFT : APPLICABILITY / THRESHOLD REVIEW' });

const trainee = { ok:true, record:{ closed:false, level:'EMT' } };
const closedTrainee = { ok:true, record:{ closed:true, level:'EMT' } };
const fto = { ok:true, record:{ active:true, trainsEmt:true, trainsAemt:false, trainsPmd:false } };

function evt(stage, over) {
  return Object.assign({
    stage: stage,
    prompting: promptingForStageV19_(stage),   // exactly what the handler passes
    outcome: 'Successful',
    context: 'Patient care',
    callRef: 'C-2026-0814-17',
    note: 'Cannulated left AC, 20g, first attempt, no complications.',
    attested: true,
    shiftDate: new Date(Date.now() - 86400000)
  }, over || {});
}

console.log('\nBUG 1 — catalog approval property');
check('APPROVED catalog row no longer rejected',
      validateSkillEventV20_1_(evt('P'), approved, trainee, fto), []);
check('DRAFT catalog row still rejected',
      validateSkillEventV20_1_(evt('P'), draft, trainee, fto),
      ['catalog row is not APPROVED']);

console.log('\nBUG 2 — prompting vocabulary on Independent stage');
check('promptingForStageV19_ still returns None for I', promptingForStageV19_('I'), 'None');
check('Independent rep now passes end to end',
      validateSkillEventV20_1_(evt('I'), approved, trainee, fto), []);
check('all four stages pass',
      ['O','A','P','I'].map(s => validateSkillEventV20_1_(evt(s), approved, trainee, fto).length),
      [0,0,0,0]);

console.log('\nGuards that must still bite');
check('Independent with coaching still rejected',
      validateSkillEventV20_1_(evt('I', {prompting:'Moderate coaching'}), approved, trainee, fto),
      ['Performed independently is inconsistent with prompting "Moderate coaching"']);
check('Independent with full takeover still rejected',
      validateSkillEventV20_1_(evt('I', {prompting:'Full takeover'}), approved, trainee, fto),
      ['Performed independently is inconsistent with prompting "Full takeover"']);
check('closed trainee still rejected',
      validateSkillEventV20_1_(evt('I'), approved, closedTrainee, fto),
      ['trainee is closed/released; no new evidence may accrue']);
check('future shift date still rejected',
      validateSkillEventV20_1_(evt('I', {shiftDate:new Date(Date.now()+7*86400000)}), approved, trainee, fto),
      ['shift date is in the future']);
check('missing narrative on Independent still rejected',
      validateSkillEventV20_1_(evt('I', {note:''}), approved, trainee, fto),
      ['evidence narrative is required for Independent or unsuccessful/unsafe entries']);
check('missing attestation still rejected',
      validateSkillEventV20_1_(evt('P', {attested:false}), approved, trainee, fto),
      ['attestation is required']);
check('unknown skill still rejected',
      validateSkillEventV20_1_(evt('P'), null, trainee, fto),
      ['skill is not in the approved catalog']);
check('FTO out of scope still rejected (AEMT trainee, EMT-only FTO)',
      validateSkillEventV20_1_(evt('P'), approved, {ok:true,record:{closed:false,level:'Advanced EMT'}}, fto),
      ['FTO roster scope does not permit training level Advanced EMT']);

console.log('\nDownstream: unsafe-skill alert gate');
const accepted = validateSkillEventV20_1_(
  evt('P', {outcome:'Unsuccessful / unsafe', note:'Lost airway, supervisor took over.'}),
  approved, trainee, fto);
check('unsafe event now validates clean, so it reaches EV_ACCEPTED_V19', accepted, []);

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\n' + fails.join('\n\n')); process.exit(1); }
