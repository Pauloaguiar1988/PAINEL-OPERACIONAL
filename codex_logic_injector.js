const fs = require('fs');
const path = require('path');

console.log("🧠 INJETANDO LÓGICA DE NEGÓCIO REAL - PADRÃO CODEX");

// 1. Motor de Decisão IA (Regras de Negócio de Campinas)
const aiServiceLogic = `const aiService = {
    analisarOS: async (dados) => {
        const desc = (dados.descricao || "").toLowerCase();
        const tecnico = dados.tecnico || "N/A";
        
        // Regra 1: Identificação de Causa Provável
        let causa = "Análise Pendente";
        if (desc.includes("configura") || desc.includes("senha")) causa = "Software/Configuração";
        if (desc.includes("quebra") || desc.includes("raio") || desc.includes("surto")) causa = "Dano Externo/Físico";
        if (desc.includes("desgaste") || desc.includes("substitu")) causa = "Manutenção Preventiva";

        // Regra 2: Classificação de Cobrança (Garantia vs Faturável)
        let classificacao = "Faturável";
        let scoreRisco = 0.5;

        if (dados.garantia === true || desc.includes("reincidência")) {
            classificacao = "Garantia";
            scoreRisco = 0.2;
        }

        if (causa === "Dano Externo/Físico") {
            classificacao = "Faturável (Dano)";
            scoreRisco = 0.9;
        }

        return {
            status: "Processado",
            tecnico,
            causaProvavel: causa,
            classificacao,
            scoreRisco,
            dataAnalise: new Date().toISOString()
        };
    }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiServiceLogic);

// 2. Persistência de Dados Real (SQL + JSON Fallback)
const dataServiceLogic = `const fs = require('fs');
const path = require('path');
const { poolPromise, mssql } = require('../config/database');

const dataService = {
    async salvarAuditoria(dados) {
        try {
            const pool = await poolPromise;
            if (pool) {
                // Injeção SQL Real
                await pool.request()
                    .input('tecnico', mssql.VarChar, dados.tecnico)
                    .input('causa', mssql.VarChar, dados.causaProvavel)
                    .input('classificacao', mssql.VarChar, dados.classificacao)
                    .input('risco', mssql.Float, dados.scoreRisco)
                    .query('INSERT INTO Operacoes (tecnico, status_ia, classificacao_cobranca, risco_score) VALUES (@tecnico, @causa, @classificacao, @risco)');
                return { status: 'SQL_SUCCESS' };
            }
            throw new Error('Sem conexão SQL');
        } catch (err) {
            // FALLBACK JSON
            const logPath = path.join(__dirname, '../../data/auditoria.json');
            fs.appendFileSync(logPath, JSON.stringify(dados) + '\\n');
            return { status: 'JSON_FALLBACK' };
        }
    }
};
module.exports = dataService;`;

fs.writeFileSync('src/services/dataService.js', dataServiceLogic);

console.log("✅ Lógica de faturamento e persistência injetada.");
console.log("🚀 O sistema agora diferencia Garantia de Faturável automaticamente.");
