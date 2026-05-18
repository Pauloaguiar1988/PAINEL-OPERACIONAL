const fs = require('fs');
const path = require('path');

console.log("🧠 ATIVANDO INTELIGÊNCIA DE EXTRAÇÃO DE PDF - PADRÃO TAGUS-TEC");

// 1. Criar o serviço de extração real
const aiServicePdf = `const pdf = require('pdf-parse');
const fs = require('fs');

const aiService = {
    async extrairDadosOS(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const texto = data.text;

        // Regras de extração baseadas nos PDFs que você enviou
        const os = texto.match(/OS:\\s*(V\\d+)/)?.[1] || 'S/N';
        const tecnico = texto.match(/Técnico:\\s*([^\\n]+)/)?.[1]?.trim() || 'N/A';
        const cliente = texto.match(/Cliente:\\s*([^\\n]+)/)?.[1]?.trim() || 'N/A';
        const eGarantia = texto.includes('Garantia') || texto.includes('RETORNO');

        return {
            os_numero: os,
            tecnico: tecnico,
            cliente: cliente,
            descricao: texto.substring(0, 500), // Pega o início do laudo
            classificacao: eGarantia ? 'Garantia' : 'Faturável',
            probable_cause: texto.includes('Placa') ? 'Hardware' : 'Software',
            dataAnalise: new Date().toISOString()
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServicePdf);

// 2. Criar a rota de Upload e Processamento
const apiPath = 'src/routes/api.js';
let apiContent = fs.readFileSync(apiPath, 'utf8');
if (!apiContent.includes('/upload-os')) {
    apiContent = apiContent.replace("module.exports = router;", `
const aiService = require('../services/aiService');
const dataService = require('../services/dataService');

router.post('/upload-os', async (req, res) => {
    // Simula recebimento de arquivo (na versão final usaremos multer)
    const { filePath } = req.body; 
    const dados = await aiService.extrairDadosOS(filePath);
    await dataService.salvarAuditoria(dados);
    res.json({ sucesso: true, dados });
});\n\nmodule.exports = router;`);
    fs.writeFileSync(apiPath, apiContent);
}

console.log("✅ Extrator calibrado para os modelos V69113, V69125, etc.");
console.log("👉 PRÓXIMO PASSO: Vou te mandar o app.js limpo para você substituir o atual.");
