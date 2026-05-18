const fs = require('fs');

console.log("🔥 CODEX: ATIVANDO HEATMAP DE VOLUME POR CLIENTE...");

const heatmapLogic = `
async function atualizarHeatmap() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();
    
    // Agrupa volume de chamados por cliente
    const volume = dados.reduce((acc, curr) => {
        acc[curr.cliente] = (acc[curr.cliente] || 0) + 1;
        return acc;
    }, {});

    const topClientes = Object.entries(volume).sort((a,b) => b[1] - a[1]).slice(0, 10);

    const elCli = document.querySelector('#tabela-clientes tbody');
    if (elCli) {
        elCli.innerHTML = topClientes.map(([nome, qtd]) => {
            const cor = qtd > 5 ? '#ef4444' : '#60a5fa'; // Vermelho se tiver mais de 5 chamados
            return \`
                <tr>
                    <td>\${nome}</td>
                    <td><span style="color:\${cor}; font-weight:bold;">\${qtd} Atendimentos</span></td>
                    <td><div style="background:\${cor}; width:\${qtd * 10}px; height:8px; border-radius:4px;"></div></td>
                </tr>
            \`;
        }).join('');
        console.log("✅ Heatmap de Clientes ativo.");
    }
}
window.addEventListener('load', () => setTimeout(atualizarHeatmap, 7000));
`;

fs.appendFileSync('app.js', heatmapLogic);
console.log("✅ Inteligência de Heatmap injetada. Reinicie o server.js.");
