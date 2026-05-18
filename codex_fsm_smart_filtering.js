const fs = require('fs');
const path = require('path');

console.log('CODEX: APRIMORANDO FILTRO INTELIGENTE DE AUDITORIA...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_SMART_FILTERING_START */';
const endMarker = '/* CODEX_FSM_SMART_FILTERING_END */';

const filteringLogic = `
${startMarker}
async function filtrarAuditoriaInteligente() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const techStats = {};
        dados.forEach(os => {
            const tecnico = os.tecnico || 'N/A';
            if (!techStats[tecnico]) techStats[tecnico] = { total: 0, retornos: 0 };
            techStats[tecnico].total += 1;

            if (os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1) {
                techStats[tecnico].retornos += 1;
            }
        });

        const prioridade = dados.filter(os => {
            const stat = techStats[os.tecnico || 'N/A'];
            const ftf = stat && stat.total ? ((stat.total - stat.retornos) / stat.total) * 100 : 100;
            const reviewed = os.governance && os.governance.status === 'reviewed';
            return !reviewed && ftf < 60 && (os.riskLevel === 'high' || os.riskLevel === 'critical');
        });

        const elReview = document.getElementById('gmReviewQueue') || document.querySelector('.card-review');
        if (!elReview) return;

        const oldBanner = document.getElementById('gmSmartAuditFilter');
        if (oldBanner) oldBanner.remove();

        if (prioridade.length > 0) {
            const banner = document.createElement('div');
            banner.id = 'gmSmartAuditFilter';
            banner.style.cssText = 'background:#450a0a; padding:8px; margin-bottom:10px; border-radius:4px; font-size:11px; color:#fca5a5; border:1px solid #ef4444;';
            banner.innerHTML = \`
                <strong>PRIORIDADE DE AUDITORIA</strong><br>
                \${prioridade.length} OS de tecnicos com FTF abaixo de 60% em risco alto/critico.
            \`;
            elReview.prepend(banner);
        }

        console.log('Filtro Inteligente de Auditoria atualizado: ' + prioridade.length + ' OS priorizadas.');
    } catch (err) {
        console.error('Falha no filtro inteligente de auditoria:', err);
    }
}

window.addEventListener('load', () => setTimeout(filtrarAuditoriaInteligente, 15000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), filteringLogic.trim());
} else {
    appJs += `\n\n${filteringLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Filtro Inteligente de Auditoria injetado. Foco total nos tecnicos com baixo FTF.');
