const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const INPUT_FOLDER = path.join(__dirname, 'data', 'import', 'campinas');
const OUTPUT_FILE = path.join(__dirname, 'data', 'auditoria.json');

function limparTexto(valor, limite = 80) {
    return String(valor || '')
        .replace(/\s+/g, ' ')
        .replace(/[|]+/g, ' ')
        .trim()
        .substring(0, limite);
}

function primeiroNomeTecnico(valor) {
    const limpo = limparTexto(valor, 80)
        .replace(/[^a-zA-ZÀ-ÿ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return (limpo.split(' ')[0] || 'TECNICO').toUpperCase();
}

function matchPrimeiro(texto, patterns) {
    for (const pattern of patterns) {
        const found = texto.match(pattern);
        if (found && found[1]) return found[1];
    }
    return null;
}

function extrairPecas(texto) {
    return Array.from(new Set(texto.match(/\b[SC]\d{5,10}[A-Z]?\b/g) || []));
}

function detectarGarantia(texto) {
    const linhas = texto.split(/\r?\n/).map(linha => linha.trim()).filter(Boolean);
    const camposDecisivos = linhas.filter(linha => {
        return /Informa[cç][aã]o Atendimento|Tipo de atendimento|Classifica[cç][aã]o de atendimento|Natureza|Motivo|Atendimento/i.test(linha)
            && !/Data de garantia/i.test(linha);
    }).join(' ');

    if (/GARANTIA|RETORNO|SEM\s+[ÔO]NUS/i.test(camposDecisivos)) return true;
    if (/\bRETORNO\b|\bREINCID[ÊE]NCIA\b|SEM\s+[ÔO]NUS/i.test(texto)) return true;

    return false;
}

function extrairCausa(textoNormalizado) {
    if (/rede|comunica[cç][aã]o|gateway|ip|dns|vpn|firewall|internet|conex[aã]o/i.test(textoNormalizado)) {
        return 'falha_comunicacao';
    }

    if (/operador|senha|credencial|cadastro|usuario|usu[aá]rio|configura/i.test(textoNormalizado)) {
        return 'erro_operacional';
    }

    return 'falha_hardware';
}

function calcularRecomendacao(causa, pecas, textoNormalizado, recorrente) {
    if (causa === 'falha_comunicacao') return 'Checklist de Rede';
    if (pecas.length > 0) return 'Preparar peca para substituicao';
    if (/placa|hardware|defeito/i.test(textoNormalizado)) return 'Acionamento de Laboratorio';
    if (/travamento|firmware/i.test(textoNormalizado)) return 'Realizar update de firmware preventivo';
    if (recorrente) return 'Auditar recorrencia antes de novo deslocamento';
    return 'Manter monitoramento padrao';
}

function calcularRisco(os) {
    let score = 0;
    if (os.isRecurrent) score += 35;
    if (os.classificacao === 'Garantia') score += 20;
    if ((os.pecas || []).length > 0) score += 20;
    if (os.probableCause === 'falha_comunicacao' && os.isRecurrent) score += 20;
    if (String(os.os_numero || '').includes('V69')) score += 10;

    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

async function parsePdf(filePath) {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });

    try {
        const data = await parser.getText();
        return data.text || '';
    } finally {
        await parser.destroy();
    }
}

async function correcaoProfunda() {
    console.log('RECONSTRUINDO EXTRACAO DE DADOS (ERRO ZERO)...');

    if (!fs.existsSync(INPUT_FOLDER)) {
        throw new Error(`Pasta nao encontrada: ${INPUT_FOLDER}`);
    }

    const arquivos = fs.readdirSync(INPUT_FOLDER).filter(f => f.toLowerCase().endsWith('.pdf'));
    let baseCorrigida = [];

    for (const file of arquivos) {
        try {
            const filePath = path.join(INPUT_FOLDER, file);
            const texto = await parsePdf(filePath);
            const textoPlano = texto.replace(/\s+/g, ' ');

            let cliente = matchPrimeiro(texto, [
                /Nome do Cliente:\s*([\s\S]*?)(?=Endere[cç]o|CNPJ|CPF|Equipamento|T[eé]cnico|Contrato|Problema|$)/i,
                /Raz[aã]o Social:\s*([\s\S]*?)(?=CNPJ|CPF|Endere[cç]o|Equipamento|T[eé]cnico|$)/i,
                /Cliente:\s*([\s\S]*?)(?=Endere[cç]o|CNPJ|CPF|Equipamento|T[eé]cnico|Contrato|Problema|$)/i
            ]) || 'CLIENTE NAO IDENTIFICADO';
            cliente = limparTexto(cliente, 60).toUpperCase();

            let tecnico = matchPrimeiro(texto, [
                /Nome do T[eé]cnico:\s*([^\n\r]*)/i,
                /T[eé]cnico:\s*([^\n\r]*)/i
            ]) || 'TECNICO NAO IDENTIFICADO';
            tecnico = primeiroNomeTecnico(tecnico);

            const os = (textoPlano.match(/V\d{5,}/i) || file.match(/V\d+/i) || [file])[0].toUpperCase();
            const eGarantia = detectarGarantia(texto);
            const serial = limparTexto(matchPrimeiro(texto, [
                /N[°º]?\s*de\s*S[eé]rie:\s*([^\n\r]*)/i,
                /S[eé]rie:\s*([^\n\r]*)/i,
                /Serial:\s*([^\n\r]*)/i
            ]) || 'S/N', 60);
            const modelo = limparTexto(matchPrimeiro(texto, [
                /Equipamento:\s*([^\n\r]*)/i,
                /Modelo:\s*([^\n\r]*)/i
            ]) || 'EQUIP.', 40);
            const pecas = extrairPecas(textoPlano);
            const probableCause = extrairCausa(textoPlano);

            baseCorrigida.push({
                os_numero: os,
                tecnico,
                cliente,
                classificacao: eGarantia ? 'Garantia' : 'Faturável',
                valorEstimado: eGarantia ? 281 : 498,
                serial,
                modelo,
                pecas,
                probableCause,
                dataAnalise: new Date().toISOString(),
                sourceFile: file
            });

            process.stdout.write('#');
        } catch (err) {
            console.error(`\nFalha grave no arquivo ${file}: ${err.message}`);
        }
    }

    baseCorrigida = Array.from(new Map(baseCorrigida.map(item => [item.os_numero, item])).values());

    const serialCount = {};
    baseCorrigida.forEach(os => {
        if (os.serial && os.serial !== 'S/N') {
            serialCount[os.serial] = (serialCount[os.serial] || 0) + 1;
        }
    });

    baseCorrigida = baseCorrigida.map(os => {
        const recurrenceCount = os.serial && os.serial !== 'S/N' ? serialCount[os.serial] || 1 : 1;
        const isRecurrent = recurrenceCount > 1 || os.classificacao === 'Garantia';
        const enriched = {
            ...os,
            recurrenceCount,
            isRecurrent
        };

        enriched.riskLevel = calcularRisco(enriched);
        enriched.recommendation = calcularRecomendacao(enriched.probableCause, enriched.pecas, `${enriched.modelo} ${enriched.cliente}`, isRecurrent);
        enriched.confidence = enriched.cliente === 'CLIENTE NAO IDENTIFICADO' || enriched.tecnico === 'TECNICO' ? 75 : 92;
        enriched.billingRecommendation = enriched.classificacao === 'Garantia' ? 'nao_cobrar_mao_de_obra' : 'faturar_total';
        enriched.taxonomyMatch = true;

        return enriched;
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseCorrigida, null, 2), 'utf8');

    const naoIdentificados = baseCorrigida.filter(item => item.cliente === 'CLIENTE NAO IDENTIFICADO' || item.tecnico === 'TECNICO').length;
    const faturamento = baseCorrigida.reduce((acc, item) => acc + Number(item.valorEstimado || 0), 0);

    console.log('\n\nSANEAMENTO CONCLUIDO!');
    console.log(`Registros Processados: ${baseCorrigida.length}`);
    console.log(`Registros com cliente/tecnico pendente: ${naoIdentificados}`);
    console.log(`Faturamento recalculado: R$ ${faturamento.toLocaleString('pt-BR')}`);
    console.log('Agora os nomes devem aparecer limpos no painel.');
}

correcaoProfunda().catch(err => {
    console.error('Falha no saneamento:', err.message);
    process.exit(1);
});
