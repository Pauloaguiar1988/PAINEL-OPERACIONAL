const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../config/database');

function readFallbackAudit() {
    const logPath = path.join(__dirname, '../../data/auditoria.json');
    if (!fs.existsSync(logPath)) return [];

    const raw = fs.readFileSync(logPath, 'utf8').trim();
    if (!raw) return [];

    if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }

    return raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

const analyticsService = {
    async obterTabelaCompleta() {
        const pool = await poolPromise;
        if (pool) {
            const result = await pool.request().query(
                'SELECT id, data_registro, tecnico, os_numero, status_ia, classificacao_cobranca, risco_score FROM Operacoes ORDER BY data_registro DESC'
            );

            return result.recordset.map(item => ({
                id: item.id,
                dataAnalise: item.data_registro,
                tecnico: item.tecnico || 'N/A',
                os_numero: item.os_numero || 'S/N',
                causaProvavel: item.status_ia || 'Nao informado',
                classificacao: item.classificacao_cobranca || 'Sem classificacao',
                scoreRisco: Number(item.risco_score || 0)
            }));
        }

        return readFallbackAudit();
    },

    async obterResumo() {
        const dados = await this.obterTabelaCompleta();
        return dados.reduce((acc, curr) => {
            const classificacao = curr.classificacao || 'Sem classificacao';
            acc[classificacao] = (acc[classificacao] || 0) + 1;
            return acc;
        }, {});
    },

    async obterRanking() {
        const dados = await this.obterTabelaCompleta();
        const porTecnico = dados.reduce((acc, curr) => {
            const tecnico = curr.tecnico || 'N/A';
            if (!acc[tecnico]) acc[tecnico] = { tecnico, total: 0, riscoTotal: 0 };
            acc[tecnico].total += 1;
            acc[tecnico].riscoTotal += Number(curr.scoreRisco || 0);
            return acc;
        }, {});

        return Object.values(porTecnico)
            .map(item => ({
                tecnico: item.tecnico,
                total: item.total,
                riscoMedio: item.total ? Number((item.riscoTotal / item.total).toFixed(2)) : 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
    }
};

module.exports = analyticsService;
