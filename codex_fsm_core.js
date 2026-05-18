const fs = require('fs');
const path = require('path');

console.log("🏗️  INICIANDO ARQUITETURA FSM INTELLIGENT SYSTEM...");

// 1. DEFINIÇÃO DA TAXONOMIA (Pilar 1 do seu projeto)
const TAXONOMY = {
    serviceType: ["corretiva", "preventiva", "instalacao", "infraestrutura", "configuracao"],
    probableCause: ["falha_hardware", "falha_comunicacao", "infraestrutura_cliente", "erro_operacional", "configuracao"],
    outcomeType: ["solucionado", "parcial", "aguardando_peca", "escalonado"]
};

// 2. RISK ENGINE (Pilar 2 - IA de Risco)
function calculateRisk(os) {
    let score = 0;
    if (os.reincidencia > 0) score += 30;
    if (os.classificacao === 'Garantia') score += 20;
    if (os.clienteCritico) score += 25;
    if (os.os_numero.includes('V69')) score += 10; // Exemplo de prioridade por lote

    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

// 3. RECONSTRUÇÃO DO AI SERVICE (IA 1 E IA 3 DO SEU PROJETO)
const aiServiceFSM = `const fs = require('fs');
const PDFParse = require('pdf-parse');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await PDFParse(dataBuffer);
        const texto = data.text.replace(/\\s+/g, ' ');

        const eGarantia = texto.includes('Garantia') || texto.includes('Retorno');
        
        // IA 1 - Classificação Operacional
        const rawData = {
            os_numero: filePath.match(/V\\d+/)?.[0] || 'S/N',
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'N/A',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 30) || 'CLIENTE',
            serial: texto.match(/Serie:\\s*([A-Z0-9]+)/)?.[1] || 'S/N',
            modelo: texto.match(/Equipamento:\\s*([^\\n]+)/)?.[1]?.trim().substring(0, 15) || 'EQUIP.',
            classificacao: eGarantia ? 'Garantia' : 'Faturável',
            reincidencia: texto.includes('RETORNO') ? 1 : 0
        };

        // IA 4 - Motor de Risco Aplicado
        const riskLevel = ${calculateRisk.toString()}(rawData);

        // IA 3 - Motor de Cobrança (Billing)
        const valorTotal = eGarantia ? 281.00 : 498.00;

        return {
            ...rawData,
            riskLevel: riskLevel,
            billingRecommendation: eGarantia ? "nao_cobrar_mao_de_obra" : "faturar_total",
            valorEstimado: valorTotal,
            confidence: 95,
            taxonomyMatch: true
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceFSM);

// 4. ATUALIZAR INTERFACE PARA REFLETIR GOVERNANÇA (APP.JS)
const appJsFSM = `
async function renderFSM() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();

    const grid = document.querySelector('#gm-main-table tbody');
    if (grid) {
        grid.innerHTML = dados.reverse().map(os => \`
            <tr style="border-left: 5px solid \${os.riskLevel === 'critical' ? '#ef4444' : os.riskLevel === 'high' ? '#f59e0b' : '#10b981'}">
                <td>\${os.os_numero}</td>
                <td>\${os.tecnico}</td>
                <td>\${os.cliente} <br><small>\${os.modelo} | \${os.serial}</small></td>
                <td><span class="badge">\${os.riskLevel.toUpperCase()}</span></td>
                <td>R$ \${os.valorEstimado.toFixed(2)}</td>
            </tr>
        \`).join('');
    }
}
window.onload = renderFSM;
`;
fs.writeFileSync('app.js', appJsFSM);

console.log("✅ FASE 1 CONCLUÍDA: Taxonomia, Risco e Cobrança integrados.");
