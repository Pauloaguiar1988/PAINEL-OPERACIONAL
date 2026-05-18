const fs = require('fs');
const path = require('path');

console.log('CODEX: ATIVANDO METRICA DE SAUDE DE GOVERNANCA...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_HEALTH_GOVERNANCE_START */';
const endMarker = '/* CODEX_HEALTH_GOVERNANCE_END */';

const healthLogic = `
${startMarker}
async function monitorarSaudeGovernanca() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const criticos = dados.filter(d => d.riskLevel === 'critical').length;
        const auditados = dados.filter(d => {
            return d.auditStatus === 'reviewed' || (d.governance && d.governance.status === 'reviewed');
        }).length;
        const saude = criticos > 0 ? Math.round((Math.min(auditados, criticos) / criticos) * 100) : 100;

        const elHealth = document.getElementById('gmOsAlertRecords') || document.querySelector('.card-saude');
        if (elHealth) {
            elHealth.innerHTML = \`
                <div style="text-align:center;">
                    <h2 style="color:\${saude < 50 ? '#ef4444' : '#10b981'};">\${saude}%</h2>
                    <small style="color:#94a3b8;">SAUDE DA GOVERNANCA</small>
                </div>
            \`;
            console.log('Indice de Saude de Governanca atualizado: ' + saude + '%');
        }
    } catch (err) {
        console.error('Falha ao monitorar saude de governanca:', err);
    }
}

window.addEventListener('load', () => setTimeout(monitorarSaudeGovernanca, 11000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), healthLogic.trim());
} else {
    appJs += `\n\n${healthLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo de Saude de Governanca injetado. Reinicie o server.js.');
