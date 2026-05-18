const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const DESLOCAMENTO = 281;
const PRIMEIRA_HORA = 217;

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractParts(texto) {
    return [...new Set(String(texto || '').match(/\b[SC]\d{5,10}[A-Z]?\b/g) || [])];
}

function classifyTaxonomy(texto) {
    const t = normalize(texto);
    const serviceType = t.includes('preventiva') || t.includes('limpeza') ? 'preventiva'
        : t.includes('instala') ? 'instalacao'
        : t.includes('infra') || t.includes('cabo') || t.includes('rede') ? 'infraestrutura'
        : t.includes('configura') || t.includes('senha') ? 'configuracao'
        : 'corretiva';
    const probableCause = t.includes('placa') || t.includes('teclado') || t.includes('fonte') || t.includes('display') ? 'falha_hardware'
        : t.includes('comunica') || t.includes('rede') || t.includes('ip') ? 'falha_comunicacao'
        : t.includes('infra') || t.includes('cabo') || t.includes('energia') ? 'infraestrutura_cliente'
        : t.includes('configura') || t.includes('senha') ? 'configuracao'
        : 'erro_operacional';
    const outcomeType = t.includes('aguardando peca') || t.includes('aguardando peça') || t.includes('substituicao') ? 'aguardando_peca'
        : t.includes('parcial') ? 'parcial'
        : t.includes('escalonado') ? 'escalonado'
        : 'solucionado';
    return { serviceType, probableCause, outcomeType, taxonomyMatch: true };
}

function calcularValores(eGarantia) {
    const maoDeObra = eGarantia ? 0 : PRIMEIRA_HORA;
    const valorEstimado = DESLOCAMENTO + maoDeObra;
    return {
        deslocamento: DESLOCAMENTO,
        maoDeObra,
        valorEstimado,
        faturamento: {
            valorEstimadoCatalogo: valorEstimado,
            valorLogistica: DESLOCAMENTO,
            valorHoraInicial: maoDeObra
        },
        billingRecommendation: eGarantia ? 'nao_cobrar_mao_de_obra' : 'faturar_total'
    };
}

function recomendar({ probableCause, recurrenceCount, pecas, texto }) {
    const t = normalize(texto);
    if (Array.isArray(pecas) && pecas.length > 0) return 'Preparar peça para substituição';
    if (probableCause === 'falha_hardware' && recurrenceCount > 1) return 'Acionamento de Laboratório';
    if (probableCause === 'infraestrutura_cliente' || probableCause === 'falha_comunicacao') return 'Checklist de Rede';
    if (t.includes('travamento')) return 'Realizar update de firmware preventivo';
    if (recurrenceCount > 1) return 'Auditar reincidência operacional';
    return 'Manter monitoramento padrão';
}

function calculateRisk(os) {
    let score = 0;
    if (Number(os.reincidencia || 0) > 0 || Number(os.recurrenceCount || 0) > 1) score += 30;
    if (Array.isArray(os.pecas) && os.pecas.length > 0) score += 20;
    if (os.classificacao === 'Garantia') score += 20;
    if (String(os.os_numero || '').includes('V69')) score += 10;
    if (String(os.outcomeType || '').includes('aguardando_peca')) score += 20;
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

function confidenceFor(os) {
    let confidence = 70;
    if (os.os_numero && os.os_numero !== 'S/N') confidence += 10;
    if (os.tecnico && os.tecnico !== 'N/A') confidence += 5;
    if (os.cliente && os.cliente !== 'CLIENTE') confidence += 5;
    if (os.modelo && os.modelo !== 'EQUIP.') confidence += 5;
    if (os.serial && os.serial !== 'S/N') confidence += 5;
    return Math.min(confidence, 95);
}

function extrairCampo(texto, patterns, fallback) {
    for (const pattern of patterns) {
        const match = texto.match(pattern);
        if (match?.[1]) return String(match[1]).trim();
    }
    return fallback;
}

function extrairAtivo(texto) {
    const serialRaw = extrairCampo(texto, [
        /N[°ºo]\s*de\s*S[eé]rie:\s*([A-Z0-9][A-Z0-9._ -]{3,40})/i,
        /N[°ºo]\s*de\s*Serie:\s*([A-Z0-9][A-Z0-9._ -]{3,40})/i,
        /S[eé]rie:\s*([A-Z0-9][A-Z0-9._ -]{3,40})/i,
        /Serie:\s*([A-Z0-9][A-Z0-9._ -]{3,40})/i
    ], 'S/N').replace(/\s+/g, ' ').trim();
    return {
        serial: /\d/.test(serialRaw) ? serialRaw : 'S/N',
        modelo: extrairCampo(texto, [
            /Equipamento:\s*([^]+?)(?:\s+Descri[cç][aã]o|\s+QRCode|\s+Serie:|\s+S[eé]rie:|$)/i,
            /Descri[cç][aã]o do produto:\s*([^]+?)(?:\s+QRCode|\s+Serie:|\s+S[eé]rie:|$)/i,
            /Produto:\s*([^]+?)(?:\s+QRCode|\s+Serie:|\s+S[eé]rie:|$)/i
        ], 'EQUIP.').replace(/\s+/g, ' ').trim().substring(0, 80)
    };
}

function montarOS(raw, texto = '') {
    const eGarantia = raw.classificacao === 'Garantia' || /garantia|retorno/i.test(texto || raw.descricao || '');
    const taxonomy = classifyTaxonomy(texto || raw.descricao || '');
    const valores = calcularValores(eGarantia);
    const pecas = raw.pecas || extractParts(texto || raw.descricao || '');
    const base = {
        status: 'Processado',
        ...raw,
        classificacao: eGarantia ? 'Garantia' : 'Faturável',
        pecas,
        recurrenceKey: `${raw.cliente || 'CLIENTE'}|${raw.serial || 'S/N'}|${taxonomy.probableCause}`,
        recurrenceCount: Number(raw.recurrenceCount || 1),
        reincidencia: /retorno|reincid/i.test(texto || raw.descricao || '') ? 1 : Number(raw.reincidencia || 0),
        ...taxonomy,
        ...valores,
        dataAnalise: raw.dataAnalise || new Date().toISOString()
    };
    const enriched = { ...base, riskLevel: calculateRisk(base), confidence: confidenceFor(base) };
    return { ...enriched, recommendation: recomendar({ probableCause: enriched.probableCause, recurrenceCount: enriched.recurrenceCount, pecas, texto }) };
}

const aiService = {
    calculateRisk,
    extractParts,
    async analisarOS(dados = {}) {
        return montarOS({
            os_numero: dados.os_numero || dados.os || 'S/N',
            tecnico: dados.tecnico || 'N/A',
            cliente: dados.cliente || 'CLIENTE',
            serial: dados.serial || 'S/N',
            modelo: dados.modelo || 'EQUIP.',
            descricao: dados.descricao || '',
            pecas: dados.pecas || []
        }, dados.descricao || '');
    },
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        let texto = '';
        try {
            const data = await parser.getText();
            texto = String(data.text || '').replace(/\s+/g, ' ');
        } finally {
            await parser.destroy();
        }
        const ativo = extrairAtivo(texto);
        return montarOS({
            os_numero: filePath.match(/V\d+/)?.[0] || 'S/N',
            tecnico: extrairCampo(texto, [/T[eé]cnico:\s*([^]+?)(?:\s+T[eé]rmino:|\s+Dados do Atendimento|$)/i], 'N/A').split(' ')[0],
            cliente: extrairCampo(texto, [/Cliente:\s*([^]+?)(?:\s+Endere[cç]o:|\s+In[ií]cio:|$)/i], 'CLIENTE').substring(0, 50),
            ...ativo,
            descricao: texto,
            pecas: extractParts(texto)
        }, texto);
    }
};

module.exports = aiService;
