import fs from 'node:fs';
import path from 'node:path';
import {buildSignals,deterministicDelta,clampDelta,validateDelta,applyDelta,dedupeDailyCheckins,dedupeSessionCompletions,week4Complete,milestoneTimeValid,stateCycleWriteAllowed} from '../netlify/functions/cycle-lib.mts';
import {digest,makeTrace} from '../netlify/functions/trace-lib.mts';
import {safetyRouting} from '../netlify/functions/safety-lib.mts';
import {mealAllowedByPreferences} from '../netlify/functions/catalog-lib.mts';
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,pass:!!ok,detail});if(!ok)console.error('FAIL',name,detail)};
const now=Date.now(),iso=d=>new Date(now-d*86400000).toISOString();
const pattern=['fullA','fullB','fullC'];
const basePlan={version:'0.14.1',risk:'green',trainingHold:false,training:{pattern,sets:2,reviewRequired:false},nutrition:{reviewRequired:false,principles:['role-stable meals']},recover:{},mind:{},evolve:{safetyReleaseAutomatic:false},catalog:{schema:'hercules-catalog-v1',strategy:{ingredientReuse:'balanced',variety:'balanced',reason:'test'},meals:[],exercises:[],lastAdaptedCycle:1,provenance:'bundled-only'}};
const profile={level:'intermediate',minutes:'60',mealPrepPreference:'mixed',proteinPreferences:['chicken'],grainPreferences:['rice'],veggiePreferences:['broccoli'],openToOtherVeggies:true,foodStyles:['grilled'],eatOutFrequency:'1-2_week'};
function sessions(){const out={};for(let w=1;w<=4;w++)for(const p of pattern)out[`w${w}:x:${p}`]=true;return out}
function checkins(value=4,n=14,symptom=false){return Array.from({length:n},(_,i)=>({ts:iso(i+1),dayKey:new Date(now-(i+1)*86400000).toISOString().slice(0,10),energy:value,sleep:value,training:value,nutrition:value,symptomFlag:symptom&&i===0,note:i===0?'bounded note':''}))}
function state(cycle=1,value=4,n=14,symptom=false){return {startedAt:iso(30),cycleNumber:cycle,completedSessions:sessions(),completedExercises:{},checkins:checkins(value,n,symptom),baseline:{ts:iso(30),weight:'180',targetWeight:'175'},checkpoint:{ts:iso(14),weight:'178'},finalMark:{ts:iso(1),weight:'176'},cycleHistory:Array.from({length:Math.max(0,cycle-1)},()=>({}))}}

const painRoute=safetyRouting({currentPain:'yes',painAreas:['knee'],redFlags:'no',professionalRestrictions:'no',professionalRestrictionScope:'',safetyDetails:'knee discomfort'});
check('ordinary pain routes to REVIEW_NOTIFY without global TRAIN restriction',painRoute.status==='REVIEW_NOTIFY'&&!painRoute.trainingRestricted&&painRoute.ownerReviewRequired);
const noExerciseRoute=safetyRouting({currentPain:'no',painAreas:[],redFlags:'no',professionalRestrictions:'yes',professionalRestrictionScope:'no_exercise',safetyDetails:'active professional restriction'});
check('professional no-exercise guidance restricts TRAIN',noExerciseRoute.status==='RESTRICTED'&&noExerciseRoute.trainingRestricted);
const redFlagRoute=safetyRouting({currentPain:'no',painAreas:[],redFlags:'yes',professionalRestrictions:'no',professionalRestrictionScope:'',safetyDetails:'red flag'});
check('red-flag route remains restricted',redFlagRoute.status==='RESTRICTED'&&redFlagRoute.trainingRestricted);

const dietBase={foodPreferences:'',proteinPreferences:[],grainPreferences:[],veggiePreferences:['broccoli'],openToOtherVeggies:false};
check('vegan text blocks hidden dairy metadata gap',mealAllowedByPreferences({...dietBase,foodPreferences:'vegan'},{protein:'',grain:'',veggies:[],title:{pt:'Cottage cheese',en:'Cottage cheese',es:'Cottage cheese'},ingredients:['cottage cheese','pineapple']})===false);
check('vegetarian text blocks hidden meat metadata gap',mealAllowedByPreferences({...dietBase,foodPreferences:'vegetarian'},{protein:'',grain:'',veggies:[],title:{pt:'Chicken bowl',en:'Chicken bowl',es:'Chicken bowl'},ingredients:['chicken','rice']})===false);
check('closed veggie preference is a hard gate',mealAllowedByPreferences(dietBase,{protein:'',grain:'',veggies:['tomato'],title:{pt:'Bowl',en:'Bowl',es:'Bowl'},ingredients:['rice','tomato']})===false);
check('selected protein preference is enforced when metadata exists',mealAllowedByPreferences({...dietBase,proteinPreferences:['tofu'],openToOtherVeggies:true},{protein:'chicken',grain:'',veggies:[],title:{pt:'Frango',en:'Chicken',es:'Pollo'},ingredients:['chicken']})===false);

const hi=buildSignals(state(1,4),basePlan,{},30),hiDelta=deterministicDelta(hi,basePlan);
check('high adherence supports progress',hiDelta.trainingAction==='progress',hiDelta.trainingAction);
check('high nutrition feedback rotates menu',hiDelta.nutritionAction==='rotate',hiDelta.nutritionAction);
check('high signals validate',validateDelta(hiDelta,hi,basePlan).ok);

const low=buildSignals(state(2,2),basePlan,{},30),lowDelta=deterministicDelta(low,basePlan);
check('low recovery consolidates training',lowDelta.trainingAction==='consolidate',lowDelta.trainingAction);
check('low nutrition simplifies',lowDelta.nutritionAction==='simplify',lowDelta.nutritionAction);
check('low sleep prioritizes recovery',lowDelta.recoveryAction==='prioritize',lowDelta.recoveryAction);

const symptom=buildSignals(state(3,4,14,true),basePlan,{},30),symptomDelta=deterministicDelta(symptom,basePlan);
check('symptom forces HOLD',symptomDelta.trainingAction==='hold',symptomDelta.trainingAction);
check('HOLD validates',validateDelta(symptomDelta,symptom,basePlan).ok);
const illegal={...symptomDelta,trainingAction:'progress'};
check('safety validator rejects progress under symptom',!validateDelta(illegal,symptom,basePlan).ok);

const maintainBase={...hiDelta,trainingAction:'maintain',nutritionAction:'maintain'};
const clamped=clampDelta({trainingAction:'progress',nutritionAction:'rotate',recoveryAction:'maintain',mindAction:'maintain',unknowns:['model_guess']},maintainBase);
check('AI training cannot be more aggressive',clamped.trainingAction==='maintain');
check('AI nutrition cannot be more aggressive',clamped.nutritionAction==='maintain');
check('model evidence cannot replace deterministic evidence',JSON.stringify(clamped.evidence)===JSON.stringify(maintainBase.evidence));

const month2=applyDelta(basePlan,hiDelta,profile,state(1,4));
check('Month 1 adapts to Month 2',month2.adaptation?.cycle===2);
check('Month 2 can expand catalog',month2.adaptation?.catalogMayExpand===true);
const month7=applyDelta({...basePlan,version:'0.14.1-cycle-6'},hiDelta,profile,state(6,4));
check('adaptation continues beyond Month 2',month7.adaptation?.cycle===7);
check('month 7 optimizer tracks month',month7.nutrition?.optimizer?.cycle===7);
check('month 7 training design tracks month',month7.training?.adaptiveDesign?.cycle===7);

const holdPlan={...basePlan,trainingHold:true,risk:'red'};
const holdSignals=buildSignals(state(4,4),holdPlan,{},30),holdDelta=deterministicDelta(holdSignals,holdPlan),holdNext=applyDelta(holdPlan,holdDelta,profile,state(4,4));
check('existing safety hold is preserved',holdNext.trainingHold===true&&holdNext.training.reviewRequired===true&&holdNext.risk==='red');

const dup=[...checkins(4,3),{...checkins(4,1)[0],energy:2}];
check('daily checkins deduplicate',dedupeDailyCheckins(dup).length===3);
check('Week 4 completion detected',week4Complete(state(),pattern));
const dupSessions={'w1:gym:fullA':true,'w1:home:fullA':true,'w1:fullB':true};check('gym/home duplicate session counts once',Object.values(dedupeSessionCompletions(dupSessions)).filter(Boolean).length===2);
const painState=state(2,4);painState.checkins=[{...painState.checkins[0],painFlag:true,redFlagSymptom:false,symptomFlag:false}];const painSignals=buildSignals(painState,basePlan,{},30),painDelta=deterministicDelta(painSignals,basePlan);check('pain review consolidates instead of HOLD',painSignals.painFlag===true&&painDelta.trainingAction==='consolidate');
check('future final mark rejected',!milestoneTimeValid('finalMark',iso(30),{ts:new Date(now+86400000).toISOString(),weight:'176'},now));

const d1=await digest({b:2,a:1}),d2=await digest({a:1,b:2}),d3=await digest({a:2,b:2});
check('stable digest ignores key order',d1===d2);
check('digest changes with content',d1!==d3);
const secretProfile={name:'Private Name',allergies:'private allergy note'};
const t=await makeTrace({kind:'next-cycle',appVersion:'0.14.1',cycleNumber:7,input:secretProfile,output:{ok:true},deterministic:{gate:'PASS'},reviewers:[{provider:'openai',model:'gpt-5.6-luna',route:'netlify-gateway',verdict:'PASS'}],decision:'APPROVED',authority:'SUPERVISED_NEXT_MONTH'});
check('trace uses sha256 digests',/^sha256:[a-f0-9]{64}$/.test(t.inputDigest)&&/^sha256:[a-f0-9]{64}$/.test(t.outputDigest));
check('trace privacy flags false',t.privacy.rawProfileStoredInTrace===false&&t.privacy.rawPromptStoredInTrace===false);
check('trace does not copy raw private profile',!JSON.stringify(t).includes('Private Name')&&!JSON.stringify(t).includes('private allergy note'));
check('trace records Gateway route',t.reviewers[0].route==='netlify-gateway');


check('state save permits same cycle only',stateCycleWriteAllowed(true,3,3)===true);
check('state save rejects direct next-cycle write',stateCycleWriteAllowed(true,3,4)===false);
check('fresh persistent state starts at cycle 1 only',stateCycleWriteAllowed(false,1,1)===true&&stateCycleWriteAllowed(false,1,2)===false);

const passed=checks.filter(x=>x.pass).length,failed=checks.length-passed;
const report={release:'0.14.1',suite:'adaptive-engine',generatedAt:new Date().toISOString(),passed,failed,total:checks.length,checks};
fs.writeFileSync(path.join(process.cwd(),'ADAPTIVE_REPORT_v0.14.1.json'),JSON.stringify(report,null,2)+'\n');
console.log(`adaptive-engine: ${passed}/${checks.length} PASS`);if(failed)process.exit(1);
