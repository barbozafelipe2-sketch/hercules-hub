/* Hercules Hub — MEU DIA / MY DAY / MI DÍA (beta stage 2/10).
 * Display-only integration with canonical TRAIN, NOURISH, EXTRA and TRACK state.
 * No training prescriptions, fabricated completion, or new health data collection.
 */
const MY_DAY_CODES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let myDaySelectedDay='';
let myDayRenderedDateKey='';
// Only an explicit MEU DIA → EXTRA navigation may scope a historical day.
let myDayExtraTargetWeek=null;
function myDayFocusToday(){myDaySelectedDay=''}

function myDayModel(p,pl,st,date=new Date(),cycleWeek=1){
  if(!p||!pl||!st) return null;
  const today=new Date(date);
  if(!Number.isFinite(today.getTime()))return null;
  const todayIndex=(today.getDay()+6)%7;
  const weekStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()-todayIndex,12,0,0,0);
  const startDate=new Date(st.startedAt||'');
  const startKey=Number.isFinite(startDate.getTime())?[startDate.getFullYear(),String(startDate.getMonth()+1).padStart(2,'0'),String(startDate.getDate()).padStart(2,'0')].join('-'):'';
  const days=MY_DAY_CODES.map((code,index)=>{
    const at=new Date(weekStart);
    at.setDate(weekStart.getDate()+index);
    const iso=[at.getFullYear(),String(at.getMonth()+1).padStart(2,'0'),String(at.getDate()).padStart(2,'0')].join('-');
    const beforeStart=Boolean(startKey&&iso<startKey);
    // TRAIN's canonical week identity is anchored to the start of the cycle,
    // NOT to Monday-Sunday calendar boundaries. Calculate each visible date
    // independently so a Monday in the previous cycle week keeps its history.
    // UTC civil-date arithmetic prevents daylight-saving shifts from moving a day.
    const deltaDays=startKey?Math.round((Date.UTC(at.getFullYear(),at.getMonth(),at.getDate())-Date.UTC(startDate.getFullYear(),startDate.getMonth(),startDate.getDate()))/86400000):null;
    // TODAY follows TRAIN's exact elapsed-time currentWeek() gate. On the
    // anniversary date *before* its start hour, TRAIN may still be in the
    // prior week. Other dates use cycle-anchored civil dates for history.
    const dayWeek=index===todayIndex?cycleWeek:(deltaDays===null?cycleWeek:Math.min(4,Math.max(1,Math.floor(deltaDays/7)+1)));
    const selected=(pl.summary?.selectedDays||[]).indexOf(code);
    const pattern=selected>=0?(pl.training?.pattern||[])[selected]||null:null;
    const strength=!beforeStart&&Boolean(pattern);
    const restricted=pl.trainingHold===true||pl.reviewRouting?.trainingRestricted===true;
    const activity=!beforeStart&&Boolean(p.activityType&&p.activityType!=='none'&&Array.isArray(p.activityDays)&&p.activityDays.includes(code));
    const completed=!beforeStart&&pattern?st.completedSessions?.[`w${dayWeek}:${pattern}`]===true:false;
    const recorded=!beforeStart&&(st.checkins||[]).some(c=>c.dayKey===iso);
    const habit=k=>!beforeStart&&st.habits?.[`extra:${st.cycleNumber||1}:w${dayWeek}:${code}:${k}`]===true;
    return {code,index,dateKey:iso,dayOfMonth:at.getDate(),week:beforeStart?null:dayWeek,isToday:index===todayIndex,beforeStart,
      strength,pattern,restricted,activity,completed,recorded,
      mindDone:habit('mind'),stretchDone:habit('stretch'),waterDone:habit('water'),sportDone:habit('sport')};
  });
  return {days,todayIndex,week:cycleWeek,review:Boolean(pl.reviewRouting?.ownerReviewRequired),
    nutritionRestricted:pl.nutrition?.reviewRequired===true,trainingRestricted:pl.trainingHold===true||pl.reviewRouting?.trainingRestricted===true};
}

function renderMyDayHome(){
  const root=$('#homeContent');
  if(!root||!profile||!plan)return;
  const now=new Date(),localToday=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  // Automatic date rollover resets an old manually selected day to Today.
  if(myDayRenderedDateKey!==localToday){myDayRenderedDateKey=localToday;myDayFocusToday()}
  const model=myDayModel(profile,plan,state,now,currentWeek());
  if(!model)return;
  if(!MY_DAY_CODES.includes(myDaySelectedDay))myDaySelectedDay=model.days[model.todayIndex].code;
  const selected=model.days.find(d=>d.code===myDaySelectedDay)||model.days[model.todayIndex];
  const text=(a,b,c)=>L(a,b,c);
  const doneBadge=d=>d?`<span class="myDayTag myDayDone">${text('Concluído','Done','Hecho')} ✓</span>`:'';
  const status=d=>d.restricted?text('Restrito','Restricted','Restringido'):d.completed?text('Concluído','Complete','Completo'):text('Planejado','Planned','Planificado');
  const escape=esc;
  const activityName=activityLabel(profile);
  const btn=(id,ico,title,sub,tag='',klass='')=>`<button type="button" class="myDayItem ${klass}" data-myday-target="${id}"><span class="myDayIcon" aria-hidden="true">${ico}</span><span class="myDayBody"><strong>${escape(title)}</strong><small>${escape(sub)}</small></span>${tag}<span class="myDayChevron" aria-hidden="true">›</span></button>`;
  let entries=[];
  if(selected.strength){
    if(model.trainingRestricted){entries.push(`<div class="myDayRestricted"><b>${text('TREINO RESTRITO','TRAIN RESTRICTED','ENTRENO RESTRINGIDO')}</b><p>${text('A orientação de segurança do seu sistema continua valendo. Nenhum treino adicional será sugerido.','Your system’s safety restrictions remain in force. No extra workout is suggested.','Siguen vigentes las restricciones de seguridad. No se sugiere entrenar adicionalmente.')}</p></div>`)}
    else if(selected.week!==currentWeek())entries.push(`<div class="myDayRest"><b>${text('Sessão de força da semana','Strength session from week','Sesión de fuerza de la semana')} ${selected.week}</b><small>${sessionName(selected.pattern)} • ${status(selected)}. ${text('TRAIN mostra a semana atual; o histórico desta data não será alterado.','TRAIN shows the current week; this date’s history will not be changed.','TRAIN muestra la semana actual; el historial de esta fecha no cambiará.')}</small></div>`);
    else entries.push(btn('TRAIN','T',text('Seu treino de força','Your strength session','Tu sesión de fuerza'),text('Sessão','Session','Sesión')+' '+sessionName(selected.pattern)+' • '+plan.summary.minutes+' min',`<span class="myDayTag ${selected.completed?'myDayDone':''}">${status(selected)}</span>`));
  }else entries.push(`<div class="myDayRest"><b>${selected.beforeStart?text('Antes do início deste plano','Before this plan started','Antes de iniciar este plan'):text('Dia sem musculação planejada','No strength workout planned','Día sin fuerza programada')}</b><small>${selected.beforeStart?text('Não atribuímos atividades anteriores ao início do acompanhamento.','We do not assign activities before tracking started.','No asignamos actividades anteriores al inicio del seguimiento.'):text('Descansar é válido. Os cuidados abaixo são opcionais.','Rest is valid. The suggestions below are optional.','Descansar también vale. Las sugerencias son opcionales.')}</small></div>`);
  // Nothing is retroactively assigned before the first day of a cycle.
  if(!selected.beforeStart){
  if(selected.activity){
    if(model.trainingRestricted){entries.push(`<div class="myDayRestricted"><b>${text('Atividade informada — restrita','Reported activity — restricted','Actividad declarada — restringida')}</b><p>${escape(activityName)}: ${text('não executar sem seguir as orientações profissionais aplicáveis.','do not proceed contrary to applicable professional guidance.','no realizar en contra de las indicaciones profesionales aplicables.')}</p></div>`)}
    else entries.push(btn('SPORT','●',activityName,text('Atividade informada no onboarding; intensidade não prescrita.','Activity reported in onboarding; intensity is not prescribed.','Actividad declarada; no se prescribe intensidad.'),doneBadge(selected.sportDone)));
  }
  if(selected.strength&&selected.activity&&!model.trainingRestricted)entries.push(`<div class="notice warn myDayNote">${text('Treino e esporte no mesmo dia: respeite esforço, fadiga e recuperação. O app não acrescentou volume automaticamente.','Training and sport on the same day: respect effort, fatigue and recovery. No extra volume was automatically added.','Fuerza y deporte en el mismo día: respeta el esfuerzo, la fatiga y la recuperación. No se añadió volumen.')}</div>`);
  if(model.nutritionRestricted)entries.push(btn('NOURISH','N',text('Nutrição sob revisão','Nutrition under review','Nutrición en revisión'),text('Sugestões específicas permanecem bloqueadas por segurança.','Specific meal suggestions remain blocked for safety.','Las comidas específicas siguen bloqueadas por seguridad.'),'<span class="myDayTag">REVIEW</span>'));
  else{
    const mealCount=plan.summary?.meals||profile.meals||'';
    entries.push(btn('NOURISH','N',text('Refeições do dia','Today’s meals','Comidas del día'),text('Ver o cardápio compatível','Open the compatible menu','Ver el menú compatible')+(mealCount?' • '+mealCount+'×':'')));
  }
  entries.push(btn('WATER','H₂O',text('Hidratação','Hydration','Hidratación'),selected.strength||selected.activity?text('Orientação para dia de atividade','Guidance for an active day','Consejos para un día activo'):text('Hábitos nos dias leves','Habits on easy days','Hábitos en días suaves'),doneBadge(selected.waterDone)));
  if(!model.trainingRestricted)entries.push(btn('STRETCH','↗',text('Alongamento e mobilidade','Stretching and mobility','Estiramiento y movilidad'),text('Movimentos leves e sem dor','Gentle, pain-free movement','Movimientos suaves y sin dolor'),doneBadge(selected.stretchDone)));
  entries.push(btn('MIND','✦',text('Pausa mental','Mind reset','Pausa mental'),text('Reflexão e bem-estar geral','Reflection and general wellness','Reflexión y bienestar general'),doneBadge(selected.mindDone)));
  entries.push(btn('TRACK','▥',selected.isToday?text('Registro do dia','Daily check-in','Registro del día'):text('Acompanhar progresso','View progress','Ver progreso'),selected.recorded?text('Registrado — toque para revisar','Recorded — tap to review','Registrado — toca para revisar'):text('Energia, sono, treino e nutrição','Energy, sleep, training and nutrition','Energía, sueño, entreno y nutrición'),selected.recorded?doneBadge(true):''));
  }
  const name=text('MEU DIA','MY DAY','MI DÍA');
  const dayHeading=selected.isToday?text('Hoje','Today','Hoy'):dayLabel(selected.code);
  const monthText=new Date(selected.dateKey+'T12:00:00').toLocaleDateString(locale(),{month:'short'});
  const view=`<section class="myDay" aria-label="${name}"><div class="myDayHead"><div><div class="kicker">HERCULES • ${name}</div><h2>${dayHeading}<span class="myDayDate">${selected.dayOfMonth} ${escape(monthText)}</span></h2><p>${text('Sua semana, uma ação de cada vez.','Your week, one action at a time.','Tu semana, una acción a la vez.')}</p></div><span class="pill gold">${text('SEM','WK','SEM')} ${selected.week||model.week}</span></div>
  <div class="myDayDays" role="group" aria-label="${text('Dias desta semana','Days this week','Días de esta semana')}">${model.days.map(d=>`<button type="button" data-myday-day="${d.code}" class="myDayDay ${d.code===selected.code?'isSelected':''} ${d.isToday?'isToday':''}" aria-pressed="${d.code===selected.code}"><b>${dayLabel(d.code)}</b><small>${d.dayOfMonth}</small>${d.strength?'<i aria-hidden="true"></i>':d.activity?'<em aria-hidden="true"></em>':''}</button>`).join('')}</div>
  ${model.review&&!model.trainingRestricted?`<div class="notice warn myDayNote">${text('Seu plano tem revisão de segurança pendente. Siga as orientações conservadoras exibidas em TRAIN.','Your plan has a pending safety review. Follow the conservative instructions shown in TRAIN.','Tu plan tiene una revisión de seguridad pendiente. Sigue las indicaciones conservadoras de TRAIN.')}</div>`:''}
  <div class="myDayItems">${entries.join('')}</div>
  ${selected.isToday?'':`<p class="myDayFoot">${text('Você está vendo outro dia. O registro TRACK só pode ser feito para hoje.','You are viewing another day. TRACK can only record today.','Estás viendo otro día. TRACK solo permite registrar hoy.')}</p>`}</section>`;
  root.querySelector('.sectionTitle')?.remove();
  root.querySelector('.actionList')?.remove();
  const former=root.querySelector('.myDay');if(former)former.remove();
  root.insertAdjacentHTML('beforeend',view);
  root.querySelectorAll('[data-myday-day]').forEach(b=>b.onclick=()=>{myDaySelectedDay=b.dataset.mydayDay;renderMyDayHome()});
  root.querySelectorAll('[data-myday-target]').forEach(b=>b.onclick=()=>{
    const target=b.dataset.mydayTarget;
    if(target==='TRAIN'){if(model.trainingRestricted)return;navigate('TRAIN');const el=document.querySelector(`#trainContent [data-session="${selected.pattern}"]`);if(el?.closest('.session'))el.closest('.session').scrollIntoView({behavior:'smooth',block:'start'});return}
    if(target==='NOURISH'){state.mealWeek=selected.week||model.week;state.mealDay=selected.index;state.mealSlot=0;saveJSON(KEYS.state,state);renderNourish();navigate('NOURISH');return}
    if(target==='TRACK'){navigate('TRACK');return}
    const extra={SPORT:'sport',WATER:'water',STRETCH:'stretch',MIND:'mind'}[target];
    if(extra){if(model.trainingRestricted&&(extra==='sport'||extra==='stretch'))return;myDayExtraTargetWeek=selected.week;extraSelectedDay=selected.code;extraOpened=extra;renderMind();navigate('MIND')}
  });
}
