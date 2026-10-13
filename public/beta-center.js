/* Hercules Hub Stage 5 beta feedback; opt-in text ONLY. No automatic profile,
 * medical history, measurements, location, IP, device id or plan telemetry.
 */
const BETA_CATEGORIES=['bug','confusing','idea','praise'];
const BETA_REPORT_KEY='hh_beta_last_receipt_v1';
function betaLastReceipt(){
  try{
    const r=JSON.parse(localStorage.getItem(BETA_REPORT_KEY)||'null');
    return r&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.month)&&
      /^[0-9a-f-]{36}$/i.test(r.receipt)&&/^[0-9a-f-]{36}$/i.test(r.eraseToken)?r:null;
  }catch{return null}
}
function betaRememberReceipt(r){
  if(!r?.receipt||!r?.month||!r?.eraseToken)return;
  try{localStorage.setItem(BETA_REPORT_KEY,JSON.stringify({receipt:r.receipt,month:r.month,eraseToken:r.eraseToken}))}catch{}
}
async function betaEraseLastReceipt(){
  const r=betaLastReceipt();if(!r)return false;
  if(!window.confirm(L('Excluir permanentemente seu último relato Beta deste dispositivo?','Permanently delete your last Beta report from this device?','¿Eliminar permanentemente tu último informe Beta de este dispositivo?')))return false;
  try{
    const response=await api('/api/beta-feedback',{action:'erase',...r});
    if(!response?.ok||!response.erased)throw Error('Not confirmed');
    localStorage.removeItem(BETA_REPORT_KEY);
    betaSetStatus(L('Relato excluído do servidor.','Report deleted from the server.','Informe eliminado del servidor.'));
    const button=$('#betaErase');if(button)button.hidden=true;
    return true;
  }catch{
    betaSetStatus(L('Não foi possível confirmar a exclusão. Tente novamente.','Deletion could not be confirmed. Please try again.','No se pudo confirmar la eliminación. Inténtalo de nuevo.'),true);
    return false;
  }
}
function betaFeedbackPayload(category,message,uiLanguage=lang,screen=state.nav){
  const type=String(category||'');const text=String(message||'').trim();
  if(!BETA_CATEGORIES.includes(type))throw new Error(L('Escolha uma categoria válida.','Select a valid category.','Selecciona una categoría válida.'));
  if(text.length<15||text.length>800)throw new Error(L('Descreva em 15 a 800 caracteres.','Describe it in 15–800 characters.','Describe en 15 a 800 caracteres.'));
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)||/\b(?:\+?\d[\d\s().-]{8,}\d)\b/.test(text))
    throw new Error(L('Remova telefone e email antes de enviar.','Remove phone numbers and email addresses before sending.','Elimina teléfonos y correos antes de enviar.'));
  return {category:type,message:text,language:['pt-BR','en-US','es'].includes(uiLanguage)?uiLanguage:'en-US',screen:['HOME','TRAIN','NOURISH','RECOVER','MIND','TRACK','EVOLVE'].includes(screen)?screen:'HOME',appVersion:APP_VERSION};
}
function betaSetStatus(txt,error=false){const node=$('#betaStatus');if(node){node.hidden=false;node.textContent=txt;node.dataset.error=error?'true':'false'}}
function betaOpen(){closeOverlay('settings');renderBetaCenter();openOverlay('beta')}
function renderBetaSettingsEntry(){
  const rows=$('#settingsRows');if(!rows||rows.querySelector('#betaSettingsEntry'))return;
  rows.insertAdjacentHTML('beforeend',`<div id="betaSettingsEntry" class="settingsRow settingsAction"><div><b>${L('CENTRO BETA','BETA CENTER','CENTRO BETA')}</b><small>${L('Envie problemas e sugestões sobre o teste sem compartilhar seus dados pessoais ou de saúde.','Report test problems and ideas without sharing personal or health information.','Envía problemas e ideas de la prueba sin compartir datos personales ni de salud.')}</small></div><button class="btn btnGhost" id="openBetaCenter">${L('Abrir','Open','Abrir')}</button></div>`);
  $('#openBetaCenter').onclick=betaOpen;
}
function renderBetaCenter(){
  const root=$('#betaContent');if(!root)return;
  root.innerHTML=`<div class="betaCenter"><div class="kicker">HERCULES • ${L('TESTE','BETA TEST','PRUEBA')}</div>
    <h3>${L('O que podemos melhorar?','What can we improve?','¿Qué podemos mejorar?')}</h3>
    <p>${L('Seu relato ajuda a corrigir o aplicativo. Não inclua nomes, contato, medidas, lesões, histórico médico ou outros dados sensíveis.','Your report helps improve the app. Do not include names, contact details, measurements, injuries, medical history or other sensitive information.','Tu comentario ayuda a mejorar la app. No incluyas nombres, contacto, medidas, lesiones, historial médico u otros datos sensibles.')}</p>
    <div class="betaGroup"><label for="betaCategory">${L('Tipo de feedback','Feedback type','Tipo de comentario')}</label><select id="betaCategory">
    <option value="bug">${L('Algo não funciona','Something is broken','Algo no funciona')}</option>
    <option value="confusing">${L('Difícil de entender','Hard to understand','Difícil de entender')}</option>
    <option value="idea">${L('Sugestão','Suggestion','Sugerencia')}</option>
    <option value="praise">${L('O que funcionou','What worked','Qué funcionó')}</option></select></div>
    <div class="betaGroup"><label for="betaMessage">${L('Descreva o problema ou ideia','Describe the problem or idea','Describe el problema o la idea')}</label><textarea id="betaMessage" maxlength="800" placeholder="${L('O que você tentou fazer? O que aconteceu?','What did you try? What happened?','¿Qué intentaste hacer? ¿Qué pasó?')}"></textarea><small class="betaNote">${L('Mínimo 15, máximo 800 caracteres.','Minimum 15, maximum 800 characters.','Mínimo 15, máximo 800 caracteres.')}</small></div>
    <label class="betaConsent"><input id="betaConsent" type="checkbox">${L('Concordo em enviar este texto e a categoria escolhida para análise da equipe Hércules. Entendo que o relatório pode ficar armazenado até a revisão e não devo incluir dados sensíveis.','I agree to send this text and category for Hercules beta review. I understand the report may be stored until reviewed and I should not include sensitive data.','Acepto enviar el texto y la categoría para revisión beta de Hércules. Entiendo que el informe puede almacenarse hasta su revisión y no debo incluir datos sensibles.')}</label>
    <div class="betaActions"><button type="button" class="btn btnGold" id="betaSend">${L('Enviar feedback','Send feedback','Enviar comentario')}</button><button type="button" class="btn btnGhost" id="betaCopy">${L('Copiar texto','Copy text','Copiar texto')}</button></div>
    <div class="betaGroup"><button type="button" class="btn btnGhost" id="betaErase" ${betaLastReceipt()?'':'hidden'}>${L('Excluir meu último relato enviado','Delete my last submitted report','Eliminar mi último informe enviado')}</button></div>
    <div id="betaStatus" class="betaStatus" role="status" aria-live="polite" hidden></div>
    <p class="betaNote">${L('Exclusão: você pode apagar o último relato armazenado usando este aparelho; se limpar seus dados locais, poderá perder essa opção. A exclusão automática dos relatos antigos ainda depende da rotina de manutenção da equipe.','Deletion: you can erase the last stored report on this device; clearing local data may remove that option. Automatic deletion of old reports still depends on the team’s maintenance process.','Eliminación: puedes borrar el último informe desde este dispositivo; borrar los datos locales puede quitar esta opción. La eliminación automática de informes antiguos depende del mantenimiento del equipo.')}</p>
    <p class="betaNote">${L('Não anexamos automaticamente seu perfil, check-ins ou histórico. Se o envio falhar, use Copiar texto para compartilhar o relato por um canal de sua escolha.','Your profile, check-ins and history are never attached automatically. If sending fails, use Copy text and share using your preferred channel.','Tu perfil, registros e historial no se adjuntan automáticamente. Si falla el envío, usa Copiar texto y comparte por el canal que prefieras.')}</p></div>`;
  const send=$('#betaSend'),copy=$('#betaCopy');
  const erase=$('#betaErase');if(erase)erase.onclick=betaEraseLastReceipt;
  const payload=()=>betaFeedbackPayload($('#betaCategory').value,$('#betaMessage').value);
  copy.onclick=async()=>{let text;try{text=payload().message}catch(e){betaSetStatus(e.message,true);return}try{await navigator.clipboard.writeText(text);betaSetStatus(L('Texto copiado. Envie por um canal de sua escolha.','Text copied. Share via a channel of your choice.','Texto copiado. Compártelo por el canal que prefieras.'))}catch{betaSetStatus(L('Não foi possível copiar automaticamente. Selecione e copie o texto.','Automatic copy failed. Select and copy the text.','No se pudo copiar automáticamente. Selecciona y copia el texto.'),true)}};
  send.onclick=async()=>{
    if(!$('#betaConsent').checked){betaSetStatus(L('Confirme o consentimento antes de enviar.','Confirm consent before sending.','Confirma el consentimiento antes de enviar.'),true);return}
    let data;try{data=payload()}catch(e){betaSetStatus(e.message,true);return}
    send.disabled=true;betaSetStatus(L('Enviando…','Sending…','Enviando…'));
    try{const r=await api('/api/beta-feedback',data);if(!r?.ok||!r?.receipt)throw new Error('No receipt');
      betaRememberReceipt(r);
      const eraseButton=$('#betaErase');if(eraseButton)eraseButton.hidden=!betaLastReceipt();
      betaSetStatus(L('Feedback recebido. Protocolo: ','Feedback received. Reference: ','Comentario recibido. Referencia: ')+String(r.receipt));
      $('#betaMessage').value='';$('#betaConsent').checked=false;
    }catch{betaSetStatus(L('Não foi possível confirmar o envio. Seu texto permanece aqui. Use Copiar texto ou tente novamente.','Delivery could not be confirmed. Your text is still here. Copy it or try again.','No se pudo confirmar el envío. Tu texto sigue aquí. Cópialo o vuelve a intentarlo.'),true)}finally{send.disabled=false}
  };
}
