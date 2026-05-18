const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');

const RAIZ_PROJETO = 'C:\\Painel_Operacional_Corrigido';
const dirPath = 'C:\\Painel_Operacional_Corrigido\\data\\import\\campinas';
const IMPORT_CAMPINAS_DIR = dirPath;
const PRICING_JSON = path.join(RAIZ_PROJETO, 'data', 'pricing-catalog.json');
const PRICING_XLSX = path.join(RAIZ_PROJETO, 'data', 'pricing', 'TABELA_DE_PRECO_CLIENTE_FINAL.xlsx');
const AUDITORIA_JSON = path.join(RAIZ_PROJETO, 'data', 'auditoria.json');
const RECORDS_JSON = path.join(RAIZ_PROJETO, 'data', 'records.json');
const DIAGNOSTICO_OS_CSV = path.join(RAIZ_PROJETO, 'data', 'diagnostico_os_linhas.csv');
const DESLOCAMENTO = 188;
const MARKET_REFERENCE_ABRIL = [
    { code: 'A2800403', name: 'Fonte MD 402', price: 43 },
    { code: 'A2790017', name: 'Disco Optico', price: 30 },
    { code: 'A2790295', name: 'Leitor MS CLASSI-D', price: 1681 }
];

const EMPTY_PURE_DATA = {
    ok: true,
    root: RAIZ_PROJETO,
    eliteTeam: [],
    sourceCounts: {
        spreadsheetsInCampinas: 0,
        spreadsheetRows: 0,
        pdfsInCampinas: 0,
        pdfRows: 0,
        auditoriaRows: 0,
        selectedRows: 0,
        mixCorretiva: 0,
        instPonto: 0,
        instAcesso: 0,
        mixPreventiva: 0,
        pricingItems: 0,
        osSource: 'aguardando_extracao_os_dia',
        pureDataRead: false,
        hybridDataRead: true,
        asyncDataFlow: true,
        dirPath,
        spreadsheetFiles: [],
        pdfFiles: [],
        restoredStores: ['data/auditoria.json', 'data/records.json', 'data/diagnostico_os_linhas.csv']
    },
    records: [],
    mixCorretiva: 0,
    instPonto: 0,
    instAcesso: 0,
    mixPreventiva: 0,
    technicians: [],
    products: [],
    parts: [],
    expensiveParts: [],
    marketReference: [],
    awards: [],
    productivity: [],
    dre: [],
    status: 'Aguardando Extração de O.S. do Dia ou Base Interna',
    generatedAt: new Date().toISOString()
};

let cachedPureData = { ...EMPTY_PURE_DATA };
let refreshPromise = null;
let lastSignature = '';

const TECH_NAME_MAP = new Map([
    ['TALLES', 'Talles Henrique'],
    ['TALLES HENRIQUE', 'Talles Henrique'],
    ['BRUNO', 'Bruno Henrique Naidhig'],
    ['BRUNO HENRIQUE', 'Bruno Henrique Naidhig'],
    ['BRUNO HENRIQUE NAIDHIG', 'Bruno Henrique Naidhig'],
    ['RONALDO', 'Ronaldo Zuliani'],
    ['RONALDO ZULIANI', 'Ronaldo Zuliani'],
    ['ISRAEL', 'Israel Osvaldo Inacio'],
    ['ISRAEL OSVALDO INACIO', 'Israel Osvaldo Inacio'],
    ['CELSO', 'Celso Luis'],
    ['CELSO LUIS', 'Celso Luis'],
    ['LEANDRO', 'Leandro Tiago'],
    ['LEANDRO TIAGO', 'Leandro Tiago'],
    ['BRUNO MARTUCI', 'Bruno Martuci'],
    ['MARTUCI', 'Bruno Martuci'],
    ['ANDERSON', 'Anderson'],
    ['VINICIUS', 'Vinicius']
]);

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function compactKey(value) {
    return normalize(value).replace(/[^a-z0-9]/g, '');
}

function serverLog(message, extra = {}) {
    const payload = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[FORCE_FILE_READ] ${message}${payload}`);
}

function moedaToNumber(value) {
    if (typeof value === 'number') return value;
    const raw = String(value || '').replace(/[^\d,.-]/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
    if (raw.includes(',')) return Number(raw.replace(',', '.')) || 0;
    return Number(raw) || 0;
}

function parseMoney(value) {
    return moedaToNumber(value);
}

function normalizePdfText(value) {
    return String(value || '').replace(/\u0000/g, ' ').replace(/[ \t]+/g, ' ').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function pickMatch(text, patterns, fallback = '') {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return cleanMappedValue(match[1]);
    }
    return fallback;
}

function pickSection(text, startPatterns, endPatterns, fallback = '') {
    const starts = Array.isArray(startPatterns) ? startPatterns : [startPatterns];
    const ends = Array.isArray(endPatterns) ? endPatterns : [endPatterns];
    let startIndex = -1;
    let startLength = 0;
    for (const pattern of starts) {
        const match = text.match(pattern);
        if (match?.index >= 0) {
            startIndex = match.index;
            startLength = match[0].length;
            break;
        }
    }
    if (startIndex < 0) return fallback;
    const rest = text.slice(startIndex + startLength);
    let endIndex = rest.length;
    for (const pattern of ends) {
        const match = rest.match(pattern);
        if (match?.index >= 0) endIndex = Math.min(endIndex, match.index);
    }
    return cleanMappedValue(rest.slice(0, endIndex));
}

function parseDateTimeBR(value) {
    const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh, min] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
}

function diffMinutes(startValue, endValue) {
    const start = parseDateTimeBR(startValue);
    const end = parseDateTimeBR(endValue);
    if (!start || !end) return 0;
    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    return diff > 0 ? diff : 0;
}

function formatDuration(minutes) {
    const total = Number(minutes || 0);
    if (!total) return '';
    return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

function classifyPdfService(text) {
    const n = normalize(text);
    if (/preventiva/.test(n)) return 'Preventiva';
    if (/instalacao|instala[cç][aã]o/.test(n)) return 'Instalacao';
    if (/vistoria|inspecao|inspe[cç][aã]o/.test(n)) return 'Vistoria';
    return 'Corretiva';
}

function classifyPdfCoverage(text) {
    const n = normalize(text);
    if (/retorno|reincid/.test(n)) return 'Retorno';
    if (/contrato|preventiva/.test(n)) return 'Contrato';
    if (/garantia|sem onus|sem debito/.test(n)) return 'Garantia';
    return 'Avulso';
}

function extractPartCodes(text) {
    return [...new Set((String(text || '').match(/\b[A-Z]{1,3}\d{4,12}[A-Z]?\b/gi) || [])
        .map(item => item.toUpperCase())
        .filter(item => item.length >= 5))];
}

function canonicalTechnician(value) {
    const raw = String(value || '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (/^tecnico\s+nao\s+identificado$/i.test(raw) || /^técnico\s+não\s+identificado$/i.test(raw)) return '';
    const dashParts = raw.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
    const candidate = dashParts.length > 1 ? dashParts[dashParts.length - 1] : raw;
    const cleaned = candidate.replace(/^(VS|OS|O\.S\.|TEC|TÉC)\s*\d+\s*/i, '').trim();
    const upper = raw.toUpperCase();
    if (TECH_NAME_MAP.has(upper)) return TECH_NAME_MAP.get(upper);
    const cleanedUpper = cleaned.toUpperCase();
    if (TECH_NAME_MAP.has(cleanedUpper)) return TECH_NAME_MAP.get(cleanedUpper);
    const first = cleanedUpper.split(' ')[0];
    if (TECH_NAME_MAP.has(first)) return TECH_NAME_MAP.get(first);
    return cleaned || raw;
}

function firstValue(row, aliases) {
    const wanted = aliases.map(compactKey);
    const entries = Object.entries(row || {});
    for (const [key, value] of entries) {
        const normalizedKey = compactKey(key);
        if (wanted.some(alias => normalizedKey === alias) && String(value || '').trim()) return value;
    }
    for (const [key, value] of entries) {
        const normalizedKey = compactKey(key);
        if (wanted.some(alias => alias.length >= 8 && normalizedKey.includes(alias)) && String(value || '').trim()) return value;
    }
    return '';
}

function cleanMappedValue(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (/^(tecnico|t[eé]cnico|cliente|produto)\s+nao\s+identificado$/i.test(text)) return '';
    if (/^a[cç][aã]o feita\/desfecho ausente$/i.test(text)) return '';
    return text;
}

function sanitizeDisplay(value) {
    return String(value || '').replace(/print\s*point/gi, 'iDBlock / Micropoint');
}

async function listSpreadsheetFiles(dir = IMPORT_CAMPINAS_DIR) {
    try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await listSpreadsheetFiles(fullPath));
                continue;
            }
            if (!entry.isFile() || !/\.(csv|xlsx|xls)$/i.test(entry.name)) continue;
            const stat = await fsp.stat(fullPath);
            files.push({ path: fullPath, name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size });
        }
        return files;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        serverLog('Falha ao listar pasta de importacao', { dir, error: err.message });
        throw err;
    }
}

async function listPdfFiles(dir = IMPORT_CAMPINAS_DIR) {
    try {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await listPdfFiles(fullPath));
                continue;
            }
            if (!entry.isFile() || !/\.pdf$/i.test(entry.name)) continue;
            const stat = await fsp.stat(fullPath);
            files.push({ path: fullPath, name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size });
        }
        return files;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        serverLog('Falha ao listar PDFs de atendimento', { dir, error: err.message });
        throw err;
    }
}

function detectDelimiter(line) {
    const semicolon = (line.match(/;/g) || []).length;
    const comma = (line.match(/,/g) || []).length;
    return semicolon >= comma ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
            continue;
        }
        if (char === '"') {
            quoted = !quoted;
            continue;
        }
        if (char === delimiter && !quoted) {
            values.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    values.push(current.trim());
    return values;
}

async function readCsvRows(fileInfo) {
    const content = (await readFileBufferSafe(fileInfo)).toString('utf8');
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter).map(header => header.trim());
    if (!headers.length) return [];
    return lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line, delimiter);
        const row = { __sourceFile: fileInfo.name, __sheet: 'CSV', __line: index + 2, __delimiter: delimiter };
        headers.forEach((header, cellIndex) => {
            row[header || `COL_${cellIndex + 1}`] = values[cellIndex] || '';
        });
        return row;
    });
}

async function readFileBufferSafe(fileInfo) {
    try {
        return await fsp.readFile(fileInfo.path);
    } catch (err) {
        serverLog('readFile falhou; tentando stream read-only', {
            file: fileInfo.name,
            path: fileInfo.path,
            error: err.message
        });
        return new Promise((resolve, reject) => {
            const chunks = [];
            const stream = fs.createReadStream(fileInfo.path, { flags: 'r' });
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', streamErr => {
                serverLog('stream read-only tambem falhou', {
                    file: fileInfo.name,
                    path: fileInfo.path,
                    error: streamErr.message
                });
                reject(streamErr);
            });
        });
    }
}

async function readSpreadsheetRows(fileInfo) {
    if (/\.csv$/i.test(fileInfo.name)) return readCsvRows(fileInfo);
    const buffer = await readFileBufferSafe(fileInfo);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const rows = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
        for (const row of sheetRows) rows.push({ ...row, __sourceFile: fileInfo.name, __sheet: sheetName });
    }
    return rows;
}

async function readPdfText(fileInfo) {
    const buffer = await readFileBufferSafe(fileInfo);
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return normalizePdfText(result.text || '');
    } finally {
        if (typeof parser.destroy === 'function') await parser.destroy();
    }
}

function extractPdfRecordFromText(text, fileInfo, prices) {
    const flat = normalizePdfText(text).replace(/\n/g, ' ');
    const os = pickMatch(flat, [
        /\bOS:\s*([A-Z]?\d{4,}|V\d{4,}|Z[A-Z0-9]{4,})/i,
        /\bOrigem:\s*\d*([A-Z]?\d{4,}|V\d{4,}|Z[A-Z0-9]{4,})/i
    ], (fileInfo.name.match(/(V\d{4,}|Z[A-Z0-9]{4,})/i)?.[1] || path.basename(fileInfo.name, '.pdf')));
    const cliente = pickMatch(flat, [/Cliente:\s*(.*?)(?:Endere[cç]o:|In[ií]cio:|OS:|T[eé]cnico:|$)/i]);
    const tecnico = canonicalTechnician(pickMatch(flat, [/T[eé]cnico:\s*(.*?)(?:T[eé]rmino:|Dados do Atendimento|Informa[cç][aã]o|$)/i]));
    const inicio = pickMatch(flat, [/In[ií]cio:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})/i]);
    const termino = pickMatch(flat, [/T[eé]rmino:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})/i]);
    const data = inicio.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || pickMatch(flat, [/(\d{2}\/\d{2}\/\d{4})/]);
    const descricaoAtendimento = pickSection(text, [
        /Informa[cç][aã]o Atendimento:\s*/i,
        /PROBLEMA APRESENTADO:\s*/i,
        /Descri[cç][aã]o do Atendimento:\s*/i
    ], [
        /Discriminacao de Cobranca/i,
        /Discrimina[cç][aã]o de Cobran[cç]a/i,
        /Servi[cç]o Executado/i,
        /Solu[cç][aã]o/i,
        /Observa[cç][aã]o/i,
        /Dados do Produto/i
    ]);
    const laudo = pickSection(text, [
        /Servi[cç]o Executado:\s*/i,
        /Solu[cç][aã]o:\s*/i,
        /Laudo T[eé]cnico:\s*/i,
        /Observa[cç][aã]o:\s*/i
    ], [
        /Pe[cç]as Utilizadas/i,
        /Assinatura/i,
        /Obrigado por escolher/i,
        /Pesquisa de satisfa/i
    ]);
    const serial = pickMatch(flat, [
        /N[úuº°]*mero de S[eé]rie:\s*([A-Z0-9.-]+)/i,
        /NUMERO DE SERIE:\s*([A-Z0-9.-]+)/i,
        /S[eé]rie:\s*([A-Z0-9.-]+)/i,
        /Serial:\s*([A-Z0-9.-]+)/i
    ], '');
    const equipamento = pickMatch(flat, [
        /Equipamento:\s*(.*?)(?:N[úuº°]*mero de S[eé]rie:|S[eé]rie:|C[oó]digo|OS:|$)/i,
        /Descri[cç][aã]o do Produto:\s*(.*?)(?:N[úuº°]*mero de S[eé]rie:|S[eé]rie:|C[oó]digo|$)/i,
        /Produto:\s*(.*?)(?:N[úuº°]*mero de S[eé]rie:|S[eé]rie:|C[oó]digo|$)/i
    ], '') || extractProduct(flat);
    const codigoProduto = pickMatch(flat, [
        /C[oó]digo do Produto:\s*([A-Z0-9.-]+)/i,
        /C[oó]digo:\s*([A-Z0-9.-]+)/i
    ], '');
    const tipoServico = classifyPdfService(flat);
    const statusChamado = classifyPdfCoverage(flat);
    const statusOrcamento = /aprovad/i.test(flat) ? 'Aprovado' : /rejeitad|recusad/i.test(flat) ? 'Rejeitado' : /pendente|aguard/i.test(flat) ? 'Pendente' : '-';
    const pecasCodigos = extractPartCodes(`${flat} ${laudo}`);
    const pecasDetalhe = findPriceMatches(`${flat} ${laudo}`, prices);
    const valores = [...flat.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(match => parseMoney(match[1])).filter(Boolean);
    const valorEstimado = valores.reduce((sum, value) => sum + value, 0);
    const tempoMinutos = diffMinutes(inicio, termino);
    const laudoFinal = cleanMappedValue(laudo || descricaoAtendimento);
    const textForPrice = `${equipamento} ${codigoProduto} ${laudoFinal} ${pecasCodigos.join(' ')}`;
    const custoPecas = pecasDetalhe.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    return {
        os_numero: os,
        data_atendimento: data,
        tipo_servico: tipoServico,
        tecnico,
        cliente,
        equipamento: cleanMappedValue(equipamento),
        produto: cleanMappedValue(equipamento),
        modelo: cleanMappedValue(equipamento),
        codigo_produto: codigoProduto,
        codigo: codigoProduto,
        serial,
        numero_serie: serial,
        serie: serial,
        descricao_atendimento: descricaoAtendimento,
        acaoFeita: laudoFinal,
        laudo_tecnico: laudoFinal,
        observacao: laudoFinal,
        hora_chegada: inicio,
        hora_saida: termino,
        tempo_permanencia_minutos: tempoMinutos,
        tempo_permanencia: formatDuration(tempoMinutos),
        classificacao: statusChamado,
        status_orcamento: statusOrcamento,
        pecas: pecasCodigos,
        pecasDetalhe,
        valores_pdf: valores,
        valorEstimado,
        custoPecas,
        deslocamento: DESLOCAMENTO,
        margem: valorEstimado - (DESLOCAMENTO + custoPecas),
        isRecurrent: statusChamado === 'Retorno',
        alertaLaudo: !laudoFinal,
        sourceType: 'pdf',
        sourceFile: fileInfo.name,
        sourcePath: fileInfo.path,
        hasOperationalSignal: Boolean(os || cliente || tecnico || laudoFinal || serial || textForPrice)
    };
}

async function extractPdfRecord(fileInfo, prices) {
    const text = await readPdfText(fileInfo);
    return extractPdfRecordFromText(text, fileInfo, prices);
}

async function readJsonArrayFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const raw = (await fsp.readFile(filePath, 'utf8')).trim();
        if (!raw) return [];
        if (raw.startsWith('[')) return JSON.parse(raw);
        if (raw.startsWith('{')) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed.records)) return parsed.records;
            if (Array.isArray(parsed.items)) return parsed.items;
            if (Array.isArray(parsed.linhas)) return parsed.linhas;
            const expanded = [];
            for (const [recordKey, recordValue] of Object.entries(parsed)) {
                const data = recordValue?.data || recordValue || {};
                const dateFromKey = String(recordKey).split('::').pop();
                const auditRaw = data.import_os_audit_json;
                if (auditRaw) {
                    try {
                        const auditRows = typeof auditRaw === 'string' ? JSON.parse(auditRaw) : auditRaw;
                        if (Array.isArray(auditRows)) {
                            for (const audit of auditRows) {
                                expanded.push({
                                    ...audit,
                                    data_atendimento: data.op_data || data.ag_data_base || dateFromKey,
                                    tecnico: audit.tecnico || data.import_summary_tecnico_top || data.tec_campo || data.op_responsavel || '',
                                    acaoFeita: audit.nextStep || audit.ordemCompra || '',
                                    produto: audit.produto || data.import_summary_produto_top || '',
                                    classificacao: audit.cobertura || audit.tipoServico || '',
                                    __recordKey: recordKey
                                });
                            }
                            continue;
                        }
                    } catch (parseErr) {
                        serverLog('Falha ao expandir import_os_audit_json', { recordKey, error: parseErr.message });
                    }
                }
                expanded.push({
                    ...data,
                    data_atendimento: data.op_data || data.ag_data_base || dateFromKey,
                    os: data.import_source_filename || data.import_os || '',
                    produto: data.import_summary_produto_top || data.produto || '',
                    __recordKey: recordKey
                });
            }
            return expanded;
        }
        return raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    } catch (err) {
        serverLog('Falha ao ler base JSON interna', { filePath, error: err.message });
        return [];
    }
}

async function readInternalProjectRows() {
    const rows = [];
    const sources = [];

    const auditoria = await readJsonArrayFile(AUDITORIA_JSON);
    if (auditoria.length) {
        rows.push(...auditoria.map(row => ({ ...row, __sourceFile: 'data/auditoria.json', __legacySource: 'auditoria' })));
        sources.push({ source: 'data/auditoria.json', rows: auditoria.length });
    }

    const records = await readJsonArrayFile(RECORDS_JSON);
    if (records.length) {
        rows.push(...records.map(row => ({ ...row, __sourceFile: 'data/records.json', __legacySource: 'records' })));
        sources.push({ source: 'data/records.json', rows: records.length });
    }

    if (fs.existsSync(DIAGNOSTICO_OS_CSV)) {
        try {
            const csvRows = await readCsvRows({ path: DIAGNOSTICO_OS_CSV, name: 'data/diagnostico_os_linhas.csv' });
            rows.push(...csvRows.map(row => ({ ...row, __legacySource: 'diagnostico_os_linhas' })));
            sources.push({ source: 'data/diagnostico_os_linhas.csv', rows: csvRows.length });
        } catch (err) {
            serverLog('Falha ao ler diagnostico_os_linhas.csv', { error: err.message });
        }
    }

    return { rows, sources };
}

async function loadPriceCatalog() {
    const prices = [];

    if (fs.existsSync(PRICING_JSON)) {
        const parsed = JSON.parse(await fsp.readFile(PRICING_JSON, 'utf8'));
        const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
        for (const item of items) {
            const code = item.code || item.codigo || item.DA1_CODPRO || item.codpro;
            const description = item.description || item.descricao || item.B1_DESC || item.desc;
            const price = item.monthly || item.price || item.valor || item.DA1_PRCVEN || item.preco;
            if (code || description) prices.push({
                code: String(code || '').trim(),
                description: String(description || '').trim(),
                price: moedaToNumber(price),
                source: 'pricing-catalog.json'
            });
        }
    }

    if (fs.existsSync(PRICING_XLSX)) {
        const buffer = await fsp.readFile(PRICING_XLSX);
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        for (const sheetName of workbook.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
            for (const row of rows) {
                const code = row.DA1_CODPRO || row.CODIGO || row.Codigo || row.codigo;
                const description = row.B1_DESC || row.DESCRICAO || row.Descricao || row.descricao;
                const price = row.DA1_PRCVEN || row.PRECO || row.Preco || row.valor;
                if (code || description) prices.push({
                    code: String(code || '').trim(),
                    description: String(description || '').trim(),
                    price: moedaToNumber(price),
                    source: path.basename(PRICING_XLSX)
                });
            }
        }
    }

    const unique = new Map();
    for (const item of prices) {
        const key = item.code || normalize(item.description);
        if (!key) continue;
        if (!unique.has(key) || (!unique.get(key).price && item.price)) unique.set(key, item);
    }
    return [...unique.values()].filter(item => item.price >= 0);
}

function findPriceMatches(text, prices) {
    const haystack = normalize(text);
    const codeMatches = String(text || '').match(/\b[A-Z]{1,3}\d{4,12}[A-Z]?\b/gi) || [];
    const found = new Map();

    for (const code of codeMatches) {
        const upper = code.toUpperCase();
        if (upper.length < 5) continue;
        const exact = prices.find(item => String(item.code || '').toUpperCase() === upper);
        if (exact) found.set(exact.code, exact);
    }

    const businessHints = ['fonte md 402', 'disco optico', 'disco Ã³ptico', 's2525364', 'd02727176', 'micropoint', 'idface', 'idblock'];
    const shouldDeepSearch = businessHints.some(term => haystack.includes(normalize(term))) || found.size === 0;
    if (shouldDeepSearch) {
        const weakWords = new Set(['para', 'com', 'sem', 'mod', 'rev', 'placa', 'cabo', 'kit', 'locacao', 'servico', 'terminal', 'relogio']);
        for (const item of prices) {
            const code = normalize(item.code);
            const desc = normalize(item.description);
            if (code && code.length >= 5 && haystack.includes(code)) found.set(item.code || item.description, item);
            if (desc && desc.length > 14 && !desc.includes('locacao')) {
                const words = desc.split(' ')
                    .filter(w => w.length > 3 && !weakWords.has(w))
                    .slice(0, 6);
                if (words.length < 2) continue;
                const hits = words.filter(w => haystack.includes(w)).length;
                if (hits >= Math.min(4, words.length)) found.set(item.code || item.description, item);
            }
        }
    }

    return [...found.values()].slice(0, 5);
}

function extractProduct(text) {
    const t = normalize(text);
    if (t.includes('micropoint')) return 'Micropoint V2';
    if (t.includes('cancela')) return 'Cancela de Baixo Fluxo';
    if (t.includes('idblock') || t.includes('id block')) return 'iDBlock';
    if (t.includes('idface') || t.includes('face')) return 'iDFace';
    if (t.includes('idclass') || t.includes('id class')) return 'iDClass';
    if (t.includes('torniquete')) return 'Torniquete';
    if (t.includes('smart') && t.includes('print')) return 'iDBlock / Micropoint';
    if (t.includes('relogio') || t.includes('relÃ³gio')) return 'Relogio de Ponto';
    if (t === 'ponto' || t.includes('ponto eletronico')) return 'Relogio de Ponto';
    if (t === 'acesso' || t.includes('controle de acesso')) return 'Controle de Acesso';
    return 'Produto nao identificado';
}

function productFromParts(parts) {
    const text = normalize((parts || []).map(item => `${item.code || ''} ${item.description || ''}`).join(' '));
    if (text.includes('catraca')) return 'Catraca / iDBlock';
    if (text.includes('print') && text.includes('point')) return 'iDBlock / Micropoint';
    if (text.includes('relogio') || text.includes('simple')) return 'Relogio de Ponto';
    if (text.includes('torniquete')) return 'Torniquete';
    if (text.includes('face')) return 'iDFace';
    if (text.includes('terminal ceros')) return 'Terminal Ceros';
    return 'Produto nao identificado';
}

function normalizeSpreadsheetRow(row, prices) {
    const tecnicoRaw = firstValue(row, ['tecnico', 'técnico', 'funcionario', 'funcionário', 'nome', 'nome tecnico', 'nome do tecnico']);
    const os = firstValue(row, ['numero os', 'numero o s', 'número os', 'número o s', 'numero o.s.', 'número o.s.', 'os', 'o s', 'codigo os', 'código os']) || row.os || row.OS;
    const clienteRaw = firstValue(row, ['cliente', 'cliente mais critico', 'cliente mais crítico', 'razao social', 'razão social', 'nome cliente', 'empresa']);
    const acao = firstValue(row, ['acao feita', 'ação feita', 'desfecho', 'solucao', 'solução', 'servico executado', 'serviço executado', 'status operacao', 'status operação', 'acao', 'ação', 'ordem compra', 'ordem de compra', 'nextstep', 'next step']);
    const produtoRaw = firstValue(row, ['descricao do produto', 'descrição do produto', 'descricao produto', 'descrição produto', 'produto', 'equipamento', 'modelo']);
    const serialRaw = firstValue(row, ['numero de serie', 'número de série', 'serie', 'série', 'serial', 'numero_serie']);
    const codigoRaw = firstValue(row, ['codigo do produto', 'código do produto', 'codigo produto', 'código produto', 'codigo', 'código', 'codigo_produto']);
    const statusOrcamento = firstValue(row, ['status orcamento', 'status orçamento', 'orcamento', 'orçamento', 'status_orcamento']);
    const data = firstValue(row, ['data operacao', 'data operação', 'data atendimento', 'data_atendimento', 'data', 'dt atendimento']);
    const hasOperationalSignal = Boolean(String(tecnicoRaw || os || clienteRaw || acao || '').trim());
    const tecnico = canonicalTechnician(tecnicoRaw);
    const cliente = cleanMappedValue(clienteRaw);
    const numeroOs = String(os || '').trim() || `LINHA-${Math.random().toString(36).slice(2, 8)}`;
    const searchText = `${acao} ${produtoRaw} ${Object.values(row).join(' ')}`;
    const pecas = findPriceMatches(searchText, prices);
    const faturamento = /garantia|retorno|preventiva|contrato/i.test(searchText) ? 0 : 498;
    const custoPecas = pecas.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    return {
        os_numero: numeroOs,
        data_atendimento: String(data || '').trim(),
        tecnico: cleanMappedValue(tecnico),
        cliente: String(cliente || '').trim(),
        acaoFeita: cleanMappedValue(acao),
        produto: cleanMappedValue(produtoRaw) || cleanMappedValue(extractProduct(searchText)),
        modelo: cleanMappedValue(extractProduct(`${produtoRaw} ${acao}`)),
        codigo_produto: cleanMappedValue(codigoRaw),
        codigo: cleanMappedValue(codigoRaw),
        serial: cleanMappedValue(serialRaw),
        numero_serie: cleanMappedValue(serialRaw),
        serie: cleanMappedValue(serialRaw),
        pecas: pecas.map(item => item.code || item.description),
        pecasDetalhe: pecas,
        classificacao: firstValue(row, ['tipo operacional', 'tipo_operacional', 'tipo servico', 'tipoServico', 'cobertura', 'classificacao', 'classificação']) || (faturamento > 0 ? 'Faturavel' : 'Garantia/Contrato'),
        status_orcamento: cleanMappedValue(statusOrcamento) || 'N/A',
        valorEstimado: faturamento,
        custoPecas,
        deslocamento: DESLOCAMENTO,
        margem: faturamento - (DESLOCAMENTO + custoPecas),
        sourceType: 'spreadsheet',
        sourceFile: row.__sourceFile,
        hasOperationalSignal,
        raw: row
    };
}

function normalizeAuditRow(row, prices) {
    const text = [
        row.acaoFeita,
        row.observacao,
        row.solucao,
        row.modelo,
        row.produto,
        row.classificacao,
        row.truthReason,
        row.businessRule,
        ...(Array.isArray(row.pecas) ? row.pecas : [])
    ].join(' ');
    const pecas = findPriceMatches(text, prices);
    const valor = Number(row.truthValue ?? row.valorEstimado ?? 0) || 0;
    const custoPecas = pecas.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    const inferredProduct = extractProduct(`${row.produto || ''} ${row.modelo || ''} ${text}`);
    const partProduct = productFromParts(pecas);

    return {
        ...row,
        tecnico: canonicalTechnician(row.tecnico),
        produto: cleanMappedValue(inferredProduct !== 'Produto nao identificado' ? inferredProduct : partProduct),
        modelo: cleanMappedValue(inferredProduct !== 'Produto nao identificado' ? inferredProduct : partProduct),
        acaoFeita: cleanMappedValue(row.acaoFeita || row.solucao || row.truthReason || row.businessRule || ''),
        codigo_produto: cleanMappedValue(row.codigo_produto || row.codigoProduto || row.codigo || ''),
        codigo: cleanMappedValue(row.codigo || row.codigo_produto || row.codigoProduto || ''),
        numero_serie: cleanMappedValue(row.numero_serie || row.serie || row.serial || ''),
        serie: cleanMappedValue(row.serie || row.numero_serie || row.serial || ''),
        serial: cleanMappedValue(row.serial || row.numero_serie || row.serie || ''),
        status_orcamento: cleanMappedValue(row.status_orcamento || row.statusOrcamento || row.orcamento || '') || 'N/A',
        pecasDetalhe: pecas,
        custoPecas,
        deslocamento: DESLOCAMENTO,
        margem: valor - (DESLOCAMENTO + custoPecas),
        valorEstimado: valor,
        sourceType: 'auditoria'
    };
}

function countBy(items, selector) {
    const map = new Map();
    for (const item of items) {
        const key = selector(item) || 'Nao identificado';
        map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function buildDadosReaisCampinas() {
    const spreadsheetFiles = await listSpreadsheetFiles();
    const pdfFiles = await listPdfFiles();
    const internalProject = await readInternalProjectRows();
    serverLog('Varredura import/campinas concluida', {
        pasta: IMPORT_CAMPINAS_DIR,
        planilhasEncontradas: spreadsheetFiles.length,
        pdfsEncontrados: pdfFiles.length,
        arquivos: spreadsheetFiles.map(file => file.name),
        pdfs: pdfFiles.map(file => file.name).slice(0, 20),
        basesInternas: internalProject.sources
    });
    const signature = [...spreadsheetFiles, ...pdfFiles]
        .map(file => `${file.name}:${file.size}:${Math.round(file.mtimeMs)}`)
        .sort()
        .join('|') + `|internal:${internalProject.sources.map(item => `${item.source}:${item.rows}`).join(',')}`;

    if (!spreadsheetFiles.length && !pdfFiles.length && !internalProject.rows.length) {
        serverLog('Nenhum arquivo de dados encontrado.', {
            status: 'Aguardando Relatório de Atendimento PDF'
        });
        lastSignature = '';
        cachedPureData = {
            ...EMPTY_PURE_DATA,
            sourceCounts: {
                ...EMPTY_PURE_DATA.sourceCounts,
                dirPath,
                spreadsheetFiles: [],
                pdfFiles: []
            },
            sourceBreakdown: [],
            generatedAt: new Date().toISOString()
        };
        return cachedPureData;
    }

    if (signature && signature === lastSignature && cachedPureData?.ok) {
        return cachedPureData;
    }

    const prices = await loadPriceCatalog();
    const pdfRows = [];
    for (const file of pdfFiles) {
        try {
            const row = await extractPdfRecord(file, prices);
            serverLog('PDF de atendimento importado com sucesso', { arquivo: file.name, os: row.os_numero });
            if (row?.hasOperationalSignal) pdfRows.push(row);
        } catch (err) {
            serverLog('ERRO AO LER PDF DE ATENDIMENTO', {
                arquivo: file.name,
                caminho: file.path,
                motivo: err.message
            });
        }
    }
    if (pdfRows.length) {
        try {
            await fsp.writeFile(AUDITORIA_JSON, JSON.stringify(pdfRows, null, 2), 'utf8');
            serverLog('auditoria.json atualizado pelo motor de PDF', { registros: pdfRows.length });
        } catch (err) {
            serverLog('Falha ao gravar auditoria.json com PDFs', { error: err.message });
        }
    }
    const spreadsheetRowsNested = await Promise.all(spreadsheetFiles.map(async file => {
        try {
            const rows = await readSpreadsheetRows(file);
            serverLog('Arquivo importado com sucesso', { arquivo: file.name, linhas: rows.length });
            return rows;
        } catch (err) {
            serverLog('ERRO AO LER ARQUIVO DE IMPORTACAO', {
                arquivo: file.name,
                caminho: file.path,
                motivo: err.message
            });
            return [];
        }
    }));
    const spreadsheetRows = spreadsheetRowsNested.flat();
    if (spreadsheetFiles.length && !spreadsheetRows.length) {
        serverLog('Planilhas encontradas, mas nenhuma linha valida foi extraida.', {
            arquivos: spreadsheetFiles.map(file => file.name)
        });
    }
    const normalizedSpreadsheet = spreadsheetRows
        .map(row => normalizeSpreadsheetRow(row, prices))
        .filter(item => item.hasOperationalSignal);
    const internalRows = internalProject.rows
        .map(row => normalizeSpreadsheetRow(row, prices))
        .filter(item => item.hasOperationalSignal);
    const auditRows = pdfRows.length ? pdfRows : internalRows;
    const sourceRows = pdfRows.length ? pdfRows : [...internalRows, ...normalizedSpreadsheet];
    const baseMap = new Map();
    for (const item of sourceRows) {
        const key = String(item.os_numero || '').trim() || `${item.sourceFile}:${item.cliente}:${item.tecnico}`;
        baseMap.set(key, item);
    }
    const base = [...baseMap.values()];
    const pdfs = base;
    let mixCorretiva = 0;
    let mixPreventiva = 0;
    let instPonto = 0;
    let instAcesso = 0;

    pdfs.forEach(item => {
        let equip = (item.equipamento || '').toUpperCase();
        let tipo = (item.tipo_servico || '').toUpperCase();

        if(tipo.includes('CORRETIVA')) {
            mixCorretiva++;
        } else if(tipo.includes('PREVENTIVA')) {
            mixPreventiva++;
        } else if(tipo.includes('INSTALA')) {
            // Separação de Ponto e Acesso baseada no nome do equipamento
            if(equip.includes('CATRACA') || equip.includes('TORNIQUETE') || equip.includes('D-REP') || equip.includes('ACESSO') || equip.includes('BLOCK')) {
                instAcesso++;
            } else {
                instPonto++;
            }
        }
    });

    // TRAVA DE SEGURANÇA: Zerando risco falso provisoriamente
    let riscoFaturamento = 0; 
    // Certifique-se de que a chave exportada no JSON de retorno receba 0

    if (base.length === 0) {
        cachedPureData = {
            ok: true,
            root: RAIZ_PROJETO,
            eliteTeam: [],
            sourceCounts: {
                spreadsheetsInCampinas: spreadsheetFiles.length,
                spreadsheetRows: spreadsheetRows.length,
                pdfsInCampinas: pdfFiles.length,
                pdfRows: pdfRows.length,
                auditoriaRows: internalRows.length,
                selectedRows: 0,
                mixCorretiva: mixCorretiva || 0,
                instPonto: instPonto || 0,
                instAcesso: instAcesso || 0,
                mixPreventiva: mixPreventiva || 0,
                pricingItems: prices.length,
                osSource: 'aguardando_extracao_os_dia',
                pureDataRead: false,
                hybridDataRead: true,
                asyncDataFlow: true,
                dirPath,
                spreadsheetFiles: spreadsheetFiles.map(file => file.name),
                pdfFiles: pdfFiles.map(file => file.name),
                restoredStores: internalProject.sources
            },
            mixCorretiva: mixCorretiva || 0,
            instPonto: instPonto || 0,
            instAcesso: instAcesso || 0,
            mixPreventiva: mixPreventiva || 0,
            sourceBreakdown: internalProject.sources,
            records: [],
            technicians: [],
            products: [],
            parts: [],
            expensiveParts: [],
            marketReference: [],
            awards: [],
            productivity: [],
            dre: [],
            status: 'Aguardando Extração de O.S. do Dia',
            generatedAt: new Date().toISOString()
        };
        lastSignature = signature;
        return cachedPureData;
    }

    const technicians = new Map();
    for (const item of base) {
        const name = item.tecnico || '-';
        if (!technicians.has(name)) technicians.set(name, { tecnico: name, total: 0, reincidencias: 0, faturamento: 0, custoPecas: 0, margem: 0 });
        const stat = technicians.get(name);
        stat.total += 1;
        if (item.isRecurrent || /retorno|garantia serv/i.test(item.classificacao || '')) stat.reincidencias += 1;
        stat.faturamento += Number(item.valorEstimado || 0);
        stat.custoPecas += Number(item.custoPecas || 0);
        stat.margem += Number(item.margem || 0);
    }

    const technicianRankingRaw = [...technicians.values()]
        .map(item => ({
            ...item,
            resolvidoPrimeira: item.total ? Math.round(((item.total - item.reincidencias) / item.total) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.total - a.total);
    const technicianRanking = technicianRankingRaw;

    const partRanking = countBy(base.flatMap(item => item.pecasDetalhe || []), item => item.code || item.description)
        .map(([code, total]) => {
            const found = prices.find(item => item.code === code || item.description === code) || {};
            return { code, total, description: sanitizeDisplay(found.description || ''), price: Number(found.price || 0) };
        });
    const expensiveParts = partRanking
        .filter(item => item.code && item.price > 0)
        .sort((a, b) => b.price - a.price)
        .slice(0, 5);
    const faturamentoTotal = base.reduce((sum, item) => sum + Number(item.valorEstimado || 0), 0);
    const productivityRanking = technicianRanking.map(item => ({
        tecnico: item.tecnico,
        totalOs: item.total,
        source: 'relatorio_os'
    }));

    cachedPureData = {
        ok: true,
        root: RAIZ_PROJETO,
        eliteTeam: technicianRanking.map(item => item.tecnico),
        sourceCounts: {
            spreadsheetsInCampinas: spreadsheetFiles.length,
            spreadsheetRows: spreadsheetRows.length,
            pdfsInCampinas: pdfFiles.length,
            pdfRows: pdfRows.length,
            auditoriaRows: auditRows.length,
            selectedRows: base.length,
            mixCorretiva: mixCorretiva || 0,
            instPonto: instPonto || 0,
            instAcesso: instAcesso || 0,
            mixPreventiva: mixPreventiva || 0,
            riscoFaturamento,
            faturamentoTotal,
            pricingItems: prices.length,
            osSource: pdfRows.length ? 'pdf_tagus_tec' : normalizedSpreadsheet.length && internalRows.length ? 'relatorio_os_e_base_interna' : normalizedSpreadsheet.length ? 'relatorio_os' : 'base_interna_restaurada',
            pureDataRead: false,
            hybridDataRead: true,
            asyncDataFlow: true,
            dirPath,
            spreadsheetFiles: spreadsheetFiles.map(file => file.name),
            pdfFiles: pdfFiles.map(file => file.name),
            restoredStores: internalProject.sources
        },
        mixCorretiva: mixCorretiva || 0,
        instPonto: instPonto || 0,
        instAcesso: instAcesso || 0,
        mixPreventiva: mixPreventiva || 0,
        riscoFaturamento,
        faturamentoTotal,
        sourceBreakdown: internalProject.sources,
        records: base,
        technicians: technicianRanking,
        products: countBy(base, item => item.produto || item.modelo)
            .map(([name, total]) => ({ name: sanitizeDisplay(name), total }))
            .sort((a, b) => {
                const au = /nao identificado/i.test(a.name) ? 1 : 0;
                const bu = /nao identificado/i.test(b.name) ? 1 : 0;
                return au - bu || b.total - a.total;
            }),
        parts: partRanking,
        expensiveParts,
        marketReference: MARKET_REFERENCE_ABRIL,
        awards: [],
        productivity: productivityRanking,
        dre: base.slice(0, 80).map(item => ({
            os_numero: item.os_numero,
            tecnico: item.tecnico,
            cliente: item.cliente,
            produto: sanitizeDisplay(item.produto || item.modelo),
            valorEstimado: Number(item.valorEstimado || 0),
            custoPecas: Number(item.custoPecas || 0),
            deslocamento: DESLOCAMENTO,
            margem: Number(item.margem || 0),
            pecas: (item.pecasDetalhe || []).map(part => ({ ...part, description: sanitizeDisplay(part.description) }))
        })),
        status: 'OK',
        generatedAt: new Date().toISOString()
    };
    lastSignature = signature;
    return cachedPureData;
}

function refreshInBackground() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = buildDadosReaisCampinas()
        .catch(err => {
            cachedPureData = {
                ...cachedPureData,
                ok: false,
                error: err.message || 'Falha ao processar importacao pura.',
                generatedAt: new Date().toISOString()
            };
            return cachedPureData;
        })
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
}

async function obterDadosReaisCampinas(options = {}) {
    if (options.wait === true) return refreshInBackground();
    refreshInBackground();
    return cachedPureData;
}

module.exports = {
    obterDadosReaisCampinas,
    dirPath
};

