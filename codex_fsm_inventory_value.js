const fs = require('fs');
const path = require('path');

console.log('CODEX: CALCULANDO VALOR DE ESTOQUE EM RISCO...');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
    throw new Error('app.js nao encontrado na raiz do projeto.');
}

let appJs = fs.readFileSync(appPath, 'utf8');

const startMarker = '/* CODEX_FSM_INVENTORY_VALUE_START */';
const endMarker = '/* CODEX_FSM_INVENTORY_VALUE_END */';

const inventoryLogic = `
${startMarker}
async function analisarValorEstoque() {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();

        const pecasMap = {};
        dados.forEach(d => {
            if (Array.isArray(d.pecas)) {
                d.pecas.forEach(p => {
                    pecasMap[p] = (pecasMap[p] || 0) + 1;
                });
            }
        });

        const totalPecas = Object.values(pecasMap).reduce((a, b) => a + b, 0);
        const valorEstimadoPecas = totalPecas * 150;

        let elInv = document.getElementById('gmInventoryValue') || document.querySelector('.card-estoque-valor');
        if (!elInv) {
            const host = document.getElementById('gmPecasChart')
                || document.getElementById('fsmRecommendationPanel')
                || document.getElementById('gmPanelAuditWrap')
                || document.body;

            elInv = document.createElement('div');
            elInv.id = 'gmInventoryValue';
            elInv.className = 'system-white-card card-estoque-valor';
            host.appendChild(elInv);
        }

        elInv.innerHTML = \`
            <div style="margin-top:15px; border-left:3px solid #60a5fa; padding-left:10px;">
                <h4 style="color:#94a3b8; font-size:10px; text-transform:uppercase;">Provisionamento de Pecas</h4>
                <span style="font-size:16px; color:#fff;">R$ \${valorEstimadoPecas.toLocaleString('pt-BR')}</span>
                <br><small style="color:#60a5fa;">Base: \${totalPecas} componentes mapeados</small>
            </div>
        \`;

        console.log('Valor de estoque em risco atualizado.');
    } catch (err) {
        console.error('Falha ao calcular valor de estoque:', err);
    }
}

window.addEventListener('load', () => setTimeout(analisarValorEstoque, 13000));
${endMarker}
`;

if (appJs.includes(startMarker) && appJs.includes(endMarker)) {
    appJs = appJs.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), inventoryLogic.trim());
} else {
    appJs += `\n\n${inventoryLogic.trim()}\n`;
}

fs.writeFileSync(appPath, appJs, 'utf8');

console.log('Modulo de Provisionamento de Pecas injetado. Reinicie o server.js.');
