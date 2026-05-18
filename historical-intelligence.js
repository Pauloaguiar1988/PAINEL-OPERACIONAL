const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buildAnalyticsTaxonomy } = require('./analytics-taxonomy');

let xlsxLib = null;
try {
  xlsxLib = require('xlsx');
} catch (_) {
  xlsxLib = null;
}

const HISTORICAL_ANALYTICS_SCHEMA = 'historical_service_analytics_v1';
const HISTORICAL_ANALYTICS_VERSION = 1;
const HISTORICAL_INTELLIGENCE_VERSION = 'historical_intelligence_v2';
const DEFAULT_CLIENT_INACTIVITY_THRESHOLDS = Object.freeze({
  activeMaxDays: 30,
  attentionMaxDays: 60,
  alertMaxDays: 90,
  criticalCommercialDays: 180
});

function nowIso() {
  return new Date().toISOString();
}

function detectLocale(value) {
  return String(value || '').trim().toLowerCase() === 'en-us' ? 'en-US' : 'pt-BR';
}

function toText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeSpaces(value) {
  return toText(value).replace(/\s+/g, ' ').trim();
}

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normKey(value) {
  return stripAccents(normalizeSpaces(value)).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function canonicalKey(value) {
  return stripAccents(normalizeSpaces(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCnpj(valueLike) {
  const digits = String(valueLike == null ? '' : valueLike).replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 14) return digits;
  if (digits.length > 14) return digits.slice(0, 14);
  return '';
}

function hasVal(value) {
  const text = normalizeSpaces(value);
  return !!text && text !== '-' && text !== '--';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pct(partLike, totalLike) {
  const part = Number(partLike || 0);
  const total = Number(totalLike || 0);
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part * 10000) / total) / 100;
}

function hashCompact(payload) {
  try {
    const text = JSON.stringify(payload || {});
    return crypto.createHash('sha1').update(text).digest('hex');
  } catch (_) {
    return '';
  }
}

function parseDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && xlsxLib?.SSF?.parse_date_code) {
    const parsed = xlsxLib.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = normalizeSpaces(value);
  const iso = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsedDate = new Date(text);
  return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
}

function normalizeDateKey(value) {
  return parseDate(value) || '';
}

function addDays(isoDate, days) {
  const base = Date.parse(`${isoDate}T00:00:00`);
  if (!Number.isFinite(base)) return isoDate;
  const next = new Date(base + (days * 86400000));
  return next.toISOString().slice(0, 10);
}

function localIso(dateLike) {
  const dt = dateLike instanceof Date ? dateLike : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function diffDays(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00`);
  const to = Date.parse(`${toIso}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

function pickField(mapLike, aliases) {
  const map = (mapLike && typeof mapLike === 'object') ? mapLike : {};
  for (const alias of aliases) {
    const key = normKey(alias);
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return '';
}

function formatMonthLabel(monthKey, locale) {
  const iso = `${monthKey}-01`;
  const time = Date.parse(`${iso}T00:00:00`);
  if (!Number.isFinite(time)) return monthKey;
  const date = new Date(time);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

function normalizeThresholds(rawLike) {
  const raw = (rawLike && typeof rawLike === 'object') ? rawLike : {};
  const activeMaxDays = clamp(Math.round(Number(raw.activeMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.activeMaxDays)), 1, 365);
  const attentionMaxDays = Math.max(activeMaxDays + 1, clamp(Math.round(Number(raw.attentionMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.attentionMaxDays)), 2, 540));
  const alertMaxDays = Math.max(attentionMaxDays + 1, clamp(Math.round(Number(raw.alertMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.alertMaxDays)), 3, 720));
  const criticalCommercialDays = Math.max(alertMaxDays + 1, clamp(Math.round(Number(raw.criticalCommercialDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.criticalCommercialDays)), 7, 1460));
  return { activeMaxDays, attentionMaxDays, alertMaxDays, criticalCommercialDays };
}

function normalizeComparisonDate(value) {
  const date = normalizeDateKey(value);
  return date || '';
}

function sanitizeHistoricalNormalization(rawLike) {
  const raw = (rawLike && typeof rawLike === 'object') ? rawLike : {};
  const issuesRaw = (raw.issues && typeof raw.issues === 'object') ? raw.issues : {};
  const periodRaw = (raw.period && typeof raw.period === 'object') ? raw.period : {};
  const coverageRaw = (raw.coverage && typeof raw.coverage === 'object') ? raw.coverage : {};

  const minDate = normalizeComparisonDate(periodRaw.minDate);
  const maxDate = normalizeComparisonDate(periodRaw.maxDate);
  const dates = Array.isArray(periodRaw.dates)
    ? periodRaw.dates.map(normalizeComparisonDate).filter(Boolean).sort((a, b) => a.localeCompare(b))
    : [];

  return {
    issues: {
      missingDate: Math.max(0, Number(issuesRaw.missingDate || 0)),
      missingClient: Math.max(0, Number(issuesRaw.missingClient || 0)),
      missingCnpj: Math.max(0, Number(issuesRaw.missingCnpj || 0)),
      missingOs: Math.max(0, Number(issuesRaw.missingOs || 0)),
      missingTechnician: Math.max(0, Number(issuesRaw.missingTechnician || 0)),
      duplicateRows: Math.max(0, Number(issuesRaw.duplicateRows || 0)),
      rowsIgnored: Math.max(0, Number(issuesRaw.rowsIgnored || 0))
    },
    period: {
      minDate: minDate || dates[0] || '',
      maxDate: maxDate || dates[dates.length - 1] || '',
      totalDates: Math.max(0, Number(periodRaw.totalDates || dates.length)),
      years: (periodRaw.years && typeof periodRaw.years === 'object') ? periodRaw.years : {},
      dates
    },
    coverage: {
      totalRows: Math.max(0, Number(coverageRaw.totalRows || 0)),
      normalizedRows: Math.max(0, Number(coverageRaw.normalizedRows || 0))
    }
  };
}

function detectServiceType(modalidade, sigla, apontamento) {
  const text = normKey(`${modalidade} ${sigla} ${apontamento}`);
  if (!text) return 'nao_identificado';
  if (text.includes('retorno')) return 'retorno_tecnico';
  if (text.includes('prevent') || text.includes('mp') || text.includes('manutencaopreventiva')) return 'preventiva';
  if (text.includes('instal') || text.includes('implant')) return 'instalacao';
  if (text.includes('config') || text.includes('parametr') || text.includes('software')) return 'configuracao';
  if (text.includes('trein')) return 'treinamento';
  if (text.includes('vistoria') || text.includes('orientacao') || text.includes('validacao')) return 'vistoria';
  if (text.includes('suporte') || text.includes('ajuste') || text.includes('improdutiv')) return 'suporte_ajuste';
  return 'corretiva';
}

function detectWarranty(apontamento, defeitoGarantia, tipoCliente, modeloContrato) {
  const text = normKey(`${apontamento} ${defeitoGarantia} ${tipoCliente} ${modeloContrato}`);
  if (text.includes('garantiapeca') || text.includes('gp-i')) return { warrantyStatus: 'em_garantia', warrantyType: 'garantia_peca' };
  if (text.includes('garantiaservico') || text.includes('garantiainstal') || text.includes('gi-i')) return { warrantyStatus: 'em_garantia', warrantyType: 'garantia_servico_instalacao' };
  if (text.includes('garantiafabrica') || text.includes('gf-i')) return { warrantyStatus: 'em_garantia', warrantyType: 'garantia_fabrica' };
  if (hasVal(defeitoGarantia)) return { warrantyStatus: 'em_garantia', warrantyType: 'garantia_servico_instalacao' };
  if (text.includes('comcobranca') || text.includes('avulso')) return { warrantyStatus: 'fora_garantia', warrantyType: 'sem_garantia' };
  return { warrantyStatus: 'nao_identificado', warrantyType: 'nao_identificado' };
}

function detectProbableCause(sigla, apontamento, defeitoGarantia, motivoLaudo) {
  const text = normKey(`${sigla} ${apontamento} ${defeitoGarantia} ${motivoLaudo}`);
  if (!text) return 'indefinido';
  if (text.includes('integrac')) return 'integracao';
  if (text.includes('software') || text.includes('config') || text.includes('parametr')) return 'software_configuracao';
  if (text.includes('infra') || text.includes('rede') || text.includes('internet') || text.includes('energia')) return 'infraestrutura_cliente';
  if (text.includes('peca') || text.includes('acessor') || text.includes('placa') || text.includes('leitor')) return 'peca_acessorio';
  if (text.includes('instal')) return 'instalacao';
  if (text.includes('operacao') || text.includes('uso')) return 'operacao_uso';
  if (text.includes('equip') || text.includes('catraca') || text.includes('torniquete') || text.includes('cancela')) return 'equipamento';
  return 'indefinido';
}

function detectOutcomeType(laudoOk, motivoLaudo, apontamento, novoRetorno) {
  const laudo = normKey(laudoOk);
  const text = normKey(`${motivoLaudo} ${apontamento} ${novoRetorno}`);
  if (text.includes('paliat')) return 'paliativo';
  if (text.includes('aguardandocliente') || text.includes('dependenciacliente')) return 'requer_cliente';
  if (text.includes('fabrica')) return 'requer_fabrica';
  if (text.includes('peca') || text.includes('acessorio')) return 'requer_peca';
  if (text.includes('retorno')) return 'requer_nova_visita';
  if (laudo.includes('nao')) return 'requer_nova_visita';
  if (laudo.includes('sim') && !hasVal(motivoLaudo)) return 'resolvido';
  return 'indefinido';
}

function normalizeFilterList(valueLike) {
  if (Array.isArray(valueLike)) {
    return valueLike
      .map((item) => canonicalKey(item))
      .filter(Boolean)
      .slice(0, 80);
  }
  const text = toText(valueLike);
  if (!text) return [];
  return text
    .split(',')
    .map((item) => canonicalKey(item))
    .filter(Boolean)
    .slice(0, 80);
}

function normalizeHistoricalFilters(filtersLike) {
  const raw = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
  const periodRaw = String(raw.period || raw.periodType || raw.periodo || '').trim().toLowerCase();
  const period = ['daily', 'monthly', 'quarterly', 'ytd', 'historical'].includes(periodRaw) ? periodRaw : 'monthly';
  return {
    period,
    clients: normalizeFilterList(raw.clients || raw.client),
    cnpj: normalizeFilterList(raw.cnpj || raw.cnpjs),
    technicians: normalizeFilterList(raw.technicians || raw.technician),
    serviceTypes: normalizeFilterList(raw.serviceTypes || raw.serviceType),
    warranty: normalizeFilterList(raw.warranty),
    retorno: normalizeFilterList(raw.retorno),
    equipment: normalizeFilterList(raw.equipment || raw.equipamento),
    criticity: normalizeFilterList(raw.criticity || raw.criticidade)
  };
}

function hasActiveHistoricalFilters(filtersLike) {
  const filters = normalizeHistoricalFilters(filtersLike);
  return (
    filters.period !== 'monthly'
    || Object.entries(filters).some(([axis, list]) => axis !== 'period' && Array.isArray(list) && list.length > 0)
  );
}

function rowMatchesHistoricalFilters(rowLike, filtersLike) {
  const row = (rowLike && typeof rowLike === 'object') ? rowLike : {};
  const filters = normalizeHistoricalFilters(filtersLike);
  if (!hasActiveHistoricalFilters(filters)) return true;

  const matchByList = (list, candidateKeys) => {
    if (!Array.isArray(list) || !list.length) return true;
    const candidates = (Array.isArray(candidateKeys) ? candidateKeys : [candidateKeys])
      .map((item) => canonicalKey(item))
      .filter(Boolean);
    if (!candidates.length) return false;
    return list.some((item) => candidates.includes(item));
  };

  const retornoValue = row.isReturn ? 'retorno' : 'novo';
  const criticityValue = row.isCriticalSignal ? 'critico' : 'normal';

  return (
    matchByList(filters.clients, [row.clientKey, row.clientName])
    && matchByList(filters.cnpj, [row.cnpjNormalized, row.cnpjRaw])
    && matchByList(filters.technicians, [row.technicianKey, row.technicianName, row.attendantName])
    && matchByList(filters.serviceTypes, row.serviceType)
    && matchByList(filters.warranty, [row.warrantyStatus, row.warrantyType])
    && matchByList(filters.retorno, [retornoValue, row.novoRetorno])
    && matchByList(filters.equipment, [row.equipamento, row.modelo, row.sigla])
    && matchByList(filters.criticity, criticityValue)
  );
}

function applyHistoricalFilters(rowsLike, filtersLike) {
  const rows = Array.isArray(rowsLike) ? rowsLike : [];
  const filters = normalizeHistoricalFilters(filtersLike);
  if (!hasActiveHistoricalFilters(filters)) return rows.slice();
  return rows.filter((row) => rowMatchesHistoricalFilters(row, filters));
}

function normalizeRows(rowsLike) {
  const rows = Array.isArray(rowsLike) ? rowsLike : [];
  const out = [];
  const dedupe = new Set();
  const dateSet = new Set();
  const fieldCoverage = {
    statusClassificacaoFilled: 0,
    semDebitoFilled: 0,
    pedidoInstalacaoFilled: 0,
    modeloContratoFilled: 0,
    tecnicoFilled: 0
  };
  const issues = {
    missingDate: 0,
    missingClient: 0,
    missingCnpj: 0,
    missingOs: 0,
    missingTechnician: 0,
    duplicateRows: 0,
    rowsIgnored: 0
  };

  rows.forEach((raw, index) => {
    const map = {};
    Object.keys(raw || {}).forEach((key) => {
      map[normKey(key)] = raw[key];
    });

    const osId = normalizeSpaces(pickField(map, ['O.S.', 'OS', 'Ordem de Servico'])).toUpperCase();
    const clientName = normalizeSpaces(pickField(map, ['Cliente']));
    const cnpjRaw = normalizeSpaces(pickField(map, ['CNPJ', 'Cnpj', 'cnpj']));
    const cnpjNormalized = normalizeCnpj(cnpjRaw);
    const filial = normalizeSpaces(pickField(map, ['Filial O.S.', 'Filial']));
    const dateAtendimento = parseDate(pickField(map, ['Data Atendimento']));
    const dateEmissao = parseDate(pickField(map, ['Data Emissao']));
    const dateN1 = parseDate(pickField(map, ['N1']));
    const dateRef = dateAtendimento || dateEmissao || dateN1;

    const tecnico = normalizeSpaces(pickField(map, ['Tecnico', 'Técnico']));
    const atendente = normalizeSpaces(pickField(map, ['Atendente']));
    const modalidade = normalizeSpaces(pickField(map, ['Modalidade']));
    const sigla = normalizeSpaces(pickField(map, ['Sigla']));
    const apontamento = normalizeSpaces(pickField(map, ['Apontamento']));
    const tipoCliente = normalizeSpaces(pickField(map, ['Tipo Cliente']));
    const modeloContrato = normalizeSpaces(pickField(map, ['Modelo de Contrato']));
    const numeroContrato = normalizeSpaces(pickField(map, ['N. Contrato', 'N Contrato']));
    const novoRetorno = normalizeSpaces(pickField(map, ['Novo/Retorno']));
    const defeitoGarantia = normalizeSpaces(pickField(map, ['Defeito na Garantia']));
    const laudoOk = normalizeSpaces(pickField(map, ['Laudo ok?']));
    const motivoLaudo = normalizeSpaces(pickField(map, ['Motivo Laudo']));
    const modelo = normalizeSpaces(pickField(map, ['Modelo']));
    const statusClassificacao = normalizeSpaces(pickField(map, ['Status Classificacao', 'Status Classificação']));
    const semDebito = normalizeSpaces(pickField(map, ['Sem Debito', 'Sem Débito']));
    const pedidoInstalacao = normalizeSpaces(pickField(map, ['Pedido Instalacao', 'Pedido Instalação']));

    if (!dateRef) issues.missingDate += 1;
    if (!clientName) issues.missingClient += 1;
    if (!cnpjNormalized) issues.missingCnpj += 1;
    if (!osId) issues.missingOs += 1;
    if (!dateRef || !clientName) {
      issues.rowsIgnored += 1;
      return;
    }

    const technicianName = tecnico || atendente || 'Tecnico nao identificado';
    const technicianSource = tecnico ? 'tecnico' : (atendente ? 'atendente' : 'nao_identificado');
    const sourceConfidence = tecnico ? 0.95 : (atendente ? 0.55 : 0.2);
    if (technicianSource === 'nao_identificado') issues.missingTechnician += 1;

    if (hasVal(statusClassificacao)) fieldCoverage.statusClassificacaoFilled += 1;
    if (hasVal(semDebito)) fieldCoverage.semDebitoFilled += 1;
    if (hasVal(pedidoInstalacao)) fieldCoverage.pedidoInstalacaoFilled += 1;
    if (hasVal(modeloContrato)) fieldCoverage.modeloContratoFilled += 1;
    if (hasVal(tecnico)) fieldCoverage.tecnicoFilled += 1;

    const dedupeKey = `${dateRef}|${osId || `sem_os_${index + 1}`}|${cnpjNormalized || canonicalKey(clientName)}`;
    if (dedupe.has(dedupeKey)) {
      issues.duplicateRows += 1;
      return;
    }
    dedupe.add(dedupeKey);
    dateSet.add(dateRef);

    const serviceType = detectServiceType(modalidade, sigla, apontamento);
    const warranty = detectWarranty(apontamento, defeitoGarantia, tipoCliente, modeloContrato);
    const probableCause = detectProbableCause(sigla, apontamento, defeitoGarantia, motivoLaudo);
    const outcomeType = detectOutcomeType(laudoOk, motivoLaudo, apontamento, novoRetorno);
    const isReturn = normKey(novoRetorno).includes('retorno');
    const hasWeakLaudo = normKey(laudoOk).includes('nao') || (hasVal(motivoLaudo) && !normKey(motivoLaudo).includes('naoseaplica'));
    const hasNoPartSuspect = serviceType === 'corretiva' && hasVal(defeitoGarantia) && !normKey(defeitoGarantia).includes('peca');
    const isCriticalSignal = isReturn || hasWeakLaudo || outcomeType !== 'resolvido';

    out.push({
      rowNumber: index + 2,
      dateRef,
      monthRef: dateRef.slice(0, 7),
      osId,
      clientName,
      cnpjRaw,
      cnpjNormalized,
      clientIdentityQuality: cnpjNormalized ? 'high' : (clientName ? 'medium' : 'low'),
      clientKey: cnpjNormalized ? `cnpj_${cnpjNormalized}` : canonicalKey(clientName),
      filial,
      filialKey: canonicalKey(filial || clientName),
      technicianName,
      technicianKey: canonicalKey(technicianName),
      technicianSource,
      sourceConfidence,
      attendantName: atendente,
      modalidade,
      sigla,
      apontamento,
      tipoCliente,
      modeloContrato,
      numeroContrato,
      novoRetorno,
      defeitoGarantia,
      laudoOk,
      motivoLaudo,
      statusClassificacao,
      semDebito,
      pedidoInstalacao,
      modelo,
      serviceType,
      warrantyStatus: warranty.warrantyStatus,
      warrantyType: warranty.warrantyType,
      probableCause,
      outcomeType,
      isReturn,
      hasWeakLaudo,
      hasNoPartSuspect,
      isCriticalSignal,
      dateAtendimento,
      dateEmissao,
      dateN1
    });
  });

  const dates = Array.from(dateSet.values()).sort((a, b) => a.localeCompare(b));
  const years = {};
  dates.forEach((date) => { years[date.slice(0, 4)] = (years[date.slice(0, 4)] || 0) + 1; });

  return {
    rows: out,
    normalization: sanitizeHistoricalNormalization({
      issues,
      period: {
        minDate: dates[0] || '',
        maxDate: dates[dates.length - 1] || '',
        totalDates: dates.length,
        years,
        dates
      },
      coverage: {
        totalRows: rows.length,
        normalizedRows: out.length
      }
    }),
    fieldCoverage
  };
}

function normalizeRowsWithImmutability(rowsLike) {
  const rows = Array.isArray(rowsLike) ? rowsLike : [];
  const normalizedLegacy = normalizeRows(rows);
  const out = [];
  const dedupe = new Set();
  const dateSet = new Set();
  const issues = {
    ...((normalizedLegacy && normalizedLegacy.normalization && normalizedLegacy.normalization.issues) || {}),
    duplicateRows: 0
  };

  rows.forEach((raw, index) => {
    const map = {};
    Object.keys(raw || {}).forEach((key) => {
      map[normKey(key)] = raw[key];
    });

    const osIdRaw = toText(pickField(map, ['O.S.', 'OS', 'Ordem de Servico']));
    const clientNameRaw = toText(pickField(map, ['Cliente']));
    const cnpjRawInput = toText(pickField(map, ['CNPJ', 'Cnpj', 'cnpj']));
    const filialRaw = toText(pickField(map, ['Filial O.S.', 'Filial']));
    const unidadeRaw = toText(pickField(map, ['Unidade', 'Local', 'Unidade/Local']));
    const dateAtendimentoRaw = pickField(map, ['Data Atendimento']);
    const dateEmissaoRaw = pickField(map, ['Data Emissão', 'Data Emissao']);
    const dateN1Raw = pickField(map, ['N1']);
    const tecnicoRaw = toText(pickField(map, ['Técnico', 'Tecnico']));
    const atendenteRaw = toText(pickField(map, ['Atendente']));
    const modalidadeRaw = toText(pickField(map, ['Modalidade']));
    const siglaRaw = toText(pickField(map, ['Sigla']));
    const apontamentoRaw = toText(pickField(map, ['Apontamento']));
    const tipoClienteRaw = toText(pickField(map, ['Tipo Cliente']));
    const modeloContratoRaw = toText(pickField(map, ['Modelo de Contrato']));
    const numeroContratoRaw = toText(pickField(map, ['N. Contrato', 'Nº Contrato', 'N Contrato']));
    const novoRetornoRaw = toText(pickField(map, ['Novo/Retorno']));
    const defeitoGarantiaRaw = toText(pickField(map, ['Defeito na Garantia']));
    const laudoOkRaw = toText(pickField(map, ['Laudo ok?']));
    const motivoLaudoRaw = toText(pickField(map, ['Motivo Laudo']));
    const modeloRaw = toText(pickField(map, ['Modelo']));
    const equipamentoRaw = toText(pickField(map, ['Equipamento', 'Produto']));
    const numeroSerieRaw = toText(pickField(map, ['Número de Série', 'Numero de Serie', 'N Série', 'N Serie', 'Serie']));
    const statusClassificacaoRaw = toText(pickField(map, ['Status Classificação', 'Status Classificacao']));
    const semDebitoRaw = toText(pickField(map, ['Sem Débito', 'Sem Debito']));
    const pedidoInstalacaoRaw = toText(pickField(map, ['Pedido Instalação', 'Pedido Instalacao']));

    const osId = normalizeSpaces(osIdRaw).toUpperCase();
    const clientName = normalizeSpaces(clientNameRaw);
    const cnpjRaw = normalizeSpaces(cnpjRawInput);
    const cnpjNormalized = normalizeCnpj(cnpjRaw);
    const clientNameNormalized = canonicalKey(clientName);
    const clientIdentityAnchor = cnpjNormalized ? `cnpj:${cnpjNormalized}` : `nome:${clientNameNormalized || 'cliente_nao_identificado'}`;
    const clientIdentityComposite = `${cnpjNormalized || 'sem_cnpj'}::${clientNameNormalized || 'cliente_nao_identificado'}`;
    const clientIdentityQuality = cnpjNormalized && clientNameNormalized
      ? 'high'
      : (clientNameNormalized ? 'medium' : 'low');
    const filial = normalizeSpaces(filialRaw);
    const unidade = normalizeSpaces(unidadeRaw);
    const dateAtendimento = parseDate(dateAtendimentoRaw);
    const dateEmissao = parseDate(dateEmissaoRaw);
    const dateN1 = parseDate(dateN1Raw);
    const dateRef = dateAtendimento || dateEmissao || dateN1;
    const tecnico = normalizeSpaces(tecnicoRaw);
    const atendente = normalizeSpaces(atendenteRaw);
    const modalidade = normalizeSpaces(modalidadeRaw);
    const sigla = normalizeSpaces(siglaRaw);
    const apontamento = normalizeSpaces(apontamentoRaw);
    const tipoCliente = normalizeSpaces(tipoClienteRaw);
    const modeloContrato = normalizeSpaces(modeloContratoRaw);
    const numeroContrato = normalizeSpaces(numeroContratoRaw);
    const novoRetorno = normalizeSpaces(novoRetornoRaw);
    const defeitoGarantia = normalizeSpaces(defeitoGarantiaRaw);
    const laudoOk = normalizeSpaces(laudoOkRaw);
    const motivoLaudo = normalizeSpaces(motivoLaudoRaw);
    const modelo = normalizeSpaces(modeloRaw);
    const equipamento = normalizeSpaces(equipamentoRaw);
    const numeroSerie = normalizeSpaces(numeroSerieRaw);

    if (!dateRef || !clientName) return;
    const technicianName = tecnico || atendente || 'Tecnico nao identificado';
    const technicianSource = tecnico ? 'tecnico' : (atendente ? 'atendente' : 'nao_identificado');
    const sourceConfidence = tecnico ? 0.95 : (atendente ? 0.55 : 0.2);

    const dedupeFingerprint = hashCompact({
      dateRef,
      osId: osId || `sem_os_${index + 1}`,
      clientKey: clientIdentityAnchor,
      cnpj: cnpjNormalized,
      filialKey: canonicalKey(filial || unidade || clientName),
      technicianKey: canonicalKey(technicianName),
      modalidade: normKey(modalidade),
      sigla: normKey(sigla),
      apontamento: normKey(apontamento),
      laudoOk: normKey(laudoOk),
      motivoLaudo: normKey(motivoLaudo),
      defeitoGarantia: normKey(defeitoGarantia),
      modelo: normKey(modelo),
      equipamento: normKey(equipamento),
      numeroSerie: normKey(numeroSerie)
    });
    const dedupeKey = `${dateRef}|${osId || `sem_os_${index + 1}`}|${dedupeFingerprint}`;
    if (dedupe.has(dedupeKey)) {
      issues.duplicateRows = Math.max(0, Number(issues.duplicateRows || 0)) + 1;
      return;
    }
    dedupe.add(dedupeKey);
    dateSet.add(dateRef);

    const serviceType = detectServiceType(modalidade, sigla, apontamento);
    const warranty = detectWarranty(apontamento, defeitoGarantia, tipoCliente, modeloContrato);
    const probableCause = detectProbableCause(sigla, apontamento, defeitoGarantia, motivoLaudo);
    const outcomeType = detectOutcomeType(laudoOk, motivoLaudo, apontamento, novoRetorno);
    const isReturn = normKey(novoRetorno).includes('retorno');
    const hasWeakLaudo = normKey(laudoOk).includes('nao') || (hasVal(motivoLaudo) && !normKey(motivoLaudo).includes('naoseaplica'));
    const hasNoPartSuspect = serviceType === 'corretiva' && hasVal(defeitoGarantia) && !normKey(defeitoGarantia).includes('peca');
    const isCriticalSignal = isReturn || hasWeakLaudo || outcomeType !== 'resolvido';

    const recordUid = `hos_${hashCompact({
      dateRef,
      osId: osId || `sem_os_${index + 1}`,
      clientKey: clientIdentityAnchor,
      cnpj: cnpjNormalized,
      filialKey: canonicalKey(filial || unidade || clientName),
      technicianKey: canonicalKey(technicianName),
      sigla: normKey(sigla),
      apontamento: normKey(apontamento),
      motivoLaudo: normKey(motivoLaudo),
      defeitoGarantia: normKey(defeitoGarantia),
      modelo: normKey(modelo),
      equipamento: normKey(equipamento),
      numeroSerie: normKey(numeroSerie)
    }).slice(0, 24)}`;

    out.push({
      rowNumber: index + 2,
      recordUid,
      historicalVersion: 1,
      dateRef,
      monthRef: dateRef.slice(0, 7),
      osId,
      clientName,
      clientNameNormalized,
      cnpjRaw,
      cnpjNormalized,
      clientKey: clientIdentityAnchor,
      clientIdentityComposite,
      clientIdentityQuality,
      filial,
      unidade,
      filialKey: canonicalKey(filial || unidade || clientName),
      technicianName,
      technicianKey: canonicalKey(technicianName),
      technicianSource,
      sourceConfidence,
      attendantName: atendente,
      modalidade,
      sigla,
      apontamento,
      tipoCliente,
      modeloContrato,
      numeroContrato,
      novoRetorno,
      defeitoGarantia,
      laudoOk,
      motivoLaudo,
      statusClassificacao: normalizeSpaces(statusClassificacaoRaw),
      semDebito: normalizeSpaces(semDebitoRaw),
      pedidoInstalacao: normalizeSpaces(pedidoInstalacaoRaw),
      modelo,
      equipamento,
      numeroSerie,
      serviceType,
      warrantyStatus: warranty.warrantyStatus,
      warrantyType: warranty.warrantyType,
      probableCause,
      outcomeType,
      isReturn,
      hasWeakLaudo,
      hasNoPartSuspect,
      isCriticalSignal,
      dateAtendimento,
      dateEmissao,
      dateN1,
      originalSnapshot: {
        osId: osIdRaw,
        clientName: clientNameRaw,
        cnpj: cnpjRawInput,
        filial: filialRaw,
        unidade: unidadeRaw,
        tecnico: tecnicoRaw,
        atendente: atendenteRaw,
        modalidade: modalidadeRaw,
        sigla: siglaRaw,
        apontamento: apontamentoRaw,
        tipoCliente: tipoClienteRaw,
        modeloContrato: modeloContratoRaw,
        numeroContrato: numeroContratoRaw,
        novoRetorno: novoRetornoRaw,
        defeitoGarantia: defeitoGarantiaRaw,
        laudoOk: laudoOkRaw,
        motivoLaudo: motivoLaudoRaw,
        modelo: modeloRaw,
        equipamento: equipamentoRaw,
        numeroSerie: numeroSerieRaw,
        statusClassificacao: statusClassificacaoRaw,
        semDebito: semDebitoRaw,
        pedidoInstalacao: pedidoInstalacaoRaw,
        dateAtendimento: toText(dateAtendimentoRaw),
        dateEmissao: toText(dateEmissaoRaw),
        dateN1: toText(dateN1Raw)
      },
      normalizedSnapshot: {
        dateRef,
        monthRef: dateRef.slice(0, 7),
        osId,
        clientName,
        cnpjNormalized,
        clientIdentityAnchor,
        filial,
        unidade,
        technicianName,
        modalidade,
        sigla,
        apontamento,
        novoRetorno,
        warrantyStatus: warranty.warrantyStatus,
        warrantyType: warranty.warrantyType
      },
      analysisSnapshot: {
        serviceType,
        probableCause,
        outcomeType,
        isReturn,
        hasWeakLaudo,
        hasNoPartSuspect,
        isCriticalSignal
      },
      lineage: {
        sourceSheetRow: index + 2,
        normalizedAt: nowIso(),
        dedupeFingerprint,
        technicianSource,
        sourceConfidence
      }
    });
  });

  const dates = Array.from(dateSet.values()).sort((a, b) => a.localeCompare(b));
  const years = {};
  dates.forEach((date) => { years[date.slice(0, 4)] = (years[date.slice(0, 4)] || 0) + 1; });

  return {
    rows: out,
    normalization: sanitizeHistoricalNormalization({
      issues,
      period: {
        minDate: dates[0] || '',
        maxDate: dates[dates.length - 1] || '',
        totalDates: dates.length,
        years,
        dates
      },
      coverage: {
        totalRows: rows.length,
        normalizedRows: out.length
      }
    }),
    fieldCoverage: (normalizedLegacy && normalizedLegacy.fieldCoverage) || {}
  };
}

function buildEmptyHistoricalStore(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale);
  const thresholds = normalizeThresholds(opts.thresholds);
  return {
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    generatedAt: nowIso(),
    source: {
      exists: false,
      workbookPath: '',
      workbookName: '',
      workbookSignature: '',
      workbookSizeBytes: 0,
      workbookMtimeMs: 0,
      sheetName: '',
      importedRows: 0
    },
    locale,
    thresholds,
    normalization: sanitizeHistoricalNormalization({}),
    fieldCoverage: {},
    rows: []
  };
}

function computeWorkbookSignature(filePath) {
  const fullPath = toText(filePath);
  if (!fullPath || !fs.existsSync(fullPath)) return '';
  try {
    const stat = fs.statSync(fullPath);
    return `${Number(stat.size || 0)}:${Math.round(Number(stat.mtimeMs || 0))}`;
  } catch (_) {
    return '';
  }
}

function resolveDefaultHistoricalWorkbookPath(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const explicit = toText(opts.filePath || opts.workbookPath || '');
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  const envPath = toText(process.env.PAINEL_HISTORICAL_XLSX_PATH || '');
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);

  const candidates = [
    path.join(os.homedir(), 'Downloads'),
    path.join('C:\\', 'Painel_Operacional_Corrigido', 'data', 'import', 'campinas')
  ];
  for (const folder of candidates) {
    if (!folder || !fs.existsSync(folder)) continue;
    const list = fs.readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && String(entry.name).toLowerCase().endsWith('.xlsx'))
      .map((entry) => {
        const filePath = path.join(folder, entry.name);
        let mtime = 0;
        try { mtime = Number(fs.statSync(filePath).mtimeMs || 0); } catch (_) { mtime = 0; }
        const key = normKey(entry.name);
        let score = 0;
        if (key.includes('classificacoes')) score += 10;
        if (key.includes('analise')) score += 8;
        if (key.includes('historico')) score += 6;
        return { filePath, score, mtime };
      })
      .sort((a, b) => b.score - a.score || b.mtime - a.mtime);
    if (list[0]?.filePath) return path.resolve(list[0].filePath);
  }
  return '';
}

function getGlobalPdfRecords() {
  if (typeof window === 'undefined') return [];
  return Array.isArray(window.__FSM_PDF_RECORDS__) ? window.__FSM_PDF_RECORDS__ : [];
}

function normalizePdfRecordsForHistorical(recordsLike, locale) {
  const records = Array.isArray(recordsLike) ? recordsLike : [];
  const rows = records.map((itemLike, index) => {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const dateRef = normalizeDateKey(item.data || item.data_atendimento || item.dataAtendimento || item.createdAt) || localIso(new Date());
    const clientName = normalizeSpaces(item.cliente || item.clientName || item.razao_social || 'Cliente PDF');
    const technicianName = normalizeSpaces(item.tecnico || item.technicianName || item.responsavelTecnico || item.responsavel || 'Tecnico PDF');
    const osId = normalizeSpaces(item.os || item.os_numero || item.numero_os || item.id || `PDF_${index + 1}`).toUpperCase();
    const apontamento = normalizeSpaces(item.solucao || item.laudo || item.observacao || item.acaoFeita || item.acao_feita || '');
    const modalidade = normalizeSpaces(item.tipo_servico || item.tipoServico || item.tipo_atendimento || '');
    const modelo = normalizeSpaces(item.equipamento || item.produto || item.descricao_produto || item.modelo || '');
    const motivoLaudo = normalizeSpaces(item.solucao || item.laudo || item.observacao || '');
    const technicianKey = canonicalKey(technicianName);
    const clientKey = canonicalKey(clientName);

    return {
      rowNumber: index + 2,
      dateRef,
      monthRef: dateRef.slice(0, 7),
      osId,
      clientName,
      cnpjRaw: normalizeSpaces(item.cnpj || ''),
      cnpjNormalized: normalizeCnpj(item.cnpj || ''),
      clientIdentityQuality: clientName ? 'medium' : 'low',
      clientKey,
      filial: normalizeSpaces(item.filial || 'Campinas'),
      filialKey: canonicalKey(item.filial || clientName || 'Campinas'),
      technicianName,
      technicianKey,
      technicianSource: item.tecnico || item.technicianName ? 'tecnico' : 'pdf_global',
      sourceConfidence: item.tecnico || item.technicianName ? 0.95 : 0.55,
      attendantName: '',
      modalidade,
      sigla: normalizeSpaces(item.sigla || ''),
      apontamento,
      tipoCliente: normalizeSpaces(item.tipo_cliente || item.tipoCliente || ''),
      modeloContrato: normalizeSpaces(item.contrato || item.modeloContrato || ''),
      numeroContrato: normalizeSpaces(item.numeroContrato || ''),
      novoRetorno: item.isRecurrent ? 'Retorno' : '',
      defeitoGarantia: normalizeSpaces(item.defeitoGarantia || ''),
      laudoOk: motivoLaudo ? 'Sim' : 'Nao',
      motivoLaudo,
      statusClassificacao: normalizeSpaces(item.classificacao || item.status || ''),
      semDebito: normalizeSpaces(item.semDebito || ''),
      pedidoInstalacao: normalizeSpaces(item.pedidoInstalacao || ''),
      modelo,
      serviceType: detectServiceType(modalidade, item.sigla || '', apontamento),
      warranty: detectWarranty(apontamento, item.defeitoGarantia || '', item.tipoCliente || '', item.modeloContrato || ''),
      probableCause: detectProbableCause(item.sigla || '', apontamento, item.defeitoGarantia || '', motivoLaudo),
      outcomeType: detectOutcomeType(motivoLaudo ? 'Sim' : 'Nao', motivoLaudo, apontamento, item.isRecurrent ? 'Retorno' : ''),
      isReturn: Boolean(item.isRecurrent),
      isCriticalSignal: Boolean(item.isRecurrent) || !motivoLaudo
    };
  });

  return {
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    generatedAt: nowIso(),
    locale: detectLocale(locale),
    source: {
      exists: true,
      workbookPath: 'window.__FSM_PDF_RECORDS__',
      workbookName: 'FSM PDF Records',
      workbookSignature: hashCompact(records.map((item) => item.osId || item.os || item.os_numero || '').join('|')),
      importedRows: records.length
    },
    thresholds: normalizeThresholds({}),
    normalization: sanitizeHistoricalNormalization({ totalRows: records.length, normalizedRows: rows.length }),
    fieldCoverage: {
      statusClassificacaoFilled: rows.filter((row) => hasVal(row.statusClassificacao)).length,
      semDebitoFilled: rows.filter((row) => hasVal(row.semDebito)).length,
      pedidoInstalacaoFilled: rows.filter((row) => hasVal(row.pedidoInstalacao)).length,
      modeloContratoFilled: rows.filter((row) => hasVal(row.modeloContrato)).length,
      tecnicoFilled: rows.filter((row) => hasVal(row.technicianName)).length,
      statusClassificacaoCoveragePct: pct(rows.filter((row) => hasVal(row.statusClassificacao)).length, records.length),
      semDebitoCoveragePct: pct(rows.filter((row) => hasVal(row.semDebito)).length, records.length),
      pedidoInstalacaoCoveragePct: pct(rows.filter((row) => hasVal(row.pedidoInstalacao)).length, records.length),
      modeloContratoCoveragePct: pct(rows.filter((row) => hasVal(row.modeloContrato)).length, records.length),
      tecnicoCoveragePct: pct(rows.filter((row) => hasVal(row.technicianName)).length, records.length)
    },
    rows
  };
}

function mapClientStatus(daysWithoutService, thresholds, itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const hasRelevantHistory = Number(item.totalOs || 0) >= 6
    || Number(item.correctiveCount || 0) >= 4
    || Number(item.criticalCount || 0) >= 2
    || Number(item.contractCount || 0) > 0;
  if (daysWithoutService > thresholds.criticalCommercialDays && hasRelevantHistory) return 'critico_comercial';
  if (daysWithoutService <= thresholds.activeMaxDays) return 'ativo';
  if (daysWithoutService <= thresholds.attentionMaxDays) return 'atencao';
  if (daysWithoutService <= thresholds.alertMaxDays) return 'alerta';
  return 'oportunidade';
}

function buildClientRecommendation(item, locale) {
  const isEn = locale === 'en-US';
  const suggestions = [];
  if (item.status === 'critico_comercial') {
    suggestions.push(isEn ? 'Immediate commercial reactivation and executive follow-up.' : 'Reativacao comercial imediata com acompanhamento executivo.');
    suggestions.push(isEn ? 'Schedule consultative visit with technical leadership.' : 'Agendar visita consultiva com lideranca tecnica.');
  }
  if (item.preventiveGapDays >= 365 || item.preventiveRatePct <= 5) {
    suggestions.push(isEn ? 'Offer ad-hoc preventive package.' : 'Ofertar preventiva avulsa.');
  }
  if (item.recurrenceRatePct >= 22 || item.criticalRatePct >= 18) {
    suggestions.push(isEn ? 'Run focused technical review and root-cause action plan.' : 'Executar revisao tecnica focada e plano de causa raiz.');
  }
  if (item.correctiveCount >= 8 || item.equipmentCount >= 4) {
    suggestions.push(isEn ? 'Propose modernization/update path for recurrent equipment.' : 'Propor atualizacao para equipamentos recorrentes.');
  }
  if (item.status === 'alerta' || item.status === 'oportunidade') {
    suggestions.push(isEn ? 'Schedule consultative visit and account cadence recovery.' : 'Programar visita consultiva e recuperar cadencia da conta.');
  }
  if (!suggestions.length) {
    suggestions.push(isEn ? 'Maintain active monitoring cadence.' : 'Manter cadencia ativa de acompanhamento.');
  }
  return Array.from(new Set(suggestions)).slice(0, 5);
}

function buildClientIntelligence(rows, referenceDate, locale, thresholds) {
  const nameToCnpjCounter = new Map();
  rows.forEach((row) => {
    const cnpjNormalized = normalizeCnpj(row.cnpjNormalized || row.cnpjRaw || '');
    const nameNormalized = row.clientNameNormalized || canonicalKey(row.clientName || '');
    if (!cnpjNormalized || !nameNormalized) return;
    if (!nameToCnpjCounter.has(nameNormalized)) nameToCnpjCounter.set(nameNormalized, new Map());
    const bucket = nameToCnpjCounter.get(nameNormalized);
    bucket.set(cnpjNormalized, Number(bucket.get(cnpjNormalized) || 0) + 1);
  });

  const nameToPreferredCnpj = new Map();
  for (const [nameNormalized, cnpjCountMap] of nameToCnpjCounter.entries()) {
    const ordered = Array.from(cnpjCountMap.entries()).sort((a, b) => {
      const delta = Number(b[1] || 0) - Number(a[1] || 0);
      if (delta !== 0) return delta;
      return String(a[0] || '').localeCompare(String(b[0] || ''));
    });
    if (ordered.length && ordered[0][0]) nameToPreferredCnpj.set(nameNormalized, String(ordered[0][0]));
  }

  const map = new Map();
  rows.forEach((row) => {
    const cnpjRawFromRow = normalizeCnpj(row.cnpjNormalized || row.cnpjRaw || '');
    const nameNormalized = row.clientNameNormalized || canonicalKey(row.clientName || 'cliente_nao_identificado');
    const inferredCnpjByName = !cnpjRawFromRow && nameNormalized ? String(nameToPreferredCnpj.get(nameNormalized) || '') : '';
    const cnpjNormalized = cnpjRawFromRow || inferredCnpjByName;
    const identityAnchor = cnpjNormalized ? `cnpj:${cnpjNormalized}` : `nome:${nameNormalized || 'cliente_nao_identificado'}`;
    const reconciledByName = !cnpjRawFromRow && !!inferredCnpjByName;
    if (!map.has(identityAnchor)) {
      map.set(identityAnchor, {
        clientIdentityKey: identityAnchor,
        cnpjNormalized,
        cnpjRaw: cnpjRawFromRow || row.cnpjRaw || '',
        totalOs: 0,
        firstDate: row.dateRef,
        lastDate: row.dateRef,
        lastPreventiveDate: '',
        returnCount: 0,
        criticalCount: 0,
        preventiveCount: 0,
        correctiveCount: 0,
        warrantyCount: 0,
        warrantyServiceCount: 0,
        contractCount: 0,
        rowsWithoutCnpj: 0,
        rowsReconciledByName: 0,
        equipmentSet: new Set(),
        unitSet: new Set(),
        aliasMap: new Map()
      });
    }
    const item = map.get(identityAnchor);
    item.totalOs += 1;
    if (row.dateRef < item.firstDate) item.firstDate = row.dateRef;
    if (row.dateRef > item.lastDate) item.lastDate = row.dateRef;
    if (row.isReturn) item.returnCount += 1;
    if (row.isCriticalSignal) item.criticalCount += 1;
    if (row.serviceType === 'preventiva') {
      item.preventiveCount += 1;
      if (!item.lastPreventiveDate || row.dateRef > item.lastPreventiveDate) item.lastPreventiveDate = row.dateRef;
    }
    if (row.serviceType === 'corretiva') item.correctiveCount += 1;
    if (row.warrantyStatus === 'em_garantia') item.warrantyCount += 1;
    if (row.warrantyType === 'garantia_servico_instalacao') item.warrantyServiceCount += 1;
    if (hasVal(row.modeloContrato) || hasVal(row.numeroContrato)) item.contractCount += 1;
    if (!cnpjRawFromRow) item.rowsWithoutCnpj += 1;
    if (reconciledByName) item.rowsReconciledByName += 1;
    if (hasVal(row.equipamento || row.modelo)) item.equipmentSet.add(row.equipamento || row.modelo);
    if (hasVal(row.unidade || row.filial)) item.unitSet.add(row.unidade || row.filial);
    const aliasName = normalizeSpaces(row.clientName || '');
    if (aliasName) {
      const current = item.aliasMap.get(aliasName) || 0;
      item.aliasMap.set(aliasName, current + 1);
    }
  });

  const items = Array.from(map.values()).map((item) => {
    const aliasesOrdered = Array.from(item.aliasMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const nomePrincipal = aliasesOrdered[0]?.[0] || 'Cliente nao identificado';
    const nomesAlternativos = aliasesOrdered.slice(1).map(([name]) => name).slice(0, 12);
    const daysWithoutService = diffDays(item.lastDate, referenceDate);
    const recurrenceRatePct = pct(item.returnCount, item.totalOs);
    const criticalRatePct = pct(item.criticalCount, item.totalOs);
    const preventiveRatePct = pct(item.preventiveCount, item.totalOs);
    const warrantyRatePct = pct(item.warrantyCount, item.totalOs);
    const warrantyServiceRatePct = pct(item.warrantyServiceCount, item.totalOs);
    const preventiveGapDays = item.lastPreventiveDate ? diffDays(item.lastPreventiveDate, referenceDate) : daysWithoutService;
    const status = mapClientStatus(daysWithoutService, thresholds, item);
    const identityQuality = item.cnpjNormalized
      ? 'high'
      : (nomePrincipal && nomePrincipal !== 'Cliente nao identificado' ? 'medium' : 'low');
    const suggestedActions = buildClientRecommendation({
      ...item,
      status,
      recurrenceRatePct,
      criticalRatePct,
      preventiveRatePct,
      preventiveGapDays,
      equipmentCount: item.equipmentSet.size
    }, locale);

    return {
      clientKey: `${item.cnpjNormalized || 'sem_cnpj'}::${canonicalKey(nomePrincipal || 'cliente_nao_identificado')}`,
      clientIdentityKey: item.clientIdentityKey,
      clientName: nomePrincipal,
      cnpj: item.cnpjNormalized || '',
      clientIdentityQuality: identityQuality,
      nomesAlternativos,
      units: Array.from(item.unitSet.values()).slice(0, 20),
      equipment: Array.from(item.equipmentSet.values()).slice(0, 20),
      totalOs: item.totalOs,
      firstDate: item.firstDate,
      lastDate: item.lastDate,
      lastPreventiveDate: item.lastPreventiveDate || '',
      daysWithoutService,
      preventiveGapDays,
      returnCount: item.returnCount,
      criticalCount: item.criticalCount,
      preventiveCount: item.preventiveCount,
      correctiveCount: item.correctiveCount,
      warrantyCount: item.warrantyCount,
      warrantyServiceCount: item.warrantyServiceCount,
      recurrenceRatePct,
      criticalRatePct,
      preventiveRatePct,
      warrantyRatePct,
      warrantyServiceRatePct,
      rowsWithoutCnpj: item.rowsWithoutCnpj,
      rowsReconciledByName: item.rowsReconciledByName,
      status,
      recommendation: suggestedActions[0] || '',
      suggestedActions
    };
  });

  const severityOrder = { critico_comercial: 5, oportunidade: 4, alerta: 3, atencao: 2, ativo: 1 };
  items.sort((a, b) => {
    const sev = (severityOrder[b.status] || 0) - (severityOrder[a.status] || 0);
    if (sev !== 0) return sev;
    return b.daysWithoutService - a.daysWithoutService || b.totalOs - a.totalOs;
  });

  const byStatus = {
    ativo: items.filter((item) => item.status === 'ativo').length,
    atencao: items.filter((item) => item.status === 'atencao').length,
    alerta: items.filter((item) => item.status === 'alerta').length,
    oportunidade: items.filter((item) => item.status === 'oportunidade').length,
    critico_comercial: items.filter((item) => item.status === 'critico_comercial').length
  };
  const byIdentityQuality = {
    high: items.filter((item) => item.clientIdentityQuality === 'high').length,
    medium: items.filter((item) => item.clientIdentityQuality === 'medium').length,
    low: items.filter((item) => item.clientIdentityQuality === 'low').length
  };

  return {
    thresholds,
    summary: {
      totalClients: items.length,
      totalCnpj: new Set(items.map((item) => item.cnpj).filter(Boolean)).size,
      clientsWithoutCnpj: items.filter((item) => !item.cnpj).length,
      byStatus,
      byIdentityQuality,
      topOpportunityCount: byStatus.oportunidade + byStatus.critico_comercial,
      rowsReconciledByName: items.reduce((acc, item) => acc + Number(item.rowsReconciledByName || 0), 0)
    },
    opportunities: items.filter((item) => ['critico_comercial', 'alerta', 'oportunidade'].includes(item.status)).slice(0, 40),
    ranking: items.slice(0, 120)
  };
}

function buildTechnicianNarrative(item, locale) {
  const isEn = locale === 'en-US';
  const strengths = [];
  const attention = [];
  const actions = [];

  if (item.resolvedRatePct >= 75) strengths.push(isEn ? 'Strong resolution consistency.' : 'Boa consistencia de resolucao.');
  if (item.preventiveRatePct >= 20) strengths.push(isEn ? 'Healthy preventive mix.' : 'Mix preventivo saudavel.');
  if (item.returnRatePct >= 20) attention.push(isEn ? 'High return rate.' : 'Taxa de retorno elevada.');
  if (item.warrantyServiceRatePct >= 15) attention.push(isEn ? 'Service warranty recurrence above target.' : 'Recorrencia em garantia de servico acima do alvo.');
  if (item.weakLaudoRatePct >= 25) attention.push(isEn ? 'Weak report quality pattern.' : 'Padrao de laudo fraco.');
  if (item.noPartSuspectRatePct >= 15) attention.push(isEn ? 'Repeated no-part suspect cases.' : 'Casos suspeitos sem peca recorrentes.');

  if (attention.length) actions.push(isEn ? 'Run focused coaching and peer review for top recurring causes.' : 'Executar coaching focado e revisao por pares nas causas recorrentes.');
  if (!actions.length) actions.push(isEn ? 'Maintain weekly quality sampling.' : 'Manter amostragem semanal de qualidade.');

  return {
    strengths,
    attention,
    actions
  };
}

function buildTechnicianIntelligence(rows, locale) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.technicianKey || canonicalKey(row.technicianName || 'tecnico_nao_identificado');
    if (!map.has(key)) {
      map.set(key, {
        technicianKey: key,
        technicianName: row.technicianName || 'Tecnico nao identificado',
        sourceConfidenceAvg: 0,
        sourceConfidenceSum: 0,
        sourceConfidenceCount: 0,
        totalOs: 0,
        returnCount: 0,
        warrantyServiceCount: 0,
        warrantyTotalCount: 0,
        weakLaudoCount: 0,
        noPartSuspectCount: 0,
        unresolvedCount: 0,
        preventiveCount: 0,
        criticalCount: 0
      });
    }
    const item = map.get(key);
    item.totalOs += 1;
    item.sourceConfidenceSum += Number(row.sourceConfidence || 0);
    item.sourceConfidenceCount += 1;
    if (row.isReturn) item.returnCount += 1;
    if (row.warrantyType === 'garantia_servico_instalacao') item.warrantyServiceCount += 1;
    if (row.warrantyStatus === 'em_garantia') item.warrantyTotalCount += 1;
    if (row.hasWeakLaudo) item.weakLaudoCount += 1;
    if (row.hasNoPartSuspect) item.noPartSuspectCount += 1;
    if (row.outcomeType !== 'resolvido') item.unresolvedCount += 1;
    if (row.serviceType === 'preventiva') item.preventiveCount += 1;
    if (row.isCriticalSignal) item.criticalCount += 1;
  });

  const ranking = Array.from(map.values()).map((item) => {
    const returnRatePct = pct(item.returnCount, item.totalOs);
    const warrantyServiceRatePct = pct(item.warrantyServiceCount, item.totalOs);
    const warrantyTotalRatePct = pct(item.warrantyTotalCount, item.totalOs);
    const weakLaudoRatePct = pct(item.weakLaudoCount, item.totalOs);
    const noPartSuspectRatePct = pct(item.noPartSuspectCount, item.totalOs);
    const unresolvedRatePct = pct(item.unresolvedCount, item.totalOs);
    const preventiveRatePct = pct(item.preventiveCount, item.totalOs);
    const resolvedRatePct = pct(item.totalOs - item.unresolvedCount, item.totalOs);

    const penalty = (returnRatePct * 0.35)
      + (warrantyServiceRatePct * 0.25)
      + (weakLaudoRatePct * 0.2)
      + (noPartSuspectRatePct * 0.15)
      + (unresolvedRatePct * 0.15);
    const bonus = (resolvedRatePct * 0.1) + (preventiveRatePct * 0.05);
    const technicalScore = clamp(Math.round((100 - penalty + bonus) * 100) / 100, 0, 100);

    const narrative = buildTechnicianNarrative({
      ...item,
      returnRatePct,
      warrantyServiceRatePct,
      weakLaudoRatePct,
      noPartSuspectRatePct,
      resolvedRatePct,
      preventiveRatePct
    }, locale);

    return {
      technicianKey: item.technicianKey,
      technicianName: item.technicianName,
      totalOs: item.totalOs,
      sourceConfidenceAvg: item.sourceConfidenceCount > 0
        ? Math.round((item.sourceConfidenceSum / item.sourceConfidenceCount) * 10000) / 10000
        : 0,
      returnRatePct,
      warrantyServiceRatePct,
      warrantyTotalRatePct,
      weakLaudoRatePct,
      noPartSuspectRatePct,
      unresolvedRatePct,
      preventiveRatePct,
      resolvedRatePct,
      technicalScore,
      narrative
    };
  });

  ranking.sort((a, b) => b.technicalScore - a.technicalScore || b.totalOs - a.totalOs || a.technicianName.localeCompare(b.technicianName));
  return {
    summary: {
      totalTechnicians: ranking.length,
      avgTechnicalScore: ranking.length
        ? Math.round((ranking.reduce((acc, item) => acc + item.technicalScore, 0) / ranking.length) * 100) / 100
        : 0,
      lowConfidenceTechnicians: ranking.filter((item) => item.sourceConfidenceAvg < 0.6).length
    },
    ranking: ranking.slice(0, 120)
  };
}

function summarizeMetrics(rows) {
  const totalOs = rows.length;
  const counts = {
    corretiva: 0,
    preventiva: 0,
    garantia: 0,
    retorno: 0,
    retrabalho: 0
  };
  rows.forEach((row) => {
    if (row.serviceType === 'corretiva') counts.corretiva += 1;
    if (row.serviceType === 'preventiva') counts.preventiva += 1;
    if (row.warrantyStatus === 'em_garantia') counts.garantia += 1;
    if (row.isReturn) counts.retorno += 1;
    if (row.hasWeakLaudo || row.hasNoPartSuspect) counts.retrabalho += 1;
  });
  return {
    totalOs,
    corretiva: counts.corretiva,
    preventiva: counts.preventiva,
    garantia: counts.garantia,
    retorno: counts.retorno,
    retrabalho: counts.retrabalho,
    qualityScore: totalOs > 0 ? clamp(Math.round((100 - pct(counts.retrabalho, totalOs)) * 100) / 100, 0, 100) : 0
  };
}

function compareMetrics(current, reference) {
  const safeCurrent = current || summarizeMetrics([]);
  const safeReference = reference || summarizeMetrics([]);
  const fields = ['totalOs', 'corretiva', 'preventiva', 'garantia', 'retorno', 'retrabalho', 'qualityScore'];
  const delta = {};
  fields.forEach((field) => {
    const currentValue = Number(safeCurrent[field] || 0);
    const referenceValue = Number(safeReference[field] || 0);
    const abs = Math.round((currentValue - referenceValue) * 100) / 100;
    const pctValue = referenceValue === 0
      ? (currentValue === 0 ? 0 : 100)
      : Math.round((((currentValue - referenceValue) / Math.abs(referenceValue)) * 100) * 100) / 100;
    delta[field] = { abs, pct: pctValue };
  });
  return delta;
}

function getMonthRange(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const from = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = addDays(nextMonth, -1);
  return { from, to };
}

function getQuarterRange(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const quarterIndex = Math.floor((month - 1) / 3);
  const startMonth = (quarterIndex * 3) + 1;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const endMonth = startMonth + 2;
  const nextMonth = endMonth === 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;
  const to = addDays(nextMonth, -1);
  return { from, to };
}

function getYtdRange(dateKey) {
  const year = dateKey.slice(0, 4);
  return { from: `${year}-01-01`, to: dateKey };
}

function shiftYear(value, amount) {
  const date = normalizeDateKey(value);
  if (!date) return '';
  const year = Number(date.slice(0, 4)) + amount;
  return `${String(year).padStart(4, '0')}-${date.slice(5)}`;
}

function filterRowsByRange(rows, from, to) {
  return rows.filter((row) => row.dateRef >= from && row.dateRef <= to);
}

function buildPeriodComparative(label, rows, currentRange, referenceRange, locale) {
  const currentRows = filterRowsByRange(rows, currentRange.from, currentRange.to);
  const referenceRows = filterRowsByRange(rows, referenceRange.from, referenceRange.to);
  const current = summarizeMetrics(currentRows);
  const reference = summarizeMetrics(referenceRows);
  const delta = compareMetrics(current, reference);
  const isEn = locale === 'en-US';

  return {
    label,
    currentPeriod: currentRange,
    referencePeriod: referenceRange,
    current,
    reference,
    delta,
    executiveRead: isEn
      ? `Current period has ${current.totalOs} orders (${delta.totalOs.abs >= 0 ? '+' : ''}${delta.totalOs.abs} vs reference).`
      : `Periodo atual com ${current.totalOs} O.S. (${delta.totalOs.abs >= 0 ? '+' : ''}${delta.totalOs.abs} vs referencia).`
  };
}

function buildComparatives(rows, referenceDate, locale) {
  const monthRange = getMonthRange(referenceDate);
  const quarterRange = getQuarterRange(referenceDate);
  const ytdRange = getYtdRange(referenceDate);

  const monthRef = { from: shiftYear(monthRange.from, -1), to: shiftYear(monthRange.to, -1) };
  const quarterRef = { from: shiftYear(quarterRange.from, -1), to: shiftYear(quarterRange.to, -1) };
  const ytdRef = { from: shiftYear(ytdRange.from, -1), to: shiftYear(ytdRange.to, -1) };

  return {
    automatic: {
      monthVsPreviousYear: buildPeriodComparative('month_vs_previous_year', rows, monthRange, monthRef, locale),
      quarterVsPreviousYear: buildPeriodComparative('quarter_vs_previous_year', rows, quarterRange, quarterRef, locale),
      ytdVsPreviousYear: buildPeriodComparative('ytd_vs_previous_year', rows, ytdRange, ytdRef, locale)
    },
    customTemplate: {
      mode: 'custom',
      params: {
        current: { from: '', to: '' },
        reference: { from: '', to: '' }
      }
    }
  };
}

function buildHistoricalComparativesView(storeLike, referenceDateLike, localeRaw, customRangeLike) {
  const locale = detectLocale(localeRaw);
  const referenceDate = normalizeDateKey(referenceDateLike) || localIso(new Date());
  const pdfRecords = getGlobalPdfRecords();
  const store = pdfRecords.length > 0
    ? normalizePdfRecordsForHistorical(pdfRecords, locale)
    : ((storeLike && typeof storeLike === 'object') ? storeLike : buildEmptyHistoricalStore({ locale }));
  const rows = Array.isArray(store.rows) ? store.rows : [];
  const rowsUntilDate = rows.filter((row) => row?.dateRef && row.dateRef <= referenceDate);
  const pdfFallbackRows = pdfRecords.length > 0 ? normalizePdfRecordsForHistorical(pdfRecords, locale).rows : [];
  const comparativeRows = rowsUntilDate.length ? rowsUntilDate : pdfFallbackRows;
  const base = buildComparatives(comparativeRows, referenceDate, locale);
  const leaderFrom = (field) => {
    const map = new Map();
    comparativeRows.forEach((row) => {
      const key = normalizeSpaces(row?.[field] || '') || 'nao_identificado';
      map.set(key, Number(map.get(key) || 0) + 1);
    });
    const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return top ? { name: top[0], total: top[1] } : { name: '', total: 0 };
  };

  const customRaw = (customRangeLike && typeof customRangeLike === 'object') ? customRangeLike : {};
  const customCurrent = {
    from: normalizeDateKey(customRaw.currentFrom),
    to: normalizeDateKey(customRaw.currentTo)
  };
  const customReference = {
    from: normalizeDateKey(customRaw.referenceFrom),
    to: normalizeDateKey(customRaw.referenceTo)
  };

  let custom = null;
  const hasCustom = customCurrent.from && customCurrent.to && customReference.from && customReference.to;
  if (hasCustom) {
    custom = buildPeriodComparative('custom', comparativeRows, customCurrent, customReference, locale);
  }

  return {
    referenceDate,
    locale,
    fallbackUsed: rowsUntilDate.length === 0 && pdfFallbackRows.length > 0 ? 'window.__FSM_PDF_RECORDS__' : '',
    currentPdfLeaders: {
      mixLider: leaderFrom('serviceType'),
      equipamentoLider: leaderFrom('equipamento')
    },
    automatic: base.automatic,
    custom,
    customTemplate: base.customTemplate
  };
}

function filterRowsForPeriod(rowsLike, referenceDateLike, periodLike) {
  const rows = Array.isArray(rowsLike) ? rowsLike : [];
  const referenceDate = normalizeDateKey(referenceDateLike) || localIso(new Date());
  const period = String(periodLike || '').trim().toLowerCase();
  if (period === 'historical') return rows.slice();
  if (period === 'daily') return rows.filter((row) => row?.dateRef === referenceDate);
  if (period === 'quarterly') {
    const range = getQuarterRange(referenceDate);
    return rows.filter((row) => row?.dateRef && row.dateRef >= range.from && row.dateRef <= range.to);
  }
  if (period === 'ytd') {
    const range = getYtdRange(referenceDate);
    return rows.filter((row) => row?.dateRef && row.dateRef >= range.from && row.dateRef <= range.to);
  }
  const monthKey = referenceDate.slice(0, 7);
  return rows.filter((row) => row?.monthRef === monthKey);
}

function buildPanelModularBlueprint(localeRaw) {
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  return {
    version: 'v1',
    generatedAt: nowIso(),
    sections: [
      { id: 'operacao_dia', label: isEn ? 'Day Operations' : 'Operacao do Dia', dataContracts: ['dashboard.daily', 'brain', 'decisionNow'] },
      { id: 'analise_tecnica_interna', label: isEn ? 'Internal Technical Analysis' : 'Analise Tecnica Interna', dataContracts: ['insights.detailedAnalytics.taxonomySummary', 'insights.detailedAnalytics.taxonomyByEquipment', 'insights.detailedAnalytics.taxonomyByTechnician'] },
      { id: 'tecnicos', label: isEn ? 'Technicians' : 'Tecnicos', dataContracts: ['historicalIntelligence.technicians'] },
      { id: 'biblioteca_tecnica_modelos', label: isEn ? 'Technical Library / Templates' : 'Biblioteca Tecnica / Modelos', dataContracts: ['historicalIntelligence.laudoStandards'] },
      { id: 'clientes_oportunidades', label: isEn ? 'Clients / Opportunities' : 'Clientes / Oportunidades', dataContracts: ['historicalIntelligence.clients'] },
      { id: 'laudo_executivo', label: isEn ? 'Executive / Report' : 'Laudo / Executivo', dataContracts: ['insights.detailedAnalytics.technicalNarrativeV2', 'monthlyOs.executiveMonthly'] },
      { id: 'governanca', label: isEn ? 'Governance' : 'Governanca', dataContracts: ['insights.detailedAnalytics.reviewQueueSummary', 'reviewWorkflow', 'audit'] },
      { id: 'comparativos', label: isEn ? 'Comparatives' : 'Comparativos', dataContracts: ['historicalIntelligence.comparatives'] }
    ],
    notes: isEn
      ? 'Modular architecture blueprint without visual redesign in this phase.'
      : 'Desenho de arquitetura modular sem redesign visual nesta fase.'
  };
}

function importHistoricalWorkbook(filePathLike, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale);
  const thresholds = normalizeThresholds(opts.thresholds);
  const referenceDate = normalizeDateKey(opts.referenceDate) || localIso(new Date());

  const workbookPath = resolveDefaultHistoricalWorkbookPath({ filePath: filePathLike });
  if (!workbookPath || !fs.existsSync(workbookPath)) {
    const pdfRecords = getGlobalPdfRecords();
    if (pdfRecords.length > 0) {
      const store = normalizePdfRecordsForHistorical(pdfRecords, locale);
      return {
        ok: true,
        imported: true,
        store,
        importMeta: {
          workbookPath: 'window.__FSM_PDF_RECORDS__',
          sheetName: 'pdf_records',
          importedRows: pdfRecords.length,
          normalizedRows: store.rows.length,
          referenceDate
        }
      };
    }
    return { ok: false, error: 'Arquivo XLSX historico nao encontrado.' };
  }
  if (!xlsxLib) {
    return { ok: false, error: 'Dependencia xlsx indisponivel.' };
  }

  let workbook = null;
  try {
    workbook = xlsxLib.readFile(workbookPath, { cellDates: true, raw: false });
  } catch (error) {
    return { ok: false, error: `Falha ao abrir workbook historico: ${error?.message || String(error)}` };
  }

  const sheetName = workbook.SheetNames.includes('Export') ? 'Export' : (workbook.SheetNames[0] || '');
  if (!sheetName || !workbook.Sheets[sheetName]) {
    return { ok: false, error: 'Workbook historico sem aba valida para importacao.' };
  }

  const rawRows = xlsxLib.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: true
  });
  const normalized = normalizeRowsWithImmutability(rawRows);
  const stat = fs.statSync(workbookPath);

  const store = {
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    generatedAt: nowIso(),
    locale,
    source: {
      exists: true,
      workbookPath,
      workbookName: path.basename(workbookPath),
      workbookSignature: computeWorkbookSignature(workbookPath),
      workbookSizeBytes: Number(stat.size || 0),
      workbookMtimeMs: Number(stat.mtimeMs || 0),
      sheetName,
      importedRows: rawRows.length
    },
    thresholds,
    normalization: normalized.normalization,
    fieldCoverage: {
      ...normalized.fieldCoverage,
      statusClassificacaoCoveragePct: pct(normalized.fieldCoverage.statusClassificacaoFilled, rawRows.length),
      semDebitoCoveragePct: pct(normalized.fieldCoverage.semDebitoFilled, rawRows.length),
      pedidoInstalacaoCoveragePct: pct(normalized.fieldCoverage.pedidoInstalacaoFilled, rawRows.length),
      modeloContratoCoveragePct: pct(normalized.fieldCoverage.modeloContratoFilled, rawRows.length),
      tecnicoCoveragePct: pct(normalized.fieldCoverage.tecnicoFilled, rawRows.length)
    },
    rows: normalized.rows
  };

  return {
    ok: true,
    imported: true,
    store,
    importMeta: {
      workbookPath,
      sheetName,
      importedRows: rawRows.length,
      normalizedRows: normalized.rows.length,
      referenceDate
    }
  };
}

function buildHistoricalIntelligenceView(storeLike, referenceDateLike, localeRaw, options) {
  const locale = detectLocale(localeRaw);
  const referenceDate = normalizeDateKey(referenceDateLike) || localIso(new Date());
  const pdfRecords = getGlobalPdfRecords();
  const store = pdfRecords.length > 0
    ? normalizePdfRecordsForHistorical(pdfRecords, locale)
    : ((storeLike && typeof storeLike === 'object') ? storeLike : buildEmptyHistoricalStore({ locale }));
  const rows = Array.isArray(store.rows) ? store.rows : [];
  const thresholds = normalizeThresholds((options && options.thresholds) || store.thresholds);
  const filters = normalizeHistoricalFilters((options && options.filters) || {});
  const hasFilters = hasActiveHistoricalFilters(filters);
  const periodType = filters.period || 'monthly';
  const allRowsUntilDate = rows.filter((row) => row?.dateRef && row.dateRef <= referenceDate);
  const rowsUntilDate = hasFilters ? applyHistoricalFilters(allRowsUntilDate, filters) : allRowsUntilDate;
  const rowsInSelectedPeriod = filterRowsForPeriod(rowsUntilDate, referenceDate, periodType);
  const minDate = rowsUntilDate.reduce((acc, row) => (!acc || row.dateRef < acc ? row.dateRef : acc), '');
  const maxDate = rowsUntilDate.reduce((acc, row) => (!acc || row.dateRef > acc ? row.dateRef : acc), '');
  const uniqueClients = new Set(rowsUntilDate.map((row) => row.clientKey).filter(Boolean));
  const uniqueTechnicians = new Set(rowsUntilDate.map((row) => row.technicianKey).filter(Boolean));

  const periodRowsForTaxonomy = rowsInSelectedPeriod;
  const detailedAnalytics = buildAnalyticsTaxonomy(periodRowsForTaxonomy, {
    locale,
    periodType,
    periodLabel: periodType === 'daily'
      ? referenceDate
      : (periodType === 'quarterly'
        ? `Q${Math.floor((Number(referenceDate.slice(5, 7)) - 1) / 3) + 1}/${referenceDate.slice(0, 4)}`
        : (periodType === 'ytd'
          ? `YTD ${referenceDate.slice(0, 4)}`
          : (periodType === 'historical' ? (locale === 'en-US' ? 'Full history' : 'Historico completo') : formatMonthLabel(referenceDate.slice(0, 7), locale)))),
    referenceDate
  });

  const clients = buildClientIntelligence(rowsUntilDate, referenceDate, locale, thresholds);
  const technicians = {
    period: {
      type: periodType,
      referenceDate,
      totalRows: rowsInSelectedPeriod.length
    },
    ...buildTechnicianIntelligence(rowsInSelectedPeriod, locale)
  };
  const comparatives = buildComparatives(rowsUntilDate, referenceDate, locale);
  const normalization = sanitizeHistoricalNormalization(store.normalization);

  return {
    version: HISTORICAL_INTELLIGENCE_VERSION,
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    generatedAt: nowIso(),
    locale,
    referenceDate,
    source: {
      ...(store.source || {}),
      exists: !!store?.source?.exists,
      importedRows: Math.max(0, Number(store?.source?.importedRows || 0)),
      normalizedRows: rows.length
    },
    thresholds,
    normalization,
    dataWindow: {
      minDate,
      maxDate,
      totalRows: rowsUntilDate.length,
      totalRowsInSelectedPeriod: rowsInSelectedPeriod.length,
      totalRowsUnfiltered: allRowsUntilDate.length,
      totalClients: uniqueClients.size,
      totalTechnicians: uniqueTechnicians.size
    },
    filters: {
      active: hasFilters,
      applied: filters
    },
    clients,
    technicians,
    comparatives,
    taxonomyBridge: {
      version: detailedAnalytics?.taxonomySummary?.version || 'v2',
      quality: detailedAnalytics?.classificationQuality || {},
      summary: detailedAnalytics?.taxonomySummary || {}
    },
    panelModularBlueprint: buildPanelModularBlueprint(locale)
  };
}

module.exports = {
  HISTORICAL_ANALYTICS_SCHEMA,
  HISTORICAL_ANALYTICS_VERSION,
  DEFAULT_CLIENT_INACTIVITY_THRESHOLDS,
  sanitizeHistoricalNormalization,
  normalizeHistoricalFilters,
  applyHistoricalFilters,
  resolveDefaultHistoricalWorkbookPath,
  importHistoricalWorkbook,
  buildHistoricalComparativesView,
  buildHistoricalIntelligenceView,
  buildPanelModularBlueprint,
  buildEmptyHistoricalStore
};
