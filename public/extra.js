// EXTRA UI. The canonical internal pillar remains MIND.
function extraScheduleDay(day,p=profile,pl=plan) {
  return {training:(pl?.summary?.selectedDays||[]).includes(day),
    activity:p?.activityType!=='none'&&!!p?.activityType&&(p?.activityDays||[]).includes(day)};
}
function extraDetail(kind,day) {
  const s=extraScheduleDay(day),active=s.training||s.activity;
  if(kind==='mind')return [
    L('Pausa mental','Mind reset','Pausa mental'),
    day==='Sat'?L('Reflita: o que funcionou na semana e o que pode melhorar? Escolha uma pequena ação realista.','Reflect: what worked this week and what could improve? Choose one realistic small action.','Reflexiona: ¿qué funcionó esta semana y qué mejorarías? Elige una pequeña acción realista.'):
    day==='Sun'?L('Planeje dois momentos possíveis de autocuidado na próxima semana. Respire lentamente por alguns ciclos.','Plan two realistic self-care moments for next week. Breathe slowly for a few cycles.','Planea dos momentos realistas de autocuidado para la próxima semana. Respira lentamente unos ciclos.'):
    L('Faça uma pausa de dois minutos, respire calmamente e identifique uma pequena vitória de hoje.','Pause for two minutes, breathe comfortably and notice one small win today.','Pausa dos minutos, respira tranquilo e identifica una pequeña victoria de hoy.'),
    L('Bem-estar geral, não diagnóstico nem tratamento.','General wellness, not diagnosis or treatment.','Bienestar general, no diagnóstico ni tratamiento.')];
  if(kind==='stretch')return [
    L('Alongamento e mobilidade','Stretching and mobility','Estiramiento y movilidad'),
    active?L('Depois da atividade, desacelere; alongue panturrilhas, quadris e ombros suavemente por 10–30 segundos, sem dor.','After activity, slow down; gently stretch calves, hips and shoulders for 10–30 seconds without pain.','Después de la actividad, baja el ritmo; estira pantorrillas, caderas y hombros 10–30 segundos sin dolor.'):
      L('Primeiro aqueça com alguns minutos de caminhada leve. Depois faça mobilidade confortável de ombros, coluna e quadris.','First warm up with a few minutes of easy walking. Then try comfortable shoulder, back and hip mobility.','Primero calienta caminando suave unos minutos. Después haz movilidad cómoda de hombros, espalda y caderas.'),
    L('Não force amplitudes nem ignore restrições profissionais.','Do not force range of motion or ignore professional restrictions.','No fuerces el movimiento ni ignores restricciones profesionales.')];
  if(kind==='water')return [
    L('Hidratação prática','Practical hydration','Hidratación práctica'),
    active?L('Comece hidratado. Tenha água acessível e beba conforme a sede antes, durante e após a atividade. Em calor ou exercício longo, a reposição pode precisar de orientação individual.','Start hydrated. Keep water accessible and drink according to thirst before, during and after activity. Heat or prolonged exercise may require individual guidance.','Empieza hidratado. Ten agua disponible y bebe según la sed antes, durante y después. Calor o ejercicio prolongado pueden exigir orientación individual.'):
      L('Mesmo sem treino, mantenha água por perto, distribua líquidos ao longo do dia e observe a sede e o calor.','Even without training, keep water nearby, drink throughout the day and pay attention to thirst and heat.','Incluso sin entrenar, ten agua cerca, bebe durante el día y presta atención a la sed y el calor.'),
    L('Evite beber água em excesso. Restrições médicas de líquidos exigem orientação profissional.','Avoid excessive water intake. Medical fluid restrictions require professional guidance.','Evita beber agua en exceso. Las restricciones médicas de líquidos requieren orientación profesional.')];
  if(kind==='sport'&&s.activity&&!plan?.trainingHold)return [
    activityLabel(profile),
    L('Esta atividade veio do seu onboarding. Ajuste duração e intensidade à sua experiência; se também houver treino, respeite a recuperação.','This activity came from your onboarding. Match duration and intensity to your experience; if you also train, prioritize recovery.','Esta actividad viene de tu onboarding. Ajusta duración e intensidad a tu experiencia; si también entrenas, prioriza la recuperación.'),
    L('EXTRA não inventa esportes nem libera restrições de segurança.','EXTRA does not invent sports or lift safety restrictions.','EXTRA no inventa deportes ni elimina restricciones de seguridad.')];
  return null;
}
function renderExtra() {
  const day=extraSelectedDay,week=currentWeek(),cycle=state.cycleNumber||1,s=extraScheduleDay(day);
  const post=!!state.postWorkout?.pending&&!state.postWorkout?.mindDone;
  const key=k=>`extra:${cycle}:w${week}:${day}:${k}`;
  const done=k=>!!state.habits?.[key(k)];
  const cards=[
    ['mind',L('Mente','Mind','Mente'),L('Pausa e reflexão','Pause and reflection','Pausa y reflexión')],
    ['stretch',L('Alongamento','Stretching','Estiramiento'),L('Mobilidade confortável','Comfortable mobility','Movilidad cómoda')],
    ['water',L('Hidratação','Hydration','Hidratación'),s.training||s.activity?L('Antes, durante e depois','Before, during and after','Antes, durante y después'):L('Hábitos nos dias leves','Habits on easy days','Hábitos en días suaves')]
  ];
  if(s.activity&&!plan.trainingHold)cards.push(['sport',activityLabel(profile),L('Atividade informada por você','Activity you reported','Actividad informada por ti')]);
  const detail=extraDetail(extraOpened,day);
  $('#mindContent').innerHTML=`
    <div class="card hero"><div class="kicker">EXTRA • ${L('SEMANA','WEEK','SEMANA')} ${week}</div><h1>${L('Mente, alongamento','Mind, stretching','Mente, estiramiento')}<br><span style="color:var(--gold)">${L('e hidratação.','and hydration.','e hidratación.')}</span></h1><p>${L('Escolha um dia e abra cada atividade. Nos dias sem treino, cuidar de você continua contando.','Choose a day and open each activity. On rest days, taking care of yourself still counts.','Elige un día y abre cada actividad. Cuidarte en días de descanso también cuenta.')}</p></div>
    ${post?`<div class="card milestone" style="margin-top:12px"><b>EXTRA • ${L('PÓS-TREINO','POST-WORKOUT','POSENTRENO')}</b><p>${L('Faça uma pausa breve antes de registrar o dia.','Take a short pause before logging your day.','Haz una breve pausa antes de registrar tu día.')}</p><button id="mindDone" class="btn btnGold" style="width:100%">${L('Concluir e registrar →','Complete and log →','Completar y registrar →')}</button></div>`:''}
    <div class="sectionTitle"><h2>${L('Sua semana complementar','Your complementary week','Tu semana complementaria')}</h2><span>7 ${L('dias','days','días')}</span></div>
    <div class="choiceGrid">${DAYS.map(d=>{const x=extraScheduleDay(d);return `<button type="button" class="choice ${d===day?'active':''}" data-extra-day="${d}"><b>${dayLabel(d)}</b><small style="display:block">${x.training?L('TREINO','TRAIN','ENTRENO'):x.activity?L('ESPORTE','SPORT','DEPORTE'):L('LEVE','EASY','SUAVE')}</small></button>`}).join('')}</div>
    <div class="notice" style="margin-top:12px"><b>${dayLabel(day)}</b> • ${s.training?L('Musculação planejada','Strength training planned','Fuerza programada'):L('Sem musculação planejada','No strength workout planned','Sin fuerza programada')}${s.activity?' • '+esc(activityLabel(profile)):''}. ${plan.trainingHold?L('Restrição ativa: não sugerimos atividade física adicional.','Active restriction: no additional physical activity suggested.','Restricción activa: no se sugiere actividad física adicional.'):L('Sugestões leves são opcionais; descansar também vale.','Gentle options are optional; rest is valid too.','Las opciones suaves son opcionales; descansar también vale.')}</div>
    <div class="actionList" style="margin-top:12px">${cards.map(([kind,label,desc])=>`<div class="actionCard"><div class="actionIcon">${kind==='water'?'H₂O':kind==='stretch'?'↗':kind==='mind'?'✦':'●'}</div><div><b>${esc(label)} ${done(kind)?'✓':''}</b><small>${esc(desc)}</small></div><button class="btn btnGhost" type="button" data-extra-open="${kind}" aria-label="${esc(label)}">›</button></div>`).join('')}</div>
    ${detail?`<div class="card miniCard" id="extraDetail" style="margin-top:12px"><div class="kicker">EXTRA • ${dayLabel(day)}</div><h2>${esc(detail[0])}</h2><p>${esc(detail[1])}</p><div class="notice" style="margin-top:10px">${esc(detail[2])}</div><button id="extraMarkDone" class="btn ${done(extraOpened)?'btnGhost':'btnGold'}" style="width:100%;margin-top:12px">${done(extraOpened)?L('✓ Concluído — desfazer','✓ Done — undo','✓ Hecho — deshacer'):L('Marcar concluído','Mark complete','Marcar completado')}</button></div>`:`<div class="notice" style="margin-top:12px">${L('Toque em uma atividade para ver como fazer.','Tap an activity for guidance.','Toca una actividad para ver cómo hacerla.')}</div>`}
    <div class="fieldHint" style="margin-top:10px">${L('Referências gerais: AHA (alongamento) e ACSM (hidratação).','General references: AHA (stretching), ACSM (hydration).','Referencias generales: AHA (estiramiento) y ACSM (hidratación).')}</div>`;
  $$('[data-extra-day]').forEach(b=>b.onclick=()=>{extraSelectedDay=b.dataset.extraDay;extraOpened='';renderExtra()});
  $$('[data-extra-open]').forEach(b=>b.onclick=()=>{extraOpened=b.dataset.extraOpen;renderExtra()});
  const mark=$('#extraMarkDone');if(mark)mark.onclick=()=>{state.habits=state.habits||{};state.habits[key(extraOpened)]=!done(extraOpened);saveState()};
  const m=$('#mindDone');if(m)m.onclick=()=>{state.postWorkout.mindDone=true;saveState();navigate('TRACK')};
}
