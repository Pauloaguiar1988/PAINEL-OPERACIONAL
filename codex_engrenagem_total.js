const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

// CONFIGURAÇÃO DE CAMINHOS - PADRÃO PAULO AGUIAR
const INPUT_FOLDER = path.join(__dirname, 'data', 'import', 'campinas');
const OUTPUT_FILE = path.join(__dirname, 'data', 'auditoria.json');

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

function extrairLaudo(texto) {
    return {
        defeito: extrairCampo(texto, [
            /Defeito:\s*([^]+?)(?:\s+Causa:|\s+Solu[cç][aã]o:|\s+Observa[cç][aã]o:|$)/i,
            /Observa[cç][aã]o:\s*([^]+?)(?:\s+Solicitar chamado|\s+Servi[cç]o Finalizado|$)/i
        ], '').substring(0, 500),
        causa: extrairCampo(texto, [
            /Causa:\s*([^]+?)(?:\s+Solu[cç][aã]o:|\s+A[cç][aã]o:|$)/i,
            /Causa raiz:\s*([^]+?)(?:\s+Solu[cç][aã]o:|\s+A[cç][aã]o:|$)/i
        ], '').substring(0, 300),
        solucao: extrairCampo(texto, [
            /Solu[cç][aã]o:\s*([^]+?)(?:\s+Dados do Representante|\s+Assinatura:|$)/i,
            /A[cç][aã]o executada:\s*([^]+?)(?:\s+Dados do Representante|\s+Assinatura:|$)/i
        ], '').substring(0, 500)
    };
}

async function ligarEngrenagem() {
    console.log("⚙️  CODEX ENGINE: INICIANDO PROCESSAMENTO DE MASSA...");

    if (!fs.existsSync(INPUT_FOLDER)) {
        console.error("❌ Erro: Pasta 'data/import/campinas' não encontrada!");
        return;
    }

    const arquivos = fs.readdirSync(INPUT_FOLDER).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`📂 Detectados ${arquivos.length} documentos para análise. Vamos subir tudo.`);

    let db_final = [];
    let contadores = { faturavel: 0, garantia: 0, erros: 0 };

    for (const file of arquivos) {
        try {
            const buffer = fs.readFileSync(path.join(INPUT_FOLDER, file));
            const parser = new PDFParse({ data: buffer });
            let texto = '';
            try {
                const pdfData = await parser.getText();
                texto = String(pdfData.text || '').replace(/\s+/g, ' ');
            } finally {
                await parser.destroy();
            }

            // Identificação de OS
            const os = texto.match(/OS:\s*(V\d+)/)?.[1] || file.match(/V\d+/)?.[0] || file;
            
            // Lógica de Classificação (Garantia vs Faturável)
            const eGarantia = texto.includes('Garantia') || texto.includes('RETORNO') || texto.includes('Retorno');
            
            // Valores da Tabela Oficial Campinas
            const deslocamento = 281.00;
            const primeiraHora = eGarantia ? 0.00 : 217.00;
            const valorTotal = deslocamento + primeiraHora;
            const ativo = extrairAtivo(texto);
            const laudo = extrairLaudo(texto);

            if(eGarantia) contadores.garantia++; else contadores.faturavel++;

            db_final.push({
                os_numero: os,
                tecnico: extrairCampo(texto, [/T[eé]cnico:\s*([^]+?)(?:\s+T[eé]rmino:|\s+Dados do Atendimento|$)/i], 'TECNICO').split(' ')[0],
                cliente: extrairCampo(texto, [/Cliente:\s*([^]+?)(?:\s+Endere[cç]o:|\s+In[ií]cio:|$)/i], 'CLIENTE').substring(0, 50),
                classificacao: eGarantia ? 'Garantia' : 'Faturável',
                valorEstimado: valorTotal,
                deslocamento,
                maoDeObra: primeiraHora,
                faturamento: {
                    valorEstimadoCatalogo: valorTotal,
                    valorLogistica: deslocamento,
                    valorHoraInicial: primeiraHora
                },
                serial: ativo.serial,
                modelo: ativo.modelo,
                ...laudo,
                dataAnalise: new Date().toISOString()
            });

            process.stdout.write("▓"); // Progresso visual
        } catch (err) {
            contadores.erros++;
            console.error(`\n❌ Falha no arquivo ${file}: `, err.message);
        }
    }

    // REMOVER DUPLICADAS (Garantir que a mesma OS não conte duas vezes)
    const uniqueDB = Array.from(new Map(db_final.map(item => [item.os_numero, item])).values());

    // GRAVAR NO BANCO
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueDB, null, 2));

    const faturamentoTotal = uniqueDB.reduce((acc, curr) => acc + curr.valorEstimado, 0);

    console.log("\n\n✅ ENGRENAGEM CONCLUÍDA COM SUCESSO!");
    console.log("-------------------------------------------");
    console.log(`📊 Arquivos Lidos: ${arquivos.length}`);
    console.log(`🎯 Registros no BI: ${uniqueDB.length}`);
    console.log(`💰 Faturamento Consolidado: R$ ${faturamentoTotal.toLocaleString('pt-BR')}`);
    console.log(`⚠️ Erros de leitura: ${contadores.erros}`);
    console.log("-------------------------------------------");
    console.log("👉 Reinicie o servidor 'node server.js' e abra o painel.");
}

ligarEngrenagem();
