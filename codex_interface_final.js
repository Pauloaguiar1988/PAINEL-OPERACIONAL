const fs = require('fs');
const path = require('path');

console.log("🛑 OPERAÇÃO RESET: FORÇANDO SUBIDA DE TODAS AS ABAS...");

// 1. REESCREVER O APP.JS DO ZERO (SEM SOBRAS ANTERIORES)
const appJsDefinitivo = `
async function carregarPainelCCOI() {
    console.log("📡 Iniciando carga de dados oficial...");
    try {
        const res = await fetch('/api/dashboard/tabela');
        const dados = await res.json();
        
        if (!dados || dados.length === 0) {
            console.error("❌ API retornou vazio!");
            return;
        }

        // --- 1. ATUALIZAR CARDS (TOP) ---
        const totalR$ = dados.reduce((acc, curr) => acc + (curr.valorEstimado || 0), 0);
        const faturaveis = dados.filter(d => d.classificacao !== 'Garantia').length;
        
        if(document.getElementById('gmOsTotal')) document.getElementById('gmOsTotal').innerText = dados.length;
        if(document.getElementById('gmOsFaturamento')) document.getElementById('gmOsFaturamento').innerText = faturaveis;
        if(document.getElementById('gmOsRiscoEstimado')) {
            document.getElementById('gmOsRiscoEstimado').innerText = 'R$ ' + totalR$.toLocaleString('pt-BR');
        }

        // --- 2. ABA OPERAÇÃO (GRID PRINCIPAL) ---
        const gridOp = document.querySelector('#gm-main-table tbody') || document.getElementById('gmOsAuditList');
        if (gridOp) {
            gridOp.innerHTML = dados.slice(-50).reverse().map(os => \`
                <tr>
                    <td>\${os.os_numero}</td>
                    <td>\${os.tecnico}</td>
                    <td>\${os.cliente || 'Consumidor'}</td>
                    <td><span class="badge" style="background:\${os.classificacao === 'Garantia' ? '#b45309' : '#15803d'}; color:#fff; padding:3px 8px; border-radius:4px;">\${os.classificacao}</span></td>
                    <td>R$ \${(os.valorEstimado || 0).toFixed(2)}</td>
                </tr>
            \`).join('');
        }

        // --- 3. ABA TÉCNICOS (RANKING PERFORMANCE) ---
        const gridTec = document.querySelector('#tabela-tecnicos tbody');
        if (gridTec) {
            const rank = dados.reduce((acc, curr) => {
                acc[curr.tecnico] = (acc[curr.tecnico] || 0) + (curr.valorEstimado || 0);
                return acc;
            }, {});
            gridTec.innerHTML = Object.entries(rank).sort((a,b) => b[1]-a[1]).map(([tec, val]) => \`
                <tr>
                    <td>\${tec}</td>
                    <td><strong>R$ \${val.toLocaleString('pt-BR')}</strong></td>
                </tr>
            \`).join('');
        }

        // --- 4. ABA CLIENTES (ATIVOS E SERIAIS) ---
        const gridCli = document.querySelector('#tabela-clientes tbody');
        if (gridCli) {
            const clientesMap = {};
            dados.forEach(d => {
                if(!clientesMap[d.cliente]) clientesMap[d.cliente] = { count: 0, ativos: new Set() };
                clientesMap[d.cliente].count++;
                if(d.serial && d.serial !== 'S/N') clientesMap[d.cliente].ativos.add(d.modelo + " (" + d.serial + ")");
            });
            gridCli.innerHTML = Object.entries(clientesMap).slice(0, 30).map(([nome, info]) => \`
                <tr>
                    <td>\${nome}</td>
                    <td style="font-size:10px;">\${Array.from(info.ativos).join(', ') || 'Equipamento'}</td>
                    <td>\${info.count} O.S.</td>
                </tr>
            \`).join('');
        }
        
        console.log("✅ Visual atualizado com " + dados.length + " registros.");

    } catch (e) {
        console.error("❌ Erro fatal na renderização:", e);
    }
}

// Disparo imediato e limpa cache
window.addEventListener('load', () => {
    carregarPainelCCOI();
    setInterval(carregarPainelCCOI, 15000);
});
`;

fs.writeFileSync('app.js', appJsDefinitivo);
console.log("✅ app.js reescrito com mapeamento múltiplo de abas.");
console.log("👉 Reinicie o servidor agora e abra o navegador.");
