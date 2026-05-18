const fs = require('fs');

console.log("⚠️  CODEX: ATIVANDO RADAR DE REINCIDÊNCIA E RETRABALHO...");

const alertLogic = `
async function monitorarRetrabalho() {
    const res = await fetch('/api/dashboard/tabela');
    const dados = await res.json();
    
    // Mapeia quantas vezes cada cliente aparece
    const contagem = dados.reduce((acc, curr) => {
        acc[curr.cliente] = (acc[curr.cliente] || 0) + 1;
        return acc;
    }, {});

    const grid = document.querySelector('#gm-main-table tbody');
    if (grid) {
        const rows = grid.querySelectorAll('tr');
        rows.forEach(row => {
            const clienteCell = row.cells[2]; // Coluna do Cliente
            if (clienteCell) {
                const nomeCli = clienteCell.innerText;
                if (contagem[nomeCli] > 3) {
                    row.style.borderLeft = "5px solid #f59e0b"; // Alerta laranja para reincidência
                    clienteCell.innerHTML += ' <small style="color:#f59e0b;">⚠️ Reincidente</small>';
                }
            }
        });
        console.log("✅ Radar de reincidência aplicado à Operação.");
    }
}
window.addEventListener('load', () => setTimeout(monitorarRetrabalho, 8000));
`;

fs.appendFileSync('app.js', alertLogic);
console.log("✅ Radar de Retrabalho injetado. Reinicie o server.js.");
