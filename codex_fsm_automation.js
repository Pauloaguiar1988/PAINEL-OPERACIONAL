const fs = require('fs');
const path = require('path');

console.log("🤖 ATIVANDO FASE 2: RECOMMENDATION & RECURRENCE ENGINE...");

// 1. ATUALIZAR AI SERVICE COM RECURRENCE ENGINE (PILAR 5)
const aiServiceAutomation = `const fs = require('fs');
const PDFParse = require('pdf-parse');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await PDFParse(dataBuffer);
        const texto = data.text.replace(/\\s+/g, ' ');

        const os = filePath.match(/V\\d+/)?.[0] || 'S/N';
        const serial = texto.match(/Serie:\\s*([A-Z0-9]+)/)?.[1] || texto.match(/N° de Serie:\\s*(\\d+)/)?.[1] || 'S/N';
        const causa = texto.includes('Placa') ? 'falha_hardware' : texto.includes('Rede') ? 'falha_comunicacao' : 'configuracao';
        
        // RECOMENDAÇÃO AUTOMÁTICA (IA 2 DO PLAYBOOK)
        let rec = "Manter monitoramento padrão";
        if(texto.includes('Placa Com Defeito')) rec = "Acionar Laboratório para reparo de placa";
        if(texto.includes('travamento')) rec = "Realizar Update de Firmware Preventivo";

        return {
            os_numero: os,
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'N/A',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 30) || 'CLIENTE',
            serial: serial,
            classificacao: (texto.includes('Garantia') || texto.includes('Retorno')) ? 'Garantia' : 'Faturável',
            valorEstimado: (texto.includes('Garantia') || texto.includes('Retorno')) ? 281 : 498,
            probableCause: causa,
            recommendation: rec,
            riskLevel: texto.includes('Retorno') ? 'high' : 'low',
            confidence: 90
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceAutomation);

// 2. ATUALIZAR INTERFACE COM O MÓDULO DE RECOMENDAÇÕES (PILAR 2 - IA 2)
const appJsAutomation = `
async function renderAutomation() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();

    // 1. Detectar Reincidência Real (Mesmo Serial)
    const serialCount = {};
    dados.forEach(d => { if(d.serial !== 'S/N') serialCount[d.serial] = (serialCount[d.serial] || 0) + 1; });

    const grid = document.querySelector('#gm-main-table tbody');
    if (grid) {
        grid.innerHTML = dados.reverse().map(os => {
            const isRecurrent = serialCount[os.serial] > 1;
            const rowStyle = isRecurrent ? 'background: #450a0a; border-left: 5px solid #ef4444;' : '';
            
            return \`
                <tr style="\${rowStyle}">
                    <td>\${os.os_numero}</td>
                    <td>\${os.tecnico}</td>
                    <td>\${os.cliente} <br><small style="color:#94a3b8">SN: \${os.serial}</small></td>
                    <td>
                        <span style="color:#60a5fa">\${os.recommendation}</span>
                        \${isRecurrent ? '<br><b style="color:#ef4444">⚠️ FALHA RECORRENTE NO SERIAL</b>' : ''}
                    </td>
                    <td>R$ \${os.valorEstimado.toFixed(2)}</td>
                </tr>
            \`;
        }).join('');
    }
}
window.onload = renderAutomation;
`;
fs.writeFileSync('app.js', appJsAutomation);

console.log("✅ FASE 2 INSTALADA: O sistema agora detecta reincidência por Serial.");
