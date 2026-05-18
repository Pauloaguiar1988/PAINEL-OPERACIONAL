const fs = require('fs');
const path = require('path');

console.log("🛠️  CODEX MASTER SYNC V2: LIMPANDO BAGUNÇA E TRAVANDO VALORES OFICIAIS");

// 1. Carregar Configurações de Preços Reais
const pricingConfig = JSON.parse(fs.readFileSync(path.join('data', 'pricing-config.json'), 'utf8'));
const VALOR_BASE = pricingConfig.campinas.primeiraHora; // 217
const VALOR_DESLOCAMENTO = pricingConfig.campinas.deslocamento; // 281

// 2. Refatorar o Motor de IA (src/services/aiService.js)
const aiServiceDefinitivo = `const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const aiService = {
    async analisarOS(dados) {
        const eGarantia = dados?.garantia === true || /garantia|retorno/i.test(String(dados?.descricao || ''));
        return {
            status: 'Processado',
            os_numero: dados?.os_numero || dados?.os || 'S/N',
            tecnico: dados?.tecnico || 'Técnico',
            cliente: dados?.cliente || 'Cliente',
            classificacao: eGarantia ? 'Garantia' : 'Faturável',
            valorEstimado: eGarantia ? 0 : ${VALOR_BASE + VALOR_DESLOCAMENTO},
            causaProvavel: eGarantia ? 'Garantia/Retorno' : 'Atendimento Faturável',
            dataAnalise: new Date().toISOString()
        };
    },

    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        let texto = '';
        try {
            const data = await parser.getText();
            texto = String(data.text || '').replace(/\\s+/g, ' ');
        } finally {
            await parser.destroy();
        }

        // Extração Direta e Limpa
        const os = filePath.match(/V\\d+/)?.[0] || 'S/N';
        const eGarantia = texto.includes('Garantia') || texto.includes('Retorno') || texto.includes('RETORNO');
        
        // Regra de Negócio Tagus-Tec: Se não é garantia, soma Base + Deslocamento
        let valorTotal = 0;
        let classificacao = 'Garantia';
        
        if (!eGarantia) {
            valorTotal = ${VALOR_BASE} + ${VALOR_DESLOCAMENTO};
            classificacao = 'Faturável';
        }

        return {
            os_numero: os,
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'Técnico',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 30) || 'Cliente',
            classificacao: classificacao,
            valorEstimado: valorTotal,
            faturamento: {
                valorEstimadoCatalogo: valorTotal,
                valorLogistica: classificacao === 'Faturável' ? ${VALOR_DESLOCAMENTO} : 0,
                valorHoraInicial: classificacao === 'Faturável' ? ${VALOR_BASE} : 0
            },
            dataAnalise: new Date().toISOString()
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceDefinitivo);

// 3. Limpar app.js e focar no visual certeiro
const appJsConsolidado = `
async function cockpitSyncV2() {
    console.log("🚀 Sincronizando Cockpit com Valores Oficiais...");
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();

    // Cálculos Reais
    const faturaveis = dados.filter(d => d.classificacao === 'Faturável');
    const totalR$ = faturaveis.reduce((acc, curr) => acc + (curr.valorEstimado || 0), 0);

    // Atualização Visual (IDs mapeados pela Sonda)
    if (document.getElementById('gmOsTotal')) document.getElementById('gmOsTotal').innerText = dados.length;
    if (document.getElementById('gmOsFaturamento')) document.getElementById('gmOsFaturamento').innerText = faturaveis.length;
    if (document.getElementById('gmOsRiscoEstimado')) {
        document.getElementById('gmOsRiscoEstimado').innerText = 'R$ ' + totalR$.toLocaleString('pt-BR');
        document.getElementById('gmOsRiscoEstimado').style.color = '#10b981';
    }

    // Grid de Operação
    const grid = document.querySelector('#gm-main-table tbody');
    if (grid) {
        grid.innerHTML = dados.slice(-15).reverse().map(os => \`
            <tr>
                <td>\${os.os_numero}</td>
                <td>\${os.tecnico}</td>
                <td>\${os.classificacao}</td>
                <td>R$ \${(os.valorEstimado || 0).toFixed(2)}</td>
            </tr>
        \`).join('');
    }
}
window.addEventListener('load', cockpitSyncV2);
setInterval(cockpitSyncV2, 10000);
`;

fs.writeFileSync('app.js', appJsConsolidado);

// 4. Sanear auditoria.json: remover duplicados e recalcular valores oficiais
const auditPath = path.join('data', 'auditoria.json');
if (fs.existsSync(auditPath)) {
    const linhas = fs.readFileSync(auditPath, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const vistos = new Set();
    const saneados = [];

    for (const linha of linhas) {
        try {
            const item = JSON.parse(linha);
            const osNumero = String(item.os_numero || item.os || item.OS || '').trim();
            const tecnico = String(item.tecnico || '').trim();
            const classificacaoRaw = String(item.classificacao || '').trim();
            const classificacaoNorm = classificacaoRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const isGarantia = classificacaoNorm.includes('garantia');
            const isFaturavel = !isGarantia;
            const classificacao = isGarantia ? 'Garantia' : 'Faturável';
            const valorEstimado = isFaturavel ? VALOR_BASE + VALOR_DESLOCAMENTO : 0;
            const key = osNumero && osNumero !== 'S/N'
                ? `os:${osNumero}`
                : `raw:${tecnico}|${classificacao}|${String(item.dataAnalise || '').slice(0, 19)}|${String(item.arquivoOrigem || '')}`;

            if (vistos.has(key)) continue;
            vistos.add(key);

            saneados.push({
                ...item,
                os_numero: osNumero || item.os_numero || 'S/N',
                classificacao,
                valorEstimado,
                faturamento: {
                    ...(item.faturamento || {}),
                    valorEstimadoCatalogo: valorEstimado,
                    valorLogistica: isFaturavel ? VALOR_DESLOCAMENTO : 0,
                    valorHoraInicial: isFaturavel ? VALOR_BASE : 0
                }
            });
        } catch (_) {}
    }

    fs.writeFileSync(auditPath, saneados.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
    console.log(`🧹 Auditoria saneada: ${linhas.length} -> ${saneados.length} registros.`);
}

console.log("✅ Sistema recalibrado com pricing-config.json.");
console.log("👉 AGORA: Reinicie o servidor 'node server.js' e veja a mágica dos valores reais.");
