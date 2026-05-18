const express = require('express');
const fs = require('fs');
const path = require('path');
const authController = require('../controllers/authController');
const analyticsService = require('../services/analyticsService');
const aiService = require('../services/aiService');
const dataService = require('../services/dataService');
const realDataService = require('../services/realDataService');

const router = express.Router();
const AUDIT_FILE = path.join(__dirname, '../../data/auditoria.json');
const HISTORICAL_ANALYTICS_FILE = path.join(__dirname, '../../data/analytics/historical-service-analytics.json');

function readAuditStore() {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) return JSON.parse(raw);
    return raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeAuditStore(items) {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(items, null, 2), 'utf8');
}

router.get('/health', (req, res) => res.json({ status: 'Online', local: 'Campinas' }));

router.post('/ai/analisar', async (req, res) => {
    try {
        const insights = await aiService.analisarOS(req.body);
        const persistencia = await dataService.salvarAuditoria(insights);
        res.json({ ...insights, persistencia });
    } catch (err) {
        res.status(500).json({ sucesso: false, error: err.message || 'Falha ao analisar O.S.' });
    }
});

router.post('/upload-os', async (req, res) => {
    try {
        const { filePath } = req.body || {};
        if (!filePath) {
            return res.status(400).json({ sucesso: false, error: 'Informe filePath do PDF.' });
        }

        const dados = await aiService.extrairDadosOS(filePath);
        const persistencia = await dataService.salvarAuditoria(dados);
        res.json({ sucesso: true, dados, persistencia });
    } catch (err) {
        res.status(500).json({ sucesso: false, error: err.message || 'Falha ao extrair PDF.' });
    }
});

router.get('/dashboard/resumo', async (req, res) => {
    const resumo = await analyticsService.obterResumo();
    res.json(resumo);
});

router.get('/dashboard/ranking', async (req, res) => {
    const ranking = await analyticsService.obterRanking();
    res.json(ranking);
});

router.get('/dashboard/tabela', async (req, res) => {
    const dados = await analyticsService.obterTabelaCompleta();
    res.json(dados);
});

router.get('/fsm/v11-real-data', async (req, res) => {
    try {
        const wait = ['1', 'true', 'sim', 'force'].includes(String(req.query.wait || req.query.force || '').toLowerCase());
        const dados = await realDataService.obterDadosReaisCampinas({ wait });
        res.json(dados);
    } catch (err) {
        res.status(500).json({
            ok: false,
            error: err.message || 'Falha ao minerar dados reais de Campinas.'
        });
    }
});

router.get('/fsm/historical-cache', (req, res) => {
    try {
        if (!fs.existsSync(HISTORICAL_ANALYTICS_FILE)) {
            return res.json({ ok: true, rows: [], source: 'historical-cache-missing' });
        }
        const parsed = JSON.parse(fs.readFileSync(HISTORICAL_ANALYTICS_FILE, 'utf8'));
        res.json({
            ok: true,
            source: parsed.source || {},
            normalization: parsed.normalization || {},
            rows: Array.isArray(parsed.rows) ? parsed.rows : []
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message || 'Falha ao ler cache historico.' });
    }
});

router.post('/governance/audit-os', (req, res) => {
    try {
        const { os_numero, decision, justification, reviewer } = req.body || {};
        if (!os_numero || !justification) {
            return res.status(400).json({ ok: false, error: 'Informe os_numero e justification.' });
        }

        const items = readAuditStore();
        const idx = items.findIndex(item => String(item.os_numero || '') === String(os_numero));
        if (idx < 0) {
            return res.status(404).json({ ok: false, error: 'O.S. nao encontrada.' });
        }

        const entry = {
            reviewedAt: new Date().toISOString(),
            reviewer: reviewer || 'Paulo Aguiar',
            decision: decision || 'aprovado',
            justification
        };

        items[idx].governance = {
            ...(items[idx].governance || {}),
            status: 'reviewed',
            lastDecision: entry,
            history: [...(items[idx].governance?.history || []), entry]
        };
        items[idx].auditTrail = [...(items[idx].auditTrail || []), {
            type: 'governance_review',
            ...entry
        }];

        writeAuditStore(items);
        res.json({ ok: true, item: items[idx] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message || 'Falha ao registrar governanca.' });
    }
});

router.post('/login', authController.login);
router.post('/auth/login', authController.login);
router.get('/auth/me', authController.me);
router.post('/auth/logout', authController.logout);

module.exports = router;
