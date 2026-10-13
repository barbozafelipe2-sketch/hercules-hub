/* Hercules Hub • TRACK reflections • beta stage 4/10.
 * Read-only, explicit check-in insights. No diagnosis, clinical clearance,
 * new prescription, autonomous progression or mutation of user history.
 */
const TRACK_INSIGHT_FIELDS=['energy','sleep','training','nutrition'];

function trackInsightDayKey(date){
  const d=new Date(date);
  if(!Number.isFinite(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function trackInsightWeekBounds(reference){
  const now=new Date(reference);
  const noon=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  const offset=(noon.getDay()+6)%7;
  noon.setDate(noon.getDate()-offset);
  const start=new Date(noon);
  const previous=new Date(noon);previous.setDate(previous.getDate()-7);
  return {thisWeek:trackInsightDayKey(start),lastWeek:trackInsightDayKey(previous)};
}
function trackInsightRecords(input,now=new Date(),startedAt=''){
  const current=trackInsightDayKey(now);
  const origin=startedAt?trackInsightDayKey(startedAt):'';
  const rows=Array.isArray(input)?input:[];
  const valid=new Map();
  for(const raw of rows){
    if(!raw||typeof raw!=='object')continue;
    const key=String(raw.dayKey||trackInsightDayKey(raw.ts||''));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||key>current||(origin&&key<origin))continue;
    // Reject impossible dates and unvalidated self-ratings, rather than inventing values.
    const parsed=new Date(key+'T12:00:00');
    if(trackInsightDayKey(parsed)!==key)continue;
    if(!TRACK_INSIGHT_FIELDS.every(f=>Number.isInteger(Number(raw[f]))&&Number(raw[f])>=1&&Number(raw[f])<=5))continue;
    const timestamp=Date.parse(raw.ts||'');
    if(!Number.isFinite(timestamp)||timestamp>new Date(now).getTime()+60000)continue;
    const old=valid.get(key);
    if(!old||timestamp>old._timestamp){
      const record={dayKey:key,_timestamp:timestamp,painFlag:raw.painFlag===true,
        critical:raw.redFlagSymptom===true||raw.symptomFlag===true};
      for(const field of TRACK_INSIGHT_FIELDS)record[field]=Number(raw[field]);
      valid.set(key,record);
    }
  }
  return [...valid.values()].sort((a,b)=>b.dayKey.localeCompare(a.dayKey)).slice(0,90);
}
function trackInsightAverage(rows,field){
  if(rows.length<3)return null;
  return Math.round((rows.reduce((sum,row)=>sum+row[field],0)/rows.length)*10)/10;
}
function trackInsightModel(checkins,planData,reference=new Date(),startedAt=''){
  const todayKey=trackInsightDayKey(reference),bounds=trackInsightWeekBounds(reference);
  const records=trackInsightRecords(checkins,reference,startedAt),today=records.find(r=>r.dayKey===todayKey)||null;
  const thisWeek=records.filter(r=>r.dayKey>=bounds.thisWeek);
  const lastWeek=records.filter(r=>r.dayKey>=bounds.lastWeek&&r.dayKey<bounds.thisWeek);
  const firstSeven=records.filter(r=>r.dayKey>=trackInsightDayKey(new Date(new Date(reference).getFullYear(),new Date(reference).getMonth(),new Date(reference).getDate()-6,12)));
  const restricted=planData?.trainingHold===true||planData?.reviewRouting?.trainingRestricted===true;
  const review=planData?.reviewRouting?.ownerReviewRequired===true||planData?.reviewRouting?.status==='REVIEW_NOTIFY';
  const recentCritical=firstSeven.some(r=>r.critical);
  const recentPain=firstSeven.some(r=>r.painFlag);
  const lowSleep=firstSeven.filter(r=>r.sleep<=2).length;
  const lowEnergy=firstSeven.filter(r=>r.energy<=2).length;
  let priority='none',basis='no_record';
  if(restricted||recentCritical){priority='critical';basis=restricted?'active_restriction':'recent_red_flag'}
  else if(review||recentPain){priority='review';basis=recentPain?'reported_pain':'pending_review'}
  else if(!today){priority='missing';basis='no_record'}
  else if(lowSleep>=2){priority='recovery';basis='repeated_low_sleep'}
  else if(lowEnergy>=2){priority='recovery';basis='repeated_low_energy'}
  else if(today.sleep<=2||today.energy<=2){priority='recovery';basis=today.sleep<=2?'low_sleep_today':'low_energy_today'}
  else if(today.nutrition<=2){priority='nutrition';basis='low_nutrition_today'}
  else{priority='routine';basis='checkin_recorded'}
  const metrics=TRACK_INSIGHT_FIELDS.map(field=>{
    const current=trackInsightAverage(thisWeek,field),previous=trackInsightAverage(lastWeek,field);
    const change=current!==null&&previous!==null?Math.round((current-previous)*10)/10:null;
    return {field,current,previous,change,trend:change===null?'insufficient':change>=0.3?'up':change<=-0.3?'down':'similar'};
  });
  return {todayKey,today,priority,basis,restricted,review,recentPain,recentCritical,lowSleep,lowEnergy,
    currentCount:thisWeek.length,previousCount:lastWeek.length,metrics,
    comparable:thisWeek.length>=3&&lastWeek.length>=3};
}
function trackInsightGuidance(model){
  const copy=(pt,en,es)=>L(pt,en,es);
  if(model.priority==='critical')return {
    title:copy('A segurança vem primeiro','Safety comes first','La seguridad es lo primero'),
    body:copy('Há uma restrição ativa ou sintoma preocupante registrado recentemente. Não use este painel como liberação para treinar. Siga as restrições aplicáveis; para sintomas importantes ou persistentes, procure avaliação profissional. Em uma emergência, procure atendimento de urgência.',
      'An active restriction or recently reported concerning symptom requires attention. This screen is not training clearance. Follow applicable restrictions and seek appropriate professional assessment for significant or persistent symptoms; seek emergency care for emergencies.',
      'Una restricción activa o un síntoma preocupante informado recientemente requiere atención. Esta pantalla no autoriza entrenar. Sigue las restricciones y busca evaluación profesional ante síntomas importantes o persistentes; en una emergencia, acude a urgencias.'),
    nav:'TRAIN',level:'danger'};
  if(model.priority==='review')return {
    title:copy('Adapte com cautela','Use a conservative approach','Adapta con cautela'),
    body:copy('Você relatou desconforto/dor ou há revisão pendente. Respeite as adaptações conservadoras já exibidas no TRAIN, evite forçar movimentos dolorosos e acompanhe os sintomas. Revisão pendente não significa liberação.',
      'Pain/discomfort was reported or review is pending. Follow the conservative TRAIN guidance already shown, avoid forcing painful movements, and monitor symptoms. Pending review is not clearance.',
      'Se informó dolor/molestia o hay una revisión pendiente. Sigue las indicaciones conservadoras de TRAIN, no fuerces movimientos dolorosos y observa los síntomas. Una revisión pendiente no significa autorización.'),
    nav:'TRAIN',level:'warn'};
  if(model.priority==='missing')return {
    title:copy('Ainda não há check-in de hoje','No check-in for today yet','Aún no hay registro de hoy'),
    body:copy('Registre como você realmente se sentiu. Não vamos presumir que um dia sem registro foi bom ou ruim.',
      'Record how you actually felt. Missing data is neither good nor bad performance.',
      'Registra cómo te sentiste realmente. Un día sin registro no se considera bueno ni malo.'),
    nav:'TRACK',level:'neutral'};
  if(model.priority==='recovery'){
    const repeated=model.basis==='repeated_low_sleep'||model.basis==='repeated_low_energy';
    return {title:copy('Priorize a recuperação','Prioritize recovery','Prioriza la recuperación'),
      body:repeated?copy('Dois ou mais registros recentes indicaram sono ou energia baixos. Observe seu descanso e sua capacidade de manter a rotina. Considere reduzir demandas opcionais; qualquer mudança no treino deve respeitar o plano e as restrições vigentes.',
        'Two or more recent check-ins reported low sleep or energy. Review recovery and how manageable your routine feels. Consider easing optional demands; training changes must respect the existing plan and restrictions.',
        'Dos o más registros recientes señalaron sueño o energía bajos. Revisa el descanso y tu rutina. Considera reducir demandas opcionales; los cambios en el entrenamiento deben respetar el plan y las restricciones.'):
        copy('Hoje você registrou sono ou energia baixos. Priorize descanso e expectativas realistas. Evite acrescentar treinos para compensar o dia.',
          'You reported low sleep or energy today. Prioritize rest and realistic expectations. Do not add workouts to compensate for the day.',
          'Hoy registraste sueño o energía bajos. Prioriza descanso y expectativas realistas. No añadas entrenamientos para compensar el día.'),
      nav:'RECOVER',level:'warn'};
  }
  if(model.priority==='nutrition')return {
    title:copy('Confira a rotina alimentar','Review your meal routine','Revisa tu alimentación'),
    body:copy('Você avaliou a nutrição de hoje como baixa. Confira a praticidade e a adequação do menu no NOURISH sem compensações extremas ou mudanças sem dados.',
      'You rated today’s nutrition low. Review whether NOURISH meals fit your day without extreme compensation or unsupported changes.',
      'Calificaste como baja la alimentación de hoy. Revisa si NOURISH se adapta a tu día, sin compensaciones extremas ni cambios sin datos.'),
    nav:'NOURISH',level:'neutral'};
  return {title:copy('Continue com consistência','Keep your routine consistent','Mantén la constancia'),
    body:copy('Check-in registrado. Continue com o plano que já foi validado e volte amanhã. Uma boa avaliação isolada não autoriza aumentar carga ou intensidade.',
      'Check-in recorded. Continue the existing validated plan and check in again tomorrow. A single positive rating is not permission to increase training intensity.',
      'Registro guardado. Sigue con el plan validado y vuelve mañana. Una valoración positiva aislada no autoriza subir la intensidad.'),nav:'HOME',level:'neutral'};
}
function renderTrackInsights(){
  const root=$('#trackContent');if(!root||!state||!plan)return;
  const model=trackInsightModel(state.checkins,plan,new Date(),state.startedAt||'');
  const advice=trackInsightGuidance(model);
  root.querySelector('#trackInsightPanel')?.remove();
  const text=(pt,en,es)=>L(pt,en,es);
  const metrics={energy:text('Energia','Energy','Energía'),sleep:text('Sono','Sleep','Sueño'),
    training:text('Treino','Training','Entreno'),nutrition:text('Nutrição','Nutrition','Nutrición')};
  const number=x=>x===null?'—':x.toLocaleString(locale(),{minimumFractionDigits:1,maximumFractionDigits:1});
  const trend=m=>m.trend==='up'?text('Subiu','Higher','Subió'):m.trend==='down'?text('Caiu','Lower','Bajó'):m.trend==='similar'?text('Sem mudança relevante','Similar','Similar'):text('Dados insuficientes','Not enough data','Datos insuficientes');
  const cards=model.metrics.map(m=>`<div class="trackInsightMetric"><b>${esc(metrics[m.field])}</b><strong>${number(m.current)}<small>/5</small></strong><span>${text('Semana anterior','Previous week','Semana anterior')}: ${number(m.previous)}</span><small>${trend(m)}</small></div>`).join('');
  const panel=`<section id="trackInsightPanel" class="trackInsightPanel" aria-label="${text('Leitura do TRACK','TRACK insights','Lectura del TRACK')}">
    <div class="trackInsightHeading"><div class="kicker">TRACK • ${text('LEITURA DOS REGISTROS','CHECK-IN INSIGHTS','LECTURA DE REGISTROS')}</div><h2>${text('O próximo passo','Your next step','Tu próximo paso')}</h2></div>
    <div class="trackInsightAdvice ${advice.level==='danger'?'trackInsightDanger':advice.level==='warn'?'trackInsightWarn':''}"><b>${esc(advice.title)}</b><p>${esc(advice.body)}</p>${advice.nav!=='TRACK'?`<button type="button" class="btn btnGhost" id="trackInsightNavigate" data-track-nav="${advice.nav}">${text('Abrir orientação','Open guidance','Abrir orientación')} →</button>`:''}</div>
    <div class="trackInsightHeading"><h3>${text('Tendências semanais','Weekly trends','Tendencias semanales')}</h3><p>${text('Apenas avaliações informadas. Escala de 1 a 5; valores maiores representam avaliações melhores, não medidas clínicas.',
      'Only reported ratings. Scale 1–5; higher values mean higher self-ratings, not clinical measurements.',
      'Solo puntuaciones registradas. Escala 1–5; los valores altos son valoraciones, no medidas clínicas.')}</p></div>
    <div class="trackInsightSamples">${text('Esta semana','This week','Esta semana')}: <b>${model.currentCount}/7</b> • ${text('Anterior','Previous','Anterior')}: <b>${model.previousCount}/7</b></div>
    ${model.comparable?`<div class="trackInsightGrid">${cards}</div>`:`<div class="trackInsightEmpty">${text('Precisamos de pelo menos 3 registros em cada semana para comparar tendências. Até lá, não vamos adivinhar.',
      'At least 3 check-ins in each week are needed for a comparison. Until then, we will not guess.',
      'Se necesitan al menos 3 registros en cada semana para comparar. Hasta entonces, no vamos a adivinar.')}</div>`}
    <small class="trackInsightFoot">${text('Uma tendência é apenas uma descrição dos seus registros. Não altera automaticamente treinos ou regras de segurança.',
      'Trends describe your reports only. They do not automatically change workouts or safety restrictions.',
      'Las tendencias solo describen tus registros. No cambian los entrenamientos ni las restricciones automáticamente.')}</small>
  </section>`;
  const history=root.querySelector('.checkinHistory');
  if(history)history.insertAdjacentHTML('beforebegin',panel);
  else root.insertAdjacentHTML('beforeend',panel);
  const btn=root.querySelector('#trackInsightNavigate');
  if(btn)btn.onclick=()=>navigate(advice.nav);
}
