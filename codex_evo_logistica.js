const fs = require('fs');
const path = require('path');

console.log("🚚 CODEX EVO: ATIVANDO INTELIGÊNCIA LOGÍSTICA E FINANCEIRA...");

// 1. Atualizar o Motor de Extração para ler KM e Horas Extras
const aiServiceEvo = `const pdf = require('pdf-parse');
const fs = require('fs');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const texto = data.text;

        const os = texto.match(/OS:\\s*(V\\d+)/)?.[1] || 'S/N';
        const km = texto.match(/KM:\\s*(\\d+)/)?.[1] || 0;
        const adicional = texto.match(/Adicionais:\\s*(\\d+min)/)?.[1] || "0";

        return {
            os_numero: os,
            tecnico: texto.match(/Técnico:\\s*([^\\n]+)/)?.[1]?.trim() || 'N/A',
            cliente: texto.match(/Cliente:\\s*([^\\n]+)/)?.[1]?.trim() || 'N/A',
            km_percorrido: parseInt(km),
            tempo_extra: adicional,
            classificacao: texto.includes('Garantia') ? 'Garantia' : 'Faturável',
            valorEstimado: (texto.includes('Garantia')) ? 0 : 217 // Baseado no seu pricing-config.json
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceEvo);

// 2. Injetar a lógica de exibição de Logística no app.js (Preservando a Sonda)
const logisticaUi = `
async function atualizarLogistica() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();
    
    const totalKm = dados.reduce((acc, curr) => acc + (curr.km_percorrido || 0), 0);
    const elKm = document.getElementById('gmOsLogistica') || document.querySelector('.card-km h1');
    
    if (elKm) {
        elKm.innerText = totalKm + " KM";
        elKm.style.color = "#60a5fa";
        console.log("✅ Bloco de Logística atualizado: " + totalKm + "km");
    }
}
window.addEventListener('load', () => setTimeout(atualizarLogistica, 3000));
`;

fs.appendFileSync('app.js', logisticaUi);

console.log("✅ Evolução enviada para o Codex.");
console.log("👉 AGORA: Reinicie o servidor e veja se o campo de KM começou a somar.");
