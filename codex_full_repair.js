const fs = require('fs');
const path = require('path');

console.log("🚀 CODEX REPAIR: ATIVANDO FINANCEIRO REAL E TODAS AS ABAS...");

// 1. RECALIBRAR REGRAS NO AI SERVICE
const aiServiceContent = `const fs = require('fs');
const PDFParse = require('pdf-parse');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await PDFParse(dataBuffer);
        const texto = data.text.replace(/\\s+/g, ' ');

        const os = filePath.match(/V\\d+/)?.[0] || 'S/N';
        const eGarantia = texto.includes('Garantia') || texto.includes('Retorno');
        
        // REGRA DEFINITIVA PAULO AGUIAR
        const deslocamento = 281.00;
        const primeiraHora = eGarantia ? 0.00 : 217.00;
        const valorTotal = deslocamento + primeiraHora;

        return {
            os_numero: os,
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'Técnico',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 25) || 'Cliente',
            classificacao: eGarantia ? 'Garantia' : 'Faturável',
            valorEstimado: valorTotal,
            deslocamento: deslocamento,
            maoDeObra: primeiraHora,
            dataAnalise: new Date().toISOString()
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceContent);

// 2. RECONSTRUIR APP.JS PARA ALIMENTAR TODAS AS ABAS (MAPA DA SONDA)
const appJsContent = `
async function cockpitIntegralSync() {
    console.log("📡 Codex: Sincronizando todos os blocos visuais...");
    try {
        const res = await fetch('/api/dashboard/tabela');
        const dados = await res.json();

        // 1. FINANCEIRO E CARDS PRINCIPAIS
        const totalR$ = dados.reduce((acc, curr) => acc + (curr.valorEstimado || 0), 0);
        if(document.getElementById('gmOsTotal')) document.getElementById('gmOsTotal').innerText = dados.length;
        if(document.getElementById('gmOsRiscoEstimado')) {
            document.getElementById('gmOsRiscoEstimado').innerText = 'R$ ' + totalR$.toLocaleString('pt-BR');
        }

        // 2. ABA OPERAÇÃO (GRID PRINCIPAL)
        const gridOp = document.querySelector('#gm-main-table tbody');
        if (gridOp) {
            gridOp.innerHTML = dados.slice(-20).reverse().map(os => \`
                <tr>
                    <td>\${os.os_numero}</td>
                    <td>\${os.tecnico}</td>
                    <td>\${os.classificacao}</td>
                    <td>R$ \${os.valorEstimado.toFixed(2)}</td>
                </tr>
            \`).join('');
        }

        // 3. ABA TÉCNICOS (RANKING)
        const gridTec = document.querySelector('#tabela-tecnicos tbody');
        if (gridTec) {
            const rank = dados.reduce((acc, curr) => {
                acc[curr.tecnico] = (acc[curr.tecnico] || 0) + curr.valorEstimado;
                return acc;
            }, {});
            gridTec.innerHTML = Object.entries(rank).sort((a,b) => b[1]-a[1]).map(([tec, val]) => \`
                <tr><td>\${tec}</td><td>R$ \${val.toFixed(2)}</td></tr>
            \`).join('');
        }

        // 4. ABA CLIENTES
        const gridCli = document.querySelector('#tabela-clientes tbody');
        if (gridCli) {
            const clis = [...new Set(dados.map(d => d.cliente))];
            gridCli.innerHTML = clis.slice(0,10).map(c => \`<tr><td>\${c}</td><td>Ativo</td></tr>\`).join('');
        }

    } catch (e) { console.error("Erro na carga integral:", e); }
}
window.addEventListener('load', cockpitIntegralSync);
setInterval(cockpitIntegralSync, 20000);
`;

fs.writeFileSync('app.js', appJsContent);

console.log("✅ Sistema Reconstruído. Agora Garantia soma R$ 281 e todas as abas têm dados.");
console.log("👉 REINICIE: node server.js e dê F5.");
