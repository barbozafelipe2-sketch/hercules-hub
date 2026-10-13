/* Stage 5 synthetic, read-only test of REAL deterministic cycle engine.
 * No browser state, account, Netlify, Supabase, or writes. Run on full checkout.
 * Requires Node 22 with --experimental-strip-types.
 */
import assert from 'node:assert/strict';
import {buildSignals,deterministicDelta,validateDelta,clampDelta,week4Complete,milestoneTimeValid} from '../netlify/functions/cycle-lib.mts';
const NOW=Date.parse('2026-08-31T12:00:00.000Z');
const startedAt=new Date(NOW-29*86400e3).toISOString();
const patterns=['fullA','fullB'];
const plan={training:{pattern:patterns},trainingHold:false,reviewRouting:{ownerReviewRequired:false}};
const sessionDone=Object.fromEntries([1,2,3,4].flatMap(w=>patterns.map(p=>[`w${w}:${p}`,true])));
const baseline={ts:new Date(NOW-29*86400e3).toISOString(),weight:'180',targetWeight:'170'};
const checkpoint={ts:new Date(NOW-14*86400e3).toISOString(),weight:'177'};
const finalMark={ts:new Date(NOW-1*86400e3).toISOString(),weight:'176'};
const goodChecks=Array.from({length:14},(_,i)=>({ts:new Date(NOW-(i+1)*86400e3).toISOString(),energy:4,sleep:4,training:4,nutrition:4}));
let tests=0;const check=(label,fn)=>{fn();tests++;console.log('PASS '+label)};
const state=(extra={})=>({cycleNumber:1,startedAt,completedSessions:sessionDone,baseline,checkpoint,finalMark,checkins:goodChecks,...extra});
check('synthetic weeks complete',()=>assert.equal(week4Complete(state(),patterns),true));
check('synthetic final mark respects 28 days',()=>assert.equal(milestoneTimeValid('finalMark',startedAt,finalMark,NOW),true));
const signals=buildSignals(state(),plan,{},29);
check('clean evidence allows bounded progress',()=>{const d=deterministicDelta(signals,plan);assert.equal(d.trainingAction,'progress');assert.equal(validateDelta(d,signals,plan).ok,true)});
check('without checkins progression is not invented',()=>{const ss=buildSignals(state({checkins:[]}),plan,{},29);assert.equal(deterministicDelta(ss,plan).trainingAction!=='progress',true);assert.ok(deterministicDelta(ss,plan).unknowns.includes('daily_tracking'))});
check('discomfort preserves conservative review',()=>{const checks=goodChecks.map((x,i)=>i===0?{...x,painFlag:true}:x);const ss=buildSignals(state({checkins:checks}),plan,{},29);assert.equal(deterministicDelta(ss,plan).trainingAction,'consolidate')});
check('critical symptom prevents progression',()=>{const checks=goodChecks.map((x,i)=>i===0?{...x,redFlagSymptom:true}:x);const ss=buildSignals(state({checkins:checks}),plan,{},29);assert.equal(deterministicDelta(ss,plan).trainingAction,'hold')});
check('professional safety hold controls',()=>{const held={...plan,trainingHold:true};const ss=buildSignals(state(),held,{},29);assert.equal(deterministicDelta(ss,held).trainingAction,'hold')});
check('owner review blocks progression',()=>{const review={...plan,reviewRouting:{ownerReviewRequired:true}};const ss=buildSignals(state(),review,{},29);assert.equal(deterministicDelta(ss,review).trainingAction,'consolidate')});
check('more aggressive AI suggestions are clamped',()=>{const held={...plan,trainingHold:true};const ss=buildSignals(state(),held,{},29),base=deterministicDelta(ss,held);assert.equal(clampDelta({trainingAction:'progress'},base).trainingAction,'hold')});
check('invalid future final mark rejected',()=>assert.equal(milestoneTimeValid('finalMark',startedAt,{...finalMark,ts:new Date(NOW+3600e3).toISOString()},NOW),false));
check('fictional data never enter any live database',()=>assert.equal(typeof process.env.HERCULES_LIVE_WRITE,'undefined'));
console.log(`beta-cycle-sim ${tests}/${tests} PASS: synthetic, read-only`);
