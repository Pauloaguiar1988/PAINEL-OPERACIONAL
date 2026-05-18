const fs = require('fs');
const path = require('path');

console.log('ATIVANDO FASE 4: GOVERNANCA DE IA E FILA DE REVISAO...');

const appPath = path.join(__dirname, 'app.js');
const routesPath = path.join(__dirname, 'src', 'routes', 'api.js');
const auditPath = path.join(__dirname, 'data', 'auditoria.json');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

if (!fs.existsSync(routesPath)) {
    throw new Error('src/routes/api.js nao encontrado.');
}

const appJs = fs.readFileSync(appPath, 'utf8');
const apiRoutes = fs.readFileSync(routesPath, 'utf8');

if (!apiRoutes.includes('/governance/audit-os')) {
    throw new Error('Rota /api/governance/audit-os nao encontrada. Aplique a rota antes de usar a fila de revisao.');
}

if (!appJs.includes('window.auditarOS = async') || !appJs.includes('/api/governance/audit-os')) {
    throw new Error('app.js ainda nao possui auditoria persistente. Reaplique o app.js consolidado de governanca.');
}

const raw = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').trim() : '[]';
const dados = raw ? (raw.startsWith('[') ? JSON.parse(raw) : raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))) : [];
const fila = dados.filter(item => {
    const reviewed = item.governance && item.governance.status === 'reviewed';
    return !reviewed && (item.riskLevel === 'critical' || Number(item.confidence || 0) < 85);
});

console.log(`Registros carregados: ${dados.length}`);
console.log(`Fila de revisao IA: ${fila.length}`);
console.log('Governanca validada: UI + rota backend + auditoria.json prontos.');
