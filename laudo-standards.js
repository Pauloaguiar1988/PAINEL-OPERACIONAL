const fs = require('fs');
const os = require('os');
const path = require('path');

const LAUDO_STANDARDS_VERSION = 'laudo_standards_v1';
const LAUDO_STANDARDS_SCHEMA = 'laudo_standards_payload_v2';

function nowIso() {
  return new Date().toISOString();
}

function detectLocale(raw) {
  return String(raw || '').trim().toLowerCase() === 'en-us' ? 'en-US' : 'pt-BR';
}

function toText(v) {
  return (v == null) ? '' : String(v).trim();
}

function norm(v) {
  return toText(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function pct(part, total) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.round((p * 10000) / t) / 100;
}

function readTextFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return String(fs.readFileSync(filePath, 'utf-8') || '').replace(/^\uFEFF/, '');
  } catch (_) {
    return '';
  }
}

function resolveOfficialStandardPath(rawPath) {
  const explicit = toText(rawPath);
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  const envPath = toText(process.env.PAINEL_LAUDO_STANDARD_FILE || '');
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);

  const candidates = [
    path.join(os.homedir(), 'Downloads', 'padrao_laudo_tagus_operacional.txt'),
    path.join('C:\\', 'Painel_Operacional_Corrigido', 'data', 'import', 'modelos', 'padrao_laudo_tagus_operacional.txt')
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
  }
  return '';
}

function parseSectionLines(text, headingHint) {
  const normalized = String(text || '').replace(/\r/g, '');
  const lines = normalized.split('\n');
  const heading = norm(headingHint);
  let active = false;
  const out = [];
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) {
      if (active && out.length) break;
      continue;
    }
    const key = norm(line);
    if (!active && key.includes(heading)) {
      active = true;
      continue;
    }
    if (active) {
      if (/^(bloco|estrutura|regras|frases|observa|modelo)\b/i.test(line) && !/^-/.test(line)) break;
      if (/^\d+[\.\)]\s*/.test(line)) {
        out.push(line.replace(/^\d+[\.\)]\s*/, '').trim());
      } else if (/^[-*]\s+/.test(line)) {
        out.push(line.replace(/^[-*]\s+/, '').trim());
      }
    }
  }
  return out.filter(Boolean);
}

const MASTER_MODEL = Object.freeze({
  blocks: [
    { id: 'identificacao', required: ['os', 'cliente', 'tecnico', 'data_atendimento', 'unidade'] },
    { id: 'classificacao_tecnica', required: ['tipo_atendimento', 'classificacao', 'sigla', 'prioridade'] },
    { id: 'diagnostico', required: ['defeito', 'causa'] },
    { id: 'acao_executada', required: ['solucao', 'acao_executada'] },
    { id: 'peca_material', required: ['codigo_peca_ou_material', 'quantidade_peca'] },
    { id: 'justificativa_sem_troca', required: ['justificativa_sem_peca'] },
    { id: 'garantia', required: ['status_garantia', 'tipo_garantia', 'data_garantia'] },
    { id: 'testes_evidencia', required: ['teste_validacao', 'evidencia_foto_arquivo'] },
    { id: 'encerramento_aceite', required: ['status_final', 'aceite_cliente', 'responsavel_aceite'] }
  ],
  byServiceType: {
    corretiva: ['defeito', 'causa', 'solucao', 'status_garantia'],
    instalacao: ['escopo_instalacao', 'checklist_instalacao', 'teste_validacao'],
    preventiva: ['roteiro_preventivo', 'itens_verificados', 'medicao_resultado'],
    software_implantacao: ['versao_software', 'parametros', 'teste_integracao'],
    treinamento: ['publico_treinado', 'conteudo', 'lista_presenca']
  }
});

const DEFAULT_APPROVED_PHRASES = Object.freeze([
  'executado teste funcional e operacao normalizada',
  'acao validada com cliente no local',
  'evidencia registrada no encerramento'
]);

const DEFAULT_PROHIBITED_PHRASES = Object.freeze([
  'sem tempo',
  'nao sei',
  'cliente nao deixou',
  'nao foi possivel sem justificativa'
]);

const DEFAULT_GOLDEN_RULES = Object.freeze([
  'todo laudo deve conter objetivo, diagnostico, acao e resultado',
  'casos sem peca exigem justificativa tecnica explicita',
  'pendencia deve ter dono e prazo',
  'encerramento deve registrar validacao e aceite'
]);

function buildOfficialLaudoStandard(locale, input) {
  const payload = (input && typeof input === 'object') ? input : {};
  const filePath = resolveOfficialStandardPath(payload.standardFilePath);
  const text = readTextFileSafe(filePath);
  const approved = parseSectionLines(text, 'frases aprovadas');
  const prohibited = parseSectionLines(text, 'frases proibidas');
  const goldenRules = parseSectionLines(text, 'regras de ouro');

  return {
    schema: 'laudo_official_standard_v1',
    locale,
    source: {
      exists: !!filePath,
      filePath: filePath || '',
      loadedAt: nowIso()
    },
    mandatoryStructure: MASTER_MODEL.blocks,
    requiredByType: MASTER_MODEL.byServiceType,
    approvedPhrases: approved.length ? approved : DEFAULT_APPROVED_PHRASES,
    prohibitedPhrases: prohibited.length ? prohibited : DEFAULT_PROHIBITED_PHRASES,
    goldenRules: goldenRules.length ? goldenRules : DEFAULT_GOLDEN_RULES
  };
}

function hasActionText(text) {
  const value = norm(text);
  return /troca|substitu|ajuste|configur|atualiz|execut|limpeza|reparo|normaliz|reinici/.test(value);
}

function hasEvidenceText(text) {
  const value = norm(text);
  return /teste|valid|homolog|evidenc|foto|anexo|ok/.test(value);
}

function evaluateCoverage(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const total = Math.max(1, items.length);
  const counters = {
    identificacao: 0,
    classificacao_tecnica: 0,
    diagnostico: 0,
    acao_executada: 0,
    peca_material: 0,
    justificativa_sem_troca: 0,
    garantia: 0,
    testes_evidencia: 0,
    encerramento_aceite: 0
  };

  items.forEach((itemRaw) => {
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    const os = toText(item.os || item.numero_os);
    const cliente = toText(item.cliente);
    const tecnico = toText(item.tecnico || item.responsavelTecnico || item.responsavel);
    const cobertura = toText(item.cobertura);
    const tipo = toText(item.tipoServico || item.tipo_atendimento);
    const codigoPeca = toText(item.codigoPeca || item.codigoPecaPrincipal || item.codigoOperacional);
    const laudo = toText(item.laudo || '');
    const observacao = toText(item.observacao || '');
    const issueList = Array.isArray(item.issues) ? item.issues : [];
    const hasIssue = issueList.length > 0;
    const hasWarranty = norm(cobertura).includes('garantia');
    const hasNoPartContext = !codigoPeca && hasIssue;

    if (os && cliente && tecnico) counters.identificacao += 1;
    if (tipo || cobertura) counters.classificacao_tecnica += 1;
    if (hasIssue || observacao || laudo) counters.diagnostico += 1;
    if (hasActionText(`${laudo} ${observacao}`)) counters.acao_executada += 1;
    if (codigoPeca) counters.peca_material += 1;
    if (hasNoPartContext && (observacao.length > 20 || laudo.length > 20)) counters.justificativa_sem_troca += 1;
    if (hasWarranty || toText(item.data_garantia || item.dataGarantia)) counters.garantia += 1;
    if (hasEvidenceText(`${laudo} ${observacao}`)) counters.testes_evidencia += 1;
    if (!hasIssue || /resolvido|finalizado|concluido/.test(norm(`${laudo} ${observacao}`))) counters.encerramento_aceite += 1;
  });

  const coverage = Object.keys(counters).map((key) => ({
    block: key,
    requiredFields: MASTER_MODEL.blocks.find((b) => b.id === key)?.required || [],
    coveragePct: pct(counters[key], total),
    coveredItems: counters[key],
    totalItems: items.length
  }));
  coverage.sort((a, b) => a.coveragePct - b.coveragePct || a.block.localeCompare(b.block));
  return coverage;
}

function normalizePhrase(value) {
  return norm(value).replace(/\s+/g, ' ').trim();
}

function evaluateNarrativeCompliance(itemsLike, officialStandard) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const prohibited = Array.isArray(officialStandard?.prohibitedPhrases) ? officialStandard.prohibitedPhrases : [];
  const approved = Array.isArray(officialStandard?.approvedPhrases) ? officialStandard.approvedPhrases : [];

  let prohibitedHits = 0;
  let approvedHits = 0;
  let missingConclusion = 0;
  let missingAction = 0;
  let missingPendingOwner = 0;
  const examples = [];

  items.forEach((itemRaw) => {
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    const text = normalizePhrase(`${item.laudo || ''} ${item.observacao || ''} ${item.motivoLaudo || ''}`);
    const hasAction = hasActionText(text);
    const hasConclusion = /resolvido|finalizado|concluido|normalizado|pendente/.test(text);
    const hasOwnerForPending = !/penden/.test(text) || /responsavel|dono|owner|prazo/.test(text);

    if (!hasAction) missingAction += 1;
    if (!hasConclusion) missingConclusion += 1;
    if (!hasOwnerForPending) missingPendingOwner += 1;

    const prohibitedFound = prohibited.filter((phrase) => {
      const p = normalizePhrase(phrase);
      return p && text.includes(p);
    });
    const approvedFound = approved.filter((phrase) => {
      const p = normalizePhrase(phrase);
      return p && text.includes(p);
    });
    prohibitedHits += prohibitedFound.length;
    approvedHits += approvedFound.length;

    if ((prohibitedFound.length || !hasAction || !hasConclusion) && examples.length < 10) {
      examples.push({
        os: toText(item.os || item.numero_os || item.osId),
        prohibitedFound,
        hasAction,
        hasConclusion
      });
    }
  });

  const total = Math.max(1, items.length);
  const rawScore = 100
    - (pct(prohibitedHits, total) * 0.5)
    - (pct(missingAction, total) * 0.25)
    - (pct(missingConclusion, total) * 0.2)
    - (pct(missingPendingOwner, total) * 0.05)
    + (pct(approvedHits, total) * 0.1);
  const qualityScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;

  return {
    qualityScore,
    qualityLevel: qualityScore >= 80 ? 'high' : (qualityScore >= 60 ? 'medium' : 'low'),
    prohibitedHits,
    approvedHits,
    missingAction,
    missingConclusion,
    missingPendingOwner,
    prohibitedHitsRatePct: pct(prohibitedHits, total),
    missingActionRatePct: pct(missingAction, total),
    missingConclusionRatePct: pct(missingConclusion, total),
    missingPendingOwnerRatePct: pct(missingPendingOwner, total),
    examples
  };
}

function resolveTechnicianLabel(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  return toText(
    item.tecnico
    || item.technicianName
    || item.responsavelTecnico
    || item.responsavel
    || item.atendente
    || item.attendantName
    || ''
  ) || 'Tecnico nao identificado';
}

function buildLaudoByTechnician(itemsLike, officialStandard, locale) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const buckets = new Map();
  items.forEach((item) => {
    const technicianName = resolveTechnicianLabel(item);
    const key = norm(technicianName || 'tecnico_nao_identificado') || 'tecnico_nao_identificado';
    if (!buckets.has(key)) buckets.set(key, { technicianKey: key, technicianName, items: [] });
    buckets.get(key).items.push(item);
  });

  const ranking = Array.from(buckets.values()).map((bucket) => {
    const compliance = evaluateNarrativeCompliance(bucket.items, officialStandard);
    const coverage = evaluateCoverage(bucket.items);
    const qualityIndex = coverage.length
      ? Math.round((coverage.reduce((acc, item) => acc + Number(item.coveragePct || 0), 0) / coverage.length) * 100) / 100
      : 0;
    const finalScore = Math.round(((qualityIndex * 0.6) + (Number(compliance.qualityScore || 0) * 0.4)) * 100) / 100;
    const qualityLevel = finalScore >= 80 ? 'high' : (finalScore >= 60 ? 'medium' : 'low');
    return {
      technicianKey: bucket.technicianKey,
      technicianName: bucket.technicianName,
      totalItems: bucket.items.length,
      qualityIndex,
      complianceScore: Number(compliance.qualityScore || 0),
      finalScore,
      qualityLevel,
      missingActionRatePct: Number(compliance.missingActionRatePct || 0),
      missingConclusionRatePct: Number(compliance.missingConclusionRatePct || 0),
      prohibitedHitsRatePct: Number(compliance.prohibitedHitsRatePct || 0),
      missingPendingOwnerRatePct: Number(compliance.missingPendingOwnerRatePct || 0),
      recommendations: [
        qualityLevel === 'low'
          ? (locale === 'en-US' ? 'Immediate coaching and template review required.' : 'Coaching imediato e revisao de modelo obrigatorios.')
          : (locale === 'en-US' ? 'Maintain sample audit and quality feedback loop.' : 'Manter amostragem de auditoria e feedback de qualidade.')
      ]
    };
  });

  ranking.sort((a, b) => {
    const scoreDelta = Number(a.finalScore || 0) - Number(b.finalScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return Number(b.totalItems || 0) - Number(a.totalItems || 0);
  });

  const total = ranking.length;
  const avgFinalScore = total
    ? Math.round((ranking.reduce((acc, item) => acc + Number(item.finalScore || 0), 0) / total) * 100) / 100
    : 0;

  return {
    summary: {
      totalTechnicians: total,
      avgFinalScore,
      lowQualityTechnicians: ranking.filter((item) => item.qualityLevel === 'low').length,
      mediumQualityTechnicians: ranking.filter((item) => item.qualityLevel === 'medium').length,
      highQualityTechnicians: ranking.filter((item) => item.qualityLevel === 'high').length
    },
    ranking: ranking.slice(0, 120)
  };
}

function buildLaudoStandardsPayload(input) {
  const payload = (input && typeof input === 'object') ? input : {};
  const locale = detectLocale(payload.locale);
  const isEn = locale === 'en-US';
  const osAuditItems = Array.isArray(payload.osAuditItems) ? payload.osAuditItems : [];
  const historicalRows = Array.isArray(payload.historicalRows) ? payload.historicalRows : [];
  const sampleItems = osAuditItems.length ? osAuditItems : historicalRows;
  const officialStandard = buildOfficialLaudoStandard(locale, payload);
  const coverage = evaluateCoverage(sampleItems);
  const compliance = evaluateNarrativeCompliance(sampleItems, officialStandard);
  const byTechnician = buildLaudoByTechnician(sampleItems, officialStandard, locale);
  const lowBlocks = coverage.filter((item) => item.coveragePct < 60);
  const qualityIndex = coverage.length
    ? Math.round((coverage.reduce((acc, item) => acc + item.coveragePct, 0) / coverage.length) * 100) / 100
    : 0;

  const recommendations = [];
  if (lowBlocks.some((item) => item.block === 'diagnostico')) recommendations.push(isEn ? 'Enforce defect and probable cause fields in every report.' : 'Tornar obrigatorios os campos de defeito e causa em todo laudo.');
  if (lowBlocks.some((item) => item.block === 'acao_executada')) recommendations.push(isEn ? 'Require explicit executed action before closure.' : 'Exigir acao executada explicita antes do fechamento.');
  if (lowBlocks.some((item) => item.block === 'peca_material' || item.block === 'justificativa_sem_troca')) recommendations.push(isEn ? 'Register part/material or mandatory no-part justification.' : 'Registrar peca/material ou justificativa obrigatoria de nao troca.');
  if (lowBlocks.some((item) => item.block === 'testes_evidencia')) recommendations.push(isEn ? 'Add mandatory test/evidence checklist in closure flow.' : 'Adicionar checklist obrigatorio de testes/evidencias no fechamento.');
  if (!recommendations.length) recommendations.push(isEn ? 'Current report pattern is stable; keep weekly audit sample.' : 'Padrao de laudo atual estavel; manter amostragem semanal de auditoria.');

  return {
    schema: LAUDO_STANDARDS_SCHEMA,
    version: LAUDO_STANDARDS_VERSION,
    locale,
    generatedAt: nowIso(),
    source: {
      osAuditItems: osAuditItems.length,
      historicalRows: historicalRows.length,
      totalRows: sampleItems.length,
      baseUsed: osAuditItems.length ? 'os_audit' : 'historical_rows'
    },
    officialStandard,
    masterModel: MASTER_MODEL,
    requiredByType: MASTER_MODEL.byServiceType,
    fieldCoverage: coverage,
    quality: {
      qualityIndex,
      qualityLevel: qualityIndex >= 80 ? 'high' : (qualityIndex >= 60 ? 'medium' : 'low'),
      lowCoverageBlocks: lowBlocks.map((item) => item.block)
    },
    compliance,
    byTechnician,
    recommendations,
    futureLibraryBlueprint: {
      folder: 'Biblioteca Tecnica / Modelos',
      assets: [
        isEn ? 'Corrective model template' : 'Template corretivo',
        isEn ? 'Installation model template' : 'Template instalacao',
        isEn ? 'Preventive model template' : 'Template preventiva',
        isEn ? 'Software/implementation model template' : 'Template software/implantacao',
        isEn ? 'Training model template' : 'Template treinamento'
      ],
      notes: isEn
        ? 'Use this standard as quality gate for technical intelligence.'
        : 'Usar este padrao como gate de qualidade da inteligencia tecnica.'
    }
  };
}

module.exports = {
  LAUDO_STANDARDS_SCHEMA,
  LAUDO_STANDARDS_VERSION,
  buildLaudoStandardsPayload
};
