const fs = require('fs');
const path = require('path');

console.log('ATIVANDO RADAR DE DRENO DE MARGEM (LIMITE 3 VISITAS)...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_ALERTA_DRENO_START */';
const endMarker = '/* CODEX_ALERTA_DRENO_END */';

const drenoLogic = `
${startMarker}
async function detectarDrenoMargem() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const serialStats = {};
        dados.forEach(os => {
            if (os.serial && os.serial !== 'S/N') {
                if (!serialStats[os.serial]) {
                    serialStats[os.serial] = {
                        count: 0,
                        cliente: os.cliente || 'N/A',
                        tecnicos: new Set(),
                        perda: 0
                    };
                }

                serialStats[os.serial].count += 1;
                serialStats[os.serial].tecnicos.add(os.tecnico || 'N/A');

                if (os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1) {
                    serialStats[os.serial].perda += 281;
                }
            }
        });

        const criticos = Object.entries(serialStats)
            .filter(([, info]) => info.count >= 3)
            .sort((a, b) => b[1].count - a[1].count);

        let elAlert = document.getElementById('gmDrainAlert') || document.querySelector('.card-alerta-critico');
        if (!elAlert) {
            const host = document.getElementById('gmContractRisk')
                || document.getElementById('gmReviewQueue')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elAlert = document.createElement('div');
            elAlert.id = 'gmDrainAlert';
            elAlert.className = 'system-white-card card-alerta-critico';
            host.appendChild(elAlert);
        }

        if (criticos.length > 0) {
            elAlert.innerHTML = \`
                <div style="background:#450a0a; border:1px solid #ef4444; padding:10px; border-radius:8px;">
                    <h3 style="color:#fca5a5; font-size:12px; margin:0;">DRENO DE MARGEM DETECTADO</h3>
                    <p style="color:#fff; font-size:14px; margin:5px 0;">\${criticos.length} seriais com 3+ visitas.</p>
                    <small style="color:#94a3b8;">Acao: Escalonar para nivel senior imediatamente.</small>
                    <div style="margin-top:10px; max-height:160px; overflow-y:auto;">
                        \${criticos.slice(0, 8).map(([sn, info]) => \`
                            <div style="padding:6px 0; border-top:1px solid #7f1d1d;">
                                <b style="color:#fecaca;">\${sn}</b><br>
                                <small style="color:#fca5a5;">\${info.cliente} | \${info.count} visitas | Perda: R$ \${info.perda.toLocaleString('pt-BR')}</small>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;
        } else {
            elAlert.innerHTML = '<div class="system-line"><strong>Radar de Dreno</strong><span>Nenhum serial acima de 3 visitas.</span></div>';
        }

        console.log('Radar de Dreno de Margem ativo: ' + criticos.length + ' casos criticos.');
    } catch (err) {
        console.error('Falha no radar de dreno de margem:', err);
    }
}

window.addEventListener('load', () => setTimeout(detectarDrenoMargem, 17000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), drenoLogic.trim());
} else {
    appJs += `\n\n${drenoLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo de Alerta de Dreno injetado. Foco no serial 0000300262...');
