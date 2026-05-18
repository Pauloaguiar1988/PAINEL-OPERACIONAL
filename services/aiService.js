const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const classificacaoRules = require('../ia/rules/classificacao');
const cobrancaRules = require('../ia/rules/cobranca');
const escalonamentoRules = require('../ia/rules/escalonamento');
const confidenceRules = require('../ia/rules/confidence');
const laudoRules = require('../ia/rules/laudo');

const PROMPTS_DIR = path.join(__dirname, '..', 'ia', 'prompts');
const AI_CONTRACT_VERSION = 'IA_CONTRACT_V1';
const MAX_PROMPT_BYTES = 64 * 1024;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const OPENAI_PROVIDER_TIMEOUT_MS = Math.max(1000, Number(process.env.OPENAI_TIMEOUT_MS || 20000));

const AI_RESULT_DEFAULT = {
  resumo: '',
  risco: '',
  classificacao: '',
  tipoLaudoSugerido: '',
  tipoAtendimento: '',
  decisaoOperacional: '',
  decisaoCobranca: '',
  recomendacoes: [],
  evidenciasNecessarias: [],
  proximaAcao: '',
  necessitaEscalonamento: false,
  nivelEscalonamento: 'nenhum',
  estruturaLaudoSugerida: {
    objetivo: '',
    diagnostico: '',
    acoes: [],
    resultado: '',
    pendencias: [],
    conclusao: ''
  }
};

function nowIso() {
  return new Date().toISOString();
}

function envFlag(name) {
  return ['1', 'true', 'yes', 'sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function isOpenAiEnabled() {
  return false;
}

function getMode() {
  return isOpenAiEnabled() ? 'openai' : 'mock';
}

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function pickFirst(source, keys) {
  const payload = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    const value = asText(payload[key]);
    if (value) return value;
  }
  return '';
}

function normalizePromptName(promptName) {
  const normalized = String(promptName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) throw new Error('AI_PROMPT_INVALID');
  return normalized;
}

function loadPrompt(promptName) {
  const normalized = normalizePromptName(promptName);
  const promptPath = path.join(PROMPTS_DIR, `${normalized}.txt`);
  const resolvedPath = path.resolve(promptPath);
  const resolvedPromptsDir = path.resolve(PROMPTS_DIR);
  if (!resolvedPath.startsWith(resolvedPromptsDir + path.sep)) {
    throw new Error('AI_PROMPT_INVALID');
  }
  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile() || stats.size > MAX_PROMPT_BYTES) {
    throw new Error('AI_PROMPT_INVALID');
  }
  return fs.readFileSync(resolvedPath, 'utf-8').replace(/^\uFEFF/, '').trim();
}

function buildPromptInput(dataLike) {
  const data = dataLike && typeof dataLike === 'object' ? dataLike : {};
  return JSON.stringify(data, null, 2);
}

function montarPrompt(promptName, dadosContexto) {
  const promptBase = loadPrompt(promptName);
  return [
    promptBase,
    '',
    'DADOS OPERACIONAIS:',
    buildPromptInput(dadosContexto),
    '',
    'INSTRUCAO:',
    'Use apenas os dados operacionais fornecidos. Se faltar informacao, indique a pendencia de forma objetiva.'
  ].join('\n');
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(item => asText(item)).filter(Boolean).slice(0, 8);
  }
  const text = asText(value);
  return text ? [text] : [];
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = asText(value).toLowerCase();
  return ['1', 'true', 'sim', 'yes', 's'].includes(normalized);
}

function normalizeEscalationLevel(value) {
  const normalized = asText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'nivel_1' || normalized === 'nivel_2' || normalized === 'nenhum') return normalized;
  if (normalized === '1') return 'nivel_1';
  if (normalized === '2') return 'nivel_2';
  return 'nenhum';
}

function normalizeLaudoStructure(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    objetivo: asText(source.objetivo),
    diagnostico: asText(source.diagnostico),
    acoes: normalizeStringList(source.acoes),
    resultado: asText(source.resultado),
    pendencias: normalizeStringList(source.pendencias),
    conclusao: asText(source.conclusao)
  };
}

function normalizeV1Laudo(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    objetivo: asText(source.objetivo),
    cenarioEncontradoDiagnostico: asText(source.cenarioEncontradoDiagnostico || source.diagnostico),
    acoesRealizadas: normalizeStringList(source.acoesRealizadas || source.acoes),
    resultadoStatusFinal: asText(source.resultadoStatusFinal || source.resultado),
    pendenciasResponsaveis: normalizeStringList(source.pendenciasResponsaveis || source.pendencias),
    conclusaoTecnica: asText(source.conclusaoTecnica || source.conclusao),
    acompanhamento: asText(source.acompanhamento)
  };
}

function normalizeAiAnalysisContract(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const classificacao = source.classificacao && typeof source.classificacao === 'object' ? source.classificacao : {};
  const decisao = source.decisao && typeof source.decisao === 'object' ? source.decisao : {};
  const escalonamento = source.escalonamento && typeof source.escalonamento === 'object' ? source.escalonamento : {};
  const confidence = source.confidence && typeof source.confidence === 'object' ? source.confidence : {};
  const review = source.review && typeof source.review === 'object' ? source.review : {};
  return {
    version: AI_CONTRACT_VERSION,
    processedAt: asText(source.processedAt) || nowIso(),
    source: asText(source.source) || 'mock',
    status: ['processed', 'pending_review', 'failed'].includes(asText(source.status)) ? asText(source.status) : 'processed',
    legacyCompatible: true,
    sourceDataHash: asText(source.sourceDataHash),
    classificacao: {
      tipoAtendimento: asText(classificacao.tipoAtendimento),
      tipoLaudo: asText(classificacao.tipoLaudo),
      serviceType: asText(classificacao.serviceType),
      warrantyType: asText(classificacao.warrantyType),
      probableCause: asText(classificacao.probableCause),
      outcomeType: asText(classificacao.outcomeType)
    },
    decisao: {
      operacional: asText(decisao.operacional),
      cobranca: asText(decisao.cobranca),
      justificativa: asText(decisao.justificativa)
    },
    escalonamento: {
      necessario: normalizeBoolean(escalonamento.necessario),
      nivel: asText(escalonamento.nivel) || 'nenhum',
      destino: asText(escalonamento.destino),
      justificativa: asText(escalonamento.justificativa)
    },
    evidencias: normalizeStringList(source.evidencias),
    pendencias: normalizeStringList(source.pendencias),
    laudo: normalizeV1Laudo(source.laudo),
    confidence: {
      geral: ['alta', 'media', 'baixa'].includes(asText(confidence.geral)) ? asText(confidence.geral) : 'media',
      motivo: asText(confidence.motivo)
    },
    review: {
      required: normalizeBoolean(review.required),
      priority: ['baixa', 'media', 'alta', 'critica'].includes(asText(review.priority)) ? asText(review.priority) : 'media',
      reason: asText(review.reason),
      recommendedReviewer: asText(review.recommendedReviewer) || 'tecnico_lider',
      checklist: normalizeStringList(review.checklist)
    },
    decisionTrace: normalizeStringList(source.decisionTrace)
  };
}

function buildLegacyCompatibleFields(aiAnalysis) {
  const analysis = normalizeAiAnalysisContract(aiAnalysis);
  const reviewPriorityMap = { critica: 'critical', alta: 'high', media: 'medium', baixa: 'low' };
  return {
    resumo: analysis.decisao.operacional || analysis.laudo.conclusaoTecnica || '',
    risco: analysis.review.priority,
    classificacao: analysis.classificacao.serviceType || analysis.classificacao.tipoAtendimento,
    tipoLaudoSugerido: analysis.classificacao.tipoLaudo,
    tipoAtendimento: analysis.classificacao.tipoAtendimento,
    decisaoOperacional: analysis.decisao.operacional,
    decisaoCobranca: analysis.decisao.cobranca,
    recomendacoes: [
      analysis.decisao.operacional,
      analysis.decisao.justificativa,
      analysis.review.reason
    ].filter(Boolean),
    evidenciasNecessarias: analysis.evidencias,
    proximaAcao: analysis.review.required ? 'Encaminhar para revisao humana com checklist.' : analysis.decisao.operacional,
    necessitaEscalonamento: analysis.escalonamento.necessario,
    nivelEscalonamento: analysis.escalonamento.nivel,
    estruturaLaudoSugerida: {
      objetivo: analysis.laudo.objetivo,
      diagnostico: analysis.laudo.cenarioEncontradoDiagnostico,
      acoes: analysis.laudo.acoesRealizadas,
      resultado: analysis.laudo.resultadoStatusFinal,
      pendencias: analysis.laudo.pendenciasResponsaveis,
      conclusao: analysis.laudo.conclusaoTecnica
    },
    technicalNarrativeV2: {
      summary: analysis.decisao.operacional,
      findings: analysis.decisionTrace,
      recommendations: analysis.review.checklist
    },
    classificationQuality: analysis.confidence.geral === 'alta' ? 'high' : (analysis.confidence.geral === 'baixa' ? 'low' : 'medium'),
    serviceType: analysis.classificacao.serviceType,
    warrantyType: analysis.classificacao.warrantyType,
    probableCause: analysis.classificacao.probableCause,
    outcomeType: analysis.classificacao.outcomeType,
    reviewQueue: analysis.review.required ? [{
      code: analysis.classificacao.tipoLaudo || 'ai_review',
      priority: reviewPriorityMap[analysis.review.priority] || 'medium',
      reviewReason: analysis.review.reason,
      recommendedReviewer: analysis.review.recommendedReviewer,
      checklist: analysis.review.checklist
    }] : [],
    reviewPriority: reviewPriorityMap[analysis.review.priority] || 'medium',
    reviewReason: analysis.review.reason,
    recommendedReviewer: analysis.review.recommendedReviewer,
    reviewChecklist: analysis.review.checklist,
    reviewQueueSummary: {
      total: analysis.review.required ? 1 : 0,
      requiresHumanReview: analysis.review.required,
      generatedBy: AI_CONTRACT_VERSION
    },
    alertas: analysis.review.required ? [analysis.review.reason || 'Revisao humana requerida'] : []
  };
}

function normalizeAiResult(rawLike) {
  const raw = rawLike && typeof rawLike === 'object' ? rawLike : {};
  if (raw.aiAnalysis || raw.version === AI_CONTRACT_VERSION) {
    const aiAnalysis = normalizeAiAnalysisContract(raw.aiAnalysis || raw);
    return {
      ...buildLegacyCompatibleFields(aiAnalysis),
      aiAnalysis
    };
  }
  const result = raw.result && typeof raw.result === 'object' ? raw.result : raw;
  const nivelEscalonamento = normalizeEscalationLevel(result.nivelEscalonamento || result.nivel_escalonamento);
  return {
    resumo: asText(result.resumo),
    risco: asText(result.risco),
    classificacao: asText(result.classificacao),
    tipoLaudoSugerido: asText(result.tipoLaudoSugerido || result.tipo_laudo_sugerido),
    tipoAtendimento: asText(result.tipoAtendimento || result.tipo_atendimento),
    decisaoOperacional: asText(result.decisaoOperacional || result.decisao_operacional),
    decisaoCobranca: asText(result.decisaoCobranca || result.decisao_cobranca),
    recomendacoes: normalizeStringList(result.recomendacoes),
    evidenciasNecessarias: normalizeStringList(result.evidenciasNecessarias || result.evidencias_necessarias),
    proximaAcao: asText(result.proximaAcao || result.proxima_acao),
    necessitaEscalonamento: normalizeBoolean(result.necessitaEscalonamento || result.necessita_escalonamento) || nivelEscalonamento !== 'nenhum',
    nivelEscalonamento,
    estruturaLaudoSugerida: normalizeLaudoStructure(result.estruturaLaudoSugerida || result.estrutura_laudo_sugerida)
  };
}

function buildResponse(type, result, confidence = 'media', promptName = '') {
  const normalizedResult = normalizeAiResult(result);
  return {
    success: true,
    mode: getMode(),
    type,
    confidence,
    result: normalizedResult,
    promptName: promptName || type,
    timestamp: nowIso()
  };
}

function buildRealInstructions(type) {
  return [
    'Voce e uma camada de IA operacional para assistencia tecnica.',
    'Responda exclusivamente em JSON valido, sem markdown e sem texto fora do JSON.',
    `O campo type esperado e "${type}".`,
    'Use exatamente os campos: resumo, risco, classificacao, tipoLaudoSugerido, tipoAtendimento, decisaoOperacional, decisaoCobranca, recomendacoes, evidenciasNecessarias, proximaAcao, necessitaEscalonamento, nivelEscalonamento, estruturaLaudoSugerida.',
    'recomendacoes, evidenciasNecessarias, estruturaLaudoSugerida.acoes e estruturaLaudoSugerida.pendencias devem ser arrays de strings.',
    'estruturaLaudoSugerida deve conter objetivo, diagnostico, acoes, resultado, pendencias e conclusao.',
    'Nao invente fatos; quando faltarem dados, registre a pendencia no texto.'
  ].join(' ');
}

function extractOpenAiText(payload) {
  if (asText(payload?.output_text)) return asText(payload.output_text);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = asText(part?.text);
      if (text) return text;
    }
  }
  return '';
}

function parseProviderResult(text) {
  const rawText = asText(text);
  if (!rawText) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
  try {
    return JSON.parse(rawText);
  } catch (_) {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(rawText.slice(start, end + 1));
    }
    throw new Error('AI_PROVIDER_INVALID_JSON');
  }
}

function postJsonWithTimeout(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        ...headers
      },
      timeout: timeoutMs
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        raw += chunk;
      });
      response.on('end', () => {
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (_) {
          parsed = {};
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const err = new Error('AI_PROVIDER_ERROR');
          err.code = 'AI_PROVIDER_ERROR';
          err.statusCode = response.statusCode;
          err.providerCode = asText(parsed?.error?.code || parsed?.error?.type);
          return reject(err);
        }
        resolve(parsed);
      });
    });

    request.on('timeout', () => {
      request.destroy();
      const err = new Error('AI_PROVIDER_TIMEOUT');
      err.code = 'AI_PROVIDER_TIMEOUT';
      reject(err);
    });
    request.on('error', (err) => {
      err.code = err.code || 'AI_PROVIDER_NETWORK_ERROR';
      reject(err);
    });
    request.write(requestBody);
    request.end();
  });
}

async function callOpenAi(prompt, type) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  const model = asText(process.env.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
  const response = await postJsonWithTimeout(OPENAI_RESPONSES_URL, {
    model,
    instructions: buildRealInstructions(type),
    input: prompt,
    temperature: 0.2,
    max_output_tokens: 900,
    store: false
  }, {
    Authorization: `Bearer ${apiKey}`
  }, OPENAI_PROVIDER_TIMEOUT_MS);

  const parsed = parseProviderResult(extractOpenAiText(response));
  return {
    result: normalizeAiResult(parsed),
    confidence: asText(parsed.confidence) || 'media',
    providerMeta: {
      provider: 'openai',
      model,
      responseId: asText(response.id)
    }
  };
}

async function executeAiTask({ type, promptName, dadosContexto, mockResult, confidence = 'media' }) {
  const prompt = montarPrompt(promptName, dadosContexto);
  if (!isOpenAiEnabled()) {
    return buildResponse(type, mockResult, confidence, promptName);
  }

  const providerResult = await callOpenAi(prompt, type);
  return {
    ...buildResponse(type, providerResult.result, providerResult.confidence, promptName),
    provider: providerResult.providerMeta
  };
}

function buildOsContext(dadosOS) {
  const payload = dadosOS && typeof dadosOS === 'object' ? dadosOS : {};
  const cliente = pickFirst(payload, ['cliente', 'client', 'razaoSocial']) || 'Cliente nao informado';
  const os = pickFirst(payload, ['os', 'ordemServico', 'codigoOS', 'ticket']) || 'OS nao informada';
  const equipamento = pickFirst(payload, ['equipamento', 'produto', 'asset']) || 'Equipamento nao informado';
  const problema = pickFirst(payload, ['problema', 'defeito', 'descricao', 'ocorrencia']) || 'Problema nao informado';
  const causa = pickFirst(payload, ['causaRaiz', 'causa', 'causaProvavel', 'rootCause']);
  const diagnostico = pickFirst(payload, ['diagnostico', 'diagnosticoTecnico', 'constatacao']);
  const contrato = pickFirst(payload, ['contrato', 'statusContrato']);
  const garantia = pickFirst(payload, ['garantia', 'statusGarantia']);
  const horario = pickFirst(payload, ['horario', 'agenda', 'periodoAtendimento']);
  const evidencias = Array.isArray(payload.evidencias) ? payload.evidencias : [];
  return { cliente, os, equipamento, problema, causa, diagnostico, contrato, garantia, horario, evidencias };
}

function buildSourceDataHash(os) {
  const source = os && typeof os === 'object' ? os : {};
  const payload = {
    os: pickFirst(source, ['os', 'ordemServico', 'codigoOS', 'ticket']),
    cliente: pickFirst(source, ['cliente', 'client', 'razaoSocial']),
    equipamento: pickFirst(source, ['equipamento', 'produto', 'asset']),
    problema: pickFirst(source, ['problema', 'defeito', 'descricao', 'ocorrencia']),
    diagnostico: pickFirst(source, ['diagnostico', 'diagnosticoTecnico', 'constatacao', 'laudo']),
    garantia: pickFirst(source, ['garantia', 'statusGarantia', 'cobertura']),
    resultado: pickFirst(source, ['resultado', 'statusFinal', 'status'])
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function shouldAnalyzeOS(os, options) {
  const opts = options || {};
  if (opts.forceReprocess === true) return true;
  const source = os && typeof os === 'object' ? os : {};
  const existing = source.aiAnalysis && typeof source.aiAnalysis === 'object' ? source.aiAnalysis : null;
  if (!existing || existing.version !== AI_CONTRACT_VERSION) return true;
  return String(existing.sourceDataHash || '') !== buildSourceDataHash(source);
}

function buildReviewFromAnalysis(os, partial) {
  const confidence = partial.confidence || { geral: 'media', motivo: '' };
  const billing = String(partial.decisao?.cobranca || '');
  const cause = String(partial.classificacao?.probableCause || '');
  const laudo = partial.laudo || {};
  const missingLaudo = !laudo.objetivo || !laudo.cenarioEncontradoDiagnostico || !laudo.conclusaoTecnica;
  const required = confidence.geral === 'baixa'
    || billing.includes('revisao')
    || billing.includes('validacao')
    || cause === 'inconclusiva'
    || missingLaudo;
  let priority = 'media';
  if (/critico|crítica|parado|urgente/i.test(`${os?.problema || ''} ${os?.diagnostico || ''}`)) priority = 'critica';
  else if (billing.includes('revisao') || billing.includes('validacao')) priority = 'alta';
  else if (confidence.geral === 'baixa' || missingLaudo) priority = 'media';
  else priority = 'baixa';
  return {
    required,
    priority,
    reason: required
      ? 'Revisao requerida por baixa confianca, cobranca inconclusiva, causa pouco clara ou laudo incompleto.'
      : 'Revisao humana nao obrigatoria pelos dados atuais.',
    recommendedReviewer: billing.includes('comercial') || billing.includes('validacao')
      ? 'gerente_operacional_campinas'
      : 'tecnico_lider',
    checklist: [
      confidence.geral === 'baixa' ? 'Completar dados essenciais da OS.' : '',
      cause === 'inconclusiva' ? 'Confirmar causa raiz com evidencia tecnica.' : '',
      billing.includes('revisao') || billing.includes('validacao') ? 'Validar regra de cobranca antes de faturar.' : '',
      missingLaudo ? 'Completar laudo no padrao oficial.' : ''
    ].filter(Boolean)
  };
}

async function analyzeOS(os, options) {
  const source = os && typeof os === 'object' ? os : {};
  const classification = {
    tipoAtendimento: classificacaoRules.classifyServiceType(source),
    tipoLaudo: classificacaoRules.classifyTipoLaudo(source),
    serviceType: classificacaoRules.classifyServiceType(source),
    warrantyType: classificacaoRules.classifyWarrantyType(source),
    probableCause: classificacaoRules.classifyProbableCause(source),
    outcomeType: classificacaoRules.classifyOutcomeType(source)
  };
  const billing = cobrancaRules.decideBilling(source, classification);
  let partial = {
    classificacao: classification,
    decisao: {
      operacional: '',
      cobranca: billing.cobranca,
      justificativa: billing.justificativa
    },
    evidencias: normalizeStringList(source.evidencias || source.evidenciasNecessarias),
    pendencias: [],
    confidence: { geral: 'media', motivo: '' }
  };
  partial.confidence = confidenceRules.calculateConfidence(source, partial);
  partial.escalonamento = escalonamentoRules.decideEscalation(source, classification, partial.confidence);
  partial.decisao.operacional = partial.escalonamento.necessario
    ? `Escalar para ${partial.escalonamento.destino} antes de encerrar.`
    : 'Executar/validar atendimento e encerrar somente com evidencia e laudo completo.';
  partial.pendencias = [
    partial.confidence.geral === 'baixa' ? 'Tecnico responsavel: completar dados e evidencias essenciais.' : '',
    partial.escalonamento.necessario ? `Tecnico lider responsavel: acompanhar escalonamento para ${partial.escalonamento.destino}.` : ''
  ].filter(Boolean);
  partial.laudo = laudoRules.buildLaudoStructure(source, partial);
  partial.review = buildReviewFromAnalysis(source, partial);
  const aiAnalysis = normalizeAiAnalysisContract({
    version: AI_CONTRACT_VERSION,
    processedAt: nowIso(),
    source: options?.source || 'mock',
    status: partial.review.required ? 'pending_review' : 'processed',
    legacyCompatible: true,
    sourceDataHash: buildSourceDataHash(source),
    ...partial,
    decisionTrace: [
      `serviceType=${classification.serviceType}`,
      `warrantyType=${classification.warrantyType}`,
      `probableCause=${classification.probableCause}`,
      `billing=${billing.cobranca}`,
      `confidence=${partial.confidence.geral}`,
      `review=${partial.review.required ? 'required' : 'not_required'}`
    ]
  });
  return {
    aiAnalysis,
    ...buildLegacyCompatibleFields(aiAnalysis),
    aiProcessedAt: aiAnalysis.processedAt,
    aiAnalysisVersion: AI_CONTRACT_VERSION,
    aiReviewRequired: aiAnalysis.review.required,
    aiConfidence: aiAnalysis.confidence.geral,
    aiAnalysisHash: aiAnalysis.sourceDataHash
  };
}

async function analyzeOSEmBackground(os, options) {
  try {
    if (!shouldAnalyzeOS(os, options)) {
      return {
        ...(os && typeof os === 'object' ? os : {}),
        skipped: true
      };
    }
    return await analyzeOS(os, options);
  } catch (err) {
    const failedAnalysis = normalizeAiAnalysisContract({
      version: AI_CONTRACT_VERSION,
      processedAt: nowIso(),
      source: 'mock',
      status: 'failed',
      legacyCompatible: true,
      sourceDataHash: buildSourceDataHash(os),
      confidence: { geral: 'baixa', motivo: 'Falha segura durante analise local.' },
      review: {
        required: true,
        priority: 'alta',
        reason: 'Falha da IA local; revisao humana obrigatoria.',
        recommendedReviewer: 'tecnico_lider',
        checklist: ['Reprocessar analise IA.', 'Validar OS manualmente.']
      },
      decisionTrace: [`error=${asText(err?.message || err)}`]
    });
    return {
      aiAnalysis: failedAnalysis,
      ...buildLegacyCompatibleFields(failedAnalysis),
      aiProcessedAt: failedAnalysis.processedAt,
      aiAnalysisVersion: AI_CONTRACT_VERSION,
      aiReviewRequired: true,
      aiConfidence: 'baixa',
      aiAnalysisHash: failedAnalysis.sourceDataHash
    };
  }
}

function buildOperationalSummary(context) {
  return `OS ${context.os} para ${context.cliente}: ${context.equipamento} com relato de ${context.problema}.`;
}

function inferTipoAtendimento(context, dadosOS) {
  const source = `${asText(dadosOS?.tipoAtendimento)} ${context.problema} ${context.diagnostico}`.toLowerCase();
  if (source.includes('instal')) return 'instalacao';
  if (source.includes('prevent')) return 'preventiva';
  if (source.includes('orient')) return 'orientacao';
  if (source.includes('valid')) return 'validacao';
  if (source.includes('software') || source.includes('sistema') || source.includes('app')) return 'software';
  return 'corretiva';
}

function buildAdvancedOsMockResult(dadosOS) {
  const context = buildOsContext(dadosOS);
  const tipoAtendimento = inferTipoAtendimento(context, dadosOS);
  const hasCause = !!context.causa || !!context.diagnostico;
  const hasEvidence = context.evidencias.length > 0 || /foto|teste|medicao|evidencia|log/i.test(`${context.problema} ${context.diagnostico}`);
  const noEffectiveService = /improdut|sem acesso|cliente ausente|nao houve atendimento|não houve atendimento/i.test(`${context.problema} ${context.diagnostico}`);
  const needsEscalation = !hasCause || /duvida|dúvida|matriz|suporte|escalonar|sem causa/i.test(`${context.problema} ${context.diagnostico}`);
  const nivelEscalonamento = needsEscalation ? (hasEvidence ? 'nivel_1' : 'nivel_2') : 'nenhum';
  const tipoLaudoSugerido = noEffectiveService
    ? 'laudo_improdutivo'
    : `laudo_${tipoAtendimento}`;
  const evidenciasNecessarias = [
    'Foto ou registro do estado inicial do equipamento.',
    'Teste executado com resultado objetivo antes do encerramento.',
    !hasCause ? 'Registro da tentativa de diagnostico e motivo da causa nao identificada.' : '',
    !context.contrato ? 'Validacao de contrato antes de decisao de cobranca.' : '',
    !context.garantia ? 'Validacao de garantia antes de decisao de cobranca.' : '',
    !context.horario ? 'Registro de horario/agenda do atendimento.' : ''
  ].filter(Boolean);
  const decisaoOperacional = noEffectiveService
    ? 'Classificar como improdutiva, registrar motivo e reagendar ou escalar responsavel conforme bloqueio.'
    : (needsEscalation
      ? 'Nao encerrar. Escalonar para suporte/matriz com evidencias e testes ja executados.'
      : 'Executar correcao indicada, validar funcionamento e encerrar somente com laudo completo.');
  const decisaoCobranca = noEffectiveService
    ? 'Revisar regra comercial de improdutiva antes de faturar.'
    : (context.garantia || context.contrato
      ? 'Validar contrato e garantia antes de cobranca; nao faturar sem enquadramento formal.'
      : 'Cobranca pendente de validacao comercial por falta de contrato/garantia informados.');

  return {
    resumo: buildOperationalSummary(context),
    risco: needsEscalation ? 'alto' : 'medio',
    classificacao: noEffectiveService ? 'atendimento_improdutivo' : (needsEscalation ? 'diagnostico_inconclusivo' : 'execucao_tecnica_com_evidencia'),
    tipoLaudoSugerido,
    tipoAtendimento,
    decisaoOperacional,
    decisaoCobranca,
    recomendacoes: [
      hasCause ? 'Aplicar correcao conforme causa identificada e validar resultado com teste objetivo.' : 'Escalonar antes de encerrar porque a causa raiz nao foi identificada.',
      'Preencher laudo no padrao OBJETIVO, DIAGNOSTICO, ACOES, RESULTADO, PENDENCIAS e CONCLUSAO.',
      'Registrar evidencias tecnicas suficientes para auditoria e decisao de cobranca.'
    ],
    evidenciasNecessarias,
    proximaAcao: needsEscalation
      ? 'Acionar suporte/matriz com OS, sintomas, testes executados e evidencias disponiveis.'
      : 'Executar correcao, validar funcionamento e completar laudo padronizado.',
    necessitaEscalonamento: needsEscalation,
    nivelEscalonamento,
    estruturaLaudoSugerida: {
      objetivo: `Atender a OS ${context.os} do cliente ${context.cliente} para tratar ${context.problema}.`,
      diagnostico: hasCause
        ? `Diagnostico baseado nos dados informados: ${context.diagnostico || context.causa}.`
        : 'Diagnostico inconclusivo: registrar testes executados e evidencias faltantes antes de encerramento.',
      acoes: [
        'Validar contrato, garantia e horario do atendimento.',
        hasCause ? 'Executar a correcao relacionada a causa identificada.' : 'Executar testes basicos e escalar se a causa permanecer nao identificada.',
        'Registrar evidencia objetiva do resultado.'
      ],
      resultado: hasCause ? 'Resultado deve ser preenchido apos teste de funcionamento.' : 'Resultado pendente de diagnostico conclusivo ou retorno do suporte.',
      pendencias: evidenciasNecessarias.map(item => `Tecnico responsavel: ${item}`),
      conclusao: hasCause
        ? 'Encerrar somente se o teste confirmar funcionamento e o cliente/operacao validar a entrega.'
        : 'Nao concluir como resolvida sem causa identificada e sem evidencia tecnica suficiente.'
    }
  };
}

async function analisarOS(dadosOS) {
  const promptName = 'analise_os';
  const analysisResult = await analyzeOS(dadosOS, { source: 'manual' });
  return executeAiTask({
    type: 'analise_os',
    promptName,
    dadosContexto: dadosOS,
    mockResult: {
      ...buildAdvancedOsMockResult(dadosOS),
      ...analysisResult
    }
  });
}

async function gerarLaudoTecnico(dadosOS) {
  const promptName = 'laudo_tecnico_padrao';
  const context = buildOsContext(dadosOS);
  return executeAiTask({
    type: 'laudo_tecnico',
    promptName,
    dadosContexto: dadosOS,
    mockResult: {
    resumo: `Laudo preliminar para ${context.os}: equipamento ${context.equipamento} avaliado com base no relato operacional.`,
    risco: 'medio',
    classificacao: 'laudo_preliminar',
    recomendacoes: [
      'Descrever sintoma, testes executados, causa provavel e acao realizada.',
      'Anexar fotos, medicoes ou evidencias do atendimento.',
      'Separar conclusao tecnica de pendencias comerciais ou administrativas.'
    ],
    proximaAcao: 'Completar o laudo com evidencias de campo e validar a conclusao antes do envio.'
    }
  });
}

async function classificarCobranca(dadosOS) {
  const promptName = 'classificacao_cobranca';
  const context = buildOsContext(dadosOS);
  return executeAiTask({
    type: 'classificacao_cobranca',
    promptName,
    dadosContexto: dadosOS,
    mockResult: {
    resumo: `Classificacao preliminar de cobranca para ${context.os} considerando cliente, equipamento e relato informado.`,
    risco: 'medio',
    classificacao: 'revisao_cobranca_necessaria',
    recomendacoes: [
      'Verificar contrato, garantia, reincidencia e causa raiz antes de faturar.',
      'Separar materiais, deslocamento e mao de obra quando houver cobranca.',
      'Escalar divergencias ao gerente operacional da filial Campinas antes de comunicar o cliente.'
    ],
    proximaAcao: 'Conferir elegibilidade comercial e registrar justificativa objetiva para a classificacao.'
    }
  });
}

async function gerarResumoDia(dadosDia) {
  const promptName = 'resumo_executivo_dia';
  const payload = dadosDia && typeof dadosDia === 'object' ? dadosDia : {};
  const data = pickFirst(payload, ['data', 'date', 'dia']) || 'data nao informada';
  return executeAiTask({
    type: 'resumo_executivo_dia',
    promptName,
    dadosContexto: dadosDia,
    mockResult: {
    resumo: `Resumo operacional do dia ${data} preparado em modo ${getMode()}.`,
    risco: 'medio',
    classificacao: 'resumo_executivo_operacional',
    recomendacoes: [
      'Destacar volume de OS, pendencias criticas, SLA e recorrencias.',
      'Registrar decisoes necessarias para o proximo ciclo operacional.',
      'Conferir inconsistencias antes de compartilhar com a gestao.'
    ],
    proximaAcao: 'Validar os indicadores do dia e consolidar os principais pontos de atencao.'
    }
  });
}

async function gerarEmailTecnico(dadosContexto) {
  const promptName = 'email_resposta_tecnica';
  const context = buildOsContext(dadosContexto);
  return executeAiTask({
    type: 'email_tecnico',
    promptName,
    dadosContexto,
    mockResult: {
    resumo: `Email tecnico sugerido para a OS ${context.os}, cliente ${context.cliente}.`,
    risco: 'baixo',
    classificacao: 'comunicacao_tecnica',
    recomendacoes: [
      'Usar linguagem objetiva, sem prometer prazos nao confirmados.',
      'Informar diagnostico, acao executada e pendencias de forma separada.',
      'Encerrar com a proxima acao e responsavel definido.'
    ],
    proximaAcao: 'Revisar dados sensiveis e adequar o tom antes do envio.'
    }
  });
}

// Future integration point:
// - Use montarPrompt(promptName, dadosContexto) as the provider input.
// - Call the real OpenAI provider only when OPENAI_API_KEY, AI_PROVIDER=openai
//   and AI_REAL_ENABLED=true are configured together.
// - Never log, return, persist, or interpolate the API key.
// - Keep mock as the default fallback.

module.exports = {
  analisarOS,
  gerarLaudoTecnico,
  classificarCobranca,
  gerarResumoDia,
  gerarEmailTecnico,
  analyzeOS,
  analyzeOSEmBackground,
  shouldAnalyzeOS,
  normalizeAiResult,
  buildLegacyCompatibleFields,
  buildSourceDataHash,
  AI_CONTRACT_VERSION,
  loadPrompt,
  montarPrompt,
  isOpenAiEnabled,
  getMode
};
