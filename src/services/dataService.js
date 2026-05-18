const fs = require('fs');
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
            fs.appendFileSync(logPath, JSON.stringify(dados) + '\n');
            return { status: 'JSON_FALLBACK' };
        }
    }
};
module.exports = dataService;