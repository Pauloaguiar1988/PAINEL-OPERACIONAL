require('dotenv').config();

const fs = require('fs');
const path = require('path');
const aiService = require('./src/services/aiService');
const dataService = require('./src/services/dataService');

console.log("📥 INICIANDO IMPORTAÇÃO DE O.S. PARA O PAINEL...");

function readJsonSafe(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim();
    if (!raw) return null;
    return JSON.parse(raw);
}

function normalizeOsPayload(item, sourceFile) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

    const descricao = item.descricao || item.description || item.observacao || item.laudo || item.historico || item.texto || '';
    const osNumero = item.os_numero || item.numero_os || item.os || item.OS || item.ticket || item.id || '';
    const tecnico = item.tecnico || item.technician || item.responsavel || item.owner || 'N/A';

    const looksLikeOs = Boolean(descricao || osNumero || item.garantia !== undefined || item.mauUso !== undefined);
    if (!looksLikeOs) return null;

    return {
        ...item,
        arquivoOrigem: sourceFile,
        descricao: String(descricao || sourceFile),
        os_numero: String(osNumero || sourceFile),
        tecnico: String(tecnico || 'N/A')
    };
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

function readCsvSafe(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines.shift() || '').map(h => h.trim());

    return lines.map(line => {
        const values = parseCsvLine(line);
        return headers.reduce((acc, header, index) => {
            if (header) acc[header] = values[index] || '';
            return acc;
        }, {});
    });
}

async function importarBase() {
    const pastaOrigem = path.join(__dirname, 'data');

    if (!fs.existsSync(pastaOrigem)) {
        console.log("❌ Erro: Pasta 'data' não encontrada.");
        return;
    }

    const arquivos = fs.readdirSync(pastaOrigem)
        .filter(f => /\.(json|csv)$/i.test(f) && f !== 'auditoria.json');

    if (arquivos.length === 0) {
        console.log("⚠️ Nenhuma O.S. nova encontrada para processar.");
        return;
    }

    let processadas = 0;
    let ignoradas = 0;

    for (const arquivo of arquivos) {
        const filePath = path.join(pastaOrigem, arquivo);

        try {
            const ext = path.extname(arquivo).toLowerCase();
            const entradas = ext === '.csv' ? readCsvSafe(filePath) : [readJsonSafe(filePath)];

            for (const entrada of entradas) {
                const conteudo = normalizeOsPayload(entrada, arquivo);
                if (!conteudo) {
                    ignoradas += 1;
                    continue;
                }

                const analise = await aiService.analisarOS(conteudo);

                await dataService.salvarAuditoria({
                    ...conteudo,
                    ...analise
                });

                processadas += 1;
                console.log(`✅ O.S. ${arquivo} processada e integrada.`);
            }
        } catch (err) {
            ignoradas += 1;
            console.log(`⚠️ O.S. ${arquivo} ignorada: ${err.message}`);
        }
    }

    console.log(`\n🎯 Importação concluída. Processadas: ${processadas}. Ignoradas: ${ignoradas}.`);
}

importarBase();
