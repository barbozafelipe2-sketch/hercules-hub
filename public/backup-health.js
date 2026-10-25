/* Hercules Hub backup UX and local preflight. The embedded digest detects
 * accidental corruption; it is not an authentication signature. Server state
 * remains optional so a valid portable backup can be restored offline.
 */
const BACKUP_MARKER_KEY='hh_proto_backup_export_marker_v1';

function backupSnapshotString(p=profile,pl=plan,st=state,history=typeof chat==='undefined'?[]:chat){
  if(!p||!pl)return '';
  const copy={...(st||{})};
  // Ignore UI navigation and automatic sync time: neither means user progress changed.
  for(const k of ['sync','nav','mealWeek','mealDay','mealSlot'])delete copy[k];
  return JSON.stringify({profile:p,plan:pl,state:copy,chat:(Array.isArray(history)?history:[]).slice(-50)});
}
function backupSnapshotMarker(){
  const str=backupSnapshotString();
  // FNV-1a is a UI change token, NOT an integrity/authentication checksum.
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return `${str.length}:${(h>>>0).toString(16)}`;
}
function backupReadMarker(){
  try{const v=JSON.parse(localStorage.getItem(BACKUP_MARKER_KEY)||'null');
    return v&&typeof v.at==='string'&&typeof v.fingerprint==='string'?v:null;
  }catch{return null}
}
function backupMarkExportRequested(){
  try{localStorage.setItem(BACKUP_MARKER_KEY,JSON.stringify({at:new Date().toISOString(),fingerprint:backupSnapshotMarker()}))}catch{}
  renderBackupStatus();
}
function backupMarkRestoreCompleted(){
  try{localStorage.removeItem(BACKUP_MARKER_KEY)}catch{}
}
function backupStatusModel(){
  const marker=backupReadMarker();
  if(!marker)return {kind:'no-export',at:null,changed:null};
  const date=new Date(marker.at);
  if(!Number.isFinite(date.getTime()))return {kind:'no-export',at:null,changed:null};
  return {kind:backupSnapshotMarker()===marker.fingerprint?'attempted':'changed',at:date,changed:backupSnapshotMarker()!==marker.fingerprint};
}
function backupObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function backupText(value,max=5000,allowEmpty=true){return typeof value==='string'&&value.length<=max&&(allowEmpty||value.trim().length>0)}
function backupStringList(value,max=32,itemMax=120){return Array.isArray(value)&&value.length<=max&&value.every(x=>backupText(x,itemMax,false))}
function backupBoolMap(value,max=2500){return backupObject(value)&&Object.keys(value).length<=max&&Object.values(value).every(x=>typeof x==='boolean')}
function validPortableBackupData(data){
  const lang=x=>['pt-BR','en-US','es'].includes(x),id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
  const p=data?.profile,pl=data?.plan,st=data?.state;
  if(!backupObject(data)||!backupObject(p)||!backupObject(pl)||!backupObject(st))return false;
  if(p.profileId!==undefined&&!id(p.profileId))return false;
  if(!backupText(p.name,60,false)||!lang(p.language)||!['build_muscle','general_fitness','fat_loss','consistency','strength'].includes(p.primaryGoal)||!['beginner','intermediate','advanced'].includes(p.level))return false;
  if(!backupStringList(p.days,7,3)||p.days.length<2||p.days.some(x=>!['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(x)))return false;
  if(!['gym','home','both'].includes(p.location)||!['20','30','45','60'].includes(p.minutes)||!['2','3','4','5'].includes(p.meals)||!['minimal','basic','comfortable'].includes(p.cooking))return false;
  if(!['<5','5','6','7','8','9+'].includes(p.sleep)||!/^[1-5]$/.test(String(p.stress))||!['yes','no'].includes(p.currentPain)||!['yes','no'].includes(p.redFlags)||!['yes','no'].includes(p.professionalRestrictions))return false;
  for(const [key,max] of [['proteinPreferences',16],['grainPreferences',16],['veggiePreferences',16],['foodStyles',12],['painAreas',10],['activityDays',7]])if(p[key]!==undefined&&!backupStringList(p[key],max,80))return false;
  if(!['none','swimming','soccer','running','cycling','walking','yoga','dancing','other'].includes(p.activityType||'none'))return false;
  if(!backupObject(pl.summary)||!backupObject(pl.training)||!backupObject(pl.nutrition)||!backupObject(pl.recover)||!backupObject(pl.mind)||!backupObject(pl.track)||!backupObject(pl.evolve))return false;
  if(!['green','yellow','red'].includes(pl.risk)||typeof pl.trainingHold!=='boolean'||typeof pl.allergyReview!=='boolean')return false;
  if(!backupText(pl.summary.goal,160,false)||!Number.isInteger(pl.summary.strengthDays)||pl.summary.strengthDays<2||pl.summary.strengthDays>4||!Number.isFinite(pl.summary.minutes)||!Number.isFinite(pl.summary.meals)||!lang(pl.summary.language))return false;
  if(!backupStringList(pl.training.pattern,8,80)||!backupStringList(pl.training.progression,4,240)||pl.training.progression.length!==4)return false;
  if(typeof pl.nutrition.reviewRequired!=='boolean'||pl.nutrition.slotPolicy!=='role-stable'||!backupStringList(pl.nutrition.principles,32,180))return false;
  if(!backupText(pl.recover.sleep,40,false)||!Number.isFinite(pl.recover.stress)||!backupText(pl.mind.focus,200,false)||!backupStringList(pl.track.signals,32,120)||!backupText(pl.evolve.mode,120,false))return false;
  const cycle=Number(data.cycleNumber);
  if(!Number.isSafeInteger(cycle)||cycle<1||cycle>600||!Number.isSafeInteger(Number(st.cycleNumber||cycle))||Number(st.cycleNumber||cycle)<1||Number(st.cycleNumber||cycle)>600)return false;
  if(st.startedAt!==''&&(!backupText(st.startedAt,60,false)||!Number.isFinite(Date.parse(st.startedAt))))return false;
  if(st.checkins!==undefined&&(!Array.isArray(st.checkins)||st.checkins.length>90||!st.checkins.every(x=>backupObject(x)&&Number.isFinite(Date.parse(x.ts))&&['energy','sleep','training','nutrition'].every(k=>Number.isFinite(Number(x[k]))&&Number(x[k])>=1&&Number(x[k])<=5))))return false;
  if(st.completedExercises!==undefined&&!backupBoolMap(st.completedExercises,2500))return false;
  if(st.completedSessions!==undefined&&!backupBoolMap(st.completedSessions,500))return false;
  if(st.habits!==undefined&&!backupBoolMap(st.habits,250))return false;
  if(st.cycleHistory!==undefined&&(!Array.isArray(st.cycleHistory)||st.cycleHistory.length>120))return false;
  if(st.traceLab!==undefined&&(!Array.isArray(st.traceLab)||st.traceLab.length>40))return false;
  if(!lang(data.language)||data.language!==p.language||pl.summary.language!==data.language)return false;
  if(data.chat!==undefined&&(!Array.isArray(data.chat)||data.chat.length>50||!data.chat.every(x=>backupObject(x)&&backupText(x.role,20,false)&&backupText(x.text,1500))))return false;
  return true;
}
/* Inspect and structurally validate a portable file locally before confirmation.
 * The SHA-256 catches corruption, not deliberate edits or identity ownership.
 */
async function backupInspectRestore(file,bytes){
  const fail=()=>new Error(L('Backup incompatível ou com integridade inválida.','Backup is incompatible or failed integrity checks.','El backup es incompatible o no pasó la verificación de integridad.'));
  let wrapper,data;
  try{
    wrapper=parseBackupFromFile(file,bytes);
    if(!wrapper||wrapper.schema!=='hercules-backup-v1'||!Number.isFinite(Date.parse(wrapper.exportedAt))||
       typeof wrapper.data!=='string'||wrapper.data.length>2000000||
       !/^sha256:[a-f0-9]{64}$/.test(String(wrapper.integrity||'')))throw fail();
    if('sha256:'+await sha256Text(wrapper.data)!==wrapper.integrity)throw fail();
    data=JSON.parse(b64UrlToUtf8(wrapper.data));
    if(!validPortableBackupData(data))throw fail();
  }catch{throw fail()}
  return {wrapper,data,summary:{exportedAt:wrapper.exportedAt,name:String(data.profile.name||'').slice(0,80),
    cycle:Number(data.cycleNumber),checkins:data.state.checkins?.length||0,language:data.language,profileId:data.profile.profileId||null}};
}
function confirmBackupRestore(preview){
  const summary=preview?.summary;
  const details=summary?L(
    `Arquivo: ${new Date(summary.exportedAt).toLocaleString(locale())} • Ciclo ${summary.cycle} • ${summary.checkins} registros.`,
    `File: ${new Date(summary.exportedAt).toLocaleString(locale())} • Cycle ${summary.cycle} • ${summary.checkins} check-ins.`,
    `Archivo: ${new Date(summary.exportedAt).toLocaleString(locale())} • Ciclo ${summary.cycle} • ${summary.checkins} registros.`
  )+'\n\n':'';
  if(!profile||!plan){
    if(!summary)return true; // legacy caller; first launch has nothing to replace
    return window.confirm(details+L('Importar este backup para iniciar o Hercules?','Import this backup to start Hercules?','¿Importar este backup para iniciar Hércules?'));
  }
  return window.confirm(details+L(
    `ATENÇÃO: restaurar substituirá o perfil, o plano e o progresso deste aparelho pelo arquivo selecionado. O ID do perfil no arquivo será preservado. Exporte o estado atual antes se quiser mantê-lo. Continuar?`,
    `WARNING: restoring will replace this device’s profile, plan and progress with the selected file. The profile ID in that file will be preserved. Export the current state first if you want to keep it. Continue?`,
    `ATENCIÓN: restaurar reemplazará el perfil, el plan y el progreso de este dispositivo por el archivo seleccionado. Se conservará el ID del perfil del archivo. Exporta el estado actual antes si quieres conservarlo. ¿Continuar?`
  ));
}
function renderBackupStatus(){
  const root=$('#settingsRows');if(!root||!profile||!plan)return;
  root.querySelector('#backupStatusRow')?.remove();
  const m=backupStatusModel(),nice=m.at?m.at.toLocaleString(locale(),{dateStyle:'medium',timeStyle:'short'}):'',syncPending=!!localStorage.getItem('hh_restore_sync_pending_v1');
  const description=m.kind==='no-export'?L(
    'Nenhuma exportação iniciada neste aparelho. Faça um PDF portátil e guarde-o em local privado.',
    'No export started on this device. Create a portable PDF and store it somewhere private.',
    'Ninguna exportación iniciada en este dispositivo. Crea un PDF portátil y guárdalo en privado.'
  ):m.kind==='changed'?L(
    'O plano ou progresso mudou depois da última exportação iniciada. Faça um novo PDF.',
    'Plan or progress changed since the last export was started. Create an updated PDF.',
    'El plan o progreso cambió desde la última exportación iniciada. Crea un PDF actualizado.'
  ):L(
    'Nenhuma alteração relevante detectada desde a exportação iniciada. Confira se o PDF foi salvo e pode ser aberto.',
    'No relevant changes detected since export started. Check that the PDF was saved and can be opened.',
    'No se detectaron cambios relevantes desde la exportación iniciada. Comprueba que el PDF se haya guardado y se pueda abrir.'
  );
  const label=m.kind==='changed'?L('ATUALIZE O PDF','UPDATE PDF','ACTUALIZA PDF'):m.kind==='attempted'?L('EXPORTAÇÃO INICIADA','EXPORT STARTED','EXPORTACIÓN INICIADA'):L('SEM EXPORTAÇÃO','NO EXPORT','SIN EXPORTACIÓN');
  // Download was requested; do not present it as verified success.
  const marker=m.kind==='changed'?'warn':'neutral';
  const syncCopy=syncPending?L('Backup importado localmente; sincronização pendente. O arquivo continua sendo a fonte segura até o servidor confirmar.','Backup restored locally; server sync is pending. The file remains the safe source until the server confirms.','Backup restaurado localmente; sincronización pendiente. El archivo sigue siendo la fuente segura hasta que el servidor confirme.'):state.sync?.persistent?L('cópia sincronizada registrada','synced copy recorded','copia sincronizada registrada'):L('cópia local; sincronização não confirmada','local copy; sync unconfirmed','copia local; sincronización no confirmada');
  const node=`<div id="backupStatusRow" class="settingsRow backupStatus"><div><b>${L('Proteção do progresso','Progress backup','Protección del progreso')}</b><small>${esc(description)}${nice?' • '+esc(nice):''}</small><small>${L('Aparelho:','Device:','Dispositivo:')} ${esc(syncCopy)}${state.sync?.lastSyncedAt?' • '+esc(new Date(state.sync.lastSyncedAt).toLocaleString(locale())):''}</small></div><span class="pill ${marker}">${label}</span></div>`;
  const section=[...root.querySelectorAll('.settingsSection')].find(el=>el.textContent?.includes(L('DADOS E RECUPERAÇÃO','DATA & RECOVERY','DATOS Y RECUPERACIÓN')));
  if(section)section.insertAdjacentHTML('afterend',node);else root.insertAdjacentHTML('afterbegin',node);
}
