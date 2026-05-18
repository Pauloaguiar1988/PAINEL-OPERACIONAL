const fs = require('fs');
const path = require('path');

console.log("📊 INJETANDO MÓDULO DE BI & ANALYTICS - PADRÃO CODEX");

// 1. Criar o Analytics Service
const analyticsService = `const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../config/database');

const analyticsService = {
    async obterResumo() {
        const pool = await poolPromise;
        if (pool) {
            // Lógica SQL para BI real
            const result = await pool.request().query('SELECT classificacao_cobranca, COUNT(*) as total FROM Operacoes GROUP BY classificacao_cobranca');
            return result.recordset;
        } else {
            // Lógica para processar o JSON de Fallback
            const logPath = path.join(__dirname, '../../data/auditoria.json');
            if (!fs.existsSync(logPath)) return [];
            const linhas = fs.readFileSync(logPath, 'utf8').trim().split('\\n');
            const dados = linhas.map(l => JSON.parse(l));
            
            // Agrupar por classificação
            return dados.reduce((acc, curr) => {
                acc[curr.classificacao] = (acc[curr.classificacao] || 0) + 1;
                return acc;
            }, {});
        }
    }
};
module.exports = analyticsService;`;

fs.writeFileSync('src/services/analyticsService.js', analyticsService);

// 2. Registrar no Router
let apiRoutes = fs.readFileSync('src/routes/api.js', 'utf8');
if (!apiRoutes.includes('analyticsService')) {
    apiRoutes = "const analyticsService = require('../services/analyticsService');\n" + apiRoutes;
    apiRoutes = apiRoutes.replace('module.exports = router;', 
    `router.get('/dashboard/resumo', async (req, res) => {
    const resumo = await analyticsService.obterResumo();
    res.json(resumo);
});\n\nmodule.exports = router;`);
    fs.writeFileSync('src/routes/api.js', apiRoutes);
}

console.log("✅ BI Operacional injetado. Agora o sistema gera indicadores em tempo real.");
