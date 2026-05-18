const fs = require('fs');
const path = require('path');

console.log('CODEX: ATIVANDO COPILOTO DE PRE-DIAGNOSTICO PREDITIVO...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_COPILOT_PRE_DIAG_START */';
const endMarker = '/* CODEX_FSM_COPILOT_PRE_DIAG_END */';

const copilotLogic = `
${startMarker}
async function ativarCopilotoPreditivo() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const criticosRede = dados.filter(d => {
            const causa = d.probableCause || d.causaProvavel;
            return causa === 'falha_comunicacao' && (d.riskLevel === 'critical' || d.riskLevel === 'high');
        });

        let elCopilot = document.getElementById('gmCopilotAdvice') || document.querySelector('.card-copiloto');
        if (!elCopilot) {
            const host = document.getElementById('gmRootCauseChart')
                || document.getElementById('gmDrainAlert')
                || document.getElementById('gmContractRisk')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elCopilot = document.createElement('div');
            elCopilot.id = 'gmCopilotAdvice';
            elCopilot.className = 'system-white-card card-copiloto';
            host.appendChild(elCopilot);
        }

        if (criticosRede.length > 0) {
            elCopilot.innerHTML = \`
                <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border:1px solid #3b82f6; padding:15px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <h3 style="color:#60a5fa; font-size:12px; margin:0;">COPILOTO ESTRATEGICO IA</h3>
                    <p style="color:#e2e8f0; font-size:13px; margin:10px 0;">
                        Detectados <b>\${criticosRede.length}</b> chamados de comunicacao/rede com risco alto ou critico.
                    </p>
                    <div style="background:#172554; padding:8px; border-radius:5px; border-left:4px solid #3b82f6;">
                        <small style="color:#93c5fd; font-weight:bold;">RECOMENDACAO OPERACIONAL:</small><br>
                        <small style="color:#d1d5db;">NAO ENVIAR TECNICO antes de validar reboot de rede, IP, gateway, DNS, VPN/firewall e comunicacao externa com o TI do cliente.</small>
                    </div>
                    <div style="margin-top:10px; max-height:130px; overflow-y:auto;">
                        \${criticosRede.slice(0, 8).map(os => \`
                            <div style="padding:6px 0; border-top:1px solid #1e40af;">
                                <small style="color:#bfdbfe;"><b>\${os.os_numero || 'S/N'}</b> | \${os.cliente || 'Cliente'} | \${String(os.riskLevel || '').toUpperCase()}</small>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;
        } else {
            elCopilot.innerHTML = '<div class="system-line"><strong>Copiloto Preditivo</strong><span>Nenhum chamado critico de comunicacao neste momento.</span></div>';
        }

        console.log('Copiloto Preditivo ativo: analisando gargalos de rede.');
    } catch (err) {
        console.error('Falha no copiloto preditivo:', err);
    }
}

window.addEventListener('load', () => setTimeout(ativarCopilotoPreditivo, 19000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), copilotLogic.trim());
} else {
    appJs += `\n\n${copilotLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Inteligencia Preditiva injetada. O sistema agora pensa antes de gastar deslocamento.');
