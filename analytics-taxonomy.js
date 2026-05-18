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
  { key: 'suporte_ajuste', tokens: ['suporte', 'ajuste', 'calibr', 'limpeza', 'lubrific', 'regulagem', 'afinacao', 'teste de impressora'] }
];

const PROBABLE_CAUSE_RULES = [
  { key: 'integracao', tokens: ['integracao', 'api', 'webservice', 'middleware', 'erp', 'interface', 'kairos', 'rep ponto', 'comunicacao sistema'] },
  { key: 'infraestrutura_cliente', tokens: ['rede', 'internet', 'switch', 'energia', 'tomada', 'nobreak', 'infraestrutura', 'cliente sem acesso', 'cabeamento externo', 'sem acesso', 'cabo de rede', 'queda de energia', 'instabilidade', 'wifi', 'wi fi', 'sem comunicacao na rede'] },
  { key: 'software_configuracao', tokens: ['software', 'firmware', 'configur', 'parametriz', 'parametro', 'versao', 'update', 'atualiz', 'banco', 'sql', 'servico', 'comunicacao', 'cadastro', 'envio de cadastro'] },
  { key: 'instalacao', tokens: ['instalacao', 'implantacao', 'fixacao', 'montagem', 'cabeamento', 'infra instalacao', 'comissionamento'] },
  { key: 'peca_acessorio', tokens: ['peca', 'acessorio', 'consumivel', 'bateria', 'cabo', 'sensor', 'bobina', 'impressora', 'guilhotina', 'fonte', 'modulo', 'touch', 'display', 'biometrico', 'sagem'] },
  { key: 'operacao_uso', tokens: ['usuario', 'uso incorreto', 'procedimento', 'treinamento', 'operacao', 'orientacao', 'acompanhado', 'validado juntamente', 'instrucao', 'configuracao incorreta'] },
  { key: 'equipamento', tokens: ['equipamento', 'hardware', 'leitor', 'catraca', 'placa', 'motor', 'display', 'relogio', 'controlador', 'printpoint', 'd-rep', 'micropoint', 'defeito', 'falha', 'nao liga', 'nao inicializa', 'travado', 'travando', 'luz vermelha', 'erro hardware'] }
];

const OUTCOME_RULES = [
  { key: 'requer_fabrica', tokens: ['fabrica', 'fabricante', 'rma', 'engenharia fabricante'] },
  { key: 'requer_peca', tokens: ['requer peca', 'aguardando peca', 'sem peca', 'pedido de peca', 'troca de peca', 'necessario peca'] },
  { key: 'requer_cliente', tokens: ['aguardando cliente', 'dependencia cliente', 'liberacao cliente', 'cliente pendente', 'sem acesso cliente'] },
  { key: 'requer_nova_visita', tokens: ['nova visita', 'retorno tecnico', 'reagend', 'revisita', 'nao resolvido', 'sem solucao'] },
  { key: 'paliativo', tokens: ['paliativo', 'temporario', 'contingencia', 'workaround'] },
  { key: 'resolvido', tokens: ['resolvido', 'concluido', 'encerrado', 'normalizado', 'feito', 'realizado', 'realizada', 'sucesso', 'validado', 'testado', 'teste realizado', 'sem apresentar falha', 'configurado', 'configurada', 'ajustado', 'ajustada', 'parametrizado', 'parametrizada', 'atualizado', 'atualizada', 'corrigido', 'corrigida', 'substituido', 'substituida', 'substituicao', 'troca realizada', 'limpeza', 'lubrificacao', 'preventiva realizada'] }
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
    .toLowerCase()
    .replace(/[^a-z0-9\s$.,:/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function shortEvidenceText(valueLike, maxLen = 120) {
  const text = toText(valueLike).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}...` : text;
}

function pickTextFieldEvidence(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const candidates = [
    ['problema_relato', item.problemaRelatado || item.problema_relatado || item.defeito || item.problema],
    ['problema_encontrado', item.problemaEncontrado || item.problema_encontrado],
    ['solucao', item.solucao || item.acao || item.acaoRealizada],
    ['laudo', item.laudo],
    ['observacao', item.observacao],
    ['historico', item.historico],
    ['classificacao', item.classificacao],
    ['nextStep', item.nextStep]
  ];
  return candidates
    .map(([source, value]) => ({ source, text: shortEvidenceText(value) }))
    .filter(item => item.text)
    .slice(0, 4);
}

function stringifyIssueText(issuesLike) {
  return (Array.isArray(issuesLike) ? issuesLike : [])
    .map((issue) => `${toText(issue?.type)} ${toText(issue?.message)} ${toText(issue?.description)} ${toText(issue?.detail)}`)
    .join(' ');
}

function buildOperationalFullText(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  return normalizeText([
    item.problemaRelatado,
    item.problema_relatado,
    item.problema,
    item.problemaEncontrado,
    item.problema_encontrado,
    item.defeito,
    item.causa,
    item.solucao,
    item.acao,
    item.acaoRealizada,
    item.acao_realizada,
    item.laudo,
    item.historico,
    item.observacao,
    item.classificacao,
    item.nextStep,
    item.tipoServico,
    item.codigoRaw,
    item.codigoOperacional,
    item.cobertura,
    item.produto,
    item.equipamento,
    item.ordemCompra,
    stringifyIssueText(item.issues)
  ].filter(Boolean).join(' '));
}

function hasUsefulOperationalText(textLike) {
  return normalizeText(textLike).replace(/[-_.:/,$\s0-9]/g, '').length >= 12;
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
    if (hasUsefulOperationalText(baseText)) {
      return {
        probableCause: 'equipamento',
        confidence: 0.42,
        evidence: ['signal:cause_low_confidence_text_available']
      };
    }
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

function refineCauseForService(causeLike, serviceLike, itemLike) {
  const cause = (causeLike && typeof causeLike === 'object') ? { ...causeLike } : {};
  const service = toText(serviceLike);
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const text = normalizeText([
    item.produto,
    item.observacao,
    item.laudo,
    item.nextStep
  ].filter(Boolean).join(' '));
  if (cause.probableCause !== 'indefinido') return cause;
  if (service === 'preventiva') {
    return {
      probableCause: text.includes('limpeza') || text.includes('lubrific') || text.includes('teste')
        ? 'operacao_uso'
        : 'equipamento',
      confidence: 0.58,
      evidence: ['signal:preventive_context']
    };
  }
  if (service === 'instalacao') {
    return { probableCause: 'instalacao', confidence: 0.62, evidence: ['signal:installation_context'] };
  }
  if (service === 'configuracao' || service === 'suporte_ajuste') {
    return { probableCause: 'software_configuracao', confidence: 0.56, evidence: ['signal:service_context'] };
  }
  return cause;
}

function detectOutcome(item, baseText) {
  const issues = Array.isArray(item?.issues) ? item.issues : [];
  const issuesText = stringifyIssueText(issues);
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

  if (hasUsefulOperationalText([
    item?.solucao,
    item?.acao,
    item?.acaoRealizada,
    item?.acao_realizada,
    item?.laudo,
    item?.observacao,
    item?.historico,
    baseText
  ].filter(Boolean).join(' '))) {
    return {
      outcomeType: 'resolvido',
      confidence: 0.46,
      evidence: ['signal:solution_low_confidence_text_available']
    };
  }

  return {
    outcomeType: 'indefinido',
    confidence: 0.2,
    evidence: ['signal:outcome_undefined']
  };
}

function pickFirstText(item, keys) {
  const source = (item && typeof item === 'object') ? item : {};
  for (const key of keys) {
    const value = toText(source[key]);
    if (value) return value;
  }
  return '';
}

function detectBooleanFromText(textLike, tokens) {
  const text = normalizeText(textLike);
  return (Array.isArray(tokens) ? tokens : []).some((token) => text.includes(normalizeText(token)));
}

function detectOperationalRecurrenceSignals(item, fullText, classification, piece) {
  const source = (item && typeof item === 'object') ? item : {};
  const text = normalizeText(fullText);
  const textSignals = [];
  const pendingSignals = [];
  const linkedOs = pickFirstText(source, [
    'osAnterior',
    'os_anterior',
    'osOrigem',
    'os_origem',
    'rr',
    'retornoOs',
    'retorno_os'
  ]);

  [
    ['retorno', ['retorno', 'retornou', 'retornar']],
    ['reabertura', ['reabertura', 'reaberto', 'reaberta']],
    ['reincidencia', ['reincidencia', 'reincidente', 'recorrente']],
    ['novamente', ['novamente', 'voltou a apresentar', 'apresentou novamente']],
    ['persistente', ['persistente', 'permanece', 'continua com', 'falha persiste']]
  ].forEach(([signal, tokens]) => {
    if (detectBooleanFromText(text, tokens)) textSignals.push(signal);
  });

  [
    ['aguardando_peca', ['aguardando peca', 'sem peca', 'pedido de peca', 'necessario peca']],
    ['aguardando_cliente', ['aguardando cliente', 'dependencia cliente', 'cliente pendente', 'liberacao cliente']],
    ['aguardando_retorno', ['aguardando retorno', 'aguarda retorno', 'cliente ira retornar']],
    ['reagendamento', ['reagend', 'nova visita', 'necessario retornar', 'retorno tecnico']],
    ['visita_improdutiva', ['visita improdutiva', 'improdutiva', 'sem acesso', 'cliente ausente', 'local fechado']]
  ].forEach(([signal, tokens]) => {
    if (detectBooleanFromText(text, tokens)) pendingSignals.push(signal);
  });

  const fieldsUsed = [];
  if (hasOperationalValue(source.cliente || classification?.cliente)) fieldsUsed.push('cliente');
  if (hasOperationalValue(source.produto || source.equipamento)) fieldsUsed.push('equipamento');
  if (hasOperationalValue(source.defeito || source.problemaRelatado || source.problemaEncontrado || source.causa)) fieldsUsed.push('defeito_causa');
  if (hasOperationalValue(linkedOs)) fieldsUsed.push('os_anterior');
  if (piece?.used) fieldsUsed.push('peca_acao');
  if (textSignals.length) fieldsUsed.push('texto_recorrencia');
  if (pendingSignals.length) fieldsUsed.push('texto_pendencia');

  return {
    textSignals,
    pendingSignals,
    linkedOs,
    repeatedAction: piece?.used || classification?.outcomeType === 'requer_peca',
    fieldsUsed
  };
}

function classifyBaseRecurrence(signals) {
  const s = (signals && typeof signals === 'object') ? signals : {};
  if (Array.isArray(s.pendingSignals) && s.pendingSignals.length) {
    return {
      level: 'pendencia_operacional',
      reason: 'Texto indica pendencia operacional; nao conta como recorrencia real sem cluster confirmado.'
    };
  }
  if (hasOperationalValue(s.linkedOs)) {
    return {
      level: 'forte',
      reason: 'Existe OS anterior vinculada, mas a consolidacao do cluster ainda depende dos demais campos.'
    };
  }
  if (Array.isArray(s.textSignals) && s.textSignals.length) {
    return {
      level: 'fraco',
      reason: 'Ha palavra de recorrencia no texto, sem cluster operacional consolidado.'
    };
  }
  return {
    level: 'sem_recorrencia',
    reason: 'Nao ha evidencia suficiente de retorno ou recorrencia operacional.'
  };
}

function detectPieceUsed(item, fullText) {
  const pieceText = pickFirstText(item, [
    'peca',
    'pecas',
    'pecaUtilizada',
    'peca_utilizada',
    'codigoPeca',
    'codigo_peca',
    'partCode'
  ]);
  const text = normalizeText(`${pieceText} ${fullText}`);
  const used = !!pieceText || detectBooleanFromText(text, ['troca', 'substituicao', 'substituido', 'peca', 'placa', 'fonte', 'display', 'modulo', 'impressora', 'bateria', 'bobina', 'guilhotina']);
  return {
    used,
    label: pieceText || (used ? 'peca_ou_componente_inferido' : '')
  };
}

function detectBilling(item, fullText) {
  const billingText = pickFirstText(item, ['cobranca', 'faturamento', 'valor', 'valorTotal', 'valor_total', 'ordemCompra', 'oc']);
  const text = normalizeText(`${billingText} ${fullText}`);
  if (detectBooleanFromText(text, ['sem debito', 'sem cobrança', 'sem cobranca', 'nao cobrar', 'garantia', 'cortesia'])) return 'sem_debito_ou_garantia';
  if (detectBooleanFromText(text, ['cobrar', 'faturamento', 'valor da primeira hora', 'valor hora adicional', 'ordem de compra', 'oc ', 'r$'])) return 'cobranca_aplicavel';
  return 'nao_identificada';
}

function detectSla(item, fullText) {
  const text = normalizeText(`${pickFirstText(item, ['sla', 'prazo', 'dataLimite', 'data_limite'])} ${fullText}`);
  if (detectBooleanFromText(text, ['atraso', 'vencido', 'fora do prazo', 'sla estourado'])) return 'nao_cumprido';
  if (detectBooleanFromText(text, ['dentro do prazo', 'prazo cumprido', 'sla cumprido'])) return 'cumprido';
  return 'nao_identificado';
}

function operationalFallback(valueLike, fallback) {
  const value = toText(valueLike);
  return value || fallback;
}

function normalizeOperationalDate(valueLike) {
  const text = toText(valueLike);
  if (!text) return '';
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return '';
}

function getOperationalDate(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  return normalizeOperationalDate(pickFirstText(item, [
    'sourceRecordDate',
    'recordDate',
    'dataReferencia',
    'data_referencia',
    'dataAbertura',
    'data_abertura',
    'openedDate',
    'dataConclusao',
    'data_conclusao',
    'closedDate',
    'date'
  ]));
}

function daysBetweenDates(firstDateLike, lastDateLike) {
  const first = normalizeOperationalDate(firstDateLike);
  const last = normalizeOperationalDate(lastDateLike);
  if (!first || !last) return null;
  const a = new Date(`${first}T00:00:00Z`);
  const b = new Date(`${last}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function classifyRecurrenceWindow(daysLike, hasDate) {
  if (!hasDate || daysLike == null) {
    return { window: 'sem_data', severity: 'nao_aplicavel', reason: 'Cluster sem data suficiente para janela temporal.' };
  }
  const days = toNumber(daysLike);
  if (days <= 7) return { window: 'ate_7_dias', severity: 'critica', reason: 'Mesmo cliente/equipamento/causa em ate 7 dias.' };
  if (days <= 15) return { window: 'ate_15_dias', severity: 'relevante', reason: 'Mesmo cliente/equipamento/causa em ate 15 dias.' };
  if (days <= 30) return { window: 'ate_30_dias', severity: 'historica', reason: 'Mesmo cliente/equipamento/causa entre 16 e 30 dias.' };
  return { window: 'acima_30_dias', severity: 'volume_concentrado', reason: 'Volume no periodo sem proximidade temporal suficiente para retorno real.' };
}

function buildOperationalContext(itemLike, classification) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const fullText = buildOperationalFullText(item);
  const occurrenceDate = getOperationalDate(item);
  const piece = detectPieceUsed(item, fullText);
  const recurrenceSignals = detectOperationalRecurrenceSignals(item, fullText, classification, piece);
  const baseRecurrence = classifyBaseRecurrence(recurrenceSignals);
  const returnSignal = detectBooleanFromText(fullText, ['retorno', 'reincidencia', 'reincid', 'revisita', 'reabertura', 'rr', 'nova visita']);
  const improductive = detectBooleanFromText(fullText, ['improdutiva', 'visita improdutiva', 'sem acesso', 'cliente ausente', 'local fechado']);
  const escalated = detectBooleanFromText(fullText, ['escalon', 'sap', 'fabricante', 'engenharia', 'matriz', 'bruno', 'suporte nivel']);
  const paliative = classification.outcomeType === 'paliativo'
    || classification.outcomeType === 'requer_nova_visita'
    || detectBooleanFromText(fullText, ['paliativo', 'temporario', 'contingencia', 'workaround', 'nao resolvido', 'sem solucao']);
  const definitive = classification.outcomeType === 'resolvido' && !paliative && !returnSignal;
  const responsibilityMap = {
    infraestrutura_cliente: 'infraestrutura',
    software_configuracao: 'software',
    integracao: 'integracao',
    operacao_uso: 'operacao_cliente',
    instalacao: 'procedimento',
    peca_acessorio: 'equipamento',
    equipamento: 'equipamento',
    indefinido: 'nao_identificada'
  };
  const responsibility = responsibilityMap[classification.probableCause] || 'nao_identificada';
  const issueSignature = normalizeText([
    item.defeito,
    item.problemaRelatado,
    item.problema_relatado,
    item.problemaEncontrado,
    item.problema_encontrado,
    item.causa
  ].filter(Boolean).join(' ')).slice(0, 80);
  const recurrenceKey = [
    normalizeText(item.cliente || item.unidade || item.local || 'cliente_nao_identificado').slice(0, 50),
    normalizeText(item.produto || item.equipamento || 'equipamento_nao_identificado').slice(0, 50),
    issueSignature || classification.probableCause
  ].join('__');
  const riskScore = [
    returnSignal ? 2 : 0,
    paliative ? 2 : 0,
    piece.used ? 1 : 0,
    classification.outcomeType !== 'resolvido' ? 2 : 0,
    improductive ? 1 : 0,
    escalated ? 1 : 0,
    classification.confidence < 0.55 ? 1 : 0
  ].reduce((acc, value) => acc + value, 0);
  const riskLevel = riskScore >= 5 ? 'critical' : (riskScore >= 3 ? 'high' : (riskScore >= 1 ? 'medium' : 'low'));
  const evidence = pickTextFieldEvidence(item).slice(0, 3);
  return {
    version: 'OPERATIONAL_CONTEXT_V1',
    os: operationalFallback(classification.os, 'nao informado'),
    cliente: operationalFallback(classification.cliente, 'nao informado'),
    equipamento: operationalFallback(item.produto || item.equipamento, 'nao informado'),
    tecnico: operationalFallback(item.tecnico || item.responsavelTecnico || item.responsavel || item.technician, 'nao informado'),
    occurrenceDate: operationalFallback(occurrenceDate, 'sem_data'),
    jornada: {
      abertura: {
        motivo: operationalFallback(item.tipoServico || item.classificacao || classification.serviceType, 'nao informado'),
        problemaRelatado: operationalFallback(pickFirstText(item, ['problemaRelatado', 'problema_relatado', 'problema', 'defeito']), 'nao informado')
      },
      diagnostico: {
        problemaEncontrado: operationalFallback(pickFirstText(item, ['problemaEncontrado', 'problema_encontrado', 'causa', 'laudo']), 'nao evidenciado'),
        causaRaizProvavel: classification.probableCause,
        responsabilidadeProvavel: responsibility
      },
      execucao: {
        acaoExecutada: operationalFallback(pickFirstText(item, ['solucao', 'acao', 'acaoRealizada', 'acao_realizada', 'observacao']), 'nao evidenciado'),
        pecaUtilizada: operationalFallback(piece.label, piece.used ? 'peca inferida sem codigo' : 'nao informado'),
        houveTroca: piece.used
      },
      conclusao: {
        outcomeType: classification.outcomeType,
        definitiva: definitive,
        paliativa: paliative,
        sla: detectSla(item, fullText)
      },
      retornoRecorrencia: {
        houveRetorno: baseRecurrence.level === 'forte',
        possivelRecorrencia: false,
        recurrenceKey,
        recurrenceLevel: baseRecurrence.level,
        recurrenceWindow: 'sem_data',
        recurrenceSeverity: 'nao_aplicavel',
        recurrenceReason: baseRecurrence.reason,
        recurrenceEvidence: {
          sinaisEncontrados: [
            ...recurrenceSignals.textSignals,
            ...recurrenceSignals.pendingSignals,
            recurrenceSignals.linkedOs ? 'os_anterior_vinculada' : '',
            recurrenceSignals.repeatedAction ? 'mesma_peca_acao_possivel' : ''
          ].filter(Boolean),
          camposUsados: recurrenceSignals.fieldsUsed,
          clusterId: '',
          motivo: baseRecurrence.reason
        }
      }
    },
    garantia: classification.warrantyType,
    cobranca: detectBilling(item, fullText),
    visitaImprodutiva: improductive,
    clienteCritico: detectBooleanFromText(fullText, ['critico', 'crítico', 'vip', 'prioridade alta', 'urgente']),
    escalonamento: escalated,
    efetividadeSolucao: definitive ? 'definitiva' : (paliative ? 'paliativa' : 'pendente_ou_nao_confirmada'),
    riscoOperacional: riskLevel,
    recurrenceLevel: baseRecurrence.level,
    recurrenceWindow: 'sem_data',
    recurrenceSeverity: 'nao_aplicavel',
    recurrenceReason: baseRecurrence.reason,
    recurrenceEvidence: {
      sinaisEncontrados: [
        ...recurrenceSignals.textSignals,
        ...recurrenceSignals.pendingSignals,
        recurrenceSignals.linkedOs ? 'os_anterior_vinculada' : '',
        recurrenceSignals.repeatedAction ? 'mesma_peca_acao_possivel' : ''
      ].filter(Boolean),
      camposUsados: recurrenceSignals.fieldsUsed,
      clusterId: '',
      motivo: baseRecurrence.reason
    },
    chanceRecorrencia: baseRecurrence.level === 'forte'
      ? 'alta'
      : (baseRecurrence.level === 'fraco' || piece.used || classification.outcomeType !== 'resolvido' ? 'media' : 'baixa'),
    confidencePct: Math.round(toNumber(classification.confidence) * 10000) / 100,
    evidence: evidence.length ? evidence : [{ source: 'contexto', text: 'dados insuficientes' }]
  };
}

function classifyItem(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const baseText = buildOperationalFullText(item);

  const service = detectPrimaryService(item, baseText);
  const warranty = detectWarranty(item, baseText);
  const cause = refineCauseForService(detectProbableCause(baseText), service.serviceType, item);
  const outcome = detectOutcome(item, baseText);
  const confidence = Math.round(((service.confidence + warranty.confidence + cause.confidence + outcome.confidence) / 4) * 100) / 100;
  const evidence = joinEvidence([
    ...service.evidence,
    ...warranty.evidence,
    ...cause.evidence,
    ...outcome.evidence
  ]);

  const result = {
    os: toText(item.os || item.id || ''),
    cliente: toText(item.cliente || item.clienteNome || item.razaoSocial || item.nomeCliente || ''),
    serviceType: service.serviceType,
    primaryServiceType: service.primaryServiceType,
    secondarySignals: service.secondarySignals,
    garantiaStatus: warranty.garantiaStatus,
    warrantyType: warranty.warrantyType,
    probableCause: cause.probableCause,
    outcomeType: outcome.outcomeType,
    confidence,
    evidence,
    fieldEvidence: pickTextFieldEvidence(item)
  };
  result.operationalContext = buildOperationalContext(item, result);
  return result;
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
    evidenceSamples: [],
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
  if (bucket.evidenceSamples.length < 8) {
    const field = Array.isArray(classification.fieldEvidence) ? classification.fieldEvidence[0] : null;
    bucket.evidenceSamples.push({
      os: toText(classification.os || ''),
      cliente: toText(classification.cliente || ''),
      source: toText(field?.source || classification.evidence?.[0] || 'classification'),
      text: shortEvidenceText(field?.text || classification.evidence?.[0] || ''),
      cause: toText(classification.probableCause || ''),
      outcome: toText(classification.outcomeType || ''),
      serviceType: toText(classification.serviceType || ''),
      confidencePct: Math.round(toNumber(classification.confidence) * 10000) / 100
    });
  }
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
    secondarySignals: topSignals,
    evidenceSamples: bucket.evidenceSamples.slice(0, 8)
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

function incrementMapCounter(map, keyLike, amountLike) {
  const key = toText(keyLike || 'nao_identificado') || 'nao_identificado';
  map.set(key, toNumber(map.get(key)) + (amountLike == null ? 1 : toNumber(amountLike)));
}

function mapToRanking(map, total, valueKey) {
  return Array.from(map.entries())
    .map(([key, count]) => ({
      key,
      [valueKey || 'count']: count,
      count,
      ratePct: pct(count, Math.max(1, total))
    }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
    .slice(0, 15);
}

function hasOperationalValue(valueLike) {
  const value = normalizeText(valueLike);
  return !!value
    && value !== 'nao informado'
    && value !== 'nao evidenciado'
    && value !== 'dados insuficientes'
    && value !== 'requer revisao'
    && value !== 'nao identificada'
    && value !== 'nao_identificada'
    && value !== 'nao_identificado';
}

function buildOperationalAudit(contexts, recurrenceClusters, paliativeCases, riskCases) {
  const total = contexts.length;
  const clusterKeys = new Set((Array.isArray(recurrenceClusters) ? recurrenceClusters : []).map((row) => row.key).filter(Boolean));
  const validationIssues = [];
  const recurrenceCounters = {
    confirmado: 0,
    forte: 0,
    fraco: 0,
    pendencia_operacional: 0,
    sem_recorrencia: 0
  };
  const counters = {
    totalOsContexto: total,
    jornadaCompleta: 0,
    aberturaIdentificada: 0,
    diagnosticoIdentificado: 0,
    execucaoIdentificada: 0,
    conclusaoIdentificada: 0,
    recorrenciaOuRetorno: 0,
    riscoAltoCritico: Array.isArray(riskCases) ? riskCases.length : 0,
    solucaoPaliativa: Array.isArray(paliativeCases) ? paliativeCases.length : 0,
    responsabilidadeProvavelIdentificada: 0
  };

  contexts.forEach((ctx) => {
    const aberturaOk = hasOperationalValue(ctx?.jornada?.abertura?.motivo);
    const diagnosticoOk = hasOperationalValue(ctx?.jornada?.diagnostico?.problemaEncontrado)
      || hasOperationalValue(ctx?.jornada?.diagnostico?.causaRaizProvavel);
    const execucaoOk = hasOperationalValue(ctx?.jornada?.execucao?.acaoExecutada);
    const conclusaoOk = hasOperationalValue(ctx?.jornada?.conclusao?.outcomeType);
    const responsabilidadeOk = hasOperationalValue(ctx?.jornada?.diagnostico?.responsabilidadeProvavel);
    const evidenceOk = Array.isArray(ctx?.evidence)
      && ctx.evidence.some((item) => hasOperationalValue(item?.text));
    const recurrenceKey = toText(ctx?.jornada?.retornoRecorrencia?.recurrenceKey);
    const recurrenceLevel = toText(ctx?.recurrenceLevel || ctx?.jornada?.retornoRecorrencia?.recurrenceLevel || 'sem_recorrencia');
    const hasReturnSignal = ['confirmado', 'forte'].includes(recurrenceLevel);
    if (Object.prototype.hasOwnProperty.call(recurrenceCounters, recurrenceLevel)) {
      recurrenceCounters[recurrenceLevel] += 1;
    } else {
      recurrenceCounters.sem_recorrencia += 1;
    }

    if (aberturaOk) counters.aberturaIdentificada += 1;
    if (diagnosticoOk) counters.diagnosticoIdentificado += 1;
    if (execucaoOk) counters.execucaoIdentificada += 1;
    if (conclusaoOk) counters.conclusaoIdentificada += 1;
    if (hasReturnSignal) counters.recorrenciaOuRetorno += 1;
    if (responsabilidadeOk) counters.responsabilidadeProvavelIdentificada += 1;
    if (aberturaOk && diagnosticoOk && execucaoOk && conclusaoOk && responsabilidadeOk) counters.jornadaCompleta += 1;

    if (['high', 'critical'].includes(String(ctx?.riscoOperacional || '').toLowerCase()) && !evidenceOk) {
      validationIssues.push({
        code: 'high_risk_without_evidence',
        os: ctx.os,
        severity: 'high',
        message: 'OS com risco alto/critico sem evidencia operacional util.'
      });
    }
    if (ctx?.efetividadeSolucao === 'paliativa' && !evidenceOk) {
      validationIssues.push({
        code: 'paliative_without_justification',
        os: ctx.os,
        severity: 'medium',
        message: 'Solucao paliativa sem justificativa/evidencia.'
      });
    }
    const recurrenceFields = Array.isArray(ctx?.recurrenceEvidence?.camposUsados)
      ? ctx.recurrenceEvidence.camposUsados
      : [];
    const strongHasOperationalLink = recurrenceLevel === 'forte'
      && (clusterKeys.has(recurrenceKey) || recurrenceFields.includes('os_anterior'));
    if (recurrenceLevel === 'confirmado' && (!recurrenceKey || !clusterKeys.has(recurrenceKey))) {
      validationIssues.push({
        code: 'recurrence_without_valid_cluster',
        os: ctx.os,
        severity: 'medium',
        message: 'Sinal de recorrencia sem cluster consolidado valido.'
      });
    }
    if (recurrenceLevel === 'forte' && !strongHasOperationalLink) {
      validationIssues.push({
        code: 'strong_recurrence_without_operational_link',
        os: ctx.os,
        severity: 'medium',
        message: 'Possivel recorrencia forte sem cluster ou OS anterior vinculada.'
      });
    }
    if (!responsabilidadeOk) {
      validationIssues.push({
        code: 'missing_probable_responsibility',
        os: ctx.os,
        severity: 'medium',
        message: 'Responsabilidade provavel vazia ou nao identificada.'
      });
    }
    if (!aberturaOk && !(diagnosticoOk && execucaoOk && conclusaoOk)) {
      validationIssues.push({
        code: 'incomplete_journey_without_reason',
        os: ctx.os,
        severity: 'low',
        message: 'Jornada incompleta sem motivo de abertura identificado.'
      });
    }
  });

  const pctOfTotal = (value) => pct(value, Math.max(1, total));
  return {
    ...counters,
    recurrenceLevels: recurrenceCounters,
    percentuais: {
      jornadaCompletaPct: pctOfTotal(counters.jornadaCompleta),
      aberturaIdentificadaPct: pctOfTotal(counters.aberturaIdentificada),
      diagnosticoIdentificadoPct: pctOfTotal(counters.diagnosticoIdentificado),
      execucaoIdentificadaPct: pctOfTotal(counters.execucaoIdentificada),
      conclusaoIdentificadaPct: pctOfTotal(counters.conclusaoIdentificada),
      responsabilidadeIdentificadaPct: pctOfTotal(counters.responsabilidadeProvavelIdentificada)
    },
    validationIssues: validationIssues.slice(0, 100),
    validationSummary: validationIssues.reduce((acc, item) => {
      acc[item.code] = toNumber(acc[item.code]) + 1;
      return acc;
    }, {})
  };
}

function syncContextRecurrence(ctx, level, evidence, temporal) {
  if (!ctx || typeof ctx !== 'object') return;
  const safeLevel = toText(level || 'sem_recorrencia');
  const safeEvidence = (evidence && typeof evidence === 'object') ? evidence : {};
  const safeTemporal = (temporal && typeof temporal === 'object') ? temporal : {};
  ctx.recurrenceLevel = safeLevel;
  ctx.recurrenceWindow = toText(safeTemporal.recurrenceWindow || safeTemporal.window || ctx.recurrenceWindow || 'sem_data');
  ctx.recurrenceSeverity = toText(safeTemporal.recurrenceSeverity || safeTemporal.severity || ctx.recurrenceSeverity || 'nao_aplicavel');
  ctx.recurrenceReason = toText(safeTemporal.recurrenceReason || safeTemporal.reason || safeEvidence.motivo || '');
  ctx.recurrenceEvidence = {
    sinaisEncontrados: Array.isArray(safeEvidence.sinaisEncontrados) ? safeEvidence.sinaisEncontrados.filter(Boolean) : [],
    camposUsados: Array.isArray(safeEvidence.camposUsados) ? safeEvidence.camposUsados.filter(Boolean) : [],
    clusterId: toText(safeEvidence.clusterId || ''),
    motivo: toText(safeEvidence.motivo || '')
  };
  ctx.chanceRecorrencia = safeLevel === 'confirmado' || safeLevel === 'forte'
    ? 'alta'
    : (safeLevel === 'fraco' || safeLevel === 'pendencia_operacional' ? 'media' : 'baixa');
  if (ctx.jornada?.retornoRecorrencia) {
    ctx.jornada.retornoRecorrencia.recurrenceLevel = ctx.recurrenceLevel;
    ctx.jornada.retornoRecorrencia.recurrenceWindow = ctx.recurrenceWindow;
    ctx.jornada.retornoRecorrencia.recurrenceSeverity = ctx.recurrenceSeverity;
    ctx.jornada.retornoRecorrencia.recurrenceReason = ctx.recurrenceReason;
    ctx.jornada.retornoRecorrencia.recurrenceEvidence = ctx.recurrenceEvidence;
    ctx.jornada.retornoRecorrencia.houveRetorno = safeLevel === 'confirmado';
    ctx.jornada.retornoRecorrencia.possivelRecorrencia = safeLevel === 'forte';
  }
}

function classifyRecurrenceWithCluster(ctx, cluster) {
  const current = toText(ctx?.recurrenceLevel || ctx?.jornada?.retornoRecorrencia?.recurrenceLevel || 'sem_recorrencia');
  const currentEvidence = ctx?.recurrenceEvidence || ctx?.jornada?.retornoRecorrencia?.recurrenceEvidence || {};
  const signals = new Set(Array.isArray(currentEvidence.sinaisEncontrados) ? currentEvidence.sinaisEncontrados : []);
  const fields = new Set(Array.isArray(currentEvidence.camposUsados) ? currentEvidence.camposUsados : []);
  const hasCluster = !!cluster && toNumber(cluster.count) >= 2;

  if (hasCluster) {
    signals.add('cluster_cliente_equipamento_causa');
    fields.add('cliente');
    fields.add('equipamento');
    fields.add('causa');
  }
  if (toNumber(cluster?.count) >= 2) signals.add('ocorrencia_repetida_periodo');

  const signalCount = [
    hasCluster,
    fields.has('cliente'),
    fields.has('equipamento'),
    fields.has('defeito_causa') || fields.has('causa'),
    fields.has('os_anterior'),
    signals.has('retorno') || signals.has('reabertura') || signals.has('reincidencia') || signals.has('novamente') || signals.has('persistente'),
    fields.has('peca_acao') || signals.has('mesma_peca_acao_possivel')
  ].filter(Boolean).length;

  if (current === 'pendencia_operacional') {
    return {
      level: 'pendencia_operacional',
      temporal: {
        recurrenceWindow: 'sem_data',
        recurrenceSeverity: 'nao_aplicavel',
        recurrenceReason: hasCluster
          ? 'Pendencia operacional com volume relacionado; separada de recorrencia real.'
          : 'Pendencia operacional sem cluster temporal confirmado.'
      },
      evidence: {
        sinaisEncontrados: Array.from(signals),
        camposUsados: Array.from(fields),
        clusterId: hasCluster ? toText(cluster.key) : '',
        motivo: 'Caso separado como pendencia operacional; nao entra como recorrencia real.'
      }
    };
  }
  if (hasCluster && cluster.recurrenceSeverity === 'volume_concentrado') {
    return {
      level: 'sem_recorrencia',
      temporal: {
        recurrenceWindow: cluster.recurrenceWindow,
        recurrenceSeverity: 'volume_concentrado',
        recurrenceReason: cluster.recurrenceReason
      },
      evidence: {
        sinaisEncontrados: Array.from(signals),
        camposUsados: Array.from(fields),
        clusterId: toText(cluster.key),
        motivo: 'Volume concentrado separado de retorno real por janela temporal acima de 30 dias.'
      }
    };
  }
  if (hasCluster && signalCount >= 2 && current !== 'pendencia_operacional') {
    return {
      level: 'confirmado',
      temporal: {
        recurrenceWindow: cluster.recurrenceWindow,
        recurrenceSeverity: cluster.recurrenceSeverity,
        recurrenceReason: cluster.recurrenceReason
      },
      evidence: {
        sinaisEncontrados: Array.from(signals),
        camposUsados: Array.from(fields),
        clusterId: toText(cluster.key),
        motivo: 'Retorno real confirmado por cluster operacional e ao menos dois sinais consistentes.'
      }
    };
  }
  if ((fields.has('os_anterior') || hasCluster) && current !== 'pendencia_operacional') {
    return {
      level: 'forte',
      temporal: {
        recurrenceWindow: hasCluster ? cluster.recurrenceWindow : 'sem_data',
        recurrenceSeverity: hasCluster ? cluster.recurrenceSeverity : 'relevante',
        recurrenceReason: hasCluster ? cluster.recurrenceReason : 'OS anterior vinculada sem cluster temporal completo.'
      },
      evidence: {
        sinaisEncontrados: Array.from(signals),
        camposUsados: Array.from(fields),
        clusterId: hasCluster ? toText(cluster.key) : '',
        motivo: 'Possivel recorrencia forte por vinculo operacional, mas sem todos os sinais para confirmacao.'
      }
    };
  }
  if (current === 'fraco') {
    return {
      level: 'fraco',
      temporal: {
        recurrenceWindow: 'sem_data',
        recurrenceSeverity: 'nao_aplicavel',
        recurrenceReason: 'Sinal textual fraco sem janela temporal confirmada.'
      },
      evidence: {
        sinaisEncontrados: Array.from(signals),
        camposUsados: Array.from(fields),
        clusterId: '',
        motivo: 'Sinal textual fraco sem cluster consistente.'
      }
    };
  }
  return {
    level: 'sem_recorrencia',
    temporal: {
      recurrenceWindow: hasCluster ? cluster.recurrenceWindow : 'sem_data',
      recurrenceSeverity: hasCluster ? cluster.recurrenceSeverity : 'nao_aplicavel',
      recurrenceReason: hasCluster ? cluster.recurrenceReason : 'Sem evidencia operacional suficiente de recorrencia.'
    },
    evidence: {
      sinaisEncontrados: Array.from(signals),
      camposUsados: Array.from(fields),
      clusterId: '',
      motivo: 'Sem evidencia operacional suficiente de recorrencia.'
    }
  };
}

function buildOperationalExamples(contextsLike, limit) {
  return (Array.isArray(contextsLike) ? contextsLike : [])
    .slice(0, Math.max(1, limit || 10))
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      motivoAbertura: ctx.jornada?.abertura?.motivo || 'nao informado',
      problemaEncontrado: ctx.jornada?.diagnostico?.problemaEncontrado || 'nao evidenciado',
      acaoExecutada: ctx.jornada?.execucao?.acaoExecutada || 'nao evidenciado',
      solucao: ctx.jornada?.conclusao?.outcomeType || 'requer revisao',
      responsabilidadeProvavel: ctx.jornada?.diagnostico?.responsabilidadeProvavel || 'requer revisao',
      risco: ctx.riscoOperacional,
      chanceRecorrencia: ctx.chanceRecorrencia,
      recurrenceLevel: ctx.recurrenceLevel || ctx.jornada?.retornoRecorrencia?.recurrenceLevel || 'sem_recorrencia',
      recurrenceWindow: ctx.recurrenceWindow || ctx.jornada?.retornoRecorrencia?.recurrenceWindow || 'sem_data',
      recurrenceSeverity: ctx.recurrenceSeverity || ctx.jornada?.retornoRecorrencia?.recurrenceSeverity || 'nao_aplicavel',
      recurrenceReason: ctx.recurrenceReason || ctx.jornada?.retornoRecorrencia?.recurrenceReason || '',
      recurrenceEvidence: ctx.recurrenceEvidence || ctx.jornada?.retornoRecorrencia?.recurrenceEvidence || {},
      evidenciaUsada: ctx.evidence?.[0]?.text || 'dados insuficientes',
      origemEvidencia: ctx.evidence?.[0]?.source || 'contexto'
    }));
}

function buildOperationalExecutiveView(operationalContextLike) {
  const oc = (operationalContextLike && typeof operationalContextLike === 'object') ? operationalContextLike : {};
  const audit = (oc.audit && typeof oc.audit === 'object') ? oc.audit : {};
  const summary = (oc.summary && typeof oc.summary === 'object') ? oc.summary : {};
  const rankings = (oc.rankings && typeof oc.rankings === 'object') ? oc.rankings : {};
  const alerts = Array.isArray(oc.managementAlerts) ? oc.managementAlerts : [];
  return {
    version: 'OPERATIONAL_EXECUTIVE_VIEW_V1',
    resumoExecutivo: `Contexto operacional processou ${toNumber(oc.totalOs)} O.S.; jornada completa em ${formatPctLabel(audit.percentuais?.jornadaCompletaPct || 0, 'pt-BR')}; recorrencia confirmada em ${toNumber(oc.recurrence?.levels?.confirmado)} caso(s); risco alto/critico em ${toNumber(audit.riscoAltoCritico)} caso(s).`,
    alertasCriticos: alerts.filter((item) => String(item.severity || '').toLowerCase() === 'high').slice(0, 8),
    rankingRecorrencia: oc.recurrence?.clusters || [],
    clustersConfirmados: oc.recurrence?.clustersConfirmados || [],
    possiveisRecorrenciasFortes: oc.recurrence?.possiveisRecorrenciasFortes || [],
    sinaisFracos: oc.recurrence?.sinaisFracos || [],
    pendenciasOperacionais: oc.recurrence?.pendenciasOperacionais || [],
    volumesConcentrados: oc.recurrence?.volumesConcentrados || [],
    rankingRisco: oc.operationalRiskCases || [],
    rankingSolucoesPaliativas: oc.paliativeSolutions || [],
    rankingResponsabilidadeProvavel: rankings.topResponsibilities || [],
    topClientesRecorrentes: rankings.topReturnClients || [],
    topEquipamentosRecorrentes: rankings.topReturnEquipment || []
  };
}

function buildOperationalContextAnalytics(contextsLike) {
  const contexts = Array.isArray(contextsLike) ? contextsLike : [];
  const total = contexts.length;
  const recurrenceMap = new Map();
  const clientMap = new Map();
  const equipmentReturnMap = new Map();
  const pieceMap = new Map();
  const causeMap = new Map();
  const solutionEffectivenessMap = new Map();
  const responsibilityMap = new Map();
  const technicianMap = new Map();
  const alerts = [];

  contexts.forEach((ctx) => {
    incrementMapCounter(causeMap, ctx?.jornada?.diagnostico?.causaRaizProvavel);
    incrementMapCounter(solutionEffectivenessMap, ctx?.efetividadeSolucao);
    incrementMapCounter(responsibilityMap, ctx?.jornada?.diagnostico?.responsabilidadeProvavel);
    if (ctx?.jornada?.execucao?.houveTroca) incrementMapCounter(pieceMap, ctx.jornada.execucao.pecaUtilizada || 'peca_inferida');
    const key = ctx?.jornada?.retornoRecorrencia?.recurrenceKey;
    if (key) {
      if (!recurrenceMap.has(key)) {
        recurrenceMap.set(key, {
          key,
          cliente: ctx.cliente || '',
          equipamento: ctx.equipamento || '',
          causa: ctx.jornada?.diagnostico?.causaRaizProvavel || '',
          count: 0,
          os: [],
          dates: []
        });
      }
      const row = recurrenceMap.get(key);
      row.count += 1;
      if (ctx.os && row.os.length < 8 && !row.os.includes(ctx.os)) row.os.push(ctx.os);
      const occurrenceDate = normalizeOperationalDate(ctx.occurrenceDate);
      if (occurrenceDate) row.dates.push(occurrenceDate);
    }
  });

  const recurrenceClusterCandidates = Array.from(recurrenceMap.values())
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || String(a.equipamento).localeCompare(String(b.equipamento)))
    .map((row) => {
      const sortedDates = Array.from(new Set(Array.isArray(row.dates) ? row.dates : []))
        .filter(Boolean)
        .sort();
      const firstOsDate = sortedDates[0] || '';
      const lastOsDate = sortedDates[sortedDates.length - 1] || '';
      const daysBetween = daysBetweenDates(firstOsDate, lastOsDate);
      const temporal = classifyRecurrenceWindow(daysBetween, !!(firstOsDate && lastOsDate));
      return {
        ...row,
        clusterId: row.key,
        firstOsDate,
        lastOsDate,
        daysBetween,
        recurrenceWindow: temporal.window,
        recurrenceSeverity: temporal.severity,
        recurrenceReason: temporal.reason
      };
    });
  const recurrenceClusterByKey = new Map(recurrenceClusterCandidates.map((row) => [row.key, row]));
  contexts.forEach((ctx) => {
    const cluster = recurrenceClusterByKey.get(ctx?.jornada?.retornoRecorrencia?.recurrenceKey);
    const calibrated = classifyRecurrenceWithCluster(ctx, cluster);
    syncContextRecurrence(ctx, calibrated.level, calibrated.evidence, calibrated.temporal);
    if (['confirmado', 'forte'].includes(ctx.recurrenceLevel)) {
      incrementMapCounter(clientMap, ctx.cliente || 'cliente_nao_identificado');
      incrementMapCounter(equipmentReturnMap, ctx.equipamento || 'equipamento_nao_identificado');
      incrementMapCounter(technicianMap, ctx.tecnico || 'tecnico_nao_identificado');
    }
  });

  const contextsByRecurrenceKey = new Map();
  contexts.forEach((ctx) => {
    const key = ctx?.jornada?.retornoRecorrencia?.recurrenceKey;
    if (!key) return;
    if (!contextsByRecurrenceKey.has(key)) contextsByRecurrenceKey.set(key, []);
    contextsByRecurrenceKey.get(key).push(ctx);
  });

  const clusterRows = recurrenceClusterCandidates.map((row) => {
    const members = contextsByRecurrenceKey.get(row.key) || [];
    const levels = new Set(members.map((ctx) => ctx.recurrenceLevel));
    const level = row.recurrenceSeverity === 'volume_concentrado'
      ? 'sem_recorrencia'
      : (levels.has('confirmado') ? 'confirmado' : (levels.has('forte') ? 'forte' : 'fraco'));
    return {
      ...row,
      recurrenceLevel: level,
      possibleRecurrence: level !== 'sem_recorrencia',
      signal: row.recurrenceSeverity === 'volume_concentrado'
        ? 'volume_concentrado'
        : (level === 'confirmado' ? 'retorno_real_confirmado' : (level === 'forte' ? 'possivel_recorrencia_forte' : 'sinal_fraco'))
    };
  });

  const allClustersConfirmados = clusterRows
    .filter((row) => row.recurrenceLevel === 'confirmado')
    .sort((a, b) => b.count - a.count || String(a.equipamento).localeCompare(String(b.equipamento)));
  const clustersConfirmados = allClustersConfirmados
    .slice(0, 15);
  const possiveisRecorrenciasFortes = contexts
    .filter((ctx) => ctx.recurrenceLevel === 'forte')
    .slice(0, 30)
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      causa: ctx.jornada?.diagnostico?.causaRaizProvavel || '',
      recurrenceLevel: ctx.recurrenceLevel,
      recurrenceEvidence: ctx.recurrenceEvidence
    }));
  const sinaisFracos = contexts
    .filter((ctx) => ctx.recurrenceLevel === 'fraco')
    .slice(0, 30)
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      causa: ctx.jornada?.diagnostico?.causaRaizProvavel || '',
      recurrenceLevel: ctx.recurrenceLevel,
      recurrenceEvidence: ctx.recurrenceEvidence
    }));
  const pendenciasOperacionais = contexts
    .filter((ctx) => ctx.recurrenceLevel === 'pendencia_operacional')
    .slice(0, 30)
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      causa: ctx.jornada?.diagnostico?.causaRaizProvavel || '',
      recurrenceLevel: ctx.recurrenceLevel,
      recurrenceEvidence: ctx.recurrenceEvidence
    }));
  const volumesConcentrados = clusterRows
    .filter((row) => row.recurrenceSeverity === 'volume_concentrado')
    .sort((a, b) => b.count - a.count || String(a.equipamento).localeCompare(String(b.equipamento)))
    .slice(0, 15);
  const recurrenceClusters = clustersConfirmados;
  const recurrenceLevelSeverityMatrix = contexts.reduce((acc, ctx) => {
    const level = toText(ctx.recurrenceLevel || 'sem_recorrencia');
    const severity = toText(ctx.recurrenceSeverity || 'nao_aplicavel');
    if (!acc[level]) acc[level] = {};
    acc[level][severity] = toNumber(acc[level][severity]) + 1;
    return acc;
  }, {});

  const paliativeCases = contexts
    .filter((ctx) => ctx.efetividadeSolucao === 'paliativa')
    .slice(0, 20)
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      causa: ctx.jornada?.diagnostico?.causaRaizProvavel || '',
      solucao: ctx.jornada?.conclusao?.outcomeType || '',
      riscoOperacional: ctx.riscoOperacional,
      evidence: ctx.evidence?.[0]?.text || ''
    }));

  const riskCases = contexts
    .filter((ctx) => ['critical', 'high'].includes(String(ctx.riscoOperacional || '').toLowerCase()))
    .sort((a, b) => String(a.riscoOperacional).localeCompare(String(b.riscoOperacional)))
    .slice(0, 25)
    .map((ctx) => ({
      os: ctx.os,
      cliente: ctx.cliente,
      equipamento: ctx.equipamento,
      tecnico: ctx.tecnico,
      riscoOperacional: ctx.riscoOperacional,
      chanceRecorrencia: ctx.chanceRecorrencia,
      efetividadeSolucao: ctx.efetividadeSolucao,
      garantia: ctx.garantia,
      cobranca: ctx.cobranca
    }));

  if (recurrenceClusters.length) {
    alerts.push({
      type: 'recorrencia',
      severity: recurrenceClusters[0].count >= 3 ? 'high' : 'medium',
      title: 'Possível recorrência operacional',
      evidence: `${recurrenceClusters[0].count} O.S. no mesmo cliente/equipamento/defeito`,
      recommendedAction: 'Validar causa raiz, confirmar se a solução foi definitiva e abrir plano de redução de retorno.'
    });
  }
  const topPiece = mapToRanking(pieceMap, total, 'totalTrocas')[0] || null;
  if (topPiece && topPiece.count >= 3) {
    alerts.push({
      type: 'peca',
      severity: topPiece.count >= 8 ? 'high' : 'medium',
      title: 'Uso recorrente de peça/componente',
      evidence: `${topPiece.key}: ${topPiece.count} ocorrência(s)`,
      recommendedAction: 'Conferir estoque, lote, instalação e reincidência após troca.'
    });
  }
  const highRiskCount = riskCases.length;
  if (highRiskCount) {
    alerts.push({
      type: 'risco_operacional',
      severity: highRiskCount >= 10 ? 'high' : 'medium',
      title: 'Casos com risco operacional elevado',
      evidence: `${highRiskCount} O.S. com risco alto/crítico no contexto operacional`,
      recommendedAction: 'Priorizar revisão gerencial dos casos críticos antes do fechamento.'
    });
  }

  const operationalContext = {
    version: 'OPERATIONAL_CONTEXT_V1',
    totalOs: total,
    journeyModel: ['abertura', 'diagnostico', 'execucao', 'conclusao', 'retorno_recorrencia'],
    summary: {
      definitiveRatePct: pct(contexts.filter((ctx) => ctx.efetividadeSolucao === 'definitiva').length, total),
      paliativeRatePct: pct(contexts.filter((ctx) => ctx.efetividadeSolucao === 'paliativa').length, total),
      highRecurrenceChancePct: pct(contexts.filter((ctx) => ctx.chanceRecorrencia === 'alta').length, total),
      warrantyRatePct: pct(contexts.filter((ctx) => String(ctx.garantia || '').includes('garantia')).length, total),
      billingApplicableRatePct: pct(contexts.filter((ctx) => ctx.cobranca === 'cobranca_aplicavel').length, total),
      improductiveRatePct: pct(contexts.filter((ctx) => ctx.visitaImprodutiva).length, total),
      escalatedRatePct: pct(contexts.filter((ctx) => ctx.escalonamento).length, total)
    },
    rankings: {
      topCauses: mapToRanking(causeMap, total, 'totalOs'),
      topResponsibilities: mapToRanking(responsibilityMap, total, 'totalOs'),
      topSolutionEffectiveness: mapToRanking(solutionEffectivenessMap, total, 'totalOs'),
      topReturnEquipment: mapToRanking(equipmentReturnMap, total, 'returnCount'),
      topReturnClients: mapToRanking(clientMap, total, 'returnCount'),
      topTechnicianReturns: mapToRanking(technicianMap, total, 'returnCount'),
      topPieces: mapToRanking(pieceMap, total, 'totalTrocas')
    },
    recurrence: {
      clusters: recurrenceClusters,
      clustersConfirmados,
      possiveisRecorrenciasFortes,
      sinaisFracos,
      pendenciasOperacionais,
      volumesConcentrados,
      possibleRecurrenceCount: allClustersConfirmados.reduce((acc, row) => acc + row.count, 0),
      totalConfirmedClusters: allClustersConfirmados.length,
      levels: {
        confirmado: contexts.filter((ctx) => ctx.recurrenceLevel === 'confirmado').length,
        forte: contexts.filter((ctx) => ctx.recurrenceLevel === 'forte').length,
        fraco: contexts.filter((ctx) => ctx.recurrenceLevel === 'fraco').length,
        pendencia_operacional: contexts.filter((ctx) => ctx.recurrenceLevel === 'pendencia_operacional').length,
        sem_recorrencia: contexts.filter((ctx) => ctx.recurrenceLevel === 'sem_recorrencia').length
      },
      severityLevels: {
        critica: contexts.filter((ctx) => ctx.recurrenceSeverity === 'critica').length,
        relevante: contexts.filter((ctx) => ctx.recurrenceSeverity === 'relevante').length,
        historica: contexts.filter((ctx) => ctx.recurrenceSeverity === 'historica').length,
        volume_concentrado: contexts.filter((ctx) => ctx.recurrenceSeverity === 'volume_concentrado').length,
        nao_aplicavel: contexts.filter((ctx) => ctx.recurrenceSeverity === 'nao_aplicavel').length
      },
      windows: {
        ate_7_dias: contexts.filter((ctx) => ctx.recurrenceWindow === 'ate_7_dias').length,
        ate_15_dias: contexts.filter((ctx) => ctx.recurrenceWindow === 'ate_15_dias').length,
        ate_30_dias: contexts.filter((ctx) => ctx.recurrenceWindow === 'ate_30_dias').length,
        acima_30_dias: contexts.filter((ctx) => ctx.recurrenceWindow === 'acima_30_dias').length,
        sem_data: contexts.filter((ctx) => ctx.recurrenceWindow === 'sem_data').length
      },
      levelSeverityMatrix: recurrenceLevelSeverityMatrix
    },
    paliativeSolutions: paliativeCases,
    operationalRiskCases: riskCases,
    managementAlerts: alerts.slice(0, 12),
    audit: buildOperationalAudit(contexts, allClustersConfirmados, paliativeCases, riskCases),
    examples: buildOperationalExamples(contexts, 10),
    sampleContexts: contexts.slice(0, 40)
  };
  operationalContext.operationalExecutiveView = buildOperationalExecutiveView(operationalContext);
  return operationalContext;
}

function buildAnalyticsTaxonomy(itemsLike, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale);
  let dadosBase = Array.isArray(itemsLike) ? itemsLike : [];
  // FORÇANDO ESTADO GLOBAL DE PDF
  if (typeof window !== 'undefined' && window.__FSM_PDF_RECORDS__ && window.__FSM_PDF_RECORDS__.length > 0) {
    dadosBase = window.__FSM_PDF_RECORDS__;
  }
  const items = dadosBase.map((itemLike) => {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    return {
      ...item,
      os: item.os || item.os_numero || item.numero_os || item.id,
      produto: item.produto || item.equipamento || item.descricao_produto || item.descricaoProduto,
      laudo: item.laudo || item.solucao || item.observacao || item.acaoFeita || item.acao_feita,
      apontamento: item.apontamento || item.descricao_atendimento || item.descricao || item.observacao,
      tecnico: item.tecnico || item.technicianName || item.responsavelTecnico,
      cliente: item.cliente || item.clientName || item.razao_social
    };
  });
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
  const operationalContexts = [];
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
    if (classification.operationalContext) operationalContexts.push(classification.operationalContext);
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

  const operationalContext = buildOperationalContextAnalytics(operationalContexts);

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
    operationalContext: operationalContext.summary,
    sampleClassifications: classifiedPreview.slice(0, 40)
  };

  const taxonomyByEquipment = Array.from(byEquipment.values())
    .map(normalizeGroupBucket)
    .sort((a, b) => toNumber(b.totalOs) - toNumber(a.totalOs));
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
    operationalContext,
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
    operationalContext,
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
