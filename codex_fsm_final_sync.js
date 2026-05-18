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

function primeiroNome(valor) {
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

function extrairDataAtendimento(texto) {
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const camposPreferidos = linhas.find(l => /In[ií]cio|Abertura|Data OS|Data da OS|Atendimento|Emiss[aã]o/i.test(l));
    const dataPreferida = camposPreferidos && camposPreferidos.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    if (dataPreferida) return dataPreferida[0];

    const primeiraData = texto.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    return primeiraData ? primeiraData[0] : '01/01/2026';
}

function extrairDataCompra(texto) {
    return matchPrimeiro(texto, [
        /Data de Compra\.?:\s*(\d{2}\/\d{2}\/\d{4})/i,
        /Data da Compra\.?:\s*(\d{2}\/\d{2}\/\d{4})/i,
        /Nota Fiscal de Compra[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i
    ]);
}

function extrairPecas(textoPlano) {
    return Array.from(new Set(textoPlano.match(/\b[SC]\d{5,10}[A-Z]?\b/g) || []));
}

function extrairCausa(textoPlano) {
    if (/rede|comunica[cç][aã]o|gateway|ip|dns|vpn|firewall|internet|conex[aã]o/i.test(textoPlano)) {
        return 'falha_comunicacao';
    }

    if (/operador|senha|credencial|cadastro|usuario|usu[aá]rio|configura/i.test(textoPlano)) {
        return 'erro_operacional';
    }

    return 'falha_hardware';
}

function classificarCobranca(texto, textoPlano) {
    const dataCompra = extrairDataCompra(texto);
    const eFabrica = /Garantia de F[aá]brica|Garantia Fabricante|Cobertura de Pe[cç]as:\s*Total/i.test(textoPlano);
    const eRetorno = /\bRetorno\b|\bReincid[êe]ncia\b|Garantia de Instala[cç][aã]o|GARANTIA DE INSTALACAO|Sem\s+[ÔO]nus/i.test(textoPlano);

    if (eFabrica || dataCompra) {
        return {
            classificacao: 'Garantia Fábrica',
            valorEstimado: 281,
            isRecurrent: false,
            billingRecommendation: 'cobrar_deslocamento_garantia_fabrica'
        };
    }

    if (eRetorno) {
        return {
            classificacao: 'Garantia Serviço',
            valorEstimado: 0,
            isRecurrent: true,
            billingRecommendation: 'nao_faturar_retrabalho'
        };
    }

    return {
        classificacao: 'Faturável',
        valorEstimado: 498,
        isRecurrent: false,
        billingRecommendation: 'faturar_total'
    };
}

function calcularRisco(os) {
    let score = 0;
    if (os.isRecurrent) score += 45;
    if (os.classificacao === 'Garantia Serviço') score += 20;
    if ((os.pecas || []).length > 0) score += 20;
    if (os.probableCause === 'falha_comunicacao' && os.isRecurrent) score += 20;
    if (String(os.os_numero || '').includes('V69')) score += 10;

    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

function recomendar(os) {
    if (os.classificacao === 'Garantia Serviço') return 'Auditar retrabalho antes de novo deslocamento';
    if (os.probableCause === 'falha_comunicacao') return 'Nao enviar tecnico antes do checklist de rede';
    if ((os.pecas || []).length > 0) return 'Preparar peca para substituicao';
    if (os.probableCause === 'falha_hardware') return 'Checklist tecnico de hardware';
    return 'Manter monitoramento padrao';
}

async function parsePdf(filePath) {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
        const data = await parser.getText();
        return data.text || '';
    } finally {
        await parser.destroy();
    }
}

async function sincronizacaoDefinitiva() {
    console.log('INICIANDO SINCRONIZACAO DE CAMPOS E DATAS...');

    if (!fs.existsSync(INPUT_FOLDER)) {
        throw new Error(`Pasta nao encontrada: ${INPUT_FOLDER}`);
    }

    const arquivos = fs.readdirSync(INPUT_FOLDER).filter(f => f.toLowerCase().endsWith('.pdf'));
    let baseFSM = [];

    for (const file of arquivos) {
        try {
            const texto = await parsePdf(path.join(INPUT_FOLDER, file));
            const textoPlano = texto.replace(/\s+/g, ' ');
            const cobranca = classificarCobranca(texto, textoPlano);
            const pecas = extrairPecas(textoPlano);
            const probableCause = extrairCausa(textoPlano);

            const os = (textoPlano.match(/V\d{5,}/i) || file.match(/V\d+/i) || [file])[0].toUpperCase();
            const cliente = limparTexto(matchPrimeiro(texto, [
                /Nome do Cliente:\s*([\s\S]*?)(?=Endere[cç]o|CNPJ|CPF|Equipamento|T[eé]cnico|Contrato|Problema|$)/i,
                /Raz[aã]o Social:\s*([\s\S]*?)(?=CNPJ|CPF|Endere[cç]o|Equipamento|T[eé]cnico|$)/i,
                /Cliente:\s*([\s\S]*?)(?=Endere[cç]o|CNPJ|CPF|Equipamento|T[eé]cnico|Contrato|Problema|$)/i
            ]) || 'CLIENTE NAO IDENTIFICADO', 60).toUpperCase();

            const tecnico = primeiroNome(matchPrimeiro(texto, [
                /Nome do T[eé]cnico:\s*([^\n\r]*)/i,
                /T[eé]cnico:\s*([^\n\r]*)/i
            ]) || 'TECNICO NAO IDENTIFICADO');

            const serial = limparTexto(matchPrimeiro(texto, [
                /N[°º]?\s*de\s*S[eé]rie:\s*([^\n\r]*)/i,
                /S[eé]rie:\s*([^\n\r]*)/i,
                /Serial:\s*([^\n\r]*)/i
            ]) || 'S/N', 60);

            const modelo = limparTexto(matchPrimeiro(texto, [
                /Equipamento:\s*([^\n\r]*)/i,
                /Modelo:\s*([^\n\r]*)/i
            ]) || 'EQUIP.', 40);

            const item = {
                os_numero: os,
                data_atendimento: extrairDataAtendimento(texto),
                data_compra: extrairDataCompra(texto) || null,
                tecnico,
                cliente,
                serial,
                modelo,
                pecas,
                probableCause,
                ...cobranca,
                dataAnalise: new Date().toISOString(),
                sourceFile: file,
                taxonomyMatch: true
            };

            item.riskLevel = calcularRisco(item);
            item.recommendation = recomendar(item);
            item.confidence = cliente === 'CLIENTE NAO IDENTIFICADO' || tecnico === 'TECNICO' ? 75 : 93;

            baseFSM.push(item);
            process.stdout.write('#');
        } catch (err) {
            console.error(`\nFalha no arquivo ${file}: ${err.message}`);
        }
    }

    baseFSM = Array.from(new Map(baseFSM.map(item => [item.os_numero, item])).values());

    const serialCount = {};
    baseFSM.forEach(item => {
        if (item.serial && item.serial !== 'S/N') {
            serialCount[item.serial] = (serialCount[item.serial] || 0) + 1;
        }
    });

    baseFSM = baseFSM.map(item => {
        const recurrenceCount = item.serial && item.serial !== 'S/N' ? serialCount[item.serial] || 1 : 1;
        const isRecurrent = item.isRecurrent || item.classificacao === 'Garantia Serviço';
        const enriched = { ...item, recurrenceCount, isRecurrent };
        enriched.riskLevel = calcularRisco(enriched);
        enriched.recommendation = recomendar(enriched);
        return enriched;
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseFSM, null, 2), 'utf8');

    const resumo = baseFSM.reduce((acc, item) => {
        acc[item.classificacao] = (acc[item.classificacao] || 0) + 1;
        return acc;
    }, {});
    const faturamento = baseFSM.reduce((acc, item) => acc + Number(item.valorEstimado || 0), 0);
    const perda = baseFSM.filter(item => item.isRecurrent).length * 281;

    console.log('\n\nSINCRONIA CONCLUIDA!');
    console.log(`Registros processados: ${baseFSM.length}`);
    console.log(`Resumo classificacao: ${JSON.stringify(resumo)}`);
    console.log(`Faturamento estimado: R$ ${faturamento.toLocaleString('pt-BR')}`);
    console.log(`Perda operacional estimada: R$ ${perda.toLocaleString('pt-BR')}`);
    console.log('Dados de Garantia, Retorno, Data e Tipo sincronizados no auditoria.json.');
}

sincronizacaoDefinitiva().catch(err => {
    console.error('Falha na sincronizacao definitiva:', err.message);
    process.exit(1);
});
