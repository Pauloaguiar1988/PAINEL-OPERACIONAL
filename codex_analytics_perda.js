const fs = require('fs');
const path = require('path');

console.log('CODEX: CALCULANDO IMPACTO FINANCEIRO DE REINCIDENCIA...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_ANALYTICS_PERDA_START */';
const endMarker = '/* CODEX_ANALYTICS_PERDA_END */';

const lossLogic = `
${startMarker}
async function analisarPerdaFinanceira() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const reincidentes = dados.filter(d => d.isRecurrent === true || Number(d.recurrenceCount || 0) > 1);
        const perdaTotal = reincidentes.length * 281;

        let elPerda = document.getElementById('gmOsLossMetric') || document.querySelector('.card-perda');
        if (!elPerda) {
            const host = document.getElementById('gmReviewQueue')
                || document.getElementById('fsmRecommendationPanel')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elPerda = document.createElement('div');
            elPerda.id = 'gmOsLossMetric';
            elPerda.className = 'system-white-card card-perda';
            host.appendChild(elPerda);
        }

        elPerda.innerHTML = \`
            <div style="border-top:1px solid #334155; margin-top:10px; padding-top:10px;">
                <h3 style="color:#ef4444; font-size:11px; margin:0;">PERDA POR REINCIDENCIA</h3>
                <span style="font-size:18px; font-weight:bold; color:#fca5a5;">R$ \${perdaTotal.toLocaleString('pt-BR')}</span>
                <br><small style="color:#94a3b8;">\${reincidentes.length} visitas extras realizadas</small>
            </div>
        \`;

        console.log('Analytics de Perda Operacional atualizado.');
    } catch (err) {
        console.error('Falha ao calcular perda operacional:', err);
    }
}

window.addEventListener('load', () => setTimeout(analisarPerdaFinanceira, 12000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), lossLogic.trim());
} else {
    appJs += `\n\n${lossLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo de Analytics de Perda injetado. Prepare-se para ver o impacto real no bolso.');
