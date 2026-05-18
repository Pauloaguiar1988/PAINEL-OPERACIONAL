const fs = require('fs');
const path = require('path');

console.log("🔍 CODEX 360: EXTRAINDO ATIVOS E SERIAIS PARA ABA CLIENTES...");

// 1. ATUALIZAR AI SERVICE COM EXTRAÇÃO DE ATIVOS
const aiService360 = `const fs = require('fs');
const PDFParse = require('pdf-parse');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await PDFParse(dataBuffer);
        const texto = data.text.replace(/\\s+/g, ' ');

        const os = filePath.match(/V\\d+/)?.[0] || 'S/N';
        const eGarantia = texto.includes('Garantia') || texto.includes('Retorno');
        
        // EXTRAÇÃO DE ATIVOS (NOVA CAMADA 360)
        const serial = texto.match(/N° de Serie:\\s*(\\d+)/)?.[1] || texto.match(/Serie:\\s*([A-Z0-9]+)/)?.[1] || 'S/N';
        const modelo = texto.match(/Equipamento:\\s*([^\\n]+)/)?.[1]?.trim().substring(0, 20) || 'Dimep/Neo';

        const deslocamento = 281.00;
        const primeiraHora = eGarantia ? 0.00 : 217.00;

        return {
            os_numero: os,
            tecnico: texto.match(/Técnico: ([^\\n]+)/)?.[1]?.trim().split(' ')[0] || 'Técnico',
            cliente: texto.match(/Cliente: ([^\\n]+)/)?.[1]?.trim().substring(0, 25) || 'Cliente',
            classificacao: eGarantia ? 'Garantia' : 'Faturável',
            valorEstimado: deslocamento + primeiraHora,
            serial: serial,
            modelo: modelo,
            dataAnalise: new Date().toISOString()
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiService360);

// 2. ATUALIZAR INTERFACE (APP.JS) PARA EXIBIR ATIVOS NA ABA CLIENTES
const appJsEvo = `
async function cockpitClientes360() {
    console.log("📡 Codex 360: Mapeando ativos por cliente...");
    try {
        const res = await fetch('/api/dashboard/tabela');
        const dados = await res.json();

        const gridCli = document.querySelector('#tabela-clientes tbody');
        if (gridCli) {
            // Agrupa por cliente para mostrar o parque tecnológico
            const clientesMap = {};
            dados.forEach(d => {
                if(!clientesMap[d.cliente]) clientesMap[d.cliente] = { total: 0, ativos: new Set() };
                clientesMap[d.cliente].total += d.valorEstimado;
                if(d.serial !== 'S/N') clientesMap[d.cliente].ativos.add(\`\${d.modelo} (\${d.serial})\`);
            });

            gridCli.innerHTML = Object.entries(clientesMap).slice(0, 15).map(([nome, info]) => \`
                <tr>
                    <td>\${nome}</td>
                    <td style="font-size: 11px; color: #94a3b8;">\${Array.from(info.ativos).join(', ') || 'Equipamento Geral'}</td>
                    <td><span class="badge success">R$ \${info.total.toFixed(2)}</span></td>
                </tr>
            \`).join('');
            console.log("✅ Aba Clientes enriquecida com Seriais e Modelos.");
        }
    } catch (e) { console.error("Erro na evolução 360:", e); }
}
window.addEventListener('load', () => setTimeout(cockpitClientes360, 6000));
`;

fs.appendFileSync('app.js', appJsEvo);

console.log("✅ Protocolo 360 aplicado. Agora a aba Clientes rastreia o Nº de Série.");
console.log("👉 REINICIE: node server.js e valide a aba Clientes.");
