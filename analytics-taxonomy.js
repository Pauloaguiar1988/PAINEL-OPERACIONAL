'use strict';

const TAXONOMY_VERSION = 'v2';

const SERVICE_TYPES = [
  'preventiva',
  'corretiva',
  'instalacao',
  'configuracao',
  'treinamento',
  'vistoria',
  'suporte_ajuste',
  'retorno_tecnico',
  'nao_identificado'
];

const WARRANTY_STATUS_TYPES = [
  'em_garantia',
  'fora_garantia',
  'nao_identificado'
];

const WARRANTY_TYPES = [
  'garantia_peca',
  'garantia_servico_instalacao',
  'garantia_fabrica',
  'sem_garantia',
  'nao_identificado'
];

const PROBABLE_CAUSES = [
  'equipamento',
  'instalacao',
  'infraestrutura_cliente',
  'software_configuracao',
  'integracao',
  'operacao_uso',
  'peca_acessorio',
  'indefinido'
];

const OUTCOME_TYPES = [
  'resolvido',
  'paliativo',
  'requer_peca',
  'requer_fabrica',
  'requer_cliente',
  'requer_nova_visita',
  'indefinido'
];

const SERVICE_RULES = [
  { key: 'retorno_tecnico', tokens: ['retorno', 'reincid', 'revisita', 'reabertura', 'nova visita', 'reagend'] },
  { key: 'preventiva', tokens: ['preventiv', 'pm', 'manutencao preventiva', 'checklist preventivo'] },
  { key: 'corretiva', tokens: ['corretiv', 'manutencao corretiva', 'defeito', 'falha', 'quebra', 'chamado'] },
  { key: 'instalacao', tokens: ['instal', 'implant', 'start-up', 'comissionamento'] },
  { key: 'configuracao', tokens: ['configur', 'parametriz', 'ajuste sistema', 'atualizacao firmware', 'software'] },
  { key: 'treinamento', tokens: ['treinamento', 'capacita', 'orientacao usuario', 'homologacao assistida'] },
  { key: 'vistoria', tokens: ['vistoria', 'inspecao', 'diagnostico tecnico', 'avaliacao tecnica'] },
  { key: 'suporte_ajuste', tokens: ['suporte', 'ajuste', 'calibr', 'limpeza', 'regulagem', 'afinacao'] }
];

const PROBABLE_CAUSE_RULES = [
  { key: 'integracao', tokens: ['integracao', 'api', 'webservice', 'middleware', 'erp', 'interface'] },
  { key: 'infraestrutura_cliente', tokens: ['rede', 'internet', 'switch', 'energia', 'tomada', 'nobreak', 'infraestrutura', 'cliente sem acesso'] },
  { key: 'software_configuracao', tokens: ['software', 'firmware', 'configur', 'parametriz', 'versao', 'update'] },
  { key: 'instalacao', tokens: ['instalacao', 'fixacao', 'montagem', 'cabeamento', 'infra instalacao'] },
  { key: 'peca_acessorio', tokens: ['peca', 'acessorio', 'consumivel', 'bateria', 'cabo', 'sensor'] },
  { key: 'operacao_uso', tokens: ['usuario', 'uso incorreto', 'procedimento', 'treinamento', 'operacao'] },
  { key: 'equipamento', tokens: ['equipamento', 'hardware', 'leitor', 'catraca', 'placa', 'motor', 'display'] }
];

const OUTCOME_RULES = [
  { key: 'requer_fabrica', tokens: ['fabrica', 'fabricante', 'rma', 'engenharia fabricante'] },
  { key: 'requer_peca', tokens: ['requer peca', 'aguardando peca', 'sem peca', 'pedido de peca', 'troca de peca'] },
  { key: 'requer_cliente', tokens: ['aguardando cliente', 'dependencia cliente', 'liberacao cliente', 'cliente pendente', 'sem acesso cliente'] },
  { key: 'requer_nova_visita', tokens: ['nova visita', 'retorno tecnico', 'reagend', 'revisita'] },
  { key: 'paliativo', tokens: ['paliativo', 'temporario', 'contingencia', 'workaround'] },
  { key: 'resolvido', tokens: ['resolvido', 'concluido', 'encerrado', 'normalizado', 'feito'] }
];

function toNumber(value) {
  const parsed = Number(String(value == null ? '' : value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeText(value) {
  return toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pct(value, total) {
  const safeTotal = Math.max(0, toNumber(total));
  if (!safeTotal) return 0;
  return Math.round((Math.max(0, toNumber(value)) * 10000) / safeTotal) / 100;
}

function detectLocale(rawLocale) {
  return String(rawLocale || '').toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
}

function buildCounter(keys) {
  const counter = Object.create(null);
  keys.forEach((key) => {
    counter[key] = 0;
  });
  return counter;
}

function incrementCounter(counter, key) {
  const safeKey = key in counter ? key : Object.keys(counter)[0];
  counter[safeKey] = toNumber(counter[safeKey]) + 1;
}

function counterToDistribution(counter, total) {
  return Object.keys(counter)
    .map((key) => ({ key, count: toNumber(counter[key]), ratePct: pct(counter[key], total) }))
    .sort((a, b) => (b.count - a.count) || String(a.key).localeCompare(String(b.key)));
}

function normalizeLabel(value, fallback, maxLen = 120) {
  const raw = toText(value).replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}...` : raw;
}

const TAXONOMY_LABELS = {
  'pt-BR': {
    quality: { high: 'Alta', medium: 'Media', low: 'Baixa' },
    serviceType: {
      preventiva: 'Preventiva',
      corretiva: 'Corretiva',
      instalacao: 'Instalacao',
      configuracao: 'Configuracao',
      treinamento: 'Treinamento',
      vistoria: 'Vistoria',
      suporte_ajuste: 'Suporte/Ajuste',
      retorno_tecnico: 'Retorno tecnico',
      nao_identificado: 'Nao identificado'
    },
    warrantyStatus: {
      em_garantia: 'Em garantia',
      fora_garantia: 'Fora de garantia',
      nao_identificado: 'Nao identificado'
    },
    warrantyType: {
      garantia_peca: 'Garantia de peca',
      garantia_servico_instalacao: 'Garantia servico/instalacao',
      garantia_fabrica: 'Garantia de fabrica',
      sem_garantia: 'Sem garantia',
      nao_identificado: 'Nao identificado'
    },
    probableCause: {
      equipamento: 'Equipamento',
      instalacao: 'Instalacao',
      infraestrutura_cliente: 'Infraestrutura cliente',
      software_configuracao: 'Software/configuracao',
      integracao: 'Integracao',
      operacao_uso: 'Operacao/uso',
      peca_acessorio: 'Peca/acessorio',
      indefinido: 'Indefinido'
    },
    outcomeType: {
      resolvido: 'Resolvido',
      paliativo: 'Paliativo',
      requer_peca: 'Requer peca',
      requer_fabrica: 'Requer fabrica',
      requer_cliente: 'Requer cliente',
      requer_nova_visita: 'Requer nova visita',
      indefinido: 'Indefinido'
    }
  },
  'en-US': {
    quality: { high: 'High', medium: 'Medium', low: 'Low' },
    serviceType: {
      preventiva: 'Preventive',
      corretiva: 'Corrective',
      instalacao: 'Installation',
      configuracao: 'Configuration',
      treinamento: 'Training',
      vistoria: 'Inspection',
      suporte_ajuste: 'Support/Adjustment',
      retorno_tecnico: 'Technical return',
      nao_identificado: 'Not identified'
    },
    warrantyStatus: {
      em_garantia: 'In warranty',
      fora_garantia: 'Out of warranty',
      nao_identificado: 'Not identified'
    },
    warrantyType: {
      garantia_peca: 'Part warranty',
      garantia_servico_instalacao: 'Service/installation warranty',
      garantia_fabrica: 'Factory warranty',
      sem_garantia: 'No warranty',
      nao_identificado: 'Not identified'
    },
    probableCause: {
      equipamento: 'Equipment',
      instalacao: 'Installation',
      infraestrutura_cliente: 'Customer infrastructure',
      software_configuracao: 'Software/configuration',
      integracao: 'Integration',
      operacao_uso: 'Operation/usage',
      peca_acessorio: 'Part/accessory',
      indefinido: 'Undefined'
    },
    outcomeType: {
      resolvido: 'Resolved',
      paliativo: 'Palliative',
      requer_peca: 'Requires part',
      requer_fabrica: 'Requires factory',
      requer_cliente: 'Requires customer',
      requer_nova_visita: 'Requires new visit',
      indefinido: 'Undefined'
    }
  }
};

function localizeTaxonomyValue(axis, key, localeRaw) {
  const locale = detectLocale(localeRaw);
  const dictionary = TAXONOMY_LABELS[locale] || TAXONOMY_LABELS['pt-BR'];
  const axisTable = dictionary[axis] || {};
  if (axisTable[key]) return axisTable[key];
  return String(key || '--').replace(/_/g, ' ');
}

function formatPctLabel(value, localeRaw, decimals = 1) {
  const locale = detectLocale(localeRaw);
  const parsed = Number(value || 0);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return `${safe.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

function firstDistributionEntry(list, fallbackKey) {
  const safe = Array.isArray(list) ? list : [];
  if (!safe.length) return { key: fallbackKey, count: 0, ratePct: 0 };
  return {
    key: safe[0]?.key || fallbackKey,
    count: toNumber(safe[0]?.count),
    ratePct: toNumber(safe[0]?.ratePct)
  };
}

function sumDistributionByKeys(list, keys) {
  const safeList = Array.isArray(list) ? list : [];
  const keySet = new Set(Array.isArray(keys) ? keys : []);
  return safeList
    .filter((item) => keySet.has(item?.key))
    .reduce((acc, item) => acc + toNumber(item?.count), 0);
}

function isUnknownTechnicianName(rawValue) {
  const value = normalizeText(rawValue || '');
  if (!value) return true;
  if (['-', '--', 'n/a', 'na', 'null', 'undefined', 'tecnico'].includes(value)) return true;
  const blocked = [
    'nao identificado',
    'não identificado',
    'tecnico nao identificado',
    'tecnico nao informado',
    'sem tecnico',
    'sem tecnico informado',
    'technician not identified'
  ];
  return blocked.some((item) => value.includes(item));
}

function extractTechnicianNameFromText(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const sourceText = [
    item.observacao,
    item.laudo,
    item.nextStep
  ].filter(Boolean).join(' \n ');
  const text = toText(sourceText);
  if (!text) return '';

  const patterns = [
    /(?:tecnic[oa]|responsavel|resp\.?|executor)\s*[:\-]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,70})/i,
    /(?:atendido por|tecnico responsavel)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,70})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const candidate = toText(match[1]).replace(/[;,.]+$/g, '').trim();
    if (candidate && !isUnknownTechnicianName(candidate)) return candidate;
  }
  return '';
}

function resolveTechnicianIdentity(itemLike, localeRaw, fallbackName) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const candidates = [
    { key: 'tecnico', value: item.tecnico },
    { key: 'tecnicoNome', value: item.tecnicoNome },
    { key: 'tecnico_nome', value: item.tecnico_nome },
    { key: 'nomeTecnico', value: item.nomeTecnico },
    { key: 'nome_tecnico', value: item.nome_tecnico },
    { key: 'responsavelTecnico', value: item.responsavelTecnico },
    { key: 'responsavel_tecnico', value: item.responsavel_tecnico },
    { key: 'tecnicoResponsavel', value: item.tecnicoResponsavel },
    { key: 'responsavelAtual', value: item.responsavelAtual },
    { key: 'responsavel_atual', value: item.responsavel_atual },
    { key: 'responsavel', value: item.responsavel },
    { key: 'technician', value: item.technician }
  ];

  for (const candidate of candidates) {
    const text = toText(candidate.value);
    if (!text || isUnknownTechnicianName(text)) continue;
    return {
      name: normalizeLabel(text, fallbackName, 90),
      identified: true,
      source: `field:${candidate.key}`
    };
  }

  const extracted = extractTechnicianNameFromText(item);
  if (extracted) {
    return {
      name: normalizeLabel(extracted, fallbackName, 90),
      identified: true,
      source: 'text:observacao_laudo'
    };
  }

  return {
    name: normalizeLabel(fallbackName, fallbackName, 90),
    identified: false,
    source: 'fallback:not_identified'
  };
}

function joinEvidence(parts) {
  const output = [];
  (Array.isArray(parts) ? parts : []).forEach((part) => {
    const text = toText(part);
    if (!text || output.includes(text)) return;
    output.push(text);
  });
  return output.slice(0, 8);
}

function scoreKeywordRules(normalizedText, rules) {
  const scores = [];
  const text = normalizeText(normalizedText);
  rules.forEach((rule) => {
    const hits = rule.tokens.filter((token) => text.includes(normalizeText(token)));
    if (hits.length) scores.push({ key: rule.key, hits });
  });
  scores.sort((a, b) => b.hits.length - a.hits.length || String(a.key).localeCompare(String(b.key)));
  return scores;
}

function detectPrimaryService(item, baseText) {
  const explicit = normalizeText(item?.tipoServico || '');
  const scored = scoreKeywordRules(baseText, SERVICE_RULES);
  const top = scored[0] || null;

  if (explicit) {
    const exact = SERVICE_RULES.find((rule) =>
      rule.tokens.some((token) => explicit.includes(normalizeText(token)))
    );
    if (exact) {
      return {
        primaryServiceType: exact.key,
        serviceType: exact.key,
        secondarySignals: Array.from(new Set((top?.hits || []).slice(0, 6))),
        confidence: Math.max(0.85, top ? Math.min(0.95, 0.75 + (top.hits.length * 0.08)) : 0.9),
        evidence: joinEvidence([
          `tipoServico:${toText(item?.tipoServico || '')}`,
          ...(top ? top.hits.map((hit) => `signal:${hit}`) : [])
        ])
      };
    }
  }

  if (top) {
    const secondarySignals = scored
      .slice(0, 3)
      .flatMap((entry) => entry.hits)
      .filter((hit, index, arr) => arr.indexOf(hit) === index)
      .slice(0, 6);
    const confidence = top.hits.length >= 2 ? 0.84 : 0.68;
    return {
      primaryServiceType: top.key,
      serviceType: top.key,
      secondarySignals,
      confidence,
      evidence: joinEvidence(top.hits.map((hit) => `signal:${hit}`))
    };
  }

  return {
    primaryServiceType: 'nao_identificado',
    serviceType: 'nao_identificado',
    secondarySignals: [],
    confidence: 0.2,
    evidence: ['signal:service_not_identified']
  };
}

function detectWarranty(item, baseText) {
  const coverage = normalizeText(item?.cobertura || '');
  const text = normalizeText(baseText);
  const hasWarranty = text.includes('garantia') || coverage.includes('garantia');
  const hasFactory = text.includes('fabrica') || text.includes('fabricante') || text.includes('rma');
  const hasPiece = text.includes('peca') || text.includes('acessorio') || text.includes('componente');
  const hasServiceInstall = text.includes('instal') || text.includes('servico') || text.includes('mao de obra');
  const hasNoWarranty = ['sem garantia', 'fora garantia', 'avulso', 'faturamento', 'sem contrato']
    .some((token) => text.includes(token) || coverage.includes(normalizeText(token)));

  let warrantyType = 'nao_identificado';
  let garantiaStatus = 'nao_identificado';
  let confidence = 0.2;
  const evidence = [];

  if (hasWarranty && hasFactory) {
    warrantyType = 'garantia_fabrica';
    garantiaStatus = 'em_garantia';
    confidence = 0.9;
    evidence.push('signal:warranty_factory');
  } else if (hasWarranty && hasPiece) {
    warrantyType = 'garantia_peca';
    garantiaStatus = 'em_garantia';
    confidence = 0.88;
    evidence.push('signal:warranty_part');
  } else if (hasWarranty && hasServiceInstall) {
    warrantyType = 'garantia_servico_instalacao';
    garantiaStatus = 'em_garantia';
    confidence = 0.86;
    evidence.push('signal:warranty_service_installation');
  } else if (hasNoWarranty || coverage.includes('contrato')) {
    warrantyType = 'sem_garantia';
    garantiaStatus = 'fora_garantia';
    confidence = 0.82;
    evidence.push('signal:outside_warranty');
  } else if (hasWarranty) {
    warrantyType = 'garantia_servico_instalacao';
    garantiaStatus = 'em_garantia';
    confidence = 0.74;
    evidence.push('signal:warranty_generic');
  }

  if (toText(item?.cobertura)) evidence.push(`cobertura:${toText(item.cobertura)}`);
  return {
    garantiaStatus,
    warrantyType,
    confidence,
    evidence: joinEvidence(evidence)
  };
}

function detectProbableCause(baseText) {
  const scored = scoreKeywordRules(baseText, PROBABLE_CAUSE_RULES);
  const top = scored[0] || null;
  if (!top) {
    return {
      probableCause: 'indefinido',
      confidence: 0.2,
      evidence: ['signal:cause_undefined']
    };
  }
  return {
    probableCause: top.key,
    confidence: top.hits.length >= 2 ? 0.82 : 0.66,
    evidence: joinEvidence(top.hits.map((hit) => `signal:${hit}`))
  };
}

function detectOutcome(item, baseText) {
  const issues = Array.isArray(item?.issues) ? item.issues : [];
  const issuesText = issues
    .map((issue) => `${toText(issue?.type)} ${toText(issue?.message)} ${toText(issue?.description)}`)
    .join(' ');
  const text = normalizeText(`${baseText} ${issuesText}`);
  const scored = scoreKeywordRules(text, OUTCOME_RULES);
  const top = scored[0] || null;

  if (top) {
    return {
      outcomeType: top.key,
      confidence: top.hits.length >= 2 ? 0.84 : 0.68,
      evidence: joinEvidence(top.hits.map((hit) => `signal:${hit}`))
    };
  }

  if (!issues.length && toText(item?.laudo)) {
    return {
      outcomeType: 'resolvido',
      confidence: 0.62,
      evidence: ['signal:no_open_issue_with_report']
    };
  }

  return {
    outcomeType: 'indefinido',
    confidence: 0.2,
    evidence: ['signal:outcome_undefined']
  };
}

function classifyItem(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const issueText = Array.isArray(item.issues)
    ? item.issues.map((issue) => `${toText(issue?.type)} ${toText(issue?.message)} ${toText(issue?.description)}`).join(' ')
    : '';

  const baseText = [
    item.tipoServico,
    item.codigoRaw,
    item.codigoOperacional,
    item.cobertura,
    item.observacao,
    item.laudo,
    item.nextStep,
    item.ordemCompra,
    issueText
  ].filter(Boolean).join(' ');

  const service = detectPrimaryService(item, baseText);
  const warranty = detectWarranty(item, baseText);
  const cause = detectProbableCause(baseText);
  const outcome = detectOutcome(item, baseText);
  const confidence = Math.round(((service.confidence + warranty.confidence + cause.confidence + outcome.confidence) / 4) * 100) / 100;
  const evidence = joinEvidence([
    ...service.evidence,
    ...warranty.evidence,
    ...cause.evidence,
    ...outcome.evidence
  ]);

  return {
    serviceType: service.serviceType,
    primaryServiceType: service.primaryServiceType,
    secondarySignals: service.secondarySignals,
    garantiaStatus: warranty.garantiaStatus,
    warrantyType: warranty.warrantyType,
    probableCause: cause.probableCause,
    outcomeType: outcome.outcomeType,
    confidence,
    evidence
  };
}

function createGroupBucket(name, categoryKeys) {
  return {
    name,
    totalOs: 0,
    confidenceSum: 0,
    serviceType: buildCounter(SERVICE_TYPES),
    garantiaStatus: buildCounter(WARRANTY_STATUS_TYPES),
    warrantyType: buildCounter(WARRANTY_TYPES),
    probableCause: buildCounter(PROBABLE_CAUSES),
    outcomeType: buildCounter(OUTCOME_TYPES),
    secondarySignals: Object.create(null),
    categoryKeys
  };
}

function addClassificationToBucket(bucket, classification) {
  bucket.totalOs += 1;
  bucket.confidenceSum += toNumber(classification.confidence);
  incrementCounter(bucket.serviceType, classification.serviceType);
  incrementCounter(bucket.garantiaStatus, classification.garantiaStatus);
  incrementCounter(bucket.warrantyType, classification.warrantyType);
  incrementCounter(bucket.probableCause, classification.probableCause);
  incrementCounter(bucket.outcomeType, classification.outcomeType);
  (Array.isArray(classification.secondarySignals) ? classification.secondarySignals : []).forEach((signal) => {
    const key = toText(signal);
    if (!key) return;
    bucket.secondarySignals[key] = toNumber(bucket.secondarySignals[key]) + 1;
  });
}

function normalizeGroupBucket(bucket) {
  const total = Math.max(1, toNumber(bucket.totalOs));
  const topSignals = Object.keys(bucket.secondarySignals)
    .map((key) => ({ signal: key, count: toNumber(bucket.secondarySignals[key]) }))
    .sort((a, b) => (b.count - a.count) || String(a.signal).localeCompare(String(b.signal)))
    .slice(0, 6);

  return {
    [bucket.categoryKeys.nameKey]: bucket.name,
    totalOs: bucket.totalOs,
    confidenceAvgPct: Math.round(((bucket.confidenceSum / total) * 100) * 100) / 100,
    serviceType: counterToDistribution(bucket.serviceType, bucket.totalOs),
    garantiaStatus: counterToDistribution(bucket.garantiaStatus, bucket.totalOs),
    warrantyType: counterToDistribution(bucket.warrantyType, bucket.totalOs),
    probableCause: counterToDistribution(bucket.probableCause, bucket.totalOs),
    outcomeType: counterToDistribution(bucket.outcomeType, bucket.totalOs),
    secondarySignals: topSignals
  };
}

function resolveNarrativeRiskLevel(context) {
  const c = context || {};
  if (c.qualityLevel === 'low' || c.unknownPct >= 30 || c.undefinedPct >= 25 || c.pendingOutcomeRate >= 35) return 'critical';
  if (c.qualityLevel === 'medium' || c.unknownPct >= 18 || c.undefinedPct >= 15 || c.pendingOutcomeRate >= 20) return 'attention';
  return 'stable';
}

function buildTechnicalNarrativeV2(input) {
  const payload = input || {};
  const locale = detectLocale(payload.locale);
  const isEn = locale === 'en-US';
  const totalOs = toNumber(payload.totalOs);
  const summaryData = (payload.summary && typeof payload.summary === 'object') ? payload.summary : {};
  const quality = payload.quality || { classificationQuality: 'low' };
  const qualityLevel = String(quality.classificationQuality || 'low').toLowerCase();
  const unknownPct = toNumber(quality.percentNaoIdentificado);
  const undefinedPct = toNumber(quality.percentIndefinido);
  const coveragePct = toNumber(quality.coveragePct);
  const confidencePct = toNumber(quality.avgConfidencePct);

  if (!totalOs) {
    const emptySummary = isEn
      ? 'No work orders with enough context for v2 taxonomy in the selected period.'
      : 'Sem O.S. com contexto suficiente para taxonomia v2 no periodo selecionado.';
    return {
      version: TAXONOMY_VERSION,
      locale,
      summary: emptySummary,
      highlights: [],
      recommendedActions: [],
      executiveSummary: { text: emptySummary, confidencePct: 0, evidence: [] },
      dominantPatterns: [],
      criticalFindings: [],
      warrantyRead: { text: emptySummary, evidence: [] },
      equipmentConcentration: { text: emptySummary, topEquipment: '', topSharePct: 0, top3SharePct: 0, evidence: [] },
      technicianRead: { text: emptySummary, topTechnician: '', unknownRatePct: 0, evidence: [] },
      probableCauseRead: { text: emptySummary, dominantCause: '', sharePct: 0, evidence: [] },
      outcomeRead: { text: emptySummary, dominantOutcome: '', pendingRatePct: 0, evidence: [] },
      riskRead: { level: 'attention', text: emptySummary, evidence: [] },
      attentionPoints: [],
      humanReviewTriggers: [],
      limitations: [
        isEn
          ? 'Narrative limited by insufficient OS detail.'
          : 'Leitura limitada por falta de detalhe nas O.S.'
      ]
    };
  }

  const serviceDist = Array.isArray(summaryData.serviceType) ? summaryData.serviceType : [];
  const warrantyTypeDist = Array.isArray(summaryData.warrantyType) ? summaryData.warrantyType : [];
  const warrantyStatusDist = Array.isArray(summaryData.warrantyStatus) ? summaryData.warrantyStatus : [];
  const causeDist = Array.isArray(summaryData.probableCause) ? summaryData.probableCause : [];
  const outcomeDist = Array.isArray(summaryData.outcomeType) ? summaryData.outcomeType : [];
  const equipmentRows = Array.isArray(payload.taxonomyByEquipment) ? payload.taxonomyByEquipment : [];
  const technicianRows = Array.isArray(payload.taxonomyByTechnician) ? payload.taxonomyByTechnician : [];
  const locationRows = Array.isArray(payload.taxonomyByLocation) ? payload.taxonomyByLocation : [];

  const topService = firstDistributionEntry(serviceDist, 'nao_identificado');
  const topWarrantyType = firstDistributionEntry(warrantyTypeDist, 'nao_identificado');
  const topWarrantyStatus = firstDistributionEntry(warrantyStatusDist, 'nao_identificado');
  const topCause = firstDistributionEntry(causeDist, 'indefinido');
  const topOutcome = firstDistributionEntry(outcomeDist, 'indefinido');

  const topEquipment = equipmentRows[0] || null;
  const topTechnician = technicianRows[0] || null;
  const topLocation = locationRows[0] || null;
  const top3EquipmentVolume = equipmentRows.slice(0, 3).reduce((acc, row) => acc + toNumber(row?.totalOs), 0);
  const topEquipmentSharePct = pct(toNumber(topEquipment?.totalOs), totalOs);
  const top3EquipmentSharePct = pct(top3EquipmentVolume, totalOs);
  const unknownTechCount = payload.technicianUnknownCount != null
    ? toNumber(payload.technicianUnknownCount)
    : toNumber((topTechnician && normalizeText(topTechnician.technician || '').includes('nao identificado')) ? topTechnician.totalOs : 0);
  const unknownTechRatePct = pct(unknownTechCount, totalOs);
  const pendingOutcomeCount = sumDistributionByKeys(outcomeDist, ['requer_peca', 'requer_fabrica', 'requer_cliente', 'requer_nova_visita']);
  const pendingOutcomeRate = pct(pendingOutcomeCount, totalOs);
  const recurrenceCount = sumDistributionByKeys(serviceDist, ['retorno_tecnico']) + sumDistributionByKeys(outcomeDist, ['requer_nova_visita']);
  const recurrenceRate = pct(recurrenceCount, totalOs);
  const warrantyInCount = sumDistributionByKeys(warrantyStatusDist, ['em_garantia']);
  const warrantyOutCount = sumDistributionByKeys(warrantyStatusDist, ['fora_garantia']);
  const warrantyInRate = pct(warrantyInCount, totalOs);
  const warrantyOutRate = pct(warrantyOutCount, totalOs);

  const riskLevel = resolveNarrativeRiskLevel({
    qualityLevel,
    unknownPct,
    undefinedPct,
    pendingOutcomeRate
  });
  const riskLabel = localizeTaxonomyValue('quality', riskLevel === 'attention' ? 'medium' : (riskLevel === 'critical' ? 'low' : 'high'), locale);
  const qualityLabel = localizeTaxonomyValue('quality', qualityLevel, locale);
  const topServiceLabel = localizeTaxonomyValue('serviceType', topService.key, locale);
  const topWarrantyTypeLabel = localizeTaxonomyValue('warrantyType', topWarrantyType.key, locale);
  const topWarrantyStatusLabel = localizeTaxonomyValue('warrantyStatus', topWarrantyStatus.key, locale);
  const topCauseLabel = localizeTaxonomyValue('probableCause', topCause.key, locale);
  const topOutcomeLabel = localizeTaxonomyValue('outcomeType', topOutcome.key, locale);
  const eqName = toText(topEquipment?.equipment || (isEn ? 'Equipment not identified' : 'Equipamento nao identificado'));
  const techName = toText(topTechnician?.technician || (isEn ? 'Technician not identified' : 'Tecnico nao identificado'));
  const locationName = toText(topLocation?.location || (isEn ? 'Location not identified' : 'Local nao identificado'));

  const executiveSummaryText = isEn
    ? `Taxonomy v2 processed ${totalOs} WO. Dominant profile: ${topServiceLabel} (${formatPctLabel(topService.ratePct, locale)}). Top probable cause: ${topCauseLabel} (${formatPctLabel(topCause.ratePct, locale)}). Top outcome: ${topOutcomeLabel} (${formatPctLabel(topOutcome.ratePct, locale)}). Classification quality is ${qualityLabel}, with ${formatPctLabel(unknownPct, locale)} not identified and ${formatPctLabel(undefinedPct, locale)} undefined.`
    : `Taxonomia v2 processou ${totalOs} O.S.. Perfil dominante: ${topServiceLabel} (${formatPctLabel(topService.ratePct, locale)}). Causa provavel mais frequente: ${topCauseLabel} (${formatPctLabel(topCause.ratePct, locale)}). Desfecho predominante: ${topOutcomeLabel} (${formatPctLabel(topOutcome.ratePct, locale)}). Qualidade da classificacao em nivel ${qualityLabel}, com ${formatPctLabel(unknownPct, locale)} nao identificado e ${formatPctLabel(undefinedPct, locale)} indefinido.`;

  const dominantPatterns = [
    {
      axis: 'serviceType',
      label: topServiceLabel,
      count: topService.count,
      sharePct: topService.ratePct,
      text: isEn
        ? `Most frequent service type: ${topServiceLabel} (${topService.count}/${totalOs}).`
        : `Tipo de atendimento mais frequente: ${topServiceLabel} (${topService.count}/${totalOs}).`,
      evidence: [`taxonomySummary.serviceType.${topService.key}`]
    },
    {
      axis: 'warrantyType',
      label: topWarrantyTypeLabel,
      count: topWarrantyType.count,
      sharePct: topWarrantyType.ratePct,
      text: isEn
        ? `Dominant warranty classification: ${topWarrantyTypeLabel} (${formatPctLabel(topWarrantyType.ratePct, locale)}).`
        : `Classificacao de garantia dominante: ${topWarrantyTypeLabel} (${formatPctLabel(topWarrantyType.ratePct, locale)}).`,
      evidence: [`taxonomySummary.warrantyType.${topWarrantyType.key}`]
    },
    {
      axis: 'probableCause',
      label: topCauseLabel,
      count: topCause.count,
      sharePct: topCause.ratePct,
      text: isEn
        ? `Dominant probable cause: ${topCauseLabel} (${formatPctLabel(topCause.ratePct, locale)}).`
        : `Causa provavel dominante: ${topCauseLabel} (${formatPctLabel(topCause.ratePct, locale)}).`,
      evidence: [`taxonomySummary.probableCause.${topCause.key}`]
    }
  ];

  const criticalFindings = [];
  if (top3EquipmentSharePct >= 55) {
    criticalFindings.push({
      severity: 'high',
      title: isEn ? 'Failure concentration in few equipment groups' : 'Concentracao de falha em poucos equipamentos',
      description: isEn
        ? `Top 3 equipment represent ${formatPctLabel(top3EquipmentSharePct, locale)} of all WO, led by ${eqName}.`
        : `Top 3 equipamentos concentram ${formatPctLabel(top3EquipmentSharePct, locale)} das O.S., liderados por ${eqName}.`,
      evidence: ['taxonomyByEquipment.top3.volumeShare']
    });
  }
  if (pendingOutcomeRate >= 25) {
    criticalFindings.push({
      severity: 'high',
      title: isEn ? 'Backlog risk in unresolved outcomes' : 'Risco de backlog em desfechos pendentes',
      description: isEn
        ? `${formatPctLabel(pendingOutcomeRate, locale)} of WO remain in pending outcomes (part/factory/customer/new visit).`
        : `${formatPctLabel(pendingOutcomeRate, locale)} das O.S. estao em desfechos pendentes (peca/fabrica/cliente/nova visita).`,
      evidence: ['taxonomySummary.outcomeType.pending']
    });
  }
  if (recurrenceRate >= 18) {
    criticalFindings.push({
      severity: 'medium',
      title: isEn ? 'Rework/revisit recurrence above baseline' : 'Recorrencia de retrabalho/revisita acima da base',
      description: isEn
        ? `Recurrence signal reached ${formatPctLabel(recurrenceRate, locale)} in the analyzed period.`
        : `Sinal de recorrencia chegou a ${formatPctLabel(recurrenceRate, locale)} no periodo analisado.`,
      evidence: ['taxonomySummary.serviceType.retorno_tecnico', 'taxonomySummary.outcomeType.requer_nova_visita']
    });
  }
  if (!criticalFindings.length) {
    criticalFindings.push({
      severity: 'low',
      title: isEn ? 'No critical concentration detected' : 'Sem concentracao critica relevante',
      description: isEn
        ? 'Current distribution does not indicate structural concentration above configured thresholds.'
        : 'A distribuicao atual nao aponta concentracao estrutural acima dos limiares configurados.',
      evidence: ['taxonomySummary.distribution']
    });
  }

  const recommendedActions = [];
  if (pendingOutcomeRate >= 25) {
    recommendedActions.push(isEn
      ? 'Prioritize pending-outcome backlog with owner, ETA, and daily follow-up by WO cluster.'
      : 'Priorizar backlog de desfechos pendentes com dono, prazo e acompanhamento diario por cluster de O.S.');
  }
  if (top3EquipmentSharePct >= 55) {
    recommendedActions.push(isEn
      ? `Open focused root-cause routine for ${eqName} and top locations (starting at ${locationName}).`
      : `Abrir rotina focada de causa raiz para ${eqName} e principais locais (iniciando em ${locationName}).`);
  }
  if (warrantyInRate >= 30) {
    recommendedActions.push(isEn
      ? 'Review warranty flow (part/service/factory) to reduce repeat calls and claim leakage.'
      : 'Revisar fluxo de garantia (peca/servico/fabrica) para reduzir reincidencia e glosa.');
  }
  if (qualityLevel === 'low' || unknownPct >= 25 || undefinedPct >= 20) {
    recommendedActions.push(isEn
      ? 'Apply mandatory evidence checklist in technical report before closure (defect/cause/action/result).'
      : 'Aplicar checklist obrigatorio de evidencia no laudo antes de encerrar (defeito/causa/acao/resultado).');
  }
  if (unknownTechRatePct >= 15) {
    recommendedActions.push(isEn
      ? 'Force technician ownership in each WO import line to eliminate unknown technician clusters.'
      : 'Forcar dono tecnico em cada linha de importacao da O.S. para eliminar clusters sem identificacao.');
  }
  if (!recommendedActions.length) {
    recommendedActions.push(isEn
      ? 'Keep weekly preventive review and monitor taxonomy quality to sustain the current baseline.'
      : 'Manter revisao preventiva semanal e monitorar qualidade da taxonomia para sustentar a base atual.');
  }

  const attentionPoints = [];
  if (coveragePct < 75) {
    attentionPoints.push(isEn
      ? `Classification coverage is ${formatPctLabel(coveragePct, locale)}; analytical blind spots remain.`
      : `Cobertura de classificacao em ${formatPctLabel(coveragePct, locale)}; ainda existem pontos cegos analiticos.`);
  }
  if (unknownTechRatePct > 0) {
    attentionPoints.push(isEn
      ? `${formatPctLabel(unknownTechRatePct, locale)} of WO are linked to unidentified technician ownership.`
      : `${formatPctLabel(unknownTechRatePct, locale)} das O.S. estao com dono tecnico nao identificado.`);
  }
  if (unknownPct > 0 || undefinedPct > 0) {
    attentionPoints.push(isEn
      ? `Not identified/undefined rates are ${formatPctLabel(unknownPct, locale)} / ${formatPctLabel(undefinedPct, locale)}.`
      : `Taxas nao identificado/indefinido em ${formatPctLabel(unknownPct, locale)} / ${formatPctLabel(undefinedPct, locale)}.`);
  }

  const humanReviewTriggers = [];
  if (qualityLevel === 'low') {
    humanReviewTriggers.push({
      code: 'low_classification_quality',
      severity: 'high',
      message: isEn
        ? 'Classification quality is low; manual review required before executive decision.'
        : 'Qualidade de classificacao baixa; revisar manualmente antes de decisao executiva.',
      evidence: [`classificationQuality:${qualityLevel}`]
    });
  }
  if (unknownPct >= 25) {
    humanReviewTriggers.push({
      code: 'high_not_identified_rate',
      severity: 'high',
      message: isEn
        ? 'High not-identified rate in taxonomy axes.'
        : 'Alta taxa de nao identificado nos eixos taxonomicos.',
      evidence: [`percentNaoIdentificado:${unknownPct}`]
    });
  }
  if (undefinedPct >= 20) {
    humanReviewTriggers.push({
      code: 'high_undefined_rate',
      severity: 'medium',
      message: isEn
        ? 'Undefined probable-cause/outcome ratio above tolerance.'
        : 'Indice de causa/desfecho indefinido acima da tolerancia.',
      evidence: [`percentIndefinido:${undefinedPct}`]
    });
  }
  if (unknownTechRatePct >= 15) {
    humanReviewTriggers.push({
      code: 'technician_identification_gap',
      severity: 'medium',
      message: isEn
        ? 'Technician attribution gap can distort accountability analytics.'
        : 'Lacuna de atribuicao de tecnico pode distorcer analise de responsabilidade.',
      evidence: [`unknownTechRatePct:${unknownTechRatePct}`]
    });
  }

  const riskRead = {
    level: riskLevel,
    text: isEn
      ? `Current structural risk level: ${riskLabel}. Main drivers: pending outcomes ${formatPctLabel(pendingOutcomeRate, locale)}, concentration top3 equipment ${formatPctLabel(top3EquipmentSharePct, locale)}, classification quality ${qualityLabel}.`
      : `Nivel de risco estrutural atual: ${riskLabel}. Vetores principais: desfechos pendentes ${formatPctLabel(pendingOutcomeRate, locale)}, concentracao top3 equipamentos ${formatPctLabel(top3EquipmentSharePct, locale)}, qualidade ${qualityLabel}.`,
    evidence: [
      `pendingOutcomeRate:${pendingOutcomeRate}`,
      `top3EquipmentSharePct:${top3EquipmentSharePct}`,
      `classificationQuality:${qualityLevel}`
    ]
  };

  const warrantyRead = {
    dominantType: topWarrantyType.key,
    dominantTypeLabel: topWarrantyTypeLabel,
    dominantStatus: topWarrantyStatus.key,
    dominantStatusLabel: topWarrantyStatusLabel,
    inWarrantyRatePct: warrantyInRate,
    outWarrantyRatePct: warrantyOutRate,
    text: isEn
      ? `Warranty profile is led by ${topWarrantyTypeLabel} (${formatPctLabel(topWarrantyType.ratePct, locale)}), with status concentrated in ${topWarrantyStatusLabel}.`
      : `Perfil de garantia liderado por ${topWarrantyTypeLabel} (${formatPctLabel(topWarrantyType.ratePct, locale)}), com status concentrado em ${topWarrantyStatusLabel}.`,
    evidence: [`taxonomySummary.warrantyType.${topWarrantyType.key}`, `taxonomySummary.warrantyStatus.${topWarrantyStatus.key}`]
  };

  const equipmentConcentration = {
    topEquipment: eqName,
    topSharePct: topEquipmentSharePct,
    top3SharePct: top3EquipmentSharePct,
    text: isEn
      ? `Top equipment ${eqName} represents ${formatPctLabel(topEquipmentSharePct, locale)}; top 3 equipment represent ${formatPctLabel(top3EquipmentSharePct, locale)} of WO volume.`
      : `Equipamento lider ${eqName} representa ${formatPctLabel(topEquipmentSharePct, locale)}; top 3 equipamentos somam ${formatPctLabel(top3EquipmentSharePct, locale)} do volume de O.S..`,
    evidence: ['taxonomyByEquipment[0].totalOs', 'taxonomyByEquipment.top3.totalOs']
  };

  const technicianRead = {
    topTechnician: techName,
    topTechnicianVolume: toNumber(topTechnician?.totalOs),
    unknownRatePct: unknownTechRatePct,
    text: isEn
      ? `Main technician cluster: ${techName} (${toNumber(topTechnician?.totalOs)} WO). Unidentified technician rate: ${formatPctLabel(unknownTechRatePct, locale)}.`
      : `Principal cluster de tecnico: ${techName} (${toNumber(topTechnician?.totalOs)} O.S.). Taxa sem identificacao de tecnico: ${formatPctLabel(unknownTechRatePct, locale)}.`,
    evidence: ['taxonomyByTechnician[0].totalOs', `unknownTechRatePct:${unknownTechRatePct}`]
  };

  const probableCauseRead = {
    dominantCause: topCause.key,
    dominantCauseLabel: topCauseLabel,
    sharePct: topCause.ratePct,
    text: isEn
      ? `Dominant probable cause is ${topCauseLabel}, impacting ${formatPctLabel(topCause.ratePct, locale)} of WO.`
      : `Causa provavel dominante: ${topCauseLabel}, impactando ${formatPctLabel(topCause.ratePct, locale)} das O.S..`,
    evidence: [`taxonomySummary.probableCause.${topCause.key}`]
  };

  const outcomeRead = {
    dominantOutcome: topOutcome.key,
    dominantOutcomeLabel: topOutcomeLabel,
    sharePct: topOutcome.ratePct,
    pendingRatePct: pendingOutcomeRate,
    text: isEn
      ? `Outcome profile led by ${topOutcomeLabel} (${formatPctLabel(topOutcome.ratePct, locale)}). Pending-outcome rate is ${formatPctLabel(pendingOutcomeRate, locale)}.`
      : `Perfil de desfecho liderado por ${topOutcomeLabel} (${formatPctLabel(topOutcome.ratePct, locale)}). Taxa de desfechos pendentes em ${formatPctLabel(pendingOutcomeRate, locale)}.`,
    evidence: [`taxonomySummary.outcomeType.${topOutcome.key}`, `pendingOutcomeRate:${pendingOutcomeRate}`]
  };

  const highlights = [
    isEn
      ? `Dominant service: ${topServiceLabel} (${formatPctLabel(topService.ratePct, locale)}).`
      : `Atendimento dominante: ${topServiceLabel} (${formatPctLabel(topService.ratePct, locale)}).`,
    isEn
      ? `Highest concentration in equipment: ${eqName} (${formatPctLabel(topEquipmentSharePct, locale)}).`
      : `Maior concentracao em equipamento: ${eqName} (${formatPctLabel(topEquipmentSharePct, locale)}).`,
    isEn
      ? `Classification quality: ${qualityLabel} (${formatPctLabel(confidencePct, locale)} confidence).`
      : `Qualidade da classificacao: ${qualityLabel} (${formatPctLabel(confidencePct, locale)} de confianca).`
  ];

  const limitations = [];
  if (unknownPct > 0 || undefinedPct > 0) {
    limitations.push(isEn
      ? `Taxonomy has residual uncertainty (${formatPctLabel(unknownPct, locale)} not identified / ${formatPctLabel(undefinedPct, locale)} undefined).`
      : `Taxonomia apresenta incerteza residual (${formatPctLabel(unknownPct, locale)} nao identificado / ${formatPctLabel(undefinedPct, locale)} indefinido).`);
  }
  if (unknownTechRatePct > 0) {
    limitations.push(isEn
      ? 'Technician attribution is partially incomplete and can reduce precision in accountability analytics.'
      : 'Atribuicao de tecnico parcialmente incompleta, reduzindo precisao da analise de responsabilidade.');
  }

  return {
    version: TAXONOMY_VERSION,
    locale,
    summary: executiveSummaryText,
    highlights,
    recommendedActions: recommendedActions.slice(0, 8),
    executiveSummary: {
      text: executiveSummaryText,
      confidencePct,
      evidence: [
        `totalOs:${totalOs}`,
        `topService:${topService.key}`,
        `topCause:${topCause.key}`,
        `topOutcome:${topOutcome.key}`,
        `quality:${qualityLevel}`
      ]
    },
    dominantPatterns,
    criticalFindings: criticalFindings.slice(0, 8),
    warrantyRead,
    equipmentConcentration,
    technicianRead,
    probableCauseRead,
    outcomeRead,
    riskRead,
    attentionPoints: attentionPoints.slice(0, 8),
    humanReviewTriggers: humanReviewTriggers.slice(0, 8),
    limitations: limitations.slice(0, 6)
  };
}

function buildClassificationQuality(params) {
  const payload = params || {};
  const total = Math.max(1, toNumber(payload.totalOs));
  const avgConfidencePct = Math.round(((toNumber(payload.confidenceSum) / total) * 100) * 100) / 100;

  const serviceUnknownPct = pct(payload.serviceCounter?.nao_identificado || 0, total);
  const warrantyUnknownPct = pct(payload.warrantyTypeCounter?.nao_identificado || 0, total);
  const warrantyStatusUnknownPct = pct(payload.warrantyStatusCounter?.nao_identificado || 0, total);
  const causeUndefinedPct = pct(payload.causeCounter?.indefinido || 0, total);
  const outcomeUndefinedPct = pct(payload.outcomeCounter?.indefinido || 0, total);

  const percentNaoIdentificado = Math.round(((serviceUnknownPct + warrantyUnknownPct + warrantyStatusUnknownPct) / 3) * 100) / 100;
  const percentIndefinido = Math.round(((causeUndefinedPct + outcomeUndefinedPct) / 2) * 100) / 100;
  const lowConfidencePct = pct(payload.lowConfidenceCount || 0, total);
  const coveragePct = Math.round(Math.max(0, 100 - ((percentNaoIdentificado * 0.6) + (percentIndefinido * 0.4))) * 100) / 100;

  let classificationQuality = 'low';
  if (avgConfidencePct >= 78 && percentNaoIdentificado <= 25 && percentIndefinido <= 25) classificationQuality = 'high';
  else if (avgConfidencePct >= 60 && percentNaoIdentificado <= 45 && percentIndefinido <= 45) classificationQuality = 'medium';

  return {
    version: TAXONOMY_VERSION,
    avgConfidencePct,
    lowConfidencePct,
    coveragePct,
    percentNaoIdentificado,
    percentIndefinido,
    axisQuality: {
      serviceType: { naoIdentificadoPct: serviceUnknownPct },
      warrantyType: { naoIdentificadoPct: warrantyUnknownPct },
      garantiaStatus: { naoIdentificadoPct: warrantyStatusUnknownPct },
      probableCause: { indefinidoPct: causeUndefinedPct },
      outcomeType: { indefinidoPct: outcomeUndefinedPct }
    },
    classificationQuality
  };
}

function buildGuidedReviewQueue(input) {
  const payload = input || {};
  const locale = detectLocale(payload.locale);
  const isEn = locale === 'en-US';
  const totalOs = Math.max(0, toNumber(payload.totalOs));
  const quality = (payload.classificationQuality && typeof payload.classificationQuality === 'object')
    ? payload.classificationQuality
    : {};
  const summary = (payload.taxonomySummary && typeof payload.taxonomySummary === 'object')
    ? payload.taxonomySummary
    : {};
  const narrative = (payload.technicalNarrativeV2 && typeof payload.technicalNarrativeV2 === 'object')
    ? payload.technicalNarrativeV2
    : {};
  const triggerList = Array.isArray(narrative.humanReviewTriggers) ? narrative.humanReviewTriggers : [];
  const limitations = Array.isArray(narrative.limitations) ? narrative.limitations.filter(Boolean) : [];

  const qualityLevel = String(
    quality.classificationQuality || summary.classificationQuality || 'low'
  ).toLowerCase();
  const avgConfidencePct = toNumber(
    quality.avgConfidencePct != null ? quality.avgConfidencePct : summary.confidenceAvgPct
  );
  const percentNaoIdentificado = toNumber(
    quality.percentNaoIdentificado != null ? quality.percentNaoIdentificado : summary.percentNaoIdentificado
  );
  const percentIndefinido = toNumber(
    quality.percentIndefinido != null ? quality.percentIndefinido : summary.percentIndefinido
  );

  const warrantyTypeDist = Array.isArray(summary.warrantyType) ? summary.warrantyType : [];
  const warrantyStatusDist = Array.isArray(summary.warrantyStatus) ? summary.warrantyStatus : [];
  const causeDist = Array.isArray(summary.probableCause) ? summary.probableCause : [];
  const outcomeDist = Array.isArray(summary.outcomeType) ? summary.outcomeType : [];
  const byTechnician = Array.isArray(payload.taxonomyByTechnician) ? payload.taxonomyByTechnician : [];

  if (!totalOs) {
    const noReviewReason = isEn
      ? 'No guided review queue generated because there are no WO in the selected period.'
      : 'Nenhuma fila guiada gerada porque nao ha O.S. no periodo selecionado.';
    return {
      reviewQueue: [],
      reviewPriority: 'none',
      reviewReason: noReviewReason,
      recommendedReviewer: 'monitoramento_automatico',
      reviewChecklist: [],
      reviewQueueSummary: {
        total: 0,
        byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
        requiresHumanReview: false,
        avgConfidencePct,
        classificationQuality: qualityLevel || 'low',
        generatedBy: `taxonomy_${TAXONOMY_VERSION}`
      }
    };
  }

  const warrantyTypeNotIdentifiedPct = toNumber(
    warrantyTypeDist.find((item) => item?.key === 'nao_identificado')?.ratePct
  );
  const warrantyStatusNotIdentifiedPct = toNumber(
    warrantyStatusDist.find((item) => item?.key === 'nao_identificado')?.ratePct
  );
  const probableCauseUndefinedPct = toNumber(
    causeDist.find((item) => item?.key === 'indefinido')?.ratePct
  );
  const pendingOutcomeCount = sumDistributionByKeys(outcomeDist, [
    'requer_peca',
    'requer_fabrica',
    'requer_cliente',
    'requer_nova_visita'
  ]);
  const pendingOutcomePct = pct(pendingOutcomeCount, Math.max(1, totalOs));

  let unknownTechnicianPct = toNumber(narrative?.technicianRead?.unknownRatePct);
  if (!unknownTechnicianPct && totalOs > 0) {
    const unknownRow = byTechnician.find((row) => {
      const normalized = normalizeText(row?.technician || '');
      return normalized.includes('nao identificado') || normalized.includes('not identified');
    });
    unknownTechnicianPct = pct(toNumber(unknownRow?.totalOs), totalOs);
  }

  function priorityScore(priority) {
    const key = String(priority || '').toLowerCase();
    if (key === 'critical') return 4;
    if (key === 'high') return 3;
    if (key === 'medium') return 2;
    if (key === 'low') return 1;
    return 0;
  }

  function normalizeReviewer(value) {
    const raw = toText(value);
    return raw || 'gestor_operacional';
  }

  const queueMap = new Map();
  function pushItem(itemLike) {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const code = toText(item.code);
    if (!code) return;
    const normalized = {
      code,
      priority: toText(item.priority || 'medium').toLowerCase(),
      reviewReason: toText(item.reviewReason || (isEn ? 'Manual review required.' : 'Revisao manual necessaria.')),
      impact: toText(item.impact || ''),
      recommendedReviewer: normalizeReviewer(item.recommendedReviewer),
      reviewChecklist: Array.from(new Set((Array.isArray(item.reviewChecklist) ? item.reviewChecklist : [])
        .map((line) => toText(line))
        .filter(Boolean))).slice(0, 10),
      evidence: Array.from(new Set((Array.isArray(item.evidence) ? item.evidence : [])
        .map((line) => toText(line))
        .filter(Boolean))).slice(0, 12),
      limitations: Array.from(new Set((Array.isArray(item.limitations) ? item.limitations : [])
        .map((line) => toText(line))
        .filter(Boolean))).slice(0, 8)
    };
    const current = queueMap.get(code);
    if (!current) {
      queueMap.set(code, normalized);
      return;
    }
    queueMap.set(code, {
      ...current,
      priority: priorityScore(normalized.priority) > priorityScore(current.priority)
        ? normalized.priority
        : current.priority,
      reviewReason: current.reviewReason || normalized.reviewReason,
      impact: current.impact || normalized.impact,
      recommendedReviewer: current.recommendedReviewer || normalized.recommendedReviewer,
      reviewChecklist: Array.from(new Set([...(current.reviewChecklist || []), ...normalized.reviewChecklist])).slice(0, 10),
      evidence: Array.from(new Set([...(current.evidence || []), ...normalized.evidence])).slice(0, 12),
      limitations: Array.from(new Set([...(current.limitations || []), ...normalized.limitations])).slice(0, 8)
    });
  }

  triggerList.forEach((trigger, index) => {
    const triggerCode = toText(trigger?.code || `trigger_${index + 1}`);
    const triggerPriority = String(trigger?.severity || 'medium').toLowerCase() === 'high'
      ? 'high'
      : (String(trigger?.severity || '').toLowerCase() === 'low' ? 'low' : 'medium');
    pushItem({
      code: triggerCode,
      priority: triggerCode === 'low_classification_quality' ? 'critical' : triggerPriority,
      reviewReason: toText(trigger?.message || (isEn ? 'Taxonomy trigger requires human review.' : 'Gatilho taxonomico requer revisao humana.')),
      impact: isEn
        ? 'Executive recommendation can be biased if this trigger is ignored.'
        : 'A recomendacao executiva pode ficar enviesada se este gatilho for ignorado.',
      recommendedReviewer: triggerCode.includes('technician') ? 'lider_tecnico' : 'gestor_operacional',
      reviewChecklist: [
        isEn ? 'Open impacted WO sample and verify defect/cause/action/outcome.' : 'Abrir amostra de O.S. impactadas e validar defeito/causa/acao/desfecho.',
        isEn ? 'Adjust taxonomy-sensitive fields and reprocess import if needed.' : 'Ajustar campos sensiveis da taxonomia e reprocessar importacao se necessario.'
      ],
      evidence: Array.isArray(trigger?.evidence) ? trigger.evidence : [],
      limitations
    });
  });

  if (qualityLevel === 'low') {
    pushItem({
      code: 'low_classification_quality',
      priority: 'critical',
      reviewReason: isEn
        ? 'Classification quality is low for this period.'
        : 'Qualidade de classificacao baixa neste periodo.',
      impact: isEn
        ? 'Risk of wrong prioritization, wrong ownership and weak executive decision.'
        : 'Risco de priorizacao incorreta, dono errado e decisao executiva fragil.',
      recommendedReviewer: 'gestor_operacional',
      reviewChecklist: [
        isEn ? 'Review at least 10 lowest-confidence WO manually.' : 'Revisar manualmente ao menos 10 O.S. com menor confianca.',
        isEn ? 'Confirm service type, warranty, probable cause and outcome.' : 'Confirmar tipo de atendimento, garantia, causa provavel e desfecho.',
        isEn ? 'Validate evidence quality in technical report before closing.' : 'Validar qualidade de evidencia no laudo tecnico antes do fechamento.'
      ],
      evidence: [
        `classificationQuality:${qualityLevel}`,
        `avgConfidencePct:${avgConfidencePct}`,
        `percentNaoIdentificado:${percentNaoIdentificado}`,
        `percentIndefinido:${percentIndefinido}`
      ],
      limitations
    });
  }

  if (avgConfidencePct > 0 && avgConfidencePct < 60) {
    pushItem({
      code: 'low_average_confidence',
      priority: 'high',
      reviewReason: isEn
        ? `Average confidence is below minimum (${formatPctLabel(avgConfidencePct, locale)}).`
        : `Confianca media abaixo do minimo (${formatPctLabel(avgConfidencePct, locale)}).`,
      impact: isEn
        ? 'Pattern interpretation can drift from actual field scenario.'
        : 'A interpretacao de padroes pode se afastar do cenario real de campo.',
      recommendedReviewer: 'engenharia_tecnica',
      reviewChecklist: [
        isEn ? 'Audit low-confidence records with technical lead.' : 'Auditar registros de baixa confianca com lider tecnico.',
        isEn ? 'Standardize report vocabulary to improve classifier signal.' : 'Padronizar vocabulario do laudo para melhorar sinal do classificador.'
      ],
      evidence: [`avgConfidencePct:${avgConfidencePct}`],
      limitations
    });
  }

  if (unknownTechnicianPct >= 15) {
    pushItem({
      code: 'technician_not_identified',
      priority: 'high',
      reviewReason: isEn
        ? `Technician attribution gap above threshold (${formatPctLabel(unknownTechnicianPct, locale)}).`
        : `Lacuna de identificacao de tecnico acima do limite (${formatPctLabel(unknownTechnicianPct, locale)}).`,
      impact: isEn
        ? 'Accountability, productivity ranking and workload balancing become unreliable.'
        : 'Responsabilidade, ranking de produtividade e balanceamento de carga ficam imprecisos.',
      recommendedReviewer: 'lider_tecnico',
      reviewChecklist: [
        isEn ? 'Fill technician owner for each affected WO.' : 'Preencher tecnico responsavel em cada O.S. afetada.',
        isEn ? 'Reprocess affected period and compare ranking before/after.' : 'Reprocessar periodo afetado e comparar ranking antes/depois.'
      ],
      evidence: [`unknownTechnicianPct:${unknownTechnicianPct}`],
      limitations
    });
  }

  if (probableCauseUndefinedPct >= 25) {
    pushItem({
      code: 'probable_cause_undefined_high',
      priority: 'high',
      reviewReason: isEn
        ? `Undefined probable cause exceeded tolerance (${formatPctLabel(probableCauseUndefinedPct, locale)}).`
        : `Causa provavel indefinida acima da tolerancia (${formatPctLabel(probableCauseUndefinedPct, locale)}).`,
      impact: isEn
        ? 'Root-cause action plan can target wrong vectors.'
        : 'O plano de causa raiz pode atacar vetores errados.',
      recommendedReviewer: 'engenharia_tecnica',
      reviewChecklist: [
        isEn ? 'Review evidence field in technical report for impacted WO.' : 'Revisar campo de evidencia do laudo nas O.S. impactadas.',
        isEn ? 'Force explicit cause annotation (equipment/install/software/infrastructure/integration).' : 'Forcar anotacao explicita de causa (equipamento/instalacao/software/infraestrutura/integracao).'
      ],
      evidence: [`probableCause.indefinido:${probableCauseUndefinedPct}`],
      limitations
    });
  }

  const warrantyAmbiguous = warrantyTypeNotIdentifiedPct >= 20 || warrantyStatusNotIdentifiedPct >= 20;
  if (warrantyAmbiguous) {
    pushItem({
      code: 'warranty_read_ambiguous',
      priority: 'medium',
      reviewReason: isEn
        ? `Warranty classification ambiguity detected (${formatPctLabel(Math.max(warrantyTypeNotIdentifiedPct, warrantyStatusNotIdentifiedPct), locale)}).`
        : `Ambiguidade na classificacao de garantia detectada (${formatPctLabel(Math.max(warrantyTypeNotIdentifiedPct, warrantyStatusNotIdentifiedPct), locale)}).`,
      impact: isEn
        ? 'Billing and claim risk can increase due to wrong warranty path.'
        : 'Risco de faturamento e glosa pode aumentar por caminho de garantia incorreto.',
      recommendedReviewer: 'lider_administrativo',
      reviewChecklist: [
        isEn ? 'Validate contract/warranty metadata for affected WO.' : 'Validar metadados de contrato/garantia das O.S. afetadas.',
        isEn ? 'Confirm if case is part, service-installation, factory or out of warranty.' : 'Confirmar se o caso e garantia de peca, servico/instalacao, fabrica ou fora de garantia.'
      ],
      evidence: [
        `warrantyType.nao_identificado:${warrantyTypeNotIdentifiedPct}`,
        `warrantyStatus.nao_identificado:${warrantyStatusNotIdentifiedPct}`
      ],
      limitations
    });
  }

  if (pendingOutcomePct >= 25) {
    pushItem({
      code: 'pending_outcome_high',
      priority: 'high',
      reviewReason: isEn
        ? `Pending outcomes above threshold (${formatPctLabel(pendingOutcomePct, locale)}).`
        : `Desfechos pendentes acima do limite (${formatPctLabel(pendingOutcomePct, locale)}).`,
      impact: isEn
        ? 'Backlog can grow and SLA risk may escalate in upcoming cycles.'
        : 'Backlog pode crescer e o risco de SLA pode escalar nos proximos ciclos.',
      recommendedReviewer: 'coordenacao_operacional',
      reviewChecklist: [
        isEn ? 'Assign owner and ETA to each pending outcome cluster.' : 'Atribuir dono e prazo para cada cluster de desfecho pendente.',
        isEn ? 'Escalate part/factory/customer blockers older than 24h.' : 'Escalonar bloqueios de peca/fabrica/cliente com mais de 24h.'
      ],
      evidence: [`pendingOutcomePct:${pendingOutcomePct}`],
      limitations
    });
  }

  if (triggerList.length >= 2) {
    pushItem({
      code: 'multiple_triggers_active',
      priority: triggerList.length >= 4 ? 'high' : 'medium',
      reviewReason: isEn
        ? `${triggerList.length} human-review triggers were activated simultaneously.`
        : `${triggerList.length} gatilhos de revisao humana foram ativados simultaneamente.`,
      impact: isEn
        ? 'Compound signal increases chance of misinterpretation if not reviewed with governance.'
        : 'Sinal composto aumenta chance de interpretacao incorreta sem governanca.',
      recommendedReviewer: 'gestor_operacional',
      reviewChecklist: [
        isEn ? 'Run governance huddle with operation + technical + admin leads.' : 'Executar huddle de governanca com lideres operacao + tecnico + administrativo.',
        isEn ? 'Define owner/date for each active trigger and track closure.' : 'Definir dono/prazo para cada gatilho ativo e acompanhar fechamento.'
      ],
      evidence: triggerList.map((trigger) => `trigger:${toText(trigger?.code)}`),
      limitations
    });
  }

  const queue = Array.from(queueMap.values())
    .sort((a, b) => {
      const p = priorityScore(b.priority) - priorityScore(a.priority);
      if (p !== 0) return p;
      return String(a.code).localeCompare(String(b.code));
    })
    .slice(0, 25);

  const priorityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  queue.forEach((item) => {
    const key = String(item.priority || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(priorityCount, key)) {
      priorityCount[key] += 1;
    }
  });

  const top = queue[0] || null;
  const noReviewReason = isEn
    ? 'No mandatory guided human review for this period.'
    : 'Sem revisao humana guiada obrigatoria para este periodo.';

  return {
    reviewQueue: queue,
    reviewPriority: top?.priority || 'none',
    reviewReason: top?.reviewReason || noReviewReason,
    recommendedReviewer: top?.recommendedReviewer || 'monitoramento_automatico',
    reviewChecklist: Array.isArray(top?.reviewChecklist) ? top.reviewChecklist : [],
    reviewQueueSummary: {
      total: queue.length,
      byPriority: priorityCount,
      requiresHumanReview: queue.length > 0,
      avgConfidencePct,
      classificationQuality: qualityLevel,
      generatedBy: `taxonomy_${TAXONOMY_VERSION}`
    }
  };
}

function buildAnalyticsTaxonomy(itemsLike, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale);
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const totalOs = items.length;
  const period = {
    type: toText(opts.periodType || 'daily'),
    label: toText(opts.periodLabel || opts.referenceDate || ''),
    referenceDate: toText(opts.referenceDate || '')
  };

  const serviceCounter = buildCounter(SERVICE_TYPES);
  const warrantyStatusCounter = buildCounter(WARRANTY_STATUS_TYPES);
  const warrantyTypeCounter = buildCounter(WARRANTY_TYPES);
  const causeCounter = buildCounter(PROBABLE_CAUSES);
  const outcomeCounter = buildCounter(OUTCOME_TYPES);

  const byEquipment = new Map();
  const byTechnician = new Map();
  const byLocation = new Map();
  const classifiedPreview = [];
  let confidenceSum = 0;
  let lowConfidenceCount = 0;
  let technicianIdentifiedCount = 0;

  const fallbackEquipment = locale === 'en-US' ? 'Equipment not identified' : 'Equipamento nao identificado';
  const fallbackTechnician = locale === 'en-US' ? 'Technician not identified' : 'Tecnico nao identificado';
  const fallbackLocation = locale === 'en-US' ? 'Location not identified' : 'Local nao identificado';

  function ensureGroup(map, key, categoryKeys) {
    if (!map.has(key)) map.set(key, createGroupBucket(key, categoryKeys));
    return map.get(key);
  }

  items.forEach((itemLike) => {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const classification = classifyItem(item);
    confidenceSum += toNumber(classification.confidence);
    if (classification.confidence < 0.45) lowConfidenceCount += 1;

    incrementCounter(serviceCounter, classification.serviceType);
    incrementCounter(warrantyStatusCounter, classification.garantiaStatus);
    incrementCounter(warrantyTypeCounter, classification.warrantyType);
    incrementCounter(causeCounter, classification.probableCause);
    incrementCounter(outcomeCounter, classification.outcomeType);

    const equipment = normalizeLabel(item.produto, fallbackEquipment, 120);
    const technicianIdentity = resolveTechnicianIdentity(item, locale, fallbackTechnician);
    const technician = normalizeLabel(technicianIdentity.name, fallbackTechnician, 90);
    const location = normalizeLabel(item.cliente || item.unidade || item.local, fallbackLocation, 120);
    if (technicianIdentity.identified) technicianIdentifiedCount += 1;

    addClassificationToBucket(
      ensureGroup(byEquipment, equipment, { nameKey: 'equipment' }),
      classification
    );
    addClassificationToBucket(
      ensureGroup(byTechnician, technician, { nameKey: 'technician' }),
      classification
    );
    addClassificationToBucket(
      ensureGroup(byLocation, location, { nameKey: 'location' }),
      classification
    );

    if (classifiedPreview.length < 120) {
      classifiedPreview.push({
        os: toText(item.os || item.id || ''),
        equipment,
        technician,
        technicianSource: technicianIdentity.source,
        location,
        ...classification
      });
    }
  });

  const classificationQuality = buildClassificationQuality({
    totalOs,
    confidenceSum,
    lowConfidenceCount,
    serviceCounter,
    warrantyStatusCounter,
    warrantyTypeCounter,
    causeCounter,
    outcomeCounter
  });

  const taxonomySummary = {
    version: TAXONOMY_VERSION,
    locale,
    period,
    totalOs,
    serviceType: counterToDistribution(serviceCounter, totalOs),
    warrantyStatus: counterToDistribution(warrantyStatusCounter, totalOs),
    warrantyType: counterToDistribution(warrantyTypeCounter, totalOs),
    probableCause: counterToDistribution(causeCounter, totalOs),
    outcomeType: counterToDistribution(outcomeCounter, totalOs),
    confidenceAvgPct: classificationQuality.avgConfidencePct,
    percentNaoIdentificado: classificationQuality.percentNaoIdentificado,
    percentIndefinido: classificationQuality.percentIndefinido,
    classificationQuality: classificationQuality.classificationQuality,
    sampleClassifications: classifiedPreview.slice(0, 40)
  };

  const taxonomyByEquipment = Array.from(byEquipment.values())
    .map(normalizeGroupBucket)
    .sort((a, b) => toNumber(b.totalOs) - toNumber(a.totalOs))
    .slice(0, 30);
  const taxonomyByTechnician = Array.from(byTechnician.values())
    .map(normalizeGroupBucket)
    .sort((a, b) => toNumber(b.totalOs) - toNumber(a.totalOs))
    .slice(0, 30);
  const taxonomyByLocation = Array.from(byLocation.values())
    .map(normalizeGroupBucket)
    .sort((a, b) => toNumber(b.totalOs) - toNumber(a.totalOs))
    .slice(0, 30);

  const technicalNarrativeV2 = buildTechnicalNarrativeV2({
    locale,
    totalOs,
    summary: taxonomySummary,
    quality: classificationQuality,
    taxonomyByEquipment,
    taxonomyByTechnician,
    taxonomyByLocation,
    technicianIdentifiedCount,
    technicianUnknownCount: Math.max(0, totalOs - technicianIdentifiedCount)
  });
  const guidedReview = buildGuidedReviewQueue({
    locale,
    totalOs,
    taxonomySummary,
    taxonomyByTechnician,
    classificationQuality,
    technicalNarrativeV2
  });

  return {
    version: TAXONOMY_VERSION,
    locale,
    period,
    taxonomySummary,
    taxonomyByEquipment,
    taxonomyByTechnician,
    taxonomyByLocation,
    technicalNarrativeV2,
    classificationQuality,
    reviewQueue: guidedReview.reviewQueue,
    reviewPriority: guidedReview.reviewPriority,
    reviewReason: guidedReview.reviewReason,
    recommendedReviewer: guidedReview.recommendedReviewer,
    reviewChecklist: guidedReview.reviewChecklist,
    reviewQueueSummary: guidedReview.reviewQueueSummary
  };
}

module.exports = {
  TAXONOMY_VERSION,
  buildAnalyticsTaxonomy
};
