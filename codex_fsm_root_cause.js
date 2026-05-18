const fs = require('fs');
const path = require('path');

console.log('CODEX: ATIVANDO DASHBOARD DE CAUSA RAIZ E TAXONOMIA...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_ROOT_CAUSE_START */';
const endMarker = '/* CODEX_FSM_ROOT_CAUSE_END */';

const causeLogic = `
${startMarker}
async function analisarCausaRaiz() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const causas = dados.reduce((acc, curr) => {
            const causa = curr.probableCause || curr.causaProvavel || 'sem_diagnostico';
            acc[causa] = (acc[causa] || 0) + 1;
            return acc;
        }, {});

        let elDash = document.getElementById('gmRootCauseChart') || document.querySelector('.card-causas');
        if (!elDash) {
            const host = document.getElementById('gmDrainAlert')
                || document.getElementById('gmContractRisk')
                || document.getElementById('gmReviewQueue')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elDash = document.createElement('div');
            elDash.id = 'gmRootCauseChart';
            elDash.className = 'system-white-card card-causas';
            host.appendChild(elDash);
        }

        elDash.innerHTML = \`
            <h3 style="color:#94a3b8; font-size:12px; text-transform:uppercase; margin-bottom:15px;">Incidencia por Causa Raiz</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                \${Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([causa, qtd]) => \`
                    <div style="background:#1e293b; padding:10px; border-radius:6px; border-top:2px solid #3b82f6;">
                        <small style="color:#60a5fa; display:block;">\${String(causa).replace(/_/g, ' ').toUpperCase()}</small>
                        <b style="font-size:18px;">\${qtd} <span style="font-size:10px; color:#94a3b8;">OS</span></b>
                    </div>
                \`).join('')}
            </div>
        \`;

        console.log('Dashboard de Causa Raiz ativo.');
    } catch (err) {
        console.error('Falha ao analisar causa raiz:', err);
    }
}

window.addEventListener('load', () => setTimeout(analisarCausaRaiz, 18000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), causeLogic.trim());
} else {
    appJs += `\n\n${causeLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo de Causa Raiz injetado. Reinicie o server.js.');
