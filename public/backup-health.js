/* Hercules Hub beta 5/10 — nonauthoritative backup UX.
 * The SHA-256 inside the existing PDF backup is verified by /api/restore.
 * This tiny local marker is ONLY a convenient changed-since-export indicator;
 * it cannot establish a downloaded file is present or intact.
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
/* Inspect a portable PDF BEFORE asking consent or contacting /api/restore.
 * This client-side check is defense in depth; the server independently verifies
 * the digest and validates the full profile/plan/state schema before persisting.
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
    if(!data||!data.profile||!data.plan||!data.state||
       !['pt-BR','en-US','es'].includes(data.language)||
       !Number.isSafeInteger(Number(data.cycleNumber))||Number(data.cycleNumber)<1||
       !Array.isArray(data.state.checkins)||!data.plan.summary)throw fail();
  }catch{throw fail()}
  return {wrapper,summary:{exportedAt:wrapper.exportedAt,name:String(data.profile.name||'').slice(0,80),
    cycle:Number(data.cycleNumber),checkins:data.state.checkins.length,language:data.language}};
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
    'ATENÇÃO: restaurar substituirá o perfil, o plano e o progresso deste aparelho e poderá substituir a cópia sincronizada. Exporte o estado atual antes, se quiser preservá-lo. Continuar?',
    'WARNING: restoring will replace this device’s profile, plan and progress and may replace its synced copy. Export the current state first if you want to keep it. Continue?',
    'ATENCIÓN: restaurar reemplazará el perfil, plan y progreso de este dispositivo y puede reemplazar la copia sincronizada. Exporta el estado actual antes si quieres conservarlo. ¿Continuar?'
  ));
}
function renderBackupStatus(){
  const root=$('#settingsRows');if(!root||!profile||!plan)return;
  root.querySelector('#backupStatusRow')?.remove();
  const m=backupStatusModel(),nice=m.at?m.at.toLocaleString(locale(),{dateStyle:'medium',timeStyle:'short'}):'';
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
  const node=`<div id="backupStatusRow" class="settingsRow backupStatus"><div><b>${L('Proteção do progresso','Progress backup','Protección del progreso')}</b><small>${esc(description)}${nice?' • '+esc(nice):''}</small><small>${L('Aparelho:','Device:','Dispositivo:')} ${state.sync?.persistent?L('cópia sincronizada registrada','synced copy recorded','copia sincronizada registrada'):L('cópia local; sincronização não confirmada','local copy; sync unconfirmed','copia local; sincronización no confirmada')}${state.sync?.lastSyncedAt?' • '+esc(new Date(state.sync.lastSyncedAt).toLocaleString(locale())):''}</small></div><span class="pill ${marker}">${label}</span></div>`;
  const section=[...root.querySelectorAll('.settingsSection')].find(el=>el.textContent?.includes(L('DADOS E RECUPERAÇÃO','DATA & RECOVERY','DATOS Y RECUPERACIÓN')));
  if(section)section.insertAdjacentHTML('afterend',node);else root.insertAdjacentHTML('afterbegin',node);
}
