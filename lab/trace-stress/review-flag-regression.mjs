// Hercules synthetic safety-regression guard; no user data and no production activation.
import assert from 'node:assert/strict';
import {safetyRouting} from '../../netlify/functions/safety-lib.mts';
import {buildSignals,deterministicDelta,validateDelta,applyDelta} from '../../netlify/functions/cycle-lib.mts';
const route=safetyRouting({currentPain:'yes',painAreas:['knee'],redFlags:'no',professionalRestrictions:'no',professionalRestrictionScope:'',safetyDetails:''});
assert.equal(route.status,'REVIEW_NOTIFY');
const plan={version:'0.14.1',trainingHold:false,reviewRouting:{ownerReviewRequired:route.ownerReviewRequired},training:{pattern:['fullA','fullB'],sets:2,reviewRequired:true},nutrition:{},recover:{},mind:{},evolve:{}};
const state={startedAt:'',cycleNumber:1,completedSessions:{},checkins:[],baseline:null,checkpoint:null,finalMark:null};
const signals=buildSignals(state,plan,{},0);
const proposed=deterministicDelta(signals,plan);
assert.equal(proposed.trainingAction,'consolidate');
assert.equal(validateDelta({...proposed,trainingAction:'progress'},signals,plan).ok,false);
const next=applyDelta(plan,proposed,{level:'',minutes:'',mealPrepPreference:'',proteinPreferences:[],grainPreferences:[],veggiePreferences:[],openToOtherVeggies:false,foodStyles:[],eatOutFrequency:''},state);
assert.equal(next.trainingHold,false,'Ordinary limitation must not automatically become a global HOLD');
assert.equal(next.training.reviewRequired,true,'Pending owner review cannot disappear during monthly adaptation');
assert.equal(next.reviewRouting.ownerReviewRequired,true);
assert.equal(next.adaptation.cycle,2);
assert.equal(next.training.sets,2);
console.log('PASS pending-review lifecycle regression (TRAIN flag retained; no unsupported progress)');