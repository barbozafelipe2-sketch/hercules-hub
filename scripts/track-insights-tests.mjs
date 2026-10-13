import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const content=fs.readFileSync('public/track-insights.js','utf8');
const app=fs.existsSync('public/app.js')?fs.readFileSync('public/app.js','utf8'):null;
const date=new Date('2026-10-09T12:00:00');
const row=(day,extra={})=>({ts:day+'T11:15:00',dayKey:day,energy:3,sleep:3,training:3,nutrition:3,painFlag:false,redFlagSymptom:false,...extra});
let completed=0;
const test=(name,fn)=>{fn();completed++;console.log('PASS '+name)};
const local={
  Date:class extends Date {constructor(...args){super(...(args.length?args:[date]))}static now(){return date.getTime()}},
  L:(a,b,c)=>b,locale:()=> 'en-US',
  $:()=>null,esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  state:{startedAt:'2026-09-21T09:00:00',checkins:[]},plan:{trainingHold:false,reviewRouting:{}},navigate:()=>{}
};
const sandbox=vm.createContext(local);
vm.runInContext(content,sandbox,{timeout:2000});
const evaluate=(s)=>vm.runInContext(s,sandbox,{timeout:2000});
const model=(records=[],plan={},when=date,startedAt='')=>evaluate('trackInsightModel')(records,plan,when,startedAt);
const guidance=m=>evaluate('trackInsightGuidance')(m);

// Data integrity & temporal validation.
test('empty history is not scored as a failure',()=>{const m=model();assert.equal(m.today,null);assert.equal(m.priority,'missing');assert.equal(m.comparable,false)});
test('today uses real local date',()=>assert.equal(evaluate('trackInsightDayKey')(date),'2026-10-09'));
test('Monday-based week boundaries are stable on Friday',()=>{const b=evaluate('trackInsightWeekBounds')(date);assert.equal(b.thisWeek,'2026-10-05');assert.equal(b.lastWeek,'2026-09-28')});
test('today ratings are not averaged with missing days',()=>{const m=model([row('2026-10-09')]);assert.equal(m.currentCount,1);assert.equal(m.metrics[0].current,null)});
test('older weeks excluded from trend buckets',()=>{const m=model([row('2026-10-02'),row('2026-09-25')]);assert.equal(m.previousCount,1);assert.equal(m.currentCount,0)});
test('future-dated checkins ignored',()=>{const m=model([row('2026-10-12')]);assert.equal(m.currentCount,0)});
test('records prior to cycle start ignored',()=>{const m=model([row('2026-09-20'),row('2026-10-09')],{},date,'2026-09-21T09:00:00');assert.equal(m.metrics.length,4);assert.equal(m.today.dayKey,'2026-10-09')});
test('latest timestamp wins for duplicate dates',()=>{const m=model([row('2026-10-09',{energy:1,ts:'2026-10-09T09:00:00'}),row('2026-10-09',{energy:5,ts:'2026-10-09T11:30:00'})]);assert.equal(m.today.energy,5)});
test('missing score invalidates the whole checkin',()=>{const m=model([row('2026-10-09',{training:null})]);assert.equal(m.today,null)});
test('fractional and out-of-range scores ignored',()=>{const m=model([row('2026-10-09',{nutrition:2.7}),row('2026-10-08',{sleep:9})]);assert.equal(m.currentCount,0)});
test('impossible date is rejected',()=>{const m=model([row('2026-10-99')]);assert.equal(m.currentCount,0)});
test('invalid future timestamp is rejected',()=>{const m=model([row('2026-10-09',{ts:'2026-11-01T12:00:00'})]);assert.equal(m.currentCount,0)});
test('90-day bounded report input',()=>{const r=[...Array(100)].map((_,i)=>{const d=new Date(2026,9,9-i,12);const key=evaluate('trackInsightDayKey')(d);return row(key)});assert.equal(evaluate('trackInsightRecords')(r,date).length,90)});

// Safety precedence and real signal routing.
test('active training restriction overrides high scores',()=>{const m=model([row('2026-10-09',{energy:5,sleep:5})],{trainingHold:true});assert.equal(m.priority,'critical');assert.equal(guidance(m).level,'danger')});
test('server-derived trainingRestricted overrides high scores',()=>assert.equal(model([row('2026-10-09')],{reviewRouting:{trainingRestricted:true}}).priority,'critical'));
test('red-flag symptom today yields critical guidance',()=>assert.equal(model([row('2026-10-09',{redFlagSymptom:true})]).priority,'critical'));
test('legacy symptomFlag is treated as critical',()=>assert.equal(model([row('2026-10-09',{symptomFlag:true})]).priority,'critical'));
test('recent critical signal cannot be hidden by a good new day',()=>assert.equal(model([row('2026-10-09',{energy:5}),row('2026-10-07',{symptomFlag:true})]).priority,'critical'));
test('reported pain does not turn into a new global hold',()=>{const m=model([row('2026-10-09',{painFlag:true})]);assert.equal(m.priority,'review');assert.equal(m.restricted,false);assert.equal(guidance(m).level,'warn')});
test('review notification remains pending, never called cleared',()=>{const m=model([row('2026-10-09')],{reviewRouting:{status:'REVIEW_NOTIFY',ownerReviewRequired:true}});assert.equal(m.priority,'review');assert.match(guidance(m).body,/not clearance/)});
test('review priority precedes absent today checkin',()=>assert.equal(model([], {reviewRouting:{ownerReviewRequired:true}}).priority,'review'));
test('critical priority precedes normal recovery priority',()=>assert.equal(model([row('2026-10-09',{sleep:1,redFlagSymptom:true})]).priority,'critical'));
test('two real low-sleep ratings produce recovery guidance',()=>{const m=model([row('2026-10-09',{sleep:1}),row('2026-10-08',{sleep:2})]);assert.equal(m.basis,'repeated_low_sleep');assert.equal(m.priority,'recovery')});
test('two low-energy ratings produce recovery guidance',()=>{const m=model([row('2026-10-09',{energy:2}),row('2026-10-08',{energy:2})]);assert.equal(m.basis,'repeated_low_energy')});
test('single low energy triggers a lighter nonprescriptive suggestion',()=>{const m=model([row('2026-10-09',{energy:1})]);assert.equal(m.basis,'low_energy_today');assert.equal(guidance(m).nav,'RECOVER')});
test('single low nutrition score opens NOURISH',()=>{const m=model([row('2026-10-09',{nutrition:2})]);assert.equal(m.priority,'nutrition');assert.equal(guidance(m).nav,'NOURISH')});
test('ordinary checkin never approves extra training progression',()=>{const m=model([row('2026-10-09',{energy:5,sleep:5,training:5,nutrition:5})]);assert.equal(m.priority,'routine');assert.match(guidance(m).body,/not permission to increase/)});
test('absence of today rating is not inferred from previous days',()=>{const m=model([row('2026-10-08',{nutrition:1})]);assert.equal(m.priority,'missing')});

// Weekly sample gates and language.
const enough=[row('2026-10-05',{energy:4,sleep:2}),row('2026-10-07',{energy:4,sleep:4}),row('2026-10-09',{energy:5,sleep:4}),row('2026-09-28',{energy:2}),row('2026-09-30',{energy:2}),row('2026-10-02',{energy:2})];
test('weekly trend requires 3 records in both weeks',()=>assert.equal(model(enough).comparable,true));
test('average and direction derived from actual recorded ratings',()=>{const m=model(enough);const energy=m.metrics.find(x=>x.field==='energy');assert.equal(energy.current,4.3);assert.equal(energy.previous,2);assert.equal(energy.change,2.3);assert.equal(energy.trend,'up')});
test('week with only two checkins blocks comparison',()=>assert.equal(model(enough.slice(1)).comparable,false));
test('only current-week data cannot claim comparison',()=>assert.equal(model(enough.slice(0,3)).comparable,false));
test('lower trend is descriptive, not diagnostic',()=>{const x=enough.map(r=>({...r,sleep:r.dayKey>='2026-10-05'?1:5}));assert.equal(model(x).metrics.find(x=>x.field==='sleep').trend,'down')});
test('similar scores described as similar',()=>assert.equal(model(enough.map(r=>({...r,nutrition:3}))).metrics.find(x=>x.field==='nutrition').trend,'similar'));
test('PT and ES guidance can be selected independently',()=>{local.L=(pt)=>pt;assert.match(guidance(model([])).title,/check-in de hoje/);local.L=(_pt,_en,es)=>es;assert.match(guidance(model([])).title,/registro de hoy/);local.L=(_pt,en)=>en});

// UI: simulated existing TRACK DOM. No unnecessary private data storage.
class FakeElement{
  constructor(){this.html='';this.removed=0;this.clicked=false;this.listeners={};}
  remove(){this.removed++}
  insertAdjacentHTML(_where,content){this.html=content}
}
const history=new FakeElement(),container=new FakeElement(),btn=new FakeElement();
const root={html:'',querySelector(sel){return sel==='.checkinHistory'?history:sel==='#trackInsightPanel'?null:sel==='#trackInsightNavigate'?btn:null},insertAdjacentHTML(_where,x){this.html=x}};
local.$=sel=>sel==='#trackContent'?root:null;
local.state={startedAt:'2026-09-21T09:00:00',checkins:enough};local.plan={trainingHold:false,reviewRouting:{}};
let nav='';local.navigate=k=>nav=k;
test('TRACK module inserts card before existing history',()=>{evaluate('renderTrackInsights')();assert.match(history.html,/Weekly trends/);assert.match(history.html,/Energy/)});
test('comparison UI displays actual mean and sample counts',()=>{assert.match(history.html,/4.3/);assert.match(history.html,/3\/7/);assert.match(history.html,/Previous week/)});
test('guidance navigation is wired to an existing valid tab',()=>{assert.equal(typeof btn.onclick,'function');btn.onclick();assert.equal(nav,'HOME')});
test('safety guidance is displayed even with no todays entry',()=>{local.plan={trainingHold:true,reviewRouting:{}};local.state.checkins=[];evaluate('renderTrackInsights')();assert.match(history.html,/Safety comes first/);assert.doesNotMatch(history.html,/Increase intensity/) });
test('insufficient data UI never prints calculated 0.0',()=>{local.plan={trainingHold:false,reviewRouting:{}};evaluate('renderTrackInsights')();assert.match(history.html,/At least 3 check-ins/);assert.doesNotMatch(history.html,/0\.0/) });
test('read-only module does not write state or plans',()=>{assert.doesNotMatch(content,/(state|plan)\.(checkins|trainingHold|completedSessions|completedExercises|reviewRouting)\s*=/);assert.doesNotMatch(content,/saveState\(|scheduleCloudSync\(|api\(|generateSystem\(|notifyOwner\(/)});
test('no new collection or persistent identifiers',()=>{assert.doesNotMatch(content,/localStorage\.|fetch\(|deviceId|account_id|navigator\.clipboard/)});
if(app)test('render loop integrations call insights right after core TRACK',()=>assert.match(app,/renderTrack\(\);if\(typeof renderTrackInsights==='function'\)renderTrackInsights\(\);renderEvolve\(\)/));
console.log(`track-insights ${completed}/${completed} PASS`);
