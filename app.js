const STORAGE_KEY = 'ccoi_historico_v4';
const DATA_SCHEMA_VERSION = 2;
function getLocalISODate(baseDate){
  const d = baseDate instanceof Date ? baseDate : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const todayKey = getLocalISODate(new Date());
let loadedRecordDate = todayKey;
let currentCalendarMonth = new Date(todayKey + 'T00:00:00');

const FIELD_IDS = [
  'op_data',
  'op_turno',
  'op_status',
  'op_volume',
  'op_tipo',
  'op_criticos',
  'op_reinc',
  'op_sla',
  'op_qtd_clientes_criticos',
  'op_cliente_critico',
  'op-cli1_cliente',
  'op-cli1_prioridade',
  'op-cli1_acao',
  'op-cli1_prazo',
  'op-cli2_cliente',
  'op-cli2_prioridade',
  'op-cli2_acao',
  'op-cli2_prazo',
  'op-cli3_cliente',
  'op-cli3_prioridade',
  'op-cli3_acao',
  'op-cli3_prazo',
  'op-cli4_cliente',
  'op-cli4_prioridade',
  'op-cli4_acao',
  'op-cli4_prazo',
  'op-cli5_cliente',
  'op-cli5_prioridade',
  'op-cli5_acao',
  'op-cli5_prazo',
  'op_unidade',
  'op_motivo',
  'op_risco_escalonamento',
  'op_risco_cliente',
  'op_risco_atraso',
  'op_prioridade1',
  'op_prioridade2',
  'op_prioridade3',
  'op_contencao',
  'op_obs',
  'op_exec1',
  'op_exec2',
  'op_exec3',
  'op_exec4',
  'op_exec5',
  'op_horas',
  'ag_data_base',
  'ag_cliente_foco',
  'ag_responsavel',
  'ag_obs',
  'ag1_titulo',
  'ag1_data',
  'ag1i',
  'ag1f',
  'ag1_flag',
  'ag1_detalhe',
  'ag2_titulo',
  'ag2_data',
  'ag2i',
  'ag2f',
  'ag2_flag',
  'ag2_detalhe',
  'ag3_titulo',
  'ag3_data',
  'ag3i',
  'ag3f',
  'ag3_flag',
  'ag3_detalhe',
  'ag4_titulo',
  'ag4_data',
  'ag4i',
  'ag4f',
  'ag4_flag',
  'ag4_detalhe',
  'ag5_titulo',
  'ag5_data',
  'ag5i',
  'ag5f',
  'ag5_flag',
  'ag5_detalhe',
  'ag6_titulo',
  'ag6_data',
  'ag6i',
  'ag6f',
  'ag6_flag',
  'ag6_detalhe',
  'tec_status',
  'tec_impacto',
  'tec_risco_cliente',
  'tec_escalonamento',
  'tec_apoio_gestor',
  'tec_campo',
  'tec_parados',
  'tec_remoto',
  'tec_aguardando_peca',
  'tec_aguardando_cliente',
  'tec_reincidentes',
  'tec_feito',
  'tec_andamento',
  'tec_travado',
  'tec_quem_age',
  'tec_proximo',
  'adm_status',
  'adm_impacto',
  'adm_risco_cliente',
  'adm_apoio_gestor',
  'adm_dep_terceiros',
  'adm_resolvido',
  'adm_andamento',
  'adm_travado',
  'adm_dep_gestor_txt',
  'adm_proximo',
  'diag_leitura',
  'diag_operacao',
  'diag_tecnico',
  'diag_adm',
  'diag_risco_atraso',
  'diag_risco_retrabalho',
  'diag_risco_cliente',
  'diag_risco_sla',
  'diag_risco_escalonamento',
  'diag_risco_fin',
  'diag_acao',
  'diag_responsavel',
  'diag_prazo',
  'diag_apoio',
  'diag_escalonamento',
  'diag_validado',
  'diag_comentario',
  'diag_decisao',
  'diag_direcionamento',
  'res_prob',
  'res_acao',
  'res_result',
  'res_aprend',
  'exe_resumo',
  'exe_decisao',
  'exe_foco',
  'neg_fin',
  'neg_risco',
  'neg_plano',
  'melh_oque',
  'melh_impacto',
  'melh_proxima',
  'tec-peca1_pedido',
  'tec-peca1_cliente',
  'tec-peca1_item',
  'tec-peca1_resp',
  'tec-peca1_data',
  'tec-peca1_prazo',
  'tec-peca1_impacto',
  'tec-peca1_status',
  'tec-peca1_acao',
  'tec-peca1_obs',
  'tec-peca2_pedido',
  'tec-peca2_cliente',
  'tec-peca2_item',
  'tec-peca2_resp',
  'tec-peca2_data',
  'tec-peca2_prazo',
  'tec-peca2_impacto',
  'tec-peca2_status',
  'tec-peca2_acao',
  'tec-peca2_obs',
  'tec-peca3_pedido',
  'tec-peca3_cliente',
  'tec-peca3_item',
  'tec-peca3_resp',
  'tec-peca3_data',
  'tec-peca3_prazo',
  'tec-peca3_impacto',
  'tec-peca3_status',
  'tec-peca3_acao',
  'tec-peca3_obs',
  'tec-cliente1_cliente',
  'tec-cliente1_os',
  'tec-cliente1_tipo',
  'tec-cliente1_prazo',
  'tec-cliente1_ultimo',
  'tec-cliente1_resp',
  'tec-cliente1_risco',
  'tec-cliente1_acao',
  'tec-cliente1_obs',
  'tec-cliente2_cliente',
  'tec-cliente2_os',
  'tec-cliente2_tipo',
  'tec-cliente2_prazo',
  'tec-cliente2_ultimo',
  'tec-cliente2_resp',
  'tec-cliente2_risco',
  'tec-cliente2_acao',
  'tec-cliente2_obs',
  'tec-cliente3_cliente',
  'tec-cliente3_os',
  'tec-cliente3_tipo',
  'tec-cliente3_prazo',
  'tec-cliente3_ultimo',
  'tec-cliente3_resp',
  'tec-cliente3_risco',
  'tec-cliente3_acao',
  'tec-cliente3_obs',
  'tec-reinc1_os',
  'tec-reinc1_cliente',
  'tec-reinc1_equip',
  'tec-reinc1_motivo',
  'tec-reinc1_tecnico',
  'tec-reinc1_ultima',
  'tec-reinc1_mesmo',
  'tec-reinc1_retorno',
  'tec-reinc1_prioridade',
  'tec-reinc1_acao',
  'tec-reinc1_obs',
  'tec-reinc2_os',
  'tec-reinc2_cliente',
  'tec-reinc2_equip',
  'tec-reinc2_motivo',
  'tec-reinc2_tecnico',
  'tec-reinc2_ultima',
  'tec-reinc2_mesmo',
  'tec-reinc2_retorno',
  'tec-reinc2_prioridade',
  'tec-reinc2_acao',
  'tec-reinc2_obs',
  'tec-reinc3_os',
  'tec-reinc3_cliente',
  'tec-reinc3_equip',
  'tec-reinc3_motivo',
  'tec-reinc3_tecnico',
  'tec-reinc3_ultima',
  'tec-reinc3_mesmo',
  'tec-reinc3_retorno',
  'tec-reinc3_prioridade',
  'tec-reinc3_acao',
  'tec-reinc3_obs',
  'tec-dist1_nome',
  'tec-dist1_cliente',
  'tec-dist1_unidade',
  'tec-dist1_tipo',
  'tec-dist1_status',
  'tec-dist1_retorno',
  'tec-dist1_conclusao',
  'tec-dist1_bloqueio',
  'tec-dist1_acao',
  'tec-dist1_flag',
  'tec-dist1_obs',
  'tec-ticket1_num',
  'tec-ticket1_cliente',
  'tec-ticket1_produto',
  'tec-ticket1_impacto',
  'tec-ticket1_status',
  'tec-ticket1_abertura',
  'tec-ticket1_ultima',
  'tec-ticket1_prazo',
  'tec-ticket1_terceiro',
  'tec-ticket1_risco',
  'tec-ticket1_acao',
  'tec-ticket1_obs',
  'tec-dist2_nome',
  'tec-dist2_cliente',
  'tec-dist2_unidade',
  'tec-dist2_tipo',
  'tec-dist2_status',
  'tec-dist2_retorno',
  'tec-dist2_conclusao',
  'tec-dist2_bloqueio',
  'tec-dist2_acao',
  'tec-dist2_flag',
  'tec-dist2_obs',
  'tec-ticket2_num',
  'tec-ticket2_cliente',
  'tec-ticket2_produto',
  'tec-ticket2_impacto',
  'tec-ticket2_status',
  'tec-ticket2_abertura',
  'tec-ticket2_ultima',
  'tec-ticket2_prazo',
  'tec-ticket2_terceiro',
  'tec-ticket2_risco',
  'tec-ticket2_acao',
  'tec-ticket2_obs',
  'tec-dist3_nome',
  'tec-dist3_cliente',
  'tec-dist3_unidade',
  'tec-dist3_tipo',
  'tec-dist3_status',
  'tec-dist3_retorno',
  'tec-dist3_conclusao',
  'tec-dist3_bloqueio',
  'tec-dist3_acao',
  'tec-dist3_flag',
  'tec-dist3_obs',
  'tec-ticket3_num',
  'tec-ticket3_cliente',
  'tec-ticket3_produto',
  'tec-ticket3_impacto',
  'tec-ticket3_status',
  'tec-ticket3_abertura',
  'tec-ticket3_ultima',
  'tec-ticket3_prazo',
  'tec-ticket3_terceiro',
  'tec-ticket3_risco',
  'tec-ticket3_acao',
  'tec-ticket3_obs',
  'tec_motivo',
  'tec_resumo',
  'adm-peca1_pedido',
  'adm-peca1_cliente',
  'adm-peca1_item',
  'adm-peca1_resp',
  'adm-peca1_data',
  'adm-peca1_prazo',
  'adm-peca1_impacto',
  'adm-peca1_status',
  'adm-peca1_acao',
  'adm-peca1_obs',
  'adm-peca2_pedido',
  'adm-peca2_cliente',
  'adm-peca2_item',
  'adm-peca2_resp',
  'adm-peca2_data',
  'adm-peca2_prazo',
  'adm-peca2_impacto',
  'adm-peca2_status',
  'adm-peca2_acao',
  'adm-peca2_obs',
  'adm-peca3_pedido',
  'adm-peca3_cliente',
  'adm-peca3_item',
  'adm-peca3_resp',
  'adm-peca3_data',
  'adm-peca3_prazo',
  'adm-peca3_impacto',
  'adm-peca3_status',
  'adm-peca3_acao',
  'adm-peca3_obs',
  'adm-mov1_num',
  'adm-mov1_cliente',
  'adm-mov1_tipo',
  'adm-mov1_resp',
  'adm-mov1_data',
  'adm-mov1_prazo',
  'adm-mov1_impacto',
  'adm-mov1_status',
  'adm-mov1_acao',
  'adm-mov1_obs',
  'adm-mov2_num',
  'adm-mov2_cliente',
  'adm-mov2_tipo',
  'adm-mov2_resp',
  'adm-mov2_data',
  'adm-mov2_prazo',
  'adm-mov2_impacto',
  'adm-mov2_status',
  'adm-mov2_acao',
  'adm-mov2_obs',
  'adm-mov3_num',
  'adm-mov3_cliente',
  'adm-mov3_tipo',
  'adm-mov3_resp',
  'adm-mov3_data',
  'adm-mov3_prazo',
  'adm-mov3_impacto',
  'adm-mov3_status',
  'adm-mov3_acao',
  'adm-mov3_obs',
  'adm-nota1_num',
  'adm-nota1_cliente',
  'adm-nota1_tipo',
  'adm-nota1_resp',
  'adm-nota1_data',
  'adm-nota1_prazo',
  'adm-nota1_impacto',
  'adm-nota1_status',
  'adm-nota1_acao',
  'adm-nota1_obs',
  'adm-nota2_num',
  'adm-nota2_cliente',
  'adm-nota2_tipo',
  'adm-nota2_resp',
  'adm-nota2_data',
  'adm-nota2_prazo',
  'adm-nota2_impacto',
  'adm-nota2_status',
  'adm-nota2_acao',
  'adm-nota2_obs',
  'adm-nota3_num',
  'adm-nota3_cliente',
  'adm-nota3_tipo',
  'adm-nota3_resp',
  'adm-nota3_data',
  'adm-nota3_prazo',
  'adm-nota3_impacto',
  'adm-nota3_status',
  'adm-nota3_acao',
  'adm-nota3_obs',
  'adm-sc1_num',
  'adm-sc1_cliente',
  'adm-sc1_data',
  'adm-sc1_prazo',
  'adm-sc1_resp',
  'adm-sc1_impacto',
  'adm-sc1_status',
  'adm-sc1_acao',
  'adm-sc1_obs',
  'adm-sc2_num',
  'adm-sc2_cliente',
  'adm-sc2_data',
  'adm-sc2_prazo',
  'adm-sc2_resp',
  'adm-sc2_impacto',
  'adm-sc2_status',
  'adm-sc2_acao',
  'adm-sc2_obs',
  'adm-sc3_num',
  'adm-sc3_cliente',
  'adm-sc3_data',
  'adm-sc3_prazo',
  'adm-sc3_resp',
  'adm-sc3_impacto',
  'adm-sc3_status',
  'adm-sc3_acao',
  'adm-sc3_obs',
  'adm-email1_cliente',
  'adm-email1_assunto',
  'adm-email1_data',
  'adm-email1_tipo',
  'adm-email1_impacto',
  'adm-email1_resp',
  'adm-email1_prazo',
  'adm-email1_status',
  'adm-email1_acao',
  'adm-email1_obs',
  'adm-email2_cliente',
  'adm-email2_assunto',
  'adm-email2_data',
  'adm-email2_tipo',
  'adm-email2_impacto',
  'adm-email2_resp',
  'adm-email2_prazo',
  'adm-email2_status',
  'adm-email2_acao',
  'adm-email2_obs',
  'adm-email3_cliente',
  'adm-email3_assunto',
  'adm-email3_data',
  'adm-email3_tipo',
  'adm-email3_impacto',
  'adm-email3_resp',
  'adm-email3_prazo',
  'adm-email3_status',
  'adm-email3_acao',
  'adm-email3_obs',
  'adm-ctf1_num',
  'adm-ctf1_cliente',
  'adm-ctf1_data',
  'adm-ctf1_prazo',
  'adm-ctf1_resp',
  'adm-ctf1_impacto',
  'adm-ctf1_status',
  'adm-ctf1_terceiro',
  'adm-ctf1_acao',
  'adm-ctf1_obs',
  'adm-ctf2_num',
  'adm-ctf2_cliente',
  'adm-ctf2_data',
  'adm-ctf2_prazo',
  'adm-ctf2_resp',
  'adm-ctf2_impacto',
  'adm-ctf2_status',
  'adm-ctf2_terceiro',
  'adm-ctf2_acao',
  'adm-ctf2_obs',
  'adm-ctf3_num',
  'adm-ctf3_cliente',
  'adm-ctf3_data',
  'adm-ctf3_prazo',
  'adm-ctf3_resp',
  'adm-ctf3_impacto',
  'adm-ctf3_status',
  'adm-ctf3_terceiro',
  'adm-ctf3_acao',
  'adm-ctf3_obs',
  'adm-cliente1_cliente',
  'adm-cliente1_tipo',
  'adm-cliente1_ultimo',
  'adm-cliente1_prazo',
  'adm-cliente1_resp',
  'adm-cliente1_impacto',
  'adm-cliente1_status',
  'adm-cliente1_acao',
  'adm-cliente1_obs',
  'adm-cliente2_cliente',
  'adm-cliente2_tipo',
  'adm-cliente2_ultimo',
  'adm-cliente2_prazo',
  'adm-cliente2_resp',
  'adm-cliente2_impacto',
  'adm-cliente2_status',
  'adm-cliente2_acao',
  'adm-cliente2_obs',
  'adm-cliente3_cliente',
  'adm-cliente3_tipo',
  'adm-cliente3_ultimo',
  'adm-cliente3_prazo',
  'adm-cliente3_resp',
  'adm-cliente3_impacto',
  'adm-cliente3_status',
  'adm-cliente3_acao',
  'adm-cliente3_obs',
  'adm-terceiro1_nome',
  'adm-terceiro1_cliente',
  'adm-terceiro1_tipo',
  'adm-terceiro1_resp',
  'adm-terceiro1_data',
  'adm-terceiro1_prazo',
  'adm-terceiro1_impacto',
  'adm-terceiro1_status',
  'adm-terceiro1_acao',
  'adm-terceiro1_obs',
  'adm-terceiro2_nome',
  'adm-terceiro2_cliente',
  'adm-terceiro2_tipo',
  'adm-terceiro2_resp',
  'adm-terceiro2_data',
  'adm-terceiro2_prazo',
  'adm-terceiro2_impacto',
  'adm-terceiro2_status',
  'adm-terceiro2_acao',
  'adm-terceiro2_obs',
  'adm-terceiro3_nome',
  'adm-terceiro3_cliente',
  'adm-terceiro3_tipo',
  'adm-terceiro3_resp',
  'adm-terceiro3_data',
  'adm-terceiro3_prazo',
  'adm-terceiro3_impacto',
  'adm-terceiro3_status',
  'adm-terceiro3_acao',
  'adm-terceiro3_obs',
  'adm_motivo',
  'adm_resumo'
];


function show(id, el){
  closeRuntimeHub();
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  const target = document.getElementById(id);
  if(target) target.classList.add('active');
  document.querySelectorAll('.sidebar .nav').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  const mobileSelect = document.getElementById('mobileSectionSelect');
  if(mobileSelect) mobileSelect.value = id;
  toggleFloatingActions(id);
  updateFooterContext(id);
  if(window.innerWidth <= 980) window.scrollTo({top:0, behavior:'smooth'});
}


function notify(msg){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>toast.classList.remove('show'), 2600);
}

function setTextIfPresent(id, value){
  const el = document.getElementById(id);
  if(!el) return false;
  el.textContent = value;
  return true;
}

function setLinkIfPresent(id, href, label){
  const el = document.getElementById(id);
  if(!el) return false;
  if(href) el.setAttribute('href', href);
  el.textContent = label || href || '';
  return true;
}

function isServerBackedSession(){
  return location.protocol !== 'file:';
}

function openRuntimeHub(){
  const modal = document.getElementById('runtimeHubModal');
  if(!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  if(typeof loadBackendRuntimeInfo === 'function'){
    loadBackendRuntimeInfo().catch(err => console.error(err));
  }
  if(typeof window.refreshQualityBackend === 'function'){
    window.refreshQualityBackend(undefined, { silent: true }).catch(err => console.error(err));
  }
}

function closeRuntimeHub(){
  const modal = document.getElementById('runtimeHubModal');
  if(!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

window.addEventListener('keydown', function(event){
  if(event.key === 'Escape') closeRuntimeHub();
});

function getStore(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch(e){ return {}; }
}
function setStore(store){ localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

function syncFloatingDate(dateValue){
  const floating = document.getElementById('floatingDateInput');
  if(floating) floating.value = dateValue || '';
}

function syncDateFields(dateValue){
  if(!dateValue) return;
  const current = document.getElementById('currentDateInput');
  const floating = document.getElementById('floatingDateInput');
  const opDate = document.getElementById('op_data');
  const agDate = document.getElementById('ag_data_base');
  if(current && current.value !== dateValue) current.value = dateValue;
  if(floating && floating.value !== dateValue) floating.value = dateValue;
  if(opDate && !opDate.value) opDate.value = dateValue;
  if(agDate && !agDate.value) agDate.value = dateValue;
  syncSectionFooterDates(dateValue);
}

function toggleFloatingActions(sectionId){
  const wrap = document.getElementById('floatingActions');
  if(!wrap) return;
  const allowed = ['painel','operacao','agenda','tecnico','administrativo'];
  const activeSection = sectionId || (document.querySelector('.section.active')?.id || 'painel');
  wrap.classList.toggle('hidden', !allowed.includes(activeSection));
}

function collectForm(){
  const data = {};
  FIELD_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    data[id] = el.value;
  });
  return normalizeOperationData(data);
}
function applyForm(data={}){
  const normalizedData = normalizeOperationData(data);
  FIELD_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.value = normalizedData[id] || '';
  });
  applyCriticalClientValidationState(validateCriticalClientFlow(normalizedData));
  if(!document.getElementById('op_data').value) document.getElementById('op_data').value = loadedRecordDate || todayKey;
  if(!document.getElementById('ag_data_base').value) document.getElementById('ag_data_base').value = loadedRecordDate || todayKey;
  syncDateFields(loadedRecordDate || document.getElementById('op_data').value || todayKey);
  defaultAgendaDates();
  runAuto();
if(document.getElementById('mobileSectionSelect')) document.getElementById('mobileSectionSelect').value = 'painel';
}

function formatDate(iso){
  if(!iso || !iso.includes('-')) return '--';
  const [y,m,d] = iso.split('-');
  return d + '/' + m + '/' + y;
}
function parseNum(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  const v = parseFloat(el.value || 0);
  return isNaN(v) ? 0 : v;
}
function fieldValue(id){
  return document.getElementById(id)?.value || '';
}
function isBackendModeActive(){
  return window.__backendModeActive === true;
}
function getBackendInsightsCache(){
  if(!window.__backendInsightsByDate || typeof window.__backendInsightsByDate !== 'object'){
    window.__backendInsightsByDate = {};
  }
  return window.__backendInsightsByDate;
}
function getBackendInsightsPayload(dateKey){
  const key = String(dateKey || '').trim();
  if(!key) return null;
  return getBackendInsightsCache()[key] || null;
}
function getBackendDashboardSnapshot(dateKey){
  const payload = getBackendInsightsPayload(dateKey);
  return payload?.dashboard || null;
}
function isYes(id){
  const el = document.getElementById(id);
  return (el?.value || '') === 'Sim';
}

function severityValue(status){
  return {'EstÃ¡vel':1,'AtenÃ§Ã£o':2,'Pressionada':3,'CrÃ­tica':4}[status] || 1;
}
function impactValue(impacto){
  return {'Baixo':1,'MÃ©dio':2,'Alto':3,'CrÃ­tico':4}[impacto] || 1;
}
function severityLabel(v){
  if(v >= 4) return 'CrÃ­tica';
  if(v >= 3) return 'Pressionada';
  if(v >= 2) return 'AtenÃ§Ã£o';
  return 'EstÃ¡vel';
}
function riskLevel(v){
  if(v >= 15) return 'CrÃ­tico';
  if(v >= 10) return 'Alto';
  if(v >= 5) return 'MÃ©dio';
  return 'Baixo';
}
function executionPercent(){
  const ids = ['op_exec1','op_exec2','op_exec3','op_exec4','op_exec5'];
  const total = ids.length;
  const sim = ids.filter(id=>isYes(id)).length;
  return Math.round((sim/total)*100);
}

function countOpenTickets(){
  let total = 0;
  for(let i=1;i<=3;i++){
    const num = (document.getElementById(`tec-ticket${i}_num`)?.value || '').trim();
    const status = document.getElementById(`tec-ticket${i}_status`)?.value || '';
    if(num && status !== 'Resolvido') total++;
  }
  return total;
}
function countCriticalTickets(){
  let total = 0;
  for(let i=1;i<=3;i++){
    const num = (document.getElementById(`tec-ticket${i}_num`)?.value || '').trim();
    const impacto = document.getElementById(`tec-ticket${i}_impacto`)?.value || '';
    const status = document.getElementById(`tec-ticket${i}_status`)?.value || '';
    if(num && status !== 'Resolvido' && (impacto === 'CrÃ­tico' || impacto === 'Alto')) total++;
  }
  return total;
}
function countLateOrders(){
  const today = new Date();
  today.setHours(0,0,0,0);
  let total = 0;
  ['tec-peca','adm-peca'].forEach(prefix=>{
    for(let i=1;i<=3;i++){
      const pedido = (document.getElementById(`${prefix}${i}_pedido`)?.value || '').trim();
      const prazo = document.getElementById(`${prefix}${i}_prazo`)?.value || '';
      const status = document.getElementById(`${prefix}${i}_status`)?.value || '';
      if(!pedido || !prazo) continue;
      const prazoDate = new Date(prazo + 'T00:00:00');
      if(prazoDate < today && !['Recebido','Resolvido','Finalizado'].includes(status)) total++;
    }
  });
  return total;
}
function countAdminPendencias(){
  return parseNum('adm_qtd_pecas') + parseNum('adm_qtd_mov') + parseNum('adm_qtd_notas') + parseNum('adm_qtd_sc') + parseNum('adm_qtd_emails') + parseNum('adm_qtd_ctf') + parseNum('adm_qtd_cliente') + parseNum('adm_qtd_terceiros');
}
function countPendenciasClienteTotal(){
  return parseNum('tec_aguardando_cliente') + parseNum('adm_qtd_cliente');
}
function getCriticalClientEntries(){
  const qty = parseNum('op_qtd_clientes_criticos');
  const items = [];
  for(let i=1;i<=5;i++){
    const cliente = fieldValue(`op-cli${i}_cliente`).trim();
    const prioridade = fieldValue(`op-cli${i}_prioridade`);
    const acao = fieldValue(`op-cli${i}_acao`).trim();
    const prazo = fieldValue(`op-cli${i}_prazo`);
    if(i <= qty || cliente || prioridade || acao || prazo){
      items.push({index:i, cliente, prioridade, acao, prazo});
    }
  }
  return items;
}
function criticalClientPriorityLabel(item){
  const nome = item?.cliente || 'Cliente critico';
  const prioridade = item?.prioridade || 'Alta';
  return `${nome} â€¢ ${prioridade}`;
}
function getPrimaryCriticalClientName(){
  const first = getCriticalClientEntries().find(item => item.cliente);
  return first?.cliente || fieldValue('op_cliente_critico').trim() || fieldValue('tec-ticket1_cliente').trim() || '--';
}
function getCriticalClientActionSummary(){
  const first = getCriticalClientEntries().find(item => item.cliente || item.acao || item.prioridade || item.prazo);
  if(!first) return '';
  const parts = [];
  if(first.cliente) parts.push(first.cliente);
  if(first.prioridade) parts.push(first.prioridade);
  if(first.acao) parts.push(first.acao);
  if(first.prazo) parts.push('prazo ' + formatDate(first.prazo));
  return parts.join(' â€¢ ');
}
function getOperationDataSchemaVersion(data={}){
  const inlineVersion = parseInt(data.__schemaVersion, 10);
  if(Number.isFinite(inlineVersion) && inlineVersion > 0) return inlineVersion;
  const explicitVersion = parseInt(data.schemaVersion, 10);
  if(Number.isFinite(explicitVersion) && explicitVersion > 0) return explicitVersion;
  return 1;
}
function normalizeOperationData(data={}){
  const normalized = {...(data || {})};
  const filledIndexes = [];

  for(let i=1;i<=5;i++){
    const cliente = String(normalized[`op-cli${i}_cliente`] || '').trim();
    const prioridade = String(normalized[`op-cli${i}_prioridade`] || '').trim();
    const acao = String(normalized[`op-cli${i}_acao`] || '').trim();
    const prazo = String(normalized[`op-cli${i}_prazo`] || '').trim();
    if(cliente || prioridade || acao || prazo) filledIndexes.push(i);
  }

  const legacyClient = String(normalized.op_cliente_critico || '').trim();
  if(!filledIndexes.length && legacyClient){
    normalized['op-cli1_cliente'] = legacyClient;
    filledIndexes.push(1);
  }

  const currentQty = parseInt(normalized.op_qtd_clientes_criticos, 10);
  const inferredQty = filledIndexes.length;
  if(Number.isFinite(currentQty)){
    normalized.op_qtd_clientes_criticos = String(Math.max(currentQty, inferredQty));
  }else if(inferredQty > 0){
    normalized.op_qtd_clientes_criticos = String(inferredQty);
  }else if(legacyClient){
    normalized.op_qtd_clientes_criticos = '1';
  }

  if(!legacyClient){
    const firstIndex = filledIndexes[0];
    if(firstIndex) normalized.op_cliente_critico = String(normalized[`op-cli${firstIndex}_cliente`] || '').trim();
  }

  normalized.__schemaVersion = String(Math.max(DATA_SCHEMA_VERSION, getOperationDataSchemaVersion(normalized)));

  return normalized;
}
function validateCriticalClientFlow(data={}){
  const normalized = normalizeOperationData(data);
  const qty = parseNumFromValue(normalized.op_qtd_clientes_criticos);
  const issues = [];
  const invalidFieldIds = [];

  for(let i=1;i<=qty;i++){
    const label = `Cliente crÃ­tico ${i}`;
    const cliente = String(normalized[`op-cli${i}_cliente`] || '').trim();
    const prioridade = String(normalized[`op-cli${i}_prioridade`] || '').trim();
    const acao = String(normalized[`op-cli${i}_acao`] || '').trim();
    const prazo = String(normalized[`op-cli${i}_prazo`] || '').trim();

    if(!cliente){
      issues.push(`${label}: informe o cliente/unidade`);
      invalidFieldIds.push(`op-cli${i}_cliente`);
    }
    if(!prioridade){
      issues.push(`${label}: selecione a prioridade`);
      invalidFieldIds.push(`op-cli${i}_prioridade`);
    }
    if(!acao){
      issues.push(`${label}: registre a aÃ§Ã£o feita`);
      invalidFieldIds.push(`op-cli${i}_acao`);
    }
    if(!prazo){
      issues.push(`${label}: defina o prazo`);
      invalidFieldIds.push(`op-cli${i}_prazo`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    invalidFieldIds
  };
}
function parseNumFromValue(value){
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
function applyCriticalClientValidationState(validation){
  const invalidIds = new Set(validation?.invalidFieldIds || []);
  for(let i=1;i<=5;i++){
    ['cliente','prioridade','acao','prazo'].forEach(key => {
      const el = document.getElementById(`op-cli${i}_${key}`);
      if(el) el.classList.toggle('field-error', invalidIds.has(`op-cli${i}_${key}`));
    });
  }
}
function getCriticalClientValidationMessage(validation){
  if(!validation || validation.isValid) return '';
  const sample = validation.issues.slice(0,3).join(' | ');
  const more = validation.issues.length > 3 ? ` (+${validation.issues.length - 3} pendÃªncia(s))` : '';
  return sample + more;
}

function countBloqueios(){
  let total = 0;
  total += parseNum('tec_aguardando_peca');
  total += parseNum('tec_aguardando_cliente');
  total += parseNum('tec_reincidentes');
  total += parseNum('tec_parados');
  total += parseNum('adm_qtd_pecas');
  total += parseNum('adm_qtd_mov');
  total += parseNum('adm_qtd_notas');
  total += parseNum('adm_qtd_sc');
  total += parseNum('adm_qtd_ctf');
  total += parseNum('adm_qtd_cliente');
  total += parseNum('adm_qtd_terceiros');
  return total;
}

function areaMaisPressionada(){
  const op = severityValue(document.getElementById('op_status').value);
  const tec = severityValue(document.getElementById('tec_status').value);
  const adm = severityValue(document.getElementById('adm_status').value);
  const max = Math.max(op, tec, adm);
  if(max === tec) return 'TÃ©cnica';
  if(max === adm) return 'Administrativa';
  return 'OperaÃ§Ã£o';
}

function principalBloqueio(){
  if(parseNum('tec_aguardando_peca') > 0) return 'Aguardando peÃ§a';
  if(parseNum('tec_aguardando_cliente') > 0) return 'Aguardando cliente';
  if(parseNum('tec_reincidentes') > 0) return 'Casos reincidentes';
  if(parseNum('adm_qtd_pecas') > 0) return 'PeÃ§as pendentes';
  if(parseNum('adm_qtd_notas') > 0) return 'Notas pendentes';
  if(parseNum('adm_qtd_ctf') > 0) return 'CTFs crÃ­ticos';
  if(parseNum('adm_qtd_terceiros') > 0) return 'DependÃªncia de terceiros';
  return 'Sem bloqueio relevante';
}

function origemRisco(){
  let tecScore = 0, admScore = 0, opScore = 0;
  tecScore += severityValue(fieldValue('tec_status'));
  admScore += severityValue(fieldValue('adm_status'));
  opScore += severityValue(fieldValue('op_status'));
  tecScore += countYes(['tec_bloq_peca','tec_bloq_acesso','tec_bloq_infra','tec_bloq_sistema','tec_bloq_retorno']);
  admScore += (parseNum('adm_qtd_pecas') > 0 ? 2 : 0)
    + (parseNum('adm_qtd_mov') > 0 ? 2 : 0)
    + (parseNum('adm_qtd_notas') > 0 ? 1 : 0)
    + (parseNum('adm_qtd_sc') > 0 ? 1 : 0);
  opScore += isYes('op_risco_cliente') ? 2 : 0;
  const max = Math.max(tecScore, admScore, opScore);
  if(max === tecScore) return 'TÃ©cnica';
  if(max === admScore) return 'Administrativa';
  return 'OperaÃ§Ã£o';
}
function countYes(ids){ return ids.filter(id=>isYes(id)).length; }


function defaultAgendaDates(){
  const base = document.getElementById('ag_data_base').value || loadedRecordDate || todayKey;
  for(let i=1;i<=6;i++){
    const el = document.getElementById(`ag${i}_data`);
    if(el && !el.value) el.value = base;
  }
}
function flagClass(flag){
  const key = (flag || 'Normal').toLowerCase().replace('Ã­','i').replace('Ã§','c').replace(/\s+/g,'-');
  if(key === 'critico') return 'flag-critico';
  if(key === 'atencao') return 'flag-atencao';
  if(key === 'stand-by' || key === 'standby') return 'flag-stand-by';
  return 'flag-normal';
}
function getAgendaEventsFromData(data = {}, fallbackDate=''){
  const events = [];
  for(let i=1;i<=6;i++){
    const title = (data[`ag${i}_titulo`] || '').trim();
    const date = data[`ag${i}_data`] || fallbackDate;
    const start = data[`ag${i}i`] || '';
    const end = data[`ag${i}f`] || '';
    const flag = data[`ag${i}_flag`] || 'Normal';
    const detail = (data[`ag${i}_detalhe`] || '').trim();
    if(title && date){
      events.push({title, date, start, end, flag, detail, sortKey:`${date}-${start || '99:99'}-${i}`});
    }
  }
  return events.sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
}
function getAllAgendaEvents(){
  const store = getStore();
  const events = [];
  Object.keys(store).forEach(dateKey=>{
    const data = (store[dateKey] && store[dateKey].data) || {};
    events.push(...getAgendaEventsFromData(data, dateKey));
  });
  const currentUnsaved = collectForm();
  const unsavedEvents = getAgendaEventsFromData(currentUnsaved, document.getElementById('ag_data_base').value || loadedRecordDate || todayKey);
  const savedToday = new Set(events.filter(e=>e.date === (loadedRecordDate || todayKey)).map(e=>`${e.date}|${e.start}|${e.end}|${e.title}|${e.flag}|${e.detail}`));
  unsavedEvents.forEach(e=>{
    const sig = `${e.date}|${e.start}|${e.end}|${e.title}|${e.flag}|${e.detail}`;
    if(!savedToday.has(sig)) events.push(e);
  });
  return events.sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
}
function renderAgendaMonth(){
  const grid = document.getElementById('agendaMonthGrid');
  if(!grid) return;
  const monthStart = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth(), 1);
  const monthEnd = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth()+1, 0);
  const firstGridDay = new Date(monthStart);
  firstGridDay.setDate(monthStart.getDate() - monthStart.getDay());
  const lastGridDay = new Date(monthEnd);
  lastGridDay.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
  const allEvents = getAllAgendaEvents();
  const monthName = currentCalendarMonth.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  document.getElementById('agendaMonthTitle').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const stats = {total:0, critico:0, atencao:0, standby:0};
  grid.innerHTML = '';
  for(let day = new Date(firstGridDay); day <= lastGridDay; day.setDate(day.getDate()+1)){
    const iso = day.toISOString().slice(0,10);
    const dayEvents = allEvents.filter(e=>e.date === iso);
    dayEvents.forEach(e=>{
      if(e.flag === 'CrÃ­tico') stats.critico++;
      else if(e.flag === 'AtenÃ§Ã£o') stats.atencao++;
      else if(e.flag === 'Stand-by') stats.standby++;
      stats.total++;
    });
    const cell = document.createElement('div');
    cell.className = 'agenda-day' + (day.getMonth() !== currentCalendarMonth.getMonth() ? ' other-month' : '') + (iso === todayKey ? ' today' : '');
    const head = document.createElement('div');
    head.className = 'agenda-day-head';
    head.innerHTML = `<span class="agenda-day-number">${day.getDate()}</span><span class="agenda-day-count">${dayEvents.length} item(ns)</span>`;
    const eventsWrap = document.createElement('div');
    eventsWrap.className = 'agenda-events';
    if(dayEvents.length){
      dayEvents.slice(0,4).forEach(evt=>{
        const item = document.createElement('div');
        const cls = flagClass(evt.flag);
        const timeTxt = evt.start && evt.end ? `${evt.start}â€“${evt.end}` : (evt.start || 'Sem hora');
        item.className = `agenda-event ${cls}`;
        item.innerHTML = `
          <div class="agenda-event-top">
            <span class="agenda-event-time">${timeTxt}</span>
            <span class="agenda-event-flag ${cls}">${evt.flag}</span>
          </div>
          <div class="agenda-event-title">${evt.title}</div>
          <div class="agenda-event-detail">${evt.detail || 'Sem detalhe complementar'}</div>
        `;
        eventsWrap.appendChild(item);
      });
      if(dayEvents.length > 4){
        const more = document.createElement('div');
        more.className = 'agenda-empty';
        more.textContent = `+ ${dayEvents.length - 4} item(ns)`;
        eventsWrap.appendChild(more);
      }
    }else{
      const empty = document.createElement('div');
      empty.className = 'agenda-empty';
      empty.textContent = 'Sem agendamento';
      eventsWrap.appendChild(empty);
    }
    cell.appendChild(head);
    cell.appendChild(eventsWrap);
    grid.appendChild(cell);
  }
  document.getElementById('agendaStatTotal').textContent = stats.total;
  document.getElementById('agendaStatCritico').textContent = stats.critico;
  document.getElementById('agendaStatAtencao').textContent = stats.atencao;
  document.getElementById('agendaStatStandby').textContent = stats.standby;
}
function changeCalendarMonth(offset){
  currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth()+offset, 1);
  renderAgendaMonth();
}
function goToTodayMonth(){
  currentCalendarMonth = new Date(todayKey + 'T00:00:00');
  renderAgendaMonth();
}

function buildConsolidation(){
  const opStatus = document.getElementById('op_status').value;
  const tecStatus = document.getElementById('tec_status').value;
  const admStatus = document.getElementById('adm_status').value;
  const maxSeverity = Math.max(severityValue(opStatus), severityValue(tecStatus), severityValue(admStatus));

  let score = 0;
  score += severityValue(opStatus) + severityValue(tecStatus) + severityValue(admStatus);
  score += impactValue(document.getElementById('tec_impacto').value);
  score += impactValue(document.getElementById('adm_impacto').value);
  score += isYes('op_risco_cliente') ? 2 : 0;
  score += isYes('op_risco_escalonamento') ? 2 : 0;
  score += isYes('op_risco_atraso') ? 2 : 0;
  score += isYes('tec_risco_cliente') ? 2 : 0;
  score += isYes('tec_escalonamento') ? 2 : 0;
  score += isYes('tec_apoio_gestor') ? 1 : 0;
  score += isYes('adm_risco_cliente') ? 2 : 0;
  score += isYes('adm_apoio_gestor') ? 1 : 0;
  score += isYes('adm_dep_terceiros') ? 1 : 0;
  score += countBloqueios();
  score += parseNum('tec_parados');
  score += parseNum('adm_qtd_pend') >= 3 ? 2 : parseNum('adm_qtd_pend') >= 1 ? 1 : 0;
  score += parseNum('adm_qtd_ctf') >= 2 ? 2 : parseNum('adm_qtd_ctf') >= 1 ? 1 : 0;
  score += parseNum('tec_reincidentes') >= 2 ? 2 : parseNum('tec_reincidentes') >= 1 ? 1 : 0;

  const statusGeral = severityLabel(maxSeverity + (score >= 18 ? 1 : 0) - (score <= 5 ? 1 : 0));
  const bloqueio = principalBloqueio();
  const origem = origemRisco();

  let impacto = 'Sem impacto relevante';
  if(isYes('op_risco_cliente') || isYes('tec_risco_cliente') || isYes('adm_risco_cliente')) impacto = 'Desgaste com cliente';
  if(isYes('op_risco_atraso')) impacto = 'Atraso operacional';
  if(document.getElementById('op_sla').value && parseNum('op_sla') < 90) impacto = 'Risco de quebra de SLA';
  if(parseNum('tec_reincidentes') > 0) impacto = 'ReincidÃªncia e retrabalho';

  let acao = 'Acompanhamento normal da operaÃ§Ã£o';
  if(statusGeral === 'CrÃ­tica') acao = 'AtuaÃ§Ã£o imediata do gestor com escalonamento e controle de retorno';
  else if(statusGeral === 'Pressionada') acao = 'Priorizar casos crÃ­ticos e redistribuir acompanhamento';
  if(bloqueio.includes('peÃ§a')) acao = 'Destravar peÃ§a/liberaÃ§Ã£o e revalidar atendimento';
  if(origem === 'TÃ©cnica' && isYes('tec_escalonamento')) acao = 'Escalonar tratativas tÃ©cnicas e reforÃ§ar suporte ao campo';

  const qtdClientesCriticos = parseNum('op_qtd_clientes_criticos');
  const detalheClienteCritico = getCriticalClientActionSummary();
  const criticidade = riskLevel(score);
  const clienteBase = getPrimaryCriticalClientName();
  const clienteSensivel = clienteBase === '--' ? 'NÃ£o informado' : clienteBase;
  const precisaEscalonamento = isYes('op_risco_escalonamento') || isYes('tec_escalonamento') ? 'Sim' : 'NÃ£o';
  const dependeGestor = isYes('tec_apoio_gestor') || isYes('adm_apoio_gestor') ? 'Sim' : 'NÃ£o';

  return {score, statusGeral, origem, bloqueio, impacto, acao, criticidade, clienteSensivel, precisaEscalonamento, dependeGestor, qtdClientesCriticos, detalheClienteCritico};
}

function classForStatus(status){
  if(status === 'CrÃ­tica') return 'status-critica';
  if(status === 'Pressionada') return 'status-pressionada';
  if(status === 'AtenÃ§Ã£o') return 'status-atencao';
  return 'status-estavel';
}

function autoFillDiagnostic(cons){
  document.getElementById('diag_area_mais').textContent = areaMaisPressionada();
  document.getElementById('diag_origem').textContent = cons.origem;
  document.getElementById('diag_impacto').textContent = cons.impacto;
  document.getElementById('diag_bloqueio').textContent = cons.bloqueio;
  document.getElementById('diag_criticidade').textContent = cons.criticidade;

  const leitura = [
    `Status geral consolidado: ${cons.statusGeral}.`,
    `Ãrea mais pressionada: ${areaMaisPressionada()}.`,
    `Principal origem do risco: ${cons.origem}.`,
    `Impacto predominante identificado: ${cons.impacto}.`,
    `Bloqueio principal: ${cons.bloqueio}.`,
    `Cliente mais sensÃ­vel: ${cons.clienteSensivel}.`,
    `Clientes crÃ­ticos em acompanhamento: ${cons.qtdClientesCriticos}.`,
    `Escalonamento necessÃ¡rio: ${cons.precisaEscalonamento}.`,
    `DependÃªncia do gestor: ${cons.dependeGestor}.`,
    `AÃ§Ã£o prioritÃ¡ria sugerida: ${cons.acao}.`,
    cons.detalheClienteCritico ? `Detalhe do cliente crÃ­tico: ${cons.detalheClienteCritico}.` : ''
  ].join(' ');
  document.getElementById('diag_leitura').value = leitura;

  document.getElementById('diag_operacao').value =
    `Status ${document.getElementById('op_status').value || 'nÃ£o informado'}, volume ${document.getElementById('op_volume').value || 'nÃ£o informado'}, ${cons.qtdClientesCriticos} cliente(s) crÃ­tico(s) em acompanhamento, cliente principal ${cons.clienteSensivel}, prioridade principal ${document.getElementById('op_prioridade1').value || 'nÃ£o informada'}${cons.detalheClienteCritico ? `, detalhe ${cons.detalheClienteCritico}` : ''}.`;

  document.getElementById('diag_tecnico').value =
    `Ãrea tÃ©cnica ${document.getElementById('tec_status').value || 'nÃ£o informada'}, tÃ©cnicos parados ${parseNum('tec_parados')}, tickets externos em acompanhamento e bloqueio principal em ${cons.origem === 'TÃ©cnica' ? cons.bloqueio : 'monitoramento tÃ©cnico'}.`;

  document.getElementById('diag_adm').value =
    `Ãrea administrativa ${fieldValue('adm_status') || 'nÃ£o informada'}, pendÃªncias crÃ­ticas ${parseNum('adm_qtd_pend')}, CTFs crÃ­ticos ${parseNum('adm_qtd_ctf')}, peÃ§as pendentes ${parseNum('adm_qtd_pecas')}.`;

  document.getElementById('diag_risco_atraso').value = isYes('op_risco_atraso') ? 'Alto' : 'MÃ©dio';
  document.getElementById('diag_risco_retrabalho').value = parseNum('tec_reincidentes') > 0 ? 'Alto' : 'MÃ©dio';
  document.getElementById('diag_risco_cliente').value = (isYes('op_risco_cliente') || isYes('tec_risco_cliente') || isYes('adm_risco_cliente')) ? 'Alto' : 'Baixo';
  document.getElementById('diag_risco_sla').value = parseNum('op_sla') < 90 ? 'Alto' : 'Baixo';
  document.getElementById('diag_risco_escalonamento').value = cons.precisaEscalonamento === 'Sim' ? 'Alto' : 'Baixo';
  document.getElementById('diag_risco_fin').value = document.getElementById('adm_status').value === 'CrÃ­tica' ? 'Alto' : 'MÃ©dio';

  document.getElementById('diag_acao').value = cons.acao;
  document.getElementById('diag_responsavel').value = cons.origem === 'TÃ©cnica' ? 'LÃ­der TÃ©cnico' : cons.origem === 'Administrativa' ? 'Administrativo' : 'Gestor';
  document.getElementById('diag_apoio').value = cons.origem === 'TÃ©cnica' ? 'Gestor / Administrativo' : cons.origem === 'Administrativa' ? 'Gestor / TÃ©cnico' : 'TÃ©cnico / Administrativo';
  document.getElementById('diag_escalonamento').value = cons.precisaEscalonamento;
}


function metricNumberFromData(data, id){
  const v = parseFloat(data[id] || 0);
  return isNaN(v) ? 0 : v;
}
function hasDataValue(data, id){
  return Object.prototype.hasOwnProperty.call(data || {}, id) && String((data || {})[id] ?? '').trim() !== '';
}
function resolveAnalysisCount(manualValue, importedValue, hasImportSummary){
  const manual = Math.max(0, Number.isFinite(Number(manualValue)) ? Number(manualValue) : 0);
  const imported = Math.max(0, Number.isFinite(Number(importedValue)) ? Number(importedValue) : 0);
  if(hasImportSummary) return Math.max(manual, imported);
  return manual > 0 ? manual : imported;
}
function resolveAnalysisPercent(manualValue, importedValue){
  const manual = Number(manualValue);
  if(Number.isFinite(manual)) return Math.max(0, Math.min(100, manual));
  const imported = Number(importedValue);
  if(Number.isFinite(imported)) return Math.max(0, Math.min(100, imported));
  return 0;
}
function countOpenTicketsFromData(data){
  let total = 0;
  [1,2,3].forEach(i=>{
    const status = (data[`tec-ticket${i}_status`] || '').trim();
    const numberRef = (data[`tec-ticket${i}_num`] || '').trim();
    const legacyCode = (data[`tec-ticket${i}_codigo`] || '').trim();
    if((numberRef || legacyCode) && !['Resolvido','Finalizado','Encerrado'].includes(status)) total++;
  });
  return total;
}
function countCriticalTicketsFromData(data){
  let total = 0;
  [1,2,3].forEach(i=>{ if((data[`tec-ticket${i}_impacto`] || '') === 'CrÃ­tico') total++; });
  return total;
}
function countLateOrdersFromData(data, refIso){
  const todayIso = (refIso || loadedRecordDate || todayKey);
  let total = 0;
  const blocks = [['tec-peca',3,'Recebido'],['adm-peca',3,'Recebido']];
  blocks.forEach(([prefix,max,doneStatus])=>{
    for(let i=1;i<=max;i++){
      const prazo = (data[`${prefix}${i}_prazo`] || '').trim();
      const status = (data[`${prefix}${i}_status`] || '').trim();
      if(prazo && prazo < todayIso && ![doneStatus,'Resolvido','Finalizado'].includes(status)) total++;
    }
  });
  return total;
}
function calcExecucaoFromData(data){
  const ids = ['op_exec1','op_exec2','op_exec3','op_exec4','op_exec5'];
  let ok = 0;
  let answered = 0;
  ids.forEach(id=>{
    const value = String(data[id] || '').trim();
    if(!value) return;
    answered++;
    if(value === 'Sim') ok++;
  });
  if(!answered) return null;
  return Math.round((ok / ids.length) * 100);
}
function countAdminPendenciasFromData(data){
  return metricNumberFromData(data,'adm_qtd_pecas') + metricNumberFromData(data,'adm_qtd_mov') + metricNumberFromData(data,'adm_qtd_notas') + metricNumberFromData(data,'adm_qtd_sc') + metricNumberFromData(data,'adm_qtd_emails') + metricNumberFromData(data,'adm_qtd_ctf') + metricNumberFromData(data,'adm_qtd_cliente') + metricNumberFromData(data,'adm_qtd_terceiros');
}
function countPendenciasClienteFromData(data){
  return metricNumberFromData(data,'tec_aguardando_cliente') + metricNumberFromData(data,'adm_qtd_cliente');
}
function getStoredRecordDataForDate(dateKey){
  const store = getStore() || {};
  const data = store?.[dateKey]?.data;
  return data && typeof data === 'object' ? data : {};
}
function getActiveMergedRecordData(dateKey){
  const normalizedDate = dateKey || loadedRecordDate || todayKey;
  const savedData = getStoredRecordDataForDate(normalizedDate);
  const currentData = collectForm();
  return normalizeOperationData({ ...savedData, ...currentData });
}
function buildAnalysisMetricsFromData(data, refIso){
  const normalized = normalizeOperationData(data || {});
  const hasImportSummary = metricNumberFromData(normalized, 'import_summary_rows') > 0;
  const criticos = resolveAnalysisCount(
    metricNumberFromData(normalized, 'op_criticos'),
    metricNumberFromData(normalized, 'import_summary_criticos'),
    hasImportSummary
  );
  const reincidencias = resolveAnalysisCount(
    metricNumberFromData(normalized, 'op_reinc'),
    metricNumberFromData(normalized, 'import_summary_reincidencias'),
    hasImportSummary
  );
  const tickets = resolveAnalysisCount(
    countOpenTicketsFromData(normalized),
    metricNumberFromData(normalized, 'import_summary_tickets_pendentes'),
    hasImportSummary
  );
  const atrasos = resolveAnalysisCount(
    countLateOrdersFromData(normalized, refIso),
    metricNumberFromData(normalized, 'import_summary_pedidos_atraso'),
    hasImportSummary
  );
  const pendAdm = resolveAnalysisCount(
    countAdminPendenciasFromData(normalized),
    metricNumberFromData(normalized, 'import_summary_pendencias_adm'),
    hasImportSummary
  );
  const slaManual = hasDataValue(normalized, 'op_sla') ? metricNumberFromData(normalized, 'op_sla') : NaN;
  const slaImport = hasDataValue(normalized, 'import_summary_sla') ? metricNumberFromData(normalized, 'import_summary_sla') : NaN;
  const execManual = calcExecucaoFromData(normalized);
  const execImport = hasDataValue(normalized, 'import_summary_execucao') ? metricNumberFromData(normalized, 'import_summary_execucao') : NaN;
  const sla = resolveAnalysisPercent(slaManual, slaImport);
  const exec = resolveAnalysisPercent(execManual, execImport);
  return {
    criticos,
    reincidencias,
    tickets,
    atrasos,
    sla,
    exec,
    pendAdm
  };
}
function getMonthDataRecords(){
  const refDate = loadedRecordDate || todayKey;
  const ym = refDate.slice(0,7);
  const store = getStore();
  const records = [];
  Object.keys(store).sort().forEach(dateKey=>{
    if(dateKey.slice(0,7) === ym && store[dateKey] && store[dateKey].data) records.push({dateKey, data: store[dateKey].data});
  });
  const currentData = getActiveMergedRecordData(refDate);
  const idx = records.findIndex(r=>r.dateKey === refDate);
  if(idx >= 0) records[idx] = {dateKey: refDate, data: currentData};
  else if(refDate.slice(0,7) === ym) records.push({dateKey: refDate, data: currentData});
  return records.sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
}
function avg(arr){ return arr.length ? (arr.reduce((a,b)=>a+b,0) / arr.length) : 0; }
function fmt1(n){ return (Math.round(n * 10) / 10).toFixed(1).replace('.',','); }
function updateMonthInsights(){
  const activeDate = (document.getElementById('currentDateInput')?.value || loadedRecordDate || todayKey).trim() || todayKey;
  if(isBackendModeActive()){
    const snapshot = getBackendDashboardSnapshot(activeDate);
    const month = snapshot?.month;
    if(month){
      const monthComparativo = (snapshot?.comparativo?.month && typeof snapshot.comparativo.month === 'object')
        ? snapshot.comparativo.month
        : null;
      const monthKey = String(month.monthKey || activeDate.slice(0,7));
      let mesRef = monthKey;
      try{
        const refDate = new Date(`${monthKey}-01T00:00:00`);
        mesRef = refDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
        mesRef = mesRef.charAt(0).toUpperCase() + mesRef.slice(1);
      }catch(_){}
      const trendText = String(month.trend || '').trim();
      const summaryText = String(month.summary || '').trim() || String(monthComparativo?.summary || '').trim();
      document.getElementById('mesRefLabel').textContent = 'Base mensal: ' + mesRef;
      document.getElementById('mesDiasSalvos').textContent = Math.round(Number(month.sampleDays || 0));
      document.getElementById('mesMediaCriticos').textContent = fmt1(Number(month.avgCriticos || 0));
      document.getElementById('mesMediaSla').textContent = Math.round(Number(month.avgSla || 0)) + '%';
      document.getElementById('mesMediaExec').textContent = Math.round(Number(month.avgExecucao || 0)) + '%';
      document.getElementById('mesMediaTickets').textContent = fmt1(Number(month.avgTickets || 0));
      document.getElementById('mesMediaParados').textContent = fmt1(Number(month.avgParados || 0));
      document.getElementById('mesMediaPedidosAtraso').textContent = fmt1(Number(month.avgPedidosAtraso || 0));
      document.getElementById('mesTendencia').textContent = trendText || 'Sem base';
      document.getElementById('mesResumo').textContent = summaryText || 'Mes sem historico suficiente.';
      return;
    }
    document.getElementById('mesRefLabel').textContent = 'Base mensal: --';
    document.getElementById('mesDiasSalvos').textContent = '0';
    document.getElementById('mesMediaCriticos').textContent = '0,0';
    document.getElementById('mesMediaSla').textContent = '0%';
    document.getElementById('mesMediaExec').textContent = '0%';
    document.getElementById('mesMediaTickets').textContent = '0,0';
    document.getElementById('mesMediaParados').textContent = '0,0';
    document.getElementById('mesMediaPedidosAtraso').textContent = '0,0';
    document.getElementById('mesTendencia').textContent = 'Sem base';
    document.getElementById('mesResumo').textContent = 'Aguardando leitura do backend.';
    return;
  }

  const records = getMonthDataRecords();
  const refDate = loadedRecordDate || todayKey;
  const refObj = new Date(refDate + 'T00:00:00');
  const mesLabel = refObj.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  document.getElementById('mesRefLabel').textContent = 'Base mensal: ' + mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  document.getElementById('mesDiasSalvos').textContent = records.length;
  const metricsRows = records.map(r => ({
    dateKey: r.dateKey,
    data: r.data || {},
    metrics: buildAnalysisMetricsFromData(r.data || {}, r.dateKey)
  }));
  const criticos = metricsRows.map(r=>r.metrics.criticos);
  const sla = metricsRows.map(r=>r.metrics.sla);
  const execs = metricsRows.map(r=>r.metrics.exec);
  const tickets = metricsRows.map(r=>r.metrics.tickets);
  const parados = records.map(r=>metricNumberFromData(r.data,'tec_parados'));
  const atrasos = metricsRows.map(r=>r.metrics.atrasos);
  const pendAdm = metricsRows.map(r=>r.metrics.pendAdm);
  const mediaCrit = avg(criticos), mediaSla = avg(sla), mediaExec = avg(execs), mediaTickets = avg(tickets), mediaPar = avg(parados), mediaAtr = avg(atrasos), mediaAdm = avg(pendAdm);
  document.getElementById('mesMediaCriticos').textContent = fmt1(mediaCrit);
  document.getElementById('mesMediaSla').textContent = Math.round(mediaSla) + '%';
  document.getElementById('mesMediaExec').textContent = Math.round(mediaExec) + '%';
  document.getElementById('mesMediaTickets').textContent = fmt1(mediaTickets);
  document.getElementById('mesMediaParados').textContent = fmt1(mediaPar);
  document.getElementById('mesMediaPedidosAtraso').textContent = fmt1(mediaAtr);
  let tendencia = 'EstÃ¡vel';
  let resumo = 'MÃªs ainda sem massa crÃ­tica para leitura mais profunda.';
  if(metricsRows.length >= 2){
    const last = metricsRows[metricsRows.length-1];
    const prev = metricsRows[metricsRows.length-2];
    const atualPressao = last.metrics.criticos + last.metrics.tickets + metricNumberFromData(last.data,'tec_parados') + last.metrics.atrasos;
    const anteriorPressao = prev.metrics.criticos + prev.metrics.tickets + metricNumberFromData(prev.data,'tec_parados') + prev.metrics.atrasos;
    if(atualPressao > anteriorPressao) tendencia = 'PressÃ£o subiu';
    else if(atualPressao < anteriorPressao) tendencia = 'Melhora';
    resumo = `MÃ©dia adm.: ${fmt1(mediaAdm)} Â· Atual vs. dia anterior: ${atualPressao > anteriorPressao ? 'pressÃ£o maior' : atualPressao < anteriorPressao ? 'pressÃ£o menor' : 'estÃ¡vel'}.`;
  }
  document.getElementById('mesTendencia').textContent = tendencia;
  document.getElementById('mesResumo').textContent = resumo;
}

function getComparisonMetrics(data, refDate){
  const metrics = buildAnalysisMetricsFromData(data || {}, refDate || loadedRecordDate || todayKey);
  return {
    criticos: metrics.criticos,
    tickets: metrics.tickets,
    atrasos: metrics.atrasos,
    sla: metrics.sla,
    exec: metrics.exec
  };
}

function formatDeltaLabel(delta, options){
  const opts = options || {};
  const higherIsBetter = !!opts.higherIsBetter;
  const decimals = Number.isFinite(opts.decimals) ? opts.decimals : 0;
  const suffix = opts.suffix || '';
  const neutralThreshold = Number.isFinite(opts.neutralThreshold) ? opts.neutralThreshold : 0.01;
  const abs = Math.abs(delta);

  if(abs <= neutralThreshold){
    return { text: '0 â€¢ EstÃ¡vel', tone: 'info' };
  }

  const rounded = decimals > 0
    ? (Math.round(delta * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals).replace('.', ',')
    : String(Math.round(delta));
  const signed = (delta > 0 ? '+' : '') + rounded + suffix;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return {
    text: signed + (improved ? ' â€¢ Melhor' : ' â€¢ Pior'),
    tone: improved ? 'good' : 'bad'
  };
}

function setComparePill(id, delta, options){
  const el = document.getElementById(id);
  if(!el) return;
  const label = formatDeltaLabel(delta, options);
  el.className = 'compare-pill ' + label.tone;
  el.textContent = label.text;
}

function setComparePlaceholder(id, text){
  const el = document.getElementById(id);
  if(!el) return;
  el.className = 'compare-pill info';
  el.textContent = text || 'Sem base';
}

function updateComparativoInsights(){
  const refDate = (document.getElementById('currentDateInput')?.value || loadedRecordDate || todayKey).trim() || todayKey;
  if(isBackendModeActive()){
    const snapshot = getBackendDashboardSnapshot(refDate);
    const dayCmp = snapshot?.comparativo?.day;
    const monthCmp = snapshot?.comparativo?.month;
    if(dayCmp?.hasBase && dayCmp.refDate){
      setTextIfPresent('cmpDiaDataRef', formatDate(dayCmp.refDate));
      setComparePill('cmpDiaCriticos', Number(dayCmp.deltas?.criticos || 0), { higherIsBetter: false });
      setComparePill('cmpDiaTickets', Number(dayCmp.deltas?.tickets || 0), { higherIsBetter: false });
      setComparePill('cmpDiaAtrasos', Number(dayCmp.deltas?.atrasos || 0), { higherIsBetter: false });
      setComparePill('cmpDiaSla', Number(dayCmp.deltas?.sla || 0), { higherIsBetter: true, suffix: ' p.p.' });
      setComparePill('cmpDiaExec', Number(dayCmp.deltas?.execucao || 0), { higherIsBetter: true, suffix: ' p.p.' });
      setTextIfPresent('cmpDiaResumo', dayCmp.summary || `Comparativo automatico entre ${formatDate(refDate)} e ${formatDate(dayCmp.refDate)}.`);
    }else{
      setTextIfPresent('cmpDiaDataRef', 'Sem dia anterior salvo');
      setComparePlaceholder('cmpDiaCriticos', 'Sem base');
      setComparePlaceholder('cmpDiaTickets', 'Sem base');
      setComparePlaceholder('cmpDiaAtrasos', 'Sem base');
      setComparePlaceholder('cmpDiaSla', 'Sem base');
      setComparePlaceholder('cmpDiaExec', 'Sem base');
      setTextIfPresent('cmpDiaResumo', dayCmp?.summary || 'Salve ao menos um dia anterior para liberar o comparativo diario.');
    }

    if(monthCmp?.hasBase){
      const monthKey = String(snapshot?.month?.monthKey || refDate.slice(0,7));
      let mesLabel = monthKey;
      try{
        const refObj = new Date(`${monthKey}-01T00:00:00`);
        mesLabel = refObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        mesLabel = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
      }catch(_){}
      setTextIfPresent('cmpMesDataRef', 'Media de ' + mesLabel);
      setComparePill('cmpMesCriticos', Number(monthCmp.deltas?.criticos || 0), { higherIsBetter: false, decimals: 1 });
      setComparePill('cmpMesTickets', Number(monthCmp.deltas?.tickets || 0), { higherIsBetter: false, decimals: 1 });
      setComparePill('cmpMesAtrasos', Number(monthCmp.deltas?.atrasos || 0), { higherIsBetter: false, decimals: 1 });
      setComparePill('cmpMesSla', Number(monthCmp.deltas?.sla || 0), { higherIsBetter: true, decimals: 1, suffix: ' p.p.' });
      setComparePill('cmpMesExec', Number(monthCmp.deltas?.execucao || 0), { higherIsBetter: true, decimals: 1, suffix: ' p.p.' });
      setTextIfPresent('cmpMesResumo', monthCmp.summary || `Comparativo do dia contra media de ${Math.round(Number(monthCmp.baseDays || 0))} dia(s) do mes.`);
    }else{
      setTextIfPresent('cmpMesDataRef', 'Sem historico mensal');
      setComparePlaceholder('cmpMesCriticos', 'Sem base');
      setComparePlaceholder('cmpMesTickets', 'Sem base');
      setComparePlaceholder('cmpMesAtrasos', 'Sem base');
      setComparePlaceholder('cmpMesSla', 'Sem base');
      setComparePlaceholder('cmpMesExec', 'Sem base');
      setTextIfPresent('cmpMesResumo', monthCmp?.summary || 'Salve mais dias do mes para liberar o comparativo mensal.');
    }
    return;
  }

  const currentData = collectForm();
  const currentMetrics = getComparisonMetrics(currentData, refDate);
  const store = getStore() || {};
  const previousDates = Object.keys(store)
    .filter(dateKey => dateKey < refDate && store?.[dateKey]?.data)
    .sort();
  const prevDate = previousDates.length ? previousDates[previousDates.length - 1] : '';

  if(prevDate){
    const prevMetrics = getComparisonMetrics(store[prevDate].data || {}, prevDate);
    setTextIfPresent('cmpDiaDataRef', formatDate(prevDate));
    setComparePill('cmpDiaCriticos', currentMetrics.criticos - prevMetrics.criticos, { higherIsBetter: false });
    setComparePill('cmpDiaTickets', currentMetrics.tickets - prevMetrics.tickets, { higherIsBetter: false });
    setComparePill('cmpDiaAtrasos', currentMetrics.atrasos - prevMetrics.atrasos, { higherIsBetter: false });
    setComparePill('cmpDiaSla', currentMetrics.sla - prevMetrics.sla, { higherIsBetter: true, suffix: ' p.p.' });
    setComparePill('cmpDiaExec', currentMetrics.exec - prevMetrics.exec, { higherIsBetter: true, suffix: ' p.p.' });
    setTextIfPresent('cmpDiaResumo', `Comparativo automÃ¡tico entre ${formatDate(refDate)} e ${formatDate(prevDate)}.`);
  }else{
    setTextIfPresent('cmpDiaDataRef', 'Sem dia anterior salvo');
    setComparePlaceholder('cmpDiaCriticos', 'Sem base');
    setComparePlaceholder('cmpDiaTickets', 'Sem base');
    setComparePlaceholder('cmpDiaAtrasos', 'Sem base');
    setComparePlaceholder('cmpDiaSla', 'Sem base');
    setComparePlaceholder('cmpDiaExec', 'Sem base');
    setTextIfPresent('cmpDiaResumo', 'Salve ao menos um dia anterior para liberar o comparativo diÃ¡rio.');
  }

  const monthRecords = getMonthDataRecords();
  const monthBase = monthRecords.filter(r => r.dateKey !== refDate);
  if(monthBase.length){
    const averages = {
      criticos: avg(monthBase.map(r => getComparisonMetrics(r.data || {}, r.dateKey).criticos)),
      tickets: avg(monthBase.map(r => getComparisonMetrics(r.data || {}, r.dateKey).tickets)),
      atrasos: avg(monthBase.map(r => getComparisonMetrics(r.data || {}, r.dateKey).atrasos)),
      sla: avg(monthBase.map(r => getComparisonMetrics(r.data || {}, r.dateKey).sla)),
      exec: avg(monthBase.map(r => getComparisonMetrics(r.data || {}, r.dateKey).exec))
    };

    const refObj = new Date(refDate + 'T00:00:00');
    const mesLabel = refObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    setTextIfPresent('cmpMesDataRef', 'MÃ©dia de ' + mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1));
    setComparePill('cmpMesCriticos', currentMetrics.criticos - averages.criticos, { higherIsBetter: false, decimals: 1 });
    setComparePill('cmpMesTickets', currentMetrics.tickets - averages.tickets, { higherIsBetter: false, decimals: 1 });
    setComparePill('cmpMesAtrasos', currentMetrics.atrasos - averages.atrasos, { higherIsBetter: false, decimals: 1 });
    setComparePill('cmpMesSla', currentMetrics.sla - averages.sla, { higherIsBetter: true, decimals: 1, suffix: ' p.p.' });
    setComparePill('cmpMesExec', currentMetrics.exec - averages.exec, { higherIsBetter: true, decimals: 1, suffix: ' p.p.' });
    setTextIfPresent('cmpMesResumo', `Comparativo de hoje contra a mÃ©dia de ${monthBase.length} dia(s) salvo(s) do mÃªs.`);
  }else{
    setTextIfPresent('cmpMesDataRef', 'Sem histÃ³rico mensal');
    setComparePlaceholder('cmpMesCriticos', 'Sem base');
    setComparePlaceholder('cmpMesTickets', 'Sem base');
    setComparePlaceholder('cmpMesAtrasos', 'Sem base');
    setComparePlaceholder('cmpMesSla', 'Sem base');
    setComparePlaceholder('cmpMesExec', 'Sem base');
    setTextIfPresent('cmpMesResumo', 'Salve mais dias do mÃªs para liberar o comparativo mensal.');
  }
}

function updatePanel(cons){
  const activeDate = (document.getElementById('currentDateInput')?.value || loadedRecordDate || todayKey).trim() || todayKey;
  if(isBackendModeActive()){
    const snapshot = getBackendDashboardSnapshot(activeDate);
    const daily = snapshot?.daily;
    if(daily){
      const setTxt = (id, value, fallback='0')=>{
        const el = document.getElementById(id);
        if(!el) return;
        const raw = value == null ? '' : String(value);
        const normalized = raw.trim();
        el.textContent = normalized === '' ? fallback : normalized;
      };
      const setNum = (id, value)=>setTxt(id, Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : '0', '0');

      setNum('kCriticos', daily.kCriticos);
      setNum('kReinc', daily.kReinc);
      setTxt('kSla', `${Math.round(Number(daily.kSla || 0))}%`);
      setTxt('kExec', `${Math.round(Number(daily.kExec || 0))}%`);
      setNum('kBloqueios', daily.kBloqueios);
      setNum('kTicketsPendentes', daily.kTicketsPendentes);
      setNum('kTecnicosCampo', daily.kTecnicosCampo);
      setNum('kTecnicosParados', daily.kTecnicosParados);
      setNum('kPedidosAtraso', daily.kPedidosAtraso);
      setNum('kPendenciasCliente', daily.kPendenciasCliente);
      setNum('kPendenciasAdm', daily.kPendenciasAdm);
      setTxt('kRisco', daily.kRisco, '--');

      setTxt('painelAreaPressionada', daily.painelAreaPressionada, '--');
      setTxt('painelOrigemRisco', daily.painelOrigemRisco, '--');
      setTxt('painelBloqueio', daily.painelBloqueio, '--');
      setTxt('painelImpacto', daily.painelImpacto, '--');
      setTxt('painelAcao', daily.painelAcao, '--');
      setTxt('painelClienteSensivel', daily.painelClienteSensivel, '--');
      setTxt('painelEscalonamento', daily.painelEscalonamento, '--');
      setTxt('painelDependenciaGestor', daily.painelDependenciaGestor, '--');
      setNum('scoreConsolidado', daily.scoreConsolidado);

      setNum('painelTicketsResumo', daily.painelTicketsResumo);
      setNum('painelPedidosResumo', daily.painelPedidosResumo);
      setTxt('painelTecnicosResumo', `${Math.round(Number(daily.painelTecnicosResumoCampo || 0))} / ${Math.round(Number(daily.painelTecnicosResumoParados || 0))}`);
      setNum('painelPecasResumo', daily.painelPecasResumo);
      setNum('painelClienteResumo', daily.painelClienteResumo);
      setNum('painelAdmResumo', daily.painelAdmResumo);
      setNum('painelTicketsCriticos', daily.painelTicketsCriticos);
      setNum('painelCtfCriticos', daily.painelCtfCriticos);
      setNum('painelEmailsCriticos', daily.painelEmailsCriticos);
      setNum('painelMovResumo', daily.painelMovResumo);
      setTxt('painelDocResumo', `${Math.round(Number(daily.painelDocResumoNotas || 0))} / ${Math.round(Number(daily.painelDocResumoSc || 0))}`);
      setTxt('painelClienteCriticoDetalhe', daily.painelClienteCriticoDetalhe, '--');

      setNum('heroTicketsPendentes', daily.heroTicketsPendentes);
      setNum('miniTicketsPendentes', daily.miniTicketsPendentes);
      setNum('heroTicketsCriticos', daily.heroTicketsCriticos);
      setNum('heroTecnicosCampo', daily.heroTecnicosCampo);
      setNum('miniTecnicosCampo', daily.miniTecnicosCampo);
      setNum('heroTecnicosParados', daily.heroTecnicosParados);
      setNum('heroPedidosAtraso', daily.heroPedidosAtraso);
      setNum('miniPedidosAtraso', daily.miniPedidosAtraso);
      setNum('heroPendenciasAdm', daily.heroPendenciasAdm);

      setNum('snapTicketsTotal', daily.snapTicketsTotal);
      setNum('snapTicketsCriticos', daily.snapTicketsCriticos);
      setNum('snapCtf', daily.snapCtf);
      setNum('snapEmails', daily.snapEmails);
      setTxt('snapEscalonamento', daily.snapEscalonamento, '--');
      setNum('snapTecnicosCampo', daily.snapTecnicosCampo);
      setNum('snapTecnicosParados', daily.snapTecnicosParados);
      setNum('snapPeca', daily.snapPeca);
      setNum('snapCliente', daily.snapCliente);
      setNum('snapReinc', daily.snapReinc);
      setNum('snapPendAdm', daily.snapPendAdm);
      setNum('snapMov', daily.snapMov);
      setTxt('snapDocs', `${Math.round(Number(daily.snapDocsNotas || 0))} / ${Math.round(Number(daily.snapDocsSc || 0))}`);
      setNum('snapAtraso', daily.snapAtraso);

      updateMonthInsights();
      updateComparativoInsights();
      return;
    }
    return;
  }

  const analysisData = getActiveMergedRecordData(activeDate);
  const analysisMetrics = buildAnalysisMetricsFromData(analysisData, activeDate);

  document.getElementById('kCriticos').textContent = analysisMetrics.criticos;
  document.getElementById('kReinc').textContent = analysisMetrics.reincidencias + parseNum('tec_reincidentes');
  document.getElementById('kSla').textContent = analysisMetrics.sla + '%';
  document.getElementById('kExec').textContent = analysisMetrics.exec + '%';
  document.getElementById('kBloqueios').textContent = countBloqueios();
  document.getElementById('kTicketsPendentes').textContent = analysisMetrics.tickets;
  document.getElementById('kTecnicosCampo').textContent = parseNum('tec_campo');
  document.getElementById('kTecnicosParados').textContent = parseNum('tec_parados');
  document.getElementById('kPedidosAtraso').textContent = analysisMetrics.atrasos;
  document.getElementById('kPendenciasCliente').textContent = countPendenciasClienteTotal();
  document.getElementById('kPendenciasAdm').textContent = analysisMetrics.pendAdm;
  document.getElementById('kRisco').textContent = cons.criticidade;

  document.getElementById('painelAreaPressionada').textContent = areaMaisPressionada();
  document.getElementById('painelOrigemRisco').textContent = cons.origem;
  document.getElementById('painelBloqueio').textContent = cons.bloqueio;
  document.getElementById('painelImpacto').textContent = cons.impacto;
  document.getElementById('painelAcao').textContent = cons.acao;
  document.getElementById('painelClienteSensivel').textContent = cons.clienteSensivel;
  document.getElementById('painelEscalonamento').textContent = cons.precisaEscalonamento;
  document.getElementById('painelDependenciaGestor').textContent = cons.dependeGestor;
  document.getElementById('scoreConsolidado').textContent = cons.score;

  document.getElementById('painelTicketsResumo').textContent = analysisMetrics.tickets;
  document.getElementById('painelPedidosResumo').textContent = analysisMetrics.atrasos;
  document.getElementById('painelTecnicosResumo').textContent = `${parseNum('tec_campo')} / ${parseNum('tec_parados')}`;
  document.getElementById('painelPecasResumo').textContent = parseNum('tec_aguardando_peca') + parseNum('adm_qtd_pecas');
  document.getElementById('painelClienteResumo').textContent = countPendenciasClienteTotal();
  document.getElementById('painelAdmResumo').textContent = analysisMetrics.pendAdm;
  document.getElementById('painelTicketsCriticos').textContent = countCriticalTickets();
  document.getElementById('painelCtfCriticos').textContent = parseNum('adm_qtd_ctf');
  document.getElementById('painelEmailsCriticos').textContent = parseNum('adm_qtd_emails');
  document.getElementById('painelMovResumo').textContent = parseNum('adm_qtd_mov');
  document.getElementById('painelDocResumo').textContent = `${parseNum('adm_qtd_notas')} / ${parseNum('adm_qtd_sc')}`;
  document.getElementById('painelClienteCriticoDetalhe').textContent = getPrimaryCriticalClientName();

  const ticketsPend = analysisMetrics.tickets;
  const ticketsCrit = countCriticalTickets();
  const tecnicosCampo = parseNum('tec_campo');
  const tecnicosParados = parseNum('tec_parados');
  const pedidosAtraso = analysisMetrics.atrasos;
  const pendAdm = analysisMetrics.pendAdm;
  const pendCliente = countPendenciasClienteTotal();
  document.getElementById('heroTicketsPendentes').textContent = ticketsPend;
  document.getElementById('miniTicketsPendentes').textContent = ticketsPend;
  document.getElementById('heroTicketsCriticos').textContent = ticketsCrit;
  document.getElementById('heroTecnicosCampo').textContent = tecnicosCampo;
  document.getElementById('miniTecnicosCampo').textContent = tecnicosCampo;
  document.getElementById('heroTecnicosParados').textContent = tecnicosParados;
  document.getElementById('heroPedidosAtraso').textContent = pedidosAtraso;
  document.getElementById('miniPedidosAtraso').textContent = pedidosAtraso;
  document.getElementById('heroPendenciasAdm').textContent = pendAdm;

  document.getElementById('snapTicketsTotal').textContent = ticketsPend;
  document.getElementById('snapTicketsCriticos').textContent = ticketsCrit;
  document.getElementById('snapCtf').textContent = parseNum('adm_qtd_ctf');
  document.getElementById('snapEmails').textContent = parseNum('adm_qtd_emails');
  document.getElementById('snapEscalonamento').textContent = cons.precisaEscalonamento;
  document.getElementById('snapTecnicosCampo').textContent = tecnicosCampo;
  document.getElementById('snapTecnicosParados').textContent = tecnicosParados;
  document.getElementById('snapPeca').textContent = parseNum('tec_aguardando_peca') + parseNum('adm_qtd_pecas');
  document.getElementById('snapCliente').textContent = pendCliente;
  document.getElementById('snapReinc').textContent = parseNum('tec_reincidentes') + analysisMetrics.reincidencias;
  document.getElementById('snapPendAdm').textContent = pendAdm;
  document.getElementById('snapMov').textContent = parseNum('adm_qtd_mov');
  document.getElementById('snapDocs').textContent = `${parseNum('adm_qtd_notas')} / ${parseNum('adm_qtd_sc')}`;
  document.getElementById('snapAtraso').textContent = pedidosAtraso;

  updateMonthInsights();
  updateComparativoInsights();
}

function updateBanners(cons){
  const bannerIds = ['statusBanner','diagBanner'];
  bannerIds.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.className = 'status-banner ' + classForStatus(cons.statusGeral);
    el.textContent = (id === 'diagBanner' ? 'Status geral: ' : 'Status geral consolidado: ') + cons.statusGeral;
  });
  setTextIfPresent('statusGeralTag', cons.statusGeral);
}

function updateTags(){
  const hojeFmt = new Date().toLocaleDateString('pt-BR',{weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'});
  setTextIfPresent('dataHojeTag', hojeFmt);
  setTextIfPresent('registroAtualTag', formatDate(loadedRecordDate));
}


function syncDynamicWrap(wrapId, itemClass, qty){
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  const items = wrap.querySelectorAll(itemClass);
  qty = Math.max(0, Math.min(items.length, Number(qty || 0)));
  wrap.classList.toggle('dynamic-hidden', qty === 0);
  items.forEach((el, idx)=>{
    el.classList.toggle('dynamic-hidden', idx >= qty);
  });
}
function updateOperacaoDynamic(){
  const qty = parseNum('op_qtd_clientes_criticos');
  syncDynamicWrap('opClientesCriticosWrap','.op-cliente-critico-item', qty);

  const criticos = getCriticalClientEntries();
  const firstClient = criticos.find(item => item.cliente);
  const resumoEl = document.getElementById('op_cliente_critico');
  if(resumoEl && !resumoEl.value.trim() && firstClient?.cliente){
    resumoEl.value = firstClient.cliente;
  }

  ['op_prioridade1','op_prioridade2','op_prioridade3'].forEach((id, idx) => {
    const el = document.getElementById(id);
    const item = criticos[idx];
    if(el && !el.value.trim() && item && (item.cliente || item.prioridade)){
      el.value = criticalClientPriorityLabel(item);
    }
  });
}
function updateTecnicoDynamic(){
  syncDynamicWrap('tecPecasWrap','.tec-peca-item', parseNum('tec_aguardando_peca'));
  syncDynamicWrap('tecClienteWrap','.tec-cliente-item', parseNum('tec_aguardando_cliente'));
  syncDynamicWrap('tecReincWrap','.tec-reinc-item', parseNum('tec_reincidentes'));

  const peca = parseNum('tec_aguardando_peca');
  const cliente = parseNum('tec_aguardando_cliente');
  const reinc = parseNum('tec_reincidentes');
  const parados = parseNum('tec_parados');
  const ticketsCrit = [1,2,3].filter(i=>document.getElementById(`tec-ticket${i}_impacto`)?.value === 'CrÃ­tico').length;

  const feito = [];
  const andamento = [];
  const travado = [];
  const quem = [];
  const proximo = [];
  if(peca > 0){ andamento.push(`${peca} caso(s) tÃ©cnicos aguardando peÃ§a em acompanhamento.`); travado.push('DependÃªncia de peÃ§a/material.'); quem.push('Administrativo / almoxarifado.'); }
  if(cliente > 0){ andamento.push(`${cliente} caso(s) aguardando retorno do cliente.`); travado.push('DependÃªncia de cliente.'); quem.push('Cliente / follow-up tÃ©cnico.'); }
  if(reinc > 0){ feito.push(`${reinc} caso(s) reincidentes identificados e segregados para tratamento.`); proximo.push('Programar retorno tÃ©cnico no mesmo caso quando aplicÃ¡vel.'); }
  if(parados > 0){ travado.push(`${parados} tÃ©cnico(s) sem frente produtiva no momento.`); proximo.push('Redistribuir tÃ©cnicos parados para prioridades do dia.'); }
  if(ticketsCrit > 0){ andamento.push(`${ticketsCrit} ticket(s) externo(s) crÃ­tico(s) em acompanhamento.`); proximo.push('Cobrar retorno do ticket crÃ­tico e alinhar cliente.'); }

  const resumo = [];
  resumo.push(`SituaÃ§Ã£o tÃ©cnica ${document.getElementById('tec_status').value || 'em avaliaÃ§Ã£o'}.`);
  if(peca || cliente || reinc || ticketsCrit || parados){
    resumo.push(`Bloqueios relevantes: peÃ§a ${peca}, cliente ${cliente}, reincidÃªncia ${reinc}, tickets crÃ­ticos ${ticketsCrit}, tÃ©cnicos parados ${parados}.`);
  }

  if(!document.getElementById('tec_feito').value.trim()) document.getElementById('tec_feito').value = feito.join(' ');
  if(!document.getElementById('tec_andamento').value.trim()) document.getElementById('tec_andamento').value = andamento.join(' ');
  if(!document.getElementById('tec_travado').value.trim()) document.getElementById('tec_travado').value = travado.join(' ');
  if(!document.getElementById('tec_quem_age').value.trim()) document.getElementById('tec_quem_age').value = [...new Set(quem)].join(' / ');
  if(!document.getElementById('tec_proximo').value.trim()) document.getElementById('tec_proximo').value = [...new Set(proximo)].join(' ');
  if(!document.getElementById('tec_resumo').value.trim()) document.getElementById('tec_resumo').value = resumo.join(' ');
}
function updateAdministrativoDynamic(){
  syncDynamicWrap('admPecasWrap','.adm-peca-item', parseNum('adm_qtd_pecas'));
  syncDynamicWrap('admMovWrap','.adm-mov-item', parseNum('adm_qtd_mov'));
  syncDynamicWrap('admNotasWrap','.adm-nota-item', parseNum('adm_qtd_notas'));
  syncDynamicWrap('admScWrap','.adm-sc-item', parseNum('adm_qtd_sc'));
  syncDynamicWrap('admEmailsWrap','.adm-email-item', parseNum('adm_qtd_emails'));
  syncDynamicWrap('admCtfWrap','.adm-ctf-item', parseNum('adm_qtd_ctf'));
  syncDynamicWrap('admClienteWrap','.adm-cliente-item', parseNum('adm_qtd_cliente'));
  syncDynamicWrap('admTerceirosWrap','.adm-terceiro-item', parseNum('adm_qtd_terceiros'));

  const p = parseNum('adm_qtd_pecas'), m = parseNum('adm_qtd_mov'), n = parseNum('adm_qtd_notas'), sc = parseNum('adm_qtd_sc'), e = parseNum('adm_qtd_emails'), ctf = parseNum('adm_qtd_ctf'), cli = parseNum('adm_qtd_cliente'), t = parseNum('adm_qtd_terceiros');
  const resolvido = [];
  const andamento = [];
  const travado = [];
  const dep = [];
  const proximo = [];
  if(p>0){ andamento.push(`${p} pendÃªncia(s) de peÃ§a em acompanhamento.`); travado.push('PeÃ§as / materiais pendentes.'); dep.push('Almoxarifado / fornecedor'); }
  if(m>0){ andamento.push(`${m} movimentaÃ§Ã£o(Ãµes) pendente(s).`); }
  if(n>0){ travado.push(`${n} nota(s) pendente(s).`); dep.push('Fiscal / faturamento'); }
  if(sc>0){ andamento.push(`${sc} S.C. em tratamento.`); }
  if(e>0){ proximo.push('Priorizar resposta aos e-mails crÃ­ticos do dia.'); }
  if(ctf>0){ travado.push(`${ctf} CTF(s) crÃ­ticos em acompanhamento.`); dep.push('Ãrea interna / terceiro'); }
  if(cli>0){ travado.push(`${cli} pendÃªncia(s) aguardando cliente.`); dep.push('Cliente'); }
  if(t>0){ travado.push(`${t} pendÃªncia(s) com terceiros.`); dep.push('Terceiro / parceiro'); }

  const resumo = [];
  resumo.push(`SituaÃ§Ã£o administrativa ${document.getElementById('adm_status').value || 'em avaliaÃ§Ã£o'}.`);
  if(p||m||n||sc||e||ctf||cli||t){
    resumo.push(`Volumes do dia: peÃ§as ${p}, movimentaÃ§Ãµes ${m}, notas ${n}, SC ${sc}, e-mails ${e}, CTF ${ctf}, cliente ${cli}, terceiros ${t}.`);
  }

  if(!document.getElementById('adm_resolvido').value.trim()) document.getElementById('adm_resolvido').value = resolvido.join(' ');
  if(!document.getElementById('adm_andamento').value.trim()) document.getElementById('adm_andamento').value = andamento.join(' ');
  if(!document.getElementById('adm_travado').value.trim()) document.getElementById('adm_travado').value = travado.join(' ');
  if(!document.getElementById('adm_dep_gestor_txt').value.trim()) document.getElementById('adm_dep_gestor_txt').value = [...new Set(dep)].join(' / ');
  if(!document.getElementById('adm_proximo').value.trim()) document.getElementById('adm_proximo').value = [...new Set(proximo)].join(' ');
  if(!document.getElementById('adm_resumo').value.trim()) document.getElementById('adm_resumo').value = resumo.join(' ');
}

function runAuto(){
  try{
    defaultAgendaDates();
    updateOperacaoDynamic();
    updateTecnicoDynamic();
    updateAdministrativoDynamic();
    const cons = buildConsolidation();
    autoFillDiagnostic(cons);
    updatePanel(cons);
    updateBanners(cons);
    updateTags();
    renderAgendaMonth();
  }catch(err){
    console.error('Falha em runAuto.', err);
  }
}

function refreshHistory(){
  const list = document.getElementById('historyList');
  const store = getStore();
  const dates = Object.keys(store).sort().reverse();
  list.innerHTML = '';
  if(!dates.length){
    list.innerHTML = '<div class="history-item"><span class="muted">Nenhum registro salvo ainda.</span></div>';
    return;
  }
  dates.forEach(d=>{
    const item = document.createElement('div');
    item.className = 'history-item';
    const left = document.createElement('div');
    const draftTag = store[d]?.validationStatus === 'draft' ? ' â€¢ Rascunho com validaÃ§Ã£o pendente' : '';
    left.innerHTML = '<strong>' + formatDate(d) + '</strong><div class="muted">salvo em ' + new Date(store[d].savedAt).toLocaleString('pt-BR') + draftTag + '</div>';
    const right = document.createElement('div');
    right.style.display='flex'; right.style.gap='8px';
    const btn = document.createElement('button');
    btn.className = 'btn-light'; btn.textContent = 'Carregar';
    btn.onclick = ()=>loadRecord(d);
    right.appendChild(btn);
    item.appendChild(left); item.appendChild(right);
    list.appendChild(item);
  });
}

function getSectionLabel(sectionId){
  return {painel:'Painel do Dia',operacao:'OperaÃ§Ã£o',agenda:'Agenda',tecnico:'LÃ­der TÃ©cnico',administrativo:'Administrativo'}[sectionId] || 'Ãrea';
}
function getSectionGroup(sectionId){
  return {painel:'VisÃ£o consolidada',operacao:'OperaÃ§Ã£o',agenda:'OperaÃ§Ã£o',tecnico:'TÃ©cnico',administrativo:'Administrativo'}[sectionId] || 'Geral';
}
function getSectionTheme(sectionId){
  return {painel:'operacao',operacao:'operacao',agenda:'operacao',tecnico:'tecnico',administrativo:'administrativo'}[sectionId] || 'neutro';
}
function getSectionSubtitle(sectionId){
  return {
    painel:'ConsolidaÃ§Ã£o automÃ¡tica da leitura do dia.',
    operacao:'Entrada principal que alimenta o painel do dia.',
    agenda:'OrganizaÃ§Ã£o mensal com criticidade e foco diÃ¡rio.',
    tecnico:'Capacidade, reincidÃªncia e bloqueios tÃ©cnicos.',
    administrativo:'Retaguarda, documentaÃ§Ã£o e dependÃªncias internas.'
  }[sectionId] || 'Ãrea de gestÃ£o.';
}
function getStatusColor(mode){
  return mode === 'saving' ? '#f59e0b' : mode === 'saved' ? '#16a34a' : '#94a3b8';
}
function buildSectionFooter(sectionId){
  const theme = getSectionTheme(sectionId);
  return `
    <div class="section-footer-bar section-theme-${theme}" data-section="${sectionId}">
      <div class="section-footer-inner">
        <div class="section-footer-meta">
          <span class="section-footer-chip"><i class="fa-solid fa-folder-tree"></i> ${getSectionGroup(sectionId)}</span>
          <div class="section-footer-titlebox">
            <div class="section-footer-title">${getSectionLabel(sectionId)}</div>
            <div class="section-footer-sub">${getSectionSubtitle(sectionId)}</div>
          </div>
          <div class="section-footer-date">
            <label for="footerDate_${sectionId}"><i class="fa-regular fa-calendar-days"></i> Registro</label>
            <input id="footerDate_${sectionId}" type="date">
          </div>
          <div class="section-footer-status" id="footerStatus_${sectionId}">
            <span class="section-footer-status-dot" id="footerStatusDot_${sectionId}"></span>
            <div class="section-footer-status-text">
              <strong id="footerStatusLabel_${sectionId}">Auto save pronto</strong>
              <span id="footerStatusTime_${sectionId}">Sem alteraÃ§Ãµes pendentes</span>
            </div>
          </div>
        </div>
        <div class="section-footer-actions">
          <button class="btn-light" type="button" onclick="loadSelectedDate()"><i class="fa-solid fa-folder-open"></i> Carregar</button>
          <button class="btn-light" type="button" onclick="loadTodayRecord()"><i class="fa-solid fa-clock-rotate-left"></i> Hoje</button>
        </div>
      </div>
    </div>`;
}
function injectSectionFooters(){
  // RodapÃ© legado desativado para evitar renderizaÃ§Ã£o duplicada.
}
function syncSectionFooterDates(dateValue){
  ['painel','operacao','agenda','tecnico','administrativo'].forEach(sectionId=>{
    const el = document.getElementById(`footerDate_${sectionId}`);
    if(el && el.value !== (dateValue || '')) el.value = dateValue || '';
  });
}
function updateFooterContext(activeId){
  document.querySelectorAll('.section-footer-bar').forEach(bar=>bar.classList.remove('footer-active'));
  const active = document.querySelector(`#${activeId} .section-footer-bar`);
  if(active) active.classList.add('footer-active');
}
function updateAutoSaveState(labelText, subText, mode){
  ['painel','operacao','agenda','tecnico','administrativo'].forEach(sectionId=>{
    const label = document.getElementById(`footerStatusLabel_${sectionId}`);
    const time = document.getElementById(`footerStatusTime_${sectionId}`);
    const dot = document.getElementById(`footerStatusDot_${sectionId}`);
    if(label) label.textContent = labelText;
    if(time) time.textContent = subText;
    if(dot) dot.style.background = getStatusColor(mode);
  });
}
function bindSectionFooters(){
  // RodapÃ© legado desativado para evitar conflito com o V5.
}
const AUTO_SAVE_DELAY = 900;
let autoSaveTimer = null;
function queueAutoSave(){
  updateAutoSaveState('Salvando automaticamente...', 'Aguardando estabilizar ediÃ§Ã£o', 'saving');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(()=>saveCurrentDay(true), AUTO_SAVE_DELAY);
}
function isLegacyServerFallbackMode(){
  return isServerBackedSession() && !isBackendModeActive();
}

async function saveRecordBackendLegacy(targetDate, data, validation, silent){
  const payload = {
    date: targetDate,
    schemaVersion: DATA_SCHEMA_VERSION,
    validationStatus: validation.isValid ? 'ready' : 'draft',
    data
  };

  const res = await fetch(`/api/records/${encodeURIComponent(targetDate)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('Falha ao salvar via backend fallback [' + res.status + ']');
  const saved = await res.json();

  const store = getStore();
  store[targetDate] = {
    savedAt: saved?.savedAt || new Date().toISOString(),
    schemaVersion: saved?.schemaVersion || DATA_SCHEMA_VERSION,
    validationStatus: saved?.validationStatus || payload.validationStatus,
    data
  };
  setStore(store);
  loadedRecordDate = targetDate;
  refreshHistory();
  updateTags();
  syncDateFields(targetDate);
  currentCalendarMonth = new Date(targetDate + 'T00:00:00');
  renderAgendaMonth();
  runAuto();

  const stamp = new Date(saved?.savedAt || Date.now()).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  if(validation.isValid){
    updateAutoSaveState('Tudo salvo', 'Servidor local ativo â€¢ ' + stamp, 'saved');
    if(!silent) notify('Registro salvo no servidor local: ' + formatDate(targetDate));
  }else{
    updateAutoSaveState('Rascunho salvo', 'Servidor local â€¢ clientes crÃ­ticos pendentes', 'idle');
    if(!silent) notify('Rascunho salvo no servidor. ' + getCriticalClientValidationMessage(validation));
  }
}

async function loadRecordBackendLegacy(dateKey){
  const res = await fetch(`/api/records/${encodeURIComponent(dateKey)}`, { cache: 'no-store' });
  if(!res.ok) throw new Error('Falha ao carregar via backend fallback [' + res.status + ']');
  const rec = await res.json();
  if(!rec || !rec.exists){
    loadedRecordDate = dateKey;
    syncDateFields(dateKey);
    applyForm({ op_data: dateKey, ag_data_base: dateKey });
    refreshHistory();
    if(typeof updateAutoSaveState === 'function'){
      try{ updateAutoSaveState('Tela pronta', 'Data sem registro salvo no servidor', 'idle'); }catch(_){}
    }
    notify('NÃ£o existe registro salvo no servidor para essa data. Tela limpa.');
    return false;
  }

  loadedRecordDate = dateKey;
  currentCalendarMonth = new Date(dateKey + 'T00:00:00');
  syncDateFields(dateKey);
  applyForm(rec.data || {});

  const store = getStore();
  store[dateKey] = {
    savedAt: rec.savedAt || new Date().toISOString(),
    schemaVersion: rec.schemaVersion || DATA_SCHEMA_VERSION,
    validationStatus: rec.validationStatus || 'ready',
    data: rec.data || {}
  };
  setStore(store);
  refreshHistory();

  updateAutoSaveState('Registro carregado','Servidor local â€¢ ' + formatDate(dateKey),'saved');
  notify('Registro carregado do servidor: ' + formatDate(dateKey));
  return true;
}

function saveCurrentDay(silent){
  runAuto();
  const targetDate = document.getElementById('currentDateInput').value || document.getElementById('op_data').value || loadedRecordDate || todayKey;
  syncDateFields(targetDate);
  const data = collectForm();
  const validation = validateCriticalClientFlow(data);
  applyCriticalClientValidationState(validation);

  if(isLegacyServerFallbackMode()){
    saveRecordBackendLegacy(targetDate, data, validation, !!silent).catch(err => {
      console.error('Fallback backend save falhou; salvando local temporÃ¡rio.', err);
      const storeLocal = getStore();
      storeLocal[targetDate] = {
        savedAt: new Date().toISOString(),
        schemaVersion: DATA_SCHEMA_VERSION,
        validationStatus: validation.isValid ? 'ready' : 'draft',
        data
      };
      setStore(storeLocal);
      loadedRecordDate = targetDate;
      refreshHistory();
      updateTags();
      syncDateFields(targetDate);
      currentCalendarMonth = new Date(targetDate + 'T00:00:00');
      renderAgendaMonth();
      runAuto();
      updateAutoSaveState('Salvo local temporÃ¡rio', 'Servidor indisponÃ­vel no momento', 'idle');
      if(!silent) notify('Servidor indisponÃ­vel. Salvo local temporÃ¡rio neste navegador.');
    });
    return;
  }

  const store = getStore();
  store[targetDate] = {
    savedAt: new Date().toISOString(),
    schemaVersion: DATA_SCHEMA_VERSION,
    validationStatus: validation.isValid ? 'ready' : 'draft',
    data
  };
  setStore(store);
  loadedRecordDate = targetDate;
  refreshHistory();
  updateTags();
  syncDateFields(targetDate);
  currentCalendarMonth = new Date(targetDate + 'T00:00:00');
  renderAgendaMonth();
  runAuto();
  const stamp = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  if(validation.isValid){
    updateAutoSaveState('Tudo salvo', 'Ãšltima gravaÃ§Ã£o Ã s ' + stamp, 'saved');
    if(!silent) notify('Registro salvo e refletido no painel do dia: ' + formatDate(targetDate));
  }else{
    updateAutoSaveState('Rascunho salvo', 'Clientes crÃ­ticos com preenchimento pendente', 'idle');
    if(!silent) notify('Rascunho salvo. ' + getCriticalClientValidationMessage(validation));
  }
}

function loadRecord(dateKey){
  if(isLegacyServerFallbackMode()){
    loadRecordBackendLegacy(dateKey).catch(err => {
      console.error('Fallback backend load falhou.', err);
      const storeLocal = getStore();
      const recLocal = storeLocal[dateKey];
      if(!recLocal){ notify('NÃ£o existe registro salvo para essa data.'); return; }
      loadedRecordDate = dateKey;
      currentCalendarMonth = new Date(dateKey + 'T00:00:00');
      syncDateFields(dateKey);
      applyForm(recLocal.data || {});
      updateAutoSaveState('Registro carregado','Base local temporÃ¡ria: ' + formatDate(dateKey),'saved');
      notify('Registro carregado da base local temporÃ¡ria: ' + formatDate(dateKey));
    });
    return;
  }

  const store = getStore();
  const record = store[dateKey];
  if(!record){ notify('NÃ£o existe registro salvo para essa data.'); return; }
  loadedRecordDate = dateKey;
  currentCalendarMonth = new Date(dateKey + 'T00:00:00');
  syncDateFields(dateKey);
  applyForm(record.data || {});
  updateAutoSaveState('Registro carregado','Base ativa: ' + formatDate(dateKey),'saved');
  notify('Registro carregado: ' + formatDate(dateKey));
}
function loadSelectedDate(){
  const dateKey = document.getElementById('currentDateInput').value;
  if(!dateKey){ notify('Selecione uma data.'); return; }
  loadRecord(dateKey);
}
function loadTodayRecord(){
  if(isLegacyServerFallbackMode()){
    (async () => {
      try{
        const resToday = await fetch('/api/today', { cache: 'no-store' });
        if(!resToday.ok) throw new Error('Falha ao obter data base [' + resToday.status + ']');
        const today = await resToday.json();
        const dateKey = today?.date || todayKey;
        const loaded = await loadRecordBackendLegacy(dateKey);
        if(!loaded){
          loadedRecordDate = dateKey;
          syncDateFields(dateKey);
          applyForm({op_data: dateKey, ag_data_base: dateKey});
          updateAutoSaveState('Tela pronta','Hoje sem histÃ³rico salvo ainda','idle');
        }
      }catch(err){
        console.error('Fallback backend today falhou.', err);
        syncDateFields(todayKey);
        const storeLocal = getStore();
        if(storeLocal[todayKey]) loadRecord(todayKey);
        else{
          loadedRecordDate = todayKey;
          syncDateFields(todayKey);
          applyForm({op_data: todayKey, ag_data_base: todayKey});
          updateAutoSaveState('Tela pronta','Hoje sem histÃ³rico salvo ainda','idle');
          notify('NÃ£o hÃ¡ registro salvo para hoje. Tela pronta para preenchimento.');
        }
      }
    })();
    return;
  }

  syncDateFields(todayKey);
  const store = getStore();
  if(store[todayKey]) loadRecord(todayKey);
  else{
    loadedRecordDate = todayKey;
    syncDateFields(todayKey);
    applyForm({op_data: todayKey, ag_data_base: todayKey});
    updateAutoSaveState('Tela pronta','Hoje sem histÃ³rico salvo ainda','idle');
    notify('NÃ£o hÃ¡ registro salvo para hoje. Tela pronta para preenchimento.');
  }
}
function duplicateTodayFromLoaded(){
  const store = getStore();
  const source = store[loadedRecordDate];
  if(!source){ notify('Carregue um registro antes de duplicar.'); return; }
  store[todayKey] = { savedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(source.data || {})) };
  setStore(store);
  syncDateFields(todayKey);
  loadRecord(todayKey);
  refreshHistory();
  updateAutoSaveState('Registro duplicado','Hoje recebeu base do registro carregado','saved');
  notify('Registro duplicado para hoje.');
}
function deleteSelectedDate(){
  const dateKey = document.getElementById('currentDateInput').value;
  if(!dateKey){ notify('Selecione uma data para excluir.'); return; }
  const store = getStore();
  if(!store[dateKey]){ notify('Essa data nÃ£o possui registro salvo.'); return; }
  if(!confirm('Excluir o registro de ' + formatDate(dateKey) + '?')) return;
  delete store[dateKey];
  setStore(store);
  if(loadedRecordDate === dateKey){
    loadedRecordDate = todayKey;
    syncDateFields(todayKey);
    applyForm({op_data: todayKey, ag_data_base: todayKey});
  }
  refreshHistory();
  updateTags();
  updateAutoSaveState('Registro removido','HistÃ³rico limpo para a data selecionada','idle');
  notify('Registro excluÃ­do.');
}
function resetCurrentForm(){
  if(!confirm('Limpar os campos da tela atual sem excluir o histÃ³rico salvo?')) return;
  applyForm({op_data: loadedRecordDate || todayKey});
  notify('Campos limpos.');
}

function triggerAutoSave(){
  if(isBackendModeActive()) return;
  try{
    runAuto();
  }catch(err){
    console.error('Falha na atualizaÃ§Ã£o automÃ¡tica.', err);
  }
  try{
    queueAutoSave();
  }catch(err){
    console.error('Falha no autosave.', err);
  }
}

FIELD_IDS.forEach(id=>{
  const el = document.getElementById(id);
  if(el){
    el.addEventListener('input', triggerAutoSave);
    el.addEventListener('change', triggerAutoSave);
  }
});

const agDataBaseEl = document.getElementById('ag_data_base');
if(agDataBaseEl){
  agDataBaseEl.addEventListener('change', ()=>{ defaultAgendaDates(); renderAgendaMonth(); });
}
const currentDateInputEl = document.getElementById('currentDateInput');
if(currentDateInputEl){
  currentDateInputEl.addEventListener('change', function(){
    const nextDate = (this.value || '').trim();
    if(nextDate) loadedRecordDate = nextDate;
    syncFloatingDate(nextDate);
    syncSectionFooterDates(nextDate);
    updateAutoSaveState('Data alterada','Pronto para carregar ou salvar','idle');
    try{ if(typeof window.updateFooterIntelligence === 'function') window.updateFooterIntelligence(); }catch(e){}
  });
}
const floatingDateInput = document.getElementById('floatingDateInput');
if(floatingDateInput){
  floatingDateInput.addEventListener('change', function(){
    const value = this.value;
    const current = document.getElementById('currentDateInput');
    if(current) current.value = value;
    const opDate = document.getElementById('op_data');
    const agDate = document.getElementById('ag_data_base');
    if(value){
      loadedRecordDate = value;
      if(opDate) opDate.value = value;
      if(agDate) agDate.value = value;
      defaultAgendaDates();
      renderAgendaMonth();
      runAuto();
      try{ if(typeof window.updateFooterIntelligence === 'function') window.updateFooterIntelligence(); }catch(e){}
    }
  });
}
const mobileSectionSelect = document.getElementById('mobileSectionSelect');
if(mobileSectionSelect){ mobileSectionSelect.addEventListener('change', function(){ const id = this.value; const navEl = Array.from(document.querySelectorAll('.sidebar .nav')).find(n => (n.getAttribute('onclick') || '').includes(`'${id}'`)); show(id, navEl || null); }); }

// Footer legado desativado: substituÃ­do pelo rodapÃ© inteligente V5.
if (typeof syncDateFields === 'function') syncDateFields(todayKey);
const opDataEl = document.getElementById('op_data');
const agDataBaseInitEl = document.getElementById('ag_data_base');
if(opDataEl) opDataEl.value = todayKey;
if(agDataBaseInitEl) agDataBaseInitEl.value = todayKey;
if(isServerBackedSession()){
  loadedRecordDate = todayKey;
  applyForm({op_data: todayKey, ag_data_base: todayKey});
  const historyListBoot = document.getElementById('historyList');
  if(historyListBoot) historyListBoot.innerHTML = '<div class="history-item"><span class="muted">Conectando com a base compartilhada...</span></div>';
}else{
  const store = getStore();
  if(store[todayKey]){
    loadRecord(todayKey);
  }else{
    loadedRecordDate = todayKey;
    applyForm({op_data: todayKey, ag_data_base: todayKey});
  }
  refreshHistory();
}
toggleFloatingActions('painel');
runAuto();
try{ if(typeof window.updateFooterIntelligence === 'function') window.updateFooterIntelligence(); }catch(e){}

(function(){
  const V5_SECTIONS = ['painel','operacao','agenda','tecnico','administrativo'];
  const v5Dirty = {};
  function v5GetTheme(sectionId){ return {painel:'operacao',operacao:'operacao',agenda:'operacao',tecnico:'tecnico',administrativo:'administrativo'}[sectionId] || 'operacao'; }
  function v5GetLabel(sectionId){ return {painel:'Painel do Dia',operacao:'OperaÃ§Ã£o',agenda:'Agenda',tecnico:'LÃ­der TÃ©cnico',administrativo:'Administrativo'}[sectionId] || sectionId; }
  function v5GetSubtitle(sectionId){ return {painel:'Leitura consolidada e indicadores que sobem automaticamente das Ã¡reas.','operacao':'Entrada principal do dia e origem do status operacional.','agenda':'Compromissos, criticidade e organizaÃ§Ã£o de execuÃ§Ã£o.','tecnico':'Capacidade, reincidÃªncia, bloqueios e resposta tÃ©cnica.','administrativo':'Retaguarda, documentos, peÃ§as e dependÃªncias internas.'}[sectionId] || 'GestÃ£o diÃ¡ria.'; }
  function v5StoreKey(){ return 'ccoi_footer_owner_v5'; }
  function v5GetOwner(){
    const saved = localStorage.getItem(v5StoreKey());
    if(saved) return saved;
    const candidates = ['ag_responsavel','diag_responsavel'];
    for(const id of candidates){ const el = document.getElementById(id); if(el && el.value && el.value.trim()) return el.value.trim(); }
    return 'Parceiro';
  }
  function v5SetOwner(value){ localStorage.setItem(v5StoreKey(), value || ''); }
  function v5GetSectionInputs(sectionId){
    const section = document.getElementById(sectionId);
    if(!section) return [];
    return Array.from(section.querySelectorAll('input, select, textarea')).filter(el => !el.closest('.section-v5-footer') && !el.disabled && el.type !== 'button');
  }
  function v5FilledCount(sectionId){
    return v5GetSectionInputs(sectionId).filter(el => {
      if(el.type === 'checkbox' || el.type === 'radio') return el.checked;
      const val = (el.value || '').trim();
      return val !== '';
    }).length;
  }
  function v5TotalCount(sectionId){ return v5GetSectionInputs(sectionId).length; }
  function v5StatusOfDay(){
    const op = document.getElementById('op_status')?.value?.trim();
    if(op) return op;
    const risk = document.getElementById('kRisco')?.textContent?.trim();
    return risk || 'Em leitura';
  }
  function v5LastSaved(){
    try {
      const dateKey = document.getElementById('currentDateInput')?.value || document.getElementById('op_data')?.value || '';
      const store = typeof getStore === 'function'
        ? (getStore() || {})
        : JSON.parse(localStorage.getItem(typeof STORAGE_KEY !== 'undefined' ? STORAGE_KEY : 'ccoi_historico_v4') || '{}');
      const rec = store[dateKey];
      if(rec && rec.savedAt) return new Date(rec.savedAt).toLocaleString('pt-BR');
    } catch(e){}
    return 'Ainda nÃ£o salvo';
  }
  function v5ExecutiveText(sectionId){
    const status = v5StatusOfDay();
    const crit = document.getElementById('kCriticos')?.textContent?.trim() || '0';
    const sla = document.getElementById('kSla')?.textContent?.trim() || '0%';
    const campo = document.getElementById('kTecnicosCampo')?.textContent?.trim() || '0';
    const atraso = document.getElementById('kPedidosAtraso')?.textContent?.trim() || '0';
    const cliente = document.getElementById('painelClienteCriticoDetalhe')?.textContent?.trim() || getPrimaryCriticalClientName();
    const base = {
      painel:`Status ${status}. ${crit} casos crÃ­ticos, SLA ${sla}, ${campo} tÃ©cnicos em campo e ${atraso} pedidos em atraso. Cliente mais sensÃ­vel: ${cliente}.`,
      operacao:`OperaÃ§Ã£o em ${status.toLowerCase()}. A leitura do dia estÃ¡ alimentando o painel com ${crit} crÃ­ticos e SLA de ${sla}.`,
      agenda:`Agenda conectada ao dia operacional. Priorize compromissos com impacto no status ${status.toLowerCase()} e no cliente ${cliente}.`,
      tecnico:`Capacidade tÃ©cnica atual com ${campo} em campo. Observe crÃ­ticos, reincidÃªncia e pedidos em atraso (${atraso}) para atuar primeiro.`,
      administrativo:`Retaguarda influencia diretamente o dia. Use o status ${status.toLowerCase()} para acelerar peÃ§as, documentos e pendÃªncias internas.`
    };
    return base[sectionId] || base.painel;
  }
  function v5BuildFooter(sectionId){
    const theme = v5GetTheme(sectionId);
    return `
      <div class="section-v5-footer theme-${theme}" data-section="${sectionId}">
        <div class="v5-shell">
          <div class="v5-left">
            <div class="v5-topline">
              <span class="v5-chip"><i class="fa-solid fa-layer-group"></i> ${v5GetLabel(sectionId)}</span>
              <div>
                <div class="v5-title">${v5GetLabel(sectionId)} ativo</div>
                <div class="v5-sub">${v5GetSubtitle(sectionId)}</div>
              </div>
            </div>
            <div class="v5-metrics">
              <div class="v5-pill" id="v5SavedWrap_${sectionId}"><div class="lbl">Ãšltima atualizaÃ§Ã£o</div><div class="val" id="v5Saved_${sectionId}">Ainda nÃ£o salvo</div></div>
              <div class="v5-pill"><div class="lbl">UsuÃ¡rio responsÃ¡vel</div><div class="val" id="v5OwnerLabel_${sectionId}">${v5GetOwner()}</div></div>
              <div class="v5-pill"><div class="lbl">Status do dia</div><div class="val" id="v5Status_${sectionId}">Em leitura</div></div>
              <div class="v5-pill" id="v5DirtyWrap_${sectionId}"><div class="lbl">PendÃªncia de gravaÃ§Ã£o</div><div class="val" id="v5Dirty_${sectionId}">Sem pendÃªncia</div></div>
            </div>
            <div class="v5-formline">
              <div class="v5-inline"><label for="footerDate_${sectionId}">Registro</label><input id="footerDate_${sectionId}" type="date"></div>
              <div class="v5-owner"><span>ResponsÃ¡vel</span><input id="footerOwner_${sectionId}" type="text" placeholder="Quem estÃ¡ conduzindo o dia?"></div>
              <div class="v5-pill"><div class="lbl">Campos preenchidos na seÃ§Ã£o</div><div class="val"><span id="v5Count_${sectionId}">0</span>/<span id="v5Total_${sectionId}">0</span></div></div>
            </div>
          </div>
          <div class="v5-right">
            <div class="v5-exec">
              <div class="title">Leitura executiva</div>
              <div class="text" id="v5Exec_${sectionId}">Aguardando dados do dia.</div>
              <div class="v5-status-live"><span class="v5-dot" id="v5Dot_${sectionId}"></span><span id="v5Live_${sectionId}">Auto save pronto</span></div>
            </div>
            <div class="v5-actions">
              <button class="btn-light" type="button" onclick="show('historico', Array.from(document.querySelectorAll('.sidebar .nav')).find(n => (n.getAttribute('onclick') || '').includes('historico')) || null)"><i class="fa-solid fa-timeline"></i> HistÃ³rico</button>
              <button class="btn-light" type="button" onclick="loadTodayRecord()"><i class="fa-solid fa-calendar-day"></i> Hoje</button>
            </div>
          </div>
        </div>
      </div>`;
  }
  function v5Inject(){
    V5_SECTIONS.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if(!section) return;
      const old = section.querySelector('.section-footer-bar, .section-v5-footer');
      if(old) old.remove();
      section.classList.add('section-theme', `section-theme-${v5GetTheme(sectionId)}`);
      section.insertAdjacentHTML('beforeend', v5BuildFooter(sectionId));
    });
  }
  function v5SyncDates(value){
    V5_SECTIONS.forEach(sectionId => {
      const input = document.getElementById(`footerDate_${sectionId}`);
      if(input && input.value !== (value || '')) input.value = value || '';
    });
  }
  function v5SyncOwners(value){
    V5_SECTIONS.forEach(sectionId => {
      const input = document.getElementById(`footerOwner_${sectionId}`);
      const label = document.getElementById(`v5OwnerLabel_${sectionId}`);
      if(input && input.value !== value) input.value = value;
      if(label) label.textContent = value || 'Parceiro';
    });
  }
  function v5RefreshCounts(){
    V5_SECTIONS.forEach(sectionId => {
      const count = document.getElementById(`v5Count_${sectionId}`);
      const total = document.getElementById(`v5Total_${sectionId}`);
      if(count) count.textContent = v5FilledCount(sectionId);
      if(total) total.textContent = v5TotalCount(sectionId);
    });
  }
  function v5RefreshStatus(){
    const status = v5StatusOfDay();
    const lastSaved = v5LastSaved();
    V5_SECTIONS.forEach(sectionId => {
      const statusEl = document.getElementById(`v5Status_${sectionId}`);
      const savedEl = document.getElementById(`v5Saved_${sectionId}`);
      const execEl = document.getElementById(`v5Exec_${sectionId}`);
      if(statusEl) statusEl.textContent = status;
      if(savedEl) savedEl.textContent = lastSaved;
      if(execEl) execEl.textContent = v5ExecutiveText(sectionId);
    });
  }
  function v5SetDirty(sectionId, dirty, text){
    v5Dirty[sectionId] = dirty;
    const wrap = document.getElementById(`v5DirtyWrap_${sectionId}`);
    const label = document.getElementById(`v5Dirty_${sectionId}`);
    const dot = document.getElementById(`v5Dot_${sectionId}`);
    const live = document.getElementById(`v5Live_${sectionId}`);
    if(wrap) wrap.classList.toggle('pending', !!dirty), wrap.classList.toggle('saved', !dirty);
    if(label) label.textContent = dirty ? (text || 'AlteraÃ§Ãµes pendentes') : 'Sem pendÃªncia';
    if(dot) dot.className = 'v5-dot ' + (dirty ? 'pending' : 'saved');
    if(live) live.textContent = dirty ? 'AlteraÃ§Ã£o detectada Â· aguardando auto save' : 'Tudo sincronizado';
  }
  function v5MarkDirtyByElement(el){
    const section = el.closest('.section');
    if(!section || !section.id) return;
    v5SetDirty(section.id, true);
    if(section.id !== 'painel') v5SetDirty('painel', true, 'Indicadores aguardando sincronizaÃ§Ã£o');
  }
  function v5Bind(){
    V5_SECTIONS.forEach(sectionId => {
      const dateInput = document.getElementById(`footerDate_${sectionId}`);
      if(dateInput){
        dateInput.addEventListener('change', function(){
          const value = this.value;
          const current = document.getElementById('currentDateInput');
          if(current) current.value = value;
          if(typeof syncDateFields === 'function') syncDateFields(value);
          v5SyncDates(value);
          v5SetDirty(sectionId, true, 'Data alterada');
        });
      }
      const ownerInput = document.getElementById(`footerOwner_${sectionId}`);
      if(ownerInput){
        ownerInput.addEventListener('input', function(){
          const value = this.value.trim();
          v5SetOwner(value);
          v5SyncOwners(value || 'Parceiro');
          v5SetDirty(sectionId, true, 'ResponsÃ¡vel alterado');
        });
      }
    });
    document.querySelectorAll('.section input, .section select, .section textarea').forEach(el => {
      if(el.closest('.section-v5-footer')) return;
      el.addEventListener('input', ()=>{ v5MarkDirtyByElement(el); v5RefreshCounts(); v5RefreshStatus(); }, true);
      el.addEventListener('change', ()=>{ v5MarkDirtyByElement(el); v5RefreshCounts(); v5RefreshStatus(); }, true);
    });
  }
  const oldShow = window.show;
  window.show = function(id, el){ if(typeof oldShow === 'function') oldShow(id, el); V5_SECTIONS.forEach(sec => document.querySelector(`#${sec} .section-v5-footer`)?.classList.remove('footer-active')); document.querySelector(`#${id} .section-v5-footer`)?.classList.add('footer-active'); v5RefreshCounts(); v5RefreshStatus(); };
  const oldSave = window.saveCurrentDay;
  window.saveCurrentDay = function(silent){ const result = oldSave ? oldSave(silent) : undefined; V5_SECTIONS.forEach(sec => v5SetDirty(sec, false)); v5RefreshCounts(); v5RefreshStatus(); return result; };
  const oldLoad = window.loadRecord;
  window.loadRecord = function(dateKey){ const result = oldLoad ? oldLoad(dateKey) : undefined; V5_SECTIONS.forEach(sec => v5SetDirty(sec, false)); v5SyncDates(dateKey); v5RefreshCounts(); v5RefreshStatus(); return result; };
  const oldToday = window.loadTodayRecord;
  window.loadTodayRecord = function(){ const result = oldToday ? oldToday() : undefined; v5SyncDates(document.getElementById('currentDateInput')?.value || document.getElementById('op_data')?.value || ''); v5RefreshCounts(); v5RefreshStatus(); return result; };
  window.updateFooterIntelligence = function(){ v5RefreshCounts(); v5RefreshStatus(); };
  window.bindFooterOwners = function(){};
  window.syncFooterOwners = function(value){ v5SyncOwners(value || v5GetOwner()); };
  window.getResponsibleName = function(){ return v5GetOwner(); };
  v5Inject();
  v5Bind();
  v5SyncDates(document.getElementById('currentDateInput')?.value || document.getElementById('op_data')?.value || '');
  v5SyncOwners(v5GetOwner());
  V5_SECTIONS.forEach(sec => v5SetDirty(sec, false));
  setTimeout(()=>{     try{ if(typeof syncDateFields === 'function'){ const baseDate = document.getElementById('currentDateInput')?.value || document.getElementById('op_data')?.value || (typeof todayKey !== 'undefined' ? todayKey : ''); if(baseDate) syncDateFields(baseDate); } }catch(e){}    try{ if(!isServerBackedSession() && typeof refreshHistory === 'function') refreshHistory(); }catch(e){}    try{ if(typeof runAuto === 'function') runAuto(); }catch(e){}    try{ if(!isServerBackedSession()){ const store = typeof getStore === 'function' ? getStore() : {}; const baseDate = document.getElementById('currentDateInput')?.value || document.getElementById('op_data')?.value || (typeof todayKey !== 'undefined' ? todayKey : ''); if(baseDate && store && store[baseDate] && typeof applyForm === 'function'){ applyForm(store[baseDate].data || {}); } } }catch(e){}    v5RefreshCounts(); v5RefreshStatus(); window.show(document.querySelector('.section.active')?.id || 'painel', document.querySelector('.sidebar .nav.active')); }, 50);
})();

(function(){
  function addUpgradeUI(){
    const painel = document.getElementById('painel');
    if(!painel || document.getElementById('systemUpgradeWrap')) return;

    const anchor = painel.querySelector('.panel-highlight');
    const wrap = document.createElement('div');
    wrap.id = 'systemUpgradeWrap';
    wrap.innerHTML = `
      <div class="system-upgrade-wrap">
        <div class="system-upgrade-card">
          <div class="system-upgrade-title">Command Center â€¢ Modo pioneiro</div>
          <div class="system-upgrade-headline" id="sysHeadline">OperaÃ§Ã£o pronta para leitura executiva</div>
          <div class="system-upgrade-sub" id="sysNarrative">O painel agora cruza pressÃ£o operacional, capacidade tÃ©cnica, retaguarda e histÃ³rico mensal para entregar priorizaÃ§Ã£o imediata.</div>
          <div class="system-upgrade-strip">
            <div class="system-upgrade-pill">
              <div class="lbl">Ãndice de saÃºde</div>
              <div class="val" id="sysHealth">0</div>
              <div class="sub" id="sysHealthSub">Base atual do dia</div>
            </div>
            <div class="system-upgrade-pill">
              <div class="lbl">PressÃ£o operacional</div>
              <div class="val" id="sysPressure">0</div>
              <div class="sub" id="sysPressureSub">Leitura em tempo real</div>
            </div>
            <div class="system-upgrade-pill">
              <div class="lbl">Ritmo do mÃªs</div>
              <div class="val" id="sysRhythm">0%</div>
              <div class="sub" id="sysRhythmSub">ComparaÃ§Ã£o com mÃ©dia mensal</div>
            </div>
            <div class="system-upgrade-pill">
              <div class="lbl">Prioridade mÃ¡xima</div>
              <div class="val" id="sysPriority">--</div>
              <div class="sub" id="sysPrioritySub">AÃ§Ã£o lÃ­der recomendada</div>
            </div>
          </div>
        </div>
        <div class="system-upgrade-side">
          <div class="system-white-card">
            <h3>Radar tÃ¡tico imediato</h3>
            <div class="system-tag-row" id="sysTagRow"></div>
          </div>
          <div class="system-white-card">
            <h3>Top comandos do gestor</h3>
            <div class="system-list" id="sysActions"></div>
          </div>
        </div>
      </div>

      <div class="system-radar">
        <div class="system-white-card">
          <div class="system-kicker">Comparativo das Ã¡reas</div>
          <div class="system-big-number" id="sysFocusArea">OperaÃ§Ã£o</div>
          <div class="system-muted" id="sysFocusSub">Ãrea com maior pressÃ£o combinada no dia.</div>
          <div class="system-heat">
            <div class="system-heat-row"><label>OperaÃ§Ã£o</label><div class="system-bar"><span id="sysBarOperacao" style="width:0%"></span></div><span id="sysValOperacao">0</span></div>
            <div class="system-heat-row"><label>TÃ©cnico</label><div class="system-bar"><span id="sysBarTecnico" style="width:0%"></span></div><span id="sysValTecnico">0</span></div>
            <div class="system-heat-row"><label>Administrativo</label><div class="system-bar"><span id="sysBarAdm" style="width:0%"></span></div><span id="sysValAdm">0</span></div>
          </div>
        </div>
        <div class="system-white-card">
          <div class="system-kicker">Quadro de alertas inteligentes</div>
          <div class="system-alert-board" id="sysAlertBoard"></div>
        </div>
      </div>
    `;
    if(anchor) anchor.insertAdjacentElement('afterend', wrap);
    else painel.insertAdjacentElement('afterbegin', wrap);
  }

  function safeNum(id){
    const el = document.getElementById(id);
    if(!el) return 0;
    const n = parseFloat(el.value || el.textContent || 0);
    return isNaN(n) ? 0 : n;
  }
  function safeText(id){
    return (document.getElementById(id)?.textContent || '').trim();
  }
  function statusScore(value){
    return {'EstÃ¡vel':20,'AtenÃ§Ã£o':50,'Pressionada':75,'CrÃ­tica':100}[value] || 20;
  }
  function cap(v,min,max){ return Math.max(min, Math.min(max, v)); }

  function currentModel(){
    const statusOp = document.getElementById('op_status')?.value || 'EstÃ¡vel';
    const statusTec = document.getElementById('tec_status')?.value || 'EstÃ¡vel';
    const statusAdm = document.getElementById('adm_status')?.value || 'EstÃ¡vel';
    const criticos = typeof parseNum === 'function' ? parseNum('op_criticos') : safeNum('op_criticos');
    const sla = typeof parseNum === 'function' ? parseNum('op_sla') : safeNum('op_sla');
    const exec = typeof executionPercent === 'function' ? executionPercent() : safeNum('kExec');
    const tickets = typeof countOpenTickets === 'function' ? countOpenTickets() : safeNum('kTicketsPendentes');
    const ticketsCrit = typeof countCriticalTickets === 'function' ? countCriticalTickets() : safeNum('painelTicketsCriticos');
    const atraso = typeof countLateOrders === 'function' ? countLateOrders() : safeNum('kPedidosAtraso');
    const bloqueios = typeof countBloqueios === 'function' ? countBloqueios() : safeNum('kBloqueios');
    const pendAdm = typeof countAdminPendencias === 'function' ? countAdminPendencias() : safeNum('kPendenciasAdm');
    const pendCliente = typeof countPendenciasClienteTotal === 'function' ? countPendenciasClienteTotal() : safeNum('kPendenciasCliente');
    const tecnicosCampo = typeof parseNum === 'function' ? parseNum('tec_campo') : safeNum('tec_campo');
    const tecnicosParados = typeof parseNum === 'function' ? parseNum('tec_parados') : safeNum('tec_parados');
    const reinc = (typeof parseNum === 'function' ? parseNum('op_reinc') + parseNum('tec_reincidentes') : safeNum('kReinc'));
    const score = parseFloat(safeText('scoreConsolidado') || 0) || 0;
    const opLoad = statusScore(statusOp) + criticos*6 + ticketsCrit*8 + (100 - sla)*0.4 + (document.getElementById('op_risco_escalonamento')?.value === 'Sim' ? 10 : 0);
    const tecLoad = statusScore(statusTec) + tecnicosParados*9 + reinc*8 + tickets*5 + (document.getElementById('tec_escalonamento')?.value === 'Sim' ? 10 : 0);
    const admLoad = statusScore(statusAdm) + pendAdm*2 + atraso*8 + pendCliente*5 + (document.getElementById('adm_dep_terceiros')?.value === 'Sim' ? 8 : 0);
    const pressure = Math.round(cap((opLoad + tecLoad + admLoad)/3, 0, 100));
    const health = Math.round(cap(100 - (pressure*0.55 + Math.max(0, 92 - sla)*0.5 + Math.max(0, 65 - exec)*0.25), 0, 100));
    return {statusOp,statusTec,statusAdm,criticos,sla,exec,tickets,ticketsCrit,atraso,bloqueios,pendAdm,pendCliente,tecnicosCampo,tecnicosParados,reinc,score,opLoad,tecLoad,admLoad,pressure,health};
  }

  function monthRhythm(model){
    if(typeof getMonthDataRecords !== 'function') return {pct:0, text:'Sem base mensal'};
    const records = getMonthDataRecords() || [];
    if(!records.length) return {pct:0, text:'Sem base mensal'};
    const mediaTickets = records.reduce((s,r)=>s+((typeof countOpenTicketsFromData === 'function') ? countOpenTicketsFromData(r.data||{}) : 0),0) / records.length;
    const mediaCrit = records.reduce((s,r)=>s+(parseFloat((r.data||{}).op_criticos || 0) || 0),0) / records.length;
    const mediaExec = records.reduce((s,r)=>s+((typeof calcExecucaoFromData === 'function') ? calcExecucaoFromData(r.data||{}) : 0),0) / records.length;
    const currentPressure = model.tickets + model.criticos + model.atraso + model.tecnicosParados;
    const basePressure = mediaTickets + mediaCrit + Math.max(0, (100-mediaExec)/15);
    let pct = 100;
    if(basePressure > 0){
      pct = Math.round(cap((currentPressure / basePressure) * 100, 40, 180));
    }
    const text = pct > 115 ? 'Acima da mÃ©dia do mÃªs' : pct < 90 ? 'Abaixo da mÃ©dia do mÃªs' : 'Dentro da mÃ©dia do mÃªs';
    return {pct, text};
  }

  function priorityText(model){
    if(model.atraso >= 2) return ['Pedidos em atraso','Destravar peÃ§as, notas e agenda'];
    if(model.ticketsCrit >= 2) return ['Tickets crÃ­ticos','Virar os crÃ­ticos primeiro'];
    if(model.tecnicosParados > 0 && model.tecnicosCampo <= model.tecnicosParados) return ['Capacidade ociosa','Redistribuir tÃ©cnicos agora'];
    if(model.pendCliente >= 2) return ['PendÃªncia cliente','ForÃ§ar retorno e prazo'];
    return ['Fluxo operacional','Manter ritmo e fechar pendÃªncias'];
  }

  function buildTags(model, rhythm){
    const tags = [];
    const risk = safeText('kRisco') || 'Baixo';
    tags.push({cls:risk === 'CrÃ­tico' || risk === 'Alto' ? 'bad' : risk === 'MÃ©dio' ? 'warn' : 'good', text:'Risco ' + risk});
    tags.push({cls:model.sla < 90 ? 'bad' : model.sla < 95 ? 'warn' : 'good', text:'SLA ' + Math.round(model.sla) + '%'});
    tags.push({cls:model.exec < 60 ? 'bad' : model.exec < 85 ? 'warn' : 'good', text:'ExecuÃ§Ã£o ' + model.exec + '%'});
    tags.push({cls:rhythm.pct > 115 ? 'bad' : rhythm.pct < 90 ? 'good' : 'info', text:'Ritmo mensal ' + rhythm.pct + '%'});
    tags.push({cls:model.tecnicosParados > 0 ? 'warn' : 'good', text:'Parados ' + model.tecnicosParados});
    tags.push({cls:model.atraso > 0 ? 'bad' : 'good', text:'Atrasos ' + model.atraso});
    return tags;
  }

  function buildActions(model){
    const arr = [];
    if(model.ticketsCrit > 0) arr.push(['Atacar criticidade','Fechar ou estabilizar ' + model.ticketsCrit + ' ticket(s) crÃ­tico(s) ainda hoje.']);
    if(model.atraso > 0) arr.push(['Destravar atraso','Revalidar prazo e dono para ' + model.atraso + ' pedido(s) vencido(s).']);
    if(model.tecnicosParados > 0) arr.push(['Redistribuir capacidade','Mover ' + model.tecnicosParados + ' tÃ©cnico(s) parados para a fila de maior pressÃ£o.']);
    if(model.pendAdm > 0) arr.push(['Acelerar retaguarda','Priorizar peÃ§as, CTF, SC, notas e e-mails que travam atendimento.']);
    if(model.pendCliente > 0) arr.push(['CobranÃ§a ao cliente','Fechar retorno pendente com prazo definido e registro.']);
    if(!arr.length) arr.push(['OperaÃ§Ã£o saudÃ¡vel','Manter acompanhamento do dia e buscar fechamento preventivo das pendÃªncias.']);
    return arr.slice(0,3);
  }

  function buildAlerts(model){
    const risk = safeText('kRisco') || 'Baixo';
    const items = [
      {
        title:'Risco consolidado',
        tone:risk === 'CrÃ­tico' || risk === 'Alto' ? 'bad' : risk === 'MÃ©dio' ? 'warn' : 'good',
        badge:risk,
        text:'Score atual ' + (safeText('scoreConsolidado') || '0') + ' com origem principal em ' + (safeText('painelOrigemRisco') || 'OperaÃ§Ã£o') + '.'
      },
      {
        title:'Cliente mais sensÃ­vel',
        tone:(document.getElementById('op_risco_cliente')?.value === 'Sim' || document.getElementById('tec_risco_cliente')?.value === 'Sim' || document.getElementById('adm_risco_cliente')?.value === 'Sim') ? 'bad' : 'good',
        badge:(safeText('painelClienteCriticoDetalhe') || getPrimaryCriticalClientName()),
        text:'Cliente/unidade sob maior atenÃ§Ã£o no momento, com impacto predominante em ' + (safeText('painelImpacto') || 'monitoramento') + '.'
      },
      {
        title:'Bloqueio central',
        tone:model.bloqueios > 0 ? 'warn' : 'good',
        badge:String(model.bloqueios),
        text:(safeText('painelBloqueio') || 'Sem bloqueio relevante') + '. PendÃªncias administrativas: ' + model.pendAdm + '.'
      }
    ];
    return items;
  }

  function renderSystemWidgets(){
    addUpgradeUI();
    const model = currentModel();
    const rhythm = monthRhythm(model);
    const [priority, prioritySub] = priorityText(model);
    const focus = [
      {name:'OperaÃ§Ã£o', value:Math.round(cap(model.opLoad,0,100))},
      {name:'TÃ©cnico', value:Math.round(cap(model.tecLoad,0,100))},
      {name:'Administrativo', value:Math.round(cap(model.admLoad,0,100))}
    ].sort((a,b)=>b.value-a.value);

    const headline = model.health >= 80
      ? 'OperaÃ§Ã£o controlada com espaÃ§o para ganho de performance'
      : model.health >= 60
      ? 'OperaÃ§Ã£o exige gestÃ£o ativa para evitar escalada'
      : 'OperaÃ§Ã£o pressionada: agir rÃ¡pido para recuperar traÃ§Ã£o';

    const narrative = `Hoje o painel cruza ${model.tickets} tickets pendentes, ${model.atraso} pedidos em atraso, ${model.tecnicosCampo} tÃ©cnicos em campo e ${model.pendAdm} pendÃªncias administrativas. A Ã¡rea mais pressionada neste momento Ã© ${focus[0].name}.`;

    const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };

    setText('sysHeadline', headline);
    setText('sysNarrative', narrative);
    setText('sysHealth', model.health);
    setText('sysHealthSub', model.health >= 80 ? 'Base saudÃ¡vel do dia' : model.health >= 60 ? 'SaÃºde moderada, pede atenÃ§Ã£o' : 'SaÃºde baixa, exige contenÃ§Ã£o');
    setText('sysPressure', model.pressure);
    setText('sysPressureSub', model.pressure >= 75 ? 'PressÃ£o alta na operaÃ§Ã£o' : model.pressure >= 50 ? 'PressÃ£o moderada' : 'PressÃ£o controlada');
    setText('sysRhythm', rhythm.pct + '%');
    setText('sysRhythmSub', rhythm.text);
    setText('sysPriority', priority);
    setText('sysPrioritySub', prioritySub);
    setText('sysFocusArea', focus[0].name);
    setText('sysFocusSub', 'Leitura combinada por status, volume, bloqueios, atrasos e dependÃªncias.');

    [['Operacao','sysValOperacao','sysBarOperacao',focus.find(x=>x.name==='OperaÃ§Ã£o')?.value || 0],
     ['Tecnico','sysValTecnico','sysBarTecnico',focus.find(x=>x.name==='TÃ©cnico')?.value || 0],
     ['Adm','sysValAdm','sysBarAdm',focus.find(x=>x.name==='Administrativo')?.value || 0]
    ].forEach(([,valId,barId,val])=>{
      setText(valId, val);
      const bar = document.getElementById(barId);
      if(bar) bar.style.width = val + '%';
    });

    const tagRow = document.getElementById('sysTagRow');
    if(tagRow){
      tagRow.innerHTML = buildTags(model, rhythm).map(t => `<span class="system-chip ${t.cls}">${t.text}</span>`).join('');
    }

    const actions = document.getElementById('sysActions');
    if(actions){
      actions.innerHTML = buildActions(model).map(a => `<div class="system-line"><strong>${a[0]}</strong><span>${a[1]}</span></div>`).join('');
    }

    const board = document.getElementById('sysAlertBoard');
    if(board){
      board.innerHTML = buildAlerts(model).map(item => `
        <div class="system-alert-item">
          <div class="top"><strong>${item.title}</strong><span class="${item.tone}">${item.badge}</span></div>
          <p>${item.text}</p>
        </div>
      `).join('');
    }
  }

  const oldRunAuto = window.runAuto;
  window.runAuto = function(){
    const result = oldRunAuto ? oldRunAuto.apply(this, arguments) : undefined;
    try{ renderSystemWidgets(); }catch(e){}
    return result;
  };

  const oldLoadRecord = window.loadRecord;
  window.loadRecord = function(dateKey){
    const result = oldLoadRecord ? oldLoadRecord.apply(this, arguments) : undefined;
    try{ renderSystemWidgets(); }catch(e){}
    return result;
  };

  const oldSaveCurrentDay = window.saveCurrentDay;
  window.saveCurrentDay = function(silent){
    const result = oldSaveCurrentDay ? oldSaveCurrentDay.apply(this, arguments) : undefined;
    try{ renderSystemWidgets(); }catch(e){}
    return result;
  };

  addUpgradeUI();
  setTimeout(function(){
    try{ renderSystemWidgets(); }catch(e){}
  }, 120);
})();


/* ===== PATCH DE ESTABILIDADE V8 ===== */
(function(){
  if(isServerBackedSession()){
    return;
  }

  const STORAGE_KEY = 'ccoi_historico_v8';
  let volatileStore = {};
  let stableTimer = null;

  function storageAvailable(){
    try{
      const t='__ccoi_test__';
      localStorage.setItem(t,'1');
      localStorage.removeItem(t);
      return true;
    }catch(e){ return false; }
  }

  function deepClone(obj){
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function getStableStore(){
    if(isBackendModeActive() && window.__backendStoreCache){
      return deepClone(window.__backendStoreCache);
    }
    if(storageAvailable()){
      try{
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      }catch(e){
        return {};
      }
    }
    return volatileStore || {};
  }

  function setStableStore(store){
    if(isBackendModeActive()){
      window.__backendStoreCache = deepClone(store || {});
      return true;
    }
    if(storageAvailable()){
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
      return true;
    }
    volatileStore = deepClone(store || {});
    return false;
  }

  function getFieldNodes(){
    return Array.from(document.querySelectorAll('.section input, .section select, .section textarea'))
      .filter(el => el.id && !['currentDateInput','floatingDateInput'].includes(el.id));
  }

  function collectFormStable(){
    const data = {};
    getFieldNodes().forEach(el => { data[el.id] = el.value; });
    return normalizeOperationData(data);
  }

  function applyFormStable(data){
    const normalizedData = normalizeOperationData(data);
    getFieldNodes().forEach(el => {
      el.value = normalizedData[el.id] ?? '';
    });
    applyCriticalClientValidationState(validateCriticalClientFlow(normalizedData));
  }

  function syncAllDates(dateValue){
    if(!dateValue) return;
    ['currentDateInput','floatingDateInput','op_data','ag_data_base'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = dateValue;
    });
    if(typeof syncSectionFooterDates === 'function'){
      try{ syncSectionFooterDates(dateValue); }catch(e){}
    }
  }

  function safeRunAuto(){
    if(isBackendModeActive()) return;
    try{
      if(typeof defaultAgendaDates === 'function') defaultAgendaDates();
      if(typeof updateOperacaoDynamic === 'function') updateOperacaoDynamic();
      if(typeof updateTecnicoDynamic === 'function') updateTecnicoDynamic();
      if(typeof updateAdministrativoDynamic === 'function') updateAdministrativoDynamic();
      if(typeof buildConsolidation === 'function'){
        const cons = buildConsolidation();
        if(typeof autoFillDiagnostic === 'function') autoFillDiagnostic(cons);
        if(typeof updatePanel === 'function') updatePanel(cons);
        if(typeof updateBanners === 'function') updateBanners(cons);
      }
      if(typeof updateTags === 'function') updateTags();
      if(typeof renderAgendaMonth === 'function') renderAgendaMonth();
      if(typeof refreshHistory === 'function') refreshHistory();
      if(typeof updateFooterIntelligence === 'function') updateFooterIntelligence();
    }catch(e){
      console.error('Erro no safeRunAuto:', e);
    }
  }

  function getTargetDate(){
    return (document.getElementById('currentDateInput')?.value || '').trim()
      || (document.getElementById('op_data')?.value || '').trim()
      || (typeof loadedRecordDate !== 'undefined' ? loadedRecordDate : '')
      || (typeof todayKey !== 'undefined' ? todayKey : new Date().toISOString().slice(0,10));
  }

  function saveStable(silent){
    const targetDate = getTargetDate();
    syncAllDates(targetDate);
    safeRunAuto();

    const store = getStableStore();
    const data = collectFormStable();
    const validation = validateCriticalClientFlow(data);
    applyCriticalClientValidationState(validation);
    store[targetDate] = {
      savedAt: new Date().toISOString(),
      schemaVersion: DATA_SCHEMA_VERSION,
      validationStatus: validation.isValid ? 'ready' : 'draft',
      data
    };
    setStableStore(store);

    if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = targetDate;
    if(typeof currentCalendarMonth !== 'undefined'){
      try{ currentCalendarMonth = new Date(targetDate + 'T00:00:00'); }catch(e){}
    }

    safeRunAuto();

    const stamp = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    if(typeof updateAutoSaveState === 'function'){
      try{
        if(validation.isValid) updateAutoSaveState('Tudo salvo', 'Ãšltima gravaÃ§Ã£o Ã s ' + stamp, 'saved');
        else updateAutoSaveState('Rascunho salvo', 'Clientes crÃ­ticos com preenchimento pendente', 'idle');
      }catch(e){}
    }
    if(!silent && typeof notify === 'function'){
      try{
        if(validation.isValid) notify('Registro salvo: ' + targetDate.split('-').reverse().join('/'));
        else notify('Rascunho salvo. ' + getCriticalClientValidationMessage(validation));
      }catch(e){}
    }
  }

  function loadStable(dateKey){
    const store = getStableStore();
    const rec = store[dateKey];
    if(!rec){
      if(typeof notify === 'function') notify('NÃ£o existe registro salvo para essa data.');
      return;
    }
    if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = dateKey;
    syncAllDates(dateKey);
    applyFormStable(rec.data || {});
    safeRunAuto();
    if(typeof updateAutoSaveState === 'function'){
      try{ updateAutoSaveState('Registro carregado', 'Base ativa: ' + dateKey.split('-').reverse().join('/'), 'saved'); }catch(e){}
    }
    if(typeof notify === 'function'){
      try{ notify('Registro carregado: ' + dateKey.split('-').reverse().join('/')); }catch(e){}
    }
  }

  function queueStableSave(){
    if(isBackendModeActive()) return;
    if(typeof updateAutoSaveState === 'function'){
      try{ updateAutoSaveState('Salvando automaticamente.', 'Aguardando estabilizar ediÃ§Ã£o', 'saving'); }catch(e){}
    }
    clearTimeout(stableTimer);
    stableTimer = setTimeout(() => saveStable(true), 700);
  }

  function bindStableEngine(){
    getFieldNodes().forEach(el => {
      if(el.dataset.stableBound === '1') return;
      const h = () => { safeRunAuto(); queueStableSave(); };
      el.addEventListener('input', h, true);
      el.addEventListener('change', h, true);
      el.dataset.stableBound = '1';
    });

    ['currentDateInput','floatingDateInput'].forEach(id => {
      const el = document.getElementById(id);
      if(el && el.dataset.stableDateBound !== '1'){
        el.addEventListener('change', () => syncAllDates(el.value), true);
        el.dataset.stableDateBound = '1';
      }
    });
  }

  window.getStore = getStableStore;
  window.setStore = setStableStore;
  window.collectForm = collectFormStable;
  window.applyForm = applyFormStable;
  window.saveCurrentDay = saveStable;
  window.loadRecord = loadStable;
  window.loadSelectedDate = function(){
    const d = document.getElementById('currentDateInput')?.value || '';
    if(!d){ if(typeof notify === 'function') notify('Selecione uma data.'); return; }
    loadStable(d);
  };
  window.loadTodayRecord = function(){
    const d = (typeof todayKey !== 'undefined' ? todayKey : new Date().toISOString().slice(0,10));
    syncAllDates(d);
    const store = getStableStore();
    if(store[d]) loadStable(d);
    else{
      if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = d;
      applyFormStable({op_data:d, ag_data_base:d});
      safeRunAuto();
      if(typeof updateAutoSaveState === 'function'){
        try{ updateAutoSaveState('Tela pronta', 'Hoje sem histÃ³rico salvo ainda', 'idle'); }catch(e){}
      }
    }
  };
  window.queueAutoSave = queueStableSave;
  window.runAuto = (function(oldRunAuto){
    return function(){
      const result = typeof oldRunAuto === 'function' ? oldRunAuto.apply(this, arguments) : undefined;
      safeRunAuto();
      return result;
    };
  })(window.runAuto);

  window.addEventListener('DOMContentLoaded', function(){
    bindStableEngine();
    const activeDate = getTargetDate();
    syncAllDates(activeDate);
    safeRunAuto();
  });
})();



/* ===== V8.1 BACKEND LOCAL NODE + JSON ===== */
(function(){
  const API = {
    health: '/api/health',
    runtime: '/api/runtime',
    record: (date) => `/api/records/${encodeURIComponent(date)}`,
    today: '/api/today',
    list: '/api/records',
    stream: '/api/stream',
    audit: (date) => `/api/audit/${encodeURIComponent(date)}`,
    quality: (date) => `/api/quality/${encodeURIComponent(date)}`,
    insights: (date) => `/api/insights/${encodeURIComponent(date)}`
  };
  const HISTORY_REFRESH_MIN_INTERVAL = 4000;
  const BACKEND_SYNC_INTERVAL = 2500;
  const BACKEND_DIRTY_SYNC_GRACE = 2200;
  const BACKEND_BOOT_RETRY_INTERVAL = 2500;
  const BACKEND_BOOT_MAX_ATTEMPTS = 60;
  let backendFieldNodesCache = null;
  let backendHistoryLastRefresh = 0;
  let backendAutoRunFrame = 0;
  let backendStoreCache = {};
  let backendRuntimeInfo = null;
  let backendLoadedSavedAt = '';
  let backendHasUnsavedChanges = false;
  let backendSyncInFlight = false;
  let backendLastLocalEditAt = 0;
  let backendBootAttempts = 0;
  let backendBootTimer = 0;
  let backendEventSource = null;
  let backendStreamReconnectTimer = 0;
  let backendLastQualityLevel = '';
  let backendLastQualityIssueCount = 0;
  let backendInsightsCache = getBackendInsightsCache();

  function getAuthToken(){
    try{
      if(typeof window.getPanelAuthToken === 'function'){
        return window.getPanelAuthToken() || '';
      }
      return localStorage.getItem('ccoi_auth_token_v2')
        || sessionStorage.getItem('ccoi_auth_token_v2')
        || localStorage.getItem('ccoi_auth_token_v1')
        || sessionStorage.getItem('ccoi_auth_token_v1')
        || '';
    }catch(_){
      return '';
    }
  }

  function withAuthToken(url, options){
    const opts = options || {};
    const token = getAuthToken();
    if(!token || !opts.queryToken) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }

  function getUiLanguageTag(){
    try{
      const stored = localStorage.getItem('ccoi_ui_language_v1')
        || sessionStorage.getItem('ccoi_ui_language_v1')
        || '';
      const lower = String(stored || '').toLowerCase();
      if(lower.startsWith('en')) return 'en-US';
    }catch(_){}
    const htmlLang = String(document.documentElement?.lang || '').toLowerCase();
    if(htmlLang.startsWith('en')) return 'en-US';
    return 'pt-BR';
  }

  function buildAuthHeaders(baseHeaders){
    const headers = Object.assign({}, baseHeaders || {});
    const token = getAuthToken();
    if(token) headers['x-auth-token'] = token;
    if(!headers['x-panel-lang']) headers['x-panel-lang'] = getUiLanguageTag();
    return headers;
  }

  function cloneBackendData(data){
    return JSON.parse(JSON.stringify(data || {}));
  }
  function getBackendStore(){
    return cloneBackendData(backendStoreCache);
  }
  function setBackendStore(store){
    backendStoreCache = cloneBackendData(store || {});
    window.__backendStoreCache = backendStoreCache;
    return true;
  }
  function formatRuntimeRecordCount(count){
    const total = Number(count || 0);
    return `${total} registro${total === 1 ? '' : 's'} salvo${total === 1 ? '' : 's'}`;
  }
  function updateRuntimeHub(runtime){
    backendRuntimeInfo = runtime || backendRuntimeInfo || {};
    const chip = document.getElementById('runtimeModeChip');
    const status = document.getElementById('runtimeStatusLine');
    const dataFile = document.getElementById('runtimeDataFile');
    const dataMeta = document.getElementById('runtimeDataMeta');
    const lanHint = document.getElementById('runtimeLanHint');
    const orgCompany = document.getElementById('runtimeOrgCompany');
    const orgUnit = document.getElementById('runtimeOrgUnit');
    const localUrl = runtime?.localUrl || 'http://localhost:5000';
    const lanUrls = Array.isArray(runtime?.lanUrls) ? runtime.lanUrls : [];
    const primaryLanUrl = lanUrls[0] || localUrl;

    if(chip){
      chip.textContent = runtime?.ok ? 'Servidor ativo' : 'Servidor offline';
      chip.className = 'runtime-chip ' + (runtime?.ok ? 'ready' : 'offline');
    }
    if(status){
      status.textContent = runtime?.ok
        ? 'Base compartilhada ativa. Abra por localhost neste computador ou pelo link de rede em outras maquinas.'
        : 'Servidor local indisponivel. Use o atalho sem CMD para abrir o painel corretamente.';
    }
    setLinkIfPresent('runtimeLocalUrl', localUrl, localUrl);
    setLinkIfPresent('runtimeLanUrl', primaryLanUrl, lanUrls[0] || 'Sem IP de rede detectado ainda');
    if(dataFile){
      dataFile.textContent = runtime?.dataFile || 'data\\records.json';
    }
    if(dataMeta){
      const backupLabel = runtime?.backupFile ? `Backup: ${runtime.backupFile}` : 'Backup ainda nao gerado';
      const snapLabel = runtime?.backupSnapshots != null ? `Snapshots: ${runtime.backupSnapshots}` : 'Snapshots: --';
      dataMeta.textContent = `${formatRuntimeRecordCount(runtime?.recordCount || 0)} â€¢ ${backupLabel} â€¢ ${snapLabel}`;
    }
    if(lanHint){
      lanHint.textContent = lanUrls.length
        ? 'Outros usuarios da mesma rede podem acessar por esse link enquanto este computador estiver com o servidor ligado.'
        : 'No proprio computador use o localhost. Quando houver IP de rede disponivel, ele aparecera aqui.';
    }
    if(orgCompany){
      const company = runtime?.organization?.companyName || '--';
      orgCompany.textContent = company;
    }
    if(orgUnit){
      const unitName = runtime?.organization?.unitName || '--';
      const unitKey = runtime?.organization?.unitKey || '';
      orgUnit.textContent = unitKey ? `${unitName} (${unitKey})` : unitName;
    }
  }
  function syncRuntimeRecordCount(count){
    backendRuntimeInfo = Object.assign({}, backendRuntimeInfo || {}, { ok: true, recordCount: Number(count || 0) });
    updateRuntimeHub(backendRuntimeInfo);
  }

  function qualityLabel(level){
    const normalized = String(level || '').toLowerCase();
    if(normalized === 'critico') return 'Critico';
    if(normalized === 'atencao') return 'Atencao';
    return 'OK';
  }

  function updateQualityHub(quality){
    const q = quality || {};
    const level = qualityLabel(q.level);
    const score = Number(q.score || 0);
    const issueCount = Number(q.issueCount || 0);
    const nextStep = Array.isArray(q.nextSteps) && q.nextSteps.length ? q.nextSteps[0] : 'Sem pendencias relevantes no momento.';
    const levelEl = document.getElementById('runtimeQualityLevel');
    const scoreEl = document.getElementById('runtimeQualityScore');
    const issuesEl = document.getElementById('runtimeQualityIssues');
    const nextEl = document.getElementById('runtimeQualityNext');
    if(levelEl) levelEl.textContent = level;
    if(scoreEl) scoreEl.textContent = `${score}`;
    if(issuesEl) issuesEl.textContent = `${issueCount}`;
    if(nextEl) nextEl.textContent = nextStep;
    backendLastQualityLevel = String(q.level || '').toLowerCase();
    backendLastQualityIssueCount = issueCount;
  }

  async function refreshQualityBackend(dateKey, options){
    const opts = options || {};
    const targetDate = (dateKey || getTargetDateBackend() || '').trim();
    if(!targetDate) return null;
    try{
      const payload = await apiGet(API.quality(targetDate));
      if(!payload || !payload.ok || !payload.quality){
        return null;
      }
      updateQualityHub(payload.quality);
      if(!opts.silent && payload.quality.issueCount > 0 && typeof notify === 'function'){
        const level = qualityLabel(payload.quality.level);
        notify(`Qualidade operacional ${level}: ${payload.quality.issueCount} pendencia(s).`);
      }
      return payload.quality;
    }catch(err){
      console.error('Falha ao atualizar qualidade operacional.', err);
      return null;
    }
  }
  async function loadBackendRuntimeInfo(){
    try{
      const runtime = await apiGet(API.runtime);
      updateRuntimeHub(runtime);
      return runtime;
    }catch(err){
      console.error('Falha ao carregar informacoes do servidor local.', err);
      return null;
    }
  }
  window.loadBackendRuntimeInfo = loadBackendRuntimeInfo;
  window.refreshQualityBackend = refreshQualityBackend;
  async function hydrateBackendStoreCache(){
    const data = await apiGet(API.list);
    const list = Array.isArray(data.records) ? data.records : [];
    if(!list.length){
      setBackendStore({});
      return {};
    }
    const loaded = await Promise.all(list.map(async rec => {
      const full = await apiGet(API.record(rec.date));
      if(!full || !full.exists) return null;
      return [
        rec.date,
        {
          savedAt: full.savedAt || rec.savedAt || null,
          schemaVersion: full.schemaVersion || rec.schemaVersion || getOperationDataSchemaVersion(full.data || {}),
          validationStatus: full.validationStatus || rec.validationStatus || 'ready',
          data: normalizeOperationData(full.data || {})
        }
      ];
    }));
    const store = {};
    loaded.filter(Boolean).forEach(([dateKey, record]) => { store[dateKey] = record; });
    setBackendStore(store);
    return store;
  }

  function syncMirrorStoreRecord(dateKey, data, savedAt, schemaVersion, validationStatus){
    if(!dateKey || typeof getStore !== 'function' || typeof setStore !== 'function') return;
    try{
      const store = isBackendModeActive() ? getBackendStore() : (getStore() || {});
      store[dateKey] = {
        savedAt: savedAt || new Date().toISOString(),
        schemaVersion: schemaVersion || DATA_SCHEMA_VERSION,
        validationStatus: validationStatus || 'ready',
        data: cloneBackendData(data)
      };
      if(isBackendModeActive()) setBackendStore(store);
      else setStore(store);
    }catch(e){
      console.warn('Falha ao sincronizar cache local.', e);
    }
  }
  function setBackendInsightsPayload(dateKey, payload){
    const key = String(dateKey || '').trim();
    if(!key || !payload || typeof payload !== 'object') return;
    backendInsightsCache = getBackendInsightsCache();
    backendInsightsCache[key] = payload;
    window.__backendInsightsByDate = backendInsightsCache;
  }
  function clearBackendInsightsPayload(dateKey){
    const key = String(dateKey || '').trim();
    if(!key) return;
    backendInsightsCache = getBackendInsightsCache();
    delete backendInsightsCache[key];
    window.__backendInsightsByDate = backendInsightsCache;
  }
  async function refreshInsightsBackend(dateKey, options){
    const opts = options || {};
    const targetDate = String(dateKey || getTargetDateBackend() || '').trim();
    if(!targetDate) return null;
    try{
      const payload = await apiGet(API.insights(targetDate));
      if(payload && payload.ok){
        setBackendInsightsPayload(targetDate, payload);
      }else{
        clearBackendInsightsPayload(targetDate);
      }
      if(opts.render){
        flushAutoRunBackend();
      }
      return payload || null;
    }catch(err){
      console.error('Falha ao carregar snapshot de indicadores do backend.', err);
      clearBackendInsightsPayload(targetDate);
      return null;
    }
  }
  function markBackendDirty(){
    backendHasUnsavedChanges = true;
    backendLastLocalEditAt = Date.now();
  }
  function markBackendClean(savedAt){
    backendHasUnsavedChanges = false;
    backendLoadedSavedAt = savedAt || '';
    backendLastLocalEditAt = 0;
  }

  function isBackendFieldFocused(){
    const active = document.activeElement;
    if(!active) return false;
    const tag = (active.tagName || '').toUpperCase();
    if(!['INPUT','SELECT','TEXTAREA'].includes(tag)) return false;
    return !!active.id;
  }

  function runAutoNowBackend(){
    if(typeof runAuto === 'function'){
      try{ runAuto(); }catch(e){ console.error('Falha no runAuto backend.', e); }
    }
  }

  function flushAutoRunBackend(){
    if(backendAutoRunFrame){
      const cancel = window.cancelAnimationFrame || window.clearTimeout;
      cancel(backendAutoRunFrame);
      backendAutoRunFrame = 0;
    }
    runAutoNowBackend();
  }

  function scheduleAutoRunBackend(){
    if(backendAutoRunFrame) return;
    const raf = window.requestAnimationFrame || function(cb){ return window.setTimeout(cb, 16); };
    backendAutoRunFrame = raf(() => {
      backendAutoRunFrame = 0;
      runAutoNowBackend();
    });
  }

  async function apiGet(url){
    const res = await fetch(url, {
      cache:'no-store',
      headers: buildAuthHeaders()
    });
    if(res.status === 401){
      closeBackendStream();
      try{ if(typeof window.onPanelAuthRequired === 'function') window.onPanelAuthRequired(); }catch(_){}
      throw new Error('Falha GET ' + url + ' [401]');
    }
    if(!res.ok) throw new Error('Falha GET ' + url + ' [' + res.status + ']');
    return await res.json();
  }

  async function apiPost(url, payload){
    const res = await fetch(url, {
      method:'POST',
      headers: buildAuthHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify(payload || {})
    });
    if(res.status === 401){
      closeBackendStream();
      try{ if(typeof window.onPanelAuthRequired === 'function') window.onPanelAuthRequired(); }catch(_){}
      throw new Error('Falha POST ' + url + ' [401]');
    }
    if(!res.ok) throw new Error('Falha POST ' + url + ' [' + res.status + ']');
    return await res.json();
  }

  function clearBackendStreamReconnect(){
    if(backendStreamReconnectTimer){
      clearTimeout(backendStreamReconnectTimer);
      backendStreamReconnectTimer = 0;
    }
  }

  function closeBackendStream(){
    if(backendEventSource){
      try{ backendEventSource.close(); }catch(e){}
      backendEventSource = null;
    }
    clearBackendStreamReconnect();
  }

  function scheduleBackendStreamReconnect(){
    if(backendStreamReconnectTimer || !isBackendModeActive()) return;
    backendStreamReconnectTimer = window.setTimeout(() => {
      backendStreamReconnectTimer = 0;
      connectBackendStream();
    }, 1800);
  }

  async function processBackendStreamUpdate(payload){
    if(!isBackendModeActive()) return;
    if(!payload || !payload.date) return;
    if(backendSyncInFlight) return;

    if(backendHasUnsavedChanges){
      const idleMs = Date.now() - (backendLastLocalEditAt || 0);
      if(isBackendFieldFocused() || idleMs < BACKEND_DIRTY_SYNC_GRACE) return;
      try{
        await saveCurrentDayBackend(true);
      }catch(err){
        console.error('Falha ao salvar alteraÃ§Ãµes locais antes do update em tempo real.', err);
        return;
      }
    }

    const activeDate = getTargetDateBackend();
    if(payload.date !== activeDate){
      try{
        const recOther = await apiGet(API.record(payload.date));
        if(recOther && recOther.exists){
          syncMirrorStoreRecord(payload.date, recOther.data || {}, recOther.savedAt, recOther.schemaVersion, recOther.validationStatus);
        }
      }catch(err){
        console.error('Falha ao sincronizar cache de data nao ativa.', err);
      }
      refreshInsightsBackend(payload.date, { render: false }).catch(err => console.error(err));
      refreshHistoryBackend(true).catch(err => console.error(err));
      return;
    }
    if(payload.savedAt && payload.date === activeDate && backendLoadedSavedAt && payload.savedAt === backendLoadedSavedAt){
      return;
    }

    try{
      const rec = await apiGet(API.record(payload.date));
      if(!rec || !rec.exists) return;
      await applyBackendRecord(payload.date, rec, {
        forceHistory: true,
        silentNotify: true,
        syncedExternally: true
      });
    }catch(err){
      console.error('Falha ao aplicar update em tempo real.', err);
    }
  }

  function connectBackendStream(){
    if(!isBackendModeActive()) return;
    if(backendEventSource || typeof EventSource === 'undefined') return;
    if(!getAuthToken()) return;

    try{
      backendEventSource = new EventSource(withAuthToken(API.stream, { queryToken:true }));
      backendEventSource.onopen = function(){
        clearBackendStreamReconnect();
      };
      backendEventSource.addEventListener('record-updated', function(event){
        try{
          const payload = JSON.parse(event.data || '{}');
          processBackendStreamUpdate(payload).catch(err => console.error(err));
        }catch(err){
          console.error('Evento em tempo real invÃ¡lido.', err);
        }
      });
      backendEventSource.addEventListener('quality-updated', function(event){
        try{
          const payload = JSON.parse(event.data || '{}');
          const activeDate = getTargetDateBackend();
          if(!payload?.date || payload.date !== activeDate) return;
          refreshQualityBackend(payload.date, { silent: true }).catch(err => console.error(err));
          const nextLevel = String(payload.level || '').toLowerCase();
          if(payload.issueCount > 0 && nextLevel && nextLevel !== backendLastQualityLevel && typeof notify === 'function'){
            notify(`Qualidade operacional atualizada: ${qualityLabel(nextLevel)} (${payload.issueCount} pendencia(s)).`);
          }
        }catch(err){
          console.error('Evento de qualidade invalido.', err);
        }
      });
      backendEventSource.onmessage = function(event){
        if(!event || !event.data) return;
        try{
          const payload = JSON.parse(event.data);
          processBackendStreamUpdate(payload).catch(err => console.error(err));
        }catch(_){}
      };
      backendEventSource.onerror = function(){
        closeBackendStream();
        scheduleBackendStreamReconnect();
      };
    }catch(err){
      console.error('Falha ao conectar stream em tempo real.', err);
      closeBackendStream();
      scheduleBackendStreamReconnect();
    }
  }

  async function backendHealth(){
    try{
      const data = await apiGet(API.health);
      updateRuntimeHub(data);
      return !!(data && data.ok);
    }catch(e){
      updateRuntimeHub({ ok:false });
      return false;
    }
  }
  async function importLegacyLocalRecordsToBackend(){
    if(window.__legacyImportDone) return { imported: 0, skipped: 0 };
    window.__legacyImportDone = true;
    if(typeof getStore !== 'function') return { imported: 0, skipped: 0 };

    let localStore = {};
    try{
      localStore = getStore() || {};
    }catch(e){
      return { imported: 0, skipped: 0 };
    }

    const localDates = Object.keys(localStore || {}).filter(dateKey => localStore?.[dateKey]?.data);
    if(!localDates.length) return { imported: 0, skipped: 0 };

    let backendRecords = [];
    try{
      const data = await apiGet(API.list);
      backendRecords = Array.isArray(data.records) ? data.records : [];
    }catch(e){
      backendRecords = [];
    }
    const backendDates = new Set(backendRecords.map(rec => rec.date));

    let imported = 0;
    let skipped = 0;
    for(const dateKey of localDates.sort()){
      if(backendDates.has(dateKey)){
        skipped++;
        continue;
      }
      const record = localStore[dateKey] || {};
      const normalizedData = normalizeOperationData(record.data || {});
      const validation = validateCriticalClientFlow(normalizedData);
      const schemaVersion = Math.max(
        DATA_SCHEMA_VERSION,
        Number(record.schemaVersion || 0) || 0,
        getOperationDataSchemaVersion(normalizedData)
      );
      const validationStatus = record.validationStatus || (validation.isValid ? 'ready' : 'draft');

      await apiPost(API.record(dateKey), {
        date: dateKey,
        schemaVersion,
        validationStatus,
        data: normalizedData
      });
      imported++;
    }

    return { imported, skipped };
  }

  if(location.protocol === 'file:'){
    console.warn('Painel aberto em file://. Nesta versÃ£o o salvamento funciona pelo servidor local em http://localhost:5000');
    setTimeout(() => {
      if(typeof notify === 'function'){
        try{ notify('Abra pelo localhost:5000. O file:// bloqueia o backend local.'); }catch(e){}
      }
    }, 400);
  }

  if(location.protocol === 'file:'){
    const localPanelUrl = 'http://localhost:5000';
    window.addEventListener('DOMContentLoaded', function(){
      if(typeof notify === 'function'){
        try{ notify('Abrindo pelo servidor local. Se nÃ£o abrir, use o iniciar_painel_v8_3.bat.'); }catch(e){}
      }
    });
    setTimeout(() => {
      if(location.protocol === 'file:'){
        try{ window.location.replace(localPanelUrl); }catch(e){}
      }
    }, 900);
  }

  function getFieldNodesBackend(){
    if(backendFieldNodesCache) return backendFieldNodesCache;
    backendFieldNodesCache = Array.from(document.querySelectorAll('.section input, .section select, .section textarea'))
      .filter(el => el.id && !['currentDateInput','floatingDateInput'].includes(el.id));
    return backendFieldNodesCache;
  }

  function collectFormBackend(){
    const data = {};
    getFieldNodesBackend().forEach(el => { data[el.id] = el.value; });
    return normalizeOperationData(data);
  }

  function applyFormBackend(data){
    const normalizedData = normalizeOperationData(data);
    getFieldNodesBackend().forEach(el => {
      el.value = normalizedData[el.id] ?? '';
    });
    applyCriticalClientValidationState(validateCriticalClientFlow(normalizedData));
  }

  function syncDatesBackend(dateValue){
    const nextDate = String(dateValue || '').trim();
    if(!nextDate) return;
    ['currentDateInput','floatingDateInput','op_data','ag_data_base'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = nextDate;
    });
    if(typeof loadedRecordDate !== 'undefined'){
      loadedRecordDate = nextDate;
    }
    try{
      if(typeof currentCalendarMonth !== 'undefined'){
        currentCalendarMonth = new Date(nextDate + 'T00:00:00');
      }
    }catch(_){}
    if(typeof syncSectionFooterDates === 'function'){
      try{ syncSectionFooterDates(nextDate); }catch(e){}
    }
  }

  function getTargetDateBackend(){
    const currentDate = (document.getElementById('currentDateInput')?.value || '').trim();
    if(currentDate){
      if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = currentDate;
      return currentDate;
    }
    const fallback = (typeof loadedRecordDate !== 'undefined' ? String(loadedRecordDate || '').trim() : '') || getLocalISODate(new Date());
    syncDatesBackend(fallback);
    return fallback;
  }

  async function clearBackendDateView(dateKey, options){
    const opts = options || {};
    const targetDate = String(dateKey || getTargetDateBackend() || getLocalISODate(new Date())).trim();
    if(!targetDate) return false;
    syncDatesBackend(targetDate);
    applyFormBackend({ op_data: targetDate, ag_data_base: targetDate });
    markBackendClean('');
    clearBackendInsightsPayload(targetDate);
    await refreshInsightsBackend(targetDate, { render: true });
    await refreshHistoryBackend(true);
    await refreshAuditTrail(targetDate, true);
    await refreshQualityBackend(targetDate, { silent: true });
    if(typeof window.refreshGodMode === 'function'){
      try{ window.refreshGodMode(targetDate); }catch(e){}
    }
    if(typeof updateAutoSaveState === 'function'){
      try{
        updateAutoSaveState('Tela pronta', opts.subText || 'Data sem registro salvo no backend', 'idle');
      }catch(e){}
    }
    if(!opts.silentNotify && typeof notify === 'function'){
      try{
        notify(opts.notifyMessage || `Data ${targetDate.split('-').reverse().join('/')} sem registro salvo. Tela limpa.`);
      }catch(e){}
    }
    return true;
  }

  async function applyBackendRecord(dateKey, rec, options){
    const opts = options || {};
    if(!rec || !rec.exists) return false;
    syncDatesBackend(dateKey);
    applyFormBackend(rec.data || {});
    syncMirrorStoreRecord(dateKey, rec.data || {}, rec.savedAt, rec.schemaVersion, rec.validationStatus);
    markBackendClean(rec.savedAt);
    if(rec.quality) updateQualityHub(rec.quality);
    await refreshInsightsBackend(dateKey, { render: false });
    flushAutoRunBackend();
    await refreshHistoryBackend(!!opts.forceHistory);
    await refreshAuditTrail(dateKey, true);
    if(!rec.quality){
      refreshQualityBackend(dateKey, { silent: true }).catch(err => console.error(err));
    }
    if(typeof window.refreshGodMode === 'function'){
      try{ window.refreshGodMode(dateKey); }catch(e){}
    }

    if(typeof updateAutoSaveState === 'function'){
      try{
        if(opts.syncedExternally){
          const stamp = rec.savedAt ? new Date(rec.savedAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : 'agora';
          updateAutoSaveState('Sincronizado', 'Base compartilhada atualizada Ã s ' + stamp, 'saved');
        }else if(rec.validationStatus === 'draft'){
          updateAutoSaveState('Rascunho carregado', 'Backend local â€¢ complete os clientes crÃ­ticos', 'idle');
        }else{
          updateAutoSaveState('Registro carregado', 'Backend local â€¢ ' + dateKey.split('-').reverse().join('/'), 'saved');
        }
      }catch(e){}
    }
    if(!opts.silentNotify && typeof notify === 'function'){
      try{
        if(opts.syncedExternally) notify('Tela atualizada com a base compartilhada.');
        else notify('Registro carregado do backend: ' + dateKey.split('-').reverse().join('/'));
      }catch(e){}
    }
    return true;
  }

  async function syncActiveRecordFromBackend(options){
    const opts = options || {};
    if(!isBackendModeActive() || backendSyncInFlight) return false;
    if(backendHasUnsavedChanges && !opts.force){
      const idleMs = Date.now() - (backendLastLocalEditAt || 0);
      if(isBackendFieldFocused() || idleMs < BACKEND_DIRTY_SYNC_GRACE) return false;
      try{
        await saveCurrentDayBackend(true);
      }catch(err){
        console.error('Falha ao salvar alteraÃ§Ãµes locais antes da sincronizaÃ§Ã£o.', err);
        return false;
      }
    }

    const dateKey = getTargetDateBackend() || new Date().toISOString().slice(0,10);
    if(!dateKey) return false;

    backendSyncInFlight = true;
    try{
      const rec = await apiGet(API.record(dateKey));
      if(!rec || !rec.exists){
        await clearBackendDateView(dateKey, {
          subText: 'Data sem registro salvo no backend',
          silentNotify: true
        });
        return false;
      }
      if(!opts.force && rec.savedAt && backendLoadedSavedAt && rec.savedAt === backendLoadedSavedAt) return false;
      return await applyBackendRecord(dateKey, rec, {
        forceHistory: true,
        silentNotify: opts.silent !== false,
        syncedExternally: !!backendLoadedSavedAt && rec.savedAt !== backendLoadedSavedAt
      });
    }catch(err){
      console.error('Falha ao sincronizar registro ativo no backend.', err);
      return false;
    }finally{
      backendSyncInFlight = false;
    }
  }

  async function saveCurrentDayBackend(silent){
    const targetDate = getTargetDateBackend() || new Date().toISOString().slice(0,10);
    syncDatesBackend(targetDate);
    flushAutoRunBackend();
    const data = collectFormBackend();
    const validation = validateCriticalClientFlow(data);
    applyCriticalClientValidationState(validation);

    const payload = {
      date: targetDate,
      schemaVersion: DATA_SCHEMA_VERSION,
      validationStatus: validation.isValid ? 'ready' : 'draft',
      data
    };

    const saved = await apiPost(API.record(targetDate), payload);
    syncMirrorStoreRecord(targetDate, payload.data, saved?.savedAt, saved?.schemaVersion, saved?.validationStatus);
    markBackendClean(saved?.savedAt);
    if(saved?.quality) updateQualityHub(saved.quality);
    await refreshInsightsBackend(targetDate, { render: false });
    flushAutoRunBackend();

    if(silent){
      refreshHistoryBackend(false).catch(err => console.error(err));
      refreshAuditTrail(targetDate, false).catch(err => console.error(err));
      if(typeof window.refreshGodMode === 'function'){
        try{ window.refreshGodMode(targetDate); }catch(e){}
      }
    }else{
      await refreshHistoryBackend(true);
      await refreshAuditTrail(targetDate, true);
      if(typeof window.refreshGodMode === 'function'){
        try{ window.refreshGodMode(targetDate); }catch(e){}
      }
    }

    const stamp = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    if(typeof updateAutoSaveState === 'function'){
      try{
        if(validation.isValid) updateAutoSaveState('Tudo salvo', 'Servidor local ativo â€¢ ' + stamp, 'saved');
        else updateAutoSaveState('Rascunho salvo', 'Servidor local â€¢ clientes crÃ­ticos pendentes', 'idle');
      }catch(e){}
    }
    if(!silent && typeof notify === 'function'){
      try{
        if(validation.isValid) notify('Registro salvo no backend local: ' + targetDate.split('-').reverse().join('/'));
        else notify('Rascunho salvo no backend. ' + getCriticalClientValidationMessage(validation));
        if(saved?.quality?.issueCount > 0){
          notify(`Qualidade operacional ${qualityLabel(saved.quality.level)}: ${saved.quality.issueCount} pendencia(s).`);
        }
      }catch(e){}
    }
  }

  async function loadRecordBackend(dateKey){
    if(!dateKey){
      if(typeof notify === 'function') notify('Selecione uma data para carregar.');
      return;
    }

    const rec = await apiGet(API.record(dateKey));
    if(!rec || !rec.exists){
      await clearBackendDateView(dateKey, {
        subText: 'Data sem registro salvo no backend',
        notifyMessage: 'Nao existe registro salvo no backend para essa data. Tela limpa.'
      });
      return;
    }

    if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = dateKey;
    syncDatesBackend(dateKey);
    applyFormBackend(rec.data || {});
    syncMirrorStoreRecord(dateKey, rec.data || {}, rec.savedAt, rec.schemaVersion, rec.validationStatus);
    markBackendClean(rec.savedAt);
    if(rec.quality) updateQualityHub(rec.quality);
    flushAutoRunBackend();
    await refreshHistoryBackend(true);
    await refreshAuditTrail(dateKey, true);
    if(!rec.quality){
      refreshQualityBackend(dateKey, { silent: true }).catch(err => console.error(err));
    }
    if(typeof window.refreshGodMode === 'function'){
      try{ window.refreshGodMode(dateKey); }catch(e){}
    }

    if(typeof updateAutoSaveState === 'function'){
      try{
        if(rec.validationStatus === 'draft') updateAutoSaveState('Rascunho carregado', 'Backend local â€¢ complete os clientes crÃ­ticos', 'idle');
        else updateAutoSaveState('Registro carregado', 'Backend local â€¢ ' + dateKey.split('-').reverse().join('/'), 'saved');
      }catch(e){}
    }
    if(typeof notify === 'function'){
      try{ notify('Registro carregado do backend: ' + dateKey.split('-').reverse().join('/')); }catch(e){}
    }
  }

  async function loadRecordBackendResolved(dateKey){
    const targetDate = String(dateKey || '').trim();
    if(!targetDate){
      if(typeof notify === 'function') notify('Selecione uma data para carregar.');
      return;
    }

    const rec = await apiGet(API.record(targetDate));
    if(!rec || !rec.exists){
      await clearBackendDateView(targetDate, {
        subText: 'Data sem registro salvo no backend',
        notifyMessage: 'Nao existe registro salvo no backend para essa data. Tela limpa.'
      });
      return;
    }

    syncDatesBackend(targetDate);
    applyFormBackend(rec.data || {});
    syncMirrorStoreRecord(targetDate, rec.data || {}, rec.savedAt, rec.schemaVersion, rec.validationStatus);
    markBackendClean(rec.savedAt);
    if(rec.quality) updateQualityHub(rec.quality);
    await refreshInsightsBackend(targetDate, { render: false });
    flushAutoRunBackend();
    await refreshHistoryBackend(true);
    await refreshAuditTrail(targetDate, true);
    if(!rec.quality){
      refreshQualityBackend(targetDate, { silent: true }).catch(err => console.error(err));
    }
    if(typeof window.refreshGodMode === 'function'){
      try{ window.refreshGodMode(targetDate); }catch(e){}
    }
    if(typeof updateAutoSaveState === 'function'){
      try{
        if(rec.validationStatus === 'draft') updateAutoSaveState('Rascunho carregado', 'Backend local â€¢ complete os clientes criticos', 'idle');
        else updateAutoSaveState('Registro carregado', 'Backend local â€¢ ' + targetDate.split('-').reverse().join('/'), 'saved');
      }catch(e){}
    }
    if(typeof notify === 'function'){
      try{ notify('Registro carregado do backend: ' + targetDate.split('-').reverse().join('/')); }catch(e){}
    }
  }

  async function refreshHistoryBackend(force){
    const now = Date.now();
    if(!force && (now - backendHistoryLastRefresh) < HISTORY_REFRESH_MIN_INTERVAL) return;
    backendHistoryLastRefresh = now;
    try{
      const data = await apiGet(API.list);
      const list = Array.isArray(data.records) ? data.records : [];
      const box = document.getElementById('historyList');
      if(!box) return;
      syncRuntimeRecordCount(list.length);

      if(!list.length){
        box.innerHTML = '<div class="history-item"><div><strong>Sem registros salvos</strong><div class="muted">Os dados ficarÃ£o em data/records.json no servidor local.</div></div></div>';
        return;
      }

      box.innerHTML = list.map(rec => {
        const d = rec.date || '--';
        const stamp = rec.savedAt ? new Date(rec.savedAt).toLocaleString('pt-BR') : '--';
        const draftTag = rec.validationStatus === 'draft' ? ' â€¢ Rascunho com validaÃ§Ã£o pendente' : '';
        return `
          <div class="history-item">
            <div>
              <strong>${d.split('-').reverse().join('/')}</strong>
              <div class="muted">Ãšltima gravaÃ§Ã£o: ${stamp}${draftTag}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-light" onclick="loadRecord('${d}')">Carregar</button>
            </div>
          </div>
        `;
      }).join('');
    }catch(e){
      backendHistoryLastRefresh = 0;
      console.error('Falha ao atualizar histÃ³rico no backend', e);
    }
  }

  async function refreshAuditTrail(dateKey, force){
    const box = document.getElementById('historyAuditList');
    if(!box) return;
    const targetDate = (dateKey || getTargetDateBackend() || '').trim();
    if(!targetDate){
      box.innerHTML = '<div class="history-item"><div><strong>Selecione uma data</strong><div class="muted">A trilha de auditoria aparece por dia.</div></div></div>';
      return;
    }
    if(!force && box.dataset.auditDate === targetDate) return;
    box.dataset.auditDate = targetDate;
    box.innerHTML = '<div class="history-item"><div><strong>Carregando auditoria...</strong></div></div>';

    try{
      const data = await apiGet(API.audit(targetDate) + '?limit=30');
      const items = Array.isArray(data.items) ? data.items : [];
      if(!items.length){
        box.innerHTML = '<div class="history-item"><div><strong>Sem eventos</strong><div class="muted">Nenhuma alteracao registrada para esta data.</div></div></div>';
        return;
      }

      box.innerHTML = items.map(item => {
        const stamp = item.changedAt ? new Date(item.changedAt).toLocaleString('pt-BR') : '--';
        const actor = item.changedBy || 'sistema';
        const action = item.action || 'save';
        const summary = item.summary || '';
        return `
          <div class="history-item">
            <div>
              <strong>${stamp}</strong>
              <div class="muted">${actor} â€¢ ${action}</div>
              <div class="muted">${summary}</div>
            </div>
          </div>
        `;
      }).join('');
    }catch(err){
      console.error('Falha ao carregar trilha de auditoria.', err);
      box.innerHTML = '<div class="history-item"><div><strong>Falha ao carregar</strong><div class="muted">Nao foi possivel consultar a trilha agora.</div></div></div>';
    }
  }

  let backendTimer = null;
  function buildBackendPayload(targetDate){
    const data = collectFormBackend();
    const validation = validateCriticalClientFlow(data);
    return {
      payload: {
        date: targetDate,
        schemaVersion: DATA_SCHEMA_VERSION,
        validationStatus: validation.isValid ? 'ready' : 'draft',
        data
      },
      validation
    };
  }

  function sendBeaconBackendSave(){
    if(!isBackendModeActive() || !backendHasUnsavedChanges) return false;
    try{
      const targetDate = getTargetDateBackend() || getLocalISODate(new Date());
      syncDatesBackend(targetDate);
      flushAutoRunBackend();
      const built = buildBackendPayload(targetDate);
      const json = JSON.stringify(built.payload);
      const beaconUrl = withAuthToken(API.record(targetDate), { queryToken:true });

      if(navigator.sendBeacon){
        const blob = new Blob([json], { type: 'application/json' });
        const ok = navigator.sendBeacon(beaconUrl, blob);
        if(ok){
          markBackendClean('');
          return true;
        }
      }

      fetch(beaconUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: true
      }).catch(() => {});
      markBackendClean('');
      return true;
    }catch(err){
      console.error('Falha no flush de autosave (beacon).', err);
      return false;
    }
  }

  function queueAutoSaveBackend(){
    if(typeof updateAutoSaveState === 'function'){
      try{ updateAutoSaveState('Salvando automaticamente.', 'Backend local', 'saving'); }catch(e){}
    }
    clearTimeout(backendTimer);
    backendTimer = setTimeout(() => {
      saveCurrentDayBackend(true).catch(err => console.error(err));
    }, 700);
  }

  function bindBackendAutosave(){
    getFieldNodesBackend().forEach(el => {
      if(el.dataset.backendBound === '1') return;
      const handler = function(){
        if(!isBackendModeActive()) return;
        markBackendDirty();
        scheduleAutoRunBackend();
        queueAutoSaveBackend();
      };
      el.addEventListener('input', handler, true);
      el.addEventListener('change', handler, true);
      el.dataset.backendBound = '1';
    });

    ['currentDateInput','floatingDateInput'].forEach(id => {
      const el = document.getElementById(id);
      if(el && el.dataset.backendDateBound !== '1'){
        el.addEventListener('change', function(){
          const nextDate = String(this.value || '').trim();
          syncDatesBackend(nextDate);
          refreshInsightsBackend(nextDate, { render: true }).catch(err => console.error(err));
        }, true);
        el.dataset.backendDateBound = '1';
      }
    });
  }

  function bindBackendLiveSync(){
    if(window.__backendLiveSyncBound) return;
    window.__backendLiveSyncBound = true;

    window.addEventListener('focus', function(){
      syncActiveRecordFromBackend({ silent:true }).catch(err => console.error(err));
    });

    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden'){
        sendBeaconBackendSave();
        return;
      }
      if(document.visibilityState === 'visible'){
        syncActiveRecordFromBackend({ silent:true }).catch(err => console.error(err));
      }
    });

    window.addEventListener('pagehide', function(){
      sendBeaconBackendSave();
    });

    window.addEventListener('beforeunload', function(){
      sendBeaconBackendSave();
      closeBackendStream();
    });

    window.setInterval(() => {
      if(!isBackendModeActive()) return;
      if(!getAuthToken()) return;
      if(document.body.classList.contains('auth-locked')) return;
      syncActiveRecordFromBackend({ silent:true }).catch(err => console.error(err));
    }, BACKEND_SYNC_INTERVAL);
  }

  window.saveCurrentDay = function(silent){
    saveCurrentDayBackend(!!silent).catch(err => {
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao salvar no backend local.');
    });
  };

  window.loadRecord = function(dateKey){
    loadRecordBackendResolved(dateKey).catch(err => {
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao carregar registro do backend.');
    });
  };

  window.loadSelectedDate = function(){
    const d = document.getElementById('currentDateInput')?.value || '';
    if(!d){
      if(typeof notify === 'function') notify('Selecione uma data.');
      return;
    }
    window.loadRecord(d);
  };
  window.loadTodayRecord = function(){
    loadTodayRecordResolved().catch(err => {
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao abrir base do dia.');
    });
  };

  function hasMeaningfulRecordData(data){
    if(!data || typeof data !== 'object') return false;
    if(Number(data.import_summary_rows || 0) > 0) return true;
    const ignored = new Set(['op_data','ag_data_base','__schemaVersion']);
    for(const [key, rawValue] of Object.entries(data)){
      if(ignored.has(key)) continue;
      const value = String(rawValue ?? '').trim();
      if(!value) continue;
      if(/^-?\d+(?:[.,]\d+)?$/.test(value) && Number(value.replace(',','.')) === 0) continue;
      return true;
    }
    return false;
  }

  async function loadLatestMeaningfulRecordBeforeDate(dateIso, includeCurrentDate){
    const listData = await apiGet(API.list);
    const list = Array.isArray(listData?.records) ? listData.records : [];
    const candidates = list
      .map(item => String(item?.date || '').trim())
      .filter(dateKey => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
      .filter(dateKey => includeCurrentDate ? dateKey <= dateIso : dateKey < dateIso)
      .sort((a,b) => b.localeCompare(a));
    const meaningful = [];
    for(const candidateDate of candidates){
      const candidate = await apiGet(API.record(candidateDate));
      if(!(candidate && candidate.exists && hasMeaningfulRecordData(candidate.data || {}))) continue;
      const importRows = Number(candidate?.data?.import_summary_rows || 0);
      meaningful.push({
        date: candidateDate,
        record: candidate,
        importRows: Number.isFinite(importRows) ? importRows : 0
      });
    }
    if(!meaningful.length) return null;

    const withImport = meaningful.filter(item => item.importRows > 0);
    if(withImport.length){
      withImport.sort((a,b) => (b.importRows - a.importRows) || b.date.localeCompare(a.date));
      return { date: withImport[0].date, record: withImport[0].record };
    }

    meaningful.sort((a,b) => b.date.localeCompare(a.date));
    return { date: meaningful[0].date, record: meaningful[0].record };
  }

  window.loadTodayRecord = async function(){
    try{
      const today = await apiGet(API.today);
      const d = today.date;
      syncDatesBackend(d);
      if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = d;
      const rec = await apiGet(API.record(d));
      let loadedCurrentDay = false;
      if(rec && rec.exists && hasMeaningfulRecordData(rec.data || {})){
        applyFormBackend(rec.data || {});
        syncMirrorStoreRecord(d, rec.data || {}, rec.savedAt, rec.schemaVersion, rec.validationStatus);
        markBackendClean(rec.savedAt);
        if(rec.quality) updateQualityHub(rec.quality);
        loadedCurrentDay = true;
      }
      if(!loadedCurrentDay){
        const fallback = await loadLatestMeaningfulRecordBeforeDate(d, !(rec && rec.exists));
        if(fallback && fallback.record){
          const latestDate = fallback.date;
          const latestRec = fallback.record;
          if(latestRec && latestRec.exists){
            if(typeof loadedRecordDate !== 'undefined') loadedRecordDate = latestDate;
            syncDatesBackend(latestDate);
            applyFormBackend(latestRec.data || {});
            syncMirrorStoreRecord(latestDate, latestRec.data || {}, latestRec.savedAt, latestRec.schemaVersion, latestRec.validationStatus);
            markBackendClean(latestRec.savedAt || '');
            if(latestRec.quality) updateQualityHub(latestRec.quality);
            if(typeof updateAutoSaveState === 'function'){
              try{
                updateAutoSaveState('Ãšltimo registro carregado', 'Hoje sem base salva â€¢ exibindo ' + latestDate.split('-').reverse().join('/'), 'saved');
              }catch(e){}
            }
            if(typeof notify === 'function'){
              try{ notify('Hoje ainda sem registro. Carregado automaticamente o Ãºltimo dia salvo.'); }catch(e){}
            }
          }else{
            applyFormBackend({op_data:d, ag_data_base:d});
            markBackendClean('');
          }
        }else{
          applyFormBackend({op_data:d, ag_data_base:d});
          markBackendClean('');
        }
      }
      flushAutoRunBackend();
      await refreshHistoryBackend(true);
      await refreshAuditTrail((typeof loadedRecordDate !== 'undefined' ? loadedRecordDate : d), true);
      await refreshQualityBackend((typeof loadedRecordDate !== 'undefined' ? loadedRecordDate : d), { silent: true });
    }catch(err){
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao abrir base do dia.');
    }
  };

  async function loadTodayRecordResolved(){
    try{
      const today = await apiGet(API.today);
      const dateKey = String(today?.date || getLocalISODate(new Date())).trim();
      syncDatesBackend(dateKey);
      const rec = await apiGet(API.record(dateKey));
      if(rec && rec.exists && hasMeaningfulRecordData(rec.data || {})){
        applyFormBackend(rec.data || {});
        syncMirrorStoreRecord(dateKey, rec.data || {}, rec.savedAt, rec.schemaVersion, rec.validationStatus);
        markBackendClean(rec.savedAt);
        if(rec.quality) updateQualityHub(rec.quality);
        await refreshInsightsBackend(dateKey, { render: false });
        flushAutoRunBackend();
        await refreshHistoryBackend(true);
        await refreshAuditTrail(dateKey, true);
        await refreshQualityBackend(dateKey, { silent: true });
        try{
          if(typeof window.refreshGodMode === 'function') window.refreshGodMode(dateKey);
        }catch(_){}
        if(typeof updateAutoSaveState === 'function'){
          try{
            if(rec.validationStatus === 'draft') updateAutoSaveState('Rascunho carregado', 'Backend local â€¢ complete os clientes criticos', 'idle');
            else updateAutoSaveState('Registro carregado', 'Backend local â€¢ ' + dateKey.split('-').reverse().join('/'), 'saved');
          }catch(e){}
        }
        return;
      }

      const fallback = await loadLatestMeaningfulRecordBeforeDate(dateKey, !(rec && rec.exists));
      if(fallback && fallback.record && fallback.record.exists){
        const fallbackDate = String(fallback.date || '').trim() || dateKey;
        const fallbackRecord = fallback.record;
        syncDatesBackend(fallbackDate);
        applyFormBackend(fallbackRecord.data || {});
        syncMirrorStoreRecord(fallbackDate, fallbackRecord.data || {}, fallbackRecord.savedAt, fallbackRecord.schemaVersion, fallbackRecord.validationStatus);
        markBackendClean(fallbackRecord.savedAt || '');
        if(fallbackRecord.quality) updateQualityHub(fallbackRecord.quality);
        await refreshInsightsBackend(fallbackDate, { render: false });
        flushAutoRunBackend();
        await refreshHistoryBackend(true);
        await refreshAuditTrail(fallbackDate, true);
        await refreshQualityBackend(fallbackDate, { silent: true });
        try{
          if(typeof window.refreshGodMode === 'function') window.refreshGodMode(fallbackDate);
        }catch(_){}
        if(typeof updateAutoSaveState === 'function'){
          try{
            updateAutoSaveState('Ultimo registro carregado', 'Hoje sem base salva - exibindo ' + fallbackDate.split('-').reverse().join('/'), 'saved');
          }catch(e){}
        }
        if(typeof notify === 'function'){
          try{ notify('Hoje sem base consolidada. Exibindo automaticamente o ultimo dia com registro.'); }catch(e){}
        }
        return;
      }

      await clearBackendDateView(dateKey, {
        subText: 'Hoje sem historico salvo ainda',
        notifyMessage: 'Hoje ainda sem registro salvo. Tela limpa para iniciar o preenchimento.',
        silentNotify: true
      });
      try{
        if(typeof window.refreshGodMode === 'function') window.refreshGodMode(dateKey);
      }catch(_){}
      if(typeof notify === 'function'){
        try{ notify('Hoje ainda sem registro salvo. Inicie o preenchimento para gravar a base do dia.'); }catch(e){}
      }
    }catch(err){
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao abrir base do dia.');
    }
  }

  window.loadTodayRecord = function(){
    loadTodayRecordResolved().catch(err => {
      console.error(err);
      if(typeof notify === 'function') notify('Erro ao abrir base do dia.');
    });
  };

  const oldRunAutoV81 = window.runAuto;
  window.runAuto = function(){
    const result = typeof oldRunAutoV81 === 'function' ? oldRunAutoV81.apply(this, arguments) : undefined;
    return result;
  };

  function clearBackendBootRetry(){
    if(backendBootTimer){
      clearTimeout(backendBootTimer);
      backendBootTimer = 0;
    }
  }

  async function initializeBackendMode(opts){
    const options = opts || {};
    if(window.__backendInitialized){
      window.__backendModeActive = true;
      bindBackendLiveSync();
      connectBackendStream();
      if(options.reconnect){
        syncActiveRecordFromBackend({ force:true, silent:true }).catch(err => console.error(err));
        refreshHistoryBackend(true).catch(err => console.error(err));
        refreshAuditTrail((typeof loadedRecordDate !== 'undefined' ? loadedRecordDate : ''), true).catch(err => console.error(err));
        refreshQualityBackend((typeof loadedRecordDate !== 'undefined' ? loadedRecordDate : ''), { silent: true }).catch(err => console.error(err));
      }
      return true;
    }

    window.__backendModeActive = true;
    bindBackendLiveSync();
    connectBackendStream();
    await loadBackendRuntimeInfo();

    let imported = 0;
    try{
      const migration = await importLegacyLocalRecordsToBackend();
      imported = migration.imported || 0;
    }catch(err){
      console.error('Falha ao importar historico legado do navegador.', err);
    }

    try{
      await hydrateBackendStoreCache();
      window.getStore = getBackendStore;
      window.setStore = setBackendStore;
      try{
        getStore = getBackendStore;
        setStore = setBackendStore;
      }catch(e){}
    }catch(err){
      console.error('Falha ao hidratar cache compartilhado do backend.', err);
    }

    window.__backendInitialized = true;
    backendBootAttempts = 0;
    clearBackendBootRetry();

    if(typeof notify === 'function'){
      try{
        if(imported > 0) notify(`${imported} registro(s) antigo(s) importado(s) do navegador para o backend.`);
        else if(options.reconnect) notify('Base compartilhada reconectada automaticamente.');
        else notify('Backend local Node conectado com sucesso.');
      }catch(e){}
    }

    await window.loadTodayRecord();
    return true;
  }

  async function connectBackendOnce(opts){
    const options = opts || {};
    const ok = await backendHealth();
    if(!ok){
      window.__backendModeActive = false;
      closeBackendStream();
      return false;
    }
    return initializeBackendMode({ reconnect: !!options.reconnect });
  }

  function scheduleBackendReconnect(){
    if(backendBootTimer) return;
    const tick = async function(){
      backendBootAttempts++;
      const connected = await connectBackendOnce({ reconnect:true });
      if(connected) return;

      if(backendBootAttempts >= BACKEND_BOOT_MAX_ATTEMPTS){
        clearBackendBootRetry();
        if(typeof notify === 'function'){
          try{ notify('Servidor local ainda offline. Abra o atalho do painel para ligar a base compartilhada.'); }catch(e){}
        }
        return;
      }

      backendBootTimer = window.setTimeout(tick, BACKEND_BOOT_RETRY_INTERVAL);
    };
    backendBootTimer = window.setTimeout(tick, BACKEND_BOOT_RETRY_INTERVAL);
  }

  window.addEventListener('DOMContentLoaded', async function(){
    bindBackendAutosave();
    const bootBackendAfterAuth = async function(){
      const connected = await connectBackendOnce({ reconnect:false });
      if(!connected){
        console.warn('Backend local indisponivel no boot. Tentando reconectar automaticamente...');
        if(typeof notify === 'function'){
          try{ notify('Servidor local iniciando... a tela vai conectar e carregar sozinha assim que responder.'); }catch(e){}
        }
        scheduleBackendReconnect();
      }
    };
    if(!getAuthToken()){
      const waitAuthAndBoot = function(event){
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        if(detail.authenticated !== true) return;
        window.removeEventListener('panel-auth-changed', waitAuthAndBoot);
        bootBackendAfterAuth().catch(err => console.error(err));
      };
      window.addEventListener('panel-auth-changed', waitAuthAndBoot);
      return;
    }
    await bootBackendAfterAuth();
    return;
    const ok = await backendHealth();
    if(ok){
      window.__backendModeActive = true;
      bindBackendLiveSync();
      await loadBackendRuntimeInfo();
      let imported = 0;
      try{
        const migration = await importLegacyLocalRecordsToBackend();
        imported = migration.imported || 0;
      }catch(err){
        console.error('Falha ao importar histÃ³rico legado do navegador.', err);
      }
      try{
        await hydrateBackendStoreCache();
        window.getStore = getBackendStore;
        window.setStore = setBackendStore;
        try{
          getStore = getBackendStore;
          setStore = setBackendStore;
        }catch(e){}
      }catch(err){
        console.error('Falha ao hidratar cache compartilhado do backend.', err);
      }
      if(typeof notify === 'function'){
        try{
          if(imported > 0) notify(`${imported} registro(s) antigo(s) importado(s) do navegador para o backend.`);
          else notify('Backend local Node conectado com sucesso.');
        }catch(e){}
      }
      await window.loadTodayRecord();
    }else{
      window.__backendModeActive = false;
      console.warn('Backend local indisponÃ­vel.');
      if(typeof notify === 'function'){
        try{ notify('Backend local nÃ£o respondeu. Execute o servidor Node.'); }catch(e){}
      }
    }
  });

  window.refreshHistory = function(){
    const activeDate = getTargetDateBackend();
    refreshHistoryBackend(true).catch(err => console.error(err));
    refreshAuditTrail(activeDate, true).catch(err => console.error(err));
  };

  window.refreshAuditTrail = function(){
    const activeDate = getTargetDateBackend();
    refreshAuditTrail(activeDate, true).catch(err => console.error(err));
  };
})();

