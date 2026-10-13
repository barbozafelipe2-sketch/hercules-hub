import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../public/my-day.js',import.meta.url),'utf8');
const checks=[];
function check(label,run){try{run();checks.push([label,true]);console.log('PASS '+label)}catch(err){checks.push([label,false]);console.error('FAIL '+label+' — '+err.message)}}
const profile={language:'pt-BR',activityType:'swimming',activityDays:['Sun'],location:'gym'};
const plan={summary:{selectedDays:['Mon','Tue','Thu','Fri'],minutes:45,meals:3},training:{pattern:['upperA','lowerA','upperB','lowerB']},trainingHold:false,nutrition:{reviewRequired:false},reviewRouting:{ownerReviewRequired:false,trainingRestricted:false}};
const state={cycleNumber:1,habits:{},completedSessions:{},checkins:[]};
const ctx={Date,profile,plan,state,console,
 L:(p,e,s)=>({ 'pt-BR':p,'en-US':e,es:s})[ctx.lang||'pt-BR'],lang:'pt-BR',
 esc:x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])),
 dayLabel:k=>({Mon:'Seg',Tue:'Ter',Wed:'Qua',Thu:'Qui',Fri:'Sex',Sat:'Sáb',Sun:'Dom'})[k],
 activityLabel:p=>p.activityType==='other'?p.activityOther:'Natação',sessionName:p=>p,
 currentWeek:()=>2,locale:()=>ctx.lang||'pt-BR',navigate:()=>{},saveJSON:()=>{},renderNourish:()=>{},renderMind:()=>{},
 KEYS:{state:'state'},extraSelectedDay:'',extraOpened:''};
vm.createContext(ctx);vm.runInContext(src,ctx,{timeout:1000});
const model=(p=ctx.profile,pl=ctx.plan,st=ctx.state,date=new Date(2026,9,9),week=2)=>ctx.myDayModel(p,pl,st,date,week);
const day=(m,d)=>m.days.find(x=>x.code===d);
check('Friday gym + Sunday reported swim + Saturday rest from single source',()=>{
 const m=model();assert.equal(day(m,'Fri').strength,true);assert.equal(day(m,'Fri').pattern,'lowerB');assert.equal(day(m,'Fri').activity,false);
 assert.equal(day(m,'Sat').strength,false);assert.equal(day(m,'Sat').activity,false);
 assert.equal(day(m,'Sun').strength,false);assert.equal(day(m,'Sun').activity,true);
});
check('No invented sport for legacy or unreported profile',()=>{
 const m=model({...profile,activityType:'none',activityDays:['Sun']});assert.equal(day(m,'Sun').activity,false);
 const n=model({...profile,activityType:'swimming',activityDays:[]});assert.equal(day(n,'Sun').activity,false);
});
check('Week-indexed completion matching and no synthetic task completion',()=>{
 const st={...state,completedSessions:{'w2:lowerB':true,'w1:upperA':true},habits:{'extra:1:w2:Sun:sport':true,'extra:1:w2:Sat:mind':true}};
 const m=model(profile,plan,st);assert.equal(day(m,'Fri').completed,true);assert.equal(day(m,'Mon').completed,false);assert.equal(day(m,'Sun').sportDone,true);assert.equal(day(m,'Sat').mindDone,true);assert.equal(day(m,'Sat').stretchDone,false);
});
check('Check-in status is keyed by actual selected calendar day',()=>{
 const st={...state,checkins:[{dayKey:'2026-10-09'}]};const m=model(profile,plan,st);
 assert.equal(day(m,'Fri').recorded,true);assert.equal(day(m,'Sun').recorded,false);
});
check('Days before recorded cycle start do not acquire fabricated workouts or sports',()=>{
 const st={...state,startedAt:'2026-10-09T14:00:00Z'};const m=model(profile,plan,st);assert.equal(day(m,'Mon').strength,false);assert.equal(day(m,'Thu').strength,false);assert.equal(day(m,'Fri').strength,true);assert.equal(day(m,'Sun').activity,true);
});
check('Month boundary local dates preserved',()=>{
 const m=model(profile,plan,state,new Date(2026,10,1),1);assert.equal(day(m,'Mon').dateKey,'2026-10-26');assert.equal(day(m,'Sun').dateKey,'2026-11-01');
});
check('Safety HOLD propagated to entire week',()=>{
 const m=model(profile,{...plan,trainingHold:true});assert.equal(m.trainingRestricted,true);assert.equal(day(m,'Sun').restricted,true);
 const x=model(profile,{...plan,reviewRouting:{trainingRestricted:true,ownerReviewRequired:true}});assert.equal(x.trainingRestricted,true);
});
check('Review without HOLD leaves conservative training navigation intact',()=>{
 const m=model(profile,{...plan,reviewRouting:{ownerReviewRequired:true,trainingRestricted:false}});assert.equal(m.review,true);assert.equal(m.trainingRestricted,false);
});
check('No user data or state mutated by schedule computation',()=>{
 const p=JSON.stringify(profile),pl=JSON.stringify(plan),st=JSON.stringify(state);model();assert.equal(JSON.stringify(profile),p);assert.equal(JSON.stringify(plan),pl);assert.equal(JSON.stringify(state),st);
});
check('Invalid dates safely rejected',()=>assert.equal(ctx.myDayModel(profile,plan,state,new Date('bad'),2),null));

function createRoot(){
 const root={html:'',removed:[],controls:[],querySelector(sel){
    if(sel==='.sectionTitle'||sel==='.actionList')return {remove:()=>root.removed.push(sel)};
    if(sel==='.myDay')return root.html?{remove:()=>{root.html=''}}:null;
    return null;
   },querySelectorAll(sel){const re=sel==='[data-myday-day]'?/data-myday-day="([A-Za-z]+)"/g:/data-myday-target="([A-Z]+)"/g,attr=sel==='[data-myday-day]'?'mydayDay':'mydayTarget';return [...root.html.matchAll(re)].map(m=>{const b={dataset:{[attr]:m[1]},onclick:null};root.controls.push(b);return b})},
   insertAdjacentHTML(position,html){assert.equal(position,'beforeend');root.html=html;root.controls=[]}
 };return root;
}
const root=createRoot();let nav=[],persist=[],renders=[];
ctx.$=selector=>selector==='#homeContent'?root:null;
ctx.navigate=target=>nav.push(target);
ctx.saveJSON=(key,data)=>persist.push({key,snapshot:JSON.stringify(data)});
ctx.renderNourish=()=>renders.push('nourish');ctx.renderMind=()=>renders.push('mind');
ctx.document={querySelector:()=>null};
check('Rendered week contains seven clickable days and all key destinations',()=>{
 ctx.renderMyDayHome();assert.match(root.html,/MEU DIA/);assert.equal((root.html.match(/data-myday-day="/g)||[]).length,7);
 for(const key of ['TRAIN','NOURISH','WATER','STRETCH','MIND','TRACK'])assert.ok(root.html.includes(`data-myday-target="${key}"`),key);
 assert.equal((root.html.match(/data-myday-target="SPORT"/g)||[]).length,0);
 assert.ok(root.removed.includes('.sectionTitle')&&root.removed.includes('.actionList'));
});
check('Sunday selector shows declared swimming and not gym',()=>{
 let button=root.controls.find(c=>c.dataset.mydayDay==='Sun');button.onclick();
 assert.match(root.html,/data-myday-target="SPORT"/);assert.doesNotMatch(root.html,/data-myday-target="TRAIN"/);
});
check('Saturday selector keeps rest optional and no fabricated workout',()=>{
 let button=root.controls.find(c=>c.dataset.mydayDay==='Sat');button.onclick();
 assert.match(root.html,/Dia sem musculação planejada/);assert.match(root.html,/data-myday-target="MIND"/);assert.match(root.html,/data-myday-target="STRETCH"/);
 assert.doesNotMatch(root.html,/data-myday-target="SPORT"/);
});
check('Day-specific EXTRA action opens actual guide, without marking it complete',()=>{
 const before=JSON.stringify(ctx.state);const b=root.controls.find(c=>c.dataset.mydayTarget==='WATER');b.onclick();
 assert.equal(ctx.extraSelectedDay,'Sat');assert.equal(ctx.extraOpened,'water');assert.equal(nav.at(-1),'MIND');assert.equal(renders.at(-1),'mind');assert.equal(JSON.stringify(ctx.state),before);
});
check('NOURISH action selects the chosen day and uses original meal module',()=>{
 const b=root.controls.find(c=>c.dataset.mydayTarget==='NOURISH');b.onclick();
 assert.equal(ctx.state.mealDay,5);assert.equal(ctx.state.mealWeek,2);assert.equal(ctx.state.mealSlot,0);assert.equal(nav.at(-1),'NOURISH');assert.equal(renders.at(-1),'nourish');assert.equal(persist.at(-1).key,'state');
});
check('TRACK is read-only in MEU DIA until the actual tracker is opened',()=>{
 const before=JSON.stringify(ctx.state);root.controls.find(c=>c.dataset.mydayTarget==='TRACK').onclick();assert.equal(nav.at(-1),'TRACK');assert.equal(JSON.stringify(ctx.state),before);
});
check('Restricted mode removes exercise and swim actionable controls',()=>{
 ctx.plan={...plan,trainingHold:true};ctx.renderMyDayHome();
 assert.doesNotMatch(root.html,/data-myday-target="STRETCH"/);assert.match(root.html,/data-myday-target="WATER"/);
 let b=root.controls.find(c=>c.dataset.mydayDay==='Sun');b.onclick();
 assert.doesNotMatch(root.html,/data-myday-target="SPORT"/);assert.match(root.html,/Atividade informada — restrita/);
 b=root.controls.find(c=>c.dataset.mydayDay==='Fri');b.onclick();assert.doesNotMatch(root.html,/data-myday-target="TRAIN"/);
});
check('Explicit safety review for nutrition does not present specific food',()=>{
 ctx.plan={...plan,nutrition:{reviewRequired:true}};ctx.renderMyDayHome();assert.match(root.html,/Nutrição sob revisão/);assert.match(root.html,/data-myday-target="NOURISH"/);assert.doesNotMatch(root.html,/<b>Refeição específica/);
});
check('Escapes untrusted custom activity strings before HTML interpolation',()=>{
 ctx.plan=plan;ctx.profile={...profile,activityType:'other',activityOther:'<img onerror=alert(1)>'};ctx.activityLabel=p=>p.activityOther;
 vm.runInContext("myDaySelectedDay='Sun'",ctx);ctx.renderMyDayHome();assert.doesNotMatch(root.html,/<img onerror/);assert.match(root.html,/&lt;img onerror/);
});
check('Three languages render correct visible title without mixed labels',()=>{
 ctx.profile=profile;ctx.activityLabel=()=> 'Natação';for(const [code,name] of [['pt-BR','MEU DIA'],['en-US','MY DAY'],['es','MI DÍA']]){ctx.lang=code;ctx.renderMyDayHome();assert.ok(root.html.includes(name),code)}
});
const failed=checks.filter(x=>!x[1]);console.log(`my-day-stage-2 ${checks.length-failed.length}/${checks.length} passed`);if(failed.length)process.exitCode=1;
