const fs = require('fs');
const path = require('path');

console.log('ATIVANDO PILLAR 6: TECHNICIAN ENGINE & GOVERNANCA DE QUALIDADE...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_TECHNICIAN_ENGINE_START */';
const endMarker = '/* CODEX_FSM_TECHNICIAN_ENGINE_END */';

const techEngineLogic = `
${startMarker}
async function processarTechnicianEngine() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const techStats = {};
        dados.forEach(os => {
            const tecnico = os.tecnico || 'N/A';
            if (!techStats[tecnico]) {
                techStats[tecnico] = {
                    total: 0,
                    retornos: 0,
                    faturamento: 0,
                    perda: 0,
                    causas: {}
                };
            }

            const recorrente = os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1;
            techStats[tecnico].total += 1;
            techStats[tecnico].faturamento += Number(os.valorEstimado || 0);

            if (recorrente) {
                techStats[tecnico].retornos += 1;
                techStats[tecnico].perda += 281;
                const causa = os.probableCause || os.causaProvavel || 'indefinida';
                techStats[tecnico].causas[causa] = (techStats[tecnico].causas[causa] || 0) + 1;
            }
        });

        const elTec = document.querySelector('#tabela-tecnicos tbody');
        if (!elTec) return;

        elTec.innerHTML = Object.entries(techStats)
            .sort((a, b) => b[1].faturamento - a[1].faturamento)
            .map(([name, stat]) => {
                const taxaRetorno = stat.total ? (stat.retornos / stat.total) * 100 : 0;
                const ftf = 100 - taxaRetorno;
                let badge = '';
                let recomendacao = '';

                if (taxaRetorno <= 5) {
                    badge = '<span style="background:#10b981; color:white; padding:2px 5px; border-radius:3px; font-size:10px;">ELITE FTF</span>';
                    recomendacao = 'Potencial Mentor Tecnico';
                } else if (taxaRetorno > 20) {
                    const principalFalha = Object.entries(stat.causas).sort((a, b) => b[1] - a[1])[0]?.[0] || 'processo';
                    badge = '<span style="background:#ef4444; color:white; padding:2px 5px; border-radius:3px; font-size:10px;">RECICLAGEM</span>';
                    recomendacao = \`Necessita reciclagem em \${principalFalha.replace(/_/g, ' ')}\`;
                } else if (taxaRetorno > 15) {
                    badge = '<span style="background:#f59e0b; color:white; padding:2px 5px; border-radius:3px; font-size:10px;">ATENCAO</span>';
                    recomendacao = 'Revisar padrao de diagnostico e laudos';
                } else {
                    badge = '<span style="background:#3b82f6; color:white; padding:2px 5px; border-radius:3px; font-size:10px;">OPERACIONAL</span>';
                    recomendacao = 'Manter acompanhamento de laudos';
                }

                return \`
                    <tr style="border-bottom:1px solid #1e293b;">
                        <td style="padding:10px;">
                            <b>\${name}</b><br>
                            \${badge}
                        </td>
                        <td>
                            <small style="color:#94a3b8;">FTF:</small> <b>\${ftf.toFixed(1)}%</b><br>
                            <small style="color:#94a3b8;">Taxa de Retorno:</small> <b>\${taxaRetorno.toFixed(1)}%</b><br>
                            <small style="color:#60a5fa;">\${recomendacao}</small>
                        </td>
                        <td style="text-align:right;">
                            R$ \${stat.faturamento.toLocaleString('pt-BR')}<br>
                            <small style="color:#ef4444;">Perda: R$ \${stat.perda.toLocaleString('pt-BR')}</small>
                        </td>
                    </tr>
                \`;
            }).join('');

        console.log('Technician Engine: Qualidade, FTF e recomendacoes atualizadas.');
    } catch (err) {
        console.error('Falha no Technician Engine:', err);
    }
}

window.addEventListener('load', () => setTimeout(processarTechnicianEngine, 14000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), techEngineLogic.trim());
} else {
    appJs += `\n\n${techEngineLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo Technician Engine injetado. A qualidade tecnica agora e mensuravel.');
