const fs = require('fs');
const path = require('path');

console.log('ATIVANDO PILLAR 7: CLIENT ENGINE & ANALISE DE RISCO CONTRATUAL...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_CLIENT_ENGINE_START */';
const endMarker = '/* CODEX_FSM_CLIENT_ENGINE_END */';

const clientEngineLogic = `
${startMarker}
async function processarClientEngine() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const clientStats = {};
        dados.forEach(os => {
            const cliente = os.cliente || 'N/A';
            if (!clientStats[cliente]) {
                clientStats[cliente] = {
                    total: 0,
                    retornos: 0,
                    faturamento: 0,
                    tecnicos: new Set()
                };
            }

            const recorrente = os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1;
            clientStats[cliente].total += 1;
            clientStats[cliente].faturamento += Number(os.valorEstimado || 0);
            clientStats[cliente].tecnicos.add(os.tecnico || 'N/A');

            if (recorrente) {
                clientStats[cliente].retornos += 1;
            }
        });

        const zonasAtrito = [];
        const riscoContratual = [];

        Object.entries(clientStats).forEach(([name, stat]) => {
            const ftf = stat.total ? ((stat.total - stat.retornos) / stat.total) * 100 : 100;
            const perdaFinanceira = stat.retornos * 281;
            const impactoMargem = stat.faturamento ? (perdaFinanceira / stat.faturamento) * 100 : 0;

            if (ftf < 60 && stat.tecnicos.size > 1) {
                zonasAtrito.push({ name, ftf, perda: perdaFinanceira, total: stat.total });
            }

            if (impactoMargem > 30) {
                riscoContratual.push({ name, impacto: impactoMargem, perda: perdaFinanceira, total: stat.total, ftf });
            }
        });

        let elRisk = document.getElementById('gmContractRisk') || document.querySelector('.card-risco-contratual');
        if (!elRisk) {
            const host = document.getElementById('gmReviewQueue')
                || document.getElementById('fsmRecommendationPanel')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elRisk = document.createElement('div');
            elRisk.id = 'gmContractRisk';
            elRisk.className = 'system-white-card card-risco-contratual';
            host.appendChild(elRisk);
        }

        const listaRisco = riscoContratual.sort((a, b) => b.perda - a.perda).slice(0, 12);

        elRisk.innerHTML = \`
            <h3 style="color:#f87171; font-size:12px; margin-bottom:10px;">RISCO CONTRATUAL DETECTADO</h3>
            <div style="max-height:220px; overflow-y:auto;">
                \${listaRisco.length ? listaRisco.map(r => \`
                    <div style="background:#450a0a; padding:8px; border-radius:4px; margin-bottom:5px; border-left:4px solid #ef4444;">
                        <b style="font-size:11px; color:#fca5a5;">\${r.name}</b><br>
                        <small style="color:#fecaca;">Impacto na Margem: \${r.impacto.toFixed(1)}% | FTF: \${r.ftf.toFixed(1)}%</small><br>
                        <small style="color:#f87171;">Perda Acumulada: R$ \${r.perda.toLocaleString('pt-BR')} em \${r.total} O.S.</small>
                    </div>
                \`).join('') : '<div class="system-line"><span>Nenhum cliente acima do limite de risco contratual.</span></div>'}
            </div>
            <div style="margin-top:10px; padding:10px; background:#1e293b; border-radius:4px;">
                <small style="color:#94a3b8;">Zonas de Atrito: \${zonasAtrito.length}</small>
            </div>
        \`;

        console.log('Client Engine: Zonas de Atrito e Risco Contratual mapeados.');
    } catch (err) {
        console.error('Falha no Client Engine:', err);
    }
}

window.addEventListener('load', () => setTimeout(processarClientEngine, 16000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), clientEngineLogic.trim());
} else {
    appJs += `\n\n${clientEngineLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo Client Engine injetado. O sistema agora detecta onde o lucro e drenado pelo cliente.');
