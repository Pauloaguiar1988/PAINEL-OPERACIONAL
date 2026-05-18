const fs = require('fs');
const path = require('path');

console.log("📈 ATIVANDO FASE 3: PREDIÇÃO DE PEÇAS E ANALYTICS DE ESTOQUE...");

// 1. EVOLUIR AI SERVICE PARA EXTRAÇÃO DE PEÇAS (PILAR 8)
const aiServicePredictive = `const fs = require('fs');
const PDFParse = require('pdf-parse');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await PDFParse(dataBuffer);
        const texto = data.text.replace(/\\s+/g, ' ');

        // Busca códigos de peças comuns (Padrão S000 ou C000)
        const pecaDetectada = texto.match(/[SC]\\d{5,10}[A-Z]?/g) || [];
        const modelo = texto.match(/Equipamento:\\s*([^\\n]+)/)?.[1]?.trim().substring(0, 15) || 'EQUIP.';

        return {
            os_numero: filePath.match(/V\\d+/)?.[0] || 'S/N',
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'N/A',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 30) || 'CLIENTE',
            serial: texto.match(/Serie:\\s*([A-Z0-9]+)/)?.[1] || 'S/N',
            modelo: modelo,
            pecas: pecaDetectada,
            classificacao: (texto.includes('Garantia') || texto.includes('Retorno')) ? 'Garantia' : 'Faturável',
            valorEstimado: (texto.includes('Garantia')) ? 281 : 498,
            riskLevel: pecaDetectada.length > 0 ? 'high' : 'low',
            recommendation: pecaDetectada.length > 0 ? "Preparar peça para substituição" : "Checklist Padrão"
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServicePredictive);

// 2. ATUALIZAR INTERFACE COM DASHBOARD DE PEÇAS (PILAR 8)
const appJsPredictive = `
async function renderPredictive() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();

    // Contabiliza peças mais trocadas
    const pecasMap = {};
    dados.forEach(d => {
        if(d.pecas) d.pecas.forEach(p => pecasMap[p] = (pecasMap[p] || 0) + 1);
    });

    const topPecas = Object.entries(pecasMap).sort((a,b) => b[1]-a[1]).slice(0, 5);

    // Injeta no Dashboard de Governança
    const gridPecas = document.getElementById('gmPecasChart') || document.querySelector('.card-pecas');
    if (gridPecas) {
        gridPecas.innerHTML = \`
            <h3 style="color:#94a3b8; font-size:12px;">ESTOQUE CRÍTICO (TENDÊNCIA)</h3>
            \${topPecas.map(([code, qtd]) => \`
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:13px;">
                    <span>\${code}</span>
                    <b style="color:#f59e0b">\${qtd} un</b>
                </div>
            \`).join('')}
        \`;
    }
}
window.onload = renderPredictive;
`;
fs.writeFileSync('app.js', appJsPredictive);

console.log("✅ FASE 3 INTEGRADA: O sistema agora mapeia peças e prevê estoque crítico.");
